# Anatole v0.4.1 — API Bridge Hotfix

Ce correctif supprime la dépendance du navigateur à une autorisation CORS exacte pour les appels HTTP.

## Fichiers modifiés

- `apps/web/app/api/anatole/[...path]/route.ts`
- `apps/web/lib/api.ts`
- `apps/web/package.json`
- `apps/api/app/core/config.py`
- `apps/api/app/main.py`
- `apps/api/pyproject.toml`

## Déploiement

1. Téléverser le contenu du patch à la racine du dépôt GitHub.
2. Message de commit : `Fix Anatole API bridge and Vercel CORS v0.4.1`
3. Attendre les redéploiements Vercel et Render.
4. Conserver :
   - `NEXT_PUBLIC_API_URL=https://anatole-api.onrender.com`
   - `NEXT_PUBLIC_WS_URL=wss://anatole-api.onrender.com`
5. `ANATOLE_API_URL=https://anatole-api.onrender.com` peut être ajouté dans Vercel comme variable serveur, mais le correctif fonctionne aussi avec `NEXT_PUBLIC_API_URL`.

## Tests manuels

- `/api/anatole/health`
- `/api/anatole/api/v1/market/cockpit?universe=tsx60`
- `/cockpit`
- recherche `Ctrl + K`
- `/watchlist`
- `/focus/RY`
