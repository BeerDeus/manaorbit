// Base de l'assistant de deck Commander : générateur (gen-deckdb.mjs : rôles des cartes, profils et statistiques des decks, pages EDHREC, decks Archidekt, agrégats),
// serveur (server/dkw-srv.mjs : découpe, /api/dkw, ETag, erreurs), calculs de l'appli (src/deckwiz.js : formule de Karsten, symboles de mana, sources) et
// fonctionnalités en test (src/labs.js). Sans réseau ni navigateur.
import './setup-env.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { gzipSync, gunzipSync } from 'node:zlib';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { ROLES, RB, tagRoles, userCatRoles, textRoles, cardRoles, deckProfile, statsOf, edhPage, archDeckIn, corpusNew, aggregate, typeBits, scryCard, topThemes } from '../gen-deckdb.mjs';
import { normKey } from '../gen-edhrec.mjs';
import { dkwSplit, dkwMake } from '../server/dkw-srv.mjs';
const require = createRequire(import.meta.url);
const has = (b, r) => !!(b & RB[r]);

test('rôles : même liste dans le générateur et dans l\'appli (deckwiz.js)', () => {
  global.DAY = 864e5;
  const W = require('../src/deckwiz.js');
  assert.deepEqual(W.DKW_ROLES, ROLES);
});

test('rôles : étiquettes du Tagger (oTags d\'Archidekt et otag: de Scryfall)', () => {
  assert.ok(has(tagRoles('land ramp'), 'ramp')); assert.ok(has(tagRoles('mana rock'), 'ramp')); assert.ok(has(tagRoles('mana-dork'), 'ramp'));
  assert.equal(tagRoles('tutor-land-basic'), 0, 'seul : peut aussi servir un adversaire (Settle the Wreckage)'); assert.equal(tagRoles('pure draw'), 0, 'trop large (Mind Stone)');
  assert.ok(!has(cardRoles({ dc: 'Ramp', tags: ['land ramp', 'tutor-land-basic', 'tutor-to-hand'] }), 'tutor'), 'Cultivate : rampe, pas tuteur'); assert.ok(has(cardRoles({ dc: 'Tutor', tags: ['tutor-card', 'tutor-to-hand'] }), 'tutor'), 'Demonic Tutor');
  assert.equal(cardRoles({ dc: 'Removal', tags: ['sweeper-one-sided', 'removal-creature'] }), RB.wipe, 'balayage : pas compté en retrait ciblé');
  assert.ok(has(tagRoles('tutor-to-hand'), 'tutor')); assert.ok(has(tagRoles('draw engine'), 'draw')); assert.ok(!has(tagRoles('cantrip'), 'draw'), 'cantrip seul : pas d\'avantage');
  assert.ok(has(tagRoles('spot removal'), 'removal')); assert.ok(has(tagRoles('removal-creature'), 'removal')); assert.ok(has(tagRoles('sweeper'), 'wipe')); assert.ok(has(tagRoles('sweeper-one-sided'), 'wipe'));
  assert.ok(has(tagRoles('counterspell-soft'), 'counter')); assert.ok(has(tagRoles('protects-creature'), 'protect')); assert.ok(has(tagRoles('reanimate-creature'), 'recursion'));
  assert.equal(tagRoles('alliteration'), 0); assert.equal(tagRoles('activated ability'), 0); assert.equal(tagRoles('synergy-commander'), 0);
});

test('rôles : catégories écrites par les auteurs de decks', () => {
  assert.ok(has(userCatRoles('Ramp & Reduction'), 'ramp')); assert.ok(has(userCatRoles('Card Draw'), 'draw')); assert.ok(has(userCatRoles('Board Wipes'), 'wipe'));
  assert.ok(!has(userCatRoles('Board Wipes'), 'removal'), 'balayage, pas retrait ciblé'); assert.ok(has(userCatRoles('Spot Removal'), 'removal')); assert.ok(has(userCatRoles('Interaction'), 'removal'));
  assert.ok(has(userCatRoles('Counterspells'), 'counter')); assert.ok(has(userCatRoles('Tutors'), 'tutor')); assert.ok(has(userCatRoles('Win Cons'), 'wincon'));
  assert.equal(userCatRoles('Creature'), 0); assert.equal(userCatRoles('Land'), 0); assert.equal(userCatRoles('Equipment Buffs'), 0); assert.equal(userCatRoles('Mana Sink'), 0);
});

