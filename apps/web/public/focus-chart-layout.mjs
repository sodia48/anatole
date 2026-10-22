// Loaded only by interactive Focus charts. All positions refer to observed periods;
// missing years are marked and never interpolated.
const date = period => {
  const day = period.match(/(?:^|\D)(\d{4})-(\d{2})-(\d{2})(?:\D|$)/);
  if (day) {
    const time = Date.UTC(+day[1], +day[2] - 1, +day[3]);
    const checked = new Date(time);
    return checked.getUTCFullYear() === +day[1] && checked.getUTCMonth() + 1 === +day[2]
      && checked.getUTCDate() === +day[3] ? time : null;
  }
  const quarter = period.match(/(?:^|\D)(\d{4})-Q([1-4])(?:\D|$)/i);
  return quarter ? Date.UTC(+quarter[1], +quarter[2] * 3, 0) : null;
};

export const periodDate = date;
export function indexes(periods, range) {
  const dated = periods.map((period, index) => ({ index, date: date(period) }));
  if (range === "all") return dated.sort((a, b) => (a.date ?? Infinity) - (b.date ?? Infinity) || a.index - b.index)
    .map(item => item.index);
  const latest = Math.max(...dated.map(item => item.date ?? -Infinity));
  if (!Number.isFinite(latest)) return [];
  const end = new Date(latest);
  const cutoff = Date.UTC(end.getUTCFullYear() - +range.slice(0, -1), end.getUTCMonth(), end.getUTCDate());
  return dated.filter(item => item.date !== null && item.date >= cutoff)
    .sort((a, b) => a.date - b.date || a.index - b.index).map(item => item.index);
}
export function defaultRange(periods) {
  for (const range of ["5y", "10y", "3y", "1y"])
    if (indexes(periods, range).length >= (range === "5y" || range === "10y" ? 3 : 2)) return range;
  return "all";
}
export function base100Reference(series, selected) {
  if (!series.length) return null;
  const common = selected.find(index => series.every(item => {
    const value = item.values[index];
    return value !== null && value !== undefined && Number.isFinite(value) && value > 0;
  }));
  if (common === undefined) return null;
  if (series.some(item => selected.some(index => {
    const value = item.values[index];
    return value !== null && value !== undefined && Number.isFinite(value) && value <= 0;
  }))) return null;
  if (selected.slice(selected.indexOf(common)).filter(index => series.every(item => {
    const value = item.values[index];
    return value !== null && value !== undefined && Number.isFinite(value);
  })).length < 2) return null;
  return common;
}
export const chartValue = (value, reference) => value !== null && value !== undefined && Number.isFinite(value)
  && reference !== null && reference !== undefined && Number.isFinite(reference) && reference > 0
  ? value / reference * 100 : null;
export function chartChange(values, selected, at) {
  const position = selected.indexOf(at), value = values[at];
  if (position < 1 || value === null || value === undefined || !Number.isFinite(value)) return null;
  for (let cursor = position - 1; cursor >= 0; cursor--) {
    const previousIndex = selected[cursor], previous = values[previousIndex];
    if (previous !== null && previous !== undefined && Number.isFinite(previous))
      return { delta: value - previous, percent: previous <= 0 || value < 0 ? null : (value - previous) / previous * 100,
        previous: previousIndex };
  }
  return null;
}
export function sizeGroups(series) {
  const peaks = series.map(item => Math.max(0, ...item.values.filter(Number.isFinite).map(Math.abs)));
  const high = Math.max(...peaks), low = Math.min(...peaks.filter(value => value > 0));
  if (!Number.isFinite(low) || high <= low * 15) return null;
  const major = series.filter((_, index) => peaks[index] >= high / 5).map(item => item.id);
  const other = series.filter((_, index) => peaks[index] < high / 5 && peaks[index] > 0).map(item => item.id);
  return major.length && other.length ? { major, other } : null;
}

export function createLayout(periods, indexes, plotted, shape, width, language, periodLabels = null) {
  const distances = indexes.slice(1).map((index, position) => {
    const previous = date(periods[indexes[position]]), current = date(periods[index]);
    return previous === null || current === null ? null : (current - previous) / 86_400_000;
  });
  const valid = distances.filter(value => value !== null && value > 0).sort((a, b) => a - b);
  const typical = valid[Math.floor((valid.length - 1) / 2)] ?? 365;
  const gaps = distances.flatMap((value, position) => value !== null
    && value > Math.max(typical < 200 ? 160 : 550, typical * 1.8) ? [position + 1] : []);
  const zeroBased = shape === "bar" || shape === "grouped" || shape === "area";
  const low = Math.min(...plotted), high = Math.max(...plotted);
  const padding = Math.max((high - low) * .08, Math.abs(high || low) * .02, .01);
  const min = zeroBased ? Math.min(0, low) : low - padding;
  const max = zeroBased ? Math.max(0, high) : high + padding;
  const span = max - min || 1;
  const left = 82, right = width < 500 ? 64 : 22, plotSpan = width - left - right;
  const x = position => left + (indexes.length === 1 ? plotSpan / 2 : position / (indexes.length - 1) * plotSpan);
  const y = value => 178 - (value - min) / span * 143;
  const hasDetailedLabels = Boolean(periodLabels?.length) || periods.some(period => /\d{4}-Q[1-4]/i.test(period));
  const slots = Math.max(2, Math.floor(plotSpan / (hasDetailedLabels ? 110 : 78)));
  const step = Math.ceil((indexes.length - 1) / (slots - 1));
  const ticks = indexes.map((_, position) => position).filter(position => position % step === 0);
  if (indexes.length && ticks.at(-1) !== indexes.length - 1) ticks.push(indexes.length - 1);
  const label = period => {
    const quarter = period.match(/(\d{4})-Q([1-4])/i);
    if (quarter) return `Q${quarter[2]} ${quarter[1]}`;
    return period.slice(0, 4);
  };
  return { gaps, zeroBased, min, max, left, right, x, y, ticks, label };
}

