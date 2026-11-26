import { Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type {
  PublishedReview,
  RequestReview,
  ReviewDirection,
} from "@omini/shared";
import { ApiError } from "../api-error";
import {
  prepareParticipantReview,
  assertParticipantReviewReplay,
} from "./participant-review";
import {
  ProtectedReviewsRepository,
  type ProtectedReviewRow,
} from "./protected-reviews.repository";

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
const denied = () =>
  new ApiError(
    404,
    "REVIEW_NOT_ALLOWED",
    "Avaliação indisponível para esta solicitação.",
  );
function receipt(row: ProtectedReviewRow): PublishedReview {
  // No early publication status, peer receipt, batch ID or request ID is returned.
  return {
    id: row.id,
    rating: row.rating as PublishedReview["rating"],
    comment: row.comment,
    createdAt: row.submittedAt.toISOString(),
    authorLabel:
      row.direction === "CLIENT_TO_PROVIDER"
        ? "Cliente Omini"
        : "Prestador Omini",
    protected: !row.isLegacy,
  };
}
@Injectable()
export class ProtectedReviewsService {
  constructor(
    @Inject(ProtectedReviewsRepository)
    private readonly repository: ProtectedReviewsRepository,
    @Inject(ConfigService) private readonly config: ConfigService,
  ) {}
  get enabled() {
    return this.config.get<boolean>("REVIEWS_V2_ENABLED") === true;
  }
  private requireEnabled() {
    if (!this.enabled) throw denied();
  }
  private async run<T>(operation: () => Promise<T>): Promise<T> {
    this.requireEnabled();
    for (let attempt = 0; ; attempt++) {
      try {
        return await operation();
      } catch (e) {
        if (e instanceof ApiError) throw e;
        const code = e && typeof e === "object" && "code" in e ? e.code : null;
        if ((code === "P2034" || code === "P2002") && attempt < 2) continue;
        if (code === "P2034" || code === "P2002")
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
  request(actor: string, requestId: string): Promise<RequestReview> {
    return this.run(() =>
      this.repository.transaction(async (tx) => {
        const ctx = await tx.context(requestId, actor);
        if (
          !ctx ||
          !ctx.accountActive ||
          (!same(actor, ctx.request.clientUserId) &&
            !same(actor, ctx.request.providerUserId)) ||
          same(ctx.request.clientUserId, ctx.request.providerUserId)
        )
          throw denied();
        const viewer = same(actor, ctx.request.clientUserId)
          ? "client"
          : "provider";
        const direction: ReviewDirection =
          viewer === "client" ? "CLIENT_TO_PROVIDER" : "PROVIDER_TO_CLIENT";
        const window = await tx.window(requestId),
          now = await tx.now();
        if (window) await tx.releaseIfReady(requestId, now);
        const own = await tx.own(requestId, direction);
        if (
          own &&
          (!same(own.authorUserId, actor) ||
            !same(
              own.subjectUserId,
              viewer === "client"
                ? ctx.request.providerUserId
                : ctx.request.clientUserId,
            ))
        )
          throw denied();

        let eligible = false;
        try {
          prepareParticipantReview(ctx, actor, { rating: 1 });
          eligible = true;
        } catch {
          /* No eligibility details disclosed. */
        }
        return {
          canReview: eligible && !own && !!window && now < window.closesAt,
          review: own ? receipt(own) : null,
          viewer,
          target: viewer === "client" ? "provider" : "client",
          closesAt: window?.closesAt.toISOString() ?? null,
          protected: !!window,
        };
      }),
    );
  }
  async create(
    actor: string,
    requestId: string,
    input: unknown,
  ): Promise<PublishedReview> {
    const result = await this.run(() =>
      this.repository.transaction(async (tx) => {
        const ctx = await tx.context(requestId, actor);
        if (!ctx) throw denied();
        const next = prepareParticipantReview(ctx, actor, input);
        const window = await tx.window(requestId);
        const previous = await tx.own(requestId, next.direction);
        if (previous) {
          assertParticipantReviewReplay(
            { ...previous, direction: previous.direction as ReviewDirection },
            next,
          );
          return { review: receipt(previous) };
        }
        const now = await tx.now();
        if (!window) return { closed: true as const };
        if (now >= window.closesAt) {
          // Commit release of an existing submission; throw the rejection outside the transaction.
          await tx.releaseIfReady(requestId, now);
          return { closed: true as const };
        }
        const row = await tx.insert(next, now);
        await tx.releaseIfReady(requestId, now);
        return { review: receipt(row) };
      }),
    );
    if ("closed" in result)
      throw new ApiError(
        409,
        "REVIEW_WINDOW_CLOSED",
        "O prazo de avaliação desta contratação está encerrado.",
      );
    return result.review;
  }
  providerPage(
    providerId: string | null,
    ownerId: string | null,
    page: number,
    pageSize: number,
  ) {
    return this.run(async () => {
      const result = await this.repository.providerPage(
        providerId,
        ownerId,
        page,
        pageSize,
      );
      if (!result) throw denied();
      return result;
    });
  }
  clientReputation(actor: string, requestId?: string) {
    return this.run(async () => {
      const result = await this.repository.clientReputation(actor, requestId);
      if (!result) throw denied();
      return result;
    });
  }
  async publishDue() {
    if (!this.enabled) return;
    for (const id of await this.run(() => this.repository.dueWindows())) {
      await this.run(() =>
        this.repository.transaction(async (tx) => {
          if (await tx.window(id)) await tx.releaseIfReady(id, await tx.now());
        }),
      );
    }
    for (const subject of await this.run(() =>
      this.repository.pendingSubjects(),
    ))
      await this.run(() =>
        this.repository.transaction((tx) => tx.formBatch(subject)),
      );
  }
}
