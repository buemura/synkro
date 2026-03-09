import { Synkro } from "@synkro/core";
import type {
  EventMetrics,
  HandlerFunction,
  RetryConfig,
  SynkroIntrospection,
  WorkflowState,
} from "@synkro/core";

import type { SynkroNextOptions } from "./types.js";

const GLOBAL_KEY = "__synkro_instance__";

export type SynkroClient = {
  publish(event: string, payload?: unknown, requestId?: string): Promise<string>;
  on(eventType: string, handler: HandlerFunction, retry?: RetryConfig): void;
  off(eventType: string, handler?: HandlerFunction): void;
  getWorkflowState(requestId: string, workflowName: string): Promise<WorkflowState | null>;
  cancelWorkflow(requestId: string, workflowName: string): Promise<boolean>;
  introspect(): Promise<SynkroIntrospection>;
  getEventMetrics(eventType: string): Promise<EventMetrics>;
  getInstance(): Promise<Synkro>;
  stop(): Promise<void>;
};

export function createSynkro(options: SynkroNextOptions): SynkroClient {
  let instancePromise: Promise<Synkro> | undefined;

  function getOrCreateInstance(): Promise<Synkro> {
    const cached = (globalThis as Record<string, unknown>)[GLOBAL_KEY] as
      | Promise<Synkro>
      | undefined;

    if (cached) {
      return cached;
    }

    if (instancePromise) {
      return instancePromise;
    }

    instancePromise = Synkro.start(options);
    (globalThis as Record<string, unknown>)[GLOBAL_KEY] = instancePromise;
    return instancePromise;
  }

  return {
    async publish(event, payload, requestId) {
      const synkro = await getOrCreateInstance();
      return synkro.publish(event, payload, requestId);
    },

    async on(eventType, handler, retry) {
      const synkro = await getOrCreateInstance();
      synkro.on(eventType, handler, retry);
    },

    async off(eventType, handler) {
      const synkro = await getOrCreateInstance();
      synkro.off(eventType, handler);
    },

    async getWorkflowState(requestId, workflowName) {
      const synkro = await getOrCreateInstance();
      return synkro.getWorkflowState(requestId, workflowName);
    },

    async cancelWorkflow(requestId, workflowName) {
      const synkro = await getOrCreateInstance();
      return synkro.cancelWorkflow(requestId, workflowName);
    },

    async introspect() {
      const synkro = await getOrCreateInstance();
      return synkro.introspect();
    },

    async getEventMetrics(eventType) {
      const synkro = await getOrCreateInstance();
      return synkro.getEventMetrics(eventType);
    },

    async getInstance() {
      return getOrCreateInstance();
    },

    async stop() {
      const synkro = await getOrCreateInstance();
      delete (globalThis as Record<string, unknown>)[GLOBAL_KEY];
      instancePromise = undefined;
      await synkro.stop();
    },
  };
}
