import { randomUUID } from "node:crypto";
import type {
  AuthUser,
  RequestParticipant,
  RequestQuery,
  ServiceRequestSummary,
} from "@omini/shared";
import {
  RequestMonitor,
  POLL_MS,
  type MonitorApi,
} from "../src/requests/notifications/monitor";
import {
  emptyLedger,
  type NoticeLedger,
  type NoticeStorage,
} from "../src/requests/notifications/storage";
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));
const owner = "10000000-0000-4000-8000-000000000001";
function user(
  profiles = { provider: true, client: false },
  id = owner,
): AuthUser {
  return { id, displayName: "Pessoa", email: "private@example.test", profiles };
}
let serial = 0;
function row(
  side: RequestParticipant = "provider",
  status: ServiceRequestSummary["status"] = "REQUESTED",
  version = 1,
): ServiceRequestSummary {
  return {
    id: randomUUID(),
    providerId: randomUUID(),
    providerServiceId: randomUUID(),
    viewer: side,
    status,
    version,
    clientNameSnapshot: "Private client",
    providerNameSnapshot: "Private provider",
    serviceTitleSnapshot: "Private service",
    description: "Private description",
    city: "Sombrio",
    state: "SC",
    neighborhood: "",
    createdAt: new Date(Date.UTC(2026, 10, 12, 12, 0, ++serial)).toISOString(),
    updatedAt: new Date().toISOString(),
    acceptedAt: null,
    startedAt: null,
    completionProposedAt: null,
    completedAt: null,
    cancelledAt: null,
    allowedActions: [],
  };
}
function fixture(value = user()) {
  const data: ServiceRequestSummary[] = [],
    saved = new Map<string, NoticeLedger>();
  let offline = false,
    storageFailure = false;
  const storage: NoticeStorage = {
    read: jest.fn(async (id) => clone(saved.get(id) ?? emptyLedger())),
    write: jest.fn(async (id, ledger) => {
      if (storageFailure) throw Error("private storage failure");
      saved.set(id, clone(ledger));
    }),
  };
  const api: MonitorApi = {
    list: jest.fn(
      async (
        side: RequestParticipant,
        query: RequestQuery,
        signal?: AbortSignal,
      ) => {
        if (signal?.aborted) throw Error("aborted");
        if (offline) throw Error("private network failure");
        const items = data.filter(
          (r) => r.viewer === side && r.status === query.status,
        );
        return {
          items: clone(items.slice(0, 20)),
          total: items.length,
          page: 1,
          pageSize: 20,
        };
      },
    ),
  };
  const monitor = new RequestMonitor(storage, () => api);
  monitor.setSession(value);
  return {
    monitor,
    api,
    storage,
    saved,
    data,
    setOffline: (v: boolean) => {
      offline = v;
    },
    setStorageFailure: (v: boolean) => {
      storageFailure = v;
    },
  };
}
async function drain() {
  for (let i = 0; i < 35; i++) await Promise.resolve();
}
async function sync(f: ReturnType<typeof fixture>) {
  f.monitor.setActive(true);
  await f.monitor.refresh();
  await drain();
}
beforeEach(() => {
  jest.useFakeTimers();
  serial = 0;
});
afterEach(() => jest.useRealTimers());
test("one active timer polls real pending totals, shows a new request once and retains the action count after dismissal/viewing", async () => {
  const f = fixture();
  await sync(f);
  expect(f.monitor.state.providerPending).toBe(0);
  expect(jest.getTimerCount()).toBe(1);
  const request = row();
  f.data.push(request);
  await jest.advanceTimersByTimeAsync(POLL_MS);
  await drain();
  expect(f.monitor.state.providerPending).toBe(1);
  expect(f.monitor.state.notice).toMatchObject({
    id: request.id,
    title: "Nova solicitação recebida!",
    message: "Você recebeu um novo pedido de serviço.",
  });
  f.monitor.dismiss();
  await f.monitor.refresh();
  await drain();
  expect(f.monitor.state.notice).toBeNull();
  f.monitor.viewed(request, owner);
  expect(f.monitor.state.providerPending).toBe(1);
  expect(f.saved.get(owner)?.entries[0]).toMatchObject({
    id: request.id,
    handled: 1,
    viewed: 1,
  });
  expect(JSON.stringify([...f.saved.values()])).not.toContain("Private");
  const restart = new RequestMonitor(f.storage, () => f.api);
  f.monitor.dispose();
  restart.setSession(user());
  restart.setActive(true);
  await restart.refresh();
  await drain();
  expect(restart.state.notice).toBeNull();
  expect(restart.state.providerPending).toBe(1);
  restart.dispose();
  expect(jest.getTimerCount()).toBe(0);
});
test("first synchronization summarizes preexisting requests, never queues a backlog of individual banners", async () => {
  const f = fixture();
  f.data.push(...Array.from({ length: 35 }, () => row()));
  await sync(f);
  expect(f.monitor.state.providerPending).toBe(35);
  expect(f.monitor.state.notice).toMatchObject({
    title: "Solicitações aguardando resposta",
  });
  expect(f.monitor.state.notice?.id).toBeUndefined();
  f.monitor.dismiss();
  await drain();
  expect(f.monitor.state.notice).toBeNull();
  await f.monitor.refresh();
  await drain();
  expect(f.monitor.state.notice).toBeNull();
  f.monitor.dispose();
});
test("acceptance and rejection remove real pending counts while viewing alone never clears them", async () => {
  const f = fixture(),
    a = row(),
    b = row();
  f.data.push(a, b);
  await sync(f);
  f.monitor.dismiss();
  f.monitor.viewed(a, owner);
  expect(f.monitor.state.providerPending).toBe(2);
  a.status = "ACCEPTED";
  a.version++;
  f.monitor.viewed(a, owner);
  await f.monitor.refresh(true);
  await drain();
  expect(f.monitor.state.providerPending).toBe(1);
  b.status = "REJECTED";
  b.version++;
  await f.monitor.refresh(true);
  await drain();
  expect(f.monitor.state.providerPending).toBe(0);
  expect(f.monitor.state.notice).toBeNull();
  f.monitor.dispose();
});
test("background aborts the active query, removes timers and foreground immediately refreshes without overlapping calls", async () => {
  const f = fixture();
  await sync(f);
  let resolve!: () => void, signal: AbortSignal | undefined;
  jest.mocked(f.api.list).mockImplementationOnce(async (_side, _query, s) => {
    signal = s;
    await new Promise<void>((r) => {
      resolve = r;
    });
    return { items: [], total: 99, page: 1, pageSize: 20 };
  });
  const flight = f.monitor.refresh();
  await drain();
  f.monitor.setActive(false);
  expect(signal?.aborted).toBe(true);
  expect(jest.getTimerCount()).toBe(0);
  await jest.advanceTimersByTimeAsync(100_000);
  const count = jest.mocked(f.api.list).mock.calls.length;
  resolve();
  await flight;
  expect(f.monitor.state.providerPending).toBe(0);
  f.data.push(row());
  f.monitor.setActive(true);
  await f.monitor.refresh();
  await drain();
  expect(jest.mocked(f.api.list).mock.calls.length).toBe(count + 1);
  expect(f.monitor.state.providerPending).toBe(1);
  expect(jest.getTimerCount()).toBe(1);
  f.monitor.dispose();
});
test("multiple focus and refresh triggers share a single request and mutation invalidations coalesce to one follow-up", async () => {
  const f = fixture();
  await sync(f);
  let resolve!: () => void;
  jest.mocked(f.api.list).mockImplementationOnce(async () => {
    await new Promise<void>((r) => {
      resolve = r;
    });
    return { items: [], total: 0, page: 1, pageSize: 20 };
  });
  const before = jest.mocked(f.api.list).mock.calls.length,
    first = f.monitor.refresh();
  expect(f.monitor.refresh()).toBe(first);
  f.monitor.refresh(true);
  f.monitor.refresh(true);
  expect(jest.mocked(f.api.list).mock.calls.length).toBe(before + 1);
  resolve();
  await first;
  await drain();
  expect(jest.mocked(f.api.list).mock.calls.length).toBe(before + 2);
  expect(jest.getTimerCount()).toBe(1);
  f.monitor.dispose();
});
test("network failure preserves last known counts and never fabricates a notice, with retry recovery", async () => {
  const f = fixture();
  await sync(f);
  f.data.push(row());
  await f.monitor.refresh();
  await drain();
  f.monitor.dismiss();
  f.setOffline(true);
  f.data.push(row());
  await f.monitor.refresh();
  await drain();
  expect(f.monitor.state.providerPending).toBe(1);
  expect(f.monitor.state.notice).toBeNull();
  expect(f.monitor.state.error).toContain("último estado");
  expect(f.monitor.state.error).not.toContain("private");
  f.setOffline(false);
  await f.monitor.refresh();
  await drain();
  expect(f.monitor.state.providerPending).toBe(2);
  expect(f.monitor.state.notice?.title).toBe("Nova solicitação recebida!");
  f.monitor.dispose();
});
test("logout invalidates late responses and stale viewed callbacks cannot populate the next user's ledger", async () => {
  const f = fixture();
  await sync(f);
  const old = row();
  let release!: () => void;
  jest.mocked(f.api.list).mockImplementationOnce(async () => {
    await new Promise<void>((r) => {
      release = r;
    });
    return { items: [old], total: 1, page: 1, pageSize: 20 };
  });
  const pending = f.monitor.refresh();
  f.monitor.setSession(null);
  expect(jest.getTimerCount()).toBe(0);
  const next = user(
    { provider: true, client: false },
    "10000000-0000-4000-8000-000000000002",
  );
  f.monitor.setSession(next);
  await f.monitor.refresh();
  await drain();
  release();
  await pending;
  f.monitor.viewed(old, owner);
  await drain();
  expect(f.monitor.state.owner).toBe(next.id);
  expect(f.monitor.state.providerPending).toBe(0);
  expect(f.monitor.state.notice).toBeNull();
  expect(f.saved.get(next.id)?.entries.some((e) => e.id === old.id)).toBe(
    false,
  );
  f.monitor.dispose();
});
test("forms defer notices and discard stale deferred requests that have already been answered", async () => {
  const f = fixture();
  await sync(f);
  f.monitor.setPresentationAllowed(false);
  const a = row();
  f.data.push(a);
  await f.monitor.refresh();
  await drain();
  expect(f.monitor.state.providerPending).toBe(1);
  expect(f.monitor.state.notice).toBeNull();
  f.monitor.setPresentationAllowed(true);
  await drain();
  expect(f.monitor.state.notice?.id).toBe(a.id);
  f.monitor.dismiss();
  f.monitor.setPresentationAllowed(false);
  const b = row();
  f.data.push(b);
  await f.monitor.refresh();
  b.status = "ACCEPTED";
  await f.monitor.refresh();
  f.monitor.setPresentationAllowed(true);
  await drain();
  expect(f.monitor.state.notice).toBeNull();
  expect(f.monitor.state.providerPending).toBe(1);
  f.monitor.dispose();
});
test("dual-role monitoring remains independent from the chosen mode and a role failure cannot hide the other role's update", async () => {
  const f = fixture(user({ provider: true, client: true }));
  await sync(f);
  const a = row();
  f.data.push(a, row("client", "AWAITING_CONFIRMATION", 4));
  jest.mocked(f.api.list).mockRejectedValueOnce(Error("provider offline"));
  await f.monitor.refresh();
  await drain();
  expect(f.monitor.state.clientPending).toBe(1);
  expect(f.monitor.state.notice?.side).toBe("client");
  f.monitor.dismiss();
  await f.monitor.refresh();
  await drain();
  expect(f.monitor.state.providerPending).toBe(1);
  expect(f.monitor.state.notice?.id).toBe(a.id);
  f.monitor.dispose();
});
test("client sees accepted/rejected/reopened states and confirmation remains an action count after viewing", async () => {
  const f = fixture(user({ client: true, provider: false })),
    a = row("client");
  f.data.push(a);
  await sync(f);
  a.status = "ACCEPTED";
  a.version = 2;
  await f.monitor.refresh();
  await drain();
  expect(f.monitor.state.notice?.title).toBe("Solicitação aceita");
  f.monitor.dismiss();
  a.status = "AWAITING_CONFIRMATION";
  a.version = 4;
  await f.monitor.refresh();
  await drain();
  expect(f.monitor.state.clientPending).toBe(1);
  expect(f.monitor.state.notice?.title).toBe("Confirme a conclusão do serviço");
  f.monitor.viewed(a, owner);
  expect(f.monitor.state.notice).toBeNull();
  expect(f.monitor.state.clientPending).toBe(1);
  a.status = "IN_PROGRESS";
  a.version = 5;
  await f.monitor.refresh();
  await drain();
  expect(f.monitor.state.notice?.title).toBe("Solicitação reaberta");
  expect(f.monitor.state.clientPending).toBe(0);
  f.monitor.dismiss();
  a.status = "CANCELLED";
  a.version = 6;
  f.monitor.viewed(a, owner);
  await f.monitor.refresh(true);
  await drain();
  expect(f.monitor.state.notice).toBeNull();
  f.monitor.dispose();
});
test("limited checkpoints and bounded API windows still use full API totals instead of counting returned rows", async () => {
  const f = fixture(user({ client: true, provider: true }));
  jest.mocked(f.api.list).mockImplementation(async (side, q) => ({
    items: [],
    total:
      side === "provider" ? 260 : q.status === "AWAITING_CONFIRMATION" ? 81 : 0,
    page: 1,
    pageSize: 20,
  }));
  await sync(f);
  expect(f.monitor.state.providerPending).toBe(260);
  expect(f.monitor.state.clientPending).toBe(81);
  expect(jest.mocked(f.api.list).mock.calls).toHaveLength(7);
  expect(
    jest
      .mocked(f.api.list)
      .mock.calls.every(
        ([, q]) => q.page === 1 && q.pageSize === 20 && q.status,
      ),
  ).toBe(true);
  f.monitor.dispose();
});
test("secure checkpoint failure withholds new banners, preserves queried totals and retries without duplicate alerts", async () => {
  const f = fixture();
  await sync(f);
  f.setStorageFailure(true);
  const a = row();
  f.data.push(a);
  await f.monitor.refresh();
  await drain();
  expect(f.monitor.state.providerPending).toBe(1);
  expect(f.monitor.state.notice).toBeNull();
  expect(f.monitor.state.error).toContain("controle de avisos");
  f.setStorageFailure(false);
  await f.monitor.refresh();
  await drain();
  expect(f.monitor.state.notice?.id).toBe(a.id);
  f.monitor.dismiss();
  await f.monitor.refresh();
  await drain();
  expect(f.monitor.state.notice).toBeNull();
  f.monitor.dispose();
});

