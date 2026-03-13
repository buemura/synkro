import { Logger } from "../logger.js";

import type { HandlerRegistry } from "../handlers/handler-registry.js";
import type { TransportManager } from "../transport/transport.js";
import type {
  HandlerFunction,
  RetentionConfig,
  SynkroWorkflow,
  WorkflowGraph,
  WorkflowGraphEdge,
  WorkflowGraphNode,
  WorkflowInfo,
} from "../types.js";

export type WorkflowState = {
  workflowName: string;
  currentStep: number;
  status: "running" | "completed" | "failed" | "cancelled";
  completedSteps?: string[];
  activeSteps?: string[];
  parallel?: boolean;
};

const DEFAULT_LOCK_TTL = 300;
const DEFAULT_DEDUPE_TTL = 86400;
const DEFAULT_STATE_TTL = 86400;

export class WorkflowRegistry {
  private workflows = new Map<string, SynkroWorkflow>();
  private branchTargets = new Map<string, Set<string>>();
  private parallelWorkflows = new Set<string>();
  private processingLocks = new Set<string>();
  private lockQueues = new Map<string, Promise<void>>();
  private activeTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly lockTtl: number;
  private readonly dedupTtl: number;
  private readonly stateTtl: number;

  constructor(
    private redis: TransportManager,
    private handlerRegistry: HandlerRegistry,
    retention?: RetentionConfig,
    private readonly logger: Logger = new Logger(),
  ) {
    this.lockTtl = retention?.lockTtl ?? DEFAULT_LOCK_TTL;
    this.dedupTtl = retention?.dedupTtl ?? DEFAULT_DEDUPE_TTL;
    this.stateTtl = retention?.stateTtl ?? DEFAULT_STATE_TTL;
  }

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

  get activeCount(): number {
    return this.processingLocks.size;
  }

  private isParallel(workflowName: string): boolean {
    return this.parallelWorkflows.has(workflowName);
  }

  getWorkflowGraph(workflowName: string): WorkflowGraph | null {
    const workflow = this.workflows.get(workflowName);
    if (!workflow) return null;
    return this.buildGraph(workflow);
  }

  getWorkflowGraphs(): WorkflowGraph[] {
    return Array.from(this.workflows.values()).map((w) => this.buildGraph(w));
  }

  private buildGraph(workflow: SynkroWorkflow): WorkflowGraph {
    const nodes: WorkflowGraphNode[] = workflow.steps.map((step) => ({
      id: step.type,
      type: "step" as const,
      label: step.type,
      ...(step.retry || step.timeoutMs
        ? {
            meta: {
              ...(step.retry && { retry: step.retry }),
              ...(step.timeoutMs && { timeoutMs: step.timeoutMs }),
            },
          }
        : {}),
    }));

    const edges: WorkflowGraphEdge[] = [];

    if (this.isParallel(workflow.name)) {
      for (const step of workflow.steps) {
        if (step.dependsOn) {
          for (const dep of step.dependsOn) {
            edges.push({ from: dep, to: step.type, label: "dependsOn" });
          }
        }
        if (step.onSuccess) {
          edges.push({ from: step.type, to: step.onSuccess, label: "onSuccess" });
        }
        if (step.onFailure) {
          edges.push({ from: step.type, to: step.onFailure, label: "onFailure" });
        }
      }
    } else {
      const targets = this.branchTargets.get(workflow.name);

      for (let i = 0; i < workflow.steps.length; i++) {
        const step = workflow.steps[i]!;

        if (step.onSuccess) {
          edges.push({ from: step.type, to: step.onSuccess, label: "onSuccess" });
        }

        if (step.onFailure) {
          edges.push({ from: step.type, to: step.onFailure, label: "onFailure" });
        }

        // Sequential "next" edge — same logic as findNextStep (skip branch targets)
        if (!step.onSuccess) {
          for (let j = i + 1; j < workflow.steps.length; j++) {
            if (!targets?.has(workflow.steps[j]!.type)) {
              edges.push({ from: step.type, to: workflow.steps[j]!.type, label: "next" });
              break;
            }
          }
        }
      }
    }

    return { workflowName: workflow.name, nodes, edges };
  }

