// Flyers A4 pour les boutiques de jeu (à prendre ou à scanner) → docs/print/flyer-a4-<piste>.pdf et .png : PDF (texte, dessin et QR en vectoriel)
// et PNG 300 dpi, fond perdu de 3 mm (216 × 303 mm, coupe à 210 × 297), fond de nuit de l'appli. Quatre pistes :
//   « apercus » : trois vraies captures sur l'orbite foil, quatre points, QR ;
//   « mix »     : les trois captures prises dans l'orbite, les cinq orbes de mana portant chacun une partie de l'appli ;
//   « orbite »  : sans capture, une carte foil au centre de l'orbite et ses cinq orbes ;
//   « solo »    : « Combien vaut ton classeur ? », une capture en grand dans l'orbite, la liste des cinq parties.
// Captures : shots/store/fr-*.png (faites ici par `node tools/store-assets.mjs raw fr` si elles manquent), cartes factices.
// QR : src/qr.js, lien FIXE https://manaorbit.app/flyer (imprimé : ne jamais le changer ; la destination se règle dans proxy.mjs › /flyer).
//   node tools/flyer.mjs            les quatre        node tools/flyer.mjs mix
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';

const require = createRequire(import.meta.url);
const { qrSvg } = require('../src/qr.js');
const { chromium } = createRequire(new URL('../tests/', import.meta.url))('playwright-core');      // celui des tests (tests/node_modules)
export const FLYER_URL = 'https://manaorbit.app/flyer';      // imprimé : ne change jamais
const OUT = 'docs/print/', SHOTS = 'shots/store/fr-', which = process.argv[2] || 'all';
const VARIANTS = ['apercus', 'mix', 'orbite', 'solo'].filter(v => which === 'all' || which === v);

const b64 = f => readFileSync(f).toString('base64');
const font = (fam, f) => existsSync(f) ? `@font-face{font-family:'${fam}';font-weight:200 800;src:url(data:font/woff2;base64,${b64(f)}) format('woff2')}` : '';
const FACES = font('MO Display', 'tools/fonts/bricolage-grotesque-latin-opsz-normal.woff2') + font('MO Text', 'tools/fonts/instrument-sans-latin-wght-normal.woff2');
if (VARIANTS.some(v => v !== 'orbite') && ['01-scan', '02-accueil', '05-valeur', '09-classeur'].some(n => !existsSync(SHOTS + n + '.png'))) {
  console.log('Captures de l\'appli absentes : node tools/store-assets.mjs raw fr …');
  const r = spawnSync('node', ['tools/store-assets.mjs', 'raw', 'fr'], { stdio: 'inherit' }); if (r.status) process.exit(r.status);
}
const shot = n => `data:image/png;base64,${b64(SHOTS + n + '.png')}`;
const QR = qrSvg(FLYER_URL).svg;
const FOIL = ['#ff8fc3', '#ffd479', '#7be8c8', '#7fb0ff', '#c79bff'];
const foilStops = FOIL.map((c, i) => `<stop offset="${i / 4}" stop-color="${c}"/>`).join('');
const LOGO = `<svg viewBox="6 8 88 88" class="logo" aria-hidden="true"><defs><linearGradient id="lgF" x1="0" y1="0" x2="1" y2="1">${foilStops}</linearGradient></defs>
<g transform="rotate(-20 50 52)"><path d="M12 52A38 13 0 0 1 88 52" fill="none" stroke="#9aa3b8" stroke-width="2.6" stroke-linecap="round"/><circle cx="27.7" cy="41.5" r="3.6" fill="#ff7a5c"/><circle cx="72.3" cy="41.5" r="3.6" fill="#6fd08c"/></g>
<g transform="rotate(-11 51 50)"><rect x="37" y="27" width="28" height="41" rx="5" fill="url(#lgF)"/><rect x="39.6" y="29.6" width="22.8" height="35.8" rx="3.2" fill="none" stroke="#fff" stroke-opacity=".5" stroke-width="1.2"/></g>
<g transform="rotate(-20 50 52)"><path d="M12 52A38 13 0 0 0 88 52" fill="none" stroke="#9aa3b8" stroke-width="2.6" stroke-linecap="round"/><circle cx="86.1" cy="56" r="4.6" fill="#7fb0ff"/><circle cx="50" cy="65" r="4.6" fill="#f8f6d8"/><circle cx="13.9" cy="56" r="4.6" fill="#b5a3c8"/></g></svg>`;
const FINE = 'Mana Orbit est un contenu de fan non officiel autorisé par la Fan Content Policy, ni approuvé ni soutenu par Wizards of the Coast. Magic: The Gathering est une marque de Wizards of the Coast LLC. Éditeur : manaorbit.app/legal · Imprimeur : Vistaprint · Ne pas jeter sur la voie publique.';
// Cinq orbes = cinq parties de l'appli (couleurs de mana du logo)
const PARTS = [
  { c: '#f8f6d8', h: 'Scan', p: '11 langues, même le japonais' },
  { c: '#6fd08c', h: 'Cote', p: 'prix Cardmarket chaque jour' },
  { c: '#b5a3c8', h: 'Classeur', p: 'rangement et masterset' },
  { c: '#7fb0ff', h: 'Échange', p: 'ta liste en un QR code' },
  { c: '#ff7a5c', h: 'Commander', p: 'decks et compteur de vie' },
];

