# Anatole v1.3.8 — Calendrier officiel FR / EN

## Problème corrigé

Dans `Aujourd’hui`, la langue de l’utilisateur était déjà utilisée pour les
Actualités, mais `getCalendarSnapshot()` était encore appelé sans langue.
Le backend Calendrier utilisait également les pages anglaises comme sources
fixes. Résultat : l’interface était française, mais les titres d’événements de
la Banque du Canada restaient en anglais.

## Nouveau comportement

### Français

Anatole récupère directement :

- Statistique Canada : `cal2-fra.htm`
- Banque du Canada : `/medias/evenements-a-venir/`

Exemples attendus :

- `Publication : Enquête auprès des responsables du crédit`
- `Annonce du taux directeur`
- `Publication : Résumé des délibérations`

### English

Anatole conserve :

- Statistics Canada : `cal2-eng.htm`
- Bank of Canada : `/press/upcoming-events/`

## Changements techniques

- `/api/v1/discovery/calendar?lang=fr`
- `/api/v1/discovery/calendar?lang=en`
- caches backend français et anglais séparés;
- derniers événements valides séparés par langue et par source;
- parseur compatible avec `21 août 2026`, `14 août`, `10 h 30`, etc.;
- catégories et niveaux d’importance compatibles avec les titres français;
- jours fériés français de la Banque du Canada exclus du radar;
- la section Calendrier recharge immédiatement au changement de langue;
- `Aujourd’hui` transmet désormais la langue active au calendrier;
- l’ancien snapshot dans l’autre langue est retiré immédiatement au changement
  FR ↔ EN.

## Déploiement

Ce PATCH touche Render et Vercel :

1. décompresser à la racine du dépôt;
2. commit et push sur `main`;
3. déployer Render en premier;
4. déployer Vercel ensuite avec `Use existing Build Cache` désactivé.

Aucune migration PostgreSQL n’est nécessaire.
