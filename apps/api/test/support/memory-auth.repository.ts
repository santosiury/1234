import { randomUUID } from "node:crypto";
import type { AuthUser, ExperienceMode, RegisterInput } from "@omini/shared";
import {
  AuthRepository,
  CredentialRecord,
  SessionRecord,
  SESSION_LIFETIME_MS,
} from "../../src/auth/auth.repository";
// Test double only: production uses SQL Server through PrismaAuthRepository.
export class MemoryAuthRepository extends AuthRepository {
  users = new Map<string, CredentialRecord>();
  sessions = new Map<string, SessionRecord & { revoked: boolean }>();
  refreshTokens = new Map<
    string,
    { sessionId: string; consumed: boolean; expires: Date }
  >();
  blocked = new Set<ExperienceMode>();
  async register(input: RegisterInput, passwordHash: string) {
    if (this.users.has(input.email)) return;
    const user: AuthUser = {
      id: randomUUID(),
      email: input.email,
      displayName: input.displayName,
      profiles: {
        client: input.profiles.includes("client"),
        provider: input.profiles.includes("provider"),
      },
    };
    this.users.set(input.email, { user, passwordHash, active: true });
  }
  async credential(email: string) {
    return this.users.get(email) ?? null;
  }
  async createSession(userId: string, hash: string, now: Date) {
    const record = [...this.users.values()].find(
      (value) => value.user.id === userId,
    )!;
    const session = {
      id: randomUUID(),
      user: record.user,
      expiresAt: new Date(now.getTime() + SESSION_LIFETIME_MS),
      revoked: false,
    };
    this.sessions.set(session.id, session);
    this.refreshTokens.set(hash, {
      sessionId: session.id,
      consumed: false,
      expires: session.expiresAt,
    });
    return session;
  }
  async session(id: string, userId: string, now: Date) {
    const session = this.sessions.get(id);
    const active = [...this.users.values()].some(
      (value) => value.user.id === userId && value.active,
    );
    return session &&
      !session.revoked &&
      session.user.id === userId &&
      session.expiresAt > now &&
      active
      ? session.user
      : null;
  }
  async rotate(hash: string, nextHash: string, now: Date) {
    const token = this.refreshTokens.get(hash);
    const session = token ? this.sessions.get(token.sessionId) : undefined;
    if (
      !token ||
      !session ||
      session.revoked ||
      token.expires <= now ||
      !(await this.session(session.id, session.user.id, now))
    )
      return null;
    if (token.consumed) {
      session.revoked = true;
      return null;
    }
    token.consumed = true;
    this.refreshTokens.set(nextHash, {
      sessionId: session.id,
      consumed: false,
      expires: session.expiresAt,
    });
    return session;
  }
  async revoke(hash: string) {
    const token = this.refreshTokens.get(hash);
    const session = token ? this.sessions.get(token.sessionId) : undefined;
    if (session) session.revoked = true;
  }
  async addProfile(userId: string, role: ExperienceMode) {
    const record = [...this.users.values()].find(
      (value) => value.user.id === userId && value.active,
    );
    if (!record || this.blocked.has(role)) return null;
    record.user.profiles[role] = true;
    return record.user;
  }
}
