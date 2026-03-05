import { Module } from "@nestjs/common";
import { OrderController } from "./order.controller.js";
import { OrderService } from "./order.service.js";
import { OrderEventHandler } from "./order-event.handler.js";
import { OrderWorkflowHandler } from "./order-workflow.handler.js";
import { ProductModule } from "../product/product.module.js";

@Module({
  imports: [ProductModule],
  controllers: [OrderController],
  providers: [OrderService, OrderEventHandler, OrderWorkflowHandler],
})
export class OrderModule {}
