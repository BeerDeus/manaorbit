// E2E langue du lot (scan.js › scanLotLang) : un départage, jamais une règle. Lot mélangé d'extensions et de langues : rien ne change ; pile française : une carte au nom
// identique d'une langue à l'autre (« Edgar Markov ») lue « en anglais » passe en français ; une carte au nom anglais propre (« Sol Ring ») reste anglaise et vote ;
// langue lue sur la ligne du bas, langue imposée : jamais touchées ; langue du lot sans catalogue de ses noms : rien. Puis une extension unique à variantes (scaned.js),
// et un nom imprimé de plusieurs cartes (« Voie de la pyromancienne ») : l'illustration tranche, sinon « Plutôt … » d'un appui.
import './setup-env.mjs';
import assert from 'node:assert/strict';
import { chromium, startWorld, newPage, ok } from './e2e-world.mjs';

const world = await startWorld({ port: 19480 });
const browser = await chromium.launch({ executablePath: (process.env.CHROMIUM || '/opt/pw-browsers/chromium'), args: ['--no-sandbox'] });
const { p, errs } = await newPage(browser, world);
await p.evaluate(() => { FRN.map = new Map([['edgar markov', 'Edgar Markov'], ['sol ring', 'Anneau solaire']]); FRX.l = 'fr'; });
await p.evaluate(() => openScan()); await p.waitForFunction(() => !!SC.el);      // langue du lot : celle du scan ouvert
const lot = (lv, m, o = {}) => p.evaluate(async ([lv, m, o]) => { SC.lv = [...lv]; SC.lotLast = null; SCS.lang = o.lang || ''; const r = await scanLotLang(m); SCS.lang = ''; return { card: r.card, lot: !!r.lot, lv: SC.lv.join(','), last: SC.lotLast }; }, [lv, m, o]);
const edgar = { key: 'edgar markov', name: 'Edgar Markov', raw: 'Edgar Markov', card: 'en', score: 0.97 };
const solEn = { key: 'sol ring', name: 'Sol Ring', raw: 'Sol Ring', card: 'en', score: 0.97 };

let r = await lot(['fr', 'en', 'de', 'fr', 'en', 'it'], edgar);
assert.deepEqual([r.card, r.lot], ['en', false], 'lot mélangé : pas de majorité');
r = await lot(['fr', 'fr'], edgar); assert.equal(r.card, 'en', 'deux voix : trop tôt');
ok('lot mélangé (extensions et langues variées) : la langue lue reste ; deux cartes seulement : trop tôt');

r = await lot(['fr', 'fr', 'fr', 'en'], edgar);
assert.deepEqual([r.card, r.lot, r.last], ['fr', true, { name: 'Edgar Markov', a: 'en', b: 'fr' }], 'pile française : nom identique → français');
r = await lot(['fr', 'fr', 'fr', 'fr'], solEn);
assert.deepEqual([r.card, r.lot, r.lv], ['en', false, 'fr,fr,fr,fr,en'], 'nom anglais propre : reste anglaise et vote');
r = await lot(Array(8).fill('fr'), solEn); assert.equal(r.lv.split(',').length, 8, 'les 8 dernières voix seulement');
r = await lot(['en', 'en', 'fr', 'fr', 'fr', 'fr', 'fr', 'fr'], edgar);
assert.equal(r.card, 'fr', 'pile anglaise puis pile française : la langue récente');
ok('pile française : « Edgar Markov » (même nom) passe en français, « Sol Ring » reste anglaise et vote ; les 8 dernières voix');

r = await lot(['fr', 'fr', 'fr'], { ...edgar, ft: { lang: 'en', codes: [], nums: [] } }); assert.equal(r.card, 'en', 'langue lue en bas');
r = await lot(['fr', 'fr', 'fr'], edgar, { lang: 'en' }); assert.equal(r.card, 'en', 'langue imposée');
r = await lot(['fr', 'fr', 'fr'], { ...edgar, raw: 'Edgar Markow' }); assert.equal(r.card, 'fr', 'lecture approchée du même nom');
r = await lot(['de', 'de', 'de'], edgar); assert.deepEqual([r.card, r.lot], ['en', false], 'allemand sans catalogue des autres langues sur l\'appareil');
ok('langue lue en bas, langue imposée : jamais touchées ; langue du lot sans ses noms : rien');

