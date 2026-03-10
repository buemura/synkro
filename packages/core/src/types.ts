import type { TransportManager } from "./transport/transport.js";

export type SchemaValidator = (payload: unknown) => void;

export type RetryBackoffStrategy = "fixed" | "exponential";

export type RetryConfig = {
  maxRetries: number;
  delayMs?: number;
  backoff?: RetryBackoffStrategy;
  jitter?: boolean;
  retryable?: (error: unknown) => boolean;
};

export type EventFilter<T = unknown> = (payload: T) => boolean;

export type SynkroEvent<T = unknown> = {
  type: string;
  handler: HandlerFunction<T>;
  retry?: RetryConfig;
  schema?: SchemaValidator;
  filter?: EventFilter<T>;
};

export type SynkroWorkflowStep = {
  type: string;
  handler?: HandlerFunction;
  retry?: RetryConfig;
  onSuccess?: string;
  onFailure?: string;
  timeoutMs?: number;
};

export type SynkroWorkflow = {
  name: string;
  steps: SynkroWorkflowStep[];
  onComplete?: string;
  onSuccess?: string;
  onFailure?: string;
  timeoutMs?: number;
};

export type RetentionConfig = {
  lockTtl?: number;
  dedupTtl?: number;
  stateTtl?: number;
  metricsTtl?: number;
};

export type LogFormat = "text" | "json";

export type DeadLetterItem = {
  eventType: string;
  requestId: string;
  payload: unknown;
  errors: Array<{ message: string; name?: string }>;
  failedAt: string;
  attempts: number;
};

export type SynkroOptions = {
  transport?: "redis" | "in-memory" | TransportManager;
  connectionUrl?: string;
  debug?: boolean;
  logFormat?: LogFormat;
  events?: SynkroEvent[];
  workflows?: SynkroWorkflow[];
  handlers?: object[];
  retention?: RetentionConfig;
  schemas?: Record<string, SchemaValidator>;
  drainTimeout?: number;
  deadLetterQueue?: boolean;
};

export type PublishFunction = (
  event: string,
  payload?: unknown,
  requestId?: string,
) => Promise<string>;

export type HandlerCtx<T = unknown> = {
  requestId: string;
  payload: T;
  publish: PublishFunction;
  setPayload: (data: Record<string, unknown>) => void;
};

export type HandlerFunction<T = unknown> = (ctx: HandlerCtx<T>) => void | Promise<void>;

export type EventInfo = {
  type: string;
  retry?: RetryConfig;
};

export type WorkflowStepInfo = {
  type: string;
  retry?: RetryConfig;
  onSuccess?: string;
  onFailure?: string;
  timeoutMs?: number;
};

export type WorkflowInfo = {
  name: string;
  steps: WorkflowStepInfo[];
  onComplete?: string;
  onSuccess?: string;
  onFailure?: string;
  timeoutMs?: number;
};

export type SynkroIntrospection = {
  events: EventInfo[];
  workflows: WorkflowInfo[];
};

export type EventMetrics = {
  type: string;
  received: number;
  completed: number;
  failed: number;
};
