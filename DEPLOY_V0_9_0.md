# Déploiement Anatole v0.9.0

## 1. Préparer la base durable

Créez une base PostgreSQL pour Anatole et copiez son URL de connexion.

Dans Render, ajoutez à `anatole-api` :

```text
ACCOUNT_DATABASE_URL=<URL PostgreSQL>
ACCOUNT_SESSION_DAYS=30
ACCOUNT_REGISTRATION_ENABLED=true
```

L'API accepte aussi `DATABASE_URL`.

## 2. Déployer Render

Déployez l'API en premier, puis vérifiez :

```text
https://anatole-api.onrender.com/health
https://anatole-api.onrender.com/ready
```

Dans `/ready`, `account_storage.durable` doit être `true`.

## 3. Déployer Vercel

Conservez la variable serveur :

```text
ANATOLE_API_URL=https://anatole-api.onrender.com
```

Redéployez Vercel sans réutiliser l'ancien Build Cache.

## 4. Test fonctionnel

1. Ouvrez `/compte` sur un premier appareil.
2. Ajoutez un titre à la Watchlist et une position de suivi.
3. Créez un compte.
4. Vérifiez l'état `À jour`.
5. Connectez-vous avec le même compte dans un autre navigateur.
6. Vérifiez la Watchlist, le Portefeuille, les Alertes et les préférences.
7. Modifiez un élément sur le second appareil et attendez moins d'une minute.
8. Vérifiez sa restauration sur le premier appareil.
9. Testez `Fermer toutes les sessions`.

## 5. Retour arrière

La v0.9.0 ne modifie aucune table de marché. Un rollback du frontend et de
l'API vers v0.8 laisse les tables de compte inutilisées, sans affecter les
sections financières.
