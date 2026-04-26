import type { BaseEngine } from '@/core/common/types';
import { queueService } from '@/core/services/queue.service';

export function registerEngines(engines: BaseEngine[]) {
  engines.forEach((engine) => {
    queueService.registerEngine(engine);
  });
}

export type EngineRegistry = {
  register: (engine: BaseEngine) => void;
  get: (keycard: string) => BaseEngine | undefined;
  listAll: () => string[];
  getEngines: () => BaseEngine[];
};

export function createEngineRegistry(): EngineRegistry {
  const engines: Map<string, BaseEngine> = new Map();
  return {
    register(engine: BaseEngine) {
      if (!engine.keycard) {
        throw new Error("Error: Engine must have a 'keycard' property.");
      }

      if (engines.has(engine.keycard)) {
        throw new Error(`Error: Keycard "${engine.keycard}" is already in use by another engine.`);
      }

      engines.set(engine.keycard, engine);
    },

    get(keycard: string) {
      return engines.get(keycard);
    },

    listAll() {
      return Array.from(engines.keys());
    },

    getEngines(): BaseEngine[] {
      return Array.from(engines.values());
    },
  };
}
