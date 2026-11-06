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

/* ── 1) Le coach est pour tout le monde : plus de ligne « Fonctionnalités en test » (aucune en cours) ── */
assert.equal(await p.evaluate(() => labsRow()), '', 'compte quelconque : pas de ligne');
assert.equal(await p.evaluate(() => { const a = EV.adm; EV.adm = EV.uid; const h = labsRow(); EV.adm = a; return h; }), '', 'compte de l\'éditeur : aucune fonctionnalité en test');
assert.equal(await p.evaluate(() => dwOn()), true);
ok('coach pour tout le monde, sans interrupteur');

/* ── 2) « J'ai déjà ce deck » › « Coller la liste » ── */
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
assert.deepEqual(await p.evaluate(id => JSON.parse(localStorage.getItem('deckdeal:dw:' + id)), id), { th: [], br: 2, bud: 20000, own: true, mech: [], tribe: '', pets: [], ban: [], avoid: [], orig: 30 });
await p.evaluate(id => openBuilder({ id }), id); await p.waitForSelector('.bd.on'); await p.click('#bdSeg .seg-opt[data-v="coach"]'); await p.waitForSelector('.dw-gauges');
assert.match(await txt(p, '.dw-set-h'), /bracket 2/); assert.equal(await p.evaluate(() => BD.wiz.bud), 20000);
await p.evaluate(() => bdClose(true));
ok('bracket (Game Changers, destruction de terrains, combo à 2 cartes), terrains de base, réglages gardés avec le deck');

/* ── 5 bis) Générer le deck : assistant avec génération, rôles jusqu'aux cibles puis plan puis terrains, couleurs, bracket, budget, annulable ── */
await p.evaluate(() => openDeckNew()); await p.waitForSelector('#ndName');
await p.click('#ndFmt .seg-opt[data-v="commander"]'); await p.click('#ndGo'); await p.waitForSelector('.dw-start[data-v="build"]'); await one(p);
await p.click('.dw-start[data-v="build"]'); await p.waitForSelector('#dwzQ'); await p.fill('#dwzQ', 'edgar'); await p.waitForSelector('.dw-cmd[data-slug="edgar-markov"]'); await p.click('.dw-cmd[data-slug="edgar-markov"]');
await p.waitForSelector('#dwzGo'); await p.click('[data-br="2"]'); await p.click('[data-bud="10000"]');
// cartes fétiches et exclusions : le champ de recherche qui perd le focus (« change », au moment où l'on touche un résultat) ne redessine plus la liste sous le doigt
// (la carte n'était ajoutée qu'au 2e appui) ; la frappe (« input ») la redessine (bloc testé ici sans la base classée par mécaniques, qui l'affiche)
assert.deepEqual(await p.evaluate(() => {
  const w = document.createElement('div'); w.innerHTML = '<div class="field-in"><input id="tPetQ" data-pq="pets" value="whisper"></div><div class="dw-pres" data-pres="pets"><button id="tKeep"></button></div>'; document.body.append(w);
  const inp = w.querySelector('input'), r1 = dwPersoInput({ type: 'change', target: inp }, { pets: [] }, null), kept = !!w.querySelector('#tKeep');
  const r2 = dwPersoInput({ type: 'input', target: inp }, { pets: [] }, null), redrawn = !w.querySelector('#tKeep'); w.remove(); return [r1, kept, r2, redrawn];
}), ['live', true, 'live', true]);
// cartes fétiches et exclusions : recherche commune (cardnames.js › cnFind) par le nom imprimé dans la langue de l'appli (ici l'index des cartes, même langue), nom anglais gardé ; anglais toujours possible
assert.deepEqual(await p.evaluate(() => { const f0 = [FRX.l, FRX.ix]; FRX.l = 'fr'; FRX.ix = frIndex(['Anneau solaire\tSol Ring']);
  try { return [dwPersoFind('anneau', null, 'ban').map(r => [r[1], r[4]]), dwPersoFind('sol ri', null, 'ban').map(r => r[1]), dwPersoRes(dwPersoFind('anneau', null, 'ban'), 'ban')]; } finally { [FRX.l, FRX.ix] = f0; } }),
  [[['Sol Ring', 'Anneau solaire']], ['Sol Ring'], '<button type="button" class="chip" data-padd="ban" data-n="Sol Ring" title="Sol Ring">+ Anneau solaire</button>']);
// langue de l'appli (ici le français, 2e index CN) d'abord, même quand les cartes sont dans une autre langue (index de la collection en allemand) : les deux sont cherchées,
// résultat affiché dans la langue de l'appli
assert.deepEqual(await p.evaluate(() => { const f0 = [FRX.l, FRX.ix], c0 = [CN.l, CN.ix];
  FRX.l = 'de'; FRX.ix = frIndex(["Nächtliches Flüstern\tNight's Whisper"]); CN.l = 'fr'; CN.ix = frIndex(["Murmures nocturnes\tNight's Whisper"]);
  try { return [dwPersoFind('murmures', null, 'ban').map(r => r[4]), dwPersoFind('flustern', null, 'ban').map(r => r[4]), dwPersoFind('whisper', null, 'ban').map(r => r[4]), cnName("Night's Whisper"), cnPh()]; } finally { [FRX.l, FRX.ix] = f0; [CN.l, CN.ix] = c0; } }),
  [['Murmures nocturnes'], ['Murmures nocturnes'], ['Murmures nocturnes'], 'Murmures nocturnes', 'Nom français ou anglais']);
