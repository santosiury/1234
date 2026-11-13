import { Inject, Injectable } from "@nestjs/common";
import { createHash } from "node:crypto";
import {
  allowedRequestActions,
  REQUEST_TRANSITIONS,
  type CreateRequestInput,
  type RequestAction,
  type RequestActionInput,
  type RequestParticipant,
  type RequestStatus,
  type RequestHistoryPage,
  type ServiceRequestDetail,
  type ServiceRequestSummary,
} from "@omini/shared";
import { ApiError } from "../api-error";
import {
  RequestsRepository,
  type RequestActor,
  type RequestRow,
  type RequestsTx,
  type RequestPatch,
} from "./requests.repository";
import type { ParsedRequestQuery } from "./validation";
const equal = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
const missing = () =>
  new ApiError(404, "NOT_FOUND", "Solicitação não encontrada.");
const conflict = () =>
  new ApiError(
    409,
    "CONCURRENT_UPDATE",
    "A solicitação mudou. Atualize antes de tentar novamente.",
  );
const fingerprint = (data: unknown) =>
  createHash("sha256").update(JSON.stringify(data)).digest("hex");
function side(row: RequestRow, id: string): RequestParticipant {
  if (equal(row.clientUserId, id)) return "client";
  if (equal(row.providerUserId, id)) return "provider";
  throw missing();
}
async function actor(tx: RequestsTx, id: string) {
  const value = await tx.actor(id);
  if (!value) throw new ApiError(401, "SESSION_EXPIRED", "Entre novamente.");
  return value;
}
function summary(row: RequestRow, user: RequestActor): ServiceRequestSummary {
  const viewer = side(row, user.id);
  return {
    id: row.id,
    providerId: row.providerId,
    providerServiceId: row.providerServiceId,
    clientNameSnapshot: row.clientNameSnapshot,
    providerNameSnapshot: row.providerNameSnapshot,
    serviceTitleSnapshot: row.serviceTitleSnapshot,
    status: row.status as RequestStatus,
    description: row.description,
    city: row.city,
    state: row.state,
    neighborhood: row.neighborhood,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    acceptedAt: row.acceptedAt?.toISOString() ?? null,
    startedAt: row.startedAt?.toISOString() ?? null,
    completionProposedAt: row.completionProposedAt?.toISOString() ?? null,
    completedAt: row.completedAt?.toISOString() ?? null,
    cancelledAt: row.cancelledAt?.toISOString() ?? null,
    version: row.version,
    viewer,
    allowedActions: user[viewer]
      ? allowedRequestActions(row.status as RequestStatus, viewer)
      : [],
  };
}
async function detail(
  tx: RequestsTx,
  row: RequestRow,
  user: RequestActor,
): Promise<ServiceRequestDetail> {
  const value = summary(row, user);
  return {
    ...value,
    eventTotal: row.version,
    events: await historyEvents(tx, row),
  };
}
async function historyEvents(
  tx: RequestsTx,
  row: RequestRow,
  afterVersion = 0,
) {
  return (await tx.events(row.id, afterVersion)).map((event) => ({
    id: event.id,
    actor: side(row, event.actorUserId),
    previousStatus: event.previousStatus as RequestStatus | null,
    newStatus: event.newStatus as RequestStatus,
    occurredAt: event.occurredAt.toISOString(),
    reason: event.reason,
    version: event.version,
  }));
}
@Injectable()
export class RequestsService {
  constructor(
    @Inject(RequestsRepository) private readonly repository: RequestsRepository,
  ) {}
  private async run<T>(operation: (tx: RequestsTx) => Promise<T>): Promise<T> {
    for (let attempt = 0; ; attempt++)
      try {
        return await this.repository.transaction(operation);
      } catch (error) {
        if (error instanceof ApiError) throw error;
        const code =
          error && typeof error === "object" && "code" in error
            ? error.code
            : null;
        if ((code === "P2034" || code === "P2002") && attempt < 2) continue;
        if (code === "P2034" || code === "P2002") throw conflict();
        throw new ApiError(
          503,
          "REQUESTS_UNAVAILABLE",
          "As solicitações estão temporariamente indisponíveis. Tente novamente.",
        );
      }
  }
  create(userId: string, input: CreateRequestInput) {
    const { idempotencyKey, ...content } = input;
    const hash = fingerprint({ action: "create", ...content });
    return this.run(async (tx) => {
      const user = await actor(tx, userId);
      const old = await tx.operation(userId, idempotencyKey);
      if (old) {
        if (old.payloadHash !== hash || old.action !== "create")
          throw new ApiError(
            409,
            "IDEMPOTENCY_CONFLICT",
            "Este identificador já foi utilizado em outro envio.",
          );
        const row = await tx.get(old.requestId);
        if (!row) throw missing();
        return detail(tx, row, user);
      }
      if (!user.client)
        throw new ApiError(
          403,
          "CLIENT_REQUIRED",
          "Ative seu perfil cliente para solicitar um serviço.",
        );
      const target = await tx.target(input);
      if (!target)
        throw new ApiError(
          400,
          "INVALID_TARGET",
          "O serviço ou a área de atendimento não está disponível. Confira o catálogo e a localização.",
        );
      if (equal(target.providerUserId, userId))
        throw new ApiError(
          400,
          "SELF_REQUEST",
          "Você não pode solicitar seu próprio serviço.",
        );
      const now = await tx.now();
      const row = await tx.insert({
        ...content,
        // Keep legacy payload in the receipt hash, but never collect/store a district for a new request.
        neighborhood: "",
        clientUserId: userId,
        providerUserId: target.providerUserId,
        clientNameSnapshot: user.displayName,
        providerNameSnapshot: target.providerName,
        serviceTitleSnapshot: target.serviceTitle,
        status: "REQUESTED",
        version: 1,
        idempotencyKey,
        createdAt: now,
        updatedAt: now,
        acceptedAt: null,
        startedAt: null,
        completionProposedAt: null,
        completedAt: null,
        cancelledAt: null,
      });
      await tx.append({
        requestId: row.id,
        actorUserId: userId,
        previousStatus: null,
        newStatus: "REQUESTED",
        action: "create",
        occurredAt: now,
        reason: null,
        version: 1,
        idempotencyKey,
        payloadHash: hash,
      });
      return detail(tx, row, user);
    });
  }
  list(userId: string, viewer: RequestParticipant, query: ParsedRequestQuery) {
    return this.run(async (tx) => {
      const user = await actor(tx, userId);
      const result = await tx.list(userId, viewer, query);
      return {
        ...result,
        items: result.items.map((row) => summary(row, user)),
        page: query.page,
        pageSize: query.pageSize,
      };
    });
  }
  get(userId: string, id: string) {
    return this.run(async (tx) => {
      const user = await actor(tx, userId);
      const row = await tx.get(id);
      if (!row) throw missing();
      return detail(tx, row, user);
    });
  }
  history(
    userId: string,
    id: string,
    afterVersion: number,
  ): Promise<RequestHistoryPage> {
    return this.run(async (tx) => {
      const user = await actor(tx, userId);
      const row = await tx.get(id);
      if (!row) throw missing();
      side(row, user.id);
      const items = await historyEvents(tx, row, afterVersion);
      const last = items.at(-1)?.version ?? afterVersion;
      return {
        items,
        total: row.version,
        nextVersion: last < row.version ? last : null,
      };
    });
  }
  byKey(userId: string, key: string) {
    return this.run(async (tx) => {
      const user = await actor(tx, userId);
      const row = await tx.byKey(userId, key);
      if (!row) throw missing();
      return detail(tx, row, user);
    });
  }
  act(
    userId: string,
    id: string,
    action: RequestAction,
    input: RequestActionInput,
  ) {
    const hash = fingerprint({
      id,
      action,
      version: input.version,
      reason: input.reason ?? null,
    });
    return this.run(async (tx) => {
      const user = await actor(tx, userId);
      const row = await tx.get(id);
      if (!row) throw missing();
      const viewer = side(row, userId);
      const old = await tx.operation(userId, input.idempotencyKey);
      if (old) {
        if (
          old.payloadHash !== hash ||
          !equal(old.requestId, id) ||
          old.action !== action
        )
          throw new ApiError(
            409,
            "IDEMPOTENCY_CONFLICT",
            "Este identificador já foi utilizado em outra ação.",
          );
        return detail(tx, row, user);
      }
      const rule = REQUEST_TRANSITIONS[action];
      if (viewer !== rule.actor || !user[viewer])
        throw new ApiError(
          403,
          "ACTION_FORBIDDEN",
          "Esta ação não está disponível para sua conta.",
        );
      if (input.version !== row.version) throw conflict();
      if (!rule.from.includes(row.status as RequestStatus))
        throw new ApiError(
          409,
          "INVALID_TRANSITION",
          "Esta ação não está disponível no estado atual.",
        );
      if (
        action === "reopen" &&
        (!input.reason || input.reason.trim().length < 10)
      )
        throw new ApiError(
          400,
          "VALIDATION_ERROR",
          "Explique o que ainda precisa ser finalizado, em pelo menos 10 caracteres.",
          ["reason"],
        );
      const now = await tx.now();
      const patch: RequestPatch = {
        status: rule.to,
        version: row.version + 1,
        updatedAt: now,
      };
      if (action === "accept") patch.acceptedAt = now;
      if (action === "start") patch.startedAt = now;
      if (action === "propose-completion") patch.completionProposedAt = now;
      if (action === "reopen") patch.completionProposedAt = null;
      if (action === "confirm-completion") patch.completedAt = now;
      if (action === "cancel") patch.cancelledAt = now;
      if (
        (await tx.patch(
          id,
          row.status as RequestStatus,
          row.version,
          patch,
        )) !== 1
      )
        throw conflict();
      await tx.append({
        requestId: id,
        actorUserId: userId,
        previousStatus: row.status,
        newStatus: rule.to,
        action,
        occurredAt: now,
        reason: input.reason ?? null,
        version: patch.version,
        idempotencyKey: input.idempotencyKey,
        payloadHash: hash,
      });
      return detail(tx, { ...row, ...patch }, user);
    });
  }
}
