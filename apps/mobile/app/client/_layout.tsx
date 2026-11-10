import { useSession } from "../../src/auth/session";
import { Redirect } from "expo-router";
import { Tabs } from "expo-router/js-tabs";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useMode } from "../../src/mode";
import { theme } from "../../src/theme";
export default function Layout() {
  const { mode } = useMode();
  const { state } = useSession();
  if (mode !== "client")
    return (
      <Redirect
        href={
          mode === null
            ? state.user
              ? "/account"
              : state.status === "expired"
                ? "/login"
                : "/"
            : "/provider"
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
          title: "Início",
          tabBarIcon: ({ focused, size }) => (
            <Ionicons
              name="home-outline"
              color={focused ? theme.colors.primary : theme.colors.muted}
              size={size}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="search"
        options={{
          title: "Buscar",
          tabBarIcon: ({ focused, size }) => (
            <Ionicons
              name="search-outline"
              color={focused ? theme.colors.primary : theme.colors.muted}
              size={size}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="categories"
        options={{
          title: "Categorias",
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
          title: "Solicitações",
          tabBarIcon: ({ focused, size }) => (
            <Ionicons
              name="chatbubbles-outline"
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
