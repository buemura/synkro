import { describe, it, expect } from "vitest";
import { ToolRegistry } from "./tool-registry.js";
import { ToolExecutor } from "./tool-executor.js";
import type { Tool } from "./types.js";
import type { AgentContext } from "../types.js";

const mockCtx: AgentContext = {
  requestId: "test",
  payload: {},
  publish: async () => "",
  setPayload: () => {},
  agentName: "test",
  runId: "test",
  tokenUsage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
};

describe("ToolExecutor", () => {
  it("should execute a tool and return result", async () => {
    const registry = new ToolRegistry();
    const tool: Tool<{ x: number }, number> = {
      name: "double",
      description: "Doubles a number",
      parameters: { type: "object", properties: { x: { type: "number" } } },
      execute: async (input) => input.x * 2,
    };
    registry.register(tool);

    const executor = new ToolExecutor(registry);
    const result = await executor.execute(
      { id: "tc-1", name: "double", arguments: '{"x": 5}' },
      mockCtx,
    );

    expect(result.result).toBe(10);
    expect(result.error).toBeUndefined();
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("should return error for unknown tool", async () => {
    const registry = new ToolRegistry();
    const executor = new ToolExecutor(registry);

    const result = await executor.execute(
      { id: "tc-1", name: "missing", arguments: "{}" },
      mockCtx,
    );

    expect(result.error).toContain("not found");
    expect(result.result).toBeNull();
  });

  it("should return error for invalid JSON arguments", async () => {
    const registry = new ToolRegistry();
    registry.register({
      name: "test",
      description: "Test",
      parameters: { type: "object", properties: {} },
      execute: async () => "ok",
    });

    const executor = new ToolExecutor(registry);
    const result = await executor.execute(
      { id: "tc-1", name: "test", arguments: "not-json" },
      mockCtx,
    );

    expect(result.error).toContain("Invalid tool arguments");
  });

  it("should execute multiple tools in parallel", async () => {
    const registry = new ToolRegistry();
    registry.register({
      name: "a",
      description: "A",
      parameters: { type: "object", properties: {} },
      execute: async () => "result-a",
    });
    registry.register({
      name: "b",
      description: "B",
      parameters: { type: "object", properties: {} },
      execute: async () => "result-b",
    });

    const executor = new ToolExecutor(registry);
    const results = await executor.executeAll(
      [
        { id: "tc-1", name: "a", arguments: "{}" },
        { id: "tc-2", name: "b", arguments: "{}" },
      ],
      mockCtx,
    );

    expect(results).toHaveLength(2);
    expect(results[0]!.result).toBe("result-a");
    expect(results[1]!.result).toBe("result-b");
  });
});
