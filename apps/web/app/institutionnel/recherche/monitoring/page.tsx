import Link from "next/link";
import styles from "./page.module.css";

type SearchParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function clean(
  value: string | string[] | undefined,
  maxLength = 1000,
): string {
  return first(value).trim().slice(0, maxLength);
}

function numeric(
  value: string | string[] | undefined,
  min = -1_000_000_000,
  max = 1_000_000_000,
): number | null {
  const raw = first(value).trim().replace(",", ".");
  if (!raw) return null;

  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return null;
  return Math.min(max, Math.max(min, parsed));
}

function integer(
  value: string | string[] | undefined,
): number | null {
  const parsed = numeric(value, 0, 100_000);
  return parsed === null ? null : Math.round(parsed);
}

function signedPercent(
  value: number | null,
  digits = 1,
): string {
  if (value === null) return "N/D";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(digits)} %`;
}

function plain(
  value: number | null,
  digits = 2,
): string {
  return value === null ? "N/D" : value.toFixed(digits);
}

export default async function InstitutionalThesisMonitorPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const p = await searchParams;

  const symbol = clean(p.symbol, 15)
    .toUpperCase()
    .replace(/\.TO$/, "")
    .replace(/[^A-Z0-9.^-]/g, "");

  const thesisRef = clean(p.thesis_ref, 120);
  const metricName = clean(p.metric_name, 120);
  const thresholdDirection =
    clean(p.threshold_direction, 12) === "max" ? "max" : "min";

  const threshold = numeric(p.threshold);
  const currentMetric = numeric(p.current_metric);

  const priorConsensus = numeric(p.prior_consensus);
  const currentConsensus = numeric(p.current_consensus);
  const bullEstimate = numeric(p.bull_estimate);
  const bearEstimate = numeric(p.bear_estimate);

  const revisionsUp = integer(p.revisions_up);
  const revisionsDown = integer(p.revisions_down);

  const evidence = clean(p.evidence, 1400);
  const eventNote = clean(p.event_note, 1200);
  const nextCheck = clean(p.next_check, 500);

  const thresholdEvaluable =
    threshold !== null && currentMetric !== null;

  const thresholdBreached =
    thresholdEvaluable
      ? thresholdDirection === "min"
        ? currentMetric < threshold
        : currentMetric > threshold
      : null;

  const consensusDelta =
    priorConsensus !== null &&
    currentConsensus !== null &&
    Math.abs(priorConsensus) > 0
      ? ((currentConsensus - priorConsensus) /
          Math.abs(priorConsensus)) *
        100
      : null;

  const dispersion =
    bullEstimate !== null &&
    bearEstimate !== null &&
    currentConsensus !== null &&
    Math.abs(currentConsensus) > 0
      ? (Math.abs(bullEstimate - bearEstimate) /
          Math.abs(currentConsensus)) *
        100
      : null;

  const totalRevisions =
    revisionsUp !== null && revisionsDown !== null
      ? revisionsUp + revisionsDown
      : null;

  const revisionBreadth =
    totalRevisions !== null && totalRevisions > 0
      ? (((revisionsUp ?? 0) - (revisionsDown ?? 0)) /
          totalRevisions) *
        100
      : null;

  const hasSnapshot =
    Boolean(
      symbol ||
        thesisRef ||
        metricName ||
        evidence ||
        eventNote ||
        nextCheck,
    ) ||
    threshold !== null ||
    currentMetric !== null ||
    priorConsensus !== null ||
    currentConsensus !== null ||
    bullEstimate !== null ||
    bearEstimate !== null ||
    revisionsUp !== null ||
    revisionsDown !== null;

  const thresholdStatus =
    thresholdBreached === null
      ? "Seuil non évalué"
      : thresholdBreached
        ? "Seuil d'invalidation franchi"
        : "Seuil d'invalidation intact";

  const consensusDirection =
    consensusDelta === null
      ? "Révision non calculée"
      : consensusDelta >= 5
        ? "Consensus en hausse"
        : consensusDelta <= -5
          ? "Consensus en baisse"
          : "Consensus relativement stable";

  const revisionLabel =
    revisionBreadth === null
      ? "Breadth N/D"
      : revisionBreadth >= 20
        ? "Révisions majoritairement positives"
        : revisionBreadth <= -20
          ? "Révisions majoritairement négatives"
          : "Révisions partagées";

  return (
    <main
      className={styles.shell}
      data-testid="institutional-thesis-monitor-center"
    >
      <header className={styles.hero}>
        <div>
          <Link href="/institutionnel/recherche">
            ← Research & Thesis
          </Link>
          <span>
            ANATOLE INSTITUTIONAL · THESIS MONITORING
          </span>
          <h1>Thesis Monitor & Consensus Intelligence</h1>
          <p>
            Compare une hypothèse critique à un seuil explicite et structure
            l&apos;évolution du consensus. Les calculs reposent uniquement sur
            les données renseignées ici; Anatole ne transforme pas un seuil
            franchi en ordre ou recommandation.
          </p>
        </div>

        <aside>
          <strong>Evidence, not autopilot</strong>
          <span>
            Une rupture de seuil signale qu&apos;une hypothèse doit être revue.
            Elle ne décide pas automatiquement d&apos;acheter, vendre ou conserver.
          </span>
        </aside>
      </header>

      <nav className={styles.nav}>
        <Link href="/institutionnel/recherche">
          Thesis Builder →
        </Link>
        <Link
          href={symbol ? `/focus/${encodeURIComponent(symbol)}` : "/focus/RY"}
        >
          Focus {symbol || "titre"} →
        </Link>
        <Link href="/actualites">Actualités →</Link>
        <Link href="/calendrier">Calendrier →</Link>
        <Link href="/institutionnel/comite">Comité →</Link>
        <Link href="/institutionnel/gouvernance">Gouvernance →</Link>
      </nav>

      <section className={styles.states}>
        <article>
          <b>#14 Thesis Monitor</b>
          <span>Bridge actif</span>
          <p>Le workflow existant structure déjà les variables à surveiller.</p>
        </article>

        <article>
          <b>#15 Thesis Break Detection</b>
          <span>Bridge V1</span>
          <p>Un seuil utilisateur peut maintenant être testé explicitement.</p>
        </article>

        <article>
          <b>#22 Consensus Intelligence</b>
          <span>Bridge V1</span>
          <p>Révision, dispersion et breadth sont calculées sur les inputs saisis.</p>
        </article>

        <article>
          <b>#13 Investment Journal</b>
          <span>Fondation</span>
          <p>Le mémo existe, mais la persistance historique durable reste à construire.</p>
        </article>
      </section>

      <section className={styles.panel}>
        <h2>Snapshot de suivi</h2>

        <form method="get" className={styles.form}>
          <div className={styles.three}>
            <label>
              Titre
              <input
                name="symbol"
                defaultValue={symbol}
                placeholder="RY, SHOP, MDA..."
                maxLength={15}
              />
            </label>

            <label>
              Référence de thèse
              <input
                name="thesis_ref"
                defaultValue={thesisRef}
                placeholder="THESIS-RY-Q3"
                maxLength={120}
              />
            </label>

            <label>
              Hypothèse / KPI critique
              <input
                name="metric_name"
                defaultValue={metricName}
                placeholder="Marge EBITDA, croissance ARR..."
                maxLength={120}
              />
            </label>
          </div>

          <div className={styles.three}>
            <label>
              Règle d&apos;invalidation
              <select
                name="threshold_direction"
                defaultValue={thresholdDirection}
              >
                <option value="min">
                  Rupture si la valeur passe sous le seuil
                </option>
                <option value="max">
                  Rupture si la valeur dépasse le seuil
                </option>
              </select>
            </label>

            <label>
              Seuil
              <input
                name="threshold"
                defaultValue={first(p.threshold)}
                placeholder="100"
                inputMode="decimal"
              />
            </label>

            <label>
              Valeur actuelle
              <input
                name="current_metric"
                defaultValue={first(p.current_metric)}
                placeholder="95"
                inputMode="decimal"
              />
            </label>
          </div>

          <h2>Consensus</h2>

          <div className={styles.four}>
            <label>
              Consensus précédent
              <input
                name="prior_consensus"
                defaultValue={first(p.prior_consensus)}
                placeholder="10"
                inputMode="decimal"
              />
            </label>

            <label>
              Consensus actuel
              <input
                name="current_consensus"
                defaultValue={first(p.current_consensus)}
                placeholder="12"
                inputMode="decimal"
              />
            </label>

            <label>
              Estimation bull
              <input
                name="bull_estimate"
                defaultValue={first(p.bull_estimate)}
                placeholder="14"
                inputMode="decimal"
              />
            </label>

            <label>
              Estimation bear
              <input
                name="bear_estimate"
                defaultValue={first(p.bear_estimate)}
                placeholder="8"
                inputMode="decimal"
              />
            </label>
          </div>

          <div className={styles.two}>
            <label>
              Révisions positives
              <input
                name="revisions_up"
                defaultValue={first(p.revisions_up)}
                placeholder="7"
                inputMode="numeric"
              />
            </label>

            <label>
              Révisions négatives
              <input
                name="revisions_down"
                defaultValue={first(p.revisions_down)}
                placeholder="3"
                inputMode="numeric"
              />
            </label>
          </div>

          <div className={styles.two}>
            <label>
              Preuves / source de mise à jour
              <textarea
                name="evidence"
                defaultValue={evidence}
                rows={4}
                placeholder="Résultats, filing, transcript, source interne autorisée..."
              />
            </label>

            <label>
              Événement ou changement observé
              <textarea
                name="event_note"
                defaultValue={eventNote}
                rows={4}
                placeholder="Ce qui a changé depuis le dernier snapshot."
              />
            </label>
          </div>

          <label>
            Prochain contrôle
            <textarea
              name="next_check"
              defaultValue={nextCheck}
              rows={3}
              placeholder="Variable, date ou événement à vérifier ensuite."
            />
          </label>

          <div className={styles.actions}>
            <button type="submit">Évaluer le snapshot</button>
            <Link href="/institutionnel/recherche/monitoring">
              Effacer
            </Link>
          </div>
        </form>
      </section>

      {hasSnapshot ? (
        <section
          className={styles.results}
          data-testid="institutional-thesis-monitor-results"
        >
          <article className={styles.panel}>
            <header className={styles.resultHeader}>
              <div>
                <span>THESIS CHECK</span>
                <h2>{symbol || "Titre N/D"}</h2>
              </div>
              <b>{thresholdStatus}</b>
            </header>

            <div className={styles.metrics}>
              <div>
                <span>KPI</span>
                <b>{metricName || "N/D"}</b>
              </div>

              <div>
                <span>Seuil</span>
                <b>{plain(threshold)}</b>
              </div>

              <div>
                <span>Actuel</span>
                <b>{plain(currentMetric)}</b>
              </div>

              <div>
                <span>Statut</span>
                <b>{thresholdStatus}</b>
              </div>
            </div>

            <p className={styles.note}>
              Le statut compare uniquement la valeur actuelle au seuil défini par
              l&apos;analyste. Il ne constitue pas une conclusion d&apos;investissement.
            </p>
          </article>

          <article className={styles.panel}>
            <header className={styles.resultHeader}>
              <div>
                <span>CONSENSUS SNAPSHOT</span>
                <h2>{consensusDirection}</h2>
              </div>
              <b>{revisionLabel}</b>
            </header>

            <div className={styles.metrics}>
              <div>
                <span>Révision consensus</span>
                <b>{signedPercent(consensusDelta)}</b>
              </div>

              <div>
                <span>Dispersion bull / bear</span>
                <b>{signedPercent(dispersion)}</b>
              </div>

              <div>
                <span>Revision breadth</span>
                <b>{signedPercent(revisionBreadth)}</b>
              </div>

              <div>
                <span>Révisions</span>
                <b>
                  {revisionsUp ?? "N/D"} ↑ · {revisionsDown ?? "N/D"} ↓
                </b>
              </div>
            </div>

            <p className={styles.note}>
              La dispersion utilise l&apos;écart absolu bull-bear rapporté au
              consensus actuel. La breadth = (révisions positives - négatives)
              / total des révisions.
            </p>
          </article>

          <article className={`${styles.panel} ${styles.full}`}>
            <h2>Evidence & next check</h2>

            <div className={styles.memoGrid}>
              <article>
                <span>RÉFÉRENCE THÈSE</span>
                <p>{thesisRef || "N/D"}</p>
              </article>

              <article>
                <span>PREUVES</span>
                <p>{evidence || "N/D"}</p>
              </article>

              <article>
                <span>CHANGEMENT OBSERVÉ</span>
                <p>{eventNote || "N/D"}</p>
              </article>

              <article>
                <span>PROCHAIN CONTRÔLE</span>
                <p>{nextCheck || "N/D"}</p>
              </article>
            </div>
          </article>
        </section>
      ) : (
        <section className={styles.empty}>
          <b>Aucun snapshot de suivi.</b>
          <span>
            Renseigne un seuil critique ou un consensus pour produire une
            évaluation reproductible.
          </span>
        </section>
      )}
    </main>
  );
}
