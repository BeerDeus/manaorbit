#!/usr/bin/env node
/* gen-event-badges.mjs : badges des événements saisonniers (src/evpacks.js), un SVG par palier : pwa/icons/events/badges/<édition>-<palier>.svg.
   Chaque badge : médaillon (cadre du palier : bronze, argent, or, puis cadre « ultime » aux couleurs de la fête), un fond fixe par fête (dessiné ici)
   qui s'enrichit palier après palier (calques ajoutés, comme les glyphes de badgeart.js),
   et devant, l'année dans la police de l'événement (pack.font), en tracés SVG pleins (jamais de <text> ni de police web) : les chiffres 0–9 de chaque
   police sont décrits ici par leur squelette (traits), épaissis à la plume (contraste plein / délié, terminaisons), puis habillés (coulures, glaçons…).
   SVG autonomes (ni script, ni style, ni adresse externe), viewBox 96 × 96, ids préfixés par l'édition et le palier, sortie déterministe.
   Sans dépendance (node:fs, node:path, node:module, node:url). Lancé chaque jour par .github/workflows/event-badges.yml.
     node tools/gen-event-badges.mjs                  éditions en cours ou qui commencent dans les 7 jours, fichiers manquants, packs « ready »
     node tools/gen-event-badges.mjs --year 2026      toutes les éditions de 2026 (packs « ready » ; --all : tous) ; --pack halloween : ce pack
     --force (réécrit les fichiers présents) · --out <dossier> · --today AAAA-MM-JJ (tests) */
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const EV = require('../src/evpacks.js');
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const OUT_DIR = join(ROOT, 'pwa/icons/events/badges');
export const LEAD_DAYS = 7;      // génération jusqu'à 7 jours avant le début

/* ── Nombres et chemins ─────────────────────────────────────────────────────────────────────────────────────────── */
const r1 = v => Math.round(v * 10) / 10;
/** Nombre court : 1 décimale, sans zéro inutile (0.5 → .5, -0.5 → -.5). */
const n1 = v => { const r = r1(v); return (Object.is(r, -0) ? 0 : r).toString().replace(/^(-?)0\./, '$1.'); };
/** Suite de nombres SVG : séparateur omis devant un signe moins. */
const nums = a => a.map(n1).reduce((s, x, i) => s + (i && x[0] !== '-' ? ' ' : '') + x, '');
const D2R = Math.PI / 180;
const pol = (r, a, cx = 48, cy = 48) => [cx + r * Math.cos(a * D2R), cy + r * Math.sin(a * D2R)];
/** Polygone fermé → chemin compact (premier point absolu, puis relatif ; deltas calculés sur les valeurs arrondies : aucun cumul d'erreur). */
function polyD(pts) {
  const q = pts.map(([x, y]) => [r1(x), r1(y)]).filter((p, i, a) => !i || p[0] !== a[i - 1][0] || p[1] !== a[i - 1][1]);
  if (q.length > 1 && q[0][0] === q[q.length - 1][0] && q[0][1] === q[q.length - 1][1]) q.pop();
  if (q.length < 3) return '';
  let s = 'M' + nums(q[0]) + 'l';
  for (let i = 1; i < q.length; i++) s += nums([q[i][0] - q[i - 1][0], q[i][1] - q[i - 1][1]]).replace(/^(?=\d|\.)/, i > 1 ? ' ' : '');
  return s + 'z';
}
/** Polyligne ouverte → chemin compact. */
function lineD(pts) {
  const q = pts.map(([x, y]) => [r1(x), r1(y)]);
  let s = 'M' + nums(q[0]) + 'l';
  for (let i = 1; i < q.length; i++) s += nums([q[i][0] - q[i - 1][0], q[i][1] - q[i - 1][1]]).replace(/^(?=\d|\.)/, i > 1 ? ' ' : '');
  return s;
}
/** Chemin absolu (M L Q C Z) → relatif compact, sur les valeurs arrondies (aucun cumul d'erreur). */
function rel(d) {
  const tk = d.match(/[MLQCZ]|-?\d*\.?\d+(?:e-?\d+)?/gi); let i = 0, cmd = '', out = '', cx = 0, cy = 0, sx = 0, sy = 0, last = '';
  while (i < tk.length) {
    if (/[A-Z]/i.test(tk[i])) cmd = tk[i++].toUpperCase();
    if (cmd === 'Z') { out += 'z'; cx = sx; cy = sy; last = ''; continue; }
    const n = { M: 1, L: 1, Q: 2, C: 3 }[cmd], v = [];
    for (let k = 0; k < n; k++) { const x = r1(+tk[i]), y = r1(+tk[i + 1]); i += 2; v.push(x, y); }
    const ex = v[v.length - 2], ey = v[v.length - 1];
    if (cmd === 'M') { last = out ? 'l' : ''; out += (out ? 'm' + nums([ex - cx, ey - cy]) : 'M' + nums([ex, ey])); sx = ex; sy = ey; cmd = 'L'; }      // après « m », des paires implicites sont des « l » ; après « M », des « L »
    else {
      const c = cmd.toLowerCase(), s = nums(v.map((q, k) => q - (k % 2 ? cy : cx)));
      out += (last === c ? (s[0] === '-' ? '' : ' ') : c) + s; last = c;
    }
    cx = ex; cy = ey;
  }
  return out;
}
/** Ramer–Douglas–Peucker (polyligne ouverte). */
function rdp(pts, eps) {
  if (pts.length < 3) return pts;
  const [a, b] = [pts[0], pts[pts.length - 1]], dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1e-9;
  let im = 0, dm = -1;
  for (let i = 1; i < pts.length - 1; i++) { const d = Math.abs((pts[i][0] - a[0]) * dy - (pts[i][1] - a[1]) * dx) / L; if (d > dm) { dm = d; im = i; } }
  if (dm <= eps) return [a, b];
  return [...rdp(pts.slice(0, im + 1), eps).slice(0, -1), ...rdp(pts.slice(im), eps)];
}
/** RDP d'un polygone fermé : coupé au point le plus loin du premier, chaque moitié simplifiée. */
function simplify(pts, eps) {
  if (pts.length < 4) return pts;
  let im = 1, dm = -1; for (let i = 1; i < pts.length; i++) { const d = Math.hypot(pts[i][0] - pts[0][0], pts[i][1] - pts[0][1]); if (d > dm) { dm = d; im = i; } }
  return [...rdp(pts.slice(0, im + 1), eps).slice(0, -1), ...rdp([...pts.slice(im), pts[0]], eps).slice(0, -1)];
}
const area = pts => { let s = 0; for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; s += p[0] * q[1] - q[0] * p[1]; } return s / 2; };
/** Étincelle à 4 branches (comme badgeart.js › bdgStar). */
function spark(x, y, r) { const q = r * 0.22; return `M${nums([x, y - r])}Q${nums([x + q, y - q, x + r, y])}Q${nums([x + q, y + q, x, y + r])}Q${nums([x - q, y + q, x - r, y])}Q${nums([x - q, y - q, x, y - r])}Z`; }
/** Étoile à n branches. */
function star(x, y, r, n = 5, k = 0.45, rot = -90) { const p = []; for (let i = 0; i < 2 * n; i++) p.push(pol(i % 2 ? r * k : r, rot + i * 180 / n, x, y)); return polyD(p); }
/** Générateur pseudo-aléatoire déterministe (mulberry32). */
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

/* ── Squelettes des chiffres ────────────────────────────────────────────────────────────────────────────────────────
   Chaque chiffre : liste de traits (chemins absolus M L C Z, ou « E cx cy rx ry » : ellipse fermée) dans une boîte de largeur W et de hauteur 100
   (0 en haut, 100 sur la ligne de base). Le trait suit le milieu du plein ; la plume l'épaissit (FONTS). */
/** Gothique (spooky) : courbes brisées en facettes, façon Fraktur. W 56. */
const GOTH = {
  0: ['M18 8L39 8L51 21L51 79L40 92L17 92L5 79L5 21Z'],
  1: ['M12 26L30 8', 'M30 8L30 84L40 93'],
  2: ['M6 25L18 8L39 8L50 20L50 38L9 91', 'M6 91L49 91L55 84'],
  3: ['M6 18L18 8L39 8L49 18L49 35L39 45L22 45', 'M36 45L51 57L51 79L40 92L17 92L4 81'],
  4: ['M38 8L38 95', 'M38 10L5 66L55 66'],
  5: ['M50 8L15 8L11 46L38 41L50 53L50 80L39 92L16 92L4 82'],
  6: ['M48 13L38 7L18 8L6 22L6 78L17 92L40 92L51 80L51 58L40 46L18 46L6 57'],
  7: ['M4 8L52 8L26 94', 'M17 52L45 52'],
  8: ['M18 8L39 8L48 18L48 35L39 46L18 46L9 35L9 18Z', 'M16 46L41 46L51 58L51 80L40 92L16 92L5 80L5 58Z'],
};
/** Linéale ronde (frost, bloom ; base de arcane). W 60. */
const SANS = {
  0: ['E30 50 20.5 41'],
  1: ['M33 9L33 91', 'M13 25L33 9'],
  2: ['M11 27C11 14 20 8 30 8C41 8 50 15 50 27C50 41 38 52 11 91', 'M10 91L52 91'],
  3: ['M10 18C15 11 22 8 30 8C42 8 49 15 49 26C49 38 40 46 27 46', 'M27 46C42 46 51 55 51 68C51 83 42 92 30 92C21 92 13 89 8 81'],
  4: ['M41 91L41 9', 'M40 10L8 66L55 66'],
  5: ['M49 9L17 9L13 45C18 41 24 40 30 40C43 40 51 50 51 64C51 81 41 92 29 92C20 92 13 88 8 81'],
  6: ['M46 14C42 10 37 8 31 8C17 8 10 24 10 52C10 79 18 92 31 92C43 92 51 83 51 68C51 54 43 46 31 46C21 46 13 52 10 61'],
  7: ['M8 9L52 9', 'M51 10C38 31 29 58 26 91'],
  8: ['E30 28 17 19', 'E30 70 20 21.5'],
};
/** Art déco (gala) : étroit, géométrique, fort contraste vertical. W 50. */
const DECO = {
  0: ['E25 50 15.5 41.5'],
  1: ['M25 8L25 92', 'M13 19L25 8'],
  2: ['M9 26C9 17.2 16.2 9 25 9C33.8 9 41 17.2 41 26C41 38 30 50 10 92', 'M9 91L43 91'],
  3: ['M9 9L41 9', 'M40 10L21 42', 'M21 42C34 40 42 50 42 66C42 82 34 92 25 92C18 92 12 89 8 83'],
  4: ['M34 92L34 8', 'M34 9L6 64L45 64'],
  5: ['M40 9L14 9', 'M14 9L12 45', 'M12 44C16 42 20 41 25 41C35 41 42 52 42 66C42 82 34 92 25 92C18 92 12 89 8 83'],
  6: ['M36 8L13 54', 'E25 71 16 21'],
  7: ['M7 9L43 9', 'M42 10L20 92'],
  8: ['E25 29 13 19.5', 'E25 71 16.5 21'],
};
/** Romain (arcane) : linéale + empattements (pied du 1 et du 4), terminaisons en coin. */
const ROMAN = { ...SANS, 1: ['M33 9L33 91', 'M13 25L33 9', 'M17 91L49 91'], 4: ['M41 91L41 9', 'M40 10L8 66L55 66', 'M29 91L53 91'], 7: ['M9 9L52 9', 'M51 10C38 31 29 58 26 91', 'M7 9L7 18'] };

