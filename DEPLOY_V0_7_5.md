# Déploiement v0.7.5

1. Décompressez `Anatole_Mobile_Focus_v0_7_5_PATCH.zip` à la racine du dépôt.
2. Acceptez le remplacement des fichiers.
3. Committez et poussez sur `main`.
4. Dans Vercel, lancez un nouveau déploiement.
5. Désactivez `Use existing Build Cache` pour ce premier déploiement.
6. Testez `/cockpit` puis une fiche `/focus/RY` depuis un téléphone.

## Vérifications attendues

### Cockpit

- `60/60 titres visibles`;
- tous les secteurs sont contenus au-dessus du dock;
- aucun défilement vers le bas n'est nécessaire pour finir la carte;
- chaque case montre le symbole et la variation.

### Focus

- la période LIVE est sélectionnée à l'ouverture;
- le graphique indique une actualisation chaque seconde;
- aucun glissement horizontal n'est nécessaire;
- les onglets, périodes, Technique et Niveaux clés tiennent dans l'écran.

## Déploiement backend

Aucun redéploiement Render n'est requis : le rafraîchissement d'une seconde
est réalisé côté graphique avec la dernière cotation reçue, afin de ne pas
réintroduire les surcharges API 502.
