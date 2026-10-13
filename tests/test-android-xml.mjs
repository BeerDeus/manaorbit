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
