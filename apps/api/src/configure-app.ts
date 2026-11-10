import type { INestApplication } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { HttpErrorFilter } from "./http-error.filter";
export function configureApp(app: INestApplication) {
  app.setGlobalPrefix("api");
  app.enableCors({
    origin: app.get(ConfigService).get<string[]>("CORS_ORIGINS"),
    credentials: false,
  });
  app.useGlobalFilters(new HttpErrorFilter());
  const spec = new DocumentBuilder()
    .setTitle("Omini API")
    .setDescription(
      "Omini foundation · process liveness. Development-only database diagnostics are excluded from the public specification. Authentication enabled explicitly; no hiring endpoints.",
    )
    .addBearerAuth()
    .setVersion("0.2.2")
    .build();
  SwaggerModule.setup("docs", app, SwaggerModule.createDocument(app, spec));
}
