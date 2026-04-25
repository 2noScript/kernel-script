import PQueue from 'p-queue';
import type { Task, TaskConfig } from '@/core/types';
import type { BaseEngine, EngineResult } from '@/core/types';
import { persistenceManager, type SerializedQueueState } from '@/core/managers/persistence.manager';
import { engineHub } from '@/core/hubs/engine.hub';
import { TaskContext } from '@/core/contexts/task.context';
import { sleep } from '@/core/helper';
import { backgroundDb } from '@/core/storage/background-db';

export interface QueueStatus {
  size: number;
  pending: number;
  isRunning: boolean;
}

export interface QueueOptions {
  storageKey?: string;
  defaultConcurrency?: number;
  onTaskStart?: (keycard: string, identifier: string, taskId: string) => void;
  onTaskComplete?: (
    keycard: string,
    identifier: string,
    taskId: string,
    result: EngineResult
  ) => void;
  onQueueEmpty?: (keycard: string, identifier: string) => void;
  onPendingCountChange?: (keycard: string, identifier: string, count: number) => void;
  onTasksUpdate?: (keycard: string, identifier: string, tasks: Task[], status: QueueStatus) => void;
  debugLog: (...args: unknown[]) => void;
}

interface QueueEntry {
  queue: PQueue;
  tasks: Task[];
  queuedIds: Set<string>;
  consecutiveErrors: number;
  taskConfig: TaskConfig;
  selectedIds: string[];
}

export class QueueManager {
  private queues: Map<string, QueueEntry> = new Map();
  private options: Partial<QueueOptions>;
  private runningQueues: Set<string> = new Set();
  private concurrencyMap: Map<string, number> = new Map();
  private abortControllers: Map<string, AbortController> = new Map();

  constructor(options: Partial<QueueOptions>) {
    this.options = options;
  }

  private getDebugLog(): (...args: unknown[]) => void {
    const debugLog = this.options.debugLog;
    if (debugLog) {
      return debugLog;
    }
    return () => {};
  }

  private logQueueState(keycard: string, identifier: string, action: string): void {
    const debug = this.getDebugLog();
    const key = this.getQueueKey(keycard, identifier);
    const entry = this.queues.get(key);
    if (!entry) {
      debug(`[Queue] ${action} - Queue not found for key: ${key}`);
      return;
    }
    debug(
      `[Queue] ${action} | Key: ${key} | Tasks: ${entry.tasks.length} | Queue size: ${entry.queue.size} | Pending: ${entry.queue.pending} | isRunning: ${!entry.queue.isPaused}`
    );
    console.table(entry.tasks);
  }

  private getQueueKey(keycard: string, identifier: string): string {
    return `${keycard}__${identifier}`;
  }

  registerOptions(options: Partial<QueueOptions>) {
    this.options = {
      ...this.options,
      ...options,
    };
  }

  unregisterOptions(options: QueueOptions): void {}

  private getOrCreateQueue(keycard: string, identifier: string): QueueEntry {
    const key = this.getQueueKey(keycard, identifier);

    if (!this.queues.has(key)) {
      const concurrency = this.options.defaultConcurrency;

      const queue = new PQueue({
        concurrency,
        autoStart: false,
      });

      const entry: QueueEntry = {
        queue,
        tasks: [],
        queuedIds: new Set(),
        consecutiveErrors: 0,
        taskConfig: {
          threads: concurrency || 1,
          delayMin: 1,
          delayMax: 15,
          stopOnErrorCount: 0,
        },
        selectedIds: [],
      };

      // Register 'idle' listener to auto-stop when all tasks are finished
      queue.on('idle', () => {
        if (this.runningQueues.has(key)) {
          this.autoStopQueue(keycard, identifier);
        }
      });

      this.queues.set(key, entry);
    }

    // Bug Fix: Always check and update concurrency if it has changed
    const entry = this.queues.get(key)!;
    const currentConcurrency =
      this.concurrencyMap.get(keycard) ?? this.options.defaultConcurrency ?? 1;
    if (entry.queue.concurrency !== currentConcurrency) {
      entry.queue.concurrency = currentConcurrency;
    }

    return entry;
  }

