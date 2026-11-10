import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { PersistenceModule } from "../persistence/persistence.module";
import { AuthRepository } from "./auth.repository";
import { PrismaAuthRepository } from "./prisma-auth.repository";
import { AuthService } from "./auth.service";
import { AuthController } from "./auth.controller";
import { PasswordService } from "./password.service";
import { AccessGuard } from "./auth.guard";
import { AuthRateGuard } from "./auth-rate.guard";
@Module({
  imports: [PersistenceModule, JwtModule.register({})],
  providers: [
    AuthService,
    PasswordService,
    AccessGuard,
    AuthRateGuard,
    { provide: AuthRepository, useClass: PrismaAuthRepository },
  ],
  controllers: [AuthController],
})
export class AuthModule {}
