# Anatole Platform v0.2 — Cockpit TSX 60

Monorepo de migration d’Anatole vers Next.js + FastAPI.

## Fonctionnel

- `/cockpit` : carte du S&P/TSX 60, largeur de marché, secteurs et principaux mouvements.
- Actualisation automatique toutes les 15 secondes, sans bouton Live.
- Chaque tuile ouvre `/focus/{ticker}`.
- `/focus/RY` et autres pages Focus avec WebSocket.
- FastAPI sur Render et Next.js sur Vercel.

## API ajoutée

- `GET /api/v1/market/cockpit?universe=tsx60`

## Déploiement

Téléverser les fichiers du patch à la racine du dépôt GitHub. Le commit déclenche automatiquement :

- un redéploiement de l’API Render via `render.yaml`;
- un redéploiement du frontend Vercel connecté à `apps/web`.

Les variables existantes restent inchangées.
