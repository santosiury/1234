import { router } from "expo-router";
import {
  ScreenContainer,
  EmptyState,
  PrimaryButton,
} from "../src/components/ui";
export default function NotFound() {
  return (
    <ScreenContainer>
      <EmptyState
        title="Página não encontrada"
        description="Este caminho não faz parte da experiência demonstrativa."
      />
      <PrimaryButton
        title="Ir para o início"
        onPress={() => router.replace("/")}
      />
    </ScreenContainer>
  );
}
