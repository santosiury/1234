import {
  useState,
  type ComponentProps,
  type PropsWithChildren,
  type ReactNode,
} from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import Ionicons from "@expo/vector-icons/Ionicons";
import { router } from "expo-router";
import { StatusBar } from "expo-status-bar";
import type { DemoProfessional, ServiceCategory } from "@omini/shared";
import { theme } from "../theme";
import { BrandLogo } from "./Brand";

type IconName = ComponentProps<typeof Ionicons>["name"];
export const ui = StyleSheet.create({
  title: {
    fontSize: theme.type.title,
    fontFamily: theme.fonts.bold,
    color: theme.colors.ink,
    letterSpacing: -1.3,
    lineHeight: 39,
  },
  section: {
    fontSize: theme.type.section,
    fontFamily: theme.fonts.semibold,
    color: theme.colors.ink,
    letterSpacing: -0.6,
    lineHeight: 27,
  },
  text: {
    fontSize: theme.type.body,
    fontFamily: theme.fonts.regular,
    lineHeight: 24,
    color: theme.colors.muted,
  },
  small: {
    fontSize: theme.type.small,
    fontFamily: theme.fonts.regular,
    lineHeight: 21,
    color: theme.colors.muted,
  },
  label: {
    fontSize: theme.type.caption,
    fontFamily: theme.fonts.semibold,
    letterSpacing: 1.2,
    color: theme.colors.muted,
    lineHeight: 18,
  },
  card: {
    padding: theme.space.md,
    borderRadius: theme.radii.card,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    gap: theme.space.sm,
  },
  row: { flexDirection: "row", alignItems: "center", gap: theme.space.sm },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: theme.space.sm },
  group: { gap: theme.space.sm },
  darkCard: {
    padding: theme.space.lg,
    borderRadius: theme.radii.card,
    backgroundColor: theme.colors.dark,
    gap: theme.space.sm,
  },
  onDark: { color: theme.colors.onDark },
  onDarkMuted: { color: theme.colors.onDarkMuted },
  input: {
    flex: 1,
    minWidth: 0,
    paddingVertical: 16,
    fontSize: theme.type.body,
    fontFamily: theme.fonts.regular,
    color: theme.colors.ink,
  },
});

export function ScreenContainer({
  children,
  dark = false,
  compact = false,
}: PropsWithChildren<{ dark?: boolean; compact?: boolean }>) {
  const insets = useSafeAreaInsets();
  const contentGap = compact ? theme.space.md : theme.space.lg;
  return (
    <SafeAreaView
      edges={["top", "left", "right"]}
      style={{
        flex: 1,
        backgroundColor: dark ? theme.colors.dark : theme.colors.background,
      }}
    >
      <StatusBar style={dark ? "light" : "dark"} />
      <ScrollView
        keyboardDismissMode="on-drag"
        automaticallyAdjustKeyboardInsets
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          padding: theme.space.md,
          paddingBottom: contentGap + insets.bottom,
          flexGrow: 1,
        }}
      >
        <View
          style={{
            width: "100%",
            maxWidth: 620,
            alignSelf: "center",
            gap: contentGap,
            flexGrow: 1,
          }}
        >
          {children}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

export function Header({
  title,
  subtitle,
  back = false,
  onBack,
  action,
}: {
  title: string;
  subtitle?: string;
  back?: boolean;
  onBack?: () => void;
  action?: ReactNode;
}) {
  return (
    <View style={{ gap: theme.space.md }}>
      <View
        style={[
          ui.row,
          { justifyContent: "space-between", minHeight: 44, flexWrap: "wrap" },
        ]}
      >
        <View style={ui.row}>
          {back && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Voltar"
              onPress={
                onBack ??
                (() =>
                  router.canGoBack() ? router.back() : router.replace("/"))
              }
              style={({ pressed }) => ({
                minHeight: 44,
                minWidth: 44,
                alignItems: "center",
                justifyContent: "center",
                borderRadius: theme.radii.pill,
                backgroundColor: pressed
                  ? theme.colors.border
                  : theme.colors.surface,
              })}
            >
              <Ionicons name="arrow-back" size={21} color={theme.colors.ink} />
            </Pressable>
          )}
          <BrandLogo width={104} />
        </View>
        {action ?? (
          <View style={{ flexShrink: 1, alignItems: "flex-end" }}>
            <Text style={ui.label}>ARARANGUÁ</Text>
            <Text style={ui.small}>Santa Catarina</Text>
          </View>
        )}
      </View>
      <View style={{ gap: theme.space.xs }}>
        <Text accessibilityRole="header" style={ui.title}>
          {title}
        </Text>
        {subtitle && <Text style={ui.text}>{subtitle}</Text>}
      </View>
    </View>
  );
}

