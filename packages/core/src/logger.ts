export class Logger {
  constructor(private debugEnabled: boolean = false) {}

  debug(...args: unknown[]): void {
    if (this.debugEnabled) {
      console.log(...args);
    }
  }

  warn(...args: unknown[]): void {
    console.warn(...args);
  }

  error(...args: unknown[]): void {
    console.error(...args);
  }
}

let debugEnabled = false;

export function setDebug(enabled: boolean): void {
  debugEnabled = enabled;
}

export const logger = {
  debug(...args: unknown[]): void {
    if (debugEnabled) {
      console.log(...args);
    }
  },
  warn(...args: unknown[]): void {
    console.warn(...args);
  },
  error(...args: unknown[]): void {
    console.error(...args);
  },
};
