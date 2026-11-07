// Gabarits des posts Instagram (carrousels 1080 × 1350, format 4:5) : même DA que la fiche Google Play et les vidéos (nuit #0b0f1c, aurores,
// orbite foil avec les orbes de mana, Bricolage Grotesque + Instrument Sans, vrais écrans de l'appli dans un téléphone incliné).
// Une diapo = { g: '<gabarit>', ...champs } ; chaque gabarit rend le contenu HTML d'une diapo, rendu.mjs pose le fond (tranche de l'orbite du post).
// Texte : *mot* = dégradé foil, **mot** = gras blanc, \n = retour à la ligne. Mode d'emploi et champs de chaque gabarit : LISEZMOI.md.
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MANA } from '../fonts/mana-symbols.mjs';

const DIR = dirname(fileURLToPath(import.meta.url)), ROOT = join(DIR, '..', '..');
export const W = 1080, H = 1350;
/** Écrans de l'appli : node tools/store-assets.mjs video fr → shots/video/fr-<nom>.png (984 × 1584). */
export const SCR_W = 984, SCR_H = 1584;
export const ecranPath = n => join(ROOT, 'shots', 'video', 'fr-' + n + '.png');
export const ecranOk = n => existsSync(ecranPath(n));
const url = p => 'file://' + p;

/* ── Texte ─────────────────────────────────────────────────────────────────────────────────────────────── */
const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
/** *foil*, **gras**, \n, et {W} {U} {B} {R} {G} {1} {4} : symboles de mana dans le texte. */
export const tx = s => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/\*(.+?)\*/g, '<em>$1</em>').replace(/\n/g, '<br>')
  .replace(/\{([WUBRG14])\}/g, (m, k) => manaSvg(k, 'ms-in'));

/* ── Symboles et logo ──────────────────────────────────────────────────────────────────────────────────── */
const MANA_BG = { W: '#f8f6d8', U: '#9cc3ff', B: '#b9aac6', R: '#ff9a7e', G: '#86d79c', 1: '#d3d8e2', 4: '#d3d8e2' };
export const manaSvg = (k, cls = '') => `<svg class="ms ${cls}" viewBox="-6 -6 44 44"><circle cx="16" cy="16" r="21" fill="${MANA_BG[k]}"/><path d="${MANA[k]}" fill="#16131a" transform="translate(4.8 4.8) scale(.7)"/></svg>`;
export const FOIL_STOPS = '<stop offset="0" stop-color="#ff8fc3"/><stop offset=".26" stop-color="#ffd479"/><stop offset=".5" stop-color="#7be8c8"/><stop offset=".74" stop-color="#7fb0ff"/><stop offset="1" stop-color="#c79bff"/>';
export const FOIL = 'linear-gradient(100deg,#ff8fc3 0%,#ffd479 28%,#7be8c8 52%,#7fb0ff 76%,#c79bff 100%)';
/** Logo (même dessin que tools/make-icons.mjs et la fiche Play). */
export const LOGO = (id = 'lf') => `<svg class="logo" viewBox="6 8 88 88"><defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1">${FOIL_STOPS}</linearGradient></defs>
  <g transform="rotate(-20 50 52)"><path d="M12 52A38 13 0 0 1 88 52" fill="none" stroke="#9aa3b8" stroke-width="2.4" stroke-linecap="round"/><circle cx="27.7" cy="41.5" r="3.4" fill="#ff7a5c" fill-opacity=".85"/><circle cx="72.3" cy="41.5" r="3.4" fill="#6fd08c" fill-opacity=".85"/></g>
  <g transform="rotate(-11 51 50)"><rect x="37" y="27" width="28" height="41" rx="5" fill="url(#${id})"/><rect x="39.6" y="29.6" width="22.8" height="35.8" rx="3.2" fill="none" stroke="#fff" stroke-opacity=".45" stroke-width="1.1"/></g>
  <g transform="rotate(-20 50 52)"><path d="M12 52A38 13 0 0 0 88 52" fill="none" stroke="#9aa3b8" stroke-width="2.4" stroke-linecap="round"/><circle cx="86.1" cy="56" r="4.3" fill="#7fb0ff"/><circle cx="50" cy="65" r="4.3" fill="#f8f6d8"/><circle cx="13.9" cy="56" r="4.3" fill="#b5a3c8"/></g></svg>`;

