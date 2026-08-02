# Anatole v0.9.6 — sidebar pliable fiable

## Cause du problème

Le premier bouton était placé dans l'en-tête du logo et dépendait d'un
breakpoint desktop. De plus, d'anciennes règles CSS repliaient ou masquaient
automatiquement certains éléments selon la largeur du navigateur.

## Correction

- poignée permanente placée sur le bord droit de la sidebar;
- visible sur tous les écrans de plus de 820 px;
- largeur contrôlée uniquement par le bouton;
- état mémorisé après rechargement;
- anciennes règles automatiques neutralisées;
- navigation mobile inchangée;
- version visible `Anatole v0.9.6` dans le pied de la sidebar.

## Installation

Remplacer les quatre fichiers du PATCH, commit et push, puis redéployer
uniquement Vercel avec `Use existing Build Cache` désactivé.

Aucun redéploiement Render ou PostgreSQL n'est requis.
