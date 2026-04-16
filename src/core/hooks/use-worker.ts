import { useEffect, useCallback, useRef } from 'react';
import type { Task, TaskConfig } from '@/core/types';
import { type QueueStatus } from '@/core/managers/queue.manager';
import { QUEUE_COMMAND } from '@/core/commands';

export interface WorkerMethods {
  addTask: (task: Task) => Promise<any>;
  start: () => Promise<any>;
  stop: () => Promise<any>;
  pause: () => Promise<any>;
  resume: () => Promise<any>;
  clear: () => Promise<any>;
  getStatus: () => Promise<any>;
  getTasks: () => Promise<any>;
  cancelTask: (taskId: string) => Promise<any>;
  cancelTasks: (taskIds: string[]) => Promise<any>;
  publishTasks: (tasks: Task[]) => Promise<any>;
  deleteTasks: (taskIds: string[]) => Promise<any>;
  retryTasks: (taskIds: string[]) => Promise<any>;
  skipTaskIds: (taskIds: string[]) => Promise<any>;
  setTaskConfig: (taskConfig: TaskConfig) => Promise<any>;
}

interface Funcs {
  getTasks: () => Task[];
  setTasks: (tasks: Task[]) => void;
  setPendingCount: (count: number) => void;
  setIsRunning: (running: boolean) => void;
  getIsRunning: () => boolean;
  updateTask: (taskId: string, updates: Partial<Task>) => void;
  deleteTasks: (taskIds: string[]) => void;
  updateTasks: (updates: Record<string, Partial<Task>>) => void;
  addHistoryTask?: (task: Task) => void;
  getTaskConfig: () => TaskConfig;
}

export interface WorkerConfig {
  keycard: string;
  getIdentifier: () => string | undefined;
  funcs: Funcs;
  debug?: boolean;
}

