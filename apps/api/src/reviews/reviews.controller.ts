import { ReviewPolicyGuard } from "./review-policy.guard";
import {
  PROTECTED_REVIEW_POLICY,
  PROTECTED_REVIEW_POLICY_HEADER,
} from "@omini/shared";
import {
  protectedReputationSchema,
  ReviewAccessErrors,
} from "./reviews.openapi";
import {
  Body,
  Controller,
  Get,
  Header,
  Inject,
  Param,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiHeader,
  ApiResponse,
  ApiTags,
} from "@nestjs/swagger";
import type { AuthUser } from "@omini/shared";
import { AccessGuard, CurrentUser } from "../auth/auth.guard";
import { parseInput } from "../auth/auth.validation";
import { requestIdSchema } from "../requests/validation";
import { RequestsRateGuard } from "../requests/requests-rate.guard";
import { ReviewsService } from "./reviews.service";
import { createReviewSchema, reviewQuerySchema } from "./validation";
import { PublicReviewsRateGuard } from "./reviews-rate.guard";
@ApiTags("reviews")
@Controller()
export class ReviewsController {
  constructor(
    @Inject(ReviewsService) private readonly service: ReviewsService,
  ) {}
  @Get("reviews/providers/:id")
  @Header("Cache-Control", "no-store")
  @UseGuards(PublicReviewsRateGuard)
  @ApiOperation({
    summary: "Reputação agregada e protegida do prestador",
    description:
      "Com REVIEWS_V2_ENABLED=true, publica somente agregados de coortes completas e consistentes com ao menos cinco autores distintos. Não expõe autores, contratação, IDs correlacionáveis, comentários ou datas individuais. Coorte parcialmente inelegível é ocultada inteira. Antes da ativação, mantém o contrato legado; a implantação exige corte controlado.",
  })
  @ApiResponse({
    status: 200,
    description:
      "Agregado protegido na política ativa; não há comentários públicos individuais.",
    schema: protectedReputationSchema,
  })
  public(@Param("id") id: string, @Query() query: unknown) {
    const q = parseInput(reviewQuerySchema, query);
    return this.service.page(
      parseInput(requestIdSchema, id),
      null,
      q.page,
      q.pageSize,
    );
  }
  @Get("provider/me/reviews")
  @Header("Cache-Control", "no-store")
  @UseGuards(AccessGuard, RequestsRateGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: "Reputação protegida do próprio prestador",
    description:
      "Mesma projeção agregada do catálogo, sem acesso privilegiado à identidade ou ao conteúdo de avaliadores. As avaliações escritas pelo prestador ao cliente não compõem sua própria nota.",
  })
  @ApiResponse({ status: 200, schema: protectedReputationSchema })
  @ReviewAccessErrors()
  own(@CurrentUser() user: AuthUser, @Query() query: unknown) {
    const q = parseInput(reviewQuerySchema, query);
    return this.service.page(null, user.id, q.page, q.pageSize);
  }
  @Get("reviews/requests/:id")
  @Header("Cache-Control", "no-store")
  @UseGuards(AccessGuard, RequestsRateGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: "Oportunidade e comprovante próprio de avaliação",
    description:
      "Autenticação e participação original obrigatórias. Com a política ativa, cada participante vê somente seu próprio envio, viewer/target e prazo closesAt. Nunca revela se a contraparte enviou, sua nota, comentário, identificador ou data. Elegível apenas em COMPLETED com evento canônico de confirmação e janela criada na ativação; conclusões antigas não ganham novos envios.",
  })
  @ApiResponse({
    status: 200,
    description:
      "canReview, review (somente recibo próprio ou null), viewer, target, closesAt e protected. O recibo próprio contém os dados enviados pelo autor; não é avaliação pública.",
  })
  @ReviewAccessErrors()
  request(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.service.request(user.id, parseInput(requestIdSchema, id));
  }
  @Post("reviews/requests/:id")
  @Header("Cache-Control", "no-store")
  @UseGuards(AccessGuard, RequestsRateGuard, ReviewPolicyGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: "Enviar avaliação bidirecional protegida",
    description:
      "Com REVIEWS_V2_ENABLED=true: cliente avalia prestador e prestador avalia cliente, derivados da sessão e dos participantes originais. Exige conta/perfil ativo, usuários distintos, COMPLETED e evidência da confirmação canônica. Janela de 14 dias corridos desde completedAt UTC: envio novo somente antes de closesAt. Ambos enviaram: liberação atômica; apenas um: liberação pelo publicador após o prazo, mesmo com o mobile fechado. Divulgação continua condicionada a coortes completas de cinco autores distintos. Nota 1–5, comentário opcional privado; nenhuma identidade, contratação, comentário ou data individual vai à reputação. Uma avaliação imutável por direção/solicitação. Repetição idêntica retorna o recibo existente, inclusive após o prazo; não cria avaliação retroativa. Antes da ativação permanece o caminho legado, bloqueado para novos INSERTs após o corte de schema.",
  })
  @ReviewAccessErrors()
  @ApiResponse({
    status: 201,
    description:
      "Recibo somente do autor: id, rating, comment, createdAt, authorLabel genérico e protected. Não revela a avaliação da contraparte nem seu estado de publicação.",
  })
  @ApiResponse({
    status: 400,
    description:
      "VALIDATION_ERROR: nota inválida, comentário fora dos limites ou campos extras.",
  })
  @ApiResponse({
    status: 409,
    description:
      "REVIEW_WINDOW_CLOSED: 14 dias encerrados ou contratação anterior à ativação; REVIEW_IMMUTABLE: envio já existe com conteúdo diferente; CONCURRENT_UPDATE: conflito após tentativas limitadas. Repetição idêntica não gera erro de duplicidade.",
    schema: {
      type: "object",
      properties: {
        statusCode: { type: "integer", example: 409 },
        code: {
          type: "string",
          enum: [
            "REVIEW_WINDOW_CLOSED",
            "REVIEW_IMMUTABLE",
            "CONCURRENT_UPDATE",
          ],
        },
        message: { type: "string" },
      },
    },
  })
  @ApiHeader({
    name: PROTECTED_REVIEW_POLICY_HEADER,
    required: false,
    description:
      "Obrigatório para novos envios com REVIEWS_V2_ENABLED=true; declara compatibilidade com a UI protegida, não é autenticação.",
    schema: {
      type: "string",
      enum: [PROTECTED_REVIEW_POLICY],
      default: PROTECTED_REVIEW_POLICY,
    },
  })
  @ApiResponse({
    status: 426,
    description:
      "REVIEW_CLIENT_UPDATE_REQUIRED: cliente sem suporte declarado à política protegida. Atualizar o aplicativo; nada foi gravado.",
  })
  @ApiBody({
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["rating"],
      properties: {
        rating: { type: "integer", minimum: 1, maximum: 5 },
        comment: { type: "string", maxLength: 1000, nullable: true },
      },
    },
  })
  create(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    return this.service.create(
      user.id,
      parseInput(requestIdSchema, id),
      parseInput(createReviewSchema, body),
    );
  }
}
