"use client";

import {
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
import { usePreferences } from "@/components/providers/PreferencesProvider";
import "./FocusFundamentals.css";
import { FocusEstimates, type EarningsEstimate } from "./FocusEstimates";
import { FocusEarnings } from "./FocusEarnings";
import { FocusSeriesChart, type FocusChartSeries } from "./FocusSeriesChart";
import { FocusViewMode, useFocusMode, type FocusMode } from "./FocusViewMode";
import { localeFor, pick } from "@/lib/i18n";
import { getFocusFundamentalOverlay } from "@/lib/api";

export type FundamentalView =
  | "valuation"
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
  refresh_in_progress?: boolean;
  stale?: boolean;
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
  border: "1px solid var(--border)",
  borderRadius: 14,
  background: "var(--panel-2)",
  padding: 18,
} as const;

function signedTone(
  value: number | null,
): "positive" | "negative" | undefined {
  return value === null
    ? undefined
    : value >= 0
      ? "positive"
      : "negative";
}

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
    <div className="ff-metric">
      <span>{label}</span>
      <strong data-tone={tone}>{value}</strong>
    </div>
  );
}

function Group({
  title,
  children,
  items,
}: {
  title: string;
  children?: React.ReactNode;
  items?: Array<{ label: string; value: string; tone?: "positive" | "negative" }>;
}) {
  return (
    <section className="ff-group">
      <h2>{title}</h2>
      <div className="ff-groupGrid">{items?.map(item => <Metric key={item.label} {...item} />) ?? children}</div>
    </section>
  );
}


