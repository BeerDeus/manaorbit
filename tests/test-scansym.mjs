// Symbole d'extension (scansym.js) : découpe du symbole dans la zone de la ligne de type (fond, illustration, cadre, texte du type écartés ; or, argent, noir ;
// symbole en deux morceaux ; pas de symbole), silhouettes de référence (épaissies, encoches bouchées), distance, décision (sûr, presque pareils, trop loin,
// référence manquante), SVG mis à la taille. Images synthétiques dessinées ici : sans navigateur ni réseau.
import './setup-env.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const S = require('../src/scansym.js');
const { symFill, symNorm, symCut, symSigData, symDT, symRefData, symDist, symRank, symSvgSized, SYM_N, SYM_BOX, SYM_MAX, SYM_RATIO, SYM_GAP } = S;

let seed = 11; const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
/** Formes (anneaux de polygones dans [0,1]², pair-impair). */
const star = (n, r0, r1) => [Array.from({ length: 2 * n }, (_, i) => { const a = -Math.PI / 2 + i * Math.PI / n, r = i % 2 ? r1 : r0; return [0.5 + r * Math.cos(a), 0.5 + r * Math.sin(a)]; })];
const disc = (cx = 0.5, cy = 0.5, r = 0.5) => Array.from({ length: 48 }, (_, i) => [cx + r * Math.cos(i * Math.PI / 24), cy + r * Math.sin(i * Math.PI / 24)]);
const SH = {
  star: star(5, 0.5, 0.2),
  shield: [[[0.1, 0.05], [0.5, 0], [0.9, 0.05], [0.9, 0.45], ...Array.from({ length: 16 }, (_, i) => [0.5 + 0.4 * Math.cos(i * Math.PI / 15), 0.45 + 0.55 * Math.sin(i * Math.PI / 15)])]],
  chevron: [[[0, 0], [0.24, 0], [0.5, 0.62], [0.76, 0], [1, 0], [0.5, 1]]],
  ring: [disc(), disc(0.5, 0.5, 0.28).reverse()],      // anneau : silhouette = disque (trou bouché)
  bars: [[[0, 0], [0.42, 0], [0.42, 1], [0, 1]], [[0.58, 0], [1, 0], [1, 1], [0.58, 1]]],      // deux barres séparées : un symbole en deux morceaux
};
const inPoly = (rings, x, y) => { let c = false; for (const r of rings) for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [xi, yi] = r[i], [xj, yj] = r[j]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c; } return c; };
/** Couverture (0–1) de la forme dans une boîte (x0, y0, bw, bh) d'une image w × h, suréchantillonnée 4 × 4. */
function cover(rings, w, h, x0, y0, bw, bh) {
  const c = new Float32Array(w * h);
  for (let y = Math.floor(y0); y < Math.ceil(y0 + bh); y++) for (let x = Math.floor(x0); x < Math.ceil(x0 + bw); x++) {
    if (x < 0 || y < 0 || x >= w || y >= h) continue; let k = 0;
    for (let v = 0; v < 4; v++) for (let u = 0; u < 4; u++) { const px = (x + (u + 0.5) / 4 - x0) / bw, py = (y + (v + 0.5) / 4 - y0) / bh; if (px >= 0 && py >= 0 && px <= 1 && py <= 1 && inPoly(rings, px, py)) k++; }
    c[y * w + x] = k / 16;
  }
  return c;
}
/** Zone SYM_BOX d'une carte photographiée (w × h RGBA) : illustration en haut, cadre, ligne de type (texte du type à gauche), boîte de texte en bas, symbole
 *  (dégradé de rareté, contour sombre d'un pixel et demi), flou et bruit. dy : carte décalée verticalement (fraction de la hauteur). */
