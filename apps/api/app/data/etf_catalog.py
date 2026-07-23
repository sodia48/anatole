from __future__ import annotations

from typing import Final, TypedDict


class EtfCatalogEntry(TypedDict):
    ticker: str
    name: str
    provider: str
    category: str
    exposure: str
    region: str


# Répertoire éditorial Anatole.
#
# Les catégories sont volontairement utilisées comme groupes sectoriels dans
# l'interface. Le cours, la variation et le volume proviennent du service de
# marché; aucune valeur de démonstration n'est affichée lorsque la cotation
# publique échoue.
ETF_CATALOG: Final[list[EtfCatalogEntry]] = [
    {
        "ticker": "XIC",
        "name": "iShares Core S&P/TSX Capped Composite Index ETF",
        "provider": "iShares",
        "category": "Marché canadien",
        "exposure": "Marché canadien large",
        "region": "Canada — marché large"
    },
    {
        "ticker": "XIU",
        "name": "iShares S&P/TSX 60 Index ETF",
        "provider": "iShares",
        "category": "Marché canadien",
        "exposure": "Grandes capitalisations canadiennes",
        "region": "Canada — grandes capitalisations"
    },
    {
        "ticker": "VCN",
        "name": "Vanguard FTSE Canada All Cap Index ETF",
        "provider": "Vanguard",
        "category": "Marché canadien",
        "exposure": "Marché canadien toutes capitalisations",
        "region": "Canada — marché large"
    },
    {
        "ticker": "ZCN",
        "name": "BMO S&P/TSX Capped Composite Index ETF",
        "provider": "BMO",
        "category": "Marché canadien",
        "exposure": "Marché canadien large",
        "region": "Canada — marché large"
    },
    {
        "ticker": "HXT",
        "name": "Global X S&P/TSX 60 Index Corporate Class ETF",
        "provider": "Global X",
        "category": "Marché canadien",
        "exposure": "S&P/TSX 60",
        "region": "Canada — grandes capitalisations"
    },
    {
        "ticker": "HXCN",
        "name": "Global X S&P/TSX Capped Composite Index Corporate Class ETF",
        "provider": "Global X",
        "category": "Marché canadien",
        "exposure": "S&P/TSX Composite",
        "region": "Canada — marché large"
    },
    {
        "ticker": "QCN",
        "name": "Mackenzie Canadian Equity Index ETF",
        "provider": "Mackenzie",
        "category": "Marché canadien",
        "exposure": "Actions canadiennes diversifiées",
        "region": "Canada — marché large"
    },
    {
        "ticker": "XMD",
        "name": "iShares S&P/TSX Completion Index ETF",
        "provider": "iShares",
        "category": "Marché canadien",
        "exposure": "Titres hors TSX 60",
        "region": "Canada — moyennes capitalisations"
    },
    {
        "ticker": "XCS",
        "name": "iShares S&P/TSX SmallCap Index ETF",
        "provider": "iShares",
        "category": "Marché canadien",
        "exposure": "Petites capitalisations canadiennes",
        "region": "Canada — petites capitalisations"
    },
    {
        "ticker": "XCV",
        "name": "iShares Canadian Value Index ETF",
        "provider": "iShares",
        "category": "Marché canadien",
        "exposure": "Facteur valeur canadien",
        "region": "Canada — facteur valeur"
    },
    {
        "ticker": "XCG",
        "name": "iShares Canadian Growth Index ETF",
        "provider": "iShares",
        "category": "Marché canadien",
        "exposure": "Facteur croissance canadien",
        "region": "Canada — facteur croissance"
    },
    {
        "ticker": "XMV",
        "name": "iShares MSCI Min Vol Canada Index ETF",
        "provider": "iShares",
        "category": "Marché canadien",
        "exposure": "Faible volatilité canadienne",
        "region": "Canada — faible volatilité"
    },
    {
        "ticker": "ZLB",
        "name": "BMO Low Volatility Canadian Equity ETF",
        "provider": "BMO",
        "category": "Marché canadien",
        "exposure": "Faible volatilité canadienne",
        "region": "Canada — faible volatilité"
    },
    {
        "ticker": "XFN",
        "name": "iShares S&P/TSX Capped Financials Index ETF",
        "provider": "iShares",
        "category": "Finance et dividendes",
        "exposure": "Services financiers canadiens",
        "region": "Canada — finance"
    },
    {
        "ticker": "ZEB",
        "name": "BMO Equal Weight Banks Index ETF",
        "provider": "BMO",
        "category": "Finance et dividendes",
        "exposure": "Banques canadiennes équipondérées",
        "region": "Canada — banques"
    },
    {
        "ticker": "ZWB",
        "name": "BMO Covered Call Canadian Banks ETF",
        "provider": "BMO",
        "category": "Finance et dividendes",
        "exposure": "Banques canadiennes avec options d'achat couvertes",
        "region": "Canada — banques et revenu"
    },
    {
        "ticker": "HCAL",
        "name": "Hamilton Canadian Bank Mean Reversion Index ETF",
        "provider": "Hamilton",
        "category": "Finance et dividendes",
        "exposure": "Banques canadiennes",
        "region": "Canada — banques"
    },
    {
        "ticker": "HFIN",
        "name": "Hamilton Enhanced Canadian Financials ETF",
        "provider": "Hamilton",
        "category": "Finance et dividendes",
        "exposure": "Services financiers canadiens",
        "region": "Canada — finance"
    },
    {
        "ticker": "XDV",
        "name": "iShares Canadian Select Dividend Index ETF",
        "provider": "iShares",
        "category": "Finance et dividendes",
        "exposure": "Dividendes canadiens sélectionnés",
        "region": "Canada — dividendes"
    },
    {
        "ticker": "XEI",
        "name": "iShares S&P/TSX Composite High Dividend Index ETF",
        "provider": "iShares",
        "category": "Finance et dividendes",
        "exposure": "Dividendes élevés du TSX",
        "region": "Canada — dividendes"
    },
    {
        "ticker": "XDIV",
        "name": "iShares Core MSCI Canadian Quality Dividend Index ETF",
        "provider": "iShares",
        "category": "Finance et dividendes",
        "exposure": "Dividendes canadiens de qualité",
        "region": "Canada — dividendes qualité"
    },
    {
        "ticker": "VDY",
        "name": "Vanguard FTSE Canadian High Dividend Yield Index ETF",
        "provider": "Vanguard",
        "category": "Finance et dividendes",
        "exposure": "Rendement élevé canadien",
        "region": "Canada — dividendes"
    },
    {
        "ticker": "ZDV",
        "name": "BMO Canadian Dividend ETF",
        "provider": "BMO",
        "category": "Finance et dividendes",
        "exposure": "Actions canadiennes à dividendes",
        "region": "Canada — dividendes"
    },
    {
        "ticker": "CDZ",
        "name": "iShares S&P/TSX Canadian Dividend Aristocrats Index ETF",
        "provider": "iShares",
        "category": "Finance et dividendes",
        "exposure": "Aristocrates du dividende canadien",
        "region": "Canada — dividendes"
    },
    {
        "ticker": "FIE",
        "name": "iShares Canadian Financial Monthly Income ETF",
        "provider": "iShares",
        "category": "Finance et dividendes",
        "exposure": "Revenu mensuel financier",
        "region": "Canada — finance et revenu"
    },
    {
        "ticker": "PDC",
        "name": "Invesco Canadian Dividend Index ETF",
        "provider": "Invesco",
        "category": "Finance et dividendes",
        "exposure": "Dividendes canadiens",
        "region": "Canada — dividendes"
    },
    {
        "ticker": "XEG",
        "name": "iShares S&P/TSX Capped Energy Index ETF",
        "provider": "iShares",
        "category": "Énergie et ressources",
        "exposure": "Producteurs d'énergie canadiens",
        "region": "Canada — énergie"
    },
    {
        "ticker": "ZEO",
        "name": "BMO Equal Weight Oil & Gas Index ETF",
        "provider": "BMO",
        "category": "Énergie et ressources",
        "exposure": "Pétrole et gaz équipondérés",
        "region": "Canada — énergie"
    },
    {
        "ticker": "HXE",
        "name": "Global X S&P/TSX Capped Energy Index Corporate Class ETF",
        "provider": "Global X",
        "category": "Énergie et ressources",
        "exposure": "Énergie canadienne",
        "region": "Canada — énergie"
    },
    {
        "ticker": "NXF",
        "name": "CI Energy Giants Covered Call ETF",
        "provider": "CI Global Asset Management",
        "category": "Énergie et ressources",
        "exposure": "Producteurs d'énergie avec options couvertes",
        "region": "Canada — énergie et revenu"
    },
    {
        "ticker": "HEE",
        "name": "Global X Enhanced Income Energy ETF",
        "provider": "Global X",
        "category": "Énergie et ressources",
        "exposure": "Énergie canadienne à revenu amélioré",
        "region": "Canada — énergie et revenu"
    },
    {
        "ticker": "XCLN",
        "name": "iShares Global Clean Energy Index ETF",
        "provider": "iShares",
        "category": "Énergie et ressources",
        "exposure": "Énergie propre mondiale",
        "region": "Monde — énergie propre"
    },
    {
        "ticker": "ZCLN",
        "name": "BMO Clean Energy Index ETF",
        "provider": "BMO",
        "category": "Énergie et ressources",
        "exposure": "Énergie propre mondiale",
        "region": "Monde — énergie propre"
    },
    {
        "ticker": "HCLN",
        "name": "Harvest Clean Energy ETF",
        "provider": "Harvest",
        "category": "Énergie et ressources",
        "exposure": "Entreprises mondiales d'énergie propre",
        "region": "Monde — énergie propre"
    },
    {
        "ticker": "XETM",
        "name": "iShares S&P/TSX Energy Transition Materials Index ETF",
        "provider": "iShares",
        "category": "Énergie et ressources",
        "exposure": "Matériaux de transition énergétique",
        "region": "Canada — transition énergétique"
    },
    {
        "ticker": "COW",
        "name": "iShares Global Agriculture Index ETF",
        "provider": "iShares",
        "category": "Énergie et ressources",
        "exposure": "Agriculture mondiale",
        "region": "Monde — ressources agricoles"
    },
    {
        "ticker": "HURA",
        "name": "Global X Uranium Index ETF",
        "provider": "Global X",
        "category": "Énergie et ressources",
        "exposure": "Producteurs d'uranium",
        "region": "Monde — uranium"
    },
    {
        "ticker": "URNM",
        "name": "Sprott Uranium Miners ETF",
        "provider": "Sprott",
        "category": "Énergie et ressources",
        "exposure": "Minières d'uranium",
        "region": "Monde — uranium"
    },
    {
        "ticker": "XMA",
        "name": "iShares S&P/TSX Capped Materials Index ETF",
        "provider": "iShares",
        "category": "Matériaux et métaux",
        "exposure": "Matériaux canadiens",
        "region": "Canada — matériaux"
    },
    {
        "ticker": "XBM",
        "name": "iShares S&P/TSX Global Base Metals Index ETF",
        "provider": "iShares",
        "category": "Matériaux et métaux",
        "exposure": "Producteurs de métaux de base",
        "region": "Monde — métaux de base"
    },
    {
        "ticker": "XGD",
        "name": "iShares S&P/TSX Global Gold Index ETF",
        "provider": "iShares",
        "category": "Matériaux et métaux",
        "exposure": "Minières aurifères",
        "region": "Monde — or"
    },
    {
        "ticker": "ZGD",
        "name": "BMO Equal Weight Global Gold Index ETF",
        "provider": "BMO",
        "category": "Matériaux et métaux",
        "exposure": "Minières aurifères équipondérées",
        "region": "Monde — or"
    },
    {
        "ticker": "COPP",
        "name": "Global X Copper Producers Index ETF",
        "provider": "Global X",
        "category": "Matériaux et métaux",
        "exposure": "Producteurs de cuivre",
        "region": "Monde — cuivre"
    },
    {
        "ticker": "CGL",
        "name": "iShares Gold Bullion ETF",
        "provider": "iShares",
        "category": "Matériaux et métaux",
        "exposure": "Lingots d'or",
        "region": "Or physique"
    },
    {
        "ticker": "CGL.C",
        "name": "iShares Gold Bullion ETF — CAD Hedged",
        "provider": "iShares",
        "category": "Matériaux et métaux",
        "exposure": "Lingots d'or couverts en CAD",
        "region": "Or physique — couvert"
    },
    {
        "ticker": "SVR",
        "name": "iShares Silver Bullion ETF",
        "provider": "iShares",
        "category": "Matériaux et métaux",
        "exposure": "Lingots d'argent",
        "region": "Argent physique"
    },
    {
        "ticker": "KILO",
        "name": "Purpose Gold Bullion Fund",
        "provider": "Purpose",
        "category": "Matériaux et métaux",
        "exposure": "Lingots d'or",
        "region": "Or physique"
    },
    {
        "ticker": "HUG",
        "name": "Global X Gold ETF",
        "provider": "Global X",
        "category": "Matériaux et métaux",
        "exposure": "Contrats sur l'or",
        "region": "Or"
    },
    {
        "ticker": "HUZ",
        "name": "Global X Silver ETF",
        "provider": "Global X",
        "category": "Matériaux et métaux",
        "exposure": "Contrats sur l'argent",
        "region": "Argent"
    },
    {
        "ticker": "XIT",
        "name": "iShares S&P/TSX Capped Information Technology Index ETF",
        "provider": "iShares",
        "category": "Technologie et innovation",
        "exposure": "Technologie canadienne",
        "region": "Canada — technologie"
    },
    {
        "ticker": "TEC",
        "name": "TD Global Technology Leaders Index ETF",
        "provider": "TD",
        "category": "Technologie et innovation",
        "exposure": "Leaders technologiques mondiaux",
        "region": "Monde — technologie"
    },
    {
        "ticker": "QQC",
        "name": "Invesco NASDAQ 100 Index ETF",
        "provider": "Invesco",
        "category": "Technologie et innovation",
        "exposure": "NASDAQ-100",
        "region": "États-Unis — technologie"
    },
    {
        "ticker": "QQC.F",
        "name": "Invesco NASDAQ 100 Index ETF — CAD Hedged",
        "provider": "Invesco",
        "category": "Technologie et innovation",
        "exposure": "NASDAQ-100 couvert en CAD",
        "region": "États-Unis — technologie couverte"
    },
    {
        "ticker": "HXQ",
        "name": "Global X NASDAQ-100 Index Corporate Class ETF",
        "provider": "Global X",
        "category": "Technologie et innovation",
        "exposure": "NASDAQ-100",
        "region": "États-Unis — technologie"
    },
    {
        "ticker": "ZQQ",
        "name": "BMO NASDAQ 100 Equity Hedged to CAD Index ETF",
        "provider": "BMO",
        "category": "Technologie et innovation",
        "exposure": "NASDAQ-100 couvert en CAD",
        "region": "États-Unis — technologie couverte"
    },
    {
        "ticker": "XQQ",
        "name": "iShares NASDAQ 100 Index ETF — CAD Hedged",
        "provider": "iShares",
        "category": "Technologie et innovation",
        "exposure": "NASDAQ-100 couvert en CAD",
        "region": "États-Unis — technologie couverte"
    },
    {
        "ticker": "XCHP",
        "name": "iShares Semiconductor Index ETF",
        "provider": "iShares",
        "category": "Technologie et innovation",
        "exposure": "Semi-conducteurs",
        "region": "Monde — semi-conducteurs"
    },
    {
        "ticker": "XHAK",
        "name": "iShares Cybersecurity and Tech Index ETF",
        "provider": "iShares",
        "category": "Technologie et innovation",
        "exposure": "Cybersécurité",
        "region": "Monde — cybersécurité"
    },
    {
        "ticker": "XEXP",
        "name": "iShares Exponential Technologies Index ETF",
        "provider": "iShares",
        "category": "Technologie et innovation",
        "exposure": "Technologies exponentielles",
        "region": "Monde — innovation"
    },
    {
        "ticker": "XDRV",
        "name": "iShares Global Electric and Autonomous Vehicles Index ETF",
        "provider": "iShares",
        "category": "Technologie et innovation",
        "exposure": "Véhicules électriques et autonomes",
        "region": "Monde — mobilité"
    },
    {
        "ticker": "CYBR",
        "name": "Evolve Cyber Security Index Fund",
        "provider": "Evolve",
        "category": "Technologie et innovation",
        "exposure": "Cybersécurité mondiale",
        "region": "Monde — cybersécurité"
    },
    {
        "ticker": "EDGE",
        "name": "Evolve Innovation Index Fund",
        "provider": "Evolve",
        "category": "Technologie et innovation",
        "exposure": "Entreprises innovantes",
        "region": "Monde — innovation"
    },
    {
        "ticker": "RBOT",
        "name": "Global X Robotics & AI Index ETF",
        "provider": "Global X",
        "category": "Technologie et innovation",
        "exposure": "Robotique et intelligence artificielle",
        "region": "Monde — robotique et IA"
    },
    {
        "ticker": "XRE",
        "name": "iShares S&P/TSX Capped REIT Index ETF",
        "provider": "iShares",
        "category": "Immobilier, infrastructures et services publics",
        "exposure": "FPI canadiennes",
        "region": "Canada — immobilier"
    },
    {
        "ticker": "ZRE",
        "name": "BMO Equal Weight REITs Index ETF",
        "provider": "BMO",
        "category": "Immobilier, infrastructures et services publics",
        "exposure": "FPI canadiennes équipondérées",
        "region": "Canada — immobilier"
    },
    {
        "ticker": "VRE",
        "name": "Vanguard FTSE Canadian Capped REIT Index ETF",
        "provider": "Vanguard",
        "category": "Immobilier, infrastructures et services publics",
        "exposure": "FPI canadiennes",
        "region": "Canada — immobilier"
    },
    {
        "ticker": "RIT",
        "name": "CI Canadian REIT ETF",
        "provider": "CI Global Asset Management",
        "category": "Immobilier, infrastructures et services publics",
        "exposure": "FPI canadiennes",
        "region": "Canada — immobilier"
    },
    {
        "ticker": "XUT",
        "name": "iShares S&P/TSX Capped Utilities Index ETF",
        "provider": "iShares",
        "category": "Immobilier, infrastructures et services publics",
        "exposure": "Services publics canadiens",
        "region": "Canada — services publics"
    },
    {
        "ticker": "ZUT",
        "name": "BMO Equal Weight Utilities Index ETF",
        "provider": "BMO",
        "category": "Immobilier, infrastructures et services publics",
        "exposure": "Services publics équipondérés",
        "region": "Canada — services publics"
    },
    {
        "ticker": "ZWU",
        "name": "BMO Covered Call Utilities ETF",
        "provider": "BMO",
        "category": "Immobilier, infrastructures et services publics",
        "exposure": "Services publics avec options couvertes",
        "region": "Canada — services publics et revenu"
    },
    {
        "ticker": "HUTL",
        "name": "Harvest Equal Weight Global Utilities Income ETF",
        "provider": "Harvest",
        "category": "Immobilier, infrastructures et services publics",
        "exposure": "Services publics mondiaux à revenu",
        "region": "Monde — services publics"
    },
    {
        "ticker": "CIF",
        "name": "iShares Global Infrastructure Index ETF",
        "provider": "iShares",
        "category": "Immobilier, infrastructures et services publics",
        "exposure": "Infrastructures mondiales",
        "region": "Monde — infrastructures"
    },
    {
        "ticker": "ZGI",
        "name": "BMO Global Infrastructure Index ETF",
        "provider": "BMO",
        "category": "Immobilier, infrastructures et services publics",
        "exposure": "Infrastructures mondiales",
        "region": "Monde — infrastructures"
    },
    {
        "ticker": "XGI",
        "name": "iShares S&P Global Industrials Index ETF",
        "provider": "iShares",
        "category": "Immobilier, infrastructures et services publics",
        "exposure": "Industries mondiales",
        "region": "Monde — industries"
    },
    {
        "ticker": "CWW",
        "name": "iShares Global Water Index ETF",
        "provider": "iShares",
        "category": "Immobilier, infrastructures et services publics",
        "exposure": "Entreprises mondiales de l'eau",
        "region": "Monde — eau"
    },
    {
        "ticker": "UTIL",
        "name": "Hamilton Utilities Yield Maximizer ETF",
        "provider": "Hamilton",
        "category": "Immobilier, infrastructures et services publics",
        "exposure": "Services publics et revenu d'options",
        "region": "Canada / États-Unis — services publics"
    },
    {
        "ticker": "XST",
        "name": "iShares S&P/TSX Capped Consumer Staples Index ETF",
        "provider": "iShares",
        "category": "Consommation et santé",
        "exposure": "Consommation de base canadienne",
        "region": "Canada — consommation défensive"
    },
    {
        "ticker": "XCD",
        "name": "iShares S&P Global Consumer Discretionary Index ETF",
        "provider": "iShares",
        "category": "Consommation et santé",
        "exposure": "Consommation discrétionnaire mondiale",
        "region": "Monde — consommation discrétionnaire"
    },
    {
        "ticker": "XHC",
        "name": "iShares Global Healthcare Index ETF",
        "provider": "iShares",
        "category": "Consommation et santé",
        "exposure": "Santé mondiale",
        "region": "Monde — santé"
    },
    {
        "ticker": "XDNA",
        "name": "iShares Genomics Immunology and Healthcare Index ETF",
        "provider": "iShares",
        "category": "Consommation et santé",
        "exposure": "Génomique, immunologie et santé",
        "region": "Monde — santé innovante"
    },
    {
        "ticker": "LIFE",
        "name": "Evolve Global Healthcare Enhanced Yield Fund",
        "provider": "Evolve",
        "category": "Consommation et santé",
        "exposure": "Santé mondiale avec revenu amélioré",
        "region": "Monde — santé et revenu"
    },
    {
        "ticker": "HHL",
        "name": "Harvest Healthcare Leaders Income ETF",
        "provider": "Harvest",
        "category": "Consommation et santé",
        "exposure": "Leaders mondiaux de la santé",
        "region": "Monde — santé et revenu"
    },
    {
        "ticker": "HLTH",
        "name": "Global X Health Care Covered Call ETF",
        "provider": "Global X",
        "category": "Consommation et santé",
        "exposure": "Santé avec options couvertes",
        "region": "Monde — santé et revenu"
    },
    {
        "ticker": "FOOD",
        "name": "Global X Agri-Tech & Food Innovation Index ETF",
        "provider": "Global X",
        "category": "Consommation et santé",
        "exposure": "Technologies agricoles et alimentation",
        "region": "Monde — alimentation"
    },
    {
        "ticker": "TRVL",
        "name": "Harvest Travel & Leisure Index ETF",
        "provider": "Harvest",
        "category": "Consommation et santé",
        "exposure": "Voyage et loisirs",
        "region": "Monde — consommation discrétionnaire"
    },
    {
        "ticker": "CARS",
        "name": "Evolve Automobile Innovation Index Fund",
        "provider": "Evolve",
        "category": "Consommation et santé",
        "exposure": "Innovation automobile",
        "region": "Monde — automobile"
    },
    {
        "ticker": "VFV",
        "name": "Vanguard S&P 500 Index ETF",
        "provider": "Vanguard",
        "category": "Marché américain",
        "exposure": "S&P 500",
        "region": "États-Unis — grandes capitalisations"
    },
    {
        "ticker": "VSP",
        "name": "Vanguard S&P 500 Index ETF — CAD Hedged",
        "provider": "Vanguard",
        "category": "Marché américain",
        "exposure": "S&P 500 couvert en CAD",
        "region": "États-Unis — grandes capitalisations couvertes"
    },
    {
        "ticker": "XUS",
        "name": "iShares Core S&P 500 Index ETF",
        "provider": "iShares",
        "category": "Marché américain",
        "exposure": "S&P 500",
        "region": "États-Unis — grandes capitalisations"
    },
    {
        "ticker": "XSP",
        "name": "iShares Core S&P 500 Index ETF — CAD Hedged",
        "provider": "iShares",
        "category": "Marché américain",
        "exposure": "S&P 500 couvert en CAD",
        "region": "États-Unis — grandes capitalisations couvertes"
    },
    {
        "ticker": "ZSP",
        "name": "BMO S&P 500 Index ETF",
        "provider": "BMO",
        "category": "Marché américain",
        "exposure": "S&P 500",
        "region": "États-Unis — grandes capitalisations"
    },
    {
        "ticker": "ZUE",
        "name": "BMO S&P 500 Hedged to CAD Index ETF",
        "provider": "BMO",
        "category": "Marché américain",
        "exposure": "S&P 500 couvert en CAD",
        "region": "États-Unis — grandes capitalisations couvertes"
    },
    {
        "ticker": "HXS",
        "name": "Global X S&P 500 Index Corporate Class ETF",
        "provider": "Global X",
        "category": "Marché américain",
        "exposure": "S&P 500",
        "region": "États-Unis — grandes capitalisations"
    },
    {
        "ticker": "HSH",
        "name": "Global X S&P 500 CAD Hedged Index Corporate Class ETF",
        "provider": "Global X",
        "category": "Marché américain",
        "exposure": "S&P 500 couvert en CAD",
        "region": "États-Unis — grandes capitalisations couvertes"
    },
    {
        "ticker": "XUU",
        "name": "iShares Core S&P U.S. Total Market Index ETF",
        "provider": "iShares",
        "category": "Marché américain",
        "exposure": "Marché américain total",
        "region": "États-Unis — marché total"
    },
    {
        "ticker": "VUN",
        "name": "Vanguard U.S. Total Market Index ETF",
        "provider": "Vanguard",
        "category": "Marché américain",
        "exposure": "Marché américain total",
        "region": "États-Unis — marché total"
    },
    {
        "ticker": "ZUQ",
        "name": "BMO MSCI USA High Quality Index ETF",
        "provider": "BMO",
        "category": "Marché américain",
        "exposure": "Facteur qualité américain",
        "region": "États-Unis — qualité"
    },
    {
        "ticker": "XMU",
        "name": "iShares MSCI Min Vol USA Index ETF",
        "provider": "iShares",
        "category": "Marché américain",
        "exposure": "Faible volatilité américaine",
        "region": "États-Unis — faible volatilité"
    },
    {
        "ticker": "XQLT",
        "name": "iShares MSCI USA Quality Factor Index ETF",
        "provider": "iShares",
        "category": "Marché américain",
        "exposure": "Facteur qualité américain",
        "region": "États-Unis — qualité"
    },
    {
        "ticker": "XMTM",
        "name": "iShares MSCI USA Momentum Factor Index ETF",
        "provider": "iShares",
        "category": "Marché américain",
        "exposure": "Facteur momentum américain",
        "region": "États-Unis — momentum"
    },
    {
        "ticker": "XSU",
        "name": "iShares U.S. Small Cap Index ETF — CAD Hedged",
        "provider": "iShares",
        "category": "Marché américain",
        "exposure": "Petites capitalisations américaines",
        "region": "États-Unis — petites capitalisations"
    },
    {
        "ticker": "XEF",
        "name": "iShares Core MSCI EAFE IMI Index ETF",
        "provider": "iShares",
        "category": "International et émergents",
        "exposure": "Marchés développés hors Amérique du Nord",
        "region": "EAFE — marchés développés"
    },
    {
        "ticker": "VIU",
        "name": "Vanguard FTSE Developed All Cap ex North America Index ETF",
        "provider": "Vanguard",
        "category": "International et émergents",
        "exposure": "Marchés développés hors Amérique du Nord",
        "region": "Marchés développés"
    },
    {
        "ticker": "ZEA",
        "name": "BMO MSCI EAFE Index ETF",
        "provider": "BMO",
        "category": "International et émergents",
        "exposure": "Marchés développés EAFE",
        "region": "EAFE — marchés développés"
    },
    {
        "ticker": "XEC",
        "name": "iShares Core MSCI Emerging Markets IMI Index ETF",
        "provider": "iShares",
        "category": "International et émergents",
        "exposure": "Marchés émergents toutes capitalisations",
        "region": "Marchés émergents"
    },
    {
        "ticker": "VEE",
        "name": "Vanguard FTSE Emerging Markets All Cap Index ETF",
        "provider": "Vanguard",
        "category": "International et émergents",
        "exposure": "Marchés émergents toutes capitalisations",
        "region": "Marchés émergents"
    },
    {
        "ticker": "ZEM",
        "name": "BMO MSCI Emerging Markets Index ETF",
        "provider": "BMO",
        "category": "International et émergents",
        "exposure": "Marchés émergents",
        "region": "Marchés émergents"
    },
    {
        "ticker": "XEM",
        "name": "iShares MSCI Emerging Markets Index ETF",
        "provider": "iShares",
        "category": "International et émergents",
        "exposure": "Marchés émergents",
        "region": "Marchés émergents"
    },
    {
        "ticker": "XAW",
        "name": "iShares Core MSCI All Country World ex Canada Index ETF",
        "provider": "iShares",
        "category": "International et émergents",
        "exposure": "Monde hors Canada",
        "region": "Monde hors Canada"
    },
    {
        "ticker": "VXC",
        "name": "Vanguard FTSE Global All Cap ex Canada Index ETF",
        "provider": "Vanguard",
        "category": "International et émergents",
        "exposure": "Monde hors Canada",
        "region": "Monde hors Canada"
    },
    {
        "ticker": "XWD",
        "name": "iShares MSCI World Index ETF",
        "provider": "iShares",
        "category": "International et émergents",
        "exposure": "Marchés développés mondiaux",
        "region": "Monde développé"
    },
    {
        "ticker": "XIN",
        "name": "iShares MSCI EAFE Index ETF — CAD Hedged",
        "provider": "iShares",
        "category": "International et émergents",
        "exposure": "EAFE couvert en CAD",
        "region": "EAFE — couvert"
    },
    {
        "ticker": "XEU",
        "name": "iShares MSCI Europe IMI Index ETF",
        "provider": "iShares",
        "category": "International et émergents",
        "exposure": "Actions européennes",
        "region": "Europe"
    },
    {
        "ticker": "XCH",
        "name": "iShares China Index ETF",
        "provider": "iShares",
        "category": "International et émergents",
        "exposure": "Actions chinoises",
        "region": "Chine"
    },
    {
        "ticker": "CJP",
        "name": "iShares Japan Fundamental Index ETF",
        "provider": "iShares",
        "category": "International et émergents",
        "exposure": "Actions japonaises",
        "region": "Japon"
    },
    {
        "ticker": "XID",
        "name": "iShares India Index ETF",
        "provider": "iShares",
        "category": "International et émergents",
        "exposure": "Actions indiennes",
        "region": "Inde"
    },
    {
        "ticker": "XEQT",
        "name": "iShares Core Equity ETF Portfolio",
        "provider": "iShares",
        "category": "Portefeuilles tout-en-un",
        "exposure": "Portefeuille 100 % actions",
        "region": "Monde — tout-en-un actions"
    },
    {
        "ticker": "XGRO",
        "name": "iShares Core Growth ETF Portfolio",
        "provider": "iShares",
        "category": "Portefeuilles tout-en-un",
        "exposure": "Portefeuille croissance",
        "region": "Monde — tout-en-un croissance"
    },
    {
        "ticker": "XBAL",
        "name": "iShares Core Balanced ETF Portfolio",
        "provider": "iShares",
        "category": "Portefeuilles tout-en-un",
        "exposure": "Portefeuille équilibré",
        "region": "Monde — tout-en-un équilibré"
    },
    {
        "ticker": "XCNS",
        "name": "iShares Core Conservative Balanced ETF Portfolio",
        "provider": "iShares",
        "category": "Portefeuilles tout-en-un",
        "exposure": "Portefeuille prudent",
        "region": "Monde — tout-en-un prudent"
    },
    {
        "ticker": "XINC",
        "name": "iShares Core Income Balanced ETF Portfolio",
        "provider": "iShares",
        "category": "Portefeuilles tout-en-un",
        "exposure": "Portefeuille de revenu",
        "region": "Monde — tout-en-un revenu"
    },
    {
        "ticker": "VEQT",
        "name": "Vanguard All-Equity ETF Portfolio",
        "provider": "Vanguard",
        "category": "Portefeuilles tout-en-un",
        "exposure": "Portefeuille 100 % actions",
        "region": "Monde — tout-en-un actions"
    },
    {
        "ticker": "VGRO",
        "name": "Vanguard Growth ETF Portfolio",
        "provider": "Vanguard",
        "category": "Portefeuilles tout-en-un",
        "exposure": "Portefeuille croissance",
        "region": "Monde — tout-en-un croissance"
    },
    {
        "ticker": "VBAL",
        "name": "Vanguard Balanced ETF Portfolio",
        "provider": "Vanguard",
        "category": "Portefeuilles tout-en-un",
        "exposure": "Portefeuille équilibré",
        "region": "Monde — tout-en-un équilibré"
    },
    {
        "ticker": "VCNS",
        "name": "Vanguard Conservative ETF Portfolio",
        "provider": "Vanguard",
        "category": "Portefeuilles tout-en-un",
        "exposure": "Portefeuille prudent",
        "region": "Monde — tout-en-un prudent"
    },
    {
        "ticker": "VRIF",
        "name": "Vanguard Retirement Income ETF Portfolio",
        "provider": "Vanguard",
        "category": "Portefeuilles tout-en-un",
        "exposure": "Portefeuille de revenu de retraite",
        "region": "Monde — tout-en-un revenu"
    },
    {
        "ticker": "ZEQT",
        "name": "BMO All-Equity ETF",
        "provider": "BMO",
        "category": "Portefeuilles tout-en-un",
        "exposure": "Portefeuille 100 % actions",
        "region": "Monde — tout-en-un actions"
    },
    {
        "ticker": "ZGRO",
        "name": "BMO Growth ETF",
        "provider": "BMO",
        "category": "Portefeuilles tout-en-un",
        "exposure": "Portefeuille croissance",
        "region": "Monde — tout-en-un croissance"
    },
    {
        "ticker": "ZBAL",
        "name": "BMO Balanced ETF",
        "provider": "BMO",
        "category": "Portefeuilles tout-en-un",
        "exposure": "Portefeuille équilibré",
        "region": "Monde — tout-en-un équilibré"
    },
    {
        "ticker": "ZCON",
        "name": "BMO Conservative ETF",
        "provider": "BMO",
        "category": "Portefeuilles tout-en-un",
        "exposure": "Portefeuille prudent",
        "region": "Monde — tout-en-un prudent"
    },
    {
        "ticker": "XBB",
        "name": "iShares Core Canadian Universe Bond Index ETF",
        "provider": "iShares",
        "category": "Obligations et liquidités",
        "exposure": "Univers obligataire canadien",
        "region": "Canada — obligations"
    },
    {
        "ticker": "VAB",
        "name": "Vanguard Canadian Aggregate Bond Index ETF",
        "provider": "Vanguard",
        "category": "Obligations et liquidités",
        "exposure": "Obligations canadiennes agrégées",
        "region": "Canada — obligations"
    },
    {
        "ticker": "ZAG",
        "name": "BMO Aggregate Bond Index ETF",
        "provider": "BMO",
        "category": "Obligations et liquidités",
        "exposure": "Obligations canadiennes agrégées",
        "region": "Canada — obligations"
    },
    {
        "ticker": "XQB",
        "name": "iShares High Quality Canadian Bond Index ETF",
        "provider": "iShares",
        "category": "Obligations et liquidités",
        "exposure": "Obligations canadiennes de qualité",
        "region": "Canada — obligations"
    },
    {
        "ticker": "XSB",
        "name": "iShares Core Canadian Short Term Bond Index ETF",
        "provider": "iShares",
        "category": "Obligations et liquidités",
        "exposure": "Obligations canadiennes court terme",
        "region": "Canada — obligations court terme"
    },
    {
        "ticker": "VSB",
        "name": "Vanguard Canadian Short-Term Bond Index ETF",
        "provider": "Vanguard",
        "category": "Obligations et liquidités",
        "exposure": "Obligations canadiennes court terme",
        "region": "Canada — obligations court terme"
    },
    {
        "ticker": "ZSB",
        "name": "BMO Short Corporate Bond Index ETF",
        "provider": "BMO",
        "category": "Obligations et liquidités",
        "exposure": "Obligations de sociétés court terme",
        "region": "Canada — crédit court terme"
    },
    {
        "ticker": "XGB",
        "name": "iShares Core Canadian Government Bond Index ETF",
        "provider": "iShares",
        "category": "Obligations et liquidités",
        "exposure": "Obligations gouvernementales canadiennes",
        "region": "Canada — gouvernement"
    },
    {
        "ticker": "ZGB",
        "name": "BMO Government Bond Index ETF",
        "provider": "BMO",
        "category": "Obligations et liquidités",
        "exposure": "Obligations gouvernementales canadiennes",
        "region": "Canada — gouvernement"
    },
    {
        "ticker": "XCB",
        "name": "iShares Core Canadian Corporate Bond Index ETF",
        "provider": "iShares",
        "category": "Obligations et liquidités",
        "exposure": "Obligations de sociétés canadiennes",
        "region": "Canada — crédit"
    },
    {
        "ticker": "ZCB",
        "name": "BMO Corporate Bond Index ETF",
        "provider": "BMO",
        "category": "Obligations et liquidités",
        "exposure": "Obligations de sociétés canadiennes",
        "region": "Canada — crédit"
    },
    {
        "ticker": "XHY",
        "name": "iShares U.S. High Yield Bond Index ETF — CAD Hedged",
        "provider": "iShares",
        "category": "Obligations et liquidités",
        "exposure": "Obligations américaines à rendement élevé",
        "region": "États-Unis — haut rendement couvert"
    },
    {
        "ticker": "ZHY",
        "name": "BMO High Yield U.S. Corporate Bond Hedged to CAD Index ETF",
        "provider": "BMO",
        "category": "Obligations et liquidités",
        "exposure": "Crédit américain à rendement élevé",
        "region": "États-Unis — haut rendement couvert"
    },
    {
        "ticker": "XFR",
        "name": "iShares Floating Rate Index ETF",
        "provider": "iShares",
        "category": "Obligations et liquidités",
        "exposure": "Obligations à taux variable",
        "region": "Canada — taux variable"
    },
    {
        "ticker": "ZFL",
        "name": "BMO Long Federal Bond Index ETF",
        "provider": "BMO",
        "category": "Obligations et liquidités",
        "exposure": "Obligations fédérales long terme",
        "region": "Canada — gouvernement long terme"
    },
    {
        "ticker": "ZFM",
        "name": "BMO Mid Federal Bond Index ETF",
        "provider": "BMO",
        "category": "Obligations et liquidités",
        "exposure": "Obligations fédérales moyen terme",
        "region": "Canada — gouvernement moyen terme"
    },
    {
        "ticker": "ZFS",
        "name": "BMO Short Federal Bond Index ETF",
        "provider": "BMO",
        "category": "Obligations et liquidités",
        "exposure": "Obligations fédérales court terme",
        "region": "Canada — gouvernement court terme"
    },
    {
        "ticker": "HBB",
        "name": "Global X Canadian Select Universe Bond Index Corporate Class ETF",
        "provider": "Global X",
        "category": "Obligations et liquidités",
        "exposure": "Univers obligataire canadien",
        "region": "Canada — obligations"
    },
    {
        "ticker": "CMR",
        "name": "iShares Premium Money Market ETF",
        "provider": "iShares",
        "category": "Obligations et liquidités",
        "exposure": "Marché monétaire canadien",
        "region": "Canada — liquidités"
    },
    {
        "ticker": "CASH",
        "name": "Global X High Interest Savings ETF",
        "provider": "Global X",
        "category": "Obligations et liquidités",
        "exposure": "Comptes d'épargne à intérêt élevé",
        "region": "Canada — liquidités"
    },
    {
        "ticker": "PSA",
        "name": "Purpose High Interest Savings Fund",
        "provider": "Purpose",
        "category": "Obligations et liquidités",
        "exposure": "Comptes d'épargne à intérêt élevé",
        "region": "Canada — liquidités"
    },
    {
        "ticker": "CSAV",
        "name": "CI High Interest Savings ETF",
        "provider": "CI Global Asset Management",
        "category": "Obligations et liquidités",
        "exposure": "Comptes d'épargne à intérêt élevé",
        "region": "Canada — liquidités"
    },
    {
        "ticker": "HISA",
        "name": "Evolve High Interest Savings Account Fund",
        "provider": "Evolve",
        "category": "Obligations et liquidités",
        "exposure": "Comptes d'épargne à intérêt élevé",
        "region": "Canada — liquidités"
    },
    {
        "ticker": "CBIL",
        "name": "Global X 0-3 Month T-Bill ETF",
        "provider": "Global X",
        "category": "Obligations et liquidités",
        "exposure": "Bons du Trésor canadiens 0-3 mois",
        "region": "Canada — bons du Trésor"
    },
    {
        "ticker": "ZMMK",
        "name": "BMO Money Market Fund ETF Series",
        "provider": "BMO",
        "category": "Obligations et liquidités",
        "exposure": "Marché monétaire canadien",
        "region": "Canada — liquidités"
    },
    {
        "ticker": "MNY",
        "name": "Purpose Cash Management Fund",
        "provider": "Purpose",
        "category": "Obligations et liquidités",
        "exposure": "Gestion de trésorerie",
        "region": "Canada — liquidités"
    },
    {
        "ticker": "ZWC",
        "name": "BMO Canadian High Dividend Covered Call ETF",
        "provider": "BMO",
        "category": "Revenu amélioré et options",
        "exposure": "Actions canadiennes à dividendes avec options couvertes",
        "region": "Canada — revenu amélioré"
    },
    {
        "ticker": "ZWG",
        "name": "BMO Global High Dividend Covered Call ETF",
        "provider": "BMO",
        "category": "Revenu amélioré et options",
        "exposure": "Actions mondiales à dividendes avec options couvertes",
        "region": "Monde — revenu amélioré"
    },
    {
        "ticker": "ZWH",
        "name": "BMO U.S. High Dividend Covered Call ETF",
        "provider": "BMO",
        "category": "Revenu amélioré et options",
        "exposure": "Actions américaines à dividendes avec options couvertes",
        "region": "États-Unis — revenu amélioré"
    },
    {
        "ticker": "ZWE",
        "name": "BMO Europe High Dividend Covered Call ETF",
        "provider": "BMO",
        "category": "Revenu amélioré et options",
        "exposure": "Actions européennes à dividendes avec options couvertes",
        "region": "Europe — revenu amélioré"
    },
    {
        "ticker": "ZWP",
        "name": "BMO Europe High Dividend Covered Call Hedged to CAD ETF",
        "provider": "BMO",
        "category": "Revenu amélioré et options",
        "exposure": "Actions européennes à dividendes couvertes en CAD",
        "region": "Europe — revenu amélioré couvert"
    },
    {
        "ticker": "HYLD",
        "name": "Hamilton Enhanced U.S. Covered Call ETF",
        "provider": "Hamilton",
        "category": "Revenu amélioré et options",
        "exposure": "FNB américains avec options couvertes",
        "region": "États-Unis — revenu amélioré"
    },
    {
        "ticker": "HDIV",
        "name": "Hamilton Enhanced Multi-Sector Covered Call ETF",
        "provider": "Hamilton",
        "category": "Revenu amélioré et options",
        "exposure": "Portefeuille multi-secteurs avec options couvertes",
        "region": "Canada — revenu amélioré"
    },
    {
        "ticker": "BANK",
        "name": "Evolve Canadian Banks and Lifecos Enhanced Yield Index Fund",
        "provider": "Evolve",
        "category": "Revenu amélioré et options",
        "exposure": "Banques et assureurs-vie canadiens",
        "region": "Canada — finance et revenu"
    },
    {
        "ticker": "HMAX",
        "name": "Hamilton Canadian Financials Yield Maximizer ETF",
        "provider": "Hamilton",
        "category": "Revenu amélioré et options",
        "exposure": "Services financiers canadiens et options",
        "region": "Canada — finance et revenu"
    },
    {
        "ticker": "UMAX",
        "name": "Hamilton Utilities Yield Maximizer ETF",
        "provider": "Hamilton",
        "category": "Revenu amélioré et options",
        "exposure": "Services publics nord-américains et options",
        "region": "Amérique du Nord — services publics et revenu"
    },
    {
        "ticker": "HUC",
        "name": "Global X Crude Oil ETF",
        "provider": "Global X",
        "category": "Actifs numériques et matières premières",
        "exposure": "Pétrole brut",
        "region": "Pétrole"
    },
    {
        "ticker": "HUN",
        "name": "Global X Natural Gas ETF",
        "provider": "Global X",
        "category": "Actifs numériques et matières premières",
        "exposure": "Gaz naturel",
        "region": "Gaz naturel"
    },
    {
        "ticker": "BTCC.B",
        "name": "Purpose Bitcoin ETF",
        "provider": "Purpose",
        "category": "Actifs numériques et matières premières",
        "exposure": "Bitcoin détenu directement",
        "region": "Actifs numériques — bitcoin"
    },
    {
        "ticker": "BTCX.B",
        "name": "CI Galaxy Bitcoin ETF",
        "provider": "CI Global Asset Management",
        "category": "Actifs numériques et matières premières",
        "exposure": "Bitcoin détenu directement",
        "region": "Actifs numériques — bitcoin"
    },
    {
        "ticker": "ETHH.B",
        "name": "Purpose Ether ETF",
        "provider": "Purpose",
        "category": "Actifs numériques et matières premières",
        "exposure": "Ether détenu directement",
        "region": "Actifs numériques — ether"
    },
    {
        "ticker": "ETHX.B",
        "name": "CI Galaxy Ethereum ETF",
        "provider": "CI Global Asset Management",
        "category": "Actifs numériques et matières premières",
        "exposure": "Ether détenu directement",
        "region": "Actifs numériques — ether"
    }
]


