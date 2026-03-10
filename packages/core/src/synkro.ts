import { randomUUID } from "node:crypto";

import {
  HandlerRegistry,
  discoverEventHandlers,
  discoverWorkflowStepHandlers,
} from "./handlers/index.js";
import { InMemoryManager, RedisManager } from "./transport/index.js";
import { Logger, setDebug } from "./logger.js";
import { WorkflowRegistry } from "./workflows/index.js";

import { parseEventType } from "./versioning.js";

import type {
  DeadLetterItem,
  EventFilter,
  EventMetrics,
  HandlerFunction,
  LogFormat,
  RetentionConfig,
  RetryConfig,
  SchemaValidator,
  SynkroIntrospection,
  SynkroOptions,
  SynkroWorkflow,
} from "./types.js";
import type { TransportManager } from "./transport/index.js";
import type { WorkflowState } from "./workflows/workflow-registry.js";

const DEFAULT_DRAIN_TIMEOUT = 5000;
const DRAIN_POLL_INTERVAL = 50;

export class Synkro {
  private transport: TransportManager;
  private handlerRegistry: HandlerRegistry;
  private workflowRegistry: WorkflowRegistry;
  private logger: Logger;
  private readonly drainTimeout: number;

  private constructor(transport: TransportManager, logger: Logger, retention?: RetentionConfig, drainTimeout?: number, dlqEnabled?: boolean) {
    this.transport = transport;
    this.logger = logger;
    this.drainTimeout = drainTimeout ?? DEFAULT_DRAIN_TIMEOUT;
    this.handlerRegistry = new HandlerRegistry(transport, retention, this.logger, dlqEnabled ?? false);
    this.workflowRegistry = new WorkflowRegistry(transport, this.handlerRegistry, retention, this.logger);
    this.handlerRegistry.setPublishFn(this.publish.bind(this));
  }

  static async start(options: SynkroOptions): Promise<Synkro> {
    setDebug(options.debug ?? false);

    const logger = new Logger(options.debug ?? false, options.logFormat ?? "text");

    let transport: TransportManager;
    if (typeof options.transport === "object" && options.transport !== null) {
      transport = options.transport;
    } else if (options.transport === "in-memory") {
      transport = new InMemoryManager(logger);
    } else if (options.transport === "redis" || options.transport === undefined) {
      if (!options.connectionUrl) {
        throw new Error("connectionUrl is required when using Redis transport");
      }
      transport = new RedisManager(options.connectionUrl);
    } else {
      throw new Error(
        `[Synkro] - Invalid transport "${String(options.transport)}". Supported values: "redis", "in-memory", or a TransportManager instance`,
      );
    }

    const instance = new Synkro(transport, logger, options.retention, options.drainTimeout, options.deadLetterQueue);

    // Patch decorated workflow step handlers before registering workflows
    const workflows = options.workflows
      ? instance.patchWorkflowHandlers(options.workflows, options.handlers ?? [])
      : [];

    if (options.schemas) {
      for (const [eventType, schema] of Object.entries(options.schemas)) {
        instance.handlerRegistry.registerSchema(eventType, schema);
      }
    }

    if (options.events) {
      for (const event of options.events) {
        instance.on(event.type, event.handler, event.retry, event.schema, event.filter);
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

  on(eventType: string, handler: HandlerFunction, retry?: RetryConfig, schema?: SchemaValidator, filter?: EventFilter): void {
    this.handlerRegistry.register(eventType, handler, retry, schema, filter);
  }

  off(eventType: string, handler?: HandlerFunction): void {
    this.handlerRegistry.unregister(eventType, handler);
  }

  async publish(
    event: string,
    payload?: unknown,
    requestId?: string,
  ): Promise<string> {
    const schema = this.handlerRegistry.getSchema(event);
    if (schema) {
      schema(payload);
    }

    requestId = requestId ?? randomUUID();

    if (this.workflowRegistry.hasWorkflow(event)) {
      await this.workflowRegistry.startWorkflow(event, requestId, payload);
      return requestId;
    }

    const message = JSON.stringify({ requestId, payload });
    await this.transport.publishMessage(event, message);

    // Version fanout: if event is versioned (e.g. "user:created:v2"),
    // also publish to the base channel so catch-all handlers receive it.
    const parsed = parseEventType(event);
    if (parsed.version !== null) {
      const baseMessage = JSON.stringify({ requestId, payload, _version: parsed.version });
      await this.transport.publishMessage(parsed.base, baseMessage);
    }

    return requestId;
  }

  async getWorkflowState(requestId: string, workflowName: string): Promise<WorkflowState | null> {
    return this.workflowRegistry.queryState(requestId, workflowName);
  }

  async cancelWorkflow(requestId: string, workflowName: string): Promise<boolean> {
    return this.workflowRegistry.cancelWorkflow(requestId, workflowName);
  }

  async getEventMetrics(eventType: string): Promise<EventMetrics> {
    return this.handlerRegistry.getEventMetrics(eventType);
  }

  async getDeadLetterItems(eventType: string, options?: { limit?: number }): Promise<DeadLetterItem[]> {
    const limit = options?.limit ?? 100;
    const raw = await this.transport.getListRange(`synkro:dlq:${eventType}`, 0, limit - 1);
    return raw.map((item) => JSON.parse(item) as DeadLetterItem);
  }

  async replayDeadLetterItem(item: DeadLetterItem): Promise<string> {
    return this.publish(item.eventType, item.payload, item.requestId);
  }

  async clearDeadLetterQueue(eventType: string): Promise<void> {
    await this.transport.deleteKey(`synkro:dlq:${eventType}`);
  }

  introspect(): SynkroIntrospection {
    return {
      events: this.handlerRegistry.getRegisteredEvents(),
      workflows: this.workflowRegistry.getRegisteredWorkflows(),
    };
  }

  async stop(): Promise<void> {
    const deadline = Date.now() + this.drainTimeout;

    while (
      (this.handlerRegistry.activeCount > 0 || this.workflowRegistry.activeCount > 0) &&
      Date.now() < deadline
    ) {
      await new Promise((resolve) => setTimeout(resolve, DRAIN_POLL_INTERVAL));
    }

    const remaining = this.handlerRegistry.activeCount + this.workflowRegistry.activeCount;
    if (remaining > 0) {
      this.logger.warn(
        `[Synkro] - Drain timeout reached with ${remaining} active handler(s). Forcing disconnect.`,
      );
    }

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

