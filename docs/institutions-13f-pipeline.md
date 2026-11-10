# Pipeline Institutions 13F

## Source et périodes

Le snapshot initial correspond aux jeux trimestriels [SEC Form 13F](https://www.sec.gov/data-research/sec-markets-data/form-13f-data-sets) de juin–août et mars–mai 2026. Il couvre uniquement le 30 juin 2026 pour 100 gestionnaires ; 99 ont une période comparable. L'archive compressée contient 395 419 positions normalisées, les dépôts retenus et les types `SH`/`PRN`. La correspondance ticker–CUSIP est volontairement limitée à cinq titres vérifiés dans des [déclarations N-PORT de la SEC](https://www.sec.gov/Archives/edgar/data/1592900/000159290026004087/primary_doc.xml) ; un symbole inconnu demande une recherche par CUSIP au lieu de masquer une position existante.

L'API conserve T2 comme dernier trimestre complet tant que le dataset trimestriel suivant n'a pas été validé. Les dépôts T3 découverts sont comptés séparément dans `partial_report_period` et `partial_institutions_reporting`. Un amendement T2 postérieur à la validation marque le classement à revalider. La somme des valeurs 13F est une somme déclarée dans l'échantillon, pas des actifs uniques sous gestion ni des transactions.

## Lecture et stockage

Les routes `/api/v1/discovery/institutions`, `/{cik}`, `/security/activity` et `/security/holdings` lisent des données préparées et indexées. Les lectures ne téléchargent aucun dépôt SEC ; même `refresh=true` relit le stockage. Les détails sont publiés atomiquement avec le snapshot. Les indexes couvrent CIK, CUSIP, ticker vérifié, période et valeur déclarée. Le nouvel endpoint `/security/holdings` fournit tri par valeur et pagination côté serveur. Le snapshot JSON embarqué reste disponible pour le classement si la base est indisponible ; les détails sont alors explicitement indisponibles plutôt que présentés comme des positions vides.

Les tables sont créées sur `ACCOUNT_DATABASE_URL`, la base déjà utilisée par les comptes. `python scripts/migrate_institutions.py up` crée les seules tables institutionnelles ; `down` les supprime et doit être utilisé uniquement après sauvegarde. Au premier démarrage de production sans période stockée, l'archive officielle embarquée est installée en arrière-plan. Sur SQLite local, l'import complet avec index a pris **98,93 s** et créé une base de **239 Mo** ; pendant ce premier import, les détails retournent 503. Sur une base persistante, il ne se répète pas au redémarrage. Une base SQLite éphémère ne préserve pas les trimestres ajoutés après le redémarrage : la production doit utiliser une URL PostgreSQL persistante.

## Collecte indépendante

Le service existant contrôle les métadonnées des 100 CIK cinq minutes après le démarrage, puis chaque jour ; pendant les 45 jours suivant une fin de trimestre, toutes les six heures. La concurrence est bornée à deux, les requêtes SEC respectent l'intervalle d'accès et un verrou SQL empêche deux collectes simultanées. Cette vérification ne télécharge pas les tables de positions et n'altère pas un trimestre validé.

La reconstruction complète s'exécute hors requête avec `python scripts/sync_institution_store.py --if-new`. Elle découvre le dernier dataset SEC, évite les deux téléchargements si cette source est déjà publiée, compare des périodes explicites, traite les amendements du dataset et publie les détails et l'index en une transaction. Pour un rejeu reproductible, fournir `--current-zip`, `--previous-zip`, `--current-url`, `--previous-url` et `--report-period`. La commande échoue sans `ACCOUNT_DATABASE_URL` ou `DATABASE_URL` ; elle ne crée aucune nouvelle base.

Le workflow `Institutions 13F Sync` vérifie chaque jour depuis `main` et peut être lancé manuellement. Il nécessite le secret GitHub `INSTITUTIONS_DATABASE_URL` pointant vers la même base persistante que l'API et une connexion réseau autorisée depuis GitHub Actions. Sans ce secret, il indique explicitement que la synchronisation est ignorée. La variable GitHub `SEC_USER_AGENT` peut fournir l'identité de contact SEC. Aucun abonnement supplémentaire n'est provisionné par ce changement. **Avant fusion/déploiement**, vérifier l'URL PostgreSQL persistante et l'accès réseau du runner ; sans eux, seule la découverte légère des nouveaux dépôts fonctionne, et les nouveaux trimestres complets ne seront pas publiés automatiquement.

## Validation et limites

Les tests déterministes couvrent la séparation des périodes, les comparaisons par quantités, la persistance après redémarrage, la pagination, le verrou, la découverte partielle et l'absence de SEC depuis les lectures. Le snapshot et l'archive ont été reconstruits depuis les ZIP SEC réels ; [le dépôt BlackRock du 7 août 2026](https://www.sec.gov/Archives/edgar/data/2012383/000201238326003238/0002012383-26-003238-index.html) confirme la période du 30 juin 2026. Le benchmark local n'est pas une mesure du p95 Render ; l'objectif de production reste à contrôler sur la base et le réseau effectivement déployés.