export function PrimaryButton({
  title,
  onPress,
  secondary = false,
  loading = false,
  disabled = false,
  variant,
  icon,
}: {
  title: string;
  onPress: () => void;
  secondary?: boolean;
  loading?: boolean;
  disabled?: boolean;
  variant?: "lime" | "dark" | "outline" | "ghost" | "danger";
  icon?: IconName;
}) {
  const kind = variant ?? (secondary ? "outline" : "lime");
  const background =
    kind === "lime"
      ? theme.colors.accent
      : kind === "dark"
        ? theme.colors.dark
        : kind === "danger"
          ? theme.colors.dangerSurface
          : kind === "ghost"
            ? "transparent"
            : theme.colors.surface;
  const foreground =
    kind === "dark"
      ? theme.colors.onDark
      : kind === "danger"
        ? theme.colors.danger
        : theme.colors.ink;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled: disabled || loading, busy: loading }}
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => ({
        borderRadius: theme.radii.medium,
        paddingVertical: theme.space.sm + 2,
        paddingHorizontal: theme.space.sm + 4,
        alignSelf: "stretch",
        minWidth: 0,
        alignItems: "center",
        justifyContent: "center",
        minHeight: 56,
        backgroundColor: disabled ? theme.colors.disabled : background,
        borderWidth: kind === "outline" ? 1 : 0,
        borderColor: theme.colors.border,
        opacity: pressed ? 0.76 : 1,
      })}
    >
      <ButtonContent
        title={title}
        loading={loading}
        icon={icon}
        color={disabled ? theme.colors.muted : foreground}
      />
    </Pressable>
  );
}

/** Bounded label shared by filled CTAs and quieter text actions. No line cap. */
function ButtonContent({
  title,
  icon,
  loading = false,
  color,
}: {
  title: string;
  icon?: IconName;
  loading?: boolean;
  color: string;
}) {
  return (
    <View style={buttonStyles.content}>
      {(loading || icon) && (
        <View
          style={buttonStyles.icon}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          {loading ? (
            <ActivityIndicator color={color} size="small" />
          ) : (
            <Ionicons name={icon} size={20} color={color} />
          )}
        </View>
      )}
      <Text style={[buttonStyles.label, { color }]}>{title}</Text>
    </View>
  );
}

export function TextButton({
  title,
  onPress,
  icon,
  light = false,
  expanded,
  disabled = false,
}: {
  title: string;
  onPress: () => void;
  icon?: IconName;
  light?: boolean;
  expanded?: boolean;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{
        disabled,
        ...(expanded === undefined ? {} : { expanded }),
      }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        buttonStyles.textAction,
        { opacity: disabled ? 0.55 : pressed ? 0.7 : 1 },
      ]}
    >
      <ButtonContent
        title={title}
        icon={icon}
        color={light ? theme.colors.onDarkMuted : theme.colors.ink}
      />
    </Pressable>
  );
}

const buttonStyles = StyleSheet.create({
  content: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: theme.space.xs,
    width: "100%",
    minWidth: 0,
    flexShrink: 1,
  },
  label: {
    flex: 1,
    minWidth: 0,
    // A small inset also leaves room for edge glyphs/kerning in native text layout.
    paddingHorizontal: 2,
    fontSize: theme.type.body,
    lineHeight: 24,
    fontFamily: theme.fonts.semibold,
    textAlign: "center",
  },
  icon: {
    flexShrink: 0,
    width: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  textAction: {
    alignSelf: "stretch",
    minWidth: 0,
    minHeight: 48,
    paddingHorizontal: theme.space.xs,
    paddingVertical: theme.space.sm,
    justifyContent: "center",
  },
});

