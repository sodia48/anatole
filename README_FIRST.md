# Anatole v1.3.6 — Français / English

## Changements

- Suppression de la mention « relayé(s) par Vercel » dans Actualités et Calendrier.
- Nouvelle préférence globale `Français / English`.
- La langue est conservée dans le navigateur.
- La langue est incluse dans la synchronisation du compte Anatole.
- `html lang` et `data-language` suivent automatiquement la préférence.
- Navigation desktop et mobile bilingue.
- Recherche Anatole bilingue.
- Centre Compte & paramètres bilingue.
- Écran Préférences bilingue.
- Actualités bilingues.
- Calendrier bilingue.
- Formats de dates français-canadien / anglais-canadien.

## Contenu officiel

Les titres, résumés et descriptions provenant directement d’une institution
publique restent dans la langue publiée par la source. Anatole traduit son
interface, pas le contenu éditorial officiel.

## Où changer la langue

`Compte & paramètres → Préférences → Langue d’Anatole`

Choix :
- Français (FR)
- English (EN)

## Déploiement

Cette version touche le frontend et le backend :

1. Installer le PATCH à la racine du dépôt.
2. Commit et push sur `main`.
3. Déployer Render en premier.
4. Déployer Vercel ensuite, sans réutiliser le Build Cache.

Aucune migration PostgreSQL n’est requise. Le nouveau champ de préférence
utilise `fr` par défaut pour les comptes existants.
