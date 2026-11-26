import { useState } from "react";
import { Text, View } from "react-native";
import { Redirect } from "expo-router";
import { Header, PrimaryButton, ScreenContainer, ui } from "../components/ui";
import { MOBILE_UI_REVISION, runtimeApiLabel } from "./runtime";

/** Unlinked internal route. Production redirects before mounting any diagnostics. */
export function DiagnosticsScreen() {
  return __DEV__ ? <DevelopmentDiagnostics /> : <Redirect href="/" />;
}
function DevelopmentDiagnostics() {
  const [loading, setLoading] = useState(false),
    [message, setMessage] = useState("");
  const baseUrl = process.env.EXPO_PUBLIC_API_URL;
  async function checkApi() {
    if (loading) return;
    setLoading(true);
    setMessage("");
    try {
      const address = new URL(baseUrl ?? "");
      if (
        !["http:", "https:"].includes(address.protocol) ||
        address.username ||
        address.password ||
        address.search ||
        address.hash ||
        address.pathname.replace(/\/+$/, "") !== "/api"
      )
        throw Error("Invalid configuration");
      const response = await fetch(`${address.origin}/api/health`, {
        signal: AbortSignal.timeout(8000),
      });
      if (!response.ok) throw Error("Unavailable");
      const data: unknown = await response.json();
      if (
        !data ||
        typeof data !== "object" ||
        !("status" in data) ||
        data.status !== "ok" ||
        !("timestamp" in data) ||
        typeof data.timestamp !== "string" ||
        !Number.isFinite(Date.parse(data.timestamp))
      )
        throw Error("Invalid response");
      setMessage(
        "A API respondeu ao health check. Esta consulta não valida o banco nem o cancelamento.",
      );
    } catch {
      setMessage(
        "Não foi possível conectar. Confira o endereço da API de testes, a rede e o servidor.",
      );
    } finally {
      setLoading(false);
    }
  }
  return (
    <ScreenContainer>
      <Header title="Diagnóstico interno" back />
      <View style={ui.card}>
        <Text style={ui.section}>Conexão com a API</Text>
        <Text style={ui.small}>Revisão mobile: {MOBILE_UI_REVISION}</Text>
        <Text style={ui.small}>API do app: {runtimeApiLabel(baseUrl)}</Text>
        <Text style={ui.text}>
          Área exclusiva de desenvolvimento. Consulta apenas /api/health, sem
          dados pessoais.
        </Text>
        <PrimaryButton
          secondary
          title="Testar conexão"
          loading={loading}
          onPress={() => void checkApi()}
        />
        {!!message && (
          <Text accessibilityLiveRegion="polite" style={ui.text}>
            {message}
          </Text>
        )}
      </View>
    </ScreenContainer>
  );
}
