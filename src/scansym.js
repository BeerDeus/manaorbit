/* ── scansym.js : le symbole d'extension de la carte photographiée → son extension, quand ni la ligne du bas ni l'illustration ne suffisent ──────────
   Rééditions (même illustration dans plusieurs extensions : cartes d'avant 2014, terrains de base, réimpressions) ou illustration non reconnue : le symbole à droite
   de la ligne de type départage. Tout se passe sur le téléphone, sans OCR (Tesseract comme ML Kit). À la capture (cadrage « carte entière », scan.js › artAttach) :
   zone SYM_BOX de la carte réduite à SYM_ZH px de haut ; fond = couleur médiane de la ligne de type à gauche du symbole ; distance de chaque pixel à ce fond, seuil
   d'après le grain de la ligne de type (avec hystérésis) ; la tache la plus grande calée à droite de la ligne de type (celles qui touchent le bord de la zone —
   illustration, cadre, boîte de texte — écartées, comme le texte du type), avec ses morceaux voisins ; trous bouchés (dégradé argent, or ou orange de la rareté : seule la SILHOUETTE compte) ; boîte englobante ramenée
   à SYM_N × SYM_N, proportions gardées : la signature (m.sym, 1 Ko), la capture est libérée ensuite. Références : les SVG de Scryfall (svgs.scryfall.io, CORS,
   gardés par le service worker) des seules extensions des impressions encore possibles, rendus sur un canvas (opacité), puis « photographiés » : plusieurs
   épaisseurs et encoches bouchées (SYM_DILS, le contour imprimé et le flou de la photo) ; gardés en mémoire et sur l'appareil (Cache, SYM_TTL). Distance :
   1 − IoU des silhouettes adoucies (flou 3 × 3, un pixel de décalage toléré), la plus proche des épaisseurs. Retenue si assez proche (SYM_MAX) et nettement
   devant le 2e symbole (× SYM_RATIO et + SYM_GAP), tous les symboles candidats lus ; sinon rien (la carte reste à choisir, jamais au hasard).
   Extensions au même symbole (promos et leur extension) : une seule classe. Au plus SYM_CAND symboles ; en réseau mobile, au plus SYM_MOBILE à télécharger
   (ceux déjà sur l'appareil ne coûtent rien). Seuils mesurés sur des photos simulées (tools/make-sym-fixtures.py) : voir le README, « Scan des cartes ». */
const SYM_N = 32, SYM_ZH = 160, SYM_REF = 96, SYM_BOX = { x: 0.7, y: 0.5, w: 0.28, h: 0.16 };      // zone : droite de la ligne de type (cadres 1993-2003, 2003-2014 et 2014+), large pour une carte un peu décalée
const SYM_MAX = 0.3, SYM_RATIO = 1.6, SYM_GAP = 0.1, SYM_CAND = 300, SYM_MOBILE = 40, SYM_NEAR = [2, 0.15], SYM_TMIN = 32, SYM_HYS = 0.5, SYM_LEVELS = [1, 1.7, 2.8, 4.5], SYM_DILS = [[0, 0], [0, 0.03], [0, 0.06], [0, 0.09], [0.08, 0.03], [0.14, 0.03], [0.22, 0.03], [0.32, 0.03]], SYM_TTL = 90 * 864e5;      // distance au-delà de laquelle rien n'est sûr ; 2e ≥ 1,6 × la 1re et 0,1 de plus ; écarter une extension sans en choisir : 2 × et 0,15 de plus ; contraste minimal (0–441) ; [bouché, épaissi] en fraction de la taille
const SSYM = { ref: new Map(), load: new Map() };
/* Place attendue du symbole (fractions de la carte) : hauteur du centre, sonde du fond (ligne de type à gauche du symbole), tailles admises (hauteur de carte). */
const SYM_AT = { y: 0.592, probe: [0.71, 0.575, 0.83, 0.605], h: [0.01, 0.056], w: [0.008, 0.085], cx: [0.78, 0.96], cy: [0.552, 0.632], right: [0.86, 0.96] };      // right : bord droit (le symbole est calé à droite de la ligne de type ; le texte du type s'arrête avant)