export function useWorker(config: WorkerConfig) {
  return function initWorker() {
    const { keycard, getIdentifier, funcs, debug = false } = config;

    const debugLog = (...args: unknown[]) => {
      if (debug) console.log(...args);
    };

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
        debugLog(`[HOOK] SYNC: Initial sync for ${keycard}/${identifier}`);
        safeSendMessage(
          {
            type: 'QUEUE_COMMAND',
            command: QUEUE_COMMAND.SYNC,
            keycard,
            identifier,
          },
          (response: { tasks?: Task[]; status?: QueueStatus }) => {
            if (response) {
              debugLog(
                `[HOOK] SYNC: Response for ${keycard}/${identifier}: ${response.tasks?.length || 0} tasks`
              );
              if (response.tasks && response.tasks.length > 0) {
                funcs.setTasks(response.tasks);
              } else {
                const localTasks = funcs.getTasks();
                if (localTasks.length > 0) {
                  debugLog(
                    `[HOOK] SYNC: No tasks in background, syncing ${localTasks.length} local tasks`
                  );
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
                funcs.setIsRunning(response.status.isRunning);
              }
            }
          }
        );
      }

      const handleMessage = (message: any) => {
        if (message.type === 'QUEUE_EVENT') {
          const { event, keycard: pid, identifier: pjid, data } = message;

          const isPlatformMatch = pid === keycard || pid === '*';
          const isIdentifierMatch = (pjid || '') === (identifier || '') || pid === '*';

          if (!isPlatformMatch || !isIdentifierMatch) return;

          switch (event) {
            case 'TASKS_UPDATED': {
              debugLog(
                `[HOOK] EVENT: TASKS_UPDATED for ${keycard}/${identifier}, count: ${data.tasks?.length || 0}`
              );
              const updates: Record<string, Partial<Task>> = {};
              data.tasks.forEach((t: Task) => {
                updates[t.id] = t;
              });
              funcs.updateTasks(updates);
              funcs.setPendingCount(data.status.size + data.status.pending);
              funcs.setIsRunning(data.status.isRunning);
              break;
            }
            case 'PENDING_COUNT_CHANGED':
              debugLog(
                `[HOOK] EVENT: PENDING_COUNT_CHANGED for ${keycard}/${identifier}: ${data.count}`
              );
              funcs.setPendingCount(data.count);
              break;
            case 'HISTORY_ADDED':
              debugLog(`[HOOK] EVENT: HISTORY_ADDED for ${keycard}/${identifier}`);
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
        debugLog(
          `[HOOK] ADD_TASK ${task.id} (${task.name || 'unnamed'}) to ${keycard}/${getIdentifier()}`
        );
        return sendQueueCommand(QUEUE_COMMAND.ADD, { task: task });
      },
      [sendQueueCommand, funcs, debugLog]
    );

    const start = useCallback(async () => {
      debugLog(`[HOOK] START queue ${keycard}/${getIdentifier()}`);
      return sendQueueCommand(QUEUE_COMMAND.START);
    }, [sendQueueCommand, funcs, debugLog]);

    const stop = useCallback(async () => {
      debugLog(`[HOOK] STOP queue ${keycard}/${getIdentifier()}`);
      return sendQueueCommand(QUEUE_COMMAND.STOP);
    }, [sendQueueCommand, funcs, debugLog]);

    const pause = useCallback(async () => {
      debugLog(`[HOOK] PAUSE queue ${keycard}/${getIdentifier()}`);
      return sendQueueCommand(QUEUE_COMMAND.PAUSE);
    }, [sendQueueCommand, debugLog]);

    const resume = useCallback(async () => {
      debugLog(`[HOOK] RESUME queue ${keycard}/${getIdentifier()}`);
      return sendQueueCommand(QUEUE_COMMAND.RESUME);
    }, [sendQueueCommand, debugLog]);

    const clear = useCallback(async () => {
      debugLog(`[HOOK] CLEAR queue ${keycard}/${getIdentifier()}`);
      return sendQueueCommand(QUEUE_COMMAND.CLEAR);
    }, [sendQueueCommand, debugLog]);

    const getStatus = useCallback(async () => {
      debugLog(`[HOOK] GET_STATUS from ${keycard}/${getIdentifier()}`);
      return sendQueueCommand(QUEUE_COMMAND.GET_STATUS);
    }, [sendQueueCommand, debugLog]);

    const getTasks = useCallback(async () => {
      debugLog(`[HOOK] GET_TASKS from ${keycard}/${getIdentifier()}`);
      return sendQueueCommand(QUEUE_COMMAND.GET_TASKS);
    }, [sendQueueCommand, debugLog]);

    const cancelTask = useCallback(
      async (taskId: string) => {
        debugLog(`[HOOK] CANCEL_TASK ${taskId} from ${keycard}/${getIdentifier()}`);
        return sendQueueCommand(QUEUE_COMMAND.CANCEL_TASK, { taskId });
      },
      [sendQueueCommand, debugLog]
    );

    const cancelTasks = useCallback(
      async (taskIds: string[]) => {
        debugLog(`[HOOK] CANCEL_TASKS ${taskIds.length} tasks from ${keycard}/${getIdentifier()}`);
        return sendQueueCommand(QUEUE_COMMAND.CANCEL_TASKS, { taskIds });
      },
      [sendQueueCommand, debugLog]
    );

    const setTaskConfig = useCallback(
      (taskConfig: TaskConfig) => {
        debugLog(`[HOOK] SET_TASK_CONFIG for ${keycard}/${getIdentifier()}:`, taskConfig);
        return sendQueueCommand(QUEUE_COMMAND.SET_TASK_CONFIG, { taskConfig });
      },
      [sendQueueCommand, debugLog]
    );

    const publishTasks = useCallback(
      async (tasks: Task[]) => {
        debugLog(`[HOOK] PUBLISH_TASKS ${tasks.length} tasks to ${keycard}/${getIdentifier()}`);
        await sendQueueCommand(QUEUE_COMMAND.ADD_MANY, {
          tasks: tasks.map((t) => ({
            ...t,
            status: 'Waiting',
            isQueued: true,
          })),
        });
      },
      [funcs, sendQueueCommand, debugLog]
    );

    const deleteTasks = useCallback(
      async (taskIds: string[]) => {
        if (taskIds.length === 0) return;
        debugLog(`[HOOK] DELETE_TASKS ${taskIds.length} tasks from ${keycard}/${getIdentifier()}`);

        await sendQueueCommand(QUEUE_COMMAND.CANCEL_TASKS, { taskIds });

        funcs.deleteTasks(taskIds);
      },
      [funcs, sendQueueCommand, debugLog]
    );

    const skipTaskIds = useCallback(
      async (taskIds: string[]) => {
        if (taskIds.length === 0) return;
        debugLog(`[HOOK] SKIP_TASKS ${taskIds.length} tasks in ${keycard}/${getIdentifier()}`);

        await sendQueueCommand('CANCEL_TASKS', { taskIds });

        const updates: Record<string, Partial<Task>> = {};
        taskIds.forEach((id) => {
          updates[id] = { status: 'Skipped', isQueued: false };
        });
        funcs.updateTasks(updates);
      },
      [funcs, sendQueueCommand, debugLog]
    );

    const retryTasks = useCallback(
      async (taskIds: string[]) => {
        const tasks = funcs.getTasks().filter((t) => taskIds.includes(t.id));
        if (tasks.length === 0) return;
        debugLog(`[HOOK] RETRY_TASKS ${taskIds.length} tasks in ${keycard}/${getIdentifier()}`);

        tasks.forEach((task) => {
          funcs.updateTask(task.id, {
            status: 'Waiting',
            errorMessage: undefined,
            isQueued: true,
          });
        });

        await sendQueueCommand(QUEUE_COMMAND.ADD_MANY, {
          tasks: tasks.map((t) => ({
            ...t,
            status: 'Waiting',
            errorMessage: undefined,
            isQueued: true,
          })),
        });
      },
      [funcs, sendQueueCommand, debugLog]
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
    } as WorkerMethods;
  };
}
