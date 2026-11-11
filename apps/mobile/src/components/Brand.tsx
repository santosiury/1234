import {
  ActivityIndicator,
  Image,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import { theme } from "../theme";

import wordmarkLight from "../../assets/brand/wordmark-light.png";
import wordmarkDark from "../../assets/brand/wordmark-dark.png";
import splashLockup from "../../assets/brand/splash-lockup.png";

export const slogan = "Tudo resolvido. Sem dor de cabeça.";
export function BrandLogo({
  light = false,
  width = 148,
}: {
  light?: boolean;
  width?: number;
}) {
  return (
    <Image
      accessibilityRole="image"
      accessibilityLabel="Omini"
      source={light ? wordmarkLight : wordmarkDark}
      resizeMode="contain"
      style={{ width, maxWidth: "100%", height: (width * 148) / 583 }}
    />
  );
}

/** Native launch and JS restoration share the same lockup and black surface. */
export function OminiLoadingState({
  restoring = true,
}: {
  restoring?: boolean;
}) {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const logoWidth = Math.min(280, width - theme.space.lg * 2);
  return (
    <SafeAreaView style={styles.screen}>
      <StatusBar style="light" />
      <View style={styles.center}>
        <Image
          accessibilityRole="image"
          accessibilityLabel={`Omini. ${slogan}`}
          source={splashLockup}
          resizeMode="contain"
          style={[
            styles.lockup,
            { width: logoWidth, height: (logoWidth * 624) / 1749 },
          ]}
        />
      </View>
      <View
        style={[styles.progress, { bottom: insets.bottom + theme.space.md }]}
      >
        <ActivityIndicator
          accessibilityLabel={
            restoring ? "Restaurando sessão" : "Preparando Omini"
          }
          color={theme.colors.accent}
        />
        <Text accessibilityLiveRegion="polite" style={styles.hint}>
          {restoring
            ? "Restaurando sua sessão com segurança…"
            : "Preparando seu Omini…"}
        </Text>
      </View>
    </SafeAreaView>
  );
}
const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: theme.colors.dark,
    padding: theme.space.lg,
  },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  lockup: { maxWidth: "100%" },
  progress: {
    position: "absolute",
    left: theme.space.lg,
    right: theme.space.lg,
    gap: theme.space.sm,
    alignItems: "center",
    paddingVertical: theme.space.md,
  },
  hint: {
    fontFamily: theme.fonts.regular,
    fontSize: theme.type.small,
    lineHeight: 21,
    textAlign: "center",
    color: theme.colors.onDarkMuted,
  },
});
