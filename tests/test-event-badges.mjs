// Badges des événements (tools/gen-event-badges.mjs), sous Node, aucun port ni navigateur : chiffres 0–9 de chaque police d'événement ; SVG bien formés
// (DOMParser de jsdom), sans <text> ni script, style, image ou adresse externe, ids préfixés par l'édition et le palier (aucun en commun entre deux badges),
// références internes résolues, taille bornée (< 8 Ko), déterministes ; chaque pack à chaque palier, contenu qui s'enrichit d'un palier à l'autre ;
// éditions dues (dates injectées : J-8 rien, J-7 oui, en cours oui, après rien ; fichiers déjà là : rien sauf force) ; ligne de commande ;
// badges committés de halloween-2026 identiques à une génération.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, readdirSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { JSDOM } from 'jsdom';
import { badgeSvgFor, glyphPath, dueEditions, pickEditions, writeEditions, FONTS, FONT_IDS, OUT_DIR } from '../tools/gen-event-badges.mjs';
const require = createRequire(import.meta.url);
const { EV_PACKS, evEdition } = require('../src/evpacks.js');
const ROOT = new URL('../', import.meta.url).pathname;

const TMP = mkdtempSync(join(tmpdir(), 'mo-evbadges-')); process.on('exit', () => { try { rmSync(TMP, { recursive: true, force: true }); } catch { /* ignore */ } });
let nDir = 0; const newDir = () => { const d = join(TMP, 'd' + (++nDir)); mkdirSync(d, { recursive: true }); return d; };
const { DOMParser } = new JSDOM('').window;
const parse = s => new DOMParser().parseFromString(s, 'image/svg+xml');
const LIMIT = 8 * 1024;      // 8 Ko

test('chaque police a ses 10 chiffres, tous différents', () => {
  for (const p of EV_PACKS) assert.ok(FONTS[p.font], `${p.id} : police « ${p.font} » sans glyphes`);
  assert.deepEqual([...FONT_IDS].sort(), ['arcane', 'bloom', 'frost', 'gala', 'spooky']);
  for (const f of FONT_IDS) {
    const seen = new Set();
    for (let d = 0; d <= 9; d++) {
      const g = glyphPath(f, d);
      assert.match(g, /^M[-\d.]/, `${f} ${d} : contour vide`);
      assert.ok(!/NaN|undefined|Infinity/.test(g), `${f} ${d} : nombre invalide`);
      assert.ok(!seen.has(g), `${f} ${d} : même tracé qu'un autre chiffre`); seen.add(g);
      const doc = parse(`<svg xmlns="http://www.w3.org/2000/svg"><path d="${g}"/></svg>`);
      assert.equal(doc.getElementsByTagName('parsererror').length, 0);
    }
  }
  assert.equal(glyphPath('inconnue', 1), ''); assert.equal(glyphPath('spooky', 12), '');
});

test('SVG autonomes et bien formés : chaque pack, chaque palier', () => {
  for (const p of EV_PACKS) for (let t = 0; t < 4; t++) {
    const ed = evEdition(p, 2026), s = badgeSvgFor(ed, t), P = `${ed.id}-${t}-`, where = `${ed.id} palier ${t}`;
    const doc = parse(s), root = doc.documentElement;
    assert.equal(doc.getElementsByTagName('parsererror').length, 0, where + ' : XML invalide');
    assert.equal(root.tagName, 'svg'); assert.equal(root.getAttribute('viewBox'), '0 0 96 96');
    for (const tag of ['text', 'tspan', 'script', 'style', 'image', 'foreignObject', 'a']) assert.equal(doc.getElementsByTagName(tag).length, 0, `${where} : <${tag}>`);
    assert.ok(!/<text\b|<script\b|<style\b|@import|javascript:/i.test(s), where);
    assert.equal(s.replace('xmlns="http://www.w3.org/2000/svg"', '').match(/https?:|\/\/[a-z]/i), null, where + ' : adresse externe');
    assert.ok(!/NaN|undefined|Infinity/.test(s), where + ' : nombre invalide');
    assert.ok(Buffer.byteLength(s) < LIMIT, `${where} : ${Buffer.byteLength(s)} octets`);
    // ids préfixés par l'édition et le palier, uniques ; toute référence (url(#…), href) vise un id du badge
    const ids = [...doc.querySelectorAll('[id]')].map(e => e.id);
    assert.ok(ids.length > 3);
    for (const id of ids) assert.ok(id.startsWith(P), `${where} : id « ${id} » sans le préfixe ${P}`);
    assert.equal(new Set(ids).size, ids.length, where + ' : id en double');
    const refs = [...s.matchAll(/url\(([^)]*)\)/g)].map(m => m[1]).concat([...s.matchAll(/href="([^"]*)"/g)].map(m => m[1]));
    for (const r of refs) { assert.ok(r.startsWith('#'), `${where} : référence externe ${r}`); assert.ok(ids.includes(r.slice(1)), `${where} : ${r} introuvable`); }
    // l'année est dessinée (tracé plein), devant
    assert.ok(doc.getElementById(P + 'y').getAttribute('d').length > 200, where + ' : année absente');
  }
});

