// Ligne du bas à gauche d'une carte (scanfoot.js) : numéro, code d'extension, langue, foil, lus avec les fautes habituelles de l'OCR,
// puis l'édition exacte choisie parmi les impressions de la carte reconnue. Sans navigateur ni réseau.
import './setup-env.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { footParse, footMatch, footSame, footNum } = require('../src/scanfoot.js');

const pr = (set, num, l = 'fr', fx = []) => ({ set, num, l, fx });
// Forêt : plusieurs extensions, plusieurs numéros dans la même extension (illustrations différentes), une impression seulement en anglais
const FOREST = [pr('fdn', '279'), pr('fdn', '280'), pr('blb', '278'), pr('blb', '279'), pr('mkm', '286'), pr('m15', '266'), pr('m15', '267'), pr('m15', '268'), pr('sld', '1000', 'en', ['anglais'])];
// Sol Ring : même extension et même numéro en français et en anglais (impression qui n'existe qu'en anglais ajoutée après)
const SOL = [pr('cmm', '410'), pr('c21', '263'), pr('2x2', '300'), pr('40k', '246', 'en', ['anglais']), pr('cmm', '410', 'en')];

test('footNum / footSame : confusions de l\'OCR', () => {
  assert.equal(footNum('0123'), '123'); assert.equal(footNum('O123'), '123'); assert.equal(footNum('12S'), '125'); assert.equal(footNum('0007'), '7');
  assert.equal(footNum('MKM'), '', 'pas de chiffre : pas un numéro'); assert.equal(footNum('M15'), ''); assert.equal(footNum('2X2'), '');
  assert.equal(footNum('123A'), '123a', 'numéro à lettre');
  assert.ok(footSame('M1S', 'M15')); assert.ok(footSame('0NE', 'ONE')); assert.ok(footSame('BL8', 'BLB')); assert.ok(!footSame('MKM', 'MOM')); assert.ok(!footSame('M15', 'M150'));
});

test('footParse : format récent, format 2014-2022, foil, langue', () => {
  assert.deepEqual(footParse(['0280 C', 'FDN • FR  Sam Burley']), { nums: ['280'], codes: ['FDN'], lang: 'fr', foil: false });
  assert.deepEqual(footParse(['266/269 L', 'M15 • EN']), { nums: ['266'], codes: ['M15'], lang: 'en', foil: false }, 'numéro avant la barre, pas le total');
  assert.deepEqual(footParse('0286 L\nMKM ★ DE'), { nums: ['286'], codes: ['MKM'], lang: 'de', foil: true }, '★ : foil');
  assert.equal(footParse('0286 L\nMKM * DE').foil, true, 'étoile lue comme un astérisque');
  assert.equal(footParse('MKM FR').lang, 'fr', 'puce perdue : la langue suit le code');
  assert.deepEqual(footParse('O28O C · FDN . FR').nums, ['280'], 'zéros lus comme des O');
  assert.equal(footParse(''), null); assert.equal(footParse(['—', '.']), null);
  assert.equal(footParse(['Llanowar Elves']), null, 'un nom de carte n\'est pas une ligne du bas'); assert.equal(footParse(['Sol Ring', 'Artifact']), null);
});

test('footMatch : extension et numéro → l\'impression exacte', () => {
  const m = footMatch(['0280 L', 'FDN • FR'], FOREST);
  assert.equal(m.how, 'both'); assert.equal(m.p.set + m.p.num, 'fdn280'); assert.equal(m.lang, 'fr');
  assert.equal(footMatch(['267/269 L', 'M1S • FR'], FOREST).p.num, '267', 'code lu de travers (M1S)');
  assert.equal(footMatch(['O279 L', 'BL8 • FR'], FOREST).p.set, 'blb', 'deux fautes : BL8, O279');
  assert.equal(footMatch(['1000 ★', 'SLD • EN'], FOREST).p.set, 'sld', 'impression anglaise seulement');
});

test('footMatch : une seule information lue', () => {
  const s = footMatch(['FDN • FR'], FOREST);
  assert.deepEqual([s.p, s.set], [undefined, 'fdn'], 'extension seule, plusieurs illustrations dedans : l\'extension, à départager');
  const one = footMatch(['MKM • FR'], FOREST); assert.equal(one.how, 'set'); assert.equal(one.p.num, '286', 'extension seule, une seule impression dedans');
  const n = footMatch(['0286 L'], FOREST); assert.equal(n.how, 'num'); assert.equal(n.p.set, 'mkm', 'numéro seul, unique');
  assert.equal(footMatch(['0279 L'], FOREST), null, 'numéro seul, dans deux extensions : rien');
  assert.equal(footMatch(['0999 L', 'XYZ • FR'], FOREST), null, 'rien ne correspond');
  assert.equal(footMatch(['0280 L', 'FDN • FR'], []), null);
});

test('footMatch : langue lue pour départager, codes à chiffres', () => {
  assert.equal(footMatch(['0410 U', 'CMM • EN'], SOL).p.l, 'en', 'même édition en anglais et en français : la langue lue');
  assert.equal(footMatch(['0410 U', 'CMM • FR'], SOL).p.l, 'fr');
  assert.equal(footMatch(['0410 U', 'CMM'], SOL), null, 'deux langues, aucune lue : rien de sûr');
  assert.equal(footMatch(['300/321 R', '2X2 • FR'], SOL).p.set, '2x2', 'code « 2X2 »');
  assert.equal(footMatch(['0246 R', '40K • EN'], SOL).p.set, '40k', 'code « 40K » (aussi lu comme numéro)');
});
