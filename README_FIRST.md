# Anatole v1.3.3 — stabilité de la carte ETF

## Cause de l’écran gris/blanc

Les cotations ETF sont conservées en mémoire dans le processus Render. Après
une mise en veille, un redémarrage, un déploiement ou une réponse partielle du
fournisseur, cette mémoire peut être vide ou incomplète.

Le frontend remplaçait alors toutes les anciennes cotations valides par le
nouvel instantané partiel. Les éléments sans prix recevaient `price = 0`,
`change = 0` et `source = unavailable`, ce qui les rendait gris et parfois
visuellement vides dans les petites cases.

## Correction

- conservation des dernières cotations valides pendant les réponses partielles;
- cache navigateur de douze heures;
- aucune régression d’une cotation valide vers `0 / unavailable`;
- annulation correcte des anciennes requêtes;
- actualisation suspendue lorsque l’onglet est masqué;
- nouvelle collecte immédiate au retour sur l’onglet;
- nouvelle tentative de démarrage API après 60 secondes en cas d’échec;
- nouvelle tentative rapide après une collecte entièrement vide;
- cases indisponibles plus sombres et hachurées;
- groupes sans aucune cotation affichés `N/D`, et non `+0,00 %`.

## Déploiement

1. installer le PATCH à la racine du dépôt;
2. commit et push sur `main`;
3. déployer Render en premier;
4. déployer Vercel sans réutiliser le Build Cache.

Aucune migration PostgreSQL n’est nécessaire.
