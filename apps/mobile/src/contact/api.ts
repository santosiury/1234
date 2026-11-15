import {
  normalizeBrazilMobile,
  type ContactInput,
  type OwnContact,
  type RequestContact,
} from "@omini/shared";
import { MarketplaceHttp } from "../marketplace/api";
import { AuthFailure } from "../auth/api";
import type { SessionManager } from "../auth/session-manager";
function parse(value: unknown, own = false): OwnContact | RequestContact {
  const v = value as Partial<OwnContact> | null;
  if (
    !v ||
    typeof v.hasWhatsapp !== "boolean" ||
    (own
      ? v.phone !== null && !normalizeBrazilMobile(v.phone ?? "")
      : !normalizeBrazilMobile(v.phone ?? "")) ||
    (own &&
      (typeof v.shareContact !== "boolean" ||
        typeof v.contactReady !== "boolean"))
  )
    throw new AuthFailure(
      502,
      "INVALID_RESPONSE",
      "Não foi possível validar o contato.",
    );
  return v as OwnContact | RequestContact;
}
export class ContactApi {
  constructor(
    private readonly manager: SessionManager,
    private readonly http = new MarketplaceHttp(),
    private readonly ownerId = manager.state.user?.id,
  ) {}
  private authorized<T>(operation: (token: string) => Promise<T>): Promise<T> {
    return this.manager.request((token) => {
      if (this.manager.state.user?.id !== this.ownerId)
        throw new AuthFailure(
          403,
          "ACCOUNT_CHANGED",
          "A conta mudou. Abra esta tela novamente.",
        );
      return operation(token);
    });
  }
  own() {
    return this.authorized(
      async (token) =>
        parse(
          await this.http.request("me/contact", "GET", undefined, token),
          true,
        ) as OwnContact,
    );
  }
  update(input: ContactInput) {
    return this.authorized(
      async (token) =>
        parse(
          await this.http.request("me/contact", "PATCH", input, token),
          true,
        ) as OwnContact,
    );
  }
  request(id: string, signal?: AbortSignal) {
    return this.authorized(
      async (token) =>
        parse(
          await this.http.request(
            `requests/${encodeURIComponent(id)}/contact`,
            "GET",
            undefined,
            token,
            signal,
          ),
        ) as RequestContact,
    );
  }
}
