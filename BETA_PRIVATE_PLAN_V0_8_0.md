# Plan de bêta privée Anatole v0.8.0

## Durée et groupe

- 14 jours;
- 20 à 30 testeurs;
- majorité d'utilisateurs mobiles;
- mélange d'investisseurs débutants et expérimentés;
- intérêt principal pour les actions et ETF canadiens.

## Parcours demandés

Chaque testeur doit réaliser au moins :

1. Cockpit TSX 60 et Composite;
2. recherche d'une société et ouverture de Focus;
3. filtre dans Screener;
4. ouverture d'un ETF et de ses participations;
5. consultation de Terminal Pro;
6. création d'une alerte locale;
7. ajout d'une position fictive au Portefeuille;
8. production d'un plan Anatole Conseil;
9. signalement d'un problème réel ou d'une amélioration.

## Mesures de sortie

La v0.8 peut être considérée stable lorsque :

- tous les parcours Playwright sont verts;
- aucun débordement horizontal n'est observé à 360, 390 et 430 px;
- le taux HTTP 5xx reste inférieur à 0,5 % sur les routes essentielles;
- la latence p95 reste inférieure à 2,5 secondes hors premier réchauffement;
- aucune section ne devient entièrement vide après une panne temporaire;
- chaque incident reproductible possède un `X-Request-ID`;
- les cinq problèmes les plus fréquents ont une décision documentée.

## Données personnelles

Les testeurs doivent utiliser des positions fictives. Anatole ne demande pas
de numéro de compte, de relevé bancaire, de pièce d'identité ni d'information
fiscale pendant cette phase.
