# Déploiement v0.9.2

1. Installer le PATCH à la racine du dépôt.
2. Déployer Render en premier.
3. Vérifier `/health`, `/ready` et `/api/v1/account/me` avec une session.
4. Déployer Vercel sans l’ancien Build Cache.
5. Tester `/compte`: profil, mot de passe, export, fermeture des sessions et suppression sur un compte de test.

Aucune nouvelle variable d’environnement n’est requise.
