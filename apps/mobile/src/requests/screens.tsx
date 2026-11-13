import { useRequestUpdates, updateMessage } from "./notifications/provider";
import { useRequestsApi, RequestRoleGate } from "./access";
import { useCallback, useEffect, useRef, useState } from "react";
import { Text, View } from "react-native";
import {
  Redirect,
  router,
  useLocalSearchParams,
  useFocusEffect,
} from "expo-router";
import { randomUUID } from "expo-crypto";
import {
  REQUEST_STATUS_LABELS,
  type RequestAction,
  type RequestActionInput,
  type RequestParticipant,
  type RequestStatus,
  type RequestEventView,
} from "@omini/shared";
import { useSession } from "../auth/session";
import { AuthFailure } from "../auth/api";
import { useMode } from "../mode";
import {
  Header,
  ScreenContainer,
  PrimaryButton,
  TextButton,
  EmptyState,
  Feedback,
  FutureFeature,
  OminiInput,
  ui,
} from "../components/ui";
import { useRemote } from "../marketplace/hooks";
import { RemoteStatus } from "../marketplace/components";
import { FlowDialog, ProviderHeader } from "../marketplace/provider/FlowUI";
import { isRequestId } from "./api";
import { useRequestFeedback } from "./feedback";
import { PendingRequestHint } from "./NewRequest";
import {
  RequestCard,
  RequestStatusBadge,
  RequestStatusFilter,
  requestDate,
} from "./components";
const errorMessage = (error: unknown) =>
  error instanceof AuthFailure
    ? error.message
    : "Não foi possível concluir. Tente novamente.";
