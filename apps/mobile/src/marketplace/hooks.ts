import { useCallback, useMemo, useState } from "react";
import { useFocusEffect } from "expo-router";
import { useSession } from "../auth/session";
import { ProviderApi } from "./api";
export function useRemote<T>(load: () => Promise<T>) {
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{
    load: () => Promise<T>;
    data?: T;
    loading: boolean;
    error: string;
  }>({ load, loading: true, error: "" });
  useFocusEffect(
    useCallback(() => {
      let active = true;
      setResult({ load, loading: true, error: "" });
      load()
        .then((data) => {
          if (active) setResult({ load, data, loading: false, error: "" });
        })
        .catch((error) => {
          if (active)
            setResult({
              load,
              loading: false,
              error:
                error instanceof Error
                  ? error.message
                  : "Não foi possível carregar. Tente novamente.",
            });
        });
      return () => {
        active = false;
      };
    }, [load, attempt]),
  );
  const reload = useCallback(() => setAttempt((value) => value + 1), []);
  // A changed identity/query hides previous data before effects run.
  const current =
    result.load === load
      ? result
      : { data: undefined, loading: true, error: "" };
  return {
    data: current.data,
    loading: current.loading,
    error: current.error,
    reload,
  };
}
export function useProviderApi() {
  const { manager, state } = useSession();
  return useMemo(() => new ProviderApi(manager), [manager, state.user?.id]);
}
export function useOwnProvider() {
  const api = useProviderApi();
  const load = useCallback(() => api.me(), [api]);
  return { ...useRemote(load), api };
}
