import { synkro } from "@/lib/synkro";

export async function POST(request: Request) {
  const body = (await request.json()) as { orderId: string; items: string[] };

  const requestId = await synkro.client.publish("OrderProcessing", body);

  return Response.json({ status: "processing", requestId });
}