// A single monitor drives automatic refreshes; retained Stack screens do no extra work.
function useMonitorRefresh(
  reload: () => void,
  revision: number,
  enabled = true,
) {
  const focused = useRef(false),
    handled = useRef(revision),
    latest = useRef(revision);
  latest.current = revision;
  useFocusEffect(
    useCallback(() => {
      focused.current = true;
      handled.current = latest.current;
      return () => {
        focused.current = false;
      };
    }, []),
  );
  useEffect(() => {
    if (enabled && focused.current && handled.current !== revision) {
      handled.current = revision;
      reload();
    }
  }, [reload, revision, enabled]);
}
function listPath(side: RequestParticipant) {
  return side === "client" ? "/client/requests" : "/provider/requests";
}
export function RequestListScreen({ side }: { side: RequestParticipant }) {
  const { state } = useSession();
  const { catalogSource } = useMode();
  const title =
    side === "client" ? "Suas solicitações" : "Solicitações recebidas";
  if (catalogSource === "demo")
    return (
      <ScreenContainer>
        <Header
          title={title}
          back={side === "provider"}
          onBack={
            side === "provider"
              ? () => router.dismissTo("/provider")
              : undefined
          }
        />
        <FutureFeature title="Nenhuma solicitação nesta demonstração" />
      </ScreenContainer>
    );
  if (state.status === "loading") return null;
  if (!state.user)
    return (
      <ScreenContainer>
        <Header title={title} />
        <EmptyState
          title="Entre para acompanhar"
          description="Suas solicitações reais ficam disponíveis na sua conta."
        />
        <PrimaryButton
          title="Entrar na minha conta"
          onPress={() =>
            router.push({
              pathname: "/login",
              params: {
                requestReturn: side === "client" ? "sent" : "received",
              },
            })
          }
        />
      </ScreenContainer>
    );
  if (!state.user.profiles[side]) return <RequestRoleGate role={side} />;
  return <RequestList key={`${state.user.id}:${side}`} side={side} />;
}
function RequestList({ side }: { side: RequestParticipant }) {
  const { state: session } = useSession();
  const { monitor, state: updates } = useRequestUpdates();
  const api = useRequestsApi();
  const [page, setPage] = useState(1),
    [status, setStatus] = useState<RequestStatus>(),
    [filters, setFilters] = useState(false);
  const feedback = useRequestFeedback();
  const result = useRemote(
    useCallback(
      () => api.list(side, { page, pageSize: 10, status }),
      [api, side, page, status],
    ),
    true,
  );
  useMonitorRefresh(result.reload, updates.revision);
  return (
    <ScreenContainer>
      <ProviderHeader
        title={
          side === "client" ? "Suas solicitações" : "Solicitações recebidas"
        }
        topic="requests"
        back={side === "provider"}
        onBack={
          side === "provider" ? () => router.dismissTo("/provider") : undefined
        }
      />
      {!!updateMessage(updates, side) && (
        <Text accessibilityLiveRegion="polite" style={ui.small}>
          {updateMessage(updates, side)}
        </Text>
      )}
      {!!updates.error && (
        <>
          <Text style={ui.small}>{updates.error}</Text>
          <TextButton
            title="Atualizar avisos"
            onPress={() => void monitor?.refresh()}
          />
        </>
      )}
      {side === "client" && session.user && (
        <PendingRequestHint owner={session.user.id} />
      )}
      {side === "client" && feedback.sent && (
        <>
          <Feedback message="Solicitação enviada." error={false} />
          <TextButton title="Fechar confirmação" onPress={feedback.clear} />
        </>
      )}
      <TextButton
        title="Filtrar por status"
        expanded={filters}
        onPress={() => setFilters((v) => !v)}
      />
      {filters && (
        <RequestStatusFilter
          selected={status}
          onSelect={(value) => {
            setStatus(value);
            setPage(1);
          }}
        />
      )}
      <PrimaryButton
        secondary
        title="Atualizar solicitações"
        loading={result.loading}
        onPress={() => {
          result.reload();
          void monitor?.refresh();
        }}
      />
      <RemoteStatus {...result} loading={result.loading && !result.data} />
      {result.data && (
        <>
          {!result.data.items.length && (
            <EmptyState
              title="Nenhuma solicitação encontrada"
              description={
                side === "client"
                  ? "Quando você solicitar um serviço, poderá acompanhar tudo por aqui."
                  : "As solicitações dos seus clientes aparecerão aqui."
              }
            />
          )}
          {result.data.items.map((row) => (
            <RequestCard
              key={row.id}
              row={row}
              onPress={() => {
                feedback.clear();
                router.push(
                  {
                    pathname:
                      side === "client"
                        ? "/client/requests/[id]"
                        : "/provider/requests/[id]",
                    params: { id: row.id },
                  },
                  { withAnchor: true },
                );
              }}
            />
          ))}
          <Text style={ui.small}>
            Página {page} · {result.data.total} solicitações
          </Text>
          <TextButton
            title="Página anterior"
            disabled={page === 1}
            onPress={() => setPage((n) => n - 1)}
          />
          <TextButton
            title="Próxima página"
            disabled={page * result.data.pageSize >= result.data.total}
            onPress={() => setPage((n) => n + 1)}
          />
        </>
      )}
    </ScreenContainer>
  );
}
const actions: Record<
  RequestAction,
  { title: string; confirmation: string; description: string }
