/* ── evart.js : dessins des événements saisonniers (objets à trouver, compteur, ambiance) ──────────────────────────────────────────────────
   EV_ART : SVG en couleur, chaînes prêtes à poser (aria-hidden : le libellé est sur le bouton du moteur). Un appel = un dessin, avec ses propres
   identifiants de dégradés (compteur EVO_N) : plusieurs citrouilles peuvent être dans la page en même temps.
   · pumpkin(o) : citrouille sculptée, bougie allumée. Parties animées par css/ev-halloween.css : .evo-glow (halo derrière), .evo-flame (lumière
     intérieure qui vacille), .evo-face (yeux, nez, bouche), .evo-body (côtes), .evo-stem (tige, vrille, feuille), .evo-rays (rayons, version allumée).
     o.lit : version « allumée » de la célébration (bougie plus vive, halo plus large, rayons) ; o.cls : classes en plus sur le <svg>.
     Lisible à 26–30 px (silhouette, visage contrasté), détaillée à 160 px (côtes en dégradés, reflets, tige torsadée, vrille, feuille, paroi sculptée).
   · bat() : chauve-souris (messages, ambiance) ; ailes dans .evo-wings (battement : scaleY autour du corps). Couleur : currentColor.
   · moon() : pleine lune d'automne (cratères, halo). · counter() : icône du compteur « 12 / 30 », dessinée pour 16–24 px (aplats, sans dégradé).
   EV_AMB[pack]() : balisage de l'ambiance, posé une fois par le moteur dans <div class="ev-amb" aria-hidden="true"> (enfant de <body>, après #app) ;
   styles et animations dans css/ev-<pack>.css (transform / opacity seulement, 12 éléments animés au plus). Données pures : aucun accès au DOM ici. */
let EVO_N = 0;
const evoF = n => Math.round(n * 100) / 100;
/** Côte de citrouille : goutte arrondie, un peu plus large sous le milieu (cx centre, w demi-largeur, top / bot : haut et bas). */
function evoLobe(cx, w, top, bot) {
  const h = bot - top, f = evoF, p = (x, y) => f(x) + ' ' + f(y);
  return `M${p(cx, top)}C${p(cx + w * .62, top - .6)} ${p(cx + w, top + h * .18)} ${p(cx + w, top + h * .54)}C${p(cx + w, top + h * .88)} ${p(cx + w * .58, bot)} ${p(cx, bot)}`
    + `C${p(cx - w * .58, bot)} ${p(cx - w, top + h * .88)} ${p(cx - w, top + h * .54)}C${p(cx - w, top + h * .18)} ${p(cx - w * .62, top - .6)} ${p(cx, top)}Z`;
}
/** Reflet d'une côte : trait courbe sur son flanc gauche (la lumière vient d'en haut à gauche). */
function evoShine(cx, w, top, bot, k = 1) {
  const h = bot - top, f = evoF;
  return `M${f(cx - w * .5 * k)} ${f(top + h * .2)}Q${f(cx - w * .8 * k)} ${f(top + h * .48)} ${f(cx - w * .52 * k)} ${f(top + h * .78)}`;
}
/* côtes, de l'arrière vers l'avant : [cx, demi-largeur, haut, bas, dégradé (d : flancs plus sombres, b : devant)] */
const EVO_LOBES = [[16.5, 12, 25, 56.4, 'd'], [47.5, 12, 25, 56.4, 'd'], [23.6, 12.4, 22.6, 58, 'b'], [40.4, 12.4, 22.6, 58, 'b'], [32, 11.6, 21.4, 58.9, 'b']];
/* visage sculpté (un seul tracé) : yeux en triangle, nez, sourire à deux dents en haut et une en bas */
const EVO_FACE = 'M20.7 37.5Q23.4 33.2 26 30.3Q27.6 33.6 28.5 37Q24.6 36.6 20.7 37.5Z'
  + 'M43.3 37.5Q40.6 33.2 38 30.3Q36.4 33.6 35.5 37Q39.4 36.6 43.3 37.5Z'
  + 'M30.3 41.7L32 38.7L33.7 41.7Q32 41.3 30.3 41.7Z'
  + 'M17.8 42.6Q20.5 45.2 24.4 46.1L24.9 48.8L28.1 49.2L28.3 46.9Q32 47.4 35.7 46.9L35.9 49.2L39.1 48.8L39.6 46.1Q43.5 45.2 46.2 42.6'
  + 'Q44.8 50.4 38.4 52.8Q36.2 53.6 33.9 53.8L33.6 50.1L30.4 50.1L30.1 53.8Q27.8 53.6 25.6 52.8Q19.2 50.4 17.8 42.6Z';

