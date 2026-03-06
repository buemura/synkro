export type RetryConfig = {
  maxRetries: number;
};

export type OrkoEvent = {
  type: string;
  handler: HandlerFunction;
  retry?: RetryConfig;
};

export type OrkoWorkflowStep = {
  type: string;
  handler?: HandlerFunction;
  retry?: RetryConfig;
  onSuccess?: string;
  onFailure?: string;
};

export type OrkoWorkflow = {
  name: string;
  steps: OrkoWorkflowStep[];
  onComplete?: string;
  onSuccess?: string;
  onFailure?: string;
};

export type OrkoOptions = {
  transport: "redis" | "in-memory";
  connectionUrl?: string;
  debug?: boolean;
  events?: OrkoEvent[];
  workflows?: OrkoWorkflow[];
  handlers?: object[];
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
};

export type WorkflowInfo = {
  name: string;
  steps: WorkflowStepInfo[];
  onComplete?: string;
  onSuccess?: string;
  onFailure?: string;
};

export type OrkoIntrospection = {
  events: EventInfo[];
  workflows: WorkflowInfo[];
};

export type EventMetrics = {
  type: string;
  received: number;
  completed: number;
  failed: number;
};
