import PQueue from 'p-queue';
import type { Task, TaskConfig } from '@/core/types/task';
import type { BaseEngine, EngineResult } from '@/core/types/engine';
import { persistenceManager, type SerializedQueueState } from '@/core/persistence-manager';
import { engineHub } from '@/core/engine-hub';
import { TaskContext } from '@/core/task-context';
import { sleep } from '@/core/helper';

export interface QueueStatus {
  size: number;
  pending: number;
  isPaused: boolean;
  isRunning: boolean;
}

export interface QueueOptions {
  debug?: boolean;
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
}

interface QueueEntry {
  queue: PQueue;
  tasks: Task[];
  queuedIds: Set<string>;
  consecutiveErrors: number;
  taskConfig?: TaskConfig;
}

export class QueueManager {
  private queues: Map<string, QueueEntry> = new Map();
  private defaultOptions: Partial<QueueOptions>;
  private platformOptions: Map<string, QueueOptions[]> = new Map();
  private runningQueues: Set<string> = new Set();
  private concurrencyMap: Map<string, number> = new Map();
  private abortControllers: Map<string, AbortController> = new Map();
  public debug: boolean = false;

  constructor(options: Partial<QueueOptions>) {
    this.defaultOptions = options;
    this.debug = options.debug ?? false;
  }

  private debugLog(...args: unknown[]): void {
    if (this.debug) {
      console.log(...args);
    }
  }

  private logQueueState(keycard: string, identifier: string, action: string): void {
    if (!this.debug) return;
    const key = this.getQueueKey(keycard, identifier);
    const entry = this.queues.get(key);
    if (!entry) {
      this.debugLog(`[Queue] ${action} - Queue not found for key: ${key}`);
      return;
    }
    const taskSummary = entry.tasks
      .map((t) => `[${t.id}] ${t.status}${t.name ? ` (${t.name})` : ''}`)
      .join(', ');
    this.debugLog(
      `[Queue] ${action} | Key: ${key} | Tasks: ${entry.tasks.length} | Queue size: ${entry.queue.size} | Pending: ${entry.queue.pending} | isPaused: ${entry.queue.isPaused} | Tasks: ${taskSummary}`
    );
  }

  private getQueueKey(keycard: string, identifier: string): string {
    if (identifier) return `${keycard}__${identifier}`;
    return keycard;
  }

  registerOptions(keycard: string, options: Partial<QueueOptions>): () => void {
    if (!this.platformOptions.has(keycard)) {
      this.platformOptions.set(keycard, []);
    }
    this.platformOptions.get(keycard)!.push(options as QueueOptions);

    return () => this.unregisterOptions(keycard, options as QueueOptions);
  }

  unregisterOptions(keycard: string, options: QueueOptions): void {
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

  private getOptions(keycard: string): QueueOptions[] {
    const platformSpecific = this.platformOptions.get(keycard) || [];
    const global = this.platformOptions.get('*') || [];
    return [...platformSpecific, ...global];
  }

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

  // Getter for legacy/global options to avoid breaking things during refactor
  private get options(): Partial<QueueOptions> {
    return this.defaultOptions;
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

  registerEngine(keycard: string, engine: BaseEngine): void {
    engineHub.register(keycard, engine);
  }

  async add(keycard: string, identifier: string, task: Task): Promise<void> {
    this.debugLog(
      `[DEBUG] ADD task ${task.id} (${task.name || 'unnamed'}) to ${keycard}/${identifier || 'default'}`
    );
    const entry = this.getOrCreateQueue(keycard, identifier);
    const { queue, tasks, queuedIds } = entry;

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

    this.updateTasks(keycard, identifier, tasks);
    this.notifyStatusChange(keycard, identifier);
    this.logQueueState(keycard, identifier, 'ADD');
  }

  async addMany(keycard: string, identifier: string, newTasks: Task[]): Promise<void> {
    this.debugLog(
      `[DEBUG] ADD_MANY ${newTasks.length} tasks to ${keycard}/${identifier || 'default'}`
    );
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
    this.debugLog(`[DEBUG] START queue ${keycard}/${identifier || 'default'}`);
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
    this.debugLog(`[DEBUG] STOP queue ${keycard}/${identifier || 'default'}`);
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
        await this.haltTask(keycard, identifier, t.id);
      }

      await this.persistState();
      this.notifyStatusChange(keycard, identifier);
      this.logQueueState(keycard, identifier, 'STOP');
    }
  }

