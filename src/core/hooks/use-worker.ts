import { useEffect, useCallback, useRef, useState } from 'react';
import type {
  BaseEngine,
  Task,
  TaskInput,
  TaskConfig,
  EngineResult,
  AsyncResult,
} from '@/core/common/types';
import { type QueueStatus } from '@/core/services/queue.service';
import { QUEUE_COMMAND, DIRECT_COMMAND } from '@/core/constants/commands';
import type { SyncResponse } from '@/core/controllers/queue.controller';

export interface WorkerConfig {
  engine: BaseEngine;
  identifier: string;
  debug?: boolean;
}

export interface UseWorkerReturn {
  tasks: Task[];
  isRunning: boolean;
  selectedIds: string[];
  taskConfig: TaskConfig;
  setTaskConfig: (config: TaskConfig) => Promise<void>;
  createTask: (input: TaskInput) => Promise<AsyncResult>;
  createTasks: (inputs: TaskInput[]) => Promise<AsyncResult>;
  deleteTask: (taskId: string) => Promise<AsyncResult>;
  deleteTasks: (taskIds: string[]) => Promise<AsyncResult>;
  publishTasks: (taskIds: string[]) => Promise<AsyncResult>;
  unpublishTasks: (taskIds: string[]) => Promise<AsyncResult>;
  queueStart: () => Promise<AsyncResult>;
  queueStop: () => Promise<AsyncResult>;
  queueCancelTask: (taskId: string) => Promise<AsyncResult>;
  queueClear: () => Promise<AsyncResult>;
  retryTask: (taskId: string) => Promise<AsyncResult>;
  skipTask: (taskId: string) => Promise<AsyncResult>;
  toggleSelect: (taskId: string) => Promise<void>;
  toggleSelectAll: (taskIds?: string[]) => Promise<void>;
  clearSelected: () => Promise<void>;
  runTask: (taskId: string) => Promise<EngineResult>;
  stopTask: (taskId: string) => Promise<AsyncResult>;
  sync: () => void;
}

