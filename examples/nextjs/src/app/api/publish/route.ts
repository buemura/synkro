import { orko } from "@/lib/orko";

export async function POST(request: Request) {
  const { eventType, payload } = await request.json();

  const requestId = await orko.publish(eventType, payload);

  return Response.json({ requestId }, { status: 201 });
}
