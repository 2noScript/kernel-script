import { getQueueService } from '@/core/services/queue.service';
import { registerEngines, type EngineRegistry } from '@/core/common/registry';
import { createScriptController } from '@/core/controllers/script.controller';
import { createDirectController } from '@/core/controllers/direct.controller';
import { onPortConnect } from '@/core/utils/port-tracker';

export type SetupOptions = {
  debug?: boolean;
};

export const bootstrap = (engineRegistry: EngineRegistry, options: SetupOptions = {}) => {
  const { debug = false } = options;

  const debugLog = (...args: unknown[]) => {
    if (debug) console.log(...args);
  };

  registerEngines(engineRegistry.getEngines(), getQueueService());

  onPortConnect((port) => {
    debugLog(`[BOOTSTRAP] UI port connected: ${port.sender?.url || 'unknown'}`);
  });

  const scriptController = createScriptController(debugLog);
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
      if (message.type === 'COMMANDS') {
        const result = scriptController(message);

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
