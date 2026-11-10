import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
} from "@nestjs/common";
import { createParamDecorator } from "@nestjs/common";
import type { AuthUser } from "@omini/shared";
import { AuthService, expired } from "./auth.service";
export interface AuthRequest {
  headers: { authorization?: string };
  ip?: string;
  body?: unknown;
  authUser?: AuthUser;
}
@Injectable()
export class AccessGuard implements CanActivate {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}
  async canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest<AuthRequest>();
    const header = req.headers.authorization;
    if (
      !header ||
      header.length > 4096 ||
      !/^Bearer [A-Za-z0-9._-]+$/.test(header)
    )
      throw expired();
    req.authUser = await this.auth.authenticate(header.slice(7));
    return true;
  }
}
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthUser =>
    context.switchToHttp().getRequest<AuthRequest>().authUser!,
);
