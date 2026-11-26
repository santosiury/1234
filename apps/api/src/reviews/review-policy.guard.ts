import {
  Inject,
  Injectable,
  type CanActivate,
  type ExecutionContext,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  PROTECTED_REVIEW_POLICY,
  PROTECTED_REVIEW_POLICY_HEADER,
} from "@omini/shared";
import { ApiError } from "../api-error";
/** Reject legacy review writers before any repository call after the protected cutover. */
@Injectable()
export class ReviewPolicyGuard implements CanActivate {
  constructor(@Inject(ConfigService) private readonly config: ConfigService) {}
  canActivate(context: ExecutionContext) {
    if (this.config.get<boolean>("REVIEWS_V2_ENABLED") !== true) return true;
    const req = context
      .switchToHttp()
      .getRequest<{ headers: Record<string, string | string[] | undefined> }>();
    if (
      req.headers[PROTECTED_REVIEW_POLICY_HEADER.toLowerCase()] !==
      PROTECTED_REVIEW_POLICY
    )
      throw new ApiError(
        426,
        "REVIEW_CLIENT_UPDATE_REQUIRED",
        "Atualize o aplicativo para enviar avaliações com a política protegida.",
      );
    return true;
  }
}
