// Chasse aux staples (src/staples.js), logique seule sous Node : popularité dans les decks EDHREC (identité de couleur, poids des commandants), score de popularité,
// quotas et choix équilibrés par couleur (seuil de qualité), réserve des remplacements, texte de la liste, offre CardTrader acceptée ; puis les candidates
// avec le vrai coach dans une vm (tools/coach-eval.mjs › coachCtx) sur une petite base : terrains de base, interdites, prix au-dessus du maximum ou aberrant,
// exemplaires libres (engagés = à acheter), couleurs, incolores, rôles, mécaniques, quantité voulue. Aucun port.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const S = require('../src/staples.js');
const { coachCtx } = await import('../tools/coach-eval.mjs');

/** Faux index EDHREC (edhIndex) : commandants { ci, decks } et decks [[commandant, [clés]]]. */
function fakeE(cmds, decks) {
  const keys = [...new Set(decks.flatMap(d => d[1]))], ids = [], off = [0];
  for (const [, cs] of decks) { for (const k of cs) ids.push(keys.indexOf(k)); off.push(ids.length); }
  return { cmds: cmds.map((c, i) => ({ ...c, i })), decks: decks.map(([ci]) => ({ cmd: { i: ci } })), names: keys, keys, off, ids, bs: new Uint8Array(keys.length).map((_, i) => (keys[i] === 'forest' ? 1 : 0)) };
}

test('popularité : part des decks des commandants dont l\'identité permet la carte, pondérée par commandant', () => {
  const E = fakeE([{ ci: 'G', decks: 100 }, { ci: 'U', decks: 100 }, { ci: 'UG', decks: 100 }],
    [[0, ['sol', 'cultivate', 'forest']], [0, ['sol']], [1, ['sol', 'opt']], [2, ['cultivate', 'opt', 'sol']]]);
  const ci = { sol: '', cultivate: 'G', opt: 'U', forest: '' }, pop = S.stpPopIndex(E, k => (k in ci ? ci[k] : null));
  assert.equal(pop.get('sol'), 1, 'jouée par tous les commandants');
  assert.ok(Math.abs(pop.get('cultivate') - 0.75) < 1e-9, 'G : la moitié des decks de G (0,5) + UG (1) sur 2 commandants');
  assert.equal(pop.get('opt'), 1, 'U et UG la jouent');
  assert.equal(pop.has('forest'), false, 'terrain de base ignoré');
  assert.equal(S.stpPopIndex(null, () => '').size, 0);
});

test('score de popularité : échelle log et rang EDHREC', () => {
  assert.equal(S.stpPopScore(0, 0), 0);
  assert.ok(Math.abs(S.stpPopScore(1, 1) - 1) < 1e-9);
  assert.ok(S.stpPopScore(0.26, 57) > S.stpPopScore(0.04, 891) && S.stpPopScore(0.04, 891) > S.stpPopScore(0, 13557), 'Negate > Tragic Slip > carte jamais jouée');
});

test('groupes, quotas, choix équilibré et réserve', () => {
  assert.deepEqual([S.stpGroup(''), S.stpGroup('W'), S.stpGroup('WU'), S.stpGroup('GG')], ['C', 'W', 'M', 'G']);
  assert.deepEqual(S.stpGroupsOf({ cols: '', cless: true }), ['W', 'U', 'B', 'R', 'G', 'M', 'C']);
  assert.deepEqual(S.stpGroupsOf({ cols: 'B', cless: false }), ['B']);
  const q = S.stpQuotas(150, S.stpGroupsOf({ cols: '', cless: true }));
  assert.equal(Object.values(q).reduce((a, x) => a + x, 0), 150);
  assert.ok(q.M < q.W, 'multicolore : part plus petite');
  // 10 blanches fortes, 10 bleues moyennes, 10 incolores faibles : 12 cartes, quotas 4 / 4 / 4 ; les incolores trop faibles laissent leur place
  const R = [];
  for (let i = 0; i < 10; i++) R.push({ k: 'w' + i, g: 'W', s: 0.9 - i * 0.01 }, { k: 'u' + i, g: 'U', s: 0.8 - i * 0.01 }, { k: 'c' + i, g: 'C', s: 0.3 - i * 0.01 });
  R.sort((a, b) => b.s - a.s);
  const { pick, rest } = S.stpPick(R, 12, { W: 4, U: 4, C: 4 });
  assert.equal(pick.length, 12); assert.equal(pick.length + rest.length, 30);
  assert.equal(pick.filter(x => x.g === 'C').length, 0, 'incolores sous le seuil de qualité : remplacées par les meilleures des autres');
  assert.equal(pick.filter(x => x.g === 'U').length >= 4, true);
  const same = S.stpPick(R.map(x => ({ ...x, s: x.g === 'C' ? x.s + 0.55 : x.s })).sort((a, b) => b.s - a.s), 12, { W: 4, U: 4, C: 4 }).pick;
  assert.deepEqual(['W', 'U', 'C'].map(g => same.filter(x => x.g === g).length), [4, 4, 4], 'niveaux proches : quotas respectés');
  assert.deepEqual(S.stpPick(R, 3, null).pick.map(x => x.k), ['w0', 'w1', 'w2'], 'sans quotas : classement pur');
  const box = { bal: true, rest: [{ k: 'a', g: 'U' }, { k: 'b', g: 'W' }] };
  assert.equal(S.stpNext(box, 'W').k, 'b'); assert.equal(S.stpNext(box, 'W').k, 'a', 'groupe vide : la meilleure de la réserve'); assert.equal(S.stpNext(box, 'W'), null);
});

