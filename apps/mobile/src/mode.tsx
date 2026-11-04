import {
  createContext,
  useContext,
  useState,
  type PropsWithChildren,
} from "react";
import type { ExperienceMode } from "@omini/shared";
const Context = createContext<{
  mode: ExperienceMode | null;
  setMode: (mode: ExperienceMode) => void;
} | null>(null);
export function ModeProvider({ children }: PropsWithChildren) {
  const [mode, setMode] = useState<ExperienceMode | null>(null);
  return (
    <Context.Provider value={{ mode, setMode }}>{children}</Context.Provider>
  );
}
export function useMode() {
  const value = useContext(Context);
  if (!value) throw new Error("ModeProvider missing");
  return value;
}
