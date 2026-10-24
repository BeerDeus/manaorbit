// Compteur de vie (src/partie.js), logique seule sous Node : formats (Commander, Standard 1 contre 1 à 20 PV sans blessures de commandant, Libre), création, places, points de vie, blessures de commandant (qui retirent les points de vie),
// compteurs, monarque / initiative, élimination et retour, tours, premier joueur, annuler (chaque action, appuis fusionnés, journal borné), propositions
// d'élimination, fin et classement, résultat, lien / QR du résultat (aller-retour, taille pour 8 joueurs, textes raccourcis, liens abîmés ou trafiqués),
// stockage de l'appareil (faux localStorage), file d'envoi et partieFlush (faux serveur), salle d'attente côté appli (places, résultat reçu), carte joueur et QR code joueur (parties sans réseau). Aucun port.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { generateKeyPairSync, sign as ecSign, randomBytes } from 'node:crypto';

const require = createRequire(import.meta.url);
const P = require('../src/partie.js');
const T0 = 1760000000000, at = s => T0 + s * 1000;
const IMG = 'https://cards.scryfall.io/normal/front/d/0/d0d33d52-3d28-4635-b985-51e126289259.jpg?1599707796';
const TK = 'A'.repeat(80);

/* Faux localStorage (ou en panne : chaque accès lève une erreur). */
function fakeLs(broken = false) {
  const m = new Map();
  return { m, getItem: k => { if (broken) throw new Error('KO'); return m.has(k) ? m.get(k) : null; }, setItem: (k, v) => { if (broken) throw new Error('KO'); m.set(k, String(v)); }, removeItem: k => { if (broken) throw new Error('KO'); m.delete(k); } };
}
/** Table de 4 : Max (moi, place 1), Léa (compte, 2), Bob (invité, 3), Zoé (invité, 4) ; commencée à T0. */
function table4() {
  let s = P.partieNew({ moi: { nom: 'Max', deck: { nom: 'Superfriends', commandant: "Atraxa, Praetors' Voice", image: IMG } }, now: T0 - 60e3, id: 'abc123def456' });
  s = P.partieAddPlace(s, { sorte: 'compte', nom: 'Léa', uid: TK, deck: { commandant: 'Edgar Markov' } });
  s = P.partieAddPlace(s, { sorte: 'invite', nom: 'Bob' });
  s = P.partieAddPlace(s, { sorte: 'invite', nom: 'Zoé', deck: { commandant: 'Tymna the Weaver + Thrasios, Triton Hero' } });
  return P.partieStart(s, { now: T0 });
}
const strip = s => { const { journal, ...rest } = s; return rest; };

test('nouvelle partie : format, place du créateur, identifiant', () => {
  const s = P.partieNew({ moi: { nom: '  Max‮ <b> ' } });
  assert.equal(s.format, 40); assert.match(s.id, /^[0-9a-z]{12}$/); assert.equal(s.places.length, 1);
  assert.deepEqual(s.places[0], { pos: 1, sorte: 'moi', nom: 'Max b', vie: 40, blessures: {}, compteurs: { poison: 0, impot: 0, energie: 0, experience: 0 }, elimine: null });
  for (const f of [20, 25, 30]) assert.equal(P.partieNew({ format: f }).places[0].vie, f);
  assert.equal(P.partieNew({ format: 37 }).format, 40, 'format inconnu : 40');
  assert.equal(P.partieNew({ moi: null }).places.length, 0, 'sans place pour le créateur');
  assert.notEqual(P.partieNew().id, P.partieNew().id);
  assert.equal(P.partieNew({ id: 'undefined0' }).id, 'undefined0'); assert.match(P.partieNew({ id: 'NOPE!' }).id, /^[0-9a-z]{12}$/);
});

test('places : ajout, place prise, 8 au plus, déplacement, retrait, format, figées une fois la partie commencée', () => {
  let s = P.partieNew({ moi: { nom: 'Max' } });
  s = P.partieAddPlace(s, { sorte: 'invite', nom: 'Bob', pos: 4 });
  s = P.partieAddPlace(s, { sorte: 'invite', nom: 'Zoé' });
  assert.deepEqual(s.places.map(p => [p.pos, p.nom]), [[1, 'Max'], [2, 'Zoé'], [4, 'Bob']], 'première place libre, triées');
  assert.equal(P.partieAddPlace(s, { nom: 'X', pos: 4 }), s, 'place prise : refusé (même objet)');
  assert.equal(P.partieAddPlace(s, { nom: 'X', pos: 9 }), s);
  assert.equal(P.partieAddPlace(s, { sorte: 'moi', nom: 'Moi2' }), s, 'un seul « moi »');
  const c = P.partieAddPlace(s, { sorte: 'compte', nom: 'Léa', uid: 'court' }); assert.equal(c.places[2].uid, undefined, 'jeton mal formé : ignoré');
  assert.equal(P.partieAddPlace(s, { sorte: 'compte', nom: 'Léa', uid: TK }).places[2].uid, TK);
  assert.equal(P.partieAddPlace(s, { sorte: 'invite', nom: 'Img', deck: { image: 'https://evil.example/x.jpg' } }).places[2].deck, undefined, 'image hors Scryfall : refusée');
  let full = s; for (let i = 0; i < 10; i++) full = P.partieAddPlace(full, { nom: 'J' + i });
  assert.equal(full.places.length, 8); assert.deepEqual(full.places.map(p => p.pos), [1, 2, 3, 4, 5, 6, 7, 8]);
  s = P.partieMovePlace(s, 4, 6); assert.deepEqual(s.places.map(p => p.pos), [1, 2, 6], 'vers une place libre');
  s = P.partieMovePlace(s, 1, 2); assert.deepEqual(s.places.map(p => [p.pos, p.nom]), [[1, 'Zoé'], [2, 'Max'], [6, 'Bob']], 'échange');
  s = P.partieRemovePlace(s, 6); assert.equal(s.places.length, 2);
  s = P.partieSetFormat(s, 25); assert.deepEqual(s.places.map(p => p.vie), [25, 25]); assert.equal(P.partieSetFormat(s, 22), s);
  s = P.partieSetPlace(s, 2, { nom: 'Maxime', deck: { nom: 'Elfes', commandant: 'Lathril, Blade of the Elves' } });
  assert.deepEqual(s.places[1].deck, { nom: 'Elfes', commandant: 'Lathril, Blade of the Elves' });
  const g = P.partieStart(s, { now: T0 });
  assert.equal(P.partieAddPlace(g, { nom: 'Tard' }), g); assert.equal(P.partieRemovePlace(g, 1), g); assert.equal(P.partieMovePlace(g, 1, 5), g); assert.equal(P.partieSetFormat(g, 40), g);
  assert.equal(P.partieSetPlace(g, 1, { nom: 'Zoe' }).places[0].nom, 'Zoe', 'une coquille se corrige en cours de partie');
});

test('points de vie : ±n, appuis rapprochés fusionnés en une entrée, bornes', () => {
  let s = table4();
  s = P.partieLife(s, 2, -1, { now: at(1) }); s = P.partieLife(s, 2, -1, { now: at(2) }); s = P.partieLife(s, 2, -3, { now: at(4) });
  assert.equal(s.places[1].vie, 35); assert.equal(s.journal.length, 2, 'début + une entrée fusionnée'); assert.equal(s.journal[1].n, -5);
  s = P.partieLife(s, 2, +2, { now: at(10) }); assert.equal(s.journal.length, 3, 'plus de 2,5 s après : entrée à part');
  s = P.partieLife(s, 2, -2, { now: at(11) }); assert.equal(s.journal.length, 2, '+2 puis -2 aussitôt : plus rien à annuler pour ces appuis'); assert.equal(s.places[1].vie, 35);
  s = P.partieLife(s, 3, -1, { now: at(12) }); s = P.partieLife(s, 2, -1, { now: at(12) }); assert.equal(s.journal.length, 4, 'autre place : pas de fusion');
  s = P.partieLife(s, 2, -1, { now: at(13), merge: false }); assert.equal(s.journal.length, 5);
  assert.equal(P.partieLife(s, 9, -1), s); assert.equal(P.partieLife(s, 2, 0), s); assert.equal(P.partieLife(s, 2, 'abc'), s);
  assert.equal(P.partieLife(s, 2, -5000).places[1].vie, -999, 'bornée');
});

test('blessures de commandant : par source, retirent les points de vie, corrigibles, 2e commandant à part', () => {
  let s = table4();
  s = P.partieCmdDamage(s, 2, 1, 7, { now: at(1) });
  assert.equal(s.places[1].vie, 33); assert.deepEqual(s.places[1].blessures, { 1: 7 });
  s = P.partieCmdDamage(s, 2, 4, 3, { now: at(10) }); s = P.partieCmdDamage(s, 2, 4, 2, { now: at(20), second: true });
  assert.deepEqual(s.places[1].blessures, { 1: 7, 4: 3, '4b': 2 }); assert.equal(s.places[1].vie, 28);
  s = P.partieCmdDamage(s, 2, 1, -10, { now: at(30) });
  assert.deepEqual(s.places[1].blessures, { 4: 3, '4b': 2 }, 'correction : jamais sous 0'); assert.equal(s.places[1].vie, 35, 'seulement les 7 réellement retirés reviennent');
  assert.equal(P.partieCmdDamage(s, 2, 7, 1), s, 'source inconnue'); assert.equal(P.partieCmdDamage(s, 2, 1, -1), s, 'rien à corriger');
  s = P.partieCmdDamage(s, 3, 1, 20, { now: at(40) }); assert.deepEqual(P.partieProposals(s), []);
  s = P.partieCmdDamage(s, 3, 1, 1, { now: at(41) }); assert.equal(s.journal.at(-1).n, 21, 'appuis fusionnés');
  assert.deepEqual(P.partieProposals(s), [{ pos: 3, cause: 'commandant', par: 1 }], '21 blessures du même commandant : proposition');
  assert.equal(s.places[2].elimine, null, 'jamais d\'élimination automatique');
});

