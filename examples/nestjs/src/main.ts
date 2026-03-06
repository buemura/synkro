import "reflect-metadata";

import { NestFactory } from "@nestjs/core";
import { OrkoService } from "@orko/nestjs";
import { createDashboardHandler } from "@orko/ui";

import { AppModule } from "./app.module.js";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const orkoService = app.get(OrkoService);
  const expressApp = app.getHttpAdapter().getInstance();

  let dashboardHandler: ReturnType<typeof createDashboardHandler> | null = null;
  expressApp.use("/orko", (req: any, res: any) => {
    if (!dashboardHandler) {
      dashboardHandler = createDashboardHandler(orkoService.getInstance(), {
        basePath: "/orko",
      });
    }
    dashboardHandler(req, res);
  });

  await app.listen(3000);
  console.log("Server is running on http://localhost:3000");
  console.log("Orko Dashboard: http://localhost:3000/orko");
}

bootstrap();
