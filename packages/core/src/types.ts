export type SchemaValidator = (payload: unknown) => void;

export type RetryBackoffStrategy = "fixed" | "exponential";

export type RetryConfig = {
  maxRetries: number;
  delayMs?: number;
  backoff?: RetryBackoffStrategy;
  jitter?: boolean;
  retryable?: (error: unknown) => boolean;
};

export type SynkroEvent = {
  type: string;
  handler: HandlerFunction;
  retry?: RetryConfig;
  schema?: SchemaValidator;
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

export type SynkroOptions = {
  transport?: "redis" | "in-memory";
  connectionUrl?: string;
  debug?: boolean;
  events?: SynkroEvent[];
  workflows?: SynkroWorkflow[];
  handlers?: object[];
  retention?: RetentionConfig;
  schemas?: Record<string, SchemaValidator>;
  drainTimeout?: number;
};

export type PublishFunction = (
  event: string,
  payload?: unknown,
  requestId?: string,
) => Promise<string>;

export type HandlerCtx = {
  requestId: string;
  payload: unknown;
  publish: PublishFunction;
  setPayload: (data: Record<string, unknown>) => void;
};

export type HandlerFunction = (ctx: HandlerCtx) => void | Promise<void>;

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
