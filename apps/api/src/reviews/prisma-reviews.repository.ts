import { Inject, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type { PublishedReview } from "@omini/shared";
import { PrismaService } from "../persistence/prisma.service";
import { ReviewsRepository, type ReviewsTx } from "./reviews.repository";
@Injectable()
export class PrismaReviewsRepository extends ReviewsRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {
    super();
  }
  transaction<T>(run: (tx: ReviewsTx) => Promise<T>) {
    return this.prisma.orm().$transaction(
      async (db) =>
        run({
          clientActive: async (id) =>
            !!(await db.clientProfile.findFirst({
              where: { userId: id, isActive: true, user: { isActive: true } },
              select: { id: true },
            })),
          request: async (id) => {
            const row = await db.serviceRequest.findUnique({ where: { id } });
            if (!row) return null;
            const evidence = await db.serviceRequestEvent.findFirst({
              where: {
                requestId: id,
                action: "confirm-completion",
                actorUserId: row.clientUserId,
                newStatus: "COMPLETED",
                previousStatus: "AWAITING_CONFIRMATION",
                version: row.version,
                occurredAt: row.completedAt ?? undefined,
              },
              select: { id: true },
            });
            return { ...row, validCompletion: !!evidence };
          },
          existing: (requestId) =>
            db.serviceReview.findUnique({ where: { requestId } }),
          insert: (data) => db.serviceReview.create({ data }),
        }),
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        maxWait: 5000,
        timeout: 15000,
      },
    );
  }
  page(
    providerId: string | null,
    ownerId: string | null,
    page: number,
    pageSize: number,
  ) {
    return this.prisma.orm().$transaction(
      async (db) => {
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
          select: { id: true },
        });
        if (!provider) return null;
        // Bound values, same validated set for aggregates and page. SQL Server integer AVG would truncate.
        const valid = Prisma.sql`FROM [dbo].[ServiceReview] v JOIN [dbo].[ServiceRequest] r ON r.[id]=v.[requestId]
        WHERE v.[providerId]=${provider.id} AND r.[providerId]=v.[providerId]
        AND r.[clientUserId]=v.[clientUserId] AND r.[providerUserId]=v.[providerUserId]
        AND v.[clientUserId]<>v.[providerUserId] AND r.[status]=N'COMPLETED' AND r.[completedAt] IS NOT NULL AND v.[rating] BETWEEN 1 AND 5
        AND EXISTS (SELECT 1 FROM [dbo].[ServiceRequestEvent] e WHERE e.[requestId]=r.[id] AND e.[actorUserId]=r.[clientUserId] AND e.[action]=N'confirm-completion' AND e.[previousStatus]=N'AWAITING_CONFIRMATION' AND e.[newStatus]=N'COMPLETED' AND e.[version]=r.[version] AND e.[occurredAt]=r.[completedAt])`;
        const [summary] = await db.$queryRaw<
          { total: number; average: Prisma.Decimal | null }[]
        >(
          Prisma.sql`SELECT COUNT(*) AS [total], AVG(CAST(v.[rating] AS DECIMAL(10,4))) AS [average] ${valid}`,
        );
        const rows = await db.$queryRaw<
          {
            id: string;
            rating: PublishedReview["rating"];
            comment: string | null;
            createdAt: Date;
          }[]
        >(
          Prisma.sql`SELECT v.[id], v.[rating], v.[comment], v.[createdAt] ${valid} ORDER BY v.[createdAt] DESC, v.[id] DESC OFFSET ${(page - 1) * pageSize} ROWS FETCH NEXT ${pageSize} ROWS ONLY`,
        );
        return {
          total: summary.total,
          average: summary.total === 0 ? null : Number(summary.average),
          page,
          pageSize,
          items: rows.map((row) => ({
            ...row,
            createdAt: row.createdAt.toISOString(),
            authorLabel: "Cliente Omini",
          })),
        };
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        maxWait: 5000,
        timeout: 15000,
      },
    );
  }
}
