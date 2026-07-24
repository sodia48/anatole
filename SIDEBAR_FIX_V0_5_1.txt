ANATOLE — Correctif final IPO & insiders v0.5.1
================================================

MODIFICATIONS EXACTES

1. components/layout/AppSidebar.tsx

   Ancienne entrée :
   { href: "/roadmap#ipo", label: "IPO & insiders", icon: Database, available: false },

   Nouvelle entrée :
   { href: "/ipo-insiders", label: "IPO & insiders", icon: Database, available: true },

2. apps/web/components/layout/AppSidebar.tsx

   Même modification.

RÉSULTAT

- Le bouton ouvre /ipo-insiders.
- Le badge BIENTÔT disparaît.
- L'entrée devient cliquable.
- Les deux copies du sidebar restent synchronisées.

APPLICATION

Option Git :
    git apply ipo_insiders_sidebar_fix.patch

Option script :
    python apply_ipo_insiders_sidebar_fix.py

Le script doit être lancé à la racine du dépôt Anatole. Il crée une sauvegarde
.bak de chaque fichier avant de l'écrire.

DÉPLOIEMENT

1. Commit et push.
2. Vercel : Redeploy.
3. Désactiver l'utilisation de l'ancien Build Cache.
4. Recharger Anatole avec Ctrl + Shift + R.
5. Ouvrir /ipo-insiders.
