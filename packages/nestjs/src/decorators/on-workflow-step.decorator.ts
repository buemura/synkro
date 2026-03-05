import { SetMetadata } from "@nestjs/common";
import { ON_WORKFLOW_STEP_METADATA } from "../synkro.constants.js";

export interface OnWorkflowStepMetadata {
  workflowName: string;
  stepType: string;
}

export function OnWorkflowStep(
  workflowName: string,
  stepType: string,
): MethodDecorator {
  return SetMetadata(ON_WORKFLOW_STEP_METADATA, {
    workflowName,
    stepType,
  } satisfies OnWorkflowStepMetadata);
}
