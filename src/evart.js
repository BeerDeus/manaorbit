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
   styles et animations dans css/ev-<pack>.css (transform / opacity seulement, 12 éléments animés au plus). Données pures : aucun accès au DOM ici.
   Noël (cadeau, booster du calendrier, boule, étoile, flocon, houx, clochette, icônes de récompense, guirlande evGarland) : section « Noël ».
   Nouvel an (étoile filante, constellations du mana EV_CONS, orbe de mana, feu d'artifice de minuit, icônes de récompense) : section « Nouvel an ».
   Pâques (œuf décoré en 5 teintes à décor peint, œuf d'or rare, œufs du mana, éclosion, compteur, poussin, lapin, panier qui se remplit, tulipe, jonquille,
   marguerite, papillon, cloche ailée, ruban ; pré fleuri de l'ambiance, pétales et papillons) : section « Pâques » en fin de fichier. */
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

/* Particules de la trouvaille (envol au centre, event.js › evSparks) : petits dessins qui jaillissent de l'objet en tournoyant. Un tableau de SVG par pack. */
const EVO_FXS = (path, fill, extra = '') => `<svg class="evo evo-fx" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="${path}" fill="${fill}" stroke="rgba(30,10,40,.55)" stroke-width=".8" stroke-linejoin="round"/>${extra}</svg>`;
const EV_FX = {
  halloween: () => [
    EVO_FXS('M12 2.5c4.6 0 8 3.2 8 7.6 0 2.6-1.2 4.4-3 5.5V19c0 1.1-.9 2-2 2H9c-1.1 0-2-.9-2-2v-3.4c-1.8-1.1-3-2.9-3-5.5 0-4.4 3.4-7.6 8-7.6z', '#f4efe6', '<ellipse cx="8.9" cy="10.6" rx="2.1" ry="2.4" fill="#2a1840"/><ellipse cx="15.1" cy="10.6" rx="2.1" ry="2.4" fill="#2a1840"/><path d="M12 13.4l-1.2 2.2h2.4z" fill="#2a1840"/><path d="M10 18.6v2M12 18.6v2M14 18.6v2" stroke="#2a1840" stroke-width=".9"/>'),      // tête de mort
    EVO_FXS('M12 2.6c4 0 6.6 3 6.6 7v10.2l-2.2-1.6-2.2 1.8-2.2-1.8-2.2 1.8-2.2-1.8-2.2 1.6V9.6c0-4 2.6-7 6.6-7z', '#efe9ff', '<ellipse cx="9.6" cy="10" rx="1.3" ry="1.8" fill="#2a1840"/><ellipse cx="14.4" cy="10" rx="1.3" ry="1.8" fill="#2a1840"/><ellipse cx="12" cy="14" rx="1.4" ry="1.1" fill="#2a1840"/>'),      // fantôme
    EVO_FXS('M15.5 2.8A9.4 9.4 0 1 0 21 17.6 7.6 7.6 0 0 1 15.5 2.8z', '#ffd86b', '<circle cx="9" cy="10" r="1.2" fill="#e8b93f"/><circle cx="11.5" cy="16" r="1.6" fill="#e8b93f"/>'),      // lune
    EVO_FXS('M12 2.4l8.6 17.2H3.4z', '#ff9a2e', '<path d="M6.6 13.2h10.8l2.4 4.8H4.2z" fill="#ffd166"/><path d="M8.8 8.8h6.4l1.2 2.4H7.6z" fill="#fff4e0"/>'),      // bonbon de maïs
    EVO_FXS('M12 2l2.6 6.4 6.9.5-5.3 4.5 1.7 6.7L12 16.4l-5.9 3.7 1.7-6.7-5.3-4.5 6.9-.5z', '#b58cff'),      // étoile
    EVO_FXS('M2 10.5c2.2-.6 3.8.4 4.6 2 .7-2.6 2.4-4 5.4-4s4.7 1.4 5.4 4c.8-1.6 2.4-2.6 4.6-2-1.8.9-2.5 2.4-2.6 4.4-1.2-.9-2.6-1-3.6-.2-.7-1.4-2.1-2-3.8-2s-3.1.6-3.8 2c-1-.8-2.4-.7-3.6.2-.1-2-.8-3.5-2.6-4.4z', '#3b2160'),      // chauve-souris
  ],
};

/* Feuilles d'automne (pluie de feuilles de l'accueil, EV_AMB_TOP) : érable, chêne, bouleau ; nervures claires, dégradé du pétiole vers la pointe. */
const EVO_LEAF = {
  maple: 'M12 1.5l1.6 3.9 2.6-1.4-.6 4.3 3.7-2.3-.9 3.2 3.4.6-2.6 2.8 1.4 1.6-4.4.9.6 2.3-3.9-1.5-.5 4.6h-1.8l-.5-4.6-3.9 1.5.6-2.3-4.4-.9 1.4-1.6-2.6-2.8 3.4-.6-.9-3.2 3.7 2.3-.6-4.3 2.6 1.4z',
  oak: 'M12 1.8c1.3 1 1.2 2.3.6 3.2 1.5-.6 2.8.2 2.4 1.6 1.4-.3 2.4.8 1.7 2-.9.5 1.6 1.3.9 2.6-.5.9-1.6.8-2 .7.9.9.6 2.4-.8 2.5.4 1.2-.6 2.3-2 1.9l-.2 4.2h-1.2l-.2-4.2c-1.4.4-2.4-.7-2-1.9-1.4-.1-1.7-1.6-.8-2.5-.4.1-1.5.2-2-.7-.7-1.3 1.8-2.1.9-2.6-.7-1.2.3-2.3 1.7-2-.4-1.4.9-2.2 2.4-1.6-.6-.9-.7-2.2.6-3.2z',
  birch: 'M12 2.2c4.2 2.6 6 6.4 5.3 10.2-.6 3.2-2.8 5.2-4.7 5.9l-.2 4.2h-.8l-.2-4.2c-1.9-.7-4.1-2.7-4.7-5.9C6 8.6 7.8 4.8 12 2.2z',
};
let EVO_LF = 0;
/** Une feuille (kind : maple | oak | birch ; c : [couleur claire, couleur foncée]). */
function evoLeaf(kind, c) {
  const id = 'evl' + (++EVO_LF).toString(36);
  return `<svg class="evo evo-leaf" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><defs><linearGradient id="${id}" x1="0" y1="0" x2=".6" y2="1"><stop offset="0" stop-color="${c[0]}"/><stop offset="1" stop-color="${c[1]}"/></linearGradient></defs>`
    + `<path d="${EVO_LEAF[kind]}" fill="url(#${id})" stroke="${c[1]}" stroke-width=".5" stroke-linejoin="round"/><path d="M12 21V6M12 12l-3.5-3M12 12l3.5-3M12 15.5l-2.6-1.8M12 15.5l2.6-1.8" fill="none" stroke="#fff3d6" stroke-width=".6" stroke-linecap="round" opacity=".55"/></svg>`;
}
/** Couche du dessus (devant l'accueil, jamais sous une feuille ni un écran plein) : pluie de feuilles d'automne ; 7 feuilles, chacune deux éléments animés (chute, balancement). */
const EV_AMB_TOP = {
  halloween: () => [['maple', ['#ffb347', '#d9480f']], ['oak', ['#e8a33a', '#8a4b12']], ['maple', ['#ff7a45', '#a8261b']], ['birch', ['#ffd166', '#c27c0e']], ['maple', ['#f4a259', '#9b3d12']], ['oak', ['#d97b29', '#6e3409']], ['birch', ['#ffbf69', '#b5560b']]]
    .map(([k, c], i) => `<span class="eva-lf eva-l${i + 1}"><span class="eva-lf-s">${evoLeaf(k, c)}</span></span>`).join(''),
};

/* ── Noël ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
   Tout est dessiné ici (SVG en couleur, jamais d'emoji ni d'image externe) ; animations : css/ev-noel.css (transform / opacity seulement).
   Teintes « v » : les cinq couleurs du mana dans l'ordre du cercle (0 blanc, 1 bleu, 2 noir, 3 rouge, 4 vert) ; v absent : rouge.
   · gift(o) : paquet cadeau (viewBox 64 × 64) vu de trois quarts : couvercle, ruban, nœud, étiquette, papier à motif (pois, flocons, étoiles, rayures).
     Parties animées : .evo-bow (le nœud frétille), .evo-glint (reflet qui passe sur le papier), .evo-glow (halo), .evo-rays et .evo-spk (version allumée).
     o.v teinte ; o.lit : célébration (halo plus vif, rayons qui tournent, étincelles) ; o.cls : classes en plus. Lisible à 22–32 px (silhouette, ruban contrasté).
   · booster(o) : booster scellé, porte du calendrier de l'Avent (viewBox 30 × 40) : emballage foil, bords sertis, orbe du mana et son anneau (emblème de
     Mana Orbit, pas celui de Magic), aucun texte ; le bas du milieu reste calme (le numéro du jour est posé par-dessus en HTML).
     o.v teinte ; o.frost : porte à venir (givrée, désaturée, neige sur le dessus) ; o.today : porte du jour (ruban doré, petit nœud, liseré et halo d'or).
   · bauble(o) boule de Noël (48 × 48, o.v) · star(o) étoile dorée à facettes (64 × 64, halo .evo-glow ; o.lit : rayons) · snowflake(o) flocon à six branches
     (24 × 24, currentColor ; o.edge : liseré d'une autre couleur dessous, o.w : épaisseur) · holly(o) houx (32 × 28) · bell(o) clochette (24 × 24, messages ;
     .evo-bell-b se balance) · giftCounter(o) compteur « 12 / 48 » (24 × 24, aplats pour 16–24 px).
   · rwXp, rwCover, rwOrb, rwFact, rwCard : icônes plates des récompenses du calendrier (24 × 24, 20–28 px), classe « evo evo-rw ».
   evGarland() : guirlande lumineuse du haut de la carte de la fête (voir sa note). EV_AMB.noel, EV_AMB_TOP.noel, EV_FX.noel : ambiance, neige, particules. */
const evnHex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
/** Mélange de deux couleurs « #rrggbb » (t : part de b). */
const evnMix = (a, b, t) => '#' + evnHex(a).map((x, i) => Math.round(x + (evnHex(b)[i] - x) * t).toString(16).padStart(2, '0')).join('');
const evnV = v => (Number(v) >= 0 && Number(v) <= 4 ? Math.floor(Number(v)) : 3);
/** Étincelle à quatre branches (x, y centre ; r rayon). */
const evnSpark = (x, y, r) => { const f = evoF, q = r * .22; return `M${f(x)} ${f(y - r)}Q${f(x + q)} ${f(y - q)} ${f(x + r)} ${f(y)}Q${f(x + q)} ${f(y + q)} ${f(x)} ${f(y + r)}Q${f(x - q)} ${f(y + q)} ${f(x - r)} ${f(y)}Q${f(x - q)} ${f(y - q)} ${f(x)} ${f(y - r)}Z`; };
/** Étoile à cinq branches (x, y centre ; r rayon ; k rapport du rayon intérieur). */
const evnStar5 = (x, y, r, k = .44) => 'M' + Array.from({ length: 10 }, (_, i) => { const a = (-90 + i * 36) * Math.PI / 180, l = i % 2 ? r * k : r; return evoF(x + Math.cos(a) * l) + ' ' + evoF(y + Math.sin(a) * l); }).join('L') + 'Z';
/** Flocon à six branches (centre 12, 12 ; branches de longueur l, deux paires de rameaux) : un seul tracé. */
function evnFlakeD(l = 9.6, cx = 12, cy = 12) {
  const f = evoF, seg = [[0, 0, 0, -l], [0, -l * .42, -l * .27, -l * .65], [0, -l * .42, l * .27, -l * .65], [0, -l * .7, -l * .17, -l * .86], [0, -l * .7, l * .17, -l * .86]];
  let d = '';
  for (let k = 0; k < 6; k++) {
    const a = k * Math.PI / 3, c = Math.cos(a), s = Math.sin(a), R = (x, y) => f(cx + x * c - y * s) + ' ' + f(cy + x * s + y * c);
    for (const [x1, y1, x2, y2] of seg) d += `M${R(x1, y1)}L${R(x2, y2)}`;
  }
  return d;
}
/** Feuille de houx : base (bx, by), pointe (tx, ty), demi-largeur w ; trois piquants de chaque côté, creux arrondis entre eux. */
function evnLeaf(bx, by, tx, ty, w) {
  const dx = tx - bx, dy = ty - by, L = Math.hypot(dx, dy), nx = -dy / L, ny = dx / L, f = evoF;
  const at = (t, s) => { const h = w * Math.sin(Math.PI * Math.min(t, .97)) * s; return f(bx + dx * t + nx * h) + ' ' + f(by + dy * t + ny * h); };
  const K = [.2, .45, .7], M = [.1, .33, .58, .86];
  let d = `M${at(0, 0)}`;
  K.forEach((t, i) => { d += `Q${at(M[i], .62)} ${at(t, 1.18)}`; }); d += `Q${at(M[3], .62)} ${at(1, 0)}`;
  d += `Q${at(M[3], -.62)} ${at(K[2], -1.18)}`; for (let i = 1; i >= 0; i--) d += `Q${at(M[i + 1], -.62)} ${at(K[i], -1.18)}`; d += `Q${at(M[0], -.62)} ${at(0, 0)}Z`;
  return d;
}
/** Fougère de givre : tige depuis (x, y) dans la direction a (degrés), longueur l, rameaux à ±60° de plus en plus courts. */
function evnFern(x, y, a, l, step = 7) {
  const f = evoF, r = a * Math.PI / 180, P = (d, b, s) => [x + Math.cos(r) * d + Math.cos(r + b) * s, y + Math.sin(r) * d + Math.sin(r + b) * s];
  let d = `M${f(x)} ${f(y)}L${f(x + Math.cos(r) * l)} ${f(y + Math.sin(r) * l)}`;
  for (let s = step; s < l - 2; s += step) {
    const len = (1 - s / l) * step * 1.5 + 1.2;
    for (const b of [Math.PI / 3, -Math.PI / 3]) { const [px, py] = P(s, 0, 0), [qx, qy] = P(s, b, len); d += `M${f(px)} ${f(py)}L${f(qx)} ${f(qy)}`; }
  }
  return d;
}

/* Papier des cadeaux : [clair, moyen, foncé, contour], ruban, motif [sorte, couleur] ; rubans : [clair, moyen, foncé, contour] */
const EVN_RIB = { or: ['#fff4c0', '#f4c542', '#b37f12', '#6e4a05'], argent: ['#ffffff', '#e4ebf4', '#9fb1c8', '#55657f'], rouge: ['#ff9d92', '#e23b3b', '#a1162a', '#5e0b14'] };
const EVN_GIFT = [
  { p: ['#fffdf6', '#f3e8cd', '#d2bd8e', '#8f7343'], r: 'or', m: ['dots', '#dcae3a'] },          // blanc : ivoire, pois dorés
  { p: ['#9fd2ff', '#2f80d8', '#174b94', '#0b2a5a'], r: 'argent', m: ['snow', '#ffffff'] },      // bleu : flocons blancs, ruban d'argent
  { p: ['#6d5196', '#3a2559', '#1a0e2e', '#090412'], r: 'or', m: ['stars', '#f4c542'] },         // noir : nuit violette, étoiles d'or
  { p: ['#ff8274', '#e23b3b', '#a3192a', '#560912'], r: 'or', m: ['stripes', '#ffb0a4'] },       // rouge : fines rayures
  { p: ['#8ae29e', '#1f9a52', '#0d5a2f', '#05361b'], r: 'rouge', m: ['dots', '#ffffff'] },       // vert : pois blancs, ruban rouge
];
/* Orbe du mana (boosters, boules) : [clair, moyen, foncé, contour] */
const EVN_MANA = [['#fffbe6', '#f0d995', '#b5954a', '#6a5420'], ['#c4e4ff', '#3a8ee0', '#1a4f99', '#0b2955'], ['#c3a6ea', '#5d3c8c', '#26153f', '#0c0618'],
  ['#ffb7a4', '#e5432f', '#9c1b14', '#4c0906'], ['#c6f2b6', '#2f9e55', '#145f30', '#063018']];
/** Motif du papier (pattern en coordonnées de la page : le même pas sur toutes les faces). */
function evnPat(pid, [k, c]) {
  const P = (w, h, s, tr = '') => `<pattern id="${pid}" width="${w}" height="${h}" patternUnits="userSpaceOnUse"${tr}>${s}</pattern>`;
  if (k === 'stripes') return P(4.6, 4.6, `<rect width="1.5" height="4.6" fill="${c}" opacity=".5"/>`, ' patternTransform="rotate(-36)"');
  if (k === 'stars') return P(10, 9, `<path d="${evnStar5(2.6, 2.6, 1.7)}${evnStar5(7.6, 7, 1.2)}" fill="${c}" opacity=".85"/>`);
  if (k === 'snow') return P(9, 9, `<path d="${evnSpark(2.4, 2.4, 1.6)}" fill="${c}" opacity=".9"/><circle cx="7" cy="6.6" r=".75" fill="${c}" opacity=".75"/><circle cx="2.6" cy="7.4" r=".45" fill="${c}" opacity=".6"/>`);
  return P(6, 6, `<circle cx="1.5" cy="1.5" r=".85" fill="${c}"/><circle cx="4.5" cy="4.5" r=".85" fill="${c}"/>`);
}
/* faces du paquet (vu de trois quarts, profondeur 4 × 2,6) : corps de face et de côté, couvercle de face, dessus, côté ; ruban de face et du dessus */
const EVN_BOX = {
  bf: 'M11.5 31.6H48.5V55.6Q48.5 57 47.1 57H12.9Q11.5 57 11.5 55.6Z', bs: 'M48.5 31.6L52.5 29V54Q52.5 54.8 51.8 55.3L48.5 57Z',
  lf: 'M9 23H51V30.4Q51 31.6 49.8 31.6H10.2Q9 31.6 9 30.4Z', lt: 'M9 23L13 20.4H55L51 23Z', ls: 'M51 23L55 20.4V28.6Q55 29.3 54.4 29.7L51 31.6Z',
  rf: 'M27 23H33V57H27Z', rt: 'M27 23L31 20.4H37L33 23Z',
};
/* nœud : boucles (gauche, droite), creux des boucles, pans */
const EVN_BOW = {
  l: 'M32 21.6C26 22.8 17.4 20.8 17.7 14.4C18 9.2 24 8.9 27.3 12.5C29.5 15 31 18.4 32 21.6Z', r: 'M32 21.6C38 22.8 46.6 20.8 46.3 14.4C46 9.2 40 8.9 36.7 12.5C34.5 15 33 18.4 32 21.6Z',
  li: 'M31 20.4C27.6 19.9 22.6 17.8 22.4 15C22.3 13.3 24.2 12.9 26 14.3C28.2 16 30 18.4 31 20.4Z', ri: 'M33 20.4C36.4 19.9 41.4 17.8 41.6 15C41.7 13.3 39.8 12.9 38 14.3C35.8 16 34 18.4 33 20.4Z',
  t: 'M30.6 22L24.4 30.8L26.4 29.9L27.4 32.2L32.6 22.8ZM33.4 22L39.6 30.8L37.6 29.9L36.6 32.2L31.4 22.8Z',
};
/** Rayons et étincelles de la version allumée (centre cx, cy ; r longueur des rayons). */
const evnRays = (id, cx, cy, r) => `<g class="evo-rays" fill="url(#${id})">${[0, 45, 90, 135, 180, 225, 270, 315].map(a => `<path d="M${cx} ${cy}L${cx - 2.4} ${cy - r}Q${cx} ${cy - r - 1.6} ${cx + 2.4} ${cy - r}Z" transform="rotate(${a + 22.5} ${cx} ${cy})"/>`).join('')}</g>`;

Object.assign(EV_ART, {
  /** Paquet cadeau (viewBox 64 × 64), teinte o.v (0–4 : blanc, bleu, noir, rouge, vert ; sinon rouge). */
  gift: (o = {}) => {
    const n = ++EVO_N, id = s => `evo${n}${s}`, lit = !!o.lit, G = EVN_GIFT[evnV(o.v)], p = G.p, R = EVN_RIB[G.r], B = EVN_BOX, W = EVN_BOW;
    const face = d => `<path d="${d}"/>`;
    return `<svg class="evo evo-gift${lit ? ' evo-lit' : ''}${o.cls ? ' ' + o.cls : ''}" viewBox="0 0 64 64" aria-hidden="true" focusable="false"><defs>`
      + `<radialGradient id="${id('g')}" cx="32" cy="36" r="31" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#fff2b8" stop-opacity="${lit ? .9 : .42}"/><stop offset=".45" stop-color="#f4c542" stop-opacity="${lit ? .4 : .16}"/><stop offset="1" stop-color="#f4c542" stop-opacity="0"/></radialGradient>`
      + (lit ? `<linearGradient id="${id('y')}" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#fff6c8" stop-opacity=".95"/><stop offset="1" stop-color="#ffd76a" stop-opacity="0"/></linearGradient>` : '')
      + `<linearGradient id="${id('p')}" x1="0" y1="0" x2="1" y2=".35"><stop offset="0" stop-color="${p[0]}"/><stop offset=".5" stop-color="${p[1]}"/><stop offset="1" stop-color="${p[2]}"/></linearGradient>`
      + `<linearGradient id="${id('s')}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".2"/></linearGradient>`
      + `<linearGradient id="${id('u')}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity=".34"/><stop offset="1" stop-color="#000" stop-opacity="0"/></linearGradient>`
      + `<linearGradient id="${id('r')}" x1="27" y1="0" x2="33" y2="0" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="${R[1]}"/><stop offset=".32" stop-color="${R[0]}"/><stop offset=".6" stop-color="${R[1]}"/><stop offset="1" stop-color="${R[2]}"/></linearGradient>`
      + `<radialGradient id="${id('b')}" cx=".38" cy=".3" r=".8"><stop offset="0" stop-color="${R[0]}"/><stop offset=".5" stop-color="${R[1]}"/><stop offset="1" stop-color="${R[2]}"/></radialGradient>`
      + `<linearGradient id="${id('k')}" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".5" stop-color="#fff" stop-opacity=".78"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>`
      + `<linearGradient id="${id('h')}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".6"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>`
      + `<radialGradient id="${id('o')}"><stop offset="0" stop-color="#0d1f17" stop-opacity=".32"/><stop offset="1" stop-color="#0d1f17" stop-opacity="0"/></radialGradient>`
      + evnPat(id('t'), G.m) + `<clipPath id="${id('c')}">${[B.bf, B.bs, B.lf, B.lt, B.ls].map(face).join('')}</clipPath></defs>`
      + `<circle class="evo-glow" cx="32" cy="36" r="31" fill="url(#${id('g')})"/>` + (lit ? evnRays(id('y'), 32, 36, 32) : '')
      + `<ellipse class="evo-shadow" cx="32" cy="58.4" rx="24" ry="3" fill="url(#${id('o')})"/>`
      + `<g stroke="${p[3]}" stroke-width=".6" stroke-linejoin="round"><path d="${B.bs}" fill="${p[2]}"/><path d="${B.bf}" fill="url(#${id('p')})"/><path d="${B.ls}" fill="${p[2]}"/><path d="${B.lf}" fill="url(#${id('p')})"/><path d="${B.lt}" fill="${p[1]}"/></g>`
      + `<g clip-path="url(#${id('c')})"><rect x="8" y="19" width="48" height="39" fill="url(#${id('t')})"/>`
      + `<path d="${B.bf}" fill="url(#${id('s')})"/><path d="${B.bs}${B.ls}" fill="#000" opacity=".2"/><path d="${B.lt}" fill="#fff" opacity=".24"/>`
      + `<g stroke="${R[3]}" stroke-width=".5" stroke-linejoin="round"><path d="${B.rf}" fill="url(#${id('r')})"/><path d="${B.rt}" fill="${R[0]}"/></g>`
      + `<path d="M28.5 24V56.4" stroke="${R[0]}" stroke-width=".7" opacity=".75"/>`
      + `<rect x="9" y="31.6" width="44" height="3" fill="url(#${id('u')})"/>`
      + `<path class="evo-glint" d="M1 58H7.4L18.6 19H12.2Z" fill="url(#${id('k')})" opacity="0"/></g>`
      + `<path d="M11.4 24.6H25.4M35 24.6H45" stroke="#fff" stroke-width=".9" stroke-linecap="round" opacity=".5"/><rect x="13.5" y="35.6" width="2.3" height="18.4" rx="1.15" fill="url(#${id('h')})"/>`
      + `<g class="evo-tag"><path d="M34.6 22.4Q40.2 22.6 43.2 25.8" fill="none" stroke="#8a6a3e" stroke-width=".55"/><path d="M42.4 25.4L44.4 24.4L49.8 26.3L48.4 30.4L43 28.5L42 26.8Z" fill="#fff8e6" stroke="#a3834f" stroke-width=".45" stroke-linejoin="round"/>`
      + `<circle cx="43.5" cy="26.2" r=".5" fill="#8a6a3e"/><path d="M45 27.6L47.9 28.6" stroke="${G.r === 'rouge' ? '#c0392b' : '#c9962a'}" stroke-width=".55" stroke-linecap="round"/></g>`
      + `<g class="evo-bow" stroke="${R[3]}" stroke-width=".55" stroke-linejoin="round"><path d="${W.t}" fill="${R[1]}"/><path d="${W.l}${W.r}" fill="url(#${id('b')})"/>`
      + `<path d="${W.li}${W.ri}" fill="${R[2]}" opacity=".62" stroke="none"/><path d="M19.6 14Q20.6 10.8 24.4 11.2M44.4 14Q43.4 10.8 39.6 11.2" fill="none" stroke="#fff" stroke-width=".8" stroke-linecap="round" opacity=".6"/>`
      + `<rect x="29.3" y="18.4" width="5.4" height="5.6" rx="2" fill="url(#${id('b')})"/><path d="M30.6 19.8Q31.4 19.2 32.4 19.4" fill="none" stroke="#fff" stroke-width=".6" stroke-linecap="round" opacity=".7"/></g>`
      + (lit ? `<g class="evo-spk" fill="#fff8d6">${[[9, 13, 3.2], [56, 11, 2.6], [7, 46, 2.2], [58, 44, 2.8], [32, 3.6, 2]].map(([x, y, r]) => `<path d="${evnSpark(x, y, r)}"/>`).join('')}</g>` : '')
      + `</svg>`;
  },
  /** Booster scellé, porte du calendrier (viewBox 30 × 40) : o.v teinte ; o.frost porte à venir ; o.today porte du jour. */
  booster: (o = {}) => {
    const n = ++EVO_N, id = s => `evo${n}${s}`, v = evnV(o.v), fr = !!o.frost, td = !!o.today && !fr, f = evoF;
    const c = fr ? EVN_MANA[v].map((x, i) => evnMix(x, ['#f4f8fc', '#d5e1ec', '#a9bccf', '#6f8399'][i], .74)) : EVN_MANA[v];
    let top = 'M2 2.2', bot = '';
    for (let i = 0; i < 20; i++) { const x = 2 + i * 1.3; top += `L${f(x + .65)} 1L${f(x + 1.3)} 2.2`; bot += `L${f(28 - i * 1.3 - .65)} 39L${f(28 - i * 1.3 - 1.3)} 37.8`; }
    const body = `${top}L28 37.8${bot}Z`, ring = fr ? '#ffffff' : '#f4c542';
    return `<svg class="evo evo-booster${fr ? ' evo-frost' : ''}${td ? ' evo-today' : ''}${o.cls ? ' ' + o.cls : ''}" viewBox="0 0 30 40" aria-hidden="true" focusable="false"><defs>`
      + `<linearGradient id="${id('f')}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c[1]}"/><stop offset=".2" stop-color="${c[0]}"/><stop offset=".42" stop-color="${c[1]}"/><stop offset=".78" stop-color="${c[2]}"/><stop offset="1" stop-color="${c[3]}"/></linearGradient>`
      + `<radialGradient id="${id('o')}" cx=".36" cy=".3" r=".75"><stop offset="0" stop-color="${fr ? '#ffffff' : evnMix(c[0], '#ffffff', .4)}"/><stop offset=".45" stop-color="${c[1]}"/><stop offset=".85" stop-color="${c[2]}"/><stop offset="1" stop-color="${c[3]}"/></radialGradient>`
      + (td ? `<radialGradient id="${id('g')}" cx="15" cy="20" r="21" gradientUnits="userSpaceOnUse"><stop offset=".45" stop-color="#ffd76a" stop-opacity=".55"/><stop offset="1" stop-color="#f4c542" stop-opacity="0"/></radialGradient>`
        + `<linearGradient id="${id('r')}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff4c0"/><stop offset=".45" stop-color="#f4c542"/><stop offset="1" stop-color="#a87410"/></linearGradient>` : '')
      + (fr ? `<linearGradient id="${id('n')}" x1="0" y1="0" x2="0" y2="1"><stop offset=".5" stop-color="#ffffff"/><stop offset="1" stop-color="#d3e3f3"/></linearGradient>` : '')
      + `<clipPath id="${id('c')}"><path d="${body}"/></clipPath></defs>`
      + (td ? `<circle class="evo-glow" cx="15" cy="20" r="21" fill="url(#${id('g')})"/>` : '')
      + `<path d="${body}" fill="url(#${id('f')})"/>`
      + `<g clip-path="url(#${id('c')})"><path d="M2 10.4L22 1H27L2 16.4Z" fill="#fff" opacity="${fr ? .3 : .2}"/>`
      + `<rect x="2" y="0" width="26" height="5.4" fill="#000" opacity=".16"/><rect x="2" y="34.6" width="26" height="5.4" fill="#000" opacity=".2"/>`
      + `<path d="M2.4 3.3H27.6M2.4 36.7H27.6" stroke="#fff" stroke-opacity=".38" stroke-width="3" stroke-dasharray=".42 .8"/>`
      + `<path d="M2 5.4H28M2 34.6H28" stroke="${c[3]}" stroke-width=".5" opacity=".5"/><path d="M2 5.95H28M2 35.15H28" stroke="#fff" stroke-width=".4" opacity=".35"/>`
      + `<rect x="2" y="5.4" width="1.4" height="29.2" fill="#000" opacity=".16"/><rect x="26.6" y="5.4" width="1.4" height="29.2" fill="#000" opacity=".26"/><path d="M3.9 6.2V33.8" stroke="#fff" stroke-width=".4" opacity=".3"/>`
      + (td ? `<path d="M21.8 0H24.4V40H21.8ZM2 20.2H28V22.8H2Z" fill="url(#${id('r')})"/><path d="M21.8 0V40M24.4 0V40M2 20.2H28M2 22.8H28" stroke="#8a5a05" stroke-width=".35" opacity=".7"/><path d="M22.6 6V19.6M22.6 23.4V34" stroke="#fff6cf" stroke-width=".4" opacity=".8"/>` : '')
      + `</g>`
      + `<path d="M5.42 14.5A9.6 3 0 0 1 24.58 14.5" transform="rotate(-18 15 14.5)" fill="none" stroke="${ring}" stroke-width=".9" opacity=".7"/>`
      + `<circle cx="15" cy="14.5" r="6" fill="url(#${id('o')})" stroke="${c[3]}" stroke-width=".45"/>`
      + `<ellipse cx="12.9" cy="12.2" rx="2.2" ry="1.3" transform="rotate(-35 12.9 12.2)" fill="#fff" opacity=".75"/>`
      + `<path d="M5.42 14.5A9.6 3 0 0 0 24.58 14.5" transform="rotate(-18 15 14.5)" fill="none" stroke="${ring}" stroke-width="1.1"/>`
      + `<path d="${evnSpark(24.3, 7.2, 1.6)}${evnSpark(6.2, 22.2, 1)}" fill="#fff" opacity="${fr ? .6 : .9}"/>`
      + `<path d="${body}" fill="none" stroke="${td ? '#f4c542' : c[3]}" stroke-width="${td ? .9 : .55}" stroke-linejoin="round"/>`
      + (fr ? `<g fill="none" stroke="#fff" stroke-width=".42" stroke-linecap="round" opacity=".85"><path d="${evnFern(2.6, 37.4, -62, 8.4, 2.4)}${evnFern(2.6, 37.4, -22, 6.6, 2.4)}${evnFern(27.4, 37.4, -118, 8.4, 2.4)}${evnFern(27.4, 37.4, -158, 6.6, 2.4)}"/></g>`
        + `<path d="M1.2 6.2C.5 4.4 1.6 2.5 3.4 2.4C4 .8 6 .1 7.4 1.1C8.6-.3 11-.3 12 .9C13.4-.5 16-.3 16.8 1.1C18.2.1 20.4.3 21.2 1.7C22.6.9 24.8 1.3 25.4 2.9C27.4 2.7 29.1 4.5 28.7 6.5C28.5 7.6 27.7 8 26.9 7.6C26.5 9.7 25.2 10.5 24.6 9C24 7.6 22.4 7.8 21.4 8.4C20 9.2 18.6 8.6 17.8 7.8C16.6 8.8 14.4 9 13.2 8C12 9.4 10 9.4 9.2 8.2C8.2 9 6.6 9.2 5.8 8.2C5.2 10.7 3.8 11.1 3.4 9.5C3 8 2.2 7.6 1.2 6.2Z" fill="url(#${id('n')})" stroke="#9fb8d2" stroke-width=".45" stroke-linejoin="round"/>`
        + `<path d="M3.6 4.2Q6 2.4 9 3M15 2.6Q18 1.8 20.6 3" fill="none" stroke="#fff" stroke-width=".6" stroke-linecap="round"/>` : '')
      + (td ? `<g class="evo-bow" stroke="#8a5a05" stroke-width=".4" stroke-linejoin="round"><path d="M23.1 21.4C20.6 22 17.8 20.6 18.1 18.4C18.4 16.5 21.1 16.9 23.1 21.4ZM23.1 21.4C25.6 22 28.4 20.6 28.1 18.4C27.8 16.5 25.1 16.9 23.1 21.4Z" fill="#f4c542"/>`
        + `<path d="M22.4 20.4C21 20 19.6 19 19.7 18.4M23.8 20.4C25.2 20 26.6 19 26.5 18.4" fill="none" stroke="#a87410" stroke-width=".4" opacity=".8"/><circle cx="23.1" cy="21.4" r="1.3" fill="#ffd84a"/></g>` : '')
      + `</svg>`;
  },
  /** Boule de Noël (viewBox 48 × 48), teinte o.v ; o.lit : halo. */
  bauble: (o = {}) => {
    const n = ++EVO_N, id = s => `evo${n}${s}`, v = evnV(o.v), c = EVN_MANA[v], gd = v === 0 ? '#c99a2e' : '#f4c542';
    return `<svg class="evo evo-bauble${o.cls ? ' ' + o.cls : ''}" viewBox="0 0 48 48" aria-hidden="true" focusable="false"><defs>`
      + `<radialGradient id="${id('b')}" cx=".36" cy=".3" r=".78" fx=".32" fy=".24"><stop offset="0" stop-color="${evnMix(c[0], '#ffffff', .35)}"/><stop offset=".4" stop-color="${c[1]}"/><stop offset=".85" stop-color="${c[2]}"/><stop offset="1" stop-color="${c[3]}"/></radialGradient>`
      + `<linearGradient id="${id('m')}" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#8a6a1c"/><stop offset=".35" stop-color="#fff1b0"/><stop offset=".6" stop-color="#d4a93a"/><stop offset="1" stop-color="#6e4f0c"/></linearGradient>`
      + `<radialGradient id="${id('h')}"><stop offset="0" stop-color="#fff" stop-opacity=".95"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>`
      + (o.lit ? `<radialGradient id="${id('g')}"><stop offset=".5" stop-color="${c[1]}" stop-opacity=".45"/><stop offset="1" stop-color="${c[1]}" stop-opacity="0"/></radialGradient>` : '')
      + `<clipPath id="${id('c')}"><circle cx="24" cy="29" r="16.4"/></clipPath></defs>`
      + (o.lit ? `<circle class="evo-glow" cx="24" cy="29" r="23" fill="url(#${id('g')})"/>` : '')
      + `<path d="M24 8.6C21.2 8.4 21.2 3.2 24 3.2C26.7 3.2 26.6 6.4 24.7 6.8" fill="none" stroke="#b8932f" stroke-width="1" stroke-linecap="round"/>`
      + `<circle cx="24" cy="29" r="16.4" fill="url(#${id('b')})" stroke="${c[3]}" stroke-width=".5"/>`
      + `<g clip-path="url(#${id('c')})"><path d="M6 27.2Q24 34.4 42 27.2" fill="none" stroke="${gd}" stroke-width="2.6"/><path d="M6 32.2Q24 39.4 42 32.2" fill="none" stroke="${gd}" stroke-width=".8"/>`
      + `<g fill="${v === 0 ? '#d24b3b' : '#fff6d0'}">${[[11.6, 30.2], [17.8, 32], [24, 32.6], [30.2, 32], [36.4, 30.2]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r=".95"/>`).join('')}</g>`
      + `<path d="${evnSpark(15.4, 20.4, 1.7)}${evnSpark(32.6, 39, 1.3)}${evnSpark(36, 22.6, 1)}" fill="${v === 0 ? gd : '#fff'}" opacity=".7"/></g>`
      + `<ellipse cx="18.2" cy="21.4" rx="5.4" ry="3.6" transform="rotate(-35 18.2 21.4)" fill="url(#${id('h')})" opacity=".85"/><circle cx="15.6" cy="26" r=".9" fill="#fff" opacity=".55"/>`
      + `<path d="M33.4 40.2Q38.8 36.4 39.8 30" fill="none" stroke="#fff" stroke-width="1" stroke-linecap="round" opacity=".32"/>`
      + `<path d="M20 8.4H28L27.4 12.4H20.6Z" fill="url(#${id('m')})" stroke="#6e4f0c" stroke-width=".5" stroke-linejoin="round"/><path d="M21.8 8.8V12M23.4 8.8V12.2M25 8.8V12.2M26.6 8.8V12" stroke="#5a3e08" stroke-width=".35" opacity=".5"/>`
      + `<rect x="19.6" y="11.8" width="8.8" height="1.5" rx=".75" fill="url(#${id('m')})" stroke="#6e4f0c" stroke-width=".4"/></svg>`;
  },
  /** Étoile dorée à facettes (viewBox 64 × 64), halo .evo-glow ; o.lit : rayons. */
  star: (o = {}) => {
    const n = ++EVO_N, id = s => `evo${n}${s}`, f = evoF, cx = 32, cy = 33.5;
    const P = i => { const a = (-90 + i * 36) * Math.PI / 180, l = i % 2 ? 10.8 : 26; return f(cx + Math.cos(a) * l) + ' ' + f(cy + Math.sin(a) * l); };
    let lt = '', dk = '';
    for (let k = 0; k < 5; k++) { lt += `M${cx} ${cy}L${P(2 * k)}L${P((2 * k + 9) % 10)}Z`; dk += `M${cx} ${cy}L${P(2 * k)}L${P(2 * k + 1)}Z`; }
    return `<svg class="evo evo-star${o.lit ? ' evo-lit' : ''}${o.cls ? ' ' + o.cls : ''}" viewBox="0 0 64 64" aria-hidden="true" focusable="false"><defs>`
      + `<radialGradient id="${id('g')}" cx="32" cy="33.5" r="31" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#fff3b8" stop-opacity=".85"/><stop offset=".45" stop-color="#f4c542" stop-opacity=".3"/><stop offset="1" stop-color="#f4c542" stop-opacity="0"/></radialGradient>`
      + (o.lit ? `<linearGradient id="${id('y')}" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#fff6c8" stop-opacity=".9"/><stop offset="1" stop-color="#ffd76a" stop-opacity="0"/></linearGradient>` : '')
      + `<linearGradient id="${id('a')}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fffbe0"/><stop offset=".6" stop-color="#ffd84a"/><stop offset="1" stop-color="#f0b324"/></linearGradient>`
      + `<linearGradient id="${id('b')}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f6c232"/><stop offset=".6" stop-color="#d99a10"/><stop offset="1" stop-color="#a86d05"/></linearGradient></defs>`
      + `<circle class="evo-glow" cx="32" cy="33.5" r="31" fill="url(#${id('g')})"/>` + (o.lit ? evnRays(id('y'), 32, 33.5, 31) : '')
      + `<path d="${lt}" fill="url(#${id('a')})"/><path d="${dk}" fill="url(#${id('b')})"/>`
      + `<path d="${evnStar5(cx, cy, 26, 10.8 / 26)}" fill="none" stroke="#8a5a05" stroke-width=".8" stroke-linejoin="round"/>`
      + `<path d="M${cx} ${cy}L${P(0)}M${cx} ${cy}L${P(2)}M${cx} ${cy}L${P(4)}M${cx} ${cy}L${P(6)}M${cx} ${cy}L${P(8)}" stroke="#fff6cf" stroke-width=".5" opacity=".7"/>`
      + `<path d="${evnSpark(25.6, 14.4, 2.6)}${evnSpark(46, 26, 1.6)}" fill="#fff" opacity=".9"/></svg>`;
  },
  /** Flocon à six branches (viewBox 24 × 24), couleur du texte ; o.edge : liseré dessous (neige visible sur fond clair) ; o.w : épaisseur. */
  snowflake: (o = {}) => {
    const d = evnFlakeD(), w = o.w || 1.4;
    return `<svg class="evo evo-flake${o.cls ? ' ' + o.cls : ''}" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke-linecap="round" stroke-linejoin="round">`
      + (o.edge ? `<path d="${d}" stroke="${o.edge}" stroke-width="${w + 1.3}"/>` : '') + `<path d="${d}" stroke="currentColor" stroke-width="${w}"/>`
      + `<path d="M12 9.9L13.8 10.95V13.05L12 14.1L10.2 13.05V10.95Z" fill="currentColor" stroke="none"/></svg>`;
  },
  /** Houx (viewBox 32 × 28) : deux feuilles piquantes, trois baies. */
  holly: (o = {}) => {
    const n = ++EVO_N, id = s => `evo${n}${s}`;
    const berry = ([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="url(#${id('r')})" stroke="#5a0a0e" stroke-width=".4"/><circle cx="${evoF(x - r * .32)}" cy="${evoF(y - r * .36)}" r="${evoF(r * .28)}" fill="#fff" opacity=".8"/>`;
    return `<svg class="evo evo-holly${o.cls ? ' ' + o.cls : ''}" viewBox="0 0 32 28" aria-hidden="true" focusable="false"><defs>`
      + `<linearGradient id="${id('l')}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#56b862"/><stop offset=".55" stop-color="#1f7a3c"/><stop offset="1" stop-color="#0f4d25"/></linearGradient>`
      + `<radialGradient id="${id('r')}" cx=".38" cy=".34" r=".7"><stop offset="0" stop-color="#ff8f80"/><stop offset=".5" stop-color="#d9302c"/><stop offset="1" stop-color="#8a0f14"/></radialGradient></defs>`
      + `<g fill="url(#${id('l')})" stroke="#0b3a1c" stroke-width=".55" stroke-linejoin="round"><path d="${evnLeaf(15, 13.6, 2, 23.4, 4.6)}"/><path d="${evnLeaf(17, 13.6, 30, 23.4, 4.6)}"/></g>`
      + `<path d="M15 13.6Q8.6 18 2.8 22.9M17 13.6Q23.4 18 29.2 22.9" fill="none" stroke="#b6e8a8" stroke-width=".6" stroke-linecap="round" opacity=".75"/>`
      + [[16, 12.4, 2.9], [12.6, 10, 2.6], [19.4, 10.2, 2.6]].map(berry).join('') + `</svg>`;
  },
  /** Clochette dorée (viewBox 24 × 24), nœud rouge ; .evo-bell-b se balance (css/ev-noel.css). */
  bell: (o = {}) => {
    const n = ++EVO_N, id = s => `evo${n}${s}`;
    return `<svg class="evo evo-bell${o.cls ? ' ' + o.cls : ''}" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><defs>`
      + `<radialGradient id="${id('b')}" cx=".36" cy=".32" r=".8"><stop offset="0" stop-color="#fff4c0"/><stop offset=".45" stop-color="#f4c542"/><stop offset="1" stop-color="#a87410"/></radialGradient></defs>`
      + `<g class="evo-bell-b"><circle cx="12" cy="20.4" r="1.7" fill="#b07a10" stroke="#5e3f05" stroke-width=".5"/>`
      + `<path d="M12 4.4C7.8 4.4 6.6 8 6.4 11.6C6.2 14.6 5.2 16.2 3.6 17.4Q12 20 20.4 17.4C18.8 16.2 17.8 14.6 17.6 11.6C17.4 8 16.2 4.4 12 4.4Z" fill="url(#${id('b')})" stroke="#6e4a05" stroke-width=".6" stroke-linejoin="round"/>`
      + `<path d="M3.6 17.4Q12 20 20.4 17.4V18.5Q12 21.2 3.6 18.5Z" fill="#d9a42a" stroke="#6e4a05" stroke-width=".5" stroke-linejoin="round"/>`
      + `<path d="M9 7.8Q7.9 10.6 7.9 14" fill="none" stroke="#fff" stroke-width=".9" stroke-linecap="round" opacity=".65"/></g>`
      + `<path d="M12 4.6C9.6 2.4 6.8 2.2 7 4.2C7.2 5.6 9.8 5.6 12 4.6ZM12 4.6C14.4 2.4 17.2 2.2 17 4.2C16.8 5.6 14.2 5.6 12 4.6Z" fill="#e23b3b" stroke="#5e0b14" stroke-width=".5" stroke-linejoin="round"/>`
      + `<path d="M11.4 5L9.8 8.2L10.8 7.8L11.2 8.8L12.2 5.2ZM12.6 5L14.2 8.2L13.2 7.8L12.8 8.8L11.8 5.2Z" fill="#c42a2a" stroke="#5e0b14" stroke-width=".4"/><circle cx="12" cy="4.6" r="1.1" fill="#ff6a5c" stroke="#5e0b14" stroke-width=".4"/></svg>`;
  },
  /** Icône du compteur « 12 / 48 » (viewBox 24 × 24) : aplats nets à 16–24 px. */
  giftCounter: (o = {}) => `<svg class="evo evo-counter${o.cls ? ' ' + o.cls : ''}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">`
    + `<g stroke="#5e0b14" stroke-width=".7" stroke-linejoin="round"><rect x="4.4" y="11.8" width="15.2" height="9.6" rx="1" fill="#d42f33"/><rect x="3" y="8.2" width="18" height="4.4" rx="1" fill="#ef4b45"/></g>`
    + `<path d="M10.6 8.2h2.8v13.2h-2.8z" fill="#f4c542" stroke="#8a5a05" stroke-width=".5"/><path d="M4.4 12.6h15.2" stroke="#7a1218" stroke-width=".8" opacity=".55"/>`
    + `<path d="M12 8.2C10.4 5 6.6 3.8 6.4 6.2C6.2 8 9.6 8.6 12 8.2ZM12 8.2C13.6 5 17.4 3.8 17.6 6.2C17.8 8 14.4 8.6 12 8.2Z" fill="#f4c542" stroke="#8a5a05" stroke-width=".6" stroke-linejoin="round"/>`
    + `<circle cx="12" cy="8" r="1.25" fill="#ffd84a" stroke="#8a5a05" stroke-width=".5"/><path d="M5.6 14.2v5" stroke="#ff9d92" stroke-width=".9" stroke-linecap="round"/></svg>`,

  /* Récompenses du calendrier (viewBox 24 × 24, aplats, 20–28 px) */
  /** Points d'expérience : grande étincelle d'or et deux petites. */
  rwXp: (o = {}) => `<svg class="evo evo-rw evo-rw-xp${o.cls ? ' ' + o.cls : ''}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">`
    + `<path d="${evnSpark(10.6, 13, 9)}" fill="#f4c542" stroke="#8a5a05" stroke-width=".7" stroke-linejoin="round"/><path d="${evnSpark(10.6, 13, 4.2)}" fill="#fff3b0"/>`
    + `<path d="${evnSpark(19.4, 5, 3.2)}" fill="#ffd84a" stroke="#8a5a05" stroke-width=".5" stroke-linejoin="round"/><path d="${evnSpark(19.6, 18.8, 2.1)}" fill="#fff6c8" stroke="#8a5a05" stroke-width=".45" stroke-linejoin="round"/></svg>`,
  /** Couleur de classeur : couverture verte, anneaux, ruban rouge en croix, nœud d'or. */
  rwCover: (o = {}) => `<svg class="evo evo-rw evo-rw-cover${o.cls ? ' ' + o.cls : ''}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">`
    + `<rect x="3.6" y="2.6" width="17" height="19" rx="2.2" fill="#1f7a4a" stroke="#0a3a22" stroke-width=".7"/><path d="M3.6 4.8Q3.6 2.6 5.8 2.6H7.4V21.6H5.8Q3.6 21.6 3.6 19.4Z" fill="#135a35"/>`
    + `<g fill="#e8edf5" stroke="#0a3a22" stroke-width=".4"><circle cx="5.5" cy="7" r="1"/><circle cx="5.5" cy="12.1" r="1"/><circle cx="5.5" cy="17.2" r="1"/></g>`
    + `<path d="M13.2 2.6h2.6v19h-2.6zM7.4 11h13.2v2.6H7.4z" fill="#e23b3b" stroke="#6e0f15" stroke-width=".45"/>`
    + `<path d="M14.5 12.3C12.6 9.4 9.8 9.2 10 11.1C10.2 12.6 12.4 12.8 14.5 12.3ZM14.5 12.3C16.4 9.4 19.2 9.2 19 11.1C18.8 12.6 16.6 12.8 14.5 12.3Z" fill="#f4c542" stroke="#8a5a05" stroke-width=".5" stroke-linejoin="round"/>`
    + `<circle cx="14.5" cy="12.3" r="1.1" fill="#ffd84a" stroke="#8a5a05" stroke-width=".45"/><path d="M9 4.4H12" stroke="#7fd0a0" stroke-width=".8" stroke-linecap="round"/></svg>`,
  /** Orbe de Noël : l'orbe de la collection en boule (attache dorée, cinq points de mana, reflet). */
  rwOrb: (o = {}) => `<svg class="evo evo-rw evo-rw-orb${o.cls ? ' ' + o.cls : ''}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">`
    + `<path d="M12 5.4C10.5 5.4 10.5 2.4 12 2.4C13.5 2.4 13.4 4.4 12.7 4.7" fill="none" stroke="#c9a03a" stroke-width=".8" stroke-linecap="round"/>`
    + `<circle cx="12" cy="14.2" r="8.2" fill="#1d2654" stroke="#0b0f22" stroke-width=".7"/><circle cx="12" cy="14.2" r="6.6" fill="none" stroke="#7fb0ff" stroke-width=".6" opacity=".55"/>`
    + ['#f8f0c8', '#3f8fe0', '#a77ae0', '#e5432f', '#2fb35a'].map((c, i) => { const a = (-90 + i * 72) * Math.PI / 180; return `<circle cx="${evoF(12 + Math.cos(a) * 4.1)}" cy="${evoF(14.2 + Math.sin(a) * 4.1)}" r="1.45" fill="${c}"/>`; }).join('')
    + `<path d="M6.6 12.2Q7.6 8.6 10.8 7.6" fill="none" stroke="#fff" stroke-width=".9" stroke-linecap="round" opacity=".75"/>`
    + `<path d="M9.2 5.2H14.8L14.4 7.4H9.6Z" fill="#f4c542" stroke="#8a5a05" stroke-width=".5" stroke-linejoin="round"/></svg>`,
  /** « Le saviez-vous » : ampoule allumée. */
  rwFact: (o = {}) => `<svg class="evo evo-rw evo-rw-fact${o.cls ? ' ' + o.cls : ''}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">`
    + `<path d="M12 .9V2.1M4.2 3.9L5.1 4.8M19.8 3.9L18.9 4.8M2.2 10.2H3.4M21.8 10.2H20.6" stroke="#e0a92a" stroke-width="1" stroke-linecap="round"/>`
    + `<path d="M12 3.4C8.3 3.4 5.9 6.2 5.9 9.5C5.9 12 7.4 13.4 8.6 14.8C9.2 15.6 9.4 16.4 9.4 17.2H14.6C14.6 16.4 14.8 15.6 15.4 14.8C16.6 13.4 18.1 12 18.1 9.5C18.1 6.2 15.7 3.4 12 3.4Z" fill="#ffe27a" stroke="#8a6a12" stroke-width=".7" stroke-linejoin="round"/>`
    + `<path d="M10.6 14.8V12.4C10.6 10.6 13.4 10.6 13.4 12.4V14.8" fill="none" stroke="#c4760a" stroke-width=".6" stroke-linecap="round"/><path d="M11.2 11.2Q12 10.4 12.8 11.2" fill="none" stroke="#fff6c8" stroke-width=".7" stroke-linecap="round"/><path d="M8.4 8.4Q9 6.1 11.2 5.5" fill="none" stroke="#fff" stroke-width=".9" stroke-linecap="round"/>`
    + `<rect x="9.2" y="17.2" width="5.6" height="2.1" rx=".5" fill="#aab4c4" stroke="#4c566a" stroke-width=".5"/><rect x="9.9" y="19.3" width="4.2" height="1.7" rx=".85" fill="#8b95a8" stroke="#4c566a" stroke-width=".5"/></svg>`,
  /** Dos de carte (silhouette, sans logo) : cadre brun, ovale bleu nuit, petite étoile d'or. */
  rwCard: (o = {}) => `<svg class="evo evo-rw evo-rw-card${o.cls ? ' ' + o.cls : ''}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">`
    + `<rect x="5" y="2.4" width="14" height="19.4" rx="1.6" fill="#4a2c1a" stroke="#22120a" stroke-width=".6"/><rect x="6.5" y="3.9" width="11" height="16.4" rx="1" fill="#6e4225"/>`
    + `<ellipse cx="12" cy="12.1" rx="4.3" ry="6.2" fill="#1f3f74" stroke="#d6aa62" stroke-width=".55"/><path d="${evnStar5(12, 12.3, 2.7)}" fill="#f4c542" stroke="#8a5a05" stroke-width=".4" stroke-linejoin="round"/>`
    + `<path d="${evnSpark(18.4, 3.6, 2.4)}" fill="#fff3b0" stroke="#8a5a05" stroke-width=".4" stroke-linejoin="round"/></svg>`,
});

/* ── Noël : ambiance (accueil) ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
   Lueurs rouge, verte et dorée, une aurore pâle qui ondule tout en haut, givre dans les deux coins du haut, sept petites lumières de guirlande qui
   scintillent (or, blanc, rouge, vert). Éléments animés : 2 lueurs + 1 aurore + 7 lumières = 10. */
/** Givre dans un coin (viewBox 100 × 100, coin en haut à gauche) : voile blanc, fougères de glace, petits cristaux. */
function evnFrost() {
  const n = ++EVO_N, B = [[4, 86], [24, 58], [45, 70], [66, 54], [86, 84]];
  return `<svg class="evn-frost-s" viewBox="0 0 100 100" aria-hidden="true" focusable="false"><defs><radialGradient id="evn${n}h" cx="0" cy="0" r="1"><stop offset="0" stop-color="#fff" stop-opacity=".75"/><stop offset=".55" stop-color="#eef6ff" stop-opacity=".22"/><stop offset="1" stop-color="#eef6ff" stop-opacity="0"/></radialGradient></defs>`
    + `<rect width="100" height="100" fill="url(#evn${n}h)"/><path d="${B.map(([a, l]) => evnFern(0, 0, a, l, 9)).join('')}" fill="none" stroke="currentColor" stroke-width=".8" stroke-linecap="round"/>`
    + `<g fill="currentColor">${[[30, 10, 2.4], [12, 34, 2], [44, 30, 1.6], [26, 48, 1.3], [60, 16, 1.5]].map(([x, y, r]) => `<path d="${evnSpark(x, y, r)}"/>`).join('')}</g></svg>`;
}
/** Petite lumière de guirlande (viewBox 20 × 20) : halo et étincelle de couleur c. */
function evnTwinkle(c) {
  const n = ++EVO_N;
  return `<svg viewBox="0 0 20 20" aria-hidden="true" focusable="false"><defs><radialGradient id="evn${n}t"><stop offset="0" stop-color="#fff" stop-opacity=".95"/><stop offset=".3" stop-color="${c}" stop-opacity=".7"/><stop offset="1" stop-color="${c}" stop-opacity="0"/></radialGradient></defs>`
    + `<circle cx="10" cy="10" r="10" fill="url(#evn${n}t)"/><path d="${evnSpark(10, 10, 6)}" fill="#fff" opacity=".9"/></svg>`;
}
EV_AMB.noel = () => '<i class="evn-glow evn-g1"></i><i class="evn-glow evn-g2"></i><i class="evn-glow evn-g3"></i><i class="evn-aur"></i>'
  + `<span class="evn-frost evn-fr1">${evnFrost()}</span><span class="evn-frost evn-fr2">${evnFrost()}</span>`
  + ['#f4c542', '#ffffff', '#ff6a5c', '#5fe07f', '#ffe48a', '#9fd0ff', '#ff6a5c'].map((c, i) => `<span class="evn-tw evn-t${i + 1}">${evnTwinkle(c)}</span>`).join('');

/* Particules de la trouvaille : flocon, étoile d'or, clochette, nœud rouge, sucre d'orge, houx */
EV_FX.noel = () => {
  const fl = evnFlakeD(8.6);
  return [
    EVO_FXS('M12 10.2L13.6 11.1V12.9L12 13.8L10.4 12.9V11.1Z', '#ffffff', `<path d="${fl}" fill="none" stroke="rgba(30,40,80,.5)" stroke-width="3" stroke-linecap="round"/><path d="${fl}" fill="none" stroke="#fff" stroke-width="1.6" stroke-linecap="round"/>`),      // flocon
    EVO_FXS(evnStar5(12, 12.6, 10.4), '#f4c542', `<path d="${evnStar5(11.2, 11.6, 4.6)}" fill="#fff3b0"/>`),      // étoile d'or
    EVO_FXS('M12 3.6C7.6 3.6 6.4 7.4 6.2 11.2C6 14.4 5 16.2 3.4 17.4Q12 20.2 20.6 17.4C19 16.2 18 14.4 17.8 11.2C17.6 7.4 16.4 3.6 12 3.6Z', '#f4c542',
      '<circle cx="12" cy="20.4" r="1.8" fill="#b07a10"/><path d="M8.8 7.4Q7.8 10 7.8 13.6" stroke="#fff" stroke-width="1" stroke-linecap="round" fill="none" opacity=".7"/><circle cx="12" cy="3.4" r="1.6" fill="#e23b3b"/>'),      // clochette
    EVO_FXS('M12 11C9 6.4 3.4 5.4 3.2 9C3 12.4 8.4 12.6 12 11ZM12 11C15 6.4 20.6 5.4 20.8 9C21 12.4 15.6 12.6 12 11Z', '#e23b3b',
      '<path d="M11.2 11.6L8 19.4L10 18.6L10.8 20.6L12.6 12ZM12.8 11.6L16 19.4L14 18.6L13.2 20.6L11.4 12Z" fill="#c42a2a" stroke="rgba(30,10,40,.55)" stroke-width=".7" stroke-linejoin="round"/><circle cx="12" cy="11" r="2" fill="#ff6a5c" stroke="rgba(30,10,40,.55)" stroke-width=".7"/>'),      // nœud rouge
    EVO_FXS('M9.4 21.4V9.4A3.4 3.4 0 0 1 16.2 9.4V11', 'none',
      '<path d="M9.4 21.4V9.4A3.4 3.4 0 0 1 16.2 9.4V11" fill="none" stroke="rgba(30,10,40,.55)" stroke-width="5" stroke-linecap="round"/><path d="M9.4 21.4V9.4A3.4 3.4 0 0 1 16.2 9.4V11" fill="none" stroke="#fff" stroke-width="3.4" stroke-linecap="round"/><path d="M9.4 21.4V9.4A3.4 3.4 0 0 1 16.2 9.4V11" fill="none" stroke="#e23b3b" stroke-width="3.4" stroke-dasharray="1.5 1.7"/>'),      // sucre d'orge
    EVO_FXS(evnLeaf(11, 12, 1.6, 19.6, 3.6), '#2f9e55', `<path d="${evnLeaf(13, 12, 22.4, 19.6, 3.6)}" fill="#1f7a3c" stroke="rgba(30,10,40,.55)" stroke-width=".8" stroke-linejoin="round"/><circle cx="12" cy="10.4" r="2.5" fill="#e23b3b" stroke="rgba(30,10,40,.55)" stroke-width=".7"/><circle cx="9" cy="8.6" r="2.1" fill="#d42f33" stroke="rgba(30,10,40,.55)" stroke-width=".7"/><circle cx="11.2" cy="9.6" r=".7" fill="#fff" opacity=".8"/>`),      // houx
  ];
};

/** Neige sur l'accueil (couche du dessus, comme la pluie de feuilles) : 8 flocons en trois tailles, chacun deux éléments animés (chute, balancement) ;
 *  blanc doux bordé d'un bleu léger : visibles sur fond clair comme sur fond sombre. */
EV_AMB_TOP.noel = () => [1, 2, 3, 4, 5, 6, 7, 8].map(i => `<span class="evn-fl evn-f${i}"><span class="evn-fl-s">${EV_ART.snowflake({ edge: 'rgba(96,140,196,.5)', w: 1.5 })}</span></span>`).join('');

/* ── Guirlande lumineuse (haut de la carte de la fête : event.js la pose en premier enfant de #hmEvent) ──
   Le fil s'étire avec la carte : SVG en preserveAspectRatio="none" (trois festons), trait d'épaisseur fixe (vector-effect). Les ampoules ne s'étirent
   jamais : chacune est un élément HTML placé en % de la largeur (left) et en px de haut (top) sur la courbe du fil, calculée ici (le fil fait 24 px de haut,
   1 unité = 1 px), avec deux petits SVG de proportions fixes : le verre et sa monture, puis la lumière (halo + verre allumé) dont l'opacité scintille.
   Classes : .evn-garland, .evn-wire, .evn-bulb (--i : rang, décale le scintillement ; --r : inclinaison), .evn-bulb-b (verre), .evn-bulb-l (lumière). */
const EVN_BULB = [['#fffbea', '#f3e2a4', '#bfa868', '#ffe9a0'], ['#d6ecff', '#3f8fe0', '#1d4f94', '#6fb4ff'], ['#e6d6ff', '#8a4fd8', '#4a2386', '#b98aff'],
  ['#ffd4ca', '#e5432f', '#9a1a12', '#ff7258'], ['#d8ffd6', '#2fb35a', '#146b31', '#64e388']];
const EVN_GLASS = 'M6 4.2C9 4.6 10.6 8.2 10.4 11.4C10.2 14.4 8.2 16.9 6 17.7C3.8 16.9 1.8 14.4 1.6 11.4C1.4 8.2 3 4.6 6 4.2Z';
function evGarland() {
  const N = 14, sag = 36, out = [];
  for (let k = 0; k < N; k++) {
    const x = 4 + k * 92 / (N - 1), j = Math.min(2, Math.floor(x / (100 / 3))), t = x / (100 / 3) - j, y = 3 + sag * t * (1 - t), c = EVN_BULB[k % 5], n = ++EVO_N;
    const r = (k % 2 ? 1 : -1) * (6 + (k * 7) % 7) + (t - .5) * -24;      // inclinaison : penchée vers le creux du feston, un peu au hasard
    out.push(`<i class="evn-bulb" style="--i:${k};left:${evoF(x)}%;top:${evoF(y - 1.2)}px;--r:${evoF(r)}deg">`
      + `<svg class="evn-bulb-b" viewBox="0 0 12 18" aria-hidden="true" focusable="false"><defs><radialGradient id="evn${n}g" cx=".38" cy=".38" r=".7"><stop offset="0" stop-color="${c[0]}"/><stop offset=".55" stop-color="${c[1]}"/><stop offset="1" stop-color="${c[2]}"/></radialGradient>`
      + `<linearGradient id="evn${n}m" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#6e5a2a"/><stop offset=".4" stop-color="#f2dc92"/><stop offset="1" stop-color="#6e5a2a"/></linearGradient></defs>`
      + `<path d="${EVN_GLASS}" fill="url(#evn${n}g)" stroke="${c[2]}" stroke-width=".5"/><ellipse cx="4.4" cy="8.6" rx="1.1" ry="2.2" transform="rotate(18 4.4 8.6)" fill="#fff" opacity=".7"/>`
      + `<rect x="3.7" y=".4" width="4.6" height="4.4" rx=".9" fill="url(#evn${n}m)" stroke="#4a3a14" stroke-width=".45"/><path d="M3.9 2.1H8.1M3.9 3.4H8.1" stroke="#4a3a14" stroke-width=".35" opacity=".6"/></svg>`
      + `<svg class="evn-bulb-l" viewBox="-6 -2 24 24" aria-hidden="true" focusable="false"><defs><radialGradient id="evn${n}l" cx="6" cy="11.4" r="11" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#fff" stop-opacity=".9"/><stop offset=".22" stop-color="${c[3]}" stop-opacity=".75"/><stop offset="1" stop-color="${c[3]}" stop-opacity="0"/></radialGradient></defs>`
      + `<circle cx="6" cy="11.4" r="11" fill="url(#evn${n}l)"/><path d="${EVN_GLASS}" fill="${c[0]}" opacity=".55"/></svg></i>`);
  }
  const sw = [0, 1, 2].map(j => { const a = j * 100, b = a + 100; return `M${a} 3Q${a + 50} ${3 + sag / 2} ${b} 3`; }).join('');
  return `<div class="evn-garland" aria-hidden="true"><svg class="evn-wire" viewBox="0 0 300 24" preserveAspectRatio="none" aria-hidden="true" focusable="false">`
    + `<path d="${sw}" fill="none" stroke="#173d26" stroke-width="1.6" vector-effect="non-scaling-stroke" stroke-linecap="round"/><path d="${sw}" fill="none" stroke="#3f7a52" stroke-width=".6" vector-effect="non-scaling-stroke" opacity=".8"/></svg>`
    + out.join('') + `</div>`;
}

/* ── Nouvel an ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
   Nuit des étoiles filantes (moteur : evsky.js). Tout est dessiné ici (SVG en couleur, jamais d'emoji ni d'image externe) ; animations :
   css/ev-nouvelan.css (transform / opacity seulement). Teintes « v » : les cinq couleurs du mana dans l'ordre du cercle (0 blanc ivoire et or, 1 bleu,
   2 noir violet de la nuit, 3 rouge, 4 vert) ; v absent : blanc. Lettres « k » : 'W', 'U', 'B', 'R', 'G' (même ordre).
   · shootingStar(o) : étoile filante, l'objet caché (viewBox 64 × 64) : tête à cinq branches à facettes (cœur blanc, halo), traînée effilée qui scintille.
     Parties animées : .evo-glow (halo qui respire), .evo-trail (la traînée miroite), .evo-twinkle (paillettes de la traînée), .evo-rays (version allumée :
     rayons qui tournent). o.v teinte ; o.lit : célébration (halo plus vif, rayons, étincelles) ; o.cls : classes en plus. Lisible à 22–32 px.
   · starCounter(o) : compteur « 12 / 30 » (24 × 24, aplats pour 16–24 px) · comet(o) : comète des messages (24 × 24).
   · constellation(o) : une des 5 constellations du mana (viewBox 60 × 60), six étoiles (positions et ordre d'allumage : EV_CONS) ; o.k lettre, o.lit
     étoiles allumées (0–6), o.done (toutes : traits pleins et lumineux ; implicite à 6). Classes : .evo-cons, .evo-done, .evo-next (prochaine étoile),
     .evo-twinkle (étoiles de la constellation complète), .evo-glow (halo de la constellation complète). Dessinée pour une carte de nuit, vers 56 px.
   · manaOrb(o) : planète de mana brillante, symbole gravé, anneau d'or (64 × 64, « ta couleur de l'année ») ; o.c lettre.
   · fireworks() : feu d'artifice de minuit (balisage HTML, classes .nyf-*), voir sa note.
   · rwSky, rwStar : icônes plates des récompenses (24 × 24, 20–28 px), classe « evo evo-rw ».
   EV_AMB.nouvelan, EV_AMB_TOP.nouvelan, EV_FX.nouvelan : ambiance de nuit, paillettes d'or de l'accueil, particules. */
const EVY_K = ['W', 'U', 'B', 'R', 'G'];
const evyV = v => (Number(v) >= 0 && Number(v) <= 4 ? Math.floor(Number(v)) : 0);
/* Teintes du mana : [cœur, clair, moyen, foncé, contour, lueur] */
const EVY_MANA = [
  ['#fffef4', '#fff1b8', '#f2c230', '#c18a14', '#6e4a05', '#ffe38a'],      // blanc : ivoire et or
  ['#f2faff', '#bfe2ff', '#4ea2f2', '#1f5fc2', '#0b2a66', '#7cc4ff'],      // bleu
  ['#f6efff', '#d6bfff', '#8a5ad6', '#3b2070', '#140828', '#b98aff'],      // noir : violet de la nuit, contour presque noir
  ['#fff4ee', '#ffc4ae', '#ff6a45', '#c8301c', '#5a0e06', '#ff8a66'],      // rouge
  ['#f0fff4', '#bff5cf', '#3fcf7a', '#18904a', '#06401f', '#6ff0a0'],      // vert
];
/** Soleil du blanc (60 × 60) : disque, cinq longs rayons (vers les étoiles de la constellation) et cinq courts. */
function evySunD(cx = 30, cy = 30, rd = 8.4) {
  const f = evoF; let d = `M${f(cx - rd)} ${cy}A${rd} ${rd} 0 1 0 ${f(cx + rd)} ${cy}A${rd} ${rd} 0 1 0 ${f(cx - rd)} ${cy}Z`;
  for (let i = 0; i < 10; i++) {
    const a = (-90 + i * 36) * Math.PI / 180, r0 = rd + 2.4, r1 = i % 2 ? rd + 7.4 : rd + 12.2, w = i % 2 ? .2 : .17, P = (b, r) => f(cx + Math.cos(b) * r) + ' ' + f(cy + Math.sin(b) * r);
    d += `M${P(a - w, r0)}L${P(a, r1)}L${P(a + w, r0)}Z`;
  }
  return d;
}
/* Symboles du mana (60 × 60, règle evenodd) : silhouettes des constellations, gravures des orbes */
const EVY_FIG = {
  W: evySunD(),
  U: 'M30 7C34 15 45 26 45 38C45 46.5 38.5 52.5 30 52.5C21.5 52.5 15 46.5 15 38C15 26 26 15 30 7Z',
  B: 'M30 10.6C40.6 10.6 47.2 17.4 47.2 26.6C47.2 32 44.8 35.6 41.2 37.8V43.6C41.2 45.2 40 46.4 38.4 46.4H21.6C20 46.4 18.8 45.2 18.8 43.6V37.8C15.2 35.6 12.8 32 12.8 26.6C12.8 17.4 19.4 10.6 30 10.6Z'
    + 'M19.4 28A4.6 5 0 1 0 28.6 28A4.6 5 0 1 0 19.4 28ZM31.4 28A4.6 5 0 1 0 40.6 28A4.6 5 0 1 0 31.4 28ZM30 33L27.8 37.4H32.2Z'
    + 'M24.6 40.8H25.8V46.4H24.6ZM29.4 40.8H30.6V46.4H29.4ZM34.2 40.8H35.4V46.4H34.2Z',
  R: 'M33 6C35 14 44 18 44.6 29.5C45.2 40 39.2 51.6 30 51.6C20.8 51.6 15.6 44.2 15.6 37C15.6 30.4 19 26.4 20.4 21C22.6 24.6 24.6 26.4 26.2 27.2C25.4 19.6 28.6 12.4 33 6Z'
    + 'M30 47.6C26 47.6 23.6 44.6 23.6 41.2C23.6 37.6 26 35.6 27.4 32.6C28.8 35.4 31 36.4 32.2 38.6C33.6 37.6 34.4 36 34.6 34.4C36.2 36.6 36.6 39 36.6 41.2C36.6 44.8 34 47.6 30 47.6Z',
  G: 'M30 9C35.4 9 38.6 11.4 40 14.4C44.8 14.4 48.6 17.8 48.6 22.6C48.6 24.6 47.8 26.4 46.6 27.8C48 29.4 48.4 31.6 47.6 33.6C46.4 36.6 43 38 39.8 37C38 39.4 34.8 40 32.2 38.8V47.2C32.2 49.6 34 51.2 37.6 52.4H22.4C26 51.2 27.8 49.6 27.8 47.2V38.8C25.2 40 22 39.4 20.2 37C17 38 13.6 36.6 12.4 33.6C11.6 31.6 12 29.4 13.4 27.8C12.2 26.4 11.4 24.6 11.4 22.6C11.4 17.8 15.2 14.4 20 14.4C21.4 11.4 24.6 9 30 9Z',
};
/* Constellations (viewBox 60 × 60) : six étoiles chacune, dans l'ordre d'allumage (l'étoile i s'allume quand i étoiles de cette constellation sont trouvées).
   Soleil : le cœur, puis les cinq rayons ; goutte, crâne, flamme : le contour depuis le haut, dans le sens des aiguilles d'une montre ; arbre : du pied du tronc
   jusqu'au houppier. */
const EV_CONS = {
  W: [[30, 30], [30, 8], [50.9, 23.2], [42.9, 47.8], [17.1, 47.8], [9.1, 23.2]],
  U: [[30, 5], [41, 22], [46.4, 38], [30, 54.4], [13.6, 38], [19, 22]],
  B: [[19, 10], [41, 10], [49.4, 27], [40.4, 46.6], [19.6, 46.6], [10.6, 27]],
  R: [[33.6, 4.4], [46.4, 21], [45.6, 42], [30, 54.4], [14.4, 41], [19.4, 18.4]],
  G: [[30, 54.4], [30, 38.6], [12.4, 29.6], [19.4, 11.6], [40.6, 11.6], [47.6, 29.6]],
};
/* Traits : [étoile a, étoile b, courbure (vers l'extérieur du contour quand il tourne dans le sens des aiguilles d'une montre ; négative : creusée)] */
const EVY_EDGE = {
  W: [[0, 1, 0], [0, 2, 0], [0, 3, 0], [0, 4, 0], [0, 5, 0]],
  U: [[0, 1, .8], [1, 2, 1.6], [2, 3, 4.6], [3, 4, 4.6], [4, 5, 1.6], [5, 0, .8]],
  B: [[0, 1, 4.4], [1, 2, 2.6], [2, 3, .6], [3, 4, 0], [4, 5, .6], [5, 0, 2.6]],
  R: [[0, 1, -2.6], [1, 2, 3], [2, 3, 4], [3, 4, 4], [4, 5, 1.6], [5, 0, -3.4]],
  G: [[0, 1, 0], [1, 2, 1.4], [1, 5, -1.4], [1, 3, 0], [1, 4, 0], [2, 3, 4.6], [3, 4, 5.4], [4, 5, 4.6]],
};
/** Trait entre deux étoiles, un peu en retrait de chacune (cartes du ciel) ; courbure bu en unités. */
function evySeg(P, [a, b, bu]) {
  const f = evoF, [ax, ay] = P[a], [bx, by] = P[b], dx = bx - ax, dy = by - ay, L = Math.hypot(dx, dy), g = 3.6;
  const qx = (ax + bx) / 2 + bu * dy / L, qy = (ay + by) / 2 - bu * dx / L;
  const to = (x, y) => { const l = Math.hypot(qx - x, qy - y); return [x + (qx - x) * g / l, y + (qy - y) * g / l]; };
  const [sx, sy] = to(ax, ay), [ex, ey] = to(bx, by);
  return bu ? `M${f(sx)} ${f(sy)}Q${f(qx)} ${f(qy)} ${f(ex)} ${f(ey)}` : `M${f(sx)} ${f(sy)}L${f(ex)} ${f(ey)}`;
}
/* Orbes de mana : [reflet, clair, moyen, foncé, ombre] */
const EVY_ORB = [['#ffffff', '#fff3c6', '#e9c766', '#a87c22', '#4a3408'], ['#ffffff', '#bfe2ff', '#3f8fe0', '#16469c', '#071a45'], ['#f4ecff', '#b597e6', '#5a3796', '#24113f', '#0a0416'],
  ['#ffffff', '#ffc0ac', '#ee4b2e', '#9c1a0c', '#3e0703'], ['#ffffff', '#bff2cf', '#33b866', '#136b37', '#042812']];

Object.assign(EV_ART, {
  /** Étoile filante (viewBox 64 × 64), teinte o.v (0–4 : blanc, bleu, noir, rouge, vert ; sinon blanc) ; o.lit : célébration. */
  shootingStar: (o = {}) => {
    const n = ++EVO_N, id = s => `evo${n}${s}`, lit = !!o.lit, c = EVY_MANA[evyV(o.v)], f = evoF, hx = 39.6, hy = 24.4, R = 16;
    const T = (x, y) => [hx + .7071 * (x + y), hy + .7071 * (y - x)];      // repère de la traînée (x vers la queue, négatif) → page
    const P = i => { const a = (-90 + 8 + i * 36) * Math.PI / 180, l = i % 2 ? R * .49 : R; return f(hx + Math.cos(a) * l) + ' ' + f(hy + Math.sin(a) * l); };
    let lt = '', dk = '', rg = '';
    for (let k = 0; k < 5; k++) { lt += `M${hx} ${hy}L${P(2 * k)}L${P((2 * k + 9) % 10)}Z`; dk += `M${hx} ${hy}L${P(2 * k)}L${P(2 * k + 1)}Z`; rg += `M${hx} ${hy}L${P(2 * k)}`; }
    const spk = (x, y, r) => { const [a, b] = T(x, y); return `<path d="${evnSpark(a, b, r)}"/>`; };
    const dot = (x, y, r) => { const [a, b] = T(x, y); return `<circle cx="${f(a)}" cy="${f(b)}" r="${r}"/>`; };
    return `<svg class="evo evo-shoot${lit ? ' evo-lit' : ''}${o.cls ? ' ' + o.cls : ''}" viewBox="0 0 64 64" aria-hidden="true" focusable="false"><defs>`
      + `<radialGradient id="${id('g')}" cx="${hx}" cy="${hy}" r="24" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#fff" stop-opacity="${lit ? .95 : .8}"/><stop offset=".3" stop-color="${c[5]}" stop-opacity="${lit ? .7 : .5}"/><stop offset="1" stop-color="${c[5]}" stop-opacity="0"/></radialGradient>`
      + (lit ? `<linearGradient id="${id('y')}" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#fff" stop-opacity=".9"/><stop offset="1" stop-color="${c[5]}" stop-opacity="0"/></linearGradient>` : '')
      + `<linearGradient id="${id('t')}" x1="0" y1="0" x2="-54" y2="0" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="${c[5]}" stop-opacity=".7"/><stop offset="1" stop-color="${c[5]}" stop-opacity="0"/></linearGradient>`
      + `<linearGradient id="${id('m')}" x1="0" y1="0" x2="-48" y2="0" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="${c[1]}"/><stop offset=".3" stop-color="${c[2]}" stop-opacity=".9"/><stop offset="1" stop-color="${c[3]}" stop-opacity="0"/></linearGradient>`
      + `<linearGradient id="${id('k')}" x1="0" y1="0" x2="-36" y2="0" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>`
      + `<linearGradient id="${id('a')}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c[0]}"/><stop offset=".55" stop-color="${c[1]}"/><stop offset="1" stop-color="${c[2]}"/></linearGradient>`
      + `<linearGradient id="${id('b')}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c[2]}"/><stop offset=".6" stop-color="${c[3]}"/><stop offset="1" stop-color="${c[4]}"/></linearGradient>`
      + `<radialGradient id="${id('c')}"><stop offset="0" stop-color="#fff"/><stop offset=".5" stop-color="#fff" stop-opacity=".75"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient></defs>`
      + `<circle class="evo-glow" cx="${hx}" cy="${hy}" r="24" fill="url(#${id('g')})"/>` + (lit ? evnRays(id('y'), hx, hy, 29) : '')
      + `<g class="evo-trail"><g transform="translate(${hx} ${hy}) rotate(-45)">`
      + `<path d="M2-11C-12-9.8-28-5-50 0C-28 5-12 9.8 2 11Z" fill="url(#${id('t')})"/>`
      + `<path d="M1-7.6C-12-6.6-26-3.2-45 0C-26 3.2-12 6.6 1 7.6Z" fill="url(#${id('m')})"/>`
      + `<path d="M0-3C-10-2.6-22-1.2-34 0C-22 1.2-10 2.6 0 3Z" fill="url(#${id('k')})"/>`
      + `<path d="M-8-7.6Q-22-7.2-40-9.4M-9 7.4Q-23 7.2-34 9.6" fill="none" stroke="url(#${id('m')})" stroke-width=".9" stroke-linecap="round"/></g>`
      + `<g fill="#fff" opacity=".85">${dot(-26, -1.6, .8)}${dot(-34, 2.8, .65)}${dot(-43, -1, .55)}${dot(-19, 4.4, .65)}${dot(-48, 3.4, .45)}</g></g>`
      + `<g class="evo-twinkle" fill="#fff">${spk(-21, -8.6, 2.8)}${spk(-31, 7.4, 2.1)}${spk(-41, -5, 1.6)}</g>`
      + `<path d="${lt}" fill="url(#${id('a')})"/><path d="${dk}" fill="url(#${id('b')})"/>`
      + `<path d="M${P(0)}L${Array.from({ length: 9 }, (_, i) => P(i + 1)).join('L')}Z" fill="none" stroke="${c[4]}" stroke-width=".9" stroke-linejoin="round"/>`
      + `<path d="${rg}" stroke="#fff" stroke-width=".5" opacity=".65"/>`
      + `<circle cx="${hx}" cy="${hy}" r="5.4" fill="url(#${id('c')})"/><path d="${evnSpark(hx - 5, hy - 8, 2.4)}" fill="#fff" opacity=".95"/>`
      + (lit ? `<g class="evo-spk evo-twinkle" fill="#fff8d6">${[[59, 6, 2.8], [61, 38, 2.2], [20, 5, 2.4], [7, 38, 1.8], [30, 59, 1.6]].map(([x, y, r]) => `<path d="${evnSpark(x, y, r)}"/>`).join('')}</g>` : '')
      + `</svg>`;
  },
  /** Icône du compteur « 12 / 30 » (viewBox 24 × 24) : étoile d'or et sa traînée, aplats nets à 16–24 px. */
  starCounter: (o = {}) => `<svg class="evo evo-counter${o.cls ? ' ' + o.cls : ''}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">`
    + `<path d="M11.4 11.2L14 13.8L3.6 22.2Q2 23 2.6 21.4Z" fill="#ff7cb6" stroke="#8a1d52" stroke-width=".5" stroke-linejoin="round"/>`
    + `<path d="M9.4 9.4L2.4 15.2M16.6 15.6L11.6 21.4" stroke="#6f78ff" stroke-width="1.5" stroke-linecap="round"/>`
    + `<path d="${evnStar5(14.6, 9.4, 8.4, .46)}" fill="#f2c230" stroke="#7a5205" stroke-width=".8" stroke-linejoin="round"/>`
    + `<path d="${evnStar5(13.9, 8.6, 3.6, .5)}" fill="#fff3b0"/><circle cx="4.2" cy="11.4" r="1" fill="#f2c230"/></svg>`,
  /** Comète des messages (viewBox 24 × 24) : tête d'or blanc, chevelure dorée et rose. */
  comet: (o = {}) => {
    const n = ++EVO_N, id = s => `evo${n}${s}`;
    return `<svg class="evo evo-comet${o.cls ? ' ' + o.cls : ''}" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><defs>`
      + `<linearGradient id="${id('t')}" x1="1" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffe17a"/><stop offset=".5" stop-color="#ff8cc0" stop-opacity=".8"/><stop offset="1" stop-color="#ff5fa2" stop-opacity="0"/></linearGradient>`
      + `<radialGradient id="${id('h')}"><stop offset="0" stop-color="#fff"/><stop offset=".45" stop-color="#fff3b0"/><stop offset=".75" stop-color="#f2c230" stop-opacity=".7"/><stop offset="1" stop-color="#f2c230" stop-opacity="0"/></radialGradient></defs>`
      + `<path d="M14.6 6C9 9.4 5 14.6 1.6 22.4C6.4 17 11.6 13.4 18 9.6Z" fill="url(#${id('t')})"/>`
      + `<path d="M13.6 4.6Q8 7.6 3.2 13.4M19.4 10.6Q14 14 10 19.4" fill="none" stroke="url(#${id('t')})" stroke-width="1.1" stroke-linecap="round"/>`
      + `<circle cx="17.2" cy="6.8" r="6.4" fill="url(#${id('h')})"/><circle cx="17.2" cy="6.8" r="2.6" fill="#fff" stroke="#f2c230" stroke-width=".7"/>`
      + `<path d="${evnSpark(6.6, 4.6, 1.8)}${evnSpark(21.6, 17.2, 1.4)}" fill="#fff3b0"/></svg>`;
  },
  /** Constellation du mana (viewBox 60 × 60) : o.k lettre, o.lit étoiles allumées (0–6), o.done (complète). */
  constellation: (o = {}) => {
    const k = EVY_K.includes(o.k) ? o.k : 'W', c = EVY_MANA[EVY_K.indexOf(k)], P = EV_CONS[k], n = ++EVO_N, id = s => `evo${n}${s}`, f = evoF;
    const lit = Math.max(0, Math.min(6, Math.floor(Number(o.lit) || 0))), done = !!o.done || lit >= 6;
    const segs = EVY_EDGE[k], on = e => e[0] < lit && e[1] < lit;
    const lines = done ? `<g fill="none" stroke-linecap="round"><path d="${segs.map(e => evySeg(P, e)).join('')}" stroke="${c[5]}" stroke-width="3.4" opacity=".28"/>`
        + `<path d="${segs.map(e => evySeg(P, e)).join('')}" stroke="${c[1]}" stroke-width="1.1"/></g>`
      : `<g fill="none" stroke-linecap="round"><path d="${segs.filter(e => !on(e)).map(e => evySeg(P, e)).join('')}" stroke="#c9ccff" stroke-width=".85" stroke-dasharray="1.3 2.3" opacity=".48"/>`
        + `<path d="${segs.filter(on).map(e => evySeg(P, e)).join('')}" stroke="${c[1]}" stroke-width=".95" stroke-dasharray="2.6 1.8" opacity=".8"/></g>`;
    const L = P.slice(0, lit), U = P.slice(lit);
    return `<svg class="evo evo-cons evo-cons-${k}${done ? ' evo-done' : ''}${o.cls ? ' ' + o.cls : ''}" viewBox="0 0 60 60" aria-hidden="true" focusable="false"><defs>`
      + `<radialGradient id="${id('h')}"><stop offset="0" stop-color="${c[5]}" stop-opacity=".85"/><stop offset=".45" stop-color="${c[5]}" stop-opacity=".3"/><stop offset="1" stop-color="${c[5]}" stop-opacity="0"/></radialGradient>`
      + (done ? `<radialGradient id="${id('g')}" cx="30" cy="30" r="31" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="${c[5]}" stop-opacity=".34"/><stop offset="1" stop-color="${c[5]}" stop-opacity="0"/></radialGradient>` : '') + `</defs>`
      + (done ? `<circle class="evo-glow" cx="30" cy="30" r="31" fill="url(#${id('g')})"/>` : '')
      + `<path class="evo-fig" d="${EVY_FIG[k]}" fill="${c[5]}" fill-rule="evenodd" opacity="${done ? .2 : evoF(.07 + lit * .012)}"/>` + lines
      + `<g fill="rgba(190,196,255,.1)" stroke="#c9ccff" stroke-width=".7" stroke-opacity=".55">${U.map(([x, y], i) => `<circle${i ? '' : ' class="evo-next"'} cx="${x}" cy="${y}" r="1.9"/>`).join('')}</g>`
      + `<g fill="url(#${id('h')})">${L.map(([x, y]) => `<circle cx="${x}" cy="${y}" r="${done ? 7.2 : 6.2}"/>`).join('')}</g>`
      + `<g${done ? ' class="evo-twinkle"' : ''} fill="#fff" opacity=".92">${L.map(([x, y], i) => `<path d="${evnSpark(x, y, done ? (i % 2 ? 4.4 : 5.4) : 4.2)}"/>`).join('')}</g>`
      + L.map(([x, y]) => `<circle cx="${x}" cy="${y}" r="2.2" fill="${c[1]}"/><circle cx="${x}" cy="${y}" r="1.25" fill="#fff"/>`).join('')
      + `</svg>`;
  },
  /** Planète de mana (viewBox 64 × 64) : sphère brillante de la couleur o.c ('W'…'G'), symbole gravé, anneau d'or incliné. */
  manaOrb: (o = {}) => {
    const k = EVY_K.includes(o.c) ? o.c : 'W', c = EVY_ORB[EVY_K.indexOf(k)], g = EVY_MANA[EVY_K.indexOf(k)], n = ++EVO_N, id = s => `evo${n}${s}`, s = .64, tx = evoF(32 - 30 * s), ty = evoF(33 - 30 * s);
    const ring = (sweep, w, op) => `<path d="M8.6 33A23.4 6.6 0 0 ${sweep} 55.4 33" transform="rotate(-16 32 33)" fill="none" stroke="url(#${id('r')})" stroke-width="${w}" opacity="${op}"/>`;
    return `<svg class="evo evo-orb${o.cls ? ' ' + o.cls : ''}" viewBox="0 0 64 64" aria-hidden="true" focusable="false"><defs>`
      + `<radialGradient id="${id('g')}" cx="32" cy="33" r="31" gradientUnits="userSpaceOnUse"><stop offset=".55" stop-color="${g[5]}" stop-opacity=".45"/><stop offset="1" stop-color="${g[5]}" stop-opacity="0"/></radialGradient>`
      + `<radialGradient id="${id('s')}" cx=".36" cy=".3" r=".78" fx=".3" fy=".24"><stop offset="0" stop-color="${c[0]}"/><stop offset=".18" stop-color="${c[1]}"/><stop offset=".55" stop-color="${c[2]}"/><stop offset=".86" stop-color="${c[3]}"/><stop offset="1" stop-color="${c[4]}"/></radialGradient>`
      + `<radialGradient id="${id('d')}" cx=".7" cy=".78" r=".7"><stop offset="0" stop-color="#000" stop-opacity=".38"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient>`
      + `<radialGradient id="${id('h')}"><stop offset="0" stop-color="#fff" stop-opacity=".95"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>`
      + `<linearGradient id="${id('r')}" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#8a5e0c"/><stop offset=".3" stop-color="#ffe9a0"/><stop offset=".55" stop-color="#f2c230"/><stop offset="1" stop-color="#7a5205"/></linearGradient>`
      + `<clipPath id="${id('c')}"><circle cx="32" cy="33" r="21.4"/></clipPath></defs>`
      + `<circle class="evo-glow" cx="32" cy="33" r="31" fill="url(#${id('g')})"/>` + ring(1, 1.8, .9)
      + `<circle cx="32" cy="33" r="21.4" fill="url(#${id('s')})"/>`
      + `<g clip-path="url(#${id('c')})"><path d="M8 40Q32 47 56 38" fill="none" stroke="#fff" stroke-width="2.2" opacity=".1"/><path d="M8 26Q30 31 56 24" fill="none" stroke="#000" stroke-width="1.6" opacity=".08"/>`
      + `<g transform="translate(${tx} ${ty}) scale(${s})" fill-rule="evenodd"><path d="${EVY_FIG[k]}" transform="translate(0 1.2)" fill="#fff" opacity=".32"/><path d="${EVY_FIG[k]}" fill="${c[4]}" opacity=".42"/></g>`
      + `<circle cx="32" cy="33" r="21.4" fill="url(#${id('d')})"/></g>`
      + `<circle cx="32" cy="33" r="21" fill="none" stroke="${c[1]}" stroke-width=".9" opacity=".55"/><circle cx="32" cy="33" r="21.4" fill="none" stroke="${c[4]}" stroke-width=".6" opacity=".7"/>`
      + `<ellipse cx="24.4" cy="22.6" rx="7.4" ry="4.4" transform="rotate(-34 24.4 22.6)" fill="url(#${id('h')})" opacity=".85"/><circle cx="19.6" cy="30.6" r="1.1" fill="#fff" opacity=".6"/>`
      + ring(0, 2, 1) + `<path d="M12.2 37.6A23.4 6.6 0 0 0 30 42.4" transform="rotate(-16 32 33)" fill="none" stroke="#fff6cf" stroke-width=".6" opacity=".7"/>`
      + `<circle cx="53.6" cy="27.2" r="2.1" fill="${c[1]}" stroke="${c[3]}" stroke-width=".5"/><path d="${evnSpark(13, 13, 2.6)}${evnSpark(52, 52, 1.8)}" fill="#fff6cc"/></svg>`;
  },

  /* Récompenses de la nuit des étoiles filantes (viewBox 24 × 24, aplats, 20–28 px) */
  /** Constellation : cinq étoiles d'or reliées. */
  rwSky: (o = {}) => `<svg class="evo evo-rw evo-rw-sky${o.cls ? ' ' + o.cls : ''}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">`
    + `<path d="M3.6 16.4L8.4 10.8L13.4 12.8L18.6 6.4M13.4 12.8L19.6 18.2" fill="none" stroke="#6f78ff" stroke-width="1.1" stroke-linecap="round" stroke-dasharray="1.6 1.4"/>`
    + `<g fill="#f2c230" stroke="#7a5205" stroke-width=".45" stroke-linejoin="round"><path d="${evnSpark(3.6, 16.4, 2.6)}"/><path d="${evnSpark(8.4, 10.8, 2.9)}"/><path d="${evnSpark(13.4, 12.8, 2.6)}"/><path d="${evnSpark(19.6, 18.2, 2.5)}"/>`
    + `<path d="${evnStar5(18.6, 6.4, 5, .46)}"/></g><path d="${evnStar5(18.2, 5.9, 2, .5)}" fill="#fff3b0"/><circle cx="8.4" cy="10.8" r=".8" fill="#fff6cc"/></svg>`,
  /** Étoile d'or : grande étoile, petite étoile rose, étincelle. */
  rwStar: (o = {}) => `<svg class="evo evo-rw evo-rw-star${o.cls ? ' ' + o.cls : ''}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">`
    + `<path d="${evnStar5(10.6, 13.4, 9.6, .47)}" fill="#f2c230" stroke="#7a5205" stroke-width=".7" stroke-linejoin="round"/><path d="${evnStar5(9.8, 12.4, 4.2, .5)}" fill="#fff3b0"/>`
    + `<path d="${evnStar5(19.6, 5, 3.4, .46)}" fill="#ff5fa2" stroke="#8a1d52" stroke-width=".5" stroke-linejoin="round"/>`
    + `<path d="${evnSpark(20.4, 18.6, 2.4)}" fill="#bfe2ff" stroke="#3b3fd8" stroke-width=".45" stroke-linejoin="round"/></svg>`,
});

/* ── Nouvel an : feu d'artifice de minuit (EV_ART.fireworks) ────────────────────────────────────────────────────────────────────────────────
   Balisage HTML posé par le moteur dans <div class="sky-fw-art" aria-hidden="true"> : un bouquet par couleur du mana, qui éclatent l'un après l'autre
   (cycle de 7 s), chacun avec sa fusée qui monte (.nyf-r), son éclair (.nyf-f) et sa gerbe (.nyf-x, SVG : rayons en larmes, perles au bout, couronne
   intérieure) ; huit paillettes d'or qui tombent (.nyf-s). Placement en % de la zone (--s : taille relative, --d : décalage) ; styles et animations :
   css/ev-nouvelan.css (transform / opacity seulement, 23 éléments animés). « Réduire les animations » : les cinq gerbes posées, immobiles. */
/* gerbes : [teinte, gauche %, haut %, taille, décalage s] */
const EVY_FWB = [[0, 50, 21, 1.08, .2], [1, 21, 34, .78, 1.4], [3, 79, 30, .86, 2.4], [4, 26, 63, .66, 3.6], [2, 75, 59, .72, 4.8]];
function evyBurst(c, k = 0) {
  const n = ++EVO_N, f = evoF, J = i => ((i * 37 + k * 11) % 9) / 9;      // petit écart régulier d'un rayon à l'autre (jamais deux gerbes pareilles)
  let rays = '', tips = '', halo = '', inner = '', dust = '';
  for (let i = 0; i < 18; i++) {
    const a = (i * 20 + 4 + k * 7 + J(i) * 6) * Math.PI / 180, r1 = (i % 2 ? 31 : 40) + J(i + 3) * 5, cs = Math.cos(a), sn = Math.sin(a), Q = (r, w) => f(cs * r - sn * w) + ' ' + f(sn * r + cs * w);
    rays += `M${Q(7, 0)}Q${Q(r1 * .72, 1.6)} ${Q(r1, 0)}Q${Q(r1 * .72, -1.6)} ${Q(7, 0)}Z`;
    const tx = f(cs * (r1 + 2.4)), ty = f(sn * (r1 + 2.4)), r = i % 2 ? 1.25 : 1.7;
    tips += `<circle cx="${tx}" cy="${ty}" r="${r}"/>`; halo += `<circle cx="${tx}" cy="${ty}" r="${f(r * 2.1)}"/>`;
  }
  for (let i = 0; i < 10; i++) { const a = (i * 36 + 14 + k * 5) * Math.PI / 180; inner += `M${f(Math.cos(a) * 11)} ${f(Math.sin(a) * 11)}L${f(Math.cos(a) * 18)} ${f(Math.sin(a) * 18)}`; }
  for (let i = 0; i < 16; i++) { const a = (i * 47 + k * 23) * Math.PI / 180, r = 15 + ((i * 53 + k * 7) % 25); dust += `<circle cx="${f(Math.cos(a) * r)}" cy="${f(Math.sin(a) * r)}" r="${f(.55 + (i % 3) * .25)}"/>`; }
  return `<svg viewBox="-50 -50 100 100" aria-hidden="true" focusable="false"><defs><radialGradient id="nyf${n}" cx="0" cy="0" r="44" gradientUnits="userSpaceOnUse">`
    + `<stop offset=".12" stop-color="#fff"/><stop offset=".4" stop-color="${c[1]}"/><stop offset=".8" stop-color="${c[2]}"/><stop offset="1" stop-color="${c[5]}"/></radialGradient>`
    + `<radialGradient id="nyf${n}h"><stop offset="0" stop-color="${c[5]}" stop-opacity=".5"/><stop offset="1" stop-color="${c[5]}" stop-opacity="0"/></radialGradient></defs>`
    + `<circle r="48" fill="url(#nyf${n}h)" opacity=".5"/><path d="${rays}" fill="url(#nyf${n})"/>`
    + `<g fill="${c[5]}" opacity=".28">${halo}</g><g fill="${c[0]}">${tips}</g><g fill="${c[1]}" opacity=".85">${dust}</g>`
    + `<path d="${inner}" stroke="#fff6cc" stroke-width="1.4" stroke-linecap="round" opacity=".85"/><circle r="9" fill="url(#nyf${n}h)"/><circle r="3.6" fill="#fff"/></svg>`;
}
EV_ART.fireworks = () => {
  const S = [[8, 0, 6.5, .9, 58], [19, 3.1, 8.2, .7, 80], [33, 1.2, 7, 1, 46], [47, 4.4, 9, .8, 86], [60, 2.2, 6.8, .9, 40], [71, 5.3, 8.6, .7, 78], [84, .6, 7.6, 1, 50], [93, 3.8, 9.4, .8, 88]];      // [gauche %, décalage s, durée s, taille, haut % (immobile)]
  return `<div class="nyf" aria-hidden="true">`
    + EVY_FWB.map(([v, x, y, s, d], i) => `<div class="nyf-b nyf-b${i + 1}" style="left:${x}%;top:${y}%;--s:${s};--d:${d}s"><i class="nyf-r" style="--c:${EVY_MANA[v][5]}"></i><i class="nyf-f" style="--c:${EVY_MANA[v][5]}"></i><span class="nyf-x">${evyBurst(EVY_MANA[v], i)}</span></div>`).join('')
    + S.map(([x, d, t, k, y], i) => `<span class="nyf-s" style="left:${x}%;--d:${d}s;--t:${t}s;--k:${k};--y:${y}%"><svg viewBox="0 0 12 12" aria-hidden="true" focusable="false"><path d="${evnSpark(6, 6, 5.6)}" fill="${i % 3 === 1 ? '#ffd0e6' : '#ffe9a0'}"/><path d="${evnSpark(6, 6, 2.2)}" fill="#fff"/></svg></span>`).join('')
    + `</div>`;
};

/* ── Nouvel an : ambiance (accueil) ────────────────────────────────────────────────────────────────────────────────────────────────────────
   Ciel de nuit : champ d'étoiles fixe (css), lueurs bleu nuit, rose et or, une nébuleuse pâle qui ondule tout en haut, six étoiles qui scintillent, trois
   étoiles filantes qui traversent de loin en loin. Éléments animés : 2 lueurs + 1 nébuleuse + 6 étoiles + 3 étoiles filantes = 12. */
/** Étoile filante de l'ambiance (viewBox 160 × 16, tête à droite) : traînée et halo de la couleur du texte (currentColor), cœur blanc. */
function evySS() {
  const n = ++EVO_N;
  return `<svg viewBox="0 0 160 16" aria-hidden="true" focusable="false"><defs><linearGradient id="evy${n}s" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="currentColor" stop-opacity="0"/><stop offset=".8" stop-color="currentColor" stop-opacity=".7"/><stop offset="1" stop-color="#fff"/></linearGradient>`
    + `<radialGradient id="evy${n}h"><stop offset="0" stop-color="#fff"/><stop offset=".3" stop-color="currentColor" stop-opacity=".6"/><stop offset="1" stop-color="currentColor" stop-opacity="0"/></radialGradient></defs>`
    + `<path d="M0 8L148 6.2Q151.6 8 148 9.8Z" fill="url(#evy${n}s)"/><circle cx="150" cy="8" r="8" fill="url(#evy${n}h)"/><path d="${evnSpark(150, 8, 5)}" fill="#fff"/></svg>`;
}
EV_AMB.nouvelan = () => '<i class="evy-sky"></i><i class="evy-glow evy-g1"></i><i class="evy-glow evy-g2"></i><i class="evy-glow evy-g3"></i><i class="evy-neb"></i>'
  + ['#f2c230', '#ffffff', '#ff7cb6', '#9fb0ff', '#ffe48a', '#ffffff'].map((c, i) => `<span class="evy-tw evy-t${i + 1}">${evnTwinkle(c)}</span>`).join('')
  + [1, 2, 3].map(i => `<span class="evy-ss evy-s${i}">${evySS()}</span>`).join('');

/* Particules de la trouvaille : étoile d'or, étincelle, ruban de confetti, petit bouquet, bulles de champagne, comète */
EV_FX.nouvelan = () => {
  const f = evoF; let fw = '', tip = '';
  for (let i = 0; i < 8; i++) { const a = (i * 45 + 22.5) * Math.PI / 180, c = ['#f2c230', '#ff5fa2', '#7cc4ff', '#fff6cc'][i % 4]; fw += `<path d="M${f(12 + Math.cos(a) * 3.6)} ${f(12 + Math.sin(a) * 3.6)}L${f(12 + Math.cos(a) * 9)} ${f(12 + Math.sin(a) * 9)}" stroke="${c}" stroke-width="1.6" stroke-linecap="round"/>`; tip += `M${f(12 + Math.cos(a) * 3.6)} ${f(12 + Math.sin(a) * 3.6)}L${f(12 + Math.cos(a) * 9)} ${f(12 + Math.sin(a) * 9)}`; }
  const bub = ([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="#fff4cc" stroke="rgba(30,10,40,.55)" stroke-width=".7"/><path d="M${f(x - r * .55)} ${f(y - r * .1)}A${f(r * .6)} ${f(r * .6)} 0 0 1 ${f(x - r * .05)} ${f(y - r * .6)}" fill="none" stroke="#fff" stroke-width=".8" stroke-linecap="round"/>`;
  return [
    EVO_FXS(evnStar5(12, 12.6, 10.4), '#f2c230', `<path d="${evnStar5(11.2, 11.6, 4.6)}" fill="#fff3b0"/>`),      // étoile d'or
    EVO_FXS(evnSpark(12, 12, 10.4), '#fff6cc', `<path d="${evnSpark(12, 12, 4.4)}" fill="#f2c230"/>`),      // étincelle
    EVO_FXS('M3.4 8.6C6 5.4 8.4 10.4 11.4 7.4C14.4 4.4 16.6 9.6 20.2 6.2L21 9.6C17.4 13 15 8 12.2 10.8C9.2 13.8 6.6 8.6 4.2 11.8Z', '#ff5fa2', '<path d="M5.4 15.6l4.4 1.4-1.2 4-4.4-1.4z" fill="#7cc4ff" stroke="rgba(30,10,40,.55)" stroke-width=".7" stroke-linejoin="round"/><path d="M15.4 14.4l3.8 2.6-2.4 3.4-3.8-2.6z" fill="#f2c230" stroke="rgba(30,10,40,.55)" stroke-width=".7" stroke-linejoin="round"/>'),      // confettis
    EVO_FXS('M12 9.8A2.2 2.2 0 1 0 12.01 9.8Z', '#fff', `<path d="${tip}" stroke="rgba(30,10,40,.5)" stroke-width="3.2" stroke-linecap="round"/>${fw}<circle cx="12" cy="12" r="2.2" fill="#fff"/>`),      // petit bouquet
    EVO_FXS('M9.2 9.4A5.2 5.2 0 1 0 9.21 9.4Z', '#fff4cc', [[16.6, 7.4, 3.2], [16.8, 17.2, 2.4], [5.4, 5.2, 1.9], [7.6, 19.6, 1.5]].map(bub).join('') + '<path d="M6.2 12.6A3.2 3.2 0 0 1 9.2 9.6" fill="none" stroke="#fff" stroke-width=".9" stroke-linecap="round"/>'),      // bulles de champagne
    EVO_FXS('M13.6 6.6C8.4 9.6 5 14 2.2 21.4C6.6 16.4 11.2 13.2 17.4 10.2Z', '#ff8cc0', '<circle cx="16.6" cy="7.4" r="4.4" fill="#fff3b0" stroke="rgba(30,10,40,.55)" stroke-width=".8"/><circle cx="16.6" cy="7.4" r="1.8" fill="#fff"/><path d="M12.4 5.4Q7.4 8.4 3.4 13.6" fill="none" stroke="#7cc4ff" stroke-width="1.3" stroke-linecap="round"/>'),      // comète
  ];
};

/** Paillettes d'or sur l'accueil (couche du dessus) : 7 éléments, chacun deux animés (descente lente, tournoiement) ; étincelles et étoiles d'or, confettis
 *  rose et bleu, bordés d'un trait foncé : visibles sur fond clair comme sur fond sombre. */
EV_AMB_TOP.nouvelan = () => {
  const sv = b => `<svg class="evo evo-cf" viewBox="0 0 16 16" aria-hidden="true" focusable="false">${b}</svg>`;
  const spark = sv(`<path d="${evnSpark(8, 8, 7.4)}" fill="#f2c230" stroke="#8a5a05" stroke-width=".6" stroke-linejoin="round"/><path d="${evnSpark(8, 8, 3)}" fill="#fff6cc"/>`);
  const star = sv(`<path d="${evnStar5(8, 8.6, 7.2)}" fill="#f2c230" stroke="#8a5a05" stroke-width=".6" stroke-linejoin="round"/><path d="${evnStar5(7.6, 8, 3)}" fill="#fff3b0"/>`);
  const rib = c => sv(`<path d="M2.6 6.4C4.6 4 6.4 7.6 8.4 5.4S12 3.6 13.6 5.8L14 8.4C12.2 6.4 10.6 9.6 8.6 8.2S5 7.6 3.2 9.2Z" fill="${c[0]}" stroke="${c[1]}" stroke-width=".55" stroke-linejoin="round"/>`);
  return [spark, rib(['#ff5fa2', '#8a1d52']), star, rib(['#7c8cff', '#262a9c']), spark, rib(['#ff9ccb', '#8a1d52']), star]
    .map((s, i) => `<span class="evy-cf evy-c${i + 1}"><span class="evy-cf-s">${s}</span></span>`).join('');
};

/* ── Pâques ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
   Chasse aux œufs dans un pré de printemps. Tout est dessiné ici (SVG en couleur, jamais d'emoji ni d'image externe) ; animations : css/ev-paques.css
   (transform / opacity seulement). Teintes « v » des œufs (0–4), chacune avec son décor peint : 0 rose framboise (frise en zigzag, pois), 1 bleu ciel
   (pois, vague), 2 vert menthe (frise de marguerites peintes), 3 jaune beurre (frises : dents, vagues, rubans), 4 lilas doré (treillis d'or, perles,
   cabochon : l'œuf « de prestige ») ; v absent : lilas doré. Le décor suit le galbe de l'œuf (latitudes en perspective, motifs resserrés sur les bords).
   · egg(o) : œuf décoré, l'objet caché (viewBox 64 × 64), posé dans une touffe d'herbe. Parties animées : .evo-egg-b (l'œuf se dandine de loin en loin,
     comme prêt à éclore), .evo-glint (reflet qui passe), .evo-glow (halo), .evo-rays et .evo-spk (version allumée : rayons qui tournent, étincelles).
     o.v teinte ; o.lit : célébration (halo plus vif, rayons, étincelles) ; o.cls : classes en plus. Lisible à 26–30 px (silhouette, bande contrastée),
     détaillé à 160 px (décor peint, ombre propre, lumière réfléchie, reflet, herbe). Variantes pour des mécaniques à venir (le moteur ne les demande pas
     encore) : o.gold (œuf d'or rare : treillis gravé, diamants, cabochon ; toujours allumé), o.mana ('W'…'G' : teinte du mana, symbole dans un médaillon
     d'or), o.crack (1 fêlé, 2 le poussin regarde par un trou). · hatch(o) : éclosion au fil des jours, o.stage 0–3 (3 : poussin sorti, dans l'herbe).
   · eggCounter(o) : compteur « 12 / 30 » (24 × 24, aplats pour 16–24 px) · chick(o) : poussin qui sort de sa coquille, dessin des messages (24 × 24 ;
     .evo-wing salue). · bunny(o) : lapin assis (64 × 64 ; .evo-ears frémissent) · basket(o) : panier d'osier garni (64 × 64 ; o.eggs : 0–7 œufs, le panier
     qui se remplit) · tulip(o), daffodil(o),
     daisy(o) : tulipe, jonquille, marguerite avec leur tige (24 × 48 ; o.v teinte de la tulipe) · butterfly(o) : papillon (32 × 24, o.v ; .evo-wings
     battent) · wingedBell(o) : cloche de Pâques ailée, la tradition française (64 × 64 ; .evo-wing-l / -r battent, .evo-bell-b se balance ; o.drop : elle
     lâche deux œufs, .evo-drop) · ribbon(o) : nœud de
     ruban satiné (32 × 24, o.v).
   EV_AMB.paques (soleil, nuages, pré fleuri, lapin, cloches qui passent), EV_AMB_TOP.paques (pétales et papillons), EV_FX.paques : ambiance, couche du
   dessus, particules. */
/** Courbe lisse passant par les points P (Catmull-Rom → Bézier) ; closed : contour fermé ; cont : continue un tracé (L au lieu de M). */
function evqCurve(P, closed = false, cont = false) {
  const f = evoF, n = P.length, g = i => P[closed ? (i + n) % n : Math.max(0, Math.min(n - 1, i))];
  let d = `${cont ? 'L' : 'M'}${f(P[0][0])} ${f(P[0][1])}`;
  for (let i = 0; i < (closed ? n : n - 1); i++) {
    const p0 = g(i - 1), p1 = g(i), p2 = g(i + 1), p3 = g(i + 2);
    d += `C${f(p1[0] + (p2[0] - p0[0]) / 6)} ${f(p1[1] + (p2[1] - p0[1]) / 6)} ${f(p2[0] - (p3[0] - p1[0]) / 6)} ${f(p2[1] - (p3[1] - p1[1]) / 6)} ${f(p2[0])} ${f(p2[1])}`;
  }
  return d + (closed ? 'Z' : '');
}
/* Géométrie d'un œuf : centre cx, cy ; demi-largeur a, demi-hauteur b ; k : pointe du haut (plus étroit en haut, ventru en bas) ; s : perspective du décor
   (vu d'un peu au-dessus, une ligne peinte autour de l'œuf descend de s sur le devant). */
const EVQ_G = { cx: 32, cy: 34.2, a: 16.4, b: 23.4, k: .15, s: 2.3 };
/** Contour de l'œuf G (24 points lissés). */
const evqEggD = (G, N = 24) => evqCurve(Array.from({ length: N }, (_, i) => { const t = i / N * 2 * Math.PI; return [G.cx + G.a * Math.sin(t) * (1 - G.k * Math.cos(t)), G.cy - G.b * Math.cos(t)]; }), true);
/** Demi-largeur de l'œuf G à la hauteur y. */
const evqHW = (G, y) => { const c = (G.cy - y) / G.b; return Math.abs(c) >= 1 ? 0 : G.a * Math.sqrt(1 - c * c) * (1 - G.k * c); };
/** Point du décor peint : latitude y0, angle th (−π/2 bord gauche, 0 face, π/2 bord droit), dy écart vertical ; un peu au-delà du bord (la découpe tranche). */
const evqP = (G, y0, th, dy = 0) => { const y = y0 + G.s * Math.cos(th) + dy; return [G.cx + (evqHW(G, y) + .7) * Math.sin(th), y]; };
const evqTh = (i, n) => -Math.PI / 2 + i * Math.PI / n;
/** Ligne peinte autour de l'œuf (latitude y0) : droite, en vagues (waves périodes, amp), ou en zigzag (zig : hauteur des dents, n dents). */
function evqLine(G, y0, { n = 20, waves = 0, amp = 0, zig = 0 } = {}) {
  const pts = Array.from({ length: n + 1 }, (_, i) => { const th = evqTh(i, n); return evqP(G, y0, th, zig ? (i % 2 ? -zig : zig) : amp * Math.sin(th * waves * 2)); });
  return zig ? 'M' + pts.map(p => evoF(p[0]) + ' ' + evoF(p[1])).join('L') : evqCurve(pts);
}
/** Bande peinte entre deux latitudes (y0 en haut, y1 en bas). */
function evqBand(G, y0, y1, n = 16) {
  const a = Array.from({ length: n + 1 }, (_, i) => evqP(G, y0, evqTh(i, n))), b = Array.from({ length: n + 1 }, (_, i) => evqP(G, y1, evqTh(n - i, n)));
  return evqCurve(a) + evqCurve(b, false, true) + 'Z';
}
/** Dents peintes : triangles qui pendent de la latitude y0 (h > 0) ou montent de y0 (h < 0), n dents. */
function evqTeeth(G, y0, h, n) {
  const z = Array.from({ length: 2 * n + 1 }, (_, i) => evqP(G, y0, evqTh(i, 2 * n), i % 2 ? h : 0)), e = Array.from({ length: 9 }, (_, i) => evqP(G, y0 - Math.sign(h) * .3, evqTh(8 - i, 8)));
  return 'M' + z.map(p => evoF(p[0]) + ' ' + evoF(p[1])).join('L') + evqCurve(e, false, true) + 'Z';
}
/** Pois sur une latitude : n pois de rayon r (aplatis sur les bords), décalés de off (fraction d'un pas) ; seulement ceux de la face visible. */
function evqDots(G, y0, n, r, off = .5) {
  let s = '';
  for (let i = 0; i < n; i++) {
    const th = evqTh(i + off, n), c = Math.cos(th); if (c < .18) continue;
    const [x, y] = evqP(G, y0, th, 0); s += `<ellipse cx="${evoF(x - .7 * Math.sin(th))}" cy="${evoF(y)}" rx="${evoF(r * Math.max(.32, c))}" ry="${evoF(r)}"/>`;
  }
  return s;
}
/** Motifs posés sur une latitude (fleurs, perles…) : <use> de l'élément ref, aplati sur les bords ; cls(i) : attributs en plus (couleur). */
function evqUses(G, y0, n, ref, k = 1, off = .5, at = () => '') {
  let s = '';
  for (let i = 0; i < n; i++) {
    const th = evqTh(i + off, n), c = Math.cos(th); if (c < .22) continue;
    const [x, y] = evqP(G, y0, th, 0); s += `<use href="#${ref}" transform="translate(${evoF(x - .7 * Math.sin(th))} ${evoF(y)}) scale(${evoF(k * Math.max(.3, c))} ${evoF(k)})"${at(i)}/>`;
  }
  return s;
}
/** Treillis peint entre deux latitudes (deux familles de diagonales qui s'enroulent autour de l'œuf) et ses nœuds ([x, y, aplatissement]). */
function evqLattice(G, y0, y1, n = 7) {
  const m = Math.PI / n / (y1 - y0) * 2, lines = [], knots = [];
  for (let j = -n; j <= n; j++) for (const sg of [1, -1]) {
    const th0 = j * Math.PI / n, pts = [];
    for (let y = y0; y <= y1 + .01; y += (y1 - y0) / 10) { const th = th0 + sg * (y - y0) * m; if (Math.abs(th) <= Math.PI / 2) pts.push(evqP(G, y, th)); }
    if (pts.length > 1) lines.push('M' + pts.map(p => evoF(p[0]) + ' ' + evoF(p[1])).join('L'));
  }
  for (let r = 0; r <= 2; r++) for (let j = -n; j <= n; j++) {
    const th = (j + (r % 2 ? .5 : 0)) * Math.PI / n, c = Math.cos(th); if (c < .25) continue;
    const [x, y] = evqP(G, y0 + r * (y1 - y0) / 2, th); knots.push([x, y, c]);
  }
  return { d: lines.join(''), knots };
}
/** Herbe : n brins entre x0 et x1, pied à yb, hauteur hmin–hmax ; graine fixe (toujours le même dessin). */
function evqBlades(x0, x1, yb, hmin, hmax, n, seed = 1, w = 1.6) {
  let s = seed * 9301 + 49297, d = '';
  const rnd = () => (s = (s * 9301 + 49297) % 233280) / 233280, f = evoF;
  for (let i = 0; i < n; i++) {
    const x = x0 + (x1 - x0) * (i + rnd() * .8) / n, h = hmin + (hmax - hmin) * rnd(), l = (rnd() - .5) * h * .7, ww = w * (.7 + rnd() * .6);
    d += `M${f(x - ww / 2)} ${f(yb)}Q${f(x + l * .2 - ww * .1)} ${f(yb - h * .55)} ${f(x + l)} ${f(yb - h)}Q${f(x + l * .25 + ww * .35)} ${f(yb - h * .5)} ${f(x + ww / 2)} ${f(yb)}Z`;
  }
  return d;
}
/** Petite fleur à cinq pétales ronds (centre 0 0, rayon 1) : un tracé, pour les <use> des décors. */
const EVQ_FLOWER = (() => { let d = ''; for (let k = 0; k < 5; k++) { const a = (-90 + k * 72) * Math.PI / 180, x = Math.cos(a) * .62, y = Math.sin(a) * .62; d += `M${evoF(x - .45)} ${evoF(y)}A.45 .45 0 1 0 ${evoF(x + .45)} ${evoF(y)}A.45 .45 0 1 0 ${evoF(x - .45)} ${evoF(y)}Z`; } return d; })();
/** Marguerite (centre x, y ; rayon r ; n pétales) : pétales en gouttes et cœur. */
function evqDaisyD(x, y, r, n = 12) {
  let d = ''; const f = evoF;
  for (let k = 0; k < n; k++) {
    const a = k * 2 * Math.PI / n, c = Math.cos(a), s = Math.sin(a), P = (u, v) => f(x + c * u - s * v) + ' ' + f(y + s * u + c * v);
    d += `M${P(r * .28, 0)}Q${P(r * .6, r * .2)} ${P(r, 0)}Q${P(r * .6, -r * .2)} ${P(r * .28, 0)}Z`;
  }
  return d;
}

/** Fêlures de l'éclosion (dans la découpe de l'œuf) : 1 une fêlure en zigzag, 2 un trou dans la coquille, le poussin qui regarde (œil, bec). */
function evqCrack(k, id) {
  if (!k) return '';
  const z = 'M18.4 23.6L21.6 21.4L23.4 24.2L26.8 20.6L28.6 23.8L31.8 19.8L34 23.2L37.2 20.2L39.2 23L42.6 20.8L45.6 22.6';
  if (k < 2) return `<path d="${z}" fill="none" stroke="#fff" stroke-width="1.6" stroke-linejoin="round" opacity=".7" transform="translate(.3 .6)"/><path d="${z}" fill="none" stroke="#3a2a30" stroke-width=".9" stroke-linejoin="round"/>`
    + `<path d="M31.8 19.8L31 16.6M37.2 20.2L39.4 17.4M23.4 24.2L22.6 27.6" fill="none" stroke="#3a2a30" stroke-width=".6" stroke-linecap="round"/>`;
  const h = 'M21.4 24.6L24.2 18.6L27 21.4L29.6 15.6L32.6 19.4L35.6 14.8L38 19.6L41.4 17.2L42.8 23.4L39.6 22.4L37.4 26.6L34.4 24.2L31.4 27.8L28.6 24.8L25.4 27.4Z';
  return `<path d="${h}" fill="#f6ecd8" transform="translate(.5 .8)"/><path d="${h}" fill="#3a2418"/><clipPath id="${id('hc')}"><path d="${h}"/></clipPath>`
    + `<g clip-path="url(#${id('hc')})"><circle cx="32" cy="27" r="10" fill="#ffd84a"/><circle cx="32" cy="27" r="10" fill="#7a4a10" opacity=".25"/><ellipse cx="28.6" cy="21.6" rx="1.3" ry="1.6" fill="#2a1d14"/><circle cx="29" cy="21" r=".5" fill="#fff"/>`
    + `<ellipse cx="36.2" cy="21.8" rx="1.3" ry="1.6" fill="#2a1d14"/><circle cx="36.6" cy="21.2" r=".5" fill="#fff"/><path d="M30.6 23.4L32.4 22.4L34.2 23.4L32.4 25.8Z" fill="#ff9a2e" stroke="#c4600a" stroke-width=".35" stroke-linejoin="round"/></g>`
    + `<path d="${h}" fill="none" stroke="#5a3a20" stroke-width=".6" stroke-linejoin="round"/><path d="M42.8 23.4L45.6 25.2M21.4 24.6L18.6 26.8M29.6 15.6L28.8 12.8" fill="none" stroke="#3a2a30" stroke-width=".6" stroke-linecap="round"/>`;
}
/* Œufs : couleurs [clair, moyen, foncé, contour] et décor (k). */
const EVQ_EGGS = [
  { c: ['#fff0f6', '#ffacd0', '#e1659e', '#8a2a5b'], k: 'zig' },        // rose framboise : frise en zigzag, pois
  { c: ['#eef8ff', '#a6d5ff', '#5a9be2', '#22508c'], k: 'dots' },       // bleu ciel : pois, vague
  { c: ['#effff5', '#a8ebc5', '#52b685', '#1c6a44'], k: 'flowers' },    // vert menthe : marguerites peintes
  { c: ['#fffbe6', '#ffe48c', '#efb23a', '#86560a'], k: 'frieze' },     // jaune beurre : frises peintes
  { c: ['#f7f1ff', '#cdb5ff', '#8d6ad9', '#41267d'], k: 'gold' },       // lilas doré : treillis d'or, perles, cabochon
];
const evqV = v => (Number(v) >= 0 && Number(v) <= 4 ? Math.floor(Number(v)) : 4);
/** Œuf rare en or (o.gold) et œufs du mana (o.mana : 'W', 'U', 'B', 'R', 'G' ; teintes EVY_MANA du Nouvel an, symbole gravé dans un médaillon d'or). */
const EVQ_GOLD = { c: ['#fffbe2', '#ffe07a', '#d69a22', '#6e4705'], k: 'goldrare' };
const evqManaEgg = k => { const m = EVY_MANA[EVY_K.indexOf(k)]; return { c: [m[0], m[1], m[2], m[4]], k: 'mana', m, f: EVY_FIG[k] }; };
/** Décor peint d'un œuf (dessiné dans sa découpe) ; id : préfixe des identifiants (dégradé d'or, fleur). */
function evqDeco(G, k, id, E = {}) {
  const B = (y0, y1, c, x = '') => `<path d="${evqBand(G, y0, y1)}" fill="${c}"${x}/>`;
  const L = (y0, c, w, o = {}, x = '') => `<path d="${evqLine(G, y0, o)}" fill="none" stroke="${c}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"${x}/>`;
  const D = (y0, n, r, c, off) => `<g fill="${c}">${evqDots(G, y0, n, r, off)}</g>`;
  if (k === 'zig') return B(30.4, 39.6, '#c93a78') + B(30.4, 31.6, '#a82a62', ' opacity=".6"')
    + L(35, '#fff3d6', 1.4, { zig: 2.7, n: 16 }) + `<g fill="#ffd36b">${evqDots(G, 32.6, 8, .62, 1)}</g><g fill="#ffd36b">${evqDots(G, 37.4, 8, .62, .5)}</g>`
    + L(30.4, '#ffd36b', .9) + L(39.6, '#ffd36b', .9) + D(23.6, 7, 1.35, '#ffffff') + D(17.4, 5, .95, '#ffe680', 0) + D(46.6, 8, 1.3, '#fff6dc', 0)
    + L(51.8, '#c93a78', 1.1) + L(53.6, '#ffd36b', .6) + D(12.8, 3, .7, '#ffffff', .5);
  if (k === 'dots') return D(15.6, 4, 1.1, '#ffffff', .5) + D(20.8, 6, 1.5, '#fff27a', 0) + D(26, 7, 1.55, '#ffffff', .5)
    + B(30.4, 38.8, '#ffffff', ' opacity=".92"') + L(34.6, '#ff7f96', 1.3, { waves: 3, amp: 1.5, n: 30 }) + `<g fill="#5a9be2">${evqDots(G, 34.6, 6, .7, .5)}</g>`
    + L(30.4, '#ff7f96', .8) + L(38.8, '#ff7f96', .8) + D(43.6, 7, 1.55, '#ffffff', 0) + D(48.8, 6, 1.5, '#ffacd0', .5) + D(53.8, 5, 1.2, '#fff27a', 0);
  if (k === 'flowers') return L(14.6, '#ffffff', .8, { zig: .9, n: 14 }) + D(19.4, 5, .9, '#ff8fbd', 0) + L(23.4, '#ffffff', 1, { zig: 1.2, n: 18 })
    + B(28.6, 41.4, '#fffaf0') + L(28.6, '#ff8fbd', 1.1) + L(41.4, '#ff8fbd', 1.1) + L(29.9, '#3f9a66', .5) + L(40.1, '#3f9a66', .5)
    + `<g fill="#3f9a66">${evqUses(G, 35, 5, id('lf'), 1.9, 0)}</g>`
    + evqUses(G, 35, 5, id('fl'), 3.5, .5, i => ` fill="${i % 2 ? '#ffc93f' : '#ff7fb4'}" stroke="${i % 2 ? '#c98a0c' : '#c2457e'}" stroke-width=".12"`) + `<g fill="#fffaf0">${evqDots(G, 35, 5, .9, .5)}</g><g fill="#e8a320">${evqDots(G, 35, 5, .36, .5)}</g>`
    + D(46.4, 8, 1, '#ffffff', 0) + L(50.4, '#ff8fbd', 1.2, { waves: 4, amp: .9, n: 28 }) + D(54.4, 5, .9, '#ffffff', .5);
  if (k === 'frieze') return B(17.8, 22.6, '#ff8a7a') + `<g fill="#fff">${evqDots(G, 20.2, 8, .55, .5)}</g>` + L(26.4, '#42b883', 1.3, { waves: 4, amp: 1.2, n: 28 })
    + B(30.2, 40.4, '#a98ef0') + `<path d="${evqTeeth(G, 30.2, 3.4, 9)}" fill="#fff6e2"/><path d="${evqTeeth(G, 40.4, -3.4, 9)}" fill="#ffd36b"/>`
    + `<g fill="#fff6e2">${evqDots(G, 35.3, 9, .7, 0)}</g>` + L(30.2, '#7f60d6', .7) + L(40.4, '#7f60d6', .7)
    + L(44.6, '#ff8a7a', 1.3, { zig: 1.3, n: 18 }) + B(48.4, 52, '#42b883') + `<g fill="#fff">${evqDots(G, 50.2, 9, .5, .5)}</g>` + D(13.4, 3, .8, '#ff8a7a', .5);
  if (k === 'mana') { const m = E.m;
    return D(15.6, 4, .9, m[1], .5) + L(20.4, m[3], 1, { zig: 1.1, n: 16 }) + D(24.6, 7, 1.15, '#ffffff', 0) + B(28.4, 41.6, m[3]) + B(28.4, 30, m[4], ' opacity=".35"')
      + L(28.4, `url(#${id('gd')})`, 1.4) + L(41.6, `url(#${id('gd')})`, 1.4) + `<g fill="${m[5]}">${evqDots(G, 35, 10, .62, .5)}</g>` + D(45.8, 8, 1.15, '#ffffff', .5)
      + L(50.2, m[3], 1, { waves: 4, amp: .9, n: 28 }) + D(54.2, 5, .9, m[1], 0)
      + `<g transform="translate(32 ${evoF(35 + G.s)})"><circle r="6.6" fill="url(#${id('gd')})" stroke="${m[4]}" stroke-width=".4"/><circle r="5.3" fill="${m[2]}"/><circle r="5.3" fill="url(#${id('md')})"/>`
      + `<path d="${E.f}" transform="scale(.15) translate(-30 -30.4)" fill="#fff" fill-rule="evenodd" opacity=".95"/><path d="M-3.4-2.6A4.4 4.4 0 0 1 .4-4.4" fill="none" stroke="#fff" stroke-width=".6" stroke-linecap="round" opacity=".7"/></g>`; }
  if (k === 'goldrare') { const T = evqLattice(G, 24.4, 44.6, 6), sp = T.knots.map(([x, y, c]) => `<path d="${evnSpark(x, y, 1.3 * Math.max(.45, c))}"/>`).join('');
    return `<path d="${T.d}" fill="none" stroke="#a46c0c" stroke-width="1.1" stroke-linecap="round"/><path d="${T.d}" fill="none" stroke="#fff3c4" stroke-width=".35" stroke-linecap="round" transform="translate(-.25 -.3)"/>`
      + `<g fill="#ffffff" stroke="#b07a10" stroke-width=".2">${sp}</g>` + L(24.4, '#a46c0c', 2.2) + L(44.6, '#a46c0c', 2.2) + L(24.4, '#fff6d0', .6) + L(44.6, '#fff6d0', .6)
      + `<g fill="#fff">${evqDots(G, 24.4, 12, .45, .5)}${evqDots(G, 44.6, 12, .45, 0)}</g>` + L(18.6, '#b07a10', .9, { waves: 4, amp: 1, n: 28 }) + L(50, '#b07a10', .9, { waves: 5, amp: 1, n: 30 })
      + `<g fill="#b07a10">${evqDots(G, 14.4, 3, .7, .5)}${evqDots(G, 54, 6, .8, .5)}</g>`
      + `<g transform="translate(32 ${evoF(34.5 + G.s)})"><ellipse rx="3.4" ry="4.1" fill="#a46c0c"/><ellipse rx="2.6" ry="3.2" fill="url(#${id('cb')})"/><ellipse cx="-.8" cy="-1.2" rx=".9" ry="1.2" fill="#fff" opacity=".85"/></g>`; }
  /* lilas doré : ceinture en treillis d'or et perles, bandes d'or perlées, cabochon rose sur le devant, couronne et festons d'or */
  const T = evqLattice(G, 26.4, 42.6, 6), gd = `url(#${id('gd')})`;
  return B(26.4, 42.6, '#7b55c9', ' opacity=".28"') + `<path d="${T.d}" fill="none" stroke="${gd}" stroke-width=".85" stroke-linecap="round"/>`
    + `<g fill="#fffaf0" stroke="#8d6ad9" stroke-width=".25">${T.knots.map(([x, y, c]) => `<ellipse cx="${evoF(x)}" cy="${evoF(y)}" rx="${evoF(.82 * Math.max(.4, c))}" ry=".82"/>`).join('')}</g>`
    + L(26.4, gd, 2.3) + L(42.6, gd, 2.3) + L(26.4, '#fff3c4', .5, {}, ' opacity=".8"') + L(42.6, '#fff3c4', .5, {}, ' opacity=".8"')
    + `<g fill="#fffaf0">${evqDots(G, 26.4, 12, .5, .5)}${evqDots(G, 42.6, 12, .5, 0)}</g>`
    + L(20.6, gd, 1.1, { waves: 4, amp: 1, n: 28 }) + `<g fill="${gd}">${evqUses(G, 16.4, 4, id('st'), 1.4, .5)}</g>`
    + L(47.6, gd, 1.1, { waves: 5, amp: 1.1, n: 30 }) + `<g fill="#f4c542">${evqDots(G, 52.4, 7, .8, .5)}</g>` + D(12.6, 2, .6, '#f4c542', .5)
    + `<g transform="translate(32 ${evoF(34.5 + G.s)})"><ellipse rx="3.3" ry="4" fill="${gd}"/><ellipse rx="2.5" ry="3.15" fill="url(#${id('cb')})"/>`
    + `<ellipse cx="-.8" cy="-1.2" rx=".9" ry="1.2" fill="#fff" opacity=".85"/></g>`;
}

Object.assign(EV_ART, {
  /** Œuf de Pâques décoré, posé dans l'herbe (viewBox 64 × 64) ; o.v teinte et décor (0–4 ; sinon lilas doré) ; o.lit : célébration. */
  egg: (o = {}) => {
    const n = ++EVO_N, id = s => `evo${n}${s}`, lit = !!o.lit || !!o.gold, v = evqV(o.v), mana = EVY_K.includes(o.mana) ? o.mana : '';
    const E = o.gold ? EVQ_GOLD : mana ? evqManaEgg(mana) : EVQ_EGGS[v], c = E.c, G = EVQ_G, egg = evqEggD(G), cls = o.gold ? 'gold' : mana ? 'mana-' + mana : v;
    const spk = lit ? `<g class="evo-spk" fill="#fffbe6" stroke="${c[3]}" stroke-width=".35" stroke-opacity=".5">${[[8, 14, 3], [56, 12, 2.6], [6, 42, 2.2], [58, 40, 2.8], [32, 3.4, 2]].map(([x, y, r]) => `<path d="${evnSpark(x, y, r)}"/>`).join('')}</g>` : '';
    return `<svg class="evo evo-egg evo-egg-${cls}${lit ? ' evo-lit' : ''}${o.crack ? ' evo-crack' : ''}${o.cls ? ' ' + o.cls : ''}" viewBox="0 0 64 64" aria-hidden="true" focusable="false"><defs>`
      + `<radialGradient id="${id('g')}" cx="32" cy="35" r="31" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#fff8d6" stop-opacity="${lit ? .95 : .55}"/><stop offset=".45" stop-color="${c[1]}" stop-opacity="${lit ? .5 : .22}"/><stop offset="1" stop-color="${c[1]}" stop-opacity="0"/></radialGradient>`
      + (lit ? `<linearGradient id="${id('y')}" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#fffbe0" stop-opacity=".95"/><stop offset="1" stop-color="${c[1]}" stop-opacity="0"/></linearGradient>` : '')
      + `<radialGradient id="${id('b')}" cx=".38" cy=".3" r=".8" fx=".32" fy=".22"><stop offset="0" stop-color="#ffffff"/><stop offset=".22" stop-color="${c[0]}"/><stop offset=".62" stop-color="${c[1]}"/><stop offset="1" stop-color="${c[2]}"/></radialGradient>`
      + `<radialGradient id="${id('d')}" cx=".34" cy=".28" r=".86"><stop offset=".48" stop-color="${c[3]}" stop-opacity="0"/><stop offset=".86" stop-color="${c[3]}" stop-opacity=".26"/><stop offset="1" stop-color="${c[3]}" stop-opacity=".5"/></radialGradient>`
      + `<radialGradient id="${id('h')}"><stop offset="0" stop-color="#fff" stop-opacity=".95"/><stop offset=".5" stop-color="#fff" stop-opacity=".4"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>`
      + `<linearGradient id="${id('k')}" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".5" stop-color="#fff" stop-opacity=".7"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>`
      + `<linearGradient id="${id('gd')}" x1="15" y1="0" x2="49" y2="0" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#9a6a10"/><stop offset=".3" stop-color="#ffe9a0"/><stop offset=".5" stop-color="#e8b53e"/><stop offset=".7" stop-color="#fff4c8"/><stop offset="1" stop-color="#8a5a0c"/></linearGradient>`
      + (E.k === 'mana' ? `<radialGradient id="${id('md')}" cx=".34" cy=".28" r=".86"><stop offset=".4" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".35"/></radialGradient>` : '')
      + (E.k === 'gold' || E.k === 'goldrare' ? `<radialGradient id="${id('cb')}" cx=".38" cy=".3" r=".8"><stop offset="0" stop-color="#ffe0ee"/><stop offset=".45" stop-color="#ff6fae"/><stop offset="1" stop-color="#a3175c"/></radialGradient>`
        + `<path id="${id('st')}" d="${evnSpark(0, 0, 1)}"/>` : '')
      + (E.k === 'flowers' ? `<path id="${id('fl')}" d="${EVQ_FLOWER}"/><path id="${id('lf')}" d="M-1.3 0Q-.65-.55 0 0Q-.65.55-1.3 0ZM1.3 0Q.65-.55 0 0Q.65.55 1.3 0Z"/>` : '')
      + `<radialGradient id="${id('o')}"><stop offset="0" stop-color="#2a3a1c" stop-opacity=".38"/><stop offset="1" stop-color="#2a3a1c" stop-opacity="0"/></radialGradient>`
      + `<linearGradient id="${id('gr')}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9be27a"/><stop offset="1" stop-color="#3f9a4e"/></linearGradient>`
      + `<path id="${id('x')}" d="${egg}"/><clipPath id="${id('c')}"><use href="#${id('x')}"/></clipPath></defs>`
      + `<circle class="evo-glow" cx="32" cy="35" r="31" fill="url(#${id('g')})"/>` + (lit ? evnRays(id('y'), 32, 35, 32) : '')
      + `<ellipse class="evo-shadow" cx="32" cy="58.6" rx="19" ry="3.2" fill="url(#${id('o')})"/>`
      + `<path d="${evqBlades(15, 49, 59.4, 3, 7.5, 13, v + 3, 2)}" fill="#3f8f45"/>`
      + `<g class="evo-egg-b"><use href="#${id('x')}" fill="url(#${id('b')})"/>`
      + `<g clip-path="url(#${id('c')})">${evqDeco(G, E.k, id, E)}` + evqCrack(o.crack, id)
      + `<use href="#${id('x')}" fill="url(#${id('d')})"/>`
      + `<use href="#${id('x')}" transform="translate(-1 -1.3)" fill="none" stroke="#fff" stroke-width="2.6" opacity=".34"/>`
      + `<path class="evo-glint" d="M6 60H11.6L24 8H18.4Z" fill="url(#${id('k')})" opacity="0"/></g>`
      + `<use href="#${id('x')}" fill="none" stroke="${c[3]}" stroke-width=".75" stroke-opacity=".85"/>`
      + `<ellipse cx="25.4" cy="20.6" rx="3.6" ry="6.4" transform="rotate(24 25.4 20.6)" fill="url(#${id('h')})"/><circle cx="21.6" cy="29.4" r="1" fill="#fff" opacity=".6"/>`
      + `<path d="M40.4 50.6Q45.4 46.6 46.6 40" fill="none" stroke="#fff" stroke-width=".9" stroke-linecap="round" opacity=".3"/></g>`
      + `<g class="evo-grass"><path d="${evqBlades(14, 50, 61, 3.4, 9, 15, v + 7, 2.1)}" fill="url(#${id('gr')})" stroke="#2f7a3a" stroke-width=".35" stroke-linejoin="round"/>`
      + `<path d="${evqDaisyD(v % 2 ? 47 : 17.4, 55.4, 2.3, 9)}" fill="#ffffff" stroke="#c9b8e0" stroke-width=".25"/><circle cx="${v % 2 ? 47 : 17.4}" cy="55.4" r=".85" fill="#ffd36b" stroke="#d99a1c" stroke-width=".25"/></g>`
      + spk + `</svg>`;
  },
  /** Icône du compteur « 12 / 30 » (viewBox 24 × 24) : œuf rose à bande zigzag, aplats nets à 16–24 px. */
  eggCounter: (o = {}) => {
    const G = { cx: 12, cy: 12.8, a: 7.4, b: 10, k: .15, s: .8 }, n = ++EVO_N, egg = evqEggD(G, 20);
    return `<svg class="evo evo-counter${o.cls ? ' ' + o.cls : ''}" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><defs><clipPath id="evo${n}c"><path d="${egg}"/></clipPath></defs>`
      + `<path d="${egg}" fill="#ff9cc6"/><g clip-path="url(#evo${n}c)"><path d="${evqBand(G, 10.6, 15.4, 10)}" fill="#c93a78"/>`
      + `<path d="${evqLine(G, 13, { zig: 1.35, n: 8 })}" fill="none" stroke="#fff3d6" stroke-width="1" stroke-linejoin="round"/>`
      + `<g fill="#ffffff">${evqDots(G, 7.2, 3, .9, .5)}</g><g fill="#ffe680">${evqDots(G, 18.6, 4, .85, .5)}</g><path d="M17.4 6Q20.6 11 18.2 19.6" fill="none" stroke="#c93a78" stroke-width="2.2" opacity=".35"/></g>`
      + `<path d="${egg}" fill="none" stroke="#7a1f4f" stroke-width=".8"/><path d="M8.2 5.8Q6.6 7.8 6.2 10.4" fill="none" stroke="#fff" stroke-width="1" stroke-linecap="round" opacity=".85"/></svg>`;
  },
  /** Poussin qui sort de sa coquille (viewBox 24 × 24), dessin des messages ; l'aile .evo-wing salue, le chapeau de coquille est posé de travers. */
  chick: (o = {}) => {
    const n = ++EVO_N, id = s => `evo${n}${s}`;
    let zig = 'M3.4 14.6'; for (let i = 1; i <= 10; i++) zig += `L${evoF(3.4 + i * 1.72)} ${i % 2 ? 12.6 : 14.8}`;
    return `<svg class="evo evo-chick${o.cls ? ' ' + o.cls : ''}" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><defs>`
      + `<radialGradient id="${id('b')}" cx=".4" cy=".32" r=".75"><stop offset="0" stop-color="#fffbd0"/><stop offset=".5" stop-color="#ffe066"/><stop offset="1" stop-color="#f4b21f"/></radialGradient>`
      + `<linearGradient id="${id('s')}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset=".6" stop-color="#f6efe2"/><stop offset="1" stop-color="#d8c8ad"/></linearGradient></defs>`
      + `<ellipse cx="12" cy="22.6" rx="7.6" ry="1.1" fill="#3a2a10" opacity=".18"/>`
      + `<circle cx="12" cy="11" r="6.6" fill="url(#${id('b')})" stroke="#c98a0c" stroke-width=".6"/>`
      + `<path d="M8.4 6.2Q9.4 3.6 11.4 4.6Q11.2 2.8 13 3.2" fill="none" stroke="#e6a417" stroke-width=".8" stroke-linecap="round"/>`
      + `<g class="evo-wing"><path d="M17.6 11.4C19.8 9.6 21.8 9.8 22.4 10.8C21.4 11.4 21.2 12.6 20.2 13.2C19.4 13.8 18.2 13.6 17.4 13.2Z" fill="#ffd23f" stroke="#c98a0c" stroke-width=".55" stroke-linejoin="round"/></g>`
      + `<ellipse cx="9.6" cy="10" rx="1" ry="1.25" fill="#2a1d14"/><ellipse cx="14.4" cy="10" rx="1" ry="1.25" fill="#2a1d14"/><circle cx="9.9" cy="9.5" r=".38" fill="#fff"/><circle cx="14.7" cy="9.5" r=".38" fill="#fff"/>`
      + `<ellipse cx="7.8" cy="12.4" rx="1.3" ry=".8" fill="#ff8fb0" opacity=".6"/><ellipse cx="16.2" cy="12.4" rx="1.3" ry=".8" fill="#ff8fb0" opacity=".6"/>`
      + `<path d="M10.6 11.6L12 10.9L13.4 11.6L12 13.4Z" fill="#ff9a2e" stroke="#c4600a" stroke-width=".45" stroke-linejoin="round"/><path d="M10.6 11.6L13.4 11.6" stroke="#c4600a" stroke-width=".35"/>`
      + `<path d="${zig}L20.6 14.6C20.6 19.8 17.2 22.4 12 22.4C6.8 22.4 3.4 19.8 3.4 14.6Z" fill="url(#${id('s')})" stroke="#a8916a" stroke-width=".6" stroke-linejoin="round"/>`
      + `<path d="M5.6 17.6Q6.4 20.2 9 21.2" fill="none" stroke="#fff" stroke-width=".8" stroke-linecap="round" opacity=".9"/><g fill="#ffacd0"><circle cx="9.6" cy="18.4" r=".7"/><circle cx="14.6" cy="19.6" r=".6"/><circle cx="17.4" cy="17.2" r=".55"/></g>`
      + `<g transform="rotate(-16 12 5)"><path d="M6.8 6.4C6.8 2.6 9.2.6 12 .6C14.8.6 17.2 2.6 17.2 6.4L16 5.2L14.8 6.6L13.6 5L12.4 6.6L11.2 5L10 6.6L8.8 5.2L7.8 6.6Z" fill="url(#${id('s')})" stroke="#a8916a" stroke-width=".5" stroke-linejoin="round"/>`
      + `<path d="M8.6 3.8Q9.6 1.9 11.6 1.6" fill="none" stroke="#fff" stroke-width=".7" stroke-linecap="round"/><circle cx="14.6" cy="3.4" r=".55" fill="#ffacd0"/></g></svg>`;
  },
});

/* ── Pâques : décor (lapin, panier, fleurs, papillon, cloche ailée, ruban) ─────────────────────────────────────────────────────────────────── */
/* Rubans satinés : [clair, moyen, foncé, contour] : rose, bleu ciel, menthe, jaune, lilas (même ordre que les œufs). */
const EVQ_RIB = [['#ffe6f1', '#ff8fbd', '#d9467f', '#7a1f4c'], ['#e6f4ff', '#7fbcff', '#3a78cf', '#173d77'], ['#e6fff0', '#7fdcaa', '#2f9e66', '#0f5233'],
  ['#fff8d6', '#ffd75e', '#e0a01c', '#7a5205'], ['#f3ebff', '#b99aff', '#7a52d0', '#33186e']];
/** Nœud de ruban (formes du nœud de Noël, EVN_BOW) centré en x, y, échelle s ; R : couleurs ; gid : dégradé des boucles (déjà défini) ou couleur. */
const evqBow = (x, y, s, R, gid) => `<g transform="translate(${x} ${y}) scale(${s}) translate(-32 -21.6)" stroke="${R[3]}" stroke-width="${evoF(.55 / s)}" stroke-linejoin="round">`
  + `<path d="${EVN_BOW.t}" fill="${R[2]}"/><path d="${EVN_BOW.l}${EVN_BOW.r}" fill="${gid ? `url(#${gid})` : R[1]}"/><path d="${EVN_BOW.li}${EVN_BOW.ri}" fill="${R[2]}" opacity=".55" stroke="none"/>`
  + `<path d="M19.6 14Q20.6 10.8 24.4 11.2M44.4 14Q43.4 10.8 39.6 11.2" fill="none" stroke="#fff" stroke-width="${evoF(.9 / Math.sqrt(s))}" stroke-linecap="round" opacity=".7"/>`
  + `<rect x="29.3" y="18.4" width="5.4" height="5.6" rx="2" fill="${R[1]}"/><path d="M30.6 19.8Q31.4 19.2 32.4 19.4" fill="none" stroke="#fff" stroke-width=".7" stroke-linecap="round" opacity=".8" stroke-opacity="1"/></g>`;
/** Touffe de fourrure ou de nuage : cercle bosselé (n bosses de rayon r autour de cx, cy, R). */
function evqFluff(cx, cy, R, n = 9, r = R * .42) {
  const f = evoF, P = Array.from({ length: n }, (_, i) => { const a = i * 2 * Math.PI / n - Math.PI / 2; return [cx + Math.cos(a) * R, cy + Math.sin(a) * R]; });
  let d = `M${f(P[0][0])} ${f(P[0][1])}`;
  for (let i = 0; i < n; i++) { const q = P[(i + 1) % n]; d += `A${f(r)} ${f(r)} 0 0 1 ${f(q[0])} ${f(q[1])}`; }
  return d + 'Z';
}
/** Petit œuf simplifié (paniers, ambiance) : G géométrie, v teinte, id préfixe ; une bande, des pois, le reflet. */
function evqMini(G, v, id, tr = '') {
  const c = EVQ_EGGS[v].c, d = evqEggD(G, 20), k = ++EVO_N, band = ['#c93a78', '#ffffff', '#fffaf0', '#a98ef0', '#e8b53e'][v], dot = ['#ffffff', '#fff27a', '#ff8fbd', '#fff6e2', '#fffaf0'][v];
  const x = id('e' + k), hx = evoF(G.cx - G.a * .42), hy = evoF(G.cy - G.b * .45);
  return `<g${tr ? ` transform="${tr}"` : ''}><defs><path id="${x}" d="${d}"/></defs><use href="#${x}" fill="url(#${id('m' + v)})"/><clipPath id="${id('c' + k)}"><path d="${d}"/></clipPath><g clip-path="url(#${id('c' + k)})">`
    + `<path d="${evqBand(G, G.cy - G.b * .14, G.cy + G.b * .2, 10)}" fill="${band}"/>`
    + (v === 0 ? `<path d="${evqLine(G, G.cy + G.b * .03, { zig: G.b * .1, n: 12 })}" fill="none" stroke="#fff3d6" stroke-width="${evoF(G.b * .06)}"/>` : `<g fill="${v === 1 ? '#ff7f96' : v === 2 ? '#ff8fbd' : v === 3 ? '#fff' : '#fff3c4'}">${evqDots(G, G.cy + G.b * .03, 6, G.b * .07)}</g>`)
    + `<g fill="${dot}">${evqDots(G, G.cy - G.b * .5, 4, G.b * .075, 0)}${evqDots(G, G.cy + G.b * .55, 5, G.b * .075)}</g>`
    + `<use href="#${x}" fill="url(#${id('md')})"/></g><use href="#${x}" fill="none" stroke="${c[3]}" stroke-width=".6" stroke-opacity=".85"/>`
    + `<ellipse cx="${hx}" cy="${hy}" rx="${evoF(G.a * .2)}" ry="${evoF(G.b * .26)}" transform="rotate(24 ${hx} ${hy})" fill="#fff" opacity=".7"/></g>`;
}
/** Dégradés des petits œufs (un par teinte utilisée) et leur ombre propre. */
const evqMiniDefs = (id, vs) => vs.map(v => { const c = EVQ_EGGS[v].c; return `<radialGradient id="${id('m' + v)}" cx=".38" cy=".3" r=".8"><stop offset="0" stop-color="#fff"/><stop offset=".25" stop-color="${c[0]}"/><stop offset=".65" stop-color="${c[1]}"/><stop offset="1" stop-color="${c[2]}"/></radialGradient>`; }).join('')
  + `<radialGradient id="${id('md')}" cx=".34" cy=".28" r=".86"><stop offset=".5" stop-color="#2a1d40" stop-opacity="0"/><stop offset="1" stop-color="#2a1d40" stop-opacity=".32"/></radialGradient>`;
/** Plume (pied px, py ; direction ang en degrés ; longueur l, largeur w) : goutte allongée à bout arrondi. */
function evqFeather(px, py, ang, l, w) {
  const a = ang * Math.PI / 180, c = Math.cos(a), s = Math.sin(a), f = evoF, P = (u, v) => f(px + c * u - s * v) + ' ' + f(py + s * u + c * v);
  return `M${P(0, -w * .3)}C${P(l * .35, -w * .62)} ${P(l * .78, -w * .58)} ${P(l * .96, -w * .3)}Q${P(l * 1.04, 0)} ${P(l * .96, w * .32)}C${P(l * .78, w * .6)} ${P(l * .35, w * .62)} ${P(0, w * .3)}Z`;
}
/** Aile de plumes (gauche, épaule vers 22, 28) : rémiges en éventail, couvertures plus courtes, bras arrondi ; gid : dégradé des plumes. */
function evqWing(gid) {
  let pr = '', cv = '', vn = '';
  for (let i = 0; i < 7; i++) { const a = 168 + i * 11, l = 19.5 - i * 1.2; pr += evqFeather(22, 28.6, a, l, 4.4); const r = a * Math.PI / 180; vn += `M${evoF(22 + Math.cos(r) * 3)} ${evoF(28.6 + Math.sin(r) * 3)}L${evoF(22 + Math.cos(r) * l * .86)} ${evoF(28.6 + Math.sin(r) * l * .86)}`; }
  for (let i = 0; i < 6; i++) cv += evqFeather(22, 27.6, 176 + i * 10.5, 10.6 - i * .5, 3.6);
  return `<g stroke="#8a7aa8" stroke-width=".5" stroke-linejoin="round"><path d="${pr}" fill="url(#${gid})"/><path d="${vn}" fill="none" stroke="#c3b6dc" stroke-width=".4"/>`
    + `<path d="${cv}" fill="#ffffff"/><path d="M23.4 30.6C18.6 31 14.4 28.4 12.8 24.4C15.6 21.6 20.2 21.6 23.6 24.6Z" fill="#ffffff"/></g>`
    + `<path d="M21.6 24.6C18.6 22.8 15.6 22.8 13.6 24.2" fill="none" stroke="#e9e2f4" stroke-width=".8" stroke-linecap="round"/>`;
}
/* Tulipes : [clair, moyen, foncé, contour] : rose, corail, jaune, lilas, blanc rosé */
const EVQ_TULIP = [['#ffd6e8', '#ff7fb4', '#d63c7e', '#7a1a48'], ['#ffd2c8', '#ff7262', '#d2352c', '#6e1210'], ['#fff6c4', '#ffd84a', '#eba417', '#7a5205'],
  ['#efe4ff', '#b796ff', '#7a50d6', '#3a1c78'], ['#fffafc', '#ffe0ee', '#f2a6c8', '#a0507a']];
/* Papillons : [clair, moyen, foncé, contour] : bleu ciel, rose, citron, lilas, menthe */
const EVQ_BFLY = [['#e8f6ff', '#8fcaff', '#3d7fd6', '#173b74'], ['#fff0f7', '#ffa6cf', '#e05596', '#74173f'], ['#fffbe0', '#ffe36e', '#f2a92a', '#744708'],
  ['#f6f0ff', '#c9adff', '#8358d6', '#371f72'], ['#effff6', '#9fe8c3', '#3fb07a', '#14573a']];
/** Tige et feuilles longues (fleurs du pré) : tige du pied (x0, 47.6) vers la fleur (x1, y1), deux feuilles en lame. */
function evqStem(id, x0, x1, y1, lean = 0) {
  return `<path d="M${x0} 47.6C${evoF(x0 + lean)} 38 ${evoF(x1 - lean * .4)} 28 ${x1} ${y1}" fill="none" stroke="#2f7a3a" stroke-width="2.1" stroke-linecap="round"/>`
    + `<path d="M${x0} 47.6C${evoF(x0 + lean)} 38 ${evoF(x1 - lean * .4)} 28 ${x1} ${y1}" fill="none" stroke="url(#${id('st')})" stroke-width="1.3" stroke-linecap="round"/>`
    + `<g stroke="#2a6a33" stroke-width=".45" stroke-linejoin="round"><path d="M${evoF(x0 - .4)} 47.6C${evoF(x0 - 6)} 42 ${evoF(x0 - 8.6)} 35 ${evoF(x0 - 7.8)} 27.6C${evoF(x0 - 5.6)} 33 ${evoF(x0 - 2.4)} 39 ${evoF(x0 + .6)} 46Z" fill="url(#${id('lf')})"/>`
    + `<path d="M${evoF(x0 + .4)} 47.6C${evoF(x0 + 5.4)} 43.4 ${evoF(x0 + 7.4)} 38.4 ${evoF(x0 + 7.6)} 31.4C${evoF(x0 + 5)} 36 ${evoF(x0 + 2.6)} 40.6 ${evoF(x0 - .4)} 45.6Z" fill="url(#${id('lf')})"/></g>`
    + `<path d="M${evoF(x0 - .6)} 46C${evoF(x0 - 4.6)} 41 ${evoF(x0 - 6.6)} 35.6 ${evoF(x0 - 7.2)} 30M${evoF(x0 + .6)} 46C${evoF(x0 + 4)} 42.4 ${evoF(x0 + 6)} 38 ${evoF(x0 + 6.8)} 33.4" fill="none" stroke="#c9f0a8" stroke-width=".45" stroke-linecap="round" opacity=".7"/>`;
}
const evqStemDefs = id => `<linearGradient id="${id('st')}" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#5fb04a"/><stop offset=".5" stop-color="#9be27a"/><stop offset="1" stop-color="#4c9a3c"/></linearGradient>`
  + `<linearGradient id="${id('lf')}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#a6e57f"/><stop offset=".6" stop-color="#55a845"/><stop offset="1" stop-color="#2f7a3a"/></linearGradient>`;

Object.assign(EV_ART, {
  /** Lapin blanc assis de trois quarts (viewBox 64 × 64), tête un peu penchée, une oreille inclinée à la pointe repliée ; il tient un œuf peint entre ses pattes avant (o.egg : false
   *  pour ses pattes seules ; o.v : teinte de l'œuf, rose par défaut). Pelage en dégradés doux et mèches, joues et poitrail en touffes, queue en pompon,
   *  oreilles nées du crâne (l'une debout, l'autre inclinée, la pointe repliée), intérieur rose veiné, yeux à double reflet. Parties animées : .evo-ears (frémissent), .evo-nose (remue). */
  bunny: (o = {}) => {
    const n = ++EVO_N, id = s => `evo${n}${s}`, f = evoF, egg = o.egg !== false, ev = o.v === undefined ? 0 : evqV(o.v), ln = '#7d6a8c';
    const fur = (d, w = .45, c = '#b8a6c8', op = .8) => `<path d="${d}" fill="none" stroke="${c}" stroke-width="${w}" stroke-linecap="round" opacity="${op}"/>`;
    const tail = evqFluff(50.4, 47.2, 4.4, 11, 1.9), tail2 = evqFluff(49.8, 46.6, 2.8, 9, 1.3), HT = 'rotate(-8 24.4 26) translate(1 2.4)';
    const head = 'M13.2 25.6C12.8 19.2 17.8 14.6 24.6 14.6C31.4 14.6 35.8 19.2 35.4 25C35.1 29.2 33 32 29.8 33.6L30.4 35.2L28.2 34.6L27.6 36.4L25.8 35.2L24.6 36.8L23.2 35.4L21.4 36.4L20.8 34.6L18.8 35C16.6 33.4 15.6 31.8 15 30.4C13.8 29.2 13.3 27.6 13.2 25.6Z';
    const body = 'M22.6 57.8C17.8 56.8 16.6 51.4 17.8 46.4C19.2 41 22.6 37.4 27.4 35.8C32 34.2 38.2 34.2 42.8 36.4C48 38.8 51.4 43.6 51.2 49.4C51 54 48.4 57.2 44 57.8Z';
    /* oreilles (repère de la tête, derrière le crâne : leur base est cachée par la tête) : A debout, B inclinée vers l'arrière, la pointe qui retombe */
    const earA = 'M18.2 19C16.4 13.4 16.2 7.2 17.8 3.4C19 .6 22.4.6 23.6 3.4C25 6.8 24.8 13 23.6 18.6Z', earAIn = 'M19.4 16.6C18.2 12.2 18.2 7.6 19.2 4.8C19.8 3.2 21.4 3.2 22 4.8C22.8 7.6 22.8 12.2 22.2 16.2Z';
    const earB = 'M26.4 19C26.4 12.6 28.6 7 32.6 4.2C34.4 3 36.6 3.2 37.4 4.8C38.2 6.6 37 10.6 35 13.8C33.6 16.2 32 18.2 30.8 19.6Z', earBIn = 'M28.2 17.4C28.4 12.4 30.2 8.2 32.8 6.2C34 5.4 35.2 5.6 35.2 6.8C35 9.4 33.6 12.6 31.6 15.6Z';
    const tipB = 'M33 4C35.2 2.6 38.4 2.8 39.8 5.2C40.8 7 40.8 9.8 40 11.6C39.4 12.6 38.2 12.4 38 11.2C37.6 9 37 7 35.8 5.8C35 5 34 4.4 33 4Z';
    const GE = { cx: 25, cy: 48.8, a: 5.2, b: 6.9, k: .15, s: .5 };
    return `<svg class="evo evo-bunny${o.cls ? ' ' + o.cls : ''}" viewBox="0 0 64 64" aria-hidden="true" focusable="false"><defs>`
      + `<radialGradient id="${id('f')}" cx=".34" cy=".26" r=".86"><stop offset="0" stop-color="#ffffff"/><stop offset=".5" stop-color="#f8f3f8"/><stop offset=".82" stop-color="#e2d6e8"/><stop offset="1" stop-color="#c9b8d4"/></radialGradient>`
      + `<radialGradient id="${id('h')}" cx=".38" cy=".3" r=".78"><stop offset="0" stop-color="#ffffff"/><stop offset=".62" stop-color="#faf6fa"/><stop offset="1" stop-color="#ddd0e4"/></radialGradient>`
      + `<linearGradient id="${id('k')}" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#e6dbec"/><stop offset=".5" stop-color="#fbf8fb"/><stop offset="1" stop-color="#d9cbe2"/></linearGradient>`
      + `<linearGradient id="${id('e')}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffc4dc"/><stop offset=".55" stop-color="#ff9cc3"/><stop offset="1" stop-color="#f07aa8"/></linearGradient>`
      + `<radialGradient id="${id('i')}" cx=".42" cy=".4" r=".6"><stop offset="0" stop-color="#6b4560"/><stop offset=".6" stop-color="#34202e"/><stop offset="1" stop-color="#160c14"/></radialGradient>`
      + `<radialGradient id="${id('c')}" cx=".5" cy=".35" r=".7"><stop offset=".4" stop-color="#ffffff"/><stop offset="1" stop-color="#efe7f3"/></radialGradient>`
      + `<radialGradient id="${id('b')}" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#ff9fc4" stop-opacity=".75"/><stop offset="1" stop-color="#ff9fc4" stop-opacity="0"/></radialGradient>`
      + `<radialGradient id="${id('o')}"><stop offset="0" stop-color="#2a1d3a" stop-opacity=".34"/><stop offset=".6" stop-color="#2a1d3a" stop-opacity=".12"/><stop offset="1" stop-color="#2a1d3a" stop-opacity="0"/></radialGradient>`
      + (egg ? evqMiniDefs(id, [ev]) : '') + `</defs>`
      + `<ellipse cx="35" cy="59.4" rx="24" ry="3.2" fill="url(#${id('o')})"/>`
      /* oreilles derrière le crâne (base cachée par la tête) : A debout, B inclinée vers l'arrière, sa pointe repliée qui retombe */
      + `<g transform="${HT}"><g class="evo-ears"><path d="${earB}" fill="url(#${id('k')})" stroke="${ln}" stroke-width=".55" stroke-linejoin="round"/><path d="${earBIn}" fill="url(#${id('e')})"/>`
      + fur('M30.2 15.8C30.4 12.4 31.4 9.6 33.2 7.6M29.6 13.6L30.8 13M30.4 11L31.6 10.6', .32, '#e46a9a', .7)
      + `<path d="${tipB}" fill="url(#${id('k')})" stroke="${ln}" stroke-width=".55" stroke-linejoin="round"/><path d="M33.2 4.2C34.8 4.4 36.4 5 37.4 6" fill="none" stroke="${ln}" stroke-width=".45" stroke-linecap="round" opacity=".7"/>`
      + `<path d="M35.4 3.4Q37.8 3.2 39 5" fill="none" stroke="#fff" stroke-width=".6" stroke-linecap="round" opacity=".9"/><path d="M38.4 9.4Q38.8 10.4 39.4 10.6" fill="none" stroke="#b8a6c8" stroke-width=".4" stroke-linecap="round"/>`
      + `<path d="${earA}" fill="url(#${id('k')})" stroke="${ln}" stroke-width=".55" stroke-linejoin="round"/><path d="${earAIn}" fill="url(#${id('e')})"/>`
      + fur('M20.8 15.6C20.4 12.4 20.4 9.4 20.8 6.8M20.2 13L21 12M20.3 10.2L21.1 9.4', .32, '#e46a9a', .7)
      + `<path d="M18.2 11.6Q17.8 7 19 4" fill="none" stroke="#fff" stroke-width=".7" stroke-linecap="round" opacity=".9"/></g></g>`
      /* queue en pompon, corps, cuisse, grosse patte arrière */
      + `<path d="${tail}" fill="url(#${id('h')})" stroke="${ln}" stroke-width=".5" stroke-linejoin="round"/><path d="${tail2}" fill="#fff"/>`
      + `<path d="${body}" fill="url(#${id('f')})" stroke="${ln}" stroke-width=".6" stroke-linejoin="round"/>`
      + fur('M43.4 37.6Q45.2 38.4 46.2 39.8M47.4 40.8Q48.8 42.2 49.4 43.8M50.2 45.6Q50.8 47.2 50.6 48.8M37.6 36Q39.2 36.2 40.4 36.8', .45)
      + `<path d="M32.6 52.6C32.2 46.4 36 41.8 41.2 41.8C46 41.8 49.2 45.6 48.6 50.4" fill="none" stroke="${ln}" stroke-width=".5" opacity=".55"/>`
      + `<path d="M35 48.2C35.8 45.2 38.2 43.6 41.2 43.6" fill="none" stroke="#fff" stroke-width="1.1" stroke-linecap="round" opacity=".9"/>`
      + fur('M43.8 45.6Q45.4 46.6 46 48.2M43 48.4Q44.4 49.4 44.8 50.8M38.6 46.6Q39.6 47.2 40 48.2', .4)
      + `<path d="M28.4 59C27.8 56.4 30.4 54.8 34.4 54.8L44.6 55C48.4 55.2 50.4 56.6 49.8 58.2C49.4 59.2 47.2 59.4 44.6 59.4H32C30 59.4 28.6 59.6 28.4 59Z" fill="url(#${id('h')})" stroke="${ln}" stroke-width=".55" stroke-linejoin="round"/>`
      + `<path d="M31.4 56.4V58.6M33.4 56V58.6M35.4 56V58.4" fill="none" stroke="${ln}" stroke-width=".4" stroke-linecap="round" opacity=".6"/><path d="M37.4 56Q42.6 55.4 47.6 56.4" fill="none" stroke="#fff" stroke-width=".8" stroke-linecap="round"/>`
      /* poitrail en touffe */
      + `<g transform="translate(.4 2.2)"><path d="M20.4 42C21 38.6 23.8 36.6 27.4 36.6C30.4 36.6 32.2 38.6 32 41.6Q31.6 43 30.6 43.2Q31 44.8 29.6 45.2Q29.6 46.8 28 46.8Q27.4 48.2 25.8 47.8Q24.6 49 23.4 48Q21.8 48.4 21.6 46.8Q20 46.4 20.4 44.8Q19.4 43.6 20.4 42Z" fill="url(#${id('c')})" stroke="#d9cce4" stroke-width=".35"/>`
      + fur('M23.4 41.2Q24 42.6 23.8 44M27 40.4Q27.8 42 27.6 43.6M25.4 44.6Q25.8 45.8 25.6 46.8M29.6 42.4Q30 43.2 29.8 44', .4, '#cdbfdb', .9) + `</g>`

      /* pattes avant (l'œuf entre elles) */
      + `<path d="M18.6 48C18 52 18.6 55.6 20.2 57.8C21.4 58.8 23.6 58.6 24.6 57.6C24.4 55 23.8 52 22.8 49.4Z" fill="url(#${id('h')})" stroke="${ln}" stroke-width=".5" stroke-linejoin="round"/>`
      + (egg ? evqMini(GE, ev, id, `rotate(-12 ${GE.cx} ${GE.cy})`) : '')
      + `<path d="M29.6 48.6C30.6 51.6 30.8 55 30 57.8C29 58.8 27 58.8 26 58C25.8 55.4 26 52.4 26.8 49.6Z" fill="url(#${id('h')})" stroke="${ln}" stroke-width=".5" stroke-linejoin="round"/>`
      + (egg ? `<g fill="url(#${id('h')})" stroke="${ln}" stroke-width=".45"><ellipse cx="20.4" cy="49.8" rx="2.5" ry="2.9" transform="rotate(-24 20.4 49.8)"/><ellipse cx="29.8" cy="49.2" rx="2.3" ry="2.8" transform="rotate(22 29.8 49.2)"/></g>`
        + fur('M19.2 50.6L20.4 51.2M19.6 49.2L20.8 49.8M30.8 50L29.6 50.6M30.6 48.6L29.4 49.2', .35, ln, .6)
        + `<path d="M19.4 48.2Q20.4 47.2 21.6 47.6M28.8 47.2Q30 46.8 30.8 47.8" fill="none" stroke="#fff" stroke-width=".6" stroke-linecap="round"/>` : '')
      + fur('M21.4 57.4V58.4M22.8 57.6V58.6M26.4 57.6V58.6M27.8 57.4V58.4', .35, ln, .6)
      /* tête penchée : joues en touffes, museau, œil, nez, moustaches */
      + `<g transform="${HT}"><path d="${head}" fill="url(#${id('h')})" stroke="${ln}" stroke-width=".6" stroke-linejoin="round"/>`
      + `<path d="M17.6 18.6Q20.6 15.8 25.4 16" fill="none" stroke="#fff" stroke-width="1.3" stroke-linecap="round"/>`
      + fur('M30.6 21Q32.4 22.6 32.8 24.8M31.4 27.4Q32.2 28.8 31.8 30.4M27.6 31.6Q28.6 32.6 28.6 34', .4)
      + `<ellipse cx="17.6" cy="28.4" rx="4.6" ry="3.4" fill="#fff"/><path d="M13.6 28.2C14.4 30.6 16.8 31.8 19.4 31.4" fill="none" stroke="${ln}" stroke-width=".4" opacity=".5"/>`
      + `<ellipse cx="21.2" cy="29.8" rx="3.2" ry="2" fill="url(#${id('b')})"/>`
      + `<ellipse cx="21.8" cy="23.6" rx="2.3" ry="2.8" fill="url(#${id('i')})"/><path d="M19.4 22.4Q21.6 20.2 24.2 21.8" fill="none" stroke="${ln}" stroke-width=".55" stroke-linecap="round"/>`
      + `<path d="M23.6 21.4L24.8 20.4M24.2 22.4L25.6 21.8" fill="none" stroke="${ln}" stroke-width=".4" stroke-linecap="round"/>`
      + `<ellipse cx="21" cy="22.6" rx=".95" ry="1.1" fill="#fff"/><circle cx="22.6" cy="24.9" r=".45" fill="#fff" opacity=".9"/><path d="M20.2 25.2Q21.6 26.4 23.4 25.4" fill="none" stroke="#a88aa8" stroke-width=".35" opacity=".7"/>`
      + `<g class="evo-nose"><path d="M13.3 26.4Q14.6 25.6 15.9 26.4Q15.4 27.8 14.6 28.1Q13.8 27.8 13.3 26.4Z" fill="#ff7aa8" stroke="#c2457e" stroke-width=".3"/><ellipse cx="14.2" cy="26.4" rx=".45" ry=".25" fill="#fff" opacity=".8"/>`
      + `<path d="M14.6 28.1V29.1Q15.2 30.2 16.4 29.8M14.6 29.1Q14 30 13.2 29.8" fill="none" stroke="#9a6a86" stroke-width=".4" stroke-linecap="round"/></g>`
      + `<g fill="#c9b6d4"><circle cx="16.4" cy="28.6" r=".28"/><circle cx="17.4" cy="29.4" r=".28"/><circle cx="16.2" cy="29.8" r=".28"/></g>`
      + `<path d="M16 28.4C12 26.8 8.6 26.4 5.6 26.6M16.2 29.2C12.4 28.6 9 29 6 30M16.4 30C13.2 30.6 10.4 31.8 8 33.4" fill="none" stroke="#9a88aa" stroke-width=".28" stroke-linecap="round" opacity=".8"/>`
      /* là où les oreilles sortent du crâne : touffes de pelage */
      + fur('M18.4 17.2Q19.4 16 20.4 16.6M22.2 16.4Q23.2 15.8 24 16.8M27 17Q28 16 29.2 16.4M30 17.2Q31 16.6 31.8 17.6', .45, '#b8a6c8', .85) + `</g>`
      + `</svg>`;
  },
  /** Panier d'osier garni (viewBox 64 × 64) : anse tressée, herbe, o.eggs œufs (0–7, 3 par défaut : le panier qui se remplit), nœud de ruban, marguerite. */
  basket: (o = {}) => {
    const n = ++EVO_N, id = s => `evo${n}${s}`, f = evoF, R = EVQ_RIB[evqV(o.v === undefined ? 0 : o.v)];
    const hw = y => 23.6 - 8.6 * Math.pow(Math.max(0, (y - 35) / 23.4), 1.6), X = (y, th) => 32 + hw(y) * Math.sin(th), Y = (y, th) => y + 1.4 * Math.cos(th);
    const stakes = [-1.25, -.9, -.6, -.3, 0, .3, .6, .9, 1.25];
    let st = '', wv = ['', ''];
    for (const th of stakes) st += `M${f(X(35.6, th))} ${f(Y(35.6, th))}L${f(X(57.4, th))} ${f(Y(57.4, th))}`;
    for (let r = 0; r < 7; r++) {
      const y = 38 + r * 3;
      for (let j = -1; j < stakes.length; j++) {
        const a = j < 0 ? -1.62 : stakes[j], b = j + 1 < stakes.length ? stakes[j + 1] : 1.62, m = (a + b) / 2, k = (j + r) % 2;
        wv[k] += `M${f(X(y, a + .04))} ${f(Y(y, a))}Q${f(X(y, m))} ${f(Y(y, m) + (k ? .5 : -.5))} ${f(X(y, b - .04))} ${f(Y(y, b))}`;
      }
    }
    let rope = ''; for (let i = 0; i <= 26; i++) { const th = -1.62 + i * 3.24 / 26; rope += `<ellipse cx="${f(X(35, th))}" cy="${f(Y(34.6, th))}" rx="${f(1.9 * Math.max(.5, Math.cos(th)))}" ry="1.6" transform="rotate(-38 ${f(X(35, th))} ${f(Y(34.6, th))})"/>`; }
    const body = `M8.2 34.4C9 44 11.6 51.6 17 56C19.6 58 24 58.8 32 58.8C40 58.8 44.4 58 47 56C52.4 51.6 55 44 55.8 34.4Q32 38.4 8.2 34.4Z`;
    /* œufs dans l'ordre où le panier se remplit (o.eggs : 0–7, 3 par défaut) : [cx, cy, demi-largeur, teinte, inclinaison] ; dessinés du fond vers l'avant */
    const ne = Math.max(0, Math.min(7, o.eggs === undefined ? 3 : Math.floor(Number(o.eggs) || 0)));
    const EG = [[33, 25.6, 7.2, 0, 0], [22, 28.6, 6.4, 3, -16], [43, 28.8, 6.2, 1, 14], [27.4, 21.4, 5.8, 2, -8], [38.6, 21.8, 5.8, 4, 10], [15.4, 31.4, 5.2, 0, -26], [49, 31.6, 5.2, 2, 24]].slice(0, ne)
      .sort((p, q) => p[1] - q[1] || Math.abs(q[0] - 32) - Math.abs(p[0] - 32));
    const eggs = EG.map(([x, y, a, v, r]) => evqMini({ cx: x, cy: y, a, b: a * 1.35, k: .15, s: .8 }, v, id, r ? `rotate(${r} ${x} ${y})` : '')).join('');
    return `<svg class="evo evo-basket${o.cls ? ' ' + o.cls : ''}" viewBox="0 0 64 64" aria-hidden="true" focusable="false"><defs>`
      + `<linearGradient id="${id('w')}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e2ad62"/><stop offset=".6" stop-color="#c38440"/><stop offset="1" stop-color="#8f5a26"/></linearGradient>`
      + `<radialGradient id="${id('s')}" cx=".5" cy=".1" r=".95"><stop offset=".45" stop-color="#3a1f08" stop-opacity="0"/><stop offset="1" stop-color="#3a1f08" stop-opacity=".5"/></radialGradient>`
      + `<linearGradient id="${id('g')}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#b8f08e"/><stop offset="1" stop-color="#4fa046"/></linearGradient>`
      + `<radialGradient id="${id('o')}"><stop offset="0" stop-color="#3a2a10" stop-opacity=".36"/><stop offset="1" stop-color="#3a2a10" stop-opacity="0"/></radialGradient>`
      + `<radialGradient id="${id('r')}" cx=".38" cy=".3" r=".8"><stop offset="0" stop-color="${R[0]}"/><stop offset=".5" stop-color="${R[1]}"/><stop offset="1" stop-color="${R[2]}"/></radialGradient>`
      + evqMiniDefs(id, [0, 1, 2, 3, 4]) + `<clipPath id="${id('c')}"><path d="${body}"/></clipPath></defs>`
      + `<ellipse cx="32" cy="59.6" rx="25" ry="3" fill="url(#${id('o')})"/>`
      + `<path d="M11.4 35.6C10.4 18 20 6.6 32 6.6C44 6.6 53.6 18 52.6 35.6" fill="none" stroke="#6e4216" stroke-width="4.4" stroke-linecap="round"/>`
      + `<path d="M11.4 35.6C10.4 18 20 6.6 32 6.6C44 6.6 53.6 18 52.6 35.6" fill="none" stroke="#c98a44" stroke-width="3"/>`
      + `<path d="M11.4 35.6C10.4 18 20 6.6 32 6.6C44 6.6 53.6 18 52.6 35.6" fill="none" stroke="#f2cf8e" stroke-width="3" stroke-dasharray="1.3 1.5" opacity=".75"/>`
      + `<path d="${evqBlades(9, 55, 36.4, 4, 8.6, 18, 5, 2.2)}" fill="#5fae4c"/>`
      + eggs
      + `<path d="${evqBlades(10, 54, 35.8, 2.8, 6.4, 22, 9, 2)}" fill="url(#${id('g')})" stroke="#3a8a3e" stroke-width=".3"/>`
      + `<path d="${body}" fill="url(#${id('w')})"/><g clip-path="url(#${id('c')})">`
      + `<path d="${st}" stroke="#7a4a1c" stroke-width="2.2" stroke-linecap="round"/><path d="${st}" stroke="#a86f34" stroke-width="1.2" stroke-linecap="round"/>`
      + `<path d="${wv[1]}" fill="none" stroke="#7a4a1c" stroke-width="2.6" stroke-linecap="round"/><path d="${wv[1]}" fill="none" stroke="#b97c3c" stroke-width="1.7" stroke-linecap="round"/>`
      + `<path d="${wv[0]}" fill="none" stroke="#6e4216" stroke-width="2.8" stroke-linecap="round"/><path d="${wv[0]}" fill="none" stroke="#e6b46c" stroke-width="1.9" stroke-linecap="round"/>`
      + `<path d="${wv[0]}" fill="none" stroke="#fff1cf" stroke-width=".5" stroke-linecap="round" transform="translate(-.3 -.45)" opacity=".55"/>`
      + `<path d="${body}" fill="url(#${id('s')})"/></g><path d="${body}" fill="none" stroke="#5a3410" stroke-width=".7"/>`
      + `<g fill="#d99a52" stroke="#6e4216" stroke-width=".45">${rope}</g><path d="M10 34.2Q32 38 54 34.2" fill="none" stroke="#fff1cf" stroke-width=".5" opacity=".6"/>`
      + `<path d="${evqDaisyD(50.6, 32.4, 3.4, 12)}" fill="#fff" stroke="#c9b8e0" stroke-width=".3"/><circle cx="50.6" cy="32.4" r="1.25" fill="#ffd36b" stroke="#d99a1c" stroke-width=".3"/>`
      + evqBow(12.4, 35.4, .4, R, id('r')) + `</svg>`;
  },
  /** Tulipe (viewBox 24 × 48), teinte o.v (0–4 : rose, corail, jaune, lilas, blanc rosé ; sinon rose). */
  tulip: (o = {}) => {
    const n = ++EVO_N, id = s => `evo${n}${s}`, c = EVQ_TULIP[Number(o.v) >= 0 && Number(o.v) <= 4 ? Math.floor(o.v) : 0];
    return `<svg class="evo evo-flower evo-tulip${o.cls ? ' ' + o.cls : ''}" viewBox="0 0 24 48" aria-hidden="true" focusable="false"><defs>${evqStemDefs(id)}`
      + `<linearGradient id="${id('p')}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c[0]}"/><stop offset=".45" stop-color="${c[1]}"/><stop offset="1" stop-color="${c[2]}"/></linearGradient>`
      + `<linearGradient id="${id('q')}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${c[1]}"/><stop offset="1" stop-color="${c[2]}"/></linearGradient></defs>`
      + evqStem(id, 12, 12.4, 20, -1.6)
      + `<g class="evo-head" stroke="${c[3]}" stroke-width=".45" stroke-linejoin="round"><path d="M12.4 3.6C15 6.2 16.6 9.2 16.6 13.4C16.6 18.4 14.8 21.4 12.4 21.6C10 21.4 8.2 18.4 8.2 13.4C8.2 9.2 9.8 6.2 12.4 3.6Z" fill="url(#${id('q')})"/>`
      + `<path d="M12.4 22C8.8 22 6.4 18.6 6.4 14.4C6.4 11 7.4 8.4 8.8 6.6C10 8.8 11.2 11.6 12.6 14.6C13.4 17.4 13.4 20 12.4 22Z" fill="url(#${id('p')})"/>`
      + `<path d="M12.4 22C16 22 18.4 18.6 18.4 14.4C18.4 11 17.4 8.4 16 6.6C14.8 8.8 13.6 11.6 12.2 14.6C11.4 17.4 11.4 20 12.4 22Z" fill="url(#${id('p')})"/>`
      + `<path d="M8.4 10.4Q7.8 14.6 9.4 18.4M16.4 10.6Q17 14 15.8 17.6" fill="none" stroke="#fff" stroke-width=".7" stroke-linecap="round" opacity=".6"/>`
      + `<path d="M12.4 21.4Q11.8 17 12.4 14.4" fill="none" stroke="${c[3]}" stroke-width=".35" opacity=".5"/></g></svg>`;
  },
  /** Jonquille (viewBox 24 × 48) : six pétales jaune pâle, trompette orangée à bord frisé, tige penchée et sa spathe. */
  daffodil: (o = {}) => {
    const n = ++EVO_N, id = s => `evo${n}${s}`, f = evoF, cx = 12.4, cy = 13.6;
    let pet = ''; for (let k = 0; k < 6; k++) { const a = (k * 60 - 90 + 12) * Math.PI / 180, ca = Math.cos(a), sa = Math.sin(a) * .86, P = (u, w) => f(cx + ca * u - sa * w) + ' ' + f(cy + sa * u + ca * w * .86); pet += `M${P(1, 0)}C${P(3.4, 3.4)} ${P(8.4, 2.4)} ${P(9.4, 0)}C${P(8.4, -2.4)} ${P(3.4, -3.4)} ${P(1, 0)}Z`; }
    let rim = ''; for (let i = 0; i <= 16; i++) { const a = i / 16 * 2 * Math.PI, r = 3.9 + (i % 2 ? .45 : 0); rim += `${i ? 'L' : 'M'}${f(cx - 1 + Math.cos(a) * r)} ${f(cy + 1.4 + Math.sin(a) * r * .82)}`; }
    return `<svg class="evo evo-flower evo-daffodil${o.cls ? ' ' + o.cls : ''}" viewBox="0 0 24 48" aria-hidden="true" focusable="false"><defs>${evqStemDefs(id)}`
      + `<radialGradient id="${id('p')}" cx=".5" cy=".5" r=".5"><stop offset=".15" stop-color="#ffe05a"/><stop offset=".55" stop-color="#fff2a0"/><stop offset="1" stop-color="#fffbe0"/></radialGradient>`
      + `<radialGradient id="${id('t')}" cx=".42" cy=".38" r=".7"><stop offset="0" stop-color="#ffd36b"/><stop offset=".6" stop-color="#ffab24"/><stop offset="1" stop-color="#e57a0c"/></radialGradient></defs>`
      + evqStem(id, 12.6, 13.6, 18, 1.6)
      + `<path d="M13.8 19.6C15.6 18.4 16.6 17.2 16.4 15.4C15 16.8 14 17.6 13.2 18.4Z" fill="#d9c08a" stroke="#9a7a3a" stroke-width=".35"/>`
      + `<g class="evo-head"><path d="${pet}" fill="url(#${id('p')})" stroke="#d9a21c" stroke-width=".45" stroke-linejoin="round"/>`
      + `<path d="${rim}Z" fill="url(#${id('t')})" stroke="#c4600a" stroke-width=".45" stroke-linejoin="round"/>`
      + `<ellipse cx="${f(cx - 1)}" cy="${f(cy + 1.4)}" rx="2.4" ry="1.9" fill="#d9640a"/><ellipse cx="${f(cx - 1.2)}" cy="${f(cy + 1.1)}" rx="1.3" ry="1" fill="#a84a06"/>`
      + `<path d="M${f(cx - 3.4)} ${f(cy - .2)}Q${f(cx - 2)} ${f(cy - 1.8)} ${f(cx)} ${f(cy - 1.6)}" fill="none" stroke="#fff6cf" stroke-width=".6" stroke-linecap="round"/>`
      + `<g fill="#ffe9a0"><circle cx="${f(cx - 1.6)}" cy="${f(cy + 1.6)}" r=".35"/><circle cx="${f(cx - .4)}" cy="${f(cy + 1.8)}" r=".35"/><circle cx="${f(cx - 1)}" cy="${f(cy + .8)}" r=".35"/></g></g></svg>`;
  },
  /** Marguerite (viewBox 24 × 48) : seize pétales blancs teintés de lilas, cœur jaune grenu, tige et feuilles. */
  daisy: (o = {}) => {
    const n = ++EVO_N, id = s => `evo${n}${s}`, f = evoF;
    let dots = ''; for (let i = 0; i < 9; i++) { const a = i * 2.4, r = Math.sqrt(i + .5) * .78; dots += `<circle cx="${f(12 + Math.cos(a) * r)}" cy="${f(12.6 + Math.sin(a) * r * .86)}" r=".34"/>`; }
    return `<svg class="evo evo-flower evo-daisy${o.cls ? ' ' + o.cls : ''}" viewBox="0 0 24 48" aria-hidden="true" focusable="false"><defs>${evqStemDefs(id)}`
      + `<radialGradient id="${id('p')}" cx="12" cy="12.6" r="9" gradientUnits="userSpaceOnUse"><stop offset=".3" stop-color="#efe6ff"/><stop offset=".55" stop-color="#ffffff"/><stop offset="1" stop-color="#f7f2ff"/></radialGradient>`
      + `<radialGradient id="${id('c')}" cx=".4" cy=".35" r=".7"><stop offset="0" stop-color="#fff2a0"/><stop offset=".6" stop-color="#ffc93f"/><stop offset="1" stop-color="#e08f12"/></radialGradient></defs>`
      + evqStem(id, 12, 12, 20, -1)
      + `<g class="evo-head"><g transform="translate(0 1.8) scale(1 .86)"><path d="${evqDaisyD(12, 12.6, 9, 16)}" fill="url(#${id('p')})" stroke="#b6a3d6" stroke-width=".4" stroke-linejoin="round"/>`
      + `<path d="${evqDaisyD(12, 12.6, 6.6, 16).replace(/M/g, 'M').slice(0)}" fill="none" stroke="#d8ccef" stroke-width=".3" opacity=".7" transform="rotate(11.25 12 12.6)"/></g>`
      + `<ellipse cx="12" cy="12.6" rx="2.9" ry="2.5" fill="url(#${id('c')})" stroke="#c47a0a" stroke-width=".4"/><g fill="#c47a0a" opacity=".55">${dots}</g>`
      + `<path d="M10.4 11.6Q11.2 10.8 12.4 10.8" fill="none" stroke="#fffbe0" stroke-width=".5" stroke-linecap="round"/></g></svg>`;
  },
  /** Papillon vu de dessus (viewBox 32 × 24), teinte o.v (0–4 : bleu ciel, rose, citron, lilas, menthe) ; ailes dans .evo-wings (battement). */
  butterfly: (o = {}) => {
    const n = ++EVO_N, id = s => `evo${n}${s}`, c = EVQ_BFLY[Number(o.v) >= 0 && Number(o.v) <= 4 ? Math.floor(o.v) : 0];
    const up = 'M16.4 10.2C18.6 4.6 25.4 1.2 29.4 2.8C31.6 3.8 31 8.2 28.8 10.6C26.6 13 21.2 13.2 16.6 12Z', lo = 'M16.6 12.4C21.2 12.2 25.8 14.2 26 17.8C26.2 20.8 23.4 22.6 20.8 21.6C18.6 20.8 17.2 17 16.4 13.4Z';
    const side = `<path d="${up}" fill="url(#${id('u')})"/><path d="${lo}" fill="url(#${id('l')})"/>`;
    const deco = `<path d="${up}${lo}" fill="none" stroke="${c[2]}" stroke-width="2.6"/>`
      + `<g fill="#fff"><circle cx="28.8" cy="4.6" r=".8"/><circle cx="30" cy="7.2" r=".6"/><circle cx="26.6" cy="2.9" r=".55"/><circle cx="23.6" cy="20.6" r=".6"/><circle cx="25.4" cy="18.4" r=".5"/></g>`
      + `<path d="M17 11C20 8.4 23.6 6 27.4 4.6M17 11.4C20.6 10.4 24.4 10 28.2 9.2M17.2 12.8C19.6 14.6 21.6 16.6 23 19.4" fill="none" stroke="${c[3]}" stroke-width=".35" opacity=".45"/>`
      + `<ellipse cx="23.4" cy="7.6" rx="2.2" ry="1.6" transform="rotate(-24 23.4 7.6)" fill="${c[0]}" opacity=".85"/><circle cx="23.4" cy="7.6" r=".8" fill="${c[2]}"/>`;
    return `<svg class="evo evo-bfly${o.cls ? ' ' + o.cls : ''}" viewBox="0 0 32 24" aria-hidden="true" focusable="false"><defs>`
      + `<radialGradient id="${id('u')}" cx="16" cy="12" r="15" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="${c[0]}"/><stop offset=".5" stop-color="${c[1]}"/><stop offset="1" stop-color="${c[2]}"/></radialGradient>`
      + `<radialGradient id="${id('l')}" cx="16" cy="12" r="11" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="${c[0]}"/><stop offset=".6" stop-color="${c[1]}"/><stop offset="1" stop-color="${c[2]}"/></radialGradient>`
      + `<clipPath id="${id('c')}"><path d="${up}${lo}"/></clipPath></defs>`
      + `<g class="evo-wings" stroke-linejoin="round"><g>${side}<g clip-path="url(#${id('c')})">${deco}</g><path d="${up}${lo}" fill="none" stroke="${c[3]}" stroke-width=".5"/></g>`
      + `<g transform="matrix(-1 0 0 1 32 0)">${side}<g clip-path="url(#${id('c')})">${deco}</g><path d="${up}${lo}" fill="none" stroke="${c[3]}" stroke-width=".5"/></g></g>`
      + `<path d="M15.4 7.2Q13.6 3 11.6 2.2M16.6 7.2Q18.4 3 20.4 2.2" fill="none" stroke="#3a2a40" stroke-width=".5" stroke-linecap="round"/><circle cx="11.6" cy="2.2" r=".7" fill="#3a2a40"/><circle cx="20.4" cy="2.2" r=".7" fill="#3a2a40"/>`
      + `<ellipse cx="16" cy="16.2" rx="1.05" ry="4.6" fill="#4a3650"/><ellipse cx="16" cy="10.6" rx="1.4" ry="2.4" fill="#5a4462"/><circle cx="16" cy="7.6" r="1.25" fill="#4a3650"/>`
      + `<path d="M15.3 13.6H16.7M15.3 15.4H16.7M15.4 17.2H16.6" stroke="#8a7590" stroke-width=".35"/><path d="M15.5 9.4Q15.4 10.6 15.6 11.8" fill="none" stroke="#fff" stroke-width=".4" stroke-linecap="round" opacity=".5"/></svg>`;
  },
  /** Cloche de Pâques ailée (viewBox 64 × 64) : bronze doré gravé, ailes de plumes blanches (.evo-wing-l, .evo-wing-r battent), nœud de ruban ; .evo-bell-b se balance ;
   *  o.drop : elle lâche deux œufs (.evo-drop). */
  wingedBell: (o = {}) => {
    const n = ++EVO_N, id = s => `evo${n}${s}`, R = EVQ_RIB[evqV(o.v === undefined ? 0 : o.v)];
    const W = evqWing(id('w'));
    return `<svg class="evo evo-wbell${o.cls ? ' ' + o.cls : ''}" viewBox="0 0 64 64" aria-hidden="true" focusable="false"><defs>`
      + `<radialGradient id="${id('b')}" cx=".36" cy=".3" r=".85"><stop offset="0" stop-color="#fff6c8"/><stop offset=".35" stop-color="#f4cf5a"/><stop offset=".75" stop-color="#d49a26"/><stop offset="1" stop-color="#8f5e0c"/></radialGradient>`
      + `<linearGradient id="${id('l')}" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#9a6a10"/><stop offset=".3" stop-color="#ffe9a0"/><stop offset=".6" stop-color="#e3ad35"/><stop offset="1" stop-color="#7a5205"/></linearGradient>`
      + `<linearGradient id="${id('w')}" x1="1" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset=".6" stop-color="#f4eefb"/><stop offset="1" stop-color="#d6cbe8"/></linearGradient>`
      + `<radialGradient id="${id('r')}" cx=".38" cy=".3" r=".8"><stop offset="0" stop-color="${R[0]}"/><stop offset=".5" stop-color="${R[1]}"/><stop offset="1" stop-color="${R[2]}"/></radialGradient>`
      + `<radialGradient id="${id('g')}" cx="32" cy="32" r="30" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#fff2b8" stop-opacity=".5"/><stop offset="1" stop-color="#fff2b8" stop-opacity="0"/></radialGradient>${o.drop ? evqMiniDefs(id, [2, 3]) : ''}</defs>`
      + `<circle class="evo-glow" cx="32" cy="32" r="30" fill="url(#${id('g')})"/>`
      + `<g class="evo-bell-b"><g class="evo-wings"><g class="evo-wing-l">${W}</g><g class="evo-wing-r"><g transform="matrix(-1 0 0 1 64 0)">${W}</g></g></g>`
      + `<circle cx="32" cy="49" r="2.7" fill="url(#${id('b')})" stroke="#6e4a05" stroke-width=".55"/>`
      + `<path d="M32 14C24.6 14 22 20 21.4 27C20.8 34 19.6 39 15.6 42.6Q32 47.8 48.4 42.6C44.4 39 43.2 34 42.6 27C42 20 39.4 14 32 14Z" fill="url(#${id('b')})" stroke="#6e4a05" stroke-width=".7" stroke-linejoin="round"/>`
      + `<path d="M15.6 42.6Q32 47.8 48.4 42.6L48.8 45.2Q32 50.8 15.2 45.2Z" fill="url(#${id('l')})" stroke="#6e4a05" stroke-width=".6" stroke-linejoin="round"/>`
      + `<path d="M22.6 21.4Q32 23.8 41.4 21.4M22 23.4Q32 25.8 42 23.4M19.4 38.4Q32 42 44.6 38.4" fill="none" stroke="#8f5e0c" stroke-width=".55" opacity=".7"/>`
      + `<path d="M22.6 22Q32 24.4 41.4 22M19.6 39Q32 42.6 44.4 39" fill="none" stroke="#fff3c4" stroke-width=".4" opacity=".7"/>`
      + `<g transform="translate(32 31.6)"><path d="${EVQ_FLOWER}" transform="scale(3)" fill="#fff3c4" stroke="#b07a10" stroke-width=".18"/><circle r="1.1" fill="#d49a26"/></g>`
      + `<path d="M25.8 18.6C24.2 22 23.6 28 23.4 33" fill="none" stroke="#fff" stroke-width="1.4" stroke-linecap="round" opacity=".55"/>`
      + `<path d="M28.6 14.6Q32 10.4 35.4 14.6" fill="none" stroke="#8f5e0c" stroke-width="1.6"/>`
      + evqBow(32, 12.8, .5, R, id('r')) + `</g>`
      + (o.drop ? `<g class="evo-drop"><path d="M17.4 46.6V50.4M20.6 47.6V50.6M44.2 49.6V53.4M47.4 50.6V53.6" stroke="#b9acd2" stroke-width=".8" stroke-linecap="round"/>`
        + evqMini({ cx: 19, cy: 56.6, a: 3.8, b: 5.1, k: .15, s: .5 }, 2, id, 'rotate(-18 19 56.6)') + evqMini({ cx: 45.8, cy: 59.2, a: 3.4, b: 4.6, k: .15, s: .5 }, 3, id, 'rotate(16 45.8 59.2)') + `</g>` : '')
      + `</svg>`;
  },
  /** Éclosion (viewBox 64 × 64), o.stage : 0 œuf intact, 1 fêlé, 2 le poussin regarde par un trou, 3 éclos (poussin dans sa coquille, dans l'herbe) ; o.v teinte. */
  hatch: (o = {}) => {
    const st = Math.max(0, Math.min(3, Math.floor(Number(o.stage) || 0)));
    if (st < 3) return EV_ART.egg({ ...o, crack: st, cls: ((o.cls || '') + ' evo-hatch evo-hatch-' + st).trim() });
    const n = ++EVO_N, id = s => `evo${n}${s}`;
    return `<svg class="evo evo-hatch evo-hatch-3${o.cls ? ' ' + o.cls : ''}" viewBox="0 0 64 64" aria-hidden="true" focusable="false"><defs>`
      + `<radialGradient id="${id('g')}" cx="32" cy="36" r="30" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#fff6c4" stop-opacity=".9"/><stop offset=".5" stop-color="#ffe07a" stop-opacity=".3"/><stop offset="1" stop-color="#ffe07a" stop-opacity="0"/></radialGradient>`
      + `<linearGradient id="${id('gr')}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9be27a"/><stop offset="1" stop-color="#3f9a4e"/></linearGradient></defs>`
      + `<circle class="evo-glow" cx="32" cy="36" r="30" fill="url(#${id('g')})"/><path d="${evqBlades(12, 52, 59.4, 3, 7, 13, 5, 2)}" fill="#3f8f45"/>`
      + EV_ART.chick().replace('<svg ', '<svg x="6" y="6" width="52" height="52" ')
      + `<path d="${evqBlades(10, 54, 61, 3.4, 8, 16, 11, 2.1)}" fill="url(#${id('gr')})" stroke="#2f7a3a" stroke-width=".35"/>`
      + `<g fill="#fffbe6" stroke="#d9a21c" stroke-width=".3">${[[9, 14, 2.6], [55, 12, 2.2], [52, 34, 1.6]].map(([x, y, r]) => `<path d="${evnSpark(x, y, r)}"/>`).join('')}</g></svg>`;
  },
  /** Nœud de ruban satiné (viewBox 32 × 24), teinte o.v (0–4, comme les œufs ; sinon rose). */
  ribbon: (o = {}) => {
    const n = ++EVO_N, id = s => `evo${n}${s}`, R = EVQ_RIB[evqV(o.v === undefined ? 0 : o.v)];
    return `<svg class="evo evo-ribbon${o.cls ? ' ' + o.cls : ''}" viewBox="0 0 32 24" aria-hidden="true" focusable="false"><defs>`
      + `<radialGradient id="${id('r')}" cx=".38" cy=".3" r=".8"><stop offset="0" stop-color="${R[0]}"/><stop offset=".5" stop-color="${R[1]}"/><stop offset="1" stop-color="${R[2]}"/></radialGradient></defs>`
      + evqBow(16, 9.6, .96, R, id('r')) + `</svg>`;
  },
});

/* ── Pâques : ambiance (accueil) ───────────────────────────────────────────────────────────────────────────────────────────────────────────
   Matin de printemps : lueurs rose, menthe et soleil, soleil dont les rayons tournent lentement, deux nuages, pré fleuri en bas de l'écran (herbe, tulipes,
   jonquilles, marguerites, œufs cachés ; deux bouquets qui ondulent au vent), lapin assis devant, un œuf entre les pattes, sa touffe d'herbe aux pieds (oreilles qui frémissent), deux cloches ailées qui
   passent de loin en loin (elles reviennent de Rome). Éléments animés : 2 lueurs + 1 soleil + 2 bouquets + 1 lapin + 2 vols + 2 battements d'ailes = 10. */
/** Soleil de printemps (viewBox 100 × 100) : halo, seize rayons (.evq-sun-r tourne), disque doré, reflet. */
function evqSun() {
  const n = ++EVO_N, f = evoF; let r = '';
  for (let i = 0; i < 16; i++) { const a = i * 22.5 * Math.PI / 180, l = i % 2 ? 40 : 47, w = i % 2 ? .07 : .09, P = (b, d) => f(50 + Math.cos(b) * d) + ' ' + f(50 + Math.sin(b) * d); r += `M${P(a - w, 24)}L${P(a, l)}L${P(a + w, 24)}Z`; }
  return `<svg viewBox="0 0 100 100" aria-hidden="true" focusable="false"><defs><radialGradient id="evq${n}h"><stop offset=".2" stop-color="#fff2b0" stop-opacity=".9"/><stop offset=".55" stop-color="#ffe07a" stop-opacity=".3"/><stop offset="1" stop-color="#ffd36b" stop-opacity="0"/></radialGradient>`
    + `<radialGradient id="evq${n}d" cx=".4" cy=".36" r=".7"><stop offset="0" stop-color="#fffdf0"/><stop offset=".5" stop-color="#ffe680"/><stop offset="1" stop-color="#ffbf3a"/></radialGradient>`
    + `<linearGradient id="evq${n}r" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffe68a"/><stop offset="1" stop-color="#ffc24a"/></linearGradient></defs>`
    + `<circle cx="50" cy="50" r="50" fill="url(#evq${n}h)"/><g class="evq-sun-r"><path d="${r}" fill="url(#evq${n}r)" opacity=".85"/></g>`
    + `<circle cx="50" cy="50" r="20" fill="url(#evq${n}d)" stroke="#f2a92a" stroke-width=".8"/><path d="M38 44A13 13 0 0 1 48 34.6" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" opacity=".7"/></svg>`;
}
/** Nuage (viewBox 120 × 56) : bosses blanches, ventre lilas, liseré clair. */
function evqCloud() {
  const n = ++EVO_N, B = [[28, 38, 15], [48, 26, 19], [72, 24, 16], [90, 36, 14], [60, 40, 16], [38, 44, 12], [82, 44, 11]];
  return `<svg viewBox="0 0 120 56" aria-hidden="true" focusable="false"><defs><linearGradient id="evq${n}c" x1="0" y1="0" x2="0" y2="1"><stop offset=".3" stop-color="#ffffff"/><stop offset="1" stop-color="#e4dcf4"/></linearGradient></defs>`
    + `<g fill="#cfc2e6" opacity=".55" transform="translate(1.6 2.2)">${B.map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}"/>`).join('')}</g>`
    + `<g fill="url(#evq${n}c)">${B.map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}"/>`).join('')}</g>`
    + `<path d="M36 22A16 16 0 0 1 58 12M68 14A12 12 0 0 1 82 16" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round"/></svg>`;
}
/** Pré fleuri du bas de l'écran (viewBox 1200 × 84, rogné au milieu sur un téléphone) : herbe de fond, fleurs (deux bouquets .evq-sway ondulent), œufs cachés, herbe de devant. */
function evqMeadow() {
  const n = ++EVO_N, id = s => `evq${n}${s}`, Q = (k, o) => EV_ART[k](o).replace('<svg ', `<svg id="${id(k + (o.v === undefined ? '' : o.v))}" `);
  const F = [['tulip', 0], ['daisy'], ['tulip', 2], ['daffodil'], ['tulip', 3], ['daisy'], ['tulip', 0], ['daffodil'], ['tulip', 3], ['daisy']];
  const at = (k, v, x, h) => `<use href="#${id(k + (v === undefined ? '' : v))}" x="${evoF(x - h / 4)}" y="${84 - h}" width="${evoF(h / 2)}" height="${h}"/>`;
  const fl = (x0, x1, seed) => { let o = '', s = seed * 977; const r = () => (s = (s * 9301 + 49297) % 233280) / 233280; for (let x = x0 + r() * 14; x < x1; x += 16 + r() * 44) { const [k, v] = F[Math.floor(r() * F.length)]; o += at(k, v, x, x > 680 && x < 1130 ? 26 + r() * 12 : 34 + r() * 30); } return o; };      // là où s'assoit le lapin (selon la largeur de l'écran) : fleurs basses, jamais devant son museau
  const eggs = [[0, 236, 70], [4, 472, 71], [1, 700, 69], [3, 930, 70], [2, 1080, 71]].map(([v, x, y], i) => evqMini({ cx: x, cy: y, a: 5.2, b: 7, k: .15, s: .6 }, v, id, `rotate(${[-14, 10, -6, 12, -10][i]} ${x} ${y})`)).join('');
  return (`<svg viewBox="0 0 1200 84" preserveAspectRatio="xMidYMax slice" aria-hidden="true" focusable="false"><defs>`
    + `<linearGradient id="${id('h')}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#bdeca0" stop-opacity="0"/><stop offset=".55" stop-color="#a6e08a" stop-opacity=".55"/><stop offset="1" stop-color="#7cc96a" stop-opacity=".8"/></linearGradient>`
    + `<linearGradient id="${id('g')}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9be27a"/><stop offset="1" stop-color="#3f9a4e"/></linearGradient>`
    + evqMiniDefs(id, [0, 1, 2, 3, 4]) + Q('tulip', { v: 0 }) + Q('tulip', { v: 2 }) + Q('tulip', { v: 3 }) + Q('daisy', {}) + Q('daffodil', {}) + `</defs>`
    + `<path d="M0 84V58C120 44 220 52 330 56C460 60 540 42 680 46C820 50 900 60 1010 52C1100 46 1160 50 1200 54V84Z" fill="url(#${id('h')})"/>`
    + `<path d="${evqBlades(0, 1200, 84, 12, 30, 90, 3, 6)}" fill="#8fd47a" opacity=".75"/>`
    + fl(10, 380, 5) + `<g class="evq-sway evq-sw1">${fl(390, 600, 11)}</g>` + fl(610, 820, 2) + `<g class="evq-sway evq-sw2">${fl(830, 1000, 7)}</g>` + fl(1010, 1200, 13)
    + eggs + `<path d="${evqBlades(0, 1200, 85, 6, 18, 130, 8, 5)}" fill="url(#${id('g')})" stroke="#3a8a3e" stroke-width=".4"/></svg>`).replace(/(\d\.\d)\d/g, '$1');
}
EV_AMB.paques = () => '<i class="evq-glow evq-g1"></i><i class="evq-glow evq-g2"></i><i class="evq-glow evq-g3"></i>'
  + `<span class="evq-sun">${evqSun()}</span><span class="evq-cloud evq-cl1">${evqCloud()}</span><span class="evq-cloud evq-cl2">${evqCloud()}</span>`
  + `<span class="evq-bell evq-b1">${EV_ART.wingedBell({ v: 0 })}</span><span class="evq-bell evq-b2">${EV_ART.wingedBell({ v: 4 })}</span>`
  + `<span class="evq-meadow">${evqMeadow()}</span><span class="evq-bunny">${EV_ART.bunny({ v: 2 })}`
  + `<svg class="evq-tuft" viewBox="0 0 64 14" preserveAspectRatio="none" aria-hidden="true" focusable="false"><path d="${evqBlades(0, 64, 14.4, 4, 11, 22, 6, 2.4)}" fill="#5fae4c"/><path d="${evqBlades(2, 62, 14.6, 3, 8, 20, 12, 2.2)}" fill="#8fd47a" stroke="#3a8a3e" stroke-width=".3"/></svg></span>`;

/* Particules de la récolte : œuf, marguerite, tulipe, poussin, papillon, tête de lapin */
EV_FX.paques = () => {
  const G = { cx: 12, cy: 12.8, a: 7.2, b: 9.8, k: .15, s: .7 }, egg = evqEggD(G, 20), z = evqLine(G, 12.8, { zig: 1.4, n: 8 }), n = ++EVO_N;
  return [
    EVO_FXS(egg, '#ff9cc6', `<clipPath id="evq${n}x"><path d="${egg}"/></clipPath><g clip-path="url(#evq${n}x)"><path d="${evqBand(G, 10.6, 15.2, 10)}" fill="#c93a78"/><path d="${z}" fill="none" stroke="#fff3d6" stroke-width="1"/></g><path d="${egg}" fill="none" stroke="rgba(30,10,40,.55)" stroke-width=".8"/><path d="M8.4 6Q6.8 8 6.4 10.6" fill="none" stroke="#fff" stroke-width="1" stroke-linecap="round"/>`),      // œuf
    EVO_FXS(evqDaisyD(12, 12, 10.6, 14), '#ffffff', '<circle cx="12" cy="12" r="3.4" fill="#ffc93f" stroke="rgba(30,10,40,.55)" stroke-width=".7"/><circle cx="11" cy="11" r="1" fill="#fff6c4"/>'),      // marguerite
    EVO_FXS('M12 21.4C7.4 21.4 4.6 17.6 4.6 12.6C4.6 8.6 6 5.4 7.8 3.4C9.4 5.8 10.8 8.4 12 11.4C13.2 8.4 14.6 5.8 16.2 3.4C18 5.4 19.4 8.6 19.4 12.6C19.4 17.6 16.6 21.4 12 21.4Z', '#ff7fb4',
      '<path d="M12 21.4C10.2 18.6 9.8 15 12 11.4C14.2 15 13.8 18.6 12 21.4Z" fill="#d63c7e"/><path d="M7 9.8Q6.4 13.6 7.8 17" fill="none" stroke="#fff" stroke-width="1" stroke-linecap="round" opacity=".7"/>'),      // tulipe
    EVO_FXS('M12 3.6A8.4 8.4 0 1 1 11.99 3.6Z', '#ffd84a', '<ellipse cx="9" cy="10.6" rx="1.2" ry="1.5" fill="#2a1d14"/><ellipse cx="15" cy="10.6" rx="1.2" ry="1.5" fill="#2a1d14"/><circle cx="9.4" cy="10" r=".45" fill="#fff"/><circle cx="15.4" cy="10" r=".45" fill="#fff"/><path d="M10.2 13.2L12 12.2L13.8 13.2L12 15.6Z" fill="#ff9a2e" stroke="rgba(30,10,40,.55)" stroke-width=".6" stroke-linejoin="round"/><ellipse cx="6.8" cy="14" rx="1.5" ry=".9" fill="#ff8fb0" opacity=".7"/><ellipse cx="17.2" cy="14" rx="1.5" ry=".9" fill="#ff8fb0" opacity=".7"/><path d="M10.4 3.8Q11 1.4 13 2.2" fill="none" stroke="#e6a417" stroke-width="1" stroke-linecap="round"/>'),      // poussin
    EVO_FXS('M11.4 11.2C9.6 6 4.4 2.6 2 4.2C.6 5.4 1.6 9.6 4.4 11.4C2.4 12.6 2.2 16.6 4.6 18C7 19.4 10.2 16.6 11.4 13.2ZM12.6 11.2C14.4 6 19.6 2.6 22 4.2C23.4 5.4 22.4 9.6 19.6 11.4C21.6 12.6 21.8 16.6 19.4 18C17 19.4 13.8 16.6 12.6 13.2Z', '#8fcaff',
      '<g fill="#fff"><circle cx="4.4" cy="6" r=".9"/><circle cx="19.6" cy="6" r=".9"/></g><g fill="#3d7fd6"><circle cx="7.4" cy="8.2" r="1.3"/><circle cx="16.6" cy="8.2" r="1.3"/></g><ellipse cx="12" cy="13" rx="1.1" ry="5" fill="#4a3650"/><path d="M11.4 8.4Q10.4 5.4 8.6 4.6M12.6 8.4Q13.6 5.4 15.4 4.6" fill="none" stroke="#4a3650" stroke-width=".7" stroke-linecap="round"/>'),      // papillon
    EVO_FXS('M7.6 12.2C6.8 8 6.2 3.2 7.8 1.6C9.4 0 10.6 2.4 10.8 6.6L11.2 9.6H12.8L13.2 6.6C13.4 2.4 14.6 0 16.2 1.6C17.8 3.2 17.2 8 16.4 12.2C18.4 13.6 19.2 15.6 18.8 17.8C18.2 21 15.4 22.6 12 22.6C8.6 22.6 5.8 21 5.2 17.8C4.8 15.6 5.6 13.6 7.6 12.2Z', '#ffffff',
      '<path d="M8.4 9.8C8 7 7.8 4.2 8.4 3.2C9 2.6 9.4 4 9.6 6.6L9.8 9.6ZM15.6 9.8C16 7 16.2 4.2 15.6 3.2C15 2.6 14.6 4 14.4 6.6L14.2 9.6Z" fill="#ffa6c8"/><ellipse cx="9.4" cy="15.6" rx="1.1" ry="1.4" fill="#2b1d33"/><ellipse cx="14.6" cy="15.6" rx="1.1" ry="1.4" fill="#2b1d33"/><path d="M11 18.2Q12 17.6 13 18.2Q12.6 19.2 12 19.4Q11.4 19.2 11 18.2Z" fill="#ff7aa8"/><ellipse cx="7.6" cy="18.4" rx="1.4" ry=".8" fill="#ffa6c8" opacity=".7"/><ellipse cx="16.4" cy="18.4" rx="1.4" ry=".8" fill="#ffa6c8" opacity=".7"/>'),      // lapin
  ];
};

/** Pétales et papillons sur l'accueil (couche du dessus) : 5 pétales de cerisier qui tombent en voletant (chute, tournoiement), 2 papillons qui traversent
 *  (vol, battement d'ailes) ; bordés d'un trait plus foncé : visibles sur fond clair comme sur fond sombre. */
EV_AMB_TOP.paques = () => {
  const petal = (c, e) => { const n = ++EVO_N; return `<svg class="evo evo-petal" viewBox="0 0 16 16" aria-hidden="true" focusable="false"><defs><linearGradient id="evq${n}p" x1="0" y1="1" x2=".6" y2="0"><stop offset="0" stop-color="${c[0]}"/><stop offset="1" stop-color="${c[1]}"/></linearGradient></defs>`
    + `<path d="M8 15C4.2 12.4 2.2 9 2.6 5.6C3 2.8 5 1.4 6.6 2.2L8 3.8L9.4 2.2C11 1.4 13 2.8 13.4 5.6C13.8 9 11.8 12.4 8 15Z" fill="url(#evq${n}p)" stroke="${e}" stroke-width=".6" stroke-linejoin="round"/>`
    + `<path d="M8 13.4V6.4M8 10L5.8 7.6M8 10L10.2 7.6" fill="none" stroke="#fff" stroke-width=".5" stroke-linecap="round" opacity=".6"/></svg>`; };
  const P = [petal(['#ff9cc6', '#ffe3ef'], '#c2457e'), petal(['#ffd6e8', '#ffffff'], '#d27aa4'), petal(['#ffb3d1', '#fff0f6'], '#c2457e'), petal(['#ffe1ee', '#ffffff'], '#d27aa4'), petal(['#ff8fbd', '#ffd6e8'], '#b03a70')];
  return P.map((s, i) => `<span class="evq-pt evq-p${i + 1}"><span class="evq-pt-s">${s}</span></span>`).join('')
    + [0, 2].map((v, i) => `<span class="evq-bf evq-f${i + 1}"><span class="evq-bf-s">${EV_ART.butterfly({ v })}</span></span>`).join('');
};

if (typeof module !== 'undefined' && module.exports) module.exports = { EV_ART, EV_AMB, EV_AMB_TOP, EV_FX, EV_CONS, evGarland };
