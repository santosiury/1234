import { useCallback, useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { Redirect, router, useLocalSearchParams } from "expo-router";
import { randomUUID } from "expo-crypto";
import {
  hasPrivateRequestData,
  type CreateRequestInput,
  type PublicProvider,
} from "@omini/shared";
import { useSession } from "../auth/session";
import { AuthFailure } from "../auth/api";
import { useMode } from "../mode";
import {
  ScreenContainer,
  Header,
  EmptyState,
  PrimaryButton,
  TextButton,
  OminiInput,
  Feedback,
  ui,
} from "../components/ui";
import { theme } from "../theme";
import { CatalogApi } from "../marketplace/api";
import { useRemote } from "../marketplace/hooks";
import { RemoteStatus } from "../marketplace/components";
import { ProviderHeader, useFormExit } from "../marketplace/provider/FlowUI";
import { isRequestId, RequestsApi } from "./api";
import { pendingRequests, type PendingRequest } from "./pending";
import { useRequestFeedback } from "./feedback";
import { RequestRoleGate, useRequestsApi } from "./access";
const catalog = new CatalogApi();
const message = (error: unknown) =>
  error instanceof AuthFailure
    ? error.message
    : error instanceof Error
      ? error.message
      : "Não foi possível concluir. Tente novamente.";
export function NewRequestScreen() {
  const { providerId, serviceId } = useLocalSearchParams<{
    providerId: string;
    serviceId?: string;
  }>();
  const { state } = useSession();
  const { mode, catalogSource, setMode, setCatalogSource } = useMode();
  if (!isRequestId(providerId))
    return (
      <ScreenContainer>
        <Header title="Serviço indisponível" back />
        <EmptyState
          title="Escolha um profissional"
          description="Abra um perfil no catálogo real para solicitar um serviço."
        />
      </ScreenContainer>
    );
  if (state.status === "loading") return null;
  if (!state.user)
    return (
      <Redirect
        href={{
          pathname: "/login",
          params: {
            requestProvider: providerId,
            ...(isRequestId(serviceId) ? { requestService: serviceId } : {}),
          },
        }}
      />
    );
  if (!state.user.profiles.client) return <RequestRoleGate role="client" />;
  if (mode !== "client" || catalogSource !== "real")
    return (
      <ScreenContainer>
        <Header title="Solicitar serviço real" />
        <Text style={ui.text}>
          Continue como cliente no catálogo real. Nenhuma solicitação será
          enviada sem sua confirmação.
        </Text>
        <PrimaryButton
          title="Continuar como cliente"
          onPress={() => {
            setMode("client");
            setCatalogSource("real");
          }}
        />
      </ScreenContainer>
    );
  return (
    <RequestLoader
      key={`${state.user.id}:${providerId}`}
      owner={state.user.id}
      providerId={providerId}
      serviceId={serviceId}
    />
  );
}
function RequestLoader({
  owner,
  providerId,
  serviceId,
}: {
  owner: string;
  providerId: string;
  serviceId?: string;
}) {
  const api = useRequestsApi();
  const result = useRemote(
    useCallback(async () => {
      const pending = await pendingRequests.read(owner);
      return pending
        ? { pending, person: null }
        : { pending: null, person: await catalog.provider(providerId) };
    }, [owner, providerId]),
  );
  if (!result.data)
    return (
      <ScreenContainer>
        <ProviderHeader title="Solicitar serviço" topic="new-request" back />
        <RemoteStatus {...result} />
      </ScreenContainer>
    );
  return result.data.pending ? (
    <RecoverCreation pending={result.data.pending} owner={owner} api={api} />
  ) : result.data.person ? (
    <CreateForm
      person={result.data.person}
      owner={owner}
      api={api}
      initialService={serviceId}
    />
  ) : null;
}
export function PendingRequestHint({ owner }: { owner: string }) {
  const result = useRemote(
    useCallback(() => pendingRequests.read(owner), [owner]),
  );
  if (result.error)
    return (
      <View style={ui.card}>
        <Text style={ui.text}>
          Não foi possível conferir um possível envio pendente.
        </Text>
        <TextButton title="Tentar recuperar envio" onPress={result.reload} />
      </View>
    );
  return result.data ? (
    <View style={ui.card}>
      <Text style={ui.text}>
        Há um envio pendente de verificação. Confira antes de criar outra
        solicitação.
      </Text>
      <PrimaryButton
        title="Conferir envio pendente"
        onPress={() =>
          router.navigate({
            pathname: "/service-request/new",
            params: { providerId: result.data!.input.providerId },
          })
        }
      />
    </View>
  ) : null;
}
function RecoverCreation({
  pending,
  owner,
  api,
}: {
  pending: PendingRequest;
  owner: string;
  api: RequestsApi;
}) {
  const { manager } = useSession();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [rejected, setRejected] = useState(false);
  const lock = useRef(false),
    feedback = useRequestFeedback();
  const exit = useFormExit(false, busy, "/client/requests");
  async function recover() {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      const row = await api.byKey(pending.input.idempotencyKey).catch((e) => {
        if (e instanceof AuthFailure && e.status === 404)
          return api.create(pending.input);
        throw e;
      });
      await pendingRequests.clear(owner).catch(() => undefined);
      if (manager.state.user?.id !== owner) return;
      feedback.confirm(owner, row.id);
      exit.finish();
    } catch (e) {
      setError(message(e));
      if (
        e instanceof AuthFailure &&
        [400, 403].includes(e.status) &&
        e.code !== "ACCOUNT_CHANGED"
      )
        setRejected(true);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <ScreenContainer>
      <ProviderHeader
        title="Conferir envio pendente"
        topic="new-request"
        back
        onBack={exit.leave}
      />
      <Text style={ui.text}>
        A resposta do envio anterior não foi confirmada. Vamos localizar ou
        reenviar a mesma solicitação com o mesmo identificador, sem duplicá-la.
      </Text>
      <View style={ui.card}>
        <Text style={ui.text}>{pending.input.description}</Text>
        <Text style={ui.small}>
          {pending.input.city}/{pending.input.state}
          {pending.input.neighborhood ? ` · ${pending.input.neighborhood}` : ""}
        </Text>
      </View>
      {!!error && <Feedback message={error} />}
      <PrimaryButton
        title="Conferir e retomar envio"
        loading={busy}
        onPress={() => void recover()}
      />
      {rejected && (
        <TextButton
          title="Descartar envio não aceito"
          disabled={busy}
          onPress={() =>
            void pendingRequests
              .clear(owner)
              .then(() => exit.finish())
              .catch(() =>
                setError(
                  "Não foi possível limpar o envio com segurança. Tente novamente.",
                ),
              )
          }
        />
      )}
      {exit.dialog}
    </ScreenContainer>
  );
}
function CreateForm({
  person,
  owner,
  api,
  initialService,
}: {
  person: PublicProvider;
  owner: string;
  api: RequestsApi;
  initialService?: string;
}) {
  const { manager } = useSession();
  const selectedInitially = person.services.some((s) => s.id === initialService)
    ? initialService!
    : "";
  const [service, setService] = useState(selectedInitially),
    [description, setDescription] = useState(""),
    [city, setCity] = useState("Araranguá"),
    [state, setState] = useState("SC"),
    [neighborhood, setNeighborhood] = useState("");
  const [review, setReview] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const lock = useRef(false);
  const prepared = useRef<PendingRequest | null>(null),
    feedback = useRequestFeedback();
  const dirty =
    description !== "" ||
    service !== selectedInitially ||
    city !== "Araranguá" ||
    state !== "SC" ||
    neighborhood !== "";
  const exit = useFormExit(dirty, busy, "/client/requests");
  function prepare() {
    if ([description, city, neighborhood].some(hasPrivateRequestData)) {
      setError(
        "Não informe endereço completo, documentos, telefone ou e-mail. Use somente cidade, UF e bairro.",
      );
      return;
    }
    if (
      !person.services.some(
        (s) => s.id === service && s.isActive && s.category.isActive,
      ) ||
      description.trim().length < 10 ||
      description.trim().length > 1000 ||
      city.trim().length < 2 ||
      city.trim().length > 100 ||
      !/^[A-Z]{2}$/.test(state.trim()) ||
      neighborhood.length > 100
    ) {
      setError(
        "Escolha o serviço, descreva o que precisa em 10 a 1000 caracteres e confira cidade/UF.",
      );
      return;
    }
    setError("");
    setReview(true);
  }
  async function send() {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      const input: CreateRequestInput = prepared.current?.input ?? {
        providerId: person.id,
        providerServiceId: service,
        description: description.trim(),
        city: city.trim(),
        state: state.trim(),
        neighborhood: neighborhood.trim(),
        idempotencyKey: randomUUID(),
      };
      prepared.current = { input };
      await pendingRequests.write(owner, prepared.current);
      const row = await api.byKey(input.idempotencyKey).catch((e) => {
        if (e instanceof AuthFailure && e.status === 404)
          return api.create(input);
        throw e;
      });
      await pendingRequests.clear(owner).catch(() => undefined);
      if (manager.state.user?.id !== owner) return;
      feedback.confirm(owner, row.id);
      exit.finish();
    } catch (e) {
      setError(message(e));
      // A validation/business rejection is definitive. Unknown network/server/401 responses retain the journal/key.
      if (
        e instanceof AuthFailure &&
        [400, 403].includes(e.status) &&
        e.code !== "ACCOUNT_CHANGED"
      ) {
        await pendingRequests.clear(owner).catch(() => undefined);
        prepared.current = null;
        setReview(false);
      }
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  const selected = person.services.find((s) => s.id === service);
  return (
    <ScreenContainer>
      <ProviderHeader
        title={review ? "Revise sua solicitação" : "Solicitar serviço"}
        topic="new-request"
        back
        onBack={() => {
          if (review && !busy && !prepared.current) setReview(false);
          else exit.leave();
        }}
      />
      <Text style={ui.section}>{person.professionalName}</Text>
      {review ? (
        <>
          <View style={ui.card}>
            <Text style={ui.section}>{selected?.title}</Text>
            <Text style={ui.text}>{description.trim()}</Text>
            <Text style={ui.text}>
              {city.trim()}/{state.trim()}
              {neighborhood.trim()
                ? ` · ${neighborhood.trim()}`
                : " · Toda a cidade"}
            </Text>
          </View>
          <Text style={ui.small}>
            O prestador poderá aceitar ou recusar. Não há pagamento ou
            negociação de valores pelo aplicativo nesta etapa.
          </Text>
          <PrimaryButton
            title={
              prepared.current ? "Conferir e reenviar" : "Enviar solicitação"
            }
            loading={busy}
            onPress={() => void send()}
          />
          {!prepared.current && (
            <TextButton
              title="Corrigir informações"
              disabled={busy}
              onPress={() => setReview(false)}
            />
          )}
        </>
      ) : (
        <>
          <Text style={ui.section}>Qual serviço você precisa?</Text>
          <View accessibilityRole="radiogroup" style={ui.group}>
            {person.services.map((item) => (
              <Pressable
                key={item.id}
                accessibilityRole="radio"
                accessibilityLabel={item.title}
                accessibilityState={{ checked: service === item.id }}
                onPress={() => setService(item.id)}
                style={({ pressed }) => [
                  ui.card,
                  {
                    minHeight: 48,
                    backgroundColor:
                      service === item.id
                        ? theme.colors.pale
                        : theme.colors.surface,
                    opacity: pressed ? 0.7 : 1,
                  },
                ]}
              >
                <Text style={ui.section}>{item.title}</Text>
                <Text style={ui.small}>{item.category.name}</Text>
              </Pressable>
            ))}
          </View>
          <OminiInput
            label="O que precisa ser feito?"
            accessibilityLabel="Descrição do atendimento"
            hint="De 10 a 1000 caracteres. Não informe telefone, e-mail, documentos ou endereço completo."
            multiline
            maxLength={1000}
            value={description}
            onChangeText={setDescription}
          />
          <OminiInput
            label="Cidade"
            accessibilityLabel="Cidade do atendimento"
            value={city}
            onChangeText={setCity}
            maxLength={100}
          />
          <OminiInput
            label="Estado (UF)"
            accessibilityLabel="Estado do atendimento"
            value={state}
            onChangeText={(v) => setState(v.toUpperCase())}
            autoCapitalize="characters"
            maxLength={2}
          />
          <OminiInput
            label="Bairro"
            accessibilityLabel="Bairro do atendimento"
            hint="Informe o bairro atendido. Não informe rua, número ou complemento."
            value={neighborhood}
            onChangeText={setNeighborhood}
            maxLength={100}
          />
          <PrimaryButton title="Revisar solicitação" onPress={prepare} />
        </>
      )}
      {!!error && <Feedback message={error} />}
      <TextButton
        title={prepared.current ? "Voltar às solicitações" : "Cancelar"}
        disabled={busy}
        onPress={exit.leave}
      />
      {exit.dialog}
    </ScreenContainer>
  );
}
