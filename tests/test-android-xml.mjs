// Ressources XML Android (res/**, AndroidManifest.xml) : erreurs que Gradle refuse et qu'aucun SDK ne vérifie ici.
// « -- » dans un commentaire XML est interdit (SAXParseException à la compilation de l'APK) ; balises de commentaire bien fermées.
import './setup-env.mjs';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const root = 'android-app/android/app/src/main', files = [join(root, 'AndroidManifest.xml')];
(function walk(d) { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) walk(p); else if (p.endsWith('.xml')) files.push(p); } })(join(root, 'res'));
const bad = [];
for (const f of files) {
  const s = readFileSync(f, 'utf8');
  for (const m of s.matchAll(/<!--([\s\S]*?)-->/g)) if (m[1].includes('--') || m[1].endsWith('-')) bad.push(`${f}:${s.slice(0, m.index).split('\n').length} « -- » dans un commentaire`);
  if ((s.match(/<!--/g) || []).length !== (s.match(/-->/g) || []).length) bad.push(`${f} : commentaire mal fermé`);
  if (!/^\s*(<\?xml[^>]*\?>\s*)?(<!--[\s\S]*?-->\s*)*</.test(s)) bad.push(`${f} : début de fichier inattendu`);
}
assert.deepEqual(bad, [], bad.join('\n'));
console.log(`✓ ${files.length} fichiers XML Android : commentaires valides`);

// Images à partager (src/simg.js → ManaOrbit.shareImage, APK 1.0.4) : le PNG écrit dans le dossier SHARE_DIR du cache est offert aux autres applis par le
// FileProvider du manifeste. Une autorité, un chemin ou un dossier qui ne se correspondent plus : FileProvider.getUriForFile lève une exception et le partage échoue.
{
  const man = readFileSync(join(root, 'AndroidManifest.xml'), 'utf8'), java = readFileSync('android-app/android/app/src/main/java/app/manaorbit/ManaOrbitPlugin.java', 'utf8');
  const prov = (/<provider\b[^>]*android:name="androidx\.core\.content\.FileProvider"[\s\S]*?<\/provider>/.exec(man) || [''])[0];
  assert.ok(prov, 'manifeste : FileProvider déclaré');
  const attr = n => (new RegExp(`android:${n}="([^"]*)"`).exec(prov) || [])[1];
  assert.equal(attr('exported'), 'false', 'FileProvider non exporté'); assert.equal(attr('grantUriPermissions'), 'true', 'droits accordés à l\'appli choisie');
  const auth = attr('authorities'); assert.match(auth, /^\$\{applicationId\}\.fileprovider$/, 'autorité : ${applicationId}.fileprovider');
  assert.match(java, /getPackageName\(\) \+ "\.fileprovider"/, 'ManaOrbitPlugin : même autorité (applicationId = nom du paquet)');
  assert.match(prov, /android:name="android\.support\.FILE_PROVIDER_PATHS"[\s\S]*android:resource="@xml\/file_paths"/, 'chemins : @xml/file_paths');
  const dir = (/static final String SHARE_DIR = "([^"]+)"/.exec(java) || [])[1]; assert.ok(dir, 'ManaOrbitPlugin.SHARE_DIR');
  const paths = readFileSync(join(root, 'res/xml/file_paths.xml'), 'utf8'), cache = [...paths.matchAll(/<cache-path\b[^>]*path="([^"]*)"/g)].map(m => m[1].replace(/^\.?\/?/, '').replace(/\/$/, ''));
  assert.ok(cache.some(p => p === '' || p === dir || dir.startsWith(p + '/')), `file_paths.xml : un cache-path couvre le dossier « ${dir} » du cache (${JSON.stringify(cache)})`);
  for (const m of ['shareImage', 'saveImage']) { assert.match(java, new RegExp(`@PluginMethod\\s+public void ${m}\\(PluginCall call\\)`), `méthode ${m}`); assert.match(java, new RegExp(` \\* - ${m}\\(\\{`), `${m} décrite dans l'en-tête du plugin`); }
  assert.match(java, /Build\.VERSION\.SDK_INT < Build\.VERSION_CODES\.Q\)[\s\S]{0,80}reject/, 'saveImage : refusé avant Android 10 (MediaStore sans autorisation)');
  console.log(`✓ FileProvider ${auth} : dossier « ${dir} » du cache couvert, shareImage / saveImage déclarées et décrites`);
}