/** Bouche les trous d'un masque binaire (w × h, 1 = forme) : le fond joignable depuis le bord reste, le reste devient forme. Modifie b. */
function symFill(b, w, h) {
  const out = new Uint8Array(w * h), st = [];
  const push = i => { if (!b[i] && !out[i]) { out[i] = 1; st.push(i); } };
  for (let x = 0; x < w; x++) { push(x); push((h - 1) * w + x); }
  for (let y = 0; y < h; y++) { push(y * w); push(y * w + w - 1); }
  while (st.length) { const i = st.pop(), x = i % w; if (x > 0) push(i - 1); if (x < w - 1) push(i + 1); if (i >= w) push(i - w); if (i < w * (h - 1)) push(i + w); }
  for (let i = 0; i < w * h; i++) b[i] = out[i] ? 0 : 1;
  return b;
}
/** Masque binaire (w × h) → silhouette normalisée : boîte englobante ramenée à SYM_N × SYM_N (côté le plus long, proportions gardées, centrée), valeurs 0–255 ;
 *  { m, a (largeur / hauteur) } ou null (forme trop petite). */
function symNorm(b, w, h) {
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (b[y * w + x]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  const bw = x1 - x0 + 1, bh = y1 - y0 + 1; if (x1 < 0 || bw < 3 || bh < 3) return null;
  const N = SYM_N, s = (N - 2) / Math.max(bw, bh), ox = (N - bw * s) / 2, oy = (N - bh * s) / 2, K = 4, m = new Uint8Array(N * N);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    let c = 0;
    for (let v = 0; v < K; v++) for (let u = 0; u < K; u++) {
      const sx = Math.floor(x0 + (i + (u + 0.5) / K - ox) / s), sy = Math.floor(y0 + (j + (v + 0.5) / K - oy) / s);
      if (sx >= x0 && sx <= x1 && sy >= y0 && sy <= y1 && b[sy * w + sx]) c++;
    }
    m[j * N + i] = Math.round(255 * c / (K * K));
  }
  return { m, a: bw / bh };
}
/** Pixels RGBA de la zone SYM_BOX d'une carte photographiée (w × h) → masque du symbole (w × h, 1 = symbole, trous compris) ou null (aucune tache à sa place).
 *  Seuil d'après le grain de la ligne de type elle-même (médiane + 6 écarts robustes, sans les lettres du type) : le contour sombre d'un symbole argent ou or
 *  ressort même quand son dégradé se confond avec le fond ; s'il colle au cadre ou à l'illustration (forme invalide), seuils plus hauts (SYM_LEVELS). */
function symCut(d, w, h) {
  const n = w * h, pw = w / SYM_BOX.w, ph = h / SYM_BOX.h, X = v => Math.round((v - SYM_BOX.x) * pw), Y = v => Math.round((v - SYM_BOX.y) * ph);
  const P = SYM_AT.probe, at = [];
  for (let y = Math.max(0, Y(P[1])); y < Math.min(h, Y(P[3])); y++) for (let x = Math.max(0, X(P[0])); x < Math.min(w, X(P[2])); x++) at.push(y * w + x);
  if (at.length < 16) return null;
  const med = a => a.sort((p, q) => p - q)[a.length >> 1], dist = (i, c) => { const r = d[i * 4] - c[0], g = d[i * 4 + 1] - c[1], b = d[i * 4 + 2] - c[2]; return Math.sqrt(r * r + g * g + b * b); };
  let px = at, bg = null, m0 = 0, sd = 0;
  for (let k = 0; k < 3; k++) {      // fond de la ligne de type : médiane, puis refaite sans les pixels nettement différents (lettres du type et leur flou)
    bg = [0, 1, 2].map(c => med(px.map(i => d[i * 4 + c])));
    const pd = px.map(i => dist(i, bg)); m0 = med(pd.slice()); sd = 1.4826 * med(pd.map(v => Math.abs(v - m0)));
    const keep = at.filter(i => dist(i, bg) <= m0 + 3 * sd + 1); if (keep.length < 16 || keep.length === px.length) break; px = keep;
  }
  const D = new Uint16Array(n), T0 = Math.max(SYM_TMIN, m0 + 6 * sd);
  for (let i = 0; i < n; i++) D[i] = Math.round(dist(i, bg));
  for (const k of SYM_LEVELS) { const b = symCutAt(D, w, h, T0 * k); if (b) return symFill(b, w, h); }
  return null;
}
/** Taches (8 voisins) des pixels plus loin du fond que T / 2, gardées seulement si elles dépassent T quelque part (hystérésis : le haut clair d'un symbole or
 *  suit son contour, le grain du fond ne fait jamais une tache) → la tache du symbole (avec ses morceaux voisins) ou null. */
