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
          <Text style={ui.text}>
            {r.protected ? "Avaliação recebida" : "Avaliação publicada"} ·{" "}
            {r.rating} ⭐
          </Text>
          <Text style={ui.small}>
            {new Date(r.createdAt).toLocaleDateString("pt-BR")}
          </Text>
          {!!r.comment && <Text style={ui.text}>{r.comment}</Text>}
        </>
      ) : result.data?.canReview ? (
        <>
          <Text style={ui.text}>
            {result.data.target === "client"
              ? "Como foi a experiência com o cliente?"
              : "Como foi o atendimento?"}{" "}
            Sua avaliação é opcional.
          </Text>
          <PrimaryButton
            title="Avalie o atendimento"
            onPress={() =>
              router.push({
                pathname: "/service-review/[id]",
                params: { id, side: result.data?.viewer ?? "client" },
              })
            }
          />
          <Text style={ui.small}>
            {result.data.protected
              ? "Envie até 14 dias após a conclusão. As notas são liberadas quando ambos avaliam ou no fim do prazo, com divulgação agregada para proteger o anonimato. Comentários ficam restritos ao autor e à auditoria interna."
              : "Você também pode avaliar mais tarde pelo histórico desta solicitação."}
          </Text>
        </>
      ) : (
        result.data && (
          <Text style={ui.small}>
            {result.data.protected || result.data.closesAt === null
              ? "O envio de avaliação não está disponível. O prazo pode ter terminado ou a contratação ser anterior à nova política."
              : "Ainda não há avaliação publicada para este atendimento."}
          </Text>
        )
      )}
    </View>
  );
}
