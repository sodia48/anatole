# Institutions 2.0 — validation PostgreSQL de préproduction (11 novembre 2026)

## Périmètre et décision

Essais effectués sur une base PostgreSQL 18 Render **isolée**, en Oregon, 0.1c/256 Mo, 1 Go de disque et accès externe interdit, avec une API séparée 0.5c/512 Mo sur la branche de la PR #196. Les comptes sont uniquement synthétiques. La base active, les comptes réels, les règles réseau de production et les PR non fusionnées n'ont pas été modifiés. L'API et la base de préproduction restent actives ; l'instance PITR temporaire a été supprimée après vérification.

**Décision mise à jour le 16 novembre : NO-GO pour la production.** La migration, l'import et la restauration fonctionnent sur PostgreSQL réel **en préproduction**. La pagination ramène le p95 du détail gestionnaire sous 1 s à cinq requêtes concurrentes dans deux campagnes, mais il reste autour de 2,8 s à dix. La page Recovery de la base active offre une fenêtre PITR de trois jours et affichait un point récent ; sa **récupérabilité par restauration n'est pas testée**. L'inventaire complet des clients de cette base et le tableau administrateur sur la vraie préproduction dans un navigateur ne sont pas confirmés. La marge JS est de 1,03 %. Les quatre contrôles GitHub étaient verts sur `76905d4` et doivent l'être aussi sur le commit final. Aucune base active n'a été modifiée et aucune PR n'a été fusionnée.

## Complément de clôture (16 novembre 2026)

### Sécurité et validation du tableau administrateur

Après retrait de l'allowlist temporaire du **seul** service API de préproduction, `/ready` a indiqué `configured_admins=0`, **reconfirmé le 16 novembre** par un GET en lecture seule. L'ancien compte synthétique identifié a reçu **403** sur l'endpoint administrateur, sa suppression ciblée a renvoyé **204**, son ancien jeton a ensuite reçu **401** et une nouvelle connexion a reçu **401**. Un visiteur sans session reçoit **401**, reconfirmé le 16 novembre. Aucun identifiant, mot de passe ou jeton n'est conservé dans le dépôt.

Le navigateur E2E local sur données synthétiques vérifie visiteur **401**, utilisateur standard **403** et administrateur **200**, avec état vide et alertes, sur Chromium desktop, Pixel 7 et iPhone 14 (**3/3**). Une session temporaire de préproduction a permis la connexion, mais l'outil Computer Use s'est arrêté avant la visite de `/admin/institutions` ; le **rendu sur PostgreSQL de préproduction n'est donc pas validé**. L'accès temporaire est révoqué et ne doit pas être réactivé sans nouvelle autorisation. Les tests API 200/401/403 ne remplacent pas ce parcours navigateur.

### Performances après optimisation

Deux campagnes HTTP ont comparé le même détail BlackRock, deux chauffes puis 20 réponses par variante et concurrence. Toutes les réponses ont renvoyé **200**. La réponse historique complète contient 6 179 positions et pèse 2 034 140 octets ; une page de 100 pèse 35 161 octets. Les temps bout en bout incluent le réseau client–Render ; chaque p95 est empirique sur 20 réponses, pas une garantie de capacité.

| Campagne | Concurrence | Complet p50/p95 | Page 100 p50/p95 |
| --- | ---: | ---: | ---: |
| A | 1 | 390 / 712 ms | 169 / 267 ms |
| A | 5 | 1 364 / 2 351 ms | 490 / 855 ms |
| A | 10 | 2 218 / 4 370 ms | 1 404 / 2 756 ms |
| B | 1 | 331 / 566 ms | 205 / 582 ms |
| B | 5 | 1 300 / 2 814 ms | 675 / 918 ms |
| B | 10 | 2 217 / 3 917 ms | 1 004 / 2 780 ms |

À cinq requêtes concurrentes, le p95 paginé est 2,75 à 3,06 fois inférieur au contrat complet **de la même campagne**. À dix, il reste autour de 2,8 s. Le profil `EXPLAIN (ANALYZE, BUFFERS)` sur PostgreSQL 18.6 a mesuré 0,035 ms pour le scan des 100 lignes de détail, 98,49/105,72 ms p50/p95 pour le transfert du JSON complet depuis PostgreSQL, 104,76/194,92 ms pour `store.detail()` paginé, et 0,11/0,15 ms pour sa sérialisation. Trois requêtes SQL fixes par lecture, sans N+1. Une requête relationnelle candidate a pris 308 ms malgré l'index utilisé et n'a pas été adoptée. Le conteneur API limité à 0,5 vCPU a subi 23 périodes de throttling sur 47 et 0,737 s de temps throttlé pendant le profil ; le pool SQL gardait une connexion libre, zéro empruntée après mesure, et PostgreSQL montrait deux connexions au moment du relevé. La CPU API et le traitement/transfert du JSON complet sont des coûts mesurés ; la part exacte du réseau et la CPU/RAM propres à PostgreSQL ne sont pas isolées. Aucun index ou changement de forfait supplémentaire n'est justifié sans mesure. Voir [le protocole complet et les valeurs non arrondies](institutions-stabilization-2026-11-15.md).

