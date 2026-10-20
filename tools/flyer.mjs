// Flyers A4 pour les boutiques de jeu (à prendre ou à scanner) → docs/print/flyer-a4-<piste>.pdf et .png : PDF (texte, dessin et QR en vectoriel)
// et PNG 300 dpi, fond perdu de 3 mm (216 × 303 mm, coupe à 210 × 297), fond de nuit de l'appli.
// Piste retenue le 20 octobre : « Combien vaut ton classeur ? », une vraie capture (valeur de la collection) dans l'orbite foil du logo, les cinq
// parties de l'appli (une couleur de mana chacune). Six déclinaisons :
//   solo-a (liste à gauche, téléphone à droite) · solo-b (centrée, les cinq orbes en rangée) · solo-c (miroir) · solo-d (téléphone géant qui déborde)
//   solo-e (titre géant, parties en pastilles) · solo-f (une carte foil qui entre dans le téléphone, cadre du scan)
// Captures : shots/store/fr-*.png (faites ici par `node tools/store-assets.mjs raw fr` si elles manquent), cartes factices.
// QR : src/qr.js, lien FIXE https://manaorbit.app/flyer (imprimé : ne jamais le changer ; la destination se règle dans proxy.mjs › /flyer :
// Android → Google Play, iPhone → App Store dès que APP_STORE_URL est posée, sinon le site).
// Format : A5 par défaut (154 × 216 mm avec le fond perdu, coupe à 148 × 210) : la page A4 réduite (× 0,705), petits textes et QR agrandis pour rester
// lisibles et scannables (mentions ≥ 6 pt, QR ≈ 25 mm) ; « a4 » : l'affiche A4. Fichiers docs/print/flyer-<a5|a4>-<piste>.pdf et .png.
//   node tools/flyer.mjs            les six en A5        node tools/flyer.mjs solo-b        node tools/flyer.mjs a4 solo-d
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { MANA } from './fonts/mana-symbols.mjs';

const require = createRequire(import.meta.url);
const { qrSvg } = require('../src/qr.js');
const { chromium } = createRequire(new URL('../tests/', import.meta.url))('playwright-core');      // celui des tests (tests/node_modules)
export const FLYER_URL = 'https://manaorbit.app/flyer';      // imprimé : ne change jamais
const OUT = 'docs/print/', SHOTS = 'shots/store/fr-', ARGS = process.argv.slice(2);
const FMT = ARGS.includes('a4') ? 'a4' : 'a5', which = ARGS.find(a => a !== 'a4' && a !== 'a5') || 'all';
const S = FMT === 'a5' ? 148 / 210 : 1, PW = 210 * S + 6, PH = 297 * S + 6;      // échelle de la mise en page (tracée en A4, mm) ; page avec 3 mm de fond perdu

