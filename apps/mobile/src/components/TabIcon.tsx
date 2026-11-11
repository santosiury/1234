import type { ComponentProps } from "react";
import { StyleSheet, View, useWindowDimensions } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { theme } from "../theme";
const tabBarOptions = {
  tabBarLabelPosition: "below-icon" as const,
  tabBarAllowFontScaling: true,
  headerShown: false,
  tabBarActiveTintColor: theme.colors.ink,
  tabBarInactiveTintColor: theme.colors.muted,
  tabBarStyle: {
    backgroundColor: theme.colors.surface,
    borderTopColor: theme.colors.border,
    paddingTop: 4,
  },
  tabBarLabelStyle: {
    fontFamily: theme.fonts.medium,
    fontSize: 11,
    lineHeight: 16,
    marginBottom: 0,
  },
  tabBarIconStyle: { height: 30, marginBottom: 2 },
};
export function useTabBarOptions() {
  const insets = useSafeAreaInsets();
  const { fontScale } = useWindowDimensions();
  return {
    ...tabBarOptions,
    tabBarStyle: {
      ...tabBarOptions.tabBarStyle,
      height: 64 + insets.bottom + Math.max(0, fontScale - 1) * 44,
    },
  };
}
export function TabIcon({
  focused,
  name,
  size,
}: {
  focused: boolean;
  name: ComponentProps<typeof Ionicons>["name"];
  size: number;
}) {
  return (
    <View
      style={[styles.icon, focused && { backgroundColor: theme.colors.accent }]}
    >
      <Ionicons
        name={name}
        size={Math.min(size, 22)}
        color={focused ? theme.colors.ink : theme.colors.muted}
      />
    </View>
  );
}
const styles = StyleSheet.create({
  icon: {
    width: 46,
    height: 30,
    borderRadius: theme.radii.pill,
    alignItems: "center",
    justifyContent: "center",
  },
});
