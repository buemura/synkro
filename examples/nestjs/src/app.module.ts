import { Module } from "@nestjs/common";
import { SynkroModule } from "@synkro/nestjs";
import { orderWorkflows } from "./order/order-workflow.config.js";
import { OrderModule } from "./order/order.module.js";

@Module({
  imports: [
    SynkroModule.forRoot({
      transport: "redis",
      connectionUrl: "redis://localhost:6379",
      debug: true,
      workflows: orderWorkflows,
    }),
    OrderModule,
  ],
})
export class AppModule {}
