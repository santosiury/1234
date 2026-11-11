import type { PropsWithChildren } from "react";
import { Modal } from "react-native";
import { useSession } from "./session";
import { OminiLoadingState } from "../components/Brand";
export function SessionGate({
  children,
  fontsReady = true,
}: PropsWithChildren<{ fontsReady?: boolean }>) {
  const { state } = useSession();
  return (
    <>
      {children}
      <Modal
        visible={!fontsReady || state.status === "loading"}
        animationType="none"
        statusBarTranslucent
        navigationBarTranslucent
        presentationStyle="fullScreen"
      >
        <OminiLoadingState restoring={state.status === "loading"} />
      </Modal>
    </>
  );
}