test('rôles : texte de la carte en dernier recours', () => {
  assert.ok(has(textRoles({ type: 'Artifact', text: '{T}: Add {C}{C}.' }), 'ramp'), 'Sol Ring');
  assert.ok(has(textRoles({ type: 'Sorcery', text: 'Search your library for up to two basic land cards, reveal those cards, put one onto the battlefield tapped and the other into your hand, then shuffle.' }), 'ramp'), 'Cultivate');
  assert.ok(has(textRoles({ type: 'Instant', text: 'Exile target creature. Its controller gains life equal to its power.' }), 'removal'), 'Swords');
  assert.ok(has(textRoles({ type: 'Sorcery', text: 'Destroy all creatures. They can\'t be regenerated.' }), 'wipe'), 'Wrath'); assert.ok(!has(textRoles({ type: 'Sorcery', text: 'Destroy all creatures.' }), 'removal'));
  assert.ok(has(textRoles({ type: 'Instant', text: 'Counter target spell.' }), 'counter')); assert.ok(has(textRoles({ type: 'Sorcery', text: 'Search your library for a card, put that card into your hand, then shuffle. You lose 2 life.' }), 'tutor'), 'Demonic Tutor');
  assert.ok(has(textRoles({ type: 'Enchantment', text: 'Whenever an opponent casts a spell, you may draw a card unless that player pays {1}.' }), 'draw'), 'Rhystic Study');
  assert.equal(textRoles({ name: 'Command Tower', type: 'Land', text: '{T}: Add one mana of any color in your commander\'s color identity.' }), RB.land);
});

test('rôles : sources combinées (Archidekt, Tagger, votes, texte)', () => {
  assert.ok(has(cardRoles({ dc: 'Ramp' }), 'ramp')); assert.ok(has(cardRoles({ dc: 'Draw', tags: ['spot removal'] }), 'removal'), 'catégorie et étiquettes s\'ajoutent');
  assert.ok(has(cardRoles({ votes: { draw: 6 }, decks: 10 }), 'draw'), '6 votes sur 10 decks'); assert.equal(cardRoles({ votes: { draw: 2 }, decks: 10 }), 0, '2 votes : pas assez');
  assert.ok(has(cardRoles({ scry: { type: 'Instant', text: 'Counter target spell.' } }), 'counter'), 'sans autre source : le texte');
  assert.equal(cardRoles({ dc: 'Tokens', scry: { type: 'Instant', text: 'Counter target spell.' } }) & RB.counter, 0, 'carte déjà classée ailleurs : le texte ne s\'ajoute pas');
  assert.equal(cardRoles({ dc: 'Removal', scry: { name: 'Mutavault', type: 'Land', text: '' } }), RB.land, 'un terrain reste un terrain');
});

test('profils de decks, statistiques (quartiles)', () => {
  const info = new Map([['forest', { roles: RB.land, cmc: 0 }], ['sol ring', { roles: RB.ramp, cmc: 1, gc: 1 }], ['cultivate', { roles: RB.ramp, cmc: 3 }], ['rhystic study', { roles: RB.draw, cmc: 3 }], ['bear', { roles: 0, cmc: 2 }]]);
  const p = deckProfile([['forest', 36], ['sol ring', 1], ['cultivate', 1], ['rhystic study', 1], ['bear', 60]], k => info.get(k));
  assert.equal(p.n, 99); assert.equal(p.land, 36); assert.equal(p.ramp, 2); assert.equal(p.draw, 1); assert.equal(p.cheap, 1, 'Sol Ring : rampe à 2 ou moins'); assert.equal(p.gc, 1);
  assert.equal(p.mv, +((1 + 3 + 3 + 120) / 63).toFixed(2));
  const s = statsOf([{ land: 34 }, { land: 36 }, { land: 37 }, { land: 38 }, { land: 40 }].map(x => ({ ...p, ...x })));
  assert.equal(s.n, 5); assert.deepEqual(s.land, [36, 37, 38]);
});

