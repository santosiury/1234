import { applyDecorators } from "@nestjs/common";
import { ApiResponse } from "@nestjs/swagger";

export const protectedReputationSchema = {
  type: "object" as const,
  description:
    "Com REVIEWS_V2_ENABLED=true: somente coortes completas de ao menos cinco autores distintos. Total zero com privacyProtected=true é supressão, não prova de ausência de avaliações. Nenhum registro individual é divulgado.",
  required: [
    "average",
    "total",
    "distribution",
    "items",
    "anonymous",
    "privacyProtected",
    "page",
    "pageSize",
  ],
  properties: {
    average: {
      type: "number" as const,
      nullable: true,
      minimum: 1,
      maximum: 5,
    },
    total: { type: "integer" as const, minimum: 0 },
    distribution: {
      type: "array" as const,
      minItems: 5,
      maxItems: 5,
      items: {
        type: "object" as const,
        required: ["stars", "count"],
        properties: {
          stars: { type: "integer" as const, minimum: 1, maximum: 5 },
          count: { type: "integer" as const, minimum: 0 },
        },
      },
    },
    items: {
      type: "array" as const,
      maxItems: 0,
      items: { type: "object" as const },
      description:
        "Sempre vazio na política protegida; sem IDs, comentários, datas ou autoria individual.",
    },
    anonymous: { type: "boolean" as const, enum: [true] },
    privacyProtected: { type: "boolean" as const },
    page: { type: "integer" as const, minimum: 1 },
    pageSize: { type: "integer" as const, minimum: 1, maximum: 20 },
  },
};
export function ReviewAccessErrors() {
  return applyDecorators(
    ApiResponse({
      status: 401,
      description: "Sessão ausente, expirada ou revogada.",
    }),
    ApiResponse({
      status: 404,
      description:
        "REVIEW_NOT_ALLOWED: recurso indisponível, participante não autorizado ou elegibilidade ausente; não revela a existência de contas ou solicitações de terceiros.",
    }),
    ApiResponse({
      status: 429,
      description: "TOO_MANY_ATTEMPTS: limite de consultas/envios excedido.",
    }),
    ApiResponse({
      status: 503,
      description:
        "REVIEWS_UNAVAILABLE: indisponibilidade temporária, sem detalhes internos.",
    }),
  );
}
