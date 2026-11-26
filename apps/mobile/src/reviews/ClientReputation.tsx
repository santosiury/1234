import { useCallback, useMemo } from "react";
import { useSession } from "../auth/session";
import { AuthFailure } from "../auth/api";
import { useRemote } from "../marketplace/hooks";
import {
  ReviewsSection,
  type ReviewsViewState,
} from "../components/ReviewsSection";
import { ReviewsApi } from "./api";
/** Authorization derives the client on the server, never from a user ID provided by this screen. */
export function ClientReputation({ requestId }: { requestId?: string }) {
  const { manager, state: session } = useSession();
  const api = useMemo(
    () => new ReviewsApi(manager),
    [manager, session.user?.id],
  );
  const result = useRemote(
    useCallback(async () => {
      try {
        return await api.clientReputation(requestId);
      } catch (e) {
        if (e instanceof AuthFailure && e.status === 404) return null;
        throw e;
      }
    }, [api, requestId]),
  );
  // Old APIs and closed/unauthorized requests deliberately expose no reputation entry.
  if (!result.loading && !result.error && !result.data) return null;
  const d = result.data;
  const state: ReviewsViewState = result.loading
    ? { status: "loading" }
    : result.error
      ? { status: "error", onRetry: result.reload }
      : d?.privacyProtected
        ? { status: "protected" }
        : d && d.average !== null && d.total > 0
          ? {
              status: "ready",
              average: d.average,
              count: d.total,
              distribution: d.distribution,
              anonymous: true,
              received: [],
            }
          : { status: "protected" };
  return (
    <ReviewsSection
      title={
        requestId ? "Reputação do cliente" : "Minha reputação como cliente"
      }
      state={state}
    />
  );
}
