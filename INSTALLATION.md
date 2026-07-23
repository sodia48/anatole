# ETF Holdings & Drivers V3

Cette version ajoute une fiche détaillée au clic sur chaque bloc de la
heatmap ETF.

## Fonctionnalités

- principales positions de l’ETF;
- poids de chaque position dans le fonds;
- variation de séance de chaque position;
- contribution estimée de chaque moteur à la variation de l’ETF;
- distinction entre action et ETF sous-jacent;
- répartition sectorielle;
- composition par classe d’actifs;
- actualisation automatique toutes les 30 secondes;
- clic sur une action vers Focus;
- clic sur un ETF sous-jacent vers sa propre fiche ETF;
- source affichée une seule fois en bas de page.

La contribution est calculée ainsi :

`poids de la position × variation de séance / 100`

Il s’agit d’une approximation : elle ne prend pas en compte les flux,
les frais, les devises, les instruments dérivés ni les changements
intrajournaliers de composition.

## Ajouter

- `apps/api/app/schemas/etf_holdings.py`
- `apps/api/app/services/etf_holdings.py`
- `apps/api/app/api/routes/etf_holdings.py`
- `apps/api/tests/test_etf_holdings.py`
- `apps/web/lib/etf-holdings-api.ts`
- `apps/web/app/etf/[ticker]/page.tsx`
- `apps/web/app/etf/[ticker]/page.module.css`

## Remplacer

- `apps/api/app/api/router.py`
- `apps/web/components/etf/EtfHeatmap.tsx`

Les fichiers de la V2 de la heatmap sont aussi inclus dans le ZIP afin
de garder une livraison complète.

## Déploiement

1. Ajoute ou remplace tous les fichiers dans GitHub.
2. Render → `anatole-api` → `Clear build cache & deploy`.
3. Vérifie :
   `/api/v1/discovery/etfs/XIU/holdings`
4. La réponse doit contenir `holdings`, `sectors` et
   `top_holdings_weight_percent`.
5. Vercel → redéploie sans ancien cache.
6. Recharge `/etf` avec `Ctrl + Shift + R`.
7. Clique sur XIU, XIC, VFV ou ZEB pour ouvrir la nouvelle fiche.

Aucune nouvelle variable d’environnement n’est nécessaire. Le frontend
utilise `NEXT_PUBLIC_API_URL`, puis `NEXT_PUBLIC_API_BASE_URL`, avec
l’API Render d’Anatole comme repli.
