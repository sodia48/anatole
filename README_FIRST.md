# Anatole v1.3.7 — Actualités officielles FR / EN

## Résultat

Quand Anatole est en français, les cartes d'actualités utilisent maintenant
les publications officielles françaises plutôt que de conserver le contenu
anglais.

Le changement FR ↔ EN provoque un nouveau chargement immédiatement. L'ancienne
édition est retirée pendant la requête afin qu'un utilisateur en mode français
ne continue pas à voir des nouvelles anglaises jusqu'au prochain cycle.

## Sources en français

- Statistique Canada :
  `https://www150.statcan.gc.ca/n1/rss/dai-quo/0-fra.atom`
- Banque du Canada — nouvelles :
  `https://www.banqueducanada.ca/utility/nouvelles/feed/`
- Banque du Canada — communiqués :
  `https://www.banqueducanada.ca/content_type/communiques/feed/`

## Sources en anglais

Les flux officiels anglais existants sont conservés.

## Architecture

- `GET /api/v1/discovery/news?lang=fr`
- `GET /api/v1/discovery/news?lang=en`
- cache backend séparé pour FR et EN;
- dernier instantané valide séparé pour FR et EN;
- relais Statistique Canada sensible au paramètre `lang`;
- classification StatCan compatible avec les termes français;
- Actualités recharge immédiatement au changement de langue;
- Aujourd'hui recharge immédiatement son bloc Actualités au changement de
  langue.

Il ne s'agit pas d'une traduction automatique des articles : lorsque la source
publique fournit une version française officielle, Anatole récupère directement
cette version.

## Déploiement

Ce correctif touche Render et Vercel.

1. Décompresser le PATCH à la racine du dépôt.
2. Commit et push sur `main`.
3. Déployer Render en premier.
4. Déployer Vercel ensuite.
5. Sur Vercel, désactiver `Use existing Build Cache`.

Aucune migration PostgreSQL n'est nécessaire.

## Test manuel conseillé

1. Ouvrir Anatole en English.
2. Aller dans Actualités et confirmer que les publications sont anglaises.
3. Passer dans `Compte & paramètres → Préférences → Français`.
4. Revenir dans Actualités.
5. Les anciennes cartes anglaises doivent disparaître immédiatement pendant le
   chargement, puis être remplacées par les publications officielles françaises.
6. Vérifier aussi `Aujourd'hui` : les actualités de la zone
   `Ce qui mérite l'attention` doivent provenir de l'édition française.
