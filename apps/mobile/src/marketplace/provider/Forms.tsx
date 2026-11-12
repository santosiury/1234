import { useCallback, useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import type {
  CatalogCategory,
  ProviderAreaRecord,
  ProviderServiceRecord,
  ProviderWorkspace,
} from "@omini/shared";
import {
  ScreenContainer,
  OminiInput,
  PrimaryButton,
  TextButton,
  Feedback,
  EmptyState,
  ui,
} from "../../components/ui";
import { theme } from "../../theme";
import { CatalogApi, type ProviderApi } from "../api";
import { useOwnProvider, useProviderApi, useRemote } from "../hooks";
import { RemoteStatus } from "../components";
import { ProviderHeader, useFormExit } from "./FlowUI";
import { useProviderNotice } from "./feedback";
const catalog = new CatalogApi();
const errorMessage = (error: unknown) =>
  error instanceof Error
    ? error.message
    : "Não foi possível salvar. Tente novamente.";
export function ServiceFormScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const api = useProviderApi();
  const result = useRemote(
    useCallback(
      async () => ({
        profile: await api.me(),
        categories: await catalog.categories(),
      }),
      [api],
    ),
  );
  const record = result.data?.profile.services.find(
    (service) => service.id === id,
  );
  return result.data ? (
    id && !record ? (
      <ScreenContainer>
        <ProviderHeader title="Serviço não encontrado" topic="services" back />
        <EmptyState
          title="Este serviço não está disponível"
          description="Volte à lista para escolher um serviço."
        />
      </ScreenContainer>
    ) : (
      <ServiceForm
        key={id ?? "new"}
        api={api}
        record={record}
        categories={result.data.categories}
      />
    )
  ) : (
    <ScreenContainer>
      <ProviderHeader
        title={id ? "Editar serviço" : "Adicionar serviço"}
        topic="service-form"
        back
      />
      <RemoteStatus {...result} />
    </ScreenContainer>
  );
}
function ServiceForm({
  api,
  record,
  categories,
}: {
  api: ProviderApi;
  record?: ProviderServiceRecord;
  categories: CatalogCategory[];
}) {
  const [categoryId, setCategoryId] = useState(record?.categoryId ?? "");
  const [title, setTitle] = useState(record?.title ?? "");
  const [description, setDescription] = useState(record?.description ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const inFlight = useRef(false);
  const notice = useProviderNotice("services", false);
  const dirty =
    categoryId !== (record?.categoryId ?? "") ||
    title !== (record?.title ?? "") ||
    description !== (record?.description ?? "");
  const exit = useFormExit(dirty, busy, "/provider/services");
  async function save() {
    if (inFlight.current) return;
    if (
      !categories.some((category) => category.id === categoryId) ||
      title.trim().length < 2 ||
      title.trim().length > 120 ||
      description.length > 1000
    ) {
      setError(
        "Escolha uma categoria e informe um nome de 2 a 120 caracteres. A descrição aceita até 1000.",
      );
      return;
    }
    inFlight.current = true;
    setBusy(true);
    setError("");
    try {
      const input = {
        categoryId,
        title: title.trim(),
        description: description.trim() || null,
      };
      if (record) await api.updateService(record.id, input);
      else await api.createService(input);
      notice.success("services", "Serviço salvo.");
      exit.finish();
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  return (
    <ScreenContainer>
      <ProviderHeader
        title={record ? "Editar serviço" : "Adicionar serviço"}
        topic="service-form"
        back
        onBack={exit.leave}
      />
      <View style={ui.group}>
        <Text style={ui.section}>Qual tipo de serviço você faz?</Text>
        <CategoryChoices
          categories={categories}
          selected={categoryId}
          onSelect={setCategoryId}
          disabled={busy}
        />
        {!categories.length && (
          <Text style={ui.text}>
            Nenhuma categoria disponível no momento. Tente novamente mais tarde.
          </Text>
        )}
        {record && !record.category.isActive && (
          <Text style={ui.text}>
            A categoria anterior está indisponível. Escolha outra para salvar.
          </Text>
        )}
      </View>
      <OminiInput
        label="Como você chama esse serviço?"
        accessibilityLabel="Título do serviço"
        placeholder="Ex.: Instalação de tomadas"
        value={title}
        onChangeText={setTitle}
        maxLength={120}
        editable={!busy}
      />
      <OminiInput
        label="Descrição (opcional)"
        accessibilityLabel="Descrição do serviço"
        hint="Conte o que está incluído, em até 1000 caracteres. Você pode deixar em branco."
        value={description}
        onChangeText={setDescription}
        maxLength={1000}
        multiline
        editable={!busy}
      />
      {!!error && <Feedback message={error} />}
      <PrimaryButton
        title="Salvar serviço"
        loading={busy}
        onPress={() => void save()}
      />
      <TextButton title="Cancelar" onPress={exit.leave} />
      {exit.dialog}
    </ScreenContainer>
  );
}
export function ProfileFormScreen() {
  const result = useOwnProvider();
  return result.data ? (
    <ProfileForm profile={result.data} api={result.api} />
  ) : (
    <ScreenContainer>
      <ProviderHeader title="Editar meu perfil" topic="profile-form" back />
      <RemoteStatus {...result} />
    </ScreenContainer>
  );
}
function ProfileForm({
  profile,
  api,
}: {
  profile: ProviderWorkspace;
  api: ProviderApi;
}) {
  const [name, setName] = useState(profile.professionalName);
  const [bio, setBio] = useState(profile.bio ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const inFlight = useRef(false);
  const notice = useProviderNotice("profile", false);
  const exit = useFormExit(
    name !== profile.professionalName || bio !== (profile.bio ?? ""),
    busy,
    "/provider/profile",
  );
  async function save() {
    if (inFlight.current) return;
    if (
      name.trim().length < 2 ||
      name.trim().length > 120 ||
      bio.length > 1000
    ) {
      setError(
        "Informe seu nome profissional de 2 a 120 caracteres. A apresentação aceita até 1000.",
      );
      return;
    }
    inFlight.current = true;
    setBusy(true);
    setError("");
    try {
      await api.update({
        professionalName: name.trim(),
        bio: bio.trim() || null,
      });
      notice.success("profile", "Perfil profissional salvo.");
      exit.finish();
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  return (
    <ScreenContainer>
      <ProviderHeader
        title="Editar meu perfil"
        topic="profile-form"
        back
        onBack={exit.leave}
      />
      <OminiInput
        label="Nome profissional"
        accessibilityLabel="Nome profissional"
        hint="Use o nome pelo qual seus clientes conhecem você."
        value={name}
        onChangeText={setName}
        maxLength={120}
        editable={!busy}
      />
      <OminiInput
        label="Apresentação (opcional)"
        accessibilityLabel="Descrição profissional"
        hint="Conte como você pode ajudar. Você pode deixar em branco."
        value={bio}
        onChangeText={setBio}
        maxLength={1000}
        multiline
        editable={!busy}
      />
      {!!error && <Feedback message={error} />}
      <PrimaryButton
        title="Salvar perfil"
        loading={busy}
        onPress={() => void save()}
      />
      <TextButton title="Cancelar" onPress={exit.leave} />
      {exit.dialog}
    </ScreenContainer>
  );
}
export function AreaFormScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const result = useOwnProvider();
  const record = result.data?.areas.find((area) => area.id === id);
  return result.data ? (
    id && !record ? (
      <ScreenContainer>
        <ProviderHeader title="Área não encontrada" topic="areas" back />
        <EmptyState
          title="Este local não está disponível"
          description="Volte à lista para escolher uma área."
        />
      </ScreenContainer>
    ) : (
      <AreaForm key={id ?? "new"} api={result.api} record={record} />
    )
  ) : (
    <ScreenContainer>
      <ProviderHeader
        title={id ? "Editar área" : "Adicionar área"}
        topic="area-form"
        back
      />
      <RemoteStatus {...result} />
    </ScreenContainer>
  );
}
function AreaForm({
  api,
  record,
}: {
  api: ProviderApi;
  record?: ProviderAreaRecord;
}) {
  const initial = {
    city: record?.city ?? "Araranguá",
    state: record?.state ?? "SC",
    neighborhood: record?.neighborhood ?? "",
  };
  const [city, setCity] = useState(initial.city);
  const [state, setState] = useState(initial.state);
  const [neighborhood, setNeighborhood] = useState(initial.neighborhood);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const inFlight = useRef(false);
  const notice = useProviderNotice("areas", false);
  const exit = useFormExit(
    city !== initial.city ||
      state !== initial.state ||
      neighborhood !== initial.neighborhood,
    busy,
    "/provider/areas",
  );
  async function save() {
    if (inFlight.current) return;
    if (
      city.trim().length < 2 ||
      city.trim().length > 100 ||
      state.trim().length !== 2 ||
      neighborhood.length > 100
    ) {
      setError("Informe a cidade e a sigla do estado. O bairro é opcional.");
      return;
    }
    inFlight.current = true;
    setBusy(true);
    setError("");
    try {
      const input = {
        city: city.trim(),
        state: state.trim().toUpperCase(),
        neighborhood: neighborhood.trim(),
      };
      if (record) await api.updateArea(record.id, input);
      else await api.createArea(input);
      notice.success("areas", "Área de atendimento salva.");
      exit.finish();
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  return (
    <ScreenContainer>
      <ProviderHeader
        title={record ? "Editar área" : "Adicionar área"}
        topic="area-form"
        back
        onBack={exit.leave}
      />
      <OminiInput
        label="Cidade"
        accessibilityLabel="Cidade atendida"
        value={city}
        onChangeText={setCity}
        maxLength={100}
        editable={!busy}
      />
      <OminiInput
        label="Estado (UF)"
        accessibilityLabel="Estado atendido"
        hint="Use a sigla do estado. Ex.: SC."
        value={state}
        onChangeText={(value) => setState(value.toUpperCase())}
        maxLength={2}
        autoCapitalize="characters"
        editable={!busy}
      />
      <OminiInput
        label="Bairro (opcional)"
        accessibilityLabel="Bairro atendido"
        hint="Se você atende toda a cidade, deixe o bairro em branco."
        value={neighborhood}
        onChangeText={setNeighborhood}
        maxLength={100}
        editable={!busy}
      />
      {!!error && <Feedback message={error} />}
      <PrimaryButton
        title="Salvar área"
        loading={busy}
        onPress={() => void save()}
      />
      <TextButton title="Cancelar" onPress={exit.leave} />
      {exit.dialog}
    </ScreenContainer>
  );
}
function CategoryChoices({
  categories,
  selected,
  onSelect,
  disabled,
}: {
  categories: CatalogCategory[];
  selected: string;
  onSelect: (id: string) => void;
  disabled: boolean;
}) {
  return (
    <View style={ui.grid} accessibilityRole="radiogroup">
      {categories.map((category) => (
        <Pressable
          key={category.id}
          accessibilityRole="radio"
          accessibilityLabel={category.name}
          accessibilityState={{ checked: selected === category.id, disabled }}
          disabled={disabled}
          onPress={() => onSelect(category.id)}
          style={({ pressed }) => ({
            flexBasis: "46%",
            flexGrow: 1,
            minWidth: 120,
            minHeight: 48,
            padding: theme.space.sm,
            borderRadius: theme.radii.small,
            borderWidth: 1,
            borderColor: theme.colors.border,
            backgroundColor:
              selected === category.id
                ? theme.colors.accent
                : theme.colors.surface,
            opacity: disabled ? 0.55 : pressed ? 0.7 : 1,
          })}
        >
          <Text
            style={{
              fontFamily: theme.fonts.medium,
              fontSize: theme.type.body,
              lineHeight: 24,
              color: theme.colors.ink,
            }}
          >
            {category.name}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}
