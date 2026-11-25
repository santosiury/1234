import { act, fireEvent, render, screen } from "@testing-library/react-native";
import {
  CANCELLATION_REASON_LABELS,
  type CancelRequestInput,
  type RequestParticipant,
  type RequestStatus,
  type ServiceRequestDetail,
} from "@omini/shared";
import { CancellationDialog } from "../src/requests/CancellationDialog";
import { RequestsApi, isRequestDetail } from "../src/requests/api";
import { MarketplaceHttp } from "../src/marketplace/api";
import { AuthFailure } from "../src/auth/api";
import { SessionManager } from "../src/auth/session-manager";
import { FakeAuthApi, FakeStorage } from "./support/auth-fakes";

afterEach(() => jest.restoreAllMocks());

function request(
  viewer: RequestParticipant = "client",
  status: RequestStatus = "ACCEPTED",
): ServiceRequestDetail {
  return {
    id: "10000000-0000-4000-8000-000000000001",
    providerId: "20000000-0000-4000-8000-000000000001",
    providerServiceId: "30000000-0000-4000-8000-000000000001",
    clientNameSnapshot: "Cliente de teste",
    providerNameSnapshot: "Prestador de teste",
    serviceTitleSnapshot: "Instalação",
    description: "Descrição do atendimento de teste.",
    city: "Araranguá",
    state: "SC",
    neighborhood: "",
    viewer,
    status,
    version: 4,
    allowedActions: ["cancel"],
    createdAt: "2026-11-20T12:00:00.000Z",
    updatedAt: "2026-11-20T12:00:00.000Z",
    acceptedAt: status === "REQUESTED" ? null : "2026-11-20T12:00:00.000Z",
    startedAt: ["IN_PROGRESS", "AWAITING_CONFIRMATION"].includes(status)
      ? "2026-11-20T12:00:00.000Z"
      : null,
    completionProposedAt: null,
    completedAt: null,
    cancelledAt: null,
    eventTotal: 1,
    events: [],
  };
}
async function dialog(row = request()) {
  const cancel = jest.fn(
    async (
      id: string,
      input: CancelRequestInput,
    ): Promise<ServiceRequestDetail> => ({
      ...row,
      id,
      version: input.version + 1,
      status: "CANCELLED",
      allowedActions: [],
      cancelledAt: "2026-11-21T12:00:00.000Z",
    }),
  );
  const onClose = jest.fn(),
    onSuccess = jest.fn(),
    onInvalidated = jest.fn();
  await render(
    <CancellationDialog
      request={row}
      api={{ cancel }}
      onClose={onClose}
      onSuccess={onSuccess}
      onInvalidated={onInvalidated}
    />,
  );
  return { cancel, onClose, onSuccess, onInvalidated };
}
const choosePrice = () =>
  fireEvent.press(
    screen.getByRole("radio", {
      name: CANCELLATION_REASON_LABELS.PRICE_DISAGREEMENT,
    }),
  );
async function review() {
  await fireEvent.press(
    screen.getByRole("button", { name: "Revisar cancelamento" }),
  );
}
async function confirm() {
  await fireEvent.press(
    screen.getByRole("button", { name: "Confirmar cancelamento" }),
  );
}

