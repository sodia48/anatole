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

const EVIDENCE_LABELS: Record<string, string> = {
  research: "Recherche / thèse",
  risk: "Risque",
  committee: "Comité d'investissement",
  model: "Modèle / calcul",
  market: "Donnée de marché",
  macro: "Macro / économie",
};

export default async function InstitutionalGovernancePage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;

  const subject = symbolValue(params.subject);
  const evidenceType = clean(params.evidence_type, 24) || "research";
  const source = clean(params.source, 160);
  const provider = clean(params.provider, 120);
  const observedAt = clean(params.observed_at, 80);
  const transformation = clean(params.transformation, 1200);
  const freshness = clean(params.freshness, 120);
  const modelVersion = clean(params.model_version, 120);
  const owner = clean(params.owner, 120);
  const decisionRef = clean(params.decision_ref, 160);
  const limitations = clean(params.limitations, 1200);
  const missingData = clean(params.missing_data, 1200);

  const fields = [
    source,
    provider,
    observedAt,
    transformation,
    freshness,
    modelVersion,
    owner,
    limitations,
    missingData,
  ];

  const completed = fields.filter(Boolean).length;
  const evidenceLabel =
    EVIDENCE_LABELS[evidenceType] ?? EVIDENCE_LABELS.research;
  const hasPack = completed > 0 || Boolean(subject) || Boolean(decisionRef);

  return (
    <main
      className={styles.shell}
      data-testid="institutional-governance-center"
    >
      <header className={styles.hero}>
        <div>
          <Link href="/institutionnel" className={styles.back}>
            ← Command Center
          </Link>
          <span className={styles.kicker}>
            ANATOLE INSTITUTIONAL · DATA & GOVERNANCE
          </span>
          <h1>Data Governance & Explainability</h1>
          <p>
            Relie chaque décision aux données, aux transformations, aux limites
            et aux responsables qui la soutiennent. Anatole distingue
            explicitement les ponts déjà actifs des fondations qui ne sont pas
            encore une piste d&apos;audit immuable.
          </p>
        </div>

        <aside className={styles.truth}>
          <strong>Traceable, not theatrical</strong>
          <span>
            Une donnée sans source ou une transformation non documentée reste
            visible comme lacune. V1 ne fabrique ni provenance, ni approbation,
            ni certification de conformité.
          </span>
        </aside>
      </header>

      <section className={styles.commandStrip}>
        <Link href="/parametres?section=quality">
          Qualité des données live →
        </Link>
        <Link href="/institutionnel/comite">
          Comité & décisions →
        </Link>
        <Link href="/institutionnel/recherche">
          Research & Thesis →
        </Link>
        <Link href="/institutionnel/risque">
          Risk Center →
        </Link>
        <Link href="/institutionnel/enterprise">
          Enterprise Platform →
        </Link>
      </section>

      <section className={styles.statusGrid}>
        <article>
          <span>SOURCE LINEAGE</span>
          <strong>Bridge actif</strong>
          <p>
            La vue Qualité expose fournisseur, fraîcheur, couverture et état
            des principales sources Anatole.
          </p>
          <Link href="/parametres?section=quality">
            Ouvrir la qualité →
          </Link>
        </article>

        <article>
          <span>DATA CONFIDENCE</span>
          <strong>Bridge actif</strong>
          <p>
            Le score de qualité mesure fraîcheur, cohérence, disponibilité et
            incidents de données, sans noter l&apos;investissement.
          </p>
          <Link href="/parametres?section=quality">
            Vérifier le score →
          </Link>
        </article>

        <article>
          <span>DECISION AUDIT</span>
          <strong>Fondation structurée</strong>
          <p>
            Le Comité conserve déjà thèse, preuves, risque, contraintes,
            objections, décision humaine et motifs dans un mémo partageable.
          </p>
          <Link href="/institutionnel/comite">
            Ouvrir le comité →
          </Link>
        </article>

        <article>
          <span>MODEL GOVERNANCE</span>
          <strong>Fondation</strong>
          <p>
            Le champ version du modèle peut être documenté ici; registre
            immuable, approbations et signatures serveur restent à construire.
          </p>
        </article>

        <article>
          <span>COMPLIANCE EVIDENCE</span>
          <strong>Roadmap</strong>
          <p>
            La preuve réglementaire durable exige conservation, droits,
            politiques, horodatage serveur et contrôles d&apos;organisation.
          </p>
        </article>

        <article>
          <span>EXPLAINABILITY</span>
          <strong>Bridge actif</strong>
          <p>
            Les surfaces institutionnelles affichent leurs sources, méthodes,
            limites ou N/D au lieu de masquer les informations manquantes.
          </p>
        </article>
      </section>

      <div className={styles.layout}>
        <section className={styles.panel}>
          <header className={styles.panelHeader}>
            <div>
              <span className={styles.kicker}>EVIDENCE PACK BUILDER</span>
              <h2>Documenter la chaîne de preuve</h2>
            </div>
            <span className={styles.counter}>
              {completed}/9 métadonnées
            </span>
          </header>

          <form method="get" className={styles.form}>
            <div className={styles.rowThree}>
              <label>
                <span>Titre / sujet</span>
                <input
                  name="subject"
                  defaultValue={subject}
                  placeholder="RY, SHOP, MDA..."
                  maxLength={15}
                  autoComplete="off"
                />
              </label>

              <label>
                <span>Type de preuve</span>
                <select name="evidence_type" defaultValue={evidenceType}>
                  <option value="research">Recherche / thèse</option>
                  <option value="risk">Risque</option>
                  <option value="committee">Comité d&apos;investissement</option>
                  <option value="model">Modèle / calcul</option>
                  <option value="market">Donnée de marché</option>
                  <option value="macro">Macro / économie</option>
                </select>
              </label>

              <label>
                <span>Référence décision</span>
                <input
                  name="decision_ref"
                  defaultValue={decisionRef}
                  placeholder="IC-2026-09-27-001"
                  maxLength={160}
                />
              </label>
            </div>

            <div className={styles.rowTwo}>
              <label>
                <span>Source</span>
                <input
                  name="source"
                  defaultValue={source}
                  placeholder="Document, API, filing, StatCan..."
                  maxLength={160}
                />
              </label>

              <label>
                <span>Fournisseur / propriétaire</span>
                <input
                  name="provider"
                  defaultValue={provider}
                  placeholder="TMX, StatCan, équipe interne..."
                  maxLength={120}
                />
              </label>
            </div>

            <div className={styles.rowThree}>
              <label>
                <span>Date / heure observée</span>
                <input
                  name="observed_at"
                  defaultValue={observedAt}
                  placeholder="2026-09-27 15:45 ET"
                  maxLength={80}
                />
              </label>

              <label>
                <span>Fraîcheur attendue</span>
                <input
                  name="freshness"
                  defaultValue={freshness}
                  placeholder="Temps réel, quotidien, trimestriel..."
                  maxLength={120}
                />
              </label>

              <label>
                <span>Version du modèle / calcul</span>
                <input
                  name="model_version"
                  defaultValue={modelVersion}
                  placeholder="portfolio-risk-v1"
                  maxLength={120}
                />
              </label>
            </div>

            <label>
              <span>Responsable / owner</span>
              <input
                name="owner"
                defaultValue={owner}
                placeholder="Équipe, analyste, PM, risque..."
                maxLength={120}
              />
            </label>

            <label>
              <span>Transformation / méthodologie</span>
              <textarea
                name="transformation"
                defaultValue={transformation}
                placeholder="Quelles transformations, hypothèses ou calculs ont été appliqués?"
                maxLength={1200}
                rows={5}
              />
            </label>

            <div className={styles.rowTwo}>
              <label>
                <span>Limites connues</span>
                <textarea
                  name="limitations"
                  defaultValue={limitations}
                  placeholder="Biais, licence, couverture, approximation, latence..."
                  maxLength={1200}
                  rows={5}
                />
              </label>

              <label>
                <span>Données manquantes</span>
                <textarea
                  name="missing_data"
                  defaultValue={missingData}
                  placeholder="Qu'est-ce qui manque encore pour renforcer la conclusion?"
                  maxLength={1200}
                  rows={5}
                />
              </label>
            </div>

            <div className={styles.actions}>
              <button type="submit">
                Générer le pack de preuve
              </button>
              <Link href="/institutionnel/gouvernance">
                Effacer
              </Link>
            </div>
          </form>
        </section>

        <aside className={styles.side}>
          <section className={styles.sidePanel}>
            <span className={styles.kicker}>EVIDENCE CHAIN</span>
            <h2>De la donnée à la décision</h2>
            <ol>
              <li>
                <strong>1. Source</strong>
                <span>Qui produit la donnée et quand?</span>
              </li>
              <li>
                <strong>2. Transformation</strong>
                <span>Quel calcul ou traitement a été appliqué?</span>
              </li>
              <li>
                <strong>3. Limites</strong>
                <span>Quelle couverture manque ou peut biaiser la lecture?</span>
              </li>
              <li>
                <strong>4. Modèle</strong>
                <span>Quelle version a produit la métrique?</span>
              </li>
              <li>
                <strong>5. Décision</strong>
                <span>À quel dossier ou mémo cette preuve est-elle reliée?</span>
              </li>
            </ol>
          </section>

          <section className={styles.sidePanel}>
            <span className={styles.kicker}>ENTERPRISE GAP</span>
            <h2>Ce qui reste à industrialiser</h2>
            <ul>
              <li>Stockage immuable et horodatage serveur.</li>
              <li>RBAC, approbations et séparation des rôles.</li>
              <li>Versioning durable des modèles et paramètres.</li>
              <li>Rétention documentaire et politiques de conformité.</li>
              <li>Isolation multi-tenant des données institutionnelles.</li>
            </ul>
          </section>
        </aside>
      </div>

      {hasPack ? (
        <section
          className={styles.memo}
          data-testid="institutional-evidence-pack"
        >
          <header>
            <div>
              <span className={styles.kicker}>EVIDENCE MEMO</span>
              <h2>{subject || "Sujet non précisé"}</h2>
            </div>
            <div className={styles.badges}>
              <span>{evidenceLabel}</span>
              <span>{completed}/9</span>
              <span>{decisionRef || "Référence N/D"}</span>
            </div>
          </header>

          <div className={styles.metaGrid}>
            <article>
              <span>SOURCE</span>
              <strong>{source || "N/D"}</strong>
            </article>
            <article>
              <span>FOURNISSEUR</span>
              <strong>{provider || "N/D"}</strong>
            </article>
            <article>
              <span>OBSERVÉ</span>
              <strong>{observedAt || "N/D"}</strong>
            </article>
            <article>
              <span>FRAÎCHEUR</span>
              <strong>{freshness || "N/D"}</strong>
            </article>
            <article>
              <span>MODÈLE</span>
              <strong>{modelVersion || "N/D"}</strong>
            </article>
            <article>
              <span>OWNER</span>
              <strong>{owner || "N/D"}</strong>
            </article>
          </div>

          <div className={styles.memoGrid}>
            <article>
              <span>TRANSFORMATION / MÉTHODOLOGIE</span>
              <p>{transformation || "N/D"}</p>
            </article>
            <article>
              <span>LIMITES</span>
              <p>{limitations || "N/D"}</p>
            </article>
            <article className={styles.full}>
              <span>DONNÉES MANQUANTES</span>
              <p>{missingData || "Aucune consignée"}</p>
            </article>
          </div>

          <footer>
            <span>
              Ce pack V1 est généré à partir des métadonnées saisies par
              l&apos;utilisateur. Il ne remplace pas une piste d&apos;audit
              immuable, une certification réglementaire ou un registre de
              modèles approuvé.
            </span>
            <div>
              <Link href="/parametres?section=quality">
                Vérifier les sources live →
              </Link>
              <Link href="/institutionnel/comite">
                Relier à une décision →
              </Link>
            </div>
          </footer>
        </section>
      ) : (
        <section className={styles.emptyMemo}>
          <strong>Aucun pack de preuve structuré.</strong>
          <span>
            Documente source, transformation, limites et version du modèle pour
            rendre la chaîne de décision vérifiable.
          </span>
        </section>
      )}
    </main>
  );
}
