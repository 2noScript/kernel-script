import { engineHub } from '@/core/hubs/engine.hub';
import { TaskContext } from '@/core/contexts/task.context.class';
import type { Task, EngineResult, DirectOptions } from '@/core/types';
import { persistenceManager } from '@/core/managers/persistence.manager';
export type { DirectOptions } from '@/core/types';

interface PlatformDirectOptions {
  debug?: boolean;
  debugLog?: (...args: unknown[]) => void;
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
  private runningTasks: Map<string, Task> = new Map();

  constructor(options: DirectOptions = {}) {
    this.defaultOptions = {
      onTasksUpdate: options.onTasksUpdate,
      onTaskComplete: options.onTaskComplete,
    };
  }

  private getDebugLog(keycard: string): (...args: unknown[]) => void {
    const options = this.getOptions(keycard);
    if (options.debugLog) {
      return options.debugLog;
    }
    return () => {};
  }

  private getOptions(keycard: string): PlatformDirectOptions {
    const platformSpecific = this.platformOptions.get(keycard) || [];
    const global = this.platformOptions.get('*') || [];
    const allOptions = [...platformSpecific, ...global];

    return {
      debug: allOptions.find((o) => o.debug !== undefined)?.debug ?? this.defaultOptions.debug,
      debugLog: allOptions.find((o) => o.debugLog)?.debugLog ?? this.defaultOptions.debugLog,
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
    this.getDebugLog(keycard)(`[DirectManager] START ${keycard}/${identifier} - Task ${task.id}`);
    const engine = engineHub.get(keycard);
    if (!engine) {
      return { success: false, error: 'Platform not supported' };
    }

    const options = this.getOptions(keycard);

    const controller = new AbortController();
    const abortKey = this.getAbortControllerKey(keycard, identifier, task.id);
    this.abortControllers.set(abortKey, controller);

    this.runningTasks.set(abortKey, task);

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
      this.runningTasks.delete(abortKey);
    }
  }

  stop(keycard: string, identifier: string, taskId: string): void {
    this.getDebugLog(keycard)(`[DirectManager] STOP ${keycard}/${identifier} - Task ${taskId}`);
    const abortKey = this.getAbortControllerKey(keycard, identifier, taskId);
    const controller = this.abortControllers.get(abortKey);
    if (controller) {
      controller.abort();
      this.abortControllers.delete(abortKey);
      this.runningTasks.delete(abortKey);
    }
  }

  isRunning(keycard: string, identifier: string, taskId: string): boolean {
    const abortKey = this.getAbortControllerKey(keycard, identifier, taskId);
    return this.abortControllers.has(abortKey);
  }

  getRunningTasks(keycard: string, identifier: string): Task[] {
    const tasks: Task[] = [];
    for (const [key, task] of this.runningTasks.entries()) {
      if (key.startsWith(`${keycard}__${identifier}__`)) {
        tasks.push(task);
      }
    }
    return tasks;
  }

  hasRunningTask(keycard: string, identifier: string): boolean {
    for (const key of this.runningTasks.keys()) {
      if (key.startsWith(`${keycard}__${identifier}__`)) {
        return true;
      }
    }
    return false;
  }

  async persistState(): Promise<void> {
    const states: Record<string, { isRunning: boolean }> = {};
    for (const key of this.runningTasks.keys()) {
      states[key] = { isRunning: true };
    }
    await persistenceManager.saveDirectStates(states);
  }

  async hydrate(): Promise<void> {
    const states = await persistenceManager.loadDirectStates();
    if (!states) return;

    for (const key in states) {
      const state = states[key];
      if (!state?.isRunning) continue;

      const [keycard, identifier, taskId] = key.split('__');
      if (!keycard || !identifier || !taskId) continue;

      const task = this.runningTasks.get(key);
      if (task) {
        task.status = 'Running';
      }
    }
  }

  async rehydrateTasks(): Promise<void> {
    for (const [key, task] of this.runningTasks.entries()) {
      if (task.status === 'Running') {
        task.status = 'Waiting';
      }
    }
    await this.persistState();
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
