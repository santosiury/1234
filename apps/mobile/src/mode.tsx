import {
  createContext,
  useContext,
  useEffect,
  useState,
  type PropsWithChildren,
} from "react";
import type { ExperienceMode } from "@omini/shared";
import { useSession } from "./auth/session";
const Context = createContext<{
  mode: ExperienceMode | null;
  setMode: (mode: ExperienceMode) => void;
} | null>(null);
export function ModeProvider({ children }: PropsWithChildren) {
  const { state } = useSession();
  const user = state.user;
  const preferred: ExperienceMode | null = user?.profiles.client
    ? "client"
    : user?.profiles.provider
      ? "provider"
      : null;
  const [selection, setSelection] = useState<{
    userId: string | null;
    mode: ExperienceMode | null;
  }>({ userId: null, mode: null });
  // Derive immediately on identity changes; do not let stale demo/other-account modes leak across sessions.
  const mode = user
    ? selection.userId === user.id &&
      selection.mode &&
      user.profiles[selection.mode]
      ? selection.mode
      : preferred
    : selection.userId === null
      ? selection.mode
      : null;
  const userId = user?.id ?? null;
  useEffect(() => {
    setSelection((previous) =>
      previous.userId === userId ? previous : { userId, mode: preferred },
    );
  }, [userId, preferred]);

  const setMode = (next: ExperienceMode) => {
    if (!user || user.profiles[next])
      setSelection({ userId: user?.id ?? null, mode: next });
  };
  return (
    <Context.Provider value={{ mode, setMode }}>{children}</Context.Provider>
  );
}
export function useMode() {
  const value = useContext(Context);
  if (!value) throw new Error("ModeProvider missing");
  return value;
}
