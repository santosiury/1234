import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { ConfigService } from "@nestjs/config";
import { AppModule } from "./app.module";
import { configureApp } from "./configure-app";
async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  configureApp(app);
  app.enableShutdownHooks();
  await app.listen(app.get(ConfigService).get<number>("PORT")!, "0.0.0.0");
}
bootstrap().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
