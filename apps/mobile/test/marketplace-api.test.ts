import {
  CatalogApi,
  MarketplaceHttp,
  ProviderApi,
} from "../src/marketplace/api";
import { SessionManager } from "../src/auth/session-manager";
import { FakeAuthApi, FakeStorage } from "./support/auth-fakes";
const response = (data: unknown, status = 200) =>
  ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => data,
  }) as Response;
const old = process.env.EXPO_PUBLIC_API_URL;
beforeEach(() => {
  process.env.EXPO_PUBLIC_API_URL = "http://192.168.1.100:3000/api";
});
afterEach(() => {
  jest.restoreAllMocks();
  if (old === undefined) delete process.env.EXPO_PUBLIC_API_URL;
  else process.env.EXPO_PUBLIC_API_URL = old;
});
test("public catalog sends no bearer while private updates reuse session access headers and never send owner ids", async () => {
  const fetch = jest
    .spyOn(global, "fetch")
    .mockResolvedValueOnce(response([]))
    .mockResolvedValueOnce(
      response({
        id: "provider",
        professionalName: "Profissional",
        bio: null,
        isActive: true,
        services: [],
        areas: [],
      }),
    );
  await new CatalogApi().categories();
  const manager = new SessionManager(new FakeAuthApi(), new FakeStorage());
  await manager.login("person@example.test", "test-password");
  await new ProviderApi(manager).update({ professionalName: "Profissional" });
  expect(fetch.mock.calls[0][1]?.headers).not.toHaveProperty("Authorization");
  expect(fetch.mock.calls[1][0]).toBe(
    "http://192.168.1.100:3000/api/provider/me",
  );
  expect(fetch.mock.calls[1][1]?.method).toBe("PATCH");
  expect(fetch.mock.calls[1][1]?.headers).toMatchObject({
    Authorization: "Bearer access-1",
  });
  expect(fetch.mock.calls[1][1]?.body).toBe(
    JSON.stringify({ professionalName: "Profissional" }),
  );
  expect(String(fetch.mock.calls[1][0])).not.toContain("access-1");
});
test("catalog wire validation rejects malformed data and sanitizes server errors", async () => {
  jest
    .spyOn(global, "fetch")
    .mockResolvedValueOnce(response({ items: "invalid" }))
    .mockResolvedValueOnce(
      response(
        { code: "UNKNOWN_DATABASE_ERROR", message: "server-password-private" },
        503,
      ),
    );
  await expect(new CatalogApi().providers()).rejects.toMatchObject({
    code: "INVALID_RESPONSE",
  });
  await expect(new CatalogApi().categories()).rejects.toMatchObject({
    status: 503,
    message: "O catálogo está temporariamente indisponível. Tente novamente.",
  });
});
test("catalog refuses credentials in base URLs and does not fall back to demonstrative records", async () => {
  const fetch = jest.spyOn(global, "fetch");
  await expect(
    new MarketplaceHttp(() => "http://secret:private@example.test/api").request(
      "catalog/categories",
    ),
  ).rejects.toMatchObject({ code: "CONFIGURATION" });
  expect(fetch).not.toHaveBeenCalled();
  fetch.mockRejectedValue(new Error("network secret-marker"));
  await expect(new CatalogApi().categories()).rejects.toMatchObject({
    code: "NETWORK",
    message:
      "Não foi possível conectar ao catálogo. Verifique a rede e tente novamente.",
  });
});