test.each(["client", "provider"] as const)(
  "%s sees original participant reasons, single selection and an explicit confirmation before POST",
  async (viewer) => {
    const row = request(viewer),
      mock = await dialog(row);
    expect(screen.getAllByRole("radio")[0].props.accessibilityLabel).toBe(
      CANCELLATION_REASON_LABELS.PRICE_DISAGREEMENT,
    );
    const roleReason =
      viewer === "client"
        ? "Não preciso mais deste atendimento"
        : "Não consigo realizar este atendimento";
    const otherRoleReason =
      viewer === "client"
        ? "Não consigo realizar este atendimento"
        : "Não preciso mais deste atendimento";
    expect(screen.getByRole("radio", { name: roleReason })).toBeTruthy();
    expect(screen.queryByRole("radio", { name: otherRoleReason })).toBeNull();
    await review();
    expect(mock.cancel).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(/Selecione um motivo/);
    await fireEvent.press(screen.getByRole("radio", { name: roleReason }));
    await choosePrice();
    expect(
      screen.getByRole("radio", { name: roleReason, checked: false }),
    ).toBeTruthy();
    await review();
    expect(mock.cancel).not.toHaveBeenCalled();
    expect(
      screen.getByRole("header", { name: "Confirmar cancelamento?" }),
    ).toBeTruthy();
    await confirm();
    expect(mock.cancel).toHaveBeenCalledTimes(1);
    expect(mock.cancel.mock.calls[0]).toEqual([
      row.id,
      {
        version: 4,
        idempotencyKey: expect.stringMatching(/^[0-9a-f-]{36}$/),
        reasonCode: "PRICE_DISAGREEMENT",
        confirmed: true,
      },
    ]);
    expect(mock.onSuccess).toHaveBeenCalledWith(
      expect.objectContaining({ status: "CANCELLED", allowedActions: [] }),
    );
  },
);

test("client cancellation in REQUESTED uses the supported structured body without execution context", async () => {
  const mock = await dialog(request("client", "REQUESTED"));
  await choosePrice();
  await review();
  await confirm();
  expect(mock.cancel.mock.calls[0][1]).toMatchObject({
    reasonCode: "PRICE_DISAGREEMENT",
    confirmed: true,
  });
  expect(mock.cancel.mock.calls[0][1]).not.toHaveProperty("executionContext");
});

test.each([
  ["client", "IN_PROGRESS"],
  ["provider", "IN_PROGRESS"],
  ["client", "AWAITING_CONFIRMATION"],
  ["provider", "AWAITING_CONFIRMATION"],
] as const)(
  "%s in %s must declare execution before cancelling and may report partial work",
  async (viewer, status) => {
    const mock = await dialog(request(viewer, status));
    await choosePrice();
    await review();
    expect(screen.getByRole("alert")).toHaveTextContent(
      /Informe a situação de execução/,
    );
    expect(mock.cancel).not.toHaveBeenCalled();
    await fireEvent.press(
      screen.getByRole("radio", { name: "Trabalho parcialmente executado" }),
    );
    await review();
    await confirm();
    expect(mock.cancel.mock.calls[0][1]).toMatchObject({
      executionContext: "PARTIAL",
      confirmed: true,
    });
  },
);

test("recorded start requires context even if the supplied status is ACCEPTED", async () => {
  const mock = await dialog({
    ...request(),
    startedAt: "2026-11-20T12:00:00.000Z",
  });
  await choosePrice();
  await review();
  expect(mock.cancel).not.toHaveBeenCalled();
  await fireEvent.press(
    screen.getByRole("radio", { name: "Nenhum trabalho executado" }),
  );
  await review();
  await confirm();
  expect(mock.cancel.mock.calls[0][1]).toMatchObject({
    executionContext: "NONE",
  });
});

test.each(["Execução integral alegada", "Situação de execução contestada"])(
  "execution declaration '%s' does not silently block unilateral cancellation",
  async (label) => {
    const mock = await dialog(request("provider", "IN_PROGRESS"));
    await choosePrice();
    await fireEvent.press(screen.getByRole("radio", { name: label }));
    await review();
    await confirm();
    expect(mock.cancel.mock.calls[0][1].executionContext).toBe(
      label === "Execução integral alegada" ? "FULL_CLAIMED" : "DISPUTED",
    );
  },
);

test("OTHER validates length and privacy, normalizes text and does not leak it into a predefined reason", async () => {
  const mock = await dialog();
  await fireEvent.press(screen.getByRole("radio", { name: "Outro motivo" }));
  for (const text of [
    "curto",
    "x".repeat(501),
    "Contato pessoa@example.test",
    "<texto privado>",
  ]) {
    await fireEvent.changeText(
      screen.getByLabelText("Descreva o outro motivo"),
      text,
    );
    await review();
    expect(mock.cancel).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(/10 a 500 caracteres/);
  }
  await fireEvent.changeText(
    screen.getByLabelText("Descreva o outro motivo"),
    "  Preciso rever a organizac\u0327a\u0303o do atendimento.  ",
  );
  await review();
  await confirm();
  expect(mock.cancel.mock.calls[0][1]).toMatchObject({
    reasonCode: "OTHER",
    reason: "Preciso rever a organização do atendimento.",
  });
});

