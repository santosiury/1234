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
import { ApiBearerAuth, ApiBody, ApiOperation, ApiTags } from "@nestjs/swagger";
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
    summary:
      "Reputação pública real; média nula quando sem avaliações; comentários sem dados de conta",
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
  own(@CurrentUser() user: AuthUser, @Query() query: unknown) {
    const q = parseInput(reviewQuerySchema, query);
    return this.service.page(null, user.id, q.page, q.pageSize);
  }
  @Get("reviews/requests/:id")
  @Header("Cache-Control", "no-store")
  @UseGuards(AccessGuard, RequestsRateGuard)
  @ApiBearerAuth()
  request(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.service.request(user.id, parseInput(requestIdSchema, id));
  }
  @Post("reviews/requests/:id")
  @Header("Cache-Control", "no-store")
  @UseGuards(AccessGuard, RequestsRateGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary:
      "Publicação imutável pelo cliente original, após conclusão confirmada; repetição idêntica é idempotente",
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
