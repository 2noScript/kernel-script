import type { Task } from "@/kernel/task";
import type { TaskContext } from "@/kernel/task-context";

export type EngineResult = {
  success: boolean;
  output?: unknown;
  error?: string;
};

export type BaseEngine = {
  keycard: string;
  execute(ctx: TaskContext): Promise<EngineResult>;
};
