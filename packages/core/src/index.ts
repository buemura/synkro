import { randomUUID } from "node:crypto";

import { HandlerRegistry } from "./handler-registry.js";
import { InMemoryManager } from "./in-memory.js";
import { setDebug } from "./logger.js";
import { RedisManager } from "./redis.js";
import { WorkflowRegistry } from "./workflow-registry.js";

import type {
  HandlerFunction,
  RetryConfig,
  SynkroOptions,
} from "./types.js";
import type { TransportManager } from "./transport.js";

export class Synkro {
  private transport: TransportManager;
  private handlerRegistry: HandlerRegistry;
  private workflowRegistry: WorkflowRegistry;

  private constructor(transport: TransportManager) {
    this.transport = transport;
    this.handlerRegistry = new HandlerRegistry(transport);
    this.workflowRegistry = new WorkflowRegistry(transport, this.handlerRegistry);
    this.handlerRegistry.setPublishFn(this.publish.bind(this));
  }

  static async start(options: SynkroOptions): Promise<Synkro> {
    setDebug(options.debug ?? false);

    let transport: TransportManager;
    if (options.transport === "in-memory") {
      transport = new InMemoryManager();
    } else {
      if (!options.connectionUrl) {
        throw new Error("connectionUrl is required when using Redis transport");
      }
      transport = new RedisManager(options.connectionUrl);
    }

    const instance = new Synkro(transport);

    if (options.events) {
      for (const event of options.events) {
        instance.on(event.type, event.handler, event.retry);
      }
    }

    if (options.workflows) {
      instance.workflowRegistry.registerWorkflows(options.workflows);
    }

    return instance;
  }

  on(eventType: string, handler: HandlerFunction, retry?: RetryConfig): void {
    this.handlerRegistry.register(eventType, handler, retry);
  }

  async publish(
    event: string,
    payload?: unknown,
    requestId?: string,
  ): Promise<string> {
    requestId = requestId ?? randomUUID();

    if (this.workflowRegistry.hasWorkflow(event)) {
      await this.workflowRegistry.startWorkflow(event, requestId, payload);
      return requestId;
    }

    this.transport.publishMessage(
      event,
      JSON.stringify({ requestId, payload }),
    );
    return requestId;
  }

  async stop(): Promise<void> {
    await this.transport.disconnect();
  }
}

export type { TransportManager } from "./transport.js";
export type {
  HandlerCtx,
  HandlerFunction,
  PublishFunction,
  RetryConfig,
  SynkroEvent,
  SynkroOptions,
  SynkroWorkflow,
  SynkroWorkflowStep,
} from "./types.js";