  setConcurrency(keycard: string, concurrency: number): void {
    this.concurrencyMap.set(keycard, concurrency);
    // Update all active queues for this platform
    for (const [key, entry] of this.queues.entries()) {
      if (key.startsWith(keycard)) {
        entry.queue.concurrency = concurrency;
      }
    }
  }

  registerEngine(engine: BaseEngine): void {
    engineHub.register(engine);
  }

  async add(keycard: string, identifier: string, task: Task): Promise<void> {
    const entry = this.getOrCreateQueue(keycard, identifier);
    const { queue, tasks, queuedIds } = entry;

    const exists = tasks.find((t) => t.id === task.id);
    const updatedTask = { ...task, status: 'Draft' as const, isQueued: false };

    if (!exists) {
      tasks.push(updatedTask);
    } else {
      const idx = tasks.indexOf(exists);
      tasks[idx] = updatedTask;
    }

    this.updateTasks(keycard, identifier, tasks);
    this.notifyStatusChange(keycard, identifier);
    this.logQueueState(keycard, identifier, 'ADD');
  }

  async addMany(keycard: string, identifier: string, newTasks: Task[]): Promise<void> {
    this.getDebugLog()(`[DEBUG] ADD_MANY ${newTasks.length} tasks to ${keycard}/${identifier}`);
    const entry = this.getOrCreateQueue(keycard, identifier);
    const { queue, tasks, queuedIds } = entry;

    for (const task of newTasks) {
      const exists = tasks.find((t) => t.id === task.id);
      const updatedTask = { ...task };

      if (!exists) {
        tasks.push(updatedTask);
      } else {
        const idx = tasks.indexOf(exists);
        tasks[idx] = updatedTask;
      }

      // Only add to PQueue if it's in Waiting status and not already queued
      if (updatedTask.status === 'Waiting' && !queuedIds.has(updatedTask.id)) {
        updatedTask.isQueued = true;
        queuedIds.add(updatedTask.id);
        queue.add(() => this.processTask(keycard, identifier, updatedTask));
      }
    }

    this.updateTasks(keycard, identifier, tasks);
    this.notifyStatusChange(keycard, identifier);
    this.logQueueState(keycard, identifier, 'ADD_MANY');
  }

  async start(keycard: string, identifier: string): Promise<void> {
    this.getDebugLog()(`[DEBUG] START queue ${keycard}/${identifier}`);
    const key = this.getQueueKey(keycard, identifier);
    const entry = this.queues.get(key);
    if (entry) {
      const { queue, tasks, queuedIds } = entry;

      // Re-enqueue any Waiting tasks that are not currently in the PQueue
      // This is necessary if the queue was previously stopped (which results in halted tasks)
      let addedAny = false;
      for (const task of tasks) {
        if (task.status === 'Waiting' && !queuedIds.has(task.id)) {
          task.isQueued = true;
          queuedIds.add(task.id);
          queue.add(() => this.processTask(keycard, identifier, task));
          addedAny = true;
        }
      }

      this.runningQueues.add(key);
      queue.start();

      if (addedAny) {
        this.updateTasks(keycard, identifier, tasks);
      }

      this.notifyStatusChange(keycard, identifier);
      this.logQueueState(keycard, identifier, 'START');
      await this.persistState();
    }
  }

  async stop(keycard: string, identifier: string): Promise<void> {
    this.getDebugLog()(`[DEBUG] STOP queue ${keycard}/${identifier}`);
    const key = this.getQueueKey(keycard, identifier);
    const entry = this.queues.get(key);
    if (entry) {
      entry.queue.pause();

      // Clear the underlying queue to prevent the halted task from being pushed to the back of the line when restarted
      entry.queue.clear();
      entry.queuedIds.clear();
      entry.tasks.forEach((t) => {
        if (t.status === 'Waiting') t.isQueued = false;
      });

      this.runningQueues.delete(key);

      // Find all running tasks and halt them immediately
      const runningTasks = entry.tasks.filter((t) => t.status === 'Running');
      for (const t of runningTasks) {
        try {
          await this.haltTask(keycard, identifier, t.id);
        } catch (e) {
          // Ignore abort errors when halting tasks during stop
        }
      }

      await this.persistState();
      this.notifyStatusChange(keycard, identifier);
      this.logQueueState(keycard, identifier, 'STOP');
    }
  }

