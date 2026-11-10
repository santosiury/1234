import { Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { createHash, randomBytes } from "node:crypto";
import type {
  AuthTokens,
  AuthUser,
  ExperienceMode,
  RegisterInput,
} from "@omini/shared";
import { ApiError } from "../api-error";
import { AuthRepository, SessionRecord } from "./auth.repository";
import { PasswordService } from "./password.service";
export const tokenHash = (token: string) =>
  createHash("sha256").update(token).digest("hex");
export const expired = () =>
  new ApiError(401, "SESSION_EXPIRED", "Sua sessão expirou. Entre novamente.");
@Injectable()
export class AuthService {
  constructor(
    @Inject(AuthRepository) private readonly repository: AuthRepository,
    @Inject(PasswordService) private readonly passwords: PasswordService,
    @Inject(JwtService) private readonly jwt: JwtService,
    @Inject(ConfigService) private readonly config: ConfigService,
  ) {}
  private async database<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw new ApiError(
        503,
        "AUTH_UNAVAILABLE",
        "Autenticação temporariamente indisponível.",
      );
    }
  }
  async register(input: RegisterInput) {
    const hash = await this.passwords.hash(input.password);
    await this.database(() => this.repository.register(input, hash));
    return {
      message:
        "Se os dados puderem ser utilizados, o cadastro foi criado. Entre com seu e-mail e senha.",
    };
  }
  async login(email: string, password: string): Promise<AuthTokens> {
    const credential = await this.database(() =>
      this.repository.credential(email),
    );
    const valid = await this.passwords.verify(
      credential?.passwordHash,
      password,
    );
    if (!valid || !credential?.active)
      throw new ApiError(
        401,
        "INVALID_CREDENTIALS",
        "E-mail ou senha inválidos.",
      );
    const token = randomBytes(32).toString("base64url");
    const session = await this.database(() =>
      this.repository.createSession(
        credential.user.id,
        tokenHash(token),
        new Date(),
      ),
    );
    return this.tokens(session, token);
  }
  private async tokens(
    session: SessionRecord,
    refreshToken: string,
  ): Promise<AuthTokens> {
    const accessToken = await this.jwt.signAsync(
      { sub: session.user.id, sid: session.id },
      {
        secret: this.config.getOrThrow<string>("JWT_ACCESS_SECRET"),
        algorithm: "HS256",
        issuer: "omini-api",
        audience: "omini-mobile",
        expiresIn: "15m",
      },
    );
    return {
      user: session.user,
      accessToken,
      refreshToken,
      accessExpiresAt: new Date(Date.now() + 900000).toISOString(),
      refreshExpiresAt: session.expiresAt.toISOString(),
    };
  }
  async authenticate(token: string): Promise<AuthUser> {
    let payload: { sub: string; sid: string };
    try {
      payload = await this.jwt.verifyAsync(token, {
        secret: this.config.getOrThrow<string>("JWT_ACCESS_SECRET"),
        algorithms: ["HS256"],
        issuer: "omini-api",
        audience: "omini-mobile",
      });
      const guid =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!guid.test(payload.sub) || !guid.test(payload.sid)) throw expired();
    } catch {
      throw expired();
    }
    const user = await this.database(() =>
      this.repository.session(payload.sid, payload.sub, new Date()),
    );
    if (!user) throw expired();
    return user;
  }
  async refresh(token: string): Promise<AuthTokens> {
    const next = randomBytes(32).toString("base64url");
    const session = await this.database(() =>
      this.repository.rotate(tokenHash(token), tokenHash(next), new Date()),
    );
    if (!session) throw expired();
    return this.tokens(session, next);
  }
  logout(token: string) {
    return this.database(() =>
      this.repository.revoke(tokenHash(token), new Date()),
    );
  }
  async addProfile(userId: string, role: ExperienceMode) {
    const user = await this.database(() =>
      this.repository.addProfile(userId, role),
    );
    if (!user)
      throw new ApiError(403, "PROFILE_UNAVAILABLE", "Perfil indisponível.");
    return user;
  }
}
