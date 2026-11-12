import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
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
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from "@nestjs/swagger";
import {
  REQUEST_ACTIONS,
  REQUEST_STATUSES,
  type AuthUser,
} from "@omini/shared";
import { AccessGuard, CurrentUser } from "../auth/auth.guard";
import { parseInput } from "../auth/auth.validation";
import { RequestsService } from "./requests.service";
import { RequestsRateGuard } from "./requests-rate.guard";
import {
  actionSchema,
  createRequestSchema,
  requestActionSchema,
  requestIdSchema,
  requestQuerySchema,
  requestHistoryQuerySchema,
} from "./validation";
const uuid = { type: "string" as const, format: "uuid" };
const summary = {
  type: "object" as const,
  description:
    "Somente participantes; nomes/serviço preservados como snapshots. Sem contatos ou IDs de conta.",
  properties: {
    id: uuid,
    providerId: uuid,
    providerServiceId: uuid,
    clientNameSnapshot: { type: "string" },
    providerNameSnapshot: { type: "string" },
    serviceTitleSnapshot: { type: "string" },
    status: { type: "string", enum: [...REQUEST_STATUSES] },
    description: { type: "string" },
    city: { type: "string" },
    state: { type: "string" },
    neighborhood: { type: "string" },
    createdAt: { type: "string", format: "date-time" },
    updatedAt: { type: "string", format: "date-time" },
    acceptedAt: { type: "string", format: "date-time", nullable: true },
    startedAt: { type: "string", format: "date-time", nullable: true },
    completionProposedAt: {
      type: "string",
      format: "date-time",
      nullable: true,
    },
    completedAt: { type: "string", format: "date-time", nullable: true },
    cancelledAt: { type: "string", format: "date-time", nullable: true },
    version: { type: "integer" },
    viewer: { type: "string", enum: ["client", "provider"] },
    allowedActions: {
      type: "array",
      items: { type: "string", enum: [...REQUEST_ACTIONS] },
    },
  },
};
const detail = {
  ...summary,
  properties: {
    ...summary.properties,
    eventTotal: { type: "integer", minimum: 1 },
    events: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: uuid,
          actor: { type: "string", enum: ["client", "provider"] },
          previousStatus: {
            type: "string",
            nullable: true,
            enum: [...REQUEST_STATUSES],
          },
          newStatus: { type: "string", enum: [...REQUEST_STATUSES] },
          occurredAt: { type: "string", format: "date-time" },
          reason: { type: "string", nullable: true },
          version: { type: "integer" },
        },
      },
    },
  },
};
@ApiTags("requests")
@ApiBearerAuth()
@UseGuards(AccessGuard, RequestsRateGuard)
@ApiResponse({ status: 401, description: "Sessão inválida." })
@ApiResponse({
  status: 404,
  description: "Solicitação não acessível ou inexistente.",
})
@ApiResponse({
  status: 409,
  description: "Conflito de versão, estado ou chave de idempotência.",
})
@ApiResponse({ status: 429, description: "Limite por conta/IP e operação." })
@ApiResponse({
  status: 503,
  description: "Persistência indisponível; sem detalhes internos.",
})
@Controller("requests")
export class RequestsController {
  constructor(
    @Inject(RequestsService) private readonly service: RequestsService,
  ) {}
  @Header("Cache-Control", "no-store")
  @Post()
  @ApiOperation({
    summary:
      "Solicitar serviço ativo, coberto pela área; chave UUID estável por tentativa lógica",
  })
  @ApiBody({
    schema: {
      type: "object",
      additionalProperties: false,
      required: [
        "providerId",
        "providerServiceId",
        "description",
        "city",
        "state",
        "idempotencyKey",
      ],
      properties: {
        providerId: uuid,
        providerServiceId: uuid,
        idempotencyKey: uuid,
        description: { type: "string", minLength: 10, maxLength: 1000 },
        city: { type: "string", minLength: 2, maxLength: 100 },
        state: { type: "string", pattern: "^[A-Z]{2}$" },
        neighborhood: { type: "string", maxLength: 100 },
      },
    },
  })
  @ApiResponse({ status: 201, schema: detail })
  create(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    return this.service.create(user.id, parseInput(createRequestSchema, body));
  }
  @Header("Cache-Control", "no-store")
  @Get("sent")
  @ApiOperation({
    summary:
      "Enviadas pela conta; data/id decrescentes, sem dados de terceiros",
  })
  @ApiQuery({ name: "status", required: false, enum: REQUEST_STATUSES })
  @ApiQuery({
    name: "page",
    required: false,
    type: Number,
    minimum: 1,
    maximum: 1000,
  })
  @ApiQuery({
    name: "pageSize",
    required: false,
    type: Number,
    minimum: 1,
    maximum: 20,
  })
  @ApiResponse({
    status: 200,
    schema: {
      type: "object",
      properties: {
        items: { type: "array", items: summary },
        total: { type: "integer" },
        page: { type: "integer" },
        pageSize: { type: "integer" },
      },
    },
  })
  sent(@CurrentUser() user: AuthUser, @Query() query: unknown) {
    return this.service.list(
      user.id,
      "client",
      parseInput(requestQuerySchema, query),
    );
  }
  @Header("Cache-Control", "no-store")
  @Get("received")
  @ApiOperation({ summary: "Recebidas pela conta prestadora destinatária" })
  @ApiQuery({ name: "status", required: false, enum: REQUEST_STATUSES })
  @ApiQuery({
    name: "page",
    required: false,
    type: Number,
    minimum: 1,
    maximum: 1000,
  })
  @ApiQuery({
    name: "pageSize",
    required: false,
    type: Number,
    minimum: 1,
    maximum: 20,
  })
  @ApiResponse({
    status: 200,
    schema: {
      type: "object",
      properties: {
        items: { type: "array", items: summary },
        total: { type: "integer" },
        page: { type: "integer" },
        pageSize: { type: "integer" },
      },
    },
  })
  received(@CurrentUser() user: AuthUser, @Query() query: unknown) {
    return this.service.list(
      user.id,
      "provider",
      parseInput(requestQuerySchema, query),
    );
  }
  @Header("Cache-Control", "no-store")
  @Get("by-key/:key")
  @ApiOperation({
    summary:
      "Recuperar o próprio envio após resposta de rede incerta; nunca cria solicitação",
  })
  @ApiParam({ name: "key", format: "uuid" })
  @ApiResponse({ status: 200, schema: detail })
  byKey(@CurrentUser() user: AuthUser, @Param("key") key: string) {
    return this.service.byKey(user.id, parseInput(requestIdSchema, key));
  }
  @Header("Cache-Control", "no-store")
  @Get(":id/history")
  @ApiOperation({
    summary: "Histórico imutável, até 20 eventos em ordem de versão por página",
  })
  @ApiParam({ name: "id", format: "uuid" })
  @ApiQuery({
    name: "afterVersion",
    required: false,
    type: Number,
    minimum: 0,
    maximum: 2147483646,
  })
  @ApiResponse({
    status: 200,
    schema: {
      type: "object",
      properties: {
        items: detail.properties.events,
        total: { type: "integer" },
        nextVersion: { type: "integer", nullable: true },
      },
    },
  })
  history(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Query() query: unknown,
  ) {
    const { afterVersion } = parseInput(requestHistoryQuerySchema, query);
    return this.service.history(
      user.id,
      parseInput(requestIdSchema, id),
      afterVersion,
    );
  }
  @Header("Cache-Control", "no-store")
  @Get(":id")
  @ApiParam({ name: "id", format: "uuid" })
  @ApiResponse({ status: 200, schema: detail })
  get(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.service.get(user.id, parseInput(requestIdSchema, id));
  }
  @Header("Cache-Control", "no-store")
  @Post(":id/:action")
  @HttpCode(200)
  @ApiOperation({
    summary:
      "Transição autorizada com compare-and-set de estado/versão e recibo idempotente",
  })
  @ApiParam({ name: "id", format: "uuid" })
  @ApiParam({ name: "action", enum: REQUEST_ACTIONS })
  @ApiBody({
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["version", "idempotencyKey"],
      properties: {
        version: { type: "integer", minimum: 1, maximum: 2147483646 },
        idempotencyKey: uuid,
        reason: {
          type: "string",
          maxLength: 500,
          description:
            "Obrigatório e com pelo menos 10 caracteres para reopen.",
        },
      },
    },
  })
  @ApiResponse({ status: 200, schema: detail })
  act(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Param("action") action: string,
    @Body() body: unknown,
  ) {
    return this.service.act(
      user.id,
      parseInput(requestIdSchema, id),
      parseInput(actionSchema, action),
      parseInput(requestActionSchema, body),
    );
  }
}