test('aucun id en commun entre deux badges (plusieurs badges dans la même page)', () => {
  const all = new Map();
  for (const p of EV_PACKS) for (let t = 0; t < 4; t++) for (const y of [2026, 2027]) {
    const k = `${p.id}-${y}-${t}`;
    for (const m of badgeSvgFor(`${p.id}-${y}`, t).matchAll(/ id="([^"]+)"/g)) { assert.ok(!all.has(m[1]) || all.get(m[1]) === k, `${m[1]} : dans ${all.get(m[1])} et ${k}`); all.set(m[1], k); }
  }
});

test('taille bornée sur plusieurs années (chiffres plus chargés compris)', () => {
  let max = 0;
  for (const p of EV_PACKS) for (let y = 2026; y < 2041; y++) for (let t = 0; t < 4; t++) max = Math.max(max, Buffer.byteLength(badgeSvgFor(`${p.id}-${y}`, t)));
  assert.ok(max < LIMIT, max + ' octets');
});

test('déterministe : même entrée, mêmes octets (et dans un autre processus)', () => {
  for (const p of EV_PACKS) for (let t = 0; t < 4; t++) assert.equal(badgeSvgFor(`${p.id}-2026`, t), badgeSvgFor(evEdition(p, 2026), t));
  const dir = newDir();
  const r = spawnSync(process.execPath, [join(ROOT, 'tools/gen-event-badges.mjs'), '--year', '2026', '--all', '--out', dir], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  for (const p of EV_PACKS) for (let t = 0; t < 4; t++) assert.equal(readFileSync(join(dir, `${p.id}-2026-${t}.svg`), 'utf8'), badgeSvgFor(`${p.id}-2026`, t));
});

test('le contenu s\'enrichit palier après palier, et le cadre aussi', () => {
  const count = el => el.getElementsByTagName('*').length;
  for (const p of EV_PACKS) {
    let prev = null;
    for (let t = 0; t < 4; t++) {
      const doc = parse(badgeSvgFor(`${p.id}-2026`, t)), scene = doc.querySelector('g[clip-path]');
      assert.ok(scene, `${p.id} ${t} : fond absent`);
      const cur = { scene: count(scene), all: count(doc.documentElement), defs: doc.getElementsByTagName('defs')[0].innerHTML };
      if (prev) {
        assert.ok(cur.scene > prev.scene, `${p.id} : palier ${t} (${cur.scene} éléments dans le fond) pas plus riche que le palier ${t - 1} (${prev.scene})`);
        assert.ok(cur.all > prev.all, `${p.id} : palier ${t} (${cur.all} éléments en tout) pas plus riche que le palier ${t - 1} (${prev.all})`);
      }
      prev = cur;
    }
  }
  // cadre : bronze, argent, or, puis couronne du grade ultime (propre à la fête) et année cerclée de couleur
  const s = t => badgeSvgFor('halloween-2026', t);
  assert.match(s(0), /stop-color="#cf8b4c"/); assert.match(s(1), /stop-color="#b3bdcb"/); assert.match(s(2), /stop-color="#eab52e"/);
  assert.match(s(3), /id="halloween-2026-3-uf"/); assert.match(s(3), /#9b4dff/); assert.match(s(3), /stroke="#ff7a1a" stroke-width="42"/);
  assert.notEqual(badgeSvgFor('noel-2026', 3).match(/id="noel-2026-3-uf">(.*?)<\/g>/)[1], s(3).match(/id="halloween-2026-3-uf">(.*?)<\/g>/)[1]);
});

test('éditions dues : J-8 rien, J-7 oui, en cours oui, après rien ; fichiers présents : rien sauf force', () => {
  const ids = (day, o) => dueEditions(day, o).map(e => e.id);
  const dir = newDir();
  assert.deepEqual(ids('2026-10-17', { dir }), []);                       // J-8 (début le 25 octobre)
  assert.deepEqual(ids('2026-10-18', { dir }), ['halloween-2026']);       // J-7
  assert.deepEqual(ids('2026-10-25', { dir }), ['halloween-2026']);       // 1er jour
  assert.deepEqual(ids('2026-11-08', { dir }), ['halloween-2026']);       // dernier jour
  assert.deepEqual(ids('2026-11-09', { dir }), []);                       // après
  assert.deepEqual(ids('2026-11-23', { dir }), []);                       // Noël (calendrier de l'Avent, début le 1er décembre) : J-8 rien
  assert.deepEqual(ids('2026-11-24', { dir }), ['noel-2026']);            // J-7
  assert.deepEqual(ids('2027-03-28', { dir }), ['paques-2027']);         // nid de Pâques (prêt) : dimanche de Pâques
  assert.deepEqual(ids('2027-08-05', { dir }), []);                       // anniversaire de Magic pas prêt…
  assert.deepEqual(ids('2027-08-05', { dir, all: true }), ['magic-2027']);  // … sauf --all
  assert.deepEqual(ids('2027-01-05', { dir, all: true }), ['nouvelan-2026']);      // Nouvel an à cheval sur deux années
  // fichiers déjà là : rien ; un seul manquant : l'édition revient ; force : toujours
  const w = writeEditions(dueEditions('2026-10-18', { dir }), { dir });
  assert.equal(w.length, 4); assert.deepEqual(readdirSync(dir).sort(), [0, 1, 2, 3].map(t => `halloween-2026-${t}.svg`));
  assert.deepEqual(ids('2026-10-30', { dir }), []);
  assert.deepEqual(ids('2026-10-30', { dir, force: true }), ['halloween-2026']);
  rmSync(join(dir, 'halloween-2026-2.svg'));
  assert.deepEqual(ids('2026-10-30', { dir }), ['halloween-2026']);
  assert.deepEqual(writeEditions(dueEditions('2026-10-30', { dir }), { dir }).map(f => f.slice(dir.length + 1)), ['halloween-2026-2.svg']);
  // choix à la main (--year, --pack)
  assert.deepEqual(pickEditions({ dir: newDir(), year: 2027 }).map(e => e.id), ['halloween-2027', 'noel-2027', 'nouvelan-2027', 'paques-2027']);      // packs prêts
  assert.deepEqual(pickEditions({ dir: newDir(), year: 2027, all: true }).map(e => e.id), EV_PACKS.map(p => p.id + '-2027'));
  assert.deepEqual(pickEditions({ dir: newDir(), pack: 'paques', today: '2028-01-01' }).map(e => e.id), ['paques-2028']);
  assert.deepEqual(pickEditions({ dir, year: 2026 }).map(e => e.id), ['noel-2026', 'nouvelan-2026', 'paques-2026']);      // Halloween déjà écrit ; Noël, Nouvel an et Pâques pas encore
});

test('ligne de commande : écrit ce qui manque, l\'affiche, puis plus rien ; --force, --pack, option inconnue', () => {
  const dir = newDir(), run = (...a) => spawnSync(process.execPath, [join(ROOT, 'tools/gen-event-badges.mjs'), '--out', dir, ...a], { encoding: 'utf8' });
  let r = run('--today', '2026-10-17');
  assert.equal(r.status, 0, r.stderr); assert.match(r.stdout, /rien à générer/); assert.equal(readdirSync(dir).length, 0);
  r = run('--today', '2026-10-18');
  assert.equal(r.status, 0, r.stderr); assert.equal((r.stdout.match(/^écrit .*halloween-2026-[0-3]\.svg$/gm) || []).length, 4);
  r = run('--today', '2026-10-20');
  assert.match(r.stdout, /rien à générer/);
  writeFileSync(join(dir, 'halloween-2026-1.svg'), 'abîmé');
  r = run('--today', '2026-10-20', '--force');
  assert.equal((r.stdout.match(/^écrit /gm) || []).length, 4); assert.equal(readFileSync(join(dir, 'halloween-2026-1.svg'), 'utf8'), badgeSvgFor('halloween-2026', 1));
  r = run('--pack', 'magic', '--year', '2027');
  assert.equal(r.status, 0, r.stderr); assert.ok(existsSync(join(dir, 'magic-2027-3.svg')));
  assert.equal(run('--pack', 'inconnu').status, 2); assert.equal(run('--bizarre').status, 2); assert.equal(run('--today', '26-10-2026').status, 2);
});

test('badges committés de halloween-2026 identiques à une génération', () => {
  for (let t = 0; t < 4; t++) assert.equal(readFileSync(join(OUT_DIR, `halloween-2026-${t}.svg`), 'utf8'), badgeSvgFor('halloween-2026', t), `halloween-2026-${t}.svg à régénérer : node tools/gen-event-badges.mjs --year 2026 --pack halloween --force`);
});
