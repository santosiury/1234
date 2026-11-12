import type { PropsWithChildren } from "react";
import { Redirect } from "expo-router";
import { useSession } from "../../auth/session";
import { useMode } from "../../mode";

export function PrivateProviderScreen({ children }: PropsWithChildren) {
  const { state } = useSession();
  const { mode, catalogSource } = useMode();
  if (state.status === "loading") return null;
  if (!state.user) return <Redirect href="/login" />;
  if (!state.user.profiles.provider) return <Redirect href="/account" />;
  if (catalogSource !== "real" || mode !== "provider")
    return <Redirect href={mode === "client" ? "/client" : "/provider"} />;
  return children;
}
