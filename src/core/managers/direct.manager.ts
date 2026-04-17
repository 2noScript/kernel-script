import { engineHub } from '@/core/hubs/engine.hub';
import { TaskContext } from '@/core/contexts/task.context';
import type { Task, EngineResult } from '@/core/types';

export class DirectManager {
  private abortControllers: Map<string, AbortController> = new Map();

  async execute(keycard: string, task: Task): Promise<EngineResult> {
    const engine = engineHub.get(keycard);
    if (!engine) {
      return { success: false, error: 'Platform not supported' };
    }

    const controller = new AbortController();
    this.abortControllers.set(task.id, controller);

    const ctx = new TaskContext(task, controller.signal);
    task.status = 'Running';

    try {
      const result = await engine.execute(ctx);

      if (result.success) {
        task.status = 'Completed';
        task.progress = 100;
      } else {
        task.status = 'Error';
        task.errorMessage = result.error;
      }

      task.output = result.output;
      return result;
    } catch (error) {
      const isCancelled =
        error instanceof Error && (error.name === 'AbortError' || error.message === 'CANCELLED');

      if (isCancelled) {
        task.status = 'Waiting';
      } else {
        task.status = 'Error';
        task.errorMessage = error instanceof Error ? error.message : String(error);
      }

      return { success: false, error: String(error) };
    } finally {
      this.abortControllers.delete(task.id);
    }
  }

  cancel(taskId: string): void {
    const controller = this.abortControllers.get(taskId);
    if (controller) {
      controller.abort();
      this.abortControllers.delete(taskId);
    }
  }

  isRunning(taskId: string): boolean {
    return this.abortControllers.has(taskId);
  }
}

let directManagerInstance: DirectManager | null = null;

export function getDirectManager(): DirectManager {
  if (!directManagerInstance) {
    directManagerInstance = new DirectManager();
  }
  return directManagerInstance;
}
