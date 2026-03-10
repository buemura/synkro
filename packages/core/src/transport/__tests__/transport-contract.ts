import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import type { TransportManager } from "../transport.js";

export function transportContractTests(
  name: string,
  factory: () => TransportManager | Promise<TransportManager>,
): void {
  describe(`TransportManager contract: ${name}`, () => {
    let transport: TransportManager;

    beforeEach(async () => {
      vi.useFakeTimers();
      transport = await factory();
    });

    afterEach(async () => {
      await transport.disconnect();
      vi.useRealTimers();
    });

    // ───────────────────────────── Pub/Sub ─────────────────────────────

    describe("publishMessage / subscribeToChannel", () => {
      it("should deliver a published message to a subscriber", async () => {
        const received: string[] = [];
        transport.subscribeToChannel("ch1", (msg) => received.push(msg));

        await transport.publishMessage("ch1", "hello");
        await vi.advanceTimersByTimeAsync(0);

        expect(received).toEqual(["hello"]);
      });

      it("should deliver to multiple subscribers on the same channel", async () => {
        const a: string[] = [];
        const b: string[] = [];
        transport.subscribeToChannel("ch2", (msg) => a.push(msg));
        transport.subscribeToChannel("ch2", (msg) => b.push(msg));

        await transport.publishMessage("ch2", "ping");
        await vi.advanceTimersByTimeAsync(0);

        expect(a).toEqual(["ping"]);
        expect(b).toEqual(["ping"]);
      });

      it("should not deliver to subscribers on a different channel", async () => {
        const received: string[] = [];
        transport.subscribeToChannel("ch-a", (msg) => received.push(msg));

        await transport.publishMessage("ch-b", "nope");
        await vi.advanceTimersByTimeAsync(0);

        expect(received).toEqual([]);
      });

      it("should not deliver after publish when no subscribers exist", async () => {
        // Should not throw
        await transport.publishMessage("no-sub", "orphan");
      });
    });

    // ───────────────────────────── Unsubscribe ─────────────────────────────

    describe("unsubscribeFromChannel", () => {
      it("should stop delivering messages after unsubscribe", async () => {
        const received: string[] = [];
        transport.subscribeToChannel("ch-unsub", (msg) => received.push(msg));

        await transport.publishMessage("ch-unsub", "before");
        await vi.advanceTimersByTimeAsync(0);
        expect(received).toEqual(["before"]);

        transport.unsubscribeFromChannel("ch-unsub");

        await transport.publishMessage("ch-unsub", "after");
        await vi.advanceTimersByTimeAsync(0);
        expect(received).toEqual(["before"]);
      });
    });

    // ───────────────────────────── Cache: basic ─────────────────────────────

    describe("cache operations", () => {
      it("should return null for a missing key", async () => {
        expect(await transport.getCache("missing")).toBeNull();
      });

      it("should set and get a value", async () => {
        await transport.setCache("k1", "v1");
        expect(await transport.getCache("k1")).toBe("v1");
      });

      it("should overwrite an existing value", async () => {
        await transport.setCache("k1", "old");
        await transport.setCache("k1", "new");
        expect(await transport.getCache("k1")).toBe("new");
      });

      it("should delete a cached value", async () => {
        await transport.setCache("k1", "v1");
        await transport.deleteCache("k1");
        expect(await transport.getCache("k1")).toBeNull();
      });
    });

    // ───────────────────────────── Cache: setCacheIfNotExists ─────────────────────────────

    describe("setCacheIfNotExists", () => {
      it("should return true and set value when key is missing", async () => {
        const result = await transport.setCacheIfNotExists("nx", "first");
        expect(result).toBe(true);
        expect(await transport.getCache("nx")).toBe("first");
      });

      it("should return false and preserve value when key exists", async () => {
        await transport.setCacheIfNotExists("nx2", "first");
        const result = await transport.setCacheIfNotExists("nx2", "second");
        expect(result).toBe(false);
        expect(await transport.getCache("nx2")).toBe("first");
      });
    });

    // ───────────────────────────── Cache: TTL ─────────────────────────────

    describe("cache TTL", () => {
      it("should return value before TTL expires", async () => {
        await transport.setCache("ttl-key", "alive", 10);
        await vi.advanceTimersByTimeAsync(5000);
        expect(await transport.getCache("ttl-key")).toBe("alive");
      });

      it("should return null after TTL expires", async () => {
        await transport.setCache("ttl-key", "ephemeral", 2);
        await vi.advanceTimersByTimeAsync(2000);
        expect(await transport.getCache("ttl-key")).toBeNull();
      });

      it("should expire setCacheIfNotExists keys after TTL", async () => {
        await transport.setCacheIfNotExists("nx-ttl", "val", 1);
        await vi.advanceTimersByTimeAsync(1000);
        expect(await transport.getCache("nx-ttl")).toBeNull();

        // Should be settable again after expiry
        const result = await transport.setCacheIfNotExists("nx-ttl", "new");
        expect(result).toBe(true);
      });
    });

    // ───────────────────────────── Increment ─────────────────────────────

    describe("incrementCache", () => {
      it("should return 1 when incrementing a missing key", async () => {
        expect(await transport.incrementCache("counter")).toBe(1);
      });

      it("should increment on subsequent calls", async () => {
        await transport.incrementCache("counter2");
        await transport.incrementCache("counter2");
        expect(await transport.incrementCache("counter2")).toBe(3);
      });

      it("should apply TTL when provided", async () => {
        await transport.incrementCache("counter-ttl", 2);
        await vi.advanceTimersByTimeAsync(2000);
        expect(await transport.getCache("counter-ttl")).toBeNull();
      });
    });

    // ───────────────────────────── Lists ─────────────────────────────

    describe("list operations", () => {
      it("should return empty array for missing list", async () => {
        expect(await transport.getListRange("no-list", 0, -1)).toEqual([]);
      });

      it("should push and retrieve items in order", async () => {
        await transport.pushToList("list1", "a");
        await transport.pushToList("list1", "b");
        await transport.pushToList("list1", "c");
        expect(await transport.getListRange("list1", 0, -1)).toEqual(["a", "b", "c"]);
      });

      it("should support positive range indices", async () => {
        await transport.pushToList("list2", "a");
        await transport.pushToList("list2", "b");
        await transport.pushToList("list2", "c");
        expect(await transport.getListRange("list2", 0, 1)).toEqual(["a", "b"]);
      });

      it("should support negative stop index", async () => {
        await transport.pushToList("list3", "a");
        await transport.pushToList("list3", "b");
        await transport.pushToList("list3", "c");
        // 0 to -2 means first two elements (all except last)
        expect(await transport.getListRange("list3", 0, -2)).toEqual(["a", "b"]);
      });
    });

    // ───────────────────────────── deleteKey ─────────────────────────────

    describe("deleteKey", () => {
      it("should remove a list", async () => {
        await transport.pushToList("del-list", "x");
        await transport.deleteKey("del-list");
        expect(await transport.getListRange("del-list", 0, -1)).toEqual([]);
      });

      it("should remove a cache entry", async () => {
        await transport.setCache("del-cache", "x");
        await transport.deleteKey("del-cache");
        expect(await transport.getCache("del-cache")).toBeNull();
      });
    });

    // ───────────────────────────── disconnect ─────────────────────────────

    describe("disconnect", () => {
      it("should clear all state after disconnect", async () => {
        await transport.setCache("dc-key", "val");
        await transport.pushToList("dc-list", "item");
        transport.subscribeToChannel("dc-ch", () => {});

        await transport.disconnect();

        expect(await transport.getCache("dc-key")).toBeNull();
        expect(await transport.getListRange("dc-list", 0, -1)).toEqual([]);

        // Publish should not throw after disconnect
        const received: string[] = [];
        transport.subscribeToChannel("dc-ch", (msg) => received.push(msg));
        await transport.publishMessage("dc-ch", "post-dc");
        await vi.advanceTimersByTimeAsync(0);
        // After disconnect + re-subscribe, should work fresh
        expect(received).toEqual(["post-dc"]);
      });
    });
  });
}
