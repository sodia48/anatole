"use client";

import { GitBranch, ListTree, Network, RefreshCw, ShieldCheck } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { getCompanyNetwork } from "@/lib/api";
import { pick, type AnatoleLanguage } from "@/lib/i18n";
import type { CompanyNetworkNode, CompanyNetworkSnapshot, CompanyRelationship } from "@/lib/types";

import { CompanyNetworkGraph } from "./CompanyNetworkGraph";
import { CompanyValueChain } from "./CompanyValueChain";
import { RelationshipEvidencePanel } from "./RelationshipEvidencePanel";
import { RelationshipPathFinder } from "./RelationshipPathFinder";
import styles from "./CompanyNetwork.module.css";

type Mode = "network" | "value_chain" | "evidence";

const MAX_BUILD_POLL_MS = 75_000;

function isAbortError(reason: unknown): boolean {
  return reason instanceof DOMException && reason.name === "AbortError";
}

function waitForPoll(delayMs: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }
    let timer: number | null = null;

    const cleanup = () => {
      if (timer !== null) window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      signal.removeEventListener("abort", onAbort);
    };
    const finish = () => {
      cleanup();
      resolve();
    };
    const onVisibilityChange = () => {
      if (!document.hidden) finish();
    };
    const onAbort = () => {
      cleanup();
      reject(new DOMException("Aborted", "AbortError"));
    };
    const afterDelay = () => {
      timer = null;
      if (document.hidden) {
        document.addEventListener("visibilitychange", onVisibilityChange);
      } else {
        finish();
      }
    };

    signal.addEventListener("abort", onAbort, { once: true });
    timer = window.setTimeout(afterDelay, delayMs);
  });
}

