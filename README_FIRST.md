# Anatole v1.3.9 — Économie des provinces canadiennes

## Objectif

Actualités et Calendrier deviennent réellement régionaux, tout en conservant
le contexte national canadien.

## Nouveau filtre Région

Les deux sections proposent désormais :

- Toutes
- Canada
- Québec
- Ontario
- Colombie-Britannique
- Alberta
- Saskatchewan
- Manitoba
- Nouveau-Brunswick
- Nouvelle-Écosse
- Île-du-Prince-Édouard
- Terre-Neuve-et-Labrador

Quand une province est sélectionnée, Anatole affiche :

1. les publications explicitement liées à cette province;
2. les indicateurs nationaux qui contiennent normalement une ventilation
   provinciale;
3. les publications nationales communes utiles au contexte canadien.

## Actualités

La couverture existante de Statistique Canada et de la Banque du Canada est
conservée.

Anatole ajoute aussi des fils gouvernementaux provinciaux officiels lorsque
des flux RSS stables sont disponibles dans la langue active.

Dans cette version, des flux directs sont intégrés pour :

- Québec;
- Saskatchewan;
- Nouvelle-Écosse;
- Île-du-Prince-Édouard;
- Colombie-Britannique;
- Terre-Neuve-et-Labrador.

Pour préserver la règle bilingue d'Anatole, un flux provincial anglais n'est
pas injecté dans l'édition française. En français, Statistique Canada fournit
la couverture régionale commune aux dix provinces, complétée par les sources
provinciales françaises disponibles.

Les fils provinciaux sont filtrés afin de conserver les thèmes économiques :
finances publiques, investissement, travail, commerce, énergie et ressources,
logement/construction et comptes économiques.

Chaque source provinciale directe est limitée aux 12 publications économiques
les plus récentes et dispose d'un délai maximal de 8 secondes, afin qu'une
source provinciale lente ne bloque pas les nouvelles fédérales.

## Calendrier

Le calendrier s'appuie sur les publications officielles déjà utilisées par
Anatole.

Les événements sont maintenant associés aux régions concernées.

Exemples :

- « Enquête sur la population active » -> Canada + les 10 provinces;
- « IPC » / commerce de détail / commerce de gros / permis de bâtir ->
  Canada + les 10 provinces;
- « PIB du Québec » -> Québec;
- annonce du taux directeur de la Banque du Canada -> Canada.

Ainsi, sélectionner Québec, Ontario ou Alberta garde les événements communs
au Canada tout en faisant ressortir ceux qui concernent la province.

## Interface

Chaque carte possède une indication régionale :

- Canada
- Québec
- Ontario
- Canada + provinces
- etc.

Les libellés suivent la préférence Français / English d'Anatole.

## Déploiement

Cette version touche Render et Vercel.

1. Décompresser le PATCH à la racine du dépôt.
2. Commit et push sur `main`.
3. Déployer Render en premier.
4. Vérifier `/ready`.
5. Déployer Vercel ensuite.
6. Désactiver `Use existing Build Cache` pour ce déploiement.

Aucune migration PostgreSQL n'est nécessaire.

## Vérification rapide

Actualités :
1. choisir `Région -> Québec`;
2. vérifier que les publications Québec apparaissent avec les nouvelles
   canadiennes communes;
3. essayer Ontario, Alberta et Colombie-Britannique.

Calendrier :
1. choisir une province;
2. vérifier que les indicateurs à ventilation provinciale restent visibles;
3. revenir à `Toutes` pour retrouver l'ensemble du calendrier.
