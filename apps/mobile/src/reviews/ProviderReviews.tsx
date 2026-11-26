import { useCallback, useMemo, useState } from "react";
import { View } from "react-native";
import { useSession } from "../auth/session";
import { useRemote } from "../marketplace/hooks";
import {
  ReviewsSection,
  type ReviewsViewState,
} from "../components/ReviewsSection";
import { PrimaryButton, ui } from "../components/ui";
import { useRequestUpdates } from "../requests/notifications/provider";
import { useMonitorRefresh } from "../requests/useMonitorRefresh";
import { ReviewsApi } from "./api";
export function ProviderReviews({
  providerId,
  own = false,
}: {
  providerId: string;
  own?: boolean;
}) {
  const { manager, state: session } = useSession();
  const { state: updates } = useRequestUpdates();
  const api = useMemo(
    () => new ReviewsApi(manager),
    [manager, session.user?.id],
  );
  const [page, setPage] = useState(1);
  const result = useRemote(
    useCallback(
      () => api.page(providerId, page, own),
      [api, providerId, page, own],
    ),
  );
  useMonitorRefresh(result.reload, updates.revision);
  const d = result.data;
  const state: ReviewsViewState = result.loading
    ? { status: "loading" }
    : result.error
      ? { status: "error", onRetry: result.reload }
      : d?.privacyProtected
        ? { status: "protected" }
        : d && d.total > 0 && d.average !== null
          ? {
              status: "ready",
              average: d.average,
              count: d.total,
              distribution: d.distribution,
              anonymous: d.anonymous,
              received: d.items,
            }
          : { status: "empty" };
  return (
    <View style={ui.group}>
      <ReviewsSection audience={own ? "owner" : "public"} state={state} />
      {d && !d.anonymous && d.total > d.pageSize && (
        <View style={ui.group}>
          <PrimaryButton
            secondary
            title="Avaliações anteriores"
            disabled={page === 1 || result.loading}
            onPress={() => setPage((p) => p - 1)}
          />
          <PrimaryButton
            secondary
            title="Próxima página de avaliações"
            disabled={page * d.pageSize >= d.total || result.loading}
            onPress={() => setPage((p) => p + 1)}
          />
        </View>
      )}
    </View>
  );
}