test('pages EDHREC : cartes (inclusion, synergie), thèmes, courbe, brackets ; nouvelles cartes ignorées', () => {
  const j = { land: 36, basic: 12, bracket_counts: { 1: 10, 2: 30, 3: 50, 4: 9, 5: 1 }, panels: { taglinks: [{ slug: 'plus-1-plus-1-counters', value: '+1/+1 Counters', count: 300 }, { slug: 'infect', value: 'Infect', count: 40 }, { slug: 'bad slug!', value: 'x', count: 5 }], mana_curve: { 1: 8, 2: 18, x: 3 } },
    container: { json_dict: { cardlists: [{ tag: 'newcards', cardviews: [{ name: 'New', num_decks: 5, potential_decks: 10 }] }, { tag: 'creatures', cardviews: [{ name: 'Hardened Scales', num_decks: 60, potential_decks: 100, synergy: 0.42 }, { name: 'Sol Ring', num_decks: 95, potential_decks: 100, synergy: -0.03 }, { name: 'Hardened Scales', num_decks: 1, potential_decks: 100 }] }] } } };
  const p = edhPage(j);
  assert.deepEqual(p.cards, [['Hardened Scales', 60, 42], ['Sol Ring', 95, -3]]); assert.equal(p.land, 36); assert.equal(p.n, 100, 'decks : somme des brackets');
  assert.deepEqual(p.th.map(t => t[0]), ['plus-1-plus-1-counters', 'infect']); assert.deepEqual(p.curve, { 1: 8, 2: 18 });
  assert.deepEqual(topThemes({ n: 1000, thl: p.th }).map(t => t[0]), ['plus-1-plus-1-counters'], 'thème à 4 % des decks : pas approfondi');
  assert.equal(edhPage(null), null);
});

const archCard = (name, cats, o = {}) => ({ quantity: o.q || 1, categories: cats, card: { oracleCard: { name, cmc: o.cmc || 0, types: o.types || ['Creature'], defaultCategory: o.dc || null, oTags: o.ot || [], gameChanger: !!o.gc } } });
test('decks Archidekt : commandant, peut-être et réserve exclus, méta des cartes, catégories d\'auteur', () => {
  const C = corpusNew(); C.ucats = [];
  const idx = new Map(), ix = n => { const k = normKey(n); if (!idx.has(k)) { idx.set(k, C.names.length); C.names.push(n); C.meta.push({}); } return idx.get(k); };
  const uc = new Map(), ucIx = s => { if (!uc.has(s)) { uc.set(s, C.ucats.length); C.ucats.push(s); } return uc.get(s); };
  const cards = [archCard('Atraxa, Praetors\' Voice', ['Commander']), archCard('Sol Ring', ['Ramp'], { dc: 'Ramp', ot: ['mana rock'], gc: 1, types: ['Artifact'], cmc: 1 }), archCard('Maybe Card', ['Maybeboard']),
    archCard('Forest', ['Land'], { q: 40, types: ['Land'] }), ...Array.from({ length: 58 }, (_, i) => archCard('Card ' + i, ['Creature']))];
  const d = archDeckIn(C, { id: 7, viewCount: 99, updatedAt: '2026-09-01T00:00:00Z', createdAt: '2025-01-01T00:00:00Z', edhBracket: 3, deckTags: [{ name: 'Counters' }], cards }, ix, ucIx);
  assert.equal(d.n, 99); assert.equal(d.cmd.length, 1); assert.equal(C.names[d.cmd[0]], 'Atraxa, Praetors\' Voice'); assert.equal(d.br, 3); assert.equal(d.u, '2026-09-01'); assert.deepEqual(d.tg, ['Counters']);
  assert.ok(!C.names.includes('Maybe Card') || !d.c.some(([i]) => C.names[i] === 'Maybe Card'), 'peut-être exclu');
  const sol = C.meta[C.names.indexOf('Sol Ring')]; assert.equal(sol.dc, 'Ramp'); assert.deepEqual(sol.ot, ['mana rock']); assert.equal(sol.gc, 1);
  const solRow = d.c.find(([i]) => C.names[i] === 'Sol Ring'); assert.equal(C.ucats[solRow[2]], 'ramp', 'catégorie d\'auteur gardée'); assert.equal(d.c.find(([i]) => C.names[i] === 'Forest')[2], -1, '« Land » : un type, pas un rôle');
  assert.equal(archDeckIn(C, { id: 8, cards: cards.slice(0, 10) }, ix, ucIx), null, '10 cartes : pas un deck Commander');
  assert.equal(archDeckIn(C, { id: 9, cards: cards.slice(1) }, ix, ucIx), null, 'sans commandant');
});

