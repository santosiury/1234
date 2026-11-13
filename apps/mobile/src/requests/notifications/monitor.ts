import type {
  AuthUser,
  RequestPage,
  RequestParticipant,
  RequestQuery,
  RequestStatus,
  ServiceRequestSummary,
} from "@omini/shared";
import {
  NOTICE_LIMIT,
  type NoticeEntry,
  type NoticeLedger,
  type NoticeStorage,
} from "./storage";
export const POLL_MS = 25_000;
const CLIENT_STATES: RequestStatus[] = [
  "AWAITING_CONFIRMATION",
  "REQUESTED",
  "ACCEPTED",
  "REJECTED",
  "IN_PROGRESS",
  "CANCELLED",
];
export interface RequestNotice {
  key: string;
  kind?: "pending";
  priority?: number;
  side: RequestParticipant;
  id?: string;
  version?: number;
  title: string;
  message: string;
}
export interface MonitorState {
  owner: string | null;
  providerPending: number | null;
  clientPending: number | null;
  notice: RequestNotice | null;
  syncing: boolean;
  error: string;
  revision: number;
}
export const emptyMonitorState = (): MonitorState => ({
  owner: null,
  providerPending: null,
  clientPending: null,
  notice: null,
  syncing: false,
  error: "",
  revision: 0,
});
export interface MonitorApi {
  list(
    side: RequestParticipant,
    query: RequestQuery,
    signal?: AbortSignal,
  ): Promise<RequestPage>;
}
type ObservedRequest = Pick<
  ServiceRequestSummary,
  "id" | "viewer" | "version" | "status" | "createdAt"
>;
const keyOf = (e: Pick<NoticeEntry, "id" | "side">) =>
  `${e.side}:${e.id.toLowerCase()}`;
