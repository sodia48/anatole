# Official debt profile fixtures

Captured and verified 2026-10-10. HTML is reduced to the relevant source sections.
Vancouver and Toronto's program headings are semantic transcriptions from the official page;
all numerical fixtures come from the labelled source fields, not search-result snippets.
The Toronto issue fixture remains in `test_fixed_income.py`.

| Fixture | Official source | Extraction boundary |
| --- | --- | --- |
| qc | https://www.finances.gouv.qc.ca/ministere/financement/relations_investisseurs/programme_financement_gouvernement.asp | Financing table in M$; fiscal year corresponding to the section's published date |
| on | https://www.ofina.on.ca/borrowing_debt/borrowing.htm | Labelled total long-term public borrowing; never total borrowed or short-term capacity |
| ab | https://www.alberta.ca/investor-relations | Total borrowing requirements; current-year Q1 forecast rather than the original target or later fiscal years |
| sk | https://www.saskatchewan.ca/Government/Budget-Planning-and-Reporting/Investor-Relations | Official chart alt text: total budget borrowing requirements including term and short-term |
| nb | https://www.gnb.ca/en/topic/your-gov/budget-finance/investor-relations.html | Provincial long-term borrowing; excludes NB Power and Municipal Finance Corporation |
| nb-issues | https://www.gnb.ca/en/topic/your-gov/budget-finance/investor-relations.html | Current fiscal-year issues; reject the malformed settlement date rather than guessing a correction |
| nl | https://investorrelations.gov.nl.ca/ | Budget borrowing requirement and most recent domestic issue; explicit published issue yield |
| nl-debt | https://investorrelations.gov.nl.ca/debtportfolio.aspx | Gross debentures and Treasury bills; excludes enterprises, agencies and boards |
| vancouver | https://vancouver.ca/your-government/investor-relations.aspx | Named programs and historical inaugural green bond; currency not inferred from `$` |
| quebec-city | https://www.ville.quebec.qc.ca/apropos/profil-financier/investisseurs/programme-financement.aspx | Explicit annual projected financing requirement; not the approximate multi-year borrowing volume |
| toronto-profile | https://www.toronto.ca/city-government/budget-finances/city-finance/investor-relations/ | Official named debenture programs |

Undated plans/programs have no invented observation timestamp. Their fiscal year does not imply
a publication date. Dates from unrelated charts, debt tables, HTML comments and copyright years
are not used. Net debt, projected average terms and historical new-borrowing terms are not
relabelled as current debt outstanding or current average debt maturity.
