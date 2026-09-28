import Link from "next/link";
import styles from "./page.module.css";

type SearchParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function clean(
  value: string | string[] | undefined,
  maxLength = 1200,
): string {
  return first(value).trim().slice(0, maxLength);
}

const REVIEW_LABELS: Record<string, string> = {
  annual: "Revue annuelle",
  quarterly: "Revue trimestrielle",
  event: "Revue déclenchée par événement",
  onboarding: "Préparation onboarding",
};

const RISK_LABELS: Record<string, string> = {
  conservative: "Conservateur",
  balanced: "Équilibré",
  growth: "Croissance",
  custom: "Mandat personnalisé",
  unknown: "À confirmer",
};

export default async function InstitutionalClientReviewPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const p = await searchParams;

  const clientRef = clean(p.client_ref, 60);
  const reviewType = clean(p.review_type, 30) || "annual";
  const horizon = clean(p.horizon, 80);
  const objective = clean(p.objective, 1200);
  const liquidity = clean(p.liquidity, 1000);
  const portfolioChanges = clean(p.portfolio_changes, 1200);
  const marketChanges = clean(p.market_changes, 1200);
  const goalProgress = clean(p.goal_progress, 1200);
  const questions = clean(p.questions, 1200);
  const nextActions = clean(p.next_actions, 1200);
  const riskProfile = clean(p.risk_profile, 30) || "unknown";
  const taxContext = clean(p.tax_context, 1000);

  const reviewFields = [
    clientRef,
    horizon,
    objective,
    liquidity,
    portfolioChanges,
    marketChanges,
    goalProgress,
    questions,
    nextActions,
    taxContext,
  ];

  const completed = reviewFields.filter(Boolean).length;
  const hasMemo = completed > 0;

  const readiness =
    completed >= 8
      ? "Dossier bien préparé"
      : completed >= 5
        ? "Préparation partielle"
        : "Informations à compléter";

  return (
    <main
      className={styles.shell}
      data-testid="institutional-client-review-center"
    >
      <header className={styles.hero}>
        <div>
          <Link href="/institutionnel">← Command Center</Link>
          <span>ANATOLE INSTITUTIONAL · WEALTH & CLIENT</span>
          <h1>Client Review & Reporting Center</h1>
          <p>
            Prépare une revue client structurée sans mélanger données,
            objectifs, changements de portefeuille et explication pédagogique.
            Utilise une référence interne ou un alias seulement : cette V1
            partage le brouillon via l&apos;URL et n&apos;est pas un CRM sécurisé.
          </p>
        </div>

        <aside>
          <strong>No client PII in V1</strong>
          <span>
            N&apos;entre pas de nom complet, numéro de compte, NAS ou autre
            donnée personnelle sensible dans ce prototype partageable.
          </span>
        </aside>
      </header>

      <nav className={styles.nav}>
        <Link href="/assistant">Anatole Conseil →</Link>
        <Link href="/comparateur">Portfolio Proposal Lab →</Link>
        <Link href="/portefeuille">Portefeuille →</Link>
        <Link href="/institutionnel/attribution">Attribution →</Link>
        <Link href="/institutionnel/gouvernance">Gouvernance →</Link>
      </nav>

      <section className={styles.states}>
        <article>
          <b>Client Portfolio Intelligence</b>
          <span>Bridge actif</span>
          <p>Les analyses restent reliées à Anatole Conseil et au portefeuille.</p>
        </article>

        <article>
          <b>Next Review Intelligence</b>
          <span>Bridge V1</span>
          <p>Prépare changements, progression des objectifs et questions à revoir.</p>
        </article>

        <article>
          <b>Personalized Reporting</b>
          <span>Bridge V1</span>
          <p>Produit un mémo de revue à partir des informations fournies.</p>
        </article>

        <article>
          <b>Advisor Book Dashboard</b>
          <span>Roadmap</span>
          <p>La vue multi-clients exige encore une persistance d&apos;équipe sécurisée.</p>
        </article>
      </section>

      <section className={styles.panel}>
        <header>
          <div>
            <span>REVIEW PREP BUILDER</span>
            <h2>Préparer la prochaine revue</h2>
          </div>
          <b>{completed}/10 champs · {readiness}</b>
        </header>

        <form method="get" className={styles.form}>
          <div className={styles.three}>
            <label>
              Référence client / alias
              <input
                name="client_ref"
                defaultValue={clientRef}
                placeholder="CLIENT-042"
                maxLength={60}
                autoComplete="off"
              />
            </label>

            <label>
              Type de revue
              <select name="review_type" defaultValue={reviewType}>
                <option value="annual">Revue annuelle</option>
                <option value="quarterly">Revue trimestrielle</option>
                <option value="event">Revue déclenchée par événement</option>
                <option value="onboarding">Préparation onboarding</option>
              </select>
            </label>

            <label>
              Horizon
              <input
                name="horizon"
                defaultValue={horizon}
                placeholder="5-10 ans"
                maxLength={80}
              />
            </label>
          </div>

          <div className={styles.two}>
            <label>
              Objectif principal
              <textarea
                name="objective"
                defaultValue={objective}
                rows={4}
                placeholder="Objectif formulé sans information personnelle sensible."
              />
            </label>

            <label>
              Liquidité / besoins à court terme
              <textarea
                name="liquidity"
                defaultValue={liquidity}
                rows={4}
                placeholder="Besoins de liquidité, retraits planifiés, réserve..."
              />
            </label>
          </div>

          <label>
            Profil de risque à confirmer
            <select name="risk_profile" defaultValue={riskProfile}>
              <option value="unknown">À confirmer</option>
              <option value="conservative">Conservateur</option>
              <option value="balanced">Équilibré</option>
              <option value="growth">Croissance</option>
              <option value="custom">Mandat personnalisé</option>
            </select>
          </label>

          <div className={styles.two}>
            <label>
              Changements du portefeuille
              <textarea
                name="portfolio_changes"
                defaultValue={portfolioChanges}
                rows={4}
                placeholder="Allocation, risque, performance, contributions, retraits..."
              />
            </label>

            <label>
              Changements marché / macro pertinents
              <textarea
                name="market_changes"
                defaultValue={marketChanges}
                rows={4}
                placeholder="Éléments sourcés dans Anatole qui méritent une explication."
              />
            </label>
          </div>

          <div className={styles.two}>
            <label>
              Progrès vers les objectifs
              <textarea
                name="goal_progress"
                defaultValue={goalProgress}
                rows={4}
                placeholder="Ce qui a progressé, stagné ou doit être revu."
              />
            </label>

            <label>
              Questions pour la prochaine rencontre
              <textarea
                name="questions"
                defaultValue={questions}
                rows={4}
                placeholder="Questions à confirmer avec le client."
              />
            </label>
          </div>

          <div className={styles.two}>
            <label>
              Contexte fiscal à valider
              <textarea
                name="tax_context"
                defaultValue={taxContext}
                rows={4}
                placeholder="Contexte général uniquement; pas de conseil fiscal automatisé."
              />
            </label>

            <label>
              Prochaines actions
              <textarea
                name="next_actions"
                defaultValue={nextActions}
                rows={4}
                placeholder="Analyses, documents, suivis ou confirmations nécessaires."
              />
            </label>
          </div>

          <div className={styles.actions}>
            <button type="submit">Générer le mémo de revue</button>
            <Link href="/institutionnel/clients">Effacer</Link>
          </div>
        </form>
      </section>

      {hasMemo ? (
        <section
          className={styles.memo}
          data-testid="institutional-client-review-memo"
        >
          <header>
            <div>
              <span>CLIENT REVIEW MEMO</span>
              <h2>{clientRef || "Référence non fournie"}</h2>
            </div>

            <div className={styles.badges}>
              <b>{REVIEW_LABELS[reviewType] ?? REVIEW_LABELS.annual}</b>
              <b>{RISK_LABELS[riskProfile] ?? RISK_LABELS.unknown}</b>
              <b>{readiness}</b>
            </div>
          </header>

          <div className={styles.meta}>
            <article>
              <span>HORIZON</span>
              <strong>{horizon || "N/D"}</strong>
            </article>

            <article>
              <span>OBJECTIF</span>
              <strong>{objective || "N/D"}</strong>
            </article>

            <article>
              <span>LIQUIDITÉ</span>
              <strong>{liquidity || "N/D"}</strong>
            </article>
          </div>

          <div className={styles.grid}>
            <article>
              <span>CHANGEMENTS PORTEFEUILLE</span>
              <p>{portfolioChanges || "N/D"}</p>
            </article>

            <article>
              <span>MARCHÉ / MACRO</span>
              <p>{marketChanges || "N/D"}</p>
            </article>

            <article>
              <span>PROGRÈS OBJECTIFS</span>
              <p>{goalProgress || "N/D"}</p>
            </article>

            <article>
              <span>QUESTIONS</span>
              <p>{questions || "N/D"}</p>
            </article>

            <article>
              <span>CONTEXTE FISCAL À VALIDER</span>
              <p>{taxContext || "N/D"}</p>
            </article>

            <article>
              <span>PROCHAINES ACTIONS</span>
              <p>{nextActions || "N/D"}</p>
            </article>
          </div>

          <footer>
            <span>
              Ce mémo V1 est préparatoire. Il ne remplace ni le KYC, ni la
              convenance, ni une recommandation personnalisée, ni un dossier
              CRM durable. Les informations marché doivent être vérifiées dans
              les modules Anatole correspondants.
            </span>

            <div>
              <Link href="/assistant">Préparer l&apos;explication →</Link>
              <Link href="/comparateur">Comparer une proposition →</Link>
            </div>
          </footer>
        </section>
      ) : (
        <section className={styles.empty}>
          <b>Aucune revue préparée.</b>
          <span>
            Utilise un alias client et complète les éléments nécessaires à la
            prochaine rencontre.
          </span>
        </section>
      )}
    </main>
  );
}