function symCutAt(D, w, h, T) {
  const n = w * h, pw = w / SYM_BOX.w, ph = h / SYM_BOX.h, lab = new Int32Array(n), comps = [], st = [], Tl = Math.max(SYM_TMIN, T * SYM_HYS);
  for (let i0 = 0; i0 < n; i0++) {
    if (lab[i0] || D[i0] <= Tl) continue;
    const id = comps.length + 1, c = { id, a: 0, x0: w, y0: h, x1: -1, y1: -1, edge: false, mx: 0 }; lab[i0] = id; st.push(i0);
    while (st.length) {
      const i = st.pop(), x = i % w, y = (i - x) / w; c.a++; if (D[i] > c.mx) c.mx = D[i];
      if (x < c.x0) c.x0 = x; if (x > c.x1) c.x1 = x; if (y < c.y0) c.y0 = y; if (y > c.y1) c.y1 = y;
      if (!x || !y || x === w - 1 || y === h - 1) c.edge = true;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
        const j = yy * w + xx; if (!lab[j] && D[j] > Tl) { lab[j] = id; st.push(j); }
      }
    }
    comps.push(c);
  }
  const A = SYM_AT, sizeOk = (bw, bh) => bh / ph >= A.h[0] && bh / ph <= A.h[1] && bw / ph >= A.w[0] && bw / ph <= A.w[1];
  const ok = c => {      // taille et place d'un symbole ; une tache qui touche le bord de la zone est l'illustration, le cadre ou la boîte de texte
    if (c.edge || c.a < 12 || c.mx <= T || !sizeOk(c.x1 - c.x0 + 1, c.y1 - c.y0 + 1)) return false;
    const cx = SYM_BOX.x + (c.x0 + c.x1 + 1) / 2 / pw, cy = SYM_BOX.y + (c.y0 + c.y1 + 1) / 2 / ph, rx = SYM_BOX.x + (c.x1 + 1) / pw;
    return cx >= A.cx[0] && cx <= A.cx[1] && cy >= A.cy[0] && cy <= A.cy[1] && rx >= A.right[0] && rx <= A.right[1];
  };
  let seed = null, top = 0;
  for (const c of comps) {
    if (!ok(c)) continue;
    const cy = SYM_BOX.y + (c.y0 + c.y1 + 1) / 2 / ph, s = c.a * Math.exp(-(((cy - A.y) / 0.03) ** 2));      // la plus grande, près de la hauteur attendue
    if (s > top) { top = s; seed = c; }
  }
  if (!seed) return null;
  const keep = new Set([seed.id]); let bx = { x0: seed.x0, y0: seed.y0, x1: seed.x1, y1: seed.y1 };
  for (let pass = 0; pass < 2; pass++) {      // morceaux d'un symbole en plusieurs parties : les taches nettes qui touchent la boîte élargie d'un quart, si l'ensemble garde la taille d'un symbole
    const m = Math.round(0.25 * Math.max(bx.x1 - bx.x0, bx.y1 - bx.y0)) + 1;
    for (const c of comps) {
      if (keep.has(c.id) || c.edge || c.a < 3 || c.mx <= T || c.x1 < bx.x0 - m || c.x0 > bx.x1 + m || c.y1 < bx.y0 - m || c.y0 > bx.y1 + m) continue;
      const u = { x0: Math.min(bx.x0, c.x0), y0: Math.min(bx.y0, c.y0), x1: Math.max(bx.x1, c.x1), y1: Math.max(bx.y1, c.y1) };
      if (!sizeOk(u.x1 - u.x0 + 1, u.y1 - u.y0 + 1)) continue;
      keep.add(c.id); bx = u;
    }
  }
  const b = new Uint8Array(n); for (let i = 0; i < n; i++) if (lab[i] && keep.has(lab[i])) b[i] = 1;
  return b;
}
/** Photo : pixels RGBA de la zone du symbole → signature { m, a } ou null. */
const symSigData = (d, w, h) => { const b = symCut(d, w, h); return b ? symNorm(b, w, h) : null; };
/** Distance (chanfrein 3-4, en tiers de pixel) de chaque pixel au plus proche pixel de b valant v : deux passes, temps linéaire. */
function symDT(b, w, h, v) {
  const n = w * h, d = new Float32Array(n);
  for (let i = 0; i < n; i++) d[i] = b[i] === v ? 0 : 1e9;
  for (let y = 0; y < h; y++) for (let x = 0, i = y * w; x < w; x++, i++) {
    let m = d[i]; if (!m) continue;
    if (x > 0 && d[i - 1] + 3 < m) m = d[i - 1] + 3;
    if (y > 0) { const j = i - w; if (d[j] + 3 < m) m = d[j] + 3; if (x > 0 && d[j - 1] + 4 < m) m = d[j - 1] + 4; if (x < w - 1 && d[j + 1] + 4 < m) m = d[j + 1] + 4; }
    d[i] = m;
  }
  for (let y = h - 1; y >= 0; y--) for (let x = w - 1, i = y * w + w - 1; x >= 0; x--, i--) {
    let m = d[i]; if (!m) continue;
    if (x < w - 1 && d[i + 1] + 3 < m) m = d[i + 1] + 3;
    if (y < h - 1) { const j = i + w; if (d[j] + 3 < m) m = d[j] + 3; if (x < w - 1 && d[j + 1] + 4 < m) m = d[j + 1] + 4; if (x > 0 && d[j - 1] + 4 < m) m = d[j - 1] + 4; }
    d[i] = m;
  }
  return d;
}
/** Symbole de référence rendu (RGBA, fond transparent, marge ≥ le plus fort épaississement de SYM_DILS) → signature { v : ses silhouettes « photographiées » (SYM_DILS) }.
 *  Sur la photo, le fin contour imprimé épaissit le symbole, et le flou bouche ses encoches (une étoile floue devient presque un polygone), d'autant plus que la
 *  photo est floue : la photo est comparée à chacune (fermée de c puis épaissie de e, en fraction de la taille du symbole : épaissie de c, amincie de c − e),
 *  la plus proche compte. Opacité ≥ 50 %, trous bouchés comme sur la photo. Distances de chanfrein : une carte des distances à la forme sert à tous les épaississements. */