test('compteurs : poison, impôt, énergie, expérience, libres ; jamais sous 0', () => {
  let s = table4();
  s = P.partieCounter(s, 3, 'poison', 4, { now: at(1) }); s = P.partieCounter(s, 3, 'impot', 2, { now: at(10) }); s = P.partieCounter(s, 3, 'energie', 5, { now: at(20) });
  s = P.partieCounter(s, 3, 'experience', 1, { now: at(30) }); s = P.partieCounter(s, 3, 'Radiation', 3, { now: at(40) });
  assert.deepEqual(s.places[2].compteurs, { poison: 4, impot: 2, energie: 5, experience: 1, Radiation: 3 });
  s = P.partieCounter(s, 3, 'energie', -9, { now: at(50) }); assert.equal(s.places[2].compteurs.energie, 0);
  assert.equal(P.partieCounter(s, 3, '__proto__', 1), s); assert.equal(P.partieCounter(s, 3, '', 1), s);
  let f = s; for (let i = 0; i < 12; i++) f = P.partieCounter(f, 1, 'libre' + i, 1, { now: at(100 + i * 10) });
  assert.equal(Object.keys(f.places[0].compteurs).length, 4 + 8, '8 compteurs libres au plus');
  s = P.partieCounter(s, 3, 'poison', 6, { now: at(60) }); assert.deepEqual(P.partieProposals(s), [{ pos: 3, cause: 'poison' }]);
});

test('monarque et initiative : une seule place à la fois, transmis à l\'élimination', () => {
  let s = table4();
  s = P.partieMonarch(s, 2); s = P.partieInitiative(s, 3);
  assert.deepEqual([s.monarque, s.initiative], [2, 3]);
  s = P.partieMonarch(s, 4); assert.equal(s.monarque, 4, 'volé : une seule place');
  assert.equal(P.partieMonarch(s, 4), s); assert.equal(P.partieMonarch(s, 0).monarque, 0); assert.equal(P.partieMark(s, 'roi', 1), s);
  s = P.partieEliminate(s, 4, 'vie'); assert.equal(s.monarque, 1, 'le monarque éliminé : le joueur actif le devient');
  s = P.partieNextTurn(s); assert.equal(s.actif, 2);
  s = P.partieEliminate(s, 3, 'abandon'); assert.equal(s.initiative, 2, 'initiative : au joueur actif');
  s = P.partieMonarch(s, 2); s = P.partieEliminate(s, 2, 'poison'); assert.equal(s.monarque, 1, 'éliminé pendant son tour : le suivant en jeu');
  assert.equal(P.partieMonarch(s, 3), s, 'jamais à une place éliminée');
});

test('élimination, retour, propositions (points de vie ≤ 0)', () => {
  let s = table4();
  s = P.partieLife(s, 4, -40); assert.deepEqual(P.partieProposals(s), [{ pos: 4, cause: 'vie' }]);
  s = P.partieEliminate(s, 4, 'vie', { par: 2 }); assert.deepEqual(s.places[3].elimine, { tour: 1, cause: 'vie', n: 1, par: 2 });
  assert.deepEqual(P.partieProposals(s), [], 'place éliminée : plus proposée');
  assert.equal(P.partieEliminate(s, 4, 'vie'), s, 'déjà éliminée');
  assert.equal(P.partieEliminate(table4(), 2, 'n\'importe').places[1].elimine.cause, 'autre');
  s = P.partieRevive(s, 4); assert.equal(s.places[3].elimine, null); assert.equal(P.partieRevive(s, 4), s);
});

test('tours : ordre de la table, places éliminées sautées, tour de table, premier joueur au hasard', () => {
  let s = P.partieNew({ moi: { nom: 'A' }, now: T0 });
  for (const n of ['B', 'C', 'D']) s = P.partieAddPlace(s, { nom: n });
  s = P.partieFirst(s, null, { rnd: () => 0.6 }); assert.equal(s.premier, 3, 'tiré au hasard (générateur fourni)'); assert.equal(s.actif, 0);
  s = P.partieNextTurn(s, { now: at(1) }); assert.deepEqual([s.debut, s.tour, s.actif], [at(1), 1, 3], 'tour suivant sans début : la partie commence');
  const seq = []; for (let i = 0; i < 5; i++) { s = P.partieNextTurn(s); seq.push([s.actif, s.tour]); }
  assert.deepEqual(seq, [[4, 1], [1, 1], [2, 1], [3, 2], [4, 2]]);
  s = P.partieEliminate(s, 1, 'vie'); s = P.partieNextTurn(s); s = P.partieNextTurn(s); assert.deepEqual([s.actif, s.tour], [3, 3], 'place 1 sautée');
  let r = table4(); r = P.partieFirst(r, 3); assert.deepEqual([r.premier, r.actif], [3, 3], 'au début du premier tour : il commence');
  r = P.partieNextTurn(r); r = P.partieFirst(r, 1); assert.deepEqual([r.premier, r.actif], [1, 4], 'plus tard : le premier joueur change, pas le joueur actif');
  assert.equal(P.partieFirst(r, 9), r);
  let one = P.partieEliminate(P.partieEliminate(P.partieEliminate(table4(), 2, 'vie'), 3, 'vie'), 4, 'vie');
  one = P.partieNextTurn(one); assert.deepEqual([one.actif, one.tour], [1, 2], 'seul en jeu : il rejoue, tour suivant');
});

test('annuler : chaque action revient à l\'état d\'avant, jusqu\'au début', () => {
  const s0 = P.partieNew({ moi: { nom: 'A' }, now: T0, id: 'undo0000test' });
  let s = P.partieAddPlace(P.partieAddPlace(s0, { nom: 'B' }), { nom: 'C', sorte: 'compte', uid: TK });
  const base = s, states = [s];
  const acts = [x => P.partieFirst(x, 2), x => P.partieStart(x, { now: at(1) }), x => P.partieLife(x, 1, -4, { now: at(2) }), x => P.partieCmdDamage(x, 3, 2, 6, { now: at(10), second: true }),
    x => P.partieCounter(x, 2, 'poison', 3, { now: at(20) }), x => P.partieMonarch(x, 3), x => P.partieInitiative(x, 1), x => P.partieNextTurn(x), x => P.partieEliminate(x, 3, 'commandant', { par: 2 }),
    x => P.partieRevive(x, 3), x => P.partieEliminate(x, 1, 'vie'), x => P.partieNextTurn(x), x => P.partieEnd(x, [2], { now: at(3600) }), x => P.partieSetRanks(x, [2, 3, 1])];
  for (const f of acts) { const n = f(s); assert.notEqual(n, s, 'action appliquée : ' + f); s = n; states.push(s); }
  for (let i = states.length - 1; i > 0; i--) { s = P.partieUndo(s); assert.deepEqual(strip(s), strip(states[i - 1]), 'annuler l\'action ' + i); }
  assert.deepEqual(s, base); assert.equal(P.partieUndo(s), s, 'plus rien à annuler');
  let big = P.partieStart(P.partieNew({ moi: { nom: 'A' } }), { now: T0 });
  for (let i = 0; i < P.PRT_LOG_MAX + 200; i++) big = P.partieLife(big, 1, i % 2 ? 1 : -1, { merge: false, now: at(i) });
  assert.equal(big.journal.length, P.PRT_LOG_MAX, 'journal borné (les plus anciennes entrées partent)');
});

test('fin : vainqueurs, aucun, dernier en jeu, classement déduit de l\'ordre d\'élimination, corrigé à la main, annuler', () => {
  let s = table4();
  s = P.partieEliminate(s, 3, 'vie', { now: at(100) }); s = P.partieEliminate(s, 2, 'poison', { now: at(200) }); s = P.partieEliminate(s, 4, 'commandant', { now: at(300) });
  let e = P.partieEnd(s, undefined, { now: at(3600) });
  assert.deepEqual(e.vainqueurs, [1], 'dernier en jeu : vainqueur'); assert.deepEqual(P.partieRanks(e), { 1: 1, 4: 2, 2: 3, 3: 4 }, 'éliminés : le dernier sorti est 2e');
  assert.equal(P.partieLife(e, 1, -1), e, 'partie finie : plus d\'action de jeu'); assert.deepEqual(P.partieProposals(e), []);
  const draw = P.partieEnd(P.partieEliminate(table4(), 2, 'vie'), [], { now: at(60) });
  assert.deepEqual(draw.vainqueurs, []); assert.deepEqual(P.partieRanks(draw), { 1: 1, 3: 1, 4: 1, 2: 4 }, 'aucun vainqueur : ceux encore en jeu ex aequo');
  const two = P.partieEnd(table4(), [3, 1, 3, 9]); assert.deepEqual(two.vainqueurs, [1, 3]); assert.deepEqual(P.partieRanks(two), { 1: 1, 3: 1, 2: 3, 4: 3 });
  const m = P.partieSetRanks(e, [1, 3, 4, 2]); assert.deepEqual(P.partieRanks(m), { 1: 1, 3: 2, 4: 3, 2: 4 }, 'ordre corrigé');
  assert.deepEqual(P.partieRanks(P.partieSetRanks(e, { 1: 1, 2: 2, 3: 2, 4: 4 })), { 1: 1, 2: 2, 3: 2, 4: 4 });
  assert.equal(P.partieSetRanks(e, [1, 2]), e, 'classement incomplet : refusé'); assert.equal(P.partieSetRanks(e, { 1: 1, 2: 9, 3: 2, 4: 3 }), e);
  assert.equal(P.partieSetRanks(s, [1, 2, 3, 4]), s, 'partie pas finie');
  assert.equal(P.partieRanks(P.partieSetRanks(m, null))[4], 2, 'null : classement déduit');
  const re = P.partieEnd(m, [4]); assert.deepEqual(re.vainqueurs, [4]); assert.equal(re.rangs, null, 'vainqueurs corrigés : classement manuel remis à zéro'); assert.equal(re.fin, e.fin);
  const back = P.partieUndo(e); assert.equal(back.fin, 0); assert.equal(back.vainqueurs, null); assert.notEqual(P.partieLife(back, 1, -1), back, 'annuler la fin : la partie reprend');
});

