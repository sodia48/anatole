# Anatole v1.1.0 — Console de bêta et opérations

Cette version ajoute un espace administrateur privé à `/admin`.

## Fonctions

- tableau de bord de santé et d'utilisation;
- liste des comptes bêta et de leurs dernières activités;
- génération de codes d'invitation à usage limité;
- expiration et révocation des invitations;
- signalements bêta persistés dans PostgreSQL;
- classement des signalements : Nouveau, En analyse, Résolu;
- accès administrateur déterminé par l'adresse courriel;
- aucun mot de passe, jeton ou contenu détaillé de portefeuille affiché.

## Sécurité

La console exige une session Anatole valide et un courriel présent dans :

`ACCOUNT_ADMIN_EMAILS`

Exemple :

`ACCOUNT_ADMIN_EMAILS=mon-compte@exemple.ca`

Plusieurs courriels peuvent être séparés par des virgules.

Les codes générés par la console sont stockés uniquement sous forme hachée.
Le code complet est affiché une seule fois après sa création.

## Invitations

Les anciens codes définis dans `ACCOUNT_INVITE_CODES` restent compatibles.
Les invitations créées dans `/admin` peuvent être :

- à usage unique ou multiple;
- limitées de 1 à 100 utilisations;
- expirables de 1 à 365 jours;
- révoquées immédiatement.

Dès qu'une invitation administrée existe, les inscriptions restent fermées
aux personnes ne possédant pas un code valide, même lorsque les anciens codes
sont épuisés. Cela empêche une réouverture publique accidentelle.

## Signalements

Les nouveaux signalements sont persistés dans la même base PostgreSQL que les
comptes. Ils restent également inscrits dans les logs Render.

Aucune position du portefeuille, quantité, coût moyen, mot de passe ou profil
Anatole Conseil n'est enregistré dans un signalement.
