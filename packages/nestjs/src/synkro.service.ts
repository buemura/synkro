import {
  Inject,
  Injectable,
  type OnModuleDestroy,
  type OnModuleInit,
} from "@nestjs/common";
import { Synkro } from "@synkro/core";
import type {
  HandlerFunction,
  RetryConfig,
  SynkroOptions,
} from "@synkro/core";

import { SYNKRO_MODULE_OPTIONS } from "./synkro.constants.js";
import { SynkroExplorer } from "./synkro.explorer.js";
import type { SynkroModuleOptions } from "./synkro.interfaces.js";

@Injectable()
export class SynkroService implements OnModuleInit, OnModuleDestroy {
  private synkro!: Synkro;

  constructor(
    @Inject(SYNKRO_MODULE_OPTIONS)
    private readonly options: SynkroModuleOptions,
    private readonly explorer: SynkroExplorer,
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

    const synkroOptions: SynkroOptions = {
      transport: this.options.transport,
      connectionUrl: this.options.connectionUrl,
      debug: this.options.debug,
      workflows,
    };

    this.synkro = await Synkro.start(synkroOptions);

    // Register discovered event handlers
    const eventHandlers = this.explorer.exploreEventHandlers();
    for (const { eventType, handler, retry } of eventHandlers) {
      this.synkro.on(eventType, handler, retry);
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.synkro.stop();
  }

  async publish(
    event: string,
    payload?: unknown,
    requestId?: string,
  ): Promise<string> {
    return this.synkro.publish(event, payload, requestId);
  }

  on(eventType: string, handler: HandlerFunction, retry?: RetryConfig): void {
    this.synkro.on(eventType, handler, retry);
  }

  getInstance(): Synkro {
    return this.synkro;
  }
}
