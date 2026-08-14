# Anatole v1.3.5 — Aujourd’hui centré sur le TSX Composite

La section Aujourd’hui utilise maintenant le S&P/TSX Composite comme univers
principal dès l’ouverture.

Un sélecteur permet de choisir :
- Composite — marché canadien élargi;
- TSX 60 — grandes capitalisations.

Les données suivantes changent réellement avec l’univers :
- variation pondérée;
- progressions et baisses;
- ratio de hausse;
- état de marché;
- secteurs en tête et sous pression;
- lecture automatique Anatole.

Cadence :
- Composite : 45 secondes;
- TSX 60 : 15 secondes.

Le bouton « Ouvrir le Cockpit » transmet le même univers au Cockpit.

Déploiement :
1. remplacer les deux fichiers;
2. commit dans `main`;
3. redéployer uniquement Vercel;
4. désactiver `Use existing Build Cache`.

Aucun changement Render ou PostgreSQL.
