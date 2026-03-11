import { describe, it, expect } from "vitest";
import { ToolRegistry } from "./tool-registry.js";
import type { Tool } from "./types.js";

const makeTool = (name: string): Tool => ({
  name,
  description: `Tool ${name}`,
  parameters: { type: "object", properties: {} },
  execute: async () => "ok",
});

describe("ToolRegistry", () => {
  it("should register and retrieve a tool", () => {
    const registry = new ToolRegistry();
    const tool = makeTool("test");
    registry.register(tool);

    expect(registry.get("test")).toBe(tool);
    expect(registry.has("test")).toBe(true);
  });

  it("should return undefined for unknown tools", () => {
    const registry = new ToolRegistry();
    expect(registry.get("unknown")).toBeUndefined();
    expect(registry.has("unknown")).toBe(false);
  });

  it("should throw on duplicate registration", () => {
    const registry = new ToolRegistry();
    registry.register(makeTool("dup"));

    expect(() => registry.register(makeTool("dup"))).toThrow(
      'Tool "dup" is already registered',
    );
  });

  it("should return tool definitions for LLM", () => {
    const registry = new ToolRegistry();
    registry.register(makeTool("a"));
    registry.register(makeTool("b"));

    const defs = registry.getDefinitions();
    expect(defs).toHaveLength(2);
    expect(defs[0]!.name).toBe("a");
    expect(defs[1]!.name).toBe("b");
  });

  it("should list all registered tools", () => {
    const registry = new ToolRegistry();
    registry.register(makeTool("x"));
    registry.register(makeTool("y"));

    expect(registry.list()).toHaveLength(2);
  });
});
