import type {
  CatalogCategory,
  CreateAreaInput,
  CreateServiceInput,
  ProviderAreaRecord,
  ProviderPage,
  ProviderServiceRecord,
  ProviderWorkspace,
  PublicProvider,
  UpdateAreaInput,
  UpdateProviderInput,
  UpdateServiceInput,
} from "@omini/shared";
import type { ParsedCatalogQuery } from "./validation";
export abstract class MarketplaceRepository {
  abstract categories(): Promise<CatalogCategory[]>;
  abstract list(query: ParsedCatalogQuery): Promise<ProviderPage>;
  abstract detail(id: string): Promise<PublicProvider | null>;
  abstract own(userId: string): Promise<ProviderWorkspace>;
  abstract updateProfile(
    userId: string,
    input: UpdateProviderInput,
  ): Promise<ProviderWorkspace>;
  abstract createService(
    userId: string,
    input: CreateServiceInput,
  ): Promise<ProviderServiceRecord>;
  abstract updateService(
    userId: string,
    id: string,
    input: UpdateServiceInput,
  ): Promise<ProviderServiceRecord>;
  abstract createArea(
    userId: string,
    input: CreateAreaInput,
  ): Promise<ProviderAreaRecord>;
  abstract updateArea(
    userId: string,
    id: string,
    input: UpdateAreaInput,
  ): Promise<ProviderAreaRecord>;
}
