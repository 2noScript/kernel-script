import { useEffect, useCallback, useRef } from 'react';
import type { Task, TaskConfig } from '@/core/task';
import { type QueueStatus } from '@/core/queue-manager';
import { QUEUE_COMMAND } from '@/core/commands';

interface Funcs {
  getTasks: () => Task[];
  setTasks: (tasks: Task[]) => void;
  setPendingCount: (count: number) => void;
  setIsPaused: (paused: boolean) => void;
  getIsPaused: () => boolean;
  updateTask: (taskId: string, updates: Partial<Task>) => void;
  deleteTasks: (taskIds: string[]) => void;
  updateTasks: (updates: Record<string, Partial<Task>>) => void;
  addHistoryTask?: (task: Task) => void;
  getTaskConfig: () => TaskConfig;
}

export interface QueueHookConfig {
  keycard: string;
  getIdentifier: () => string | undefined;
  funcs: Funcs;
}

export function useQueue(config: QueueHookConfig) {
  return function initQueue() {
    const { keycard, getIdentifier, funcs } = config;

    const safeSendMessage = useCallback((msg: any, callback?: (resp: any) => void) => {
      try {
        if (!chrome.runtime?.id) {
          console.warn('Extension context invalidated.');
          return;
        }
        chrome.runtime.sendMessage(msg, (response) => {
          if (chrome.runtime.lastError) {
            console.warn('Message failed:', chrome.runtime.lastError.message);
            return;
          }
          callback?.(response);
        });
      } catch (e) {
        console.error('Critical messaging error:', e);
      }
    }, []);

    const lastInitializedRef = useRef<string | undefined>(undefined);
    const identifier = getIdentifier();

    useEffect(() => {
      const currentId = identifier || '';
      const needsSync = lastInitializedRef.current !== currentId;

      if (needsSync) {
        lastInitializedRef.current = currentId;
        // Perform initial SYNC with background
        safeSendMessage(
          {
            type: 'QUEUE_COMMAND',
            command: QUEUE_COMMAND.SYNC,
            keycard,
            identifier,
          },
          (response: { tasks?: Task[]; status?: QueueStatus }) => {
            if (response) {
              if (response.tasks && response.tasks.length > 0) {
                funcs.setTasks(response.tasks);
              } else {
                const localTasks = funcs.getTasks();
                if (localTasks.length > 0) {
                  safeSendMessage({
                    type: 'QUEUE_COMMAND',
                    command: QUEUE_COMMAND.ADD_MANY,
                    keycard,
                    identifier,
                    payload: { tasks: localTasks },
                  });
                }
              }

              if (response.status) {
                funcs.setPendingCount(response.status.size + response.status.pending);
                funcs.setIsPaused(response.status.isPaused);
              }
            }
          }
        );
      }

      const handleMessage = (message: any) => {
        if (message.type === 'QUEUE_EVENT') {
          const { event, keycard: pid, identifier: pjid, data } = message;

          // Robust check: handle null, undefined, empty string as equivalent for identifiers
          const isPlatformMatch = pid === keycard || pid === '*';
          const isIdentifierMatch = (pjid || '') === (identifier || '') || pid === '*';

          if (!isPlatformMatch || !isIdentifierMatch) return;

          switch (event) {
            case 'TASKS_UPDATED': {
              console.log('TASKS_UPDATED', data);
              const updates: Record<string, Partial<Task>> = {};
              data.tasks.forEach((t: Task) => {
                updates[t.id] = t;
              });
              funcs.updateTasks(updates);
              funcs.setPendingCount(data.status.size + data.status.pending);
              funcs.setIsPaused(data.status.isPaused);
              break;
            }
            case 'PENDING_COUNT_CHANGED':
              funcs.setPendingCount(data.count);
              break;
            case 'HISTORY_ADDED':
              if (funcs.addHistoryTask) {
                funcs.addHistoryTask(data.task);
              }
              break;
          }
        }
      };

      chrome.runtime.onMessage.addListener(handleMessage);
      return () => {
        chrome.runtime.onMessage.removeListener(handleMessage);
      };
    }, [keycard, identifier, funcs, safeSendMessage]);

    const sendQueueCommand = useCallback(
      async (command: string, payload?: any) => {
        const identifier = getIdentifier();
        return new Promise((resolve) => {
          safeSendMessage(
            {
              type: 'QUEUE_COMMAND',
              command,
              keycard,
              identifier,
              payload,
            },
            resolve
          );
        });
      },
      [keycard, getIdentifier, safeSendMessage]
    );

    const addTask = useCallback(
      async (task: Task) => {
        return sendQueueCommand(QUEUE_COMMAND.ADD, { task: task });
      },
      [sendQueueCommand, funcs]
    );

    const start = useCallback(async () => {
      console.log(QUEUE_COMMAND.START);
      return sendQueueCommand(QUEUE_COMMAND.START);
    }, [sendQueueCommand, funcs]);

    const stop = useCallback(async () => {
      console.log(QUEUE_COMMAND.STOP);
      return sendQueueCommand(QUEUE_COMMAND.STOP);
    }, [sendQueueCommand, funcs]);

    const pause = useCallback(async () => {
      return sendQueueCommand(QUEUE_COMMAND.PAUSE);
    }, [sendQueueCommand]);

    const resume = useCallback(async () => {
      return sendQueueCommand(QUEUE_COMMAND.RESUME);
    }, [sendQueueCommand]);

    const clear = useCallback(async () => {
      return sendQueueCommand(QUEUE_COMMAND.CLEAR);
    }, [sendQueueCommand]);

    const getStatus = useCallback(async () => {
      return sendQueueCommand(QUEUE_COMMAND.GET_STATUS);
    }, [sendQueueCommand]);

    const getTasks = useCallback(async () => {
      return sendQueueCommand(QUEUE_COMMAND.GET_TASKS);
    }, [sendQueueCommand]);

    const cancelTask = useCallback(
      async (taskId: string) => {
        return sendQueueCommand(QUEUE_COMMAND.CANCEL_TASK, { taskId });
      },
      [sendQueueCommand]
    );

    const cancelTasks = useCallback(
      async (taskIds: string[]) => {
        return sendQueueCommand(QUEUE_COMMAND.CANCEL_TASKS, { taskIds });
      },
      [sendQueueCommand]
    );

    const setTaskConfig = useCallback((taskConfig: TaskConfig) => {
      return sendQueueCommand(QUEUE_COMMAND.SET_TASK_CONFIG, { taskConfig });
    }, []);

    // --- HIGH LEVEL ACTIONS ---

    const publishTasks = useCallback(
      async (tasks: Task[]) => {
        await sendQueueCommand(QUEUE_COMMAND.ADD_MANY, {
          tasks: tasks.map((t) => ({
            ...t,
            status: 'Waiting',
            isQueued: true,
          })),
        });
      },
      [funcs, sendQueueCommand]
    );

    const deleteTasks = useCallback(
      async (taskIds: string[]) => {
        if (taskIds.length === 0) return;

        // 1. Cancel in background
        await sendQueueCommand(QUEUE_COMMAND.CANCEL_TASKS, { taskIds });

        // 2. Delete from store
        funcs.deleteTasks(taskIds);
      },
      [funcs, sendQueueCommand]
    );

    const skipTaskIds = useCallback(
      async (taskIds: string[]) => {
        if (taskIds.length === 0) return;

        // 1. Cancel in background if they are currently active
        await sendQueueCommand('CANCEL_TASKS', { taskIds });

        // 2. Update store
        const updates: Record<string, Partial<Task>> = {};
        taskIds.forEach((id) => {
          updates[id] = { status: 'Skipped', isQueued: false, isFlagged: true };
        });
        funcs.updateTasks(updates);
      },
      [funcs, sendQueueCommand]
    );

    const retryTasks = useCallback(
      async (taskIds: string[]) => {
        const tasks = funcs.getTasks().filter((t) => taskIds.includes(t.id));
        if (tasks.length === 0) return;

        // 1. Reset tasks in store
        tasks.forEach((task) => {
          funcs.updateTask(task.id, {
            status: 'Waiting',
            errorMessage: undefined,
            isQueued: true,
          });
        });

        // 2. Re-add to background
        await sendQueueCommand(QUEUE_COMMAND.ADD_MANY, {
          tasks: tasks.map((t) => ({
            ...t,
            status: 'Waiting',
            errorMessage: undefined,
            isQueued: true,
          })),
        });
      },
      [funcs, sendQueueCommand]
    );

    return {
      addTask,
      start,
      stop,
      pause,
      resume,
      clear,
      getStatus,
      getTasks,
      cancelTask,
      cancelTasks,
      publishTasks,
      deleteTasks,
      retryTasks,
      skipTaskIds,
      setTaskConfig,
    };
  };
}
