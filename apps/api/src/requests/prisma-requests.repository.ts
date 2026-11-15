import { contactReady } from "@omini/shared";
import { Inject, Injectable } from "@nestjs/common";
import { Prisma, type ServiceRequest } from "@prisma/client";
import { PrismaService } from "../persistence/prisma.service";
import { RequestsRepository, type RequestsTx } from "./requests.repository";

const include = {
  review: { select: { id: true } },
  events: {
    where: {
      action: "confirm-completion",
      newStatus: "COMPLETED",
      previousStatus: "AWAITING_CONFIRMATION",
    },
    orderBy: { version: "desc" as const },
    take: 1,
    select: { actorUserId: true, version: true, occurredAt: true },
  },
} as const;
function project(
  row:
    | (ServiceRequest & {
        review: { id: string } | null;
        events: { actorUserId: string; version: number; occurredAt: Date }[];
      })
    | null,
) {
  if (!row) return null;
  const { events, ...rest } = row;
  return {
    ...rest,
    reviewEligible:
      row.status === "COMPLETED" &&
      !!row.completedAt &&
      events.some(
        (e) =>
          e.actorUserId.toLowerCase() === row.clientUserId.toLowerCase() &&
          e.version === row.version &&
          e.occurredAt.getTime() === row.completedAt!.getTime(),
      ),
  };
}
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
                phone: true,
                phoneShareConsentedAt: true,
                clientProfile: { select: { isActive: true } },
                providerProfile: { select: { isActive: true } },
              },
            });
            return user
              ? {
                  contactReady: contactReady(user),
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
            >`SELECT TOP (1) [id] FROM [dbo].[ProviderServiceArea] WHERE [providerId]=${input.providerId} AND [isActive]=1 AND [city] COLLATE Latin1_General_100_CI_AI=${input.city} AND [state] COLLATE Latin1_General_100_CI_AI=${input.state}`;
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
          byKey: async (clientUserId, idempotencyKey) =>
            project(
              await db.serviceRequest.findUnique({
                include,
                where: {
                  clientUserId_idempotencyKey: { clientUserId, idempotencyKey },
                },
              }),
            ),
          get: async (id) =>
            project(
              await db.serviceRequest.findUnique({ where: { id }, include }),
            ),
          insert: async (data) =>
            project(await db.serviceRequest.create({ data, include }))!,
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
              items: (
                await db.serviceRequest.findMany({
                  include,
                  where,
                  skip: (query.page - 1) * query.pageSize,
                  take: query.pageSize,
                  orderBy: [{ createdAt: "desc" }, { id: "desc" }],
                })
              ).map((row) => project(row)!),
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
