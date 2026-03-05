import type { RetryConfig } from "./types.js";

export const ON_EVENT_META = Symbol.for("synkro:on-event");
export const ON_WORKFLOW_STEP_META = Symbol.for("synkro:on-workflow-step");

export type OnEventMetadata = {
  eventType: string;
  retry?: RetryConfig;
};

export type OnWorkflowStepMetadata = {
  workflowName: string;
  stepType: string;
};

export function OnEvent(eventType: string, retry?: RetryConfig) {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
  return function <T extends Function>(
    target: T,
    _context: ClassMethodDecoratorContext,
  ): T {
    const metadata: OnEventMetadata = { eventType };
    if (retry !== undefined) {
      metadata.retry = retry;
    }
    Object.defineProperty(target, ON_EVENT_META, {
      value: metadata,
      enumerable: false,
      configurable: true,
    });
    return target;
  };
}

export function OnWorkflowStep(workflowName: string, stepType: string) {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
  return function <T extends Function>(
    target: T,
    _context: ClassMethodDecoratorContext,
  ): T {
    Object.defineProperty(target, ON_WORKFLOW_STEP_META, {
      value: { workflowName, stepType } satisfies OnWorkflowStepMetadata,
      enumerable: false,
      configurable: true,
    });
    return target;
  };
}
