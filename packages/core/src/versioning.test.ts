import { describe, it, expect } from "vitest";
import { parseEventType, isVersionedEvent } from "./versioning.js";

describe("parseEventType", () => {
  it("should parse a versioned event type", () => {
    expect(parseEventType("user:created:v2")).toEqual({
      base: "user:created",
      version: 2,
      raw: "user:created:v2",
    });
  });

  it("should parse a versioned event with higher version number", () => {
    expect(parseEventType("order:placed:v15")).toEqual({
      base: "order:placed",
      version: 15,
      raw: "order:placed:v15",
    });
  });

  it("should treat unversioned event as base with null version", () => {
    expect(parseEventType("user:created")).toEqual({
      base: "user:created",
      version: null,
      raw: "user:created",
    });
  });

  it("should treat single-segment event as base with null version", () => {
    expect(parseEventType("ping")).toEqual({
      base: "ping",
      version: null,
      raw: "ping",
    });
  });

  it("should handle v1 as a versioned event", () => {
    expect(parseEventType("user:created:v1")).toEqual({
      base: "user:created",
      version: 1,
      raw: "user:created:v1",
    });
  });

  it("should not treat :vX in the middle as a version", () => {
    // Only trailing :vN is treated as a version
    expect(parseEventType("v2:user:created")).toEqual({
      base: "v2:user:created",
      version: null,
      raw: "v2:user:created",
    });
  });
});

describe("isVersionedEvent", () => {
  it("should return true for versioned events", () => {
    expect(isVersionedEvent("user:created:v2")).toBe(true);
    expect(isVersionedEvent("order:placed:v1")).toBe(true);
  });

  it("should return false for unversioned events", () => {
    expect(isVersionedEvent("user:created")).toBe(false);
    expect(isVersionedEvent("ping")).toBe(false);
  });
});
