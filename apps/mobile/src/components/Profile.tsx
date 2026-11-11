import { useSession } from "../auth/session";
import { AuthFailure } from "../auth/api";
import { useState, type PropsWithChildren } from "react";
import { Text, View } from "react-native";
import { router } from "expo-router";
import type { HealthResponse } from "@omini/shared";
import { useMode } from "../mode";
import {
  ScreenContainer,
  Header,
  DemoNotice,
  PrimaryButton,
  Avatar,
  Badge,
  Feedback,
  ui,
} from "./ui";
export function Profile({ children }: PropsWithChildren) {
  const { mode, setMode, catalogSource } = useMode();
  const { state, manager } = useSession();
  const [accountBusy, setAccountBusy] = useState(false);
  const [accountMessage, setAccountMessage] = useState("");
  async function accountAction(
    operation: () => Promise<unknown>,
    leave = false,
  ) {
    if (accountBusy) return;
    setAccountBusy(true);
    setAccountMessage("");
    try {
      await operation();
      if (leave) router.replace("/");
    } catch (error) {
      setAccountMessage(
        error instanceof AuthFailure
          ? error.message
          : "Não foi possível concluir. Tente novamente.",
      );
    } finally {
      setAccountBusy(false);
    }
  }
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
      {children}
      {state.user ? (
        <View style={ui.group}>
          <View style={ui.darkCard}>
            <View
              style={[
                ui.row,
                { flexWrap: "wrap", justifyContent: "space-between" },
              ]}
            >
              <Avatar
                initials={state.user.displayName
                  .split(/\s+/)
                  .map((part) => part[0])
                  .slice(0, 2)
                  .join("")
                  .toUpperCase()}
                large
              />
              <Badge dark>Conta autenticada</Badge>
            </View>
            <Text style={[ui.section, ui.onDark]}>
              {state.user.displayName}
            </Text>
            <Text style={[ui.text, ui.onDarkMuted]}>{state.user.email}</Text>
          </View>
          <View style={ui.card}>
            <Text style={ui.section}>Uma conta, duas experiências</Text>
            <Text style={ui.text}>
              Perfis ativos:{" "}
              {[
                state.user.profiles.client ? "cliente" : "",
                state.user.profiles.provider ? "prestador" : "",
              ]
                .filter(Boolean)
                .join(" e ") || "nenhum"}
            </Text>
            {(["client", "provider"] as const)
              .filter((role) => role !== mode)
              .map((role) =>
                state.user!.profiles[role] ? (
                  <PrimaryButton
                    key={role}
                    secondary
                    disabled={accountBusy}
                    title={`Mudar para ${role === "client" ? "cliente" : "prestador"}`}
                    onPress={() => {
                      setMode(role);
                      router.replace(
                        role === "client" ? "/client" : "/provider",
                      );
                    }}
                  />
                ) : (
                  <PrimaryButton
                    key={role}
                    secondary
                    loading={accountBusy}
                    title={`Adicionar perfil de ${role === "client" ? "cliente" : "prestador"}`}
                    onPress={() =>
                      void accountAction(() => manager.addProfile(role))
                    }
                  />
                ),
              )}
          </View>
          <PrimaryButton
            secondary
            title="Atualizar conta"
            loading={accountBusy}
            onPress={() => void accountAction(() => manager.sync())}
          />
          <PrimaryButton
            variant="danger"
            icon="log-out-outline"
            title="Sair da conta"
            loading={accountBusy}
            onPress={() => void accountAction(() => manager.logout(), true)}
          />
        </View>
      ) : (
        <>
          <View style={ui.darkCard}>
            <Badge dark>Exploração sem login</Badge>
            <Text style={[ui.section, ui.onDark]}>
              Você está explorando como{" "}
              {mode === "client" ? "cliente" : "prestador"}
            </Text>
            <Text style={[ui.text, ui.onDarkMuted]}>
              Entre ou cadastre uma conta para acessar seu perfil e configurar
              seus serviços.
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
            title="Entrar na minha conta"
            onPress={() => router.push("/login")}
          />
          <PrimaryButton
            secondary
            title="Cadastrar no Omini"
            onPress={() => router.push("/register")}
          />
        </>
      )}
      {!!accountMessage && <Feedback message={accountMessage} />}
      <PrimaryButton
        secondary
        title="Voltar às boas-vindas"
        onPress={() => router.replace("/")}
      />
      {catalogSource === "demo" && <DemoNotice />}
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
