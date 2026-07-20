"use client";

import {
  useEffect,
  useMemo,
  useState,
} from "react";

export type FundamentalView =
  | "fundamentals"
  | "financials"
  | "analysts";

type Metrics = {
  market_cap: number | null;
  enterprise_value: number | null;
  trailing_pe: number | null;
  forward_pe: number | null;
  price_to_book: number | null;
  price_to_sales: number | null;
  enterprise_to_revenue: number | null;
  enterprise_to_ebitda: number | null;
  trailing_eps: number | null;
  forward_eps: number | null;
  beta: number | null;
  fifty_two_week_high: number | null;
  fifty_two_week_low: number | null;
  average_volume_10d: number | null;
  average_volume_3m: number | null;
  shares_outstanding: number | null;
  dividend_rate: number | null;
  dividend_yield: number | null;
  payout_ratio: number | null;
  total_revenue: number | null;
  revenue_per_share: number | null;
  gross_profit: number | null;
  ebitda: number | null;
  net_income_to_common: number | null;
  free_cash_flow: number | null;
  operating_cash_flow: number | null;
  total_cash: number | null;
  total_debt: number | null;
  debt_to_equity: number | null;
  current_ratio: number | null;
  quick_ratio: number | null;
  gross_margin: number | null;
  operating_margin: number | null;
  profit_margin: number | null;
  return_on_assets: number | null;
  return_on_equity: number | null;
  revenue_growth: number | null;
  earnings_growth: number | null;
};

type FinancialPeriod = {
  period_end: string;
  period_type: "annual" | "quarterly";
  currency: string | null;
  total_revenue: number | null;
  cost_of_revenue: number | null;
  gross_profit: number | null;
  research_development: number | null;
  selling_general_administrative: number | null;
  total_operating_expenses: number | null;
  operating_income: number | null;
  ebit: number | null;
  depreciation_amortization: number | null;
  ebitda: number | null;
  interest_expense: number | null;
  income_before_tax: number | null;
  income_tax_expense: number | null;
  net_income: number | null;
  basic_eps: number | null;
  diluted_eps: number | null;
  diluted_average_shares: number | null;
  operating_cash_flow: number | null;
  capital_expenditure: number | null;
  free_cash_flow: number | null;
  dividends_paid: number | null;
  share_repurchases: number | null;
  total_cash: number | null;
  total_debt: number | null;
  net_debt: number | null;
  current_assets: number | null;
  current_liabilities: number | null;
  total_assets: number | null;
  total_liabilities: number | null;
  stockholder_equity: number | null;
  gross_margin: number | null;
  operating_margin: number | null;
  net_margin: number | null;
  free_cash_flow_margin: number | null;
  revenue_growth_yoy: number | null;
  operating_income_growth_yoy: number | null;
  net_income_growth_yoy: number | null;
  eps_growth_yoy: number | null;
  free_cash_flow_growth_yoy: number | null;
};

type TTMSummary = {
  period_end: string | null;
  currency: string | null;
  total_revenue: number | null;
  gross_profit: number | null;
  operating_income: number | null;
  ebitda: number | null;
  net_income: number | null;
  diluted_eps: number | null;
  operating_cash_flow: number | null;
  capital_expenditure: number | null;
  free_cash_flow: number | null;
  dividends_paid: number | null;
  share_repurchases: number | null;
  total_cash: number | null;
  total_debt: number | null;
  net_debt: number | null;
  gross_margin: number | null;
  operating_margin: number | null;
  net_margin: number | null;
  free_cash_flow_margin: number | null;
};

type FinancialHighlights = {
  latest_period_end: string | null;
  revenue_growth_yoy: number | null;
  operating_income_growth_yoy: number | null;
  net_income_growth_yoy: number | null;
  eps_growth_yoy: number | null;
  free_cash_flow_growth_yoy: number | null;
  three_year_revenue_cagr: number | null;
  three_year_net_income_cagr: number | null;
  three_year_free_cash_flow_cagr: number | null;
  cash_conversion_percent: number | null;
  net_debt_to_ebitda: number | null;
};

type EarningsEstimate = {
  period: string;
  end_date: string | null;
  eps_average: number | null;
  eps_low: number | null;
  eps_high: number | null;
  eps_year_ago: number | null;
  eps_growth: number | null;
  eps_analyst_count: number | null;
  revenue_average: number | null;
  revenue_low: number | null;
  revenue_high: number | null;
  revenue_year_ago: number | null;
  revenue_growth: number | null;
  revenue_analyst_count: number | null;
};

type EarningsQuarter = {
  period: string;
  actual: number | null;
  estimate: number | null;
  surprise_percent: number | null;
};

type Analysts = {
  recommendation_key: string | null;
  recommendation_mean: number | null;
  analyst_count: number | null;
  target_low: number | null;
  target_mean: number | null;
  target_median: number | null;
  target_high: number | null;
  current_price: number | null;
  upside_to_mean_percent: number | null;
  strong_buy: number | null;
  buy: number | null;
  hold: number | null;
  sell: number | null;
  strong_sell: number | null;
};

