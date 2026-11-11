import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { ApiError } from "../api-error";
@Injectable()
export class CatalogRateGuard implements CanActivate {
  private readonly windows = new Map<
    string,
    { count: number; until: number }
  >();
  canActivate(context: ExecutionContext) {
    const now = Date.now();
    const key =
      context.switchToHttp().getRequest<{ ip?: string }>().ip ?? "unknown";
    if (this.windows.size >= 10000)
      for (const [id, window] of this.windows)
        if (window.until <= now) this.windows.delete(id);
    const window = this.windows.get(key);
    if (
      (window && window.until > now && window.count >= 120) ||
      (!window && this.windows.size >= 10000)
    )
      throw new ApiError(
        429,
        "TOO_MANY_ATTEMPTS",
        "Muitas consultas. Aguarde e tente novamente.",
        [],
        60,
      );
    this.windows.set(
      key,
      window && window.until > now
        ? { ...window, count: window.count + 1 }
        : { count: 1, until: now + 60000 },
    );
    return true;
  }
}
