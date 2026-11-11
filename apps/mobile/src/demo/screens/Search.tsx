import { useState } from "react";
import { Text } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import {
  ScreenContainer,
  Header,
  ProfessionalCard,
  EmptyState,
  PrimaryButton,
  ui,
  OminiInput,
  DemoNotice,
} from "../../components/ui";
import { categories, professionals } from "../../demo/catalog";
import { filterProfessionals } from "../../catalog";
export default function Search() {
  const params = useLocalSearchParams<{ category?: string }>();
  const [query, setQuery] = useState("");
  const selected = categories.find((c) => c.id === params.category);
  const found = filterProfessionals(professionals, query, params.category);
  return (
    <ScreenContainer>
      <Header
        title="Encontre seu profissional"
        subtitle="Catálogo demonstrativo · Araranguá"
      />
      <OminiInput
        icon="search-outline"
        accessibilityLabel="Buscar por nome, especialidade ou bairro"
        placeholder="Nome, especialidade ou bairro"
        value={query}
        onChangeText={setQuery}
        autoCapitalize="none"
      />
      {params.category && (
        <PrimaryButton
          secondary
          title={`${selected?.name ?? "Categoria desconhecida"} · remover filtro`}
          onPress={() => router.setParams({ category: undefined })}
        />
      )}
      <DemoNotice />
      <Text accessibilityLiveRegion="polite" style={ui.text}>
        {found.length} perfis de exemplo
      </Text>
      {found.map((p) => (
        <ProfessionalCard key={p.id} professional={p} />
      ))}
      {!found.length && (
        <EmptyState
          title="Nenhum perfil de exemplo"
          description="Tente outro termo ou categoria. O catálogo desta fase é limitado e fictício."
        />
      )}
    </ScreenContainer>
  );
}
