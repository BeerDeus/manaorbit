// Emplacements, détails d'exemplaire et proxys : format des lignes, texte de la collection, ancienne version, fusions.
import './setup-env.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const C = require('../src/core.js');

test('clé de ligne : détails après « # », toujours dans le même ordre', () => {
  assert.equal(C.lineKey('fr', 'cmm|400', true, { s: 1, c: 'nm', p: 'k3x9a' }), 'fr|cmm|400*#pk3x9a-cnm-s');
  assert.equal(C.lineKey('fr', '', false, ''), 'fr');
  assert.equal(C.lineKey('', '', false, 'pabc'), '#pabc');
  const g = 'fr|cmm|400*#pk3x9a-cnm-s';
  assert.equal(C.lineHead(g), 'fr|cmm|400*'); assert.equal(C.lineAw(g), 'pk3x9a-cnm-s');
  assert.equal(C.lineFoil(g), true); assert.equal(C.lineLang(g), 'fr'); assert.equal(C.lineEd(g), 'cmm|400'); assert.equal(C.lineBase(g), 'fr|cmm|400');
  assert.equal(C.linePlace(g), 'k3x9a'); assert.deepEqual(C.lineAttrs(g), { p: 'k3x9a', c: 'nm', s: 1 });
  assert.equal(C.lineSet(g, { p: '' }), 'fr|cmm|400*#cnm-s', 'emplacement retiré, détails gardés');
  assert.equal(C.lineSet('fr', { p: 'abc', m: 1 }), 'fr#pabc-m');
  assert.equal(C.attrWord(C.attrOf('s-cxx-zz-pabc-cpo')), 'pabc-cpo-s', 'mots inconnus ignorés');
  assert.equal(C.edKey('cmm', '4#0'), '', '« # » jamais dans un numéro');
  assert.ok(C.lineCmp('fr|cmm|400', 'fr|cmm|400#pabc') < 0, 'ligne sans détails d\'abord');
});

test('texte de la collection : aller-retour, export sans détails', () => {
  const coll = { 'sol ring': C.collFromLines({ n: 'Sol Ring', d: 1700000000 }, [['fr|cmm|400', 2], ['fr|cmm|400#pk3x9a', 1], ['en|cmm|400*#pk3x9a-cnm-s', 1], ['fr#pzz9', 3], ['#pabc', 1]]) };
  const t = C.collToText(coll, true);
  assert.match(t, /^1 Sol Ring \(DETAILS\) pk3x9a-cnm-s \(FOIL\) \(CMM\) 400 \(D[0-9a-z]+\) \*EN\*$/m);
  assert.match(t, /^3 Sol Ring \(DETAILS\) pzz9 \(D[0-9a-z]+\) \*FR\*$/m);
  assert.match(t, /^1 Sol Ring \(DETAILS\) pabc \(D[0-9a-z]+\)$/m);
  const back = C.collFromText(t);
  assert.deepEqual(back['sol ring'], coll['sol ring'], 'aller-retour exact'); assert.ok(C.sameColl(coll, back));
  const ex = C.collToText(coll);
  assert.doesNotMatch(ex, /DETAILS/, 'export : pas de détails');
  assert.match(ex, /^3 Sol Ring \(CMM\) 400 \*FR\*$/m, 'export : lignes de même édition regroupées');
  const one = { 'arcane signet': C.collFromLines({ n: 'Arcane Signet' }, [['fr#pabc', 2]]) };
  assert.deepEqual(one['arcane signet'].x, { 'fr#pabc': 2 }, 'une seule ligne avec emplacement : gardée');
  assert.deepEqual(C.collFromText(C.collToText(one, true)), one);
});

