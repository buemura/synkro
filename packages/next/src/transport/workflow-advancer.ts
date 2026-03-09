import type { TransportManager, SynkroWorkflow } from "@synkro/core";

type WorkflowState = {
  workflowName: string;
  currentStep: number;
  status: "running" | "completed" | "failed" | "cancelled";
};

const DEFAULT_STATE_TTL = 86400;
const DEFAULT_LOCK_TTL = 300;
const DEFAULT_DEDUPE_TTL = 86400;

export type WorkflowAdvancerOptions = {
  transport: TransportManager;
  workflows: SynkroWorkflow[];
  stateTtl?: number;
  lockTtl?: number;
  dedupTtl?: number;
};

/**
 * Handles workflow step advancement in serverless environments.
 *
 * In persistent mode, the WorkflowRegistry subscribes to step completion/failure
 * events and advances the state machine. In serverless mode, there are no persistent
 * subscriptions, so the route handler calls `advanceAfterStep` directly after
 * executing a step handler.
 */
export class WorkflowAdvancer {
  private workflowMap: Map<string, SynkroWorkflow>;
  private branchTargets: Map<string, Set<string>>;
  private transport: TransportManager;
  private readonly stateTtl: number;
  private readonly lockTtl: number;
  private readonly dedupTtl: number;

  constructor(options: WorkflowAdvancerOptions) {
    this.transport = options.transport;
    this.stateTtl = options.stateTtl ?? DEFAULT_STATE_TTL;
    this.lockTtl = options.lockTtl ?? DEFAULT_LOCK_TTL;
    this.dedupTtl = options.dedupTtl ?? DEFAULT_DEDUPE_TTL;

    this.workflowMap = new Map();
    this.branchTargets = new Map();

    for (const wf of options.workflows) {
      this.workflowMap.set(wf.name, wf);
      const targets = new Set<string>();
      for (const step of wf.steps) {
        if (step.onSuccess) targets.add(step.onSuccess);
        if (step.onFailure) targets.add(step.onFailure);
      }
      this.branchTargets.set(wf.name, targets);
    }
  }

  /**
   * Advance a workflow after a step has completed or failed.
   * Called by createWorkflowStepHandler after handler execution.
   */
  async advanceAfterStep(
    workflowName: string,
    stepType: string,
    requestId: string,
    payload: unknown,
    success: boolean,
  ): Promise<void> {
    const workflow = this.workflowMap.get(workflowName);
    if (!workflow) return;

    const stepIndex = workflow.steps.findIndex((s) => s.type === stepType);
    if (stepIndex === -1) return;

    const lockKey = `${requestId}:${workflowName}:${success ? "completion" : "failure"}:${stepIndex}`;

    // Distributed dedup + lock (same pattern as WorkflowRegistry.withStepTransitionClaim)
    const dedupeKey = `synkro:dedupe:workflow:${lockKey}`;
    const alreadyProcessed = await this.transport.getCache(dedupeKey);
    if (alreadyProcessed === "1") return;

    const distributedLockKey = `synkro:lock:workflow:${lockKey}`;
    const lockAcquired = await this.transport.setCacheIfNotExists(
      distributedLockKey,
      "1",
      this.lockTtl,
    );
    if (!lockAcquired) return;

    try {
      const state = await this.getState(requestId, workflowName);
      if (!state || state.status !== "running" || state.currentStep !== stepIndex) {
        return;
      }

      if (success) {
        await this.handleCompletion(workflow, stepIndex, requestId, payload, state);
      } else {
        await this.handleFailure(workflow, stepIndex, requestId, payload, state);
      }

      await this.transport.setCache(dedupeKey, "1", this.dedupTtl);
    } finally {
      await this.transport.deleteCache(distributedLockKey);
    }
  }