test('résultat compact et relecture (partieResClean)', () => {
  let s = table4(); s = P.partieNextTurn(s); s = P.partieNextTurn(s); s = P.partieNextTurn(s); s = P.partieNextTurn(s);
  s = P.partieEliminate(s, 3, 'vie'); s = P.partieEnd(s, [2], { now: at(5400) });
  const r = P.partieResult(s);
  assert.deepEqual(r, { id: 'abc123def456', date: T0, duree: 5400, tours: 2, format: 40, places: [
    { pos: 1, nom: 'Max', sorte: 'moi', commandant: "Atraxa, Praetors' Voice", deck: 'Superfriends', image: IMG, rang: 2, vainqueur: false },
    { pos: 2, nom: 'Léa', sorte: 'compte', uid: TK, commandant: 'Edgar Markov', rang: 1, vainqueur: true },
    { pos: 3, nom: 'Bob', sorte: 'invite', rang: 4, vainqueur: false },
    { pos: 4, nom: 'Zoé', sorte: 'invite', commandant: 'Tymna the Weaver + Thrasios, Triton Hero', rang: 2, vainqueur: false }] });
  assert.equal(P.partieResClean(r).places[1].uid, undefined, 'jetons retirés par défaut'); assert.equal(P.partieResClean(r, { tickets: true }).places[1].uid, TK);
  assert.equal(P.partieResult(P.partieNew({ moi: { nom: 'A' }, now: T0 }), { now: T0 + 90e3 }).duree, 90, 'pas finie : durée jusqu\'à maintenant');
  const bad = [null, {}, { ...r, id: 'X' }, { ...r, format: 33 }, { ...r, date: 12 }, { ...r, places: [] }, { ...r, places: [...r.places, ...r.places, ...r.places] },
    { ...r, places: [r.places[0], { ...r.places[1], pos: 1 }] }, { ...r, places: [r.places[0], { ...r.places[1], sorte: 'moi' }] }, { ...r, places: [{ ...r.places[0], rang: 0 }] }, { ...r, tours: -1 }];
  for (const b of bad) assert.equal(P.partieResClean(b), null, JSON.stringify(b).slice(0, 80));
  const odd = P.partieResClean({ ...r, places: [{ ...r.places[0], nom: 'x'.repeat(99), image: 'javascript:alert(1)', sorte: 'roi', vainqueur: 'oui' }] });
  assert.deepEqual([odd.places[0].nom.length, odd.places[0].image, odd.places[0].sorte, odd.places[0].vainqueur], [24, undefined, 'invite', false]);
});

test('lien du résultat : aller-retour, jamais de jeton ni d\'image, moins de 900 caractères pour 8 joueurs, textes raccourcis proprement', () => {
  const s = P.partieEnd(table4(), [1], { now: at(3000) }), r = P.partieResult(s), link = P.partieResultLink(r);
  assert.match(link, /^https:\/\/manaorbit\.app\/\?partie=[A-Za-z0-9_-]+$/);
  assert.ok(!link.includes(TK.slice(0, 20)) && !Buffer.from(link.split('=')[1], 'base64url').toString().includes('scryfall'), 'ni jeton ni image dans le lien');
  const back = P.decodeResult(link), want = P.partieResClean(r); for (const p of want.places) delete p.image;
  assert.deepEqual(back, want, 'aller-retour sans perte');
  assert.deepEqual(P.decodeResult(link.split('=')[1]), back, 'données seules'); assert.deepEqual(P.decodeResult('  ' + link + '  '), back);
  assert.deepEqual(P.decodeResult('https://manaorbit.app/?utm=x&partie=' + link.split('=')[1] + '#bas'), back);
  const cmds = ["Atraxa, Praetors' Voice", 'Kenrith, the Returned King', "Yuriko, the Tiger's Shadow", 'The Ur-Dragon', 'Edgar Markov', 'Tymna the Weaver + Thrasios, Triton Hero', 'Kinnan, Bonder Prodigy', 'Miirym, Sentinel Wyrm'];
  const noms = ['Maximilien', 'Léa-Charlotte', 'Bob', 'Zoé', 'Jean-Baptiste', 'Anne-Sophie', 'Grégoire', 'Éloïse'];
  let e = P.partieNew({ moi: { nom: noms[0], deck: { nom: 'Superfriends contrôle', commandant: cmds[0], image: IMG } }, now: T0 });
  for (let i = 1; i < 8; i++) e = P.partieAddPlace(e, { sorte: i % 2 ? 'compte' : 'invite', nom: noms[i], uid: TK, deck: { nom: 'Deck numéro ' + i + ' tribal', commandant: cmds[i], image: IMG } });
  e = P.partieStart(e, { now: T0 }); for (let i = 2; i <= 8; i++) e = P.partieEliminate(e, i, 'vie'); e = P.partieEnd(e, undefined, { now: at(7200) });
  const l8 = P.partieResultLink(P.partieResult(e)), d8 = P.decodeResult(l8);
  assert.ok(l8.length < 900, '8 joueurs avec noms, commandants et decks : ' + l8.length + ' caractères');
  assert.deepEqual(d8.places.map(p => [p.nom, p.commandant, p.rang]), noms.map((n, i) => [n, cmds[i], i ? 9 - i : 1]), 'tout tient sans rien couper');
  let w = P.partieNew({ moi: { nom: 'É'.repeat(24), deck: { nom: 'D'.repeat(40), commandant: 'C'.repeat(80) } }, now: T0 });
  for (let i = 1; i < 8; i++) w = P.partieAddPlace(w, { sorte: 'invite', nom: '名前'.repeat(12), deck: { nom: 'd'.repeat(40), commandant: 'Kenrith, the Returned King ' + 'x'.repeat(50) } });
  const lw = P.partieResultLink(P.partieResult(P.partieEnd(w, [1], { now: at(60) }))), dw = P.decodeResult(lw);
  assert.ok(lw.length <= 900, 'textes au maximum : raccourcis jusqu\'à tenir (' + lw.length + ')');
  assert.equal(dw.places.length, 8); assert.ok(dw.places[1].nom.endsWith('…'), 'coupé avec « … »'); assert.ok(!dw.places[1].commandant || dw.places[1].commandant.startsWith('Kenrith'), 'commandant : le début de son nom');
  assert.equal(P.encodeResult({ nope: 1 }), '', 'résultat illisible : rien');
});

test('lien abîmé, tronqué, trafiqué, d\'une autre version : refusé proprement', () => {
  const r = P.partieResult(P.partieEnd(table4(), [2], { now: at(500) })), d = P.encodeResult(r);
  const json = JSON.parse(Buffer.from(d, 'base64url').toString());
  const enc = a => Buffer.from(JSON.stringify(a)).toString('base64url');
  const resign = a => { const b = a.slice(0, -1); return enc([...b, P.partieCk(JSON.stringify(b))]); };
  const forged = json.slice(); forged[6] = forged[6].map(p => (p[0] === 3 ? [3, p[1], p[2], p[3], p[4], 1, 1] : p));
  const cases = { vide: '', court: d.slice(0, 15), tronqué: d.slice(0, -6), 'un caractère changé': d.slice(0, 30) + (d[30] === 'A' ? 'B' : 'A') + d.slice(31), 'pas du base64': d.replace(/^./, '*'),
    'somme fausse': enc(forged), 'autre version': resign([2, ...json.slice(1)]), 'pas un tableau': enc({ a: 1 }), 'json cassé': Buffer.from('[1,"abc').toString('base64url'), 'trop long': 'A'.repeat(9000),
    'place en double': resign([...json.slice(0, 6), [json[6][0], json[6][0]], 'x']), 'sorte inconnue': resign([...json.slice(0, 6), [[1, 'A', 7, '', '', 1, 1]], 'x']), 'utf-8 invalide': Buffer.from([0x5b, 0xff, 0xfe, 0x5d]).toString('base64url') + 'AAAAAAAAAAAAAAAAAAAAAAAA',
    'adresse sans données': 'https://manaorbit.app/?partie=', nombre: 42, objet: {} };
  for (const [k, v] of Object.entries(cases)) assert.equal(P.decodeResult(v), null, k);
  assert.ok(P.decodeResult(resign(forged)), 'resigné : lisible (une somme simple ne protège pas d\'un faussaire, seulement des liens abîmés)');
  assert.deepEqual(P.partieParseUrl('https://manaorbit.app/?table=abc-234'), { table: 'ABC234' }); assert.equal(P.partieParseUrl('https://manaorbit.app/?table=ABC10I'), null, 'symboles exclus du code');
  assert.deepEqual(P.partieParseUrl(P.partieResultLink(r)).partie.id, r.id); assert.deepEqual(P.partieParseUrl('https://manaorbit.app/?partie=abime'), { bad: true });
  assert.equal(P.partieParseUrl('https://manaorbit.app/?troc=ABC234'), null); assert.equal(P.partieTableLink('ABC234'), 'https://manaorbit.app/?table=ABC234'); assert.equal(P.partieTableLink('nope'), '');
});

