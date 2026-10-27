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
   EV_AMB.paques (soleil, nuages, pré fleuri, lapin), EV_AMB_TOP.paques (pétales, papillon, cloches qui passent), EV_FX.paques : ambiance, couche du
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
   jonquilles, marguerites, œufs cachés ; deux bouquets qui ondulent au vent), lapin assis devant, un œuf entre les pattes, sa touffe d'herbe aux pieds (oreilles qui frémissent).
   Les cloches ailées passent dans la couche du dessus (EV_AMB_TOP.paques), devant le contenu. Éléments animés : 2 lueurs + 1 soleil + 2 bouquets + 1 lapin = 6. */
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

/** Couche du dessus de l'accueil (devant le contenu, ne capte aucun toucher) : 3 pétales de cerisier qui tombent en voletant (chute, tournoiement),
 *  1 papillon qui traverse (vol, battement d'ailes), 2 cloches de Pâques ailées qui passent dans le haut de l'écran (vol, battement d'ailes ; chacune porte deux
 *  œufs, montrés seulement quand elles sont revenues de Rome : html[data-evphase="bells"]) : 12 éléments animés. Bordés d'un trait plus foncé : visibles sur
 *  fond clair comme sur fond sombre. */
EV_AMB_TOP.paques = () => {
  const petal = (c, e) => { const n = ++EVO_N; return `<svg class="evo evo-petal" viewBox="0 0 16 16" aria-hidden="true" focusable="false"><defs><linearGradient id="evq${n}p" x1="0" y1="1" x2=".6" y2="0"><stop offset="0" stop-color="${c[0]}"/><stop offset="1" stop-color="${c[1]}"/></linearGradient></defs>`
    + `<path d="M8 15C4.2 12.4 2.2 9 2.6 5.6C3 2.8 5 1.4 6.6 2.2L8 3.8L9.4 2.2C11 1.4 13 2.8 13.4 5.6C13.8 9 11.8 12.4 8 15Z" fill="url(#evq${n}p)" stroke="${e}" stroke-width=".6" stroke-linejoin="round"/>`
    + `<path d="M8 13.4V6.4M8 10L5.8 7.6M8 10L10.2 7.6" fill="none" stroke="#fff" stroke-width=".5" stroke-linecap="round" opacity=".6"/></svg>`; };
  const P = [petal(['#ff9cc6', '#ffe3ef'], '#c2457e'), petal(['#ffd6e8', '#ffffff'], '#d27aa4'), petal(['#ff8fbd', '#ffd6e8'], '#b03a70')];
  return P.map((s, i) => `<span class="evq-pt evq-p${i + 1}"><span class="evq-pt-s">${s}</span></span>`).join('')
    + `<span class="evq-bf evq-f1"><span class="evq-bf-s">${EV_ART.butterfly({ v: 0 })}</span></span>`
    + `<span class="evq-bell evq-b1">${EV_ART.wingedBell({ v: 0, drop: true })}</span><span class="evq-bell evq-b2">${EV_ART.wingedBell({ v: 4, drop: true })}</span>`;
};

/* ── Pâques : œuf d'or et retour des cloches (récompenses, scène du dimanche de Pâques) ───────────────────────────────────────────────────────── */
Object.assign(EV_ART, {
  /* Récompenses (viewBox 24 × 24, aplats, 20–28 px), classe « evo evo-rw » comme celles de Noël et du Nouvel an */
  /** Œuf d'or : treillis gravé, cabochon rose, étincelle. */
  rwGold: (o = {}) => {
    const G = { cx: 11.4, cy: 13.2, a: 7.4, b: 9.8, k: .15, s: .7 }, d = evqEggD(G, 20), n = ++EVO_N;
    return `<svg class="evo evo-rw evo-rw-gold${o.cls ? ' ' + o.cls : ''}" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><defs><clipPath id="evo${n}c"><path d="${d}"/></clipPath></defs>`
      + `<path d="${d}" fill="#f2c230"/><g clip-path="url(#evo${n}c)"><path d="M2 12L12 2M2 20L20 2M6 24L22 8M2 6L18 22M2 -2L22 18M8 2L22 16" stroke="#b07a10" stroke-width=".8"/>`
      + `<path d="${evqBand(G, 9.6, 11, 8)}${evqBand(G, 16.2, 17.6, 8)}" fill="#ffe680"/><path d="M15.4 4.4Q20 9 18.4 18.4" fill="none" stroke="#b07a10" stroke-width="2.4" opacity=".45"/></g>`
      + `<path d="${d}" fill="none" stroke="#7a5205" stroke-width=".8"/><ellipse cx="11.4" cy="14" rx="1.7" ry="2.1" fill="#ff5f9e" stroke="#7a5205" stroke-width=".5"/>`
      + `<path d="M7.6 6.6Q6 8.6 5.6 11.4" fill="none" stroke="#fff" stroke-width="1" stroke-linecap="round"/><path d="${evnSpark(19.6, 4.6, 3.2)}" fill="#fff6cc" stroke="#8a5a05" stroke-width=".45" stroke-linejoin="round"/></svg>`;
  },
  /** Cloche de Pâques : cloche d'or, ailes blanches, nœud rose. */
  rwBell: (o = {}) => `<svg class="evo evo-rw evo-rw-bell${o.cls ? ' ' + o.cls : ''}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">`
    + `<g fill="#fff" stroke="#7d6aa8" stroke-width=".5">${[[6.4, 8.8, 4.8, 1.6, 34], [5.4, 11.4, 5, 1.5, 16], [6, 13.8, 4, 1.3, 2]].map(([x, y, a, b, r]) => `<ellipse cx="${x}" cy="${y}" rx="${a}" ry="${b}" transform="rotate(${r} ${x} ${y})"/><ellipse cx="${24 - x}" cy="${y}" rx="${a}" ry="${b}" transform="rotate(${-r} ${24 - x} ${y})"/>`).join('')}</g>`
    + `<circle cx="12" cy="20.4" r="1.6" fill="#b07a10" stroke="#5e3f05" stroke-width=".5"/>`
    + `<path d="M12 5.6C8.6 5.6 7.6 8.6 7.4 11.6C7.2 14.4 6.4 16 5 17.2Q12 19.6 19 17.2C17.6 16 16.8 14.4 16.6 11.6C16.4 8.6 15.4 5.6 12 5.6Z" fill="#f4c542" stroke="#6e4a05" stroke-width=".7" stroke-linejoin="round"/>`
    + `<path d="M5 17.2Q12 19.6 19 17.2V18.4Q12 21 5 18.4Z" fill="#d9a42a" stroke="#6e4a05" stroke-width=".5" stroke-linejoin="round"/><path d="M9.6 8.6Q8.6 11 8.6 14" fill="none" stroke="#fff" stroke-width=".9" stroke-linecap="round" opacity=".7"/>`
    + `<path d="M12 5.4C10.2 3.4 7.8 3.4 8 4.8C8.2 6 10.4 6 12 5.4ZM12 5.4C13.8 3.4 16.2 3.4 16 4.8C15.8 6 13.6 6 12 5.4Z" fill="#ff8fbd" stroke="#7a1f4c" stroke-width=".5" stroke-linejoin="round"/><circle cx="12" cy="5.4" r=".95" fill="#ff6fae" stroke="#7a1f4c" stroke-width=".4"/></svg>`,
  /** Retour des cloches (viewBox 360 × 320, pleine largeur) : trois cloches ailées arrivent en arc depuis le haut (elles reviennent de Rome) et lâchent des
   *  œufs peints qui tombent dans l'herbe, étincelles. Classes : .evq-bf-bell, .evq-bf-egg, .evq-bf-spk (--i : rang, décale l'animation) ; animée une fois
   *  dans .nest-bells.on (css/ev-paques.css) ; sans .on, ou « réduire les animations » : la scène finale, fixe. */
  bellFlight: () => {
    const n = ++EVO_N, id = s => `evq${n}${s}`;
    const B = [[14, 52, 114, 0, 1], [122, 16, 126, 4, 0], [234, 58, 112, 2, 2]];      // [x, y, taille, teinte du ruban, rang]
    const E = [[44, 280, 0, -14, -10, -190], [98, 290, 3, 10, 22, -210], [154, 282, 1, -8, 6, -230], [208, 292, 4, 12, 2, -230], [262, 282, 2, -12, -6, -200], [316, 290, 0, 9, 4, -190]];
    const spk = [[70, 250, 7], [128, 244, 6], [182, 252, 8], [238, 246, 6], [292, 250, 7], [344, 262, 5], [16, 40, 6], [346, 30, 7]];
    return `<svg class="evq-flight" viewBox="0 0 360 320" preserveAspectRatio="xMidYMax meet" aria-hidden="true" focusable="false"><defs>`
      + `<radialGradient id="${id('s')}" cx="180" cy="90" r="190" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#fff4c4" stop-opacity=".75"/><stop offset=".6" stop-color="#ffd6e8" stop-opacity=".2"/><stop offset="1" stop-color="#ffd6e8" stop-opacity="0"/></radialGradient>`
      + `<linearGradient id="${id('g')}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#b8f08e"/><stop offset="1" stop-color="#3f9a4e"/></linearGradient>`
      + `<linearGradient id="${id('h')}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#a6e08a" stop-opacity="0"/><stop offset=".5" stop-color="#a6e08a" stop-opacity=".7"/><stop offset="1" stop-color="#6fbf5c"/></linearGradient>`
      + evqMiniDefs(id, [0, 1, 2, 3, 4]) + `</defs>`
      + `<circle cx="180" cy="90" r="190" fill="url(#${id('s')})"/>`
      + `<path d="M0 320V284C60 272 120 280 180 278C240 276 300 270 360 280V320Z" fill="url(#${id('h')})"/><path d="${evqBlades(0, 360, 320, 14, 34, 60, 4, 5)}" fill="#8fd47a" opacity=".8"/>`
      + B.map(([x, y, w, v, i]) => `<g class="evq-bf-bell" style="--i:${i / 2}">${EV_ART.wingedBell({ v }).replace('<svg ', `<svg x="${x}" y="${y}" width="${w}" height="${w}" `)}</g>`).join('')
      + E.map(([x, y, v, r, dx, dy], i) => `<g class="evq-bf-egg" style="--i:${i};--dx:${dx}px;--dy:${dy}px;--r:${-r * 3}deg">${evqMini({ cx: x, cy: y, a: 13, b: 17.6, k: .15, s: 1.4 }, v, id, `rotate(${r} ${x} ${y})`)}</g>`).join('')
      + `<path d="${evqBlades(0, 360, 321, 8, 22, 80, 9, 4.6)}" fill="url(#${id('g')})" stroke="#3a8a3e" stroke-width=".5"/>`
      + spk.map(([x, y, r], i) => `<path class="evq-bf-spk" style="--i:${i}" d="${evnSpark(x, y, r)}" fill="#fffbe0" stroke="#e0a01c" stroke-width=".6"/>`).join('')
      + `</svg>`;
  },
});

/* ── Anniversaire de Magic ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────
   Musée de Magic (Magic fête ses 33 ans le 5 août 2026) : des reliques de l'histoire du jeu se cachent dans l'appli et rejoignent, une à une, les vitrines
   d'un musée la nuit. Tout est dessiné ici (SVG en couleur, jamais d'emoji, d'image externe ni de <text> : chiffres et numéros en tracés, evmDigits) ;
   aucune reproduction d'art ou de logo propriétaire (ni dos de carte, ni symbole d'extension, ni illustration de carte) : des évocations originales.
   Animations : css/ev-magic.css (transform / opacity seulement). Teintes « v » : les cinq couleurs du mana dans l'ordre du cercle (0 blanc, 1 bleu, 2 noir,
   3 rouge, 4 vert ; teintes EVY_MANA du Nouvel an) ; v absent : bleu. Lumière en haut à gauche, comme les autres fêtes.
   · relic(o) : l'objet caché (viewBox 64 × 64) : vieille carte d'archive sous une cloche de verre, sur un socle de noyer cerclé d'or, une étiquette
     d'inventaire dorée (numéro « 33 » gravé) au bout d'un fil rouge noué au bouton de la cloche. o.v : teinte du cadre de la carte ; o.lit : célébration
     (halo plus vif, rayons .evo-rays, étincelles .evo-spk) ; o.gold : le lotus d'or sous la cloche (relique rare, toujours allumée) ; o.cls : classes en plus.
     Parties animées : .evo-tag (l'étiquette se balance), .evo-glint (reflet qui passe sur le verre), .evo-glow (halo, version allumée).
   · relicCounter(o) : compteur « 12 / 30 » (24 × 24, aplats pour 16–24 px) : la cloche, sa carte, l'étiquette d'or.
   · curator(o) : le conservateur du musée, dessin des messages (24 × 24) : vieux hibou archiviste à lunettes d'or, sourcils blancs et nœud papillon, perché
     sur deux livres reliés ; .evo-wing (l'aile droite) salue.
   · relicArt({ k, lit, cls }) : les reliques du musée (64 × 64), une par clé k de evpacks.js › museum.relics, posées sur un socle d'encre à liseré d'or
     et cartel, dans le faisceau d'un projecteur (.evo-beam) ; o.lit : halo, rayons, étincelles. Clé inconnue : carte ancienne sur un chevalet.
     Salle 1 : notebook (carnet à spirale griffonné de formules, croquis de cartes, pentagone des couleurs), alpha (booster scellé rétro, sans logo ;
     .evo-glint), corners (loupe de laiton sur le coin très arrondi d'une carte ancienne, rayon mesuré en pointillés d'or ; .evo-glint sur la lentille),
     d20 (dé icosaèdre bleu sur un coussin de velours, « 20 », « 8 », « 14 », « 2 » en tracés), lamp (lampe à huile orientale en laiton gravé, flamme
     .evo-flame qui vacille, fumée .evo-smoke), gears (trois engrenages laiton, cuivre et acier sur leur chevalet de fer ; .evo-gear-a/-b/-c tournent,
     dents en prise). Salles 2 à 5 (section « reliques des salles 2 à 5 ») : seal, snow, trophy, ship, chicken, foil (.evo-glint), crt (.evo-screen,
     .evo-glint), frame, guild, spark (.evo-spark-in tourbillonne), mythic, hedron (.evo-float), dragon, banner (.evo-cloth ondule), crown, invention
     (.evo-spin), saga, arena (.evo-glint), shield, jumpstart, ring, acorn, crystal (.evo-float), binder (.evo-next luit). lotus : lotus d'or légendaire,
     fleur toute en or vue de trois quarts (forme qui évoque le lotus noir des origines : pétales pointus galbés en couches, réceptacle cuivré), tige
     dans un bougeoir d'or, toujours allumé.
   · museumHall({ k, n, lit }) : façade d'une salle du musée (96 × 64) : temple classique (ailes à balustres, portique de quatre colonnes ioniques, fronton
     au motif de la salle k : 0 livre ouvert, 1 couronne de laurier et étoile, 2 planète en orbite, 3 écu et épées croisées, 4 étincelle ; numéro de salle
     en chiffres romains sur la frise). n (0–6) : fenêtres qui s'allument une à une (aile gauche puis aile droite), une relique en ombre dans chacune.
     o.lit : salle inaugurée (6 fenêtres, portes ouvertes, lumière sur les marches, ruban rouge coupé aux colonnes, guirlande de fanions du mana,
     halo .evo-glow, rayons .evo-rays, étincelles .evo-spk, fanions .evo-flags qui ondulent).
   · ribbonCut(o) : ruban d'inauguration coupé (64 × 32) : deux poteaux dorés, ruban de satin rouge tranché en V, grands ciseaux d'or ; .evo-blade-a / -b
     (les lames claquent), .evo-rib-l / -r (les bouts de ruban retombent en se balançant), .evo-spk (étincelles de la coupe).
   · cake(o) : gâteau d'anniversaire du jour J (96 × 96) : présentoir d'or, trois étages (bleu, corail, menthe) au glaçage qui coule, perles des cinq
     couleurs du mana à la base de chaque étage, guirlandes d'or, cinq bougies torsadées W U B R G (flammes .evo-flame qui vacillent), confettis.
     Plaque d'or vide sur l'étage du bas pour le nombre posé en HTML par-dessus : centre (48, 70) du viewBox (50 % ; 72,9 %), fond crème x 34,6–61,4,
     y 65–75 (left 36 %, top 67,7 %, width 27,9 %, height 10,4 % du dessin). o.lit : halo .evo-glow, rayons .evo-rays, étincelles .evo-spk.
   · rwLotus, rwHall : icônes plates des récompenses (24 × 24, 20–28 px), classe « evo evo-rw » : lotus d'or, salle inaugurée.
   EV_AMB.magic (galerie du musée la nuit ; jour J : guirlande et ballons), EV_AMB_TOP.magic (confettis, serpentin, cartes), EV_FX.magic : ambiance,
   couche du dessus, particules (section « ambiance » en fin de fichier). */
const EVM_AU = ['#fffbe6', '#ffe58a', '#f2c230', '#b9800f', '#6e4705'];      // or : reflet, clair, moyen, foncé, contour
const EVM_CU = ['#fff1e6', '#ffc9a6', '#e88b55', '#a24f22', '#4f210a'];      // cuivre
const EVM_FE = ['#ffffff', '#e8edf4', '#aab6c6', '#66748a', '#2e3646'];      // acier
const EVM_INK = '#12142a';
const evmV = v => (Number(v) >= 0 && Number(v) <= 4 ? Math.floor(Number(v)) : 1);
/** Dégradé métallique en coordonnées du dessin, de (x1, y1) à (x2, y2) : bandes sombres et claires d'un métal poli ; C : teintes (or par défaut). */
const evmMetal = (gid, x1, y1, x2, y2, C = EVM_AU) => `<linearGradient id="${gid}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" gradientUnits="userSpaceOnUse">`
  + `<stop offset="0" stop-color="${C[3]}"/><stop offset=".24" stop-color="${C[1]}"/><stop offset=".4" stop-color="${C[0]}"/><stop offset=".58" stop-color="${C[2]}"/><stop offset=".84" stop-color="${C[3]}"/><stop offset="1" stop-color="${C[2]}"/></linearGradient>`;
/** Dégradé « sphère » (reflet en haut à gauche), C : [reflet, clair, moyen, foncé]. */
const evmBall = (gid, C) => `<radialGradient id="${gid}" cx=".4" cy=".36" r=".72" fx=".32" fy=".26"><stop offset="0" stop-color="${C[0]}"/><stop offset=".3" stop-color="${C[1]}"/><stop offset=".72" stop-color="${C[2]}"/><stop offset="1" stop-color="${C[3]}"/></radialGradient>`;
/* Chiffres en tracés (police à traits arrondis, glyphes de 6 × 10, origine en haut à gauche) : numéros gravés, jamais de <text> */
const EVM_DIG = {
  0: 'M3 0C5 0 6 2.2 6 5S5 10 3 10S0 7.8 0 5S1 0 3 0Z', 1: 'M1 2.2L3.6 0V10M1.2 10H6', 2: 'M.3 2.4C.7.9 1.8 0 3.1 0C4.8 0 5.8 1.1 5.8 2.7C5.8 4.6 4.1 5.8.2 10H6',
  3: 'M.4 1.2C1.1.4 2 0 3 0C4.6 0 5.6 1 5.6 2.4C5.6 3.9 4.4 4.8 2.6 4.8C4.6 4.8 6 5.8 6 7.4C6 9 4.7 10 3 10C1.9 10 .9 9.6.2 8.8', 4: 'M4.6 10V0L0 7H6',
  5: 'M5.6 0H1L.6 4.4C1.3 4 2.1 3.8 3 3.8C4.8 3.8 6 5 6 6.8C6 8.7 4.7 10 2.9 10C1.8 10 .9 9.6.2 8.9',
  6: 'M5.2.6C4.6.2 3.9 0 3.2 0C1.2 0 0 2.2 0 5.6C0 8.4 1.2 10 3 10C4.8 10 6 8.7 6 6.9C6 5.1 4.8 3.9 3.1 3.9C1.6 3.9.5 4.8 0 6', 7: 'M0 0H6L2.2 10',
  8: 'M3 4.7C1.4 4.7.4 3.8.4 2.4C.4 1 1.5 0 3 0S5.6 1 5.6 2.4C5.6 3.8 4.6 4.7 3 4.7ZM3 4.7C4.8 4.7 6 5.8 6 7.4S4.8 10 3 10S0 9 0 7.4S1.2 4.7 3 4.7Z',
  9: 'M6 4C5.5 5.2 4.4 6.1 2.9 6.1C1.2 6.1 0 4.9 0 3.1C0 1.3 1.2 0 3 0C4.8 0 6 1.6 6 4.4C6 7.8 4.8 10 2.8 10C2.1 10 1.4 9.8.8 9.4', '/': 'M5.6-.4L.4 10.4',
  I: 'M3 0V10', V: 'M0 0L3 10L6 0',
};
/** Nombre en tracés centré en cx, cy, hauteur h ; a : attributs (couleur du trait…) ; w : épaisseur du trait (unités du dessin). */
function evmDigits(s, cx, cy, h, a, w = 1) {
  const k = h / 10, W = s.length * 8 - 2;
  return `<g transform="translate(${evoF(cx - W * k / 2)} ${evoF(cy - h / 2)}) scale(${evoF(k)})" fill="none" stroke-width="${evoF(w / k)}" stroke-linecap="round" stroke-linejoin="round" ${a}>`
    + [...String(s)].map((c, i) => `<path d="${EVM_DIG[c] || ''}"${i ? ` transform="translate(${i * 8} 0)"` : ''}/>`).join('') + `</g>`;
}
/** Bande de ruban le long d'une ligne médiane P (lissée), largeur w ; bout coupé en V (notch : profondeur de l'entaille) au dernier point. */
function evmBand(P, w, notch = 0) {
  const n = P.length, L = [], R = [];
  for (let i = 0; i < n; i++) {
    const a = P[Math.max(0, i - 1)], b = P[Math.min(n - 1, i + 1)], dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1, nx = -dy / l * w / 2, ny = dx / l * w / 2;
    L.push([P[i][0] + nx, P[i][1] + ny]); R.push([P[i][0] - nx, P[i][1] - ny]);
  }
  const e = P[n - 1], p = P[n - 2], dx = e[0] - p[0], dy = e[1] - p[1], l = Math.hypot(dx, dy) || 1;
  return evqCurve(L) + `L${evoF(e[0] - dx / l * notch)} ${evoF(e[1] - dy / l * notch)}` + evqCurve(R.reverse(), false, true) + 'Z';
}
/** Pétale pointu : base bx, by ; longueur len, demi-largeur w, direction ang (degrés, −90 : vers le haut). */
function evmPetal(bx, by, len, w, ang) {
  const a = ang * Math.PI / 180, dx = Math.cos(a), dy = Math.sin(a), f = evoF, P = (u, v) => f(bx + dx * u - dy * v) + ' ' + f(by + dy * u + dx * v);
  return `M${P(0, 0)}C${P(len * .12, w * .7)} ${P(len * .55, w * 1.05)} ${P(len, 0)}C${P(len * .55, -w * 1.05)} ${P(len * .12, -w * .7)} ${P(0, 0)}Z`;
}
/** Nervure d'un pétale (même repère qu'evmPetal). */
function evmRib(bx, by, len, ang, k = .84) {
  const a = ang * Math.PI / 180, dx = Math.cos(a), dy = Math.sin(a), f = evoF;
  return `M${f(bx + dx * len * .14)} ${f(by + dy * len * .14)}L${f(bx + dx * len * k)} ${f(by + dy * len * k)}`;
}
/** Écriture manuscrite illisible (formules, notes du carnet) de x0 à x1 sur la ligne y : jambages, boucles, « = » et « + » ; graine fixe. */
function evmScrawl(x0, x1, y, seed = 1, h = 1.1) {
  let s = seed * 7919 + 13, x = x0, d = `M${evoF(x)} ${evoF(y)}`;
  const r = () => (s = (s * 9301 + 49297) % 233280) / 233280, f = evoF;
  while (x < x1 - 1.2) {
    const t = r();
    if (t < .12) { x += 1.4; d += `M${f(x)} ${f(y)}`; continue; }                                                     // espace
    if (t < .2) { d += `M${f(x + .3)} ${f(y - .9)}h1.1M${f(x + .3)} ${f(y - .2)}h1.1`; x += 2; d += `M${f(x)} ${f(y)}`; continue; }      // =
    if (t < .26) { d += `M${f(x + .2)} ${f(y - .6)}h1.2M${f(x + .8)} ${f(y - 1.2)}v1.2`; x += 1.9; d += `M${f(x)} ${f(y)}`; continue; }   // +
    const w = .7 + r() * .5, up = t > .84 ? h * 2.1 : h * (.7 + r() * .4);
    d += `Q${f(x + w * .1)} ${f(y - up * 1.15)} ${f(x + w * .5)} ${f(y - up)}Q${f(x + w * .85)} ${f(y - up * .8)} ${f(x + w)} ${f(y)}`; x += w;
  }
  return d;
}
/** Engrenage : centre cx, cy ; rayon primitif rp, n dents (hauteur th), phase ph (degrés : une dent centrée sur ph) ; spokes : bras entre les ajours
 *  (0 : plein). Un tracé, règle evenodd (les ajours laissent voir le chevalet derrière). */
function evmGear(cx, cy, rp, n, ph = 0, th = 2.2, spokes = 5) {
  const f = evoF, ro = rp + th / 2, ri = rp - th / 2, T = 2 * Math.PI / n, P = (r, a) => f(cx + Math.cos(a) * r) + ' ' + f(cy + Math.sin(a) * r);
  let d = '';
  for (let i = 0; i < n; i++) {
    const a = ph * Math.PI / 180 + i * T;
    d += (i ? 'L' : 'M') + P(ri, a - T * .27) + 'L' + P(ro, a - T * .15) + 'A' + f(ro) + ' ' + f(ro) + ' 0 0 1 ' + P(ro, a + T * .15) + 'L' + P(ri, a + T * .27) + `A${f(ri)} ${f(ri)} 0 0 1 ${P(ri, a + T * .73)}`;
  }
  d += 'Z';
  if (spokes) {
    const rr = ri * .74, rh = ri * .32, w = Math.max(.75, ri * .1);
    for (let j = 0; j < spokes; j++) {
      const b = (ph + 90) * Math.PI / 180 + j * 2 * Math.PI / spokes, e = b + 2 * Math.PI / spokes, dO = Math.asin(w / rr), dI = Math.asin(Math.min(.95, w / rh));
      d += `M${P(rr, b + dO)}A${f(rr)} ${f(rr)} 0 0 1 ${P(rr, e - dO)}L${P(rh, e - dI)}A${f(rh)} ${f(rh)} 0 0 0 ${P(rh, b + dI)}Z`;
    }
  }
  return d;
}
/** Étincelles d'une célébration : [x, y, rayon]. */
const evmSpk = (P, edge = '#b9800f') => `<g class="evo-spk" fill="#fffbe6" stroke="${edge}" stroke-width=".35" stroke-opacity=".6" stroke-linejoin="round">${P.map(([x, y, r]) => `<path d="${evnSpark(x, y, r)}"/>`).join('')}</g>`;

/** Pétale galbé vu de trois quarts : base bx, by ; longueur len, demi-largeur w, direction ang (degrés, −90 : vers le haut) ; up : la pointe se recourbe
 *  vers le haut d'autant. Renvoie { lit, dark, rim, rimD, rib } : moitié éclairée (côté du haut, la lumière vient d'en haut à gauche), moitié dans l'ombre,
 *  bord de chaque moitié (liserés) et nervure. */
function evmPetal3(bx, by, len, w, ang, up = 0) {
  const a = ang * Math.PI / 180, dx = Math.cos(a), dy = Math.sin(a), f = evoF;
  const P = (u, v, k = 0) => f(bx + dx * u - dy * v) + ' ' + f(by + dy * u + dx * v - up * k);
  const sl = Math.abs(dx) < .25 ? -1 : -Math.sign(dx), B = P(0, 0), T = P(len, 0, 1), M = P(len * .5, 0, .3);
  const edge = s => `M${B}C${P(len * .18, w * s)} ${P(len * .64, w * s * .98, .45)} ${T}`;
  const half = s => edge(s) + `Q${M} ${B}Z`;
  return { lit: half(sl), dark: half(-sl), rim: edge(sl), rimD: edge(-sl), rib: `M${P(len * .1, 0)}Q${M} ${P(len * .86, 0, .8)}` };
}
/** Lotus d'or du musée (dessin original qui évoque le lotus noir des origines) : fleur vue de trois quarts, longs pétales pointus en couches (ceux du fond
 *  dressés, ceux du bas presque à l'horizontale, pointes recourbées), tout en or : ambre et bronze au creux, clair au bord, liseré clair sur les arêtes,
 *  lumière réfléchie sous les bords ; réceptacle de graines cuivré, percé de petits trous en creux ; une tige qui descend dans un bougeoir d'or posé en y 51,6 (dessin d'environ 40 × 38). */
