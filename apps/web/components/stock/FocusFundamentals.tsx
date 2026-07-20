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

type AnnualFinancial = {
  period_end: string;
  currency: string | null;
  total_revenue: number | null;
  gross_profit: number | null;
  operating_income: number | null;
  net_income: number | null;
  operating_cash_flow: number | null;
  capital_expenditure: number | null;
  free_cash_flow: number | null;
  total_cash: number | null;
  total_debt: number | null;
  total_assets: number | null;
  stockholder_equity: number | null;
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
  annual_financials: AnnualFinancial[];
  earnings_history: EarningsQuarter[];
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

function Financials({
  snapshot,
}: {
  snapshot: Snapshot;
}) {
  const currency = snapshot.currency ?? "CAD";

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <section style={panelStyle}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 12,
            alignItems: "center",
            marginBottom: 14,
          }}
        >
          <div>
            <span className="eyebrow">RÉSULTATS ANNUELS</span>
            <h2 style={{ margin: "4px 0 0" }}>
              Performance financière
            </h2>
          </div>
          <span style={{ color: "#7f9db1", fontSize: 11 }}>
            {currency}
          </span>
        </div>

        <div style={{ overflowX: "auto" }}>
          <table
            style={{
              width: "100%",
              minWidth: 900,
              borderCollapse: "collapse",
              fontSize: 12,
            }}
          >
            <thead>
              <tr style={{ color: "#7898ad", textAlign: "right" }}>
                <th style={{ padding: 10, textAlign: "left" }}>Exercice</th>
                <th style={{ padding: 10 }}>Revenus</th>
                <th style={{ padding: 10 }}>Résultat opérationnel</th>
                <th style={{ padding: 10 }}>Bénéfice net</th>
                <th style={{ padding: 10 }}>Flux opérationnel</th>
                <th style={{ padding: 10 }}>Flux disponible</th>
                <th style={{ padding: 10 }}>Dette</th>
                <th style={{ padding: 10 }}>Capitaux propres</th>
              </tr>
            </thead>
            <tbody>
              {snapshot.annual_financials.length ? (
                snapshot.annual_financials.map((row) => (
                  <tr
                    key={row.period_end}
                    style={{
                      borderTop:
                        "1px solid rgba(38,77,101,.62)",
                      color: "#dcecf6",
                      textAlign: "right",
                    }}
                  >
                    <td style={{ padding: 11, textAlign: "left", fontWeight: 750 }}>
                      {date(row.period_end)}
                    </td>
                    <td style={{ padding: 11 }}>{compact(row.total_revenue, currency)}</td>
                    <td style={{ padding: 11 }}>{compact(row.operating_income, currency)}</td>
                    <td style={{ padding: 11 }}>{compact(row.net_income, currency)}</td>
                    <td style={{ padding: 11 }}>{compact(row.operating_cash_flow, currency)}</td>
                    <td style={{ padding: 11 }}>{compact(row.free_cash_flow, currency)}</td>
                    <td style={{ padding: 11 }}>{compact(row.total_debt, currency)}</td>
                    <td style={{ padding: 11 }}>{compact(row.stockholder_equity, currency)}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td
                    colSpan={8}
                    style={{ padding: 24, color: "#7f9db1" }}
                  >
                    Aucun historique annuel publié par la source.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section style={panelStyle}>
        <span className="eyebrow">BÉNÉFICES PAR ACTION</span>
        <h2 style={{ margin: "4px 0 14px" }}>
          Derniers trimestres publiés
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
                  Réel : {n(quarter.actual)}
                </div>
                <div style={{ color: "#819db0" }}>
                  Consensus : {n(quarter.estimate)}
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
              ? snapshot.events.earnings_dates.map(date).join(" — ")
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
