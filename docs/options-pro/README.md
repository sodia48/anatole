# Options Pro — suivi des livraisons

Base : `main` au commit `6e1e5cf41c26116faa455a355550209532fa37f4`. Les PR sont indépendamment révisables et, lorsqu'elles dépendent d'une PR non fusionnée, leur branche cible celle-ci jusqu'à sa fusion. Aucune fusion n'est automatique.

| PR | Périmètre | Dépendance / état |
| --- | --- | --- |
| 1 — Commodity Data Recovery | Instantanés durables, ingestion séparée, performance, droits et observabilité | [#174](https://github.com/sodia48/anatole/pull/174), brouillon ; source et stockage non configurés |
| 2 — Commodity Coverage | Identité des contrats, expiration, parseurs et audit de couverture | [#175](https://github.com/sodia48/anatole/pull/175), brouillon ; dépend de #174, validation réelle conditionnée aux droits |
| 3 — Premium Option Chain | Chaîne Calls / strike / Puts, filtres et mobile | [#176](https://github.com/sodia48/anatole/pull/176), brouillon ; dépend de #175 |
| 4 — Strategy Builder | Jambes, stratégies, risques et modèles | [#178](https://github.com/sodia48/anatole/pull/178), brouillon web ; fondation API #177 intégrée à la branche de #176 ; modèles et mobile natif incomplets |
| 5 — Volatility Intelligence | IV, Greeks, smile, structure par échéance et événements | [#179](https://github.com/sodia48/anatole/pull/179), brouillon ; données chargées uniquement, provenance détaillée à vérifier |
| 6 — Screener & Heatmap | Filtres et visualisations | [#180](https://github.com/sodia48/anatole/pull/180), brouillon ; chaîne chargée uniquement |
| 7 — Options Portfolio & Alerts | Positions, valorisation et alertes | Suivi local et rappels en page ; valorisation et alertes persistantes à construire |
| 8 — Assistant & Full Integration | Contexte, intégration web/mobile et portefeuille | Explications générales et liens web ; analyse de chaîne, données de positions et mobile natif restent à construire |

## Droits et données

Le 27 octobre 2026, le propriétaire indique qu'aucune licence n'est connue. Les [conditions de CME Group](https://www.cmegroup.com/trading/market-data-explanation-disclaimer.html) restreignent notamment l'extraction systématique, le stockage et la redistribution des données de son site sans autorisation écrite. Un accès public ou une clé ne démontre pas de droits de diffusion. Le chemin utilisateur ne télécharge plus les bulletins ni les pages ICE ; sans source autorisée et instantané, il affiche une indisponibilité. Le parseur legacy demeure présent uniquement pour les tests existants et n'est pas une source active de l'API.

L'adaptateur Barchart utilise un endpoint documenté, mais il ne s'active que si un opérateur a vérifié les droits de collecte, conservation et affichage applicables. La couverture, la fréquence et les droits dépendent du contrat conclu avec le fournisseur. La réponse indique une couverture partielle et des cotations différées : la date de récupération n'est pas une heure de cotation garantie. Aucune donnée de marché n'est créée pour remplir une chaîne.

La [comparaison technique et commerciale des fournisseurs](commodity-data-providers.md) rassemble les informations publiées et les droits à confirmer par devis ; elle n'active aucune source.

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

## PR 3 — chaîne web en cours

La vue web rapproche un call et un put uniquement lorsque le marché, le sous-jacent, le contrat à terme lorsqu'il est nécessaire, l'échéance réelle et le strike concordent sans ambiguïté. Une série ambiguë ou à échéance inconnue reste distincte. Les filtres ne considèrent pas une valeur manquante comme zéro ; le filtre de spread utilise l'écart absolu ask moins bid. L'indicateur ATM n'est produit que si le sous-jacent est disponible. La limite d'affichage de 1 200 lignes est signalée. Les tests Playwright et les captures utilisent des contrats synthétiques.

La vue jumelée et la sélection d'échéance sont également disponibles dans l'écran mobile natif, avec la même règle de rapprochement. Les filtres avancés mobiles et les préférences de chaîne web peuvent être enregistrés sur l'appareil. Sur le web, les erreurs de l'univers et de la chaîne restent distinctes et une réponse devenue obsolète est ignorée. L'intégration des stratégies, le screener et la heatmap restent à compléter. Les tests sur une chaîne réelle restent dépendants d'une source autorisée. Le budget JavaScript actuel est respecté avec une marge très faible, à surveiller à chaque changement.

## PR 4 — calcul à échéance en préparation

Le moteur expérimental calcule le résultat de jambes vanille et d'une position linéaire sur le sous-jacent à une échéance commune, avec prix, multiplicateurs, devises et sources fournis explicitement. L'heure d'échéance et son fuseau doivent être fournis ; deux contrats expirant le même jour à des heures différentes ne sont pas assimilés. Les bornes du domaine de prix sont explicites et peuvent être non bornées ; les seuils incluent les intervalles de résultat nul. Les échéances ou devises différentes et le régime de prime de type futures sont refusés. Tests numériques sur des exemples synthétiques et une grille de prix indépendante.

Le constructeur web peut sélectionner plusieurs jambes, modifier sens, quantités et primes hypothétiques, appliquer quatre modèles et comparer jusqu'à trois scénarios calculés par cet endpoint. Il sépare les cotations affichées des primes saisies et demande la devise commune, l'heure d'échéance avec son fuseau et un multiplicateur vérifié pour chaque jambe. L'utilisateur confirme que la prime de chaque contrat est payée initialement ; les échéances multiples, les contrats futurs différents et le style de marge futures ne sont pas simulés. Des tests utilisent des contrats synthétiques et le véritable endpoint de calcul ; aucune donnée de production n'est fabriquée. Les modèles avant échéance, les conventions de règlement, la quantification de la marge et de l'exercice/assignation, et l'interface native mobile restent à réaliser. Frais, impôts, change et marge ne sont pas inclus. La prime des options à marge de type futures ne peut pas être supposée payée initialement : voir le [document CME sur les styles de marge](https://www.cmegroup.com/education/articles-and-reports/a-primer-on-margining-styles-for-options).

## PR 5 — volatilité sur la chaîne chargée

La vue web présente smile, Greeks, structure par échéance et skew 25Δ à partir des contrats effectivement chargés. Les séries regroupent marché, sous-jacent, contrat à terme et échéance ; les strikes ambigus sont exclus des calculs. Le skew utilise les observations les plus proches de ±0,25 delta dans une tolérance de 0,10, sans interpolation ni choix arbitraire en cas d'égalité. La structure ATM exige un prix de sous-jacent pertinent : elle n'est pas estimée pour les matières premières à partir du prix générique de la racine. Les valeurs manquantes restent absentes. Les lignes du graphique relient les points et ne sont pas des observations supplémentaires.

L'IV et les Greeks peuvent provenir du fournisseur ou d'un modèle : leur origine détaillée par contrat n'est pas disponible et l'interface le signale. L'instantané et son état périmé sont affichés ; ils ne prouvent ni la fraîcheur de chaque cotation ni la couverture du marché. Le calendrier existant de résultats est filtré sur le titre et indique sa source, ses limites et son éventuel état périmé. La comparaison des dates UTC avec la date d'échéance est indicative : l'heure et le fuseau de l'échéance ne sont pas fournis. Aucun impact futur n'est estimé. Un calendrier propre aux matières premières et la validation sur données de marché autorisées restent à réaliser. Les tests et captures utilisent des contrats et événements synthétiques explicitement identifiés.

## PR 6 — screener de la chaîne chargée

Le screener web filtre les contrats de l'instantané affiché par identifiant ou strike, type, échéance, volume et intérêt ouvert minimaux. Il trie par échéance, volume ou intérêt ouvert et permet d'ajouter un contrat au constructeur de stratégie. La heatmap représente les volumes et intérêts ouverts individuels relativement aux résultats filtrés ; les valeurs absentes ne deviennent pas zéro et leur tri les place après les valeurs connues. La source et le caractère différé des contrats ainsi que l'état périmé de l'instantané sont affichés. Les résultats sont limités à 100 lignes visibles ; le nombre total est indiqué et le tableau mobile défile horizontalement.

Ce screener ne recherche pas encore dans l'ensemble des sous-jacents : il travaille uniquement sur la chaîne chargée. Une recherche multi-chaînes nécessite une couverture fiable, des limites d'accès et des droits fournisseurs vérifiés ; elle reste à réaliser. Les tests et captures utilisent des contrats synthétiques.

## PR 7 — suivi local de positions et rappels visibles

Le suivi web permet de sélectionner un contrat chargé, saisir une position, vérifier la date et le fuseau d'échéance, la devise, le multiplicateur et le paiement initial de la prime, puis enregistrer ou retirer la position. Les données restent dans le stockage de ce navigateur. Un rappel d'échéance s'affiche pendant que la page est ouverte ; ce n'est ni une notification en arrière-plan ni une synchronisation avec un compte ou un courtier. Un contenu local non reconnu n'est pas écrasé. Le flux initial affiché est une estimation, hors frais, financement, change et fiscalité. Les cotations ne sont montrées que si la chaîne chargée contient une correspondance unique de l'identité complète ; leur état différé et celui de l'instantané sont indiqués.

Une position peut être ajoutée au constructeur existant pour simuler son résultat théorique à l'échéance ; la devise et l'instant d'échéance doivent correspondre aux données enregistrées. Le lancement du calcul transmet les jambes et les hypothèses à l'API Anatole. La valeur actuelle, le risque global, la marge, le règlement, l'exercice et l'assignation ne sont pas calculés. Le stockage local n'offre pas de synchronisation multi-appareils ni de résolution transactionnelle entre onglets. Une intégration sécurisée au portefeuille de compte, des alertes persistantes en arrière-plan, la valorisation et les risques complets restent à construire ; ce lot doit rester en brouillon. Les parcours automatisés utilisent des contrats synthétiques.

## PR 8 — premier lien vers l'assistant et les autres espaces

Le tiroir Anatole Assistant est accessible depuis Options et reconnaît cet espace. Il répond de manière déterministe à des questions générales sur les options, les sensibilités et la volatilité implicite, sans consulter les positions, la chaîne ou les scénarios et sans appeler de fournisseur de génération pour ces réponses. Depuis `/options`, les positions locales ne sont pas jointes aux requêtes de l'assistant, même si le contexte est retiré. L'interface précise cette limite et propose des liens vers le sous-jacent dans Focus lorsque son symbole est valide, ainsi que vers Portefeuille. Le suivi local d'options n'est pas synchronisé avec Portefeuille.

Les réponses ne constituent pas une analyse du contrat ou des positions. Une analyse contextualisée à partir de données de marché autorisées, l'intégration aux positions du compte avec consentement adapté, le retour depuis Focus et l'application mobile native restent à développer et à vérifier. Les tests web utilisent une chaîne synthétique et le véritable endpoint de l'assistant ; un test API vérifie également la réponse déterministe.