function evmLotus(id) {
  /* [base y, pétales [longueur, demi-largeur, direction, pointe relevée]] : fond de la coupe dressé, ailes, pétales du bas étalés, devant de la coupe */
  const R0 = [30.6, [[18, 5, -90, 0], [17, 4.8, -114, 1.6], [17, 4.8, -66, 1.6]]], R1 = [31.6, [[18, 5.2, -142, 3], [18, 5.2, -38, 3]]];
  const R2 = [32.6, [[19.5, 4.4, -174, 4.8], [19.5, 4.4, -6, 4.8], [14.5, 4.8, 164, 3.6], [14.5, 4.8, 16, 3.6]]], R3 = [33.4, [[12, 5.4, -106, .6], [12, 5.4, -74, .6]]];
  const row = ([by, L], g = 'l') => L.map(([l, w, a, u]) => { const p = evmPetal3(32, by, l, w, a, u);
    return `<path d="${p.dark}" fill="url(#${id(g + 'd')})"/><path d="${p.lit}" fill="url(#${id(g + 'k')})"/>`
      + `<path d="${p.rimD}" fill="none" stroke="#6e4705" stroke-width=".45" opacity=".8"/><path d="${p.rimD}" fill="none" stroke="#ffd86a" stroke-width=".35" opacity=".7" transform="translate(0 -.35)"/>`
      + `<path d="${p.rib}" fill="none" stroke="#fff3c4" stroke-width=".4" opacity=".7"/><path d="${p.rim}" fill="none" stroke="#6e4705" stroke-width=".45" opacity=".8"/>`
      + `<path d="${p.rim}" fill="none" stroke="#fffbe6" stroke-width=".55" stroke-linecap="round" opacity=".9" transform="translate(.15 .35)"/>`; }).join('');
  const dots = [[29.6, 20], [31.2, 19.2], [33, 19.3], [34.5, 20.1], [30.6, 20.9], [32.4, 21], [34, 20.8], [29.6, 22.6], [31.8, 23.6], [34, 22.8]];
  return `<path d="M32 37C31.2 40.4 32.8 43.2 32 46.4" fill="none" stroke="#6e4705" stroke-width="2.1"/><path d="M32 37C31.2 40.4 32.8 43.2 32 46.4" fill="none" stroke="url(#${id('lp')})" stroke-width="1.2"/>`
    + `<path d="M31.5 38.4Q31.2 41 32 43.4" fill="none" stroke="#fffbe6" stroke-width=".35" opacity=".8"/>`
    /* bougeoir d'or */
    + `<path d="M27.6 45.4H36.4L35 47.8H29Z" fill="url(#${id('lp')})" stroke="#6e4705" stroke-width=".45" stroke-linejoin="round"/><ellipse cx="32" cy="45.4" rx="4.4" ry="1" fill="#ffe58a" stroke="#6e4705" stroke-width=".35"/>`
    + `<path d="M30.4 47.8H33.6L34 49.4H30Z" fill="url(#${id('lp')})" stroke="#6e4705" stroke-width=".4"/><path d="M25.6 49.8C25.6 49 28.4 48.6 32 48.6S38.4 49 38.4 49.8V50.6C38.4 51.3 35.6 51.7 32 51.7S25.6 51.3 25.6 50.6Z" fill="url(#${id('lp')})" stroke="#6e4705" stroke-width=".45"/>`
    + `<path d="M27 50.2Q32 49.2 37 50.2" fill="none" stroke="#fffbe6" stroke-width=".4" opacity=".7"/>`
    + row(R0)
    /* réceptacle de graines */
    + `<path d="M27.5 21.4C27.7 24.8 29.6 27.4 32 27.6C34.4 27.4 36.3 24.8 36.5 21.4Z" transform="translate(0 -1.4)" fill="url(#${id('lo')})" stroke="#4a1e06" stroke-width=".4"/>`
    + `<ellipse cx="32" cy="20" rx="4.5" ry="1.7" fill="url(#${id('lf')})" stroke="#4a1e06" stroke-width=".4"/><g fill="#ffd9a8" opacity=".75">${dots.map(([x, y]) => `<circle cx="${x}" cy="${evoF(y + .22)}" r=".4"/>`).join('')}</g>`
    + `<g fill="#3a1604">${dots.map(([x, y]) => `<circle cx="${x}" cy="${y}" r=".4"/>`).join('')}</g><path d="M28.6 19.6Q30.4 18.6 32.6 18.6" fill="none" stroke="#fff3e0" stroke-width=".45" stroke-linecap="round" opacity=".8"/>`
    + row(R1) + row(R2) + row(R3, 'c');
}
/** Dégradés du lotus (moitiés éclairées et dans l'ombre des pétales, bronze au creux, or clair au bord ; réceptacle cuivré ; or du bougeoir et de la tige). */
const evmLotusDefs = id => `<radialGradient id="${id('lk')}" cx="32" cy="31.4" r="19" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#4a2a04"/><stop offset=".28" stop-color="#9a5a0c"/><stop offset=".62" stop-color="#e0a82a"/><stop offset=".86" stop-color="#ffe17a"/><stop offset="1" stop-color="#fff6cc"/></radialGradient>`
  + `<radialGradient id="${id('ld')}" cx="32" cy="31.4" r="19" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#3a2002"/><stop offset=".4" stop-color="#7a4808"/><stop offset=".8" stop-color="#c48a1a"/><stop offset="1" stop-color="#e8b545"/></radialGradient>`
  + `<radialGradient id="${id('lf')}" cx=".4" cy=".35" r=".75"><stop offset="0" stop-color="#ffd9a8"/><stop offset=".5" stop-color="#d47a30"/><stop offset="1" stop-color="#7a3a0c"/></radialGradient>`
  + `<linearGradient id="${id('lo')}" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#5a2808"/><stop offset=".38" stop-color="#c8742a"/><stop offset="1" stop-color="#4a1e06"/></linearGradient>`
  + `<radialGradient id="${id('ck')}" cx="32" cy="33.4" r="12.4" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#7a4808"/><stop offset=".4" stop-color="#c48a1a"/><stop offset=".78" stop-color="#f2c230"/><stop offset="1" stop-color="#fff3c4"/></radialGradient>`
  + `<radialGradient id="${id('cd')}" cx="32" cy="33.4" r="12.4" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#5a3204"/><stop offset=".5" stop-color="#9a6410"/><stop offset="1" stop-color="#d9a12b"/></radialGradient>`
  + evmMetal(id('lp'), 25, 0, 39, 0);

Object.assign(EV_ART, {
  /** Relique cachée (viewBox 64 × 64) : vieille carte d'archive sous une cloche de verre, étiquette d'inventaire dorée ; o.v teinte du cadre (0–4),
   *  o.lit célébration, o.gold : le lotus d'or sous la cloche (toujours allumé). */
  relic: (o = {}) => {
    const n = ++EVO_N, id = s => `evo${n}${s}`, gold = !!o.gold, lit = !!o.lit || gold, v = evmV(o.v), m = EVY_MANA[v];
    const D = 'M15.6 52.6V29.4C15.6 18.4 22.8 11.2 32 11.2S48.4 18.4 48.4 29.4V52.6Z';
    const card = gold ? `<g transform="translate(32 51.4) scale(.6) translate(-32 -51.6)">${evmLotus(id)}</g>`
      : `<rect x="28" y="49.2" width="8" height="2.4" rx=".5" fill="url(#${id('au')})" stroke="#6e4705" stroke-width=".35"/>`
      + `<g transform="rotate(-5 32 49)"><rect x="23.7" y="24.7" width="18" height="25" rx="1.8" fill="#000" opacity=".2"/>`
      + `<rect x="23" y="24" width="18" height="25" rx="1.8" fill="#1d1a24" stroke="#000" stroke-width=".3"/><rect x="24.3" y="25.3" width="15.4" height="22.4" rx=".8" fill="url(#${id('cf')})"/>`
      + `<rect x="25.3" y="26.3" width="13.4" height="2.3" rx=".5" fill="${m[0]}" stroke="${m[4]}" stroke-width=".25"/><path d="M26.2 27.45H32.6" stroke="${m[4]}" stroke-width=".55" stroke-linecap="round" opacity=".55"/>`
      + `<circle cx="37.3" cy="27.45" r=".75" fill="${m[2]}" stroke="${m[4]}" stroke-width=".25"/>`
      + `<rect x="25.3" y="29.3" width="13.4" height="9.2" fill="url(#${id('ca')})" stroke="${m[4]}" stroke-width=".3"/><circle cx="35.2" cy="31.8" r="1.6" fill="#fff6c8"/>`
      + `<path d="M25.3 36.2Q28.8 33 32.4 35.3Q35.6 33.3 38.7 35.1V38.5H25.3Z" fill="${m[3]}" opacity=".8"/><path d="M25.3 38.5V37Q30 35.5 34 37.4Q36.6 36.5 38.7 37.5V38.5Z" fill="${m[4]}" opacity=".55"/>`
      + `<rect x="25.3" y="39.2" width="13.4" height="1.6" rx=".4" fill="${m[0]}" stroke="${m[4]}" stroke-width=".25"/><circle cx="37.5" cy="40" r=".45" fill="#f2c230"/>`
      + `<rect x="25.3" y="41.4" width="13.4" height="5.5" fill="#f7f0dc" stroke="${m[4]}" stroke-width=".25"/><path d="M26.3 42.8H37.6M26.3 44.2H36.4M26.3 45.6H33" stroke="#8a7d66" stroke-width=".4" stroke-linecap="round"/>`
      + `<path d="M24.6 31C27 28.4 30 26.8 33.4 26" fill="none" stroke="#fff" stroke-width=".9" stroke-linecap="round" opacity=".35"/></g>`;
    return `<svg class="evo evo-relic${gold ? ' evo-relic-gold' : ' evo-relic-' + v}${lit ? ' evo-lit' : ''}${o.cls ? ' ' + o.cls : ''}" viewBox="0 0 64 64" aria-hidden="true" focusable="false"><defs>`
      + `<radialGradient id="${id('g')}" cx="32" cy="33" r="31" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#fff6d0" stop-opacity="${lit ? .95 : .55}"/><stop offset=".45" stop-color="${gold ? '#f2c230' : m[5]}" stop-opacity="${lit ? .45 : .2}"/><stop offset="1" stop-color="${gold ? '#f2c230' : m[5]}" stop-opacity="0"/></radialGradient>`
      + (lit ? `<linearGradient id="${id('y')}" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#fffbe0" stop-opacity=".95"/><stop offset="1" stop-color="#f2c230" stop-opacity="0"/></linearGradient>` : '')
      + `<linearGradient id="${id('gl')}" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#cfe6ff" stop-opacity=".55"/><stop offset=".22" stop-color="#eaf5ff" stop-opacity=".16"/><stop offset=".55" stop-color="#ffffff" stop-opacity=".06"/><stop offset=".86" stop-color="#d6e9ff" stop-opacity=".2"/><stop offset="1" stop-color="#a9cbee" stop-opacity=".6"/></linearGradient>`
      + `<linearGradient id="${id('w')}" x1="14" y1="0" x2="50" y2="0" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#3a1f0c"/><stop offset=".28" stop-color="#a8693a"/><stop offset=".45" stop-color="#c98a52"/><stop offset=".75" stop-color="#7a4522"/><stop offset="1" stop-color="#2e1808"/></linearGradient>`
      + `<radialGradient id="${id('wt')}" cx=".42" cy=".3" r=".75"><stop offset="0" stop-color="#e2a874"/><stop offset=".6" stop-color="#a5683a"/><stop offset="1" stop-color="#6e3e1c"/></radialGradient>`
      + evmMetal(id('au'), 14, 0, 50, 0) + evmMetal(id('tg'), 45, 17, 53, 31) + evmBall(id('kb'), ['#fffbe6', '#ffe58a', '#e0a82a', '#7a4f06'])
      + `<linearGradient id="${id('cf')}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${m[1]}"/><stop offset=".5" stop-color="${m[2]}"/><stop offset="1" stop-color="${m[3]}"/></linearGradient>`
      + `<linearGradient id="${id('ca')}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${m[1]}"/><stop offset="1" stop-color="${m[0]}"/></linearGradient>`
      + `<linearGradient id="${id('k')}" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".5" stop-color="#fff" stop-opacity=".75"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>`
      + `<radialGradient id="${id('o')}"><stop offset="0" stop-color="#1a1030" stop-opacity=".4"/><stop offset="1" stop-color="#1a1030" stop-opacity="0"/></radialGradient>`
      + (gold ? evmLotusDefs(id) : '') + `<clipPath id="${id('c')}"><path d="${D}"/></clipPath></defs>`
      + `<circle class="evo-glow" cx="32" cy="33" r="31" fill="url(#${id('g')})"/>` + (lit ? evnRays(id('y'), 32, 33, 32) : '')
      + `<ellipse class="evo-shadow" cx="32" cy="59.8" rx="20" ry="2.6" fill="url(#${id('o')})"/>`
      /* socle de noyer cerclé d'or */
      + `<path d="M14.4 52.6V56C14.4 58 22.2 59.4 32 59.4S49.6 58 49.6 56V52.6Z" fill="url(#${id('w')})" stroke="#2a1405" stroke-width=".5" stroke-linejoin="round"/>`
      + `<path d="M14.4 54.6C14.4 56.4 22.2 57.6 32 57.6S49.6 56.4 49.6 54.6" fill="none" stroke="url(#${id('au')})" stroke-width="1"/>`
      + `<path d="M18 57.6Q24 58.6 30 58.6M38 58.4Q43 58 46.4 57.2" fill="none" stroke="#2a1405" stroke-width=".35" opacity=".5"/>`
      + `<ellipse cx="32" cy="52.6" rx="17.6" ry="3.2" fill="url(#${id('wt')})" stroke="#2a1405" stroke-width=".45"/><ellipse cx="32" cy="52.6" rx="16.4" ry="2.5" fill="#3a1f0c" opacity=".35"/>`
      /* la carte (ou le lotus d'or) sous la cloche */
      + card
      /* cloche de verre : teinte, reflets, bord, reflet qui passe */
      + `<path d="${D}" fill="url(#${id('gl')})"/>`
      + `<g clip-path="url(#${id('c')})"><path class="evo-glint" d="M8 60H13L27 6H22Z" fill="url(#${id('k')})" opacity="0"/></g>`
      + `<path d="M15.6 52.6V29.4C15.6 18.4 22.8 11.2 32 11.2S48.4 18.4 48.4 29.4V52.6" fill="none" stroke="#7fa6cc" stroke-width=".7"/>`
      + `<path d="M47.4 30C47.4 20 41.6 12.6 33.4 12.2" fill="none" stroke="#5d84ad" stroke-width=".5" opacity=".55"/>`
      + `<path d="M19.4 47C18.8 38 19 27.4 22.6 19.4" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" opacity=".62"/><path d="M21.6 47.4V41.4" fill="none" stroke="#fff" stroke-width=".8" stroke-linecap="round" opacity=".45"/>`
      + `<path d="M26.8 13.8Q30.4 12.4 34 12.8" fill="none" stroke="#fff" stroke-width="1" stroke-linecap="round" opacity=".8"/><path d="M45.2 24.4C46 30.4 46 40 45.6 47" fill="none" stroke="#fff" stroke-width=".9" stroke-linecap="round" opacity=".35"/>`
      + `<path d="M15.6 52.6A16.4 2.6 0 0 0 48.4 52.6" fill="none" stroke="#fff" stroke-width=".7" opacity=".7"/><path d="M15.6 52.6A16.4 2.6 0 0 0 48.4 52.6" fill="none" stroke="#5d84ad" stroke-width=".4" opacity=".6" transform="translate(0 .6)"/>`
      /* bouton de la cloche, fil rouge, étiquette d'inventaire « 33 » */
      + `<rect x="30.5" y="9" width="3" height="2.6" rx=".6" fill="url(#${id('au')})" stroke="#6e4705" stroke-width=".35"/><circle cx="32" cy="7.1" r="2.7" fill="url(#${id('kb')})" stroke="#6e4705" stroke-width=".45"/><circle cx="31.1" cy="6.2" r=".7" fill="#fff" opacity=".85"/>`
      + `<path d="M30.4 10.2Q32 11.2 33.6 10.2" fill="none" stroke="#b3202c" stroke-width=".7" stroke-linecap="round"/><path d="M33.4 10.4C38.4 9.4 45 10.8 49.2 17.4" fill="none" stroke="#b3202c" stroke-width=".7" stroke-linecap="round"/>`
      + `<g class="evo-tag"><path d="M45.4 20.4L49.2 17.2L53 20.4V30.4Q53 31.4 52 31.4H46.4Q45.4 31.4 45.4 30.4Z" fill="url(#${id('tg')})" stroke="#6e4705" stroke-width=".55" stroke-linejoin="round"/>`
      + `<path d="M46.4 21V30.4H52" fill="none" stroke="#fff6cc" stroke-width=".4" opacity=".7"/><circle cx="49.2" cy="19.9" r="1.15" fill="#2a1d0c" stroke="#7a4f06" stroke-width=".5"/>`
      + `<path d="M47 23.2H51.4" stroke="#7a4f06" stroke-width=".45" stroke-linecap="round"/>${evmDigits('33', 49.2, 27.2, 3.2, 'stroke="#6e4705"', .5)}</g>`
      + (lit ? evmSpk([[8, 14, 3], [57, 10, 2.4], [6, 42, 2.2], [58, 40, 2.8], [21, 4.6, 1.8]]) : '') + `</svg>`;
  },
  /** Icône du compteur « 12 / 30 » (viewBox 24 × 24) : cloche de verre, carte, étiquette d'or ; aplats nets à 16–24 px. */
  relicCounter: (o = {}) => `<svg class="evo evo-counter${o.cls ? ' ' + o.cls : ''}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">`
    + `<path d="M3.8 19.4H20.2V21.2Q20.2 22.4 19 22.4H5Q3.8 22.4 3.8 21.2Z" fill="#8a5428" stroke="#3a1f0c" stroke-width=".7" stroke-linejoin="round"/><path d="M4.4 20.6H19.6" stroke="#f2c230" stroke-width=".9"/>`
    + `<path d="M5.2 19.4V10.4C5.2 5.8 8.2 3 12 3S18.8 5.8 18.8 10.4V19.4Z" fill="#e3f1ff" stroke="#2f5a8a" stroke-width=".85" stroke-linejoin="round"/>`
    + `<rect x="8.4" y="8.6" width="7.2" height="9.6" rx=".9" fill="#24202c" transform="rotate(-5 12 18)"/><rect x="9.3" y="9.5" width="5.4" height="7.8" rx=".4" fill="#4ea2f2" transform="rotate(-5 12 18)"/>`
    + `<rect x="9.9" y="11" width="4.2" height="2.8" fill="#bfe2ff" transform="rotate(-5 12 18)"/><rect x="9.9" y="14.4" width="4.2" height="2.2" fill="#f7f0dc" transform="rotate(-5 12 18)"/>`
    + `<path d="M7 17.8C6.6 14.2 6.8 9.8 8.4 6.8" fill="none" stroke="#fff" stroke-width="1.2" stroke-linecap="round"/>`
    + `<circle cx="12" cy="2.6" r="1.5" fill="#f2c230" stroke="#6e4705" stroke-width=".6"/><path d="M13.2 3.4Q16.6 3.4 18.4 6.2" fill="none" stroke="#c42a36" stroke-width=".7"/>`
    + `<path d="M16.6 7.6L18.4 6L20.2 7.6V12.4Q20.2 12.9 19.7 12.9H17.1Q16.6 12.9 16.6 12.4Z" fill="#f2c230" stroke="#6e4705" stroke-width=".65" stroke-linejoin="round"/><circle cx="18.4" cy="7.6" r=".5" fill="#6e4705"/></svg>`,
  /** Le conservateur du musée (viewBox 24 × 24), dessin des messages : vieux hibou archiviste à lunettes d'or et nœud papillon, sur deux livres ; .evo-wing salue. */
  curator: (o = {}) => {
    const n = ++EVO_N, id = s => `evo${n}${s}`, ln = '#3e2410';
    return `<svg class="evo evo-curator${o.cls ? ' ' + o.cls : ''}" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><defs>`
      + `<radialGradient id="${id('b')}" cx=".38" cy=".3" r=".8"><stop offset="0" stop-color="#c99a68"/><stop offset=".55" stop-color="#8f5f36"/><stop offset="1" stop-color="#5a3818"/></radialGradient>`
      + `<radialGradient id="${id('f')}" cx=".5" cy=".42" r=".6"><stop offset=".5" stop-color="#fbf1dc"/><stop offset="1" stop-color="#e2c99c"/></radialGradient>`
      + `<radialGradient id="${id('i')}" cx=".42" cy=".4" r=".6"><stop offset="0" stop-color="#ffd36b"/><stop offset=".7" stop-color="#f29a1e"/><stop offset="1" stop-color="#b85e0a"/></radialGradient>`
      + `<linearGradient id="${id('w')}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#a8754a"/><stop offset="1" stop-color="#5e3a1a"/></linearGradient></defs>`
      + `<ellipse cx="12" cy="23.2" rx="9.6" ry=".9" fill="#1a1030" opacity=".2"/>`
      /* deux livres reliés */
      + `<path d="M3.2 20.6H20.8V22.6Q20.8 23.2 20.2 23.2H3.8Q3.2 23.2 3.2 22.6Z" fill="#8f2436" stroke="#3e0e18" stroke-width=".45" stroke-linejoin="round"/><path d="M18.8 21H20.4V22.8H18.8Z" fill="#f3e6c8"/><path d="M5.2 20.6V23.2M6.2 20.6V23.2" stroke="#f2c230" stroke-width=".4"/>`
      + `<path d="M5 18.8H19.2V20.6H5Z" fill="#2f5aa8" stroke="#0e1f44" stroke-width=".45" stroke-linejoin="round"/><path d="M5.4 19.2H6.6V20.2H5.4Z" fill="#f3e6c8"/><path d="M17.4 18.8V20.6" stroke="#f2c230" stroke-width=".4"/>`
      /* aigrettes, corps, ventre plumeté */
      + `<path d="M6.8 6.6L5.4 2.2L9.4 4.6ZM17.2 6.6L18.6 2.2L14.6 4.6Z" fill="#6e4626" stroke="${ln}" stroke-width=".45" stroke-linejoin="round"/>`
      + `<path d="M12 3.6C16.2 3.6 18.6 6.6 18.6 10.6C18.6 15.6 16.4 19.2 12 19.2C7.6 19.2 5.4 15.6 5.4 10.6C5.4 6.6 7.8 3.6 12 3.6Z" fill="url(#${id('b')})" stroke="${ln}" stroke-width=".55"/>`
      + `<ellipse cx="12" cy="15.6" rx="4.1" ry="3.5" fill="#ead7b0"/><path d="M9.6 14.6Q10.2 15.2 10.8 14.6M11.4 14.6Q12 15.2 12.6 14.6M13.2 14.6Q13.8 15.2 14.4 14.6M10.4 16.4Q11 17 11.6 16.4M12.4 16.4Q13 17 13.6 16.4M11.4 18.1Q12 18.6 12.6 18.1" fill="none" stroke="#a87c4a" stroke-width=".35" stroke-linecap="round"/>`
      + `<path d="M6 10.8C4.6 12.8 4.8 16.4 7.2 18.6C7.6 16 7.6 13.4 6 10.8Z" fill="url(#${id('w')})" stroke="${ln}" stroke-width=".45" stroke-linejoin="round"/><path d="M6.2 13.4L7 14.6M6.4 15.6L7.2 16.8" stroke="${ln}" stroke-width=".3" opacity=".6"/>`
      /* disque facial, sourcils blancs, yeux d'ambre mi-clos, lunettes d'or, bec */
      + `<circle cx="9.3" cy="9.7" r="3.5" fill="url(#${id('f')})" stroke="#b08a5a" stroke-width=".35"/><circle cx="14.7" cy="9.7" r="3.5" fill="url(#${id('f')})" stroke="#b08a5a" stroke-width=".35"/>`
      + `<path d="M12 6.4L10.9 8.6L12 10.4L13.1 8.6Z" fill="#8f5f36"/>`
      + `<circle cx="9.3" cy="9.9" r="1.95" fill="url(#${id('i')})"/><circle cx="14.7" cy="9.9" r="1.95" fill="url(#${id('i')})"/><circle cx="9.4" cy="10.1" r="1.1" fill="#1a120c"/><circle cx="14.6" cy="10.1" r="1.1" fill="#1a120c"/>`
      + `<path d="M7.3 9.5A2 2 0 0 1 11.3 9.5Q9.3 8.9 7.3 9.5ZM12.7 9.5A2 2 0 0 1 16.7 9.5Q14.7 8.9 12.7 9.5Z" fill="#c9a676" stroke="#8a6a3e" stroke-width=".25"/>`
      + `<circle cx="9.9" cy="10.5" r=".4" fill="#fff"/><circle cx="15.1" cy="10.5" r=".4" fill="#fff"/>`
      + `<g fill="none" stroke="#e0a82a" stroke-width=".6"><circle cx="9.3" cy="9.9" r="2.55"/><circle cx="14.7" cy="9.9" r="2.55"/><path d="M11.6 9.3Q12 8.7 12.4 9.3M6.8 9.4L5.5 8.7M17.2 9.4L18.5 8.7"/></g>`
      + `<g fill="#fff" opacity=".2"><circle cx="9.3" cy="9.9" r="2.3"/><circle cx="14.7" cy="9.9" r="2.3"/></g><path d="M7.7 8.7Q8.2 8 9 7.8M13.1 8.7Q13.6 8 14.4 7.8" fill="none" stroke="#fff" stroke-width=".45" stroke-linecap="round" opacity=".9"/>`
      + `<path d="M6.2 6.8Q8.4 5.2 11.2 6.6M17.8 6.8Q15.6 5.2 12.8 6.6M6.6 6Q7.4 5 8.6 4.9M17.4 6Q16.6 5 15.4 4.9" fill="none" stroke="#f8f4ea" stroke-width=".8" stroke-linecap="round"/>`
      + `<path d="M12 10.9L11 11.7Q11.8 13.9 12 13.9Q12.2 13.9 13 11.7Z" fill="#f2c230" stroke="#8a5a0c" stroke-width=".35" stroke-linejoin="round"/>`
      /* nœud papillon corail */
      + `<path d="M12 13.9L9.5 12.7V15.3ZM12 13.9L14.5 12.7V15.3Z" fill="#ff7a5c" stroke="#7a1f12" stroke-width=".35" stroke-linejoin="round"/><circle cx="12" cy="13.9" r=".65" fill="#e2553e" stroke="#7a1f12" stroke-width=".3"/>`
      + `<path d="M10 13.4L10.6 13.7M13.4 13.7L14 13.4" stroke="#ffd0c2" stroke-width=".3" stroke-linecap="round"/>`
      /* serres sur le livre */
      + `<path d="M9.4 18.6L9 19.6M10.2 18.8V19.8M11 18.6L11.4 19.6M13 18.6L12.6 19.6M13.8 18.8V19.8M14.6 18.6L15 19.6" stroke="#e08a1a" stroke-width=".6" stroke-linecap="round"/>`
      /* aile droite levée : elle salue */
      + `<g class="evo-wing"><path d="M17.6 11.6C19.2 9.2 21.4 6.8 23 6.4C23.3 7.6 22.8 8.6 22 9.2C22.8 9.4 22.6 10.6 21.6 11C22 11.8 21.2 12.8 20 12.8C19.2 13.6 18 13.6 17.4 13.2Z" fill="url(#${id('w')})" stroke="${ln}" stroke-width=".45" stroke-linejoin="round"/>`
      + `<path d="M18.6 11.8L21.4 9.4M18.8 12.6L21 11M18.4 10.6L21.8 7.6" fill="none" stroke="#3e2410" stroke-width=".28" opacity=".55"/></g></svg>`;
  },
});

/* ── Anniversaire de Magic : les reliques du musée (relicArt) ──────────────────────────────────────────────────────────────────────────────── */
/** Vitrine d'une relique (viewBox 64 × 64) : halo, faisceau du projecteur, socle d'encre à liseré d'or et cartel, l'objet (draw(id) → [defs, dessin]) ;
 *  o.lit : halo plus vif, rayons, étincelles (toujours pour le lotus d'or). */
function evmStage(o, k, draw) {
  const n = ++EVO_N, id = s => `evo${n}${s}`, lit = !!o.lit || k === 'lotus', [defs, body] = draw(id);
  return `<svg class="evo evo-relic-art evo-ra-${k}${lit ? ' evo-lit' : ''}${o.cls ? ' ' + o.cls : ''}" viewBox="0 0 64 64" aria-hidden="true" focusable="false"><defs>`
    + `<radialGradient id="${id('g')}" cx="32" cy="30" r="31" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#fff3c4" stop-opacity="${lit ? .9 : .42}"/><stop offset=".5" stop-color="#f2c230" stop-opacity="${lit ? .34 : .1}"/><stop offset="1" stop-color="#f2c230" stop-opacity="0"/></radialGradient>`
    + (lit ? `<linearGradient id="${id('y')}" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#fffbe0" stop-opacity=".95"/><stop offset="1" stop-color="#f2c230" stop-opacity="0"/></linearGradient>` : '')
    + `<linearGradient id="${id('bm')}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff6d8" stop-opacity=".5"/><stop offset=".7" stop-color="#ffe7a8" stop-opacity=".13"/><stop offset="1" stop-color="#ffe7a8" stop-opacity="0"/></linearGradient>`
    + `<linearGradient id="${id('pf')}" x1="12" y1="0" x2="52" y2="0" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#1c1838"/><stop offset=".28" stop-color="#433b7c"/><stop offset=".6" stop-color="#2a2452"/><stop offset="1" stop-color="#120e26"/></linearGradient>`
    + `<linearGradient id="${id('pt')}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5a5196"/><stop offset="1" stop-color="#8379c4"/></linearGradient>`
    + evmMetal(id('pg'), 11, 0, 53, 0)
    + `<radialGradient id="${id('pl')}"><stop offset="0" stop-color="#fffbe6" stop-opacity=".9"/><stop offset="1" stop-color="#fff3c4" stop-opacity="0"/></radialGradient>`
    + `<radialGradient id="${id('o')}"><stop offset="0" stop-color="#0a0818" stop-opacity=".42"/><stop offset="1" stop-color="#0a0818" stop-opacity="0"/></radialGradient>`
    + defs + `</defs>`
    + `<circle class="evo-glow" cx="32" cy="30" r="31" fill="url(#${id('g')})"/>` + (lit ? evnRays(id('y'), 32, 30, 31) : '')
    + `<path class="evo-beam" d="M26.6-1H37.4L53 51H11Z" fill="url(#${id('bm')})"/>`
    + `<ellipse cx="32" cy="61.9" rx="23" ry="1.9" fill="url(#${id('o')})"/>`
    /* socle : dessus éclairé, moulure d'or, face d'encre, cartel gravé, plinthe */
    + `<path d="M13.4 50.4H50.6L52.4 53H11.6Z" fill="url(#${id('pt')})" stroke="${EVM_INK}" stroke-width=".4" stroke-linejoin="round"/>`
    + `<ellipse cx="32" cy="51.7" rx="16" ry="1.2" fill="url(#${id('pl')})"/>`
    + `<rect x="11.6" y="53" width="40.8" height="1.5" fill="url(#${id('pg')})" stroke="#6e4705" stroke-width=".35"/>`
    + `<rect x="12.8" y="54.5" width="38.4" height="5.2" fill="url(#${id('pf')})" stroke="${EVM_INK}" stroke-width=".4"/><path d="M13.6 55V59.2" stroke="#8d84c8" stroke-width=".4" opacity=".6"/>`
    + `<rect x="26.6" y="55.6" width="10.8" height="2.9" rx=".5" fill="url(#${id('pg')})" stroke="#6e4705" stroke-width=".3"/><path d="M28.2 56.6H35.8M29.4 57.5H34.6" stroke="#7a4f06" stroke-width=".35" stroke-linecap="round"/>`
    + `<rect x="11.8" y="59.7" width="40.4" height="1.7" rx=".5" fill="#1a1634" stroke="${EVM_INK}" stroke-width=".4"/><path d="M12.4 59.9H51.6" stroke="#e0a82a" stroke-width=".4" opacity=".8"/>`
    + `<g class="evo-ra-b">${body}</g>`
    + (lit ? evmSpk([[7, 12, 2.8], [57, 10, 2.4], [5, 36, 2], [59, 33, 2.6], [32, 2.6, 1.8]]) : '') + `</svg>`;
}
/** Carte ancienne (bordure noire, cadre ocre, coins très arrondis ; dessin original), 27 × 37,6 à partir de (15, 11) ; dégradés of, oa. */
const evmOldCard = id => `<rect x="15" y="11" width="27" height="37.6" rx="3.4" fill="#17151f" stroke="#000" stroke-width=".35"/>`
  + `<rect x="16.9" y="12.9" width="23.2" height="33.8" rx="1.1" fill="url(#${id('of')})"/>`
  + `<rect x="18.1" y="14.1" width="20.8" height="2.8" rx=".6" fill="#f1e6c8" stroke="#6b4a22" stroke-width=".3"/><path d="M19.3 15.5H28.4" stroke="#6b4a22" stroke-width=".6" stroke-linecap="round" opacity=".55"/>`
  + `<circle cx="37.3" cy="15.5" r=".8" fill="#d0452e" stroke="#5a1a0c" stroke-width=".25"/><circle cx="35.4" cy="15.5" r=".8" fill="#3fcf7a" stroke="#06401f" stroke-width=".25"/>`
  + `<rect x="18.1" y="17.7" width="20.8" height="13.6" fill="url(#${id('oa')})" stroke="#6b4a22" stroke-width=".35"/><circle cx="34.6" cy="20.6" r="1.5" fill="#fff6c8"/>`
  + `<path d="M18.1 27.4L22.4 22.6L25.2 25.4L29.4 20.4L34 25.6L36.4 23.4L38.9 26V31.3H18.1Z" fill="#6f7fa8" opacity=".9"/><path d="M28.3 21.7L29.4 20.4L30.6 21.8L29.8 21.5Z" fill="#fff"/>`
  + `<path d="M18.1 31.3V28.8Q24 26.6 29.4 28.6Q34.4 27 38.9 28.4V31.3Z" fill="#3f5a3a"/><path d="M22.6 28.4V25.6H23.4V24.8H24.6V25.6H25.4V28" fill="#2e2a3e"/>`
  + `<rect x="18.1" y="32.1" width="20.8" height="2.2" rx=".5" fill="#f1e6c8" stroke="#6b4a22" stroke-width=".3"/><path d="M19.3 33.2H25.6" stroke="#6b4a22" stroke-width=".5" stroke-linecap="round" opacity=".5"/>`
  + `<rect x="18.1" y="35" width="20.8" height="10.4" fill="#f1e6c8" stroke="#6b4a22" stroke-width=".3"/>`
  + `<path d="M19.4 37H37.6M19.4 38.8H37M19.4 40.6H34.4" stroke="#8a7d66" stroke-width=".45" stroke-linecap="round"/><path d="M21 43.2H33" stroke="#8a7d66" stroke-width=".4" stroke-linecap="round" stroke-dasharray="1.6 .6" opacity=".8"/>`
  + `<path d="M15.9 15.6V44.4" stroke="#fff" stroke-width=".5" opacity=".22"/>`;