/* ── Fond : une orbite d'un seul tenant sur toutes les diapos du post (on la voit continuer en glissant) ─────────────── */
const hash = s => { let h = 2166136261; for (const c of String(s)) { h ^= c.codePointAt(0); h = Math.imul(h, 16777619) >>> 0; } return h; };
export const rnd = seed => { let x = hash(seed) || 1; return () => { x ^= x << 13; x >>>= 0; x ^= x >> 17; x ^= x << 5; x >>>= 0; return x / 4294967296; }; };
const AUR = ['#3f8fe0', '#3a9a5e', '#c79bff', '#e0533d'];
/** Panorama N × 1080 de large : aurores, étoiles, orbite foil ondulée et orbes de mana, tirés d'après l'id du post (chaque post a le sien). */
export function panoSvg(n, seed) {
  const PW = n * W, r = rnd('pano:' + seed), ph = r() * 6.28, amp = 70 + r() * 40, base = 980 + r() * 120, tours = 0.5 + n * 0.32;
  const blobs = []; for (let i = 0; i < n * 2 + 1; i++) blobs.push([i * W / 2 + (r() - 0.5) * 300, i % 2 ? 1150 + r() * 200 : r() * 220, 360 + r() * 160, AUR[Math.floor(r() * 4)], 0.32 + r() * 0.2]);
  const defs = blobs.map(([, , , c, o], i) => `<radialGradient id="pg${i}"><stop offset="0" stop-color="${c}" stop-opacity="${o.toFixed(2)}"/><stop offset="1" stop-color="${c}" stop-opacity="0"/></radialGradient>`).join('');
  const glow = blobs.map(([x, y, rr], i) => `<circle cx="${x.toFixed(0)}" cy="${y.toFixed(0)}" r="${rr.toFixed(0)}" fill="url(#pg${i})"/>`).join('');
  const stars = Array.from({ length: 55 * n }, () => `<circle cx="${(r() * PW).toFixed(0)}" cy="${(r() * H).toFixed(0)}" r="${[1, 1, 1.4, 1.9][Math.floor(r() * 4)]}" fill="#fff" fill-opacity="${(0.12 + r() * 0.3).toFixed(2)}"/>`).join('');
  const pts = []; for (let x = 0; x <= PW + 1; x += 18) pts.push([x, base + amp * Math.sin(x / PW * 2 * Math.PI * tours + ph)]);
  const path = f => 'M' + pts.map(([x, y]) => x.toFixed(0) + ' ' + f(x, y).toFixed(1)).join(' L');
  const cols = ['#f8f6d8', '#7fb0ff', '#b5a3c8', '#ff7a5c', '#6fd08c'];
  const orbs = Array.from({ length: n * 2 }, (_, i) => {
    const t = (i + 0.35 + r() * 0.3) / (n * 2), [x, y] = pts[Math.min(pts.length - 1, Math.floor(t * (pts.length - 1)))], c = cols[i % 5];
    return `<circle cx="${x.toFixed(0)}" cy="${y.toFixed(0)}" r="24" fill="${c}" fill-opacity=".16"/><circle cx="${x.toFixed(0)}" cy="${y.toFixed(0)}" r="9.5" fill="${c}"/>`;
  }).join('');
  return `<svg class="pano" xmlns="http://www.w3.org/2000/svg" width="${PW}" height="${H}" viewBox="0 0 ${PW} ${H}"><defs>${defs}<linearGradient id="pfoil" x1="0" y1="0" x2="1" y2="0">${FOIL_STOPS}</linearGradient></defs>
    <rect width="${PW}" height="${H}" fill="#0b0f1c"/>${glow}${stars}
    <path d="${path((x, y) => y - 230 + 36 * Math.sin(x / PW * 2 * Math.PI * (tours * 1.7)))}" fill="none" stroke="#c3cbe0" stroke-opacity=".2" stroke-width="1.6" stroke-dasharray="4 8"/>
    <path d="${path((x, y) => y)}" fill="none" stroke="url(#pfoil)" stroke-opacity=".85" stroke-width="3.2" stroke-linecap="round"/>${orbs}</svg>`;
}