type Events = {
  earnings_dates: string[];
  ex_dividend_date: string | null;
  dividend_date: string | null;
};

type Snapshot = {
  ticker: string;
  symbol: string;
  name: string;
  exchange: string | null;
  currency: string | null;
  sector: string | null;
  industry: string | null;
  status: "available" | "partial" | "unavailable";
  message: string | null;
  metrics: Metrics;
  annual_financials: FinancialPeriod[];
  quarterly_financials: FinancialPeriod[];
  ttm: TTMSummary;
  highlights: FinancialHighlights;
  earnings_history: EarningsQuarter[];
  earnings_estimates: EarningsEstimate[];
  analysts: Analysts;
  events: Events;
  source: string;
  generated_at: string;
  refresh_after_seconds: number;
};

function bridgeUrl(ticker: string): string {
  return `/api/anatole/api/v1/stocks/${encodeURIComponent(
    ticker,
  )}/fundamentals`;
}

function n(
  value: number | null,
  digits = 2,
): string {
  if (value === null || !Number.isFinite(value)) {
    return "N/D";
  }
  return value.toLocaleString("fr-CA", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function money(
  value: number | null,
  currency = "CAD",
): string {
  if (value === null || !Number.isFinite(value)) {
    return "N/D";
  }
  return value.toLocaleString("fr-CA", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  });
}

function compact(
  value: number | null,
  currency?: string | null,
): string {
  if (value === null || !Number.isFinite(value)) {
    return "N/D";
  }
  const formatted = new Intl.NumberFormat("fr-CA", {
    notation: "compact",
    maximumFractionDigits: 2,
  }).format(value);
  return currency ? `${formatted} ${currency}` : formatted;
}

function pct(value: number | null): string {
  if (value === null || !Number.isFinite(value)) {
    return "N/D";
  }
  return `${value >= 0 ? "+" : ""}${n(value)} %`;
}

function date(value: string | null): string {
  if (!value) {
    return "N/D";
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "N/D";
  }
  return parsed.toLocaleDateString("fr-CA", {
    timeZone: "America/Toronto",
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function signedCompact(
  value: number | null,
  currency?: string | null,
): string {
  if (value === null || !Number.isFinite(value)) {
    return "N/D";
  }
  const prefix = value > 0 ? "+" : "";
  return `${prefix}${compact(value, currency)}`;
}

function tone(
  value: number | null,
): "positive" | "negative" | undefined {
  if (value === null || !Number.isFinite(value) || value === 0) {
    return undefined;
  }
  return value > 0 ? "positive" : "negative";
}

function periodLabel(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return parsed.toLocaleDateString("fr-CA", {
    timeZone: "UTC",
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

type ResultsSubview =
  | "overview"
  | "quarterly"
  | "annual"
  | "estimates"
  | "earnings";

type StatementView =
  | "income"
  | "cashflow"
  | "balance"
  | "margins";


const panelStyle = {
  border: "1px solid rgba(35,73,96,.88)",
  borderRadius: 14,
  background: "rgba(8,29,43,.92)",
  padding: 18,
} as const;

function Metric({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "positive" | "negative";
}) {
  return (
    <div
      style={{
        minHeight: 78,
        display: "grid",
        alignContent: "center",
        gap: 7,
        padding: "12px 14px",
        border: "1px solid rgba(38,77,101,.72)",
        borderRadius: 11,
        background: "rgba(4,20,31,.76)",
      }}
    >
      <span style={{ color: "#819db0", fontSize: 11 }}>
        {label}
      </span>
      <strong
        style={{
          color:
            tone === "positive"
              ? "#16c79a"
              : tone === "negative"
                ? "#ff4d67"
                : "#edf7fd",
          fontSize: 18,
        }}
      >
        {value}
      </strong>
    </div>
  );
}

function Group({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section style={panelStyle}>
      <h2 style={{ margin: "0 0 14px", fontSize: 18 }}>
        {title}
      </h2>
      <div
        style={{
          display: "grid",
          gridTemplateColumns:
            "repeat(auto-fit, minmax(155px, 1fr))",
          gap: 10,
        }}
      >
        {children}
      </div>
    </section>
  );
}

function Fundamentals({
  snapshot,
}: {
  snapshot: Snapshot;
}) {
  const m = snapshot.metrics;
  const currency = snapshot.currency ?? "CAD";

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns:
          "repeat(auto-fit, minmax(360px, 1fr))",
        gap: 14,
      }}
    >
      <Group title="Valorisation">
        <Metric label="Capitalisation" value={compact(m.market_cap, currency)} />
        <Metric label="Valeur d’entreprise" value={compact(m.enterprise_value, currency)} />
        <Metric label="C/B historique" value={n(m.trailing_pe)} />
        <Metric label="C/B anticipé" value={n(m.forward_pe)} />
        <Metric label="Cours / valeur comptable" value={n(m.price_to_book)} />
        <Metric label="Cours / ventes" value={n(m.price_to_sales)} />
        <Metric label="VE / BAIIA" value={n(m.enterprise_to_ebitda)} />
        <Metric label="BPA historique" value={money(m.trailing_eps, currency)} />
      </Group>

      <Group title="Croissance et rentabilité">
        <Metric label="Chiffre d’affaires" value={compact(m.total_revenue, currency)} />
        <Metric label="BAIIA" value={compact(m.ebitda, currency)} />
        <Metric label="Bénéfice net" value={compact(m.net_income_to_common, currency)} />
        <Metric label="Marge brute" value={pct(m.gross_margin)} />
        <Metric label="Marge opérationnelle" value={pct(m.operating_margin)} />
        <Metric label="Marge nette" value={pct(m.profit_margin)} />
        <Metric label="Croissance des revenus" value={pct(m.revenue_growth)} tone={(m.revenue_growth ?? 0) >= 0 ? "positive" : "negative"} />
        <Metric label="Croissance des bénéfices" value={pct(m.earnings_growth)} tone={(m.earnings_growth ?? 0) >= 0 ? "positive" : "negative"} />
      </Group>

      <Group title="Bilan et trésorerie">
        <Metric label="Trésorerie" value={compact(m.total_cash, currency)} />
        <Metric label="Dette totale" value={compact(m.total_debt, currency)} />
        <Metric label="Dette / capitaux propres" value={n(m.debt_to_equity)} />
        <Metric label="Ratio courant" value={n(m.current_ratio)} />
        <Metric label="Ratio rapide" value={n(m.quick_ratio)} />
        <Metric label="Flux de trésorerie opérationnel" value={compact(m.operating_cash_flow, currency)} />
        <Metric label="Flux de trésorerie disponible" value={compact(m.free_cash_flow, currency)} />
        <Metric label="Rendement des capitaux propres" value={pct(m.return_on_equity)} />
      </Group>

      <Group title="Marché et dividende">
        <Metric label="Bêta" value={n(m.beta)} />
        <Metric label="Sommet 52 semaines" value={money(m.fifty_two_week_high, currency)} />
        <Metric label="Creux 52 semaines" value={money(m.fifty_two_week_low, currency)} />
        <Metric label="Actions en circulation" value={compact(m.shares_outstanding)} />
        <Metric label="Rendement du dividende" value={pct(m.dividend_yield)} />
        <Metric label="Dividende annuel" value={money(m.dividend_rate, currency)} />
        <Metric label="Ratio de distribution" value={pct(m.payout_ratio)} />
        <Metric label="Volume moyen 3 mois" value={compact(m.average_volume_3m)} />
      </Group>
    </div>
  );
}

function MiniTrend({
  title,
  rows,
  field,
  currency,
}: {
  title: string;
  rows: FinancialPeriod[];
  field:
    | "total_revenue"
    | "operating_income"
    | "net_income"
    | "free_cash_flow";
  currency: string;
}) {
  const values = rows
    .map((row) => row[field])
    .filter((value): value is number => value !== null);
  const maximum = Math.max(
    ...values.map((value) => Math.abs(value)),
    1,
  );

  return (
    <section style={panelStyle}>
      <h3 style={{ margin: "0 0 14px", fontSize: 15 }}>
        {title}
      </h3>
      <div style={{ display: "grid", gap: 10 }}>
        {[...rows].reverse().map((row) => {
          const value = row[field];
          const width =
            value === null
              ? 0
              : Math.max(
                  Math.abs(value) / maximum * 100,
                  2,
                );

          return (
            <div
              key={`${field}-${row.period_end}`}
              style={{
                display: "grid",
                gridTemplateColumns: "78px 1fr 120px",
                alignItems: "center",
                gap: 10,
              }}
            >
              <span style={{ color: "#819db0", fontSize: 10 }}>
                {new Date(row.period_end).getUTCFullYear()}
              </span>
              <div
                style={{
                  height: 10,
                  overflow: "hidden",
                  borderRadius: 999,
                  background: "rgba(44,76,96,.42)",
                }}
              >
                <div
                  style={{
                    width: `${width}%`,
                    height: "100%",
                    borderRadius: 999,
                    background:
                      value !== null && value < 0
                        ? "#e34f6a"
                        : "#23b68e",
                  }}
                />
              </div>
              <strong
                style={{
                  color:
                    value !== null && value < 0
                      ? "#ff7188"
                      : "#dcecf6",
                  textAlign: "right",
                  fontSize: 11,
                }}
              >
                {compact(value, currency)}
              </strong>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function FinancialTable({
  rows,
  view,
  currency,
}: {
  rows: FinancialPeriod[];
  view: StatementView;
  currency: string;
}) {
  const headers =
    view === "income"
      ? [
          "Période",
          "Revenus",
          "Coût des revenus",
          "Bénéfice brut",
          "Résultat opérationnel",
          "BAIIA",
          "Bénéfice net",
          "BPA dilué",
          "Croissance revenus",
          "Croissance bénéfice",
        ]
      : view === "cashflow"
        ? [
            "Période",
            "Flux opérationnel",
            "Immobilisations",
            "Flux disponible",
            "Marge FTD",
            "Dividendes",
            "Rachats d’actions",
            "Croissance FTD",
          ]
        : view === "balance"
          ? [
              "Période",
              "Trésorerie",
              "Dette",
              "Dette nette",
              "Actifs courants",
              "Passifs courants",
              "Actifs",
              "Passifs",
              "Capitaux propres",
            ]
          : [
              "Période",
              "Marge brute",
              "Marge opérationnelle",
              "Marge nette",
              "Marge FTD",
              "Croissance BPA",
              "Actions diluées",
            ];

  return (
    <div style={{ overflowX: "auto" }}>
      <table
        style={{
          width: "100%",
          minWidth:
            view === "income"
              ? 1320
              : view === "balance"
                ? 1180
                : 980,
          borderCollapse: "collapse",
          fontSize: 11,
        }}
      >
        <thead>
          <tr style={{ color: "#7898ad", textAlign: "right" }}>
            {headers.map((header, index) => (
              <th
                key={header}
                style={{
                  padding: "10px 11px",
                  textAlign: index === 0 ? "left" : "right",
                  whiteSpace: "nowrap",
                }}
              >
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length ? (
            rows.map((row) => (
              <tr
                key={`${view}-${row.period_end}`}
                style={{
                  borderTop:
                    "1px solid rgba(38,77,101,.58)",
                  color: "#dcecf6",
                  textAlign: "right",
                }}
              >
                <td
                  style={{
                    padding: 11,
                    textAlign: "left",
                    fontWeight: 750,
                    whiteSpace: "nowrap",
                  }}
                >
                  {periodLabel(row.period_end)}
                </td>

                {view === "income" ? (
                  <>
                    <td style={{ padding: 11 }}>{compact(row.total_revenue, currency)}</td>
                    <td style={{ padding: 11 }}>{compact(row.cost_of_revenue, currency)}</td>
                    <td style={{ padding: 11 }}>{compact(row.gross_profit, currency)}</td>
                    <td style={{ padding: 11 }}>{compact(row.operating_income, currency)}</td>
                    <td style={{ padding: 11 }}>{compact(row.ebitda, currency)}</td>
                    <td style={{ padding: 11 }}>{compact(row.net_income, currency)}</td>
                    <td style={{ padding: 11 }}>{money(row.diluted_eps, currency)}</td>
                    <td
                      style={{
                        padding: 11,
                        color:
                          (row.revenue_growth_yoy ?? 0) >= 0
                            ? "#16c79a"
                            : "#ff4d67",
                      }}
                    >
                      {pct(row.revenue_growth_yoy)}
                    </td>
                    <td
                      style={{
                        padding: 11,
                        color:
                          (row.net_income_growth_yoy ?? 0) >= 0
                            ? "#16c79a"
                            : "#ff4d67",
                      }}
                    >
                      {pct(row.net_income_growth_yoy)}
                    </td>
                  </>
                ) : view === "cashflow" ? (
                  <>
                    <td style={{ padding: 11 }}>{compact(row.operating_cash_flow, currency)}</td>
                    <td style={{ padding: 11 }}>{signedCompact(row.capital_expenditure, currency)}</td>
                    <td style={{ padding: 11 }}>{compact(row.free_cash_flow, currency)}</td>
                    <td style={{ padding: 11 }}>{pct(row.free_cash_flow_margin)}</td>
                    <td style={{ padding: 11 }}>{signedCompact(row.dividends_paid, currency)}</td>
                    <td style={{ padding: 11 }}>{signedCompact(row.share_repurchases, currency)}</td>
                    <td
                      style={{
                        padding: 11,
                        color:
                          (row.free_cash_flow_growth_yoy ?? 0) >= 0
                            ? "#16c79a"
                            : "#ff4d67",
                      }}
                    >
                      {pct(row.free_cash_flow_growth_yoy)}
                    </td>
                  </>
                ) : view === "balance" ? (
                  <>
                    <td style={{ padding: 11 }}>{compact(row.total_cash, currency)}</td>
                    <td style={{ padding: 11 }}>{compact(row.total_debt, currency)}</td>
                    <td style={{ padding: 11 }}>{compact(row.net_debt, currency)}</td>
                    <td style={{ padding: 11 }}>{compact(row.current_assets, currency)}</td>
                    <td style={{ padding: 11 }}>{compact(row.current_liabilities, currency)}</td>
                    <td style={{ padding: 11 }}>{compact(row.total_assets, currency)}</td>
                    <td style={{ padding: 11 }}>{compact(row.total_liabilities, currency)}</td>
                    <td style={{ padding: 11 }}>{compact(row.stockholder_equity, currency)}</td>
                  </>
                ) : (
                  <>
                    <td style={{ padding: 11 }}>{pct(row.gross_margin)}</td>
                    <td style={{ padding: 11 }}>{pct(row.operating_margin)}</td>
                    <td style={{ padding: 11 }}>{pct(row.net_margin)}</td>
                    <td style={{ padding: 11 }}>{pct(row.free_cash_flow_margin)}</td>
                    <td
                      style={{
                        padding: 11,
                        color:
                          (row.eps_growth_yoy ?? 0) >= 0
                            ? "#16c79a"
                            : "#ff4d67",
                      }}
                    >
                      {pct(row.eps_growth_yoy)}
                    </td>
                    <td style={{ padding: 11 }}>{compact(row.diluted_average_shares)}</td>
                  </>
                )}
              </tr>
            ))
          ) : (
            <tr>
              <td
                colSpan={headers.length}
                style={{
                  padding: 28,
                  color: "#7f9db1",
                  textAlign: "left",
                }}
              >
                Cette série n’est pas publiée par la source.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function Financials({
  snapshot,
}: {
  snapshot: Snapshot;
}) {
  const [subview, setSubview] =
    useState<ResultsSubview>("overview");
  const [statementView, setStatementView] =
    useState<StatementView>("income");

  const currency = snapshot.currency ?? "CAD";
  const t = snapshot.ttm;
  const h = snapshot.highlights;
  const annual = snapshot.annual_financials;
  const quarterly = snapshot.quarterly_financials;

  const resultTabs: Array<{
    key: ResultsSubview;
    label: string;
  }> = [
    { key: "overview", label: "Vue d’ensemble" },
    { key: "quarterly", label: "Trimestriel" },
    { key: "annual", label: "Annuel" },
    { key: "estimates", label: "Estimations" },
    { key: "earnings", label: "BPA & calendrier" },
  ];

  const statementTabs: Array<{
    key: StatementView;
    label: string;
  }> = [
    { key: "income", label: "Compte de résultat" },
    { key: "cashflow", label: "Flux de trésorerie" },
    { key: "balance", label: "Bilan" },
    { key: "margins", label: "Marges & croissance" },
  ];

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <nav
        aria-label="Vues des résultats financiers"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 5,
          width: "fit-content",
          maxWidth: "100%",
          padding: 4,
          overflowX: "auto",
          border: "1px solid rgba(39,78,102,.8)",
          borderRadius: 11,
          background: "rgba(4,18,29,.82)",
        }}
      >
        {resultTabs.map((tab) => {
          const active = subview === tab.key;
          return (
            <button
              type="button"
              key={tab.key}
              onClick={() => setSubview(tab.key)}
              style={{
                minWidth: 105,
                height: 34,
                padding: "0 12px",
                border: active
                  ? "1px solid rgba(54,163,241,.72)"
                  : "1px solid transparent",
                borderRadius: 8,
                background: active
                  ? "rgba(27,105,159,.82)"
                  : "transparent",
                color: active ? "#fff" : "#86a4b8",
                fontSize: 10,
                fontWeight: 800,
                cursor: "pointer",
                whiteSpace: "nowrap",
              }}
            >
              {tab.label}
            </button>
          );
        })}
      </nav>

      {subview === "overview" ? (
        <>
          <section style={panelStyle}>
            <span className="eyebrow">DOUZE DERNIERS MOIS</span>
            <h2 style={{ margin: "4px 0 14px" }}>
              Tableau de bord financier
            </h2>

            <div
              style={{
                display: "grid",
                gridTemplateColumns:
                  "repeat(auto-fit, minmax(160px, 1fr))",
                gap: 10,
              }}
            >
              <Metric label="Revenus TTM" value={compact(t.total_revenue, currency)} />
              <Metric label="Résultat opérationnel TTM" value={compact(t.operating_income, currency)} />
              <Metric label="BAIIA TTM" value={compact(t.ebitda, currency)} />
              <Metric label="Bénéfice net TTM" value={compact(t.net_income, currency)} />
              <Metric label="BPA dilué TTM" value={money(t.diluted_eps, currency)} />
              <Metric label="Flux disponible TTM" value={compact(t.free_cash_flow, currency)} />
              <Metric label="Dette nette" value={compact(t.net_debt, currency)} />
              <Metric
                label="Dette nette / BAIIA"
                value={n(h.net_debt_to_ebitda)}
              />
            </div>
          </section>

          <div
            style={{
              display: "grid",
              gridTemplateColumns:
                "repeat(auto-fit, minmax(360px, 1fr))",
              gap: 14,
            }}
          >
            <Group title="Croissance du dernier trimestre">
              <Metric
                label="Revenus sur un an"
                value={pct(h.revenue_growth_yoy)}
                tone={tone(h.revenue_growth_yoy)}
              />
              <Metric
                label="Résultat opérationnel sur un an"
                value={pct(h.operating_income_growth_yoy)}
                tone={tone(h.operating_income_growth_yoy)}
              />
              <Metric
                label="Bénéfice net sur un an"
                value={pct(h.net_income_growth_yoy)}
                tone={tone(h.net_income_growth_yoy)}
              />
              <Metric
                label="BPA sur un an"
                value={pct(h.eps_growth_yoy)}
                tone={tone(h.eps_growth_yoy)}
              />
              <Metric
                label="Flux disponible sur un an"
                value={pct(h.free_cash_flow_growth_yoy)}
                tone={tone(h.free_cash_flow_growth_yoy)}
              />
            </Group>

            <Group title="Qualité des résultats TTM">
              <Metric label="Marge brute" value={pct(t.gross_margin)} />
              <Metric label="Marge opérationnelle" value={pct(t.operating_margin)} />
              <Metric label="Marge nette" value={pct(t.net_margin)} />
              <Metric label="Marge de flux disponible" value={pct(t.free_cash_flow_margin)} />
              <Metric
                label="Conversion bénéfice → flux"
                value={pct(h.cash_conversion_percent)}
              />
            </Group>

            <Group title="Croissance annualisée sur trois ans">
              <Metric
                label="Revenus"
                value={pct(h.three_year_revenue_cagr)}
                tone={tone(h.three_year_revenue_cagr)}
              />
              <Metric
                label="Bénéfice net"
                value={pct(h.three_year_net_income_cagr)}
                tone={tone(h.three_year_net_income_cagr)}
              />
              <Metric
                label="Flux disponible"
                value={pct(h.three_year_free_cash_flow_cagr)}
                tone={tone(h.three_year_free_cash_flow_cagr)}
              />
            </Group>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns:
                "repeat(auto-fit, minmax(420px, 1fr))",
              gap: 14,
            }}
          >
            <MiniTrend
              title="Évolution annuelle des revenus"
              rows={annual}
              field="total_revenue"
              currency={currency}
            />
            <MiniTrend
              title="Évolution annuelle du bénéfice net"
              rows={annual}
              field="net_income"
              currency={currency}
            />
            <MiniTrend
              title="Évolution annuelle du flux disponible"
              rows={annual}
              field="free_cash_flow"
              currency={currency}
            />
          </div>
        </>
      ) : subview === "quarterly" || subview === "annual" ? (
        <section style={panelStyle}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-end",
              gap: 14,
              flexWrap: "wrap",
              marginBottom: 14,
            }}
          >
            <div>
              <span className="eyebrow">
                {subview === "quarterly"
                  ? "RÉSULTATS TRIMESTRIELS"
                  : "RÉSULTATS ANNUELS"}
              </span>
              <h2 style={{ margin: "4px 0 0" }}>
                États financiers détaillés
              </h2>
            </div>

            <div
              style={{
                display: "flex",
                gap: 5,
                padding: 4,
                maxWidth: "100%",
                overflowX: "auto",
                border: "1px solid rgba(39,78,102,.72)",
                borderRadius: 9,
                background: "rgba(4,18,29,.65)",
              }}
            >
              {statementTabs.map((tab) => {
                const active = statementView === tab.key;
                return (
                  <button
                    type="button"
                    key={tab.key}
                    onClick={() => setStatementView(tab.key)}
                    style={{
                      height: 30,
                      padding: "0 10px",
                      border: "none",
                      borderRadius: 7,
                      background: active
                        ? "rgba(36,106,151,.82)"
                        : "transparent",
                      color: active ? "#fff" : "#86a4b8",
                      fontSize: 9,
                      fontWeight: 750,
                      cursor: "pointer",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>
          </div>

          <FinancialTable
            rows={
              subview === "quarterly"
                ? quarterly
                : annual
            }
            view={statementView}
            currency={currency}
          />
        </section>
      ) : subview === "estimates" ? (
        <section style={panelStyle}>
          <span className="eyebrow">ATTENTES DU MARCHÉ</span>
          <h2 style={{ margin: "4px 0 14px" }}>
            Estimations de revenus et de BPA
          </h2>

          <div style={{ overflowX: "auto" }}>
            <table
              style={{
                width: "100%",
                minWidth: 1150,
                borderCollapse: "collapse",
                fontSize: 11,
              }}
            >
              <thead>
                <tr style={{ color: "#7898ad", textAlign: "right" }}>
                  {[
                    "Période",
                    "Fin",
                    "BPA moyen",
                    "Fourchette BPA",
                    "BPA année précédente",
                    "Croissance BPA",
                    "Analystes BPA",
                    "Revenus moyens",
                    "Fourchette revenus",
                    "Croissance revenus",
                    "Analystes revenus",
                  ].map((header, index) => (
                    <th
                      key={header}
                      style={{
                        padding: 10,
                        textAlign: index < 2 ? "left" : "right",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {snapshot.earnings_estimates.length ? (
                  snapshot.earnings_estimates.map((estimate) => (
                    <tr
                      key={`${estimate.period}-${estimate.end_date}`}
                      style={{
                        borderTop:
                          "1px solid rgba(38,77,101,.58)",
                        color: "#dcecf6",
                        textAlign: "right",
                      }}
                    >
                      <td style={{ padding: 11, textAlign: "left", fontWeight: 750 }}>
                        {estimate.period}
                      </td>
                      <td style={{ padding: 11, textAlign: "left" }}>
                        {estimate.end_date ?? "N/D"}
                      </td>
                      <td style={{ padding: 11 }}>{money(estimate.eps_average, currency)}</td>
                      <td style={{ padding: 11 }}>
                        {money(estimate.eps_low, currency)} — {money(estimate.eps_high, currency)}
                      </td>
                      <td style={{ padding: 11 }}>{money(estimate.eps_year_ago, currency)}</td>
                      <td
                        style={{
                          padding: 11,
                          color:
                            (estimate.eps_growth ?? 0) >= 0
                              ? "#16c79a"
                              : "#ff4d67",
                        }}
                      >
                        {pct(estimate.eps_growth)}
                      </td>
                      <td style={{ padding: 11 }}>{estimate.eps_analyst_count ?? "N/D"}</td>
                      <td style={{ padding: 11 }}>{compact(estimate.revenue_average, currency)}</td>
                      <td style={{ padding: 11 }}>
                        {compact(estimate.revenue_low, currency)} — {compact(estimate.revenue_high, currency)}
                      </td>
                      <td
                        style={{
                          padding: 11,
                          color:
                            (estimate.revenue_growth ?? 0) >= 0
                              ? "#16c79a"
                              : "#ff4d67",
                        }}
                      >
                        {pct(estimate.revenue_growth)}
                      </td>
                      <td style={{ padding: 11 }}>{estimate.revenue_analyst_count ?? "N/D"}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={11} style={{ padding: 28, color: "#7f9db1" }}>
                      Aucun consensus détaillé publié pour ce titre.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      ) : (
        <>
          <section style={panelStyle}>
            <span className="eyebrow">BÉNÉFICES PAR ACTION</span>
            <h2 style={{ margin: "4px 0 14px" }}>
              Réel, consensus et surprise
            </h2>
            <div
              style={{
                display: "grid",
                gridTemplateColumns:
                  "repeat(auto-fit, minmax(175px, 1fr))",
                gap: 10,
              }}
            >
              {snapshot.earnings_history.length ? (
                snapshot.earnings_history.map((quarter) => (
                  <div
                    key={quarter.period}
                    style={{
                      padding: 14,
                      border: "1px solid rgba(38,77,101,.72)",
                      borderRadius: 11,
                      background: "rgba(4,20,31,.76)",
                    }}
                  >
                    <strong>{quarter.period}</strong>
                    <div style={{ marginTop: 9, color: "#dcecf6" }}>
                      Réel : {money(quarter.actual, currency)}
                    </div>
                    <div style={{ color: "#819db0" }}>
                      Consensus : {money(quarter.estimate, currency)}
                    </div>
                    <div
                      style={{
                        marginTop: 7,
                        color:
                          (quarter.surprise_percent ?? 0) >= 0
                            ? "#16c79a"
                            : "#ff4d67",
                        fontWeight: 750,
                      }}
                    >
                      Surprise : {pct(quarter.surprise_percent)}
                    </div>
                  </div>
                ))
              ) : (
                <span style={{ color: "#7f9db1" }}>N/D</span>
              )}
            </div>
          </section>

          <Group title="Prochaines dates">
            <Metric
              label="Publication des résultats"
              value={
                snapshot.events.earnings_dates.length
                  ? snapshot.events.earnings_dates
                      .map(date)
                      .join(" — ")
                  : "N/D"
              }
            />
            <Metric
              label="Date ex-dividende"
              value={date(snapshot.events.ex_dividend_date)}
            />
            <Metric
              label="Versement du dividende"
              value={date(snapshot.events.dividend_date)}
            />
          </Group>
        </>
      )}
    </div>
  );
}

function AnalystsView({
  snapshot,
}: {
  snapshot: Snapshot;
}) {
  const a = snapshot.analysts;
  const currency = snapshot.currency ?? "CAD";
  const distribution = [
    ["Achat fort", a.strong_buy, "#12d8a5"],
    ["Achat", a.buy, "#49b98f"],
    ["Conserver", a.hold, "#6f8ca0"],
    ["Vente", a.sell, "#dc6c79"],
    ["Vente forte", a.strong_sell, "#ff4669"],
  ] as const;
  const total = distribution.reduce(
    (sum, [, value]) => sum + (value ?? 0),
    0,
  );

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <section
        style={{
          ...panelStyle,
          display: "grid",
          gridTemplateColumns:
            "repeat(auto-fit, minmax(260px, 1fr))",
          gap: 18,
        }}
      >
        <div>
          <span className="eyebrow">CONSENSUS ANALYSTES</span>
          <h2 style={{ margin: "5px 0 8px", fontSize: 28 }}>
            {a.recommendation_key
              ? a.recommendation_key.replaceAll("_", " ").toUpperCase()
              : "N/D"}
          </h2>
          <p style={{ color: "#819db0", margin: 0 }}>
            Note moyenne : {n(a.recommendation_mean)} ·{" "}
            {a.analyst_count ?? "N/D"} analystes
          </p>
        </div>

        <div
          style={{
            padding: 16,
            border: "1px solid rgba(38,77,101,.72)",
            borderRadius: 12,
            background: "rgba(4,20,31,.76)",
          }}
        >
          <span style={{ color: "#819db0", fontSize: 11 }}>
            Potentiel vers la cible moyenne
          </span>
          <strong
            style={{
              display: "block",
              marginTop: 8,
              fontSize: 30,
              color:
                (a.upside_to_mean_percent ?? 0) >= 0
                  ? "#16c79a"
                  : "#ff4d67",
            }}
          >
            {pct(a.upside_to_mean_percent)}
          </strong>
        </div>
      </section>

      <Group title="Objectifs de cours">
        <Metric label="Cours observé" value={money(a.current_price, currency)} />
        <Metric label="Objectif bas" value={money(a.target_low, currency)} />
        <Metric label="Objectif moyen" value={money(a.target_mean, currency)} />
        <Metric label="Objectif médian" value={money(a.target_median, currency)} />
        <Metric label="Objectif élevé" value={money(a.target_high, currency)} />
      </Group>

      <section style={panelStyle}>
        <h2 style={{ margin: "0 0 16px" }}>
          Répartition des recommandations
        </h2>
        <div style={{ display: "grid", gap: 12 }}>
          {distribution.map(([label, value, color]) => {
            const width =
              total > 0 ? ((value ?? 0) / total) * 100 : 0;
            return (
              <div key={label}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 12,
                    marginBottom: 5,
                    color: "#b9cfdd",
                    fontSize: 12,
                  }}
                >
                  <span>{label}</span>
                  <strong>{value ?? "N/D"}</strong>
                </div>
                <div
                  style={{
                    height: 9,
                    overflow: "hidden",
                    borderRadius: 999,
                    background: "rgba(44,76,96,.48)",
                  }}
                >
                  <div
                    style={{
                      width: `${width}%`,
                      height: "100%",
                      borderRadius: 999,
                      background: color,
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}

export function FocusFundamentals({
  ticker,
  view,
}: {
  ticker: string;
  view: FundamentalView;
}) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();

    async function load(): Promise<void> {
      setLoading(true);
      try {
        const response = await fetch(bridgeUrl(ticker), {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        setSnapshot((await response.json()) as Snapshot);
        setError(null);
      } catch (reason) {
        if (
          !(
            reason instanceof DOMException &&
            reason.name === "AbortError"
          )
        ) {
          setError(
            reason instanceof Error
              ? reason.message
              : "Chargement impossible.",
          );
        }
      } finally {
        setLoading(false);
      }
    }

    void load();
    return () => controller.abort();
  }, [ticker]);

  const generated = useMemo(
    () =>
      snapshot
        ? new Date(snapshot.generated_at).toLocaleString("fr-CA", {
            timeZone: "America/Toronto",
          })
        : null,
    [snapshot],
  );

  if (loading && !snapshot) {
    return (
      <section
        className="panel"
        style={{
          minHeight: 360,
          display: "grid",
          placeItems: "center",
          color: "#819db0",
        }}
      >
        Chargement des données fondamentales…
      </section>
    );
  }

  if (error && !snapshot) {
    return (
      <section className="panel" style={{ ...panelStyle, color: "#ffd9e0" }}>
        Données fondamentales indisponibles : {error}
      </section>
    );
  }

  if (!snapshot) {
    return null;
  }

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <header
        className="panel"
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 15,
          flexWrap: "wrap",
          padding: 16,
        }}
      >
        <div>
          <span className="eyebrow">FOCUS FONDAMENTAL</span>
          <h2 style={{ margin: "4px 0 0" }}>
            {snapshot.name}
          </h2>
          <p style={{ margin: "6px 0 0", color: "#819db0" }}>
            {[snapshot.sector, snapshot.industry]
              .filter(Boolean)
              .join(" · ") || "Classification non disponible"}
          </p>
        </div>
        <div style={{ textAlign: "right" }}>
          <strong
            style={{
              color:
                snapshot.status === "available"
                  ? "#16c79a"
                  : snapshot.status === "partial"
                    ? "#d2a45e"
                    : "#ff4d67",
            }}
          >
            {snapshot.status === "available"
              ? "Données disponibles"
              : snapshot.status === "partial"
                ? "Données partielles"
                : "Données indisponibles"}
          </strong>
          {snapshot.message ? (
            <div
              style={{
                maxWidth: 460,
                marginTop: 4,
                color: "#819db0",
                fontSize: 10,
              }}
            >
              {snapshot.message}
            </div>
          ) : null}
        </div>
      </header>

      {view === "fundamentals" ? (
        <Fundamentals snapshot={snapshot} />
      ) : view === "financials" ? (
        <Financials snapshot={snapshot} />
      ) : (
        <AnalystsView snapshot={snapshot} />
      )}

      <footer className="status-footer">
        Source : {snapshot.source} · Mise à jour : {generated ?? "N/D"} ·
        Les champs non publiés sont affichés N/D.
      </footer>
    </div>
  );
}
