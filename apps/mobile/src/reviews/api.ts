import type {
  CreateReviewInput,
  PublishedReview,
  RequestReview,
  ReviewsPage,
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
    r.authorLabel === "Cliente Omini"
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
    r.items.every(review)
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
            !(r.canReview && r.review)
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
        ),
        review,
      ),
    );
  }
}
