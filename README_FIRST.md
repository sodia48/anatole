# Anatole v1.3.2 — Initiés plus rapides

## Nouveau chargement

- seul l’onglet visible est chargé;
- un aperçu rapide sonde 8 titres canadiens ou 10 titres américains;
- les premières transactions sont affichées dès leur arrivée;
- le balayage complet de 24 à 40 titres continue en arrière-plan;
- la dernière donnée valide est conservée six heures dans le navigateur;
- pendant la première collecte, Anatole affiche `Analyse…`, jamais un `N/D`
  transitoire;
- `Indisponible` apparaît uniquement après la fin du balayage complet.

## Déploiement

1. installer le PATCH à la racine du dépôt;
2. commit et push sur `main`;
3. déployer Render en premier;
4. déployer Vercel sans réutiliser le Build Cache.

Aucune migration PostgreSQL n’est requise.
