import type { ModelProvider } from "./provider.js";
import type { Message, ModelOptions, ModelResponse, ToolDefinition } from "./types.js";

export type OpenAIProviderOptions = {
  apiKey: string;
  baseUrl?: string | undefined;
};

type OpenAIMessage = {
  role: string;
  content: string | null;
  tool_call_id?: string;
  tool_calls?: OpenAIToolCall[];
};

type OpenAIToolCall = {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
};

type OpenAITool = {
  type: "function";
  function: { name: string; description: string; parameters: Record<string, unknown> };
};

type OpenAIResponse = {
  choices: Array<{
    message: {
      content: string | null;
      tool_calls?: OpenAIToolCall[];
    };
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
};

export class OpenAIProvider implements ModelProvider {
  private readonly apiKey: string;
  private readonly baseUrl: string;

  constructor(options: OpenAIProviderOptions) {
    this.apiKey = options.apiKey;
    this.baseUrl = options.baseUrl ?? "https://api.openai.com/v1";
  }

  async chat(messages: Message[], options: ModelOptions): Promise<ModelResponse> {
    const body: Record<string, unknown> = {
      model: options.model,
      messages: messages.map((m) => this.toOpenAIMessage(m)),
    };

    if (options.temperature !== undefined) {
      body.temperature = options.temperature;
    }
    if (options.maxTokens !== undefined) {
      body.max_tokens = options.maxTokens;
    }
    if (options.tools?.length) {
      body.tools = options.tools.map((t) => this.toOpenAITool(t));
    }

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`OpenAI API error (${response.status}): ${text}`);
    }

    const data = (await response.json()) as OpenAIResponse;
    const choice = data.choices[0];

    if (!choice) {
      throw new Error("OpenAI API returned no choices");
    }

    const toolCalls = choice.message.tool_calls?.map((tc) => ({
      id: tc.id,
      name: tc.function.name,
      arguments: tc.function.arguments,
    }));

    let finishReason: ModelResponse["finishReason"];
    if (choice.finish_reason === "tool_calls") {
      finishReason = "tool_calls";
    } else if (choice.finish_reason === "length") {
      finishReason = "length";
    } else {
      finishReason = "stop";
    }

    return {
      content: choice.message.content ?? "",
      toolCalls,
      usage: {
        promptTokens: data.usage.prompt_tokens,
        completionTokens: data.usage.completion_tokens,
        totalTokens: data.usage.total_tokens,
      },
      finishReason,
    };
  }

  private toOpenAIMessage(message: Message): OpenAIMessage {
    const msg: OpenAIMessage = {
      role: message.role,
      content: message.content,
    };

    if (message.role === "tool" && message.toolCallId) {
      msg.tool_call_id = message.toolCallId;
    }

    if (message.toolCalls?.length) {
      msg.tool_calls = message.toolCalls.map((tc) => ({
        id: tc.id,
        type: "function" as const,
        function: { name: tc.name, arguments: tc.arguments },
      }));
    }

    return msg;
  }

  private toOpenAITool(tool: ToolDefinition): OpenAITool {
    return {
      type: "function",
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
      },
    };
  }
}
