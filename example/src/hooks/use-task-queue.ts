import { noopEngine } from '@/engines/noop.engine';
import { getIdentifierFaker } from '@/lib/utils';
import { useTestTaskStore } from '@/stores/task.store';
import { useQueue } from 'kernel-script';

export const useTaskQueue = useQueue({
  keycard: noopEngine.keycard,
  getIdentifier: getIdentifierFaker,
  funcs: {
    getTasks: useTestTaskStore.getState().getTasks,
    setTasks: useTestTaskStore.getState().setTasks,
    setPendingCount: useTestTaskStore.getState().setPendingCount,
    setIsRunning: useTestTaskStore.getState().setIsRunning,
    updateTask: useTestTaskStore.getState().updateTask,
    deleteTasks: useTestTaskStore.getState().deleteTasks,
    getIsRunning: useTestTaskStore.getState().getIsRunning,
    updateTasks: useTestTaskStore.getState().updateTasks,
    addHistoryTask: useTestTaskStore.getState().addHistoryTask,
    getTaskConfig: useTestTaskStore.getState().getTaskConfig,
  },
});
