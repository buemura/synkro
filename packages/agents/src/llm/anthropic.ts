import type { ModelProvider } from "./provider.js";
import type { Message, ModelOptions, ModelResponse, ToolDefinition } from "./types.js";

export type AnthropicProviderOptions = {
  apiKey: string;
  baseUrl?: string | undefined;
};

type AnthropicMessage = {
  role: "user" | "assistant";
  content: string | AnthropicContentBlock[];
};

type AnthropicContentBlock =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: unknown }
  | { type: "tool_result"; tool_use_id: string; content: string };

type AnthropicTool = {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
};

type AnthropicResponse = {
  content: AnthropicContentBlock[];
  stop_reason: string;
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
};

export class AnthropicProvider implements ModelProvider {
  private readonly apiKey: string;
  private readonly baseUrl: string;

  constructor(options: AnthropicProviderOptions) {
    this.apiKey = options.apiKey;
    this.baseUrl = options.baseUrl ?? "https://api.anthropic.com/v1";
  }

  async chat(messages: Message[], options: ModelOptions): Promise<ModelResponse> {
    const systemMessage = messages.find((m) => m.role === "system");
    const nonSystemMessages = messages.filter((m) => m.role !== "system");

    const body: Record<string, unknown> = {
      model: options.model,
      messages: nonSystemMessages.map((m) => this.toAnthropicMessage(m)),
      max_tokens: options.maxTokens ?? 4096,
    };

    if (systemMessage) {
      body.system = systemMessage.content;
    }
    if (options.temperature !== undefined) {
      body.temperature = options.temperature;
    }
    if (options.tools?.length) {
      body.tools = options.tools.map((t) => this.toAnthropicTool(t));
    }

    const response = await fetch(`${this.baseUrl}/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": this.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Anthropic API error (${response.status}): ${text}`);
    }

    const data = (await response.json()) as AnthropicResponse;

    let content = "";
    const toolCalls: ModelResponse["toolCalls"] = [];

    for (const block of data.content) {
      if (block.type === "text") {
        content += block.text;
      } else if (block.type === "tool_use") {
        toolCalls.push({
          id: block.id,
          name: block.name,
          arguments: JSON.stringify(block.input),
        });
      }
    }

    let finishReason: ModelResponse["finishReason"];
    if (data.stop_reason === "tool_use") {
      finishReason = "tool_calls";
    } else if (data.stop_reason === "max_tokens") {
      finishReason = "length";
    } else {
      finishReason = "stop";
    }

    const totalTokens = data.usage.input_tokens + data.usage.output_tokens;

    return {
      content,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      usage: {
        promptTokens: data.usage.input_tokens,
        completionTokens: data.usage.output_tokens,
        totalTokens,
      },
      finishReason,
    };
  }

  private toAnthropicMessage(message: Message): AnthropicMessage {
    if (message.role === "tool") {
      return {
        role: "user",
        content: [
          {
            type: "tool_result",
            tool_use_id: message.toolCallId ?? "",
            content: message.content,
          },
        ],
      };
    }

    if (message.role === "assistant" && message.toolCalls?.length) {
      const blocks: AnthropicContentBlock[] = [];
      if (message.content) {
        blocks.push({ type: "text", text: message.content });
      }
      for (const tc of message.toolCalls) {
        blocks.push({
          type: "tool_use",
          id: tc.id,
          name: tc.name,
          input: JSON.parse(tc.arguments),
        });
      }
      return { role: "assistant", content: blocks };
    }

    const role = message.role === "assistant" ? "assistant" : "user";
    return { role, content: message.content };
  }

  private toAnthropicTool(tool: ToolDefinition): AnthropicTool {
    return {
      name: tool.name,
      description: tool.description,
      input_schema: tool.parameters,
    };
  }
}