const evmOldCardDefs = id => `<linearGradient id="${id('of')}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e8c47c"/><stop offset=".55" stop-color="#b9823a"/><stop offset="1" stop-color="#7a4f1e"/></linearGradient>`
  + `<linearGradient id="${id('oa')}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8fb8e8"/><stop offset="1" stop-color="#ffe3b0"/></linearGradient>`;
/** Petit chevalet de laiton (pieds, tablette en y). */
const evmEasel = (x0 = 13.6, x1 = 45.4) => `<path d="M${evoF((x0 + x1) / 2 - 5)} 20L${evoF(x0 + 2.4)} 51.2M${evoF((x0 + x1) / 2 + 5)} 20L${evoF(x1 - 2.4)} 51.2" stroke="#8a5a0c" stroke-width="1.2" stroke-linecap="round"/>`;
/** Tablette du chevalet (devant la carte). */
const evmLedge = id => `<rect x="13.6" y="48.6" width="31.8" height="1.8" rx=".5" fill="url(#${id('au')})" stroke="#6e4705" stroke-width=".35"/><path d="M14 49H45" stroke="#fff6cc" stroke-width=".35"/>`;

/* Reliques : k → id ⇒ [dégradés, dessin] (dans la vitrine evmStage ; l'objet repose sur le socle, y ≈ 51). */
const EVM_RELIC = {
  /* clé inconnue : carte ancienne sur son chevalet */
  _: id => [evmOldCardDefs(id) + evmMetal(id('au'), 12, 0, 46, 0), evmEasel() + `<g transform="translate(2 0)">${evmOldCard(id)}</g>` + evmLedge(id)],
  /* 1993 · le carnet du prototype : carnet à spirale sur un chevalet, griffonné de formules, de croquis de cartes et du pentagone des cinq couleurs ;
     tache de café, « 20 » entouré ; crayon posé devant */
  notebook: id => {
    const ink = 'stroke="#27407a" stroke-width=".42" stroke-linecap="round" stroke-linejoin="round" fill="none"', pen = '#5a5f70', f = evoF;
    let lines = ''; for (let y = 17.6; y < 48.6; y += 2.6) lines += `M19 ${f(y)}H44.8`;
    const coil = Array.from({ length: 10 }, (_, i) => 20.2 + i * 2.55);
    const pent = Array.from({ length: 5 }, (_, i) => { const a = (-90 + i * 72) * Math.PI / 180; return [41 + Math.cos(a) * 3.4, 24.6 + Math.sin(a) * 3.4]; });
    const sketch = (x, y, r) => `<g transform="rotate(${r} ${x + 2.6} ${y + 3.6})"><rect x="${x}" y="${y}" width="5.2" height="7.2" rx=".5" fill="#fff" fill-opacity=".55" stroke="${pen}" stroke-width=".4"/>`
      + `<path d="M${f(x + .7)} ${f(y + 1.3)}H${f(x + 4.5)}V${f(y + 3.8)}H${f(x + .7)}Z" fill="none" stroke="${pen}" stroke-width=".3"/><path d="M${f(x + .9)} ${f(y + 3.4)}L${f(x + 2.2)} ${f(y + 2.2)}L${f(x + 3.1)} ${f(y + 3)}L${f(x + 4.2)} ${f(y + 1.8)}" fill="none" stroke="${pen}" stroke-width=".25"/>`
      + `<path d="M${f(x + .8)} ${f(y + 4.8)}H${f(x + 4.4)}M${f(x + .8)} ${f(y + 5.7)}H${f(x + 3.6)}M${f(x + .8)} ${f(y + .6)}H${f(x + 2.6)}" stroke="${pen}" stroke-width=".25" stroke-linecap="round"/><circle cx="${f(x + 4.2)}" cy="${f(y + .65)}" r=".35" fill="none" stroke="${pen}" stroke-width=".22"/></g>`;
    return [`<linearGradient id="${id('pp')}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fffdf6"/><stop offset="1" stop-color="#f0e5c6"/></linearGradient>`
      + `<linearGradient id="${id('cv')}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#4a82e0"/><stop offset="1" stop-color="#1d3a78"/></linearGradient>`
      + evmMetal(id('wr'), 0, 9.8, 0, 14, EVM_FE) + evmMetal(id('au'), 14, 0, 50, 0)
      + `<linearGradient id="${id('pc')}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffe58a"/><stop offset=".5" stop-color="#f2c230"/><stop offset="1" stop-color="#b9800f"/></linearGradient>`,
      `<g transform="rotate(-6 32 50)"><path d="M38.4 18L44.6 50.4" stroke="#8a5a0c" stroke-width="1.3" stroke-linecap="round"/>`
      + `<rect x="17" y="11.4" width="29.8" height="38.6" rx="1.4" fill="url(#${id('cv')})" stroke="#0e1f44" stroke-width=".5"/>`
      + `<rect x="18" y="12" width="27.6" height="37.4" rx="1" fill="url(#${id('pp')})" stroke="#b9ad8e" stroke-width=".4"/>`
      + `<path d="${lines}" stroke="#a9c8ec" stroke-width=".35"/><path d="M22.4 13.4V49.2" stroke="#ff8a8a" stroke-width=".45" opacity=".8"/>`
      + `<g fill="#8a7d66" opacity=".6">${coil.map(x => `<circle cx="${f(x + 1.3)}" cy="13.5" r=".5"/>`).join('')}</g>`
      /* tache de café, croquis de cartes et flèche, pentagone des couleurs, formules, « 20 » entouré de rouge, étoile griffonnée */
      + `<circle cx="27" cy="44.4" r="3.2" fill="none" stroke="#a8743c" stroke-width=".7" opacity=".3"/><path d="M24.4 46.4A3.2 3.2 0 0 0 30 45.4" fill="none" stroke="#a8743c" stroke-width=".35" opacity=".3"/>`
      + `<path d="${evmScrawl(23.6, 41.4, 17.2, 3)}" ${ink}/><path d="M24 18.4Q32 19.4 40.6 18" ${ink} opacity=".7"/>`
      + sketch(24.4, 20.4, -4) + sketch(31.4, 20.8, 3) + `<path d="M27 28.8Q30.6 30.6 34 29M33.1 28.4L34 29L33.3 29.9" ${ink}/>`
      + `<path d="M${pent.map(p => f(p[0]) + ' ' + f(p[1])).join('L')}Z" fill="none" stroke="${pen}" stroke-width=".35"/><path d="M${[0, 2, 4, 1, 3].map(i => f(pent[i][0]) + ' ' + f(pent[i][1])).join('L')}Z" fill="none" stroke="${pen}" stroke-width=".2" opacity=".5"/>`
      + pent.map((p, i) => `<circle cx="${f(p[0])}" cy="${f(p[1])}" r=".8" fill="${EVY_MANA[i][2]}" stroke="${EVY_MANA[i][4]}" stroke-width=".2"/>`).join('')
      + `<path d="${evmScrawl(23.6, 43, 33.2, 7)}" ${ink}/><path d="${evmScrawl(23.6, 38.6, 35.8, 11)}" ${ink}/><path d="${evmScrawl(23.6, 41, 38.4, 5)}" ${ink}/>`
      + `<path d="${evmScrawl(23.6, 31, 43.4, 19)}" ${ink}/>${evmDigits('20', 35.4, 42.5, 2.6, 'stroke="#27407a"', .42)}<ellipse cx="35.4" cy="42.5" rx="3" ry="2.1" fill="none" stroke="#e2553e" stroke-width=".4" transform="rotate(-8 35.4 42.5)"/>`
      + `<path d="${evnStar5(42.6, 46.4, 1.3)}" fill="none" stroke="${pen}" stroke-width=".3"/>`
      + `<path d="M45.6 46.2L42.6 49.4H44.6Q45.6 49.4 45.6 48.4Z" fill="#e6d9b8" stroke="#b9ad8e" stroke-width=".3"/>`
      + `<g fill="none" stroke-linecap="round">${coil.map(x => `<path d="M${f(x)} 13.7C${f(x - .3)} 10.7 ${f(x + 1.9)} 10.1 ${f(x + 2.1)} 11.9" stroke="#2e3646" stroke-width="1.3"/><path d="M${f(x)} 13.7C${f(x - .3)} 10.7 ${f(x + 1.9)} 10.1 ${f(x + 2.1)} 11.9" stroke="url(#${id('wr')})" stroke-width=".75"/>`).join('')}</g>`
      + `<rect x="15.4" y="49" width="32.6" height="1.9" rx=".6" fill="url(#${id('au')})" stroke="#6e4705" stroke-width=".35"/><path d="M15.9 49.4H47.5" stroke="#fff6cc" stroke-width=".35"/></g>`
      + `<g transform="rotate(-5 30 51)"><rect x="14.4" y="50" width="21" height="1.9" fill="url(#${id('pc')})" stroke="#8a5a0c" stroke-width=".3"/><path d="M14.4 50.95H35.4" stroke="#c48a1a" stroke-width=".3" opacity=".7"/>`
      + `<rect x="35.4" y="49.9" width="1.8" height="2.1" fill="#c8d0dc" stroke="#66748a" stroke-width=".3"/><rect x="37.2" y="50" width="2.2" height="1.9" rx=".6" fill="#ff8fa8" stroke="#b04a64" stroke-width=".3"/>`
      + `<path d="M14.4 50L11 50.95L14.4 51.9Z" fill="#ecc99a" stroke="#8a5a0c" stroke-width=".3" stroke-linejoin="round"/><path d="M12.4 50.56L11 50.95L12.4 51.34Z" fill="#3a3a44"/></g>`];
  },
  /* 1993 · le booster d'Alpha : booster scellé rétro (aucun logo) : bords sertis argentés, bandeau d'or, médaillon d'un couchant où se lève une planète
     à anneau, cinq gemmes du mana, « 1993 » en tracés ; reflet qui passe */
  alpha: id => {
    const f = evoF, zig = (y0, y1) => Array.from({ length: 21 }, (_, i) => `${f(19.6 + i * 1.24)} ${i % 2 ? y1 : y0}`).join('L');
    let crimp = ''; for (let x = 20.4; x < 44; x += 1.24) crimp += `M${f(x)} 6.2V9.2M${f(x)} 46.4V49.6`;
    const gx = [24.6, 28.3, 32, 35.7, 39.4], gy = [38, 38.9, 39.2, 38.9, 38];
    return [`<linearGradient id="${id('bw')}" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#0e0a24"/><stop offset=".16" stop-color="#2e2266"/><stop offset=".4" stop-color="#4a3a9a"/><stop offset=".64" stop-color="#33287a"/><stop offset=".88" stop-color="#1c1548"/><stop offset="1" stop-color="#0c0820"/></linearGradient>`
      + evmMetal(id('cr'), 19.6, 0, 44.4, 0, EVM_FE) + evmMetal(id('au'), 21, 0, 43, 0)
      + `<linearGradient id="${id('sk')}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2a1f5e"/><stop offset=".5" stop-color="#ff8a5c"/><stop offset=".8" stop-color="#ffd27a"/><stop offset="1" stop-color="#fff3c4"/></linearGradient>`
      + evmBall(id('pn'), ['#ffffff', '#bfe2ff', '#4ea2f2', '#1f3f8a']) + EVY_MANA.map((m, i) => evmBall(id('m' + i), [m[0], m[1], m[2], m[3]])).join('')
      + `<linearGradient id="${id('k')}" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".5" stop-color="#fff" stop-opacity=".55"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>`
      + `<clipPath id="${id('c')}"><rect x="19.6" y="5" width="24.8" height="46"/></clipPath><clipPath id="${id('ov')}"><ellipse cx="32" cy="26.2" rx="8.2" ry="9.4"/></clipPath>`,
      `<g transform="rotate(3 32 51)"><path d="M19.6 9.6V5.6L${zig(5.6, 4.6)}V9.6Z" fill="url(#${id('cr')})" stroke="#3a4458" stroke-width=".4" stroke-linejoin="round"/>`
      + `<path d="M19.6 45.8V50.2L${zig(50.2, 51.2)}V45.8Z" fill="url(#${id('cr')})" stroke="#3a4458" stroke-width=".4" stroke-linejoin="round"/>`
      + `<path d="${crimp}" stroke="#66748a" stroke-width=".3" opacity=".7"/><path d="M44.4 6.6L43 7.3L44.4 8" fill="none" stroke="#2e3646" stroke-width=".45"/>`
      + `<rect x="19.6" y="9.4" width="24.8" height="36.6" fill="url(#${id('bw')})" stroke="#0a0820" stroke-width=".4"/>`
      + `<g fill="#fff">${[[23, 18, .35], [41, 17.4, .3], [22.4, 34, .3], [41.6, 35.4, .35], [24.4, 13.4, .25], [39.8, 31, .25]].map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}" opacity=".7"/>`).join('')}</g>`
      + `<path d="M21.2 11.6H42.8L41.6 13.2L42.8 14.8H21.2L22.4 13.2Z" fill="url(#${id('au')})" stroke="#6e4705" stroke-width=".35" stroke-linejoin="round"/><path d="M24.6 13.2H28.6M30.2 13.2H33.6M35.2 13.2H39.4" stroke="#4a2c06" stroke-width=".9" stroke-linecap="round" opacity=".75"/>`
      + `<ellipse cx="32" cy="26.2" rx="8.2" ry="9.4" fill="url(#${id('sk')})"/>`
      + `<g clip-path="url(#${id('ov')})"><g transform="rotate(-14 32 21.4)"><path d="M26 21.4A6 1.4 0 0 1 38 21.4" fill="none" stroke="#ffe58a" stroke-width=".6"/></g><circle cx="32" cy="21.4" r="3.5" fill="url(#${id('pn')})"/>`
      + `<g transform="rotate(-14 32 21.4)"><path d="M26 21.4A6 1.4 0 0 0 38 21.4" fill="none" stroke="#ffe58a" stroke-width=".7"/></g>`
      + `<path d="M23 31L26.4 27L28.6 29L31.8 24.6L35.4 28.8L37.4 27.2L41 31V36H23Z" fill="#3b2470"/><path d="M31 25.6L31.8 24.6L32.7 25.8L31.8 25.4Z" fill="#ffd8c8"/><path d="M23 33Q28 30.6 32 32.4Q36.4 30.8 41 32.6V36H23Z" fill="#1d1240"/>`
      + `<path d="${evnSpark(27, 19.2, .9)}${evnSpark(37.4, 18.4, .7)}" fill="#fff"/></g>`
      + `<ellipse cx="32" cy="26.2" rx="8.2" ry="9.4" fill="none" stroke="url(#${id('au')})" stroke-width="1.3"/><ellipse cx="32" cy="26.2" rx="9" ry="10.2" fill="none" stroke="#6e4705" stroke-width=".3" opacity=".8"/>`
      + gx.map((x, i) => `<circle cx="${x}" cy="${gy[i]}" r="1.45" fill="url(#${id('m' + i)})" stroke="#0a0820" stroke-width=".35"/><circle cx="${f(x - .5)}" cy="${f(gy[i] - .5)}" r=".38" fill="#fff" opacity=".85"/>`).join('')
      + `<rect x="23.4" y="41.1" width="17.2" height="3.3" rx=".7" fill="#0c0820" fill-opacity=".55" stroke="url(#${id('au')})" stroke-width=".5"/>${evmDigits('1993', 32, 42.75, 1.9, 'stroke="#ffe58a"', .38)}`
      + `<g fill="#f2c230">${[[21.3, 16.4], [42.7, 16.4], [21.3, 44.6], [42.7, 44.6]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r=".5"/>`).join('')}</g>`
      + `<path d="M21 16.4L22.2 18.8M42.2 33L43.2 35.6M20.4 40L21.4 41.6" stroke="#fff" stroke-width=".4" opacity=".25"/><path d="M41.8 14.4L42.8 16.4M22 30L21.2 32" stroke="#000" stroke-width=".4" opacity=".3"/>`
      + `<path d="M19.6 30L44.4 14V18.4L19.6 34.4Z" fill="#fff" opacity=".06"/>`
      + `<g clip-path="url(#${id('c')})"><path class="evo-glint" d="M8 52H12.4L22 4H17.6Z" fill="url(#${id('k')})" opacity="0"/></g></g>`];
  },
  /* 1993 · les coins d'Alpha : carte ancienne sur son chevalet, loupe de laiton posée sur son coin très arrondi (grossi deux fois dans la lentille,
     rayon mesuré en pointillés d'or) ; reflet qui passe sur la lentille */
  corners: id => {
    const cx = 17.6, cy = 11.6, ax = cx + 2.8 * 2.1, ay = cy + 2.8 * 2.1, rr = 8.6, a0 = Math.PI, a1 = 1.5 * Math.PI, f = evoF;      // lentille ; ax, ay : centre de l'arrondi du coin, grossi
    const P = a => f(ax + Math.cos(a) * rr) + ' ' + f(ay + Math.sin(a) * rr), tk = a => `M${f(ax + Math.cos(a) * (rr - .9))} ${f(ay + Math.sin(a) * (rr - .9))}L${f(ax + Math.cos(a) * (rr + .9))} ${f(ay + Math.sin(a) * (rr + .9))}`;
    return [evmOldCardDefs(id) + evmMetal(id('au'), 12, 0, 46, 0) + evmMetal(id('rim'), 10, 4, 31, 25)
      + `<radialGradient id="${id('lg')}" cx=".4" cy=".36" r=".7"><stop offset="0" stop-color="#ffffff" stop-opacity=".22"/><stop offset=".75" stop-color="#d8ecff" stop-opacity=".2"/><stop offset="1" stop-color="#9cc2e4" stop-opacity=".5"/></radialGradient>`
      + `<linearGradient id="${id('hw')}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#c98a52"/><stop offset=".35" stop-color="#e8b07a"/><stop offset=".7" stop-color="#7a4522"/><stop offset="1" stop-color="#3a1f0c"/></linearGradient>`
      + `<linearGradient id="${id('hb')}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#b9800f"/><stop offset=".35" stop-color="#fffbe6"/><stop offset=".6" stop-color="#f2c230"/><stop offset="1" stop-color="#6e4705"/></linearGradient>`
      + `<linearGradient id="${id('k')}" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".5" stop-color="#fff" stop-opacity=".7"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>`
      + `<g id="${id('cd')}">${evmOldCard(id)}</g><clipPath id="${id('lc')}"><circle cx="${cx}" cy="${cy}" r="9.3"/></clipPath>`,
      evmEasel() + `<g transform="translate(2 0)"><use href="#${id('cd')}"/></g>` + evmLedge(id)
      /* manche de la loupe (repère tourné de 52°) : virole, bague, manche de noyer, embout */
      + `<g transform="rotate(52 ${cx} ${cy})"><rect x="${cx + 10.1}" y="${cy - 1.8}" width="4.6" height="3.6" rx=".6" fill="url(#${id('hb')})" stroke="#6e4705" stroke-width=".35"/>`
      + `<rect x="${f(cx + 14.6)}" y="${f(cy - 2.15)}" width="1.3" height="4.3" rx=".4" fill="url(#${id('hb')})" stroke="#6e4705" stroke-width=".35"/>`
      + `<rect x="${f(cx + 15.8)}" y="${f(cy - 2.4)}" width="22.4" height="4.8" rx="2.4" fill="url(#${id('hw')})" stroke="#2a1405" stroke-width=".4"/>`
      + `<path d="M${f(cx + 17)} ${f(cy - 1.3)}H${f(cx + 36.6)}" stroke="#fff" stroke-width=".6" stroke-linecap="round" opacity=".45"/><rect x="${f(cx + 37.6)}" y="${f(cy - 2)}" width="1.6" height="4" rx=".6" fill="url(#${id('hb')})" stroke="#6e4705" stroke-width=".3"/></g>`
      /* lentille : le coin grossi, la mesure de son rayon, le verre, la monture */
      + `<g clip-path="url(#${id('lc')})"><circle cx="${cx}" cy="${cy}" r="9.4" fill="#f3ecdc"/><g transform="translate(${cx} ${cy}) scale(2.1) translate(${-cx} ${-cy})"><use href="#${id('cd')}" transform="translate(2 0)"/></g>`
      + `<path d="M${P(a0)}A${rr} ${rr} 0 0 1 ${P(a1)}" fill="none" stroke="#c48a1a" stroke-width=".7" stroke-dasharray="1 .7"/><path d="${tk(a0)}${tk(a1)}" stroke="#c48a1a" stroke-width=".6" stroke-linecap="round"/>`
      + `<path d="M${f(ax + Math.cos(1.25 * Math.PI) * 7.3)} ${f(ay + Math.sin(1.25 * Math.PI) * 7.3)}L${P(1.25 * Math.PI)}" stroke="#c48a1a" stroke-width=".55" stroke-linecap="round"/>`
      + `<circle cx="${cx}" cy="${cy}" r="9.4" fill="url(#${id('lg')})"/><path class="evo-glint" d="M2 28H6L16 1H12Z" fill="url(#${id('k')})" opacity="0"/></g>`
      + `<path d="M${f(cx - 6.4)} ${f(cy - 2.6)}A7 7 0 0 1 ${f(cx - 1.8)} ${f(cy - 6.8)}" fill="none" stroke="#fff" stroke-width="1.1" stroke-linecap="round" opacity=".8"/>`
      + `<circle cx="${cx}" cy="${cy}" r="10.25" fill="none" stroke="#6e4705" stroke-width="2.9"/><circle cx="${cx}" cy="${cy}" r="10.25" fill="none" stroke="url(#${id('rim')})" stroke-width="2.1"/>`
      + `<path d="M${f(cx - 8.2)} ${f(cy - 5)}A9.6 9.6 0 0 1 ${f(cx - 3.4)} ${f(cy - 9)}" fill="none" stroke="#fffbe6" stroke-width=".5" stroke-linecap="round"/>`];
  },
  /* 1993 · le dé des 20 points de vie : icosaèdre bleu translucide aux chiffres d'or (« 20 » face au visiteur, « 8 », « 14 », « 2 » autour), sur un coussin
     de velours cramoisi à passepoil d'or et glands */
  d20: id => {
    const f = evoF, H = [[32, 9.4], [46.9, 18], [46.9, 35.2], [32, 43.8], [17.1, 35.2], [17.1, 18]], T = [[32, 17.6], [41, 33.2], [23, 33.2]];
    const F = [[T[0], T[1], T[2], '#5b93ea'], [T[0], T[1], H[1], '#4a7fd8'], [T[1], T[2], H[3], '#2d5bb3'], [T[2], T[0], H[5], '#8ab9ff'], [T[0], H[5], H[0], '#b5d5ff'],
      [T[0], H[0], H[1], '#74a6f2'], [T[1], H[1], H[2], '#3667c0'], [T[1], H[2], H[3], '#1f4593'], [T[2], H[3], H[4], '#27509f'], [T[2], H[4], H[5], '#5f94e6']];
    const poly = P => 'M' + P.map(p => f(p[0]) + ' ' + f(p[1])).join('L') + 'Z', hex = poly(H);
    const num = (s, x, y, r) => `<g transform="translate(${x} ${y}) rotate(${r}) scale(1 .8)">${evmDigits(s, 0, 0, 3.3, 'stroke="#ffe58a" opacity=".92"', .62)}</g>`;
    const tassel = x => `<circle cx="${x}" cy="47.4" r="1" fill="url(#${id('au')})" stroke="#6e4705" stroke-width=".3"/><path d="M${f(x - .9)} 48.2L${f(x - 1.6)} 52H${f(x + 1.6)}L${f(x + .9)} 48.2Z" fill="url(#${id('au')})" stroke="#6e4705" stroke-width=".3" stroke-linejoin="round"/><path d="M${f(x - .6)} 49V51.8M${x} 49V51.8M${f(x + .6)} 49V51.8" stroke="#8a5a0c" stroke-width=".25"/>`;
    return [`<radialGradient id="${id('cu')}" cx=".45" cy=".25" r=".85"><stop offset="0" stop-color="#f07a8e"/><stop offset=".5" stop-color="#b8243e"/><stop offset="1" stop-color="#5e0a1e"/></radialGradient>`
      + evmMetal(id('au'), 10, 0, 54, 0)
      + `<radialGradient id="${id('sh')}" cx="17" cy="9" r="34" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#fff" stop-opacity=".38"/><stop offset=".55" stop-color="#fff" stop-opacity=".05"/><stop offset="1" stop-color="#000" stop-opacity=".18"/></radialGradient>`,
      `<path d="M11.6 47.4C11 44 13.2 42.2 16 42.4C24 41.2 40 41.2 48 42.4C50.8 42.2 53 44 52.4 47.4C53 50.8 51 52.6 48 52.2C40 53.2 24 53.2 16 52.2C13 52.6 11 50.8 11.6 47.4Z" fill="url(#${id('cu')})" stroke="url(#${id('au')})" stroke-width=".8"/>`
      + `<path d="M16.4 43.4Q20 46 18 50.6M47.6 43.4Q44 46 46 50.6M24 51.8Q32 50.6 40 51.8" fill="none" stroke="#4a0616" stroke-width=".45" opacity=".5"/><path d="M17 43.2Q32 41.8 47 43.2" fill="none" stroke="#ffb0bc" stroke-width=".6" stroke-linecap="round" opacity=".6"/>`
      + tassel(11.4) + tassel(52.6) + `<ellipse cx="32" cy="44" rx="11.6" ry="1.7" fill="#3a0612" opacity=".5"/>`
      + F.map(([a, b, c, col]) => `<path d="${poly([a, b, c])}" fill="${col}"/>`).join('')
      + `<path d="${hex}" fill="url(#${id('sh')})"/>`
      + `<path d="${F.map(([a, b, c]) => poly([a, b, c])).join('')}" fill="none" stroke="#d8ebff" stroke-width=".45" stroke-linejoin="round" opacity=".6"/>`
      + `<path d="${hex}" fill="none" stroke="#0d1f4a" stroke-width=".8" stroke-linejoin="round"/>`
      + evmDigits('20', 32, 29.2, 6.4, 'stroke="#0d1f4a" opacity=".6" transform="translate(.35 .45)"', 1.5) + evmDigits('20', 32, 29.2, 6.4, 'stroke="#ffd860"', 1.05)
      + num('8', 39.97, 22.93, 54.6) + num('14', 24.03, 22.93, -54.6) + num('2', 32, 37.2, 180)
      + `<path d="M19.2 19.4L30.6 12.2" stroke="#fff" stroke-width=".8" stroke-linecap="round" opacity=".55"/><path d="${evnSpark(32, 17.6, 1.7)}" fill="#fff"/><circle cx="17.1" cy="18" r=".6" fill="#fff" opacity=".8"/>`];
  },
  /* 1993 · la lampe d'Arabian Nights : lampe à huile orientale en laiton (couvercle à fleuron, anse en volute, bec effilé, pied), frise d'arabesques
     gravée, cabochon corail ; petite flamme au bec (.evo-flame vacille), filet de fumée (.evo-smoke) */
  lamp: id => {
    const f = evoF, wave = evqCurve(Array.from({ length: 12 }, (_, i) => [16.8 + i * 2.05, 37.6 + (i % 2 ? -.9 : .9) * (1 - Math.abs(i - 5.5) / 9)]));
    return [`<radialGradient id="${id('br')}" cx="23" cy="31" r="22" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#fffbe6"/><stop offset=".22" stop-color="#ffe58a"/><stop offset=".48" stop-color="#f2c230"/><stop offset=".78" stop-color="#b9800f"/><stop offset="1" stop-color="#6e4705"/></radialGradient>`
      + evmMetal(id('au'), 6, 0, 56, 0) + evmBall(id('kb'), ['#fffbe6', '#ffe58a', '#e0a82a', '#7a4f06']) + evmBall(id('gm'), ['#ffffff', '#ffc4ae', '#ff6a45', '#8a1a08'])
      + `<radialGradient id="${id('fl')}" cx=".5" cy=".72" r=".7"><stop offset="0" stop-color="#ffffff"/><stop offset=".3" stop-color="#fff3b0"/><stop offset=".7" stop-color="#ffc23a"/><stop offset="1" stop-color="#ff7a1a"/></radialGradient>`
      + `<radialGradient id="${id('fg')}"><stop offset="0" stop-color="#ffe58a" stop-opacity=".85"/><stop offset="1" stop-color="#ffb347" stop-opacity="0"/></radialGradient>`
      + `<linearGradient id="${id('sm')}" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#b8b0c8" stop-opacity=".6"/><stop offset="1" stop-color="#b8b0c8" stop-opacity="0"/></linearGradient>`,
      `<path d="M15.2 33.6C10.6 30.8 7 32 7.2 35.6C7.4 38.8 10.6 40.6 15.6 39.8M10 31.8C9.2 29.6 11.4 28.6 12.2 30.2" fill="none" stroke="#6e4705" stroke-width="3" stroke-linecap="round"/>`
      + `<path d="M15.2 33.6C10.6 30.8 7 32 7.2 35.6C7.4 38.8 10.6 40.6 15.6 39.8M10 31.8C9.2 29.6 11.4 28.6 12.2 30.2" fill="none" stroke="url(#${id('au')})" stroke-width="2.1" stroke-linecap="round"/>`
      + `<path d="M8.4 34.4Q8.6 32.6 10.4 32.4" fill="none" stroke="#fffbe6" stroke-width=".5" stroke-linecap="round" opacity=".8"/>`
      + `<path d="M24.4 43.4L25.4 46.4H30.6L31.6 43.4Z" fill="url(#${id('au')})" stroke="#6e4705" stroke-width=".45" stroke-linejoin="round"/>`
      + `<path d="M20.4 48.4V49.8C20.4 51 23.8 51.7 28 51.7S35.6 51 35.6 49.8V48.4Z" fill="url(#${id('au')})" stroke="#6e4705" stroke-width=".45"/><ellipse cx="28" cy="48.4" rx="7.6" ry="1.9" fill="#ffe58a" stroke="#6e4705" stroke-width=".4"/>`
      + `<ellipse cx="28" cy="46.6" rx="3.4" ry="1" fill="url(#${id('au')})" stroke="#6e4705" stroke-width=".35"/><path d="M22 48Q28 46.8 34 48" fill="none" stroke="#fff" stroke-width=".45" opacity=".6"/>`
      + `<path d="M13.6 35.6C14.4 40.8 20.4 44.2 28 44.2C34.4 44.2 38.6 42 42 38.8C45.4 35.6 49.6 31 53.8 28.8C54.8 28.2 55.4 27 54.6 26.4C53.8 25.8 52.8 26.2 52 26.8C48.4 29.4 44.6 32 41.4 32.6C37.4 30.8 32.8 30 28 30C21.6 30 14.6 31.8 13.6 35.6Z" fill="url(#${id('br')})" stroke="#6e4705" stroke-width=".6" stroke-linejoin="round"/>`
      + `<ellipse cx="54" cy="27.3" rx=".95" ry=".5" transform="rotate(-34 54 27.3)" fill="#4a2c06"/>`
      + `<path d="M16.2 35.4Q28 33.2 40.4 35M17.4 39.8Q28 41.8 39.8 39.4" fill="none" stroke="#8a5a0c" stroke-width=".4"/><path d="${wave}" fill="none" stroke="#8a5a0c" stroke-width=".45" opacity=".85"/>`
      + `<g fill="#8a5a0c">${[18.8, 22.9, 33.1, 37.2].map(x => `<circle cx="${x}" cy="37.6" r=".35"/>`).join('')}</g>`
      + `<circle cx="28" cy="37.5" r="2.3" fill="url(#${id('au')})" stroke="#6e4705" stroke-width=".4"/><circle cx="28" cy="37.5" r="1.45" fill="url(#${id('gm')})"/><circle cx="27.5" cy="37" r=".4" fill="#fff"/>`
      + `<path d="M43 36.6Q47 33.6 51 30.4" fill="none" stroke="#8a5a0c" stroke-width=".35" opacity=".7"/>`
      + `<path d="M17.8 34Q22 31.6 27 31.4" fill="none" stroke="#fff" stroke-width="1" stroke-linecap="round" opacity=".7"/><path d="M17 40.2Q22.4 43.6 30 43.5" fill="none" stroke="#fff3c4" stroke-width=".6" stroke-linecap="round" opacity=".6"/>`
      + `<path d="M44.2 33.4Q48.6 30.6 52.2 27.8" fill="none" stroke="#fff" stroke-width=".6" stroke-linecap="round" opacity=".6"/>`
      + `<ellipse cx="28" cy="30.4" rx="9" ry="1.9" fill="url(#${id('au')})" stroke="#6e4705" stroke-width=".45"/>`
      + `<path d="M20.4 30.4C21 25.8 24.2 23.4 28 23.4C31.8 23.4 35 25.8 35.6 30.4Z" fill="url(#${id('br')})" stroke="#6e4705" stroke-width=".5" stroke-linejoin="round"/>`
      + `<path d="M21.2 28.4Q28 26.6 34.8 28.4" fill="none" stroke="#8a5a0c" stroke-width=".4"/><g fill="#8a5a0c">${[23.4, 26.2, 29.8, 32.6].map(x => `<circle cx="${x}" cy="${x < 28 ? 26 + (x - 23.4) * -.1 : 25.8}" r=".3"/>`).join('')}</g>`
      + `<path d="M22.8 28Q23.6 25 27 24.2" fill="none" stroke="#fff" stroke-width=".7" stroke-linecap="round" opacity=".7"/>`
      + `<ellipse cx="28" cy="23.3" rx="2.4" ry=".8" fill="url(#${id('au')})" stroke="#6e4705" stroke-width=".35"/><circle cx="28" cy="21.2" r="1.9" fill="url(#${id('kb')})" stroke="#6e4705" stroke-width=".4"/>`
      + `<path d="M27.2 19.8Q28 17 28 15.8Q28 17 28.8 19.8Z" fill="url(#${id('au')})" stroke="#6e4705" stroke-width=".3"/><circle cx="28" cy="15.5" r=".65" fill="#ffe58a" stroke="#6e4705" stroke-width=".3"/>`
      + `<path class="evo-smoke" d="M54.6 18.6C53 16.2 56.2 14 54.4 11.4C53 9.4 55.2 7.4 54.2 5.4" fill="none" stroke="url(#${id('sm')})" stroke-width="1.1" stroke-linecap="round"/>`
      + `<g class="evo-flame"><circle cx="54.4" cy="24.2" r="4.6" fill="url(#${id('fg')})"/><path d="M54.4 19.4C55 21.4 56.6 22.6 56.6 24.4C56.6 25.8 55.6 26.6 54.4 26.6C53.2 26.6 52.2 25.8 52.2 24.4C52.2 23 53.6 21.8 54.4 19.4Z" fill="url(#${id('fl')})" stroke="#e0651a" stroke-width=".3"/>`
      + `<ellipse cx="54.4" cy="25.2" rx=".7" ry="1" fill="#fff"/></g>`];
  },
  /* 1994 · les engrenages d'Antiquities : trois engrenages en prise (laiton, cuivre, acier) sur un chevalet de fer ; ils tournent (.evo-gear-a / -b / -c)
     sans jamais se chevaucher : phases calculées pour que chaque dent tombe dans un creux */
  gears: id => {
    const G = [[25, 31, 15.4, 14, EVM_AU, 'a', 5], [44.7, 17.2, 8.6, 8, EVM_CU, 'b', 4], [41.4, 44.75, 6, 6, EVM_FE, 'c', 0]], f = evoF;
    const T = G.map(g => 360 / g[3]), ph = [4, 0, 0];
    for (const j of [1, 2]) {
      const th = Math.atan2(G[j][1] - G[0][1], G[j][0] - G[0][0]) * 180 / Math.PI, fr = ((((th - ph[0]) % T[0]) + T[0]) % T[0]) / T[0];
      ph[j] = th + 180 - (((.5 - fr) % 1 + 1) % 1) * T[j];
    }
    const gear = ([cx, cy, rp, nt, C, key, sp], j) => {
      const ri = rp - 1.1, hole = r => `M${f(cx - r)} ${cy}A${r} ${r} 0 1 0 ${f(cx + r)} ${cy}A${r} ${r} 0 1 0 ${f(cx - r)} ${cy}Z`;
      const holes = sp ? '' : [0, 1, 2, 3].map(i => { const a = (ph[j] + 45 + i * 90) * Math.PI / 180, x = cx + Math.cos(a) * 3, y = cy + Math.sin(a) * 3; return `M${f(x - .85)} ${f(y)}A.85 .85 0 1 0 ${f(x + .85)} ${f(y)}A.85 .85 0 1 0 ${f(x - .85)} ${f(y)}Z`; }).join('');
      const riv = sp ? Array.from({ length: sp }, (_, i) => { const a = (ph[j] + 90 + (i + .5) * 360 / sp) * Math.PI / 180; return `<circle cx="${f(cx + Math.cos(a) * ri * .53)}" cy="${f(cy + Math.sin(a) * ri * .53)}" r="${f(Math.max(.35, rp * .045))}"/>`; }).join('') : '';
      return `<g class="evo-gear-${key}" style="transform-origin:${cx}px ${cy}px"><path d="${evmGear(cx, cy, rp, nt, ph[j], 2.2, sp) + holes}" fill="url(#${id('g' + key)})" fill-rule="evenodd" stroke="${C[4]}" stroke-width=".55" stroke-linejoin="round"/>`
        + `<circle cx="${cx}" cy="${cy}" r="${f(ri - .9)}" fill="none" stroke="${C[4]}" stroke-width=".35" opacity=".5"/><circle cx="${cx}" cy="${cy}" r="${f(ri - .5)}" fill="none" stroke="${C[0]}" stroke-width=".3" opacity=".55"/>`
        + `<g fill="${C[1]}" stroke="${C[4]}" stroke-width=".25">${riv}</g>`
        + `<circle cx="${cx}" cy="${cy}" r="${f(rp * .27)}" fill="url(#${id('g' + key)})" stroke="${C[4]}" stroke-width=".45"/><circle cx="${cx}" cy="${cy}" r="${f(rp * .13)}" fill="${C[3]}" stroke="${C[4]}" stroke-width=".3"/>`
        + `<path d="M${f(cx - rp * .1)} ${f(cy - rp * .06)}L${f(cx + rp * .1)} ${f(cy + rp * .06)}" stroke="${C[4]}" stroke-width=".35"/>`
        + `<path d="M${f(cx + Math.cos(3.6) * (ri - .5))} ${f(cy + Math.sin(3.6) * (ri - .5))}A${f(ri - .5)} ${f(ri - .5)} 0 0 1 ${f(cx + Math.cos(4.5) * (ri - .5))} ${f(cy + Math.sin(4.5) * (ri - .5))}" fill="none" stroke="#fff" stroke-width=".6" stroke-linecap="round" opacity=".55"/>`
        + `</g>`;
    };
    return [G.map(([, , , , C, key]) => `<radialGradient id="${id('g' + key)}" cx=".38" cy=".32" r=".8"><stop offset="0" stop-color="${C[0]}"/><stop offset=".32" stop-color="${C[1]}"/><stop offset=".68" stop-color="${C[2]}"/><stop offset="1" stop-color="${C[3]}"/></radialGradient>`).join(''),
      `<path d="M25 31L16 51.2M25 31L34 51.2" stroke="#2e2a3e" stroke-width="1.7" stroke-linecap="round"/><path d="M14.4 50.6H18M32.2 50.6H35.8" stroke="#2e2a3e" stroke-width="1.4" stroke-linecap="round"/>`
      + `<path d="M25 31L44.7 17.2M25 31L41.4 44.75" stroke="#3a3450" stroke-width="1.5" stroke-linecap="round"/><path d="M25.2 30.4L44.4 16.8M25.6 30.6L41.6 44.2" stroke="#8a84a8" stroke-width=".35" opacity=".7"/>`
      + G.map(gear).join('')];
  },
  /* légendaire · le lotus d'or : fleur stylisée originale (pas une carte) sur sa feuille de nénuphar dorée, perle de lumière au cœur (toujours allumé) */
  lotus: id => [evmLotusDefs(id), evmLotus(id)],
};

