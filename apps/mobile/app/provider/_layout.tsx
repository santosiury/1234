import { useSession } from "../../src/auth/session";
import { Redirect } from "expo-router";
import { Tabs } from "expo-router/js-tabs";
import { TabIcon, useTabBarOptions } from "../../src/components/TabIcon";
import { useMode } from "../../src/mode";
export default function Layout() {
  const tabBarOptions = useTabBarOptions();
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
    <Tabs screenOptions={tabBarOptions}>
      <Tabs.Screen
        name="index"
        options={{
          title: "Painel",
          tabBarIcon: ({ focused, size }) => (
            <TabIcon name="grid-outline" focused={focused} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="requests"
        options={{
          title: "Recebidas",
          tabBarIcon: ({ focused, size }) => (
            <TabIcon name="file-tray-outline" focused={focused} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="services"
        options={{
          title: "Serviços",
          tabBarIcon: ({ focused, size }) => (
            <TabIcon name="construct-outline" focused={focused} size={size} />
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
