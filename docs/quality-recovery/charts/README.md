# Stabilisation des graphiques Focus (PR A)

## Cause et correction

Les graduations trimestrielles réduisaient chaque date à son année, ce qui répétait `2024` pour plusieurs observations distinctes. Le libellé est désormais calculé dans `packages/shared` et utilisé sur web et mobile. Un exercice fiscal est déduit uniquement de clôtures annuelles publiées et cohérentes; sinon le trimestre est explicitement marqué `(cal.)`. Les dates de clôture exactes et les montants restent accessibles dans les détails.

Les explications techniques permanentes ont été déplacées dans « Comprendre le graphique ». Les axes affichent des périodes distinctes, les observations manquantes interrompent les courbes et les contrôles restent accessibles sur petit écran.

## Captures de référence

Les captures « avant » proviennent de `main` au commit `0cf524e5d3c1486e980e65bfc06a60177cad81cc`. Les captures « après » proviennent de la branche de cette PR, avec les mêmes fixtures Playwright. Elles représentent des données simulées et ne valident pas un fournisseur de données en production.

| Vue | Avant | Après |
| --- | --- | --- |
| Trimestriel, ordinateur | [Capture](quarterly-before-desktop-chromium.png) | [Capture](quarterly-after-desktop-chromium.png) |
| Trimestriel, mobile | [Capture](quarterly-before-mobile-pixel-7.png) | [Capture](quarterly-after-mobile-pixel-7.png) |
| Annuel, ordinateur | [Capture](annual-before-desktop-chromium.png) | [Capture](annual-after-desktop-chromium.png) |
| Annuel, mobile | [Capture](annual-before-mobile-pixel-7.png) | [Capture](annual-after-mobile-pixel-7.png) |
| Détails d'une observation trimestrielle | — | [Ordinateur](quarterly-detail-after-desktop-chromium.png), [mobile](quarterly-detail-after-mobile-pixel-7.png) |

## Vérifications locales

- Formats testés : exercices terminés en décembre, janvier, avril et octobre; repli calendaire et données annuelles.
- `node --test apps/web/tests/focus-chart-layout.test.mjs` : 2 tests réussis.
- `pnpm typecheck:web` et `pnpm typecheck:mobile` : réussis.
- Test Jest ciblé `MobileFocusSeries` : réussi.
- `pnpm lint:web` : aucune erreur, six avertissements existants dans les composants Advisor.
- `pnpm build:web` : réussi.
- Playwright Focus sur Chromium ordinateur et Pixel 7 : 24 tests réussis, 2 ignorés par les fixtures existantes.

Les captures ont été inspectées visuellement. La validation locale utilise des mocks; les contrôles GitHub restent la vérification de la PR.
