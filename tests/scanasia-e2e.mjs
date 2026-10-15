// E2E cartes japonaises et coréennes, vrai Tesseract (modèles jpn, kor, eng servis depuis node_modules) : japonaise récente lue par sa ligne du bas
// (« 0202 U / DSK • JP » : extension, numéro, langue ; le nom relu par le moteur japonais la confirme) ; japonaise d'avant 2015 (rien en bas) lue en japonais quand la langue est imposée,
// puis sans rien imposer après une pile de cartes japonaises (langue du lot : le moteur japonais d'abord) ; coréenne lue en coréen. Noms comparés au
// catalogue de la langue (names-ja.tsv, names-ko.tsv), téléchargé seulement à ce moment-là. Photos : tools/make-foot-fixtures.py (asia-*).
import './setup-env.mjs';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { chromium, startWorld, newPage, ok, toHome } from './e2e-world.mjs';

const TESS_DIR = process.env.TESS_DIR || new URL('../tests/node_modules', import.meta.url).pathname;
const has = l => existsSync(`${TESS_DIR}/@tesseract.js-data/${l}/4.0.0_best_int/${l}.traineddata.gz`);
if (!existsSync(TESS_DIR + '/tesseract.js') || !has('jpn') || !has('kor')) { console.log('· tesseract.js ou modèles jpn / kor absents (TESS_DIR) : test OCR ignoré'); process.exit(0); }
const FX = new URL('./fixtures/', import.meta.url).pathname, fx = n => FX + n;
const map = [
  [/\/npm\/tesseract\.js@5\.1\.1\/dist\/(.+)$/, m => `${TESS_DIR}/tesseract.js/dist/${m[1]}`, 'text/javascript'],
  [/\/npm\/tesseract\.js-core@5\.1\.1\/(.+)$/, m => `${TESS_DIR}/tesseract.js-core/${m[1]}`, null],
  [/\/npm\/@tesseract\.js-data\/(eng|fra|jpn|kor)\/4\.0\.0_best_int\/(.+)$/, m => `${TESS_DIR}/@tesseract.js-data/${m[1]}/4.0.0_best_int/${m[2]}`, 'application/gzip'],
];
const world = await startWorld({ port: 19482 });
Object.assign(world.psets, { 'Sol Ring': ['cmm', 'blb', 'dsk', 'm21'] });      // n° 200, 201, 202, 203
world.setnum = { 'dsk/202': { name: 'Sol Ring', printed: { ja: '太陽の指輪', ko: '태양 반지' } } };
const filler = (w, n = 600) => Array.from({ length: n }, (_, i) => `${w}${i}\tFiller Card ${i}\t`).join('\n');
const CATS = { 'names-ja.tsv': '太陽の指輪\tSol Ring\t\n稲妻\tLightning Bolt\t\n' + filler('ダミー'), 'names-ko.tsv': '태양 반지\tSol Ring\t\n번개 화살\tLightning Bolt\t\n' + filler('가짜') };
const hits = {}, tess = new Set();
const browser = await chromium.launch({ executablePath: (process.env.CHROMIUM || '/opt/pw-browsers/chromium'), args: ['--no-sandbox'] });
const { ctx, p, errs } = await newPage(browser, world, { goto: false });
await ctx.route(/\/names-(ja|ko|zhs|zht)\.tsv$/, r => { const f = new URL(r.request().url()).pathname.slice(1); hits[f] = (hits[f] || 0) + 1; return CATS[f] ? r.fulfill({ status: 200, contentType: 'text/tab-separated-values; charset=utf-8', body: CATS[f] }) : r.fulfill({ status: 404, body: 'nf' }); });
await ctx.route('https://cdn.jsdelivr.net/**', route => {
  const u = new URL(route.request().url());
  for (const [re, file, type] of map) {
    const m = re.exec(u.pathname); if (!m) continue;
    if (m[2] && /^(eng|fra|jpn|kor)$/.test(m[1])) tess.add(m[1]);
    const f = file(m); if (!existsSync(f)) return route.fulfill({ status: 404, body: 'nf' });
    return route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*' }, contentType: type || (f.endsWith('.wasm') ? 'application/wasm' : 'text/javascript'), body: readFileSync(f) });
  }
  return route.fulfill({ status: 404, body: 'nf' });
});
await p.goto(world.url); await p.waitForTimeout(700); await toHome(p);
let seen = 0;
const idle = async (ms = 200000) => {
  seen++;
  await p.waitForFunction(n => [...SC.items.values()].reduce((a, x) => a + x.q, 0) + SC.miss.length >= n, seen, { timeout: ms });
  await p.waitForFunction(() => !SC.working && !SC.queue.length && !SC.pend.length && ![...SC.items.values()].some(x => x.es === 'load'), null, { timeout: ms });
};
const last = () => p.evaluate(() => { const x = SC.lastIt; return x ? [x.key, x.l, x.e || '', x.maybe, x.via || ''] : null; });
const shoot = f => p.evaluate(async b64 => {
  const i = new Image(); i.src = 'data:image/jpeg;base64,' + b64; await i.decode();
  const c = document.createElement('canvas'); c.width = i.naturalWidth; c.height = i.naturalHeight; c.getContext('2d').drawImage(i, 0, 0);
  scanEnqueue({ label: 'Carte', src: c, strip: false, card: true, thumb: '' });
}, readFileSync(fx(f)).toString('base64'));
await p.evaluate(() => scsSet({ frame: 'card' }));
await p.evaluate(() => openScan()); await p.waitForSelector('.scan.on');