### Sauvegardes, interface et coût

Les restaurations logique et PITR réussies plus bas concernent **exclusivement la préproduction**. Le 16 novembre, la page Recovery de `anatole-postgres` a été auditée **en lecture seule** dans l'onglet Render déjà ouvert. Elle affichait un PITR sélectionnable sur les **trois jours précédents**. Le formulaire proposait comme dernier point disponible **2026-11-16 à 12:00:08 UTC−05**, observé vers 12:09 heure locale ; cela atteste la fraîcheur **affichée par Render**, pas l'intégrité d'une restauration. La section Export indiquait une rétention d'au moins sept jours pour les exports logiques, mais **aucun export existant n'y était listé**. La [documentation Render](https://render.com/docs/postgresql-backups) confirme que le PITR restaure dans une **nouvelle instance** et que les exports logiques à la demande sont retenus sept jours. Le formulaire PITR a été fermé sans soumission ; aucun export, restauration, changement de forfait ou opération SQL sur la base active n'a été déclenché. La récupérabilité effective d'une sauvegarde de **production** reste non testée : son essai exige une instance isolée et l'accord préalable sur son coût. Lors de la tentative antérieure, Computer Use s'était arrêté sur une incertitude d'URL ; cette fois l'onglet Render déjà ouvert et son lien Recovery visible ont permis la lecture normale, sans contourner ce blocage.

Le build web actuel produit **2 186 927 / 2 209 777 octets** de JS, marge **22 850 octets (1,03 %)** sans changement du plafond. Un build local relié uniquement à l'API PostgreSQL de préproduction a vérifié l'annuaire, la pagination, la recherche, le détail et les historiques sur Chromium desktop, Pixel 7 et iPhone 14/WebKit ; captures inspectées, aucune erreur API 5xx. Les coûts de préproduction encore actifs sont **13,30 $ US/mois** au tarif catalogue (base 6,30 $, API 7 $), hors taxes et dépassements. L'instance PITR temporaire facturée 6,30 $ US/mois au prorata pendant sa coexistence a été supprimée. Aucune ressource supplémentaire n'a été créée.

Le plan d'intégration reste #193 → #194 → #195 → #196, en revalidant les quatre jobs après toute actualisation des branches. Avec accords distincts, suspendre les déploiements automatiques avant la première fusion, déployer l'API finale avec collecte au démarrage désactivée, vérifier une sauvegarde **de production** récupérable, migrer et importer sous contrôle avant d'exposer l'interface, vérifier les comptes et endpoints, puis reprendre les déploiements. En cas d'échec applicatif, revenir au dernier déploiement sain et laisser les tables additives ; ne jamais exécuter `down` en production. Une restauration complète risquerait de perdre des écritures de comptes postérieures au point choisi et demande une décision spécifique. Une fois les validations terminées, conserver les rapports/captures sans secrets, vérifier l'absence de clients et jobs de préproduction, puis demander l'autorisation de supprimer séparément son API et sa base et contrôler la fin de leur facturation. Aucune suppression n'est autorisée par ce document.

Les sections ci-dessous conservent les mesures du **11 novembre** et l'historique des contrôles du début du sprint. En cas d'écart, les constats datés ci-dessus et le [rapport du 15 novembre](institutions-stabilization-2026-11-15.md) prévalent.

## Sauvegarde, migration et import réellement exécutés