const b64 = f => readFileSync(f).toString('base64');
const font = (fam, f) => existsSync(f) ? `@font-face{font-family:'${fam}';font-weight:200 800;src:url(data:font/woff2;base64,${b64(f)}) format('woff2')}` : '';
const FACES = font('MO Display', 'tools/fonts/bricolage-grotesque-latin-opsz-normal.woff2') + font('MO Text', 'tools/fonts/instrument-sans-latin-wght-normal.woff2');
if (!existsSync(SHOTS + '05-valeur.png')) {
  console.log('Captures de l\'appli absentes : node tools/store-assets.mjs raw fr …');
  const r = spawnSync('node', ['tools/store-assets.mjs', 'raw', 'fr'], { stdio: 'inherit' }); if (r.status) process.exit(r.status);
}
const VALUE = `data:image/png;base64,${b64(SHOTS + '05-valeur.png')}`;
/** Illustration d'une vraie carte, si elle a été déposée dans tools/flyer-art/<nom>.jpg ou .png (recadrage « art crop » de Scryfall) ; sinon null (dégradé foil). */
const artOf = n => { for (const e of ['jpg', 'png']) { const f = `tools/flyer-art/${n}.${e}`; if (existsSync(f)) return `data:image/${e === 'jpg' ? 'jpeg' : 'png'};base64,${b64(f)}`; } return null; };
const QR = qrSvg(FLYER_URL).svg;
const FOIL = ['#ff8fc3', '#ffd479', '#7be8c8', '#7fb0ff', '#c79bff'];
const foilStops = FOIL.map((c, i) => `<stop offset="${i / 4}" stop-color="${c}"/>`).join('');
const LOGO = `<svg viewBox="6 8 88 88" class="logo" aria-hidden="true"><defs><linearGradient id="lgF" x1="0" y1="0" x2="1" y2="1">${foilStops}</linearGradient></defs>
<g transform="rotate(-20 50 52)"><path d="M12 52A38 13 0 0 1 88 52" fill="none" stroke="#9aa3b8" stroke-width="2.6" stroke-linecap="round"/><circle cx="27.7" cy="41.5" r="3.6" fill="#ff7a5c"/><circle cx="72.3" cy="41.5" r="3.6" fill="#6fd08c"/></g>
<g transform="rotate(-11 51 50)"><rect x="37" y="27" width="28" height="41" rx="5" fill="url(#lgF)"/><rect x="39.6" y="29.6" width="22.8" height="35.8" rx="3.2" fill="none" stroke="#fff" stroke-opacity=".5" stroke-width="1.2"/></g>
<g transform="rotate(-20 50 52)"><path d="M12 52A38 13 0 0 0 88 52" fill="none" stroke="#9aa3b8" stroke-width="2.6" stroke-linecap="round"/><circle cx="86.1" cy="56" r="4.6" fill="#7fb0ff"/><circle cx="50" cy="65" r="4.6" fill="#f8f6d8"/><circle cx="13.9" cy="56" r="4.6" fill="#b5a3c8"/></g></svg>`;
const FINE = 'Mana Orbit est un contenu de fan non officiel autorisé par la Fan Content Policy, ni approuvé ni soutenu par Wizards of the Coast. Magic: The Gathering est une marque de Wizards of the Coast LLC. Éditeur : manaorbit.app/legal · Imprimeur : Vistaprint · Ne pas jeter sur la voie publique.';
// A5 (dans les mm de la mise en page A4, réduits ensuite par S) : textes de lecture ≥ 8 pt une fois imprimés, mentions ≥ 6 pt, QR ≈ 25 mm
const A5_CSS = `.head b{font-size:19pt}.head small{font-size:10.5pt}
  .sub{font-size:13.5pt}.list b{font-size:16.5pt}.list span{font-size:12.5pt}.lab{width:40mm!important}.lab b{font-size:14pt}.lab span{font-size:10.6pt}.chips span{font-size:15.5pt!important}
  .cta{top:236mm!important;height:41mm!important;gap:5mm!important}.cta .qr{width:36mm!important;height:36mm!important}
  .cta .tx b{font-size:19pt}.cta .tx span{font-size:12pt}.cta .soon{font-size:8.6pt}.cta .free{font-size:27pt}.cta .free small{font-size:10pt}
  .fine{top:280.5mm!important;font-size:8.6pt!important;line-height:1.3!important}`;
// Les cinq parties de l'appli, dans l'ordre de la liste (Échange en deuxième : choix du 20 octobre), une couleur de mana du logo chacune
const PARTS = [
  { c: '#f8f6d8', m: 'W', h: 'Scan', p: '11 langues, même le japonais' },
  { c: '#7fb0ff', m: 'U', h: 'Échange', p: 'ta liste en un QR code' },
  { c: '#6fd08c', m: 'G', h: 'Cote', p: 'prix Cardmarket chaque jour' },
  { c: '#b5a3c8', m: 'B', h: 'Classeur', p: 'rangement et masterset' },
  { c: '#ff7a5c', m: 'R', h: 'Commander', p: 'decks et compteur de vie' },
];
// Symboles de mana (déclinaisons « -mana ») : couleurs de fond des symboles des cartes, symbole noir (tools/fonts/mana-symbols.mjs)
const MANA_BG = { W: '#fffbd5', U: '#aae0fa', B: '#cbc2bf', R: '#f9aa8f', G: '#9bd3ae', 1: '#cac5c0', 4: '#cac5c0' };      // 1, 4 : mana générique (gris)
// « Magic » écrit en toutes lettres (titre, pastille, texte) : jamais le logo ni un symbole de Wizards (Fan Content Policy), seulement le nom du jeu en texte
const H1 = 'Combien vaut<br>ton classeur <em>Magic</em>&nbsp;?';
const SUB = 'Scanne tes cartes Magic avec ton téléphone : <b>Mana Orbit te donne leur cote Cardmarket</b>, mise à jour chaque jour.';

