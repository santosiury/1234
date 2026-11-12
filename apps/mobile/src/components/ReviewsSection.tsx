import { ActivityIndicator, Text, View } from "react-native";
import { PrimaryButton, ui } from "./ui";
import { theme } from "../theme";

// Presentation types only. A future authenticated/public API adapter supplies published data.
export type ReviewRating = 1 | 2 | 3 | 4 | 5;
export interface ReviewCommentView {
  id: string;
  authorLabel: string;
  rating: ReviewRating;
  comment?: string | null;
}
export type ReviewsViewState =
  | { status: "unavailable" | "empty" }
  | { status: "loading" }
  | { status: "error"; onRetry?: () => void }
  | {
      status: "ready";
      average: number;
      count: number;
      received: readonly ReviewCommentView[];
      given?: readonly ReviewCommentView[];
    };
const unavailable: ReviewsViewState = { status: "unavailable" };

/** No fetch, calculation or invented reputation: current callers deliberately use unavailable. */
export function ReviewsSection({
  audience = "owner",
  state = unavailable,
}: {
  audience?: "owner" | "public";
  state?: ReviewsViewState;
}) {
  return (
    <View style={[ui.card, { gap: theme.space.xs }]}>
      <Text accessibilityRole="header" style={ui.section}>
        Avaliações
      </Text>
      {state.status === "loading" ? (
        <ActivityIndicator
          accessibilityLabel="Carregando avaliações"
          color={theme.colors.ink}
        />
      ) : state.status === "error" ? (
        <>
          <Text accessibilityRole="alert" style={ui.text}>
            Não foi possível carregar as avaliações.
          </Text>
          {state.onRetry && (
            <PrimaryButton
              secondary
              title="Tentar novamente"
              onPress={state.onRetry}
            />
          )}
        </>
      ) : state.status === "ready" ? (
        <>
          <Text style={ui.text}>
            {state.average.toLocaleString("pt-BR", {
              maximumFractionDigits: 1,
            })}{" "}
            de 5 · {state.count}{" "}
            {state.count === 1 ? "avaliação recebida" : "avaliações recebidas"}
          </Text>
          {state.received.map((review) => (
            <ReviewComment key={review.id} review={review} />
          ))}
          {audience === "owner" && !!state.given?.length && (
            <View style={ui.group}>
              <Text accessibilityRole="header" style={ui.section}>
                Avaliações que você fez
              </Text>
              {state.given.map((review) => (
                <ReviewComment key={review.id} review={review} />
              ))}
            </View>
          )}
        </>
      ) : (
        <>
          <Text style={ui.text}>Ainda não há avaliações.</Text>
          <Text style={ui.small}>
            {audience === "owner"
              ? "Depois de realizar serviços pelo Omini, seus clientes poderão avaliar seu atendimento."
              : "Depois de realizar serviços pelo Omini, os clientes poderão avaliar o atendimento deste profissional."}
          </Text>
        </>
      )}
    </View>
  );
}
function ReviewComment({ review }: { review: ReviewCommentView }) {
  return (
    <View style={ui.group}>
      <Text style={ui.text}>
        {review.authorLabel} · {review.rating} de 5
      </Text>
      {!!review.comment && <Text style={ui.small}>{review.comment}</Text>}
    </View>
  );
}
