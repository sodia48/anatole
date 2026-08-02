# Anatole v0.9.2.1 — commandes du compte visibles

La capture montrait l'ancien frontend du compte : la carte « Sécurité de la
session » suivait immédiatement le contenu synchronisé. Dans la v0.9.2 correcte,
Profil et Mot de passe doivent apparaître avant cette carte.

## Ce correctif rend visibles immédiatement

- Modifier mon nom;
- Changer le mot de passe;
- Exporter mes données;
- Supprimer le compte.

Ces commandes apparaissent maintenant juste sous l'état du compte, avec des
raccourcis explicites. Les formulaires Profil et Mot de passe sont placés avant
le résumé du contenu synchronisé.

## Installation

1. Décompressez le PATCH à la racine du dépôt.
2. Acceptez tous les ajouts et remplacements.
3. Vérifiez dans GitHub que `AccountClient.tsx` contient le texte
   `Modifier mon nom`.
4. Pour la route spéciale, le chemin exact reste :

   apps/web/app/api/account/[...path]/route.ts

   Si Windows refuse le dossier `[...path]`, créez ce fichier dans GitHub avec
   **Add file → Create new file**, puis copiez le contenu de
   `route-account-github.ts`.
5. Committez puis poussez sur `main`.
6. Redéployez uniquement Vercel, sans réutiliser l'ancien Build Cache.

Aucun redéploiement Render ou PostgreSQL n'est requis, à condition que le
backend v0.9.2 soit déjà déployé.
