# Focus Intelligence 2.0 — News × Fundamentals

Le lecteur Résumé+ propose « Comprendre l’impact » pour une nouvelle classée **directement liée au titre**, de type résultats ou dividende, et disposant d’un extrait exploitable. Le panneau récupère les fondamentaux du même ticker seulement lorsque l’utilisateur l’ouvre.

- **Faits publiés :** résumé et provenance de la nouvelle consultée, déjà visibles juste au-dessus du panneau sans être répétés.
- **Contexte financier :** dernier trimestre avec revenus/BPA, ou taux/rendement du dividende, selon le sujet. Source, date, devise et état périmé sont affichés lorsqu’ils sont fournis.
- **Interprétation :** un rapprochement conditionnel. Aucun effet causal, rendement total ou futur versement n’est présenté comme établi.

Une publication sans donnée financière comparable affiche la limite et n’affiche aucun bloc d’analyse inventée. L’action « Poser une question à Anatole » ouvre l’Assistant global avec le ticker, l’URL et le titre de la nouvelle ; elle ne lance pas une question automatiquement. Le backend compare l’URL **et** le titre aux nouvelles directes du même ticker récupérées côté serveur. Une URL fournie par le navigateur n’est jamais téléchargée par ce chemin. Même après correspondance, l’Assistant ne présente que l’extrait indexé et précise qu’il n’a pas lu le document complet.

Les tests utilisent une publication RY synthétique, un trimestre synthétique et une URL de fixture. Ils ne démontrent ni une lecture de rapport en production, ni la disponibilité d’un fournisseur IA. Le budget JavaScript demeure inchangé ; la vue de valorisation compacte et le volume observé remplacent deux présentations moins fiables pour financer ce parcours sans relever le plafond.
