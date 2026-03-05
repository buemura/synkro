export enum OrderWorkflow {
  ProcessOrder = "ProcessOrder",
  StartShipment = "StartShipment",
}

export enum OrderEvent {
  OrderCreated = "OrderCreated",
  StockUpdate = "StockUpdate",
  PaymentRequested = "PaymentRequested",
  PaymentCompleted = "PaymentCompleted",
  PaymentFailed = "PaymentFailed",
  ShippingRequested = "ShippingRequested",
  NotifyCustomer = "NotifyCustomer",
}
