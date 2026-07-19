# Anatole Platform v0.4 — Socle de parité

## Mise en ligne

1. Décompresser `anatole_v0_4_foundation_patch.zip`.
2. Dans GitHub : **Add file → Upload files**.
3. Glisser le contenu intérieur du patch à la racine du dépôt.
4. Accepter le remplacement des fichiers existants.
5. Commit suggéré : `Add Anatole foundation and navigation v0.4`.

Render et Vercel redéploieront automatiquement. Aucune nouvelle variable d’environnement n’est nécessaire.

## Vérifications

### FastAPI

Dans Swagger, vérifier :

- `GET /health`
- `GET /api/v1/search/symbols?q=RY`

### Frontend

- `/cockpit`
- `/focus/RY`
- `/watchlist`
- `/preferences`
- `/roadmap`

Tester `Ctrl + K`, puis chercher `RY`, `Shopify` et `MDA`.

## Notes

- La recherche de catalogue est limitée au TSX 60 dans v0.4.
- La saisie directe permet néanmoins d’ouvrir d’autres symboles dans Focus.
- Le TSX Composite sera branché au moteur de données dans la phase Marchés.
