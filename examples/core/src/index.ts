import "dotenv/config";

import { createDashboardHandler } from "@synkro/ui";
import express, { Request, Response } from "express";

import { db } from "./db";
import { eventManagerSetup } from "./events/event-manager";

const app = express();
const PORT = 3000;

app.use(express.json());

app.get("/products", async (req: Request, res: Response) => {
  const products = db.findAllProducts();
  res.status(200).json(products);
});

app.get("/orders", async (req: Request, res: Response) => {
  const orders = db.findAllOrders();
  res.status(200).json(orders);
});

app.post("/orders", async (req: Request, res: Response) => {
  const { productId, quantity, amount } = req.body;

  const order = db.insertOrder({ productId, quantity, amount: String(amount) });

  const synkro = await eventManagerSetup();
  await synkro.publish("ProcessOrder", {
    orderId: order.id,
    productId,
    quantity,
    amount,
  });

  res.status(201).json(order);
});

app.get("/orders/:orderId", async (req: Request, res: Response) => {
  const orderId = req.params.orderId as string;

  const order = db.findOrderById(orderId);

  if (!order) {
    res.status(404).json({ error: "Order not found" });
    return;
  }

  res.json(order);
});

app.get("/orders/:orderId/payments", async (req: Request, res: Response) => {
  const orderId = req.params.orderId as string;

  const result = db.findPaymentsByOrderId(orderId);

  res.json(result);
});

app.post("/publish", async (req: Request, res: Response) => {
  const { eventType, payload } = req.body;

  const synkro = await eventManagerSetup();
  await synkro.publish(eventType, payload);

  res.status(201).json(null);
});

async function bootstrap() {
  const synkro = await eventManagerSetup();

  app.use("/synkro", createDashboardHandler(synkro, { basePath: "/synkro" }));

  app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
    console.log(`Synkro Dashboard: http://localhost:${PORT}/synkro`);
  });
}

bootstrap();
