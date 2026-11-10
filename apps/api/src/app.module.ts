import { AuthModule } from "./auth/auth.module";
import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { HealthModule } from "./health/health.module";
import { PersistenceModule } from "./persistence/persistence.module";
import { validateEnvironment } from "./config";
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      ignoreEnvFile: process.env.NODE_ENV === "test",
      validate: validateEnvironment,
    }),
    HealthModule,
    PersistenceModule,
    AuthModule,
  ],
})
export class AppModule {}
