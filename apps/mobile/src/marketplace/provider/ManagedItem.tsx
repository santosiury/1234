import { useRef, useState, type ComponentRef } from "react";
import { Pressable, Text, View } from "react-native";
import {
  Badge,
  Feedback,
  PrimaryButton,
  TextButton,
  ui,
} from "../../components/ui";
import { theme } from "../../theme";
import { FlowDialog } from "./FlowUI";
export function ManagedItem({
  kind,
  name,
  description,
  active,
  onEdit,
  onToggle,
  onChanged,
}: {
  kind: "service" | "area";
  name: string;
  description: string;
  active: boolean;
  onEdit: () => void;
  onToggle: () => Promise<unknown>;
  onChanged: (message: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [moving, setMoving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const inFlight = useRef(false);
  const trigger = useRef<ComponentRef<typeof View>>(null);
  const noun = kind === "service" ? "serviço" : "área";
  const toggleTitle = `${active ? "Desativar" : "Reativar"} ${noun}`;
  const close = () => {
    if (!inFlight.current) setOpen(false);
  };
  async function toggle() {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError("");
    try {
      await onToggle();
      setOpen(false);
      onChanged(
        kind === "service"
          ? active
            ? "Serviço desativado."
            : "Serviço reativado."
          : active
            ? "Área desativada."
            : "Área reativada.",
      );
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Não foi possível alterar. Tente novamente.",
      );
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  const explanation = active
    ? kind === "service"
      ? "Este serviço deixará de aparecer para clientes, mas continuará salvo. Você pode reativá-lo depois."
      : "Esta área deixará de ser usada na busca, mas continuará salva. Você pode reativá-la depois."
    : kind === "service"
      ? "O serviço voltará a aparecer quando seu perfil, a categoria e uma área de atendimento também estiverem ativos."
      : "Esta área voltará a ser usada na busca quando seu perfil tiver um serviço ativo em categoria disponível.";
  return (
    <View style={[ui.card, { padding: theme.space.md, gap: theme.space.xs }]}>
      <Badge>{active ? "Ativo" : "Inativo"}</Badge>
      <Text style={ui.section}>{name}</Text>
      <Text style={ui.small}>{description}</Text>
      <Pressable
        ref={trigger}
        accessibilityRole="button"
        accessibilityLabel={`Gerenciar ${noun} ${name}. ${description}`}
        onPress={() => {
          setOpen(true);
          setMoving(false);
          setConfirming(false);
          setError("");
        }}
        style={({ pressed }) => ({
          minWidth: 44,
          minHeight: 48,
          alignItems: "flex-start",
          justifyContent: "center",
          opacity: pressed ? 0.6 : 1,
        })}
      >
        <Text
          style={{
            fontFamily: theme.fonts.semibold,
            fontSize: theme.type.body,
            lineHeight: 24,
            color: theme.colors.ink,
          }}
        >
          Gerenciar →
        </Text>
      </Pressable>
      <FlowDialog
        visible={open}
        title={confirming ? `${toggleTitle}?` : `Gerenciar ${noun}`}
        onClose={close}
        returnFocus={moving ? undefined : trigger}
      >
        <Text style={ui.section}>{name}</Text>
        <Text style={ui.small}>{description}</Text>
        {!!error && <Feedback message={error} />}
        {confirming ? (
          <>
            <Text style={ui.text}>{explanation}</Text>
            <PrimaryButton
              title={active ? "Confirmar desativação" : "Confirmar reativação"}
              loading={busy}
              onPress={() => void toggle()}
            />
          </>
        ) : (
          <>
            <PrimaryButton
              title={`Editar ${noun}`}
              onPress={() => {
                setMoving(true);
                setOpen(false);
                onEdit();
              }}
            />
            <PrimaryButton
              secondary
              title={toggleTitle}
              onPress={() => setConfirming(true)}
            />
          </>
        )}
        <TextButton title="Cancelar" disabled={busy} onPress={close} />
      </FlowDialog>
    </View>
  );
}