test("switching from OTHER to a predefined reason omits the unused description", async () => {
  const mock = await dialog();
  await fireEvent.press(screen.getByRole("radio", { name: "Outro motivo" }));
  await fireEvent.changeText(
    screen.getByLabelText("Descreva o outro motivo"),
    "Uma descrição que não será enviada.",
  );
  await choosePrice();
  await review();
  await confirm();
  expect(mock.cancel.mock.calls[0][1]).not.toHaveProperty("reason");
});

test("closing a cancellation before confirmation never sends it", async () => {
  const mock = await dialog();
  await choosePrice();
  await review();
  await fireEvent.press(
    screen.getByRole("button", { name: "Voltar sem cancelar" }),
  );
  expect(mock.onClose).toHaveBeenCalledTimes(1);
  expect(mock.cancel).not.toHaveBeenCalled();
});

test("an uncertain response keeps exact key, version, reason and context and only repeats the same intent", async () => {
  const mock = await dialog(request("provider", "IN_PROGRESS"));
  mock.cancel.mockRejectedValueOnce(
    new AuthFailure(
      0,
      "NETWORK_ERROR",
      "Não foi possível confirmar a resposta.",
    ),
  );
  await choosePrice();
  await fireEvent.press(
    screen.getByRole("radio", { name: "Trabalho parcialmente executado" }),
  );
  await review();
  await confirm();
  expect(screen.queryByRole("radio")).toBeNull();
  expect(screen.queryByText("Revisar motivo")).toBeNull();
  await fireEvent.press(
    screen.getByRole("button", { name: "Repetir cancelamento" }),
  );
  expect(mock.cancel).toHaveBeenCalledTimes(2);
  expect(mock.cancel.mock.calls[1][1]).toEqual(mock.cancel.mock.calls[0][1]);
  expect(mock.onSuccess).toHaveBeenCalledTimes(1);
});

test("an in-flight confirmation cannot create a second request or close the dialog", async () => {
  const mock = await dialog();
  let resolve!: (value: ServiceRequestDetail) => void;
  mock.cancel.mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  await choosePrice();
  await review();
  await confirm();
  expect(
    screen.getByRole("button", { name: "Voltar sem cancelar" }),
  ).toBeDisabled();
  await confirm();
  expect(mock.cancel).toHaveBeenCalledTimes(1);
  await act(async () =>
    resolve({ ...request(), status: "CANCELLED", allowedActions: [] }),
  );
});

test("503 is contextualized as request-service unavailability and retains the same cancellation intent", async () => {
  const mock = await dialog();
  mock.cancel.mockRejectedValueOnce(
    new AuthFailure(
      503,
      "REQUESTS_UNAVAILABLE",
      "As solicitações estão temporariamente indisponíveis. Tente novamente.",
    ),
  );
  await choosePrice();
  await review();
  await confirm();
  expect(screen.getByRole("alert")).toHaveTextContent(
    /o serviço de solicitações está indisponível/,
  );
  expect(screen.getByText("Resposta da API: HTTP 503")).toBeTruthy();
  expect(mock.onSuccess).not.toHaveBeenCalled();
  await fireEvent.press(
    screen.getByRole("button", { name: "Repetir cancelamento" }),
  );
  expect(mock.cancel.mock.calls[1][1]).toEqual(mock.cancel.mock.calls[0][1]);
});

test.each([403, 404, 409])(
  "HTTP %s closes the stale intent through the parent and requests an authoritative refresh",
  async (status) => {
    const mock = await dialog();
    mock.cancel.mockRejectedValueOnce(
      new AuthFailure(
        status,
        "CONCURRENT_UPDATE",
        "A solicitação mudou. Atualize antes de tentar novamente.",
      ),
    );
    await choosePrice();
    await review();
    await confirm();
    expect(mock.onInvalidated).toHaveBeenCalledTimes(1);
    expect(mock.onSuccess).not.toHaveBeenCalled();
  },
);

