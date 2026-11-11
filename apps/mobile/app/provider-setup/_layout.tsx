import { Redirect, Stack } from "expo-router";
import { useSession } from "../../src/auth/session";
import { useMode } from "../../src/mode";
export default function ProviderSetupLayout() {
  const { state } = useSession();
  const { mode, catalogSource } = useMode();
  if (state.status === "loading") return null;
  if (!state.user) return <Redirect href="/login" />;
  if (!state.user.profiles.provider) return <Redirect href="/account" />;
  if (catalogSource !== "real" || mode !== "provider")
    return <Redirect href={mode === "client" ? "/client" : "/provider"} />;
  return <Stack key={state.user.id} screenOptions={{ headerShown: false }} />;
}
