# Anatole Platform v0.5 — Marchés

Migration Next.js + FastAPI d’Anatole.

## Sections disponibles

- `/cockpit` — Cockpit TSX 60 avec heatmap et mise à jour automatique.
- `/focus/RY` — Focus d’un titre avec graphique et cotation WebSocket.
- `/watchlist` — liste personnalisée et actualisée automatiquement.
- `/screener` — classement du TSX 60 par score, momentum, RSI et volume relatif.
- `/actualites` — publications officielles de la Banque du Canada et de Statistique Canada.
- `/calendrier` — calendrier des indicateurs clés et événements de politique monétaire.
- `/etf` — répertoire de 30 ETF canadiens avec prix actualisés.
- `/psychologie` — indice psychologique Anatole Canada.
- `/preferences` — thème, densité, décimales et période par défaut.
- `/roadmap` — registre des fonctionnalités restantes.

## Données et sources

- Cotations et historiques : flux public Yahoo avec repli de démonstration clairement indiqué.
- Actualités : flux RSS/Atom officiels de la Banque du Canada et de Statistique Canada.
- Calendrier : service JSON officiel des indicateurs clés de Statistique Canada et flux des événements de la Banque du Canada.
- ETF : répertoire éditorial Anatole et cotations publiques.
- Psychologie : indicateur dérivé du S&P/TSX Composite et de la largeur du TSX 60.

Les cotations publiques peuvent être différées. Les flux officiels indisponibles ne sont pas remplacés par de fausses nouvelles ou de faux événements.

## Architecture

- Frontend : Next.js / React / TypeScript
- Backend : FastAPI / Python
- Graphiques : Lightweight Charts
- Déploiement : Vercel + Render

## Déploiement

Consulter `DEPLOY_V0_5.md`. Aucune nouvelle variable d’environnement n’est nécessaire par rapport à v0.4.1.
