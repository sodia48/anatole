// Dashboard selection is loaded only when the financial overview is opened.
export function buildDashboard({ t, h, currency, financialSector, status, coverage, annualCount, quarterlyCount, language,
  compact, money, pct, n, tone }) {
  const label = (fr, en) => language === "fr" ? fr : en;
  const metric = (fr, en, value, direction) => ({ label: label(fr, en), value, tone: direction });
  const available = item => item.value !== "N/D";
  const headline = [
    metric("Revenus TTM", "TTM revenue", compact(t.total_revenue, currency)),
    metric("Résultat opérationnel TTM", "TTM operating income", compact(t.operating_income, currency)),
    metric("BAIIA TTM", "TTM EBITDA", compact(t.ebitda, currency)),
    metric("Bénéfice net TTM", "TTM net income", compact(t.net_income, currency)),
    metric("BPA dilué TTM", "TTM diluted EPS", money(t.diluted_eps, currency)),
    metric("Flux opérationnel TTM", "TTM operating cash flow", compact(t.operating_cash_flow, currency)),
    metric("Flux disponible TTM", "TTM free cash flow", compact(t.free_cash_flow, currency)),
    metric("Marge nette TTM", "TTM net margin", pct(t.net_margin)),
    metric("Dette nette", "Net debt", compact(t.net_debt, currency)),
    metric("Dette nette / BAIIA", "Net debt / EBITDA", n(h.net_debt_to_ebitda)),
  ];
  const order = financialSector ? [0, 3, 4, 5, 6, 7] : [0, 1, 2, 3, 4, 6, 8, 9];
  const headlineAvailable = order.map(index => headline[index]).filter(available).slice(0, 6);
  const otherHeadline = headline.filter(item => available(item) && !headlineAvailable.includes(item));
  const growth = [
    metric("Revenus sur un an", "Revenue year over year", pct(h.revenue_growth_yoy), tone(h.revenue_growth_yoy)),
    metric("Résultat opérationnel sur un an", "Operating income year over year", pct(h.operating_income_growth_yoy), tone(h.operating_income_growth_yoy)),
    metric("Bénéfice net sur un an", "Net income year over year", pct(h.net_income_growth_yoy), tone(h.net_income_growth_yoy)),
    metric("BPA sur un an", "EPS year over year", pct(h.eps_growth_yoy), tone(h.eps_growth_yoy)),
    metric("Flux disponible sur un an", "Free cash flow year over year", pct(h.free_cash_flow_growth_yoy), tone(h.free_cash_flow_growth_yoy)),
  ];
  const quality = [
    metric("Marge brute", "Gross margin", pct(t.gross_margin)),
    metric("Marge opérationnelle", "Operating margin", pct(t.operating_margin)),
    metric("Marge nette", "Net margin", pct(t.net_margin)),
    metric("Marge de flux disponible", "Free cash flow margin", pct(t.free_cash_flow_margin)),
    metric("Conversion bénéfice → flux", "Income-to-cash conversion", pct(h.cash_conversion_percent)),
  ];
  const longTerm = [
    metric("Revenus", "Revenue", pct(h.three_year_revenue_cagr), tone(h.three_year_revenue_cagr)),
    metric("Bénéfice net", "Net income", pct(h.three_year_net_income_cagr), tone(h.three_year_net_income_cagr)),
    metric("Flux disponible", "Free cash flow", pct(h.three_year_free_cash_flow_cagr), tone(h.three_year_free_cash_flow_cagr)),
  ];
  const missing = [headline, growth, quality, longTerm].flatMap((group, groupIndex) =>
    group.filter(item => !available(item)).map(item => {
      let reason = label("Donnée non publiée", "Data not published");
      if (financialSector && groupIndex === 0 && [2, 8, 9].includes(headline.indexOf(item)))
        reason = label("Indicateur non comparable pour ce secteur", "Metric not comparable for this sector");
      else if (status === "unavailable" || coverage?.status === "unavailable" || coverage?.yahoo_statements_error)
        reason = label("Source indisponible", "Source unavailable");
      else if (groupIndex === 0 && headline.indexOf(item) === 9 && !available(headline[2]))
        reason = label("Calcul impossible sans BAIIA vérifié", "Cannot calculate without verified EBITDA");
      else if (groupIndex === 3 && annualCount < 4 || groupIndex === 1 && quarterlyCount < 5
        || groupIndex === 0 && quarterlyCount < 4)
        reason = label("Historique insuffisant", "Insufficient history");
      return { item, reason };
    }));
  return { headlineAvailable, otherHeadline, growth: growth.filter(available), quality: quality.filter(available),
    longTerm: longTerm.filter(available), missing };
}
