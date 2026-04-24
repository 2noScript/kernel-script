import { getQueueManager } from '@/core/managers/queue.manager';
import { registerEngines, type EngineRegistry } from '@/core/registry';
import { createBroadcast } from '@/core/background/broadcast';
import { createHeartbeatHandler } from '@/core/background/heartbeat';
import type { EngineResult, QueueStatus, Task } from '@/core/types';
import { getDirectManager } from '@/core/managers/direct.manager';
import { createQueueHandler } from '@/core/background/handlers/queue.handler';
import { createDirectHandler } from '@/core/background/handlers/direct.handler';

export type SetupOptions = {
  debug?: boolean;
  storageKey?: string;
};

export const setupKernelScript = (engineRegistry: EngineRegistry, options: SetupOptions = {}) => {
  const { debug = false, storageKey } = options;
  const broadcast = createBroadcast();
  const queueManager = getQueueManager({ storageKey });
  const directManager = getDirectManager({ debug });

  const debugLog = (...args: unknown[]) => {
    if (debug) console.log(...args);
  };
  const handleHeartbeat = createHeartbeatHandler();

  registerEngines(engineRegistry.getEngines(), queueManager);

  queueManager.registerOptions({
    debugLog,
    onTasksUpdate: (keycard: string, identifier: string, tasks: Task[], status: QueueStatus) => {
      broadcast({
        type: 'QUEUE_EVENT',
        event: 'TASKS_UPDATED',
        keycard,
        identifier,
        data: { tasks, status },
      });
    },
    onTaskComplete: (keycard: string, identifier: string, _: string, result: any) => {
      const isCancelled = result.error === 'CANCELLED' || result.error === 'AbortError';
      if (!isCancelled) {
        broadcast({
          type: 'QUEUE_EVENT',
          event: 'HISTORY_ADDED',
          keycard,
          identifier,
          data: { task: [] },
        });
      }
    },
    onPendingCountChange: (keycard: string, identifier: string, count: number) => {
      broadcast({
        type: 'QUEUE_EVENT',
        event: 'PENDING_COUNT_CHANGED',
        keycard,
        identifier,
        data: { count },
      });
      handleHeartbeat(count);
    },
  });

  directManager.registerOptions('*', {
    debugLog,
    onTasksUpdate: (keycard: string, identifier: string, task: Task) => {
      broadcast({
        type: 'DIRECT_EVENT',
        event: 'TASK_UPDATED',
        keycard,
        identifier,
        data: { task },
      });
    },
    onTaskComplete: (keycard: string, identifier: string, taskId: string, result: EngineResult) => {
      const isCancelled = result.error === 'CANCELLED' || result.error === 'AbortError';
      if (!isCancelled) {
        broadcast({
          type: 'DIRECT_EVENT',
          event: 'TASK_COMPLETED',
          keycard,
          identifier,
          data: { taskId, result },
        });
      }
      handleHeartbeat(0);
    },
  });

  const queueHandler = createQueueHandler({ queueManager, debugLog });
  const directHandler = createDirectHandler({
    directManager,
    debugLog,
  });

  const bootstrap = async () => {
    try {
      debugLog('🚀 Bootstrapping Background Queue Manager...');
      await queueManager.hydrate();
      await queueManager.rehydrateTasks();
      debugLog('✅ Background Queue Manager Ready.');
    } catch (error) {
      console.error('❌ Bootstrap failed:', error);
    }
  };

  chrome.runtime.onMessage.addListener(
    (message: any, _sender: any, sendResponse: (response?: any) => void) => {
      if (message.type === 'QUEUE_COMMAND') {
        const result = queueHandler(message);

        if (result && 'async' in result) {
          return true;
        }

        if (result) {
          sendResponse(result);
        }
      }

      if (message.type === 'DIRECT_COMMAND') {
        const result = directHandler(message);

        if (result && 'then' in result) {
          result.then((r: any) => sendResponse(r));
          return true;
        }

        if (result) {
          sendResponse(result);
        }
      }

      if (message.type === 'PING') {
        sendResponse({ payload: 'PONG from background' });
      }
    }
  );

  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === 'heartbeat') {
      debugLog('Service Worker Heartbeat...');
    }
  });
  bootstrap();
};
