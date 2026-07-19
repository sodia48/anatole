# Validation Anatole Platform v0.5

## Backend

- Compilation Python : réussie.
- Tests FastAPI : 14 réussis.
- Screener : 60 titres avec fournisseur de démonstration.
- ETF : au moins 25 entrées et catégories validées.
- Psychologie : score borné de 0 à 100 et cinq composantes validées.
- Actualités et calendrier : contrats API et cache validés sans dépendre d’un réseau externe durant les tests.

## Frontend

- 45 fichiers TypeScript/TSX analysés syntaxiquement avec TypeScript 5.8.3.
- Navigation, recherche et titres de pages mis à jour.
- Le build de production définitif sera exécuté automatiquement par Vercel avec les dépendances du dépôt.

## Limites assumées

- v0.5 couvre le premier bloc Marchés : Screener TSX 60, actualités officielles, calendrier, ETF et psychologie.
- Le TSX Composite complet, les nouvelles inscriptions/IPO et les transactions d’initiés arrivent dans le sous-jalon suivant.
