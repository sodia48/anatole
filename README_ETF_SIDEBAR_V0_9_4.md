# Anatole v0.9.4 — Carte ETF et sidebar repliable

## Corrections

### Carte ETF

- chaque tuile affiche maintenant au minimum son symbole;
- les petites tuiles affichent également la variation lorsque leur surface le permet;
- les tuiles intermédiaires affichent la variation plus tôt;
- les 172 ETF restent présents;
- la page est strictement contenue dans la largeur disponible;
- la barre de défilement horizontale globale est supprimée.

### Barre latérale

Un bouton placé à côté du logo permet de :

- replier la barre à 82 px;
- la déplier à 248 px;
- conserver le choix après un rechargement;
- agrandir automatiquement l'espace disponible pour la carte ETF.

En mode replié, les icônes restent visibles et les libellés sont disponibles
au survol.

## Installation

1. Décompresser le PATCH à la racine du dépôt.
2. Accepter les remplacements.
3. Commit et push sur `main`.
4. Redéployer uniquement Vercel.
5. Désactiver `Use existing Build Cache`.

Aucun redéploiement Render ou PostgreSQL n'est requis.
