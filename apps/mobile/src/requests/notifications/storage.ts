import * as SecureStore from "expo-secure-store";
import {
  REQUEST_STATUSES,
  type RequestParticipant,
  type RequestStatus,
} from "@omini/shared";
import { isRequestId } from "../api";
export const NOTICE_LIMIT = 256;
export interface NoticeEntry {
  id: string;
  side: RequestParticipant;
  version: number;
  status: RequestStatus;
  handled: number;
  viewed: number;
}
export interface NoticeBaseline {
  initialized: boolean;
  newest: string;
  totals: Partial<Record<RequestStatus, number>>;
}
export interface NoticeLedger {
  provider: NoticeBaseline;
  client: NoticeBaseline;
  entries: NoticeEntry[];
}
export const emptyLedger = (): NoticeLedger => ({
  provider: { initialized: false, newest: "", totals: {} },
  client: { initialized: false, newest: "", totals: {} },
  entries: [],
});
export interface NoticeStorage {
  read(owner: string): Promise<NoticeLedger>;
  write(owner: string, value: NoticeLedger): Promise<void>;
}
const base = (owner: string) => {
  if (!isRequestId(owner)) throw Error("Invalid owner");
  return `omini.request.notices.v1.${owner}`;
};
function validBaseline(v: unknown): v is NoticeBaseline {
  if (!v || typeof v !== "object") return false;
  const b = v as NoticeBaseline;
  return (
    typeof b.initialized === "boolean" &&
    typeof b.newest === "string" &&
    (b.newest === "" || Number.isFinite(Date.parse(b.newest))) &&
    !!b.totals &&
    typeof b.totals === "object" &&
    Object.entries(b.totals).every(
      ([key, n]) =>
        REQUEST_STATUSES.includes(key as RequestStatus) &&
        Number.isSafeInteger(n) &&
        Number(n) >= 0,
    )
  );
}
function valid(v: unknown): v is NoticeLedger {
  if (!v || typeof v !== "object") return false;
  const l = v as NoticeLedger;
  return (
    validBaseline(l.provider) &&
    validBaseline(l.client) &&
    Array.isArray(l.entries) &&
    l.entries.length <= NOTICE_LIMIT &&
    l.entries.every(
      (e) =>
        !!e &&
        isRequestId(e.id) &&
        (e.side === "client" || e.side === "provider") &&
        REQUEST_STATUSES.includes(e.status) &&
        Number.isSafeInteger(e.version) &&
        e.version > 0 &&
        Number.isSafeInteger(e.handled) &&
        e.handled >= 0 &&
        e.handled <= e.version &&
        Number.isSafeInteger(e.viewed) &&
        e.viewed >= 0 &&
        e.viewed <= e.version,
    )
  );
}
// Two bounded slots: a failed write cannot replace the last complete checkpoint.
const tails = new Map<string, Promise<unknown>>();
function serialize<T>(owner: string, run: () => Promise<T>): Promise<T> {
  const next = (tails.get(owner) ?? Promise.resolve())
    .catch(() => undefined)
    .then(run);
  tails.set(owner, next);
  return next.finally(() => {
    if (tails.get(owner) === next) tails.delete(owner);
  });
}
async function manifest(key: string) {
  const raw = await SecureStore.getItemAsync(key);
  if (raw === null) return null;
  const value: unknown = JSON.parse(raw);
  if (
    !value ||
    typeof value !== "object" ||
    !("slot" in value) ||
    !("parts" in value) ||
    (value.slot !== "a" && value.slot !== "b") ||
    !Number.isInteger(value.parts) ||
    Number(value.parts) < 1 ||
    Number(value.parts) > 64
  )
    throw Error("Invalid manifest");
  return { slot: value.slot, parts: Number(value.parts) };
}
export const noticeStorage: NoticeStorage = {
  read: async (owner) =>
    serialize(owner, async () => {
      try {
        const key = base(owner),
          meta = await manifest(key);
        if (!meta) return emptyLedger();
        let json = "";
        for (let i = 0; i < meta.parts; i++) {
          const part = await SecureStore.getItemAsync(
            `${key}.${meta.slot}.${i}`,
          );
          if (part === null || part.length > 1200)
            throw Error("Incomplete checkpoint");
          json += part;
        }
        const value: unknown = JSON.parse(json);
        if (!valid(value)) throw Error("Invalid checkpoint");
        return value;
      } catch {
        throw Error(
          "Não foi possível recuperar o controle de avisos com segurança.",
        );
      }
    }),
  write: (owner, ledger) => {
    // Snapshot now, before joining the queue, and explicitly exclude all business content.
    const clean: NoticeLedger = {
      provider: { ...ledger.provider, totals: { ...ledger.provider.totals } },
      client: { ...ledger.client, totals: { ...ledger.client.totals } },
      entries: ledger.entries.slice(-NOTICE_LIMIT).map((e) => ({
        id: e.id,
        side: e.side,
        version: e.version,
        status: e.status,
        handled: e.handled,
        viewed: e.viewed,
      })),
    };
    return serialize(owner, async () => {
      try {
        if (!valid(clean)) throw Error("Invalid ledger");
        const key = base(owner),
          old = await manifest(key),
          slot = old?.slot === "a" ? "b" : "a";
        const json = JSON.stringify(clean),
          parts = Math.ceil(json.length / 1200);
        if (parts > 64) throw Error("Oversized checkpoint");
        for (let i = 0; i < parts; i++)
          await SecureStore.setItemAsync(
            `${key}.${slot}.${i}`,
            json.slice(i * 1200, (i + 1) * 1200),
            { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY },
          );
        await SecureStore.setItemAsync(key, JSON.stringify({ slot, parts }), {
          keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
        });
      } catch {
        throw Error(
          "Não foi possível salvar o controle de avisos com segurança.",
        );
      }
    });
  },
};