test('partie laissée de côté : 12 h en préparation, 48 h commencée, dernière sauvegarde comptée ; jamais une partie finie', () => {
  const H = 3600e3, prep = P.partieNew({ moi: { nom: 'Max' }, now: T0, id: 'prep00000001' });
  assert.equal(P.partieStale(prep, 0, T0 + 11 * H), false); assert.equal(P.partieStale(prep, 0, T0 + 13 * H), true);
  assert.equal(P.partieStale(prep, T0 + 10 * H, T0 + 13 * H), false, 'modifiée il y a 3 h : gardée');
  const g = P.partieLife(table4(), 2, -3, { now: at(60) });
  assert.equal(P.partieStale(g, 0, at(60) + 47 * H), false); assert.equal(P.partieStale(g, 0, at(60) + 49 * H), true);
  assert.equal(P.partieStale(P.partieEnd(g, [1], { now: at(90) }), 0, at(90) + 400 * H), false); assert.equal(P.partieStale(null, 0), false);
  globalThis.localStorage = fakeLs(); assert.equal(P.partieSavedAt(), 0);
  const t = Date.now(); P.partieSave(prep); assert.ok(P.partieSavedAt() >= t); P.partieClear(); assert.equal(P.partieSavedAt(), 0, 'effacée avec la partie');
});

test('stockage de l\'appareil : partie en cours, historique (200 au plus, sans doublon), relecture prudente, stockage en panne', () => {
  globalThis.localStorage = fakeLs();
  const s = P.partieLife(table4(), 2, -3, { now: at(5) });
  assert.ok(P.partieSave(s)); assert.deepEqual(P.partieLoad(), s); P.partieClear(); assert.equal(P.partieLoad(), null);
  localStorage.setItem(P.PRT_CUR, '{pas du json'); assert.equal(P.partieLoad(), null);
  localStorage.setItem(P.PRT_CUR, JSON.stringify({ ...s, places: [{ ...s.places[0], vie: 'x', blessures: { 9: 4, __proto__: 1, '2b': 3 }, compteurs: { poison: -4, constructor: 2 } }] }));
  const c = P.partieLoad(); assert.equal(c.places[0].vie, 40); assert.deepEqual(c.places[0].blessures, { '2b': 3 }); assert.deepEqual(c.places[0].compteurs, { poison: 0, impot: 0, energie: 0, experience: 0 });
  const r = P.partieResult(P.partieEnd(table4(), [1], { now: at(100) }));
  for (let i = 0; i < 205; i++) P.partieHistAdd({ ...r, id: 'hist' + String(i).padStart(8, '0'), date: T0 + i * 1000, moi: 1, src: 'h' });
  const h = P.partieHist(); assert.equal(h.length, 200); assert.equal(h[0].id, 'hist00000204', 'la plus récente d\'abord');
  P.partieHistAdd({ ...r, id: 'hist00000204', moi: 2, src: 'q', sv: 1 }); assert.equal(P.partieHist().length, 200, 'même partie : une seule entrée');
  assert.deepEqual([P.partieHist()[0].moi, P.partieHist()[0].src, P.partieHist()[0].sv], [1, 'h', 1], 'gardée, marquée envoyée');
  assert.ok(P.partieHistDrop('hist00000204')); assert.equal(P.partieHist().length, 199);
  assert.equal(P.partieHist()[0].places[1].uid, undefined, 'aucun jeton dans l\'historique');
  globalThis.localStorage = fakeLs(true);
  assert.equal(P.partieSave(s), false); assert.equal(P.partieLoad(), null); assert.deepEqual(P.partieHist(), []); assert.equal(P.partieHistAdd({ ...r, moi: 1 }), false);
  delete globalThis.localStorage;
  assert.equal(P.partieLoad(), null, 'sans localStorage du tout : rien ne casse');
});

/* Faux serveur pour partieFlush : réponses par route, journal des appels. */
function fakeServer(plan = {}) {
  const calls = [];
  const fetch = async (url, init) => {
    const path = url.replace(/^.*api\/partie/, ''), body = init.body ? JSON.parse(init.body) : null; calls.push({ path, body, h: init.headers });
    const f = plan[path]; const x = typeof f === 'function' ? f(body, init, calls) : f || [200, { ok: true }];
    if (x === 'net') throw new TypeError('Failed to fetch');
    return { ok: x[0] < 300, status: x[0], json: async () => x[1] };
  };
  return { fetch, calls };
}
const user = (uid, tok = 'tok-' + uid) => ({ uid, n: 0, async getIdToken(force) { this.n++; return force ? tok + '-neuf' : tok; } });

test('fin et envoi : historique + file, partieFlush (hors ligne, serveur muet, déconnecté, succès, panne, refus, autre compte, jeton renouvelé)', async () => {
  globalThis.localStorage = fakeLs();
  const st = P.partieEnd(table4(), [1], { now: at(900) });
  P.partieSave(st);
  const r = P.partieDone(st, { flush: false, user: null });
  assert.equal(r.id, st.id); assert.equal(P.partieLoad(), null, 'partie en cours effacée'); assert.equal(P.partieHist()[0].sv, 0); assert.equal(P.partieQueue().length, 1);
  assert.equal(P.partieQueue()[0].r.places[1].uid, TK, 'la file garde les jetons (pour le serveur)'); assert.equal(P.partieQueue()[0].u, '', 'fini hors connexion : le prochain compte connecté l\'envoie');
  assert.equal(P.partieDone(table4()), null, 'pas finie : rien');
  let S = fakeServer();
  assert.deepEqual(await P.partieFlush({ fetch: S.fetch, user: user('u1'), online: false, on: true }), { sent: 0, left: 1, skip: 'offline' });
  assert.deepEqual(await P.partieFlush({ fetch: S.fetch, user: user('u1'), online: true, on: false }), { sent: 0, left: 1, skip: 'server' });
  assert.deepEqual(await P.partieFlush({ fetch: S.fetch, user: null, online: true, on: true }), { sent: 0, left: 1, skip: 'login' });
  assert.equal(S.calls.length, 0, 'rien n\'est parti');
  S = fakeServer({ '/result': 'net' });
  assert.deepEqual(await P.partieFlush({ fetch: S.fetch, user: user('u1'), online: true, on: true }), { sent: 0, left: 1, skip: 'net' }); assert.equal(P.partieQueue()[0].n, 1, 'panne : gardé, essai compté');
  S = fakeServer({ '/result': [503, { error: 'unavailable' }] });
  assert.equal((await P.partieFlush({ fetch: S.fetch, user: user('u1'), online: true, on: true })).skip, 'unavailable'); assert.equal(P.partieQueue().length, 1);
  S = fakeServer({ '/result': (b, init, calls) => (calls.length === 1 ? [401, { error: 'token_expired' }] : [200, { ok: true, n: 2 }]) });
  const u1 = user('u1');
  assert.deepEqual(await P.partieFlush({ fetch: S.fetch, user: u1, online: true, on: true }), { sent: 1, left: 0, skip: '' });
  assert.deepEqual(S.calls.map(c => c.h['x-firebase-token']), ['tok-u1', 'tok-u1-neuf'], 'jeton expiré : renouvelé une fois');
  assert.equal(S.calls[1].body.r.places[1].uid, TK); assert.equal(P.partieQueue().length, 0); assert.deepEqual([P.partieHist()[0].sv, P.partieHist()[0].u], [1, 'u1']);
  // réclamation (QR code) d'un autre compte, refus définitif, envoi d'un autre compte qui attend
  const other = P.decodeResult(P.partieResultLink(P.partieResult(P.partieEnd(P.partieNew({ moi: { nom: 'Ana' }, id: 'otherg000001', now: T0 }), [1], { now: at(50) }))));
  assert.equal(P.partieClaim(other, 5, { flush: false }), false, 'place inconnue');
  assert.ok(P.partieClaim(other, 1, { flush: false, user: user('u2') })); assert.equal(P.partieHist().find(x => x.id === other.id).src, 'q');
  P.partieEnqueue({ k: 'claim', id: 'badbad000001', r: { ...other, id: 'badbad000001' }, pos: 1, u: 'u2' });
  P.partieEnqueue({ k: 'claim', id: 'later0000001', r: { ...other, id: 'later0000001' }, pos: 1, u: 'u3' });
  S = fakeServer({ '/claim': b => (b.r.id === 'badbad000001' ? [400, { error: 'bad_result' }] : [200, { ok: true }]) });
  assert.deepEqual(await P.partieFlush({ fetch: S.fetch, user: user('u2'), online: true, on: true }), { sent: 1, left: 1, skip: '' });
  assert.deepEqual(S.calls.map(c => [c.path, c.body.r.id, c.body.pos]), [['/claim', other.id, 1], ['/claim', 'badbad000001', 1]], 'celui de u3 attend sa connexion');
  assert.equal(P.partieQueue().find(x => x.id === 'badbad000001').err, 'bad_result', 'refus définitif : gardé, plus renvoyé');
  S = fakeServer(); await P.partieFlush({ fetch: S.fetch, user: user('u2'), online: true, on: true }); assert.equal(S.calls.length, 0);
  S = fakeServer(); assert.equal((await P.partieFlush({ fetch: S.fetch, user: user('u3'), online: true, on: true })).sent, 1);
  const [a, b] = [P.partieFlush({ fetch: S.fetch, user: user('u3'), online: true, on: true }), P.partieFlush({ fetch: S.fetch, user: user('u3'), online: true, on: true })]; assert.equal(a, b, 'un seul envoi à la fois'); await a;
  delete globalThis.localStorage;
});

