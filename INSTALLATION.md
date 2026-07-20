# Résultats financiers V2 — approfondissement

Cette mise à jour enrichit uniquement l'onglet **Résultats** déjà fonctionnel.
Elle ne modifie ni le routeur principal, ni FocusClient, ni la heatmap.

## Fichiers à remplacer

- `apps/api/app/schemas/fundamentals.py`
- `apps/api/app/services/fundamentals.py`
- `apps/web/components/stock/FocusFundamentals.tsx`

## Fichier de test à ajouter

- `apps/api/tests/test_fundamentals_results_v2.py`

## Nouvelles vues dans Résultats

- Vue d'ensemble
- Trimestriel
- Annuel
- Estimations
- BPA & calendrier

## Nouvelles données

- jusqu'à 12 trimestres et 5 exercices;
- revenus, coûts, bénéfice brut, résultat opérationnel, BAIIA et bénéfice net;
- BPA de base et dilué;
- flux opérationnel, immobilisations, flux disponible, dividendes et rachats;
- trésorerie, dette, dette nette, actifs, passifs et capitaux propres;
- marges brute, opérationnelle, nette et de flux disponible;
- croissance sur un an des revenus, du résultat, du BPA et du flux disponible;
- agrégats TTM;
- CAGR sur trois ans;
- conversion du bénéfice en flux;
- dette nette / BAIIA;
- estimations de BPA et de revenus avec fourchettes et nombre d'analystes.

## Déploiement

1. Commit sur `main`.
2. Render → `anatole-api` → Clear build cache & deploy.
3. Vercel → redéployer sans l'ancien cache.

Aucun changement à `apps/api/app/api/router.py`.
