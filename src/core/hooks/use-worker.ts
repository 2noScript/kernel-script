import { useEffect, useCallback, useRef, useState } from 'react';
import type {
  BaseEngine,
  Task,
  TaskInput,
  TaskConfig,
  EngineResult,
  CommandResult,
} from '@/core/common/types';
import { COMMANDS, DIRECT_COMMAND } from '@/core/constants/commands';
import type { SyncResponse } from '@/core/controllers/script.controller';
import { EVENTS } from '@/core/events/emitter';
import { debugLog } from '@/core/common/log';

export interface WorkerConfig {
  engine: BaseEngine;
  identifier: string;
}

export interface UseWorkerReturn {
  tasks: Task[];
  isRunning: boolean;
  selectedIds: string[];
  taskConfig: TaskConfig;
  setTaskConfig: (config: TaskConfig) => Promise<void>;
  createTask: (input: TaskInput) => Promise<CommandResult>;
  createTasks: (inputs: TaskInput[]) => Promise<CommandResult>;
  deleteTask: (taskId: string) => Promise<CommandResult>;
  deleteTasks: (taskIds: string[]) => Promise<CommandResult>;
  publishTasks: (taskIds: string[]) => Promise<CommandResult>;
  unpublishTasks: (taskIds: string[]) => Promise<CommandResult>;
  resetTasks: (taskIds: string[]) => Promise<CommandResult>;
  queueStart: () => Promise<CommandResult>;
  queueStop: () => Promise<CommandResult>;
  queueCancelTask: (taskId: string) => Promise<CommandResult>;
  queueClear: () => Promise<CommandResult>;
  retryTask: (taskId: string) => Promise<CommandResult>;
  skipTask: (taskId: string) => Promise<CommandResult>;
  toggleSelect: (taskId: string) => void;
  toggleSelectAll: (taskIds?: string[]) => void;
  clearSelected: () => void;
  runTask: (taskId: string) => Promise<EngineResult>;
  stopTask: (taskId: string) => Promise<CommandResult>;
  sync: () => void;
}