/* ── Dessin (mm, format fini 210 × 297) ─────────────────────────────────────────────────────────────────────────────── */
/** Orbite : ellipse inclinée. at(t) : point à l'angle t (0 à 180 : demi-orbite de devant) ; atX(x) : t de la demi-orbite de devant qui passe en x. */
const orbit = (cx, cy, rx, ry, deg) => {
  const th = deg * Math.PI / 180;
  const at = t => { const a = t * Math.PI / 180, ex = rx * Math.cos(a), ey = ry * Math.sin(a); return { x: cx + ex * Math.cos(th) - ey * Math.sin(th), y: cy + ex * Math.sin(th) + ey * Math.cos(th) }; };
  const atX = x => { let lo = 0, hi = 180; for (let i = 0; i < 40; i++) { const m = (lo + hi) / 2; if (at(m).x > x) lo = m; else hi = m; } return (lo + hi) / 2; };
  const arc = (front, w, op) => { const pts = []; for (let t = front ? 0 : 180; t <= (front ? 180 : 360); t += 2) pts.push(at(t)); return `<path d="M${pts.map(p => p.x.toFixed(2) + ' ' + p.y.toFixed(2)).join('L')}" fill="none" stroke="url(#rgF)" stroke-width="${w}" stroke-linecap="round" opacity="${op}"/>`; };
  return { at, atX, arc };
};
/** Symbole de mana comme sur les cartes : ombre décalée, disque de couleur, symbole noir. */
const manaSym = (cx, cy, r, m) => `<circle cx="${cx - r * .12}" cy="${cy + r * .14}" r="${r}" fill="#000" opacity=".55"/><circle cx="${cx}" cy="${cy}" r="${r}" fill="${MANA_BG[m]}"/>`
  + `<path d="${MANA[m]}" fill="#0d0f0f" transform="translate(${cx - r * .7} ${cy - r * .7}) scale(${r * 1.4 / 32})"/>`;
const manaOrb = (p, o, r) => `<circle cx="${p.x}" cy="${p.y}" r="${r * 2.8}" fill="url(#gm${o.m})"/>` + manaSym(p.x, p.y, r, o.m);
const orb = (p, c, r = 2.4) => `<circle cx="${p.x}" cy="${p.y}" r="${r * 3.2}" fill="url(#gl${c.slice(1)})"/><circle cx="${p.x}" cy="${p.y}" r="${r}" fill="${c}" stroke="rgba(255,255,255,.4)" stroke-width=".3"/>`;
const DEFS = `<defs><linearGradient id="rgF" x1="0" y1="0" x2="1" y2="0">${foilStops}</linearGradient><linearGradient id="cdF" x1="0" y1="0" x2="1" y2="1">${foilStops}</linearGradient>
  <linearGradient id="sh" x1="0" y1="0" x2="1" y2=".55"><stop offset=".3" stop-color="#fff" stop-opacity="0"/><stop offset=".48" stop-color="#fff" stop-opacity=".42"/><stop offset=".62" stop-color="#fff" stop-opacity="0"/></linearGradient>
  <radialGradient id="halo"><stop offset="0" stop-color="#5b6ee6" stop-opacity=".4"/><stop offset="1" stop-color="#5b6ee6" stop-opacity="0"/></radialGradient>
  <filter id="bl" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="2.4"/></filter>
  ${PARTS.map(o => `<radialGradient id="gl${o.c.slice(1)}"><stop offset="0" stop-color="${o.c}" stop-opacity=".5"/><stop offset="1" stop-color="${o.c}" stop-opacity="0"/></radialGradient>`).join('')}
  ${PARTS.map(o => `<radialGradient id="gm${o.m}"><stop offset="0" stop-color="${MANA_BG[o.m]}" stop-opacity=".45"/><stop offset="1" stop-color="${MANA_BG[o.m]}" stop-opacity="0"/></radialGradient>`).join('')}</defs>`;
