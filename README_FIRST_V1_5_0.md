# Anatole v1.5.0 — Province-first Macro Engine

Cette version corrige le problème de fond visible dans Actualités et Calendrier.

## Ancienne logique

Une province sélectionnée conservait :

- les éléments directement provinciaux;
- de nombreux indicateurs `Canada + provinces`;
- du contexte Canada.

Résultat : Québec pouvait afficher surtout des publications nationales et des
communiqués gouvernementaux sans valeur macro.

## Nouvelle logique

Quand l'utilisateur choisit une province, Anatole passe en **mode province-first**.

Le corps principal affiche :

1. les publications économiques/statistiques officielles de la province;
2. les calendriers provinciaux directs quand ils existent;
3. un fallback Statistique Canada uniquement pour les diffusions essentielles
   qui comportent réellement une donnée provinciale;
4. aucune publication nationale générique dans la liste principale.

## Sources couvertes

- Québec — Statistique Québec
- Ontario — Ontario Economic Accounts / Ministry of Finance
- Colombie-Britannique — BC Stats
- Alberta — Alberta Economic Dashboard / OSI
- Saskatchewan — Saskatchewan Bureau of Statistics
- Manitoba — Manitoba Bureau of Statistics / Manitoba Finance
- Nouveau-Brunswick — Economic Dashboard / Finance
- Nouvelle-Écosse — Economics and Statistics
- Île-du-Prince-Édouard — Economics and Statistics / Finance
- Terre-Neuve-et-Labrador — Statistics Agency

Statistique Canada reste un filet de sécurité transparent pour les indicateurs
provinciaux communs.

## Installation

1. Décompresser à la racine du dépôt.
2. Lancer :

```bash
python tools/install_provincial_macro_v1_5_0.py
```

3. Lire `FRONTEND_INTEGRATION_V1_5_0.md`.
4. Lancer les tests backend.
5. Commit + push.
6. Render d'abord.
7. Vérifier les endpoints provinciaux.
8. Vercel ensuite sans ancien Build Cache.

Aucune clé API n'est ajoutée.
Aucune migration PostgreSQL n'est requise.
