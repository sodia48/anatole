# Anatole Platform — Focus vertical slice

Première tranche de migration de Streamlit vers Next.js + FastAPI.

## Ce qui est inclus

- Frontend Next.js App Router en TypeScript.
- Backend FastAPI structuré avec `APIRouter`.
- Page `/focus/[ticker]`.
- Endpoints santé, cotation, historique, indicateurs, profil et vue Focus agrégée.
- WebSocket de cotation par titre.
- Fournisseur Yahoo Finance public avec repli automatique vers des données de démonstration cohérentes.
- Graphique chandeliers + volume avec Lightweight Charts.
- Gestion propre des pannes de source.

## Démarrage local

### API

```bash
cd apps/api
python -m venv .venv
# Windows: .venv\Scripts\activate
# macOS/Linux: source .venv/bin/activate
pip install -e ".[dev]"
uvicorn app.main:app --reload --port 8000
```

### Web

```bash
cd apps/web
npm install
npm run dev
```

Puis ouvrir :

- http://localhost:3000/focus/RY
- http://localhost:8000/docs
- http://localhost:8000/health

## Déploiement

### Vercel — frontend

- Root directory : `apps/web`
- Variable : `NEXT_PUBLIC_API_URL`
- Variable : `NEXT_PUBLIC_WS_URL`

### Render — API

- Root directory : `apps/api`
- Build command : `pip install -e .`
- Start command : `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
- Variable : `CORS_ORIGINS=https://votre-frontend.vercel.app`

## Étape suivante

Brancher progressivement les fonctions Python pures d’Anatole dans `apps/api/app/services` et remplacer les données de secours par le fournisseur de marché retenu.
