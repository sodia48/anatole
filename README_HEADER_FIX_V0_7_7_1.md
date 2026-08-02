# Anatole Mobile v0.7.7.1 — correction de l'en-tête

Ce correctif résout uniquement le chevauchement entre la barre mobile fixe
et le haut des pages Cockpit et Terminal Pro.

## Résultat

- le titre `S&P/TSX 60` est visible en entier;
- le titre `S&P/TSX Composite` reste visible en entier;
- le titre `Terminal Pro` n'est plus masqué;
- la barre mobile, le heatmap, Terminal Pro et le dock restent inchangés.

## Fichier remplacé

`apps/web/app/mobile.css`

## Déploiement

Décompressez le PATCH à la racine du dépôt, acceptez le remplacement, puis
redéployez uniquement Vercel avec l'ancien Build Cache désactivé.

Aucun redéploiement Render n'est nécessaire.
