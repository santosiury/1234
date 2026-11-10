import type { AuthTokens, AuthUser, ExperienceMode } from "@omini/shared";
import { AuthFailure, AuthTransport } from "./api";
import type { SessionStorage } from "./storage";
export interface SessionState {
  status: "loading" | "guest" | "authenticated" | "expired" | "offline";
  user: AuthUser | null;
  message: string;
}
export class SessionManager {
  state: SessionState = { status: "loading", user: null, message: "" };
  private tokens: AuthTokens | null = null;
  private listeners = new Set<(state: SessionState) => void>();
  private tail: Promise<unknown> = Promise.resolve();
  constructor(
    private readonly api: AuthTransport,
    private readonly storage: SessionStorage,
  ) {}
  subscribe(listener: (state: SessionState) => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
  private update(
    status: SessionState["status"],
    user: AuthUser | null = null,
    message = "",
  ) {
    this.state = { status, user, message };
    this.listeners.forEach((listener) => listener(this.state));
  }
  // One writer for refresh/logout/login prevents token rotation races and resurrection after logout.
  private exclusive<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.tail.then(operation, operation);
    this.tail = result.catch(() => undefined);
    return result;
  }
  private async flushRevocation() {
    const stored = await this.storage.read();
    if (stored?.intent === "revoke") {
      await this.api.logout(stored.token);
      await this.storage.clear();
      return true;
    }
    return false;
  }
  private async accept(tokens: AuthTokens) {
    try {
      await this.storage.write({
        token: tokens.refreshToken,
        intent: "refresh",
      });
    } catch {
      try {
        await this.api.logout(tokens.refreshToken);
      } catch {
        /* Old persisted token, if any, cannot authenticate after rotation. */
      }
      this.tokens = null;
      this.update(
        "expired",
        null,
        "Não foi possível salvar a sessão com segurança. Entre novamente.",
      );
      throw new AuthFailure(0, "SECURE_STORAGE", this.state.message);
    }
    this.tokens = tokens;
    this.update("authenticated", tokens.user);
    return tokens.user;
  }
  private async expire() {
    this.tokens = null;
    try {
      await this.storage.clear();
    } catch {
      /* Server has already rejected the persisted credential. */
    }
    this.update("expired", null, "Sua sessão expirou. Entre novamente.");
  }
  restore() {
    return this.exclusive(async () => {
      this.update("loading");
      try {
        const pending = await this.storage.read();
        if (pending?.intent === "revoke") {
          try {
            await this.flushRevocation();
          } catch {
            this.tokens = null;
            this.update(
              "guest",
              null,
              "Você saiu deste aparelho. A revogação será reenviada quando houver conexão.",
            );
            return;
          }
        }
        const stored = await this.storage.read();
        if (!stored) {
          this.tokens = null;
          this.update("guest");
          return;
        }
        await this.accept(await this.api.refresh(stored.token));
      } catch (error) {
        if (error instanceof AuthFailure && error.status === 401)
          await this.expire();
        else if (this.state.status !== "expired") {
          this.tokens = null;
          this.update(
            "offline",
            null,
            "Não foi possível restaurar a sessão. Tente novamente ou explore a demonstração.",
          );
        }
      }
    });
  }
  login(email: string, password: string) {
    return this.exclusive(async () => {
      if (this.tokens)
        throw new AuthFailure(
          409,
          "ALREADY_AUTHENTICATED",
          "Saia da conta antes de entrar novamente.",
        );
      const previous = await this.storage.read();
      if (previous?.intent === "refresh")
        await this.storage.write({ token: previous.token, intent: "revoke" });
      await this.flushRevocation();
      return this.accept(
        await this.api.login(email.trim().toLowerCase(), password),
      );
    });
  }

  logout() {
    return this.exclusive(async () => {
      const stored = await this.storage.read();
      const token = this.tokens?.refreshToken ?? stored?.token;
      if (!token) {
        this.tokens = null;
        this.update("guest");
        return;
      }
      // Persist logout intent FIRST. If secure storage fails, report failure instead of pretending to log out.
      try {
        await this.storage.write({ token, intent: "revoke" });
      } catch {
        throw new AuthFailure(
          0,
          "SECURE_STORAGE",
          "Não foi possível sair com segurança. Tente novamente.",
        );
      }
      this.tokens = null;
      let message = "";
      try {
        await this.api.logout(token);
        await this.storage.clear();
      } catch {
        message =
          "Você saiu deste aparelho. A revogação será reenviada quando houver conexão.";
      }
      this.update("guest", null, message);
    });
  }
  private async authorized(operation: (access: string) => Promise<AuthUser>) {
    if (!this.tokens)
      throw new AuthFailure(401, "SESSION_EXPIRED", "Entre novamente.");
    try {
      return await operation(this.tokens.accessToken);
    } catch (error) {
      if (!(error instanceof AuthFailure) || error.status !== 401) throw error;
      try {
        await this.accept(await this.api.refresh(this.tokens.refreshToken));
        return await operation(this.tokens!.accessToken);
      } catch (retryError) {
        if (retryError instanceof AuthFailure && retryError.status === 401)
          await this.expire();
        throw retryError;
      }
    }
  }
  sync() {
    return this.exclusive(async () => {
      if (!this.tokens) {
        try {
          if (await this.flushRevocation()) this.update("guest");
        } catch {
          /* Keep the revocation intent; never restore it. */
        }
        return;
      }
      const user = await this.authorized((access) => this.api.me(access));
      if (this.tokens) this.tokens.user = user;
      this.update("authenticated", user);
      return user;
    });
  }
  addProfile(role: ExperienceMode) {
    return this.exclusive(async () => {
      const user = await this.authorized((access) =>
        this.api.addProfile(access, role),
      );
      if (this.tokens) this.tokens.user = user;
      this.update("authenticated", user);
      return user;
    });
  }
}