const EV_ART = {
  /** Citrouille sculptée, bougie allumée (viewBox 64 × 64). */
  pumpkin: (o = {}) => {
    const n = ++EVO_N, id = s => `evo${n}${s}`, lit = !!o.lit;
    const body = EVO_LOBES.map(([cx, w, t, b, g]) => `<path d="${evoLobe(cx, w, t, b)}" fill="url(#${id(g)})"/>`).join('');
    const shine = EVO_LOBES.slice(2).map(([cx, w, t, b], i) => `<path d="${evoShine(cx, w, t, b)}" stroke-width="${i === 2 ? 1.5 : 1.1}" opacity="${i === 2 ? .5 : .32}"/>`).join('');
    const rays = lit ? `<g class="evo-rays" fill="url(#${id('r')})">${[0, 45, 90, 135, 180, 225, 270, 315].map(a => `<path d="M32 40L29.6 6Q32 4.4 34.4 6Z" transform="rotate(${a + 22.5} 32 40)"/>`).join('')}</g>` : '';
    return `<svg class="evo evo-pumpkin${lit ? ' evo-lit' : ''}${o.cls ? ' ' + o.cls : ''}" viewBox="0 0 64 64" aria-hidden="true" focusable="false"><defs>`
      + `<radialGradient id="${id('g')}" cx="32" cy="40" r="31" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#ffc35a" stop-opacity="${lit ? .9 : .62}"/><stop offset=".42" stop-color="#ff8a1f" stop-opacity="${lit ? .42 : .26}"/><stop offset="1" stop-color="#ff7a1a" stop-opacity="0"/></radialGradient>`
      + (lit ? `<linearGradient id="${id('r')}" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#fff2b0" stop-opacity=".9"/><stop offset="1" stop-color="#ffb347" stop-opacity="0"/></linearGradient>` : '')
      + `<radialGradient id="${id('b')}" cx=".4" cy=".34" r=".72" fx=".34" fy=".26"><stop offset="0" stop-color="${lit ? '#ffd27e' : '#ffbe5c'}"/><stop offset=".42" stop-color="#ff8a1f"/><stop offset=".8" stop-color="#e65a0b"/><stop offset="1" stop-color="#b03e08"/></radialGradient>`
      + `<radialGradient id="${id('d')}" cx=".42" cy=".34" r=".74" fx=".36" fy=".28"><stop offset="0" stop-color="#f7a043"/><stop offset=".48" stop-color="#e2650f"/><stop offset=".84" stop-color="#b4460a"/><stop offset="1" stop-color="#7f2b05"/></radialGradient>`
      + `<radialGradient id="${id('f')}" cx="32" cy="41" r="18" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#fffbe2"/><stop offset=".42" stop-color="#ffe680"/><stop offset=".78" stop-color="#ffb12e"/><stop offset="1" stop-color="#ff8a1f"/></radialGradient>`
      + `<radialGradient id="${id('k')}" cx="32" cy="42" r="15" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#fffef6"/><stop offset=".55" stop-color="#fff3b4" stop-opacity=".85"/><stop offset="1" stop-color="#ffe07a" stop-opacity="0"/></radialGradient>`
      + `<radialGradient id="${id('w')}" cx="32" cy="44" r="20" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#ffd76a" stop-opacity="${lit ? .5 : .32}"/><stop offset="1" stop-color="#ff9a2e" stop-opacity="0"/></radialGradient>`
      + `<linearGradient id="${id('s')}" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#4c7a1b"/><stop offset=".34" stop-color="#9ccf4c"/><stop offset=".68" stop-color="#5f9325"/><stop offset="1" stop-color="#2f4e10"/></linearGradient>`
      + `<linearGradient id="${id('l')}" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="#3f7f1d"/><stop offset=".55" stop-color="#7cc443"/><stop offset="1" stop-color="#a6e06a"/></linearGradient>`
      + `<radialGradient id="${id('h')}"><stop offset="0" stop-color="#1a0f2e" stop-opacity=".3"/><stop offset="1" stop-color="#1a0f2e" stop-opacity="0"/></radialGradient>`
      + `<path id="${id('x')}" d="${EVO_FACE}"/><clipPath id="${id('c')}"><use href="#${id('x')}"/></clipPath></defs>`
      + `<circle class="evo-glow" cx="32" cy="40" r="31" fill="url(#${id('g')})"/>${rays}`
      + `<ellipse class="evo-shadow" cx="32" cy="59.4" rx="22" ry="3" fill="url(#${id('h')})"/>`
      + `<g class="evo-body" stroke="#8a3205" stroke-width=".55" stroke-opacity=".55">${body}</g>`
      + `<g class="evo-shine" fill="none" stroke="#fff6e4" stroke-linecap="round">${shine}</g>`
      + `<ellipse cx="32" cy="23.4" rx="8.6" ry="2.6" fill="#7a2a04" opacity=".42"/>`
      + `<g class="evo-face"><use href="#${id('x')}" fill="#7a2b06" stroke="#5a1d03" stroke-width=".9" stroke-linejoin="round"/>`
      + `<g clip-path="url(#${id('c')})"><use href="#${id('x')}" transform="translate(0 .85)" fill="url(#${id('f')})"/></g></g>`
      + `<g class="evo-flame"><ellipse cx="32" cy="44" rx="20" ry="15" fill="url(#${id('w')})"/><g clip-path="url(#${id('c')})"><use href="#${id('x')}" transform="translate(0 .85)" fill="url(#${id('k')})"/></g></g>`
      + `<g class="evo-stem">`
      + `<path d="M29 22.6C24.5 21.4 20.6 20.6 19.4 17.4C18.5 15 20.4 13.4 22.1 14.2C23.6 14.9 23.2 16.9 21.8 16.8" fill="none" stroke="#4f8a22" stroke-width="1.15" stroke-linecap="round"/>`
      + `<path d="M28.4 23.4C28.9 19.6 29.6 16.2 31.2 13.4C32 12 32.8 10.9 34.2 10.4L38.2 11.6C37.2 12.6 36.2 13.8 35.7 15.6C35 18.2 35.2 20.8 35.9 23.4Q32.2 24.6 28.4 23.4Z" fill="url(#${id('s')})" stroke="#2f4e10" stroke-width=".6" stroke-linejoin="round"/>`
      + `<path d="M30.4 22.9C30.6 19.2 31.4 16.1 33.2 13.2M32.8 23.4C32.6 19.8 33.4 16.3 35.6 12.5" fill="none" stroke="#33550f" stroke-width=".7" stroke-linecap="round" opacity=".75"/>`
      + `<path d="M29.6 21C29.8 18 30.6 15.6 31.8 13.8" fill="none" stroke="#d2eb94" stroke-width=".6" stroke-linecap="round" opacity=".75"/>`
      + `<ellipse cx="36.2" cy="11" rx="2.1" ry="1" transform="rotate(18 36.2 11)" fill="#c9dc8c" stroke="#3d5e14" stroke-width=".45"/>`
      + `<path d="M35.8 21.6C37.4 17.4 41.6 14.4 47.6 14.6C46.4 18.8 42.2 22.2 35.8 21.6Z" fill="url(#${id('l')})" stroke="#2f5a10" stroke-width=".5" stroke-linejoin="round"/>`
      + `<path d="M36.8 21.1C40 19.4 43.2 17.4 46.4 15.3M40.2 19.3L40.4 16.9M43 17.6L43.8 15.7M41.6 18.5L43.4 19.2" fill="none" stroke="#2f5a10" stroke-width=".5" stroke-linecap="round" opacity=".8"/>`
      + `</g></svg>`;
  },
  /** Chauve-souris de face (viewBox 48 × 24), couleur du texte (currentColor), yeux orangés ; ailes dans .evo-wings (battement). */
  bat: (o = {}) => `<svg class="evo evo-bat${o.cls ? ' ' + o.cls : ''}" viewBox="0 0 48 24" aria-hidden="true" focusable="false" fill="currentColor">`
    + `<g class="evo-wings"><path d="M22.4 10.4C19.2 6.6 14.2 4.4 8.6 4.9C5.9 5.2 3 6.8 .8 9.5C3.3 9 5.3 9.6 6.1 11.3C7.7 9.8 10 9.8 11.2 11.5C12.8 10.1 15.4 10.3 16.8 12.4C18.6 11.3 20.6 11.9 22.2 13.6Z"/>`
    + `<path d="M25.6 10.4C28.8 6.6 33.8 4.4 39.4 4.9C42.1 5.2 45 6.8 47.2 9.5C44.7 9 42.7 9.6 41.9 11.3C40.3 9.8 38 9.8 36.8 11.5C35.2 10.1 32.6 10.3 31.2 12.4C29.4 11.3 27.4 11.9 25.8 13.6Z"/></g>`
    + `<ellipse cx="24" cy="13" rx="2.9" ry="4.6"/><circle cx="24" cy="8.6" r="2.5"/><path d="M22.1 7.6L22.2 4.4L23.7 6.7ZM25.9 7.6L25.8 4.4L24.3 6.7Z"/>`
    + `<g class="evo-eyes" fill="#ffb547"><circle cx="23.1" cy="8.5" r=".6"/><circle cx="24.9" cy="8.5" r=".6"/></g></svg>`,
  /** Pleine lune d'automne (viewBox 64 × 64) : disque nacré, cratères, halo. */
  moon: (o = {}) => {
    const n = ++EVO_N, id = s => `evo${n}${s}`;
    return `<svg class="evo evo-moon${o.cls ? ' ' + o.cls : ''}" viewBox="0 0 64 64" aria-hidden="true" focusable="false"><defs>`
      + `<radialGradient id="${id('h')}"><stop offset=".45" stop-color="#ffe9b0" stop-opacity=".55"/><stop offset="1" stop-color="#ffd27a" stop-opacity="0"/></radialGradient>`
      + `<radialGradient id="${id('m')}" cx=".38" cy=".34" r=".75"><stop offset="0" stop-color="#fffdf2"/><stop offset=".55" stop-color="#fbeec2"/><stop offset="1" stop-color="#e8c77a"/></radialGradient></defs>`
      + `<circle class="evo-glow" cx="32" cy="32" r="31" fill="url(#${id('h')})"/><circle cx="32" cy="32" r="17" fill="url(#${id('m')})"/>`
      + `<g fill="#d9b468" opacity=".42"><circle cx="26.5" cy="27.5" r="3.6"/><circle cx="37.2" cy="36.4" r="4.4"/><circle cx="35.4" cy="24.6" r="1.8"/><circle cx="25.4" cy="38.2" r="2.2"/><circle cx="41.2" cy="28.4" r="1.4"/></g>`
      + `<path d="M19.6 26.4A13.6 13.6 0 0 1 30.4 17.2" fill="none" stroke="#fff" stroke-width="1.2" stroke-linecap="round" opacity=".55"/></svg>`;
  },
  /** Icône du compteur « 🎃 12 / 30 » (viewBox 24 × 24) : aplats nets à 16–24 px. */
  counter: (o = {}) => `<svg class="evo evo-counter${o.cls ? ' ' + o.cls : ''}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">`
    + `<g stroke="#9c3a07" stroke-width=".7"><ellipse cx="7.9" cy="14.6" rx="6" ry="7.2" fill="#e2650f"/><ellipse cx="16.1" cy="14.6" rx="6" ry="7.2" fill="#e2650f"/><ellipse cx="12" cy="14.6" rx="5.4" ry="7.9" fill="#ff8a1f"/></g>`
    + `<path d="M7 11.4Q6.1 13.6 7 16.4" fill="none" stroke="#ffd29a" stroke-width=".9" stroke-linecap="round" opacity=".8"/>`
    + `<path d="M11 7.4C11 5.4 11.7 4 13.3 3.2L14.8 4.1C13.5 4.9 13 6 13.2 7.4Z" fill="#5e9a26" stroke="#2f5a10" stroke-width=".5"/>`
    + `<path d="M13.4 6.6C14.4 4.8 16.4 4 18.6 4.3C17.9 6.1 15.9 7.2 13.4 6.6Z" fill="#7cc443" stroke="#2f5a10" stroke-width=".45"/>`
    + `<g fill="#ffe680" stroke="#5a1b02" stroke-width=".45" stroke-linejoin="round"><path d="M7.4 13.6L9.9 10.9L10.6 13.4Z"/><path d="M16.6 13.6L14.1 10.9L13.4 13.4Z"/>`
    + `<path d="M6.8 15.6Q12 19.6 17.2 15.6Q16.4 19.8 12 20.2Q7.6 19.8 6.8 15.6Z"/></g></svg>`,
};