await p.click('#dwzGo');
await p.waitForSelector('.bd.on');
// construction en plusieurs passes : barre de progression, étapes, puis les versions au choix (note, valeur, courbe, rôles)
await p.waitForSelector('.ds-sheet', { timeout: 15000 });
await p.waitForSelector('.ds-v', { timeout: 30000 });
const vers = await p.$$eval('.ds-v', l => l.map(x => x.querySelector('.ds-vh b').textContent + ' ' + x.querySelector('.ds-vn').textContent.replace(/\s+/g, '')));
const vers0k = await p.$eval('.ds-v[data-ds-pick="0"] .ds-vk', e => e.textContent.split(' · ')[0]);      // « valeur 18,35 € »
assert.ok(vers.length >= 3 && /^Équilibrée \d+\/100$/.test(vers[0]) && vers.some(v => /^Plus agressive/.test(v)) && vers.some(v => /^Plus contrôle/.test(v)), 'versions : ' + vers.join(' | '));
{ const sc = await p.$$eval('.ds-v .ds-vn', l => l.map(x => parseInt(x.textContent, 10))), top = Math.max(...sc), uniq = sc.filter(v => v === top).length === 1;      // « Meilleure note » : seulement quand une version est seule en tête
  assert.equal(await p.$$eval('.ds-v em', l => l.length), uniq ? 1 : 0, 'meilleure note signalée seulement si une version est seule en tête : ' + sc.join(', ')); }
await shot(p, 'versions');
// tirages par version selon la vitesse mesurée (30 s pour les 4 versions) : ordinateur 3 (1 s le tirage), téléphone moyen 2 (2,75 s), très lent 1 ; durées gardées pour annoncer le temps
assert.deepEqual(await p.evaluate(() => [DS_BUDGET, dsDrawsFor(30000, 4, 1000, 600, 3), dsDrawsFor(30000, 4, 2750, 2400, 3), dsDrawsFor(30000, 4, 9000, 6000, 3), dsDrawsFor(30000, 1, 2750, 2400, 3)]), [30000, 3, 2, 1, 3]);
await p.click('.ds-v[data-ds-pick="0"]'); await p.waitForFunction(() => !document.querySelector('.ds-sheet'));
const gen = await p.evaluate(() => { const m = new Map([...BD.main].map(([k, c]) => [k, c.qty])); let n = 0; for (const q of m.values()) n += q; return { keys: [...m.keys()], n, plains: m.get('plains') || 0, swamp: m.get('swamp') || 0, mountain: m.get('mountain') || 0, prof: (p => ({ land: p.land, ramp: p.ramp, cents: p.cents, gc: p.gc.length }))(dwProfile()) }; });
for (const k of ['arcane signet', 'swords to plowshares', 'nights whisper', 'phyrexian arena', 'wrath of god', 'command tower']) assert.ok(gen.keys.includes(k), 'générée : ' + k);
for (const k of ['sol ring', 'demonic tutor', 'rhystic study', 'llanowar elves', 'armageddon', 'gilded removal']) assert.ok(!gen.keys.includes(k), 'écartée (Game Changer, couleur, destruction de terrains ou budget) : ' + k);
assert.equal(gen.prof.gc, 0); assert.ok(gen.prof.cents <= 10000, 'sous le budget de 100 €');
assert.equal(gen.prof.land, await p.evaluate(() => dwTargets(dwProfile(), dwCmdOf(), DW.cmd.get('edgar-markov')).land[1]), 'terrains : la cible');
assert.ok(gen.plains > 0 && gen.swamp > 0 && gen.mountain > 0, 'terrains de base des trois couleurs');
// une seule note et une seule valeur (audit U7 : 58 sur la version, 51 dans le Coach ; 49,80 € puis ≈ 10,55 €+ puis 49,85 €) : version, message, onglet Coach, en-tête, rapport
{ const toastT = await p.$eval('#toast', t => t.textContent), m = /^Deck créé · note (\d+)\/100 · \d+\/100 cartes(.*)$/.exec(toastT);
  assert.ok(m, 'message court : ' + toastT); assert.equal(m[2], 'Annuler', 'bouton du message');
  assert.equal(m[1], vers[0].replace(/^Équilibrée (\d+)\/100$/, '$1'), 'note du message = note de la version choisie');
  assert.equal((await txt(p, '.bd .ds-score .ds-n')).replace(/\s/g, ''), m[1] + '/100', 'note du Coach = note de la version');
  const vk = vers0k.replace(/\s+/g, ' '), head = (await txt(p, '#bdSum .bd-val')).replace(/\s+/g, ' ');
  assert.equal('valeur ' + head.replace(/^≈ /, ''), vk, 'valeur de la version = valeur estimée de l\'en-tête : ' + vk + ' / ' + head);
  assert.match(await txt(p, '#bdSum .bd-valw'), /^valeur estimée ≈ /, 'en-tête : la valeur dite pour ce qu\'elle est');
  assert.deepEqual(await p.evaluate(() => { const d = I18N.dict; I18N.dict = { 'Annuler (défaire)': 'Rückgängig', 'Annuler': 'Abbrechen' }; const r = [tUndo(), T('Annuler')]; I18N.dict = d; return r; }), ['Rückgängig', 'Abbrechen'], 'allemand : « Rückgängig » dans le message, « Abbrechen » ailleurs'); }