export function CompanyEcosystem({ ticker, language }: { ticker: string; language: AnatoleLanguage }) {
  const [networkTicker, setNetworkTicker] = useState(ticker);
  const [mode, setMode] = useState<Mode>("network");
  const [depth, setDepth] = useState<1 | 2>(1);
  const [includeSecondary, setIncludeSecondary] = useState(true);
  const [snapshot, setSnapshot] = useState<CompanyNetworkSnapshot | null>(null);
  const snapshotRef = useRef<CompanyNetworkSnapshot | null>(null);
  const [selectedRelationship, setSelectedRelationship] = useState<CompanyRelationship | null>(null);
  const [pathTarget, setPathTarget] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const forceRefreshRef = useRef(false);

  useEffect(() => {
    const controller = new AbortController();
    const forceRefresh = forceRefreshRef.current;
    forceRefreshRef.current = false;

    const load = async () => {
      const pollingStarted = Date.now();
      let firstRequest = true;
      let pollCount = 0;
      setLoading(snapshotRef.current === null);
      setError(null);

      try {
        while (!controller.signal.aborted) {
          const value = await getCompanyNetwork(
            networkTicker,
            depth,
            includeSecondary,
            controller.signal,
            firstRequest && forceRefresh,
          );
          firstRequest = false;
          snapshotRef.current = value;
          setSnapshot(value);
          setSelectedRelationship((current) => (
            current && value.relationships.some((item) => item.id === current.id)
              ? current
              : value.relationships[0] ?? null
          ));
          setLoading(false);

          if (
            value.coverage.build_status !== "building"
            || Date.now() - pollingStarted >= MAX_BUILD_POLL_MS
          ) {
            break;
          }
          const retrySeconds = value.coverage.retry_after_seconds ?? (pollCount === 0 ? 3 : 5);
          const delayMs = pollCount === 0
            ? Math.max(3, retrySeconds) * 1000
            : Math.max(5, retrySeconds) * 1000;
          pollCount += 1;
          await waitForPoll(delayMs, controller.signal);
          if (Date.now() - pollingStarted >= MAX_BUILD_POLL_MS) break;
        }
      } catch (reason: unknown) {
        if (!isAbortError(reason)) {
          setError(reason instanceof Error ? reason.message : "Company network unavailable");
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };

    void load();
    return () => controller.abort();
  }, [depth, includeSecondary, networkTicker, refreshKey]);

  const recenter = (node: CompanyNetworkNode) => {
    if (!node.public_company || !node.ticker) return;
    setNetworkTicker(node.ticker);
    setDepth(1);
    setMode("network");
  };
  const expand = (node: CompanyNetworkNode) => {
    if (!node.public_company || !node.ticker) return;
    setNetworkTicker(node.ticker);
    setDepth(2);
    setMode("network");
  };
  const find = (node: CompanyNetworkNode) => {
    if (node.ticker) setPathTarget(node.ticker);
  };
  const refresh = () => {
    forceRefreshRef.current = true;
    setRefreshKey((value) => value + 1);
  };

  const building = snapshot?.coverage.build_status === "building";
  const failed = snapshot?.coverage.build_status === "failed";
  const emptyReady = snapshot?.coverage.build_status === "ready" && snapshot.relationships.length === 0;

  return (
    <section className={styles.ecosystem} data-ecosystem-ready={!loading}>
      <header className={styles.hero}>
        <div><span className={styles.eyebrow}>{pick(language, "ÉCOSYSTÈME D’ENTREPRISE · GRAPHE VÉRIFIÉ", "COMPANY ECOSYSTEM · VERIFIED GRAPH")}</span><h2>{pick(language, "Écosystème d’entreprise", "Company ecosystem")} · {networkTicker}</h2><p>{pick(language, "Relations économiques publiques avec preuve traçable. L’absence de relation affichée ne prouve pas l’absence de relation réelle.", "Public economic relationships with traceable evidence. A relationship not being shown does not prove that none exists.")}</p></div>
        <div className={styles.heroActions}><button type="button" onClick={refresh}><RefreshCw size={15} />{building && snapshot?.stale ? pick(language, "Actualisation…", "Refreshing…") : pick(language, "Actualiser", "Refresh")}</button><label><input type="checkbox" checked={includeSecondary} onChange={(event) => setIncludeSecondary(event.target.checked)} />{pick(language, "Secondaires", "Secondary")}</label></div>
      </header>
      <nav className={styles.modeTabs} aria-label={pick(language, "Modes Écosystème", "Ecosystem modes")}>
        <button type="button" aria-pressed={mode === "network"} onClick={() => setMode("network")}><Network size={15} />{pick(language, "Réseau", "Network")}</button>
        <button type="button" aria-pressed={mode === "value_chain"} onClick={() => setMode("value_chain")}><ListTree size={15} />{pick(language, "Chaîne de valeur", "Value chain")}</button>
        <button type="button" aria-pressed={mode === "evidence"} onClick={() => setMode("evidence")}><ShieldCheck size={15} />{pick(language, "Preuves", "Evidence")}</button>
        <button type="button" className={styles.depthButton} onClick={() => setDepth((value) => value === 1 ? 2 : 1)}><GitBranch size={15} />{pick(language, "Profondeur", "Depth")} {depth}{depth === 1 ? ` · ${pick(language, "charger 2", "load 2")}` : ""}</button>
      </nav>
      {loading ? <div className={styles.loading}>{pick(language, "Chargement du réseau…", "Loading network…")}</div> : null}
      {building ? <div className={styles.loading} role="status"><strong>{pick(language, snapshot?.stale ? "Actualisation en arrière-plan…" : "Analyse des relations officielles en cours…", snapshot?.stale ? "Refreshing in the background…" : "Official relationship analysis in progress…")}</strong><p>{pick(language, "Anatole examine les documents publics en arrière-plan. Tu peux continuer à utiliser Focus.", "Anatole is reviewing public documents in the background. You can keep using Focus.")}</p></div> : null}
      {failed ? <div className={styles.error}>{pick(language, snapshot?.coverage.build_error ?? "L'analyse du réseau a échoué temporairement.", "The network analysis failed temporarily.")}</div> : null}
      {error ? <div className={styles.error}>{error}</div> : null}
      {snapshot && !loading ? <>
        {emptyReady ? <div className={styles.emptyState}><strong>{pick(language, "Anatole n'a pas trouvé suffisamment de relations publiques vérifiables pour cette entreprise.", "Anatole did not find enough publicly verifiable relationships for this company.")}</strong><p>{pick(language, "Cette absence ne signifie pas que l'entreprise n'a aucun fournisseur, client ou partenaire.", "This does not mean that the company has no suppliers, customers, or partners.")}</p></div> : null}
        {mode === "network" ? <CompanyNetworkGraph center={snapshot.center} nodes={snapshot.nodes} relationships={snapshot.relationships} selectedRelationship={selectedRelationship} language={language} onSelectRelationship={setSelectedRelationship} onRecenter={recenter} onExpand={expand} onFind={find} /> : null}
        {mode === "value_chain" ? <CompanyValueChain center={snapshot.center} nodes={snapshot.nodes} relationships={snapshot.relationships} language={language} onSelect={(item) => { setSelectedRelationship(item); setMode("evidence"); }} /> : null}
        {mode === "evidence" ? <RelationshipEvidencePanel snapshot={snapshot} selected={selectedRelationship} language={language} onSelect={setSelectedRelationship} /> : null}
        <RelationshipPathFinder key={snapshot.center.ticker ?? networkTicker} fromTicker={snapshot.center.ticker ?? networkTicker} initialTarget={pathTarget} language={language} />
        <footer className={styles.footer}><span>{snapshot.nodes.length}/{snapshot.coverage.node_limit} {pick(language, "nœuds", "nodes")} · {snapshot.relationships.length} {pick(language, "relations", "edges")}</span><span>{snapshot.coverage.verified_relationships} {pick(language, "vérifiées", "verified")} · {snapshot.coverage.corroborated_relationships} {pick(language, "corroborées", "corroborated")} · {snapshot.coverage.secondary_relationships} {pick(language, "secondaires", "secondary")}</span><span>{snapshot.stale ? pick(language, "ACTUALISATION", "REFRESHING") : "CACHE 24H"}</span></footer>
      </> : null}
    </section>
  );
}
