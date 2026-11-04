import { useState } from "react";
import { Text, View, Switch } from "react-native";
import {
  ScreenContainer,
  Header,
  DemoNotice,
  EmptyState,
  ui,
} from "../../src/components/ui";
import { theme } from "../../src/theme";
export default function Dashboard() {
  const [available, setAvailable] = useState(false);
  return (
    <ScreenContainer>
      <Header
        title="Seu talento faz a diferença."
        subtitle="Painel demonstrativo do prestador"
      />
      <DemoNotice />
      <View style={ui.card}>
        <Text style={ui.section}>Disponibilidade de exemplo</Text>
        <View style={ui.row}>
          <Text style={[ui.text, { flex: 1 }]}>
            {available
              ? "Disponível na demonstração"
              : "Indisponível na demonstração"}
          </Text>
          <Switch
            accessibilityLabel="Disponibilidade demonstrativa"
            value={available}
            onValueChange={setAvailable}
            trackColor={{ true: theme.colors.primary }}
          />
        </View>
        <Text style={ui.text}>
          Ajuste local, sem efeito em atendimentos reais. Reinicia ao sair do
          modo prestador.
        </Text>
      </View>
      <EmptyState
        title="Tudo começa com uma conexão"
        description="As solicitações recebidas aparecerão aqui em uma fase futura. Nenhum atendimento está sendo recebido."
      />
    </ScreenContainer>
  );
}
