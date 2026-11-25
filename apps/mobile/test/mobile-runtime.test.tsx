import {
  fireEvent,
  renderRouter,
  screen,
  testRouter,
} from "expo-router/testing-library";
import { MOBILE_UI_REVISION, runtimeApiLabel } from "../src/dev/runtime";
import { routes } from "./support/routes";
import { AuthApi } from "../src/auth/api";
import { FakeAuthApi } from "./support/auth-fakes";

const originalApiUrl = process.env.EXPO_PUBLIC_API_URL;
afterEach(() => {
  if (originalApiUrl === undefined) delete process.env.EXPO_PUBLIC_API_URL;
  else process.env.EXPO_PUBLIC_API_URL = originalApiUrl;
  jest.restoreAllMocks();
});

test.each([
  [undefined, "Não configurada"],
  ["not-a-url", "Configuração inválida"],
  ["http://localhost:3000/api", "Loopback do dispositivo"],
  ["http://127.0.0.1:3000/api", "Loopback do dispositivo"],
  ["http://192.0.2.10:3000/wrong-path", "deve terminar em /api"],
  ["http://user:fixture-secret@192.0.2.10:3000/api", "Configuração inválida"],
  ["http://192.0.2.10:3000/api?token=fixture-secret", "Configuração inválida"],
  ["http://192.0.2.10:3000/api#fixture-secret", "Configuração inválida"],
  ["file:///fixture-secret", "Configuração inválida"],
] as const)(
  "runtime diagnostic handles %s without disclosing secrets",
  (value, expected) => {
    const label = runtimeApiLabel(value);
    expect(label).toContain(expected);
    expect(label).not.toMatch(/fixture-secret|user:|token=/);
  },
);

test("valid API target is displayed without credentials and with a normalized suffix", () => {
  expect(runtimeApiLabel("http://192.0.2.10:3000/api/")).toBe(
    "http://192.0.2.10:3000/api",
  );
  expect(runtimeApiLabel("https://api.example.test/api")).toBe(
    "https://api.example.test/api",
  );
});

test("the real account route identifies the running development bundle and health does not claim cancellation success", async () => {
  process.env.EXPO_PUBLIC_API_URL = "http://192.0.2.10:3000/api";
  const auth = new FakeAuthApi();
  for (const method of ["login", "refresh", "me"] as const)
    jest
      .spyOn(AuthApi.prototype, method)
      .mockImplementation(auth[method].bind(auth) as never);
  const health = jest.spyOn(globalThis, "fetch").mockResolvedValue({
    ok: true,
    json: async () => ({ status: "ok", timestamp: "2026-11-24T12:00:00.000Z" }),
  } as Response);
  await renderRouter(routes, { initialUrl: "/login" });
  await fireEvent.changeText(
    await screen.findByLabelText("E-mail"),
    "pessoa@example.test",
  );
  await fireEvent.changeText(screen.getByLabelText("Senha"), "senha de teste");
  await fireEvent.press(screen.getByRole("button", { name: "Entrar" }));
  await screen.findByText("De que você precisa hoje?");
  await testRouter.push("/account");
  expect(
    await screen.findByText(`Revisão mobile: ${MOBILE_UI_REVISION}`),
  ).toBeTruthy();
  expect(
    screen.getByText("API do app: http://192.0.2.10:3000/api"),
  ).toBeTruthy();
  await fireEvent.press(screen.getByRole("button", { name: "Testar conexão" }));
  expect(
    await screen.findByText(
      "A API respondeu ao health check. Esta consulta não valida o banco nem o cancelamento.",
    ),
  ).toBeTruthy();
  expect(health).toHaveBeenCalledWith(
    "http://192.0.2.10:3000/api/health",
    expect.any(Object),
  );
});
