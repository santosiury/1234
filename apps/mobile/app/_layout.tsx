import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { ModeProvider } from "../src/mode";
export default function Layout() {
  return (
    <SafeAreaProvider>
      <ModeProvider>
        <StatusBar style="dark" />
        <Stack screenOptions={{ headerShown: false }} />
      </ModeProvider>
    </SafeAreaProvider>
  );
}
