import "server-only";

import Link from "next/link";
import { cookies } from "next/headers";
import { SESSION_COOKIE_NAME } from "@/lib/session-cookie";
import styles from "../../institutions/history.module.css";

export const dynamic = "force-dynamic";

type Quality = {
  latest_period: string | null;
  published_at: string | null;
  last_success_at: string | null;
  last_run_status: string | null;
  last_error_category: string | null;
  last_run_duration_seconds: number | null;
  managers_expected: number;
  managers_updated: number;
  managers_lagging: number;
  partial_period: string | null;
  coverage_percent: number;
  filings_count: number;
  sources_unavailable: string[];
  consistency_ok: boolean;
  due_period: string | null;
  alerts: string[];
};

const API_URL = (
  process.env.ANATOLE_API_URL ??
  process.env.NEXT_PUBLIC_API_URL ??
  process.env.NEXT_PUBLIC_API_BASE_URL ??
  "https://anatole-api.onrender.com"
).replace(/\/+$/, "");

async function readQuality(): Promise<Quality | null> {
  const token = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;
  try {
    const response = await fetch(`${API_URL}/api/v1/admin/institutions/quality`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
    return response.ok ? (await response.json()) as Quality : null;
  } catch {
    return null;
  }
}

const alertLabels: Record<string, string> = {
  pipeline_failed: "Dernière collecte en échec",
  period_overdue: "Nouvelle période exigible, mais non publiée",
  coverage_inconsistent: "Couverture du snapshot incohérente",
};

export default async function InstitutionalQualityPage() {
  const quality = await readQuality();
  return <main className={styles.page}>
    <Link className={styles.back} href="/admin">← Retour à l’administration</Link>
    <header className={styles.intro}><span className={styles.eyebrow}>ANATOLE ADMIN · SEC 13F</span><h1>Qualité des données institutionnelles</h1><p>Suivi interne de la collecte et de la cohérence du dernier trimestre publié. Aucune collecte SEC n’est lancée par cette page.</p></header>
    {!quality ? <p className={styles.notice}>Connexion administrateur requise ou suivi temporairement indisponible.</p> : <>
      {quality.alerts.length > 0 && <section className={styles.notice} role="alert"><strong>Alertes internes</strong><ul>{quality.alerts.map((alert) => <li key={alert}>{alertLabels[alert] ?? alert}</li>)}</ul></section>}
      <section className={styles.details} aria-label="État du pipeline">
        <details open><summary>Collecte et période</summary><dl><dt>Dernier trimestre publié</dt><dd>{quality.latest_period ?? "Aucun"}</dd><dt>Trimestre exigible</dt><dd>{quality.due_period ?? "Aucun"}</dd><dt>Publication</dt><dd>{quality.published_at ?? "N/D"}</dd><dt>Dernière collecte réussie</dt><dd>{quality.last_success_at ?? "N/D"}</dd><dt>Statut dernière exécution</dt><dd>{quality.last_run_status ?? "N/D"}</dd><dt>Durée</dt><dd>{quality.last_run_duration_seconds === null ? "N/D" : `${quality.last_run_duration_seconds.toFixed(1)} s`}</dd></dl></details>
        <details open><summary>Couverture et cohérence</summary><dl><dt>Gestionnaires actualisés</dt><dd>{quality.managers_updated} / {quality.managers_expected}</dd><dt>Couverture</dt><dd>{quality.coverage_percent.toFixed(1)} %</dd><dt>Gestionnaires en attente</dt><dd>{quality.managers_lagging}</dd><dt>Période partielle observée</dt><dd>{quality.partial_period ?? "Aucune"}</dd><dt>Déclarations intégrées</dt><dd>{quality.filings_count}</dd><dt>Cohérence</dt><dd>{quality.consistency_ok ? "Conforme" : "À vérifier"}</dd></dl></details>
        <details open><summary>Sources et erreurs</summary><dl><dt>Sources indisponibles</dt><dd>{quality.sources_unavailable.length ? quality.sources_unavailable.join(", ") : "Aucune"}</dd><dt>Dernière catégorie d’erreur</dt><dd>{quality.last_error_category ?? "Aucune"}</dd></dl></details>
      </section>
    </>}
  </main>;
}