| Essai | Résultat observé |
| --- | --- |
| Avant migration | Cinq tables `account_*`, aucune table `institution_*`, aucun compte réel. Un compte synthétique à mot de passe inutilisable a servi de témoin. |
| Export logique | `pg_dump -Fc --no-owner --no-acl`, 33 095 octets, restauré dans une base sœur isolée ; schéma et ligne synthétique identiques. |
| PITR Render | Nouvelle instance PostgreSQL 18 restaurée à un point **antérieur** à la migration ; un compte synthétique, zéro table Institutions, empreintes du schéma et du compte identiques. Instance temporaire ensuite supprimée. |
| Migration | `cd apps/api && PYTHONPATH=. python ../../scripts/migrate_institutions.py up` : sept tables Institutions et leurs index créés. Deuxième passage par `python -m app.ops.institutions migrate-up --expected-database anatole_institutions_staging` idempotent. Empreintes du schéma et de la ligne `account_users` inchangées. |
| Import SEC T2 2026 | `python -m app.ops.institutions import --expected-database anatole_institutions_staging` : **100 gestionnaires, 395 419 positions**, période 2026-06-30, ingestion `succeeded`, durée **480,50 s**. |
| Intégrité | Sept tables et index présents. Un CUSIP réel du bundle (`037833100`) donne 150 positions ; les recherches et l'historique retournent des données cohérentes pour l'unique trimestre. |
| Redémarrage réel | Instance API redémarrée dans Render, disponibilité rétablie et vérification persistante : 100 gestionnaires, 395 419 positions, période 2026-06-30. Aucun nouvel import au démarrage. |
| Échec contrôlé | Sur une **base sœur jetable** seulement, une table `institution_snapshots` volontairement incompatible fait échouer `migrate-up` avec code 1. La base sœur a été recréée depuis l'export du point antérieur : compte synthétique retrouvé, zéro table Institutions. Aucune opération `down` en production. |

La base de préproduction occupe **212 874 943 octets** après import ; la table des positions et ses index occupent **166 428 672 octets**. Render affiche environ un tiers du gigaoctet consommé. La capacité doit être reprojetée avant plusieurs trimestres. Le premier déploiement API a échoué par timeout PostgreSQL pendant l'initialisation de la base ; redéployé **sur le même commit** une fois la base disponible, il est passé Live. Le plan de déploiement doit inclure cette vérification d'ordre.

## Endpoints et sécurité

Appels HTTP réels à l'API de préproduction : annuaire, périodes, détail gestionnaire, historique gestionnaire, positions par CUSIP, activité par CUSIP et historique par CUSIP ont tous renvoyé **200** avec le snapshot importé. Le tableau administrateur a été exercé contre la base de préproduction avec `FastAPI TestClient` et une session synthétique temporaire : **200** pour l'administrateur (`latest_period=2026-06-30`, `consistency_ok=true`), **403** pour le même jeton sans rôle administrateur et **401** sans session. La session de test a été supprimée. Les drapeaux de collecte SEC au démarrage et de découverte en arrière-plan sont désactivés ; les routes de lecture n'ont pas déclenché de collecte. Le test automatisé de non-collecte lors des lectures passe également.

## Mesures de latence

Chaque route a reçu une requête à froid, puis 20 requêtes séquentielles à chaud depuis un client externe. Mesures bout en bout en millisecondes ; elles incluent le réseau et ne représentent pas une charge utilisateur complète.

| Route | Froid | p50 chaud | p95 chaud |
| --- | ---: | ---: | ---: |
| Annuaire | 204,62 | 10,09 | 61,28 |
| Périodes | 5,06 | 4,48 | 20,06 |
| Détail gestionnaire | 322,01 | 271,70 | 569,54 |
| Historique gestionnaire | — | 7,96 | 36,48 |
| Positions CUSIP | — | 14,73 | 51,87 |
| Activité CUSIP | — | 37,37 | 49,35 |
| Historique CUSIP | — | 30,97 | 54,91 |

Pour 25 détails gestionnaire avec cinq travailleurs simultanés, tous les statuts sont 200, mais **p50 1 813,71 ms**, **p95 2 622,45 ms** et maximum 2 904,06 ms. Le conteneur API a consommé 3,68 s CPU sur 7,31 s écoulées (environ 0,50 vCPU) et enregistré 73 périodes de throttling. Sa mémoire courante après essais était de 327 426 048 octets ; le pic de conteneur depuis le redémarrage était de 493 572 096 octets pour une limite de 536 870 912 octets. Ce pic inclut un processus de test ponctuel dans le Shell, et ne doit pas être attribué entièrement à Uvicorn. Pendant l'import, une mesure de conteneur a montré 431 071 232 octets, sans OOM. Les connexions PostgreSQL observées étaient de 2 au repos et de 3 à 4 pendant l'import, sur un maximum affiché de 100.

La page Metrics de la base Render indiquait **« No data captured in the last 12 hours »**. Il n'existe donc pas de mesure fiable de CPU, RAM, I/O ou p95 de PostgreSQL pour cet essai ; ces chiffres ne sont pas inventés.

## Interface, budget et contrôles

