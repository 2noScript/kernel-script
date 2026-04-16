import type { BaseEngine } from '@/core/types';
import type { QueueManager } from '@/core/managers/queue.manager';

export function registerAllEngines(
  platformEngines: Record<string, BaseEngine>,
  queueManager: QueueManager
) {
  Object.entries(platformEngines).forEach(([keycard, engine]) => {
    queueManager.registerEngine(keycard, engine);
  });
}
