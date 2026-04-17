import { engineHub } from '@/core/hubs/engine.hub';
import { TaskContext } from '@/core/contexts/task.context';
import type { Task, EngineResult, DirectOptions } from '@/core/types';

export class DirectManager {
  private abortControllers: Map<string, AbortController> = new Map();
  private options: DirectOptions;

  constructor(options: DirectOptions = {}) {
    this.options = options;
  }

  private debugLog(...args: unknown[]): void {
    if (this.options.debug) {
      console.log(...args);
    }
  }

  private getAbortControllerKey(keycard: string, identifier: string, taskId: string): string {
    return `${keycard}__${identifier}__${taskId}`;
  }

  async start(keycard: string, identifier: string, task: Task): Promise<EngineResult> {
    this.debugLog(`[DirectManager] START ${keycard}/${identifier} - Task ${task.id}`);
    const engine = engineHub.get(keycard);
    if (!engine) {
      return { success: false, error: 'Platform not supported' };
    }

    const controller = new AbortController();
    const abortKey = this.getAbortControllerKey(keycard, identifier, task.id);
    this.abortControllers.set(abortKey, controller);

    const ctx = new TaskContext(task, controller.signal);
    task.status = 'Running';
    this.options.onTasksUpdate?.(keycard, identifier, task);

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
      this.options.onTasksUpdate?.(keycard, identifier, task);
      this.options.onTaskComplete?.(keycard, identifier, task.id, result);
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

      this.options.onTasksUpdate?.(keycard, identifier, task);
      this.options.onTaskComplete?.(keycard, identifier, task.id, {
        success: false,
        error: String(error),
      });
      return { success: false, error: String(error) };
    } finally {
      this.abortControllers.delete(abortKey);
    }
  }

  stop(keycard: string, identifier: string, taskId: string): void {
    this.debugLog(`[DirectManager] STOP ${keycard}/${identifier} - Task ${taskId}`);
    const abortKey = this.getAbortControllerKey(keycard, identifier, taskId);
    const controller = this.abortControllers.get(abortKey);
    if (controller) {
      controller.abort();
      this.abortControllers.delete(abortKey);
    }
  }

  isRunning(keycard: string, identifier: string, taskId: string): boolean {
    const abortKey = this.getAbortControllerKey(keycard, identifier, taskId);
    return this.abortControllers.has(abortKey);
  }
}

let directManagerInstance: DirectManager | null = null;
let directManagerOptions: DirectOptions | null = null;

export function getDirectManager(options?: DirectOptions): DirectManager {
  if (!directManagerInstance) {
    directManagerOptions = options || {};
    directManagerInstance = new DirectManager(directManagerOptions);
  } else if (options) {
    directManagerOptions = options;
    directManagerInstance = new DirectManager(directManagerOptions);
  }
  return directManagerInstance;
}
