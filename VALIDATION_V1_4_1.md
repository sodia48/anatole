# Validation Anatole v1.4.1

Validation locale :

- compilation Python des nouveaux modules : OK;
- tests unitaires du filtre essentiel : préparés;
- rejet explicite de l'agenda politique : couvert;
- rejet explicite de Listeria / rappels alimentaires : couvert;
- acceptation PIB / emploi / IPC : couverte;
- rejet d'un investissement gouvernemental vague : couvert;
- source Québec prioritaire : Statistique Québec;
- source Ontario prioritaire : Ontario Economic Accounts;
- source menu TypeScript : syntaxe contrôlée statiquement;
- aucune clé API ajoutée;
- aucune migration PostgreSQL;
- aucun remplacement du service v1.3.9 complet.

Validation réseau finale :

Les pages officielles doivent être testées depuis Render après déploiement,
car l'accès HTTP peut être traité différemment selon l'hébergeur. En cas
d'échec d'une source provinciale, le flux national Statistique Canada reste le
filet de sécurité.
