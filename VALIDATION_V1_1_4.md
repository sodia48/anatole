# Validation v1.1.4

- 92 tests FastAPI réussis, 0 échec.
- Routes présentes : overview, users, invites, revoke, reports, report update.
- Une requête Admin sans session retourne 401, pas 404.
- Un compte non-administrateur retourne 403.
- Un compte dont le courriel figure dans ACCOUNT_ADMIN_EMAILS retourne 200.
- `/ready` expose admin_console.routes_enabled=true et le nombre d'administrateurs configurés.
- Le démarrage échoue explicitement si une route Admin obligatoire manque.
- Aucun fichier frontend n'est modifié.
