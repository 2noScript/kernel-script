import PQueue from 'p-queue';
import type { Task, TaskConfig, EngineResult, BaseEngine } from '@/core/common/types';
import { engineHub } from '@/core/common/engine-hub';
import { TaskContext } from '@/core/common/task.context';
import { sleep } from '@/core/utils/helper';
import { taskRepository } from '@/core/repositories/task.repository';
import { emitEvent, EVENTS } from '@/core/events/emitter';

export interface QueueStatus {
  size: number;
  pending: number;
  isRunning: boolean;
}

export interface QueueOptions {
  defaultConcurrency?: number;
  debugLog?: (...args: unknown[]) => void;
}

interface QueueEntry {
  queue: PQueue;
  queuedIds: Set<string>;
  consecutiveErrors: number;
  taskConfig: TaskConfig;
}

export class QueueService {
  private queues: Map<string, QueueEntry> = new Map();
  private tasksMap: Map<string, Task[]> = new Map();
  private runningQueues: Set<string> = new Set();
  private concurrencyMap: Map<string, number> = new Map();
  private abortControllers: Map<string, AbortController> = new Map();
  private debugLog: (...args: unknown[]) => void = () => {};

  constructor(options: QueueOptions = {}) {
    if (options.debugLog) {
      this.debugLog = options.debugLog;
    }
  }

  registerOptions(options: QueueOptions): void {
    if (options.debugLog) {
      this.debugLog = options.debugLog;
    }
  }

  private getQueueKey(keycard: string, identifier: string): string {
    return `${keycard}__${identifier}`;
  }

  private getOrCreateQueue(keycard: string, identifier: string): QueueEntry {
    const key = this.getQueueKey(keycard, identifier);

    if (!this.queues.has(key)) {
      const concurrency = this.concurrencyMap.get(keycard) ?? 1;

      const queue = new PQueue({
        concurrency,
        autoStart: false,
      });

      const entry: QueueEntry = {
        queue,
        queuedIds: new Set(),
        consecutiveErrors: 0,
        taskConfig: {
          threads: concurrency,
          delayMin: 1,
          delayMax: 15,
          stopOnErrorCount: 0,
        },
      };

      queue.on('idle', () => {
        if (this.runningQueues.has(key)) {
          this.onQueueIdle(keycard, identifier);
        }
      });

      this.queues.set(key, entry);
    }

    const entry = this.queues.get(key)!;
    const currentConcurrency = this.concurrencyMap.get(keycard) ?? 1;
    if (entry.queue.concurrency !== currentConcurrency) {
      entry.queue.concurrency = currentConcurrency;
    }

    return entry;
  }

  setConcurrency(keycard: string, concurrency: number): void {
    this.concurrencyMap.set(keycard, concurrency);
    for (const [key, entry] of this.queues.entries()) {
      if (key.startsWith(keycard)) {
        entry.queue.concurrency = concurrency;
        entry.taskConfig.threads = concurrency;
      }
    }
  }

  registerEngine(engine: BaseEngine): void {
    engineHub.register(engine);
  }

  getTasks(keycard: string, identifier: string): Task[] {
    const key = this.getQueueKey(keycard, identifier);
    return this.tasksMap.get(key) || [];
  }

  private setTasks(keycard: string, identifier: string, tasks: Task[]): void {
    const key = this.getQueueKey(keycard, identifier);
    this.tasksMap.set(key, tasks);
  }

  async add(keycard: string, identifier: string, task: Task): Promise<void> {
    const key = this.getQueueKey(keycard, identifier);
    this.getOrCreateQueue(keycard, identifier);
    const tasks = this.tasksMap.get(key) || [];
    const exists = tasks.find((t) => t.id === task.id);

    if (exists) {
      const idx = tasks.indexOf(exists);
      tasks[idx] = task;
    } else {
      tasks.push(task);
    }

    this.tasksMap.set(key, tasks);
    this.debugLog(`[Queue] ADD task ${task.id}`);
  }

  async addMany(keycard: string, identifier: string, newTasks: Task[]): Promise<void> {
    const key = this.getQueueKey(keycard, identifier);
    const tasks = this.tasksMap.get(key) || [];
    const entry = this.getOrCreateQueue(keycard, identifier);

    for (const task of newTasks) {
      const exists = tasks.find((t) => t.id === task.id);
      if (exists) {
        const idx = tasks.indexOf(exists);
        tasks[idx] = task;
      } else {
        tasks.push(task);
      }

      if (task.status === 'Waiting' && !entry.queuedIds.has(task.id)) {
        entry.queuedIds.add(task.id);
        entry.queue.add(() => this.processTask(keycard, identifier, task));
      }
    }

    this.tasksMap.set(key, tasks);
    this.debugLog(`[Queue] ADD_MANY ${newTasks.length} tasks`);
  }