await p.evaluate(() => { const t = document.querySelector('#toast button'); if (t) t.click(); });
await p.waitForFunction(() => BD.main.size === 0, null, { timeout: 5000 }); ok('génération annulée : deck vide');
await p.click('[data-act="dw-auto"]'); await p.waitForSelector('.ds-v', { timeout: 30000 }); await p.click('.ds-v[data-ds-pick="0"]'); await p.waitForFunction(() => !document.querySelector('.ds-sheet') && BD.main.size > 3);
assert.match(await txt(p, '.dx-steps'), /Il manque \d+ cartes Compléter/, 'deck incomplet (peu de cartes dans la base de test) : prochaine étape « Compléter »');
// deck construit par le coach : changer le budget propose de le refaire (annulable)
assert.equal(await p.evaluate(() => BD.wiz.gen), 1, 'deck construit de zéro par le coach');
assert.equal(await p.$('.dx-regen'), null);
await p.click('[data-act="dw-set"]'); await p.waitForSelector('#dwBud'); await p.fill('#dwBud', '8'); await p.dispatchEvent('#dwBud', 'change');
await p.waitForSelector('.dx-regen'); const before5 = await p.evaluate(() => [...BD.main.keys()].sort().join());
assert.ok(await p.$('.dw-bud [data-act="dw-regen"]'), 'au-dessus du budget : « Reconstruire avec ce budget » dans la section Budget');
await p.click('.dx-regen [data-act="dw-regen"]');
await p.waitForSelector('.ds-bud-sheet [data-bud-new]'); await p.fill('#dsBudNew', '8'); await p.click('.ds-bud-sheet [data-bud-new]');      // Edgar (5 €) sur 8 € : la question d'abord ; le joueur garde 8 €
await p.waitForSelector('.ds-v', { timeout: 30000 }); await p.click('.ds-v[data-ds-pick="0"]'); await p.waitForFunction(() => !document.querySelector('.ds-sheet') && !document.querySelector('.dx-regen') && BD.main.size > 3);
assert.ok(await p.evaluate(() => dwProfile().cents <= 800), 'reconstruit sous 8 € : cartes possédées comprises dans la valeur');
assert.equal(await p.$('.dw-bud [data-act="dw-regen"]'), null, 'sous le budget : plus de bouton');
await p.evaluate(() => { const t = document.querySelector('#toast button'); if (t) t.click(); }); await p.waitForFunction(b => [...BD.main.keys()].sort().join() === b, before5);
await p.fill('#dwBud', '100'); await p.dispatchEvent('#dwBud', 'change'); await p.waitForSelector('.dx-regen'); await p.click('[data-act="dw-keep"]'); await p.waitForFunction(() => !document.querySelector('.dx-regen'));
await p.click('[data-act="dw-set"]');
ok('deck du coach : budget changé → « Recréer le deck » (annulable) ou « Garder le deck »');
// rapport du coach : sections, combo du deck, combos à une carte près, cartes touchables, copie
await p.evaluate(() => { bdChange('main', 'sol ring', 'Sol Ring', 1); });      // Sol Ring + Armageddon (combo de la base de test) : à une carte près
await p.evaluate(() => { DW.core.combos3 = [['Sol Ring', 'Edgar Markov', 'Swords to Plowshares', 'Test combo 3', 'S']]; DW.combo3Idx = null; });      // combo à 3 cartes complet (le commandant en est une pièce)
await p.click('[data-act="dw-report"]'); await p.waitForSelector('.dr-body .da-sum');
const rep = await txt(p, '.dr-body');
for (const t of ['Ce que fait ton commandant', 'Comment le deck gagne', 'Comment le jouer', 'Main de départ', 'Interaction', 'Points faibles', 'Combos à une carte près', 'Rôle de chaque carte']) assert.ok(rep.includes(t), 'rapport : ' + t);
assert.match(rep, /Tu as Sol Ring : avec Armageddon, Infinite fun/); assert.match(rep, /1 combo à 3 cartes dans le deck\s*Sol Ring \+ Edgar Markov \+ Swords to Plowshares : Test combo 3/, 'rapport : combo à 3 cartes'); assert.match(rep, /retraits? ciblés? : [^.]*Swords to Plowshares/);
assert.match(rep, /\d+ \/100 Note du coach/, 'rapport : note du coach'); assert.ok(await p.$('.dr-body .ds-parts[open]'), 'rapport : détail de la note ouvert');
// simulation de 1 000 parties : deck de test assez grand (37 terrains), résultats chiffrés, conseils ; même deck, mêmes résultats (graine fixe)
const sim = await p.evaluate(async () => {
  const X = { main: new Map([['plains', { key: 'plains', name: 'Plains', qty: 13 }], ['swamp', { key: 'swamp', name: 'Swamp', qty: 12 }], ['mountain', { key: 'mountain', name: 'Mountain', qty: 12 }], ['swords to plowshares', { key: 'swords to plowshares', name: 'Swords to Plowshares', qty: 31 }], ['phyrexian arena', { key: 'phyrexian arena', name: 'Phyrexian Arena', qty: 31 }]]), cmdr: [{ key: 'edgar markov', name: 'Edgar Markov' }], wiz: { th: [], br: 2, bud: 0 } };
  const a = await dsimRun(X, 400), b = await dsimRun(X, 400), html = dsimHtml(a);
  DSIM.sig = ''; let ticks = 0; dsimEnsure(X, () => { ticks++; }); for (let i = 0; i < 100 && !DSIM.res; i++) await new Promise(r => setTimeout(r, 100));      // comme le rapport : la progression arrive avant que dsimRun rende la main
  const ens = { done: !!(DSIM.res && DSIM.res.n === 10000), ticks };
  const none = await dsimRun({ main: new Map([['plains', { key: 'plains', name: 'Plains', qty: 10 }]]), cmdr: X.cmdr, wiz: X.wiz }, 100);
  return { a, same: JSON.stringify(a) === JSON.stringify(b), html: html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' '), none, ens };
});
assert.ok(sim.ens.done && sim.ens.ticks > 5, 'simulation du rapport (10 000 parties) menée à son terme, avec sa progression : ' + JSON.stringify(sim.ens));
assert.ok(sim.same, 'graine fixe : mêmes résultats'); assert.equal(sim.none, null, 'moins de 40 cartes : pas de simulation');
assert.ok(sim.a.keep7 > 60 && sim.a.keep7 <= 100 && sim.a.lands0 > 2 && sim.a.lands0 < 4, 'mains gardées et terrains : ' + JSON.stringify(sim.a));
assert.ok(sim.a.cmdT > 3 && sim.a.cmdT < 9 && sim.a.eff > 0 && sim.a.eff <= 100 && sim.a.cast6 > 0, 'commandant, mana, sorts : ' + JSON.stringify(sim.a));
assert.match(sim.html, /Simulation de 10 000 parties .* % des mains de 7 cartes gardées .* commandant lancé à temps \(tour \d ou avant\)/);
// plan que la simulation ne joue pas (ninjutsu d'après la fiche du commandant) : « non mesuré », pas de « La table tient bon », sans poids dans la construction ; voltron : joué (mesuré)
const blind = await p.evaluate(a => {
  const mech0 = DW.core.mech; DW.core.mech = { tags: ['voltron', 'ninjutsu', 'group-hug', 'drain', 'dies-trigger', 'sacrifice'], roles: [] }; DMX.src = null; dmxIdx();
  const cmd = { keys: [] }, X = { cmdr: [{ key: 'x', name: 'X' }] };
  const got = { vo: dsimBlind(X, cmd, { ai: { tags: ['voltron'] }, main: [0] }), nin: dsimBlind(X, cmd, { ai: { tags: ['equipment', 'evasion', 'ninjutsu'] }, main: [] }), hug: dsimBlind(X, cmd, { ai: null, main: [2] }), ari: dsimBlind(X, cmd, { ai: null, main: [3, 4, 5] }), none: dsimBlind(X, cmd, { ai: { tags: ['drain'] }, main: [3] }) };
  if (mech0) DW.core.mech = mech0; else delete DW.core.mech; DMX.src = null;
  const r = { ...a, kill10: 3, elim10: 0.1, blind: 'ninjutsu', blindCmd: '' }, html = dsimHtml(r).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' '), plain = dsimHtml({ ...a, kill10: 3, elim10: 0.1, blind: null }).replace(/<[^>]+>/g, ' ');
  return { got, html, plain, judge: [dsJudge(50, { ...r, kill10: 0 }), dsJudge(50, { ...r, kill10: 60 })], val: [dsSimVal({ ...r, kill10: 0 }), dsSimVal({ ...r, kill10: 60 })], judge0: [dsJudge(50, { ...r, blind: null, kill10: 0 }), dsJudge(50, { ...r, blind: null, kill10: 60 })] };
}, sim.a);
assert.deepEqual([blind.got.vo, blind.got.nin && blind.got.nin.t, blind.got.hug && blind.got.hug.t, blind.got.ari && blind.got.ari.t, blind.got.none], [null, 'ninjutsu', 'group-hug', 'aristocrats', null], 'plans repérés : fiche, plan, aristocrates ; voltron (joué) et drain seul : mesurés');
assert.match(blind.html, /non mesuré Adversaire éliminé pour ce plan/, 'case « Adversaire éliminé » : non mesuré'); assert.match(blind.html, /Plan « ninjutsu » : la simulation ne sait pas encore le jouer/, 'phrase du rapport');
assert.ok(!/La table tient bon/.test(blind.html) && !/adversaire tombe avant le tour 11/.test(blind.html), 'ni conseil « La table tient bon » ni chiffre caché'); assert.match(blind.plain, /La table tient bon/, 'plan joué : le conseil reste');
assert.ok(blind.judge[0] === blind.judge[1] && blind.val[0] === blind.val[1] && blind.judge0[1] > blind.judge0[0], 'construction : kill10 sans poids pour ce plan : ' + JSON.stringify(blind));
ok('simulation : plan ninjutsu → « non mesuré », sans conseil ni poids sur les adversaires éliminés ; voltron mesuré');
await p.waitForFunction(() => /Simulation de 1 000 parties|Note du coach/.test(document.querySelector('.dr-body').textContent));
await shot(p, 'rapport');
await p.click('.dr-body .dr-c[data-k="swords to plowshares"]'); await p.waitForSelector('.imgv'); await p.keyboard.press('Escape'); await p.waitForFunction(() => !document.querySelector('.imgv'));
await closeSheets(p); await p.evaluate(() => { delete DW.core.combos3; DW.combo3Idx = null; });
ok('rapport du coach : sections, combos (2 et 3 cartes), cartes agrandies');
await p.evaluate(() => bdClose(true)); await p.waitForFunction(() => !document.querySelector('.bd'));
ok('générer le deck : rôles, plan, terrains, couleurs, bracket, budget ; annulable ; Compléter');

