import { useEffect, useCallback, useRef } from 'react';
import type { BaseEngine, Task, TaskInput, TaskConfig, EngineResult } from '@/core/types';
import { type QueueStatus } from '@/core/managers/queue.manager';
import { QUEUE_COMMAND, DIRECT_COMMAND } from '@/core/commands';


export interface WorkerMethods {
  addTask: (task: TaskInput) => Promise<any>;
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
  directStart: (task: Task) => Promise<EngineResult>;
  directStop: (taskId: string) => Promise<any>;
  directCheckRunning: (taskId: string) => Promise<any>;
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
  engine: BaseEngine;
  identifier: string;
  funcs: Funcs;
  debug?: boolean;
}

export function useWorker(config: WorkerConfig) {
  return function initWorker() {
    const { engine, identifier, funcs, debug = false } = config;
    const keycard = engine.keycard;

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

    useEffect(() => {
      const needsSync = lastInitializedRef.current !== identifier;

      if (needsSync) {
        lastInitializedRef.current = identifier;
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

        if (message.type === 'DIRECT_EVENT') {
          const { event, keycard: pid, identifier: pjid, data } = message;

          const isPlatformMatch = pid === keycard || pid === '*';
          const isIdentifierMatch = (pjid || '') === (identifier || '') || pid === '*';

          if (!isPlatformMatch || !isIdentifierMatch) return;

          switch (event) {
            case 'TASK_UPDATED': {
              debugLog(`[HOOK] EVENT: TASK_UPDATED for ${keycard}/${identifier}: ${data.task?.id}`);
              funcs.updateTask(data.task.id, data.task);
              break;
            }
            case 'TASK_COMPLETED': {
              debugLog(`[HOOK] EVENT: TASK_COMPLETED for ${keycard}/${identifier}: ${data.taskId}`);
              break;
            }
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
      [keycard, identifier, safeSendMessage]
    );

    const addTask = useCallback(
      async (task: TaskInput) => {
        debugLog(`[HOOK] ADD_TASK ${task.name || 'unnamed'} to ${keycard}/${identifier}`);
        return sendQueueCommand(QUEUE_COMMAND.ADD, { task: task });
      },
      [sendQueueCommand, funcs, debugLog]
    );

    const start = useCallback(async () => {
      debugLog(`[HOOK] START queue ${keycard}/${identifier}`);
      return sendQueueCommand(QUEUE_COMMAND.START);
    }, [sendQueueCommand, funcs, debugLog]);

    const stop = useCallback(async () => {
      debugLog(`[HOOK] STOP queue ${keycard}/${identifier}`);
      return sendQueueCommand(QUEUE_COMMAND.STOP);
    }, [sendQueueCommand, funcs, debugLog]);


    const resume = useCallback(async () => {
      debugLog(`[HOOK] RESUME queue ${keycard}/${identifier}`);
      return sendQueueCommand(QUEUE_COMMAND.RESUME);
    }, [sendQueueCommand, debugLog]);

    const clear = useCallback(async () => {
      debugLog(`[HOOK] CLEAR queue ${keycard}/${identifier}`);
      return sendQueueCommand(QUEUE_COMMAND.CLEAR);
    }, [sendQueueCommand, debugLog]);

    const getStatus = useCallback(async () => {
      debugLog(`[HOOK] GET_STATUS from ${keycard}/${identifier}`);
      return sendQueueCommand(QUEUE_COMMAND.GET_STATUS);
    }, [sendQueueCommand, debugLog]);

    const getTasks = useCallback(async () => {
      debugLog(`[HOOK] GET_TASKS from ${keycard}/${identifier}`);
      return sendQueueCommand(QUEUE_COMMAND.GET_TASKS);
    }, [sendQueueCommand, debugLog]);

    const cancelTask = useCallback(
      async (taskId: string) => {
        debugLog(`[HOOK] CANCEL_TASK ${taskId} from ${keycard}/${identifier}`);
        return sendQueueCommand(QUEUE_COMMAND.CANCEL_TASK, { taskId });
      },
      [sendQueueCommand, debugLog]
    );

    const cancelTasks = useCallback(
      async (taskIds: string[]) => {
        debugLog(`[HOOK] CANCEL_TASKS ${taskIds.length} tasks from ${keycard}/${identifier}`);
        return sendQueueCommand(QUEUE_COMMAND.CANCEL_TASKS, { taskIds });
      },
      [sendQueueCommand, debugLog]
    );

    const setTaskConfig = useCallback(
      (taskConfig: TaskConfig) => {
        debugLog(`[HOOK] SET_TASK_CONFIG for ${keycard}/${identifier}:`, taskConfig);
        return sendQueueCommand(QUEUE_COMMAND.SET_TASK_CONFIG, { taskConfig });
      },
      [sendQueueCommand, debugLog]
    );

    const publishTasks = useCallback(
      async (tasks: Task[]) => {
        debugLog(`[HOOK] PUBLISH_TASKS ${tasks.length} tasks to ${keycard}/${identifier}`);
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
        debugLog(`[HOOK] DELETE_TASKS ${taskIds.length} tasks from ${keycard}/${identifier}`);

        await sendQueueCommand(QUEUE_COMMAND.CANCEL_TASKS, { taskIds });

        funcs.deleteTasks(taskIds);
      },
      [funcs, sendQueueCommand, debugLog]
    );

    const skipTaskIds = useCallback(
      async (taskIds: string[]) => {
        if (taskIds.length === 0) return;
        debugLog(`[HOOK] SKIP_TASKS ${taskIds.length} tasks in ${keycard}/${identifier}`);

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
        debugLog(`[HOOK] RETRY_TASKS ${taskIds.length} tasks in ${keycard}/${identifier}`);

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

    const sendDirectCommand = useCallback(
      async (command: string, payload?: any) => {
        return new Promise((resolve) => {
          safeSendMessage(
            {
              type: 'DIRECT_COMMAND',
              command,
              keycard,
              identifier,
              payload,
            },
            resolve
          );
        });
      },
      [keycard, identifier, safeSendMessage]
    );

    const directStart = useCallback(
      async (task: Task) => {
        debugLog(
          `[HOOK] DIRECT_START ${task.id} (${task.name || 'unnamed'}) on ${keycard}/${identifier}`
        );
        return sendDirectCommand(DIRECT_COMMAND.START, { task });
      },
      [sendDirectCommand, debugLog]
    );

    const directStop = useCallback(
      async (taskId: string) => {
        debugLog(`[HOOK] DIRECT_STOP ${taskId} on ${keycard}/${identifier}`);
        return sendDirectCommand(DIRECT_COMMAND.STOP, { taskId });
      },
      [sendDirectCommand, debugLog]
    );

    const directCheckRunning = useCallback(
      async (taskId: string) => {
        debugLog(`[HOOK] DIRECT_CHECK_RUNNING ${taskId} on ${keycard}/${identifier}`);
        return sendDirectCommand(DIRECT_COMMAND.IS_RUNNING, { taskId });
      },
      [sendDirectCommand, debugLog]
    );

    return {
      addTask,
      start,
      stop,
      // pause,
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
      directStart,
      directStop,
      directCheckRunning,
    } as WorkerMethods;
  };
}
