import { engineHub } from '@/core/common/engine-hub';
import { TaskContext } from '@/core/common/task.context';
import { emitEvent, EVENTS } from '@/core/events/emitter';
import type { Task, EngineResult } from '@/core/common/types';

export class DirectService {
  private abortControllers: Map<string, AbortController> = new Map();

  private getAbortKey(keycard: string, identifier: string, taskId: string): string {
    return `${keycard}__${identifier}__${taskId}`;
  }

  async execute(keycard: string, identifier: string, task: Task): Promise<EngineResult> {
    const engine = engineHub.get(keycard);
    if (!engine) {
      return { success: false, error: 'Platform not supported' };
    }

    const abortKey = this.getAbortKey(keycard, identifier, task.id);
    const controller = new AbortController();
    this.abortControllers.set(abortKey, controller);

    const updateTask = (updates: Partial<Task>) => {
      const updatedTask = { ...task, ...updates, id: task.id } as Task;
      // emitEvent(EVENTS.TASK_UPDATED, { keycard, identifier, task: updatedTask });
    };

    try {
      updateTask({ status: 'Running' });

      const ctx = new TaskContext(task, controller.signal);
      const result = await engine.execute(ctx);

      if (result.success) {
        updateTask({ status: 'Completed', progress: 100, result });
      } else {
        updateTask({ status: 'Error', errorMessage: result.error, result });
      }

      return result;
    } catch (error) {
      const isCancelled =
        error instanceof Error && (error.name === 'AbortError' || error.message === 'CANCELLED');

      if (isCancelled) {
        updateTask({ status: 'Waiting' });
      } else {
        const errorMsg = error instanceof Error ? error.message : String(error);
        updateTask({ status: 'Error', errorMessage: errorMsg });
      }

      return {
        success: false,
        error: isCancelled ? 'CANCELLED' : String(error),
      };
    } finally {
      this.abortControllers.delete(abortKey);
    }
  }

  stop(keycard: string, identifier: string, taskId: string): void {
    const abortKey = this.getAbortKey(keycard, identifier, taskId);
    const controller = this.abortControllers.get(abortKey);
    if (controller) {
      controller.abort();
      this.abortControllers.delete(abortKey);
    }
  }

  isRunning(keycard: string, identifier: string, taskId: string): boolean {
    const abortKey = this.getAbortKey(keycard, identifier, taskId);
    return this.abortControllers.has(abortKey);
  }
}

export const directService = new DirectService();
