import { ReviewPolicyGuard } from "./review-policy.guard";
import { ProtectedReviewsService } from "./protected-reviews.service";
import { ProtectedReviewsRepository } from "./protected-reviews.repository";
import { PrismaProtectedReviewsRepository } from "./prisma-protected-reviews.repository";
import { ReviewPublisher } from "./review-publisher";
import { ClientReputationController } from "./client-reputation.controller";
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
    ProtectedReviewsService,
    ReviewPublisher,
    ReviewPolicyGuard,
    {
      provide: ProtectedReviewsRepository,
      useClass: PrismaProtectedReviewsRepository,
    },
    RequestsRateGuard,
    PublicReviewsRateGuard,
    { provide: ReviewsRepository, useClass: PrismaReviewsRepository },
  ],
  controllers: [ReviewsController, ClientReputationController],
})
export class ReviewsModule {}
