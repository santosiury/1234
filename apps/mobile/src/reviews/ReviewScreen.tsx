import { useCallback, useMemo, useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { Redirect, useLocalSearchParams } from "expo-router";
import Ionicons from "@expo/vector-icons/Ionicons";
import { hasPrivateRequestData, type CreateReviewInput } from "@omini/shared";
import { useSession } from "../auth/session";
import { AuthFailure } from "../auth/api";
import {
  ScreenContainer,
  Header,
  OminiInput,
  PrimaryButton,
  Feedback,
  ui,
} from "../components/ui";
import { RemoteStatus } from "../marketplace/components";
import { useRemote } from "../marketplace/hooks";
import { useFormExit } from "../marketplace/provider/FlowUI";
import { useRequestUpdates } from "../requests/notifications/provider";
import { isRequestId } from "../requests/api";
import { theme } from "../theme";
import { ReviewsApi } from "./api";
export function ReviewScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { state } = useSession();
  if (state.status === "loading") return null;
  if (!isRequestId(id)) return <Redirect href="/client/requests" />;
  if (!state.user)
    return (
      <Redirect
        href={{
          pathname: "/login",
          params: { requestId: id, requestSide: "client" },
        }}
      />
    );
  return <ReviewForm key={`${state.user.id}:${id}`} id={id} />;
}
function ReviewForm({ id }: { id: string }) {
  const { manager, state } = useSession(),
    owner = state.user!.id;
  const { monitor } = useRequestUpdates();
  const api = useMemo(() => new ReviewsApi(manager), [manager, owner]);
  const result = useRemote(useCallback(() => api.request(id), [api, id]));
  const [rating, setRating] = useState(0),
    [comment, setComment] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const lock = useRef(false),
    intent = useRef<CreateReviewInput | null>(null);
  const [uncertain, setUncertain] = useState(false);
  const exit = useFormExit(rating > 0 || comment !== "", busy, {
    pathname: "/client/requests/[id]",
    params: { id },
  });
  async function publish() {
    if (lock.current) return;
    if (
      !intent.current &&
      (!Number.isInteger(rating) ||
        rating < 1 ||
        rating > 5 ||
        comment.trim().length > 1000 ||
        hasPrivateRequestData(comment) ||
        /[<>\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(comment))
    ) {
      setError(
        "Escolha de 1 a 5 estrelas. O comentário é opcional, com até 1.000 caracteres e sem dados pessoais ou links.",
      );
      return;
    }
    lock.current = true;
    setBusy(true);
    setError("");
    intent.current ??= {
      rating,
      comment: comment.trim().normalize("NFC") || null,
    };
    try {
      await api.create(id, intent.current);
      if (manager.state.user?.id !== owner) return;
      void monitor?.refresh(true);
      exit.finish();
    } catch (e) {
      setError(
        e instanceof AuthFailure
          ? e.message
          : "Não foi possível publicar. Tente novamente.",
      );
      if (e instanceof AuthFailure && e.status === 400) {
        intent.current = null;
        setUncertain(false);
      } else {
        setUncertain(true);
        if (e instanceof AuthFailure && [404, 409].includes(e.status))
          result.reload();
      }
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  const existing = result.data?.review;
  return (
    <ScreenContainer>
      <Header title="Avalie o atendimento" back onBack={exit.leave} />
      <RemoteStatus {...result} />
      {existing ? (
        <View style={ui.card}>
          <Text style={ui.section}>Sua avaliação já foi publicada</Text>
          <Text style={ui.text}>{existing.rating} ⭐</Text>
          {!!existing.comment && (
            <Text style={ui.text}>{existing.comment}</Text>
          )}
          <Text style={ui.small}>
            {new Date(existing.createdAt).toLocaleDateString("pt-BR")}
          </Text>
        </View>
      ) : result.data?.canReview ? (
        <>
          <Text style={ui.text}>
            Como foi o atendimento? Escolha uma nota de 1 a 5 estrelas.
          </Text>
          <View
            style={[ui.row, { flexWrap: "wrap" }]}
            accessibilityRole="radiogroup"
            accessibilityLabel="Nota do atendimento"
          >
            {([1, 2, 3, 4, 5] as const).map((n) => (
              <Pressable
                key={n}
                accessibilityRole="radio"
                accessibilityLabel={`${n} ${n === 1 ? "estrela" : "estrelas"}`}
                accessibilityState={{
                  checked: rating === n,
                  disabled: busy || uncertain,
                }}
                disabled={busy || uncertain}
                onPress={() => setRating(n)}
                style={{
                  minWidth: 48,
                  minHeight: 48,
                  alignItems: "center",
                  justifyContent: "center",
                  padding: 8,
                }}
              >
                <Ionicons
                  name={n <= rating ? "star" : "star-outline"}
                  size={30}
                  color={theme.colors.ink}
                />
              </Pressable>
            ))}
          </View>
          <OminiInput
            label="Comentário opcional"
            value={comment}
            onChangeText={setComment}
            multiline
            maxLength={1000}
            editable={!busy && !uncertain}
            hint="Até 1.000 caracteres. Não inclua nomes, telefone, endereço ou outros dados pessoais."
          />
          <Text style={ui.small}>
            Sua avaliação será pública como Cliente Omini. Confira a nota e o
            comentário: depois de publicar, você não poderá editar ou excluir
            nesta fase.
          </Text>
          {!!uncertain && (
            <Text style={ui.small}>
              A resposta não foi confirmada. Tente publicar novamente com os
              mesmos dados, ou volte ao atendimento para conferir se a avaliação
              foi recebida.
            </Text>
          )}
          <PrimaryButton
            title={
              uncertain ? "Conferir e repetir publicação" : "Publicar avaliação"
            }
            loading={busy}
            onPress={() => void publish()}
          />
        </>
      ) : (
        result.data && (
          <Text style={ui.text}>
            Esta solicitação não está disponível para avaliação.
          </Text>
        )
      )}
      {!!error && <Feedback message={error} />}
      <PrimaryButton
        secondary
        title="Voltar ao atendimento"
        disabled={busy}
        onPress={exit.leave}
      />
      {exit.dialog}
    </ScreenContainer>
  );
}
