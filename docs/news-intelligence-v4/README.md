# News Intelligence V4 — ENB

## Diagnostic

Le flux ENB de V3 dépendait des seuls résultats Yahoo. Le contrôle direct du 25 octobre 2026 retournait trois articles pertinents, tous sans extrait. Focus offrait pourtant « Lire le résumé » pour ces titres, puis ouvrait un lecteur sans contenu exploitable.

V4 ajoute un registre de sources officielles par symbole. L'adaptateur ENB lit les cartes du [centre de presse Enbridge](https://www.enbridge.com/media-center/news), avec date, titre, URL, court extrait et type d'événement. Les URL sont limitées aux communiqués du domaine officiel ; un changement de structure rend la source indisponible sans bloquer Yahoo. La page de détail publique est lue seulement à la demande pour produire une synthèse et des chiffres traçables. Les autres articles restent limités à l'extrait fourni par l'éditeur. Aucun contenu de site protégé n'est récupéré.

Le [fichier robots](https://www.enbridge.com/robots.txt) du site officiel autorisait l'accès public lors de la vérification. Les [conditions d'utilisation](https://www.enbridge.com/termsofuse) appellent à une réutilisation prudente : l'interface conserve des liens et de brefs extraits factuels, sans republier le corps des communiqués. `enbridge.mediaroom.com` n'a pas été intégré faute de vérification fiable de ses règles d'accès.

## Résultats distincts

| Vérification | Résultat |
| --- | --- |
| Fixture API | 3 résultats Yahoo et 4 communiqués distincts, dont un doublon entre sources ; l'agrégation affiche plus que les 3 résultats initiaux. |
| Fixture E2E Focus | 8 cartes représentatives, dont 5 communiqués et 3 articles Yahoo ; 6 cartes d'abord, puis « Charger plus ». Le communiqué ouvre un résumé chiffré, le titre seul un lien externe. |
| Réseau réel, 25 octobre 2026 | 14 articles ENB retenus : 11 communiqués officiels et 3 articles éditeurs ; 11 disposent d'un extrait. Le parcours navigateur Focus → communiqué → lecteur a aussi réussi contre l'API locale connectée à ces sources. Ces nombres varient avec les publications et ne sont pas un objectif codé en dur. |
| Communiqué réel | Le [communiqué T2 2026](https://www.enbridge.com/media-center/news/details?id=123885&lang=en) est accessible et l'extracteur identifie le texte et les montants GAAP de 1,4 et 2,2 milliards de dollars canadiens. |

## Captures

Les captures utilisent des réponses de test déterministes sur l'interface réelle. Elles montrent le comportement de V3 puis de V4 ; elles ne prétendent pas représenter le nombre d'articles en production à chaque instant.

| Avant V4 | Après V4 |
| --- | --- |
| [Fil ENB : 3 titres](enb-feed-before.png) | [Fil ENB : sources diversifiées](enb-feed-after.png) |
| [Lecteur titre seul](enb-reader-before.png) | [Lecteur du communiqué chiffré](enb-reader-after.png) |

Captures supplémentaires du parcours sur les sources réelles : [fil ENB](enb-live-feed.png) et [lecteur du communiqué T2 2026](enb-live-reader.png). La traduction du texte intégral reste dépendante du fournisseur de traduction disponible ; quand il ne l'est pas, le texte original et une seule indication explicite sont conservés.

## Validation locale

- API : 877 tests réussis sur la suite complète ; 43 tests ciblés réussis après prise en charge des deux formes de dateline.
- Mobile : 273 tests réussis.
- TypeScript web et mobile : réussis.
- ESLint web et mobile : 0 erreur ; avertissements préexistants hors des fichiers V4.
- Build web : réussi.
- E2E News V2/V3/V4 : 8 scénarios réussis en série sur Chromium bureau.
- E2E ENB V4 : réussi sur les profils Pixel 7 et iPhone 14.
- E2E Focus « Charger plus » : réussi sur Chromium bureau.
- E2E Focus ENB non simulé : réussi avec l'API locale configurée sur les sources réelles, y compris le communiqué T2 et ses chiffres.
- `git diff --check` : réussi.

Les E2E en parallèle ont subi des délais de chargement sur Focus ; la même vérification ciblée réussit seule. Les quatre contrôles GitHub restent la validation de référence avant toute fusion.