function symRefData(d, w, h) {
  const n = w * h, b = new Uint8Array(n); let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (d[(y * w + x) * 4 + 3] >= 128) { b[y * w + x] = 1; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  if (x1 < 0) return null;
  const S = 3.25 * Math.max(x1 - x0 + 1, y1 - y0 + 1), D1 = symDT(b, w, h, 1), v = [];      // 3,25 : un pas de chanfrein (3) un peu élargi, plus proche d'un disque
  for (const [c, e] of SYM_DILS) {
    let o = new Uint8Array(n);
    for (let i = 0; i < n; i++) o[i] = D1[i] <= Math.max(c, e) * S ? 1 : 0;
    if (c > e) { const D0 = symDT(o, w, h, 0); for (let i = 0; i < n; i++) o[i] = D0[i] > (c - e) * S ? 1 : 0; }
    const s = symNorm(symFill(o, w, h), w, h); if (s) v.push(s);
  }
  return v.length ? { v } : null;
}
/** Silhouette adoucie (flou 1-2-1 dans les deux sens) : un pixel de travers coûte peu. */
function symBlur(m) {
  const N = SYM_N, t = new Float32Array(N * N), o = new Float32Array(N * N), at = (a, x, y) => a[Math.min(N - 1, Math.max(0, y)) * N + Math.min(N - 1, Math.max(0, x))];
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) t[y * N + x] = (at(m, x - 1, y) + 2 * at(m, x, y) + at(m, x + 1, y)) / 4;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) o[y * N + x] = (at(t, x, y - 1) + 2 * at(t, x, y) + at(t, x, y + 1)) / 4;
  return o;
}
/** Distance entre deux silhouettes { m } (0 : la même, 1 : rien en commun) : 1 − IoU des silhouettes adoucies, la meilleure à un pixel près. */
function symDist1(a, b) {
  const N = SYM_N, x = a.f || (a.f = symBlur(a.m)), y = symBlur(b.m); let best = 1;      // photo adoucie une fois ; références adoucies à la volée (rien de plus en mémoire)
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    let mn = 0, mx = 0;
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const u = x[j * N + i], ii = i + dx, jj = j + dy, v = ii >= 0 && jj >= 0 && ii < N && jj < N ? y[jj * N + ii] : 0;
      if (u < v) { mn += u; mx += v; } else { mn += v; mx += u; }
    }
    const dd = mx ? 1 - mn / mx : 1; if (dd < best) best = dd;
  }
  return best;
}
/** Distance entre la signature d'une photo { m } et un symbole de référence { v : [{ m }, …] } (ou une silhouette { m }) : la plus proche de ses épaisseurs ; Infinity si l'une manque. */
function symDist(a, b) {
  const okm = s => !!s && !!s.m && s.m.length === SYM_N * SYM_N;
  if (!okm(a) || !b) return Infinity;
  const v = b.v ? b.v.filter(okm) : okm(b) ? [b] : []; if (!v.length) return Infinity;
  return Math.min(...v.map(x => symDist1(a, x)));
}
/** Classement des symboles candidats refs [{ k, s (signature, null : illisible) }] → { k (le plus proche, s'il est sûr), near (sinon : ceux qui restent possibles,
 *  les autres étant nettement plus loin), d1, d2, n }. */
