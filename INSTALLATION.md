# ETF Holdings, Drivers & Performance V4

Cette version conserve les positions motrices de la V3 et ajoute un
graphique de progression dans chaque fiche ETF.

## Périodes disponibles

- 5J : cinq dernières séances, données intrajournalières de 30 minutes;
- 1M : un mois;
- YTD : depuis le début de l’année;
- 6M : six mois;
- 1A : un an;
- 5A : cinq ans;
- 10A : dix ans.

## Informations affichées

- performance de la période;
- cours au début de la période;
- dernier cours;
- sommet;
- creux;
- graphique interactif avec curseur et infobulle;
- heures affichées dans le fuseau de Toronto;
- actualisation automatique selon la période.

## Ajouter

- `apps/api/app/schemas/etf_history.py`
- `apps/api/app/services/etf_history.py`
- `apps/api/tests/test_etf_history.py`
- `apps/web/components/etf/EtfPerformanceChart.tsx`

## Remplacer

- `apps/api/app/api/routes/etf_holdings.py`
- `apps/web/lib/etf-holdings-api.ts`
- `apps/web/app/etf/[ticker]/page.tsx`
- `apps/web/app/etf/[ticker]/page.module.css`

Tous les fichiers de la V3 sont également inclus dans le ZIP.

## Déploiement

1. Ajoute ou remplace tous les fichiers du ZIP dans GitHub.
2. Render → `anatole-api` → `Clear build cache & deploy`.
3. Vérifie :
   `/api/v1/discovery/etfs/XIU/history?range=1y`
4. La réponse doit contenir `points`, `change_percent`,
   `period_high` et `period_low`.
5. Vérifie aussi les autres périodes :
   - `range=5d`
   - `range=1mo`
   - `range=ytd`
   - `range=6mo`
   - `range=5y`
   - `range=10y`
6. Vercel → redéploie sans ancien cache.
7. Recharge une fiche comme `/etf/XIU` avec `Ctrl + Shift + R`.

Aucune nouvelle variable d’environnement n’est nécessaire.