Object.assign(EV_ART, {
  /** Relique du musée (viewBox 64 × 64) : o.k clé de evpacks.js › museum.relics (ou 'lotus') ; o.lit : célébration ; o.cls : classes en plus. */
  relicArt: (o = {}) => { const k = Object.prototype.hasOwnProperty.call(EVM_RELIC, o.k) && o.k !== '_' ? o.k : '_'; return evmStage(o, k === '_' ? 'card' : k, EVM_RELIC[k]); },
});

/* ── Anniversaire de Magic : le musée (salles, inauguration, gâteau du jour J, récompenses) ─────────────────────────────────────────────────── */
/* Marbre du musée : [reflet, clair, moyen, ombre, ombre portée, trait] */
const EVM_MB = ['#fffdf7', '#f4eee2', '#e3d8c4', '#c9bb9f', '#9c8c70', '#5e5040'];
/* Motifs des frontons (repère centré en 0 0, environ 14 × 8, or en relief) : 0 livre ouvert (les origines), 1 couronne de laurier et étoile (l'âge d'or),
   2 planète en orbite (le nouveau millénaire : Magic en ligne), 3 écu et épées croisées (l'ère du Commander), 4 étincelle (aujourd'hui). */
const EVM_MOTIF = [
  `<path d="M0-1.8C-1.8-3-4.4-3.2-6.6-2.4V2.8C-4.4 2-1.8 2.2 0 3.4C1.8 2.2 4.4 2 6.6 2.8V-2.4C4.4-3.2 1.8-3 0-1.8Z"/><path d="M0-1.8V3.4M-5.6-1.1Q-3.2-1.9-1-.8M-5.6.6Q-3.2-.2-1 .9M5.6-1.1Q3.2-1.9 1-.8M5.6.6Q3.2-.2 1 .9" fill="none" stroke-width=".3"/>`,
  `<path d="M-.8 3.4C-4.6 2.8-6.6.2-6-3.4M.8 3.4C4.6 2.8 6.6.2 6-3.4" fill="none" stroke-width=".55"/>`
    + [1, -1].map(s => [[-3.4, 2.7, -30], [-5.2, 1.3, -58], [-6.1, -.9, -82], [-6.1, -3, -100]].map(([x, y, r]) => `<ellipse cx="${x * s}" cy="${y}" rx="1.15" ry=".5" transform="rotate(${r * s} ${x * s} ${y})"/>`).join('')).join('')
    + `<path d="${evnStar5(0, -.3, 2.6)}"/>`,
  `<g transform="rotate(-12)"><path d="M-6.4 0A6.4 1.6 0 0 1 6.4 0" fill="none" stroke-width=".75"/></g><circle r="2.6" cy="-.1"/><path d="M-1.4-1.4A1.6 1.6 0 0 1 .4-2" fill="none" stroke="#fffbe6" stroke-width=".4"/>`
    + `<g transform="rotate(-12)"><path d="M-6.4 0A6.4 1.6 0 0 0 6.4 0" fill="none" stroke-width=".75"/></g><circle cx="-5.6" cy="-2.8" r=".55"/><circle cx="5.4" cy="2.6" r=".45"/>`,
  `<path d="M-5.4 3.2L6-3.4M5.4 3.2L-6-3.4" fill="none" stroke-width="1" stroke-linecap="round"/><path d="M-4.8 1.46L-3.6 3.54M4.8 1.46L3.6 3.54" fill="none" stroke-width=".7" stroke-linecap="round"/>`
    + `<circle cx="-5.8" cy="3.5" r=".55"/><circle cx="5.8" cy="3.5" r=".55"/><circle r="3"/><circle r="2.1" fill="none" stroke-width=".3"/><circle r=".8"/>`,
  `<path d="M-6.6 0H-5.2M5.2 0H6.6M-4.4-3L-3.6-2.4M4.4-3L3.6-2.4M-4.4 3L-3.6 2.4M4.4 3L3.6 2.4" fill="none" stroke-width=".5" stroke-linecap="round"/>`
    + `<path d="${evnSpark(0, 0, 4.2)}"/><path d="${evnSpark(0, 0, 2.4)}" transform="rotate(45)"/><circle r=".7" fill="#fffbe6"/>`,
];
/* Reliques en ombre dans les fenêtres allumées (x : milieu de la fenêtre ; posées sur un petit socle en y 44,2) : vase, carte, orbe, couronne, buste, livre */
const EVM_WIN_OBJ = [
  x => `M${x - .9} 44.2C${x - 1.4} 42.6 ${x - 1} 41.2 ${x - .4} 40.8V40H${x + .4}V40.8C${x + 1} 41.2 ${x + 1.4} 42.6 ${x + .9} 44.2Z`,
  x => `M${x - .9} 44.2L${x - .6} 40.4H${x + 1.1}L${x + .8} 44.2Z`,
  x => `M${x - 1.1} 42.6A1.1 1.1 0 1 0 ${x + 1.1} 42.6A1.1 1.1 0 1 0 ${x - 1.1} 42.6ZM${x - .5} 44.2L${x - .3} 43.6H${x + .3}L${x + .5} 44.2Z`,
  x => `M${x - 1.2} 44.2V41.6L${x - .6} 42.6L${x} 41L${x + .6} 42.6L${x + 1.2} 41.6V44.2Z`,
  x => `M${x - 1.1} 44.2Q${x - 1.1} 42.6 ${x} 42.4Q${x + 1.1} 42.6 ${x + 1.1} 44.2ZM${x - .65} 41.4A.65 .65 0 1 0 ${x + .65} 41.4A.65 .65 0 1 0 ${x - .65} 41.4Z`,
  x => `M${x - 1.3} 44.2V42.4L${x} 42.9L${x + 1.3} 42.4V44.2L${x} 44.6Z`,
].map(g => x => g(x).replace(/(\d+\.\d{3,})/g, m => evoF(+m)));
/** Ellipse en un tracé (anneaux de ciseaux…). */
const evmEll = (cx, cy, rx, ry) => `M${evoF(cx - rx)} ${evoF(cy)}A${rx} ${ry} 0 1 0 ${evoF(cx + rx)} ${evoF(cy)}A${rx} ${ry} 0 1 0 ${evoF(cx - rx)} ${evoF(cy)}Z`;
/** Glaçage d'un étage de gâteau : dessus elliptique (cx, y, rx, ry) et bord avant qui coule ; drips : [x, largeur, longueur] ; b : épaisseur du bord. */
function evmIcing(cx, y, rx, ry, drips, b = 1.6) {
  const f = evoF, yb = x => y + ry * Math.sqrt(Math.max(0, 1 - ((x - cx) / rx) ** 2)) + b;
  let d = `M${f(cx - rx)} ${f(y)}A${f(rx)} ${f(ry)} 0 0 1 ${f(cx + rx)} ${f(y)}L${f(cx + rx)} ${f(y + b)}`, x = cx + rx;
  for (const [xd, wd, L] of drips.slice().sort((a, c) => c[0] - a[0])) {
    const xr = xd + wd / 2, xl = xd - wd / 2, yr = yb(xr), yl = yb(xl), yo = Math.max(yr, yl) + L - wd / 2;
    for (let s = x - 1.4; s > xr + .8; s -= 1.4) d += `L${f(s)} ${f(yb(s))}`;
    d += `L${f(xr + .8)} ${f(yb(xr + .8))}Q${f(xr)} ${f(yr)} ${f(xr)} ${f(yr + .9)}L${f(xr)} ${f(yo)}A${f(wd / 2)} ${f(wd / 2)} 0 0 1 ${f(xl)} ${f(yo)}L${f(xl)} ${f(yl + .9)}Q${f(xl)} ${f(yl)} ${f(xl - .8)} ${f(yb(xl - .8))}`;
    x = xl - .8;
  }
  for (let s = x - 1.4; s > cx - rx; s -= 1.4) d += `L${f(s)} ${f(yb(s))}`;
  return d + `L${f(cx - rx)} ${f(y + b)}Z`;
}

