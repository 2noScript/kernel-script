import type { BaseEngine, EngineResult, TaskContext } from "kernel-script";

export class NoopEngine implements BaseEngine {
  keycard: string="NoopEngine";
  async execute(_ctx: TaskContext): Promise<EngineResult> {
    return {
      success: false,
      error: "Engine not implemented",
    };
  }

  cancel(_taskId: string): void {}

}

export const noopEngine = new NoopEngine();