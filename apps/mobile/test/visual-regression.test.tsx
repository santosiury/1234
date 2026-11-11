import { Text } from "react-native";
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { SessionProvider } from "../src/auth/session";
import { SessionManager } from "../src/auth/session-manager";
import { SessionGate } from "../src/auth/SessionGate";
import { FakeAuthApi, FakeStorage, refreshValue } from "./support/auth-fakes";
import { AuthFailure } from "../src/auth/api";
import { PrimaryButton } from "../src/components/ui";

test("branded restoration keeps navigation mounted and releases it after fonts are ready", async () => {
  let finishRead!: (value: null) => void;
  const storage = new FakeStorage();
  const pending = new Promise<null>((resolve) => {
    finishRead = resolve;
  });
  storage.read = () => pending;
  const manager = new SessionManager(new FakeAuthApi(), storage);
  const tree = (fontsReady: boolean) => (
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 390, height: 844 },
        insets: { top: 47, bottom: 34, left: 0, right: 0 },
      }}
    >
      <SessionProvider manager={manager}>
        <SessionGate fontsReady={fontsReady}>
          <Text>Navigation stays mounted</Text>
        </SessionGate>
      </SessionProvider>
    </SafeAreaProvider>
  );
  const view = await render(tree(false));
  expect(
    screen.getByText("Navigation stays mounted", {
      includeHiddenElements: true,
    }),
  ).toBeTruthy();
  expect(
    screen.getByLabelText("Omini. Tudo resolvido. Sem dor de cabeça."),
  ).toBeTruthy();
  expect(screen.getByLabelText("Restaurando sessão")).toBeTruthy();
  await act(async () => {
    finishRead(null);
  });
  expect(screen.getByLabelText("Preparando Omini")).toBeTruthy();
  await view.rerender(tree(true));
  expect(screen.queryByLabelText("Preparando Omini")).toBeNull();
  expect(screen.getByText("Navigation stays mounted")).toBeTruthy();
});

test("offline restoration dismisses the branded loading state and keeps the session recovery message", async () => {
  const storage = new FakeStorage();
  storage.record = { token: refreshValue(1), intent: "refresh" };
  const api = new FakeAuthApi();
  api.failRefresh = new AuthFailure(0, "NETWORK", "Offline");
  const manager = new SessionManager(api, storage);
  await render(
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 390, height: 844 },
        insets: { top: 47, bottom: 34, left: 0, right: 0 },
      }}
    >
      <SessionProvider manager={manager}>
        <SessionGate>
          <Text>App remains available</Text>
        </SessionGate>
      </SessionProvider>
    </SafeAreaProvider>,
  );
  await act(async () => {
    await manager.restore();
  });
  expect(screen.queryByLabelText("Restaurando sessão")).toBeNull();
  expect(screen.getByText("App remains available")).toBeTruthy();
  expect(manager.state.status).toBe("offline");
  expect(manager.state.message).toContain("explore a demonstração");
  expect(storage.record?.intent).toBe("refresh");
});

test("loading actions keep their accessible name and cannot submit again", async () => {
  const submit = jest.fn();
  const view = await render(
    <PrimaryButton title="Entrar" loading onPress={submit} />,
  );
  const action = screen.getByRole("button", { name: "Entrar" });
  expect(action).toBeDisabled();
  expect(screen.getByRole("button", { name: "Entrar", busy: true })).toBe(
    action,
  );
  await fireEvent.press(action);
  expect(submit).not.toHaveBeenCalled();
  await view.rerender(<PrimaryButton title="Entrar" onPress={submit} />);
  await fireEvent.press(screen.getByRole("button", { name: "Entrar" }));
  expect(submit).toHaveBeenCalledTimes(1);
});
