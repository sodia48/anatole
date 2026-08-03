# Anatole v1.2.0 — Aujourd’hui

## Nouvelle porte d’entrée

`/aujourdhui` réunit en une lecture quotidienne :

- marché TSX 60 ou Composite;
- largeur, psychologie et régime Terminal;
- Watchlist, Portefeuille, Alertes et Comparateur;
- éléments à surveiller;
- calendrier économique;
- lecture Anatole descriptive, sans recommandation de placement.

## Actualisation

- marché : 15 secondes;
- espace personnel : 30 secondes;
- Terminal, psychologie, actualités et calendrier : 120 secondes;
- pause automatique lorsque l’onglet est masqué;
- conservation des dernières données valides grâce à la couche résiliente existante.

## Navigation

- `/` redirige désormais vers `/aujourdhui`;
- Aujourd’hui apparaît en premier dans la sidebar;
- le dock mobile devient : Aujourd’hui, Cockpit, Screener, ETF, Menu;
- le Cockpit et toutes les autres pages restent inchangés.

## Déploiement

1. Décompresser le PATCH à la racine du dépôt.
2. Accepter les six ajouts/remplacements.
3. Commit et push sur `main`.
4. Redéployer uniquement Vercel.
5. Désactiver `Use existing Build Cache`.

Aucun redéploiement Render ou PostgreSQL n’est requis.
