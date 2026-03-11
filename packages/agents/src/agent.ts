import { randomUUID } from "node:crypto";
import type { HandlerCtx, HandlerFunction } from "@synkro/core";
import type { ModelProvider } from "./llm/provider.js";
import type { Message, ModelOptions, TokenUsage, ToolDefinition } from "./llm/types.js";
import type { AgentMemory } from "./memory/memory.js";
import type { Tool, ToolResult } from "./tools/types.js";
import type { AgentConfig, AgentContext, AgentRunOptions, AgentRunResult } from "./types.js";
import { ToolRegistry } from "./tools/tool-registry.js";
import { ToolExecutor } from "./tools/tool-executor.js";

const DEFAULT_MAX_ITERATIONS = 10;

export class Agent {
  readonly name: string;
  readonly description: string | undefined;

  private readonly systemPrompt: string;
  private readonly provider: ModelProvider;
  private readonly modelOptions: ModelOptions;
  private readonly toolRegistry: ToolRegistry;
  private readonly toolExecutor: ToolExecutor;
  private readonly memory: AgentMemory | undefined;
  private readonly maxIterations: number;
  private readonly tokenBudget: number | undefined;
  private readonly onTokenUsage: ((usage: TokenUsage) => void) | undefined;

  constructor(config: AgentConfig) {
    this.name = config.name;
    this.description = config.description;
    this.systemPrompt = config.systemPrompt;
    this.provider = config.provider;
    this.modelOptions = config.model;
    this.memory = config.memory;
    this.maxIterations = config.maxIterations ?? DEFAULT_MAX_ITERATIONS;
    this.tokenBudget = config.tokenBudget;
    this.onTokenUsage = config.onTokenUsage;

    this.toolRegistry = new ToolRegistry();
    if (config.tools) {
      for (const tool of config.tools) {
        this.toolRegistry.register(tool);
      }
    }
    this.toolExecutor = new ToolExecutor(this.toolRegistry);
  }

  async run(input: string, options?: AgentRunOptions): Promise<AgentRunResult> {
    const runId = options?.requestId ?? randomUUID();
    const allToolResults: ToolResult[] = [];
    const totalUsage: TokenUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };

    const messages: Message[] = [
      { role: "system", content: this.systemPrompt },
    ];

    // Load prior conversation from memory if available
    if (this.memory) {
      const priorMessages = await this.memory.getMessages(this.name, runId);
      messages.push(...priorMessages);
    }

    messages.push({ role: "user", content: input });

    // Prepare model options with tool definitions
    const modelOptions: ModelOptions = { ...this.modelOptions };
    const toolDefs = this.toolRegistry.getDefinitions();
    if (toolDefs.length > 0) {
      modelOptions.tools = toolDefs;
    }

    // Build a minimal AgentContext for tool execution
    const ctx = this.buildContext(runId, options?.payload, totalUsage);

    let iterations = 0;

    while (iterations < this.maxIterations) {
      iterations++;

      // Check token budget before calling LLM
      if (this.tokenBudget && totalUsage.totalTokens >= this.tokenBudget) {
        return this.buildResult(runId, messages, allToolResults, totalUsage, "token_budget_exceeded");
      }

      let response;
      try {
        response = await this.provider.chat(messages, modelOptions);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        return this.buildResult(
          runId,
          messages,
          allToolResults,
          totalUsage,
          "failed",
          `LLM call failed: ${errorMessage}`,
        );
      }

      // Accumulate token usage
      totalUsage.promptTokens += response.usage.promptTokens;
      totalUsage.completionTokens += response.usage.completionTokens;
      totalUsage.totalTokens += response.usage.totalTokens;

      if (this.onTokenUsage) {
        this.onTokenUsage({ ...totalUsage });
      }

      // Append assistant message
      const assistantMessage: Message = {
        role: "assistant",
        content: response.content,
      };
      if (response.toolCalls?.length) {
        assistantMessage.toolCalls = response.toolCalls;
      }
      messages.push(assistantMessage);

      // If no tool calls, we're done
      if (!response.toolCalls?.length || response.finishReason !== "tool_calls") {
        // Persist to memory
        if (this.memory) {
          await this.memory.addMessage(this.name, runId, { role: "user", content: input });
          await this.memory.addMessage(this.name, runId, assistantMessage);
        }

        return this.buildResult(runId, messages, allToolResults, totalUsage, "completed");
      }

      // Execute tool calls
      const toolResults = await this.toolExecutor.executeAll(response.toolCalls, ctx);
      allToolResults.push(...toolResults);

      // Append tool results as messages
      for (const result of toolResults) {
        const content = result.error
          ? `Error: ${result.error}`
          : JSON.stringify(result.result);

        messages.push({
          role: "tool",
          toolCallId: result.toolCallId,
          content,
        });
      }
    }

    // Exhausted max iterations
    return this.buildResult(runId, messages, allToolResults, totalUsage, "max_iterations");
  }

  /**
   * Returns a HandlerFunction compatible with synkro's event system.
   * The handler extracts input from `ctx.payload.input` (string) and
   * writes the agent's output back via `ctx.setPayload()`.
   */
  asHandler(): HandlerFunction {
    return async (ctx: HandlerCtx) => {
      const payload = ctx.payload as Record<string, unknown> | undefined;
      const input = typeof payload?.input === "string"
        ? payload.input
        : JSON.stringify(payload);

      const result = await this.run(input, {
        requestId: ctx.requestId,
        payload: ctx.payload,
      });

      ctx.setPayload({
        agentOutput: result.output,
        agentStatus: result.status,
        agentTokenUsage: result.tokenUsage,
        agentToolCalls: result.toolCalls.length,
      });
    };
  }

  private buildContext(
    runId: string,
    payload: unknown,
    tokenUsage: TokenUsage,
  ): AgentContext {
    return {
      requestId: runId,
      payload: payload ?? {},
      publish: async () => runId,
      setPayload: () => {},
      agentName: this.name,
      runId,
      tokenUsage,
    };
  }

  private buildResult(
    runId: string,
    messages: Message[],
    toolCalls: ToolResult[],
    tokenUsage: TokenUsage,
    status: AgentRunResult["status"],
    errorMessage?: string,
  ): AgentRunResult {
    // Get last assistant message as output
    let output = "";
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i];
      if (msg && msg.role === "assistant") {
        output = msg.content;
        break;
      }
    }

    if (status === "failed" && errorMessage) {
      output = errorMessage;
    }

    return {
      agentName: this.name,
      runId,
      output,
      messages: messages.filter((m) => m.role !== "system"),
      toolCalls,
      tokenUsage,
      status,
    };
  }
}
