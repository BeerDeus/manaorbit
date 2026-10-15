// E2E : ligne du bas lue sur des photos de cartes entières (scanfoot.js) avec le vrai Tesseract (servi depuis node_modules à la place du CDN) :
// édition exacte posée (« lue sur la carte »), format récent « 0202 U / DSK • EN » et format 2014-2022 « 203/274 U / M21 • EN », langue imprimée
// (« BLB • FR ») ; puis le cadrage « carte entière » de l'écran de scan (réglage par défaut) et « Nom seulement ». Photos : tools/make-foot-fixtures.py.
import './setup-env.mjs';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { chromium, startWorld, newPage, ok, toHome } from './e2e-world.mjs';

const TESS_DIR = process.env.TESS_DIR || new URL('../tests/node_modules', import.meta.url).pathname;
if (!existsSync(TESS_DIR + '/tesseract.js')) { console.log('· tesseract.js absent (TESS_DIR) : test OCR ignoré'); process.exit(0); }
const FX = new URL('./fixtures/', import.meta.url).pathname, fx = n => FX + n;
const map = [
  [/\/npm\/tesseract\.js@5\.1\.1\/dist\/(.+)$/, m => `${TESS_DIR}/tesseract.js/dist/${m[1]}`, 'text/javascript'],
  [/\/npm\/tesseract\.js-core@5\.1\.1\/(.+)$/, m => `${TESS_DIR}/tesseract.js-core/${m[1]}`, null],
  [/\/npm\/@tesseract\.js-data\/(eng|fra)\/4\.0\.0_best_int\/(.+)$/, m => `${TESS_DIR}/@tesseract.js-data/${m[1]}/4.0.0_best_int/${m[2]}`, 'application/gzip'],
];
const world = await startWorld({ port: 18920 });
Object.assign(world.psets, { 'Sol Ring': ['cmm', 'blb', 'dsk', 'm21'], 'Command Tower': ['cmm', 'blb'] });      // n° 200, 201, 202, 203 dans cet ordre
const browser = await chromium.launch({ executablePath: (process.env.CHROMIUM || '/opt/pw-browsers/chromium'), args: ['--no-sandbox'] });
const { ctx, p, errs } = await newPage(browser, world, { goto: false });
await ctx.route('https://cdn.jsdelivr.net/**', route => {
  const u = new URL(route.request().url());
  for (const [re, file, type] of map) {
    const m = re.exec(u.pathname); if (!m) continue;
    const f = file(m); if (!existsSync(f)) return route.fulfill({ status: 404, body: 'nf' });
    return route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*' }, contentType: type || (f.endsWith('.wasm') ? 'application/wasm' : 'text/javascript'), body: readFileSync(f) });
  }
  return route.fulfill({ status: 404, body: 'nf' });
});
await p.goto(world.url); await p.waitForTimeout(700); await toHome(p);
let seen = 0;      // cartes lues (reconnues ou non) jusqu'ici : la photo suivante doit en ajouter une
const idle = async (ms = 200000) => {
  seen++;
  await p.waitForFunction(n => [...SC.items.values()].reduce((a, x) => a + x.q, 0) + SC.miss.length >= n, seen, { timeout: ms });
  await p.waitForFunction(() => !SC.working && !SC.queue.length && !SC.pend.length && ![...SC.items.values()].some(x => x.es === 'load'), null, { timeout: ms });
};
const lines = () => p.evaluate(() => Object.fromEntries([...SC.items.values()].map(x => [x.key + ' ' + (x.l || 'en') + (x.e ? ' ' + x.e : ''), x.es])));
const foot = () => p.evaluate(() => SC.foot && SC.foot.raw);
/** Capture du cadre « carte entière » (comme natCapture / scanCapture) : la photo recadrée sur la carte, lue par readCard comme une carte cadrée. */
const shoot = f => p.evaluate(async b64 => {
  const i = new Image(); i.src = 'data:image/jpeg;base64,' + b64; await i.decode();
  const c = document.createElement('canvas'); c.width = i.naturalWidth; c.height = i.naturalHeight; c.getContext('2d').drawImage(i, 0, 0);
  scanEnqueue({ label: 'Carte', src: c, strip: false, card: true, thumb: '' });
}, readFileSync(fx(f)).toString('base64'));

