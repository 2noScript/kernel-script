import type { Task } from '@/core/common/types';
import { createHeartbeatHandler } from '@/core/utils/heartbeat';

const handleHeartbeat = createHeartbeatHandler();

export const EVENTS = {
  TASK_CREATED: 'TASK_CREATED',
  TASK_RUNNING: 'TASK_RUNNING',
  TASK_COMPLETED: 'TASK_COMPLETED',
  TASK_ERROR: 'TASK_ERROR',
  TASK_CANCELLED: 'TASK_CANCELLED',
  TASK_DELAYING: 'TASK_DELAYING',
  QUEUE_EMPTY: 'QUEUE_EMPTY',
  ALL_STATE: 'ALL_STATE',
} as const;

export type EventType = (typeof EVENTS)[keyof typeof EVENTS];

export type BaseEvent = {
  keycard: string;
  identifier: string;
};

export type TaskRunningEvent = BaseEvent & {
  taskId: string;
};

export type TaskUpdatedEvent = BaseEvent & {
  task: Task;
};

export type TaskDelayingEvent=BaseEvent &{
  task:Task
}

export type TaskCompletedEvent = BaseEvent & {
  taskId: string;
  result: {
    success: boolean;
    output?: unknown;
    error?: string;
  };
};

export type TasksUpdatedEvent = BaseEvent & {
  data: {
    status: {
      size: number;
      pending: number;
      isRunning: boolean;
    };
  };
};

export type QueueEmptyEvent = BaseEvent & {};

export type TaskCreatedEvent = BaseEvent & {
  task: Task;
};

export type EventPayload =
  | TaskRunningEvent
  | TaskUpdatedEvent
  | TaskCompletedEvent
  | TasksUpdatedEvent
  | QueueEmptyEvent;

interface BroadcastMessage {
  type: 'TASK_EVENT';
  event: string;
  keycard: string;
  identifier: string;
  data: any;
}

const broadcast = (message: BroadcastMessage) => {
  chrome.runtime.sendMessage(message).catch(() => {
    // Silently ignore if no UI is listening
  });
};

export const emitEvent = (event: EventType, payload: EventPayload) => {
  const { keycard, identifier, ...data } = payload;

  switch (event) {
    case EVENTS.TASK_CREATED:
      broadcast({ type: 'TASK_EVENT', event: EVENTS.TASK_CREATED, keycard, identifier, data });
      handleHeartbeat(1);
      break;
    case EVENTS.TASK_RUNNING:
      broadcast({ type: 'TASK_EVENT', event: EVENTS.TASK_RUNNING, keycard, identifier, data });
      handleHeartbeat(1);
      break;

    case EVENTS.TASK_COMPLETED:
      broadcast({ type: 'TASK_EVENT', event: EVENTS.TASK_COMPLETED, keycard, identifier, data });
      break;

    case EVENTS.TASK_ERROR:
      broadcast({ type: 'TASK_EVENT', event: EVENTS.TASK_ERROR, keycard, identifier, data });
      break;

    case EVENTS.TASK_CANCELLED:
      broadcast({ type: 'TASK_EVENT', event: EVENTS.TASK_CANCELLED, keycard, identifier, data });
      break;

    case EVENTS.TASK_DELAYING:
      broadcast({ type: 'TASK_EVENT', event: EVENTS.TASK_DELAYING, keycard, identifier, data });
      break;

    case EVENTS.ALL_STATE:
      broadcast({ type: 'TASK_EVENT', event: EVENTS.ALL_STATE, keycard, identifier, data });
      break;

    case EVENTS.QUEUE_EMPTY:
      broadcast({ type: 'TASK_EVENT', event: EVENTS.QUEUE_EMPTY, keycard, identifier, data });
      handleHeartbeat(0);
      break;
  }
};
