# Validation Anatole Mobile v0.7.4

## Résultats obtenus

- Backend FastAPI : **75 tests réussis, 0 échec**.
- Tests plateforme : **9 tests réussis, 0 échec**.
- Compilation Python du backend : réussie.
- Contrôle TypeScript ciblé et strict des composants modifiés : réussi.
- Feuilles CSS analysées : **12**, avec **0 erreur de syntaxe**.
- Intégrité des archives PATCH et FULL : vérifiée.

## Cockpit

- Le composant mobile utilise toujours une vraie treemap.
- Le nouvel algorithme `squarifyTreemap` réduit les bandes longues et étroites.
- Simulation mobile à 390 px avec 60 titres :
  - 60 titres positionnés;
  - 60 rectangles de surface positive;
  - symbole et variation conservés;
  - ratio de forme maximal observé d'environ 2,57;
  - aucune largeur de page supérieure au viewport.
- Le zoom par secteur et le mode plein écran sont présents.

## ETF

- La carte mobile en tuiles est conservée.
- Le composant utilise toujours `styles.mobileMap`.
- Aucun `items.slice(...)` ne retire des ETF de la carte mobile.
- Deux colonnes sont utilisées sur téléphone et trois sur tablette.
- Les ETF sans cotation restent visibles avec l'état `N/D`.

## Lecture sans défilement latéral

Les contrôles et onglets reviennent à la ligne. Les vues suivantes ont été
adaptées en cartes ou en grilles ajustées au viewport :

- Screener;
- calendrier;
- watchlist;
- Comparateur;
- Terminal Pro;
- Portefeuille;
- états financiers et estimations de Focus;
- participations ETF;
- IPO et transactions d'initiés;
- matrice de corrélation.

Une simulation de page à 390 px a donné :

- `document.scrollWidth = 390`;
- `document.clientWidth = 390`;
- aucun contenu nécessaire à découvrir par glissement horizontal.

## Limite de validation

Le véritable `next build` n'a pas été exécuté dans cet environnement, car
`pnpm` et les dépendances Next.js installées n'y étaient pas disponibles.
Le contrôle TypeScript ciblé, l'analyse CSS, les tests Python et les simulations
de mise en page ont néanmoins réussi. Vercel effectuera le build complet.
