# Anatole — campagne performance 3I à 3Z

Généré le 2026-09-16T15:53:35.676574+00:00.

Les métriques runtime p50/p95 restent visibles dans `/performance`.

| Mesure | Avant | Après | Écart |
| --- | ---: | ---: | ---: |
| Plus gros chunk JS | 361.8 KiB | 361.8 KiB | +0.0% |
| Total chunks JS | 1.61 MiB | 1.61 MiB | +0.1% |
| Plus gros actif Web | 0 B | 0 B | +0.0% |
| Total actifs Web | 0 B | 0 B | +0.0% |
| Plus gros actif mobile | 946.9 KiB | 946.9 KiB | +0.0% |
| Total actifs mobile | 946.9 KiB | 946.9 KiB | +0.0% |

## Contrat 3I → 3Z

- 3I–3N : first-open public instantané, cache borné, revalidation et warmup adaptatif.
- 3O : compression GZip API.
- 3P : optimisation des imports Lucide.
- 3Q–3T : budgets JS/Web/mobile.
- 3U–3V : contrat de cache mobile testé.
- 3W : isolation des routes privées du cache public.
- 3X : baseline avant/après enregistrée.
- 3Y : commits atomiques.
- 3Z : API, Web, mobile et E2E validés avant push.

Après déploiement, les réglages fournisseurs/TTL restent pilotés par le p95 réel de `/performance`.
