import { engineHub } from '@/core/common/engine.hub';
import { TaskContext } from '@/core/common/task.context';
import type { Task, EngineResult } from '@/core/common/types';

export interface DirectCallbacks {
  onTaskUpdate?: (keycard: string, identifier: string, task: Task) => void;
  onTaskComplete?: (
    keycard: string,
    identifier: string,
    taskId: string,
    result: EngineResult
  ) => void;
}

export class DirectService {
  private abortControllers: Map<string, AbortController> = new Map();
  private callbacks: DirectCallbacks = {};

  registerCallbacks(callbacks: DirectCallbacks): void {
    this.callbacks = callbacks;
  }

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
      this.callbacks.onTaskUpdate?.(keycard, identifier, updatedTask);
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

      this.callbacks.onTaskComplete?.(keycard, identifier, task.id, result);
      return result;
    } catch (error) {
      const isCancelled =
        error instanceof Error && (error.name === 'AbortError' || error.message === 'CANCELLED');

      if (isCancelled) {
        updateTask({ status: 'Waiting' });
        this.callbacks.onTaskComplete?.(keycard, identifier, task.id, {
          success: false,
          error: 'CANCELLED',
        });
      } else {
        const errorMsg = error instanceof Error ? error.message : String(error);
        updateTask({ status: 'Error', errorMessage: errorMsg });
        this.callbacks.onTaskComplete?.(keycard, identifier, task.id, {
          success: false,
          error: errorMsg,
        });
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
