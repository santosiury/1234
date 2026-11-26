import type {
  CreateReviewInput,
  PublishedReview,
  RequestReview,
  ReviewsPage,
} from "@omini/shared";
import {
  isReviewDistribution,
  REPUTATION_MIN_DISTINCT_AUTHORS,
  PROTECTED_REVIEW_POLICY_HEADER,
  PROTECTED_REVIEW_POLICY,
} from "@omini/shared";
import { MarketplaceHttp } from "../marketplace/api";
import { AuthFailure } from "../auth/api";
import type { SessionManager } from "../auth/session-manager";
function review(v: unknown): v is PublishedReview {
  if (!v || typeof v !== "object") return false;
  const r = v as PublishedReview;
  return (
    typeof r.id === "string" &&
    Number.isInteger(r.rating) &&
    r.rating >= 1 &&
    r.rating <= 5 &&
    (r.comment === null ||
      (typeof r.comment === "string" && r.comment.length <= 1000)) &&
    Number.isFinite(Date.parse(r.createdAt)) &&
    (r.authorLabel === "Cliente Omini" ||
      r.authorLabel === "Prestador Omini") &&
    (r.protected === undefined || typeof r.protected === "boolean")
  );
}
function parse<T>(v: unknown, valid: (v: unknown) => v is T): T {
  if (!valid(v))
    throw new AuthFailure(
      502,
      "INVALID_RESPONSE",
      "Resposta inesperada das avaliações.",
    );
  return v;
}
export function reviewsPage(v: unknown): v is ReviewsPage {
  if (!v || typeof v !== "object") return false;
  const r = v as ReviewsPage;
  return (
    Number.isSafeInteger(r.total) &&
    r.total >= 0 &&
    (r.distribution === undefined ||
      isReviewDistribution(r.distribution, r.total)) &&
    (r.total === 0
      ? r.average === null
      : typeof r.average === "number" && r.average >= 1 && r.average <= 5) &&
    Number.isInteger(r.page) &&
    r.page >= 1 &&
    Number.isInteger(r.pageSize) &&
    r.pageSize >= 1 &&
    r.pageSize <= 20 &&
    Array.isArray(r.items) &&
    r.items.length <= r.pageSize &&
    r.items.every(review) &&
    (r.anonymous === undefined || typeof r.anonymous === "boolean") &&
    (r.privacyProtected === undefined ||
      typeof r.privacyProtected === "boolean") &&
    (!r.anonymous || (r.items.length === 0 && r.distribution !== undefined)) &&
    (!r.anonymous ||
      r.privacyProtected === true ||
      r.total >= REPUTATION_MIN_DISTINCT_AUTHORS) &&
    (!r.privacyProtected ||
      (r.anonymous === true &&
        r.total === 0 &&
        r.average === null &&
        r.items.length === 0))
  );
}
export class ReviewsApi {
  constructor(
    private readonly manager: SessionManager,
    private readonly http = new MarketplaceHttp(),
    private readonly ownerId = manager.state.user?.id,
  ) {}
  private authorized<T>(operation: (token: string) => Promise<T>): Promise<T> {
    return this.manager.request((token) => {
      if (this.manager.state.user?.id !== this.ownerId)
        throw new AuthFailure(
          403,
          "ACCOUNT_CHANGED",
          "A conta mudou. Abra esta tela novamente.",
        );
      return operation(token);
    });
  }
  async page(providerId: string, page = 1, own = false) {
    const path = `${own ? "provider/me/reviews" : `reviews/providers/${encodeURIComponent(providerId)}`}?page=${page}&pageSize=5`;
    return own
      ? this.authorized(async (token) =>
          parse(
            await this.http.request(path, "GET", undefined, token),
            reviewsPage,
          ),
        )
      : parse(await this.http.request(path), reviewsPage);
  }
  clientReputation(requestId?: string) {
    const path = requestId
      ? `reputation/requests/${encodeURIComponent(requestId)}/client`
      : "reputation/me/client";
    return this.authorized(async (token) =>
      parse(
        await this.http.request(path, "GET", undefined, token),
        (value): value is ReviewsPage =>
          reviewsPage(value) && value.anonymous === true,
      ),
    );
  }
  request(id: string) {
    return this.authorized(async (token) =>
      parse(
        await this.http.request(
          `reviews/requests/${encodeURIComponent(id)}`,
          "GET",
          undefined,
          token,
        ),
        (v): v is RequestReview => {
          const r = v as RequestReview | null;
          return (
            !!r &&
            typeof r.canReview === "boolean" &&
            (r.review === null || review(r.review)) &&
            !(r.canReview && r.review) &&
            (r.viewer === undefined ||
              r.viewer === "client" ||
              r.viewer === "provider") &&
            (r.target === undefined ||
              r.target === "client" ||
              r.target === "provider") &&
            (r.protected === undefined || typeof r.protected === "boolean") &&
            (r.closesAt === undefined ||
              r.closesAt === null ||
              Number.isFinite(Date.parse(r.closesAt)))
          );
        },
      ),
    );
  }
  create(id: string, input: CreateReviewInput) {
    return this.authorized(async (token) =>
      parse(
        await this.http.request(
          `reviews/requests/${encodeURIComponent(id)}`,
          "POST",
          input,
          token,
          undefined,
          { [PROTECTED_REVIEW_POLICY_HEADER]: PROTECTED_REVIEW_POLICY },
        ),
        review,
      ),
    );
  }
}
