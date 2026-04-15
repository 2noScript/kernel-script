import type { BaseEngine } from '@/core/engine';
import type { QueueManager } from '@/core/queue-manager';

export function registerAllEngines(
  platformEngines: Record<string, BaseEngine>,
  queueManager: QueueManager
) {
  Object.entries(platformEngines).forEach(([keycard, engine]) => {
    queueManager.registerEngine(keycard, engine);
  });
}
