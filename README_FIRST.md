# Anatole — restauration opérationnelle finale

Ce dépôt a été vérifié à partir du ZIP complet `anatole-main.zip`.
Le correctif restaure ensemble :

- le Screener TSX 60;
- le répertoire ETF;
- les participations et l’historique détaillé des ETF;
- les IPO;
- les transactions d’initiés;
- la façade API utilisée par le frontend Vercel.

## Causes trouvées dans le dépôt

1. Le Screener appelait `market_data_service.get_history_many(...)`, mais cette
   méthode n’existait plus. La route répondait donc HTTP 500.
2. Les fichiers de routes ETF détaillés et IPO/initiés existaient, mais ils
   n’étaient pas montés dans `app/api/router.py`. Les endpoints répondaient 404.
3. `apps/web/lib/api.ts` avait perdu plusieurs exports, notamment
   `getHealthStatus`, ce qui faisait échouer `pnpm run build` sur Vercel.
4. La watchlist utilisait une requête GET alors que FastAPI attend une requête
   POST.
5. Un ancien fichier de relais était placé au mauvais endroit dans `app/`.
6. Le service ETF actif envoyait des lots trop importants et trop fréquents.

## Installation recommandée

Utiliser `Anatole_Operational_Final_v1_PATCH.zip` :

1. Décompresser le ZIP à la racine du dépôt.
2. Accepter tous les remplacements.
3. Supprimer le fichier indiqué dans `DELETE_FILES.txt`.
4. Commit et push sur `main`.
5. Déployer Render avant Vercel.

Le ZIP complet est fourni comme copie de sécurité du dépôt corrigé.

## Vérification Render

Quand le déploiement Render est vert, ouvrir dans cet ordre :

- `https://anatole-api.onrender.com/health`
- `https://anatole-api.onrender.com/api/v1/discovery/screener?universe=tsx60`
- `https://anatole-api.onrender.com/api/v1/discovery/etfs`
- `https://anatole-api.onrender.com/api/v1/discovery/etfs/XIC/holdings?limit=5`
- `https://anatole-api.onrender.com/api/v1/discovery/etfs/XIC/history?range=1mo`
- `https://anatole-api.onrender.com/api/v1/discovery/ipo?limit=5`
- `https://anatole-api.onrender.com/api/v1/discovery/insiders?market=canada&days=30&scan_limit=2&limit=5`

Les routes doivent répondre en JSON et ne plus retourner 404 ou 500.

## Déploiement Vercel

Après la validation Render :

1. Vérifier la variable :
   `NEXT_PUBLIC_API_URL=https://anatole-api.onrender.com`
2. Facultatif mais recommandé :
   `ANATOLE_API_URL=https://anatole-api.onrender.com`
3. Lancer un nouveau déploiement sans réutiliser l’ancien Build Cache.

Ne réinstaller aucun ancien ZIP `Search Fix`, `ETF Failed Fetch`,
`API 502 Final Fix` ou `Operational Restore` au-dessus de cette version.
