import type { CatalogCategory, PublicProvider } from "@omini/shared";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { router } from "expo-router";
import {
  Avatar,
  Badge,
  EmptyState,
  Feedback,
  PrimaryButton,
  ServiceCategoryCard,
  ui,
} from "../components/ui";
import { theme } from "../theme";
export function RemoteStatus({
  loading,
  error,
  reload,
}: {
  loading: boolean;
  error: string;
  reload: () => void;
}) {
  return (
    <>
      {loading && (
        <View style={[ui.card, { alignItems: "center" }]}>
          <ActivityIndicator
            color={theme.colors.ink}
            accessibilityLabel="Carregando dados"
          />
          <Text style={ui.text}>Carregando…</Text>
        </View>
      )}
      {!!error && (
        <>
          <Feedback message={error} />
          <PrimaryButton secondary title="Tentar novamente" onPress={reload} />
        </>
      )}
    </>
  );
}
const icons: Record<string, string> = {
  eletrica: "flash-outline",
  hidraulica: "water-outline",
  alvenaria: "construct-outline",
  pintura: "color-palette-outline",
  limpeza: "sparkles-outline",
  montagem: "hammer-outline",
  informatica: "laptop-outline",
  climatizacao: "snow-outline",
};
export function CatalogCategoryCard({
  category,
}: {
  category: CatalogCategory;
}) {
  return (
    <ServiceCategoryCard
      category={{
        id: category.id,
        name: category.name,
        icon: icons[category.slug] ?? "grid-outline",
      }}
      onPress={() =>
        router.push({
          pathname: "/client/search",
          params: { category: category.id },
        })
      }
    />
  );
}
export function PublicProfessionalCard({
  professional,
}: {
  professional: PublicProvider;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Ver perfil de ${professional.professionalName}`}
      onPress={() =>
        router.push({
          pathname: "/professional/[id]",
          params: { id: professional.id },
        })
      }
      style={({ pressed }) => [ui.card, { opacity: pressed ? 0.7 : 1 }]}
    >
      <View style={ui.row}>
        <Avatar
          initials={professional.professionalName
            .split(/\s+/)
            .map((p) => p[0])
            .slice(0, 2)
            .join("")
            .toUpperCase()}
        />
        <View style={{ flex: 1, minWidth: 0, gap: theme.space.xxs }}>
          <Text style={ui.section}>{professional.professionalName}</Text>
          <Text style={ui.small}>
            {[
              ...new Set(professional.services.map((s) => s.category.name)),
            ].join(" · ")}
          </Text>
        </View>
      </View>
      <Text style={ui.small}>
        {professional.areas
          .slice(0, 2)
          .map(
            (a) =>
              `${a.neighborhood || "Toda a cidade"} · ${a.city}/${a.state}`,
          )
          .join("\n")}
      </Text>
    </Pressable>
  );
}
export function CatalogNotice() {
  return <Badge>Catálogo real · serviços locais</Badge>;
}
export function NoProviders() {
  return (
    <EmptyState
      title="Nenhum profissional encontrado"
      description="Tente outro serviço ou localização. Apenas perfis com serviço e área de atendimento ativos aparecem aqui."
      icon="search-outline"
    />
  );
}
