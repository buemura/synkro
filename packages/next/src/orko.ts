import { Orko } from "@orko/core";
import type {
  EventMetrics,
  HandlerFunction,
  RetryConfig,
  OrkoIntrospection,
} from "@orko/core";

import type { OrkoNextOptions } from "./types.js";

const GLOBAL_KEY = "__orko_instance__";

export type OrkoClient = {
  publish(event: string, payload?: unknown, requestId?: string): Promise<string>;
  on(eventType: string, handler: HandlerFunction, retry?: RetryConfig): void;
  introspect(): Promise<OrkoIntrospection>;
  getEventMetrics(eventType: string): Promise<EventMetrics>;
  getInstance(): Promise<Orko>;
  stop(): Promise<void>;
};

export function createOrko(options: OrkoNextOptions): OrkoClient {
  let instancePromise: Promise<Orko> | undefined;

  function getOrCreateInstance(): Promise<Orko> {
    const cached = (globalThis as Record<string, unknown>)[GLOBAL_KEY] as
      | Promise<Orko>
      | undefined;

    if (cached) {
      return cached;
    }

    if (instancePromise) {
      return instancePromise;
    }

    instancePromise = Orko.start(options);
    (globalThis as Record<string, unknown>)[GLOBAL_KEY] = instancePromise;
    return instancePromise;
  }

  return {
    async publish(event, payload, requestId) {
      const orko = await getOrCreateInstance();
      return orko.publish(event, payload, requestId);
    },

    async on(eventType, handler, retry) {
      const orko = await getOrCreateInstance();
      orko.on(eventType, handler, retry);
    },

    async introspect() {
      const orko = await getOrCreateInstance();
      return orko.introspect();
    },

    async getEventMetrics(eventType) {
      const orko = await getOrCreateInstance();
      return orko.getEventMetrics(eventType);
    },

    async getInstance() {
      return getOrCreateInstance();
    },

    async stop() {
      const orko = await getOrCreateInstance();
      delete (globalThis as Record<string, unknown>)[GLOBAL_KEY];
      instancePromise = undefined;
      await orko.stop();
    },
  };
}
