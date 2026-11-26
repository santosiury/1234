import type { ReviewDirection } from "@omini/shared";
import { ApiError } from "../api-error";
import { parseInput } from "../auth/auth.validation";
import { createReviewSchema } from "./validation";
import type { ReviewRequest } from "./reviews.repository";

export interface ParticipantReviewContext {
  request: ReviewRequest;
  /** These flags must be loaded by the repository, not read from the HTTP body. */
  accountActive: boolean;
  clientProfileActive: boolean;
  providerProfileActive: boolean;
}
export interface PreparedParticipantReview {
  requestId: string;
  direction: ReviewDirection;
  authorUserId: string;
  subjectUserId: string;
  rating: number;
  comment: string | null;
}
const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
const denied = () =>
  new ApiError(
    404,
    "REVIEW_NOT_ALLOWED",
    "Avaliação indisponível para esta solicitação.",
  );

/** Server-only preparation, independent of publication timing; not a new HTTP route. */
export function prepareParticipantReview(
  context: ParticipantReviewContext,
  actorId: string,
  input: unknown,
): PreparedParticipantReview {
  const row = context.request;
  if (
    !context.accountActive ||
    same(row.clientUserId, row.providerUserId) ||
    row.status !== "COMPLETED" ||
    !row.completedAt ||
    !row.validCompletion
  )
    throw denied();
  let direction: ReviewDirection;
  let authorUserId: string, subjectUserId: string;
  if (same(actorId, row.clientUserId) && context.clientProfileActive) {
    direction = "CLIENT_TO_PROVIDER";
    authorUserId = row.clientUserId;
    subjectUserId = row.providerUserId;
  } else if (
    same(actorId, row.providerUserId) &&
    context.providerProfileActive
  ) {
    direction = "PROVIDER_TO_CLIENT";
    authorUserId = row.providerUserId;
    subjectUserId = row.clientUserId;
  } else throw denied();
  const value = parseInput(createReviewSchema, input);
  return {
    requestId: row.id,
    direction,
    authorUserId,
    subjectUserId,
    rating: value.rating,
    comment: value.comment,
  };
}

/** Use after locking the request/window and reading the unique direction slot. */
export function assertParticipantReviewReplay(
  previous: PreparedParticipantReview,
  next: PreparedParticipantReview,
): void {
  if (
    !same(previous.requestId, next.requestId) ||
    previous.direction !== next.direction ||
    !same(previous.authorUserId, next.authorUserId) ||
    !same(previous.subjectUserId, next.subjectUserId) ||
    previous.rating !== next.rating ||
    previous.comment !== next.comment
  )
    throw new ApiError(
      409,
      "REVIEW_IMMUTABLE",
      "Esta avaliação já foi enviada e não pode ser alterada.",
    );
}
