import {
  act,
  fireEvent,
  renderRouter,
  screen,
  testRouter,
} from "expo-router/testing-library";
import { ContactApi } from "../src/contact/api";
import { AppState, Linking } from "react-native";
import { AuthApi, AuthFailure } from "../src/auth/api";
import { MarketplaceHttp } from "../src/marketplace/api";
import { routes } from "./support/routes";
import { FakeAuthApi } from "./support/auth-fakes";
import type {
  ContactInput,
  OwnContact,
  PublishedReview,
  RequestStatus,
  ServiceRequestDetail,
} from "@omini/shared";
import { allowedRequestActions } from "@omini/shared";
const providerId = "30000000-0000-4000-8000-000000000001",
  requestId = "40000000-0000-4000-8000-000000000001";
const person = {
  id: providerId,
  professionalName: "Profissional Real",
  bio: "Atendimento residencial.",
  services: [
    {
      id: "50000000-0000-4000-8000-000000000001",
      title: "Instalação de tomadas",
      description: null,
      isActive: true,
      categoryId: "60000000-0000-4000-8000-000000000001",
      category: {
        id: "60000000-0000-4000-8000-000000000001",
        slug: "eletrica",
        name: "Elétrica",
        isActive: true,
      },
    },
  ],
  areas: [
    {
      id: "70000000-0000-4000-8000-000000000001",
      city: "Araranguá",
      state: "SC",
      isActive: true,
    },
  ],
  isActive: true,
};
let auth: FakeAuthApi,
  contact: OwnContact,
  status: RequestStatus,
  review: PublishedReview | null,
  published: unknown[],
  readCount: number,
  contactFailure: boolean;
