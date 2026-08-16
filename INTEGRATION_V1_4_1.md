# Anatole v1.4.1 — Fil macro provincial ESSENTIEL

## Problème corrigé

Le filtre régional v1.3.9 fonctionne, mais les flux gouvernementaux
provinciaux sont encore trop larges.

Exemples qui doivent disparaître du fil macro :

- agenda public d'un premier ministre;
- avis aux médias sans donnée économique;
- rappel alimentaire / Listeria;
- sécurité publique;
- activités culturelles;
- annonces protocolaires;
- nomination.

## Nouvelle hiérarchie

### Québec

1. **Statistique Québec**
2. **Gouvernement du Québec — Économie et finances**
3. Statistique Canada
4. Banque du Canada

### Ontario

1. **Ontario Economic Accounts — Ministère des Finances**
2. **Ministère des Finances de l'Ontario**
3. Statistique Canada
4. Banque du Canada

Le terme « Statistique Ontario » n'est pas utilisé comme nom institutionnel :
la source officielle provinciale pertinente est `Ontario Economic Accounts`,
publiée par le ministère des Finances.

Les autres provinces utilisent leur agence/statistique provinciale officielle
lorsqu'elle existe : BC Stats, Alberta OSI, Saskatchewan Bureau of Statistics,
Manitoba Bureau of Statistics, etc.

## Indicateurs essentiels

Le fil doit privilégier :

- PIB réel;
- emploi et chômage;
- inflation / IPC;
- salaires et rémunération;
- ventes au détail;
- fabrication / production;
- exportations et importations;
- mises en chantier;
- permis de bâtir;
- finances publiques : budget, déficit, surplus, dette;
- fiscalité;
- population;
- investissement des entreprises / dépenses en immobilisations.

## 1. Backend — filtre strict

Copier :

```text
apps/api/app/services/provincial_essential_policy.py
```

Dans le service Actualités v1.3.9, au moment où chaque carte provinciale est
transformée en `NewsItem`, appliquer :

```python
from app.services.provincial_essential_policy import classify_essential_release

decision = classify_essential_release(
    entry.title,
    entry.summary,
    source_kind="government",
)

if not decision.allowed:
    continue

category = decision.category or category
```

### IMPORTANT

Appliquer `source_kind="government"` aux flux gouvernementaux génériques.

Appliquer `source_kind="statistics"` aux pages provenant de Statistique Québec,
Ontario Economic Accounts, BC Stats, etc.

Ne pas conserver l'ancien test qui accepte une publication simplement parce
que le texte contient le mot `investissement`.

## 2. Backend — source statistique directe Québec / Ontario

Copier :

```text
apps/api/app/services/provincial_statistical_news.py
```

Dans le snapshot Actualités, lorsque la région est `QC` ou `ON`, lancer en
parallèle :

```python
from app.services.provincial_statistical_news import (
    fetch_primary_statistical_releases,
)

statistical_releases = await fetch_primary_statistical_releases(region_code)
```

Convertir ensuite chaque `StatisticalRelease` vers le `NewsItem` v1.3.9.

Exemple conceptuel :

```python
for release in statistical_releases:
    items.append(
        NewsItem(
            id=make_id(release.source, release.url, release.title),
            title=release.title,
            summary=release.summary,
            url=release.url,
            source=release.source,
            category=release.category,
            published_at=release.published_at or generated_at,
            sentiment="Neutre",
            sentiment_score=0.0,
            # conserver les champs régionaux de v1.3.9 :
            regions=[release.region],
        )
    )
```

**Adaptez uniquement le nom du champ régional** (`regions`, `region_codes`,
etc.) au schéma déjà utilisé dans v1.3.9. Ne remplacez pas le schéma entier.

Pour le Québec, le module interroge directement les pages officielles des
indicateurs de Statistique Québec :

- PIB;
- marché du travail;
- IPC;
- ventes au détail;
- fabrication;
- commerce international;
- mises en chantier;
- permis de bâtir;
- rémunération.

Pour l'Ontario, il interroge `Ontario Economic Accounts`.

## 3. Frontend — menu Source

Copier :

```text
apps/web/lib/provincial-economic-sources.ts
```

Dans le client Actualités actuel :

```tsx
import {
  economicSourceOptions,
} from "@/lib/provincial-economic-sources";
```

Remplacer la construction générique des options Source par :

```tsx
const sourceOptions = economicSourceOptions(
  selectedRegion,
  language,
);
```

Conserver le `<select>` actuel et ses styles.

### Résultat Québec

```text
Toutes
Statistique Québec
Gouvernement du Québec — Économie et finances
Statistique Canada
Banque du Canada
```

### Résultat Ontario

```text
Toutes
Ontario Economic Accounts — Ministère des Finances
Ministère des Finances de l’Ontario
Statistique Canada
Banque du Canada
```

## 4. Ordre des cartes

Même lorsque `Source = Toutes`, classer les cartes par :

1. agence statistique provinciale;
2. PIB / Emploi / Inflation;
3. consommation / industrie / commerce / logement;
4. budget / finances publiques;
5. gouvernement provincial;
6. Statistique Canada;
7. Banque du Canada.

Les publications exclues par la politique stricte ne doivent pas être rendues.

## 5. Calendrier

Conserver les événements régionaux v1.3.9.

Ajouter comme sources locales prioritaires :

- calendrier de diffusion de Statistique Québec pour QC;
- calendrier des Ontario Economic Accounts pour ON.

Le moteur `provincial-statistics` v1.4.0 peut continuer à afficher la dernière
valeur connue avant la prochaine diffusion.

## 6. Tests

Lancer :

```bash
cd apps/api
pytest -q tests/test_provincial_essential_policy.py
pytest -q tests/test_provincial_statistical_news.py
```

Tests attendus :

- agenda de la première ministre : rejeté;
- Listeria : rejeté;
- IPC : accepté;
- emploi/chômage : accepté;
- investissement vague : rejeté;
- investissement industriel avec emplois/capex : accepté;
- Statistique Québec prioritaire dans le menu Québec;
- Ontario Economic Accounts prioritaire dans le menu Ontario.

## 7. Déploiement

1. Copier les nouveaux fichiers.
2. Faire les petites intégrations dans `news.py` et le client Actualités actuel.
3. Commit + push.
4. Render en premier.
5. Tester `/api/v1/discovery/news?lang=fr` avec région Québec.
6. Vercel ensuite, sans ancien Build Cache.
7. Vérifier la source Québec puis Ontario.