function symRank(sig, refs) {
  const sc = (refs || []).map(r => ({ k: r.k, d: symDist(sig, r.s) })).sort((a, b) => a.d - b.d);
  const d1 = sc[0] ? sc[0].d : Infinity, d2 = sc[1] ? sc[1].d : Infinity, out = { d1, d2, n: sc.filter(x => Number.isFinite(x.d)).length };
  if (!sig || sc.length < 2 || out.n < sc.length || d1 > SYM_MAX) return out;      // un symbole candidat manque (non lu : le bon est peut-être celui-là), ou rien d'assez proche
  const near = (R, G) => sc.filter(x => x.d < d1 * R || x.d - d1 < G).map(x => x.k);      // pas nettement plus loin que le plus proche
  return near(SYM_RATIO, SYM_GAP).length === 1 ? { ...out, k: sc[0].k } : { ...out, near: near(SYM_NEAR[0], SYM_NEAR[1]) };
}
/** Texte SVG → { t (largeur et hauteur posées, côté le plus long = S), w, h } d'après sa viewBox (ou width / height) ; null si illisible. */
function symSvgSized(txt, S) {
  const m = /<svg\b[^>]*>/i.exec(String(txt || '')); if (!m) return null;
  const tag = m[0], num = k => { const v = new RegExp('\\s' + k + '\\s*=\\s*["\']\\s*([\\d.]+)', 'i').exec(tag); return v ? parseFloat(v[1]) : NaN; };
  const vb = /\sviewBox\s*=\s*["']\s*([-\d.eE]+)[\s,]+([-\d.eE]+)[\s,]+([\d.eE]+)[\s,]+([\d.eE]+)/i.exec(tag);
  let vw = vb ? parseFloat(vb[3]) : num('width'), vh = vb ? parseFloat(vb[4]) : num('height');
  if (!(vw > 0) || !(vh > 0)) return null;
  const k = S / Math.max(vw, vh), w = Math.max(1, Math.round(vw * k)), h = Math.max(1, Math.round(vh * k));
  let nt = tag.replace(/\s(width|height)\s*=\s*("[^"]*"|'[^']*')/gi, '');
  if (!vb) nt = nt.replace(/^<svg\b/i, `<svg viewBox="0 0 ${vw} ${vh}"`);
  if (!/\sxmlns\s*=/.test(nt)) nt = nt.replace(/^<svg\b/i, '<svg xmlns="http://www.w3.org/2000/svg"');
  nt = nt.replace(/^<svg\b/i, `<svg width="${w}" height="${h}"`);
  return { t: String(txt).replace(tag, nt), w, h };
}

/** Signature du symbole d'une capture (canvas, image) : zone SYM_BOX de la carte qui occupe box (toute l'image par défaut) ; null si rien de lisible. */
function symSig(src, box) {
  try {
    const W = src.naturalWidth || src.width, H = src.naturalHeight || src.height, b = box || { x: 0, y: 0, w: W, h: H };
    const sw = b.w * SYM_BOX.w, sh = b.h * SYM_BOX.h, zh = SYM_ZH, zw = Math.max(16, Math.round(zh * sw / sh));
    const c = document.createElement('canvas'); c.width = zw; c.height = zh;
    const x = c.getContext('2d', { willReadFrequently: true }); x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'high';
    x.drawImage(src, b.x + b.w * SYM_BOX.x, b.y + b.h * SYM_BOX.y, sw, sh, 0, 0, zw, zh);
    const s = symSigData(x.getImageData(0, 0, zw, zh).data, zw, zh); c.width = c.height = 0;
    return s;
  } catch (e) { return null; }
}
const symKey = u => 'sym1:' + String(u).replace(/^https:\/\/svgs\.scryfall\.io\/sets\//, '').replace(/\?.*$/, '');
/** Signature déjà connue d'un symbole (mémoire, puis appareil) sans réseau ; undefined si inconnue. */
async function symRefKnown(u) {
  if (SSYM.ref.has(u)) return SSYM.ref.get(u);
  try { const hit = await Cache.get(symKey(u), SYM_TTL); if (hit && Array.isArray(hit.v) && hit.v.length) { const s = { v: hit.v.map(x => ({ m: x.m instanceof Uint8Array ? x.m : Uint8Array.from(x.m), a: x.a })) }; symKeep(u, s); return s; } } catch (e) { /* cache absent */ }
  return undefined;
}
function symKeep(u, s) { if (SSYM.ref.size >= 400) SSYM.ref.delete(SSYM.ref.keys().next().value); SSYM.ref.set(u, s); }
/** Signature d'un symbole d'extension (adresse svgs.scryfall.io) : mémoire, appareil, sinon le SVG lu en CORS et rendu sur un canvas ; null s'il ne vient pas. */
function symRefSig(u) {
  if (SSYM.load.has(u)) return SSYM.load.get(u);
  const pr = (async () => {
    const k = await symRefKnown(u); if (k !== undefined) return k;
    let s = null, ctl = null, t = 0;
    try {
      ctl = typeof AbortController !== 'undefined' ? new AbortController() : null; t = setTimeout(() => { if (ctl) ctl.abort(); }, 8000);
      const r = await fetch(u, { mode: 'cors', credentials: 'omit', signal: ctl ? ctl.signal : undefined });
      const sv = r.ok ? symSvgSized(await r.text(), SYM_REF) : null;
      if (sv) {
        const url = URL.createObjectURL(new Blob([sv.t], { type: 'image/svg+xml' }));
        try {
          const i = new Image(); i.decoding = 'async'; i.src = url; await i.decode();
          const mg = Math.ceil(SYM_REF * Math.max(...SYM_DILS.map(([a, b]) => Math.max(a, b)))) + 8, c = document.createElement('canvas'); c.width = sv.w + 2 * mg; c.height = sv.h + 2 * mg;      // marge : l'épaississement le plus fort tient dans le canvas
          const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(i, mg, mg, sv.w, sv.h);
          s = symRefData(x.getImageData(0, 0, c.width, c.height).data, c.width, c.height); c.width = c.height = 0;
        } finally { URL.revokeObjectURL(url); }
      }
    } catch (e) { s = null; }      // hors ligne, SVG illisible : pas de signature (rien ne sera choisi)
    finally { clearTimeout(t); }
    if (s) { symKeep(u, s); Cache.set(symKey(u), { v: s.v.map(x => ({ m: x.m, a: x.a })) }); }      // sans les silhouettes adoucies (refaites à la demande)
    return s;
  })().finally(() => SSYM.load.delete(u));
  SSYM.load.set(u, pr); return pr;
}
/** Adresse du symbole d'une extension : celle de la liste des extensions (les promos partagent souvent celui de leur extension), sinon d'après le code. */
const symUrl = set => (typeof setIcon === 'function' && setIcon(set)) || 'https://svgs.scryfall.io/sets/' + String(set || '').toLowerCase().replace(/[^a-z0-9]/g, '') + '.svg';
/**
 * Étape « symbole » du choix de l'édition (scaned.js › scanArtTry), après l'illustration : r = résultat d'artPick (null : rien comparé).
 * Illustration sûre (r.p), ligne du bas lue, extension unique, choix à la main : rien (r rendu tel quel, aucun symbole lu). Sinon les éditions encore possibles
 * (r.group : même illustration ; sinon toutes les candidates cands) sont regroupées par symbole : symbole sûr d'une seule extension → { ...r, p, sym } (son impression
 * principale parmi elles) ; d'un symbole partagé (promos) ou de symboles presque pareils → { ...r, group, sym } (le choix se fait parmi elles) ; sinon r. La signature de la ligne (it.sym) sert une fois.
 */
async function symNarrow(it, cands, r) {
  const sig = it.sym; it.sym = null;
  if ((r && r.p) || it.nx || ['man', 'read', 'solo', 'off', 'none'].includes(it.es) || !Array.isArray(cands)) return r;
  const pool = r && r.group && r.group.length > 1 ? r.group : cands;
  if (new Set(pool.map(p => p.set)).size < 2) return r;      // une seule extension possible : le symbole n'apprend rien
  const shown = typeof scanShown === 'function' ? scanShown(it) : it.name;
  if (!sig) { SC.sym = { name: shown, res: '∅' }; return r; }      // aucun symbole à sa place sur la photo (carte d'avant Exodus sans symbole, reflet, autre cadre)
  if (typeof SETIC !== 'undefined' && !SETIC.m && typeof setIcLoad === 'function') await Promise.race([setIcLoad(), new Promise(res => setTimeout(res, 6000))]);      // symboles de la liste des extensions (gardée 30 jours)
  const by = new Map();
  for (const p of pool) { const u = symUrl(p.set); let c = by.get(u); if (!c) by.set(u, c = { u, sets: new Set(), prints: [] }); c.sets.add(p.set); c.prints.push(p); }
  const cls = [...by.values()];
  if (cls.length < 2 || cls.length > SYM_CAND) return r;
  const known = await Promise.all(cls.map(c => symRefKnown(c.u)));
  if (known.filter(k => k === undefined).length > SYM_MOBILE && typeof artMetered === 'function' && artMetered()) { SC.sym = { name: shown, res: '⧗ ' + cls.length }; return r; }      // réseau mobile : trop de symboles à télécharger
  const refs = known.slice();
  for (let i = 0; i < cls.length; i += 6) { const part = await Promise.all(cls.slice(i, i + 6).map((c, j) => (refs[i + j] !== undefined ? refs[i + j] : symRefSig(c.u)))); part.forEach((s, j) => { refs[i + j] = s; }); }
  const k = symRank(sig, cls.map((c, i) => ({ k: i, s: refs[i] }))), f = v => (Number.isFinite(v) ? v.toFixed(2) : '–'), c = k.k !== undefined ? cls[k.k] : null;
  const sets = is => is.flatMap(i => [...cls[i].sets]).join(',').toUpperCase();
  SC.sym = { name: shown, res: `${c ? sets([k.k]) : k.near ? '? ' + sets(k.near) : '?'} · d ${f(k.d1)} / ${f(k.d2)} · ${k.n}/${cls.length}` };
  if (!c) return k.near && k.near.length < cls.length ? { ...(r || {}), p: undefined, group: pool.filter(p => k.near.some(i => cls[i].sets.has(p.set))), sym: true } : r;      // symboles presque pareils : le choix se fait parmi eux, les autres extensions écartées
  const main = c.prints.filter(p => !(p.fx || []).includes('promo')), ms = new Set(main.map(p => p.set)), one = c.sets.size === 1 ? c.prints[0].set : ms.size === 1 ? [...ms][0] : '';      // symbole partagé avec des promos : l'extension (comme scanEdDecide)
  if (one) { const p = lotInSet(c.sets.size === 1 ? c.prints : main, one, it.l); if (p) return { ...(r || {}), p, group: undefined, sym: true }; }
  return { ...(r || {}), p: undefined, group: c.prints, sym: true };
}

if (typeof module !== 'undefined' && module.exports) module.exports = { symFill, symNorm, symCut, symCutAt, symSigData, symDT, symRefData, symBlur, symDist1, symDist, symRank, symSvgSized, SYM_N, SYM_BOX, SYM_ZH, SYM_MAX, SYM_RATIO, SYM_GAP, SYM_NEAR };
