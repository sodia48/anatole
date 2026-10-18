# Fundamental Intelligence 360 — contrôle visuel

Captures Playwright produites avec la fixture RY du test `tests/e2e/focus-fundamental-diagnostic.spec.ts` :

| Écran | Bureau | Mobile Pixel 7 |
| --- | --- | --- |
| Portail, thème sombre, français | [Capture](portal-desktop-dark.png) | [Capture](portal-mobile-dark.png) |
| Diagnostic, thème sombre, français | [Capture](diagnostic-desktop-dark.png) | [Capture](diagnostic-mobile-dark.png) |
| Portail, thème bleu ciel, anglais | [Capture](portal-desktop-blue-en.png) | — |

La fixture contient huit modules, six dimensions analytiques regroupées en quatre cartes, un indice directionnel calculable à partir de deux ratios historiques, des dimensions sans indice, une source sectorielle officielle et une valeur sectorielle indisponible. Les six dimensions et leurs calculs restent accessibles sous le tableau de bord. Aucun score global ou conseil d’achat/vente n’est créé.

Comparaison avec la maquette fournie : le portail reprend le panneau central, la grille deux colonnes, la hiérarchie titre/description et les espacements ; sur mobile, la grille passe en une colonne et la navigation des modules reste accessible. Les vérifications automatiques couvrent les huit liens, le contraste WCAG du portail, les deux thèmes, le bilinguisme, la navigation vers les détails et l’absence de débordement horizontal.
