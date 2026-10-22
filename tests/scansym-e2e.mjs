// E2E : édition reconnue au symbole d'extension (scansym.js, scaned.js › scanArtTry › symNarrow). Cartes à la MÊME illustration dans plusieurs extensions
// (l'illustration ne départage pas), symbole différent à droite de la ligne de type, « photographiées » (lumière, flou, bruit, carte décalée et penchée ;
// tools/make-sym-fixtures.py) ; symboles de référence servis comme svgs.scryfall.io (world.symbols), liste des extensions simulée (/sets).
// Vérifie : la bonne extension parmi plusieurs à même illustration (or, argent, ligne de type longue), extension du scan contredite par le symbole ;
// symbole ambigu (presque le même chevron dans deux extensions) ou absent → rien d'imposé ; ligne du bas lue → aucun symbole lu ; symboles gardés sur l'appareil.
import './setup-env.mjs';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { chromium, startWorld, newPage, ok, toHome, scanClose } from './e2e-world.mjs';

const FX = new URL('./fixtures/sym/', import.meta.url).pathname;
const world = await startWorld({ port: 19600 });
for (const f of readdirSync(FX).filter(f => f.endsWith('.svg'))) world.symbols[f.slice(0, -4)] = readFileSync(FX + f, 'utf8');
Object.assign(world.psets, { 'Swords to Plowshares': ['tsa', 'tsb', 'tsc', 'tsd', 'tse'], 'Wrath of God': ['tsd', 'tse', 'tsf'] });      // n° 200, 201… ; même illustration partout
const SETS = Object.keys(world.symbols).map(c => ({ object: 'set', code: c, name: 'Test ' + c.toUpperCase(), set_type: 'expansion', released_at: '2020-01-01', icon_svg_uri: `https://svgs.scryfall.io/sets/${c}.svg?1700000000` }));
const browser = await chromium.launch({ executablePath: (process.env.CHROMIUM || '/opt/pw-browsers/chromium'), args: ['--no-sandbox'] });
const { p, errs } = await newPage(browser, world, { goto: false });
let setsHits = 0;
await p.route('https://api.scryfall.com/sets', route => { setsHits++; return route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*' }, json: { object: 'list', data: SETS } }); });
await p.route('https://cards.scryfall.io/small/front/**', route => {      // petites images des éditions : la même illustration (print-<code>.jpg)
  const m = /-([a-z0-9]+)\.jpg$/.exec(new URL(route.request().url()).pathname), f = m && FX + 'print-' + m[1] + '.jpg';
  if (!f || !existsSync(f)) return route.fulfill({ status: 404, body: 'nf' });
  return route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*' }, contentType: 'image/jpeg', body: readFileSync(f) });
});
await p.goto(world.url); await p.waitForTimeout(700); await toHome(p);
const lines = () => p.evaluate(() => Object.fromEntries([...SC.items.values()].map(x => [x.key + ' ' + x.l + (x.e ? ' ' + x.e : ''), x.es + ' ×' + x.q])));
const settle = () => p.waitForFunction(() => SC.items.size && ![...SC.items.values()].some(x => x.es === 'load' || x.artq) && !SART.busy, null, { timeout: 30000 });
const fetched = () => world.svgs.filter(x => x.type === 'fetch').map(x => x.f);      // symboles lus pour la comparaison (les symboles affichés sont des images)
/** La capture du cadre « carte entière », carte reconnue par son nom : empreinte d'illustration et symbole (scan.js › artAttach), puis scanAdd. */
const shoot = (file, name, l, foot) => p.evaluate(async ([b64, name, l, foot]) => {
  const i = new Image(); i.src = 'data:image/jpeg;base64,' + b64; await i.decode();
  const c = document.createElement('canvas'); c.width = i.naturalWidth; c.height = i.naturalHeight; c.getContext('2d').drawImage(i, 0, 0);
  const m = artAttach({ key: ownKey(name), name, score: 0.99, raw: name, card: l, ...(foot ? { ft: footParse(foot) } : {}) }, c);
  window.__symSeen = !!m.sym; scanAdd(m, 1, false);
}, [readFileSync(FX + file).toString('base64'), name, l, foot || null]);
const symRes = () => p.evaluate(() => SC.sym && SC.sym.res);

await p.evaluate(() => scsSet({ frame: 'card' })); await p.evaluate(() => openScan()); await p.waitForSelector('.scan.on.full');

/* ── symbole absent, symbole ambigu : rien d'imposé ─────────────────────────────────────────────── */
const artg = l => p.evaluate(l => { const x = [...SC.items.values()].find(y => y.key === 'wrath of god' && y.l === l); return x && x.artg; }, l);
await shoot('photo-none.jpg', 'Wrath of God', 'en'); await settle();
let L = await lines(); console.log('  ', JSON.stringify(L), '·', await p.evaluate(() => SC.art && SC.art.res), '·', await symRes());
assert.equal(L['wrath of god en'], 'pend ×1', 'pas de symbole sur la carte (Alpha, Beta…) : à choisir');
assert.equal(await symRes(), '∅', 'aucun symbole trouvé à sa place');
assert.deepEqual(fetched(), [], 'aucun symbole téléchargé');
await shoot('photo-tsd.jpg', 'Wrath of God', 'fr'); await settle();
L = await lines(); console.log('  ', JSON.stringify(L), '·', await symRes());
assert.equal(L['wrath of god fr'], 'pend ×1', 'chevron de TSD, presque le même que TSE : à choisir, rien d\'imposé');
assert.match(await symRes(), /^\? (TSD,TSE|TSE,TSD) · d /, 'symbole lu et comparé : TSD ou TSE, aucun sûr');
assert.deepEqual(await artg('fr'), ['tsd|200', 'tse|201'], 'TSF (autre symbole) écartée : le choix se fait entre TSD et TSE');
assert.deepEqual([...new Set(fetched())].sort(), ['tsd', 'tse', 'tsf'], 'seuls les symboles des extensions de la carte sont lus');
assert.equal(setsHits, 1, 'liste des extensions lue une fois (symboles de chaque extension)');
await p.evaluate(() => scanStick('tsf'));      // TSF devient une extension du scan (choisie plus tôt)
await shoot('photo-tsd.jpg', 'Wrath of God', 'de'); await settle();
L = await lines(); console.log('  ', JSON.stringify(L), '·', await symRes());
assert.equal(L['wrath of god de'], 'pend ×1', 'TSF, extension du scan, contredite par le symbole : pas posée d\'office');
assert.equal(L['wrath of god en tsf|202'], 'auto ×1', 'sans symbole lisible, la carte prend l\'extension du scan, comme avant');
ok('symbole absent ou presque identique dans deux extensions : rien d\'imposé ; les extensions au symbole nettement différent sont écartées');

/* ── même illustration dans 5 extensions : le symbole donne la bonne ─────────────────────────────── */
await shoot('photo-tsc.jpg', 'Swords to Plowshares', 'en'); await settle();
L = await lines(); console.log('  ', JSON.stringify(L), '·', await p.evaluate(() => SC.art && SC.art.res), '·', await symRes());
assert.match(await p.evaluate(() => SC.art.res), /5 pareilles/, 'l\'illustration ne départage pas les 5 éditions');
assert.equal(L['swords to plowshares en tsc|202'], 'sym ×1', 'symbole or (écu) : TSC, reconnue au symbole');
assert.match(await symRes(), /^TSC · d 0\.\d\d \/ /);
assert.match(await p.getAttribute('.scan.on .sc-item[data-k="swords to plowshares"] .sc-ed', 'aria-label'), /reconnue au symbole/);
assert.equal(await p.evaluate(() => SC.sets.has('tsc')), true, 'son extension rejoint celles du scan');
await shoot('photo-tsb.jpg', 'Swords to Plowshares', 'fr'); await settle();
L = await lines(); console.log('  ', JSON.stringify(L), '·', await symRes());
assert.equal(L['swords to plowshares fr tsb|201'], 'sym ×1', 'carte française, symbole argent (croissant), lumière froide : TSB, même si TSC est l\'extension du scan');
await shoot('photo-tsa.jpg', 'Swords to Plowshares', 'en'); await settle();
L = await lines(); console.log('  ', JSON.stringify(L), '·', await symRes());
assert.equal(L['swords to plowshares en tsa|200'], 'sym ×1', 'symbole noir (étoile), ligne de type longue, photo plus floue : TSA');
assert.equal(L['wrath of god fr'], 'pend ×1', 'les cartes à choisir d\'autres extensions ne bougent pas');
ok('même illustration dans plusieurs extensions : la bonne trouvée au symbole (or, argent, noir), « reconnue au symbole »');

/* ── ligne du bas lue : aucun symbole lu ─────────────────────────────────────────────────────────── */
await p.evaluate(() => { window.__symCalls = 0; const f = window.symRefKnown; window.symRefKnown = u => { window.__symCalls++; return f(u); }; });
const before = await symRes();
await shoot('photo-tsc.jpg', 'Swords to Plowshares', 'en', ['0203 C', 'TSD • EN']); await settle();      // impressions anglaises déjà lues : édition lue tout de suite
await shoot('photo-tsc.jpg', 'Swords to Plowshares', 'it', ['0203 C', 'TSD • IT']); await settle();      // impressions italiennes lues ensuite : l'illustration est comparée, pas le symbole
L = await lines(); console.log('  ', JSON.stringify(L));
assert.equal(L['swords to plowshares en tsd|203'], 'read ×1', 'ligne du bas : TSD 203, lue sur la carte (le symbole de la photo, TSC, n\'est pas regardé)');
assert.equal(L['swords to plowshares it tsd|203'], 'read ×1');
assert.equal(await p.evaluate(() => window.__symCalls), 0, 'aucun symbole cherché');
assert.equal(await symRes(), before, 'diagnostic inchangé');
assert.equal(await p.evaluate(() => [...SC.items.values()].some(x => x.sym)), false, 'aucune signature gardée');
ok('ligne du bas lue : rien n\'est comparé au symbole');
await scanClose(p); await p.waitForFunction(() => !SC.el);

/* ── symboles gardés sur l'appareil : relance de l'appli, aucune requête ──────────────────────────── */
await p.reload(); await p.waitForTimeout(700); await toHome(p);
const n0 = fetched().length;
await p.evaluate(() => scsSet({ frame: 'card' })); await p.evaluate(() => openScan()); await p.waitForSelector('.scan.on.full');
await shoot('photo-tsb.jpg', 'Swords to Plowshares', 'en'); await settle();
L = await lines(); console.log('  ', JSON.stringify(L), '·', await symRes());
assert.equal(L['swords to plowshares en tsb|201'], 'sym ×1', 'nouveau scan : TSB au symbole');
assert.equal(fetched().length, n0, 'symboles relus de l\'appareil (IndexedDB), aucun téléchargé');
ok('symboles de référence gardés sur l\'appareil : rien de retéléchargé');
await scanClose(p);

assert.deepEqual(errs, [], 'erreurs page');
await browser.close(); world.stop();
console.log('\nSCANSYM E2E OK');
