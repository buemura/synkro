import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import { SynkroService } from "@synkro/nestjs";
import { OrderService } from "./order.service.js";
import { OrderWorkflow } from "./order.events.js";

@Controller("orders")
export class OrderController {
  constructor(
    private readonly orderService: OrderService,
    private readonly synkro: SynkroService,
  ) {}

  @Get()
  findAll() {
    return this.orderService.findAll();
  }

  @Get(":id")
  findOne(@Param("id") id: string) {
    return this.orderService.findById(id);
  }

  @Post()
  async create(
    @Body() body: { productId: string; quantity: number; amount: number },
  ) {
    const order = this.orderService.create(body);
    await this.synkro.publish(OrderWorkflow.ProcessOrder, {
      orderId: order.id,
      productId: body.productId,
      quantity: body.quantity,
      amount: body.amount,
    });
    return order;
  }
}
