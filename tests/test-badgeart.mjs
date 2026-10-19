// Icônes des badges (src/badgeart.js), sous Node : un glyphe propre à chaque badge du catalogue (PRG_BADGES de src/progress.js, plus les badges
// annoncés pas encore au catalogue de cette branche), unique ou à 4 paliers comme le badge ; chaque palier donne un SVG bien formé (balises équilibrées,
// viewBox 48 × 48, classe du palier, ni NaN ni undefined, ni texte ni image externe) ; un badge à paliers change à chaque palier. Aucun navigateur ni réseau.
import test from 'node:test';
import assert from 'node:assert/strict';
import { statSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { PRG_BADGES } = require('../src/progress.js');
const { badgeSvg, bdgEl, BDG_G } = require('../src/badgeart.js');

const LATER = [{ id: 'co_import', tiers: [1] }];      // catalogue de la branche d'intégration : badge unique « Déménageur »
const ALL = [...PRG_BADGES, ...LATER.filter(x => !PRG_BADGES.some(b => b.id === x.id))];
const tiersOf = b => (b.tiers.length === 1 ? [-1, 0] : [-1, 0, 1, 2, 3]);
const glyph = svg => svg.slice(svg.indexOf('<g class="bq-gl"'));      // le glyphe seul (sans cadre ni id de dégradé)

/** Balises ouvertes et fermées dans l'ordre (une balise auto-fermante compte pour rien). */
function balanced(svg) {
  const stack = [];
  for (const m of svg.matchAll(/<(\/?)([a-zA-Z]+)\b[^>]*?(\/?)>/g)) {
    if (m[3]) continue;
    if (!m[1]) stack.push(m[2]); else if (stack.pop() !== m[2]) return false;
  }
  return stack.length === 0 && !/<[^>]*</.test(svg);
}

test('chaque badge a son propre glyphe, unique ou à 4 paliers comme le badge', () => {
  assert.ok(ALL.length >= 78, ALL.length + ' badges');
  for (const b of ALL) {
    assert.ok(Object.prototype.hasOwnProperty.call(BDG_G, b.id), b.id + ' : glyphe manquant');
    const g = BDG_G[b.id];
    if (b.tiers.length === 1) assert.equal(typeof g, 'string', b.id + ' : badge unique, un seul dessin');
    else { assert.ok(Array.isArray(g) && g.length === 4, b.id + ' : 4 calques (bronze, argent, or, diamant)'); for (const L of g) assert.ok(L.trim(), b.id + ' : calque vide'); }
  }
  const seen = new Map();
  for (const b of ALL) { const k = JSON.stringify(BDG_G[b.id]); assert.ok(!seen.has(k), `${b.id} : même dessin que ${seen.get(k)}`); seen.set(k, b.id); }
});

test('mini-langage : chaque élément de chaque calque donne un élément SVG', () => {
  for (const [id, g] of Object.entries(BDG_G)) for (const L of [].concat(g)) for (const s of L.split(';')) {
    const el = bdgEl(s.replace(/^_/, ''));
    assert.match(el, /^<(path|circle|ellipse|rect) class="bq-[a-z]( bq-u)?" [^<>]+\/>$/, `${id} : « ${s} »`);
    assert.doesNotMatch(el, /NaN|undefined|Infinity/, `${id} : « ${s} »`);
  }
});

test('chaque palier : SVG bien formé, viewBox, classe du palier, ni texte ni image', () => {
  for (const b of ALL) for (const t of tiersOf(b)) {
    const svg = badgeSvg(b.id, t), cls = t < 0 ? 't-1' : b.tiers.length === 1 ? 'tu' : 't' + t, at = `${b.id} palier ${t}`;
    assert.ok(svg.startsWith(`<svg viewBox="0 0 48 48" class="bdg-svg ${cls}" aria-hidden="true">`), at + ' : en-tête');
    assert.ok(svg.endsWith('</svg>'), at + ' : fin');
    assert.ok(balanced(svg), at + ' : balises équilibrées');
    assert.doesNotMatch(svg, /NaN|undefined|Infinity|null/, at);
    assert.doesNotMatch(svg, /<text|<image|<use|<script|href|http|on[a-z]+=/i, at + ' : ni texte, ni image, ni lien');
    const ids = [...svg.matchAll(/ id="([^"]+)"/g)].map(m => m[1]), refs = [...svg.matchAll(/url\(#([^)]+)\)/g)].map(m => m[1]);
    assert.equal(ids.length, 1, at + ' : un dégradé'); for (const r of refs) assert.equal(r, ids[0], at + ' : dégradé de cette icône');
  }
});

test('un badge à paliers change à chaque palier ; pas obtenu = glyphe du bronze, autre cadre', () => {
  for (const b of ALL.filter(x => x.tiers.length === 4)) {
    const g = [0, 1, 2, 3].map(t => glyph(badgeSvg(b.id, t)));
    assert.equal(new Set(g).size, 4, b.id + ' : 4 glyphes différents');
    for (let t = 1; t < 4; t++) assert.ok(g[t].length > g[t - 1].length, b.id + ' : le palier ' + t + ' ajoute des détails');
    assert.equal(glyph(badgeSvg(b.id, -1)), g[0], b.id + ' : pas obtenu = dessin du bronze');
  }
  for (const b of ALL.filter(x => x.tiers.length === 1)) assert.notEqual(badgeSvg(b.id, -1).replace(/bq\w+/g, ''), badgeSvg(b.id, 0).replace(/bq\w+/g, ''), b.id);
});

test('paliers hors bornes, id inconnu, poids du fichier', () => {
  assert.match(badgeSvg('sc_cards', 9), /class="bdg-svg t3"/); assert.match(badgeSvg('sc_cards', 'x'), /class="bdg-svg t-1"/); assert.match(badgeSvg('sc_cards', undefined), /class="bdg-svg t-1"/);
  assert.match(badgeSvg('sc_city_jp', 3), /class="bdg-svg tu"/); assert.match(badgeSvg('sc_city_jp', -5), /class="bdg-svg t-1"/);
  assert.ok(balanced(badgeSvg('inconnu', 2)) && badgeSvg('__proto__', 1).startsWith('<svg'), 'id inconnu : étoile');
  const ids = new Set(Array.from({ length: 20 }, () => badgeSvg('co_foil', 2).match(/ id="([^"]+)"/)[1])); assert.equal(ids.size, 20, 'un id de dégradé par icône');
  assert.ok(statSync(new URL('../src/badgeart.js', import.meta.url)).size < 120 * 1024, 'badgeart.js < 120 Ko');
});