const svg = body => `<svg class="art" viewBox="0 0 210 297" aria-hidden="true">${DEFS}${body}</svg>`;
const phone = (x, y, w, a) => `<div class="dev" style="left:${x}mm;top:${y}mm;transform:rotate(${a}deg)"><img src="${VALUE}" style="width:${w}mm;height:${(w * 1584 / 984).toFixed(2)}mm"></div>`;
const halo = (cx, cy, rx, ry) => `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="url(#halo)"/>`;
/** Téléphone pris dans l'orbite : arc arrière et ses orbes derrière, arc avant et ses orbes devant. ts : angles des cinq orbes (ordre de PARTS). */
const orbited = (ph, O, ts, r = [2, 2.4, 2.8, 2.2, 2.2], mana = false) => {
  const front = i => ts[i] % 360 < 180, o = i => mana ? manaOrb(O.at(ts[i]), PARTS[i], r[i] * 1.9) : orb(O.at(ts[i]), PARTS[i].c, r[i]);
  return svg(O.arc(false, .8, .7) + PARTS.map((_, i) => front(i) ? '' : o(i)).join('')) + ph + svg(O.arc(true, 1.1, 1) + PARTS.map((_, i) => front(i) ? o(i) : '').join(''));
};
const list = (cls, mana = false) => `<ul class="list ${cls}">${PARTS.map(o => `<li>${mana ? `<i class="ms"><svg viewBox="0 0 10 10">${manaSym(5.3, 4.7, 4.3, o.m)}</svg></i>` : `<i style="background:${o.c};box-shadow:0 0 3.2mm ${o.c}88"></i>`}<b>${o.h}</b><span>${o.p}</span></li>`).join('')}</ul>`;
/** Silhouette de carte Magic (sans rien de Wizards : ni cadre, ni illustration, ni police réels) : nom et coût de mana, illustration, type, texte ; force et
 *  endurance seulement pour une créature (pt). Le nom d'une vraie carte s'écrit en texte, avec son vrai coût et son vrai type. */
const ghostCard = (cx, cy, w, a, cost, name, type, pt, art) => {
  const h = w * 88 / 63, x = cx - w / 2, y = cy - h / 2, m = w * .05, iw = w - 2 * m, line = 'rgba(214,221,240,';
  const pr = cost.length > 3 ? 2.05 : 2.6, pips = cost.map((c, i) => manaSym(x + w - m - 1.2 - pr - (cost.length - 1 - i) * pr * 2.3, y + m + 3.2, pr, c)).join('');      // coût long : symboles plus petits
  return `<g transform="rotate(${a} ${cx} ${cy})"><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${w * .045}" fill="#141b36" stroke="url(#rgF)" stroke-width=".6"/>
    <rect x="${x + m}" y="${y + m}" width="${iw}" height="6.4" rx="1.6" fill="${line}.08)" stroke="${line}.35)" stroke-width=".3"/><text x="${x + m + 2.2}" y="${y + m + 4.6}" font-family="MO Display" font-weight="700" font-size="3.7" letter-spacing="-.05" fill="#eef1fb" fill-opacity=".92">${name}</text>${pips}
    ${art ? `<clipPath id="ca"><rect x="${x + m + 1}" y="${y + m + 8}" width="${iw - 2}" height="${h * .4}" rx="1"/></clipPath><image href="${art}" x="${x + m + 1}" y="${y + m + 8}" width="${iw - 2}" height="${h * .4}" preserveAspectRatio="xMidYMid slice" clip-path="url(#ca)"/>`
      : `<rect x="${x + m + 1}" y="${y + m + 8}" width="${iw - 2}" height="${h * .4}" rx="1" fill="url(#cdF)" opacity=".35"/>`}
    <rect x="${x + m}" y="${y + m + 9.4 + h * .4}" width="${iw}" height="5.2" rx="1.4" fill="${line}.08)" stroke="${line}.35)" stroke-width=".3"/><text x="${x + m + 2.2}" y="${y + m + 13 + h * .4}" font-family="MO Text" font-weight="650" font-size="2.7" fill="#eef1fb" fill-opacity=".8">${type}</text>
    <rect x="${x + m + 1}" y="${y + m + 16.4 + h * .4}" width="${iw - 2}" height="${h * .27}" rx="1" fill="${line}.05)" stroke="${line}.22)" stroke-width=".3"/>
    ${pt ? `<rect x="${x + w - m - 11}" y="${y + h - m - 6.4}" width="11" height="6.4" rx="1.6" fill="#141b36" stroke="${line}.35)" stroke-width=".3"/><text x="${x + w - m - 5.5}" y="${y + h - m - 2.1}" text-anchor="middle" font-family="MO Display" font-weight="700" font-size="3.2" fill="#eef1fb">${pt}</text>` : ''}</g>`;
};
/** Carte foil (sans illustration réelle) : w × h mm, centre (cx, cy), inclinée de a degrés. */
const foilCard = (cx, cy, w, h, a) => `<g transform="rotate(${a} ${cx} ${cy})"><rect x="${cx - w / 2 + 1}" y="${cy - h / 2 + 2.4}" width="${w}" height="${h}" rx="${w * .07}" fill="#000" opacity=".55" filter="url(#bl)"/>
  <rect x="${cx - w / 2}" y="${cy - h / 2}" width="${w}" height="${h}" rx="${w * .07}" fill="url(#cdF)"/><rect x="${cx - w / 2}" y="${cy - h / 2}" width="${w}" height="${h}" rx="${w * .07}" fill="url(#sh)"/>
  <rect x="${cx - w / 2 + w * .04}" y="${cy - h / 2 + w * .04}" width="${w * .92}" height="${h - w * .08}" rx="${w * .045}" fill="none" stroke="#fff" stroke-opacity=".6" stroke-width=".4"/>
  <rect x="${cx - w / 2 + w * .09}" y="${cy - h / 2 + h * .07}" width="${w * .82}" height="${h * .055}" rx=".8" fill="#fff" fill-opacity=".32"/>
  <rect x="${cx - w / 2 + w * .09}" y="${cy - h / 2 + h * .15}" width="${w * .82}" height="${h * .37}" rx="1" fill="#fff" fill-opacity=".2"/>
  ${[0, 1, 2].map(i => `<rect x="${cx - w / 2 + w * .09}" y="${cy - h / 2 + h * (.62 + i * .07)}" width="${w * .82 * [1, .84, .6][i]}" height="${h * .025}" rx=".6" fill="#fff" fill-opacity=".24"/>`).join('')}</g>`;

