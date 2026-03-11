import { describe, it, expect, vi } from "vitest";
import { Agent } from "./agent.js";
import { AgentRegistry } from "./agent-registry.js";
import type { ModelProvider } from "./llm/provider.js";
import type { Message, ModelOptions, ModelResponse } from "./llm/types.js";
import type { Tool } from "./tools/types.js";
import type { AgentContext } from "./types.js";

function createMockProvider(
  responses: ModelResponse[],
): ModelProvider {
  let callIndex = 0;
  return {
    chat: vi.fn(async (_messages: Message[], _options: ModelOptions) => {
      const response = responses[callIndex];
      if (!response) {
        throw new Error("No more mock responses");
      }
      callIndex++;
      return response;
    }),
  };
}

const USAGE = { promptTokens: 10, completionTokens: 5, totalTokens: 15 };

describe("Agent", () => {
  it("should return a simple text response", async () => {
    const provider = createMockProvider([
      { content: "Hello!", usage: USAGE, finishReason: "stop" },
    ]);

    const agent = new Agent({
      name: "test-agent",
      systemPrompt: "You are a test agent.",
      provider,
      model: { model: "test-model" },
    });

    const result = await agent.run("Hi");

    expect(result.status).toBe("completed");
    expect(result.output).toBe("Hello!");
    expect(result.agentName).toBe("test-agent");
    expect(result.tokenUsage.totalTokens).toBe(15);
    expect(result.toolCalls).toHaveLength(0);
  });

  it("should execute tools and return final response", async () => {
    const provider = createMockProvider([
      {
        content: "",
        toolCalls: [
          { id: "tc-1", name: "add", arguments: '{"a": 2, "b": 3}' },
        ],
        usage: USAGE,
        finishReason: "tool_calls",
      },
      {
        content: "The sum is 5.",
        usage: USAGE,
        finishReason: "stop",
      },
    ]);

    const addTool: Tool<{ a: number; b: number }, number> = {
      name: "add",
      description: "Add two numbers",
      parameters: {
        type: "object",
        properties: {
          a: { type: "number" },
          b: { type: "number" },
        },
        required: ["a", "b"],
      },
      execute: async (input) => input.a + input.b,
    };

    const agent = new Agent({
      name: "math-agent",
      systemPrompt: "You are a math agent.",
      provider,
      model: { model: "test-model" },
      tools: [addTool],
    });

    const result = await agent.run("What is 2 + 3?");

    expect(result.status).toBe("completed");
    expect(result.output).toBe("The sum is 5.");
    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolCalls[0]!.name).toBe("add");
    expect(result.toolCalls[0]!.result).toBe(5);
    expect(result.tokenUsage.totalTokens).toBe(30);
  });

  it("should handle tool execution errors gracefully", async () => {
    const provider = createMockProvider([
      {
        content: "",
        toolCalls: [
          { id: "tc-1", name: "fail_tool", arguments: "{}" },
        ],
        usage: USAGE,
        finishReason: "tool_calls",
      },
      {
        content: "The tool failed, sorry.",
        usage: USAGE,
        finishReason: "stop",
      },
    ]);

    const failTool: Tool = {
      name: "fail_tool",
      description: "A tool that always fails",
      parameters: { type: "object", properties: {} },
      execute: async () => {
        throw new Error("Something went wrong");
      },
    };

    const agent = new Agent({
      name: "error-agent",
      systemPrompt: "You handle errors.",
      provider,
      model: { model: "test-model" },
      tools: [failTool],
    });

    const result = await agent.run("Try the tool");

    expect(result.status).toBe("completed");
    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolCalls[0]!.error).toBe("Something went wrong");
  });

  it("should stop at maxIterations", async () => {
    // Provider always returns tool calls, never stops
    const toolCallResponse: ModelResponse = {
      content: "",
      toolCalls: [{ id: "tc-1", name: "loop_tool", arguments: "{}" }],
      usage: USAGE,
      finishReason: "tool_calls",
    };

    const provider = createMockProvider(
      Array.from({ length: 5 }, () => toolCallResponse),
    );

    const loopTool: Tool = {
      name: "loop_tool",
      description: "Loops forever",
      parameters: { type: "object", properties: {} },
      execute: async () => "ok",
    };

    const agent = new Agent({
      name: "loop-agent",
      systemPrompt: "You loop.",
      provider,
      model: { model: "test-model" },
      maxIterations: 3,
      tools: [loopTool],
    });

    const result = await agent.run("Loop");

    expect(result.status).toBe("max_iterations");
    expect(result.toolCalls).toHaveLength(3);
  });

  it("should stop when token budget is exceeded", async () => {
    const provider = createMockProvider([
      {
        content: "",
        toolCalls: [{ id: "tc-1", name: "expensive_tool", arguments: "{}" }],
        usage: { promptTokens: 500, completionTokens: 500, totalTokens: 1000 },
        finishReason: "tool_calls",
      },
    ]);

    const tool: Tool = {
      name: "expensive_tool",
      description: "Expensive",
      parameters: { type: "object", properties: {} },
      execute: async () => "result",
    };

    const agent = new Agent({
      name: "budget-agent",
      systemPrompt: "Budget test.",
      provider,
      model: { model: "test-model" },
      tools: [tool],
      tokenBudget: 500,
    });

    const result = await agent.run("Test");

    expect(result.status).toBe("token_budget_exceeded");
    expect(result.tokenUsage.totalTokens).toBe(1000);
  });

  it("should handle LLM call failures", async () => {
    const provider: ModelProvider = {
      chat: vi.fn(async () => {
        throw new Error("API rate limited");
      }),
    };

    const agent = new Agent({
      name: "fail-agent",
      systemPrompt: "Test.",
      provider,
      model: { model: "test-model" },
    });

    const result = await agent.run("Test");

    expect(result.status).toBe("failed");
    expect(result.output).toContain("API rate limited");
  });

  it("should call onTokenUsage callback", async () => {
    const onTokenUsage = vi.fn();
    const provider = createMockProvider([
      { content: "Done", usage: USAGE, finishReason: "stop" },
    ]);

    const agent = new Agent({
      name: "callback-agent",
      systemPrompt: "Test.",
      provider,
      model: { model: "test-model" },
      onTokenUsage,
    });

    await agent.run("Test");

    expect(onTokenUsage).toHaveBeenCalledWith(
      expect.objectContaining({ totalTokens: 15 }),
    );
  });

  it("should handle unknown tool calls gracefully", async () => {
    const provider = createMockProvider([
      {
        content: "",
        toolCalls: [
          { id: "tc-1", name: "nonexistent", arguments: "{}" },
        ],
        usage: USAGE,
        finishReason: "tool_calls",
      },
      {
        content: "I don't have that tool.",
        usage: USAGE,
        finishReason: "stop",
      },
    ]);

    const agent = new Agent({
      name: "no-tools-agent",
      systemPrompt: "Test.",
      provider,
      model: { model: "test-model" },
    });

    const result = await agent.run("Use a tool");

    expect(result.status).toBe("completed");
    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolCalls[0]!.error).toContain("not found");
  });

  describe("asHandler", () => {
    it("should bridge agent to synkro HandlerFunction", async () => {
      const provider = createMockProvider([
        { content: "Agent response", usage: USAGE, finishReason: "stop" },
      ]);

      const agent = new Agent({
        name: "handler-agent",
        systemPrompt: "You are a handler.",
        provider,
        model: { model: "test-model" },
      });

      const handler = agent.asHandler();
      const setPayload = vi.fn();

      await handler({
        requestId: "req-123",
        payload: { input: "Hello from synkro" },
        publish: vi.fn(async () => ""),
        setPayload,
      });

      expect(setPayload).toHaveBeenCalledWith(
        expect.objectContaining({
          agentOutput: "Agent response",
          agentStatus: "completed",
        }),
      );
    });

    it("should serialize non-string payloads as input", async () => {
      const chatFn = vi.fn(async () => ({
        content: "Got it",
        usage: USAGE,
        finishReason: "stop" as const,
      }));

      const provider: ModelProvider = { chat: chatFn };

      const agent = new Agent({
        name: "serialize-agent",
        systemPrompt: "Test.",
        provider,
        model: { model: "test-model" },
      });

      const handler = agent.asHandler();

      await handler({
        requestId: "req-456",
        payload: { data: 42 },
        publish: vi.fn(async () => ""),
        setPayload: vi.fn(),
      });

      // The user message should contain the serialized payload
      const messages = chatFn.mock.calls[0]![0] as Message[];
      const userMsg = messages.find((m) => m.role === "user");
      expect(userMsg!.content).toBe('{"data":42}');
    });

    it("should pass live publish to tools via asHandler", async () => {
      const publishSpy = vi.fn(async () => "pub-id");

      const publishTool: Tool = {
        name: "emit",
        description: "Emits an event",
        parameters: { type: "object", properties: {} },
        execute: async (_input: unknown, ctx: AgentContext) => {
          await ctx.publish("order:updated", { orderId: "123" });
          return "emitted";
        },
      };

      const provider = createMockProvider([
        {
          content: "",
          toolCalls: [{ id: "tc-1", name: "emit", arguments: "{}" }],
          usage: USAGE,
          finishReason: "tool_calls",
        },
        { content: "Done", usage: USAGE, finishReason: "stop" },
      ]);

      const agent = new Agent({
        name: "publish-agent",
        systemPrompt: "Test.",
        provider,
        model: { model: "test-model" },
        tools: [publishTool],
      });

      const handler = agent.asHandler();

      await handler({
        requestId: "req-789",
        payload: { input: "emit event" },
        publish: publishSpy,
        setPayload: vi.fn(),
      });

      expect(publishSpy).toHaveBeenCalledWith("order:updated", { orderId: "123" });
    });

    it("should keep no-op stubs in standalone run", async () => {
      let capturedPublish: ((event: string) => Promise<string>) | undefined;

      const captureTool: Tool = {
        name: "capture",
        description: "Captures context",
        parameters: { type: "object", properties: {} },
        execute: async (_input: unknown, ctx: AgentContext) => {
          capturedPublish = ctx.publish;
          return "captured";
        },
      };

      const provider = createMockProvider([
        {
          content: "",
          toolCalls: [{ id: "tc-1", name: "capture", arguments: "{}" }],
          usage: USAGE,
          finishReason: "tool_calls",
        },
        { content: "Done", usage: USAGE, finishReason: "stop" },
      ]);

      const agent = new Agent({
        name: "standalone-agent",
        systemPrompt: "Test.",
        provider,
        model: { model: "test-model" },
        tools: [captureTool],
      });

      const result = await agent.run("test");

      expect(result.status).toBe("completed");
      // Standalone publish returns runId (no-op stub), not empty string
      const pubResult = await capturedPublish!("some:event");
      expect(typeof pubResult).toBe("string");
      expect(pubResult).toBe(result.runId);
    });
  });

  describe("delegate", () => {
    it("should delegate to another agent via registry", async () => {
      const registry = new AgentRegistry();

      const providerB = createMockProvider([
        { content: "Response from B", usage: USAGE, finishReason: "stop" },
      ]);
      const agentB = new Agent({
        name: "agent-b",
        systemPrompt: "You are agent B.",
        provider: providerB,
        model: { model: "test-model" },
        registry,
      });
      registry.register(agentB);

      const delegateTool: Tool = {
        name: "delegate_tool",
        description: "Delegates to agent B",
        parameters: { type: "object", properties: {} },
        execute: async (_input: unknown, ctx: AgentContext) => {
          const result = await ctx.delegate("agent-b", "hello from A");
          return result.output;
        },
      };

      const providerA = createMockProvider([
        {
          content: "",
          toolCalls: [{ id: "tc-1", name: "delegate_tool", arguments: "{}" }],
          usage: USAGE,
          finishReason: "tool_calls",
        },
        { content: "A got: Response from B", usage: USAGE, finishReason: "stop" },
      ]);
      const agentA = new Agent({
        name: "agent-a",
        systemPrompt: "You are agent A.",
        provider: providerA,
        model: { model: "test-model" },
        tools: [delegateTool],
        registry,
      });
      registry.register(agentA);

      const result = await agentA.run("delegate to B");

      expect(result.status).toBe("completed");
      expect(result.output).toBe("A got: Response from B");
    });

    it("should accumulate delegated token usage into parent", async () => {
      const registry = new AgentRegistry();
      const bigUsage = { promptTokens: 100, completionTokens: 50, totalTokens: 150 };

      const providerB = createMockProvider([
        { content: "B result", usage: bigUsage, finishReason: "stop" },
      ]);
      const agentB = new Agent({
        name: "agent-b",
        systemPrompt: "B",
        provider: providerB,
        model: { model: "test-model" },
        registry,
      });
      registry.register(agentB);

      const delegateTool: Tool = {
        name: "delegate_tool",
        description: "Delegates",
        parameters: { type: "object", properties: {} },
        execute: async (_input: unknown, ctx: AgentContext) => {
          await ctx.delegate("agent-b", "work");
          return "done";
        },
      };

      const providerA = createMockProvider([
        {
          content: "",
          toolCalls: [{ id: "tc-1", name: "delegate_tool", arguments: "{}" }],
          usage: USAGE,
          finishReason: "tool_calls",
        },
        { content: "Final", usage: USAGE, finishReason: "stop" },
      ]);
      const agentA = new Agent({
        name: "agent-a",
        systemPrompt: "A",
        provider: providerA,
        model: { model: "test-model" },
        tools: [delegateTool],
        registry,
      });
      registry.register(agentA);

      const result = await agentA.run("go");

      // Parent tokens (15 + 15) + delegated (150) = 180
      expect(result.tokenUsage.totalTokens).toBe(180);
    });

    it("should throw when delegating to unknown agent", async () => {
      const registry = new AgentRegistry();

      const delegateTool: Tool = {
        name: "delegate_tool",
        description: "Delegates to unknown",
        parameters: { type: "object", properties: {} },
        execute: async (_input: unknown, ctx: AgentContext) => {
          await ctx.delegate("nonexistent", "hello");
          return "done";
        },
      };

      const provider = createMockProvider([
        {
          content: "",
          toolCalls: [{ id: "tc-1", name: "delegate_tool", arguments: "{}" }],
          usage: USAGE,
          finishReason: "tool_calls",
        },
        { content: "Error handled", usage: USAGE, finishReason: "stop" },
      ]);
      const agent = new Agent({
        name: "agent-a",
        systemPrompt: "A",
        provider,
        model: { model: "test-model" },
        tools: [delegateTool],
        registry,
      });

      const result = await agent.run("delegate");

      expect(result.toolCalls[0]!.error).toContain("nonexistent");
    });

    it("should throw when delegating without registry", async () => {
      const delegateTool: Tool = {
        name: "delegate_tool",
        description: "Delegates without registry",
        parameters: { type: "object", properties: {} },
        execute: async (_input: unknown, ctx: AgentContext) => {
          await ctx.delegate("some-agent", "hello");
          return "done";
        },
      };

      const provider = createMockProvider([
        {
          content: "",
          toolCalls: [{ id: "tc-1", name: "delegate_tool", arguments: "{}" }],
          usage: USAGE,
          finishReason: "tool_calls",
        },
        { content: "Error handled", usage: USAGE, finishReason: "stop" },
      ]);
      const agent = new Agent({
        name: "no-registry-agent",
        systemPrompt: "Test",
        provider,
        model: { model: "test-model" },
        tools: [delegateTool],
      });

      const result = await agent.run("delegate");

      expect(result.toolCalls[0]!.error).toContain("no agent registry");
    });
  });
});
