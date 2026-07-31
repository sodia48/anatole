# Validation Anatole v0.9.0

## Backend

- suite FastAPI complète : **87 tests réussis, 0 échec**;
- inscription, connexion, fermeture de session et fermeture globale validées;
- mot de passe incorrect et compte en double validés;
- isolation entre deux comptes validée;
- synchronisation du workspace validée;
- conflit de révision HTTP 409 validé;
- restauration de Watchlist, Portefeuille, Alertes et préférences validée;
- `/ready` confirme l'état du stockage de compte;
- compilation Python réussie.

## Frontend

Contrôle syntaxique TypeScript réussi sur **23 fichiers**, notamment :

- relais de compte Next.js;
- AccountProvider;
- page Compte;
- synchronisation locale/distante;
- Sidebar, recherche et préférences;
- Watchlist, Portefeuille, Alertes, Comparateur, Cockpit et Anatole Conseil;
- parcours Playwright de création et d'import local.

## CSS

- `globals.css` : accolades équilibrées;
- `mobile.css` : accolades équilibrées;
- `Account.module.css` : accolades équilibrées.

## Sécurité contrôlée

- le jeton n'est pas accessible au JavaScript du navigateur;
- cookie HttpOnly et SameSite;
- mot de passe haché avec scrypt;
- jeton stocké haché côté serveur;
- limitation des tentatives répétées;
- aucune donnée bancaire demandée.

## Limite de validation

Le véritable `next build` et les navigateurs Playwright n'ont pas été lancés
dans cet environnement, faute de `node_modules`. Le workflow GitHub v0.8
exécutera le typecheck, le build Next.js et Playwright avant la production.
