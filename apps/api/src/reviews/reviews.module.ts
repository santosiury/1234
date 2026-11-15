import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { PersistenceModule } from "../persistence/persistence.module";
import { RequestsRateGuard } from "../requests/requests-rate.guard";
import { ReviewsRepository } from "./reviews.repository";
import { PrismaReviewsRepository } from "./prisma-reviews.repository";
import { ReviewsService } from "./reviews.service";
import { ReviewsController } from "./reviews.controller";
import { PublicReviewsRateGuard } from "./reviews-rate.guard";
@Module({
  imports: [AuthModule, PersistenceModule],
  providers: [
    ReviewsService,
    RequestsRateGuard,
    PublicReviewsRateGuard,
    { provide: ReviewsRepository, useClass: PrismaReviewsRepository },
  ],
  controllers: [ReviewsController],
})
export class ReviewsModule {}
