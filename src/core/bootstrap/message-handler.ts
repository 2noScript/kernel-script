import { QUEUE_COMMAND } from '@/core/commands';
import type { CommandPayload, CommandHandlerDeps } from '@/core/bootstrap/command-handler';
import { createCommandHandler } from '@/core/bootstrap/command-handler';
import type { Task } from '@/core/types';
import type { QueueStatus } from '@/core/types';

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

    if (message.type === 'PING') {
      sendResponse({ payload: 'PONG from background' });
    }
  };
};