Object.assign(EV_ART, {
  /** Façade d'une salle du musée (viewBox 96 × 64) : o.k motif du fronton (0–4), o.n fenêtres allumées (0–6), o.lit : salle inaugurée. */
  museumHall: (o = {}) => {
    const n = ++EVO_N, id = s => `evo${n}${s}`, f = evoF, lit = !!o.lit, k = Math.max(0, Math.min(4, Math.floor(Number(o.k) || 0)));
    const on = lit ? 6 : Math.max(0, Math.min(6, Math.floor(Number(o.n) || 0))), M = EVM_MB, ln = (w = .4) => `stroke="${M[5]}" stroke-width="${w}" stroke-linejoin="round"`;
    const win = (x, i) => {
      const lt = i < on, a = f(x - 1.9), b = f(x + 1.9);
      return (lt ? `<ellipse cx="${x}" cy="39.4" rx="5.4" ry="8" fill="url(#${id('wh')})"/>` : '')
        + `<path d="M${f(x - 2.7)} 45.6V34.4A2.7 2.7 0 0 1 ${f(x + 2.7)} 34.4V45.6Z" fill="${M[3]}" ${ln(.35)}/>`
        + `<path d="M${a} 45.6V34.4A1.9 1.9 0 0 1 ${b} 34.4V45.6Z" fill="url(#${id(lt ? 'wl' : 'gl')})" stroke="${M[5]}" stroke-width=".3"/>`
        + (lt ? `<path d="${EVM_WIN_OBJ[i](x)}" fill="#7a4a10" opacity=".55"/><rect x="${f(x - 1.1)}" y="44.2" width="2.2" height="1.4" fill="#7a4a10" opacity=".5"/>`
          : `<path d="M${x} 32.8V45.6M${a} 39.6H${b}" stroke="#7d86ad" stroke-width=".3" opacity=".7"/><path d="M${f(x - 1.2)} 44L${f(x + .7)} 35.2" stroke="#fff" stroke-width=".45" opacity=".25"/>`)
        + `<path d="M${f(x - .75)} 30.9H${f(x + .75)}L${f(x + .5)} 32.6H${f(x - .5)}Z" fill="${M[1]}" ${ln(.3)}/><rect x="${f(x - 3.1)}" y="45.6" width="6.2" height="1" fill="${M[1]}" ${ln(.3)}/>`;
    };
    const wing = (x0, w0) => {
      let jn = `M${f(x0 - .6)} 54.4H${f(x0 + 20.6)}`, bal = '', den = '', crs = '';
      for (const dx of [4, 10, 16]) jn += `M${f(x0 + dx)} 48.4V54.4`;
      for (const dx of [1, 7, 13, 19]) jn += `M${f(x0 + dx)} 54.4V60.6`;
      for (let bx = x0 + 2.8; bx < x0 + 18; bx += 1.6) bal += `<ellipse cx="${f(bx)}" cy="24.2" rx=".55" ry="1.3"/>`;
      for (let dx = x0 + .4; dx < x0 + 19.8; dx += 1.4) den += `M${f(dx)} 28.1h.7v.7h-.7Z`;
      for (const y of [32.4, 36.8, 41.2]) crs += `M${x0} ${y}H${f(x0 + 20)}`;
      const urn = x => `<path d="M${f(x - .9)} 21.3C${f(x - 1.3)} 19.8 ${f(x - .6)} 19 ${f(x)} 18.7C${f(x + .6)} 19 ${f(x + 1.3)} 19.8 ${f(x + .9)} 21.3Z" fill="url(#${id('au')})" stroke="#6e4705" stroke-width=".3"/>`;
      return `<rect x="${f(x0 - .6)}" y="48.4" width="21.2" height="12.2" fill="${M[2]}" ${ln()}/><path d="${jn}" stroke="${M[4]}" stroke-width=".3" opacity=".6"/>`
        + `<rect x="${x0}" y="28" width="20" height="20.4" fill="url(#${id('wa')})" ${ln()}/><path d="${crs}" stroke="${M[3]}" stroke-width=".3" opacity=".55"/>`
        + `<rect x="${x0}" y="28" width="20" height=".8" fill="${M[4]}" opacity=".35"/><path d="${den}" fill="${M[3]}"/>`
        + `<rect x="${f(x0 - 1)}" y="25.8" width="22" height="2.2" fill="${M[1]}" ${ln()}/><path d="M${f(x0 - 1)} 26.3H${f(x0 + 21)}" stroke="${M[0]}" stroke-width=".4"/>`
        + `<g fill="${M[2]}" stroke="${M[5]}" stroke-width=".25">${bal}</g><rect x="${x0}" y="21.6" width="20" height="1" fill="${M[1]}" ${ln(.35)}/>`
        + `<rect x="${x0}" y="21.2" width="1.8" height="4.6" fill="${M[1]}" ${ln(.35)}/><rect x="${f(x0 + 18.2)}" y="21.2" width="1.8" height="4.6" fill="${M[1]}" ${ln(.35)}/>`
        + urn(x0 + .9) + urn(x0 + 19.1) + [0, 1, 2].map(j => win(x0 + 4 + j * 6, w0 + j)).join('');
    };
    const col = c => `<path d="M${f(c - 2.1)} 51.2L${f(c - 1.8)} 26.4H${f(c + 1.8)}L${f(c + 2.1)} 51.2Z" fill="url(#${id('co')})" ${ln(.35)}/>`
      + `<path d="M${f(c - .9)} 27V50.6M${c} 27V50.8M${f(c + .9)} 27V50.6" stroke="${M[4]}" stroke-width=".25" opacity=".55"/>`
      + `<rect x="${f(c - 2.7)}" y="50.6" width="5.4" height=".9" fill="${M[1]}" ${ln(.3)}/><rect x="${f(c - 3)}" y="51.5" width="6" height=".9" fill="${M[2]}" ${ln(.3)}/>`
      + `<rect x="${f(c - 2.2)}" y="25.5" width="4.4" height=".9" fill="${M[1]}" ${ln(.3)}/>`
      + `<g fill="${M[1]}" ${ln(.3)}><circle cx="${f(c - 2.3)}" cy="25.6" r=".85"/><circle cx="${f(c + 2.3)}" cy="25.6" r=".85"/></g><g fill="${M[4]}"><circle cx="${f(c - 2.3)}" cy="25.6" r=".3"/><circle cx="${f(c + 2.3)}" cy="25.6" r=".3"/></g>`
      + `<rect x="${f(c - 3)}" y="24.5" width="6" height=".8" fill="${M[0]}" ${ln(.3)}/>`;
    let tri = '', den = '';
    for (let x = 25.2; x < 71; x += 4.1) if (x < 42 || x > 53.6) tri += `<rect x="${f(x)}" y="19.5" width="1.4" height="2.1" fill="${M[3]}"/><path d="M${f(x + .47)} 19.6V21.5M${f(x + .93)} 19.6V21.5" stroke="${M[4]}" stroke-width=".2"/>`;
    for (let x = 22.6; x < 73.2; x += 1.3) den += `M${f(x)} 19.2h.6v.6h-.6Z`;
    /* fête : guirlande de fanions du mana le long de l'entablement, ruban coupé noué aux colonnes de la porte */
    let flags = '';
    if (lit) {
      const P0 = [23.4, 22.6], C = [48, 31.6], P2 = [72.6, 22.6];
      for (let i = 0, t = .055; t < .96; t += .081, i++) {
        const u = 1 - t, x = u * u * P0[0] + 2 * t * u * C[0] + t * t * P2[0], y = u * u * P0[1] + 2 * t * u * C[1] + t * t * P2[1];
        const dx = 2 * u * (C[0] - P0[0]) + 2 * t * (P2[0] - C[0]), dy = 2 * u * (C[1] - P0[1]) + 2 * t * (P2[1] - C[1]), l = Math.hypot(dx, dy), tx = dx / l, ty = dy / l, m = EVY_MANA[i % 5];
        flags += `<path d="M${f(x - tx * 1.2)} ${f(y - ty * 1.2)}L${f(x + tx * 1.2)} ${f(y + ty * 1.2)}L${f(x - ty * 2.8)} ${f(y + tx * 2.8)}Z" fill="${m[2]}" stroke="${m[4]}" stroke-width=".3" stroke-linejoin="round"/>`;
      }
      flags = `<g class="evo-flags"><path d="M23.4 22.6Q48 31.6 72.6 22.6" fill="none" stroke="#6e4705" stroke-width=".35"/>${flags}</g>`;
    }
    const R = EVN_RIB.rouge, rib = lit ? `<rect x="37.2" y="39.6" width="4.4" height="1.5" fill="${R[1]}" stroke="${R[3]}" stroke-width=".3"/><rect x="54.4" y="39.6" width="4.4" height="1.5" fill="${R[1]}" stroke="${R[3]}" stroke-width=".3"/>`
      + `<path d="${evmBand([[41.2, 40.4], [42.4, 41.8], [43, 44.2], [43, 47]], 1.7, .9)}${evmBand([[54.8, 40.4], [53.6, 41.8], [53, 44.2], [53, 47.2]], 1.7, .9)}" fill="url(#${id('rb')})" stroke="${R[3]}" stroke-width=".3" stroke-linejoin="round"/>`
      + evqBow(41.4, 40.3, .12, R, id('rb')) + evqBow(54.6, 40.3, .12, R, id('rb')) : '';
    return `<svg class="evo evo-hall evo-hall-${k}${lit ? ' evo-lit' : ''}${o.cls ? ' ' + o.cls : ''}" viewBox="0 0 96 64" aria-hidden="true" focusable="false"><defs>`
      + `<radialGradient id="${id('g')}" cx="48" cy="34" r="50" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#fff3c4" stop-opacity="${lit ? .85 : .3}"/><stop offset=".55" stop-color="#f2c230" stop-opacity="${lit ? .3 : .07}"/><stop offset="1" stop-color="#f2c230" stop-opacity="0"/></radialGradient>`
      + (lit ? `<linearGradient id="${id('y')}" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#fffbe0" stop-opacity=".9"/><stop offset="1" stop-color="#f2c230" stop-opacity="0"/></linearGradient>`
        + `<linearGradient id="${id('rb')}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${R[0]}"/><stop offset=".5" stop-color="${R[1]}"/><stop offset="1" stop-color="${R[2]}"/></linearGradient>` : '')
      + `<linearGradient id="${id('wa')}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${M[0]}"/><stop offset=".6" stop-color="${M[1]}"/><stop offset="1" stop-color="${M[2]}"/></linearGradient>`
      + `<linearGradient id="${id('sh')}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#cfc2a6"/><stop offset="1" stop-color="#ddd2bb"/></linearGradient>`
      + `<linearGradient id="${id('co')}" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#b9aa8c"/><stop offset=".26" stop-color="#fffdf7"/><stop offset=".5" stop-color="#efe8da"/><stop offset=".8" stop-color="#d2c5ab"/><stop offset="1" stop-color="#9f8f72"/></linearGradient>`
      + `<linearGradient id="${id('ty')}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e9dfca"/><stop offset="1" stop-color="#cdbfa2"/></linearGradient>`
      + `<linearGradient id="${id('gl')}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2c3466"/><stop offset="1" stop-color="#141832"/></linearGradient>`
      + `<radialGradient id="${id('wl')}" cx=".5" cy=".62" r=".72"><stop offset="0" stop-color="#fffbe6"/><stop offset=".45" stop-color="#ffe07a"/><stop offset=".85" stop-color="#e3a22a"/><stop offset="1" stop-color="#a8650f"/></radialGradient>`
      + `<radialGradient id="${id('wh')}"><stop offset="0" stop-color="#ffd86a" stop-opacity=".6"/><stop offset="1" stop-color="#ffd86a" stop-opacity="0"/></radialGradient>`
      + evmMetal(id('dr'), 43.8, 0, 52.2, 0, ['#e8c9a0', '#b58a58', '#8a5f34', '#5a3a1a', '#2e1c0a'])
      + `<radialGradient id="${id('in')}" cx=".5" cy=".72" r=".8"><stop offset="0" stop-color="#fffbe6"/><stop offset=".4" stop-color="#ffd86a"/><stop offset=".78" stop-color="#e39a2a"/><stop offset="1" stop-color="#7a4310"/></radialGradient>`
      + `<linearGradient id="${id('sp')}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffe58a" stop-opacity=".7"/><stop offset="1" stop-color="#ffe58a" stop-opacity="0"/></linearGradient>`
      + `<linearGradient id="${id('mo')}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${EVM_AU[1]}"/><stop offset=".35" stop-color="${EVM_AU[0]}"/><stop offset=".6" stop-color="${EVM_AU[2]}"/><stop offset="1" stop-color="${EVM_AU[3]}"/></linearGradient>`
      + evmMetal(id('au'), 40, 0, 56, 0)
      + `<radialGradient id="${id('o')}"><stop offset="0" stop-color="#1a1030" stop-opacity=".35"/><stop offset="1" stop-color="#1a1030" stop-opacity="0"/></radialGradient></defs>`
      + `<ellipse class="evo-glow" cx="48" cy="34" rx="50" ry="40" fill="url(#${id('g')})"/>` + (lit ? evnRays(id('y'), 48, 30, 32) : '')
      + `<ellipse cx="48" cy="61.4" rx="47" ry="2.4" fill="url(#${id('o')})"/>`
      + wing(4.6, 0) + wing(71.4, 3)
      /* portique : mur du fond dans l'ombre, porte (bronze fermée, ou ouverte sur la salle éclairée), marches, colonnes */
      + `<rect x="26.6" y="24.6" width="42.8" height="27.8" fill="url(#${id('sh')})" ${ln()}/><rect x="26.6" y="24.6" width="42.8" height="2.2" fill="#3a2a10" opacity=".14"/>`
      + `<rect x="42.4" y="31.4" width="11.2" height="21" fill="${M[3]}" ${ln()}/><rect x="41.4" y="30.4" width="13.2" height="1.3" fill="${M[1]}" ${ln(.35)}/><circle cx="48" cy="28.4" r="1.2" fill="url(#${id('au')})" stroke="#6e4705" stroke-width=".3"/>`
      + (lit ? `<rect x="43.8" y="33" width="8.4" height="19.4" fill="url(#${id('in')})"/><path d="M45.4 52.4V40.6A2.6 2.6 0 0 1 50.6 40.6V52.4Z" fill="#fff3c4" opacity=".45"/>`
        + `<rect x="46.6" y="47.6" width="2.8" height="4.8" fill="#9a5a14" opacity=".55"/><path d="M46.9 47.6L47.3 44H48.9L49.1 47.6Z" fill="#9a5a14" opacity=".55"/>`
        + `<path d="M43.8 33L45.6 34.6V51.2L43.8 52.4ZM52.2 33L50.4 34.6V51.2L52.2 52.4Z" fill="url(#${id('dr')})" stroke="#2e1c0a" stroke-width=".3" stroke-linejoin="round"/>`
        : `<rect x="43.8" y="33" width="4.2" height="19.4" fill="url(#${id('dr')})" stroke="#2e1c0a" stroke-width=".35"/><rect x="48" y="33" width="4.2" height="19.4" fill="url(#${id('dr')})" stroke="#2e1c0a" stroke-width=".35"/>`
        + `<path d="M44.6 34.4h2.6v6.6h-2.6ZM44.6 42.4h2.6v8.4h-2.6ZM48.8 34.4h2.6v6.6h-2.6ZM48.8 42.4h2.6v8.4h-2.6Z" fill="none" stroke="#2e1c0a" stroke-width=".3" opacity=".6"/>`
        + `<path d="M44.8 34.6V40.8M44.8 42.6V50.6M49 34.6V40.8M49 42.6V50.6" stroke="#f0d4a8" stroke-width=".25" opacity=".6"/>`
        + `<g fill="none" stroke="#f2c230" stroke-width=".35"><circle cx="47.2" cy="43.6" r=".6"/><circle cx="48.8" cy="43.6" r=".6"/></g>`)
      + `<rect x="22.6" y="57.8" width="50.8" height="2.8" fill="${M[2]}" ${ln()}/><rect x="24.6" y="55.1" width="46.8" height="2.7" fill="${M[1]}" ${ln()}/><rect x="26.6" y="52.4" width="42.8" height="2.7" fill="${M[1]}" ${ln()}/>`
      + `<path d="M23 58.2H73M25 55.5H71M27 52.8H69" stroke="${M[0]}" stroke-width=".45"/>`
      + (lit ? `<path d="M43.8 52.4H52.2L57.4 60.6H38.6Z" fill="url(#${id('sp')})"/>` : '')
      + [30.6, 39.4, 56.6, 65.4].map(col).join('') + rib
      /* entablement : architrave, frise à triglyphes et cartel du numéro de salle (chiffres romains), corniche à denticules */
      + `<rect x="23.4" y="21.8" width="49.2" height="2.8" fill="${M[1]}" ${ln()}/><path d="M23.4 23H72.6" stroke="${M[3]}" stroke-width=".3"/>`
      + `<rect x="23.4" y="19.2" width="49.2" height="2.6" fill="${M[2]}" ${ln()}/>${tri}`
      + `<rect x="42.6" y="19.4" width="10.8" height="2.2" rx=".4" fill="url(#${id('au')})" stroke="#6e4705" stroke-width=".3"/>` + evmDigits(['I', 'II', 'III', 'IV', 'V'][k], 48, 20.5, 1.5, 'stroke="#5a3a06"', .38)
      + `<rect x="22" y="17.4" width="52" height="1.8" fill="${M[0]}" ${ln()}/><path d="${den}" fill="${M[3]}"/>`
      /* fronton : corniche rampante, tympan, motif de la salle en or, acrotères */
      + `<path d="M21.4 17.6L48 3.6L74.6 17.6Z" fill="${M[0]}" ${ln(.5)}/><path d="M26.2 16.8L48 6L69.8 16.8Z" fill="url(#${id('ty')})" ${ln(.35)}/><path d="M23.6 16.9L48 4.6L72.4 16.9" fill="none" stroke="${M[3]}" stroke-width=".3"/>`
      + `<g transform="translate(48 12.7)" fill="url(#${id('mo')})" stroke="#6e4705" stroke-width=".35" stroke-linejoin="round">${EVM_MOTIF[k]}</g>`
      + `<path d="M48 3.8C46.4 2.6 46.4 1 47.2.4C47.6 1.4 47.8 2.2 48 3C48.2 2.2 48.4 1.4 48.8.4C49.6 1 49.6 2.6 48 3.8Z" fill="url(#${id('au')})" stroke="#6e4705" stroke-width=".3"/>`
      + `<g fill="url(#${id('au')})" stroke="#6e4705" stroke-width=".3"><circle cx="21.6" cy="16.6" r="1"/><circle cx="74.4" cy="16.6" r="1"/></g>`
      + flags + (lit ? evmSpk([[10, 12, 2.6], [86, 10, 2.4], [32, 6, 1.8], [64, 5, 2], [4, 32, 1.8], [92, 30, 2]]) : '') + `</svg>`;
  },
  /** Ruban d'inauguration coupé (viewBox 64 × 32) : poteaux dorés, ruban de satin rouge tranché en V, ciseaux d'or ; lames, bouts de ruban et étincelles animés. */
  ribbonCut: (o = {}) => {
    const n = ++EVO_N, id = s => `evo${n}${s}`, R = EVN_RIB.rouge, f = evoF;
    const L = [[3.8, 11], [9.4, 13], [15, 14.2], [19.6, 15.4], [22.8, 18.2], [24.4, 22.6], [24.8, 27.4]], Rt = L.map(([x, y], i) => [64 - x, y + i * .1]);
    const side = (P, cls) => `<g class="${cls}"><path d="${evmBand(P, 5.4, 2.2)}" fill="url(#${id('rb')})" stroke="${R[3]}" stroke-width=".5" stroke-linejoin="round"/>`
      + `<path d="${evqCurve(P.slice(0, -1).map(([x, y]) => [x, y - 1.3]))}" fill="none" stroke="#ffd6cf" stroke-width=".8" stroke-linecap="round" opacity=".75"/>`
      + `<path d="${evqCurve(P.slice(0, -1).map(([x, y]) => [x, y + 1.6]))}" fill="none" stroke="${R[2]}" stroke-width=".55" stroke-linecap="round" opacity=".7"/></g>`;
    const post = x => `<rect x="${f(x - 1.1)}" y="10.6" width="2.2" height="19.4" rx=".5" fill="url(#${id('pm')})" stroke="#6e4705" stroke-width=".4"/>`
      + `<path d="M${f(x - 2.8)} 31.2Q${x} 28.6 ${f(x + 2.8)} 31.2Z" fill="url(#${id('pm')})" stroke="#6e4705" stroke-width=".4" stroke-linejoin="round"/>`
      + `<circle cx="${x}" cy="9" r="2" fill="url(#${id('kb')})" stroke="#6e4705" stroke-width=".4"/><circle cx="${f(x - .6)}" cy="8.4" r=".5" fill="#fff" opacity=".85"/>`;
    /* ciseaux : lame A (pointe en bas à gauche, anneau en haut à droite), lame B en miroir (x → 65,2 − x) */
    const bladeA = `<path d="M33.6 15C33 19.6 31 25.4 27.4 29.8C28.4 27.2 30 22 31.4 15.6Z" fill="url(#${id('sg')})" stroke="#6e4705" stroke-width=".45" stroke-linejoin="round"/>`
      + `<path d="M31.4 15.8L28 28.6" stroke="#fffbe6" stroke-width=".45" stroke-linecap="round"/>`
      + `<path d="M33.4 15.8L37.2 9.2L38.8 10.2L34.8 16.4Z" fill="url(#${id('sg')})" stroke="#6e4705" stroke-width=".45" stroke-linejoin="round"/>`
      + `<path d="${evmEll(39.9, 6.4, 3.5, 2.7)}${evmEll(39.9, 6.4, 2.2, 1.5)}" transform="rotate(-28 39.9 6.4)" fill="url(#${id('sg')})" fill-rule="evenodd" stroke="#6e4705" stroke-width=".45"/>`
      + `<path d="M37.4 5.2Q38.6 3.8 40.6 3.8" transform="rotate(-28 39.9 6.4)" fill="none" stroke="#fffbe6" stroke-width=".5" stroke-linecap="round"/>`;
    return `<svg class="evo evo-ribbon-cut${o.cls ? ' ' + o.cls : ''}" viewBox="0 0 64 32" aria-hidden="true" focusable="false"><defs>`
      + `<linearGradient id="${id('rb')}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${R[0]}"/><stop offset=".45" stop-color="${R[1]}"/><stop offset="1" stop-color="${R[2]}"/></linearGradient>`
      + `<linearGradient id="${id('pm')}" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#b9800f"/><stop offset=".35" stop-color="#fffbe6"/><stop offset=".6" stop-color="#f2c230"/><stop offset="1" stop-color="#6e4705"/></linearGradient>`
      + evmBall(id('kb'), ['#fffbe6', '#ffe58a', '#e0a82a', '#7a4f06']) + evmMetal(id('sg'), 24, 2, 42, 30) + `</defs>`
      + `<g fill-opacity=".9">${[[9, 24, 0, 20], [52, 3.4, 1, -30], [56, 25, 3, 40], [17, 3.6, 4, 10], [45, 29.4, 2, -16], [5.6, 29, 1, 60]].map(([x, y, c, r]) => `<rect x="${x - 1.2}" y="${y - .6}" width="2.4" height="1.2" rx=".3" fill="${EVY_MANA[c][2]}" transform="rotate(${r} ${x} ${y})"/>`).join('')}</g>`
      + post(2.4) + post(61.6) + side(L, 'evo-rib-l') + side(Rt, 'evo-rib-r')
      + `<circle cx="3.8" cy="10.9" r="1.3" fill="${R[2]}" stroke="${R[3]}" stroke-width=".35"/><circle cx="60.2" cy="10.9" r="1.3" fill="${R[2]}" stroke="${R[3]}" stroke-width=".35"/>`
      + `<g class="evo-blade-b"><g transform="matrix(-1 0 0 1 65.2 0)">${bladeA}</g></g><g class="evo-blade-a">${bladeA}</g>`
      + `<circle cx="32.6" cy="15.4" r="1.4" fill="url(#${id('kb')})" stroke="#6e4705" stroke-width=".4"/><path d="M31.9 14.9L33.3 15.9" stroke="#6e4705" stroke-width=".35"/>`
      + evmSpk([[32.6, 23, 2.2], [26.4, 4.2, 1.4], [44.6, 21.4, 1.5]]) + `</svg>`;
  },
  /** Gâteau d'anniversaire du jour J (viewBox 96 × 96) : trois étages, glaçage qui coule, perles du mana, cinq bougies allumées, plaque vide pour le nombre
   *  (posé en HTML : centre 48, 70 du viewBox) ; o.lit : halo, rayons, étincelles. */
  cake: (o = {}) => {
    const n = ++EVO_N, id = s => `evo${n}${s}`, f = evoF, lit = !!o.lit;
    /* étages : [x gauche, x droit, haut, bas, ry, teintes [clair, moyen, foncé, contour], gouttes du glaçage [x, largeur, longueur]] */
    const TI = [
      [14, 82, 54, 76, 5, ['#d6e8ff', '#7fb0ff', '#3d6fc8', '#1d3a78'], [[17.4, 2.4, 6.6], [22.4, 2.8, 8.4], [27.6, 2.2, 5], [32.4, 2.6, 2.4], [38.4, 2.2, 2.2], [44, 2.6, 2], [50.4, 2.2, 2.2], [56, 2.6, 2.2], [61.4, 2.4, 2.4], [66.4, 2.4, 6], [71.2, 2.8, 8.6], [76.6, 2.2, 5.6]]],
      [23, 73, 38, 54, 4, ['#ffd8cc', '#ff7a5c', '#d0452e', '#6a1a0e'], [[26.4, 2.4, 5.4], [31.2, 2.6, 7.4], [36.4, 2.2, 4.4], [41.8, 2.6, 6.8], [47.4, 2.4, 4], [52.6, 2.6, 7], [58, 2.2, 4.6], [63.2, 2.6, 7.6], [68.6, 2.2, 5]]],
      [32, 64, 26, 38, 3, ['#e4fbec', '#8fe0aa', '#3fae6a', '#145a32'], [[35.2, 2.2, 4.4], [39.8, 2.4, 6.2], [44.8, 2, 3.6], [49.6, 2.4, 5.8], [54.4, 2, 3.8], [59, 2.4, 5.6]]],
    ];
    const by = (x, cx, rx, y, ry) => y + ry * Math.sqrt(Math.max(0, 1 - ((x - cx) / rx) ** 2));
    const tier = ([x0, x1, y0, y1, ry, C, D], i) => {
      const cx = (x0 + x1) / 2, rx = (x1 - x0) / 2, nP = [22, 16, 11][i];
      let pearls = '';
      for (let j = 0; j < nP; j++) { const x = x0 + (j + .5) * (x1 - x0) / nP, y = by(x, cx, rx, y1, ry) - .3, r = [1.45, 1.2, 1][i], m = EVY_MANA[j % 5];
        pearls += `<circle cx="${f(x)}" cy="${f(y)}" r="${r}" fill="${m[2]}" stroke="${m[4]}" stroke-width=".3"/><circle cx="${f(x - r * .35)}" cy="${f(y - r * .35)}" r="${f(r * .32)}" fill="#fff" opacity=".85"/>`; }
      return `<path d="M${x0} ${y0}V${y1}A${rx} ${ry} 0 0 0 ${x1} ${y1}V${y0}Z" fill="url(#${id('t' + i)})" stroke="${C[3]}" stroke-width=".55"/>`
        + `<path d="M${f(x0 + 1.6)} ${y0 + 2}V${f(y1 - 1)}" stroke="#fff" stroke-width="1.1" stroke-linecap="round" opacity=".35"/>`
        + `<path d="${evmIcing(cx, y0, rx, ry, D)}" fill="url(#${id('ic')})" stroke="#c9b08a" stroke-width=".45" stroke-linejoin="round"/>`
        + `<path d="M${f(cx - rx * .7)} ${f(y0 - ry * .45)}A${f(rx * .8)} ${f(ry * .7)} 0 0 1 ${f(cx + rx * .2)} ${f(y0 - ry * .75)}" fill="none" stroke="#fff" stroke-width=".9" stroke-linecap="round" opacity=".9"/>`
        + pearls;
    };
    /* guirlandes d'or et gemmes du mana sur l'étage du milieu ; rinceaux de crème de part et d'autre de la plaque ; étoiles d'or sur l'étage du haut */
    let sw = '', gems = '';
    const T2 = TI[1], c2 = 48, r2 = 25, xs = [24.6, 33.4, 42.2, 53.8, 62.6, 71.4];
    for (let j = 0; j < xs.length - 1; j++) { const a = xs[j], b = xs[j + 1], ya = by(a, c2, r2, 46.6, 4), yb = by(b, c2, r2, 46.6, 4); sw += `M${f(a)} ${f(ya)}Q${f((a + b) / 2)} ${f((ya + yb) / 2 + 4.2)} ${f(b)} ${f(yb)}`; }
    xs.forEach((x, j) => { const y = by(x, c2, r2, 46.6, 4), m = EVY_MANA[j % 5]; gems += `<circle cx="${f(x)}" cy="${f(y)}" r="1.5" fill="${m[2]}" stroke="#6e4705" stroke-width=".4"/><circle cx="${f(x - .5)}" cy="${f(y - .5)}" r=".45" fill="#fff"/>`; });
    const scroll = s => `<path d="M${48 - s * 16.6} 66.6C${48 - s * 20.6} 64.6 ${48 - s * 24.6} 67 ${48 - s * 23.4} 70.4C${48 - s * 22.4} 73 ${48 - s * 19} 72.4 ${48 - s * 19.6} 70.2M${48 - s * 16.6} 73.6C${48 - s * 21} 75.6 ${48 - s * 26.4} 74.6 ${48 - s * 28.4} 71.4" fill="none" stroke="#fffaf0" stroke-width="1.1" stroke-linecap="round"/>`;
    const CX = [38.4, 43.2, 48, 52.8, 57.6], CB = CX.map(x => by(x, 48, 10, 26, 1.6) + .4), CH = [10.6, 11.4, 12, 11.4, 10.6];
    const candle = i => {
      const x = CX[i], yb = CB[i], yt = yb - CH[i], m = EVY_MANA[i];
      let st = ''; for (let y = yb - .6; y > yt + 1.2; y -= 2.4) st += `M${f(x - 1.3)} ${f(y)}L${f(x + 1.3)} ${f(y - 1.2)}V${f(y - .4)}L${f(x - 1.3)} ${f(y + .8)}Z`;
      return `<rect x="${f(x - 1.3)}" y="${f(yt)}" width="2.6" height="${f(CH[i])}" rx=".4" fill="${i === 0 ? '#fffbe6' : m[1]}" stroke="${m[4]}" stroke-width=".35"/><path d="${st}" fill="${m[2]}"/>`
        + `<path d="M${f(x - .7)} ${f(yt + .8)}V${f(yb - .8)}" stroke="#fff" stroke-width=".5" stroke-linecap="round" opacity=".7"/>`
        + `<ellipse cx="${x}" cy="${f(yt)}" rx="1.3" ry=".45" fill="#fffbf0" stroke="${m[4]}" stroke-width=".25"/><path d="M${f(x + .6)} ${f(yt + .2)}V${f(yt + 1.6)}" stroke="#fffbf0" stroke-width=".7" stroke-linecap="round"/>`
        + `<path d="M${x} ${f(yt)}V${f(yt - 1.3)}" stroke="#3a2a20" stroke-width=".5" stroke-linecap="round"/>`
        + `<g class="evo-flame" style="--d:${(-i * .37).toFixed(2)}s"><circle cx="${x}" cy="${f(yt - 3.6)}" r="3.8" fill="url(#${id('fg')})"/>`
        + `<path d="M${x} ${f(yt - 6.6)}C${f(x + .4)} ${f(yt - 4.8)} ${f(x + 1.5)} ${f(yt - 3.6)} ${f(x + 1.5)} ${f(yt - 2.4)}C${f(x + 1.5)} ${f(yt - 1.4)} ${f(x + .8)} ${f(yt - .9)} ${x} ${f(yt - .9)}C${f(x - .8)} ${f(yt - .9)} ${f(x - 1.5)} ${f(yt - 1.4)} ${f(x - 1.5)} ${f(yt - 2.4)}C${f(x - 1.5)} ${f(yt - 3.6)} ${f(x - .4)} ${f(yt - 4.8)} ${x} ${f(yt - 6.6)}Z" fill="url(#${id('fl')})" stroke="#e0651a" stroke-width=".25"/>`
        + `<ellipse cx="${x}" cy="${f(yt - 1.9)}" rx=".55" ry=".85" fill="#fff"/></g>`;
    };
    const conf = [[8, 10, 0, 0, 25], [86, 8, 1, 1, -20], [5, 34, 2, 3, 50], [91, 30, 3, 0, -40], [12, 58, 4, 2, 0], [86, 54, 0, 3, 70], [20, 18, 3, 1, 10], [76, 18, 4, 0, -60], [4, 76, 1, 0, 30], [92, 74, 2, 1, -15], [26, 6, 2, 2, 0], [70, 4, 0, 2, 0]];
    return `<svg class="evo evo-cake${lit ? ' evo-lit' : ''}${o.cls ? ' ' + o.cls : ''}" viewBox="0 0 96 96" aria-hidden="true" focusable="false"><defs>`
      + `<radialGradient id="${id('g')}" cx="48" cy="46" r="48" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#fff3c4" stop-opacity="${lit ? .9 : .4}"/><stop offset=".55" stop-color="#ffb3a0" stop-opacity="${lit ? .3 : .1}"/><stop offset="1" stop-color="#7fb0ff" stop-opacity="0"/></radialGradient>`
      + (lit ? `<linearGradient id="${id('y')}" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#fffbe0" stop-opacity=".9"/><stop offset="1" stop-color="#f2c230" stop-opacity="0"/></linearGradient>` : '')
      + TI.map(([x0, x1, , , , C], i) => `<linearGradient id="${id('t' + i)}" x1="${x0}" y1="0" x2="${x1}" y2="0" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="${C[2]}"/><stop offset=".3" stop-color="${C[0]}"/><stop offset=".58" stop-color="${C[1]}"/><stop offset="1" stop-color="${C[2]}"/></linearGradient>`).join('')
      + `<linearGradient id="${id('ic')}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset=".6" stop-color="#fff7ea"/><stop offset="1" stop-color="#efdfc4"/></linearGradient>`
      + evmMetal(id('au'), 6, 0, 90, 0) + evmMetal(id('pq'), 33, 63, 63, 77)
      + `<radialGradient id="${id('pc')}" cx=".5" cy=".4" r=".7"><stop offset="0" stop-color="#fffdf6"/><stop offset="1" stop-color="#f3e8cc"/></radialGradient>`
      + `<radialGradient id="${id('fl')}" cx=".5" cy=".75" r=".75"><stop offset="0" stop-color="#ffffff"/><stop offset=".3" stop-color="#fff3b0"/><stop offset=".7" stop-color="#ffc23a"/><stop offset="1" stop-color="#ff7a1a"/></radialGradient>`
      + `<radialGradient id="${id('fg')}"><stop offset="0" stop-color="#ffe58a" stop-opacity=".8"/><stop offset="1" stop-color="#ffb347" stop-opacity="0"/></radialGradient>`
      + `<radialGradient id="${id('o')}"><stop offset="0" stop-color="#1a1030" stop-opacity=".35"/><stop offset="1" stop-color="#1a1030" stop-opacity="0"/></radialGradient></defs>`
      + `<circle class="evo-glow" cx="48" cy="46" r="48" fill="url(#${id('g')})"/>` + (lit ? evnRays(id('y'), 48, 44, 46) : '')
      + `<g class="evo-confetti">${conf.map(([x, y, c, s, r]) => { const m = EVY_MANA[c]; return s === 0 ? `<rect x="${x - 1.6}" y="${y - .8}" width="3.2" height="1.6" rx=".3" fill="${m[2]}" stroke="${m[4]}" stroke-width=".25" transform="rotate(${r} ${x} ${y})"/>`
        : s === 1 ? `<circle cx="${x}" cy="${y}" r="1.1" fill="${m[2]}" stroke="${m[4]}" stroke-width=".25"/>` : s === 2 ? `<path d="M${x - 2.4} ${y}Q${x - 1.2} ${y - 1.6} ${x} ${y}T${x + 2.4} ${y}" fill="none" stroke="${m[2]}" stroke-width=".8" stroke-linecap="round" transform="rotate(${r} ${x} ${y})"/>`
        : `<path d="${evnStar5(x, y, 1.5)}" fill="${m[2]}" stroke="${m[4]}" stroke-width=".25"/>`; }).join('')}</g>`
      + `<ellipse cx="48" cy="94.2" rx="30" ry="1.8" fill="url(#${id('o')})"/>`
      /* présentoir d'or : pied, colonne, plateau */
      + `<path d="M37 92.6V93.4C37 94.4 42 95 48 95S59 94.4 59 93.4V92.6Z" fill="url(#${id('au')})" stroke="#6e4705" stroke-width=".45"/><ellipse cx="48" cy="92.6" rx="11" ry="1.6" fill="#ffe58a" stroke="#6e4705" stroke-width=".4"/>`
      + `<path d="M41.4 86.4C43.4 88 44 90 43.8 92H52.2C52 90 52.6 88 54.6 86.4Z" fill="url(#${id('au')})" stroke="#6e4705" stroke-width=".45" stroke-linejoin="round"/>`
      + `<path d="M7 80V81.8A41 6.4 0 0 0 89 81.8V80Z" fill="url(#${id('au')})" stroke="#6e4705" stroke-width=".45"/><ellipse cx="48" cy="80" rx="41" ry="6.4" fill="url(#${id('au')})" stroke="#6e4705" stroke-width=".45"/>`
      + `<path d="M10 81.4A38 5.2 0 0 0 86 81.4" fill="none" stroke="#fffbe6" stroke-width=".5" opacity=".7"/>`
      + [0, 1, 2].map(i => tier(TI[i], i)).join('')
      /* étage du haut : ruban d'or et étoiles ; étage du milieu : guirlandes et gemmes ; étage du bas : plaque et rinceaux */
      + `<path d="M32 37.4A16 3 0 0 0 64 37.4V35.6A16 3 0 0 1 32 35.6Z" fill="url(#${id('au')})" stroke="#6e4705" stroke-width=".35"/>`
      + `<g fill="#f2c230" stroke="#8a6418" stroke-width=".25">${[[36.4, 33.2], [42.4, 34.4], [53.6, 34.4], [59.6, 33.2]].map(([x, y]) => `<path d="${evnStar5(x, y, 1.1)}"/>`).join('')}</g>`
      + `<path d="${sw}" fill="none" stroke="#6e4705" stroke-width="1.3" stroke-linecap="round"/><path d="${sw}" fill="none" stroke="url(#${id('au')})" stroke-width=".8" stroke-linecap="round"/>` + gems
      + scroll(1) + scroll(-1)
      + `<rect x="33" y="63.4" width="30" height="13.2" rx="3" fill="url(#${id('pq')})" stroke="#6e4705" stroke-width=".55"/><rect x="34.6" y="65" width="26.8" height="10" rx="2" fill="url(#${id('pc')})" stroke="#b9800f" stroke-width=".4"/>`
      + `<g fill="#f2c230" stroke="#6e4705" stroke-width=".3"><circle cx="33.4" cy="70" r="1"/><circle cx="62.6" cy="70" r="1"/></g><path d="M35.8 66.2Q40 65.4 45 65.8" fill="none" stroke="#fff" stroke-width=".6" stroke-linecap="round" opacity=".9"/>`
      + [0, 4, 1, 3, 2].map(candle).join('')
      + (lit ? evmSpk([[10, 22, 3], [86, 20, 2.6], [16, 44, 2], [82, 42, 2.4], [30, 10, 1.8], [68, 10, 2]]) : '') + `</svg>`;
  },
  /* Récompenses (viewBox 24 × 24, aplats, 20–28 px), classe « evo evo-rw » comme celles des autres fêtes */
  /** Lotus d'or : fleur d'or vue de trois quarts (pétales pointus en couches), réceptacle cuivré, tige, socle d'or, étincelle. */
  rwLotus: (o = {}) => {
    const P = (by, L) => L.map(([l, w, a, u]) => { const q = evmPetal3(12, by, l, w, a, u); return `<path d="${q.dark}" fill="#c48a1a"/><path d="${q.lit}" fill="#f2c230"/><path d="${q.rib}" fill="none" stroke="#fff3c4" stroke-width=".4"/><path d="${q.rim}${q.rimD}" fill="none" stroke="#6e4705" stroke-width=".6" stroke-linejoin="round"/>`; }).join('');
    return `<svg class="evo evo-rw evo-rw-lotus${o.cls ? ' ' + o.cls : ''}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">`
      + `<path d="M12 15.6V20" stroke="#6e4705" stroke-width="1.4"/><path d="M8 21.6Q8 20 12 20T16 21.6V22.2H8Z" fill="#f2c230" stroke="#6e4705" stroke-width=".6" stroke-linejoin="round"/>`
      + P(12, [[7, 1.5, -100, .4], [7, 1.5, -80, .4], [6.4, 1.6, -130, .8], [6.4, 1.6, -50, .8]])
      + `<path d="M9.8 7.4C9.9 9 10.8 10.2 12 10.3C13.2 10.2 14.1 9 14.2 7.4Z" fill="#b8642a" stroke="#4a1e06" stroke-width=".4"/><ellipse cx="12" cy="7.4" rx="2.2" ry=".85" fill="#e89a50" stroke="#4a1e06" stroke-width=".4"/><g fill="#4a1e06"><circle cx="11.2" cy="7.4" r=".3"/><circle cx="12.7" cy="7.3" r=".3"/><circle cx="12" cy="8.6" r=".3"/></g>`
      + P(12.6, [[7.6, 1.8, -150, 1.2], [7.6, 1.8, -30, 1.2], [5.6, 2, -112, .4], [5.6, 2, -68, .4]]) + P(13.4, [[8.8, 1.6, -176, 1.8], [8.8, 1.6, -4, 1.8], [4.2, 2.4, 90, 1.2]])
      + `<path d="${evnSpark(19.8, 4.4, 2.8)}" fill="#ffe17a" stroke="#8a5a05" stroke-width=".45" stroke-linejoin="round"/></svg>`;
  },
  /** Salle inaugurée : temple de marbre, porte d'or ouverte, ruban rouge, étoile au fronton. */
  rwHall: (o = {}) => `<svg class="evo evo-rw evo-rw-hall${o.cls ? ' ' + o.cls : ''}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">`
    + `<g fill="#f4eee2" stroke="#4a3e30" stroke-width=".7" stroke-linejoin="round"><path d="M2.4 8.4L12 2.6L21.6 8.4Z"/><rect x="2.6" y="8.4" width="18.8" height="2.2"/>`
    + `<rect x="4" y="10.6" width="2.2" height="7.4"/><rect x="8" y="10.6" width="2.2" height="7.4"/><rect x="13.8" y="10.6" width="2.2" height="7.4"/><rect x="17.8" y="10.6" width="2.2" height="7.4"/>`
    + `<rect x="2.4" y="18" width="19.2" height="1.8"/><rect x="1.2" y="19.8" width="21.6" height="1.8"/></g>`
    + `<rect x="10.6" y="12" width="2.8" height="6" fill="#f2c230" stroke="#6e4705" stroke-width=".5"/><path d="M12 12V18" stroke="#fff6cc" stroke-width=".5"/>`
    + `<path d="${evnStar5(12, 6.4, 1.6)}" fill="#f2c230" stroke="#6e4705" stroke-width=".4"/>`
    + `<path d="M7.6 14.2L10.6 15M16.4 14.2L13.4 15" stroke="#e23b3b" stroke-width="1.1" stroke-linecap="round"/><path d="M10.4 15.4L9.6 17.4M13.6 15.4L14.4 17.4" stroke="#a1162a" stroke-width=".8" stroke-linecap="round"/></svg>`,
});

/* ── Anniversaire de Magic : reliques des salles 2 à 5 (relicArt) ─────────────────────────────────────────────────────────────────────────────
   Même vitrine que la salle 1 (evmStage : socle, projecteur) ; chaque objet repose sur le socle (y ≈ 51). Évocations originales : aucun logo, symbole
   d'extension ni illustration (ni Final Fantasy, ni Le Seigneur des anneaux, ni Magic : seulement des objets du quotidien d'un musée). */
