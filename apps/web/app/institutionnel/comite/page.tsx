import Link from "next/link";

import styles from "./page.module.css";

type SearchParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function clean(
  value: string | string[] | undefined,
  maxLength: number,
): string {
  return first(value).trim().slice(0, maxLength);
}

function symbolValue(
  value: string | string[] | undefined,
): string {
  return clean(value, 20)
    .toUpperCase()
    .replace(/\.TO$/, "")
    .replace(/[^A-Z0-9.^-]/g, "")
    .slice(0, 15);
}

const DECISIONS: Record<string, string> = {
  review: "À revoir",
  approve: "Approuvée par le comité",
  reject: "Rejetée par le comité",
  hold: "Décision différée",
  watch: "Maintenir sous surveillance",
};

export default async function InstitutionalCommitteePage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;

  const symbol = symbolValue(params.symbol);
  const analyst = clean(params.analyst, 80);
  const pm = clean(params.pm, 80);
  const riskOwner = clean(params.risk_owner, 80);
  const thesis = clean(params.thesis, 1200);
  const evidence = clean(params.evidence, 1200);
  const riskReview = clean(params.risk_review, 1200);
  const constraints = clean(params.constraints, 1000);
  const dissent = clean(params.dissent, 1000);
  const decision = clean(params.decision, 20) || "review";
  const rationale = clean(params.rationale, 1400);
  const followUp = clean(params.follow_up, 1000);

  const fields = [
    symbol,
    analyst,
    pm,
    riskOwner,
    thesis,
    evidence,
    riskReview,
    constraints,
    rationale,
    followUp,
  ];

  const completed = fields.filter(Boolean).length;
  const decisionLabel = DECISIONS[decision] ?? DECISIONS.review;
  const hasMemo = completed > 0;
  const ready =
    Boolean(symbol) &&
    Boolean(thesis) &&
    Boolean(evidence) &&
    Boolean(riskReview) &&
    Boolean(rationale);

  return (
    <main
      className={styles.shell}
      data-testid="institutional-committee-center"
    >
      <header className={styles.hero}>
        <div>
          <Link href="/institutionnel" className={styles.back}>
            ← Command Center
          </Link>
          <span className={styles.kicker}>
            ANATOLE INSTITUTIONAL · INVESTMENT COMMITTEE
          </span>
          <h1>Investment Committee & Governance</h1>
          <p>
            Formalise le passage analyste → PM → risque → décision. Anatole
            structure le dossier et les preuves; la décision demeure celle des
            personnes responsables du mandat.
          </p>
        </div>

        <aside className={styles.truth}>
          <strong>Human decision required</strong>
          <span>
            V1 ne décide pas, ne vote pas et n&apos;approuve aucune transaction.
            Elle prépare un mémo structuré à partir des informations saisies par
            l&apos;équipe.
          </span>
        </aside>
      </header>

      <section className={styles.commandStrip}>
        <Link href="/institutionnel/recherche">Research & Thesis →</Link>
        <Link href="/institutionnel/risque">Risk Center →</Link>
        <Link href="/institutionnel/construction">Construction / Pre-Trade →</Link>
        <Link href="/portefeuille">Portefeuille →</Link>
        <Link href="/institutionnel/gouvernance">
          Data Governance →
        </Link>
        <Link href="/parametres?section=quality">Qualité des données →</Link>
        {symbol ? (
          <Link href={`/focus/${encodeURIComponent(symbol)}`}>
            Focus {symbol} →
          </Link>
        ) : null}
      </section>

      <div className={styles.layout}>
        <section className={styles.panel}>
          <header className={styles.panelHeader}>
            <div>
              <span className={styles.kicker}>COMMITTEE PACK</span>
              <h2>Préparer la décision</h2>
            </div>
            <span className={ready ? styles.ready : styles.counter}>
              {ready ? "Prêt pour revue" : `${completed}/10 champs`}
            </span>
          </header>

          <form method="get" className={styles.form}>
            <div className={styles.rowThree}>
              <label>
                <span>Titre</span>
                <input
                  name="symbol"
                  defaultValue={symbol}
                  placeholder="RY, SHOP, MDA..."
                  maxLength={15}
                  autoComplete="off"
                />
              </label>

              <label>
                <span>Analyste</span>
                <input
                  name="analyst"
                  defaultValue={analyst}
                  placeholder="Nom / équipe"
                  maxLength={80}
                />
              </label>

              <label>
                <span>PM responsable</span>
                <input
                  name="pm"
                  defaultValue={pm}
                  placeholder="Nom / desk"
                  maxLength={80}
                />
              </label>
            </div>

            <label>
              <span>Responsable risque</span>
              <input
                name="risk_owner"
                defaultValue={riskOwner}
                placeholder="Nom / fonction"
                maxLength={80}
              />
            </label>

            <label>
              <span>Thèse présentée au comité</span>
              <textarea
                name="thesis"
                defaultValue={thesis}
                placeholder="Quelle est l'hypothèse centrale soumise au comité?"
                maxLength={1200}
                rows={5}
              />
            </label>

            <div className={styles.rowTwo}>
              <label>
                <span>Preuves et sources examinées</span>
                <textarea
                  name="evidence"
                  defaultValue={evidence}
                  placeholder="Filings, résultats, données de marché, comparables, macro, sources internes..."
                  maxLength={1200}
                  rows={5}
                />
              </label>

              <label>
                <span>Lecture du risque</span>
                <textarea
                  name="risk_review"
                  defaultValue={riskReview}
                  placeholder="Concentration, drawdown, corrélations, scénarios, limites..."
                  maxLength={1200}
                  rows={5}
                />
              </label>
            </div>

            <div className={styles.rowTwo}>
              <label>
                <span>Mandat et contraintes</span>
                <textarea
                  name="constraints"
                  defaultValue={constraints}
                  placeholder="Limites de concentration, liquidité, secteurs, devise, cash..."
                  maxLength={1000}
                  rows={4}
                />
              </label>

              <label>
                <span>Objections / opinion dissidente</span>
                <textarea
                  name="dissent"
                  defaultValue={dissent}
                  placeholder="Quels désaccords ou risques non résolus doivent rester visibles?"
                  maxLength={1000}
                  rows={4}
                />
              </label>
            </div>

            <div className={styles.rowTwo}>
              <label>
                <span>Décision humaine</span>
                <select name="decision" defaultValue={decision}>
                  <option value="review">À revoir</option>
                  <option value="approve">Approuvée par le comité</option>
                  <option value="reject">Rejetée par le comité</option>
                  <option value="hold">Décision différée</option>
                  <option value="watch">Maintenir sous surveillance</option>
                </select>
              </label>

              <label>
                <span>Suivi requis</span>
                <textarea
                  name="follow_up"
                  defaultValue={followUp}
                  placeholder="Prochaine revue, catalyseur, information manquante, contrôle..."
                  maxLength={1000}
                  rows={4}
                />
              </label>
            </div>

            <label>
              <span>Motifs de la décision</span>
              <textarea
                name="rationale"
                defaultValue={rationale}
                placeholder="Pourquoi le comité a-t-il pris cette décision, au regard des preuves et du risque?"
                maxLength={1400}
                rows={5}
              />
            </label>

            <div className={styles.actions}>
              <button type="submit">
                Générer le mémo comité
              </button>
              <Link href="/institutionnel/comite">
                Effacer
              </Link>
            </div>
          </form>
        </section>

        <aside className={styles.side}>
          <section className={styles.sidePanel}>
            <span className={styles.kicker}>GOVERNANCE GATE</span>
            <h2>Contrôles avant décision</h2>

            <div className={styles.checks}>
              <div>
                <strong>Thèse explicitée</strong>
                <span>{thesis ? "Oui" : "À compléter"}</span>
              </div>
              <div>
                <strong>Preuves documentées</strong>
                <span>{evidence ? "Oui" : "À compléter"}</span>
              </div>
              <div>
                <strong>Risque revu</strong>
                <span>{riskReview ? "Oui" : "À compléter"}</span>
              </div>
              <div>
                <strong>Responsables identifiés</strong>
                <span>{analyst && pm ? "Oui" : "À compléter"}</span>
              </div>
              <div>
                <strong>Motifs consignés</strong>
                <span>{rationale ? "Oui" : "À compléter"}</span>
              </div>
            </div>
          </section>

          <section className={styles.sidePanel}>
            <span className={styles.kicker}>AUDITABILITY V1</span>
            <h2>Ce que V1 garantit</h2>
            <ul>
              <li>Les champs du mémo sont explicitement visibles.</li>
              <li>La décision affichée provient de la sélection humaine.</li>
              <li>Les limites et opinions dissidentes restent séparées.</li>
              <li>Les sources opérationnelles restent accessibles dans Anatole.</li>
              <li>
                La persistance durable, les signatures et les rôles d&apos;équipe
                restent à industrialiser.
              </li>
            </ul>
          </section>

          <section className={styles.sidePanel}>
            <span className={styles.kicker}>NEXT GOVERNANCE LAYER</span>
            <h2>À industrialiser</h2>
            <div className={styles.statusList}>
              <div>
                <strong>Historique immuable</strong>
                <span>Fondation</span>
              </div>
              <div>
                <strong>RBAC / approbations</strong>
                <span>Fondation</span>
              </div>
              <div>
                <strong>Version des modèles</strong>
                <span>Fondation</span>
              </div>
              <div>
                <strong>Signature / horodatage serveur</strong>
                <span>Fondation</span>
              </div>
            </div>
          </section>
        </aside>
      </div>

      {hasMemo ? (
        <section
          className={styles.memo}
          data-testid="institutional-committee-memo"
        >
          <header>
            <div>
              <span className={styles.kicker}>DECISION MEMO</span>
              <h2>{symbol || "Dossier sans ticker"}</h2>
            </div>
            <div className={styles.badges}>
              <span>{decisionLabel}</span>
              <span>{completed}/10</span>
              <span>{ready ? "Ready" : "Draft"}</span>
            </div>
          </header>

          <div className={styles.metaGrid}>
            <article>
              <span>ANALYSTE</span>
              <strong>{analyst || "N/D"}</strong>
            </article>
            <article>
              <span>PM</span>
              <strong>{pm || "N/D"}</strong>
            </article>
            <article>
              <span>RISQUE</span>
              <strong>{riskOwner || "N/D"}</strong>
            </article>
            <article>
              <span>DÉCISION</span>
              <strong>{decisionLabel}</strong>
            </article>
          </div>

          <div className={styles.memoGrid}>
            <article>
              <span>THÈSE</span>
              <p>{thesis || "N/D"}</p>
            </article>
            <article>
              <span>PREUVES / SOURCES</span>
              <p>{evidence || "N/D"}</p>
            </article>
            <article>
              <span>RISQUE</span>
              <p>{riskReview || "N/D"}</p>
            </article>
            <article>
              <span>MANDAT / CONTRAINTES</span>
              <p>{constraints || "N/D"}</p>
            </article>
            <article>
              <span>OPINION DISSIDENTE</span>
              <p>{dissent || "Aucune consignée"}</p>
            </article>
            <article>
              <span>MOTIFS DE LA DÉCISION</span>
              <p>{rationale || "N/D"}</p>
            </article>
            <article className={styles.full}>
              <span>SUIVI</span>
              <p>{followUp || "N/D"}</p>
            </article>
          </div>

          <footer>
            <span>
              Mémo V1 partageable via l&apos;URL. Il ne constitue pas encore une
              piste d&apos;audit immuable ni une approbation cryptographiquement
              signée.
            </span>
            <div>
              <Link href="/institutionnel/recherche">Revoir la thèse →</Link>
              <Link href="/institutionnel/risque">Revoir le risque →</Link>
              <Link href={symbol ? `/institutionnel/attribution?symbol=${encodeURIComponent(symbol)}` : "/institutionnel/attribution"}>
                Préparer le post-mortem →
              </Link>
            </div>
          </footer>
        </section>
      ) : (
        <section className={styles.emptyMemo}>
          <strong>Aucun dossier comité structuré pour le moment.</strong>
          <span>
            Complète le formulaire pour produire un mémo de décision sans
            inventer d&apos;approbation, de source ou de conclusion.
          </span>
        </section>
      )}
    </main>
  );
}
