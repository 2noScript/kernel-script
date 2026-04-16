import type { BaseEngine } from '@/core/types';

export class EngineHub {
  private engines: Map<string, BaseEngine> = new Map();

  register(keycard: string, engine: BaseEngine): void {
    this.engines.set(keycard, engine);
  }

  get(keycard: string): BaseEngine | undefined {
    return this.engines.get(keycard);
  }

  getAll(): Map<string, BaseEngine> {
    return this.engines;
  }
}

export const engineHub = new EngineHub();
