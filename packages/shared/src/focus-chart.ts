/** Pure financial chart preparation shared by Focus web and native views. */
export type FocusChartRange = "1y" | "3y" | "5y" | "10y" | "all";
export type FocusChartShape = "line" | "bar" | "area" | "points";
export type FocusChartInput = { id: string; values: (number | null)[] };
type AnnualPeriod = { period_end: string; source?: { confidence?: string } | null };

/** Only published annual closes can establish the issuer's fiscal year end. */
export function focusFiscalYearEndMonth(annual: AnnualPeriod[]): number | null {
  const months = annual.filter(row => row.source?.confidence === "official")
    .map(row => /^\d{4}-\d{2}-\d{2}/.test(row.period_end) ? Number(row.period_end.slice(5, 7)) : 0);
  return months.length > 0 && months.every(month => month >= 1 && month <= 12 && month === months[0])
    ? months[0] ?? null : null;
}

/** A fiscal quarter is asserted only when a verified annual close supports it. */
export function focusPeriodLabel(period: string, frequency: "annual" | "quarterly", fiscalYearEndMonth: number | null = null): string {
  const explicit = period.match(/(?:^|\D)(\d{4})-Q([1-4])(?:\D|$)/i);
  if (frequency === "quarterly" && explicit) return `Q${explicit[2]} ${explicit[1]}`;
  const match = period.match(/(?:^|\D)(\d{4})-(\d{2})-(\d{2})(?:\D|$)/);
  if (!match || focusPeriodDate(period) === null) return period;
  const year = Number(match[1]), month = Number(match[2]);
  if (frequency === "annual") return String(year);
  if (fiscalYearEndMonth !== null && Number.isInteger(fiscalYearEndMonth)
      && fiscalYearEndMonth >= 1 && fiscalYearEndMonth <= 12
      && (month - fiscalYearEndMonth + 12) % 3 === 0) {
    const quarter = Math.floor(((month - fiscalYearEndMonth + 11) % 12) / 3) + 1;
    return `Q${quarter} ${month <= fiscalYearEndMonth ? year : year + 1}`;
  }
  return `Q${Math.ceil(month / 3)} ${year} (cal.)`;
}

const years: Record<Exclude<FocusChartRange, "all">, number> = {
  "1y": 1, "3y": 3, "5y": 5, "10y": 10,
};

/** Dates may be prefixed by a forecast label, or use a published quarter. */
export function focusPeriodDate(period: string): number | null {
  const day = period.match(/(?:^|\D)(\d{4})-(\d{2})-(\d{2})(?:\D|$)/);
  if (day) {
    const time = Date.UTC(Number(day[1]), Number(day[2]) - 1, Number(day[3]));
    const date = new Date(time);
    return date.getUTCFullYear() === Number(day[1]) && date.getUTCMonth() + 1 === Number(day[2])
      && date.getUTCDate() === Number(day[3]) ? time : null;
  }
  const quarter = period.match(/(?:^|\D)(\d{4})-Q([1-4])(?:\D|$)/i);
  return quarter ? Date.UTC(Number(quarter[1]), Number(quarter[2]) * 3, 0) : null;
}

export function focusChartIndexes(periods: string[], range: FocusChartRange): number[] {
  const dated = periods.map((period, index) => ({ index, date: focusPeriodDate(period) }));
  if (range === "all") return dated.sort((a, b) => (a.date ?? Infinity) - (b.date ?? Infinity) || a.index - b.index)
    .map(item => item.index);
  const latest = Math.max(...dated.map(item => item.date ?? -Infinity));
  if (!Number.isFinite(latest)) return [];
  const latestDate = new Date(latest);
  const cutoff = Date.UTC(latestDate.getUTCFullYear() - years[range], latestDate.getUTCMonth(), latestDate.getUTCDate());
  return dated.filter(item => item.date !== null && item.date >= cutoff)
    .sort((a, b) => (a.date as number) - (b.date as number) || a.index - b.index)
    .map(item => item.index);
}

/** A common positive starting observation avoids fabricated or inverted growth. */
export function focusBase100Reference(series: FocusChartInput[], indexes: number[]): number | null {
  if (!series.length) return null;
  const common = indexes.find(index => series.every(item => {
    const value = item.values[index];
    return value !== null && value !== undefined && Number.isFinite(value) && value > 0;
  }));
  if (common === undefined) return null;
  if (series.some(item => indexes.some(index => {
    const value = item.values[index];
    return value !== null && value !== undefined && Number.isFinite(value) && value <= 0;
  }))) return null;
  if (indexes.slice(indexes.indexOf(common)).filter(index => series.every(item => {
    const value = item.values[index];
    return value !== null && value !== undefined && Number.isFinite(value);
  })).length < 2) return null;
  return common;
}

export function focusChartValue(value: number | null | undefined, reference: number | null | undefined): number | null {
  return value !== null && value !== undefined && Number.isFinite(value)
    && reference !== null && reference !== undefined && Number.isFinite(reference) && reference > 0
    ? value / reference * 100 : null;
}

export function focusChartChange(values: (number | null)[], indexes: number[], at: number): { delta: number; percent: number | null; previous: number } | null {
  const position = indexes.indexOf(at);
  const value = values[at];
  if (position < 1 || value === null || value === undefined || !Number.isFinite(value)) return null;
  for (let cursor = position - 1; cursor >= 0; cursor--) {
    const previousIndex = indexes[cursor];
    if (previousIndex === undefined) continue;
    const previous = values[previousIndex];
    if (previous !== null && previous !== undefined && Number.isFinite(previous))
      return { delta: value - previous, percent: previous <= 0 || value < 0 ? null : (value - previous) / previous * 100,
        previous: previousIndex };
  }
  return null;
}
