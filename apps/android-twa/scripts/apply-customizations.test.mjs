import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { applyCustomizations } from './apply-customizations.mjs';

const config = { packageId: 'org.fractal.jantt', host: 'ahmadhassan-bted.github.io',
  additionalTrustedOrigins: ['https://jantt-cloud.firebaseapp.com', 'https://jantt-cloud.web.app'] };
const manifest = `<manifest xmlns:android="http://schemas.android.com/apk/res/android" package="org.fractal.jantt">
  <application android:theme="@android:style/Theme.Translucent.NoTitleBar"
    android:manageSpaceActivity="com.google.androidbrowserhelper.trusted.ManageDataLauncherActivity">
    <activity android:name="LauncherActivity" android:exported="true">
      <meta-data android:name="android.support.customtabs.trusted.SPLASH_IMAGE_DRAWABLE" android:resource="@drawable/splash"/>
      <meta-data android:name="android.support.customtabs.trusted.SPLASH_SCREEN_BACKGROUND_COLOR" android:resource="@color/backgroundColor"/>
      <meta-data android:name="android.support.customtabs.trusted.SPLASH_SCREEN_FADE_OUT_DURATION" android:value="0"/>
      <meta-data android:name="android.support.customtabs.trusted.DEFAULT_URL" android:value="@string/launchUrl"/>
    </activity>
    <activity android:name="com.google.androidbrowserhelper.trusted.ManageDataLauncherActivity" android:exported="false" android:enabled="true">
      <intent-filter><action android:name="android.intent.action.APPLICATION_PREFERENCES"/></intent-filter>
    </activity>
  </application>
</manifest>`;
const strings = '<resources><string name="keep">Keep this resource</string><string name="assetStatements">[{}],[{}],[{}]</string></resources>';
const gradle = 'android { buildTypes { release { minifyEnabled true } } }\n// custom build setting\n';

async function fixture(t, overrides = {}) {
  const prefix = path.join(os.tmpdir(), 'jantt-android-test-');
  const directory = await mkdtemp(prefix);
  t.after(async () => {
    const resolved = path.resolve(directory);
    assert.ok(resolved.startsWith(path.resolve(prefix)) && resolved !== path.resolve(os.tmpdir()));
    await rm(resolved, { recursive: true, force: true });
  });
  const files = { 'twa-manifest.json': JSON.stringify(config), 'app/src/main/AndroidManifest.xml': manifest,
    'app/src/main/res/values/strings.xml': strings, 'app/build.gradle': gradle, ...overrides };
  for (const [name, content] of Object.entries(files)) {
    await mkdir(path.dirname(path.join(directory, name)), { recursive: true });
    await writeFile(path.join(directory, name), content);
  }
  return { directory, read: name => readFile(path.join(directory, name), 'utf8') };
}

test('restores the custom launcher and startup manifest while preserving unrelated generated settings', async t => {
  const f = await fixture(t);
  await applyCustomizations(f.directory);
  const xml = await f.read('app/src/main/AndroidManifest.xml');
  for (const permission of ['INTERNET', 'ACCESS_NETWORK_STATE']) {
    assert.equal(xml.split(`android.permission.${permission}`).length - 1, 1);
  }
  assert.doesNotMatch(xml, /SPLASH_|manageSpaceActivity|APPLICATION_PREFERENCES/);
  assert.equal(xml.split('com.google.androidbrowserhelper.trusted.ManageDataLauncherActivity').length - 1, 1);
  assert.match(xml, /ManageDataLauncherActivity" android:exported="false"/);
  assert.match(xml, /DEFAULT_URL/);
  assert.match(xml, /Theme.Translucent.NoTitleBar/);
  const java = await f.read('app/src/main/java/org/fractal/jantt/LauncherActivity.java');
  assert.match(java, /protected boolean shouldLaunchImmediately\(\)/);
  assert.match(java, /Retry Connection/);
  assert.match(java, /launchTwa\(\)/);
  const build = await f.read('app/build.gradle');
  assert.match(build, /minifyEnabled false/);
  assert.match(build, /custom build setting/);
  assert.doesNotMatch(build, /signingConfig|storePassword|keyPassword/);
});

test('writes one valid asset-statements array with every unique current origin', async t => {
  const f = await fixture(t, { 'twa-manifest.json': JSON.stringify({ ...config,
    additionalTrustedOrigins: [...config.additionalTrustedOrigins, 'https://jantt-cloud.web.app', 'future.example'] }) });
  await applyCustomizations(f.directory);
  const xml = await f.read('app/src/main/res/values/strings.xml');
  const json = xml.match(/<string name="assetStatements">([\s\S]*?)<\/string>/)[1].replaceAll('\\"', '"');
  const statements = JSON.parse(json);
  assert.equal(statements.length, 4);
  assert.deepEqual(statements.map(s => s.target.site), ['https://ahmadhassan-bted.github.io',
    'https://jantt-cloud.firebaseapp.com', 'https://jantt-cloud.web.app', 'https://future.example']);
  assert.ok(statements.every(s => s.relation[0] === 'delegate_permission/common.handle_all_urls' && s.target.namespace === 'web'));
  assert.match(xml, /Keep this resource/);
});

test('can run repeatedly without duplicate permissions, activities, or content changes', async t => {
  const f = await fixture(t, { 'app/src/main/AndroidManifest.xml': manifest.replace('<application',
    '<uses-permission android:name="android.permission.INTERNET"/>\n<application') });
  const first = await applyCustomizations(f.directory);
  const before = await Promise.all(first.files.map(file => readFile(file, 'utf8')));
  await applyCustomizations(f.directory);
  assert.deepEqual(await Promise.all(first.files.map(file => readFile(file, 'utf8'))), before);
});

test('fails before changing files if a Bubblewrap template anchor changes', async t => {
  const f = await fixture(t, { 'app/build.gradle': 'android { buildTypes { release { } } }' });
  await assert.rejects(applyCustomizations(f.directory), /minifyEnabled/);
  assert.equal(await f.read('app/src/main/AndroidManifest.xml'), manifest);
  assert.equal(await f.read('app/src/main/res/values/strings.xml'), strings);
});

test('rejects invalid package paths and non-origin URLs before changing generated files', async t => {
  for (const changedConfig of [{ ...config, packageId: '../../outside' },
    { ...config, additionalTrustedOrigins: ['https://example.com/path'] },
    { ...config, host: 'http://example.com' }]) {
    const f = await fixture(t, { 'twa-manifest.json': JSON.stringify(changedConfig) });
    await assert.rejects(applyCustomizations(f.directory));
    assert.equal(await f.read('app/src/main/AndroidManifest.xml'), manifest);
  }
});
