# @synkro/agents

AI agent orchestration for Synkro. Build LLM-powered agents with tools, memory, and multi-agent patterns — all on top of Synkro's event-driven workflow engine.

## Features

- **ReAct Loop** — Agents reason and act in a loop: call LLM, execute tools, repeat until done
- **Tool Execution** — Define typed tools with JSON Schema parameters; agents call them automatically
- **Provider Agnostic** — Built-in adapters for OpenAI and Anthropic; implement `ModelProvider` for any LLM
- **Conversation Memory** — Redis-backed message history via Synkro's existing `TransportManager`
- **Synkro Integration** — `agent.asHandler()` bridges any agent into Synkro's event system with locking, dedup, retries, and dead letter queue for free
- **Token Tracking** — Built-in usage accumulation with `tokenBudget` hard stops
- **Safety Guardrails** — `maxIterations` prevents infinite tool loops; `tokenBudget` caps API spend
- **Zero Dependencies** — Providers use native `fetch`; memory uses Synkro's existing transport

## Installation

```bash
npm install @synkro/agents @synkro/core
```

## Quick Start

### Single Agent

```ts
import { createAgent, createTool, OpenAIProvider } from "@synkro/agents";

const searchTool = createTool({
  name: "web_search",
  description: "Search the web for information",
  parameters: {
    type: "object",
    properties: {
      query: { type: "string", description: "Search query" },
    },
    required: ["query"],
  },
  async execute(input) {
    const res = await fetch(`https://api.search.com?q=${input.query}`);
    return res.json();
  },
});

const agent = createAgent({
  name: "researcher",
  systemPrompt: "You are a research assistant. Use web_search to find information.",
  provider: new OpenAIProvider({ apiKey: process.env.OPENAI_API_KEY! }),
  model: { model: "gpt-4o", temperature: 0.3 },
  tools: [searchTool],
  maxIterations: 5,
});

const result = await agent.run("What are the latest trends in AI?");
console.log(result.output);
console.log(result.tokenUsage);
```

### With Anthropic

```ts
import { createAgent, AnthropicProvider } from "@synkro/agents";

const agent = createAgent({
  name: "writer",
  systemPrompt: "You are a technical writer.",
  provider: new AnthropicProvider({ apiKey: process.env.ANTHROPIC_API_KEY! }),
  model: { model: "claude-sonnet-4-20250514" },
});

const result = await agent.run("Write a summary of event-driven architecture.");
```

### With Gemini

```ts
import { createAgent, GeminiProvider } from "@synkro/agents";

const agent = createAgent({
  name: "analyst",
  systemPrompt: "You are a data analyst.",
  provider: new GeminiProvider({ apiKey: process.env.GEMINI_API_KEY! }),
  model: { model: "gemini-2.0-flash" },
});

const result = await agent.run("Summarize the key metrics from this quarter.");
```

### As a Synkro Event Handler

Bridge an agent into Synkro's event system. The agent automatically gets distributed locking, deduplication, retries, and dead letter queue support.

```ts
import { Synkro } from "@synkro/core";
import { createAgent, OpenAIProvider } from "@synkro/agents";

const agent = createAgent({
  name: "support-agent",
  systemPrompt: "You answer customer support questions.",
  provider: new OpenAIProvider({ apiKey: process.env.OPENAI_API_KEY! }),
  model: { model: "gpt-4o" },
  tools: [lookupOrderTool, checkInventoryTool],
});

const synkro = await Synkro.start({
  transport: "redis",
  connectionUrl: "redis://localhost:6379",
  events: [
    { type: "support:request", handler: agent.asHandler() },
  ],
});

// Publish triggers the agent with full Synkro guarantees
await synkro.publish("support:request", { input: "Where is my order #12345?" });
```

The handler reads `payload.input` as the agent's input string. If `payload.input` is not a string, the entire payload is JSON-serialized as input. The agent writes its results back via `ctx.setPayload()`:

```ts
{
  agentOutput: "Your order #12345 is...",
  agentStatus: "completed",
  agentTokenUsage: { promptTokens: 150, completionTokens: 80, totalTokens: 230 },
  agentToolCalls: 2,
}
```

### With Conversation Memory

Persist conversation history across runs using Redis (via Synkro's transport layer).

```ts
import { Synkro } from "@synkro/core";
import { createAgent, OpenAIProvider, ConversationMemory } from "@synkro/agents";

const synkro = await Synkro.start({
  transport: "redis",
  connectionUrl: "redis://localhost:6379",
});