test('relecture prudente : compteur nommé comme une propriété d\'objet, journal abîmé, partie corrigée par le créateur', () => {
  globalThis.localStorage = fakeLs();
  let s = P.partieCounter(table4(), 1, 'toString', 2, { now: at(1) }); assert.equal(s.places[0].compteurs.toString, 2, 'compteur libre « toString » : un nombre, pas une fonction');
  s = P.partieUndo(s); assert.equal(s.places[0].compteurs.toString, 0);
  const ok = P.partieLife(table4(), 2, -3, { now: at(5) });
  P.partieSave({ ...ok, journal: [...ok.journal, { a: 'v', p: 2, t: 9 }, { a: 'b', p: 2, n: 1, s: '../x', t: 9 }, { a: 'zz', t: 9 }, null, { a: 'x', w: [0], t: 9 }] });
  const back = P.partieLoad(); assert.deepEqual(back.journal, ok.journal, 'entrées incomplètes écartées');
  let u = back; while (u.journal.length) u = P.partieUndo(u); assert.equal(u.places[1].vie, 40, 'tout s\'annule sans NaN');
  const done = P.partieEnd(table4(), [1], { now: at(100) }); P.partieDone(done, { flush: false, user: null });
  const fix = P.partieSetRanks(done, [1, 3, 2, 4]); P.partieHistAdd({ ...P.partieResult(fix), moi: 1, src: 'h', at: Date.now(), sv: 0 });
  assert.equal(P.partieHist().find(x => x.id === done.id).places.find(p => p.pos === 3).rang, 2, 'le créateur corrige : l\'historique suit');
  delete globalThis.localStorage;
});

test('salle d\'attente côté appli : création, entrée en invité, actions, suivi (relevé court, présences, résultat reçu)', async () => {
  globalThis.localStorage = fakeLs();
  const V = (o = {}) => ({ c: 'ABC234', v: 1, st: 'wait', why: '', id: 'room00000009', format: 40, size: 8, at: T0, me: 2, host: false, places: [{ pos: 1, n: 'Max', k: 'compte', h: 1, dev: 1, on: 1 }, { pos: 2, n: 'Zoé', k: 'invite', dev: 1, on: 1 }], ...o });
  let polls = 0, g5 = P.partieNew({ moi: { nom: 'Max' }, id: 'room00000009', now: T0 });
  for (const n of ['A', 'B', 'C', 'Zoé']) g5 = P.partieAddPlace(g5, { nom: n });
  const res5 = P.partieResClean(P.partieResult(P.partieEnd(g5, [1], { now: at(60) })));
  const S = fakeServer({ '/join': [200, { key: 'K'.repeat(24), s: V() }], '/op': b => [200, b.op === 'seat' ? V({ v: 2, me: b.pos }) : V()],
    '/s?c=ABC234&v=0': () => { polls++; return [200, V()]; }, '/s?c=ABC234&v=1': () => { polls++; return polls === 2 ? [200, { v: 1, same: 1, on: [1] }] : [200, V({ v: 3, st: 'done', me: 5, res: res5 })]; } });
  const env = { fetch: S.fetch, user: user('u9') };
  const s1 = await P.partieRoomJoin('ABC234', { ...env, guest: true, n: 'Zoé' });
  assert.equal(s1.me, 2); assert.equal(S.calls[0].h['x-firebase-token'], undefined, 'invité : sans jeton, même connecté'); assert.deepEqual(P.partieRoom(), { c: 'ABC234', key: 'K'.repeat(24), id: 'room00000009', pos: 2, host: false, guest: true, u: '' });
  const s2 = await P.partieRoomOp('seat', { pos: 5 }, env); assert.equal(s2.me, 5); assert.equal(P.partieRoom().pos, 5); assert.equal(S.calls[1].h['x-partie-key'], 'K'.repeat(24));
  const seen = [];
  await new Promise(res => { P.partieRoomWatch((v, info) => { seen.push([v && v.st, info.on.join(','), info.net]); if (v && v.st === 'done') res(); }, env); });
  assert.deepEqual(seen, [['wait', '1,2', true], ['wait', '1', true], ['done', '1,2', true]], 'vue, présences changées (réponse courte), résultat');
  assert.equal(P.partieRoom(), null, 'partie finie : salle oubliée'); assert.deepEqual([P.partieHist()[0].id, P.partieHist()[0].moi, P.partieHist()[0].src], ['room00000009', 5, 's']);
  await assert.rejects(P.partieRoomOp('seat', { pos: 3 }, env), e => e.code === 'gone');
  delete globalThis.localStorage;
});

test('salle d\'attente côté appli : places d\'après la salle, résultat reçu gardé dans l\'historique', () => {
  globalThis.localStorage = fakeLs();
  let st = P.partieNew({ moi: { nom: 'Max' }, id: 'room00000001', now: T0 });
  st = P.partieAddPlace(st, { sorte: 'invite', nom: 'Hors ligne', pos: 7 });
  const view = { c: 'ABC234', v: 9, st: 'live', id: st.id, format: 30, size: 8, me: 2, host: true, places: [
    { pos: 2, n: 'Max', k: 'compte', h: 1, dev: 1, on: 1, deck: { nom: 'Elfes', commandant: 'Lathril, Blade of the Elves' } }, { pos: 3, n: 'Léa', k: 'compte', dev: 1, on: 0, t: TK, deck: { commandant: 'Edgar Markov', image: IMG } },
    { pos: 5, n: 'Zoé', k: 'invite', dev: 1, on: 1 }, { pos: 6, n: 'Paul', k: 'invite', dev: 0, on: 0 }] };
  const s = P.partieFromRoom(st, view);
  assert.deepEqual(s.places.map(p => [p.pos, p.sorte, p.nom, p.uid || '', p.vie]), [[2, 'moi', 'Max', '', 30], [3, 'compte', 'Léa', TK, 30], [5, 'invite', 'Zoé', '', 30], [6, 'invite', 'Paul', '', 30], [7, 'invite', 'Hors ligne', '', 30]]);
  const started = P.partieStart(st, { now: T0 }); assert.equal(s.places[1].deck.image, IMG); assert.equal(P.partieFromRoom(started, view), started, 'partie commencée : places figées');
  const res = P.partieResClean(P.partieResult(P.partieEnd(P.partieStart(s, { now: T0 }), [3], { now: at(60) })));
  assert.ok(P.partieRoomResult({ ...view, me: 5, host: false, st: 'done', res }, { c: 'ABC234', key: 'k', host: false, guest: true, pos: 5 }));
  assert.deepEqual([P.partieHist()[0].moi, P.partieHist()[0].src, P.partieHist()[0].sv, P.partieHist()[0].u], [5, 's', 0, ''], 'invité : gardé sur l\'appareil seulement');
  assert.equal(P.partieRoomResult({ ...view, st: 'done', res }, { host: true }), false, 'le créateur l\'a déjà');
  delete globalThis.localStorage;
});

test('statistiques : parties où ma place est connue, mes decks, adversaires (prénom sans casse ni accent), commandants vus, séries ; filtre par deck', () => {
  const pl = (pos, nom, o = {}) => ({ pos, nom, sorte: pos === 1 ? 'moi' : 'invite', rang: o.w ? 1 : 2, vainqueur: !!o.w, ...(o.deck ? { deck: o.deck } : {}), ...(o.cmd ? { commandant: o.cmd } : {}) });
  const g = (i, moi, places, duree = 3600, tours = 10) => P.partieHistClean({ id: 'stats' + String(i).padStart(4, '0'), date: at(i * 86400), duree, tours, format: 40, places, moi });
  const h = [
    g(1, 1, [pl(1, 'Max', { deck: 'Atraxa superfriends', cmd: 'Atraxa', w: true }), pl(2, 'Léa', { cmd: 'Edgar Markov' })]),
    g(2, 1, [pl(1, 'Max', { deck: 'atraxa SUPERFRIENDS', cmd: 'Atraxa' }), pl(2, 'lea', { cmd: 'Edgar Markov', w: true }), pl(3, 'Bob', { cmd: 'Krenko' })], 1800, 8),
    g(3, 1, [pl(1, 'Max', { deck: 'Krenko tokens', w: true }), pl(2, 'Bob')]),
    g(4, 1, [pl(1, 'Max', { deck: 'Krenko tokens', w: true }), pl(2, 'Léa', { cmd: 'Edgar Markov' })]),
    g(5, 0, [pl(1, 'Max', { deck: 'Autre' }), pl(2, 'Zoé', { w: true })]),      // résultat sans ma place : ne compte pas
  ];
  const s = P.partieStats(h);
  assert.deepEqual([s.n, s.wins, Math.round(s.rate * 100), s.serie, s.best, s.duree, s.tours, s.rang], [4, 3, 75, 2, 2, 3150, 9.5, 1.3]);
  assert.deepEqual(s.decks.map(d => [d.nom, d.commandant, d.n, d.wins]), [['Krenko tokens', '', 2, 2], ['atraxa SUPERFRIENDS', 'Atraxa', 2, 1]], 'même deck écrit autrement : une ligne, sous son nom le plus récent ; le plus récemment joué d\'abord à égalité');
  assert.deepEqual(s.adv.map(a => [a.nom, a.n, a.mine, a.theirs]), [['Léa', 3, 2, 1], ['Bob', 2, 1, 0]], 'Léa et « lea » : la même joueuse');
  assert.deepEqual(s.cmds.map(c => [c.nom, c.n, c.wins]), [['Edgar Markov', 3, 1], ['Krenko', 1, 0]]);
  const k = P.partieStats(h, { deck: 'krenko TOKENS' }); assert.deepEqual([k.n, k.wins, k.serie, k.decks.length], [2, 2, 2, 1], 'filtre par deck');
  assert.deepEqual(P.partieStats([]), { n: 0, wins: 0, rate: 0, duree: 0, tours: 0, rang: 0, serie: 0, best: 0, decks: [], adv: [], cmds: [], jeux: {} }, 'aucune partie');
  assert.equal(P.partieStats([g(9, 1, [pl(1, 'Max'), pl(2, 'Bob', { w: true })])]).serie, 0, 'défaite la plus récente : série à 0');
});

/* ── Formats : Commander (par défaut), Standard (1 contre 1, 20 PV), Libre (PV au choix) ────────────────────────────────────────────────────── */
/** Partie Standard à deux : Max (moi) et Léa (compte) ; commencée à T0. */
function duel() {
  let s = P.partieNew({ jeu: 'standard', moi: { nom: 'Max', deck: { nom: 'Mono-rouge' } }, now: T0 - 60e3, id: 'duel00000001' });
  s = P.partieAddPlace(s, { sorte: 'compte', nom: 'Léa', uid: TK, deck: { nom: 'Contrôle Azorius' } });
  return P.partieStart(s, { now: T0 });
}

