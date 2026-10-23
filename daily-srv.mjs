// Mana Orbit — « Carte mystère », le jeu du jour : côté serveur (aucune dépendance npm : node:zlib, node:crypto, node:fs). Chargé par proxy.mjs (dailyMake),
// testé seul par tests/test-daily.mjs (horloge, Scryfall, jetons et dossier injectés).
//   · Une carte par jour, la même pour tous, à heure fixe (DAILY_HOUR, 18 h, fuseau DAILY_TZ, Europe/Paris) : la « journée » va de 18:00 à 18:00.
//   · Tirée par le serveur parmi les impressions portugaises (la plus rare des 6 langues de l'appli) au cadre moderne, puis vérifiée en fr, de, es, it, en
//     (Scryfall /cards/{set}/{num}/{lang}, image PNG comprise) ; graine : la date (HMAC d'un secret du serveur : le dépôt est public, personne ne refait le tirage).
//   · Le serveur fabrique lui-même les images des étapes (décodeur et encodeur PNG ci-dessous, découpe aux proportions du cadre 2015, gros plan sur un détail puis dézoom) et les sert
//     une à une ; l'appli ne reçoit jamais l'image entière, l'adresse Scryfall, l'identifiant ni le nom de la carte avant la fin.
//   · Score, temps et classements calculés ici seulement ; stockage : DAILY_DIR (défaut .data/daily, non versionné), un JSON par jour.
//   · Comptes secondaires : perdant sans réponse avant la carte suivante, un appareil = un compte classé par jour, même réseau → « à vérifier », comptes établis seulement.
//   · Notification « nouvelle Carte mystère » (o.push : envoi Web Push ou FCM de proxy.mjs) : les appareils des comptes qui l'acceptent, prévenus une fois par jour dès que la carte est prête.
//   · Carte de la veille révélée (o.reveal : discord-srv.mjs, message dans #carte-mystère) : une fois par jour, dès que la nouvelle carte est prête.
//   · Sur Discord aussi (o.announce, o.weekly : discord-daily.mjs) : nouvelle carte annoncée avec le ping du rôle « 🔮 Carte mystère » (une fois par jour, dès qu'elle est prête),
//     classement de la semaine le dimanche à l'ouverture de la carte (lundi → samedi clos).
import { inflateSync, deflateSync } from 'node:zlib';
import { createHash, createHmac, randomBytes } from 'node:crypto';
import { readFile, writeFile, mkdir, rename, readdir, rm, unlink } from 'node:fs/promises';
import { join, dirname } from 'node:path';

/* ── PNG : décodeur (inflate + filtres, Adam7, toutes profondeurs) et encodeur (IHDR, IDAT deflate, IEND, CRC32) ─────────────────────────────── */
const PNG_SIG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const CRC_T = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
/** CRC-32 (celui de PNG et de zlib) d'un ou plusieurs morceaux. */
export function crc32(...bufs) {
  let c = 0xffffffff;
  for (const b of bufs) for (let i = 0; i < b.length; i++) c = CRC_T[(c ^ b[i]) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
const PNG_CH = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }, PNG_DEPTHS = { 0: [1, 2, 4, 8, 16], 2: [8, 16], 3: [1, 2, 4, 8], 4: [8, 16], 6: [8, 16] };
const ADAM7 = [[0, 0, 8, 8], [4, 0, 8, 8], [0, 4, 4, 8], [2, 0, 4, 4], [0, 2, 2, 4], [1, 0, 2, 2], [0, 1, 1, 2]];      // départ x, y, pas x, y de chaque passe
const paeth = (a, b, c) => { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); return pa <= pb && pa <= pc ? a : pb <= pc ? b : c; };
/** Lignes filtrées d'une passe → octets bruts (Uint8Array ph × stride) ; off : position dans les données décompressées. */
function pngUnfilter(raw, off, pw, ph, stride, bpp) {
  const out = new Uint8Array(ph * stride);
  for (let y = 0; y < ph; y++) {
    const f = raw[off++], row = out.subarray(y * stride, (y + 1) * stride), up = y ? out.subarray((y - 1) * stride, y * stride) : null;
    row.set(raw.subarray(off, off + stride)); off += stride;
    if (f === 1) for (let x = bpp; x < stride; x++) row[x] += row[x - bpp];
    else if (f === 2) { if (up) for (let x = 0; x < stride; x++) row[x] += up[x]; }
    else if (f === 3) for (let x = 0; x < stride; x++) row[x] += ((x >= bpp ? row[x - bpp] : 0) + (up ? up[x] : 0)) >> 1;
    else if (f === 4) for (let x = 0; x < stride; x++) row[x] += paeth(x >= bpp ? row[x - bpp] : 0, up ? up[x] : 0, up && x >= bpp ? up[x - bpp] : 0);
    else if (f !== 0) throw new Error('png : filtre ' + f);
  }
  return { out, off };
}
/** PNG → { w, h, data : RGBA 8 bits (Uint8Array w × h × 4) }. Erreur si le fichier est abîmé, tronqué, trop grand (max pixels) ou d'un format inconnu. */
export function pngDecode(input, max = 40e6) {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(input);
  if (buf.length < 45 || !buf.subarray(0, 8).equals(PNG_SIG)) throw new Error('png : signature');
  let i = 8, w = 0, h = 0, depth = 0, ct = -1, il = 0, pal = null, trns = null, end = false; const idat = [];
  while (i + 12 <= buf.length) {
    const len = buf.readUInt32BE(i), type = buf.toString('latin1', i + 4, i + 8);
    if (len > buf.length - i - 12) throw new Error('png : morceau ' + type + ' tronqué');
    const data = buf.subarray(i + 8, i + 8 + len);
    if (crc32(buf.subarray(i + 4, i + 8 + len)) !== buf.readUInt32BE(i + 8 + len)) throw new Error('png : CRC de ' + type);
    i += 12 + len;
    if (type === 'IHDR') {
      if (len !== 13) throw new Error('png : IHDR');
      w = data.readUInt32BE(0); h = data.readUInt32BE(4); depth = data[8]; ct = data[9]; il = data[12];
      if (!w || !h || w * h > max) throw new Error('png : taille ' + w + '×' + h);
      if (!(PNG_DEPTHS[ct] || []).includes(depth) || data[10] !== 0 || data[11] !== 0 || il > 1) throw new Error('png : format');
    } else if (!w) throw new Error('png : IHDR absent');
    else if (type === 'PLTE') pal = data;
    else if (type === 'tRNS') trns = data;
    else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') { end = true; break; }
    else if (!(type.charCodeAt(0) & 32)) throw new Error('png : morceau critique inconnu ' + type);      // première lettre majuscule : indispensable à la lecture
  }
  if (!w || !idat.length || !end) throw new Error('png : incomplet');
  if (ct === 3 && !pal) throw new Error('png : palette absente');
  const ch = PNG_CH[ct], bits = ch * depth, bpp = Math.max(1, bits >> 3), stride = pw => Math.ceil(pw * bits / 8);
  const passes = il ? ADAM7.map(([x0, y0, dx, dy]) => [x0, y0, dx, dy, Math.ceil((w - x0) / dx), Math.ceil((h - y0) / dy)]).filter(p => p[4] > 0 && p[5] > 0) : [[0, 0, 1, 1, w, h]];
  const need = passes.reduce((a, p) => a + p[5] * (1 + stride(p[4])), 0);
  let raw; try { raw = inflateSync(Buffer.concat(idat), { maxOutputLength: need + 1 }); } catch (e) { throw new Error('png : données illisibles'); }
  if (raw.length < need) throw new Error('png : données tronquées');
  const out = new Uint8Array(w * h * 4), mx = (1 << depth) - 1;
  const t16 = (o, k) => (trns && trns.length >= o + 2 ? trns.readUInt16BE(o) : -1);      // couleur transparente (gris, RVB) : valeur brute de l'échantillon
  const tg = ct === 0 ? t16(0) : -1, tr = ct === 2 ? [t16(0), t16(2), t16(4)] : null;
  let off = 0;
  for (const [x0, y0, dx, dy, pw, ph] of passes) {
    const s = stride(pw), u = pngUnfilter(raw, off, pw, ph, s, bpp), px = u.out; off = u.off;
    const sv = (row, k) => depth === 8 ? px[row + k] : depth === 16 ? (px[row + 2 * k] << 8) | px[row + 2 * k + 1] : (px[row + ((k * depth) >> 3)] >> (8 - depth - ((k * depth) & 7))) & mx;
    const to8 = v => (depth === 16 ? v >> 8 : depth === 8 ? v : Math.round(v * 255 / mx));
    for (let y = 0; y < ph; y++) {
      const row = y * s;
      for (let x = 0; x < pw; x++) {
        const o = ((y0 + y * dy) * w + x0 + x * dx) * 4, k = x * ch;
        if (ct === 0) { const v = sv(row, k), g = to8(v); out[o] = out[o + 1] = out[o + 2] = g; out[o + 3] = v === tg ? 0 : 255; }
        else if (ct === 2) { const r = sv(row, k), g = sv(row, k + 1), b = sv(row, k + 2); out[o] = to8(r); out[o + 1] = to8(g); out[o + 2] = to8(b); out[o + 3] = tr && r === tr[0] && g === tr[1] && b === tr[2] ? 0 : 255; }
        else if (ct === 3) { const v = sv(row, k); if (v * 3 + 2 >= pal.length) throw new Error('png : couleur hors palette'); out[o] = pal[v * 3]; out[o + 1] = pal[v * 3 + 1]; out[o + 2] = pal[v * 3 + 2]; out[o + 3] = trns && v < trns.length ? trns[v] : 255; }
        else if (ct === 4) { const g = to8(sv(row, k)); out[o] = out[o + 1] = out[o + 2] = g; out[o + 3] = to8(sv(row, k + 1)); }
        else { out[o] = to8(sv(row, k)); out[o + 1] = to8(sv(row, k + 1)); out[o + 2] = to8(sv(row, k + 2)); out[o + 3] = to8(sv(row, k + 3)); }
      }
    }
  }
  return { w, h, data: out };
}
function pngChunk(type, data) {
  const head = Buffer.alloc(8); head.writeUInt32BE(data.length, 0); head.write(type, 4, 'latin1');
  const tail = Buffer.alloc(4); tail.writeUInt32BE(crc32(head.subarray(4), data), 0);
  return Buffer.concat([head, data, tail]);
}
/** { w, h, data RGBA } → PNG 8 bits RVB (alpha posé sur du noir) ou RVBA (o.alpha). Filtre de chaque ligne au plus petit total (heuristique habituelle),
 *  ou imposé (o.filter : 0 à 4, pour les tests) ; aucun morceau de texte ni de date : rien d'autre que l'image. */
export function pngEncode(img, o = {}) {
  const { w, h, data } = img, alpha = !!o.alpha, ch = alpha ? 4 : 3, stride = w * ch;
  if (!(w > 0 && h > 0) || data.length < w * h * 4) throw new Error('png : image invalide');
  const raw = Buffer.alloc(h * (stride + 1)), cur = new Uint8Array(stride), prev = new Uint8Array(stride), cand = Array.from({ length: 5 }, () => new Uint8Array(stride));
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const s = (y * w + x) * 4, d = x * ch, a = data[s + 3];
      if (alpha) { cur[d] = data[s]; cur[d + 1] = data[s + 1]; cur[d + 2] = data[s + 2]; cur[d + 3] = a; }
      else if (a === 255) { cur[d] = data[s]; cur[d + 1] = data[s + 1]; cur[d + 2] = data[s + 2]; }
      else { cur[d] = data[s] * a / 255; cur[d + 1] = data[s + 1] * a / 255; cur[d + 2] = data[s + 2] * a / 255; }
    }
    const fs = o.filter != null ? [o.filter] : [0, 1, 2, 3, 4];
    let best = 0, bestSum = Infinity;
    for (const f of fs) {
      const c = cand[f]; let sum = 0;
      for (let x = 0; x < stride; x++) {
        const a = x >= ch ? cur[x - ch] : 0, b = y ? prev[x] : 0, cc = y && x >= ch ? prev[x - ch] : 0;
        const v = (cur[x] - (f === 0 ? 0 : f === 1 ? a : f === 2 ? b : f === 3 ? (a + b) >> 1 : paeth(a, b, cc))) & 255;
        c[x] = v; sum += v < 128 ? v : 256 - v;
      }
      if (sum < bestSum) { bestSum = sum; best = f; }
    }
    const p = y * (stride + 1); raw[p] = best; raw.set(cand[best], p + 1); prev.set(cur);
  }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = alpha ? 6 : 2;
  return Buffer.concat([PNG_SIG, pngChunk('IHDR', ihdr), pngChunk('IDAT', deflateSync(raw, { level: o.level ?? 9 })), pngChunk('IEND', Buffer.alloc(0))]);
}
/** Morceaux d'un PNG (types, dans l'ordre) : les tests vérifient qu'aucun texte n'y voyage. */
export function pngChunks(buf) { const out = []; for (let i = 8; i + 12 <= buf.length;) { const len = buf.readUInt32BE(i); out.push(buf.toString('latin1', i + 4, i + 8)); i += 12 + len; } return out; }

