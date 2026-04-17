import { engineHub } from '@/core/hubs/engine.hub';
import { TaskContext } from '@/core/contexts/task.context';
import type { Task, EngineResult, DirectOptions } from '@/core/types';
export type { DirectOptions } from '@/core/types';

interface PlatformDirectOptions {
  debug?: boolean;
  onTasksUpdate?: (keycard: string, identifier: string, task: Task) => void;
  onTaskComplete?: (
    keycard: string,
    identifier: string,
    taskId: string,
    result: EngineResult
  ) => void;
}

export class DirectManager {
  private abortControllers: Map<string, AbortController> = new Map();
  private platformOptions: Map<string, PlatformDirectOptions[]> = new Map();
  private defaultOptions: PlatformDirectOptions;

  constructor(options: DirectOptions = {}) {
    this.defaultOptions = {
      debug: options.debug,
      onTasksUpdate: options.onTasksUpdate,
      onTaskComplete: options.onTaskComplete,
    };
  }

  private debugLog(...args: unknown[]): void {
    if (this.defaultOptions.debug) {
      console.log(...args);
    }
  }

  private getOptions(keycard: string): PlatformDirectOptions {
    const platformSpecific = this.platformOptions.get(keycard) || [];
    const global = this.platformOptions.get('*') || [];
    const allOptions = [...platformSpecific, ...global];

    return {
      debug: allOptions.find((o) => o.debug !== undefined)?.debug ?? this.defaultOptions.debug,
      onTasksUpdate:
        allOptions.find((o) => o.onTasksUpdate)?.onTasksUpdate ?? this.defaultOptions.onTasksUpdate,
      onTaskComplete:
        allOptions.find((o) => o.onTaskComplete)?.onTaskComplete ??
        this.defaultOptions.onTaskComplete,
    };
  }

  registerOptions(keycard: string, options: Partial<PlatformDirectOptions>): () => void {
    if (!this.platformOptions.has(keycard)) {
      this.platformOptions.set(keycard, []);
    }
    this.platformOptions.get(keycard)!.push(options as PlatformDirectOptions);

    return () => this.unregisterOptions(keycard, options as PlatformDirectOptions);
  }

  unregisterOptions(keycard: string, options: PlatformDirectOptions): void {
    const list = this.platformOptions.get(keycard);
    if (list) {
      const index = list.indexOf(options);
      if (index !== -1) {
        list.splice(index, 1);
      }
      if (list.length === 0) {
        this.platformOptions.delete(keycard);
      }
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

    const options = this.getOptions(keycard);

    const controller = new AbortController();
    const abortKey = this.getAbortControllerKey(keycard, identifier, task.id);
    this.abortControllers.set(abortKey, controller);

    const ctx = new TaskContext(task, controller.signal);
    task.status = 'Running';
    options.onTasksUpdate?.(keycard, identifier, task);

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
      options.onTasksUpdate?.(keycard, identifier, task);
      options.onTaskComplete?.(keycard, identifier, task.id, result);
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

      options.onTasksUpdate?.(keycard, identifier, task);
      options.onTaskComplete?.(keycard, identifier, task.id, {
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
