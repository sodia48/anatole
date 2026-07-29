# Anatole v0.7.3 — Navigation mobile et cartes complètes

Cette version transforme l’expérience téléphone sans modifier les routes API ni les fonctions métier de la v0.7.2.

## Navigation mobile

- barre supérieure fixe avec menu, section courante et recherche;
- dock inférieur permanent avec Cockpit, Screener, ETF, Espace et Menu;
- accès à toutes les sections dans un tiroir mobile complet;
- éléments tactiles d’au moins 44 px;
- prise en charge des zones sûres iPhone;
- verrouillage du défilement lorsque le tiroir ou la recherche est ouvert;
- zoom navigateur de nouveau autorisé.

## Carte des actions

Sur téléphone, la treemap compacte est remplacée par une carte groupée qui conserve la couleur de marché tout en imposant une taille minimale lisible à chaque titre.

Chaque action affiche systématiquement :

- son symbole;
- sa variation de séance à deux décimales;
- son prix;
- un lien direct vers Focus.

Les 60 titres restent présents par défaut. Un secteur peut être isolé par toucher, puis la vue complète restaurée.

## Carte des ETF

La même logique est appliquée aux ETF :

- tous les ETF transmis par le répertoire sont rendus;
- aucun `slice()` ou plafond visuel n’est appliqué;
- symbole et variation restent visibles dans chaque case;
- les cotations indisponibles sont marquées `N/D`;
- regroupement par secteur, fournisseur ou direction;
- lien direct vers la fiche de participations de chaque ETF.

## Professionnalisation de toutes les sections

La couche mobile commune améliore :

- les héros et en-têtes;
- les cartes KPI;
- les formulaires et filtres;
- les onglets et contrôles horizontaux;
- les tableaux avec défilement horizontal et première colonne stable;
- les graphiques;
- Comparateur, Terminal Pro, Portefeuille, Alertes, Anatole Conseil et Qualité des données;
- les fiches ETF, participations, IPO et transactions d’initiés.

## Installation

Utiliser le PATCH fourni et copier son contenu à la racine du dépôt Anatole. Accepter les remplacements, puis suivre `DEPLOY_V0_7_3.md`.
