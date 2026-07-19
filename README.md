# Anatole Platform v0.4

Migration Next.js + FastAPI d’Anatole.

## Sections disponibles

- `/cockpit` — Cockpit TSX 60 avec heatmap et mise à jour automatique.
- `/focus/RY` — Focus d’un titre avec graphique et cotation WebSocket.
- `/watchlist` — liste personnalisée, sauvegardée localement et actualisée automatiquement.
- `/preferences` — thème, densité, décimales et période par défaut.
- `/roadmap` — registre de migration des fonctionnalités de la bêta Streamlit.

## Nouveau dans v0.4

- navigation complète desktop et mobile ;
- regroupement Marchés, Analyse, Mon espace et Intelligence ;
- recherche universelle avec `Ctrl + K` ;
- recherche de symboles TSX 60 par nom, secteur ou ticker ;
- ouverture directe de n’importe quel symbole dans Focus ;
- état global de l’API ;
- thème sombre par défaut et thème bleu optionnel ;
- densité confortable ou compacte ;
- préférences persistantes dans le navigateur ;
- cadences de rafraîchissement centralisées.

## Architecture

- Frontend : Next.js / React / TypeScript
- Backend : FastAPI / Python
- Graphiques : Lightweight Charts
- Déploiement : Vercel + Render

## Développement local

Consulter `.env.example`, puis lancer l’API et le frontend dans deux terminaux.

## Données

Les flux publics peuvent être différés. Le fournisseur de repli préserve le fonctionnement de l’interface lorsque la source principale est indisponible.
