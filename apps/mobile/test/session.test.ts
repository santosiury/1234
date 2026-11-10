import { AuthFailure } from "../src/auth/api";
import { SessionManager } from "../src/auth/session-manager";
import {
  FakeAuthApi,
  FakeStorage,
  refreshValue,
  tokenPair,
} from "./support/auth-fakes";
function fixture() {
  const api = new FakeAuthApi();
  const storage = new FakeStorage();
  return { api, storage, manager: new SessionManager(api, storage) };
}
test("login persists only refresh credential, restores with rotation and updates profiles in same account", async () => {
  const { api, storage, manager } = fixture();
  await manager.restore();
  expect(manager.state.status).toBe("guest");
  const first = await manager.login("pessoa@example.test", "test-password");
  expect(manager.state.status).toBe("authenticated");
  expect(storage.record).toEqual({ token: refreshValue(1), intent: "refresh" });
  expect(JSON.stringify(storage.record)).not.toContain("access-");
  expect(JSON.stringify(storage.record)).not.toContain(first.email);
  const next = new SessionManager(api, storage);
  await next.restore();
  expect(next.state.user?.id).toBe(first.id);
  expect(storage.record?.token).toBe(refreshValue(2));
  await next.addProfile("provider");
  expect(next.state.user?.profiles).toEqual({ client: true, provider: true });
  expect(next.state.user?.id).toBe(first.id);
});
test("refresh rejection expires session and clears persistent credentials", async () => {
  const { api, storage, manager } = fixture();
  await manager.login("pessoa@example.test", "test-password");
  api.forceUnauthorized = true;
  api.failRefresh = new AuthFailure(401, "SESSION_EXPIRED", "Expired");
  await expect(manager.sync()).rejects.toBeInstanceOf(AuthFailure);
  expect(manager.state.status).toBe("expired");
  expect(manager.state.user).toBeNull();
  expect(storage.record).toBeNull();
});
test("offline restoration keeps the secure credential and does not claim authentication", async () => {
  const { api, storage, manager } = fixture();
  storage.record = { token: refreshValue(1), intent: "refresh" };
  api.failRefresh = new AuthFailure(0, "NETWORK", "Offline");
  await manager.restore();
  expect(manager.state.status).toBe("offline");
  expect(manager.state.user).toBeNull();
  expect(storage.record?.token).toBe(refreshValue(1));
});
test("parallel private requests serialize refresh and use its successor once", async () => {
  const { api, manager } = fixture();
  await manager.login("pessoa@example.test", "test-password");
  api.counter = 5;
  await Promise.all([manager.sync(), manager.sync(), manager.sync()]);
  expect(api.refreshCalls).toBe(1);
  expect(manager.state.status).toBe("authenticated");
});
test("logout queued during refresh revokes latest token without resurrecting account", async () => {
  const { api, storage, manager } = fixture();
  await manager.login("pessoa@example.test", "test-password");
  api.counter = 5;
  let release!: () => void;
  let started!: () => void;
  const began = new Promise<void>((resolve) => {
    started = resolve;
  });
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  api.refresh = async () => {
    api.refreshCalls++;
    started();
    await gate;
    return tokenPair(++api.counter, api.value);
  };
  const sync = manager.sync();
  const logout = manager.logout();
  await began;
  release();
  await Promise.all([sync, logout]);
  expect(api.logoutCalls.at(-1)).toBe(refreshValue(6));
  expect(manager.state.status).toBe("guest");
  expect(storage.record).toBeNull();
});
test("offline logout persists revocation intent and restart never refreshes that credential", async () => {
  const { api, storage, manager } = fixture();
  await manager.login("pessoa@example.test", "test-password");
  api.failLogout = true;
  await manager.logout();
  expect(manager.state.status).toBe("guest");
  expect(storage.record?.intent).toBe("revoke");
  const restarted = new SessionManager(api, storage);
  await restarted.restore();
  expect(restarted.state.user).toBeNull();
  expect(api.refreshCalls).toBe(0);
  expect(storage.record?.intent).toBe("revoke");
  await expect(
    restarted.login("pessoa@example.test", "test-password"),
  ).rejects.toBeInstanceOf(AuthFailure);
  expect(storage.record?.intent).toBe("revoke");
  api.failLogout = false;
  await restarted.restore();
  expect(storage.record).toBeNull();
  expect(restarted.state.status).toBe("guest");
});
test("secure storage failure never silently falls back or claims successful login/logout", async () => {
  const f = fixture();
  f.storage.failWrite = true;
  await expect(
    f.manager.login("pessoa@example.test", "test-password"),
  ).rejects.toMatchObject({ code: "SECURE_STORAGE" });
  expect(f.manager.state.user).toBeNull();
  expect(f.api.logoutCalls).toHaveLength(1);
  const g = fixture();
  await g.manager.login("pessoa@example.test", "test-password");
  g.storage.failWrite = true;
  await expect(g.manager.logout()).rejects.toMatchObject({
    code: "SECURE_STORAGE",
  });
  expect(g.manager.state.status).toBe("authenticated");
});
