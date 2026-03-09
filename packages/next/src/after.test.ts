import { describe, expect, it, vi } from "vitest";

import { publishAfterResponse } from "./after.js";
import type { SynkroClient } from "./synkro.js";

const afterFn = vi.fn();

vi.mock("next/server", () => ({
  after: (callback: () => Promise<void>) => {
    afterFn(callback);
  },
}));

function createMockClient(): SynkroClient {
  return {
    publish: vi.fn().mockResolvedValue("req-1"),
    on: vi.fn(),
    off: vi.fn(),
    getWorkflowState: vi.fn().mockResolvedValue(null),
    cancelWorkflow: vi.fn().mockResolvedValue(false),
    introspect: vi.fn().mockResolvedValue({ events: [], workflows: [] }),
    getEventMetrics: vi.fn().mockResolvedValue({
      type: "test",
      received: 0,
      completed: 0,
      failed: 0,
    }),
    getInstance: vi.fn(),
    stop: vi.fn(),
  };
}

describe("publishAfterResponse", () => {
  it("should register a callback via next/server after()", async () => {
    const client = createMockClient();

    publishAfterResponse(client, "user.created", { email: "test@test.com" }, "req-1");

    // Wait for the dynamic import to resolve
    await vi.waitFor(() => {
      expect(afterFn).toHaveBeenCalledOnce();
    });

    // Execute the registered callback
    const callback = afterFn.mock.calls[0]![0] as () => Promise<void>;
    await callback();

    expect(client.publish).toHaveBeenCalledWith(
      "user.created",
      { email: "test@test.com" },
      "req-1",
    );
  });
});
