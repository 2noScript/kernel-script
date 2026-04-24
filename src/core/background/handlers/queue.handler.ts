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

export type CommandHandlerDeps ={
  queueManager: QueueManager;
  debugLog: (...args: unknown[]) => void;
}

export const createQueueHandler = ({ queueManager, debugLog }: CommandHandlerDeps) => {
  return async (message: CommandPayload) => {
    const { command, keycard, identifier = '', payload } = message;

    const handleAsyncCommand = async (promise: Promise<any>) => {
      await promise;
      return { success: true };
    };

    switch (command) {
      case QUEUE_COMMAND.SYNC:
        debugLog(`[BOOTSTRAP] SYNC from ${keycard}/${identifier}`);
        return {
          tasks: queueManager.getTasks(keycard, identifier),
          status: queueManager.getStatus(keycard, identifier),
        };

      case QUEUE_COMMAND.CANCEL_TASK:
        debugLog(`[BOOTSTRAP] CANCEL_TASK ${payload.taskId} from ${keycard}/${identifier}`);
        handleAsyncCommand(queueManager.cancelTask(keycard, identifier, payload.taskId || ''));
        return { async: true };

      case QUEUE_COMMAND.CANCEL_TASKS:
        debugLog(
          `[BOOTSTRAP] CANCEL_TASKS ${payload.taskIds?.length} tasks from ${keycard}/${identifier}`
        );
        handleAsyncCommand(
          Promise.all(
            (payload.taskIds || []).map((id: string) =>
              queueManager.cancelTask(keycard, identifier, id)
            )
          )
        );
        return { async: true };

      case QUEUE_COMMAND.ADD:
        debugLog(`[BOOTSTRAP] ADD task ${payload.task?.id} to ${keycard}/${identifier}`);
        handleAsyncCommand(queueManager.add(keycard, identifier, payload.task!));
        return { async: true };

      case QUEUE_COMMAND.ADD_MANY:
        debugLog(`[BOOTSTRAP] ADD_MANY ${payload.tasks?.length} tasks to ${keycard}/${identifier}`);
        handleAsyncCommand(queueManager.addMany(keycard, identifier, payload.tasks || []));
        return { async: true };

      case QUEUE_COMMAND.START:
        debugLog(`[BOOTSTRAP] START queue ${keycard}/${identifier}`);
        handleAsyncCommand(queueManager.start(keycard, identifier));
        return { async: true };

      case QUEUE_COMMAND.STOP:
        debugLog(`[BOOTSTRAP] STOP queue ${keycard}/${identifier}`);
        handleAsyncCommand(queueManager.stop(keycard, identifier));
        return { async: true };

      case QUEUE_COMMAND.RESUME:
        debugLog(`[BOOTSTRAP] RESUME queue ${keycard}/${identifier}`);
        handleAsyncCommand(queueManager.resume(keycard, identifier));
        return { async: true };

      case QUEUE_COMMAND.CLEAR:
        debugLog(`[BOOTSTRAP] CLEAR queue ${keycard}/${identifier}`);
        handleAsyncCommand(queueManager.clear(keycard, identifier));
        return { async: true };

      case QUEUE_COMMAND.GET_STATUS:
        debugLog(`[BOOTSTRAP] GET_STATUS from ${keycard}/${identifier}`);
        return queueManager.getStatus(keycard, identifier);

      case QUEUE_COMMAND.GET_TASKS:
        debugLog(`[BOOTSTRAP] GET_TASKS from ${keycard}/${identifier}`);
        return { tasks: queueManager.getTasks(keycard, identifier) };

      case QUEUE_COMMAND.SET_TASK_CONFIG:
        queueManager.updateTaskConfig(keycard, identifier, payload.taskConfig!);
        return { success: true };

      default:
        debugLog(`[Queue] Unknown command: ${command}`);
        return null;
    }
  };
};
