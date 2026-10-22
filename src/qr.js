/* ── qr.js : QR codes (lien de la liste d'échange, échange en direct, table et résultat d'une partie, flyers) ─────────────────────────────
   Encodeur autonome, sans réseau ni bibliothèque : mode octets (UTF-8), correction M (≈ 15 % du code peut manquer) ou H (≈ 30 %), versions 1 à 20
   (jusqu'à 666 octets en M, 385 en H ; un lien de partage en fait ≈ 50 → version 4 en M, 6 en H ; le résultat d'une partie (compteur de vie) jusqu'à ≈ 360),
   masque choisi par les pénalités de la norme ISO/IEC 18004.
   Rendu : qrSvg, un SVG à un seul chemin, modules noirs carrés, marge de 4 modules (zone de silence) : le widget Android et l'image à partager le relisent tel quel.
   qrSvgLogo : la même chose en encre marine, niveau H, et le logo de l'appli au centre : les modules sous le logo ne sont pas dessinés, la correction d'erreurs les
   reconstitue (le côté du logo est choisi pour que le pire bloc Reed-Solomon n'y perde pas plus de 60 % de ce qu'il sait corriger : qrLogoSide). Modules carrés et
   repères classiques : rien d'autre ne s'écarte de la norme, tous les lecteurs le lisent. Vérifié par tests/test-trade.mjs (matrices de référence d'un autre encodeur,
   décodage complet : format, masque, Reed-Solomon, texte ; règle du logo). */
const QR_EC = { M: [0, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26],      // codes correcteurs par bloc, par version (1 à 20) et niveau
  H: [0, 17, 28, 22, 16, 22, 28, 26, 26, 24, 28, 24, 28, 22, 24, 24, 30, 28, 28, 26, 28] };
const QR_BLOCKS = { M: [0, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16],      // nombre de blocs Reed-Solomon, par version et niveau
  H: [0, 1, 1, 2, 4, 4, 4, 5, 6, 8, 8, 11, 11, 16, 16, 18, 16, 19, 21, 25, 25] };
const QR_LVL = { M: 0, H: 2 };      // bits du niveau dans le format (L 01, M 00, Q 11, H 10)

