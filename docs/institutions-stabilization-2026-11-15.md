# Institutions 2.0 — sprint de stabilisation (15 novembre 2026)

Ce rapport complète [l'essai PostgreSQL initial](institutions-staging-validation-2026-11-11.md). Il distingue les mesures réellement obtenues sur PostgreSQL de préproduction, les mesures locales et les projections. La chaîne #193 → #194 → #195 → #196 reste ouverte ; aucune fusion ni opération sur la base active n'a été effectuée pendant ce sprint.

## Profil du détail gestionnaire

### Point de départ réellement mesuré sur préproduction

Les mesures de la campagne précédente, sur l'API de préproduction et le vrai import SEC T2 2026, étaient : p50/p95 **271,70/569,54 ms** pour 20 lectures séquentielles à chaud du détail gestionnaire ; **1 813,71/2 622,45 ms** pour 25 lectures à cinq travailleurs. Le conteneur API a consommé environ 0,50 vCPU et subi 73 périodes de throttling pendant cette dernière série. Le pic de mémoire était de 493 572 096 octets sur 536 870 912, mais inclut un processus de test ponctuel. Les métriques CPU/RAM de PostgreSQL n'étaient pas disponibles dans l'interface Render.

### Décomposition locale sur le même bundle SEC

Le détail BlackRock (`CIK 0002012383`) contient **6 179 positions**. Son JSON persisté mesure environ 2,03 Mo. Le chemin actuel lit un seul `institution_details.payload`, le valide en entier, relit la petite table des symboles, puis sérialise les 6 179 positions. Il n'y a pas de requête par position dans ce chemin ; cela doit être confirmé par traçage SQL sur PostgreSQL.

Sur SQLite locale en mémoire, 25 lectures chaudes du même détail ont donné :

| Variante | Stockage + validation p50 | p95 | Sérialisation JSON p50 | Réponse |
| --- | ---: | ---: | ---: | ---: |
| Contrat historique, 6 179 positions | 62,50 ms | 96,86 ms | 18,93 ms | 2 034 111 octets |
| Page de 100 positions | 26,74 ms | 36,62 ms | 0,37 ms | 35 144 octets |

Le mode paginé est optionnel dans l'API pour préserver les clients historiques. L'interface Institutions demande désormais des pages de 100 et applique recherche, statut et tri à **l'ensemble** des positions avant de découper la page. Le JSON persisté complet est encore lu et décodé par l'API ; le transfert PostgreSQL → API reste donc un coût possible. Le gain local ne doit pas être présenté comme un gain PostgreSQL ou HTTP confirmé.

Avant le déploiement du nouveau commit, le 15 novembre, une série HTTP comparable a ciblé **le même CIK BlackRock**, avec deux requêtes de chauffe puis 20 requêtes par niveau de concurrence. Toutes ont renvoyé 200 et 2 034 073 octets ; les temps incluent le réseau entre le client de mesure et Render :

| Version non paginée de préproduction | p50 | p95 | Maximum |
| --- | ---: | ---: | ---: |
| 1 travailleur | 362,18 ms | 582,13 ms | 647,58 ms |
| 5 travailleurs | 1 306,57 ms | 1 795,86 ms | 1 983,62 ms |
| 10 travailleurs | 2 537,58 ms | 4 046,14 ms | 4 050,47 ms |

Cette nouvelle série diffère de la campagne précédente (25 requêtes à cinq travailleurs) par sa taille et son instant ; seule une répétition **à méthode identique** après déploiement permettra d'attribuer un gain au code.

Le script `scripts/profile_institutions_staging.py` est limité à `APP_ENV=staging`, exige le nom attendu de la base et place ses diagnostics SQL dans une transaction en lecture seule. Il mesure les plans `EXPLAIN (ANALYZE, BUFFERS)`, les index, le transfert du payload, le nombre de requêtes, les temps de détail/JSON, les statistiques PostgreSQL accessibles et les compteurs cgroup sans afficher URL, secrets, comptes ou payloads. Commande depuis le Shell de l'API de préproduction, après son déploiement sur le nouveau commit :

```sh
cd apps/api
PYTHONPATH=. python ../../scripts/profile_institutions_staging.py \
  --expected-database anatole_institutions_staging --cik 0002012383
```

**À compléter après accès Shell :** plans et buffers réels, index utilisés, statistiques CPU/RAM PostgreSQL si accessibles, connexions, compte SQL de ce chemin, et répétition HTTP p50/p95 après optimisation à 1, 5 et 10 travailleurs. Aucune extension ni configuration PostgreSQL permanente n'est autorisée par ce script.

## Capacité de stockage

Le T2 2026 occupe **212 874 943 octets** dans la base de préproduction, dont **166 428 672 octets** pour la table des positions et ses index. La projection ci-dessous prend **la taille totale** comme coût prudent par trimestre, ce qui inclut détails, index et autres tables ; elle suppose une croissance de 10 % par an, composée par trimestre, puis réserve 30 % de la capacité pour exploitation. Les sauvegardes/WAL et la croissance des comptes ne sont pas incluses et doivent être budgétées séparément.

| Trimestres | Données projetées | Capacité requise avec 30 % libres |
| ---: | ---: | ---: |
| 4 | 0,82 Gio | 1,17 Gio |
| 8 | 1,73 Gio | 2,47 Gio |
| 12 | 2,72 Gio | 3,89 Gio |

Le plan de préproduction à 1 Go ne donne pas une marge d'exploitation suffisante pour quatre trimestres selon cette hypothèse. La base active annoncée à 15 Go pourrait contenir douze trimestres **si** son espace libre réel et la croissance des comptes sont confirmés ; aucune augmentation de forfait n'est proposée sur cette seule projection. Conserver les périodes officielles publiées et leurs index tant que la capacité le permet. Avant toute purge, définir un archivage privé immuable par trimestre (bundle compressé, manifeste, empreinte SHA-256, index CIK/CUSIP), tester la restauration et maintenir un chemin de lecture historique. L'existence, les droits et le coût d'un stockage d'archives adapté restent à vérifier ; aucun nouveau service n'a été créé.

## Sauvegardes, consommateurs et réseau

La préproduction a déjà passé un export logique restauré et une restauration PITR sur instance isolée, vérifiés avec un compte synthétique avant migration. L'instance PITR temporaire a été supprimée. La récupérabilité **de la base active** n'a pas été testée ; ne pas extrapoler le résultat de préproduction.

Inventaire **confirmé par le dépôt** : l'API Render `anatole-api` utilise `ACCOUNT_DATABASE_URL` ; le workflow quotidien `.github/workflows/institutions-13f-sync.yml` n'utilise une URL externe que si le secret `INSTITUTIONS_DATABASE_URL` est présent. Le Blueprint de préproduction définit une API utilisant l'URL interne de sa base isolée. Les valeurs réelles des variables, le statut du secret GitHub et les autres clients (Shells administrateurs, applications externes, sauvegardes et jobs) doivent être vérifiés dans les plateformes sans afficher les identifiants. La base active acceptait `0.0.0.0/0` lors de l'audit précédent ; aucune règle n'a été modifiée.

Plan de restriction : inventorier les destinations réelles, migrer et tester chaque client Render sur l'URL privée, décider du collecteur planifié, valider sauvegarde et restauration, puis retirer l'accès externe dans une fenêtre approuvée avec contrôles de santé et retour arrière documenté. Le workflow GitHub Actions actuel ne pourrait pas utiliser l'URL interne Render ; un cron Render serait plus adapté au réseau privé mais coûterait au moins 1 $ US/mois et n'a pas été créé.

## Interface, JavaScript et coûts

Le build web actuel passe avec **2 186 927 / 2 209 777 octets** de JS, soit **22 850 octets (1,03 %) de marge**. Le mode paginé ajoute 922 octets au total précédent ; il évite en revanche le transfert de milliers de positions et leur double rendu tableau/cartes. Aucun plafond n'a été relevé. Les autres pistes examinées sont les imports inutiles (déjà éliminés au build), le chargement différé (déplace les octets entre chunks sans réduire le total mesuré par le Quality Gate) et la suppression de code dupliqué. Aucune refonte plus lourde n'est justifiée sans mesure de gain.

Le tableau administrateur en navigateur avec une session administrateur autorisée, les états d'erreur/vides et la nouvelle pagination sur ordinateur/mobile avec PostgreSQL de préproduction doivent encore être vérifiés après déploiement de #196 sur la préproduction. Les contrôles API 200/403/401 avaient été exercés lors de l'essai précédent.

La base et l'API de préproduction encore actives coûtent **13,30 $ US/mois** au tarif catalogue, hors taxes et dépassements. Aucun coût supplémentaire n'a été engagé. Après validation finale et sauvegarde des rapports/captures sans secrets, arrêter l'API de préproduction, confirmer qu'aucun client ni job ne dépend de sa base, puis supprimer séparément l'API et la base **avec l'autorisation explicite du propriétaire**. Vérifier ensuite la fin de la facturation dans Render ; ne pas toucher à `anatole-postgres` ni à `anatole-api` de production.

## Décision provisoire

**NO-GO** tant que le p95 PostgreSQL/API sous 1, 5 et 10 travailleurs, les métriques de ressources, les parcours administrateur et la sauvegarde/réseau de production ne sont pas vérifiés. Les quatre contrôles GitHub devront être verts sur le dernier commit de chaque PR après les modifications. Aucune fusion n'est prévue dans ce sprint.
