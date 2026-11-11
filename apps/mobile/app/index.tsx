import { useSession } from "../src/auth/session";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import Ionicons from "@expo/vector-icons/Ionicons";
import { router } from "expo-router";
import {
  ScreenContainer,
  PrimaryButton,
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
  return (
    <ScreenContainer dark>
      <StatusBar style="light" />
      <View
        style={[
          ui.row,
          {
            justifyContent: "space-between",
            flexWrap: "wrap",
            paddingVertical: theme.space.sm,
          },
        ]}
      >
        <BrandLogo light width={156} />
        <Text style={[ui.label, ui.onDarkMuted]}>ARARANGUÁ, SC</Text>
      </View>
      <View style={{ gap: theme.space.md, paddingTop: theme.space.md }}>
        <Text style={[ui.label, { color: theme.colors.accent }]}>
          SEU DIA A DIA, MAIS SIMPLES.
        </Text>
        <Text accessibilityRole="header" style={styles.headline}>
          Tudo resolvido.{"\n"}
          <Text style={{ color: theme.colors.onDarkMuted }}>
            Sem dor de cabeça.
          </Text>
        </Text>
        <Text style={[ui.text, ui.onDarkMuted]}>
          Encontre profissionais para cuidar da sua casa e do seu dia a dia em
          Araranguá.
        </Text>
      </View>
      <View
        style={styles.services}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        {(["flash-outline", "water-outline", "construct-outline"] as const).map(
          (icon, index) => (
            <View
              key={icon}
              style={[
                styles.service,
                index === 1 && { backgroundColor: theme.colors.accent },
              ]}
            >
              <Ionicons
                name={icon}
                size={30}
                color={index === 1 ? theme.colors.ink : theme.colors.onDark}
              />
            </View>
          ),
        )}
        <View style={{ flex: 1, minWidth: 80, gap: theme.space.xxs }}>
          <Text style={[ui.small, ui.onDark]}>Gente daqui.</Text>
          <Text style={[ui.small, ui.onDarkMuted]}>Soluções por perto.</Text>
        </View>
      </View>
      {!!state.message && <Feedback message={state.message} />}
      {state.status === "offline" && (
        <PrimaryButton
          secondary
          title="Tentar restaurar sessão"
          onPress={() => void manager.restore()}
        />
      )}
      <View style={ui.group}>
        {state.user ? (
          <PrimaryButton
            title="Minha conta"
            icon="arrow-forward"
            onPress={() => router.push("/account")}
          />
        ) : (
          <>
            <PrimaryButton
              title="Entrar na minha conta"
              icon="arrow-forward"
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
      <View style={{ gap: theme.space.xs }}>
        <Text style={[ui.label, ui.onDarkMuted]}>CONHEÇA O OMINI</Text>
        {(!state.user || state.user.profiles.client) && (
          <ExploreLink
            title="Explorar como cliente"
            onPress={() => {
              setMode("client");
              router.replace("/client");
            }}
          />
        )}
        {(!state.user || state.user.profiles.provider) && (
          <ExploreLink
            title="Conhecer o modo prestador"
            onPress={() => {
              setMode("provider");
              router.replace("/provider");
            }}
          />
        )}
        <DemoNotice dark />
      </View>
      <Text style={[ui.small, ui.onDarkMuted]}>
        Uma conta, duas experiências. Os catálogos continuam demonstrativos
        nesta etapa.
      </Text>
    </ScreenContainer>
  );
}
function ExploreLink({
  title,
  onPress,
}: {
  title: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      onPress={onPress}
      style={({ pressed }) => [
        ui.row,
        {
          minHeight: 48,
          justifyContent: "space-between",
          opacity: pressed ? 0.6 : 1,
        },
      ]}
    >
      <Text
        style={[
          ui.text,
          ui.onDark,
          { fontFamily: theme.fonts.medium, flexShrink: 1 },
        ]}
      >
        {title}
      </Text>
      <Ionicons name="arrow-forward" size={18} color={theme.colors.accent} />
    </Pressable>
  );
}
const styles = StyleSheet.create({
  headline: {
    fontSize: theme.type.display,
    lineHeight: 46,
    letterSpacing: -1.8,
    fontFamily: theme.fonts.bold,
    color: theme.colors.onDark,
  },
  services: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: theme.space.sm,
  },
  service: {
    width: 60,
    height: 68,
    borderRadius: theme.radii.medium,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.darkSurface,
  },
});
