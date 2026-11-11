import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { PersistenceModule } from "../persistence/persistence.module";
import {
  CatalogController,
  ProviderController,
} from "./marketplace.controller";
import { MarketplaceService } from "./marketplace.service";
import { MarketplaceRepository } from "./marketplace.repository";
import { PrismaMarketplaceRepository } from "./prisma-marketplace.repository";
import { CatalogRateGuard } from "./catalog-rate.guard";
@Module({
  imports: [AuthModule, PersistenceModule],
  controllers: [CatalogController, ProviderController],
  providers: [
    MarketplaceService,
    CatalogRateGuard,
    { provide: MarketplaceRepository, useClass: PrismaMarketplaceRepository },
  ],
})
export class MarketplaceModule {}
