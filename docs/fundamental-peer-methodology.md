# Comparaison des pairs et métriques sectorielles

## Sélection des pairs

La sélection automatique part des positions publiées de XIC (univers canadien). Si cette liste est indisponible, l'instantané XIU du 16 juillet 2026 sert de repli, avec sa date affichée. L'utilisateur peut remplacer ou retirer des pairs parmi les candidats du même grand secteur. Huit pairs au plus sont interrogés par comparaison.

Un candidat n'entre dans les résultats qu'après vérification de son instantané : même famille d'activité, même industrie pour les banques, assurances, mines et REIT lorsque les deux libellés sont disponibles, capitalisation comprise entre 0,2 et 5 fois celle de la cible, et même devise de capitalisation. Une donnée de taille ou de devise absente exclut le pair; le motif est retourné et affiché. Le poids du titre dans XIC sert seulement à ordonner les candidats, jamais à estimer sa capitalisation.

Les ratios annuels proviennent du moteur `fundamental_intelligence`. Les observations comparées appartiennent à la même année civile et leurs fins d'exercice sont espacées d'au plus 210 jours. Les multiples de valorisation proviennent uniquement d'instantanés `quoteSummary` séparés de moins de 24 heures; leur source est marquée secondaire. Une métrique absente, une période incompatible ou une définition non établie ne produit pas de valeur de comparaison.

La médiane et le rang n'apparaissent qu'avec au moins six sociétés admissibles, cible incluse. Le rang suit la valeur numérique décroissante; il ne mesure pas la qualité de l'entreprise ni son attrait d'investissement. Aucun pair n'est assimilé automatiquement à un concurrent direct.

## Métriques sectorielles

Le registre `stock_sector_analysis` reconnaît des libellés explicites dans les publications officielles pour les banques, mines aurifères, REIT, assurances, technologies et industries. Il exige une unité lisible, une occurrence non ambiguë dans le document et une URL HTTPS. Une ligne absente ou répétée reste indisponible. Une publication peut fournir sa date de dépôt; cette date n'est jamais transformée en date de clôture de l'exercice. Le parseur examine au plus deux documents non bancaires dans le budget existant.

Ces métriques sont affichées avec la source et l'unité dans le diagnostic Focus. Le registre est volontairement extensible; une métrique non publiée reste `N/D`. Les ratios génériques de liquidité et d'endettement ne sont pas appliqués aux banques et assurances.
