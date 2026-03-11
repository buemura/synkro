# @synkro/agents

## v0.1.0

**Release date:** 2026-03-11

### Changes

Initial release

AI agent orchestration package for `@synkro/core`. Provides LLM-powered agents with tool execution, conversation memory, and Synkro integration.

- **Agent class** with ReAct loop (reason → act → observe → repeat)
- **ModelProvider interface** with built-in adapters for OpenAI, Anthropic, and Gemini
- **Tool system** — typed tools with JSON Schema parameters, parallel execution, error handling
- **ConversationMemory** — Redis-backed message history via `TransportManager`
- **`agent.asHandler()`** — bridges agents into Synkro's event system (locking, dedup, retries, DLQ)
- **Safety guardrails** — `maxIterations` and `tokenBudget` prevent runaway loops and API spend
- **Factory functions** — `createAgent()` and `createTool()` for ergonomic API