/** Coussin de velours (pouf vu de face) entre x0 et x1, haut en y0, posé en y 52 ; C : [clair, moyen, foncé] ; glands d'or aux deux bouts. */
function evmCushion(id, x0, x1, y0, C, gid) {
  const f = evoF, m = (x0 + x1) / 2, h = 52 - y0;
  const tassel = x => `<circle cx="${f(x)}" cy="${f(y0 + h * .5)}" r=".9" fill="url(#${id(gid)})" stroke="#6e4705" stroke-width=".3"/><path d="M${f(x - .8)} ${f(y0 + h * .5 + .7)}L${f(x - 1.4)} ${f(y0 + h * .5 + 3.8)}H${f(x + 1.4)}L${f(x + .8)} ${f(y0 + h * .5 + .7)}Z" fill="url(#${id(gid)})" stroke="#6e4705" stroke-width=".3"/>`;
  return `<radialGradient id="${id('cu')}" cx=".45" cy=".25" r=".85"><stop offset="0" stop-color="${C[0]}"/><stop offset=".5" stop-color="${C[1]}"/><stop offset="1" stop-color="${C[2]}"/></radialGradient>`
    + `<path d="M${f(x0 + .6)} ${f(y0 + h * .5)}C${f(x0)} ${f(y0 + 1.4)} ${f(x0 + 2)} ${y0} ${f(x0 + 4.4)} ${f(y0 + .2)}C${f(m - 8)} ${f(y0 - .9)} ${f(m + 8)} ${f(y0 - .9)} ${f(x1 - 4.4)} ${f(y0 + .2)}C${f(x1 - 2)} ${y0} ${x1} ${f(y0 + 1.4)} ${f(x1 - .6)} ${f(y0 + h * .5)}`
    + `C${x1} ${f(y0 + h - 1)} ${f(x1 - 1.6)} ${f(y0 + h + .2)} ${f(x1 - 4.4)} ${f(y0 + h)}C${f(m + 8)} ${f(y0 + h + .9)} ${f(m - 8)} ${f(y0 + h + .9)} ${f(x0 + 4.4)} ${f(y0 + h)}C${f(x0 + 1.6)} ${f(y0 + h + .2)} ${x0} ${f(y0 + h - 1)} ${f(x0 + .6)} ${f(y0 + h * .5)}Z" fill="url(#${id('cu')})" stroke="url(#${id(gid)})" stroke-width=".7"/>`
    + `<path d="M${f(x0 + 4)} ${f(y0 + 1.2)}Q${m} ${f(y0 - .2)} ${f(x1 - 4)} ${f(y0 + 1.2)}" fill="none" stroke="#fff" stroke-width=".55" stroke-linecap="round" opacity=".35"/>` + tassel(x0) + tassel(x1);
}
/** Feuille de parchemin aux bords déchirés (x0 → x1, y0 → y1) ; graine fixe. */
function evmParch(x0, x1, y0, y1, seed = 3) {
  let s = seed * 131, d = ''; const r = () => (s = (s * 9301 + 49297) % 233280) / 233280, f = evoF, P = [];
  for (let x = x0; x < x1; x += 3) P.push([x, y0 + r() * 1.2]); P.push([x1, y0 + .4]);
  for (let y = y0 + 3; y < y1; y += 4) P.push([x1 - r() * 1, y]); P.push([x1, y1]);
  for (let x = x1 - 3; x > x0; x -= 3) P.push([x, y1 - r() * 1.2]); P.push([x0, y1 - .4]);
  for (let y = y1 - 3; y > y0; y -= 4) P.push([x0 + r() * 1, y]);
  d = 'M' + P.map(p => f(p[0]) + ' ' + f(p[1])).join('L') + 'Z'; return d;
}
const evmParchDefs = id => `<linearGradient id="${id('pa')}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fdf5e0"/><stop offset=".6" stop-color="#f1dfb4"/><stop offset="1" stop-color="#d9bd84"/></linearGradient>`;
/** Polygone fermé. */
const evmPoly = P => 'M' + P.map(p => evoF(p[0]) + ' ' + evoF(p[1])).join('L') + 'Z';
/** Écu (blason) : haut en x, y, largeur w, hauteur h. */
const evmShieldD = (x, y, w, h) => { const f = evoF; return `M${f(x - w / 2)} ${f(y)}H${f(x + w / 2)}V${f(y + h * .45)}C${f(x + w / 2)} ${f(y + h * .78)} ${f(x + w * .2)} ${f(y + h * .92)} ${f(x)} ${f(y + h)}C${f(x - w * .2)} ${f(y + h * .92)} ${f(x - w / 2)} ${f(y + h * .78)} ${f(x - w / 2)} ${f(y + h * .45)}Z`; };
Object.assign(EVM_RELIC, {
  /* 1994 · le sceau de Legends : parchemin sur son chevalet, grand sceau de cire aux cinq couleurs (coulures), couronne d'or frappée au centre, deux rubans de soie */
  seal: id => {
    const f = evoF, N = 22, P = Array.from({ length: N }, (_, i) => { const a = i / N * 2 * Math.PI, r = 8.6 + (i % 2 ? .7 : -.2) + (i % 5 === 0 ? .8 : 0); return [32 + Math.cos(a) * r, 34 + Math.sin(a) * r]; });
    const blob = evqCurve(P, true), W = EVY_MANA.map((m, i) => { const a0 = (-90 + i * 72 - 36) * Math.PI / 180, a1 = a0 + 72 * Math.PI / 180;
      return `<path d="M32 34L${f(32 + Math.cos(a0) * 12)} ${f(34 + Math.sin(a0) * 12)}A12 12 0 0 1 ${f(32 + Math.cos(a1) * 12)} ${f(34 + Math.sin(a1) * 12)}Z" fill="${m[2]}"/>`; }).join('');
    return [evmParchDefs(id) + evmMetal(id('au'), 12, 0, 50, 0)
      + `<radialGradient id="${id('sx')}" cx=".36" cy=".3" r=".8"><stop offset="0" stop-color="#fff" stop-opacity=".55"/><stop offset=".45" stop-color="#fff" stop-opacity="0"/><stop offset=".8" stop-color="#000" stop-opacity=".1"/><stop offset="1" stop-color="#000" stop-opacity=".4"/></radialGradient>`
      + `<clipPath id="${id('sc')}"><path d="${blob}"/></clipPath>`,
      evmEasel() + `<path d="${evmParch(17, 47, 10.6, 46, 5)}" fill="url(#${id('pa')})" stroke="#a8834a" stroke-width=".45"/>`
      + `<g fill="none" stroke="#6b4a22" stroke-width=".38" stroke-linecap="round" opacity=".85">${[15, 18, 21, 24].map((y, i) => `<path d="${evmScrawl(20.4, i === 3 ? 36 : 43.6, y, i + 2)}"/>`).join('')}</g>`
      + `<path d="M21 13.2Q32 11.6 43 13.2" fill="none" stroke="#a8261b" stroke-width=".5" opacity=".7"/>`
      + evmLedge(id)
      + `<path d="${evmBand([[30.4, 40], [29, 44], [27.4, 48], [26.2, 51.4]], 3, 1.3)}" fill="#e2553e" stroke="#6a1a0e" stroke-width=".35"/><path d="${evmBand([[33.6, 40], [35.2, 44], [36.8, 48], [38, 51.4]], 3, 1.3)}" fill="#3a78cf" stroke="#173d77" stroke-width=".35"/>`
      + `<path d="M28.6 43.4L27.2 49M35.6 43.4L37 49" stroke="#fff" stroke-width=".4" opacity=".45"/>`
      + `<path d="${blob}" fill="#3a1208" transform="translate(.5 .8)" opacity=".35"/><g clip-path="url(#${id('sc')})">${W}<circle cx="32" cy="34" r="12" fill="url(#${id('sx')})"/></g>`
      + `<path d="${blob}" fill="none" stroke="#3a1208" stroke-width=".5"/><circle cx="32" cy="34" r="5.9" fill="url(#${id('au')})" stroke="#6e4705" stroke-width=".5"/><circle cx="32" cy="34" r="4.9" fill="none" stroke="#fff3c4" stroke-width=".35" opacity=".8"/>`
      + `<path d="M28.8 36.2L28.2 31.6L30.2 33.4L32 30.6L33.8 33.4L35.8 31.6L35.2 36.2Z" fill="#c48a1a" stroke="#6e4705" stroke-width=".4" stroke-linejoin="round"/><path d="M28.8 36.2H35.2" stroke="#fff3c4" stroke-width=".4"/>`
      + `<path d="M25.6 29.6Q27.6 27 31 26.4" fill="none" stroke="#fff" stroke-width=".8" stroke-linecap="round" opacity=".6"/>`];
  },
  /* 1995 · le cristal d'Ice Age : faisceau d'aiguilles de glace hexagonales sur un tertre de neige, flocon pris dans la glace, givre */
  snow: id => {
    const shard = (x, y, w, h, r, k = 1) => { const L = [x - w, y], LT = [x - w, y - h * .72], T = [x, y - h], RT = [x + w, y - h * .72], R = [x + w, y], M1 = [x - w * .15, y - h * .7], M2 = [x - w * .15, y];
      return `<g transform="rotate(${r} ${x} ${y})" stroke="#2a6fb4" stroke-width=".45" stroke-linejoin="round"><path d="${evmPoly([LT, T, M1, M2, L])}" fill="url(#${id('ia')})"/><path d="${evmPoly([T, RT, R, M2, M1])}" fill="url(#${id('ib')})"/>`
        + `<path d="M${evoF(x - w * .6)} ${evoF(y - h * .1)}L${evoF(x - w * .6)} ${evoF(y - h * .66)}" stroke="#fff" stroke-width="${k * .7}" opacity=".75"/></g>`; };
    return [`<linearGradient id="${id('ia')}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset=".5" stop-color="#cfeaff"/><stop offset="1" stop-color="#8cc4f0"/></linearGradient>`
      + `<linearGradient id="${id('ib')}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#a9d6fa"/><stop offset=".6" stop-color="#5e9fe0"/><stop offset="1" stop-color="#2f6fc0"/></linearGradient>`
      + `<linearGradient id="${id('sn')}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#d6e8f8"/></linearGradient>`,
      shard(23, 47, 3.4, 22, -24, .8) + shard(42, 47, 3.6, 25, 20, .8) + shard(28.4, 46, 2.6, 15, -8, .6) + shard(32, 47.4, 5.4, 39, 0, 1.2) + shard(37.6, 47, 2.6, 16, 12, .6)
      + `<path d="${evnFlakeD(4.2, 31.2, 27)}" fill="none" stroke="#fff" stroke-width=".55" stroke-linecap="round" opacity=".9"/>`
      + `<path d="M14 51.6C15.4 47.4 20.6 45.6 25.6 46.6C28.8 44.6 35.4 44.4 39.4 46.2C44.6 45.2 49.4 47.6 50.2 51.6Z" fill="url(#${id('sn')})" stroke="#8fb6dc" stroke-width=".45"/>`
      + `<path d="M17 49Q22 46.6 26 47.6M38 47Q43 46.4 47 48.6" fill="none" stroke="#fff" stroke-width=".8" stroke-linecap="round"/>`
      + `<g fill="#fff">${[[30.6, 10.8, 1.4], [44.8, 25, 1], [19.6, 28.6, .9]].map(([x, y, r]) => `<path d="${evnSpark(x, y, r)}"/>`).join('')}</g>`];
  },
  /* 1996 · le trophée du premier Pro Tour : coupe d'or à deux anses, laurier gravé et étoile, pied tourné, socle de noyer à plaque */
  trophy: id => [`<radialGradient id="${id('tc')}" cx="26" cy="16" r="22" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#fffbe6"/><stop offset=".25" stop-color="#ffe58a"/><stop offset=".55" stop-color="#f2c230"/><stop offset=".85" stop-color="#b9800f"/><stop offset="1" stop-color="#7a4f06"/></radialGradient>`
    + evmMetal(id('au'), 18, 0, 46, 0) + `<linearGradient id="${id('wd')}" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#3a1f0c"/><stop offset=".35" stop-color="#9a5e30"/><stop offset="1" stop-color="#2e1808"/></linearGradient>`,
    `<path d="M22 44.4H42V51.4H22Z" fill="url(#${id('wd')})" stroke="#1e0e04" stroke-width=".5"/><path d="M21 43.4H43V45H21Z" fill="url(#${id('au')})" stroke="#6e4705" stroke-width=".4"/>`
    + `<rect x="27.4" y="46.4" width="9.2" height="3.4" rx=".5" fill="url(#${id('au')})" stroke="#6e4705" stroke-width=".35"/><path d="M28.8 47.6H35.2M29.8 48.6H34.2" stroke="#7a4f06" stroke-width=".35"/>`
    + `<path d="M25.6 43.4C26 41.4 28.4 40.6 29.6 40.4H34.4C35.6 40.6 38 41.4 38.4 43.4Z" fill="url(#${id('au')})" stroke="#6e4705" stroke-width=".45"/>`
    + `<path d="M30.4 40.4C30.8 37.6 30.6 35.6 30.4 34H33.6C33.4 35.6 33.2 37.6 33.6 40.4Z" fill="url(#${id('au')})" stroke="#6e4705" stroke-width=".4"/><ellipse cx="32" cy="35.8" rx="2.6" ry="1.4" fill="url(#${id('au')})" stroke="#6e4705" stroke-width=".4"/>`
    + `<path d="M20.8 16.4C14 15 12.6 24.8 21.6 27M43.2 16.4C50 15 51.4 24.8 42.4 27" fill="none" stroke="#6e4705" stroke-width="3"/><path d="M20.8 16.4C14 15 12.6 24.8 21.6 27M43.2 16.4C50 15 51.4 24.8 42.4 27" fill="none" stroke="url(#${id('au')})" stroke-width="2"/>`
    + `<path d="M19.6 12.4H44.4C44.4 25.4 39.6 32.6 32 33.6C24.4 32.6 19.6 25.4 19.6 12.4Z" fill="url(#${id('tc')})" stroke="#6e4705" stroke-width=".55" stroke-linejoin="round"/>`
    + `<ellipse cx="32" cy="12.4" rx="12.4" ry="2.4" fill="#9a6410" stroke="#6e4705" stroke-width=".5"/><ellipse cx="32" cy="12.9" rx="10.8" ry="1.6" fill="#5a3a06"/>`
    + `<path d="M20.4 15.4Q32 17.8 43.6 15.4" fill="none" stroke="#8a5a0c" stroke-width=".5"/><path d="M20.6 16Q32 18.4 43.4 16" fill="none" stroke="#fff3c4" stroke-width=".35" opacity=".7"/>`
    + `<g transform="translate(32 23.6)" fill="#b9800f" stroke="#6e4705" stroke-width=".3"><path d="${evnStar5(0, -.6, 2.6)}" fill="#fff3c4"/>${[1, -1].map(s => [[-3.2, 2.4, -30], [-4.8, .8, -60], [-5.4, -1.4, -90]].map(([x, y, r]) => `<ellipse cx="${x * s}" cy="${y}" rx="1.2" ry=".5" transform="rotate(${r * s} ${x * s} ${y})"/>`).join('')).join('')}</g>`
    + `<path d="M23.2 17C23.6 23 25.6 27.6 28.8 30.4" fill="none" stroke="#fff" stroke-width="1.2" stroke-linecap="round" opacity=".6"/><path d="M41.8 18.4C41.4 24 39.8 28 37 30.6" fill="none" stroke="#ffe58a" stroke-width=".6" opacity=".6"/>`],
  /* 1997 · la maquette de l'Aquilon : vaisseau volant à voiles (coque de bois, hublots, ailes de toile tendue), fanion, sur sa tige de laiton */
  ship: id => [`<linearGradient id="${id('hl')}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#c98a52"/><stop offset=".5" stop-color="#8a4f24"/><stop offset="1" stop-color="#4a2810"/></linearGradient>`
    + `<linearGradient id="${id('sl')}" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fffaf0"/><stop offset=".7" stop-color="#f1e4c4"/><stop offset="1" stop-color="#d6c294"/></linearGradient>`
    + `<linearGradient id="${id('wg')}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#bfe2ff" stop-opacity=".9"/><stop offset="1" stop-color="#4ea2f2" stop-opacity=".6"/></linearGradient>` + evmMetal(id('au'), 20, 0, 44, 0),
    `<ellipse cx="32" cy="50.4" rx="7" ry="1.5" fill="url(#${id('au')})" stroke="#6e4705" stroke-width=".4"/><path d="M31.3 50V38.6H32.7V50Z" fill="url(#${id('au')})" stroke="#6e4705" stroke-width=".35"/><path d="M28.6 37.4Q32 40 35.4 37.4" fill="none" stroke="#b9800f" stroke-width=".9"/>`
    + `<path d="M26 35.6L15 44.4L18.6 44.8L13.6 47.8Q22 46.6 29.4 37Z" fill="url(#${id('wg')})" stroke="#1f5fc2" stroke-width=".4" stroke-linejoin="round"/><path d="M27 36.4L17 45.4M28.2 36.8L20 46.2" stroke="#1f5fc2" stroke-width=".3"/>`
    + `<path d="M38 35.6L49 44.4L45.4 44.8L50.4 47.8Q42 46.6 34.6 37Z" fill="url(#${id('wg')})" stroke="#1f5fc2" stroke-width=".4" stroke-linejoin="round" opacity=".85"/>`
    + `<path d="M22.4 31V13.6M32.6 31V7" stroke="#4a2810" stroke-width="1.1" stroke-linecap="round"/><path d="M32.6 9.8L50.2 28.6M22.4 15L11.8 29.4M32.6 7.4L22.4 13.8" stroke="#6b4a22" stroke-width=".3"/>`
    + `<path d="M24.6 10.8Q32.8 13 40.4 10.8L41.6 25.6Q33 28 24 25.6Z" fill="url(#${id('sl')})" stroke="#8a6a3e" stroke-width=".45" stroke-linejoin="round"/><path d="M25 15.6Q33 17.6 41 15.6M24.6 20.6Q33 22.6 41.2 20.6" fill="none" stroke="#c9b08a" stroke-width=".35"/>`
    + `<path d="M33.4 9.6L49.4 28L34.2 27.6Z" fill="url(#${id('sl')})" stroke="#8a6a3e" stroke-width=".45" stroke-linejoin="round"/><path d="M21.6 14.8L22.2 29.4L13.6 29Z" fill="url(#${id('sl')})" stroke="#8a6a3e" stroke-width=".45" stroke-linejoin="round"/>`
    + `<path d="M32.6 7L37.6 8.2L32.6 9.6Z" fill="#e2553e" stroke="#6a1a0e" stroke-width=".3"/>`
    + `<path d="M11.4 29.6C15.6 35.6 23.4 37.6 33 37.4C41.4 37.2 47.6 34.6 52.6 28.6L50.2 28.4C46 30.6 40 31.4 34 31.4H19.6C16.4 31.4 13.6 30.6 11.4 29.6Z" fill="url(#${id('hl')})" stroke="#2a1405" stroke-width=".55" stroke-linejoin="round"/>`
    + `<path d="M13.6 31.6Q30 34.6 51 29.6" fill="none" stroke="url(#${id('au')})" stroke-width=".8"/><path d="M15.6 33.8Q30 36.4 47.6 32.8" fill="none" stroke="#2a1405" stroke-width=".35" opacity=".6"/>`
    + `<g fill="#ffe58a" stroke="#6e4705" stroke-width=".3">${[22, 28, 34, 40].map(x => `<circle cx="${x}" cy="${x < 30 ? 33.2 : 33}" r=".75"/>`).join('')}</g>`
    + `<path d="M26.4 31.4V28.6H31V31.4" fill="#a8693a" stroke="#2a1405" stroke-width=".4"/><path d="M19.2 31.6Q16 30.8 13 29.8" fill="none" stroke="#fff" stroke-width=".5" opacity=".4"/>`],
  /* 1998 · le poulet d'Unglued : poulet en caoutchouc, couché sur un plateau d'argent (bordure argentée), long cou dressé, bec grand ouvert */
  chicken: id => [`<radialGradient id="${id('ck')}" cx=".38" cy=".3" r=".8"><stop offset="0" stop-color="#fff8c8"/><stop offset=".5" stop-color="#ffe066"/><stop offset="1" stop-color="#e2a414"/></radialGradient>` + evmMetal(id('ag'), 12, 0, 52, 0, EVM_FE),
    `<ellipse cx="32" cy="49.6" rx="19" ry="2.6" fill="url(#${id('ag')})" stroke="#2e3646" stroke-width=".5"/><ellipse cx="32" cy="49.3" rx="16.4" ry="1.7" fill="#d8dfe8" stroke="#8a96a8" stroke-width=".3"/>`
    + `<path d="M17.4 41.6L10 37.2M16.6 39.8L8.2 41" stroke="#e08a1a" stroke-width="1.2" stroke-linecap="round"/><path d="M10 37.2L7.8 36.6M10 37.2L8.8 35.2M10 37.2L9.2 38.8M8.2 41L6.2 40M8.2 41L6.4 41.8M8.2 41L7.4 42.8" stroke="#e08a1a" stroke-width=".8" stroke-linecap="round"/>`
    + `<path d="M36 38.6C39.6 33.6 41.2 27.4 43.6 20.6" fill="none" stroke="#b9800f" stroke-width="5.4" stroke-linecap="round"/><path d="M36 38.6C39.6 33.6 41.2 27.4 43.6 20.6" fill="none" stroke="#ffe066" stroke-width="4.3" stroke-linecap="round"/>`
    + `<path d="M38.6 33.4Q40.6 28 41.8 23.4" fill="none" stroke="#fff8c8" stroke-width="1" stroke-linecap="round" opacity=".8"/>`
    + `<path d="M14.6 41C14 36.2 18.4 32.6 25 32.6C31 32.6 37 34.6 39.6 38.2C41.8 41.4 40.4 45.6 35 47C28 48.6 17 47.2 14.6 41Z" fill="url(#${id('ck')})" stroke="#9a6a0a" stroke-width=".55"/>`
    + `<path d="M24 37C27 35.4 31.6 36 33.6 38.6C31.6 41.4 27 41.6 24 37Z" fill="#f2c230" stroke="#9a6a0a" stroke-width=".4"/>`
    + `<g fill="#d99a14" opacity=".5">${[[19, 38], [22, 43], [28, 44.4], [33, 42.6], [18, 42.6], [26, 34.6]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r=".45"/>`).join('')}</g><path d="M18 36.4Q21 34 25.4 33.8" fill="none" stroke="#fff" stroke-width=".9" stroke-linecap="round" opacity=".7"/>`
    + `<path d="M42.4 15.6C42.6 13.4 44.4 13 45 14.4C45.8 12.6 47.8 13.2 47.4 15C48.8 14.6 49.6 16 48.6 17Z" fill="#e2553e" stroke="#7a1f12" stroke-width=".4"/>`
    + `<circle cx="45.2" cy="18.6" r="3.6" fill="url(#${id('ck')})" stroke="#9a6a0a" stroke-width=".5"/>`
    + `<path d="M48 17.2L54 16L48.6 19Z" fill="#ff9a2e" stroke="#a8500a" stroke-width=".4" stroke-linejoin="round"/><path d="M48.2 19.6L53.2 21.8L47.8 20.8Z" fill="#ff9a2e" stroke="#a8500a" stroke-width=".4" stroke-linejoin="round"/><path d="M48.4 19.2L52 19.8" stroke="#7a1f12" stroke-width=".5"/>`
    + `<path d="M47.4 21.4C47.8 23.2 46.6 24.2 46 23C45.6 22.2 46.4 21.4 47.4 21.4Z" fill="#e2553e" stroke="#7a1f12" stroke-width=".35"/>`
    + `<circle cx="45.6" cy="17.6" r="1.25" fill="#fff" stroke="#3a2a10" stroke-width=".3"/><circle cx="45.9" cy="17.7" r=".5" fill="#1a120c"/><path d="M44 16Q45.2 15.2 46.6 15.8" fill="none" stroke="#3a2a10" stroke-width=".35"/>`],
  /* 1999 · la première carte brillante : carte ancienne sur son chevalet, reflets arc-en-ciel en diagonale (foil), éclats ; reflet qui passe */
  foil: id => [evmOldCardDefs(id) + evmMetal(id('au'), 12, 0, 46, 0)
    + `<linearGradient id="${id('rw')}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ff5f8a"/><stop offset=".18" stop-color="#ffb347"/><stop offset=".34" stop-color="#fff36b"/><stop offset=".5" stop-color="#5ff0a0"/><stop offset=".66" stop-color="#5fd0ff"/><stop offset=".82" stop-color="#8a7aff"/><stop offset="1" stop-color="#ff6fd0"/></linearGradient>`
    + `<linearGradient id="${id('k')}" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".5" stop-color="#fff" stop-opacity=".8"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>`
    + `<clipPath id="${id('fc')}"><rect x="17" y="11" width="27" height="37.6" rx="3.4"/></clipPath>`,
    evmEasel() + `<g transform="translate(2 0)">${evmOldCard(id)}</g>`
    + `<g clip-path="url(#${id('fc')})"><rect x="17" y="11" width="27" height="37.6" fill="url(#${id('rw')})" opacity=".42"/>`
    + `<path d="M8 40L40 4H46L14 40ZM16 56L52 18V24L22 56Z" fill="#fff" opacity=".28"/><path class="evo-glint" d="M0 52H5L23 4H18Z" fill="url(#${id('k')})" opacity="0"/></g>`
    + `<rect x="17" y="11" width="27" height="37.6" rx="3.4" fill="none" stroke="url(#${id('rw')})" stroke-width=".6" opacity=".9"/>`
    + `<g fill="#fff" stroke="#8a7aff" stroke-width=".25">${[[45.6, 13.6, 2.2], [15.6, 30, 1.6], [42, 40.6, 1.4], [24, 9, 1.2]].map(([x, y, r]) => `<path d="${evnSpark(x, y, r)}"/>`).join('')}</g>` + evmLedge(id)],
  /* 2002 · l'écran de Magic Online : moniteur cathodique beige (verre bombé, lignes de balayage), une partie à l'écran (cartes, « 20 », pointeur), souris */
  crt: id => [`<linearGradient id="${id('bz')}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f6efdc"/><stop offset=".6" stop-color="#e2d6b6"/><stop offset="1" stop-color="#bfb18c"/></linearGradient>`
    + `<radialGradient id="${id('sc')}" cx=".45" cy=".4" r=".75"><stop offset="0" stop-color="#1e5a6a"/><stop offset=".7" stop-color="#0e2a3a"/><stop offset="1" stop-color="#06121a"/></radialGradient>`
    + `<linearGradient id="${id('k')}" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".5" stop-color="#fff" stop-opacity=".4"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>`
    + `<clipPath id="${id('cc')}"><rect x="18.8" y="14.6" width="26.4" height="20.2" rx="2.6"/></clipPath>`,
    `<path d="M24 46.6H40L42 50.6H22Z" fill="url(#${id('bz')})" stroke="#6e6248" stroke-width=".45" stroke-linejoin="round"/><path d="M27 41.6H37L38.4 46.8H25.6Z" fill="#cfc2a0" stroke="#6e6248" stroke-width=".45"/>`
    + `<path d="M45.6 12.4L50.6 15.6V38L45.6 41Z" fill="#c9bb98" stroke="#6e6248" stroke-width=".45" stroke-linejoin="round"/>`
    + `<rect x="13.4" y="9.6" width="34" height="32.4" rx="3.2" fill="url(#${id('bz')})" stroke="#6e6248" stroke-width=".55"/><rect x="17" y="13" width="28.8" height="23.4" rx="3" fill="#3a3a40" stroke="#22222a" stroke-width=".4"/>`
    + `<rect x="18.8" y="14.6" width="26.4" height="20.2" rx="2.6" fill="url(#${id('sc')})"/>`
    + `<g clip-path="url(#${id('cc')})"><g class="evo-screen"><g stroke-width=".3">${[0, 1, 2].map(i => `<rect x="${24.6 + i * 5.4}" y="16.6" width="4" height="5.4" rx=".4" fill="#2a4a6a" stroke="#7cc4ff"/>`).join('')}`
    + [[2, '#ff6a45'], [4, '#3fcf7a'], [1, '#4ea2f2']].map(([v, c], i) => `<rect x="${24.6 + i * 5.4}" y="25.8" width="4" height="5.4" rx=".4" fill="${c}" fill-opacity=".85" stroke="#fffef4"/>`).join('') + `</g>`
    + evmDigits('20', 21.6, 29, 3, 'stroke="#6ff0a0"', .5) + evmDigits('20', 21.6, 19, 3, 'stroke="#ff8a66"', .5)
    + `<path d="M41.6 31.6L41.6 27L44.6 30.2L43 30.2L44 32.4L43.2 32.8L42.2 30.6Z" fill="#fff" stroke="#000" stroke-width=".25"/></g>`
    + `<path d="${Array.from({ length: 20 }, (_, i) => `M18.8 ${15 + i * 1.02}H45.2`).join('')}" stroke="#000" stroke-width=".25" opacity=".25"/>`
    + `<path d="M20.6 16.6Q25 15.2 31 15.4" fill="none" stroke="#fff" stroke-width=".9" stroke-linecap="round" opacity=".45"/><path class="evo-glint" d="M10 40H14L24 10H20Z" fill="url(#${id('k')})" opacity="0"/></g>`
    + `<rect x="21" y="38.2" width="9" height="1.4" rx=".5" fill="#a89a78"/><circle cx="41.4" cy="38.9" r=".8" fill="#5ff07a" stroke="#2a6a3a" stroke-width=".3"/><path d="M34 38.4V39.6M35.4 38.4V39.6M36.8 38.4V39.6" stroke="#a89a78" stroke-width=".4"/>`
    + `<path d="M15.2 12Q15 26 15.4 40" fill="none" stroke="#fff" stroke-width=".8" stroke-linecap="round" opacity=".5"/>`
    + `<path d="M45 50.6C47 47 49 46.6 50.2 48.4" fill="none" stroke="#6e6248" stroke-width=".5"/><ellipse cx="51.6" cy="49.6" rx="2.4" ry="1.6" fill="url(#${id('bz')})" stroke="#6e6248" stroke-width=".45"/><path d="M51.6 48V49.4" stroke="#6e6248" stroke-width=".35"/>`],
  /* 2003 · le cadre moderne : cadre de carte moderne vide (titre arrondi, fenêtre d'illustration vide aux repères de coupe, zone de texte vide,
     case de force et d'endurance), présenté dans un cadre doré de musée */
  frame: id => {
    let moul = ''; for (let i = 0; i < 6; i++) moul += `<circle cx="${evoF(15.4 + i * 6.64)}" cy="9.6" r=".55"/><circle cx="${evoF(15.4 + i * 6.64)}" cy="49.6" r=".55"/>`;
    return [evmMetal(id('au'), 11, 6, 53, 52) + `<linearGradient id="${id('fm')}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#dfe7f2"/><stop offset=".5" stop-color="#a9b8cc"/><stop offset="1" stop-color="#6d7f98"/></linearGradient>`
      + `<pattern id="${id('ck')}" width="2.4" height="2.4" patternUnits="userSpaceOnUse"><rect width="2.4" height="2.4" fill="#f4f4f8"/><path d="M0 0H1.2V1.2H0ZM1.2 1.2H2.4V2.4H1.2Z" fill="#dcdce6"/></pattern>`,
      evmEasel() + `<rect x="11.6" y="7.4" width="40.8" height="44.4" rx="1.4" fill="url(#${id('au')})" stroke="#6e4705" stroke-width=".55"/><rect x="13.6" y="9.4" width="36.8" height="40.4" fill="none" stroke="#fff3c4" stroke-width=".4" opacity=".7"/>`
      + `<g fill="#fff3c4" opacity=".8">${moul}</g><rect x="15.2" y="11" width="33.6" height="37.2" fill="#3a2a10" opacity=".35"/>`
      + `<rect x="19.4" y="11.6" width="25.2" height="35.4" rx="1.6" fill="#141218" stroke="#000" stroke-width=".35"/><rect x="20.7" y="12.9" width="22.6" height="32.8" rx=".8" fill="url(#${id('fm')})"/>`
      + `<rect x="21.6" y="13.8" width="20.8" height="2.6" rx="1.3" fill="#f4f6fa" stroke="#55657f" stroke-width=".3"/>`
      + `<rect x="22.2" y="17.2" width="19.6" height="13" fill="url(#${id('ck')})" stroke="#55657f" stroke-width=".35"/><path d="M23.4 18.4H25M23.4 18.4V20M40.6 18.4H39M40.6 18.4V20M23.4 29H25M23.4 29V27.4M40.6 29H39M40.6 29V27.4" stroke="#8a96a8" stroke-width=".4"/>`
      + `<rect x="21.6" y="31" width="20.8" height="2.4" rx="1.2" fill="#f4f6fa" stroke="#55657f" stroke-width=".3"/><rect x="22.2" y="34" width="19.6" height="10" fill="#fbfaf6" stroke="#55657f" stroke-width=".3"/>`
      + `<path d="M23.4 36H40.4M23.4 38H40.4M23.4 40H36" stroke="#d6d6e0" stroke-width=".35" stroke-dasharray="1 .7"/><rect x="36.6" y="43.4" width="6" height="2.6" rx=".6" fill="#f4f6fa" stroke="#55657f" stroke-width=".3"/>`
      + `<path d="M20.6 14.6V44" stroke="#fff" stroke-width=".5" opacity=".35"/>` + evmLedge(id)];
  },
  /* 2005 · les blasons des guildes : dix petits écus, un par paire de couleurs (coupés en diagonale), sur une plaque de noyer à velours vert */
  guild: id => {
    const pairs = [[0, 1], [1, 2], [2, 3], [3, 4], [4, 0], [0, 2], [1, 3], [2, 4], [3, 0], [4, 1]], f = evoF;
    const esc = ([a, b], i) => { const x = 18.4 + (i % 5) * 6.8, y = i < 5 ? 15.6 : 29.8, d = evmShieldD(x, y, 5.6, 7), cid = id('e' + i);
      return `<clipPath id="${cid}"><path d="${d}"/></clipPath><path d="${d}" fill="${EVY_MANA[a][2]}"/><path d="M${f(x - 3)} ${f(y - .4)}L${f(x + 3.2)} ${f(y + 7.4)}H${f(x - 3.2)}Z" fill="${EVY_MANA[b][2]}" clip-path="url(#${cid})"/>`
        + `<path d="${d}" fill="none" stroke="url(#${id('au')})" stroke-width=".7"/><path d="M${f(x - 2)} ${f(y + 1)}V${f(y + 3.4)}" stroke="#fff" stroke-width=".5" opacity=".6"/>`; };
    return [evmMetal(id('au'), 12, 0, 52, 0) + `<linearGradient id="${id('wd')}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#a8693a"/><stop offset=".5" stop-color="#6e3e1c"/><stop offset="1" stop-color="#3a1f0c"/></linearGradient>`
      + `<radialGradient id="${id('vv')}" cx=".4" cy=".3" r=".9"><stop offset="0" stop-color="#2f7a52"/><stop offset="1" stop-color="#0e3a24"/></radialGradient>`,
      `<path d="M14.4 50.6L16 47M49.6 50.6L48 47" stroke="#3a1f0c" stroke-width="1.4" stroke-linecap="round"/>`
      + `<path d="M12.6 47.6V13.6C12.6 9.6 20 6.8 32 6.8S51.4 9.6 51.4 13.6V47.6Z" fill="url(#${id('wd')})" stroke="#2a1405" stroke-width=".55"/>`
      + `<path d="M14.6 45.6V14.4C14.6 11.2 21.6 9 32 9S49.4 11.2 49.4 14.4V45.6Z" fill="url(#${id('vv')})" stroke="url(#${id('au')})" stroke-width=".6"/>`
      + `<rect x="26" y="40.4" width="12" height="3.2" rx=".5" fill="url(#${id('au')})" stroke="#6e4705" stroke-width=".35"/><path d="M27.6 42H36.4" stroke="#7a4f06" stroke-width=".4"/>`
      + pairs.map(esc).join('') + `<path d="M15.6 15Q22 10.6 32 10.4" fill="none" stroke="#fff" stroke-width=".5" opacity=".25"/>`];
  },
  /* 2007 · l'étincelle des planeswalkers : fiole de verre bouchée de liège (cachet de cire), une étincelle d'énergie qui tourbillonne dedans (.evo-spark-in) */
  spark: id => [`<linearGradient id="${id('vg')}" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#cfe6ff" stop-opacity=".6"/><stop offset=".3" stop-color="#eaf5ff" stop-opacity=".14"/><stop offset=".8" stop-color="#d6e9ff" stop-opacity=".22"/><stop offset="1" stop-color="#9fc4ee" stop-opacity=".65"/></linearGradient>`
    + `<radialGradient id="${id('en')}" cx="32" cy="35" r="11" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#ffffff"/><stop offset=".25" stop-color="#fff3b0"/><stop offset=".55" stop-color="#b98aff" stop-opacity=".75"/><stop offset="1" stop-color="#4ea2f2" stop-opacity=".2"/></radialGradient>`
    + `<linearGradient id="${id('ko')}" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#7a4a22"/><stop offset=".4" stop-color="#d9a46a"/><stop offset="1" stop-color="#6e3e1c"/></linearGradient>` + evmMetal(id('au'), 22, 0, 42, 0),
    `<path d="M23.4 51.6L24.4 47.4H39.6L40.6 51.6Z" fill="url(#${id('au')})" stroke="#6e4705" stroke-width=".45"/><ellipse cx="32" cy="47.4" rx="7.6" ry="1.3" fill="#ffe58a" stroke="#6e4705" stroke-width=".35"/>`
    + `<circle cx="32" cy="35.2" r="11" fill="url(#${id('en')})"/>`
    + `<g class="evo-spark-in"><path d="M24 35.6C26 30 34 28.4 39.6 32.6M40 34.6C38 40.4 30 42 24.4 37.8M27 28.6C31 27 36.6 28.6 37.8 31.6" fill="none" stroke="#e0c8ff" stroke-width=".7" stroke-linecap="round" opacity=".85"/>`
    + `<path d="${evnSpark(32, 35.2, 6.4)}" fill="#fffbe6" stroke="#b98aff" stroke-width=".35"/><path d="${evnSpark(32, 35.2, 3.6)}" fill="#ffffff" transform="rotate(45 32 35.2)"/></g>`
    + `<path d="M28.6 26.4V15.4H35.4V26.4C40.6 27.8 43.6 31.4 43.6 35.6C43.6 42 38.4 46.8 32 46.8S20.4 42 20.4 35.6C20.4 31.4 23.4 27.8 28.6 26.4Z" fill="url(#${id('vg')})" stroke="#7fa6cc" stroke-width=".7" stroke-linejoin="round"/>`
    + `<path d="M23.8 38.6C23 34.6 24.6 31 27.6 29.4M30 17V25" fill="none" stroke="#fff" stroke-width="1.2" stroke-linecap="round" opacity=".6"/><path d="M41 33.6C41.6 37 40.6 40.6 38 43" fill="none" stroke="#fff" stroke-width=".7" stroke-linecap="round" opacity=".4"/>`
    + `<rect x="27.8" y="14.4" width="8.4" height="1.6" rx=".6" fill="#dceeff" stroke="#7fa6cc" stroke-width=".45"/>`
    + `<path d="M29 14.6L28.6 8.6C28.6 7.6 30 7 32 7S35.4 7.6 35.4 8.6L35 14.6Z" fill="url(#${id('ko')})" stroke="#4a2810" stroke-width=".45"/><g fill="#5a3418" opacity=".55"><circle cx="30.4" cy="10" r=".4"/><circle cx="33.4" cy="11.6" r=".35"/><circle cx="31.6" cy="12.8" r=".3"/></g>`
    + `<path d="M28.4 9.6Q32 12 35.6 9.6L35.4 8.2Q32 10 28.6 8.2Z" fill="#8a1f2c" stroke="#4a0a12" stroke-width=".35"/><circle cx="32" cy="10.6" r="1.4" fill="#b3202c" stroke="#4a0a12" stroke-width=".35"/>`],
  /* 2008 · la gemme mythique : grosse gemme orangée taillée en brillant, dans un écrin de velours ouvert */
  mythic: id => {
    const f = evoF, C = [32, 30.4], G = Array.from({ length: 8 }, (_, i) => { const a = (22.5 + i * 45) * Math.PI / 180; return [C[0] + Math.cos(a) * 12.6, C[1] + Math.sin(a) * 12.6]; });
    const Tb = Array.from({ length: 8 }, (_, i) => { const a = (22.5 + i * 45) * Math.PI / 180; return [C[0] + Math.cos(a) * 6.2, C[1] + Math.sin(a) * 6.2]; });
    const shade = ['#ffb36a', '#ff8a3a', '#e05a1a', '#c8401a', '#e86a2a', '#ffc27a', '#ffe0a8', '#ffcf8a'];
    let fa = ''; for (let i = 0; i < 8; i++) { const j = (i + 1) % 8, m = [(G[i][0] + G[j][0]) / 2 * 1.0, (G[i][1] + G[j][1]) / 2]; fa += `<path d="${evmPoly([Tb[i], G[i], m])}" fill="${shade[i]}"/><path d="${evmPoly([Tb[i], m, G[j], Tb[j]])}" fill="${shade[(i + 1) % 8]}" opacity=".92"/>`; }
    return [`<radialGradient id="${id('tb')}" cx=".38" cy=".32" r=".8"><stop offset="0" stop-color="#fff6e0"/><stop offset=".5" stop-color="#ffb04a"/><stop offset="1" stop-color="#e2601a"/></radialGradient>`
      + `<linearGradient id="${id('bx')}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3a2a5e"/><stop offset="1" stop-color="#140c26"/></linearGradient>` + evmMetal(id('au'), 14, 0, 50, 0),
      `<path d="M15.6 30V10.6Q15.6 7.6 18.6 7.6H45.4Q48.4 7.6 48.4 10.6V30Z" fill="url(#${id('bx')})" stroke="#0a0618" stroke-width=".5"/><path d="M18 28V11.4Q18 10 19.4 10H44.6Q46 10 46 11.4V28Z" fill="#f4ecff" opacity=".9"/><path d="M18 10.6Q32 15 46 10.6" fill="none" stroke="#d6c6f0" stroke-width=".5"/>`
      + `<path d="M14 36.6H50V49.8Q50 51.4 48.4 51.4H15.6Q14 51.4 14 49.8Z" fill="url(#${id('bx')})" stroke="#0a0618" stroke-width=".5"/><path d="M14 38.6H50" stroke="url(#${id('au')})" stroke-width=".8"/>`
      + `<path d="M15.4 36.8C15.4 34 18 32.8 21 33.4C26 34.4 38 34.4 43 33.4C46 32.8 48.6 34 48.6 36.8Z" fill="#2a1a48" stroke="#0a0618" stroke-width=".4"/><circle cx="32" cy="45" r="1.2" fill="url(#${id('au')})" stroke="#6e4705" stroke-width=".3"/>`
      + `<path d="${evmPoly(G)}" fill="#7a2208" transform="translate(.6 .8)" opacity=".4"/>${fa}<path d="${evmPoly(Tb)}" fill="url(#${id('tb')})"/>`
      + `<path d="${evmPoly(G)}" fill="none" stroke="#7a2208" stroke-width=".6" stroke-linejoin="round"/><path d="${evmPoly(Tb)}${Tb.map((t, i) => `M${f(t[0])} ${f(t[1])}L${f(G[i][0])} ${f(G[i][1])}`).join('')}" fill="none" stroke="#fff3e0" stroke-width=".35" opacity=".7"/>`
      + `<path d="M26.6 26Q28.4 24.4 31 24.2" fill="none" stroke="#fff" stroke-width="1" stroke-linecap="round"/><path d="${evnSpark(37.6, 24.4, 2.2)}" fill="#fff"/>`];
  },
  /* 2009 · la pierre-lien de Zendikar : octaèdre de pierre allongé, gravé de lignes et de cercles qui luisent, qui flotte (.evo-float) au-dessus d'un éclat de roche */
  hedron: id => {
    const L = [11, 25], R = [53, 28.4], T = [30, 14.4], B = [34, 38.8], F = [34.6, 27.4];
    return [`<linearGradient id="${id('h1')}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f4ead2"/><stop offset="1" stop-color="#c2b294"/></linearGradient>`
      + `<linearGradient id="${id('h2')}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#d4c6a6"/><stop offset="1" stop-color="#9a8a6c"/></linearGradient>`
      + `<linearGradient id="${id('h3')}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#a2927a"/><stop offset="1" stop-color="#6e6050"/></linearGradient>`
      + `<radialGradient id="${id('hg')}"><stop offset="0" stop-color="#7ff0e0" stop-opacity=".7"/><stop offset="1" stop-color="#7ff0e0" stop-opacity="0"/></radialGradient>`,
      `<ellipse cx="32" cy="45" rx="14" ry="4" fill="url(#${id('hg')})"/>`
      + `<path d="M19 51.6L21.6 46.4L26 45.4L28.4 47.6L33 44.8L38 46L40.6 44.6L44.6 47.4L46 51.6Z" fill="#6e6458" stroke="#2e2a26" stroke-width=".45" stroke-linejoin="round"/><path d="M21.6 46.4L24 51.6M33 44.8L32 51.6M40.6 44.6L41 51.6" stroke="#2e2a26" stroke-width=".35" opacity=".6"/><path d="M22 46.6L26 45.6L28.2 47.6" fill="none" stroke="#a89c8a" stroke-width=".5"/>`
      + `<g class="evo-float"><path d="${evmPoly([L, T, F])}" fill="url(#${id('h1')})"/><path d="${evmPoly([T, R, F])}" fill="url(#${id('h2')})"/><path d="${evmPoly([L, F, B])}" fill="url(#${id('h2')})"/><path d="${evmPoly([F, R, B])}" fill="url(#${id('h3')})"/>`
      + `<path d="${evmPoly([L, T, R, B])}M${F.join(' ')}L${L.join(' ')}M${F.join(' ')}L${T.join(' ')}M${F.join(' ')}L${R.join(' ')}M${F.join(' ')}L${B.join(' ')}" fill="none" stroke="#4a4034" stroke-width=".5" stroke-linejoin="round"/>`
      + `<path d="M16 24.6L24 21.4L26 24.6M21 25.4L27.4 23.2M38 20.6L44 24L42 26.4M36.6 23.6L40.6 26.2M22.4 31.6L28 34.6M40 31.6L46 30.4L44.6 33.6" fill="none" stroke="#3fc8c0" stroke-width=".6" stroke-linecap="round" opacity=".85"/>`
      + `<g fill="none" stroke="#3fc8c0" stroke-width=".5" opacity=".85"><circle cx="26.6" cy="24.6" r="1.2"/><circle cx="41.6" cy="26.6" r="1"/><circle cx="28.4" cy="34.8" r=".8"/></g>`
      + `<path d="M13.6 24.6L29.6 15.8" stroke="#fff" stroke-width=".7" stroke-linecap="round" opacity=".6"/></g>`];
  },
  /* 2011 · le dragon du Commander : statuette de bronze patiné, dragon ancien assis sur un rocher, ailes levées, queue enroulée */
  dragon: id => [`<radialGradient id="${id('dz')}" cx="30" cy="22" r="28" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#ffe0a0"/><stop offset=".35" stop-color="#d0954a"/><stop offset=".7" stop-color="#8a5226"/><stop offset="1" stop-color="#3a2008"/></radialGradient>`
    + `<linearGradient id="${id('dw')}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#b87a3a"/><stop offset="1" stop-color="#4a2a10"/></linearGradient>`
    + `<linearGradient id="${id('rk')}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8a8274"/><stop offset="1" stop-color="#4a443c"/></linearGradient>`,
    `<path d="M36 27L44 14Q45 18.4 50 17Q48.6 22 50.4 25.4Q44 25 38.8 31Z" fill="url(#${id('dw')})" stroke="#2a1405" stroke-width=".45" stroke-linejoin="round" opacity=".9"/>`
    + `<path d="M31 27L22 9.6Q20.6 13.6 14 8.4Q13.2 12.6 9.4 13Q11.6 18.6 12.4 22.4Q20 23.4 26.8 31Z" fill="url(#${id('dw')})" stroke="#2a1405" stroke-width=".5" stroke-linejoin="round"/>`
    + `<path d="M31 27L22 9.6M30 28L14 8.4M28.6 29.2L9.4 13" fill="none" stroke="#2a1405" stroke-width=".6"/><path d="M22.4 11L15 9.4" stroke="#ffe0a0" stroke-width=".4" opacity=".6"/>`
    + `<path d="M17 51.6C17 47.8 20 45.6 24 45.2C28 44.6 37 44.4 41 45.4C45 46.2 47.4 48.6 47 51.6Z" fill="url(#${id('rk')})" stroke="#2e2a26" stroke-width=".45"/><path d="M24 46.6L26 51.6M39 45.8L38 51.6" stroke="#2e2a26" stroke-width=".35" opacity=".5"/>`
    + `<path d="M24.6 45C21.6 38.6 24 31 30 27.6C33 26 36.4 26.4 38 28.6C39.6 31 38.4 35 37.6 38C40 40 41 43 40.4 45.4Z" fill="url(#${id('dz')})" stroke="#2a1405" stroke-width=".5"/>`
    + `<path d="M33.6 28.4C33 22.4 35 16.4 39.4 13.2C41 12 43 11.4 44.6 12L50.6 13.6C51.4 13.8 51.4 14.8 50.6 15.2L46 16.2C44.6 16.6 43.6 17.6 42.6 19C40.6 22 39.8 25.4 39 29Z" fill="url(#${id('dz')})" stroke="#2a1405" stroke-width=".5" stroke-linejoin="round"/>`
    + `<path d="M42.4 12L38.4 7.2L41 11.4ZM43.8 11.8L41.8 6.2L44 10.8Z" fill="#d0954a" stroke="#2a1405" stroke-width=".35" stroke-linejoin="round"/><path d="M45.4 15.2L50.2 14.6" stroke="#2a1405" stroke-width=".35"/>`
    + `<circle cx="45.4" cy="13.4" r=".7" fill="#ff5a2a" stroke="#2a1405" stroke-width=".25"/><path d="M38 15.6L36.2 15.2M36.4 18.6L34.6 18.4M35 22L33.2 22" stroke="#2a1405" stroke-width=".5" stroke-linecap="round"/>`
    + `<path d="M34.6 30.6Q36.8 31 38 32.6M35 33.6Q37 34 38 35.4M34.8 36.6Q36.6 37 37.6 38.2" fill="none" stroke="#2a1405" stroke-width=".35" opacity=".6"/>`
    + `<ellipse cx="27.6" cy="40.4" rx="5" ry="4.4" transform="rotate(-20 27.6 40.4)" fill="url(#${id('dz')})" stroke="#2a1405" stroke-width=".45"/>`
    + `<path d="M33 38C34.6 41 35.2 44 36.8 46H33.4C32.6 44 31.4 42 30.6 40Z" fill="url(#${id('dz')})" stroke="#2a1405" stroke-width=".45" stroke-linejoin="round"/><path d="M33.6 46L33 47M35 46L34.8 47M36.4 46L36.6 47" stroke="#2a1405" stroke-width=".4"/>`
    + `<path d="M24.4 44.6C18.6 45.6 14.6 48.4 17.6 50C21.6 51.4 30 50.6 34 49.8C38 49 42.4 49.6 45 48.2C42.4 51 36 51.8 30 51.6C24 51.6 16.2 51.8 14.4 49.4C13 47 17.6 44.2 23.4 42.8Z" fill="url(#${id('dz')})" stroke="#2a1405" stroke-width=".45"/>`
    + `<path d="M26 30.6Q29.6 27.6 33.6 28.6M38.6 14.4Q41 12.6 43.4 12.6" fill="none" stroke="#fff3c4" stroke-width=".7" stroke-linecap="round" opacity=".7"/>`
    + `<path d="M25.6 36.4Q26.6 40 29.4 41.8M23.2 47.4Q20 48.2 19 49.2" fill="none" stroke="#4fae8a" stroke-width=".7" stroke-linecap="round" opacity=".55"/>`],
  /* 2014 · l'étendard des clans : étendard de guerre à trois bandes (rouge, ivoire, noir), queue d'aronde, emblème de griffes d'or, hampe à pointe et glands (.evo-cloth ondule) */
  banner: id => [evmMetal(id('au'), 18, 0, 48, 0) + `<linearGradient id="${id('pw')}" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#3a1f0c"/><stop offset=".45" stop-color="#a8693a"/><stop offset="1" stop-color="#3a1f0c"/></linearGradient>`
    + `<linearGradient id="${id('fd')}" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#000" stop-opacity=".25"/><stop offset=".2" stop-color="#000" stop-opacity="0"/><stop offset=".42" stop-color="#000" stop-opacity=".2"/><stop offset=".6" stop-color="#fff" stop-opacity=".12"/><stop offset=".8" stop-color="#000" stop-opacity=".18"/><stop offset="1" stop-color="#000" stop-opacity=".05"/></linearGradient>`
    + `<clipPath id="${id('bc')}"><path d="M23.2 10.4H45.6V40.6L41.8 37L38 41.4L34.4 37.2L30.6 41.4L26.8 37L23.2 40.6Z"/></clipPath>`,
    `<path d="M17.6 51.6L20.6 47.6H23.8L26.8 51.6Z" fill="#4a443c" stroke="#2e2a26" stroke-width=".4"/>`
    + `<rect x="21.2" y="7" width="1.6" height="41" fill="url(#${id('pw')})" stroke="#2a1405" stroke-width=".35"/><path d="M22 2.4L23.4 6.6H20.6Z" fill="url(#${id('au')})" stroke="#6e4705" stroke-width=".35"/><circle cx="22" cy="7" r="1" fill="url(#${id('au')})" stroke="#6e4705" stroke-width=".3"/>`
    + `<rect x="20.6" y="9.2" width="27" height="1.4" rx=".5" fill="url(#${id('pw')})" stroke="#2a1405" stroke-width=".35"/>`
    + `<g class="evo-cloth"><g clip-path="url(#${id('bc')})"><rect x="23" y="10" width="7.6" height="32" fill="#d0452e"/><rect x="30.6" y="10" width="7.6" height="32" fill="#f6ead0"/><rect x="38.2" y="10" width="7.6" height="32" fill="#2c2148"/>`
    + `<rect x="23" y="10" width="23" height="32" fill="url(#${id('fd')})"/></g><path d="M23.2 10.4H45.6V40.6L41.8 37L38 41.4L34.4 37.2L30.6 41.4L26.8 37L23.2 40.6Z" fill="none" stroke="#3a1608" stroke-width=".5" stroke-linejoin="round"/>`
    + `<path d="M23.4 13H45.4M23.4 35.4H45.4" stroke="url(#${id('au')})" stroke-width=".7"/>`
    + `<circle cx="34.4" cy="24" r="5.6" fill="#1a1030" stroke="url(#${id('au')})" stroke-width="1"/><path d="M31.4 27.6L32.6 20.6M34.4 28L34.4 20.2M37.4 27.6L36.2 20.6" stroke="#f2c230" stroke-width="1" stroke-linecap="round"/></g>`
    + `<g fill="url(#${id('au')})" stroke="#6e4705" stroke-width=".3"><path d="M47.6 10.4L46.8 14.6H48.4Z"/><circle cx="47.6" cy="10.2" r=".7"/></g>`],
  /* 2016 · la couronne du monarque : couronne d'or à cinq fleurons perlés, bandeau serti de gemmes, bonnet de velours, sur un coussin pourpre */
  crown: id => [evmMetal(id('au'), 16, 0, 48, 0) + `<radialGradient id="${id('cv')}" cx=".4" cy=".3" r=".8"><stop offset="0" stop-color="#e05a6e"/><stop offset="1" stop-color="#6a0c22"/></radialGradient>`,
    evmCushion(id, 13, 51, 42.4, ['#8a6ad8', '#4a2f8e', '#1e1040'], 'au')
    + `<path d="M19.4 36C19 28 24 22.6 32 22.6S45 28 44.6 36Z" fill="url(#${id('cv')})" stroke="#3a0612" stroke-width=".45"/>`
    + `<path d="M18.4 38.4L16.6 21.4L22.6 29.8L25.4 18L30.2 28.4L32 14.6L33.8 28.4L38.6 18L41.4 29.8L47.4 21.4L45.6 38.4Z" fill="url(#${id('au')})" stroke="#6e4705" stroke-width=".55" stroke-linejoin="round"/>`
    + `<g fill="#fffaf0" stroke="#b9800f" stroke-width=".3">${[[16.6, 21], [25.4, 17.6], [32, 14.1], [38.6, 17.6], [47.4, 21]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="1.35"/>`).join('')}</g>`
    + `<path d="M18 37.4Q32 41.4 46 37.4V43.4Q32 47.6 18 43.4Z" fill="url(#${id('au')})" stroke="#6e4705" stroke-width=".55"/><path d="M18.4 38.6Q32 42.6 45.6 38.6" fill="none" stroke="#fff3c4" stroke-width=".4"/>`
    + [[21.6, 41.2, 3], [26.6, 42.4, 1], [32, 42.8, 4], [37.4, 42.4, 1], [42.4, 41.2, 3]].map(([x, y, c], i) => i % 2 ? `<circle cx="${x}" cy="${y}" r="1.2" fill="${EVY_MANA[c][2]}" stroke="#6e4705" stroke-width=".3"/>` : `<path d="M${x} ${y - 1.7}L${x + 1.3} ${y}L${x} ${y + 1.7}L${x - 1.3} ${y}Z" fill="${EVY_MANA[c][2]}" stroke="#6e4705" stroke-width=".3"/>`).join('')
    + `<path d="M21.6 33.6L19.8 24.6M27.2 31L25.8 21.4" stroke="#fff6cc" stroke-width=".6" stroke-linecap="round" opacity=".8"/>`],
  /* 2016 · l'invention de Kaladesh : engrenage en filigrane d'or (volutes ajourées, rosace et gemme turquoise), lueur d'éther ; il tourne lentement (.evo-spin) */
  invention: id => {
    const f = evoF, curls = Array.from({ length: 6 }, (_, i) => { const a = i * 60; return `<path d="M0-4.2C2.2-5 3.6-7 2.6-8.6C1.8-9.8-.2-9.2.2-7.8C.4-7 1.4-7 1.4-7.8" transform="rotate(${a})"/><path d="M0-4.2C-2.2-5-3.6-7-2.6-8.6C-1.8-9.8.2-9.2-.2-7.8C-.4-7-1.4-7-1.4-7.8" transform="rotate(${a})"/>`; }).join('');
    return [evmMetal(id('au'), 14, 10, 50, 44) + `<radialGradient id="${id('ae')}"><stop offset="0" stop-color="#7ff0e0" stop-opacity=".55"/><stop offset="1" stop-color="#7ff0e0" stop-opacity="0"/></radialGradient>` + evmBall(id('tq'), ['#ffffff', '#b8fff0', '#2fc8b4', '#0c5a52']),
      `<circle cx="32" cy="27" r="20" fill="url(#${id('ae')})"/><path d="M26.4 51.6L28 44.6H36L37.6 51.6Z" fill="url(#${id('au')})" stroke="#6e4705" stroke-width=".45"/><path d="M30.6 44.6V41H33.4V44.6" fill="url(#${id('au')})" stroke="#6e4705" stroke-width=".4"/>`
      + `<g class="evo-spin" style="transform-origin:32px 27px"><path d="${evmGear(32, 27, 15, 12, 0, 2.6, 0)}M${f(32 - 11.2)} 27A11.2 11.2 0 1 0 ${f(32 + 11.2)} 27A11.2 11.2 0 1 0 ${f(32 - 11.2)} 27Z" fill="url(#${id('au')})" fill-rule="evenodd" stroke="#6e4705" stroke-width=".55" stroke-linejoin="round"/>`
      + `<circle cx="32" cy="27" r="12.4" fill="none" stroke="#fff3c4" stroke-width=".35" opacity=".7"/><circle cx="32" cy="27" r="11.2" fill="none" stroke="#6e4705" stroke-width=".4"/>`
      + `<g transform="translate(32 27)" fill="none" stroke-linecap="round"><g stroke="#6e4705" stroke-width="1.3">${curls}</g><g stroke="url(#${id('au')})" stroke-width=".8">${curls}</g>`
      + `<path d="${EVQ_FLOWER}" transform="scale(4.4)" fill="url(#${id('au')})" stroke="#6e4705" stroke-width=".1"/><circle r="2" fill="url(#${id('tq')})" stroke="#6e4705" stroke-width=".35"/></g>`
      + `<g fill="url(#${id('tq')})" stroke="#6e4705" stroke-width=".25">${[0, 90, 180, 270].map(a => `<circle cx="${f(32 + Math.cos(a * Math.PI / 180) * 12.4)}" cy="${f(27 + Math.sin(a * Math.PI / 180) * 12.4)}" r=".9"/>`).join('')}</g></g>`];
  },
  /* 2018 · le parchemin de Dominaria : rouleau déroulé sur son support de laiton, lettrine enluminée, chapitres I, II, III (chiffres en tracés) */
  saga: id => {
    const ch = (y, s, i) => `<path d="M19.6 ${y - 2.8}H25.6L27 ${y}L25.6 ${y + 2.8}H19.6Z" fill="#7a2a1a" stroke="#3a1006" stroke-width=".35"/>${evmDigits(s, 22.6, y, 2.6, 'stroke="#ffe58a"', .45)}`
      + `<g fill="none" stroke="#6b4a22" stroke-width=".35" stroke-linecap="round">${[0, 1.8].map((d, j) => `<path d="${evmScrawl(28.6, j ? 38 : 43.2, y - .6 + d, i * 3 + j + 1, .9)}"/>`).join('')}</g>`;
    return [evmParchDefs(id) + evmMetal(id('au'), 14, 0, 50, 0) + `<linearGradient id="${id('rl')}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#c98a52"/><stop offset=".45" stop-color="#e8b07a"/><stop offset="1" stop-color="#5a3010"/></linearGradient>`,
      `<path d="M15.6 51.6V8M48.4 51.6V8" stroke="url(#${id('au')})" stroke-width="1.3"/><path d="M13.6 51.6H18M46 51.6H50.4" stroke="#6e4705" stroke-width="1.2" stroke-linecap="round"/>`
      + `<path d="M18.4 9.6H45.6V44.6C42 45.6 38 44.2 32 45C26 45.8 22 44.6 18.4 45.6Z" fill="url(#${id('pa')})" stroke="#a8834a" stroke-width=".45"/>`
      + `<rect x="19.6" y="12.2" width="4.6" height="4.6" fill="#2c4a8a" stroke="#f2c230" stroke-width=".45"/><path d="M20.6 16L21.9 13L23.2 16M21.1 14.9H22.7" fill="none" stroke="#ffe58a" stroke-width=".5" stroke-linecap="round" stroke-linejoin="round"/>`
      + `<path d="${evmScrawl(25.6, 43.6, 14.6, 31, 1.1)}" fill="none" stroke="#3a2210" stroke-width=".45" stroke-linecap="round"/><path d="M19.6 18.8H44.4" stroke="#a8834a" stroke-width=".35"/>`
      + ch(22.8, 'I', 1) + `<path d="M19.6 26.6H44.4" stroke="#a8834a" stroke-width=".3"/>` + ch(30.4, 'II', 2) + `<path d="M19.6 34.2H44.4" stroke="#a8834a" stroke-width=".3"/>` + ch(38, 'III', 3)
      + [8.6, 45].map(y => `<rect x="16.4" y="${y - 1.5}" width="31.2" height="3" rx="1.5" fill="url(#${id('rl')})" stroke="#3a1f0c" stroke-width=".4"/><g fill="url(#${id('au')})" stroke="#6e4705" stroke-width=".35"><ellipse cx="16" cy="${y}" rx="1.3" ry="2"/><ellipse cx="48" cy="${y}" rx="1.3" ry="2"/></g>`).join('')];
  },
  /* 2018 · la tablette d'Arena : tablette sur son pied, une partie à l'écran (adversaire, « 20 », champ de bataille, main en éventail, bouton qui luit) */
  arena: id => {
    const hand = [0, 1, 2, 3, 4].map(i => { const a = -16 + i * 8, m = EVY_MANA[i]; return `<rect x="30.4" y="33" width="3.2" height="4.6" rx=".4" fill="${m[2]}" stroke="#fffef4" stroke-width=".3" transform="rotate(${a} 32 44)"/>`; }).join('');
    return [`<linearGradient id="${id('tb')}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#4a4e66"/><stop offset="1" stop-color="#16182a"/></linearGradient>`
      + `<radialGradient id="${id('bf')}" cx=".5" cy=".5" r=".7"><stop offset="0" stop-color="#3a3a8a"/><stop offset=".7" stop-color="#1a1a48"/><stop offset="1" stop-color="#0a0a22"/></radialGradient>`
      + `<radialGradient id="${id('pb')}" cx=".4" cy=".35" r=".7"><stop offset="0" stop-color="#fff3c4"/><stop offset=".5" stop-color="#ff9a3a"/><stop offset="1" stop-color="#c8401a"/></radialGradient>`
      + `<linearGradient id="${id('k')}" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".5" stop-color="#fff" stop-opacity=".35"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>`
      + `<clipPath id="${id('sc')}"><rect x="12.4" y="17.4" width="39.2" height="24.2" rx="1.6"/></clipPath>`,
      `<path d="M27 43.6L24 51.6H40L37 43.6Z" fill="#2a2c40" stroke="#0e0f1a" stroke-width=".45"/><ellipse cx="32" cy="51.2" rx="9" ry="1" fill="#16182a"/>`
      + `<rect x="9.6" y="14.8" width="44.8" height="29.4" rx="3.4" fill="url(#${id('tb')})" stroke="#0a0a14" stroke-width=".55"/>`
      + `<rect x="12.4" y="17.4" width="39.2" height="24.2" rx="1.6" fill="url(#${id('bf')})"/>`
      + `<g clip-path="url(#${id('sc')})"><path d="M12.4 29.6H51.6" stroke="#7cc4ff" stroke-width=".3" opacity=".5"/>`
      + `<circle cx="32" cy="19.8" r="2.4" fill="#8a5ad6" stroke="#ffe58a" stroke-width=".45"/>${evmDigits('20', 37.8, 19.8, 2.2, 'stroke="#ffe58a"', .45)}`
      + [[24.6, 23.2, 3], [29.2, 23.2, 2]].map(([x, y, c]) => `<rect x="${x}" y="${y}" width="3.4" height="4.6" rx=".4" fill="${EVY_MANA[c][2]}" stroke="#fffef4" stroke-width=".3"/>`).join('')
      + [[30.6, 31, 4], [35.2, 31, 1], [39.8, 31, 0]].map(([x, y, c]) => `<rect x="${x}" y="${y}" width="3.4" height="4.6" rx=".4" fill="${EVY_MANA[c][2]}" stroke="#fffef4" stroke-width=".3"/>`).join('')
      + hand + `<circle cx="47.4" cy="35.6" r="2.4" fill="url(#${id('pb')})" stroke="#fff3c4" stroke-width=".4"/><path d="M46.7 34.6L48.5 35.6L46.7 36.6Z" fill="#fff"/>`
      + `<path d="M14.6 30.2Q20 28.6 24 30.4" fill="none" stroke="#ff9a3a" stroke-width=".5" opacity=".7"/><path class="evo-glint" d="M4 44H9L21 14H16Z" fill="url(#${id('k')})" opacity="0"/></g>`
      + `<path d="M12.4 17.4L28 17.4L16 41.6H12.4Z" fill="#fff" opacity=".06"/><circle cx="11" cy="29.5" r=".55" fill="#6a6e88"/>`];
  },
  /* 2019 · l'écu de la Guerre de l'Étincelle : écu d'acier bleu nuit à bordure d'or, étincelle rayonnante et anneau d'étoiles, griffures de bataille */
  shield: id => {
    const f = evoF, D = evmShieldD(32, 8.4, 28, 41), stars = Array.from({ length: 12 }, (_, i) => { const a = i * 30 * Math.PI / 180; return `<circle cx="${f(32 + Math.cos(a) * 9.4)}" cy="${f(25.4 + Math.sin(a) * 9.4)}" r=".55"/>`; }).join('');
    const rays = Array.from({ length: 16 }, (_, i) => { const a = (i * 22.5 + 11.25) * Math.PI / 180; return `M${f(32 + Math.cos(a) * 4)} ${f(25.4 + Math.sin(a) * 4)}L${f(32 + Math.cos(a) * 7.8)} ${f(25.4 + Math.sin(a) * 7.8)}`; }).join('');
    return [evmMetal(id('au'), 18, 8, 46, 50) + `<radialGradient id="${id('sf')}" cx=".38" cy=".3" r=".85"><stop offset="0" stop-color="#4a6aa8"/><stop offset=".6" stop-color="#1c2a5a"/><stop offset="1" stop-color="#0a1028"/></radialGradient>`,
      `<path d="M20 51.6L23 47.4M44 51.6L41 47.4" stroke="#2e2a3e" stroke-width="1.5" stroke-linecap="round"/>`
      + `<path d="${D}" fill="url(#${id('au')})" stroke="#6e4705" stroke-width=".6"/><path d="${evmShieldD(32, 10.4, 24, 36.6)}" fill="url(#${id('sf')})" stroke="#6e4705" stroke-width=".45"/>`
      + `<path d="${rays}" stroke="#ffe58a" stroke-width=".7" stroke-linecap="round" opacity=".85"/><g fill="#fff3c4">${stars}</g>`
      + `<path d="${evnSpark(32, 25.4, 6.4)}" fill="#fff6cc" stroke="#b9800f" stroke-width=".35"/><path d="${evnSpark(32, 25.4, 3.6)}" fill="#fff" transform="rotate(45 32 25.4)"/>`
      + `<path d="M23 14.4L26.6 18.6M38.6 37.6L41 34.4M24.4 33.6L26.4 34.6" stroke="#9fb4e0" stroke-width=".4" stroke-linecap="round" opacity=".55"/>`
      + `<path d="M21.6 12.6V22Q21.8 28 24.6 33" fill="none" stroke="#fff" stroke-width=".9" stroke-linecap="round" opacity=".35"/><g fill="url(#${id('au')})" stroke="#6e4705" stroke-width=".25">${[[20.2, 10.4], [43.8, 10.4], [20.2, 22], [43.8, 22]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r=".75"/>`).join('')}</g>`];
  },
  /* 2020 · les demi-decks de Jumpstart : deux paquets de 20 cartes (tranches visibles) sous leur bande de papier « 20 », l'un rouge l'autre bleu, et la flèche
     qui les mélange */
  jumpstart: id => {
    const deck = (x, y, r, C, s) => { let ed = ''; for (let i = 0; i < 6; i++) ed += `<rect x="${x + i * .35}" y="${y + i * .9}" width="13" height="18" rx="1.2" fill="#f4ecd8" stroke="#8a7d66" stroke-width=".25"/>`;
      return `<g transform="rotate(${r} ${x + 6.5} ${y + 14})">${ed}<rect x="${x + 2.1}" y="${y + 5.4}" width="13" height="18" rx="1.2" fill="#1d1a24" stroke="#000" stroke-width=".3"/>`
        + `<rect x="${x + 3}" y="${y + 6.3}" width="11.2" height="16.2" rx=".6" fill="${C[2]}"/><path d="M${x + 4.4} ${y + 20}L${x + 8.6} ${y + 9}L${x + 12.8} ${y + 20}" fill="none" stroke="${C[0]}" stroke-width="1.1" stroke-linejoin="round" opacity=".55"/>`
        + `<rect x="${x + 1.6}" y="${y + 12.4}" width="14" height="4.6" fill="${C[1]}" stroke="${C[4]}" stroke-width=".3"/>${evmDigits('20', x + 8.6, y + 14.7, 2.6, `stroke="${C[4]}"`, .45)}</g>`; };
    return [evmMetal(id('au'), 26, 0, 38, 0),
      deck(13, 22, -8, EVY_MANA[3]) + deck(36, 22, 8, EVY_MANA[1])
      + `<path d="M24.6 16.6C28 12.6 36 12.6 39.4 16.6" fill="none" stroke="#6e4705" stroke-width="1.9" stroke-linecap="round"/><path d="M24.6 16.6C28 12.6 36 12.6 39.4 16.6" fill="none" stroke="url(#${id('au')})" stroke-width="1.1" stroke-linecap="round"/>`
      + `<path d="M37.6 13.8L40.2 17.2L36.2 17.6Z" fill="url(#${id('au')})" stroke="#6e4705" stroke-width=".4" stroke-linejoin="round"/><path d="M26.4 13.8L23.8 17.2L27.8 17.6Z" fill="url(#${id('au')})" stroke="#6e4705" stroke-width=".4" stroke-linejoin="round"/>`];
  },
  /* 2023 · l'Anneau unique : anneau d'or lisse sur un coussin de velours, étiquette de papier « 1/1 » (tracés) au bout d'une ficelle */
  ring: id => [`<linearGradient id="${id('rg')}" x1="18" y1="16" x2="46" y2="44" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#fffbe6"/><stop offset=".22" stop-color="#ffe58a"/><stop offset=".45" stop-color="#e0a82a"/><stop offset=".62" stop-color="#ffe9a0"/><stop offset=".85" stop-color="#b9800f"/><stop offset="1" stop-color="#6e4705"/></linearGradient>`
    + evmMetal(id('au'), 14, 0, 50, 0) + `<linearGradient id="${id('tg')}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fdf6e4"/><stop offset="1" stop-color="#e2cfa4"/></linearGradient>`,
    evmCushion(id, 15, 49, 41.6, ['#5a8ae0', '#22468e', '#0e1f44'], 'au')
    + `<ellipse cx="32" cy="42" rx="9" ry="1.6" fill="#0a1430" opacity=".5"/>`
    + `<path d="M32 15.6C39 15.6 43.6 21.6 43.6 29.2S39 42.6 32 42.6S20.4 36.8 20.4 29.2S25 15.6 32 15.6ZM32 19.4C27.2 19.4 24.2 23.8 24.2 29.2S27.2 38.8 32 38.8S39.8 34.6 39.8 29.2S36.8 19.4 32 19.4Z" fill="url(#${id('rg')})" fill-rule="evenodd" stroke="#6e4705" stroke-width=".55"/>`
    + `<path d="M24.2 29.2C24.2 34.6 27.2 38.8 32 38.8C29.6 37.6 28 34 28 29.2S29.6 20.8 32 19.4C27.2 19.4 24.2 23.8 24.2 29.2Z" fill="#9a6410" opacity=".55"/>`
    + `<path d="M23 25.4Q24.6 19.4 30 17.4" fill="none" stroke="#fff" stroke-width="1" stroke-linecap="round" opacity=".85"/><path d="M41.6 32Q40.4 37.4 36 40" fill="none" stroke="#fff3c4" stroke-width=".7" stroke-linecap="round" opacity=".7"/>`
    + `<path d="M42.4 22.6C46 22 48.6 23.4 49.6 26.6" fill="none" stroke="#8a6a3e" stroke-width=".45"/>`
    + `<g transform="rotate(10 49.6 27)"><path d="M46.4 28.4L49.6 26.4L52.8 28.4V36.6Q52.8 37.4 52 37.4H47.2Q46.4 37.4 46.4 36.6Z" fill="url(#${id('tg')})" stroke="#8a6a3e" stroke-width=".45" stroke-linejoin="round"/><circle cx="49.6" cy="28.2" r=".6" fill="#8a6a3e"/>`
    + `${evmDigits('1/1', 49.6, 32.6, 2.8, 'stroke="#3a2210"', .45)}</g>`],
  /* 2024 · le gland de Bloomburrow : gland verni (cupule écaillée, pédoncule), une petite épée de souris appuyée contre lui, une feuille de chêne */
  acorn: id => {
    let sc = ''; for (let r = 0; r < 3; r++) for (let i = 0; i < 7 - r; i++) { const x = 21.6 + r * 1.4 + i * 3.4, y = 18.4 + r * 2.6; sc += `M${evoF(x)} ${evoF(y)}l1.7 1.7l1.7-1.7`; }
    return [`<radialGradient id="${id('nt')}" cx=".36" cy=".3" r=".8"><stop offset="0" stop-color="#ffe0a8"/><stop offset=".4" stop-color="#d48a3a"/><stop offset=".8" stop-color="#8a4a18"/><stop offset="1" stop-color="#4a2408"/></radialGradient>`
      + `<linearGradient id="${id('cp')}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#a8865a"/><stop offset="1" stop-color="#5a4024"/></linearGradient>`
      + evmMetal(id('sw'), 0, 0, 3, 0, EVM_FE) + evmMetal(id('au'), 40, 0, 50, 0),
      `<path d="M14 51.6C14.4 47 18.6 44.6 21.6 46.6C21.4 44 24.4 42.6 26 44.6" fill="#3f8f45" stroke="#1c4a22" stroke-width=".4"/><path d="M14.4 51.4C16 48 18.6 46.4 21.6 46.6" fill="none" stroke="#1c4a22" stroke-width=".4"/>`
      + `<path d="M22 24C20.6 32 23 44 31.4 49C39.8 44 42.2 32 40.8 24Z" fill="url(#${id('nt')})" stroke="#3a1c06" stroke-width=".55"/>`
      + `<path d="M31.4 46.4L31.4 49.4" stroke="#3a1c06" stroke-width=".7" stroke-linecap="round"/><path d="M24.6 28Q24.6 37 29 44" fill="none" stroke="#fff" stroke-width="1.1" stroke-linecap="round" opacity=".55"/>`
      + `<path d="M19.4 25.6C18.8 18.6 24 14.8 31.4 14.8S44 18.6 43.4 25.6C38 27.4 24.8 27.4 19.4 25.6Z" fill="url(#${id('cp')})" stroke="#3a2410" stroke-width=".55"/>`
      + `<path d="${sc}" fill="none" stroke="#3a2410" stroke-width=".4" opacity=".7"/><path d="M21 21.4Q26 17 33 16.6" fill="none" stroke="#e0c49a" stroke-width=".6" stroke-linecap="round" opacity=".7"/>`
      + `<path d="M31 15C30.8 12.6 31.6 10.6 33.4 9.4" fill="none" stroke="#5a4024" stroke-width="1.4" stroke-linecap="round"/>`
      /* l'épée : lame, garde d'or, poignée de cuir, pommeau */
      + `<g transform="rotate(14 46 50)"><path d="M44.6 48.6V24.4L45.8 22L47 24.4V48.6Z" fill="url(#${id('sw')})" stroke="#2e3646" stroke-width=".4" stroke-linejoin="round"/><path d="M45.8 23.4V47.6" stroke="#fff" stroke-width=".35"/>`
      + `<rect x="42.4" y="48.4" width="6.8" height="1.4" rx=".6" fill="url(#${id('au')})" stroke="#6e4705" stroke-width=".35"/><rect x="45" y="49.8" width="1.6" height="3.4" fill="#6e3a1a" stroke="#2a1405" stroke-width=".3"/><circle cx="45.8" cy="53.8" r=".9" fill="url(#${id('au')})" stroke="#6e4705" stroke-width=".3"/></g>`];
  },
  /* 2025 · le cristal de Final Fantasy (évocation originale) : grand cristal bleu facetté qui flotte (.evo-float) au-dessus d'un anneau de pierre, lueur et éclats */
  crystal: id => {
    const T = [32, 5.6], Bm = [32, 42], L = [22.4, 20.6], ML = [28, 24.4], MR = [36.4, 24.4], R = [41.6, 20.6];
    return [`<linearGradient id="${id('c1')}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#e8f6ff"/><stop offset="1" stop-color="#7cc4ff"/></linearGradient>`
      + `<linearGradient id="${id('c2')}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#9fd4ff"/><stop offset="1" stop-color="#2f78d8"/></linearGradient>`
      + `<linearGradient id="${id('c3')}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#4e8fe8"/><stop offset="1" stop-color="#173d8a"/></linearGradient>`
      + `<radialGradient id="${id('cg')}"><stop offset="0" stop-color="#bfe2ff" stop-opacity=".8"/><stop offset="1" stop-color="#7cc4ff" stop-opacity="0"/></radialGradient>`,
      `<circle cx="32" cy="25" r="18" fill="url(#${id('cg')})"/><ellipse cx="32" cy="48.4" rx="12" ry="3.2" fill="#6e6a7a" stroke="#2e2a3e" stroke-width=".45"/><ellipse cx="32" cy="47.6" rx="9.4" ry="2.1" fill="#3a364a"/><ellipse cx="32" cy="47.6" rx="6" ry="1.2" fill="url(#${id('cg')})"/>`
      + `<path d="M20 49.4V51.4M44 49.4V51.4" stroke="#2e2a3e" stroke-width="1.6"/><g class="evo-float">`
      + `<path d="${evmPoly([T, L, ML])}" fill="url(#${id('c1')})"/><path d="${evmPoly([T, ML, MR])}" fill="url(#${id('c1')})" opacity=".95"/><path d="${evmPoly([T, MR, R])}" fill="url(#${id('c2')})"/>`
      + `<path d="${evmPoly([L, ML, Bm])}" fill="url(#${id('c2')})"/><path d="${evmPoly([ML, MR, Bm])}" fill="url(#${id('c2')})" opacity=".9"/><path d="${evmPoly([MR, R, Bm])}" fill="url(#${id('c3')})"/>`
      + `<path d="${evmPoly([T, R, Bm, L])}M${ML.join(' ')}L${T.join(' ')}M${MR.join(' ')}L${T.join(' ')}M${L.join(' ')}L${ML.join(' ')}L${MR.join(' ')}L${R.join(' ')}M${ML.join(' ')}L${Bm.join(' ')}M${MR.join(' ')}L${Bm.join(' ')}" fill="none" stroke="#0e2a66" stroke-width=".45" stroke-linejoin="round"/>`
      + `<path d="M24 19.6L31 8.6M29 25L31.6 39" stroke="#fff" stroke-width=".8" stroke-linecap="round" opacity=".8"/><path d="${evnSpark(30.6, 14, 2)}" fill="#fff"/></g>`
      + `<g fill="#e8f6ff">${[[16.6, 14, 1.3], [47.4, 30, 1.1], [45, 10, .9]].map(([x, y, r]) => `<path d="${evnSpark(x, y, r)}"/>`).join('')}</g>`];
  },
  /* aujourd'hui · ton classeur : classeur ouvert sur un pupitre, cartes dans les pochettes (3 × 3 par page), anneaux d'or ; une pochette vide qui luit : la suivante est à toi */
  binder: id => {
    const pk = (x0, y0, k) => { let s = ''; for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) { const i = r * 3 + c, x = x0 + c * 6.6, y = y0 + r * 9.4;
      if (k && i === 8) { s += `<rect x="${x}" y="${y}" width="5.6" height="8.2" rx=".6" fill="#fff6d0" stroke="#f2c230" stroke-width=".6" class="evo-next"/><path d="M${x + 2.8} ${y + 2.6}V${y + 5.6}M${x + 1.3} ${y + 4.1}H${x + 4.3}" stroke="#d99a14" stroke-width=".6" stroke-linecap="round"/>`; continue; }
      const m = EVY_MANA[(i * 3 + k * 2) % 5]; s += `<rect x="${x}" y="${y}" width="5.6" height="8.2" rx=".6" fill="#1d1a24"/><rect x="${x + .6}" y="${y + .6}" width="4.4" height="7" rx=".3" fill="${m[2]}"/><rect x="${x + 1}" y="${y + 1.6}" width="3.6" height="2.6" fill="${m[1]}"/>`; }
      return s + `<path d="M${x0 - .6} ${y0 + 9}H${x0 + 19.6}M${x0 - .6} ${y0 + 18.4}H${x0 + 19.6}" stroke="#fff" stroke-width=".35" opacity=".5"/>`; };
    return [`<linearGradient id="${id('lc')}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#3a6fd0"/><stop offset="1" stop-color="#132a5e"/></linearGradient>` + evmMetal(id('au'), 28, 0, 36, 0)
      + `<linearGradient id="${id('pg2')}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f4f6fa"/><stop offset="1" stop-color="#d6dce6"/></linearGradient>`,
      `<path d="M20 51.6L24 40M44 51.6L40 40" stroke="#8a5a0c" stroke-width="1.2" stroke-linecap="round"/>`
      + `<path d="M6.4 13.4L31.4 11.2L32.6 11.2L57.6 13.4V46.6L32.6 44.4H31.4L6.4 46.6Z" fill="url(#${id('lc')})" stroke="#0a1838" stroke-width=".55" stroke-linejoin="round"/>`
      + `<path d="M8.6 15.2L30.6 13.4V42.4L8.6 44.6Z" fill="url(#${id('pg2')})" stroke="#8a96a8" stroke-width=".35"/><path d="M33.4 13.4L55.4 15.2V44.6L33.4 42.4Z" fill="url(#${id('pg2')})" stroke="#8a96a8" stroke-width=".35"/>`
      + `<g transform="matrix(1 -.08 0 1 0 1.6)">${pk(10.2, 16, 0)}</g><g transform="matrix(1 .08 0 1 0 -1.8)">${pk(34.6, 16.4, 1)}</g>`
      + `<path d="M30.6 13.4L33.4 13.4V42.4L30.6 42.4Z" fill="#0a1838" opacity=".4"/>`
      + [18, 28, 38].map(y => `<ellipse cx="32" cy="${y}" rx="2.6" ry="1.2" fill="none" stroke="#6e4705" stroke-width="1.3"/><ellipse cx="32" cy="${y}" rx="2.6" ry="1.2" fill="none" stroke="url(#${id('au')})" stroke-width=".8"/>`).join('')
      + `<path d="M10 16.4L28 14.8" stroke="#fff" stroke-width=".7" stroke-linecap="round" opacity=".6"/><rect x="15.6" y="47" width="32.8" height="1.8" rx=".5" fill="#8a5a0c"/>`];
  },
});

