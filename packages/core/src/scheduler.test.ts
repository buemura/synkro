import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Scheduler } from "./scheduler.js";
import type { PublishFunction } from "./types.js";

describe("Scheduler", () => {
  let publishFn: PublishFunction;
  let scheduler: Scheduler;

  beforeEach(() => {
    vi.useFakeTimers();
    publishFn = vi.fn().mockResolvedValue("req-id");
    scheduler = new Scheduler(publishFn);
  });

  afterEach(() => {
    scheduler.clearAll();
    vi.useRealTimers();
  });

  // ───────────────────────────── publishDelayed ─────────────────────────────

  describe("publishDelayed", () => {
    it("should return a requestId immediately", () => {
      const requestId = scheduler.publishDelayed("test:event", { a: 1 }, 5000);
      expect(typeof requestId).toBe("string");
      expect(requestId.length).toBeGreaterThan(0);
      expect(publishFn).not.toHaveBeenCalled();
    });

    it("should call publishFn after the delay", async () => {
      const requestId = scheduler.publishDelayed("test:event", { a: 1 }, 5000);

      await vi.advanceTimersByTimeAsync(4999);
      expect(publishFn).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(1);
      expect(publishFn).toHaveBeenCalledWith("test:event", { a: 1 }, requestId);
    });

    it("should not fire after clearAll", async () => {
      scheduler.publishDelayed("test:event", {}, 5000);
      scheduler.clearAll();

      await vi.advanceTimersByTimeAsync(10000);
      expect(publishFn).not.toHaveBeenCalled();
    });
  });

  // ───────────────────────────── schedule ─────────────────────────────

  describe("schedule", () => {
    it("should return a scheduleId", () => {
      const id = scheduler.schedule("recurring:event", 1000);
      expect(typeof id).toBe("string");
      expect(id.length).toBeGreaterThan(0);
    });

    it("should call publishFn at each interval tick", async () => {
      scheduler.schedule("recurring:event", 1000, { x: 1 });

      await vi.advanceTimersByTimeAsync(3500);
      expect(publishFn).toHaveBeenCalledTimes(3);
      expect(publishFn).toHaveBeenCalledWith("recurring:event", { x: 1 });
    });

    it("should support scheduling without payload", async () => {
      scheduler.schedule("no-payload", 500);

      await vi.advanceTimersByTimeAsync(500);
      expect(publishFn).toHaveBeenCalledWith("no-payload", undefined);
    });
  });

  // ───────────────────────────── unschedule ─────────────────────────────

  describe("unschedule", () => {
    it("should return true and stop the interval for an active schedule", async () => {
      const id = scheduler.schedule("recurring:event", 1000);

      await vi.advanceTimersByTimeAsync(2500);
      expect(publishFn).toHaveBeenCalledTimes(2);

      const result = scheduler.unschedule(id);
      expect(result).toBe(true);

      await vi.advanceTimersByTimeAsync(5000);
      expect(publishFn).toHaveBeenCalledTimes(2);
    });

    it("should return false for an unknown scheduleId", () => {
      expect(scheduler.unschedule("unknown-id")).toBe(false);
    });
  });

  // ───────────────────────────── getActiveSchedules ─────────────────────────────

  describe("getActiveSchedules", () => {
    it("should return empty array when no schedules exist", () => {
      expect(scheduler.getActiveSchedules()).toEqual([]);
    });

    it("should return metadata for active schedules", () => {
      const id = scheduler.schedule("cron:event", 60000, { job: "clean" });

      const schedules = scheduler.getActiveSchedules();
      expect(schedules).toHaveLength(1);
      expect(schedules[0]!.scheduleId).toBe(id);
      expect(schedules[0]!.eventType).toBe("cron:event");
      expect(schedules[0]!.intervalMs).toBe(60000);
      expect(schedules[0]!.payload).toEqual({ job: "clean" });
      expect(typeof schedules[0]!.createdAt).toBe("string");
    });

    it("should not include unscheduled entries", () => {
      const id = scheduler.schedule("temp:event", 1000);
      scheduler.unschedule(id);

      expect(scheduler.getActiveSchedules()).toEqual([]);
    });
  });

  // ───────────────────────────── clearAll ─────────────────────────────

  describe("clearAll", () => {
    it("should stop all delayed and scheduled timers", async () => {
      scheduler.publishDelayed("delayed:event", {}, 5000);
      scheduler.schedule("recurring:event", 1000);

      scheduler.clearAll();

      await vi.advanceTimersByTimeAsync(10000);
      expect(publishFn).not.toHaveBeenCalled();
      expect(scheduler.getActiveSchedules()).toEqual([]);
    });
  });
});
