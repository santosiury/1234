import { useCallback, useMemo } from "react";
import { Text, View } from "react-native";
import { router } from "expo-router";
import { useSession } from "../auth/session";
import { useRemote } from "../marketplace/hooks";
import { RemoteStatus } from "../marketplace/components";
import { PrimaryButton, ui } from "../components/ui";
import { useRequestUpdates } from "../requests/notifications/provider";
import { useMonitorRefresh } from "../requests/useMonitorRefresh";
import { ReviewsApi } from "./api";
export function RequestReviewPanel({
  id,
  version,
}: {
  id: string;
  version: number;
}) {
  const { manager, state } = useSession();
  const { state: updates } = useRequestUpdates();
  const api = useMemo(() => new ReviewsApi(manager), [manager, state.user?.id]);
  const result = useRemote(
    useCallback(() => api.request(id), [api, id, version]),
  );
  useMonitorRefresh(result.reload, updates.revision);
  const r = result.data?.review;
  return (
    <View style={ui.card}>
      <Text style={ui.section}>Avaliação do atendimento</Text>
      <RemoteStatus {...result} />
      {r ? (
        <>
          <Text style={ui.text}>Avaliação publicada · {r.rating} de 5</Text>
          <Text style={ui.small}>
            {new Date(r.createdAt).toLocaleDateString("pt-BR")}
          </Text>
          {!!r.comment && <Text style={ui.text}>{r.comment}</Text>}
        </>
      ) : result.data?.canReview ? (
        <>
          <Text style={ui.text}>
            Como foi o atendimento? Sua avaliação é opcional e ajuda outras
            pessoas a escolher.
          </Text>
          <PrimaryButton
            title="Avalie o atendimento"
            onPress={() =>
              router.push({ pathname: "/service-review/[id]", params: { id } })
            }
          />
          <Text style={ui.small}>
            Você também pode avaliar mais tarde pelo histórico desta
            solicitação.
          </Text>
        </>
      ) : (
        result.data && (
          <Text style={ui.small}>
            Ainda não há avaliação publicada para este atendimento.
          </Text>
        )
      )}
    </View>
  );
}