test('formats : Standard 20 PV (jamais autre chose), Libre au choix (1 à 999), Commander par défaut ; valeurs inconnues refusées', () => {
  const s = P.partieNew({ jeu: 'standard', moi: { nom: 'Max' } });
  assert.deepEqual([s.jeu, s.format, s.places[0].vie], ['standard', 20, 20]);
  assert.equal(P.partieNew({ jeu: 'standard', format: 40 }).format, 20, 'Standard : 20 points, toujours');
  assert.deepEqual([P.partieNew({ jeu: 'libre', format: 37 }).format, P.partieNew({ jeu: 'libre', format: 999 }).format], [37, 999]);
  for (const f of [0, 1000, 2.5, -4]) assert.equal(P.partieNew({ jeu: 'libre', format: f }).format, 20, 'Libre : ' + f + ' refusé, 20 par défaut');
  assert.deepEqual([P.partieNew().jeu, P.partieNew().format], ['commander', 40], 'sans format : Commander, 40');
  assert.deepEqual([P.partieNew({ jeu: 'brawl' }).jeu, P.partieNew({ jeu: '__proto__' }).jeu], ['commander', 'commander'], 'format inconnu : Commander');
  assert.equal(P.partieSetFormat(s, 40), s, 'Standard : pas d\'autres points de départ');
  const l = P.partieNew({ jeu: 'libre', moi: { nom: 'Max' } }); assert.deepEqual(P.partieSetFormat(l, 55).places.map(p => p.vie), [55]);
  assert.equal(P.partieSetFormat(P.partieNew(), 55).format, 40, 'Commander : 40, 30, 25, 20 seulement');
  assert.deepEqual([P.partieRoomSize(s), P.partieRoomSize(l), P.partieRoomSize(P.partieNew())], [2, 8, 8], 'table de 2 en Standard, 8 sinon');
  assert.equal(P.partieRoomSize(P.partieAddPlace(s, { nom: 'Bob', pos: 3 })), 3, 'Standard : agrandie pour une place déjà prise');
  assert.equal(P.partieRoomSize(s, 4), 4); assert.equal(P.partieRoomSize(s, 12), 8, '8 au plus');
});

test('formats : changement en préparation (un appui), points de vie remis, refusé une fois la partie commencée', () => {
  let s = P.partieNew({ moi: { nom: 'Max' } }); s = P.partieAddPlace(s, { nom: 'Bob' });
  s = P.partieSetJeu(s, 'standard'); assert.deepEqual([s.jeu, s.format, s.places.map(p => p.vie)], ['standard', 20, [20, 20]]);
  assert.equal(P.partieSetJeu(s, 'standard', 20), s, 'rien ne change : même objet');
  s = P.partieSetJeu(s, 'libre', 30); assert.deepEqual([s.jeu, s.format, s.places[1].vie], ['libre', 30, 30]);
  s = P.partieSetJeu(s, 'commander', 33); assert.deepEqual([s.jeu, s.format], ['commander', 40], 'points de départ qui ne vont pas : ceux par défaut');
  s = P.partieSetJeu(s, 'commander', 25); assert.equal(s.format, 25);
  assert.equal(P.partieSetJeu(s, 'vintage'), s, 'format inconnu : refusé');
  const g = P.partieStart(s, { now: T0 }); assert.equal(P.partieSetJeu(g, 'standard'), g, 'partie commencée : format figé');
});

test('Standard : sans blessures de commandant ni impôt ni monarque / initiative ; poison, énergie, compteurs libres ; élimination et fin', () => {
  let s = duel();
  assert.equal(P.partieCmdDamage(s, 2, 1, 5), s, 'blessures de commandant : refusées');
  assert.equal(P.partieCounter(s, 2, 'impot', 1), s, 'impôt de commandant : refusé');
  assert.equal(P.partieMonarch(s, 1), s); assert.equal(P.partieInitiative(s, 2), s, 'ni monarque ni initiative');
  s = P.partieCounter(s, 2, 'energie', 3, { now: at(1) }); s = P.partieCounter(s, 2, 'experience', 1, { now: at(10) }); s = P.partieCounter(s, 2, 'Radiation', 2, { now: at(20) });
  assert.deepEqual(s.places[1].compteurs, { poison: 0, impot: 0, energie: 3, experience: 1, Radiation: 2 });
  s = P.partieLife(s, 1, -7, { now: at(30) }); assert.equal(s.places[0].vie, 13);
  s = P.partieCounter(s, 1, 'poison', 10, { now: at(40) }); assert.deepEqual(P.partieProposals(s), [{ pos: 1, cause: 'poison' }], 'poison : 10 marqueurs, comme partout');
  s = P.partieLife(s, 1, -13, { now: at(50) }); assert.deepEqual(P.partieProposals(s), [{ pos: 1, cause: 'vie' }, { pos: 1, cause: 'poison' }]);
  const blessures = { ...s, places: s.places.map(p => (p.pos === 1 ? { ...p, blessures: { 2: 25 } } : p)) };
  assert.deepEqual(P.partieProposals(blessures).map(x => x.cause), ['vie', 'poison'], 'jamais de proposition « 21 blessures » hors Commander');
  s = P.partieEliminate(s, 1, 'commandant'); assert.equal(s.places[0].elimine.cause, 'autre', 'cause « blessures de commandant » : impossible en Standard');
  s = P.partieUndo(s); s = P.partieEliminate(s, 1, 'poison', { now: at(60) }); assert.equal(s.places[0].elimine.cause, 'poison');
  const e = P.partieEnd(s, undefined, { now: at(600) }); assert.deepEqual(e.vainqueurs, [2], 'le dernier en jeu gagne');
  const r = P.partieResult(e);
  assert.deepEqual([r.jeu, r.format, r.places.map(p => [p.nom, p.deck, p.rang, p.vainqueur])], ['standard', 20, [['Max', 'Mono-rouge', 2, false], ['Léa', 'Contrôle Azorius', 1, true]]]);
  assert.deepEqual(P.partieResClean(r), { ...r, places: r.places.map(({ uid, ...p }) => p) }, 'relu tel quel (jeu gardé)');
  let u = e; while (u.journal.length) u = P.partieUndo(u); assert.deepEqual(u.places.map(p => [p.vie, p.compteurs.poison]), [[20, 0], [20, 0]], 'tout s\'annule');
});

test('Libre : points de vie au choix, monarque et initiative, sans blessures de commandant', () => {
  let s = P.partieNew({ jeu: 'libre', format: 30, moi: { nom: 'A' } }); s = P.partieAddPlace(s, { nom: 'B' }); s = P.partieAddPlace(s, { nom: 'C' }); s = P.partieStart(s, { now: T0 });
  assert.deepEqual(s.places.map(p => p.vie), [30, 30, 30]);
  assert.equal(P.partieCmdDamage(s, 2, 1, 3), s); s = P.partieMonarch(s, 2); assert.equal(s.monarque, 2, 'monarque permis');
  const r = P.partieResult(P.partieEnd(s, [2], { now: at(60) })); assert.deepEqual([r.jeu, r.format], ['libre', 30]);
  const back = P.decodeResult(P.partieResultLink(r)); assert.deepEqual([back.jeu, back.format, back.places.length], ['libre', 30, 3], 'lien : format gardé');
});

test('résultat et lien : format relu, refusé s\'il est inconnu ou mal assorti ; ancien lien et ancien résultat sans format = Commander', () => {
  const r = P.partieResult(P.partieEnd(duel(), [2], { now: at(300) }));
  const bad = [{ ...r, jeu: 'vintage' }, { ...r, jeu: 'standard', format: 40 }, { ...r, jeu: 'libre', format: 0 }, { ...r, jeu: 'libre', format: 1000 }, { ...r, jeu: 7 }, { ...r, jeu: undefined, format: 55 }];
  for (const b of bad) assert.equal(P.partieResClean(b), null, JSON.stringify([b.jeu, b.format]));
  assert.equal(P.partieResClean({ ...r, jeu: 'commander' }).jeu, undefined, 'Commander (20 points permis) : pas de champ, comme avant');
  const cmd = P.partieResult(P.partieEnd(table4(), [1], { now: at(300) })); assert.equal('jeu' in cmd, false, 'résultat de Commander : inchangé');
  const old = { id: cmd.id, date: cmd.date, duree: cmd.duree, tours: cmd.tours, format: 40, places: cmd.places };      // historique ou serveur d'avant : sans jeu
  assert.equal(P.partieJeu(P.partieResClean(old)), 'commander'); assert.equal(P.partieJeu(P.partieHistClean({ ...old, moi: 1 })), 'commander');
  // lien : Commander garde les 8 éléments d'avant (lisible par une appli d'avant), Standard en a un de plus
  const dc = JSON.parse(Buffer.from(P.encodeResult(cmd), 'base64url').toString()), ds = JSON.parse(Buffer.from(P.encodeResult(r), 'base64url').toString());
  assert.deepEqual([dc.length, ds.length, ds[7]], [8, 9, 's']);
  const back = P.decodeResult(P.partieResultLink(r)); assert.deepEqual([back.jeu, back.format, back.places.map(p => [p.nom, p.deck, p.vainqueur])], ['standard', 20, [['Max', 'Mono-rouge', false], ['Léa', 'Contrôle Azorius', true]]]);
  assert.equal(P.decodeResult(P.partieResultLink(cmd)).jeu, undefined, 'ancien format de lien : Commander');
  const enc = a => Buffer.from(JSON.stringify(a)).toString('base64url'), resign = a => { const b = a.slice(0, -1); return enc([...b, P.partieCk(JSON.stringify(b))]); };
  assert.equal(P.decodeResult(resign([...ds.slice(0, 7), 'x', 'ck'])), null, 'code de format inconnu : refusé');
  assert.equal(P.decodeResult(resign([...ds.slice(0, 5), 40, ds[6], 's', 'ck'])), null, 'Standard à 40 : refusé');
  assert.equal(P.decodeResult(resign([...dc.slice(0, 7), 'c', 'ck'])), null, 'Commander n\'a pas de code');
  assert.deepEqual(P.partieParseUrl(P.partieResultLink(r)).partie.jeu, 'standard');
});

