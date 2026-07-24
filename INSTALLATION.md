# Anatole — parité mobile / ordinateur v1

Cette livraison conserve sur téléphone la même architecture visuelle que
sur ordinateur. Elle ne remplace plus les sections par des versions mobiles
simplifiées.

## Fichiers à remplacer

- `apps/web/components/layout/AppSidebar.tsx`
- `apps/web/components/cockpit/MarketHeatmap.module.css`
- `apps/web/components/ipo-insiders/IpoInsiders.module.css`
- `apps/web/components/etf/EtfHeatmap.tsx`

## Fichier à ajouter

- `apps/web/components/layout/MobileDesktopParity.tsx`

Deux copies synchronisées sont aussi fournies sous `components/layout/`
parce que ce dépôt a déjà contenu les deux arborescences.

## Ce qui change

- Le téléphone utilise le menu complet de l’ordinateur dans un tiroir.
- Toutes les sections disponibles restent accessibles.
- Le menu inférieur mobile simplifié disparaît.
- Les cartes KPI restent sur une ligne horizontale.
- Les tableaux conservent toutes leurs colonnes.
- Focus conserve le graphique et la colonne d’analyse de bureau.
- La heatmap TSX 60 conserve son regroupement sectoriel de bureau.
- La carte ETF conserve son ratio et ne se déforme plus.
- IPO et Initiés conservent leurs grilles, filtres et tableaux complets.
- Les zones trop larges défilent localement, sans transformer toute la page
  en immense canvas horizontal.
- Aucun contenu n’est masqué pour mobile.

## Déploiement

1. Téléverser les fichiers en respectant exactement les chemins.
2. Commit et push sur la branche de production.
3. Vercel → Redeploy.
4. Désactiver `Use existing Build Cache`.
5. Tester avec Chrome mobile et Safari iPhone.
6. Recharger avec un rafraîchissement complet.

Aucun changement Render/FastAPI n’est requis.