function row(): ServiceRequestDetail {
  const viewer =
    auth.value.profiles.provider && !auth.value.profiles.client
      ? "provider"
      : "client";
  return {
    id: requestId,
    providerId,
    providerServiceId: person.services[0].id,
    clientNameSnapshot: "Cliente",
    providerNameSnapshot: person.professionalName,
    serviceTitleSnapshot: person.services[0].title,
    status,
    description: "Instalar tomadas na sala.",
    city: "Araranguá",
    state: "SC",
    neighborhood: "",
    createdAt: "2026-11-14T12:00:00Z",
    updatedAt: "2026-11-15T12:00:00Z",
    acceptedAt: null,
    startedAt: null,
    completionProposedAt: null,
    completedAt: status === "COMPLETED" ? "2026-11-15T12:00:00Z" : null,
    cancelledAt: null,
    version: 5,
    viewer,
    allowedActions: allowedRequestActions(status, viewer),
    events: [],
    eventTotal: 5,
    canReview: viewer === "client" && status === "COMPLETED" && !review,
    reviewSubmitted: !!review,
  };
}
beforeEach(() => {
  jest.clearAllMocks();
  auth = new FakeAuthApi();
  status = "COMPLETED";
  review = null;
  published = [];
  readCount = 0;
  contactFailure = false;
  contact = {
    phone: "+5548998765432",
    hasWhatsapp: true,
    shareContact: true,
    contactReady: true,
  };
  AppState.currentState = "active";
  for (const method of [
    "login",
    "refresh",
    "me",
    "logout",
    "register",
    "addProfile",
  ] as const)
    jest
      .spyOn(AuthApi.prototype, method)
      .mockImplementation(auth[method].bind(auth) as never);
  jest.spyOn(Linking, "openURL").mockResolvedValue(undefined);
  jest
    .spyOn(MarketplaceHttp.prototype, "request")
    .mockImplementation(async (path, method = "GET", body) => {
      if (path === "me/contact") {
        if (method === "PATCH") {
          contact = {
            ...(body as ContactInput),
            contactReady: (body as ContactInput).shareContact,
          };
          auth.value.contactReady = contact.contactReady;
        }
        return contact;
      }
      if (path === `requests/${requestId}/contact`) {
        readCount++;
        if (contactFailure)
          throw new AuthFailure(
            404,
            "CONTACT_UNAVAILABLE",
            "Contato indisponível.",
          );
        return { phone: contact.phone, hasWhatsapp: contact.hasWhatsapp };
      }
      if (path.startsWith("reviews/requests/")) {
        if (method === "POST") {
          published.push(body);
          review = {
            id: "80000000-0000-4000-8000-000000000001",
            ...(body as { rating: 5; comment: string }),
            createdAt: "2026-11-15T13:00:00Z",
            authorLabel: "Cliente Omini",
          };
          return review;
        }
        return { canReview: row().canReview, review };
      }
      if (
        path.startsWith("reviews/providers/") ||
        path.startsWith("provider/me/reviews")
      )
        return {
          average: review?.rating ?? null,
          total: review ? 1 : 0,
          page: 1,
          pageSize: 5,
          items: review ? [review] : [],
        };
      if (path === `requests/${requestId}`) return row();
      if (
        path.startsWith("requests/sent?") ||
        path.startsWith("requests/received?")
      ) {
        const filter = new URL("https://fixture/" + path).searchParams.get(
          "status",
        );
        const items = !filter || filter === status ? [row()] : [];
        return { items, total: items.length, page: 1, pageSize: 20 };
      }
      if (path.startsWith("catalog/categories"))
        return [person.services[0].category];
      if (path.startsWith("catalog/providers?"))
        return { items: [person], total: 1, page: 1, pageSize: 10 };
      if (path === `catalog/providers/${providerId}` || path === "provider/me")
        return person;
      throw Error("Unknown test endpoint");
    });
});
afterEach(() => jest.restoreAllMocks());
async function login() {
  await renderRouter(routes, { initialUrl: "/login" });
  await fireEvent.changeText(
    await screen.findByLabelText("E-mail"),
    "pessoa@example.test",
  );
  await fireEvent.changeText(
    screen.getByLabelText("Senha"),
    "uma senha de teste segura",
  );
  await fireEvent.press(screen.getByText("Entrar"));
  await screen.findByText(
    auth.value.profiles.client
      ? "De que você precisa hoje?"
      : "Meu espaço profissional",
  );
}
test("legacy client updates masked phone and consent without changing the account before new request form", async () => {
  auth.value.contactReady = false;
  contact = {
    phone: null,
    hasWhatsapp: false,
    shareContact: false,
    contactReady: false,
  };
  await login();
  await testRouter.push(`/service-request/new?providerId=${providerId}`);
  await screen.findByText("Atualize seu contato");
  await fireEvent.press(
    await screen.findByText("Atualizar celular e autorização"),
  );
  await fireEvent.changeText(
    screen.getByLabelText("Celular com DDD"),
    "48997654321",
  );
  expect(screen.getByLabelText("Celular com DDD").props.value).toBe(
    "(48) 99765-4321",
  );
  await fireEvent(
    screen.getByLabelText("Autorizar compartilhamento após o aceite"),
    "valueChange",
    true,
  );
  await fireEvent.press(screen.getByText("Salvar contato"));
  await screen.findByLabelText("Descrição do atendimento");
  expect(contact.phone).toBe("+5548997654321");
  expect(auth.value.id).toBe("10000000-0000-4000-8000-000000000001");
});
test("completed request offers a voluntary later review, publishes selected real rating once and then displays publication", async () => {
  await login();
  await testRouter.push(`/client/requests/${requestId}`);
  await fireEvent.press(await screen.findByText("Avalie o atendimento"));
  expect(screen).toHavePathname(`/service-review/${requestId}`);
  expect(screen.queryByRole("button", { name: "Painel" })).toBeNull();
  await fireEvent.press(screen.getByText("Publicar avaliação"));
  expect(published).toHaveLength(0);
  await fireEvent.press(screen.getByRole("radio", { name: "5 estrelas" }));
  await fireEvent.changeText(
    screen.getByLabelText("Comentário opcional"),
    "Atendimento cuidadoso.",
  );
  await fireEvent.press(screen.getByText("Publicar avaliação"));
  await screen.findByText("Avaliação publicada · 5 de 5");
  expect(published).toEqual([{ rating: 5, comment: "Atendimento cuidadoso." }]);
  expect(screen.queryByText("Avalie o atendimento")).toBeNull();
});
test("native back protects an unpublished review and allows continuing later from request history", async () => {
  await login();
  await testRouter.push(`/client/requests/${requestId}`);
  await fireEvent.press(await screen.findByText("Avalie o atendimento"));
  await fireEvent.press(screen.getByRole("radio", { name: "4 estrelas" }));
  await testRouter.back();
  await screen.findByText("Sair sem salvar?");
  await fireEvent.press(screen.getByText("Continuar editando"));
  expect(screen).toHavePathname(`/service-review/${requestId}`);
  await fireEvent.press(screen.getByText("Voltar ao atendimento"));
  await fireEvent.press(await screen.findByText("Descartar alterações"));
  await screen.findByText("Avalie o atendimento");
  expect(published).toHaveLength(0);
});
test("provider reauthorizes private contact on WhatsApp and telephone taps without sending messages", async () => {
  auth.value.profiles = { client: false, provider: true };
  status = "ACCEPTED";
  await login();
  await testRouter.push(`/provider/requests/${requestId}`);
  await fireEvent.press(
    await screen.findByText("Consultar contato autorizado"),
  );
  await screen.findByText("(48) 99876-5432");
  expect(readCount).toBe(1);
  expect(Linking.openURL).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByText("Conversar no WhatsApp"));
  expect(Linking.openURL).toHaveBeenCalledWith(
    expect.stringMatching(/^https:\/\/wa.me\/5548998765432\?text=/),
  );
  expect(readCount).toBe(2);
  await fireEvent.press(await screen.findByText("Ligar para o cliente"));
  expect(Linking.openURL).toHaveBeenCalledWith("tel:+5548998765432");
  expect(readCount).toBe(3);
});
test("non-WhatsApp contact offers telephone fallback and native link error has a safe message", async () => {
  auth.value.profiles = { client: false, provider: true };
  status = "IN_PROGRESS";
  contact.hasWhatsapp = false;
  await login();
  await testRouter.push(`/provider/requests/${requestId}`);
  await fireEvent.press(
    await screen.findByText("Consultar contato autorizado"),
  );
  await screen.findByText("Ligar para o cliente");
  expect(screen.queryByText("Conversar no WhatsApp")).toBeNull();
  jest
    .mocked(Linking.openURL)
    .mockRejectedValue(Error("private native details"));
  await fireEvent.press(screen.getByText("Ligar para o cliente"));
  expect(
    await screen.findByText(/Contato indisponível ou aplicativo não aberto/),
  ).toBeTruthy();
  expect(screen.queryByText(/private native/)).toBeNull();
});
test("revoked contact is not reused from an earlier consultation and no external app opens", async () => {
  auth.value.profiles = { client: false, provider: true };
  status = "ACCEPTED";
  await login();
  await testRouter.push(`/provider/requests/${requestId}`);
  await fireEvent.press(
    await screen.findByText("Consultar contato autorizado"),
  );
  await screen.findByText("Conversar no WhatsApp");
  contactFailure = true;
  await fireEvent.press(screen.getByText("Conversar no WhatsApp"));
  await screen.findByText(/Contato indisponível ou aplicativo não aberto/);
  expect(Linking.openURL).not.toHaveBeenCalled();
  expect(screen.queryByText("(48) 99876-5432")).toBeNull();
});
test("completed provider request does not expose the contact controls", async () => {
  auth.value.profiles = { client: false, provider: true };
  await login();
  await testRouter.push(`/provider/requests/${requestId}`);
  await screen.findByText("Detalhes da solicitação");
  expect(screen.queryByText("Consultar contato autorizado")).toBeNull();
  expect(readCount).toBe(0);
});
test("real public review appears after publication and a new focus, without fictitious score or client identity", async () => {
  await login();
  await testRouter.push(`/professional/${providerId}`);
  await screen.findByText("Ainda não há avaliações.");
  review = {
    id: "80000000-0000-4000-8000-000000000001",
    rating: 4,
    comment: "Serviço bem feito.",
    createdAt: "2026-11-15T12:00:00Z",
    authorLabel: "Cliente Omini",
  };
  await testRouter.back();
  await testRouter.push(`/professional/${providerId}`);
  expect(await screen.findByText("4 de 5 · 1 avaliação recebida")).toBeTruthy();
  expect(screen.getByText("Serviço bem feito.")).toBeTruthy();
  expect(screen.queryByText("pessoa@example.test")).toBeNull();
});

