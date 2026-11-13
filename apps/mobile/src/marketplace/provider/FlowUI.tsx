import {
  useEffect,
  useRef,
  useState,
  type ComponentProps,
  type ComponentRef,
  type PropsWithChildren,
  type RefObject,
} from "react";
import {
  AccessibilityInfo,
  findNodeHandle,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import Ionicons from "@expo/vector-icons/Ionicons";
import {
  router,
  usePreventRemove,
  useNavigation,
  type Href,
} from "expo-router";
import { useSession } from "../../auth/session";
import { Header, PrimaryButton, TextButton, ui } from "../../components/ui";
import { theme } from "../../theme";
export function focusNative(
  target: ComponentRef<typeof View> | ComponentRef<typeof Text> | null,
) {
  if (Platform.OS === "web" || !target) return;
  const handle = findNodeHandle(target);
  if (handle) AccessibilityInfo.setAccessibilityFocus(handle);
}
export function FlowDialog({
  visible,
  title,
  children,
  onClose,
  returnFocus,
}: PropsWithChildren<{
  visible: boolean;
  title: string;
  onClose: () => void;
  returnFocus?: RefObject<ComponentRef<typeof View> | null>;
}>) {
  const heading = useRef<ComponentRef<typeof Text>>(null);
  useEffect(() => {
    if (visible) {
      const id = requestAnimationFrame(() => focusNative(heading.current));
      return () => cancelAnimationFrame(id);
    }
  }, [visible, title]);
  return (
    <Modal
      visible={visible}
      animationType="none"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
      onShow={() => focusNative(heading.current)}
      onDismiss={() => focusNative(returnFocus?.current ?? null)}
    >
      <SafeAreaView
        style={{ flex: 1, backgroundColor: theme.colors.background }}
        accessibilityViewIsModal
      >
        <StatusBar style="dark" />
        <ScrollView
          automaticallyAdjustKeyboardInsets
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{
            padding: theme.space.md,
            paddingBottom: theme.space.xl,
            flexGrow: 1,
          }}
        >
          <View
            style={{
              width: "100%",
              maxWidth: 620,
              alignSelf: "center",
              gap: theme.space.md,
            }}
          >
            <Text
              ref={heading}
              accessible
              accessibilityRole="header"
              style={ui.title}
            >
              {title}
            </Text>
            {children}
          </View>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}
export type HelpTopic =
  | "requests"
  | "new-request"
  | "dashboard"
  | "services"
  | "profile"
  | "areas"
  | "service-form"
  | "area-form"
  | "profile-form";
const help: Record<HelpTopic, { title: string; text: string }[]> = {
  requests: [
    {
      title: "Como acompanhar?",
      text: "Abra uma solicitação para ver detalhes e histórico. A lista atualiza ao abrir a tela; você também pode tocar em Atualizar. Não há atualização em tempo real.",
    },
    {
      title: "Quem confirma a conclusão?",
      text: "O prestador informa que terminou. Só o cliente pode confirmar, ou explicar o que ainda precisa ser finalizado. Não há cancelamento após o início nesta etapa.",
    },
  ],
  "new-request": [
    {
      title: "Antes de enviar",
      text: "Escolha um serviço, explique o que precisa e confira a cidade de atendimento. Se houver mais de uma cidade e nenhum contexto de busca, escolha uma das opções atendidas. Não inclua endereço completo, documentos ou contatos privados. Revise antes de confirmar o envio.",
    },
    {
      title: "Envio pendente",
      text: "Se a resposta falhar, confira o envio pendente. O aplicativo usa o mesmo identificador para evitar duplicação. Nenhuma solicitação é enviada pela demonstração.",
    },
  ],
  dashboard: [
    {
      title: "Por onde começo?",
      text: "Confira Meu perfil. Depois, adicione um serviço e informe onde atende. Toque na etapa que deseja abrir.",
    },
    {
      title: "Quando apareço na busca?",
      text: "Seu perfil precisa estar ativo, com um serviço ativo em categoria disponível e uma área de atendimento ativa. A apresentação é opcional.",
    },
  ],
  services: [
    {
      title: "Como cadastrar?",
      text: 'Toque em "Adicionar serviço", preencha as informações e salve.',
    },
    {
      title: "Como editar?",
      text: 'Toque em "Gerenciar" no serviço e depois em "Editar serviço".',
    },
    {
      title: "Como desativar?",
      text: 'Toque em "Gerenciar" e depois em "Desativar serviço". Ele não aparecerá na busca, mas continuará salvo.',
    },
    {
      title: "Como reativar?",
      text: 'Toque em "Gerenciar" e depois em "Reativar serviço". Confira a confirmação para voltar a exibi-lo.',
    },
  ],
  profile: [
    {
      title: "Perfil profissional",
      text: 'Toque em "Editar meu perfil profissional" para mudar seu nome público e sua apresentação.',
    },
    {
      title: "Onde atendo",
      text: "Informe cidades e UFs na área de atendimento. Nome, e-mail e saída da conta ficam em Minha conta.",
    },
  ],
  areas: [
    {
      title: "Como informar onde atendo?",
      text: 'Toque em "Adicionar área". Informe a cidade e a sigla do estado.',
    },
    {
      title: "Atendo toda a cidade",
      text: "Cada cidade cadastrada inclui atendimento em todo o município.",
    },
    {
      title: "Como alterar uma área?",
      text: 'Toque em "Gerenciar" no local. Você pode editar, desativar ou reativar sem apagar o cadastro.',
    },
  ],
  "service-form": [
    {
      title: "Categoria",
      text: "Escolha o tipo de trabalho que você faz. Por exemplo: Eletricista.",
    },
    {
      title: "Nome do serviço",
      text: 'Use um nome que o cliente entenda, como "Instalação de tomadas".',
    },
    {
      title: "Descrição opcional",
      text: "Conte o que está incluído no serviço. Se preferir, deixe em branco. Ao salvar, você volta à lista.",
    },
  ],
  "area-form": [
    {
      title: "Cidade e estado",
      text: "Informe a cidade e a sigla do estado. Por exemplo: Araranguá e SC.",
    },
    {
      title: "Cobertura municipal",
      text: "Cada cidade cadastrada inclui atendimento em todo o município. Você pode adicionar outros locais depois.",
    },
  ],
  "profile-form": [
    {
      title: "Seu nome profissional",
      text: "É o nome que os clientes verão. Você pode usar o seu nome ou o nome pelo qual conhece seu negócio.",
    },
    {
      title: "Sua apresentação",
      text: "Conte em poucas palavras como você pode ajudar. A apresentação é opcional e pode ser alterada depois.",
    },
  ],
};
export function HelpButton({ topic }: { topic: HelpTopic }) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<ComponentRef<typeof View>>(null);
  return (
    <>
      <Pressable
        ref={trigger}
        accessibilityRole="button"
        accessibilityLabel="Ajuda"
        onPress={() => setOpen(true)}
        style={({ pressed }) => ({
          minWidth: 44,
          minHeight: 44,
          maxWidth: "100%",
          flexShrink: 1,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: theme.space.xs,
          paddingHorizontal: theme.space.sm,
          borderRadius: theme.radii.pill,
          backgroundColor: theme.colors.surface,
          opacity: pressed ? 0.7 : 1,
        })}
      >
        <Ionicons
          name="help-circle-outline"
          size={22}
          color={theme.colors.ink}
          accessible={false}
        />
        <Text
          style={{
            fontSize: theme.type.small,
            fontFamily: theme.fonts.semibold,
            color: theme.colors.ink,
          }}
        >
          Ajuda
        </Text>
      </Pressable>
      <FlowDialog
        visible={open}
        title="Ajuda"
        onClose={() => setOpen(false)}
        returnFocus={trigger}
      >
        {help[topic].map((item) => (
          <View key={item.title} style={ui.group}>
            <Text accessibilityRole="header" style={ui.section}>
              {item.title}
            </Text>
            <Text style={ui.text}>{item.text}</Text>
          </View>
        ))}
        <PrimaryButton title="Entendi" onPress={() => setOpen(false)} />
      </FlowDialog>
    </>
  );
}
export function ProviderHeader({
  title,
  subtitle,
  topic,
  back,
  onBack,
}: {
  title: string;
  subtitle?: string;
  topic: HelpTopic;
  back?: boolean;
  onBack?: () => void;
}) {
  return (
    <Header
      title={title}
      subtitle={subtitle}
      back={back}
      onBack={onBack}
      action={<HelpButton topic={topic} />}
    />
  );
}
export function StepRow({
  title,
  description,
  complete,
  icon,
  onPress,
}: {
  title: string;
  description: string;
  complete: boolean;
  icon: ComponentProps<typeof Ionicons>["name"];
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${complete ? "Concluído" : "Pendente"}. Abrir etapa.`}
      onPress={onPress}
      style={({ pressed }) => [
        ui.card,
        ui.row,
        { minHeight: 88, opacity: pressed ? 0.7 : 1 },
      ]}
    >
      <Ionicons
        name={icon}
        size={24}
        color={theme.colors.ink}
        accessible={false}
      />
      <View style={{ flex: 1, minWidth: 0, gap: theme.space.xxs }}>
        <Text style={ui.section}>{title}</Text>
        <Text style={ui.small}>{description}</Text>
        <Text
          style={{
            fontFamily: theme.fonts.semibold,
            fontSize: theme.type.small,
            lineHeight: 22,
            color: theme.colors.ink,
          }}
        >
          {complete ? "✓ Concluído" : "Pendente"}
        </Text>
      </View>
      <Ionicons
        name="chevron-forward"
        size={18}
        color={theme.colors.ink}
        accessible={false}
      />
    </Pressable>
  );
}
/** Protect native back, gestures and explicit cancel through the SDK 58 router API. */
export function useFormExit(dirty: boolean, busy: boolean, fallback: Href) {
  const { manager, state } = useSession();
  const navigation = useNavigation();
  const [leaving, setLeaving] = useState(false);
  const [allowed, setAllowed] = useState(false);
  const pending = useRef<(() => void) | null>(null);
  const disable = usePreventRemove(
    (dirty || busy) && !allowed && !!state.user,
    ({ data, repeat }) => {
      const resume = () => {
        if (
          data.action.target &&
          data.action.target !== navigation.getState()?.key
        ) {
          // SDK 58 repeat() adds the form's source key, invalid for a POP_TO targeting
          // an ancestor Stack. Preserve the original action's source instead.
          disable();
          navigation.dispatch({ ...data.action, source: data.action.source });
        } else repeat();
      };
      if (!manager.state.user) {
        setAllowed(true);
        resume();
        return;
      }
      pending.current = resume;
      setLeaving(true);
    },
  );
  const leave = () => router.dismissTo(fallback);
  const finish = () => {
    setAllowed(true);
    setLeaving(false);
    disable();
    router.dismissTo(fallback);
  };
  const discard = () => {
    const next = pending.current;
    pending.current = null;
    setAllowed(true);
    setLeaving(false);
    next?.();
  };
  return {
    leave,
    finish,
    dialog: (
      <FlowDialog
        visible={leaving}
        title={busy ? "Salvando alterações" : "Sair sem salvar?"}
        onClose={() => setLeaving(false)}
      >
        <Text style={ui.text}>
          {busy
            ? "Aguarde um momento para concluir o salvamento."
            : "Você alterou este formulário. Se sair agora, essas alterações não serão salvas."}
        </Text>
        <PrimaryButton
          title={busy ? "Continuar aqui" : "Continuar editando"}
          onPress={() => setLeaving(false)}
        />
        {!busy && <TextButton title="Descartar alterações" onPress={discard} />}
      </FlowDialog>
    ),
  };
}
