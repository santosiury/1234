import {
  createContext,
  useContext,
  useEffect,
  useState,
  type PropsWithChildren,
} from "react";
import {
  AppState,
  AccessibilityInfo,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, usePathname } from "expo-router";
import { useSession } from "../../auth/session";
import { useMode } from "../../mode";
import { PrimaryButton, TextButton, ui } from "../../components/ui";
import { theme } from "../../theme";
import { RequestsApi } from "../api";
import {
  RequestMonitor,
  emptyMonitorState,
  type MonitorState,
  type RequestNotice,
} from "./monitor";
import { noticeStorage } from "./storage";
const empty = {
  state: emptyMonitorState(),
  monitor: null as RequestMonitor | null,
};
const Context = createContext(empty);
export function RequestUpdatesProvider({ children }: PropsWithChildren) {
  const { manager, state: session } = useSession();
  const [monitor] = useState(
    () =>
      new RequestMonitor(
        noticeStorage,
        (user) => new RequestsApi(manager, user.id),
      ),
  );
  const [state, setState] = useState(monitor.state);
  useEffect(() => monitor.subscribe(setState), [monitor]);
  useEffect(() => {
    monitor.setSession(
      session.status === "authenticated" ? session.user : null,
    );
  }, [
    monitor,
    session.status,
    session.user?.id,
    session.user?.profiles.client,
    session.user?.profiles.provider,
  ]);
  useEffect(() => {
    monitor.setActive(AppState.currentState === "active");
    const subscription = AppState.addEventListener("change", (value) =>
      monitor.setActive(value === "active"),
    );
    return () => {
      subscription.remove();
      monitor.dispose();
    };
  }, [monitor]);
  // Never expose the previous identity's data during the render before cleanup effects run.
  const visible =
    session.status === "authenticated" && state.owner === session.user?.id
      ? state
      : empty.state;
  return (
    <Context.Provider value={{ state: visible, monitor }}>
      {children}
    </Context.Provider>
  );
}
export const useRequestUpdates = () => useContext(Context);
export function noticeHiddenOnPath(path: string) {
  return (
    path.endsWith("/edit") ||
    path.startsWith("/service-request/") ||
    /\/provider-setup\/(?:service|area|profile)$/.test(path) ||
    path === "/login" ||
    path === "/register"
  );
}
export function RequestNoticeHost() {
  const { state, monitor } = useRequestUpdates();
  const { state: session } = useSession();
  const { mode, catalogSource } = useMode();
  const path = usePathname(),
    { height } = useWindowDimensions();
  const hidden = noticeHiddenOnPath(path);
  const [active, setActive] = useState(AppState.currentState === "active");
  useEffect(() => {
    const sub = AppState.addEventListener("change", (value) =>
      setActive(value === "active"),
    );
    return () => sub.remove();
  }, []);
  useEffect(() => {
    monitor?.setPresentationAllowed(!hidden);
  }, [monitor, hidden]);
  useEffect(() => {
    if (
      path === "/provider" ||
      path === "/provider/requests" ||
      path === "/client/requests"
    )
      void monitor?.refresh();
  }, [monitor, path]);
  const notice = state.notice;
  if (!notice || hidden || !active || !session.user) return null;
  function open() {
    if (!notice || !session.user?.profiles[notice.side]) return;
    monitor?.dismiss();
    if (mode === notice.side && catalogSource === "real") {
      if (notice.id)
        router.push(
          {
            pathname:
              notice.side === "provider"
                ? "/provider/requests/[id]"
                : "/client/requests/[id]",
            params: { id: notice.id },
          },
          { withAnchor: true },
        );
      else
        router.push(
          notice.side === "provider"
            ? "/provider/requests"
            : "/client/requests",
          { withAnchor: true },
        );
    } else
      router.push({
        pathname: "/service-request/resume",
        params: notice.id
          ? { requestId: notice.id, requestSide: notice.side }
          : { requestReturn: notice.side === "provider" ? "received" : "sent" },
      });
  }
  return (
    <NoticeBanner
      notice={notice}
      onOpen={open}
      onDismiss={() => monitor?.dismiss()}
      maxHeight={height * 0.48}
    />
  );
}
export function NoticeBanner({
  notice,
  onOpen,
  onDismiss,
  maxHeight,
}: {
  notice: RequestNotice;
  onOpen: () => void;
  onDismiss: () => void;
  maxHeight: number;
}) {
  const { fontScale } = useWindowDimensions();
  useEffect(() => {
    if (Platform.OS === "ios")
      AccessibilityInfo.announceForAccessibilityWithOptions?.(
        `${notice.title}. ${notice.message}`,
        { queue: true },
      );
  }, [notice.key, notice.version, notice.title, notice.message]);
  return (
    <SafeAreaView
      edges={["top", "left", "right"]}
      style={[styles.safe, { maxHeight }]}
    >
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.content}
      >
        <View style={styles.inner}>
          <View
            accessibilityLiveRegion="polite"
            accessible
            accessibilityLabel={`${notice.title}. ${notice.message}`}
          >
            <Text style={ui.section}>{notice.title}</Text>
            <Text style={ui.small}>{notice.message}</Text>
          </View>
          <View style={styles.actions}>
            <View
              style={[styles.action, fontScale >= 1.6 && { flexBasis: "100%" }]}
            >
              <PrimaryButton
                title={notice.id ? "Ver solicitação" : "Ver solicitações"}
                onPress={onOpen}
              />
            </View>
            <View
              style={[styles.action, fontScale >= 1.6 && { flexBasis: "100%" }]}
            >
              <TextButton title="Dispensar aviso" onPress={onDismiss} />
            </View>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
export function RequestCount({ count }: { count: number | null }) {
  if (count === null || count <= 0) return null;
  return (
    <View style={styles.badge} accessible={false}>
      <Text style={styles.count} accessible={false}>
        {count > 99 ? "99+" : String(count)}
      </Text>
    </View>
  );
}
export function updateMessage(
  state: MonitorState,
  side: "client" | "provider",
) {
  const count = side === "client" ? state.clientPending : state.providerPending;
  if (!count) return "";
  return side === "client"
    ? `${count} ${count === 1 ? "solicitação aguarda" : "solicitações aguardam"} sua confirmação.`
    : `${count} ${count === 1 ? "solicitação aguarda" : "solicitações aguardam"} sua resposta.`;
}
const styles = StyleSheet.create({
  safe: {
    backgroundColor: theme.colors.pale,
    borderBottomWidth: 1,
    borderColor: theme.colors.border,
  },
  content: { padding: theme.space.sm },
  inner: {
    width: "100%",
    maxWidth: 620,
    alignSelf: "center",
    gap: theme.space.xs,
  },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: theme.space.xs },
  action: { flexGrow: 1, flexBasis: 150, minWidth: 0 },
  badge: {
    backgroundColor: theme.colors.accent,
    borderRadius: theme.radii.pill,
    minWidth: 22,
    minHeight: 22,
    paddingHorizontal: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  count: {
    fontFamily: theme.fonts.semibold,
    fontSize: 12,
    lineHeight: 18,
    color: theme.colors.ink,
    textAlign: "center",
  },
});
