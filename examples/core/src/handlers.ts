import { OnEvent, OnWorkflowStep } from "@synkro/core";
import type { HandlerCtx } from "@synkro/core";

import { delay } from "./delay.js";

// ---------------------------------------------------------------------------
// Decorator-based handlers (class style)
// ---------------------------------------------------------------------------

export class NotificationHandlers {
  @OnEvent("UserSignedUp")
  async sendWelcomeEmail(ctx: HandlerCtx) {
    const { email, name } = ctx.payload as { email: string; name: string };
    await delay(1000);
    console.log(`  [Email] (${ctx.requestId}) Sending welcome email to ${name} <${email}>`);
  }

  @OnEvent("UserSignedUp")
  async createUserProfile(ctx: HandlerCtx) {
    const { name } = ctx.payload as { name: string };
    await delay(1000);
    console.log(`  [Profile] (${ctx.requestId}) Creating default profile for ${name}`);
  }

  @OnEvent("PaymentReceived", { maxRetries: 3, backoff: "exponential" })
  async issueReceipt(ctx: HandlerCtx) {
    const { orderId, amount } = ctx.payload as {
      orderId: string;
      amount: number;
    };
    await delay(1000);
    console.log(
      `  [Receipt] (${ctx.requestId}) Issuing receipt for order ${orderId} — $${amount}`,
    );
  }
}

export class OrderWorkflowHandlers {
  @OnWorkflowStep("OrderProcessing", "ValidateOrder")
  async validateOrder(ctx: HandlerCtx) {
    const { orderId, items } = ctx.payload as {
      orderId: string;
      items: string[];
    };
    await delay(1000);
    console.log(
      `  [Validate] (${ctx.requestId}) Order ${orderId} with ${items.length} item(s) is valid`,
    );
  }

  @OnWorkflowStep("OrderProcessing", "ProcessPayment")
  async processPayment(ctx: HandlerCtx) {
    const { orderId } = ctx.payload as { orderId: string };
    await delay(1000);
    console.log(`  [Payment] (${ctx.requestId}) Processing payment for order ${orderId}`);
    ctx.setPayload({ paymentId: "pay_" + Date.now() });
  }

  @OnWorkflowStep("OrderProcessing", "FulfillOrder")
  async fulfillOrder(ctx: HandlerCtx) {
    const { orderId } = ctx.payload as { orderId: string };
    await delay(1000);
    console.log(`  [Fulfill] (${ctx.requestId}) Shipping order ${orderId}`);
  }

  @OnWorkflowStep("OrderProcessing", "HandlePaymentFailure")
  async handlePaymentFailure(ctx: HandlerCtx) {
    const { orderId } = ctx.payload as { orderId: string };
    await delay(1000);
    console.log(
      `  [Failure] (${ctx.requestId}) Payment failed for order ${orderId}, notifying customer`,
    );
  }
}

// ---------------------------------------------------------------------------
// DeployService workflow — step-level onSuccess/onFailure routing
//
// RunTests routes to DeployToProduction on success, or Rollback on failure.
// ---------------------------------------------------------------------------

export class DeploymentWorkflowHandlers {
  @OnWorkflowStep("DeployService", "BuildImage")
  async buildImage(ctx: HandlerCtx) {
    const { service, version } = ctx.payload as {
      service: string;
      version: string;
    };
    await delay(1000);
    console.log(`  [Build] (${ctx.requestId}) Building image for ${service}@${version}`);
  }

  @OnWorkflowStep("DeployService", "RunTests")
  async runTests(ctx: HandlerCtx) {
    const { service, shouldFail } = ctx.payload as {
      service: string;
      shouldFail?: boolean;
    };
    await delay(1000);
    if (shouldFail) {
      throw new Error(`Tests failed for ${service}`);
    }
    console.log(`  [Tests] (${ctx.requestId}) All tests passed for ${service}`);
  }

  @OnWorkflowStep("DeployService", "DeployToProduction")
  async deployToProduction(ctx: HandlerCtx) {
    const { service, version } = ctx.payload as {
      service: string;
      version: string;
    };
    await delay(1000);
    console.log(`  [Deploy] (${ctx.requestId}) Deployed ${service}@${version} to production`);
  }

  @OnWorkflowStep("DeployService", "Rollback")
  async rollback(ctx: HandlerCtx) {
    const { service } = ctx.payload as { service: string };
    await delay(1000);
    console.log(`  [Rollback] (${ctx.requestId}) Rolling back ${service} to previous version`);
  }
}

// ---------------------------------------------------------------------------
// DataPipeline workflow — workflow-level onSuccess/onFailure/onComplete
//
// No step-level routing — if a step fails the workflow fails immediately.
// onSuccess  -> PipelineNotify   (only on success)
// onFailure  -> PipelineRecovery (only on failure)
// onComplete -> PipelineCleanup  (always, success or failure)
// ---------------------------------------------------------------------------

export class DataPipelineHandlers {
  @OnWorkflowStep("DataPipeline", "ExtractData")
  async extractData(ctx: HandlerCtx) {
    const { source } = ctx.payload as { source: string };
    await delay(1000);
    console.log(`  [Extract] (${ctx.requestId}) Pulling data from ${source}`);
  }

  @OnWorkflowStep("DataPipeline", "TransformData")
  async transformData(ctx: HandlerCtx) {
    const { source, shouldFail } = ctx.payload as {
      source: string;
      shouldFail?: boolean;
    };
    await delay(1000);
    if (shouldFail) {
      throw new Error(`Transform failed for ${source}`);
    }
    console.log(`  [Transform] (${ctx.requestId}) Data transformed successfully`);
  }

  @OnWorkflowStep("DataPipeline", "LoadData")
  async loadData(ctx: HandlerCtx) {
    const { destination } = ctx.payload as { destination: string };
    await delay(1000);
    console.log(`  [Load] (${ctx.requestId}) Data loaded into ${destination}`);
  }

  // Chained workflow: runs only when DataPipeline succeeds
  @OnWorkflowStep("PipelineNotify", "SendReport")
  async sendReport(ctx: HandlerCtx) {
    const { source } = ctx.payload as { source: string };
    await delay(1000);
    console.log(`  [Report] (${ctx.requestId}) Pipeline report sent for ${source}`);
  }

  // Chained workflow: runs only when DataPipeline fails
  @OnWorkflowStep("PipelineRecovery", "LogFailure")
  async logFailure(ctx: HandlerCtx) {
    const { source } = ctx.payload as { source: string };
    await delay(1000);
    console.log(`  [Recovery] (${ctx.requestId}) Logged pipeline failure for ${source}`);
  }

  @OnWorkflowStep("PipelineRecovery", "AlertOps")
  async alertOps(ctx: HandlerCtx) {
    const { source } = ctx.payload as { source: string };
    await delay(1000);
    console.log(`  [Alert] (${ctx.requestId}) Ops team alerted about ${source} failure`);
  }

  // Chained workflow: always runs (success or failure)
  @OnWorkflowStep("PipelineCleanup", "ReleaseLocks")
  async releaseLocks(ctx: HandlerCtx) {
    const { source } = ctx.payload as { source: string };
    await delay(1000);
    console.log(`  [Cleanup] (${ctx.requestId}) Released locks for ${source}`);
  }
}