test("a visible status notice advances to the newer version immediately and pending summaries disappear when resolved", async () => {
  const f = fixture(user({ client: true, provider: false })),
    a = row("client");
  f.data.push(a);
  await sync(f);
  a.status = "ACCEPTED";
  a.version = 2;
  await f.monitor.refresh();
  await drain();
  expect(f.monitor.state.notice?.title).toBe("Solicitação aceita");
  a.status = "AWAITING_CONFIRMATION";
  a.version = 4;
  await f.monitor.refresh();
  await drain();
  expect(f.monitor.state.notice?.title).toBe("Confirme a conclusão do serviço");
  f.monitor.dispose();
  const g = fixture();
  const old = row();
  g.data.push(old);
  await sync(g);
  expect(g.monitor.state.notice?.kind).toBe("pending");
  old.status = "REJECTED";
  old.version = 2;
  await g.monitor.refresh();
  await drain();
  expect(g.monitor.state.notice).toBeNull();
  expect(g.monitor.state.providerPending).toBe(0);
  g.monitor.dispose();
});
test("an unreadable checkpoint preserves real counters without sending a backlog of invented notifications", async () => {
  const f = fixture();
  f.data.push(row());
  jest
    .mocked(f.storage.read)
    .mockRejectedValueOnce(Error("private keychain detail"));
  await sync(f);
  expect(f.monitor.state.providerPending).toBe(1);
  expect(f.monitor.state.notice).toBeNull();
  expect(f.monitor.state.error).not.toContain("private");
  await f.monitor.refresh();
  await drain();
  expect(f.monitor.state.notice?.kind).toBe("pending");
  expect(f.monitor.state.notice?.id).toBeUndefined();
  f.monitor.dispose();
});

