import { useState } from "react";
import { Switch, Text, View } from "react-native";
import { requestIntent, requestAuthReturn } from "../requests/intent";
import { Redirect, router, useLocalSearchParams } from "expo-router";
import { AuthApi, AuthFailure } from "./api";
import { useSession } from "./session";
import {
  Header,
  PrimaryButton,
  ScreenContainer,
  OminiInput,
  Feedback,
  ui,
} from "../components/ui";
import { theme } from "../theme";
export function AuthForm({ register = false }: { register?: boolean }) {
  const { manager, state } = useSession();
  const intent = requestIntent(useLocalSearchParams());
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [client, setClient] = useState(true);
  const [provider, setProvider] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [created, setCreated] = useState(false);
  async function submit() {
    if (busy) return;
    const normalized = email.trim().toLowerCase();
    if (
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized) ||
      normalized.length > 254 ||
      !password ||
      password.length > 128 ||
      (register &&
        (name.trim().length < 2 ||
          password.length < 12 ||
          !/\S/.test(password) ||
          (!client && !provider)))
    ) {
      setMessage(
        "Confira o e-mail, o nome, os perfis e a senha. No cadastro, use de 12 a 128 caracteres.",
      );
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      if (register) {
        await new AuthApi().register({
          displayName: name.trim(),
          email: normalized,
          password,
          profiles: [
            ...(client ? ["client" as const] : []),
            ...(provider ? ["provider" as const] : []),
          ],
        });
        setPassword("");
        setCreated(true);
        setMessage(
          "Se os dados puderem ser utilizados, o cadastro foi criado. Entre com seu e-mail e senha.",
        );
      } else {
        await manager.login(normalized, password);
        setPassword("");
      }
    } catch (error) {
      setMessage(
        error instanceof AuthFailure
          ? error.message
          : "Não foi possível concluir. Verifique a conexão e tente novamente.",
      );
    } finally {
      setBusy(false);
    }
  }
  if (state.user)
    return (
      <Redirect
        href={
          requestAuthReturn({ ...intent }) ??
          (state.user.profiles.client
            ? "/client"
            : state.user.profiles.provider
              ? "/provider"
              : "/account")
        }
      />
    );
  return (
    <ScreenContainer>
      <Header
        title={register ? "Crie sua conta Omini" : "Que bom ter você aqui"}
        subtitle={
          register
            ? "Uma conta para cuidar e oferecer seu talento."
            : "Entre para acessar sua conta."
        }
        back
      />
      {!!state.message && !message && <Feedback message={state.message} />}
      {!created && (
        <>
          {register && (
            <OminiInput
              label="Seu nome"
              icon="person-outline"
              accessibilityLabel="Nome"
              value={name}
              onChangeText={setName}
              placeholder="Seu nome"
              maxLength={120}
              autoComplete="name"
              editable={!busy}
            />
          )}
          <OminiInput
            label="E-mail"
            icon="mail-outline"
            accessibilityLabel="E-mail"
            value={email}
            onChangeText={setEmail}
            placeholder="E-mail"
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="email"
            maxLength={254}
            editable={!busy}
          />
          <OminiInput
            label="Senha"
            icon="lock-closed-outline"
            hint={
              register
                ? "Use de 12 a 128 caracteres. Evite senhas reutilizadas."
                : undefined
            }
            accessibilityLabel="Senha"
            value={password}
            onChangeText={setPassword}
            placeholder={register ? "Senha: 12 a 128 caracteres" : "Senha"}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete={register ? "new-password" : "current-password"}
            textContentType={register ? "newPassword" : "password"}
            maxLength={128}
            editable={!busy}
          />
          {register && (
            <View style={ui.card}>
              <Text style={ui.section}>Uma conta. Seu jeito de usar.</Text>
              <View style={ui.row}>
                <Text style={[ui.text, { flex: 1 }]}>Cliente</Text>
                <Switch
                  accessibilityLabel="Cadastrar perfil cliente"
                  value={client}
                  onValueChange={setClient}
                  disabled={busy}
                  trackColor={theme.switch}
                  thumbColor={theme.colors.ink}
                />
              </View>
              <View style={ui.row}>
                <Text style={[ui.text, { flex: 1 }]}>Prestador</Text>
                <Switch
                  accessibilityLabel="Cadastrar perfil prestador"
                  value={provider}
                  onValueChange={setProvider}
                  disabled={busy}
                  trackColor={theme.switch}
                  thumbColor={theme.colors.ink}
                />
              </View>
              <Text style={ui.text}>
                Você pode escolher os dois perfis na mesma conta.
              </Text>
            </View>
          )}
          <PrimaryButton
            title={register ? "Criar conta" : "Entrar"}
            loading={busy}
            onPress={submit}
          />
        </>
      )}
      {!!message && <Feedback message={message} error={!created} />}
      <PrimaryButton
        secondary
        disabled={busy}
        title={register ? "Já tenho conta · entrar" : "Criar uma conta"}
        onPress={() => {
          setPassword("");
          router.replace({
            pathname: register ? "/login" : "/register",
            params: { ...intent },
          });
        }}
      />
    </ScreenContainer>
  );
}
