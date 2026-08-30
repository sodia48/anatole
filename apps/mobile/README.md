# Anatole Mobile

Application iOS et Android native d’Anatole, construite avec Expo SDK 57, React Native 0.86.3, Expo Router et TypeScript strict. L’application appelle directement la même API FastAPI que le web. Elle ne charge jamais le site complet dans une WebView; seul le moteur graphique de Focus utilise une WebView spécialisée et isolée.

## Prérequis

- Node.js 24.x
- pnpm 10.14.0
- Xcode 26.4+ pour iOS ou Android Studio avec Android SDK 36
- Une development build pour tester les notifications push Android (le push distant n’est pas disponible dans Expo Go)

## Installation et démarrage

Depuis la racine du monorepo :

```bash
pnpm install
cp apps/mobile/.env.example apps/mobile/.env.local
pnpm dev:mobile
```

Puis utiliser `pnpm ios:mobile` ou `pnpm android:mobile`. L’API locale peut être configurée avec `EXPO_PUBLIC_ANATOLE_API_URL`; sur un appareil physique, utiliser l’adresse LAN de la machine plutôt que `localhost`.

## Environnements et builds

`app.config.ts` définit trois variantes :

- `development` : `com.anatole.mobile.dev`, development client interne;
- `preview` : `com.anatole.mobile.preview`, distribution interne;
- `production` : `com.anatole.mobile`, soumission App Store / Play Store.

Les profils correspondants sont dans `eas.json`. Avant le premier build EAS, remplacer `EXPO_PUBLIC_EAS_PROJECT_ID` par l’identifiant du projet Expo puis configurer les credentials APNs et FCM.

```bash
eas build --profile development --platform ios
eas build --profile preview --platform android
eas build --profile production --platform all
```

## Authentification et données

Le jeton du compte est stocké dans `expo-secure-store` et envoyé comme Bearer aux routes `/api/v1/account/*`. Au démarrage, `/me` restaure la session, puis `/workspace` charge watchlist, portefeuille, alertes et préférences. Une réponse 401 efface le jeton. Une panne isolée de `/workspace` conserve la session et affiche un état de synchronisation dégradé.

Les snapshots publics TanStack Query sont persistés 24 heures dans AsyncStorage afin de conserver les dernières données utiles hors ligne. Les caches privés (notifications, portefeuille, alertes et watchlist) restent en mémoire et sont supprimés lors d’un 401 ou d’une déconnexion. Les mutations sensibles exigent une connexion.

## Notifications push

L’utilisateur active explicitement les notifications depuis Réglages. L’app demande alors la permission, obtient un jeton Expo et l’enregistre dans `POST /api/v1/account/devices`. Les routes `GET` et `DELETE /api/v1/account/devices/{id}` sont authentifiées et isolées par compte. Cette passe fournit le registre des appareils et la réception/deep-linking; l’envoi serveur APNs/FCM doit être branché au moteur de notification lors de la phase suivante.

## Deep links

- `anatole://focus/RY`
- `anatole://alerts`
- `anatole://notifications`
- `anatole://portfolio`
- `https://anatole.app/stock/RY`
- les payloads push peuvent fournir `ticker` ou `route`

Les domaines associés exigent les fichiers Apple App Site Association et Android Digital Asset Links sur `anatole.app` avant validation universelle en production.

## Tests

```bash
pnpm typecheck:mobile
pnpm lint:mobile
pnpm test:mobile
maestro test apps/mobile/.maestro/smoke.yaml
MAESTRO_TEST_EMAIL=mobile@example.com MAESTRO_TEST_PASSWORD=... maestro test apps/mobile/.maestro/authenticated.yaml
```

Les tests Jest couvrent le client API, SecureStore, la normalisation ticker, la fusion workspace, la restauration de compte en démarrage dégradé et les écrans critiques. Le scénario Maestro vérifie la navigation critique sur une development build.

## Périmètre de cette fondation

Fonctionnels : Aujourd’hui, Cockpit Marchés, Focus natif avec graphique spécialisé, Watchlist, Portefeuille, Alertes, Notifications, session bilingue et réglages push. Les hubs Institutions, ETF, IPO & initiés, Comparateur, Psychologie et Terminal Pro sont annoncés comme phase suivante; ils ne sont pas simulés avec de fausses données.