/* ── 6) Coach d'un deck (viewer) : il s'adapte à l'état du deck ─────────────────────────────────────────────────
   incomplet → « Compléter le deck » ; complet → bilan direct (note, actions, échanges repliés, détail, réglages) ; pas à moi → aperçu + « Ajouter à mes decks ». */
const EDGAR = n => 'Commander\n1 Edgar Markov\n\nDeck\n1 Weak One\n1 Phyrexian Arena\n1 Gilded Removal\n1 Command Tower\n' + n + ' Plains';
// a) deck incomplet de Mes decks : réglages courts (bracket Auto = estimé), puis la construction de l'éditeur
await p.evaluate(t => putDeck('dk-half', deckDoc({ name: 'Edgar à compléter', text: t, opts: { ...S.opts } })), EDGAR(30));
await p.evaluate(() => openDeckViewer({ id: 'dk-half' })); await p.waitForSelector('.dv.on .dv-ana');
await p.click('.dv-ana'); await p.waitForSelector('.cb-build', { timeout: 15000 });
assert.match(await txt(p, '.cb-build'), /^35 \/100 cartes Il manque 65 cartes Bracket 2 · Core · estimé/);
assert.equal(await txt(p, '#daGo'), 'Compléter le deck'); assert.equal(await p.$('.da-sw'), null, 'pas d\'échanges sur un deck incomplet');
assert.equal(await p.$eval('[data-ds-br="auto"]', b => b.getAttribute('aria-pressed')), 'true', 'bracket automatique (estimé)'); assert.match(await txt(p, '[data-ds-br="auto"]'), /Auto · 2/);
await shot(p, 'coach-completer');
await p.click('[data-ds-br="3"]'); await p.waitForFunction(() => document.querySelector('[data-ds-br="3"]').getAttribute('aria-pressed') === 'true');
assert.deepEqual(await p.evaluate(() => { const o = JSON.parse(localStorage.getItem(DW_SET + 'dk-half')); return [o.br, !!o.ba]; }), [3, false], 'bracket choisi : gardé pour ce deck');
await p.click('#daGo'); await p.waitForSelector('.bd.on'); await p.waitForFunction(() => BD.tab === 'coach' && BD.id === 'dk-half');
assert.equal(await p.evaluate(() => BD.wiz.br), 3, 'l\'éditeur reprend les réglages');
await p.waitForFunction(() => !DW.autoNext, null, { timeout: 15000 });      // construction lancée par l'onglet Coach (deckopt.js › dsBuild)
await p.waitForTimeout(400); await closeSheets(p); await p.evaluate(() => bdClose(true)); await p.waitForFunction(() => !document.querySelector('.bd'));
ok('coach d\'un deck incomplet : « Compléter le deck », réglages courts préremplis (Auto = bracket estimé), construction dans l\'éditeur');