/* ── Dessin (mm, format fini 210 × 297) ─────────────────────────────────────────────────────────────────────────────── */
/** Orbite : ellipse inclinée. at(t) : point à l'angle t (0 à 180 : demi-orbite de devant) ; atX(x) : t de la demi-orbite de devant qui passe en x. */
const orbit = (cx, cy, rx, ry, deg) => {
  const th = deg * Math.PI / 180;
  const at = t => { const a = t * Math.PI / 180, ex = rx * Math.cos(a), ey = ry * Math.sin(a); return { x: cx + ex * Math.cos(th) - ey * Math.sin(th), y: cy + ex * Math.sin(th) + ey * Math.cos(th) }; };
  const atX = x => { let lo = 0, hi = 180; for (let i = 0; i < 40; i++) { const m = (lo + hi) / 2; if (at(m).x > x) lo = m; else hi = m; } return (lo + hi) / 2; };
  const arc = (front, w, op) => { const pts = []; for (let t = front ? 0 : 180; t <= (front ? 180 : 360); t += 2) pts.push(at(t)); return `<path d="M${pts.map(p => p.x.toFixed(2) + ' ' + p.y.toFixed(2)).join('L')}" fill="none" stroke="url(#rgF)" stroke-width="${w}" stroke-linecap="round" opacity="${op}"/>`; };
  return { at, atX, arc };
};
const orbSvg = (p, c, r = 3.6) => `<circle cx="${p.x}" cy="${p.y}" r="${r * 3.2}" fill="url(#gl${c.slice(1)})"/><circle cx="${p.x}" cy="${p.y}" r="${r}" fill="${c}" stroke="rgba(255,255,255,.4)" stroke-width=".3"/>`;
const DEFS = `<defs><linearGradient id="rgF" x1="0" y1="0" x2="1" y2="0">${foilStops}</linearGradient><linearGradient id="cdF" x1="0" y1="0" x2="1" y2="1">${foilStops}</linearGradient>
  <linearGradient id="sh" x1="0" y1="0" x2="1" y2=".55"><stop offset=".3" stop-color="#fff" stop-opacity="0"/><stop offset=".48" stop-color="#fff" stop-opacity=".42"/><stop offset=".62" stop-color="#fff" stop-opacity="0"/></linearGradient>
  <radialGradient id="halo"><stop offset="0" stop-color="#5b6ee6" stop-opacity=".4"/><stop offset="1" stop-color="#5b6ee6" stop-opacity="0"/></radialGradient>
  <filter id="bl" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="3.2"/></filter>
  ${PARTS.map(o => `<radialGradient id="gl${o.c.slice(1)}"><stop offset="0" stop-color="${o.c}" stop-opacity=".5"/><stop offset="1" stop-color="${o.c}" stop-opacity="0"/></radialGradient>`).join('')}</defs>`;
