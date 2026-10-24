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

// Scan chinois, japonais, coréen et demande de note (APK 1.0.6) : méthodes du plugin appelées par le site (scan.js › natLines, help.js › rateShow), bibliothèques
// des services Google Play (modèles ML Kit non embarqués), écritures acceptées par le plugin = celles que le site demande (NAT_SCRIPT).
{
  const plug = readFileSync('android-app/android/app/src/main/java/app/manaorbit/ManaOrbitPlugin.java', 'utf8'), gradle = readFileSync('android-app/android/app/build.gradle', 'utf8');
  for (const m of ['detectText', 'requestReview']) { assert.match(plug, new RegExp(`@PluginMethod\\s+public void ${m}\\(PluginCall call\\)`), `méthode ${m}`); assert.match(plug, new RegExp(` \\* - ${m}\\(`), `${m} décrite dans l'en-tête du plugin`); }
  for (const s of ['chinese', 'japanese', 'korean']) assert.match(gradle, new RegExp(`implementation 'com\\.google\\.android\\.gms:play-services-mlkit-text-recognition-${s}:[\\d.]+'`), `ML Kit ${s} des services Google Play (non embarqué)`);
  assert.doesNotMatch(gradle, /com\.google\.mlkit:text-recognition/, 'aucun modèle ML Kit embarqué (≈ 4 Mo chacun)');
  assert.match(gradle, /implementation 'com\.google\.android\.play:review:[\d.]+'/, 'Play In-App Review');
  const ns = (/const NAT_SCRIPT = \{([^}]*)\}/.exec(readFileSync('src/scan.js', 'utf8')) || [])[1] || '', scripts = new Set([...ns.matchAll(/:\s*'(\w+)'/g)].map(m => m[1]));
  assert.ok(scripts.size >= 4, 'NAT_SCRIPT lu dans scan.js');
  for (const s of scripts) assert.match(plug, new RegExp(`case "${s}":`), `écriture « ${s} » demandée par le site, connue du plugin`);
  assert.match(plug, /MlKitException\.UNAVAILABLE;[^\n]*\n[^\n]*"wait"/, 'modèle en téléchargement : code « wait » (le site lit avec Tesseract en attendant)');
  assert.match(readFileSync('src/help.js', 'utf8'), /typeof mo\.requestReview === 'function'/, 'site : In-App Review seulement si la coque l\'a (APK 1.0.6)');
  console.log(`✓ APK 1.0.6 : detectText (${[...scripts].join(', ')}) et requestReview déclarées, ML Kit chinois, japonais, coréen des services Google Play, Play In-App Review`);
}

