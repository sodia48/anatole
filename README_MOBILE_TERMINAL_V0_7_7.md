# Anatole v0.7.7 — Mobile Flow et heatmap inclusive

Cette version concentre le Cockpit et Terminal Pro autour d'une expérience
mobile plus fluide, plus dense et plus facile à lire.

## Heatmap du Cockpit

La carte conserve toutes les sociétés reçues par l'API, y compris les petites
capitalisations et les cotations momentanément indisponibles.

Améliorations :

- trois lectures : secteurs, marché complet et direction;
- pondération visuelle comprimée afin que les petites sociétés restent visibles;
- symbole conservé jusque dans les microcases;
- informations supplémentaires affichées selon la place disponible;
- sélection tactile avec inspecteur prix/variation;
- zoom par secteur;
- contraste renforcé;
- mode focus/plein écran compatible avec le repli iOS;
- navigation clavier et libellés d'accessibilité;
- transitions désactivées lorsque l'appareil demande moins d'animations;
- aucune suppression artificielle de titres.

Le sélecteur TSX 60 / Composite a été corrigé sur téléphone. Les deux choix
sont maintenant horizontaux, compacts et lisibles sans lettres empilées.

## Terminal Pro

Terminal Pro devient un véritable radar de marché mobile, inspiré par la
densité d'information des terminaux professionnels, mais alimenté uniquement
par les données déjà présentes dans Anatole.

La page comprend :

- régime du marché et score global;
- événements de marché;
- quatre indicateurs synthétiques;
- flux de cartes classables;
- onglets Tous, Volume, Momentum et Sous pression;
- filtres sectoriels;
- prix, variation, score Anatole, momentum, volume relatif et RSI;
- leadership sectoriel;
- alertes et accès direct à Focus;
- détails avancés repliables.

Aucune donnée de flux d'options ou d'activité institutionnelle n'est inventée.
La page ne formule aucune recommandation d'achat ou de vente.

## Navigation mobile

Le dock rapide devient :

- Cockpit;
- Screener;
- ETF;
- Terminal;
- Menu.

Portefeuille et les autres sections restent accessibles dans le tiroir complet.

## Installation

Cette version modifie le backend et le frontend :

1. décompresser le PATCH à la racine du dépôt;
2. déployer Render;
3. vérifier l'API;
4. déployer Vercel sans l'ancien Build Cache.
