import { synkro } from "@/lib/synkro";

export async function POST(request: Request) {
  const body = (await request.json()) as { type: string; payload: unknown };

  const requestId = await synkro.client.publish(body.type, body.payload);

  return Response.json({ status: "published", requestId });
}
