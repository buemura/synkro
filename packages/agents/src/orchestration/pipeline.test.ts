import { describe, it, expect, vi } from "vitest";
import { Agent } from "../agent.js";
import { AgentRegistry } from "../agent-registry.js";
import type { ModelProvider } from "../llm/provider.js";
import type { ModelResponse } from "../llm/types.js";
import { createPipeline } from "./pipeline.js";

const USAGE = { promptTokens: 10, completionTokens: 5, totalTokens: 15 };

function createMockProvider(responses: ModelResponse[]): ModelProvider {
  let callIndex = 0;
  return {
    chat: vi.fn(async () => {
      const response = responses[callIndex];
      if (!response) {
        throw new Error("No more mock responses");
      }
      callIndex++;
      return response;
    }),
  };
}

function createSimpleAgent(name: string, output: string): Agent {
  const provider = createMockProvider([
    { content: output, usage: USAGE, finishReason: "stop" },
  ]);
  return new Agent({
    name,
    systemPrompt: `You are ${name}.`,
    provider,
    model: { model: "test-model" },
  });
}

describe("createPipeline", () => {
  it("should generate a SynkroWorkflow with correct step types", () => {
    const agentA = createSimpleAgent("agent-a", "output-a");
    const agentB = createSimpleAgent("agent-b", "output-b");

    const workflow = createPipeline({
      name: "test-pipeline",
      steps: [{ agent: agentA }, { agent: agentB }],
    });

    expect(workflow.name).toBe("test-pipeline");
    expect(workflow.steps).toHaveLength(2);
    expect(workflow.steps[0]!.type).toBe("step:0:agent-a");
    expect(workflow.steps[1]!.type).toBe("step:1:agent-b");
    expect(workflow.steps[0]!.handler).toBeTypeOf("function");
    expect(workflow.steps[1]!.handler).toBeTypeOf("function");
  });

  it("should chain agent outputs through pipeline steps", async () => {
    const agentA = createSimpleAgent("agent-a", "output-a");
    const agentB = createSimpleAgent("agent-b", "output-b");
    const agentC = createSimpleAgent("agent-c", "output-c");

    const workflow = createPipeline({
      name: "chain-pipeline",
      steps: [{ agent: agentA }, { agent: agentB }, { agent: agentC }],
    });

    // Simulate step 0
    let currentPayload: Record<string, unknown> = { input: "start" };
    const ctx0 = {
      requestId: "req-1",
      payload: currentPayload,
      publish: vi.fn(async () => ""),
      setPayload: vi.fn((data: Record<string, unknown>) => {
        currentPayload = { ...currentPayload, ...data };
      }),
    };
    await workflow.steps[0]!.handler!(ctx0);
    expect(ctx0.setPayload).toHaveBeenCalledWith(
      expect.objectContaining({ agentOutput: "output-a", agentStatus: "completed" }),
    );

    // Simulate step 1 — receives payload from step 0
    const ctx1 = {
      requestId: "req-1",
      payload: currentPayload,
      publish: vi.fn(async () => ""),
      setPayload: vi.fn((data: Record<string, unknown>) => {
        currentPayload = { ...currentPayload, ...data };
      }),
    };
    await workflow.steps[1]!.handler!(ctx1);
    expect(ctx1.setPayload).toHaveBeenCalledWith(
      expect.objectContaining({ agentOutput: "output-b" }),
    );

    // Simulate step 2
    const ctx2 = {
      requestId: "req-1",
      payload: currentPayload,
      publish: vi.fn(async () => ""),
      setPayload: vi.fn((data: Record<string, unknown>) => {
        currentPayload = { ...currentPayload, ...data };
      }),
    };
    await workflow.steps[2]!.handler!(ctx2);
    expect(currentPayload.agentOutput).toBe("output-c");
  });

  it("should use custom inputMapper when provided", async () => {
    const chatFn = vi.fn(async () => ({
      content: "mapped result",
      usage: USAGE,
      finishReason: "stop" as const,
    }));
    const provider: ModelProvider = { chat: chatFn };

    const agent = new Agent({
      name: "mapper-agent",
      systemPrompt: "Test.",
      provider,
      model: { model: "test-model" },
    });

    const workflow = createPipeline({
      name: "mapper-pipeline",
      steps: [
        {
          agent,
          inputMapper: (payload) => {
            const p = payload as Record<string, unknown>;
            return `Custom: ${p.data}`;
          },
        },
      ],
    });

    const ctx = {
      requestId: "req-1",
      payload: { data: "hello" },
      publish: vi.fn(async () => ""),
      setPayload: vi.fn(),
    };
    await workflow.steps[0]!.handler!(ctx);

    // Verify the agent received the custom-mapped input
    const messages = chatFn.mock.calls[0]![0] as Array<{ role: string; content: string }>;
    const userMsg = messages.find((m) => m.role === "user");
    expect(userMsg!.content).toBe("Custom: hello");
  });

  it("should resolve string agent names from registry", () => {
    const registry = new AgentRegistry();
    const agent = createSimpleAgent("agent-a", "output");
    registry.register(agent);

    const workflow = createPipeline({
      name: "registry-pipeline",
      steps: [{ agent: "agent-a" }],
      registry,
    });

    expect(workflow.steps).toHaveLength(1);
    expect(workflow.steps[0]!.type).toBe("step:0:agent-a");
  });

  it("should throw when resolving string agent without registry", () => {
    expect(() =>
      createPipeline({
        name: "no-registry",
        steps: [{ agent: "agent-a" }],
      }),
    ).toThrow("no registry provided");
  });

  it("should throw when agent name not found in registry", () => {
    const registry = new AgentRegistry();

    expect(() =>
      createPipeline({
        name: "missing-agent",
        steps: [{ agent: "nonexistent" }],
        registry,
      }),
    ).toThrow('not found in registry');
  });

  it("should throw when pipeline has no steps", () => {
    expect(() =>
      createPipeline({ name: "empty", steps: [] }),
    ).toThrow("must have at least one step");
  });

  it("should pass through workflow-level branching options", () => {
    const agent = createSimpleAgent("agent-a", "output");

    const workflow = createPipeline({
      name: "branching-pipeline",
      steps: [{ agent }],
      onSuccess: "next-workflow",
      onFailure: "error-workflow",
      onComplete: "cleanup-workflow",
    });

    expect(workflow.onSuccess).toBe("next-workflow");
    expect(workflow.onFailure).toBe("error-workflow");
    expect(workflow.onComplete).toBe("cleanup-workflow");
  });
});
