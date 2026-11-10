import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  Inject,
  Post,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiTags, ApiBody, ApiResponse } from "@nestjs/swagger";
import type { AuthUser } from "@omini/shared";
import { AuthService } from "./auth.service";
import { AccessGuard, CurrentUser } from "./auth.guard";
import { AuthRateGuard } from "./auth-rate.guard";
import {
  loginSchema,
  parseInput,
  refreshSchema,
  registerSchema,
  profileSchema,
} from "./auth.validation";
@ApiTags("auth")
@UseGuards(AuthRateGuard)
@Controller("auth")
export class AuthController {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}
  @ApiBody({
    schema: {
      type: "object",
      required: ["displayName", "email", "password"],
      additionalProperties: false,
      properties: {
        displayName: { type: "string", minLength: 2, maxLength: 120 },
        email: { type: "string", format: "email", maxLength: 254 },
        password: {
          type: "string",
          format: "password",
          writeOnly: true,
          minLength: 12,
          maxLength: 128,
        },
        profiles: {
          type: "array",
          minItems: 1,
          maxItems: 2,
          uniqueItems: true,
          items: { type: "string", enum: ["client", "provider"] },
        },
      },
    },
  })
  @ApiResponse({
    status: 202,
    description: "Same generic response for a new or unavailable email.",
  })
  @Post("register")
  @HttpCode(202)
  @Header("Cache-Control", "no-store")
  register(@Body() body: unknown) {
    return this.auth.register(parseInput(registerSchema, body));
  }
  @ApiBody({
    schema: {
      type: "object",
      required: ["email", "password"],
      additionalProperties: false,
      properties: {
        email: { type: "string", format: "email" },
        password: {
          type: "string",
          format: "password",
          writeOnly: true,
          maxLength: 128,
        },
      },
    },
  })
  @Post("login")
  @HttpCode(200)
  @Header("Cache-Control", "no-store")
  login(@Body() body: unknown) {
    const input = parseInput(loginSchema, body);
    return this.auth.login(input.email, input.password);
  }
  @ApiBody({
    schema: {
      type: "object",
      required: ["refreshToken"],
      additionalProperties: false,
      properties: {
        refreshToken: {
          type: "string",
          format: "password",
          writeOnly: true,
          minLength: 43,
          maxLength: 43,
        },
      },
    },
  })
  @Post("refresh")
  @HttpCode(200)
  @Header("Cache-Control", "no-store")
  refresh(@Body() body: unknown) {
    return this.auth.refresh(parseInput(refreshSchema, body).refreshToken);
  }
  @ApiBody({
    schema: {
      type: "object",
      required: ["refreshToken"],
      additionalProperties: false,
      properties: {
        refreshToken: {
          type: "string",
          format: "password",
          writeOnly: true,
          minLength: 43,
          maxLength: 43,
        },
      },
    },
  })
  @Post("logout")
  @HttpCode(204)
  @Header("Cache-Control", "no-store")
  logout(@Body() body: unknown) {
    return this.auth.logout(parseInput(refreshSchema, body).refreshToken);
  }
  @Get("me")
  @UseGuards(AccessGuard)
  @ApiBearerAuth()
  @Header("Cache-Control", "no-store")
  me(@CurrentUser() user: AuthUser) {
    return user;
  }
  @ApiBody({
    schema: {
      type: "object",
      required: ["role"],
      additionalProperties: false,
      properties: { role: { type: "string", enum: ["client", "provider"] } },
    },
  })
  @Post("profiles")
  @UseGuards(AccessGuard)
  @ApiBearerAuth()
  @HttpCode(200)
  @Header("Cache-Control", "no-store")
  addProfile(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    return this.auth.addProfile(user.id, parseInput(profileSchema, body).role);
  }
}
