# Google Play Trusted Web Activity Release Guide

This directory is intentionally outside the npm workspaces. It contains only Bubblewrap configuration templates and documentation for the Android Trusted Web Activity that points at the GitHub Pages PWA.

## 1. Prerequisites

- Node.js 20 or newer
- Java JDK 11 or newer
- Bubblewrap CLI: `npm install -g @bubblewrap/cli`
- A Google Play Console developer account

## 2. Generate the Android project and signed AAB

1. Copy `twa-manifest.template.json` to `twa-manifest.json` and replace placeholders.
2. Run `bubblewrap init --manifest https://ahmadhassan-bted.github.io/Jantt/manifest.webmanifest`.
3. Run `bubblewrap build` to produce the release `.aab`.
4. Back up the generated keystore and signing properties outside Git. Never commit `*.keystore`, `*.jks`, `*.aab`, `*.apk`, `app/`, `build/`, `.gradle/`, or `signing.properties`.

## 3. Host Digital Asset Links

Android opens Jantt full-screen only when asset links are verified.

- Host `assetlinks.template.json` (with real SHA-256 fingerprints) at `https://ahmadhassan-bted.github.io/.well-known/assetlinks.json`.
- Include BOTH the upload key fingerprint and the Play App Signing fingerprint.
- The GitHub Pages site for this repository is `https://ahmadhassan-bted.github.io/Jantt/`, so the root-domain file must be published from the separate `AhmadHassan-BTed/ahmadhassan-bted.github.io` repository.

## 4. Google Play Console fields

- Privacy Policy URL: `https://ahmadhassan-bted.github.io/Jantt/privacy.html`
- Category: Productivity
- Data Safety: no ads, no third-party analytics trackers, local-first storage, optional cloud rooms
- Store listing screenshots: portrait and landscape
- Content rating: complete the questionnaire for a productivity app

## 5. Zero-maintenance operations

After the initial upload, every push to `main` that passes CI deploys to GitHub Pages. Desktop Web, Desktop PWA, Mobile PWA, and the Android TWA all receive the same update automatically. No new `.aab` upload is required for ordinary feature releases unless native metadata changes.

## 6. The three manual steps for the first release

1. Generate the release keystore and `.aab` with Bubblewrap, then store the keystore in a secure backup location outside Git.
2. Publish `assetlinks.json` to the root GitHub Pages domain with both SHA-256 fingerprints.
3. Upload the `.aab` in Google Play Console, complete the store listing and Data Safety forms, and submit for review.
