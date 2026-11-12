import {
  REQUEST_STATUSES,
  REQUEST_ACTIONS,
  type RequestStatus,
  type RequestAction,
  type CreateRequestInput,
  type RequestQuery,
  type RequestActionInput,
  type RequestPage,
  type ServiceRequestDetail,
  type ServiceRequestSummary,
  type RequestEventView,
  type RequestHistoryPage,
} from "@omini/shared";
import { MarketplaceHttp } from "../marketplace/api";
import { AuthFailure } from "../auth/api";
import type { SessionManager } from "../auth/session-manager";
const http = new MarketplaceHttp(undefined, "requests");
const object = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object";
const uuid = (v: unknown): v is string =>
  typeof v === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    v,
  );
export const isRequestId = uuid;
const status = (v: unknown): v is RequestStatus =>
  REQUEST_STATUSES.some((s) => s === v);
const action = (v: unknown): v is RequestAction =>
  REQUEST_ACTIONS.some((s) => s === v);
const date = (v: unknown) =>
  typeof v === "string" && Number.isFinite(Date.parse(v));
const integer = (v: unknown) => Number.isSafeInteger(v) && Number(v) > 0;
const bounded = (v: unknown, max: number) =>
  typeof v === "string" && v.length <= max;
function summary(v: unknown): v is ServiceRequestSummary {
  if (!object(v)) return false;
  return (
    uuid(v.id) &&
    uuid(v.providerId) &&
    uuid(v.providerServiceId) &&
    status(v.status) &&
    integer(v.version) &&
    (v.viewer === "client" || v.viewer === "provider") &&
    Array.isArray(v.allowedActions) &&
    v.allowedActions.every(action) &&
    bounded(v.clientNameSnapshot, 120) &&
    bounded(v.providerNameSnapshot, 120) &&
    bounded(v.serviceTitleSnapshot, 120) &&
    bounded(v.description, 1000) &&
    bounded(v.city, 100) &&
    bounded(v.state, 2) &&
    bounded(v.neighborhood, 100) &&
    date(v.createdAt) &&
    date(v.updatedAt) &&
    [
      "acceptedAt",
      "startedAt",
      "completionProposedAt",
      "completedAt",
      "cancelledAt",
    ].every((key) => v[key] === null || date(v[key]))
  );
}
function event(v: unknown): v is RequestEventView {
  return (
    object(v) &&
    uuid(v.id) &&
    (v.actor === "client" || v.actor === "provider") &&
    (v.previousStatus === null || status(v.previousStatus)) &&
    status(v.newStatus) &&
    integer(v.version) &&
    date(v.occurredAt) &&
    (v.reason === null || bounded(v.reason, 500))
  );
}
export function isRequestDetail(v: unknown): v is ServiceRequestDetail {
  return (
    summary(v) &&
    "eventTotal" in v &&
    integer(v.eventTotal) &&
    "events" in v &&
    Array.isArray(v.events) &&
    v.events.length <= 20 &&
    v.events.every(event)
  );
}
function historyPage(v: unknown): v is RequestHistoryPage {
  return (
    object(v) &&
    Array.isArray(v.items) &&
    v.items.length <= 20 &&
    v.items.every(event) &&
    integer(v.total) &&
    (v.nextVersion === null || integer(v.nextVersion))
  );
}
function page(v: unknown): v is RequestPage {
  return (
    object(v) &&
    Array.isArray(v.items) &&
    v.items.every(summary) &&
    Number.isSafeInteger(v.total) &&
    Number(v.total) >= 0 &&
    integer(v.page) &&
    integer(v.pageSize) &&
    Number(v.pageSize) <= 20
  );
}
function parse<T>(v: unknown, check: (v: unknown) => v is T): T {
  if (!check(v))
    throw new AuthFailure(
      502,
      "INVALID_RESPONSE",
      "Resposta inesperada das solicitações.",
    );
  return v;
}
export class RequestsApi {
  constructor(
    private readonly manager: SessionManager,
    private readonly ownerId = manager.state.user?.id,
  ) {}
  private call<T>(
    path: string,
    check: (v: unknown) => v is T,
    method = "GET",
    body?: unknown,
  ) {
    return this.manager.request(async (access) => {
      if (this.manager.state.user?.id !== this.ownerId)
        throw new AuthFailure(
          403,
          "ACCOUNT_CHANGED",
          "A conta mudou. Abra a solicitação novamente.",
        );
      return parse(
        await http.request(`requests${path}`, method, body, access),
        check,
      );
    });
  }
  create(input: CreateRequestInput) {
    return this.call("", isRequestDetail, "POST", input);
  }
  byKey(key: string) {
    return this.call(`/by-key/${encodeURIComponent(key)}`, isRequestDetail);
  }
  detail(id: string) {
    return this.call(`/${encodeURIComponent(id)}`, isRequestDetail);
  }
  list(side: "client" | "provider", query: RequestQuery = {}) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query))
      if (value !== undefined) params.set(key, String(value));
    return this.call(
      `/${side === "client" ? "sent" : "received"}?${params}`,
      page,
    );
  }
  history(id: string, afterVersion: number) {
    return this.call(
      `/${encodeURIComponent(id)}/history?afterVersion=${afterVersion}`,
      historyPage,
    );
  }
  act(id: string, action: RequestAction, input: RequestActionInput) {
    return this.call(
      `/${encodeURIComponent(id)}/${action}`,
      isRequestDetail,
      "POST",
      input,
    );
  }
}
