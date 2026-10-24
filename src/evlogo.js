/* ── evlogo.js : le logo de l'appli aux couleurs de chaque fête ──────────────────────────────────────────────────────────────────────────────
   EV_LOGO[pack] : contenu (éléments SVG, sans la balise <svg>) d'un symbole de même viewBox que #i-logo de body.html (« 6 8 88 88 ») :
   même composition (carte foil inclinée, orbite elliptique, cinq billes de mana W U B R G, trois devant la carte et deux derrière), habillée pour la fête.
   Le moteur d'événements (event.js) le met à la place de #i-logo pendant la fête : en-tête, écran de lancement, tout ce qui fait <use href="#i-logo">.
   · Identifiants (dégradés, découpes) préfixés evl-<pack>- : plusieurs logos de fête peuvent cohabiter dans la page.
   · currentColor : liseré des billes (couleur du texte, comme #i-logo) ; lisible sur fond clair et sombre.
   · Classes : evl-glow (halos : ignorés pour cadrer les icônes), evl-fine (détails fins : retirés du favicon de 32 px), evl-o (orbite : épaissie en petit).
   · Une seule source : tools/make-event-logos.mjs lit ce fichier (createRequire) pour les icônes PNG, le favicon, l'icône Android et les images Discord. */

/** Halo de brillance d'une bille (dégradé partagé par pack). */
const evlGl = p => `<radialGradient id="evl-${p}-gl" cx=".34" cy=".3" r=".8"><stop offset="0" stop-color="#fff" stop-opacity=".85"/><stop offset=".34" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".24"/></radialGradient>`;
/** Bille de mana brillante (liseré currentColor comme #i-logo). */
const evlB = (p, x, y, r, c) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${c}" stroke="currentColor" stroke-opacity=".3" stroke-width=".8"/><circle cx="${x}" cy="${y}" r="${r}" fill="url(#evl-${p}-gl)"/>`;
/** Orbite : moitié arrière (derrière la carte) ou avant ; o : attributs du trait. */
const evlArc = (front, o) => `<path class="evl-o" d="M12 52A38 13 0 0 ${front ? 0 : 1} 88 52" fill="none" stroke-linecap="round" stroke-width="2.6" ${o}/>`;
/** Carte foil (repère de #i-logo : x 37–65, y 27–68, inclinée de −11°) : sous (derrière la carte), face (sur la carte, sous le cadre), sur (par-dessus). */
const evlCard = (p, { under = '', face = '', over = '', frame = '#fff', fo = '.5' } = {}) => `<g transform="rotate(-11 51 50)">${under}<rect x="37" y="27" width="28" height="41" rx="5" fill="url(#evl-${p}-foil)" stroke="currentColor" stroke-opacity=".12" stroke-width=".6"/>${face}<rect x="39.6" y="29.6" width="22.8" height="35.8" rx="3.2" fill="none" stroke="${frame}" stroke-opacity="${fo}" stroke-width="1.2"/>${over}</g>`;
const evlN = v => +v.toFixed(2);
/** Étoile scintillante à quatre branches (concave). */
const evlSpark = (x, y, s, c, cls = 'evl-fine') => `<path class="${cls}" fill="${c}" d="M${x} ${evlN(y - s)}Q${x} ${y} ${evlN(x + s)} ${y}Q${x} ${y} ${x} ${evlN(y + s)}Q${x} ${y} ${evlN(x - s)} ${y}Q${x} ${y} ${x} ${evlN(y - s)}Z"/>`;
/** Flocon à six branches (traits). */
function evlFlake(x, y, r, c, w = .7) {
  let d = '';
  for (let k = 0; k < 6; k++) {
    const a = k * Math.PI / 3, ux = Math.sin(a), uy = -Math.cos(a), px = -uy, py = ux, m = r * .5, b = r * .28;
    d += `M${x} ${y}L${evlN(x + ux * r)} ${evlN(y + uy * r)}M${evlN(x + ux * (m + b) + px * b)} ${evlN(y + uy * (m + b) + py * b)}L${evlN(x + ux * m)} ${evlN(y + uy * m)}L${evlN(x + ux * (m + b) - px * b)} ${evlN(y + uy * (m + b) - py * b)}`;
  }
  return `<path d="${d}" fill="none" stroke="${c}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;
}
/** Feu d'artifice : n rayons (longs et courts en alternance) et perles au bout des longs. */
function evlBurst(x, y, r, n, c1, c2) {
  let l = '', s = '', dots = '';
  for (let k = 0; k < n; k++) {
    const a = k * 2 * Math.PI / n + .2, ux = Math.cos(a), uy = Math.sin(a), long = k % 2 === 0, r1 = r * (long ? .34 : .42), r2 = r * (long ? .86 : .62);
    const seg = `M${evlN(x + ux * r1)} ${evlN(y + uy * r1)}L${evlN(x + ux * r2)} ${evlN(y + uy * r2)}`;
    if (long) { l += seg; dots += `<circle cx="${evlN(x + ux * r)}" cy="${evlN(y + uy * r)}" r="${evlN(r * .075)}"/>`; } else s += seg;
  }
  return `<g stroke-linecap="round" fill="none"><path d="${l}" stroke="${c1}" stroke-width="${evlN(r * .1)}"/><path d="${s}" stroke="${c2}" stroke-width="${evlN(r * .075)}"/></g><g fill="${c1}">${dots}</g>`;
}

/** Boule de Noël (repère de l'orbite, inclinée de −20° : attache redressée). */
const evlBauble = (x, y, r, c) => `${evlB('noel', x, y, r, c)}<g transform="rotate(20 ${x} ${y})"><circle cx="${x}" cy="${evlN(y - r - 1.6)}" r=".8" fill="none" stroke="#d9a12b" stroke-width=".5"/><rect x="${evlN(x - 1.35)}" y="${evlN(y - r - 1.15)}" width="2.7" height="1.7" rx=".45" fill="url(#evl-noel-gold)"/></g>`;
/** Œuf (centre 0 0, 9 × 12) et ses décors : 1 zigzag, 2 vagues, 3 pois. */
const EVL_EGG = 'M0-6C2.9-6 4.5-1.6 4.5 1.3C4.5 4.2 2.5 6 0 6C-2.5 6-4.5 4.2-4.5 1.3C-4.5-1.6-2.9-6 0-6Z';
const EVL_EGG_DECO = {
  1: c => `<path d="M-5 .9l1.25-1.7 1.25 1.7 1.25-1.7 1.25 1.7 1.25-1.7 1.25 1.7 1.25-1.7 1.25 1.7" fill="none" stroke="${c}" stroke-width="1.1" stroke-linejoin="round"/><path d="M-5-2.4h10M-5 3.4h10" stroke="${c}" stroke-width=".6"/>`,
  2: c => `<path d="M-5-1.6q1.25-1.3 2.5 0t2.5 0 2.5 0 2.5 0M-5 2.2q1.25-1.3 2.5 0t2.5 0 2.5 0 2.5 0" fill="none" stroke="${c}" stroke-width="1"/>`,
  3: c => `<g fill="${c}"><circle cx="-2.1" cy="-2" r=".8"/><circle cx="1.5" cy="-3" r=".7"/><circle cx="2.4" cy=".4" r=".85"/><circle cx="-.8" cy="1" r=".75"/><circle cx="-2.7" cy="3.1" r=".7"/><circle cx="1.2" cy="3.7" r=".8"/></g>`,
};
/** Œuf de Pâques à la place d'une bille (redressé dans le repère de l'orbite) : s échelle, c couleur, c2 décor. */
const evlEgg = (x, y, s, c, c2, deco) => `<g transform="rotate(20 ${x} ${y}) translate(${x} ${y}) scale(${s})"><path d="${EVL_EGG}" fill="${c}" stroke="currentColor" stroke-opacity=".3" stroke-width="${evlN(.8 / s)}"/><g clip-path="url(#evl-paques-ec)">${EVL_EGG_DECO[deco](c2)}</g><path d="${EVL_EGG}" fill="url(#evl-paques-eg)"/></g>`;
/** Petite fleur à cinq pétales. */
function evlFlower(x, y, r, c) {
  let s = '';
  for (let k = 0; k < 5; k++) { const a = k * 2 * Math.PI / 5 - Math.PI / 2; s += `<circle cx="${evlN(x + Math.cos(a) * r * .62)}" cy="${evlN(y + Math.sin(a) * r * .62)}" r="${evlN(r * .48)}"/>`; }
  return `<g fill="${c}">${s}</g><circle cx="${x}" cy="${y}" r="${evlN(r * .36)}" fill="${c === '#ffd36b' ? '#fff' : '#ffd36b'}"/>`;
}
/** Confettis aux cinq couleurs (rubans, pastilles, serpentins), autour de la carte. */
const EVL_CONFETTI = [[16, 22, 3, 30, '#ff7a5c'], [27, 13, 2.6, -25, '#7fb0ff'], [70, 12.6, 2.8, 40, '#6fd08c'], [86, 28, 3, -35, '#f2c230'], [91, 39, 2.4, 15, '#b48cff'], [11, 37, 2.4, -50, '#6fd08c'],
  [22, 79, 3, 20, '#f2c230'], [38, 88, 2.6, -30, '#ff7a5c'], [62, 87, 2.8, 35, '#7fb0ff'], [79, 80, 3, -20, '#b48cff'], [90, 70, 2.4, 50, '#ff7a5c'], [12, 64, 2.2, -15, '#7fb0ff']]
  .map(([x, y, w, a, c]) => `<rect x="${evlN(x - w / 2)}" y="${evlN(y - w / 4.4)}" width="${w}" height="${evlN(w / 2.2)}" rx=".3" fill="${c}" transform="rotate(${a} ${x} ${y})"/>`).join('')
  + [[20, 31, .9, '#7fb0ff'], [77, 19, .8, '#ff7a5c'], [52, 92, .9, '#6fd08c'], [73, 93, .8, '#f2c230'], [9, 52, .8, '#f2c230'], [30, 70, .7, '#b48cff']].map(([x, y, r, c]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${c}"/>`).join('')
  + '<g fill="none" stroke-width=".8" stroke-linecap="round"><path d="M12 77c1.5-1.8 3-.2 4.5-1.6s3-.2 4.5-1.6" stroke="#7fb0ff"/><path d="M75 15c1.4 1.4 2.8-.4 4.2 1s2.8-.4 4.2 1" stroke="#ff7a5c"/><path d="M82 90c1.2-1.6 2.6-.2 3.8-1.6" stroke="#6fd08c"/></g>';

/** Roue des cinq couleurs (W U B R G sur un cercle) sur la face de la carte dorée de l'anniversaire. */
const EVL_PIE = (() => {
  const c = ['#fbf6dc', '#5a9cff', '#7d6aa8', '#ff6a4a', '#43b86e'], pt = k => [evlN(51 + 6.4 * Math.sin(k * 2 * Math.PI / 5)), evlN(47 - 6.4 * Math.cos(k * 2 * Math.PI / 5))];
  return `<g class="evl-fine"><circle cx="51" cy="47" r="6.4" fill="none" stroke="#fff" stroke-opacity=".5" stroke-width=".7"/>${c.map((col, k) => `<circle cx="${pt(k)[0]}" cy="${pt(k)[1]}" r="1.9" fill="${col}" stroke="#fff" stroke-opacity=".85" stroke-width=".5"/>`).join('')}</g>`;
})();

const EV_LOGO = {
  /* Halloween : carte foil citrouille → violet nuit, chapeau de sorcière, orbite vert poison, la bille blanche devient une citrouille lumineuse,
     chauve-souris devant la lune. */
  halloween: `<defs>${evlGl('halloween')}
    <linearGradient id="evl-halloween-foil" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffc35c"/><stop offset=".27" stop-color="#ff7a1a"/><stop offset=".55" stop-color="#e2438a"/><stop offset=".8" stop-color="#8a45f0"/><stop offset="1" stop-color="#4a249c"/></linearGradient>
    <radialGradient id="evl-halloween-aura"><stop offset="0" stop-color="#7ddc4a" stop-opacity=".42"/><stop offset=".55" stop-color="#7ddc4a" stop-opacity=".12"/><stop offset="1" stop-color="#7ddc4a" stop-opacity="0"/></radialGradient>
    <radialGradient id="evl-halloween-moon" cx=".4" cy=".36" r=".7"><stop offset="0" stop-color="#fffbe2"/><stop offset=".6" stop-color="#ffe38a"/><stop offset="1" stop-color="#f3ae35"/></radialGradient>
    <radialGradient id="evl-halloween-mglow"><stop offset=".42" stop-color="#ffd76a" stop-opacity=".5"/><stop offset="1" stop-color="#ffd76a" stop-opacity="0"/></radialGradient>
    <radialGradient id="evl-halloween-pk" cx=".38" cy=".3" r=".85"><stop offset="0" stop-color="#ffd27a"/><stop offset=".48" stop-color="#ff8a1f"/><stop offset="1" stop-color="#c2410c"/></radialGradient>
    <radialGradient id="evl-halloween-pglow"><stop offset=".25" stop-color="#ffa53a" stop-opacity=".7"/><stop offset="1" stop-color="#ff7a1a" stop-opacity="0"/></radialGradient>
    <linearGradient id="evl-halloween-hat" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#8552f0"/><stop offset=".55" stop-color="#3e1d8a"/><stop offset="1" stop-color="#24104f"/></linearGradient>
    <linearGradient id="evl-halloween-ring" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#5cc23a"/><stop offset=".5" stop-color="#b6f07a"/><stop offset="1" stop-color="#5cc23a"/></linearGradient>
    <clipPath id="evl-halloween-hc"><path d="M42.4 26.8C44.6 21 46.6 16.4 49.6 12.6C51.8 9.8 55.2 8.4 59.4 9.8C56.2 10.6 54.4 12.6 53.8 15.6C53.2 19 55.6 23 59.8 26.8Z"/></clipPath></defs>
    <circle class="evl-glow" cx="51" cy="52" r="36" fill="url(#evl-halloween-aura)"/>
    <circle class="evl-glow" cx="80" cy="23" r="14" fill="url(#evl-halloween-mglow)"/>
    <g class="evl-fine"><circle cx="80" cy="23" r="8.2" fill="url(#evl-halloween-moon)"/>
    <g fill="#e39a2c" fill-opacity=".32"><circle cx="77" cy="20.6" r="1.7"/><circle cx="83" cy="26.2" r="1.2"/><circle cx="83.4" cy="19.8" r=".8"/></g>
    <path fill="#1d1033" transform="translate(80.6 24.4) rotate(-10) scale(.8)" d="M0-2.2L.7-3.6L1.2-1.9C2.6-3.6 5.2-4.6 8.2-3.6C7.1-2.8 6.7-1.5 6.9-.3C5.9-1.2 4.6-1.1 4 .3C3.2-.6 2-.4 1.3.8C1 1.8.5 2.4 0 2.9C-.5 2.4-1 1.8-1.3.8C-2-.4-3.2-.6-4 .3C-4.6-1.1-5.9-1.2-6.9-.3C-6.7-1.5-7.1-2.8-8.2-3.6C-5.2-4.6-2.6-3.6-1.2-1.9L-.7-3.6Z"/></g>
    <g transform="rotate(-20 50 52)">${evlArc(false, 'stroke="#7ddc4a" stroke-opacity=".6"')}${evlB('halloween', 27.7, 41.5, 3.6, '#ff7a5c')}${evlB('halloween', 72.3, 41.5, 3.6, '#6fd08c')}</g>
    ${evlCard('halloween', { face: `<g class="evl-fine" fill="none" stroke="#fff" stroke-opacity=".5" stroke-width=".45" stroke-linecap="round"><path d="M62.2 30.6L62.2 40.4M62.2 30.6L57.4 38.6M62.2 30.6L53.8 35.2M62.2 30.6L52.6 30.6"/><path d="M62.2 34.2Q61 33.6 60.2 34.6Q59 33.5 58.6 32.6Q58 31.6 58.4 30.6M62.2 37.6Q60.6 36.8 59.4 38Q57.8 36.4 56.4 35Q54.9 32.8 55.4 30.6"/></g>`, over: `
      <ellipse cx="51" cy="27.4" rx="15.6" ry="3.4" fill="#2a1260" stroke="#b48cff" stroke-opacity=".85" stroke-width=".7"/>
      <path d="M42.4 26.8C44.6 21 46.6 16.4 49.6 12.6C51.8 9.8 55.2 8.4 59.4 9.8C56.2 10.6 54.4 12.6 53.8 15.6C53.2 19 55.6 23 59.8 26.8Z" fill="url(#evl-halloween-hat)" stroke="#b48cff" stroke-opacity=".8" stroke-width=".6"/>
      <g clip-path="url(#evl-halloween-hc)"><rect x="40" y="22.2" width="22" height="3.2" fill="#ff7a1a"/></g>
      <rect x="49.4" y="21.7" width="4.2" height="4.2" rx=".7" fill="none" stroke="#9dff5c" stroke-width="1"/>` })}
    <g transform="rotate(-20 50 52)">
      <path class="evl-fine" d="M12 52A38 13 0 0 0 88 52" fill="none" stroke="#b6ff7a" stroke-opacity=".16" stroke-width="5.6" stroke-linecap="round"/>
      ${evlArc(true, 'stroke="url(#evl-halloween-ring)"')}
      ${evlB('halloween', 86.1, 56, 4.6, '#7fb0ff')}${evlB('halloween', 13.9, 56, 4.6, '#a58cd6')}
      <g transform="rotate(20 50 65.4)">
        <circle class="evl-glow" cx="50" cy="65.4" r="11" fill="url(#evl-halloween-pglow)"/>
        <ellipse cx="50" cy="65.8" rx="6.4" ry="5.2" fill="url(#evl-halloween-pk)" stroke="currentColor" stroke-opacity=".28" stroke-width=".7"/>
        <path d="M47.5 61.1Q45.3 65.8 47.5 70.6M52.5 61.1Q54.7 65.8 52.5 70.6" fill="none" stroke="#b5400b" stroke-opacity=".65" stroke-width=".6"/>
        <path d="M49.3 61Q49.4 58.7 51.4 57.7L52.1 58.6Q50.7 59.3 50.7 61.2Z" fill="#4f8a2a"/>
        <path d="M46.6 64.9L48.5 62.9L49.1 65.3ZM53.4 64.9L51.5 62.9L50.9 65.3ZM46.4 66.7Q50 70.4 53.6 66.7L52.6 67L52 67.9L51.3 67.3L50 68.2L48.7 67.3L48 67.9L47.4 67Z" fill="#fff1a6"/>
      </g>
    </g>`,

  /* Noël : carte foil émeraude et reflet doré, bonnet du père Noël, guirlande dorée, billes en boules de Noël, flocons. */
  noel: `<defs>${evlGl('noel')}
    <linearGradient id="evl-noel-foil" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#9af2c0"/><stop offset=".3" stop-color="#2fbf71"/><stop offset=".52" stop-color="#f6e39a"/><stop offset=".72" stop-color="#1f8a4c"/><stop offset="1" stop-color="#0d5434"/></linearGradient>
    <linearGradient id="evl-noel-hat" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ff6b6b"/><stop offset=".55" stop-color="#e23b3b"/><stop offset="1" stop-color="#a5162a"/></linearGradient>
    <linearGradient id="evl-noel-fur" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#dfe7f2"/></linearGradient>
    <linearGradient id="evl-noel-gold" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#d9a12b"/><stop offset=".5" stop-color="#ffe17a"/><stop offset="1" stop-color="#d9a12b"/></linearGradient>
    <radialGradient id="evl-noel-aura"><stop offset="0" stop-color="#ffd76a" stop-opacity=".32"/><stop offset="1" stop-color="#ffd76a" stop-opacity="0"/></radialGradient></defs>
    <circle class="evl-glow" cx="51" cy="50" r="36" fill="url(#evl-noel-aura)"/>
    <g class="evl-fine">${evlFlake(17, 27, 4, '#a9d4ff')}${evlFlake(88, 27, 3, '#a9d4ff', .6)}${evlFlake(84, 78, 2.6, '#a9d4ff', .55)}${evlFlake(20, 82, 2.2, '#a9d4ff', .5)}</g>
    <g transform="rotate(-20 50 52)">${evlArc(false, 'stroke="url(#evl-noel-gold)" stroke-opacity=".7"')}${evlBauble(27.7, 41.5, 3.6, '#ff5a5a')}${evlBauble(72.3, 41.5, 3.6, '#4fd27f')}</g>
    ${evlCard('noel', { frame: '#ffe17a', fo: '.85', face: `<g class="evl-fine" opacity=".6">${evlFlake(51, 48, 7.5, '#fff', .9)}</g>`, over: `
      <path d="M38.6 25.6C39.6 17.6 45 11.6 52 11.1C58.6 10.6 64 13.8 67.4 19.8C63.6 17.4 59.8 17.6 57.8 19.8C59.8 21.6 62 23.6 63.6 25.6Z" fill="url(#evl-noel-hat)"/>
      <path class="evl-fine" d="M44 16.5C47 13.6 50.4 12.5 53.6 12.5" fill="none" stroke="#fff" stroke-opacity=".35" stroke-width=".9" stroke-linecap="round"/>
      <rect x="35.6" y="23.2" width="30.8" height="6.2" rx="3.1" fill="url(#evl-noel-fur)" stroke="currentColor" stroke-opacity=".14" stroke-width=".5"/>
      <circle cx="67.6" cy="20.6" r="3.2" fill="url(#evl-noel-fur)" stroke="currentColor" stroke-opacity=".14" stroke-width=".5"/>` })}
    <g transform="rotate(-20 50 52)">${evlArc(true, 'stroke="url(#evl-noel-gold)"')}${evlBauble(86.1, 56, 4.6, '#5aa2ff')}${evlBauble(50, 65, 4.6, '#fbf7e4')}${evlBauble(13.9, 56, 4.6, '#a58cd6')}</g>`,

  /* Nouvel an : carte foil or → bleu nuit avec l'horloge à minuit, orbite dorée, feux d'artifice or et rose, étincelles. */
  nouvelan: `<defs>${evlGl('nouvelan')}
    <linearGradient id="evl-nouvelan-foil" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff1b8"/><stop offset=".16" stop-color="#f2c230"/><stop offset=".34" stop-color="#9c8cff"/><stop offset=".5" stop-color="#4a48e6"/><stop offset=".64" stop-color="#a99cff"/><stop offset=".8" stop-color="#2c2eb0"/><stop offset="1" stop-color="#ff7ab8"/></linearGradient>
    <linearGradient id="evl-nouvelan-gold" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#d9a12b"/><stop offset=".5" stop-color="#ffe17a"/><stop offset="1" stop-color="#d9a12b"/></linearGradient>
    <radialGradient id="evl-nouvelan-aura"><stop offset="0" stop-color="#9c8cff" stop-opacity=".45"/><stop offset="1" stop-color="#7c6cff" stop-opacity="0"/></radialGradient>
    <radialGradient id="evl-nouvelan-fx"><stop offset="0" stop-color="#ffd76a" stop-opacity=".55"/><stop offset="1" stop-color="#ffd76a" stop-opacity="0"/></radialGradient></defs>
    <circle class="evl-glow" cx="51" cy="50" r="36" fill="url(#evl-nouvelan-aura)"/>
    <circle class="evl-glow" cx="22" cy="23" r="9" fill="url(#evl-nouvelan-fx)"/>
    <g class="evl-fine">${evlBurst(22, 23, 12, 16, '#ffd76a', '#fff3c4')}</g>${evlSpark(22, 23, 3.2, '#fff6d6', 'evl-sp')}
    <g class="evl-fine">${evlBurst(82, 19, 8.5, 12, '#ff5fa2', '#ffc2dc')}</g>
    ${evlSpark(84, 19, 5.2, '#ffc2dc', 'evl-sp')}${evlSpark(12, 42, 2.6, '#ffd76a')}${evlSpark(91, 64, 2.2, '#ff8fc3')}${evlSpark(30, 86, 2, '#ffd76a')}${evlSpark(74, 84, 1.6, '#c8c2ff')}
    <g transform="rotate(-20 50 52)">${evlArc(false, 'stroke="url(#evl-nouvelan-gold)" stroke-opacity=".65"')}${evlB('nouvelan', 27.7, 41.5, 3.6, '#ff7a5c')}${evlB('nouvelan', 72.3, 41.5, 3.6, '#6fd08c')}</g>
    ${evlCard('nouvelan', { frame: '#ffe17a', fo: '.85', face: `<g class="evl-fine" fill="none" stroke="#fff" stroke-linecap="round"><circle cx="51" cy="47.5" r="7.2" stroke-opacity=".6" stroke-width=".9"/><path d="M51 41.4v1.3M57.1 47.5h-1.3M51 53.6v-1.3M44.9 47.5h1.3" stroke-opacity=".7" stroke-width=".8"/><path d="M51 47.5L51 41.9M51 47.5L49.9 43.9" stroke-opacity=".95" stroke-width=".95"/><circle cx="51" cy="47.5" r=".7" fill="#fff" stroke="none"/></g>` })}
    <g transform="rotate(-20 50 52)">${evlArc(true, 'stroke="url(#evl-nouvelan-gold)"')}${evlB('nouvelan', 86.1, 56, 4.6, '#7fb0ff')}${evlB('nouvelan', 50, 65, 4.6, '#f8f6d8')}${evlB('nouvelan', 13.9, 56, 4.6, '#b5a3c8')}</g>`,

  /* Pâques : carte foil pastel, oreilles de lapin derrière la carte, billes en œufs décorés, petites fleurs. */
  paques: `<defs>
    <linearGradient id="evl-paques-foil" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffa8cf"/><stop offset=".28" stop-color="#ffd98a"/><stop offset=".52" stop-color="#9ce8bd"/><stop offset=".76" stop-color="#93c6ff"/><stop offset="1" stop-color="#c9aaff"/></linearGradient>
    <linearGradient id="evl-paques-ear" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#efe6f6"/></linearGradient>
    <radialGradient id="evl-paques-eg" cx=".36" cy=".3" r=".85"><stop offset="0" stop-color="#fff" stop-opacity=".75"/><stop offset=".4" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#5a3d6e" stop-opacity=".22"/></radialGradient>
    <radialGradient id="evl-paques-aura"><stop offset="0" stop-color="#ffb3d1" stop-opacity=".38"/><stop offset="1" stop-color="#ffb3d1" stop-opacity="0"/></radialGradient>
    <clipPath id="evl-paques-ec"><path d="${EVL_EGG}"/></clipPath></defs>
    <circle class="evl-glow" cx="51" cy="50" r="36" fill="url(#evl-paques-aura)"/>
    <g class="evl-fine">${evlFlower(17, 29, 2.6, '#ffb3d1')}${evlFlower(87, 26, 2.2, '#ffd36b')}${evlFlower(86, 80, 1.8, '#b3d8ff')}</g>
    <g transform="rotate(-20 50 52)">${evlArc(false, 'stroke="#c9b3e6"')}${evlEgg(27.7, 41.5, .74, '#ff8f80', '#ffe1dc', 1)}${evlEgg(72.3, 41.5, .74, '#6fd796', '#e3fbe9', 2)}</g>
    ${evlCard('paques', { fo: '.75', face: `<g class="evl-fine"><g fill="#fff" fill-opacity=".55">${[0, 45, 90, 135, 180, 225, 270, 315].map(a => `<ellipse cx="51" cy="43.4" rx="1.5" ry="3.2" transform="rotate(${a} 51 47.6)"/>`).join('')}</g><circle cx="51" cy="47.6" r="1.9" fill="#ffd36b"/></g>`, under: `
      <g stroke="currentColor" stroke-opacity=".16" stroke-width=".6"><ellipse cx="44.6" cy="17.5" rx="3.9" ry="10.5" transform="rotate(-14 44.6 17.5)" fill="url(#evl-paques-ear)"/><ellipse cx="57.6" cy="17" rx="3.9" ry="10.5" transform="rotate(16 57.6 17)" fill="url(#evl-paques-ear)"/></g>
      <ellipse cx="44.6" cy="18.2" rx="1.8" ry="7.6" transform="rotate(-14 44.6 18.2)" fill="#ffb3d1"/><ellipse cx="57.6" cy="17.7" rx="1.8" ry="7.6" transform="rotate(16 57.6 17.7)" fill="#ffb3d1"/>` })}
    <g transform="rotate(-20 50 52)">${evlArc(true, 'stroke="#c9b3e6"')}${evlEgg(86.1, 56, .96, '#78b4ff', '#e4f0ff', 3)}${evlEgg(50, 65, .96, '#ffd75e', '#fff8dc', 1)}${evlEgg(13.9, 56, .96, '#a98ef0', '#efe8ff', 2)}</g>`,

  /* Anniversaire de Magic (5 août) : carte foil dorée, bougie aux rayures des cinq couleurs, orbite dorée, confettis aux cinq couleurs. */
  magic: `<defs>${evlGl('magic')}
    <linearGradient id="evl-magic-foil" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff8d6"/><stop offset=".24" stop-color="#f6c83a"/><stop offset=".46" stop-color="#c47f22"/><stop offset=".62" stop-color="#fff0b0"/><stop offset=".8" stop-color="#e9a93a"/><stop offset="1" stop-color="#b8741c"/></linearGradient>
    <linearGradient id="evl-magic-gold" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#d9a12b"/><stop offset=".5" stop-color="#ffe17a"/><stop offset="1" stop-color="#d9a12b"/></linearGradient>
    <radialGradient id="evl-magic-flame" cx=".5" cy=".7" r=".7"><stop offset="0" stop-color="#fffbe0"/><stop offset=".45" stop-color="#ffd23a"/><stop offset="1" stop-color="#ff7a1a"/></radialGradient>
    <radialGradient id="evl-magic-fglow"><stop offset=".2" stop-color="#ffd76a" stop-opacity=".7"/><stop offset="1" stop-color="#ffd76a" stop-opacity="0"/></radialGradient>
    <radialGradient id="evl-magic-aura"><stop offset="0" stop-color="#ffd76a" stop-opacity=".3"/><stop offset="1" stop-color="#ffd76a" stop-opacity="0"/></radialGradient>
    <clipPath id="evl-magic-cc"><rect x="48.2" y="15.2" width="5.6" height="12.6" rx="1.1"/></clipPath></defs>
    <circle class="evl-glow" cx="51" cy="50" r="36" fill="url(#evl-magic-aura)"/>
    <g class="evl-fine">${EVL_CONFETTI}</g>
    <g transform="rotate(-20 50 52)">${evlArc(false, 'stroke="url(#evl-magic-gold)" stroke-opacity=".7"')}${evlB('magic', 27.7, 41.5, 3.6, '#ff7a5c')}${evlB('magic', 72.3, 41.5, 3.6, '#6fd08c')}</g>
    ${evlCard('magic', { fo: '.6', face: EVL_PIE, over: `
      <circle class="evl-glow" cx="51" cy="10.6" r="8" fill="url(#evl-magic-fglow)"/>
      <rect x="48.2" y="15.2" width="5.6" height="12.6" rx="1.1" fill="#fffaf0" stroke="currentColor" stroke-opacity=".18" stroke-width=".5"/>
      <g clip-path="url(#evl-magic-cc)" stroke-width="1.3"><path d="M47 19.4l8-2.6" stroke="#f2c230"/><path d="M47 21.8l8-2.6" stroke="#5a9cff"/><path d="M47 24.2l8-2.6" stroke="#8a74b8"/><path d="M47 26.6l8-2.6" stroke="#ff6a4a"/><path d="M47 29l8-2.6" stroke="#4fc27a"/></g>
      <path d="M51 15.2V13.2" stroke="#5a4632" stroke-width=".6" stroke-linecap="round"/>
      <path d="M51 6.8C52.9 9 53.6 10.5 53.6 11.7A2.6 2.6 0 0 1 48.4 11.7C48.4 10.5 49.1 9 51 6.8Z" fill="url(#evl-magic-flame)"/>` })}
    <g transform="rotate(-20 50 52)">${evlArc(true, 'stroke="url(#evl-magic-gold)"')}${evlB('magic', 86.1, 56, 4.6, '#7fb0ff')}${evlB('magic', 50, 65, 4.6, '#f8f6d8')}${evlB('magic', 13.9, 56, 4.6, '#b5a3c8')}</g>`,
};

if (typeof module !== 'undefined' && module.exports) module.exports = { EV_LOGO };
