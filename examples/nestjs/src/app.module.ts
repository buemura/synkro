import { Module } from "@nestjs/common";
import { OrkoModule } from "@orko/nestjs";
import { orderWorkflows } from "./order/order-workflow.config.js";
import { OrderModule } from "./order/order.module.js";

@Module({
  imports: [
    OrkoModule.forRoot({
      transport: "redis",
      connectionUrl: "redis://localhost:6379",
      debug: true,
      workflows: orderWorkflows,
    }),
    OrderModule,
  ],
})
export class AppModule {}
