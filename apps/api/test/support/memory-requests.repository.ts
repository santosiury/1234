import { randomUUID } from "node:crypto";
import {
  RequestsRepository,
  type RequestRow,
  type EventRow,
  type RequestsTx,
} from "../../src/requests/requests.repository";
import { MemoryAuthRepository } from "./memory-auth.repository";
import { MemoryMarketplaceRepository } from "./memory-marketplace.repository";
const normal = (v: string) =>
  v.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
export class MemoryRequestsRepository extends RequestsRepository {
  rows = new Map<string, RequestRow>();
  history: EventRow[] = [];
  failAppend = false;
  failRead = false;
  private tail: Promise<unknown> = Promise.resolve();
  private clock = Date.now();
  constructor(
    readonly auth: MemoryAuthRepository,
    readonly catalog: MemoryMarketplaceRepository,
  ) {
    super();
  }
  transaction<T>(run: (tx: RequestsTx) => Promise<T>): Promise<T> {
    const operation = this.tail.then(async () => {
      const rows = structuredClone(this.rows),
        events = structuredClone(this.history);
      const tx: RequestsTx = {
        now: async () => new Date(++this.clock),
        actor: async (id) => {
          const row = [...this.auth.users.values()].find(
            (x) => x.user.id === id && x.active,
          );
          return row
            ? {
                id,
                displayName: row.user.displayName,
                client: row.user.profiles.client,
                provider: row.user.profiles.provider,
              }
            : null;
        },
        target: async (input) => {
          const entry = [...this.catalog.profiles.entries()].find(
            ([, p]) => p.id === input.providerId && p.isActive,
          );
          if (!entry) return null;
          const [userId, p] = entry;
          const user = await tx.actor(userId);
          if (!user?.provider) return null;
          const s = p.services.find(
            (s) =>
              s.id === input.providerServiceId &&
              s.isActive &&
              this.catalog.categoryRows.some(
                (c) => c.id === s.categoryId && c.isActive,
              ),
          );
          const area = p.areas.some(
            (a) =>
              a.isActive &&
              normal(a.city) === normal(input.city) &&
              a.state === input.state &&
              (!a.neighborhood ||
                normal(a.neighborhood) === normal(input.neighborhood)),
          );
          return s && area
            ? {
                providerUserId: userId,
                providerName: p.professionalName,
                serviceTitle: s.title,
              }
            : null;
        },
        operation: async (id, key) =>
          structuredClone(
            this.history.find(
              (e) => e.actorUserId === id && e.idempotencyKey === key,
            ) ?? null,
          ),
        byKey: async (id, key) =>
          structuredClone(
            [...this.rows.values()].find(
              (r) => r.clientUserId === id && r.idempotencyKey === key,
            ) ?? null,
          ),
        get: async (id) => {
          if (this.failRead) throw Error("private SQL driver error");
          return structuredClone(this.rows.get(id) ?? null);
        },
        insert: async (data) => {
          const row = { id: randomUUID(), ...data };
          this.rows.set(row.id, structuredClone(row));
          return structuredClone(row);
        },
        append: async (data) => {
          if (this.failAppend) throw Error("private SQL audit error");
          const event = { id: randomUUID(), ...data };
          this.history.push(event);
          return structuredClone(event);
        },
        patch: async (id, status, version, data) => {
          const row = this.rows.get(id);
          if (!row || row.status !== status || row.version !== version)
            return 0;
          Object.assign(row, data);
          return 1;
        },
        events: async (id, afterVersion = 0) =>
          structuredClone(
            this.history
              .filter((e) => e.requestId === id && e.version > afterVersion)
              .sort((a, b) => a.version - b.version)
              .slice(0, 20),
          ),
        list: async (id, viewer, q) => {
          const all = [...this.rows.values()]
            .filter(
              (r) =>
                (viewer === "client" ? r.clientUserId : r.providerUserId) ===
                  id &&
                (!q.status || r.status === q.status),
            )
            .sort(
              (a, b) =>
                b.createdAt.getTime() - a.createdAt.getTime() ||
                b.id.localeCompare(a.id),
            );
          return {
            items: structuredClone(
              all.slice((q.page - 1) * q.pageSize, q.page * q.pageSize),
            ),
            total: all.length,
          };
        },
      };
      try {
        return await run(tx);
      } catch (e) {
        this.rows = rows;
        this.history = events;
        throw e;
      }
    });
    this.tail = operation.catch(() => undefined);
    return operation;
  }
}
