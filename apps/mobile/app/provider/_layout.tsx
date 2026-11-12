import { useSession } from "../../src/auth/session";
import { Redirect, Stack } from "expo-router";
import { useMode } from "../../src/mode";
import { theme } from "../../src/theme";

export const unstable_settings = { anchor: "index" };

export default function ProviderLayout() {
  const { mode } = useMode();
  const { state } = useSession();
  // Let restoration finish before resolving a deep link; never select a mode implicitly.
  if (state.status === "loading") return null;
  if (mode !== "provider")
    return (
      <Redirect
        href={
          mode === null
            ? state.user
              ? "/account"
              : state.status === "expired"
                ? "/login"
                : "/"
            : "/client"
        }
      />
    );
  return (
    <Stack
      key={state.user?.id ?? "guest"}
      screenOptions={{
        headerShown: false,
        gestureEnabled: true,
        contentStyle: { backgroundColor: theme.colors.background },
      }}
    >
      <Stack.Screen
        name="index"
        options={{ title: "Meu espaço profissional" }}
      />
      <Stack.Screen name="services" options={{ title: "Meus serviços" }} />
      <Stack.Screen name="profile" options={{ title: "Meu perfil" }} />
      <Stack.Screen name="areas" options={{ title: "Onde atendo" }} />
      <Stack.Screen
        name="requests"
        options={{ title: "Solicitações recebidas" }}
      />
    </Stack>
  );
}
