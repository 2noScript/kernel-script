import { noopEngine } from "@/engines/noop.engine";
import type { BaseEngine } from "kernel-script";

export const engines: Record<string, BaseEngine> = {
  [noopEngine.keycard]: noopEngine,
};