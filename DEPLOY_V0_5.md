# Déploiement Anatole v0.5

1. Téléverser le contenu du patch à la racine du dépôt GitHub.
2. Utiliser le message de commit : `Add Anatole Markets v0.5`.
3. Attendre le redéploiement automatique de Render et Vercel.
4. Vérifier Swagger : `https://anatole-api.onrender.com/docs`.
5. Vérifier les nouvelles routes :
   - `/api/v1/discovery/screener`
   - `/api/v1/discovery/news`
   - `/api/v1/discovery/calendar`
   - `/api/v1/discovery/etfs`
   - `/api/v1/discovery/psychology`
6. Vérifier les pages Vercel :
   - `/screener`
   - `/actualites`
   - `/calendrier`
   - `/etf`
   - `/psychologie`

Aucune nouvelle variable Vercel ou Render n’est requise.

Le premier chargement du Screener et de Psychologie peut être plus long, car Render doit récupérer et calculer les historiques. Les réponses suivantes sont mises en cache.
