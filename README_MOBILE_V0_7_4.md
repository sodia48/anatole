# Anatole Mobile v0.7.4 — Treemap Cockpit et lecture sans défilement latéral

## Décisions conservées

- Le Cockpit conserve une vraie treemap.
- Le répertoire ETF conserve sa carte mobile en tuiles/cartes.
- Aucun tableau important ne nécessite de glisser vers la gauche ou la droite.

## Cockpit

La treemap utilise un algorithme squarified, comprime les écarts de poids sur
mobile et augmente sa hauteur verticalement. Les 60 titres restent présents.
Chaque case montre au minimum le symbole et la variation à deux décimales.
Les secteurs peuvent être agrandis et un mode plein écran est disponible.

## ETF

Sur téléphone, les ETF restent présentés dans une carte mobile groupée. Les
tuiles passent à deux colonnes sur téléphone et trois sur tablette afin de
maintenir symbole, variation et prix lisibles. Aucun ETF n'est supprimé de la
liste pour gagner de la place.

## Sections sans défilement horizontal

- Screener transformé en cartes complètes;
- calendrier transformé en cartes verticales;
- watchlist entièrement visible;
- Comparateur, Terminal Pro et Portefeuille transformés en fiches métriques;
- états financiers et consensus de Focus transformés en cartes par période;
- matrice de corrélation ajustée à la largeur de l'écran;
- participations ETF transformées en cartes;
- contrôles, périodes et onglets reviennent à la ligne;
- textes, endpoints et métadonnées longs se replient dans leur conteneur.

Le backend et les données ne sont pas modifiés.
