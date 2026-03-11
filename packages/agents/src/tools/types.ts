import type { AgentContext } from "../types.js";

export type Tool<TInput = unknown, TOutput = unknown> = {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  execute: (input: TInput, ctx: AgentContext) => Promise<TOutput>;
};

export type ToolResult = {
  toolCallId: string;
  name: string;
  result: unknown;
  error?: string | undefined;
  durationMs: number;
};
