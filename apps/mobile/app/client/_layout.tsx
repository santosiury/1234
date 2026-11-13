import { useRequestUpdates } from "../../src/requests/notifications/provider";
import { theme } from "../../src/theme";
import { useSession } from "../../src/auth/session";
import { Redirect } from "expo-router";
import { Tabs } from "expo-router/js-tabs";
import { TabIcon, useTabBarOptions } from "../../src/components/TabIcon";
import { useMode } from "../../src/mode";
export default function Layout() {
  const tabBarOptions = useTabBarOptions();
  const { mode, catalogSource } = useMode();
  const { state: updates } = useRequestUpdates();
  const count = catalogSource === "real" ? updates.clientPending : null;
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
    <Tabs screenOptions={tabBarOptions}>
      <Tabs.Screen
        name="index"
        options={{
          title: "Início",
          tabBarIcon: ({ focused, size }) => (
            <TabIcon name="home-outline" focused={focused} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="search"
        options={{
          title: "Buscar",
          tabBarIcon: ({ focused, size }) => (
            <TabIcon name="search-outline" focused={focused} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="categories"
        options={{
          title: "Categorias",
          tabBarIcon: ({ focused, size }) => (
            <TabIcon name="grid-outline" focused={focused} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="requests"
        options={{
          title: "Solicitações",
          tabBarBadge:
            count && count > 0 ? (count > 99 ? "99+" : count) : undefined,
          tabBarBadgeStyle: {
            backgroundColor: theme.colors.accent,
            color: theme.colors.ink,
            fontFamily: theme.fonts.semibold,
          },
          tabBarAccessibilityLabel:
            count && count > 0
              ? `Solicitações, ${count} aguardando sua confirmação`
              : "Solicitações",
          tabBarIcon: ({ focused, size }) => (
            <TabIcon name="chatbubbles-outline" focused={focused} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Perfil",
          tabBarIcon: ({ focused, size }) => (
            <TabIcon name="person-outline" focused={focused} size={size} />
          ),
        }}
      />
    </Tabs>
  );
}