test('formats : partie gardée sur l\'appareil, salle d\'attente (format de la salle, salle d\'avant sans format), statistiques par format', () => {
  globalThis.localStorage = fakeLs();
  const s = P.partieCounter(duel(), 1, 'poison', 2, { now: at(5) }); P.partieSave(s); assert.deepEqual(P.partieLoad(), s, 'Standard relu tel quel');
  P.partieSave({ ...s, places: s.places.map(p => ({ ...p, blessures: { 2: 4 } })), monarque: 1 });
  assert.deepEqual([P.partieLoad().places[0].blessures, P.partieLoad().monarque], [{}, 0], 'relu prudemment : ni blessures ni monarque en Standard');
  const { jeu, ...old } = P.partieNew({ moi: { nom: 'A' }, id: 'oldstate0001', format: 30 }); P.partieSave(old);
  assert.deepEqual([P.partieLoad().jeu, P.partieLoad().format], ['commander', 30], 'partie d\'une version d\'avant (sans jeu) : Commander');
  P.partieClear();
  // salle : le format vient de la salle ; un serveur d'avant (sans jeu) garde celui de la partie
  const st = P.partieNew({ jeu: 'standard', moi: { nom: 'Max' }, id: 'roomstd00001' });
  const view = { c: 'ABC234', v: 2, st: 'wait', id: st.id, jeu: 'standard', format: 20, size: 2, me: 1, host: true, places: [{ pos: 1, n: 'Max', k: 'compte', h: 1, dev: 1, on: 1 }, { pos: 2, n: 'Léa', k: 'invite', dev: 1, on: 1, deck: { nom: 'Elfes' } }] };
  const a = P.partieFromRoom(st, view); assert.deepEqual([a.jeu, a.format, a.places.map(p => [p.pos, p.sorte, p.vie])], ['standard', 20, [[1, 'moi', 20], [2, 'invite', 20]]]);
  const { jeu: _j, ...oldView } = { ...view, format: 40 }; const b = P.partieFromRoom(st, oldView); assert.deepEqual([b.jeu, b.format], ['standard', 20], 'vue sans jeu : celui de la partie, 40 refusé en Standard');
  const c = P.partieFromRoom(P.partieNew({ moi: { nom: 'Max' } }), { ...view, jeu: 'libre', format: 50 }); assert.deepEqual([c.jeu, c.format, c.places[1].vie], ['libre', 50, 50]);
  // statistiques : Standard compté à part, commandants vus seulement en Commander
  const pl = (pos, nom, o = {}) => ({ pos, nom, sorte: pos === 1 ? 'moi' : 'invite', rang: o.w ? 1 : 2, vainqueur: !!o.w, ...(o.deck ? { deck: o.deck } : {}), ...(o.cmd ? { commandant: o.cmd } : {}) });
  const g = (i, j, places) => P.partieHistClean({ id: 'fmt' + String(i).padStart(9, '0'), date: at(i * 86400), duree: 1200, tours: 6, format: j === 'commander' ? 40 : j === 'libre' ? 30 : 20, ...(j !== 'commander' ? { jeu: j } : {}), places, moi: 1 });
  const h = [g(1, 'commander', [pl(1, 'Max', { deck: 'Krenko', cmd: 'Krenko, Mob Boss', w: true }), pl(2, 'Léa', { cmd: 'Edgar Markov' })]),
    g(2, 'standard', [pl(1, 'Max', { deck: 'Mono-rouge' }), pl(2, 'Léa', { deck: 'Azorius', cmd: 'Pas un commandant', w: true })]),
    g(3, 'standard', [pl(1, 'Max', { deck: 'Mono-rouge', w: true }), pl(2, 'Bob')]), g(4, 'libre', [pl(1, 'Max', { w: true }), pl(2, 'Zoé')])];
  assert.ok(h.every(Boolean));
  const all = P.partieStats(h); assert.deepEqual([all.n, all.wins, all.jeux], [4, 3, { commander: 1, standard: 2, libre: 1 }]);
  assert.deepEqual(all.cmds.map(x => x.nom), ['Edgar Markov'], 'commandants : parties de Commander seulement');
  const std = P.partieStats(h, { jeu: 'standard' });
  assert.deepEqual([std.n, std.wins, std.decks.map(d => [d.nom, d.n, d.wins]), std.adv.map(x => [x.nom, x.mine, x.theirs]), std.jeux.standard], [2, 1, [['Mono-rouge', 2, 1]], [['Léa', 0, 1], ['Bob', 1, 0]], 2]);
  assert.deepEqual([P.partieStats(h, { jeu: 'commander' }).n, P.partieStats(h, { jeu: 'libre' }).wins], [1, 1]);
  delete globalThis.localStorage;
});

test('partie suivie d\'un autre téléphone : état envoyé (partieLive, relu par partieLiveClean), saisies des places (partieRemote : une fois chacune, annulables, coupées, éliminé)', () => {
  let s = table4(); s = P.partieCmdDamage(s, 2, 1, 5, { now: at(1) }); s = P.partieCounter(s, 3, 'poison', 2, { now: at(2) }); s = P.partieMark(s, 'monarque', 4, { now: at(3) });
  const L = P.partieLive(s);
  assert.deepEqual(Object.keys(L).sort(), ['actif', 'initiative', 'monarque', 'places', 'tour']);
  assert.deepEqual(L.places.map(p => [p.pos, p.vie, p.blessures, p.compteurs]), [[1, 40, {}, {}], [2, 35, { 1: 5 }, {}], [3, 40, {}, { poison: 2 }], [4, 40, {}, {}]]);
  assert.ok(!JSON.stringify(L).includes(TK) && !('journal' in L), 'ni jeton ni journal');
  assert.deepEqual(P.partieLiveClean(JSON.parse(JSON.stringify(L)), 'commander'), L, 'relu à l\'identique');
  assert.equal(P.partieLiveClean({ ...L, places: L.places.map(p => ({ ...p, vie: 1e9, nom: 'x'.repeat(99) })) }, 'commander').places[0].vie, 9999, 'borné');
  assert.deepEqual(P.partieLiveClean(L, 'standard').places[1].blessures, {}, 'Standard : pas de blessures de commandant');
  assert.equal(P.partieLiveClean({ places: [] }, 'commander'), null); assert.equal(P.partieLiveClean({ places: Array(9).fill(L.places[0]) }, 'commander'), null);
  // tirage de la table (dés, pièce, premier joueur : partie-jeu.js) joint à l'état : gardé s'il est lisible, sinon retiré sans refuser l'état
  assert.deepEqual(P.partieLiveClean({ ...L, de: { id: 'ab12cd34', k: 'd20', v: 14, a: 3 } }, 'commander').de, { id: 'ab12cd34', k: 'd20', v: 14, a: 3 });
  assert.deepEqual(P.partieLiveClean({ ...L, de: { id: 'ab12cd34', k: 'pf', v: 0 } }, 'commander').de, { id: 'ab12cd34', k: 'pf', v: 0, a: 0 });
  for (const de of [{ id: 'ab12cd34', k: 'd6', v: 7 }, { id: 'AB<12>', k: 'd6', v: 2 }, { id: 'ab12cd34', k: 'd100', v: 2 }, { id: 'ab12cd34', k: 'j1', v: 9 }, 'd20'])
    assert.equal(P.partieLiveClean({ ...L, de }, 'commander').de, undefined, 'tirage illisible retiré : ' + JSON.stringify(de));
  assert.equal(P.partieLiveClean(L, 'commander').de, undefined, 'sans tirage : rien de plus (appli d\'avant)');
  const q = [{ s: 1, id: 'lea-a1', pos: 2, by: 2, k: 'v', n: -3 }, { s: 2, id: 'lea-a2', pos: 2, by: 2, k: 'b', src: 3, n: 2 }, { s: 3, id: 'bob-a1', pos: 3, by: 3, k: 'c', c: 'poison', n: 1 }, { s: 4, id: 'lea-co', pos: 4, by: 2, k: 't', n: 1 }];
  let x = P.partieRemote(s, q, { now: at(10) });
  assert.deepEqual([x.done.length, x.st.places[1].vie, x.st.places[1].blessures, x.st.places[2].compteurs.poison, x.st.actif, x.st.rq.s, x.st.rq.ids], [4, 30, { 1: 5, 3: 2 }, 3, 2, 4, ['2:lea-a1', '2:lea-a2', '3:bob-a1', '2:lea-co']]);
  assert.equal(P.partieLive(x.st).ack, 4, 'ack : dernier numéro appliqué');
  assert.equal(P.partieRemote(x.st, q).st, x.st, 'relus : rien de refait');
  assert.equal(P.partieRemote(P.partieStateClean(JSON.parse(JSON.stringify(x.st))), [{ ...q[0], s: 9 }]).st.places[1].vie, 30, 'identifiant déjà vu (partie relue du stockage) : rien de refait');
  assert.equal(P.partieUndo(x.st).actif, 1, 'annulable comme un appui (le tour suivant d\'abord)'); assert.equal(P.partieUndo(x.st).rq.s, 4, 'sans être réappliqué ensuite');
  const off = P.partieRemoteOff(x.st, true); assert.equal(P.partieLive(off).lock, 1);
  let y = P.partieRemote(off, [{ s: 5, id: 'lea-b1', pos: 2, by: 2, k: 'v', n: -1 }]); assert.deepEqual([y.done.length, y.st.places[1].vie, y.st.rq.s], [0, 30, 5], 'saisie coupée : ignorée (mais vue)');
  y = P.partieRemote(P.partieEliminate(x.st, 3, 'vie'), [{ s: 6, id: 'bob-b1', pos: 3, by: 3, k: 'v', n: 5 }]); assert.equal(y.done.length, 0, 'éliminé : ignoré');
  for (const bad of [{ s: 7, id: 'x', pos: 2, k: 'v', n: 1 }, { s: 7, id: 'lea-c1', pos: 2, k: 'v', n: 500 }, { s: 7, id: 'lea-c2', pos: 2, k: 'b', src: 2, n: 1 }, { s: 7, id: 'lea-c3', pos: 2, k: 'c', c: 'toString', n: 1 }, { s: 0, id: 'lea-c4', pos: 2, k: 'v', n: 1 }])
    assert.equal(P.partieRemote(x.st, [bad]).done.length, 0, JSON.stringify(bad));
  assert.equal(P.partieRemote(P.partieEnd(x.st, [1]), q.map(d => ({ ...d, s: d.s + 10 }))).done.length, 0, 'partie finie : rien');
});

