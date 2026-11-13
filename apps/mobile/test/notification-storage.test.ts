import { SessionManager } from "../src/auth/session-manager";
import { FakeAuthApi, FakeStorage } from "./support/auth-fakes";
import { RequestsApi } from "../src/requests/api";
import * as SecureStore from "expo-secure-store";
import {
  noticeStorage,
  emptyLedger,
  NOTICE_LIMIT,
  type NoticeLedger,
} from "../src/requests/notifications/storage";
import { MarketplaceHttp } from "../src/marketplace/api";
const owner = "10000000-0000-4000-8000-000000000001",
  other = "10000000-0000-4000-8000-000000000002";
let values: Map<string, string>;
function ledger(n = 1): NoticeLedger {
  return {
    ...emptyLedger(),
    entries: Array.from({ length: n }, (_, i) => ({
      id: `20000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
      side: "provider",
      status: "REQUESTED",
      version: 1,
      handled: 1,
      viewed: 0,
    })),
  };
}
beforeEach(() => {
  values = new Map([
    ["omini.auth.unrelated", "preserved"],
    ["omini.requests.pending.v1.unrelated", "preserved"],
  ]);
  jest
    .mocked(SecureStore.getItemAsync)
    .mockImplementation(async (key) => values.get(key) ?? null);
  jest
    .mocked(SecureStore.setItemAsync)
    .mockImplementation(async (key, value) => {
      values.set(key, value);
    });
});
afterEach(() => jest.restoreAllMocks());
test("notice checkpoints contain only bounded per-account metadata, device-only blocks and no authentication or recovery changes", async () => {
  const value = ledger(NOTICE_LIMIT + 10);
  await noticeStorage.write(owner, value);
  expect((await noticeStorage.read(owner)).entries).toHaveLength(NOTICE_LIMIT);
  expect((await noticeStorage.read(other)).entries).toHaveLength(0);
  expect(values.get("omini.auth.unrelated")).toBe("preserved");
  expect(values.get("omini.requests.pending.v1.unrelated")).toBe("preserved");
  for (const [key, part, options] of jest.mocked(SecureStore.setItemAsync).mock
    .calls) {
    expect(key).toContain(owner);
    expect(part.length).toBeLessThanOrEqual(1200);
    expect(options?.keychainAccessible).toBe(
      SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    );
  }
  expect(values.size).toBeLessThan(68);
});
test("interrupted writes preserve the prior complete slot and recover on a subsequent write", async () => {
  await noticeStorage.write(owner, ledger());
  jest
    .mocked(SecureStore.setItemAsync)
    .mockRejectedValueOnce(Error("private native data"));
  await expect(noticeStorage.write(owner, ledger(2))).rejects.toThrow(
    "salvar o controle",
  );
  expect((await noticeStorage.read(owner)).entries).toHaveLength(1);
  await noticeStorage.write(owner, ledger(2));
  expect((await noticeStorage.read(owner)).entries).toHaveLength(2);
});
test("corrupt metadata fails closed with safe errors and serialized writes never mix owners or checkpoints", async () => {
  await Promise.all([
    noticeStorage.write(owner, ledger()),
    noticeStorage.write(owner, ledger(3)),
    noticeStorage.write(other, ledger(2)),
  ]);
  expect((await noticeStorage.read(owner)).entries).toHaveLength(3);
  expect((await noticeStorage.read(other)).entries).toHaveLength(2);
  values.set(
    `omini.request.notices.v1.${owner}`,
    "private corrupt native record",
  );
  await expect(noticeStorage.read(owner)).rejects.toThrow(
    "recuperar o controle",
  );
  await expect(noticeStorage.write(owner, ledger())).rejects.toThrow(
    "salvar o controle",
  );
  expect((await noticeStorage.read(other)).entries).toHaveLength(2);
});
test("monitor HTTP cancellation remains active while decoding the response body and never exposes network details", async () => {
  let wire: AbortSignal | undefined, reading!: () => void;
  const entered = new Promise<void>((r) => {
    reading = r;
  });
  jest.spyOn(global, "fetch").mockImplementation(async (_url, options) => {
    wire = options?.signal as AbortSignal;
    return {
      ok: true,
      status: 200,
      json: async () => {
        reading();
        return new Promise((_resolve, reject) =>
          wire!.addEventListener("abort", () =>
            reject(Error("private body detail")),
          ),
        );
      },
    } as unknown as Response;
  });
  const controller = new AbortController(),
    http = new MarketplaceHttp(() => "http://127.0.0.1:3000/api", "requests");
  const pending = http.request(
    "requests/received",
    "GET",
    undefined,
    "access",
    controller.signal,
  );
  await entered;
  controller.abort();
  await expect(pending).rejects.toMatchObject({
    code: "ABORTED",
    message: "Consulta cancelada.",
  });
  expect(wire?.aborted).toBe(true);
});

test("an aborted monitor call queued behind another session operation never reaches the HTTP transport", async () => {
  const manager = new SessionManager(new FakeAuthApi(), new FakeStorage());
  await manager.login("person@example.test", "test");
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const holding = manager.request(async () => gate),
    api = new RequestsApi(manager),
    controller = new AbortController();
  const http = jest.spyOn(MarketplaceHttp.prototype, "request");
  const queued = api.list(
    "client",
    { status: "AWAITING_CONFIRMATION" },
    controller.signal,
  );
  controller.abort();
  release();
  await holding;
  await expect(queued).rejects.toMatchObject({ code: "ABORTED" });
  expect(http).not.toHaveBeenCalled();
});