/* ── Anniversaire de Magic : ambiance (accueil) ─────────────────────────────────────────────────────────────────────────────────────────────
   Galerie du musée, la nuit : lueurs dorée et bleue qui respirent, deux faisceaux de projecteurs qui balaient doucement depuis le plafond, poussière d'or
   qui monte dans la lumière, deux cadres dorés vides accrochés au mur et deux fûts de colonnes estompés dans les coins du bas (fixes) ; ailleurs que
   l'accueil, une seule lueur dorée. Jour J (html[data-evphase="bday"]) : guirlande de fanions du mana sous l'en-tête (fixe) et deux ballons qui flottent.
   Éléments animés : 2 lueurs + 2 faisceaux + 6 grains de poussière (+ 2 ballons le jour J) = 10 (12). Styles : css/ev-magic.css. */
/** Cadre doré de musée, vide (viewBox 60 × 78) : moulure d'or, coins ornés, toile sombre, fil d'accrochage, cartel dessous. */
function evmWallFrame() {
  const n = ++EVO_N, id = s => `evm${n}${s}`, cr = (x, y, r) => `<g transform="translate(${x} ${y}) rotate(${r})"><path d="M0 0C3 0 5 1.4 5.4 4.2C4 3 2.6 2.8 1.6 3.4C2 2 1.4 .8 0 0Z" fill="#fff3c4" stroke="#8a5a0c" stroke-width=".4"/><circle cx="1.6" cy="1.6" r=".9" fill="#ffe58a" stroke="#8a5a0c" stroke-width=".3"/></g>`;
  return `<svg viewBox="0 0 60 78" aria-hidden="true" focusable="false"><defs>${evmMetal(id('au'), 0, 0, 60, 66)}<linearGradient id="${id('cv')}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2a2452" stop-opacity=".55"/><stop offset="1" stop-color="#12142a" stop-opacity=".7"/></linearGradient></defs>`
    + `<path d="M22 6L30 1L38 6" fill="none" stroke="#8a5a0c" stroke-width=".6"/><circle cx="30" cy="1.2" r="1" fill="#c48a1a"/>`
    + `<rect x="3" y="6" width="54" height="58" rx="1.2" fill="url(#${id('au')})" stroke="#6e4705" stroke-width=".7"/><rect x="7.4" y="10.4" width="45.2" height="49.2" fill="none" stroke="#fff3c4" stroke-width=".6" opacity=".7"/>`
    + `<rect x="9" y="12" width="42" height="46" fill="url(#${id('cv')})" stroke="#6e4705" stroke-width=".6"/><path d="M12 15L24 15M12 15V27" stroke="#fff" stroke-width=".5" opacity=".2"/>`
    + cr(4.4, 7.4, 0) + cr(55.6, 7.4, 90) + cr(55.6, 62.6, 180) + cr(4.4, 62.6, 270)
    + `<rect x="21" y="69" width="18" height="6" rx=".8" fill="url(#${id('au')})" stroke="#6e4705" stroke-width=".5"/><path d="M24 71.2H36M25.6 73H34.4" stroke="#7a4f06" stroke-width=".5"/></svg>`;
}
/** Fût de colonne cannelée, chapiteau et base (viewBox 40 × 160), pour les coins du bas de l'accueil. */
function evmColumnD() {
  const n = ++EVO_N, id = s => `evm${n}${s}`;
  return `<svg viewBox="0 0 40 160" preserveAspectRatio="xMidYMax meet" aria-hidden="true" focusable="false"><defs><linearGradient id="${id('c')}" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#b9aa8c"/><stop offset=".3" stop-color="#fffdf7"/><stop offset=".6" stop-color="#e3d8c4"/><stop offset="1" stop-color="#9f8f72"/></linearGradient></defs>`
    + `<path d="M2 8H38V14H2Z" fill="#f4eee2" stroke="#5e5040" stroke-width=".6"/><path d="M5 14H35L33 18H7Z" fill="#e3d8c4" stroke="#5e5040" stroke-width=".6"/><g fill="#f4eee2" stroke="#5e5040" stroke-width=".6"><circle cx="5" cy="12" r="3"/><circle cx="35" cy="12" r="3"/></g>`
    + `<path d="M8 18H32L33 146H7Z" fill="url(#${id('c')})" stroke="#5e5040" stroke-width=".6"/><path d="M13 20V144M18 20V145M23 20V145M28 20V144" stroke="#9c8c70" stroke-width=".6" opacity=".5"/>`
    + `<path d="M5 146H35V151H5ZM2 151H38V160H2Z" fill="#e3d8c4" stroke="#5e5040" stroke-width=".6"/></svg>`;
}
/** Ballon d'anniversaire (viewBox 24 × 56) : C [clair, moyen, foncé], fil. */
function evmBalloon(C) {
  const n = ++EVO_N;
  return `<svg viewBox="0 0 24 56" aria-hidden="true" focusable="false"><defs><radialGradient id="evm${n}b" cx=".36" cy=".3" r=".8"><stop offset="0" stop-color="#fff"/><stop offset=".25" stop-color="${C[0]}"/><stop offset=".7" stop-color="${C[1]}"/><stop offset="1" stop-color="${C[2]}"/></radialGradient></defs>`
    + `<path d="M12 30C14 34 9.6 38 12.6 43C15 47 10.6 51 12 55" fill="none" stroke="#8a7d66" stroke-width=".6"/>`
    + `<path d="M12 29C5.6 29 1.6 22 1.6 14.6C1.6 7.4 6.2 2 12 2S22.4 7.4 22.4 14.6C22.4 22 18.4 29 12 29Z" fill="url(#evm${n}b)" stroke="${C[2]}" stroke-width=".6"/>`
    + `<path d="M10.4 29L12 31L13.6 29Z" fill="${C[1]}" stroke="${C[2]}" stroke-width=".5"/><path d="M6.4 9.6Q8 5.6 12 5" fill="none" stroke="#fff" stroke-width="1.4" stroke-linecap="round" opacity=".8"/></svg>`;
}
/** Guirlande de fanions des cinq couleurs (viewBox 400 × 24, rognée sur les côtés). */
function evmBunting() {
  let s = ''; for (let i = 0; i < 20; i++) { const x = 6 + i * 19.6, y = 3 + 6 * Math.sin(Math.PI * ((i % 10) + .5) / 10), m = EVY_MANA[i % 5];
    s += `<path d="M${evoF(x)} ${evoF(y)}H${evoF(x + 13)}L${evoF(x + 6.5)} ${evoF(y + 13)}Z" fill="${m[2]}" stroke="${m[4]}" stroke-width=".6" stroke-linejoin="round"/>`; }
  return `<svg viewBox="0 0 400 24" preserveAspectRatio="xMidYMin slice" aria-hidden="true" focusable="false"><path d="M0 2Q100 16 200 2T400 2" fill="none" stroke="#8a5a0c" stroke-width=".8"/>${s}</svg>`;
}
EV_AMB.magic = () => '<i class="evm-glow evm-g1"></i><i class="evm-glow evm-g2"></i><i class="evm-glow evm-g3"></i>'
  + '<i class="evm-beam evm-bm1"></i><i class="evm-beam evm-bm2"></i>'
  + `<span class="evm-frame evm-fr1">${evmWallFrame()}</span><span class="evm-frame evm-fr2">${evmWallFrame()}</span>`
  + `<span class="evm-col evm-cl1">${evmColumnD()}</span><span class="evm-col evm-cl2">${evmColumnD()}</span>`
  + [1, 2, 3, 4, 5, 6].map(i => `<i class="evm-dust evm-d${i}"></i>`).join('')
  + `<span class="evm-bunt">${evmBunting()}</span><span class="evm-bal evm-bl1">${evmBalloon(['#ffc4ae', '#ff7a5c', '#b8301c'])}</span><span class="evm-bal evm-bl2">${evmBalloon(['#d6e8ff', '#7fb0ff', '#2f5aa8'])}</span>`;

