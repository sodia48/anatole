# Anatole — Search Fix v4.2.2

Ce correctif rend le bouton **Recherche** réellement fonctionnel sur mobile et ordinateur.

## Ce qui est corrigé

- le bouton loupe ouvre maintenant une vraie fenêtre de recherche;
- le bouton « Rechercher » dans la barre latérale ouvre la même fenêtre;
- `Ctrl + K` et `⌘ + K` ouvrent la recherche;
- saisie d’un symbole comme `RY`, `SHOP` ou `MDA` → ouverture directe de la page Focus;
- recherche des sections : Cockpit, Screener, Actualités, Calendrier, ETF, IPO & insiders, Psychologie, Watchlist et Préférences;
- navigation clavier avec ↑, ↓ et Entrée;
- fermeture avec Échap, le bouton X ou un clic à l’extérieur.

## Fichiers à remplacer

- `apps/web/components/layout/AppSidebar.tsx`
- `apps/web/components/layout/AppSidebarGuard.module.css`

Les autres fichiers du ZIP sont repris de la version d’urgence v4.2.1 afin de permettre une installation complète si nécessaire.

## Déploiement

1. Copier le dossier `apps/` à la racine du dépôt.
2. Commit et push.
3. Vercel → Redeploy.
4. Désactiver `Use existing Build Cache`.
5. Rechargement forcé du navigateur.

Aucun changement Render ou FastAPI n’est requis.
