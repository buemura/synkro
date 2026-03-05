import { logger } from "./logger.js";

import type { HandlerRegistry } from "./handler-registry.js";
import type { TransportManager } from "./transport.js";
import type { SynkroWorkflow } from "./types.js";

type WorkflowState = {
  workflowName: string;
  currentStep: number;
  status: "running" | "completed" | "failed";
};

export class WorkflowRegistry {
  private workflows = new Map<string, SynkroWorkflow>();
  private branchTargets = new Map<string, Set<string>>();
  private eventToWorkflows = new Map<
    string,
    { workflow: SynkroWorkflow; stepIndex: number }[]
  >();

  constructor(
    private redis: TransportManager,
    private handlerRegistry: HandlerRegistry,
  ) {}

  registerWorkflows(workflows: SynkroWorkflow[]): void {
    for (const workflow of workflows) {
      this.workflows.set(workflow.name, workflow);

      const targets = new Set<string>();
      for (const step of workflow.steps) {
        if (step.onSuccess) targets.add(step.onSuccess);
        if (step.onFailure) targets.add(step.onFailure);
      }
      this.branchTargets.set(workflow.name, targets);

      for (let i = 0; i < workflow.steps.length; i++) {
        const step = workflow.steps[i]!;
        const key = step.type;

        if (!this.eventToWorkflows.has(key)) {
          this.eventToWorkflows.set(key, []);
        }
        this.eventToWorkflows.get(key)!.push({ workflow, stepIndex: i });

        const channel = this.stepChannel(workflow.name, step.type);
        this.handlerRegistry.register(channel, step.handler, step.retry);
      }

      this.subscribeToWorkflowEvents(workflow);
      logger.debug(
        `[WorkflowRegistry] - Workflow "${workflow.name}" registered with ${workflow.steps.length} steps`,
      );
    }
  }

  hasWorkflow(name: string): boolean {
    return this.workflows.has(name);
  }

  async startWorkflow(
    workflowName: string,
    requestId: string,
    payload: unknown,
  ): Promise<void> {
    const workflow = this.workflows.get(workflowName);
    if (!workflow) {
      throw new Error(
        `[WorkflowRegistry] - Workflow "${workflowName}" not found`,
      );
    }

    const state: WorkflowState = {
      workflowName,
      currentStep: 0,
      status: "running",
    };
    await this.saveState(requestId, state);

    const firstStep = workflow.steps[0]!;
    const channel = this.stepChannel(workflowName, firstStep.type);
    logger.debug(
      `[WorkflowRegistry] - Starting workflow "${workflowName}" (requestId: ${requestId}), publishing "${firstStep.type}"`,
    );

    this.redis.publishMessage(
      channel,
      JSON.stringify({ requestId, payload }),
    );
  }

  private subscribeToWorkflowEvents(workflow: SynkroWorkflow): void {
    for (let i = 0; i < workflow.steps.length; i++) {
      const step = workflow.steps[i]!;
      const channel = this.stepChannel(workflow.name, step.type);

      this.redis.subscribeToChannel(
        `event:${channel}:completed`,
        (message: string) => {
          this.handleStepCompletion(workflow, i, message);
        },
      );

      this.redis.subscribeToChannel(
        `event:${channel}:failed`,
        (message: string) => {
          this.handleStepFailure(workflow, i, message);
        },
      );
    }
  }

