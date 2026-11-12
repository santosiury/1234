import * as SecureStore from "expo-secure-store";
import { hasPrivateRequestData, type CreateRequestInput } from "@omini/shared";
import { isRequestId } from "./api";
export interface PendingRequest {
  input: CreateRequestInput;
}
const prefix = (owner: string) => `omini.requests.pending.v1.${owner}`;
// Separate namespace from authentication. Small chunks avoid iOS Keychain value-size issues.
async function readRaw(owner: string): Promise<PendingRequest | null> {
  const base = prefix(owner),
    raw = await SecureStore.getItemAsync(base);
  if (!raw) return null;
  const meta: unknown = JSON.parse(raw);
  if (
    !meta ||
    typeof meta !== "object" ||
    !("parts" in meta) ||
    !Number.isInteger(meta.parts) ||
    Number(meta.parts) < 1 ||
    Number(meta.parts) > 16
  )
    throw Error("Não foi possível recuperar o envio com segurança.");
  let json = "";
  for (let i = 0; i < Number(meta.parts); i++) {
    const part = await SecureStore.getItemAsync(`${base}.${i}`);
    if (part === null)
      throw Error("O envio pendente precisa ser recuperado. Tente novamente.");
    json += part;
  }
  const v: unknown = JSON.parse(json);
  if (!v || typeof v !== "object" || !("input" in v) || !validInput(v.input))
    throw Error("Não foi possível recuperar o envio com segurança.");
  return v as PendingRequest;
}
async function read(owner: string): Promise<PendingRequest | null> {
  try {
    return await readRaw(owner);
  } catch {
    throw Error(
      "Não foi possível recuperar o envio com segurança. Tente novamente.",
    );
  }
}
function validInput(v: unknown): v is CreateRequestInput {
  if (!v || typeof v !== "object") return false;
  const p = v as Partial<CreateRequestInput>;
  return (
    isRequestId(p.providerId) &&
    isRequestId(p.providerServiceId) &&
    isRequestId(p.idempotencyKey) &&
    typeof p.description === "string" &&
    p.description.length >= 10 &&
    p.description.length <= 1000 &&
    !hasPrivateRequestData(p.description) &&
    typeof p.city === "string" &&
    p.city.length >= 2 &&
    p.city.length <= 100 &&
    !hasPrivateRequestData(p.city) &&
    typeof p.state === "string" &&
    /^[A-Z]{2}$/.test(p.state) &&
    typeof p.neighborhood === "string" &&
    p.neighborhood.length <= 100 &&
    !hasPrivateRequestData(p.neighborhood)
  );
}
const tails = new Map<string, Promise<unknown>>();
async function exclusive<T>(owner: string, run: () => Promise<T>): Promise<T> {
  const previous = tails.get(owner) ?? Promise.resolve();
  const next = previous.catch(() => undefined).then(run);
  tails.set(owner, next);
  try {
    return await next;
  } finally {
    if (tails.get(owner) === next) tails.delete(owner);
  }
}
export const pendingRequests = {
  read,
  write: (owner: string, pending: PendingRequest) =>
    exclusive(owner, async () => {
      try {
        if (!validInput(pending.input)) throw Error("Invalid pending input");
        const old = await read(owner);
        if (old) {
          if (JSON.stringify(old) !== JSON.stringify(pending))
            throw Error(
              "Existe um envio pendente. Confira esse envio antes de iniciar outro.",
            );
          return;
        }
        const data = Array.from(JSON.stringify(pending));
        const count = Math.ceil(data.length / 400);
        if (count > 16)
          throw Error("O envio excedeu o limite de armazenamento seguro.");
        const base = prefix(owner);
        for (let i = 0; i < count; i++)
          await SecureStore.setItemAsync(
            `${base}.${i}`,
            data.slice(i * 400, (i + 1) * 400).join(""),
            { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY },
          );
        // Manifest last: never send until the complete payload and stable key are safely recorded.
        await SecureStore.setItemAsync(base, JSON.stringify({ parts: count }), {
          keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
        });
      } catch {
        throw Error(
          "Não foi possível preparar o envio com segurança. Confira envios pendentes e tente novamente.",
        );
      }
    }),
  clear: (owner: string) =>
    exclusive(owner, async () => {
      const base = prefix(owner);
      await SecureStore.deleteItemAsync(base);
      for (let i = 0; i < 16; i++)
        await SecureStore.deleteItemAsync(`${base}.${i}`);
    }),
};
