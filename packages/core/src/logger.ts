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
    if (debugEnabled) {
      console.warn(...args);
    }
  },
  error(...args: unknown[]): void {
    console.error(...args);
  },
};