  private async handleStepCompletion(
    workflow: SynkroWorkflow,
    stepIndex: number,
    message: string,
  ): Promise<void> {
    const { requestId, payload } = JSON.parse(message) as {
      requestId: string;
      payload: unknown;
    };

    const state = await this.getState(requestId);
    if (!state || state.workflowName !== workflow.name) {
      return;
    }

    if (state.currentStep !== stepIndex) {
      logger.warn(
        `[WorkflowRegistry] - Step mismatch for "${workflow.name}" (requestId: ${requestId}): expected step ${state.currentStep}, got ${stepIndex}`,
      );
      return;
    }

    const currentStep = workflow.steps[stepIndex]!;
    const onSuccess = currentStep.onSuccess;

    if (onSuccess) {
      const targetIndex = this.findStepIndex(workflow, onSuccess);
      if (targetIndex === -1) {
        logger.error(
          `[WorkflowRegistry] - onSuccess target "${onSuccess}" not found in workflow "${workflow.name}"`,
        );
        return;
      }
      await this.routeToStep(workflow, requestId, targetIndex, payload);
      return;
    }

    const nextStepIndex = this.findNextStep(workflow, stepIndex);

    if (nextStepIndex === -1) {
      state.status = "completed";
      state.currentStep = stepIndex;
      await this.saveState(requestId, state);
      logger.debug(
        `[WorkflowRegistry] - Workflow "${workflow.name}" completed (requestId: ${requestId})`,
      );
      await this.triggerNextWorkflows(workflow, "completed", requestId, payload);
      return;
    }

    await this.routeToStep(workflow, requestId, nextStepIndex, payload);
  }

  private async handleStepFailure(
    workflow: SynkroWorkflow,
    stepIndex: number,
    message: string,
  ): Promise<void> {
    const { requestId, payload } = JSON.parse(message) as {
      requestId: string;
      payload: unknown;
    };

    const state = await this.getState(requestId);
    if (!state || state.workflowName !== workflow.name) {
      return;
    }

    if (state.currentStep !== stepIndex) {
      logger.warn(
        `[WorkflowRegistry] - Step mismatch for "${workflow.name}" (requestId: ${requestId}): expected step ${state.currentStep}, got ${stepIndex}`,
      );
      return;
    }

    const currentStep = workflow.steps[stepIndex]!;
    const onFailure = currentStep.onFailure;

    if (onFailure) {
      const targetIndex = this.findStepIndex(workflow, onFailure);
      if (targetIndex === -1) {
        logger.error(
          `[WorkflowRegistry] - onFailure target "${onFailure}" not found in workflow "${workflow.name}"`,
        );
        return;
      }
      await this.routeToStep(workflow, requestId, targetIndex, payload);
      return;
    }

    state.status = "failed";
    await this.saveState(requestId, state);
    logger.error(
      `[WorkflowRegistry] - Workflow "${workflow.name}" failed at step "${currentStep.type}" (requestId: ${requestId})`,
    );
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
    const channel = this.stepChannel(workflow.name, targetStep.type);
    logger.debug(
      `[WorkflowRegistry] - Workflow "${workflow.name}" advancing to step ${targetIndex}: "${targetStep.type}" (requestId: ${requestId})`,
    );

    this.redis.publishMessage(
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
      if (this.workflows.has(target)) {
        logger.debug(
          `[WorkflowRegistry] - Workflow "${workflow.name}" triggering workflow "${target}" (requestId: ${requestId})`,
        );
        await this.startWorkflow(target, requestId, payload);
      } else {
        logger.error(
          `[WorkflowRegistry] - Chained workflow "${target}" not found (from "${workflow.name}")`,
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

  private findStepIndex(workflow: SynkroWorkflow, stepType: string): number {
    return workflow.steps.findIndex((step) => step.type === stepType);
  }

  private stepChannel(workflowName: string, stepType: string): string {
    return `workflow:${workflowName}:${stepType}`;
  }

  private stateKey(requestId: string): string {
    return `workflow:state:${requestId}`;
  }

  private async saveState(
    requestId: string,
    state: WorkflowState,
  ): Promise<void> {
    await this.redis.setCache(
      this.stateKey(requestId),
      JSON.stringify(state),
      86400,
    );
  }

  private async getState(requestId: string): Promise<WorkflowState | null> {
    const raw = await this.redis.getCache(this.stateKey(requestId));
    if (!raw) return null;
    return JSON.parse(raw) as WorkflowState;
  }
}
