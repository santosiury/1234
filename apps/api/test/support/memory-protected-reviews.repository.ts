import { randomUUID } from "node:crypto";
import type { ReviewWindow, ReputationBatch } from "@prisma/client";
import type { ReviewDirection, ReviewsPage } from "@omini/shared";
import {
  ProtectedReviewsRepository,
  type ProtectedReviewsTx,
  type ProtectedReviewRow,
  type ReviewSubject,
} from "../../src/reviews/protected-reviews.repository";
import type { MemoryRequestsRepository } from "./memory-requests.repository";
import type { MemoryAuthRepository } from "./memory-auth.repository";
import type { MemoryMarketplaceRepository } from "./memory-marketplace.repository";
export class MemoryProtectedReviewsRepository extends ProtectedReviewsRepository {
  windows = new Map<string, ReviewWindow>();
  rows: ProtectedReviewRow[] = [];
  batches = new Map<string, ReputationBatch>();
  now = new Date("2026-12-01T12:00:00Z");
  private tail: Promise<unknown> = Promise.resolve();
  constructor(
    readonly requests: MemoryRequestsRepository,
    readonly auth: MemoryAuthRepository,
    readonly catalog: MemoryMarketplaceRepository,
  ) {
    super();
  }
  open(id: string) {
    const completedAt = this.requests.rows.get(id)!.completedAt!;
    this.now = new Date(completedAt.getTime() + 1000);
    this.windows.set(id, {
      requestId: id,
      completedAt,
      closesAt: new Date(completedAt.getTime() + 14 * 86400000),
      releasedAt: null,
    });
  }
  private valid(r: ProtectedReviewRow) {
    const request = this.requests.rows.get(r.requestId);
    if (
      !request ||
      request.status !== "COMPLETED" ||
      !request.completedAt ||
      r.authorUserId === r.subjectUserId ||
      r.rating < 1 ||
      r.rating > 5
    )
      return false;
    const canonical =
      r.direction === "CLIENT_TO_PROVIDER"
        ? r.authorUserId === request.clientUserId &&
          r.subjectUserId === request.providerUserId
        : r.direction === "PROVIDER_TO_CLIENT" &&
          r.authorUserId === request.providerUserId &&
          r.subjectUserId === request.clientUserId;
    return (
      canonical &&
      this.requests.history.some(
        (e) =>
          e.requestId === request.id &&
          e.actorUserId === request.clientUserId &&
          e.action === "confirm-completion" &&
          e.previousStatus === "AWAITING_CONFIRMATION" &&
          e.newStatus === "COMPLETED" &&
          e.version === request.version &&
          e.occurredAt.getTime() === request.completedAt!.getTime(),
      )
    );
  }
  private async batch(subject: ReviewSubject) {
    const rows = this.rows.filter(
      (r) =>
        r.subjectUserId === subject.subjectUserId &&
        r.direction === subject.direction &&
        r.publishedAt &&
        !r.batchId &&
        this.valid(r),
    );
    if (new Set(rows.map((r) => r.authorUserId)).size < 5) return;
    const id = randomUUID();
    this.batches.set(id, {
      id,
      ...subject,
      entryCount: rows.length,
      distinctAuthorCount: new Set(rows.map((r) => r.authorUserId)).size,
      createdAt: new Date(this.now),
    });
    for (const r of rows) r.batchId = id;
  }
  transaction<T>(run: (tx: ProtectedReviewsTx) => Promise<T>) {
    const task = this.tail.then(async () => {
      const snapshot = structuredClone({
        windows: this.windows,
        rows: this.rows,
        batches: this.batches,
      });
      try {
        return await run({
          now: async () => new Date(this.now),
          context: async (id, actor) => {
            const row = this.requests.rows.get(id);
            if (!row) return null;
            const user = [...this.auth.users.values()].find(
              (u) => u.user.id.toLowerCase() === actor.toLowerCase(),
            );
            const evidence = this.requests.history.some(
              (e) =>
                e.requestId === id &&
                e.action === "confirm-completion" &&
                e.actorUserId === row.clientUserId &&
                e.newStatus === "COMPLETED" &&
                e.previousStatus === "AWAITING_CONFIRMATION" &&
                e.version === row.version &&
                e.occurredAt.getTime() === row.completedAt?.getTime(),
            );
            return {
              request: { ...row, validCompletion: evidence },
              accountActive: !!user?.active,
              clientProfileActive: !!user?.user.profiles.client,
              providerProfileActive: !!user?.user.profiles.provider,
            };
          },
          window: async (id) => this.windows.get(id) ?? null,
          own: async (id, direction) =>
            this.rows.find(
              (r) => r.requestId === id && r.direction === direction,
            ) ?? null,
          insert: async (data, submittedAt) => {
            const row = {
              ...data,
              id: randomUUID(),
              submittedAt: new Date(submittedAt),
              publishedAt: null,
              isLegacy: false,
              batchId: null,
            };
            this.rows.push(row);
            return row;
          },
          releaseIfReady: async (id, now) => {
            const w = this.windows.get(id),
              rows = this.rows.filter((r) => r.requestId === id);
            if (!w || w.releasedAt || (rows.length < 2 && now < w.closesAt))
              return;
            w.releasedAt = new Date(now);
            for (const r of rows) r.publishedAt = new Date(now);
            for (const r of rows)
              await this.batch({
                subjectUserId: r.subjectUserId,
                direction: r.direction as ReviewDirection,
              });
          },
          formBatch: (s) => this.batch(s),
        });
      } catch (e) {
        this.windows = snapshot.windows;
        this.rows = snapshot.rows;
        this.batches = snapshot.batches;
        throw e;
      }
    });
    this.tail = task.catch(() => undefined);
    return task;
  }
  private page(subject: ReviewSubject, page = 1, pageSize = 10): ReviewsPage {
    const safe = [...this.batches.values()]
      .filter((b) => {
        if (
          b.subjectUserId !== subject.subjectUserId ||
          b.direction !== subject.direction ||
          b.distinctAuthorCount < 5
        )
          return false;
        const assigned = this.rows.filter((r) => r.batchId === b.id);
        const eligible = assigned.filter(
          (r) =>
            r.publishedAt &&
            this.valid(r) &&
            r.subjectUserId === b.subjectUserId &&
            r.direction === b.direction,
        );
        return (
          assigned.length === b.entryCount &&
          eligible.length === b.entryCount &&
          new Set(assigned.map((r) => r.authorUserId)).size ===
            b.distinctAuthorCount &&
          new Set(eligible.map((r) => r.authorUserId)).size ===
            b.distinctAuthorCount
        );
      })
      .flatMap((b) => this.rows.filter((r) => r.batchId === b.id));
    return {
      total: safe.length,
      average: safe.length
        ? Math.round(
            (safe.reduce((n, r) => n + r.rating, 0) / safe.length) * 10,
          ) / 10
        : null,
      distribution: ([5, 4, 3, 2, 1] as const).map((stars) => ({
        stars,
        count: safe.filter((r) => r.rating === stars).length,
      })),
      page,
      pageSize,
      items: [],
      anonymous: true,
      privacyProtected: safe.length === 0,
    };
  }
  async providerPage(
    providerId: string | null,
    ownerId: string | null,
    page: number,
    pageSize: number,
  ) {
    const match = [...this.catalog.profiles.entries()].find(([id, p]) =>
      ownerId ? id === ownerId : p.id === providerId,
    );
    return match
      ? this.page(
          { subjectUserId: match[0], direction: "CLIENT_TO_PROVIDER" },
          page,
          pageSize,
        )
      : null;
  }
  async clientReputation(actor: string, requestId?: string) {
    let subject = actor;
    const user = [...this.auth.users.values()].find(
      (u) => u.user.id === actor && u.active,
    );
    if (!user) return null;
    if (requestId) {
      const row = this.requests.rows.get(requestId);
      if (
        !row ||
        row.providerUserId !== actor ||
        !user.user.profiles.provider ||
        ![
          "REQUESTED",
          "ACCEPTED",
          "IN_PROGRESS",
          "AWAITING_CONFIRMATION",
        ].includes(row.status) ||
        row.clientUserId === actor
      )
        return null;
      subject = row.clientUserId;
    } else if (!user.user.profiles.client) return null;
    return this.page({
      subjectUserId: subject,
      direction: "PROVIDER_TO_CLIENT",
    });
  }
  async dueWindows() {
    return [...this.windows.values()]
      .filter((w) => !w.releasedAt && w.closesAt <= this.now)
      .map((w) => w.requestId);
  }
  async pendingSubjects() {
    return this.rows
      .filter((r) => r.publishedAt && !r.batchId && this.valid(r))
      .map((r) => ({
        subjectUserId: r.subjectUserId,
        direction: r.direction as ReviewDirection,
      }));
  }
}
