import { logger } from "../logger.js";

import type { HandlerRegistry } from "../handlers/handler-registry.js";
import type { TransportManager } from "../transport/transport.js";
import type { HandlerFunction, SynkroWorkflow, WorkflowInfo } from "../types.js";

type WorkflowState = {
  workflowName: string;
  currentStep: number;
  status: "running" | "completed" | "failed";
};

const PROCESSING_LOCK_TTL_SECONDS = 300;
const DEDUPE_TTL_SECONDS = 86400;

export class WorkflowRegistry {
  private workflows = new Map<string, SynkroWorkflow>();
  private branchTargets = new Map<string, Set<string>>();
  private processingLocks = new Set<string>();
  private lockQueues = new Map<string, Promise<void>>();

  constructor(
    private redis: TransportManager,
    private handlerRegistry: HandlerRegistry,
  ) {}

  private async withLock(
    lockKey: string,
    fn: () => Promise<void>,
  ): Promise<void> {
    const prev = this.lockQueues.get(lockKey) ?? Promise.resolve();
    let resolve!: () => void;
    const current = new Promise<void>((r) => {
      resolve = r;
    });
    this.lockQueues.set(lockKey, current);
    try {
      await prev;
      await fn();
    } finally {
      if (this.lockQueues.get(lockKey) === current) {
        this.lockQueues.delete(lockKey);
      }
      resolve();
    }
  }

  getRegisteredWorkflows(): WorkflowInfo[] {
    return Array.from(this.workflows.values()).map((w) => ({
      name: w.name,
      steps: w.steps.map((s) => ({
        type: s.type,
        ...(s.retry && { retry: s.retry }),
        ...(s.onSuccess && { onSuccess: s.onSuccess }),
        ...(s.onFailure && { onFailure: s.onFailure }),
      })),
      ...(w.onComplete && { onComplete: w.onComplete }),
      ...(w.onSuccess && { onSuccess: w.onSuccess }),
      ...(w.onFailure && { onFailure: w.onFailure }),
    }));
  }

  registerWorkflows(workflows: SynkroWorkflow[]): void {
    for (const wf of workflows) {
      const workflow = this.normalizeWorkflow(wf);
      this.validateWorkflow(workflow);
      this.workflows.set(workflow.name, workflow);

      const targets = new Set<string>();
      for (const step of workflow.steps) {
        if (step.onSuccess) targets.add(step.onSuccess);
        if (step.onFailure) targets.add(step.onFailure);
      }
      this.branchTargets.set(workflow.name, targets);

      for (let i = 0; i < workflow.steps.length; i++) {
        const step = workflow.steps[i]!;
        const channel = this.stepChannel(workflow.name, step.type);
        if (step.handler) {
          this.handlerRegistry.register(channel, step.handler, step.retry);
        }
      }

      this.subscribeToWorkflowEvents(workflow);
      logger.debug(
        `[WorkflowRegistry] - Workflow "${workflow.name}" registered with ${workflow.steps.length} steps`,
      );
    }
  }

  registerStepHandler(
    workflowName: string,
    stepType: string,
    handler: HandlerFunction,
  ): void {
    const workflow = this.workflows.get(workflowName);
    if (!workflow) {
      logger.warn(
        `[WorkflowRegistry] - Workflow "${workflowName}" not found for step handler "${stepType}"`,
      );
      return;
    }

    const channel = this.stepChannel(workflowName, stepType);
    this.handlerRegistry.register(channel, handler);
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

    await this.redis.publishMessage(channel, JSON.stringify({ requestId, payload }));
  }

  private subscribeToWorkflowEvents(workflow: SynkroWorkflow): void {
    for (let i = 0; i < workflow.steps.length; i++) {
      const step = workflow.steps[i]!;
      const channel = this.stepChannel(workflow.name, step.type);

      this.redis.subscribeToChannel(
        `event:${channel}:completed`,
        (message: string) => {
          const parsed = this.safeParse(message);
          if (!parsed) return;
          void this.withLock(`${parsed.requestId}:${workflow.name}`, () =>
            this.handleStepCompletion(workflow, i, parsed.requestId, parsed.payload),
          );
        },
      );

      this.redis.subscribeToChannel(
        `event:${channel}:failed`,
        (message: string) => {
          const parsed = this.safeParse(message);
          if (!parsed) return;
          void this.withLock(`${parsed.requestId}:${workflow.name}`, () =>
            this.handleStepFailure(workflow, i, parsed.requestId, parsed.payload),
          );
        },
      );
    }
  }

