export type Task = {
  id: string;
  type: "image" | "video";
  no: number;
  name: string;
  status:
    | "Draft"
    | "Waiting"
    | "Running"
    | "Completed"
    | "Error"
    | "Previous"
    | "Skipped";
  progress: number;
  payload: Record<string, any>;
  output?: unknown;
  errorMessage?: string;
  isQueued?: boolean;
  isFlagged?: boolean;
  createAt?: number;
  updateAt?: number;
};

export type TaskConfig = {
  threads: number;
  delayMin: number;
  delayMax: number;
  stopOnErrorCount: number;
};