> = {
  accept: {
    title: "Aceitar",
    confirmation: "Aceitar solicitação?",
    description: "Você poderá iniciar o atendimento quando estiver pronto.",
  },
  reject: {
    title: "Recusar",
    confirmation: "Recusar solicitação?",
    description:
      "O cliente será informado ao atualizar suas solicitações. Esta ação não poderá ser desfeita.",
  },
  start: {
    title: "Iniciar atendimento",
    confirmation: "Iniciar atendimento?",
    description:
      "Após o início, o cancelamento não estará disponível nesta etapa.",
  },
  "propose-completion": {
    title: "Informar conclusão",
    confirmation: "Informar que terminou?",
    description:
      "O cliente precisará confirmar a conclusão ou informar o que ainda falta.",
  },
  "confirm-completion": {
    title: "Sim, confirmar conclusão",
    confirmation: "Confirmar conclusão?",
    description:
      "Confirme apenas se o serviço foi finalizado. Esta ação encerra a solicitação.",
  },
  reopen: {
    title: "Não, ainda precisa finalizar",
    confirmation: "O que ainda precisa finalizar?",
    description:
      "Explique o que falta. O atendimento voltará a ficar em andamento.",
  },
  cancel: {
    title: "Cancelar solicitação",
    confirmation: "Cancelar solicitação?",
    description:
      "Esta ação encerra a solicitação antes do início e não poderá ser desfeita.",
  },
};
export function RequestDetailScreen({ side }: { side: RequestParticipant }) {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { state } = useSession();
  const { catalogSource } = useMode();
  if (state.status === "loading") return null;
  if (!state.user)
    return (
      <Redirect
        href={{
          pathname: "/login",
          params: {
            requestId: isRequestId(id) ? id : undefined,
            requestSide: side,
          },
        }}
      />
    );
  if (!isRequestId(id) || catalogSource !== "real")
    return (
      <ScreenContainer>
        <Header title="Solicitação indisponível" back />
        <EmptyState
          title="Confira suas solicitações"
          description="Este endereço não está disponível."
        />
        <PrimaryButton
          title="Ver solicitações"
          onPress={() => router.dismissTo(listPath(side))}
        />
      </ScreenContainer>
    );
  return (
    <RequestDetail key={`${state.user.id}:${id}:${side}`} id={id} side={side} />
  );
}
function RequestDetail({ id, side }: { id: string; side: RequestParticipant }) {
  const api = useRequestsApi();
  const { monitor, state: updates } = useRequestUpdates();
  const { state: session } = useSession();
  const result = useRemote(
    useCallback(() => api.detail(id), [api, id]),
    true,
  );
  useFocusEffect(
    useCallback(() => {
      if (result.data && session.user)
        monitor?.viewed(result.data, session.user.id);
    }, [monitor, result.data, session.user?.id]),
  );
  const [history, setHistory] = useState(false);
  const [events, setEvents] = useState<RequestEventView[]>([]);
  const [historyBusy, setHistoryBusy] = useState(false),
    [historyError, setHistoryError] = useState("");
  const historyFlight = useRef(false);
  useEffect(() => {
    if (result.data)
      setEvents((old) =>
        [
          ...old,
          ...result.data!.events.filter(
            (item) => !old.some((e) => e.id === item.id),
          ),
        ].sort((a, b) => a.version - b.version),
      );
    setHistoryError("");
  }, [result.data]);
  async function moreHistory() {
    if (historyFlight.current) return;
    historyFlight.current = true;
    setHistoryBusy(true);
    setHistoryError("");
    try {
      const page = await api.history(id, events.at(-1)?.version ?? 0);
      setEvents((old) => [
        ...old,
        ...page.items.filter((item) => !old.some((e) => e.id === item.id)),
      ]);
    } catch (e) {
      setHistoryError(errorMessage(e));
    } finally {
      historyFlight.current = false;
      setHistoryBusy(false);
    }
  }
  const [pending, setPending] = useState<{
      action: RequestAction;
      input: RequestActionInput;
      submitted?: boolean;
    } | null>(null),
    [reason, setReason] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  const inFlight = useRef(false);
  useMonitorRefresh(result.reload, updates.revision, !busy && !pending);
  const row = result.data;
  function open(action: RequestAction) {
    if (!row) return;
    setError("");
    setReason("");
    setPending({
      action,
      input: { version: row.version, idempotencyKey: randomUUID() },
    });
  }
  async function submit() {
    if (!pending || inFlight.current) return;
    if (pending.action === "reopen" && reason.trim().length < 10) {
      setError("Explique o que falta, em pelo menos 10 caracteres.");
      return;
    }
    inFlight.current = true;
    setBusy(true);
    setError("");
    // Retain exact intent/key across uncertain responses, including the submitted reason.
    const input = pending.submitted
      ? pending.input
      : {
          ...pending.input,
          ...(reason.trim() ? { reason: reason.trim() } : {}),
        };
    setPending({ ...pending, input, submitted: true });
    try {
      const updated = await api.act(id, pending.action, input);
      if (session.user) monitor?.viewed(updated, session.user.id);
      void monitor?.refresh(true);
      setPending(null);
      setReason("");
      setMessage("Solicitação atualizada.");
      result.reload();
    } catch (e) {
      setError(errorMessage(e));
      if (e instanceof AuthFailure && e.status === 400)
        setPending({ ...pending, submitted: false });
      if (e instanceof AuthFailure && e.status === 409) {
        setPending(null);
        result.reload();
      }
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  return (
    <ScreenContainer>
      <ProviderHeader
        title="Detalhes da solicitação"
        topic="requests"
        back
        onBack={() => router.dismissTo(listPath(side))}
      />
      {!!message && <Feedback message={message} error={false} />}
      {!!error && !pending && <Feedback message={error} />}
      <RemoteStatus {...result} loading={result.loading && !result.data} />
      {row && (
        <>
          <RequestStatusBadge status={row.status} />
          <Text style={ui.title}>{row.serviceTitleSnapshot}</Text>
          <View style={ui.card}>
            <Text style={ui.section}>
              {row.viewer === "client"
                ? row.providerNameSnapshot
                : row.clientNameSnapshot}
            </Text>
            <Text style={ui.text}>{row.description}</Text>
            <Text style={ui.small}>
              {row.city}/{row.state}
            </Text>
            <Text style={ui.small}>
              Enviada em {requestDate(row.createdAt)}
            </Text>
          </View>
          {row.status === "AWAITING_CONFIRMATION" && (
            <View style={ui.card}>
              <Text style={ui.section}>
                {row.viewer === "client"
                  ? "O serviço foi concluído?"
                  : "Aguardando confirmação do cliente"}
              </Text>
              <Text style={ui.text}>
                {row.viewer === "client"
                  ? "Confirme somente se tudo foi finalizado. Se ainda falta algo, informe o motivo."
                  : "A solicitação será concluída quando o cliente confirmar."}
              </Text>
            </View>
          )}
          {(row.status === "IN_PROGRESS" ||
            row.status === "AWAITING_CONFIRMATION") && (
            <Text style={ui.small}>
              O cancelamento após o início não está disponível nesta etapa.
              Contestação e suporte serão adicionados em uma fase futura.
            </Text>
          )}
          {row.allowedActions.map((action, index) => (
            <PrimaryButton
              key={action}
              secondary={index > 0 || action === "cancel"}
              title={actions[action].title}
              onPress={() => open(action)}
            />
          ))}
          <TextButton
            title="Consultar histórico"
            expanded={history}
            onPress={() => setHistory((v) => !v)}
          />
          {history && (
            <>
              <Text accessibilityRole="header" style={ui.section}>
                Histórico
              </Text>
              {events.map((event) => (
                <View key={event.id} style={ui.card}>
                  <Text style={ui.section}>
                    {REQUEST_STATUS_LABELS[event.newStatus]}
                  </Text>
                  <Text style={ui.small}>
                    {event.actor === row.viewer
                      ? "Você"
                      : event.actor === "client"
                        ? "Cliente"
                        : "Prestador"}{" "}
                    · {requestDate(event.occurredAt)}
                  </Text>
                  {!!event.reason && (
                    <Text style={ui.text}>{event.reason}</Text>
                  )}
                </View>
              ))}
              {!!historyError && <Feedback message={historyError} />}
              {events.length < row.eventTotal && (
                <PrimaryButton
                  secondary
                  title="Mostrar mais do histórico"
                  loading={historyBusy}
                  onPress={() => void moreHistory()}
                />
              )}
            </>
          )}
        </>
      )}
      <PrimaryButton
        secondary
        title="Atualizar solicitação"
        loading={result.loading}
        onPress={() => {
          result.reload();
          void monitor?.refresh();
        }}
      />
      <FlowDialog
        visible={!!pending}
        title={
          pending ? actions[pending.action].confirmation : "Confirmar ação"
        }
        onClose={() => {
          if (!busy) setPending(null);
        }}
      >
        {pending && (
          <>
            <Text style={ui.text}>{actions[pending.action].description}</Text>
            {(pending.action === "reopen" ||
              pending.action === "reject" ||
              pending.action === "cancel") && (
              <OminiInput
                label={
                  pending.action === "reopen"
                    ? "O que falta finalizar?"
                    : "Motivo (opcional)"
                }
                accessibilityLabel="Motivo da ação"
                hint="Não informe endereço completo, documentos ou contatos privados."
                multiline
                maxLength={500}
                editable={!busy && !pending.submitted}
                value={reason}
                onChangeText={setReason}
              />
            )}
            {!!error && <Feedback message={error} />}
            <PrimaryButton
              title={error ? "Tentar novamente" : actions[pending.action].title}
              loading={busy}
              onPress={() => void submit()}
            />
            <TextButton
              title="Voltar sem confirmar"
              disabled={busy}
              onPress={() => setPending(null)}
            />
          </>
        )}
      </FlowDialog>
    </ScreenContainer>
  );
}