export function OminiInput({
  label,
  icon,
  hint,
  error,
  ...props
}: ComponentProps<typeof TextInput> & {
  label?: string;
  icon?: IconName;
  hint?: string;
  error?: boolean;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={{ gap: theme.space.xs }}>
      {label && (
        <Text
          style={{
            fontFamily: theme.fonts.semibold,
            fontSize: theme.type.small,
            color: theme.colors.ink,
          }}
        >
          {label}
        </Text>
      )}
      <View
        style={[
          ui.row,
          {
            backgroundColor: theme.colors.surface,
            borderWidth: 1,
            borderColor: error
              ? theme.colors.danger
              : focused
                ? theme.colors.focus
                : theme.colors.inputBorder,
            borderRadius: theme.radii.medium,
            paddingHorizontal: theme.space.md,
            minHeight: 56,
          },
        ]}
      >
        {icon && (
          <Ionicons
            name={icon}
            size={20}
            color={focused ? theme.colors.ink : theme.colors.muted}
          />
        )}
        <TextInput
          {...props}
          placeholderTextColor={theme.colors.muted}
          selectionColor={theme.colors.focus}
          style={[
            ui.input,
            props.multiline && { minHeight: 112, textAlignVertical: "top" },
            props.style,
          ]}
          onFocus={(e) => {
            setFocused(true);
            props.onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            props.onBlur?.(e);
          }}
        />
      </View>
      {hint && <Text style={ui.small}>{hint}</Text>}
    </View>
  );
}

export function Badge({
  children,
  dark = false,
}: PropsWithChildren<{ dark?: boolean }>) {
  return (
    <View
      style={{
        alignSelf: "flex-start",
        backgroundColor: dark ? theme.colors.darkSurface : theme.colors.pale,
        borderRadius: theme.radii.pill,
        paddingHorizontal: theme.space.sm,
        paddingVertical: theme.space.xxs + 2,
      }}
    >
      <Text
        style={{
          color: dark ? theme.colors.accent : theme.colors.ink,
          fontFamily: theme.fonts.semibold,
          fontSize: theme.type.caption,
          lineHeight: 18,
        }}
      >
        {children}
      </Text>
    </View>
  );
}

export function Feedback({
  message,
  error = true,
}: {
  message: string;
  error?: boolean;
}) {
  return (
    <View
      style={[
        ui.card,
        {
          backgroundColor: error
            ? theme.colors.dangerSurface
            : theme.colors.pale,
          borderWidth: 0,
        },
      ]}
    >
      <View style={[ui.row, { alignItems: "flex-start" }]}>
        <Ionicons
          name={error ? "alert-circle-outline" : "checkmark-circle-outline"}
          size={21}
          color={error ? theme.colors.danger : theme.colors.success}
        />
        <Text
          accessibilityRole="alert"
          accessibilityLiveRegion="polite"
          style={[
            ui.small,
            { flex: 1, color: error ? theme.colors.danger : theme.colors.ink },
          ]}
        >
          {message}
        </Text>
      </View>
    </View>
  );
}

export function EmptyState({
  title,
  description,
  icon = "file-tray-outline",
}: {
  title: string;
  description: string;
  icon?: IconName;
}) {
  return (
    <View
      style={[
        ui.card,
        {
          alignItems: "center",
          paddingVertical: theme.space.xl,
          gap: theme.space.md,
        },
      ]}
    >
      <View
        style={{
          padding: theme.space.md,
          backgroundColor: theme.colors.background,
          borderRadius: theme.radii.card,
        }}
      >
        <Ionicons name={icon} size={30} color={theme.colors.ink} />
      </View>
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
      accessibilityLabel={category.name}
      onPress={onPress}
      style={({ pressed }) => [
        ui.card,
        {
          flexBasis: "46%",
          flexGrow: 1,
          minWidth: 120,
          minHeight: 144,
          backgroundColor: pressed ? theme.colors.pale : theme.colors.surface,
          justifyContent: "space-between",
        },
      ]}
    >
      <View
        style={{
          alignSelf: "flex-start",
          padding: theme.space.sm,
          backgroundColor: theme.colors.pale,
          borderRadius: theme.radii.small,
        }}
      >
        <Ionicons
          name={category.icon as IconName}
          size={24}
          color={theme.colors.ink}
        />
      </View>
      <Text
        style={{
          fontSize: theme.type.small,
          lineHeight: 21,
          fontFamily: theme.fonts.semibold,
          color: theme.colors.ink,
        }}
      >
        {category.name}
      </Text>
    </Pressable>
  );
}

