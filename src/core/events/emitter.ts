import { hasActiveUI } from '@/core/background/port-tracker';

export const EVENTS = {
  TASK_STARTED: 'TASK_STARTED',
  TASK_UPDATED: 'TASK_UPDATED',
  TASK_COMPLETED: 'TASK_COMPLETED',
  TASKS_UPDATED: 'TASKS_UPDATED',
  QUEUE_EMPTY: 'QUEUE_EMPTY',
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
    tasks: any[];
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
  type: 'WORKER_EVENT' | 'DIRECT_EVENT';
  event: string;
  keycard: string;
  identifier: string;
  data: any;
}

const broadcast = (message: BroadcastMessage) => {
  if (!hasActiveUI()) {
    return;
  }
  chrome.runtime.sendMessage(message).catch(() => {});
};

export const emitEvent = (event: EventType, payload: EventPayload) => {
  const { keycard, identifier, ...data } = payload;

  if (event === EVENTS.TASK_STARTED) {
    broadcast({
      type: 'WORKER_EVENT',
      event: EVENTS.TASK_STARTED,
      keycard,
      identifier,
      data,
    });
  }

  if (event === EVENTS.TASK_UPDATED) {
    broadcast({
      type: 'DIRECT_EVENT',
      event: EVENTS.TASK_UPDATED,
      keycard,
      identifier,
      data,
    });
  }

  if (event === EVENTS.TASK_COMPLETED) {
    broadcast({
      type: 'WORKER_EVENT',
      event: EVENTS.TASK_COMPLETED,
      keycard,
      identifier,
      data,
    });
  }

  if (event === EVENTS.TASKS_UPDATED) {
    broadcast({
      type: 'WORKER_EVENT',
      event: EVENTS.TASKS_UPDATED,
      keycard,
      identifier,
      data,
    });
  }

  if (event === EVENTS.QUEUE_EMPTY) {
    broadcast({
      type: 'WORKER_EVENT',
      event: EVENTS.QUEUE_EMPTY,
      keycard,
      identifier,
      data,
    });
  }
};

export const createEmitter = () => ({
  emit: emitEvent,
  EVENTS,
});
