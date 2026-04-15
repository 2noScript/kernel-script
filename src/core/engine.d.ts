import type { Task } from '@/core/task';
import type { TaskContext } from '@/core/task-context';

export type EngineResult = {
  success: boolean;
  output?: unknown;
  error?: string;
};

export type BaseEngine = {
  keycard: string;
  execute(ctx: TaskContext): Promise<EngineResult>;
};
