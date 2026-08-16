# Anatole v1.5.1 — Calendrier provincial prioritaire

## Problème corrigé

Lorsque `Région -> Québec` (ou une autre province) était sélectionné dans le Calendrier, la vue pouvait continuer à montrer surtout des publications nationales génériques marquées « Canada + provinces ». Les vraies dates provinciales importantes n'étaient donc pas visibles au bon endroit.

Cette version ajoute un **bloc Calendrier provincial prioritaire** relié automatiquement au filtre Région du Calendrier Next.js. Il ne remplace pas le contexte national existant : il place les annonces provinciales pertinentes dans un bloc distinct et prioritaire, afin qu'elles ne soient plus noyées dans les événements nationaux.

## Ce qui change

### Québec

Source principale : calendrier officiel des principaux indicateurs économiques de Statistique Québec.

Au 16 août 2026, le correctif doit notamment faire ressortir :

- 17 août — Indice des prix à la consommation;
- 18 août — Exportations/importations internationales réelles de marchandises;
- 18 août — Mises en chantier;
- 21 août — Ventes au détail;
- 27 août — Rémunération hebdomadaire moyenne;
- 4 septembre — Enquête sur la population active;
- 14 septembre — Ventes de biens fabriqués;
- 15 septembre — Ventes en gros;
- 16 septembre — Permis de bâtir;
- 23 septembre — Comptes économiques trimestriels du Québec.

La lecture live de Statistique Québec est prioritaire. Une copie de secours **datée du 14 août 2026 et expirant le 30 septembre 2026** est incluse uniquement pour éviter un écran vide si la source change temporairement de format ou devient inaccessible. Elle n'est jamais prolongée automatiquement.

### Ontario

Le correctif lit directement le calendrier officiel des Ontario Economic Accounts lorsqu'une échéance trimestrielle est publiée, puis complète avec les diffusions de Statistique Canada qui comportent réellement des données ontariennes.

### Saskatchewan

Le calendrier officiel 2026-2027 du Saskatchewan Bureau of Statistics est intégré pour les dates d'inflation, d'emploi, de revue statistique et de population.

### Colombie-Britannique, Alberta, Manitoba, Nouveau-Brunswick, Nouvelle-Écosse, Île-du-Prince-Édouard et Terre-Neuve-et-Labrador

Le Calendrier conserve uniquement les diffusions de Statistique Canada pour lesquelles une composante provinciale utile est réellement publiée : IPC, emploi, commerce de détail/gros, fabrication, permis de bâtir, population, rémunération et autres indicateurs explicitement provincialisables.

Les événements nationaux génériques sans vraie lecture provinciale — par exemple certaines statistiques de valeurs mobilières — ne sont pas transformés artificiellement en événements provinciaux.

## Installation recommandée

1. Décompresser ce PATCH **à la racine du dépôt Anatole** en acceptant les remplacements.
2. Depuis la racine du dépôt, exécuter :

```bash
python tools/install_provincial_calendar_v1_5_1.py
```

Sous Windows, vous pouvez aussi lancer :

```text
INSTALL_V1_5_1.bat
```

3. Le script :
   - monte automatiquement la route FastAPI `provincial_macro` dans `apps/api/app/api/router.py`;
   - repère automatiquement le composant Next.js actuel du Calendrier;
   - détecte sa variable de filtre Région;
   - y injecte `ProvinceCalendarPriorityPanel`;
   - crée une sauvegarde dans `.anatole-backups/v1_5_1`;
   - peut être exécuté plusieurs fois sans doubler l'intégration.
4. Commit + push sur `main`.
5. Déployer **Render en premier**.
6. Vérifier :

```text
https://anatole-api.onrender.com/api/v1/discovery/provincial-calendar?region=QC&lang=fr
```

La réponse doit contenir `upcoming_events` avec des événements Québec.
7. Déployer **Vercel ensuite**, sans réutiliser l'ancien Build Cache.
8. Dans Anatole : Calendrier -> Région -> Québec. Vérifier le bloc `CALENDRIER PROVINCIAL PRIORITAIRE`, puis tester Ontario, Saskatchewan et les autres provinces.

## Important sur les heures

Certains calendriers provinciaux officiels publient une **date** sans heure précise. Anatole conserve alors une heure interne uniquement pour le tri, mais l'interface affiche la date seulement (`time_is_estimated=true`). Une heure précise n'est donc pas inventée à l'utilisateur.

## Fichiers principaux

```text
apps/api/app/services/provincial_macro.py
apps/api/app/schemas/provincial_macro.py
apps/api/app/api/routes/provincial_macro.py
apps/api/tests/test_provincial_macro.py
apps/web/lib/provincial-macro.ts
apps/web/components/provincial/ProvinceCalendarPriorityPanel.tsx
apps/web/components/provincial/ProvinceCalendarPriorityPanel.module.css
apps/web/components/provincial/ProvinceMacroFeed.tsx
apps/web/components/provincial/ProvinceMacroFeed.module.css
tools/install_provincial_calendar_v1_5_1.py
```

Aucune migration PostgreSQL n'est nécessaire.
