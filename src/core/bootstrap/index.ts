import { getQueueService } from '@/core/services/queue.service';
import { directService } from '@/core/services/direct.service';
import { taskService } from '@/core/services/task.service';
import { registerEngines, type EngineRegistry } from '@/core/common/registry';
import { createHeartbeatHandler } from '@/core/utils/heartbeat';
import type { EngineResult, QueueStatus, Task } from '@/core/common/types';
import { createQueueController } from '@/core/controllers/queue.controller';
import { createDirectController } from '@/core/controllers/direct.controller';
import { onUIPortConnect } from '@/core/utils/port-tracker';
import { taskRepository } from '@/core/repositories/task.repository';
import { emitEvent, EVENTS } from '@/core/events/emitter';

export type SetupOptions = {
  debug?: boolean;
};

const getTasksAndStatus = async (keycard: string, identifier: string) => {
  const tasks = await taskRepository.getTasks(keycard, identifier);
  const status = getQueueService().getStatus(keycard, identifier);
  return { keycard, identifier, data: { tasks, status } };
};

export const bootstrap = (engineRegistry: EngineRegistry, options: SetupOptions = {}) => {
  const { debug = false } = options;

  const debugLog = (...args: unknown[]) => {
    if (debug) console.log(...args);
  };
  const handleHeartbeat = createHeartbeatHandler();

  registerEngines(engineRegistry.getEngines(), getQueueService());

  onUIPortConnect((port) => {
    debugLog(`[BOOTSTRAP] UI port connected: ${port.sender?.url || 'unknown'}`);
  });

  const queueService = getQueueService();

  queueService.registerCallbacks({
    onTaskStart: async (keycard: string, identifier: string, taskId: string) => {
      const task = await taskRepository.getTask(keycard, identifier, taskId);
      if (task) {
        task.status = 'Running';
        task.updateAt = Date.now();
        await taskRepository.saveTask(keycard, identifier, task);
      }
      emitEvent(EVENTS.TASK_STARTED, { keycard, identifier, taskId, task });
    },
    onTaskComplete: async (
      keycard: string,
      identifier: string,
      taskId: string,
      result: EngineResult
    ) => {
      const task = await taskRepository.getTask(keycard, identifier, taskId);
      if (task) {
        task.status = result.success ? 'Completed' : 'Error';
        task.progress = result.success ? 100 : 0;
        task.errorMessage = result.error;
        task.updateAt = Date.now();
        await taskRepository.saveTask(keycard, identifier, task);
      }
      emitEvent(EVENTS.TASK_COMPLETED, { keycard, identifier, taskId, result });
      const tasksAndStatus = await getTasksAndStatus(keycard, identifier);
      emitEvent(EVENTS.TASKS_UPDATED, tasksAndStatus);
      handleHeartbeat(0);
    },
    onQueueEmpty: async (keycard: string, identifier: string) => {
      debugLog(`[BOOTSTRAP] Queue empty: ${keycard}/${identifier}`);
      emitEvent(EVENTS.QUEUE_EMPTY, { keycard, identifier });
      const tasksAndStatus = await getTasksAndStatus(keycard, identifier);
      emitEvent(EVENTS.TASKS_UPDATED, tasksAndStatus);
    },
  });

  directService.registerCallbacks({
    onTaskUpdate: async (keycard: string, identifier: string, task: Task) => {
      await taskRepository.saveTask(keycard, identifier, task);
      emitEvent(EVENTS.TASK_UPDATED, { keycard, identifier, task });
    },
    onTaskComplete: async (
      keycard: string,
      identifier: string,
      taskId: string,
      result: EngineResult
    ) => {
      const task = await taskRepository.getTask(keycard, identifier, taskId);
      if (task) {
        task.status = result.success ? 'Completed' : 'Error';
        task.progress = result.success ? 100 : 0;
        task.errorMessage = result.error;
        task.updateAt = Date.now();
        await taskRepository.saveTask(keycard, identifier, task);
      }
      const isCancelled = result.error === 'CANCELLED' || result.error === 'AbortError';
      if (!isCancelled) {
        emitEvent(EVENTS.TASK_COMPLETED, { keycard, identifier, taskId, result });
      }
      const tasksAndStatus = await getTasksAndStatus(keycard, identifier);
      emitEvent(EVENTS.TASKS_UPDATED, tasksAndStatus);
      handleHeartbeat(0);
    },
  });

  const queueController = createQueueController(debugLog);
  const directController = createDirectController(debugLog);

  const boot = async () => {
    try {
      debugLog('🚀 Bootstrapping...');
      debugLog('✅ Ready.');
    } catch (error) {
      console.error('❌ Bootstrap failed:', error);
    }
  };

  chrome.runtime.onMessage.addListener(
    (message: any, _sender: any, sendResponse: (response?: any) => void) => {
      if (message.type === 'QUEUE_COMMAND') {
        const result = queueController(message);

        if (result && 'then' in result) {
          result.then((r: any) => sendResponse(r));
          return true;
        }

        if (result) {
          sendResponse(result);
        }
      }

      if (message.type === 'DIRECT_COMMAND') {
        const result = directController(message);

        if (result && 'then' in result) {
          result.then((r: any) => sendResponse(r));
          return true;
        }

        if (result) {
          sendResponse(result);
        }
      }

      if (message.type === 'PING') {
        sendResponse({ payload: 'PONG from bootstrap' });
      }
    }
  );

  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === 'heartbeat') {
      debugLog('Service Worker Heartbeat...');
    }
  });
  boot();
};

export const setupKernelScript = bootstrap;
