export type ExperienceMode = "client" | "provider";
export interface HealthResponse {
  status: "ok";
  timestamp: string;
}
export interface ServiceCategory {
  id: string;
  name: string;
  icon: string;
}
export interface DemoProfessional {
  id: string;
  name: string;
  categoryId: string;
  specialty: string;
  neighborhood: string;
  description: string;
  initials: string;
}

export interface AuthUser {
  id: string;
  displayName: string;
  email: string;
  profiles: { client: boolean; provider: boolean };
}
export interface AuthTokens {
  user: AuthUser;
  accessToken: string;
  refreshToken: string;
  accessExpiresAt: string;
  refreshExpiresAt: string;
}
export interface RegisterInput {
  displayName: string;
  email: string;
  password: string;
  profiles: ExperienceMode[];
}

// Real catalog contracts. DemoProfessional remains exclusive to the explicit demo.
export interface CatalogCategory {
  id: string;
  slug: string;
  name: string;
  isActive: boolean;
}
export interface ProviderServiceRecord {
  id: string;
  categoryId: string;
  title: string;
  description: string | null;
  isActive: boolean;
  category: CatalogCategory;
}
export interface ProviderAreaRecord {
  id: string;
  city: string;
  state: string;
  neighborhood: string; // Empty means the entire city.
  isActive: boolean;
}
export interface ProviderWorkspace {
  id: string;
  professionalName: string;
  bio: string | null;
  isActive: boolean;
  services: ProviderServiceRecord[];
  areas: ProviderAreaRecord[];
}
export interface PublicProvider {
  id: string;
  professionalName: string;
  bio: string | null;
  services: ProviderServiceRecord[];
  areas: ProviderAreaRecord[];
}
export interface CatalogQuery {
  q?: string;
  categoryId?: string;
  city?: string;
  state?: string;
  neighborhood?: string;
  page?: number;
  pageSize?: number;
}
export interface ProviderPage {
  items: PublicProvider[];
  total: number;
  page: number;
  pageSize: number;
}
export interface UpdateProviderInput {
  professionalName?: string;
  bio?: string | null;
}
export interface CreateServiceInput {
  categoryId: string;
  title: string;
  description?: string | null;
  isActive?: boolean;
}
export type UpdateServiceInput = Partial<CreateServiceInput>;
export interface CreateAreaInput {
  city: string;
  state: string;
  neighborhood?: string;
  isActive?: boolean;
}
export type UpdateAreaInput = Partial<CreateAreaInput>;

export const REQUEST_STATUSES = [
  "REQUESTED",
  "ACCEPTED",
  "REJECTED",
  "IN_PROGRESS",
  "AWAITING_CONFIRMATION",
  "COMPLETED",
  "CANCELLED",
] as const;
export type RequestStatus = (typeof REQUEST_STATUSES)[number];
export const REQUEST_ACTIONS = [
  "accept",
  "reject",
  "start",
  "propose-completion",
  "confirm-completion",
  "reopen",
  "cancel",
] as const;
export type RequestAction = (typeof REQUEST_ACTIONS)[number];
export type RequestParticipant = "client" | "provider";
export const FINAL_REQUEST_STATUSES: readonly RequestStatus[] = [
  "COMPLETED",
  "REJECTED",
  "CANCELLED",
];
export const REQUEST_STATUS_LABELS: Record<RequestStatus, string> = {
  REQUESTED: "Solicitação enviada",
  ACCEPTED: "Aceita",
  REJECTED: "Recusada",
  IN_PROGRESS: "Em andamento",
  AWAITING_CONFIRMATION: "Aguardando confirmação",
  COMPLETED: "Concluída",
  CANCELLED: "Cancelada",
};
export const REQUEST_TRANSITIONS: Record<
  RequestAction,
  {
    from: readonly RequestStatus[];
    to: RequestStatus;
    actor: RequestParticipant;
  }
> = {
  accept: { from: ["REQUESTED"], to: "ACCEPTED", actor: "provider" },
  reject: { from: ["REQUESTED"], to: "REJECTED", actor: "provider" },
  start: { from: ["ACCEPTED"], to: "IN_PROGRESS", actor: "provider" },
  "propose-completion": {
    from: ["IN_PROGRESS"],
    to: "AWAITING_CONFIRMATION",
    actor: "provider",
  },
  "confirm-completion": {
    from: ["AWAITING_CONFIRMATION"],
    to: "COMPLETED",
    actor: "client",
  },
  reopen: {
    from: ["AWAITING_CONFIRMATION"],
    to: "IN_PROGRESS",
    actor: "client",
  },
  cancel: { from: ["REQUESTED", "ACCEPTED"], to: "CANCELLED", actor: "client" },
};
export function allowedRequestActions(
  status: RequestStatus,
  viewer: RequestParticipant,
): RequestAction[] {
  return REQUEST_ACTIONS.filter(
    (action) =>
      REQUEST_TRANSITIONS[action].actor === viewer &&
      REQUEST_TRANSITIONS[action].from.includes(status),
  );
}
export interface CreateRequestInput {
  providerId: string;
  providerServiceId: string;
  description: string;
  city: string;
  state: string;
  neighborhood: string;
  idempotencyKey: string;
}
export interface RequestActionInput {
  version: number;
  idempotencyKey: string;
  reason?: string;
}
export interface RequestQuery {
  status?: RequestStatus;
  page?: number;
  pageSize?: number;
}
export interface ServiceRequestSummary {
  id: string;
  providerId: string;
  providerServiceId: string;
  clientNameSnapshot: string;
  providerNameSnapshot: string;
  serviceTitleSnapshot: string;
  status: RequestStatus;
  description: string;
  city: string;
  state: string;
  neighborhood: string;
  createdAt: string;
  updatedAt: string;
  acceptedAt: string | null;
  startedAt: string | null;
  completionProposedAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  version: number;
  viewer: RequestParticipant;
  allowedActions: RequestAction[];
}
export interface RequestEventView {
  id: string;
  actor: RequestParticipant;
  previousStatus: RequestStatus | null;
  newStatus: RequestStatus;
  occurredAt: string;
  reason: string | null;
  version: number;
}
export interface RequestHistoryPage {
  items: RequestEventView[];
  total: number;
  nextVersion: number | null;
}
export interface ServiceRequestDetail extends ServiceRequestSummary {
  eventTotal: number;
  events: RequestEventView[];
}
export interface RequestPage {
  items: ServiceRequestSummary[];
  total: number;
  page: number;
  pageSize: number;
}

/** Conservative input guard for coarse request fields; not a general-purpose PII detector. */
export function hasPrivateRequestData(value: string): boolean {
  return /[\w.+-]+@[\w.-]+\.[a-z]{2,}|(?:\d[\s()./-]*){8,}|https?:\/\/|\b(?:rua|avenida|av\.?|travessa|rodovia|estrada)\s+[^\n]{0,80}\b\d+/iu.test(
    value,
  );
}
