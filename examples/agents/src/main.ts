import "dotenv/config";
import { Synkro } from "@synkro/core";
import {
  coordinatorAgent,
  mathAgent,
  observableAgent,
  registry,
  researchSupervisor,
  supportAgent,
  ticketRouter,
  weatherAgent,
} from "./agents.js";
import { workflows } from "./workflows.js";

// ---------------------------------------------------------------------------
// 1. Standalone agents (v0.1)
// ---------------------------------------------------------------------------

async function runStandaloneExamples() {
  console.log("=== Standalone Agent Examples ===\n");

  console.log(">> Weather Agent");
  const weatherResult = await weatherAgent.run(
    "What's the weather in San Francisco?",
  );
  console.log(`   Status: ${weatherResult.status}`);
  console.log(`   Output: ${weatherResult.output}`);
  console.log(`   Tool calls: ${weatherResult.toolCalls.length}`);
  console.log(`   Tokens used: ${weatherResult.tokenUsage.totalTokens}`);
  console.log();

  console.log(">> Math Agent");
  const mathResult = await mathAgent.run("What is 2 + 2?");
  console.log(`   Status: ${mathResult.status}`);
  console.log(`   Output: ${mathResult.output}`);
  console.log(`   Tool calls: ${mathResult.toolCalls.length}`);
  console.log();

  console.log(">> Support Agent (with token budget tracking)");
  const supportResult = await supportAgent.run("Where is my order?");
  console.log(`   Status: ${supportResult.status}`);
  console.log(`   Output: ${supportResult.output}`);
  console.log(`   Tool calls: ${supportResult.toolCalls.length}`);
  console.log();
}

// ---------------------------------------------------------------------------
// 2. Agent delegation via registry (v0.2)
// ---------------------------------------------------------------------------

async function runDelegationExample() {
  console.log("=== Agent Delegation (v0.2) ===\n");

  console.log(`>> Registry has ${registry.list().length} agents registered`);
  console.log(
    `   Agents: ${registry.list().map((a: { name: string }) => a.name).join(", ")}\n`,
  );

  console.log(">> Coordinator: routing weather question to specialist");
  const result = await coordinatorAgent.run(
    "What's the weather in New York?",
  );
  console.log(`   Status: ${result.status}`);
  console.log(`   Output: ${result.output}`);
  console.log(`   Total tokens (coordinator + delegated): ${result.tokenUsage.totalTokens}`);
  console.log();
}

// ---------------------------------------------------------------------------
// 3. Observability — emitEvents: true (v0.3 — NEW)
//
// Agents with emitEvents: true publish lifecycle events (agent:run:started,
// agent:run:completed, agent:tool:executed) to the Synkro event system.
// Here we simulate that with a mock HandlerCtx to capture the events.
// ---------------------------------------------------------------------------

async function runObservabilityExample() {
  console.log("=== Observability — emitEvents (v0.3) ===\n");

  const events: Array<{ type: string; payload: unknown }> = [];

  // Simulated HandlerCtx — captures events that the agent publishes
  const mockCtx = {
    requestId: "demo-req-001",
    payload: { input: "Where is my order ORD-001?" },
    publish: async (type: string, payload: unknown) => {
      events.push({ type, payload });
      console.log(`   [event] ${type}`);
      return "ok";
    },
    setPayload: (_payload: unknown) => {},
  };

  console.log(">> Running observable-support agent with live context");
  const handler = observableAgent.asHandler();
  await handler(mockCtx);

  console.log(`\n   Lifecycle events emitted: ${events.length}`);
  for (const e of events) {
    const p = e.payload as Record<string, unknown>;
    if (e.type === "agent:tool:executed") {
      console.log(`     • ${e.type} — tool=${p.toolName} durationMs=${p.durationMs}`);
    } else if (e.type === "agent:run:completed") {
      console.log(`     • ${e.type} — status=${p.status} tokens=${(p.tokenUsage as { totalTokens: number })?.totalTokens} durationMs=${p.durationMs}`);
    } else {
      console.log(`     • ${e.type}`);
    }
  }
  console.log();
}

