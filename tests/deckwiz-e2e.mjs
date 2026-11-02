// E2E assistant de deck Commander (fonctionnalité en test « deckwiz » : src/labs.js, src/deckwiz.js, onglet Coach de builder.js).
// Ligne « Fonctionnalités en test » (compte de l'éditeur seulement), éteinte : création de deck inchangée ; allumée : « J'ai déjà ce deck » (coller la liste) /
// « Deck à construire » (assistant : commandant, thèmes, bracket, budget), onglet Coach (jauges, suggestions dans l'identité de couleur, le bracket et le budget,
// ajout au deck, terrains de base, Game Changers, réglages gardés avec le deck), base du coach absente (modèle de base). Faux edh.tsv et faux /api/dkw (routes Playwright).
import './setup-env.mjs';
import assert from 'node:assert/strict';
import { chromium, startWorld, newPage, txt, ok, signInFake, closeSheets } from './e2e-world.mjs';

const world = await startWorld({ port: 19840 });
const browser = await chromium.launch({ executablePath: (process.env.CHROMIUM || '/opt/pw-browsers/chromium'), args: ['--no-sandbox'] });

const FILE = ['#edh\t1\t2026-10-03T04:00:00Z', 'C\tedgar-markov\t12345\tWBR\tEdgar Markov', 'C\tcraterhoof-behemoth\t100\tG\tCraterhoof Behemoth',
  'D\tedgar-markov\tedhrec\tDeck moyen\thttps://edhrec.com/average-decks/edgar-markov', 'K\t1\tSol Ring', 'K\t1\tArcane Signet', 'K\t30\tPlains',
  'D\tcraterhoof-behemoth\tedhrec\tDeck moyen\thttps://edhrec.com/average-decks/craterhoof-behemoth', 'K\t1\tSol Ring', 'K\t30\tForest'].join('\n') + '\n';
// [nom, identité, coût, types, rôles, prix (centimes), drapeaux (1 GC · 2 tour sup. · 4 destruction de terrains · 8 tuteur), couleurs produites, rang]
const R = { land: 1, ramp: 2, draw: 4, removal: 8, wipe: 16, counter: 32, tutor: 64, protect: 128, recursion: 256 };
const CARDS = [['Edgar Markov', 'WBR', 4, 2 | 256, 0, 500, 0, '', 300], ['Sol Ring', '', 1, 4, R.ramp, 150, 1, 'C', 1], ['Arcane Signet', '', 2, 4, R.ramp, 40, 0, 'WUBRG', 3],
  ['Swords to Plowshares', 'W', 1, 16, R.removal, 190, 0, '', 10], ['Wrath of God', 'W', 4, 32, R.wipe, 150, 0, '', 40], ['Llanowar Elves', 'G', 1, 2, R.ramp, 20, 0, 'G', 20],
  ['Rhystic Study', 'U', 3, 8, R.draw, 3000, 1, '', 5], ["Night's Whisper", 'B', 2, 32, R.draw, 30, 0, '', 50], ['Phyrexian Arena', 'B', 3, 8, R.draw, 400, 0, '', 60],
  ['Demonic Tutor', 'B', 2, 32, R.tutor, 3500, 9, '', 30], ['Armageddon', 'W', 4, 32, R.wipe, 900, 4, '', 900], ['Gilded Removal', 'W', 2, 16, R.removal, 90000, 0, '', 70],
  ['Weak One', 'B', 3, 2, 0, 500, 0, '', 5000], ['Plains', 'W', 0, 1, R.land, 0, 0, 'W', 0], ['Swamp', 'B', 0, 1, R.land, 0, 0, 'B', 0], ['Mountain', 'R', 0, 1, R.land, 0, 0, 'R', 0], ['Command Tower', '', 0, 1, R.land, 20, 0, 'WUBRG', 2]];
