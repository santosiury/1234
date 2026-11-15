import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { PersistenceModule } from "../persistence/persistence.module";
import { ContactRepository } from "./contact.repository";
import { PrismaContactRepository } from "./prisma-contact.repository";
import { ContactService } from "./contact.service";
import { ContactController } from "./contact.controller";
import { ContactRateGuard } from "./contact-rate.guard";
@Module({
  imports: [AuthModule, PersistenceModule],
  providers: [
    ContactService,
    ContactRateGuard,
    { provide: ContactRepository, useClass: PrismaContactRepository },
  ],
  controllers: [ContactController],
})
export class ContactModule {}
