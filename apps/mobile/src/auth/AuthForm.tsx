import { useState } from "react";
import { Switch, Text, TextInput, View } from "react-native";
import { Redirect, router } from "expo-router";
import { AuthApi, AuthFailure } from "./api";
import { useSession } from "./session";
import { Header, PrimaryButton, ScreenContainer, ui } from "../components/ui";
export function AuthForm({ register = false }: { register?: boolean }) {
  const { manager, state } = useSession();
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
          state.user.profiles.client
            ? "/client"
            : state.user.profiles.provider
              ? "/provider"
              : "/account"
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
      {!!state.message && !message && (
        <Text accessibilityRole="alert" style={ui.text}>
          {state.message}
        </Text>
      )}
      {!created && (
        <>
          {register && (
            <TextInput
              accessibilityLabel="Nome"
              value={name}
              onChangeText={setName}
              placeholder="Seu nome"
              maxLength={120}
              autoComplete="name"
              style={ui.input}
              editable={!busy}
            />
          )}
          <TextInput
            accessibilityLabel="E-mail"
            value={email}
            onChangeText={setEmail}
            placeholder="E-mail"
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="email"
            maxLength={254}
            style={ui.input}
            editable={!busy}
          />
          <TextInput
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
            style={ui.input}
            editable={!busy}
          />
          {register && (
            <View style={ui.card}>
              <Text style={ui.section}>Como deseja usar o Omini?</Text>
              <View style={ui.row}>
                <Text style={[ui.text, { flex: 1 }]}>Cliente</Text>
                <Switch
                  accessibilityLabel="Cadastrar perfil cliente"
                  value={client}
                  onValueChange={setClient}
                  disabled={busy}
                />
              </View>
              <View style={ui.row}>
                <Text style={[ui.text, { flex: 1 }]}>Prestador</Text>
                <Switch
                  accessibilityLabel="Cadastrar perfil prestador"
                  value={provider}
                  onValueChange={setProvider}
                  disabled={busy}
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
      {!!message && (
        <Text
          accessibilityRole="alert"
          accessibilityLiveRegion="polite"
          style={ui.text}
        >
          {message}
        </Text>
      )}
      <PrimaryButton
        secondary
        disabled={busy}
        title={register ? "Já tenho conta · entrar" : "Criar uma conta"}
        onPress={() => {
          setPassword("");
          router.replace(register ? "/login" : "/register");
        }}
      />
    </ScreenContainer>
  );
}
