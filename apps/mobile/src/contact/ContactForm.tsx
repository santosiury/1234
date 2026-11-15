import { useCallback, useMemo, useState } from "react";
import { Switch, Text, View } from "react-native";
import {
  formatBrazilMobile,
  maskBrazilMobile,
  normalizeBrazilMobile,
  type ContactInput,
} from "@omini/shared";
import { OminiInput, PrimaryButton, Feedback, ui } from "../components/ui";
import { useSession } from "../auth/session";
import { useRemote } from "../marketplace/hooks";
import { RemoteStatus } from "../marketplace/components";
import { theme } from "../theme";
import { ContactApi } from "./api";
export const emptyContact: ContactInput = {
  phone: "",
  hasWhatsapp: false,
  shareContact: false,
};
export function ContactFields({
  value,
  onChange,
  disabled = false,
}: {
  value: ContactInput;
  onChange: (v: ContactInput) => void;
  disabled?: boolean;
}) {
  return (
    <View style={ui.group}>
      <OminiInput
        label="Celular com DDD"
        placeholder="(48) 99999-9999"
        keyboardType="phone-pad"
        autoComplete="tel"
        textContentType="telephoneNumber"
        value={value.phone}
        onChangeText={(phone) =>
          onChange({ ...value, phone: maskBrazilMobile(phone) })
        }
        editable={!disabled}
        maxLength={16}
      />
      <View style={ui.row}>
        <Text style={[ui.text, { flex: 1 }]}>Este número tem WhatsApp</Text>
        <Switch
          accessibilityLabel="Este número tem WhatsApp"
          value={value.hasWhatsapp}
          onValueChange={(hasWhatsapp) => onChange({ ...value, hasWhatsapp })}
          disabled={disabled}
          trackColor={theme.switch}
        />
      </View>
      <View style={ui.row}>
        <Text style={[ui.text, { flex: 1 }]}>
          Autorizo compartilhar meu celular somente com o profissional que
          aceitar minha solicitação, durante o atendimento.
        </Text>
        <Switch
          accessibilityLabel="Autorizar compartilhamento após o aceite"
          value={value.shareContact}
          onValueChange={(shareContact) => onChange({ ...value, shareContact })}
          disabled={disabled}
          trackColor={theme.switch}
        />
      </View>
      <Text style={ui.small}>
        Seu contato não aparece no catálogo. A autorização também se aplica aos
        seus atendimentos já aceitos e ainda abertos. Você pode alterá-la em
        Minha conta.
      </Text>
    </View>
  );
}
export function ContactEditor({ onSaved }: { onSaved?: () => void }) {
  const { manager, state } = useSession();
  const owner = state.user?.id;
  const api = useMemo(() => new ContactApi(manager), [manager, owner]);
  const result = useRemote(useCallback(() => api.own(), [api]));
  const [editing, setEditing] = useState(false),
    [value, setValue] = useState<ContactInput>(emptyContact),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  async function save() {
    const phone = normalizeBrazilMobile(value.phone);
    if (!phone) {
      setMessage("Informe um celular brasileiro válido com DDD.");
      return;
    }
    if (busy) return;
    setBusy(true);
    setMessage("");
    try {
      await api.update({ ...value, phone });
      await manager.sync();
      if (manager.state.user?.id !== owner) return;
      setEditing(false);
      result.reload();
      onSaved?.();
    } catch {
      setMessage(
        "Não foi possível salvar o contato. Confira a conexão e tente novamente.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <View style={ui.card}>
      <Text style={ui.section}>Seu contato de atendimento</Text>
      <RemoteStatus {...result} />
      {!editing && result.data && (
        <>
          <Text style={ui.text}>
            {result.data.phone
              ? formatBrazilMobile(result.data.phone)
              : "Celular ainda não cadastrado."}
          </Text>
          <Text style={ui.small}>
            {result.data.contactReady
              ? "Compartilhamento autorizado após o aceite."
              : "Atualize o contato e autorize o compartilhamento para enviar novas solicitações."}
          </Text>
          <PrimaryButton
            secondary
            title="Atualizar celular e autorização"
            onPress={() => {
              const d = result.data!;
              setValue({
                phone: d.phone ? formatBrazilMobile(d.phone) : "",
                hasWhatsapp: d.hasWhatsapp,
                shareContact: d.shareContact,
              });
              setEditing(true);
            }}
          />
        </>
      )}
      {editing && (
        <>
          <ContactFields value={value} onChange={setValue} disabled={busy} />
          <PrimaryButton
            title="Salvar contato"
            loading={busy}
            onPress={() => void save()}
          />
          <PrimaryButton
            secondary
            title="Cancelar edição do contato"
            disabled={busy}
            onPress={() => {
              setEditing(false);
              setMessage("");
            }}
          />
        </>
      )}
      {!!message && <Feedback message={message} />}
    </View>
  );
}