// ---------------------------------------------------------------------------
// 4. Dynamic Router — createRouter() (v0.3 — NEW)
//
// The LLM classifies the incoming message and publishes the selected route
// name as a Synkro event. Downstream handlers react to those route events.
// ---------------------------------------------------------------------------

async function runRouterExample() {
  console.log("=== Dynamic Router — createRouter() (v0.3) ===\n");

  const testMessages = [
    "I was charged twice for my order, I need a refund",
    "The app keeps crashing whenever I try to upload a file",
    "Do you have a mobile app?",
  ];

  const handler = ticketRouter.asHandler();

  for (const message of testMessages) {
    let publishedRoute = "(none)";

    const mockCtx = {
      requestId: `req-${Date.now()}`,
      payload: { input: message },
      publish: async (route: string, _payload: unknown) => {
        publishedRoute = route;
        return "ok";
      },
      setPayload: (_payload: unknown) => {},
    };

    console.log(`>> Message: "${message.slice(0, 55)}..."`);
    await handler(mockCtx);
    console.log(`   → Routed to: ${publishedRoute}\n`);
  }
}

// ---------------------------------------------------------------------------
// 5. Supervisor/Worker — createSupervisor() (v0.3 — NEW)
//
// The supervisor agent breaks down a complex request and delegates each part
// to a specialized worker (weather-assistant, math-assistant). It then
// synthesizes the results into a unified answer.
// ---------------------------------------------------------------------------

async function runSupervisorExample() {
  console.log("=== Supervisor/Worker — createSupervisor() (v0.3) ===\n");

  console.log(">> Asking supervisor a multi-part question:");
  const question =
    "What's the weather in London? Also, what is 144 divided by 12?";
  console.log(`   "${question}"\n`);

  const result = await researchSupervisor.run(question);

  console.log(`   Status: ${result.status}`);
  console.log(`   Worker delegations: ${result.toolCalls.length}`);
  console.log(`   Total tokens: ${result.tokenUsage.totalTokens}`);
  console.log(`   Output: ${result.output}`);
  console.log();
}

// ---------------------------------------------------------------------------
// 6. Synkro integration — asHandler + pipelines (v0.2)
// ---------------------------------------------------------------------------

async function runSynkroIntegration() {
  console.log("=== Synkro Event Integration ===\n");

  const synkro = await Synkro.start({
    transport: "redis",
    connectionUrl: "redis://localhost:6379",
    events: [
      {
        type: "support:request",
        handler: supportAgent.asHandler(),
      },
    ],
    workflows,
    retention: { dedupTtl: 120, stateTtl: 120, metricsTtl: 120 },
  });

  console.log(">> Publishing support:request event");
  await synkro.publish("support:request", {
    input: "Where is my order ORD-001?",
  });
  await new Promise((resolve) => setTimeout(resolve, 3000));
  console.log("   Event processed by support agent via asHandler()\n");

  console.log(">> Starting SupportTicket workflow (manual wiring)\n");
  await synkro.publish("SupportTicket", {
    message: "I was charged twice for order ORD-001, please refund me",
  });
  await new Promise((resolve) => setTimeout(resolve, 10_000));
  console.log();

  console.log(">> Starting SupportPipeline workflow (createPipeline)\n");
  console.log("   Agents chain automatically: triage → support → notify\n");
  await synkro.publish("SupportPipeline", {
    message: "My account shows an error when I try to log in",
  });
  await new Promise((resolve) => setTimeout(resolve, 10_000));
  console.log();

  await synkro.stop();
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log("\n--- @synkro/agents v0.3 Examples ---\n");

  await runStandaloneExamples();
  await runDelegationExample();
  await runObservabilityExample();
  await runRouterExample();
  await runSupervisorExample();

  // Synkro integration requires Redis — skip if not available
  try {
    await runSynkroIntegration();
  } catch {
    console.log(">> Skipping Synkro integration (Redis not available)\n");
  }

  console.log("--- Done ---\n");
  process.exit(0);
}

main().catch(console.error);