test('agrégats : table des cartes, cibles, commandants, thèmes', () => {
  const C = corpusNew(); C.ucats = ['ramp', 'draw'];
  C.names = ['Atraxa, Praetors\' Voice', 'Sol Ring', 'Forest', 'Rhystic Study', 'Bear', 'Hardened Scales'];
  C.meta = [{}, { dc: 'Ramp', gc: 1 }, {}, { dc: 'Draw' }, {}, {}];
  for (let i = 0; i < 30; i++) C.decks[i] = { id: i, cmd: [0], v: 10, u: '2026-10-01', br: i < 15 ? 2 : 4, n: 99, c: [[1, 1, 0], [2, 36 + (i % 3), -1], [3, 1, 1], [4, 61 - (i % 3), -1]] };
  C.decks[99] = { id: 99, skip: 1 };
  C.edh['atraxa-praetors-voice'] = { at: '2026-10-01', n: 5000, land: 36, cards: [['Hardened Scales', 60, 42], ['Sol Ring', 95, -3]], thl: [['infect', 'Infect', 900]], th: { infect: { n: 900, cards: [['Hardened Scales', 30, 10]] } } };
  C.tags['plus-1-plus-1-counters'] = { at: '2026-10-01', n: 9000, cards: [['Hardened Scales', 70, 50]], cmds: [['atraxa-praetors-voice', 2000]] };
  const S = new Map([
    ['sol ring', scryCard({ name: 'Sol Ring', layout: 'normal', cmc: 1, type_line: 'Artifact', oracle_text: '{T}: Add {C}{C}.', color_identity: [], legalities: { commander: 'legal' }, prices: { eur: '1.50' }, game_changer: true, produced_mana: ['C'], edhrec_rank: 1 })],
    ['forest', scryCard({ name: 'Forest', layout: 'normal', cmc: 0, type_line: 'Basic Land — Forest', oracle_text: '({T}: Add {G}.)', color_identity: ['G'], legalities: { commander: 'legal' }, produced_mana: ['G'] })],
    ['rhystic study', scryCard({ name: 'Rhystic Study', layout: 'normal', cmc: 3, type_line: 'Enchantment', oracle_text: 'Whenever an opponent casts a spell, you may draw a card unless that player pays {1}.', color_identity: ['U'], legalities: { commander: 'legal' }, prices: { eur: '30' } })],
    ['banned thing', scryCard({ name: 'Banned Thing', layout: 'normal', cmc: 2, type_line: 'Sorcery', oracle_text: 'Counter target spell.', color_identity: ['U'], legalities: { commander: 'banned' } })],
    ['cultivate', scryCard({ name: 'Cultivate', layout: 'normal', cmc: 3, type_line: 'Sorcery', oracle_text: 'Search your library for up to two basic land cards, reveal those cards, put one onto the battlefield tapped and the other into your hand, then shuffle.', color_identity: ['G'], legalities: { commander: 'legal' }, prices: { eur: '0.30' } })],
  ]);
  const cmds = [{ slug: 'atraxa-praetors-voice', names: ['Atraxa, Praetors\' Voice'], ci: 'WUBG', decks: 5000, themes: [['plus-1-plus-1-counters', '+1/+1 Counters', 300]] }];
  const D = aggregate(C, S, new Map([['cultivate', RB.ramp]]), cmds);
  const row = n => D.cards.find(r => r[0] === n);
  assert.deepEqual(D.roles, ROLES); assert.equal(row('Banned Thing'), undefined, 'bannie en Commander : hors table');
  assert.ok(row('Sol Ring')[4] & RB.ramp); assert.equal(row('Sol Ring')[5], 150); assert.equal(row('Sol Ring')[6] & 1, 1, 'Game Changer'); assert.equal(row('Sol Ring')[8], 1, 'rang EDHREC');
  assert.equal(row('Forest')[4], RB.land); assert.equal(row('Forest')[7], 'G'); assert.equal(row('Forest')[3] & 1, 1, 'type : terrain');
  assert.ok(row('Rhystic Study')[4] & RB.draw); assert.ok(row('Cultivate')[4] & RB.ramp, 'Tagger');
  assert.equal(D.tg.all.n, 30); assert.deepEqual(D.tg.all.land, [36, 37, 38]); assert.equal(D.tg.all.ramp[1], 1); assert.equal(D.tg.br[2].n, 15); assert.equal(D.tg.br[4].n, 15); assert.equal(D.tg.br[3], undefined, 'moins de 15 decks : pas de statistiques');
  assert.equal(D.tg.th['plus-1-plus-1-counters'].n, 30, 'thème du commandant'); assert.equal(D.tg.nc[4].n, 30, 'quatre couleurs');
  const A = D.cmd['atraxa-praetors-voice']; assert.equal(A.nd, 30); assert.deepEqual(A.cards[0], ['Hardened Scales', 60, 42]); assert.deepEqual(Object.keys(A.th), ['infect']); assert.equal(A.tg.n, 30);
  assert.ok(A.xc.some(([n]) => n === 'Bear'), 'carte des decks Archidekt absente d\'EDHREC'); assert.ok(!A.xc.some(([n]) => n === 'Sol Ring'), 'déjà dans EDHREC');
  assert.deepEqual(D.themes['plus-1-plus-1-counters'].cmds, [['atraxa-praetors-voice', 2000]]);
  assert.equal(typeBits('Legendary Creature — Phyrexian Angel Horror'), 2 | 256); assert.equal(typeBits('Land // Creature'), 1);
});

