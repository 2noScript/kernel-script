import PQueue from 'p-queue';
import type { TaskConfig } from '@/core/types';

export interface QueueEntry {
  queue: PQueue;
  tasks: any[];
  queuedIds: Set<string>;
  consecutiveErrors: number;
  taskConfig?: TaskConfig;
}

export interface QueueStateOptions {
  defaultConcurrency?: number;
}

export const createQueueEntry = (concurrency: number = 1, onIdle?: () => void): QueueEntry => {
  const queue = new PQueue({
    concurrency,
    autoStart: false,
  });

  if (onIdle) {
    queue.on('idle', onIdle);
  }

  return {
    queue,
    tasks: [],
    queuedIds: new Set(),
    consecutiveErrors: 0,
  };
};