function zone(shape, { w = 200, h = 160, fill = [[238, 205, 115], [150, 110, 35]], outline = [15, 15, 15], bar = [236, 226, 196], frame = [214, 196, 150], dy = 0, size = 0.032, aspect = 1, blur = 1, noise = 12, typeEnd = 0.8 } = {}) {
  const pw = w / SYM_BOX.w, ph = h / SYM_BOX.h, X = v => (v - SYM_BOX.x) * pw, Y = v => (v - SYM_BOX.y + dy) * ph;
  const img = new Float32Array(w * h * 3), put = (i, c, a = 1) => { for (let k = 0; k < 3; k++) img[i * 3 + k] = img[i * 3 + k] * (1 - a) + c[k] * a; };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x, cy = SYM_BOX.y - dy + y / ph, cx = SYM_BOX.x + x / pw;
    if (cy < 0.555) put(i, [60 + 150 * Math.abs(Math.sin(x * 0.07 + y * 0.03)), 90 + 120 * Math.abs(Math.cos(x * 0.05)), 70 + 100 * Math.abs(Math.sin(y * 0.11))]);      // illustration
    else if (cy >= 0.567 && cy <= 0.625 && cx < 0.94) put(i, bar);      // ligne de type
    else if (cy > 0.64 && cx < 0.92) put(i, bar);      // boîte de texte
    else put(i, frame);
    if (cx > 0.94 + 0.02) put(i, [12, 12, 12]);      // bord noir de la carte
  }
  for (let gx = SYM_BOX.x + 0.012; gx < typeEnd; gx += 0.018) {      // texte du type : lettres sombres
    const c = cover([[[0, 0], [1, 0], [1, 1], [0, 1]]], w, h, X(gx), Y(0.586), 0.011 * pw, 0.018 * ph); for (let i = 0; i < w * h; i++) if (c[i]) put(i, [25, 20, 15], c[i]);
  }
  if (shape) {
    const sh = size * ph, sw = sh * aspect, x0 = X(0.925) - sw, y0 = Y(0.596) - sh / 2, out = cover(shape, w, h, x0 - 1.5, y0 - 1.5, sw + 3, sh + 3), inn = cover(shape, w, h, x0, y0, sw, sh);
    for (let i = 0; i < w * h; i++) {
      if (out[i]) put(i, outline, out[i]);
      if (inn[i]) { const t = Math.min(1, Math.max(0, (Math.floor(i / w) - y0) / sh)); put(i, fill[0].map((a, k) => a + (fill[1][k] - a) * t), inn[i]); }
    }
  }
  let a = img;
  for (let p = 0; p < blur; p++) {      // flou (boîte 3 × 3)
    const o = new Float32Array(a.length);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) for (let k = 0; k < 3; k++) { let s = 0, n = 0; for (let dy2 = -1; dy2 <= 1; dy2++) for (let dx = -1; dx <= 1; dx++) { const xx = x + dx, yy = y + dy2; if (xx >= 0 && yy >= 0 && xx < w && yy < h) { s += a[(yy * w + xx) * 3 + k]; n++; } } o[(y * w + x) * 3 + k] = s / n; }
    a = o;
  }
  const d = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) { for (let k = 0; k < 3; k++) d[i * 4 + k] = a[i * 3 + k] + (rnd() - 0.5) * 2 * noise; d[i * 4 + 3] = 255; }
  return { d, w, h };
}
/** Référence : la forme seule, nette, rendue en opacité (96 px, marge de 40 px) comme un SVG sur un canvas. */
function ref(shape, aspect = 1) {
  const sh = 96 / Math.max(1, aspect), sw = sh * aspect, w = Math.round(sw + 80), h = Math.round(sh + 80), c = cover(shape, w, h, 40, 40, sw, sh), d = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) d[i * 4 + 3] = Math.round(c[i] * 255);
  return symRefData(d, w, h);
}
const sigOf = (shape, o) => { const z = zone(shape, o); return symSigData(z.d, z.w, z.h); };
const REFS = Object.fromEntries(Object.entries(SH).map(([k, v]) => [k, ref(v, k === 'bars' ? 1.4 : 1)]));
const rank = sig => Object.entries(REFS).map(([k, r]) => [k, symDist(sig, r)]).sort((a, b) => a[1] - b[1]);

test('symFill / symNorm / symDT : trous bouchés, boîte ramenée à SYM_N, proportions gardées, distances', () => {
  const w = 10, h = 10, b = new Uint8Array(w * h);
  for (let y = 2; y <= 7; y++) for (let x = 2; x <= 7; x++) b[y * w + x] = y === 2 || y === 7 || x === 2 || x === 7 ? 1 : 0;      // carré creux
  symFill(b, w, h); assert.equal(b.reduce((a, v) => a + v, 0), 36, 'intérieur bouché');
  const n = symNorm(b, w, h); assert.equal(n.m.length, SYM_N * SYM_N); assert.equal(n.a, 1);
  assert.equal(n.m[(SYM_N >> 1) * SYM_N + (SYM_N >> 1)], 255); assert.equal(n.m[0], 0, 'marge d\'un pixel');
  const r = new Uint8Array(40 * 10); for (let y = 3; y < 7; y++) for (let x = 5; x < 35; x++) r[y * 40 + x] = 1;      // bande 30 × 4
  const nr = symNorm(r, 40, 10); assert.equal(nr.a, 7.5); assert.equal(nr.m[0], 0); assert.equal(nr.m[(SYM_N >> 1) * SYM_N + 3], 255, 'bande centrée, sur toute la largeur');
  assert.equal(symNorm(new Uint8Array(100), 10, 10), null, 'vide : rien');
  const one = new Uint8Array(25); one[12] = 1; const d = symDT(one, 5, 5, 1);
  assert.equal(d[12], 0); assert.equal(d[13], 3); assert.equal(d[18], 4); assert.equal(d[24], 8, 'chanfrein 3-4 (tiers de pixel)');
});

test('symRefData : silhouettes de plus en plus épaisses, encoches bouchées', () => {
  const r = REFS.chevron; assert.ok(r && r.v.length >= 6, 'plusieurs épaisseurs');
  const area = s => s.m.reduce((a, v) => a + v, 0);
  assert.ok(area(r.v[3]) > area(r.v[0]) * 1.1, 'épaissie');
  assert.ok(area(r.v[r.v.length - 1]) > area(r.v[1]) * 1.15, 'encoche du chevron en partie bouchée');
  assert.ok(symDist(r.v[0], REFS.chevron) === 0 && symDist(REFS.shield.v[0], REFS.chevron) > 0.2);
  assert.ok(symDist(REFS.ring.v[0], ref([disc()])) < 0.03, 'anneau : trou bouché, comme un disque');
  assert.equal(symRefData(new Uint8ClampedArray(16 * 4), 4, 4), null, 'transparent : rien');
});

