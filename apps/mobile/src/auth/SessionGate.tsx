import type { PropsWithChildren } from "react";
import { ActivityIndicator, Modal, Text } from "react-native";
import { useSession } from "./session";
import { ScreenContainer, ui } from "../components/ui";
export function SessionGate({ children }: PropsWithChildren) {
  const { state } = useSession();
  return (
    <>
      {children}
      <Modal visible={state.status === "loading"} animationType="none">
        <ScreenContainer>
          <ActivityIndicator accessibilityLabel="Restaurando sessão" />
          <Text style={ui.text}>Restaurando sua sessão com segurança…</Text>
        </ScreenContainer>
      </Modal>
    </>
  );
}
