# Anatole Admin Routes Recovery v1.1.6

## Ce que confirme `/ready`

- `configured_admins: 1` : le courriel administrateur est correctement lu.
- `routes_enabled: false` : le routeur Admin n'a pas pu être importé.
- Les quatre routes manquantes signifient généralement que `admin.py` ou
  `schemas/admin.py` manque dans GitHub, ou qu'un fichier a été ajouté sous
  un nom numéroté au mauvais endroit.

## Chemins obligatoires

Les fichiers doivent exister exactement ici :

1. `apps/api/app/api/router.py`
2. `apps/api/app/main.py`
3. `apps/api/app/api/routes/admin.py`
4. `apps/api/app/api/routes/health.py`
5. `apps/api/app/schemas/admin.py`
6. `apps/api/app/schemas/accounts.py`
7. `apps/api/app/services/accounts.py`
8. `apps/api/app/core/config.py`

Ne créez pas des fichiers comme `03_admin.py` directement dans le dépôt.
Les noms numérotés du dossier `MANUAL_GITHUB` servent uniquement à les
identifier avant de copier leur contenu au chemin exact.

## Méthode la plus fiable

Pour chaque chemin :

1. Ouvrez le fichier correspondant dans GitHub.
2. S'il n'existe pas, utilisez **Add file → Create new file**.
3. Collez le chemin exact complet.
4. Copiez tout le contenu du fichier numéroté correspondant.
5. Committez directement dans `main`.

## Vérification de `router.py`

Le fichier doit contenir :

- `from app.api.routes import admin`
- `admin.router`
- `prefix="/api/v1/admin"`

## Vérification de `admin.py`

Le fichier doit contenir les routes :

- `@router.get("/overview"`
- `@router.get("/users"`
- `@router.get("/invites"`
- `@router.get("/reports"`

## Déploiement

1. Commit et push sur `main`.
2. Redéployez uniquement Render.
3. Ne redéployez pas Vercel pour cette correction.
4. Rechargez `/ready`.

Résultat attendu :

```json
"admin_console": {
  "status": "ready",
  "routes_enabled": true,
  "configured_admins": 1,
  "missing_routes": []
}
```
