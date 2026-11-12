import {
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Ionicons from "@expo/vector-icons/Ionicons";
import { router, usePathname } from "expo-router";
import { theme } from "../../theme";

const destinations = [
  { path: "/provider", label: "Painel", icon: "grid-outline" },
  {
    path: "/provider/requests",
    label: "Solicitações",
    icon: "file-tray-outline",
  },
  { path: "/provider/account", label: "Minha conta", icon: "person-outline" },
] as const;
type Destination = (typeof destinations)[number]["path"];

/** A fixed sibling of the existing Stack, not a tab navigator or an overlay. */
export function ProviderNavigation() {
  const pathname = usePathname();
  const { fontScale } = useWindowDimensions();
  const largeText = fontScale >= 1.6;
  if (pathname.endsWith("/edit")) return null;
  const active =
    pathname === "/provider/account"
      ? "/provider/account"
      : pathname === "/provider/requests" ||
          pathname.startsWith("/provider/requests/")
        ? "/provider/requests"
        : "/provider";
  function open(path: Destination) {
    if (pathname === path) return;
    if (path === "/provider") router.dismissTo(path, { withAnchor: true });
    else if (pathname === "/provider") router.push(path, { withAnchor: true });
    // Replace sibling sections: requests/account must never become each other's back destination.
    else router.replace(path, { withAnchor: true });
  }
  return (
    <SafeAreaView edges={["bottom", "left", "right"]} style={styles.safeArea}>
      <View
        accessibilityRole="toolbar"
        accessibilityLabel="Navegação do espaço profissional"
        style={[styles.bar, largeText && styles.largeBar]}
      >
        {destinations.map((item) => {
          const selected = active === item.path;
          return (
            <Pressable
              key={item.path}
              accessibilityRole="button"
              accessibilityLabel={item.label}
              accessibilityState={{ selected }}
              onPress={() => open(item.path)}
              style={({ pressed }) => [
                styles.item,
                largeText && styles.largeItem,
                selected && styles.selected,
                { opacity: pressed ? 0.7 : 1 },
              ]}
            >
              <Ionicons
                name={item.icon}
                size={22}
                color={theme.colors.ink}
                accessible={false}
              />
              <Text
                style={[
                  styles.label,
                  selected && styles.selectedLabel,
                  largeText && styles.largeLabel,
                ]}
              >
                {item.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </SafeAreaView>
  );
}
const styles = StyleSheet.create({
  safeArea: {
    backgroundColor: theme.colors.surface,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  bar: {
    flexDirection: "row",
    alignItems: "stretch",
    padding: theme.space.xs,
    gap: theme.space.xxs,
    width: "100%",
    maxWidth: 660,
    alignSelf: "center",
  },
  item: {
    flex: 1,
    minWidth: 44,
    minHeight: 64,
    paddingHorizontal: theme.space.xxs,
    paddingVertical: theme.space.xs,
    alignItems: "center",
    justifyContent: "center",
    gap: theme.space.xxs,
    borderRadius: theme.radii.small,
    borderWidth: 1,
    borderColor: "transparent",
  },
  selected: {
    backgroundColor: theme.colors.pale,
    borderColor: theme.colors.ink,
  },
  label: {
    fontFamily: theme.fonts.medium,
    fontSize: theme.type.small,
    lineHeight: 20,
    color: theme.colors.ink,
    textAlign: "center",
    minWidth: 0,
    maxWidth: "100%",
  },
  selectedLabel: { fontFamily: theme.fonts.semibold },
  largeBar: { flexDirection: "column" },
  largeItem: {
    flex: 0,
    flexDirection: "row",
    justifyContent: "flex-start",
    paddingHorizontal: theme.space.sm,
    gap: theme.space.sm,
  },
  largeLabel: { flex: 1, textAlign: "left" },
});
