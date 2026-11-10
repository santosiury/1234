import { AuthApi } from "../src/auth/api";
import { tokenPair } from "./support/auth-fakes";
const response = (data: unknown, status = 200) =>
  ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => data,
  }) as Response;
afterEach(() => jest.restoreAllMocks());
test("wire client sends credentials only in JSON body and bearer only in header", async () => {
  const pair = { ...tokenPair(1), accessToken: "header.payload.signature" };
  const fetch = jest
    .spyOn(global, "fetch")
    .mockResolvedValueOnce(response(pair))
    .mockResolvedValueOnce(response(pair.user));
  const api = new AuthApi(() => "http://192.168.1.100:3000/api");
  const logged = await api.login("pessoa@example.test", "fixture-password");
  await api.me(logged.accessToken);
  expect(fetch.mock.calls[0][0]).toBe(
    "http://192.168.1.100:3000/api/auth/login",
  );
  expect(fetch.mock.calls[0][1]?.body).toContain("fixture-password");
  expect(fetch.mock.calls[0][1]?.headers).not.toHaveProperty("Authorization");
  expect(fetch.mock.calls[1][1]?.headers).toMatchObject({
    Authorization: "Bearer header.payload.signature",
  });
});
test("wire client rejects malformed sessions and does not display arbitrary backend errors", async () => {
  jest
    .spyOn(global, "fetch")
    .mockResolvedValueOnce(response({ accessToken: "bad" }))
    .mockResolvedValueOnce(
      response(
        { code: "AUTH_UNAVAILABLE", message: "database-password-private" },
        503,
      ),
    );
  const api = new AuthApi(() => "http://192.168.1.100:3000/api");
  await expect(api.refresh("x".repeat(43))).rejects.toMatchObject({
    code: "INVALID_RESPONSE",
  });
  await expect(
    api.login("pessoa@example.test", "fixture-password"),
  ).rejects.toMatchObject({
    message: "Autenticação temporariamente indisponível.",
  });
});