/* ── Images : découpe, réduction, gros plans ─────────────────────────────────────────────────────────────────────────────────────── */
/** Zone (x, y, largeur, hauteur entiers, bornés à l'image). */
export function imgCrop(img, x, y, cw, chh) {
  x = Math.max(0, Math.min(img.w - 1, Math.round(x))); y = Math.max(0, Math.min(img.h - 1, Math.round(y)));
  cw = Math.max(1, Math.min(img.w - x, Math.round(cw))); chh = Math.max(1, Math.min(img.h - y, Math.round(chh)));
  const out = new Uint8Array(cw * chh * 4);
  for (let r = 0; r < chh; r++) out.set(img.data.subarray(((y + r) * img.w + x) * 4, ((y + r) * img.w + x + cw) * 4), r * cw * 4);
  return { w: cw, h: chh, data: out };
}
/** Réduction (moyenne de chaque bloc de pixels d'origine) ; agrandir : plus proche voisin. */
export function imgResize(img, nw, nh) {
  nw = Math.max(1, Math.round(nw)); nh = Math.max(1, Math.round(nh));
  const out = new Uint8Array(nw * nh * 4), { w, h, data } = img;
  for (let y = 0; y < nh; y++) {
    const y0 = Math.floor(y * h / nh), y1 = Math.max(y0 + 1, Math.floor((y + 1) * h / nh));
    for (let x = 0; x < nw; x++) {
      const x0 = Math.floor(x * w / nw), x1 = Math.max(x0 + 1, Math.floor((x + 1) * w / nw));
      let r = 0, g = 0, b = 0, a = 0, n = 0;
      for (let yy = y0; yy < y1; yy++) for (let xx = x0, s = (yy * w + x0) * 4; xx < x1; xx++, s += 4) { r += data[s]; g += data[s + 1]; b += data[s + 2]; a += data[s + 3]; n++; }
      const o = (y * nw + x) * 4; out[o] = Math.round(r / n); out[o + 1] = Math.round(g / n); out[o + 2] = Math.round(b / n); out[o + 3] = Math.round(a / n);
    }
  }
  return { w: nw, h: nh, data: out };
}
/** Agrandissement par un facteur entier (chaque pixel devient un carré k × k : blocs nets, sans flou ni « image-rendering »). */
export function imgUp(img, k) {
  if (k <= 1) return img;
  const w = img.w * k, h = img.h * k, out = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const s = ((Math.floor(y / k)) * img.w + Math.floor(x / k)) * 4, o = (y * w + x) * 4; out[o] = img.data[s]; out[o + 1] = img.data[s + 1]; out[o + 2] = img.data[s + 2]; out[o + 3] = img.data[s + 3]; }
  return { w, h, data: out };
}
/** Agrandissement ou réduction bilinéaire (gros plans : doux, sans blocs). */
export function imgBilinear(img, nw, nh) {
  nw = Math.max(1, Math.round(nw)); nh = Math.max(1, Math.round(nh));
  const out = new Uint8Array(nw * nh * 4), { w, h, data } = img, sx = w / nw, sy = h / nh;
  for (let y = 0; y < nh; y++) {
    const fy = Math.max(0, Math.min(h - 1, (y + 0.5) * sy - 0.5)), y0 = Math.floor(fy), y1 = Math.min(h - 1, y0 + 1), ty = fy - y0;
    for (let x = 0; x < nw; x++) {
      const fx = Math.max(0, Math.min(w - 1, (x + 0.5) * sx - 0.5)), x0 = Math.floor(fx), x1 = Math.min(w - 1, x0 + 1), tx = fx - x0, o = (y * nw + x) * 4;
      const a = (y0 * w + x0) * 4, b = (y0 * w + x1) * 4, c = (y1 * w + x0) * 4, d = (y1 * w + x1) * 4;
      for (let k = 0; k < 4; k++) out[o + k] = Math.round((data[a + k] * (1 - tx) + data[b + k] * tx) * (1 - ty) + (data[c + k] * (1 - tx) + data[d + k] * tx) * ty);
    }
  }
  return { w: nw, h: nh, data: out };
}
/** Largeur bornée à maxW (proportions gardées). */
export const imgFit = (img, maxW) => (img.w <= maxW ? img : imgResize(img, maxW, img.h * maxW / img.w));

/** Zones du cadre moderne (2015) d'une image Scryfall (745 × 1040), en fractions de la largeur et de la hauteur [x0, y0, x1, y1] : l'illustration commence sous la
 *  bande du titre (nom et coût, y ≤ 0,10), la zone de texte s'arrête au-dessus de la ligne du bas (numéro, extension, artiste, y ≥ 0,93). */
export const DLY_ZONES = { art: [0.085, 0.122, 0.915, 0.553], type: [0.072, 0.562, 0.928, 0.616], text: [0.075, 0.624, 0.925, 0.897] };
export const DLY_ZOOM = [0.16, 0.27, 0.42, 0.65], DLY_ART_W = 480;      // étapes 1 à 4 : part de l'illustration montrée (gros plan, puis de moins en moins près) ; largeur des images de l'illustration
/** Zone d'une carte, en pixels. */
export function dlyZone(img, k) { const [a, b, c, d] = DLY_ZONES[k]; return imgCrop(img, a * img.w, b * img.h, (c - a) * img.w, (d - b) * img.h); }
/**
 * Point du gros plan (fractions de l'illustration) : un endroit riche en détails (contrastes), tiré au sort parmi les plus détaillés avec rnd (tirage du jour, même point
 * dans toutes les langues). L'illustration est réduite à 48 px de large, chaque fenêtre de l'étape 1 notée à la somme des écarts de luminosité entre voisins.
 */
export function dlyFocus(art, rnd = Math.random) {
  const W = 48, H = Math.max(8, Math.round(W * art.h / art.w)), sm = imgResize(art, W, H), L = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) L[i] = 0.299 * sm.data[i * 4] + 0.587 * sm.data[i * 4 + 1] + 0.114 * sm.data[i * 4 + 2];
  const E = new Float32Array(W * H); for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = y * W + x; E[i] = (x + 1 < W ? Math.abs(L[i] - L[i + 1]) : 0) + (y + 1 < H ? Math.abs(L[i] - L[i + W]) : 0); }
  const ww = Math.max(2, Math.round(DLY_ZOOM[0] * W)), wh = Math.max(2, Math.round(DLY_ZOOM[0] * H)), cand = [];
  for (let y = 0; y + wh <= H; y++) for (let x = 0; x + ww <= W; x++) { let e = 0; for (let yy = y; yy < y + wh; yy++) for (let xx = x; xx < x + ww; xx++) e += E[yy * W + xx]; cand.push({ x: (x + ww / 2) / W, y: (y + wh / 2) / H, e }); }
  cand.sort((a, b) => b.e - a.e);
  const top = cand.slice(0, Math.max(1, Math.ceil(cand.length * 0.15))), c = top[Math.min(top.length - 1, Math.floor(rnd() * top.length))];      // parmi les 15 % les plus détaillées
  return { x: Math.round(c.x * 1000) / 1000, y: Math.round(c.y * 1000) / 1000 };
}
/** Fenêtres des étapes 1 à 5 autour du point f, en fractions de l'illustration [x, y, largeur, hauteur] (mêmes proportions qu'elle, gardées dedans) ; 5 : toute l'illustration. */
export function dlyWins(f) {
  const c = (v, w) => Math.max(0, Math.min(1 - w, v - w / 2));
  return [...DLY_ZOOM, 1].map(z => [c(f.x, z), c(f.y, z), z, z]);
}
/** Fenêtre de l'étape s − 1 vue dans celle de l'étape s (2 à 5), en fractions : l'appli s'en sert pour dézoomer en douceur d'une image à l'autre. */
export function dlyZoomRel(f, s) {
  const w = dlyWins(f), a = w[s - 2], b = w[s - 1]; if (!a || !b) return null;
  return [(a[0] - b[0]) / b[2], (a[1] - b[1]) / b[3], a[2] / b[2], a[3] / b[3]].map(n => Math.round(n * 1000) / 1000);
}
/** Images des étapes 1 à 7 (PNG) : 1-4 gros plan sur un détail de l'illustration, de moins en moins près (point f), 5 illustration entière, 6 ligne de type, 7 zone de texte. */
export function dlyStages(card, f = { x: 0.5, y: 0.5 }) {
  const art = dlyZone(card, 'art'), type = dlyZone(card, 'type'), text = dlyZone(card, 'text'), H = Math.round(DLY_ART_W * art.h / art.w);
  const zoom = dlyWins(f).slice(0, 4).map(([x, y, w, h]) => imgBilinear(imgCrop(art, x * art.w, y * art.h, w * art.w, h * art.h), DLY_ART_W, H));
  return [...zoom, imgFit(art, DLY_ART_W), imgFit(type, 640), imgFit(text, 640)].map(i => pngEncode(i));
}

/* ── Règles : étapes, score, nom dévoilé par la fin ─────────────────────────────────────────────────────────────────────────────────── */
export const DLY_STEPS = 10, DLY_IMGS = 7, DLY_WRONG = 6;      // étapes (8, 9, 10 : le nom), images (étapes 1 à 7), mauvaises propositions avant de perdre
/** Mode chronométré : une étape toutes les 12 s (10 étapes = 2 min) à l'horloge de la partie, tenue par le serveur seul : temps écoulé depuis l'envoi de l'image de
 *  l'étape 1 (après le décompte), plus le temps sauté par « Indice suivant » (au début de l'étape suivante), plus 10 s par mauvaise proposition. */
export const DLY_STEP_MS = 12e3, DLY_PEN_MS = 10e3;
/** Barème continu : 1 000 points jusqu'à 0,5 s, puis −7,5 par seconde (≈ 914 à 12 s, 554 à 1 min, 104 à 2 min) ; trouvée : 50 au moins ; perdue : 0. */
export const DLY_SCORE = { base: 1000, grace: 500, perSec: 7.5, min: 50 };
/** Score (entier) d'une carte trouvée quand l'horloge de la partie marque ms. Le classement départage ensuite au temps exact (ms). */
export function dlyScore(ms) { const S = DLY_SCORE; return Math.max(S.min, Math.round(S.base - S.perSec * Math.max(0, (Number(ms) || 0) - S.grace) / 1000)); }
/** Étape montrée quand l'horloge marque ms (1 à 10). */
export const dlyStepAt = (ms, stepMs = DLY_STEP_MS) => Math.min(DLY_STEPS, Math.floor(Math.max(0, ms) / stepMs) + 1);
/** Part des lettres du nom montrée aux étapes 8, 9, 10 (par la fin), jamais plus de la moitié (arrondi bas) : le nom complet n'est jamais donné. */
export const DLY_REVEAL = [0.2, 0.35, 0.5];
/** Nom à l'étape s : lettres cachées par « _ » sauf les dernières (espaces, tirets, apostrophes, virgules restent visibles) ; avant l'étape 8 : tout caché. */
export function dlyMask(name, step) {
  const ch = Array.from(String(name || '')), idx = ch.map((c, i) => (/[\p{L}\p{N}]/u.test(c) ? i : -1)).filter(i => i >= 0), L = idx.length;
  const f = step >= 8 ? DLY_REVEAL[Math.min(DLY_REVEAL.length - 1, step - 8)] : 0;
  const k = L < 2 || !f ? 0 : Math.min(Math.floor(L / 2), Math.max(1, Math.ceil(L * f))), show = new Set(idx.slice(L - k));
  return ch.map((c, i) => (idx.includes(i) && !show.has(i) ? '_' : c)).join('');
}
/** Nom comparé : face avant d'une carte double, sans accent ni casse ni ponctuation. */
export const dlyNorm = s => String(s || '').split('//')[0].replace(/æ/gi, 'ae').replace(/œ/gi, 'oe').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/['’‘`´]/g, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

/* ── Jours, semaines, saisons à l'heure de Paris ────────────────────────────────────────────────────────────────────────────────────── */
const DAY = 86400e3;
export const dlyIso = t => new Date(t).toISOString().slice(0, 10);
const dlyUtc = key => { const [y, m, d] = String(key).split('-').map(Number); return Date.UTC(y, m - 1, d); };
export const dlyAdd = (key, n) => dlyIso(dlyUtc(key) + n * DAY);
/** Horloge d'un fuseau : clé du jour d'un instant (date de départ du défi), départ d'une clé (ms), semaine (lundi), saison (mois). Sans ICU : UTC. */
export function dlyClock(hour = 18, tz = 'Europe/Paris') {
  let f = null; try { f = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' }); } catch (e) { f = null; }
  const parts = t => {
    if (!f) { const d = new Date(t); return [d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate(), d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds()]; }
    const o = {}; for (const p of f.formatToParts(t)) o[p.type] = Number(p.value);
    return [o.year, o.month, o.day, o.hour % 24, o.minute, o.second];
  };
  const off = t => { const [y, mo, d, h, mi, s] = parts(t); return Date.UTC(y, mo - 1, d, h, mi, s) - Math.floor(t / 1000) * 1000; };      // décalage du fuseau à cet instant
  const dayOf = t => { const [y, mo, d, h] = parts(t); return dlyIso(Date.UTC(y, mo - 1, d) - (h < hour ? DAY : 0)); };
  const startOf = key => { const wall = dlyUtc(key) + hour * 3600e3; let g = wall - off(wall); g = wall - off(g); return g; };      // deux passes : juste au changement d'heure
  const weekOf = key => { const t = dlyUtc(key), wd = (new Date(t).getUTCDay() + 6) % 7; return dlyIso(t - wd * DAY); };      // lundi de la semaine (le défi du lundi 18:00 l'ouvre)
  const seasonOf = key => String(key).slice(0, 7);
  return { hour, tz: f ? tz : 'UTC', dayOf, startOf, weekOf, seasonOf, nextOf: key => startOf(dlyAdd(key, 1)) };
}
/** Numéro du défi (1 = 15 octobre 2026), pour le résultat à partager. */
export const DLY_EPOCH = '2026-10-15';
export const dlyNo = key => Math.round((dlyUtc(key) - dlyUtc(DLY_EPOCH)) / DAY) + 1;

/* ── Tirage de la carte ─────────────────────────────────────────────────────────────────────────────────────────────────────────────── */
export const DLY_LANGS = ['fr', 'en', 'de', 'es', 'it', 'pt'], DLY_CHECK = ['it', 'es', 'de', 'fr', 'en'];      // langues de l'appli ; vérifiées après le portugais, des plus rares aux plus courantes
export const DLY_QUERY = 'lang:pt frame:2015 game:paper -is:digital -is:promo -t:basic -t:token -t:planeswalker year>=2018';
const DLY_FX_BAD = new Set(['showcase', 'extendedart', 'inverted', 'etched', 'fullart', 'borderless', 'shatteredglass', 'textless', 'lesson', 'snow']), DLY_SET_BAD = new Set(['token', 'memorabilia', 'funny', 'alchemy', 'minigame', 'treasure_chest', 'vanguard', 'planechase', 'archenemy']);
/** Générateur pseudo-aléatoire reproductible (sfc32) tiré d'une graine texte. */
export function dlyRng(seed) {
  const b = createHash('sha256').update(String(seed)).digest(); let a = b.readUInt32LE(0), c = b.readUInt32LE(4), d = b.readUInt32LE(8), e = b.readUInt32LE(12);
  return () => { a >>>= 0; c >>>= 0; d >>>= 0; e >>>= 0; let t = (a + c) | 0; a = c ^ (c >>> 9); c = (d + (d << 3)) | 0; d = (d << 21) | (d >>> 11); e = (e + 1) | 0; t = (t + e) | 0; d = (d + t) | 0; return (t >>> 0) / 4294967296; };
}
/** Le texte (règles, ambiance) cite-t-il la carte ? Nom entier ou, pour une légende, ce qui précède la virgule (« Isamaru »). La zone de texte montrerait le nom. */
export function dlyNamed(text, name) {
  const t = ' ' + dlyNorm(String(text || '').replace(/\n/g, ' ')) + ' ', n = dlyNorm(name), short = String(name || '').includes(',') ? dlyNorm(String(name).split(',')[0]) : '';
  return !!n && (t.includes(' ' + n + ' ') || (short.length >= 4 && t.includes(' ' + short + ' ')));
}
/** Impression jouable pour le jeu : cadre moderne, présentation normale (une face), ni sans bordure, ni plein art, ni vitrine, ni illustration étendue,
 *  ni terrain de base, jeton, planeswalker (son type porte le nom) ni carte numérique ; image PNG présente ; texte qui ne cite pas la carte. */
export function dlyPrintOk(c, lang) {
  if (!c || typeof c !== 'object' || c.lang !== lang || c.layout !== 'normal' || c.frame !== '2015' || c.digital || c.promo || c.full_art || c.textless || c.oversized) return false;
  if (!['black', 'white'].includes(c.border_color) || (c.frame_effects || []).some(x => DLY_FX_BAD.has(x)) || DLY_SET_BAD.has(c.set_type)) return false;
  if (/\b(basic|token|planeswalker|emblem|dungeon|plane|scheme|vanguard|conspiracy)\b/i.test(String(c.type_line || ''))) return false;
  if (['missing', 'placeholder'].includes(c.image_status) || !c.image_uris || typeof c.image_uris.png !== 'string' || typeof c.image_uris.large !== 'string') return false;
  if (typeof c.name !== 'string' || !c.name || c.name.includes('//') || !c.set || !c.collector_number) return false;
  const shown = lang === 'en' ? c.name : c.printed_name || c.name;
  return ![c.oracle_text, c.printed_text, c.flavor_text].some(t => t && (dlyNamed(t, c.name) || dlyNamed(t, shown)));
}

/* ── Le jeu (routes /api/daily…) ────────────────────────────────────────────────────────────────────────────────────────────────────── */
const dlyJson = (res, status, obj, extra = {}) => { const b = JSON.stringify(obj); res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...extra }); res.end(b); };
const dlyBody = (req, max) => new Promise((ok, ko) => { const c = []; let n = 0; req.on('data', d => { n += d.length; if (n > max) { req.pause(); ko(Object.assign(new Error('too large'), { status: 413 })); } else c.push(d); }); req.on('end', () => ok(Buffer.concat(c))); req.on('error', ko); });
const KEY_RE = /^[\w-]{24}$/, DAY_RE = /^\d{4}-\d{2}-\d{2}$/, DLY_ROUTES = ['start', 'go', 'play', 'next', 'guess', 'giveup', 'img', 'board', 'badges', 'report', 'name', 'recheck', 'push'];
const DLY_NOSTAT = { played: 0, won: 0, stage1: 0, points: 0, top100: 0, podium: 0, first: 0, cur: 0, best: 0, last: '', at: {}, h: [] };
export const dlyTag = uid => createHash('sha256').update(String(uid)).digest('hex');      // même empreinte que les amis (amTag)
/** Notification « nouvelle Carte mystère » : titre et texte dans la langue de l'appareil (comme les notifications des amis, proxy.mjs › AM_TXT ; français par défaut) ;
 *  toucher : le jeu (./?mystere=1 : push.js › pushOpen, app.js › handleLaunch). */
