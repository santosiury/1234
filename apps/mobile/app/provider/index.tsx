import { useState } from "react";
import { Text, View, Switch } from "react-native";
import { router } from "expo-router";
import Ionicons from "@expo/vector-icons/Ionicons";
import {
  ScreenContainer,
  Header,
  DemoNotice,
  EmptyState,
  Badge,
  ActionRow,
  SectionHeading,
  ui,
} from "../../src/components/ui";
import { theme } from "../../src/theme";
export default function Dashboard() {
  const [available, setAvailable] = useState(false);
  return (
    <ScreenContainer>
      <Header
        title="Seu talento faz a diferença."
        subtitle="Seu espaço para oferecer o que faz de melhor."
      />
      <View style={ui.darkCard}>
        <View style={[ui.row, { justifyContent: "space-between" }]}>
          <Badge dark>Painel demonstrativo</Badge>
          <Ionicons
            name="construct-outline"
            size={24}
            color={theme.colors.accent}
          />
        </View>
        <Text style={[ui.section, ui.onDark]}>Disponibilidade de exemplo</Text>
        <View style={ui.row}>
          <Text style={[ui.text, ui.onDark, { flex: 1 }]}>
            {available
              ? "Disponível na demonstração"
              : "Indisponível na demonstração"}
          </Text>
          <Switch
            accessibilityLabel="Disponibilidade demonstrativa"
            value={available}
            onValueChange={setAvailable}
            trackColor={theme.switch}
            thumbColor={theme.colors.ink}
          />
        </View>
        <Text style={[ui.small, ui.onDarkMuted]}>
          Ajuste local, sem efeito em atendimentos reais. Reinicia ao sair do
          modo prestador.
        </Text>
      </View>
      <View style={ui.group}>
        <SectionHeading title="Seu trabalho, em um lugar" />
        <ActionRow
          title="Meus serviços"
          description="Explore esta área demonstrativa"
          icon="briefcase-outline"
          onPress={() => router.push("/provider/services")}
        />
        <ActionRow
          title="Perfil profissional"
          description="Sua conta e os seus perfis"
          icon="person-outline"
          onPress={() => router.push("/provider/profile")}
        />
      </View>
      <View style={ui.group}>
        <SectionHeading
          title="Solicitações"
          action="Ver área"
          onPress={() => router.push("/provider/requests")}
        />
        <EmptyState
          title="Tudo começa com uma conexão"
          description="As solicitações recebidas aparecerão aqui em uma fase futura. Nenhum atendimento está sendo recebido."
        />
      </View>
      <DemoNotice />
    </ScreenContainer>
  );
}
