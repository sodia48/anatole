# Restauration du heatmap Cockpit v0.7.2

Ce correctif restaure uniquement le heatmap du Cockpit dans son état v0.7.2.

## Fichiers remplacés

- `apps/web/components/cockpit/MarketHeatmap.tsx`
- `apps/web/components/cockpit/MarketHeatmap.module.css`

## Éléments qui ne sont pas modifiés

- Focus LIVE v0.7.5;
- navigation mobile;
- dock inférieur;
- carte mobile ETF;
- backend FastAPI;
- Screener, Portefeuille, Alertes et Anatole Conseil.

## Installation

Décompressez le ZIP à la racine du dépôt, acceptez les deux remplacements,
puis redéployez uniquement Vercel sans réutiliser l'ancien Build Cache.

Aucun redéploiement Render n'est nécessaire.
