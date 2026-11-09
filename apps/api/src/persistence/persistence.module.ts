import { Module } from "@nestjs/common";
import { PrismaService } from "./prisma.service";
import { DatabaseController } from "./database.controller";
import {
  DATABASE_CLIENT_FACTORY,
  createDatabaseClient,
} from "./prisma.factory";
@Module({
  providers: [
    PrismaService,
    { provide: DATABASE_CLIENT_FACTORY, useValue: createDatabaseClient },
  ],
  controllers: [DatabaseController],
  exports: [PrismaService],
})
export class PersistenceModule {}
