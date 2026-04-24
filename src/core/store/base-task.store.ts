import { create, type StoreApi, type UseBoundStore } from 'zustand';
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware';
import type { Task, TaskInput, TaskConfig } from '@/core/types';

export interface TaskStoreState {
  tasks: Task[];
  taskHistory: Task[];
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
  addHistoryTask: (task: Task) => void;
  clearHistory: () => void;
  toggleSelect: (id: string) => void;
  toggleSelectAll: (ids?: string[]) => void;
  setSelectedIds: (ids: string[]) => void;
  clearSelected: () => void;
  getIsRunning: () => boolean;
  getTaskConfig: () => TaskConfig;
  updateTaskConfig: (updates: Partial<TaskConfig>) => void;
}

export interface CreateTaskStoreOptions<T extends object> {
  name: string;
  storage?: StateStorage;
  partialize?: (state: any) => any;
  extend?: (set: (state: any) => any, get: () => any) => T;
}

export const createTaskStore = <T extends object>(options: CreateTaskStoreOptions<T>) => {
  const { name, storage, partialize, extend } = options;

  const baseState = {
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
  };

  if (storage) {
    return create<any>()(
      persist(
        (set, get) => ({
          ...baseState,
          selectedIds: [] as string[],
          getTasks: () => get().tasks,
          setTasks: (tasks: Task[]) => {
            const uniqueTasks = Array.from(new Map(tasks.map((t: Task) => [t.id, t])).values());
            set({ tasks: uniqueTasks });
          },
          setPendingCount: (count: number) => set({ pendingCount: count }),
          setIsRunning: (running: boolean) => set({ isRunning: running }),
          createTask: (task: TaskInput) =>
            set((state: any) => {
              const now = Date.now();
              const maxNo = state.tasks.reduce((max: number, t: Task) => Math.max(max, t.no), 0);
              const newTask: Task = {
                id: crypto.randomUUID(),
                no: maxNo + 1,
                status: 'Draft',
                progress: 0,
                createAt: now,
                updateAt: now,
                ...task,
              };
              if (state.tasks.some((t: Task) => t.id === newTask.id)) return state;
              return { tasks: [...state.tasks, newTask] };
            }),
          createTasks: (newTasks: TaskInput[]) =>
            set((state: any) => {
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
                  ...task,
                };
              });
              const existingIds = new Set(state.tasks.map((t: Task) => t.id));
              const filteredNewTasks = createdTasks.filter((t) => !existingIds.has(t.id));
              if (filteredNewTasks.length === 0) return state;
              return { tasks: [...state.tasks, ...filteredNewTasks] };
            }),
          updateTask: (taskId: string, updates: Partial<Task>) => {
            set((state: any) => ({
              tasks: state.tasks.map((t: Task) =>
                t.id === taskId ? { ...t, ...updates, updateAt: Date.now() } : t
              ),
            }));
          },
          updateTasks: (updates: Record<string, Partial<Task>>) =>
            set((state: any) => ({
              tasks: state.tasks.map((t: Task) =>
                updates[t.id] ? { ...t, ...updates[t.id], updateAt: Date.now() } : t
              ),
            })),
          deleteTasks: (taskIds: string[]) =>
            set((state: any) => ({
              tasks: state.tasks
                .filter((t: Task) => !taskIds.includes(t.id))
                .map((t: Task, i: number) => ({ ...t, no: i + 1 })),
              selectedIds: state.selectedIds.filter((id: string) => !taskIds.includes(id)),
            })),
          clearTasks: () => set({ tasks: [], selectedIds: [] }),
          addHistoryTask: (task: Task) =>
            set((state: any) => {
              const newHistory = [task, ...(state.taskHistory || [])];
              // Cap at 1000 tasks
              if (newHistory.length > 1000) {
                newHistory.length = 1000;
              }
              return { taskHistory: newHistory };
            }),
          clearHistory: () => set({ taskHistory: [] }),
          toggleSelect: (id: string) =>
            set((state: any) => ({
              selectedIds: state.selectedIds.includes(id)
                ? state.selectedIds.filter((i: string) => i !== id)
                : [...state.selectedIds, id],
            })),
          toggleSelectAll: (ids?: string[]) =>
            set((state: any) => {
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
            set((state: any) => ({
              taskConfig: { ...state.taskConfig, ...updates },
            })),
          ...(extend ? extend(set, get) : {}),
        }),
        {
          name,
          storage: createJSONStorage(() => storage!),
          partialize: (state: any) => {
            const basePersist = {
              tasks: state.tasks,
              taskHistory: state.taskHistory,
              selectedIds: state.selectedIds,
              taskConfig: state.taskConfig,
            };
            const customPersist = partialize ? partialize(state) : {};
            return {
              ...basePersist,
              ...customPersist,
            };
          },
        }
      )
    );
  }

  return create<any>()((set, get) => ({
    ...baseState,
    selectedIds: [] as string[],
    getTasks: () => get().tasks,
    setTasks: (tasks: Task[]) => {
      const uniqueTasks = Array.from(new Map(tasks.map((t: Task) => [t.id, t])).values());
      set({ tasks: uniqueTasks });
    },
    setPendingCount: (count: number) => set({ pendingCount: count }),
    setIsRunning: (running: boolean) => set({ isRunning: running }),
    createTask: (task: Task) =>
      set((state: any) => {
        if (state.tasks.some((t: Task) => t.id === task.id)) return state;
        return { tasks: [...state.tasks, task] };
      }),
    createTasks: (newTasks: Task[]) =>
      set((state: any) => {
        const existingIds = new Set(state.tasks.map((t: Task) => t.id));
        const filteredNewTasks = newTasks.filter((t) => !existingIds.has(t.id));
        if (filteredNewTasks.length === 0) return state;
        return { tasks: [...state.tasks, ...filteredNewTasks] };
      }),
    updateTask: (taskId: string, updates: Partial<Task>) => {
      set((state: any) => ({
        tasks: state.tasks.map((t: Task) => (t.id === taskId ? { ...t, ...updates } : t)),
      }));
    },
    updateTasks: (updates: Record<string, Partial<Task>>) =>
      set((state: any) => ({
        tasks: state.tasks.map((t: Task) => (updates[t.id] ? { ...t, ...updates[t.id] } : t)),
      })),
    deleteTasks: (taskIds: string[]) =>
      set((state: any) => ({
        tasks: state.tasks
          .filter((t: Task) => !taskIds.includes(t.id))
          .map((t: Task, i: number) => ({ ...t, no: i + 1 })),
        selectedIds: state.selectedIds.filter((id: string) => !taskIds.includes(id)),
      })),
    clearTasks: () => set({ tasks: [], selectedIds: [] }),
    addHistoryTask: (task: Task) =>
      set((state: any) => {
        const newHistory = [task, ...(state.taskHistory || [])];
        // Cap at 1000 tasks
        if (newHistory.length > 1000) {
          newHistory.length = 1000;
        }
        return { taskHistory: newHistory };
      }),
    clearHistory: () => set({ taskHistory: [] }),
    toggleSelect: (id: string) =>
      set((state: any) => ({
        selectedIds: state.selectedIds.includes(id)
          ? state.selectedIds.filter((i: string) => i !== id)
          : [...state.selectedIds, id],
      })),
    toggleSelectAll: (ids?: string[]) =>
      set((state: any) => {
        const targetIds = ids || state.tasks.map((t: Task) => t.id);
        const allTargetSelected =
          targetIds.length > 0 && targetIds.every((id: string) => state.selectedIds.includes(id));

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
    updateTaskConfig: (updates: Partial<TaskStoreState['taskConfig']>) =>
      set((state: any) => ({
        taskConfig: { ...state.taskConfig, ...updates },
      })),
    ...(extend ? extend(set, get) : {}),
  }));
};

export const pluginTask = (store: UseBoundStore<StoreApi<TaskStoreState>>) => {
  const state = store.getState();
  return {
    getTasks: state.getTasks,
    setTasks: state.setTasks,
    setPendingCount: state.setPendingCount,
    setIsRunning: state.setIsRunning,
    updateTask: state.updateTask,
    deleteTasks: state.deleteTasks,
    getIsRunning: state.getIsRunning,
    updateTasks: state.updateTasks,
    addHistoryTask: state.addHistoryTask,
    getTaskConfig: state.getTaskConfig,
  };
};