/* ── japonaise récente : la ligne du bas suffit ─────────────────────────────────────────────────────────────── */
await shoot('asia-jp-foot.jpg'); await idle();
console.log('  asia-jp-foot :', await p.evaluate(() => SC.foot && SC.foot.raw), '→', JSON.stringify(await last()));
assert.deepEqual((await last()).slice(0, 4), ['sol ring', 'jp', 'dsk|202', false], '« 0202 U / DSK • JP » : Sol Ring japonaise, DSK 202, nom relu en japonais : sûre');
assert.ok(tess.has('jpn'), 'nom relu avec le moteur japonais');
assert.equal(hits['names-ja.tsv'] || 0, 0, 'catalogue japonais pas téléchargé pour rien');
ok('japonaise récente : extension, numéro et langue lus en bas (Sol Ring JP, DSK 202), nom relu en japonais pour confirmer');

/* ── japonaise d'avant 2015 : le nom lu en japonais ─────────────────────────────────────────────────────────── */
await p.evaluate(() => scsSet({ lang: 'jp' }));
await shoot('asia-jp-old.jpg'); await idle();
console.log('  asia-jp-old (japonais imposé) :', JSON.stringify(await last()), '« ' + (await p.evaluate(() => SC.lastIt && SC.lastIt.raw)) + ' »');
assert.deepEqual((await last()).slice(0, 2), ['sol ring', 'jp'], 'langue imposée : moteur japonais, « 太陽の指輪 » → Sol Ring');
assert.equal(hits['names-ja.tsv'], 1, 'catalogue japonais téléchargé une fois'); assert.ok(tess.has('jpn'), 'modèle japonais chargé');
ok('japonaise sans ligne du bas, japonais imposé : « 太陽の指輪 » lu par le moteur japonais → Sol Ring JP');

await p.evaluate(() => { scsSet({ lang: '' }); SC.lv = ['jp', 'jp', 'jp']; });
assert.deepEqual(await p.evaluate(() => ocrLangs()), ['jpn', 'fra', 'eng'], 'pile japonaise : le japonais d\'abord, puis la langue de l\'appli');
await shoot('asia-jp-old.jpg'); await idle();
assert.deepEqual((await last()).slice(0, 2), ['sol ring', 'jp'], 'sans rien imposer, après une pile japonaise');
await p.evaluate(() => { SC.lv = ['fr', 'en', 'jp', 'de']; });
assert.deepEqual(await p.evaluate(() => ocrLangs()), ['fra', 'eng'], 'lot mélangé : moteurs habituels');
ok('pile de cartes japonaises (langue du lot) : le moteur japonais passe d\'abord, sans réglage ; lot mélangé : rien ne change');

/* ── coréenne ───────────────────────────────────────────────────────────────────────────────────────────────── */
await p.evaluate(() => scsSet({ lang: 'kr' }));
await shoot('asia-kr-old.jpg'); await idle();
console.log('  asia-kr-old (coréen imposé) :', JSON.stringify(await last()), '« ' + (await p.evaluate(() => SC.lastIt && SC.lastIt.raw)) + ' »');
assert.deepEqual((await last()).slice(0, 2), ['sol ring', 'kr'], '« 태양 반지 » → Sol Ring coréenne');
assert.equal(hits['names-ko.tsv'], 1); assert.ok(tess.has('kor'));
assert.match(await p.$eval('.sc-item.last', e => e.innerHTML), /aria-label="coréen"|<title>coréen<\/title>/, 'drapeau coréen');
ok('coréenne, coréen imposé : « 태양 반지 » → Sol Ring KR (drapeau coréen)');

assert.deepEqual(errs.filter(e => !/names-(zhs|zht)/.test(e)), []);
await browser.close(); world.stop(); console.log('\nSCAN ASIE E2E OK'); process.exit(0);
