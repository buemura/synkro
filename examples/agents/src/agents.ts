import {
  createAgent,
  createAgentRegistry,
  createRouter,
  createSupervisor,
  OpenAIProvider,
} from "@synkro/agents";
import {
  calculate,
  classifyTicket,
  delegateToAgent,
  getWeather,
  notifyCustomer,
  searchOrders,
} from "./tools.js";

const provider = new OpenAIProvider({ apiKey: process.env.OPENAI_API_KEY! });

// ---------------------------------------------------------------------------
// Agent Registry — agents can look up and delegate to each other by name
// ---------------------------------------------------------------------------

export const registry = createAgentRegistry();

// ---------------------------------------------------------------------------
// Individual agents
// ---------------------------------------------------------------------------

export const weatherAgent = createAgent({
  name: "weather-assistant",
  description: "An agent that can look up weather information",
  systemPrompt:
    "You are a helpful weather assistant. Use the get_weather tool to look up weather data when asked. Be concise.",
  provider,
  model: { model: "gpt-4o-mini", temperature: 0.3 },
  tools: [getWeather],
  maxIterations: 5,
  registry,
});
registry.register(weatherAgent);

export const mathAgent = createAgent({
  name: "math-assistant",
  systemPrompt:
    "You are a math assistant. Use the calculate tool to evaluate expressions. Be concise.",
  provider,
  model: { model: "gpt-4o-mini", temperature: 0 },
  tools: [calculate],
  maxIterations: 3,
  registry,
});
registry.register(mathAgent);

export const supportAgent = createAgent({
  name: "support-agent",
  description: "Customer support agent with order lookup capabilities",
  systemPrompt:
    "You are a customer support agent. Help customers find their orders using the search_orders tool. Be friendly and concise.",
  provider,
  model: { model: "gpt-4o-mini", temperature: 0.5 },
  tools: [searchOrders],
  maxIterations: 5,
  tokenBudget: 10_000,
  registry,
  onTokenUsage: (usage) => {
    console.log(
      `  [tokens] prompt=${usage.promptTokens} completion=${usage.completionTokens} total=${usage.totalTokens}`,
    );
  },
});
registry.register(supportAgent);

export const triageAgent = createAgent({
  name: "triage-agent",
  description: "Classifies incoming support tickets by category",
  systemPrompt:
    "You are a ticket triage agent. Use the classify_ticket tool to categorize the customer message. " +
    "After classification, respond with ONLY the category name (billing, technical, or general).",
  provider,
  model: { model: "gpt-4o-mini", temperature: 0 },
  tools: [classifyTicket],
  maxIterations: 3,
  registry,
});
registry.register(triageAgent);

export const notifyAgent = createAgent({
  name: "notify-agent",
  description: "Sends customer notifications based on a resolution",
  systemPrompt:
    "You are a notification agent. Use the notify_customer tool to send the resolution to the customer. " +
    "Summarize the resolution in a friendly, concise message before sending.",
  provider,
  model: { model: "gpt-4o-mini", temperature: 0.3 },
  tools: [notifyCustomer],
  maxIterations: 3,
  registry,
});
registry.register(notifyAgent);

// ---------------------------------------------------------------------------
// Coordinator agent — delegates to other agents using ctx.delegate()
// ---------------------------------------------------------------------------

export const coordinatorAgent = createAgent({
  name: "coordinator",
  description: "Routes customer requests to the right specialist agent",
  systemPrompt:
    "You are a coordinator. You delegate tasks to specialist agents using the delegate_to_agent tool.\n" +
    "Available agents: weather-assistant, math-assistant, support-agent.\n" +
    "Analyze the user's request and delegate to the most appropriate agent. " +
    "Return the specialist's response to the user.",
  provider,
  model: { model: "gpt-4o-mini", temperature: 0 },
  tools: [delegateToAgent],
  maxIterations: 5,
  registry,
});
registry.register(coordinatorAgent);

// ---------------------------------------------------------------------------
// v0.3.0 — Observability: agent with emitEvents: true (D4)
//
// When called via asHandler() or run() with a live synkroCtx, this agent
// publishes lifecycle events to the Synkro event system:
//   agent:run:started, agent:run:completed, agent:tool:executed
// ---------------------------------------------------------------------------

export const observableAgent = createAgent({
  name: "observable-support",
  description: "Support agent with lifecycle observability enabled",
  systemPrompt:
    "You are a customer support agent. Help customers find their orders using the search_orders tool. Be friendly and concise.",
  provider,
  model: { model: "gpt-4o-mini", temperature: 0.5 },
  tools: [searchOrders],
  maxIterations: 5,
  emitEvents: true,
});

// ---------------------------------------------------------------------------
// v0.3.0 — Dynamic Router: LLM-based N-path branching (D5)
//
// The router asks the LLM to classify the incoming message and publishes
// the selected route name as an event (billing / technical / general).
// Downstream handlers subscribe to those events independently.
// ---------------------------------------------------------------------------

export const ticketRouter = createRouter({
  name: "ticket-router",
  provider,
  model: { model: "gpt-4o-mini" },
  routes: [
    {
      name: "billing",
      description: "Billing issues: charges, refunds, duplicate payments, invoices",
    },
    {
      name: "technical",
      description: "Technical issues: errors, bugs, app crashes, outages",
    },
    {
      name: "general",
      description: "General questions, feedback, feature requests",
    },
  ],
  fallback: "general",
});

// ---------------------------------------------------------------------------
// v0.3.0 — Supervisor/Worker: multi-agent collaboration (D6)
//
// The supervisor delegates tasks to worker agents and iterates until done.
// No registry needed — workers are passed directly to createSupervisor().
// ---------------------------------------------------------------------------

export const researchSupervisor = createSupervisor({
  name: "research-supervisor",
  systemPrompt:
    "You are a research supervisor. Break down the user's request and delegate each part to the right specialist:\n" +
    "- Weather questions → weather-assistant\n" +
    "- Math calculations → math-assistant\n" +
    "Once all parts are done, synthesize the results into a final answer.",
  provider,
  model: { model: "gpt-4o-mini", temperature: 0 },
  workers: [weatherAgent, mathAgent],
  maxRounds: 6,
});
