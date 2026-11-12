import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { PersistenceModule } from "../persistence/persistence.module";
import { RequestsRepository } from "./requests.repository";
import { PrismaRequestsRepository } from "./prisma-requests.repository";
import { RequestsService } from "./requests.service";
import { RequestsController } from "./requests.controller";
import { RequestsRateGuard } from "./requests-rate.guard";
@Module({
  imports: [AuthModule, PersistenceModule],
  controllers: [RequestsController],
  providers: [
    RequestsService,
    RequestsRateGuard,
    { provide: RequestsRepository, useClass: PrismaRequestsRepository },
  ],
})
export class RequestsModule {}