  async start(keycard: string, identifier: string): Promise<void> {
    const key = this.getQueueKey(keycard, identifier);
    const entry = this.queues.get(key);
    if (!entry) return;

    const tasks = this.tasksMap.get(key) || [];

    for (const task of tasks) {
      if (task.status === 'Waiting' && !entry.queuedIds.has(task.id)) {
        entry.queuedIds.add(task.id);
        entry.queue.add(() => this.processTask(keycard, identifier, task));
      }
    }

    this.runningQueues.add(key);
    entry.queue.start();
    this.debugLog(`[Queue] START`);
  }

  async pause(keycard: string, identifier: string): Promise<void> {
    const key = this.getQueueKey(keycard, identifier);
    const entry = this.queues.get(key);
    if (!entry) return;

    entry.queue.pause();
    this.runningQueues.delete(key);
    this.debugLog(`[Queue] PAUSE`);
  }

  async stop(keycard: string, identifier: string): Promise<void> {
    const key = this.getQueueKey(keycard, identifier);
    const entry = this.queues.get(key);
    if (!entry) return;

    entry.queue.pause();
    entry.queue.clear();
    entry.queuedIds.clear();

    const tasks = this.tasksMap.get(key) || [];
    for (const task of tasks) {
      if (task.status === 'Running') {
        this.haltTask(keycard, identifier, task.id);
      }
      if (task.status === 'Waiting') {
        task.isQueued = false;
      }
    }
    this.tasksMap.set(key, tasks);

    this.runningQueues.delete(key);
    this.debugLog(`[Queue] STOP`);
  }

  async resume(keycard: string, identifier: string): Promise<void> {
    const key = this.getQueueKey(keycard, identifier);
    const entry = this.queues.get(key);
    if (entry) {
      entry.queue.start();
      this.runningQueues.add(key);
      this.debugLog(`[Queue] RESUME`);
    }
  }

  async clear(keycard: string, identifier: string): Promise<void> {
    const key = this.getQueueKey(keycard, identifier);
    const entry = this.queues.get(key);

    if (entry) {
      entry.queue.clear();
      entry.queuedIds.clear();
      entry.consecutiveErrors = 0;
    }

    this.tasksMap.delete(key);
    this.debugLog(`[Queue] CLEAR`);
  }

  haltTask(keycard: string, identifier: string, taskId: string): void {
    const controller = this.abortControllers.get(taskId);
    if (controller) {
      controller.abort();
      this.abortControllers.delete(taskId);
    }

    const key = this.getQueueKey(keycard, identifier);
    const tasks = this.tasksMap.get(key) || [];
    const idx = tasks.findIndex((t) => t.id === taskId);
    if (idx !== -1) {
      const task = tasks[idx];
      if (task && task.status !== 'Completed') {
        task.status = 'Cancelled';
        task.isQueued = false;
        this.tasksMap.set(key, tasks);

        taskRepository.saveTask(keycard, identifier, task);

        emitEvent(EVENTS.TASK_CANCELLED, {
          keycard,
          identifier,
          task,
        });
      }
    }
  }

  async cancelTask(keycard: string, identifier: string, taskId: string): Promise<void> {
    const controller = this.abortControllers.get(taskId);
    if (controller) {
      controller.abort();
      this.abortControllers.delete(taskId);
    }

    const key = this.getQueueKey(keycard, identifier);
    const entry = this.queues.get(key);
    if (entry) {
      entry.queuedIds.delete(taskId);
    }

    const tasks = this.tasksMap.get(key) || [];
    const taskIdx = tasks.findIndex((t) => t.id === taskId);

    if (taskIdx === -1) {
      this.debugLog(`[Queue] CANCEL_TASK ${taskId} - not found`);
      return;
    }

    const task = tasks[taskIdx]!;

    if (task.status === 'Completed') {
      this.debugLog(`[Queue] CANCEL_TASK ${taskId} - task is already completed, cannot cancel`);
      return;
    }

    task.status = 'Cancelled';
    task.isQueued = false;

    tasks[taskIdx] = task;
    this.tasksMap.set(key, tasks);

    await taskRepository.saveTask(keycard, identifier, task);

    emitEvent(EVENTS.TASK_CANCELLED, {
      keycard,
      identifier,
      taskId,
      task,
    });

    this.debugLog(`[Queue] CANCEL_TASK ${taskId} - status changed to Cancelled`);
  }

