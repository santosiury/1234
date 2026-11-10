import type { AuthUser, ExperienceMode, RegisterInput } from "@omini/shared";
export interface CredentialRecord {
  user: AuthUser;
  passwordHash: string;
  active: boolean;
}
export interface SessionRecord {
  id: string;
  expiresAt: Date;
  user: AuthUser;
}
export abstract class AuthRepository {
  abstract register(input: RegisterInput, passwordHash: string): Promise<void>;
  abstract credential(email: string): Promise<CredentialRecord | null>;
  abstract createSession(
    userId: string,
    hash: string,
    now: Date,
  ): Promise<SessionRecord>;
  abstract session(
    id: string,
    userId: string,
    now: Date,
  ): Promise<AuthUser | null>;
  abstract rotate(
    hash: string,
    nextHash: string,
    now: Date,
  ): Promise<SessionRecord | null>;
  abstract revoke(hash: string, now: Date): Promise<void>;
  abstract addProfile(
    userId: string,
    role: ExperienceMode,
  ): Promise<AuthUser | null>;
}
export const SESSION_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000;
