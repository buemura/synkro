import type {
  HandlerFunction,
  RetryConfig,
  OrkoWorkflow,
} from "@orko/core";

export type NestOrkoWorkflowStep = {
  type: string;
  handler?: HandlerFunction;
  retry?: RetryConfig;
  onSuccess?: string;
  onFailure?: string;
};

export type NestOrkoWorkflow = Omit<OrkoWorkflow, "steps"> & {
  steps: NestOrkoWorkflowStep[];
};

export interface OrkoModuleOptions {
  transport: "redis" | "in-memory";
  connectionUrl?: string;
  debug?: boolean;
  workflows?: NestOrkoWorkflow[];
}

export interface OrkoModuleAsyncOptions {
  imports?: any[];
  useFactory: (
    ...args: any[]
  ) => Promise<OrkoModuleOptions> | OrkoModuleOptions;
  inject?: any[];
}
