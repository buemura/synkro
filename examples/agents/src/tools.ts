import type { AgentContext, Tool } from "@synkro/agents";
import { createTool } from "@synkro/agents";

export const getWeather: Tool = createTool({
  name: "get_weather",
  description: "Get the current weather for a given city",
  parameters: {
    type: "object",
    properties: {
      city: { type: "string", description: "City name" },
    },
    required: ["city"],
  },
  async execute(input: unknown) {
    const { city } = input as { city: string };
    // Simulate an API call
    const data: Record<string, { temp: number; condition: string }> = {
      "san francisco": { temp: 62, condition: "foggy" },
      "new york": { temp: 78, condition: "sunny" },
      london: { temp: 55, condition: "rainy" },
    };
    const weather = data[city.toLowerCase()];
    if (!weather) {
      return { error: `No data for "${city}"` };
    }
    return { city, ...weather };
  },
});

export const calculate: Tool = createTool({
  name: "calculate",
  description: "Evaluate a math expression and return the result",
  parameters: {
    type: "object",
    properties: {
      expression: {
        type: "string",
        description: "Math expression to evaluate",
      },
    },
    required: ["expression"],
  },
  async execute(input: unknown) {
    const { expression } = input as { expression: string };
    const allowed = /^[\d\s+\-*/().]+$/;
    if (!allowed.test(expression)) {
      return { error: "Invalid expression" };
    }
    const result = new Function(`return (${expression})`)();
    return { expression, result };
  },
});

export const searchOrders: Tool = createTool({
  name: "search_orders",
  description: "Search for customer orders by query",
  parameters: {
    type: "object",
    properties: {
      query: { type: "string", description: "Search query for orders" },
    },
    required: ["query"],
  },
  async execute(input: unknown) {
    const { query } = input as { query: string };
    // Simulate a database lookup
    return {
      orders: [
        { id: "ORD-001", status: "shipped", item: "Widget A" },
        { id: "ORD-002", status: "processing", item: "Gadget B" },
      ],
      query,
    };
  },
});

export const classifyTicket: Tool = createTool({
  name: "classify_ticket",
  description:
    "Classify a support ticket into a category: billing, technical, or general",
  parameters: {
    type: "object",
    properties: {
      message: {
        type: "string",
        description: "The customer message to classify",
      },
    },
    required: ["message"],
  },
  async execute(input: unknown) {
    const { message } = input as { message: string };
    const lower = message.toLowerCase();
    if (lower.includes("charge") || lower.includes("invoice") || lower.includes("refund")) {
      return { category: "billing", confidence: 0.92 };
    }
    if (lower.includes("error") || lower.includes("bug") || lower.includes("crash")) {
      return { category: "technical", confidence: 0.88 };
    }
    return { category: "general", confidence: 0.75 };
  },
});

// ---------------------------------------------------------------------------
// v0.2.0 tools — demonstrate delegation and live context
// ---------------------------------------------------------------------------

export const delegateToAgent: Tool = createTool({
  name: "delegate_to_agent",
  description:
    "Delegate a task to a specialist agent by name. Available agents: weather-assistant, math-assistant, support-agent",
  parameters: {
    type: "object",
    properties: {
      agentName: {
        type: "string",
        description: "Name of the agent to delegate to",
      },
      input: {
        type: "string",
        description: "The task or question to send to the agent",
      },
    },
    required: ["agentName", "input"],
  },
  async execute(input: unknown, ctx: AgentContext) {
    const { agentName, input: task } = input as {
      agentName: string;
      input: string;
    };
    console.log(`  [delegate] ${ctx.agentName} → ${agentName}`);
    const result = await ctx.delegate(agentName, task);
    console.log(`  [delegate] ${agentName} responded (${result.status})`);
    return { agentName, output: result.output, status: result.status };
  },
});

export const notifyCustomer: Tool = createTool({
  name: "notify_customer",
  description: "Send a notification message to the customer",
  parameters: {
    type: "object",
    properties: {
      message: {
        type: "string",
        description: "The notification message to send",
      },
    },
    required: ["message"],
  },
  async execute(input: unknown, ctx: AgentContext) {
    const { message } = input as { message: string };
    // In production this would send an email/SMS. Here we publish an event
    // using the live synkro context (works when called via asHandler/pipeline).
    await ctx.publish("customer:notified", {
      message,
      agentName: ctx.agentName,
    });
    console.log(`  [notify] Sent: ${message.slice(0, 80)}...`);
    return { sent: true, message };
  },
});
