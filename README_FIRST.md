# Anatole v1.3.1 — IPO et transactions d’initiés

## IPO

Le chargement initial est maintenant déterministe :

- les requêtes précédentes sont annulées proprement;
- l’état de chargement est réinitialisé à chaque collecte;
- la prop `initialTab` est resynchronisée;
- l’ouverture de l’onglet IPO relance immédiatement une collecte lorsque la
  première tentative a échoué ou n’a rien chargé;
- un bouton Réessayer force un rafraîchissement backend;
- les réponses lentes disposent d’un délai adapté.

## Initiés

Le radar canadien est renforcé :

- utilisation prioritaire de `get_insider_transactions()`;
- compatibilité avec plusieurs noms de colonnes yfinance;
- sondage initial de 24 titres, puis jusqu’à 40 si le premier groupe est vide;
- concurrence contrôlée et délai par titre réduit;
- cache vide limité à 90 secondes au lieu de 15 minutes;
- relance forcée depuis l’interface;
- état détaillé de chaque source.

Un résultat non couvert n’est plus présenté comme « 0 transaction ». Anatole
affiche `N/D`, explique que la couverture automatisée n’a rien normalisé et
conserve un lien direct vers SEDI ou EDGAR.

## Déploiement

Cette correction touche le frontend et le backend :

1. installer le PATCH à la racine du dépôt;
2. commit et push sur `main`;
3. déployer Render en premier;
4. déployer ensuite Vercel sans réutiliser le Build Cache;
5. tester IPO dès la première ouverture;
6. tester Initiés Canada puis États-Unis;
7. utiliser « Relancer la collecte » si une source externe a temporairement
   refusé une requête.

Aucune modification PostgreSQL n’est requise.
