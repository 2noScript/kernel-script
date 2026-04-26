import { createHeartbeatHandler } from '@/core/utils/heartbeat';

const handleHeartbeat = createHeartbeatHandler();

export const EVENTS = {
  TASK_RUNNING: 'TASK_RUNNING',
  TASK_COMPLETED: 'TASK_COMPLETED',
  TASK_ERROR: 'TASK_ERROR',
  TASK_CANCELLED: 'TASK_CANCELLED',
  TASK_DELAYING: 'TASK_DELAYING',
  QUEUE_EMPTY: 'QUEUE_EMPTY',
  ALL_STATE: 'ALL_STATE',
} as const;

export type EventType = (typeof EVENTS)[keyof typeof EVENTS];

export interface TaskStartedEvent {
  keycard: string;
  identifier: string;
  taskId: string;
}

export interface TaskUpdatedEvent {
  keycard: string;
  identifier: string;
  task: any;
}

export interface TaskCompletedEvent {
  keycard: string;
  identifier: string;
  taskId: string;
  result: {
    success: boolean;
    output?: unknown;
    error?: string;
  };
}

export interface TasksUpdatedEvent {
  keycard: string;
  identifier: string;
  data: {
    status: {
      size: number;
      pending: number;
      isRunning: boolean;
    };
  };
}

export interface QueueEmptyEvent {
  keycard: string;
  identifier: string;
}

export type EventPayload =
  | TaskStartedEvent
  | TaskUpdatedEvent
  | TaskCompletedEvent
  | TasksUpdatedEvent
  | QueueEmptyEvent;

interface BroadcastMessage {
  type: 'TASK_EVENT' | 'DIRECT_EVENT';
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

  if (event === EVENTS.TASK_RUNNING) {
    broadcast({
      type: 'TASK_EVENT',
      event: EVENTS.TASK_RUNNING,
      keycard,
      identifier,
      data,
    });
    handleHeartbeat(1);
  }

  // if (event === EVENTS.TASK_UPDATED) {
  //   broadcast({
  //     type: 'DIRECT_EVENT',
  //     event: EVENTS.TASK_UPDATED,
  //     keycard,
  //     identifier,
  //     data,
  //   });
  // }

  if (event === EVENTS.TASK_COMPLETED) {
    broadcast({
      type: 'TASK_EVENT',
      event: EVENTS.TASK_COMPLETED,
      keycard,
      identifier,
      data,
    });
  }

  if (event === EVENTS.TASK_ERROR) {
    broadcast({
      type: 'TASK_EVENT',
      event: EVENTS.TASK_ERROR,
      keycard,
      identifier,
      data,
    });
  }

  if (event === EVENTS.TASK_CANCELLED) {
    broadcast({
      type: 'TASK_EVENT',
      event: EVENTS.TASK_CANCELLED,
      keycard,
      identifier,
      data,
    });
  }

  if (event === EVENTS.TASK_DELAYING) {
    broadcast({
      type: 'TASK_EVENT',
      event: EVENTS.TASK_DELAYING,
      keycard,
      identifier,
      data,
    });
  }

  if (event === EVENTS.ALL_STATE) {
    broadcast({
      type: 'TASK_EVENT',
      event: EVENTS.ALL_STATE,
      keycard,
      identifier,
      data,
    });
  }

  if (event === EVENTS.QUEUE_EMPTY) {
    broadcast({
      type: 'TASK_EVENT',
      event: EVENTS.QUEUE_EMPTY,
      keycard,
      identifier,
      data,
    });
    handleHeartbeat(0);
  }
};