test('ancienne version : carte, quantité, foil, édition et langue toujours justes', () => {
  const OLD_DATE = /\s+\(D([0-9a-z]{5,7})\)(?=(?:\s+\*[A-Za-z]+(?:-[A-Za-z]+)?\*)?\s*$)/, OLD_ED = /\s+\(([A-Za-z0-9]{2,6})\)\s+([^\s()|*,;"]{1,12})(?=(?:\s+\*[A-Za-z]+(?:-[A-Za-z]+)?\*)*\s*$)/;
  const coll = {
    'sol ring': C.collFromLines({ n: 'Sol Ring', d: 1700000000 }, [['en|cmm|400*#pk3x9a-cnm-s', 1], ['fr#pzz9', 3], ['#pabc-a', 1]]),
    'fire': C.collFromLines({ n: 'Fire // Ice' }, [['de|mh2|290#ok3x9a-pdeck1-m', 2]]),
  };
  const doc = C.collDoc(coll, { 'gaea s cradle': { n: 'Gaea\'s Cradle', q: 1, x: { 'en#pbox1': 1 } } }, { k3x9a: { t: 'binder', n: 'Classeur rouge' }, deck1: { t: 'deck', n: 'Atraxa', r: 'abc123' } });
  const text = C.collDocText(doc);
  const seen = [];
  for (let raw of text.split('\n')) {
    let e = '';
    raw = raw.replace(OLD_DATE, '').replace(OLD_ED, (m, a, b) => { e = C.edKey(a, b); return e ? '' : m; });
    const p = C.parseLine(raw, { fr: false });
    if (p.ignored) { assert.match(raw, /^\/\/@[PL] /, 'seules les lignes « //@ » sont ignorées'); continue; }
    seen.push([p.name, p.qty, p.lang || '', e, !!p.foil]);
  }
  assert.deepEqual(seen.sort(), [['Fire // Ice', 2, 'de', 'mh2|290', false], ['Sol Ring', 1, '', '', false], ['Sol Ring', 1, 'en', 'cmm|400', true], ['Sol Ring', 3, 'fr', '', false]].sort());
});

test('collection complète : proxys et emplacements dans le même texte', () => {
  const doc = C.collDoc(
    { 'sol ring': { n: 'Sol Ring', q: 2, l: 'fr' } },
    { [C.ownKey('Gaea\'s Cradle')]: { n: 'Gaea\'s Cradle', q: 1, x: { 'en#pbox1': 1 } } },
    { box1: { t: 'box', n: 'Boîte, "proxys"' }, deck1: { t: 'deck', n: 'Atraxa', r: 'abc123' } });
  doc.places = Object.fromEntries(Object.entries(doc.places).map(([k, v]) => [k, C.placeNorm(v)]));
  assert.equal(doc.places.box1.n, 'Boîte proxys', 'nom sans virgule ni guillemet');
  const t = C.collDocText(doc);
  assert.match(t, /^\/\/@P 1 Gaea's Cradle \(DETAILS\) pbox1 \*EN\*$/m);
  assert.match(t, /^\/\/@L deck1 deck:abc123 Atraxa$/m);
  assert.ok(t.startsWith('2 Sol Ring'), 'les cartes d\'abord (jamais une ligne « // » en tête : pas prise pour un en-tête de CSV)');
  const back = C.collDocFromText(t);
  assert.ok(C.sameDoc(doc, back), 'aller-retour'); assert.deepEqual(back.places, doc.places);
  assert.deepEqual(Object.keys(C.collFromText(t)), ['sol ring'], 'collFromText seul : les proxys n\'entrent pas dans la collection');
  assert.ok(C.sameDoc(C.collDocFromText(''), C.collDoc()));
  assert.equal(C.collDocText(C.collDoc({}, { x: { n: 'Sol Ring', q: 1 } })), '//@P 1 Sol Ring', 'proxys seuls');
  assert.deepEqual(Object.keys(C.collDocFromText('//@P 1 Sol Ring').prox), ['sol ring']);
  assert.equal(C.collDocFromText('//@L zz other').places.zz, undefined, 'emplacement sans nom : ignoré');
});

test('fusions : déplacements d\'emplacement, emplacements, proxys', () => {
  const k = 'sol ring', mk = lines => ({ [k]: C.collFromLines({ n: 'Sol Ring' }, lines) });
  const base = mk([['fr', 3]]);
  const local = mk([['fr', 1], ['fr#pa1', 2]]);      // ici : 2 rangés dans « a1 »
  const remote = mk([['fr', 2], ['fr#pb2', 1]]);     // ailleurs : 1 rangé dans « b2 »
  const m = C.merge3(base, local, remote);
  assert.deepEqual(C.collLines(m[k]), [['fr#pa1', 2], ['fr#pb2', 1]].sort((a, b) => C.lineCmp(a[0], b[0])), 'les deux déplacements gardés, rien de doublé');
  const u = C.unionLines([['fr', 2]], [['fr#pa1', 2]]);
  assert.deepEqual(u, [['fr#pa1', 2]], 'union sans base : les mêmes cartes, rangées');
  const u2 = C.unionLines([['fr|cmm|400#pa1', 1], ['fr', 1]], [['fr|cmm|400#pa1', 1], ['fr|cmm|400', 1]]);
  assert.deepEqual(u2.sort(), [['fr|cmm|400', 1], ['fr|cmm|400#pa1', 1]].sort());
  const P = C.placesMerge3({ a1: { t: 'box', n: 'A' } }, { a1: { t: 'box', n: 'A2' }, c3: { t: 'sale', n: 'Vente' } }, { a1: { t: 'box', n: 'A' }, b2: { t: 'binder', n: 'B' } });
  assert.deepEqual(P, { a1: { t: 'box', n: 'A2' }, c3: { t: 'sale', n: 'Vente' }, b2: { t: 'binder', n: 'B' } });
  assert.deepEqual(C.placesMerge3({ a1: { t: 'box', n: 'A' } }, {}, { a1: { t: 'box', n: 'A' } }), {}, 'retiré ici');
  assert.deepEqual(C.placesMerge3({ a1: { t: 'box', n: 'A' } }, {}, { a1: { t: 'box', n: 'Z' } }), { a1: { t: 'box', n: 'Z' } }, 'modifié ailleurs : l\'emporte sur le retrait');
  const d = C.mergeDoc3(C.collDoc(base), C.collDoc(local, { x: { n: 'X', q: 1 } }), C.collDoc(remote, {}, { b2: { t: 'binder', n: 'B' } }));
  assert.deepEqual(Object.keys(d.prox), ['x']); assert.deepEqual(Object.keys(d.places), ['b2']);
  const dn = C.mergeDoc3(null, C.collDoc(local), C.collDoc(remote));
  assert.ok(dn.map[k].q >= 3, 'sans base : union');
});

test('import : état lu dans la colonne « Condition », Near Mint ignoré', () => {
  const csv = 'Name,Set code,Collector number,Quantity,Condition,Language\nSol Ring,CMM,400,2,near_mint,English\nSol Ring,CMM,400,1,light_played,English\nArcane Signet,CMM,380,1,Excellent,French';
  const r = C.parseCollection(csv);
  const sol = r.items.find(x => x.n === 'Sol Ring'), sig = r.items.find(x => x.n === 'Arcane Signet');
  assert.deepEqual(sol.x, { 'en|cmm|400': 2, 'en|cmm|400#clp': 1 });
  assert.deepEqual(sig.x, { 'fr|cmm|380#cex': 1 });
  assert.equal(C.csvCond('Heavily Played'), 'pl'); assert.equal(C.csvCond('NM'), 'nm'); assert.equal(C.csvCond('?'), '');
  const out = C.collToCsv({ 'sol ring': sol }, []);
  assert.match(out, /^1,0,Sol Ring,cmm,Moderately Played,English,,400$/m, 'export : état gardé');
  assert.match(out, /^2,0,Sol Ring,cmm,Near Mint,English,,400$/m);
});

test('mergeColl : exemplaire rangé sans langue → langue de la carte', () => {
  const m = C.mergeColl({ 'sol ring': { n: 'Sol Ring', q: 2, l: 'fr' } }, [{ k: 'sol ring', n: 'Sol Ring', q: 1, l: '#pa1' }], 'add', 1);
  assert.deepEqual(m['sol ring'].x, { fr: 2, 'fr#pa1': 1 });
});

test('import ManaBox : classeurs → emplacements (un seul classeur : rien de rangé)', () => {
  const head = 'Binder Name,Binder Type,Name,Set code,Collector number,Quantity,Condition,Language\n';
  const r = C.parseCollection(head + 'Rouge,binder,Sol Ring,CMM,400,2,near_mint,English\nBleu,binder,Sol Ring,CMM,400,1,excellent,English\nAtraxa,deck,Arcane Signet,CMM,380,1,near_mint,French\nSouhaits,list,Mana Crypt,2XM,270,1,near_mint,English');
  const ids = Object.keys(r.places); assert.equal(ids.length, 3); assert.equal(r.listed, 1, 'liste de souhaits laissée de côté');
  const red = ids.find(k => r.places[k].n === 'Rouge'), blue = ids.find(k => r.places[k].n === 'Bleu'), dk = ids.find(k => r.places[k].n === 'Atraxa');
  assert.equal(r.places[dk].t, 'deck'); assert.match(red, /^i[a-z0-9]{1,11}$/);
  assert.deepEqual(r.items.find(x => x.n === 'Sol Ring').x, { [`en|cmm|400#p${red}`]: 2, [`en|cmm|400#p${blue}-cex`]: 1 });
  const one = C.parseCollection(head + 'Ma collection,binder,Sol Ring,CMM,400,2,near_mint,English\nMa collection,binder,Arcane Signet,CMM,380,1,good,French');
  assert.deepEqual(one.places, {}); assert.deepEqual(one.items.find(x => x.n === 'Arcane Signet').x, { 'fr|cmm|380#cgd': 1 }, 'un seul classeur : état gardé, pas d\'emplacement');
});
