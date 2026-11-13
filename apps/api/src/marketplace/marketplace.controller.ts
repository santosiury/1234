import { cityAreas } from "@omini/shared";
import {
  Body,
  Controller,
  Get,
  Header,
  Inject,
  Param,
  Patch,
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
import type { AuthUser } from "@omini/shared";
import { AccessGuard, CurrentUser } from "../auth/auth.guard";
import { parseInput } from "../auth/auth.validation";
import { ApiError } from "../api-error";
import { MarketplaceService } from "./marketplace.service";
import { CatalogRateGuard } from "./catalog-rate.guard";
import {
  areaSchema,
  catalogQuerySchema,
  idSchema,
  serviceSchema,
  updateAreaSchema,
  updateProviderSchema,
  updateServiceSchema,
} from "./validation";
const text = (maxLength: number) => ({ type: "string" as const, maxLength });
const serviceProperties = {
  categoryId: { type: "string", format: "uuid" },
  title: { ...text(120), minLength: 2 },
  description: { ...text(1000), nullable: true },
  isActive: { type: "boolean" },
} as const;
const areaProperties = {
  city: { ...text(100), minLength: 2 },
  state: { type: "string", pattern: "^[A-Z]{2}$", example: "SC" },
  isActive: { type: "boolean" },
} as const;

const categoryResponse = {
  type: "object" as const,
  required: ["id", "slug", "name", "isActive"],
  properties: {
    id: { type: "string" as const, format: "uuid" },
    slug: text(80),
    name: text(80),
    isActive: { type: "boolean" as const },
  },
};
const serviceResponse = {
  type: "object" as const,
  required: [
    "id",
    "categoryId",
    "title",
    "description",
    "isActive",
    "category",
  ],
  properties: {
    ...serviceProperties,
    id: { type: "string" as const, format: "uuid" },
    category: categoryResponse,
  },
};
const areaResponse = {
  type: "object" as const,
  required: ["id", "city", "state", "isActive"],
  properties: {
    ...areaProperties,
    id: { type: "string" as const, format: "uuid" },
  },
};
const publicResponse = {
  type: "object" as const,
  required: ["id", "professionalName", "bio", "services", "areas"],
  properties: {
    id: { type: "string" as const, format: "uuid" },
    professionalName: text(120),
    bio: { ...text(1000), nullable: true },
    services: { type: "array" as const, items: serviceResponse },
    areas: { type: "array" as const, items: areaResponse },
  },
};
const ownResponse = {
  ...publicResponse,
  required: [...publicResponse.required, "isActive"],
  properties: {
    ...publicResponse.properties,
    isActive: { type: "boolean" as const },
  },
};

@ApiTags("catalog")
@UseGuards(CatalogRateGuard)
@Controller("catalog")
export class CatalogController {
  constructor(
    @Inject(MarketplaceService) private readonly service: MarketplaceService,
  ) {}
  @Get("categories")
  @ApiResponse({
    status: 200,
    schema: { type: "array", items: categoryResponse },
  })
  @ApiOperation({ summary: "Categorias ativas, diretamente do SQL Server" })
  @Header("Cache-Control", "no-store")
  categories() {
    return this.service.run((repo) => repo.categories());
  }
  @Get("providers")
  @ApiOperation({
    summary: "Catálogo público paginado; busca insensível a caixa e acentos",
  })
  @ApiQuery({ name: "q", required: false, maxLength: 80 })
  @ApiQuery({
    name: "categoryId",
    required: false,
    type: String,
    format: "uuid",
  })
  @ApiQuery({ name: "city", required: false, type: String })
  @ApiQuery({ name: "state", required: false, type: String })
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
    description: "Catálogo público sem informações privadas da conta.",
    schema: {
      type: "object",
      required: ["items", "total", "page", "pageSize"],
      properties: {
        items: { type: "array", items: publicResponse },
        total: { type: "integer", minimum: 0 },
        page: { type: "integer", minimum: 1 },
        pageSize: { type: "integer", minimum: 1, maximum: 20 },
      },
    },
  })
  @Header("Cache-Control", "no-store")
  providers(@Query() query: unknown) {
    return this.service.run((repo) =>
      repo.list(parseInput(catalogQuerySchema, query)),
    );
  }
  @Get("providers/:id")
  @ApiResponse({ status: 200, schema: publicResponse })
  @ApiParam({ name: "id", format: "uuid" })
  @Header("Cache-Control", "no-store")
  detail(@Param("id") id: string) {
    return this.service.run(async (repo) => {
      const result = await repo.detail(parseInput(idSchema, id));
      if (!result)
        throw new ApiError(404, "NOT_FOUND", "Profissional não encontrado.");
      return result;
    });
  }
}

