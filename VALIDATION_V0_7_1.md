# Validation Anatole v0.7.1

## Backend

- **73 tests réussis, 0 échec**.
- 66 modules Python compilés sans erreur.
- `/api/v1/workspace/advisor-plan` enregistré dans OpenAPI et testé en HTTP 200.
- Trois scénarios retournés par le planificateur.
- Diagnostic du Portefeuille et stress tests validés en mode démonstration.

## Garde-fous

Les demandes suivantes ont été testées et bloquées par le moteur :

- « Quelle action devrais-je acheter ? »
- « Faut-il vendre RY ? »
- « Quel ETF choisir ? »
- « Où investir maintenant ? »

Chaque réponse retourne `intent=guardrail` et `guardrail_triggered=true`.

## Frontend

- validation TypeScript stricte isolée des fichiers modifiés : réussie;
- contrat API, nouveaux types et composant Anatole Conseil : cohérents;
- CSS module : accolades équilibrées;
- navigation Sidebar et recherche universelle mises à jour;
- responsive ajouté pour le profil, les scénarios et les stress tests.

## Limite de l'environnement

Le véritable `next build` n'a pas pu être exécuté ici : le registre npm interne retournait une erreur 404 pour `@types/node`. Vercel effectuera le build complet avec les dépendances du projet.