const st = (lo, mid, hi) => [lo, mid, hi];
const TG = { n: 500, land: st(35, 36, 37), ramp: st(9, 10, 12), draw: st(8, 10, 12), removal: st(7, 9, 11), wipe: st(2, 3, 4), counter: st(0, 1, 3), tutor: st(0, 1, 3), protect: st(2, 3, 5), recursion: st(1, 2, 4), wincon: st(1, 2, 3), mv: st(2.8, 3.1, 3.4), cheap: st(6, 9, 12), gc: st(0, 0, 1) };
const CORE = { v: 1, at: '2026-11-01T00:00:00Z', roles: Object.keys(R).concat('wincon'), cards: CARDS, tg: { all: TG, recent: TG, br: {}, th: {}, nc: {} }, cmds: ['edgar-markov'], themes: [], src: { decks: 1234 } };
const PACK = { slug: 'edgar-markov', n: 12345, land: 36, thl: [['vampires', 'Vampires', 9000], ['aggro', 'Aggro', 2000]], cards: [['Sol Ring', 95, -2], ['Arcane Signet', 80, 5], ['Swords to Plowshares', 60, 10], ['Llanowar Elves', 50, 30], ['Night\'s Whisper', 40, 20], ['Phyrexian Arena', 30, 25], ['Gilded Removal', 30, 40], ['Wrath of God', 30, 5], ['Demonic Tutor', 25, 1], ['Armageddon', 5, 1], ['Command Tower', 90, 0], ...Array.from({ length: 40 }, (_, i) => ['Filler ' + i, 1, 0])], th: {}, xc: [], tg: null };      // ≥ 40 cartes : commandant connu (avis sur les cartes faibles)
let dkwHits = 0, dkwOff = false;
const one = p => p.waitForFunction(() => document.querySelectorAll('.sheet-wrap').length === 1);      // la feuille d'avant a fini de se fermer
async function prep(p) {
  await p.route('**/edh.tsv', r => r.fulfill({ status: 200, contentType: 'text/tab-separated-values; charset=utf-8', body: FILE }));
  await p.route('**/api/dkw*', r => {
    dkwHits++; if (dkwOff) return r.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"unavailable"}' });
    const c = new URL(r.request().url()).searchParams.get('c');
    return r.fulfill({ status: c && c !== 'edgar-markov' ? 404 : 200, contentType: 'application/json', body: JSON.stringify(c ? PACK : CORE) });
  });
}
const { p, errs } = await newPage(browser, world, { ctx: { viewport: { width: 393, height: 852 } } });
await prep(p);
await signInFake(p);
await p.evaluate(() => { COLL.map = collFromText('1 Arcane Signet\n1 Swords to Plowshares'); collChanged(); });

/* ── 1) Fonctionnalités en test : ligne réservée au compte de l'éditeur ; éteintes, rien ne change ── */
assert.equal(await p.evaluate(() => labsRow()), '', 'compte quelconque : pas de ligne');
assert.match(await p.evaluate(() => { const a = EV.adm; EV.adm = EV.uid; const h = labsRow(); EV.adm = a; return h; }), /Fonctionnalités en test[\s\S]*Assistant de deck Commander/, 'compte de l\'éditeur : la ligne et son interrupteur');
assert.equal(await p.evaluate(() => labOn('deckwiz')), false);
await p.evaluate(() => openDeckNew()); await p.waitForSelector('#ndName');
await p.fill('#ndName', 'Sans coach'); await p.click('#ndFmt .seg-opt[data-v="commander"]'); await p.click('#ndGo'); await p.waitForSelector('.bd.on');
assert.equal(await p.$('#bdSeg .seg-opt[data-v="coach"]'), null, 'éteinte : pas d\'onglet Coach');
await p.evaluate(() => bdClose(true)); await p.waitForFunction(() => !document.querySelector('.bd'));
ok('fonctionnalités en test : éteintes par défaut, ligne de l\'éditeur seulement');

