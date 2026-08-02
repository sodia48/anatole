# Anatole v0.9.1 — Compte toujours visible

Le compte était bien présent dans la v0.9, mais son entrée se trouvait sous
la zone défilante de la sidebar sur certains écrans.

## Correction

Un raccourci permanent apparaît maintenant directement sous la recherche :

- `Compte`
- `Connexion & synchronisation`

Il est visible :

- sur ordinateur;
- dans la sidebar compacte;
- dans le tiroir mobile.

La navigation complète conserve aussi la section Compte dans « Mon espace ».

## Installation

Décompressez le PATCH à la racine du dépôt et acceptez les remplacements.

Ce correctif est uniquement frontend :

1. commit et push;
2. redéployer Vercel;
3. désactiver `Use existing Build Cache` pour ce déploiement.

Aucun redéploiement Render ou PostgreSQL n'est nécessaire.

La page est accessible directement à :

`/compte`
