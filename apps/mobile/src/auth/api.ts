import type {
  AuthTokens,
  AuthUser,
  ExperienceMode,
  RegisterInput,
} from "@omini/shared";
export class AuthFailure extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}
const messages: Record<string, string> = {
  INVALID_CREDENTIALS: "E-mail ou senha inválidos.",
  SESSION_EXPIRED: "Sua sessão expirou. Entre novamente.",
  VALIDATION_ERROR:
    "Confira os dados. Use uma senha entre 12 e 128 caracteres.",
  TOO_MANY_ATTEMPTS: "Muitas tentativas. Aguarde antes de tentar novamente.",
  PROFILE_UNAVAILABLE: "Este perfil está indisponível.",
  AUTH_UNAVAILABLE: "Autenticação temporariamente indisponível.",
};
function isUser(value: unknown): value is AuthUser {
  if (!value || typeof value !== "object") return false;
  const user = value as Partial<AuthUser>;
  return (
    typeof user.id === "string" &&
    typeof user.displayName === "string" &&
    typeof user.email === "string" &&
    typeof user.profiles?.client === "boolean" &&
    typeof user.profiles?.provider === "boolean"
  );
}
function tokens(value: unknown): AuthTokens {
  if (!value || typeof value !== "object")
    throw new AuthFailure(
      502,
      "INVALID_RESPONSE",
      "Resposta inesperada da API.",
    );
  const result = value as Partial<AuthTokens>;
  if (
    !isUser(result.user) ||
    typeof result.accessToken !== "string" ||
    !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(
      result.accessToken,
    ) ||
    result.accessToken.length > 4096 ||
    typeof result.refreshToken !== "string" ||
    !/^[A-Za-z0-9_-]{43}$/.test(result.refreshToken) ||
    !Number.isFinite(Date.parse(result.accessExpiresAt ?? "")) ||
    !Number.isFinite(Date.parse(result.refreshExpiresAt ?? ""))
  )
    throw new AuthFailure(
      502,
      "INVALID_RESPONSE",
      "Resposta inesperada da API.",
    );
  return result as AuthTokens;
}
export interface AuthTransport {
  register(input: RegisterInput): Promise<void>;
  login(email: string, password: string): Promise<AuthTokens>;
  refresh(token: string): Promise<AuthTokens>;
  logout(token: string): Promise<void>;
  me(access: string): Promise<AuthUser>;
  addProfile(access: string, role: ExperienceMode): Promise<AuthUser>;
}
export class AuthApi implements AuthTransport {
  constructor(
    private readonly baseUrl: () => string | undefined = () =>
      process.env.EXPO_PUBLIC_API_URL,
  ) {}
  private async request(
    path: string,
    body?: unknown,
    access?: string,
  ): Promise<unknown> {
    const base = this.baseUrl();
    if (!base || !/^https?:\/\//.test(base))
      throw new AuthFailure(
        0,
        "CONFIGURATION",
        "Configure o endereço da API na rede local.",
      );
    const address = new URL(base);
    if (
      address.username ||
      address.password ||
      (!__DEV__ && address.protocol !== "https:")
    )
      throw new AuthFailure(
        0,
        "CONFIGURATION",
        "Use HTTPS para autenticação fora do desenvolvimento e não inclua credenciais no endereço.",
      );
    let response: Response;
    try {
      response = await fetch(`${base.replace(/\/$/, "")}/auth/${path}`, {
        method: body === undefined ? "GET" : "POST",
        headers: {
          "Content-Type": "application/json",
          ...(access ? { Authorization: `Bearer ${access}` } : {}),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: AbortSignal.timeout(12000),
      });
    } catch {
      throw new AuthFailure(
        0,
        "NETWORK",
        "Não foi possível conectar. Verifique a rede e tente novamente.",
      );
    }
    if (response.status === 204) return undefined;
    let data: unknown;
    try {
      data = await response.json();
    } catch {
      throw new AuthFailure(
        502,
        "INVALID_RESPONSE",
        "Resposta inesperada da API.",
      );
    }
    if (!response.ok) {
      const code =
        data &&
        typeof data === "object" &&
        "code" in data &&
        typeof data.code === "string"
          ? data.code
          : "REQUEST_FAILED";
      throw new AuthFailure(
        response.status,
        code,
        messages[code] ?? "Não foi possível concluir a operação.",
      );
    }
    return data;
  }
  async register(input: RegisterInput) {
    await this.request("register", input);
  }
  async login(email: string, password: string) {
    return tokens(await this.request("login", { email, password }));
  }
  async refresh(refreshToken: string) {
    return tokens(await this.request("refresh", { refreshToken }));
  }
  async logout(refreshToken: string) {
    await this.request("logout", { refreshToken });
  }
  async me(access: string) {
    const result = await this.request("me", undefined, access);
    if (!isUser(result))
      throw new AuthFailure(
        502,
        "INVALID_RESPONSE",
        "Resposta inesperada da API.",
      );
    return result;
  }
  async addProfile(access: string, role: ExperienceMode) {
    const result = await this.request("profiles", { role }, access);
    if (!isUser(result))
      throw new AuthFailure(
        502,
        "INVALID_RESPONSE",
        "Resposta inesperada da API.",
      );
    return result;
  }
}