export class RequestMonitor {
  state = emptyMonitorState();
  private user: AuthUser | null = null;
  private api: MonitorApi | null = null;
  private active = false;
  private allowed = true;
  private generation = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private flight: {
    controller: AbortController;
    generation: number;
    promise: Promise<void>;
  } | null = null;
  private loading: Promise<void> | null = null;
  private ledger: NoticeLedger | null = null;
  private queue: RequestNotice[] = [];
  private presenting = false;
  private again = false;
  private listeners = new Set<(state: MonitorState) => void>();
  private earlyViews = new Map<string, ObservedRequest>();
  constructor(
    private readonly storage: NoticeStorage,
    private readonly apiFor: (user: AuthUser) => MonitorApi,
  ) {}
  subscribe = (fn: (state: MonitorState) => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };
  private emit(patch: Partial<MonitorState>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((fn) => fn(this.state));
  }
  private stop() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.flight?.controller.abort();
    this.flight = null;
    this.again = false;
  }
  setSession(user: AuthUser | null) {
    const signature = (u: AuthUser | null) =>
      u ? `${u.id}:${u.profiles.client}:${u.profiles.provider}` : "";
    if (signature(user) === signature(this.user)) return;
    this.stop();
    this.generation++;
    this.user = user ? { ...user, profiles: { ...user.profiles } } : null;
    this.api = user ? this.apiFor(user) : null;
    this.ledger = null;
    this.loading = null;
    this.queue = [];
    this.presenting = false;
    this.earlyViews.clear();
    this.emit({ ...emptyMonitorState(), owner: user?.id ?? null });
    if (user && this.active) void this.refresh();
  }
  setActive(active: boolean) {
    if (this.active === active) return;
    this.active = active;
    if (!active) {
      this.stop();
      this.generation++;
      this.loading = null;
      this.presenting = false;
      // Already-presented banners are not replayed on every foreground transition.
      this.emit({ syncing: false, notice: null });
    } else void this.refresh();
  }
  setPresentationAllowed(allowed: boolean) {
    this.allowed = allowed;
    if (allowed) void this.presentNext();
  }
  private current(generation: number) {
    return this.generation === generation && this.active && !!this.user;
  }
  private schedule() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    if (
      this.active &&
      this.user &&
      (this.user.profiles.client || this.user.profiles.provider)
    )
      this.timer = setTimeout(() => {
        this.timer = null;
        void this.refresh();
      }, POLL_MS);
  }
  private async load(generation: number) {
    if (this.ledger || !this.user) return;
    if (!this.loading) {
      const owner = this.user.id;
      const task = this.storage.read(owner).then((value) => {
        if (this.current(generation)) {
          this.ledger = value;
          for (const row of this.earlyViews.values()) this.applyViewed(row);
          this.earlyViews.clear();
        }
      });
      this.loading = task;
      void task
        .finally(() => {
          if (this.loading === task) this.loading = null;
        })
        .catch(() => undefined);
    }
    await this.loading;
  }
  refresh = (afterMutation = false): Promise<void> => {
    if (
      !this.active ||
      !this.user ||
      !this.api ||
      (!this.user.profiles.client && !this.user.profiles.provider)
    )
      return Promise.resolve();
    if (this.flight) {
      if (afterMutation) this.again = true;
      return this.flight.promise;
    }
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    const generation = this.generation,
      controller = new AbortController();
    const ticket = { controller, generation, promise: Promise.resolve() };
    this.flight = ticket;
    ticket.promise = this.run(generation, controller.signal).finally(() => {
      if (this.flight !== ticket) return;
      this.flight = null;
      if (this.current(generation)) {
        if (this.again) {
          this.again = false;
          void this.refresh();
        } else this.schedule();
      }
    });
    return ticket.promise;
  };
  private async run(generation: number, signal: AbortSignal) {
    const user = this.user!,
      api = this.api!;
    this.emit({ syncing: true });
    let error = "",
      canPresent = true;
    // Independent role snapshots: a failed client request must not suppress a provider update.
    for (const side of ["provider", "client"] as const) {
      if (!user.profiles[side] || !this.current(generation) || signal.aborted)
        continue;
      try {
        const states =
          side === "provider" ? ["REQUESTED" as const] : CLIENT_STATES;
        const rows: ServiceRequestSummary[] = [],
          totals: Partial<Record<RequestStatus, number>> = {};
        for (const status of states) {
          if (!this.current(generation) || signal.aborted) return;
          const page = await api.list(
            side,
            { status, page: 1, pageSize: 20 },
            signal,
          );
          // Reject a wrong-role result rather than leaking it into this account/profile's UI.
          if (
            page.items.some(
              (row) => row.viewer !== side || row.status !== status,
            )
          )
            throw Error("Unexpected request projection");
          rows.push(...page.items);
          totals[status] = page.total;
        }
        if (!this.current(generation) || signal.aborted) return;
        this.emit(
          side === "provider"
            ? { providerPending: totals.REQUESTED! }
            : { clientPending: totals.AWAITING_CONFIRMATION! },
        );
        try {
          await this.load(generation);
          if (!this.current(generation) || !this.ledger) return;
          await this.reconcile(side, rows, totals, generation);
        } catch {
          canPresent = false;
          error =
            "Não foi possível salvar ou recuperar o controle de avisos. Os contadores consultados foram mantidos.";
        }
      } catch {
        if (this.current(generation) && !signal.aborted)
          error =
            "Não foi possível atualizar todos os avisos. O último estado conhecido foi mantido.";
      }
    }
    if (this.current(generation)) {
      this.emit({ syncing: false, error, revision: this.state.revision + 1 });
      if (canPresent) void this.presentNext();
    }
  }
  private entry(row: ObservedRequest): NoticeEntry {
    const list = this.ledger!.entries,
      key = keyOf({ id: row.id, side: row.viewer });
    const index = list.findIndex((e) => keyOf(e) === key);
    const previous = index >= 0 ? list.splice(index, 1)[0] : undefined;
    const entry = previous ?? {
      id: row.id,
      side: row.viewer,
      version: row.version,
      status: row.status,
      handled: 0,
      viewed: 0,
    };
    if (row.version >= entry.version) {
      entry.version = row.version;
      entry.status = row.status;
    }
    list.push(entry);
    if (list.length > NOTICE_LIMIT) list.splice(0, list.length - NOTICE_LIMIT);
    return entry;
  }
  private enqueue(notice: RequestNotice) {
    this.queue = this.queue.filter((n) => n.key !== notice.key);
    if (
      this.state.notice?.key === notice.key &&
      this.state.notice.version === notice.version
    )
      return;
    this.queue.push(notice);
    // At most one visible + three pending; action counters still cover every request.
    this.queue.sort((a, b) => (b.priority ?? 1) - (a.priority ?? 1));
    this.queue = this.queue.slice(0, 3);
  }
  private async save(generation: number) {
    if (this.current(generation) && this.ledger && this.user)
      await this.storage.write(this.user.id, this.ledger);
  }
  private async reconcile(
    side: RequestParticipant,
    rows: ServiceRequestSummary[],
    totals: Partial<Record<RequestStatus, number>>,
    generation: number,
  ) {
    const baseline = this.ledger![side],
      initial = !baseline.initialized,
      cutoff = baseline.newest;
    let individual = false;
    const beforeTotals = { ...baseline.totals };
    for (const row of rows) {
      const previous = this.ledger!.entries.find(
        (e) => keyOf(e) === keyOf({ id: row.id, side }),
      );
      const previousStatus = previous?.status;
      const known = !!previous,
        entry = this.entry(row);
      if (initial || (!known && row.createdAt <= cutoff))
        entry.handled = Math.max(entry.handled, row.version);
      if (row.createdAt > baseline.newest) baseline.newest = row.createdAt;
      if (entry.handled >= row.version || entry.viewed >= row.version) continue;
      if (side === "provider" && row.status === "REQUESTED") {
        individual = true;
        this.enqueue({
          key: keyOf(entry),
          side,
          id: row.id,
          version: row.version,
          priority: 2,
          title: "Nova solicitação recebida!",
          message: "Você recebeu um novo pedido de serviço.",
        });
      } else if (side === "client" && row.status !== "REQUESTED") {
        individual = true;
        const titles: Partial<Record<RequestStatus, string>> = {
          ACCEPTED: "Solicitação aceita",
          REJECTED: "Solicitação recusada",
          IN_PROGRESS:
            previousStatus === "AWAITING_CONFIRMATION"
              ? "Solicitação reaberta"
              : "Atendimento em andamento",
          AWAITING_CONFIRMATION: "Confirme a conclusão do serviço",
          CANCELLED: "Solicitação cancelada",
        };
        this.enqueue({
          key: keyOf(entry),
          side,
          id: row.id,
          version: row.version,
          priority: row.status === "AWAITING_CONFIRMATION" ? 3 : 1,
          title: titles[row.status] ?? "Solicitação atualizada",
          message:
            row.status === "AWAITING_CONFIRMATION"
              ? "O prestador informou a conclusão. Confira se tudo foi finalizado."
              : "Confira o status e o histórico da sua solicitação.",
        });
      }
    }
    baseline.initialized = true;
    baseline.totals = { ...totals };
    // Pending notices must also be revalidated while forms defer their presentation.
    this.queue = this.queue.filter(
      (n) =>
        n.side !== side ||
        !n.id ||
        rows.some((r) => r.id === n.id && r.version === n.version),
    );
    const pendingCount =
      side === "provider" ? totals.REQUESTED! : totals.AWAITING_CONFIRMATION!;
    const pendingMessage =
      side === "provider"
        ? `Você tem ${pendingCount} ${pendingCount === 1 ? "solicitação aguardando" : "solicitações aguardando"} resposta.`
        : `${pendingCount} ${pendingCount === 1 ? "solicitação aguarda" : "solicitações aguardam"} sua confirmação.`;
    this.queue = this.queue.flatMap((n) =>
      n.side === side && n.kind === "pending"
        ? pendingCount > 0
          ? [{ ...n, message: pendingMessage }]
          : []
        : [n],
    );
    if (
      this.state.notice?.side === side &&
      this.state.notice.kind === "pending"
    )
      this.emit({
        notice:
          pendingCount > 0
            ? { ...this.state.notice, message: pendingMessage }
            : null,
      });
    // Keep a visible notice accurate if its request left the monitored state while displayed.
    const visible = this.state.notice;
    if (visible?.side === side && visible.id) {
      const row = rows.find((r) => r.id === visible.id);
      if (
        row &&
        (row.version !== visible.version ||
          (side === "provider" && row.status !== "REQUESTED"))
      )
        this.emit({ notice: null });
      else if (!row) this.emit({ notice: null });
    }
    if (
      initial &&
      (side === "provider" ? totals.REQUESTED : totals.AWAITING_CONFIRMATION)! >
        0
    ) {
      const count =
        side === "provider" ? totals.REQUESTED! : totals.AWAITING_CONFIRMATION!;
      this.enqueue({
        key: `summary:${side}`,
        kind: "pending",
        priority: side === "client" ? 3 : 2,
        side,
        title:
          side === "provider"
            ? "Solicitações aguardando resposta"
            : "Confirmações pendentes",
        message:
          side === "provider"
            ? `Você tem ${count} ${count === 1 ? "solicitação aguardando" : "solicitações aguardando"} resposta.`
            : `${count} ${count === 1 ? "solicitação aguarda" : "solicitações aguardam"} sua confirmação.`,
      });
    } else if (
      !initial &&
      side === "client" &&
      !individual &&
      Object.entries(totals).some(
        ([status, total]) =>
          status !== "REQUESTED" &&
          beforeTotals[status as RequestStatus] !== total,
      )
    ) {
      this.enqueue({
        key: "summary:client",
        side,
        title: "Suas solicitações foram atualizadas",
        message:
          "Confira o status dos seus pedidos e as confirmações pendentes.",
      });
    }
    await this.save(generation);
  }
  private async presentNext() {
    if (
      !this.allowed ||
      !this.active ||
      !this.ledger ||
      this.state.notice ||
      this.presenting ||
      this.state.syncing
    )
      return;
    this.presenting = true;
    const generation = this.generation,
      owner = this.user?.id;
    try {
      while (
        this.queue.length &&
        this.current(generation) &&
        this.allowed &&
        !this.state.notice
      ) {
        const notice = this.queue.shift()!;
        const entry = notice.id
          ? this.ledger.entries.find((e) => keyOf(e) === notice.key)
          : undefined;
        if (
          notice.id &&
          (!entry ||
            entry.version !== notice.version ||
            entry.handled >= notice.version! ||
            entry.viewed >= notice.version!)
        )
          continue;
        const old = entry?.handled;
        if (entry) entry.handled = notice.version!;
        try {
          await this.save(generation);
        } catch {
          if (!this.current(generation)) break;
          if (entry) entry.handled = old!;
          this.queue.unshift(notice);
          this.emit({
            error:
              "Não foi possível salvar o controle de avisos. Tente novamente.",
          });
          break;
        }
        if (!this.current(generation)) {
          if (
            this.user?.id === owner &&
            (!entry || this.ledger?.entries.includes(entry))
          ) {
            if (entry) entry.handled = old!;
            this.queue.unshift(notice);
            if (this.ledger && owner)
              void this.storage
                .write(owner, this.ledger)
                .catch(() => undefined);
          }
          break;
        }
        if (!this.allowed) {
          if (entry) entry.handled = old!;
          this.queue.unshift(notice);
          await this.save(generation).catch(() => {
            if (this.current(generation))
              this.emit({
                error:
                  "Não foi possível salvar o controle de avisos. Tente novamente.",
              });
          });
          break;
        }
        if (entry && entry.viewed >= notice.version!) continue;
        this.emit({ notice });
      }
    } finally {
      if (this.generation === generation) this.presenting = false;
    }
  }
  dismiss = () => {
    this.emit({ notice: null });
    void this.presentNext();
  };
  private applyViewed(row: ObservedRequest) {
    const previous = this.ledger!.entries.find(
      (e) => keyOf(e) === keyOf({ id: row.id, side: row.viewer }),
    );
    const prior = previous
      ? { status: previous.status, version: previous.version }
      : null;
    const entry = this.entry(row);
    entry.viewed = Math.max(entry.viewed, row.version);
    entry.handled = Math.max(entry.handled, row.version);
    // Detection baselines only; badge totals change only after a successful filtered API query.
    if (prior && row.version > prior.version && row.status !== prior.status) {
      const totals = this.ledger![row.viewer].totals;
      if (totals[prior.status] !== undefined)
        totals[prior.status] = Math.max(0, totals[prior.status]! - 1);
      if (totals[row.status] !== undefined)
        totals[row.status] = totals[row.status]! + 1;
    }
  }
  viewed = (row: ServiceRequestSummary, owner: string) => {
    if (
      this.user?.id !== owner ||
      !this.user?.profiles[row.viewer] ||
      !this.active
    )
      return;
    if (!this.ledger) {
      this.earlyViews.set(keyOf({ id: row.id, side: row.viewer }), {
        id: row.id,
        viewer: row.viewer,
        version: row.version,
        status: row.status,
        createdAt: row.createdAt,
      });
      if (this.earlyViews.size > NOTICE_LIMIT)
        this.earlyViews.delete(this.earlyViews.keys().next().value!);
    } else {
      this.applyViewed(row);
      const generation = this.generation;
      void this.save(generation).catch(() => {
        if (this.current(generation))
          this.emit({
            error:
              "Não foi possível salvar o controle de avisos. Tente novamente.",
          });
      });
    }
    this.queue = this.queue.filter(
      (n) =>
        n.id !== row.id || n.side !== row.viewer || n.version! > row.version,
    );
    if (
      this.state.notice?.id === row.id &&
      this.state.notice.side === row.viewer &&
      this.state.notice.version! <= row.version
    )
      this.dismiss();
  };
  dispose() {
    this.setSession(null);
    this.stop();
    this.active = false;
  }
}
