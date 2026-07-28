# Anatole v0.6 — Comparateur + Terminal Pro

Ce paquet doit être copié à la racine du dépôt Anatole actuellement opérationnel.
Il ajoute les deux sections v0.6 sans remplacer les services ETF, Screener, IPO ou initiés.

## Installation

1. Décompressez le ZIP.
2. Copiez son contenu à la racine du dépôt.
3. Acceptez les remplacements des fichiers existants.
4. Committez et poussez sur `main`.
5. Déployez Render en premier.
6. Vérifiez `/health`, `/api/v1/analysis/terminal`, puis la route POST `/api/v1/analysis/compare`.
7. Déployez ensuite Vercel en désactivant l’ancien Build Cache.
8. Ouvrez `/comparateur` et `/terminal`.

Aucun fichier ne doit être supprimé et aucune nouvelle clé API n’est requise.

## Routes ajoutées

- `POST /api/v1/analysis/compare`
- `GET /api/v1/analysis/terminal`

## Variables Vercel

- `NEXT_PUBLIC_API_URL=https://anatole-api.onrender.com`
- `ANATOLE_API_URL=https://anatole-api.onrender.com`

## Important

Ce patch a été construit à partir de la version opérationnelle qui rétablit Screener, ETF, IPO et initiés. Ne réinstallez pas un ancien correctif par-dessus.
