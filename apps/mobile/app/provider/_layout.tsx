import { useSession } from "../../src/auth/session";
import { Redirect } from "expo-router";
import { Tabs } from "expo-router/js-tabs";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useMode } from "../../src/mode";
import { theme } from "../../src/theme";
export default function Layout() {
  const { mode } = useMode();
  const { state } = useSession();
  if (mode !== "provider")
    return (
      <Redirect
        href={
          mode === null
            ? state.user
              ? "/account"
              : state.status === "expired"
                ? "/login"
                : "/"
            : "/client"
        }
      />
    );
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.colors.primary,
        tabBarInactiveTintColor: theme.colors.muted,
        tabBarStyle: { backgroundColor: "white" },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Painel",
          tabBarIcon: ({ focused, size }) => (
            <Ionicons
              name="grid-outline"
              color={focused ? theme.colors.primary : theme.colors.muted}
              size={size}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="requests"
        options={{
          title: "Recebidas",
          tabBarIcon: ({ focused, size }) => (
            <Ionicons
              name="file-tray-outline"
              color={focused ? theme.colors.primary : theme.colors.muted}
              size={size}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="services"
        options={{
          title: "Serviços",
          tabBarIcon: ({ focused, size }) => (
            <Ionicons
              name="construct-outline"
              color={focused ? theme.colors.primary : theme.colors.muted}
              size={size}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Perfil",
          tabBarIcon: ({ focused, size }) => (
            <Ionicons
              name="person-outline"
              color={focused ? theme.colors.primary : theme.colors.muted}
              size={size}
            />
          ),
        }}
      />
    </Tabs>
  );
}