/** Parcours d'un trait : { pts (points du milieu, échantillonnés), closed }. */
function parseStroke(s, map) {
  const tk = s.match(/[A-Za-z]|-?\d*\.?\d+/g), out = []; let i = 0, cmd = null, closed = false;
  const P = (x, y) => map([+x, +y]);
  if (tk[0] === 'E') {
    const [cx, cy, rx, ry] = tk.slice(1, 5).map(Number), k = 0.5523;
    const c = [[cx, cy - ry], [cx + k * rx, cy - ry], [cx + rx, cy - k * ry], [cx + rx, cy], [cx + rx, cy + k * ry], [cx + k * rx, cy + ry], [cx, cy + ry], [cx - k * rx, cy + ry], [cx - rx, cy + k * ry], [cx - rx, cy], [cx - rx, cy - k * ry], [cx - k * rx, cy - ry], [cx, cy - ry]];
    out.push({ t: 'M', p: [P(...c[0])] }); for (let j = 1; j < 13; j += 3) out.push({ t: 'C', p: [P(...c[j]), P(...c[j + 1]), P(...c[j + 2])] });
    return { segs: out, closed: true };
  }
  while (i < tk.length) {
    if (/[A-Za-z]/.test(tk[i])) cmd = tk[i++];
    if (cmd === 'Z') { closed = true; continue; }
    const n = { M: 1, L: 1, C: 3 }[cmd], p = [];
    for (let k = 0; k < n; k++) { p.push(P(tk[i], tk[i + 1])); i += 2; }
    out.push({ t: cmd, p }); if (cmd === 'M') cmd = 'L';
  }
  return { segs: out, closed };
}
function sampleStroke(st, step) {
  let cur = null; const pts = [];
  const add = p => { if (!pts.length || Math.hypot(p[0] - pts[pts.length - 1][0], p[1] - pts[pts.length - 1][1]) > 1e-6) pts.push(p); };
  for (const g of st.segs) {
    if (g.t === 'M' || g.t === 'L') { add(g.p[0]); cur = g.p[0]; continue; }
    const [a, b, c] = g.p, L = Math.hypot(a[0] - cur[0], a[1] - cur[1]) + Math.hypot(b[0] - a[0], b[1] - a[1]) + Math.hypot(c[0] - b[0], c[1] - b[1]);
    const n = Math.max(2, Math.ceil(L / step));
    for (let k = 1; k <= n; k++) { const t = k / n, u = 1 - t; add([u * u * u * cur[0] + 3 * u * u * t * a[0] + 3 * u * t * t * b[0] + t * t * t * c[0], u * u * u * cur[1] + 3 * u * u * t * a[1] + 3 * u * t * t * b[1] + t * t * t * c[1]]); }
    cur = c;
  }
  if (st.closed && pts.length > 2 && Math.hypot(pts[0][0] - pts[pts.length - 1][0], pts[0][1] - pts[pts.length - 1][1]) < 1e-6) pts.pop();
  return { pts, closed: st.closed };
}

/* ── Plume : du squelette au contour plein ──────────────────────────────────────────────────────────────────────────
   Largeur selon la direction du trait (plume large tenue à l'angle a : délié dans le sens de la plume, plein en travers), modulée près des bouts
   (coin des empattements runiques), jointures en onglet (intersection exacte des deux bords décalés), terminaisons : butt, round, nib (coupe à l'angle
   de la plume), wedge (évasée puis coupée). Trait fermé : deux anneaux (extérieur et contre-forme). */
const norm = v => { const l = Math.hypot(v[0], v[1]) || 1e-9; return [v[0] / l, v[1] / l]; };
function outline(sk, F) {
  const { pts, closed } = sk, n = pts.length, u = [Math.cos(F.pen.a * D2R), Math.sin(F.pen.a * D2R)];
  const wDir = d => F.pen.min + (F.pen.max - F.pen.min) * Math.abs(u[0] * d[1] - u[1] * d[0]);
  const segN = closed ? n : n - 1, D = [], S = [0];
  for (let i = 0; i < segN; i++) { const a = pts[i], b = pts[(i + 1) % n]; D.push(norm([b[0] - a[0], b[1] - a[1]])); S.push(S[i] + Math.hypot(b[0] - a[0], b[1] - a[1])); }
  const len = S[segN], mod = i => {
    if (closed || !F.flare) return 1;
    const s = S[i], e = len - s, f = x => Math.max(0, 1 - x / F.flare[1]) ** 2;
    return 1 + F.flare[0] * (f(s) + f(e));
  };
  const off = (p, d1, d2, w1, w2, side) => {
    const a = [p[0] - side * w1 / 2 * d1[1], p[1] + side * w1 / 2 * d1[0]], b = [p[0] - side * w2 / 2 * d2[1], p[1] + side * w2 / 2 * d2[0]];
    const cr = d1[0] * d2[1] - d1[1] * d2[0];
    if (Math.abs(cr) < 0.02) return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const s = ((b[0] - a[0]) * d2[1] - (b[1] - a[1]) * d2[0]) / cr, q = [a[0] + s * d1[0], a[1] + s * d1[1]];
    const lim = Math.max(w1, w2) * 1.5, dq = Math.hypot(q[0] - p[0], q[1] - p[1]);
    return dq > lim ? [p[0] + (q[0] - p[0]) * lim / dq, p[1] + (q[1] - p[1]) * lim / dq] : q;
  };
  const L = [], R = [];
  for (let i = 0; i < n; i++) {
    if (!closed && (i === 0 || i === n - 1)) {
      const d = i ? D[segN - 1] : D[0], w = wDir(d) * mod(i), nn = [-d[1], d[0]];
      if (F.cap === 'nib' || F.cap === 'wedge') {
        // coupe le long de la plume : décalage le long du trait (borné ; plume presque dans l'axe du trait : coupe droite)
        const k = u[0] * nn[0] + u[1] * nn[1], ut = u[0] * d[0] + u[1] * d[1], sh = Math.abs(k) < 0.25 ? 0 : Math.max(-w * 0.9, Math.min(w * 0.9, w / 2 * ut / k));
        L.push([pts[i][0] + w / 2 * nn[0] + sh * d[0], pts[i][1] + w / 2 * nn[1] + sh * d[1]]); R.push([pts[i][0] - w / 2 * nn[0] - sh * d[0], pts[i][1] - w / 2 * nn[1] - sh * d[1]]);
      } else { L.push([pts[i][0] + w / 2 * nn[0], pts[i][1] + w / 2 * nn[1]]); R.push([pts[i][0] - w / 2 * nn[0], pts[i][1] - w / 2 * nn[1]]); }
      continue;
    }
    const d1 = D[(i - 1 + segN) % segN], d2 = D[i % segN], m = mod(i), w1 = wDir(d1) * m, w2 = wDir(d2) * m;
    L.push(off(pts[i], d1, d2, w1, w2, 1)); R.push(off(pts[i], d1, d2, w1, w2, -1));
  }
  if (closed) { const [a, b] = Math.abs(area(L)) > Math.abs(area(R)) ? [L, R] : [R, L]; return [{ pts: a, hole: false }, { pts: b, hole: true }]; }
  const arc = (p, d, w, end) => {
    const nn = [-d[1], d[0]], o = []; if (F.cap !== 'round') return o;
    for (let k = 1; k < 6; k++) { const f = k / 6 * Math.PI, c = Math.cos(f), s = Math.sin(f); o.push(end ? [p[0] + w / 2 * (c * nn[0] + s * d[0]), p[1] + w / 2 * (c * nn[1] + s * d[1])] : [p[0] + w / 2 * (-c * nn[0] - s * d[0]), p[1] + w / 2 * (-c * nn[1] - s * d[1])]); }
    return o;
  };
  return [{ pts: [...L, ...arc(pts[n - 1], D[segN - 1], wDir(D[segN - 1]) * mod(n - 1), true), ...R.reverse(), ...arc(pts[0], D[0], wDir(D[0]) * mod(0), false)], hole: false }];
}
/** Coulure (spooky) ou glaçon (frost) accroché sous un trait : [x, y de départ, longueur]. */
function hanger(kind, [x, y, l]) {
  if (kind === 'icicle') return [[x - 3.4, y], [x - 1.4, y + l * 0.55], [x, y + l], [x + 1.4, y + l * 0.55], [x + 3.4, y]];
  const rd = 3.9, c = [x, y + l], o = [[x - 3.6, y], [x - 2.1, y + l * 0.45]];
  for (let k = 0; k <= 10; k++) { const f = (205 - k * 23) * D2R; o.push([c[0] + rd * Math.cos(f), c[1] + rd * Math.sin(f)]); }
  return [...o, [x + 2.1, y + l * 0.45], [x + 3.6, y]];
}

