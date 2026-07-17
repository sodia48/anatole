# Validation — Anatole Platform V0.1 Focus

## API

- `pytest -q` : 3 tests réussis.
- `GET /health` : 200 OK.
- `GET /api/v1/stocks/RY/focus` : réponse normalisée avec 260 chandeliers.
- WebSocket quote : testé avec le client FastAPI.

## Frontend

- `npm run typecheck:web` : réussi.
- `npm run build:web` : réussi avec Next.js 16.2.10.
- Route dynamique `/focus/[ticker]` : build réussi.
- Test HTTP local `/focus/RY` : 200 OK avec API FastAPI active.

## Résilience

- Fournisseur Yahoo Finance public en priorité.
- Repli automatique vers une série de démonstration cohérente si la source publique est indisponible.
- Erreur frontend globale avec action de relance.
