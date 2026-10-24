/** Provincial-only filtering loads when a province is selected, keeping the national feed lean. */
const topics = /inflation|indice des prix|consumer price|emploi|chômage|population active|employment|unemployment|labour force|produit intérieur brut|gross domestic product|\bpib\b|\bgdp\b|commerce de détail|commerce de gros|retail trade|wholesale trade|exportations|importations|exports|imports|budget|déficit|excédent|comptes publics|fiscal|croissance économique|economic growth|mises en chantier|permis de bâtir|housing starts|building permits/i;
const isStatCan = source => /statistique canada|statistics canada/i.test(source);
const hasDate = value => {
  const timestamp = Date.parse(value ?? "");
  const age = Date.now() - timestamp;
  return Number.isFinite(timestamp) && age >= -86_400_000 && age <= 180 * 86_400_000;
};

export function provinceItems(releases, official, region, provinceName) {
  const direct = releases.filter(item => item.source_kind !== "dashboard" && hasDate(item.published_at))
    .map(item => ({ id: item.id, title: item.title, summary: item.summary, url: item.source_url,
      source: item.source, category: item.category, publishedAt: item.published_at,
      sentiment: null, sentimentScore: null, importance: item.importance, region: item.province }));
  const fallback = official.filter(item => item.regions?.includes(region) && hasDate(item.published_at)
      && (isStatCan(item.source) || topics.test(`${item.title} ${item.summary}`)))
    .map(item => ({ id: `official-${item.id}`, title: item.title, summary: item.summary, url: item.url,
      source: item.source, category: item.category, publishedAt: item.published_at,
      sentiment: null, sentimentScore: null, importance: null, region: provinceName }));
  const seen = new Set();
  const distinct = [...direct, ...fallback].filter(item => {
    const key = item.url.split("?", 1)[0].replace(/\/+$/, "").toLowerCase()
      || `${item.source}|${item.title}`.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const newestFirst = (left, right) => Date.parse(right.publishedAt ?? "") - Date.parse(left.publishedAt ?? "");
  const primary = distinct.filter(item => !isStatCan(item.source)).sort(newestFirst);
  const statcan = distinct.filter(item => isStatCan(item.source)).sort(newestFirst);
  return [...primary, ...statcan.slice(0, primary.length ? Math.min(primary.length, 6) : 6)];
}

export function provinceStatuses(items, language) {
  const counts = new Map();
  for (const item of items) counts.set(item.source, (counts.get(item.source) ?? 0) + 1);
  return Array.from(counts, ([label, count]) => ({
    key: `display-${label}`, label, status: "available",
    detail: language === "fr"
      ? `${count} publication${count === 1 ? "" : "s"} officielle${count === 1 ? "" : "s"} datée${count === 1 ? "" : "s"}.`
      : `${count} dated official release${count === 1 ? "" : "s"}.`,
    lastSuccessAt: null,
  }));
}
