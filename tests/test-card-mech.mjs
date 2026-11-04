// Classement des cartes par mécaniques (data/card-mech.json, tools/card-mech-merge.mjs) : taxonomie lue, fusion des lots contrôlée, fichier du repo bien formé.
import './setup-env.mjs';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { taxonomy, mergeBatches, mechText, readMech } from '../tools/card-mech-merge.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const tax = taxonomy();
assert.ok(tax.version && tax.roles.length >= 10 && tax.tags.length >= 60, 'taxonomie lue : ' + JSON.stringify({ v: tax.version, r: tax.roles.length, t: tax.tags.length }));
for (const t of ['tokens-creature', 'sacrifice-outlet', 'dies-trigger', 'etb', 'blink', 'landfall', 'group-hug', 'tribal', 'drain']) assert.ok(tax.tags.includes(t), t);
assert.deepEqual(tax.roles.slice(0, 3), ['land', 'ramp', 'fixing']); assert.equal(new Set(tax.tags).size, tax.tags.length, 'étiquettes uniques');
console.log(`✓ taxonomie v${tax.version} : ${tax.roles.length} rôles, ${tax.tags.length} étiquettes`);

// Fusion : arbitre d'abord, sinon premier agent ; étiquettes hors liste retirées ; carte oubliée signalée ; nom inconnu ignoré ; vanilla ajoutée
const d = mkdtempSync(join(tmpdir(), 'mech-')); for (const s of ['in', 'out', 'draft']) mkdirSync(join(d, s));
writeFileSync(join(d, 'in', 'b-0000.json'), JSON.stringify([{ name: 'Blood Artist' }, { name: 'Sol Ring' }]));
writeFileSync(join(d, 'out', 'b-0000.json'), JSON.stringify([
  { name: 'Blood Artist', roles: ['wincon'], provides: ['drain', 'lifegain', 'blood-magic'], wants: ['dies-trigger', 'sacrifice'], tribes: [], power: 4, notes: 'moteur aristocrates' },
  { name: 'Inventée', roles: ['ramp'], provides: [], wants: [], tribes: [], power: 3 }]));
writeFileSync(join(d, 'in', 'b-0001.json'), JSON.stringify([{ name: 'Elvish Archdruid' }]));
writeFileSync(join(d, 'draft', 'b-0001.json'), JSON.stringify([{ name: 'Elvish Archdruid', roles: ['RAMP'], provides: [], wants: ['tribal'], tribes: ['elf'], power: 9 }]));
writeFileSync(join(d, 'in', 'b-0002.json'), JSON.stringify([{ name: 'Rien' }]));
const { cards, stats } = mergeBatches(d, tax, ['Grizzly Bears']);
assert.deepEqual(cards.get('Blood Artist'), { roles: ['wincon'], provides: ['drain', 'lifegain'], wants: ['dies-trigger', 'sacrifice'], tribes: [], power: 4, note: 'moteur aristocrates' });
assert.deepEqual(cards.get('Elvish Archdruid'), { roles: ['ramp'], provides: [], wants: ['tribal'], tribes: ['Elf'], power: 2, note: '' }, 'premier agent si pas d\'arbitre ; power hors 1-5 → 2');
assert.equal(cards.get('Grizzly Bears').power, 1); assert.equal(cards.has('Inventée'), false);
assert.deepEqual([stats.batches, stats.fromDraft, stats.missingBatch, stats.missingCards, stats.notSent, stats.dropped], [2, 1, ['b-0002.json'], ['Sol Ring'], 1, { 'blood-magic': 1 }]);
const f = join(d, 'card-mech.json'); writeFileSync(f, mechText(cards, tax, '2026-11-04'));
const back = readMech(f); assert.equal(back.meta.tax, tax.version); assert.deepEqual(back.cards.get('Blood Artist'), cards.get('Blood Artist'), 'aller-retour');
assert.ok(readFileSync(f, 'utf8').split('\n').some(l => l.startsWith('"Blood Artist":')), 'une carte par ligne');
console.log('✓ fusion : arbitre puis premier agent, étiquettes contrôlées, oublis signalés, aller-retour du fichier');

// Fichier du repo (une fois le grand tour fusionné) : indices valides, power 1-5, assez de cartes
const repo = join(root, 'data', 'card-mech.json');
if (existsSync(repo)) {
  const j = JSON.parse(readFileSync(repo, 'utf8')), n = Object.keys(j.cards).length;
  assert.ok(n > 25000, `${n} cartes`); assert.deepEqual(j.tags, tax.tags, 'étiquettes du fichier = taxonomie du repo'); assert.deepEqual(j.roles, tax.roles);
  for (const [name, [r, p, w, t, pw]] of Object.entries(j.cards)) {
    assert.ok(r.every(i => j.roles[i]) && p.every(i => j.tags[i]) && w.every(i => j.tags[i]) && Array.isArray(t), name);
    assert.ok(pw >= 1 && pw <= 5, name + ' power');
  }
  const m = readMech(repo).cards, has = (c, k, v) => m.get(c) && m.get(c)[k].includes(v);
  assert.ok(has('Sol Ring', 'roles', 'ramp') && has('Swords to Plowshares', 'roles', 'removal') && has('Rhystic Study', 'roles', 'draw'), 'cartes repères');
  console.log(`✓ data/card-mech.json : ${n} cartes, taxonomie v${j.tax}, classé le ${j.at}`);
} else console.log('· data/card-mech.json pas encore fusionné : contrôle du fichier sauté');
console.log('\nCARD-MECH OK');
