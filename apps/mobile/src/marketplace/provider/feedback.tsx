import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type PropsWithChildren,
} from "react";
import { useFocusEffect } from "expo-router";
import { useSession } from "../../auth/session";
type Scope = "services" | "areas" | "profile";
type Notice = { owner: string; scope: Scope; message: string };
const Context = createContext<{
  notice: Notice | null;
  success: (scope: Scope, message: string) => void;
  clear: (scope: Scope) => void;
} | null>(null);
/** Transient UI feedback only; no API, auth or persistence state lives here. */
export function ProviderUxProvider({ children }: PropsWithChildren) {
  const { state } = useSession();
  const owner = state.user?.id;
  const [notice, setNotice] = useState<Notice | null>(null);
  useEffect(() => {
    setNotice(null);
  }, [owner]);
  const success = useCallback(
    (scope: Scope, message: string) => {
      if (owner) setNotice({ owner, scope, message });
    },
    [owner],
  );
  const clear = useCallback(
    (scope: Scope) =>
      setNotice((value) => (value?.scope === scope ? null : value)),
    [],
  );
  return (
    <Context.Provider
      value={{
        notice: notice?.owner === owner ? notice : null,
        success,
        clear,
      }}
    >
      {children}
    </Context.Provider>
  );
}
export function useProviderNotice(scope: Scope, clearOnBlur = true) {
  const value = useContext(Context);
  if (!value) throw Error("ProviderUxProvider missing");
  const { clear } = value;
  useFocusEffect(
    useCallback(
      () => (clearOnBlur ? () => clear(scope) : undefined),
      [clear, scope, clearOnBlur],
    ),
  );
  return {
    message: value.notice?.scope === scope ? value.notice.message : "",
    success: value.success,
    clear: () => clear(scope),
  };
}
