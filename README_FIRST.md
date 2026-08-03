# Anatole Admin Backend v1.1.5

## Cause exacte de la panne

Le fichier `main.py` v1.1.4 contenait un garde qui arrêtait FastAPI lorsque
les routes Admin n'étaient pas enregistrées. Dans le dépôt déployé, `main.py`
avait été remplacé, mais `router.py` et/ou les fichiers Admin n'avaient pas
tous été appliqués. Le garde a donc volontairement arrêté toute l'API.

## Correction v1.1.5

- les routes Admin sont enregistrées dans `router.py`;
- `main.py` vérifie les routes et les ajoute une seconde fois seulement si
  elles manquent;
- aucun doublon n'est créé;
- une installation partielle ne coupe plus l'API publique;
- `/ready` indique précisément si la console Admin est prête;
- la configuration `ACCOUNT_ADMIN_EMAILS` est comptée dans `/ready`;
- la version de l'API devient `1.1.5`.

## Installation recommandée

Décompressez le PATCH à la racine du dépôt et acceptez tous les remplacements.

Vérifiez surtout que ces fichiers existent dans GitHub :

- `apps/api/app/main.py`
- `apps/api/app/api/router.py`
- `apps/api/app/api/routes/admin.py`
- `apps/api/app/schemas/admin.py`
- `apps/api/app/services/accounts.py`

Puis committez dans `main` et déployez Render.

## Variable Render

Conservez l'adresse exacte du compte Anatole :

`ACCOUNT_ADMIN_EMAILS=solo0112@live.fr`

La comparaison n'est pas sensible aux majuscules, mais les espaces inutiles
doivent être évités.

## Vérification

Après le déploiement, ouvrez :

`https://anatole-api.onrender.com/ready`

Le bloc attendu est :

```json
"admin_console": {
  "status": "ready",
  "routes_enabled": true,
  "configured_admins": 1,
  "missing_routes": []
}
```

Ouvrez ensuite :

`https://anatole-api.onrender.com/api/v1/admin/overview`

Sans jeton, la réponse correcte est HTTP 401 avec
`Connexion administrateur requise.` Ce résultat confirme que la route existe.

Enfin, reconnectez-vous dans Anatole et ouvrez `/admin`.
