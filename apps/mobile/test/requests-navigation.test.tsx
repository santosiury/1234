import {
  act,
  fireEvent,
  renderRouter,
  screen,
  testRouter,
} from "expo-router/testing-library";
import { router } from "expo-router";
import * as SecureStore from "expo-secure-store";
import { randomUUID } from "node:crypto";
import {
  REQUEST_TRANSITIONS,
  allowedRequestActions,
  type CreateRequestInput,
  type PublicProvider,
  type ServiceRequestDetail,
  type RequestAction,
  type RequestActionInput,
} from "@omini/shared";
import { AuthApi, AuthFailure } from "../src/auth/api";
import { MarketplaceHttp } from "../src/marketplace/api";
import { FakeAuthApi } from "./support/auth-fakes";
import { routes } from "./support/routes";
const clientId = "10000000-0000-4000-8000-000000000001",
  providerUserId = "10000000-0000-4000-8000-000000000002";
const category = {
  id: "20000000-0000-4000-8000-000000000001",
  name: "Eletricista",
  slug: "eletrica",
  isActive: true,
};
const person: PublicProvider = {
  id: "30000000-0000-4000-8000-000000000001",
  professionalName: "Marina Elétrica",
  bio: "Instalações residenciais.",
  services: [
    {
      id: "40000000-0000-4000-8000-000000000001",
      categoryId: category.id,
      title: "Instalação de tomadas",
      description: null,
      isActive: true,
      category,
    },
  ],
  areas: [
    {
      id: "50000000-0000-4000-8000-000000000001",
      city: "Araranguá",
      state: "SC",
      neighborhood: "Centro",
      isActive: true,
    },
  ],
};
let auth: FakeAuthApi,
  storage: Map<string, string>,
  rows: ServiceRequestDetail[],
  keys: Map<string, string>,
  createCalls: CreateRequestInput[],
  actionCalls: { action: RequestAction; input: RequestActionInput }[],
  afterCommitFailure: boolean,
  storageFailure: boolean;
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));
function viewed(row: ServiceRequestDetail) {
  const viewer = auth.value.id === providerUserId ? "provider" : "client";
  return {
    ...clone(row),
    eventTotal: row.version,
    viewer,
    allowedActions: allowedRequestActions(row.status, viewer),
  };
}
beforeEach(() => {
  auth = new FakeAuthApi();
  storage = new Map();
  rows = [];
  keys = new Map();
  createCalls = [];
  actionCalls = [];
  afterCommitFailure = false;
  storageFailure = false;
  jest
    .mocked(SecureStore.getItemAsync)
    .mockImplementation(async (key) => storage.get(key) ?? null);
  jest
    .mocked(SecureStore.setItemAsync)
    .mockImplementation(async (key, value) => {
      if (storageFailure && key.startsWith("omini.requests"))
        throw Error("sensitive native storage detail");
      storage.set(key, value);
    });
  jest.mocked(SecureStore.deleteItemAsync).mockImplementation(async (key) => {
    storage.delete(key);
  });
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
  jest
    .spyOn(MarketplaceHttp.prototype, "request")
    .mockImplementation(async (path, method = "GET", body) => {
      if (path.startsWith("catalog/categories")) return clone([category]);
      if (path.startsWith("catalog/providers?"))
        return { items: [clone(person)], total: 1, page: 1, pageSize: 10 };
      if (path === `catalog/providers/${person.id}`) return clone(person);
      if (path === "provider/me") return { ...clone(person), isActive: true };
      if (!path.startsWith("requests"))
        throw Error("Unexpected fixture endpoint");
      if (auth.forceUnauthorized)
        throw new AuthFailure(
          401,
          "SESSION_EXPIRED",
          "Sua sessão expirou. Entre novamente.",
        );
      if (path.startsWith("requests/by-key/")) {
        const id = keys.get(path.split("/").at(-1)!);
        const row = rows.find((r) => r.id === id);
        if (!row)
          throw new AuthFailure(
            404,
            "NOT_FOUND",
            "Solicitação não encontrada.",
          );
        return viewed(row);
      }
      if (path === "requests" && method === "POST") {
        const input = body as CreateRequestInput;
        createCalls.push(clone(input));
        const old = rows.find((r) => r.id === keys.get(input.idempotencyKey));
        if (old) return viewed(old);
        const now = new Date().toISOString();
        const row: ServiceRequestDetail = {
          id: randomUUID(),
          providerId: input.providerId,
          providerServiceId: input.providerServiceId,
          clientNameSnapshot: "Pessoa Teste",
          providerNameSnapshot: person.professionalName,
          serviceTitleSnapshot: person.services[0].title,
          description: input.description,
          city: input.city,
          state: input.state,
          neighborhood: input.neighborhood,
          status: "REQUESTED",
          version: 1,
          createdAt: now,
          updatedAt: now,
          acceptedAt: null,
          startedAt: null,
          completionProposedAt: null,
          completedAt: null,
          cancelledAt: null,
          viewer: "client",
          allowedActions: ["cancel"],
          eventTotal: 1,
          events: [
            {
              id: randomUUID(),
              actor: "client",
              previousStatus: null,
              newStatus: "REQUESTED",
              occurredAt: now,
              reason: null,
              version: 1,
            },
          ],
        };
        rows.push(row);
        keys.set(input.idempotencyKey, row.id);
        if (afterCommitFailure) {
          afterCommitFailure = false;
          throw new AuthFailure(
            0,
            "NETWORK",
            "Não foi possível confirmar a resposta do envio.",
          );
        }
        return viewed(row);
      }
      if (
        path.startsWith("requests/sent?") ||
        path.startsWith("requests/received?")
      ) {
        const q = new URL("http://fixture/" + path).searchParams,
          page = Number(q.get("page") ?? 1),
          pageSize = 10;
        const all = rows.filter(
          (r) => !q.get("status") || r.status === q.get("status"),
        );
        return {
          items: all.slice((page - 1) * pageSize, page * pageSize).map(viewed),
          total: all.length,
          page,
          pageSize,
        };
      }
      const [, id, action] = path.split("/");
      const row = rows.find((r) => r.id === id);
      if (!row)
        throw new AuthFailure(404, "NOT_FOUND", "Solicitação não encontrada.");
      if (method === "GET") return viewed(row);
      const input = body as RequestActionInput,
        rule = REQUEST_TRANSITIONS[action as RequestAction];
      actionCalls.push({
        action: action as RequestAction,
        input: clone(input),
      });
      if (input.version !== row.version)
        throw new AuthFailure(
          409,
          "CONCURRENT_UPDATE",
          "A solicitação mudou. Atualize antes de tentar novamente.",
        );
      const oldStatus = row.status;
      row.status = rule.to;
      row.version++;
      row.updatedAt = new Date().toISOString();
      if (action === "confirm-completion") row.completedAt = row.updatedAt;
      row.events.push({
        id: randomUUID(),
        actor: rule.actor,
        previousStatus: oldStatus,
        newStatus: row.status,
        occurredAt: row.updatedAt,
        reason: input.reason ?? null,
        version: row.version,
      });
      return viewed(row);
    });
});
afterEach(() => jest.restoreAllMocks());
async function login() {
  await screen.findByLabelText("E-mail");
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
async function clientEntry() {
  await renderRouter(routes, { initialUrl: "/login" });
  await login();
  await screen.findByText("De que você precisa hoje?");
}
async function openForm() {
  await fireEvent.press(
    await screen.findByRole("button", {
      name: "Ver perfil de Marina Elétrica",
    }),
  );
  await fireEvent.press(
    await screen.findByRole("button", { name: "Solicitar serviço" }),
  );
  await screen.findByLabelText("Descrição do atendimento");
}
async function fillAndReview() {
  await fireEvent.press(
    screen.getByRole("radio", { name: "Instalação de tomadas" }),
  );
  await fireEvent.changeText(
    screen.getByLabelText("Descrição do atendimento"),
    "Preciso instalar duas tomadas na sala.",
  );
  await fireEvent.changeText(
    screen.getByLabelText("Bairro do atendimento"),
    "Centro",
  );
  await fireEvent.press(screen.getByText("Revisar solicitação"));
  await screen.findByRole("header", { name: "Revise sua solicitação" });
}
async function send() {
  await fillAndReview();
  await fireEvent.press(screen.getByText("Enviar solicitação"));
  await screen.findByText("Solicitação enviada.");
}
async function detail() {
  await fireEvent.press(
    await screen.findByRole("button", {
      name: /^Ver solicitação de Instalação de tomadas/,
    }),
  );
  await screen.findByRole("header", { name: "Detalhes da solicitação" });
}
async function confirm(title: string) {
  await fireEvent.press(screen.getByRole("button", { name: title }));
  await fireEvent.press(screen.getAllByRole("button", { name: title }).at(-1)!);
  await screen.findByText("Solicitação atualizada.");
}
async function switchAccount(provider: boolean) {
  if (auth.value.id === providerUserId)
    await fireEvent.press(screen.getByRole("button", { name: "Minha conta" }));
  else await testRouter.push("/client/profile");
  await fireEvent.press(await screen.findByText("Sair da conta"));
  await screen.findByText("Entrar na minha conta");
  auth.value = {
    id: provider ? providerUserId : clientId,
    email: provider ? "marina@example.test" : "pessoa@example.test",
    displayName: provider ? "Marina Elétrica" : "Pessoa Teste",
    profiles: { client: !provider, provider },
  };
  await fireEvent.press(screen.getByText("Entrar na minha conta"));
  await login();
  if (provider) {
    await screen.findByRole("header", { name: "Meu espaço profissional" });
    await fireEvent.press(screen.getByRole("button", { name: "Solicitações" }));
    await screen.findByRole("header", { name: "Solicitações recebidas" });
  } else {
    await screen.findByText("De que você precisa hoje?");
    await testRouter.push("/client/requests");
  }
}

test("client reviews and sends once, provider executes, client reopens then confirms and both see immutable history", async () => {
  await clientEntry();
  await openForm();
  await send();
  expect(createCalls).toHaveLength(1);
  expect(rows).toHaveLength(1);
  expect(
    [...storage.keys()].some((k) => k.startsWith("omini.requests.pending")),
  ).toBe(false);
  await detail();
  expect(screen.getByText("Cancelar solicitação")).toBeTruthy();
  await switchAccount(true);
  await detail();
  await confirm("Aceitar");
  await screen.findByText("Aceita");
  await confirm("Iniciar atendimento");
  await screen.findByText("Em andamento");
  await confirm("Informar conclusão");
  await screen.findByText("Aguardando confirmação");
  expect(screen.queryByText("Sim, confirmar conclusão")).toBeNull();
  await switchAccount(false);
  await detail();
  await screen.findByText("O serviço foi concluído?");
  await fireEvent.press(screen.getByText("Não, ainda precisa finalizar"));
  await fireEvent.press(
    screen
      .getAllByRole("button", { name: "Não, ainda precisa finalizar" })
      .at(-1)!,
  );
  expect(
    screen.getByText("Explique o que falta, em pelo menos 10 caracteres."),
  ).toBeTruthy();
  await fireEvent.changeText(
    screen.getByLabelText("Motivo da ação"),
    "A segunda tomada ainda precisa funcionar.",
  );
  await fireEvent.press(
    screen.getByRole("button", { name: "Tentar novamente" }),
  );
  await screen.findByText("Em andamento");
  await switchAccount(true);
  await detail();
  await confirm("Informar conclusão");
  await screen.findByText("Aguardando confirmação");
  await switchAccount(false);
  await detail();
  await confirm("Sim, confirmar conclusão");
  await screen.findByText("Concluída");
  await fireEvent.press(screen.getByText("Consultar histórico"));
  expect(await screen.findByRole("header", { name: "Histórico" })).toBeTruthy();
  expect(
    screen.getByText("A segunda tomada ainda precisa funcionar."),
  ).toBeTruthy();
  expect(rows[0].events).toHaveLength(7);
  expect(rows[0].completedAt).not.toBeNull();
  expect(screen.queryByText("Cancelar solicitação")).toBeNull();
});
test("guest request intent survives login and never creates before explicit review and confirmation", async () => {
  await renderRouter(routes);
  await fireEvent.press(screen.getByText("Explorar Omini"));
  await fireEvent.press(screen.getByText("Buscar profissionais reais"));
  await fireEvent.press(
    await screen.findByRole("button", {
      name: "Ver perfil de Marina Elétrica",
    }),
  );
  await fireEvent.press(
    await screen.findByRole("button", { name: "Solicitar serviço" }),
  );
  await screen.findByText("Que bom ter você aqui");
  expect(rows).toHaveLength(0);
  await login();
  await screen.findByLabelText("Descrição do atendimento");
  expect(rows).toHaveLength(0);
  await send();
  expect(rows).toHaveLength(1);
});
test("native back protects the new request draft and never submits on discard", async () => {
  await clientEntry();
  await openForm();
  await fireEvent.changeText(
    screen.getByLabelText("Descrição do atendimento"),
    "Descrição que não pode ser perdida.",
  );
  await act(async () => router.back());
  await fireEvent.press(await screen.findByText("Continuar editando"));
  expect(screen.getByLabelText("Descrição do atendimento")).toHaveDisplayValue(
    "Descrição que não pode ser perdida.",
  );
  await act(async () => router.back());
  await fireEvent.press(await screen.findByText("Descartar alterações"));
  expect(rows).toHaveLength(0);
});
test("uncertain committed creation is recovered from secure storage without a second POST", async () => {
  afterCommitFailure = true;
  await clientEntry();
  await openForm();
  await fillAndReview();
  await fireEvent.press(screen.getByText("Enviar solicitação"));
  await screen.findByText("Não foi possível confirmar a resposta do envio.");
  expect(rows).toHaveLength(1);
  expect(
    [...storage.keys()].some((k) => k.startsWith("omini.requests.pending")),
  ).toBe(true);
  await fireEvent.press(screen.getByText("Voltar às solicitações"));
  await fireEvent.press(await screen.findByText("Descartar alterações"));
  await fireEvent.press(await screen.findByText("Conferir envio pendente"));
  await fireEvent.press(await screen.findByText("Conferir e retomar envio"));
  await screen.findByText("Solicitação enviada.");
  expect(rows).toHaveLength(1);
  expect(createCalls).toHaveLength(1);
  expect(
    [...storage.keys()].some((k) => k.startsWith("omini.requests.pending")),
  ).toBe(false);
});
test("secure storage failure blocks sending and session expiration recovers the same private pending intent", async () => {
  await clientEntry();
  await openForm();
  await fillAndReview();
  storageFailure = true;
  await fireEvent.press(screen.getByText("Enviar solicitação"));
  await screen.findByText(
    "Não foi possível preparar o envio com segurança. Confira envios pendentes e tente novamente.",
  );
  expect(createCalls).toHaveLength(0);
  expect(screen.queryByText(/sensitive native/)).toBeNull();
  storageFailure = false;
  auth.forceUnauthorized = true;
  auth.failRefresh = new AuthFailure(401, "SESSION_EXPIRED", "Expired");
  await fireEvent.press(screen.getByText("Conferir e reenviar"));
  await screen.findByLabelText("Senha");
  expect(screen.getByText("Sua sessão expirou. Entre novamente.")).toBeTruthy();
  expect(rows).toHaveLength(0);
  auth.forceUnauthorized = false;
  auth.failRefresh = null;
  await login();
  await fireEvent.press(await screen.findByText("Conferir e retomar envio"));
  await screen.findByText("Solicitação enviada.");
  expect(rows).toHaveLength(1);
});
test("status filters, refresh and request detail native back keep professional footer and dashboard hierarchy", async () => {
  await clientEntry();
  await openForm();
  await send();
  await switchAccount(true);
  await fireEvent.press(screen.getByText("Filtrar por status"));
  await fireEvent.press(screen.getByRole("radio", { name: "Concluída" }));
  expect(
    await screen.findByText("Nenhuma solicitação encontrada"),
  ).toBeTruthy();
  await fireEvent.press(screen.getByRole("radio", { name: "Todos os status" }));
  await detail();
  expect(
    screen.getByRole("button", { name: "Solicitações", selected: true }),
  ).toBeTruthy();
  await act(async () => router.back());
  await screen.findByRole("header", { name: "Solicitações recebidas" });
  await act(async () => router.back());
  await screen.findByRole("header", { name: "Meu espaço profissional" });
  expect(screen).toHavePathname("/provider");
});