  async pause(keycard: string, identifier: string): Promise<void> {
    this.debugLog(`[DEBUG] PAUSE queue ${keycard}/${identifier || 'default'}`);
    const key = this.getQueueKey(keycard, identifier);
    const entry = this.queues.get(key);
    if (entry) {
      entry.queue.pause();
      await this.persistState();
      this.logQueueState(keycard, identifier, 'PAUSE');
    }
  }

  async resume(keycard: string, identifier: string): Promise<void> {
    this.debugLog(`[DEBUG] RESUME queue ${keycard}/${identifier || 'default'}`);
    const key = this.getQueueKey(keycard, identifier);
    const entry = this.queues.get(key);
    if (entry) {
      entry.queue.start();
      await this.persistState();
      this.logQueueState(keycard, identifier, 'RESUME');
    }
  }

  async clear(keycard: string, identifier: string): Promise<void> {
    this.debugLog(`[DEBUG] CLEAR queue ${keycard}/${identifier || 'default'}`);
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
    this.debugLog(`[DEBUG] CANCEL_TASK ${taskId} from ${keycard}/${identifier || 'default'}`);
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
    this.debugLog(`[DEBUG] GET_STATUS ${keycard}/${identifier || 'default'}`);
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
      isPaused: entry?.queue.isPaused || false,
      isRunning: this.runningQueues.has(key),
    };
  }

  getTasks(keycard: string, identifier: string): Task[] {
    const key = this.getQueueKey(keycard, identifier);
    const entry = this.queues.get(key);
    const tasks = entry?.tasks || [];
    this.debugLog(
      `[DEBUG] GET_TASKS ${keycard}/${identifier || 'default'}, count: ${tasks.length}`
    );
    return tasks;
  }

  private updateTasks(keycard: string, identifier: string, tasks: Task[]): void {
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

    // Skip flagged tasks
    if (task.isFlagged) {
      this.debugLog(`[QueueManager] Task ${task.id} is flagged. Skipping.`);
      const taskIndex = entry.tasks.findIndex((t) => t.id === task.id);
      const taskEntry = entry.tasks[taskIndex];
      if (taskIndex !== -1 && taskEntry) {
        entry.tasks[taskIndex] = {
          ...taskEntry,
          status: 'Skipped',
          isQueued: false,
        };
        this.updateTasks(keycard, identifier, entry.tasks);
      }
      this.notifyStatusChange(keycard, identifier);
      return;
    }

    const taskIndex = entry.tasks.findIndex((t) => t.id === task.id);
    if (taskIndex === -1) {
      this.debugLog(`[QueueManager] Task ${task.id} was removed. Skipping execution.`);
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
    if (delayMax > 0) {
      const delayMs = Math.floor(Math.random() * (delayMax - delayMin + 1) + delayMin) * 1000;
      this.debugLog(`[QueueManager] Delaying task ${task.id} for ${delayMs}ms...`);
      await sleep(delayMs, this.abortControllers.get(key)?.signal);
    }

    this.logQueueState(keycard, identifier, `PROCESS_START ${task.id}`);

    const opts = this.getOptions(keycard);
    opts.forEach((opt) => opt.onTaskStart?.(keycard, identifier, task.id));
    this.notifyTasksUpdate(keycard, identifier, entry.tasks);

    // Create TaskContext for this run
    const controller = new AbortController();
    this.abortControllers.set(task.id, controller);
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
          this.debugLog(
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

          if (result.success) {
            entry.consecutiveErrors = 0;
          } else {
            entry.consecutiveErrors = (entry.consecutiveErrors || 0) + 1;
          }
        }
        this.updateTasks(keycard, identifier, entry.tasks);
      }

      opts.forEach((opt) => opt.onTaskComplete?.(keycard, identifier, task.id, result));
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
          entry.tasks[idx] = {
            ...errorTask,
            status: 'Error',
            errorMessage: error instanceof Error ? error.message : String(error),
            isQueued: false,
          };
          entry.consecutiveErrors = (entry.consecutiveErrors || 0) + 1;
        }
        this.updateTasks(keycard, identifier, entry.tasks);
      }

      opts.forEach((opt) =>
        opt.onTaskComplete?.(keycard, identifier, task.id, {
          success: false,
          error: String(error),
        })
      );
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

      const opts = this.getOptions(keycard);
      opts.forEach((opt) => opt.onQueueEmpty?.(keycard, identifier));
    }
  }

  private notifyStatusChange(keycard: string, identifier: string): void {
    const key = this.getQueueKey(keycard, identifier);
    const entry = this.queues.get(key);
    const count = (entry?.queue.size || 0) + (entry?.queue.pending || 0);

    const opts = this.getOptions(keycard);
    opts.forEach((opt) => opt.onPendingCountChange?.(keycard, identifier, count));
  }

  private notifyTasksUpdate(keycard: string, identifier: string, tasks: Task[]): void {
    const key = this.getQueueKey(keycard, identifier);
    const entry = this.queues.get(key);
    const status = {
      size: entry?.queue.size || 0,
      pending: entry?.queue.pending || 0,
      isPaused: entry?.queue.isPaused || false,
      isRunning: this.runningQueues.has(key),
    };

    const opts = this.getOptions(keycard);
    opts.forEach((opt) => opt.onTasksUpdate?.(keycard, identifier, tasks, status));
  }

  // --- PERSISTENCE & HYDRATION ---

  async persistState(): Promise<void> {
    const states: Record<string, SerializedQueueState> = {};
    for (const [key, entry] of this.queues.entries()) {
      states[key] = {
        isPaused: entry.queue.isPaused,
        isRunning: this.runningQueues.has(key),
      };
    }

    await persistenceManager.saveQueueStates(states);
  }

  updateTaskConfig(keycard: string, identifier: string, taskConfig: TaskConfig): void {
    const key = this.getQueueKey(keycard, identifier);
    const entry = this.queues.get(key);
    if (entry) {
      entry.taskConfig = taskConfig;
      entry.queue.concurrency = taskConfig.threads;
      this.debugLog(`[QueueManager] Updated concurrency for ${key} to ${taskConfig.threads}`);
    }
    this.concurrencyMap.set(keycard, taskConfig.threads);
  }

  async hydrate(): Promise<void> {
    const states = await persistenceManager.loadQueueStates();
    if (!states) return;

    for (const key in states) {
      const state = states[key];
      if (!state) continue;

      const [keycard, identifier] = key.split('__');
      if (!keycard || !identifier) continue;

      const entry = this.getOrCreateQueue(keycard, identifier);

      if (state.isPaused) {
        entry.queue.pause();
      } else {
        entry.queue.start();
      }

      if (state.isRunning) {
        this.runningQueues.add(key);
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

      // Get the latest task list from the persistence layer
      const tasks = entry.tasks;
      if (!tasks || tasks.length === 0) continue;

      for (const task of tasks) {
        // If it was Running, reset it to Waiting so it can be re-executed
        if (task.status === 'Running') {
          task.status = 'Waiting';
        }

        if (task.status === 'Waiting' && task.id && !entry.queuedIds.has(task.id)) {
          task.isQueued = true;
          entry.queuedIds.add(task.id);
          entry.queue.add(() => this.processTask(keycard, identifier, task));
        }
      }

      this.updateTasks(keycard, identifier, tasks);
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