test('serveur : découpe, /api/dkw (cœur, commandant, thème), gzip, ETag, erreurs', async () => {
  const D = { v: 1, at: '2026-11-01T00:00:00Z', roles: ROLES, cards: [['Sol Ring', '', 1, 4, 2, 150, 1, 'C', 1]], tg: { all: { n: 3 } }, cmd: { 'edgar-markov': { n: 9, cards: [['Sol Ring', 90, 1]] }, 'BAD SLUG': {} }, themes: { tokens: { n: 5, cards: [] } } };
  const s = dkwSplit(D); assert.equal(s.cmd.size, 1, 'adresse invalide écartée'); assert.equal(s.th.size, 1);
  assert.throws(() => dkwSplit({ v: 2 }));
  const dir = mkdtempSync(join(tmpdir(), 'dkw-')), file = join(dir, 'dkw.json.gz'); writeFileSync(file, gzipSync(Buffer.from(JSON.stringify(D))));
  process.env.DKW_SMALL = '1';
  const json = (res, st, o) => { res.writeHead(st, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); };
  const S = dkwMake({ src: '', file, dir: join(dir, 'copy'), json, log: { log() {}, warn() {} } });
  const call = async (q, hd = {}) => { const res = { st: 0, hd: {}, body: null, writeHead(st, h) { this.st = st; this.hd = h || {}; }, end(b) { this.body = b; } }; await S.api({ method: 'GET', headers: hd }, res, new URL('http://x/api/dkw' + q)); return res; };
  assert.equal((await call('')).st, 503, 'pas encore chargé'); S.start(); await new Promise(r => setTimeout(r, 80));
  const core = await call('', { 'accept-encoding': 'gzip' }); assert.equal(core.st, 200); assert.equal(core.hd['Content-Encoding'], 'gzip');
  const cj = JSON.parse(gunzipSync(core.body)); assert.deepEqual(cj.cmds, ['edgar-markov']); assert.deepEqual(cj.themes, [['tokens', 5]]); assert.equal(cj.cards.length, 1); assert.equal(cj.cmd, undefined, 'paquets des commandants à part');
  const c = await call('?c=edgar-markov'); assert.equal(c.st, 200); assert.equal(c.hd['Content-Encoding'], undefined, 'sans gzip demandé'); assert.equal(JSON.parse(c.body).cards[0][1], 90);
  assert.equal((await call('?c=edgar-markov', { 'if-none-match': c.hd.ETag })).st, 304);
  assert.equal((await call('?t=tokens')).st, 200); assert.equal((await call('?c=inconnu')).st, 404); assert.equal((await call('?c=../etc')).st, 400);
  assert.equal(S.status().cards, 1); assert.equal(S.status().from, 'fichier');
  delete process.env.DKW_SMALL; rmSync(dir, { recursive: true, force: true });
});

