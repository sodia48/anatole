# Anatole v0.9.3 — Centre de contrôle

Cette version regroupe dans une seule section :

- Compte et synchronisation;
- Préférences;
- Qualité des données et fiabilité.

## Nouvelle adresse

`/parametres`

L'interface reprend les conventions des grands services numériques :

- en-tête de compte clair;
- navigation secondaire permanente;
- catégories distinctes;
- état du compte visible;
- résumé des préférences;
- contenu principal spacieux;
- navigation mobile compacte;
- hiérarchie visuelle cohérente.

## Compatibilité

Les anciennes adresses continuent de fonctionner :

- `/compte` redirige vers Compte;
- `/preferences` redirige vers Préférences;
- `/qualite` redirige vers Qualité des données.

Les liens depuis le Portefeuille, Anatole Conseil, la recherche et la barre
supérieure ont aussi été mis à jour.

## Sidebar

Les trois anciennes entrées séparées sont remplacées par :

`Compte & paramètres`

Le raccourci sous la recherche ouvre le même Centre de contrôle.

## Installation

1. Décompresser le PATCH à la racine du dépôt.
2. Accepter les ajouts et remplacements.
3. Commit et push sur `main`.
4. Redéployer uniquement Vercel.
5. Désactiver `Use existing Build Cache` pour ce déploiement.

Aucun changement Render ou PostgreSQL n'est nécessaire.