/* Particules de la trouvaille : confetti doré, petite carte, gemmes du mana, étincelle d'or, lotus d'or, étiquette d'inventaire */
EV_FX.magic = () => [
  EVO_FXS('M5 8.6L17.6 5.2L19 10.4L6.4 13.8Z', '#f2c230', '<path d="M6 9.4L17.4 6.4" stroke="#fff6cc" stroke-width=".8"/>'),
  EVO_FXS('M7 3.6H17Q18.4 3.6 18.4 5V19Q18.4 20.4 17 20.4H7Q5.6 20.4 5.6 19V5Q5.6 3.6 7 3.6Z', '#1d1a24', '<rect x="7" y="5" width="10" height="14" rx=".6" fill="#4ea2f2"/><rect x="7.8" y="7" width="8.4" height="5" fill="#bfe2ff"/><rect x="7.8" y="13.4" width="8.4" height="4.4" fill="#f7f0dc"/>'),
  ...[0, 3, 4].map(i => { const m = EVY_MANA[i]; return EVO_FXS('M12 3L18.6 9.4L12 21L5.4 9.4Z', m[2], `<path d="M5.4 9.4H18.6M9 9.4L12 3L15 9.4L12 21Z" fill="none" stroke="${m[0]}" stroke-width=".7" opacity=".8"/>`); }),
  EVO_FXS(evnSpark(12, 12, 9.6), '#ffe58a', '<circle cx="12" cy="12" r="2" fill="#fff"/>'),
  EVO_FXS(evmPetal(12, 20, 17, 5, -90), '#f2c230', `<path d="${evmPetal(12, 20, 12, 3.6, -125)}${evmPetal(12, 20, 12, 3.6, -55)}" fill="#e0a82a" stroke="rgba(30,10,40,.55)" stroke-width=".7"/>`),
  EVO_FXS('M8 7.4L12 4L16 7.4V19Q16 20 15 20H9Q8 20 8 19Z', '#f2c230', '<circle cx="12" cy="7.6" r="1" fill="#6e4705"/><path d="M10 11.4H14M10 13.6H13" stroke="#6e4705" stroke-width=".8"/>'),
];

/** Couche du dessus de l'accueil (devant le contenu, ne capte aucun toucher) : 3 confettis qui tombent en voletant (chute, tournoiement), 1 serpentin
 *  (chute, balancement), 2 petites cartes qui virevoltent (chute, rotation) : 12 éléments animés. Bordés d'un trait plus foncé : visibles sur fond clair
 *  comme sur fond sombre. */
EV_AMB_TOP.magic = () => {
  const conf = (c, e, k) => `<svg class="evo evo-conf" viewBox="0 0 16 16" aria-hidden="true" focusable="false">${k ? `<circle cx="8" cy="8" r="4.4" fill="${c}" stroke="${e}" stroke-width=".8"/>`
    : `<path d="M3 5.4L12.6 3.6L13 7.6L3.4 9.4Z" fill="${c}" stroke="${e}" stroke-width=".8" stroke-linejoin="round"/>`}</svg>`;
  const card = (v, n = ++EVO_N) => { const m = EVY_MANA[v]; return `<svg class="evo evo-card" viewBox="0 0 20 28" aria-hidden="true" focusable="false"><defs><linearGradient id="evm${n}f" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${m[1]}"/><stop offset="1" stop-color="${m[3]}"/></linearGradient></defs>`
    + `<rect x="1" y="1" width="18" height="26" rx="2" fill="#1d1a24" stroke="#000" stroke-width=".5"/><rect x="2.4" y="2.4" width="15.2" height="23.2" rx=".8" fill="url(#evm${n}f)"/><rect x="3.4" y="4.6" width="13.2" height="8.6" fill="${m[0]}" stroke="${m[4]}" stroke-width=".4"/>`
    + `<path d="M3.4 11.4L7 8.4L9.6 10.4L13 7L16.6 10.6V13.2H3.4Z" fill="${m[2]}"/><rect x="3.4" y="15" width="13.2" height="8.6" fill="#f7f0dc" stroke="${m[4]}" stroke-width=".4"/><path d="M4.6 17.4H15.4M4.6 19.4H14M4.6 21.4H11" stroke="#8a7d66" stroke-width=".6"/></svg>`; };
  const C = [['#f2c230', '#8a5a05', 0], ['#ff7a5c', '#8a2a1a', 1], ['#7fb0ff', '#1f4f99', 0]];
  return C.map(([c, e, k], i) => `<span class="evm-cf evm-c${i + 1}"><span class="evm-cf-s">${conf(c, e, k)}</span></span>`).join('')
    + `<span class="evm-ser"><span class="evm-ser-s"><svg class="evo evo-ser" viewBox="0 0 16 48" aria-hidden="true" focusable="false"><path d="M8 2C14 6 2 10 8 14S2 22 8 26S2 34 8 38S4 44 8 46" fill="none" stroke="#8a2a1a" stroke-width="3.4" stroke-linecap="round"/><path d="M8 2C14 6 2 10 8 14S2 22 8 26S2 34 8 38S4 44 8 46" fill="none" stroke="#ff7a5c" stroke-width="2.2" stroke-linecap="round"/></svg></span></span>`
    + `<span class="evm-card evm-k1"><span class="evm-card-s">${card(1)}</span></span><span class="evm-card evm-k2"><span class="evm-card-s">${card(3)}</span></span>`;
};

if (typeof module !== 'undefined' && module.exports) module.exports = { EV_ART, EV_AMB, EV_AMB_TOP, EV_FX, EV_CONS, evGarland };
