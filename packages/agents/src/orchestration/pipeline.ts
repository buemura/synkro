import type { HandlerCtx, SynkroWorkflow, SynkroWorkflowStep } from "@synkro/core";
import type { Agent } from "../agent.js";
import type { AgentRegistry } from "../agent-registry.js";

export type AgentStep = {
  agent: Agent | string;
  inputMapper?: (payload: unknown) => string;
};

export type PipelineConfig = {
  name: string;
  steps: AgentStep[];
  registry?: AgentRegistry | undefined;
  onSuccess?: string | undefined;
  onFailure?: string | undefined;
  onComplete?: string | undefined;
};

function resolveAgent(step: AgentStep, registry?: AgentRegistry): Agent {
  if (typeof step.agent === "string") {
    if (!registry) {
      throw new Error(
        `Cannot resolve agent "${step.agent}": no registry provided`,
      );
    }
    const agent = registry.get(step.agent);
    if (!agent) {
      throw new Error(
        `Cannot resolve agent "${step.agent}": not found in registry`,
      );
    }
    return agent;
  }
  return step.agent;
}

function defaultInputMapper(payload: unknown, stepIndex: number): string {
  const p = payload as Record<string, unknown> | undefined;

  if (stepIndex > 0 && p?.agentOutput && typeof p.agentOutput === "string") {
    return p.agentOutput;
  }

  if (typeof p?.input === "string") {
    return p.input;
  }

  return JSON.stringify(payload);
}

export function createPipeline(config: PipelineConfig): SynkroWorkflow {
  if (!config.steps.length) {
    throw new Error(`Pipeline "${config.name}" must have at least one step`);
  }

  const workflowSteps: SynkroWorkflowStep[] = config.steps.map(
    (step, index) => {
      const agent = resolveAgent(step, config.registry);
      const agentName = agent.name;

      return {
        type: `step:${index}:${agentName}`,
        handler: async (ctx: HandlerCtx) => {
          const input = step.inputMapper
            ? step.inputMapper(ctx.payload)
            : defaultInputMapper(ctx.payload, index);

          const result = await agent.run(input, {
            requestId: ctx.requestId,
            payload: ctx.payload,
            synkroCtx: ctx,
          });

          ctx.setPayload({
            agentOutput: result.output,
            agentStatus: result.status,
            agentTokenUsage: result.tokenUsage,
            agentToolCalls: result.toolCalls.length,
          });
        },
      };
    },
  );

  return {
    name: config.name,
    steps: workflowSteps,
    ...(config.onSuccess && { onSuccess: config.onSuccess }),
    ...(config.onFailure && { onFailure: config.onFailure }),
    ...(config.onComplete && { onComplete: config.onComplete }),
  };
}