/* ── 2) Allumée (pour la session) : « J'ai déjà ce deck » › « Coller la liste » ── */
await p.evaluate(() => labSet('deckwiz', true)); assert.equal(await p.evaluate(() => sessionStorage.getItem('deckdeal:labs')), '{"deckwiz":1}');
await p.evaluate(() => openDeckNew()); await p.waitForSelector('#ndName');
await p.fill('#ndName', 'Edgar collé'); await p.click('#ndFmt .seg-opt[data-v="commander"]'); await p.click('#ndGo');
await p.waitForSelector('.dw-start[data-v="have"]'); await one(p); assert.deepEqual(await p.$$eval('.dw-start b', b => b.map(x => x.textContent)), ['J\'ai déjà ce deck', 'Deck à construire']);
await p.click('.dw-start[data-v="have"]'); await p.waitForSelector('.dw-start[data-v="paste"]'); await one(p);
assert.deepEqual(await p.$$eval('.dw-start b', b => b.map(x => x.textContent)), ['Scanner le deck', 'Coller la liste', 'À la main']);
await p.click('.dw-start[data-v="paste"]'); await p.waitForSelector('#dwPaste');
await p.fill('#dwPaste', 'Commander\n1 Edgar Markov\n\nDeck\n1 Sol Ring\n1 Arcane Signet\n10 Plains'); await p.click('#dwPasteGo'); await p.waitForSelector('.bd.on');
assert.deepEqual(await p.evaluate(() => [BD.name, BD.fmt, BD.cmdr.map(c => c.name), BD.main.size, BD.dirty]), ['Edgar collé', 'commander', ['Edgar Markov'], 3, true]);
assert.ok(await p.$('#bdSeg .seg-opt[data-v="coach"]'), 'onglet Coach');
await p.evaluate(() => bdClose(true)); await p.waitForFunction(() => !document.querySelector('.bd'));
ok('« J\'ai déjà ce deck » : coller la liste (commandant, cartes, à enregistrer)');

/* ── 3) « Deck à construire » : assistant (commandant, thèmes, bracket, budget) ── */
await p.evaluate(() => openDeckNew()); await p.waitForSelector('#ndName');
await p.click('#ndFmt .seg-opt[data-v="commander"]'); await p.click('#ndGo'); await p.waitForSelector('.dw-start[data-v="build"]');
await p.click('.dw-start[data-v="build"]'); await p.waitForSelector('#dwzQ');
await p.waitForSelector('.dw-cmd[data-slug="edgar-markov"]', { timeout: 15000 });
await p.fill('#dwzQ', 'crater'); await p.waitForFunction(() => [...document.querySelectorAll('.dw-cmd')].map(b => b.dataset.slug).join() === 'craterhoof-behemoth');
await p.fill('#dwzQ', 'edgar'); await p.waitForSelector('.dw-cmd[data-slug="edgar-markov"]'); await p.click('.dw-cmd[data-slug="edgar-markov"]');
await p.waitForSelector('#dwzGo');
assert.equal(await p.$eval('#dwzName', i => i.value), 'Edgar Markov');
await p.click('[data-br="2"]'); await p.click('[data-bud="5000"]');
assert.match(await txt(p, '.sheet-wrap:last-child .sheet-body'), /Core/);
await p.click('#dwzGo'); await p.waitForSelector('.bd.on'); await p.waitForSelector('.dw-gauges .dw-g', { timeout: 15000 });
assert.deepEqual(await p.evaluate(() => [BD.tab, BD.cmdr.map(c => c.key), BD.wiz.br, BD.wiz.bud]), ['coach', ['edgar markov'], 2, 5000]);
await p.waitForFunction(() => DW.core && DW.cmd.has('edgar-markov'));
const gauges = await p.$$eval('.dw-gl b', b => b.map(x => x.textContent));
assert.deepEqual(gauges.slice(0, 5), ['Terrains', 'Rampe', 'Pioche', 'Retraits ciblés', 'Balayages']); assert.ok(!gauges.includes('Contresorts'), 'pas de bleu : pas de jauge des contresorts');
ok('assistant : commandant cherché, bracket 2, budget 50 €, coach ouvert');

