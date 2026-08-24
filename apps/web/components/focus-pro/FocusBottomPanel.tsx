"use client";

import { useState } from "react";

import { pick, type AnatoleLanguage } from "@/lib/i18n";
import type { BacktestResult, PaperAccount } from "@/lib/types";

import styles from "./FocusPro.module.css";

type Tab = "positions" | "orders" | "history" | "performance" | "backtest";

export function FocusBottomPanel({
  language,
  account,
  backtest,
}: {
  language: AnatoleLanguage;
  account: PaperAccount | null;
  backtest: BacktestResult | null;
}) {
  const [tab, setTab] = useState<Tab>("positions");
  const tabs: Array<{ id: Tab; fr: string; en: string }> = [
    { id: "positions", fr: "Positions", en: "Positions" },
    { id: "orders", fr: "Ordres", en: "Orders" },
    { id: "history", fr: "Historique", en: "History" },
    { id: "performance", fr: "Performance", en: "Performance" },
    { id: "backtest", fr: "Trades backtest", en: "Backtest trades" },
  ];
  return (
    <section className={`${styles.panel} ${styles.bottomPanel}`} aria-label="Focus bottom panel">
      <nav className={styles.bottomTabs} aria-label="Trading details">
        {tabs.map((item) => <button key={item.id} className={`${styles.tabButton} ${tab === item.id ? styles.buttonActive : ""}`} type="button" onClick={() => setTab(item.id)}>{pick(language, item.fr, item.en)}</button>)}
      </nav>
      <div className={styles.tableWrap}>
        {tab === "positions" ? <Table headers={["Ticker", "Qty", "Avg", "Last", "Value", "P&L"]} rows={(account?.positions ?? []).map((item) => [item.ticker, item.quantity, item.average_cost.toFixed(2), item.current_price.toFixed(2), item.market_value.toFixed(2), `${item.unrealized_pnl.toFixed(2)} (${item.unrealized_pnl_percent.toFixed(2)}%)`])} empty={pick(language, "Aucune position PAPER.", "No PAPER positions.")} /> : null}
        {tab === "orders" ? <Table headers={["Ticker", "Side", "Type", "Qty", "Status", "Submitted"]} rows={(account?.orders ?? []).map((item) => [item.ticker, item.side.toUpperCase(), item.order_type, item.quantity, item.status, new Date(item.created_at).toLocaleString()])} empty={pick(language, "Aucun ordre PAPER.", "No PAPER orders.")} /> : null}
        {tab === "history" ? <Table headers={["Ticker", "Side", "Qty", "Price", "P&L", "Executed"]} rows={(account?.trades ?? []).map((item) => [item.ticker, item.side.toUpperCase(), item.quantity, item.price.toFixed(2), item.realized_pnl.toFixed(2), new Date(item.executed_at).toLocaleString()])} empty={pick(language, "Aucune exécution PAPER.", "No PAPER executions.")} /> : null}
        {tab === "performance" ? (
          <div className={styles.sectionBody}>{account ? <div className={styles.kpiGrid}><Kpi label="Initial" value={account.initial_capital.toFixed(2)} /><Kpi label="Equity" value={account.equity.toFixed(2)} /><Kpi label="Buying power" value={account.buying_power.toFixed(2)} /><Kpi label="Market value" value={account.market_value.toFixed(2)} /><Kpi label="Total return" value={`${account.total_return.toFixed(2)} · ${account.total_return_percent.toFixed(2)}%`} /><Kpi label="Commission" value={account.commission.toFixed(2)} /></div> : <p className={styles.muted}>{pick(language, "Connexion requise.", "Sign-in required.")}</p>}</div>
        ) : null}
        {tab === "backtest" ? <Table headers={["Side", "Entry", "Entry px", "Exit", "Exit px", "P&L", "Reason"]} rows={(backtest?.trades ?? []).map((item) => [item.side, new Date(item.entry_time * 1000).toLocaleDateString(), item.entry_price.toFixed(2), new Date(item.exit_time * 1000).toLocaleDateString(), item.exit_price.toFixed(2), item.pnl.toFixed(2), item.reason])} empty={pick(language, "Lancez un backtest pour voir ses transactions.", "Run a backtest to see its trades.")} /> : null}
      </div>
    </section>
  );
}

function Table({ headers, rows, empty }: { headers: string[]; rows: Array<Array<string | number>>; empty: string }) {
  if (!rows.length) return <div className={styles.sectionBody}><p className={styles.muted}>{empty}</p></div>;
  return <table className={styles.table}><thead><tr>{headers.map((item) => <th key={item}>{item}</th>)}</tr></thead><tbody>{rows.map((row, index) => <tr key={index}>{row.map((item, column) => <td key={`${index}-${column}`}>{item}</td>)}</tr>)}</tbody></table>;
}

function Kpi({ label, value }: { label: string; value: string }) {
  return <div className={styles.kpi}><span>{label}</span><strong>{value}</strong></div>;
}
