import { orko } from "@/lib/orko";
import { saveOrder } from "@/lib/orders";

export async function POST(request: Request) {
  const body = await request.json();
  const { productId, quantity, amount } = body;

  const requestId = await orko.publish("ProcessOrder", {
    productId,
    quantity,
    amount,
  });

  saveOrder({
    id: requestId,
    productId,
    quantity,
    amount,
    status: "processing",
    createdAt: new Date().toISOString(),
  });

  return Response.json({ id: requestId, status: "processing" }, { status: 201 });
}
