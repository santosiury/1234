import {
  createContext,
  PropsWithChildren,
  useContext,
  useEffect,
  useState,
} from "react";
import { AppState } from "react-native";
import { AuthApi } from "./api";
import { SessionManager } from "./session-manager";
import { secureSessionStorage } from "./storage";
const Context = createContext<{
  manager: SessionManager;
  state: SessionManager["state"];
} | null>(null);
export function SessionProvider({
  children,
  manager: supplied,
}: PropsWithChildren<{ manager?: SessionManager }>) {
  const [manager] = useState(
    () => supplied ?? new SessionManager(new AuthApi(), secureSessionStorage),
  );
  const [state, setState] = useState(manager.state);
  useEffect(() => {
    const unsubscribe = manager.subscribe(setState);
    void manager.restore();
    const subscription = AppState.addEventListener("change", (value) => {
      if (value === "active") void manager.sync().catch(() => undefined);
    });
    return () => {
      unsubscribe();
      subscription.remove();
    };
  }, [manager]);
  return (
    <Context.Provider value={{ manager, state }}>{children}</Context.Provider>
  );
}
export function useSession() {
  const value = useContext(Context);
  if (!value) throw new Error("SessionProvider missing");
  return value;
}
