# Focus Fondamental V1 — TSX 60

Cette livraison ajoute les quatre sections suivantes dans Focus :

- Graphique
- Fondamentaux
- Résultats
- Analystes

## Fichiers à ajouter

- `apps/api/app/schemas/fundamentals.py`
- `apps/api/app/services/fundamentals.py`
- `apps/api/app/api/routes/fundamentals.py`
- `apps/api/tests/test_fundamentals.py`
- `apps/web/components/stock/FocusFundamentals.tsx`

## Fichiers à remplacer

- `apps/api/app/api/router.py`
- `apps/web/components/stock/FocusClient.tsx`

## Données

La V1 utilise le service public `quoteSummary` de Yahoo Finance avec cookie et
crumb. Aucune clé API ni variable d'environnement supplémentaire n'est requise.

Règles :

- aucune donnée fictive;
- champ absent = `N/D`;
- réponse partielle conservée;
- cache backend de 30 minutes;
- panne de la source affichée proprement, sans casser Focus.

## Déploiement

1. Commit sur `main`.
2. Render : `anatole-api` → Clear build cache & deploy.
3. Vercel : redéploiement sans l'ancien cache.
4. Vérifier :
   - `/api/v1/stocks/RY/fundamentals`
   - Focus → Fondamentaux
   - Focus → Résultats
   - Focus → Analystes

## Note

Yahoo Finance est une source publique non contractuelle. Les informations
fondamentales et le consensus peuvent être incomplets pour certains titres TSX.
Anatole affiche alors `N/D` au lieu d'inventer une valeur.
