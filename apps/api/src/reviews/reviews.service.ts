import { Inject, Injectable } from "@nestjs/common";
import type { PublishedReview } from "@omini/shared";
import { ApiError } from "../api-error";
import {
  ReviewsRepository,
  type ReviewRequest,
  type ReviewRow,
  type ReviewsTx,
} from "./reviews.repository";
import type { z } from "zod";
import type { createReviewSchema } from "./validation";
const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
const denied = () =>
  new ApiError(
    404,
    "REVIEW_NOT_ALLOWED",
    "Avaliação indisponível para esta solicitação.",
  );
export function published(row: ReviewRow): PublishedReview {
  return {
    id: row.id,
    rating: row.rating as PublishedReview["rating"],
    comment: row.comment,
    createdAt: row.createdAt.toISOString(),
    authorLabel: "Cliente Omini",
  };
}
function eligible(row: ReviewRequest, id: string, clientActive: boolean) {
  return (
    same(row.clientUserId, id) &&
    clientActive &&
    !same(row.clientUserId, row.providerUserId) &&
    row.status === "COMPLETED" &&
    !!row.completedAt &&
    row.validCompletion
  );
}
@Injectable()
export class ReviewsService {
  constructor(
    @Inject(ReviewsRepository) private readonly repository: ReviewsRepository,
  ) {}
  private async run<T>(operation: () => Promise<T>): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      try {
        return await operation();
      } catch (error) {
        if (error instanceof ApiError) throw error;
        const code =
          error && typeof error === "object" && "code" in error
            ? error.code
            : null;
        if (["P2034", "P2002"].includes(String(code)) && attempt < 2) continue;
        if (["P2034", "P2002"].includes(String(code)))
          throw new ApiError(
            409,
            "CONCURRENT_UPDATE",
            "Atualize a avaliação antes de tentar novamente.",
          );
        throw new ApiError(
          503,
          "REVIEWS_UNAVAILABLE",
          "Avaliações temporariamente indisponíveis.",
        );
      }
    }
  }
  private async participant(tx: ReviewsTx, id: string, requestId: string) {
    const row = await tx.request(requestId);
    if (!row || (!same(row.clientUserId, id) && !same(row.providerUserId, id)))
      throw denied();
    return row;
  }
  request(id: string, requestId: string) {
    return this.run(() =>
      this.repository.transaction(async (tx) => {
        const row = await this.participant(tx, id, requestId),
          review = await tx.existing(requestId);
        return {
          canReview: !review && eligible(row, id, await tx.clientActive(id)),
          review: review ? published(review) : null,
        };
      }),
    );
  }
  create(
    id: string,
    requestId: string,
    input: z.infer<typeof createReviewSchema>,
  ) {
    return this.run(() =>
      this.repository.transaction(async (tx) => {
        const row = await this.participant(tx, id, requestId);
        if (!eligible(row, id, await tx.clientActive(id))) throw denied();
        const previous = await tx.existing(requestId);
        if (previous) {
          if (
            previous.rating !== input.rating ||
            previous.comment !== input.comment
          )
            throw new ApiError(
              409,
              "REVIEW_IMMUTABLE",
              "Esta avaliação já foi publicada e não pode ser alterada.",
            );
          return published(previous);
        }
        return published(
          await tx.insert({
            requestId: row.id,
            clientUserId: row.clientUserId,
            providerUserId: row.providerUserId,
            providerId: row.providerId,
            rating: input.rating,
            comment: input.comment,
          }),
        );
      }),
    );
  }
  page(
    providerId: string | null,
    ownerId: string | null,
    page: number,
    pageSize: number,
  ) {
    return this.run(async () => {
      const result = await this.repository.page(
        providerId,
        ownerId,
        page,
        pageSize,
      );
      if (!result) throw new ApiError(404, "NOT_FOUND", "Perfil indisponível.");
      return result;
    });
  }
}
