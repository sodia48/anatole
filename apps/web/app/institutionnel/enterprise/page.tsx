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

const ENV_LABELS: Record<string, string> = {
  pilot: "Pilote",
  production: "Production",
  sandbox: "Sandbox",
};

const AUTH_LABELS: Record<string, string> = {
  local: "Comptes Anatole actuels",
  oidc: "SSO OIDC requis",
  saml: "SSO SAML requis",
  hybrid: "Hybride",
};

const DATA_LABELS: Record<string, string> = {
  anatole: "Anatole uniquement",
  snowflake: "Snowflake",
  databricks: "Databricks",
  s3: "S3 / object storage",
  mixed: "Architecture mixte",
};

const AI_LABELS: Record<string, string> = {
  standard: "Contexte standard Anatole",
  isolated: "Contexte institutionnel isolé requis",
  disabled: "IA privée désactivée pour données internes",
  review: "Politique à définir",
};

type Gap = {
  label: string;
  ready: boolean;
  note: string;
};

export default async function InstitutionalEnterprisePage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const p = await searchParams;

  const orgAlias = clean(p.org_alias, 80);
  const environment = clean(p.environment, 24) || "pilot";
  const region = clean(p.region, 80);
  const auth = clean(p.auth, 24) || "local";
  const dataPlane = clean(p.data_plane, 24) || "anatole";
  const omsPms = clean(p.oms_pms, 160);
  const crm = clean(p.crm, 160);
  const researchSources = clean(p.research_sources, 1000);
  const retention = clean(p.retention, 120);
  const audit = clean(p.audit, 1000);
  const encryption = clean(p.encryption, 1000);
  const aiPolicy = clean(p.ai_policy, 24) || "review";
  const privateResearch = clean(p.private_research, 1000);
  const apiNeeds = clean(p.api_needs, 1000);
  const notes = clean(p.notes, 1200);

  const gaps: Gap[] = [
    {
      label: "Organisation / tenant",
      ready: Boolean(orgAlias),
      note: orgAlias || "Alias organisation requis",
    },
    {
      label: "Région / résidence",
      ready: Boolean(region),
      note: region || "Exigence à définir",
    },
    {
      label: "Authentification",
      ready: auth !== "local",
      note:
        auth === "local"
          ? "SSO entreprise non configuré"
          : AUTH_LABELS[auth] ?? auth,
    },
    {
      label: "Data plane",
      ready: dataPlane !== "anatole",
      note:
        dataPlane === "anatole"
          ? "Aucun entrepôt institutionnel déclaré"
          : DATA_LABELS[dataPlane] ?? dataPlane,
    },
    {
      label: "OMS / PMS",
      ready: Boolean(omsPms),
      note: omsPms || "Connecteur non défini",
    },
    {
      label: "CRM",
      ready: Boolean(crm),
      note: crm || "Connecteur non défini",
    },
    {
      label: "Rétention",
      ready: Boolean(retention),
      note: retention || "Politique à définir",
    },
    {
      label: "Audit",
      ready: Boolean(audit),
      note: audit || "Exigences de journalisation à définir",
    },
    {
      label: "Chiffrement",
      ready: Boolean(encryption),
      note: encryption || "Exigences à définir",
    },
    {
      label: "IA privée",
      ready: aiPolicy !== "review",
      note: AI_LABELS[aiPolicy] ?? aiPolicy,
    },
  ];

  const completed = gaps.filter((gap) => gap.ready).length;
  const hasPack =
    Boolean(
      orgAlias ||
        region ||
        omsPms ||
        crm ||
        researchSources ||
        retention ||
        audit ||
        encryption ||
        privateResearch ||
        apiNeeds ||
        notes,
    ) ||
    auth !== "local" ||
    dataPlane !== "anatole" ||
    aiPolicy !== "review";

  const readiness =
    completed >= 8
      ? "Architecture largement définie"
      : completed >= 5
        ? "Architecture partiellement définie"
        : "Décisions d'architecture à compléter";

  return (
    <main
      className={styles.shell}
      data-testid="institutional-enterprise-center"
    >
      <header className={styles.hero}>
        <div>
          <Link href="/institutionnel">← Command Center</Link>
          <span>ANATOLE INSTITUTIONAL · ENTERPRISE PLATFORM</span>
          <h1>Enterprise Architecture & Integration Center</h1>
          <p>
            Transforme les capacités #60 à #69 en un plan d&apos;intégration
            vérifiable : API, données, OMS/PMS, CRM, recherche, SSO, résidence,
            audit, coffre privé et contexte IA. Cette V1 documente les exigences;
            elle ne simule pas des connecteurs qui n&apos;existent pas encore.
          </p>
        </div>

        <aside>
          <strong>No secrets in URL</strong>
          <span>
            N&apos;entre aucun token, mot de passe, clé API, secret client,
            certificat ou identifiant sensible dans ce prototype partageable.
          </span>
        </aside>
      </header>

      <nav className={styles.nav}>
        <Link href="/institutionnel/gouvernance">Data Governance →</Link>
        <Link href="/institutionnel/clients">Client Review →</Link>
        <Link href="/institutionnel/recherche">Research →</Link>
        <Link href="/parametres">Paramètres →</Link>
      </nav>

      <section className={styles.matrix}>
        <article><b>#60 Institutional API</b><span>Roadmap</span><p>Contrat public, auth, versioning et quotas restent à formaliser.</p></article>
        <article><b>#61 Data Warehouse</b><span>Roadmap</span><p>Snowflake, Databricks et S3 nécessitent des connecteurs dédiés.</p></article>
        <article><b>#62 OMS / PMS</b><span>Roadmap</span><p>Aucune intégration d&apos;ordres institutionnelle n&apos;est simulée.</p></article>
        <article><b>#63 CRM</b><span>Roadmap</span><p>Le workflow wealth peut être cartographié avant connexion réelle.</p></article>
        <article><b>#64 Research Integrations</b><span>Bridge actif</span><p>Les recherches Anatole existantes servent déjà de socle exploitable.</p></article>
        <article><b>#65 SSO + RBAC</b><span>Roadmap</span><p>Rôles, groupes et permissions entreprise restent à industrialiser.</p></article>
        <article><b>#66 Residency & Encryption</b><span>Roadmap</span><p>Régions, rétention et clés client exigent des choix d&apos;infrastructure.</p></article>
        <article><b>#67 Complete Audit Logs</b><span>Roadmap</span><p>Une piste d&apos;audit durable doit couvrir accès et actions sensibles.</p></article>
        <article><b>#68 Private Research Vault</b><span>Roadmap</span><p>Isolation tenant et stockage privé restent des exigences fortes.</p></article>
        <article><b>#69 Private AI Context</b><span>Roadmap</span><p>Politiques et données internes doivent rester dans un contexte isolé.</p></article>
      </section>

      <section className={styles.panel}>
        <header>
          <div>
            <span>ENTERPRISE READINESS BUILDER</span>
            <h2>Définir l&apos;architecture cible</h2>
          </div>
          <b>{completed}/10 contrôles · {readiness}</b>
        </header>

        <form method="get" className={styles.form}>
          <div className={styles.three}>
            <label>Alias organisation<input name="org_alias" defaultValue={orgAlias} placeholder="INSTITUTION-A" maxLength={80} autoComplete="off" /></label>
            <label>Environnement<select name="environment" defaultValue={environment}><option value="pilot">Pilote</option><option value="sandbox">Sandbox</option><option value="production">Production</option></select></label>
            <label>Région / résidence souhaitée<input name="region" defaultValue={region} placeholder="Canada, Québec, multi-région..." maxLength={80} /></label>
          </div>

          <div className={styles.two}>
            <label>Authentification cible<select name="auth" defaultValue={auth}><option value="local">Comptes Anatole actuels</option><option value="oidc">SSO OIDC requis</option><option value="saml">SSO SAML requis</option><option value="hybrid">Hybride</option></select></label>
            <label>Data plane<select name="data_plane" defaultValue={dataPlane}><option value="anatole">Anatole uniquement</option><option value="snowflake">Snowflake</option><option value="databricks">Databricks</option><option value="s3">S3 / object storage</option><option value="mixed">Architecture mixte</option></select></label>
          </div>

          <div className={styles.two}>
            <label>OMS / PMS cible<input name="oms_pms" defaultValue={omsPms} placeholder="Nom du système ou exigence" maxLength={160} /></label>
            <label>CRM cible<input name="crm" defaultValue={crm} placeholder="Nom du système ou exigence" maxLength={160} /></label>
          </div>

          <label>Sources de recherche autorisées<textarea name="research_sources" defaultValue={researchSources} rows={4} placeholder="TMX, SEDAR+, EDGAR, transcripts, sources propriétaires..." /></label>

          <div className={styles.two}>
            <label>Politique de rétention<textarea name="retention" defaultValue={retention} rows={4} placeholder="Durées, suppressions, archivage, exigences internes..." /></label>
            <label>Exigences d&apos;audit<textarea name="audit" defaultValue={audit} rows={4} placeholder="Accès, modifications, exports, décisions sensibles..." /></label>
          </div>

          <div className={styles.two}>
            <label>Chiffrement / gestion des clés<textarea name="encryption" defaultValue={encryption} rows={4} placeholder="At-rest, in-transit, CMK/BYOK, rotation..." /></label>
            <label>Politique IA privée<select name="ai_policy" defaultValue={aiPolicy}><option value="review">Politique à définir</option><option value="standard">Contexte standard Anatole</option><option value="isolated">Contexte institutionnel isolé requis</option><option value="disabled">IA privée désactivée pour données internes</option></select></label>
          </div>

          <div className={styles.two}>
            <label>Coffre de recherche privé<textarea name="private_research" defaultValue={privateResearch} rows={4} placeholder="Isolation, équipes, documents internes, permissions..." /></label>
            <label>Besoins API<textarea name="api_needs" defaultValue={apiNeeds} rows={4} placeholder="Analytics nécessaires, fréquence, consommateurs, SLA..." /></label>
          </div>

          <label>Notes d&apos;architecture<textarea name="notes" defaultValue={notes} rows={4} placeholder="Dépendances, sécurité, exigences de déploiement..." /></label>

          <div className={styles.actions}>
            <button type="submit">Générer le readiness pack</button>
            <Link href="/institutionnel/enterprise">Effacer</Link>
          </div>
        </form>
      </section>

      {hasPack ? (
        <section className={styles.pack} data-testid="institutional-enterprise-readiness-pack">
          <header>
            <div>
              <span>ENTERPRISE READINESS PACK</span>
              <h2>{orgAlias || "Organisation non définie"}</h2>
            </div>

            <div className={styles.badges}>
              <b>{ENV_LABELS[environment] ?? environment}</b>
              <b>{AUTH_LABELS[auth] ?? auth}</b>
              <b>{DATA_LABELS[dataPlane] ?? dataPlane}</b>
            </div>
          </header>

          <div className={styles.checks}>
            {gaps.map((gap) => (
              <article key={gap.label}>
                <span>{gap.label}</span>
                <strong>{gap.ready ? "Défini" : "À définir"}</strong>
                <p>{gap.note}</p>
              </article>
            ))}
          </div>

          <div className={styles.detailGrid}>
            <article><span>RESEARCH SOURCES</span><p>{researchSources || "N/D"}</p></article>
            <article><span>PRIVATE RESEARCH</span><p>{privateResearch || "N/D"}</p></article>
            <article><span>API NEEDS</span><p>{apiNeeds || "N/D"}</p></article>
            <article><span>ARCHITECTURE NOTES</span><p>{notes || "N/D"}</p></article>
          </div>

          <footer>
            <span>
              Ce pack documente les exigences; il ne certifie ni SSO, ni
              chiffrement, ni résidence, ni audit, ni connectivité OMS/PMS/CRM.
              Chaque capacité doit rester au statut réel tant que son
              infrastructure n&apos;est pas déployée et vérifiée.
            </span>

            <div>
              <Link href="/institutionnel/gouvernance">Revoir gouvernance →</Link>
              <Link href="/institutionnel/recherche">Revoir recherche →</Link>
            </div>
          </footer>
        </section>
      ) : (
        <section className={styles.empty}>
          <b>Aucun readiness pack défini.</b>
          <span>
            Documente les choix d&apos;architecture sans fournir de secrets ni
            simuler d&apos;intégrations inexistantes.
          </span>
        </section>
      )}
    </main>
  );
}