test("real received review is visible in professional Meu perfil and cannot be edited by the provider", async () => {
  auth.value.profiles = { client: false, provider: true };
  review = {
    id: "80000000-0000-4000-8000-000000000001",
    rating: 3,
    comment: "Atendimento concluído.",
    createdAt: "2026-11-15T12:00:00Z",
    authorLabel: "Cliente Omini",
  };
  await login();
  await testRouter.push("/provider/profile");
  expect(await screen.findByText("3 de 5 · 1 avaliação recebida")).toBeTruthy();
  expect(screen.getByText("Atendimento concluído.")).toBeTruthy();
  expect(screen.queryByText("Publicar avaliação")).toBeNull();
  expect(screen.queryByText("Excluir avaliação")).toBeNull();
});

test("private contact is cleared on blur and delayed responses cannot open external links after leaving", async () => {
  auth.value.profiles = { client: false, provider: true };
  status = "ACCEPTED";
  await login();
  await testRouter.push(`/provider/requests/${requestId}`);
  await fireEvent.press(
    await screen.findByText("Consultar contato autorizado"),
  );
  await screen.findByText("Conversar no WhatsApp");
  let complete!: (value: { phone: string; hasWhatsapp: boolean }) => void;
  jest.spyOn(ContactApi.prototype, "request").mockImplementation(
    () =>
      new Promise((resolve) => {
        complete = resolve;
      }),
  );
  await fireEvent.press(screen.getByText("Conversar no WhatsApp"));
  await testRouter.back();
  await act(async () => {
    complete({ phone: "+5548998765432", hasWhatsapp: true });
  });
  expect(Linking.openURL).not.toHaveBeenCalled();
  expect(
    screen.queryByText("(48) 99876-5432", { includeHiddenElements: true }),
  ).toBeNull();
});
