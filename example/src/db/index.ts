import { randomUUID } from "crypto";

export interface Product {
  id: string;
  name: string;
  price: string;
  stock: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface Order {
  id: string;
  productId: string;
  quantity: number;
  amount: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Payment {
  id: string;
  orderId: string;
  amount: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Shipping {
  id: string;
  orderId: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

class InMemoryStore {
  products: Product[] = [];
  orders: Order[] = [];
  payments: Payment[] = [];
  shippings: Shipping[] = [];

  constructor() {
    this.seed();
  }

  private seed() {
    const now = new Date();
    this.products = [
      {
        id: randomUUID(),
        name: "Wireless Mouse",
        price: "29.99",
        stock: 150,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: randomUUID(),
        name: "Mechanical Keyboard",
        price: "89.99",
        stock: 75,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: randomUUID(),
        name: "USB-C Hub",
        price: "49.99",
        stock: 200,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: randomUUID(),
        name: "Monitor Stand",
        price: "39.99",
        stock: 100,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: randomUUID(),
        name: "Webcam HD",
        price: "59.99",
        stock: 50,
        createdAt: now,
        updatedAt: now,
      },
    ];
  }

  insertOrder(data: {
    productId: string;
    quantity: number;
    amount: string;
  }): Order {
    const now = new Date();
    const order: Order = {
      id: randomUUID(),
      productId: data.productId,
      quantity: data.quantity,
      amount: data.amount,
      status: "pending",
      createdAt: now,
      updatedAt: now,
    };
    this.orders.push(order);
    return order;
  }

  findAllOrders(): Order[] {
    return this.orders;
  }

  findOrderById(orderId: string): Order | undefined {
    return this.orders.find((o) => o.id === orderId);
  }

  updateOrderStatus(orderId: string, status: string) {
    const order = this.orders.find((o) => o.id === orderId);
    if (order) {
      order.status = status;
      order.updatedAt = new Date();
    }
  }

  insertPayment(data: {
    orderId: string;
    amount: string;
    status: string;
  }): Payment {
    const now = new Date();
    const payment: Payment = {
      id: randomUUID(),
      orderId: data.orderId,
      amount: data.amount,
      status: data.status,
      createdAt: now,
      updatedAt: now,
    };
    this.payments.push(payment);
    return payment;
  }

  findPaymentsByOrderId(orderId: string): Payment[] {
    return this.payments.filter((p) => p.orderId === orderId);
  }

  updatePaymentStatusByOrderId(orderId: string, status: string) {
    for (const payment of this.payments) {
      if (payment.orderId === orderId) {
        payment.status = status;
        payment.updatedAt = new Date();
      }
    }
  }

  updateProductStock(productId: string, quantityToSubtract: number) {
    const product = this.products.find((p) => p.id === productId);
    if (product) {
      product.stock -= quantityToSubtract;
      product.updatedAt = new Date();
    }
  }

  insertShipping(data: { orderId: string; status: string }): Shipping {
    const now = new Date();
    const shipping: Shipping = {
      id: randomUUID(),
      orderId: data.orderId,
      status: data.status,
      createdAt: now,
      updatedAt: now,
    };
    this.shippings.push(shipping);
    return shipping;
  }

  findShippingByOrderId(orderId: string): Shipping[] {
    return this.shippings.filter((s) => s.orderId === orderId);
  }

  updateShippingStatusByOrderId(orderId: string, status: string) {
    for (const shipping of this.shippings) {
      if (shipping.orderId === orderId) {
        shipping.status = status;
        shipping.updatedAt = new Date();
      }
    }
  }
}

export const db = new InMemoryStore();
