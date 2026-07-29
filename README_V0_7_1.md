# Anatole v0.7.1 — Anatole Conseil

Cette version transforme l'ancienne section Assistant en un copilote financier de planification, sans recommandation de placement.

## Ce que fait Anatole Conseil

- construit un profil de décision local : objectif, horizon, liquidité, stabilité et confort face aux baisses;
- calcule un score de préparation et un profil de capacité de risque;
- projette trois scénarios illustratifs à 0 %, 3 % et 6 %;
- mesure l'écart à l'objectif sans promettre de rendement;
- analyse la réserve liquide, les contraintes de dette et la cadence de contribution;
- réutilise le Portefeuille local pour mesurer concentration, risque et stress tests;
- ordonne les priorités de planification;
- répond en conversation sur les objectifs, les scénarios, le risque et la qualité des données;
- conserve le profil dans le navigateur. Le profil est seulement transmis à l'API le temps du calcul et n'est pas persisté côté serveur.

## Garde-fous obligatoires

Anatole Conseil refuse les demandes qui cherchent à obtenir :

- un titre ou un ETF à acheter;
- une instruction de vente ou de maintien;
- le « meilleur placement »;
- une sélection personnalisée de produits;
- une décision de transaction.

À la place, il fournit un cadre de décision, des faits observables, des scénarios et des tests de risque.

## Données

Aucune nouvelle clé d'API n'est requise. Le moteur repose sur les services Anatole déjà déployés et le Portefeuille local.