export function useWorker(config: WorkerConfig): UseWorkerReturn {
  const { engine, identifier, debug = false } = config;
  const keycard = engine.keycard;

  const debugLog = useCallback(
    (...args: unknown[]) => {
      if (debug) console.log(...args);
    },
    [debug]
  );

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

  const sendQueueCommand = useCallback(
    (command: string, payload?: any): Promise<any> => {
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

  const syncFromBackground = useCallback(() => {
    safeSendMessage(
      {
        type: 'QUEUE_COMMAND',
        command: QUEUE_COMMAND.SYNC,
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
          if (response.selectedIds) {
            setSelectedIds(response.selectedIds);
          }
          if (response.taskConfig) {
            setTaskConfigState(response.taskConfig);
          }
        }
      }
    );
  }, [keycard, identifier, safeSendMessage, debugLog]);

  const sendDirectCommand = useCallback(
    (command: string, payload?: any) => {
      return new Promise<any>((resolve) => {
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
      if (message.type === 'WORKER_EVENT') {
        const { event, keycard: msgKeycard, identifier: msgIdentifier, data } = message;
        const isPlatformMatch = msgKeycard === keycard || msgKeycard === '*';
        const isIdentifierMatch =
          (msgIdentifier || '') === (identifier || '') || msgKeycard === '*';

        if (!isPlatformMatch || !isIdentifierMatch) return;

        switch (event) {
          case 'TASKS_UPDATED':
            debugLog(`[HOOK] TASKS_UPDATED: ${data.tasks?.length || 0}`);
            if (data.tasks) {
              setTasks(data.tasks);
            }
            if (data.status) {
              setIsRunning(data.status.isRunning);
            }
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
      debugLog(`[HOOK] CREATE_TASK ${input.name || 'untitled'}`);
      const result = await sendQueueCommand(QUEUE_COMMAND.CREATE_TASK, { input });
      syncFromBackground();
      return result ?? { success: true };
    },
    [sendQueueCommand, syncFromBackground, debugLog]
  );

  const createTasks = useCallback(
    async (inputs: TaskInput[]) => {
      debugLog(`[HOOK] CREATE_TASKS ${inputs.length} tasks`);
      const result = await sendQueueCommand(QUEUE_COMMAND.CREATE_TASKS, { inputs });
      syncFromBackground();
      return result ?? { success: true };
    },
    [sendQueueCommand, syncFromBackground, debugLog]
  );

  const deleteTask = useCallback(
    async (taskId: string) => {
      debugLog(`[HOOK] DELETE_TASK ${taskId}`);
      const result = await sendQueueCommand(QUEUE_COMMAND.DELETE_TASK, { taskId });
      syncFromBackground();
      return result ?? { success: true };
    },
    [sendQueueCommand, syncFromBackground, debugLog]
  );

  const deleteTasks = useCallback(
    async (taskIds: string[]) => {
      if (taskIds.length === 0) return { success: true };
      debugLog(`[HOOK] DELETE_TASKS ${taskIds.length}`);
      const result = await sendQueueCommand(QUEUE_COMMAND.DELETE_TASKS, { taskIds });
      syncFromBackground();
      return result ?? { success: true };
    },
    [sendQueueCommand, syncFromBackground, debugLog]
  );

  const publishTasks = useCallback(
    async (taskIds: string[]) => {
      if (taskIds.length === 0) return { success: true };
      debugLog(`[HOOK] PUBLISH_TASKS ${taskIds.length}`);
      const result = await sendQueueCommand(QUEUE_COMMAND.PUBLISH_TASKS, { taskIds });
      syncFromBackground();
      return result ?? { success: true };
    },
    [sendQueueCommand, syncFromBackground, debugLog]
  );

  const unpublishTasks = useCallback(
    async (taskIds: string[]) => {
      if (taskIds.length === 0) return { success: true };
      debugLog(`[HOOK] UNPUBLISH_TASKS ${taskIds.length}`);
      const result = await sendQueueCommand(QUEUE_COMMAND.UNPUBLISH_TASKS, { taskIds });
      syncFromBackground();
      return result ?? { success: true };
    },
    [sendQueueCommand, syncFromBackground, debugLog]
  );

  const queueStart = useCallback(async () => {
    debugLog(`[HOOK] QUEUE_START`);
    const result = await sendQueueCommand(QUEUE_COMMAND.QUEUE_START);
    syncFromBackground();
    return result ?? { success: true };
  }, [sendQueueCommand, syncFromBackground, debugLog]);

  const queueStop = useCallback(async () => {
    debugLog(`[HOOK] QUEUE_STOP`);
    const result = await sendQueueCommand(QUEUE_COMMAND.QUEUE_STOP);
    syncFromBackground();
    return result ?? { success: true };
  }, [sendQueueCommand, syncFromBackground, debugLog]);

  const queueCancelTask = useCallback(
    async (taskId: string) => {
      debugLog(`[HOOK] QUEUE_CANCEL_TASK ${taskId}`);
      const result = await sendQueueCommand(QUEUE_COMMAND.QUEUE_CANCEL_TASK, { taskId });
      syncFromBackground();
      return result ?? { success: true };
    },
    [sendQueueCommand, syncFromBackground, debugLog]
  );

  const queueClear = useCallback(async () => {
    debugLog(`[HOOK] QUEUE_CLEAR`);
    const result = await sendQueueCommand(QUEUE_COMMAND.QUEUE_CLEAR);
    syncFromBackground();
    return result ?? { success: true };
  }, [sendQueueCommand, syncFromBackground, debugLog]);

  const retryTask = useCallback(
    async (taskId: string) => {
      debugLog(`[HOOK] RETRY_TASK ${taskId}`);
      const result = await sendDirectCommand(DIRECT_COMMAND.RETRY_TASK, { taskId });
      syncFromBackground();
      return result ?? { success: true };
    },
    [sendDirectCommand, syncFromBackground, debugLog]
  );

  const skipTask = useCallback(
    async (taskId: string) => {
      debugLog(`[HOOK] SKIP_TASK ${taskId}`);
      const result = await sendDirectCommand(DIRECT_COMMAND.SKIP_TASK, { taskId });
      syncFromBackground();
      return result ?? { success: true };
    },
    [sendDirectCommand, syncFromBackground, debugLog]
  );

  const setTaskConfig = useCallback(
    async (config: TaskConfig) => {
      debugLog(`[HOOK] SET_TASK_CONFIG`, config);
      setTaskConfigState(config);
      await sendQueueCommand(QUEUE_COMMAND.SET_TASK_CONFIG, { taskConfig: config });
    },
    [sendQueueCommand, debugLog]
  );

  const toggleSelect = useCallback(
    async (taskId: string) => {
      debugLog(`[HOOK] TOGGLE_SELECT ${taskId}`);
      const response = await sendQueueCommand(QUEUE_COMMAND.TOGGLE_SELECT, { taskId });
      if (response?.selectedIds) {
        setSelectedIds(response.selectedIds);
      }
    },
    [sendQueueCommand]
  );

  const toggleSelectAll = useCallback(
    async (taskIds?: string[]) => {
      debugLog(`[HOOK] TOGGLE_SELECT_ALL`);
      const response = await sendQueueCommand(QUEUE_COMMAND.TOGGLE_SELECT_ALL, { taskIds });
      if (response?.selectedIds) {
        setSelectedIds(response.selectedIds);
      }
    },
    [sendQueueCommand]
  );

  const clearSelected = useCallback(async () => {
    debugLog(`[HOOK] CLEAR_SELECTED`);
    await sendQueueCommand(QUEUE_COMMAND.CLEAR_SELECTED);
    setSelectedIds([]);
  }, [sendQueueCommand]);

  const runTask = useCallback(
    async (taskId: string) => {
      debugLog(`[HOOK] RUN_TASK ${taskId}`);
      const result = await sendDirectCommand(DIRECT_COMMAND.RUN_TASK, { taskId });
      syncFromBackground();
      return result ?? { success: false };
    },
    [sendDirectCommand, syncFromBackground, debugLog]
  );

  const stopTask = useCallback(
    async (taskId: string) => {
      debugLog(`[HOOK] STOP_TASK ${taskId}`);
      const result = await sendDirectCommand(DIRECT_COMMAND.STOP_TASK, { taskId });
      syncFromBackground();
      return result ?? { success: true };
    },
    [sendDirectCommand, syncFromBackground, debugLog]
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
