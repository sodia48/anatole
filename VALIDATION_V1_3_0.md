# Validation Anatole v1.3.0

## Backend

- 97 tests FastAPI réussis;
- 0 échec;
- compilation Python complète réussie;
- préférences persistantes testées;
- notification lue/non lue testée;
- validation du fuseau horaire testée;
- livraison de test refusée proprement sans SMTP;
- cadence quotidienne testée avec un faux expéditeur;
- un seul envoi autorisé par journée locale;
- export et suppression des notifications testés.

## Frontend

- syntaxe TypeScript contrôlée sur 6 fichiers modifiés;
- contrôle TypeScript strict ciblé réussi pour :
  - la page Notifications;
  - le proxy Next.js;
  - la bibliothèque de notifications;
- tous les imports locaux du frontend sont résolus;
- feuille CSS équilibrée;
- affichage responsive sans défilement horizontal obligatoire.

## Limites

- aucun vrai courriel n’a été envoyé pendant la validation;
- l’expéditeur SMTP a été remplacé par un faux service dans les tests;
- le build Next.js complet n’a pas été exécuté localement, car les dépendances
  Node complètes ne sont pas installées dans l’environnement de génération;
- Vercel effectuera le build final.
