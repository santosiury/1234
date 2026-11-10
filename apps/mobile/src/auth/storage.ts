import * as SecureStore from "expo-secure-store";
export interface StoredSession {
  token: string;
  intent: "refresh" | "revoke";
}
export interface SessionStorage {
  read(): Promise<StoredSession | null>;
  write(value: StoredSession): Promise<void>;
  clear(): Promise<void>;
}
const key = "omini.auth.session.v1";
export const secureSessionStorage: SessionStorage = {
  async read() {
    const value = await SecureStore.getItemAsync(key);
    if (!value) return null;
    try {
      const record = JSON.parse(value) as Partial<StoredSession>;
      if (
        typeof record.token === "string" &&
        /^[A-Za-z0-9_-]{43}$/.test(record.token) &&
        (record.intent === "refresh" || record.intent === "revoke")
      )
        return record as StoredSession;
    } catch {
      /* Corrupt secure record is discarded, never used as credentials. */
    }
    await SecureStore.deleteItemAsync(key);
    return null;
  },
  write: (value) =>
    SecureStore.setItemAsync(key, JSON.stringify(value), {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    }),
  clear: () => SecureStore.deleteItemAsync(key),
};
