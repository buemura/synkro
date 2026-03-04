import * as path from "node:path";

import { subscribeToChannel } from "./redis";
import type { Config, HandlerCtx, HandlerFunction } from "./types";

const _dirname =
  typeof __dirname !== "undefined"
    ? __dirname
    : path.dirname(new URL(import.meta.url).pathname);

export class HandlerRegistry {
  private handlers = new Map<string, HandlerFunction>();

  async registerFromConfig(config: Config): Promise<void> {
    for (const event of config.events) {
      await this.registerHandler(event.type, event.handler);
    }
  }

  private async registerHandler(
    eventType: string,
    handlerPath: string,
  ): Promise<void> {
    const resolvedPath = path.resolve(_dirname, "..", handlerPath);

    const module = await import(resolvedPath);
    const handlerFn: unknown = module.handler;

    if (typeof handlerFn !== "function") {
      throw new Error(
        `Handler for "${eventType}" in ${resolvedPath} does not export a function named 'handler'`,
      );
    }

    this.handlers.set(eventType, handlerFn as HandlerFunction);
    console.log(`Handler for "${eventType}" loaded from ${resolvedPath}`);

    subscribeToChannel(eventType, (message: string) => {
      this.handleMessage(eventType, message);
    });
  }

  private handleMessage(eventType: string, message: string): void {
    const handler = this.handlers.get(eventType);
    if (!handler) {
      console.warn(`No handler found for event "${eventType}"`);
      return;
    }

    const event = JSON.parse(message) as HandlerCtx;
    console.log(`Received message for event "${eventType}": ${message}`);

    handler({ requestId: event.requestId, payload: event.payload });
  }
}
