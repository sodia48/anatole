# Validation Anatole v0.9.2

## Backend

- 88 tests FastAPI réussis.
- 0 échec.
- Compilation Python complète réussie.
- Modification du profil validée.
- Changement du mot de passe validé.
- Fermeture automatique des autres sessions validée.
- Export du compte validé.
- Suppression définitive validée.
- Reconnexion avec l'ancien mot de passe refusée après changement.

## Frontend

- Syntaxe TypeScript contrôlée sur les fichiers modifiés.
- Tous les imports locaux du frontend sont résolus.
- CSS du compte, mobile et global équilibré.
- Route Next.js du compte étendue aux nouvelles actions.
- Aucun nouvel appel fournisseur de données de marché.

## Limite

Le build Next.js complet n'a pas été exécuté localement, car les dépendances
Node complètes du projet ne sont pas installées dans l'environnement.
Vercel effectuera le build définitif.
