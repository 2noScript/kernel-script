import type { BaseEngine } from "@/kernel/engine";

export class EngineHub {
  private engines: Map<string, BaseEngine> = new Map();

  register(platformId: string, engine: BaseEngine): void {
    this.engines.set(platformId, engine);
  }

  get(platformId: string): BaseEngine | undefined {
    return this.engines.get(platformId);
  }

  getAll(): Map<string, BaseEngine> {
    return this.engines;
  }
}

export const engineHub = new EngineHub();