Au **11 novembre**, le build web local produisait **2 186 005 octets** de JS contre un plafond de **2 209 777** : marge **23 772 octets (1,07 %)**. Après pagination, la valeur actuelle figure dans le complément du 16 novembre. Le plafond est inchangé. La branche antérieure n'avait que 151 octets de marge. Le typecheck et le lint web passent (six avertissements existants hors du périmètre Institutions). Le build optimisé passe également ; deux essais précédents dans le bac à sable Windows avaient échoué sur `EPERM mkdir` pendant le pré-rendu, puis le même build hors bac à sable est passé.

Le 15 novembre, un build local configuré **dès sa compilation** pour l'API de préproduction a été testé sur Chrome à 1440 × 900 et 390 × 844. Les parcours annuaire, classement, recherche du CUSIP `037833100`, détail BlackRock et historique ont tous réussi sur les deux tailles, sans erreur du proxy. Les captures ont été inspectées ; un montant coupé sur la carte desktop a été corrigé par une taille typographique adaptée. L'historique mobile affiche clairement l'état à un seul trimestre, sans point ajouté. L'interface du tableau administrateur n'a pas été testée avec une session navigateur administrateur ; ses contrôles API 200/401/403 ont été vérifiés séparément.

Sur le commit **historique** `6d65404`, `api-tests`, `web-build` et `mobile-quality` de GitHub étaient verts. `e2e` avait été annulé après 45 minutes **avant tout test**, lors de `playwright install --with-deps chromium webkit` : échec DNS des dépôts Ubuntu sur le runner `ubuntu-latest` alors passé à Ubuntu Resolute. La PR #196 fixe désormais le runner E2E à Ubuntu 24.04 LTS sans retirer WebKit, Chromium ni aucun parcours. Au premier essai sur ce runner, 972 parcours E2E ont réussi et trois échecs reproductibles concernaient le même état vide d'historique : la base SQLite en mémoire des tests n'avait plus de tables Institutions depuis que leur initialisation implicite a été retirée. Le serveur E2E initialise désormais **explicitement ses seules tables de test** ; la production conserve le drapeau désactivé. Les 18 parcours Institutions ciblés repassent sur Chromium desktop, Pixel 7 et iPhone 14 (3,2 minutes en local). Les quatre contrôles sont ensuite passés au vert sur `76905d4` ; le commit final de ce rapport doit aussi être vérifié.

## Sécurité réseau et coût

La base **de préproduction** accepte zéro plage IP externe et l'API la joint par l'URL interne Render. Le workflow GitHub Actions quotidien requiert une URL PostgreSQL externe et un secret, tandis qu'une tâche planifiée Render pourrait utiliser le réseau privé. L'option Render est préférable après validation des ressources, mais elle coûte au moins 1 $ US/mois et **n'a pas été créée**. Il faut inventorier les clients légitimes de la base de production avant de restreindre son accès réseau ; aucune règle de production n'a été changée.

Devis Render approuvé puis effectivement provisionné : **13,30 $ US/mois** catalogue pour base + API de préproduction, proratisés, hors taxes et dépassements. La base PITR ajoutait **6,30 $ US/mois** pendant sa coexistence (tarif simultané **19,60 $ US/mois**) ; elle est supprimée. Aucun service supplémentaire payant n'a été créé.

## Conditions avant un GO

1. Obtenir une autorisation distincte pour restaurer un point PITR **de la base active** dans une instance isolée payante, vérifier son intégrité et la supprimer ensuite avec accord explicite. La fenêtre de trois jours et le point récent affichés ne prouvent pas la récupérabilité réelle.
2. Inventorier tous les clients de la base active et leurs besoins réseau ; ne pas modifier la règle publique avant cette vérification.
3. Vérifier le rendu de `/admin/institutions` avec une session autorisée sur la vraie préproduction, si une nouvelle fenêtre d'accès est expressément approuvée, puis révoquer cet accès immédiatement.
4. Surveiller la charge à dix requêtes concurrentes et recueillir les métriques PostgreSQL propres à la base si elles deviennent accessibles ; le p95 paginé mesuré de 2,76 à 2,78 s reste élevé.
5. Garder le budget JS sous 2 209 777 octets et obtenir les quatre contrôles GitHub verts sur le commit final de #196.
6. Après autorisations distinctes, suspendre les déploiements automatiques avant l'intégration #193 → #194 → #195 → #196, migrer et importer sous contrôle avant d'exposer l'interface, vérifier les comptes et lectures, puis reprendre les déploiements. Ne jamais exécuter `down` en production.
7. Une fois les validations terminées, conserver les résultats, vérifier l'absence de clients et jobs de préproduction, puis demander l'autorisation de supprimer séparément son API et sa base et vérifier la fin de leur facturation.