test('texte de la liste (ordre par couleur) et offre CardTrader acceptée', () => {
  const R = { bal: true, list: [{ name: 'Opt', g: 'U', s: 0.5, need: 1 }, { name: 'Disenchant', g: 'W', s: 0.4, need: 2 }, { name: 'Mind Stone', g: 'C', s: 0.9, need: 1 }] };
  assert.equal(S.stpText(R), '2 Disenchant\n1 Opt\n1 Mind Stone');
  assert.equal(S.stpText({ ...R, bal: false }), '1 Mind Stone\n1 Opt\n2 Disenchant');
  const o = { max: 15, tol: 5 };
  assert.equal(S.stpCtOk(19, o), true); assert.equal(S.stpCtOk(20, o), false); assert.equal(S.stpCtOk(null, o), false);
});

test('candidates : exclusions, exemplaires libres, couleurs, rôles, mécaniques (vrai coach dans une vm)', () => {
  // rangée : [nom, identité, coût, types, rôles, prix €, drapeaux, couleurs produites, rang, coût de mana, mécaniques [rôles, fournit, veut, types, force], sous-types]
  const mech = { roles: ['land', 'ramp', 'fixing', 'draw', 'tutor', 'removal', 'wipe', 'counter', 'protect', 'recursion', 'wincon', 'stax'], tags: ['tokens-creature', 'lifegain'] };
  const row = (n, ci, rb, eur, rank, pw = 3, p = [], fl = 0, ty = 0) => [n, ci, 2, ty, 0, eur, fl, '', rank, '{1}', [rb, p, [], 0, pw], ''];
  const D = { v: 1, mech, cards: [
    row('Mind Stone', '', 2, 10, 50), row('Murder', 'B', 32, 5, 900), row('Opt', 'U', 8, 3, 300), row('Forest', 'G', 1, 1, 1, 3, [], 0, 1),
    row('Banned Thing', 'R', 8, 2, 100, 3, [], 16), row('Pricey', 'W', 32, 40, 20), row('Odd Price', 'B', 8, 2, 10), row('Soul Warden', 'W', 0, 4, 2000, 3, [1]),
    row('Commit', 'U', 128, 9, 700), row('Owned Free', 'G', 2, 5, 40), row('Owned Held', 'G', 2, 6, 60),
  ] };
  const ctx = coachCtx(new URL('../src', import.meta.url).pathname, D);
  const core = require('../src/core.js');
  const px = new Map([['odd price', { e: 2, u: 5000 }], ['murder', { e: 5, u: 10 }]]);
  const free = { 'owned free': 1, 'owned held': 0 };
  Object.assign(ctx, { colorFit: core.colorFit, ownFree: k => free[k] || 0, PXT: { map: px } });
  vm.runInContext(readFileSync(new URL('../src/staples.js', import.meta.url), 'utf8'), ctx, { filename: 'staples.js' });
  const run = o => [...vm.runInContext('stpCands', ctx)({ n: 10, q: 1, max: 15, tol: 5, cols: '', cless: true, cmd: '', tags: [], roles: [], ...o }, { pop: new Map([['murder', 0.02], ['mind stone', 0.4]]), cmd: null, C: null }).map(x => x.name)];
  const all = run({});
  assert.ok(all.includes('Mind Stone') && all.includes('Murder') && all.includes('Opt') && all.includes('Owned Held'));
  for (const n of ['Forest', 'Banned Thing', 'Pricey', 'Odd Price', 'Owned Free']) assert.ok(!all.includes(n), n + ' exclue');
  assert.equal(all[0], 'Mind Stone', 'la plus jouée en tête');
  assert.ok(!run({ max: 5 }).includes('Murder'), 'prix maximum strict (< 0,05 €)');
  assert.ok(run({ max: 6 }).includes('Murder'));
  assert.deepEqual(run({ cols: 'B', cless: false }), ['Murder']);
  assert.ok(run({ cols: 'B' }).includes('Mind Stone'), 'incolores permises');
  assert.deepEqual(run({ roles: ['counter'] }), ['Commit']);
  assert.deepEqual(run({ tags: ['lifegain'] }), ['Soul Warden']);
  assert.ok(run({ q: 2 }).includes('Owned Free'), '2 voulues, 1 libre : 1 à acheter');
  const q2 = vm.runInContext('stpCands', ctx)({ n: 10, q: 2, max: 15, tol: 5, cols: 'G', cless: false, cmd: '', tags: [], roles: [] }, { pop: new Map(), cmd: null, C: null });
  assert.deepEqual([...q2].map(x => [x.name, x.need]).sort(), [['Owned Free', 1], ['Owned Held', 2]]);
});