/* ── Déclinaisons : chacune donne son dessin, son CSS propre, la taille du titre, la place du texte et où vont les étoiles ── */
const V = {
  'solo-a': () => ({      // liste à gauche, téléphone à droite (la piste retenue)
    art: svg(halo(150, 156, 64, 76)) + orbited(phone(116, 92, 66, 4), orbit(150, 160, 68, 22, -16), [292, 58, 150, 205, 95]) + list('l'),
    css: '.list.l{left:14mm;top:118mm;width:92mm}', h1: 48, sub: { top: 73, w: 94 }, sky: y => y < 30,
  }),
  'solo-a-mana': () => ({      // la A, orbes et puces en vrais symboles de mana
    art: svg(halo(150, 156, 64, 76)) + orbited(phone(116, 92, 66, 4), orbit(150, 160, 68, 22, -16), [315, 58, 140, 240, 95], [2.2, 2.3, 2.5, 2.2, 2.3], true) + list('l', true),
    css: '.list.l{left:14mm;top:118mm;width:92mm}.list i.ms{width:8.4mm;height:8.4mm;border:0;margin-left:-1mm}.list li{grid-template-columns:10.5mm 1fr!important}', h1: 48, sub: { top: 73, w: 94 }, sky: y => y < 30,
  }),
  'solo-a-bolt': () => ({      // la A en symboles de mana, et derrière le téléphone une carte « Lightning Bolt » ({R}, éphémère)
    art: svg(halo(150, 156, 64, 76) + ghostCard(160, 113, 64, 10, ['R'], 'Lightning Bolt', 'Éphémère', null, artOf('lightning-bolt'))) + orbited(phone(116, 92, 66, 4), orbit(150, 160, 68, 22, -16), [315, 58, 140, 240, 95], [2.2, 2.3, 2.5, 2.2, 2.3], true) + list('l', true),
    css: '.list.l{left:14mm;top:118mm;width:92mm}.list i.ms{width:8.4mm;height:8.4mm;border:0;margin-left:-1mm}.list li{grid-template-columns:10.5mm 1fr!important}', h1: 48, sub: { top: 73, w: 94 }, sky: y => y < 30,
  }),
  'solo-a-dragon': () => ({      // la A en symboles de mana, et derrière le téléphone « The Ur-Dragon » ({4}{W}{U}{B}{R}{G} : les cinq couleurs des orbes)
    art: svg(halo(150, 156, 64, 76) + ghostCard(160, 113, 64, 10, ['4', 'W', 'U', 'B', 'R', 'G'], 'The Ur-Dragon', 'Créature légendaire : dragon et avatar', '10/10', artOf('the-ur-dragon'))) + orbited(phone(116, 92, 66, 4), orbit(150, 160, 68, 22, -16), [315, 58, 140, 240, 95], [2.2, 2.3, 2.5, 2.2, 2.3], true) + list('l', true),
    css: '.list.l{left:14mm;top:118mm;width:92mm}.list i.ms{width:8.4mm;height:8.4mm;border:0;margin-left:-1mm}.list li{grid-template-columns:10.5mm 1fr!important}', h1: 48, sub: { top: 73, w: 94 }, sky: y => y < 30,
  }),
  'solo-b': () => {      // centrée : le téléphone au milieu, les cinq orbes en rangée sur l'orbite de devant, leur texte dessous
    const O = orbit(105, 158, 101, 44, 0), pts = [30, 67.5, 105, 142.5, 180].map(x => O.at(O.atX(x)));
    return {
      art: svg(halo(105, 146, 82, 74) + O.arc(false, .8, .7)) + phone(71, 84, 66, -3) + svg(O.arc(true, 1.1, 1) + PARTS.map((o, i) => orb(pts[i], o.c, 3.2)).join(''))
        + PARTS.map((o, i) => `<div class="lab" style="left:${pts[i].x.toFixed(1)}mm;top:${(pts[i].y + 6).toFixed(1)}mm"><b>${o.h}</b><span>${o.p}</span></div>`).join(''),
      css: 'h1,.sub{text-align:center;left:14mm!important;width:182mm!important}', h1: 46, sub: { top: 66, w: 182 }, sky: y => y < 28,
    };
  },
  'solo-c': () => ({      // miroir : le téléphone à gauche, la liste à droite
    art: svg(halo(52, 156, 62, 76)) + orbited(phone(14, 92, 66, -4), orbit(48, 160, 58, 20, 16), [250, 128, 40, 330, 88]) + list('r'),
    css: '.list.r{left:114mm;top:112mm;width:84mm}', h1: 48, sub: { top: 73, w: 170 }, sky: y => y < 30,
  }),
  'solo-d': () => ({      // téléphone géant qui déborde à droite, liste serrée à gauche
    art: svg(halo(160, 150, 70, 90)) + orbited(phone(108, 64, 98, 9), orbit(160, 150, 78, 28, -22), [300, 40, 95, 330, 122], [2.2, 2.8, 3, 2.4, 2.6]) + list('l s'),      // orbes côté téléphone : jamais sur la liste
    css: '.list.l{left:14mm;top:116mm;width:84mm}.list.s{gap:6.6mm}', h1: 40, sub: { top: 66, w: 84 }, sky: y => y < 28,
  }),
  'solo-e': () => ({      // titre géant sur trois lignes, parties en pastilles, téléphone en bas à droite
    art: svg(halo(154, 172, 66, 80)) + orbited(phone(112, 108, 76, 7), orbit(150, 176, 72, 22, -18), [290, 58, 162, 212, 104], [2.2, 2.8, 3, 2.4, 2.4])
      + `<div class="chips">${PARTS.map(o => `<span><i style="background:${o.c};box-shadow:0 0 2.4mm ${o.c}99"></i>${o.h}</span>`).join('')}</div>`,
    css: `h1{line-height:.94!important}
  .chips{position:absolute;left:14mm;top:150mm;width:90mm;display:flex;flex-direction:column;align-items:flex-start;gap:3.6mm}
  .chips span{display:inline-flex;align-items:center;gap:2mm;padding:2mm 3.6mm 2mm 2.6mm;border:.3mm solid rgba(255,255,255,.22);border-radius:10mm;background:rgba(255,255,255,.05);font-family:'MO Display';font-weight:700;font-size:14pt}
  .chips i{width:3.8mm;height:3.8mm;border-radius:50%}`, h1: 60, h1Text: 'Combien vaut<br>ton classeur<br><em>Magic</em>&nbsp;?', sub: { top: 113, w: 92 }, sky: y => y < 26,
  }),
  'solo-f': () => {      // une carte foil entre dans le téléphone : cadre du scan (coins), traînée jusqu'à l'écran
    const cx = 136, cy = 96, w = 32, h = 44.7, g = 2.6, k = 6;      // carte et coins du cadre de scan
    const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sy]) => { const x = cx + sx * (w / 2 + g), y = cy + sy * (h / 2 + g); return `<path d="M${x} ${y - sy * k}V${y}H${x - sx * k}" fill="none" stroke="#7be8c8" stroke-width=".8" stroke-linecap="round"/>`; }).join('');
    const scan = `<g transform="rotate(-12 ${cx} ${cy})">${corners}<rect x="${cx - w / 2 - g}" y="${cy - 1}" width="${w + 2 * g}" height="2" fill="#7be8c8" opacity=".55" filter="url(#bl)"/><rect x="${cx - w / 2 - g}" y="${cy - .2}" width="${w + 2 * g}" height=".4" fill="#c9fff0"/></g>`;
    return {
      art: svg(halo(156, 164, 64, 76)) + orbited(phone(124, 112, 62, 5), orbit(156, 176, 64, 20, -16), [292, 60, 150, 205, 95])
        + svg(`<path d="M140 122C146 130 150 138 152 146" fill="none" stroke="url(#rgF)" stroke-width=".9" stroke-dasharray="1.6 1.6" opacity=".8"/>${foilCard(cx, cy, w, h, -12)}${scan}`) + list('l'),
      css: '.list.l{left:14mm;top:122mm;width:92mm}', h1: 48, sub: { top: 73, w: 86 }, sky: y => y < 30,
    };
  },
};
const VARIANTS = Object.keys(V).filter(v => which === 'all' || which === v);

