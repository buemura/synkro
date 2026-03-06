import "reflect-metadata";
import { describe, it, expect } from "vitest";
import { Test } from "@nestjs/testing";
import { Injectable } from "@nestjs/common";
import { DiscoveryModule } from "@nestjs/core";
import type { HandlerCtx } from "@orko/core";

import { OrkoExplorer } from "./orko.explorer.js";
import { OnEvent } from "./decorators/on-event.decorator.js";
import { OnWorkflowStep } from "./decorators/on-workflow-step.decorator.js";

@Injectable()
class TestEventHandler {
  @OnEvent("UserCreated", { maxRetries: 2 })
  async handleUserCreated(ctx: HandlerCtx) {
    return ctx.payload;
  }

  @OnEvent("OrderPlaced")
  async handleOrderPlaced(ctx: HandlerCtx) {
    return ctx.payload;
  }
}

@Injectable()
class TestWorkflowHandler {
  @OnWorkflowStep("ProcessOrder", "ValidateStock")
  async handleValidateStock(ctx: HandlerCtx) {
    return ctx.payload;
  }

  @OnWorkflowStep("ProcessOrder", "ProcessPayment")
  async handleProcessPayment(ctx: HandlerCtx) {
    return ctx.payload;
  }

  @OnWorkflowStep("StartShipment", "Ship")
  async handleShip(ctx: HandlerCtx) {
    return ctx.payload;
  }
}

@Injectable()
class PlainService {
  doSomething() {
    return "no decorators here";
  }
}

describe("OrkoExplorer", () => {
  async function createExplorer(providers: any[]) {
    const module = await Test.createTestingModule({
      imports: [DiscoveryModule],
      providers: [OrkoExplorer, ...providers],
    }).compile();

    await module.init();
    return module.get(OrkoExplorer);
  }

  describe("exploreEventHandlers", () => {
    it("should discover @OnEvent decorated methods", async () => {
      const explorer = await createExplorer([TestEventHandler]);
      const handlers = explorer.exploreEventHandlers();

      expect(handlers).toHaveLength(2);
      expect(handlers).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            eventType: "UserCreated",
            retry: { maxRetries: 2 },
          }),
          expect.objectContaining({
            eventType: "OrderPlaced",
            retry: undefined,
          }),
        ]),
      );
    });

    it("should return bound handler functions", async () => {
      const explorer = await createExplorer([TestEventHandler]);
      const handlers = explorer.exploreEventHandlers();

      for (const handler of handlers) {
        expect(typeof handler.handler).toBe("function");
      }
    });

    it("should return empty array when no handlers are registered", async () => {
      const explorer = await createExplorer([PlainService]);
      const handlers = explorer.exploreEventHandlers();

      expect(handlers).toHaveLength(0);
    });
  });

  describe("exploreWorkflowStepHandlers", () => {
    it("should discover @OnWorkflowStep decorated methods", async () => {
      const explorer = await createExplorer([TestWorkflowHandler]);
      const handlers = explorer.exploreWorkflowStepHandlers();

      expect(handlers).toHaveLength(3);
      expect(handlers).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            workflowName: "ProcessOrder",
            stepType: "ValidateStock",
          }),
          expect.objectContaining({
            workflowName: "ProcessOrder",
            stepType: "ProcessPayment",
          }),
          expect.objectContaining({
            workflowName: "StartShipment",
            stepType: "Ship",
          }),
        ]),
      );
    });

    it("should return bound handler functions", async () => {
      const explorer = await createExplorer([TestWorkflowHandler]);
      const handlers = explorer.exploreWorkflowStepHandlers();

      for (const handler of handlers) {
        expect(typeof handler.handler).toBe("function");
      }
    });

    it("should return empty array when no handlers are registered", async () => {
      const explorer = await createExplorer([PlainService]);
      const handlers = explorer.exploreWorkflowStepHandlers();

      expect(handlers).toHaveLength(0);
    });
  });

  describe("mixed providers", () => {
    it("should discover handlers from multiple providers", async () => {
      const explorer = await createExplorer([
        TestEventHandler,
        TestWorkflowHandler,
        PlainService,
      ]);

      const eventHandlers = explorer.exploreEventHandlers();
      const workflowHandlers = explorer.exploreWorkflowStepHandlers();

      expect(eventHandlers).toHaveLength(2);
      expect(workflowHandlers).toHaveLength(3);
    });
  });
});
