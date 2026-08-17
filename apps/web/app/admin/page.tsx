"use client";

import {
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import { ANATOLE_VERSION_LABEL } from "@/lib/version";
import { resilientFetch } from "@/lib/resilient-fetch";
import { usePreferences } from "@/components/providers/PreferencesProvider";
import { localeFor, pick, type AnatoleLanguage } from "@/lib/i18n";

type AdminTab =
  | "overview"
  | "users"
  | "invites"
  | "reports";

type Overview = {
  total_users: number;
  new_users_7d: number;
  active_users_7d: number;
  active_sessions: number;
  synced_accounts: number;
  total_workspace_revisions: number;
  active_invites: number;
  open_reports: number;
  reliability: {
    status: "healthy" | "degraded" | "critical";
    uptime_seconds: number;
    total_5xx: number;
    p95_duration_ms: number;
    slow_requests: number;
  };
  upstream_metrics: Record<string, number | string | null>;
};

type AdminUser = {
  id: string;
  email: string;
  display_name: string | null;
  is_admin: boolean;
  created_at: string;
  last_login_at: string | null;
  active_sessions: number;
  workspace_revision: number;
  watchlist_count: number;
  portfolio_count: number;
};

type Invite = {
  id: string;
  label: string;
  code_hint: string;
  max_uses: number;
  uses: number;
  active: boolean;
  disabled: boolean;
  expires_at: string | null;
  code?: string;
};

type ReportStatus = "new" | "reviewing" | "resolved";

type Report = {
  report_id: string;
  category: string;
  message: string;
  route: string;
  request_id: string | null;
  app_version: string | null;
  status: ReportStatus;
  created_at: string;
};

type UsersResponse = {
  total: number;
  users: AdminUser[];
};

type InvitesResponse = {
  invites: Invite[];
};

type ReportsResponse = {
  reports: Report[];
};

async function adminRequest<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const headers = new Headers(options.headers);
  headers.set("Accept", "application/json");

  if (options.body) {
    headers.set("Content-Type", "application/json");
  }

  const response = await resilientFetch(`/api/admin${path}`, {
    ...options,
    headers,
    credentials: "same-origin",
    cache: "no-store",
    timeoutMs: 25_000,
    retries: options.method && options.method !== "GET" ? 0 : 1,
    allowStale: false,
  });

  if (!response.ok) {
    let message = `Erreur administrateur ${response.status}`;

    try {
      const body = (await response.json()) as {
        detail?: string;
      };
      if (body.detail) message = body.detail;
    } catch {
      // Réponse non JSON.
    }

    throw new Error(message);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

function formatDate(value: string | null, language: AnatoleLanguage): string {
  if (!value) return pick(language, "Jamais", "Never");

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";

  return new Intl.DateTimeFormat(localeFor(language), {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function formatUptime(seconds: number, language: AnatoleLanguage): string {
  const days = Math.floor(seconds / 86_400);
  const hours = Math.floor(
    (seconds % 86_400) / 3_600,
  );

  if (days > 0) return pick(language, `${days} j ${hours} h`, `${days}d ${hours}h`);
  return pick(language, `${hours} h`, `${hours}h`);
}

export default function AdminPage() {
  const { preferences } = usePreferences();
  const language = preferences.language;
  const [tab, setTab] =
    useState<AdminTab>("overview");
  const [overview, setOverview] =
    useState<Overview | null>(null);
  const [users, setUsers] =
    useState<AdminUser[]>([]);
  const [invites, setInvites] =
    useState<Invite[]>([]);
  const [reports, setReports] =
    useState<Report[]>([]);
  const [query, setQuery] = useState("");
  const [inviteLabel, setInviteLabel] =
    useState("Bêta Anatole");
  const [inviteUses, setInviteUses] =
    useState(1);
  const [inviteDays, setInviteDays] =
    useState(14);
  const [createdCode, setCreatedCode] =
    useState("");
  const [loading, setLoading] =
    useState(true);
  const [busy, setBusy] =
    useState(false);
  const [error, setError] =
    useState("");

  const load = useCallback(
    async (search = query) => {
      setLoading(true);
      setError("");

      try {
        const suffix = search.trim()
          ? `?query=${encodeURIComponent(
              search.trim(),
            )}`
          : "";

        const [
          overviewData,
          usersData,
          invitesData,
          reportsData,
        ] = await Promise.all([
          adminRequest<Overview>("/overview"),
          adminRequest<UsersResponse>(
            `/users${suffix}`,
          ),
          adminRequest<InvitesResponse>(
            "/invites",
          ),
          adminRequest<ReportsResponse>(
            "/reports",
          ),
        ]);

        setOverview(overviewData);
        setUsers(usersData.users);
        setInvites(invitesData.invites);
        setReports(reportsData.reports);
      } catch (reason) {
        setError(
          reason instanceof Error
            ? reason.message
            : pick(language, "La console administrateur est indisponible.", "The administrator console is unavailable."),
        );
      } finally {
        setLoading(false);
      }
    },
    [language, query],
  );

  useEffect(() => {
    const timer = window.setTimeout(() => void load(""), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const openReports = useMemo(
    () =>
      reports.filter(
        (report) => report.status !== "resolved",
      ).length,
    [reports],
  );

  async function createInvite(
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> {
    event.preventDefault();
    setBusy(true);
    setError("");
    setCreatedCode("");

    try {
      const created = await adminRequest<Invite>(
        "/invites",
        {
          method: "POST",
          body: JSON.stringify({
            label: inviteLabel.trim(),
            max_uses: Math.max(
              1,
              Math.min(100, inviteUses),
            ),
            expires_in_days: Math.max(
              1,
              Math.min(365, inviteDays),
            ),
          }),
        },
      );

      setCreatedCode(created.code ?? "");
      await load("");
      setTab("invites");
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : pick(language, "Impossible de créer l’invitation.", "Unable to create the invitation."),
      );
    } finally {
      setBusy(false);
    }
  }

  async function revokeInvite(
    inviteId: string,
  ): Promise<void> {
    setBusy(true);
    setError("");

    try {
      await adminRequest<void>(
        `/invites/${encodeURIComponent(
          inviteId,
        )}/revoke`,
        { method: "POST" },
      );
      await load("");
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : pick(language, "Impossible de révoquer l’invitation.", "Unable to revoke the invitation."),
      );
    } finally {
      setBusy(false);
    }
  }

  async function updateReport(
    reportId: string,
    status: ReportStatus,
  ): Promise<void> {
    setBusy(true);
    setError("");

    try {
      await adminRequest<void>(
        `/reports/${encodeURIComponent(
          reportId,
        )}`,
        {
          method: "PATCH",
          body: JSON.stringify({ status }),
        },
      );

      setReports((current) =>
        current.map((report) =>
          report.report_id === reportId
            ? { ...report, status }
            : report,
        ),
      );
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : pick(language, "Impossible de modifier le signalement.", "Unable to update the report."),
      );
    } finally {
      setBusy(false);
    }
  }

  const tabs: Array<{
    id: AdminTab;
    label: string;
    count?: number;
  }> = [
    { id: "overview", label: pick(language, "Vue d’ensemble", "Overview") },
    {
      id: "users",
      label: pick(language, "Bêta-testeurs", "Beta testers"),
      count: overview?.total_users,
    },
    {
      id: "invites",
      label: pick(language, "Invitations", "Invitations"),
      count: overview?.active_invites,
    },
    {
      id: "reports",
      label: pick(language, "Signalements", "Reports"),
      count: openReports,
    },
  ];

  return (
    <main className="adminPage">
      <header className="hero">
        <div>
          <span className="eyebrow">
            ANATOLE ADMIN · {ANATOLE_VERSION_LABEL}
          </span>
          <h1>{pick(language, "Console de bêta", "Beta console")}</h1>
          <p>
            {pick(language, "Comptes, invitations, signalements et santé opérationnelle dans un seul espace.", "Accounts, invitations, reports, and operational health in one workspace.")}
          </p>
        </div>

        <button
          type="button"
          className="refresh"
          disabled={loading || busy}
          onClick={() => void load("")}
        >
          ↻ {pick(language, "Actualiser", "Refresh")}
        </button>
      </header>

      <nav
        className="tabs"
        aria-label={pick(language, "Sections administrateur", "Administrator sections")}
      >
        {tabs.map((item) => (
          <button
            key={item.id}
            type="button"
            className={
              tab === item.id ? "active" : ""
            }
            onClick={() => setTab(item.id)}
          >
            <span>{item.label}</span>
            {typeof item.count === "number" ? (
              <strong>{item.count}</strong>
            ) : null}
          </button>
        ))}
      </nav>

      {error ? (
        <section className="error" role="alert">
          <strong>{pick(language, "Accès ou chargement impossible", "Unable to access or load")}</strong>
          <span>{language === "fr" ? error : "The administrator console could not be loaded."}</span>
          <small>
            {pick(language, "Vérifie que ton courriel figure exactement dans ACCOUNT_ADMIN_EMAILS, puis déconnecte-toi et reconnecte-toi.", "Verify that your email appears exactly in ACCOUNT_ADMIN_EMAILS, then sign out and sign in again.")}
          </small>
        </section>
      ) : null}

      {loading ? (
        <section className="loading">
          {pick(language, "Chargement de la console…", "Loading console…")}
        </section>
      ) : null}

      {!loading &&
      !error &&
      tab === "overview" &&
      overview ? (
        <>
          <section className="metrics">
            <article>
              <span>{pick(language, "Comptes", "Accounts")}</span>
              <strong>{overview.total_users}</strong>
              <small>
                +{overview.new_users_7d} {pick(language, "cette semaine", "this week")}
              </small>
            </article>
            <article>
              <span>{pick(language, "Actifs sur 7 jours", "Active over 7 days")}</span>
              <strong>
                {overview.active_users_7d}
              </strong>
              <small>
                {overview.active_sessions} sessions
              </small>
            </article>
            <article>
              <span>{pick(language, "Synchronisés", "Synchronized")}</span>
              <strong>
                {overview.synced_accounts}
              </strong>
              <small>
                {overview.total_workspace_revisions}{" "}
                {pick(language, "révisions", "revisions")}
              </small>
            </article>
            <article>
              <span>{pick(language, "Signalements ouverts", "Open reports")}</span>
              <strong>{overview.open_reports}</strong>
              <small>
                {overview.active_invites} invitations
                {pick(language, "actives", "active")}
              </small>
            </article>
          </section>

          <section className="columns">
            <article className="panel">
              <div className="panelTitle">
                <div>
                  <span className="eyebrow">
                    PLATEFORME
                  </span>
                  <h2>{pick(language, "Santé opérationnelle", "Operational health")}</h2>
                </div>
                <em
                  className={`health ${overview.reliability.status}`}
                >
                  {overview.reliability.status ===
                  "healthy"
                    ? pick(language, "Saine", "Healthy")
                    : overview.reliability.status ===
                        "degraded"
                      ? pick(language, "Dégradée", "Degraded")
                      : pick(language, "Critique", "Critical")}
                </em>
              </div>

              <dl>
                <div>
                  <dt>{pick(language, "Disponibilité", "Availability")}</dt>
                  <dd>
                    {formatUptime(
                      overview.reliability.uptime_seconds,
                      language,
                    )}
                  </dd>
                </div>
                <div>
                  <dt>{pick(language, "Latence p95", "p95 latency")}</dt>
                  <dd>
                    {overview.reliability
                      .p95_duration_ms.toFixed(0)}{" "}
                    ms
                  </dd>
                </div>
                <div>
                  <dt>{pick(language, "Erreurs 5xx", "5xx errors")}</dt>
                  <dd>
                    {overview.reliability.total_5xx}
                  </dd>
                </div>
                <div>
                  <dt>{pick(language, "Requêtes lentes", "Slow requests")}</dt>
                  <dd>
                    {
                      overview.reliability
                        .slow_requests
                    }
                  </dd>
                </div>
              </dl>
            </article>

            <article className="panel">
              <div className="panelTitle">
                <div>
                  <span className="eyebrow">{pick(language, "FOURNISSEURS", "PROVIDERS")}</span>
                  <h2>{pick(language, "Flux externes", "External flows")}</h2>
                </div>
                <em className="health healthy">
                  {pick(language, "Actif", "Active")}
                </em>
              </div>

              <dl>
                <div>
                  <dt>{pick(language, "Requêtes", "Requests")}</dt>
                  <dd>
                    {String(
                      overview.upstream_metrics
                        .requests ?? 0,
                    )}
                  </dd>
                </div>
                <div>
                  <dt>{pick(language, "Échecs", "Failures")}</dt>
                  <dd>
                    {String(
                      overview.upstream_metrics
                        .failures ?? 0,
                    )}
                  </dd>
                </div>
                <div>
                  <dt>Retries</dt>
                  <dd>
                    {String(
                      overview.upstream_metrics
                        .retries ?? 0,
                    )}
                  </dd>
                </div>
                <div>
                  <dt>{pick(language, "Concurrence max.", "Max concurrency")}</dt>
                  <dd>
                    {String(
                      overview.upstream_metrics
                        .peak_active ?? 0,
                    )}
                  </dd>
                </div>
              </dl>
            </article>
          </section>
        </>
      ) : null}

      {!loading && !error && tab === "users" ? (
        <section className="panel">
          <div className="panelTitle wrap">
            <div>
              <span className="eyebrow">
                {pick(language, "BÊTA-TESTEURS", "BETA TESTERS")}
              </span>
              <h2>{pick(language, "Comptes inscrits", "Registered accounts")}</h2>
            </div>

            <form
              className="search"
              onSubmit={(event) => {
                event.preventDefault();
                void load(query);
              }}
            >
              <input
                value={query}
                placeholder={pick(language, "Nom ou courriel", "Name or email")}
                aria-label={pick(language, "Rechercher un compte", "Search accounts")}
                onChange={(event) =>
                  setQuery(event.target.value)
                }
              />
              <button type="submit">
                {pick(language, "Rechercher", "Search")}
              </button>
            </form>
          </div>

          <div className="list">
            {users.map((user) => (
              <article
                className="userCard"
                key={user.id}
              >
                <span className="avatar">
                  {(user.display_name || user.email)
                    .slice(0, 1)
                    .toUpperCase()}
                </span>
                <div className="identity">
                  <strong>
                    {user.display_name ||
                      pick(language, "Sans nom affiché", "No display name")}
                    {user.is_admin ? (
                      <em>ADMIN</em>
                    ) : null}
                  </strong>
                  <span>{user.email}</span>
                </div>
                <dl>
                  <div>
                    <dt>{pick(language, "Dernière activité", "Last activity")}</dt>
                    <dd>
                      {formatDate(
                        user.last_login_at,
                        language,
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt>Sessions</dt>
                    <dd>
                      {user.active_sessions}
                    </dd>
                  </div>
                  <div>
                    <dt>{pick(language, "Espace", "Workspace")}</dt>
                    <dd>
                      {pick(language, "Révision", "Revision")}{" "}
                      {user.workspace_revision}
                    </dd>
                  </div>
                  <div>
                    <dt>{pick(language, "Contenu", "Content")}</dt>
                    <dd>
                      {user.watchlist_count} {pick(language, "suivis", "tracked")} ·{" "}
                      {user.portfolio_count} positions
                    </dd>
                  </div>
                </dl>
              </article>
            ))}
            {!users.length ? (
              <p className="empty">
                {pick(language, "Aucun compte trouvé.", "No account found.")}
              </p>
            ) : null}
          </div>
        </section>
      ) : null}

      {!loading && !error && tab === "invites" ? (
        <section className="columns">
          <form
            className="panel"
            onSubmit={(event) =>
              void createInvite(event)
            }
          >
            <div className="panelTitle">
              <div>
                <span className="eyebrow">
                  {pick(language, "ACCÈS CONTRÔLÉ", "CONTROLLED ACCESS")}
                </span>
                <h2>{pick(language, "Créer une invitation", "Create an invitation")}</h2>
              </div>
            </div>

            <label>
              <span>{pick(language, "Libellé", "Label")}</span>
              <input
                value={inviteLabel}
                minLength={2}
                maxLength={80}
                required
                onChange={(event) =>
                  setInviteLabel(
                    event.target.value,
                  )
                }
              />
            </label>

            <div className="formGrid">
              <label>
                <span>{pick(language, "Utilisations", "Uses")}</span>
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={inviteUses}
                  onChange={(event) =>
                    setInviteUses(
                      Number(event.target.value),
                    )
                  }
                />
              </label>

              <label>
                <span>{pick(language, "Expiration", "Expiration")}</span>
                <input
                  type="number"
                  min={1}
                  max={365}
                  value={inviteDays}
                  onChange={(event) =>
                    setInviteDays(
                      Number(event.target.value),
                    )
                  }
                />
              </label>
            </div>

            <button
              className="primary"
              type="submit"
              disabled={busy}
            >
              {pick(language, "Générer le code", "Generate code")}
            </button>

            {createdCode ? (
              <div className="createdCode">
                <span>
                  {pick(language, "Copie ce code maintenant. Il ne sera plus affiché en entier.", "Copy this code now. It will not be shown in full again.")}
                </span>
                <strong>{createdCode}</strong>
                <button
                  type="button"
                  onClick={() =>
                    void navigator.clipboard.writeText(
                      createdCode,
                    )
                  }
                >
                  {pick(language, "Copier", "Copy")}
                </button>
              </div>
            ) : null}
          </form>

          <section className="panel">
            <div className="panelTitle">
              <div>
                <span className="eyebrow">
                  INVITATIONS
                </span>
                <h2>{pick(language, "Codes existants", "Existing codes")}</h2>
              </div>
            </div>

            <div className="list compact">
              {invites.map((invite) => (
                <article
                  className="inviteCard"
                  key={invite.id}
                >
                  <div>
                    <strong>{invite.label}</strong>
                    <span>
                      {invite.code_hint} ·{" "}
                      {invite.uses}/{invite.max_uses}{" "}
                      {pick(language, "utilisations", "uses")}
                    </span>
                    <small>
                      {pick(language, "Expiration", "Expiration")}: {" "}
                      {formatDate(
                        invite.expires_at,
                        language,
                      )}
                    </small>
                  </div>
                  <button
                    type="button"
                    disabled={
                      busy || !invite.active
                    }
                    onClick={() =>
                      void revokeInvite(invite.id)
                    }
                  >
                    {invite.active
                      ? pick(language, "Révoquer", "Revoke")
                      : pick(language, "Inactive", "Inactive")}
                  </button>
                </article>
              ))}

              {!invites.length ? (
                <p className="empty">
                  {pick(language, "Aucune invitation administrée.", "No managed invitation.")}
                </p>
              ) : null}
            </div>
          </section>
        </section>
      ) : null}

      {!loading && !error && tab === "reports" ? (
        <section className="panel">
          <div className="panelTitle">
            <div>
              <span className="eyebrow">
                {pick(language, "RETOURS BÊTA", "BETA FEEDBACK")}
              </span>
              <h2>{pick(language, "Signalements utilisateurs", "User reports")}</h2>
            </div>
          </div>

          <div className="list">
            {reports.map((report) => (
              <article
                className="reportCard"
                key={report.report_id}
              >
                <div className="reportHead">
                  <div>
                    <strong>
                      {report.category}
                    </strong>
                    <span>
                      {formatDate(
                        report.created_at,
                        language,
                      )}{" "}
                      · {report.route}
                    </span>
                  </div>

                  <select
                    value={report.status}
                    disabled={busy}
                    onChange={(event) =>
                      void updateReport(
                        report.report_id,
                        event.target
                          .value as ReportStatus,
                      )
                    }
                  >
                    <option value="new">
                      {pick(language, "Nouveau", "New")}
                    </option>
                    <option value="reviewing">
                      {pick(language, "En analyse", "Reviewing")}
                    </option>
                    <option value="resolved">
                      {pick(language, "Résolu", "Resolved")}
                    </option>
                  </select>
                </div>

                <p>{report.message}</p>
                <small>
                  {pick(language, "Requête", "Request")}: {" "}
                  {report.request_id || pick(language, "Non fournie", "Not provided")} ·
                  Version :{" "}
                  {report.app_version || pick(language, "Non fournie", "Not provided")}
                </small>
              </article>
            ))}

            {!reports.length ? (
              <p className="empty">
                {pick(language, "Aucun signalement enregistré.", "No report recorded.")}
              </p>
            ) : null}
          </div>
        </section>
      ) : null}

      <style jsx>{`
        .adminPage {
          width: 100%;
          max-width: 1500px;
          margin: 0 auto;
          padding: 28px;
          display: grid;
          gap: 22px;
          color: #eef7fb;
        }

        .hero,
        .panel,
        .metrics article,
        .tabs,
        .loading,
        .error {
          border: 1px solid rgba(62, 121, 156, 0.42);
          background:
            linear-gradient(
              145deg,
              rgba(11, 38, 55, 0.98),
              rgba(4, 22, 34, 0.98)
            );
          box-shadow:
            0 20px 50px rgba(0, 0, 0, 0.16),
            inset 0 1px rgba(255, 255, 255, 0.03);
        }

        .hero {
          padding: 30px;
          border-radius: 24px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 24px;
        }

        h1,
        h2,
        p {
          margin: 0;
        }

        h1 {
          margin-top: 7px;
          font-size: clamp(2rem, 4vw, 3.6rem);
          letter-spacing: -0.055em;
        }

        h2 {
          margin-top: 5px;
          font-size: 1.45rem;
          letter-spacing: -0.025em;
        }

        .hero p {
          margin-top: 10px;
          color: #86abc1;
          font-size: 1rem;
        }

        .eyebrow {
          color: #6da5ff;
          font-size: 0.72rem;
          font-weight: 900;
          letter-spacing: 0.16em;
        }

        button,
        input,
        select {
          font: inherit;
        }

        button {
          cursor: pointer;
        }

        button:disabled {
          cursor: not-allowed;
          opacity: 0.55;
        }

        .refresh,
        .primary,
        .search button,
        .createdCode button,
        .inviteCard button {
          min-height: 44px;
          padding: 0 16px;
          border: 1px solid rgba(78, 147, 194, 0.55);
          border-radius: 12px;
          color: #edf8ff;
          background: rgba(13, 48, 71, 0.95);
          font-weight: 800;
        }

        .refresh:hover,
        .primary:hover,
        .search button:hover,
        .createdCode button:hover {
          border-color: #659cff;
          background: rgba(39, 94, 145, 0.88);
        }

        .tabs {
          padding: 8px;
          border-radius: 18px;
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 8px;
        }

        .tabs button {
          min-height: 50px;
          padding: 8px 14px;
          border: 1px solid transparent;
          border-radius: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 9px;
          color: #8eacbf;
          background: transparent;
          font-weight: 850;
        }

        .tabs button.active {
          border-color: #5086ef;
          color: #fff;
          background:
            linear-gradient(
              145deg,
              rgba(51, 101, 184, 0.42),
              rgba(17, 55, 85, 0.66)
            );
        }

        .tabs strong {
          min-width: 22px;
          height: 22px;
          padding: 0 6px;
          border-radius: 999px;
          display: inline-grid;
          place-items: center;
          color: #b9d6e8;
          background: rgba(4, 24, 37, 0.72);
          font-size: 0.72rem;
        }

        .error,
        .loading {
          padding: 18px 20px;
          border-radius: 16px;
        }

        .error {
          border-color: rgba(255, 98, 115, 0.45);
          display: grid;
          gap: 5px;
          color: #ffb5bd;
        }

        .error span,
        .error small {
          color: #d68d98;
        }

        .loading {
          color: #8baec2;
        }

        .metrics {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 14px;
        }

        .metrics article {
          min-height: 150px;
          padding: 20px;
          border-radius: 19px;
          display: grid;
          align-content: center;
          gap: 8px;
        }

        .metrics span,
        .metrics small {
          color: #7e9eb3;
        }

        .metrics strong {
          font-size: 2.35rem;
          letter-spacing: -0.05em;
        }

        .columns {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 16px;
        }

        .panel {
          padding: 24px;
          border-radius: 22px;
          min-width: 0;
        }

        .panelTitle {
          margin-bottom: 22px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 18px;
        }

        .panelTitle.wrap {
          flex-wrap: wrap;
        }

        .health {
          padding: 7px 10px;
          border: 1px solid rgba(83, 216, 170, 0.42);
          border-radius: 999px;
          color: #71e3ba;
          background: rgba(28, 125, 91, 0.17);
          font-size: 0.75rem;
          font-style: normal;
          font-weight: 850;
        }

        .health.degraded {
          border-color: rgba(247, 184, 78, 0.48);
          color: #f5c469;
          background: rgba(143, 92, 16, 0.18);
        }

        .health.critical {
          border-color: rgba(255, 92, 110, 0.48);
          color: #ff8997;
          background: rgba(145, 29, 49, 0.18);
        }

        dl {
          margin: 0;
        }

        .panel > dl {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 12px;
        }

        .panel > dl div,
        .userCard dl div {
          padding: 14px;
          border: 1px solid rgba(52, 105, 137, 0.34);
          border-radius: 13px;
          background: rgba(3, 19, 29, 0.42);
        }

        dt {
          color: #7191a5;
          font-size: 0.78rem;
        }

        dd {
          margin: 5px 0 0;
          color: #f2f8fc;
          font-weight: 850;
        }

        .search {
          display: flex;
          gap: 8px;
        }

        input,
        select {
          min-height: 44px;
          box-sizing: border-box;
          border: 1px solid rgba(65, 123, 158, 0.45);
          border-radius: 11px;
          padding: 0 13px;
          color: #f2f8fc;
          background: rgba(2, 17, 27, 0.88);
        }

        input:focus,
        select:focus {
          border-color: #6198ef;
          outline: none;
        }

        .list {
          display: grid;
          gap: 12px;
        }

        .list.compact {
          max-height: 560px;
          overflow-y: auto;
          padding-right: 4px;
        }

        .userCard {
          padding: 17px;
          border: 1px solid rgba(52, 105, 137, 0.34);
          border-radius: 17px;
          display: grid;
          grid-template-columns: 48px minmax(180px, 0.9fr) minmax(0, 2fr);
          align-items: center;
          gap: 14px;
          background: rgba(4, 22, 34, 0.7);
        }

        .avatar {
          width: 46px;
          height: 46px;
          border-radius: 14px;
          display: grid;
          place-items: center;
          color: #fff;
          background:
            linear-gradient(145deg, #4b85e9, #1b9fce);
          font-size: 1.2rem;
          font-weight: 900;
        }

        .identity {
          min-width: 0;
          display: grid;
          gap: 4px;
        }

        .identity strong {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .identity em {
          padding: 3px 6px;
          border-radius: 6px;
          color: #80b6ff;
          background: rgba(43, 93, 177, 0.22);
          font-size: 0.58rem;
          font-style: normal;
        }

        .identity span {
          overflow: hidden;
          color: #7698ad;
          text-overflow: ellipsis;
        }

        .userCard dl {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 8px;
        }

        label {
          display: grid;
          gap: 7px;
          margin-top: 14px;
          color: #b7cedd;
          font-size: 0.86rem;
          font-weight: 800;
        }

        label input {
          width: 100%;
        }

        .formGrid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 12px;
        }

        .primary {
          width: 100%;
          margin-top: 18px;
        }

        .createdCode {
          margin-top: 16px;
          padding: 15px;
          border: 1px solid rgba(77, 221, 170, 0.38);
          border-radius: 14px;
          display: grid;
          gap: 10px;
          background: rgba(31, 125, 91, 0.14);
        }

        .createdCode span {
          color: #8ed5bc;
          font-size: 0.82rem;
        }

        .createdCode strong {
          padding: 12px;
          border-radius: 10px;
          color: #fff;
          background: rgba(2, 18, 28, 0.72);
          font-family: ui-monospace, monospace;
          letter-spacing: 0.07em;
          word-break: break-all;
        }

        .inviteCard,
        .reportCard {
          padding: 15px;
          border: 1px solid rgba(52, 105, 137, 0.34);
          border-radius: 15px;
          background: rgba(4, 22, 34, 0.7);
        }

        .inviteCard {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
        }

        .inviteCard > div {
          min-width: 0;
          display: grid;
          gap: 4px;
        }

        .inviteCard span,
        .inviteCard small,
        .reportCard span,
        .reportCard small {
          color: #7898ac;
        }

        .inviteCard button {
          flex: 0 0 auto;
          border-color: rgba(255, 99, 115, 0.38);
          color: #ff9ba6;
        }

        .reportHead {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 14px;
        }

        .reportHead > div {
          min-width: 0;
          display: grid;
          gap: 4px;
        }

        .reportCard p {
          margin: 14px 0 11px;
          color: #c8d9e4;
          line-height: 1.55;
          white-space: pre-wrap;
        }

        .empty {
          padding: 24px;
          text-align: center;
          color: #7898ac;
        }

        @media (max-width: 1050px) {
          .metrics {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }

          .userCard {
            grid-template-columns: 48px minmax(0, 1fr);
          }

          .userCard dl {
            grid-column: 1 / -1;
          }
        }

        @media (max-width: 820px) {
          .adminPage {
            padding: 15px;
            gap: 14px;
          }

          .hero {
            padding: 22px;
            align-items: stretch;
            flex-direction: column;
          }

          .refresh {
            width: 100%;
          }

          .tabs {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }

          .metrics,
          .columns {
            grid-template-columns: 1fr;
          }

          .panel {
            padding: 18px;
            border-radius: 18px;
          }

          .panelTitle,
          .panelTitle.wrap {
            align-items: stretch;
            flex-direction: column;
          }

          .search {
            width: 100%;
            flex-direction: column;
          }

          .search input,
          .search button {
            width: 100%;
          }

          .panel > dl,
          .userCard dl,
          .formGrid {
            grid-template-columns: 1fr;
          }

          .userCard {
            grid-template-columns: 44px minmax(0, 1fr);
          }

          .inviteCard,
          .reportHead {
            align-items: stretch;
            flex-direction: column;
          }

          .inviteCard button,
          .reportHead select {
            width: 100%;
          }
        }
      `}</style>
    </main>
  );
}
