import { QUEUE_COMMAND } from '@/core/commands';
import type { BaseEngine } from '@/core/types/engine';
import { getQueueManager } from '@/core/queue-manager';
import { registerAllEngines } from '@/core/registry';

export const setupBackgroundEngine = (engines: Record<string, BaseEngine>, debug = false) => {
  const queueManager = getQueueManager({ debug });
  registerAllEngines(engines, queueManager);

  const debugLog = (...args: unknown[]) => {
    if (debug) console.log(...args);
  };

  // --- Internal Helpers ---

  const broadcast = (message: any) => {
    chrome.runtime.sendMessage(message).catch(() => {
      // Ignore errors when no UI (Popup/Sidepanel) is open
    });
  };

  const handleHeartbeat = (count: number) => {
    if (count > 0) {
      chrome.alarms.create('heartbeat', { periodInMinutes: 0.5 });
    } else {
      chrome.alarms.clear('heartbeat');
    }
  };

  // --- Queue Manager Listeners Setup ---

  queueManager.registerOptions('*' as any, {
    onTasksUpdate: (keycard, identifier, tasks, status) => {
      broadcast({
        type: 'QUEUE_EVENT',
        event: 'TASKS_UPDATED',
        keycard,
        identifier,
        data: { tasks, status },
      });
    },
    onTaskComplete: (keycard, identifier, _, result) => {
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
    onPendingCountChange: (keycard, identifier, count) => {
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

  // --- Bootstrap Logic ---

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

  // --- Register Chrome Event Listeners ---

  // Listen for Messages from Popup/Content Scripts
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.type === 'QUEUE_COMMAND') {
      const { command, keycard, identifier, payload } = message;

      // Handle async commands (Promise)
      const handleAsyncCommand = async (promise: Promise<any>) => {
        await promise;
        sendResponse({ success: true });
      };

      switch (command) {
        case QUEUE_COMMAND.SYNC:
          debugLog(`[BOOTSTRAP] SYNC from ${keycard}/${identifier || 'default'}`);
          sendResponse({
            tasks: queueManager.getTasks(keycard, identifier),
            status: queueManager.getStatus(keycard, identifier),
          });
          break;

        case QUEUE_COMMAND.CANCEL_TASK:
          debugLog(
            `[BOOTSTRAP] CANCEL_TASK ${payload.taskId} from ${keycard}/${identifier || 'default'}`
          );
          handleAsyncCommand(queueManager.cancelTask(keycard, identifier, payload.taskId));
          return true; // Keep connection to send response later

        case QUEUE_COMMAND.CANCEL_TASKS:
          debugLog(
            `[BOOTSTRAP] CANCEL_TASKS ${payload.taskIds.length} tasks from ${keycard}/${identifier || 'default'}`
          );
          handleAsyncCommand(
            Promise.all(
              payload.taskIds.map((id: string) => queueManager.cancelTask(keycard, identifier, id))
            )
          );
          return true;

        case QUEUE_COMMAND.ADD:
          debugLog(
            `[BOOTSTRAP] ADD task ${payload.task?.id} to ${keycard}/${identifier || 'default'}`
          );
          handleAsyncCommand(queueManager.add(keycard, identifier, payload.task));
          return true;

        case QUEUE_COMMAND.ADD_MANY:
          debugLog(
            `[BOOTSTRAP] ADD_MANY ${payload.tasks?.length} tasks to ${keycard}/${identifier || 'default'}`
          );
          handleAsyncCommand(queueManager.addMany(keycard, identifier, payload.tasks));
          return true;

        case QUEUE_COMMAND.START:
          debugLog(`[BOOTSTRAP] START queue ${keycard}/${identifier || 'default'}`);
          handleAsyncCommand(queueManager.start(keycard, identifier));
          return true;

        case QUEUE_COMMAND.STOP:
          debugLog(`[BOOTSTRAP] STOP queue ${keycard}/${identifier || 'default'}`);
          handleAsyncCommand(queueManager.stop(keycard, identifier));
          return true;

        case QUEUE_COMMAND.PAUSE:
          debugLog(`[BOOTSTRAP] PAUSE queue ${keycard}/${identifier || 'default'}`);
          handleAsyncCommand(queueManager.pause(keycard, identifier));
          return true;

        case QUEUE_COMMAND.RESUME:
          debugLog(`[BOOTSTRAP] RESUME queue ${keycard}/${identifier || 'default'}`);
          handleAsyncCommand(queueManager.resume(keycard, identifier));
          return true;

        case QUEUE_COMMAND.CLEAR:
          debugLog(`[BOOTSTRAP] CLEAR queue ${keycard}/${identifier || 'default'}`);
          handleAsyncCommand(queueManager.clear(keycard, identifier));
          return true;

        case QUEUE_COMMAND.GET_STATUS:
          debugLog(`[BOOTSTRAP] GET_STATUS from ${keycard}/${identifier || 'default'}`);
          sendResponse(queueManager.getStatus(keycard, identifier));
          break;

        case QUEUE_COMMAND.GET_TASKS:
          debugLog(`[BOOTSTRAP] GET_TASKS from ${keycard}/${identifier || 'default'}`);
          sendResponse({ tasks: queueManager.getTasks(keycard, identifier) });
          break;

        case QUEUE_COMMAND.SET_TASK_CONFIG:
          queueManager.updateTaskConfig(keycard, identifier, payload.taskConfig);
          sendResponse({ success: true });
          break;

        default:
          debugLog(`[Queue] Unknown command: ${command}`);
          break;
      }
    }

    if (message.type === 'PING') {
      sendResponse({ payload: 'PONG from background' });
    }
  });

  // Keep Service Worker awake
  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === 'heartbeat') {
      debugLog('Service Worker Heartbeat...');
    }
  });

  // Installation events and shortcuts
  chrome.runtime.onInstalled.addListener(() => {
    debugLog('Auto Script Extension Installed');
  });

  chrome.commands.onCommand.addListener((command) => {
    if (command === 'open-popup') {
      chrome.action.openPopup().catch((err) => console.error('Failed to open popup', err));
    }
  });

  // Trigger bootstrap
  bootstrap();
};
