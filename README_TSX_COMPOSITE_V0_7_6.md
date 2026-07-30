# Anatole v0.7.6 — TSX Composite dans le Cockpit

Le Cockpit propose maintenant deux univers :

- **S&P/TSX 60**
- **S&P/TSX Composite**

Le heatmap visuel reste fondé sur la version v0.7.2 demandée.

## Expérience utilisateur

Un sélecteur « Univers de marché » apparaît directement dans l'en-tête du
Cockpit. Le choix est mémorisé dans le navigateur.

Lorsqu'un utilisateur sélectionne Composite :

- Anatole charge les sociétés canadiennes détenues par XIC;
- toutes les composantes retournées restent dans le heatmap;
- les titres sans cotation temporaire restent visibles en gris avec `N/D`;
- le titre, les KPI, les variations, les secteurs et les meilleurs mouvements
  utilisent le nouvel univers;
- revenir au TSX 60 est instantané après son premier chargement.

## Protection contre les erreurs API 502

Le TSX Composite n'est pas interrogé toutes les 15 secondes.

- cache du snapshot Composite : 90 secondes;
- actualisation frontend : 90 secondes;
- cache de la liste des composantes : 6 heures;
- limitation HTTP globale déjà présente dans Anatole;
- dernière liste valide conservée si BlackRock est momentanément inaccessible;
- dernière carte Composite valide conservée si une actualisation échoue;
- cotations manquantes rendues `N/D` au lieu de supprimer les sociétés.

## Installation

Décompresser le PATCH à la racine du dépôt et accepter les remplacements.

Cette version modifie le backend **et** le frontend :

1. déployer Render;
2. vérifier les deux routes;
3. déployer Vercel sans l'ancien Build Cache.
