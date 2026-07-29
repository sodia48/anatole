# Déploiement Anatole Conseil v0.7.2

## Installation

1. Décompresser le PATCH à la racine du dépôt Anatole.
2. Accepter les remplacements.
3. Commit et push sur `main`.

## Render

Déployer l’API en premier, puis vérifier :

```text
https://anatole-api.onrender.com/health
```

Le champ `version` dans la documentation OpenAPI doit indiquer `0.7.2`.

## Vercel

Redéployer ensuite le frontend sans réutiliser l’ancien Build Cache.

Tester :

```text
/assistant
```

Parcourir les quatre étapes, calculer le plan, ouvrir le détail du risque et poser une question à Anatole.

Aucune nouvelle variable d’environnement n’est requise.
