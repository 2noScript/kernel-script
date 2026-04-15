import { sleep } from '@/core/helper';
import type { Task } from '@/core/task';

export class TaskContext {
  public readonly task: Task;
  public readonly signal?: AbortSignal;

  constructor(task: Task, signal?: AbortSignal) {
    this.task = task;
    this.signal = signal;
  }

  /**
   * Helper to execute an async operation while respecting the cancellation signal.
   * Checks for abortion BEFORE and AFTER the operation.
   */
  async run<T>(fn: () => Promise<T> | T): Promise<T> {
    this.signal?.throwIfAborted();

    const result = await fn();

    this.signal?.throwIfAborted();
    return result;
  }

  /**
   * Signal-aware sleep utility.
   */
  async sleep(ms: number): Promise<void> {
    return sleep(ms, this.signal);
  }

  /**
   * Check if the task has been cancelled.
   */
  get aborted(): boolean {
    return this.signal?.aborted || false;
  }

  /**
   * Throw if the task has been cancelled.
   */
  throwIfAborted(): void {
    this.signal?.throwIfAborted();
  }
}
