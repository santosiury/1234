import * as ReactNative from "react-native";
import {
  act,
  fireEvent,
  renderRouter,
  screen,
  waitFor,
} from "expo-router/testing-library";
import { render } from "@testing-library/react-native";
import { AppState, Text, type AppStateStatus } from "react-native";
import { router } from "expo-router";
import * as SecureStore from "expo-secure-store";
import { randomUUID } from "node:crypto";
import {
  allowedRequestActions,
  type ServiceRequestDetail,
  type RequestParticipant,
  type AuthUser,
} from "@omini/shared";
import { AuthApi } from "../src/auth/api";
import { FakeAuthApi } from "./support/auth-fakes";
import { MarketplaceHttp } from "../src/marketplace/api";
import { RequestMonitor } from "../src/requests/notifications/monitor";
import {
  NoticeBanner,
  RequestCount,
} from "../src/requests/notifications/provider";
import { routes } from "./support/routes";
let auth: FakeAuthApi,
  rows: ServiceRequestDetail[],
  monitor: RequestMonitor | null,
  values: Map<string, string>;
let appState: AppStateStatus, listeners: Set<(state: AppStateStatus) => void>;
function captureMonitor(value: RequestMonitor) {
  monitor = value;
}
const originalState = Object.getOwnPropertyDescriptor(AppState, "currentState");
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));
function request(
  side: RequestParticipant = "provider",
  status: ServiceRequestDetail["status"] = "REQUESTED",
  version = 1,
): ServiceRequestDetail {
  return {
    id: randomUUID(),
    providerId: randomUUID(),
    providerServiceId: randomUUID(),
    viewer: side,
    status,
    version,
    clientNameSnapshot: "Pessoa privada",
    providerNameSnapshot: "Nome privado",
    serviceTitleSnapshot: "Serviço privado",
    description: "Descrição privada de teste",
    city: "Sombrio",
    state: "SC",
    neighborhood: "",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    acceptedAt: null,
    startedAt: null,
    completionProposedAt: null,
    completedAt: null,
    cancelledAt: null,
    allowedActions: allowedRequestActions(status, side),
    eventTotal: version,
    events: [],
  };
}
beforeEach(() => {
  auth = new FakeAuthApi();
  auth.value.profiles = { provider: true, client: false };
  rows = [];
  values = new Map();
  monitor = null;
  appState = "active";
  listeners = new Set();
  Object.defineProperty(AppState, "currentState", {
    configurable: true,
    get: () => appState,
  });
  jest
    .spyOn(AppState, "addEventListener")
    .mockImplementation((_type, listener) => {
      listeners.add(listener);
      return {
        remove: () => {
          listeners.delete(listener);
        },
      };
    });
  jest
    .mocked(SecureStore.getItemAsync)
    .mockImplementation(async (k) => values.get(k) ?? null);
  jest.mocked(SecureStore.setItemAsync).mockImplementation(async (k, v) => {
    values.set(k, v);
  });
  jest.mocked(SecureStore.deleteItemAsync).mockImplementation(async (k) => {
    values.delete(k);
  });
  for (const method of [
    "login",
    "refresh",
    "logout",
    "me",
    "register",
    "addProfile",
  ] as const)
    jest
      .spyOn(AuthApi.prototype, method)
      .mockImplementation(auth[method].bind(auth) as never);
  const original = RequestMonitor.prototype.setSession;
  jest
    .spyOn(RequestMonitor.prototype, "setSession")
    .mockImplementation(function (this: RequestMonitor, user: AuthUser | null) {
      captureMonitor(this);
      original.call(this, user);
    });
  jest
    .spyOn(MarketplaceHttp.prototype, "request")
    .mockImplementation(async (path, method = "GET", body) => {
      if (path === "provider/me")
        return {
          id: randomUUID(),
          professionalName: "Profissional",
          bio: null,
          isActive: true,
          services: [],
          areas: [],
        };
      if (path === "catalog/categories")
        return [
          {
            id: "20000000-0000-4000-8000-000000000001",
            slug: "eletrica",
            name: "Eletricista",
            isActive: true,
          },
        ];
      if (path.startsWith("catalog/providers?"))
        return { items: [], page: 1, pageSize: 10, total: 0 };
      if (
        path.startsWith("requests/received?") ||
        path.startsWith("requests/sent?")
      ) {
        const side = path.startsWith("requests/received")
            ? "provider"
            : "client",
          q = new URL(`http://fixture/${path}`).searchParams;
        const data = rows.filter(
          (r) =>
            r.viewer === side &&
            (!q.get("status") || r.status === q.get("status")),
        );
        return {
          items: clone(data.slice(0, Number(q.get("pageSize")))),
          total: data.length,
          page: 1,
          pageSize: Number(q.get("pageSize")),
        };
      }
      const [, id, action] = path.split("/");
      const row = rows.find((r) => r.id === id);
      if (row && method === "GET") return clone(row);
      if (
        row &&
        method === "POST" &&
        (action === "accept" || action === "reject")
      ) {
        row.status = action === "accept" ? "ACCEPTED" : "REJECTED";
        row.version++;
        row.eventTotal++;
        row.allowedActions = allowedRequestActions(row.status, row.viewer);
        return clone(row);
      }
      throw Error(`Unexpected test endpoint ${path} ${String(body)}`);
    });
});
afterEach(() => {
  monitor?.dispose();
  jest.restoreAllMocks();
  if (originalState)
    Object.defineProperty(AppState, "currentState", originalState);
});
async function login() {
  await renderRouter(routes, { initialUrl: "/login" });
  await fireEvent.changeText(
    screen.getByLabelText("E-mail"),
    "person@example.test",
  );
  await fireEvent.changeText(
    screen.getByLabelText("Senha"),
    "senha de teste segura",
  );
  await fireEvent.press(screen.getByText("Entrar"));
  await screen.findByRole("header", {
    name: auth.value.profiles.client
      ? "De que você precisa hoje?"
      : "Meu espaço profissional",
  });
  await act(async () => {
    await monitor?.refresh();
  });
}
async function poll() {
  await act(async () => {
    await monitor!.refresh();
  });
}
async function state(value: AppStateStatus) {
  appState = value;
  await act(async () => {
    listeners.forEach((fn) => fn(value));
  });
}
test("new provider notice and badge open the exact authorized detail, accept refreshes count and native back preserves the Stack", async () => {
  await login();
  const row = request();
  rows.push(row);
  await poll();
  await screen.findByText("Nova solicitação recebida!");
  expect(screen.getByRole("button", { name: "Solicitações" })).toHaveProp(
    "accessibilityValue",
    { text: "1 solicitação aguardando resposta" },
  );
  expect(screen.queryByText("Pessoa privada")).toBeNull();
  await fireEvent.press(
    screen.getByRole("button", { name: "Ver solicitação" }),
  );
  await screen.findByRole("header", { name: "Detalhes da solicitação" });
  expect(screen).toHavePathname(`/provider/requests/${row.id}`);
  await fireEvent.press(screen.getByRole("button", { name: "Aceitar" }));
  await fireEvent.press(
    screen.getAllByRole("button", { name: "Aceitar" }).at(-1)!,
  );
  await screen.findByText("Solicitação atualizada.");
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Solicitações" })).toHaveProp(
      "accessibilityValue",
      { text: "0 solicitações aguardando resposta" },
    ),
  );
  await act(async () => router.back());
  await screen.findByRole("header", { name: "Solicitações recebidas" });
  await act(async () => router.back());
  await screen.findByRole("header", { name: "Meu espaço profissional" });
});
test("dual-profile account stays in client mode until an explicit professional notice action and context confirmation", async () => {
  auth.value.profiles = { client: true, provider: true };
  await login();
  const row = request();
  rows.push(row);
  await poll();
  await screen.findByText("Nova solicitação recebida!");
  expect(screen).toHavePathname("/client");
  await fireEvent.press(
    screen.getByRole("button", { name: "Ver solicitação" }),
  );
  await screen.findByRole("header", { name: "Retomar solicitação" });
  await fireEvent.press(
    screen.getByRole("button", { name: "Continuar como prestador" }),
  );
  await screen.findByRole("header", { name: "Detalhes da solicitação" });
  expect(screen).toHavePathname(`/provider/requests/${row.id}`);
  expect(
    screen.getByRole("button", { name: "Solicitações", selected: true }),
  ).toBeTruthy();
});
test("foreground updates without a manual list visit and background suspends refresh", async () => {
  await login();
  await state("background");
  rows.push(request());
  await poll();
  expect(screen.queryByText("Nova solicitação recebida!")).toBeNull();
  await state("active");
  expect(await screen.findByText("Nova solicitação recebida!")).toBeTruthy();
  await fireEvent.press(screen.getByText("Dispensar aviso"));
  await poll();
  expect(screen.queryByText("Nova solicitação recebida!")).toBeNull();
});
test("new notices do not interrupt a dirty professional form and appear after leaving it", async () => {
  await login();
  await fireEvent.press(
    screen.getByRole("button", {
      name: "Meus serviços. Pendente. Abrir etapa.",
    }),
  );
  await fireEvent.press(await screen.findByText("Adicionar serviço"));
  await fireEvent.changeText(
    await screen.findByLabelText("Título do serviço"),
    "Meu rascunho protegido",
  );
  rows.push(request());
  await poll();
  expect(screen.queryByText("Nova solicitação recebida!")).toBeNull();
  expect(screen.getByLabelText("Título do serviço")).toHaveDisplayValue(
    "Meu rascunho protegido",
  );
  await act(async () => router.back());
  await fireEvent.press(await screen.findByText("Descartar alterações"));
  expect(await screen.findByText("Nova solicitação recebida!")).toBeTruthy();
});
test("client confirmation badge and notice lead to the real confirmation flow and viewing never resolves pending action", async () => {
  auth.value.profiles = { client: true, provider: false };
  const row = request("client");
  rows.push(row);
  await login();
  row.status = "AWAITING_CONFIRMATION";
  row.version = 4;
  row.eventTotal = 4;
  row.allowedActions = allowedRequestActions(row.status, "client");
  await poll();
  expect(
    await screen.findByText("Confirme a conclusão do serviço"),
  ).toBeTruthy();
  expect(
    screen.getByLabelText("Solicitações, 1 aguardando sua confirmação"),
  ).toBeTruthy();
  await fireEvent.press(
    screen.getByRole("button", { name: "Ver solicitação" }),
  );
  await screen.findByText("O serviço foi concluído?");
  expect(monitor!.state.clientPending).toBe(1);
  expect(screen).toHavePathname(`/client/requests/${row.id}`);
});
test("banner actions and exact count remain accessible without fixed single-line text, including large counts", async () => {
  const onOpen = jest.fn(),
    onDismiss = jest.fn();
  await render(
    <>
      <NoticeBanner
        notice={{
          key: "test",
          side: "provider",
          id: randomUUID(),
          version: 1,
          title: "Nova solicitação recebida!",
          message: "Você recebeu um novo pedido de serviço.",
        }}
        onOpen={onOpen}
        onDismiss={onDismiss}
        maxHeight={260}
      />
      <RequestCount count={123} />
      <Text>other content</Text>
    </>,
  );
  expect(
    screen.getByLabelText(
      "Nova solicitação recebida!. Você recebeu um novo pedido de serviço.",
    ),
  ).toBeTruthy();
  expect(screen.getByText("99+")).toBeTruthy();
  await fireEvent.press(
    screen.getByRole("button", { name: "Ver solicitação" }),
  );
  await fireEvent.press(
    screen.getByRole("button", { name: "Dispensar aviso" }),
  );
  expect(onOpen).toHaveBeenCalledTimes(1);
  expect(onDismiss).toHaveBeenCalledTimes(1);
});