test('appli : formule des terrains (Karsten), symboles de mana, sources conseillées', () => {
  global.DAY = 864e5;
  const W = require('../src/deckwiz.js');
  assert.equal(Math.round(W.dwKarsten(3, 10)), 38, 'coût moyen 3, 10 sorts pas chers : 38 terrains');
  assert.ok(W.dwKarsten(2.5, 14) < W.dwKarsten(3.5, 6));
  assert.deepEqual(W.dwPips('{2}{G}{G}'), { G: 2 }); assert.deepEqual(W.dwPips('{W/U}{B}'), { W: 0.5, U: 0.5, B: 1 }); assert.deepEqual(W.dwPips('{G/P}'), { G: 1 }); assert.deepEqual(W.dwPips(''), {});
  assert.deepEqual([W.dwSrcFor(1, 1), W.dwSrcFor(1, 2), W.dwSrcFor(1, 4), W.dwSrcFor(1, 9), W.dwSrcFor(2, 2), W.dwSrcFor(2, 3), W.dwSrcFor(3, 3), W.dwSrcFor(4, 4), W.dwSrcFor(0.5, 3)], [19, 19, 16, 14, 30, 28, 36, 39, 18], 'table de Karsten (99 cartes) ; hybride : un symbole');
  assert.deepEqual(W.dwLandTarget(3, 10, 3), [35, 38, 41], 'casual : formule, ± 3'); assert.deepEqual(W.dwLandTarget(1.5, 0, 3), [34, 36, 39], 'plancher de 34'); assert.deepEqual(W.dwLandTarget(5, 0, 3), [39, 42, 44], 'plafond de 42');
  assert.deepEqual(W.dwLandTarget(2.3, 14, 5), [27, 31, 33], 'cEDH : formule − 3,5'); assert.equal(W.dwLandTarget(3, 10, 3, 3)[1], 41, 'landfall : + 3');
  assert.deepEqual(W.dwModel({ br: 3, th: ['voltron', 'tokens'] }).protect, [8, 12, 14], 'premier archétype choisi'); assert.equal(W.dwModel({ br: 5, th: [] }).tutor[1], 10, 'cEDH : tuteurs');
  assert.deepEqual(W.DW_BRACKETS.map(b => b[3]), [0, 0, 3, 99, 99], 'Game Changers permis par bracket');
});

test('fonctionnalités en test : allumées pour la session seulement', () => {
  const store = {}; global.sessionStorage = { getItem: k => store[k] ?? null, setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } };
  const L = require('../src/labs.js');
  assert.equal(L.labOn('deckwiz'), false); L.labSet('deckwiz', true); assert.equal(L.labOn('deckwiz'), true); assert.match(store['deckdeal:labs'], /deckwiz/);
  L.labSet('inconnue', true); assert.equal(L.labOn('inconnue'), false, 'seulement celles de la liste'); L.labSet('deckwiz', false); assert.equal(L.labOn('deckwiz'), false);
  assert.ok(L.LABS.every(l => l.id && l.name && l.desc));
});