const svg = (body, cls = '') => `<svg class="art ${cls}" viewBox="0 0 210 297" aria-hidden="true">${DEFS}${body}</svg>`;
const lab = (o, x, y, a = 'center', up = false) => `<div class="lab ${a}" style="left:${x.toFixed(1)}mm;${up ? `bottom:${(297 - y).toFixed(1)}mm` : `top:${y.toFixed(1)}mm`}"><b>${o.h}</b><span>${o.p}</span></div>`;
const dev = (img, x, y, w, a) => `<div class="dev" style="left:${x}mm;top:${y}mm;transform:rotate(${a}deg)"><img src="${img}" style="width:${w}mm;height:${(w * 1584 / 984).toFixed(2)}mm"></div>`;
const stars = (keep) => { let s = 7, o = ''; const r = () => (s = (s * 16807) % 2147483647) / 2147483647;      // ciel fixe (même tirage à chaque rendu)
  for (let i = 0; i < 46; i++) { const x = r() * 216, y = r() * 303, z = (.18 + r() * .38).toFixed(2), op = (.25 + r() * .5).toFixed(2); if (keep(x, y)) o += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${z}" fill="#fff" opacity="${op}"/>`; }
  return `<svg class="sky" viewBox="0 0 216 303">${o}</svg>`; };

/** Aperçus : orbite foil derrière et devant trois téléphones, quatre points dessous. */
function apercus() {
  const O = orbit(105, 152, 112, 30, -9), p = [O.at(126), O.at(70), O.at(15)];
  const feat = (n, h, t) => `<div class="f"><i>${n}</i><b>${h}</b><span>${t}</span></div>`;
  return svg(`${O.arc(false, .8, .55)}${orbSvg(O.at(250), '#f8f6d8', 1.6)}${orbSvg(O.at(318), '#b5a3c8', 1.7)}`)
    + dev(shot('01-scan'), 13, 104, 54, -5) + dev(shot('09-classeur'), 139, 105, 54, 5) + dev(shot('02-accueil'), 74, 94, 58, 0)
    + svg(`${O.arc(true, 1.1, .95)}${orbSvg(p[0], '#ff7a5c', 2.3)}${orbSvg(p[1], '#7fb0ff', 2.6)}${orbSvg(p[2], '#6fd08c', 1.9)}`)
    + `<div class="feats">
    ${feat('01', 'Scan en 11 langues', 'Français, anglais, japonais, chinois… Lu sur le téléphone, carte après carte.')}
    ${feat('02', 'La cote, chaque jour', 'Ta collection au prix Cardmarket, sa courbe et les cartes qui montent.')}
    ${feat('03', 'Classeur et échanges', 'Ta liste d\'échange en un lien ou un QR code, à montrer à la table.')}
    ${feat('04', 'Commander', 'Les decks que tu peux déjà monter avec tes cartes, et le compteur de vie à 4.')}</div>`;
}
/** Mix : trois téléphones dans l'orbite ; les cinq orbes sur la demi-orbite de devant, au pied des téléphones, leur texte dessous. */
function mix() {
  const O = orbit(105, 147, 109, 53, -2), pts = [30, 67.5, 105, 142.5, 180].map(x => O.at(O.atX(x)));
  return svg(`<ellipse cx="105" cy="138" rx="96" ry="66" fill="url(#halo)"/>${O.arc(false, .8, .7)}`)
    + dev(shot('01-scan'), 21, 98, 45, -6) + dev(shot('09-classeur'), 141, 98, 45, 6) + dev(shot('02-accueil'), 76, 86, 54, 0)
    + svg(`${O.arc(true, 1.1, 1)}${PARTS.map((o, i) => orbSvg(pts[i], o.c)).join('')}`)
    + PARTS.map((o, i) => lab(o, pts[i].x - 18, pts[i].y + 6)).join('');
}
/** Orbite : sans capture, une carte foil au centre, les orbes tout autour. */
function orbite() {
  const O = orbit(105, 140, 97, 36, -14), cx = 105, cy = 140, W = 68, H = 94;
  const ts = [240, 150, 315, 60, 104];      // Scan, Cote, Classeur, Échange, Commander (0 à 180 : devant la carte)
  const card = `<g transform="rotate(-11 ${cx} ${cy})">
    <rect x="${cx - W / 2 + 1.2}" y="${cy - H / 2 + 3}" width="${W}" height="${H}" rx="4.6" fill="#000" opacity=".5" filter="url(#bl)"/>
    <rect x="${cx - W / 2}" y="${cy - H / 2}" width="${W}" height="${H}" rx="4.6" fill="url(#cdF)"/><rect x="${cx - W / 2}" y="${cy - H / 2}" width="${W}" height="${H}" rx="4.6" fill="url(#sh)"/>
    <rect x="${cx - W / 2 + 2.6}" y="${cy - H / 2 + 2.6}" width="${W - 5.2}" height="${H - 5.2}" rx="3" fill="none" stroke="#fff" stroke-opacity=".6" stroke-width=".5"/>
    <rect x="${cx - W / 2 + 5.5}" y="${cy - H / 2 + 6}" width="${W - 11}" height="5" rx="1.4" fill="#fff" fill-opacity=".3"/><rect x="${cx - W / 2 + 5.5}" y="${cy - H / 2 + 13.5}" width="${W - 11}" height="35" rx="1.6" fill="#fff" fill-opacity=".2"/>
    <rect x="${cx - W / 2 + 5.5}" y="${cy - H / 2 + 52}" width="${W - 11}" height="4.2" rx="1.2" fill="#fff" fill-opacity=".26"/>
    ${[0, 1, 2].map(i => `<rect x="${cx - W / 2 + 5.5}" y="${cy - H / 2 + 60 + i * 5}" width="${(W - 11) * [1, .86, .62][i]}" height="2" rx="1" fill="#fff" fill-opacity=".22"/>`).join('')}</g>`;
  const p = ts.map(t => O.at(t)), front = i => ts[i] < 180, ly = Math.max(p[4].y + 7, 201);
  return svg(`<ellipse cx="${cx}" cy="${cy}" rx="80" ry="72" fill="url(#halo)"/>${O.arc(false, .75, .7)}${PARTS.map((o, i) => front(i) ? '' : orbSvg(p[i], o.c, 3.8)).join('')}${card}
    ${O.arc(true, 1.05, 1)}${PARTS.map((o, i) => front(i) ? orbSvg(p[i], o.c, 3.8) : '').join('')}
    <path d="M${p[4].x} ${p[4].y + 5.2}V${ly - 1.4}" stroke="#eef1fb" stroke-opacity=".45" stroke-width=".25" stroke-dasharray=".8 .8"/>`)
    + lab(PARTS[0], 14, p[0].y - 5.5, 'left', true) + lab(PARTS[1], 14, p[1].y + 6, 'left') + lab(PARTS[2], p[2].x - 18, p[2].y - 6, 'center', true)
    + lab(PARTS[3], 196 - 36, p[3].y + 6, 'right') + lab(PARTS[4], p[4].x - 18, ly)
    + '<p class="sub low">Une seule appli pour <b>scanner, ranger, chiffrer et échanger</b> tes cartes, et jouer tes parties de Commander.</p>';
}
/** Solo : une question, une capture en grand dans l'orbite, la liste des cinq parties. */
function solo() {
  const O = orbit(150, 160, 68, 22, -16);
  const list = PARTS.map(o => `<li><i style="background:${o.c};box-shadow:0 0 3.2mm ${o.c}88"></i><b>${o.h}</b><span>${o.p}</span></li>`).join('');
  return svg(`<ellipse cx="150" cy="156" rx="64" ry="76" fill="url(#halo)"/>${O.arc(false, .8, .7)}${orbSvg(O.at(205), '#b5a3c8', 2.2)}${orbSvg(O.at(292), '#f8f6d8', 2)}`)
    + dev(shot('05-valeur'), 116, 92, 66, 4)
    + svg(`${O.arc(true, 1.1, 1)}${orbSvg(O.at(150), '#6fd08c', 2.8)}${orbSvg(O.at(58), '#7fb0ff', 2.4)}${orbSvg(O.at(95), '#ff7a5c', 2.2)}`)
    + `<ul class="list">${list}</ul>`;
}
const ART = { apercus, mix, orbite, solo };
const H1 = {
  apercus: 'Scanne tes cartes Magic.<br>Connais leur <em>vraie valeur.</em>',
  mix: 'Scanne tes cartes Magic.<br>Connais leur <em>vraie valeur.</em>',
  orbite: 'Ta collection Magic,<br><em>en orbite.</em>',
  solo: 'Combien vaut<br>ton <em>classeur</em>&nbsp;?',
};
const SUB = {
  apercus: 'L\'appli des joueurs et des collectionneurs : <b>pose une carte devant le téléphone, elle est ajoutée</b>, avec sa cote Cardmarket du jour. Sans compte, sans abonnement.',
  mix: 'L\'appli des joueurs et des collectionneurs : <b>pose une carte devant le téléphone, elle est ajoutée</b> avec sa cote du jour.',
  orbite: '',
  solo: 'Scanne tes cartes avec ton téléphone : <b>Mana Orbit te donne leur cote Cardmarket</b>, mise à jour chaque jour.',
};

function page(v) {
  const keep = { apercus: (x, y) => y < 92 || y > 286, mix: (x, y) => y < 84 || y > 286, orbite: (x, y) => y < 64 || (y > 226 && y < 246) || y > 286, solo: (x, y) => y < 30 || y > 286 }[v];
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><style>${FACES}
  @page{size:216mm 303mm;margin:0}
  *{box-sizing:border-box}
  html,body{margin:0;padding:0}
  body{width:216mm;height:303mm;-webkit-font-smoothing:antialiased;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  .pg{position:relative;width:216mm;height:303mm;overflow:hidden;background:#0b0f1c;color:#eef1fb;font-family:'MO Text',sans-serif}
  .bg{position:absolute;inset:0;background:radial-gradient(110mm 90mm at 18% 4%,rgba(58,78,170,.5),transparent 70%),radial-gradient(100mm 90mm at 100% 56%,rgba(224,83,61,.2),transparent 70%),radial-gradient(90mm 70mm at 0% 92%,rgba(63,168,120,.12),transparent 70%)}
  .sky{position:absolute;inset:0;width:100%;height:100%}
  .t{position:absolute;left:3mm;top:3mm;width:210mm;height:297mm}      /* format fini : tout en mm depuis le bord coupé */
  .art{position:absolute;inset:0;width:210mm;height:297mm}
  .dev{position:absolute;padding:1.5mm;border-radius:8mm;background:linear-gradient(180deg,#323a5e,#151b30 22%,#0f1426);box-shadow:0 0 0 .35mm rgba(255,255,255,.14),0 6mm 14mm rgba(0,0,0,.45)}
  .dev img{display:block;border-radius:6.6mm}
  .head{position:absolute;left:14mm;top:14mm;right:14mm;display:flex;align-items:center;gap:2.6mm}
  .head .logo{width:10.5mm;height:10.5mm}
  .head b{font-family:'MO Display';font-weight:700;font-size:17pt;letter-spacing:-.02em}
  .head small{margin-left:auto;padding:1.1mm 3mm;border:.3mm solid rgba(255,255,255,.28);border-radius:9mm;font-size:8.5pt;font-weight:650;letter-spacing:.08em;text-transform:uppercase;color:#c9d0e6}
  h1{position:absolute;left:14mm;top:31mm;margin:0;font-family:'MO Display';font-weight:780;font-size:${v === 'orbite' ? 44 : v === 'solo' ? 48 : 39}pt;line-height:1.01;letter-spacing:-.04em}
  h1 em{font-style:normal;background:linear-gradient(100deg,${FOIL.join(',')});-webkit-background-clip:text;background-clip:text;color:transparent}
  .sub{position:absolute;left:14mm;top:${v === 'solo' ? 73 : 63}mm;width:${v === 'solo' ? 94 : 168}mm;margin:0;font-size:12pt;line-height:1.42;color:#b9c0d8}
  .sub b{color:#eef1fb;font-weight:650}
  .sub.low{top:220mm;width:182mm}
  .lab{position:absolute;width:36mm;display:flex;flex-direction:column;gap:.5mm}.lab.left{text-align:left}.lab.right{text-align:right}.lab.center{text-align:center}
  .lab b{font-family:'MO Display';font-weight:720;font-size:12pt;letter-spacing:-.01em}
  .lab span{font-size:8.6pt;line-height:1.3;color:#b3bad2}
  .feats{position:absolute;left:14mm;top:203mm;width:182mm;display:grid;grid-template-columns:1fr 1fr;gap:4mm 9mm}
  .f{display:grid;grid-template-columns:9mm 1fr;column-gap:1mm;row-gap:.6mm}
  .f i{grid-row:span 2;font-style:normal;font-family:'MO Display';font-weight:700;font-size:10pt;color:#7be8c8;padding-top:.5mm}
  .f b{font-family:'MO Display';font-weight:700;font-size:12.5pt;letter-spacing:-.01em}
  .f span{font-size:10pt;line-height:1.38;color:#b9c0d8}
  .list{position:absolute;left:14mm;top:118mm;width:92mm;margin:0;padding:0;list-style:none;display:flex;flex-direction:column;gap:8.4mm}
  .list li{display:grid;grid-template-columns:8mm 1fr;align-items:center;row-gap:.6mm}
  .list i{grid-row:span 2;width:4.4mm;height:4.4mm;border-radius:50%;border:.3mm solid rgba(255,255,255,.4)}
  .list b{font-family:'MO Display';font-weight:720;font-size:15pt;letter-spacing:-.015em;line-height:1.1}
  .list span{font-size:11pt;line-height:1.3;color:#b3bad2}
  .cta{position:absolute;left:14mm;top:245mm;width:182mm;height:33mm;display:flex;align-items:center;gap:6mm;padding:0 7mm 0 2.5mm;border-radius:6mm;background:#fff;color:#10152b}
  .cta .qr{width:28mm;height:28mm;flex:none}
  .cta .qr svg{display:block;width:100%;height:100%}
  .cta .tx{flex:1;display:flex;flex-direction:column;gap:1.3mm}
  .cta .tx b{font-family:'MO Display';font-weight:780;font-size:17pt;letter-spacing:-.02em}
  .cta .tx span{font-size:10.5pt;line-height:1.38;color:#3d4766}
  .cta .tx span strong{color:#10152b;font-weight:650}
  .cta .free{flex:none;text-align:right;font-family:'MO Display';font-weight:780;font-size:24pt;letter-spacing:-.03em;line-height:1}
  .cta .free small{display:block;margin-top:1.3mm;font-family:'MO Text';font-weight:650;font-size:8.5pt;letter-spacing:.06em;text-transform:uppercase;color:#5a6484}
  .fine{position:absolute;left:14mm;top:283.5mm;width:182mm;margin:0;font-size:6.2pt;line-height:1.35;color:#737c99}
  </style></head><body><div class="pg"><div class="bg"></div>${stars(keep)}<div class="t">
  ${ART[v]()}
  <div class="head">${LOGO}<b>Mana Orbit</b><small>Android · iPhone · ordinateur</small></div>
  <h1>${H1[v]}</h1>
  ${SUB[v] ? `<p class="sub">${SUB[v]}</p>` : ''}
  <div class="cta"><div class="qr">${QR}</div><div class="tx"><b>Scanne pour l'installer</b><span>Avec l'appareil photo de ton téléphone.<br><strong>Android</strong> : Google Play · <strong>iPhone et ordinateur</strong> : manaorbit.app</span></div><div class="free">0 €<small>pour toujours</small></div></div>
  <p class="fine">${FINE}</p>
  </div></div></body></html>`;
}

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined), args: ['--no-sandbox'] });
mkdirSync(OUT, { recursive: true });
for (const v of VARIANTS) {
  const ctx = await browser.newContext({ viewport: { width: 817, height: 1146 }, deviceScaleFactor: 300 / 96 });      // 216 × 303 mm à 96 px/po ; PNG à 300 dpi
  const p = await ctx.newPage(); await p.setContent(page(v), { waitUntil: 'load' }); await p.evaluate(() => document.fonts.ready);
  const base = OUT + 'flyer-a4-' + v;
  await p.pdf({ path: base + '.pdf', width: '216mm', height: '303mm', printBackground: true, preferCSSPageSize: true });
  writeFileSync(base + '.png', await p.screenshot({ type: 'png', clip: { x: 0, y: 0, width: 216 / 25.4 * 96, height: 303 / 25.4 * 96 } }));
  console.log('  ' + base + '.pdf · .png');
  await ctx.close();
}
await browser.close();
