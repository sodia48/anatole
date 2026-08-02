# Déploiement Anatole v0.9.3

1. Installer le PATCH à la racine du dépôt.
2. Vérifier que ce fichier existe :
   `apps/web/components/settings/SettingsHubClient.tsx`
3. Commit et push sur `main`.
4. Dans Vercel, lancer un nouveau déploiement.
5. Désactiver `Use existing Build Cache`.

## Tests après déploiement

Ouvrir :

- `/parametres?section=account`
- `/parametres?section=preferences`
- `/parametres?section=quality`

Vérifier aussi que :

- `/compte`
- `/preferences`
- `/qualite`

redirigent correctement.

Aucun redéploiement Render ou PostgreSQL n'est requis.
