import { useState } from "react";
import { Text, View } from "react-native";
import { router } from "expo-router";
import type { HealthResponse } from "@omini/shared";
import { useMode } from "../mode";
import { ScreenContainer, Header, DemoNotice, PrimaryButton, ui } from "./ui";
export function Profile() {
  const { mode, setMode } = useMode();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const baseUrl = process.env.EXPO_PUBLIC_API_URL;
  async function checkApi() {
    setLoading(true);
    setMessage("");
    try {
      if (!baseUrl || !/^https?:\/\//.test(baseUrl))
        throw new Error("Configure EXPO_PUBLIC_API_URL no .env do aplicativo.");
      const response = await fetch(`${baseUrl.replace(/\/$/, "")}/health`, {
        signal: AbortSignal.timeout(8000),
      });
      if (!response.ok) throw new Error("A API retornou um erro.");
      const data: HealthResponse = await response.json();
      if (data.status !== "ok" || !Number.isFinite(Date.parse(data.timestamp)))
        throw new Error("Resposta inesperada da API.");
      setMessage("API conectada. Health check recebido com sucesso.");
    } catch (error) {
      setMessage(
        error instanceof Error && error.message.startsWith("Configure")
          ? error.message
          : "Não foi possível conectar. Verifique o IP da rede local, o servidor e o firewall.",
      );
    } finally {
      setLoading(false);
    }
  }
  return (
    <ScreenContainer>
      <Header
        title={
          mode === "client" ? "Seu espaço no Omini" : "Seu perfil profissional"
        }
      />
      <DemoNotice />
      <View style={ui.card}>
        <Text style={ui.section}>
          Você está explorando como{" "}
          {mode === "client" ? "cliente" : "prestador"}
        </Text>
        <Text style={ui.text}>
          Nenhuma conta foi criada. Seus dados pessoais e seu perfil
          profissional serão configurados em fases futuras.
        </Text>
      </View>
      <PrimaryButton
        title={`Mudar para ${mode === "client" ? "prestador" : "cliente"}`}
        onPress={() => {
          const next = mode === "client" ? "provider" : "client";
          setMode(next);
          router.replace(next === "client" ? "/client" : "/provider");
        }}
      />
      <PrimaryButton
        secondary
        title="Voltar às boas-vindas"
        onPress={() => router.replace("/")}
      />
      <View style={ui.card}>
        <Text style={ui.section}>Conexão com a API</Text>
        <Text style={ui.text}>
          Este diagnóstico consulta apenas o health check. Não envia dados
          pessoais.
        </Text>
        <PrimaryButton
          secondary
          title="Testar conexão"
          loading={loading}
          onPress={checkApi}
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
