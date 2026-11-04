import { Redirect, useLocalSearchParams } from "expo-router";
import { Text, View } from "react-native";
import {
  ScreenContainer,
  Header,
  DemoNotice,
  EmptyState,
  PrimaryButton,
  ui,
} from "../../src/components/ui";
import { professionals } from "../../src/demo/catalog";
import { useMode } from "../../src/mode";
export default function Detail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { mode } = useMode();
  if (mode !== "client") return <Redirect href="/" />;
  const person = professionals.find((p) => p.id === id);
  if (!person)
    return (
      <ScreenContainer>
        <Header title="Perfil não encontrado" back />
        <EmptyState
          title="Este perfil não existe"
          description="Volte à busca e escolha um perfil de exemplo."
        />
      </ScreenContainer>
    );
  return (
    <ScreenContainer>
      <Header title={person.name} back subtitle={person.specialty} />
      <DemoNotice />
      <View style={ui.card}>
        <Text style={ui.label}>{person.neighborhood} · ARARANGUÁ</Text>
        <Text style={ui.section}>Sobre o profissional</Text>
        <Text style={ui.text}>{person.description}</Text>
      </View>
      <EmptyState
        title="Atendimento em uma próxima fase"
        description="Preços, avaliações, disponibilidade real e contratação ainda não estão disponíveis."
      />
      <PrimaryButton
        disabled
        title="Solicitar atendimento · em breve"
        onPress={() => undefined}
      />
    </ScreenContainer>
  );
}
