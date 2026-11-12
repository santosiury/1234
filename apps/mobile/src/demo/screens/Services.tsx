import { router } from "expo-router";
import { ScreenContainer, Header, FutureFeature } from "../../components/ui";
export default function Services() {
  return (
    <ScreenContainer>
      <Header
        back
        onBack={() => router.dismissTo("/provider")}
        title="Seu trabalho, seu espaço"
        subtitle="Gerencie suas especialidades em uma próxima fase."
      />
      <FutureFeature title="Cadastro de serviços em breve" />
    </ScreenContainer>
  );
}
