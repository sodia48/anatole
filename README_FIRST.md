# Anatole v1.1.4 — correction définitive du 404 Admin

## Cause

Le frontend `/admin` est bien déployé, mais Render exécute encore un backend
sans les routes `/api/v1/admin/*`. Un courriel correct dans
`ACCOUNT_ADMIN_EMAILS` ne peut pas corriger une route absente : FastAPI répond
404 avant même de vérifier le rôle administrateur.

## Correction

Ce paquet installe toute la couche backend Admin :

- routeur `/api/v1/admin`;
- endpoints overview, users, invites et reports;
- schémas et stockage PostgreSQL;
- rôle administrateur calculé depuis `ACCOUNT_ADMIN_EMAILS`;
- signalements persistants;
- garde de démarrage qui empêche Render de démarrer si les routes Admin sont absentes;
- diagnostic Admin ajouté à `/ready`.

## Installation

1. Décompresser le PATCH à la racine du dépôt.
2. Remplacer tous les fichiers proposés.
3. Commit et push sur `main`.
4. Déployer **Render uniquement**.
5. Ne pas redéployer Vercel pour ce correctif.

## Variable Render

Utiliser l'adresse exacte du compte Anatole :

`ACCOUNT_ADMIN_EMAILS=solo0112@live.fr`

Puis cliquer sur **Save, rebuild and deploy**.

## Vérifications

Après le déploiement, ouvrir :

`https://anatole-api.onrender.com/ready`

Le JSON doit contenir :

```json
"admin_console": {
  "status": "ready",
  "routes_enabled": true,
  "configured_admins": 1
}
```

Puis ouvrir directement :

`https://anatole-api.onrender.com/api/v1/admin/overview`

Dans un navigateur sans jeton, la réponse correcte est **401** avec
`Connexion administrateur requise.` Une réponse **404** signifie que Render
n'a pas déployé ce commit.

Enfin, se déconnecter/reconnecter dans Anatole et ouvrir `/admin`.
