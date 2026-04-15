import type { Task } from '@/core/types';
import type { QueueEntry } from '@/core/queue/queue-state';
import type { SerializedQueueState } from '@/core/persistence-manager';

export interface QueuePersistenceDeps {
  entry: QueueEntry;
  keycard: string;
  identifier: string;
  key: string;
  runningQueues: Set<string>;
  processTask: (task: Task) => Promise<any>;
  updateTasks: (tasks: Task[]) => void;
  persistState: () => Promise<void>;
}

export const createQueuePersistence = (deps: QueuePersistenceDeps) => {
  const { entry, keycard, identifier, key, runningQueues, processTask, updateTasks, persistState } =
    deps;

  return {
    async hydrate(states: Record<string, SerializedQueueState>) {
      const state = states[key];
      if (!state) return;

      if (state.isPaused) {
        entry.queue.pause();
      } else {
        entry.queue.start();
      }

      if (state.isRunning) {
        runningQueues.add(key);
      }
    },

    async rehydrate() {
      const tasks = entry.tasks;
      if (!tasks || tasks.length === 0) return;

      for (const task of tasks) {
        if (task.status === 'Running') {
          task.status = 'Waiting';
        }

        if (task.status === 'Waiting' && task.id && !entry.queuedIds.has(task.id)) {
          task.isQueued = true;
          entry.queuedIds.add(task.id);
          entry.queue.add(() => processTask(task));
        }
      }

      updateTasks(tasks);
      await persistState();
    },
  };
};
