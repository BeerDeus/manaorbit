// E2E préchargement hebdomadaire (warm.js) : étapes (infos de la collection, éditions, éditions uniques, cartes des decks, symboles, noms, petites images),
// règle des 7 jours, pause quand l'écran bouge, reprise après arrêt, images sautées en réseau mobile, état dans Réglages › Hors ligne.
import './setup-env.mjs';
import assert from 'node:assert/strict';
import { chromium, startWorld, newPage, ok, txt, toHome } from './e2e-world.mjs';

const world = await startWorld({ port: 18998 });
const browser = await chromium.launch({ executablePath: (process.env.CHROMIUM || '/opt/pw-browsers/chromium'), args: ['--no-sandbox'] });
const decks = [{ id: 'd1', name: 'Rakdos', text: '// Deck Deal : standard\nDeck\n4 Sol Ring\n2 Wrath of God\n2 Craterhoof Behemoth', updatedAt: 40, opts: {}, cards: 3, history: [], createdAt: 1 }];
const seed = (extra = '') => `try { window.__warmTest = true; if (!sessionStorage.getItem('seeded')) { sessionStorage.setItem('seeded', '1'); localStorage.setItem('deckdeal:coll:v1', JSON.stringify({ t: '2 Sol Ring *FR*\\n1 Arcane Signet (CMM) 100 *EN*\\n1 Edgar Markov *EN*', u: 1, s: '', b: null })); localStorage.setItem('deckdeal:decks:v1', ${JSON.stringify(JSON.stringify(decks))}); } ${extra} } catch (e) {}`;
const setsJson = { object: 'list', data: [{ code: 'cmm', name: 'Commander Masters', icon_svg_uri: 'https://svgs.scryfall.io/sets/cmm.svg?1' }] };
async function open(extra) {
  const pg = await newPage(browser, world, { init: seed(extra) });
  const imgs = [], svgs = [], sets = [];
  pg.p.on('request', r => { const u = r.url(); if (/^https:\/\/cards\.scryfall\.io\/small\//.test(u) && r.resourceType() === 'fetch') imgs.push(u); if (/svgs\.scryfall\.io/.test(u) && r.resourceType() === 'fetch') svgs.push(u); });
  await pg.p.route('https://api.scryfall.com/sets', r => sets.push(1) && r.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*' }, json: setsJson }));
  await pg.p.waitForTimeout(400);
  return { ...pg, imgs, svgs, sets };
}
const st = p => p.evaluate(() => JSON.parse(localStorage.getItem('deckdeal:warm:v1') || 'null'));

/* ── 1) préchargement complet : chaque étape, puis la date ─────────────────────────────────────────────────── */
const A = await open(); const { p } = A;
assert.equal(await p.evaluate(() => WARM.run), null, 'tests automatisés : rien de lancé d\'office');
const before = world.scry.length;
await p.evaluate(() => warmMaybe(true)); await p.waitForFunction(() => !WARM.run, null, { timeout: 30000 });
const calls = world.scry.slice(before);
assert.ok(calls.some(c => /^POST \/cards\/collection/.test(c)), 'infos des cartes et prix des éditions');
assert.ok(calls.some(c => /paperprints%3D1|paperprints=1/.test(c)), 'éditions uniques');
assert.ok(A.sets.length >= 1, 'symboles des extensions'); assert.ok(A.svgs.some(u => /cmm\.svg/.test(u)), 'symbole de CMM préchargé');
assert.ok(calls.some(c => /catalog\/card-names/.test(c)), 'catalogue des noms');
assert.equal(await p.evaluate(() => !!(DM['craterhoof behemoth'] || COLL.meta['craterhoof behemoth'])), true, 'cartes des decks lues (pas dans la collection)');
const want = await p.evaluate(() => warmImages().length);
assert.ok(want >= 4, 'images : collection, édition, decks (' + want + ')'); assert.equal(new Set(A.imgs).size, want, 'toutes les petites images lues une fois');
assert.ok(A.imgs.every(u => /\/small\//.test(u)), 'jamais de grandes images');
let s = await st(p); assert.equal(s.step, 0); assert.ok(Date.now() - s.at < 60000); assert.equal(s.imgs, want);
ok('préchargement : infos, éditions, éditions uniques, decks, symboles, noms, ' + want + ' petites images ; date enregistrée');

/* ── 2) Réglages › Hors ligne ; règle des 7 jours ─────────────────────────────────────────────────────────── */
await toHome(p); await p.evaluate(() => openSettings('donnees')); await p.waitForSelector('#warmBox .warm-st');
assert.match(await txt(p, '#warmBox .warm-st'), new RegExp('Dernier préchargement : .* · ' + want + ' images'));
assert.equal(await txt(p, '#warmBox [data-warm]'), 'Précharger maintenant');
await p.evaluate(() => { while (sheets.length) sheets[sheets.length - 1].close(); }); await p.waitForFunction(() => !document.querySelector('.sheet-wrap'));      // Données de l'appareil, puis Compte et réglages
assert.equal(await p.evaluate(() => warmMaybe()), null, 'fait il y a moins de 7 jours : rien');
await p.evaluate(() => { WARM.st.at = Date.now() - 8 * 864e5; });
const r8 = await p.evaluate(() => !!warmMaybe()); assert.equal(r8, true, 'plus de 7 jours : relancé'); await p.waitForFunction(() => !WARM.run, null, { timeout: 30000 });
ok('Réglages › Hors ligne : date et nombre d\'images ; relancé seulement après 7 jours');

/* ── 3) pause quand l'écran bouge ; arrêt puis reprise où il en était ───────────────────────────────────────── */
await p.evaluate(() => { collAdd(['Swords to Plowshares', 'Command Tower', 'Llanowar Elves', 'Wrath of God', 'Craterhoof Behemoth'].map(n => ({ k: ownKey(n), n, q: 1, l: 'en' })), 'add'); });
await p.evaluate(() => collEnrich()); await p.waitForFunction(() => !COLL.enrich && !collMissing().length, null, { timeout: 15000 });
await p.route('https://cards.scryfall.io/small/**', async r => { await new Promise(res => setTimeout(res, 700)); r.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*' }, contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="146" height="204"/>' }); });      // images lentes : on peut arrêter en cours de route
await p.evaluate(() => { WARM.touch = Date.now() + 1e9; });      // l'utilisateur fait défiler, touche… sans arrêt
A.imgs.length = 0; await p.evaluate(() => { warmMaybe(true); }); await p.waitForTimeout(2500);
assert.equal(A.imgs.length, 0, 'aucune image pendant que l\'écran bouge'); assert.equal(await p.evaluate(() => WARM.phase), 'coll', 'en pause dès la première étape');
await p.evaluate(() => { WARM.touch = 0; }); await p.waitForFunction(() => WARM.phase === 'images' && WARM.done >= 1, null, { timeout: 20000 });
await p.evaluate(() => { WARM.stop = true; }); await p.waitForFunction(() => !WARM.run, null, { timeout: 10000 });
s = await st(p); assert.equal(s.step, 5, 'arrêté pendant les images : étape gardée'); assert.ok(s.i >= 1, 'position gardée');
const done = s.i, want3 = await p.evaluate(() => warmImages().length); A.imgs.length = 0; assert.ok(done < want3, 'arrêté avant la fin (' + done + ' / ' + want3 + ')');
await p.evaluate(() => warmMaybe()); await p.waitForFunction(() => !WARM.run, null, { timeout: 30000 });
assert.equal(new Set(A.imgs).size, want3 - done, 'reprise : seulement les images restantes'); assert.equal((await st(p)).step, 0);
ok('pause quand l\'écran bouge ; arrêt puis reprise à l\'image où il s\'était arrêté');
await p.context().close();

/* ── 4) réseau mobile : pas d'images, le dit dans les Réglages ──────────────────────────────────────────────── */
const B = await open(`Object.defineProperty(navigator, 'connection', { configurable: true, value: { type: 'cellular', effectiveType: '4g', saveData: false, addEventListener() {} } });`);
await B.p.evaluate(() => warmMaybe(true)); await B.p.waitForFunction(() => !WARM.run, null, { timeout: 30000 });
assert.equal(B.imgs.length, 0, 'réseau mobile : aucune image'); assert.ok(world.scry.length > 0);
await toHome(B.p); await B.p.evaluate(() => openSettings('donnees')); await B.p.waitForSelector('#warmBox .warm-st');
assert.match(await txt(B.p, '#warmBox .warm-st'), /Images sautées : réseau mobile/);
ok('réseau mobile : infos préchargées, images sautées (dit dans les Réglages)');

assert.deepEqual([...A.errs, ...B.errs], [], 'erreurs page');
await browser.close(); world.stop();
console.log('\nWARM E2E OK');
