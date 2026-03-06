import type {
  HandlerFunction,
  RetryConfig,
  SynkroWorkflow,
} from "@synkro/core";

export type NestSynkroWorkflowStep = {
  type: string;
  handler?: HandlerFunction;
  retry?: RetryConfig;
  onSuccess?: string;
  onFailure?: string;
};

export type NestSynkroWorkflow = Omit<SynkroWorkflow, "steps"> & {
  steps: NestSynkroWorkflowStep[];
};

export interface SynkroModuleOptions {
  transport: "redis" | "in-memory";
  connectionUrl?: string;
  debug?: boolean;
  workflows?: NestSynkroWorkflow[];
}

export interface SynkroModuleAsyncOptions {
  imports?: any[];
  useFactory: (
    ...args: any[]
  ) => Promise<SynkroModuleOptions> | SynkroModuleOptions;
  inject?: any[];
}