@ApiTags("provider")
@ApiBearerAuth()
@UseGuards(AccessGuard, CatalogRateGuard)
@Controller("provider/me")
export class ProviderController {
  constructor(
    @Inject(MarketplaceService) private readonly service: MarketplaceService,
  ) {}
  @Get()
  @ApiResponse({ status: 200, schema: ownResponse })
  @Header("Cache-Control", "no-store")
  @ApiOperation({
    summary:
      "Perfil, serviços e áreas da conta autenticada; ativação via POST /auth/profiles",
  })
  me(@CurrentUser() user: AuthUser) {
    return this.service.run(async (repo) => {
      const value = await repo.own(user.id);
      return { ...value, areas: cityAreas(value.areas) };
    });
  }
  @Patch()
  @ApiResponse({ status: 200, schema: ownResponse })
  @Header("Cache-Control", "no-store")
  @ApiBody({
    schema: {
      type: "object",
      additionalProperties: false,
      minProperties: 1,
      properties: {
        professionalName: { ...text(120), minLength: 2 },
        bio: { ...text(1000), nullable: true },
      },
    },
  })
  update(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    return this.service.run(async (repo) => {
      const value = await repo.updateProfile(
        user.id,
        parseInput(updateProviderSchema, body),
      );
      return { ...value, areas: cityAreas(value.areas) };
    });
  }
  @Get("services")
  @ApiResponse({
    status: 200,
    schema: { type: "array", items: serviceResponse },
  })
  @Header("Cache-Control", "no-store")
  services(@CurrentUser() user: AuthUser) {
    return this.service.run(async (repo) => (await repo.own(user.id)).services);
  }
  @Post("services")
  @ApiResponse({ status: 201, schema: serviceResponse })
  @Header("Cache-Control", "no-store")
  @ApiBody({
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["categoryId", "title"],
      properties: serviceProperties,
    },
  })
  createService(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    return this.service.run((repo) =>
      repo.createService(user.id, parseInput(serviceSchema, body)),
    );
  }
  @Patch("services/:id")
  @ApiResponse({ status: 200, schema: serviceResponse })
  @Header("Cache-Control", "no-store")
  @ApiParam({ name: "id", format: "uuid" })
  @ApiBody({
    schema: {
      type: "object",
      additionalProperties: false,
      minProperties: 1,
      properties: serviceProperties,
    },
  })
  updateService(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    return this.service.run((repo) =>
      repo.updateService(
        user.id,
        parseInput(idSchema, id),
        parseInput(updateServiceSchema, body),
      ),
    );
  }
  @Get("areas")
  @ApiResponse({ status: 200, schema: { type: "array", items: areaResponse } })
  @Header("Cache-Control", "no-store")
  areas(@CurrentUser() user: AuthUser) {
    return this.service.run(async (repo) =>
      cityAreas((await repo.own(user.id)).areas),
    );
  }
  @Post("areas")
  @ApiResponse({ status: 201, schema: areaResponse })
  @Header("Cache-Control", "no-store")
  @ApiBody({
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["city", "state"],
      properties: areaProperties,
    },
  })
  createArea(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    return this.service.run((repo) =>
      repo.createArea(user.id, parseInput(areaSchema, body)),
    );
  }
  @Patch("areas/:id")
  @ApiResponse({ status: 200, schema: areaResponse })
  @Header("Cache-Control", "no-store")
  @ApiParam({ name: "id", format: "uuid" })
  @ApiBody({
    schema: {
      type: "object",
      additionalProperties: false,
      minProperties: 1,
      properties: areaProperties,
    },
  })
  updateArea(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    return this.service.run((repo) =>
      repo.updateArea(
        user.id,
        parseInput(idSchema, id),
        parseInput(updateAreaSchema, body),
      ),
    );
  }
}
