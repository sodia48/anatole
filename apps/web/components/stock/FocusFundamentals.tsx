"use client";

import {
  useEffect,
  useMemo,
  useState,
} from "react";
import { usePreferences } from "@/components/providers/PreferencesProvider";
import { localeFor, pick } from "@/lib/i18n";

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

type FinancialSource = {
  source_type:
    | "sec_edgar_xbrl"
    | "issuer_official_normalized"
    | "issuer_official_document"
    | "yahoo_structured"
    | "yahoo_public";
  source_name: string;
  source_url: string | null;
  filed_at: string | null;
  form: string | null;
  confidence: "official" | "secondary";
};

type OfficialCoverage = {
  is_tsx_composite: boolean;
  status:
    | "official"
    | "mixed"
    | "fallback"
    | "unavailable";
  official_periods: number;
  annual_official_periods: number;
  quarterly_official_periods: number;
  official_fields: number;
  sec_cik: string | null;
  source_types: string[];
  documents_found: number;
  documents_parsed: number;
  structured_periods: number;
  annual_structured_periods: number;
  quarterly_structured_periods: number;
  structured_fields: number;
  calculated_fields: number;
  yahoo_statements_error: string | null;
  discovery_url: string | null;
  message: string | null;
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
  calculated_fields: string[];
  source: FinancialSource | null;
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
  financial_currency: string | null;
  website: string | null;
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
  official_coverage: OfficialCoverage;
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
  const { preferences } = usePreferences();
  const language = preferences.language;
  const m = snapshot.metrics;
  const currency =
    snapshot.financial_currency ??
    snapshot.currency ??
    "CAD";

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns:
          "repeat(auto-fit, minmax(360px, 1fr))",
        gap: 14,
      }}
    >
      <Group title={pick(language, "Valorisation", "Valuation")}>
        <Metric label={pick(language, "Capitalisation", "Market capitalization")} value={compact(m.market_cap, currency)} />
        <Metric label={pick(language, "Valeur d’entreprise", "Enterprise value")} value={compact(m.enterprise_value, currency)} />
        <Metric label={pick(language, "C/B historique", "Trailing P/E")} value={n(m.trailing_pe)} />
        <Metric label={pick(language, "C/B anticipé", "Forward P/E")} value={n(m.forward_pe)} />
        <Metric label={pick(language, "Cours / valeur comptable", "Price / book value")} value={n(m.price_to_book)} />
        <Metric label={pick(language, "Cours / ventes", "Price / sales")} value={n(m.price_to_sales)} />
        <Metric label={pick(language, "VE / BAIIA", "EV / EBITDA")} value={n(m.enterprise_to_ebitda)} />
        <Metric label={pick(language, "BPA historique", "Trailing EPS")} value={money(m.trailing_eps, currency)} />
      </Group>

      <Group title={pick(language, "Croissance et rentabilité", "Growth and profitability")}>
        <Metric label={pick(language, "Chiffre d’affaires", "Revenue")} value={compact(m.total_revenue, currency)} />
        <Metric label={pick(language, "BAIIA", "EBITDA")} value={compact(m.ebitda, currency)} />
        <Metric label={pick(language, "Bénéfice net", "Net income")} value={compact(m.net_income_to_common, currency)} />
        <Metric label={pick(language, "Marge brute", "Gross margin")} value={pct(m.gross_margin)} />
        <Metric label={pick(language, "Marge opérationnelle", "Operating margin")} value={pct(m.operating_margin)} />
        <Metric label={pick(language, "Marge nette", "Net margin")} value={pct(m.profit_margin)} />
        <Metric label={pick(language, "Croissance des revenus", "Revenue growth")} value={pct(m.revenue_growth)} tone={(m.revenue_growth ?? 0) >= 0 ? "positive" : "negative"} />
        <Metric label={pick(language, "Croissance des bénéfices", "Earnings growth")} value={pct(m.earnings_growth)} tone={(m.earnings_growth ?? 0) >= 0 ? "positive" : "negative"} />
      </Group>

      <Group title={pick(language, "Bilan et trésorerie", "Balance sheet and cash flow")}>
        <Metric label={pick(language, "Trésorerie", "Cash")} value={compact(m.total_cash, currency)} />
        <Metric label={pick(language, "Dette totale", "Total debt")} value={compact(m.total_debt, currency)} />
        <Metric label={pick(language, "Dette / capitaux propres", "Debt / equity")} value={n(m.debt_to_equity)} />
        <Metric label={pick(language, "Ratio courant", "Current ratio")} value={n(m.current_ratio)} />
        <Metric label={pick(language, "Ratio rapide", "Quick ratio")} value={n(m.quick_ratio)} />
        <Metric label={pick(language, "Flux de trésorerie opérationnel", "Operating cash flow")} value={compact(m.operating_cash_flow, currency)} />
        <Metric label={pick(language, "Flux de trésorerie disponible", "Free cash flow")} value={compact(m.free_cash_flow, currency)} />
        <Metric label={pick(language, "Rendement des capitaux propres", "Return on equity")} value={pct(m.return_on_equity)} />
      </Group>

      <Group title={pick(language, "Marché et dividende", "Market and dividend")}>
        <Metric label={pick(language, "Bêta", "Beta")} value={n(m.beta)} />
        <Metric label={pick(language, "Sommet 52 semaines", "52-week high")} value={money(m.fifty_two_week_high, currency)} />
        <Metric label={pick(language, "Creux 52 semaines", "52-week low")} value={money(m.fifty_two_week_low, currency)} />
        <Metric label={pick(language, "Actions en circulation", "Shares outstanding")} value={compact(m.shares_outstanding)} />
        <Metric label={pick(language, "Rendement du dividende", "Dividend yield")} value={pct(m.dividend_yield)} />
        <Metric label={pick(language, "Dividende annuel", "Annual dividend")} value={money(m.dividend_rate, currency)} />
        <Metric label={pick(language, "Ratio de distribution", "Payout ratio")} value={pct(m.payout_ratio)} />
        <Metric label={pick(language, "Volume moyen 3 mois", "3-month average volume")} value={compact(m.average_volume_3m)} />
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
  const { preferences } = usePreferences();
  const language = preferences.language;
  const headers =
    view === "income"
      ? (language === "fr" ? [
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
        ] : ["Period", "Revenue", "Cost of revenue", "Gross profit", "Operating income", "EBITDA", "Net income", "Diluted EPS", "Revenue growth", "Earnings growth"])
      : view === "cashflow"
        ? (language === "fr" ? [
            "Période",
            "Flux opérationnel",
            "Immobilisations",
            "Flux disponible",
            "Marge FTD",
            "Dividendes",
            "Rachats d’actions",
            "Croissance FTD",
          ] : ["Period", "Operating cash flow", "Capital expenditure", "Free cash flow", "FCF margin", "Dividends", "Share repurchases", "FCF growth"])
        : view === "balance"
          ? (language === "fr" ? [
              "Période",
              "Trésorerie",
              "Dette",
              "Dette nette",
              "Actifs courants",
              "Passifs courants",
              "Actifs",
              "Passifs",
              "Capitaux propres",
            ] : ["Period", "Cash", "Debt", "Net debt", "Current assets", "Current liabilities", "Assets", "Liabilities", "Shareholders’ equity"])
          : (language === "fr" ? [
              "Période",
              "Marge brute",
              "Marge opérationnelle",
              "Marge nette",
              "Marge FTD",
              "Croissance BPA",
              "Actions diluées",
            ] : ["Period", "Gross margin", "Operating margin", "Net margin", "FCF margin", "EPS growth", "Diluted shares"]);

  return (
    <div data-mobile-table-wrap="true" style={{ overflowX: "auto" }}>
      <table data-mobile-cards="fundamentals" data-view={view}
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
                  <div>{periodLabel(row.period_end)}</div>
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
                {pick(language, "Cette série n’est pas publiée par la source.", "This series is not published by the source.")}
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
  const { preferences } = usePreferences();
  const language = preferences.language;
  const [subview, setSubview] =
    useState<ResultsSubview>("overview");
  const [statementView, setStatementView] =
    useState<StatementView>("income");

  const currency =
    snapshot.financial_currency ??
    snapshot.currency ??
    "CAD";
  const t = snapshot.ttm;
  const h = snapshot.highlights;
  const annual = snapshot.annual_financials;
  const quarterly = snapshot.quarterly_financials;

  const resultTabs: Array<{
    key: ResultsSubview;
    label: readonly [string, string];
  }> = [
    { key: "overview", label: ["Vue d’ensemble", "Overview"] },
    { key: "quarterly", label: ["Trimestriel", "Quarterly"] },
    { key: "annual", label: ["Annuel", "Annual"] },
    { key: "estimates", label: ["Estimations", "Estimates"] },
    { key: "earnings", label: ["BPA & calendrier", "EPS & calendar"] },
  ];

  const statementTabs: Array<{
    key: StatementView;
    label: readonly [string, string];
  }> = [
    { key: "income", label: ["Compte de résultat", "Income statement"] },
    { key: "cashflow", label: ["Flux de trésorerie", "Cash flow"] },
    { key: "balance", label: ["Bilan", "Balance sheet"] },
    { key: "margins", label: ["Marges & croissance", "Margins & growth"] },
  ];

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <nav
        aria-label={pick(language, "Vues des résultats financiers", "Financial results views")}
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
              {pick(language, tab.label[0], tab.label[1])}
            </button>
          );
        })}
      </nav>

      {subview === "overview" ? (
        <>
          <section style={panelStyle}>
            <span className="eyebrow">{pick(language, "DOUZE DERNIERS MOIS", "TRAILING TWELVE MONTHS")}</span>
            <h2 style={{ margin: "4px 0 14px" }}>
              {pick(language, "Tableau de bord financier", "Financial dashboard")}
            </h2>

            <div
              style={{
                display: "grid",
                gridTemplateColumns:
                  "repeat(auto-fit, minmax(160px, 1fr))",
                gap: 10,
              }}
            >
              <Metric label={pick(language, "Revenus TTM", "TTM revenue")} value={compact(t.total_revenue, currency)} />
              <Metric label={pick(language, "Résultat opérationnel TTM", "TTM operating income")} value={compact(t.operating_income, currency)} />
              <Metric label={pick(language, "BAIIA TTM", "TTM EBITDA")} value={compact(t.ebitda, currency)} />
              <Metric label={pick(language, "Bénéfice net TTM", "TTM net income")} value={compact(t.net_income, currency)} />
              <Metric label={pick(language, "BPA dilué TTM", "TTM diluted EPS")} value={money(t.diluted_eps, currency)} />
              <Metric label={pick(language, "Flux disponible TTM", "TTM free cash flow")} value={compact(t.free_cash_flow, currency)} />
              <Metric label={pick(language, "Dette nette", "Net debt")} value={compact(t.net_debt, currency)} />
              <Metric
                label={pick(language, "Dette nette / BAIIA", "Net debt / EBITDA")}
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
            <Group title={pick(language, "Croissance du dernier trimestre", "Latest-quarter growth")}>
              <Metric
                label={pick(language, "Revenus sur un an", "Revenue year over year")}
                value={pct(h.revenue_growth_yoy)}
                tone={tone(h.revenue_growth_yoy)}
              />
              <Metric
                label={pick(language, "Résultat opérationnel sur un an", "Operating income year over year")}
                value={pct(h.operating_income_growth_yoy)}
                tone={tone(h.operating_income_growth_yoy)}
              />
              <Metric
                label={pick(language, "Bénéfice net sur un an", "Net income year over year")}
                value={pct(h.net_income_growth_yoy)}
                tone={tone(h.net_income_growth_yoy)}
              />
              <Metric
                label={pick(language, "BPA sur un an", "EPS year over year")}
                value={pct(h.eps_growth_yoy)}
                tone={tone(h.eps_growth_yoy)}
              />
              <Metric
                label={pick(language, "Flux disponible sur un an", "Free cash flow year over year")}
                value={pct(h.free_cash_flow_growth_yoy)}
                tone={tone(h.free_cash_flow_growth_yoy)}
              />
            </Group>

            <Group title={pick(language, "Qualité des résultats TTM", "TTM earnings quality")}>
              <Metric label={pick(language, "Marge brute", "Gross margin")} value={pct(t.gross_margin)} />
              <Metric label={pick(language, "Marge opérationnelle", "Operating margin")} value={pct(t.operating_margin)} />
              <Metric label={pick(language, "Marge nette", "Net margin")} value={pct(t.net_margin)} />
              <Metric label={pick(language, "Marge de flux disponible", "Free cash flow margin")} value={pct(t.free_cash_flow_margin)} />
              <Metric
                label={pick(language, "Conversion bénéfice → flux", "Income-to-cash conversion")}
                value={pct(h.cash_conversion_percent)}
              />
            </Group>

            <Group title={pick(language, "Croissance annualisée sur trois ans", "Three-year annualized growth")}>
              <Metric
                label={pick(language, "Revenus", "Revenue")}
                value={pct(h.three_year_revenue_cagr)}
                tone={tone(h.three_year_revenue_cagr)}
              />
              <Metric
                label={pick(language, "Bénéfice net", "Net income")}
                value={pct(h.three_year_net_income_cagr)}
                tone={tone(h.three_year_net_income_cagr)}
              />
              <Metric
                label={pick(language, "Flux disponible", "Free cash flow")}
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
              title={pick(language, "Évolution annuelle des revenus", "Annual revenue trend")}
              rows={annual}
              field="total_revenue"
              currency={currency}
            />
            <MiniTrend
              title={pick(language, "Évolution annuelle du bénéfice net", "Annual net-income trend")}
              rows={annual}
              field="net_income"
              currency={currency}
            />
            <MiniTrend
              title={pick(language, "Évolution annuelle du flux disponible", "Annual free-cash-flow trend")}
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
                  ? pick(language, "RÉSULTATS TRIMESTRIELS", "QUARTERLY RESULTS")
                  : pick(language, "RÉSULTATS ANNUELS", "ANNUAL RESULTS")}
              </span>
              <h2 style={{ margin: "4px 0 0" }}>
                {pick(language, "États financiers détaillés", "Detailed financial statements")}
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
                    {pick(language, tab.label[0], tab.label[1])}
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
          <span className="eyebrow">{pick(language, "ATTENTES DU MARCHÉ", "MARKET EXPECTATIONS")}</span>
          <h2 style={{ margin: "4px 0 14px" }}>
            {pick(language, "Estimations de revenus et de BPA", "Revenue and EPS estimates")}
          </h2>

          <div data-mobile-table-wrap="true" style={{ overflowX: "auto" }}>
            <table data-mobile-cards="estimates"
              style={{
                width: "100%",
                minWidth: 1150,
                borderCollapse: "collapse",
                fontSize: 11,
              }}
            >
              <thead>
                <tr style={{ color: "#7898ad", textAlign: "right" }}>
                  {(language === "fr" ? [
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
                  ] : ["Period", "End", "Average EPS", "EPS range", "Prior-year EPS", "EPS growth", "EPS analysts", "Average revenue", "Revenue range", "Revenue growth", "Revenue analysts"]).map((header, index) => (
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
                      {pick(language, "Aucun consensus détaillé publié pour ce titre.", "No detailed consensus is published for this security.")}
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
            <span className="eyebrow">{pick(language, "BÉNÉFICES PAR ACTION", "EARNINGS PER SHARE")}</span>
            <h2 style={{ margin: "4px 0 14px" }}>
              {pick(language, "Réel, consensus et surprise", "Actual, consensus, and surprise")}
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
                      {pick(language, "Réel", "Actual")}: {money(quarter.actual, currency)}
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

          <Group title={pick(language, "Prochaines dates", "Upcoming dates")}>
            <Metric
              label={pick(language, "Publication des résultats", "Earnings release")}
              value={
                snapshot.events.earnings_dates.length
                  ? snapshot.events.earnings_dates
                      .map(date)
                      .join(" — ")
                  : "N/D"
              }
            />
            <Metric
              label={pick(language, "Date ex-dividende", "Ex-dividend date")}
              value={date(snapshot.events.ex_dividend_date)}
            />
            <Metric
              label={pick(language, "Versement du dividende", "Dividend payment")}
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
  const { preferences } = usePreferences();
  const language = preferences.language;
  const a = snapshot.analysts;
  const currency = snapshot.currency ?? "CAD";
  const distribution = [
    [pick(language, "Achat fort", "Strong buy"), a.strong_buy, "#12d8a5"],
    [pick(language, "Achat", "Buy"), a.buy, "#49b98f"],
    [pick(language, "Conserver", "Hold"), a.hold, "#6f8ca0"],
    [pick(language, "Vente", "Sell"), a.sell, "#dc6c79"],
    [pick(language, "Vente forte", "Strong sell"), a.strong_sell, "#ff4669"],
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
          <span className="eyebrow">{pick(language, "CONSENSUS ANALYSTES", "ANALYST CONSENSUS")}</span>
          <h2 style={{ margin: "5px 0 8px", fontSize: 28 }}>
            {a.recommendation_key
              ? a.recommendation_key.replaceAll("_", " ").toUpperCase()
              : "N/D"}
          </h2>
          <p style={{ color: "#819db0", margin: 0 }}>
            {pick(language, "Note moyenne", "Average rating")}: {n(a.recommendation_mean)} ·{" "}
            {a.analyst_count ?? "N/D"} {pick(language, "analystes", "analysts")}
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
            {pick(language, "Potentiel vers la cible moyenne", "Upside to average target")}
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

      <Group title={pick(language, "Objectifs de cours", "Price targets")}>
        <Metric label={pick(language, "Cours observé", "Current price")} value={money(a.current_price, currency)} />
        <Metric label={pick(language, "Objectif bas", "Low target")} value={money(a.target_low, currency)} />
        <Metric label={pick(language, "Objectif moyen", "Average target")} value={money(a.target_mean, currency)} />
        <Metric label={pick(language, "Objectif médian", "Median target")} value={money(a.target_median, currency)} />
        <Metric label={pick(language, "Objectif élevé", "High target")} value={money(a.target_high, currency)} />
      </Group>

      <section style={panelStyle}>
        <h2 style={{ margin: "0 0 16px" }}>
          {pick(language, "Répartition des recommandations", "Recommendation distribution")}
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
  const { preferences } = usePreferences();
  const language = preferences.language;
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
              : pick(language, "Chargement impossible.", "Unable to load data."),
          );
        }
      } finally {
        setLoading(false);
      }
    }

    void load();
    return () => controller.abort();
  }, [language, ticker]);

  const generated = useMemo(
    () =>
      snapshot
        ? new Date(snapshot.generated_at).toLocaleString(localeFor(language), {
            timeZone: "America/Toronto",
          })
        : null,
    [language, snapshot],
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
        {pick(language, "Chargement des données fondamentales…", "Loading fundamental data…")}
      </section>
    );
  }

  if (error && !snapshot) {
    return (
      <section className="panel" style={{ ...panelStyle, color: "#ffd9e0" }}>
        {pick(language, "Données fondamentales indisponibles", "Fundamental data unavailable")}: {language === "fr" ? error : "The data provider did not return a usable response."}
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
          <span className="eyebrow">{pick(language, "FOCUS FONDAMENTAL", "FUNDAMENTAL FOCUS")}</span>
          <h2 style={{ margin: "4px 0 0" }}>
            {snapshot.name}
          </h2>
          <p style={{ margin: "6px 0 0", color: "#819db0" }}>
            {[snapshot.sector, snapshot.industry]
              .filter(Boolean)
              .join(" · ") || pick(language, "Classification non disponible", "Classification unavailable")}
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
              ? pick(language, "Données disponibles", "Data available")
              : snapshot.status === "partial"
                ? pick(language, "Données partielles", "Partial data")
                : pick(language, "Données indisponibles", "Data unavailable")}
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
              {language === "fr" ? snapshot.message : "Some fields may be unavailable from the current source."}
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
        {pick(language, "Source", "Source")}: {snapshot.source} · {pick(language, "Mise à jour", "Updated")}: {generated ?? "N/D"} · {pick(language, "Certaines valeurs peuvent être calculées à partir des données disponibles · Les champs indéterminables sont affichés N/D.", "Some values may be calculated from available data · Fields that cannot be determined are displayed as N/A.")}
      </footer>
    </div>
  );
}
