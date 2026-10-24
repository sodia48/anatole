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
import { analystRecommendation, formatFinancialNumber } from "@anatole/shared/financial-display";
import { focusFiscalYearEndMonth, focusPeriodLabel } from "@anatole/shared/focus-chart";

const tr = pick;

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
  field_sources?: Record<string, FinancialSource | null>;
};

const seriesSources = (rows: FinancialPeriod[], field: keyof FinancialPeriod) =>
  rows.map(row => (row.field_sources && field in row.field_sources ? row.field_sources[field] : row.source)?.source_name ?? null);

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
): string {
  return formatFinancialNumber(value, { language: "fr" });
}

function money(
  value: number | null,
  currency = "CAD",
): string {
  return formatFinancialNumber(value, { language: "fr", unit: "money", currency });
}

function compact(
  value: number | null,
  currency?: string | null,
): string {
  return formatFinancialNumber(value, { language: "fr", unit: "money", currency });
}

function pct(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "N/D";
  return `${value > 0 ? "+" : ""}${formatFinancialNumber(value, { language: "fr", unit: "percent" })}`;
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

type OverviewDatum = { label: string; value: string; tone?: "positive" | "negative" };
const hasFinancialValue = (item: OverviewDatum) => item.value !== "N/D";


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
          {tr(language, "Valorisation", "Valuation")}
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
      language={language} label={tr(language, "Mode de la valorisation", "Valuation display mode")} />
    {mode === "charts" ? <FocusSeriesChart storageKey="valuation.ratios" title={tr(language,
      "Multiples disponibles à la date du cliché", "Available multiples at snapshot date")}
      periods={[snapshot.generated_at.slice(0, 10)]} source={snapshot.source} language={language} unit="number" kind="bar"
      series={[
        { id: "trailing_pe", label: tr(language, "C/B historique", "Trailing P/E"), values: [m.trailing_pe] },
        { id: "forward_pe", label: tr(language, "C/B anticipé", "Forward P/E"), values: [m.forward_pe] },
        { id: "price_to_book", label: tr(language, "Cours / valeur comptable", "Price / book"), values: [m.price_to_book] },
        { id: "price_to_sales", label: tr(language, "Cours / ventes", "Price / sales"), values: [m.price_to_sales] },
        { id: "enterprise_to_revenue", label: tr(language, "VE / Revenus", "EV / revenue"), values: [m.enterprise_to_revenue] },
        { id: "enterprise_to_ebitda", label: tr(language, "VE / BAIIA", "EV / EBITDA"), values: [m.enterprise_to_ebitda] },
      ]} /> : null}
    <Group title={tr(language, "Valorisation", "Valuation")} items={[
    { label: tr(language, "Capitalisation", "Market capitalization"), value: compact(m.market_cap, currency) },
    { label: tr(language, "Valeur d’entreprise", "Enterprise value"), value: compact(m.enterprise_value, currency) },
    { label: tr(language, "C/B historique", "Trailing P/E"), value: n(m.trailing_pe) },
    { label: tr(language, "C/B anticipé", "Forward P/E"), value: n(m.forward_pe) },
    { label: tr(language, "Cours / valeur comptable", "Price / book value"), value: n(m.price_to_book) },
    { label: tr(language, "Cours / ventes", "Price / sales"), value: n(m.price_to_sales) },
    { label: tr(language, "VE / Revenus", "EV / Revenue"), value: n(m.enterprise_to_revenue) },
    { label: tr(language, "VE / BAIIA", "EV / EBITDA"), value: n(m.enterprise_to_ebitda) },
    { label: tr(language, "BPA historique", "Trailing EPS"), value: money(m.trailing_eps, currency) },
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
        language={language} label={tr(language, "Mode de la synthèse", "Summary display mode")} />
      {mode === "charts" ? <FocusSeriesChart storageKey="summary" title={tr(language, "Croissance et rentabilité publiées", "Published growth and profitability")}
        periods={annual.map(row => row.period_end.slice(0, 10))}
        periodCurrencies={annual.map(row => row.currency)}
        periodSources={annual.map(row => `${row.source?.source_name ?? snapshot.source} · ${row.source?.filed_at ?? "N/D"}`)}
        series={[
          { id: "revenue", label: tr(language, "Revenus", "Revenue"), values: annual.map(row => row.total_revenue), sources: seriesSources(annual, "total_revenue") },
          { id: "ebitda", label: tr(language, "BAIIA", "EBITDA"), values: annual.map(row => row.ebitda), sources: seriesSources(annual, "ebitda") },
          { id: "operating", label: tr(language, "Résultat opérationnel", "Operating income"), values: annual.map(row => row.operating_income), sources: seriesSources(annual, "operating_income") },
          { id: "income", label: tr(language, "Bénéfice net", "Net income"), values: annual.map(row => row.net_income), sources: seriesSources(annual, "net_income") },
          { id: "fcf", label: tr(language, "Flux disponible", "Free cash flow"), values: annual.map(row => row.free_cash_flow), sources: seriesSources(annual, "free_cash_flow") },
        ]} unit="money" currency={currency} language={language} source={snapshot.source} /> : null}
    <div className="ff-fundamentalsGrid" data-mode={mode}>

      <Group title={tr(language, "Croissance et rentabilité", "Growth and profitability")} items={[
        { label: tr(language, "Chiffre d’affaires", "Revenue"), value: compact(m.total_revenue, currency) },
        { label: tr(language, "BAIIA", "EBITDA"), value: compact(m.ebitda, currency) },
        { label: tr(language, "Bénéfice net", "Net income"), value: compact(m.net_income_to_common, currency) },
        { label: tr(language, "Marge brute", "Gross margin"), value: pct(m.gross_margin) },
        { label: tr(language, "Marge opérationnelle", "Operating margin"), value: pct(m.operating_margin) },
        { label: tr(language, "Marge nette", "Net margin"), value: pct(m.profit_margin) },
        { label: tr(language, "Croissance des revenus", "Revenue growth"), value: pct(m.revenue_growth), tone: signedTone(m.revenue_growth) },
        { label: tr(language, "Croissance des bénéfices", "Earnings growth"), value: pct(m.earnings_growth), tone: signedTone(m.earnings_growth) },
      ]} />

      <Group title={tr(language, "Bilan et trésorerie", "Balance sheet and cash flow")} items={[
        { label: tr(language, "Trésorerie", "Cash"), value: compact(m.total_cash, currency) },
        { label: tr(language, "Dette totale", "Total debt"), value: compact(m.total_debt, currency) },
        { label: tr(language, "Dette / capitaux propres", "Debt / equity"), value: n(m.debt_to_equity) },
        { label: tr(language, "Ratio courant", "Current ratio"), value: n(m.current_ratio) },
        { label: tr(language, "Ratio rapide", "Quick ratio"), value: n(m.quick_ratio) },
        { label: tr(language, "Flux de trésorerie opérationnel", "Operating cash flow"), value: compact(m.operating_cash_flow, currency) },
        { label: tr(language, "Flux de trésorerie disponible", "Free cash flow"), value: compact(m.free_cash_flow, currency) },
        { label: tr(language, "Rendement des capitaux propres", "Return on equity"), value: pct(m.return_on_equity) },
      ]} />

      <Group title={tr(language, "Marché et dividende", "Market and dividend")} items={[
        { label: tr(language, "Bêta", "Beta"), value: n(m.beta) },
        { label: tr(language, "Sommet 52 semaines", "52-week high"), value: money(m.fifty_two_week_high, currency) },
        { label: tr(language, "Creux 52 semaines", "52-week low"), value: money(m.fifty_two_week_low, currency) },
        { label: tr(language, "Actions en circulation", "Shares outstanding"), value: compact(m.shares_outstanding) },
        { label: tr(language, "Rendement du dividende", "Dividend yield"), value: pct(m.dividend_yield) },
        { label: tr(language, "Dividende annuel", "Annual dividend"), value: money(m.dividend_rate, currency) },
        { label: tr(language, "Ratio de distribution", "Payout ratio"), value: pct(m.payout_ratio) },
        { label: tr(language, "Volume moyen 3 mois", "3-month average volume"), value: compact(m.average_volume_3m) },
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
                {tr(language, "Cette série n’est pas publiée par la source.", "This series is not published by the source.")}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function StatementCharts({ rows, view, frequency, fiscalYearEndMonth, currency, language, source }: {
  rows: FinancialPeriod[]; view: StatementView; currency: string;
  language: "fr" | "en"; source: string; frequency: "annual" | "quarterly"; fiscalYearEndMonth: number | null;
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
  const periods = chronological.map(row => row.period_end.slice(0, 10));
  const periodLabels = chronological.map(row => focusPeriodLabel(row.period_end, frequency, fiscalYearEndMonth));
  const periodCurrencies = chronological.map(row => row.currency);
  const periodSources = chronological.map(row => `${row.source?.source_name ?? source} · ${row.source?.filed_at ?? "N/D"}`);
  return <div className="ff-chartGrid" data-testid="financials-chart-view">
    {moneyGroups.map((group, index) => {
      const series: FocusChartSeries[] = group.map(field => ({ id: field.key, label: tr(language, field.fr, field.en),
        values: chronological.map(row => row[field.key] as number | null),
        sources: seriesSources(chronological, field.key) }));
      return <FocusSeriesChart key={`${view}-${index}`} storageKey={`statements.${frequency}.${view}.${index}`} title={tr(language,
        view === "income" && index === 1 ? "BPA dilué publié" : "Évolution des données publiées",
        view === "income" && index === 1 ? "Published diluted EPS" : "Published data over time")}
        periods={periods} periodLabels={periodLabels} periodCurrencies={periodCurrencies}
        periodSources={periodSources} series={series}
        unit={view === "margins" ? "percent" : view === "income" && index === 1 ? "per_share" : "money"} currency={currency} language={language} source={source} />;
    })}
  </div>;
}

type DashboardData = {
  headlineAvailable: OverviewDatum[]; otherHeadline: OverviewDatum[];
  growth: OverviewDatum[]; quality: OverviewDatum[]; longTerm: OverviewDatum[];
  missing: { item: OverviewDatum; reason: string }[];
};
type DashboardInput = {
  t: TTMSummary; h: FinancialHighlights; currency: string; financialSector: boolean;
  status: Snapshot["status"]; coverage: OfficialCoverage | null; annualCount: number; quarterlyCount: number;
  language: "fr" | "en"; compact: typeof compact; money: typeof money; pct: typeof pct; n: typeof n; tone: typeof tone;
};
type DashboardLayout = { buildDashboard: (input: DashboardInput) => DashboardData };

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
  const [dashboardLayout, setDashboardLayout] = useState<DashboardLayout | null>(null);
  useEffect(() => {
    if (subview !== "overview") return;
    let active = true;
    const moduleUrl = "/focus-dashboard-layout.mjs";
    void import(/* webpackIgnore: true */ /* turbopackIgnore: true */ moduleUrl)
      .then(value => { if (active) setDashboardLayout(value as DashboardLayout); })
      .catch(() => { /* Core verified metrics remain visible if the optional layout cannot load. */ });
    return () => { active = false; };
  }, [subview]);

  const currency =
    snapshot.financial_currency ??
    snapshot.currency ??
    "CAD";
  const t = snapshot.ttm;
  const dashboardCurrency = t.currency ?? currency;
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

  const financialSector = /bank|financial|finance|assur|insurance/i.test(`${snapshot.sector ?? ""} ${snapshot.industry ?? ""}`);
  const dashboard = dashboardLayout?.buildDashboard({ t, h, currency: dashboardCurrency, financialSector,
    status: snapshot.status, coverage: snapshot.official_coverage, annualCount: annual.length,
    quarterlyCount: quarterly.length, language, compact, money, pct, n, tone });
  const headlineAvailable = dashboard?.headlineAvailable ?? [
    { label: tr(language, "Revenus TTM", "TTM revenue"), value: compact(t.total_revenue, dashboardCurrency) },
    { label: tr(language, "Bénéfice net TTM", "TTM net income"), value: compact(t.net_income, dashboardCurrency) },
    { label: tr(language, "Flux disponible TTM", "TTM free cash flow"), value: compact(t.free_cash_flow, dashboardCurrency) },
  ].filter(hasFinancialValue);
  const { otherHeadline = [], growth = [], quality = [], longTerm = [], missing = [] } = dashboard ?? {};

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <nav
        aria-label={tr(language, "Vues des résultats financiers", "Financial results views")}
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
              {tr(language, tab.label[0], tab.label[1])}
            </button>
          );
        })}
      </nav>

      {subview === "overview" ? (
        <div className="ff-modeStack" data-mode={overviewMode}>
          <FocusViewMode mode={overviewMode} choose={chooseOverviewMode} modes={["table", "cards", "charts"]}
            language={language} label={tr(language, "Mode de la vue d’ensemble", "Overview display mode")} />
          <section style={panelStyle}>
            <span className="eyebrow">{tr(language, "DOUZE DERNIERS MOIS", "TRAILING TWELVE MONTHS")}</span>
            <h2 style={{ margin: "4px 0 14px" }}>
              {tr(language, "Tableau de bord financier", "Financial dashboard")}
            </h2>

            {snapshot.stale ? <p className="ff-overviewFreshness">{tr(language,
              "Dernier instantané disponible · vérifier la date des sources avant toute comparaison.",
              "Last available snapshot · check source dates before comparing.")}</p> : null}
            {headlineAvailable.length ? <div className="ff-dashboardMetrics">
              {headlineAvailable.map(item => <Metric key={item.label} {...item} />)}
            </div> : <p className="ff-overviewEmpty">{tr(language,
              "Aucune métrique TTM vérifiée pour cet instantané.", "No verified TTM metric for this snapshot.")}</p>}
          </section>

          <div className="ff-fundamentalsGrid">
            {growth.length ? <Group title={tr(language, "Croissance du dernier trimestre", "Latest-quarter growth")}
              items={growth} /> : null}
            {quality.length ? <Group title={tr(language, "Qualité des résultats TTM", "TTM earnings quality")}
              items={quality} /> : null}
            {longTerm.length ? <Group title={tr(language, "Croissance annualisée sur trois ans", "Three-year annualized growth")}
              items={longTerm} /> : null}
          </div>

          {missing.length ? <details className="ff-missingData"><summary>{tr(language,
            "Voir les données indisponibles", "View unavailable data")} · {missing.length}</summary>
            <ul>{missing.map(({ item, reason }, index) => <li key={index}><span>{item.label}</span>
              <small>{reason}</small></li>)}</ul>
          </details> : null}
          {otherHeadline.length ? <details className="ff-missingData"><summary>{tr(language,
            "Autres indicateurs disponibles", "Other available metrics")} · {otherHeadline.length}</summary>
            <div className="ff-dashboardMetrics">{otherHeadline.map(item =>
              <Metric key={item.label} label={item.label} value={item.value} tone={item.tone} />)}</div>
          </details> : null}

          {overviewMode === "charts" ? <FocusSeriesChart storageKey="overview"
            title={tr(language, "Historique annuel publié", "Published annual history")}
            periods={annualChronological.map(row => row.period_end.slice(0, 10))}
            periodCurrencies={annualChronological.map(row => row.currency)}
            periodSources={annualChronological.map(row => `${row.source?.source_name ?? snapshot.source} · ${row.source?.filed_at ?? "N/D"}`)}
            series={[
              { id: "revenue", label: tr(language, "Revenus", "Revenue"), values: annualChronological.map(row => row.total_revenue) },
              { id: "ebitda", label: tr(language, "BAIIA", "EBITDA"), values: annualChronological.map(row => row.ebitda) },
              { id: "operating", label: tr(language, "Résultat opérationnel", "Operating income"), values: annualChronological.map(row => row.operating_income) },
              { id: "income", label: tr(language, "Bénéfice net", "Net income"), values: annualChronological.map(row => row.net_income) },
              { id: "fcf", label: tr(language, "Flux disponible", "Free cash flow"), values: annualChronological.map(row => row.free_cash_flow) },
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
                  ? tr(language, "RÉSULTATS TRIMESTRIELS", "QUARTERLY RESULTS")
                  : tr(language, "RÉSULTATS ANNUELS", "ANNUAL RESULTS")}
              </span>
              <h2 style={{ margin: "4px 0 0" }}>
                {tr(language, "États financiers détaillés", "Detailed financial statements")}
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
                    {tr(language, tab.label[0], tab.label[1])}
                  </button>
                );
              })}
            </div>
          </div>

          <FocusViewMode mode={mode} choose={chooseMode} modes={["table", "cards", "charts"]} language={language}
            label={tr(language, "Mode d’affichage des états financiers", "Financial statements display mode")} />
          {mode === "charts" ? <StatementCharts rows={subview === "quarterly" ? quarterly : annual}
            view={statementView} frequency={subview === "quarterly" ? "quarterly" : "annual"}
            fiscalYearEndMonth={focusFiscalYearEndMonth(annual)}
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
  const currency = snapshot.currency;
  const distribution = [
    [tr(language, "Achat fort", "Strong buy"), a.strong_buy, "positive"],
    [tr(language, "Achat", "Buy"), a.buy, "positive"],
    [tr(language, "Conserver", "Hold"), a.hold, "neutral"],
    [tr(language, "Vente", "Sell"), a.sell, "negative"],
    [tr(language, "Vente forte", "Strong sell"), a.strong_sell, "negative"],
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
    [tr(language, "Cours observé", "Current price"), a.current_price, currency],
    [tr(language, "Objectif bas", "Low target"), a.target_low, null],
    [tr(language, "Objectif médian", "Median target"), a.target_median, null],
    [tr(language, "Objectif moyen", "Average target"), a.target_mean, null],
    [tr(language, "Objectif élevé", "High target"), a.target_high, null],
  ] as const;
  const targetText = (value: number | null, verifiedCurrency: string | null) => formatFinancialNumber(value,
    { language, unit: verifiedCurrency ? "money" : "plain", currency: verifiedCurrency });
  const targetValues = targets.map(([, value]) => value).filter((value): value is number => value !== null && Number.isFinite(value));
  const targetMin = Math.min(...targetValues);
  const targetSpan = Math.max(...targetValues) - targetMin || 1;

  if (!Object.entries(a).some(([key, value]) => key !== "current_price" && value !== null)) {
    return <section style={panelStyle} role="status">{tr(language,
      "Consensus analystes temporairement indisponible.",
      "Analyst consensus temporarily unavailable.")}</section>;
  }

  return (
    <div className="ff-analystsStack">
      <FocusViewMode mode={mode} choose={chooseMode} modes={["table", "cards", "charts"]}
        language={language} label={tr(language, "Mode du consensus analystes", "Analyst consensus display mode")} />
      <section className="ff-analystsHero">
        <div>
          <span className="eyebrow">{tr(language, "CONSENSUS ANALYSTES", "ANALYST CONSENSUS")}</span>
          <h2 className="ff-analystsRating">
            {analystRecommendation(a.recommendation_key, language)}
          </h2>
          <p className="ff-analystsMeta">
            {tr(language, "Note moyenne", "Average rating")}: {n(a.recommendation_mean)} ·{" "}
            {a.analyst_count ?? "N/D"} {tr(language, "analystes", "analysts")}
          </p>
        </div>

        <div className="ff-analystsUpside">
          <span>
            {tr(language, "Potentiel vers la cible moyenne", "Upside to average target")}
          </span>
          <strong data-tone={tone(a.upside_to_mean_percent)}>
            {pct(a.upside_to_mean_percent)}
          </strong>
        </div>
      </section>

      {mode === "charts" ? <section className="ff-group">
        <h2>{tr(language, "Répartition des recommandations", "Recommendation distribution")}</h2>
        <div className="ff-chartType" role="group" aria-label={tr(language, "Type de graphique", "Chart type")}>
          {(["bar", "pie", "donut"] as const).map(type => <button type="button" key={type}
            aria-pressed={distributionType === type} disabled={type !== "bar" && !validComposition}
            onClick={() => setDistributionType(type)}>{type === "bar" ? tr(language, "Barres", "Bars")
              : type === "pie" ? tr(language, "Secteurs", "Pie") : tr(language, "Anneau", "Donut")}</button>)}
        </div>
        {!validComposition ? <p>{tr(language,
          "Secteurs et anneau indisponibles : catégories incomplètes, négatives ou total nul.",
          "Pie and donut unavailable: incomplete or negative categories, or zero total.")}</p> : null}
        {distributionType === "bar" || !validComposition ? total > 0 ? <div className="ff-stackedDistribution" role="img"
          aria-label={distribution.map(([label, value]) => `${label}: ${value ?? "N/D"}`).join(", ")}>
          {distribution.map(([label, value, direction]) => <span key={label} data-tone={direction}
            style={{ width: `${((value ?? 0) / total) * 100}%` }} title={`${label}: ${value ?? "N/D"}`} />)}
        </div> : <p>{tr(language, "Répartition indisponible.", "Distribution unavailable.")}</p>
          : <div className="ff-composition" data-kind={distributionType} role="img"
            aria-label={distribution.map(([label, value]) => `${label}: ${value ?? "N/D"}`).join(", ")}
            style={{ background: `conic-gradient(${slices})` }} />}
        <div className="ff-distributionLegend">{distribution.map(([label, value], index) => <button type="button" key={label}
          aria-pressed={highlighted === label} onClick={() => setHighlighted(highlighted === label ? null : label)}
          style={{ borderLeft: `4px solid ${distributionColors[index]}` }}>{label}: {value ?? "N/D"}</button>)}</div>
        {highlighted ? <p role="status">{highlighted}: {distribution.find(([label]) => label === highlighted)?.[1] ?? "N/D"}
          {validComposition ? ` · ${(((distribution.find(([label]) => label === highlighted)?.[1] ?? 0) / total) * 100).toFixed(1)} %` : ""}</p> : null}
        <h2>{tr(language, "Fourchette des objectifs", "Price target range")}</h2>
        {targetValues.length > 1 ? <div className="ff-targetRange" role="img" aria-label={targets.map(([label, value, verifiedCurrency]) => `${label}: ${targetText(value, verifiedCurrency)}`).join(", ")}>
          {targets.map(([label, value, verifiedCurrency]) => value === null ? null : <span key={label} className="ff-targetMarker"
            style={{ left: `${((value - targetMin) / targetSpan) * 100}%` }} title={`${label}: ${targetText(value, verifiedCurrency)}`} />)}
        </div> : <p>{tr(language, "Fourchette insuffisante.", "Insufficient target range.")}</p>}
      </section> : null}
      {mode === "table" ? <section className="ff-group"><h2>{tr(language, "Données exactes du consensus", "Exact consensus data")}</h2>
        <div className="ff-analystsTableWrap"><table className="ff-analystsTable"><thead><tr><th scope="col">{tr(language, "Indicateur", "Metric")}</th><th scope="col">{tr(language, "Valeur", "Value")}</th></tr></thead><tbody>
          {targets.map(([label, value, verifiedCurrency]) => <tr key={label}><th scope="row">{label}</th><td>{targetText(value, verifiedCurrency)}</td></tr>)}
          {distribution.map(([label, value]) => <tr key={label}><th scope="row">{label}</th><td>{value ?? "N/D"}</td></tr>)}
        </tbody></table></div></section> : <Group title={tr(language, "Objectifs de cours", "Price targets")} items={[
        ...targets.map(([label, value, verifiedCurrency]) => ({ label, value: targetText(value, verifiedCurrency) })),
      ]} />}

      {mode === "cards" ? <section className="ff-group">
        <h2>
          {tr(language, "Répartition des recommandations", "Recommendation distribution")}
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
          ? tr(language, "Synchronisation de la valorisation…", "Synchronizing valuation…")
          : tr(language, "Chargement des données fondamentales…", "Loading fundamental data…")}
      </section>
    );
  }

  if (error && !currentSnapshot) {
    return (
      <section className="ff-errorPanel">
        {tr(language, "Données fondamentales indisponibles", "Fundamental data unavailable")}: {language === "fr" ? error : "The data provider did not return a usable response."}
      </section>
    );
  }

  if (!currentSnapshot || !snapshot) {
    return null;
  }

  if (snapshot.status === "unavailable" && snapshot.refresh_in_progress) {
    return <section className="panel" style={panelStyle} role="status">
      {view === "valuation"
        ? tr(language, "Synchronisation de la valorisation…", "Synchronizing valuation…")
        : tr(language, "Synchronisation des données fondamentales…", "Synchronizing fundamental data…")}
    </section>;
  }

  if (view === "valuation") {
    return (
      <div className="ff-valuationStack" data-focus-valuation="true">
        {(loading || snapshot.refresh_in_progress || error || snapshot.stale) ? (
          <div role="status" className="ff-valuationStatus">
            {error || snapshot.stale
              ? tr(language, "Dernières données disponibles", "Latest available data")
              : tr(language, "Actualisation en cours…", "Refreshing…")}
          </div>
        ) : null}
        <Valuation snapshot={snapshot} />
        <footer className="status-footer">
          {tr(language, "Source", "Source")}: {snapshot.source} · {tr(language, "Mise à jour", "Updated")}: {generated ?? "N/D"}
        </footer>
      </div>
    );
  }

  return (
    <div className="ff-focusStack">
      <div role="status">
        {loading || snapshot.refresh_in_progress ? tr(language, "Synchronisation en cours…", "Synchronization in progress…") : null}
        {error || snapshot.stale ? tr(language, "Dernières données disponibles", "Latest available data") : null}
        <button type="button" className="button-secondary" disabled={loading} onClick={() => setRevision(value => value + 1)}>
          {tr(language, "Actualiser", "Refresh")}
        </button>
      </div>
      <header className="ff-focusHeader">
        <div>
          <span className="eyebrow">{tr(language, "FOCUS FONDAMENTAL", "FUNDAMENTAL FOCUS")}</span>
          <h2 className="ff-focusName">
            {snapshot.name}
          </h2>
          <p className="ff-focusClassification">
            {[snapshot.sector, snapshot.industry]
              .filter(Boolean)
              .join(" · ") || tr(language, "Classification non disponible", "Classification unavailable")}
          </p>
        </div>
        <div className="ff-focusAvailability">
          <strong data-status={snapshot.status}>
            {snapshot.status === "available"
              ? tr(language, "Données disponibles", "Data available")
              : snapshot.status === "partial"
                ? tr(language, "Données partielles", "Partial data")
                : tr(language, "Données indisponibles", "Data unavailable")}
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
        {tr(language, "Source", "Source")}: {snapshot.source} · {tr(language, "Mise à jour", "Updated")}: {generated ?? "N/D"} · {tr(language, "Certaines valeurs peuvent être calculées à partir des données disponibles · Les champs indéterminables sont affichés N/D.", "Some values may be calculated from available data · Fields that cannot be determined are displayed as N/A.")}
      </footer>
    </div>
  );
}
