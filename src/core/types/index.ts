export type Task = {
  id: string;
  no: number;
  name: string;
  status: 'Draft' | 'Waiting' | 'Running' | 'Completed' | 'Error' | 'Previous' | 'Skipped';
  progress: number;
  payload: Record<string, any>;
  output?: unknown;
  errorMessage?: string;
  isQueued?: boolean;
  createAt?: number;
  updateAt?: number;
  [key: string]: unknown;
};

export type TaskConfig = {
  threads: number;
  delayMin: number;
  delayMax: number;
  stopOnErrorCount: number;
};

export type QueueStatus = {
  size: number;
  pending: number;
  isRunning: boolean;
};

export type QueueOptions = {
  debug?: boolean;
  storageKey?: string;
  defaultConcurrency?: number;
  onTaskStart?: (keycard: string, identifier: string, taskId: string) => void;
  onTaskComplete?: (
    keycard: string,
    identifier: string,
    taskId: string,
    result: EngineResult
  ) => void;
  onQueueEmpty?: (keycard: string, identifier: string) => void;
  onPendingCountChange?: (keycard: string, identifier: string, count: number) => void;
  onTasksUpdate?: (keycard: string, identifier: string, tasks: Task[], status: QueueStatus) => void;
};

export type EngineResult = {
  success: boolean;
  output?: unknown;
  error?: string;
};

export type BaseEngine = {
  keycard: string;
  execute(ctx: any): Promise<EngineResult>;
};

export type SerializedQueueState = {
  isRunning: boolean;
};