  async resume(keycard: string, identifier: string): Promise<void> {
    this.getDebugLog()(`[DEBUG] RESUME queue ${keycard}/${identifier}`);
    const key = this.getQueueKey(keycard, identifier);
    const entry = this.queues.get(key);
    if (entry) {
      entry.queue.start();
      await this.persistState();
      this.logQueueState(keycard, identifier, 'RESUME');
    }
  }

  async clear(keycard: string, identifier: string): Promise<void> {
    this.getDebugLog()(`[DEBUG] CLEAR queue ${keycard}/${identifier}`);
    const key = this.getQueueKey(keycard, identifier);
    const entry = this.queues.get(key);

    if (entry) {
      entry.queue.clear();
      entry.tasks = [];
      entry.queuedIds.clear();
      this.updateTasks(keycard, identifier, []);
    }

    this.notifyStatusChange(keycard, identifier);
  }

  /**
   * Immediately halts the engine execution for a task and resets its status to Waiting.
   * Does NOT remove the task from the list.
   */
  async haltTask(keycard: string, identifier: string, taskId: string): Promise<void> {
    // Trigger AbortController if it exists
    const controller = this.abortControllers.get(taskId);
    if (controller) {
      controller.abort();
      this.abortControllers.delete(taskId);
    }

    const key = this.getQueueKey(keycard, identifier);
    const entry = this.queues.get(key);
    if (entry) {
      const idx = entry.tasks.findIndex((t) => t.id === taskId);
      const currentTask = entry.tasks[idx];
      if (idx !== -1 && currentTask && currentTask.status === 'Running') {
        entry.tasks[idx] = {
          ...currentTask,
          status: 'Waiting',
          isQueued: false,
        };
        entry.queuedIds.delete(taskId);
        this.updateTasks(keycard, identifier, entry.tasks);
      }
    }

    this.notifyStatusChange(keycard, identifier);
  }

  /**
   * Stops execution AND removes the task from the project entirely.
   */
  async cancelTask(keycard: string, identifier: string, taskId: string): Promise<void> {
    this.getDebugLog()(`[DEBUG] CANCEL_TASK ${taskId} from ${keycard}/${identifier}`);
    // Trigger AbortController if it exists
    const controller = this.abortControllers.get(taskId);
    if (controller) {
      controller.abort();
      this.abortControllers.delete(taskId);
    }

    const key = this.getQueueKey(keycard, identifier);
    const entry = this.queues.get(key);
    if (entry) {
      entry.tasks = entry.tasks.filter((t) => t.id !== taskId);
      entry.queuedIds.delete(taskId);
      this.updateTasks(keycard, identifier, entry.tasks);
    }

    this.notifyStatusChange(keycard, identifier);
  }

  getStatus(keycard: string, identifier: string): QueueStatus {
    this.getDebugLog()(`[DEBUG] GET_STATUS ${keycard}/${identifier}`);
    const key = this.getQueueKey(keycard, identifier);
    const entry = this.queues.get(key);

    // Accurate logic: derive size and pending directly from the ground truth 'tasks' array.
    // The internal PQueue doesn't support immediate deletion of queued items, so its size can be stale.
    const activeTasks = entry?.tasks || [];
    const size = activeTasks.filter((t) => t.status === 'Waiting' && t.isQueued).length;
    const pending = activeTasks.filter((t) => t.status === 'Running').length;

    return {
      size,
      pending,
      isRunning: !entry?.queue.isPaused || this.runningQueues.has(key),
    };
  }

  getTasks(keycard: string, identifier: string): Task[] {
    const key = this.getQueueKey(keycard, identifier);
    const entry = this.queues.get(key);
    const tasks = entry?.tasks || [];
    this.getDebugLog()(`[DEBUG] GET_TASKS ${keycard}/${identifier}, count: ${tasks.length}`);
    return tasks;
  }

