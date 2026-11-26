import { randomUUID } from "node:crypto";
import type { ContactInput, OwnContact, ReviewsPage } from "@omini/shared";
import { ContactRepository } from "../../src/contact/contact.repository";
import {
  ReviewsRepository,
  type ReviewRow,
  type ReviewsTx,
} from "../../src/reviews/reviews.repository";
import { published } from "../../src/reviews/reviews.service";
import { MemoryAuthRepository } from "./memory-auth.repository";
import { MemoryRequestsRepository } from "./memory-requests.repository";
import { MemoryMarketplaceRepository } from "./memory-marketplace.repository";
export class MemoryContactRepository extends ContactRepository {
  constructor(
    readonly auth: MemoryAuthRepository,
    readonly requests: MemoryRequestsRepository,
  ) {
    super();
  }
  async own(id: string): Promise<OwnContact | null> {
    const credential = [...this.auth.users.values()].find(
      (x) => x.user.id === id && x.active,
    );
    if (!credential) return null;
    const contact = this.auth.contacts.get(id);
    return {
      phone: contact?.phone ?? null,
      hasWhatsapp: contact?.hasWhatsapp ?? false,
      shareContact: contact?.shareContact ?? false,
      contactReady: credential.user.contactReady === true,
    };
  }
  async update(id: string, input: ContactInput) {
    const user = [...this.auth.users.values()].find(
      (x) => x.user.id === id && x.active,
    );
    if (!user) return null;
    this.auth.contacts.set(id, input);
    user.user.contactReady = input.shareContact;
    return this.own(id);
  }
  async request(id: string) {
    const row = this.requests.rows.get(id);
    if (!row) return null;
    const client = await this.own(row.clientUserId),
      provider = [...this.auth.users.values()].find(
        (x) => x.user.id === row.providerUserId,
      );
    return {
      status: row.status,
      providerUserId: row.providerUserId,
      providerActive: !!provider?.active && provider.user.profiles.provider,
      contact: client?.contactReady
        ? { phone: client.phone!, hasWhatsapp: client.hasWhatsapp }
        : null,
    };
  }
}
export class MemoryReviewsRepository extends ReviewsRepository {
  rows = new Map<string, ReviewRow>();
  private tail: Promise<unknown> = Promise.resolve();
  failInsert = false;
  constructor(
    readonly requests: MemoryRequestsRepository,
    readonly auth: MemoryAuthRepository,
    readonly catalog: MemoryMarketplaceRepository,
  ) {
    super();
  }
  transaction<T>(run: (tx: ReviewsTx) => Promise<T>) {
    const task = this.tail.then(async () => {
      const snapshot = structuredClone(this.rows);
      try {
        return await run({
          clientActive: async (id) =>
            [...this.auth.users.values()].some(
              (x) => x.user.id === id && x.active && x.user.profiles.client,
            ),
          request: async (id) => {
            const row = this.requests.rows.get(id);
            return row
              ? {
                  ...structuredClone(row),
                  validCompletion: this.requests.history.some(
                    (e) =>
                      e.requestId === id &&
                      e.action === "confirm-completion" &&
                      e.previousStatus === "AWAITING_CONFIRMATION" &&
                      e.newStatus === "COMPLETED" &&
                      e.actorUserId === row.clientUserId &&
                      e.version === row.version &&
                      e.occurredAt.getTime() === row.completedAt?.getTime(),
                  ),
                }
              : null;
          },
          existing: async (id) => structuredClone(this.rows.get(id) ?? null),
          insert: async (input) => {
            if (this.failInsert) throw Error("Private SQL failure with secret");
            if (this.rows.has(input.requestId))
              throw Object.assign(Error("unique"), { code: "P2002" });
            const row = { ...input, id: randomUUID(), createdAt: new Date() };
            this.rows.set(input.requestId, row);
            const request = this.requests.rows.get(input.requestId)!;
            request.review = { id: row.id };
            request.reviewEligible = false;
            return structuredClone(row);
          },
        });
      } catch (e) {
        this.rows = snapshot;
        throw e;
      }
    });
    this.tail = task.catch(() => undefined);
    return task;
  }
  async page(
    providerId: string | null,
    ownerId: string | null,
    page: number,
    pageSize: number,
  ): Promise<ReviewsPage | null> {
    const entry = [...this.catalog.profiles.entries()].find(([id, p]) =>
      ownerId ? id === ownerId : p.id === providerId,
    );
    if (!entry) return null;
    const [owner, p] = entry,
      user = [...this.auth.users.values()].find(
        (x) => x.user.id === owner && x.active,
      );
    if (
      !p.isActive ||
      !user ||
      (!ownerId &&
        (!p.services.some((s) => s.isActive && s.category.isActive) ||
          !p.areas.some((a) => a.isActive)))
    )
      return null;
    const rows = [...this.rows.values()]
      .filter(
        (r) =>
          r.providerId === p.id &&
          this.requests.rows.get(r.requestId)?.status === "COMPLETED",
      )
      .sort(
        (a, b) =>
          b.createdAt.getTime() - a.createdAt.getTime() ||
          b.id.localeCompare(a.id),
      );
    return {
      total: rows.length,
      average: rows.length
        ? rows.reduce((s, r) => s + r.rating, 0) / rows.length
        : null,
      page,
      pageSize,
      distribution: ([5, 4, 3, 2, 1] as const).map((stars) => ({
        stars,
        count: rows.filter((r) => r.rating === stars).length,
      })),
      items: rows.slice((page - 1) * pageSize, page * pageSize).map(published),
    };
  }
}
