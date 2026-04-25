import { QUEUE_COMMAND } from '@/core/commands';
import type { QueueManager } from '@/core/managers/queue.manager';
import type { Task, TaskConfig } from '@/core/types';

export type CommandPayload = {
  command: string;
  keycard: string;
  identifier?: string;
  payload: {
    task?: Task;
    tasks?: Task[];
    taskId?: string;
    taskIds?: string[];
    taskConfig?: TaskConfig;
  };
};

export type CommandHandlerDeps = {
  queueManager: QueueManager;
  debugLog: (...args: unknown[]) => void;
};

export interface SyncResponse {
  tasks: Task[];
  status: {
    size: number;
    pending: number;
    isRunning: boolean;
  };
  selectedIds: string[];
  taskConfig: TaskConfig;
}

export const createQueueHandler = ({ queueManager, debugLog }: CommandHandlerDeps) => {
  return async (message: CommandPayload) => {
    const { command, keycard, identifier = '', payload } = message;

    const handleAsyncCommand = async (promise: Promise<any>) => {
      await promise;
      return { success: true };
    };

    switch (command) {
      case QUEUE_COMMAND.SYNC: {
        debugLog(`[HANDLER] SYNC from ${keycard}/${identifier}`);
        const tasks = queueManager.getTasks(keycard, identifier);
        const status = queueManager.getStatus(keycard, identifier);
        const selectedIds = queueManager.getSelectedIds(keycard, identifier);
        const taskConfig = queueManager.getTaskConfig(keycard, identifier);

        return {
          tasks,
          status,
          selectedIds,
          taskConfig,
        } as SyncResponse;
      }

      case QUEUE_COMMAND.CANCEL_TASK:
        debugLog(`[HANDLER] CANCEL_TASK ${payload.taskId} from ${keycard}/${identifier}`);
        handleAsyncCommand(queueManager.cancelTask(keycard, identifier, payload.taskId || ''));
        return { success: true };

      case QUEUE_COMMAND.CANCEL_TASKS:
        debugLog(
          `[HANDLER] CANCEL_TASKS ${payload.taskIds?.length} tasks from ${keycard}/${identifier}`
        );
        handleAsyncCommand(
          Promise.all(
            (payload.taskIds || []).map((id: string) =>
              queueManager.cancelTask(keycard, identifier, id)
            )
          )
        );
        return { success: true };

      case QUEUE_COMMAND.ADD:
        debugLog(`[HANDLER] ADD task ${payload.task?.id} to ${keycard}/${identifier}`);
        handleAsyncCommand(queueManager.add(keycard, identifier, payload.task!));
        return { success: true };

      case QUEUE_COMMAND.ADD_MANY:
        debugLog(`[HANDLER] ADD_MANY ${payload.tasks?.length} tasks to ${keycard}/${identifier}`);
        handleAsyncCommand(queueManager.addMany(keycard, identifier, payload.tasks || []));
        return { success: true };

      case QUEUE_COMMAND.START:
        debugLog(`[HANDLER] START queue ${keycard}/${identifier}`);
        handleAsyncCommand(queueManager.start(keycard, identifier));
        return { success: true };

      case QUEUE_COMMAND.STOP:
        debugLog(`[HANDLER] STOP queue ${keycard}/${identifier}`);
        handleAsyncCommand(queueManager.stop(keycard, identifier));
        return { success: true };

      case QUEUE_COMMAND.RESUME:
        debugLog(`[HANDLER] RESUME queue ${keycard}/${identifier}`);
        handleAsyncCommand(queueManager.resume(keycard, identifier));
        return { success: true };

      case QUEUE_COMMAND.CLEAR:
        debugLog(`[HANDLER] CLEAR queue ${keycard}/${identifier}`);
        handleAsyncCommand(queueManager.clear(keycard, identifier));
        return { success: true };

      case QUEUE_COMMAND.GET_STATUS:
        debugLog(`[HANDLER] GET_STATUS from ${keycard}/${identifier}`);
        return queueManager.getStatus(keycard, identifier);

      case QUEUE_COMMAND.GET_TASKS:
        debugLog(`[HANDLER] GET_TASKS from ${keycard}/${identifier}`);
        return { tasks: queueManager.getTasks(keycard, identifier) };

      case QUEUE_COMMAND.SET_TASK_CONFIG:
        queueManager.updateTaskConfig(keycard, identifier, payload.taskConfig!);
        queueManager.persistState();
        return { success: true };

      case QUEUE_COMMAND.TOGGLE_SELECT: {
        debugLog(`[HANDLER] TOGGLE_SELECT ${payload.taskId} from ${keycard}/${identifier}`);
        const selectedIds = queueManager.toggleSelect(keycard, identifier, payload.taskId || '');
        return { selectedIds };
      }

      case QUEUE_COMMAND.TOGGLE_SELECT_ALL: {
        debugLog(`[HANDLER] TOGGLE_SELECT_ALL from ${keycard}/${identifier}`);
        const selectedIds = queueManager.toggleSelectAll(keycard, identifier, payload.taskIds);
        return { selectedIds };
      }

      case QUEUE_COMMAND.CLEAR_SELECTED: {
        debugLog(`[HANDLER] CLEAR_SELECTED from ${keycard}/${identifier}`);
        queueManager.clearSelected(keycard, identifier);
        return { selectedIds: [] };
      }

      default:
        debugLog(`[HANDLER] Unknown command: ${command}`);
        return null;
    }
  };
};
