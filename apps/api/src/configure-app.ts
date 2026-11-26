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
      "Omini · autenticação, catálogo e solicitações reais. Fase 2.6: avaliações bidirecionais protegidas por 14 dias, reputação anônima por coortes completas e consulta do cliente somente por prestadores autorizados. Contratos protegidos exigem REVIEWS_V2_ENABLED; corte de versão apenas em testes autorizados. Diagnósticos internos não integram esta especificação.",
    )
    .addBearerAuth()
    .setVersion("0.2.6")
    .build();
  SwaggerModule.setup("docs", app, SwaggerModule.createDocument(app, spec));
}
