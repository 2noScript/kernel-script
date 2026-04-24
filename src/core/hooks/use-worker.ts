import { useEffect, useCallback, useRef } from 'react';
import type {
  BaseEngine,
  Task,
  TaskInput,
  TaskConfig,
  EngineResult,
  AsyncResult,
} from '@/core/types';
import { type QueueStatus } from '@/core/managers/queue.manager';
import { QUEUE_COMMAND, DIRECT_COMMAND } from '@/core/commands';
import type { TaskStoreState } from '@/core/store/task.store';

export interface WorkerMethods {
  add: (task: Task) => Promise<AsyncResult>;
  start: () => Promise<AsyncResult>;
  stop: () => Promise<AsyncResult>;
  resume: () => Promise<AsyncResult>;
  clear: () => Promise<AsyncResult>;
  getStatus: () => Promise<QueueStatus>;
  getTasks: () => Promise<{ tasks: Task[] }>;
  cancel: (taskId: string) => Promise<AsyncResult>;
  cancels: (taskIds: string[]) => Promise<AsyncResult>;
  publish: (tasks: Task[]) => Promise<AsyncResult>;
  delete: (taskIds: string[]) => Promise<AsyncResult>;
  retries: (taskIds: string[]) => Promise<AsyncResult>;
  skips: (taskIds: string[]) => Promise<AsyncResult>;
  setTaskConfig: (taskConfig: TaskConfig) => Promise<AsyncResult>;
  directStart: (task: Task) => Promise<EngineResult>;
  directStop: (taskId: string) => Promise<AsyncResult>;
  directCheckRunning: (taskId: string) => Promise<{ isRunning: boolean }>;
}

export interface WorkerConfig {
  engine: BaseEngine;
  identifier: string;
  plugin: TaskStoreState;
  debug?: boolean;
}

export function useWorker(config: WorkerConfig) {
  return function initWorker() {
    const { engine, identifier, plugin, debug = false } = config;
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
                plugin.setTasks(response.tasks);
              } else {
                const localTasks = plugin.getTasks();
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
                plugin.setPendingCount(response.status.size + response.status.pending);
                plugin.setIsRunning(response.status.isRunning);
              }
            }
          }
        );
      }

      const handleMessage = (message: any) => {
        if (message.type === 'WORKER_EVENT') {
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
              plugin.updateTasks(updates);
              plugin.setPendingCount(data.status.size + data.status.pending);
              plugin.setIsRunning(data.status.isRunning);
              break;
            }
            case 'PENDING_COUNT_CHANGED':
              debugLog(
                `[HOOK] EVENT: PENDING_COUNT_CHANGED for ${keycard}/${identifier}: ${data.count}`
              );
              plugin.setPendingCount(data.count);
              break;
            case 'TASK_COMPLETE':
              debugLog(`[HOOK] EVENT: HISTORY_ADDED for ${keycard}/${identifier}`);
              if (plugin.addHistoryTask) {
                plugin.addHistoryTask(data.taskId, data.result);
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
              plugin.updateTask(data.task.id, data.task);
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
    }, [keycard, identifier, plugin, safeSendMessage, lastInitializedRef]);

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

    const add = useCallback(
      async (task: TaskInput) => {
        debugLog(`[HOOK] ADD_TASK ${task.name || 'unnamed'} to ${keycard}/${identifier}`);
        return sendQueueCommand(QUEUE_COMMAND.ADD, { task: task });
      },
      [sendQueueCommand, plugin, debugLog]
    );

    const start = useCallback(async () => {
      debugLog(`[HOOK] START queue ${keycard}/${identifier}`);
      return sendQueueCommand(QUEUE_COMMAND.START);
    }, [sendQueueCommand, plugin, debugLog]);

    const stop = useCallback(async () => {
      debugLog(`[HOOK] STOP queue ${keycard}/${identifier}`);
      return sendQueueCommand(QUEUE_COMMAND.STOP);
    }, [sendQueueCommand, plugin, debugLog]);

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

    const cancel = useCallback(
      async (taskId: string) => {
        debugLog(`[HOOK] CANCEL_TASK ${taskId} from ${keycard}/${identifier}`);
        return sendQueueCommand(QUEUE_COMMAND.CANCEL_TASK, { taskId });
      },
      [sendQueueCommand, debugLog]
    );

    const cancels = useCallback(
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

    const publish = useCallback(
      async (tasks: Task[]) => {
        debugLog(`[HOOK] PUBLISH_TASKS ${tasks.length} tasks to ${keycard}/${identifier}`);
        return sendQueueCommand(QUEUE_COMMAND.ADD_MANY, {
          tasks: tasks.map((t) => ({
            ...t,
            status: 'Waiting',
            isQueued: true,
          })),
        });
      },
      [plugin, sendQueueCommand, debugLog]
    );

    const _delete = useCallback(
      async (taskIds: string[]) => {
        if (taskIds.length === 0) return { success: true };
        debugLog(`[HOOK] DELETE_TASKS ${taskIds.length} tasks from ${keycard}/${identifier}`);

        const result = await sendQueueCommand(QUEUE_COMMAND.CANCEL_TASKS, { taskIds });
        plugin.deleteTasks(taskIds);
        return result;
      },
      [plugin, sendQueueCommand, debugLog]
    );

    const skips = useCallback(
      async (taskIds: string[]) => {
        if (taskIds.length === 0) return { success: true };
        debugLog(`[HOOK] SKIP_TASKS ${taskIds.length} tasks in ${keycard}/${identifier}`);

        const result = await sendQueueCommand('CANCEL_TASKS', { taskIds });

        const updates: Record<string, Partial<Task>> = {};
        taskIds.forEach((id) => {
          updates[id] = { status: 'Skipped', isQueued: false };
        });
        plugin.updateTasks(updates);
        return result;
      },
      [plugin, sendQueueCommand, debugLog]
    );

    const retries = useCallback(
      async (taskIds: string[]) => {
        const tasks = plugin.getTasks().filter((t) => taskIds.includes(t.id));
        if (tasks.length === 0) return { success: true };
        debugLog(`[HOOK] RETRY_TASKS ${taskIds.length} tasks in ${keycard}/${identifier}`);

        tasks.forEach((task) => {
          plugin.updateTask(task.id, {
            status: 'Waiting',
            errorMessage: undefined,
            isQueued: true,
          });
        });

        return sendQueueCommand(QUEUE_COMMAND.ADD_MANY, {
          tasks: tasks.map((t) => ({
            ...t,
            status: 'Waiting',
            errorMessage: undefined,
            isQueued: true,
          })),
        });
      },
      [plugin, sendQueueCommand, debugLog]
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
      add,
      start,
      stop,
      resume,
      clear,
      getStatus,
      getTasks,
      cancel,
      cancels,
      publish,
      delete: _delete,
      retries,
      skips,
      setTaskConfig,
      directStart,
      directStop,
      directCheckRunning,
    } as WorkerMethods;
  };
}
