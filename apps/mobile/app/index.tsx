import { useSession } from "../src/auth/session";
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
  const { state, manager } = useSession();
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
      {!!state.message && (
        <Text accessibilityRole="alert" style={ui.text}>
          {state.message}
        </Text>
      )}
      {state.status === "offline" && (
        <PrimaryButton
          secondary
          title="Tentar restaurar sessão"
          onPress={() => void manager.restore()}
        />
      )}
      {state.user ? (
        <PrimaryButton
          title="Minha conta"
          onPress={() => router.push("/account")}
        />
      ) : (
        <>
          <PrimaryButton
            title="Entrar na minha conta"
            onPress={() => router.push("/login")}
          />
          <PrimaryButton
            secondary
            title="Cadastrar no Omini"
            onPress={() => router.push("/register")}
          />
        </>
      )}
      <DemoNotice />
      {(!state.user || state.user.profiles.client) && (
        <PrimaryButton
          title="Explorar como cliente"
          onPress={() => {
            setMode("client");
            router.replace("/client");
          }}
        />
      )}
      {(!state.user || state.user.profiles.provider) && (
        <PrimaryButton
          secondary
          title="Conhecer o modo prestador"
          onPress={() => {
            setMode("provider");
            router.replace("/provider");
          }}
        />
      )}
      <Text style={ui.text}>
        Uma conta, duas experiências. Os catálogos continuam demonstrativos
        nesta etapa.
      </Text>
    </ScreenContainer>
  );
}
