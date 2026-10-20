# Fundamental Intelligence 360 V4 — audit des doublons

| Information ou fonction | Décision | Emplacement canonique |
| --- | --- | --- |
| Portail de huit modules, onglet « Intelligence 360° », bouton « Synthèse » et sélecteur de module | Fusionner | Quatre espaces : Vue d’ensemble, Comparer, Simuler, Explorer |
| Diagnostic, constats, indices directionnels et métriques sectorielles | Conserver, simplifier | Vue d’ensemble ; calculs, indices et historique dans « Voir les détails » |
| Revenus, bénéfice, marges et flux répétés entre synthèse, diagnostic et capital | Fusionner | Quatre indicateurs disponibles dans la Vue d’ensemble ; séries complètes dans Explorer |
| Comparables et sélection | Conserver | Comparer ; recherche et refus dans un panneau repliable |
| Médiane et rang sans échantillon suffisant | Déplacer vers les détails | Comparer ; seuls les écarts directs restent visibles avec deux ou trois sociétés |
| Hypothèses des trois scénarios exposées simultanément | Déplacer vers les détails | Simuler ; « Personnaliser les hypothèses » |
| Flux de capital et états financiers historiques | Fusionner | Explorer ; synthèse de capital puis tableaux historiques à la demande |
| Consensus analystes dans les vues Capital et Analystes | Fusionner | Présentation canonique dans Capital, accessible depuis Explorer et les anciens liens directs |
| Documents, sources, formules et méthodologie | Conserver, déplacer | Explorer et détails repliables au point d’usage |
| Avertissements et longues listes de N/D | Regrouper | Une section « Données non disponibles » par vue |
| Surveillance et assistant | Déplacer | Actions contextuelles liées au symbole, hors navigation des espaces |

Les services FastAPI, contrats de données, calculs et anciennes valeurs de `?view=` restent en place. Le routage les associe aux quatre espaces sans supprimer les données.