// App Links (APK 1.0.5) : les liens https://manaorbit.app/ (?p=, ?troc=…) s'ouvrent dans l'appli. Filtre vérifié (autoVerify) sur MainActivity, page de l'appli
// seulement ; même hôte et même paquet que la barre « Ouvrir dans l'appli » du site (src/applink.js) et que /.well-known/assetlinks.json (proxy.mjs).
{
  const man = readFileSync(join(root, 'AndroidManifest.xml'), 'utf8'), gradle = readFileSync('android-app/android/app/build.gradle', 'utf8');
  const act = (/<activity\b[^>]*android:name="\.MainActivity"[\s\S]*?<\/activity>/.exec(man) || [''])[0];
  const f = [...act.matchAll(/<intent-filter\b([^>]*)>([\s\S]*?)<\/intent-filter>/g)].find(m => m[2].includes('"android.intent.action.VIEW"'));
  assert.ok(f, 'MainActivity : intent-filter VIEW (App Links)');
  assert.match(f[1], /android:autoVerify="true"/, 'autoVerify : Android vérifie assetlinks.json à l\'installation');
  for (const c of ['android.intent.category.DEFAULT', 'android.intent.category.BROWSABLE']) assert.ok(f[2].includes(`"${c}"`), c);
  const data = [...f[2].matchAll(/<data\b([^>]*)\/>/g)].map(m => m[1]), vals = k => data.map(d => (new RegExp(`android:${k}="([^"]*)"`).exec(d) || [])[1]).filter(Boolean);
  assert.deepEqual(vals('scheme'), ['https']); assert.deepEqual(vals('host'), ['manaorbit.app']); assert.deepEqual(vals('path').sort(), ['/', '/index.html'], 'page de l\'appli seulement (pas /privacy, /legal, /admin)');
  assert.match(act, /android:launchMode="singleTask"/, 'appli déjà ouverte : le lien arrive par onNewIntent (« appUrlOpen »)');
  assert.equal((/applicationId "([^"]+)"/.exec(gradle) || [])[1], 'app.manaorbit');
  assert.ok(Number((/versionCode (\d+)/.exec(gradle) || [])[1]) >= 6, 'versionCode 6 et plus (APK 1.0.5 : première avec les App Links)');
  assert.match(readFileSync('src/applink.js', 'utf8'), /APL_HOST = 'manaorbit\.app', APL_PKG = 'app\.manaorbit'/, 'site : même hôte, même paquet');
  assert.match(readFileSync('proxy.mjs', 'utf8'), /package_name: 'app\.manaorbit'/, 'assetlinks.json : même paquet');
  const java = readFileSync('android-app/android/app/src/main/java/app/manaorbit/MainActivity.java', 'utf8'), plug = readFileSync('android-app/android/app/src/main/java/app/manaorbit/ManaOrbitPlugin.java', 'utf8');
  assert.match(java, /FLAG_ACTIVITY_LAUNCHED_FROM_HISTORY[\s\S]{0,40}ManaOrbitPlugin\.forget\(/, 'rouverte depuis les applis récentes : le lien n\'est pas rejoué');
  assert.match(plug, /ACTION_VIEW\.equals\(intent\.getAction\(\)\)\) \{\s*intent\.setAction\(Intent\.ACTION_MAIN\);[^\n]*\n\s*intent\.setData\(null\);/, 'forget : lien oublié');
  console.log('✓ App Links : intent-filter autoVerify https://manaorbit.app/ sur MainActivity (VIEW, DEFAULT, BROWSABLE, « / » seulement), paquet et hôte communs au site et à assetlinks.json, versionCode ≥ 6');
}
