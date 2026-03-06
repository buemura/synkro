import "reflect-metadata";
import { describe, it, expect, vi } from "vitest";
import { Test } from "@nestjs/testing";
import { Injectable } from "@nestjs/common";
import type { HandlerCtx } from "@orko/core";

import { OrkoModule } from "./orko.module.js";
import { OrkoService } from "./orko.service.js";
import { OnEvent } from "./decorators/on-event.decorator.js";
import { OnWorkflowStep } from "./decorators/on-workflow-step.decorator.js";

@Injectable()
class TestEventHandler {
  handleFn = vi.fn();

  @OnEvent("TestEvent", { maxRetries: 1 })
  async handle(ctx: HandlerCtx) {
    this.handleFn(ctx);
  }
}

@Injectable()
class TestWorkflowHandler {
  stockFn = vi.fn();
  paymentFn = vi.fn();

  @OnWorkflowStep("TestWorkflow", "StockCheck")
  async handleStockCheck(ctx: HandlerCtx) {
    this.stockFn(ctx);
  }

  @OnWorkflowStep("TestWorkflow", "Payment")
  async handlePayment(ctx: HandlerCtx) {
    this.paymentFn(ctx);
  }
}

describe("OrkoModule", () => {
  describe("forRoot", () => {
    it("should provide OrkoService", async () => {
      const module = await Test.createTestingModule({
        imports: [
          OrkoModule.forRoot({
            transport: "in-memory",
          }),
        ],
      }).compile();

      await module.init();
      const service = module.get(OrkoService);
      expect(service).toBeDefined();
      expect(service).toBeInstanceOf(OrkoService);

      await module.close();
    });

    it("should expose publish method", async () => {
      const module = await Test.createTestingModule({
        imports: [
          OrkoModule.forRoot({
            transport: "in-memory",
          }),
        ],
      }).compile();

      await module.init();
      const service = module.get(OrkoService);
      expect(typeof service.publish).toBe("function");

      await module.close();
    });

    it("should expose on method", async () => {
      const module = await Test.createTestingModule({
        imports: [
          OrkoModule.forRoot({
            transport: "in-memory",
          }),
        ],
      }).compile();

      await module.init();
      const service = module.get(OrkoService);
      expect(typeof service.on).toBe("function");

      await module.close();
    });
  });

  describe("forRootAsync", () => {
    it("should provide OrkoService with async config", async () => {
      const module = await Test.createTestingModule({
        imports: [
          OrkoModule.forRootAsync({
            useFactory: () => ({
              transport: "in-memory" as const,
            }),
          }),
        ],
      }).compile();

      await module.init();
      const service = module.get(OrkoService);
      expect(service).toBeDefined();
      expect(service).toBeInstanceOf(OrkoService);

      await module.close();
    });
  });

  describe("event handler discovery", () => {
    it("should discover and register @OnEvent handlers", async () => {
      const module = await Test.createTestingModule({
        imports: [
          OrkoModule.forRoot({
            transport: "in-memory",
          }),
        ],
        providers: [TestEventHandler],
      }).compile();

      await module.init();
      const service = module.get(OrkoService);

      // Publishing should invoke the discovered handler
      await service.publish("TestEvent", { data: "hello" });

      // Allow microtask queue to flush (in-memory transport uses queueMicrotask)
      await new Promise((resolve) => setTimeout(resolve, 50));

      const handler = module.get(TestEventHandler);
      expect(handler.handleFn).toHaveBeenCalledTimes(1);
      expect(handler.handleFn).toHaveBeenCalledWith(
        expect.objectContaining({
          payload: { data: "hello" },
        }),
      );

      await module.close();
    });
  });

  describe("workflow step handler discovery", () => {
    it("should discover and patch @OnWorkflowStep handlers into workflows", async () => {
      const module = await Test.createTestingModule({
        imports: [
          OrkoModule.forRoot({
            transport: "in-memory",
            workflows: [
              {
                name: "TestWorkflow",
                steps: [
                  { type: "StockCheck" },
                  { type: "Payment" },
                ],
              },
            ],
          }),
        ],
        providers: [TestWorkflowHandler],
      }).compile();

      await module.init();
      const service = module.get(OrkoService);

      await service.publish("TestWorkflow", { orderId: "123" });

      // Allow workflow steps to complete
      await new Promise((resolve) => setTimeout(resolve, 200));

      const handler = module.get(TestWorkflowHandler);
      expect(handler.stockFn).toHaveBeenCalledTimes(1);
      expect(handler.paymentFn).toHaveBeenCalledTimes(1);

      await module.close();
    });
  });

  describe("lifecycle", () => {
    it("should stop orko on module destroy", async () => {
      const module = await Test.createTestingModule({
        imports: [
          OrkoModule.forRoot({
            transport: "in-memory",
          }),
        ],
      }).compile();

      await module.init();
      // Should not throw
      await module.close();
    });
  });
});
