# Institutions 2.0 — préparation du déploiement

Cette note décrit la procédure de validation. Les constats propres à la configuration de production sont communiqués au propriétaire hors du dépôt. Aucune base de production n'a été modifiée pendant la préparation.

## Prérequis d'infrastructure

- Vérifier sur Render que l'API utilise une URL PostgreSQL **persistante**, que le producteur de données et l'API pointent vers la même base, et que la région, la version et le plan de calcul sont adaptés. Ne jamais afficher la valeur de `ACCOUNT_DATABASE_URL` dans les journaux, les tickets ou les PR.
- Vérifier la capacité libre, la limite de connexions, l'autoscaling, le pool et les métriques de calcul. La [grille Render](https://render.com/docs/compute-plans) et la [documentation des connexions](https://render.com/docs/postgresql-creating-connecting) précisent les limites du plan choisi.
- Vérifier la fenêtre PITR et créer **puis restaurer en essai** un export logique avant toute migration. Voir la [documentation Render sur les sauvegardes](https://render.com/docs/postgresql-backups).
- Inventorier les clients externes de PostgreSQL et fermer ou restreindre l'accès externe ; les services Render dans la même région peuvent utiliser le [réseau privé](https://render.com/docs/private-network). Toute modification de sécurité en production requiert l'autorisation du propriétaire.
- `render.yaml` ne provisionne ni PostgreSQL ni tâche planifiée ; `ACCOUNT_DATABASE_URL` y est une variable `sync: false`. La présence d'une variable dans le Blueprint ne prouve pas sa valeur ni sa correspondance avec une ressource PostgreSQL donnée.

## Compatibilité du schéma

`scripts/migrate_institutions.py up` appelle `InstitutionStore.create_schema()`. Les sept tables et leurs index sont définis dans un `MetaData` séparé : `institution_snapshots`, `institution_details`, `institution_holdings`, `institution_filings`, `institution_ingestion_runs`, `institution_symbol_map` et `institution_ingestion_leases`. Le script n'appelle aucune migration des tables `account_*`. Un test local exécute réellement la CLI `up` deux fois sur une base contenant une ligne `account_users`, puis vérifie que la ligne et le schéma du compte sont identiques. Ce test SQLite vérifie la portée du code, **pas** les verrous, permissions ou performances PostgreSQL.

Le démarrage actuel de l'API appelle également `create_schema()` et, en production si le T2 2026 manque, lance l'import du bundle en arrière-plan. Un déploiement automatique de `main` pourrait donc créer les tables et démarrer un gros import avant une validation manuelle. La sauvegarde et l'essai sur préproduction sont des conditions préalables au premier déploiement de cette pile. Pendant l'import initial, les détails peuvent répondre 503 ; le classement garde le snapshot embarqué.

## Essai obligatoire sur une préproduction isolée

Préparer une base PostgreSQL 18 distincte, avec comptes synthétiques ou copie anonymisée, même taille de calcul si possible, et une application de préproduction pointant **uniquement** vers elle. Vérifier son identité par un canal administrateur sans copier de chaîne de connexion dans un journal, une PR ou un ticket. Ne pas utiliser la base de production ni la base suspendue sans nouvelle autorisation.

1. Arrêter les collectes de préproduction. Relever le schéma, les nombres de lignes des tables `account_*`, l'espace libre, le nombre de connexions et les métriques CPU/RAM. Vérifier l'absence de collisions avec les sept noms `institution_*`.
2. Créer un export logique complet depuis Recovery ou avec `pg_dump` et vérifier qu'il est récupérable. Tester sa restauration sur une cible isolée avant de le considérer comme un retour arrière. Ne pas placer l'URL ou un mot de passe PostgreSQL dans une ligne de commande ou dans les sorties.
3. Depuis le commit final de #196, avec `ACCOUNT_DATABASE_URL` injecté par le gestionnaire de secrets de préproduction, exécuter `python scripts/migrate_institutions.py up`. Vérifier les sept tables, index, droits SQL et l'absence de changement du schéma et des lignes `account_*`. Répéter `up` pour vérifier l'idempotence.
4. Démarrer l'API de préproduction avec le bundle officiel `institution_details_t2_2026.json.gz`. Attendre la fin de `institution_bundle_bootstrap`, relever durée, CPU/RAM et connexions. Exiger une période publiée `2026-06-30`, 100 détails et **395 419** positions, puis rechercher un CUSIP présent et vérifier ses dépôts SEC. Redémarrer l'API et confirmer que la période, les comptes et les 395 419 positions persistent sans nouvel import.
5. Appeler le classement, `/{cik}`, `/security/activity`, `/security/holdings`, `/periods`, `/history/{cik}`, `/security/history?q=<CUSIP>`, et `/api/v1/admin/institutions/quality` avec une session administrateur de test. Vérifier 401 sans session et 403 pour un non-administrateur. Contrôler les pages web ordinateur/mobile, leurs graphiques historiques et l'état à un seul trimestre sans point inventé.
6. Mesurer p50/p95 de chaque endpoint à chaud et à froid, avec plusieurs requêtes concurrentes, et relever le CPU/RAM de l'API et du PostgreSQL, le pic de connexions, la taille des tables/index, la durée de l'import et les erreurs/attentes de verrous. Comparer au comportement initial et conserver les résultats anonymisés. Les chiffres SQLite locaux ne satisfont pas ce jalon.

## Architecture de collecte

| Option | Connexion | Effet opérationnel |
| --- | --- | --- |
| GitHub Actions actuel (`.github/workflows/institutions-13f-sync.yml`) | URL PostgreSQL externe et secret GitHub `INSTITUTIONS_DATABASE_URL` | Le job est quotidien sur `main` et saute la collecte si le secret manque. Les adresses des runners hébergés changent ; [GitHub déconseille de s'appuyer sur leurs plages IP](https://docs.github.com/en/enterprise-cloud@latest/authentication/keeping-your-account-and-data-secure/about-githubs-ip-addresses). Cette option demanderait une exposition externe contrôlée, le chiffrement TLS et une gestion de la liste d'accès. |
| Tâche planifiée Render | URL interne de la même base, dans la même région et le même espace Render | Le trafic reste sur le réseau privé et Render garantit une seule exécution simultanée de la tâche. C'est l'option recommandée après essai de la taille mémoire et du temps de collecte. [Render facture la tâche selon sa durée avec un minimum de 1 $ US par mois](https://render.com/docs/cronjobs) ; ne pas la créer sans accord sur le coût. |

La tâche Render doit utiliser `python scripts/sync_institution_store.py --if-new`, conserver le `SEC_USER_AGENT`, recevoir une variable secrète vers l'URL **interne** et disposer d'assez de RAM pour reconstruire le trimestre. Après validation de son premier cycle, retirer la planification GitHub ou conserver le workflow sans secret pour éviter deux collecteurs. Aucun changement de scheduler n'est effectué à ce stade.

## Retour arrière et ordre de fusion

- Avant la fusion, figer un commit de chaque PR et revalider les quatre jobs `api-tests`, `web-build`, `mobile-quality`, `e2e` sur ce commit. Fusionner, uniquement avec l'accord du propriétaire, dans l'ordre #193 → #194 → #195 → #196. Les bases des PR sont empilées dans cet ordre ; réactualiser chaque branche après la fusion de sa base et attendre à nouveau les contrôles.
- `main` alimente normalement un déploiement automatique Render. Avant **la première fusion**, suspendre cet auto-déploiement avec l'accord du propriétaire, ou préparer un autre mécanisme de retenue vérifié ; #193 ne doit pas être déployée seule. Après les quatre fusions autorisées, déployer dans une fenêtre contrôlée, avec sauvegarde restaurable, espace libre et surveillance de l'import initial. La première mise en service visible des pages #195/#196 attend la publication et les vérifications des données.
- En cas d'échec applicatif, revenir au dernier déploiement sain et laisser les tables Institutions additives en place ; elles ne modifient pas les comptes. Ne **jamais** lancer `migrate_institutions.py down` en production. Réserver une restauration PITR ou logique à une corruption confirmée et coordonnée : restaurer toute la base peut aussi faire perdre des écritures récentes des comptes.
- Aucun test réel de migration, import, persistance, p50/p95 ou consommation sur PostgreSQL de préproduction n'a encore été exécuté : aucun accès à une base active isolée n'est disponible. Aucun coût nouveau n'a été engagé.
