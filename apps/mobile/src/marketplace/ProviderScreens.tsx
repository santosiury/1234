import { useCallback, useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { router } from "expo-router";
import type {
  CatalogCategory,
  ProviderAreaRecord,
  ProviderServiceRecord,
} from "@omini/shared";
import {
  Header,
  ScreenContainer,
  PrimaryButton,
  OminiInput,
  Badge,
  Feedback,
  ActionRow,
  EmptyState,
  ui,
} from "../components/ui";
import { theme } from "../theme";
import { CatalogApi } from "./api";
import { useOwnProvider, useProviderApi, useRemote } from "./hooks";
import { RemoteStatus } from "./components";
const catalog = new CatalogApi();
const messageOf = (e: unknown) =>
  e instanceof Error ? e.message : "Não foi possível salvar. Tente novamente.";
export function ProviderGuest() {
  return (
    <ScreenContainer>
      <Header title="Seu talento faz a diferença." />
      <EmptyState
        title="Entre para configurar seu perfil"
        description="Use sua conta para ativar o perfil de prestador e cadastrar os dados reais."
      />
      <PrimaryButton
        title="Entrar na minha conta"
        onPress={() => router.push("/login")}
      />
    </ScreenContainer>
  );
}
export function ProviderDashboard() {
  const result = useOwnProvider();
  const ready =
    result.data?.services.some((s) => s.isActive && s.category.isActive) &&
    result.data?.areas.some((a) => a.isActive);
  return (
    <ScreenContainer>
      <Header
        title="Seu talento faz a diferença."
        subtitle="Gerencie seu cadastro profissional."
      />
      <RemoteStatus {...result} />
      {result.data && (
        <View style={ui.darkCard}>
          <Badge dark>
            {ready ? "Cadastro visível no catálogo" : "Complete seu cadastro"}
          </Badge>
          <Text style={[ui.section, ui.onDark]}>
            {result.data.professionalName}
          </Text>
          <Text style={[ui.text, ui.onDarkMuted]}>
            {ready
              ? "Você tem serviços e áreas de atendimento ativos. O catálogo exibe as informações salvas."
              : "Para aparecer na busca, tenha ao menos um serviço em categoria ativa e uma área de atendimento ativa."}
          </Text>
        </View>
      )}
      <ActionRow
        title="Meus serviços"
        icon="briefcase-outline"
        description="Cadastre, edite e desative serviços"
        onPress={() => router.push("/provider/services")}
      />
      <ActionRow
        title="Perfil profissional"
        icon="person-outline"
        description="Nome, descrição e áreas de atendimento"
        onPress={() => router.push("/provider/profile")}
      />
      <EmptyState
        title="Solicitações em uma próxima fase"
        description="Contratação e recebimento de solicitações ainda não estão disponíveis."
      />
    </ScreenContainer>
  );
}
export function ProviderProfileEditor() {
  const result = useOwnProvider();
  const [name, setName] = useState("");
  const [bio, setBio] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (result.data) {
      setName(result.data.professionalName);
      setBio(result.data.bio ?? "");
    }
  }, [result.data]);
  async function save() {
    if (busy) return;
    if (
      name.trim().length < 2 ||
      name.trim().length > 120 ||
      bio.length > 1000
    ) {
      setFailed(true);
      setMessage(
        "Informe nome profissional de 2 a 120 caracteres e descrição de até 1000.",
      );
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      await result.api.update({
        professionalName: name.trim(),
        bio: bio.trim() || null,
      });
      setFailed(false);
      setMessage("Perfil profissional salvo.");
      result.reload();
    } catch (e) {
      setFailed(true);
      setMessage(messageOf(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <RemoteStatus {...result} />
      {result.data && (
        <View style={ui.card}>
          <Text style={ui.section}>Seu cadastro profissional</Text>
          <OminiInput
            label="Nome profissional"
            accessibilityLabel="Nome profissional"
            value={name}
            onChangeText={setName}
            maxLength={120}
            editable={!busy}
          />
          <OminiInput
            label="Descrição profissional"
            accessibilityLabel="Descrição profissional"
            value={bio}
            onChangeText={setBio}
            maxLength={1000}
            multiline
            editable={!busy}
          />
          <PrimaryButton
            title="Salvar perfil profissional"
            loading={busy}
            onPress={() => void save()}
          />
        </View>
      )}
      {!!message && <Feedback message={message} error={failed} />}
      <ProviderAreas />
    </>
  );
}
export function ProviderServices() {
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
  const [editing, setEditing] = useState<ProviderServiceRecord | null>(null);
  const [categoryId, setCategoryId] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  const clear = () => {
    setEditing(null);
    setCategoryId("");
    setTitle("");
    setDescription("");
  };
  async function perform(operation: () => Promise<unknown>, success: string) {
    if (busy) return;
    setBusy(true);
    setMessage("");
    try {
      await operation();
      clear();
      setFailed(false);
      setMessage(success);
      result.reload();
    } catch (e) {
      setFailed(true);
      setMessage(messageOf(e));
    } finally {
      setBusy(false);
    }
  }
  const save = () => {
    if (
      !categoryId ||
      title.trim().length < 2 ||
      title.trim().length > 120 ||
      description.length > 1000
    ) {
      setFailed(true);
      setMessage(
        "Escolha uma categoria ativa e informe título de 2 a 120 caracteres. A descrição aceita até 1000.",
      );
      return;
    }
    const input = {
      categoryId,
      title: title.trim(),
      description: description.trim() || null,
    };
    void perform(
      () =>
        editing
          ? api.updateService(editing.id, input)
          : api.createService(input),
      "Serviço salvo.",
    );
  };
  return (
    <ScreenContainer>
      <Header
        title="Seus serviços"
        subtitle="As informações ativas compõem seu catálogo público."
      />
      <RemoteStatus {...result} />
      {!!message && <Feedback message={message} error={failed} />}
      {result.data && (
        <>
          <View style={ui.card}>
            <Text style={ui.section}>
              {editing ? "Editar serviço" : "Cadastrar serviço"}
            </Text>
            <Text style={ui.text}>Selecione a categoria</Text>
            <CategoryChoices
              categories={result.data.categories}
              selected={categoryId}
              onSelect={setCategoryId}
              disabled={busy}
            />
            {!result.data.categories.length && (
              <Text style={ui.text}>Nenhuma categoria ativa disponível.</Text>
            )}
            <OminiInput
              label="Título do serviço"
              accessibilityLabel="Título do serviço"
              value={title}
              onChangeText={setTitle}
              maxLength={120}
              editable={!busy}
            />
            <OminiInput
              label="Descrição do serviço"
              accessibilityLabel="Descrição do serviço"
              value={description}
              onChangeText={setDescription}
              maxLength={1000}
              multiline
              editable={!busy}
            />
            <PrimaryButton
              title={
                editing ? "Salvar alterações do serviço" : "Cadastrar serviço"
              }
              loading={busy}
              onPress={save}
            />
            {editing && (
              <PrimaryButton
                secondary
                title="Cancelar edição do serviço"
                disabled={busy}
                onPress={clear}
              />
            )}
          </View>
          {result.data.profile.services.length === 0 && (
            <EmptyState
              title="Você ainda não cadastrou serviços"
              description="Adicione um serviço para começar seu catálogo."
            />
          )}
          {result.data.profile.services.map((service) => (
            <View key={service.id} style={ui.card}>
              <Badge>
                {service.isActive ? "Serviço ativo" : "Serviço inativo"}
              </Badge>
              <Text style={ui.section}>{service.title}</Text>
              <Text style={ui.small}>
                {service.category.name}
                {!service.category.isActive ? " · categoria indisponível" : ""}
              </Text>
              {!!service.description && (
                <Text style={ui.text}>{service.description}</Text>
              )}
              <PrimaryButton
                secondary
                title={`Editar ${service.title}`}
                disabled={busy}
                onPress={() => {
                  setEditing(service);
                  setCategoryId(service.categoryId);
                  setTitle(service.title);
                  setDescription(service.description ?? "");
                  setMessage("");
                }}
              />
              <PrimaryButton
                secondary
                title={`${service.isActive ? "Desativar" : "Reativar"} ${service.title}`}
                loading={busy}
                onPress={() =>
                  void perform(
                    () =>
                      api.updateService(service.id, {
                        isActive: !service.isActive,
                      }),
                    service.isActive
                      ? "Serviço desativado."
                      : "Serviço reativado.",
                  )
                }
              />
            </View>
          ))}
        </>
      )}
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
              fontSize: theme.type.small,
              lineHeight: 21,
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

function ProviderAreas() {
  const result = useOwnProvider();
  const [editing, setEditing] = useState<ProviderAreaRecord | null>(null);
  const [city, setCity] = useState("Araranguá");
  const [state, setState] = useState("SC");
  const [neighborhood, setNeighborhood] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  const clear = () => {
    setEditing(null);
    setCity("Araranguá");
    setState("SC");
    setNeighborhood("");
  };
  async function perform(operation: () => Promise<unknown>, success: string) {
    if (busy) return;
    setBusy(true);
    setMessage("");
    try {
      await operation();
      clear();
      setFailed(false);
      setMessage(success);
      result.reload();
    } catch (e) {
      setFailed(true);
      setMessage(messageOf(e));
    } finally {
      setBusy(false);
    }
  }
  function save() {
    if (city.trim().length < 2 || state.trim().length !== 2) {
      setFailed(true);
      setMessage("Informe uma cidade e a sigla do estado.");
      return;
    }
    const input = {
      city: city.trim(),
      state: state.trim().toUpperCase(),
      neighborhood: neighborhood.trim(),
    };
    void perform(
      () =>
        editing
          ? result.api.updateArea(editing.id, input)
          : result.api.createArea(input),
      "Área de atendimento salva.",
    );
  }
  return (
    <View style={ui.group}>
      <RemoteStatus {...result} />
      {!!message && <Feedback message={message} error={failed} />}
      {result.data && (
        <>
          <View style={ui.card}>
            <Text style={ui.section}>
              {editing
                ? "Editar área de atendimento"
                : "Cadastrar área de atendimento"}
            </Text>
            <OminiInput
              label="Cidade atendida"
              accessibilityLabel="Cidade atendida"
              value={city}
              onChangeText={setCity}
              maxLength={100}
              editable={!busy}
            />
            <OminiInput
              label="Estado atendido (UF)"
              accessibilityLabel="Estado atendido"
              value={state}
              onChangeText={(v) => setState(v.toUpperCase())}
              maxLength={2}
              autoCapitalize="characters"
              editable={!busy}
            />
            <OminiInput
              label="Bairro atendido"
              accessibilityLabel="Bairro atendido"
              value={neighborhood}
              onChangeText={setNeighborhood}
              maxLength={100}
              hint="Deixe em branco se atender toda a cidade."
              editable={!busy}
            />
            <PrimaryButton
              title={editing ? "Salvar alterações da área" : "Cadastrar área"}
              loading={busy}
              onPress={save}
            />
            {editing && (
              <PrimaryButton
                secondary
                title="Cancelar edição da área"
                disabled={busy}
                onPress={clear}
              />
            )}
          </View>
          {!result.data.areas.length && (
            <Text style={ui.text}>
              Nenhuma área cadastrada. Adicione ao menos uma para aparecer na
              busca.
            </Text>
          )}
          {result.data.areas.map((area) => (
            <View key={area.id} style={ui.card}>
              <Badge>{area.isActive ? "Área ativa" : "Área inativa"}</Badge>
              <Text style={ui.section}>
                {area.city}/{area.state}
              </Text>
              <Text style={ui.text}>
                {area.neighborhood || "Toda a cidade"}
              </Text>
              <PrimaryButton
                secondary
                title={`Editar área ${area.neighborhood || area.city}`}
                disabled={busy}
                onPress={() => {
                  setEditing(area);
                  setCity(area.city);
                  setState(area.state);
                  setNeighborhood(area.neighborhood);
                  setMessage("");
                }}
              />
              <PrimaryButton
                secondary
                title={`${area.isActive ? "Desativar" : "Reativar"} área ${area.neighborhood || area.city}`}
                loading={busy}
                onPress={() =>
                  void perform(
                    () =>
                      result.api.updateArea(area.id, {
                        isActive: !area.isActive,
                      }),
                    area.isActive ? "Área desativada." : "Área reativada.",
                  )
                }
              />
            </View>
          ))}
        </>
      )}
    </View>
  );
}
