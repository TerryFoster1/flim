# Flim Mobile

Native Android/iOS foundation for Flim built with Expo, React Native, TypeScript, and Expo Router.

This project is intentionally separate from the web app and does not WebView-wrap `flim.ca`.

## Run

```bash
npm install
npm run start
```

## API

The mobile app uses the existing Flim backend.

```bash
EXPO_PUBLIC_FLIM_APP_ENV=development
EXPO_PUBLIC_FLIM_API_BASE_URL=http://localhost:3000
```

No server secrets belong in this project. Native auth stores the existing `flim_session` cookie in Expo SecureStore and sends it to the web API.

Non-production builds must use a local, preview, or staging API URL. The mobile API client fails fast if a development, preview, or staging build is accidentally configured to use the production API.

## EAS

Preview/internal Android builds are configured in `eas.json`.

```bash
npx eas-cli build --platform android --profile preview
```

Do not submit to app stores until the native auth/session bridge and first vertical slice have been tested on device.
