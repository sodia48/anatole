# News Reader 3.0 — vérification 5N Plus

## Cas de référence

Communiqué officiel du [26 octobre 2026](https://www.5nplus.com/fr/nouvelles/5n-plus-inc-annoncera-ses-resultats-T3-2026/) : 5N Plus annonce la **publication future** des résultats T3 2026, le 2 novembre après la clôture. La conférence a lieu le 3 novembre à 8 h, heure de l’Est. Les numéros, le code 04970 et la limite de rediffusion du 10 novembre sont des modalités de participation, et non des résultats financiers.

Le service a été exécuté contre l’index français et la page officielle réels. Il a produit `article_page`, `results_schedule`, les deux événements attendus, trois numéros, le code et la date de rediffusion. Un titre Yahoo en anglais daté du 26 octobre a été résolu vers cette version française; l’URL Yahoo reste dans `original_url`.

## Avant / après

| Avant | Après |
| --- | --- |
| [Vue Anatole fournie en PDF](before-5n.png) : dates répétées, résumé bilingue incomplet, grande zone vide. | [Vue ordinateur](after-5n-desktop.png), [modalités](after-5n-details.png) et [vue mobile](after-5n-mobile.png) : lecture structurée, événements distincts, modalités repliables, calendrier et lien officiel. |

Le rendu « Lire l’article » est **structuré** à partir des faits accessibles. Aucun texte intégral tiers n’est republié : l’accès au communiqué officiel demeure visible, et le modèle `licensed_full` ne sera utilisé qu’avec une autorisation de diffusion vérifiée. Les extraits et titres seuls restent identifiés comme tels.

## Changements techniques

- `NewsArticle` et `NewsArticleEvent` séparent la publication, le calendrier, les modalités et le résumé legacy.
- La sélection d’une version officielle exige un hôte inscrit, la même entreprise, une date compatible, des nombres cohérents, le même type d’annonce et une page correspondant au titre. La version française officielle de 5N Plus vient de l’index de communiqués existant, lu dans sa variante française.
- Les dates ne génèrent plus de cartes financières pour une annonce de résultats à venir.
- Les traductions vérifient les mois en plus des montants, devises et nombres. Les réponses validées profitent du cache existant du service.
- Le lecteur partagé sert Focus et les actualités macro, provinciales et fédérales; les réponses API legacy restent acceptées.
- L’ajout au calendrier produit un événement `.ics` à partir de l’heure confirmée et du fuseau `America/Toronto`. Aucune heure n’est inventée pour la publication après clôture.

## Vérifications

- Fixture du communiqué 5N Plus et test HTTP du service.
- Résolution français / anglais, source inaccessible, extrait seul, résultats déjà publiés, dividende, acquisition, traduction altérant un mois.
- E2E du parcours Focus sur ordinateur, Pixel et iPhone, avec bascule Lire / Résumé / Analyse, téléchargement `.ics`, source et accessibilité des deux thèmes.
- Régressions News Intelligence V2–V4, tests API complets, typecheck, lint, build web et qualité mobile.
