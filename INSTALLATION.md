# ETF Live Treemap V2

Cette version transforme la section ETF en véritable carte de marché,
sur le même modèle que la carte des actions.

## Résultat

- regroupement sectoriel par défaut;
- blocs rectangulaires proportionnels à la liquidité;
- couleurs vertes, rouges ou neutres selon la variation de séance;
- prix et variations mis à jour automatiquement;
- actualisation frontend toutes les 15 secondes;
- rafraîchissement backend continu avec cache;
- 100 ETF les plus liquides affichés par défaut;
- option pour afficher les 172 ETF;
- regroupement alternatif par fournisseur ou direction;
- clic sur un ETF vers `/focus/{ticker}`;
- une panne de cotation ne vide jamais le catalogue.

## Ajouter

- `apps/web/components/etf/EtfHeatmap.tsx`
- `apps/api/app/data/__init__.py`
- `apps/api/tests/test_etf_live_treemap.py`

## Remplacer

- `apps/api/app/data/etf_catalog.py`
- `apps/api/app/services/etf.py`
- `apps/web/app/etf/page.tsx`
- `apps/web/app/etf/page.module.css`

## Déploiement

1. Ajoute ou remplace tous les fichiers du ZIP dans GitHub.
2. Render → `anatole-api` → `Clear build cache & deploy`.
3. Vérifie :
   `https://anatole-api.onrender.com/api/v1/discovery/etfs`
4. La réponse doit contenir 172 éléments et `refresh_after_seconds: 15`.
5. Vercel → redéploie Anatole sans ancien cache.
6. Recharge `/etf` avec `Ctrl + Shift + R`.

## Important

Le badge LIVE indique une actualisation automatique de l'application.
Les données du fournisseur public peuvent rester différées; cette mention
reste visible dans l'interface.
