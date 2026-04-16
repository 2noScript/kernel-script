import type { BaseEngine } from '@/core/types';
import { getQueueManager } from '@/core/managers/queue.manager';
import { registerEngines } from '@/core/registry';
import { createBroadcast } from '@/core/bootstrap/broadcast';
import { createHeartbeatHandler } from '@/core/bootstrap/heartbeat';
import { createMessageHandler } from '@/core/bootstrap/message-handler';

export type SetupOptions = {
  debug?: boolean;
  storageKey?: string;
};

export const setupKernelScript = (
  engines: Record<string, BaseEngine>,
  options: SetupOptions = {}
) => {
  const { debug = false, storageKey } = options;
  const queueManager = getQueueManager({ debug, storageKey });
  registerEngines(engines, queueManager);

  const debugLog = (...args: unknown[]) => {
    if (debug) console.log(...args);
  };

  const broadcast = createBroadcast();
  const handleHeartbeat = createHeartbeatHandler();

  const messageHandler = createMessageHandler({
    queueManager,
    debug,
    debugLog,
    broadcast,
    handleHeartbeat,
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

  chrome.runtime.onMessage.addListener(messageHandler);

  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === 'heartbeat') {
      debugLog('Service Worker Heartbeat...');
    }
  });
  bootstrap();
};