// b) deck complet de Mes decks : bilan tout de suite, sans question
await p.evaluate(t => putDeck('dk-ana', deckDoc({ name: 'Edgar à analyser', text: t, opts: { ...S.opts } })), EDGAR(95));
await p.evaluate(() => openDeckViewer({ id: 'dk-ana' })); await p.waitForSelector('.dv.on .dv-ana');
await p.click('.dv-ana'); await p.waitForSelector('.cb-head .cb-n', { timeout: 15000 });
assert.match(await txt(p, '.cb-head'), /^\d+ \/100 .+ Bracket 2 · Core · estimé [\d\s,]+ €$/, 'note, phrase, bracket estimé, valeur');
assert.equal(await p.$('[data-ds-br]'), null, 'aucune question : réglages repliés'); assert.equal(await p.$('.da-sws'), null, 'échanges repliés');
const acts = await p.$$eval('.cb-act', a => a.map(x => x.querySelector('b').textContent));
assert.ok(acts.length >= 1 && acts.length <= 3, '1 à 3 actions prioritaires : ' + acts.join(' | ')); assert.ok(acts.includes('Échanger Weak One → Arcane Signet'), 'la rampe manque : l\'échange conseillé la comble, à la place de « Ajouter de la rampe » : ' + acts.join(' | '));
assert.equal(acts.some(t => /rampe/.test(t)), false);
assert.match(await txt(p, '[data-da-swt]'), /^Échanges conseillés 1 échange · note \d+ → \d+ · −4,60 € Afficher$/, 'note avant → après dans l\'en-tête replié');
assert.match(await txt(p, '.cb-set'), /^Réglages bracket 2 \(estimé\) · limite [\d\s,]+ € \(valeur actuelle\) Modifier$/, 'budget = valeur actuelle');
await shot(p, 'coach-bilan');
await p.click('[data-da-swt]'); await p.waitForSelector('.da-sw');
const swRows = () => p.$$eval('.da-sw', r => r.map(x => [...x.querySelectorAll('.da-c b')].map(b => b.textContent).join(' → ') + ' | ' + [...x.querySelectorAll('.da-why .da-wh, .da-why .da-px, .da-why small')].map(e => e.textContent).join(' · ')).map(t => t.replace(/\s+/g, ' ').trim()));
let sws = await swRows();
assert.equal(sws.length, 1, 'un seul échange utile : ' + sws.join(' | ')); assert.equal(sws[0], 'Weak One → Arcane Signet | Il manque : Rampe · −4,60 € · 80 % des decks (contre 0 %)');
// vignettes : image de la fiche ou de Scryfall par le nom ; un toucher agrandit la carte (retirée, ajoutée…)
assert.deepEqual(await p.$$eval('.da-sw .thumb', t => t.map(x => !!x.querySelector('img') && x.dataset.zoom)), ['da', 'da']);
await p.waitForFunction(() => document.querySelectorAll('.da-sw .thumb img.ok').length === 2, null, { timeout: 10000 });      // images chargées et visibles (classe ok), pas seulement présentes
await p.click('.da-sw .da-c.in .thumb'); await p.waitForSelector('.imgv'); assert.equal(await p.evaluate(() => DA.off.size), 0, 'la vignette agrandit sans décocher');
await p.keyboard.press('Escape'); await p.waitForFunction(() => !document.querySelector('.imgv'));
// « Pourquoi ? » : les deux cartes et l'effet sur les jauges
await p.click('.da-sw [data-da-why="0"]'); await p.waitForSelector('.da-sw .dx-why');
assert.match(await txt(p, '.da-sw .dx-why'), /Retirer Weak One rôle : plan de jeu · absente des decks de Edgar Markov étudiés · 5,00 € Ajouter Arcane Signet rôle : Rampe · 80 % des decks de Edgar Markov .* Effet Rampe : 0 → 1 \(repère \d+\) Valeur du deck/);
assert.equal(await p.evaluate(() => DA.off.size), 0, '« Pourquoi ? » ne décoche pas');
// détail replié : note partie par partie, équilibre, mana, simulation, rapport
assert.equal(await p.$('.dw-gauges'), null);
await p.click('[data-da-fold="det"]'); await p.waitForSelector('.cb-in .dw-gauges'); assert.ok(await p.$('.cb-in .cb-parts .ds-p')); assert.ok(await p.$('.cb-in [data-da-report]'));
await p.waitForSelector('#daSimCard .cb-sts', { timeout: 20000 }); assert.match(await txt(p, '#daSimCard'), /^Simulation de 10 000 parties .* \d+ % mains de départ gardées/, 'simulation résumée dans le bilan');
await p.click('[data-da-fold="det"]'); await p.waitForFunction(() => !document.querySelector('.cb-in .dw-gauges'));
// réglages en bas : modifiés sur place, le bilan suit tout de suite
await p.click('[data-da-edit]'); await p.waitForSelector('#daBud');
await p.fill('#daBud', '100'); await p.dispatchEvent('#daBud', 'change');
await p.waitForFunction(() => document.querySelectorAll('.da-sw').length === 2);
sws = await swRows();
assert.match(sws[0], /^Gilded Removal → Swords to Plowshares \| Même rôle, bien moins chère/, 'au-dessus de la limite : la carte chère d\'abord');
assert.ok((await p.$$eval('.cb-act b', a => a.map(x => x.textContent))).some(t => /^Baisser le prix de /.test(t)), 'action : passer sous la limite');
assert.deepEqual(await p.evaluate(() => { const o = JSON.parse(localStorage.getItem(DW_SET + 'dk-ana')); return [o.bud, !!o.bv]; }), [10000, false], 'limite gardée pour ce deck');
assert.match(await txt(p, '#daGo'), /Ouvrir dans l'éditeur avec 2 échanges/); await shot(p, 'analyse');
await p.click('.da-sw:nth-child(2) .da-why');      // toute la ligne coche
await p.waitForFunction(() => DA.off.has(1)); await p.waitForFunction(() => /avec 1 échange$/.test(document.querySelector('#daGo').textContent));
assert.match(await txt(p, '[data-da-swt]'), /^Échanges conseillés 2 échanges · (note \d+ → \d+ · )?−898,10 € Masquer$/);
await p.click('[data-da-swt]'); await p.waitForFunction(() => !document.querySelector('.da-sws'));
assert.match(await txt(p, '[data-da-swt]'), /Afficher$/); assert.match(await txt(p, '#daGo'), /avec 1 échange$/, 'repliés : les échanges cochés restent');
await p.click('#daGo'); await p.waitForSelector('.bd.on'); await p.waitForSelector('.dw-gauges');
assert.deepEqual(await p.evaluate(() => [BD.id, BD.tab, BD.dirty, BD.main.has('gilded removal'), BD.main.has('swords to plowshares'), BD.main.has('weak one'), BD.wiz.bud]), ['dk-ana', 'coach', true, false, true, true, 10000]);
await p.evaluate(() => bdClose(true)); await p.waitForFunction(() => !document.querySelector('.bd'));
// réouverture : bilan direct avec les réglages gardés (limite 100 €)
await p.evaluate(() => openDeckAnalysis({ text: findDeck('dk-ana').text, name: 'Edgar à analyser', id: 'dk-ana' })); await p.waitForSelector('.cb-set');
assert.match(await txt(p, '.cb-set'), /limite 100,00 € Modifier$/); await closeSheets(p);
ok('coach d\'un deck complet : bilan direct (note, phrase, ≤ 3 actions, échanges repliés avec la note avant → après, détail, simulation), réglages en bas, échanges cochés appliqués dans l\'éditeur');

// c) deck qui n'est pas à moi (À monter) : aperçu, points forts et faibles, « Ajouter à mes decks », pas d'échanges
await p.evaluate(t => openDeckAnalysis({ text: t, name: 'Edgar EDHREC', from: 'edh' }), EDGAR(95)); await p.waitForSelector('.cb-pts', { timeout: 15000 });
assert.equal(await p.$('[data-da-swt]'), null, 'pas d\'échanges tant que le deck n\'est pas à moi'); assert.equal(await txt(p, '#daGo'), 'Ajouter à mes decks');
assert.deepEqual(await p.$$eval('.da-sheet .sec-title', t => t.map(x => x.textContent)), ['Points forts', 'Points faibles']);
await shot(p, 'coach-apercu');
const nDecks = await p.evaluate(() => allDecks().length);
await p.click('#daGo'); await p.waitForSelector('[data-da-swt]');
const added = await p.evaluate(() => { const d = allDecks().find(x => x.name === 'Edgar EDHREC'); return d && [DA.id === d.id, dkMeta(d.text, 'from'), dkTrack(d.text)]; });
assert.deepEqual(added, [true, 'edh', false], 'ajouté à Mes decks, venu d\'À monter : cartes manquantes pas suivies'); assert.equal(await p.evaluate(() => allDecks().length), nDecks + 1);
await closeSheets(p);
ok('coach d\'un deck À monter : aperçu (note, points forts et faibles), « Ajouter à mes decks » → bilan, deck marqué « venu d\'À monter »');

/* ── 6 ter) Règles des suggestions : identité d'un duo de commandants, combo à 2 cartes refusé en bracket 1-2, carte interdite jamais proposée ── */
assert.equal(await p.evaluate(() => dwCiOf(['edgar markov', 'llanowar elves'], 'WBR')), 'WBRG', 'duo : réunion des identités (EDHREC ne donne que celle du premier)');
const rules = await p.evaluate(() => {
  const core = DW.core, cmd = dwCmdOf({ cmdr: [{ key: 'edgar markov', name: 'Edgar Markov' }], main: new Map() }), pack = DW.cmd.get('edgar-markov');
  const X = br => ({ main: new Map([['swords to plowshares', { key: 'swords to plowshares', name: 'Swords to Plowshares', qty: 1 }]]), cmdr: [{ key: 'edgar markov', name: 'Edgar Markov' }], wiz: { th: [], br, bud: 0, own: false } });
  const sug = (br, role) => { const x = X(br), prof = dwProfile(x), tgt = dwTargets(prof, cmd, pack, x.wiz); return dwSuggest(role, cmd, pack, prof, tgt, 20, x).map(s => s.k); };
  core.combos.push(['Swords to Plowshares', 'Wrath of God', 'Test combo', 'S']); DW.comboIdx = null;
  const out = { br2: sug(2, 'wipe'), br3: sug(3, 'wipe') };
  core.combos.pop(); DW.comboIdx = null;
  // combo à 3 cartes (core.combos3) : Swords + Edgar (le commandant) + Wrath ; un autre dont une seule pièce est là ne compte pas
  core.combos3 = [['Swords to Plowshares', 'Phyrexian Arena', 'Wrath of God', 'Other combo', 'S']]; DW.combo3Idx = null;
  const one = sug(2, 'wipe');      // Phyrexian Arena absente : rien à compléter
  core.combos3 = [['Swords to Plowshares', 'Edgar Markov', 'Wrath of God', 'Test combo 3', 'S']]; DW.combo3Idx = null;
  out.c3 = { one, br2: sug(2, 'wipe'), br3: sug(3, 'wipe') };
  { const x = X(4), prof = dwProfile(x), tgt = dwTargets(prof, cmd, pack, x.wiz), l = dwSuggest('wipe', cmd, pack, prof, tgt, 20, x), w = l.find(s => s.k === 'wrath of god'); out.c3.br4 = w ? w.combo : null; out.c3.why = w ? dwComboWhy(w.combo) : ''; }
  { const x = X(2); x.wiz.avoid = ['combo']; x.wiz.br = 3; const prof = dwProfile(x), tgt = dwTargets(prof, cmd, pack, x.wiz); out.c3.avoid = dwSuggest('wipe', cmd, pack, prof, tgt, 20, x).map(s => s.k); }
  { const x = X(2); x.main.set('wrath of god', { key: 'wrath of god', name: 'Wrath of God', qty: 1 }); const prof = dwProfile(x); out.c3.prof = prof.combos.map(c => c.join('|')); out.c3.est = dwBracketOf(prof); out.c3.html = dwBracketHtml(prof, x.wiz); out.c3.html3 = dwBracketHtml(prof, { ...x.wiz, br: 3 }); }
  delete core.combos3; DW.combo3Idx = null;
  const r = DW.byKey.get('phyrexian arena'), fl = r[6]; r[6] = fl | 16; out.ban = sug(3, 'draw'); r[6] = fl;
  return out;
});
assert.ok(!rules.br2.includes('wrath of god') && rules.br3.includes('wrath of god'), 'combo à 2 cartes : refusé en bracket 2, permis en bracket 3 ' + JSON.stringify(rules));
assert.ok(!rules.ban.includes('phyrexian arena'), 'carte interdite en Commander : jamais proposée');
{ const c = rules.c3, j = JSON.stringify(c);
  assert.ok(!c.br2.includes('wrath of god') && c.br3.includes('wrath of god'), 'combo à 3 cartes : la pièce qui le complète refusée en bracket 2, permise en bracket 3 ' + j);
  assert.ok(!c.avoid.includes('wrath of god'), 'combos évités : jamais la pièce qui complète ' + j);
  assert.ok(c.one.includes('wrath of god'), 'une seule autre pièce là : pas un combo à compléter ' + j);
  assert.deepEqual([...(c.br4 || [])].sort(), ['Edgar Markov', 'Swords to Plowshares'], 'bracket 4 : les deux autres pièces ' + j); assert.match(c.why, /^combo avec (Swords to Plowshares et Edgar Markov|Edgar Markov et Swords to Plowshares)$/);
  assert.deepEqual(c.prof, ['Swords to Plowshares|Edgar Markov|Wrath of God|Test combo 3|S'], 'combo à 3 cartes complet compté une fois dans le profil ' + j); assert.equal(c.est, 3, 'bracket estimé : 3');
  assert.match(c.html, /Combo à 3 cartes à éviter en bracket 2 : Swords to Plowshares \+ Edgar Markov \+ Wrath of God \(Test combo 3\)/); assert.match(c.html3, /Combo à 3 cartes, permis en bracket 3/); }
ok('règles des suggestions : duo de commandants, combo à 2 cartes (bracket 1-2), combo à 3 cartes (brackets 1-2, 3, 4), carte interdite');

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

/* ── Raisons des échanges, commandant qui coûte presque tout le budget ── */
{
  const why = await p.evaluate(() => { const cmd = { names: ['Edgar Markov'] }; const sw = (a, b, w) => daWhy({ why: w, out: { name: 'A', o: { incl: a } }, in: { k: 'x', name: 'B', o: { incl: b } } }, cmd); return [sw(24, 20, 'mieux'), sw(5, 45, 'mieux'), sw(0, 0, 'plan'), sw(0, 44, 'plan')]; });
  assert.doesNotMatch(why[0], /bien plus jouée/, 'proposée moins jouée (20 % contre 24 %) : pas « bien plus jouée » : ' + why[0]);
  assert.match(why[0], /^Même rôle, plus utile dans ce deck avec Edgar Markov/);
  assert.match(why[1], /^Même rôle, bien plus jouée avec Edgar Markov · 45 % des decks \(contre 5 %\)/);
  // piège de la fiche qui fait un combo (ou un moteur) avec une autre carte du deck : plus traité comme un piège (sauf bracket 1-2 ou combos évités)
  assert.deepEqual(await p.evaluate(() => { const inD = k => k === 'armageddon' || k === 'swamp'; return [dwTrapOk('sol ring', { trap: 1 }, inD, { br: 4 }), dwTrapOk('sol ring', { trap: 1 }, inD, { br: 2 }), dwTrapOk('sol ring', { trap: 1 }, inD, { br: 4, avoid: ['combo'] }), dwTrapOk('sol ring', { trap: 1, eng: [['sol ring', 'swamp']] }, inD, { br: 2 }), dwTrapOk('sol ring', { trap: 0 }, inD, { br: 4 })]; }),
    [{ kind: 'combo', with: ['Armageddon'] }, null, null, { kind: 'eng', with: ['Swamp'] }, null]);
  assert.match(why[2], /^Sert mieux le plan de Edgar Markov/); assert.match(why[3], /^Bien plus jouée avec Edgar Markov/);
  // budget de 8 € pour Edgar (5 €) : la question d'abord ; « Appliquer le budget aux 99 autres cartes » → budget total = 8 € + le commandant, gardé (plus de question)
  await p.evaluate(() => openBuilder({ name: 'Budget serré', fmt: 'commander', cmdr: [{ key: 'edgar markov', name: 'Edgar Markov' }], wiz: dwSane({ br: 2, bud: 800 }) })); await p.waitForSelector('.bd.on');
  await p.click('#bdSeg .seg-opt[data-v="coach"]'); await p.waitForFunction(() => DW.core && DW.cmd.has('edgar-markov'));
  await p.evaluate(() => { dwBuild(); }); await p.waitForSelector('.ds-bud-sheet [data-bud-99]');
  assert.match(await txt(p, '.ds-bud-sheet .sheet-body'), /Edgar Markov coûte 5,00 € à lui seul, sur un budget de 8,00 €/);
  assert.match(await txt(p, '.ds-bud-sheet [data-bud-99]'), /Appliquer le budget aux 99 autres cartes\s*Budget total : 13,00 €/);
  assert.equal(await p.$eval('#dsBudNew', i => i.value), '20', 'budget conseillé prérempli (arrondi à 10 €)');
  await p.click('.ds-bud-sheet [data-bud-99]'); await p.waitForSelector('.ds-sheet', { timeout: 15000 });
  assert.deepEqual(await p.evaluate(() => [BD.wiz.bud, BD.wiz.budAck]), [1300, 1300]);
  await p.evaluate(() => DS.api && DS.api.close()); await p.waitForFunction(() => !document.querySelector('.ds-sheet'));
  await p.evaluate(() => { dwBuild(); }); await p.waitForSelector('.ds-sheet', { timeout: 15000 }); assert.equal(await p.$('.ds-bud-sheet'), null, 'choix gardé : plus de question');
  await p.evaluate(() => DS.api && DS.api.close()); await p.waitForFunction(() => !document.querySelector('.ds-sheet'));
  // « Revoir le budget » : le montant saisi
  await p.evaluate(() => { BD.wiz.bud = 600; delete BD.wiz.budAck; dwBuild(); }); await p.waitForSelector('.ds-bud-sheet [data-bud-new]');
  await p.fill('#dsBudNew', '40'); await p.click('.ds-bud-sheet [data-bud-new]'); await p.waitForSelector('.ds-sheet', { timeout: 15000 });
  assert.deepEqual(await p.evaluate(() => [BD.wiz.bud, BD.wiz.budAck]), [4000, 4000]);
  await p.evaluate(() => DS.api && DS.api.close()); await p.waitForFunction(() => !document.querySelector('.ds-sheet'));
  await p.evaluate(() => bdClose(true));
}
ok('échanges : « bien plus jouée » seulement si c\'est vrai ; commandant qui coûte presque tout le budget : question avant la construction (99 autres cartes ou autre budget), choix gardé');

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
