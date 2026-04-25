import { createStore as createIdbStore, get, set, del, keys } from 'idb-keyval';
import type { Task, QueueStatus, TaskConfig } from '@/core/types';

const DB_NAME = 'kernel-script-bg';
const TASKS_STORE = 'tasks';
const STATE_STORE = 'queue-state';

const tasksStore = createIdbStore(DB_NAME, TASKS_STORE);
const stateStore = createIdbStore(DB_NAME, STATE_STORE);

function getTasksKey(keycard: string, identifier: string): string {
  return `${keycard}__${identifier}`;
}

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

export const backgroundDb = {
  async saveTasks(keycard: string, identifier: string, tasks: Task[]): Promise<void> {
    const key = getTasksKey(keycard, identifier);
    const data: PersistedTasks = {
      tasks,
      updatedAt: Date.now(),
    };
    await set(key, data, tasksStore);
  },

  async loadTasks(keycard: string, identifier: string): Promise<PersistedTasks | null> {
    const key = getTasksKey(keycard, identifier);
    const data = await get<PersistedTasks>(key, tasksStore);
    return data || null;
  },

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
  },

  async clearTasks(keycard: string, identifier: string): Promise<void> {
    const key = getTasksKey(keycard, identifier);
    await del(key, tasksStore);
  },

  async saveQueueState(
    keycard: string,
    identifier: string,
    state: PersistedQueueState
  ): Promise<void> {
    const key = getTasksKey(keycard, identifier);
    await set(key, state, stateStore);
  },

  async loadQueueState(keycard: string, identifier: string): Promise<PersistedQueueState | null> {
    const key = getTasksKey(keycard, identifier);
    const state = await get<PersistedQueueState>(key, stateStore);
    return state || null;
  },

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
  },

  async clearQueueState(keycard: string, identifier: string): Promise<void> {
    const key = getTasksKey(keycard, identifier);
    await del(key, stateStore);
  },

  async clearAll(keycard: string, identifier: string): Promise<void> {
    await this.clearTasks(keycard, identifier);
    await this.clearQueueState(keycard, identifier);
  },
};

export type BackgroundDb = typeof backgroundDb;