/* ── 4) Suggestions : identité de couleur, bracket (Game Changers), budget, collection d'abord ; ajout au deck ── */
await p.click('.dw-gh[data-r="ramp"]'); await p.waitForSelector('.dw-g.open .dw-row');
const ramp = await p.$$eval('.dw-g.open .dw-row', r => r.map(x => x.dataset.k));
assert.deepEqual(ramp, ['arcane signet'], 'Sol Ring (Game Changer interdit en bracket 2) et Llanowar Elves (vert) écartés');
await p.click('.dw-g.open .dw-row[data-k="arcane signet"] .dw-add button'); await p.waitForFunction(() => BD.main.has('arcane signet'));
assert.match(await txt(p, '.dw-g.open .dw-gn'), /^1 \/ 10$/); assert.equal(await p.$('.dw-g.open .dw-row[data-k="arcane signet"]'), null, 'ajoutée : plus suggérée');
await p.click('.dw-gh[data-r="removal"]'); await p.waitForSelector('.dw-g.open .dw-row');
assert.deepEqual(await p.$$eval('.dw-g.open .dw-row', r => r.map(x => x.dataset.k)), ['swords to plowshares'], 'Gilded Removal (900 €) au-dessus du budget');
await p.click('.dw-gh[data-r="draw"]'); await p.waitForSelector('.dw-g.open .dw-row');
assert.deepEqual(await p.$$eval('.dw-g.open .dw-row', r => r.map(x => x.dataset.k)), ['nights whisper', 'phyrexian arena'], 'pioche noire, Rhystic Study (bleu) écartée');
assert.match(await txt(p, '.dw-g.open .dw-row'), /40 % des decks de Edgar Markov/);
ok('suggestions : couleurs, Game Changers, budget, raison affichée, ajout');

/* ── 5) Bracket, terrains de base, réglages gardés avec le deck ── */
await p.evaluate(() => { bdChange('main', 'sol ring', 'Sol Ring', 1); bdChange('main', 'armageddon', 'Armageddon', 1); });
await p.waitForFunction(() => /Game Changers interdits/.test(document.querySelector('.dw-br').textContent));
assert.match(await txt(p, '.dw-br'), /Destruction massive de terrains interdite en bracket 2 : Armageddon/);
await p.click('.dw-gh[data-r="land"]'); await p.waitForSelector('[data-act="dw-basics"]'); await p.click('[data-act="dw-basics"]');
const basics = await p.evaluate(() => ['plains', 'swamp', 'mountain'].map(k => (BD.main.get(k) || {}).qty || 0));
assert.equal(basics.reduce((a, b) => a + b, 0), await p.evaluate(() => dwTargets(dwProfile(), dwCmdOf(), DW.cmd.get('edgar-markov')).land[1]), 'terrains de base jusqu\'à la cible');
assert.ok(basics.every(n => n > 0), 'une couleur par couleur du commandant');
await p.click('[data-act="dw-set"]'); await p.waitForSelector('#dwBud'); await p.fill('#dwBud', '200'); await p.dispatchEvent('#dwBud', 'change');
await p.waitForFunction(() => BD.wiz.bud === 20000);
await p.click('#bdSave'); await p.waitForFunction(() => !document.querySelector('.bd'));
const id = await p.evaluate(() => allDecks().find(d => d.name === 'Edgar Markov').id);
assert.deepEqual(await p.evaluate(id => JSON.parse(localStorage.getItem('deckdeal:dw:' + id)), id), { th: [], br: 2, bud: 20000, own: true });
await p.evaluate(id => openBuilder({ id }), id); await p.waitForSelector('.bd.on'); await p.click('#bdSeg .seg-opt[data-v="coach"]'); await p.waitForSelector('.dw-gauges');
assert.match(await txt(p, '.dw-set-h'), /bracket 2/); assert.equal(await p.evaluate(() => BD.wiz.bud), 20000);
await p.evaluate(() => bdClose(true));
ok('bracket (Game Changers, destruction de terrains), terrains de base, réglages gardés avec le deck');

