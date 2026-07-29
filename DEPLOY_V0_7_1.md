# Déploiement v0.7.1

1. Décompresser le PATCH à la racine du dépôt Anatole.
2. Accepter les remplacements.
3. Commit et push sur `main`.
4. Déployer Render en premier.
5. Vérifier :

```text
https://anatole-api.onrender.com/health
```

6. Vérifier la nouvelle route avec une requête POST vers :

```text
https://anatole-api.onrender.com/api/v1/workspace/advisor-plan
```

7. Redéployer Vercel sans réutiliser l'ancien Build Cache.
8. Ouvrir `/assistant`.

Aucune variable d'environnement supplémentaire n'est nécessaire.
