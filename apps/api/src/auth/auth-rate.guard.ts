import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createHmac } from "node:crypto";
import { ApiError } from "../api-error";
import type { AuthRequest } from "./auth.guard";
@Injectable()
export class AuthRateGuard implements CanActivate {
  private readonly windows = new Map<
    string,
    { count: number; expires: number }
  >();
  constructor(@Inject(ConfigService) private readonly config: ConfigService) {}
  private consume(key: string, limit: number, duration: number) {
    const now = Date.now();
    if (this.windows.size >= 10000) {
      for (const [entry, value] of this.windows)
        if (value.expires <= now) this.windows.delete(entry);
      if (this.windows.size >= 10000)
        throw new ApiError(
          429,
          "TOO_MANY_ATTEMPTS",
          "Muitas tentativas. Aguarde e tente novamente.",
          [],
          60,
        );
    }
    const value = this.windows.get(key);
    if (!value || value.expires <= now)
      this.windows.set(key, { count: 1, expires: now + duration });
    else {
      value.count++;
      if (value.count > limit)
        throw new ApiError(
          429,
          "TOO_MANY_ATTEMPTS",
          "Muitas tentativas. Aguarde e tente novamente.",
          [],
          Math.max(1, Math.ceil((value.expires - now) / 1000)),
        );
    }
  }
  canActivate(context: ExecutionContext) {
    if (!this.config.get<boolean>("AUTH_ENABLED"))
      throw new ApiError(
        503,
        "AUTH_UNAVAILABLE",
        "Autenticação temporariamente indisponível.",
      );
    const request = context.switchToHttp().getRequest<AuthRequest>();
    const action = context.getHandler().name;
    const ip = request.ip ?? "unknown";
    const sensitive = action === "login" || action === "register";
    this.consume(
      `${action}:${ip}`,
      sensitive ? 20 : 120,
      sensitive ? 900000 : 60000,
    );
    const body = request.body;
    if (
      sensitive &&
      body &&
      typeof body === "object" &&
      "email" in body &&
      typeof body.email === "string"
    ) {
      const key = createHmac(
        "sha256",
        this.config.getOrThrow<string>("JWT_ACCESS_SECRET"),
      )
        .update(body.email.slice(0, 254).trim().toLowerCase())
        .digest("hex");
      this.consume(`${action}:${ip}:${key}`, 5, 900000);
    }
    return true;
  }
}
