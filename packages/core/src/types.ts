export type RetryConfig = {
  maxRetries: number;
};

export type SynkroEvent = {
  type: string;
  handler: HandlerFunction;
  retry?: RetryConfig;
};

export type SynkroWorkflowStep = {
  type: string;
  handler: HandlerFunction;
  retry?: RetryConfig;
  onSuccess?: string;
  onFailure?: string;
};

export type SynkroWorkflow = {
  name: string;
  steps: SynkroWorkflowStep[];
  onComplete?: string;
  onSuccess?: string;
  onFailure?: string;
};

export type SynkroOptions = {
  transport: "redis" | "in-memory";
  redisUrl?: string;
  debug?: boolean;
  events?: SynkroEvent[];
  workflows?: SynkroWorkflow[];
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
