import { Redirect, useLocalSearchParams } from "expo-router";
import { Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import {
  ScreenContainer,
  Header,
  DemoNotice,
  EmptyState,
  PrimaryButton,
  Avatar,
  Badge,
  ui,
} from "../../src/components/ui";
import { professionals } from "../../src/demo/catalog";
import { useMode } from "../../src/mode";
import { theme } from "../../src/theme";
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
          icon="person-outline"
        />
      </ScreenContainer>
    );
  return (
    <ScreenContainer>
      <Header title="Conheça o profissional" back />
      <View style={ui.darkCard}>
        <View style={[ui.row, { flexWrap: "wrap", gap: theme.space.md }]}>
          <Avatar initials={person.initials} large />
          <Badge dark>Perfil fictício</Badge>
        </View>
        <Text accessibilityRole="header" style={[ui.title, ui.onDark]}>
          {person.name}
        </Text>
        <Text
          style={[
            ui.text,
            { color: theme.colors.accent, fontFamily: theme.fonts.medium },
          ]}
        >
          {person.specialty}
        </Text>
        <View style={ui.row}>
          <Ionicons
            name="location-outline"
            size={18}
            color={theme.colors.onDarkMuted}
          />
          <Text style={[ui.small, ui.onDarkMuted, { flex: 1 }]}>
            {person.neighborhood} · Araranguá, SC
          </Text>
        </View>
      </View>
      <View style={ui.card}>
        <Text style={ui.section}>Sobre o profissional</Text>
        <Text style={ui.text}>{person.description}</Text>
      </View>
      <DemoNotice />
      <EmptyState
        title="Atendimento em uma próxima fase"
        description="Preços, avaliações, disponibilidade real e contratação ainda não estão disponíveis."
        icon="lock-closed-outline"
      />
      <PrimaryButton
        disabled
        title="Solicitar atendimento · em breve"
        onPress={() => undefined}
      />
    </ScreenContainer>
  );
}
