import type { ReviewDirection, ReviewsPage } from "@omini/shared";
import type { ParticipantReview, ReviewWindow } from "@prisma/client";
import type {
  ParticipantReviewContext,
  PreparedParticipantReview,
} from "./participant-review";
export type ProtectedReviewRow = ParticipantReview;
export interface ReviewSubject {
  subjectUserId: string;
  direction: ReviewDirection;
}
export interface ProtectedReviewsTx {
  now(): Promise<Date>;
  context(
    requestId: string,
    actorId: string,
  ): Promise<ParticipantReviewContext | null>;
  window(requestId: string): Promise<ReviewWindow | null>;
  own(
    requestId: string,
    direction: ReviewDirection,
  ): Promise<ProtectedReviewRow | null>;
  insert(
    input: PreparedParticipantReview,
    submittedAt: Date,
  ): Promise<ProtectedReviewRow>;
  releaseIfReady(requestId: string, now: Date): Promise<void>;
  formBatch(subject: ReviewSubject): Promise<void>;
}
export abstract class ProtectedReviewsRepository {
  abstract transaction<T>(
    run: (tx: ProtectedReviewsTx) => Promise<T>,
  ): Promise<T>;
  abstract providerPage(
    providerId: string | null,
    ownerId: string | null,
    page: number,
    pageSize: number,
  ): Promise<ReviewsPage | null>;
  abstract clientReputation(
    actorId: string,
    requestId?: string,
  ): Promise<ReviewsPage | null>;
  abstract dueWindows(): Promise<string[]>;
  abstract pendingSubjects(): Promise<ReviewSubject[]>;
}
