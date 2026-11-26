import { Inject, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import {
  REPUTATION_MIN_DISTINCT_AUTHORS,
  type ReviewDirection,
  type ReviewsPage,
} from "@omini/shared";
import { PrismaService } from "../persistence/prisma.service";
import {
  ProtectedReviewsRepository,
  type ProtectedReviewsTx,
  type ReviewSubject,
} from "./protected-reviews.repository";

const options = {
  isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
  maxWait: 5000,
  timeout: 15000,
};
/** The same canonical, confirmed-completion set is used for batching and reputation. */
export function validParticipantReviews(subject?: ReviewSubject) {
  return Prisma.sql`FROM [dbo].[ParticipantReview] v JOIN [dbo].[ServiceRequest] r ON r.[id]=v.[requestId]
    WHERE 1=1 ${subject ? Prisma.sql`AND v.[subjectUserId]=${subject.subjectUserId} AND v.[direction]=${subject.direction}` : Prisma.empty}
    AND v.[authorUserId]<>v.[subjectUserId] AND v.[rating] BETWEEN 1 AND 5
    AND ((v.[direction]=N'CLIENT_TO_PROVIDER' AND v.[authorUserId]=r.[clientUserId] AND v.[subjectUserId]=r.[providerUserId])
      OR (v.[direction]=N'PROVIDER_TO_CLIENT' AND v.[authorUserId]=r.[providerUserId] AND v.[subjectUserId]=r.[clientUserId]))
    AND r.[status]=N'COMPLETED' AND r.[completedAt] IS NOT NULL
    AND EXISTS (SELECT 1 FROM [dbo].[ServiceRequestEvent] e WHERE e.[requestId]=r.[id] AND e.[actorUserId]=r.[clientUserId]
      AND e.[action]=N'confirm-completion' AND e.[previousStatus]=N'AWAITING_CONFIRMATION' AND e.[newStatus]=N'COMPLETED'
      AND e.[version]=r.[version] AND e.[occurredAt]=r.[completedAt])`;
}
async function formBatch(db: Prisma.TransactionClient, subject: ReviewSubject) {
  // Serialize all cohorts for a subject across different requests; no per-rating release.
  await db.$queryRaw`SELECT [id] FROM [dbo].[User] WITH (UPDLOCK,HOLDLOCK) WHERE [id]=${subject.subjectUserId}`;
  const valid = validParticipantReviews(subject);
  const [counts] = await db.$queryRaw<{ total: number; authors: number }[]>(
    Prisma.sql`SELECT COUNT(*) AS [total], COUNT(DISTINCT v.[authorUserId]) AS [authors] ${valid} AND v.[publishedAt] IS NOT NULL AND v.[batchId] IS NULL`,
  );
  if (counts.authors < REPUTATION_MIN_DISTINCT_AUTHORS) return;
  const batch = await db.reputationBatch.create({
    data: {
      ...subject,
      entryCount: counts.total,
      distinctAuthorCount: counts.authors,
    },
  });
  const assigned =
    await db.$executeRaw(Prisma.sql`UPDATE [dbo].[ParticipantReview] SET [batchId]=${batch.id} WHERE [id] IN
    (SELECT v.[id] ${valid} AND v.[publishedAt] IS NOT NULL AND v.[batchId] IS NULL)`);
  // Any unexpected membership change rolls back the whole transaction, including the batch.
  if (assigned !== counts.total)
    throw new Error("Incomplete reputation cohort assignment");
}
async function aggregate(
  db: Prisma.TransactionClient,
  subject: ReviewSubject,
  page = 1,
  pageSize = 10,
): Promise<ReviewsPage> {
  const valid = validParticipantReviews(subject);
  // Compare ALL assigned members with the immutable publication counters. Never
  // disclose or re-batch the valid remainder of a partially invalidated cohort.
  const [s] = await db.$queryRaw<
    {
      total: number;
      average: Prisma.Decimal | null;
      one: number;
      two: number;
      three: number;
      four: number;
      five: number;
    }[]
  >(Prisma.sql`
    WITH valid AS (SELECT v.[id],v.[rating],v.[authorUserId],v.[batchId] ${valid} AND v.[publishedAt] IS NOT NULL),
    safe AS (
      SELECT b.[id] AS [batchId] FROM [dbo].[ReputationBatch] b
      JOIN [dbo].[ParticipantReview] m ON m.[batchId]=b.[id]
      LEFT JOIN valid eligible ON eligible.[id]=m.[id] AND eligible.[batchId]=b.[id]
      WHERE b.[subjectUserId]=${subject.subjectUserId} AND b.[direction]=${subject.direction}
      GROUP BY b.[id],b.[entryCount],b.[distinctAuthorCount]
      HAVING b.[distinctAuthorCount]>=${REPUTATION_MIN_DISTINCT_AUTHORS}
        AND COUNT(*)=b.[entryCount] AND COUNT(eligible.[id])=b.[entryCount]
        AND COUNT(DISTINCT m.[authorUserId])=b.[distinctAuthorCount]
        AND COUNT(DISTINCT eligible.[authorUserId])=b.[distinctAuthorCount]
    )
    SELECT COUNT(*) AS [total], ROUND(AVG(CAST(v.[rating] AS DECIMAL(10,4))),1) AS [average],
      COALESCE(SUM(CASE WHEN v.[rating]=1 THEN 1 ELSE 0 END),0) AS [one],
      COALESCE(SUM(CASE WHEN v.[rating]=2 THEN 1 ELSE 0 END),0) AS [two],
      COALESCE(SUM(CASE WHEN v.[rating]=3 THEN 1 ELSE 0 END),0) AS [three],
      COALESCE(SUM(CASE WHEN v.[rating]=4 THEN 1 ELSE 0 END),0) AS [four],
      COALESCE(SUM(CASE WHEN v.[rating]=5 THEN 1 ELSE 0 END),0) AS [five]
    FROM valid v JOIN safe b ON b.[batchId]=v.[batchId]`);
  return {
    total: s.total,
    average: s.total ? Number(s.average) : null,
    distribution: [
      { stars: 5, count: s.five },
      { stars: 4, count: s.four },
      { stars: 3, count: s.three },
      { stars: 2, count: s.two },
      { stars: 1, count: s.one },
    ],
    page,
    pageSize,
    items: [],
    privacyProtected: s.total === 0,
    anonymous: true,
  };
}
@Injectable()
export class PrismaProtectedReviewsRepository extends ProtectedReviewsRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {
    super();
  }
  transaction<T>(run: (tx: ProtectedReviewsTx) => Promise<T>) {
    return this.prisma.orm().$transaction(
      async (db) =>
        run({
          now: async () =>
            (
              await db.$queryRaw<
                { now: Date }[]
              >`SELECT SYSUTCDATETIME() AS [now]`
            )[0].now,
          context: async (id, actorId) => {
            const request = await db.serviceRequest.findUnique({
              where: { id },
            });
            if (!request) return null;
            const [actor, evidence] = await Promise.all([
              db.user.findUnique({
                where: { id: actorId },
                select: {
                  isActive: true,
                  clientProfile: { select: { isActive: true } },
                  providerProfile: { select: { isActive: true } },
                },
              }),
              db.serviceRequestEvent.findFirst({
                where: {
                  requestId: id,
                  action: "confirm-completion",
                  newStatus: "COMPLETED",
                  previousStatus: "AWAITING_CONFIRMATION",
                  actorUserId: request.clientUserId,
                  version: request.version,
                  occurredAt: request.completedAt ?? undefined,
                },
                select: { id: true },
              }),
            ]);
            return {
              request: { ...request, validCompletion: !!evidence },
              accountActive: !!actor?.isActive,
              clientProfileActive: !!actor?.clientProfile?.isActive,
              providerProfileActive: !!actor?.providerProfile?.isActive,
            };
          },
          window: async (requestId) => {
            await db.$queryRaw`SELECT [id] FROM [dbo].[ServiceRequest] WITH (UPDLOCK,HOLDLOCK) WHERE [id]=${requestId}`;
            return (
              (
                await db.$queryRaw<
                  import("@prisma/client").ReviewWindow[]
                >`SELECT * FROM [dbo].[ReviewWindow] WITH (UPDLOCK,HOLDLOCK) WHERE [requestId]=${requestId}`
              )[0] ?? null
            );
          },
          own: (requestId, direction) =>
            db.participantReview.findUnique({
              where: { requestId_direction: { requestId, direction } },
            }),
          insert: (data, submittedAt) =>
            db.participantReview.create({ data: { ...data, submittedAt } }),
          releaseIfReady: async (requestId, now) => {
            const window = await db.reviewWindow.findUnique({
              where: { requestId },
            });
            if (!window || window.releasedAt) return;
            const rows = await db.participantReview.findMany({
              where: { requestId, isLegacy: false },
              select: { subjectUserId: true, direction: true },
            });
            if (rows.length < 2 && now < window.closesAt) return;
            await db.reviewWindow.update({
              where: { requestId },
              data: { releasedAt: now },
            });
            await db.participantReview.updateMany({
              where: { requestId, isLegacy: false, publishedAt: null },
              data: { publishedAt: now },
            });
            for (const row of rows.sort((a, b) =>
              a.subjectUserId.localeCompare(b.subjectUserId),
            ))
              await formBatch(db, {
                ...row,
                direction: row.direction as ReviewDirection,
              });
          },
          formBatch: (subject) => formBatch(db, subject),
        }),
      options,
    );
  }
  providerPage(
    providerId: string | null,
    ownerId: string | null,
    page: number,
    pageSize: number,
  ) {
    return this.prisma.orm().$transaction(async (db) => {
      const provider = await db.providerProfile.findFirst({
        where: ownerId
          ? { userId: ownerId, isActive: true, user: { isActive: true } }
          : {
              id: providerId!,
              isActive: true,
              user: { isActive: true },
              services: {
                some: { isActive: true, category: { isActive: true } },
              },
              serviceAreas: { some: { isActive: true } },
            },
        select: { userId: true },
      });
      return provider
        ? aggregate(
            db,
            { subjectUserId: provider.userId, direction: "CLIENT_TO_PROVIDER" },
            page,
            pageSize,
          )
        : null;
    }, options);
  }
  clientReputation(actorId: string, requestId?: string) {
    return this.prisma.orm().$transaction(async (db) => {
      let clientUserId = actorId;
      if (requestId) {
        const request = await db.serviceRequest.findFirst({
          where: {
            id: requestId,
            providerUserId: actorId,
            status: {
              in: [
                "REQUESTED",
                "ACCEPTED",
                "IN_PROGRESS",
                "AWAITING_CONFIRMATION",
              ],
            },
            provider: {
              userId: actorId,
              isActive: true,
              user: { isActive: true },
            },
            client: {
              isActive: true,
              clientProfile: { is: { isActive: true } },
            },
          },
          select: { clientUserId: true },
        });
        if (
          !request ||
          request.clientUserId.toLowerCase() === actorId.toLowerCase()
        )
          return null;
        clientUserId = request.clientUserId;
      } else if (
        !(await db.clientProfile.findFirst({
          where: { userId: actorId, isActive: true, user: { isActive: true } },
          select: { id: true },
        }))
      )
        return null;
      return aggregate(db, {
        subjectUserId: clientUserId,
        direction: "PROVIDER_TO_CLIENT",
      });
    }, options);
  }
  async dueWindows() {
    return (
      await this.prisma.orm().$queryRaw<
        { requestId: string }[]
      >`SELECT TOP (20) [requestId] FROM [dbo].[ReviewWindow] WHERE [releasedAt] IS NULL AND [closesAt]<=SYSUTCDATETIME() ORDER BY [closesAt],[requestId]`
    ).map((x) => x.requestId);
  }
  async pendingSubjects(): Promise<ReviewSubject[]> {
    return await this.prisma.orm().$queryRaw<
      ReviewSubject[]
    >(Prisma.sql`SELECT TOP (20) v.[subjectUserId],v.[direction] ${validParticipantReviews()}
      AND v.[publishedAt] IS NOT NULL AND v.[batchId] IS NULL GROUP BY v.[subjectUserId],v.[direction]
      HAVING COUNT(DISTINCT v.[authorUserId])>=${REPUTATION_MIN_DISTINCT_AUTHORS} ORDER BY v.[subjectUserId],v.[direction]`);
  }
}
