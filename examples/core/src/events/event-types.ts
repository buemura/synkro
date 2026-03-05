export enum WorkflowTypes {
  ProcessOrder = "ProcessOrder",
  StartShipment = "StartShipment",
  NotifyCustomer = "NotifyCustomer",
}

export enum EventTypes {
  // Order events
  OrderCreated = "OrderCreated",
  OrderCanceled = "OrderCanceled",

  // Stock events
  StockUpdate = "StockUpdate",

  // Payment events
  PaymentRequested = "PaymentRequested",
  PaymentCompleted = "PaymentCompleted",
  PaymentFailed = "PaymentFailed",

  // Shipping events
  ShippingRequested = "ShippingRequested",

  // Notification events
  NotifyCustomer = "NotifyCustomer",
}
