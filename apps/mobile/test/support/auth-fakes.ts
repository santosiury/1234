import type {
  AuthTokens,
  AuthUser,
  ExperienceMode,
  RegisterInput,
} from "@omini/shared";
import { AuthFailure, AuthTransport } from "../../src/auth/api";
import type { SessionStorage, StoredSession } from "../../src/auth/storage";
export const user: AuthUser = {
  id: "10000000-0000-4000-8000-000000000001",
  displayName: "Pessoa Teste",
  email: "pessoa@example.test",
  profiles: { client: true, provider: false },
};
export const refreshValue = (n: number) => String(n).padStart(43, "x");
export function tokenPair(n: number, value: AuthUser = user): AuthTokens {
  return {
    user: { ...value, profiles: { ...value.profiles } },
    accessToken: `access-${n}`,
    refreshToken: refreshValue(n),
    accessExpiresAt: new Date(Date.now() + 900000).toISOString(),
    refreshExpiresAt: new Date(Date.now() + 2592000000).toISOString(),
  };
}
export class FakeStorage implements SessionStorage {
  record: StoredSession | null = null;
  failWrite = false;
  async read() {
    return this.record;
  }
  async write(value: StoredSession) {
    if (this.failWrite) throw Error("Secure storage unavailable");
    this.record = { ...value };
  }
  async clear() {
    this.record = null;
  }
}
export class FakeAuthApi implements AuthTransport {
  counter = 0;
  refreshCalls = 0;
  logoutCalls: string[] = [];
  registrations: RegisterInput[] = [];
  failLogout = false;
  failRefresh: AuthFailure | null = null;
  forceUnauthorized = false;
  value = { ...user, profiles: { ...user.profiles } };
  async register(input: RegisterInput) {
    this.registrations.push(input);
  }
  async login() {
    return tokenPair(++this.counter, this.value);
  }
  async refresh() {
    this.refreshCalls++;
    if (this.failRefresh) throw this.failRefresh;
    return tokenPair(++this.counter, this.value);
  }
  async logout(token: string) {
    this.logoutCalls.push(token);
    if (this.failLogout) throw new AuthFailure(0, "NETWORK", "Offline");
  }
  async me(access: string) {
    if (this.forceUnauthorized || access !== `access-${this.counter}`)
      throw new AuthFailure(401, "SESSION_EXPIRED", "Expired");
    return this.value;
  }
  async addProfile(_access: string, role: ExperienceMode) {
    this.value.profiles[role] = true;
    return this.value;
  }
}
