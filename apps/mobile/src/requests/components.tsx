import { Pressable, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import {
  REQUEST_STATUSES,
  REQUEST_STATUS_LABELS,
  type RequestStatus,
  type ServiceRequestSummary,
} from "@omini/shared";
import { ui } from "../components/ui";
import { theme } from "../theme";
export const requestDate = (v: string) =>
  new Date(v).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
export function RequestStatusBadge({ status }: { status: RequestStatus }) {
  const icon =
    status === "COMPLETED" || status === "ACCEPTED"
      ? "checkmark-circle-outline"
      : status === "CANCELLED" || status === "REJECTED"
        ? "close-circle-outline"
        : status === "IN_PROGRESS"
          ? "construct-outline"
          : "time-outline";
  return (
    <View style={[ui.row, { alignItems: "flex-start" }]}>
      <Ionicons
        name={icon}
        color={theme.colors.ink}
        size={22}
        accessible={false}
      />
      <Text style={[ui.small, { flex: 1, color: theme.colors.ink }]}>
        {REQUEST_STATUS_LABELS[status]}
      </Text>
    </View>
  );
}
export function RequestCard({
  row,
  onPress,
}: {
  row: ServiceRequestSummary;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Ver solicitação de ${row.serviceTitleSnapshot}. ${REQUEST_STATUS_LABELS[row.status]}. ${row.viewer === "client" ? row.providerNameSnapshot : row.clientNameSnapshot}. ${requestDate(row.createdAt)}`}
      onPress={onPress}
      style={({ pressed }) => [
        ui.card,
        { minHeight: 80, opacity: pressed ? 0.7 : 1 },
      ]}
    >
      <RequestStatusBadge status={row.status} />
      <Text style={ui.section}>{row.serviceTitleSnapshot}</Text>
      <Text style={ui.text}>
        {row.viewer === "client"
          ? row.providerNameSnapshot
          : row.clientNameSnapshot}
      </Text>
      {row.viewer === "provider" && (
        <Text style={ui.text}>{row.description}</Text>
      )}
      <Text style={ui.small}>
        {row.city}/{row.state}
      </Text>
      <Text style={ui.small}>{requestDate(row.createdAt)}</Text>
    </Pressable>
  );
}
export function RequestStatusFilter({
  selected,
  onSelect,
}: {
  selected: RequestStatus | undefined;
  onSelect: (status: RequestStatus | undefined) => void;
}) {
  return (
    <View style={ui.grid} accessibilityRole="radiogroup">
      {[undefined, ...REQUEST_STATUSES].map((status) => (
        <Pressable
          key={status ?? "all"}
          accessibilityRole="radio"
          accessibilityLabel={
            status ? REQUEST_STATUS_LABELS[status] : "Todos os status"
          }
          accessibilityState={{ checked: status === selected }}
          onPress={() => onSelect(status)}
          style={({ pressed }) => ({
            minHeight: 48,
            minWidth: 120,
            flexGrow: 1,
            flexBasis: "46%",
            padding: theme.space.sm,
            backgroundColor:
              status === selected ? theme.colors.accent : theme.colors.surface,
            borderRadius: theme.radii.small,
            borderWidth: 1,
            borderColor: theme.colors.border,
            opacity: pressed ? 0.7 : 1,
          })}
        >
          <Text style={ui.text}>
            {status ? REQUEST_STATUS_LABELS[status] : "Todos os status"}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}