test("large-text professional navigation exposes the full count to VoiceOver while the visual badge is bounded", async () => {
  jest
    .spyOn(ReactNative, "useWindowDimensions")
    .mockReturnValue({ width: 320, height: 568, scale: 2, fontScale: 2 });
  rows.push(...Array.from({ length: 123 }, () => request()));
  await login();
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Solicitações" })).toHaveProp(
      "accessibilityValue",
      { text: "123 solicitações aguardando resposta" },
    ),
  );
  expect(screen.getByText("99+")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Dispensar aviso" })).toBeTruthy();
  await fireEvent.press(
    screen.getByRole("button", { name: "Dispensar aviso" }),
  );
  expect(screen.getByRole("button", { name: "Painel" })).toBeTruthy();
});

test("returning to foreground refreshes the focused received list and keeps answered requests with their new status", async () => {
  await login();
  await fireEvent.press(screen.getByRole("button", { name: "Solicitações" }));
  await screen.findByText("Nenhuma solicitação encontrada");
  await state("background");
  const row = request();
  rows.push(row);
  await state("active");
  await screen.findByRole("button", {
    name: /^Ver solicitação de Serviço privado/,
  });
  expect(screen.queryByText("Nenhuma solicitação encontrada")).toBeNull();
  await state("background");
  row.status = "ACCEPTED";
  row.version = 2;
  row.allowedActions = allowedRequestActions(row.status, "provider");
  await state("active");
  expect(await screen.findByText("Aceita")).toBeTruthy();
});
