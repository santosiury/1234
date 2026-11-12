import { useMemo, useState } from "react";
import { Redirect, router, useLocalSearchParams } from "expo-router";
import type { RequestParticipant } from "@omini/shared";
import { useSession } from "../auth/session";
import { AuthFailure } from "../auth/api";
import { useMode } from "../mode";
import { Text } from "react-native";
import {
  ScreenContainer,
  Header,
  PrimaryButton,
  TextButton,
  Feedback,
  ui,
} from "../components/ui";
import { RequestsApi } from "./api";
import { requestIntent } from "./intent";
const errorMessage = (error: unknown) =>
  error instanceof AuthFailure
    ? error.message
    : "Não foi possível concluir. Tente novamente.";
export function useRequestsApi() {
  const { manager, state } = useSession();
  return useMemo(() => new RequestsApi(manager), [manager, state.user?.id]);
}

function listPath(side: RequestParticipant) {
  return side === "client" ? "/client/requests" : "/provider/requests";
}
export function RequestRoleGate({
  role,
  onReady,
}: {
  role: RequestParticipant;
  onReady?: () => void;
}) {
  const { manager, state } = useSession();
  const { setMode, setCatalogSource } = useMode();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <ScreenContainer>
      <Header title="Uma conta, duas experiências" />
      <Text style={ui.text}>
        Para continuar, ative o perfil de{" "}
        {role === "client" ? "cliente" : "prestador"} na mesma conta.
      </Text>
      {!!error && <Feedback message={error} />}
      <PrimaryButton
        title={`Ativar perfil de ${role === "client" ? "cliente" : "prestador"}`}
        loading={busy}
        onPress={() => {
          if (busy) return;
          setBusy(true);
          void manager
            .addProfile(role)
            .then(() => {
              setCatalogSource("real");
              setMode(role);
              onReady?.();
            })
            .catch((e) => setError(errorMessage(e)))
            .finally(() => setBusy(false));
        }}
      />
      {state.user && (
        <TextButton
          title="Minha conta"
          onPress={() => router.replace("/account")}
        />
      )}
    </ScreenContainer>
  );
}
export function ResumeRequestScreen() {
  const params = requestIntent(useLocalSearchParams());
  const { state } = useSession();
  const { mode, setMode, catalogSource, setCatalogSource } = useMode();
  if (state.status === "loading") return null;
  if (!state.user)
    return <Redirect href={{ pathname: "/login", params: { ...params } }} />;
  const side: RequestParticipant =
    params.requestSide ??
    (params.requestReturn === "received" ? "provider" : "client");
  if (!params.requestId && !params.requestReturn)
    return <Redirect href="/account" />;
  const destination = params.requestId
    ? {
        pathname:
          side === "client"
            ? ("/client/requests/[id]" as const)
            : ("/provider/requests/[id]" as const),
        params: { id: params.requestId },
      }
    : listPath(side);
  if (!state.user.profiles[side]) return <RequestRoleGate role={side} />;
  if (mode === side && catalogSource === "real")
    return <Redirect href={destination} withAnchor />;
  return (
    <ScreenContainer>
      <Header title="Retomar solicitação" />
      <Text style={ui.text}>
        Continue na experiência de {side === "client" ? "cliente" : "prestador"}{" "}
        para acompanhar esta solicitação.
      </Text>
      <PrimaryButton
        title={`Continuar como ${side === "client" ? "cliente" : "prestador"}`}
        onPress={() => {
          setMode(side);
          setCatalogSource("real");
          router.replace(destination, { withAnchor: true });
        }}
      />
    </ScreenContainer>
  );
}
