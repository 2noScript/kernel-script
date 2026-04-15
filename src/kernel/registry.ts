import type { BaseEngine } from "@/kernel/engine";
import type { QueueManager } from "@/kernel/queue-manager";



export function registerAllEngines(
  platformEngines: Record<string, BaseEngine>,
  queueManager: QueueManager,
) {
  Object.entries(platformEngines).forEach(([keycard, engine]) => {
    queueManager.registerEngine(keycard, engine);
  });
}
