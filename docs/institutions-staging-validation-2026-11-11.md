# Institutions 2.0 — validation PostgreSQL de préproduction (11 novembre 2026)

## Périmètre et décision

Essais effectués sur une base PostgreSQL 18 Render **isolée**, en Oregon, 0.1c/256 Mo, 1 Go de disque et accès externe interdit, avec une API séparée 0.5c/512 Mo sur la branche de la PR #196. Les comptes sont uniquement synthétiques. La base active, les comptes réels, les règles réseau de production et les PR non fusionnées n'ont pas été modifiés. L'API et la base de préproduction restent actives ; l'instance PITR temporaire a été supprimée après vérification.

**Décision : NO-GO pour la production au 15 novembre.** La migration, l'import et la restauration fonctionnent sur PostgreSQL réel, mais les métriques CPU/RAM de PostgreSQL ne sont pas remontées par Render, le détail gestionnaire sature le petit plan API sous cinq requêtes concurrentes, la marge du budget JS reste de 1,07 %, le contrôle E2E GitHub doit être revalidé sur le commit final et l'inventaire des consommateurs de la base active n'est pas achevé. Aucun de ces points ne justifie une modification de la base de production ou une fusion anticipée.

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

Le build web local final a produit **2 186 005 octets** de JS contre un plafond de **2 209 777** : marge **23 772 octets (1,07 %)**. Le plafond est inchangé. La branche antérieure n'avait que 151 octets de marge ; l'optimisation de #196 a donc retiré environ 23 Ko, mais une marge plus confortable reste à obtenir sans régression. Le typecheck et le lint web passent (six avertissements existants hors du périmètre Institutions). Le build optimisé passe également ; deux essais précédents dans le bac à sable Windows avaient échoué sur `EPERM mkdir` pendant le pré-rendu, puis le même build hors bac à sable est passé.

Le 15 novembre, un build local configuré **dès sa compilation** pour l'API de préproduction a été testé sur Chrome à 1440 × 900 et 390 × 844. Les parcours annuaire, classement, recherche du CUSIP `037833100`, détail BlackRock et historique ont tous réussi sur les deux tailles, sans erreur du proxy. Les captures ont été inspectées ; un montant coupé sur la carte desktop a été corrigé par une taille typographique adaptée. L'historique mobile affiche clairement l'état à un seul trimestre, sans point ajouté. L'interface du tableau administrateur n'a pas été testée avec une session navigateur administrateur ; ses contrôles API 200/401/403 ont été vérifiés séparément.

Sur le commit `6d65404`, `api-tests`, `web-build` et `mobile-quality` de GitHub étaient verts. `e2e` a été annulé après 45 minutes **avant tout test**, lors de `playwright install --with-deps chromium webkit` : échec DNS des dépôts `archive.ubuntu.com`, `azure.archive.ubuntu.com` et `security.ubuntu.com` sur le runner `ubuntu-latest` alors passé à Ubuntu Resolute. La PR #196 fixe désormais le runner E2E à Ubuntu 24.04 LTS sans retirer WebKit, Chromium ni aucun parcours. Au premier essai sur ce runner, 972 parcours E2E ont réussi et trois échecs reproductibles concernaient le même état vide d'historique : la base SQLite en mémoire des tests n'avait plus de tables Institutions depuis que leur initialisation implicite a été retirée. Le serveur E2E initialise désormais **explicitement ses seules tables de test** ; la production conserve le drapeau désactivé. Les 18 parcours Institutions ciblés repassent sur Chromium desktop, Pixel 7 et iPhone 14 (3,2 minutes en local). Le contrôle complet GitHub doit encore finir vert sur le commit final.

## Sécurité réseau et coût

La base **de préproduction** accepte zéro plage IP externe et l'API la joint par l'URL interne Render. Le workflow GitHub Actions quotidien requiert une URL PostgreSQL externe et un secret, tandis qu'une tâche planifiée Render pourrait utiliser le réseau privé. L'option Render est préférable après validation des ressources, mais elle coûte au moins 1 $ US/mois et **n'a pas été créée**. Il faut inventorier les clients légitimes de la base de production avant de restreindre son accès réseau ; aucune règle de production n'a été changée.

Devis Render approuvé puis effectivement provisionné : **13,30 $ US/mois** catalogue pour base + API de préproduction, proratisés, hors taxes et dépassements. La base PITR ajoutait **6,30 $ US/mois** pendant sa coexistence (tarif simultané **19,60 $ US/mois**) ; elle est supprimée. Aucun service supplémentaire payant n'a été créé.

## Conditions avant un GO

1. Obtenir les quatre contrôles GitHub verts sur le commit final de #196, avec de vrais tests E2E.
2. Vérifier le tableau administrateur dans un navigateur avec une session de test autorisée ; les autres pages et l'état historique à un seul trimestre ont été vérifiés sur ordinateur et mobile.
3. Réduire ou caractériser le coût du détail gestionnaire à cinq utilisateurs simultanés, et disposer de métriques PostgreSQL exploitables ou d'un protocole de mesure équivalent.
4. Reconstituer une marge JS raisonnable sans relever le budget.
5. Inventorier les clients de la base active et confirmer une sauvegarde de production récupérable avant toute opération.
6. Suspendre les déploiements automatiques avant l'intégration empilée #193 → #194 → #195 → #196 ; procéder à migration puis import contrôlés **avant** d'exposer l'interface. Chaque fusion et toute modification de la base active nécessitent l'accord explicite du propriétaire.
