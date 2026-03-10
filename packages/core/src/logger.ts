import type { LogFormat } from "./types.js";

export class Logger {
  constructor(
    private debugEnabled: boolean = false,
    private format: LogFormat = "text",
  ) {}

  debug(msg: string, fields?: Record<string, unknown>): void {
    if (!this.debugEnabled) return;
    this.output("debug", msg, fields);
  }

  warn(msg: string, fields?: Record<string, unknown>): void {
    this.output("warn", msg, fields);
  }

  error(msg: string, fields?: Record<string, unknown>): void {
    this.output("error", msg, fields);
  }

  private output(
    level: "debug" | "warn" | "error",
    msg: string,
    fields?: Record<string, unknown>,
  ): void {
    if (this.format === "json") {
      const entry = { level, msg, ...fields, timestamp: new Date().toISOString() };
      const line = JSON.stringify(entry);
      if (level === "error") console.error(line);
      else if (level === "warn") console.warn(line);
      else console.log(line);
      return;
    }

    // Text mode
    const fn = level === "error" ? console.error : level === "warn" ? console.warn : console.log;
    if (fields && Object.keys(fields).length > 0) {
      fn(msg, fields);
    } else {
      fn(msg);
    }
  }
}

let debugEnabled = false;

export function setDebug(enabled: boolean): void {
  debugEnabled = enabled;
}

export const logger = {
  debug(msg: string, fields?: Record<string, unknown>): void {
    if (debugEnabled) {
      if (fields && Object.keys(fields).length > 0) {
        console.log(msg, fields);
      } else {
        console.log(msg);
      }
    }
  },
  warn(msg: string, fields?: Record<string, unknown>): void {
    if (fields && Object.keys(fields).length > 0) {
      console.warn(msg, fields);
    } else {
      console.warn(msg);
    }
  },
  error(msg: string, fields?: Record<string, unknown>): void {
    if (fields && Object.keys(fields).length > 0) {
      console.error(msg, fields);
    } else {
      console.error(msg);
    }
  },
};