function page(v) {
  const d = V[v]();
  const stars = (() => { let s = 7, o = ''; const r = () => (s = (s * 16807) % 2147483647) / 2147483647;      // ciel fixe (même tirage à chaque rendu), jamais derrière le dessin ni les textes
    for (let i = 0; i < 46; i++) { const x = r() * 216, y = r() * 303, z = (.18 + r() * .38).toFixed(2), op = (.25 + r() * .5).toFixed(2); if (d.sky(y)) o += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${z}" fill="#fff" opacity="${op}"/>`; }
    return `<svg class="sky" viewBox="0 0 216 303">${o}</svg>`; })();
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><style>${FACES}
  @page{size:${PW}mm ${PH}mm;margin:0}
  *{box-sizing:border-box}
  html,body{margin:0;padding:0}
  body{width:${PW}mm;height:${PH}mm;-webkit-font-smoothing:antialiased;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  .pg{position:relative;width:${PW}mm;height:${PH}mm;overflow:hidden;background:#0b0f1c;color:#eef1fb;font-family:'MO Text',sans-serif}
  .sc{position:absolute;left:0;top:0;width:216mm;height:303mm;transform:scale(${PW / 216});transform-origin:0 0}      /* fond et étoiles, à la taille de la page */
  .bg{position:absolute;inset:0;background:radial-gradient(110mm 90mm at 18% 4%,rgba(58,78,170,.5),transparent 70%),radial-gradient(100mm 90mm at 100% 56%,rgba(224,83,61,.2),transparent 70%),radial-gradient(90mm 70mm at 0% 92%,rgba(63,168,120,.12),transparent 70%)}
  .sky{position:absolute;inset:0;width:100%;height:100%}
  .t{position:absolute;left:3mm;top:3mm;width:210mm;height:297mm;transform:scale(${S});transform-origin:0 0}      /* format fini, tracé en mm A4 depuis le bord coupé, réduit en A5 */
  .art{position:absolute;inset:0;width:210mm;height:297mm}
  .dev{position:absolute;padding:1.5mm;border-radius:8mm;background:linear-gradient(180deg,#323a5e,#151b30 22%,#0f1426);box-shadow:0 0 0 .35mm rgba(255,255,255,.14),0 6mm 14mm rgba(0,0,0,.45)}
  .dev img{display:block;border-radius:6.6mm}
  .head{position:absolute;left:14mm;top:14mm;right:14mm;display:flex;align-items:center;gap:2.6mm}
  .head .logo{width:10.5mm;height:10.5mm}
  .head b{font-family:'MO Display';font-weight:700;font-size:17pt;letter-spacing:-.02em}
  .head small{margin-left:auto;padding:1.1mm 3mm;border:.3mm solid rgba(255,255,255,.28);border-radius:9mm;font-size:8.5pt;font-weight:650;letter-spacing:.08em;text-transform:uppercase;color:#c9d0e6}
  h1{position:absolute;left:14mm;top:31mm;margin:0;font-family:'MO Display';font-weight:780;font-size:${d.h1}pt;line-height:1.01;letter-spacing:-.04em}
  h1 em{font-style:normal;background:linear-gradient(100deg,${FOIL.join(',')});-webkit-background-clip:text;background-clip:text;color:transparent}
  .sub{position:absolute;left:14mm;top:${d.sub.top}mm;width:${d.sub.w}mm;margin:0;font-size:12pt;line-height:1.42;color:#b9c0d8}
  .sub b{color:#eef1fb;font-weight:650}
  .list{position:absolute;margin:0;padding:0;list-style:none;display:flex;flex-direction:column;gap:8.4mm}
  .list li{display:grid;grid-template-columns:8mm 1fr;align-items:center;row-gap:.6mm}
  .list i{grid-row:span 2;width:4.4mm;height:4.4mm;border-radius:50%;border:.3mm solid rgba(255,255,255,.4)}
  .list b{font-family:'MO Display';font-weight:720;font-size:15pt;letter-spacing:-.015em;line-height:1.1}
  .list span{font-size:11pt;line-height:1.3;color:#b3bad2}
  .lab{position:absolute;width:36mm;transform:translateX(-50%);display:flex;flex-direction:column;gap:.5mm;text-align:center}      /* centré sur son orbe */
  .lab b{font-family:'MO Display';font-weight:720;font-size:12.5pt;letter-spacing:-.01em}
  .lab span{font-size:8.8pt;line-height:1.3;color:#b3bad2}
  .cta{position:absolute;left:14mm;top:245mm;width:182mm;height:33mm;display:flex;align-items:center;gap:6mm;padding:0 7mm 0 2.5mm;border-radius:6mm;background:#fff;color:#10152b}
  .cta .qr{width:28mm;height:28mm;flex:none}
  .cta .qr svg{display:block;width:100%;height:100%}
  .cta .tx{flex:1;display:flex;flex-direction:column;gap:1.3mm}
  .cta .tx b{font-family:'MO Display';font-weight:780;font-size:17pt;letter-spacing:-.02em}
  .cta .tx span{font-size:10.5pt;line-height:1.38;color:#3d4766}
  .cta .tx span strong{color:#10152b;font-weight:650}
  .cta .soon{display:inline-block;margin:0 .6mm;padding:.35mm 1.7mm;border-radius:2mm;background:#10152b;color:#fff;font-style:normal;font-size:7.4pt;font-weight:700;letter-spacing:.06em;text-transform:uppercase;vertical-align:.25mm}
  .cta .free{flex:none;text-align:right;font-family:'MO Display';font-weight:780;font-size:24pt;letter-spacing:-.03em;line-height:1}
  .cta .free small{display:block;margin-top:1.3mm;font-family:'MO Text';font-weight:650;font-size:8.5pt;letter-spacing:.06em;text-transform:uppercase;color:#5a6484}
  .fine{position:absolute;left:14mm;top:283.5mm;width:182mm;margin:0;font-size:6.2pt;line-height:1.35;color:#737c99}
  ${d.css}
  ${FMT === 'a5' ? A5_CSS : ''}
  </style></head><body><div class="pg"><div class="sc"><div class="bg"></div>${stars}</div><div class="t">
  ${d.art}
  <div class="head">${LOGO}<b>Mana Orbit</b><small>Pour Magic: The Gathering</small></div>
  <h1>${d.h1Text || H1}</h1>
  <p class="sub">${SUB}</p>
  <div class="cta"><div class="qr">${QR}</div><div class="tx"><b>Scanne pour l'installer</b><span><strong>Android</strong> : Google Play<br><strong>iPhone</strong> : App Store <em class="soon">à venir</em><br><strong>Ordinateur et iPhone</strong> : manaorbit.app</span></div><div class="free">0 €<small>pour toujours</small></div></div>
  <p class="fine">${FINE}</p>
  </div></div></body></html>`;
}

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined), args: ['--no-sandbox'] });
mkdirSync(OUT, { recursive: true });
for (const v of VARIANTS) {
  const px = mm => Math.ceil(mm / 25.4 * 96);
  const ctx = await browser.newContext({ viewport: { width: px(PW), height: px(PH) }, deviceScaleFactor: 300 / 96 });      // page à 96 px/po ; PNG à 300 dpi
  const p = await ctx.newPage(); await p.setContent(page(v), { waitUntil: 'load' }); await p.evaluate(() => document.fonts.ready);
  const base = OUT + 'flyer-' + FMT + '-' + v;
  await p.pdf({ path: base + '.pdf', width: PW + 'mm', height: PH + 'mm', printBackground: true, preferCSSPageSize: true });
  writeFileSync(base + '.png', await p.screenshot({ type: 'png', clip: { x: 0, y: 0, width: PW / 25.4 * 96, height: PH / 25.4 * 96 } }));
  console.log('  ' + base + '.pdf · .png');
  await ctx.close();
}
await browser.close();