# Les titres les plus consultés sont chargés en priorité au démarrage afin que
# la première vue conserve rapidement des prix exploitables.
PRIORITY_ETF_TICKERS: Final[tuple[str, ...]] = tuple([
    "XIC",
    "XIU",
    "VCN",
    "ZCN",
    "XFN",
    "ZEB",
    "XDV",
    "XEI",
    "VDY",
    "XEG",
    "ZEO",
    "XMA",
    "XGD",
    "XIT",
    "TEC",
    "HXQ",
    "XRE",
    "XUT",
    "VFV",
    "XUS",
    "ZSP",
    "XUU",
    "XEF",
    "XEC",
    "XAW",
    "XEQT",
    "XGRO",
    "VEQT",
    "VGRO",
    "XBB",
    "VAB",
    "ZAG",
    "CASH",
    "PSA",
    "CMR"
])


ETF_CATALOG_SIZE: Final[int] = len(ETF_CATALOG)

if ETF_CATALOG_SIZE < 100:
    raise RuntimeError("Le répertoire ETF Anatole doit contenir au moins 100 fonds.")

_catalog_tickers = [item["ticker"] for item in ETF_CATALOG]
if len(_catalog_tickers) != len(set(_catalog_tickers)):
    raise RuntimeError("Le répertoire ETF Anatole contient des symboles en double.")
