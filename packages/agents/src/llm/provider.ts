import type { Message, ModelOptions, ModelResponse, ModelStreamChunk } from "./types.js";

export interface ModelProvider {
  chat(messages: Message[], options: ModelOptions): Promise<ModelResponse>;
  chatStream?(
    messages: Message[],
    options: ModelOptions,
  ): AsyncIterable<ModelStreamChunk>;
}
