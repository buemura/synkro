import { loadConfig } from "./config";
import { HandlerRegistry } from "./handler-registry";
import { createServer, startServer } from "./server";

async function main(): Promise<void> {
  const config = loadConfig();

  const registry = new HandlerRegistry();
  await registry.registerFromConfig(config);

  const app = createServer();
  startServer(app);
}

main();
