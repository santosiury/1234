import { useCallback, useMemo, useRef, useState } from "react";
import { AppState, Linking, Text, View } from "react-native";
import { useFocusEffect } from "expo-router";
import {
  contactLinks,
  formatBrazilMobile,
  type RequestContact,
  type RequestStatus,
} from "@omini/shared";
import { useSession } from "../auth/session";
import { PrimaryButton, Feedback, ui } from "../components/ui";
import { ContactApi } from "./api";
export function RequestContactPanel({
  id,
  status,
}: {
  id: string;
  status: RequestStatus;
}) {
  const { manager, state } = useSession();
  const owner = state.user?.id;
  const api = useMemo(() => new ContactApi(manager), [manager, owner]);
  const [contact, setContact] = useState<RequestContact | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const focused = useRef(false),
    foreground = useRef(AppState.currentState === "active"),
    flight = useRef(false),
    controller = useRef<AbortController | null>(null);
  useFocusEffect(
    useCallback(() => {
      focused.current = true;
      const clear = () => {
        controller.current?.abort();
        setContact(null);
        setError("");
      };
      const subscription = AppState.addEventListener("change", (s) => {
        foreground.current = s === "active";
        if (s !== "active") clear();
      });
      return () => {
        focused.current = false;
        clear();
        subscription.remove();
      };
    }, [id, status, owner]),
  );
  const allowed = ["ACCEPTED", "IN_PROGRESS", "AWAITING_CONFIRMATION"].includes(
    status,
  );
  if (!allowed) return null;
  async function consult(action?: "whatsapp" | "telephone") {
    if (flight.current) return;
    flight.current = true;
    setBusy(true);
    setError("");
    setContact(null);
    const abort = new AbortController();
    controller.current = abort;
    try {
      // Re-authorize on each tap; never persist contact or reuse cached authorization.
      const current = await api.request(id, abort.signal);
      if (
        !focused.current ||
        !foreground.current ||
        manager.state.user?.id !== owner ||
        abort.signal.aborted
      )
        return;
      setContact(current);
      if (action) {
        const links = contactLinks(current.phone);
        if (!links || (action === "whatsapp" && !current.hasWhatsapp)) return;
        await Linking.openURL(links[action]);
      }
    } catch {
      if (focused.current && !abort.signal.aborted)
        setError(
          "Contato indisponível ou aplicativo não aberto. Atualize a solicitação. Se o contato estiver disponível, você também pode usar Ligar.",
        );
    } finally {
      flight.current = false;
      setBusy(false);
    }
  }
  return (
    <View style={ui.card}>
      <Text style={ui.section}>Contato do cliente</Text>
      <Text style={ui.text}>
        Converse para combinar os detalhes antes de iniciar o atendimento. O
        Omini não cobra comissão por serviço.
      </Text>
      {contact && (
        <Text selectable style={ui.section}>
          {formatBrazilMobile(contact.phone)}
        </Text>
      )}
      {!contact ? (
        <PrimaryButton
          secondary
          title="Consultar contato autorizado"
          loading={busy}
          onPress={() => void consult()}
        />
      ) : (
        <>
          {contact.hasWhatsapp && (
            <PrimaryButton
              title="Conversar no WhatsApp"
              loading={busy}
              onPress={() => void consult("whatsapp")}
            />
          )}
          <PrimaryButton
            secondary
            title="Ligar para o cliente"
            loading={busy}
            onPress={() => void consult("telephone")}
          />
          <Text style={ui.small}>
            O aplicativo externo será aberto. Nenhuma mensagem ou ligação é
            enviada automaticamente.
          </Text>
        </>
      )}
      {!!error && <Feedback message={error} />}
    </View>
  );
}
