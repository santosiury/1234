import { router } from "expo-router";
import { useSession } from "../../auth/session";
import { useMode } from "../../mode";

/** Entering the real workspace is an explicit action, even when already in provider mode. */
export function useProfessionalEntry() {
  const { state } = useSession();
  const { setMode, setCatalogSource } = useMode();
  return () => {
    if (!state.user?.profiles.provider) return;
    setCatalogSource("real");
    setMode("provider");
    router.dismissTo("/provider", { withAnchor: true });
  };
}