  private async handleCompletion(
    workflow: SynkroWorkflow,
    stepIndex: number,
    requestId: string,
    payload: unknown,
    state: WorkflowState,
  ): Promise<void> {
    const currentStep = workflow.steps[stepIndex]!;

    if (currentStep.onSuccess) {
      const targetIndex = workflow.steps.findIndex((s) => s.type === currentStep.onSuccess);
      if (targetIndex !== -1) {
        await this.routeToStep(workflow, requestId, targetIndex, payload);
        return;
      }
    }

    const nextStepIndex = this.findNextStep(workflow, stepIndex);

    if (nextStepIndex === -1) {
      // Workflow completed
      state.status = "completed";
      await this.saveState(requestId, state);
      await this.triggerNextWorkflows(workflow, "completed", requestId, payload);
      return;
    }

    await this.routeToStep(workflow, requestId, nextStepIndex, payload);
  }

  private async handleFailure(
    workflow: SynkroWorkflow,
    stepIndex: number,
    requestId: string,
    payload: unknown,
    state: WorkflowState,
  ): Promise<void> {
    const currentStep = workflow.steps[stepIndex]!;

    if (currentStep.onFailure) {
      const targetIndex = workflow.steps.findIndex((s) => s.type === currentStep.onFailure);
      if (targetIndex !== -1) {
        await this.routeToStep(workflow, requestId, targetIndex, payload);
        return;
      }
    }

    // Workflow failed
    state.status = "failed";
    await this.saveState(requestId, state);
    await this.triggerNextWorkflows(workflow, "failed", requestId, payload);
  }

  private async routeToStep(
    workflow: SynkroWorkflow,
    requestId: string,
    targetIndex: number,
    payload: unknown,
  ): Promise<void> {
    const state: WorkflowState = {
      workflowName: workflow.name,
      currentStep: targetIndex,
      status: "running",
    };
    await this.saveState(requestId, state);

    const targetStep = workflow.steps[targetIndex]!;
    const channel = `workflow:${workflow.name}:${targetStep.type}`;
    await this.transport.publishMessage(
      channel,
      JSON.stringify({ requestId, payload }),
    );
  }

  private async triggerNextWorkflows(
    workflow: SynkroWorkflow,
    outcome: "completed" | "failed",
    requestId: string,
    payload: unknown,
  ): Promise<void> {
    const targets: string[] = [];

    if (outcome === "completed" && workflow.onSuccess) {
      targets.push(workflow.onSuccess);
    }
    if (outcome === "failed" && workflow.onFailure) {
      targets.push(workflow.onFailure);
    }
    if (workflow.onComplete) {
      targets.push(workflow.onComplete);
    }

    for (const target of targets) {
      if (this.workflowMap.has(target)) {
        // Start the chained workflow
        const newState: WorkflowState = {
          workflowName: target,
          currentStep: 0,
          status: "running",
        };
        await this.saveState(requestId, newState);

        const chainedWorkflow = this.workflowMap.get(target)!;
        const firstStep = chainedWorkflow.steps[0]!;
        const channel = `workflow:${target}:${firstStep.type}`;
        await this.transport.publishMessage(
          channel,
          JSON.stringify({ requestId, payload }),
        );
      }
    }
  }

  private findNextStep(workflow: SynkroWorkflow, currentIndex: number): number {
    const targets = this.branchTargets.get(workflow.name);
    for (let i = currentIndex + 1; i < workflow.steps.length; i++) {
      if (!targets?.has(workflow.steps[i]!.type)) {
        return i;
      }
    }
    return -1;
  }

  private stateKey(requestId: string, workflowName: string): string {
    return `workflow:state:${requestId}:${workflowName}`;
  }

  private async getState(requestId: string, workflowName: string): Promise<WorkflowState | null> {
    const raw = await this.transport.getCache(this.stateKey(requestId, workflowName));
    if (!raw) return null;
    return JSON.parse(raw) as WorkflowState;
  }

  private async saveState(requestId: string, state: WorkflowState): Promise<void> {
    await this.transport.setCache(
      this.stateKey(requestId, state.workflowName),
      JSON.stringify(state),
      this.stateTtl,
    );
  }
}