test("validation rejection allows correction with a new key; raw exceptions never reach feedback", async () => {
  const mock = await dialog();
  mock.cancel.mockRejectedValueOnce(
    new AuthFailure(400, "VALIDATION_ERROR", "Confira os campos."),
  );
  await choosePrice();
  await review();
  await confirm();
  expect(
    screen.getByRole("radio", {
      name: CANCELLATION_REASON_LABELS.PRICE_DISAGREEMENT,
    }),
  ).toBeTruthy();
  mock.cancel.mockRejectedValueOnce(
    new Error("private-driver-detail fixture-secret"),
  );
  await review();
  await confirm();
  expect(mock.cancel.mock.calls[1][1].idempotencyKey).not.toBe(
    mock.cancel.mock.calls[0][1].idempotencyKey,
  );
  expect(screen.queryByText(/private-driver|fixture-secret/)).toBeNull();
  expect(screen.getByRole("alert")).toHaveTextContent(
    /Não foi possível confirmar o cancelamento/,
  );
});

test("typed cancellation transport uses the existing endpoint and preserves optional historical metadata", async () => {
  const manager = new SessionManager(new FakeAuthApi(), new FakeStorage());
  await manager.login("test@example.test", "fixture");
  const row = request(),
    updated = {
      ...row,
      status: "CANCELLED" as const,
      allowedActions: [],
      version: 5,
    };
  const http = jest
    .spyOn(MarketplaceHttp.prototype, "request")
    .mockResolvedValue(updated);
  const input: CancelRequestInput = {
    version: 4,
    idempotencyKey: "40000000-0000-4000-8000-000000000001",
    reasonCode: "PRICE_DISAGREEMENT",
    confirmed: true,
  };
  expect(await new RequestsApi(manager).cancel(row.id, input)).toEqual(updated);
  expect(http).toHaveBeenCalledWith(
    `requests/${row.id}/cancel`,
    "POST",
    input,
    expect.any(String),
  );
  http.mockResolvedValueOnce(row);
  await expect(
    new RequestsApi(manager).cancel(row.id, input),
  ).rejects.toMatchObject({ code: "INVALID_RESPONSE", status: 502 });
  const event = {
    id: "50000000-0000-4000-8000-000000000001",
    actor: "client",
    previousStatus: "ACCEPTED",
    newStatus: "CANCELLED",
    occurredAt: row.updatedAt,
    version: 5,
    reason: "Motivo preservado",
  };
  expect(isRequestDetail({ ...updated, events: [event] })).toBe(true);
  expect(
    isRequestDetail({
      ...updated,
      events: [{ ...event, reasonCode: "OTHER", executionContext: "PARTIAL" }],
    }),
  ).toBe(true);
  expect(
    isRequestDetail({
      ...updated,
      events: [{ ...event, reasonCode: "UNKNOWN" }],
    }),
  ).toBe(false);
  expect(
    isRequestDetail({
      ...updated,
      events: [{ ...event, executionContext: "UNKNOWN" }],
    }),
  ).toBe(false);
});

test("expired sessions cannot complete cancellation when refresh is rejected", async () => {
  const auth = new FakeAuthApi(),
    manager = new SessionManager(auth, new FakeStorage());
  await manager.login("test@example.test", "fixture");
  auth.failRefresh = new AuthFailure(
    401,
    "SESSION_EXPIRED",
    "Sua sessão expirou. Entre novamente.",
  );
  jest
    .spyOn(MarketplaceHttp.prototype, "request")
    .mockRejectedValue(
      new AuthFailure(
        401,
        "SESSION_EXPIRED",
        "Sua sessão expirou. Entre novamente.",
      ),
    );
  await expect(
    new RequestsApi(manager).cancel(request().id, {
      version: 4,
      idempotencyKey: "40000000-0000-4000-8000-000000000001",
      reasonCode: "PRICE_DISAGREEMENT",
      confirmed: true,
    }),
  ).rejects.toBeInstanceOf(AuthFailure);
  expect(manager.state.user).toBeNull();
});
