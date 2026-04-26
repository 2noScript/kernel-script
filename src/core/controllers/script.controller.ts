import { COMMANDS } from '@/core/constants/commands';
import { taskService } from '@/core/services/task.service';
import type { Task, TaskInput, TaskConfig } from '@/core/common/types';
import { queueService } from '@/core/services/queue.service';
import { debugLog } from '@/core/common/log';

export type CommandPayload = {
  command: string;
  keycard: string;
  identifier?: string;
  payload: {
    input?: TaskInput;
    inputs?: TaskInput[];
    taskId?: string;
    taskIds?: string[];
    taskConfig?: TaskConfig;
  };
};

export interface SyncResponse {
  tasks: Task[];
  status: {
    size: number;
    pending: number;
    isRunning: boolean;
  };
  taskConfig: TaskConfig;
}

export const createScriptController = () => {
  return async (message: CommandPayload) => {
    const { command, keycard, identifier = '', payload } = message;

    switch (command) {
      case COMMANDS.SYNC: {
        debugLog(`[CONTROLLER] SYNC from ${keycard}/${identifier}`);
        const tasks = await taskService.getTasks(keycard, identifier);
        const status = await taskService.getQueueStatus(keycard, identifier);
        const taskConfig = queueService.getTaskConfig(keycard, identifier);

        return {
          tasks,
          status: status ?? { size: 0, pending: 0, isRunning: false },
          taskConfig,
        } as SyncResponse;
      }

      case COMMANDS.CREATE_TASK: {
        debugLog(`[CONTROLLER] CREATE_TASK ${payload.input?.name} in ${keycard}/${identifier}`);
        const task = await taskService.createTask(keycard, identifier, payload.input!);
        return { task };
      }

      case COMMANDS.CREATE_TASKS: {
        debugLog(`[CONTROLLER] CREATE_TASKS ${payload.inputs?.length} in ${keycard}/${identifier}`);
        const tasks = await taskService.createTasks(keycard, identifier, payload.inputs || []);
        return { tasks };
      }

      case COMMANDS.GET_TASK: {
        debugLog(`[CONTROLLER] GET_TASK ${payload.taskId} from ${keycard}/${identifier}`);
        const task = await taskService.getTask(keycard, identifier, payload.taskId || '');
        return { task };
      }

      case COMMANDS.GET_TASKS: {
        debugLog(`[CONTROLLER] GET_TASKS from ${keycard}/${identifier}`);
        const tasks = await taskService.getTasks(keycard, identifier);
        return { tasks };
      }

      case COMMANDS.DELETE_TASK: {
        debugLog(`[CONTROLLER] DELETE_TASK ${payload.taskId} from ${keycard}/${identifier}`);
        const success = await taskService.deleteTask(keycard, identifier, payload.taskId || '');
        return { success };
      }

      case COMMANDS.DELETE_TASKS: {
        debugLog(
          `[CONTROLLER] DELETE_TASKS ${payload.taskIds?.length} from ${keycard}/${identifier}`
        );
        const count = await taskService.deleteTasks(keycard, identifier, payload.taskIds || []);
        return { deletedCount: count };
      }

      case COMMANDS.PUBLISH_TASKS: {
        debugLog(
          `[CONTROLLER] PUBLISH_TASKS ${payload.taskIds?.length} in ${keycard}/${identifier}`
        );
        const tasks = await taskService.publishTasks(keycard, identifier, payload.taskIds || []);
        return { tasks };
      }

      case COMMANDS.UNPUBLISH_TASKS: {
        debugLog(
          `[CONTROLLER] UNPUBLISH_TASKS ${payload.taskIds?.length} in ${keycard}/${identifier}`
        );
        const tasks = await taskService.unpublishTasks(keycard, identifier, payload.taskIds || []);
        return { tasks };
      }

      case COMMANDS.QUEUE_START: {
        debugLog(`[CONTROLLER] QUEUE_START ${keycard}/${identifier}`);
        await taskService.queueStart(keycard, identifier);
        return { success: true };
      }

      case COMMANDS.QUEUE_STOP: {
        debugLog(`[CONTROLLER] QUEUE_STOP ${keycard}/${identifier}`);
        await taskService.queueStop(keycard, identifier);
        return { success: true };
      }

      case COMMANDS.QUEUE_CANCEL_TASK: {
        debugLog(`[CONTROLLER] QUEUE_CANCEL_TASK ${payload.taskId} from ${keycard}/${identifier}`);
        await taskService.queueCancelTask(keycard, identifier, payload.taskId || '');
        return { success: true };
      }

      case COMMANDS.QUEUE_CANCEL_TASKS: {
        debugLog(
          `[CONTROLLER] QUEUE_CANCEL_TASKS ${payload.taskIds?.length} from ${keycard}/${identifier}`
        );
        const count = await taskService.queueCancelTasks(
          keycard,
          identifier,
          payload.taskIds || []
        );
        return { cancelledCount: count };
      }

      case COMMANDS.QUEUE_CLEAR: {
        debugLog(`[CONTROLLER] QUEUE_CLEAR ${keycard}/${identifier}`);
        await taskService.clearQueue(keycard, identifier);
        return { success: true };
      }

      case COMMANDS.GET_QUEUE_STATUS: {
        debugLog(`[CONTROLLER] GET_QUEUE_STATUS from ${keycard}/${identifier}`);
        const status = await taskService.getQueueStatus(keycard, identifier);
        return { status };
      }

      case COMMANDS.SET_TASK_CONFIG: {
        debugLog(`[CONTROLLER] SET_TASK_CONFIG ${keycard}/${identifier}`);
        await taskService.updateTaskConfig(keycard, identifier, payload.taskConfig!);
        return { success: true };
      }

      case COMMANDS.RESET_TASKS: {
        debugLog(`[CONTROLLER] RESET_TASKS ${payload.taskIds?.length} in ${keycard}/${identifier}`);
        const tasks = await taskService.resetTasks(keycard, identifier, payload.taskIds || []);
        for (const task of tasks) {
          // emitEvent(EVENTS.TASK_UPDATED, { keycard, identifier, task });
        }
        return { tasks };
      }

      default:
        debugLog(`[CONTROLLER] Unknown command: ${command}`);
        return null;
    }
  };
};
