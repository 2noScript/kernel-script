import Dexie from 'dexie';
import type { Table } from 'dexie';
import type { Task, QueueStatus, TaskConfig } from '@/core/common/types';

export interface PersistedTasks {
  key: string;
  tasks: Task[];
  updatedAt: number;
}

export interface QueueStatusDb {
  key: string;
  size: number;
  pending: number;
  isRunning: boolean;
  isPaused: boolean;
  updatedAt: number;
}

export interface PersistedQueueState {
  key: string;
  isRunning: boolean;
  status: QueueStatus;
  selectedIds: string[];
  taskConfig: TaskConfig;
}

export class KernelScriptDB extends Dexie {
  tasks!: Table<PersistedTasks, string>;
  status!: Table<QueueStatusDb, string>;
  state!: Table<PersistedQueueState, string>;

  constructor() {
    super('kernel-script');
    this.version(1).stores({
      tasks: 'key',
      status: 'key',
      state: 'key',
    });
  }
}

export const db = new KernelScriptDB();

export class TaskRepository {
  private getKey(keycard: string, identifier: string): string {
    return `${keycard}__${identifier}`;
  }

  async saveTasks(keycard: string, identifier: string, tasks: Task[]): Promise<void> {
    const key = this.getKey(keycard, identifier);
    await db.tasks.put({ key, tasks, updatedAt: Date.now() });
  }

  async getTasks(keycard: string, identifier: string): Promise<Task[]> {
    const key = this.getKey(keycard, identifier);
    const record = await db.tasks.get(key);
    return record?.tasks ?? [];
  }

  async getTask(keycard: string, identifier: string, taskId: string): Promise<Task | null> {
    const tasks = await this.getTasks(keycard, identifier);
    return tasks.find((t) => t.id === taskId) ?? null;
  }

  async saveTask(keycard: string, identifier: string, task: Task): Promise<void> {
    const tasks = await this.getTasks(keycard, identifier);
    const index = tasks.findIndex((t) => t.id === task.id);

    if (index >= 0) {
      tasks[index] = task;
    } else {
      tasks.push(task);
    }

    await this.saveTasks(keycard, identifier, tasks);
  }

  async updateTask(
    keycard: string,
    identifier: string,
    taskId: string,
    updates: Partial<Task>
  ): Promise<Task | null> {
    const tasks = await this.getTasks(keycard, identifier);
    const index = tasks.findIndex((t) => t.id === taskId);

    if (index < 0) return null;

    tasks[index] = { ...tasks[index], ...updates, id: taskId } as Task;
    await this.saveTasks(keycard, identifier, tasks);
    return tasks[index] ?? null;
  }

  async deleteTask(keycard: string, identifier: string, taskId: string): Promise<boolean> {
    const tasks = await this.getTasks(keycard, identifier);
    const filtered = tasks.filter((t) => t.id !== taskId);

    if (filtered.length === tasks.length) return false;

    await this.saveTasks(keycard, identifier, filtered);
    return true;
  }

  async deleteTasks(keycard: string, identifier: string, taskIds: string[]): Promise<boolean> {
    const tasks = await this.getTasks(keycard, identifier);
    const idSet = new Set(taskIds);
    const filtered = tasks.filter((t) => !idSet.has(t.id));
    await this.saveTasks(keycard, identifier, filtered);

    return true;
  }

  async clearTasks(keycard: string, identifier: string): Promise<void> {
    const key = this.getKey(keycard, identifier);
    await db.tasks.delete(key);
  }

  async saveQueueStatus(
    keycard: string,
    identifier: string,
    status: Omit<QueueStatusDb, 'key'>
  ): Promise<void> {
    const key = this.getKey(keycard, identifier);
    await db.status.put({
      key,
      size: status.size,
      pending: status.pending,
      isRunning: status.isRunning,
      isPaused: status.isPaused,
      updatedAt: Date.now(),
    });
  }

  async getQueueStatus(
    keycard: string,
    identifier: string
  ): Promise<Omit<QueueStatusDb, 'key'> | null> {
    const key = this.getKey(keycard, identifier);
    const record = await db.status.get(key);
    return record
      ? {
          size: record.size,
          pending: record.pending,
          isRunning: record.isRunning,
          isPaused: record.isPaused,
          updatedAt: record.updatedAt,
        }
      : null;
  }

  async clearQueueStatus(keycard: string, identifier: string): Promise<void> {
    const key = this.getKey(keycard, identifier);
    await db.status.delete(key);
  }

  async saveQueueState(
    keycard: string,
    identifier: string,
    state: Omit<PersistedQueueState, 'key'>
  ): Promise<void> {
    const key = this.getKey(keycard, identifier);
    await db.state.put({
      key,
      isRunning: state.isRunning,
      status: state.status,
      selectedIds: state.selectedIds,
      taskConfig: state.taskConfig,
    });
  }

  async loadQueueState(keycard: string, identifier: string): Promise<PersistedQueueState | null> {
    const key = this.getKey(keycard, identifier);
    const record = await db.state.get(key);
    return record ?? null;
  }

  async loadTasks(keycard: string, identifier: string): Promise<PersistedTasks | null> {
    const key = this.getKey(keycard, identifier);
    return (await db.tasks.get(key)) ?? null;
  }

  async loadAllTasks(): Promise<Map<string, PersistedTasks>> {
    const result = new Map<string, PersistedTasks>();
    const all = await db.tasks.toArray();

    for (const record of all) {
      if (record.key.includes('__')) {
        result.set(record.key, record);
      }
    }

    return result;
  }

  async loadAllQueueStates(): Promise<Map<string, PersistedQueueState>> {
    const result = new Map<string, PersistedQueueState>();
    const all = await db.state.toArray();

    for (const record of all) {
      if (record.key.includes('__')) {
        result.set(record.key, record);
      }
    }

    return result;
  }
}

export const taskRepository = new TaskRepository();
