import type { ServiceRequest, ServiceReview } from "@prisma/client";
import type { ReviewsPage } from "@omini/shared";
export type ReviewRow = ServiceReview;
export type ReviewRequest = ServiceRequest & { validCompletion: boolean };
export interface ReviewsTx {
  clientActive(id: string): Promise<boolean>;
  request(id: string): Promise<ReviewRequest | null>;
  existing(requestId: string): Promise<ReviewRow | null>;
  insert(input: Omit<ReviewRow, "id" | "createdAt">): Promise<ReviewRow>;
}
export abstract class ReviewsRepository {
  abstract transaction<T>(run: (tx: ReviewsTx) => Promise<T>): Promise<T>;
  abstract page(
    providerId: string | null,
    ownerId: string | null,
    page: number,
    pageSize: number,
  ): Promise<ReviewsPage | null>;
}
