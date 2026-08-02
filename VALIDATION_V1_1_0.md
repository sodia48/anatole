# Validation Anatole v1.1.0

## Backend

- ........................................................................ [ 78%]
....................                                                     [100%]
92 passed in 3.12s
- compilation Python en mémoire réussie;
- compte ordinaire refusé par les routes administrateur;
- compte administrateur accepté;
- invitation dynamique à usage unique testée;
- réutilisation du code refusée;
- signalement persisté et classé Résolu.

## Frontend

- TypeScript syntax OK: 8 files
- tous les imports locaux sont résolus;
- feuille CSS de la console équilibrée;
- proxy administrateur protégé par le cookie HttpOnly existant;
- entrée Console bêta réservée aux administrateurs.

## Limite

Le véritable `next build` et Playwright n'ont pas été exécutés localement,
car les dépendances Node complètes ne sont pas installées. GitHub Actions et
Vercel effectueront la compilation définitive.
