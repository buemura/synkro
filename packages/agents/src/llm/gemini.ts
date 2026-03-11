import type { ModelProvider } from "./provider.js";
import type { Message, ModelOptions, ModelResponse, ToolDefinition } from "./types.js";

export type GeminiProviderOptions = {
  apiKey: string;
  baseUrl?: string | undefined;
};

type GeminiContent = {
  role: "user" | "model";
  parts: GeminiPart[];
};

type GeminiPart =
  | { text: string }
  | { functionCall: { name: string; args: Record<string, unknown> } }
  | { functionResponse: { name: string; response: { content: unknown } } };

type GeminiTool = {
  functionDeclarations: Array<{
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  }>;
};

type GeminiResponse = {
  candidates: Array<{
    content: {
      parts: GeminiPart[];
      role: string;
    };
    finishReason: string;
  }>;
  usageMetadata: {
    promptTokenCount: number;
    candidatesTokenCount: number;
    totalTokenCount: number;
  };
};

export class GeminiProvider implements ModelProvider {
  private readonly apiKey: string;
  private readonly baseUrl: string;

  constructor(options: GeminiProviderOptions) {
    this.apiKey = options.apiKey;
    this.baseUrl =
      options.baseUrl ?? "https://generativelanguage.googleapis.com/v1beta";
  }

  async chat(messages: Message[], options: ModelOptions): Promise<ModelResponse> {
    const systemMessage = messages.find((m) => m.role === "system");
    const nonSystemMessages = messages.filter((m) => m.role !== "system");

    const body: Record<string, unknown> = {
      contents: this.toGeminiContents(nonSystemMessages),
    };

    if (systemMessage) {
      body.systemInstruction = { parts: [{ text: systemMessage.content }] };
    }

    const generationConfig: Record<string, unknown> = {};
    if (options.temperature !== undefined) {
      generationConfig.temperature = options.temperature;
    }
    if (options.maxTokens !== undefined) {
      generationConfig.maxOutputTokens = options.maxTokens;
    }
    if (Object.keys(generationConfig).length > 0) {
      body.generationConfig = generationConfig;
    }

    if (options.tools?.length) {
      body.tools = [this.toGeminiTools(options.tools)];
    }

    const url = `${this.baseUrl}/models/${options.model}:generateContent?key=${this.apiKey}`;

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Gemini API error (${response.status}): ${text}`);
    }

    const data = (await response.json()) as GeminiResponse;
    const candidate = data.candidates[0];

    if (!candidate) {
      throw new Error("Gemini API returned no candidates");
    }

    let content = "";
    const toolCalls: ModelResponse["toolCalls"] = [];

    for (const part of candidate.content.parts) {
      if ("text" in part) {
        content += part.text;
      } else if ("functionCall" in part) {
        toolCalls.push({
          id: `gemini-${crypto.randomUUID()}`,
          name: part.functionCall.name,
          arguments: JSON.stringify(part.functionCall.args),
        });
      }
    }

    let finishReason: ModelResponse["finishReason"];
    if (candidate.finishReason === "MAX_TOKENS") {
      finishReason = "length";
    } else if (toolCalls.length > 0) {
      finishReason = "tool_calls";
    } else {
      finishReason = "stop";
    }

    return {
      content,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      usage: {
        promptTokens: data.usageMetadata.promptTokenCount,
        completionTokens: data.usageMetadata.candidatesTokenCount,
        totalTokens: data.usageMetadata.totalTokenCount,
      },
      finishReason,
    };
  }

  private toGeminiContents(messages: Message[]): GeminiContent[] {
    const contents: GeminiContent[] = [];

    for (const msg of messages) {
      if (msg.role === "user") {
        contents.push({ role: "user", parts: [{ text: msg.content }] });
      } else if (msg.role === "assistant") {
        const parts: GeminiPart[] = [];
        if (msg.content) {
          parts.push({ text: msg.content });
        }
        if (msg.toolCalls?.length) {
          for (const tc of msg.toolCalls) {
            parts.push({
              functionCall: {
                name: tc.name,
                args: JSON.parse(tc.arguments),
              },
            });
          }
        }
        if (parts.length > 0) {
          contents.push({ role: "model", parts });
        }
      } else if (msg.role === "tool") {
        // Gemini expects function responses as user-role parts
        let parsed: unknown;
        try {
          parsed = JSON.parse(msg.content);
        } catch {
          parsed = msg.content;
        }
        contents.push({
          role: "user",
          parts: [
            {
              functionResponse: {
                name: msg.toolCallId ?? "unknown",
                response: { content: parsed },
              },
            },
          ],
        });
      }
    }

    return contents;
  }

  private toGeminiTools(tools: ToolDefinition[]): GeminiTool {
    return {
      functionDeclarations: tools.map((t) => ({
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      })),
    };
  }
}
