# Anatole Platform v0.3

Migration Next.js + FastAPI d’Anatole.

## Sections disponibles

- `/cockpit` — Cockpit TSX 60 avec heatmap et mise à jour automatique.
- `/focus/RY` — Focus d’un titre avec graphique et cotation WebSocket.
- `/watchlist` — liste personnalisée, sauvegardée localement et actualisée toutes les 20 secondes.

## Architecture

- Frontend : Next.js / React / TypeScript
- Backend : FastAPI / Python
- Graphiques : Lightweight Charts
- Déploiement : Vercel + Render

## Développement local

Consulter `.env.example`, puis lancer l’API et le frontend dans deux terminaux.

## Données

Les flux publics peuvent être différés. Le fournisseur de repli préserve le fonctionnement de l’interface lorsque la source principale est indisponible.