  getRegisteredWorkflows(): WorkflowInfo[] {
    return Array.from(this.workflows.values()).map((w) => ({
      name: w.name,
      steps: w.steps.map((s) => ({
        type: s.type,
        ...(s.retry && { retry: s.retry }),
        ...(s.onSuccess && { onSuccess: s.onSuccess }),
        ...(s.onFailure && { onFailure: s.onFailure }),
        ...(s.timeoutMs && { timeoutMs: s.timeoutMs }),
        ...(s.dependsOn && { dependsOn: s.dependsOn }),
      })),
      ...(w.onComplete && { onComplete: w.onComplete }),
      ...(w.onSuccess && { onSuccess: w.onSuccess }),
      ...(w.onFailure && { onFailure: w.onFailure }),
      ...(w.timeoutMs && { timeoutMs: w.timeoutMs }),
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

      if (workflow.steps.some((s) => s.dependsOn && s.dependsOn.length > 0)) {
        this.parallelWorkflows.add(workflow.name);
      }

      for (let i = 0; i < workflow.steps.length; i++) {
        const step = workflow.steps[i]!;
        const channel = this.stepChannel(workflow.name, step.type);
        if (step.handler) {
          this.handlerRegistry.register(channel, step.handler, step.retry);
        }
      }

      this.subscribeToWorkflowEvents(workflow);
      this.logger.debug("[WorkflowRegistry] Workflow registered", {
        workflowName: workflow.name,
        steps: workflow.steps.length,
      });
    }
  }

  registerStepHandler(
    workflowName: string,
    stepType: string,
    handler: HandlerFunction,
  ): void {
    const workflow = this.workflows.get(workflowName);
    if (!workflow) {
      this.logger.warn("[WorkflowRegistry] Workflow not found for step handler", {
        workflowName,
        stepType,
      });
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

    if (this.isParallel(workflowName)) {
      await this.startParallelWorkflow(workflow, requestId, payload);
      return;
    }

    const state: WorkflowState = {
      workflowName,
      currentStep: 0,
      status: "running",
    };
    await this.saveState(requestId, state);

    const firstStep = workflow.steps[0]!;
    const channel = this.stepChannel(workflowName, firstStep.type);
    this.logger.debug("[WorkflowRegistry] Starting workflow", {
      workflowName,
      requestId,
      firstStep: firstStep.type,
    });

    await this.redis.publishMessage(channel, JSON.stringify({ requestId, payload }));
    this.startStepTimer(workflow, 0, requestId, payload);
  }

  private async startParallelWorkflow(
    workflow: SynkroWorkflow,
    requestId: string,
    payload: unknown,
  ): Promise<void> {
    const rootSteps = workflow.steps.filter(
      (s) => !s.dependsOn || s.dependsOn.length === 0,
    );

    const state: WorkflowState = {
      workflowName: workflow.name,
      currentStep: -1,
      status: "running",
      parallel: true,
      completedSteps: [],
      activeSteps: rootSteps.map((s) => s.type),
    };
    await this.saveState(requestId, state);

    this.logger.debug("[WorkflowRegistry] Starting parallel workflow", {
      workflowName: workflow.name,
      requestId,
      rootSteps: rootSteps.map((s) => s.type),
    });

    for (const step of rootSteps) {
      const channel = this.stepChannel(workflow.name, step.type);
      await this.redis.publishMessage(channel, JSON.stringify({ requestId, payload }));
      this.startStepTimer(workflow, this.findStepIndex(workflow, step.type), requestId, payload);
    }
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
      this.clearStepTimer(requestId, workflow.name, stepIndex);

      const state = await this.getState(requestId, workflow.name);
      if (!state || state.workflowName !== workflow.name || state.status !== "running") {
        return;
      }

      if (state.parallel) {
        await this.handleParallelStepCompletion(workflow, stepIndex, requestId, payload, state);
        return;
      }

      if (state.currentStep !== stepIndex) {
        this.logger.debug("[WorkflowRegistry] Ignoring stale completion", {
          workflowName: workflow.name,
          requestId,
          expectedStep: state.currentStep,
          receivedStep: stepIndex,
        });
        return;
      }

      const currentStep = workflow.steps[stepIndex]!;
      const onSuccess = currentStep.onSuccess;

      if (onSuccess) {
        const targetIndex = this.findStepIndex(workflow, onSuccess);
        if (targetIndex === -1) {
          this.logger.error("[WorkflowRegistry] onSuccess target not found", {
            workflowName: workflow.name,
            target: onSuccess,
          });
          return;
        }
        await this.routeToStep(workflow, requestId, targetIndex, payload);
        return;
      }

      const nextStepIndex = this.findNextStep(workflow, stepIndex);

      if (nextStepIndex === -1) {
        this.clearAllTimers(requestId, workflow.name, workflow.steps.length);
        state.status = "completed";
        state.currentStep = stepIndex;
        await this.saveState(requestId, state);
        this.logger.debug("[WorkflowRegistry] Workflow completed", {
          workflowName: workflow.name,
          requestId,
        });
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

  private async handleParallelStepCompletion(
    workflow: SynkroWorkflow,
    stepIndex: number,
    requestId: string,
    payload: unknown,
    state: WorkflowState,
  ): Promise<void> {
    const stepType = workflow.steps[stepIndex]!.type;

    if (state.completedSteps!.includes(stepType)) return;

    state.completedSteps!.push(stepType);
    state.activeSteps = state.activeSteps!.filter((s) => s !== stepType);

    const currentStep = workflow.steps[stepIndex]!;
    if (currentStep.onSuccess) {
      const targetIndex = this.findStepIndex(workflow, currentStep.onSuccess);
      if (targetIndex !== -1) {
        state.activeSteps!.push(currentStep.onSuccess);
        await this.saveState(requestId, state);
        const channel = this.stepChannel(workflow.name, currentStep.onSuccess);
        await this.redis.publishMessage(channel, JSON.stringify({ requestId, payload }));
        this.startStepTimer(workflow, targetIndex, requestId, payload);
        return;
      }
    }

    const unblocked = workflow.steps.filter((step) => {
      if (!step.dependsOn || step.dependsOn.length === 0) return false;
      if (state.completedSteps!.includes(step.type)) return false;
      if (state.activeSteps!.includes(step.type)) return false;
      return step.dependsOn.every((dep) => state.completedSteps!.includes(dep));
    });

    for (const step of unblocked) {
      state.activeSteps!.push(step.type);
    }

    if (state.activeSteps!.length === 0 && unblocked.length === 0) {
      state.status = "completed";
      this.clearAllTimers(requestId, workflow.name, workflow.steps.length);
      await this.saveState(requestId, state);
      this.logger.debug("[WorkflowRegistry] Parallel workflow completed", {
        workflowName: workflow.name,
        requestId,
      });
      await this.triggerNextWorkflows(workflow, "completed", requestId, payload);
      return;
    }

    await this.saveState(requestId, state);

    for (const step of unblocked) {
      const idx = this.findStepIndex(workflow, step.type);
      const channel = this.stepChannel(workflow.name, step.type);
      await this.redis.publishMessage(channel, JSON.stringify({ requestId, payload }));
      this.startStepTimer(workflow, idx, requestId, payload);
    }
  }

  private async handleStepFailure(
    workflow: SynkroWorkflow,
    stepIndex: number,
    requestId: string,
    payload: unknown,
  ): Promise<void> {
    const lockKey = `${requestId}:${workflow.name}:failure:${stepIndex}`;
    await this.withStepTransitionClaim(lockKey, async () => {
      this.clearStepTimer(requestId, workflow.name, stepIndex);

      const state = await this.getState(requestId, workflow.name);
      if (!state || state.workflowName !== workflow.name || state.status !== "running") {
        return;
      }

      if (state.parallel) {
        await this.handleParallelStepFailure(workflow, stepIndex, requestId, payload, state);
        return;
      }

      if (state.currentStep !== stepIndex) {
        this.logger.debug("[WorkflowRegistry] Ignoring stale failure", {
          workflowName: workflow.name,
          requestId,
          expectedStep: state.currentStep,
          receivedStep: stepIndex,
        });
        return;
      }

      const currentStep = workflow.steps[stepIndex]!;
      const onFailure = currentStep.onFailure;

      if (onFailure) {
        const targetIndex = this.findStepIndex(workflow, onFailure);
        if (targetIndex === -1) {
          this.logger.error("[WorkflowRegistry] onFailure target not found", {
            workflowName: workflow.name,
            target: onFailure,
          });
          return;
        }
        await this.routeToStep(workflow, requestId, targetIndex, payload);
        return;
      }

      this.clearAllTimers(requestId, workflow.name, workflow.steps.length);
      state.status = "failed";
      await this.saveState(requestId, state);
      this.logger.error("[WorkflowRegistry] Workflow failed", {
        workflowName: workflow.name,
        requestId,
        failedStep: currentStep.type,
      });
      await this.triggerNextWorkflows(workflow, "failed", requestId, payload);
    });
  }

  private async handleParallelStepFailure(
    workflow: SynkroWorkflow,
    stepIndex: number,
    requestId: string,
    payload: unknown,
    state: WorkflowState,
  ): Promise<void> {
    const currentStep = workflow.steps[stepIndex]!;

    if (currentStep.onFailure) {
      const targetIndex = this.findStepIndex(workflow, currentStep.onFailure);
      if (targetIndex !== -1) {
        state.activeSteps = state.activeSteps!.filter((s) => s !== currentStep.type);
        state.activeSteps!.push(currentStep.onFailure);
        await this.saveState(requestId, state);
        const channel = this.stepChannel(workflow.name, currentStep.onFailure);
        await this.redis.publishMessage(channel, JSON.stringify({ requestId, payload }));
        this.startStepTimer(workflow, targetIndex, requestId, payload);
        return;
      }
    }

    this.clearAllTimers(requestId, workflow.name, workflow.steps.length);
    state.status = "failed";
    await this.saveState(requestId, state);
    this.logger.error("[WorkflowRegistry] Parallel workflow failed", {
      workflowName: workflow.name,
      requestId,
      failedStep: currentStep.type,
    });
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
    this.logger.debug("[WorkflowRegistry] Advancing to step", {
      workflowName: workflow.name,
      requestId,
      stepIndex: targetIndex,
      stepType: targetStep.type,
    });

    await this.redis.publishMessage(channel, JSON.stringify({ requestId, payload }));
    this.startStepTimer(workflow, targetIndex, requestId, payload);
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
        this.logger.debug("[WorkflowRegistry] Triggering chained workflow", {
          fromWorkflow: workflow.name,
          targetWorkflow: target,
          requestId,
        });
        await this.startWorkflow(target, requestId, payload);
      } else {
        this.logger.error("[WorkflowRegistry] Chained workflow not found", {
          fromWorkflow: workflow.name,
          targetWorkflow: target,
        });
      }
    }
  }

  private timerKey(requestId: string, workflowName: string, stepIndex: number): string {
    return `${requestId}:${workflowName}:${stepIndex}`;
  }

  private startStepTimer(
    workflow: SynkroWorkflow,
    stepIndex: number,
    requestId: string,
    payload: unknown,
  ): void {
    const step = workflow.steps[stepIndex]!;
    const timeoutMs = step.timeoutMs ?? workflow.timeoutMs;
    if (!timeoutMs) return;

    const key = this.timerKey(requestId, workflow.name, stepIndex);
    const channel = this.stepChannel(workflow.name, step.type);

    const timer = setTimeout(() => {
      this.activeTimers.delete(key);
      this.logger.warn("[WorkflowRegistry] Step timed out", {
        workflowName: workflow.name,
        requestId,
        stepType: step.type,
        timeoutMs,
      });
      void this.redis.publishMessage(
        `event:${channel}:failed`,
        JSON.stringify({
          requestId,
          payload,
          errors: [{ message: `Step "${step.type}" timed out after ${timeoutMs}ms`, name: "TimeoutError" }],
        }),
      );
    }, timeoutMs);

    this.activeTimers.set(key, timer);
  }

  private clearStepTimer(requestId: string, workflowName: string, stepIndex: number): void {
    const key = this.timerKey(requestId, workflowName, stepIndex);
    const timer = this.activeTimers.get(key);
    if (timer) {
      clearTimeout(timer);
      this.activeTimers.delete(key);
    }
  }

  private clearAllTimers(requestId: string, workflowName: string, stepCount: number): void {
    for (let i = 0; i < stepCount; i++) {
      this.clearStepTimer(requestId, workflowName, i);
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

    for (const step of workflow.steps) {
      if (step.dependsOn) {
        for (const dep of step.dependsOn) {
          if (dep === step.type) {
            throw new Error(
              `[WorkflowRegistry] - Workflow "${workflow.name}" step "${step.type}" cannot depend on itself`,
            );
          }
          if (!stepTypes.has(dep)) {
            throw new Error(
              `[WorkflowRegistry] - Workflow "${workflow.name}" step "${step.type}" depends on unknown step "${dep}"`,
            );
          }
        }
      }
    }

    if (workflow.steps.some((s) => s.dependsOn && s.dependsOn.length > 0)) {
      this.detectCycles(workflow);
    }
  }

  private detectCycles(workflow: SynkroWorkflow): void {
    const inDegree = new Map<string, number>();
    const dependents = new Map<string, string[]>();

    for (const step of workflow.steps) {
      inDegree.set(step.type, step.dependsOn?.length ?? 0);
      dependents.set(step.type, []);
    }

    for (const step of workflow.steps) {
      if (step.dependsOn) {
        for (const dep of step.dependsOn) {
          dependents.get(dep)!.push(step.type);
        }
      }
    }

    const queue = [...inDegree.entries()]
      .filter(([, deg]) => deg === 0)
      .map(([type]) => type);
    let visited = 0;

    while (queue.length > 0) {
      const current = queue.shift()!;
      visited++;
      for (const dependent of dependents.get(current) ?? []) {
        const newDeg = inDegree.get(dependent)! - 1;
        inDegree.set(dependent, newDeg);
        if (newDeg === 0) queue.push(dependent);
      }
    }

    if (visited !== workflow.steps.length) {
      throw new Error(
        `[WorkflowRegistry] - Workflow "${workflow.name}" has a dependency cycle`,
      );
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
      this.logger.debug("[WorkflowRegistry] Duplicate transition ignored", {
        lockKey,
      });
      return;
    }

    this.processingLocks.add(lockKey);
    if (this.processingLocks.size > 1000) {
      this.logger.warn("[WorkflowRegistry] processingLocks size exceeded 1000", {
        size: this.processingLocks.size,
      });
    }

    const distributedLockKey = this.distributedLockKey(lockKey);
    let distributedLockAcquired = false;
    let completed = false;

    try {
      distributedLockAcquired = await this.redis.setCacheIfNotExists(
        distributedLockKey,
        "1",
        this.lockTtl,
      );

      if (!distributedLockAcquired) {
        return;
      }

      await fn();
      completed = true;
    } finally {
      this.processingLocks.delete(lockKey);
      if (completed) {
        await this.redis.setCache(dedupeKey, "1", this.dedupTtl);
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
      this.logger.error("[WorkflowRegistry] Malformed message, dropping", {
        message,
      });
      return null;
    }

    if (!parsed.requestId || typeof parsed.requestId !== "string") {
      this.logger.error("[WorkflowRegistry] Missing or invalid requestId, dropping message");
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
      this.stateTtl,
    );
  }

  private async getState(requestId: string, workflowName: string): Promise<WorkflowState | null> {
    const raw = await this.redis.getCache(this.stateKey(requestId, workflowName));
    if (!raw) return null;
    return JSON.parse(raw) as WorkflowState;
  }

  async queryState(requestId: string, workflowName: string): Promise<WorkflowState | null> {
    return this.getState(requestId, workflowName);
  }

  async cancelWorkflow(requestId: string, workflowName: string): Promise<boolean> {
    const state = await this.getState(requestId, workflowName);
    if (!state || state.status !== "running") {
      return false;
    }

    const workflow = this.workflows.get(workflowName);
    if (workflow) {
      this.clearAllTimers(requestId, workflowName, workflow.steps.length);
    }

    state.status = "cancelled";
    await this.saveState(requestId, state);

    this.logger.debug("[WorkflowRegistry] Workflow cancelled", {
      workflowName,
      requestId,
    });

    return true;
  }
}
