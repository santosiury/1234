import { randomUUID as mockRandomUUID } from "node:crypto";
jest.mock("expo-secure-store", () => ({
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(async () => undefined),
  deleteItemAsync: jest.fn(async () => undefined),
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: "device-only",
}));

jest.mock("expo-crypto", () => ({
  randomUUID: () => mockRandomUUID(),
}));
