import { describe, it, expect, vi } from "vitest";
import { composeMiddleware } from "./middleware.js";
import type { MiddlewareCtx, MiddlewareFunction } from "./types.js";

function createCtx(overrides?: Partial<MiddlewareCtx>): MiddlewareCtx {
  return {
    requestId: "req-1",
    payload: { foo: "bar" },
    eventType: "test:event",
    publish: vi.fn() as never,
    setPayload: vi.fn(),
    ...overrides,
  };
}

describe("composeMiddleware", () => {
  it("should call handler directly when no middlewares are provided", async () => {
    const handler = vi.fn().mockResolvedValue(undefined);
    const composed = composeMiddleware([]);

    await composed(createCtx(), handler);

    expect(handler).toHaveBeenCalledOnce();
  });

  it("should execute middlewares in registration order (onion model)", async () => {
    const order: string[] = [];

    const mw1: MiddlewareFunction = async (ctx, next) => {
      order.push("mw1-before");
      await next();
      order.push("mw1-after");
    };

    const mw2: MiddlewareFunction = async (ctx, next) => {
      order.push("mw2-before");
      await next();
      order.push("mw2-after");
    };

    const handler = async () => {
      order.push("handler");
    };

    await composeMiddleware([mw1, mw2])(createCtx(), handler);

    expect(order).toEqual([
      "mw1-before",
      "mw2-before",
      "handler",
      "mw2-after",
      "mw1-after",
    ]);
  });

  it("should prevent handler execution when middleware does not call next()", async () => {
    const handler = vi.fn();

    const blocker: MiddlewareFunction = async (_ctx, _next) => {
      // intentionally not calling next()
    };

    await composeMiddleware([blocker])(createCtx(), handler);

    expect(handler).not.toHaveBeenCalled();
  });

  it("should propagate middleware errors", async () => {
    const failing: MiddlewareFunction = async (_ctx, _next) => {
      throw new Error("middleware error");
    };

    await expect(
      composeMiddleware([failing])(createCtx(), vi.fn()),
    ).rejects.toThrow("middleware error");
  });

  it("should propagate handler errors through middleware", async () => {
    const order: string[] = [];

    const mw: MiddlewareFunction = async (_ctx, next) => {
      order.push("mw-before");
      try {
        await next();
      } catch {
        order.push("mw-catch");
        throw new Error("wrapped error");
      }
    };

    const handler = async () => {
      throw new Error("handler error");
    };

    await expect(
      composeMiddleware([mw])(createCtx(), handler),
    ).rejects.toThrow("wrapped error");

    expect(order).toEqual(["mw-before", "mw-catch"]);
  });

  it("should reject if next() is called multiple times", async () => {
    const doubleCall: MiddlewareFunction = async (_ctx, next) => {
      await next();
      await next();
    };

    await expect(
      composeMiddleware([doubleCall])(createCtx(), vi.fn()),
    ).rejects.toThrow("next() called multiple times");
  });

  it("should provide eventType on the context", async () => {
    let receivedEventType: string | undefined;

    const mw: MiddlewareFunction = async (ctx, next) => {
      receivedEventType = ctx.eventType;
      await next();
    };

    await composeMiddleware([mw])(createCtx({ eventType: "user:created" }), vi.fn());

    expect(receivedEventType).toBe("user:created");
  });
});
