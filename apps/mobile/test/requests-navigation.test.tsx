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
  CANCELLATION_REASON_LABELS,
  allowedRequestActions,
  type CreateRequestInput,
  type PublicProvider,
  type ServiceRequestDetail,
  type RequestAction,
  type RequestActionInput,
  type CancelRequestInput,
} from "@omini/shared";
import { RequestsApi } from "../src/requests/api";
import { AuthApi, AuthFailure } from "../src/auth/api";
import { MarketplaceHttp } from "../src/marketplace/api";
import { FakeAuthApi } from "./support/auth-fakes";
import { routes } from "./support/routes";
import { pendingRequests } from "../src/requests/pending";
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
  actionCalls: {
    action: RequestAction;
    input: RequestActionInput | CancelRequestInput;
  }[],
  forcedActions: RequestAction[] | undefined,
  afterCommitFailure: boolean,
  storageFailure: boolean;
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));
function viewed(row: ServiceRequestDetail): ServiceRequestDetail {
  const viewer = auth.value.id === providerUserId ? "provider" : "client";
  return {
    ...clone(row),
    eventTotal: row.version,
    viewer,
    allowedActions: forcedActions ?? allowedRequestActions(row.status, viewer),
  };
}
const originalAreas = clone(person.areas);
beforeEach(() => {
  person.areas = clone(originalAreas);
  auth = new FakeAuthApi();
  storage = new Map();
  rows = [];
  keys = new Map();
  createCalls = [];
  actionCalls = [];
  forcedActions = undefined;
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
          neighborhood: "",
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
      const input = body as RequestActionInput | CancelRequestInput,
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
      if (action === "accept") row.acceptedAt = row.updatedAt;
      if (action === "start") row.startedAt = row.updatedAt;
      if (action === "propose-completion")
        row.completionProposedAt = row.updatedAt;
      if (action === "confirm-completion") row.completedAt = row.updatedAt;
      if (action === "cancel") row.cancelledAt = row.updatedAt;
      const cancellation = "reasonCode" in input ? input : null;
      row.events.push({
        id: randomUUID(),
        actor:
          rule.actor === "either"
            ? auth.value.id === providerUserId
              ? "provider"
              : "client"
            : rule.actor,
        previousStatus: oldStatus,
        newStatus: row.status,
        occurredAt: row.updatedAt,
        reason:
          input.reason ??
          (cancellation
            ? CANCELLATION_REASON_LABELS[cancellation.reasonCode]
            : null),
        ...(cancellation
          ? {
              reasonCode: cancellation.reasonCode,
              executionContext: cancellation.executionContext ?? null,
            }
          : {}),
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
  expect(screen.queryByLabelText("Bairro do atendimento")).toBeNull();
  expect(screen.queryByLabelText("Cidade do atendimento")).toBeNull();
  expect(screen.queryByLabelText("Estado do atendimento")).toBeNull();
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
test("provider can cancel after acceptance, and the confirmed status/history survive a failed refresh", async () => {
  await clientEntry();
  await openForm();
  await send();
  await switchAccount(true);
  await detail();
  await confirm("Aceitar");
  const version = rows[0].version;
  jest.spyOn(RequestsApi.prototype, "detail").mockImplementation(async () => {
    if (rows[0].status === "CANCELLED")
      throw new AuthFailure(0, "NETWORK_ERROR", "Atualização indisponível.");
    return viewed(rows[0]);
  });
  await fireEvent.press(
    screen.getByRole("button", { name: "Cancelar solicitação" }),
  );
  expect(
    screen.queryByRole("radio", { name: "Não preciso mais deste atendimento" }),
  ).toBeNull();
  await fireEvent.press(
    screen.getByRole("radio", {
      name: "Não chegamos a um acordo sobre o valor",
    }),
  );
  await fireEvent.press(
    screen.getByRole("button", { name: "Revisar cancelamento" }),
  );
  expect(actionCalls.filter((call) => call.action === "cancel")).toHaveLength(
    0,
  );
  await fireEvent.press(
    screen.getByRole("button", { name: "Confirmar cancelamento" }),
  );
  await screen.findByText("Solicitação cancelada.");
  expect(screen.getByText("Cancelada")).toBeTruthy();
  expect(
    screen.queryByRole("button", { name: "Cancelar solicitação" }),
  ).toBeNull();
  expect(screen.queryByText("Iniciar atendimento")).toBeNull();
  expect(actionCalls.at(-1)).toMatchObject({
    action: "cancel",
    input: {
      version,
      reasonCode: "PRICE_DISAGREEMENT",
      confirmed: true,
      idempotencyKey: expect.stringMatching(/^[0-9a-f-]{36}$/),
    },
  });
  expect(actionCalls.at(-1)!.input).not.toHaveProperty("reason");
  await fireEvent.press(screen.getByText("Consultar histórico"));
  expect(
    await screen.findByText("Não chegamos a um acordo sobre o valor"),
  ).toBeTruthy();
  expect(rows[0].events.at(-1)).toMatchObject({
    actor: "provider",
    newStatus: "CANCELLED",
    reasonCode: "PRICE_DISAGREEMENT",
  });
});

test("client cancels an in-progress service with execution context and sees it in immutable history", async () => {
  await clientEntry();
  await openForm();
  await send();
  await switchAccount(true);
  await detail();
  await confirm("Aceitar");
  await confirm("Iniciar atendimento");
  await switchAccount(false);
  await detail();
  await fireEvent.press(
    screen.getByRole("button", { name: "Cancelar solicitação" }),
  );
  await fireEvent.press(
    screen.getByRole("radio", { name: "Não preciso mais deste atendimento" }),
  );
  await fireEvent.press(
    screen.getByRole("button", { name: "Revisar cancelamento" }),
  );
  expect(actionCalls.filter((call) => call.action === "cancel")).toHaveLength(
    0,
  );
  expect(screen.getByRole("alert")).toHaveTextContent(
    /Informe a situação de execução/,
  );
  await fireEvent.press(
    screen.getByRole("radio", { name: "Trabalho parcialmente executado" }),
  );
  await fireEvent.press(
    screen.getByRole("button", { name: "Revisar cancelamento" }),
  );
  await fireEvent.press(
    screen.getByRole("button", { name: "Confirmar cancelamento" }),
  );
  await screen.findByText("Solicitação cancelada.");
  expect(actionCalls.at(-1)).toMatchObject({
    action: "cancel",
    input: {
      reasonCode: "SERVICE_NO_LONGER_NEEDED",
      executionContext: "PARTIAL",
      confirmed: true,
    },
  });
  expect(screen.queryByText("Avalie o atendimento")).toBeNull();
  await fireEvent.press(screen.getByText("Consultar histórico"));
  expect(
    await screen.findByText(
      "Situação informada: Trabalho parcialmente executado",
    ),
  ).toBeTruthy();
  expect(rows[0].events.at(-1)).toMatchObject({
    actor: "client",
    previousStatus: "IN_PROGRESS",
    newStatus: "CANCELLED",
    executionContext: "PARTIAL",
  });
});

test("API allowedActions, rather than local eligibility, controls whether cancellation is offered", async () => {
  await clientEntry();
  await openForm();
  await send();
  rows[0].status = "ACCEPTED";
  forcedActions = [];
  await detail();
  expect(screen.getByText("Aceita")).toBeTruthy();
  expect(screen.queryByText("Cancelar solicitação")).toBeNull();
});

test("the client REQUESTED route reaches the structured dialog and never sends the legacy optional-reason body", async () => {
  await clientEntry();
  await openForm();
  await send();
  await detail();
  await fireEvent.press(
    screen.getByRole("button", { name: "Cancelar solicitação" }),
  );
  expect(screen.queryByLabelText("Motivo da ação")).toBeNull();
  expect(
    screen.queryByText(/encerra a solicitação antes do início/),
  ).toBeNull();
  await fireEvent.press(
    screen.getByRole("radio", { name: "Não preciso mais deste atendimento" }),
  );
  await fireEvent.press(
    screen.getByRole("button", { name: "Revisar cancelamento" }),
  );
  expect(actionCalls).toHaveLength(0);
  await fireEvent.press(
    screen.getByRole("button", { name: "Confirmar cancelamento" }),
  );
  await screen.findByText("Solicitação cancelada.");
  expect(actionCalls.at(-1)).toMatchObject({
    action: "cancel",
    input: {
      reasonCode: "SERVICE_NO_LONGER_NEEDED",
      confirmed: true,
      version: 1,
    },
  });
});

test.each(["client", "provider"] as const)(
  "the %s route cancels AWAITING_CONFIRMATION with the current execution contract",
  async (side) => {
    await clientEntry();
    await openForm();
    await send();
    await switchAccount(true);
    await detail();
    await confirm("Aceitar");
    await confirm("Iniciar atendimento");
    await confirm("Informar conclusão");
    if (side === "client") {
      await switchAccount(false);
      await detail();
    }
    expect(
      screen.queryByText(/cancelamento após o início não está disponível/),
    ).toBeNull();
    await fireEvent.press(
      screen.getByRole("button", { name: "Cancelar solicitação" }),
    );
    await fireEvent.press(
      screen.getByRole("radio", {
        name: "Não chegamos a um acordo sobre o valor",
      }),
    );
    await fireEvent.press(
      screen.getByRole("radio", { name: "Situação de execução contestada" }),
    );
    await fireEvent.press(
      screen.getByRole("button", { name: "Revisar cancelamento" }),
    );
    await fireEvent.press(
      screen.getByRole("button", { name: "Confirmar cancelamento" }),
    );
    await screen.findByText("Solicitação cancelada.");
    expect(actionCalls.at(-1)).toMatchObject({
      action: "cancel",
      input: {
        reasonCode: "PRICE_DISAGREEMENT",
        executionContext: "DISPUTED",
        confirmed: true,
      },
    });
    expect(rows[0].events.at(-1)).toMatchObject({
      actor: side,
      newStatus: "CANCELLED",
    });
  },
);

test("an expired cancellation session returns to login without a mutation and does not auto-replay after signing in", async () => {
  await clientEntry();
  await openForm();
  await send();
  await detail();
  await fireEvent.press(
    screen.getByRole("button", { name: "Cancelar solicitação" }),
  );
  await fireEvent.press(
    screen.getByRole("radio", {
      name: "Não chegamos a um acordo sobre o valor",
    }),
  );
  await fireEvent.press(
    screen.getByRole("button", { name: "Revisar cancelamento" }),
  );
  auth.forceUnauthorized = true;
  auth.failRefresh = new AuthFailure(
    401,
    "SESSION_EXPIRED",
    "Sua sessão expirou. Entre novamente.",
  );
  await fireEvent.press(
    screen.getByRole("button", { name: "Confirmar cancelamento" }),
  );
  await screen.findByLabelText("Senha");
  expect(screen.getByText("Sua sessão expirou. Entre novamente.")).toBeTruthy();
  expect(actionCalls).toHaveLength(0);
  auth.forceUnauthorized = false;
  auth.failRefresh = null;
  await login();
  await screen.findByText("De que você precisa hoje?");
  await testRouter.push("/client/requests");
  await detail();
  await screen.findByRole("header", { name: "Detalhes da solicitação" });
  expect(rows[0].status).toBe("REQUESTED");
  expect(actionCalls).toHaveLength(0);
});

test("a cancellation version conflict reloads the request before a new reviewed intent can be sent", async () => {
  await clientEntry();
  await openForm();
  await send();
  await detail();
  await fireEvent.press(
    screen.getByRole("button", { name: "Cancelar solicitação" }),
  );
  await fireEvent.press(
    screen.getByRole("radio", {
      name: "Não chegamos a um acordo sobre o valor",
    }),
  );
  await fireEvent.press(
    screen.getByRole("button", { name: "Revisar cancelamento" }),
  );
  rows[0].status = "ACCEPTED";
  rows[0].version++;
  await fireEvent.press(
    screen.getByRole("button", { name: "Confirmar cancelamento" }),
  );
  await screen.findByText(
    "A solicitação mudou. Atualize antes de tentar novamente.",
  );
  expect(
    screen.queryByRole("header", { name: "Confirmar cancelamento?" }),
  ).toBeNull();
  await screen.findByText("Aceita");
  const first = actionCalls.at(-1)!.input;
  await fireEvent.press(
    screen.getByRole("button", { name: "Cancelar solicitação" }),
  );
  await fireEvent.press(
    screen.getByRole("radio", {
      name: "Não chegamos a um acordo sobre o valor",
    }),
  );
  await fireEvent.press(
    screen.getByRole("button", { name: "Revisar cancelamento" }),
  );
  await fireEvent.press(
    screen.getByRole("button", { name: "Confirmar cancelamento" }),
  );
  await screen.findByText("Solicitação cancelada.");
  expect(actionCalls.at(-1)!.input.version).toBe(first.version + 1);
  expect(actionCalls.at(-1)!.input.idempotencyKey).not.toBe(
    first.idempotencyKey,
  );
});

test.each(["COMPLETED", "REJECTED", "CANCELLED"] as const)(
  "terminal %s never exposes mutation actions, including a stale cancel hint",
  async (status) => {
    await clientEntry();
    await openForm();
    await send();
    rows[0].status = status;
    forcedActions = ["cancel"];
    await detail();
    expect(screen.queryByText("Cancelar solicitação")).toBeNull();
    expect(actionCalls).toHaveLength(0);
  },
);

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

test("search context in a different municipality reaches review and POST without collecting city, UF or district again", async () => {
  person.areas.push({
    ...person.areas[0],
    id: randomUUID(),
    city: "Criciúma",
    neighborhood: "Próspera",
  });
  await clientEntry();
  await testRouter.push("/client/search");
  await fireEvent.press(await screen.findByText("Filtrar por localidade"));
  await fireEvent.changeText(
    screen.getByLabelText("Filtrar cidade"),
    "Criciúma",
  );
  await fireEvent.press(screen.getByText("Pesquisar profissionais"));
  expect(screen.queryByLabelText("Filtrar bairro")).toBeNull();
  await openForm();
  expect(screen.getByText("Atendimento em Criciúma, SC")).toBeTruthy();
  expect(
    screen.queryByRole("radiogroup", { name: "Cidade de atendimento" }),
  ).toBeNull();
  await send();
  expect(createCalls[0]).toMatchObject({ city: "Criciúma", state: "SC" });
  expect(createCalls[0]).not.toHaveProperty("neighborhood");
});
test("missing search context presents only deduplicated active served cities and never defaults universally to Araranguá", async () => {
  person.areas = [
    { ...person.areas[0], city: "Criciúma", neighborhood: "Próspera" },
    {
      ...person.areas[0],
      id: "50000000-0000-4000-8000-000000000002",
      city: "CRICIUMA",
      neighborhood: "Centro",
      isActive: false,
    },
    {
      ...person.areas[0],
      id: "50000000-0000-4000-8000-000000000003",
      city: "Sombrio",
    },
  ];
  await clientEntry();
  await act(async () =>
    router.push({
      pathname: "/service-request/new",
      params: { providerId: person.id },
    }),
  );
  await screen.findByRole("radio", { name: "Criciúma, SC" });
  expect(
    screen
      .getAllByRole("radio")
      .filter((r) => r.props.accessibilityLabel?.includes(", SC")),
  ).toHaveLength(2);
  await fireEvent.press(
    screen.getByRole("radio", { name: "Instalação de tomadas" }),
  );
  await fireEvent.changeText(
    screen.getByLabelText("Descrição do atendimento"),
    "Preciso instalar duas tomadas na sala.",
  );
  await fireEvent.press(screen.getByText("Revisar solicitação"));
  expect(
    screen.getByText(
      "Escolha o serviço e uma cidade atendida, e descreva o que precisa em 10 a 1000 caracteres.",
    ),
  ).toBeTruthy();
  expect(createCalls).toHaveLength(0);
  await fireEvent.press(screen.getByRole("radio", { name: "Sombrio, SC" }));
  await fireEvent.press(screen.getByText("Revisar solicitação"));
  expect(await screen.findByText("Atendimento em Sombrio, SC")).toBeTruthy();
  await fireEvent.press(screen.getByText("Enviar solicitação"));
  await screen.findByText("Solicitação enviada.");
  expect(createCalls[0]).toMatchObject({ city: "Sombrio", state: "SC" });
  expect(createCalls[0]).not.toHaveProperty("neighborhood");
});
test("forged or stale city context cannot become an arbitrary request location", async () => {
  await clientEntry();
  await act(async () =>
    router.push({
      pathname: "/service-request/new",
      params: { providerId: person.id, city: "Porto Alegre", state: "RS" },
    }),
  );
  await screen.findByText(
    "A cidade da busca não está entre as cidades atendidas. Escolha uma opção disponível antes de continuar.",
  );
  expect(screen.queryByText("Atendimento em Porto Alegre, RS")).toBeNull();
  expect(
    screen.getByRole("radio", { name: "Araranguá, SC", checked: false }),
  ).toBeTruthy();
  await fireEvent.press(screen.getByRole("radio", { name: "Araranguá, SC" }));
  await send();
  expect(createCalls[0]).toMatchObject({ city: "Araranguá", state: "SC" });
});
test("guest login keeps the selected non-pilot municipality through authentication without sending automatically", async () => {
  person.areas = [{ ...person.areas[0], city: "Sombrio" }];
  await renderRouter(routes, {
    initialUrl: `/service-request/new?providerId=${person.id}&city=Sombrio&state=SC`,
  });
  await screen.findByText("Que bom ter você aqui");
  expect(createCalls).toHaveLength(0);
  await login();
  expect(await screen.findByText("Atendimento em Sombrio, SC")).toBeTruthy();
  expect(screen.queryByLabelText("Cidade do atendimento")).toBeNull();
  expect(createCalls).toHaveLength(0);
  await send();
  expect(createCalls[0].city).toBe("Sombrio");
});
test("legacy pending payload is read without mutation or automatic submission and recovery keeps its original key and district", async () => {
  await clientEntry();
  const input: CreateRequestInput = {
    providerId: person.id,
    providerServiceId: person.services[0].id,
    description: "Preciso instalar duas tomadas na sala.",
    city: "Araranguá",
    state: "SC",
    neighborhood: "Polícia rodoviária",
    idempotencyKey: randomUUID(),
  };
  await pendingRequests.write(clientId, { input });
  const before = new Map(storage);
  await act(async () =>
    router.push({
      pathname: "/service-request/new",
      params: { providerId: person.id },
    }),
  );
  await screen.findByText("Conferir envio pendente");
  expect(screen.queryByText(/Polícia rodoviária/)).toBeNull();
  expect(createCalls).toHaveLength(0);
  expect(storage).toEqual(before);
  await fireEvent.press(screen.getByText("Conferir e retomar envio"));
  await screen.findByText("Solicitação enviada.");
  expect(createCalls).toEqual([input]);
  expect(rows).toHaveLength(1);
  rows[0].neighborhood = "Polícia rodoviária";
  await detail();
  expect(screen.queryByText(/Polícia rodoviária/)).toBeNull();
});