export const DLY_PUSH_TXT = {
  fr: ['La Carte mystère du jour est là', 'Devine-la avant les autres.'],
  en: ['Today\'s Mystery card is here', 'Guess it before everyone else.'],
  de: ['Die Mysterykarte des Tages ist da', 'Errate sie vor allen anderen.'],
  es: ['Ya está aquí la Carta misteriosa del día', 'Adivínala antes que nadie.'],
  it: ['È arrivata la Carta misteriosa del giorno', 'Indovinala prima degli altri.'],
  pt: ['A Carta mistério do dia chegou', 'Adivinhe antes de todo mundo.'],
}, DLY_PUSH_URL = './?mystere=1';
/** Pseudo du classement : nom du profil, sans caractère de contrôle ni chevron, 24 caractères ; refusé par le filtre de mots : vide. */
export function dlyName(v, bad) { const s = typeof v === 'string' ? v.replace(/\s+/g, ' ').replace(/[\p{Cc}\p{Cf}<>]/gu, '').replace(/ {2,}/g, ' ').trim().slice(0, 24).trim() : ''; return s && !(bad && bad(s)) ? s : ''; }
const dlyFall = tag => 'Joueur ' + String(tag).slice(0, 4).toUpperCase();      // sans pseudo : « Joueur 3FA2 » (4 caractères de l'empreinte, rien du compte)
/** Classement : score, puis plus de jours joués (semaine, saison), puis moins de temps, puis le premier arrivé. */
const dlyCmp = (a, b) => b.s - a.s || (b.d || 1) - (a.d || 1) || a.ms - b.ms || (a.at || 0) - (b.at || 0) || (a.tag < b.tag ? -1 : 1);

/** Crée le jeu. o : { dir, scry (API Scryfall), imgHosts (débuts d'adresse permis pour les PNG), hour, tz, now, fetch, secret, verify (jeton → { uid, emailVerified, provider }), bad (filtre de mots),
 *  account (uid → { created } : date de création du compte, ou null), net (requête → réseau du client, '' si inconnu), minAgeDays (âge minimal d'un compte classé ; 0 par défaut : aucun), ipWindowMs (10 min),
 *  json, readBody, rateWait, tooMany, tooLarge, isLocked, badKey, log, gapMs (écart entre deux requêtes Scryfall), firstMs, tickMs, earlyMs, retryMs, query, tries, pages, ua,
 *  push ({ send, target } : notification), reveal (info → promesse : carte de la veille annoncée ailleurs ; null : rien),
 *  announce, weekly (info → promesse : carte du jour annoncée, classement du dimanche ; null : rien), announceWindowMs (pushWindowMs), announceOrderMs (10 min) }.
 *  Contre les comptes secondaires (on ne peut pas tout empêcher, la triche doit coûter et ne rien rapporter au classement) : réponse jamais donnée à un perdant avant la carte
 *  suivante ; un appareil = un compte classé par jour (sinon entraînement) ; même réseau juste après un autre joueur : « à vérifier », hors du top 100 public sans le dire ;
 *  classement réservé aux comptes Google ou à adresse vérifiée (et, si minAgeDays, de plus de minAgeDays jours) ; trop de cartes trouvées à l'étape 1 : signalé au panneau. */
