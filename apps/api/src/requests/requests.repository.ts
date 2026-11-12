import type { ServiceRequest, ServiceRequestEvent } from "@prisma/client";
import type {
  CreateRequestInput,
  RequestParticipant,
  RequestStatus,
} from "@omini/shared";
import type { ParsedRequestQuery } from "./validation";
export type RequestRow = ServiceRequest;
export type EventRow = ServiceRequestEvent;
export interface RequestActor {
  id: string;
  displayName: string;
  client: boolean;
  provider: boolean;
}
export interface RequestTarget {
  providerUserId: string;
  providerName: string;
  serviceTitle: string;
}
export type NewRequest = Omit<RequestRow, "id">;
export type NewEvent = Omit<EventRow, "id">;
export type RequestPatch = Pick<
  RequestRow,
  "status" | "version" | "updatedAt"
> &
  Partial<
    Pick<
      RequestRow,
      | "acceptedAt"
      | "startedAt"
      | "completionProposedAt"
      | "completedAt"
      | "cancelledAt"
    >
  >;
export interface RequestsTx {
  now(): Promise<Date>;
  actor(id: string): Promise<RequestActor | null>;
  target(input: CreateRequestInput): Promise<RequestTarget | null>;
  operation(actorId: string, key: string): Promise<EventRow | null>;
  byKey(actorId: string, key: string): Promise<RequestRow | null>;
  get(id: string): Promise<RequestRow | null>;
  insert(input: NewRequest): Promise<RequestRow>;
  append(input: NewEvent): Promise<EventRow>;
  patch(
    id: string,
    previous: RequestStatus,
    version: number,
    input: RequestPatch,
  ): Promise<number>;
  events(id: string, afterVersion?: number): Promise<EventRow[]>;
  list(
    userId: string,
    side: RequestParticipant,
    query: ParsedRequestQuery,
  ): Promise<{ items: RequestRow[]; total: number }>;
}
export abstract class RequestsRepository {
  abstract transaction<T>(run: (tx: RequestsTx) => Promise<T>): Promise<T>;
}