/* ── CSS commun ─────────────────────────────────────────────────────────────────────────────────────────── */
const FONTS = join(ROOT, 'tools', 'fonts');
export const CSS = `
@font-face{font-family:'MO Display';font-weight:200 800;src:url(${url(join(FONTS, 'bricolage-grotesque-latin-opsz-normal.woff2'))}) format('woff2')}
@font-face{font-family:'MO Text';font-weight:400 700;src:url(${url(join(FONTS, 'instrument-sans-latin-wght-normal.woff2'))}) format('woff2')}
:root{--bg:#0b0f1c;--surface:rgba(19,26,43,.86);--line:rgba(146,156,255,.22);--ink:#f2f4ff;--ink-2:#b3bdd8;--ink-3:#8a96b6;--accent:#929cff;--ok:#6fd08c;--warm:#ffd479;--rose:#ff8fc3;--corail:#ff7a5c}
*{box-sizing:border-box;margin:0}
html,body{width:${W}px;height:${H}px;overflow:hidden;background:var(--bg);color:var(--ink);font-family:'MO Text',sans-serif;-webkit-font-smoothing:antialiased}
.pano{position:absolute;top:0;left:calc(var(--i) * -${W}px)}
.s{position:absolute;inset:0}
em{font-style:normal;background:${FOIL};-webkit-background-clip:text;background-clip:text;color:transparent;padding-right:.04em}
b{font-weight:700;color:var(--ink)}
.ms{display:inline-block;width:1em;height:1em;vertical-align:-.12em;filter:drop-shadow(0 4px 10px rgba(0,0,0,.45))}
.ms-in{width:.92em;height:.92em;margin:0 .04em}
.kick{position:absolute;left:72px;top:64px;display:inline-flex;align-items:center;gap:14px;padding:13px 24px 13px 18px;border-radius:999px;background:rgba(19,26,43,.7);border:1.5px solid var(--line);
  font:600 27px/1 'MO Text';letter-spacing:.01em;color:var(--ink-2);backdrop-filter:blur(6px)}
.kick .logo{width:38px;height:38px}
.kick i{font-style:normal;color:var(--ink-3)}
h1{font:780 92px/1.02 'MO Display';letter-spacing:-.035em;text-wrap:balance}
h2{font:760 70px/1.04 'MO Display';letter-spacing:-.032em;text-wrap:balance}
p.t{font:500 37px/1.36 'MO Text';color:var(--ink-2);letter-spacing:-.004em;text-wrap:pretty}
p.t b{color:var(--ink);font-weight:650}
.haut{position:absolute;left:72px;right:72px;top:150px}
.haut p.t{margin-top:24px}
.num{display:inline-grid;place-items:center;min-width:84px;height:84px;padding:0 20px;margin-bottom:28px;border-radius:26px;background:var(--accent);color:#0b0f1c;font:800 50px/1 'MO Display';letter-spacing:-.03em;box-shadow:0 18px 40px -16px var(--accent)}
.glisse{position:absolute;left:72px;bottom:62px;display:flex;align-items:center;gap:14px;font:600 29px/1 'MO Text';color:var(--ink-2)}
.glisse svg{width:46px;height:46px}

/* téléphone : écran 984 × 1584 réduit ; --ty = décalage de l'image dans l'écran (px de la capture) */
.tel{position:absolute;padding:14px;border-radius:78px;background:linear-gradient(160deg,#4a5480 0%,#1a2036 30%,#10141f 62%,#343c5e 100%);
  box-shadow:0 0 0 3px rgba(255,255,255,.1),0 70px 140px -20px rgba(0,0,0,.75)}
.tel .vue{position:relative;overflow:hidden;border-radius:64px;background:#0b0f1c}
.tel .vue img{display:block;position:absolute;left:0;width:100%}
.tel .vue::after{content:"";position:absolute;inset:0;background:linear-gradient(115deg,rgba(255,255,255,.08) 0%,rgba(255,255,255,0) 30%,rgba(255,255,255,0) 72%,rgba(255,255,255,.035) 100%)}

/* loupe : morceau de capture agrandi qui sort du téléphone */
.loupe{position:absolute;border-radius:30px;background-repeat:no-repeat;background-color:#0b0f1c;
  box-shadow:0 0 0 3px rgba(146,156,255,.55),0 40px 80px -20px rgba(0,0,0,.95),0 0 80px -10px rgba(146,156,255,.4)}
.pastille{position:absolute;display:inline-flex;align-items:center;gap:14px;padding:18px 30px;border-radius:999px;background:rgba(19,26,43,.94);border:2px solid var(--line);
  font:750 38px/1 'MO Display';letter-spacing:-.02em;white-space:nowrap;box-shadow:0 24px 50px -18px rgba(0,0,0,.9)}
.pastille b{color:var(--warm)}.pastille.ok b{color:var(--ok)}.pastille.a b{color:var(--accent)}.pastille.r b{color:var(--rose)}

/* blocs */
.bloc{background:var(--surface);border:1.5px solid var(--line);border-radius:36px;box-shadow:0 30px 70px -30px rgba(0,0,0,.9)}
.etapes{position:absolute;left:72px;right:72px;display:flex;flex-direction:column;gap:22px}
.etape{display:grid;grid-template-columns:76px 1fr;gap:28px;align-items:start;padding:30px 34px}
.etape .n{display:grid;place-items:center;width:76px;height:76px;border-radius:50%;background:var(--accent);color:#0b0f1c;font:800 40px/1 'MO Display'}
.etape .n .ms{width:76px;height:76px;vertical-align:0}
.etape h3{font:740 48px/1.1 'MO Display';letter-spacing:-.02em;margin-top:6px}
.etape p{margin-top:10px;font:500 34px/1.34 'MO Text';color:var(--ink-2)}
.etape p b{font-weight:650}
.etape.mini{grid-template-columns:60px 1fr;gap:24px;padding:24px 30px}
.etape.mini .n{width:60px;height:60px;font-size:32px}.etape.mini .n .ms{width:60px;height:60px}
.etape.mini h3{font-size:42px;margin-top:4px}
.etape.mini p{font-size:31px;margin-top:6px}

.gros{font:800 400px/.82 'MO Display';letter-spacing:-.06em;background:${FOIL};-webkit-background-clip:text;background-clip:text;color:transparent;filter:drop-shadow(0 30px 60px rgba(146,156,255,.25))}
.gros small{font-size:.32em;letter-spacing:-.03em}

/* carte dessinée (aucune illustration réelle) */
.carte{position:absolute;filter:drop-shadow(0 50px 70px rgba(0,0,0,.7))}
.vraie{position:relative}.vraie:has(.cadre-nom){overflow:hidden;border-radius:4.8%/3.4%}.vraie img,.vraie svg{display:block;width:100%;border-radius:4.8%/3.4%}
.cadre-nom{position:absolute;left:2.5%;right:2.5%;top:2.6%;height:8%;border-radius:12px;border:5px dashed var(--warm);box-shadow:0 0 0 9999px rgba(11,15,28,.45),0 0 40px rgba(255,212,121,.6)}
.legal{position:absolute;left:90px;right:90px;bottom:44px;font:500 19px/1.4 'MO Text';color:var(--ink-3);text-align:center;opacity:.8}
.dos{position:absolute;border-radius:34px;background:radial-gradient(70% 55% at 50% 45%,#2c3463 0%,#151b33 70%);border:14px solid #0d0f17;
  box-shadow:0 0 0 2px rgba(255,255,255,.08),0 50px 90px -20px rgba(0,0,0,.9);display:grid;place-items:center;overflow:hidden}
.dos::before{content:"";position:absolute;inset:26px;border-radius:20px;border:2px dashed rgba(195,203,224,.25)}
.dos span{font:800 300px/1 'MO Display';background:${FOIL};-webkit-background-clip:text;background-clip:text;color:transparent}

/* fin */
.fin{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;text-align:center}
.fin .logo{width:300px;height:300px;margin-top:230px;filter:drop-shadow(0 40px 60px rgba(146,156,255,.4))}
.fin h1{margin-top:40px;font-size:118px}
.fin p.t{margin-top:22px;max-width:820px}
.gp{display:inline-flex;align-items:center;gap:20px;margin-top:56px;padding:28px 50px;border-radius:999px;background:var(--accent);color:#0b0f1c;font:750 46px/1 'MO Display';letter-spacing:-.02em;box-shadow:0 24px 60px -18px var(--accent)}
.gp svg{width:42px;height:42px}
.fin .plus{margin-top:34px;font:500 34px/1.5 'MO Text';color:var(--ink-2)}
.fin .plus b{color:var(--ink);font-weight:650}

/* liste à deux colonnes (texte | valeur) */
.rangs{position:absolute;left:72px;right:72px;display:flex;flex-direction:column;gap:16px}
.rang{display:grid;grid-template-columns:96px 1fr;gap:26px;align-items:center;padding:24px 30px}
.rang .k{display:grid;place-items:center;width:96px;height:96px;border-radius:28px;font:800 54px/1 'MO Display';color:#0b0f1c}
.rang h3{font:740 45px/1.1 'MO Display';letter-spacing:-.02em}
.rang h3 small{font:600 28px/1 'MO Text';color:var(--ink-3);margin-left:10px;letter-spacing:0}
.rang p{margin-top:8px;font:500 32px/1.32 'MO Text';color:var(--ink-2)}

/* à la une (stories 1080 × 1920) */
.une{position:absolute;inset:0;display:grid;place-items:center}
.une .rond{width:620px;height:620px;border-radius:50%;display:grid;place-items:center;background:radial-gradient(closest-side,rgba(146,156,255,.22),rgba(146,156,255,.04) 70%,transparent);border:4px solid rgba(255,255,255,.16)}
.une .rond svg{width:300px;height:300px}
`;