function Valuation({
  snapshot,
}: {
  snapshot: Snapshot;
}) {
  const { preferences } = usePreferences();
  const language = preferences.language;
  const m = snapshot.metrics;
  const [mode, chooseMode] = useFocusMode("anatole.focus.valuation.view.v3", ["table", "cards", "charts"]);
  const currency =
    snapshot.financial_currency ??
    snapshot.currency ??
    "CAD";
  const values = [
    m.market_cap,
    m.enterprise_value,
    m.trailing_pe,
    m.forward_pe,
    m.price_to_book,
    m.price_to_sales,
    m.enterprise_to_revenue,
    m.enterprise_to_ebitda,
    m.trailing_eps,
  ];
  const hasValuation = values.some(
    (value) => value !== null && Number.isFinite(value),
  );

  if (!hasValuation) {
    return (
      <section style={panelStyle} role="status">
        <h2 style={{ margin: "0 0 8px", fontSize: 18 }}>
          {pick(language, "Valorisation", "Valuation")}
        </h2>
        <span style={{ color: "var(--text-secondary)" }}>
          {pick(
            language,
            "Valorisation temporairement indisponible.",
            "Valuation data is temporarily unavailable.",
          )}
        </span>
      </section>
    );
  }

  return <div className="ff-modeStack">
    <FocusViewMode mode={mode} choose={chooseMode} modes={["table", "cards", "charts"]}
      language={language} label={pick(language, "Mode de la valorisation", "Valuation display mode")} />
    {mode === "charts" ? <FocusSeriesChart storageKey="valuation.ratios" title={pick(language,
      "Multiples disponibles à la date du cliché", "Available multiples at snapshot date")}
      periods={[snapshot.generated_at.slice(0, 10)]} source={snapshot.source} language={language} unit="number" kind="bar"
      series={[
        { id: "trailing_pe", label: pick(language, "C/B historique", "Trailing P/E"), values: [m.trailing_pe] },
        { id: "forward_pe", label: pick(language, "C/B anticipé", "Forward P/E"), values: [m.forward_pe] },
        { id: "price_to_book", label: pick(language, "Cours / valeur comptable", "Price / book"), values: [m.price_to_book] },
        { id: "price_to_sales", label: pick(language, "Cours / ventes", "Price / sales"), values: [m.price_to_sales] },
        { id: "enterprise_to_revenue", label: pick(language, "VE / Revenus", "EV / revenue"), values: [m.enterprise_to_revenue] },
        { id: "enterprise_to_ebitda", label: pick(language, "VE / BAIIA", "EV / EBITDA"), values: [m.enterprise_to_ebitda] },
      ]} /> : null}
    <Group title={pick(language, "Valorisation", "Valuation")} items={[
    { label: pick(language, "Capitalisation", "Market capitalization"), value: compact(m.market_cap, currency) },
    { label: pick(language, "Valeur d’entreprise", "Enterprise value"), value: compact(m.enterprise_value, currency) },
    { label: pick(language, "C/B historique", "Trailing P/E"), value: n(m.trailing_pe) },
    { label: pick(language, "C/B anticipé", "Forward P/E"), value: n(m.forward_pe) },
    { label: pick(language, "Cours / valeur comptable", "Price / book value"), value: n(m.price_to_book) },
    { label: pick(language, "Cours / ventes", "Price / sales"), value: n(m.price_to_sales) },
    { label: pick(language, "VE / Revenus", "EV / Revenue"), value: n(m.enterprise_to_revenue) },
    { label: pick(language, "VE / BAIIA", "EV / EBITDA"), value: n(m.enterprise_to_ebitda) },
    { label: pick(language, "BPA historique", "Trailing EPS"), value: money(m.trailing_eps, currency) },
  ]} />
  </div>;
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
  const [mode, chooseMode] = useFocusMode("anatole.focus.summary.view.v2", ["table", "cards", "charts"]);
  const annual = [...snapshot.annual_financials].sort((a, b) => a.period_end.localeCompare(b.period_end));

  return (
    <div className="ff-modeStack">
      <FocusViewMode mode={mode} choose={chooseMode} modes={["table", "cards", "charts"]}
        language={language} label={pick(language, "Mode de la synthèse", "Summary display mode")} />
      {mode === "charts" ? <FocusSeriesChart storageKey="summary" title={pick(language, "Croissance et rentabilité publiées", "Published growth and profitability")}
        periods={annual.map(row => row.period_end.slice(0, 10))}
        periodCurrencies={annual.map(row => row.currency ?? currency)}
        periodSources={annual.map(row => `${row.source?.source_name ?? snapshot.source} · ${row.source?.filed_at ?? "N/D"}`)}
        series={[
          { id: "revenue", label: pick(language, "Revenus", "Revenue"), values: annual.map(row => row.total_revenue) },
          { id: "ebitda", label: pick(language, "BAIIA", "EBITDA"), values: annual.map(row => row.ebitda) },
          { id: "operating", label: pick(language, "Résultat opérationnel", "Operating income"), values: annual.map(row => row.operating_income) },
          { id: "income", label: pick(language, "Bénéfice net", "Net income"), values: annual.map(row => row.net_income) },
          { id: "fcf", label: pick(language, "Flux disponible", "Free cash flow"), values: annual.map(row => row.free_cash_flow) },
        ]} unit="money" currency={currency} language={language} source={snapshot.source} /> : null}
    <div className="ff-fundamentalsGrid" data-mode={mode}>

      <Group title={pick(language, "Croissance et rentabilité", "Growth and profitability")} items={[
        { label: pick(language, "Chiffre d’affaires", "Revenue"), value: compact(m.total_revenue, currency) },
        { label: pick(language, "BAIIA", "EBITDA"), value: compact(m.ebitda, currency) },
        { label: pick(language, "Bénéfice net", "Net income"), value: compact(m.net_income_to_common, currency) },
        { label: pick(language, "Marge brute", "Gross margin"), value: pct(m.gross_margin) },
        { label: pick(language, "Marge opérationnelle", "Operating margin"), value: pct(m.operating_margin) },
        { label: pick(language, "Marge nette", "Net margin"), value: pct(m.profit_margin) },
        { label: pick(language, "Croissance des revenus", "Revenue growth"), value: pct(m.revenue_growth), tone: signedTone(m.revenue_growth) },
        { label: pick(language, "Croissance des bénéfices", "Earnings growth"), value: pct(m.earnings_growth), tone: signedTone(m.earnings_growth) },
      ]} />

      <Group title={pick(language, "Bilan et trésorerie", "Balance sheet and cash flow")} items={[
        { label: pick(language, "Trésorerie", "Cash"), value: compact(m.total_cash, currency) },
        { label: pick(language, "Dette totale", "Total debt"), value: compact(m.total_debt, currency) },
        { label: pick(language, "Dette / capitaux propres", "Debt / equity"), value: n(m.debt_to_equity) },
        { label: pick(language, "Ratio courant", "Current ratio"), value: n(m.current_ratio) },
        { label: pick(language, "Ratio rapide", "Quick ratio"), value: n(m.quick_ratio) },
        { label: pick(language, "Flux de trésorerie opérationnel", "Operating cash flow"), value: compact(m.operating_cash_flow, currency) },
        { label: pick(language, "Flux de trésorerie disponible", "Free cash flow"), value: compact(m.free_cash_flow, currency) },
        { label: pick(language, "Rendement des capitaux propres", "Return on equity"), value: pct(m.return_on_equity) },
      ]} />

      <Group title={pick(language, "Marché et dividende", "Market and dividend")} items={[
        { label: pick(language, "Bêta", "Beta"), value: n(m.beta) },
        { label: pick(language, "Sommet 52 semaines", "52-week high"), value: money(m.fifty_two_week_high, currency) },
        { label: pick(language, "Creux 52 semaines", "52-week low"), value: money(m.fifty_two_week_low, currency) },
        { label: pick(language, "Actions en circulation", "Shares outstanding"), value: compact(m.shares_outstanding) },
        { label: pick(language, "Rendement du dividende", "Dividend yield"), value: pct(m.dividend_yield) },
        { label: pick(language, "Dividende annuel", "Annual dividend"), value: money(m.dividend_rate, currency) },
        { label: pick(language, "Ratio de distribution", "Payout ratio"), value: pct(m.payout_ratio) },
        { label: pick(language, "Volume moyen 3 mois", "3-month average volume"), value: compact(m.average_volume_3m) },
      ]} />
    </div>
    </div>
  );
}

