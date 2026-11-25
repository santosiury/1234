import { useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { randomUUID } from "expo-crypto";
import {
  CANCELLATION_EXECUTION_CONTEXTS,
  CANCELLATION_EXECUTION_LABELS,
  CANCELLATION_REASON_LABELS,
  cancellationReasons,
  hasPrivateRequestData,
  requiresCancellationExecutionContext,
  type CancellationExecutionContext,
  type CancellationReasonCode,
  type CancelRequestInput,
  type ServiceRequestDetail,
} from "@omini/shared";
import { AuthFailure } from "../auth/api";
import {
  Feedback,
  OminiInput,
  PrimaryButton,
  TextButton,
  ui,
} from "../components/ui";
import { FlowDialog } from "../marketplace/provider/FlowUI";
import { theme } from "../theme";
import type { RequestsApi } from "./api";

/** Presents the shared contract; authorization and state transitions remain in the API. */
export function CancellationDialog({
  request,
  api,
  onClose,
  onSuccess,
  onInvalidated,
}: {
  request: ServiceRequestDetail;
  api: Pick<RequestsApi, "cancel">;
  onClose: () => void;
  onSuccess: (updated: ServiceRequestDetail) => void;
  onInvalidated: (message: string) => void;
}) {
  const [reasonCode, setReasonCode] = useState<CancellationReasonCode>();
  const [reason, setReason] = useState("");
  const [executionContext, setExecutionContext] =
    useState<CancellationExecutionContext>();
  const [review, setReview] = useState(false),
    [busy, setBusy] = useState(false);
  const [uncertain, setUncertain] = useState(false),
    [error, setError] = useState("");
  const [httpStatus, setHttpStatus] = useState<number | null>(null);
  const key = useRef<string | null>(null),
    intent = useRef<CancelRequestInput | null>(null);
  const inFlight = useRef(false);
  const reasons = cancellationReasons(request.viewer);
  const needsContext = requiresCancellationExecutionContext({
    status: request.status,
    participant: request.viewer,
    hasRecordedStart: request.startedAt !== null,
  });
  function reviewCancellation() {
    if (
      !request.allowedActions.includes("cancel") ||
      !reasons.some((option) => option.code === reasonCode)
    ) {
      setError("Selecione um motivo para cancelar esta solicitação.");
      return;
    }
    const text = reason.trim().normalize("NFC");
    if (
      reasonCode === "OTHER" &&
      (text.length < 10 ||
        text.length > 500 ||
        hasPrivateRequestData(text) ||
        /[<>\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(text))
    ) {
      setError(
        "Descreva o outro motivo em 10 a 500 caracteres, sem dados pessoais, links ou marcação.",
      );
      return;
    }
    if (needsContext && !executionContext) {
      setError("Informe a situação de execução do atendimento.");
      return;
    }
    setError("");
    setReview(true);
  }
  async function confirm() {
    if (inFlight.current || !review || !reasonCode) return;
    inFlight.current = true;
    setBusy(true);
    setError("");
    setHttpStatus(null);
    key.current ??= randomUUID();
    const base = {
      version: request.version,
      idempotencyKey: key.current,
      confirmed: true as const,
      ...(needsContext ? { executionContext } : {}),
    };
    intent.current ??=
      reasonCode === "OTHER"
        ? { ...base, reasonCode, reason: reason.trim().normalize("NFC") }
        : { ...base, reasonCode };
    try {
      const updated = await api.cancel(request.id, intent.current);
      onSuccess(updated);
    } catch (e) {
      setHttpStatus(
        e instanceof AuthFailure &&
          Number.isInteger(e.status) &&
          e.status >= 100 &&
          e.status <= 599
          ? e.status
          : null,
      );
      const message =
        e instanceof AuthFailure && e.status === 503
          ? "Não foi possível confirmar o cancelamento: o serviço de solicitações está indisponível. Tente atualizar a solicitação ou repita o envio com os mesmos dados."
          : e instanceof AuthFailure
            ? e.message
            : "Não foi possível confirmar o cancelamento. Tente novamente.";
      if (e instanceof AuthFailure && [403, 404, 409].includes(e.status)) {
        onInvalidated(message);
      } else {
        setError(message);
        if (e instanceof AuthFailure && e.status === 400) {
          // Validation was rejected without a write; allow correction as a new intent.
          intent.current = null;
          key.current = null;
          setReview(false);
          setUncertain(false);
        } else {
          // Keep exact version, key, reason and context after an uncertain response.
          setUncertain(true);
        }
      }
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  return (
    <FlowDialog
      visible
      title={review ? "Confirmar cancelamento?" : "Por que deseja cancelar?"}
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      {review ? (
        <>
          <Text style={ui.text}>{CANCELLATION_REASON_LABELS[reasonCode!]}</Text>
          {reasonCode === "OTHER" && (
            <Text style={ui.text}>{reason.trim().normalize("NFC")}</Text>
          )}
          {needsContext && executionContext && (
            <Text style={ui.text}>
              Situação informada:{" "}
              {CANCELLATION_EXECUTION_LABELS[executionContext]}
            </Text>
          )}
          <Text style={ui.text}>
            Ao confirmar, esta solicitação será encerrada e não poderá ser
            reaberta. O histórico será preservado. O contato ficará indisponível
            e este atendimento não poderá ser avaliado.
          </Text>
          <Text style={ui.small}>
            Cancelar não confirma a conclusão do serviço nem exige confirmação
            da outra pessoa.
          </Text>
          {uncertain && (
            <Text style={ui.small}>
              A resposta não foi confirmada. Repita com os mesmos dados ou volte
              para atualizar a solicitação antes de tentar outra ação.
            </Text>
          )}
          <PrimaryButton
            title={
              uncertain ? "Repetir cancelamento" : "Confirmar cancelamento"
            }
            loading={busy}
            onPress={() => void confirm()}
          />
          {!uncertain && (
            <TextButton
              title="Revisar motivo"
              disabled={busy}
              onPress={() => {
                setReview(false);
                setError("");
              }}
            />
          )}
        </>
      ) : (
        <>
          <View
            style={ui.group}
            accessibilityRole="radiogroup"
            accessibilityLabel="Motivo do cancelamento"
          >
            {reasons.map((option) => (
              <Choice
                key={option.code}
                label={option.label}
                selected={reasonCode === option.code}
                onPress={() => setReasonCode(option.code)}
              />
            ))}
          </View>
          {reasonCode === "OTHER" && (
            <OminiInput
              label="Descreva o outro motivo"
              value={reason}
              onChangeText={setReason}
              multiline
              maxLength={500}
              hint="De 10 a 500 caracteres. Não inclua dados pessoais ou contatos."
            />
          )}
          {needsContext && (
            <View
              style={ui.group}
              accessibilityRole="radiogroup"
              accessibilityLabel="Situação de execução do atendimento"
            >
              <Text style={ui.section}>O que foi executado?</Text>
              <Text style={ui.small}>
                Informe a situação do atendimento. Esta é uma declaração sua,
                sem comprovar execução ou conclusão.
              </Text>
              {CANCELLATION_EXECUTION_CONTEXTS.map((context) => (
                <Choice
                  key={context}
                  label={CANCELLATION_EXECUTION_LABELS[context]}
                  selected={executionContext === context}
                  onPress={() => setExecutionContext(context)}
                />
              ))}
            </View>
          )}
          <PrimaryButton
            title="Revisar cancelamento"
            onPress={reviewCancellation}
          />
        </>
      )}
      {!!error && <Feedback message={error} />}
      {__DEV__ && !!error && httpStatus !== null && (
        <Text style={ui.small}>Resposta da API: HTTP {httpStatus}</Text>
      )}
      <TextButton
        title={
          uncertain ? "Voltar e atualizar solicitação" : "Voltar sem cancelar"
        }
        disabled={busy}
        onPress={onClose}
      />
    </FlowDialog>
  );
}

function Choice({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityLabel={label}
      accessibilityState={{ checked: selected }}
      onPress={onPress}
      style={[
        ui.card,
        {
          minHeight: 48,
          backgroundColor: selected ? theme.colors.pale : theme.colors.surface,
        },
      ]}
    >
      <Text style={ui.text}>{label}</Text>
    </Pressable>
  );
}
