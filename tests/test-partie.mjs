// Partie de Commander (src/partie.js), logique seule sous Node : création, places, points de vie, blessures de commandant (qui retirent les points de vie),
// compteurs, monarque / initiative, élimination et retour, tours, premier joueur, annuler (chaque action, appuis fusionnés, journal borné), propositions
// d'élimination, fin et classement, résultat, lien / QR du résultat (aller-retour, taille pour 8 joueurs, textes raccourcis, liens abîmés ou trafiqués),
// stockage de l'appareil (faux localStorage), file d'envoi et partieFlush (faux serveur), salle d'attente côté appli (places, résultat reçu). Aucun port.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

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
