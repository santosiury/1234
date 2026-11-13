import * as SecureStore from "expo-secure-store";
import type { CreateRequestInput } from "@omini/shared";
import { pendingRequests } from "../src/requests/pending";
import { requestIntent, requestAuthReturn } from "../src/requests/intent";
import { RequestsApi } from "../src/requests/api";
import { MarketplaceHttp } from "../src/marketplace/api";
import { SessionManager } from "../src/auth/session-manager";
import { AuthFailure } from "../src/auth/api";
import { FakeAuthApi, FakeStorage } from "./support/auth-fakes";
const owner = "10000000-0000-4000-8000-000000000001",
  other = "10000000-0000-4000-8000-000000000002";
const input: CreateRequestInput = {
  providerId: "20000000-0000-4000-8000-000000000001",
  providerServiceId: "30000000-0000-4000-8000-000000000001",
  idempotencyKey: "40000000-0000-4000-8000-000000000001",
  description: "Preciso instalar duas tomadas na sala.",
  city: "Araranguá",
  state: "SC",
  neighborhood: "Centro",
};
let values: Map<string, string>;
beforeEach(() => {
  values = new Map([["omini.auth.unrelated", "unchanged"]]);
  jest
    .mocked(SecureStore.getItemAsync)
    .mockImplementation(async (key) => values.get(key) ?? null);
  jest
    .mocked(SecureStore.setItemAsync)
    .mockImplementation(async (key, value) => {
      values.set(key, value);
    });
  jest.mocked(SecureStore.deleteItemAsync).mockImplementation(async (key) => {
    values.delete(key);
  });
});
afterEach(() => jest.restoreAllMocks());
test("pending creation round-trips accented text and surrogate pairs in bounded device-only Keychain chunks", async () => {
  const pending = {
    input: {
      ...input,
      description: "🔧".repeat(350) + " Instalação elétrica na sala.",
    },
  };
  await pendingRequests.write(owner, pending);
  expect(await pendingRequests.read(owner)).toEqual(pending);
  const writes = jest.mocked(SecureStore.setItemAsync).mock.calls;
  expect(writes.length).toBeGreaterThan(2);
  expect(writes.at(-1)![0]).toBe(`omini.requests.pending.v1.${owner}`);
  for (const [, value, options] of writes) {
    expect(Buffer.byteLength(value, "utf8")).toBeLessThanOrEqual(1600);
    expect(options?.keychainAccessible).toBe(
      SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    );
  }
  await pendingRequests.clear(owner);
  expect(values).toEqual(new Map([["omini.auth.unrelated", "unchanged"]]));
});
test("interrupted storage never publishes a manifest or exposes native errors and can be retried", async () => {
  jest
    .mocked(SecureStore.setItemAsync)
    .mockRejectedValueOnce(Error("private native detail"));
  await expect(pendingRequests.write(owner, { input })).rejects.toThrow(
    "Não foi possível preparar",
  );
  expect(await pendingRequests.read(owner)).toBeNull();
  await pendingRequests.write(owner, { input });
  expect(await pendingRequests.read(owner)).toEqual({ input });
});
test("owner-isolated pending intents serialize concurrent writes and never replace a different logical send", async () => {
  const result = await Promise.allSettled([
    pendingRequests.write(owner, { input }),
    pendingRequests.write(owner, {
      input: { ...input, description: "Outro atendimento para a cozinha." },
    }),
  ]);
  expect(result.map((r) => r.status)).toEqual(["fulfilled", "rejected"]);
  expect(await pendingRequests.read(owner)).toEqual({ input });
  expect(await pendingRequests.read(other)).toBeNull();
  await pendingRequests.write(other, { input });
  await pendingRequests.clear(other);
  expect(await pendingRequests.read(owner)).toEqual({ input });
});
test("corrupt secure records fail closed without returning raw content or silently creating another send", async () => {
  values.set(`omini.requests.pending.v1.${owner}`, "{private broken data");
  await expect(pendingRequests.read(owner)).rejects.toThrow(
    "recuperar o envio com segurança",
  );
  await expect(pendingRequests.write(owner, { input })).rejects.toThrow(
    "preparar o envio com segurança",
  );
  expect(values.get(`omini.requests.pending.v1.${owner}`)).toBe(
    "{private broken data",
  );
});
test("obvious private contacts never enter the pending journal", async () => {
  await expect(
    pendingRequests.write(owner, {
      input: {
        ...input,
        description: "Entre em contato por pessoa@example.test",
      },
    }),
  ).rejects.toThrow();
  expect([...values.keys()]).toEqual(["omini.auth.unrelated"]);
});
test("authentication resume accepts only structured internal intents, preserving service selection", () => {
  expect(
    requestAuthReturn({
      requestProvider: input.providerId,
      requestService: input.providerServiceId,
      returnTo: "https://external.test",
    }),
  ).toEqual({
    pathname: "/service-request/new",
    params: {
      providerId: input.providerId,
      serviceId: input.providerServiceId,
    },
  });
  expect(requestIntent({ requestId: owner, requestSide: "provider" })).toEqual({
    requestId: owner,
    requestSide: "provider",
  });
  expect(requestAuthReturn({ requestReturn: "received" })).toEqual({
    pathname: "/service-request/resume",
    params: { requestReturn: "received" },
  });
  for (const params of [
    { requestProvider: [input.providerId] },
    { requestId: owner, requestSide: "admin" },
    { returnTo: "/admin" },
    { requestReturn: "https://external.test" },
  ])
    expect(requestAuthReturn(params)).toBeNull();
});
test("request transport reuses session refresh and rejects malformed domain responses safely", async () => {
  const auth = new FakeAuthApi(),
    manager = new SessionManager(auth, new FakeStorage());
  await manager.login("test@example.test", "test");
  const http = jest
    .spyOn(MarketplaceHttp.prototype, "request")
    .mockRejectedValueOnce(new AuthFailure(401, "SESSION_EXPIRED", "Expired"))
    .mockResolvedValueOnce({ items: [], total: 0, page: 1, pageSize: 10 });
  const api = new RequestsApi(manager);
  expect((await api.list("client")).total).toBe(0);
  expect(auth.refreshCalls).toBe(1);
  http.mockResolvedValueOnce({
    items: [{ id: "invalid" }],
    total: 1,
    page: 1,
    pageSize: 10,
  });
  await expect(api.list("client")).rejects.toMatchObject({
    status: 502,
    code: "INVALID_RESPONSE",
  });
});
test("a delayed request adapter cannot send under a different account after logout/login", async () => {
  const auth = new FakeAuthApi(),
    manager = new SessionManager(auth, new FakeStorage());
  await manager.login("test@example.test", "test");
  const oldApi = new RequestsApi(manager),
    http = jest.spyOn(MarketplaceHttp.prototype, "request");
  await manager.logout();
  auth.value = { ...auth.value, id: other };
  await manager.login("another@example.test", "test");
  await expect(oldApi.create(input)).rejects.toMatchObject({
    status: 403,
    code: "ACCOUNT_CHANGED",
  });
  expect(http).not.toHaveBeenCalled();
  expect(manager.state.user?.id).toBe(other);
  expect(manager.state.status).toBe("authenticated");
});

