import { useEffect, useCallback, useRef, useState } from 'react';
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
import type { SyncResponse } from '@/core/background/handlers/queue.handler';

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
  add: (task: TaskInput) => Promise<AsyncResult>;
  addMany: (tasks: Task[]) => Promise<AsyncResult>;
  start: () => Promise<AsyncResult>;
  stop: () => Promise<AsyncResult>;
  resume: () => Promise<AsyncResult>;
  clear: () => Promise<AsyncResult>;
  delete: (taskIds: string[]) => Promise<AsyncResult>;
  retries: (taskIds: string[]) => Promise<AsyncResult>;
  skips: (taskIds: string[]) => Promise<AsyncResult>;
  publish: (tasks: Task[]) => Promise<AsyncResult>;
  toggleSelect: (taskId: string) => Promise<void>;
  toggleSelectAll: (taskIds?: string[]) => Promise<void>;
  clearSelected: () => Promise<void>;
  directStart: (task: Task) => Promise<EngineResult>;
  directStop: (taskId: string) => Promise<AsyncResult>;
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
        const { event, keycard: pid, identifier: pjid, data } = message;
        const isPlatformMatch = pid === keycard || pid === '*';
        const isIdentifierMatch = (pjid || '') === (identifier || '') || pid === '*';

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

  const add = useCallback(
    async (task: TaskInput) => {
      debugLog(`[HOOK] ADD_TASK ${task.name || 'unnamed'}`);
      const result = await sendQueueCommand(QUEUE_COMMAND.ADD, { task });
      syncFromBackground();
      return result;
    },
    [sendQueueCommand, syncFromBackground, debugLog]
  );

  const addMany = useCallback(
    async (newTasks: Task[]) => {
      debugLog(`[HOOK] ADD_MANY ${newTasks.length} tasks`);
      const result = await sendQueueCommand(QUEUE_COMMAND.ADD_MANY, { tasks: newTasks });
      syncFromBackground();
      return result;
    },
    [sendQueueCommand, syncFromBackground, debugLog]
  );

  const start = useCallback(async () => {
    debugLog(`[HOOK] START queue`);
    const result = await sendQueueCommand(QUEUE_COMMAND.START);
    syncFromBackground();
    return result;
  }, [sendQueueCommand, syncFromBackground, debugLog]);

  const stop = useCallback(async () => {
    debugLog(`[HOOK] STOP queue`);
    const result = await sendQueueCommand(QUEUE_COMMAND.STOP);
    syncFromBackground();
    return result;
  }, [sendQueueCommand, syncFromBackground, debugLog]);

  const resume = useCallback(async () => {
    debugLog(`[HOOK] RESUME queue`);
    const result = await sendQueueCommand(QUEUE_COMMAND.RESUME);
    syncFromBackground();
    return result;
  }, [sendQueueCommand, syncFromBackground, debugLog]);

  const clear = useCallback(async () => {
    debugLog(`[HOOK] CLEAR queue`);
    const result = await sendQueueCommand(QUEUE_COMMAND.CLEAR);
    syncFromBackground();
    return result;
  }, [sendQueueCommand, syncFromBackground, debugLog]);

  const deleteTasks = useCallback(
    async (taskIds: string[]) => {
      if (taskIds.length === 0) return { success: true };
      debugLog(`[HOOK] DELETE_TASKS ${taskIds.length}`);
      const result = await sendQueueCommand(QUEUE_COMMAND.CANCEL_TASKS, { taskIds });
      syncFromBackground();
      return result;
    },
    [sendQueueCommand, syncFromBackground, debugLog]
  );

  const retries = useCallback(
    async (taskIds: string[]) => {
      if (taskIds.length === 0) return { success: true };
      debugLog(`[HOOK] RETRY_TASKS ${taskIds.length}`);
      const result = await sendQueueCommand(QUEUE_COMMAND.ADD_MANY, {
        tasks: taskIds.map((id) => ({
          id,
          status: 'Waiting',
          errorMessage: undefined,
          isQueued: true,
        })),
      });
      syncFromBackground();
      return result;
    },
    [sendQueueCommand, syncFromBackground, debugLog]
  );

  const skips = useCallback(
    async (taskIds: string[]) => {
      if (taskIds.length === 0) return { success: true };
      debugLog(`[HOOK] SKIP_TASKS ${taskIds.length}`);
      const result = await sendQueueCommand(QUEUE_COMMAND.CANCEL_TASKS, { taskIds });
      syncFromBackground();
      return result;
    },
    [sendQueueCommand, syncFromBackground, debugLog]
  );

  const publish = useCallback(
    async (newTasks: Task[]) => {
      debugLog(`[HOOK] PUBLISH_TASKS ${newTasks.length}`);
      const result = await sendQueueCommand(QUEUE_COMMAND.ADD_MANY, {
        tasks: newTasks.map((t) => ({
          ...t,
          status: 'Waiting',
          isQueued: true,
        })),
      });
      syncFromBackground();
      return result;
    },
    [sendQueueCommand, syncFromBackground, debugLog]
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
    [sendQueueCommand, debugLog]
  );

  const toggleSelectAll = useCallback(
    async (taskIds?: string[]) => {
      debugLog(`[HOOK] TOGGLE_SELECT_ALL`);
      const response = await sendQueueCommand(QUEUE_COMMAND.TOGGLE_SELECT_ALL, { taskIds });
      if (response?.selectedIds) {
        setSelectedIds(response.selectedIds);
      }
    },
    [sendQueueCommand, debugLog]
  );

  const clearSelected = useCallback(async () => {
    debugLog(`[HOOK] CLEAR_SELECTED`);
    await sendQueueCommand(QUEUE_COMMAND.CLEAR_SELECTED);
    setSelectedIds([]);
  }, [sendQueueCommand, debugLog]);

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

  const directStart = useCallback(
    async (task: Task) => {
      debugLog(`[HOOK] DIRECT_START ${task.id}`);
      return sendDirectCommand(DIRECT_COMMAND.START, { task });
    },
    [sendDirectCommand, debugLog]
  );

  const directStop = useCallback(
    async (taskId: string) => {
      debugLog(`[HOOK] DIRECT_STOP ${taskId}`);
      return sendDirectCommand(DIRECT_COMMAND.STOP, { taskId });
    },
    [sendDirectCommand, debugLog]
  );

  return {
    tasks,
    isRunning,
    selectedIds,
    taskConfig,
    setTaskConfig,
    add,
    addMany,
    start,
    stop,
    resume,
    clear,
    delete: deleteTasks,
    retries,
    skips,
    publish,
    toggleSelect,
    toggleSelectAll,
    clearSelected,
    directStart,
    directStop,
  };
}

export type WorkerMethods = UseWorkerReturn;
