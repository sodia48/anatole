# Institutions 2.0 — sprint de stabilisation (15 novembre 2026)

Ce rapport complète [l'essai PostgreSQL initial](institutions-staging-validation-2026-11-11.md). Il distingue les mesures réellement obtenues sur PostgreSQL de préproduction, les mesures locales et les projections. La chaîne #193 → #194 → #195 → #196 reste ouverte ; aucune fusion ni opération sur la base active n'a été effectuée pendant ce sprint.

## Profil du détail gestionnaire

### Point de départ réellement mesuré sur préproduction

Les mesures de la campagne précédente, sur l'API de préproduction et le vrai import SEC T2 2026, étaient : p50/p95 **271,70/569,54 ms** pour 20 lectures séquentielles à chaud du détail gestionnaire ; **1 813,71/2 622,45 ms** pour 25 lectures à cinq travailleurs. Le conteneur API a consommé environ 0,50 vCPU et subi 73 périodes de throttling pendant cette dernière série. Le pic de mémoire était de 493 572 096 octets sur 536 870 912, mais inclut un processus de test ponctuel. Les métriques CPU/RAM de PostgreSQL n'étaient pas disponibles dans l'interface Render.

### Décomposition locale sur le même bundle SEC

Le détail BlackRock (`CIK 0002012383`) contient **6 179 positions**. Son JSON persisté mesure environ 2,03 Mo. Le chemin actuel lit un seul `institution_details.payload`, le valide en entier, relit la petite table des symboles, puis sérialise les positions demandées. Le traçage sur PostgreSQL confirme trois requêtes par lecture du détail, quel que soit le nombre de positions ; aucune requête par position n'a été observée.

Sur SQLite locale en mémoire, 25 lectures chaudes du même détail ont donné :

| Variante | Stockage + validation p50 | p95 | Sérialisation JSON p50 | Réponse |
| --- | ---: | ---: | ---: | ---: |
| Contrat historique, 6 179 positions | 62,50 ms | 96,86 ms | 18,93 ms | 2 034 111 octets |
| Page de 100 positions | 26,74 ms | 36,62 ms | 0,37 ms | 35 144 octets |

Le mode paginé est optionnel dans l'API pour préserver les clients historiques. L'interface Institutions demande désormais des pages de 100 et applique recherche, statut et tri à **l'ensemble** des positions avant de découper la page. Le JSON persisté complet est encore lu et décodé par l'API ; le transfert PostgreSQL → API reste donc un coût mesuré. Le gain de transfert API → navigateur est confirmé plus bas sur la vraie préproduction.

Avant le déploiement du nouveau commit, le 15 novembre, une série HTTP comparable a ciblé **le même CIK BlackRock**, avec deux requêtes de chauffe puis 20 requêtes par niveau de concurrence. Toutes ont renvoyé 200 et 2 034 073 octets ; les temps incluent le réseau entre le client de mesure et Render :

| Version non paginée de préproduction | p50 | p95 | Maximum |
| --- | ---: | ---: | ---: |
| 1 travailleur | 362,18 ms | 582,13 ms | 647,58 ms |
| 5 travailleurs | 1 306,57 ms | 1 795,86 ms | 1 983,62 ms |
| 10 travailleurs | 2 537,58 ms | 4 046,14 ms | 4 050,47 ms |

Cette nouvelle série diffère de la campagne précédente (25 requêtes à cinq travailleurs) par sa taille et son instant. Les deux séries suivantes comparent, **dans chaque campagne après déploiement**, le contrat complet et la page de 100 positions avec deux chauffes et 20 requêtes par niveau de concurrence. Les chiffres incluent le réseau client → Render ; les p95 sont des rangs empiriques sur 20 réponses, pas des garanties de production.

| Campagne après déploiement | Concurrence | Contrat complet p50/p95 | Page 100 p50/p95 | Taille page |
| --- | ---: | ---: | ---: | ---: |
| A | 1 | 390,45 / 712,46 ms | 169,10 / 267,15 ms | 35 161 octets |
| A | 5 | 1 364,17 / 2 350,64 ms | 490,45 / 854,99 ms | 35 161 octets |
| A | 10 | 2 218,13 / 4 370,07 ms | 1 404,17 / 2 756,35 ms | 35 161 octets |
| B, après retrait de l'accès admin temporaire | 1 | 331,15 / 565,74 ms | 204,70 / 582,01 ms | 35 161 octets |
| B | 5 | 1 300,01 / 2 813,62 ms | 675,06 / 918,27 ms | 35 161 octets |
| B | 10 | 2 216,68 / 3 916,75 ms | 1 003,87 / 2 780,21 ms | 35 161 octets |

Les 120 réponses de chaque campagne ont renvoyé **200**. À cinq travailleurs, le p95 paginé est inférieur à 1 s dans les deux campagnes, soit un facteur de 2,75 à 3,06 par rapport au contrat complet de la même campagne. À dix, le p95 paginé reste autour de 2,8 s : le petit plan API et ses 0,5 vCPU demeurent le facteur limitant. Le p95 à un travailleur de la campagne B ne démontre aucun gain ; les variations réseau et de charge sont significatives. Le contrat complet reste disponible pour les clients historiques et renvoie 2 034 140 octets.

Le script `scripts/profile_institutions_staging.py` est limité à `APP_ENV=staging`, exige le nom attendu de la base et place ses diagnostics SQL dans une transaction en lecture seule. Il mesure les plans `EXPLAIN (ANALYZE, BUFFERS)`, les index, le transfert du payload, le nombre de requêtes, les temps de détail/JSON, les statistiques PostgreSQL accessibles et la variation des compteurs CPU/throttling cgroup sans afficher URL, secrets, comptes ou payloads. Commande depuis le Shell de l'API de préproduction, après son déploiement sur le nouveau commit :

```sh
cd apps/api
PYTHONPATH=. python ../../scripts/profile_institutions_staging.py \
  --expected-database anatole_institutions_staging --cik 0002012383
```

### Profil SQL réel et ressources

Profil exécuté dans le Shell de l'API de préproduction sur PostgreSQL **18.6**, période publiée T2 2026, avec transaction `READ ONLY` et `EXPLAIN (ANALYZE, BUFFERS)` sur des `SELECT`. La base mesurait **212 907 711 octets**. L'extension `pg_stat_statements` n'est pas installée ; aucune extension ni configuration n'a été ajoutée.

| Opération | Mesure réelle et plan |
| --- | --- |
| Détail JSON par période/CIK | `Seq Scan` sur `institution_details` (100 lignes), 0,035 ms, 1 bloc en cache. Lecture du payload de 2 034 051 octets : p50/p95 98,49/105,72 ms. |
| Dernière période | `Index Only Scan` sur la clé primaire de `institution_snapshots`, environ 0,011 ms, 2 blocs en cache. |
| Correspondance de symboles | `Seq Scan` sur les 5 lignes de `institution_symbol_map`, 0,015 ms ; approprié à cette taille. |
| Requête relationnelle candidate de 100 positions | L'index existant `ix_institution_holdings_period_value` est utilisé, mais le filtre CIK oblige à parcourir des positions d'autres gestionnaires : 308,367 ms, 259 blocs en cache et **481 lus**. Ce chemin n'a pas remplacé le JSON paginé. Un éventuel index composé `(period, cik, value)` doit être évalué sur une copie et dans une migration distincte avant adoption. |

Sur 28 lectures du détail, le traçage a compté **28 accès** à chacune des trois tables (84 appels SQL au total), sans N+1 lié aux 6 179 positions. Dans le processus de préproduction, la méthode `store.detail()` a pris p50/p95 **168,49/372,31 ms** pour le contrat complet et **104,76/194,92 ms** pour la page de 100 ; la sérialisation JSON a pris **11,69/60,41 ms** contre **0,11/0,15 ms**. Ces mesures internes ont 12 échantillons chauds par variante et ne se confondent pas avec les latences HTTP.

Pendant ce profil de 4,63 s, le pool SQLAlchemy configuré à 5 connexions avait une connexion ouverte après mesure et zéro connexion empruntée ; `pg_stat_activity` indiquait **2 connexions** à la base, dont une active pendant le relevé. La limite cgroup était **0,5 vCPU et 512 Mio**. Le processus a consommé 1,751 s de CPU, subi **23 périodes de throttling sur 47** et 0,737 s de temps throttlé ; la mémoire courante est passée de 324,0 à 352,8 Mo, pic à **367,9 Mo**. Ce relevé inclut le profiler dans le conteneur API. Les métriques CPU/RAM propres au serveur PostgreSQL ne sont pas exposées dans l'interface accessible : elles restent **non mesurées**. Les compteurs PostgreSQL indiquaient zéro fichier temporaire et zéro deadlock au moment du relevé.

Le script reproductible `scripts/benchmark_institutions_staging.py` impose explicitement l'hôte HTTPS de préproduction et mesure les deux contrats à 1, 5 et 10 travailleurs sans afficher les réponses. Aucune requête de consultation ne lance de collecte SEC.

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

Le 15 novembre, un build web pointant vers l'API PostgreSQL de préproduction a d'abord parcouru l'annuaire, le détail BlackRock, son historique et l'historique CUSIP `037833100` **avant** le nouveau déploiement, sur Chrome desktop, Pixel 7 et iPhone 14/WebKit : 12 réponses de page 200. Après déploiement, le smoke test `scripts/smoke_institutions_staging.cjs` a réussi sur les **trois navigateurs** : annuaire, page 1 puis page 2 des positions, recherche globale `NVDA`, historique gestionnaire et historique CUSIP ; aucune réponse API 5xx. L'API paginée a renvoyé 100 positions sur 6 179 avec `holdings_total=6179` et 35 161 octets. Les captures desktop et iPhone ont été inspectées : tableau et cartes mobiles lisibles, sans erreur de données. Les tests de navigateur utilisent un site local compilé avec `ANATOLE_API_URL` dirigé vers la **seule** préproduction.

Le tableau administrateur a été exercé dans le navigateur E2E isolé avec comptes synthétiques : visiteur `401`, utilisateur standard `403`, administrateur `200`, puis affichage de l'état vide et de ses alertes sur les trois projets Playwright (**3/3 réussis**). Les comptes locaux ont été supprimés et les captures desktop/mobile inspectées. Une première fenêtre d'accès temporaire à la préproduction a permis une connexion navigateur du compte synthétique, mais l'outil Computer Use s'est arrêté avant l'ouverture de la page administrateur ; **ce parcours précis n'est donc pas validé sur la vraie base**. L'allowlist temporaire a ensuite été retirée : `/ready` indique `configured_admins=0`. Le compte synthétique identifié a reçu `403` sur l'endpoint administrateur, a été supprimé avec `204`, puis son ancienne session et sa reconnexion ont chacune reçu `401`. Un visiteur sans session reçoit `401` sur le même endpoint. Aucun privilège temporaire ne reste activé. Si une nouvelle fenêtre d'accès est autorisée, elle devra être entièrement révoquée après capture de ce dernier parcours.

La base et l'API de préproduction encore actives coûtent **13,30 $ US/mois** au tarif catalogue, hors taxes et dépassements. Aucun coût supplémentaire n'a été engagé. Après validation finale et sauvegarde des rapports/captures sans secrets, arrêter l'API de préproduction, confirmer qu'aucun client ni job ne dépend de sa base, puis supprimer séparément l'API et la base **avec l'autorisation explicite du propriétaire**. Vérifier ensuite la fin de la facturation dans Render ; ne pas toucher à `anatole-postgres` ni à `anatole-api` de production.

## Décision et critères de mise en production

**NO-GO au 15 novembre.** La pagination donne un gain HTTP net à cinq travailleurs et les parcours publics fonctionnent sur PostgreSQL réel. À dix travailleurs, le p95 reste autour de 2,8 s avec throttling CPU mesuré ; le dimensionnement doit être surveillé sous charge réelle, sans hausse de forfait décidée sur ce seul test. L'interface administrateur avec une session autorisée sur la vraie préproduction reste à tester. Surtout, la restauration d'une **sauvegarde de production** et l'inventaire des clients légitimes de `anatole-postgres` ne sont pas confirmés ; la règle réseau publique ne doit pas être restreinte avant ces deux contrôles. L'exploitation doit définir surveillance, seuils d'alerte, import initial contrôlé, ordre de déploiement #193 → #194 → #195 → #196, et procédure de retour arrière testée sur préproduction. Le budget JavaScript n'a que 22 850 octets de marge. Aucune fusion ni modification de la base active n'a été faite.

La préproduction coûte toujours **13,30 $ US/mois** au tarif catalogue. Lorsqu'elle ne sert plus aux validations, demander l'autorisation de supprimer séparément son API et sa base après sauvegarde du rapport et vérification d'absence de consommateur ; contrôler ensuite l'arrêt de la facturation. Ne pas supprimer ni suspendre la base ou l'API de production. Les quatre contrôles GitHub de #193, #194, #195 et du précédent head de #196 étaient verts ; la PR #196 restera en brouillon et son **commit final** devra repasser `api-tests`, `web-build`, `mobile-quality` et `e2e` avant tout avis de déploiement.
