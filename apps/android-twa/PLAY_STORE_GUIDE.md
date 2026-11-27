# Google Play Trusted Web Activity Release Guide

The Android wrapper opens the Jantt PWA. Bubblewrap configuration and custom Android behavior are versioned here; generated projects, APK/AAB builds and private signing material are excluded from Git.

## Install the existing app

Download `app-release-signed.apk` from [GitHub Releases](https://github.com/AhmadHassan-BTed/Jantt/releases/latest). For Google Play early testing, join [Jantt Testers](https://groups.google.com/g/jantt-testers), then [opt in](https://play.google.com/apps/testing/org.fractal.jantt) using the same Google account. Testing access depends on the current rollout.

## Rebuild from a fresh checkout

Use the repository's supported Node.js version, an Android SDK and a compatible JDK. Bubblewrap can help configure the Android toolchain. The customization script is tested against Bubblewrap 1.27.0.

1. Enter `apps/android-twa`. The committed `twa-manifest.json` contains Jantt's package ID, URLs, version and signing-key alias; do not replace it with the placeholder template.
2. Restore your existing `jantt-release.keystore` here, or set the manifest's `signingKey.path` to its private location. Keep the original key and passwords for compatible app updates.
3. Regenerate the Android project, then apply the tracked customizations:

   ```sh
   npx --yes @bubblewrap/cli@1.27.0 update --skipVersionUpgrade
   node scripts/apply-customizations.mjs
   npx --yes @bubblewrap/cli@1.27.0 build
   ```

4. Enter signing passwords through Bubblewrap's prompt. Do not hard-code credentials in Gradle files or commit a private `signing.properties` file. Bubblewrap signs the generated APK/AAB using the existing key.
5. For a new native release, increase the manifest version deliberately before regeneration. After any subsequent `bubblewrap update`, re-run `node scripts/apply-customizations.mjs` before building.

The customizations preserve the offline/retry launcher, network permissions, Android compatibility changes, valid asset-link JSON and release minification setting. They do not contain signing keys or passwords. Generated configuration continues to use the current TWA manifest.

Run the customization checks without an Android SDK:

```sh
node --test scripts/apply-customizations.test.mjs
```

## Files to retain privately

Back up the Android signing keystore and its credentials. The custom source is in GitHub; generated `app/`, Gradle wrappers, build directories, APKs and AABs can be recreated. Never commit `*.keystore`, `*.jks`, `signing.properties`, passwords or other signing secrets.

## Host Digital Asset Links

Android opens Jantt without browser chrome only when asset links are verified.

- Publish the app's certificate fingerprints at `https://ahmadhassan-bted.github.io/.well-known/assetlinks.json`.
- Include the upload-key and Play App Signing fingerprints when applicable.
- The root-domain file belongs to the separate `AhmadHassan-BTed/ahmadhassan-bted.github.io` repository; the Jantt app is hosted under `/Jantt/`.
- Keep `twa-manifest.json` fingerprints and additional trusted origins consistent with the published asset links.

## Google Play release

Upload the generated AAB through Play Console and complete the listing, content rating and Data Safety forms. Use `https://ahmadhassan-bted.github.io/Jantt/privacy.html` as the privacy-policy URL. Signing credentials are not GitHub Actions secrets unless you deliberately configure a future automated Android signing workflow.

Ordinary web feature releases deploy through the existing web CI and Pages workflow. Native metadata, launcher or permission changes need a new signed Android release.

