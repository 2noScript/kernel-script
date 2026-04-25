import { DIRECT_COMMAND } from '@/core/constants/commands';
import { taskService } from '@/core/services/task.service';
import { directService } from '@/core/services/direct.service';

export const createDirectController = (debugLog: (...args: unknown[]) => void) => {
  return async (message: any) => {
    const { command, keycard, identifier = '', payload } = message;
    const taskId = payload?.taskId;

    switch (command) {
      case DIRECT_COMMAND.RUN_TASK: {
        debugLog(`[CONTROLLER] RUN_TASK ${taskId} on ${keycard}/${identifier}`);
        if (!taskId) {
          return { success: false, error: 'taskId is required' };
        }
        const task = await taskService.runTask(keycard, identifier, taskId);
        return { task, success: !!task };
      }

      case DIRECT_COMMAND.STOP_TASK: {
        debugLog(`[CONTROLLER] STOP_TASK ${taskId} on ${keycard}/${identifier}`);
        if (!taskId) {
          return { success: false, error: 'taskId is required' };
        }
        directService.stop(keycard, identifier, taskId);
        const task = await taskService.stopTask(keycard, identifier, taskId);
        return { task };
      }

      case DIRECT_COMMAND.RETRY_TASK: {
        debugLog(`[CONTROLLER] RETRY_TASK ${taskId} on ${keycard}/${identifier}`);
        if (!taskId) {
          return { success: false, error: 'taskId is required' };
        }
        const task = await taskService.retryTask(keycard, identifier, taskId);
        return { task };
      }

      case DIRECT_COMMAND.SKIP_TASK: {
        debugLog(`[CONTROLLER] SKIP_TASK ${taskId} on ${keycard}/${identifier}`);
        if (!taskId) {
          return { success: false, error: 'taskId is required' };
        }
        const task = await taskService.skipTask(keycard, identifier, taskId);
        return { task };
      }

      case DIRECT_COMMAND.IS_TASK_RUNNING: {
        debugLog(`[CONTROLLER] IS_TASK_RUNNING ${taskId} on ${keycard}/${identifier}`);
        if (!taskId) {
          return { isRunning: false };
        }
        return { isRunning: directService.isRunning(keycard, identifier, taskId) };
      }

      default:
        return null;
    }
  };
};
