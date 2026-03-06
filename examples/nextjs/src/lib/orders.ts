export type Order = {
  id: string;
  productId: string;
  quantity: number;
  amount: number;
  status: string;
  createdAt: string;
};

const orders = new Map<string, Order>();

export function saveOrder(order: Order) {
  orders.set(order.id, order);
}

export function getOrder(id: string): Order | undefined {
  return orders.get(id);
}

export function updateOrderStatus(id: string, status: string) {
  const order = orders.get(id);
  if (order) {
    order.status = status;
  }
}