export function useWorker(config: WorkerConfig): UseWorkerReturn {
  const { engine, identifier } = config;
  const keycard = engine.keycard;
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [taskConfig, setTaskConfigState] = useState<TaskConfig>({
    threads: 1,
    delayMin: 1,
    delayMax: 15,
    stopOnErrorCount: 0,
  });

  const portRef = useRef<chrome.runtime.Port | null>(null);

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

  const sendCommand = useCallback(
    (command: string, payload?: any): Promise<any> => {
      return new Promise((resolve) => {
        safeSendMessage(
          {
            type: 'COMMANDS',
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

  const syncFromBackground = useCallback(() => {
    safeSendMessage(
      {
        type: 'COMMANDS',
        command: COMMANDS.SYNC,
        keycard,
        identifier,
      },
      (response: SyncResponse) => {
        if (response) {
          debugLog(`[HOOK] SYNC: ${response.tasks?.length || 0} tasks`);
          if (response.tasks) {
            setTasks(response.tasks);
          }
          if (response.status) {
            setIsRunning(response.status.isRunning);
          }
          if (response.taskConfig) {
            setTaskConfigState(response.taskConfig);
          }
        }
      }
    );
  }, [keycard, identifier, safeSendMessage, debugLog]);

  useEffect(() => {
    if (portRef.current) {
      portRef.current.disconnect();
    }

    try {
      if (!chrome.runtime?.id) {
        console.warn('[HOOK] Extension context invalidated');
        return;
      }

      const port = chrome.runtime.connect({ name: 'ui-port' });
      portRef.current = port;

      port.onDisconnect.addListener(() => {
        portRef.current = null;
        debugLog(`[HOOK] UI port disconnected`);
      });
    } catch (e) {
      console.error('[HOOK] Failed to connect port:', e);
      return;
    }

    syncFromBackground();

    const handleMessage = (message: any) => {
      if (message.type === 'TASK_EVENT') {
        const { event, keycard: msgKeycard, identifier: msgIdentifier, data } = message;
        const isPlatformMatch = msgKeycard === keycard || msgKeycard === '*';
        const isIdentifierMatch =
          (msgIdentifier || '') === (identifier || '') || msgKeycard === '*';

        if (!isPlatformMatch || !isIdentifierMatch) return;

        switch (event) {
          case EVENTS.ALL_STATE:
            debugLog(`[HOOK] ${EVENTS.ALL_STATE}`, data);
            break;
          case EVENTS.TASK_DELAYING:
            debugLog(`[HOOK] ${EVENTS.TASK_DELAYING}`, data);
            if (data.task) {
              setTasks((prev) =>
                prev.map((t) => {
                  if (t.id === data.task.id) return data.task;
                  return t;
                })
              );
            }
            break;

          case EVENTS.TASK_RUNNING:
            debugLog(`[HOOK] ${EVENTS.TASK_RUNNING}`, data);
            if (data.task) {
              setTasks((prev) => {
                const idx = prev.findIndex((t) => t.id === data.taskId);
                if (idx !== -1) {
                  const updated = [...prev];
                  updated[idx] = { ...updated[idx], ...data.task };
                  return updated;
                }
                return prev;
              });
            }
            break;

          case EVENTS.TASK_COMPLETED:
            debugLog(`[HOOK] ${EVENTS.TASK_COMPLETED}`, data);
            if (data.task) {
              setTasks((prev) =>
                prev.map((t) => (t.id === data.taskId ? { ...t, ...data.task } : t))
              );
            }
            break;

          case EVENTS.TASK_ERROR:
            debugLog(`[HOOK] ${EVENTS.TASK_ERROR}`, data);
            if (data.task) {
              setTasks((prev) =>
                prev.map((t) => (t.id === data.taskId ? { ...t, ...data.task } : t))
              );
            }
            break;

          case EVENTS.TASK_CANCELLED:
            debugLog(`[HOOK] ${EVENTS.TASK_CANCELLED}`, data);
            if (data.task) {
              setTasks((prev) =>
                prev.map((t) => (t.id === data.taskId ? { ...t, ...data.task } : t))
              );
            }
            break;

          case EVENTS.TASK_DELAYING:
            debugLog(`[HOOK] ${EVENTS.TASK_DELAYING}`, data);
            if (data.task) {
              setTasks((prev) =>
                prev.map((t) => (t.id === data.taskId ? { ...t, ...data.task } : t))
              );
            }
            break;

          case EVENTS.QUEUE_EMPTY:
            debugLog(`[HOOK] ${EVENTS.QUEUE_EMPTY}`);
            setIsRunning(false);
            break;
        }
      }
    };

    chrome.runtime.onMessage.addListener(handleMessage);
    return () => {
      chrome.runtime.onMessage.removeListener(handleMessage);
      portRef.current?.disconnect();
      portRef.current = null;
    };
  }, [keycard, identifier, syncFromBackground, debugLog]);

  const sync = useCallback(() => {
    syncFromBackground();
  }, [syncFromBackground]);

  const createTask = useCallback(
    async (input: TaskInput) => {
      debugLog(`[HOOK] CREATE_TASK ${input.name}`);
      return sendCommand(COMMANDS.CREATE_TASK, { input });
    },
    [sendCommand, debugLog]
  );

  const createTasks = useCallback(
    async (inputs: TaskInput[]) => {
      debugLog(`[HOOK] CREATE_TASKS ${inputs.length} tasks`);
      return sendCommand(COMMANDS.CREATE_TASKS, { inputs });
    },
    [sendCommand, debugLog]
  );

  const deleteTask = useCallback(
    async (taskId: string) => {
      debugLog(`[HOOK] DELETE_TASK ${taskId}`);
      return sendCommand(COMMANDS.DELETE_TASK, { taskId });
    },
    [sendCommand, debugLog]
  );

  const deleteTasks = useCallback(
    async (taskIds: string[]) => {
      debugLog(`[HOOK] DELETE_TASKS ${taskIds.length}`);
      return sendCommand(COMMANDS.DELETE_TASKS, { taskIds });
    },
    [sendCommand, debugLog]
  );

  const publishTasks = useCallback(
    async (taskIds: string[]) => {
      debugLog(`[HOOK] PUBLISH_TASKS ${taskIds.length}`);
      return sendCommand(COMMANDS.PUBLISH_TASKS, { taskIds });
    },
    [sendCommand, debugLog]
  );

  const unpublishTasks = useCallback(
    async (taskIds: string[]) => {
      debugLog(`[HOOK] UNPUBLISH_TASKS ${taskIds.length}`);
      return sendCommand(COMMANDS.UNPUBLISH_TASKS, { taskIds });
    },
    [sendCommand, debugLog]
  );

  const resetTasks = useCallback(
    async (taskIds: string[]) => {
      debugLog(`[HOOK] RESET_TASKS ${taskIds.length}`);
      return sendCommand(COMMANDS.RESET_TASKS, { taskIds });
    },
    [sendCommand, debugLog]
  );

  const queueStart = useCallback(async () => {
    debugLog(`[HOOK] QUEUE_START`);
    return sendCommand(COMMANDS.QUEUE_START);
  }, [sendCommand, debugLog]);

  const queueStop = useCallback(async () => {
    debugLog(`[HOOK] QUEUE_STOP`);
    return sendCommand(COMMANDS.QUEUE_STOP);
  }, [sendCommand, debugLog]);

  const queueCancelTask = useCallback(
    async (taskId: string) => {
      debugLog(`[HOOK] QUEUE_CANCEL_TASK ${taskId}`);
      return sendCommand(COMMANDS.QUEUE_CANCEL_TASK, { taskId });
    },
    [sendCommand, debugLog]
  );

  const queueClear = useCallback(async () => {
    debugLog(`[HOOK] QUEUE_CLEAR`);
    return sendCommand(COMMANDS.QUEUE_CLEAR);
  }, [sendCommand, debugLog]);

  const retryTask = useCallback(
    async (taskId: string) => {
      debugLog(`[HOOK] RETRY_TASK ${taskId}`);
      return sendCommand(DIRECT_COMMAND.RETRY_TASK, { taskId });
    },
    [sendCommand, debugLog]
  );

  const skipTask = useCallback(
    async (taskId: string) => {
      debugLog(`[HOOK] SKIP_TASK ${taskId}`);
      return sendCommand(DIRECT_COMMAND.SKIP_TASK, { taskId });
    },
    [sendCommand, debugLog]
  );

  const setTaskConfig = useCallback(
    async (config: TaskConfig) => {
      debugLog(`[HOOK] SET_TASK_CONFIG`, config);
      setTaskConfigState(config);
      return sendCommand(COMMANDS.SET_TASK_CONFIG, { taskConfig: config });
    },
    [sendCommand, debugLog]
  );

  const toggleSelect = useCallback(
    (taskId: string) => {
      debugLog(`[HOOK] TOGGLE_SELECT ${taskId}`);
      setSelectedIds((prev) => {
        if (prev.includes(taskId)) {
          return prev.filter((id) => id !== taskId);
        }
        return [...prev, taskId];
      });
    },
    [debugLog]
  );

  const toggleSelectAll = useCallback(
    (taskIds?: string[]) => {
      debugLog(`[HOOK] TOGGLE_SELECT_ALL`);
      setSelectedIds((prev) => {
        const targetIds = taskIds || [];
        const allSelected = targetIds.every((id) => prev.includes(id));
        if (allSelected) {
          return prev.filter((id) => !targetIds.includes(id));
        }
        const newSelected = new Set([...prev, ...targetIds]);
        return Array.from(newSelected);
      });
    },
    [debugLog]
  );

  const clearSelected = useCallback(() => {
    debugLog(`[HOOK] CLEAR_SELECTED`);
    setSelectedIds([]);
  }, [debugLog]);

  const runTask = useCallback(
    async (taskId: string) => {
      debugLog(`[HOOK] RUN_TASK ${taskId}`);
      return sendCommand(DIRECT_COMMAND.RUN_TASK, { taskId });
    },
    [sendCommand, debugLog]
  );

  const stopTask = useCallback(
    async (taskId: string) => {
      debugLog(`[HOOK] STOP_TASK ${taskId}`);
      return sendCommand(DIRECT_COMMAND.STOP_TASK, { taskId });
    },
    [sendCommand, debugLog]
  );

  return {
    tasks,
    isRunning,
    selectedIds,
    taskConfig,
    setTaskConfig,
    createTask,
    createTasks,
    deleteTask,
    deleteTasks,
    publishTasks,
    unpublishTasks,
    resetTasks,
    queueStart,
    queueStop,
    queueCancelTask,
    queueClear,
    retryTask,
    skipTask,
    toggleSelect,
    toggleSelectAll,
    clearSelected,
    runTask,
    stopTask,
    sync,
  };
}

export type WorkerMethods = UseWorkerReturn;
