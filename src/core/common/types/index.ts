export type Task = {
  id: string;
  no: number;
  name: string;
  status:
    | 'Draft'
    | 'Waiting'
    | 'Running'
    | 'Completed'
    | 'Error'
    | 'Cancelled'
    | 'Previous'
    | 'Skipped'
    | 'Delaying';
  progress: number;
  payload: Record<string, any>;
  result?: EngineResult;
  errorMessage?: string;
  isQueued: boolean;
  delayUntil?: number;
  createAt: number;
  updateAt: number;
  histories: TaskHistory[];
  [key: string]: any;
};

export type TaskInput = {
  name: Task['name'];
  payload: Task['payload'];
  [key: string]: any;
};

export type TaskHistory = {
  result: EngineResult;
  updateAt: number;
};

export type TaskConfig = {
  threads: number;
  delayMin: number;
  delayMax: number;
  stopOnErrorCount: number;
  [key: string]: any;
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

export type DirectOptions = {
  debug?: boolean;
  storageKey?: string;
  onTasksUpdate?: (keycard: string, identifier: string, task: Task) => void;
  onTaskComplete?: (
    keycard: string,
    identifier: string,
    taskId: string,
    result: EngineResult
  ) => void;
};

export type AsyncResult = {
  success: boolean;
};