export function dailyMake(o = {}) {
  const now = o.now || Date.now, fetchFn = o.fetch || globalThis.fetch, log = o.log || console, dir = o.dir || join(process.cwd(), '.data', 'daily');
  const C = dlyClock(o.hour ?? 18, o.tz || 'Europe/Paris'), SCRY = String(o.scry || 'https://api.scryfall.com').replace(/\/+$/, '');
  const imgHosts = o.imgHosts || ['https://cards.scryfall.io/'], UA = o.ua || 'ManaOrbit/1.0 (+https://manaorbit.app)';
  const json = o.json || dlyJson, readBody = o.readBody || dlyBody, rateWait = o.rateWait || (() => 0), isLocked = o.isLocked || (() => false);
  const tooMany = o.tooMany || ((res, s) => json(res, 429, { error: 'rate_limited', retry: s }, { 'Retry-After': String(s) }));
  const tooLarge = o.tooLarge || (res => json(res, 413, { error: 'too_large' }));
  const badKey = o.badKey || ((req, res) => json(res, 401, { error: 'bad_token', message: 'Jeton de connexion invalide.' }));
  const GAP = o.gapMs ?? 110, TRIES = Math.max(1, o.tries || 30), PAGES = Math.max(1, o.pages || 12), QUERY = o.query || DLY_QUERY;
  const RETRY = o.retryMs ?? 5 * 60e3, EARLY = o.earlyMs ?? 45 * 60e3, KEEP_DAYS = 400, IMG_DAYS = 2, ANON_MAX = 50000;
  const G = { repBy: new Map(), cur: null, next: null, imgs: new Map(), keys: new Map(), anon: new Map(), stats: null, hidden: null, secret: o.secret || '', sums: new Map(), prep: new Map(), lastScry: 0, timer: null, purged: '', saving: new Map(), boot: null, board: new Map() };

  /* ── Disque ── */
  const fileOf = day => join(dir, day + '.json'), imgDir = day => join(dir, 'img', day);
  async function put(f, s) { await mkdir(dirname(f), { recursive: true }); await writeFile(f + '.tmp', s); await rename(f + '.tmp', f); }
  async function getJson(f) { try { return JSON.parse(await readFile(f, 'utf8')); } catch (e) { return null; } }
  /** Écriture groupée (1,5 s) d'un jour ; flush : tout de suite. */
  function saveSoon(rec, flush) {
    const k = rec.day, w = G.saving.get(k) || {}; G.saving.set(k, w); w.rec = rec;
    const go = () => { clearTimeout(w.t); w.t = null; G.saving.delete(k); const { imgs, ...plain } = w.rec; return put(fileOf(k), JSON.stringify(plain)).catch(e => log.warn('Carte mystère : enregistrement impossible (' + (e && e.code || e) + ')')); };
    if (flush) return go();
    if (!w.t) { w.t = setTimeout(go, 1500); if (w.t.unref) w.t.unref(); }
    return Promise.resolve();
  }
  const statsSave = () => put(join(dir, 'stats.json'), JSON.stringify(G.stats)).catch(e => log.warn('Carte mystère : statistiques non enregistrées (' + (e && e.code || e) + ')'));
  let statsT = null; const statsSoon = () => { if (!statsT) { statsT = setTimeout(() => { statsT = null; statsSave(); }, 1500); if (statsT.unref) statsT.unref(); } };
  async function secret() {
    if (G.secret) return G.secret;
    const f = join(dir, '.secret'); let s = ''; try { s = (await readFile(f, 'utf8')).trim(); } catch (e) { /* pas encore */ }
    if (!/^[0-9a-f]{64}$/.test(s)) { s = randomBytes(32).toString('hex'); try { await put(f, s); } catch (e) { log.warn('Carte mystère : secret non enregistré'); } }
    return (G.secret = s);
  }
  async function bootLoad() {
    if (!G.boot) G.boot = (async () => {
      const st = await getJson(join(dir, 'stats.json')); G.stats = st && st.p && typeof st.p === 'object' ? st : { v: 1, p: {} };
      const hd = await getJson(join(dir, 'hidden.json')); G.hidden = new Map(hd && Array.isArray(hd.h) ? hd.h.filter(x => x && typeof x.t === 'string').map(x => [x.t, { n: String(x.n || ''), at: Number(x.at) || 0 }]) : []);
      const rp = await getJson(join(dir, 'reports.json')); G.rep = new Map(rp && Array.isArray(rp.r) ? rp.r.filter(x => x && typeof x.t === 'string' && Array.isArray(x.by)).map(x => [x.t, { by: x.by.filter(b => typeof b === 'string').slice(0, 50), n: String(x.n || ''), at: Number(x.at) || 0 }]) : []);
    })();
    return G.boot;
  }
  const recNew = day => ({ v: 1, day, st: 'wait', card: null, plays: {}, closed: false, at: 0 });
  async function recLoad(day) { const j = await getJson(fileOf(day)); return j && j.day === day && j.plays && typeof j.plays === 'object' ? { ...recNew(day), ...j } : null; }
  function recUse(rec) { for (const [tag, p] of Object.entries(rec.plays)) if (p && KEY_RE.test(p.k)) G.keys.set(p.k, { day: rec.day, tag }); }

  /* ── Scryfall ── */
  async function scry(path) {
    const wait = G.lastScry + GAP - now(); if (wait > 0) await new Promise(r => setTimeout(r, wait));
    G.lastScry = now();
    let r; try { r = await fetchFn(SCRY + path, { headers: { Accept: 'application/json', 'User-Agent': UA }, redirect: 'manual', signal: AbortSignal.timeout(15000) }); } catch (e) { throw new Error('Scryfall injoignable'); }
    if (r.status === 404) return null;
    if (r.status === 429) { G.lastScry = now() + 5000; throw new Error('Scryfall : trop de requêtes'); }
    if (!r.ok) throw new Error('Scryfall : HTTP ' + r.status);
    return r.json();
  }
  async function png(url) {
    if (!imgHosts.some(h => String(url).startsWith(h))) throw new Error('image refusée');
    let r; try { r = await fetchFn(url, { headers: { 'User-Agent': UA }, redirect: 'manual', signal: AbortSignal.timeout(30000) }); } catch (e) { throw new Error('image injoignable'); }
    if (!r.ok) throw new Error('image : HTTP ' + r.status);
    if (Number(r.headers.get('content-length')) > 12e6) throw new Error('image trop lourde');
    const b = Buffer.from(await r.arrayBuffer()); if (b.length > 12e6) throw new Error('image trop lourde');
    return pngDecode(b, 6e6);
  }
  const pick = c => ({ n: (c.lang === 'en' ? c.name : c.printed_name) || c.name, png: c.image_uris.png, img: c.image_uris.large });
  /** Carte du jour : impressions portugaises récentes au cadre moderne (page tirée au sort), puis chaque langue vérifiée ; TRIES essais au plus.
   *  Aucune impression complète : la plus complète (anglais exigé), image anglaise pour les langues qui manquent (même carte pour tous : classement commun). */
  async function draw(day) {
    const rnd = dlyRng(createHmac('sha256', await secret()).update('draw|' + day).digest('hex'));
    const q = '/cards/search?q=' + encodeURIComponent(QUERY) + '&unique=prints&order=released&dir=desc';
    const first = await scry(q + '&page=1'); if (!first || !Array.isArray(first.data)) throw new Error('aucune impression');
    const per = first.has_more ? Math.max(1, first.data.length) : Infinity;      // Scryfall : 175 cartes par page
    const pages = Math.min(PAGES, Math.max(1, Math.ceil((first.total_cards || first.data.length) / per))), seen = new Set(), got = new Map([[1, first]]);
    let tries = 0, best = null; const dead = new Set();      // pages sans plus aucune carte à essayer
    while (tries < TRIES && dead.size < pages) {
      let p = 1 + Math.floor(rnd() * pages); while (dead.has(p)) p = p % pages + 1;
      let pg = got.get(p);
      if (!pg) { pg = (await scry(q + '&page=' + p)) || { data: [] }; got.set(p, pg); }
      const list = (pg.data || []).filter(c => dlyPrintOk(c, 'pt') && !seen.has(c.set + '/' + c.collector_number));
      if (!list.length) { dead.add(p); continue; }
      for (let k = 0; k < 4 && list.length && tries < TRIES; k++) {      // quelques cartes par page, puis une autre page : plus de variété
        const c = list.splice(Math.floor(rnd() * list.length), 1)[0], id = c.set + '/' + c.collector_number; seen.add(id); tries++;
        const L = { pt: pick(c) };
        for (const l of DLY_CHECK) { const x = await scry(`/cards/${encodeURIComponent(c.set)}/${encodeURIComponent(c.collector_number)}/${l}`); if (dlyPrintOk(x, l) && x.name === c.name) L[l] = pick(x); }
        if (!L.en) continue;      // l'anglais sert de repli : exigé
        const card = { set: c.set, num: c.collector_number, en: c.name, sn: c.set_name || '', oracle: c.oracle_id || '', l: L, tries };
        if (Object.keys(L).length === DLY_LANGS.length) return card;
        if (!best || Object.keys(L).length > Object.keys(best.l).length) best = card;
      }
    }
    if (!best) throw new Error('aucune carte jouable après ' + tries + ' essais');
    for (const l of DLY_LANGS) if (!best.l[l]) best.l[l] = { ...best.l.en, fb: 1 };      // repli : image et nom anglais
    best.tries = tries; return best;
  }
  /** Images des étapes de chaque langue : du disque, sinon fabriquées (PNG de Scryfall) et gardées. Langue dont l'image échoue : celle de l'anglais. */
  async function build(rec) {
    const out = {}, made = new Map();
    if (!rec.card.fx) {      // point du gros plan : une fois par jour, sur l'illustration anglaise (la même dans toutes les langues), gardé avec la carte
      let f = { x: 0.5, y: 0.5 };
      try { const src = (rec.card.l.en || Object.values(rec.card.l)[0]).png; f = dlyFocus(dlyZone(await png(src), 'art'), dlyRng(createHmac('sha256', await secret()).update('focus|' + rec.day).digest('hex'))); } catch (e) { /* illisible : le centre */ }
      rec.card.fx = f; saveSoon(rec);
    }
    for (const l of DLY_LANGS) {
      const files = Array.from({ length: DLY_IMGS }, (_, i) => join(imgDir(rec.day), `${l}-${i + 1}.png`));
      try { out[l] = await Promise.all(files.map(f => readFile(f))); continue; } catch (e) { /* à fabriquer */ }
      const e = rec.card.l[l], src = e.png;
      let bufs = made.get(src);
      if (!bufs) {
        try { bufs = dlyStages(await png(src), rec.card.fx); }
        catch (err) { if (l === 'en' || !rec.card.l.en) throw err; log.warn(`Carte mystère : image ${l} illisible (${err.message}), repli anglais`); rec.card.l[l] = { ...rec.card.l.en, fb: 1 }; bufs = made.get(rec.card.l.en.png) || dlyStages(await png(rec.card.l.en.png), rec.card.fx); }
        made.set(rec.card.l[l].png, bufs);
        await new Promise(r => setImmediate(r));
      }
      out[l] = bufs;
      try { await mkdir(imgDir(rec.day), { recursive: true }); await Promise.all(bufs.map((b, i) => writeFile(files[i], b))); } catch (err) { log.warn('Carte mystère : images non enregistrées (' + (err && err.code || err) + ')'); }
    }
    G.imgs.set(rec.day, out);
  }
  /** Prépare un jour (tirage, images) ; une seule préparation à la fois par jour ; échec : nouvel essai après RETRY. */
  function prepare(rec) {
    if (G.prep.has(rec.day)) return G.prep.get(rec.day).p;
    const job = { p: null, at: now() }; G.prep.set(rec.day, job);
    job.p = (async () => {
      try {
        if (!rec.card) { rec.card = await draw(rec.day); await saveSoon(rec, true); log.log(`Carte mystère du ${rec.day} tirée (${rec.card.tries} essai${rec.card.tries > 1 ? 's' : ''}${Object.values(rec.card.l).some(x => x.fb) ? ', repli anglais pour ' + DLY_LANGS.filter(l => rec.card.l[l].fb).join(', ') : ''}).`); }
        await build(rec);
        if (rec.st !== 'ready') { rec.st = 'ready'; rec.at = rec.at || now(); }
        await saveSoon(rec, true); G.prep.delete(rec.day); G.prepErr = null; return true;
      } catch (e) { G.prepErr = { day: rec.day, at: now(), m: String(e && e.message || e).slice(0, 300) }; log.warn(`Carte mystère du ${rec.day} : ${e && e.message || e} (nouvel essai dans ${Math.round(RETRY / 60e3)} min)`); job.fail = now(); setTimeout(() => { if (G.prep.get(rec.day) === job) G.prep.delete(rec.day); }, RETRY).unref?.(); return false; }
    })();
    return job.p;
  }
  /** Jour en cours (créé, relu, ou celui préparé d'avance) ; le précédent est clos (classement final, badges). */
  async function current() {
    await bootLoad();
    const day = C.dayOf(now());
    if (!G.cur || G.cur.day !== day) {
      const old = G.cur;
      let rec = G.next && G.next.day === day ? G.next : await recLoad(day);
      if (!rec) rec = recNew(day);
      if (!G.cur || G.cur.day !== day) { G.cur = rec; recUse(rec); }
      if (G.next && G.next.day <= day) G.next = null;
      if (old && old.day < day) { await close(old); G.imgs.delete(old.day); for (const [k, v] of G.keys) if (v.day < dlyAdd(day, -1)) G.keys.delete(k); for (const [k, p] of G.anon) if (p.day < day) G.anon.delete(k); G.board.clear(); }
    }
    const rec = G.cur;
    if (rec.card && rec.st === 'ready' && !G.imgs.has(rec.day) && !G.prep.has(rec.day)) prepare(rec);      // redémarrage : images relues (ou refaites)
    else if (rec.st !== 'ready' && !G.prep.has(rec.day)) prepare(rec);
    return rec;
  }
  /** Tour de garde (chaque minute) : jour en cours prêt, celui de demain préparé un peu avant l'heure, jours anciens clos et effacés, carte du jour annoncée (une fois). */
  async function tick() {
    try {
      const rec = await current();
      if (G.prep.has(rec.day)) await G.prep.get(rec.day).p;
      const nd = dlyAdd(rec.day, 1);
      if (C.startOf(nd) - now() < EARLY && rec.st === 'ready') {
        if (!G.next || G.next.day !== nd) { G.next = (await recLoad(nd)) || recNew(nd); recUse(G.next); }
        if (G.next.st !== 'ready' && !G.prep.has(nd)) await prepare(G.next);
      }
      if (G.purged !== rec.day) { G.purged = rec.day; await purge(rec.day); }
      if (PUSH) { if (!G.pushing) G.pushing = pushRun(rec).catch(e => { log.warn('Carte mystère : notification pas encore envoyée (' + (e && (e.code || e.message) || e) + ')'); return 0; }).finally(() => { G.pushing = null; }); await G.pushing; }      // un seul envoi à la fois (les tours suivants l'attendent)
      if (REVEAL) { if (!G.revealing) G.revealing = revealRun(rec).catch(e => { log.warn('Carte mystère : carte d\'hier pas encore révélée (' + (e && (e.code || e.message) || e) + ')'); return false; }).finally(() => { G.revealing = null; }); await G.revealing; }      // après la notification : jamais elle ne l'attend
      if (ANNOUNCE || WEEKLY) { if (!G.dscing) G.dscing = dscRun(rec).finally(() => { G.dscing = null; }); await G.dscing; }      // après la carte d'hier : classement du dimanche, puis la nouvelle carte (ping)
    } catch (e) { log.warn('Carte mystère : ' + (e && e.message || e)); }
  }
  /** Fichiers des jours de plus de 400 jours, images de plus de 2 jours : effacés ; jours restés ouverts (serveur arrêté au changement de jour) : clos. */
  async function purge(day) {
    let names = []; try { names = await readdir(dir); } catch (e) { return; }
    const old = dlyAdd(day, -KEEP_DAYS);
    for (const f of names) {
      const m = /^(\d{4}-\d{2}-\d{2})\.json$/.exec(f); if (!m) continue;
      if (m[1] < old) { await unlink(join(dir, f)).catch(() => {}); G.sums.delete(m[1]); continue; }
      if (m[1] < day && m[1] >= dlyAdd(day, -10)) { const r = await recLoad(m[1]); if (r && !r.closed) await close(r); }
    }
    let imgs = []; try { imgs = await readdir(join(dir, 'img')); } catch (e) { /* aucune */ }
    for (const d of imgs) if (DAY_RE.test(d) && d < dlyAdd(day, -IMG_DAYS)) await rm(join(dir, 'img', d), { recursive: true, force: true }).catch(() => {});
  }

  /* ── Parties ── */
  const finished = p => p && (p.st === 'win' || p.st === 'lost');
  /** Au classement public : terminée, d'un compte établi, hors entraînement, et pas « à vérifier » (ou validée par le panneau). */
  const pub = p => finished(p) && p.lb !== false && p.chk !== 'ip';
  const MIN_AGE = Math.max(0, Number(o.minAgeDays ?? 0) || 0) * DAY, WINDOW = o.ipWindowMs ?? 10 * 60e3;      // MIN_AGE 0 (par défaut depuis le 19 octobre 2026) : classé dès la 1re partie
  function stat(tag) { const p = G.stats.p; return p[tag] || (p[tag] = { played: 0, won: 0, stage1: 0, points: 0, top100: 0, podium: 0, first: 0, cur: 0, best: 0, last: '', at: {}, fs: 0, h: [], n: '' }); }
  /** Récompenses d'un jour (top 100, podium, 1er) : parties trouvées et publiques ; appliquées par différence (un jour déjà clos est recompté quand le panneau valide une partie). */
  function award(rec) {
    const rows = Object.entries(rec.plays).filter(([, p]) => p && p.st === 'win' && pub(p)).map(([tag, p]) => ({ tag, s: p.s, ms: p.ms, at: p.at })).sort(dlyCmp), t = C.startOf(rec.day), next = {};
    rows.forEach((r, i) => { const l = [...(i < 100 ? ['top100'] : []), ...(i < 3 ? ['podium'] : []), ...(i === 0 ? ['first'] : [])]; if (l.length) next[r.tag] = l; });
    const prev = rec.awards || {};
    for (const tag of new Set([...Object.keys(prev), ...Object.keys(next)])) {
      const a = new Set(prev[tag] || []), b = new Set(next[tag] || []), s = stat(tag);
      for (const k of b) if (!a.has(k)) { s[k]++; s.at[k] = Math.max(s.at[k] || 0, t); }
      for (const k of a) if (!b.has(k)) s[k] = Math.max(0, s[k] - 1);
    }
    rec.awards = next;
  }
  /** Fin de journée : classement final et badges ; empreintes du réseau et des appareils effacées (jamais gardées au-delà de la journée). */
  async function close(rec) {
    if (rec.closed) return;
    await bootLoad();
    award(rec);
    delete rec.salt; delete rec.devs; for (const p of Object.values(rec.plays)) if (p) { delete p.ip; delete p.dh; }
    rec.closed = true; G.sums.delete(rec.day); await saveSoon(rec, true); await statsSave();
  }
  const mkKey = () => randomBytes(18).toString('base64url');
  /** Partie d'une clé (classée ou non) : { rec, play, tag } ou null. */
  async function playOf(k) {
    if (!KEY_RE.test(String(k || ''))) return null;
    const rec = await current(), a = G.anon.get(k); if (a) return { rec: a.day === rec.day ? rec : null, play: a, tag: '' };
    const e = G.keys.get(k); if (!e) return null;
    const r = e.day === rec.day ? rec : await recLoad(e.day), p = r && r.plays[e.tag];
    return p && p.k === k ? { rec: e.day === rec.day ? rec : null, old: r, play: p, tag: e.tag } : null;
  }
  const imgUrl = (k, s) => `api/daily/img?k=${k}&s=${s}`;
  const STEP = Math.max(1000, o.stepMs || DLY_STEP_MS), PEN = o.penMs ?? DLY_PEN_MS;
  /** Horloge d'une partie (ms) : 0 avant le départ, figée à la fin. */
  const clockOf = (p, t = now()) => (!p.t0 ? 0 : finished(p) ? p.ms : Math.max(0, t - p.t0 + (p.sh || 0)));
  const stepOf = p => (finished(p) ? p.step : dlyStepAt(clockOf(p), STEP));
  /** Départ de l'horloge (image de l'étape 1, « go » après le décompte, ou première action). */
  const go = p => { if (!p.t0) { p.t0 = now(); p.ls = p.t0; } };
  /* Appareil : jeton « identifiant.signature » tiré par le serveur (x-daily-device), gardé par l'appli ; le jour ne garde qu'une empreinte HMAC. Un appareil = un compte classé par jour. */
  const devSig = id => createHmac('sha256', G.secret).update('dev|' + id).digest('base64url').slice(0, 16);
  function devOf(req) { const m = /^([\w-]{22})\.([\w-]{16})$/.exec(String(req.headers['x-daily-device'] || '')); return m && devSig(m[1]) === m[2] ? m[1] : ''; }
  const devNew = () => { const id = randomBytes(16).toString('base64url'); return id + '.' + devSig(id); };
  const devHash = id => createHmac('sha256', G.secret).update('devh|' + id).digest('base64url').slice(0, 16);
  /** Une partie sans compte de cet appareil a-t-elle dépassé l'étape 1 (ou fini) aujourd'hui ? Un compte qui commence ensuite y joue pour l'entraînement. */
  const devAnon = (rec, dh) => !!dh && [...G.anon.values()].some(q => q.day === rec.day && q.dh === dh && q.t0 && (finished(q) || stepOf(q) >= 2));
  /** Réseau : HMAC de l'adresse (réseau /64 en IPv6) avec un sel tiré pour la journée, effacé avec elle ; jamais l'adresse. '' : inconnue. */
  function ipOf(rec, req) { const n = o.net ? String(o.net(req) || '') : ''; if (!n) return ''; if (!rec.salt) rec.salt = randomBytes(16).toString('hex'); return createHmac('sha256', rec.salt).update(n).digest('base64url').slice(0, 16); }
  /** Même réseau : un autre joueur y a trouvé la carte, ou vu au moins autant d'étapes, moins de 10 min avant que celui-ci la trouve → « à vérifier ». */
  function ipCheck(rec, p, tag) {
    if (!p.ip) return null;
    const t = p.at, others = [...Object.entries(rec.plays).filter(([t2, q]) => t2 !== tag && q).map(([, q]) => q), ...[...G.anon.values()].filter(q => q.day === rec.day && q !== p)];
    for (const q of others) {
      if (q.ip !== p.ip) continue;
      if (q.st === 'win' && q.at <= t && t - q.at <= WINDOW) return { by: 'win', gap: t - q.at, s: q.step };
      const last = Math.max(q.ls || q.t0 || 0, q.at || 0), seen = q.seen || 0;      // seen : dernière image servie (ce que l'autre a vraiment vu)
      if (seen >= p.step && last <= t && t - last <= WINDOW) return { by: 'step', gap: t - last, s: seen };
    }
    return null;
  }
  /** Compte établi (classement public) : Google ou adresse vérifiée, créé il y a MIN_AGE au moins (date du compte Firebase, sinon la première fois que le jeu l'a vu). */
  /** Compte admis au classement public : '' ; sinon la raison : 'mail' (adresse pas vérifiée, ni Google) ou 'age' (compte de moins de MIN_AGE). */
  async function standing(u) {
    if (!u.ver) return 'mail';
    if (!MIN_AGE) return '';
    let created = 0; try { const a = o.account ? await o.account(u.uid) : null; created = (a && Number(a.created)) || 0; } catch (e) { created = 0; }
    const since = created || (G.stats.p[u.tag] && G.stats.p[u.tag].fs) || now();
    return now() - since >= MIN_AGE ? '' : 'age';
  }
  /** Partie du jour pas classée pour l'adresse ou l'âge du compte : revue (adresse vérifiée depuis, nouveau jeton) ; true si elle rejoint le classement. */
  async function restand(rec, p, u) {
    if (!p || !u || (p.why !== 'mail' && p.why !== 'age') || await standing(u)) return false;
    delete p.lb; delete p.why; rec.v++; G.sums.delete(rec.day); G.board.clear(); saveSoon(rec); return true;
  }
  /** Rang du jour et nombre de joueurs classés (une partie « à vérifier » se voit à sa place, les autres ne la voient pas). */
  function dayRank(rec, tag) { const rows = boardRows([rec.day], new Map([[rec.day, daySum(rec)]]), tag); const i = rows.findIndex(r => r.tag === tag); return { r: i >= 0 ? i + 1 : 0, total: rows.length }; }
  /** Ce que voit le joueur : jamais le nom, l'identifiant, l'extension ni l'adresse Scryfall avant la fin ; perdue ou abandonnée : la réponse seulement avec la carte suivante. */
  function view(rec, p, tag) {
    const step = stepOf(p), c = rec.card, e = c.l[p.l] || c.l.en, done = finished(p), win = p.st === 'win', at = win ? DLY_STEPS : step;
    const v = { k: p.k, day: rec.day, no: dlyNo(rec.day), st: p.st, step, steps: DLY_STEPS, max: DLY_WRONG, wrong: p.wrong.map(w => ({ n: w.n, p: w.p })), left: Math.max(0, DLY_WRONG - p.wrong.length), now: now(), next: C.nextOf(rec.day),
      t0: p.t0 || 0, sh: p.sh || 0, clock: clockOf(p), stepMs: STEP, pen: PEN,
      acct: !!tag, ranked: !!tag && p.lb !== false, why: p.why || '', minAge: Math.round(MIN_AGE / DAY), fb: !!e.fb,
      imgs: { art: imgUrl(p.k, Math.min(at, 5)), ...(at >= 6 ? { type: imgUrl(p.k, 6) } : {}), ...(at >= 7 ? { text: imgUrl(p.k, 7) } : {}) },
      ...(!done && at >= 2 && at <= 5 && c.fx ? { zr: dlyZoomRel(c.fx, at) } : {}) };      // zr : l'image précédente dans celle-ci (dézoom animé)
    if (!done && step >= 8) v.mask = dlyMask(e.n, step);
    if (done) {
      v.res = { win, s: p.s, step, wrong: p.wrong.length, ms: p.ms, ...(win ? { card: { name: e.n, en: c.en, img: e.img, set: c.sn } } : { reveal: C.nextOf(rec.day) }) };
      if (tag && p.lb !== false) Object.assign(v.res, dayRank(rec, tag));
    }
    return v;
  }
  /** Compte (jeton Firebase) : { tag, uid, ver (Google ou adresse vérifiée) } ; pas de jeton : null (ou 401 si need) ; jeton refusé : réponse envoyée, false. */
  async function who(req, res, need) {
    const tok = String(req.headers['x-firebase-token'] || '');
    if (!tok) { if (need) { json(res, 401, { error: 'auth_required', message: typeof need === 'string' ? need : 'Connecte-toi pour voir tes badges.' }); return false; } return null; }
    if (isLocked(req)) { json(res, 429, { error: 'too_many_attempts', message: 'Trop d\'essais invalides : réessaie dans quelques minutes.' }, { 'Retry-After': '300' }); return false; }
    if (!o.verify) { json(res, 503, { error: 'auth_unavailable', message: 'Comptes indisponibles sur ce serveur.' }); return false; }
    let u;
    try { u = await o.verify(tok); }
    catch (e) {
      const code = e && e.authCode;
      if (code === 'expired') json(res, 401, { error: 'token_expired', message: 'Session expirée : le navigateur va la renouveler.' });
      else if (code === 'unavailable') json(res, 503, { error: 'auth_unavailable', message: 'Vérification du compte impossible pour le moment.' }, { 'Retry-After': '5' });
      else await badKey(req, res, 'bad_token', 401);
      return false;
    }
    const tag = dlyTag(u.uid), s = stat(tag); if (!s.fs) { s.fs = now(); statsSoon(); }      // première fois que le jeu voit ce compte (repli de la date de création)
    return { tag, uid: u.uid, ver: u.emailVerified === true || u.provider === 'google.com' };
  }
  async function body(req, res) {
    let b; try { b = JSON.parse((await readBody(req, 8 * 1024)).toString('utf8') || '{}'); } catch (e) { if (e.status === 413) tooLarge(res); else json(res, 400, { error: 'bad_request', message: 'JSON invalide' }); return null; }
    if (!b || typeof b !== 'object' || Array.isArray(b)) { json(res, 400, { error: 'bad_request', message: 'JSON invalide' }); return null; }
    return b;
  }
  const waitRes = (res, rec) => json(res, 503, { error: 'wait', message: 'La carte du jour se prépare : réessaie dans un instant.', day: rec.day, next: C.nextOf(rec.day), now: now() }, { 'Retry-After': '20' });
  /** Badges d'un compte : identifiants stables, n = le nombre (0 compris), at = dernière fois (ms ; 0 : jamais). streak : meilleure série de jours d'affilée (cur : celle en cours). */
  function badges(tag) {
    const s = G.stats.p[tag] || DLY_NOSTAT, day = C.dayOf(now()), cur = s.last === day || s.last === dlyAdd(day, -1) ? s.cur : 0, a = s.at || {};
    return [{ id: 'played', n: s.played, at: a.played || 0 }, { id: 'streak', n: s.best, cur, at: a.streak || 0 }, { id: 'top100', n: s.top100, at: a.top100 || 0 }, { id: 'podium', n: s.podium, at: a.podium || 0 },
      { id: 'first', n: s.first, at: a.first || 0 }, { id: 'stage1', n: s.stage1, at: a.stage1 || 0 }, { id: 'points', n: s.points, at: a.points || 0 }];
  }
  /** Fin d'une partie d'un compte (hors entraînement) : compteurs des badges, 7 derniers résultats (statistique de soupçon). */
  function statEnd(tag, p) {
    const s = stat(tag), t = now();
    if (p.st === 'win') { s.won++; s.points += p.s; s.at.points = t; if (p.step === 1) { s.stage1++; s.at.stage1 = t; } }
    s.h = [...(s.h || []), p.st === 'win' ? p.step : 0].slice(-7); statsSoon();
  }
  /** Prochaine carte : la réponse d'hier (dans la langue l), publique une fois la journée finie. */
  async function prevCard(day, l) {
    const d = dlyAdd(day, -1); if (!G.prevC || G.prevC.day !== d) { const r = await recLoad(d); G.prevC = { day: d, c: r && r.card }; }
    const c = G.prevC.c, e = c && (c.l[l] || c.l.en); return e ? { day: d, name: e.n, en: c.en, img: e.img } : null;
  }

  /* ── Classements ── */
  /** Parties d'un jour pour le classement : terminées, de comptes établis, hors entraînement ; hid : « à vérifier » (comptée seulement pour son joueur). */
  function daySum(r) { const m = new Map(); for (const [tag, p] of Object.entries(r.plays)) if (finished(p) && p.lb !== false) m.set(tag, { s: p.s, ms: p.ms, n: p.n, at: p.at, ...(p.chk === 'ip' ? { hid: 1 } : {}) }); return m; }
  /** Résumé d'un jour passé, gardé en mémoire une fois le jour clos (64 jours au plus). */
  async function sumOf(day) {
    if (G.sums.has(day)) return G.sums.get(day);
    const r = await recLoad(day), m = r ? daySum(r) : new Map();
    if (r && r.closed) { G.sums.set(day, m); if (G.sums.size > 64) G.sums.delete(G.sums.keys().next().value); }
    return m;
  }
  /** Lignes triées d'une période ; self : le joueur qui demande (ses parties « à vérifier » comptent pour lui seul). */
  function boardRows(days, sums, self = '') {
    const by = new Map();
    for (const d of days) {
      const m = sums.get(d); if (!m) continue;
      for (const [tag, x] of m) { if (x.hid && tag !== self) continue; const b = by.get(tag); if (b) { b.s += x.s; b.ms += x.ms; b.d++; if (d >= b.ld) { b.n = x.n; b.ld = d; } b.at = Math.max(b.at, x.at || 0); } else by.set(tag, { tag, s: x.s, ms: x.ms, d: 1, n: x.n, ld: d, at: x.at || 0 }); }
    }
    return [...by.values()].sort(dlyCmp);
  }
  async function board(p, rec, tag) {
    const day = rec.day, from = p === 'week' ? C.weekOf(day) : p === 'season' ? C.seasonOf(day) + '-01' : day, key = p === 'week' ? from : p === 'season' ? C.seasonOf(day) : day;
    const days = []; for (let d = from; d <= day; d = dlyAdd(d, 1)) days.push(d);
    const sums = new Map(); for (const d of days) sums.set(d, d === day ? daySum(rec) : await sumOf(d));
    const ck = p + '|' + key, hit = G.board.get(ck);
    let rows;
    if (hit && hit.v === rec.v && now() - hit.at < 5000) rows = hit.rows;
    else { rows = boardRows(days, sums); G.board.set(ck, { rows, v: rec.v, at: now() }); }
    if (tag && days.some(d => { const x = sums.get(d).get(tag); return x && x.hid; })) rows = boardRows(days, sums, tag);      // « à vérifier » : à sa place pour lui seul (exclusion silencieuse)
    const to = p === 'day' ? C.nextOf(day) : p === 'week' ? C.startOf(dlyAdd(from, 7)) : C.startOf(dlyIso(Date.UTC(+key.slice(0, 4), +key.slice(5, 7), 1)));      // saison : jusqu'au 1er du mois suivant
    const show = r => { const h = G.hidden.has(r.tag); return { id: rid(r.tag), n: h ? '' : r.n || dlyFall(r.tag), s: r.s, ...(p !== 'day' ? { d: r.d } : {}), ...(h ? { x: 1 } : {}), ...(tag && r.tag === tag ? { me: 1 } : {}) }; };
    const i = tag ? rows.findIndex(r => r.tag === tag) : -1;
    return { p, key, from: C.startOf(from), to, total: rows.length, rows: rows.slice(0, 100).map((r, j) => ({ r: j + 1, ...show(r) })), me: i >= 0 ? { r: i + 1, ...show(rows[i]) } : null };
  }

  /* ── Signalements des pseudos (classements publics : Google Play exige de pouvoir signaler un contenu d'utilisateur) ── */
  const REP_HIDE = Math.max(1, o.reportHide ?? 3), REP_DAY = 20;      // signalements distincts avant de masquer le pseudo en attendant le panneau ; signalements par personne et par jour
  /** Identifiant public d'une ligne de classement (rien du compte : HMAC du secret du serveur). */
  const rid = tag => createHmac('sha256', G.secret || 'x').update('row|' + tag).digest('base64url').slice(0, 12);
  async function ridFind(id) {
    if (!/^[\w-]{12}$/.test(id)) return '';
    const rec = G.cur, tags = new Set([...Object.keys(G.stats.p), ...G.hidden.keys(), ...Object.keys((await lvLoad()).p), ...(rec ? Object.keys(rec.plays) : [])]);
    for (const t of tags) if (rid(t) === id) return t;
    return '';
  }
  async function nameOf(tag) { const p = G.cur && G.cur.plays[tag], L = await lvLoad(); return (p && p.n) || (L.p[tag] && L.p[tag].n) || (G.stats.p[tag] && G.stats.p[tag].n) || ''; }
  const hiddenSave = () => put(join(dir, 'hidden.json'), JSON.stringify({ v: 1, h: [...G.hidden].map(([t, h]) => ({ t, n: h.n, at: h.at, ...(h.auto ? { auto: 1 } : {}) })) })).catch(e => log.warn('Carte mystère : masques non enregistrés (' + (e && e.code || e) + ')'));
  const repSave = () => put(join(dir, 'reports.json'), JSON.stringify({ v: 1, r: [...G.rep].map(([t, r]) => ({ t, ...r })) })).catch(e => log.warn('Carte mystère : signalements non enregistrés (' + (e && e.code || e) + ')'));
  /** Un signalement : une fois par personne (compte, sinon appareil) et par pseudo ; REP_HIDE personnes différentes : pseudo masqué jusqu'à la décision du panneau. */
  async function report(tag, by) {
    const r = G.rep.get(tag) || { by: [], n: '', at: 0 };
    if (r.by.includes(by)) return { ok: true, dup: true };
    r.by.push(by); if (r.by.length > 50) r.by.shift(); r.n = await nameOf(tag); r.at = now(); G.rep.set(tag, r);
    let hid = false;
    if (r.by.length >= REP_HIDE && !G.hidden.has(tag)) { G.hidden.set(tag, { n: r.n, at: now(), auto: 1 }); G.board.clear(); hid = true; await hiddenSave(); log.warn('Carte mystère : pseudo masqué après ' + r.by.length + ' signalements (à revoir dans /admin)'); }
    await repSave();
    return { ok: true, hid };
  }

  /* ── Routes ── */
  async function api(req, res, path, url) {
    const sub = path.replace(/^daily\/?/, '');
    if (sub && !DLY_ROUTES.includes(sub)) return json(res, 404, { error: 'not_found' });
    const w = rateWait(req, sub === 'img' ? 'dlyimg' : 'daily', sub === 'img' ? 600 : 300, 600e3); if (w) return tooMany(res, w);
    const rec = await current(); rec.v = rec.v || 0; await secret();
    const dev = devOf(req), devOut = dev ? {} : { dev: devNew() };      // sans jeton d'appareil valable : un nouveau, à garder par l'appli
    if (req.method === 'GET' && !sub) {      // état du jour : prête ou en préparation, prochaine carte, ma partie (compte, ou ?k= d'une partie sans compte), réponse d'hier (?l=)
      const u = await who(req, res); if (u === false) return;
      let me = null;
      if (rec.st === 'ready') {
        const p = u ? rec.plays[u.tag] : null, a = !u ? G.anon.get(String(url.searchParams.get('k') || '')) : null;
        const pl = p || (a && a.day === rec.day ? a : null);
        if (pl) me = { k: pl.k, st: pl.st, step: stepOf(pl), started: !!pl.t0, ranked: !!u && pl.lb !== false, why: pl.why || '', ...(finished(pl) ? { s: pl.s, ...(u && pl.lb !== false ? dayRank(rec, u.tag) : {}) } : {}) };
      }
      const l = url.searchParams.get('l'), prev = DLY_LANGS.includes(l) ? await prevCard(rec.day, l) : null;
      return json(res, 200, { on: true, day: rec.day, no: dlyNo(rec.day), st: rec.st === 'ready' && G.imgs.has(rec.day) ? 'ready' : 'wait', next: C.nextOf(rec.day), now: now(), steps: DLY_STEPS, max: DLY_WRONG, n: Object.values(rec.plays).filter(pub).length, ranked: !!u, push: !!PUSH, me, ...(prev ? { prev } : {}), ...devOut });      // push : notification « nouvelle Carte mystère » proposée
    }
    if (req.method === 'GET' && sub === 'img') {      // image d'une étape : l'étape 1 lance l'horloge ; les suivantes seulement à leur heure (ou horloge avancée) ; perdue : pas plus loin que l'étape atteinte
      const k = String(url.searchParams.get('k') || ''), s = Number(url.searchParams.get('s')), x = await playOf(k);
      if (!x || !x.rec || !Number.isInteger(s) || s < 1 || s > DLY_IMGS) return json(res, 404, { error: 'not_found' });
      const pl = x.play; if (s === 1 && !pl.t0) { go(pl); x.rec.v++; if (x.tag) saveSoon(x.rec); }
      if (s > stepOf(pl) && pl.st !== 'win') return json(res, 403, { error: 'locked', message: 'Pas encore : cette étape arrive plus tard.', at: pl.t0 ? pl.t0 - (pl.sh || 0) + (s - 1) * STEP : 0 });
      if (!finished(pl) && s > (pl.seen || 0)) { pl.seen = s; pl.ls = now(); }
      const im = G.imgs.get(x.rec.day), b = im && (im[x.play.l] || im.en); if (!b) return json(res, 503, { error: 'wait' }, { 'Retry-After': '10' });
      res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'private, max-age=86400', 'Content-Length': b[s - 1].length, 'X-Content-Type-Options': 'nosniff' });
      return res.end(req.method === 'HEAD' ? undefined : b[s - 1]);
    }
    if (req.method === 'POST' && sub === 'recheck') {      // « J'ai cliqué sur le lien » : adresse vérifiée (nouveau jeton) → la partie du jour rejoint le classement
      const u = await who(req, res, true); if (!u) return;
      const p = rec.plays[u.tag], ok = await restand(rec, p, u);
      return json(res, 200, { ok, why: p ? p.why || '' : '', ...(p ? { st: p.st } : {}) });
    }
    if (req.method === 'POST' && sub === 'name') {      // pseudo choisi ou changé dans le profil : la partie du jour, la semaine, la saison et les niveaux le suivent
      const b = await body(req, res); if (!b) return;
      const u = await who(req, res, true); if (!u) return;
      const n = dlyName(b.n, o.bad); if (!n) return json(res, 400, { error: 'name', message: 'Pseudo refusé.' });
      const p = rec.plays[u.tag]; if (p && p.n !== n) { p.n = n; rec.v++; saveSoon(rec); }
      const st = G.stats.p[u.tag]; if (st && st.n !== n) { st.n = n; await statsSave(); }
      const L = await lvLoad(); if (L.p[u.tag] && L.p[u.tag].n !== n) { L.p[u.tag].n = n; lvSoon(); }
      for (let i = 1; i <= 35; i++) { const d = dlyAdd(rec.day, -i), r = await recLoad(d); if (r && r.plays[u.tag] && r.plays[u.tag].n !== n) { r.plays[u.tag].n = n; await saveSoon(r, true); G.sums.delete(d); } }      // semaine et saison : les jours précédents aussi
      G.sums.delete(rec.day); G.board.clear();
      return json(res, 200, { ok: true, n });
    }
    if (req.method === 'POST' && sub === 'report') {      // « Signaler ce pseudo » (classements du jeu et des niveaux)
      const b = await body(req, res); if (!b) return;
      const u = await who(req, res); if (u === false) return;
      const by = u ? 'u:' + u.tag : dev ? 'd:' + dev : '';
      if (!by) return json(res, 400, { error: 'device', message: 'Réessaie dans un instant.', ...devOut });
      const tag = await ridFind(String(b.id || '')); if (!tag) return json(res, 404, { error: 'not_found', message: 'Joueur introuvable.' });
      if (u && tag === u.tag) return json(res, 400, { error: 'self', message: 'C\'est ton pseudo.' });
      const d = G.repBy.get(by); if (d && d.day === rec.day && d.n >= REP_DAY) return json(res, 429, { error: 'too_many', message: 'Trop de signalements aujourd\'hui.' });
      G.repBy.set(by, { day: rec.day, n: d && d.day === rec.day ? d.n + 1 : 1 }); if (G.repBy.size > 20000) G.repBy.clear();
      return json(res, 200, await report(tag, by));
    }
    if (req.method === 'POST' && sub === 'push') {      // notification « nouvelle Carte mystère » : cet appareil enregistré pour le compte ({ sub, l }), ou retiré ({ off })
      if (!PUSH) return json(res, 404, { error: 'push_disabled', message: 'Notifications indisponibles sur ce serveur.' });
      const b = await body(req, res); if (!b) return;
      const u = await who(req, res, 'Connecte-toi pour être prévenu de la Carte mystère.'); if (!u) return;
      return pushReg(res, u.tag, b);
    }
    if (req.method === 'GET' && sub === 'board') {
      const p = ['day', 'week', 'season'].includes(url.searchParams.get('p')) ? url.searchParams.get('p') : 'day';
      const u = await who(req, res); if (u === false) return;
      return json(res, 200, { day: rec.day, ...(await board(p, rec, u && u.tag)) });
    }
    if (req.method === 'GET' && sub === 'badges') { const u = await who(req, res, true); if (!u) return; return json(res, 200, { badges: badges(u.tag) }); }
    if (req.method === 'GET' && sub === 'play') {      // vue de ma partie à l'instant (étape de l'horloge, nom par la fin) : l'appli la relit à chaque nouvelle étape
      const u = await who(req, res); if (u === false) return;
      const x = await playOf(url.searchParams.get('k'));
      if (!x || (x.tag && (!u || u.tag !== x.tag))) return json(res, 404, { error: 'not_found', message: 'Partie introuvable.' });
      if (!x.rec) return json(res, 410, { error: 'over', message: 'Cette carte est terminée : une nouvelle est arrivée.' });
      return json(res, 200, view(x.rec, x.play, x.tag));
    }
    if (req.method !== 'POST' || !['start', 'go', 'next', 'guess', 'giveup'].includes(sub)) return json(res, 405, { error: 'method_not_allowed' });
    const u = await who(req, res, 'Connecte-toi pour jouer à la Carte mystère.'); if (!u) return;      // compte obligatoire pour jouer (16 octobre) ; les classements restent publics
    const b = await body(req, res); if (!b) return;
    if (sub === 'start') {      // partie d'un compte : une par compte et par jour, la même est reprise
      if (rec.st !== 'ready' || !G.imgs.has(rec.day)) return waitRes(res, rec);
      const l = DLY_LANGS.includes(b.l) ? b.l : 'en', n = dlyName(b.n, o.bad), dh = dev ? devHash(dev) : '';
      if (u) {
        let p = rec.plays[u.tag];
        if (!p) {
          const d = dh && rec.devs ? rec.devs[dh] : null, practice = !!((d && d.t && d.t !== u.tag) || (!(d && d.t) && devAnon(rec, dh)));      // appareil déjà joué aujourd'hui par un autre compte (ou sans compte, au-delà de l'étape 1)
          const why = practice ? '' : await standing(u);
          p = rec.plays[u.tag];
          if (!p) {
            const t = now(), ip = ipOf(rec, req);
            p = rec.plays[u.tag] = { k: mkKey(), n, l, c0: t, t0: 0, sh: 0, seen: 0, step: 1, wrong: [], st: 'play', s: 0, ms: 0, at: 0, ...(dh ? { dh } : {}), ...(ip ? { ip } : {}),
              ...(practice ? { lb: false, why: 'device', pr: 1 } : why ? { lb: false, why } : {}) };
            G.keys.set(p.k, { day: rec.day, tag: u.tag });
            if (dh && !practice && !(d && d.t)) (rec.devs || (rec.devs = {}))[dh] = { ...(d || {}), t: u.tag };
            if (!practice) {      // entraînement : rien ne compte, ni classement ni badges
              const s = stat(u.tag); s.played++; s.at.played = t; if (n) s.n = n;
              s.cur = s.last === dlyAdd(rec.day, -1) ? s.cur + 1 : s.last === rec.day ? s.cur : 1; s.last = rec.day; if (s.cur >= s.best) { s.best = s.cur; s.at.streak = t; }
              statsSoon();
            }
            rec.v++; saveSoon(rec);
          }
        } else { if (n && n !== p.n) { p.n = n; rec.v++; saveSoon(rec); } await restand(rec, p, u); }      // pseudo changé depuis : le classement suit ; adresse vérifiée depuis : classée
        return json(res, 200, { ...view(rec, p, u.tag), ...devOut });
      }
    }
    const x = await playOf(b.k);
    if (!x || (x.tag && (!u || u.tag !== x.tag))) return json(res, 404, { error: 'not_found', message: 'Partie introuvable.' });      // partie d'un compte : seulement par ce compte
    if (!x.rec) { const r = x.old, c = r && r.card, e = c && (c.l[x.play.l] || c.l.en); return json(res, 410, { error: 'over', message: 'Cette carte est terminée : une nouvelle est arrivée.', ...(e ? { card: { name: e.n, en: c.en, img: e.img, set: c.sn } } : {}) }); }      // journée finie : la réponse est publique
    const p = x.play;
    if (x.tag) await restand(x.rec, p, u);
    if (finished(p)) return json(res, 200, view(rec, p, x.tag));
    const end = () => { p.step = dlyStepAt(p.ms, STEP); if (x.tag && !p.pr) statEnd(x.tag, p); };
    if (sub === 'go') { go(p); rec.v++; if (x.tag) saveSoon(rec); return json(res, 200, view(rec, p, x.tag)); }      // fin du décompte : l'horloge part (si l'image de l'étape 1 ne l'a pas déjà lancée)
    go(p);
    if (sub === 'next') {      // indice suivant : l'horloge saute au début de l'étape suivante (aucun avantage : le score suit l'horloge)
      const c = clockOf(p), st = dlyStepAt(c, STEP);
      if (st >= DLY_STEPS) return json(res, 409, { error: 'max', message: 'Plus d\'indice.', ...view(rec, p, x.tag) });
      p.sh = (p.sh || 0) + (st * STEP - c); rec.v++; if (x.tag) saveSoon(rec);
      return json(res, 200, view(rec, p, x.tag));
    }
    if (sub === 'giveup') {      // abandon : perdue (0), et pas plus de réponse qu'un échec
      Object.assign(p, { ms: clockOf(p), st: 'lost', at: now(), s: 0, gu: 1 }); end();
      rec.v++; if (x.tag) saveSoon(rec);
      return json(res, 200, view(rec, p, x.tag));
    }
    const g = typeof b.n === 'string' ? b.n.replace(/[\p{Cc}\p{Cf}]/gu, '').trim().slice(0, 160) : '';
    if (!dlyNorm(g)) return json(res, 400, { error: 'bad_name', message: 'Nom de carte attendu.' });
    const shown = typeof b.p === 'string' ? b.p.replace(/[\p{Cc}\p{Cf}<>]/gu, '').trim().slice(0, 80) : '';
    if (dlyNorm(g) === dlyNorm(rec.card.en)) {      // score à la réception de la bonne proposition, à l'horloge du serveur
      const ms = clockOf(p);
      Object.assign(p, { ms, st: 'win', at: now(), s: dlyScore(ms), step: dlyStepAt(ms, STEP) });
      if (x.tag && p.lb !== false && !p.chk) { const f = ipCheck(rec, p, x.tag); if (f) { p.chk = 'ip'; p.chkd = { by: f.by, gap: Math.round(f.gap / 1000), s: f.s }; } }      // même réseau, juste après un autre joueur : à vérifier (sans le lui dire)
      end();
    } else {
      if (p.wrong.some(w => dlyNorm(w.n) === dlyNorm(g))) return json(res, 200, { dup: true, ...view(rec, p, x.tag) });      // déjà proposée : rien ne compte deux fois
      p.wrong.push({ n: g, p: shown && shown !== g ? shown : '' }); p.sh = (p.sh || 0) + PEN;      // mauvaise proposition : 10 s de plus à l'horloge
      if (p.wrong.length >= DLY_WRONG) { Object.assign(p, { ms: clockOf(p), st: 'lost', at: now(), s: 0 }); end(); }
    }
    rec.v++; if (x.tag) saveSoon(rec);
    return json(res, 200, { ok: p.st === 'win', ...view(rec, p, x.tag) });
  }

  /* ── Panneau /admin (compte de l'éditeur déjà vérifié par proxy.mjs › admAuth) : joueurs des 7 derniers jours, masquer un pseudo ; parties et comptes à vérifier, « Valider » ── */
  const admId = tag => createHmac('sha256', G.secret || 'x').update('adm|' + tag).digest('base64url').slice(0, 12);
  async function adminList(rec) {
    const by = new Map();
    for (let i = 6; i >= 0; i--) {
      const d = dlyAdd(rec.day, -i), m = d === rec.day ? daySum(rec) : await sumOf(d);
      for (const [tag, v] of m) { const b = by.get(tag) || { tag, n: '', s: 0, d: 0, last: '' }; b.s += v.s; b.d++; b.n = v.n || b.n; b.last = d; by.set(tag, b); }
    }
    const L = await lvLoad(); for (const [tag, r] of Object.entries(L.p)) { const b = by.get(tag); if (b) b.lv = levelOf(r.x); else by.set(tag, { tag, n: r.n, s: 0, d: 0, last: '', lv: levelOf(r.x) }); }
    for (const [tag, h] of G.hidden) if (!by.has(tag)) by.set(tag, { tag, n: h.n, s: 0, d: 0, last: '' });
    return [...by.values()].sort((a, b) => (b.last > a.last ? 1 : b.last < a.last ? -1 : b.s - a.s)).slice(0, 500).map(r => ({ id: admId(r.tag), n: r.n || dlyFall(r.tag), s: r.s, d: r.d, last: r.last, ...(r.lv ? { lv: r.lv } : {}), ...(G.hidden.has(r.tag) ? { x: 1 } : {}) }));
  }
  /** Parties « à vérifier » des 7 derniers jours (même réseau, juste après un autre joueur) : hors du top 100 public tant qu'elles ne sont pas validées. */
  async function adminChk(rec) {
    const out = [];
    for (let i = 0; i < 7; i++) {
      const d = dlyAdd(rec.day, -i), r = d === rec.day ? rec : await recLoad(d); if (!r) continue;
      for (const [tag, p] of Object.entries(r.plays)) if (p && p.chk === 'ip') out.push({ id: d + ':' + admId(tag), day: d, n: p.n || dlyFall(tag), s: p.s, step: p.step, ms: p.ms || 0, by: (p.chkd || {}).by || '', gap: (p.chkd || {}).gap || 0, other: (p.chkd || {}).s || 0 });
    }
    return out;
  }
  /** Comptes qui trouvent à l'étape 1 bien plus souvent que les autres (5 fois au moins sur leurs 7 dernières parties, 3 fois le taux de tous) : signalés, jamais exclus. */
  function adminSus() {
    let p1 = 0, pl = 0; for (const s of Object.values(G.stats.p)) { p1 += s.stage1 || 0; pl += s.played || 0; }
    const rate = pl ? p1 / pl : 0, out = [];
    for (const [tag, s] of Object.entries(G.stats.p)) {
      const h = s.h || [], c = h.filter(x => x === 1).length;
      if (c >= 5 && c / h.length >= 3 * rate && !(s.sok && s.played < s.sok + 7)) out.push({ id: admId(tag), n: s.n || dlyFall(tag), c, of: h.length, rate: Math.round(rate * 1000) / 10 });
    }
    return out;
  }
  async function adminView(rec) {
    const c = rec.card;
    return { day: rec.day, no: dlyNo(rec.day), st: rec.st, next: C.nextOf(rec.day), plays: Object.keys(rec.plays).length, done: Object.values(rec.plays).filter(finished).length, fb: c ? DLY_LANGS.filter(l => c.l[l] && c.l[l].fb) : [],
      card: c ? { en: c.en, set: c.sn, fr: (c.l.fr || {}).n || '' } : null, rows: await adminList(rec), hidden: G.hidden.size, chk: await adminChk(rec), sus: adminSus(), minAge: Math.round(MIN_AGE / DAY),
      prep: rec.st === 'ready' ? null : { since: (G.prep.get(rec.day) || {}).at || 0, err: G.prepErr && G.prepErr.day === rec.day ? G.prepErr : null },      // carte pas encore prête : depuis quand, dernière erreur
      reports: [...G.rep].filter(([, r]) => r.by.length).map(([t, r]) => ({ id: admId(t), n: r.n || dlyFall(t), k: r.by.length, at: r.at, hid: G.hidden.has(t) })).sort((a, b) => b.at - a.at).slice(0, 200), repHide: REP_HIDE };
  }
  async function admin(req, res, sub, url) {
    const HD = o.adminHeaders || {};
    const rec = await current(); await secret();
    if (req.method === 'GET' && sub === 'daily') return json(res, 200, await adminView(rec), HD);
    if (req.method === 'POST' && sub === 'daily/hide') {
      const b = await body(req, res); if (!b) return;
      const ids = new Map([...Object.keys(G.stats.p), ...G.hidden.keys(), ...G.rep.keys(), ...Object.keys((await lvLoad()).p)].map(t => [admId(t), t])), tag = ids.get(String(b.id || ''));
      if (!tag) return json(res, 404, { error: 'not_found', message: 'Joueur inconnu.' }, HD);
      if (b.on === false) { G.hidden.delete(tag); if (G.rep.delete(tag)) await repSave(); }      // rétabli : le pseudo est jugé correct, ses signalements partent avec
      else { const l = await adminList(rec), r = l.find(x => x.id === b.id), rp = G.rep.get(tag); G.hidden.set(tag, { n: r ? r.n : rp ? rp.n : '', at: now() }); }
      await hiddenSave();
      G.board.clear();
      return json(res, 200, { ok: true, ...(await adminView(rec)) }, HD);
    }
    if (req.method === 'POST' && sub === 'daily/report') {      // « Ignorer » : signalements effacés, pseudo laissé tel quel (masqué ou non)
      const b = await body(req, res); if (!b) return;
      const tag = [...G.rep.keys()].find(t => admId(t) === String(b.id || '')); if (!tag) return json(res, 404, { error: 'not_found', message: 'Signalement inconnu.' }, HD);
      G.rep.delete(tag); await repSave();
      return json(res, 200, { ok: true, ...(await adminView(rec)) }, HD);
    }
    if (req.method === 'POST' && sub === 'daily/ok') {      // « Valider » : partie à vérifier (même box, famille…) remise au classement, ou compte soupçonné laissé tranquille pour ses 7 prochaines parties
      const b = await body(req, res); if (!b) return;
      const m = /^(\d{4}-\d{2}-\d{2}):([\w-]{12})$/.exec(String(b.id || ''));
      if (m) {
        const r = m[1] === rec.day ? rec : await recLoad(m[1]), e = r && Object.entries(r.plays).find(([t, p]) => p && p.chk === 'ip' && admId(t) === m[2]);
        if (!e) return json(res, 404, { error: 'not_found', message: 'Partie inconnue.' }, HD);
        e[1].chk = 'ok'; if (r.closed) award(r);      // jour déjà clos : top 100 et podium recomptés
        r.v = (r.v || 0) + 1; G.sums.delete(r.day); G.board.clear(); await saveSoon(r, true); await statsSave();
      } else {
        const tag = Object.keys(G.stats.p).find(t => admId(t) === String(b.id || '')); if (!tag) return json(res, 404, { error: 'not_found', message: 'Joueur inconnu.' }, HD);
        G.stats.p[tag].sok = G.stats.p[tag].played; await statsSave();
      }
      return json(res, 200, { ok: true, ...(await adminView(rec)) }, HD);
    }
    return json(res, 405, { error: 'method_not_allowed' }, HD);
  }


  /* ── Classement des niveaux de compte (XP calculée par l'appli, progress.js) : POST /api/level, GET /api/level/board ──
     Anti-triche par le rythme : au premier envoi, 50 000 XP au plus (l'historique) ; ensuite au plus LEVEL_DAY_CAP XP de plus par jour depuis la dernière valeur
     retenue (20 000), cumulables sur 7 jours sans envoi. Gonfler son XP à la main ne fait donc pas sauter au niveau 999. Stockage : levelsFile (.data/levels.json). */
  const LV_CAP = Math.max(0, o.levelDayCap ?? 20000), LV_FIRST = Math.max(0, o.levelFirst ?? 50000), LV_DAYS = 7, LV_FILE = o.levelsFile || join(dir, 'levels.json');
  const levelOf = o.levelOf || (xp => { let L = 1; while (L < 999 && Math.round(40 * Math.pow(L, 2.25)) <= xp) L++; return L; });      // même courbe que progress.js › prgXpFor
  let lvT = null;
  async function lvLoad() { if (!G.lv) { const j = await getJson(LV_FILE); G.lv = j && j.p && typeof j.p === 'object' ? j : { v: 1, p: {} }; } return G.lv; }
  const lvSave = () => put(LV_FILE, JSON.stringify(G.lv)).catch(e => log.warn('Carte mystère : niveaux non enregistrés (' + (e && e.code || e) + ')'));
  const lvSoon = () => { if (!lvT) { lvT = setTimeout(() => { lvT = null; lvSave(); }, 1500); if (lvT.unref) lvT.unref(); } };
  /** Nouvelle XP envoyée par l'appli → XP retenue (jamais en baisse). */
  function lvAccept(r, xp, t) {
    if (!r) return { x: Math.min(xp, LV_FIRST), b: 0, t };
    const b = Math.min(LV_DAYS * LV_CAP, (r.b || 0) + LV_CAP * Math.max(0, t - r.t) / DAY), inc = Math.max(0, Math.min(xp - r.x, b));
    return { x: r.x + inc, b: b - inc, t };
  }
  async function lvBoard(tag) {
    const L = await lvLoad(), rows = Object.entries(L.p).map(([t, r]) => ({ tag: t, x: r.x, n: r.n, at: r.at || 0 })).filter(r => r.x > 0).sort((a, b) => b.x - a.x || a.at - b.at || (a.tag < b.tag ? -1 : 1));
    const show = r => { const h = G.hidden.has(r.tag); return { id: rid(r.tag), n: h ? '' : r.n || dlyFall(r.tag), lv: levelOf(r.x), xp: Math.round(r.x), ...(h ? { x: 1 } : {}), ...(tag && r.tag === tag ? { me: 1 } : {}) }; };
    const i = tag ? rows.findIndex(r => r.tag === tag) : -1;
    return { p: 'level', total: rows.length, rows: rows.slice(0, 100).map((r, j) => ({ r: j + 1, ...show(r) })), me: i >= 0 ? { r: i + 1, ...show(rows[i]) } : null };
  }
  /** Profil d'un compte pour le bot Discord (/moi, discord-cmd.mjs) : niveau retenu (levels.json ; 0 : jamais envoyé) et badges vérifiés de la Carte mystère. */
  async function profile(tag) { await bootLoad(); const r = (await lvLoad()).p[tag]; return { lv: r && r.x > 0 ? levelOf(r.x) : 0, badges: badges(tag) }; }
  async function level(req, res, path) {
    const sub = path.replace(/^level\/?/, '');
    if (sub && sub !== 'board') return json(res, 404, { error: 'not_found' });
    const w = rateWait(req, 'dlylevel', 120, 600e3); if (w) return tooMany(res, w);
    await bootLoad();
    if (req.method === 'GET' && sub === 'board') { const u = await who(req, res); if (u === false) return; return json(res, 200, await lvBoard(u && u.tag)); }
    if (req.method !== 'POST' || sub) return json(res, 405, { error: 'method_not_allowed' });
    const u = await who(req, res, true); if (!u) return;
    const b = await body(req, res); if (!b) return;
    const xp = Math.floor(Number(b.xp)); if (!Number.isFinite(xp) || xp < 0 || xp > 1e10) return json(res, 400, { error: 'bad_xp', message: 'XP invalide.' });
    const L = await lvLoad(), r = L.p[u.tag], t = now(), a = lvAccept(r, xp, t), n = dlyName(b.n, o.bad) || (r && r.n) || '';
    const up = !r || a.x > r.x;
    L.p[u.tag] = { ...a, n, at: up ? t : (r.at || t) };      // at : quand ce niveau a été atteint (départage)
    lvSoon();
    return json(res, 200, { xp: Math.round(a.x), lv: levelOf(a.x), sent: xp, capped: a.x < xp, ...(await lvBoard(u.tag)).me });
  }

  /* ── Notification « nouvelle Carte mystère » (o.push : { send, target } de proxy.mjs, Web Push ou FCM ; null sans compte de service ou DAILY_PUSH=0 : rien) ──
     Comme les notifications des amis : un appareil aux notifications actives s'enregistre pour son compte (POST /api/daily/push { sub, l } ; { off } le retire),
     8 au plus par compte ; le même appareil sur un autre compte change de compte. Stockage : push.json (appareils ; journée annoncée : jour, position, finie).
     Tour de garde : carte du jour prête, moins de pushWindowMs (2 h) après son heure → chaque appareil prévenu une fois, dans sa langue, par lots. La position
     (clé du dernier appareil du lot, appareils triés par clé) est écrite AVANT l'envoi du lot : un redémarrage en plein envoi reprend après, sans jamais prévenir
     deux fois le même appareil le même jour (au pire, un lot interrompu n'est pas prévenu). Serveur arrêté à 18:00 et relancé dans les 2 h : rattrapage ; plus
     tard : rien ce jour-là. Cible refusée par le service (404, 410 : appli désinstallée, notifications coupées) : retirée. Plus revu depuis 90 jours (l'appli se
     réenregistre chaque semaine quand elle sert) : oublié. Serveur plein (pushMax) : l'appareil le moins récemment revu laisse sa place. */
  const PUSH = o.push && typeof o.push.send === 'function' && typeof o.push.target === 'function' ? o.push : null;
  const PUSH_WIN = Math.max(0, o.pushWindowMs ?? 2 * 3600e3), PUSH_BATCH = Math.max(1, o.pushBatch || 100), PUSH_CONC = 8, PUSH_DEVS = 8, PUSH_MAX = Math.max(1, o.pushMax || 20000), PUSH_OLD = 90 * DAY;
  const PUSH_FILE = join(dir, 'push.json'), PUSH_K = /^[0-9a-f]{24}$/;
  /** Clé d'un appareil, comme proxy.mjs › alId(pushKey(cible)) : empreinte du jeton FCM ou de l'adresse Web Push. */
  const pushKey = s => createHash('sha1').update(s.fcm ? 'fcm:' + s.fcm : String(s.endpoint)).digest('hex').slice(0, 24);
  let pushT = null;
  /** Appareils (Map clé → { t : empreinte du compte, sub, l, at }, du moins au plus récemment revu) et journée annoncée, relus une fois. */
  function pushLoad() {
    if (!G.pl) G.pl = getJson(PUSH_FILE).then(j => {
      const d = new Map(j && j.d && typeof j.d === 'object' ? Object.entries(j.d).filter(([k, x]) => PUSH_K.test(k) && x && typeof x.t === 'string' && x.sub && typeof x.sub === 'object') : []), s = j && j.sent;
      return (G.pu = { d, sent: s && DAY_RE.test(s.day) ? { day: s.day, cur: String(s.cur || ''), done: !!s.done, n: Number(s.n) || 0 } : { day: '', cur: '', done: false, n: 0 } });
    });
    return G.pl;
  }
  /** Écriture (une à la fois) ; strict : l'erreur remonte (position d'un envoi : sans elle, rien ne part). */
  function pushSave(strict) {
    clearTimeout(pushT); pushT = null;
    const run = (G.pq || Promise.resolve()).then(() => put(PUSH_FILE, JSON.stringify({ v: 1, sent: G.pu.sent, d: Object.fromEntries(G.pu.d) })));
    G.pq = run.catch(() => {});
    return strict ? run : run.catch(e => log.warn('Carte mystère : appareils non enregistrés (' + (e && e.code || e) + ')'));
  }
  const pushSoon = () => { if (!pushT) { pushT = setTimeout(() => { pushT = null; pushSave(); }, 1500); if (pushT.unref) pushT.unref(); } };
  /** POST /api/daily/push : { sub, l } enregistre cet appareil pour le compte (→ { ok, k }) ; { off: k } le retire (seulement s'il est à ce compte). */
  async function pushReg(res, tag, b) {
    const P = await pushLoad();
    if (typeof b.off === 'string') { const x = P.d.get(b.off); if (x && x.t === tag) { P.d.delete(b.off); pushSoon(); } return json(res, 200, { ok: true }); }
    const sub = PUSH.target(b.sub); if (!sub) return json(res, 400, { error: 'bad_subscription', message: 'Abonnement push invalide ou refusé.' });
    const k = pushKey(sub);
    P.d.delete(k); P.d.set(k, { t: tag, sub, l: DLY_LANGS.includes(b.l) ? b.l : 'fr', at: now() });      // en dernier : les plus anciens d'abord quand il faut faire de la place
    const mine = [...P.d.keys()].filter(x => P.d.get(x).t === tag);
    for (const x of mine.slice(0, Math.max(0, mine.length - PUSH_DEVS))) P.d.delete(x);      // 8 appareils par compte : les plus anciens partent
    while (P.d.size > PUSH_MAX) P.d.delete(P.d.keys().next().value);
    pushSoon(); return json(res, 200, { ok: true, k });
  }
  /** Annonce de la carte du jour (tour de garde) : nombre d'appareils prévenus. */
  async function pushRun(rec) {
    if (rec.st !== 'ready' || !G.imgs.has(rec.day)) return 0;
    const t = now(), t0 = C.startOf(rec.day); if (t < t0 || t - t0 > PUSH_WIN) return 0;      // trop tard (serveur arrêté plus de 2 h) : rien aujourd'hui
    const P = await pushLoad();
    if (P.sent.day > rec.day || (P.sent.day === rec.day && P.sent.done)) return 0;
    if (P.sent.day !== rec.day) P.sent = { day: rec.day, cur: '', done: false, n: 0 };
    const s = P.sent, L = DLY_PUSH_TXT, ttl = Math.max(60, Math.min(86400, Math.floor((C.nextOf(rec.day) - t) / 1000)));      // gardée par le service jusqu'à la carte suivante
    for (const [k, x] of P.d) if ((Number(x.at) || 0) < t - PUSH_OLD) P.d.delete(k);
    const ks = [...P.d.keys()].filter(k => k > s.cur).sort();
    let ok = 0, gone = 0, bad = 0;
    for (let i = 0; i < ks.length; i += PUSH_BATCH) {
      const part = ks.slice(i, i + PUSH_BATCH), prev = s.cur; s.cur = part[part.length - 1];
      try { await pushSave(true); } catch (e) { s.cur = prev; throw e; }      // position écrite avant l'envoi du lot, sinon rien ne part (nouvel essai au tour suivant)
      let j = 0;
      await Promise.all(Array.from({ length: Math.min(PUSH_CONC, part.length) }, async () => {
        while (j < part.length) {
          const k = part[j++], x = P.d.get(k); if (!x) continue;
          const [title, body] = L[x.l] || L.fr;
          let st = 0; try { st = await PUSH.send({ sub: x.sub, title, body, url: DLY_PUSH_URL, kind: 'open', tag: 'mo-mystere', topic: 'mo-mystere', ttl, urgency: 'normal' }); } catch (e) { st = 0; }
          if (st && st < 300) ok++; else if (st === 404 || st === 410) { P.d.delete(k); gone++; } else bad++;
        }
      }));
    }
    s.done = true; s.n += ok; await pushSave();
    if (ks.length) log.log(`Carte mystère du ${rec.day} annoncée : ${ok} appareil${ok > 1 ? 's' : ''} prévenu${ok > 1 ? 's' : ''}${gone ? `, ${gone} périmé${gone > 1 ? 's' : ''} retiré${gone > 1 ? 's' : ''}` : ''}${bad ? `, ${bad} refus` : ''}.`);
    return ok;
  }

  /* ── Carte de la veille révélée (o.reveal : proxy.mjs › discord-srv.mjs, message dans #carte-mystère ; null : rien) ──────────────────────
     Tour de garde : la carte du jour prête (images faites) et son heure passée → la carte de la VEILLE passée une fois à reveal(info). Serveur arrêté plusieurs
     jours : seulement la veille du jour en cours (jamais une carte plus ancienne) ; veille sans carte (serveur arrêté ce jour-là) : rien. Jour noté dans reveal.json
     AVANT l'envoi (comme la position de la notification) : un redémarrage en plein envoi ne la révèle jamais deux fois (au pire, pas du tout ce jour-là) ;
     reveal refuse (erreur, ou false) : fichier remis comme avant, nouvel essai au tour suivant. Écrit après seulement, un arrêt entre l'envoi et l'écriture
     (redéploiement) la reposterait au démarrage : un doublon public se voit plus qu'un oubli. Fichier illisible au départ : rien (on ne sait pas ce qui est parti). */
  const REVEAL = typeof o.reveal === 'function' ? o.reveal : null, RV_FILE = join(dir, 'reveal.json');
  async function revealRun(rec) {
    if (rec.st !== 'ready' || !G.imgs.has(rec.day) || now() < C.startOf(rec.day)) return false;
    const day = dlyAdd(rec.day, -1);
    if (G.rv === undefined) {
      let j = null; try { j = JSON.parse(await readFile(RV_FILE, 'utf8')); } catch (e) { if (e && e.code !== 'ENOENT') { log.warn('Carte mystère : reveal.json illisible, rien de révélé'); G.rv = '9999-12-31'; return false; } }
      G.rv = j && DAY_RE.test(j.day) ? j.day : '';
    }
    if (G.rv >= day || G.rvNone === day) return false;
    const w = G.saving.get(day), y = (w && w.rec) || await recLoad(day);
    if (!y || !y.card || !y.card.l) { G.rvNone = day; return false; }      // pas de carte ce jour-là : rien à révéler (pas relu à chaque tour)
    const c = y.card, fr = c.l.fr && !c.l.fr.fb ? c.l.fr : null, en = c.l.en || Object.values(c.l)[0] || {};
    const done = Object.values(y.plays).filter(finished), info = { day, fr: (fr || en).n || c.en, en: c.en, set: c.set, setName: c.sn || '', num: c.num, img: (fr || en).img || '',
      scry: `https://scryfall.com/card/${encodeURIComponent(c.set)}/${encodeURIComponent(c.num)}`, plays: done.length, wins: done.filter(p => p.st === 'win').length };
    const prev = G.rv;
    await put(RV_FILE, JSON.stringify({ v: 1, day, st: 'send', at: now() }));      // AVANT l'envoi (sans lui, rien ne part : nouvel essai au tour suivant)
    G.rv = day;
    let ok = false, err = null; try { ok = (await REVEAL(info)) !== false; } catch (e) { err = e; }
    if (!ok) {
      G.rvFail = day; G.rv = prev; await put(RV_FILE, JSON.stringify({ v: 1, day: prev, st: 'done', at: now() })).catch(() => {});      // remis : nouvel essai au tour suivant (fichier pas remis : ce serveur réessaie quand même, un redémarrage non)
      if (G.rvWarn !== day) { G.rvWarn = day; log.warn(`Carte mystère du ${day} pas encore révélée (${err ? err.message || err : 'refusé'}) : nouvel essai à chaque tour`); }
      return false;
    }
    G.rvFail = null; await put(RV_FILE, JSON.stringify({ v: 1, day, st: 'done', at: now() })).catch(() => {});
    return true;
  }

  /* ── Discord : carte du jour annoncée, classement de la semaine (o.announce, o.weekly : proxy.mjs › discord-srv.mjs › discord-daily.mjs ; null : rien) ──────
     Tour de garde, après la carte d'hier (reveal) : le dimanche, classement de la semaine du jeu (weekOf : lundi 18 h → lundi 18 h) sur les cartes déjà closes, du lundi
     au samedi (mêmes règles que le classement « week » de l'appli : comptes établis, hors entraînement, « à vérifier » exclus, pseudos masqués par le panneau
     affichés comme tels) ; puis la carte du jour annoncée (ping du rôle). Toutes deux seulement quand la carte du jour est prête (images faites) et son heure passée.
     Annonce : dans les announceWindowMs après l'heure de la carte (pushWindowMs, 2 h : serveur relancé plus tard, rien ce jour-là, jamais une annonce en retard) ;
     carte d'hier refusée par Discord : l'annonce attend son nouvel essai (l'ordre reste) pendant announceOrderMs (10 min) au plus. Classement : tout le dimanche
     (jusqu'à lundi 18 h, il reste juste) ; personne de classé : rien. Jour et semaine notés dans discord-daily.json AVANT l'envoi, comme reveal.json : jamais deux
     fois (redémarrage, arrêt en plein envoi : au pire pas du tout) ; refus de Discord : remis comme avant, nouvel essai au tour suivant. Fichier illisible : rien. */
  const ANNOUNCE = typeof o.announce === 'function' ? o.announce : null, WEEKLY = typeof o.weekly === 'function' ? o.weekly : null, DD_FILE = join(dir, 'discord-daily.json');
  const AN_WIN = Math.max(0, o.announceWindowMs ?? PUSH_WIN), AN_ORDER = Math.max(0, o.announceOrderMs ?? 10 * 60e3);
  /** État (jour annoncé, semaine postée), relu une fois ; null : fichier illisible (on ne sait pas ce qui est parti : rien). */
  async function ddLoad() {
    if (G.dd === undefined) {
      let j = null; try { j = JSON.parse(await readFile(DD_FILE, 'utf8')); } catch (e) { if (e && e.code !== 'ENOENT') { log.warn('Carte mystère : discord-daily.json illisible, rien d\'annoncé sur Discord'); return (G.dd = null); } }
      G.dd = { day: j && DAY_RE.test(j.day) ? j.day : '', week: j && DAY_RE.test(j.week) ? j.week : '' };
    }
    return G.dd;
  }
  const ddSave = S => put(DD_FILE, JSON.stringify({ v: 1, day: S.day, week: S.week, at: now() }));
  /** Un envoi : clé k (day ou week) notée avant, remise si Discord refuse (journal une fois par valeur). */
  async function ddSend(S, k, v, fn, info, what) {
    const prev = S[k]; S[k] = v;
    try { await ddSave(S); } catch (e) { S[k] = prev; throw e; }      // sans l'état écrit, rien ne part (nouvel essai au tour suivant)
    let ok = false, err = null; try { ok = (await fn(info)) !== false; } catch (e) { err = e; }
    if (ok) return true;
    S[k] = prev; await ddSave(S).catch(() => {});
    const wk = k + '|' + v; if (G.ddWarn !== wk) { G.ddWarn = wk; log.warn(`Carte mystère : ${what} pas encore posté sur Discord (${err ? err.message || err : 'refusé'}) : nouvel essai à chaque tour`); }
    return false;
  }
  /** Classement de la semaine (dimanche) : lundi → samedi, top 10. */
  async function weekRun(rec) {
    if (new Date(dlyUtc(rec.day)).getUTCDay() !== 0) return false;      // dimanche seulement (la carte du dimanche 18 h ouvre le dernier jour de la semaine du jeu)
    const wk = C.weekOf(rec.day), S = await ddLoad(); if (!S || S.week >= wk || G.wkNone === wk) return false;
    const days = []; for (let d = wk; d < rec.day; d = dlyAdd(d, 1)) days.push(d);
    const sums = new Map(); for (const d of days) { const w = G.saving.get(d); sums.set(d, w && w.rec ? daySum(w.rec) : await sumOf(d)); }
    const rows = boardRows(days, sums);
    if (!rows.length) { G.wkNone = wk; return false; }      // personne de classé : rien (pas relu à chaque tour)
    const info = { day: rec.day, week: wk, days: days.length, total: rows.length, hour: C.hour, tz: C.tz, to: C.startOf(dlyAdd(wk, 7)),
      rows: rows.slice(0, 10).map((r, i) => { const h = G.hidden.has(r.tag); return { r: i + 1, n: h ? '' : r.n || dlyFall(r.tag), s: r.s, d: r.d, ...(h ? { x: 1 } : {}) }; }) };
    return ddSend(S, 'week', wk, WEEKLY, info, `classement de la semaine du ${wk}`);
  }
  /** Carte du jour annoncée (ping du rôle) : une fois, dans la fenêtre, après la carte d'hier. */
  async function annRun(rec) {
    const t = now(), t0 = C.startOf(rec.day); if (t - t0 > AN_WIN) return false;      // trop tard (serveur arrêté) : rien aujourd'hui
    const S = await ddLoad(); if (!S || S.day >= rec.day) return false;
    if (REVEAL && G.rvFail === dlyAdd(rec.day, -1) && t - t0 < AN_ORDER) return false;      // carte d'hier pas encore partie : elle d'abord
    return ddSend(S, 'day', rec.day, ANNOUNCE, { day: rec.day, no: dlyNo(rec.day) }, `Carte mystère du ${rec.day} (annonce)`);
  }
  async function dscRun(rec) {
    if (rec.st !== 'ready' || !G.imgs.has(rec.day) || now() < C.startOf(rec.day)) return;      // jamais avant que la carte du jour soit prête
    const w = e => log.warn('Carte mystère : Discord (' + (e && (e.code || e.message) || e) + ')');
    if (WEEKLY) await weekRun(rec).catch(w);
    if (ANNOUNCE) await annRun(rec).catch(w);
  }

  /** Démarrage : premier tour peu après (firstMs), puis chaque minute. */
  function start() {
    if (G.timer) return;
    const first = setTimeout(() => { tick(); G.timer = setInterval(tick, o.tickMs || 60e3); if (G.timer.unref) G.timer.unref(); }, o.firstMs ?? 3000); if (first.unref) first.unref();
    G.timer = first;
  }
  async function stop() { clearInterval(G.timer); clearTimeout(G.timer); G.timer = null; for (const w of [...G.saving.values()]) if (w.t) { clearTimeout(w.t); await saveSoon(w.rec, true); } if (statsT) { clearTimeout(statsT); statsT = null; await statsSave(); } if (lvT) { clearTimeout(lvT); lvT = null; await lvSave(); } if (pushT) await pushSave(); }
  return { api, admin, level, profile, tick, start, stop, clock: C, current, no: () => dlyNo(C.dayOf(now())), pushOn: !!PUSH, revealOn: !!REVEAL, announceOn: !!ANNOUNCE, weeklyOn: !!WEEKLY, flush: async () => { for (const w of [...G.saving.values()]) await saveSoon(w.rec, true); if (G.stats) await statsSave(); if (G.lv) await lvSave(); if (G.pu) await pushSave(); }, _g: G };
}
