# Anatole v0.7 — Portefeuille, Alertes, Assistant et Qualité des données

## Ordre de déploiement

1. Copiez le contenu du PATCH à la racine du dépôt Anatole.
2. Committez et poussez sur `main`.
3. Déployez **Render en premier**.
4. Vérifiez :
   - `/health`
   - `/api/v1/workspace/data-quality`
   - un POST vers `/api/v1/workspace/portfolio`
5. Déployez ensuite Vercel sans réutiliser l'ancien cache de build.
6. Ouvrez :
   - `/portefeuille`
   - `/alertes`
   - `/assistant`
   - `/qualite`

## Variables

Conservez :

```text
NEXT_PUBLIC_API_URL=https://anatole-api.onrender.com
ANATOLE_API_URL=https://anatole-api.onrender.com
```

Aucune clé OpenAI n'est nécessaire. L'Assistant v0.7 est un moteur contextuel déterministe fondé sur les données Anatole.

## Persistance actuelle

- Portefeuille : `localStorage` du navigateur.
- Alertes : `localStorage` du navigateur.
- Notifications : API Notification du navigateur, après autorisation.
- Aucune position personnelle n'est enregistrée dans une base serveur.

Les alertes v0.7 sont évaluées toutes les 30 secondes lorsque la section Alertes est ouverte. Une surveillance serveur permanente nécessite la future couche comptes + PostgreSQL.
