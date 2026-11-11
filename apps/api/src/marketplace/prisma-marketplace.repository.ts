import { Inject, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type {
  CreateAreaInput,
  CreateServiceInput,
  UpdateAreaInput,
  UpdateProviderInput,
  UpdateServiceInput,
} from "@omini/shared";
import { PrismaService } from "../persistence/prisma.service";
import { ApiError } from "../api-error";
import { MarketplaceRepository } from "./marketplace.repository";
import { catalogWhere } from "./catalog-query";
import type { ParsedCatalogQuery } from "./validation";
const categorySelect = {
  id: true,
  slug: true,
  name: true,
  isActive: true,
} as const;
const serviceSelect = {
  id: true,
  categoryId: true,
  title: true,
  description: true,
  isActive: true,
  category: { select: categorySelect },
} as const;
const areaSelect = {
  id: true,
  city: true,
  state: true,
  neighborhood: true,
  isActive: true,
} as const;
const workspaceSelect = {
  id: true,
  professionalName: true,
  bio: true,
  isActive: true,
  services: {
    select: serviceSelect,
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  },
  serviceAreas: {
    select: areaSelect,
    orderBy: [
      { state: "asc" },
      { city: "asc" },
      { neighborhood: "asc" },
      { id: "asc" },
    ],
  },
} satisfies Prisma.ProviderProfileSelect;
const visible = {
  isActive: true,
  user: { isActive: true },
  services: { some: { isActive: true, category: { isActive: true } } },
  serviceAreas: { some: { isActive: true } },
} satisfies Prisma.ProviderProfileWhereInput;
const publicSelect = {
  id: true,
  professionalName: true,
  bio: true,
  services: {
    where: { isActive: true, category: { isActive: true } },
    select: serviceSelect,
    orderBy: [{ title: "asc" }, { id: "asc" }],
  },
  serviceAreas: {
    where: { isActive: true },
    select: areaSelect,
    orderBy: [
      { state: "asc" },
      { city: "asc" },
      { neighborhood: "asc" },
      { id: "asc" },
    ],
  },
} satisfies Prisma.ProviderProfileSelect;
export const notFound = () =>
  new ApiError(404, "NOT_FOUND", "Registro não encontrado.");
async function owner(tx: Prisma.TransactionClient, userId: string) {
  const profile = await tx.providerProfile.findFirst({
    where: { userId, isActive: true, user: { isActive: true } },
    select: { id: true },
  });
  if (!profile)
    throw new ApiError(
      403,
      "PROVIDER_REQUIRED",
      "Ative seu perfil de prestador para continuar.",
    );
  return profile.id;
}
function workspace(
  value: Prisma.ProviderProfileGetPayload<{ select: typeof workspaceSelect }>,
) {
  const { serviceAreas, ...profile } = value;
  return { ...profile, areas: serviceAreas };
}
function publicProfile(
  value: Prisma.ProviderProfileGetPayload<{ select: typeof publicSelect }>,
) {
  const { serviceAreas, ...profile } = value;
  return { ...profile, areas: serviceAreas };
}
@Injectable()
export class PrismaMarketplaceRepository extends MarketplaceRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {
    super();
  }
  categories() {
    return this.prisma
      .orm()
      .serviceCategory.findMany({
        where: { isActive: true },
        select: categorySelect,
        orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
      });
  }
  async own(userId: string) {
    const value = await this.prisma
      .orm()
      .providerProfile.findFirst({
        where: { userId, isActive: true, user: { isActive: true } },
        select: workspaceSelect,
      });
    if (!value)
      throw new ApiError(
        403,
        "PROVIDER_REQUIRED",
        "Ative seu perfil de prestador para continuar.",
      );
    return workspace(value);
  }
  async updateProfile(userId: string, input: UpdateProviderInput) {
    return this.prisma.orm().$transaction(
      async (tx) => {
        const id = await owner(tx, userId);
        return workspace(
          await tx.providerProfile.update({
            where: { id },
            data: input,
            select: workspaceSelect,
          }),
        );
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }
  async createService(userId: string, input: CreateServiceInput) {
    return this.prisma.orm().$transaction(
      async (tx) => {
        const providerId = await owner(tx, userId);
        if (
          !(await tx.serviceCategory.findFirst({
            where: { id: input.categoryId, isActive: true },
            select: { id: true },
          }))
        )
          throw new ApiError(
            400,
            "CATEGORY_UNAVAILABLE",
            "Escolha uma categoria ativa.",
          );
        if ((await tx.providerService.count({ where: { providerId } })) >= 50)
          throw new ApiError(
            409,
            "LIMIT_REACHED",
            "O limite é de 50 serviços por prestador. Edite um cadastro existente.",
          );
        return tx.providerService.create({
          data: { ...input, providerId },
          select: serviceSelect,
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }
  async updateService(userId: string, id: string, input: UpdateServiceInput) {
    return this.prisma.orm().$transaction(
      async (tx) => {
        const providerId = await owner(tx, userId);
        const record = await tx.providerService.findFirst({
          where: { id, providerId },
          select: { categoryId: true },
        });
        if (!record) throw notFound();
        if (
          (input.categoryId || input.isActive === true) &&
          !(await tx.serviceCategory.findFirst({
            where: {
              id: input.categoryId ?? record.categoryId,
              isActive: true,
            },
            select: { id: true },
          }))
        )
          throw new ApiError(
            400,
            "CATEGORY_UNAVAILABLE",
            "Escolha uma categoria ativa.",
          );
        return tx.providerService.update({
          where: { id },
          data: input,
          select: serviceSelect,
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }
  async createArea(userId: string, input: CreateAreaInput) {
    return this.prisma.orm().$transaction(
      async (tx) => {
        const providerId = await owner(tx, userId);
        if (
          (await tx.providerServiceArea.count({ where: { providerId } })) >= 50
        )
          throw new ApiError(
            409,
            "LIMIT_REACHED",
            "O limite é de 50 áreas por prestador. Edite um cadastro existente.",
          );
        return tx.providerServiceArea.create({
          data: { ...input, providerId },
          select: areaSelect,
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }
  async updateArea(userId: string, id: string, input: UpdateAreaInput) {
    return this.prisma.orm().$transaction(
      async (tx) => {
        const providerId = await owner(tx, userId);
        if (
          !(await tx.providerServiceArea.findFirst({
            where: { id, providerId },
            select: { id: true },
          }))
        )
          throw notFound();
        return tx.providerServiceArea.update({
          where: { id },
          data: input,
          select: areaSelect,
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }
  async detail(id: string) {
    const profile = await this.prisma
      .orm()
      .providerProfile.findFirst({
        where: { ...visible, id },
        select: publicSelect,
      });
    return profile ? publicProfile(profile) : null;
  }
  async list(query: ParsedCatalogQuery) {
    const db = this.prisma.orm();
    const where = catalogWhere(query);
    const [{ total }] = await db.$queryRaw<
      { total: number }[]
    >`SELECT COUNT(*) AS [total] FROM [dbo].[ProviderProfile] p INNER JOIN [dbo].[User] u ON u.[id] = p.[userId] WHERE ${where}`;
    const ids = await db.$queryRaw<
      { id: string }[]
    >`SELECT p.[id] FROM [dbo].[ProviderProfile] p INNER JOIN [dbo].[User] u ON u.[id] = p.[userId] WHERE ${where} ORDER BY p.[professionalName] COLLATE Latin1_General_100_CI_AI ASC, p.[id] ASC OFFSET ${(query.page - 1) * query.pageSize} ROWS FETCH NEXT ${query.pageSize} ROWS ONLY`;
    const profiles = ids.length
      ? await db.providerProfile.findMany({
          where: { ...visible, id: { in: ids.map((value) => value.id) } },
          select: publicSelect,
        })
      : [];
    const map = new Map(
      profiles.map((profile) => [
        profile.id.toLowerCase(),
        publicProfile(profile),
      ]),
    );
    return {
      items: ids.flatMap(({ id }) => {
        const item = map.get(id.toLowerCase());
        return item ? [item] : [];
      }),
      total: Number(total),
      page: query.page,
      pageSize: query.pageSize,
    };
  }
}
