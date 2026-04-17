import type { BaseEngine, EngineResult, TaskContext } from 'kernel-script';

export class NoopEngine implements BaseEngine {
  keycard: string = 'NoopEngine';
  async execute(ctx: TaskContext): Promise<EngineResult> {
    const { task } = ctx;
    try {
      // For testing logic, use sleep instead of actual generate
      console.log(`Starting mock execution for task: ${task.id}`);

      for (let i = 0; i < 5; i++) {
        await ctx.sleep(1000); // Sleep 1s with context
        console.log(`Task ${task.id} progress: ${(i + 1) * 20}%`);
      }

      return {
        success: true,
        output: 'Mock output (test mode)',
      };
    } catch (e) {
      if (e instanceof Error && e.message === 'CANCELLED') {
        return { success: false, error: 'CANCELLED' };
      }
      return {
        success: false,
        error: e instanceof Error ? e.message : String(e),
      };
    }
  }

  cancel(_taskId: string): void {}
}

export const noopEngine = new NoopEngine();
