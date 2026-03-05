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
  redisUrl: string;
  debug?: boolean;
  events?: SynkroEvent[];
  workflows?: SynkroWorkflow[];
};

export type HandlerCtx = {
  requestId: string;
  payload: unknown;
};

export type HandlerFunction = (ctx: HandlerCtx) => void | Promise<void>;
