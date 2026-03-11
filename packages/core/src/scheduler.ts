import { randomUUID } from "node:crypto";

import type { PublishFunction, ScheduleInfo } from "./types.js";

export class Scheduler {
  private delayedTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private schedules = new Map<
    string,
    { timer: ReturnType<typeof setInterval>; info: ScheduleInfo }
  >();

  constructor(private publishFn: PublishFunction) {}

  publishDelayed(event: string, payload: unknown, delayMs: number): string {
    const requestId = randomUUID();
    const timer = setTimeout(() => {
      this.delayedTimers.delete(requestId);
      void this.publishFn(event, payload, requestId);
    }, delayMs);
    this.delayedTimers.set(requestId, timer);
    return requestId;
  }

  schedule(eventType: string, intervalMs: number, payload?: unknown): string {
    const scheduleId = randomUUID();
    const timer = setInterval(() => {
      void this.publishFn(eventType, payload);
    }, intervalMs);
    this.schedules.set(scheduleId, {
      timer,
      info: {
        scheduleId,
        eventType,
        intervalMs,
        payload,
        createdAt: new Date().toISOString(),
      },
    });
    return scheduleId;
  }

  unschedule(scheduleId: string): boolean {
    const entry = this.schedules.get(scheduleId);
    if (!entry) return false;
    clearInterval(entry.timer);
    this.schedules.delete(scheduleId);
    return true;
  }

  getActiveSchedules(): ScheduleInfo[] {
    return Array.from(this.schedules.values()).map((e) => e.info);
  }

  clearAll(): void {
    for (const timer of this.delayedTimers.values()) {
      clearTimeout(timer);
    }
    this.delayedTimers.clear();

    for (const { timer } of this.schedules.values()) {
      clearInterval(timer);
    }
    this.schedules.clear();
  }
}
