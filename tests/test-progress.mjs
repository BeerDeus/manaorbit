// Niveau et badges (src/progress.js), sous Node : courbe d'XP (niveau 1 à 999, 999 hors d'atteinte), paliers des badges, compteurs relus prudemment,
// catalogue (identifiants uniques et courts, paliers croissants, textes de chaque badge). Aucun navigateur ni réseau.
import './setup-env.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const P = require('../src/progress.js');

test('courbe : niveau 1 à 0 XP, croissante, 999 vers 224 millions d\'XP, jamais au-delà', () => {
  assert.equal(P.prgXpFor(1), 0); assert.equal(P.prgXpFor(2), 40);
  for (let L = 2; L <= P.PRG_MAX; L++) assert.ok(P.prgXpFor(L) > P.prgXpFor(L - 1), 'croissante au niveau ' + L);
  assert.ok(P.prgXpFor(999) > 2e8 && P.prgXpFor(999) < 3e8);
  assert.deepEqual(P.prgLevel(0), { lv: 1, xp: 0, cur: 0, nxt: 40 });
  assert.equal(P.prgLevel(39).lv, 1); assert.equal(P.prgLevel(40).lv, 2); assert.equal(P.prgLevel(18000).lv, 16);
  assert.deepEqual(P.prgLevel(1e15), { lv: 999, xp: 1e15, cur: P.prgXpFor(999), nxt: null }, 'plafond 999');
});
test('paliers : aucun, bronze, argent, or, diamant ; badge unique', () => {
  const b = P.PRG_BADGES.find(x => x.id === 'sc_cards');
  assert.deepEqual(b.tiers, [100, 1000, 10000, 100000], 'bronze 100, argent 1 000, or 10 000, diamant 100 000 cartes scannées');
  assert.deepEqual([0, 99, 100, 999, 1000, 10000, 99999, 100000, 1e9].map(v => P.prgTier(b, v)), [-1, -1, 0, 0, 1, 2, 2, 3, 3]);
  const u = P.PRG_BADGES.find(x => x.id === 'sc_city_jp'); assert.deepEqual([P.prgTier(u, 0), P.prgTier(u, 1), P.prgTier(u, 50)], [-1, 0, 0]);
});
test('catalogue : beaucoup de badges, identifiants uniques et courts, paliers croissants, un texte pour chacun', () => {
  const ids = P.PRG_BADGES.map(b => b.id);
  assert.ok(ids.length >= 75, ids.length + ' badges'); assert.equal(new Set(ids).size, ids.length, 'identifiants uniques');
  for (const b of P.PRG_BADGES) {
    assert.match(b.id, /^[a-z0-9_]{2,24}$/, b.id); assert.ok(b.t && b.ic && typeof b.v === 'function', b.id);
    assert.ok(b.tiers.length === 1 || b.tiers.length === 4, b.id + ' : unique ou quatre paliers');
    for (let i = 1; i < b.tiers.length; i++) assert.ok(b.tiers[i] > b.tiers[i - 1], b.id + ' : paliers croissants');
    assert.ok(b.one || b.money || (Array.isArray(b.d) && b.d.length === 2 && b.d.every(s => s.includes('{n}') || /^Une? /.test(s))), b.id + ' : texte du palier');
  }
});
test('compteurs relus : nombres finis positifs, clés courtes, 140 au plus', () => {
  assert.deepEqual(P.prgClean({ sc: 12, sl_fr: 3.6, bad: -1, nan: NaN, 'X!': 2, s: 'texte', __proto__: { y: 1 } }), { sc: 12, sl_fr: 4 });
  assert.deepEqual(P.prgClean(null), {}); assert.deepEqual(P.prgClean('x'), {});
  assert.equal(Object.keys(P.prgClean(Object.fromEntries(Array.from({ length: 300 }, (_, i) => ['k' + i, 1])))).length, 140);
});