  private async handleStepCompletion(
    workflow: SynkroWorkflow,
    stepIndex: number,
    requestId: string,
    payload: unknown,
  ): Promise<void> {
    const lockKey = `${requestId}:${workflow.name}:completion:${stepIndex}`;
    await this.withStepTransitionClaim(lockKey, async () => {
      const state = await this.getState(requestId, workflow.name);
      if (!state || state.workflowName !== workflow.name || state.status !== "running") {
        return;
      }

      if (state.currentStep !== stepIndex) {
        logger.debug(
          `[WorkflowRegistry] - Ignoring stale completion for "${workflow.name}" (requestId: ${requestId}): expected step ${state.currentStep}, got ${stepIndex}`,
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
        await this.triggerNextWorkflows(
          workflow,
          "completed",
          requestId,
          payload,
        );
        return;
      }

      await this.routeToStep(workflow, requestId, nextStepIndex, payload);
    });
  }

  private async handleStepFailure(
    workflow: SynkroWorkflow,
    stepIndex: number,
    requestId: string,
    payload: unknown,
  ): Promise<void> {
    const lockKey = `${requestId}:${workflow.name}:failure:${stepIndex}`;
    await this.withStepTransitionClaim(lockKey, async () => {
      const state = await this.getState(requestId, workflow.name);
      if (!state || state.workflowName !== workflow.name || state.status !== "running") {
        return;
      }

      if (state.currentStep !== stepIndex) {
        logger.debug(
          `[WorkflowRegistry] - Ignoring stale failure for "${workflow.name}" (requestId: ${requestId}): expected step ${state.currentStep}, got ${stepIndex}`,
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
    });
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

    await this.redis.publishMessage(channel, JSON.stringify({ requestId, payload }));
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

  private normalizeWorkflow(workflow: SynkroWorkflow): SynkroWorkflow {
    const explicitTypes = new Set(workflow.steps.map((s) => s.type));
    const implicitSteps: SynkroWorkflow["steps"] = [];
    const added = new Set<string>();

    for (const step of workflow.steps) {
      for (const target of [step.onSuccess, step.onFailure]) {
        if (target && !explicitTypes.has(target) && !added.has(target)) {
          implicitSteps.push({ type: target });
          added.add(target);
        }
      }
    }

    if (implicitSteps.length === 0) return workflow;

    return { ...workflow, steps: [...workflow.steps, ...implicitSteps] };
  }

  private validateWorkflow(workflow: SynkroWorkflow): void {
    if (!workflow.name) {
      throw new Error("[WorkflowRegistry] - Workflow name must not be empty");
    }

    if (!workflow.steps || workflow.steps.length === 0) {
      throw new Error(
        `[WorkflowRegistry] - Workflow "${workflow.name}" must have at least one step`,
      );
    }

    const stepTypes = new Set<string>();
    for (const step of workflow.steps) {
      if (stepTypes.has(step.type)) {
        throw new Error(
          `[WorkflowRegistry] - Workflow "${workflow.name}" has duplicate step type "${step.type}"`,
        );
      }
      stepTypes.add(step.type);
    }
  }

  private stateKey(requestId: string, workflowName: string): string {
    return `workflow:state:${requestId}:${workflowName}`;
  }

  private async withStepTransitionClaim(
    lockKey: string,
    fn: () => Promise<void>,
  ): Promise<void> {
    if (this.processingLocks.has(lockKey)) {
      return;
    }

    const dedupeKey = this.dedupeKey(lockKey);
    const alreadyProcessed = await this.redis.getCache(dedupeKey);
    if (alreadyProcessed === "1") {
      logger.debug(
        `[WorkflowRegistry] - Duplicate transition ignored (${lockKey})`,
      );
      return;
    }

    this.processingLocks.add(lockKey);
    if (this.processingLocks.size > 1000) {
      logger.warn(
        `[WorkflowRegistry] - processingLocks size exceeded 1000 (current: ${this.processingLocks.size})`,
      );
    }

    const distributedLockKey = this.distributedLockKey(lockKey);
    let distributedLockAcquired = false;
    let completed = false;

    try {
      distributedLockAcquired = await this.redis.setCacheIfNotExists(
        distributedLockKey,
        "1",
        PROCESSING_LOCK_TTL_SECONDS,
      );

      if (!distributedLockAcquired) {
        return;
      }

      await fn();
      completed = true;
    } finally {
      this.processingLocks.delete(lockKey);
      if (completed) {
        await this.redis.setCache(dedupeKey, "1", DEDUPE_TTL_SECONDS);
      }
      if (distributedLockAcquired) {
        await this.redis.deleteCache(distributedLockKey);
      }
    }
  }

  private distributedLockKey(lockKey: string): string {
    return `synkro:lock:workflow:${lockKey}`;
  }

  private dedupeKey(lockKey: string): string {
    return `synkro:dedupe:workflow:${lockKey}`;
  }

  private safeParse(message: string): { requestId: string; payload: unknown } | null {
    let parsed: { requestId: string; payload: unknown };
    try {
      parsed = JSON.parse(message) as { requestId: string; payload: unknown };
    } catch {
      logger.error(
        `[WorkflowRegistry] - Malformed message, dropping: ${message}`,
      );
      return null;
    }

    if (!parsed.requestId || typeof parsed.requestId !== "string") {
      logger.error(
        `[WorkflowRegistry] - Missing or invalid requestId, dropping message`,
      );
      return null;
    }

    return parsed;
  }

  private async saveState(
    requestId: string,
    state: WorkflowState,
  ): Promise<void> {
    await this.redis.setCache(
      this.stateKey(requestId, state.workflowName),
      JSON.stringify(state),
      86400,
    );
  }

  private async getState(requestId: string, workflowName: string): Promise<WorkflowState | null> {
    const raw = await this.redis.getCache(this.stateKey(requestId, workflowName));
    if (!raw) return null;
    return JSON.parse(raw) as WorkflowState;
  }
}