/* ── captures du cadre « carte entière » : la ligne du bas donne l'édition exacte ───────────────────────────────── */
assert.equal(await p.evaluate(() => SCS.frame), 'name', 'navigateur : cadrage « Nom seulement » par défaut (Tesseract) ; l\'appli Android part sur « Carte entière » (ML Kit)');
await p.evaluate(() => scsSet({ frame: 'card' }));
await p.evaluate(() => openScan()); await p.waitForSelector('.scan.on');
assert.equal(await p.$eval('.scan', s => s.classList.contains('full')), true, 'cadrage « carte entière » choisi');
await shoot('foot-dsk.jpg'); await idle();
console.log('  foot-dsk :', await foot());
let L = await lines(); assert.equal(L['sol ring en dsk|202'], 'read', 'format récent « 0202 U / DSK • EN » → DSK 202, lue sur la carte : ' + JSON.stringify(L));
await shoot('foot-m21.jpg'); await idle();
console.log('  foot-m21 :', await foot());
L = await lines(); assert.equal(L['sol ring en m21|203'], 'read', 'format 2014-2022 « 203/274 U / M21 • EN » → M21 203 : ' + JSON.stringify(L));
await shoot('foot-blb-fr.jpg'); await idle();
console.log('  foot-blb-fr :', await foot());
L = await lines(); assert.equal(L['command tower fr blb|201'], 'read', '« Tour de commandement » + « BLB • FR » → BLB 201 en français : ' + JSON.stringify(L));
assert.equal(await p.$$eval('.sc-ask', a => a.length), 0, 'rien à choisir');
await shoot('foot-preview.jpg'); await idle();
L = await lines(); console.log('  aperçu (980 px) :', await foot(), '→', L['sol ring en cmm|200'] || 'non lue');      // image de la caméra en direct : renseigne seulement (la vraie lecture se fait par ML Kit dans l'appli)
ok('photos : ligne du bas lue (formats récent et 2014-2022, langue imprimée), édition exacte posée sans rien demander');

/* ── écran de scan : cadre de carte, puis « Nom seulement » ─────────────────────────────────────────────── */
await p.click('.scan [data-act="note"]'); assert.match(await p.textContent('.sc-note'), /petite ligne en bas à gauche/, 'aide : la ligne du bas');
await p.click('.scan [data-act="scset"]'); await p.waitForSelector('.scs-sheet');
assert.equal(await p.getAttribute('.scs-ed[data-s="frame"][data-v="card"]', 'aria-checked'), 'true');
await p.click('.scs-ed[data-s="frame"][data-v="name"]');
assert.equal(await p.getAttribute('.scs-ed[data-s="frame"][data-v="name"]', 'aria-checked'), 'true');
assert.equal(await p.$eval('.scan', s => s.classList.contains('full')), false, '« Nom seulement » : caméra compacte');
await p.keyboard.press('Escape'); await p.waitForFunction(() => !document.querySelector('.sheet-wrap'));
assert.equal(await p.evaluate(() => JSON.parse(localStorage.getItem('deckdeal:scanset')).s.frame), 'name', 'réglage gardé');
await p.evaluate(() => scsSet({ frame: 'card' })); assert.equal(await p.$eval('.scan', s => s.classList.contains('full')), true);
ok('réglages du scan › Cadrage : carte entière (défaut) ou nom seulement, appliqué à l\'écran ouvert et gardé');
await p.click('.scan [data-act="close"]');

assert.deepEqual(errs.filter(e => !/getUserMedia|NotFoundError|Requested device/.test(e)), [], 'erreurs page');
await browser.close(); world.stop();
console.log('\nSCANFOOT E2E OK');
