import type { Task } from '@/core/common/types';

const store = new Map<string, { tasks: Task[]; updatedAt: number }>();
const stateStore = new Map<string, any>();

export const mockIdb = {
  tasksStore: {
    get: async (key: string) => store.get(key),
    set: async (key: string, value: any) => store.set(key, value),
    del: async (key: string) => store.delete(key),
    keys: async () => Array.from(store.keys()),
  },
  stateStore: {
    get: async (key: string) => stateStore.get(key),
    set: async (key: string, value: any) => stateStore.set(key, value),
    del: async (key: string) => stateStore.delete(key),
  },
};

export const resetMockDb = () => {
  store.clear();
  stateStore.clear();
};

export const createMockTask = (overrides: Partial<Task> = {}): Task => ({
  id: crypto.randomUUID(),
  no: 1,
  name: 'Test Task',
  status: 'Draft',
  progress: 0,
  payload: {},
  isQueued: false,
  createAt: Date.now(),
  updateAt: Date.now(),
  histories: [],
  ...overrides,
});

export const createMockEngine = (
  result: { success: boolean; output?: any; error?: string } = { success: true },
  keycard: string = 'test'
) => ({
  keycard,
  execute: async () => result,
});

export const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