test('analyse : poids des notes, fréquences pondérées, échantillon de commandants', () => {
  assert.ok(S.stpNoteW(95) > 0.8 && S.stpNoteW(60) < 0.15 && S.stpNoteW(0) === 0 && S.stpNoteW(150) === 1);
  const F = S.stpFreq([{ keys: ['a', 'b', 'b'], w: 3 }, { keys: ['a'], w: 1 }, { keys: ['c'], w: 0 }]);
  assert.equal(F.get('a'), 1); assert.equal(F.get('b'), 0.75, 'doublon compté une fois'); assert.equal(F.has('c'), false, 'deck sans poids ignoré');
  assert.equal(S.stpFreq([]).size, 0);
  const cmds = [];
  for (const ci of ['W', 'U', 'B', 'R', 'G']) for (let i = 0; i < 8; i++) cmds.push({ ci, rank: cmds.length + 1, decks: 100 });
  for (let i = 0; i < 4; i++) cmds.push({ ci: '', rank: cmds.length + 1, decks: 50 }, { ci: 'WU', rank: cmds.length + 2, decks: 50 }, { ci: 'WUB', rank: cmds.length + 3, decks: 50 });
  cmds.push({ ci: 'R', rank: 0, decks: 9, comm: true });
  const n1 = () => 3, sm = S.stpSample(cmds, '', 30, n1);
  assert.equal(sm.length, 10, '30 decks à 3 par commandant : 10 commandants');
  assert.ok(new Set(sm.map(c => c.ci)).size >= 7, 'à tour de rôle entre les identités');
  assert.ok(!sm.some(c => c.comm), 'decks de la communauté seuls : pas dans l\'échantillon');
  const w = S.stpSample(cmds, '', 30, n1).filter(c => c.ci === 'W'); assert.deepEqual(w.map(c => c.rank), [...w.map(c => c.rank)].sort((a, b) => a - b), 'le plus joué d\'abord');
  assert.equal(S.stpSample(cmds, '', 1e6, n1).length, cmds.length - 1, 'tout l\'index au plus');
  const red = S.stpSample(cmds, 'R', 1e6, n1);
  assert.ok(red.length && red.every(c => !c.ci || c.ci.includes('R')), 'couleurs choisies : commandants qui en partagent une (ou incolores)');
});

