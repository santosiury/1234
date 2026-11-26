import {
  protectedReputationSchema,
  ReviewAccessErrors,
} from "./reviews.openapi";
import {
  Controller,
  Get,
  Header,
  Inject,
  Param,
  UseGuards,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiTags,
  ApiOperation,
  ApiResponse,
} from "@nestjs/swagger";
import type { AuthUser } from "@omini/shared";
import { AccessGuard, CurrentUser } from "../auth/auth.guard";
import { parseInput } from "../auth/auth.validation";
import { RequestsRateGuard } from "../requests/requests-rate.guard";
import { requestIdSchema } from "../requests/validation";
import { ProtectedReviewsService } from "./protected-reviews.service";
@ApiTags("reputation")
@ApiBearerAuth()
@Controller("reputation")
@UseGuards(AccessGuard, RequestsRateGuard)
@ReviewAccessErrors()
export class ClientReputationController {
  constructor(
    @Inject(ProtectedReviewsService)
    private readonly service: ProtectedReviewsService,
  ) {}
  @Get("me/client")
  @Header("Cache-Control", "no-store")
  @ApiOperation({
    summary: "Reputação protegida do próprio cliente",
    description:
      "Exige a política ativa e perfil cliente ativo. Mesma proteção de coortes, sem avaliações recebidas individuais, identidade de prestadores, comentários ou datas.",
  })
  @ApiResponse({ status: 200, schema: protectedReputationSchema })
  own(@CurrentUser() user: AuthUser) {
    return this.service.clientReputation(user.id);
  }
  @Get("requests/:id/client")
  @Header("Cache-Control", "no-store")
  @ApiOperation({
    summary: "Reputação do cliente para prestador autorizado",
    description:
      "Somente o prestador original autenticado, com conta/perfil ativos, destinatário de uma solicitação do cliente. Permitido em REQUESTED antes do aceite, ACCEPTED, IN_PROGRESS ou AWAITING_CONFIRMATION. Estados finais e terceiros recebem 404. O cliente é derivado do pedido, sem busca livre por ID. Retorna somente agregado anônimo de coortes completas com cinco autores distintos; não retorna vínculo com avaliações individuais.",
  })
  @ApiResponse({ status: 200, schema: protectedReputationSchema })
  request(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.service.clientReputation(
      user.id,
      parseInput(requestIdSchema, id),
    );
  }
}