/* ── Ambiance ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
   Halloween : teinte et lueurs (orange citrouille, violet nuit, vert poison), deux nappes de brume qui dérivent, pleine lune, toiles d'araignée dans
   deux coins, quatre chauves-souris qui traversent de loin en loin. Éléments animés : 2 lueurs + 2 brumes + 4 vols + 4 battements d'ailes = 12. */
/** Toile d'araignée dans un coin (viewBox 100 × 100, coin en haut à gauche) : 7 fils rayonnants, 5 tours qui pendent entre les fils. */
function evaWeb() {
  const f = evoF, A = [0, 14, 29, 45, 61, 76, 90].map(a => a * Math.PI / 180), R = [18, 34, 52, 72, 94];
  let d = A.map(a => `M0 0L${f(Math.cos(a) * 112)} ${f(Math.sin(a) * 112)}`).join('');
  for (const r of R) {
    for (let i = 0; i < A.length - 1; i++) {
      const a = A[i], b = A[i + 1], m = (a + b) / 2, s = r * .86;      // le fil pend vers le coin entre deux rayons
      d += `M${f(Math.cos(a) * r)} ${f(Math.sin(a) * r)}Q${f(Math.cos(m) * s)} ${f(Math.sin(m) * s)} ${f(Math.cos(b) * r)} ${f(Math.sin(b) * r)}`;
    }
  }
  return `<svg class="eva-web-s" viewBox="0 0 100 100" aria-hidden="true" focusable="false"><path d="${d}" fill="none" stroke="currentColor" stroke-width=".7" stroke-linecap="round"/>`
    + `<path d="M58 0V27" stroke="currentColor" stroke-width=".5"/><g class="eva-spider" fill="currentColor"><ellipse cx="58" cy="30" rx="2.3" ry="2.8"/><circle cx="58" cy="26.6" r="1.5"/>`
    + `<path d="M56 29L52 26.5M56 30.4L51.6 30.6M56.2 31.6L52.6 34.6M60 29L64 26.5M60 30.4L64.4 30.6M59.8 31.6L63.4 34.6" stroke="currentColor" stroke-width=".55" fill="none" stroke-linecap="round"/></g></svg>`;
}
const EV_AMB = {
  halloween: () => '<i class="eva-glow eva-g1"></i><i class="eva-glow eva-g2"></i><i class="eva-glow eva-g3"></i>'
    + `<span class="eva-moon">${EV_ART.moon()}</span>`
    + '<i class="eva-fog eva-f1"></i><i class="eva-fog eva-f2"></i>'
    + `<span class="eva-web eva-w1">${evaWeb()}</span><span class="eva-web eva-w2">${evaWeb()}</span>`
    + [1, 2, 3, 4].map(i => `<span class="eva-bat eva-b${i}">${EV_ART.bat()}</span>`).join(''),
};

if (typeof module !== 'undefined' && module.exports) module.exports = { EV_ART, EV_AMB };