const memory = new ConversationMemory({
  transport: synkro.transport, // reuses existing Redis connection
  maxMessages: 50,
  ttlSeconds: 3600, // 1 hour
});

const agent = createAgent({
  name: "assistant",
  systemPrompt: "You are a helpful assistant with memory.",
  provider: new OpenAIProvider({ apiKey: process.env.OPENAI_API_KEY! }),
  model: { model: "gpt-4o" },
  memory,
});

// First run
await agent.run("My name is Alice.", { requestId: "session-1" });

// Second run — agent remembers the conversation
const result = await agent.run("What's my name?", { requestId: "session-1" });
// result.output → "Your name is Alice."
```

## API

### `createAgent(config): Agent`

Creates an agent instance.

```ts
type AgentConfig = {
  name: string;
  description?: string;
  systemPrompt: string;
  provider: ModelProvider;
  model: ModelOptions;
  tools?: Tool[];
  memory?: AgentMemory;
  maxIterations?: number;  // default: 10
  tokenBudget?: number;    // max total tokens before stopping
  retry?: RetryConfig;     // reuses @synkro/core's RetryConfig
  onTokenUsage?: (usage: TokenUsage) => void;
};
```

### `agent.run(input, options?): Promise<AgentRunResult>`

Runs the agent's ReAct loop with the given input string.

```ts
type AgentRunOptions = {
  requestId?: string;  // correlation ID (auto-generated if omitted)
  payload?: unknown;   // additional context passed to tool execution
};

type AgentRunResult = {
  agentName: string;
  runId: string;
  output: string;
  messages: Message[];
  toolCalls: ToolResult[];
  tokenUsage: TokenUsage;
  status: "completed" | "failed" | "max_iterations" | "token_budget_exceeded";
};
```

### `agent.asHandler(): HandlerFunction`

Returns a Synkro-compatible `HandlerFunction` that can be used with `synkro.on()`, event definitions, or workflow steps.

### `createTool(tool): Tool`

Creates a typed tool definition.

```ts
type Tool<TInput, TOutput> = {
  name: string;
  description: string;
  parameters: Record<string, unknown>;  // JSON Schema
  execute: (input: TInput, ctx: AgentContext) => Promise<TOutput>;
};
```

Tools receive an `AgentContext` which extends Synkro's `HandlerCtx` with agent-specific fields (`agentName`, `runId`, `tokenUsage`).

### `OpenAIProvider`

```ts
const provider = new OpenAIProvider({
  apiKey: "sk-...",
  baseUrl: "https://api.openai.com/v1",  // optional, for proxies or compatible APIs
});
```

### `AnthropicProvider`

```ts
const provider = new AnthropicProvider({
  apiKey: "sk-ant-...",
  baseUrl: "https://api.anthropic.com/v1",  // optional
});
```

### `GeminiProvider`

```ts
const provider = new GeminiProvider({
  apiKey: "AIza...",
  baseUrl: "https://generativelanguage.googleapis.com/v1beta",  // optional
});
```

### `ModelProvider` Interface

Implement this interface to use any LLM provider:

```ts
interface ModelProvider {
  chat(messages: Message[], options: ModelOptions): Promise<ModelResponse>;
  chatStream?(messages: Message[], options: ModelOptions): AsyncIterable<ModelStreamChunk>;
}
```

### `ConversationMemory`

Redis-backed conversation memory using Synkro's `TransportManager`.

```ts
const memory = new ConversationMemory({
  transport: transportManager,  // from Synkro instance
  maxMessages: 100,             // default: 100
  ttlSeconds: 86400,            // default: 24 hours
});
```

### `AgentMemory` Interface

Implement this interface for custom memory backends:

```ts
interface AgentMemory {
  addMessage(agentId: string, runId: string, message: Message): Promise<void>;
  getMessages(agentId: string, runId: string): Promise<Message[]>;
  clear(agentId: string, runId: string): Promise<void>;
}
```

## Types

```ts
type Message = {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  toolCallId?: string;
  toolCalls?: ToolCall[];
};

type ModelOptions = {
  model: string;
  temperature?: number;
  maxTokens?: number;
  tools?: ToolDefinition[];
};

type ModelResponse = {
  content: string;
  toolCalls?: ToolCall[];
  usage: TokenUsage;
  finishReason: "stop" | "tool_calls" | "length";
};

type TokenUsage = {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
};

type ToolResult = {
  toolCallId: string;
  name: string;
  result: unknown;
  error?: string;
  durationMs: number;
};

type AgentContext = HandlerCtx & {
  agentName: string;
  runId: string;
  tokenUsage: TokenUsage;
};
```

## License

MIT
