import type { ComponentProps, PropsWithChildren } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Ionicons from "@expo/vector-icons/Ionicons";
import { router } from "expo-router";
import type { DemoProfessional, ServiceCategory } from "@omini/shared";
import { theme } from "../theme";
export const ui = StyleSheet.create({
  title: {
    fontSize: 30,
    fontWeight: "800",
    color: theme.colors.ink,
    letterSpacing: -1,
  },
  section: { fontSize: 20, fontWeight: "700", color: theme.colors.ink },
  text: { fontSize: 16, lineHeight: 24, color: theme.colors.muted },
  label: {
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 1.2,
    color: theme.colors.primary,
  },
  card: {
    padding: 20,
    borderRadius: 20,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    gap: 12,
  },
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  input: {
    backgroundColor: "white",
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 16,
    padding: 16,
    fontSize: 16,
    color: theme.colors.ink,
  },
});
export function ScreenContainer({ children }: PropsWithChildren) {
  return (
    <SafeAreaView
      edges={["top", "left", "right"]}
      style={{ flex: 1, backgroundColor: theme.colors.background }}
    >
      <ScrollView
        automaticallyAdjustKeyboardInsets
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ padding: 20, gap: 24, paddingBottom: 40 }}
      >
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}
export function Header({
  title,
  subtitle,
  back = false,
}: {
  title: string;
  subtitle?: string;
  back?: boolean;
}) {
  return (
    <View style={{ gap: 8 }}>
      {back && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Voltar"
          hitSlop={12}
          onPress={() =>
            router.canGoBack() ? router.back() : router.replace("/")
          }
        >
          <Ionicons name="arrow-back" size={26} color={theme.colors.primary} />
        </Pressable>
      )}
      <Text style={ui.label}>OMINI · ARARANGUÁ, SC</Text>
      <Text accessibilityRole="header" style={ui.title}>
        {title}
      </Text>
      {subtitle && <Text style={ui.text}>{subtitle}</Text>}
    </View>
  );
}
export function PrimaryButton({
  title,
  onPress,
  secondary = false,
  loading = false,
  disabled = false,
}: {
  title: string;
  onPress: () => void;
  secondary?: boolean;
  loading?: boolean;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: disabled || loading, busy: loading }}
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => ({
        borderRadius: 16,
        paddingVertical: 16,
        paddingHorizontal: 20,
        alignItems: "center",
        justifyContent: "center",
        minHeight: 52,
        backgroundColor: secondary ? theme.colors.pale : theme.colors.primary,
        opacity: disabled ? 0.55 : pressed ? 0.8 : 1,
      })}
    >
      {loading ? (
        <ActivityIndicator color={secondary ? theme.colors.primary : "white"} />
      ) : (
        <Text
          style={{
            color: secondary ? theme.colors.primary : "white",
            fontSize: 16,
            fontWeight: "700",
            textAlign: "center",
          }}
        >
          {title}
        </Text>
      )}
    </Pressable>
  );
}
export function EmptyState({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <View style={[ui.card, { alignItems: "center", paddingVertical: 36 }]}>
      <Ionicons name="leaf-outline" size={36} color={theme.colors.primary} />
      <Text style={[ui.section, { textAlign: "center" }]}>{title}</Text>
      <Text style={[ui.text, { textAlign: "center" }]}>{description}</Text>
    </View>
  );
}
export function ServiceCategoryCard({
  category,
  onPress,
}: {
  category: ServiceCategory;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={[ui.card, { width: "48%", minHeight: 128 }]}
    >
      <Ionicons
        name={category.icon as ComponentProps<typeof Ionicons>["name"]}
        size={28}
        color={theme.colors.primary}
      />
      <Text
        style={{ fontSize: 15, fontWeight: "600", color: theme.colors.ink }}
      >
        {category.name}
      </Text>
    </Pressable>
  );
}
export function ProfessionalCard({
  professional,
}: {
  professional: DemoProfessional;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Ver perfil demonstrativo de ${professional.name}`}
      onPress={() =>
        router.push({
          pathname: "/professional/[id]",
          params: { id: professional.id },
        })
      }
      style={ui.card}
    >
      <View style={ui.row}>
        <View
          style={{
            backgroundColor: theme.colors.pale,
            padding: 16,
            borderRadius: 18,
          }}
        >
          <Text style={ui.section}>{professional.initials}</Text>
        </View>
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={ui.section}>{professional.name}</Text>
          <Text style={ui.text}>{professional.specialty}</Text>
        </View>
        <Ionicons name="arrow-forward" size={20} color={theme.colors.primary} />
      </View>
      <Text style={ui.text}>{professional.neighborhood} · Perfil fictício</Text>
    </Pressable>
  );
}
export function DemoNotice() {
  return (
    <View
      style={{
        backgroundColor: theme.colors.accent,
        padding: 12,
        borderRadius: 12,
      }}
    >
      <Text style={{ color: theme.colors.ink, fontSize: 13, lineHeight: 19 }}>
        Catálogo demonstrativo · profissionais fictícios e contratação ainda
        indisponível.
      </Text>
    </View>
  );
}
export function FutureFeature({ title }: { title: string }) {
  return (
    <>
      <EmptyState
        title={title}
        description="Esta funcionalidade ainda não está disponível. Nenhuma solicitação será criada nesta demonstração."
      />
      <PrimaryButton
        title="Em breve · indisponível"
        disabled
        onPress={() => undefined}
      />
    </>
  );
}
