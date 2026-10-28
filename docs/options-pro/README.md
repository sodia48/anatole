# Options Pro — suivi des livraisons

Base : `main` au commit `6e1e5cf41c26116faa455a355550209532fa37f4`. Les PR sont indépendamment révisables et, lorsqu'elles dépendent d'une PR non fusionnée, leur branche cible celle-ci jusqu'à sa fusion. Aucune fusion n'est automatique.

| PR | Périmètre | Dépendance / état |
| --- | --- | --- |
| 1 — Commodity Data Recovery | Instantanés durables, ingestion séparée, performance, droits et observabilité | En cours |
| 2 — Commodity Coverage | Identité des contrats, expiration, parseurs et audit de couverture | PR 1 ; validation réelle conditionnée aux droits |
| 3 — Premium Option Chain | Chaîne Calls / strike / Puts, filtres et mobile | PR 1–2 |
| 4 — Strategy Builder | Jambes, stratégies, risques et modèles | Contrats et spécifications vérifiés |
| 5 — Volatility Intelligence | IV, Greeks, smile, structure par échéance et événements | Données de qualité et modèles validés |
| 6 — Screener & Heatmap | Filtres et visualisations | PR 3 et données suffisantes |
| 7 — Options Portfolio & Alerts | Positions, valorisation et alertes | Contrats, devises et fraîcheur vérifiés |
| 8 — Assistant & Full Integration | Contexte exact, intégration web/mobile et portefeuille | PR 3–7 |

## Droits et données

Le 27 octobre 2026, le propriétaire indique qu'aucune licence n'est connue. Les [conditions de CME Group](https://www.cmegroup.com/trading/market-data-explanation-disclaimer.html) restreignent notamment l'extraction systématique, le stockage et la redistribution des données de son site sans autorisation écrite. Un accès public ou une clé ne démontre pas de droits de diffusion. Le chemin utilisateur ne télécharge plus les bulletins ni les pages ICE ; sans source autorisée et instantané, il affiche une indisponibilité. Le parseur legacy demeure présent uniquement pour les tests existants et n'est pas une source active de l'API.

L'adaptateur Barchart utilise un endpoint documenté, mais il ne s'active que si un opérateur a vérifié les droits de collecte, conservation et affichage applicables. La couverture, la fréquence et les droits dépendent du contrat conclu avec le fournisseur. La réponse indique une couverture partielle et des cotations différées : la date de récupération n'est pas une heure de cotation garantie. Aucune donnée de marché n'est créée pour remplir une chaîne.

## Exploitation de PR 1

- Prévoir un Redis/Valkey partagé, durable et configuré sans éviction des instantanés. Le filesystem Render et les instances gratuites de Key Value ne garantissent pas la persistance. Les processus web et le collecteur doivent utiliser la même valeur `REDIS_URL` et le même `REDIS_CACHE_PREFIX`.
- Après vérification des droits seulement, configurer `BARCHART_API_KEY` et `COMMODITY_OPTIONS_BARCHART_AUTHORIZED=true` dans les deux services, sans placer de clé dans le dépôt. La clé du collecteur est transmise dans le corps POST, pas dans l'URL.
- Configurer séparément un cron Render ou un ordonnanceur équivalent exécutant `python -m app.jobs.commodity_options_ingest` depuis `apps/api`. Une fréquence de départ de quatre heures peut être revue selon le contrat du fournisseur ; les horaires Render sont en UTC. Le cron doit recevoir ses propres variables ou un groupe d'environnement partagé. Sa création et ses coûts sont distincts de cette PR.
- Le collecteur précharge GC, RB, CL, NG, SI, HG, ZC et ZS. Le verrou Redis évite deux collectes concurrentes ; l'écriture vérifie le jeton du verrou atomiquement. Les réponses vides, non valides ou présentant une baisse suspecte de couverture ne remplacent pas le dernier instantané valide. Les logs donnent racine, nombre de contrats, résultat et durée sans clé API.
- Le lecteur fait uniquement un accès Redis borné ; en cas de panne après une lecture réussie, il conserve le dernier instantané en mémoire et le marque périmé. Un redémarrage sans Redis persistant ne permet pas de le reconstruire. L'heure affichée est celle de la collecte, pas une garantie de fraîcheur des cotations.

## Mesure reproductible

Depuis `apps/api`, lancer `python scripts/benchmark_commodity_snapshots.py`. Sur le poste de développement, avec 600 contrats **synthétiques** par racine, une attente fournisseur simulée de 200 ms et Redis simulé en mémoire : ancien chemin à froid, 8 requêtes, p50 519,75 ms / p95 1 041,60 ms ; instantanés, 80 requêtes, p50 32,85 ms / p95 49,14 ms. Ces chiffres ne mesurent ni un PDF réel, ni un fournisseur, ni le réseau Redis, ni le navigateur, ni Render. La taille réduite de l'échantillon avant limite la valeur statistique de son p95.

La latence réelle avant/après, le taux d'extraction, les nombres de contrats GC/RB et les temps d'affichage/changement de produit restent **non vérifiés** tant qu'une source autorisée et un environnement représentatif ne sont pas disponibles. La limite p95 de 500 ms n'est donc pas déclarée atteinte en production.

## PR 2 — limites de l'audit de couverture

Le parseur expérimental du bulletin distingue maintenant le mois contractuel de la date réelle d'expiration, non fournie par les lignes traitées : cette date reste non renseignée. Le règlement est stocké séparément du dernier prix. Les volumes et intérêts ouverts absents restent non renseignés, tandis que les zéros publiés restent des zéros. Les identifiants `CME-EOD-ROW` identifient des lignes de travail et ne sont pas des symboles officiels. Aucun rapprochement de Greeks n'est effectué sur une échéance inconnue.

Des PDF **entièrement synthétiques**, générés dans les tests, couvrent énergie, métaux, agriculture, élevage et bois, avec changements de page et sections call/put. Ces tests ne valident ni le format d'un bulletin réel ni le nombre de contrats GC ou RB. Les multiplicateurs, unités, style d'exercice, bourse, sous-jacents et dates réelles de l'ensemble des racines restent à vérifier auprès de sources autorisées ; le parseur historique n'est pas raccordé aux requêtes. La couverture réelle, les droits et la comparaison aux originaux restent donc ouvertes et ce lot demeure en brouillon.

Racines à auditer : énergie CL, BZ, NG, RB, HO ; métaux GC, SI, HG, PL, PA ; agriculture ZC, ZW, KE, ZO, ZR, ZS, ZM, ZL ; élevage LE, GF, HE ; bois LBR. Leur présence dans la configuration historique est un point de départ, pas une preuve de disponibilité ni de conformité des spécifications. À titre d'exemple, CME distingue le code d'option sur l'or OG du sous-jacent GC dans sa [fiche contractuelle](https://www.cmegroup.com/trading/metals/files/fact-card-gold-futures-options.pdf) : la racine du futur ne suffit pas pour identifier l'option.
