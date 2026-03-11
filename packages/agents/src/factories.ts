import { Agent } from "./agent.js";
import type { AgentConfig } from "./types.js";
import type { Tool } from "./tools/types.js";

export function createAgent(config: AgentConfig): Agent {
  return new Agent(config);
}

export function createTool<TInput = unknown, TOutput = unknown>(
  tool: Tool<TInput, TOutput>,
): Tool<TInput, TOutput> {
  return tool;
}
