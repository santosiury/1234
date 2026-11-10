import {
  act,
  renderRouter,
  screen,
  fireEvent,
  testRouter,
} from "expo-router/testing-library";
import { router } from "expo-router";
import { AuthApi, AuthFailure } from "../src/auth/api";
import { FakeAuthApi } from "./support/auth-fakes";
import { routes } from "./support/routes";
let api: FakeAuthApi;
beforeEach(() => {
  api = new FakeAuthApi();
  jest
    .spyOn(AuthApi.prototype, "login")
    .mockImplementation(api.login.bind(api));
  jest
    .spyOn(AuthApi.prototype, "register")
    .mockImplementation(async (input) => {
      await api.register(input);
      api.value.profiles = {
        client: input.profiles.includes("client"),
        provider: input.profiles.includes("provider"),
      };
    });
  jest.spyOn(AuthApi.prototype, "me").mockImplementation(api.me.bind(api));
  jest
    .spyOn(AuthApi.prototype, "refresh")
    .mockImplementation(api.refresh.bind(api));
  jest
    .spyOn(AuthApi.prototype, "logout")
    .mockImplementation(api.logout.bind(api));
  jest
    .spyOn(AuthApi.prototype, "addProfile")
    .mockImplementation(api.addProfile.bind(api));
});
afterEach(() => jest.restoreAllMocks());
async function fillLogin() {
  await fireEvent.changeText(
    screen.getByLabelText("E-mail"),
    "pessoa@example.test",
  );
  await fireEvent.changeText(
    screen.getByLabelText("Senha"),
    "uma senha de teste segura",
  );
  await fireEvent.press(screen.getByText("Entrar"));
}
test("registration form validates, submits both profiles and logs into the same account", async () => {
  await renderRouter(routes);
  await fireEvent.press(await screen.findByText("Cadastrar no Omini"));
  await fireEvent.press(screen.getByText("Criar conta"));
  expect(api.registrations).toHaveLength(0);
  expect(screen.getByRole("alert")).toBeTruthy();
  await fireEvent.changeText(screen.getByLabelText("Nome"), "Pessoa Teste");
  await fireEvent.changeText(
    screen.getByLabelText("E-mail"),
    "PESSOA@example.test",
  );
  await fireEvent.changeText(
    screen.getByLabelText("Senha"),
    "uma senha de teste segura",
  );
  await fireEvent(
    screen.getByLabelText("Cadastrar perfil prestador"),
    "valueChange",
    true,
  );
  await fireEvent.press(screen.getByText("Criar conta"));
  expect(
    await screen.findByText(
      "Se os dados puderem ser utilizados, o cadastro foi criado. Entre com seu e-mail e senha.",
    ),
  ).toBeTruthy();
  expect(api.registrations[0].profiles).toEqual(["client", "provider"]);
  await fireEvent.press(screen.getByText("Já tenho conta · entrar"));
  await fillLogin();
  await screen.findByText("De que você precisa hoje?");
  await testRouter.push("/client/profile");
  expect(await screen.findByText("Pessoa Teste")).toBeTruthy();
  expect(screen.getByText("pessoa@example.test")).toBeTruthy();
  await fireEvent.press(screen.getByText("Mudar para prestador"));
  expect(await screen.findByText("Seu talento faz a diferença.")).toBeTruthy();
  await testRouter.push("/provider/profile");
  await fireEvent.press(screen.getByText("Sair da conta"));
  expect(await screen.findByText("Entrar na minha conta")).toBeTruthy();
  expect(api.logoutCalls).toHaveLength(1);
});
test("client-only account cannot enter provider until its profile is enrolled", async () => {
  await renderRouter(routes, { initialUrl: "/login" });
  await screen.findByText("Que bom ter você aqui");
  await fillLogin();
  await screen.findByText("De que você precisa hoje?");
  await act(async () => {
    router.push("/provider");
  });
  expect(await screen.findByText("De que você precisa hoje?")).toBeTruthy();
  await testRouter.push("/client/profile");
  await fireEvent.press(screen.getByText("Adicionar perfil de prestador"));
  expect(await screen.findByText("Mudar para prestador")).toBeTruthy();
  await fireEvent.press(screen.getByText("Mudar para prestador"));
  expect(await screen.findByText("Seu talento faz a diferença.")).toBeTruthy();
});
test("expired session returns to login with a clear message", async () => {
  await renderRouter(routes, { initialUrl: "/login" });
  await screen.findByText("Que bom ter você aqui");
  await fillLogin();
  await screen.findByText("De que você precisa hoje?");
  await testRouter.push("/client/profile");
  await screen.findByText("Pessoa Teste");
  api.forceUnauthorized = true;
  api.failRefresh = new AuthFailure(401, "SESSION_EXPIRED", "Expired");
  await fireEvent.press(screen.getByText("Atualizar conta"));
  expect(
    await screen.findByText("Sua sessão expirou. Entre novamente."),
  ).toBeTruthy();
  expect(screen.getByLabelText("Senha")).toBeTruthy();
});
test("incorrect login shows a safe error and allows retry", async () => {
  jest
    .spyOn(AuthApi.prototype, "login")
    .mockRejectedValue(
      new AuthFailure(401, "INVALID_CREDENTIALS", "E-mail ou senha inválidos."),
    );
  await renderRouter(routes, { initialUrl: "/login" });
  await screen.findByText("Que bom ter você aqui");
  await fillLogin();
  expect(await screen.findByText("E-mail ou senha inválidos.")).toBeTruthy();
  expect(screen.getByText("Entrar")).toBeEnabled();
});
