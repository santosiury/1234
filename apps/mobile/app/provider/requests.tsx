import { router } from "expo-router";
import {
  ScreenContainer,
  Header,
  FutureFeature,
} from "../../src/components/ui";
export default function Requests() {
  return (
    <ScreenContainer>
      <Header
        title="Solicitações recebidas"
        back
        onBack={() => router.dismissTo("/provider")}
      />
      <FutureFeature title="Nenhuma solicitação nesta demonstração" />
    </ScreenContainer>
  );
}
