# Anatole v1.4.0 — Statistiques provinciales dans Actualités et Calendrier

Cette extension est **additive** et part de la logique régionale déjà présente dans
Anatole v1.3.9. Elle ne remplace pas les filtres Région ni les fils provinciaux.

## Ce que le moteur ajoute

Pour chacune des 10 provinces :

- inflation sur 12 mois;
- taux de chômage;
- emploi;
- population;
- PIB réel lorsque la coordonnée officielle est résolue;
- ventes au détail lorsque la coordonnée officielle est résolue;
- mises en chantier lorsque la coordonnée officielle est résolue.

Les quatre premières séries sont prioritaires. Les séries secondaires sont
affichées seulement si le moteur peut résoudre leur coordonnée Statistique Canada
sans ambiguïté.

Chaque valeur expose :

- valeur actuelle;
- valeur précédente;
- variation;
- période de référence;
- date de publication lorsque disponible;
- numéro du tableau Statistique Canada;
- lien vers le tableau officiel;
- lien vers l'organisme statistique provincial.

Le moteur retourne `N/D` / omet la carte plutôt que de deviner une série.

## Source canonique

Les valeurs comparables utilisent le **Web Data Service (WDS) de Statistique
Canada**. Les métadonnées de chaque tableau sont lues dynamiquement afin de
résoudre les coordonnées provinciales; aucun vector ID fragile n'est codé en dur.

Sources provinciales associées :

- Québec — Institut de la statistique du Québec;
- Ontario — Ontario Economic Accounts;
- Colombie-Britannique — BC Stats;
- Alberta — Alberta Economic Dashboard;
- Saskatchewan — Saskatchewan Bureau of Statistics;
- Manitoba — Manitoba Bureau of Statistics;
- Nouveau-Brunswick — gouvernement du Nouveau-Brunswick;
- Nouvelle-Écosse — Nova Scotia Statistics;
- Île-du-Prince-Édouard — PEI Statistics Bureau;
- Terre-Neuve-et-Labrador — Statistics Agency / Economics.

## Fichiers à copier

```text
apps/api/app/schemas/provincial_statistics.py
apps/api/app/services/provincial_statistics.py
apps/api/app/api/routes/provincial_statistics.py

apps/web/components/provincial/ProvincialStatsPanel.tsx
apps/web/components/provincial/ProvincialStatsPanel.module.css
```

## 1. Monter la route FastAPI

Dans le `apps/api/app/api/router.py` **actuel de v1.3.9**, ajoutez
`provincial_statistics` à l'import des routes existantes.

Exemple :

```python
from app.api.routes import (
    # ... routes déjà présentes ...
    provincial_statistics,
)
```

Puis, avec les autres routes de découverte :

```python
api_router.include_router(
    provincial_statistics.router,
    prefix="/api/v1/discovery",
    tags=["discovery"],
)
```

Ne remplacez pas le routeur complet : conservez Account, Admin, Notifications,
Discovery et toutes les routes déjà actives.

### Endpoint obtenu

```text
GET /api/v1/discovery/provincial-statistics?region=QC&lang=fr
GET /api/v1/discovery/provincial-statistics?region=all&lang=fr
```

## 2. Actualités

Dans le client/page Actualités qui possède déjà le filtre `Région`, importez :

```tsx
import { ProvincialStatsPanel } from "@/components/provincial/ProvincialStatsPanel";
```

Juste après la zone de filtres régionaux et avant la liste de nouvelles :

```tsx
<ProvincialStatsPanel
  region={selectedRegion}
  language={language}
  context="news"
/>
```

Si vos variables v1.3.9 portent un autre nom (`region`, `selectedProvince`,
`lang`), utilisez simplement ces variables existantes. Il ne faut pas créer un
deuxième sélecteur de province.

Résultat attendu :

- `Québec` → cartes Québec + liens StatCan/ISQ;
- `Ontario` → cartes Ontario;
- `Toutes` → tableau comparatif des 10 provinces;
- changement FR/EN → libellés et formats adaptés.

## 3. Calendrier

Import identique :

```tsx
import { ProvincialStatsPanel } from "@/components/provincial/ProvincialStatsPanel";
```

Après le filtre `Région` et avant la liste des événements :

```tsx
<ProvincialStatsPanel
  region={selectedRegion}
  language={language}
  context="calendar"
/>
```

Le calendrier conserve les événements à venir de v1.3.9. Le nouveau panneau
montre les **dernières valeurs publiées** pour donner le contexte avant la
prochaine publication.

## 4. Déploiement

### Render

Déployer le backend en premier puis vérifier :

```text
https://anatole-api.onrender.com/ready
https://anatole-api.onrender.com/api/v1/discovery/provincial-statistics?region=QC&lang=fr
https://anatole-api.onrender.com/api/v1/discovery/provincial-statistics?region=all&lang=fr
```

Le second endpoint doit retourner `requested_region = "QC"`.
Le troisième doit retourner 10 éléments dans `provinces`.

### Vercel

Déployer ensuite le frontend, avec `Use existing Build Cache` désactivé pour le
premier déploiement v1.4.0.

## 5. Vérification visuelle

Actualités :

1. Région → Québec;
2. vérifier inflation, chômage, emploi et population;
3. ouvrir le lien du tableau Statistique Canada;
4. ouvrir la source provinciale;
5. passer à Alberta puis Ontario;
6. Région → Toutes et vérifier le comparatif des 10 provinces.

Calendrier :

1. Région → Québec;
2. confirmer que le panneau chiffré précède les publications à venir;
3. confirmer que les événements de v1.3.9 sont toujours présents;
4. tester en français et en anglais;
5. tester sur mobile.

## Important

Le service WDS peut temporairement rendre une table indisponible pendant sa mise
à jour. Le service Anatole conserve le dernier snapshot valide et n'invente pas
de valeur. Les métadonnées sont mises en cache 24 h; les valeurs 30 minutes.
Aucune nouvelle clé API et aucune migration PostgreSQL ne sont requises.
