import {
  ON_EVENT_META,
  ON_WORKFLOW_STEP_META,
  type OnEventMetadata,
  type OnWorkflowStepMetadata,
} from "./decorators.js";
import type { HandlerFunction, RetryConfig } from "../types.js";

export type DiscoveredEventHandler = {
  eventType: string;
  handler: HandlerFunction;
  retry?: RetryConfig;
};

export type DiscoveredWorkflowStepHandler = {
  workflowName: string;
  stepType: string;
  handler: HandlerFunction;
};

function getDecoratedMethods(instance: object): string[] {
  const proto = Object.getPrototypeOf(instance) as Record<string, unknown>;
  return Object.getOwnPropertyNames(proto).filter(
    (name) => name !== "constructor" && typeof proto[name] === "function",
  );
}

export function discoverEventHandlers(
  instance: object,
): DiscoveredEventHandler[] {
  const handlers: DiscoveredEventHandler[] = [];
  const proto = Object.getPrototypeOf(instance) as Record<
    string,
    ((...args: unknown[]) => unknown) & { [key: symbol]: OnEventMetadata }
  >;

  for (const name of getDecoratedMethods(instance)) {
    const method = proto[name]!;
    const metadata = method[ON_EVENT_META];
    if (!metadata) continue;

    handlers.push({
      eventType: metadata.eventType,
      handler: method.bind(instance) as HandlerFunction,
      ...(metadata.retry !== undefined && { retry: metadata.retry }),
    });
  }

  return handlers;
}

export function discoverWorkflowStepHandlers(
  instance: object,
): DiscoveredWorkflowStepHandler[] {
  const handlers: DiscoveredWorkflowStepHandler[] = [];
  const proto = Object.getPrototypeOf(instance) as Record<
    string,
    ((...args: unknown[]) => unknown) & {
      [key: symbol]: OnWorkflowStepMetadata;
    }
  >;

  for (const name of getDecoratedMethods(instance)) {
    const method = proto[name]!;
    const metadata = method[ON_WORKFLOW_STEP_META];
    if (!metadata) continue;

    handlers.push({
      workflowName: metadata.workflowName,
      stepType: metadata.stepType,
      handler: method.bind(instance) as HandlerFunction,
    });
  }

  return handlers;
}
