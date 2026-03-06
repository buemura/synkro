import { SetMetadata } from "@nestjs/common";
import type { RetryConfig } from "@orko/core";
import { ON_EVENT_METADATA } from "../orko.constants.js";

export interface OnEventMetadata {
  eventType: string;
  retry?: RetryConfig;
}

export function OnEvent(
  eventType: string,
  retry?: RetryConfig,
): MethodDecorator {
  return SetMetadata(ON_EVENT_METADATA, {
    eventType,
    retry,
  } satisfies OnEventMetadata);
}