/* ── Pièces ─────────────────────────────────────────────────────────────────────────────────────────────── */
const ARROW = `<svg viewBox="0 0 48 48"><circle cx="24" cy="24" r="22" fill="none" stroke="currentColor" stroke-opacity=".35" stroke-width="2"/><path d="M17 24h14m-6-7 7 7-7 7" fill="none" stroke="#f2f4ff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const GP_ICON = '<svg viewBox="0 0 24 24"><path fill="#0b0f1c" d="M4.2 2.4c-.3.3-.4.7-.4 1.2v16.8c0 .5.1.9.4 1.2l.1.1 9.4-9.4v-.2L4.3 2.3zm12.6 12.7-3.1-3.1v-.2l3.1-3.1.1.1 3.7 2.1c1.1.6 1.1 1.6 0 2.2l-3.7 2.1zm-.1.1L13.5 12l-9.3 9.4c.3.4.9.4 1.5.1zm0-6.4L5.7 2.5C5.1 2.2 4.5 2.2 4.2 2.6l9.3 9.4z"/></svg>';
const kick = (k, logoId) => k ? `<div class="kick">${LOGO(logoId)}${tx(k)}</div>` : '';

/** Téléphone : ecran (nom de la capture), x, y (coin haut gauche), l (largeur de l'écran), ty (px de la capture cachés en haut), rot (degrés). */
export function tel({ ecran, x = 250, y = 560, l = 560, ty = 0, rot = 0, h }) {
  const k = l / SCR_W, vh = h ?? Math.round(SCR_H * k);
  return `<div class="tel" style="left:${x}px;top:${y}px;transform:rotate(${rot}deg)"><div class="vue" style="width:${l}px;height:${vh}px"><img src="${url(ecranPath(ecran))}" style="top:${-ty * k}px"></div></div>`;
}
/** Loupe : morceau [cx, cy, cw, ch] (px de la capture) affiché à la largeur l, en (x, y). */
export function loupe({ ecran, crop: [cx, cy, cw, ch], x, y, l = 700, rot = -2 }) {
  const k = l / cw;
  return `<div class="loupe" style="left:${x}px;top:${y}px;width:${l}px;height:${Math.round(ch * k)}px;transform:rotate(${rot}deg);background-image:url(${url(ecranPath(ecran))});background-size:${SCR_W * k}px ${SCR_H * k}px;background-position:${-cx * k}px ${-cy * k}px"></div>`;
}
const pastilles = ps => (ps || []).map(p => `<div class="pastille ${p.c || ''}" style="left:${p.x}px;top:${p.y}px;transform:rotate(${p.rot ?? -2}deg)">${tx(p.t)}</div>`).join('');

/** Carte Magic dessinée (fausse : dégradé à la place de l'illustration). c = { nom, cout: '{1}', type, couleur: W|U|B|R|G|C|M, texte, l } */
const FRAME = { W: ['#f4eedb', '#cfc4a2'], U: ['#6b9be0', '#2d5a9c'], B: ['#6a6070', '#2b2530'], R: ['#e48466', '#a3402c'], G: ['#69b07a', '#2c6a43'], M: ['#ecd27c', '#b38c37'], C: ['#c3cad2', '#7d8893'] };
export function carteSvg({ nom, cout = '', type = '', couleur = 'C', texte = '' }, id = 'c') {
  const [f1, f2] = FRAME[couleur] || FRAME.C, r = rnd('art:' + nom);
  const pips = [...cout.matchAll(/\{(\w)\}/g)].map(m => m[1]);
  const pipSvg = pips.map((s, i) => { const x = 452 - (pips.length - i) * 30 + 12; return MANA[s] ? `<g transform="translate(${x - 13} 40)"><circle cx="13" cy="13" r="13" fill="${MANA_BG[s] || '#d3d8e2'}" stroke="#0005"/><path d="${MANA[s]}" fill="#16131a" transform="translate(4 4) scale(.56)"/></g>` : `<g><circle cx="${x}" cy="53" r="13" fill="#d3d8e2" stroke="#0005"/><text x="${x}" y="60" font-size="19" font-weight="700" text-anchor="middle" font-family="MO Display" fill="#16131a">${esc(s)}</text></g>`; }).join('');
  const hue = Math.floor(r() * 360), hue2 = (hue + 60 + r() * 120) % 360;
  const lines = String(texte).split('\n').map((l, i) => `<text x="58" y="${494 + i * 34}" font-family="MO Text" font-size="23" fill="#2a2620">${esc(l)}</text>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 488 680"><defs><linearGradient id="${id}f" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${f1}"/><stop offset="1" stop-color="${f2}"/></linearGradient>
    <linearGradient id="${id}a" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="hsl(${hue} 60% 62%)"/><stop offset=".55" stop-color="hsl(${hue2} 55% 42%)"/><stop offset="1" stop-color="hsl(${hue2} 45% 22%)"/></linearGradient>
    <linearGradient id="${id}b" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fbf8f0"/><stop offset="1" stop-color="#e2dccd"/></linearGradient></defs>
    <rect width="488" height="680" rx="26" fill="#121214"/><rect x="16" y="16" width="456" height="648" rx="17" fill="url(#${id}f)"/>
    <rect x="30" y="30" width="428" height="46" rx="10" fill="url(#${id}b)" stroke="#0005"/>
    <text x="46" y="62" font-family="MO Display" font-weight="700" font-size="25" fill="#1d1a16">${esc(nom)}</text>${pipSvg}
    <rect x="40" y="84" width="408" height="300" fill="url(#${id}a)"/>
    <circle cx="${120 + r() * 250}" cy="${140 + r() * 60}" r="${40 + r() * 30}" fill="#fff" fill-opacity=".35"/>
    <path d="M40 ${320 - r() * 60} L${150 + r() * 60} ${230 + r() * 40} L${260 + r() * 40} ${300 - r() * 30} L${360 + r() * 40} ${220 + r() * 40} L448 ${290 - r() * 40} L448 384 L40 384Z" fill="#000" fill-opacity=".28"/>
    <rect x="30" y="392" width="428" height="40" rx="8" fill="url(#${id}b)" stroke="#0005"/><text x="46" y="419" font-family="MO Text" font-weight="600" font-size="19" fill="#2a2620">${esc(type)}</text>
    <rect x="40" y="440" width="408" height="200" rx="6" fill="#f3efe4" fill-opacity=".94"/>${lines}</svg>`;
}

/** Carte d'un post : vraie image Scryfall si c.scry (chemin posé par rendu.mjs dans c._img), sinon carte dessinée. cadreNom : bande du nom entourée. */
const gris = c => (c.gris ? ' style="filter:grayscale(1) brightness(.75)"' : '');
export function carteHtml(c, id) {
  const nom = c.cadreNom ? '<div class="cadre-nom"></div>' : '';
  if (c._img) return `<div class="vraie"${gris(c)}><img src="${url(c._img)}">${nom}</div>`;
  return `<div class="vraie">${carteSvg(c, id)}${nom}</div>`;
}
/** Éventail de cartes (couvertures) : cartes [{ scry, lang }…]. */
const eventail = (cs, { x = 470, y = 640, l = 330, ecart = 150, angle = 9 } = {}) => cs.map((c, k) => {
  const m = (cs.length - 1) / 2, a = (k - m) * angle;
  return `<div class="carte" style="left:${x + k * ecart}px;top:${y + Math.abs(k - m) * 26}px;width:${l}px;transform:rotate(${a}deg);z-index:${k}">${carteHtml(c, 'ev' + k)}</div>`;
}).join('');

/* ── Gabarits ───────────────────────────────────────────────────────────────────────────────────────────── */
/** Mention de la Fan Content Policy (mêmes mots que l'appli), en petit sur la dernière diapo de chaque post. */
export const LEGAL = 'Mana Orbit est un contenu de fan non officiel autorisé par la Fan Content Policy. Il n\'est ni approuvé ni soutenu par Wizards of the Coast. Certains éléments utilisés sont la propriété de Wizards of the Coast. ©Wizards of the Coast LLC.';
/** Chaque gabarit : (diapo, { i, n, post }) → HTML. */
export const GABARITS = {
  /** Couverture : kicker, titre, sous ; visuel = tel {ecran, ty, rot, x, y, l} | carte {…} | dos | gros 'texte' | mana 'WUBRG' ; glisse (texte de l'invite à glisser, false : rien). */
  couverture(d, c) {
    let vis = '';
    const v = d.visuel || {};
    if (v.tel) vis = tel({ x: 470, y: 600, l: 520, rot: 6, ...v.tel });
    if (v.carte) vis = `<div class="carte" style="left:${v.x ?? 560}px;top:${v.y ?? 560}px;width:${v.l ?? 440}px;transform:rotate(${v.rot ?? 7}deg)">${carteHtml(v.carte, 'cv')}</div>`;
    if (v.cartes) vis = eventail(v.cartes, v);
    if (v.dos) vis = `<div class="dos" style="left:${v.x ?? 600}px;top:${v.y ?? 640}px;width:${v.l ?? 400}px;height:${Math.round((v.l ?? 400) * 1.395)}px;transform:rotate(${v.rot ?? 7}deg)"><span>?</span></div>`;
    if (v.gros) vis = `<div class="gros" style="position:absolute;right:${v.droite ?? 70}px;bottom:${v.bas ?? 110}px;font-size:${v.taille ?? 400}px">${tx(v.gros)}</div>`;
    if (v.mana) vis = `<div style="position:absolute;left:72px;bottom:150px;display:flex;gap:26px;font-size:120px">${[...v.mana].map(k => manaSvg(k)).join('')}</div>`;
    return `${kick(d.kicker, 'lk' + c.i)}<div class="haut" style="top:${d.haut ?? 190}px;right:${d.droite ?? 72}px"><h1 style="${d.taille ? 'font-size:' + d.taille + 'px' : ''}">${tx(d.titre)}</h1>${d.sous ? `<p class="t" style="max-width:${d.sousL ?? 620}px">${tx(d.sous)}</p>` : ''}</div>
      ${vis}${(d.loupes || []).map(l => loupe(l)).join('')}${pastilles(d.pastilles)}${d.glisse === false ? '' : `<div class="glisse">${ARROW}${tx(d.glisse || 'Glisse')}</div>`}`;
  },
  /** Écran de l'appli : num, titre, texte en haut ; téléphone {ecran, ty, x, y, l, rot} ; loupes [{ecran, crop, x, y, l, rot}] ; pastilles [{t, x, y, c}]. */
  ecran(d, c) {
    const t = d.tel || {}, odd = c.i % 2 === 1;
    return `${kick(d.kicker, 'lk' + c.i)}<div class="haut" style="top:${d.haut ?? 150}px">${d.num ? `<div class="num">${tx(d.num)}</div>` : ''}<h2>${tx(d.titre)}</h2>${d.texte ? `<p class="t">${tx(d.texte)}</p>` : ''}</div>
      ${tel({ x: odd ? 290 : 230, y: 640, l: 560, rot: odd ? 3 : -3, ...t })}${(d.loupes || []).map(l => loupe({ ecran: t.ecran, ...l })).join('')}${pastilles(d.pastilles)}`;
  },
  /** Grand chiffre : gros, titre, texte, mana (symbole décoratif). */
  chiffre(d, c) {
    return `${kick(d.kicker, 'lk' + c.i)}<div class="haut" style="top:${d.haut ?? 170}px"><div class="gros" style="font-size:${d.taille ?? 380}px">${tx(d.gros)}</div>
      <h2 style="margin-top:46px">${tx(d.titre)}</h2>${d.texte ? `<p class="t" style="margin-top:22px">${tx(d.texte)}</p>` : ''}</div>
      ${d.mana && !d.carte ? `<div style="position:absolute;right:86px;top:${d.manaY ?? 230}px;font-size:150px;transform:rotate(8deg)">${manaSvg(d.mana)}</div>` : ''}
      ${d.cartes ? eventail(d.cartes, d.eventail || {}) : ''}
      ${d.carte ? `<div class="carte" style="left:${d.carte.x ?? 690}px;top:${d.carte.y ?? 120}px;width:${d.carte.l ?? 320}px;transform:rotate(${d.carte.rot ?? 7}deg)">${carteHtml(d.carte, 'ch' + c.i)}</div>` : ''}${pastilles(d.pastilles)}`;
  },
  /** Étapes ou points : titre, texte, etapes [[titre, texte, marque?]] (marque : chiffre, symbole « W »…, sinon le rang), mini (plus serré), y (haut de la liste). */
  etapes(d, c) {
    const items = d.etapes.map(([h, p, m], k) => `<div class="etape bloc ${d.mini ? 'mini' : ''}"><div class="n">${m && /^[WUBRG]$/.test(m) ? manaSvg(m) : tx(m ?? String(k + 1))}</div><div><h3>${tx(h)}</h3>${p ? `<p>${tx(p)}</p>` : ''}</div></div>`).join('');
    return `${kick(d.kicker, 'lk' + c.i)}<div class="haut" style="top:${d.haut ?? 150}px"><h2>${tx(d.titre)}</h2>${d.texte ? `<p class="t">${tx(d.texte)}</p>` : ''}</div>
      <div class="etapes" style="top:${d.y ?? 470}px">${items}</div>`;
  },
  /** Rangs (tableau à une colonne) : titre, rangs [[clé, couleur, titre, petit, texte]]. */
  rangs(d, c) {
    const items = d.rangs.map(([k, col, h, sm, p]) => `<div class="rang bloc"><div class="k" style="background:${col}">${tx(k)}</div><div><h3>${tx(h)}${sm ? `<small>${tx(sm)}</small>` : ''}</h3>${p ? `<p>${tx(p)}</p>` : ''}</div></div>`).join('');
    return `${kick(d.kicker, 'lk' + c.i)}<div class="haut" style="top:${d.haut ?? 150}px"><h2>${tx(d.titre)}</h2>${d.texte ? `<p class="t">${tx(d.texte)}</p>` : ''}</div>
      <div class="rangs" style="top:${d.y ?? 400}px">${items}</div>`;
  },
  /** Texte seul (histoire, avis) : titre, texte (paragraphes séparés par une ligne vide), signature. */
  texte(d, c) {
    const ps = String(d.texte).split(/\n\n+/).map(p => `<p class="t" style="margin-top:34px;font-size:${d.taille ?? 42}px">${tx(p)}</p>`).join('');
    return `${kick(d.kicker, 'lk' + c.i)}<div class="haut" style="top:${d.haut ?? 190}px"><h2>${tx(d.titre)}</h2>${ps}${d.signature ? `<p class="t" style="margin-top:44px;color:var(--ink);font-weight:650">${tx(d.signature)}</p>` : ''}</div>${pastilles(d.pastilles)}`;
  },
  /** Indice d'une devinette : num, titre (« Indice 1 »), texte (l'indice en grand), revele (0 à 1 : part de la carte dévoilée). */
  indice(d, c) {
    return `${kick(d.kicker, 'lk' + c.i)}<div class="haut" style="top:${d.haut ?? 170}px;right:420px"><div class="num">${tx(d.num)}</div><h2 style="font-size:84px">${tx(d.texte)}</h2>${d.sous ? `<p class="t" style="margin-top:26px">${tx(d.sous)}</p>` : ''}</div>
      <div class="dos" style="left:690px;top:${300 + c.i * 0}px;width:330px;height:460px;transform:rotate(${c.i % 2 ? 6 : -5}deg)"><span style="font-size:240px">?</span></div>
      <div class="pastille a" style="left:640px;top:820px;transform:rotate(-3deg)">Indice <b>${tx(d.num)}</b>&nbsp;/ ${tx(d.sur ?? '5')}</div>`;
  },
  /** Carte dessinée en grand : titre, texte, carte {nom, cout, type, couleur, texte}. */
  carte(d, c) {
    return `${kick(d.kicker, 'lk' + c.i)}<div class="haut" style="top:${d.haut ?? 150}px;right:${d.droite ?? 72}px"><h2>${tx(d.titre)}</h2>${d.texte ? `<p class="t">${tx(d.texte)}</p>` : ''}</div>
      <div class="carte" style="left:${d.x ?? 290}px;top:${d.y ?? 470}px;width:${d.l ?? 500}px;transform:rotate(${d.rot ?? -4}deg)">${carteHtml(d.carte, 'cc' + c.i)}</div>${pastilles(d.pastilles)}`;
  },
  /** Fin : titre (défaut « Mana Orbit »), texte, plus (ligne du bas). */
  fin(d, c) {
    return `<div class="fin">${LOGO('lfin' + c.i)}<h1>${tx(d.titre || 'Mana Orbit')}</h1>${d.texte ? `<p class="t">${tx(d.texte)}</p>` : ''}
      <div class="gp">${GP_ICON}Gratuite sur Google Play</div><div class="plus">${tx(d.plus || '**manaorbit.app** · lien en bio')}</div></div>
      <div class="legal">${LEGAL}</div>`;
  },
};

/** Page complète d'une diapo : fond (tranche i de l'orbite), contenu. */
export function page(d, c, pano) {
  const g = GABARITS[d.g];
  if (!g) throw new Error(`${c.post.id} : gabarit inconnu « ${d.g} » (diapo ${c.i + 1})`);
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><style>${CSS}${d.css || ''}</style></head><body style="--i:${c.i}">${pano}<div class="s">${g(d, c)}</div></body></html>`;
}

/** Couverture « à la une » (story 1080 × 1920) : icône dans un rond, sur la même nuit. */
export function unePage({ icone, mana }, seed) {
  const ic = mana ? manaSvg(mana) : icone;
  return `<!doctype html><html><head><meta charset="utf-8"><style>${CSS}html,body{width:1080px;height:1920px}.pano{left:0}</style></head><body>${panoSvg(1, seed).replace(`height="${H}"`, 'height="1920"').replace(`viewBox="0 0 ${W} ${H}"`, 'viewBox="0 135 1080 1080" preserveAspectRatio="xMidYMid slice"')}<div class="une"><div class="rond">${ic}</div></div></body></html>`;
}