/* ── Polices ────────────────────────────────────────────────────────────────────────────────────────────────────────
   sk squelettes, W largeur de la boîte, sx étirement horizontal, pen { a angle de la plume, max plein, min délié }, cap terminaisons, flare [ampleur,
   longueur] (coin aux bouts), jitter (tremblé), hang + hangs (coulures / glaçons par chiffre), h hauteur des chiffres dans le badge, gap espace entre
   chiffres (unités du glyphe), fill (dégradé de haut en bas), ink (contour), inline (filet clair dans les pleins). */
const FONTS = {
  spooky: { sk: GOTH, W: 56, pen: { a: 42, max: 19, min: 6.5 }, cap: 'nib', jitter: 1.15, hang: 'drip', h: 23, gap: 9,
    hangs: { 0: [[34, 95, 9]], 1: [[33, 91, 11]], 2: [[15, 94, 7], [38, 94, 12]], 3: [[25, 95, 11]], 4: [[38, 94, 8], [13, 70, 7]], 5: [[29, 95, 12]], 6: [[23, 95, 8], [41, 94, 5]], 7: [[26, 93, 9], [39, 55, 6]], 8: [[34, 95, 11]], 9: [[13, 88, 9], [33, 65, 6]] },
    fill: [['0', '#fff1a0'], ['.45', '#ff9d1f'], ['1', '#c23a00']], ink: '#1a0b2e' },
  frost: { sk: SANS, W: 60, pen: { a: 0, max: 14, min: 11 }, cap: 'butt', hang: 'icicle', h: 22, gap: 9,
    hangs: { 0: [[22, 95, 8], [36, 96, 5]], 1: [[33, 94, 8]], 2: [[20, 95, 6], [42, 95, 9]], 3: [[26, 96, 8]], 4: [[41, 93, 7], [17, 70, 6], [50, 70, 5]], 5: [[25, 96, 8]], 6: [[27, 96, 8]], 7: [[27, 93, 8]], 8: [[24, 96, 7], [37, 96, 5]], 9: [[24, 96, 7]] },
    fill: [['0', '#ffffff'], ['.45', '#e3f4ff'], ['.8', '#9fd2ff'], ['1', '#5ea4e8']], ink: '#0c2747' },
  gala: { sk: DECO, W: 50, pen: { a: 0, max: 15.5, min: 5.6 }, cap: 'nib', h: 24, gap: 8, inline: 0.55,
    fill: [['0', '#fff7cf'], ['.3', '#f6d25c'], ['.52', '#c98a14'], ['.56', '#ffe58a'], ['.8', '#e2a92a'], ['1', '#8f5e06']], ink: '#0b0d24' },
  bloom: { sk: SANS, W: 60, sx: 1.1, pen: { a: 0, max: 17, min: 17 }, cap: 'round', h: 22, gap: 6,
    fill: [['0', '#fff2f8'], ['.45', '#ffb8d6'], ['1', '#f17aaf']], ink: '#4a2240' },
  arcane: { sk: ROMAN, W: 60, pen: { a: 28, max: 16, min: 5 }, cap: 'wedge', flare: [0.85, 9], h: 23, gap: 8,
    fill: [['0', '#f4f8ff'], ['.4', '#a9cbff'], ['.75', '#5f86ea'], ['1', '#3b3fa8']], ink: '#0e1033' },
};
for (const F of Object.values(FONTS)) if (!F.sk[9]) F.sk = { ...F.sk, 9: F.sk[6].map(s => ({ rot: s })) };
const FONT_IDS = Object.keys(FONTS);

const GL = new Map();
/** Glyphe d'un chiffre : { polys: [{ pts, hole }], skel (traits du milieu), W } en unités du glyphe (hauteur 100). */
function glyph(font, digit) {
  const key = font + digit; if (GL.has(key)) return GL.get(key);
  const F = FONTS[font] || FONTS.arcane, sx = F.sx || 1, W = F.W * sx, polys = [], skel = [];
  for (const s of F.sk[digit]) {
    const rot = typeof s === 'object', map = rot ? ([x, y]) => [(F.W - x) * sx, 100 - y] : ([x, y]) => [x * sx, y];
    const sk = sampleStroke(parseStroke(rot ? s.rot : s, map), 7);
    skel.push(sk); polys.push(...outline(sk, F));
  }
  for (const h of (F.hangs && F.hangs[digit]) || []) polys.push({ pts: hanger(F.hang, [h[0] * sx, h[1], h[2]]), hole: false });
  if (F.jitter) {
    const A = F.jitter, ph = digit * 1.7;
    for (const p of polys) p.pts = p.pts.map(([x, y]) => [x + A * Math.sin(y * 0.31 + x * 0.07 + ph) * 0.8, y + A * Math.sin(x * 0.27 - y * 0.05 + ph * 0.6)]);
  }
  for (const p of polys) if ((area(p.pts) > 0) !== p.hole) p.pts.reverse();      // pleins dans un sens, contre-formes dans l'autre (règle nonzero)
  const g = { polys, skel, W };
  GL.set(key, g); return g;
}
/** Contour d'un chiffre dans une police, en unités du glyphe (hauteur 100) : attribut d d'un <path>. */
export function glyphPath(font, digit) {
  if (!FONTS[font] || !/^\d$/.test(String(digit))) return '';
  return glyph(font, +digit).polys.map(p => polyD(p.pts)).join('');
}
/** Profils gauche et droit d'un glyphe par tranches de 2 unités (crénage). */
function profile(g) {
  const Lp = new Map(), Rp = new Map();
  for (const { pts } of g.polys) for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length], n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1])));
    for (let k = 0; k <= n; k++) {
      const x = a[0] + (b[0] - a[0]) * k / n, y = a[1] + (b[1] - a[1]) * k / n, j = Math.floor(y / 2);
      if (!Lp.has(j) || x < Lp.get(j)) Lp.set(j, x); if (!Rp.has(j) || x > Rp.get(j)) Rp.set(j, x);
    }
  }
  return { Lp, Rp, minX: Math.min(...Lp.values()), maxX: Math.max(...Rp.values()) };
}
/** Année posée : chiffres placés au plus près (profils, écart gap), sans s'emboîter de plus de 8 unités ; puis mise à l'échelle et centrée sur (cx, cy). */
function yearLayout(font, year, cx, cy, maxW) {
  const F = FONTS[font] || FONTS.arcane, ds = String(year).split('').map(Number), out = [];
  let prev = null, x0 = 0;
  for (const d of ds) {
    const g = glyph(font, d), pr = profile(g);
    let ox = -pr.minX;
    if (prev) {
      let need = -Infinity;
      for (const [j, lx] of pr.Lp) { let rx = -Infinity; for (const k of [j - 1, j, j + 1]) if (prev.pr.Rp.has(k)) rx = Math.max(rx, prev.pr.Rp.get(k)); if (rx > -Infinity) need = Math.max(need, prev.ox + rx + F.gap - lx); }
      ox = Math.max(need, prev.ox + prev.pr.maxX - 8 - pr.minX);
    }
    out.push({ g, ox }); prev = { pr, ox }; x0 = Math.max(x0, ox + pr.maxX);
  }
  const xa = Math.min(...out.map(o => o.ox + profile(o.g).minX)), wid = x0 - xa;
  const s = Math.min(F.h / 100, maxW / wid), tx = cx - (xa + wid / 2) * s, ty = cy - 50 * s;
  const T = ([x, y], dx) => [tx + (x + dx) * s, ty + y * s];
  return { out, s, T, top: ty, bot: ty + 100 * s };
}

