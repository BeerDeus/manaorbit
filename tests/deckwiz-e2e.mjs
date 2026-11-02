// E2E assistant de deck Commander (fonctionnalité en test « deckwiz » : src/labs.js, src/deckwiz.js, onglet Coach de builder.js).
// Ligne « Fonctionnalités en test » (compte de l'éditeur seulement), éteinte : création de deck inchangée ; allumée : « J'ai déjà ce deck » (coller la liste) /
// « Deck à construire » (assistant : commandant, thèmes, bracket, budget), onglet Coach (jauges, suggestions dans l'identité de couleur, le bracket et le budget,
// ajout au deck, terrains de base, Game Changers, réglages gardés avec le deck), base du coach absente (modèle de base). Faux edh.tsv et faux /api/dkw (routes Playwright).
import './setup-env.mjs';
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { chromium, startWorld, newPage, txt, ok, signInFake, closeSheets } from './e2e-world.mjs';

const SHOTS = process.env.DW_SHOTS || ''; if (SHOTS) mkdirSync(SHOTS, { recursive: true });      // captures (à relire) : DW_SHOTS=<dossier>
const shot = async (p, name) => { if (!SHOTS) return; for (const cs of ['light', 'dark']) { await p.emulateMedia({ colorScheme: cs }); await p.waitForTimeout(300); await p.screenshot({ path: `${SHOTS}/${name}-${cs}.png` }); } await p.emulateMedia({ colorScheme: 'light' }); };

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
const CORE = { v: 1, at: '2026-11-01T00:00:00Z', roles: Object.keys(R).concat('wincon'), cards: CARDS, tg: { all: TG, recent: TG, br: {}, th: {}, nc: {} }, combos: [['Sol Ring', 'Armageddon', 'Infinite fun', 'S']], cmds: ['edgar-markov'], themes: [], src: { decks: 1234 } };
const PACK = { slug: 'edgar-markov', n: 12345, land: 36, thl: [['vampires', 'Vampires', 9000], ['aggro', 'Aggro', 2000]], cards: [['Sol Ring', 95, -2], ['Arcane Signet', 80, 5], ['Swords to Plowshares', 60, 10], ['Llanowar Elves', 50, 30], ['Night\'s Whisper', 40, 20], ['Phyrexian Arena', 30, 25], ['Gilded Removal', 30, 40], ['Wrath of God', 30, 5], ['Demonic Tutor', 25, 1], ['Armageddon', 5, 1], ['Command Tower', 90, 0], ...Array.from({ length: 40 }, (_, i) => ['Filler ' + i, 1, 0])], th: {}, xc: [], tg: null };      // ≥ 40 cartes : commandant connu (avis sur les cartes faibles)
let dkwHits = 0, dkwOff = false;
const one = p => p.waitForFunction(() => document.querySelectorAll('.sheet-wrap').length === 1);      // la feuille d'avant a fini de se fermer
const SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="146" height="204"><rect width="146" height="204" rx="8" fill="#3a6"/></svg>';      // fausse image de carte (vignettes)
let imgHits = 0;
async function prep(p) {
  await p.route('https://cards.scryfall.io/**', r => { imgHits++; return r.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*' }, contentType: 'image/svg+xml', body: SVG }); });
  await p.route(u => /api\.scryfall\.com\/cards\/named\?.*format=image/.test(String(u)), r => { imgHits++; return r.fulfill({ status: 200, contentType: 'image/svg+xml', body: SVG }); });
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
await p.waitForSelector('.dw-start[data-v="have"]'); await one(p); await shot(p, 'nouveau'); assert.deepEqual(await p.$$eval('.dw-start b', b => b.map(x => x.textContent)), ['J\'ai déjà ce deck', 'Deck à construire']);
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
await p.fill('#dwzQ', 'edgar'); await p.waitForSelector('.dw-cmd[data-slug="edgar-markov"]');
await p.waitForSelector('.dw-cmd[data-slug="edgar-markov"] .thumb img.ok', { timeout: 10000 }); ok('« Ton commandant » : vignette du commandant affichée');
await p.click('.dw-cmd[data-slug="edgar-markov"]');
await p.waitForSelector('#dwzGo'); await shot(p, 'assistant-2');
assert.equal(await p.$eval('#dwzName', i => i.value), 'Edgar Markov');
await p.click('[data-br="2"]'); await p.click('[data-bud="5000"]');
assert.equal(await p.$eval('#dwzAuto', i => i.checked), true, '« Générer les 100 cartes tout de suite » : allumé par défaut'); await p.click('label[for="dwzAuto"]');      // ici : le coach seul (génération testée plus bas)
assert.match(await txt(p, '.sheet-wrap:last-child .sheet-body'), /Core/);
await p.click('#dwzGo'); await p.waitForSelector('.bd.on'); await p.waitForSelector('.dw-gauges .dw-g', { timeout: 15000 });
assert.deepEqual(await p.evaluate(() => [BD.tab, BD.cmdr.map(c => c.key), BD.wiz.br, BD.wiz.bud]), ['coach', ['edgar markov'], 2, 5000]);
await p.waitForFunction(() => DW.core && DW.cmd.has('edgar-markov'));
const gauges = await p.$$eval('.dw-gl b', b => b.map(x => x.textContent));
assert.deepEqual(gauges.slice(0, 5), ['Terrains', 'Rampe', 'Pioche', 'Retraits ciblés', 'Balayages']); assert.ok(!gauges.includes('Contresorts'), 'pas de bleu : pas de jauge des contresorts');
ok('assistant : commandant cherché, bracket 2, budget 50 €, coach ouvert');

/* ── 4) Suggestions : identité de couleur, bracket (Game Changers), budget, collection d'abord ; ajout au deck ── */
await shot(p, 'coach'); await p.click('.dw-gh[data-r="ramp"]'); await p.waitForSelector('.dw-g.open .dw-row'); await shot(p, 'coach-rampe');
const ramp = await p.$$eval('.dw-g.open .dw-row', r => r.map(x => x.dataset.k));
assert.deepEqual(ramp, ['arcane signet'], 'Sol Ring (Game Changer interdit en bracket 2) et Llanowar Elves (vert) écartés');
await p.waitForSelector('.dw-g.open .dw-row .thumb img.ok', { timeout: 10000 });      // vignette de la suggestion visible
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
assert.match(await txt(p, '.dw-br'), /Combo à 2 cartes interdit en bracket 2 : Sol Ring \+ Armageddon \(Infinite fun\)/, 'combo à 2 cartes (Commander Spellbook)');
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
ok('bracket (Game Changers, destruction de terrains, combo à 2 cartes), terrains de base, réglages gardés avec le deck');

/* ── 5 bis) Générer le deck : assistant avec génération, rôles jusqu'aux cibles puis plan puis terrains, couleurs, bracket, budget, annulable ── */
await p.evaluate(() => openDeckNew()); await p.waitForSelector('#ndName');
await p.click('#ndFmt .seg-opt[data-v="commander"]'); await p.click('#ndGo'); await p.waitForSelector('.dw-start[data-v="build"]'); await one(p);
await p.click('.dw-start[data-v="build"]'); await p.waitForSelector('#dwzQ'); await p.fill('#dwzQ', 'edgar'); await p.waitForSelector('.dw-cmd[data-slug="edgar-markov"]'); await p.click('.dw-cmd[data-slug="edgar-markov"]');
await p.waitForSelector('#dwzGo'); await p.click('[data-br="2"]'); await p.click('[data-bud="10000"]'); await p.click('#dwzGo');
await p.waitForSelector('.bd.on'); await p.waitForFunction(() => BD.main.size > 3, null, { timeout: 15000 });
const gen = await p.evaluate(() => { const m = new Map([...BD.main].map(([k, c]) => [k, c.qty])); let n = 0; for (const q of m.values()) n += q; return { keys: [...m.keys()], n, plains: m.get('plains') || 0, swamp: m.get('swamp') || 0, mountain: m.get('mountain') || 0, prof: (p => ({ land: p.land, ramp: p.ramp, cents: p.cents, gc: p.gc.length }))(dwProfile()) }; });
for (const k of ['arcane signet', 'swords to plowshares', 'nights whisper', 'phyrexian arena', 'wrath of god', 'command tower']) assert.ok(gen.keys.includes(k), 'générée : ' + k);
for (const k of ['sol ring', 'demonic tutor', 'rhystic study', 'llanowar elves', 'armageddon', 'gilded removal']) assert.ok(!gen.keys.includes(k), 'écartée (Game Changer, couleur, destruction de terrains ou budget) : ' + k);
assert.equal(gen.prof.gc, 0); assert.ok(gen.prof.cents <= 10000, 'sous le budget de 100 €');
assert.equal(gen.prof.land, await p.evaluate(() => dwTargets(dwProfile(), dwCmdOf(), DW.cmd.get('edgar-markov')).land[1]), 'terrains : la cible');
assert.ok(gen.plains > 0 && gen.swamp > 0 && gen.mountain > 0, 'terrains de base des trois couleurs');
assert.match(await p.$eval('#toast', t => t.textContent), /cartes ajoutées · \d+ \/ 100/);
await p.evaluate(() => { const t = document.querySelector('#toast button'); if (t) t.click(); });
await p.waitForFunction(() => BD.main.size === 0, null, { timeout: 5000 }); ok('génération annulée : deck vide');
await p.click('[data-act="dw-auto"]'); await p.waitForFunction(() => BD.main.size > 3);
assert.match(await txt(p, '.dx-steps'), /Il manque \d+ cartes Compléter/, 'deck incomplet (peu de cartes dans la base de test) : prochaine étape « Compléter »');
// deck construit par le coach : changer le budget propose de le refaire (annulable)
assert.equal(await p.evaluate(() => BD.wiz.gen), 1, 'deck construit de zéro par le coach');
assert.equal(await p.$('.dx-regen'), null);
await p.click('[data-act="dw-set"]'); await p.waitForSelector('#dwBud'); await p.fill('#dwBud', '5'); await p.dispatchEvent('#dwBud', 'change');
await p.waitForSelector('.dx-regen'); const before5 = await p.evaluate(() => [...BD.main.keys()].sort().join());
await p.click('[data-act="dw-regen"]'); await p.waitForFunction(() => !document.querySelector('.dx-regen') && BD.main.size > 3);
assert.ok(await p.evaluate(() => !BD.main.has('phyrexian arena') && !BD.main.has('nights whisper')), 'budget de 5 € (commandant compris) : plus que les cartes possédées et les terrains');
await p.evaluate(() => { const t = document.querySelector('#toast button'); if (t) t.click(); }); await p.waitForFunction(b => [...BD.main.keys()].sort().join() === b, before5);
await p.fill('#dwBud', '100'); await p.dispatchEvent('#dwBud', 'change'); await p.waitForSelector('.dx-regen'); await p.click('[data-act="dw-keep"]'); await p.waitForFunction(() => !document.querySelector('.dx-regen'));
await p.click('[data-act="dw-set"]');
ok('deck du coach : budget changé → « Recréer le deck » (annulable) ou « Garder le deck »');
// rapport du coach : sections, combo du deck, combos à une carte près, cartes touchables, copie
await p.evaluate(() => { bdChange('main', 'sol ring', 'Sol Ring', 1); });      // Sol Ring + Armageddon (combo de la base de test) : à une carte près
await p.click('[data-act="dw-report"]'); await p.waitForSelector('.dr-body .da-sum');
const rep = await txt(p, '.dr-body');
for (const t of ['Ce que fait ton commandant', 'Comment le deck gagne', 'Comment le jouer', 'Main de départ', 'Interaction', 'Points faibles', 'Combos à une carte près', 'Rôle de chaque carte']) assert.ok(rep.includes(t), 'rapport : ' + t);
assert.match(rep, /Tu as Sol Ring : avec Armageddon, Infinite fun/); assert.match(rep, /retraits? ciblés? : [^.]*Swords to Plowshares/);
await shot(p, 'rapport');
await p.click('.dr-body .dr-c[data-k="swords to plowshares"]'); await p.waitForSelector('.imgv'); await p.keyboard.press('Escape'); await p.waitForFunction(() => !document.querySelector('.imgv'));
await closeSheets(p);
ok('rapport du coach : sections, combos, cartes agrandies');
await p.evaluate(() => bdClose(true)); await p.waitForFunction(() => !document.querySelector('.bd'));
ok('générer le deck : rôles, plan, terrains, couleurs, bracket, budget ; annulable ; Compléter');

/* ── 6) Analyser un deck (viewer) : bracket estimé, échanges conseillés, limite de prix, ouverture dans l'éditeur avec les échanges ── */
await p.evaluate(() => putDeck('dk-ana', deckDoc({ name: 'Edgar à analyser', text: 'Commander\n1 Edgar Markov\n\nDeck\n1 Weak One\n1 Phyrexian Arena\n1 Gilded Removal\n1 Command Tower\n30 Plains', opts: { ...S.opts } })));
await p.evaluate(() => openDeckViewer({ id: 'dk-ana' })); await p.waitForSelector('.dv.on .dv-ana');
await p.click('.dv-ana'); await p.waitForSelector('.da-sum', { timeout: 15000 });
assert.match(await txt(p, '.da-sum'), /Bracket estimé 2 · Core/);
assert.equal(await p.$('.da-sw'), null, 'réglages d\'abord : pas encore d\'échanges'); assert.equal(await txt(p, '#daGo'), 'Lancer l\'analyse');
assert.equal(await p.$eval('[data-da-br="2"]', b => b.getAttribute('aria-pressed')), 'true', 'bracket visé préréglé sur le bracket estimé');
await shot(p, 'analyse-reglages');
await p.click('#daGo'); await p.waitForSelector('.da-sw');
const swRows = () => p.$$eval('.da-sw', r => r.map(x => [...x.querySelectorAll('.da-c b')].map(b => b.textContent).join(' → ') + ' | ' + x.querySelector('.da-why').textContent.replace(/\s*Pourquoi \?$/, '')).map(t => t.replace(/\s+/g, ' ').trim()));
let sws = await swRows();
assert.equal(sws.length, 1, 'un seul échange utile : ' + sws.join(' | ')); assert.equal(sws[0], 'Weak One → Arcane Signet | Il manque : Rampe · 80 % des decks (contre 0 %) · −4,60 €');
assert.match(await txt(p, '.dw-set-h'), /bracket 2 · Core · sans limite de prix · ma collection d'abord/);
// vignettes : image de la fiche ou de Scryfall par le nom ; un toucher agrandit la carte (retirée, ajoutée…)
assert.deepEqual(await p.$$eval('.da-sw .thumb', t => t.map(x => !!x.querySelector('img') && x.dataset.zoom)), ['da', 'da']);
await p.waitForFunction(() => document.querySelectorAll('.da-sw .thumb img.ok').length === 2, null, { timeout: 10000 });      // images chargées et visibles (classe ok), pas seulement présentes
await p.click('.da-sw .da-c.in .thumb'); await p.waitForSelector('.imgv'); assert.equal(await p.evaluate(() => DA.off.size), 0, 'la vignette agrandit sans décocher');
await p.keyboard.press('Escape'); await p.waitForFunction(() => !document.querySelector('.imgv'));
// « Pourquoi ? » : les deux cartes et l'effet sur les jauges
await p.click('.da-sw [data-da-why="0"]'); await p.waitForSelector('.da-sw .dx-why');
assert.match(await txt(p, '.da-sw .dx-why'), /Retirer Weak One rôle : plan de jeu · absente des decks de Edgar Markov étudiés · 5,00 € Ajouter Arcane Signet rôle : Rampe · 80 % des decks de Edgar Markov .* Effet Rampe : 0 → 1 \(repère \d+\) Valeur du deck/);
assert.equal(await p.evaluate(() => DA.off.size), 0, '« Pourquoi ? » ne décoche pas');
// réglages modifiés sur place : l'analyse est relancée tout de suite
await p.click('[data-da-edit]'); await p.waitForSelector('#daBud');
await p.fill('#daBud', '100'); await p.dispatchEvent('#daBud', 'change');
await p.waitForFunction(() => document.querySelectorAll('.da-sw').length === 2);
sws = await swRows();
assert.match(sws[0], /^Gilded Removal → Swords to Plowshares \| Même rôle, bien moins chère/, 'au-dessus de la limite : la carte chère d\'abord');
assert.match(await txt(p, '#daGo'), /Ouvrir dans l'éditeur avec 2 échanges/); await shot(p, 'analyse');
await p.click('.da-sw:nth-child(2) .da-why');      // toute la ligne coche
await p.waitForFunction(() => DA.off.has(1)); await p.waitForFunction(() => /avec 1 échange$/.test(document.querySelector('#daGo').textContent));
await p.click('#daGo'); await p.waitForSelector('.bd.on'); await p.waitForSelector('.dw-gauges');
assert.deepEqual(await p.evaluate(() => [BD.id, BD.tab, BD.dirty, BD.main.has('gilded removal'), BD.main.has('swords to plowshares'), BD.main.has('weak one'), BD.wiz.bud]), ['dk-ana', 'coach', true, false, true, true, 10000]);
await p.evaluate(() => bdClose(true)); await p.waitForFunction(() => !document.querySelector('.bd'));
ok('analyse : bracket estimé, échanges (rôle qui manque, limite de prix), cochés appliqués dans l\'éditeur');

/* ── 6 bis) Confort du Coach : prochaines étapes, « À retirer » au-dessus de 100 cartes, échanges dans le Coach (« Pourquoi ? », Échanger, Annuler) ── */
await p.evaluate(() => openBuilder({ name: 'Trop plein', fmt: 'commander', text: 'Commander\n1 Edgar Markov\n\nDeck\n1 Weak One\n1 Phyrexian Arena\n1 Swords to Plowshares\n30 Plains\n34 Swamp\n34 Mountain', wiz: { th: [], br: 2, bud: 0, own: true }, tab: 'coach' }));
await p.waitForSelector('.dx-next'); await p.waitForFunction(() => DW.cmd.has('edgar-markov'));
assert.match(await txt(p, '.dx-steps li:first-child'), /^2 cartes de trop Que retirer \?$/, 'prochaine étape : deck à 102 cartes'); await shot(p, 'coach-haut');
assert.ok(await p.$('#dwCuts'), 'section « À retirer »'); await p.waitForSelector('.dx-cut[data-k="weak one"] .thumb img.ok', { timeout: 10000 });
const cuts = await p.$$eval('.dx-cut', r => r.map(x => x.dataset.k + ' | ' + x.querySelector('.dw-why').textContent));
assert.match(cuts[0], /^weak one \| Absente des decks de Edgar Markov étudiés$/, 'la moins utile d\'abord : ' + cuts.join(' / '));
assert.ok(cuts.some(c => /^(plains|swamp|mountain) \| Terrains : 98 pour \d+ conseillés/.test(c)), 'trop de terrains : un terrain de base proposé');
await p.click('.dx-cut[data-k="weak one"] .qstep button'); await p.waitForFunction(() => !BD.main.has('weak one'));
assert.match(await txt(p, '.dx-steps li:first-child'), /^1 carte de trop/);
await p.click('[data-act="dw-goto"][data-v="cuts"]');
await p.click('#bdSeg .seg-opt[data-v="deck"]'); await p.waitForSelector('.dx-banner');
assert.match(await txt(p, '.dx-banner'), /^Coach · 1 carte de trop/, 'bannière du coach dans les autres onglets');
await p.click('.dx-banner'); await p.waitForFunction(() => BD.tab === 'coach'); await p.waitForSelector('.dx-next');
await p.evaluate(() => { bdChange('main', 'weak one', 'Weak One', 1); bdChange('main', 'plains', 'Plains', -1); bdChange('main', 'swamp', 'Swamp', -1); bdChange('main', 'mountain', 'Mountain', -1); });
await p.click('.dw-gh[data-r="swaps"]'); await p.waitForSelector('.dx-sw'); await p.waitForFunction(() => document.querySelectorAll('.dx-sw .thumb img.ok').length >= 2, null, { timeout: 10000 });
assert.match(await txt(p, '.dx-sw .da-pair'), /Retirer Weak One/);
await p.click('.dx-sw [data-act="dw-why"]'); await p.waitForSelector('.dx-sw .dx-why'); assert.match(await txt(p, '.dx-sw .dx-why'), /Effet/);
const inK = await p.$eval('.dx-sw', x => x.querySelector('.da-c.in .thumb').dataset.k);
await p.click('.dx-sw [data-act="dw-swap"]'); await p.waitForFunction(k => !BD.main.has('weak one') && BD.main.has(k), inK);
await p.evaluate(() => { const t = document.querySelector('#toast button'); if (t) t.click(); }); await p.waitForFunction(k => BD.main.has('weak one') && !BD.main.has(k), inK);
await shot(p, 'coach-etapes');
await p.evaluate(() => bdClose(true)); await p.waitForFunction(() => !document.querySelector('.bd'));
ok('coach : prochaines étapes, à retirer (raisons, terrains en trop), échanges dans le coach (Pourquoi ?, Échanger, Annuler)');

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
