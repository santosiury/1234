import {
  renderRouter,
  screen,
  fireEvent,
  testRouter,
} from "expo-router/testing-library";
import R0 from "../app/_layout";
import R1 from "../app/index";
import R2 from "../app/client/_layout";
import R3 from "../app/client/index";
import R4 from "../app/client/categories";
import R5 from "../app/client/search";
import R6 from "../app/client/requests";
import R7 from "../app/client/profile";
import R8 from "../app/provider/_layout";
import R9 from "../app/provider/index";
import R10 from "../app/provider/requests";
import R11 from "../app/provider/services";
import R12 from "../app/provider/profile";
import R13 from "../app/professional/[id]";
import R14 from "../app/+not-found";
const routes = {
  _layout: R0,
  index: R1,
  "client/_layout": R2,
  "client/index": R3,
  "client/categories": R4,
  "client/search": R5,
  "client/requests": R6,
  "client/profile": R7,
  "provider/_layout": R8,
  "provider/index": R9,
  "provider/requests": R10,
  "provider/services": R11,
  "provider/profile": R12,
  "professional/[id]": R13,
  "+not-found": R14,
};
test("client navigation, search, details, back and mode switching", async () => {
  await renderRouter(routes);
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
  expect(await screen.findByText("Explorar como cliente")).toBeTruthy();
});
