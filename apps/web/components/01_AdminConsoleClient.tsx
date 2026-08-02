"use client";

import {
  Activity,
  CheckCircle2,
  Clipboard,
  Clock3,
  Copy,
  Database,
  KeyRound,
  RefreshCw,
  Search,
  ShieldCheck,
  TicketCheck,
  UserRound,
  Users,
  XCircle,
} from "lucide-react";
import {
  type FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import { useAccount } from "@/components/providers/AccountProvider";
import {
  createAdminInvite,
  getAdminInvites,
  getAdminOverview,
  getAdminReports,
  getAdminUsers,
  revokeAdminInvite,
  updateAdminReport,
  type AdminInvite,
  type AdminInviteCreated,
  type AdminOverview,
  type AdminReport,
  type AdminReportStatus,
  type AdminUser,
} from "@/lib/admin";

import styles from "./AdminConsole.module.css";

type Tab = "overview" | "users" | "invites" | "reports";

const formatter = new Intl.DateTimeFormat("fr-CA", {
  dateStyle: "medium",
  timeStyle: "short",
});

function formatDate(value: string | null): string {
  if (!value) return "Jamais";
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? formatter.format(date) : "—";
}

function formatUptime(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return hours ? `${hours} h ${minutes} min` : `${minutes} min`;
}

export function AdminConsoleClient() {
  const account = useAccount();
  const [tab, setTab] = useState<Tab>("overview");
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [userTotal, setUserTotal] = useState(0);
  const [invites, setInvites] = useState<AdminInvite[]>([]);
  const [reports, setReports] = useState<AdminReport[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inviteLabel, setInviteLabel] = useState("Bêta privée");
  const [inviteUses, setInviteUses] = useState(1);
  const [inviteDays, setInviteDays] = useState(14);
  const [createdInvite, setCreatedInvite] = useState<AdminInviteCreated | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async (search = "") => {
    setLoading(true);
    setError(null);
    try {
      const [nextOverview, nextUsers, nextInvites, nextReports] = await Promise.all([
        getAdminOverview(),
        getAdminUsers(search),
        getAdminInvites(),
        getAdminReports(),
      ]);
      setOverview(nextOverview);
      setUsers(nextUsers.users);
      setUserTotal(nextUsers.total);
      setInvites(nextInvites);
      setReports(nextReports);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Console indisponible.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (account.hydrated && account.user?.is_admin) void load("");
  }, [account.hydrated, account.user?.is_admin, load]);

  const openReports = useMemo(
    () => reports.filter((report) => report.status !== "resolved").length,
    [reports],
  );

  async function submitInvite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    try {
      const created = await createAdminInvite({
        label: inviteLabel.trim(),
        max_uses: inviteUses,
        expires_in_days: inviteDays,
      });
      setCreatedInvite(created);
      setCopied(false);
      setInvites((current) => [created, ...current]);
      setInviteLabel("Bêta privée");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Invitation impossible.");
    }
  }

  async function copyCode() {
    if (!createdInvite) return;
    await navigator.clipboard.writeText(createdInvite.code);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  async function revoke(inviteId: string) {
    await revokeAdminInvite(inviteId);
    setInvites((current) =>
      current.map((invite) =>
        invite.id === inviteId ? { ...invite, disabled: true, active: false } : invite,
      ),
    );
  }

  async function changeReportStatus(reportId: string, status: AdminReportStatus) {
    await updateAdminReport(reportId, status);
    setReports((current) =>
      current.map((report) =>
        report.report_id === reportId ? { ...report, status } : report,
      ),
    );
  }

  if (!account.hydrated) {
    return <div className={styles.centerState}>Vérification de la session…</div>;
  }

  if (!account.user) {
    return (
      <div className={styles.centerState}>
        <ShieldCheck size={38} />
        <h1>Connexion requise</h1>
        <p>Connecte-toi avec le compte administrateur de la bêta Anatole.</p>
      </div>
    );
  }

  if (!account.user.is_admin) {
    return (
      <div className={styles.centerState}>
        <XCircle size={38} />
        <h1>Accès réservé</h1>
        <p>Ce compte ne possède pas les droits d’administration Anatole.</p>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <header className={styles.hero}>
        <div>
          <span className={styles.eyebrow}>ANATOLE ADMIN · v1.1</span>
          <h1>Console de bêta</h1>
          <p>Pilote les testeurs, les invitations, les signalements et la santé de la plateforme.</p>
        </div>
        <button type="button" className={styles.refresh} onClick={() => void load(query)} disabled={loading}>
          <RefreshCw size={18} className={loading ? styles.spinning : ""} />
          {loading ? "Actualisation…" : "Actualiser"}
        </button>
      </header>

      <nav className={styles.tabs} aria-label="Console de bêta">
        <button className={tab === "overview" ? styles.activeTab : ""} onClick={() => setTab("overview")}>
          <Activity size={18} /> Vue d’ensemble
        </button>
        <button className={tab === "users" ? styles.activeTab : ""} onClick={() => setTab("users")}>
          <Users size={18} /> Testeurs <span>{userTotal}</span>
        </button>
        <button className={tab === "invites" ? styles.activeTab : ""} onClick={() => setTab("invites")}>
          <KeyRound size={18} /> Invitations <span>{invites.filter((item) => item.active).length}</span>
        </button>
        <button className={tab === "reports" ? styles.activeTab : ""} onClick={() => setTab("reports")}>
          <Clipboard size={18} /> Signalements <span>{openReports}</span>
        </button>
      </nav>

      {error ? <div className={styles.error}>{error}</div> : null}

      {tab === "overview" && overview ? (
        <>
          <section className={styles.metricGrid}>
            <article><Users /><span>Comptes</span><strong>{overview.total_users}</strong><small>+{overview.new_users_7d} cette semaine</small></article>
            <article><Activity /><span>Actifs 7 jours</span><strong>{overview.active_users_7d}</strong><small>{overview.active_sessions} sessions ouvertes</small></article>
            <article><Database /><span>Synchronisés</span><strong>{overview.synced_accounts}</strong><small>{overview.total_workspace_revisions} révisions</small></article>
            <article><TicketCheck /><span>Invitations</span><strong>{overview.active_invites}</strong><small>{overview.open_reports} signalements ouverts</small></article>
          </section>

          <section className={styles.twoColumns}>
            <article className={styles.panel}>
              <div className={styles.panelHeader}>
                <div><span className={styles.eyebrow}>PLATEFORME</span><h2>Santé opérationnelle</h2></div>
                <span className={`${styles.health} ${styles[overview.reliability.status]}`}>
                  {overview.reliability.status === "healthy" ? "Saine" : overview.reliability.status === "degraded" ? "Dégradée" : "Critique"}
                </span>
              </div>
              <dl className={styles.definitionGrid}>
                <div><dt>Disponibilité du processus</dt><dd>{formatUptime(overview.reliability.uptime_seconds)}</dd></div>
                <div><dt>Latence p95</dt><dd>{overview.reliability.p95_duration_ms.toFixed(0)} ms</dd></div>
                <div><dt>Erreurs 5xx</dt><dd>{overview.reliability.total_5xx}</dd></div>
                <div><dt>Requêtes lentes</dt><dd>{overview.reliability.slow_requests}</dd></div>
              </dl>
            </article>

            <article className={styles.panel}>
              <div className={styles.panelHeader}>
                <div><span className={styles.eyebrow}>FOURNISSEURS</span><h2>Flux externes</h2></div>
                <CheckCircle2 size={24} />
              </div>
              <dl className={styles.definitionGrid}>
                <div><dt>Requêtes</dt><dd>{String(overview.upstream_metrics.requests ?? 0)}</dd></div>
                <div><dt>Échecs</dt><dd>{String(overview.upstream_metrics.failures ?? 0)}</dd></div>
                <div><dt>Retries</dt><dd>{String(overview.upstream_metrics.retries ?? 0)}</dd></div>
                <div><dt>Concurrence max.</dt><dd>{String(overview.upstream_metrics.peak_active ?? 0)}</dd></div>
              </dl>
            </article>
          </section>
        </>
      ) : null}

      {tab === "users" ? (
        <section className={styles.panel}>
          <div className={styles.panelHeader}>
            <div><span className={styles.eyebrow}>BÊTA-TESTEURS</span><h2>Comptes inscrits</h2></div>
            <form className={styles.search} onSubmit={(event) => { event.preventDefault(); void load(query); }}>
              <Search size={17} />
              <input value={query} placeholder="Nom ou courriel" onChange={(event) => setQuery(event.target.value)} />
              <button type="submit">Rechercher</button>
            </form>
          </div>
          <div className={styles.userList}>
            {users.map((user) => (
              <article className={styles.userCard} key={user.id}>
                <span className={styles.avatar}>{(user.display_name || user.email).slice(0, 1).toUpperCase()}</span>
                <div className={styles.userIdentity}>
                  <strong>{user.display_name || "Sans nom affiché"}{user.is_admin ? <em>ADMIN</em> : null}</strong>
                  <span>{user.email}</span>
                </div>
                <dl>
                  <div><dt>Dernière activité</dt><dd>{formatDate(user.last_login_at)}</dd></div>
                  <div><dt>Sessions</dt><dd>{user.active_sessions}</dd></div>
                  <div><dt>Espace</dt><dd>Révision {user.workspace_revision}</dd></div>
                  <div><dt>Contenu</dt><dd>{user.watchlist_count} suivis · {user.portfolio_count} positions</dd></div>
                </dl>
              </article>
            ))}
            {!users.length ? <p className={styles.empty}>Aucun compte trouvé.</p> : null}
          </div>
        </section>
      ) : null}

      {tab === "invites" ? (
        <section className={styles.twoColumns}>
          <form className={styles.panel} onSubmit={(event) => void submitInvite(event)}>
            <div className={styles.panelHeader}><div><span className={styles.eyebrow}>ACCÈS CONTRÔLÉ</span><h2>Créer une invitation</h2></div><KeyRound size={24} /></div>
            <label className={styles.field}><span>Libellé</span><input value={inviteLabel} minLength={2} maxLength={80} onChange={(event) => setInviteLabel(event.target.value)} /></label>
            <div className={styles.formGrid}>
              <label className={styles.field}><span>Nombre d’utilisations</span><input type="number" min={1} max={100} value={inviteUses} onChange={(event) => setInviteUses(Number(event.target.value))} /></label>
              <label className={styles.field}><span>Expiration (jours)</span><input type="number" min={1} max={365} value={inviteDays} onChange={(event) => setInviteDays(Number(event.target.value))} /></label>
            </div>
            <button className={styles.primary} type="submit"><TicketCheck size={17} /> Générer le code</button>
            {createdInvite ? (
              <div className={styles.generatedCode}>
                <small>Ce code ne sera affiché qu’ici.</small>
                <strong>{createdInvite.code}</strong>
                <button type="button" onClick={() => void copyCode()}><Copy size={16} /> {copied ? "Copié" : "Copier"}</button>
              </div>
            ) : null}
          </form>

          <div className={styles.panel}>
            <div className={styles.panelHeader}><div><span className={styles.eyebrow}>CODES ÉMIS</span><h2>Invitations récentes</h2></div><span>{invites.length}</span></div>
            <div className={styles.inviteList}>
              {invites.map((invite) => (
                <article key={invite.id} className={styles.inviteCard}>
                  <div><strong>{invite.label}</strong><span>••••••{invite.code_hint}</span></div>
                  <dl><div><dt>Utilisations</dt><dd>{invite.uses}/{invite.max_uses}</dd></div><div><dt>Expiration</dt><dd>{formatDate(invite.expires_at)}</dd></div></dl>
                  <span className={invite.active ? styles.activeBadge : styles.inactiveBadge}>{invite.active ? "Active" : invite.disabled ? "Révoquée" : "Épuisée"}</span>
                  {invite.active ? <button type="button" className={styles.dangerButton} onClick={() => void revoke(invite.id)}>Révoquer</button> : null}
                </article>
              ))}
              {!invites.length ? <p className={styles.empty}>Aucune invitation administrée.</p> : null}
            </div>
          </div>
        </section>
      ) : null}

      {tab === "reports" ? (
        <section className={styles.panel}>
          <div className={styles.panelHeader}><div><span className={styles.eyebrow}>RETOURS BÊTA</span><h2>Signalements des utilisateurs</h2></div><span>{reports.length}</span></div>
          <div className={styles.reportList}>
            {reports.map((report) => (
              <article className={styles.reportCard} key={report.report_id}>
                <div className={styles.reportHeading}>
                  <div><strong>{report.report_id}</strong><span>{report.category} · {report.route}</span></div>
                  <select value={report.status} onChange={(event) => void changeReportStatus(report.report_id, event.target.value as AdminReportStatus)}>
                    <option value="new">Nouveau</option><option value="reviewing">En analyse</option><option value="resolved">Résolu</option>
                  </select>
                </div>
                <p>{report.message}</p>
                <footer><span><Clock3 size={14} /> {formatDate(report.created_at)}</span><span>{report.viewport || "Sans diagnostic"}</span><span>{report.request_id || "Sans Request-ID"}</span></footer>
              </article>
            ))}
            {!reports.length ? <p className={styles.empty}>Aucun signalement persistant pour le moment.</p> : null}
          </div>
        </section>
      ) : null}
    </div>
  );
}
