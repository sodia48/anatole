# Anatole v1.4.1 — Essentiel économique provincial

Ce correctif répond au problème visible dans le fil macro : une vue Québec ne
doit pas être remplie par des communiqués gouvernementaux génériques.

## Ce qui change

- Statistique Québec devient la source provinciale no 1 pour Québec.
- Ontario Economic Accounts devient la source provinciale no 1 pour Ontario.
- Gouvernement du Québec est conservé, mais seulement pour les publications
  économiquement matérielles.
- Les agendas politiques, rappels alimentaires, alertes sanitaires et contenus
  non macro sont rejetés.
- Le mot `investissement` seul ne suffit plus pour faire entrer un communiqué.
- Le menu Source devient dynamique selon la province.
- Les principales agences statistiques provinciales sont référencées pour les
  10 provinces.
- Les statistiques v1.4.0 restent compatibles.

## Installation

Lire `INTEGRATION_V1_4_1.md`.

Ce paquet est volontairement additif : il ne remplace pas le service Actualités
v1.3.9 complet, car ce dernier contient déjà la logique régionale validée.
