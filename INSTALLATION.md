# Installation — Anatole Operational Final v1

## Option recommandée : paquet PATCH

Décompresser `Anatole_Operational_Final_v1_PATCH.zip` à la racine du dépôt.
Les chemins contenus dans le ZIP correspondent directement aux chemins GitHub.

Supprimer ensuite :

`apps/web/app/route_anatole_proxy.ts`

Ce fichier est obsolète. Le relais correct est déjà défini dans
`apps/web/next.config.ts` avec la réécriture `/api/anatole/:path*`.

## Ordre obligatoire

1. Commit et push.
2. Render : déployer `anatole-api`.
3. Tester les sept URL indiquées dans `README_FIRST.md`.
4. Vercel : déployer le frontend seulement après la réussite des routes Render.
5. Désactiver la réutilisation du Build Cache pour ce premier déploiement.

## Configuration Render

- Root Directory : `apps/api`
- Build Command : `pip install -e .`
- Start Command : celui défini dans `render.yaml`
- Health Check Path : `/health`

Le fichier `apps/api/pyproject.toml` contient les dépendances des participations
ETF et des transactions d’initiés, notamment `pandas` et `yfinance`.

## Configuration Vercel

- Root Directory : laisser la configuration actuelle du monorepo si elle
  fonctionnait auparavant.
- `NEXT_PUBLIC_API_URL=https://anatole-api.onrender.com`
- `ANATOLE_API_URL=https://anatole-api.onrender.com` recommandé.
