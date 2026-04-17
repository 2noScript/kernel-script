import { DIRECT_COMMAND } from '@/core/commands';
import type { DirectManager } from '@/core/managers/direct.manager';

interface DirectCommandHandlerDeps {
  directManager: DirectManager;
  debug: boolean;
  debugLog: (...args: unknown[]) => void;
}

export const createDirectCommandHandler = ({
  directManager,
  debug,
  debugLog,
}: DirectCommandHandlerDeps) => {
  return async (message: any) => {
    const { command, keycard, identifier, payload } = message;
    const task = payload?.task;
    const taskId = payload?.taskId;

    switch (command) {
      case DIRECT_COMMAND.START:
        debugLog(`[BOOTSTRAP] DIRECT_START ${task?.id} on ${keycard}/${identifier}`);
        if (!task) {
          return { success: false, error: 'Task is required' };
        }
        return await directManager.start(keycard, identifier, task);

      case DIRECT_COMMAND.STOP:
        debugLog(`[BOOTSTRAP] DIRECT_STOP ${taskId} on ${keycard}/${identifier}`);
        if (!taskId) {
          return { success: false, error: 'taskId is required' };
        }
        directManager.stop(keycard, identifier, taskId);
        return { success: true };

      case DIRECT_COMMAND.IS_RUNNING:
        debugLog(`[BOOTSTRAP] DIRECT_IS_RUNNING ${taskId} on ${keycard}/${identifier}`);
        if (!taskId) {
          return { isRunning: false };
        }
        return { isRunning: directManager.isRunning(keycard, identifier, taskId) };

      case DIRECT_COMMAND.GET_TASKS:
        debugLog(`[BOOTSTRAP] DIRECT_GET_TASKS from ${keycard}/${identifier}`);
        return {
          tasks: directManager.getRunningTasks(keycard, identifier),
        };

      case DIRECT_COMMAND.GET_STATUS:
        debugLog(`[BOOTSTRAP] DIRECT_GET_STATUS from ${keycard}/${identifier}`);
        return {
          isRunning: directManager.hasRunningTask(keycard, identifier),
        };

      default:
        return null;
    }
  };
};
