// Filtre « Style » (core.js › STYLES, styOf, styIn, fltLineOk) : styles d'une impression Scryfall (plein art, sans bordure, illustration étendue, vitrine,
// sans texte), ligne de la collection filtrée par le style de son édition, style inconnu (sans édition) écarté. Sans navigateur ni réseau.
import './setup-env.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const C = require('../src/core.js');

test('styOf : champs Scryfall → codes de style', () => {
  assert.equal(C.styOf({ full_art: false, border_color: 'black', frame_effects: ['legendary'] }), '', 'cadre classique');
  assert.equal(C.styOf({ full_art: true, border_color: 'borderless' }), 'fa,bl');
  assert.equal(C.styOf({ border_color: 'black', frame_effects: ['extendedart', 'inverted'] }), 'ex');
  assert.equal(C.styOf({ frame_effects: ['showcase'], textless: true }), 'sc,tl');
  assert.equal(C.styOf(null), ''); assert.equal(C.styOf({ frame_effects: 'showcase' }), '', 'frame_effects illisible : ignoré');
  assert.deepEqual(C.STYLES.map(s => s[0]), ['fa', 'bl', 'ex', 'sc', 'tl']);
});

test('styIn et filtre de ligne : un style au moins ; style inconnu écarté', () => {
  const sty = new Set(['fa', 'bl']);
  assert.equal(C.styIn('fa', sty), true); assert.equal(C.styIn('ex,bl', sty), true); assert.equal(C.styIn('sc', sty), false);
  assert.equal(C.styIn('', sty), false, 'cadre classique'); assert.equal(C.styIn(null, sty), false, 'édition inconnue'); assert.equal(C.styIn(undefined, sty), false, 'lue avant le filtre');
  assert.ok(C.FLT_ADV.includes('sty')); assert.equal(C.fltLineOn({ sty }), true); assert.equal(C.fltAdvCount({ sty, lang: new Set(), rar: new Set() }), 1);
  assert.equal(C.fltLineOk({ l: 'fr', y: 'bl' }, { sty }), true);
  assert.equal(C.fltLineOk({ l: 'fr', y: '' }, { sty }), false);
  assert.equal(C.fltLineOk({ l: 'fr', y: 'bl' }, { sty, lang: new Set(['en']) }), false, 'tous les filtres de ligne sur la même ligne');
});

test('filterItems : une carte passe si une de ses lignes a le style', () => {
  const f = { q: '', colors: new Set(), type: '', cmc: '', cmdr: '', set: '', lang: new Set(), foil: '', rar: new Set(), sty: new Set(['ex']), px: '', place: '', dup: false, dk: '', tr: false, add: '', fmt: '' };
  const items = [
    { k: 'a', n: 'A', q: 2, sl: [{ l: 'en', y: '' }, { l: 'fr', y: 'ex' }] },
    { k: 'b', n: 'B', q: 1, sl: [{ l: 'en', y: 'fa' }] },
    { k: 'c', n: 'C', q: 1, sl: [{ l: 'en', y: null }] },
  ];
  assert.deepEqual(C.filterItems(items, f).map(i => i.k), ['a']);
  assert.equal(C.filterActive(f), true);
});
