import type { CommandPayload, CommandHandlerDeps } from '@/core/bootstrap/command-handler';
import { createCommandHandler } from '@/core/bootstrap/command-handler';
import { createDirectCommandHandler } from '@/core/bootstrap/direct-command-handler';
import { getDirectManager, type DirectManager } from '@/core/managers/direct.manager';
import type { Task, QueueStatus, EngineResult } from '@/core/types';

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

  const directManager = getDirectManager({ debug });

  directManager.registerOptions('*', {
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

  const directCommandHandler = createDirectCommandHandler({
    directManager,
    debug,
    debugLog,
  });

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
      const result = directCommandHandler(message);

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
