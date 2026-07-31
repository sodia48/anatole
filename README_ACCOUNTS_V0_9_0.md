# Anatole v0.9.0 — Comptes et synchronisation

Anatole reste entièrement utilisable sans compte. Le compte ajoute uniquement
la restauration et la synchronisation de l'espace utilisateur sur plusieurs
appareils.

## Données synchronisées

- Watchlist;
- Portefeuille de suivi;
- règles d'alertes;
- préférences d'affichage;
- univers TSX 60 ou Composite;
- titres du Comparateur;
- profil Anatole Conseil.

Aucun identifiant bancaire, numéro de compte, mot de passe bancaire ou pièce
d'identité n'est demandé.

## Fonctionnement

1. L'utilisateur continue d'utiliser Anatole localement.
2. Lors de la première connexion, les données locales sont fusionnées avec le
   compte distant.
3. Les modifications locales sont détectées environ toutes les cinq secondes.
4. Les autres appareils sont interrogés environ toutes les 45 secondes.
5. Un numéro de révision empêche qu'un appareil écrase silencieusement une
   version plus récente.
6. En cas de conflit, Anatole fusionne les listes et conserve les modifications
   locales pour les éléments portant le même symbole ou identifiant.

## Sécurité

- mots de passe dérivés avec `scrypt` et un sel aléatoire;
- jetons de session aléatoires conservés uniquement sous forme hachée dans la
  base;
- jeton navigateur placé dans un cookie `HttpOnly`, `SameSite=Lax` et `Secure`
  en production;
- limitation des tentatives répétées de connexion;
- fermeture de la session courante ou de toutes les sessions;
- compte optionnel et mode local toujours disponible.

## Stockage durable obligatoire en production

Le mode SQLite par défaut sert au développement local. Sur Render, utilisez une
base PostgreSQL durable ou un disque persistant, puis définissez :

```text
ACCOUNT_DATABASE_URL=postgresql+psycopg://...
```

`DATABASE_URL` est également accepté.

La route `/ready` indique :

```json
{
  "account_storage": {
    "status": "ready",
    "mode": "postgresql",
    "durable": true
  }
}
```

Ne lancez pas une bêta multiappareil tant que `durable` ne vaut pas `true`.

## Limites actuelles

La v0.9.0 ne comprend pas encore :

- vérification du courriel;
- récupération d'un mot de passe oublié;
- suppression autonome du compte;
- alertes exécutées côté serveur lorsque l'application est fermée.

Ces éléments sont prévus pour la phase suivante.
