import { create, type StoreApi, type UseBoundStore } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { Task, TaskInput, TaskConfig, EngineResult } from '@/core/types';
import { createIndexedDBStorage } from '@/core/storage/indexed-db.storage';

export interface TaskStoreState {
  tasks: Task[];
  pendingCount: number;
  isRunning: boolean;
  selectedIds: string[];
  taskConfig: TaskConfig;
  getTasks: () => Task[];
  setTasks: (tasks: Task[]) => void;
  setPendingCount: (count: number) => void;
  setIsRunning: (running: boolean) => void;
  createTask: (task: TaskInput) => void;
  createTasks: (tasks: TaskInput[]) => void;
  updateTask: (taskId: string, updates: Partial<Task>) => void;
  updateTasks: (updates: Record<string, Partial<Task>>) => void;
  deleteTasks: (taskIds: string[]) => void;
  clearTasks: () => void;
  addHistoryTask: (taskId: string, result: EngineResult) => void;
  toggleSelect: (id: string) => void;
  toggleSelectAll: (ids?: string[]) => void;
  setSelectedIds: (ids: string[]) => void;
  clearSelected: () => void;
  getIsRunning: () => boolean;
  getTaskConfig: () => TaskConfig;
  updateTaskConfig: (updates: Partial<TaskConfig>) => void;
}

export interface CreateTaskStoreOptions {
  keycard: string;
  identifier: string;
}

export const createTaskStore = (options: CreateTaskStoreOptions) => {
  const { keycard, identifier } = options;

  return create<TaskStoreState>()(
    persist(
      (set, get) => ({
        tasks: [] as Task[],
        taskHistory: [] as Task[],
        pendingCount: 0,
        isRunning: false,
        taskConfig: {
          threads: 1,
          delayMin: 1,
          delayMax: 15,
          stopOnErrorCount: 0,
        },
        selectedIds: [] as string[],
        getTasks: () => get().tasks,
        setTasks: (tasks: Task[]) => {
          const uniqueTasks = Array.from(new Map(tasks.map((t: Task) => [t.id, t])).values());
          set({ tasks: uniqueTasks });
        },
        setPendingCount: (count: number) => set({ pendingCount: count }),
        setIsRunning: (running: boolean) => set({ isRunning: running }),
        createTask: (task: TaskInput) =>
          set((state: TaskStoreState) => {
            const now = Date.now();
            const maxNo = state.tasks.reduce((max: number, t: Task) => Math.max(max, t.no), 0);
            const newTask: Task = {
              id: crypto.randomUUID(),
              no: maxNo + 1,
              status: 'Draft',
              progress: 0,
              createAt: now,
              updateAt: now,
              histories: [],
              isQueued: false,
              ...task,
            };
            if (state.tasks.some((t: Task) => t.id === newTask.id)) return state;
            return { tasks: [...state.tasks, newTask] };
          }),
        createTasks: (newTasks: TaskInput[]) =>
          set((state: TaskStoreState) => {
            const now = Date.now();
            const maxNo = state.tasks.reduce((max: number, t: Task) => Math.max(max, t.no), 0);
            const createdTasks = newTasks.map((task: TaskInput, index): Task => {
              return {
                id: crypto.randomUUID(),
                no: maxNo + 1 + index,
                status: 'Draft',
                progress: 0,
                createAt: now,
                updateAt: now,
                histories: [],
                isQueued: false,
                ...task,
              };
            });
            const existingIds = new Set(state.tasks.map((t: Task) => t.id));
            const filteredNewTasks = createdTasks.filter((t) => !existingIds.has(t.id));
            if (filteredNewTasks.length === 0) return state;
            return { tasks: [...state.tasks, ...filteredNewTasks] };
          }),
        updateTask: (taskId: string, updates: Partial<Task>) => {
          set((state: TaskStoreState) => ({
            tasks: state.tasks.map((t: Task) =>
              t.id === taskId ? { ...t, ...updates, updateAt: Date.now() } : t
            ),
          }));
        },
        updateTasks: (updates: Record<string, Partial<Task>>) =>
          set((state: TaskStoreState) => ({
            tasks: state.tasks.map((t: Task) =>
              updates[t.id] ? { ...t, ...updates[t.id], updateAt: Date.now() } : t
            ),
          })),
        deleteTasks: (taskIds: string[]) =>
          set((state: TaskStoreState) => ({
            tasks: state.tasks
              .filter((t: Task) => !taskIds.includes(t.id))
              .map((t: Task, i: number) => ({ ...t, no: i + 1 })),
            selectedIds: state.selectedIds.filter((id: string) => !taskIds.includes(id)),
          })),
        clearTasks: () => set({ tasks: [], selectedIds: [] }),
        addHistoryTask: (taskId: string, result: EngineResult) => {
          const tasks = get().tasks.map((t) =>
            t.id !== taskId
              ? t
              : {
                  ...t,
                  result,
                  updateAt: Date.now(),
                  histories: [...t.histories, { result, updateAt: Date.now() }],
                }
          );
          set({ tasks });
        },
        toggleSelect: (id: string) =>
          set((state: TaskStoreState) => ({
            selectedIds: state.selectedIds.includes(id)
              ? state.selectedIds.filter((i: string) => i !== id)
              : [...state.selectedIds, id],
          })),
        toggleSelectAll: (ids?: string[]) =>
          set((state: TaskStoreState) => {
            const targetIds = ids || state.tasks.map((t: Task) => t.id);
            const allTargetSelected =
              targetIds.length > 0 &&
              targetIds.every((id: string) => state.selectedIds.includes(id));

            if (allTargetSelected) {
              return {
                selectedIds: state.selectedIds.filter((id: string) => !targetIds.includes(id)),
              };
            } else {
              const newSelectedIds = Array.from(new Set([...state.selectedIds, ...targetIds]));
              return { selectedIds: newSelectedIds };
            }
          }),
        setSelectedIds: (ids: string[]) => set({ selectedIds: ids }),
        clearSelected: () => set({ selectedIds: [] }),
        getIsRunning: () => get().isRunning,
        getTaskConfig: () => get().taskConfig,
        updateTaskConfig: (updates: Partial<TaskStoreState['taskConfig']>) =>
          set((state: TaskStoreState) => ({
            taskConfig: { ...state.taskConfig, ...updates },
          })),
      }),
      {
        name: keycard,
        storage: createJSONStorage(() => createIndexedDBStorage(`${identifier}`)!),
        partialize: (state: TaskStoreState) => {
          return {
            tasks: state.tasks,
            selectedIds: state.selectedIds,
            taskConfig: state.taskConfig,
          };
        },
      }
    )
  );
};

export const pluginTask = (store: UseBoundStore<StoreApi<TaskStoreState>>) => {
  return store.getState();
};
