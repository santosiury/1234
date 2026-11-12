import { Inject, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../persistence/prisma.service";
import { RequestsRepository, type RequestsTx } from "./requests.repository";

@Injectable()
export class PrismaRequestsRepository extends RequestsRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {
    super();
  }
  transaction<T>(run: (tx: RequestsTx) => Promise<T>): Promise<T> {
    return this.prisma.orm().$transaction(
      async (db) =>
        run({
          now: async () =>
            (
              await db.$queryRaw<
                { now: Date }[]
              >`SELECT SYSUTCDATETIME() AS [now]`
            )[0].now,
          actor: async (id) => {
            const user = await db.user.findFirst({
              where: { id, isActive: true },
              select: {
                id: true,
                displayName: true,
                clientProfile: { select: { isActive: true } },
                providerProfile: { select: { isActive: true } },
              },
            });
            return user
              ? {
                  id: user.id,
                  displayName: user.displayName,
                  client: !!user.clientProfile?.isActive,
                  provider: !!user.providerProfile?.isActive,
                }
              : null;
          },
          target: async (input) => {
            const service = await db.providerService.findFirst({
              where: {
                id: input.providerServiceId,
                providerId: input.providerId,
                isActive: true,
                category: { isActive: true },
                provider: { isActive: true, user: { isActive: true } },
              },
              select: {
                title: true,
                provider: { select: { userId: true, professionalName: true } },
              },
            });
            if (!service) return null;
            const areas = await db.$queryRaw<
              { id: string }[]
            >`SELECT TOP (1) [id] FROM [dbo].[ProviderServiceArea] WHERE [providerId]=${input.providerId} AND [isActive]=1 AND [city] COLLATE Latin1_General_100_CI_AI=${input.city} AND [state]=${input.state} AND ([neighborhood]=N'' OR [neighborhood] COLLATE Latin1_General_100_CI_AI=${input.neighborhood})`;
            return areas.length
              ? {
                  providerUserId: service.provider.userId,
                  providerName: service.provider.professionalName,
                  serviceTitle: service.title,
                }
              : null;
          },
          operation: (actorUserId, idempotencyKey) =>
            db.serviceRequestEvent.findUnique({
              where: {
                actorUserId_idempotencyKey: { actorUserId, idempotencyKey },
              },
            }),
          byKey: (clientUserId, idempotencyKey) =>
            db.serviceRequest.findUnique({
              where: {
                clientUserId_idempotencyKey: { clientUserId, idempotencyKey },
              },
            }),
          get: (id) => db.serviceRequest.findUnique({ where: { id } }),
          insert: (data) => db.serviceRequest.create({ data }),
          append: (data) => db.serviceRequestEvent.create({ data }),
          patch: async (id, status, version, data) =>
            (
              await db.serviceRequest.updateMany({
                where: { id, status, version },
                data,
              })
            ).count,
          events: (requestId, afterVersion = 0) =>
            db.serviceRequestEvent.findMany({
              where: { requestId, version: { gt: afterVersion } },
              take: 20,
              orderBy: { version: "asc" },
            }),
          list: async (userId, side, query) => {
            const where: Prisma.ServiceRequestWhereInput = {
              ...(side === "client"
                ? { clientUserId: userId }
                : { providerUserId: userId }),
              ...(query.status ? { status: query.status } : {}),
            };
            return {
              total: await db.serviceRequest.count({ where }),
              items: await db.serviceRequest.findMany({
                where,
                skip: (query.page - 1) * query.pageSize,
                take: query.pageSize,
                orderBy: [{ createdAt: "desc" }, { id: "desc" }],
              }),
            };
          },
        }),
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        maxWait: 5000,
        timeout: 15000,
      },
    );
  }
}
