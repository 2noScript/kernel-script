import type { Task, EngineResult } from '@/core/types';
import type { QueueEntry } from '@/core/queue/queue-state';
import { engineHub } from '@/core/engine-hub';
import { TaskContext } from '@/core/task-context';
import { sleep } from '@/core/helper';

export interface TaskExecutorDeps {
  entry: QueueEntry;
  keycard: string;
  identifier: string;
  persistState: () => Promise<void>;
  notifyTasksUpdate: (tasks: Task[]) => void;
  notifyStatusChange: () => void;
  debug: boolean;
  debugLog: (...args: unknown[]) => void;
}

export const createTaskExecutor = (deps: TaskExecutorDeps) => {
  const {
    entry,
    keycard,
    identifier,
    persistState,
    notifyTasksUpdate,
    notifyStatusChange,
    debug,
    debugLog,
  } = deps;

  return async (
    task: Task,
    abortControllers: Map<string, AbortController>
  ): Promise<EngineResult> => {
    const engine = engineHub.get(keycard);
    if (!engine) {
      console.warn(`No engine registered for platform: ${keycard}, skipping task: ${task.id}`);
      throw new Error('Platform not supported');
    }

    const taskIndex = entry.tasks.findIndex((t) => t.id === task.id);
    if (taskIndex === -1) {
      debugLog(`[QueueManager] Task ${task.id} was removed. Skipping execution.`);
      throw new Error('Task not found');
    }

    if (task.isFlagged) {
      debugLog(`[QueueManager] Task ${task.id} is flagged. Skipping.`);
      entry.tasks[taskIndex] = {
        ...entry.tasks[taskIndex],
        status: 'Skipped',
        isQueued: false,
      };
      notifyTasksUpdate(entry.tasks);
      throw new Error('Task is flagged');
    }

    const currentTask = entry.tasks[taskIndex]!;
    entry.tasks[taskIndex] = {
      ...currentTask,
      status: 'Running',
      isQueued: true,
    };
    notifyTasksUpdate(entry.tasks);
    await persistState();

    const { delayMin, delayMax } = entry.taskConfig || { delayMin: 0, delayMax: 0 };
    if (delayMax > 0) {
      const delayMs = Math.floor(Math.random() * (delayMax - delayMin + 1) + delayMin) * 1000;
      debugLog(`[QueueManager] Delaying task ${task.id} for ${delayMs}ms...`);
      await sleep(delayMs, abortControllers.get(keycard)?.signal);
    }

    const controller = new AbortController();
    abortControllers.set(task.id, controller);
    const ctx = new TaskContext(task, controller.signal);

    try {
      const result = await Promise.race([
        engine.execute(ctx),
        new Promise<never>((_, reject) => {
          if (ctx.signal?.aborted) {
            reject(new Error('CANCELLED'));
          }
          ctx.signal?.addEventListener(
            'abort',
            () => {
              reject(new Error('CANCELLED'));
            },
            { once: true }
          );
        }),
      ]);

      const idx = entry.tasks.findIndex((t) => t.id === task.id);
      if (idx !== -1) {
        const finTask = entry.tasks[idx];
        if (!finTask) return { success: false, error: 'Task not found' };

        if (finTask.status !== 'Running') {
          debugLog(
            `Task ${task.id} finished but its status was already changed to ${finTask.status}. Bailing out.`
          );
          return { success: false, error: 'Task status changed' };
        }

        if (result.error === 'CANCELLED') {
          entry.tasks[idx] = {
            ...finTask,
            status: 'Waiting',
            isQueued: false,
          };
        } else {
          entry.tasks[idx] = {
            ...finTask,
            status: result.success ? 'Completed' : 'Error',
            output: result.output,
            errorMessage: result.error,
            progress: result.success ? 100 : 0,
            isQueued: false,
          };

          if (result.success) {
            entry.consecutiveErrors = 0;
          } else {
            entry.consecutiveErrors = (entry.consecutiveErrors || 0) + 1;
          }
        }
        notifyTasksUpdate(entry.tasks);
      }

      return result;
    } catch (error) {
      const idx = entry.tasks.findIndex((t) => t.id === task.id);
      const errorTask = entry.tasks[idx];
      if (idx !== -1 && errorTask) {
        const isCancelled =
          error instanceof Error && (error.name === 'AbortError' || error.message === 'CANCELLED');

        if (isCancelled) {
          entry.tasks[idx] = {
            ...errorTask,
            status: 'Waiting',
            isQueued: false,
          };
        } else {
          entry.tasks[idx] = {
            ...errorTask,
            status: 'Error',
            errorMessage: error instanceof Error ? error.message : String(error),
            isQueued: false,
          };
          entry.consecutiveErrors = (entry.consecutiveErrors || 0) + 1;
        }
        notifyTasksUpdate(entry.tasks);
      }

      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    } finally {
      abortControllers.delete(task.id);
      entry.queuedIds.delete(task.id);
      notifyStatusChange();

      const maxErrors = entry.taskConfig?.stopOnErrorCount || 0;
      if (maxErrors > 0 && (entry.consecutiveErrors || 0) >= maxErrors) {
        console.warn(
          `[QueueManager] Stopping queue due to ${entry.consecutiveErrors} consecutive errors.`
        );
        entry.consecutiveErrors = 0;
        return { success: false, error: 'Max errors reached' };
      }
    }
  };
};
