import { describe, it, expect, vi } from "vitest";
import { Agent } from "./agent.js";
import { AgentRegistry } from "./agent-registry.js";
import type { ModelProvider } from "./llm/provider.js";

function createMockAgent(name: string): Agent {
  const provider: ModelProvider = {
    chat: vi.fn(async () => ({
      content: "mock",
      usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      finishReason: "stop" as const,
    })),
  };

  return new Agent({
    name,
    systemPrompt: "test",
    provider,
    model: { model: "test" },
  });
}

describe("AgentRegistry", () => {
  it("should register and retrieve an agent by name", () => {
    const registry = new AgentRegistry();
    const agent = createMockAgent("agent-a");

    registry.register(agent);

    expect(registry.get("agent-a")).toBe(agent);
    expect(registry.has("agent-a")).toBe(true);
  });

  it("should return undefined for unknown agent", () => {
    const registry = new AgentRegistry();

    expect(registry.get("unknown")).toBeUndefined();
    expect(registry.has("unknown")).toBe(false);
  });

  it("should throw on duplicate registration", () => {
    const registry = new AgentRegistry();
    const agent = createMockAgent("agent-a");

    registry.register(agent);

    expect(() => registry.register(agent)).toThrow(
      'Agent "agent-a" is already registered',
    );
  });

  it("should list all registered agents", () => {
    const registry = new AgentRegistry();
    const agentA = createMockAgent("agent-a");
    const agentB = createMockAgent("agent-b");

    registry.register(agentA);
    registry.register(agentB);

    const list = registry.list();
    expect(list).toHaveLength(2);
    expect(list).toContain(agentA);
    expect(list).toContain(agentB);
  });
});
