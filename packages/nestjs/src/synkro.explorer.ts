import { Injectable } from "@nestjs/common";
import { DiscoveryService, MetadataScanner, Reflector } from "@nestjs/core";
import type { HandlerFunction, RetryConfig } from "@synkro/core";

import { ON_EVENT_METADATA, ON_WORKFLOW_STEP_METADATA } from "./synkro.constants.js";
import type { OnEventMetadata } from "./decorators/on-event.decorator.js";
import type { OnWorkflowStepMetadata } from "./decorators/on-workflow-step.decorator.js";

export interface DiscoveredEventHandler {
  eventType: string;
  handler: HandlerFunction;
  retry?: RetryConfig;
}

export interface DiscoveredWorkflowStepHandler {
  workflowName: string;
  stepType: string;
  handler: HandlerFunction;
}

@Injectable()
export class SynkroExplorer {
  constructor(
    private readonly discovery: DiscoveryService,
    private readonly metadataScanner: MetadataScanner,
    private readonly reflector: Reflector,
  ) {}

  exploreEventHandlers(): DiscoveredEventHandler[] {
    const handlers: DiscoveredEventHandler[] = [];

    for (const wrapper of this.discovery.getProviders()) {
      const { instance } = wrapper;
      if (!instance || typeof instance !== "object") continue;

      const prototype = Object.getPrototypeOf(instance);
      const methodNames = this.metadataScanner.getAllMethodNames(prototype);

      for (const methodName of methodNames) {
        const metadata = this.reflector.get<OnEventMetadata>(
          ON_EVENT_METADATA,
          prototype[methodName],
        );
        if (!metadata) continue;

        handlers.push({
          eventType: metadata.eventType,
          handler: (instance as Record<string, any>)[methodName].bind(instance),
          retry: metadata.retry,
        });
      }
    }

    return handlers;
  }

  exploreWorkflowStepHandlers(): DiscoveredWorkflowStepHandler[] {
    const handlers: DiscoveredWorkflowStepHandler[] = [];

    for (const wrapper of this.discovery.getProviders()) {
      const { instance } = wrapper;
      if (!instance || typeof instance !== "object") continue;

      const prototype = Object.getPrototypeOf(instance);
      const methodNames = this.metadataScanner.getAllMethodNames(prototype);

      for (const methodName of methodNames) {
        const metadata = this.reflector.get<OnWorkflowStepMetadata>(
          ON_WORKFLOW_STEP_METADATA,
          prototype[methodName],
        );
        if (!metadata) continue;

        handlers.push({
          workflowName: metadata.workflowName,
          stepType: metadata.stepType,
          handler: (instance as Record<string, any>)[methodName].bind(instance),
        });
      }
    }

    return handlers;
  }
}
