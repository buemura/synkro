import type { HandlerCtx, SynkroWorkflow } from "@synkro/core";
import { createPipeline } from "@synkro/agents";
import {
  notifyAgent,
  registry,
  supportAgent,
  triageAgent,
} from "./agents.js";

// ---------------------------------------------------------------------------
// Support ticket workflow (v0.1 style): manual agent.run() in handlers
//
// 1. TriageTicket   — AI agent classifies the ticket category
// 2. ResolveTicket  — AI agent looks up orders and drafts a response
// 3. NotifyCustomer — Sends the resolution to the customer
// ---------------------------------------------------------------------------

export const manualWorkflow: SynkroWorkflow = {
  name: "SupportTicket",
  steps: [
    {
      type: "TriageTicket",
      handler: async (ctx: HandlerCtx) => {
        const { message } = ctx.payload as { message: string };
        console.log(`  [Triage] Classifying: "${message}"`);

        const result = await triageAgent.run(message, {
          requestId: ctx.requestId,
        });

        console.log(`  [Triage] Category: ${result.output}`);
        ctx.setPayload({ message, category: result.output });
      },
    },
    {
      type: "ResolveTicket",
      handler: async (ctx: HandlerCtx) => {
        const { message, category } = ctx.payload as {
          message: string;
          category: string;
        };
        console.log(`  [Resolve] Handling ${category} ticket...`);

        const result = await supportAgent.run(
          `Category: ${category}. Customer message: ${message}`,
          { requestId: ctx.requestId },
        );

        console.log(`  [Resolve] Response: ${result.output}`);
        ctx.setPayload({ message, category, resolution: result.output });
      },
    },
    {
      type: "NotifyCustomer",
      handler: async (ctx: HandlerCtx) => {
        const { category, resolution } = ctx.payload as {
          category: string;
          resolution: string;
        };
        console.log(`  [Notify] Sending ${category} resolution to customer`);
        console.log(`  [Notify] Message: ${resolution.slice(0, 120)}...`);
      },
    },
  ],
};

// ---------------------------------------------------------------------------
// Support pipeline (v0.2 style): createPipeline() — zero manual wiring
//
// Each step is an agent. Outputs chain automatically via agentOutput payload.
// Tools inside agents get live ctx.publish() and ctx.delegate().
// ---------------------------------------------------------------------------

export const supportPipeline: SynkroWorkflow = createPipeline({
  name: "SupportPipeline",
  steps: [
    {
      agent: triageAgent,
      inputMapper: (payload: unknown) => {
        const p = payload as { message?: string; input?: string };
        return p.message ?? p.input ?? JSON.stringify(payload);
      },
    },
    {
      agent: supportAgent,
      inputMapper: (payload: unknown) => {
        const p = payload as { agentOutput?: string };
        return `Category: ${p.agentOutput}. Help the customer with their issue.`;
      },
    },
    {
      agent: notifyAgent,
      inputMapper: (payload: unknown) => {
        const p = payload as { agentOutput?: string };
        return `Send this resolution to the customer: ${p.agentOutput}`;
      },
    },
  ],
});

// ---------------------------------------------------------------------------
// Pipeline with string-based agent names (resolved from registry at creation)
// ---------------------------------------------------------------------------

export const registryPipeline: SynkroWorkflow = createPipeline({
  name: "RegistryPipeline",
  steps: [
    { agent: "triage-agent" },
    { agent: "support-agent" },
    { agent: "notify-agent" },
  ],
  registry,
});

// All workflows exported for Synkro.start()
export const workflows: SynkroWorkflow[] = [
  manualWorkflow,
  supportPipeline,
  registryPipeline,
];
