# Anatole v0.9.1.1 — récupération complète du frontend Compte

## Cause du build failed

`AppSidebar.tsx` importait :

`@/components/account/AccountStatus`

mais le dépôt déployé ne contenait pas toute la couche frontend v0.9.
Le correctif v0.9.1 de visibilité supposait que ces fichiers étaient déjà
présents.

Ce paquet ajoute toute la chaîne nécessaire :

- page `/compte`;
- composants de connexion et d'état;
- `AccountProvider`;
- client API du compte;
- route relais Next.js;
- synchronisation locale/multiappareil;
- intégration Watchlist, Portefeuille, Alertes, préférences et Comparateur;
- raccourci Compte toujours visible.

## Installation

1. Décompressez le PATCH à la racine du dépôt.
2. Acceptez tous les remplacements et ajouts.
3. Vérifiez dans GitHub que ce fichier existe réellement :

   `apps/web/components/account/AccountStatus.tsx`

4. Committez et poussez sur `main`.
5. Redéployez uniquement Vercel.
6. Désactivez `Use existing Build Cache` pour ce déploiement.

Aucun redéploiement Render ou PostgreSQL n'est nécessaire.

## Test attendu

- le build Vercel réussit;
- le bouton Compte apparaît sous la recherche;
- `/compte` s'ouvre;
- création de compte et connexion utilisent la base PostgreSQL déjà active.
