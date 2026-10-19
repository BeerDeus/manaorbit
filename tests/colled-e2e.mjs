// E2E collection : filtre « Extension » (extensions présentes, de la plus récente à la plus ancienne, « Sans édition ») et tri « Édition » (intertitre par extension,
// numéro de collection, cartes sans édition à la fin) ; plus de tri « Coût » ni « Decks EDHREC ».
import './setup-env.mjs';
import assert from 'node:assert/strict';
import { chromium, startWorld, newPage, txt, ok, toHome } from './e2e-world.mjs';

const world = await startWorld({ port: 19492 });
const browser = await chromium.launch({ executablePath: (process.env.CHROMIUM || '/opt/pw-browsers/chromium'), args: ['--no-sandbox'] });
const T = '2 Sol Ring (CMM) 400 *FR*\\n1 Sol Ring (M21) 230 *EN*\\n1 Edgar Markov (2X2) 50 *EN*\\n1 Llanowar Elves *EN*\\n3 Arcane Signet (CMM) 380 *EN*';
const seed = `try { localStorage.setItem('deckdeal:onboard', '1'); localStorage.setItem('deckdeal:coll:v1', JSON.stringify({ t: '${T}', u: 1, s: '', b: null })); } catch (e) {}`;
const { p, errs } = await newPage(browser, world, { init: seed });
await p.route('https://api.scryfall.com/sets', route => route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*' }, json: { object: 'list', data: [
  { code: 'm21', name: 'Core Set 2021', icon_svg_uri: 'https://svgs.scryfall.io/sets/m21.svg?1', set_type: 'core', released_at: '2020-07-03' },
  { code: 'cmm', name: 'Commander Masters', icon_svg_uri: 'https://svgs.scryfall.io/sets/cmm.svg?1', set_type: 'masters', released_at: '2023-08-04' },
  { code: '2x2', name: 'Double Masters 2022', icon_svg_uri: 'https://svgs.scryfall.io/sets/2x2.svg?1', set_type: 'masters', released_at: '2022-07-08' },
] } }));
const rows = () => p.$$eval('.coll .coll-list > *', r => r.map(x => x.tagName === 'H3' ? '# ' + x.querySelector('b').textContent : x.dataset.k + ' ' + x.querySelector('.qstep b').textContent));

await p.waitForTimeout(400); await toHome(p); await p.click('#btnColl'); await p.waitForSelector('.coll.on .crow');
assert.deepEqual(await p.$$eval('#collSort option', o => o.map(x => x.value)), ['name', 'qty', 'price', 'set', 'new', 'old'], 'plus de tri « Coût » ni « Decks EDHREC »');

/* ── Filtre « Extension » ───────────────────────────────────────────────────────────────────────────────────── */
await p.click('.coll .fbtn'); await p.waitForSelector('.coll .fpanel:not([hidden]) .fset');
assert.equal(await txt(p, '.coll .fset b'), 'Toutes');
const fset = async c => { await p.click('.coll .fset'); await p.waitForSelector('.sheet-wrap.open .fs-row'); await p.click(`.sheet-wrap.open .fs-row[data-c="${c}"]`); await p.waitForFunction(() => !document.querySelector('.sheet-wrap.open')); await p.waitForTimeout(150); };
await p.click('.coll .fset'); await p.waitForSelector('.sheet-wrap.open .fs-row');
await p.waitForFunction(() => /Commander Masters/.test(document.querySelector('.sheet-wrap.open .fs-list').textContent), null, { timeout: 8000 });
const fsRows = () => p.$$eval('.sheet-wrap.open .fs-row', l => l.map(r => [r.dataset.c, r.querySelector('b').textContent, (r.querySelector('small') || {}).textContent || '', (r.querySelector('em') || {}).textContent || '', !!r.querySelector('.set-ic')]));
assert.deepEqual(await fsRows(), [['', 'Toutes les extensions', '', '5', false], ['-', 'Sans édition', '', '1', false], ['cmm', 'Commander Masters', 'CMM · 2023', '2', true], ['2x2', 'Double Masters 2022', '2X2 · 2022', '1', true], ['m21', 'Core Set 2021', 'M21 · 2020', '1', true]], 'fiche : toutes, sans édition, puis les extensions présentes (symbole, code, année, cartes), la plus récente d\'abord');
assert.ok(await p.$eval('.sheet-wrap.open .fs-q', e => getComputedStyle(e).position === 'sticky'), 'recherche en haut de la fiche');
await p.fill('.sheet-wrap.open .fs-q input', 'double'); await p.waitForTimeout(100);
assert.deepEqual((await fsRows()).map(r => r[0]), ['2x2'], 'recherche par nom'); await p.fill('.sheet-wrap.open .fs-q input', 'm21'); await p.waitForTimeout(100); assert.deepEqual((await fsRows()).map(r => r[0]), ['m21'], 'par code');
await p.screenshot({ path: 'shots/coll-ed-fiche.png' });
await p.click('.sheet-wrap.open .fs-row[data-c="m21"]'); await p.waitForFunction(() => !document.querySelector('.sheet-wrap.open')); await p.waitForTimeout(150);
assert.equal(await txt(p, '.coll .fset b'), 'Core Set 2021'); assert.ok(await p.$('.coll .fset .set-ic'), 'bouton : symbole et nom de l\'extension choisie');
await fset('cmm');
assert.deepEqual(await rows(), ['arcane signet 3', 'sol ring 2'], 'Commander Masters : ses lignes seules (Sol Ring de M21 masqué)');
assert.match(await txt(p, '.coll-count'), /2 cartes sur 4/); assert.equal(await txt(p, '.coll .fbtn b'), '1');
await p.screenshot({ path: 'shots/coll-ed-filtre.png' });
await fset('-'); assert.deepEqual(await rows(), ['llanowar elves 1'], 'sans édition');
await p.click('.coll .freset'); await p.waitForTimeout(150); assert.equal(await txt(p, '.coll .fset b'), 'Toutes'); assert.equal((await rows()).length, 5);
ok('filtre « Extension » : fiche basse (recherche, symboles, la plus récente d\'abord, nombre de cartes), lignes de l\'extension seules, « Sans édition », effacer');

/* ── Tri « Édition » ────────────────────────────────────────────────────────────────────────────────────────── */
await p.click('.coll .fbtn'); await p.selectOption('#collSort', 'set'); await p.waitForTimeout(150);
assert.deepEqual(await rows(), ['# Commander Masters', 'arcane signet 3', 'sol ring 2', 'sol ring 1', '# Double Masters 2022', 'edgar markov 1', '# Sans édition', 'llanowar elves 1'],
  'extension la plus récente d\'abord, numéro de collection (380 avant 400), carte de deux extensions sous la plus récente, sans édition à la fin');
assert.match(await txt(p, '.coll-sethd'), /Commander Masters\s*CMM · 2023/);
await p.screenshot({ path: 'shots/coll-ed-tri.png' });
await p.click('.coll .fbtn'); await fset('m21');
assert.deepEqual(await rows(), ['# Core Set 2021', 'sol ring 1'], 'filtre + tri : sous l\'extension filtrée');
ok('tri « Édition » : intertitre par extension (symbole, code, année), récentes d\'abord, numéro de collection, sans édition à la fin ; avec le filtre');

assert.deepEqual(errs, []);
await browser.close(); world.stop(); console.log('\nCOLL ED E2E OK'); process.exit(0);
