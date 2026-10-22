# Fundamental Intelligence 360 — validation V6

## Captures Playwright

Les séries 2012–2014 puis 2025–2026 sont une fixture de test. Elles reproduisent l'historique discontinu observé sans créer de valeurs intermédiaires.

| Format | Avant | Après |
| --- | --- | --- |
| Ordinateur | [Graphique](before-chart-desktop.png) | [Graphique](after-chart-desktop.png) · [Diagnostic RY](after-diagnostic-desktop.png) |
| Pixel 7 | [Graphique](before-chart-mobile.png) | [Graphique](after-chart-mobile.png) · [Diagnostic RY](after-diagnostic-mobile.png) |

Les captures après correction montrent l'axe par observations, la coupure entre 2014 et 2025, des graduations adaptées à la largeur et les données exactes repliables. Le même scénario graphique passe aussi sur iPhone 14.

## Vérification réelle de RY

Le 21 octobre 2026, les endpoints de production `RY/fundamentals` et `RY/fundamental-intelligence/diagnostic` ont été consultés. Le snapshot était partiel et périmé : cinq exercices annuels 2021–2025 et neuf trimestres avaient une couverture officielle SEC EDGAR XBRL; trois trimestres structurés provenaient d'une source secondaire. Les revenus 2025 étaient de 66,605 G CAD et le bénéfice net de 20,369 G CAD dans ce snapshot. Les indicateurs bancaires spécialisés (CET1, provisions, ROE bancaire, marge nette d'intérêts) restaient indisponibles faute de publication exploitable dans ce parcours. Une cotation RY seule ne fournit pas ces données.

L'API peut d'abord répondre avec `refresh_in_progress=true` et un diagnostic indisponible, puis remplir le snapshot après l'actualisation profonde. La vue V6 interroge de nouveau pendant cette phase et affiche un état compact, la cause et une action de relance. Elle ne présente pas les indicateurs bancaires manquants comme des valeurs nulles ni comme des mesures industrielles.

## Contrôles locaux

- API : 843 tests passés sur la suite complète avant la dernière précision de provenance, puis 10 tests ciblés passés après celle-ci.
- Web : 18 tests unitaires, typecheck, lint et build passés; budget de performance existant respecté.
- Mobile : 52 suites et 269 tests passés, typecheck et lint passés.
- Navigateur : 26 scénarios exécutables passés sur ordinateur et Pixel 7 dans les deux suites Focus; scénario de discontinuité passé sur iPhone 14.

Les captures de Diagnostic RY utilisent des réponses API mockées pour vérifier l'actualisation et l'affichage. La disponibilité future des états officiels et des indicateurs bancaires dépend des sources externes.
