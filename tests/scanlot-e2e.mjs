// E2E langue du lot (scan.js › scanLot) : un départage, jamais une règle. Lot mélangé d'extensions et de langues : rien ne change ; pile française : une carte au nom
// identique d'une langue à l'autre (« Edgar Markov ») lue « en anglais » passe en français ; une carte au nom anglais propre (« Sol Ring ») reste anglaise et vote ;
// langue lue sur la ligne du bas, langue imposée : jamais touchées ; langue du lot sans catalogue de ses noms : rien. Puis une extension unique à variantes (scaned.js).
import './setup-env.mjs';
import assert from 'node:assert/strict';
import { chromium, startWorld, newPage, ok } from './e2e-world.mjs';

const world = await startWorld({ port: 19480 });
const browser = await chromium.launch({ executablePath: (process.env.CHROMIUM || '/opt/pw-browsers/chromium'), args: ['--no-sandbox'] });
const { p, errs } = await newPage(browser, world);
await p.evaluate(() => { FRN.map = new Map([['edgar markov', 'Edgar Markov'], ['sol ring', 'Anneau solaire']]); FRX.l = 'fr'; });
const lot = (lv, m, o = {}) => p.evaluate(async ([lv, m, o]) => { SC.lv = [...lv]; SC.lotLast = null; SCS.lang = o.lang || ''; const r = await scanLot(m); SCS.lang = ''; return { card: r.card, lot: !!r.lot, lv: SC.lv.join(','), last: SC.lotLast }; }, [lv, m, o]);
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
assert.deepEqual(errs, []);
await browser.close(); world.stop(); console.log('\nSCAN LOT E2E OK'); process.exit(0);
