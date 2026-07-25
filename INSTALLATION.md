# Anatole Signature Mobile v4 — toutes les sections

Cette version conserve le Cockpit mobile validé et applique le même niveau de finition à l’ensemble de l’application Next.js.

## Sections couvertes

- Cockpit
- Focus
- Screener
- Actualités
- Calendrier
- ETF et fiches ETF
- IPO & insiders
- Psychologie
- Watchlist
- Préférences
- Roadmap et fonctions à venir

## Fichiers à remplacer

- `apps/web/app/mobile.css`
- `apps/web/components/layout/AppSidebar.tsx`

Le ZIP contient aussi les fichiers v3.2 build-safe déjà validés afin de pouvoir réinstaller tout le correctif proprement :

- `apps/web/app/layout.tsx`
- `apps/web/app/providers.tsx`
- `apps/web/components/cockpit/MarketHeatmap.tsx`
- `apps/web/components/cockpit/MarketHeatmap.module.css`

## Fichier à supprimer

S’il existe encore :

- `apps/web/components/layout/MobileDesktopParity.tsx`

## Ce que fait v4

- identifie automatiquement la route mobile active avec `data-anatole-section`;
- garde le CSS ordinateur intact;
- transforme les filtres complexes en grilles tactiles lisibles;
- affiche les KPI en 2 × 2;
- empile proprement les cartes et modules analytiques;
- limite le défilement horizontal aux tableaux qui en ont réellement besoin;
- rend les onglets horizontalement défilables sans couper les libellés;
- adapte les cartes ETF, IPO, actualités, calendrier et watchlist;
- conserve la heatmap Cockpit responsive déjà validée;
- conserve `PreferencesProvider` autour de toute l’application.

## Installation

1. Décompresser le ZIP.
2. Copier les fichiers dans le dépôt en respectant exactement les chemins.
3. Supprimer `MobileDesktopParity.tsx` s’il existe.
4. Commit et push sur la branche de production.
5. Dans Vercel, lancer **Redeploy**.
6. Désactiver **Use existing Build Cache** pour ce premier déploiement.
7. Tester au minimum : `/cockpit`, `/focus/RY`, `/screener`, `/actualites`, `/calendrier`, `/etf`, `/ipo-insiders`, `/psychologie`, `/watchlist`, `/preferences`.

## Backend

Aucun changement Render ou FastAPI n’est requis.
