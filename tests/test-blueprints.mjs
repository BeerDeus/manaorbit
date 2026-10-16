// Blueprints CardTrader ↔ impressions Scryfall (data.js › mapBlueprints) : l'impression normale et la variante sans bordure d'une même carte gardent chacune
// leur numéro et leur image (avant : rattachées au seul nom, la 418 prenait l'étiquette de la 128) ; blueprint sans impression Scryfall : son numéro et l'image CardTrader.
import './setup-env.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
Object.assign(globalThis, require('../src/core.js'));
const D = require('../src/data.js');

const exps = { byCode: new Map([['fra', 7]]), byName: new Map() };
const pr = (id, num, img) => ({ id, set: 'fra', setName: 'Réalité fracturée', num, img, eu: 100, ef: 300 });
const idx = list => new Map([[7, D.bpIndexOf(list)]]);
const card = { name: 'Denzilore Fatehold' };

test('même nom, numéros différents : chaque blueprint garde son impression (numéro, image)', () => {
  const bps = [{ id: 1, name: 'Denzilore Fatehold', sid: null, num: '128', im: 'https://ct/128.jpg' }, { id: 2, name: 'Denzilore Fatehold', sid: null, num: '418', im: 'https://ct/418.jpg' }];
  const out = D.mapBlueprints(card, [pr('s418', '418', 'https://scry/418.jpg'), pr('s128', '128', 'https://scry/128.jpg')], exps, idx(bps));      // Scryfall : la variante d'abord
  assert.deepEqual(out.map(b => [b.id, b.num, b.img]).sort(), [[1, '128', 'https://scry/128.jpg'], [2, '418', 'https://scry/418.jpg']]);
});
test('identifiant Scryfall de CardTrader : utilisé, sauf si son numéro contredit l\'impression', () => {
  const bps = [{ id: 1, name: 'Denzilore Fatehold', sid: 's418', num: '128', im: '' }, { id: 2, name: 'Denzilore Fatehold', sid: 's128', num: '418', im: '' }];      // identifiants inversés chez CardTrader
  const out = D.mapBlueprints(card, [pr('s418', '418', 'i418'), pr('s128', '128', 'i128')], exps, idx(bps));
  assert.deepEqual(out.map(b => [b.id, b.num, b.img]).sort(), [[1, '128', 'i128'], [2, '418', 'i418']], 'le numéro tranche');
  const ok = D.mapBlueprints(card, [pr('s128', '128', 'i128')], exps, idx([{ id: 5, name: 'Denzilore Fatehold', sid: 's128', num: D.bpNum('0128'), im: '' }]));      // numéro normalisé à la lecture du catalogue (getBlueprints)
  assert.deepEqual(ok.map(b => [b.id, b.num]), [[5, '128']], '« 0128 » = « 128 »');
});
test('blueprint sans impression Scryfall : gardé avec son numéro et l\'image CardTrader ; catalogue sans numéros : le nom seul', () => {
  const out = D.mapBlueprints(card, [pr('s128', '128', 'i128')], exps, idx([{ id: 1, name: 'Denzilore Fatehold', sid: null, num: '128', im: '' }, { id: 9, name: 'Denzilore Fatehold', sid: null, num: '500', im: 'https://ct/500.jpg' }]));
  assert.deepEqual(out.map(b => [b.id, b.num, b.img, b.eu]).sort(), [[1, '128', 'i128', 100], [9, '500', 'https://ct/500.jpg', null]]);
  const old = D.mapBlueprints(card, [pr('s128', '128', 'i128')], exps, idx([{ id: 3, name: 'Denzilore Fatehold', sid: null, num: '', im: '' }]));
  assert.deepEqual(old.map(b => [b.id, b.num]), [[3, '128']]);
  assert.equal(D.bpNum('0042a'), '42a'); assert.equal(D.bpNum(null), ''); assert.equal(D.bpNum('0'), '0');
});
