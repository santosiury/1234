import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import type { AuthRequest } from "../auth/auth.guard";
import { ApiError } from "../api-error";
@Injectable()
export class RequestsRateGuard implements CanActivate {
  private readonly windows = new Map<
    string,
    { count: number; until: number }
  >();
  canActivate(context: ExecutionContext) {
    const req = context
      .switchToHttp()
      .getRequest<AuthRequest & { method: string }>();
    const read = req.method === "GET";
    const now = Date.now();
    if (this.windows.size > 9000)
      for (const [key, value] of this.windows)
        if (value.until <= now) this.windows.delete(key);
    const keys = [
      [`${read ? "read" : "write"}:user:${req.authUser!.id}`, read ? 180 : 30],
      [`${read ? "read" : "write"}:ip:${req.ip ?? "unknown"}`, read ? 360 : 60],
    ] as const;
    for (const [key, limit] of keys) {
      const w = this.windows.get(key);
      if (
        (w && w.until > now && w.count >= limit) ||
        (!w && this.windows.size >= 10000)
      )
        throw new ApiError(
          429,
          "TOO_MANY_ATTEMPTS",
          "Muitas solicitações. Aguarde um minuto.",
          [],
          60,
        );
    }
    for (const [key] of keys) {
      const w = this.windows.get(key);
      this.windows.set(
        key,
        w && w.until > now
          ? { ...w, count: w.count + 1 }
          : { count: 1, until: now + 60000 },
      );
    }
    return true;
  }
}
