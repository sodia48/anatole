# Anatole Conseil v0.7.2 — parcours guidé simple

Cette version remplace le grand formulaire du robot-conseiller par un parcours clair en quatre étapes.

## Parcours utilisateur

1. **Ton objectif** — projet, montant cible et horizon.
2. **Ta base** — capital actuel, contribution, dépenses, réserve, dette et stabilité des revenus.
3. **Ton confort** — besoin de liquidité, réaction à une baisse et niveau d’expérience.
4. **Ton plan** — score, trois prochaines étapes, scénarios et détails du risque.

Chaque question explique en langage simple pourquoi l’information est demandée. Les détails techniques et le dialogue avec Anatole restent disponibles, mais ne surchargent plus l’écran principal.

## Limites conservées

Anatole ne choisit aucun titre, ETF ou produit. Il ne formule aucune instruction d’achat, de vente ou de conservation. Il structure le plan, calcule des scénarios et explique les contraintes.

## Données personnelles

Le profil reste enregistré dans le stockage local du navigateur. Il est transmis temporairement à FastAPI pour calculer le plan, mais n’est pas conservé par le serveur.
