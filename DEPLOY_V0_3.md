# Anatole Platform v0.3 — Watchlist

## Mise en ligne

1. Décompresser `anatole_v0_3_watchlist_patch.zip`.
2. Dans GitHub : **Add file → Upload files**.
3. Glisser le contenu intérieur du patch à la racine du dépôt.
4. Accepter le remplacement des fichiers existants.
5. Commit suggéré : `Add Anatole Watchlist v0.3`.

Render et Vercel redéploieront automatiquement. Aucune nouvelle variable d’environnement n’est nécessaire.

## Vérifications

- Swagger : `POST /api/v1/market/watchlist`
- Frontend : `/watchlist`
- Focus : le bouton **Suivre** doit ajouter/retirer le titre.
- Rafraîchissement : environ 20 secondes, sans bouton Live.

La watchlist est sauvegardée dans le navigateur pour ce jalon. La synchronisation multi-appareils viendra avec l’authentification et PostgreSQL.