// APK 1.0.9 : code natif de la 1.0.6. R8 (1.0.7) et EdgeToEdge (1.0.7, déplacé en 1.0.8) retirés : dans la version du Play Store, la caméra du scan
// ne s'ouvrait plus (version release jamais essayée sur le téléphone : Run ▶ installe la version debug, sans R8). À rallumer après un test interne.
{
  const gradle = readFileSync('android-app/android/app/build.gradle', 'utf8');
  const rel = (/release \{([\s\S]*?)\n {8}\}/.exec(gradle) || [])[1] || '';
  assert.match(rel, /minifyEnabled false/, 'release : R8 coupé (1.0.9), comme en 1.0.6');
  assert.doesNotMatch(rel, /shrinkResources true/, 'ressources lues par leur nom (google_app_id) : jamais retirées');
  const java = readFileSync('android-app/android/app/src/main/java/app/manaorbit/MainActivity.java', 'utf8');
  assert.doesNotMatch(java, /EdgeToEdge/, 'pas de bord à bord forcé (1.0.6) : Android 15 et plus l\'imposent déjà (cible SDK 36)');
  const iSuper = java.indexOf('super.onCreate(savedInstanceState);');
  assert.ok(iSuper > 0, 'super.onCreate appelé');
  assert.doesNotMatch(java.slice(0, iSuper), /getDecorView\(|getWindow\(\)/, 'rien ne touche la fenêtre avant super.onCreate (elle serait créée avec le thème de lancement : barre en haut, bug de la 1.0.7)');
  assert.ok(Number((/versionCode (\d+)/.exec(gradle) || [])[1]) >= 10, 'code natif changé : versionCode 10 et plus (1.0.9)');
  console.log('✓ APK 1.0.9 : code natif de la 1.0.6 (R8 coupé, sans EdgeToEdge), rien ne touche la fenêtre avant super.onCreate, versionCode ≥ 10');
}

// APK 1.0.10 : écran gardé allumé pendant le scan (mise en veille automatique du téléphone), le WebView n'ayant pas navigator.wakeLock.
{
  const plug = readFileSync('android-app/android/app/src/main/java/app/manaorbit/ManaOrbitPlugin.java', 'utf8'), gradle = readFileSync('android-app/android/app/build.gradle', 'utf8');
  assert.match(plug, /@PluginMethod\s+public void keepAwake\(PluginCall call\)/, 'méthode keepAwake'); assert.match(plug, / \* - keepAwake\(/, 'keepAwake décrite dans l\'en-tête du plugin');
  assert.match(plug, /addFlags\(WindowManager\.LayoutParams\.FLAG_KEEP_SCREEN_ON\)/); assert.match(plug, /clearFlags\(WindowManager\.LayoutParams\.FLAG_KEEP_SCREEN_ON\)/);
  assert.match(readFileSync('src/native.js', 'utf8'), /typeof mo\.keepAwake === 'function'/, 'site : keepAwake seulement si la coque l\'a (APK 1.0.10)');
  assert.ok(Number((/versionCode (\d+)/.exec(gradle) || [])[1]) >= 11, 'code natif changé : versionCode 11 et plus (1.0.10)');
  console.log('✓ APK 1.0.10 : keepAwake (FLAG_KEEP_SCREEN_ON) déclarée et demandée par le site, versionCode ≥ 11');
}

// APK 1.0.11 : touchers rendus à la caméra native seulement dans la zone de l'aperçu (le plugin CameraPreview les lui envoie tous : mise au point sur chaque bouton touché).
{
  const plug = readFileSync('android-app/android/app/src/main/java/app/manaorbit/ManaOrbitPlugin.java', 'utf8'), gradle = readFileSync('android-app/android/app/build.gradle', 'utf8');
  assert.match(plug, /@PluginMethod\s+public void camTouch\(PluginCall call\)/, 'méthode camTouch'); assert.match(plug, / \* - camTouch\(/, 'camTouch décrite dans l\'en-tête du plugin');
  assert.match(plug, /getIdentifier\("frame_container", "id"/, 'aperçu du plugin retrouvé par son id'); assert.match(plug, /zone\.contains\(e\.getX\(\), e\.getY\(\)\)/, 'geste filtré à son début');
  assert.match(plug, /return false;\s+\/\/ la page reçoit toujours le toucher/, 'la page garde tous ses touchers');
  assert.match(readFileSync('src/scan.js', 'utf8'), /typeof mo\.camTouch !== 'function'/, 'site : camTouch seulement si la coque l\'a (APK 1.0.11)');
  assert.ok(Number((/versionCode (\d+)/.exec(gradle) || [])[1]) >= 12, 'code natif changé : versionCode 12 et plus (1.0.11)');
  console.log('✓ APK 1.0.11 : camTouch (touchers de la caméra limités à l\'aperçu) déclarée et demandée par le site, versionCode ≥ 12');
}

// APK 1.0.12 : orientation gardée pendant une partie du compteur de vie (le WebView refuse screen.orientation.lock).
{
  const plug = readFileSync('android-app/android/app/src/main/java/app/manaorbit/ManaOrbitPlugin.java', 'utf8'), gradle = readFileSync('android-app/android/app/build.gradle', 'utf8');
  assert.match(plug, /@PluginMethod\s+public void orientation\(PluginCall call\)/, 'méthode orientation'); assert.match(plug, / \* - orientation\(/, 'orientation décrite dans l\'en-tête du plugin');
  assert.match(plug, /SCREEN_ORIENTATION_LOCKED : ActivityInfo\.SCREEN_ORIENTATION_UNSPECIFIED/, 'verrou et retour au capteur');
  assert.match(readFileSync('src/partie-jeu.js', 'utf8'), /typeof mo\.orientation === 'function'/, 'site : orientation seulement si la coque l\'a (APK 1.0.12)');
  assert.ok(Number((/versionCode (\d+)/.exec(gradle) || [])[1]) >= 13, 'code natif changé : versionCode 13 et plus (1.0.12)');
  console.log('✓ APK 1.0.12 : orientation (compteur de vie) déclarée et demandée par le site, versionCode ≥ 13');
}
