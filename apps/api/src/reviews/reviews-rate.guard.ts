import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { ApiError } from "../api-error";
@Injectable()
export class PublicReviewsRateGuard implements CanActivate {
  private readonly windows = new Map<
    string,
    { count: number; until: number }
  >();
  canActivate(context: ExecutionContext) {
    const ip =
        context.switchToHttp().getRequest<{ ip?: string }>().ip ?? "unknown",
      now = Date.now();
    for (const [key, row] of this.windows)
      if (row.until <= now) this.windows.delete(key);
    const row = this.windows.get(ip);
    if ((row && row.count >= 120) || (!row && this.windows.size >= 10000))
      throw new ApiError(
        429,
        "TOO_MANY_ATTEMPTS",
        "Muitas consultas. Aguarde um minuto.",
        [],
        60,
      );
    this.windows.set(ip, {
      count: (row?.count ?? 0) + 1,
      until: row?.until ?? now + 60000,
    });
    return true;
  }
}
