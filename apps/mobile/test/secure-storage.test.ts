import * as SecureStore from "expo-secure-store";
import { secureSessionStorage } from "../src/auth/storage";
import { refreshValue } from "./support/auth-fakes";
test("secure persistence uses device-only Keychain access and validates stored data", async () => {
  const record = { token: refreshValue(1), intent: "refresh" as const };
  await secureSessionStorage.write(record);
  expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
    "omini.auth.session.v1",
    JSON.stringify(record),
    { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY },
  );
  jest
    .mocked(SecureStore.getItemAsync)
    .mockResolvedValueOnce(JSON.stringify(record));
  expect(await secureSessionStorage.read()).toEqual(record);
  jest.mocked(SecureStore.getItemAsync).mockResolvedValueOnce("corrupt");
  expect(await secureSessionStorage.read()).toBeNull();
  expect(SecureStore.deleteItemAsync).toHaveBeenCalled();
});
