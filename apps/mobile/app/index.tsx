import { Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { router } from "expo-router";
import {
  ScreenContainer,
  PrimaryButton,
  DemoNotice,
  ui,
} from "../src/components/ui";
import { useMode } from "../src/mode";
import { theme } from "../src/theme";
export default function Welcome() {
  const { setMode } = useMode();
  return (
    <ScreenContainer>
      <Text style={[ui.title, { fontSize: 46, marginTop: 24 }]}>
        Omini<Text style={{ color: theme.colors.primary }}>.</Text>
      </Text>
      <Text style={ui.label}>GENTE DAQUI. SOLUÇÕES POR PERTO.</Text>
      <View
        style={{
          backgroundColor: theme.colors.pale,
          padding: 36,
          borderRadius: 32,
          alignItems: "center",
          gap: 20,
        }}
      >
        <Ionicons
          name="people-outline"
          color={theme.colors.primary}
          size={88}
        />
        <Text style={ui.title}>Seu próximo cuidado começa aqui.</Text>
      </View>
      <Text style={ui.text}>
        Encontre profissionais para cuidar da sua casa e do seu dia a dia em
        Araranguá.
      </Text>
      <DemoNotice />
      <PrimaryButton
        title="Explorar como cliente"
        onPress={() => {
          setMode("client");
          router.replace("/client");
        }}
      />
      <PrimaryButton
        secondary
        title="Conhecer o modo prestador"
        onPress={() => {
          setMode("provider");
          router.replace("/provider");
        }}
      />
      <Text style={ui.text}>
        Uma conta, duas experiências. A autenticação será implementada em outra
        fase.
      </Text>
    </ScreenContainer>
  );
}
