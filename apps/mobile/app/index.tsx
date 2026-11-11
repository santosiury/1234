import { useState } from "react";
import { useSession } from "../src/auth/session";
import { StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import {
  ScreenContainer,
  PrimaryButton,
  TextButton,
  DemoNotice,
  Feedback,
  ui,
} from "../src/components/ui";
import { BrandLogo } from "../src/components/Brand";
import { useMode } from "../src/mode";
import { theme } from "../src/theme";
export default function Welcome() {
  const { setMode } = useMode();
  const { state, manager } = useSession();
  const [exploring, setExploring] = useState(false);
  return (
    <ScreenContainer dark compact>
      <BrandLogo light width={148} />
      <View style={styles.intro}>
        <Text accessibilityRole="header" style={styles.headline}>
          Tudo resolvido.{"\n"}
          <Text style={ui.onDarkMuted}>Sem dor de cabeça.</Text>
        </Text>
        <Text style={[ui.text, ui.onDarkMuted]}>
          Profissionais para o seu dia a dia em Araranguá.
        </Text>
      </View>
      <View style={ui.group}>
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
      </View>
      <View style={ui.group}>
        <TextButton
          title="Explorar demonstração"
          light
          expanded={exploring}
          icon={exploring ? "chevron-up" : "chevron-down"}
          onPress={() => setExploring((value) => !value)}
        />
        {exploring && (
          <>
            <DemoNotice dark />
            {(!state.user || state.user.profiles.client) && (
              <TextButton
                light
                title="Explorar como cliente"
                onPress={() => {
                  setMode("client");
                  router.replace("/client");
                }}
              />
            )}
            {(!state.user || state.user.profiles.provider) && (
              <TextButton
                light
                title="Conhecer o modo prestador"
                onPress={() => {
                  setMode("provider");
                  router.replace("/provider");
                }}
              />
            )}
          </>
        )}
      </View>
      {!!state.message && <Feedback message={state.message} />}
      {state.status === "offline" && (
        <PrimaryButton
          secondary
          title="Tentar restaurar sessão"
          onPress={() => void manager.restore()}
        />
      )}
    </ScreenContainer>
  );
}
const styles = StyleSheet.create({
  intro: { gap: theme.space.sm },
  headline: {
    alignSelf: "stretch",
    paddingRight: 2,
    fontSize: theme.type.title,
    lineHeight: 40,
    letterSpacing: -0.8,
    fontFamily: theme.fonts.bold,
    color: theme.colors.onDark,
  },
});