test("confirmation notices take priority in the bounded queue without replacing an action under the user's finger", async () => {
  const f = fixture(user({ client: true, provider: true }));
  await sync(f);
  f.monitor.setPresentationAllowed(false);
  f.data.push(
    row(),
    row("client", "AWAITING_CONFIRMATION", 4),
    ...Array.from({ length: 6 }, () => row("client", "ACCEPTED", 2)),
  );
  await f.monitor.refresh();
  await drain();
  f.monitor.setPresentationAllowed(true);
  await drain();
  expect(f.monitor.state.notice?.title).toBe("Confirme a conclusão do serviço");
  const visible = f.monitor.state.notice?.id;
  f.data.push(row());
  await f.monitor.refresh();
  await drain();
  expect(f.monitor.state.notice?.id).toBe(visible);
  f.monitor.dispose();
});

test("legacy backlog beyond the first page with equal creation timestamps never masquerades as newly received requests", async () => {
  const f = fixture(),
    sameTime = new Date().toISOString();
  f.data.push(
    ...Array.from({ length: 30 }, () => ({ ...row(), createdAt: sameTime })),
  );
  await sync(f);
  f.monitor.dismiss();
  for (const item of f.data.slice(0, 20)) item.status = "ACCEPTED";
  await f.monitor.refresh();
  await drain();
  expect(f.monitor.state.providerPending).toBe(10);
  expect(f.monitor.state.notice).toBeNull();
  f.monitor.dispose();
});

test("an already-presented notice is not replayed every time the app returns to foreground", async () => {
  const f = fixture();
  await sync(f);
  f.data.push(row());
  await f.monitor.refresh();
  await drain();
  expect(f.monitor.state.notice?.id).toBeTruthy();
  f.monitor.setActive(false);
  expect(f.monitor.state.notice).toBeNull();
  f.monitor.setActive(true);
  await f.monitor.refresh();
  await drain();
  expect(f.monitor.state.notice).toBeNull();
  expect(f.monitor.state.providerPending).toBe(1);
  f.monitor.dispose();
});

test("a client's own newly created REQUESTED record establishes a baseline without an update banner", async () => {
  const f = fixture(user({ client: true, provider: false }));
  await sync(f);
  const own = row("client");
  f.data.push(own);
  await f.monitor.refresh();
  await drain();
  expect(f.monitor.state.notice).toBeNull();
  expect(f.monitor.state.clientPending).toBe(0);
  own.status = "ACCEPTED";
  own.version = 2;
  await f.monitor.refresh();
  await drain();
  expect(f.monitor.state.notice?.title).toBe("Solicitação aceita");
  f.monitor.dispose();
});
