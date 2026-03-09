import { synkro } from "@/lib/synkro";

export async function POST(request: Request) {
  const body = (await request.json()) as {
    service: string;
    version: string;
    shouldFail?: boolean;
  };

  const requestId = await synkro.client.publish("DeployService", body);

  return Response.json({ status: "deploying", requestId });
}