test('plusieurs commandants : identité de l\'un d\'eux, rangée chez celui qui la veut le plus, répartie à parts égales', () => {
  const mech = { roles: ['land', 'ramp', 'fixing', 'draw', 'tutor', 'removal', 'wipe', 'counter', 'protect', 'recursion', 'wincon', 'stax'], tags: ['tokens-creature'] };
  const row = (n, ci, eur, rank) => [n, ci, 2, 0, 0, eur, 0, '', rank, '{1}', [0, [], [], 0, 3], ''];
  const D = { v: 1, mech, cards: [row('Goblin A', 'R', 5, 100), row('Goblin B', 'R', 5, 200), row('Elf A', 'G', 5, 100), row('Rock', '', 5, 50), row('Gruul Card', 'RG', 5, 10)] };
  const ctx = coachCtx(new URL('../src', import.meta.url).pathname, D);
  Object.assign(ctx, { colorFit: require('../src/core.js').colorFit, ownFree: () => 0, PXT: null });
  vm.runInContext(readFileSync(new URL('../src/staples.js', import.meta.url), 'utf8'), ctx, { filename: 'staples.js' });
  const val = m => ({ get: k => (k in m ? { incl: m[k], syn: 0, th: 0, g: 0, cx: 0, k: 1 } : undefined) });
  const cmds = [{ slug: 'krenko', short: 'Krenko', cmd: { ci: 'R' }, C: val({ 'goblin a': 80, 'rock': 30 }), F: new Map([['goblin b', 1]]) },
    { slug: 'elf', short: 'Elf', cmd: { ci: 'G' }, C: val({ 'elf a': 80, 'rock': 60 }) }];
  const l = [...vm.runInContext('stpCands', ctx)({ n: 4, q: 1, max: 15, tol: 5, cols: '', cless: true, cmds: [], tags: [], roles: [] }, { pop: new Map(), cmds })];
  const by = Object.fromEntries(l.map(x => [x.name, x]));
  assert.ok(!by['Gruul Card'], 'RG : ni Krenko (R) ni Elf (G) ne peuvent la jouer');
  assert.equal(by['Goblin A'].g, 'krenko'); assert.equal(by['Elf A'].g, 'elf');
  assert.equal(by['Rock'].g, 'elf', 'rangée chez le commandant qui la veut le plus'); assert.deepEqual([...by['Rock'].also], ['Krenko'], 'et sert aussi Krenko');
  assert.ok(by['Goblin B'].f === 1 && by['Goblin B'].s > by['Goblin A'].s - 1, 'analyse : la carte des decks les mieux notés remonte');
  const q = S.stpQuotas(4, ['krenko', 'elf']); assert.deepEqual([q.krenko, q.elf], [2, 2]);
  const R = { bal: true, order: ['krenko', 'elf'], list: l };
  assert.deepEqual([...new Set(S.stpSorted(R).map(x => x.g))], ['krenko', 'elf'], 'liste groupée par commandant, dans l\'ordre choisi');
});

test('classer par couleur, type ou rôle : seul l\'ordre change', () => {
  const list = [{ name: 'Opt', g: 'U', ty: 16, r1: 'draw', s: 0.5, need: 1 }, { name: 'Mind Stone', g: 'C', ty: 4, r1: 'ramp', s: 0.9, need: 1 },
    { name: 'Wood Elves', g: 'G', ty: 2, r1: 'ramp', s: 0.7, need: 1 }, { name: 'Terramorphic Expanse', g: 'C', ty: 1, r1: 'fixing', s: 0.6, need: 1 }, { name: 'Intangible Virtue', g: 'W', ty: 8, r1: '', s: 0.4, need: 1 }];
  const R = { bal: true, list };
  assert.equal(S.stpTypeOf(6), 'cre', 'créature-artefact : créature'); assert.equal(S.stpTypeOf(0), 'oth');
  S.STP.o = { grp: '' };
  assert.deepEqual(S.stpSorted(R).map(x => x.g), ['W', 'U', 'G', 'C', 'C']);
  S.STP.o.grp = 'type';
  assert.deepEqual(S.stpSorted(R).map(x => x.name), ['Terramorphic Expanse', 'Wood Elves', 'Opt', 'Mind Stone', 'Intangible Virtue']);
  S.STP.o.grp = 'role';
  assert.deepEqual(S.stpSorted(R).map(x => x.name), ['Mind Stone', 'Wood Elves', 'Opt', 'Terramorphic Expanse', 'Intangible Virtue'], 'rampe (meilleur score d\'abord), pioche, fixing, sans rôle');
  assert.equal(S.stpText(R).split('\n').length, 5, 'les mêmes cartes, dans l\'ordre affiché');
  S.STP.o = null;
});

test('plusieurs commandants : parts égales même quand les scores d\'un commandant sont bien plus hauts', () => {
  const R = [];
  for (let i = 0; i < 300; i++) R.push({ k: 'a' + i, g: 'krenko', s: 3 - i * 0.001 }, { k: 'b' + i, g: 'other', s: 0.6 - i * 0.001 });
  R.sort((a, b) => b.s - a.s);
  const q = S.stpQuotas(200, ['krenko', 'other']);
  const strict = S.stpPick(R, 200, q, true).pick, loose = S.stpPick(R, 200, q).pick;
  assert.deepEqual(['krenko', 'other'].map(g => strict.filter(x => x.g === g).length), [100, 100]);
  assert.ok(loose.filter(x => x.g === 'other').length < 100, 'sans strict (couleurs) : le seuil de qualité joue');
  const few = R.filter(x => x.g === 'krenko' || +x.k.slice(1) < 30);
  assert.deepEqual(['krenko', 'other'].map(g => S.stpPick(few, 200, q, true).pick.filter(x => x.g === g).length), [170, 30], 'un commandant à court de cartes : ses places passent à l\'autre');
});
