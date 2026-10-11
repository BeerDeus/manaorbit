// E2E : édition des cartes scannées (scaned.js). Posée d'office : extension unique (et elle devient collante), extension collante (dernière choisie à la main),
// majorité du scan, même carte ; sinon « à choisir » (la première carte d'un scan l'est). Symbole par ligne, feuille des éditions (celles du scan d'abord),
// cartes « à choisir » revues après chaque choix, une ligne par édition ; récap : prix de l'édition, confirmation des cartes sans édition (choisir / ajouter quand même).
import './setup-env.mjs';
import assert from 'node:assert/strict';
import { chromium, startWorld, newPage, txt, ok, toHome } from './e2e-world.mjs';

const world = await startWorld({ port: 18986 });
Object.assign(world.psets, {
  'Sol Ring': ['cmm', 'blb', 'dsk', 'm21'], 'Arcane Signet': ['cmm', 'dsk'], 'Command Tower': ['cmm', 'blb'], "Ranger's Hawk": ['blb', 'pblb'],      // pblb : promo, ne compte pas
  'Llanowar Elves': ['dsk'], 'Swords to Plowshares': ['cmm', 'lea', 'm21'], 'Wrath of God': ['m21', 'lea'], 'Edgar Markov': ['lea', 'm21'],
});
const browser = await chromium.launch({ executablePath: (process.env.CHROMIUM || '/opt/pw-browsers/chromium'), args: ['--no-sandbox'] });
const { p, errs } = await newPage(browser, world, { init: `try { if (!sessionStorage.getItem('seeded')) { sessionStorage.setItem('seeded', '1'); localStorage.setItem('deckdeal:coll:v1', JSON.stringify({ t: '1 Edgar Markov *EN*', u: 1, s: '', b: null })); } } catch (e) {}` });
await p.route('https://api.scryfall.com/sets', r => r.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*' }, json: { object: 'list', data: ['cmm', 'blb', 'dsk', 'm21', 'lea'].map(c => ({ code: c, name: c.toUpperCase() + ' Set', icon_svg_uri: `https://svgs.scryfall.io/sets/${c}.svg?1` })) } }));
const lines = () => p.evaluate(() => Object.fromEntries([...SC.items.values()].map(x => [x.key + (x.e ? ' ' + x.e : ''), x.es + ' ×' + x.q])));
const add = (name, l = 'en') => p.evaluate(([name, l]) => scanAdd({ key: ownKey(name), name, score: 0.99, raw: name, card: l }, 1, false), [name, l]);
const settle = () => p.waitForFunction(() => SC.items.size && ![...SC.items.values()].some(x => x.es === 'load'), null, { timeout: 8000 });
const tile = label => p.locator('.ced-sheet .ced-t', { hasText: label }).first().click();
const pick = async (key, label) => {
  await p.click(`.sc-item[data-k="${key}"] .sc-ed`); await p.waitForSelector('.ced-sheet .ced-t[data-i]');
  await tile(label); await p.waitForFunction(() => !document.querySelector('.sheet-wrap'));
};

await p.waitForTimeout(400); await toHome(p);
await p.evaluate(() => openScan()); await p.waitForSelector('.scan.on');

/* ── 1) première carte : à choisir ; choisie à la main → collante, les cartes à choisir sont revues ─────────────── */
await add('Sol Ring'); await settle();
assert.deepEqual(await lines(), { 'sol ring': 'pend ×1' }, 'première carte (plusieurs extensions) : à choisir');
assert.equal(await p.$$eval('.sc-item.ed .sc-ed.todo', b => b.length), 1, 'symbole « à choisir » sur la ligne'); assert.match(await txt(p, '.sc-sub'), /1 édition à choisir/);
await add('Arcane Signet'); await settle();
assert.equal((await lines())['arcane signet'], 'pend ×1', 'pas d\'extension collante : à choisir aussi');
await p.click('.sc-item[data-k="sol ring"] .sc-ed'); await p.waitForSelector('.ced-sheet .ced-t[data-i]');
assert.deepEqual(await p.$$eval('.ced-sheet .ced-t:not(.none) .ced-n', b => b.map(x => x.textContent)), ['CMM 200', 'BLB 201', 'DSK 202', 'M21 203'], 'feuille : toutes les éditions de la carte');
await tile('DSK 202'); await p.waitForFunction(() => !document.querySelector('.sheet-wrap'));
assert.deepEqual(await lines(), { 'sol ring dsk|202': 'man ×1', 'arcane signet dsk|201': 'auto ×1' }, 'choisie à la main ; Arcane Signet (existe en DSK) la prend d\'office');
assert.equal(await p.$$eval('.sc-ed.todo', b => b.length), 0); assert.equal(await p.$$eval('.sc-item[data-k="arcane signet"] .sc-ed.on.auto', b => b.length), 1, 'posée d\'office : point');
await p.waitForFunction(() => document.querySelector('.sc-item[data-k="sol ring"] .sc-ed .set-ic'), null, { timeout: 5000 });
assert.match(await p.$eval('.sc-item[data-k="sol ring"] .sc-th', i => i.src), /sol-ring-dsk\.jpg$/, 'miniature : l\'impression de l\'édition');
ok('première carte à choisir ; choisie à la main → collante, cartes à choisir revues (posées d\'office), symbole et miniature de l\'édition');

/* ── 2) extension unique : posée, devient collante, les suivantes suivent ; majorité du scan ; même carte ───────── */
await add('Command Tower'); await settle();
assert.equal((await lines())['command tower'], 'pend ×1', 'pas en DSK, majorité DSK : à choisir');
await add("Ranger's Hawk"); await settle();
let L = await lines();
assert.equal(L['rangers hawk blb|200'], 'solo ×1', 'une seule extension (promo à part) : posée'); assert.equal(L['command tower blb|201'], 'auto ×1', 'BLB devenue collante : Command Tower la prend');
await add('Llanowar Elves'); await settle();
assert.equal((await lines())['llanowar elves dsk|200'], 'solo ×1');
await add('Swords to Plowshares'); await settle();
assert.equal((await lines())['swords to plowshares'], 'pend ×1', 'ni en DSK (collante) ni en BLB (majorité) : à choisir');
await add('Sol Ring'); await settle();
assert.equal((await lines())['sol ring dsk|202'], 'man ×2', '2e Sol Ring : même édition (collante), même ligne');
await pick('swords to plowshares', 'CMM 200');
await add('Sol Ring'); await settle();
L = await lines(); assert.equal(L['sol ring dsk|202'], 'man ×2'); assert.equal(L['sol ring cmm|200'], 'auto ×1', 'CMM collante : ce Sol Ring-là a sa propre ligne');
await add('Wrath of God'); await settle();
assert.equal((await lines())['wrath of god'], 'pend ×1', 'aucune extension du scan : à choisir');
// feuille : les extensions du scan d'abord (la collante en tête)
await p.click('.sc-item[data-k="wrath of god"] .sc-ed'); await p.waitForSelector('.ced-sheet .ced-t[data-i]');
assert.equal(await p.$$eval('.ced-sheet .ced-h', h => h.length), 0, 'aucune extension du scan pour Wrath of God : pas de groupe');
await p.keyboard.press('Escape'); await p.waitForFunction(() => !document.querySelector('.sheet-wrap'));
await p.click('.sc-item[data-k="command tower"] .sc-ed'); await p.waitForSelector('.ced-sheet .ced-h');
assert.deepEqual(await p.$$eval('.ced-sheet .ced-h, .ced-sheet .ced-t:not(.none) .ced-n', b => b.map(x => x.textContent)), ['Dans ce scan', 'CMM 200', 'BLB 201'], 'extensions du scan d\'abord (CMM collante, puis BLB)');
await p.keyboard.press('Escape'); await p.waitForFunction(() => !document.querySelector('.sheet-wrap'));
await p.screenshot({ path: 'shots/scan-editions.png' });
ok('extension unique posée et collante ; majorité du scan ; même carte même ligne, autre édition autre ligne ; feuille : extensions du scan d\'abord');

/* ── 3) récap : prix de l'édition, confirmation des cartes sans édition ─────────────────────────────────────────── */
await p.click('.scan .dv-foot [data-act="done"]'); await p.waitForSelector('.rc-sheet [data-rc="go"]');
assert.match(await txt(p, '.rc-facts'), /Éditions\s*1 sans édition · 8 posées/);
await p.click('.rc-sheet [data-rc="go"]'); await p.waitForSelector('.rc-sheet .rc-ask');
assert.match(await txt(p, '.rc-ask'), /1 carte n'a pas d'édition/); assert.ok(await p.$('.rc-sheet [data-rc="force"]')); assert.equal(await p.$('.scan.on') !== null, true, 'rien d\'ajouté');
await p.click('.rc-sheet [data-rc="pick"]'); await p.waitForSelector('.ced-sheet .ced-t[data-i]');
assert.match(await txt(p, '.ced-sheet h2'), /Wrath of God/, 'Choisir les éditions : la feuille de la carte sans édition s\'ouvre');
await tile('M21 200'); await p.waitForFunction(() => !document.querySelector('.sheet-wrap'));
await p.click('.scan .dv-foot [data-act="done"]'); await p.waitForSelector('.rc-sheet [data-rc="go"]');
assert.match(await txt(p, '.rc-facts'), /Éditions\s*toutes posées/);
await p.click('.rc-sheet [data-rc="go"]'); await p.waitForFunction(() => !document.querySelector('.scan'), null, { timeout: 3000 });
const coll = await p.evaluate(() => Object.fromEntries(Object.entries(COLL.map).map(([k, x]) => [k, x.x || { [x.l || '']: x.q }])));
assert.deepEqual(coll['sol ring'], { 'en|cmm|200': 1, 'en|dsk|202': 2 }, 'collection : une ligne par édition');
assert.deepEqual(coll['wrath of god'], { 'en|m21|200': 1 }); assert.deepEqual(coll['rangers hawk'], { 'en|blb|200': 1 });
assert.equal(await p.evaluate(() => (COLL.ed['dsk|202'] || {}).sn), 'DSK Set', 'infos de l\'édition gardées');
ok('récap : cartes sans édition → confirmation, « Choisir les éditions » ouvre la carte ; ajout avec une ligne par édition');

/* ── 4) « Ajouter quand même » ; « Sans édition » choisi à la main ─────────────────────────────────────────────── */
await p.evaluate(() => openScan()); await p.waitForSelector('.scan.on');
await add('Edgar Markov'); await settle(); await add('Swords to Plowshares'); await settle();
assert.deepEqual(await lines(), { 'edgar markov': 'pend ×1', 'swords to plowshares': 'pend ×1' }, 'nouveau scan : rien de collant');
await pick('edgar markov', 'Sans édition');
assert.equal(await p.$$eval('.sc-item[data-k="edgar markov"] .sc-ed.todo', b => b.length), 0, '« Sans édition » choisi : plus à choisir');
await p.click('.scan .dv-foot [data-act="done"]'); await p.waitForSelector('.rc-sheet [data-rc="go"]');
await p.click('.rc-sheet [data-rc="go"]'); await p.waitForSelector('.rc-sheet .rc-ask'); assert.match(await txt(p, '.rc-ask'), /1 carte n'a pas d'édition/, 'seulement celle qui reste à choisir');
await p.click('.rc-sheet [data-rc="force"]'); await p.waitForFunction(() => !document.querySelector('.scan'), null, { timeout: 3000 });
assert.deepEqual(await p.evaluate(() => COLL.map['swords to plowshares'].x), { 'en|cmm|200': 1, en: 1 }, 'ajoutée sans édition (à côté de celle du 1er scan)');
ok('« Ajouter quand même » ; « Sans édition » choisi à la main ne redemande pas');

assert.deepEqual(errs, [], 'erreurs page');
await browser.close(); world.stop();
console.log('\nSCANED E2E OK');
