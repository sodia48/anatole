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

export default async function InstitutionalResearchPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;

  const symbol = symbolValue(params.symbol);
  const stance = clean(params.stance, 16) || "watch";
  const horizon = clean(params.horizon, 40);
  const thesis = clean(params.thesis, 1200);
  const catalysts = clean(params.catalysts, 1000);
  const risks = clean(params.risks, 1000);
  const invalidation = clean(params.invalidation, 1000);
  const monitoring = clean(params.monitoring, 1000);

  const draftFields = [
    symbol,
    horizon,
    thesis,
    catalysts,
    risks,
    invalidation,
    monitoring,
  ];
  const completed = draftFields.filter(Boolean).length;
  const hasDraft = completed > 0;

  const stanceLabels: Record<string, string> = {
    long: "Long / haussière",
    short: "Short / baissière",
    neutral: "Neutre",
    watch: "À surveiller",
  };
  const stanceLabel = stanceLabels[stance] ?? stance;

  return (
    <main
      className={styles.shell}
      data-testid="institutional-research-center"
    >
      <header className={styles.hero}>
        <div>
          <Link href="/institutionnel" className={styles.back}>
            ← Command Center
          </Link>
          <span className={styles.kicker}>
            ANATOLE INSTITUTIONAL · RESEARCH & THESIS
          </span>
          <h1>Research & Thesis Center</h1>
          <p>
            Structure une thèse, ses catalyseurs, ses risques et ses conditions
            d&apos;invalidation avant de passer à l&apos;exécution. V1 ne crée
            aucune conclusion de marché : elle formalise le raisonnement et
            relie les outils Anatole déjà disponibles.
          </p>
        </div>

        <aside className={styles.truth}>
          <strong>Evidence first</strong>
          <span>
            Les champs ci-dessous proviennent de l&apos;analyste. Les données de
            marché restent dans Focus, Actualités, Calendrier et les autres
            modules sourcés.
          </span>
        </aside>
      </header>

      <section className={styles.commandStrip}>
        <Link href={symbol ? `/focus/${encodeURIComponent(symbol)}` : "/focus/RY"}>
          Focus {symbol || "titre"} →
        </Link>
        <Link href="/actualites">Actualités →</Link>
        <Link href="/calendrier">Calendrier →</Link>
        <Link href="/assistant">Copilote recherche →</Link>
        <Link
          href={
            symbol
              ? `/institutionnel/recherche/monitoring?symbol=${encodeURIComponent(symbol)}`
              : "/institutionnel/recherche/monitoring"
          }
        >
          Thesis Monitor & Consensus →
        </Link>
        <Link href="/institutionnel/comite">
          Comité d&apos;investissement →
        </Link>
      </section>

      <div className={styles.layout}>
        <section className={styles.panel}>
          <header className={styles.panelHeader}>
            <div>
              <span className={styles.kicker}>THESIS BUILDER</span>
              <h2>Formaliser la décision</h2>
            </div>
            <span className={styles.counter}>
              {completed}/7 champs structurés
            </span>
          </header>

          <form method="get" className={styles.form}>
            <div className={styles.row}>
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
                <span>Positionnement</span>
                <select name="stance" defaultValue={stance}>
                  <option value="watch">À surveiller</option>
                  <option value="long">Long / haussière</option>
                  <option value="short">Short / baissière</option>
                  <option value="neutral">Neutre</option>
                </select>
              </label>

              <label>
                <span>Horizon</span>
                <input
                  name="horizon"
                  defaultValue={horizon}
                  placeholder="6-12 mois"
                  maxLength={40}
                />
              </label>
            </div>

            <label>
              <span>Thèse centrale</span>
              <textarea
                name="thesis"
                defaultValue={thesis}
                placeholder="Quel mécanisme économique ou opérationnel soutient la thèse?"
                maxLength={1200}
                rows={5}
              />
            </label>

            <div className={styles.rowTwo}>
              <label>
                <span>Catalyseurs</span>
                <textarea
                  name="catalysts"
                  defaultValue={catalysts}
                  placeholder="Résultats, contrats, guidance, réglementation, refinancement..."
                  maxLength={1000}
                  rows={5}
                />
              </label>

              <label>
                <span>Risques principaux</span>
                <textarea
                  name="risks"
                  defaultValue={risks}
                  placeholder="Qu'est-ce qui pourrait dégrader le cas d'investissement?"
                  maxLength={1000}
                  rows={5}
                />
              </label>
            </div>

            <div className={styles.rowTwo}>
              <label>
                <span>Condition d&apos;invalidation</span>
                <textarea
                  name="invalidation"
                  defaultValue={invalidation}
                  placeholder="Quel fait observable invaliderait explicitement la thèse?"
                  maxLength={1000}
                  rows={5}
                />
              </label>

              <label>
                <span>Variables à surveiller</span>
                <textarea
                  name="monitoring"
                  defaultValue={monitoring}
                  placeholder="KPI, marges, volumes, taux, matières premières, consensus..."
                  maxLength={1000}
                  rows={5}
                />
              </label>
            </div>

            <div className={styles.actions}>
              <button type="submit">
                Générer le mémo de thèse
              </button>
              <Link href="/institutionnel/recherche">
                Effacer
              </Link>
            </div>
          </form>
        </section>

        <aside className={styles.side}>
          <section className={styles.sidePanel}>
            <span className={styles.kicker}>WORKFLOW</span>
            <h2>Du signal à la décision</h2>
            <ol>
              <li>
                <strong>1. Hypothèse</strong>
                <span>Définir ce qui doit être vrai.</span>
              </li>
              <li>
                <strong>2. Preuve</strong>
                <span>Vérifier dans Focus et les sources Anatole.</span>
              </li>
              <li>
                <strong>3. Catalyseur</strong>
                <span>Identifier ce qui peut faire évoluer le dossier.</span>
              </li>
              <li>
                <strong>4. Invalidation</strong>
                <span>Décider à l&apos;avance ce qui briserait la thèse.</span>
              </li>
              <li>
                <strong>5. Monitoring</strong>
                <span>Relier les variables aux modules de suivi.</span>
              </li>
            </ol>
          </section>

          <section className={styles.sidePanel}>
            <span className={styles.kicker}>THESIS MONITOR V1</span>
            <h2>Ce qui est réellement actif</h2>
            <div className={styles.statusList}>
              <div>
                <strong>Structure de thèse</strong>
                <span>Actif</span>
              </div>
              <div>
                <strong>Focus par titre</strong>
                <span>Actif</span>
              </div>
              <div>
                <strong>Actualités / événements</strong>
                <span>Actif</span>
              </div>
              <div>
                <strong>Détection automatique de rupture</strong>
                <span>Fondation</span>
              </div>
              <div>
                <strong>Journal partagé / approbations</strong>
                <span>À industrialiser</span>
              </div>
            </div>
          </section>
        </aside>
      </div>

      {hasDraft ? (
        <section
          className={styles.memo}
          data-testid="institutional-thesis-memo"
        >
          <header>
            <div>
              <span className={styles.kicker}>INVESTMENT THESIS MEMO</span>
              <h2>{symbol || "Thèse sans ticker"}</h2>
            </div>
            <div className={styles.badges}>
              <span>{stanceLabel}</span>
              <span>{horizon || "Horizon N/D"}</span>
              <span>{completed}/7</span>
            </div>
          </header>

          <div className={styles.memoGrid}>
            <article>
              <span>THÈSE</span>
              <p>{thesis || "N/D"}</p>
            </article>
            <article>
              <span>CATALYSEURS</span>
              <p>{catalysts || "N/D"}</p>
            </article>
            <article>
              <span>RISQUES</span>
              <p>{risks || "N/D"}</p>
            </article>
            <article>
              <span>INVALIDATION</span>
              <p>{invalidation || "N/D"}</p>
            </article>
            <article className={styles.full}>
              <span>VARIABLES À SURVEILLER</span>
              <p>{monitoring || "N/D"}</p>
            </article>
          </div>

          <footer>
            <span>
              V1 mémorise le brouillon dans l&apos;URL de cette page uniquement.
              La persistance compte/équipe et la détection automatique de rupture
              feront l&apos;objet de la prochaine couche.
            </span>
            <div>
              {symbol ? (
                <Link href={`/focus/${encodeURIComponent(symbol)}`}>
                  Vérifier {symbol} dans Focus →
                </Link>
              ) : null}
              <Link
                href={
                  symbol
                    ? `/institutionnel/comite?symbol=${encodeURIComponent(symbol)}&thesis=${encodeURIComponent(thesis)}`
                    : "/institutionnel/comite"
                }
              >
                Préparer le comité →
              </Link>
            </div>
          </footer>
        </section>
      ) : (
        <section className={styles.emptyMemo}>
          <strong>Aucune thèse structurée pour le moment.</strong>
          <span>
            Remplis le Thesis Builder : Anatole produira un mémo sans inventer
            de données ni de recommandation.
          </span>
        </section>
      )}
    </main>
  );
}