  private updateTasks(keycard: string, identifier: string, tasks: Task[]): void {
    backgroundDb.saveTasks(keycard, identifier, tasks);
    this.notifyTasksUpdate(keycard, identifier, tasks);
  }

  private async processTask(keycard: string, identifier: string, task: Task): Promise<void> {
    const engine = engineHub.get(keycard);
    const key = this.getQueueKey(keycard, identifier);
    const entry = this.queues.get(key);

    if (!engine) {
      console.warn(`No engine registered for platform: ${keycard}, skipping task: ${task.id}`);
      if (entry) {
        const taskIndex = entry.tasks.findIndex((t) => t.id === task.id);
        const taskEntry = entry.tasks[taskIndex];
        if (taskIndex !== -1 && taskEntry) {
          entry.tasks[taskIndex] = {
            ...taskEntry,
            status: 'Error',
            errorMessage: 'Platform not supported',
          };
          this.updateTasks(keycard, identifier, entry.tasks);
        }
      }
      this.notifyStatusChange(keycard, identifier);
      this.notifyTasksUpdate(keycard, identifier, entry?.tasks || []);
      return;
    }

    if (!entry) {
      console.error(`Queue entry not found for key: ${key}`);
      return;
    }

    const taskIndex = entry.tasks.findIndex((t) => t.id === task.id);
    if (taskIndex === -1) {
      this.getDebugLog()(`[QueueManager] Task ${task.id} was removed. Skipping execution.`);
      return;
    }

    const currentTask = entry.tasks[taskIndex]!;
    entry.tasks[taskIndex] = {
      ...currentTask,
      status: 'Running',
      isQueued: true,
    };
    this.updateTasks(keycard, identifier, entry.tasks);
    await this.persistState();

    // Respect randomized delay before starting execution
    const { delayMin, delayMax } = entry.taskConfig || {
      delayMin: 0,
      delayMax: 0,
    };

    // Create AbortController BEFORE sleep so it can be aborted during delay
    const controller = new AbortController();
    this.abortControllers.set(task.id, controller);

    if (delayMax > 0) {
      const delayMs = Math.floor(Math.random() * (delayMax - delayMin + 1) + delayMin) * 1000;
      this.getDebugLog()(`[QueueManager] Delaying task ${task.id} for ${delayMs}ms...`);
      try {
        await sleep(delayMs, controller.signal);
      } catch (err) {
        if (err instanceof Error && err.message === 'CANCELLED') {
          this.getDebugLog()(`[QueueManager] Task ${task.id} cancelled during delay`);
          entry.tasks[taskIndex] = {
            ...currentTask,
            status: 'Waiting',
            isQueued: false,
          };
          this.updateTasks(keycard, identifier, entry.tasks);
          this.abortControllers.delete(task.id);
          entry.queuedIds.delete(task.id);
          this.notifyStatusChange(keycard, identifier);
          this.notifyTasksUpdate(keycard, identifier, entry.tasks);
          return;
        }
        throw err;
      }
    }

    this.logQueueState(keycard, identifier, `PROCESS_START ${task.id}`);

    this.options.onTaskStart?.(keycard, identifier, task.id);
    this.notifyTasksUpdate(keycard, identifier, entry.tasks);

    // Create TaskContext for this run
    const ctx = new TaskContext(task, controller.signal);

    try {
      // PROMISE RACE: The manager controls the death of the task from the OUTSIDE.
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
        if (!finTask) return;

        // --- KILL PROCESS GUARD ---
        // If the status is no longer "Running", it means a Stop/Reset command
        // changed the state while we were waiting. We MUST bail out now to
        // avoid overwriting the manual state change.
        if (finTask.status !== 'Running') {
          this.getDebugLog()(
            `Task ${task.id} finished but its status was already changed to ${finTask.status}. Bailing out.`
          );
          return;
        }

        // If it was cancelled, reset to Waiting instead of Error/Completed
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
        }
        this.updateTasks(keycard, identifier, entry.tasks);
      }

