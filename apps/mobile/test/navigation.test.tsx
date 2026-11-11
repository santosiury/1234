import {
  renderRouter,
  screen,
  fireEvent,
  testRouter,
} from "expo-router/testing-library";
import { routes } from "./support/routes";
test("client navigation, search, details, back and mode switching", async () => {
  await renderRouter(routes);
  await fireEvent.press(screen.getByText("Explorar demonstração"));
  await fireEvent.press(screen.getByText("Explorar como cliente"));
  expect(await screen.findByText("De que você precisa hoje?")).toBeTruthy();
  await testRouter.push("/client/categories");
  await fireEvent.press(screen.getByText("Eletricista"));
  expect(await screen.findByText("1 perfis de exemplo")).toBeTruthy();
  await fireEvent.press(
    screen.getByLabelText("Ver perfil demonstrativo de Ana Martins"),
  );
  expect(await screen.findByText("Sobre o profissional")).toBeTruthy();
  expect(screen.getByText("Solicitar atendimento · em breve")).toBeDisabled();
  await fireEvent.press(screen.getByLabelText("Voltar"));
  expect(await screen.findByText("Encontre seu profissional")).toBeTruthy();
  await fireEvent.changeText(
    screen.getByLabelText("Buscar por nome, especialidade ou bairro"),
    "inexistente",
  );
  expect(await screen.findByText("Nenhum perfil de exemplo")).toBeTruthy();
  await testRouter.push("/client/requests");
  expect(
    await screen.findByText("Nenhuma solicitação nesta demonstração"),
  ).toBeTruthy();
  await testRouter.push("/client/profile");
  await fireEvent.press(screen.getByText("Mudar para prestador"));
  expect(await screen.findByText("Seu talento faz a diferença.")).toBeTruthy();
  await fireEvent(
    screen.getByLabelText("Disponibilidade demonstrativa"),
    "valueChange",
    true,
  );
  expect(screen.getByText("Disponível na demonstração")).toBeTruthy();
  await testRouter.push("/provider/requests");
  expect(await screen.findByText("Solicitações recebidas")).toBeTruthy();
  await testRouter.push("/provider/services");
  expect(await screen.findByText("Cadastro de serviços em breve")).toBeTruthy();
  await testRouter.push("/provider/profile");
  await fireEvent.press(screen.getByText("Mudar para cliente"));
  expect(await screen.findByText("De que você precisa hoje?")).toBeTruthy();
});
test("deep link cannot silently enter a demo mode", async () => {
  await renderRouter(routes, { initialUrl: "/provider/services" });
  expect(await screen.findByText("Explorar demonstração")).toBeTruthy();
  expect(screen.queryByText("Explorar como cliente")).toBeNull();
});

test("welcome keeps demo modes behind one expandable action and preserves provider entry", async () => {
  await renderRouter(routes);
  expect(
    screen.getByRole("button", { name: "Entrar na minha conta" }),
  ).toBeTruthy();
  expect(
    screen.getByRole("button", { name: "Cadastrar no Omini" }),
  ).toBeTruthy();
  expect(screen.queryByText("Conhecer o modo prestador")).toBeNull();
  await fireEvent.press(
    screen.getByRole("button", {
      name: "Explorar demonstração",
      expanded: false,
    }),
  );
  expect(
    screen.getByRole("button", { name: "Conhecer o modo prestador" }),
  ).toBeTruthy();
  expect(
    screen.getByRole("button", { name: "Explorar como cliente" }),
  ).toBeTruthy();
  await fireEvent.press(
    screen.getByRole("button", {
      name: "Explorar demonstração",
      expanded: true,
    }),
  );
  expect(screen.queryByText("Conhecer o modo prestador")).toBeNull();
  await fireEvent.press(screen.getByText("Explorar demonstração"));
  await fireEvent.press(
    screen.getByRole("button", { name: "Conhecer o modo prestador" }),
  );
  expect(await screen.findByText("Seu talento faz a diferença.")).toBeTruthy();
});
