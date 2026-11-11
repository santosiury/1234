import { Inject, Injectable } from "@nestjs/common";
import { ApiError } from "../api-error";
import { MarketplaceRepository } from "./marketplace.repository";
@Injectable()
export class MarketplaceService {
  constructor(
    @Inject(MarketplaceRepository) readonly repository: MarketplaceRepository,
  ) {}
  async run<T>(
    operation: (repository: MarketplaceRepository) => Promise<T>,
  ): Promise<T> {
    try {
      return await operation(this.repository);
    } catch (error) {
      if (error instanceof ApiError) throw error;
      const code =
        error && typeof error === "object" && "code" in error
          ? error.code
          : null;
      if (code === "P2002")
        throw new ApiError(
          409,
          "DUPLICATE_RECORD",
          "Já existe um cadastro com esses dados. Edite o existente.",
        );
      if (code === "P2025")
        throw new ApiError(404, "NOT_FOUND", "Registro não encontrado.");
      if (code === "P2034")
        throw new ApiError(
          409,
          "CONCURRENT_UPDATE",
          "O cadastro mudou durante a operação. Atualize e tente novamente.",
        );
      throw new ApiError(
        503,
        "MARKETPLACE_UNAVAILABLE",
        "O catálogo está temporariamente indisponível. Tente novamente.",
      );
    }
  }
}
