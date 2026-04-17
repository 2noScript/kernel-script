import type { CommandPayload, CommandHandlerDeps } from '@/core/bootstrap/command-handler';
import { createCommandHandler } from '@/core/bootstrap/command-handler';
import { getDirectManager, type DirectManager } from '@/core/managers/direct.manager';
import { DIRECT_COMMAND } from '@/core/commands';
import type { Task, QueueStatus, EngineResult, DirectOptions } from '@/core/types';

export interface MessageHandlerDeps extends CommandHandlerDeps {
  broadcast: (message: any) => void;
  handleHeartbeat: (count: number) => void;
}

export const createMessageHandler = ({
  queueManager,
  debug,
  debugLog,
  broadcast,
  handleHeartbeat,
}: MessageHandlerDeps) => {
  const commandHandler = createCommandHandler({ queueManager, debug, debugLog });

  const directManager = getDirectManager({
    debug,
    onTasksUpdate: (keycard: string, identifier: string, task: Task) => {
      broadcast({
        type: 'DIRECT_EVENT',
        event: 'TASK_UPDATED',
        keycard,
        identifier,
        data: { task },
      });
    },
    onTaskComplete: (keycard: string, identifier: string, taskId: string, result: EngineResult) => {
      const isCancelled = result.error === 'CANCELLED' || result.error === 'AbortError';
      if (!isCancelled) {
        broadcast({
          type: 'DIRECT_EVENT',
          event: 'TASK_COMPLETED',
          keycard,
          identifier,
          data: { taskId, result },
        });
      }
      handleHeartbeat(0);
    },
  });

  queueManager.registerOptions('*' as any, {
    onTasksUpdate: (keycard: string, identifier: string, tasks: Task[], status: QueueStatus) => {
      broadcast({
        type: 'QUEUE_EVENT',
        event: 'TASKS_UPDATED',
        keycard,
        identifier,
        data: { tasks, status },
      });
    },
    onTaskComplete: (keycard: string, identifier: string, _: string, result: any) => {
      const isCancelled = result.error === 'CANCELLED' || result.error === 'AbortError';
      if (!isCancelled) {
        broadcast({
          type: 'QUEUE_EVENT',
          event: 'HISTORY_ADDED',
          keycard,
          identifier,
          data: { task: [] },
        });
      }
    },
    onPendingCountChange: (keycard: string, identifier: string, count: number) => {
      broadcast({
        type: 'QUEUE_EVENT',
        event: 'PENDING_COUNT_CHANGED',
        keycard,
        identifier,
        data: { count },
      });
      handleHeartbeat(count);
    },
  });

  const handleDirectCommand = async (message: any) => {
    const { command, keycard, identifier, payload } = message;
    const task = payload?.task;
    const taskId = payload?.taskId;

    switch (command) {
      case DIRECT_COMMAND.START:
        debugLog(`[BOOTSTRAP] DIRECT_START ${task?.id} on ${keycard}/${identifier}`);
        if (!task) {
          return { success: false, error: 'Task is required' };
        }
        const result = await directManager.start(keycard, identifier, task);
        return result;

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

      default:
        return null;
    }
  };

  return (message: any, _sender: any, sendResponse: (response?: any) => void) => {
    if (message.type === 'QUEUE_COMMAND') {
      const result = commandHandler(message as CommandPayload);

      if (result && 'async' in result) {
        return true;
      }

      if (result) {
        sendResponse(result);
      }
    }

    if (message.type === 'DIRECT_COMMAND') {
      const result = handleDirectCommand(message);

      if (result && 'then' in result) {
        result.then((r: any) => sendResponse(r));
        return true;
      }

      if (result) {
        sendResponse(result);
      }
    }

    if (message.type === 'PING') {
      sendResponse({ payload: 'PONG from background' });
    }
  };
};
