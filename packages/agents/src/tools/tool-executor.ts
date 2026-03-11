import type { AgentContext } from "../types.js";
import type { ToolCall } from "../llm/types.js";
import type { Tool, ToolResult } from "./types.js";
import type { ToolRegistry } from "./tool-registry.js";

export class ToolExecutor {
  private readonly registry: ToolRegistry;

  constructor(registry: ToolRegistry) {
    this.registry = registry;
  }

  async execute(toolCall: ToolCall, ctx: AgentContext): Promise<ToolResult> {
    const start = Date.now();
    const tool = this.registry.get(toolCall.name);

    if (!tool) {
      return {
        toolCallId: toolCall.id,
        name: toolCall.name,
        result: null,
        error: `Tool "${toolCall.name}" not found`,
        durationMs: Date.now() - start,
      };
    }

    try {
      const input = this.parseArguments(toolCall.arguments, tool);
      const result = await tool.execute(input, ctx);
      return {
        toolCallId: toolCall.id,
        name: toolCall.name,
        result,
        durationMs: Date.now() - start,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        toolCallId: toolCall.id,
        name: toolCall.name,
        result: null,
        error: message,
        durationMs: Date.now() - start,
      };
    }
  }

  async executeAll(toolCalls: ToolCall[], ctx: AgentContext): Promise<ToolResult[]> {
    return Promise.all(toolCalls.map((tc) => this.execute(tc, ctx)));
  }

  private parseArguments(args: string, _tool: Tool): unknown {
    try {
      return JSON.parse(args);
    } catch {
      throw new Error(`Invalid tool arguments: expected JSON, got: ${args}`);
    }
  }
}