function financialCells(row: FinancialPeriod, view: StatementView, currency: string): Array<[string, (number | null)?]> {
  if (view === "income") return [
    [compact(row.total_revenue, currency)], [compact(row.cost_of_revenue, currency)],
    [compact(row.gross_profit, currency)], [compact(row.operating_income, currency)],
    [compact(row.ebitda, currency)], [compact(row.net_income, currency)],
    [money(row.diluted_eps, currency)], [pct(row.revenue_growth_yoy), row.revenue_growth_yoy],
    [pct(row.net_income_growth_yoy), row.net_income_growth_yoy],
  ];
  if (view === "cashflow") return [
    [compact(row.operating_cash_flow, currency)], [signedCompact(row.capital_expenditure, currency)],
    [compact(row.free_cash_flow, currency)], [pct(row.free_cash_flow_margin)],
    [signedCompact(row.dividends_paid, currency)], [signedCompact(row.share_repurchases, currency)],
    [pct(row.free_cash_flow_growth_yoy), row.free_cash_flow_growth_yoy],
  ];
  if (view === "balance") return [
    [compact(row.total_cash, currency)], [compact(row.total_debt, currency)],
    [compact(row.net_debt, currency)], [compact(row.current_assets, currency)],
    [compact(row.current_liabilities, currency)], [compact(row.total_assets, currency)],
    [compact(row.total_liabilities, currency)], [compact(row.stockholder_equity, currency)],
  ];
  return [
    [pct(row.gross_margin)], [pct(row.operating_margin)], [pct(row.net_margin)],
    [pct(row.free_cash_flow_margin)], [pct(row.eps_growth_yoy), row.eps_growth_yoy],
    [compact(row.diluted_average_shares)],
  ];
}

