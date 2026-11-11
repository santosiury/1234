import { useEffect } from "react";
import { View } from "react-native";
import { useFonts } from "expo-font";
import { Inter_400Regular } from "@expo-google-fonts/inter/400Regular";
import { Inter_500Medium } from "@expo-google-fonts/inter/500Medium";
import { Inter_600SemiBold } from "@expo-google-fonts/inter/600SemiBold";
import { Inter_700Bold } from "@expo-google-fonts/inter/700Bold";
import * as SplashScreen from "expo-splash-screen";
import { SessionProvider } from "../src/auth/session";
import { SessionGate } from "../src/auth/SessionGate";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { ModeProvider } from "../src/mode";
import { theme } from "../src/theme";

// Called at module scope so the native launch screen cannot disappear too early.
void SplashScreen.preventAutoHideAsync().catch(() => undefined);
export default function Layout() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });
  const fontsReady = fontsLoaded || !!fontError;
  useEffect(() => {
    if (fontsReady) void SplashScreen.hideAsync().catch(() => undefined);
  }, [fontsReady]);
  return (
    <SafeAreaProvider>
      <View style={{ flex: 1, backgroundColor: theme.colors.dark }}>
        <SessionProvider>
          <ModeProvider>
            <SessionGate fontsReady={fontsReady}>
              <StatusBar style="dark" />
              <Stack
                screenOptions={{
                  headerShown: false,
                  contentStyle: { backgroundColor: theme.colors.background },
                }}
              />
            </SessionGate>
          </ModeProvider>
        </SessionProvider>
      </View>
    </SafeAreaProvider>
  );
}
