import { Module } from "@nestjs/common";
import { SynkroModule } from "@synkro/nestjs";
import { OrderModule } from "./order/order.module.js";
import { orderWorkflows } from "./order/order-workflow.config.js";

@Module({
  imports: [
    SynkroModule.forRoot({
      transport: "in-memory",
      debug: true,
      workflows: orderWorkflows,
    }),
    OrderModule,
  ],
})
export class AppModule {}
