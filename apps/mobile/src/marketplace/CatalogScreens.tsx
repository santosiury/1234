import { cityLocation, type CityLocation } from "@omini/shared";
import { ReviewsSection } from "../components/ReviewsSection";
import { useCallback, useEffect, useState } from "react";
import { Text, View } from "react-native";
import { Redirect, router, useLocalSearchParams } from "expo-router";
import {
  Header,
  ScreenContainer,
  ActionRow,
  SectionHeading,
  PrimaryButton,
  OminiInput,
  TextButton,
  EmptyState,
  Avatar,
  ui,
} from "../components/ui";
import { useMode } from "../mode";
import { CatalogApi } from "./api";
import { useRemote } from "./hooks";
import {
  CatalogCategoryCard,
  CatalogNotice,
  NoProviders,
  PublicProfessionalCard,
  RemoteStatus,
} from "./components";
const api = new CatalogApi();
export function CatalogHome() {
  const load = useCallback(
    async () => ({
      categories: await api.categories(),
      providers: await api.providers({
        city: "Araranguá",
        state: "SC",
        pageSize: 3,
      }),
    }),
    [],
  );
  const result = useRemote(load);
  return (
    <ScreenContainer>
      <Header
        title="De que você precisa hoje?"
        subtitle="Profissionais do catálogo em Araranguá, SC."
      />
      <ActionRow
        title="Buscar um profissional"
        description="Serviços e áreas de atendimento"
        icon="search-outline"
        onPress={() => router.push("/client/search")}
      />
      <CatalogNotice />
      <RemoteStatus {...result} />
      {result.data && (
        <>
          <View style={ui.group}>
            <SectionHeading
              title="Categorias"
              action="Ver todas"
              onPress={() => router.push("/client/categories")}
            />
            <View style={ui.grid}>
              {result.data.categories.slice(0, 4).map((category) => (
                <CatalogCategoryCard key={category.id} category={category} />
              ))}
            </View>
            {!result.data.categories.length && (
              <Text style={ui.text}>Nenhuma categoria disponível.</Text>
            )}
          </View>
          <View style={ui.group}>
            <SectionHeading
              title="Profissionais"
              action="Explorar"
              onPress={() => router.push("/client/search")}
            />
            {result.data.providers.items.map((professional) => (
              <PublicProfessionalCard
                key={professional.id}
                professional={professional}
                location={{ city: "Araranguá", state: "SC" }}
              />
            ))}
            {!result.data.providers.items.length && <NoProviders />}
          </View>
        </>
      )}
    </ScreenContainer>
  );
}
export function CatalogCategories() {
  const result = useRemote(useCallback(() => api.categories(), []));
  return (
    <ScreenContainer>
      <Header
        title="Todo tipo de ajuda"
        subtitle="Categorias ativas do Omini."
      />
      <CatalogNotice />
      <RemoteStatus {...result} />
      {result.data && (
        <View style={ui.grid}>
          {result.data.map((category) => (
            <CatalogCategoryCard key={category.id} category={category} />
          ))}
        </View>
      )}
      {result.data?.length === 0 && (
        <EmptyState
          title="Nenhuma categoria disponível"
          description="Tente novamente mais tarde."
        />
      )}
    </ScreenContainer>
  );
}
export function CatalogSearch() {
  const params = useLocalSearchParams<{ category?: string }>();
  const [q, setQ] = useState("");
  const [city, setCity] = useState("Araranguá");
  const [state, setState] = useState("SC");
  const [filters, setFilters] = useState(false);
  const [applied, setApplied] = useState({
    q: "",
    city: "Araranguá",
    state: "SC",
  });
  const [page, setPage] = useState(1);
  useEffect(() => {
    setPage(1);
  }, [params.category]);
  const load = useCallback(
    () =>
      api.providers({
        ...applied,
        state: applied.state || undefined,
        categoryId: params.category,
        page,
        pageSize: 10,
      }),
    [applied, params.category, page],
  );
  const result = useRemote(load);
  return (
    <ScreenContainer>
      <Header
        title="Encontre seu profissional"
        subtitle="Busca pública no catálogo real."
      />
      <CatalogNotice />
      <OminiInput
        label="Nome ou serviço"
        icon="search-outline"
        accessibilityLabel="Buscar por nome ou serviço"
        value={q}
        onChangeText={setQ}
        placeholder="Eletricista, reparo, nome…"
        maxLength={80}
      />
      <TextButton
        title="Filtrar por localidade"
        expanded={filters}
        icon={filters ? "chevron-up" : "chevron-down"}
        onPress={() => setFilters((v) => !v)}
      />
      {filters && (
        <View style={ui.card}>
          <OminiInput
            label="Cidade"
            accessibilityLabel="Filtrar cidade"
            value={city}
            onChangeText={setCity}
            maxLength={100}
          />
          <OminiInput
            label="Estado (UF)"
            accessibilityLabel="Filtrar estado"
            value={state}
            onChangeText={(v) => setState(v.toUpperCase())}
            maxLength={2}
            autoCapitalize="characters"
          />
        </View>
      )}
      {!!params.category && (
        <PrimaryButton
          secondary
          title="Remover filtro de categoria"
          onPress={() => router.setParams({ category: undefined })}
        />
      )}
      <PrimaryButton
        title="Pesquisar profissionais"
        loading={result.loading}
        onPress={() => {
          setPage(1);
          setApplied({
            q: q.trim(),
            city: city.trim(),
            state: state.trim(),
          });
        }}
      />
      <RemoteStatus {...result} />
      {result.data && (
        <>
          <Text accessibilityLiveRegion="polite" style={ui.text}>
            {result.data.total} profissionais encontrados
          </Text>
          {result.data.items.map((professional) => (
            <PublicProfessionalCard
              key={professional.id}
              professional={professional}
              location={cityLocation(applied)}
            />
          ))}
          {!result.data.items.length && <NoProviders />}
          <Text style={ui.small}>
            Página {page} · Até 10 resultados por página
          </Text>
          <PrimaryButton
            secondary
            title="Página anterior"
            disabled={page <= 1}
            onPress={() => setPage((value) => value - 1)}
          />
          <PrimaryButton
            secondary
            title="Próxima página"
            disabled={page * result.data.pageSize >= result.data.total}
            onPress={() => setPage((value) => value + 1)}
          />
        </>
      )}
    </ScreenContainer>
  );
}
export function CatalogDetail() {
  const { id, city, state } = useLocalSearchParams<{
    id: string;
    city?: string;
    state?: string;
  }>();
  const { mode } = useMode();
  return mode === "client" ? (
    <LoadedDetail id={id} location={cityLocation({ city, state })} />
  ) : (
    <Redirect href="/" />
  );
}
function LoadedDetail({
  id,
  location,
}: {
  id: string;
  location: CityLocation | null;
}) {
  const result = useRemote(useCallback(() => api.provider(id), [id]));
  const person = result.data;
  return (
    <ScreenContainer>
      <Header title="Conheça o profissional" back />
      <CatalogNotice />
      <RemoteStatus {...result} />
      {person && (
        <>
          <View style={ui.darkCard}>
            <Avatar
              initials={person.professionalName
                .split(/\s+/)
                .map((p) => p[0])
                .slice(0, 2)
                .join("")
                .toUpperCase()}
              large
            />
            <Text style={[ui.title, ui.onDark]}>{person.professionalName}</Text>
            <Text style={[ui.text, ui.onDarkMuted]}>
              {person.bio || "Descrição não informada."}
            </Text>
          </View>
          <ReviewsSection audience="public" />
          <SectionHeading title="Serviços oferecidos" />
          {person.services.map((service) => (
            <View key={service.id} style={ui.card}>
              <Text style={ui.label}>{service.category.name}</Text>
              <Text style={ui.section}>{service.title}</Text>
              {!!service.description && (
                <Text style={ui.text}>{service.description}</Text>
              )}
            </View>
          ))}
          <SectionHeading title="Áreas de atendimento" />
          {person.areas.map((area) => (
            <View key={area.id} style={ui.card}>
              <Text style={ui.section}>
                {area.city}/{area.state}
              </Text>
              <Text style={ui.text}>Atendimento em toda a cidade</Text>
            </View>
          ))}
          <PrimaryButton
            title="Solicitar serviço"
            onPress={() =>
              router.navigate({
                pathname: "/service-request/new",
                params: { providerId: person.id, ...(location ?? {}) },
              })
            }
          />
        </>
      )}
    </ScreenContainer>
  );
}
