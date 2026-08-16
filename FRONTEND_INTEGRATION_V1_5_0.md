# Anatole v1.5.0 — intégration frontend « province-first »

## Pourquoi l'ancien comportement n'est pas suffisant

v1.3.9 traite plusieurs publications de Statistique Canada comme
`Canada + provinces`. Lorsque Québec est sélectionné, ces publications
nationales restent donc visibles.

v1.5.0 change la règle :

> **une province sélectionnée = le corps principal de la page est provincial.**

Les résultats nationaux génériques ne doivent plus remplir la grille.

---

# 1. Actualités

Dans le composant client de la page Actualités, importer :

```tsx
import ProvinceMacroFeed from "@/components/provincial/ProvinceMacroFeed";
import { isProvinceRegion } from "@/lib/provincial-macro";
```

Après les filtres :

```tsx
const provinceMode = isProvinceRegion(selectedRegion);
```

À l'endroit où la grille de nouvelles actuelle est rendue, remplacer la logique
par un branchement :

```tsx
{provinceMode ? (
  <ProvinceMacroFeed
    mode="news"
    region={selectedRegion}
    language={language}
    search={search}
    source={selectedSource}
    category={selectedCategory}
    importance="Toutes"
  />
) : (
  /* grille Actualités existante, inchangée */
)}
```

## IMPORTANT — filtre Source

Quand `selectedRegion` change vers une province, remettre la source à `Toutes`
pour éviter de rester bloqué sur un ancien choix comme
`Gouvernement du Québec`.

```tsx
useEffect(() => {
  if (isProvinceRegion(selectedRegion)) {
    setSelectedSource(language === "fr" ? "Toutes" : "All");
  }
}, [selectedRegion, language]);
```

Idéalement, construire ensuite les options Source à partir de
`snapshot.sources`. Les sources provinciales statistiques doivent être placées
avant les ministères/gouvernements.

---

# 2. Calendrier

Importer les mêmes deux éléments.

```tsx
import ProvinceMacroFeed from "@/components/provincial/ProvinceMacroFeed";
import { isProvinceRegion } from "@/lib/provincial-macro";
```

Puis :

```tsx
const provinceMode = isProvinceRegion(selectedRegion);
```

Remplacer uniquement la liste d'événements :

```tsx
{provinceMode ? (
  <ProvinceMacroFeed
    mode="calendar"
    region={selectedRegion}
    language={language}
    search={search}
    category={selectedCategory}
    importance={selectedImportance}
  />
) : (
  /* liste Calendrier Canada/Toutes existante */
)}
```

### Effet recherché

Si `Québec` est sélectionné, **ne plus afficher** dans la liste principale :

```text
Indice des prix à la consommation, juillet 2026 — Canada + provinces
Opérations internationales du Canada en valeurs mobilières
Ventes de véhicules automobiles neufs
Indice des prix des services du commerce de détail
```

À la place, afficher par exemple :

```text
Québec — Exportations et importations internationales réelles de marchandises
Statistique Québec
18 août 2026

Québec — Comptes économiques trimestriels
Statistique Québec
23 septembre 2026
```

et les diffusions de Statistique Canada seulement lorsqu'elles ont un
**véritable volet provincial essentiel**, avec un titre normalisé :

```text
Québec — Consumer Price Index, ...
Statistique Canada — Québec
```

---

# 3. Ne pas mélanger « contexte Canada » par défaut

Dans une vue provinciale, Banque du Canada et publications nationales pures
ne font pas partie du corps principal.

Si vous voulez conserver ce contexte plus tard, ajoutez un petit panneau
replié ou un toggle :

```text
Afficher le contexte Canada
```

Il doit être désactivé par défaut.

---

# 4. Route API

Avant de tester le frontend :

```bash
python tools/install_provincial_macro_v1_5_0.py
```

Puis démarrer FastAPI et tester :

```text
/api/v1/discovery/provincial-macro?region=QC&lang=fr
/api/v1/discovery/provincial-macro?region=ON&lang=fr
/api/v1/discovery/provincial-macro?region=AB&lang=fr
/api/v1/discovery/provincial-macro?region=PE&lang=fr
```

Chaque réponse doit contenir :

- `latest_releases`
- `upcoming_events`
- `sources`
- `mode: "province-first"`

---

# 5. Règles permanentes de qualité

Une carte gouvernementale générale ne doit entrer dans le fil macro que si
elle concerne directement :

- budget / mise à jour financière;
- déficit, surplus, dette;
- fiscalité;
- comptes économiques;
- investissement matériel clairement chiffré.

Les contenus suivants sont toujours hors du fil macro :

- agenda politique;
- avis aux médias;
- rappel alimentaire / Listeria;
- sécurité publique;
- nomination;
- cérémonie;
- fermeture de route.

Le mot `investissement` seul n'est pas une preuve de pertinence macro.
