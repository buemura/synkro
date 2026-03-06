import "reflect-metadata";
import { describe, it, expect } from "vitest";
import { OnEvent } from "./on-event.decorator.js";
import { ON_EVENT_METADATA } from "../orko.constants.js";

describe("@OnEvent", () => {
  it("should set metadata with event type", () => {
    class TestHandler {
      @OnEvent("UserCreated")
      handle() {}
    }

    const metadata = Reflect.getMetadata(
      ON_EVENT_METADATA,
      TestHandler.prototype.handle,
    );
    expect(metadata).toEqual({
      eventType: "UserCreated",
      retry: undefined,
    });
  });

  it("should set metadata with event type and retry config", () => {
    class TestHandler {
      @OnEvent("OrderPlaced", { maxRetries: 3 })
      handle() {}
    }

    const metadata = Reflect.getMetadata(
      ON_EVENT_METADATA,
      TestHandler.prototype.handle,
    );
    expect(metadata).toEqual({
      eventType: "OrderPlaced",
      retry: { maxRetries: 3 },
    });
  });

  it("should support multiple decorated methods on the same class", () => {
    class TestHandler {
      @OnEvent("EventA")
      handleA() {}

      @OnEvent("EventB", { maxRetries: 1 })
      handleB() {}
    }

    const metadataA = Reflect.getMetadata(
      ON_EVENT_METADATA,
      TestHandler.prototype.handleA,
    );
    const metadataB = Reflect.getMetadata(
      ON_EVENT_METADATA,
      TestHandler.prototype.handleB,
    );

    expect(metadataA).toEqual({ eventType: "EventA", retry: undefined });
    expect(metadataB).toEqual({ eventType: "EventB", retry: { maxRetries: 1 } });
  });
});
