# Validation Anatole Mobile v0.7.5

## Backend

- `pytest -q` : **75 tests réussis, 0 échec**.
- Aucun fichier FastAPI n'a été modifié.

## TypeScript

Les deux composants modifiés ont été analysés avec le compilateur TypeScript
via `transpileModule` :

- `MarketHeatmap.tsx` : 0 erreur de syntaxe;
- `FocusClient.tsx` : 0 erreur de syntaxe.

Le build Next.js complet n'a pas été exécuté dans cet environnement, car les
dépendances du projet ne sont pas installées localement. Vercel effectuera le
build complet.

## CSS

- `mobile.css` : 435 accolades ouvrantes et 435 fermantes;
- `MarketHeatmap.module.css` : 112 accolades ouvrantes et 112 fermantes;
- aucun déséquilibre détecté.

## Simulation Cockpit

Simulation réalisée avec les 60 constituants réels présents dans
`apps/api/app/services/tsx60.py`, sur un viewport de 390 × 844 px :

- 60 titres positionnés;
- 10 secteurs positionnés;
- largeur de carte : 390 px;
- hauteur de carte : 574 px;
- aucune tuile de surface nulle;
- plus petite tuile observée : environ 65 × 27 px;
- aucun défilement horizontal;
- toute la treemap reste au-dessus du dock dans la maquette.

## Simulation Focus

Maquette responsive à 390 px :

- `document.scrollWidth = 390`;
- `document.clientWidth = 390`;
- onglets Focus sur deux colonnes;
- périodes sur quatre colonnes;
- graphique et cartes limités à 100 % de la largeur.

## Rafraîchissement LIVE

- Focus s'ouvre sur LIVE;
- la bougie active est mise à jour toutes les 1 000 ms;
- le prix et l'horodatage proviennent de la dernière cotation reçue;
- la récupération complète de l'historique reste à 15 secondes;
- aucune requête fournisseur n'est ajoutée chaque seconde.