  async retryTasks(keycard: string, identifier: string, taskIds?: string[]): Promise<string[]> {
    const key = this.getQueueKey(keycard, identifier);
    const tasks = this.tasksMap.get(key) || [];

    let tasksToRetry = tasks;
    if (taskIds && taskIds.length > 0) {
      const idSet = new Set(taskIds);
      tasksToRetry = tasks.filter((t) => idSet.has(t.id) && t.status === 'Error');
    } else {
      tasksToRetry = tasks.filter((t) => t.status === 'Error');
    }

    for (const task of tasksToRetry) {
      task.status = 'Waiting';
      task.errorMessage = undefined;
      task.progress = 0;
    }

    this.tasksMap.set(key, tasks);
    this.debugLog(`[Queue] RETRY_TASKS ${tasksToRetry.length} tasks`);
    return tasksToRetry.map((t) => t.id);
  }

  getStatus(keycard: string, identifier: string): QueueStatus {
    const key = this.getQueueKey(keycard, identifier);
    const entry = this.queues.get(key);
    const tasks = this.tasksMap.get(key) || [];

    const size = tasks.filter((t) => t.status === 'Waiting' && t.isQueued).length;
    const pending = tasks.filter((t) => t.status === 'Running').length;

    return {
      size,
      pending,
      isRunning: entry ? entry.queue.isPaused === false && this.runningQueues.has(key) : false,
    };
  }