/* ── 6) Analyser un deck (viewer) : bracket estimé, échanges conseillés, limite de prix, ouverture dans l'éditeur avec les échanges ── */
await p.evaluate(() => putDeck('dk-ana', deckDoc({ name: 'Edgar à analyser', text: 'Commander\n1 Edgar Markov\n\nDeck\n1 Weak One\n1 Phyrexian Arena\n1 Gilded Removal\n1 Command Tower\n30 Plains', opts: { ...S.opts } })));
await p.evaluate(() => openDeckViewer({ id: 'dk-ana' })); await p.waitForSelector('.dv.on .dv-ana');
await p.click('.dv-ana'); await p.waitForSelector('.da-sum', { timeout: 15000 });
assert.match(await txt(p, '.da-sum'), /Bracket estimé 2 · Core/);
await p.waitForSelector('.da-sw');
const swRows = () => p.$$eval('.da-sw', r => r.map(x => [...x.querySelectorAll('.da-c b')].map(b => b.textContent).join(' → ') + ' | ' + x.querySelector('.da-why').textContent).map(t => t.replace(/\s+/g, ' ')));
let sws = await swRows();
assert.equal(sws.length, 1, 'un seul échange utile : ' + sws.join(' | ')); assert.equal(sws[0], 'Weak One → Arcane Signet | Il manque : Rampe · 80 % des decks (contre 0 %) · −4,60 €');
await p.fill('#daBud', '100'); await p.dispatchEvent('#daBud', 'change');
await p.waitForFunction(() => document.querySelectorAll('.da-sw').length === 2);
sws = await swRows();
assert.match(sws[0], /^Gilded Removal → Swords to Plowshares \| Même rôle, bien moins chère/, 'au-dessus de la limite : la carte chère d\'abord');
assert.match(await txt(p, '#daGo'), /Ouvrir dans l'éditeur avec 2 échanges/);
await p.click('.da-sw input[data-da-sw="1"]'); await p.waitForFunction(() => /avec 1 échange$/.test(document.querySelector('#daGo').textContent));
await p.click('#daGo'); await p.waitForSelector('.bd.on'); await p.waitForSelector('.dw-gauges');
assert.deepEqual(await p.evaluate(() => [BD.id, BD.tab, BD.dirty, BD.main.has('gilded removal'), BD.main.has('swords to plowshares'), BD.main.has('weak one'), BD.wiz.bud]), ['dk-ana', 'coach', true, false, true, true, 10000]);
await p.evaluate(() => bdClose(true)); await p.waitForFunction(() => !document.querySelector('.bd'));
ok('analyse : bracket estimé, échanges (rôle qui manque, limite de prix), cochés appliqués dans l\'éditeur');

/* ── 7) Base du coach indisponible : modèle de base, pas de suggestions ── */
dkwOff = true;
await p.evaluate(() => { DW.core = null; DW.byKey = null; DW.err = ''; DW.cmd.clear(); return Cache.set('dkw:core', null); });
await p.evaluate(id => openBuilder({ id, tab: 'coach' }), id); await p.waitForSelector('.bd.on'); await p.click('#bdSeg .seg-opt[data-v="coach"]');
await p.waitForFunction(() => /Base du coach indisponible/.test(document.querySelector('#bdList').textContent), null, { timeout: 10000 });
assert.ok(await p.$('.dw-gauges .dw-g'), 'jauges du modèle de base');
await p.click('.dw-gh[data-r="ramp"]'); assert.equal(await p.$('.dw-g.open .dw-row'), null, 'sans base : pas de suggestions');
await p.evaluate(() => bdClose(true)); await closeSheets(p);
ok('base du coach indisponible : modèle de base');

assert.deepEqual(errs.filter(e => !/Failed to load resource|net::ERR/.test(e)), [], 'aucune erreur de page');
await browser.close(); world.stop();
console.log('deckwiz-e2e : OK');
process.exit(0);
