import type { HandlerCtx, RetryConfig } from "@synkro/core";
import type { ModelProvider } from "./llm/provider.js";
import type { Message, ModelOptions, TokenUsage } from "./llm/types.js";
import type { AgentMemory } from "./memory/memory.js";
import type { Tool, ToolResult } from "./tools/types.js";

export type AgentConfig = {
  name: string;
  description?: string | undefined;
  systemPrompt: string;
  provider: ModelProvider;
  model: ModelOptions;
  tools?: Tool[] | undefined;
  memory?: AgentMemory | undefined;
  maxIterations?: number | undefined;
  tokenBudget?: number | undefined;
  retry?: RetryConfig | undefined;
  onTokenUsage?: ((usage: TokenUsage) => void) | undefined;
};

export type AgentRunOptions = {
  requestId?: string | undefined;
  payload?: unknown;
};

export type AgentRunResult = {
  agentName: string;
  runId: string;
  output: string;
  messages: Message[];
  toolCalls: ToolResult[];
  tokenUsage: TokenUsage;
  status:
    | "completed"
    | "failed"
    | "max_iterations"
    | "token_budget_exceeded";
};

export type AgentContext = HandlerCtx & {
  agentName: string;
  runId: string;
  tokenUsage: TokenUsage;
};

export type { AgentMemory } from "./memory/memory.js";