  updateTaskConfig(keycard: string, identifier: string, taskConfig: TaskConfig): void {
    const key = this.getQueueKey(keycard, identifier);
    const entry = this.getOrCreateQueue(keycard, identifier);
    if (entry) {
      entry.taskConfig = taskConfig;
      entry.queue.concurrency = taskConfig.threads;
      this.concurrencyMap.set(keycard, taskConfig.threads);
    }
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

  private async processTask(keycard: string, identifier: string, task: Task): Promise<void> {
    const engine = engineHub.get(keycard);
    const key = this.getQueueKey(keycard, identifier);
    const entry = this.queues.get(key);

    if (!engine) {
      console.warn(`No engine registered for : ${keycard}`);
      this.updateTaskStatus(keycard, identifier, task.id, {
        status: 'Error',
        errorMessage: `No engine registered for : ${keycard}`,
      });
      return;
    }

    if (!entry) {
      console.error(`Queue entry not found for key: ${key}`);
      return;
    }

    const tasks = this.tasksMap.get(key) || [];
    const taskIndex = tasks.findIndex((t) => t.id === task.id);
    if (taskIndex === -1) {
      this.debugLog(`[Queue] Task ${task.id} was removed. Skipping.`);
      return;
    }

    // this.updateTaskStatus(keycard, identifier, task.id, {
    //   status: 'Running',
    //   isQueued: true,
    // });

    const { delayMin, delayMax } = entry.taskConfig;
    const controller = new AbortController();
    this.abortControllers.set(task.id, controller);

    if (delayMax > 0) {
      const delayMs = Math.floor(Math.random() * (delayMax - delayMin + 1) + delayMin) * 1000;
      const delayUntil = Date.now() + delayMs;

      this.updateTaskStatus(keycard, identifier, task.id, {
        status: 'Delaying',
        isQueued: true,
        delayUntil,
      });
      await taskRepository.saveTask(keycard, identifier, {
        ...task,
        status: 'Delaying',
        isQueued: true,
        delayUntil,
      });

      emitEvent(EVENTS.TASK_DELAYING, {
        keycard,
        identifier,
        taskId: task.id,
        task: { ...task, status: 'Delaying', isQueued: true, delayUntil },
      });

      try {
        await sleep(delayMs, controller.signal);
      } catch (err) {
        if (err instanceof Error && err.message === 'CANCELLED') {
          this.updateTaskStatus(keycard, identifier, task.id, {
            status: 'Cancelled',
            isQueued: false,
            delayUntil: undefined,
          });

          const updatedTask: Task = {
            ...task,
            status: 'Cancelled',
            isQueued: false,
            delayUntil: undefined,
          };
          taskRepository.saveTask(keycard, identifier, updatedTask);

          emitEvent(EVENTS.TASK_CANCELLED, {
            keycard,
            identifier,
            taskId: task.id,
            task: updatedTask,
          });

          this.abortControllers.delete(task.id);
          entry.queuedIds.delete(task.id);
          return;
        }
        throw err;
      }
    }

    this.updateTaskStatus(keycard, identifier, task.id, {
      delayUntil: undefined,
      status: 'Running',
    });

    // emitEvent(EVENTS.TASK_CANCELLED, {
    //          ...task,
    //     status: 'Delaying',
    //     isQueued: true,
    //     delayUntil,
    // });

    const currentTaskBeforeStart = this.findTask(keycard, identifier, task.id);
    if (!currentTaskBeforeStart || currentTaskBeforeStart.status !== 'Running') {
      this.debugLog(
        `[Queue] Task ${task.id} cancelled or no longer running before PROCESS_START. Status: ${currentTaskBeforeStart?.status}. Exiting.`
      );
      return;
    }

    this.debugLog(`[Queue] PROCESS_START ${task.id}`);

    const ctx = new TaskContext(task, controller.signal);

    try {
      const result = await Promise.race([
        engine.execute(ctx),
        new Promise<never>((_, reject) => {
          if (ctx.signal?.aborted) {
            reject(new Error('CANCELLED'));
          }
          ctx.signal?.addEventListener('abort', () => reject(new Error('CANCELLED')), {
            once: true,
          });
        }),
      ]);

      const finTask = this.findTask(keycard, identifier, task.id);
      if (!finTask) return;

      if (finTask.status !== 'Running') {
        this.debugLog(`Task ${task.id} status changed to ${finTask.status}. Bailing out.`);
        return;
      }

      const shouldCancel = this.abortControllers.has(task.id);

      if (result.error === 'CANCELLED' || shouldCancel) {
        this.updateTaskStatus(keycard, identifier, task.id, {
          status: 'Cancelled',
          isQueued: false,
        });
      } else if (result.success && !shouldCancel) {
        this.updateTaskStatus(keycard, identifier, task.id, {
          status: 'Completed',
          output: result.output,
          progress: 100,
          isQueued: false,
        });
      } else {
        this.updateTaskStatus(keycard, identifier, task.id, {
          status: result.success ? 'Completed' : 'Error',
          output: result.output,
          errorMessage: result.error,
          progress: result.success ? 100 : 0,
          isQueued: false,
        });
      }
    } catch (error) {
      const isCancelled =
        error instanceof Error && (error.name === 'AbortError' || error.message === 'CANCELLED');

      if (isCancelled) {
        this.updateTaskStatus(keycard, identifier, task.id, {
          status: 'Cancelled',
          isQueued: false,
        });
      } else {
        const errorMsg = error instanceof Error ? error.message : String(error);
        this.updateTaskStatus(keycard, identifier, task.id, {
          status: 'Error',
          errorMessage: errorMsg,
          isQueued: false,
        });

        entry.consecutiveErrors = (entry.consecutiveErrors || 0) + 1;
      }
    } finally {
      this.abortControllers.delete(task.id);
      entry.queuedIds.delete(task.id);

      const maxErrors = entry.taskConfig?.stopOnErrorCount || 0;
      if (maxErrors > 0 && (entry.consecutiveErrors || 0) >= maxErrors) {
        console.warn(`[Queue] Stopping queue due to ${entry.consecutiveErrors} errors.`);
        this.stop(keycard, identifier);
        entry.consecutiveErrors = 0;
      }
    }
  }

  private findTask(keycard: string, identifier: string, taskId: string): Task | null {
    const key = this.getQueueKey(keycard, identifier);
    const tasks = this.tasksMap.get(key) || [];
    return tasks.find((t) => t.id === taskId) ?? null;
  }

  private updateTaskStatus(
    keycard: string,
    identifier: string,
    taskId: string,
    updates: Partial<Task>
  ): void {
    const key = this.getQueueKey(keycard, identifier);
    const tasks = this.tasksMap.get(key) || [];
    const idx = tasks.findIndex((t) => t.id === taskId);

    if (idx !== -1) {
      tasks[idx] = { ...tasks[idx], ...updates, id: taskId } as Task;
      this.tasksMap.set(key, tasks);
    }
  }

  private onQueueIdle(keycard: string, identifier: string): void {
    const key = this.getQueueKey(keycard, identifier);
    const entry = this.queues.get(key);
    if (entry) {
      this.runningQueues.delete(key);
      entry.queue.pause();
      emitEvent(EVENTS.QUEUE_EMPTY, { keycard, identifier });
    }
  }
}

let queueServiceInstance: QueueService | null = null;

export function getQueueService(options?: QueueOptions): QueueService {
  if (!queueServiceInstance) {
    queueServiceInstance = new QueueService(options);
  }
  return queueServiceInstance;
}
