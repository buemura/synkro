import {
  Inject,
  Injectable,
  type OnModuleDestroy,
  type OnModuleInit,
} from "@nestjs/common";
import { Orko } from "@orko/core";
import type {
  HandlerFunction,
  RetryConfig,
  OrkoOptions,
} from "@orko/core";

import { ORKO_MODULE_OPTIONS } from "./orko.constants.js";
import { OrkoExplorer } from "./orko.explorer.js";
import type { OrkoModuleOptions } from "./orko.interfaces.js";

@Injectable()
export class OrkoService implements OnModuleInit, OnModuleDestroy {
  private orko!: Orko;

  constructor(
    @Inject(ORKO_MODULE_OPTIONS)
    private readonly options: OrkoModuleOptions,
    private readonly explorer: OrkoExplorer,
  ) {}

  async onModuleInit(): Promise<void> {
    const noop = async () => {};
    const workflows = (this.options.workflows ?? []).map((w) => ({
      ...w,
      steps: w.steps.map((s) => ({ ...s, handler: s.handler ?? noop })),
    }));

    // Patch decorated handler functions into workflow step definitions
    const stepHandlers = this.explorer.exploreWorkflowStepHandlers();
    for (const workflow of workflows) {
      for (const step of workflow.steps) {
        const discovered = stepHandlers.find(
          (h) => h.workflowName === workflow.name && h.stepType === step.type,
        );
        if (discovered) {
          step.handler = discovered.handler;
        }
      }
    }

    const orkoOptions: OrkoOptions = {
      transport: this.options.transport,
      connectionUrl: this.options.connectionUrl,
      debug: this.options.debug,
      workflows,
    };

    this.orko = await Orko.start(orkoOptions);

    // Register discovered event handlers
    const eventHandlers = this.explorer.exploreEventHandlers();
    for (const { eventType, handler, retry } of eventHandlers) {
      this.orko.on(eventType, handler, retry);
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.orko.stop();
  }

  async publish(
    event: string,
    payload?: unknown,
    requestId?: string,
  ): Promise<string> {
    return this.orko.publish(event, payload, requestId);
  }

  on(eventType: string, handler: HandlerFunction, retry?: RetryConfig): void {
    this.orko.on(eventType, handler, retry);
  }

  getInstance(): Orko {
    return this.orko;
  }
}