/* ── Fonds de fête (dans le disque du médaillon : centre 48 48, rayon 35.5) ─────────────────────────────────────────── */
const grad = (id, kind, attrs, stops) => `<${kind}Gradient id="${id}"${attrs ? ' ' + attrs : ''}>${stops.map(([o, c, a]) => `<stop${+o ? ` offset="${o}"` : ''} stop-color="${c}"${a != null ? ` stop-opacity="${a}"` : ''}/>`).join('')}</${kind}Gradient>`;
/** Points ronds [x, y, r] : sous-chemins de longueur nulle à bouts ronds (un trait par rayon), bien plus courts que des <circle>. */
const dots = (list, fill, op) => {
  const by = new Map(); for (const [x, y, r] of list) { const k = n1(Math.round(5 * r) / 2.5); by.set(k, (by.get(k) || '') + 'M' + nums([x, y]) + 'L' + nums([x, y])); }
  return [...by].map(([w, d]) => `<path d="${d}" stroke="${fill}" stroke-width="${w}"${op ? ` opacity="${op}"` : ''}/>`).join('');
};
const BAT = 'M0-2.2L.8-3.4 1.1-1.6C2.6-2.7 5-3.7 8.6-3.3 7.4-2.2 7.2-1 7.3.2 6-.6 4.4-.4 3.6.8 2.8 0 1.4.2.6 1.8L0 2.6-.6 1.8C-1.4.2-2.8 0-3.6.8-4.4-.4-6-.6-7.3.2-7.2-1-7.4-2.2-8.6-3.3-5-3.7-2.6-2.7-1.1-1.6L-.8-3.4Z';
/* Chaque fond s'enrichit palier après palier (comme les calques des glyphes de badgeart.js) : t = palier, 0 (1er objet) à 3 (grade ultime). */
const ifT = (c, s) => (c ? s : '');
const SCENES = {
  halloween(P, t) {
    // 0 : petite citrouille seule sous la lune · 1 : sculptée et allumée, une chauve-souris · 2 : lune plus grande, toiles, chauves-souris, autres citrouilles,
    // tombes · 3 : citrouille géante dans les flammes, chapeau de sorcière, braises, lueurs violettes et orange
    const lit = t >= 1;
    const face = `<path d="M-7.6-2.4l4.4-.9-1.6 4.1zM7.6-2.4l-4.4-.9 1.6 4.1zM-1.2 1.2h2.4L0 3.2zM-8.2 3.6q8.2 4.6 16.4 0-1 5.3-8.2 5.7-7.2-.4-8.2-5.7z" fill="url(#${P}fa)" stroke="#7a2c00" stroke-width=".45"/>`;
    const defs = grad(P + 'bg', 'radial', 'cx=".64" cy=".28" r=".85"', [[0, '#8a55e0'], ['.42', '#3d1a72'], [1, '#100620']])
      + grad(P + 'mo', 'radial', 'cx=".4" cy=".35" r=".7"', [['.2', '#fffbe6'], [1, '#f0c25a']])
      + grad(P + 'pk', 'radial', 'cx=".38" cy=".3" r=".8"', [[0, '#ffc46e'], ['.5', '#ff8a1f'], [1, '#c24a06']])
      + ifT(lit, grad(P + 'gl', 'radial', '', [[0, '#ff9a2e', '.75'], [1, '#ff7a1a', 0]]) + grad(P + 'fa', 'radial', 'cx=".5" cy=".6" r=".6"', [['.15', '#fffbd0'], [1, '#ffa21f']]) + `<path id="${P}bat" d="${BAT}"/>`)
      + `<g id="${P}pu" stroke="#6e2600" stroke-width=".6"><g fill="url(#${P}pk)"><ellipse cx="-7.6" cy="1" rx="6.2" ry="8.6"/><ellipse cx="7.6" cy="1" rx="6.2" ry="8.6"/><ellipse cx="-3.8" cy=".2" rx="6.6" ry="9.6"/><ellipse cx="3.8" cy=".2" rx="6.6" ry="9.6"/><ellipse cx="0" cy="0" rx="5.6" ry="10"/></g>`
      + `<path d="M-1.2-9.4c0-2.2.7-3.8 2.4-5l1.2 1c-1.2 1-1.5 2.4-1.3 4z" fill="#5b8a2c" stroke="#26420f"/>${ifT(lit, face)}</g>`;
    const mr = [6.5, 8, 9.5, 10.5][t], [hx, hy, hs] = [[46, 38, 0.72], [45, 34, 1], [45, 34, 1], [46, 37, 1.08]][t];
    const bats = [[67, 25, 0.62, 8], [25, 31, 0.5, -14], [33, 20, 0.36, 10], [79, 41, 0.34, -6]].slice(0, [0, 1, 3, 3][t]);
    const web = (() => {
      const c = [19, 19], A = [12, 50, 92]; let s = '';
      for (const a of A) s += `M${nums(c)}L${nums(pol(30, a, ...c))}`;
      for (const r of [8, 16]) A.forEach((a, k) => { const p = pol(r, a, ...c); s += k ? 'Q' + nums([...pol(r * 0.8, (a + A[k - 1]) / 2, ...c), ...p]) : 'M' + nums(p); });
      return `<path d="${s}" fill="none" stroke="#e6dcff" stroke-width=".5" opacity=".5"/>`;
    })();
    const body = `<rect x="12" y="12" width="72" height="72" fill="url(#${P}bg)"/>`
      + dots([[30, 41, 0.5], [53, 17, 0.5], [74, 44, 0.55], [22, 52, 0.4], [57, 44, 0.45], [79, 35, 0.4], [36, 16, 0.4]].slice(0, 3 + t), '#fff', '.8')
      + ifT(t === 3, `<circle cx="22" cy="60" r="22" fill="#9b4dff" opacity=".25"/><circle cx="76" cy="58" r="20" fill="#ff7a1a" opacity=".18"/>`)
      + ifT(lit, `<circle cx="66" cy="26" r="${n1(mr * 1.6)}" fill="#ffe9a0" opacity=".16"/>`) + `<circle cx="66" cy="26" r="${mr}" fill="url(#${P}mo)"/>`
      + ifT(t >= 2, `<path d="M62 22.8l0 0m6.5 6 0 0m-4.5 1 0 0" stroke="#e3b45a" stroke-width="2.6" opacity=".4"/>`)
      + ifT(t >= 2, web)
      + ifT(bats.length, `<g fill="#160a28">${bats.map(([x, y, s, r]) => `<use href="#${P}bat" transform="translate(${x} ${y}) scale(${n1(s)}) rotate(${r})"/>`).join('')}</g>`)
      + `<path d="M12 73Q24 64 37 70T62 68 84 66V84H12Z" fill="#241040"/>` + ifT(lit, `<path d="M12 78Q30 70 48 76T84 74V84H12Z" fill="#160a28"/>`)
      + ifT(t >= 2, `<path d="M20 74v-4.5a2.6 2.6 0 0 1 5.2 0V74ZM71 71v-5a3 3 0 0 1 6 0v5Z" fill="#2f1a50"/><use href="#${P}pu" transform="translate(25 43) scale(.42)"/><use href="#${P}pu" transform="translate(68 45) scale(.36)"/>`)
      + ifT(lit, `<circle cx="${hx}" cy="${hy}" r="${n1(17 * hs)}" fill="url(#${P}gl)"/>`)
      + ifT(t === 3, `<path d="M31 46C25 38 27 29 32 24 32 28 34 30 36 30 34 23 39 16 45 13 44 18 46 21 49 22 50 17 54 14 59 14 55 19 57 23 59 26 61 24 62 22 62 19 68 26 68 37 62 46Z" fill="url(#${P}fa)" stroke="#9b4dff" stroke-width="1.6"/>`)
      + `<use href="#${P}pu" transform="translate(${hx} ${hy})${hs !== 1 ? ` scale(${hs})` : ''}"/>`
      + ifT(t === 3, `<g transform="translate(${hx} ${hy}) scale(${hs}) rotate(-10)" stroke="#12051f" stroke-width=".5"><path d="M-6-9.6L-2-17.6q1.6-2.8 5-2.4l2 .6q-3-.2-3.6 2L6-9.6z" fill="#2a1048"/><path d="M-5.6-12h11.2l-.5 2.3H-5.1z" fill="#ff7a1a"/><path d="M-11-8.8q11-4.2 22 0-11 3.6-22 0z" fill="#3a1866"/></g>`
        + dots([[30, 22, 0.7], [62, 15, 0.6], [27, 34, 0.5], [66, 36, 0.7]], '#ffb02e'));
    return { defs, body };
  },
  noel(P, t) {
    // 0 : un cadeau · 1 : une pile de cadeaux, flocons · 2 : le sapin décoré et ses cadeaux · 3 : sapin illuminé (guirlande lumineuse, étoile qui rayonne), neige
    const defs = grad(P + 'bg', 'radial', 'cx=".5" cy=".3" r=".85"', [[0, '#3f78b4'], ['.5', '#173a68'], [1, '#081428']])
      + ifT(t >= 1, `<path id="${P}fl" d="M0-3V3M-2.6-1.5L2.6 1.5M-2.6 1.5L2.6-1.5M-.9-2.3L0-1.4.9-2.3M-.9 2.3L0 1.4.9 2.3" fill="none" stroke="#fff" stroke-width=".55"/>`)
      + ifT(t >= 2, grad(P + 'tr', 'linear', 'x1="0" y1="0" x2="1" y2="1"', [[0, t === 3 ? '#6be492' : '#56d27f'], ['.5', '#1f8a4c'], [1, '#0d4f2b']]))
      + ifT(t === 3, grad(P + 'st', 'radial', '', [[0, '#fff6c8', '.95'], [1, '#f4c542', 0]]));
    const gift = (x, y, w, h, c, r) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx=".8" fill="${c}" stroke="#3a0a10" stroke-width=".5"/><path d="M${n1(x + w / 2)} ${y}V${n1(y + h)}M${x} ${n1(y + h * 0.42)}H${n1(x + w)}" stroke="${r}" stroke-width="1.5"/>`
      + `<path d="M${n1(x + w / 2)} ${y}q-4.6-3.4-4.4-.2q2 .6 4.4.2q4.6-3.4 4.4-.2q-2 .6-4.4.2z" fill="${r}" stroke="#3a0a10" stroke-width=".4"/>`;
    const tiers = [[34, 44, 62, 26], [37, 36, 59, 20], [40, 28, 56, 14]];
    const tree = `<rect x="45.6" y="43" width="4.8" height="6" rx=".6" fill="#6b3f1f" stroke="#3a1f0c" stroke-width=".5"/>`
      + `<path d="${tiers.map(([x1, y1, x2, y0]) => `M48 ${y0 - 2}L${x2} ${y1}Q48 ${y1 + 3} ${x1} ${y1}Z`).join('')}" fill="url(#${P}tr)" stroke="#08361d" stroke-width="1.2" paint-order="stroke"/>`      // les trois étages : contour de l'ensemble seulement
      + `<path d="M39.5 40.5Q48 44 58 38.6M42 32.8Q49 35.6 56 30.6M44.2 25Q49 27 52.6 23.4" fill="none" stroke="#f4c542" stroke-width=".8"/>`
      + dots([[41, 41, 1.3], [53, 36.4, 1.2], [45, 31.6, 1.1], [50.6, 24.4, 1]], '#e23b3b') + dots([[56.5, 41.2, 1.2], [42.6, 34.2, 1], [47.2, 21.5, 0.9]], '#ffd84a');
    const flakes = [[24, 27, 1.1], [73, 31, 1.3], [68, 52, 0.8]].slice(0, t);
    const body = `<rect x="12" y="12" width="72" height="72" fill="url(#${P}bg)"/>`
      + dots([[22, 34, 0.7], [30, 22, 0.5], [70, 20, 0.6], [76, 40, 0.7], [64, 46, 0.5], [26, 50, 0.55], [17, 44, 0.45], [58, 16, 0.5], [80, 54, 0.5], [35, 46, 0.4], [62, 30, 0.5], [32, 38, 0.45]].slice(0, 4 + 2 * t + (t === 3 ? 2 : 0)), '#fff', '.85')
      + ifT(flakes.length, `<g opacity=".8">${flakes.map(([x, y, s]) => `<use href="#${P}fl" transform="translate(${x} ${y}) scale(${s})"/>`).join('')}</g>`)
      + `<path d="M12 70Q30 61 48 66T84 63V84H12Z" fill="#d6ebfb"/><path d="M12 76Q32 68 52 74T84 71V84H12Z" fill="#f4faff"/>`
      + [gift(40, 30, 16, 14, '#e23b3b', '#f4c542'),
        gift(31, 35, 14, 11, '#1f8a4c', '#f4c542') + gift(48, 33, 16, 13, '#e23b3b', '#f4c542') + gift(41.5, 24, 12, 10, '#f4c542', '#e23b3b'),
        tree + gift(27, 40, 11, 8, '#e23b3b', '#f4c542') + gift(58, 41, 10, 7, '#7b3fe4', '#fff'),
        `<circle cx="48" cy="30" r="20" fill="#ffd84a" opacity=".14"/>` + tree + gift(27, 40, 11, 8, '#e23b3b', '#f4c542') + gift(58, 41, 10, 7, '#7b3fe4', '#fff')
          + dots([[40.2, 38.6, 0.8], [49, 40.4, 0.8], [52.6, 32.2, 0.8], [46.4, 26.4, 0.8]], '#7fe0ff') + dots([[44.4, 40.4, 0.8], [57, 38.8, 0.8], [43.8, 33.6, 0.8], [51, 25.6, 0.8]], '#ff6fb0')][t]
      + (t >= 2 ? ifT(t === 3, `<circle cx="48" cy="11.5" r="9" fill="url(#${P}st)"/>`) + `<path d="${star(48, 12, t === 3 ? 5.2 : 4)}" fill="#ffd84a" stroke="#b07a00" stroke-width=".5"/>` : '')
      + ifT(t === 3, `<path d="${spark(30, 26, 2)}${spark(67, 22, 2.4)}" fill="#fff6c8"/>`);
    return { defs, body };
  },
  nouvelan(P, t) {
    // 0 : une fusée qui éclate · 1 : un grand bouquet doré · 2 : trois bouquets · 3 : feu d'artifice complet (halo, couronne de points, confettis, étincelles)
    const defs = grad(P + 'bg', 'radial', 'cx=".5" cy=".32" r=".85"', [[0, '#5146d8'], ['.5', '#211f78'], [1, '#090a22']])
      + ifT(t === 3, grad(P + 'gw', 'radial', '', [[0, '#fff0b0', '.7'], [1, '#f2c230', 0]]));
    const burst = (cx, cy, r, n, col, rot = 0) => {
      let d = ''; for (let k = 0; k < n; k++) { const a = rot + k * 360 / n; d += `M${nums(pol(r * 0.3, a, cx, cy))}L${nums(pol(r, a, cx, cy))}`; }
      for (let k = 0; k < n; k++) { const q = nums(pol(r * 1.17, rot + k * 360 / n, cx, cy)); d += `M${q}L${q}`; }      // l'étincelle au bout de chaque rayon (bout rond)
      return `<path d="${d}" fill="none" stroke="${col}" stroke-width="${n1(r * 0.11)}"/>`;
    };
    const ring = []; for (let k = 0; k < 14; k++) ring.push([...pol(18, k * 360 / 14 + 6, 48, 29), 0.6]);
    const body = `<rect x="12" y="12" width="72" height="72" fill="url(#${P}bg)"/>`
      + dots([[20, 46, 0.5], [76, 46, 0.55], [28, 18, 0.45], [70, 16, 0.5], [82, 34, 0.4], [16, 36, 0.4], [60, 48, 0.4], [36, 47, 0.4]].slice(0, 2 + 2 * t), '#fff', '.85')
      + ifT(t === 3, `<circle cx="48" cy="29" r="19" fill="url(#${P}gw)"/>`)
      + (t ? burst(48, 29, 14, 16, '#f2c230') + burst(48, 29, 8, 8, '#fff2b8', 22.5) : burst(48, 30, 9, 12, '#f2c230') + `<path d="M48 48L48 40" stroke="#f2c230" stroke-width=".6" opacity=".6" stroke-dasharray="1 1.5"/>`)
      + ifT(t >= 2, burst(27, 40, 7, 10, '#ff5fa2', 9) + burst(70, 40, 7.5, 12, '#7fd0ff', 4))
      + ifT(t === 3, dots(ring, '#ff9fd0') + dots([[22, 26, 0.6], [74, 26, 0.6], [35, 44, 0.5], [60, 45, 0.6]], '#7fffd0') + dots([[30, 20, 0.5], [66, 18, 0.6], [24, 50, 0.5], [72, 51, 0.5]], '#ff5fa2'))
      + `<path d="M12 84V70h5v-6h4v-3h3v9h3V58h2v-3h2v3h2v12h3v-8h5v8h2V63h4v-5h2v5h3v9h3v-12h5v-4h1v4h3v14h3v-6h5v6h4V84Z" fill="#0b0c26"/>`
      + ifT(t >= 1, `<path d="M29 61.6l0 0m8 4 0 0m13.6-4 0 0m14.6 3 0 0m7.8 2 0 0" stroke="#f2c230" stroke-width="1.1" opacity=".8"/>`)
      + ifT(t >= 2, `<path d="${spark(20, 26, 2.4)}${spark(76, 24, 2)}${t === 3 ? spark(48, 9.5, 2.6) + spark(31, 13, 1.6) : ''}" fill="#fff6cc"/>`);
    return { defs, body };
  },
  paques(P, t) {
    // 0 : un œuf tout simple dans l'herbe · 1 : œuf décoré, soleil · 2 : deux œufs, fleurs, nuage · 3 : œuf d'or serti, étincelles, plus de fleurs
    const gold = t === 3;
    const defs = grad(P + 'bg', 'linear', 'x1="0" y1="0" x2="0" y2="1"', [[0, '#8fd3ff'], ['.55', '#dff4ff'], [1, '#fff0f7']])
      + grad(P + 'eg', 'linear', 'x1=".2" y1="0" x2=".8" y2="1"', gold ? [[0, '#fff7c8'], ['.45', '#f2c230'], [1, '#a8700a']] : [[0, '#ffe3ef'], ['.5', '#ffaacf'], [1, '#e8689f']])
      + ifT(t >= 2, grad(P + 'e2', 'linear', 'x1=".2" y1="0" x2=".8" y2="1"', [[0, '#e9fff1'], [1, '#6cc08e']])
        + `<g id="${P}fw"><path d="M0-2.4a1.2 1.2 0 0 1 0 2.4 1.2 1.2 0 0 1 0-2.4zM2.3-.8a1.2 1.2 0 0 1-2.3.8 1.2 1.2 0 0 1 2.3-.8zM1.4 1.9a1.2 1.2 0 0 1-1.4-1.9 1.2 1.2 0 0 1 1.4 1.9zM-1.4 1.9a1.2 1.2 0 0 1 1.4-1.9 1.2 1.2 0 0 1-1.4 1.9zM-2.3-.8a1.2 1.2 0 0 1 2.3.8 1.2 1.2 0 0 1-2.3-.8z" fill="#fff" stroke="#e7a3c4" stroke-width=".3"/><circle r=".9" fill="#ffd36b"/></g>`);
    let rays = ''; for (let k = 0; k < 12; k++) { const a = k * 30; rays += `M${nums(pol(9.5, a, 68, 24))}L${nums(pol(12.5, a, 68, 24))}`; }
    const egg = (cx, cy, rx, ry) => `M${nums([cx, cy - ry])}C${nums([cx + rx * 0.7, cy - ry, cx + rx, cy - ry * 0.2, cx + rx, cy + ry * 0.25])}C${nums([cx + rx, cy + ry * 0.75, cx + rx * 0.55, cy + ry, cx, cy + ry])}C${nums([cx - rx * 0.55, cy + ry, cx - rx, cy + ry * 0.75, cx - rx, cy + ry * 0.25])}C${nums([cx - rx, cy - ry * 0.2, cx - rx * 0.7, cy - ry, cx, cy - ry])}Z`;
    let zig = 'M35.6 34.2'; for (let k = 0; k < 8; k++) zig += `L${n1(37 + k * 2.8)} ${k % 2 ? 34.2 : 31.6}`; zig += 'L58.4 34.2';
    const fw = (x, y, s) => `<use href="#${P}fw" transform="translate(${x} ${y})${s !== 1 ? ` scale(${s})` : ''}"/>`;
    const body = `<rect x="12" y="12" width="72" height="72" fill="url(#${P}bg)"/>`
      + ifT(t >= 1, `<path d="${rays}" stroke="#ffc94a" stroke-width="1.3"/><circle cx="68" cy="24" r="7.5" fill="#ffd95a" stroke="#f4b52a" stroke-width=".6"/>`)
      + ifT(t >= 2, `<path d="M18 30a3 3 0 0 1 4-3.4 4 4 0 0 1 7.4 1 2.6 2.6 0 0 1 .6 5H19a1.6 1.6 0 0 1-1-2.6z" fill="#fff" opacity=".95"/>`)
      + `<path d="M12 66Q32 54 52 62T84 58V84H12Z" fill="#a6e3bc"/><path d="M12 72Q34 63 54 70T84 67V84H12Z" fill="#74c793"/>`
      + ifT(t >= 2, `<path d="${egg(61, 47, 7, 9)}" fill="url(#${P}e2)" stroke="#3f8a5f" stroke-width=".6"/>`)
      + ifT(gold, `<circle cx="47" cy="35" r="17" fill="#fff3b0" opacity=".45"/>`)
      + (t ? `<path d="${egg(47, 35, 11.5, 14.5)}" fill="url(#${P}eg)" stroke="${gold ? '#8a5a00' : '#a03a6c'}" stroke-width=".7"/>`
        + `<path d="${zig}" fill="none" stroke="#fff" stroke-width="1.6"/><path d="M36.4 39.5h21.2" stroke="${gold ? '#e23b6b' : '#ffd36b'}" stroke-width="1.5"/>`
        + dots([[42, 26, 1.1], [50, 25, 1.2], [46, 44, 1.3], [40.6, 44.2, 0.9], [53, 43.6, 1.1]], gold ? '#7fd0ff' : '#fff')
        + `<path d="M41 24q2.4-3 5.6-3.6" fill="none" stroke="#fff" stroke-width="1" opacity=".85"/>`
        : `<path d="${egg(47, 38, 9, 11.5)}" fill="url(#${P}eg)" stroke="#a03a6c" stroke-width=".7"/><path d="M42.4 31q1.8-2.4 4.2-2.8" fill="none" stroke="#fff" stroke-width="1" opacity=".85"/>`)
      + `<path d="M36 49.4l1.4-3.6 1 3 1.4-3.8 1.2 3.4 1.6-3.2.8 4.2ZM52 50l1.2-3.6 1 3.4 1.6-3 1 3.2Z" fill="#5db57f"/>`
      + ifT(t >= 2, fw(24, 69, 1.1) + fw(73, 66, 1) + fw(31, 64, 0.75) + ifT(gold, fw(66, 74, 0.85) + fw(18, 62, 0.7)))
      + ifT(gold, `<path d="${spark(33, 25, 2.4)}${spark(58, 21, 1.8)}${spark(60, 33, 1.3)}" fill="#fff" stroke="#c9900a" stroke-width=".3"/>`);
    return { defs, body };
  },
  magic(P, t) {
    // 0 : une bougie · 1 : flamme qui rayonne, orbite et deux orbes de mana · 2 : les cinq orbes · 3 : gloire dorée derrière la bougie, orbes nimbés, étincelles
    const defs = grad(P + 'bg', 'radial', 'cx=".5" cy=".3" r=".85"', [[0, '#5258c4'], ['.5', '#23286a'], [1, '#0a0b20']])
      + grad(P + 'fl', 'radial', 'cx=".5" cy=".7" r=".6"', [[0, '#ffffff'], ['.4', '#fff2a8'], [1, '#ff9d3a']])
      + ifT(t >= 1, grad(P + 'gw', 'radial', '', [[0, '#ffe08a', '.7'], [1, '#f2c230', 0]]))
      + grad(P + 'cd', 'linear', 'x1="0" y1="0" x2="1" y2="0"', [[0, '#fff6e6'], ['.6', '#ffd9c2'], [1, '#e8a78a']]);
    const hl = [], orb = (a, col) => { const x = 48 + 24 * Math.cos(a * D2R), y = 34 + 8 * Math.sin(a * D2R); hl.push([x - 0.8, y - 0.9, 0.8]); return ifT(t === 3, `<circle cx="${n1(x)}" cy="${n1(y)}" r="4.4" fill="${col}" opacity=".3"/>`) + `<circle cx="${n1(x)}" cy="${n1(y)}" r="2.7" fill="${col}" stroke="#0a0b20" stroke-width=".5"/>`; };      // reflets : un seul chemin de points (hl)
    const back = [[200, '#2a1f33'], [250, '#f6efd0'], [300, '#3f9cff']].filter((o, k) => t >= 2 || k === 2), front = [[20, '#e8473a'], [120, '#2fae64']].filter((o, k) => t >= 2 || k === 0);
    let glory = ''; if (t === 3) for (let k = 0; k < 16; k++) { const a = k * 22.5 + 11; glory += `M${nums(pol(8, a, 48, 22))}L${nums(pol(k % 2 ? 17 : 22, a, 48, 22))}`; }
    const body = `<rect x="12" y="12" width="72" height="72" fill="url(#${P}bg)"/>`
      + dots([[22, 44, 0.5], [75, 47, 0.5], [30, 20, 0.45], [66, 18, 0.5], [80, 32, 0.4], [16, 32, 0.4], [58, 49, 0.4]].slice(0, 3 + t), '#fff', '.85')
      + ifT(t >= 2, `<path d="${spark(24, 28, 2.6)}${spark(73, 23, 2.2)}${t === 3 ? spark(71, 46, 1.4) + spark(29, 45, 1.2) : ''}" fill="#cfe0ff"/>`)
      + ifT(t === 3, `<path d="${glory}" stroke="#f2c230" stroke-width="1.2" opacity=".55"/>`)
      + ifT(t >= 1, `<path d="M24 34a24 8 0 0 1 48 0" fill="none" stroke="#f2c230" stroke-width=".8" opacity=".75"/>` + back.map(o => orb(...o)).join('') + dots(hl.splice(0), '#fff', '.8') + `<circle cx="48" cy="19" r="${t === 3 ? 13 : 11}" fill="url(#${P}gw)"/>`)
      + `<rect x="44.2" y="24" width="7.6" height="20" rx="1.2" fill="url(#${P}cd)" stroke="#5a2f2a" stroke-width=".6"/>`
      + `<path d="M44.4 27.5l7.2-2.4v2.4l-7.2 2.4zM44.4 33l7.2-2.4V33l-7.2 2.4zM44.4 38.5l7.2-2.4v2.4l-7.2 2.4z" fill="#ff7a5c" opacity=".85"/>`
      + `<path d="M48 24v-2.6" stroke="#3a2a28" stroke-width=".7"/><path d="M48 12.6c2.6 3 3.8 5 3.8 6.6a3.8 3.8 0 0 1-7.6 0c0-1.6 1.2-3.6 3.8-6.6z" fill="url(#${P}fl)" stroke="#d9771e" stroke-width=".4"/>`
      + ifT(t >= 1, `<path d="M24 34a24 8 0 0 0 48 0" fill="none" stroke="#f2c230" stroke-width=".9"/>` + front.map(o => orb(...o)).join('') + dots(hl, '#fff', '.8'))
      + `<path d="M12 74Q30 68 48 72T84 70V84H12Z" fill="#141640"/>`;
    return { defs, body };
  },
};
/** Fond d'un pack sans dessin (fête ajoutée plus tard) : ciel de sa palette, une étoile de plus par palier. */
function sceneFallback(P, pack, t) {
  const pal = pack.pal || { a: '#f2c230', b: '#3b3fd8', ink: '#0b0d24' }, S = [[48, 28, 6], [30, 30, 3], [66, 24, 3.6], [70, 44, 2]];
  return { defs: grad(P + 'bg', 'radial', 'cx=".5" cy=".3" r=".85"', [[0, pal.b], [1, pal.ink]]), body: `<rect x="12" y="12" width="72" height="72" fill="url(#${P}bg)"/>` + S.slice(0, t + 1).map(([x, y, r]) => `<path d="${spark(x, y, r)}" fill="${pal.a}"/>`).join('') };
}

/* ── Cadres des paliers ─────────────────────────────────────────────────────────────────────────────────────────────
   0 bronze (médaille à double biseau), 1 argent (bord cranté, perles), 2 or (couronne de lauriers, rivets, gemme), 3 ultime (couronne propre à la
   fête : flammes, éclats ou pétales qui tournent, braises, anneau lumineux). */
const METALS = [
  { l: '#ffe3c4', m: '#cf8b4c', d: '#7c3f12', e: '#4f2306', w: '#fff2e2' },
  { l: '#ffffff', m: '#b3bdcb', d: '#5b687e', e: '#343e50', w: '#ffffff' },
  { l: '#fff7c8', m: '#eab52e', d: '#946006', e: '#5f3c00', w: '#fffbe4' },
];
/** Couleurs du grade ultime par fête : [fond, couleur 1, couleur 2, éclat], forme de la couronne. */
const ULT = {
  halloween: { c: ['#22093f', '#9b4dff', '#ff7a1a', '#ffd23f'], shape: 'flame' },
  noel: { c: ['#3d070d', '#e23b3b', '#f4c542', '#fff7d6'], shape: 'burst' },
  nouvelan: { c: ['#120e45', '#ff5fa2', '#f2c230', '#fff6cc'], shape: 'burst' },
  paques: { c: ['#3a1d40', '#ff8cc0', '#ffd36b', '#ffffff'], shape: 'petal' },
  magic: { c: ['#0b1240', '#4f8cff', '#f2c230', '#fff2c0'], shape: 'flame' },
};
const metalStops = M => [[0, M.l], ['.28', M.m], ['.46', M.w], ['.6', M.m], [1, M.d]];
function frameTier(P, t, pack) {
  if (t === 3) return frameUltimate(P, pack);
  const M = METALS[t];
  const defs = grad(P + 'm', 'linear', 'x1="0" y1="0" x2="1" y2="1"', metalStops(M)) + `<linearGradient id="${P}n" href="#${P}m" x1="1" y1="1" x2="0" y2="0"/>`;
  let back = '', rim = '', over = '';
  if (t === 0) rim = `<circle cx="48" cy="48" r="44.4" fill="url(#${P}m)" stroke="${M.e}" stroke-width="1.2"/>`;
  else if (t === 1) {
    const p = []; for (let k = 0; k < 80; k++) p.push(pol(k % 2 ? 43.4 : 45.4, k * 4.5));
    rim = `<path d="${polyD(p)}" fill="url(#${P}m)" stroke="${M.e}" stroke-width="1"/>`;
    over = beads(41.4, 28, 2.5, M.d) + beads(41.4, 28, 1.6, M.w);
  } else {
    // Couronne de lauriers : feuilles qui montent sur le côté gauche (un seul chemin, coordonnées calculées), le côté droit en miroir
    let lv = '';
    for (let a = 101; a <= 231; a += 13) for (const out of [14, 42]) {
      const b = pol(41.2, a + (out > 30 ? 3 : 0)), dir = (a + 90 - out) * D2R, len = 7.8 - (a > 215 ? (a - 215) * 0.1 : 0);
      const ux = Math.cos(dir), uy = Math.sin(dir), tp = [b[0] + len * ux, b[1] + len * uy], mx = b[0] + len * 0.45 * ux, my = b[1] + len * 0.45 * uy, w = 2.3;
      lv += 'M' + nums(b) + 'Q' + nums([mx - w * uy, my + w * ux, ...tp]) + 'Q' + nums([mx + w * uy, my - w * ux, ...b]) + 'Z';
    }
    back = `<g id="${P}w"><path d="M${nums(pol(43.4, 98))}A43.4 43.4 0 0 1 ${nums(pol(43.4, 240))}" fill="none" stroke="${M.e}" stroke-width="1.3"/><path d="${rel(lv)}" fill="url(#${P}m)" stroke="${M.e}" stroke-width=".6"/></g><use href="#${P}w" transform="matrix(-1 0 0 1 96 0)"/>`;
    rim = `<circle cx="48" cy="48" r="41" fill="url(#${P}m)" stroke="${M.e}" stroke-width="1.1"/>`;
    const a = (pack.pal && pack.pal.b) || '#7b3fe4';
    over = beads(40.2, 12, 2.6, M.e) + beads(40.2, 12, 1.7, M.w)
      + `<path d="M48 1.2l5 5.2-5 5.2-5-5.2z" fill="${a}" stroke="${M.e}" stroke-width=".8"/><path d="M48 1.2l5 5.2H43z" fill="#fff" opacity=".45"/>`;
  }
  rim += `<circle cx="48" cy="48" r="40.6" fill="none" stroke="${M.w}" stroke-width=".7" opacity=".6"/><circle cx="48" cy="48" r="38.4" fill="url(#${P}n)" stroke="${M.e}" stroke-width=".6"/>`;
  const sheen = `<path d="${'M' + nums(pol(42.4, 196)) + 'A42.4 42.4 0 0 1 ' + nums(pol(42.4, 246))}" fill="none" stroke="${M.w}" stroke-width="1.5" opacity=".85"/>`;
  return { defs, back: back + rim, over: over + sheen, ring: M.e, rim2: null };
}
/** Perles ou rivets : cercle en pointillés ronds (n points sur le rayon r). */
const beads = (r, n, w, col) => `<circle cx="48" cy="48" r="${r}" fill="none" stroke="${col}" stroke-width="${w}" stroke-dasharray="0 ${n1(2 * Math.PI * r / n)}"/>`;
function frameUltimate(P, pack) {
  const U = ULT[pack.id] || { c: ['#120e45', (pack.pal && pack.pal.b) || '#7b3fe4', (pack.pal && pack.pal.a) || '#ff7a1a', '#fff6cc'], shape: 'flame' };
  const [c0, c1, c2, c3] = U.c, R = rng(pack.id.length * 7919 + 17);
  const defs = grad(P + 'ua', 'radial', 'gradientUnits="userSpaceOnUse" cx="48" cy="48" r="48"', [['.78', c0], ['.88', c1], [1, c3]])
    + grad(P + 'ub', 'radial', 'gradientUnits="userSpaceOnUse" cx="48" cy="48" r="46"', [['.8', c2], [1, c3]])
    + grad(P + 'ug', 'linear', 'x1="0" y1="0" x2="1" y2="1"', [[0, c1], [".6", c2], [1, c3]]);
  // La couronne a une symétrie d'ordre 4 : un quart est dessiné (groupe), les trois autres sont ce quart tourné de 90°, 180° et 270°.
  let quarter = '';
  if (U.shape === 'flame') {
    // Couronne de flammes : langues imbriquées (couleur 1, couleur 2, cœur clair), hautes et basses en alternance, pointes qui s'enroulent dans le même sens
    const sp = 30, H = [1, 0.7, 0.88];
    // Repère local d'une langue : x le long du cercle (sens horaire), y vers l'extérieur ; bord gauche bombé, pointe penchée, bord droit creusé (crochet)
    const tongues = (rb, h0, w, lean, fill, sw) => {
      let d = '';
      for (let k = 0; k < 3; k++) {
        const a = (-90 + k * sp) * D2R, h = h0 * H[k], L = lean * (0.7 + 0.3 * H[(k + 1) % 3]);
        const ux = Math.cos(a), uy = Math.sin(a), vx = -uy, vy = ux, bx = 48 + rb * ux, by = 48 + rb * uy, Q = (x, y) => [bx + x * vx + y * ux, by + x * vy + y * uy];
        d += 'M' + nums(Q(-w, 0)) + 'C' + nums([...Q(-w * 1.05, h * 0.42), ...Q(-w * 0.2 + L * 0.1, h * 0.66), ...Q(L, h)])
          + 'C' + nums([...Q(L * 0.45 + w * 0.15, h * 0.78), ...Q(w * 1.2, h * 0.42), ...Q(w, 0)]) + 'Z';
      }
      return `<path d="${rel(d)}" fill="${fill}"${sw ? ` stroke="${sw}" stroke-width=".6"` : ''}/>`;
    };
    quarter = tongues(35.5, 12.5, 7.6, 5.5, `url(#${P}ua)`, c0) + tongues(35.5, 9.6, 5, 4.2, `url(#${P}ub)`, '#6a1d00') + tongues(35.5, 6.6, 2.6, 2.8, c3, null);
  } else if (U.shape === 'burst') {
    // Gloire : grands rayons effilés, rayons plus courts entre eux, puis un rang d'éclats clairs
    const rays = (n, ro, ri, half, rot, fill, sw) => {
      let d = ''; for (let k = 0; k < n / 4; k++) { const a = rot + k * 360 / n; d += 'M' + nums(pol(ri, a - half)) + 'L' + nums(pol(ro, a)) + 'L' + nums(pol(ri, a + half)) + 'Z'; }
      return `<path d="${rel(d)}" fill="${fill}" stroke="${sw}" stroke-width=".6"/>`;
    };
    quarter = rays(12, 48, 36, 9, -90, `url(#${P}ua)`, c0) + rays(12, 44.6, 36, 7, -75, `url(#${P}ub)`, c0) + rays(24, 41.2, 37, 3.4, -82.5, c3, 'none');
  } else {
    // Rosette : feuilles, puis deux rangs de pétales arrondis décalés
    const petals = (n, rb, L, w, rot, fill, sw) => {
      let d = '';
      for (let k = 0; k < n / 4; k++) {
        const a = (rot + k * 360 / n) * D2R, ux = Math.cos(a), uy = Math.sin(a), Q = (x, y) => [48 + rb * ux - x * uy + y * ux, 48 + rb * uy + x * ux + y * uy];
        d += 'M' + nums(Q(0, 0)) + 'C' + nums([...Q(-w, L * 0.3), ...Q(-w * 0.7, L * 1.08), ...Q(0, L)]) + 'C' + nums([...Q(w * 0.7, L * 1.08), ...Q(w, L * 0.3), ...Q(0, 0)]) + 'Z';
      }
      return `<path d="${rel(d)}" fill="${fill}" stroke="${sw}" stroke-width=".55"/>`;
    };
    quarter = petals(12, 34, 12.8, 3.2, -75, '#7cc996', '#2f7a4c') + petals(12, 34, 13.2, 6.4, -90, `url(#${P}ua)`, c0) + petals(12, 34, 10.4, 4.8, -75, `url(#${P}ub)`, '#b07a1a');
  }
  const crown = `<g id="${P}uh"><g id="${P}uf">${quarter}</g><use href="#${P}uf" transform="rotate(90 48 48)"/></g><use href="#${P}uh" transform="rotate(180 48 48)"/>`;
  const em = []; for (let k = 0; k < 6; k++) { const a = k * 60 + R() * 26, rr = 44.4 + R() * 3; em.push([...pol(rr, a), 0.8]); }      // braises
  const disc = `<circle cx="48" cy="48" r="38.4" fill="${c0}" stroke="${c0}" stroke-width="1"/>`, rim = `<circle cx="48" cy="48" r="37.2" fill="none" stroke="url(#${P}ug)" stroke-width="2.4"/>`;
  const over = beads(37.2, 16, 1.5, c3) + dots(em, c3)
    + `<path d="${spark(80, 13, 4.4)}" fill="#fff"/>`;
  return { defs, back: disc + crown + rim, over, ring: c0, rim2: c2 };
}

/* ── Badge ──────────────────────────────────────────────────────────────────────────────────────────────────────── */
/** Décor de l'année propre à la police (coordonnées finales) : étincelles du givre, fleurs du printemps, étoiles de gala. */
function yearDeco(font, P, box, F, hasFw) {
  const { x0, x1, top, bot } = box;
  if (font === 'frost') return `<path d="${spark(x1 - 1, top + 0.5, 2.6)}${spark(x0 + 2, bot - 2, 1.8)}" fill="#fff" stroke="${F.ink}" stroke-width=".35"/>`;
  if (font === 'gala') return `<path d="${spark(x1 + 1, top + 1, 2.8)}${spark(x0 - 0.5, bot - 3, 2)}" fill="#fff6cc" stroke="${F.ink}" stroke-width=".35"/>`;
  if (font === 'bloom') {
    const fl = (x, y, r) => { if (hasFw) return `<use href="#${P}fw" transform="translate(${n1(x)} ${n1(y)}) scale(${n1(r / 2.6)})"/>`; let s = ''; for (let k = 0; k < 5; k++) { const [px, py] = pol(r * 0.62, k * 72 - 90, x, y); s += `<circle cx="${n1(px)}" cy="${n1(py)}" r="${n1(r * 0.48)}"/>`; } return `<g fill="#fff" stroke="${F.ink}" stroke-width=".4">${s}</g><circle cx="${n1(x)}" cy="${n1(y)}" r="${n1(r * 0.36)}" fill="#ffd36b" stroke="${F.ink}" stroke-width=".35"/>`; };
    return fl(x1 - 2, top + 1, 3.6) + fl(x0 + 1.5, bot - 1.5, 2.6);
  }
  if (font === 'arcane') return `<path d="${spark(x1, top, 2.4)}${spark(x0, bot - 1, 1.7)}" fill="#fff2c0" stroke="${F.ink}" stroke-width=".35"/>`;
  return '';
}
/** SVG d'un badge : édition (« halloween-2026 » ou objet de evEdition) et palier (0 à 3 ; 3 = grade ultime). Déterministe. */
export function badgeSvgFor(edition, tier) {
  const ed = typeof edition === 'string' ? EV.evById(edition) : edition;
  if (!ed) throw new Error('édition inconnue : ' + edition);
  const t = Math.max(0, Math.min(3, Math.floor(Number(tier)) || 0)), pack = EV.evPack(ed.pack), P = `${ed.id}-${t}-`;
  const font = FONTS[pack.font] ? pack.font : 'arcane', F = FONTS[font];
  const sc = SCENES[pack.id] ? SCENES[pack.id](P, t) : sceneFallback(P, pack, t), fr = frameTier(P, t, pack);
  // L'année : contour de chaque chiffre posé (règle nonzero), ombre portée, contour foncé (paint-order : seul le bord extérieur de l'ensemble se voit)
  const L = yearLayout(font, ed.year, 48, 61.5, 60);
  let yd = '', x0 = Infinity, x1 = -Infinity, inl = '';
  for (const { g, ox } of L.out) {
    for (const p of g.polys) { const q = simplify(p.pts.map(pt => L.T(pt, ox)), 0.07); yd += polyD(q.map(([x, y]) => [Math.round(x * 10), Math.round(y * 10)])); for (const [x] of q) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); } }
    if (F.inline) {
      const u = [1, 0], th = F.pen.min + (F.pen.max - F.pen.min) * 0.72;
      for (const sk of g.skel) {
        const pts = sk.closed ? [...sk.pts, sk.pts[0]] : sk.pts; let run = [];
        const flush = () => { if (run.length > 1) { const a = run[0], b = run[run.length - 1]; const sh = rdp(run, 0.05); if (Math.hypot(b[0] - a[0], b[1] - a[1]) > 3) inl += lineD(sh); } run = []; };
        for (let i = 0; i < pts.length - 1; i++) {
          const d = norm([pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]]), w = F.pen.min + (F.pen.max - F.pen.min) * Math.abs(u[0] * d[1] - u[1] * d[0]);
          if (w >= th) { if (!run.length) run.push(L.T(pts[i], ox)); run.push(L.T(pts[i + 1], ox)); } else flush();
        }
        flush();
      }
    }
  }
  // L'année est en coordonnées × 10 entières (scale(.1)) : même précision, sans les points décimaux ; épaisseurs des traits et dégradé dans ce repère
  const ydefs = `<path id="${P}y" transform="scale(.1)" d="${yd}"/>` + grad(P + 'yf', 'linear', `gradientUnits="userSpaceOnUse" x1="0" y1="${Math.round(L.top * 10)}" x2="0" y2="${Math.round(L.bot * 10)}"`, F.fill);
  const year = ifT(!fr.rim2, `<use href="#${P}y" transform="translate(.6 1.3)" fill="#000" stroke="#000" stroke-width="26" opacity=".42"/>`)      // ombre portée (grade ultime : liseré de couleur à la place)
    + (fr.rim2 ? `<use href="#${P}y" fill="none" stroke="${fr.rim2}" stroke-width="42"/>` : '')
    + `<use href="#${P}y" fill="url(#${P}yf)" stroke="${F.ink}" stroke-width="23" paint-order="stroke"/>`
    + (inl ? `<path d="${inl}" fill="none" stroke="#fff8dc" stroke-width="${F.inline}" opacity=".9"/>` : '')
    + yearDeco(font, P, { x0, x1, top: L.top, bot: L.bot }, F, sc.defs.includes(`id="${P}fw"`));
  const face = `<clipPath id="${P}c"><circle cx="48" cy="48" r="35.6"/></clipPath>`;
  return (`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96" width="96" height="96" stroke-linejoin="round" stroke-linecap="round"><defs>${fr.defs}${face}${sc.defs}${ydefs}</defs>`
    + fr.back
    + `<g clip-path="url(#${P}c)">${sc.body}<circle cx="48" cy="48" r="34.4" fill="none" stroke="#000" stroke-width="2.6" opacity=".22"/></g>`
    + `<circle cx="48" cy="48" r="35.6" fill="none" stroke="${fr.ring}" stroke-width="1.3"/>`
    + fr.over + year + '</svg>\n')
    .replace(/ d="([MLQCZ0-9.\s-]+)"/g, (m, d) => ' d="' + rel(d) + '"');      // chemins absolus restants → relatifs (plus courts)
}

