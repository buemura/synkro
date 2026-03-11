import "dotenv/config";
import { Synkro } from "@synkro/core";
import {
  coordinatorAgent,
  mathAgent,
  registry,
  supportAgent,
  weatherAgent,
} from "./agents.js";
import { workflows } from "./workflows.js";

// ---------------------------------------------------------------------------
// 1. Standalone agents (same as v0.1)
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
// 2. Agent delegation via registry (v0.2 — NEW)
// ---------------------------------------------------------------------------

async function runDelegationExample() {
  console.log("=== Agent Delegation (v0.2) ===\n");

  console.log(`>> Registry has ${registry.list().length} agents registered`);
  console.log(
    `   Agents: ${registry.list().map((a: { name: string }) => a.name).join(", ")}\n`,
  );

  // The coordinator agent delegates to specialists using ctx.delegate()
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
// 3. Synkro integration — asHandler + pipelines (v0.2 — NEW)
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

  // --- Single event handled by an agent (live context: tools get real publish) ---
  console.log(">> Publishing support:request event");
  await synkro.publish("support:request", {
    input: "Where is my order ORD-001?",
  });
  await new Promise((resolve) => setTimeout(resolve, 3000));
  console.log("   Event processed by support agent via asHandler()\n");

  // --- Manual workflow: Triage -> Resolve -> Notify ---
  console.log(">> Starting SupportTicket workflow (manual wiring)\n");
  await synkro.publish("SupportTicket", {
    message: "I was charged twice for order ORD-001, please refund me",
  });
  await new Promise((resolve) => setTimeout(resolve, 10_000));
  console.log();

  // --- Pipeline workflow: same flow, zero manual wiring (v0.2) ---
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
// 4. Main
// ---------------------------------------------------------------------------

async function main() {
  console.log("\n--- @synkro/agents v0.2 Examples ---\n");

  await runStandaloneExamples();
  await runDelegationExample();

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
