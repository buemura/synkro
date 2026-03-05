import { Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";

export interface Order {
  id: string;
  productId: string;
  quantity: number;
  amount: number;
  status: string;
}

@Injectable()
export class OrderService {
  private orders: Order[] = [];

  create(data: { productId: string; quantity: number; amount: number }): Order {
    const order: Order = { id: randomUUID(), ...data, status: "pending" };
    this.orders.push(order);
    return order;
  }

  findAll(): Order[] {
    return this.orders;
  }

  findById(id: string): Order | undefined {
    return this.orders.find((o) => o.id === id);
  }

  updateStatus(id: string, status: string): void {
    const order = this.orders.find((o) => o.id === id);
    if (order) order.status = status;
  }
}
