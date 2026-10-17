# Fundamental Intelligence 360 — architecture et livraisons

## Audit du socle (main `142c3dea`, 15 octobre 2026)

- `FundamentalSnapshot` porte les états annuels et trimestriels, TTM, ratios de synthèse, consensus, estimations, documents officiels et provenance par période. Le service `FundamentalsService` conserve un dernier instantané fiable pendant l'actualisation.
- Les publications officielles sont découvertes et normalisées par `issuer_documents` / `official_financials`. Le parseur ne garantit pas encore un repère de page ni un extrait vérifiable pour chaque chiffre.
- `stock_sector_analysis` fournit seulement certains ratios bancaires explicitement publiés. Les autres secteurs ne possèdent pas encore de registre d'indicateurs sourcés.
- Les vues Focus Tableau, Cartes et Graphiques existent sur web et mobile. Le moteur de graphiques V3 gère dates réelles, unités, comparaison multi-indicateurs et préférences.
- Les alertes existantes savent évaluer des seuils techniques et quelques événements; les alertes fondamentales nécessitent une observation antérieure sourcée et une clé de déduplication.
- L'assistant dispose déjà d'un orchestrateur et de garde-fous financiers. Aucun calcul nouveau ne doit être refait dans un prompt.
- Les pages institutionnelles décrivent des capacités de recherche, mais le dépôt ne fournit pas encore de modèle d'organisation et de permissions couvrant la collaboration sur des analyses privées. Les faits publics peuvent être partagés; les annotations et exports d'organisation exigeront un contrôle d'accès explicite avant activation.

## Contrat analytique partagé

Le service FastAPI `fundamental_intelligence` est la seule source des ratios, diagnostics, comparaisons et simulations. Chaque observation doit transporter sa valeur, son unité, sa période, son état (publié, calculé, scénario), son document/source et les données utilisées dans sa formule. Une valeur manquante reste `null` avec une raison explicite. Les calculs refusent de mélanger devises, fréquences ou définitions comptables incompatibles. Les interfaces web, mobile et institutionnelle consomment ce même contrat; l'assistant cite les observations retournées par le service.

Les scores sont **dimensionnels**. Ils nécessitent une couverture minimale documentée et des bornes propres au modèle économique. Aucun score global n'est émis lorsque la couverture est insuffisante. Une banque n'hérite pas des seuils d'endettement ou de liquidité d'une entreprise non financière. Les comparaisons et les simulations sont distinctes des faits publiés.

## Série de PR

1. **Moteur et diagnostic 360°** : registre de métriques, calculs purs, provenance, couverture, synthèse déterministe, endpoint, vues Focus web/mobile, tests des devises et données manquantes.
2. **Pairs et profils sectoriels** : sélection vérifiable de pairs, échantillon minimal avant médiane/classement, métriques officielles banques et registre extensible pour mines, REIT, assurances, technologie et industrie.
3. **Scénarios et valorisation** : prudent/central/optimiste, hypothèses bornées, sensibilité et DCF/comparables seulement si les prérequis financiers et sectoriels sont satisfaits.
4. **Documents et provenance** : recherche et comparaison dans les rapports officiels, extraits avec page lorsque la source le permet, changements et retraitements vérifiables.
5. **Capital et analystes** : pont de l'allocation de capital, conversion en trésorerie et révisions uniquement si un historique de publications existe.
6. **Surveillance fondamentale** : règles et événements sourcés, seuils/fréquence personnalisables, historique et déduplication dans l'infrastructure d'alertes.
7. **Assistant et deux profils** : outils de lecture du moteur commun, liens vers les observations, parcours Particulier et Institutionnel; annotations/collaboration privées derrière des permissions d'organisation.
8. **Intégration** : tests API, UI et E2E reliant diagnostic, pairs, scénario, document, alerte et assistant; revue des licences et budgets de performance.

Chaque PR est testable séparément et ne modifie pas les règles de protection de `main`. Les PR dépendantes ciblent la branche précédente jusqu'à autorisation de fusion, puis sont réalignées sur `main` dans l'ordre.

## Surveillance fondamentale (PR 6)

- L'utilisateur ajoute explicitement une règle par titre : baisse de marge opérationnelle (points), hausse dette/capitaux propres (points de ratio), baisse du flux disponible (%) ou publication d'un rapport annuel/trimestriel officiel. Les trois seuils et le rappel minimal (1, 7 ou 30 jours) sont personnalisables sur web et mobile.
- Un changement requiert les deux derniers exercices annuels consécutifs (300 à 430 jours), même devise et type de source, liens et dates de dépôt officiels, et une publication récente (90 jours). Les ratios et flux proviennent du diagnostic partagé. Un instantané périmé, une source secondaire, une absence de base positive ou une métrique inadaptée au secteur empêchent le déclenchement.
- L'identifiant d'événement combine titre, période, mesure et document. Le centre de notifications conserve un historique en base, évite de répéter une même publication et respecte le rappel minimal par règle. Les navigateurs et l'application mobile conservent aussi leur état local de déduplication.
- Les révisions de prévisions et de recommandations ne sont pas émises : le fournisseur expose un instantané courant sans historique daté vérifiable. Une « nouvelle information officielle importante » n'est pas déduite automatiquement d'un document sans classification fiable de son contenu.

## Dépendances et limites à ne pas masquer

- Une comparaison sectorielle ne peut déclarer une médiane représentative si trop peu de sociétés comparables ont une même définition et une même période.
- Un document découvert sans extrait paginé ne permet pas d'afficher une citation de page inventée.
- Aucun historique de consensus ou de révisions ne peut être reconstruit à partir de l'instantané courant.
- Une valeur d'entreprise DCF ne peut être assimilée à un cours certain; absence de flux, d'actions, de devise ou de taux cohérent implique « non calculable ».
- Les droits de redistribution des données secondaires doivent être vérifiés avant un export institutionnel commercial.

## Assistant et profils (PR 7)

- Les questions ciblées sur divergence bénéfice/trésorerie, pairs, sensibilité des revenus et changements entre rapports passent par les modules de diagnostic, comparables, scénarios et documents. La réponse déterministe distingue faits publiés, calculs, scénarios et interprétation; l'absence de données est affichée au lieu d'être comblée.
- Une divergence n'est affirmée que si deux exercices consécutifs de même devise montrent réellement un bénéfice en hausse et un flux opérationnel en baisse. Une différence textuelle entre rapports ne devient pas une conclusion comptable.
- Le scénario de revenus requiert un pourcentage et un sens explicites. Il utilise le même choc dans les trois emplacements du simulateur existant, sans DCF ni hypothèse de taux inventée, et signale les sorties incalculables.
- Les actions de l'Assistant ouvrent la vue Focus correspondante par un paramètre `view` strictement autorisé. Les parcours Particulier et Institutionnel partagent les faits publics; le contexte Institutionnel ne transmet que le symbole et la route, jamais le brouillon de thèse.
- Les annotations privées, la collaboration, les approbations d'équipe et les exports redistribuant des données secondaires restent inactifs tant que les permissions d'organisation et les licences ne sont pas établies.
