# Fiabilité du fil macro Statistique Canada (PR B)

## Diagnostic reproduit

Le fil officiel interrogé est `https://www150.statcan.gc.ca/n1/rss/dai-quo/0-fra.atom` (`0-eng.atom` en anglais). `STATCAN_PROXY_URL` permet un relais configuré; sans cette variable, le chemin est direct. Après échec du relais, le service tente le chemin direct.

Le 22 octobre 2026, une requête directe a reçu `HTTP 200`, `Content-Type: text/html`, sans redirection, avec un commentaire HTML avant `<!DOCTYPE html>` et la page « website is currently unavailable ». Une requête ultérieure au même URL a reçu `HTTP 200`, `application/atom+xml`, avec un flux Atom valide. L'URL n'était donc pas erronée : la réponse HTML temporaire était analysée comme XML parce que le détecteur ne vérifiait que les premiers octets avant le commentaire. Le service retournait ensuite quatre états « XML invalide » pour une seule panne de fournisseur.

Les journaux indiquent désormais l'URL demandée, l'URL finale, le statut HTTP, le type de contenu (et son encodage déclaré), la taille, le nombre de redirections, la tentative et la catégorie d'erreur. Ils n'enregistrent pas le corps de la réponse. Le contenu Atom valide est accepté même si son type MIME est mal étiqueté. Une page HTML temporaire est reconnue puis réessayée; le relais et le chemin direct restent indépendants.

## Comportement

Le fournisseur produit un seul état technique. Les catégories Travail, Comptes économiques, Commerce international et Énergie restent des filtres éditoriaux. Lors d'une panne, les dernières publications valides conservées en mémoire restent visibles comme périmées; la date de dernière collecte StatCan réussie est transmise lorsque cette instance l'a vérifiée. Après redémarrage sans collecte antérieure, aucune date n'est inventée. L'interface n'affiche qu'un avis compact et range les états techniques dans « État des sources ». Les erreurs de parseur ne sont plus affichées au public.

## Captures avant/après

Les captures utilisent les mêmes données simulées sur `main` (`0cf524e5d3c1486e980e65bfc06a60177cad81cc`) et sur cette branche. Elles valident le rendu, pas la disponibilité du fournisseur en production.

| État | Avant | Après |
| --- | --- | --- |
| Indisponible, ordinateur | [Capture](macro-unavailable-before-desktop-chromium.png) | [Capture](macro-unavailable-after-desktop-chromium.png) |
| Indisponible, mobile | [Capture](macro-unavailable-before-mobile-pixel-7.png) | [Capture](macro-unavailable-after-mobile-pixel-7.png) |
| Disponible, ordinateur | [Capture](macro-available-before-desktop-chromium.png) | [Capture](macro-available-after-desktop-chromium.png) |
| Disponible, mobile | [Capture](macro-available-before-mobile-pixel-7.png) | [Capture](macro-available-after-mobile-pixel-7.png) |

## Vérifications

- Réponse HTML avec commentaire initial et statut 200; retry puis Atom valide.
- Atom valide avec type MIME erroné, repli last-good daté, état fournisseur unique et détail public sûr.
- Test E2E du fil macro sur Chromium ordinateur et Pixel 7 : 4 parcours réussis.
- `python -m pytest apps/api/tests -q --basetemp .pytest-tmp/api-basetemp-20261022` : 847 tests réussis (7 avertissements sans échec).
- `pnpm typecheck:web` et `pnpm lint:web` : réussis; le lint conserve six avertissements préexistants dans Advisor.

Les autres sources provinciales ont leurs propres flux. Une erreur XML éventuelle chez l'une d'elles doit être diagnostiquée séparément; elle ne prouve pas une panne du fil StatCan.
