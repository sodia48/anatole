# Anatole Mobile v0.7.5

Cette version répond aux deux demandes mobiles prioritaires.

## 1. Cockpit — 60 actions dans une seule treemap

La hauteur de la treemap dépend maintenant de la hauteur réelle du téléphone
via `visualViewport`. Elle ne grandit plus selon le nombre de titres.

Résultat :

- les 60 actions du TSX 60 sont placées dans la même zone;
- aucun secteur ne continue sous le dock mobile;
- le symbole et la variation restent présents dans chaque case;
- les écarts de pondération sont davantage comprimés sur téléphone;
- les en-têtes sectoriels prennent moins de place;
- le zoom secteur et le mode plein écran restent disponibles;
- aucun défilement horizontal n'est introduit.

## 2. Focus — LIVE et largeur complète

Focus s'ouvre désormais sur la période LIVE.

Le graphique :

- redessine la bougie active toutes les secondes;
- utilise le dernier prix reçu par le flux WebSocket;
- respecte l'horodatage de la source;
- ne lance pas une requête Yahoo chaque seconde;
- conserve la synchronisation complète de l'historique toutes les 15 secondes;
- reste ajusté à la largeur du téléphone.

Les onglets Focus et les périodes sont maintenant des grilles qui reviennent
à la ligne. Les cartes Technique, Niveaux clés et Profil sont contraintes à la
largeur disponible.

## Installation

Décompresser le PATCH à la racine du dépôt et accepter les remplacements.

Aucun fichier backend n'est modifié. Un redéploiement Render n'est donc pas
nécessaire.