      this.options.onTaskComplete?.(keycard, identifier, task.id, result);
    } catch (error) {
      const idx = entry.tasks.findIndex((t) => t.id === task.id);
      const errorTask = entry.tasks[idx];
      if (idx !== -1 && errorTask) {
        // Handle AbortError or custom CANCELLED error
        const isCancelled =
          error instanceof Error && (error.name === 'AbortError' || error.message === 'CANCELLED');

        if (isCancelled) {
          entry.tasks[idx] = {
            ...errorTask,
            status: 'Waiting',
            isQueued: false,
          };
        } else {
          const errorMsg = error instanceof Error ? error.message : String(error);
          entry.tasks[idx] = {
            ...errorTask,
            status: 'Error',
            errorMessage: errorMsg,
            isQueued: false,
          };

          entry.consecutiveErrors = (entry.consecutiveErrors || 0) + 1;
        }
        this.updateTasks(keycard, identifier, entry.tasks);
      }

      this.options.onTaskComplete?.(keycard, identifier, task.id, {
        success: false,
        error: String(error),
      });
    } finally {
      this.abortControllers.delete(task.id);
      entry.queuedIds.delete(task.id);
      this.notifyStatusChange(keycard, identifier);
      this.notifyTasksUpdate(keycard, identifier, entry.tasks);

      const maxErrors = entry.taskConfig?.stopOnErrorCount || 0;
      if (maxErrors > 0 && (entry.consecutiveErrors || 0) >= maxErrors) {
        console.warn(
          `[QueueManager] Stopping queue due to ${entry.consecutiveErrors} consecutive errors.`
        );
        this.stop(keycard, identifier);
        entry.consecutiveErrors = 0; // reset so it doesn't immediately stop if manually restarted
      }
    }

    this.logQueueState(keycard, identifier, `PROCESS_END ${task.id}`);
  }

  private async autoStopQueue(keycard: string, identifier: string): Promise<void> {
    const key = this.getQueueKey(keycard, identifier);
    const entry = this.queues.get(key);
    if (entry) {
      this.runningQueues.delete(key);
      entry.queue.pause();
      await this.persistState();

      this.notifyStatusChange(keycard, identifier);
      this.notifyTasksUpdate(keycard, identifier, entry.tasks);

      this.options.onQueueEmpty?.(keycard, identifier);
    }
  }

  private notifyStatusChange(keycard: string, identifier: string): void {
    const key = this.getQueueKey(keycard, identifier);
    const entry = this.queues.get(key);
    const count = (entry?.queue.size || 0) + (entry?.queue.pending || 0);

    this.options.onPendingCountChange?.(keycard, identifier, count);
  }

  private notifyTasksUpdate(keycard: string, identifier: string, tasks: Task[]): void {
    const key = this.getQueueKey(keycard, identifier);
    const entry = this.queues.get(key);
    const status = {
      size: entry?.queue.size || 0,
      pending: entry?.queue.pending || 0,
      isRunning: !entry?.queue.isPaused || this.runningQueues.has(key),
    };

    this.options.onTasksUpdate?.(keycard, identifier, tasks, status);
  }

  // --- PERSISTENCE & HYDRATION ---

  async persistState(): Promise<void> {
    for (const [key, entry] of this.queues.entries()) {
      const [keycard, identifier] = key.split('__');
      if (!keycard || !identifier) continue;

      await backgroundDb.saveQueueState(keycard, identifier, {
        isRunning: this.runningQueues.has(key),
        status: {
          size: entry.queue.size,
          pending: entry.queue.pending,
          isRunning: !entry.queue.isPaused || this.runningQueues.has(key),
        },
        selectedIds: entry.selectedIds,
        taskConfig: entry.taskConfig,
      });
    }
  }

  updateTaskConfig(keycard: string, identifier: string, taskConfig: TaskConfig): void {
    const key = this.getQueueKey(keycard, identifier);
    const entry = this.queues.get(key);
    if (entry) {
      entry.taskConfig = taskConfig;
      entry.queue.concurrency = taskConfig.threads;
      this.getDebugLog()(`[QueueManager] Updated concurrency for ${key} to ${taskConfig.threads}`);
    }
    this.concurrencyMap.set(keycard, taskConfig.threads);
  }

  toggleSelect(keycard: string, identifier: string, taskId: string): string[] {
    const key = this.getQueueKey(keycard, identifier);
    const entry = this.queues.get(key);
    if (!entry) return [];

    const idx = entry.selectedIds.indexOf(taskId);
    if (idx === -1) {
      entry.selectedIds.push(taskId);
    } else {
      entry.selectedIds.splice(idx, 1);
    }

    this.persistState();
    return entry.selectedIds;
  }

  toggleSelectAll(keycard: string, identifier: string, taskIds?: string[]): string[] {
    const key = this.getQueueKey(keycard, identifier);
    const entry = this.queues.get(key);
    if (!entry) return [];

    const targetIds = taskIds || entry.tasks.map((t) => t.id);
    const allSelected = targetIds.every((id) => entry.selectedIds.includes(id));

    if (allSelected) {
      entry.selectedIds = entry.selectedIds.filter((id) => !targetIds.includes(id));
    } else {
      const newSelected = new Set([...entry.selectedIds, ...targetIds]);
      entry.selectedIds = Array.from(newSelected);
    }

    this.persistState();
    return entry.selectedIds;
  }

  clearSelected(keycard: string, identifier: string): string[] {
    const key = this.getQueueKey(keycard, identifier);
    const entry = this.queues.get(key);
    if (!entry) return [];

    entry.selectedIds = [];
    this.persistState();
    return [];
  }

  getSelectedIds(keycard: string, identifier: string): string[] {
    const key = this.getQueueKey(keycard, identifier);
    const entry = this.queues.get(key);
    return entry?.selectedIds || [];
  }

  getTaskConfig(keycard: string, identifier: string): TaskConfig {
    const key = this.getQueueKey(keycard, identifier);
    const entry = this.queues.get(key);
    return (
      entry?.taskConfig || {
        threads: 1,
        delayMin: 1,
        delayMax: 15,
        stopOnErrorCount: 0,
      }
    );
  }

  async hydrate(): Promise<void> {
    const statesMap = await backgroundDb.loadAllQueueStates();

    for (const [key, state] of statesMap.entries()) {
      const [keycard, identifier] = key.split('__');
      if (!keycard || !identifier) continue;

      const entry = this.getOrCreateQueue(keycard, identifier);

      if (!state.isRunning) {
        entry.queue.pause();
      } else {
        entry.queue.start();
      }

      if (state.isRunning) {
        this.runningQueues.add(key);
      }

      if (state.selectedIds) {
        entry.selectedIds = state.selectedIds;
      }

      if (state.taskConfig) {
        entry.taskConfig = state.taskConfig;
        entry.queue.concurrency = state.taskConfig.threads;
      }
    }
  }

  /**
   * Scans all hydrated queues and re-enqueues tasks that were in "Waiting" or "Running" status.
   * This ensures tasks resume after Service Worker restarts.
   */
  async rehydrateTasks(): Promise<void> {
    for (const [key, entry] of this.queues.entries()) {
      const [keycard, identifier] = key.split('__');
      if (!keycard || !identifier) continue;

      const persisted = await backgroundDb.loadTasks(keycard, identifier);
      if (!persisted?.tasks?.length) continue;

      entry.tasks = persisted.tasks;

      for (const task of entry.tasks) {
        if (task.status === 'Running') {
          task.status = 'Waiting';
        }

        if (task.status === 'Waiting' && task.id && !entry.queuedIds.has(task.id)) {
          task.isQueued = true;
          entry.queuedIds.add(task.id);
          entry.queue.add(() => this.processTask(keycard, identifier, task));
        }
      }

      this.updateTasks(keycard, identifier, entry.tasks);
    }
    await this.persistState();
  }
}

let queueManagerInstance: QueueManager | null = null;

export function getQueueManager(options?: Partial<QueueOptions>): QueueManager {
  if (!queueManagerInstance) {
    queueManagerInstance = new QueueManager({
      defaultConcurrency: 1,
      ...options,
    });
  }
  return queueManagerInstance;
}