/* ── Éditions à générer ─────────────────────────────────────────────────────────────────────────────────────────── */
export const fileFor = (dir, edId, t) => join(dir, `${edId}-${t}.svg`);
const missing = (dir, ed) => [0, 1, 2, 3].some(t => !existsSync(fileFor(dir, ed.id, t)));
/** Éditions dues un jour donné (« AAAA-MM-JJ ») : en cours ou qui commencent dans les LEAD_DAYS jours, packs « ready » (o.all : tous),
 *  dont un fichier manque dans o.dir (o.force : même complètes). */
export function dueEditions(today, o = {}) {
  const dir = o.dir || OUT_DIR, y = +today.slice(0, 4), out = [];
  for (const p of EV.EV_PACKS) {
    if (!p.ready && !o.all) continue;
    for (const yy of [y - 1, y, y + 1]) {
      const e = EV.evEdition(p, yy);
      if (today >= EV.evAdd(e.from, -LEAD_DAYS) && today <= e.to && (o.force || missing(dir, e))) out.push(e);
    }
  }
  return out;
}
/** Éditions choisies à la main (--year, --pack) : pack nommé (même pas « ready »), sinon packs « ready » (o.all : tous). */
export function pickEditions(o = {}) {
  const dir = o.dir || OUT_DIR, y = o.year || +String(o.today || EV.evDay(Date.now())).slice(0, 4);
  return EV.EV_PACKS.filter(p => (o.pack ? p.id === o.pack : p.ready || o.all)).map(p => EV.evEdition(p, y)).filter(e => o.force || missing(dir, e));
}
/** Écrit les 4 badges des éditions (fichiers manquants seulement, sauf force) : liste des fichiers écrits. */
export function writeEditions(eds, o = {}) {
  const dir = o.dir || OUT_DIR, done = [];
  mkdirSync(dir, { recursive: true });
  for (const e of eds) for (let t = 0; t < 4; t++) {
    const f = fileFor(dir, e.id, t);
    if (!o.force && existsSync(f)) continue;
    writeFileSync(f, badgeSvgFor(e, t)); done.push(f);
  }
  return done;
}
export { FONTS, FONT_IDS };

