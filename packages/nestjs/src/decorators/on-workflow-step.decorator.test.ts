import "reflect-metadata";
import { describe, it, expect } from "vitest";
import { OnWorkflowStep } from "./on-workflow-step.decorator.js";
import { ON_WORKFLOW_STEP_METADATA } from "../orko.constants.js";

describe("@OnWorkflowStep", () => {
  it("should set metadata with workflow name and step type", () => {
    class TestHandler {
      @OnWorkflowStep("ProcessOrder", "ValidateStock")
      handle() {}
    }

    const metadata = Reflect.getMetadata(
      ON_WORKFLOW_STEP_METADATA,
      TestHandler.prototype.handle,
    );
    expect(metadata).toEqual({
      workflowName: "ProcessOrder",
      stepType: "ValidateStock",
    });
  });

  it("should support multiple decorated methods on the same class", () => {
    class TestHandler {
      @OnWorkflowStep("ProcessOrder", "StepA")
      handleA() {}

      @OnWorkflowStep("ProcessOrder", "StepB")
      handleB() {}
    }

    const metadataA = Reflect.getMetadata(
      ON_WORKFLOW_STEP_METADATA,
      TestHandler.prototype.handleA,
    );
    const metadataB = Reflect.getMetadata(
      ON_WORKFLOW_STEP_METADATA,
      TestHandler.prototype.handleB,
    );

    expect(metadataA).toEqual({ workflowName: "ProcessOrder", stepType: "StepA" });
    expect(metadataB).toEqual({ workflowName: "ProcessOrder", stepType: "StepB" });
  });

  it("should support different workflow names", () => {
    class TestHandler {
      @OnWorkflowStep("WorkflowA", "Step1")
      handleA() {}

      @OnWorkflowStep("WorkflowB", "Step1")
      handleB() {}
    }

    const metadataA = Reflect.getMetadata(
      ON_WORKFLOW_STEP_METADATA,
      TestHandler.prototype.handleA,
    );
    const metadataB = Reflect.getMetadata(
      ON_WORKFLOW_STEP_METADATA,
      TestHandler.prototype.handleB,
    );

    expect(metadataA).toEqual({ workflowName: "WorkflowA", stepType: "Step1" });
    expect(metadataB).toEqual({ workflowName: "WorkflowB", stepType: "Step1" });
  });
});