export function Avatar({
  initials,
  large = false,
}: {
  initials: string;
  large?: boolean;
}) {
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{
        width: large ? 84 : 56,
        height: large ? 84 : 56,
        borderRadius: large ? theme.radii.card : theme.radii.medium,
        backgroundColor: theme.colors.pale,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Text
        style={{
          fontFamily: theme.fonts.bold,
          fontSize: large ? 30 : 18,
          color: theme.colors.ink,
        }}
      >
        {initials}
      </Text>
    </View>
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
      style={({ pressed }) => [
        ui.card,
        { backgroundColor: pressed ? theme.colors.pale : theme.colors.surface },
      ]}
    >
      <View style={ui.row}>
        <Avatar initials={professional.initials} />
        <View style={{ flex: 1, gap: theme.space.xxs }}>
          <Text
            style={{
              fontSize: 17,
              fontFamily: theme.fonts.semibold,
              color: theme.colors.ink,
            }}
          >
            {professional.name}
          </Text>
          <Text style={ui.small}>{professional.specialty}</Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={theme.colors.ink} />
      </View>
      <View
        style={[ui.row, { flexWrap: "wrap", justifyContent: "space-between" }]}
      >
        <Text style={ui.small}>{professional.neighborhood}</Text>
        <Badge>Perfil fictício</Badge>
      </View>
    </Pressable>
  );
}

export function DemoNotice({ dark = false }: { dark?: boolean }) {
  return (
    <View
      style={[
        ui.row,
        {
          alignItems: "flex-start",
          backgroundColor: dark
            ? theme.colors.darkSurface
            : theme.colors.surface,
          padding: theme.space.sm,
          borderRadius: theme.radii.small,
        },
      ]}
    >
      <Ionicons
        name="information-circle-outline"
        color={dark ? theme.colors.accent : theme.colors.muted}
        size={19}
      />
      <Text
        style={[
          ui.small,
          {
            flex: 1,
            fontSize: theme.type.caption,
            lineHeight: 18,
            color: dark ? theme.colors.onDarkMuted : theme.colors.muted,
          },
        ]}
      >
        Catálogo demonstrativo · profissionais fictícios e contratação ainda
        indisponível.
      </Text>
    </View>
  );
}

export function SectionHeading({
  title,
  action,
  onPress,
}: {
  title: string;
  action?: string;
  onPress?: () => void;
}) {
  return (
    <View
      style={[
        ui.row,
        {
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
        },
      ]}
    >
      <Text accessibilityRole="header" style={[ui.section, { flexShrink: 1 }]}>
        {title}
      </Text>
      {action && onPress && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={action}
          onPress={onPress}
          style={({ pressed }) => ({
            minHeight: 44,
            justifyContent: "center",
            opacity: pressed ? 0.6 : 1,
          })}
        >
          <Text
            style={{
              fontFamily: theme.fonts.semibold,
              fontSize: theme.type.small,
              color: theme.colors.ink,
            }}
          >
            {action} ↗
          </Text>
        </Pressable>
      )}
    </View>
  );
}

export function ActionRow({
  title,
  description,
  icon,
  onPress,
  style,
}: {
  title: string;
  description?: string;
  icon: IconName;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      onPress={onPress}
      style={({ pressed }) => [
        ui.card,
        ui.row,
        {
          minHeight: 80,
          backgroundColor: pressed ? theme.colors.pale : theme.colors.surface,
        },
        style,
      ]}
    >
      <View
        style={{
          padding: theme.space.sm,
          borderRadius: theme.radii.small,
          backgroundColor: theme.colors.background,
        }}
      >
        <Ionicons name={icon} size={23} color={theme.colors.ink} />
      </View>
      <View style={{ flex: 1, gap: theme.space.xxs }}>
        <Text
          style={{
            fontFamily: theme.fonts.semibold,
            fontSize: theme.type.body,
            color: theme.colors.ink,
          }}
        >
          {title}
        </Text>
        {description && <Text style={ui.small}>{description}</Text>}
      </View>
      <Ionicons name="chevron-forward" size={18} color={theme.colors.ink} />
    </Pressable>
  );
}

export function FutureFeature({ title }: { title: string }) {
  return (
    <>
      <Badge>Área demonstrativa</Badge>
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
