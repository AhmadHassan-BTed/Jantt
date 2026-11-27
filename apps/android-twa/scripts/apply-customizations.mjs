import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const androidDirectory = fileURLToPath(new URL('../', import.meta.url));
const manageDataActivity = 'com.google.androidbrowserhelper.trusted.ManageDataLauncherActivity';

function replaceRequired(source, pattern, replacement, description) {
  if (!pattern.test(source)) throw new Error(`Generated ${description} was not found; review the Bubblewrap template before building.`);
  return source.replace(pattern, replacement);
}

function httpsOrigin(value) {
  if (typeof value !== 'string' || !value.trim()) throw new Error('A trusted origin is missing.');
  const url = new URL(value.includes('://') ? value : `https://${value}`);
  if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('Trusted origins must be HTTPS origins without credentials, paths, queries, or fragments.');
  }
  return url.origin;
}

/** Reapply Jantt's source-controlled customizations after Bubblewrap regenerates app/. */
export async function applyCustomizations(projectDirectory = androidDirectory) {
  const project = path.resolve(projectDirectory);
  const config = JSON.parse(await readFile(path.join(project, 'twa-manifest.json'), 'utf8'));
  if (!/^[A-Za-z_]\w*(?:\.[A-Za-z_]\w*)+$/.test(config.packageId ?? '')) {
    throw new Error('twa-manifest.json must contain a valid Java packageId.');
  }
  if (config.additionalTrustedOrigins !== undefined && !Array.isArray(config.additionalTrustedOrigins)) {
    throw new Error('additionalTrustedOrigins must be an array.');
  }
  const origins = [...new Set([config.host, ...(config.additionalTrustedOrigins ?? [])].map(httpsOrigin))];
  const paths = {
    manifest: path.join(project, 'app/src/main/AndroidManifest.xml'),
    strings: path.join(project, 'app/src/main/res/values/strings.xml'),
    gradle: path.join(project, 'app/build.gradle'),
    launcher: path.join(project, 'app/src/main/java', ...config.packageId.split('.'), 'LauncherActivity.java')
  };
  const [manifestSource, stringsSource, gradleSource, launcherSource] = await Promise.all([
    readFile(paths.manifest, 'utf8'), readFile(paths.strings, 'utf8'), readFile(paths.gradle, 'utf8'),
    readFile(new URL('../customizations/LauncherActivity.java', import.meta.url), 'utf8')
  ]);

  // Validate every generated anchor before writing any file. Template changes must fail visibly.
  let manifest = replaceRequired(manifestSource, /<manifest\b[^>]*>/, match => match, 'manifest');
  for (const permission of ['INTERNET', 'ACCESS_NETWORK_STATE']) {
    const fullName = `android.permission.${permission}`;
    const existing = new RegExp(`<uses-permission\\b[^>]*android:name=["']${fullName.replaceAll('.', '\\.')}["'][^>]*>`);
    if (!existing.test(manifest)) {
      manifest = manifest.replace(/<manifest\b[^>]*>/, match => `${match}\n    <uses-permission android:name="${fullName}" />`);
    }
  }
  // Jantt has its own startup/error screen; don't overlay Bubblewrap's generated splash.
  manifest = manifest.replace(/\s*<meta-data\b(?=[^>]*android:name=["']android\.support\.customtabs\.trusted\.SPLASH_[^"']*["'])[^>]*(?:\/\s*>|>\s*<\/meta-data>)/g, '');
  manifest = manifest.replace(/\s+android:manageSpaceActivity=["']com\.google\.androidbrowserhelper\.trusted\.ManageDataLauncherActivity["']/g, '');
  // Keep a non-exported override even when the generated site-settings shortcut is disabled.
  manifest = manifest.replace(/\s*<activity\b(?=[^>]*android:name=["']com\.google\.androidbrowserhelper\.trusted\.ManageDataLauncherActivity["'])[^>]*(?:\/\s*>|>[\s\S]*?<\/activity>)/g, '');
  manifest = replaceRequired(manifest, /\s*<\/application>/,
    `\n        <activity android:name="${manageDataActivity}" android:exported="false" />\n    </application>`, 'application closing tag');

  // Bubblewrap 1.27 emits adjacent arrays for extra origins. Android needs one JSON array.
  const statements = origins.map(site => ({ relation: ['delegate_permission/common.handle_all_urls'], target: { namespace: 'web', site } }));
  const escapedStatements = JSON.stringify(statements).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '\\"');
  const strings = replaceRequired(stringsSource, /<string\b[^>]*\bname=["']assetStatements["'][^>]*>[\s\S]*?<\/string>/,
    `<string name="assetStatements">${escapedStatements}</string>`, 'assetStatements resource');
  const gradle = replaceRequired(gradleSource, /(\brelease\s*\{[^{}]*\bminifyEnabled\s+)(?:true|false)\b/,
    '$1false', 'release minifyEnabled setting');
  const launcher = replaceRequired(launcherSource, /^package\s+[\w.]+;/m, `package ${config.packageId};`, 'launcher package');

  await mkdir(path.dirname(paths.launcher), { recursive: true });
  await Promise.all([
    writeFile(paths.manifest, manifest), writeFile(paths.strings, strings),
    writeFile(paths.gradle, gradle), writeFile(paths.launcher, launcher)
  ]);
  return { files: Object.values(paths), trustedOrigins: origins.length };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const result = await applyCustomizations(process.argv[2]);
    console.log(`Applied Jantt Android customizations to ${result.files.length} files (${result.trustedOrigins} trusted origins).`);
  } catch (error) {
    console.error(`Android customization failed: ${error.message}`);
    process.exitCode = 1;
  }
}