function FinancialTable({
  rows,
  view,
  currency,
  mode = "table",
}: {
  rows: FinancialPeriod[];
  view: StatementView;
  currency: string;
  mode?: FocusMode;
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
    <div data-mode={mode} className="ff-financialTableWrap">
      <table data-view={view} className="ff-financialTable">
        <thead>
          <tr>
            {headers.map((header) => (
              <th key={header} scope="col">
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length ? (
            rows.map((row) => (
              <tr key={`${view}-${row.period_end}`}>
                <th scope="row">
                  <div>{periodLabel(row.period_end)}</div>
                  {row.source ? <small className="ff-periodSource">{row.source.source_name}
                    {row.source.filed_at ? ` · ${periodLabel(row.source.filed_at)}` : ""}</small> : null}
                </th>

                {financialCells(row, view, currency).map(([value, delta], index) =>
                  <td key={index} data-label={headers[index + 1]} data-tone={delta === undefined ? undefined : tone(delta)}>{value}</td>)}
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={headers.length} className="ff-tableEmpty">
                {pick(language, "Cette série n’est pas publiée par la source.", "This series is not published by the source.")}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function StatementCharts({ rows, view, frequency, currency, language, source }: {
  rows: FinancialPeriod[]; view: StatementView; currency: string;
  language: "fr" | "en"; source: string; frequency: "annual" | "quarterly";
}) {
  type SeriesField = { key: keyof FinancialPeriod; fr: string; en: string };
  const moneyGroups: SeriesField[][] = view === "income" ? [[
    { key: "total_revenue", fr: "Revenus", en: "Revenue" },
    { key: "operating_income", fr: "Résultat opérationnel", en: "Operating income" },
    { key: "ebitda", fr: "BAIIA", en: "EBITDA" },
    { key: "net_income", fr: "Bénéfice net", en: "Net income" },
  ], [{ key: "diluted_eps", fr: "BPA dilué", en: "Diluted EPS" }]]
    : view === "cashflow" ? [[
      { key: "operating_cash_flow", fr: "Flux opérationnel", en: "Operating cash flow" },
      { key: "capital_expenditure", fr: "Immobilisations (signées)", en: "Capital expenditure (signed)" },
      { key: "free_cash_flow", fr: "Flux disponible", en: "Free cash flow" },
    ]] : view === "balance" ? [[
      { key: "total_assets", fr: "Actifs", en: "Assets" },
      { key: "total_liabilities", fr: "Passifs", en: "Liabilities" },
      { key: "stockholder_equity", fr: "Capitaux propres", en: "Equity" },
      { key: "total_debt", fr: "Dette", en: "Debt" },
    ]] : [[
      { key: "gross_margin", fr: "Marge brute", en: "Gross margin" },
      { key: "operating_margin", fr: "Marge opérationnelle", en: "Operating margin" },
      { key: "net_margin", fr: "Marge nette", en: "Net margin" },
      { key: "free_cash_flow_margin", fr: "Marge FTD", en: "FCF margin" },
      { key: "eps_growth_yoy", fr: "Croissance BPA", en: "EPS growth" },
    ]];
  const chronological = [...rows].sort((a, b) => a.period_end.localeCompare(b.period_end));
  return <div className="ff-chartGrid" data-testid="financials-chart-view">
    {moneyGroups.map((group, index) => {
      const series: FocusChartSeries[] = group.map(field => ({ id: field.key, label: pick(language, field.fr, field.en),
        values: chronological.map(row => row[field.key] as number | null) }));
      return <FocusSeriesChart key={`${view}-${index}`} storageKey={`statements.${frequency}.${view}.${index}`} title={pick(language,
        view === "income" && index === 1 ? "BPA dilué publié" : "Évolution des données publiées",
        view === "income" && index === 1 ? "Published diluted EPS" : "Published data over time")}
        periods={chronological.map(row => row.period_end.slice(0, 10))}
        periodCurrencies={chronological.map(row => row.currency ?? currency)}
        periodSources={chronological.map(row => `${row.source?.source_name ?? source} · ${row.source?.filed_at ?? "N/D"}`)} series={series}
        unit={view === "margins" ? "percent" : view === "income" && index === 1 ? "per_share" : "money"} currency={currency} language={language} source={source} />;
    })}
  </div>;
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
  const [mode, chooseMode] = useFocusMode("anatole.focus.financials.view.v2", ["table", "cards", "charts"]);
  const [overviewMode, chooseOverviewMode] = useFocusMode("anatole.focus.overview.view.v2", ["table", "cards", "charts"]);

  const currency =
    snapshot.financial_currency ??
    snapshot.currency ??
    "CAD";
  const t = snapshot.ttm;
  const h = snapshot.highlights;
  const annual = snapshot.annual_financials;
  const quarterly = snapshot.quarterly_financials;
  const annualChronological = [...annual].sort((a, b) => a.period_end.localeCompare(b.period_end));

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
        className="ff-resultsNav"
      >
        {resultTabs.map((tab) => {
          const active = subview === tab.key;
          return (
            <button
              type="button"
              key={tab.key}
              onClick={() => setSubview(tab.key)}
              aria-pressed={active}
              className="ff-resultsTab"
            >
              {pick(language, tab.label[0], tab.label[1])}
            </button>
          );
        })}
      </nav>

      {subview === "overview" ? (
        <div className="ff-modeStack" data-mode={overviewMode}>
          <FocusViewMode mode={overviewMode} choose={chooseOverviewMode} modes={["table", "cards", "charts"]}
            language={language} label={pick(language, "Mode de la vue d’ensemble", "Overview display mode")} />
          <section style={panelStyle}>
            <span className="eyebrow">{pick(language, "DOUZE DERNIERS MOIS", "TRAILING TWELVE MONTHS")}</span>
            <h2 style={{ margin: "4px 0 14px" }}>
              {pick(language, "Tableau de bord financier", "Financial dashboard")}
            </h2>

            <div className="ff-dashboardMetrics">{([
              [pick(language, "Revenus TTM", "TTM revenue"), compact(t.total_revenue, currency)],
              [pick(language, "Résultat opérationnel TTM", "TTM operating income"), compact(t.operating_income, currency)],
              [pick(language, "BAIIA TTM", "TTM EBITDA"), compact(t.ebitda, currency)],
              [pick(language, "Bénéfice net TTM", "TTM net income"), compact(t.net_income, currency)],
              [pick(language, "BPA dilué TTM", "TTM diluted EPS"), money(t.diluted_eps, currency)],
              [pick(language, "Flux disponible TTM", "TTM free cash flow"), compact(t.free_cash_flow, currency)],
              [pick(language, "Dette nette", "Net debt"), compact(t.net_debt, currency)],
              [pick(language, "Dette nette / BAIIA", "Net debt / EBITDA"), n(h.net_debt_to_ebitda)],
            ] as const).map(([label, value]) => <Metric key={label} label={label} value={value} />)}</div>
          </section>

          <div className="ff-fundamentalsGrid">
            <Group title={pick(language, "Croissance du dernier trimestre", "Latest-quarter growth")} items={[
              { label: pick(language, "Revenus sur un an", "Revenue year over year"), value: pct(h.revenue_growth_yoy), tone: tone(h.revenue_growth_yoy) },
              { label: pick(language, "Résultat opérationnel sur un an", "Operating income year over year"), value: pct(h.operating_income_growth_yoy), tone: tone(h.operating_income_growth_yoy) },
              { label: pick(language, "Bénéfice net sur un an", "Net income year over year"), value: pct(h.net_income_growth_yoy), tone: tone(h.net_income_growth_yoy) },
              { label: pick(language, "BPA sur un an", "EPS year over year"), value: pct(h.eps_growth_yoy), tone: tone(h.eps_growth_yoy) },
              { label: pick(language, "Flux disponible sur un an", "Free cash flow year over year"), value: pct(h.free_cash_flow_growth_yoy), tone: tone(h.free_cash_flow_growth_yoy) },
            ]} />

            <Group title={pick(language, "Qualité des résultats TTM", "TTM earnings quality")} items={[
              { label: pick(language, "Marge brute", "Gross margin"), value: pct(t.gross_margin) },
              { label: pick(language, "Marge opérationnelle", "Operating margin"), value: pct(t.operating_margin) },
              { label: pick(language, "Marge nette", "Net margin"), value: pct(t.net_margin) },
              { label: pick(language, "Marge de flux disponible", "Free cash flow margin"), value: pct(t.free_cash_flow_margin) },
              { label: pick(language, "Conversion bénéfice → flux", "Income-to-cash conversion"), value: pct(h.cash_conversion_percent) },
            ]} />

            <Group title={pick(language, "Croissance annualisée sur trois ans", "Three-year annualized growth")} items={[
              { label: pick(language, "Revenus", "Revenue"), value: pct(h.three_year_revenue_cagr), tone: tone(h.three_year_revenue_cagr) },
              { label: pick(language, "Bénéfice net", "Net income"), value: pct(h.three_year_net_income_cagr), tone: tone(h.three_year_net_income_cagr) },
              { label: pick(language, "Flux disponible", "Free cash flow"), value: pct(h.three_year_free_cash_flow_cagr), tone: tone(h.three_year_free_cash_flow_cagr) },
            ]} />
          </div>

          {overviewMode === "charts" ? <FocusSeriesChart storageKey="overview"
            title={pick(language, "Historique annuel publié", "Published annual history")}
            periods={annualChronological.map(row => row.period_end.slice(0, 10))}
            periodCurrencies={annualChronological.map(row => row.currency ?? currency)}
            periodSources={annualChronological.map(row => `${row.source?.source_name ?? snapshot.source} · ${row.source?.filed_at ?? "N/D"}`)}
            series={[
              { id: "revenue", label: pick(language, "Revenus", "Revenue"), values: annualChronological.map(row => row.total_revenue) },
              { id: "ebitda", label: pick(language, "BAIIA", "EBITDA"), values: annualChronological.map(row => row.ebitda) },
              { id: "operating", label: pick(language, "Résultat opérationnel", "Operating income"), values: annualChronological.map(row => row.operating_income) },
              { id: "income", label: pick(language, "Bénéfice net", "Net income"), values: annualChronological.map(row => row.net_income) },
              { id: "fcf", label: pick(language, "Flux disponible", "Free cash flow"), values: annualChronological.map(row => row.free_cash_flow) },
            ]} unit="money" currency={currency} language={language} source={snapshot.source} />
            : <FinancialTable rows={annual} view="income" currency={currency} mode={overviewMode} />}
        </div>
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
              className="ff-statementNav"
            >
              {statementTabs.map((tab) => {
                const active = statementView === tab.key;
                return (
                  <button
                    type="button"
                    key={tab.key}
                    onClick={() => setStatementView(tab.key)}
                    aria-pressed={active}
                    className="ff-statementTab"
                  >
                    {pick(language, tab.label[0], tab.label[1])}
                  </button>
                );
              })}
            </div>
          </div>

          <FocusViewMode mode={mode} choose={chooseMode} modes={["table", "cards", "charts"]} language={language}
            label={pick(language, "Mode d’affichage des états financiers", "Financial statements display mode")} />
          {mode === "charts" ? <StatementCharts rows={subview === "quarterly" ? quarterly : annual}
            view={statementView} frequency={subview === "quarterly" ? "quarterly" : "annual"}
            currency={currency} language={language} source={snapshot.source} />
            : <FinancialTable rows={subview === "quarterly" ? quarterly : annual}
              view={statementView} currency={currency} mode={mode} />}
        </section>
      ) : subview === "estimates" ? (
        <FocusEstimates rows={snapshot.earnings_estimates} currency={currency} language={language} source={snapshot.source} partial={snapshot.status !== "available" || Boolean(snapshot.stale)} />
      ) : (
        <FocusEarnings history={snapshot.earnings_history} events={snapshot.events}
          currency={currency} language={language} source={snapshot.source} />
      )}
    </div>
  );
}

type DistributionType = "bar" | "pie" | "donut";
const distributionKey = "anatole.focus.analysts.distribution.v3";
const distributionEvent = "anatole-focus-analyst-distribution";
let currentDistributionType: DistributionType | null = null;
function readDistributionType(): DistributionType {
  if (currentDistributionType) return currentDistributionType;
  try {
    const saved = window.localStorage.getItem(distributionKey);
    if (saved === "bar" || saved === "pie" || saved === "donut") return saved;
  } catch { /* Preferences remain usable when storage is blocked. */ }
  return "bar";
}
function subscribeDistribution(notify: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key !== distributionKey) return;
    currentDistributionType = event.newValue === "pie" || event.newValue === "donut" ? event.newValue : "bar";
    notify();
  };
  window.addEventListener(distributionEvent, notify);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(distributionEvent, notify);
    window.removeEventListener("storage", onStorage);
  };
}
function useDistributionType() {
  const type = useSyncExternalStore(subscribeDistribution, readDistributionType, () => "bar");
  const choose = (value: DistributionType) => {
    currentDistributionType = value;
    try { window.localStorage.setItem(distributionKey, value); } catch { /* Optional persistence. */ }
    window.dispatchEvent(new Event(distributionEvent));
  };
  return [type, choose] as const;
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
    [pick(language, "Achat fort", "Strong buy"), a.strong_buy, "positive"],
    [pick(language, "Achat", "Buy"), a.buy, "positive"],
    [pick(language, "Conserver", "Hold"), a.hold, "neutral"],
    [pick(language, "Vente", "Sell"), a.sell, "negative"],
    [pick(language, "Vente forte", "Strong sell"), a.strong_sell, "negative"],
  ] as const;
  const total = distribution.reduce(
    (sum, [, value]) => sum + (value ?? 0),
    0,
  );
  const [mode, chooseMode] = useFocusMode("anatole.focus.analysts.view.v2", ["table", "cards", "charts"]);
  const [distributionType, setDistributionType] = useDistributionType();
  const [highlighted, setHighlighted] = useState<string | null>(null);
  const validComposition = total > 0 && distribution.every(([, value]) => value !== null && Number.isFinite(value) && value >= 0);
  const distributionColors = ["#16847a", "#3a9fff", "#a38d49", "#d3844b", "#c7596d"];
  let cumulative = 0;
  const slices = distribution.map(([, value], index) => {
    const start = cumulative;
    cumulative += validComposition ? (value as number) / total * 100 : 0;
    return `${distributionColors[index]} ${start}% ${cumulative}%`;
  }).join(", ");
  const targets = [
    [pick(language, "Cours observé", "Current price"), a.current_price],
    [pick(language, "Objectif bas", "Low target"), a.target_low],
    [pick(language, "Objectif médian", "Median target"), a.target_median],
    [pick(language, "Objectif moyen", "Average target"), a.target_mean],
    [pick(language, "Objectif élevé", "High target"), a.target_high],
  ] as const;
  const targetValues = targets.map(([, value]) => value).filter((value): value is number => value !== null && Number.isFinite(value));
  const targetMin = Math.min(...targetValues);
  const targetSpan = Math.max(...targetValues) - targetMin || 1;

  if (!Object.entries(a).some(([key, value]) => key !== "current_price" && value !== null)) {
    return <section style={panelStyle} role="status">{pick(language,
      "Consensus analystes temporairement indisponible.",
      "Analyst consensus temporarily unavailable.")}</section>;
  }

  return (
    <div className="ff-analystsStack">
      <FocusViewMode mode={mode} choose={chooseMode} modes={["table", "cards", "charts"]}
        language={language} label={pick(language, "Mode du consensus analystes", "Analyst consensus display mode")} />
      <section className="ff-analystsHero">
        <div>
          <span className="eyebrow">{pick(language, "CONSENSUS ANALYSTES", "ANALYST CONSENSUS")}</span>
          <h2 className="ff-analystsRating">
            {a.recommendation_key
              ? a.recommendation_key.replaceAll("_", " ").toUpperCase()
              : "N/D"}
          </h2>
          <p className="ff-analystsMeta">
            {pick(language, "Note moyenne", "Average rating")}: {n(a.recommendation_mean)} ·{" "}
            {a.analyst_count ?? "N/D"} {pick(language, "analystes", "analysts")}
          </p>
        </div>

        <div className="ff-analystsUpside">
          <span>
            {pick(language, "Potentiel vers la cible moyenne", "Upside to average target")}
          </span>
          <strong data-tone={tone(a.upside_to_mean_percent)}>
            {pct(a.upside_to_mean_percent)}
          </strong>
        </div>
      </section>

      {mode === "charts" ? <section className="ff-group">
        <h2>{pick(language, "Répartition des recommandations", "Recommendation distribution")}</h2>
        <div className="ff-chartType" role="group" aria-label={pick(language, "Type de graphique", "Chart type")}>
          {(["bar", "pie", "donut"] as const).map(type => <button type="button" key={type}
            aria-pressed={distributionType === type} disabled={type !== "bar" && !validComposition}
            onClick={() => setDistributionType(type)}>{type === "bar" ? pick(language, "Barres", "Bars")
              : type === "pie" ? pick(language, "Secteurs", "Pie") : pick(language, "Anneau", "Donut")}</button>)}
        </div>
        {!validComposition ? <p>{pick(language,
          "Secteurs et anneau indisponibles : catégories incomplètes, négatives ou total nul.",
          "Pie and donut unavailable: incomplete or negative categories, or zero total.")}</p> : null}
        {distributionType === "bar" || !validComposition ? total > 0 ? <div className="ff-stackedDistribution" role="img"
          aria-label={distribution.map(([label, value]) => `${label}: ${value ?? "N/D"}`).join(", ")}>
          {distribution.map(([label, value, direction]) => <span key={label} data-tone={direction}
            style={{ width: `${((value ?? 0) / total) * 100}%` }} title={`${label}: ${value ?? "N/D"}`} />)}
        </div> : <p>{pick(language, "Répartition indisponible.", "Distribution unavailable.")}</p>
          : <div className="ff-composition" data-kind={distributionType} role="img"
            aria-label={distribution.map(([label, value]) => `${label}: ${value ?? "N/D"}`).join(", ")}
            style={{ background: `conic-gradient(${slices})` }} />}
        <div className="ff-distributionLegend">{distribution.map(([label, value], index) => <button type="button" key={label}
          aria-pressed={highlighted === label} onClick={() => setHighlighted(highlighted === label ? null : label)}
          style={{ borderLeft: `4px solid ${distributionColors[index]}` }}>{label}: {value ?? "N/D"}</button>)}</div>
        {highlighted ? <p role="status">{highlighted}: {distribution.find(([label]) => label === highlighted)?.[1] ?? "N/D"}
          {validComposition ? ` · ${(((distribution.find(([label]) => label === highlighted)?.[1] ?? 0) / total) * 100).toFixed(1)} %` : ""}</p> : null}
        <h2>{pick(language, "Fourchette des objectifs", "Price target range")}</h2>
        {targetValues.length > 1 ? <div className="ff-targetRange" role="img" aria-label={targets.map(([label, value]) => `${label}: ${money(value, currency)}`).join(", ")}>
          {targets.map(([label, value]) => value === null ? null : <span key={label} className="ff-targetMarker"
            style={{ left: `${((value - targetMin) / targetSpan) * 100}%` }} title={`${label}: ${money(value, currency)}`} />)}
        </div> : <p>{pick(language, "Fourchette insuffisante.", "Insufficient target range.")}</p>}
      </section> : null}
      {mode === "table" ? <section className="ff-group"><h2>{pick(language, "Données exactes du consensus", "Exact consensus data")}</h2>
        <div className="ff-analystsTableWrap"><table className="ff-analystsTable"><thead><tr><th scope="col">{pick(language, "Indicateur", "Metric")}</th><th scope="col">{pick(language, "Valeur", "Value")}</th></tr></thead><tbody>
          {targets.map(([label, value]) => <tr key={label}><th scope="row">{label}</th><td>{money(value, currency)}</td></tr>)}
          {distribution.map(([label, value]) => <tr key={label}><th scope="row">{label}</th><td>{value ?? "N/D"}</td></tr>)}
        </tbody></table></div></section> : <Group title={pick(language, "Objectifs de cours", "Price targets")} items={[
        { label: pick(language, "Cours observé", "Current price"), value: money(a.current_price, currency) },
        { label: pick(language, "Objectif bas", "Low target"), value: money(a.target_low, currency) },
        { label: pick(language, "Objectif moyen", "Average target"), value: money(a.target_mean, currency) },
        { label: pick(language, "Objectif médian", "Median target"), value: money(a.target_median, currency) },
        { label: pick(language, "Objectif élevé", "High target"), value: money(a.target_high, currency) },
      ]} />}

      {mode === "cards" ? <section className="ff-group">
        <h2>
          {pick(language, "Répartition des recommandations", "Recommendation distribution")}
        </h2>
        <div className="ff-distribution">
          {distribution.map(([label, value, direction]) => {
            const width =
              total > 0 ? ((value ?? 0) / total) * 100 : 0;
            return (
              <div key={label}>
                <div className="ff-distributionLabel">
                  <span>{label}</span>
                  <strong>{value ?? "N/D"}</strong>
                </div>
                <div className="ff-distributionTrack">
                  <div className="ff-distributionFill" data-tone={direction} style={{ width: `${width}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      </section> : null}
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
  const [revision, setRevision] = useState(0);
  const identity = (value: string) => value.toUpperCase().replace(/\.TO$/, "").replaceAll("-", ".");
  const currentSnapshot = snapshot && identity(snapshot.ticker) === identity(ticker) ? snapshot : null;

  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let failures = 0;
    let progressPolls = 0;

    async function load(): Promise<void> {
      setLoading(true);
      try {
        const value = await getFocusFundamentalOverlay(ticker, controller.signal) as Snapshot;
        if (controller.signal.aborted) return;
        setSnapshot((old) => old?.ticker === value.ticker && old.status !== "unavailable" && value.status === "unavailable" ? old : value);
        setError(null);
        failures = 0;
        progressPolls = value.refresh_in_progress ? progressPolls + 1 : 0;
        const refreshSeconds = Number.isFinite(value.refresh_after_seconds)
          ? Math.max(30, Math.min(value.refresh_after_seconds, 1_800)) : 300;
        const delay = value.refresh_in_progress
          ? (progressPolls <= 15 ? 3_000 : 30_000)
          : Math.min(refreshSeconds, value.stale || value.status === "unavailable" ? 300 : 1_800) * 1_000;
        timer = setTimeout(() => void load(), delay);
      } catch {
        if (!controller.signal.aborted) {
          setError(
            pick(
              language,
              "La source fondamentale est temporairement indisponible.",
              "The fundamental data source is temporarily unavailable.",
            ),
          );
          failures += 1;
          timer = setTimeout(() => void load(), Math.min(30_000 * 2 ** Math.min(failures - 1, 4), 300_000));
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }

    void load();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [language, ticker, revision]);

  const generated = useMemo(
    () =>
      snapshot
        ? new Date(snapshot.generated_at).toLocaleString(localeFor(language), {
            timeZone: "America/Toronto",
          })
        : null,
    [language, snapshot],
  );

  if (!currentSnapshot && !error) {
    return (
      <section className="ff-loadingPanel" data-view={view}>
        {view === "valuation"
          ? pick(language, "Synchronisation de la valorisation…", "Synchronizing valuation…")
          : pick(language, "Chargement des données fondamentales…", "Loading fundamental data…")}
      </section>
    );
  }

  if (error && !currentSnapshot) {
    return (
      <section className="ff-errorPanel">
        {pick(language, "Données fondamentales indisponibles", "Fundamental data unavailable")}: {language === "fr" ? error : "The data provider did not return a usable response."}
      </section>
    );
  }

  if (!currentSnapshot || !snapshot) {
    return null;
  }

  if (snapshot.status === "unavailable" && snapshot.refresh_in_progress) {
    return <section className="panel" style={panelStyle} role="status">
      {view === "valuation"
        ? pick(language, "Synchronisation de la valorisation…", "Synchronizing valuation…")
        : pick(language, "Synchronisation des données fondamentales…", "Synchronizing fundamental data…")}
    </section>;
  }

  if (view === "valuation") {
    return (
      <div className="ff-valuationStack" data-focus-valuation="true">
        {(loading || snapshot.refresh_in_progress || error || snapshot.stale) ? (
          <div role="status" className="ff-valuationStatus">
            {error || snapshot.stale
              ? pick(language, "Dernières données disponibles", "Latest available data")
              : pick(language, "Actualisation en cours…", "Refreshing…")}
          </div>
        ) : null}
        <Valuation snapshot={snapshot} />
        <footer className="status-footer">
          {pick(language, "Source", "Source")}: {snapshot.source} · {pick(language, "Mise à jour", "Updated")}: {generated ?? "N/D"}
        </footer>
      </div>
    );
  }

  return (
    <div className="ff-focusStack">
      <div role="status">
        {loading || snapshot.refresh_in_progress ? pick(language, "Synchronisation en cours…", "Synchronization in progress…") : null}
        {error || snapshot.stale ? pick(language, "Dernières données disponibles", "Latest available data") : null}
        <button type="button" className="button-secondary" disabled={loading} onClick={() => setRevision(value => value + 1)}>
          {pick(language, "Actualiser", "Refresh")}
        </button>
      </div>
      <header className="ff-focusHeader">
        <div>
          <span className="eyebrow">{pick(language, "FOCUS FONDAMENTAL", "FUNDAMENTAL FOCUS")}</span>
          <h2 className="ff-focusName">
            {snapshot.name}
          </h2>
          <p className="ff-focusClassification">
            {[snapshot.sector, snapshot.industry]
              .filter(Boolean)
              .join(" · ") || pick(language, "Classification non disponible", "Classification unavailable")}
          </p>
        </div>
        <div className="ff-focusAvailability">
          <strong data-status={snapshot.status}>
            {snapshot.status === "available"
              ? pick(language, "Données disponibles", "Data available")
              : snapshot.status === "partial"
                ? pick(language, "Données partielles", "Partial data")
                : pick(language, "Données indisponibles", "Data unavailable")}
          </strong>
          {snapshot.message ? (
            <div className="ff-focusMessage">
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
