import "reflect-metadata";

import { NestFactory } from "@nestjs/core";
import { SynkroService } from "@synkro/nestjs";
import { createDashboardHandler } from "@synkro/ui";

import { AppModule } from "./app.module.js";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const synkroService = app.get(SynkroService);
  const expressApp = app.getHttpAdapter().getInstance();

  let dashboardHandler: ReturnType<typeof createDashboardHandler> | null = null;
  expressApp.use("/synkro", (req: any, res: any) => {
    if (!dashboardHandler) {
      dashboardHandler = createDashboardHandler(synkroService.getInstance(), {
        basePath: "/synkro",
      });
    }
    dashboardHandler(req, res);
  });

  await app.listen(8080);
  console.log("Server is running on http://localhost:3000");
  console.log("Synkro Dashboard: http://localhost:3000/synkro");
}

bootstrap();
