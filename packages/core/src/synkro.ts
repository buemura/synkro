import { randomUUID } from "node:crypto";

import {
  HandlerRegistry,
  discoverEventHandlers,
  discoverWorkflowStepHandlers,
} from "./handlers/index.js";
import { InMemoryManager, RedisManager } from "./transport/index.js";
import { setDebug } from "./logger.js";
import { WorkflowRegistry } from "./workflows/index.js";

import type {
  EventMetrics,
  HandlerFunction,
  RetentionConfig,
  RetryConfig,
  SynkroIntrospection,
  SynkroOptions,
  SynkroWorkflow,
} from "./types.js";
import type { TransportManager } from "./transport/index.js";

export class Synkro {
  private transport: TransportManager;
  private handlerRegistry: HandlerRegistry;
  private workflowRegistry: WorkflowRegistry;

  private constructor(transport: TransportManager, retention?: RetentionConfig) {
    this.transport = transport;
    this.handlerRegistry = new HandlerRegistry(transport, retention);
    this.workflowRegistry = new WorkflowRegistry(transport, this.handlerRegistry, retention);
    this.handlerRegistry.setPublishFn(this.publish.bind(this));
  }

  static async start(options: SynkroOptions): Promise<Synkro> {
    setDebug(options.debug ?? false);

    let transport: TransportManager;
    if (options.transport === "in-memory") {
      transport = new InMemoryManager();
    } else if (options.transport === "redis" || options.transport === undefined) {
      if (!options.connectionUrl) {
        throw new Error("connectionUrl is required when using Redis transport");
      }
      transport = new RedisManager(options.connectionUrl);
    } else {
      throw new Error(
        `[Synkro] - Invalid transport "${String(options.transport)}". Supported values: "redis", "in-memory"`,
      );
    }

    const instance = new Synkro(transport, options.retention);

    // Patch decorated workflow step handlers before registering workflows
    const workflows = options.workflows
      ? instance.patchWorkflowHandlers(options.workflows, options.handlers ?? [])
      : [];

    if (options.events) {
      for (const event of options.events) {
        instance.on(event.type, event.handler, event.retry);
      }
    }

    if (workflows.length > 0) {
      instance.workflowRegistry.registerWorkflows(workflows);
    }

    // Register decorated event handlers
    for (const handlerInstance of options.handlers ?? []) {
      for (const { eventType, handler, retry } of discoverEventHandlers(handlerInstance)) {
        instance.on(eventType, handler, retry);
      }
    }

    return instance;
  }

  register(...instances: object[]): void {
    for (const instance of instances) {
      for (const { eventType, handler, retry } of discoverEventHandlers(instance)) {
        this.on(eventType, handler, retry);
      }

      for (const { workflowName, stepType, handler } of discoverWorkflowStepHandlers(instance)) {
        this.workflowRegistry.registerStepHandler(workflowName, stepType, handler);
      }
    }
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

    await this.transport.publishMessage(
      event,
      JSON.stringify({ requestId, payload }),
    );
    return requestId;
  }

  async getEventMetrics(eventType: string): Promise<EventMetrics> {
    return this.handlerRegistry.getEventMetrics(eventType);
  }

  introspect(): SynkroIntrospection {
    return {
      events: this.handlerRegistry.getRegisteredEvents(),
      workflows: this.workflowRegistry.getRegisteredWorkflows(),
    };
  }

  async stop(): Promise<void> {
    await this.transport.disconnect();
  }

  private patchWorkflowHandlers(
    workflows: SynkroWorkflow[],
    handlerInstances: object[],
  ): SynkroWorkflow[] {
    // Collect all decorated workflow step handlers
    const stepHandlers = handlerInstances.flatMap((instance) =>
      discoverWorkflowStepHandlers(instance),
    );

    return workflows.map((w) => ({
      ...w,
      steps: w.steps.map((s) => {
        if (s.handler) return s;

        const discovered = stepHandlers.find(
          (h) => h.workflowName === w.name && h.stepType === s.type,
        );

        if (!discovered) {
          throw new Error(
            `Workflow "${w.name}" step "${s.type}" has no handler. Provide an inline handler or use the @OnWorkflowStep decorator.`,
          );
        }

        return { ...s, handler: discovered.handler };
      }),
    }));
  }
}