test("new journal payload omits district, while reading a legacy payload preserves its exact bytes and stable key", async () => {
  const current = { ...input };
  delete current.neighborhood;
  await pendingRequests.write(owner, { input: current });
  expect((await pendingRequests.read(owner))?.input).not.toHaveProperty(
    "neighborhood",
  );
  await pendingRequests.clear(owner);
  await pendingRequests.write(owner, { input });
  const before = new Map(values),
    calls = jest.mocked(SecureStore.setItemAsync).mock.calls.length;
  expect(await pendingRequests.read(owner)).toEqual({ input });
  expect(values).toEqual(before);
  expect(jest.mocked(SecureStore.setItemAsync).mock.calls.length).toBe(calls);
});
test("authentication city context is bounded and kept with provider/service intent", () => {
  expect(
    requestAuthReturn({
      requestProvider: input.providerId,
      requestService: input.providerServiceId,
      requestCity: "  Criciúma ",
      requestState: "sc",
    }),
  ).toEqual({
    pathname: "/service-request/new",
    params: {
      providerId: input.providerId,
      serviceId: input.providerServiceId,
      city: "Criciúma",
      state: "SC",
    },
  });
  for (const value of [
    { requestCity: ["Criciúma"], requestState: "SC" },
    { requestCity: "Criciúma", requestState: "ZZ" },
    { requestCity: "x".repeat(101), requestState: "SC" },
  ])
    expect(
      requestIntent({ requestProvider: input.providerId, ...value }),
    ).toEqual({ requestProvider: input.providerId });
});
