# Validation v1.3.1

- TypeScript syntax OK: 2 files
- CSS équilibré.
- Compilation Python réussie.
- [32m.[0m[32m.[0m[32m.[0m[32m.[0m[32m.[0m[32m.[0m[32m.[0m[32m.[0m[32m.[0m[32m                                                                [100%][0m
[32m[32m[1m9 passed[0m[32m in 0.14s[0m[0m
- nouveaux noms de colonnes yfinance testés;
- cache vide de 90 secondes vérifié dans le code;
- rafraîchissement forcé disponible pour IPO et Initiés;
- sources sans données affichées comme N/D, pas comme un faux zéro;
- archive ZIP vérifiée.

La disponibilité réelle de Yahoo Finance et de SEDI dépend de leurs services
externes. Le correctif distingue désormais explicitement une absence de
couverture d’une véritable absence de transactions.
