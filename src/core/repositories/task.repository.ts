import { createStore as createIdbStore, get, set, del, keys } from 'idb-keyval';
import type { Task, QueueStatus, TaskConfig } from '@/core/types';

const DB_NAME = 'kernel-script';
const TASKS_STORE = 'tasks';
const STATE_STORE = 'state';

const tasksStore = createIdbStore(DB_NAME, TASKS_STORE);
const stateStore = createIdbStore(DB_NAME, STATE_STORE);

export interface PersistedTasks {
  tasks: Task[];
  updatedAt: number;
}

export interface PersistedQueueState {
  isRunning: boolean;
  status: QueueStatus;
  selectedIds: string[];
  taskConfig: TaskConfig;
}

export interface QueueStatusDb {
  size: number;
  pending: number;
  isRunning: boolean;
  isPaused: boolean;
  updatedAt: number;
}

function getProviderKey(keycard: string, identifier: string): string {
  return `${keycard}__${identifier}`;
}

export class TaskRepository {
  async saveTasks(keycard: string, identifier: string, tasks: Task[]): Promise<void> {
    const key = getProviderKey(keycard, identifier);
    const data: PersistedTasks = { tasks, updatedAt: Date.now() };
    await set(key, data, tasksStore);
  }

  async getTasks(keycard: string, identifier: string): Promise<Task[]> {
    const key = getProviderKey(keycard, identifier);
    const data = await get<PersistedTasks>(key, tasksStore);
    return data?.tasks ?? [];
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

  async deleteTasks(keycard: string, identifier: string, taskIds: string[]): Promise<number> {
    const tasks = await this.getTasks(keycard, identifier);
    const idSet = new Set(taskIds);
    const filtered = tasks.filter((t) => !idSet.has(t.id));

    const deletedCount = tasks.length - filtered.length;
    if (deletedCount > 0) {
      await this.saveTasks(keycard, identifier, filtered);
    }

    return deletedCount;
  }

  async clearTasks(keycard: string, identifier: string): Promise<void> {
    const key = getProviderKey(keycard, identifier);
    await del(key, tasksStore);
  }

  async saveQueueStatus(keycard: string, identifier: string, status: QueueStatusDb): Promise<void> {
    const key = `${getProviderKey(keycard, identifier)}__status`;
    await set(key, status, stateStore);
  }

  async getQueueStatus(keycard: string, identifier: string): Promise<QueueStatusDb | null> {
    const key = `${getProviderKey(keycard, identifier)}__status`;
    const status = await get<QueueStatusDb>(key, stateStore);
    return status ?? null;
  }

  async clearQueueStatus(keycard: string, identifier: string): Promise<void> {
    const key = `${getProviderKey(keycard, identifier)}__status`;
    await del(key, stateStore);
  }

  async saveQueueState(
    keycard: string,
    identifier: string,
    state: PersistedQueueState
  ): Promise<void> {
    const key = getProviderKey(keycard, identifier);
    await set(key, state, stateStore);
  }

  async loadQueueState(keycard: string, identifier: string): Promise<PersistedQueueState | null> {
    const key = getProviderKey(keycard, identifier);
    const state = await get<PersistedQueueState>(key, stateStore);
    return state ?? null;
  }

  async loadTasks(keycard: string, identifier: string): Promise<PersistedTasks | null> {
    const key = getProviderKey(keycard, identifier);
    const data = await get<PersistedTasks>(key, tasksStore);
    return data ?? null;
  }

  async loadAllTasks(): Promise<Map<string, PersistedTasks>> {
    const allKeys = await keys<string>(tasksStore);
    const result = new Map<string, PersistedTasks>();

    for (const key of allKeys) {
      const data = await get<PersistedTasks>(key, tasksStore);
      if (data) {
        result.set(key, data);
      }
    }

    return result;
  }

  async loadAllQueueStates(): Promise<Map<string, PersistedQueueState>> {
    const allKeys = await keys<string>(stateStore);
    const result = new Map<string, PersistedQueueState>();

    for (const key of allKeys) {
      const state = await get<PersistedQueueState>(key, stateStore);
      if (state) {
        result.set(key, state);
      }
    }

    return result;
  }
}

export const taskRepository = new TaskRepository();
