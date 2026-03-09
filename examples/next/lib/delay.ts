/** Simulate realistic async work (e.g., DB query, API call, I/O). */
export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
