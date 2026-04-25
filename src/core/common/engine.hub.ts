import type { BaseEngine } from '@/core/common/types';

export class EngineHub {
  private engines: Map<string, BaseEngine> = new Map();

  register(engine: BaseEngine): void {
    if (!engine.keycard) {
      throw new Error("Registration failed: Engine must have a 'keycard'.");
    }

    if (this.engines.has(engine.keycard)) {
      throw new Error(
        `Registration failed: An engine with keycard "${engine.keycard}" is already registered.`
      );
    }

    this.engines.set(engine.keycard, engine);
  }

  get(keycard: string): BaseEngine | undefined {
    return this.engines.get(keycard);
  }

  getAll(): Map<string, BaseEngine> {
    return this.engines;
  }

  getKeys(): string[] {
    return Array.from(this.engines.keys());
  }
}

export const engineHub = new EngineHub();
