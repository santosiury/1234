import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type PropsWithChildren,
} from "react";
import { useSession } from "../auth/session";
const Context = createContext<{
  sent: { owner: string; id: string } | null;
  confirm: (owner: string, id: string) => void;
  clear: () => void;
} | null>(null);
export function RequestFeedbackProvider({ children }: PropsWithChildren) {
  const { state } = useSession();
  const [sent, setSent] = useState<{ owner: string; id: string } | null>(null);
  useEffect(() => setSent(null), [state.user?.id]);
  const confirm = useCallback(
      (owner: string, id: string) => setSent({ owner, id }),
      [],
    ),
    clear = useCallback(() => setSent(null), []);
  return (
    <Context.Provider value={{ sent, confirm, clear }}>
      {children}
    </Context.Provider>
  );
}
export function useRequestFeedback() {
  const ctx = useContext(Context);
  const { state } = useSession();
  if (!ctx) throw Error("RequestFeedbackProvider missing");
  return { ...ctx, sent: ctx.sent?.owner === state.user?.id ? ctx.sent : null };
}
