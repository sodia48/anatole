"use client";

import { RotateCw, Send } from "lucide-react";
import { useEffect, useState } from "react";

import { pick, type AnatoleLanguage } from "@/lib/i18n";
import {
  cancelPaperOrder,
  getPaperAccount,
  placePaperOrder,
  previewPaperOrder,
  refreshPaperAccount,
  resetPaperAccount,
} from "@/lib/paper-trading";
import type {
  PaperAccount,
  PaperOrderPreview,
  PaperOrderRequest,
} from "@/lib/types";

import styles from "./FocusPro.module.css";

export function FocusPaperTrading({
  ticker,
  language,
  authenticated,
  account,
  onAccount,
}: {
  ticker: string;
  language: AnatoleLanguage;
  authenticated: boolean;
  account: PaperAccount | null;
  onAccount: (account: PaperAccount | null) => void;
}) {
  const [order, setOrder] = useState<PaperOrderRequest>({
    ticker,
    side: "buy",
    order_type: "market",
    quantity: 1,
  });
  const [preview, setPreview] = useState<PaperOrderPreview | null>(null);
  const [resetCapital, setResetCapital] = useState(100_000);
  const [resetCommission, setResetCommission] = useState(0);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  useEffect(() => {
    if (!authenticated) {
      onAccount(null);
      return;
    }
    let active = true;
    void getPaperAccount().then((value) => {
      if (active) onAccount(value);
    }).catch((error: unknown) => {
      if (active) setMessage(error instanceof Error ? error.message : "PAPER indisponible");
    });
    return () => { active = false; };
  }, [authenticated, onAccount]);

  const execute = async () => {
    setBusy(true);
    setMessage(null);
    try {
      if (!preview) {
        setPreview(await previewPaperOrder(order));
        return;
      }
      const placed = await placePaperOrder(order);
      setMessage(`${pick(language, "Ordre soumis", "Order submitted")} · ${placed.id.slice(0, 8)} · ${placed.status}`);
      setPreview(null);
      onAccount(await getPaperAccount());
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "PAPER indisponible");
    } finally {
      setBusy(false);
    }
  };

  const refresh = async () => {
    setBusy(true);
    try {
      onAccount(await refreshPaperAccount());
      setMessage(pick(language, "Cours et ordres actualisés.", "Quotes and orders refreshed."));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "PAPER indisponible");
    } finally {
      setBusy(false);
    }
  };

  const cancel = async (id: string) => {
    setBusy(true);
    try {
      await cancelPaperOrder(id);
      onAccount(await getPaperAccount());
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "PAPER indisponible");
    } finally {
      setBusy(false);
    }
  };

  const reset = async () => {
    const confirmed = window.confirm(pick(
      language,
      "Réinitialiser définitivement le compte PAPER à 100 000 CAD ?",
      "Permanently reset the PAPER account to CAD 100,000?",
    ));
    if (!confirmed) return;
    setBusy(true);
    try {
      onAccount(await resetPaperAccount(resetCapital, resetCommission));
      setPreview(null);
      setMessage(pick(language, "Compte PAPER réinitialisé.", "PAPER account reset."));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "PAPER indisponible");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className={styles.panel} aria-label="Paper trading ticket">
      <header className={styles.sectionHeader}>
        <div><span className={styles.paperBadge}>PAPER</span><h2>{pick(language, "Ticket d’ordre simulé", "Simulated order ticket")}</h2></div>
        <button className={styles.iconButton} type="button" onClick={refresh} disabled={!authenticated || busy} aria-label={pick(language, "Actualiser", "Refresh")}><RotateCw size={14} /></button>
      </header>
      <div className={styles.sectionBody}>
        {!authenticated ? <p className={styles.notice}>{pick(language, "Connectez-vous pour accéder au portefeuille PAPER persistant et isolé par compte.", "Sign in to access the persistent, account-isolated PAPER portfolio.")}</p> : (
          <>
            {account ? <div className={styles.kpiGrid}><div className={styles.kpi}><span>Equity</span><strong>{account.equity.toLocaleString(locale, { style: "currency", currency: "CAD" })}</strong></div><div className={styles.kpi}><span>Cash</span><strong>{account.cash.toLocaleString(locale, { style: "currency", currency: "CAD" })}</strong></div><div className={styles.kpi}><span>Return</span><strong className={account.total_return >= 0 ? styles.positive : styles.negative}>{account.total_return_percent.toFixed(2)}%</strong></div></div> : null}
            <div className={styles.inlineActions}>
              <select className={styles.select} value={order.side} onChange={(event) => { setPreview(null); setOrder({ ...order, side: event.target.value as PaperOrderRequest["side"] }); }}><option value="buy">BUY</option><option value="sell">SELL</option></select>
              <select className={styles.select} value={order.order_type} onChange={(event) => { setPreview(null); setOrder({ ...order, order_type: event.target.value as PaperOrderRequest["order_type"] }); }}><option value="market">Market</option><option value="limit">Limit</option><option value="stop">Stop</option><option value="stop_limit">Stop limit</option></select>
              <input className={styles.input} aria-label={pick(language, "Quantité", "Quantity")} type="number" min="0.0001" step="1" value={order.quantity} onChange={(event) => { setPreview(null); setOrder({ ...order, quantity: Number(event.target.value) }); }} />
            </div>
            {order.order_type === "limit" || order.order_type === "stop_limit" ? <label className={styles.field}>Limit<input className={styles.input} type="number" min="0.01" step="0.01" value={order.limit_price ?? ""} onChange={(event) => { setPreview(null); setOrder({ ...order, limit_price: Number(event.target.value) }); }} /></label> : null}
            {order.order_type === "stop" || order.order_type === "stop_limit" ? <label className={styles.field}>Stop<input className={styles.input} type="number" min="0.01" step="0.01" value={order.stop_price ?? ""} onChange={(event) => { setPreview(null); setOrder({ ...order, stop_price: Number(event.target.value) }); }} /></label> : null}
            {preview ? <div className={preview.sufficient_cash ? styles.successNotice : styles.errorNotice}>{preview.message}<br />{preview.quantity} × {preview.estimated_price.toFixed(2)} = {preview.estimated_notional.toFixed(2)} CAD</div> : null}
            <button className={styles.primaryButton} type="button" onClick={execute} disabled={busy || order.quantity <= 0 || Boolean(preview && !preview.sufficient_cash)}><Send size={14} />{preview ? order.side === "buy" ? pick(language, "Acheter — PAPER", "Buy — PAPER") : pick(language, "Vendre — PAPER", "Sell — PAPER") : pick(language, "Prévisualiser", "Preview")}</button>
            {(account?.orders ?? []).some((item) => item.status === "pending") ? <ul className={styles.list}>{account?.orders.filter((item) => item.status === "pending").slice(0, 4).map((item) => <li className={styles.listItem} key={item.id}><span><strong>{item.side.toUpperCase()} {item.quantity} {item.ticker}</strong><small>{item.order_type}</small></span><button className={styles.dangerButton} type="button" disabled={busy} onClick={() => cancel(item.id)}>{pick(language, "Annuler", "Cancel")}</button></li>)}</ul> : null}
            <div className={styles.inlineActions}><label className={styles.field}>{pick(language, "Capital de reset", "Reset capital")}<input className={styles.input} type="number" min="1000" value={resetCapital} onChange={(event) => setResetCapital(Number(event.target.value))} /></label><label className={styles.field}>{pick(language, "Commission/ordre", "Commission/order")}<input className={styles.input} type="number" min="0" step="0.01" value={resetCommission} onChange={(event) => setResetCommission(Number(event.target.value))} /></label></div>
            <button className={styles.dangerButton} type="button" disabled={busy || resetCapital < 1_000 || resetCommission < 0} onClick={reset}>{pick(language, "Réinitialiser PAPER", "Reset PAPER")}</button>
            <p className={styles.muted}>{pick(language, "Les ordres market sont exécutés au prochain point de marché observé; limit/stop ne sont jamais remplis rétroactivement.", "Market orders execute on the next observed market point; limit/stop orders are never filled retroactively.")}</p>
          </>
        )}
        {message ? <div className={styles.notice} role="status">{message}</div> : null}
      </div>
    </section>
  );
}

const locale = "fr-CA";
