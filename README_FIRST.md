# Anatole — Correctif final API 502 v1

Ce paquet corrige les causes applicatives principales des 502 :

1. un `httpx.AsyncClient` était recréé dans les chemins chauds;
2. le Cockpit pouvait lancer près de 60 appels Yahoo en rafale;
3. l'ETF relançait jusqu'à 28 titres par lot toutes les 45 secondes;
4. Focus dupliquait les appels de cotation via `quote`, `history` et `profile`;
5. chaque WebSocket réinterrogeait le fournisseur toutes les 5 secondes;
6. le frontend affichait immédiatement le premier 502 sans retry.

## Installation

Copier le contenu de ce ZIP à la racine du dépôt Anatole et accepter les
remplacements.

Fichiers ajoutés :

- `apps/api/app/core/resilience.py`
- `apps/web/lib/resilient-fetch.ts`

Fichiers remplacés :

- `apps/api/app/services/session_quotes.py`
- `apps/api/app/services/market_data.py`
- `apps/api/app/services/etf_service.py`
- `apps/api/app/api/routes/ws.py`
- `apps/api/app/api/routes/health.py`
- `apps/api/app/main.py`
- `apps/web/lib/api.ts`
- `render.yaml`

## Déploiement dans l'ordre

1. Commit et push.
2. Render : synchroniser le Blueprint ou redeployer l'API.
3. Attendre que `https://anatole-api.onrender.com/health` retourne `status=ok`.
4. Vérifier `https://anatole-api.onrender.com/ready`.
5. Vercel : redeployer le frontend sans cache.
6. Tester Cockpit, ETF, Focus et Psychologie simultanément.

## Important

Le fichier actif du répertoire ETF doit être :

`apps/api/app/services/etf_service.py`

Si ton dépôt utilise encore un nom temporaire comme
`etf_service_live_refresh.py`, copie le contenu du nouveau `etf_service.py`
dans le fichier réellement importé par `discovery.py`, puis supprime le
doublon temporaire.

## Render

Pour supprimer aussi les cold starts, l'API doit utiliser une instance Render
payante. Pour une disponibilité forte malgré le redémarrage d'une machine,
utiliser deux instances. Le code de ce paquet élimine la surcharge applicative,
mais une instance gratuite unique ne peut pas offrir une garantie absolue de
zéro interruption.