export function formatChartValue(value, compact, currency, unit, language) {
  const options = {
    ...(unit === "money" || unit === "per_share" ? currency ? { style: "currency", currency } : {} : {}),
    ...(compact ? { notation: "compact" } : {}), maximumFractionDigits: compact ? 1 : 2,
  };
  return new Intl.NumberFormat(language === "fr" ? "fr-CA" : "en-CA", options).format(value)
    + (unit === "percent" ? " %" : unit === "per_share" ? language === "fr" ? " / action" : " / share" : "");
}

const copy = {
  fr: {
    gap: "Axe par observations : les intervalles sans données sont signalés et les courbes sont interrompues.",
    adjusted: "Échelle verticale ajustée; zéro hors de la plage affichée.",
    unknown: "Graphique indisponible : devise non vérifiée pour certaines périodes. Les valeurs exactes restent dans le tableau.",
    mixed: "Graphique indisponible : les périodes utilisent plusieurs devises. Les valeurs exactes restent dans le tableau.",
    positive: "Observation initiale commune positive requise",
    base100: "Base 100 au {period}. Valeur observée / valeur à cette date × 100.",
    single: "Un seul instantané est disponible : aucune évolution historique ne peut être tracée.",
    major: "Montants majeurs",
    other: "Autres montants",
    disparity: "Ordres de grandeur différents : choisissez un groupe pour une échelle lisible.",
    type: "Type de graphique", range: "Période", scale: "Échelle", actual: "Valeurs réelles",
    all: "Tous", core: "Principaux", reset: "Réinitialiser",
    groups: "Groupes d’indicateurs", legend: "Indicateurs et séries affichées",
    source: "Source", estimate: "Estimation", published: "Donnée publiée", since: "depuis",
    low: "Bas", consensus: "Consensus", high: "Haut",
    financial: "Sources financières", details: "Voir les détails · Données exactes du graphique",
  },
  en: {
    gap: "Observation axis: missing intervals are marked and lines are broken.",
    adjusted: "Adjusted vertical scale; zero lies outside the displayed range.",
    unknown: "Chart unavailable: currency is unverified for some periods. Exact values remain in the table.",
    mixed: "Chart unavailable: periods use multiple currencies. Exact values remain in the table.",
    positive: "Shared positive starting observation required",
    base100: "Base 100 at {period}. Observed value / value on this date × 100.",
    single: "Only one snapshot is available: no historical trend can be plotted.",
    major: "Larger amounts",
    other: "Other amounts",
    disparity: "Different orders of magnitude: select a group for a readable scale.",
    type: "Chart type", range: "Period", scale: "Scale", actual: "Actual values",
    all: "All", core: "Core metrics", reset: "Reset",
    groups: "Metric groups", legend: "Metrics and visible series",
    source: "Source", estimate: "Estimate", published: "Published data", since: "since",
    low: "Low", consensus: "Consensus", high: "High",
    financial: "Financial sources", details: "View details · Exact chart data",
  },
};
export const chartCopy = (language, key, period = "") => copy[language][key].replace("{period}", period);
export const shapeLabel = (language, shape) => ({
  fr: { line: "Courbe", bar: "Barres", area: "Aire", points: "Points", grouped: "Colonnes groupées" },
  en: { line: "Line", bar: "Bars", area: "Area", points: "Points", grouped: "Grouped columns" },
})[language][shape];
export const rangeLabel = (language, range) => range === "all" ? language === "fr" ? "Tout" : "All"
  : language === "fr" ? `${range.slice(0, -1)} an(s)` : `${range.slice(0, -1)} year(s)`;
export const unitLabel = (language, unit, currency, mixed, normalized) => mixed
  ? language === "fr" ? "devise non comparable" : "currency not comparable"
  : normalized ? "Base 100" : unit === "percent" ? "%" : unit === "per_share"
    ? language === "fr" ? `${currency ?? ""} par action` : `${currency ?? ""} per share`
    : unit === "money" ? currency ?? "" : language === "fr" ? "nombre" : "number";
