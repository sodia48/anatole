# Déploiement v1.5.1

## Ordre

1. Décompresser le PATCH à la racine du dépôt.
2. Exécuter `python tools/install_provincial_calendar_v1_5_1.py`.
3. Vérifier que le script termine avec `[SUCCESS] Backend + Calendrier Next.js reliés.`
4. Commit + push sur `main`.
5. Render : redéployer `anatole-api`.
6. Tester `/api/v1/discovery/provincial-calendar?region=QC&lang=fr`.
7. Vercel : nouveau déploiement, **Use existing Build Cache désactivé**.
8. Ouvrir Calendrier, choisir Québec, puis Ontario/Saskatchewan/autres provinces.

## Résultat attendu pour Québec le 16 août 2026

Le panneau prioritaire doit commencer par des dates proches : IPC le 17 août, commerce extérieur réel et mises en chantier le 18 août, ventes au détail le 21 août, rémunération le 27 août, puis EPA le 4 septembre.

## Si le script ne trouve pas le Calendrier Next.js

Il s'arrête sans modifier un fichier au hasard. Envoyer alors le fichier TSX actuel de la page Calendrier; l'installateur indique le chemin qu'il a essayé de détecter. La sauvegarde des fichiers modifiés se trouve dans `.anatole-backups/v1_5_1`.
