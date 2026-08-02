# Déploiement Anatole v1.1.0

## 1. Render

Ajoutez à `anatole-api → Environment` :

`ACCOUNT_ADMIN_EMAILS=<courriel exact de votre compte Anatole>`

Conservez les variables PostgreSQL et de bêta privée déjà présentes.

Déployez Render en premier, puis vérifiez `/health` et `/ready`.

## 2. Vercel

Déployez ensuite Vercel sans réutiliser l'ancien Build Cache.

Ouvrez `/admin`. L'entrée `Console bêta` apparaît dans la sidebar seulement
pour un compte dont le courriel figure dans `ACCOUNT_ADMIN_EMAILS`.

## Route spéciale GitHub

Le chemin suivant contient `[...path]` :

`apps/web/app/api/admin/[...path]/route.ts`

Si Windows refuse ce dossier, utilisez GitHub → Add file → Create new file,
puis copiez le contenu de `MANUAL_GITHUB/admin-route.ts`.

## Test conseillé

1. Créez une invitation à une utilisation.
2. Copiez le code.
3. Créez un compte de test dans une fenêtre privée.
4. Vérifiez que le code ne fonctionne plus une seconde fois.
5. Envoyez un signalement avec le bouton global.
6. Classez-le comme Résolu dans `/admin`.
