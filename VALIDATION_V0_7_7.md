# Validation Anatole v0.7.7

## Tests backend

- Suite FastAPI : **79 tests réussis, 0 échec**.
- Tests plateforme : **9 tests réussis, 0 échec**.
- Terminal retourne jusqu'à 12 opportunités, 8 leaders et 8 titres sous
  pression sans déclencher de nouvel appel fournisseur.

## TypeScript

Contrôle syntaxique strict par transpilation réussi pour :

- `TerminalClient.tsx`;
- `CockpitClient.tsx`;
- `MarketHeatmap.tsx`;
- `AppSidebar.tsx`.

Résultat : **0 erreur de syntaxe**.

## CSS

Accolades équilibrées :

- `mobile.css` : 488 / 488;
- `Analysis.module.css` : 311 / 311;
- `MarketHeatmap.module.css` : 132 / 132.

## Inclusion de la heatmap

Simulation mobile de l'univers Composite sur une zone de 390 × 600 px :

- 180 titres positionnés;
- 180 rectangles de surface positive;
- aucun titre retiré;
- aucune case de surface nulle;
- plus petite case observée : environ 15,9 × 8,9 px;
- le symbole reste rendu dans les microcases;
- les cotations indisponibles restent affichées avec `N/D`.

Les seuls appels à `slice()` dans le composant servent à diviser récursivement
la géométrie de la treemap; ils ne tronquent pas la liste des titres.

## Terminal mobile

Le jeu de données de démonstration produit 23 signaux uniques après
déduplication des opportunités, leaders et titres sous pression. Les cartes
restent alimentées par les métriques réelles d'Anatole : variation, score,
momentum, volume relatif et RSI.

## Limite de validation

Le build Next.js complet n'a pas pu être exécuté dans cet environnement :
le registre npm interne retournait une erreur 404 pour `@types/node`.
Les tests backend, contrôles TypeScript ciblés, contrôles CSS et simulations
de mise en page ont réussi. Vercel effectuera le build définitif.
