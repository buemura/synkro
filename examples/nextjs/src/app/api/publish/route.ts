import { synkro } from "@/lib/synkro";

export async function POST(request: Request) {
  const { eventType, payload } = await request.json();

  const requestId = await synkro.publish(eventType, payload);

  return Response.json({ requestId }, { status: 201 });
}
