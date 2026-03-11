export type MessageRole = "system" | "user" | "assistant" | "tool";

export type Message = {
  role: MessageRole;
  content: string;
  toolCallId?: string | undefined;
  toolCalls?: ToolCall[] | undefined;
};

export type ToolCall = {
  id: string;
  name: string;
  arguments: string;
};

export type ToolDefinition = {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
};

export type ModelOptions = {
  model: string;
  temperature?: number | undefined;
  maxTokens?: number | undefined;
  tools?: ToolDefinition[] | undefined;
};

export type ModelResponse = {
  content: string;
  toolCalls?: ToolCall[] | undefined;
  usage: TokenUsage;
  finishReason: "stop" | "tool_calls" | "length";
};

export type TokenUsage = {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
};

export type ModelStreamChunk = {
  content?: string | undefined;
  toolCalls?: ToolCall[] | undefined;
  usage?: TokenUsage | undefined;
  finishReason?: "stop" | "tool_calls" | "length" | undefined;
};
