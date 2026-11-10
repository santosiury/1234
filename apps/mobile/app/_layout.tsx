import { SessionProvider } from "../src/auth/session";
import { SessionGate } from "../src/auth/SessionGate";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { ModeProvider } from "../src/mode";
export default function Layout() {
  return (
    <SafeAreaProvider>
      <SessionProvider>
        <ModeProvider>
          <SessionGate>
            <StatusBar style="dark" />
            <Stack screenOptions={{ headerShown: false }} />
          </SessionGate>
        </ModeProvider>
      </SessionProvider>
    </SafeAreaProvider>
  );
}
