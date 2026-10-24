# Audit transversal — programme Quality Recovery

Date de vérification initiale : 23 octobre 2026. Base initiale : `main` après la PR [#162](https://github.com/sodia48/anatole/pull/162). Les correctifs du programme sont suivis dans les PR [#163](https://github.com/sodia48/anatole/pull/163) et [#164](https://github.com/sodia48/anatole/pull/164); leur état de fusion courant est indiqué par GitHub.

## Méthode et portée

Les parcours Playwright existants vérifient les pages réellement rendues avec API locale, en Chromium desktop, Pixel 7 et iPhone 14 lors du Quality Gate complet. La suite `app-routes.spec.ts` surveille les erreurs console, les réponses 404 des API internes, les écrans cassés et le débordement horizontal mobile. Les scénarios spécialisés couvrent les interactions suivantes :

| Domaine | Parcours vérifiés dans le dépôt |
| --- | --- |
| Cockpit | Chargement TSX 60/Composite, choix d'univers, heatmap/navigation et retour utilisateur (`critical-paths`, `feature-flows`). |
| Focus et Fondamentaux | Graphiques et périodes, résultats, estimations, diagnostic 360°, pairs, scénarios/simulateur, documents et assistant contextuel (`focus-*`, `fundamental-*`). |
| ETF et Screener | Recherche, filtres et navigation vers XIC/RY (`feature-flows`, `critical-paths`). |
| Portefeuille | Chargement d'exemple, retrait de position, résilience et synchronisation du compte (`feature-flows`, `portfolio-resilience`, `account-sync`). |
| Actualités et Calendrier | Filtres régionaux, résultats canadiens, StatCan disponible/indisponible et flux provincial (`feature-flows`, PR #163). |
| Assistant | Ouverture, contexte, fournisseur, viewport mobile et Canada 360 (`assistant-*`, `unified-assistant`, `canada360-*`). |
| Thèmes et langues | Français/anglais, thème sombre/bleu ciel et adaptation mobile (`i18n`, `appearance-theme`, `white-theme`, `app-routes`). |

Le Quality Gate complet de la PR #162 a validé `api-tests`, `web-build`, `mobile-quality` et `e2e` sur `6cfe93a71561edbc0d41a0b88c6a4629c161fdac`. Les huit nouveaux tests ciblés de la PR #164 ont réussi localement sur desktop et Pixel 7; les quatre contrôles GitHub doivent être revérifiés sur son head final avant toute fusion. Les captures comparables sont dans `docs/quality-recovery/charts`, `statcan` (PR #163) et `dashboard` (PR #164).

## Incidents classés

| Niveau | Constat reproductible | Traitement |
| --- | --- | --- |
| P0 | Aucun P0 reproduit dans les parcours automatisés ci-dessus. | La suite locale ne prouve pas l'absence de P0 en production. |
| P1 | Les dates trimestrielles étaient réduites à des années répétées; un graphique pouvait être trompeur. | Corrigé dans la PR #162, fusionnée après quatre contrôles verts. |
| P1 | Le flux Atom de Statistique Canada pouvait répondre HTTP 200 avec une page HTML; quatre catégories affichaient la même erreur XML. | Corrigé dans la PR #163, fusionnée après les quatre contrôles verts sur son head final et autorisation du propriétaire. |
| P1 | Le tableau de bord mettait en avant des cartes N/D et utilisait parfois une devise TTM erronée. | Corrigé dans la PR #164, à fusionner seulement après les quatre contrôles verts sur son head final et autorisation du propriétaire. |
| P2 — source ancienne | Les anciens RSS de communiqués de Nouvelle-Écosse ne fournissent plus de document RSS exploitable. | Le mode provincial prioritaire fonctionne avec d'autres pages statistiques officielles et StatCan; documenter le flux obsolète sans inventer de communiqués. |

### Flux de Nouvelle-Écosse : preuve et limite

Le 23 octobre 2026, les trois URL publiées sur la [page RSS officielle](https://novascotia.ca/news/rss/) pour le flux général, Économie (`dept=135`) et Finances (`dept=10`) ont toutes renvoyé `HTTP 200`, `Content-Type: application/rss+xml; Charset=utf-8`, sans redirection et avec **25 octets** : `<?xml version="1.0"?>` suivi de lignes vides. Cette réponse n'a ni racine RSS ni item; le parseur ne peut donc pas en déduire une actualité fiable. Le [site officiel actuel des communiqués](https://news.novascotia.ca/) publie encore des articles, mais aucune URL RSS de remplacement n'a été trouvée dans sa page d'accueil. Une conversion HTML non documentée serait fragile.

Le parcours réel de la preview Vercel #163 reste fonctionnel : le 23 octobre, le filtre Nouvelle-Écosse montrait **deux publications datées**, l'une de Nova Scotia Economics and Statistics, l'autre de Statistique Canada, et leurs deux états de source étaient « disponible ». Ce mode prioritaire utilise les pages statistiques officielles et StatCan, pas les anciens RSS de communiqués. Le suivi P2 consiste à retirer ou remplacer ces URL vieillies uniquement quand une source officielle maintenue est confirmée; ne pas inventer d'articles ni de date de collecte.

## Qualité P2 à traiter par ordre

1. Vérifier par géométrie et captures les actions flottantes sur les petits écrans et les pages longues; corriger uniquement les chevauchements qui masquent effectivement un contrôle ou une donnée.
2. Remplacer ou retirer les anciens RSS de Nouvelle-Écosse après confirmation d'un flux officiel maintenu. Le mode provincial actuel doit continuer à utiliser ses sources statistiques officielles valides.
3. Faire une passe visuelle FR/EN et sombre/bleu ciel sur les pages Focus, Actualités et Portefeuille avec données partielles, après intégration des PR #163 et #164.
4. Répéter un test de bout en bout sur les previews Vercel et le backend Render si l'accès et les données de test le permettent. La preview Vercel #163 a été consultée; cela ne prouve pas le comportement du backend Render de production.

## Règle de sortie

La PR #163 a été fusionnée sur `main` après quatre contrôles verts sur `ea54324cc95a22416da4be5acb22b66a4df55e0c` et autorisation explicite. La PR #164 doit garder ses quatre contrôles verts sur son head final. Toute modification supplémentaire impose de revérifier le head exact. Aucune PR en brouillon ne sera fusionnée sans l'autorisation explicite du propriétaire.