test('symCut : le symbole trouvé et reconnu, quelle que soit la couleur de rareté', () => {
  for (const [name, o] of [['or', {}], ['argent proche du fond', { fill: [[230, 228, 222], [120, 124, 130]] }], ['noir sans contour', { fill: [[25, 25, 25], [25, 25, 25]], outline: [25, 25, 25] }],
    ['orange, cadre bleu', { fill: [[250, 150, 50], [190, 55, 20]], frame: [120, 150, 190], bar: [210, 220, 230] }], ['carte décalée vers le haut, flou', { dy: -0.018, blur: 2 }], ['décalée vers le bas', { dy: 0.015 }]]) {
    for (const k of ['star', 'shield', 'chevron']) {
      const sig = sigOf(SH[k], o); assert.ok(sig, `${name} · ${k} : symbole trouvé`);
      const rk = rank(sig); assert.equal(rk[0][0], k, `${name} · ${k} : le plus proche ${JSON.stringify(rk.slice(0, 3))}`);
      assert.ok(rk[0][1] < SYM_MAX, `${name} · ${k} : assez proche (${rk[0][1].toFixed(3)})`);
    }
  }
});

test('symCut : symbole en deux morceaux, anneau, ligne de type longue, pas de symbole', () => {
  const bars = sigOf(SH.bars, { aspect: 1.4 }); assert.ok(bars && Math.abs(bars.a - 1.4) < 0.25, 'les deux barres gardées ensemble : ' + (bars && bars.a));
  assert.equal(rank(bars)[0][0], 'bars');
  const ring = sigOf(SH.ring); assert.ok(symDist(ring, REFS.ring) < 0.15, 'anneau argent : silhouette pleine');
  assert.equal(rank(sigOf(SH.star, { typeEnd: 0.84 }))[0][0], 'star', 'texte du type jusqu\'à 0,84 de la largeur : écarté');
  assert.equal(sigOf(null), null, 'pas de symbole (Alpha, Beta…) : rien');
  assert.equal(sigOf(null, { typeEnd: 0.85 }), null, 'pas de symbole, texte du type très long : ses lettres ne sont pas prises pour un symbole');
  const z = zone(SH.star); for (let i = 0; i < z.w * z.h; i++) z.d[i * 4] = z.d[i * 4 + 1] = z.d[i * 4 + 2] = 128;      // zone uniforme
  assert.equal(symCut(z.d, z.w, z.h), null, 'zone uniforme : rien');
});

test('symRank : sûr, presque pareils (les autres écartés), trop loin, référence manquante', () => {
  const s = sigOf(SH.shield), all = Object.entries(REFS).map(([k, v]) => ({ k, s: v }));
  const r = symRank(s, all); assert.equal(r.k, 'shield'); assert.ok(r.d2 >= r.d1 * SYM_RATIO && r.d2 - r.d1 >= SYM_GAP);
  const twin = symRank(s, [...all, { k: 'shield2', s: REFS.shield }]); assert.equal(twin.k, undefined, 'deux symboles pareils : aucun choisi');
  assert.ok(twin.near.includes('shield') && twin.near.includes('shield2') && !twin.near.includes('star') && !twin.near.includes('chevron'), 'le choix se fait entre eux (et ce qui leur ressemble), les autres écartés : ' + twin.near);
  assert.equal(symRank(s, [{ k: 'a', s: REFS.star }, { k: 'b', s: REFS.chevron }]).k, undefined, 'rien d\'assez proche : rien');
  assert.equal(symRank(s, [...all, { k: 'x', s: null }]).k, undefined, 'un symbole candidat non lu : rien (le bon est peut-être celui-là)');
  assert.equal(symRank(null, all).k, undefined); assert.equal(symRank(s, [all[1]]).k, undefined, 'un seul candidat : rien à départager');
});

test('symSvgSized : largeur et hauteur posées d\'après la viewBox', () => {
  const a = symSvgSized('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 16" width="1em"><path d="M0 0h32v16z"/></svg>', 96);
  assert.equal(a.w, 96); assert.equal(a.h, 48); assert.match(a.t, /^<svg width="96" height="48" xmlns=/); assert.ok(!/1em/.test(a.t)); assert.match(a.t, /<path d="M0 0h32v16z"\/><\/svg>$/);
  const b = symSvgSized("<?xml version='1.0'?>\n<svg width='20' height='40'><g/></svg>", 96);
  assert.equal(b.w, 48); assert.equal(b.h, 96); assert.match(b.t, /viewBox="0 0 20 40"/); assert.match(b.t, /xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
  assert.equal(symSvgSized('<html></html>', 96), null); assert.equal(symSvgSized('<svg viewBox="0 0 0 0"/>', 96), null);
});
