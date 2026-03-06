import { describe, it, expect, vi, beforeEach } from "vitest";
import { Synkro } from "./synkro.js";

const mockPublish = vi.fn();
const mockSubscribe = vi.fn().mockResolvedValue(1);
const mockOn = vi.fn();
const mockGet = vi.fn();
const mockSet = vi.fn().mockResolvedValue("OK");
const mockDel = vi.fn();
const mockQuit = vi.fn().mockResolvedValue("OK");

vi.mock("ioredis", () => {
  class MockRedis {
    publish = mockPublish;
    subscribe = mockSubscribe;
    on = mockOn;
    get = mockGet;
    set = mockSet;
    del = mockDel;
    quit = mockQuit;
  }
  return { Redis: MockRedis };
});

describe("Synkro", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("start", () => {
    it("should create an instance with minimal options", async () => {
      const instance = await Synkro.start({
        connectionUrl: "redis://localhost:6379",
      });
      expect(instance).toBeInstanceOf(Synkro);
    });

    it("should register events provided in options", async () => {
      const handler = vi.fn();
      await Synkro.start({
        connectionUrl: "redis://localhost:6379",
        events: [{ type: "user:created", handler }],
      });

      expect(mockSubscribe).toHaveBeenCalledWith("user:created");
    });

    it("should register workflows provided in options", async () => {
      const handler = vi.fn();
      await Synkro.start({
        connectionUrl: "redis://localhost:6379",
        workflows: [
          {
            name: "my-workflow",
            steps: [{ type: "step1", handler }],
          },
        ],
      });

      // Workflow step should be registered as handler
      expect(mockSubscribe).toHaveBeenCalledWith("workflow:my-workflow:step1");
    });
  });

  describe("on", () => {
    it("should register a handler at runtime", async () => {
      const instance = await Synkro.start({
        connectionUrl: "redis://localhost:6379",
      });

      const handler = vi.fn();
      instance.on("order:placed", handler);

      expect(mockSubscribe).toHaveBeenCalledWith("order:placed");
    });
  });

  describe("publish", () => {
    it("should publish an event with a generated requestId", async () => {
      const instance = await Synkro.start({
        connectionUrl: "redis://localhost:6379",
      });

      const requestId = await instance.publish("user:created", {
        name: "Bob",
      });

      expect(requestId).toBeDefined();
      expect(typeof requestId).toBe("string");
      expect(mockPublish).toHaveBeenCalledWith(
        "user:created",
        expect.stringContaining('"payload"'),
      );
    });

    it("should use a custom requestId when provided", async () => {
      const instance = await Synkro.start({
        connectionUrl: "redis://localhost:6379",
      });

      const requestId = await instance.publish(
        "user:created",
        { name: "Bob" },
        "custom-id",
      );

      expect(requestId).toBe("custom-id");
      const publishedMessage = mockPublish.mock.calls[0]![1] as string;
      const parsed = JSON.parse(publishedMessage) as {
        requestId: string;
        payload: unknown;
      };
      expect(parsed.requestId).toBe("custom-id");
    });

    it("should start a workflow when event matches a workflow name", async () => {
      const handler = vi.fn();
      const instance = await Synkro.start({
        connectionUrl: "redis://localhost:6379",
        workflows: [
          {
            name: "order-flow",
            steps: [{ type: "validate", handler }],
          },
        ],
      });

      const requestId = await instance.publish("order-flow", {
        orderId: 1,
      });

      expect(requestId).toBeDefined();
      // Should save workflow state
      expect(mockSet).toHaveBeenCalled();
      // Should publish to the workflow step channel
      expect(mockPublish).toHaveBeenCalledWith(
        "workflow:order-flow:validate",
        expect.any(String),
      );
    });

    it("should publish as a regular event when no workflow matches", async () => {
      const instance = await Synkro.start({
        connectionUrl: "redis://localhost:6379",
      });

      await instance.publish("some:event", { data: 1 });

      expect(mockPublish).toHaveBeenCalledWith(
        "some:event",
        expect.any(String),
      );
    });
  });

  describe("stop", () => {
    it("should disconnect all Redis clients", async () => {
      const instance = await Synkro.start({
        connectionUrl: "redis://localhost:6379",
      });

      await instance.stop();

      expect(mockQuit).toHaveBeenCalledTimes(3);
    });
  });
});