function main(argv) {
  const o = {}; const a = argv.slice();
  while (a.length) {
    const k = a.shift();
    if (k === '--year') o.year = +a.shift(); else if (k === '--pack') o.pack = a.shift(); else if (k === '--all') o.all = true; else if (k === '--force') o.force = true;
    else if (k === '--out') o.dir = resolve(a.shift()); else if (k === '--today') o.today = a.shift();
    else { console.error('Option inconnue : ' + k + '\nUsage : node tools/gen-event-badges.mjs [--year AAAA] [--pack id] [--all] [--force] [--out dossier] [--today AAAA-MM-JJ]'); process.exit(2); }
  }
  if (o.today && !/^\d{4}-\d{2}-\d{2}$/.test(o.today)) { console.error('--today : AAAA-MM-JJ'); process.exit(2); }
  if (o.pack && !EV.evPack(o.pack)) { console.error('Pack inconnu : ' + o.pack + ' (' + EV.EV_PACKS.map(p => p.id).join(', ') + ')'); process.exit(2); }
  const today = o.today || EV.evDay(Date.now());
  const eds = o.year || o.pack ? pickEditions({ ...o, today }) : dueEditions(today, o);
  const done = writeEditions(eds, o);
  if (!done.length) console.log(`Badges d'événement : rien à générer (${today}).`);
  for (const f of done) console.log('écrit ' + (f.startsWith(ROOT + '/') ? f.slice(ROOT.length + 1) : f));
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main(process.argv.slice(2));