/* Carte joueur (parties sans réseau) : jeton signé ECDSA P-256 comme le serveur (proxy.mjs › ptCardMake), avec une clé de test. */
const CK = generateKeyPairSync('ec', { namedCurve: 'P-256' }), CJ = CK.publicKey.export({ format: 'jwk' });
const CPK65 = Buffer.concat([Buffer.from([4]), Buffer.from(CJ.x, 'base64url'), Buffer.from(CJ.y, 'base64url')]).toString('base64url');
function carte(n, x, id = randomBytes(32), key = CK.privateKey) {
  const pre = Buffer.alloc(37); pre[0] = 1; pre.writeUInt32BE(Math.floor(x / 1000), 1); id.copy(pre, 5);
  const nb = Buffer.from(n), sig = ecSign('sha256', Buffer.concat([pre, nb]), { key, dsaEncoding: 'ieee-p1363' });
  return Buffer.concat([pre, sig, nb]).toString('base64url');
}

test('carte joueur : lecture, vérification sans réseau (signature, expiration, falsification), QR code joueur (aller-retour, taille, échappement), salle, stockage, renouvellement', async () => {
  const id = randomBytes(32), t = carte('Léa', Date.now() + 86400e3, id);
  const c = P.partieCarteRead(t); assert.deepEqual([c.n, c.id], ['Léa', id.toString('base64url')]); assert.ok(Math.abs(c.x - (Date.now() + 86400e3)) < 1000);
  for (const bad of [TK, '', null, 'x'.repeat(150), carte('', Date.now()), carte('a<b', Date.now()), Buffer.from(t, 'base64url').subarray(0, 100).toString('base64url')]) assert.equal(P.partieCarteRead(bad), null, String(bad).slice(0, 20));
  assert.deepEqual(await P.partieCarteCheck(t, { pk: CPK65 }).then(x => [x.ok, x.why]), [true, '']);
  assert.deepEqual(await P.partieCarteCheck(carte('Léa', Date.now() - 1000, id), { pk: CPK65 }).then(x => [x.ok, x.why]), [false, 'exp'], 'expirée');
  const other = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  assert.deepEqual(await P.partieCarteCheck(carte('Léa', Date.now() + 9e5, id, other.privateKey), { pk: CPK65 }).then(x => [x.ok, x.why]), [false, 'bad'], 'signée par une autre clé');
  const b = Buffer.from(t, 'base64url'); b[b.length - 1] ^= 1;
  assert.equal(await P.partieCarteCheck(b.toString('base64url'), { pk: CPK65 }).then(x => x.ok), false, 'pseudo changé');
  assert.equal((await P.partieCarteCheck(t, { pk: '' })).ok, null, 'clé du serveur inconnue ici : le serveur tranchera');
  assert.equal((await P.partieCarteCheck('abc')).why, 'bad');

  // QR code joueur : aller-retour, image compacte, textes échappés (ASCII seulement), raccourcis pour tenir, version 15 au plus
  const deck = { nom: 'Vampires | 100% Édition', commandant: 'Edgar Markov', image: IMG };
  let q = P.partieJoueurText({ t, deck }); assert.match(q, /^MO1\|[\w-]+\|\|/); assert.ok(/^[\x20-\x7e]+$/.test(q), 'ASCII');
  let j = P.partieJoueurParse(q); assert.deepEqual([j.t, j.n, j.deck.nom, j.deck.commandant, j.deck.image], [t, 'Léa', 'Vampires | 100% Édition', 'Edgar Markov', IMG.replace(/\?\d+$/, '')]);
  q = P.partieJoueurText({ n: 'Zoé', deck: null }); assert.equal(q, 'MO1||Zo%C3%A9'); assert.deepEqual(P.partieJoueurParse(q), { t: '', n: 'Zoé', deck: null });
  const { qrEncode } = require('../src/qr.js');
  const long = { t: carte('Éléonore-Françoise Àçèùë', Date.now() + 9e5), deck: { nom: 'Équipe très très longue à décrire ïëüö', commandant: 'Tymna the Weaver, Bénédicte + Kraum, Ludevic’s Opus éàè', image: IMG } };
  q = P.partieJoueurText(long); assert.ok(q.length <= P.PRT_JOUEUR_MAX, q.length + ' caractères'); assert.ok(qrEncode(q).v <= 15, 'version ' + qrEncode(q).v);
  j = P.partieJoueurParse(q); assert.equal(j.n, 'Éléonore-Françoise Àçèùë'); assert.ok(j.deck.commandant.startsWith('Tymna'), 'commandant raccourci, pas perdu');
  assert.equal(P.partieJoueurParse('https://manaorbit.app/?table=ABC234'), null); assert.equal(P.partieJoueurParse('MO1||'), null, 'sans prénom'); assert.equal(P.partieJoueurParse('bonjour'), null);
  assert.deepEqual(P.partieJoueurParse('MO1|abime|Max'), { t: '', n: 'Max', deck: null, bad: true }, 'jeton abîmé : invité');
  assert.equal(P.partieImgPack('https://cards.scryfall.io/small/front/en/x.jpg'), '', 'image sans identifiant Scryfall : rien'); assert.equal(P.partieImgUnpack('zzz'), '');

  // place d'une carte : « compte » avec la carte pour jeton ; la salle (table ouverte) la voit en invité, la carte reste ici
  let st = P.partieNew({ moi: { nom: 'Max' }, id: 'carte0000001', now: T0 });
  st = P.partieAddPlace(st, { sorte: 'compte', nom: 'Léa', uid: t, deck });
  st = P.partieAddPlace(st, { sorte: 'compte', nom: 'Paul', uid: carte('Paul', Date.now() + 9e5), pos: 5 });
  assert.equal(st.places[1].uid, t, 'carte gardée comme jeton (jusqu\'à 280 caractères)');
  const view = { c: 'ABC234', v: 3, st: 'wait', id: st.id, format: 40, size: 8, me: 1, host: true, places: [{ pos: 1, n: 'Max', k: 'compte', h: 1, dev: 1 }, { pos: 2, n: 'Léa', k: 'invite', dev: 0, deck: { commandant: 'Edgar Markov' } }, { pos: 3, n: 'Zoé', k: 'invite', dev: 1 }] };
  const s = P.partieFromRoom(st, view);
  assert.deepEqual(s.places.map(p => [p.pos, p.sorte, p.nom, !!p.uid]), [[1, 'moi', 'Max', false], [2, 'compte', 'Léa', true], [3, 'invite', 'Zoé', false], [5, 'compte', 'Paul', true]], 'carte gardée (salle : invité), carte hors salle gardée');
  assert.equal(P.partieResult(s).places.find(p => p.pos === 2).uid, t, 'le résultat part avec la carte');

  // stockage : la carte de CE compte ; renouvelée (moins de 25 jours, autre pseudo), jamais sans réseau ; clé publique gardée
  globalThis.localStorage = fakeLs();
  const S = fakeServer({ '/carte': body => [200, { t: carte(body.n, Date.now() + 30 * 864e5, id), x: Date.now() + 30 * 864e5, n: body.n, pk: CPK65 }] });
  const o = { fetch: S.fetch, user: user('u1'), online: true, on: true };
  assert.equal(await P.partieCarteSoon({ ...o, online: false }), null, 'hors ligne : rien');
  let k = await P.partieCarteSoon({ ...o, n: 'Léa', force: true }); assert.equal(k.n, 'Léa'); assert.equal(P.partiePk(), CPK65, 'clé publique gardée'); assert.equal(S.calls.length, 1);
  assert.deepEqual(S.calls[0].body, { n: 'Léa' }); assert.equal(S.calls[0].h['x-firebase-token'], 'tok-u1');
  assert.equal((await P.partieCarteSoon({ ...o, n: 'Léa', force: true })).t, k.t); assert.equal(S.calls.length, 1, 'fraîche : pas renouvelée');
  assert.equal(P.partieCarte({ user: user('u2') }), null, 'autre compte : pas sa carte');
  k = await P.partieCarteSoon({ ...o, n: 'Léa B', force: true }); assert.equal(k.n, 'Léa B', 'autre pseudo : renouvelée'); assert.equal(S.calls.length, 2);
  localStorage.setItem(P.PRT_CARTE, JSON.stringify({ ...P.partieCarte({ user: user('u1') }), t: carte('Léa B', Date.now() + 20 * 864e5, id), x: Date.now() + 20 * 864e5 }));
  await P.partieCarteSoon({ ...o, force: true }); assert.equal(S.calls.length, 3, 'moins de 25 jours : renouvelée');
  delete globalThis.localStorage;
});
