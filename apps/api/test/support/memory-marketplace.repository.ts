import { randomUUID } from "node:crypto";
import type {
  CatalogCategory,
  CreateAreaInput,
  CreateServiceInput,
  ProviderWorkspace,
  UpdateAreaInput,
  UpdateProviderInput,
  UpdateServiceInput,
} from "@omini/shared";
import { ApiError } from "../../src/api-error";
import { MarketplaceRepository } from "../../src/marketplace/marketplace.repository";
import { type ParsedCatalogQuery } from "../../src/marketplace/validation";
import { MemoryAuthRepository } from "./memory-auth.repository";
const normal = (v: string) =>
  v.normalize("NFD").replace(/\p{M}/gu, "").toLocaleLowerCase("pt-BR");
export class MemoryMarketplaceRepository extends MarketplaceRepository {
  profiles = new Map<string, ProviderWorkspace>();
  categoryRows: CatalogCategory[] = [
    { id: randomUUID(), slug: "eletrica", name: "Eletricista", isActive: true },
    { id: randomUUID(), slug: "pintura", name: "Pintor", isActive: true },
  ];
  constructor(readonly auth: MemoryAuthRepository) {
    super();
  }
  async own(userId: string) {
    const user = [...this.auth.users.values()].find(
      (u) => u.user.id === userId && u.active && u.user.profiles.provider,
    );
    if (!user)
      throw new ApiError(
        403,
        "PROVIDER_REQUIRED",
        "Ative seu perfil de prestador para continuar.",
      );
    if (!this.profiles.has(userId))
      this.profiles.set(userId, {
        id: randomUUID(),
        professionalName: user.user.displayName,
        bio: null,
        isActive: true,
        services: [],
        areas: [],
      });
    return this.profiles.get(userId)!;
  }
  async updateProfile(userId: string, input: UpdateProviderInput) {
    return Object.assign(await this.own(userId), input);
  }
  async categories() {
    return this.categoryRows.filter((c) => c.isActive);
  }
  async createService(userId: string, input: CreateServiceInput) {
    const profile = await this.own(userId);
    const category = this.categoryRows.find(
      (c) => c.id === input.categoryId && c.isActive,
    );
    if (!category)
      throw new ApiError(
        400,
        "CATEGORY_UNAVAILABLE",
        "Escolha categoria ativa.",
      );
    if (
      profile.services.some(
        (s) => s.categoryId === input.categoryId && s.title === input.title,
      )
    )
      throw { code: "P2002" };
    const value = {
      id: randomUUID(),
      description: null,
      isActive: true,
      ...input,
      category,
    };
    profile.services.push(value);
    return value;
  }
  async updateService(userId: string, id: string, input: UpdateServiceInput) {
    const value = (await this.own(userId)).services.find((s) => s.id === id);
    if (!value)
      throw new ApiError(404, "NOT_FOUND", "Registro não encontrado.");
    Object.assign(value, input);
    if (input.categoryId)
      value.category = this.categoryRows.find(
        (c) => c.id === input.categoryId,
      )!;
    return value;
  }
  async createArea(userId: string, input: CreateAreaInput) {
    const value = {
      id: randomUUID(),
      neighborhood: "",
      isActive: true,
      ...input,
    };
    (await this.own(userId)).areas.push(value);
    return value;
  }
  async updateArea(userId: string, id: string, input: UpdateAreaInput) {
    const value = (await this.own(userId)).areas.find((a) => a.id === id);
    if (!value)
      throw new ApiError(404, "NOT_FOUND", "Registro não encontrado.");
    return Object.assign(value, input);
  }
  publicRows() {
    return [...this.profiles.entries()]
      .filter(
        ([userId, p]) =>
          p.isActive &&
          [...this.auth.users.values()].some(
            (u) => u.user.id === userId && u.active,
          ) &&
          p.services.some((s) => s.isActive && s.category.isActive) &&
          p.areas.some((a) => a.isActive),
      )
      .map(([, p]) => ({
        id: p.id,
        professionalName: p.professionalName,
        bio: p.bio,
        services: p.services.filter((s) => s.isActive && s.category.isActive),
        areas: p.areas.filter((a) => a.isActive),
      }));
  }
  async detail(id: string) {
    return this.publicRows().find((p) => p.id === id) ?? null;
  }
  async list(q: ParsedCatalogQuery) {
    const rows = this.publicRows()
      .filter(
        (p) =>
          (!q.q ||
            normal(p.professionalName).includes(normal(q.q)) ||
            p.services.some(
              (s) =>
                normal(s.title).includes(normal(q.q!)) ||
                normal(s.category.name).includes(normal(q.q!)),
            )) &&
          (!q.categoryId ||
            p.services.some((s) => s.categoryId === q.categoryId)) &&
          p.areas.some(
            (a) =>
              (!q.city || normal(a.city) === normal(q.city)) &&
              (!q.state || a.state === q.state) &&
              (!q.neighborhood ||
                !a.neighborhood ||
                normal(a.neighborhood) === normal(q.neighborhood)),
          ),
      )
      .sort(
        (a, b) =>
          normal(a.professionalName).localeCompare(
            normal(b.professionalName),
          ) || a.id.localeCompare(b.id),
      );
    return {
      items: rows.slice((q.page - 1) * q.pageSize, q.page * q.pageSize),
      total: rows.length,
      page: q.page,
      pageSize: q.pageSize,
    };
  }
}