/** Modules disponibles pour les données et la correction (hors motifs fixes, format et version). */
const qrRaw = v => { let r = (16 * v + 128) * v + 64; if (v >= 2) { const a = Math.floor(v / 7) + 2; r -= (25 * a - 10) * a - 55; if (v >= 7) r -= 36; } return r; };
const qrDataCap = (v, ec = 'M') => Math.floor(qrRaw(v) / 8) - QR_EC[ec][v] * QR_BLOCKS[ec][v];      // octets de données
/** Produit dans GF(256), polynôme x⁸ + x⁴ + x³ + x² + 1 (0x11D). */
function qrMul(x, y) { let z = 0; for (let i = 7; i >= 0; i--) { z = (z << 1) ^ ((z >>> 7) * 0x11D); z ^= ((y >>> i) & 1) * x; } return z; }
/** Polynôme générateur de degré n (racines α⁰ … αⁿ⁻¹), coefficients du plus haut degré au plus bas, sans le 1 de tête. */
function qrDivisor(n) {
  const r = new Array(n).fill(0); r[n - 1] = 1; let root = 1;
  for (let i = 0; i < n; i++) { for (let j = 0; j < n; j++) { r[j] = qrMul(r[j], root); if (j + 1 < n) r[j] ^= r[j + 1]; } root = qrMul(root, 2); }
  return r;
}
/** Codes correcteurs d'un bloc : reste de la division de data·xⁿ par le générateur. */
function qrRemainder(data, div) {
  const r = div.map(() => 0);
  for (const b of data) { const f = b ^ r.shift(); r.push(0); for (let i = 0; i < div.length; i++) r[i] ^= qrMul(div[i], f); }
  return r;
}
/** Texte → { v (version), cw (octets dans l'ordre de placement : données puis correction, blocs entrelacés) }. ec : 'M' ou 'H' ; minV : version plancher (1 à 20). */
function qrEncode(text, ec = 'M', minV = 1) {
  const bytes = [...new TextEncoder().encode(String(text))];
  let v = Math.min(20, Math.max(1, minV | 0)); while (v <= 20 && 4 + (v < 10 ? 8 : 16) + 8 * bytes.length > qrDataCap(v, ec) * 8) v++;
  if (v > 20) throw new Error('QR : texte trop long (' + bytes.length + ' octets)');
  const cap = qrDataCap(v, ec), bits = [], put = (x, n) => { for (let i = n - 1; i >= 0; i--) bits.push((x >>> i) & 1); };
  put(4, 4); put(bytes.length, v < 10 ? 8 : 16); for (const b of bytes) put(b, 8);      // mode octets (0100), longueur, octets
  put(0, Math.min(4, cap * 8 - bits.length)); put(0, (8 - bits.length % 8) % 8);       // fin de message, puis octet complet
  const data = []; for (let i = 0; i < bits.length; i += 8) data.push(bits.slice(i, i + 8).reduce((a, b) => a * 2 + b, 0));
  for (let p = 0xEC; data.length < cap; p ^= 0xEC ^ 0x11) data.push(p);                  // remplissage 0xEC, 0x11, 0xEC…
  const nb = QR_BLOCKS[ec][v], ne = QR_EC[ec][v], total = Math.floor(qrRaw(v) / 8), short = nb - total % nb, len = Math.floor(total / nb), div = qrDivisor(ne), blocks = [];
  for (let i = 0, k = 0; i < nb; i++) { const d = data.slice(k, k += len - ne + (i < short ? 0 : 1)); blocks.push([d, qrRemainder(d, div)]); }      // blocs courts d'abord, les longs ont un octet de plus
  const cw = [];
  for (let i = 0; i <= len - ne; i++) for (const [d] of blocks) if (i < d.length) cw.push(d[i]);
  for (let i = 0; i < ne; i++) for (const [, e] of blocks) cw.push(e[i]);
  return { v, cw };
}
/** Centres des motifs d'alignement (lignes et colonnes). */
function qrAlign(v) {
  if (v === 1) return [];
  const n = Math.floor(v / 7) + 2, step = Math.ceil((v * 4 + 4) / (n * 2 - 2)) * 2, out = [6];
  for (let pos = v * 4 + 10; out.length < n; pos -= step) out.splice(1, 0, pos);
  return out;
}
const QR_MASKS = [(x, y) => (x + y) % 2 === 0, (x, y) => y % 2 === 0, x => x % 3 === 0, (x, y) => (x + y) % 3 === 0,
  (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0, (x, y) => x * y % 2 + x * y % 3 === 0, (x, y) => (x * y % 2 + x * y % 3) % 2 === 0, (x, y) => ((x + y) % 2 + x * y % 3) % 2 === 0];
/** Pénalité d'une matrice (règles 1 à 4 de la norme) : le masque le moins pénalisé se lit le mieux. */
function qrPenalty(m) {
  const n = m.length; let p = 0, dark = 0;
  const line = get => {
    let run = 1;
    for (let i = 1; i <= n; i++) { if (i < n && get(i) === get(i - 1)) run++; else { if (run >= 5) p += run - 2; run = 1; } }      // 5 pareils : 3, puis +1 par module
    // faux repère 1:1:3:1:1 (foncé, clair, foncé ×3, clair, foncé), à toute échelle k, bordé de clair : ≥ 4k d'un côté, ≥ k de l'autre (le bord du code compte comme clair)
    const r = [n]; let c = 0;      // plages alternées, la première claire (bord)
    for (let i = 0; i < n; i++) { const v = get(i); if (v === c) r[r.length - 1]++; else { r.push(1); c = v; } }
    if (c) r.push(n); else r[r.length - 1] += n;
    for (let j = 1; j + 5 < r.length; j += 2) {
      const k = r[j]; if (r[j + 1] !== k || r[j + 2] !== 3 * k || r[j + 3] !== k || r[j + 4] !== k) continue;
      if (r[j - 1] >= 4 * k && r[j + 5] >= k) p += 40; if (r[j + 5] >= 4 * k && r[j - 1] >= k) p += 40;
    }
  };
  for (let y = 0; y < n; y++) { line(x => m[y][x]); line(x => m[x][y]); }
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { dark += m[y][x]; if (x && y && m[y][x] === m[y - 1][x] && m[y][x] === m[y][x - 1] && m[y][x] === m[y - 1][x - 1]) p += 3; }
  return p + 10 * (Math.ceil(Math.abs(dark * 20 - n * n * 10) / (n * n)) - 1);
}
/** Texte → { v, n (côté en modules), mask, ec, m : lignes de Uint8Array (1 = foncé), idx : lignes d'Int16Array (numéro de l'octet placé là, −1 : motif fixe) }.
    mask : 0 à 7 pour l'imposer (tests), sinon le meilleur. ec : 'M' (défaut) ou 'H'. minV : version plancher. */
function qrMatrix(text, mask, ec = 'M', minV = 1) {
  const { v, cw } = qrEncode(text, ec, minV), n = v * 4 + 17;
  const m = Array.from({ length: n }, () => new Uint8Array(n)), fn = Array.from({ length: n }, () => new Uint8Array(n)), idx = Array.from({ length: n }, () => new Int16Array(n).fill(-1));
  const set = (x, y, d) => { m[y][x] = d ? 1 : 0; fn[y][x] = 1; };
  for (let i = 0; i < n; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0); }      // motifs de synchronisation
  for (const [cx, cy] of [[3, 3], [n - 4, 3], [3, n - 4]]) for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {      // repères (et leur bordure claire)
    const x = cx + dx, y = cy + dy, d = Math.max(Math.abs(dx), Math.abs(dy)); if (x >= 0 && x < n && y >= 0 && y < n) set(x, y, d !== 2 && d !== 4);
  }
  const al = qrAlign(v), last = al.length - 1;
  al.forEach((a, i) => al.forEach((b, j) => { if ((!i && !j) || (!i && j === last) || (i === last && !j)) return; for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) set(a + dx, b + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1); }));
  const format = k => {      // niveau (M 00, H 10) + masque, BCH(15,5), XOR 0x5412 ; deux copies, et le module toujours foncé
    k |= QR_LVL[ec] << 3; let r = k; for (let i = 0; i < 10; i++) r = (r << 1) ^ ((r >>> 9) * 0x537);
    const b = ((k << 10) | r) ^ 0x5412, bit = i => (b >>> i) & 1;
    for (let i = 0; i <= 5; i++) set(8, i, bit(i));
    set(8, 7, bit(6)); set(8, 8, bit(7)); set(7, 8, bit(8));
    for (let i = 9; i < 15; i++) set(14 - i, 8, bit(i));
    for (let i = 0; i < 8; i++) set(n - 1 - i, 8, bit(i));
    for (let i = 8; i < 15; i++) set(8, n - 15 + i, bit(i));
    set(8, n - 8, 1);
  };
  format(0);      // réserve les emplacements avant de placer les données
  if (v >= 7) {      // version (BCH 18,6), deux copies
    let r = v; for (let i = 0; i < 12; i++) r = (r << 1) ^ ((r >>> 11) * 0x1F25);
    const b = (v << 12) | r; for (let i = 0; i < 18; i++) { const d = (b >>> i) & 1, a = n - 11 + i % 3, c = Math.floor(i / 3); set(a, c, d); set(c, a, d); }
  }
  let i = 0;      // données : colonnes de 2 en zigzag depuis le coin bas droit, la colonne 6 (synchronisation) sautée
  for (let right = n - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < n; vert++) for (let j = 0; j < 2; j++) {
      const x = right - j, y = ((right + 1) & 2) === 0 ? n - 1 - vert : vert;
      if (!fn[y][x] && i < cw.length * 8) { m[y][x] = (cw[i >>> 3] >>> (7 - (i & 7))) & 1; idx[y][x] = i >>> 3; i++; }
    }
  }
  const apply = k => { for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (!fn[y][x] && QR_MASKS[k](x, y)) m[y][x] ^= 1; };
  let best = Number.isInteger(mask) && mask >= 0 && mask < 8 ? mask : -1;
  if (best < 0) {
    let low = Infinity;
    for (let k = 0; k < 8; k++) { apply(k); format(k); const p = qrPenalty(m); if (p < low) { low = p; best = k; } apply(k); }      // le masque s'annule en le réappliquant
  }
  apply(best); format(best);
  return { v, n, mask: best, ec, m, idx };
}
/** Chemin des modules foncés (plages horizontales fusionnées), marge q ; hole : [a, b[ (lignes et colonnes) laissé vide. */
function qrPath(m, q, hole) {
  const n = m.length, skip = hole ? (x, y) => x >= hole[0] && x < hole[1] && y >= hole[0] && y < hole[1] : () => false;
  let d = '';
  for (let y = 0; y < n; y++) for (let x = 0; x < n;) { if (!m[y][x] || skip(x, y)) { x++; continue; } let w = 1; while (x + w < n && m[y][x + w] && !skip(x + w, y)) w++; d += `M${x + q} ${y + q}h${w}v1h-${w}z`; x += w; }
  return d;
}
/** SVG du QR code : fond blanc, modules noirs (un lecteur attend du foncé sur clair, thème sombre compris), marge de 4 modules. */
function qrSvg(text) {
  const { n, m } = qrMatrix(text), q = 4, s = n + 2 * q;
  return { n: s, svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${s} ${s}" shape-rendering="crispEdges" aria-hidden="true"><rect width="${s}" height="${s}" fill="#fff"/><path d="${qrPath(m, q)}" fill="#000"/></svg>` };
}
/** Bloc Reed-Solomon de l'octet k (ordre de placement) : données entrelacées (les blocs courts d'abord, les longs ont un octet de plus), puis correction entrelacée. */
function qrBlockOf(k, v, ec) {
  const nb = QR_BLOCKS[ec][v], ne = QR_EC[ec][v], total = Math.floor(qrRaw(v) / 8), short = nb - total % nb, dl = Math.floor(total / nb) - ne, nd = total - ne * nb;
  if (k < nd) return k < nb * dl ? k % nb : short + (k - nb * dl);
  return (k - nd) % nb;
}
/** Côté (en modules, impair, centré) de la fenêtre du logo : la plus grande ≈ 30 % du code telle qu'aucun bloc n'ait plus de 60 % de sa capacité de correction
    (⌊codes correcteurs / 2⌋ octets) sous le logo, même si tous les modules cachés étaient foncés ; 0 si même 7 modules sont de trop (textes très courts). */
function qrLogoSide({ v, n, ec, idx }) {
  for (let L = Math.round(n * .3) | 1; L >= 7; L -= 2) {
    const a = (n - L) / 2, per = new Array(QR_BLOCKS[ec][v]).fill(0), seen = new Set(); let worst = 0;
    for (let y = a; y < a + L; y++) for (let x = a; x < a + L; x++) { const k = idx[y][x]; if (k < 0 || seen.has(k)) continue; seen.add(k); worst = Math.max(worst, ++per[qrBlockOf(k, v, ec)]); }
    if (worst <= Math.floor(QR_EC[ec][v] / 2) * .6) return L;
  }
  return 0;
}
// Logo de l'appli (copie du <symbol id="i-logo"> de body.html, viewBox 6 8 88 88) : inclus dans le SVG lui-même, qui doit se suffire (image à partager, flyers)
const QR_LOGO = '<g transform="rotate(-20 50 52)"><path d="M12 52A38 13 0 0 1 88 52" fill="none" stroke="#9aa3b8" stroke-width="2.6" stroke-linecap="round"/><circle cx="27.7" cy="41.5" r="3.6" fill="#ff7a5c"/><circle cx="72.3" cy="41.5" r="3.6" fill="#6fd08c"/></g>'
  + '<g transform="rotate(-11 51 50)"><rect x="37" y="27" width="28" height="41" rx="5" fill="url(#FOIL)"/><rect x="39.6" y="29.6" width="22.8" height="35.8" rx="3.2" fill="none" stroke="#fff" stroke-opacity=".5" stroke-width="1.2"/></g>'
  + '<g transform="rotate(-20 50 52)"><path d="M12 52A38 13 0 0 0 88 52" fill="none" stroke="#9aa3b8" stroke-width="2.6" stroke-linecap="round"/><circle cx="86.1" cy="56" r="4.6" fill="#7fb0ff"/><circle cx="50" cy="65" r="4.6" fill="#f8f6d8"/><circle cx="13.9" cy="56" r="4.6" fill="#b5a3c8"/></g>';
const QR_FOIL = '<stop offset="0" stop-color="#ff8fc3"/><stop offset=".26" stop-color="#ffd479"/><stop offset=".5" stop-color="#7be8c8"/><stop offset=".74" stop-color="#7fb0ff"/><stop offset="1" stop-color="#c79bff"/>';
let qrUid = 0;
const QR_LOGO_VMAX = 15;      // au-delà (plus de ≈ 220 octets) : niveau M sans logo, comme le résultat d'une partie (compteur de vie, partie-ui.js, PU_QR_MAX)
/** SVG du QR code de l'appli : fond blanc, modules carrés en encre marine, niveau H et le logo au centre (sur une pastille blanche arrondie).
    → { n (côté avec la marge), svg, logo (faux si le texte demande plus que la version 15 en H : niveau M, sans logo, même encre ; le code reste assez aéré pour un écran de téléphone) }. Le chemin des modules est le premier
    <path> du SVG (l'image à partager le relit). Le dégradé du logo a un identifiant unique : plusieurs codes peuvent vivre dans la même page.
    opts.minV : version plancher (imprimés : un lien court donnerait une version 4, dont la fenêtre n'a que 7 modules ; en version 5, 11 modules, le logo se voit). */
function qrSvgLogo(text, opts = {}) {
  let mx = null; try { mx = qrMatrix(text, undefined, 'H', opts.minV); } catch (e) { mx = null; }      // trop long pour le niveau H
  if (!mx || mx.v > QR_LOGO_VMAX) mx = qrMatrix(text);
  const { n, m } = mx, q = 4, s = n + 2 * q, L = mx.ec === 'H' ? qrLogoSide(mx) : 0, a = (n - L) / 2, id = 'qrf' + (++qrUid);
  let logo = '';
  if (L) {      // pastille : la fenêtre moins ½ module de chaque côté (un liseré clair entre les modules et la pastille) ; le logo la déborde un peu (son viewBox a de l'air)
    const X = a + q + .5, sz = L - 1, k = sz * 1.12 / 88;
    logo = `<g shape-rendering="geometricPrecision"><defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1">${QR_FOIL}</linearGradient></defs><rect x="${X}" y="${X}" width="${sz}" height="${sz}" rx="${(sz * .22).toFixed(2)}" fill="#fff"/>`
      + `<g transform="translate(${(X - sz * .06).toFixed(3)} ${(X - sz * .06).toFixed(3)}) scale(${k.toFixed(4)}) translate(-6 -8)">${QR_LOGO.replace('url(#FOIL)', `url(#${id})`)}</g></g>`;
  }
  return { n: s, logo: L > 0, svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${s} ${s}" shape-rendering="crispEdges" aria-hidden="true"><rect width="${s}" height="${s}" fill="#fff"/><path d="${qrPath(m, q, L ? [a, a + L] : null)}" fill="#10152b"/>${logo}</svg>` };
}

if (typeof module !== 'undefined' && module.exports) module.exports = { qrEncode, qrMatrix, qrSvg, qrSvgLogo, qrLogoSide, qrBlockOf, qrPenalty, qrDataCap };
