# Validation Anatole v1.5.0

Contrôles locaux du paquet :

- compilation Python des nouveaux modules : OK;
- registre : 10 provinces : OK;
- alias français/anglais : couverts;
- agenda politique : rejeté;
- Listeria/rappel alimentaire : rejeté;
- IPC : accepté;
- emploi/chômage : accepté;
- calendrier Statistique Québec : parseur testé;
- calendrier Ontario Economic Accounts : parseur testé;
- calendrier Saskatchewan 2026-27 : intégré;
- fallback Statistique Canada : seulement événements à ventilation provinciale;
- ventes de véhicules automobiles : non provincialisées;
- opérations internationales en valeurs mobilières : non provincialisées;
- composant frontend province-first : ajouté;
- aucune clé API;
- aucune migration de base de données.

La validation réseau réelle doit être faite depuis Render, parce que les
sources publiques peuvent appliquer des politiques réseau différentes selon
l'hébergeur.
