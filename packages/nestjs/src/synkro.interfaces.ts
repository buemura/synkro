import type { SynkroWorkflow } from "@synkro/core";

export interface SynkroModuleOptions {
  transport: "redis" | "in-memory";
  redisUrl?: string;
  debug?: boolean;
  workflows?: SynkroWorkflow[];
}

export interface SynkroModuleAsyncOptions {
  imports?: any[];
  useFactory: (
    ...args: any[]
  ) => Promise<SynkroModuleOptions> | SynkroModuleOptions;
  inject?: any[];
}