assert.match(await p.evaluate(() => scanReadNote({ lot: true, l: 'fr' })), /langue du lot \(français\) : nom identique/);
ok('ligne du scan : « langue du lot (français) : nom identique d\'une langue à l\'autre »');
const ed = (sig, prints) => p.evaluate(([sig, prints]) => { const d = scanEdDecide({ key: 'sol ring', name: 'Sol Ring', l: 'en', q: 1, sig: sig ? [1] : null }, prints); return [d.e, d.es, !!d.solo]; }, [sig, prints]);
const P = (num, fx = []) => ({ set: 'dsk', num, l: 'en', fx });
assert.deepEqual(await ed(true, [P('202'), P('355', ['borderless'])]), ['dsk|202', 'auto', true], 'variantes, illustration lue : à comparer');
assert.deepEqual(await ed(false, [P('202'), P('355', ['borderless'])]), ['dsk|202', 'solo', true], 'nom seulement : la principale');
assert.deepEqual(await ed(true, [P('202')]), ['dsk|202', 'solo', true], 'une seule impression : posée');
ok('extension unique avec variantes (sans bordure, vitrine…), ligne du bas illisible : la principale, l\'illustration départage');

/* ── Homonymes : « Voie de la pyromancienne » = Path of the Pyromancer et Way of the Pyromancer ─────────────────────────────────── */
const amb = { key: 'path of the pyromancer', name: 'Path of the Pyromancer', raw: 'Voie de la pyromancienne', card: 'fr', score: 0.83, amb: true, alts: ['Path of the Pyromancer', 'Way of the Pyromancer'], sig: [1] };
const art = (m, pick) => p.evaluate(async ([m, pick]) => {
  const keep = [window.artPick, window.scryArtPrints];
  window.scryArtPrints = async n => [{ set: 'stx', num: n.startsWith('Way') ? '2' : '1', th: 'x', urls: ['x'], l: 'fr', fx: [] }, { set: 'sta', num: n.startsWith('Way') ? '12' : '11', th: 'y', urls: ['y'], l: 'fr', fx: [] }];
  window.artPick = async (sig, ps) => (pick ? { p: ps.find(x => x.cn === pick), d1: 0.4, d2: 0.95, n: ps.length } : { group: ps.slice(0, 2), d1: 0.4, d2: 0.41, n: ps.length });
  try { const r = await scanAmbArt(m); return [r.key, r.amb, r.ambBy || '', r.score]; } finally { [window.artPick, window.scryArtPrints] = keep; }
}, [m, pick]);
assert.deepEqual(await art(amb, 'Way of the Pyromancer'), ['way of the pyromancer', false, 'art', 0.9], 'illustration de Way of the Pyromancer : cette carte');
assert.deepEqual(await art(amb, ''), ['path of the pyromancer', true, '', 0.83], 'illustrations trop proches : à vérifier');
assert.deepEqual(await art({ ...amb, sig: null }, 'Way of the Pyromancer'), ['path of the pyromancer', true, '', 0.83], 'nom seulement (pas d\'illustration) : à vérifier');
ok('nom de plusieurs cartes : l\'illustration tranche parmi les impressions des deux ; trop proches ou sans illustration : à vérifier');
const foot = m => p.evaluate(async m => {
  const keep = [window.footRead, window.scryBySetNum];
  window.footRead = async () => ({ ft: { nums: ['2'], codes: ['STX'], lang: 'fr', langs: [], foil: false }, raw: '002 U / STX • FR' });
  window.scryBySetNum = async (set, num, l) => ({ name: 'Way of the Pyromancer', printed: 'Voie de la pyromancienne', lang: l, set, num, img: '' });
  try { const r = await footIdentify(m, null, null); return [r.key, r.amb, r.ambBy || '', r.score >= 0.92, r.card]; } finally { [window.footRead, window.scryBySetNum] = keep; }
}, m);
assert.deepEqual(await foot(amb), ['way of the pyromancer', false, 'foot', true, 'fr'], 'STX 002 : Way of the Pyromancer');
ok('nom de plusieurs cartes, ligne du bas lue : l\'extension et le numéro disent laquelle');

await p.evaluate(m => { scanAdd(m, 1, true, ''); }, { ...amb, sig: null });
const row = '.sc-item.maybe[data-k="path of the pyromancer"]';
await p.waitForSelector(row + ' .sc-alt'); assert.match(await p.$eval(row, e => e.textContent), /nom de plusieurs cartes : Path of the Pyromancer · Way of the Pyromancer[\s\S]*Plutôt Way of the Pyromancer/);
await p.click(row + ' .sc-alt'); await p.waitForSelector('.sc-item[data-k="way of the pyromancer"]');
assert.deepEqual(await p.evaluate(() => { const x = [...SC.items.values()].find(x => x.key === 'way of the pyromancer'); return [x.name, x.maybe, x.l, SC.items.size, scanReadNote(x)]; }), ['Way of the Pyromancer', false, 'fr', 1, '']);
assert.equal(await p.$('.sc-item[data-k="way of the pyromancer"] .sc-alt') !== null, true, 'l\'autre carte reste proposée');
ok('à vérifier : « Plutôt Way of the Pyromancer » change la carte d\'un appui (confirmée, édition relue)');
assert.deepEqual(errs, []);
await browser.close(); world.stop(); console.log('\nSCAN LOT E2E OK'); process.exit(0);
