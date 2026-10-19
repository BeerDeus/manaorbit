/* ── tour.js : « Visite guidée » (13 étapes, 14 sur ordinateur) et « Astuces » (bulles d'une fois) : où sont les fonctions importantes mais un peu cachées ──
   Visite : l'écran s'assombrit sauf un halo arrondi autour du vrai bouton ; une bulle (titre, une ou deux phrases) se place à côté, jamais dessus
   ni hors de l'écran ; « Suivant » / « Précédent », points de progression, « Passer » ; Échap, flèches, Retour du téléphone ; bulle = dialogue
   nommé, focus gardé dedans, étape annoncée aux lecteurs d'écran ; animations coupées si l'appareil réduit les animations.
   Étapes : Scanner (barre du bas) · Session d'ouverture (réglages du scan, ouverts en feuille : jamais la caméra) · lien et QR code (carte
   Échange de l'accueil) · Classeur (interrupteur de l'onglet Échange) · Échange en direct · Amis (bouton du compte) · Carte mystère, niveau et
   badges (icônes de l'en-tête) · Partie de Commander (carte de l'accueil) · Rangement (onglet de la collection : emplacements, « Ranger ces
   cartes… », proxys) · Masterset (interrupteur de l'onglet Cartes ; édition et foil d'une ligne, filtre Extension) · Scan mobile (ordinateur
   seulement : « + » de la collection) · Decks › À monter · Prix d'une liste · Partager en image (Stats), plus widgets et raccourcis (appli
   Android) ou l'installation (web). Étape sans objet (fonction coupée par le serveur, déconnecté, collection vide, APK ancienne, web) : texte
   adapté, ou étape sautée. À la fin, l'écran d'où l'on venait est remis (vue, section ouverte et son onglet, défilement) ; les feuilles
   ouvertes au départ (Aide…) restent fermées.
   Versions (TOUR_VER, v des étapes) : 1 = les 9 étapes du 13 octobre, 2 = celles du 19 octobre (Carte mystère, partie, rangement, masterset,
   scan mobile). Qui a déjà vu, refusé ou laissé passer une version précédente reçoit une fois la pastille « Découvre les nouveautés », qui ne
   montre que les étapes ajoutées depuis (jamais les anciennes) ; la visite complète reste dans l'aide.
   Proposée : nouvel utilisateur, une fois à la fin du premier lancement (onboard.js › obClose → tourOffer) : « Une visite de 2 min… ? » ;
   utilisateur existant, une fois après cette mise à jour : pastille « Découvre les nouveautés ». Seulement sur l'accueil au calme : ni scan,
   ni échange en direct, ni feuille, ni mode streamer (streamOn), ni lien ouvert de l'extérieur (?p=…). Toujours relançable : Aide (en tête)
   et Compte et réglages › Aide et avis.
   Astuces : une petite bulle, une seule fois, la première fois qu'on arrive sur l'écran (classeur de l'Échange, réglages et mode Auto du scan,
   « Ajouter en ami » de la liste d'un autre, « Partager en image » des Stats, « Ranger ces cartes… » d'un emplacement, options du masterset,
   filtre Extension, rond de l'édition d'une ligne) ; une seule à la fois, effacée au premier toucher ou après quelques secondes ; jamais pendant
   la visite, le mode streamer ou le premier lancement ; interrupteur « Astuces » dans Compte et réglages › Préférences.
   Collection vide : pas d'astuce « Tu viens de ManaBox ? », le lien de l'écran vide le dit déjà.
   État sur l'appareil seulement (deckdeal:tour) : offre faite, vue, refusée, étape atteinte, version, astuces vues. Rien au démarrage hormis un
   minuteur : tout se construit à la demande. Navigateurs pilotés par les tests : ni offre ni astuce, sauf avec ?tour (comme ?onboarding).
   Retirer : ôter 'tour.js' de build.mjs (les crochets « typeof tour… / tip… » de onboard, help, me, back, ads, collection, filters, scan et
   friends deviennent inertes), puis css/tour.css et i18n/*.tour.json. */
const TOUR_KEY = 'deckdeal:tour';
const TOUR_VER = 2;      // version de la visite : une étape ajoutée porte v: TOUR_VER (après l'avoir augmentée) et sera proposée seule aux anciens
const TOUR_FORCE = typeof location !== 'undefined' && /[?&]tour\b/.test(location.search);
/** Lancement par un lien, un raccourci, un partage (?p=, ?open=, ?troc=…) : pas de pastille pendant cette session. */
const TOUR_EXT = (() => { try { return [...new URLSearchParams(location.search).keys()].some(k => !['tour', 'onboarding', 'lang'].includes(k)); } catch (e) { return false; } })();
const TOUR = { on: false, el: null, b: null, hole: null, i: 0, steps: [], seq: 0, busy: false, raf: 0, key: '', back: null, sheet: null, st: null,
  boot: Date.now(), armT: 0, calm: 0, pill: null, pillK: '', from: '' };
const TIP = { t: 0, el: null, ring: null, id: '', tgt: null, top: null, io: null, raf: 0, key: '', end: 0, tries: 0 };

/* ── État (appareil) ─────────────────────────────────────────────────────────────────────────────────────────────── */
function tourRead() {
  if (!TOUR.st) { try { const o = JSON.parse(localStorage.getItem(TOUR_KEY) || '{}'); TOUR.st = o && typeof o === 'object' && !Array.isArray(o) ? o : {}; } catch (e) { TOUR.st = {}; } }
  return TOUR.st;
}
function tourSet(patch) {
  const o = Object.assign(tourRead(), patch);
  try { localStorage.setItem(TOUR_KEY, JSON.stringify(o)); } catch (e) { /* stockage indisponible : l'état vaut pour cette session */ }
  return o;
}
/** Offres et astuces automatiques permises (navigateur piloté par un test : seulement avec ?tour). */
const tourAuto = () => TOUR_FORCE || !(typeof navigator !== 'undefined' && navigator.webdriver);
const tourOn = () => TOUR.on;
const tourStream = () => typeof streamOn === 'function' && !!streamOn();
const tourNb = s => (typeof helpNb === 'function' ? helpNb(s) : s).replace(/ › /g, '\u00a0› ').replace(/(\d) (?=min)/g, '$1\u00a0');      // espaces insécables du français (help.js) ; « Compte et réglages › Amis » ne se coupe pas avant ›
const tourWait = ms => new Promise(r => setTimeout(r, typeof reduceMotion === 'function' && reduceMotion() ? Math.min(ms, 40) : ms));
const tourFrames = (n = 2) => new Promise(r => { const f = k => (k ? requestAnimationFrame(() => f(k - 1)) : r()); f(n); });
/** Hauteur de la bande du haut (appli plein écran : --top-in, posée en marge haute de <html>). */
const tourTopIn = () => parseFloat(getComputedStyle(document.documentElement).paddingTop) || 0;

/* ── Les étapes ──────────────────────────────────────────────────────────────────────────────────────────────────────
   at : écran à montrer ('home', 'scs' = réglages du scan par-dessus l'accueil, 'trade', 'places', 'list', 'input', 'stats') ; el : cible(s) (le halo
   les entoure toutes) ; ok : l'étape a un sens ici ; fixed : cible toujours à l'écran (barre du bas, en-tête), rien à faire défiler ; maxH : hauteur
   du halo au plus ; v : version de la visite qui l'a ajoutée (1 sans rien). */
const TOUR_STEPS = [
  { id: 'scan', at: 'home', fixed: true, r: 34, el: () => [$('#nav .nav-scan .nav-foil'), $('#nav .nav-scan .nav-l')],
    t: () => T('Scanner tes cartes'),
    x: () => T('Touche ce rond et vise le nom de la carte : elle rejoint ta collection. En haut de l\'écran du scan : ses réglages (édition, mode Auto) et la lampe.') },
  { id: 'opening', at: 'scs', ok: () => typeof scsSheet === 'function' && typeof opnScsRow === 'function', el: () => $('.scs-sheet.open .opn-scs'),
    t: () => T('Session d\'ouverture'),
    x: () => T('Tu ouvres des boosters ou une boîte, en stream ou non ? Lance une session ici (Scan › Réglages) : prix payé, mode streamer qui cache ta collection.'),
    x2: () => T('À la fin : le bilan (gain ou perte, meilleures cartes), une image à partager, et l\'historique dans « Mes ouvertures ».') },
  { id: 'trade', at: 'home', el: () => $('#hmTrade .hm-tr-acts'),
    t: () => T('Ta liste d\'échange'),
    x: () => (D.user ? T('Ton lien public et son QR code, à montrer à un autre joueur : il voit tes doublons et les cartes que tu cherches, toujours à jour.')
      : T('Avec un compte, crée ton lien public et son QR code : un autre joueur voit tes doublons et les cartes que tu cherches.')) },
  { id: 'binder', at: 'trade', el: () => tourIn('#trView') || tourIn('#trSub'),
    t: () => T('Classeur'),
    x: () => (tourIn('#trView') ? T('Liste ou classeur : ici, tes cartes deviennent des pages de 9 à feuilleter. En classeur, « Personnaliser » choisit sa couleur, les cartes épinglées et le tri.')
      : T('Dès que ta liste a des cartes, un interrupteur au-dessus la passe en classeur : des pages de 9 à feuilleter, à personnaliser (couleur, cartes épinglées, tri).')) },
  { id: 'live', at: 'trade', ok: () => typeof trocEntry === 'function' && !!(CTX.proxy && CTX.troc), el: () => tourIn('.trc-entry') || tourIn('.tr-box'),
    t: () => T('Échange en direct'),
    x: () => (D.user ? T('Face à face, chacun sur son téléphone : QR code ou code à 6 caractères. Chacun choisit ses cartes, vous validez tous les deux, et vos collections sont mises à jour.')
      : T('Avec un compte : un échange face à face, chacun sur son téléphone (QR code ou code à 6 caractères). Vous validez tous les deux, vos collections sont mises à jour.')) },
  { id: 'friends', at: 'home', fixed: true, ok: () => typeof amSheet === 'function' && !!(CTX.proxy && CTX.amis), el: () => $('#btnAccount'),
    t: () => T('Amis'),
    x: () => (D.user ? T('Sur la liste d\'échange d\'un autre joueur, touche « Ajouter en ami ». Tes demandes et tes amis sont ici : Compte et réglages › Amis.')
      : T('Avec un compte : « Ajouter en ami » sur la liste d\'échange d\'un autre joueur, puis tes demandes et tes amis ici, dans Compte et réglages › Amis.')) },
  { id: 'mystery', v: 2, at: 'home', fixed: true, r: 16, ok: () => typeof dlyOn === 'function' && dlyOn(), el: () => $('#dlyHbs'),
    t: () => T('Carte mystère'),
    x: () => (D.user ? T('Une carte par jour, la même pour tous : devine-la pendant qu\'elle se dévoile, le plus vite possible. Le podium ouvre les classements.')
      : T('Avec un compte : une carte par jour, la même pour tous, à deviner pendant qu\'elle se dévoile. Le podium ouvre les classements.')),
    x2: () => (typeof prgPill === 'function' ? T('Scans, decks, parties, échanges : tout fait monter ton niveau et gagner des badges. Ils sont dans Compte et réglages, pastille « Niv. ».') : '') },
  { id: 'partie', v: 2, at: 'home', ok: () => typeof puGo === 'function', el: () => $('#hmPartie'),
    t: () => T('Partie de Commander'),
    x: () => (D.user && CTX.partie ? T('Le compteur de vie de la table, jusqu\'à 8 joueurs : blessures de commandant, poison, monarque. Les autres rejoignent avec le QR code, et la partie s\'enregistre chez chacun.')
      : T('Le compteur de vie de la table, jusqu\'à 8 joueurs : blessures de commandant, poison, monarque, et l\'historique de tes parties.')) },
  { id: 'places', v: 2, at: 'places', ok: () => typeof plcTabHtml === 'function', el: () => tourIn('#collSeg [data-v="places"]'),
    t: () => T('Rangement'),
    x: () => T('Classeurs, boîtes, pile à vendre : note où est chaque carte. Touche un emplacement pour voir ses cartes, et « Ranger ces cartes… » les déplace toutes d\'un coup.'),
    x2: () => T('Au scan, « Ranger dans » les range tout de suite. Tes proxys ont leur liste à part, jamais dans la valeur ni l\'échange.') },
  { id: 'masterset', v: 2, at: 'list', ok: () => typeof msBarHtml === 'function', el: () => tourIn('.coll-ms:not([hidden])') || tourIn('#collSeg [data-v="list"]'),
    t: () => T('Masterset'),
    x: () => (tourIn('.coll-ms:not([hidden])') ? T('Une extension à la fois, toutes ses cartes dans l\'ordre : en couleur celles que tu as, en noir et blanc celles qui manquent, avec leur prix. La roue crantée règle le foil, les variantes, le playset.')
      : T('Dès que tu as des cartes, l\'onglet Cartes a un interrupteur Masterset : une extension à la fois, en couleur celles que tu as, en noir et blanc celles qui manquent.')),
    x2: () => T('Le rond à gauche de la quantité choisit l\'édition exacte d\'une carte, et si elle est foil ✦. Filtres › Extension n\'en affiche qu\'une.') },
  { id: 'mobile', v: 2, at: 'list', fixed: true, ok: () => typeof mobPcLike === 'function' && mobPcLike(), el: () => tourIn('.coll-tools [data-act="add"]'),      // ordinateur : le téléphone scanne pour lui (mobscan.js)
    t: () => T('Scan mobile'),
    x: () => T('« + » ouvre « Ajouter des cartes » : active le scan mobile, puis scanne avec ton téléphone connecté au même compte. Chaque carte arrive ici.') + (D.user ? '' : ' ' + T('Il faut un compte.')) },
  { id: 'build', at: 'input', el: () => $('#inTabs .dk-tab[data-dtab="build"]'),
    t: () => T('Decks › À monter'),
    x: () => (CTX.pub ? T('Les decks Commander que ta collection monte presque, avec les cartes qui manquent et leur prix. Et Communauté : les decks publiés par les joueurs.')
      : T('Les decks Commander que ta collection monte presque, avec les cartes qui manquent et leur prix.')) + (D.user ? '' : ' ' + T('Il faut un compte.')) },
  { id: 'price', at: 'input', maxH: 132, el: () => [$('#viewInput .field-head'), $('#deckText')],
    t: () => T('Prix d\'une liste'),
    x: () => T('Colle une decklist (EDHREC, Moxfield, Archidekt…) : le prix de chaque carte, sans celles que tu as déjà, ou le panier CardTrader le moins cher.') },
  { id: 'more', at: () => (collCount() ? 'stats' : 'home'), fixed: () => !collCount(), el: () => (collCount() ? tourIn('[data-act="simgcoll"]') : $('#nav [data-nav="coll"] .nav-i')),
    t: () => T('Partager en image'),
    x: () => T(collCount() ? 'Stats, deck, liste d\'échange, bilan d\'ouverture : « Partager en image » en fait une belle image à envoyer ou à publier.'
      : 'Collection › Stats, deck, liste d\'échange, bilan d\'ouverture : « Partager en image » en fait une belle image à envoyer ou à publier.'),
    x2: () => {
      if (typeof isNativeApp === 'function' && isNativeApp()) return (typeof natPlugin === 'function' && natPlugin('ManaOrbit') ? T('Sur Android : les widgets Mana Orbit (valeur, QR code d\'échange) sur l\'écran d\'accueil, et un appui long sur l\'icône de l\'appli pour ses raccourcis.')
        : T('Sur Android : un appui long sur l\'icône de l\'appli ouvre ses raccourcis (Scanner, Prix rapide, Échange).'));
      const st = typeof PWA !== 'undefined' ? PWA.state() : '';
      return ['ready', 'ios', 'manual'].includes(st) ? T('Installe aussi l\'appli : Compte et réglages › Application.') : '';
    } },
];
/** Élément de la section ouverte (dessus de la pile) : jamais celui d'un écran en train de se fermer. */
const tourIn = sel => { const top = typeof navTopDv === 'function' ? navTopDv() : null; return top ? $(sel, top) : null; };

/* ── Lancer, aller d'une étape à l'autre, finir ─────────────────────────────────────────────────────────────────────── */
/** Lance la visite. o.from : 'help', 'pill', 'new'… (statistique locale) ; o.since : version déjà vue (seulement les étapes ajoutées après).
 *  Faux si elle ne peut pas démarrer. */
function tourStart(o = {}) {
  if (TOUR.on || (typeof OB !== 'undefined' && OB.el)) return false;
  if (tourStream()) { toast(T('Visite guidée indisponible en mode streamer')); return false; }
  const other = $$('body > .dv.on').filter(d => !d.classList.contains('sec'));
  if (other.length || (typeof SC !== 'undefined' && SC.el) || (typeof imgView !== 'undefined' && imgView)) { toast(T('Ferme cet écran pour lancer la visite')); return false; }
  const steps = TOUR_STEPS.filter(s => { try { return (s.v || 1) > (o.since || 0) && (!s.ok || s.ok()); } catch (e) { return false; } });
  if (!steps.length) return false;      // nouveautés toutes coupées par le serveur : rien à montrer
  tourPillHide(); tipHide();
  // où l'on est : remis à la fin (la section ouverte, son onglet, le défilement)
  const top = navTopDv(), sc = top ? $('.dv-scroll', top) : null;
  TOUR.back = { view: S.view, y: window.scrollY, ctab: COLL.ctab, sy: sc ? sc.scrollTop : 0, focus: document.activeElement,
    sec: COLL.el && top === COLL.el ? { k: 'coll', tab: COLL.tab } : typeof DKS !== 'undefined' && DKS.el && top === DKS.el ? { k: 'dks' } : null };
  while (sheets.length) sheets[sheets.length - 1].close();
  TOUR.steps = steps; TOUR.on = true; TOUR.from = o.from || ''; TOUR.key = ''; TOUR.busy = false;
  tourSet({ runs: (tourRead().runs || 0) + 1, last: Date.now() });
  tourBuild();
  window.addEventListener('keydown', tourKey, true);
  document.addEventListener('focusin', tourFocusIn, true);
  if (typeof adsRefresh === 'function') adsRefresh();      // bandeau de pub (appli Android) : masqué pendant la visite (ads.js › adsBusy)
  TOUR.raf = requestAnimationFrame(tourLoop);
  tourGo(0);
  return true;
}
function tourBuild() {
  const n = TOUR.steps.length;
  const el = TOUR.el = document.createElement('div'); el.className = 'tour';
  el.innerHTML = `<div class="tour-hole" aria-hidden="true"></div>
    <div class="tour-b" role="dialog" aria-modal="true" aria-labelledby="tourT" aria-describedby="tourX" tabindex="-1">
      <span class="tour-ar" aria-hidden="true"></span>
      <div class="tour-hd"><span class="tour-dots" aria-hidden="true">${'<i></i>'.repeat(n)}</span><button class="link-btn tour-skip" type="button" data-tour="skip">${T('Passer')}</button></div>
      <h2 class="tour-t" id="tourT"></h2><div class="tour-x" id="tourX"></div>
      <div class="tour-ft"><button class="btn ghost small" type="button" data-tour="prev">${T('Précédent')}</button><button class="btn small" type="button" data-tour="next">${T('Suivant')}</button></div>
      <p class="tour-sr" aria-live="polite"></p></div>`;
  TOUR.b = $('.tour-b', el); TOUR.hole = $('.tour-hole', el);
  el.addEventListener('click', e => {
    const b = e.target.closest('[data-tour]'); if (!b) return;
    haptic('tap');
    if (b.dataset.tour === 'skip') tourEnd('skip');
    else if (b.dataset.tour === 'next') tourNext(1);
    else if (b.dataset.tour === 'prev') tourNext(-1);
  });
  el.addEventListener('wheel', e => e.preventDefault(), { passive: false });      // l'écran sous la visite ne défile pas
  document.body.appendChild(el);
  requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('on')));
}
function tourNext(d) {
  if (!TOUR.on || TOUR.busy) return;
  const i = TOUR.i + d;
  if (i < 0) return;
  if (i >= TOUR.steps.length) { tourEnd('done'); return; }
  tourGo(i);
}
async function tourGo(i) {
  const seq = ++TOUR.seq, s = TOUR.steps[i]; TOUR.i = i; TOUR.busy = true;
  TOUR.b.classList.remove('on');
  try {
    await tourAt(typeof s.at === 'function' ? s.at() : s.at);
    if (seq !== TOUR.seq || !TOUR.on) return;
    await tourFrames(2);
    const el = tourEls(s)[0], fixed = typeof s.fixed === 'function' ? s.fixed() : s.fixed;
    if (el && !fixed) {      // cible hors de la zone utile (sous l'en-tête, sous la barre du bas) : on la ramène au milieu
      const r = el.getBoundingClientRect(), top = tourTopIn() + 64, bot = innerHeight - (document.body.classList.contains('nav-on') ? 88 : 16);
      if (r.top < top || r.bottom > bot) { el.scrollIntoView({ block: 'center', inline: 'nearest' }); await tourFrames(2); }
    }
    if (seq !== TOUR.seq || !TOUR.on) return;
    tourPaint(s);
    TOUR.key = ''; TOUR.busy = false; tourLoop(true);
    TOUR.b.classList.add('on');
    const nx = $('[data-tour="next"]', TOUR.b); if (nx) nx.focus({ preventScroll: true });
    const st = tourRead(); if ((st.step || 0) < i + 1) tourSet({ step: i + 1 });      // étape la plus loin atteinte
  } finally { if (seq === TOUR.seq) TOUR.busy = false; }
}
/** Texte et boutons de l'étape. */
function tourPaint(s) {
  const n = TOUR.steps.length, i = TOUR.i, b = TOUR.b, x2 = s.x2 ? s.x2() : '';
  $('.tour-t', b).textContent = s.t();
  $('.tour-x', b).innerHTML = `<p>${esc(tourNb(s.x()))}</p>${x2 ? `<p class="tour-x2">${esc(tourNb(x2))}</p>` : ''}`;
  $$('.tour-dots i', b).forEach((d, k) => d.classList.toggle('on', k === i));
  const pv = $('[data-tour="prev"]', b), nx = $('[data-tour="next"]', b);
  pv.hidden = i === 0; nx.textContent = i === n - 1 ? T('Terminer') : T('Suivant');
  b.dataset.step = s.id;
  $('.tour-sr', b).textContent = T('Étape {i} sur {n}', { i: i + 1, n }) + '. ' + s.t() + '. ' + s.x() + (x2 ? ' ' + x2 : '');
}
/** Amène l'écran voulu (feuille, section, vue), sans jamais ouvrir la caméra. */
async function tourAt(w) {
  if (w !== 'scs' && TOUR.sheet) { const a = TOUR.sheet; TOUR.sheet = null; a.close(); await tourWait(180); }
  if (w === 'home' || w === 'scs') {
    let moved = false;
    if (COLL.el || (typeof DKS !== 'undefined' && DKS.el)) { navCloseSections(); moved = true; }
    if (S.view !== 'home') { showView('home'); moved = true; }
    if (moved) await tourWait(280);
    if (w === 'scs' && (!TOUR.sheet || sheets.indexOf(TOUR.sheet) < 0)) { scsSheet(); TOUR.sheet = sheets[sheets.length - 1] || null; await tourWait(120); }
  } else if (w === 'trade') {
    if (!(COLL.el && COLL.mode === 'trade')) { navOpen(() => openCollection('trade')); await tourWait(320); }
  } else if (w === 'stats' || w === 'places' || w === 'list') {      // un onglet de « Ma collection » (Stats, Rangement, Cartes) ; déjà ouverte : l'onglet change sur place
    if (COLL.el && COLL.mode === 'coll') {
      if (COLL.tab !== w) { COLL.tab = COLL.ctab = w; const sg = $('#collSeg', COLL.el), sc = $('.dv-scroll', COLL.el); if (sg && sg.setValue) sg.setValue(w); collPaintBody(false); if (sc) sc.scrollTop = 0; await tourWait(120); }
    } else { navOpen(() => openCollection(w)); await tourWait(320); }
  } else if (w === 'input') {
    if (COLL.el || (typeof DKS !== 'undefined' && DKS.el)) { navCloseSections(); await tourWait(280); }
    if (S.view !== 'input') { showView('input'); await tourWait(140); }
  }
}
/** Fin de la visite : 'done' (Terminer), 'skip' (Passer, Échap, Retour). L'écran de départ revient. */
function tourEnd(how) {
  if (!TOUR.on) return;
  TOUR.on = false; TOUR.seq++; TOUR.busy = false; cancelAnimationFrame(TOUR.raf); TOUR.raf = 0;
  window.removeEventListener('keydown', tourKey, true); document.removeEventListener('focusin', tourFocusIn, true);
  const el = TOUR.el; TOUR.el = TOUR.b = TOUR.hole = null;
  if (el) { el.classList.remove('on'); setTimeout(() => el.remove(), typeof reduceMotion === 'function' && reduceMotion() ? 0 : 260); }
  if (TOUR.sheet) { const a = TOUR.sheet; TOUR.sheet = null; a.close(); }
  tourSet(how === 'done' ? { fin: Date.now(), done: tourRead().done || Date.now(), ver: TOUR_VER } : { skip: Date.now(), done: tourRead().done || Date.now(), ver: TOUR_VER });      // ver : cette version est vue, pas de pastille pour elle
  tourRestore();
  if (typeof adsRefresh === 'function') adsRefresh();
  if (how === 'done') toast(T('Visite terminée. Tu la retrouves dans « Comment ça marche ? », en bas de l\'accueil.'));
}
/** Remet l'écran d'avant la visite : section et onglet, vue, défilement, focus. */
function tourRestore() {
  const b = TOUR.back; TOUR.back = null; if (!b) return;
  const sec = b.sec;
  if (sec && sec.k === 'coll') { if (!(COLL.el && COLL.tab === sec.tab)) navOpen(() => openCollection(sec.tab)); }
  else if (sec && sec.k === 'dks') { if (!DKS.el) navOpen(() => openDecks()); }
  else { navCloseSections(); if (S.view !== b.view) showView(b.view); }
  COLL.ctab = b.ctab;      // l'onglet que « Collection » rouvrira (la visite a pu passer par les Stats)
  tourFrames(3).then(() => {
    if (sec) { const top = navTopDv(), sc = top ? $('.dv-scroll', top) : null; if (sc) sc.scrollTop = b.sy; }
    else window.scrollTo({ top: b.y, behavior: 'auto' });
    const f = b.focus && b.focus.isConnected && b.focus !== document.body ? b.focus : sec ? $('.dv-back', navTopDv() || document) : $('#btnHelp');
    try { if (f && f.focus) f.focus({ preventScroll: true }); } catch (e) { /* ignore */ }
  });
}
/** Retour du téléphone (back.js) : quitte la visite ; ferme une astuce sans consommer le geste. */
function tourBack() {
  if (TOUR.on) { tourEnd('skip'); return true; }
  if (TIP.el) tipHide();
  return false;
}
function tourKey(e) {
  if (!TOUR.on) return;
  const k = e.key;
  if (k === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); tourEnd('skip'); }
  else if (k === 'ArrowRight' || k === 'ArrowLeft') { e.preventDefault(); e.stopImmediatePropagation(); tourNext(k === 'ArrowRight' ? 1 : -1); }
  else if (k === 'Tab') {      // le focus reste dans la bulle
    const f = $$('button:not([hidden]):not([disabled])', TOUR.b), i = f.indexOf(document.activeElement); if (!f.length) return;
    e.preventDefault(); e.stopImmediatePropagation();
    f[e.shiftKey ? (i <= 0 ? f.length - 1 : i - 1) : (i < 0 || i === f.length - 1 ? 0 : i + 1)].focus();
  }
}
/** Une feuille ouverte par la visite prend le focus : il revient dans la bulle. */
function tourFocusIn(e) {
  if (!TOUR.on || !TOUR.b || TOUR.b.contains(e.target)) return;
  const nx = $('[data-tour="next"]', TOUR.b); if (nx) setTimeout(() => { if (TOUR.on && TOUR.b && !TOUR.b.contains(document.activeElement)) nx.focus({ preventScroll: true }); }, 0);
}

/* ── Placement : halo autour de la cible, bulle à côté (jamais dessus, jamais hors de l'écran) ─────────────────────────── */
const tourEls = s => { let l; try { l = s.el(); } catch (e) { l = null; } return (Array.isArray(l) ? l : [l]).filter(x => x && x.isConnected); };
/** Rectangle du halo : toutes les cibles, une marge autour ; null sans cible visible. */
function tourRect(s) {
  let l = Infinity, t = Infinity, r = -Infinity, b = -Infinity;
  for (const e of tourEls(s)) { const x = e.getBoundingClientRect(); if (!x.width || !x.height) continue; l = Math.min(l, x.left); t = Math.min(t, x.top); r = Math.max(r, x.right); b = Math.max(b, x.bottom); }
  if (l === Infinity) return null;
  const p = 6, vw = innerWidth, vh = innerHeight, R = { x: Math.max(4, l - p), y: t - p, w: 0, h: 0 };
  R.w = Math.min(vw - 4, r + p) - R.x; R.h = Math.min(b + p - R.y, s.maxH || vh * 0.34);
  return R.w > 0 && R.h > 0 && R.y < vh && R.y + R.h > 0 ? R : null;
}
/** Suit la cible (écran qui s'ouvre, défilement, rotation) : repeint seulement quand quelque chose bouge. */
function tourLoop(now) {
  if (now !== true) TOUR.raf = requestAnimationFrame(tourLoop);
  if (!TOUR.on || TOUR.busy || !TOUR.b) return;
  const s = TOUR.steps[TOUR.i], R = s ? tourRect(s) : null;
  const key = (R ? [R.x, R.y, R.w, R.h].map(Math.round).join() : '-') + '|' + innerWidth + 'x' + innerHeight + '|' + TOUR.b.offsetHeight;
  if (key === TOUR.key) return; TOUR.key = key;
  tourPlace(R, s);
}
function tourPlace(R, s) {
  const b = TOUR.b, hole = TOUR.hole, vw = innerWidth, vh = innerHeight, m = 12, gap = 14, ti = tourTopIn();
  const w = Math.min(360, vw - 2 * m); b.style.width = w + 'px';
  const h = b.offsetHeight;
  let x = (vw - w) / 2, y = Math.max(ti + m, (vh - h) / 2), side = '';
  if (R) {
    const above = R.y - gap - (ti + m), below = vh - m - (R.y + R.h + gap), up = R.y + R.h / 2 > vh / 2;      // cible en bas : bulle au-dessus de préférence
    side = up ? (above >= h || above >= below ? 'up' : 'down') : (below >= h || below >= above ? 'down' : 'up');
    y = side === 'up' ? Math.max(ti + m, R.y - gap - h) : Math.min(vh - m - h, R.y + R.h + gap);
    x = Math.max(m, Math.min(vw - w - m, R.x + R.w / 2 - w / 2));
    const els = s ? tourEls(s) : [], br = els.length === 1 ? parseFloat(getComputedStyle(els[0]).borderTopLeftRadius) : NaN;      // halo arrondi comme la cible (+ sa marge)
    const r = Math.min(s && s.r ? s.r : Number.isFinite(br) ? Math.max(10, br + 6) : 14, R.h / 2, R.w / 2);
    Object.assign(hole.style, { left: R.x + 'px', top: R.y + 'px', width: R.w + 'px', height: R.h + 'px', borderRadius: r + 'px' });
    hole.classList.add('ring');
    $('.tour-ar', b).style.left = Math.max(20, Math.min(w - 20, R.x + R.w / 2 - x)) + 'px';
  } else {
    Object.assign(hole.style, { left: vw / 2 + 'px', top: vh / 2 + 'px', width: '0px', height: '0px', borderRadius: '0px' });
    hole.classList.remove('ring');
  }
  b.dataset.side = side;
  b.style.transform = `translate(${Math.round(x)}px,${Math.round(y)}px)`;
}

/* ── Offre : nouvel utilisateur (fin du premier lancement), utilisateur existant (une fois après la mise à jour) ─────────── */
/** Fin du premier lancement (onboard.js › obClose) : « Une visite de 2 min pour trouver l'essentiel ? », dès que l'accueil est au calme. */
function tourOffer() {
  const st = tourRead(); if (st.offer || st.done) return;
  tourSet({ offer: 'new', ver: TOUR_VER });
  if (tourAuto()) tourArm();
}
/** Quelques secondes après le démarrage : utilisateur existant (premier lancement déjà passé) → pastille « Découvre les nouveautés », une fois ;
 *  visite d'une version précédente (vue, refusée, ou pastille laissée sans réponse) → la même pastille, une fois, pour les étapes ajoutées depuis. */
function tourBoot() {
  if (!tourAuto() || TOUR_EXT) return;
  let st = tourRead();
  if (st.offer && !st.done && st.shownAt && st.shownAt < TOUR.boot) st = tourSet({ done: Date.now(), how: 'exp' });      // déjà montrée à un lancement précédent : on n'insiste pas
  if (st.done && (st.ver || 1) < TOUR_VER) st = tourNews(st);
  if (st.done) return;
  if (st.offer) { tourArm(); return; }
  if ((typeof OB !== 'undefined' && OB.el) || typeof obSeen !== 'function' || !obSeen()) return;      // premier lancement en cours (obClose proposera), ou appareil jamais ouvert
  tourSet({ offer: 'news', ver: TOUR_VER }); tourArm();
}
/** Nouvelle offre des nouveautés : since = version déjà proposée (ses étapes ne seront pas rejouées) ; astuces vues et interrupteur gardés. */
function tourNews(st) {
  const o = { offer: 'news', since: st.ver || 1, ver: TOUR_VER };
  for (const k of ['tips', 'tipsOff', 'runs']) if (st[k] != null) o[k] = st[k];
  TOUR.st = {}; return tourSet(o);
}
/** L'accueil au calme : rien par-dessus (feuille, écran, scan, carte en grand, premier lancement), pas de mode streamer, appli au premier plan. */
function tourQuiet() {
  if (document.hidden || TOUR.on || (typeof OB !== 'undefined' && OB.el) || document.getElementById('splash') || tourStream()) return false;
  if (sheets.length || (typeof SC !== 'undefined' && SC.el) || (typeof imgView !== 'undefined' && imgView) || document.querySelector('body > .dv')) return false;
  return S.view === 'home';
}
/** Offre en attente : la pastille paraît après 1,2 s d'accueil au calme, se cache dès qu'autre chose passe devant, revient ensuite (même session). */
function tourArm() {
  if (TOUR.armT) return;
  const tick = () => {
    const st = tourRead();
    if (st.done || !st.offer) { tourPillHide(); clearInterval(TOUR.armT); TOUR.armT = 0; return; }
    if (!tourQuiet()) { TOUR.calm = 0; tourPillHide(); return; }
    if (!TOUR.calm) TOUR.calm = Date.now();
    if (Date.now() - TOUR.calm >= 1200 && !TOUR.pill) tourPillShow(st.offer);
  };
  TOUR.armT = setInterval(tick, 400);
}
function tourPillShow(kind) {
  if (!tourRead().shownAt) tourSet({ shownAt: Date.now(), ver: TOUR_VER });      // vue avec cette version : à son expiration, pas de nouvelle offre
  const el = TOUR.pill = document.createElement('aside'); TOUR.pillK = kind;
  el.className = 'tour-pill' + (kind === 'new' ? ' new' : ''); el.setAttribute('aria-label', T('Visite guidée'));
  el.innerHTML = kind === 'new'
    ? `<span class="tour-pill-i" aria-hidden="true"><svg class="logo"><use href="#i-logo"/></svg></span><span class="tour-pill-t" role="status">${esc(tourNb(T('Une visite de 2 min pour trouver l\'essentiel ?')))}</span>
      <span class="tour-pill-a"><button class="link-btn" type="button" data-tp="later">${T('Plus tard')}</button><button class="btn small" type="button" data-tp="go">${T('Visiter')}</button></span>`
    : `<span class="tour-pill-i" aria-hidden="true"><svg class="i"><use href="#i-star"/></svg></span><span class="tour-pill-t" role="status">${T('Découvre les nouveautés')}</span>
      <button class="btn small" type="button" data-tp="go">${T('Visiter')}</button><button class="tour-pill-x" type="button" data-tp="x" aria-label="${T('Fermer')}"><svg class="i"><use href="#i-close"/></svg></button>`;
  el.addEventListener('click', e => {
    const b = e.target.closest('[data-tp]'); if (!b) return;
    haptic('tap');
    const a = b.dataset.tp, since = tourRead().since; tourSet({ done: Date.now(), how: a, ver: TOUR_VER });
    tourPillHide(true);
    if (a === 'go') tourStart({ from: TOUR.pillK, since: TOUR.pillK === 'news' ? since : 0 });      // nouveautés : seulement les étapes ajoutées depuis la version déjà vue
    else if (a === 'later') toast(T('La visite t\'attend dans « Comment ça marche ? », en bas de l\'accueil.'));
  });
  document.body.appendChild(el);
  requestAnimationFrame(() => requestAnimationFrame(() => { if (TOUR.pill === el) el.classList.add('on'); }));
}
function tourPillHide(now) {
  const el = TOUR.pill; if (!el) return; TOUR.pill = null; TOUR.calm = 0;
  el.classList.remove('on'); setTimeout(() => el.remove(), now || (typeof reduceMotion === 'function' && reduceMotion()) ? 0 : 260);
}

/* ── Aide : « Visite guidée » en tête de « Comment ça marche », et dans Compte et réglages › Aide et avis ───────────────── */
const tourHelpHtml = () => `<button class="tour-help" type="button" data-help="tour"><span class="tour-help-i" aria-hidden="true"><svg class="i"><use href="#i-star"/></svg></span><span class="tour-help-t"><b>${T('Visite guidée')}</b><small>${tourNb(T('Où sont les fonctions importantes, en 2 minutes'))}</small></span><svg class="i" aria-hidden="true"><use href="#i-chev"/></svg></button>`;
const tourHelpBtn = () => `<button class="btn ghost small" type="button" data-help="tour">${T('Visite guidée')}</button>`;
if (typeof HELP_QA !== 'undefined') {
  const i = HELP_QA.findIndex(q => q[0] === 'Faut-il un compte ?');
  HELP_QA.splice(i < 0 ? HELP_QA.length : i, 0, ['Où sont les fonctions moins visibles ?', 'Touche <b>Visite guidée</b>, en haut de cette aide : en 2 minutes, elle montre le scan et la session d\'ouverture, ton lien d\'échange, le classeur, l\'échange en direct, les amis, la Carte mystère, la partie de Commander, le rangement, le masterset, les decks à monter, le prix d\'une liste et le partage en image. Les <b>astuces</b> (petites bulles, une fois par écran) se coupent dans Compte et réglages › Préférences.']);
}

/* ── Astuces : une bulle, une fois, la première fois qu'on arrive sur l'écran ─────────────────────────────────────────── */
/** id → [écran du dessus voulu, cible, texte]. Écran : vrai si la pile d'écrans (et ses réglages) lui correspond. */
const TIP_DEFS = {
  bnd: [top => typeof COLL !== 'undefined' && top === COLL.el && COLL.mode === 'trade' && !(typeof bndView === 'function' && bndView('o') === 'binder'), top => $('#trView', top), () => T('Passe en mode classeur ici : tes cartes en pages à feuilleter.')],
  opn: [top => typeof SC !== 'undefined' && top === SC.el && !SC.remote && typeof opnEntry === 'function' && !(typeof opnOn === 'function' && opnOn()), top => $('.sc-set', top), () => T('Tu ouvres des boosters ? Lance une session d\'ouverture ici.')],
  ami: [top => typeof TR !== 'undefined' && TR.pub && top === TR.pub.el, top => $('[data-am="add"]', top), () => T('Ajoute-le en ami : vous verrez vos listes, toujours à jour.')],
  simg: [top => typeof COLL !== 'undefined' && top === COLL.el && COLL.tab === 'stats', top => $('[data-act="simgcoll"]', top), () => T('Partage ta collection en image.')],
  // depuis la version 2 de la visite ; d'abord celles d'un écran précis (emplacement ouvert, masterset, filtres ouverts), puis le rond d'édition des lignes
  rng: [top => typeof COLL !== 'undefined' && top === COLL.el && COLL.mode === 'coll' && COLL.tab === 'list' && !!COLL.place, top => $('.plc-mv', top), () => T('Range d\'un coup toutes les cartes affichées ici : vers une boîte, un autre classeur… Filtre d\'abord pour n\'en prendre qu\'une partie.')],
  msopt: [top => typeof msActive === 'function' && top === COLL.el && msActive(), top => $('.ms-opt:not([hidden])', top), () => T('Les options du masterset : version foil, variantes, playset, langue.')],
  fset: [top => typeof COLL !== 'undefined' && top === COLL.el && COLL.mode !== 'decks', top => { const b = $('.fset', top); return b && !b.closest('[hidden]') ? b : null; }, () => T('Une seule extension à la fois : cherche-la par son nom, son code ou son année.')],      // panneau des filtres ouvert (filters.js)
  ed: [top => typeof COLL !== 'undefined' && top === COLL.el && COLL.mode === 'coll' && COLL.tab === 'list' && !(typeof msActive === 'function' && msActive()), top => $('.crow .row-ed', top), () => T('Touche ce rond : l\'édition exacte de ta carte, et foil ✦ ou non.')],
  auto: [top => typeof SC !== 'undefined' && top === SC.el && !SC.remote, top => $('.sc-auto:not([hidden])', top), () => T('Auto : pose tes cartes l\'une après l\'autre, le scan les lit tout seul.')],
};
const tipOff = () => !!tourRead().tipsOff;
/** Ligne « Astuces » de Compte et réglages › Préférences (me.js). */
const tipPrefRow = () => `<label class="me-row switch-row" for="setTips"><span class="me-t">${T('Astuces')}<small>${T('Petites bulles d\'aide, une fois par écran')}</small></span><span class="switch"><input type="checkbox" id="setTips" ${tipOff() ? '' : 'checked'}><i></i></span></label>`;
function tipPref(on) { tourSet({ tipsOff: !on }); if (!on) tipHide(); haptic('ok'); }
/** Un écran vient d'être peint (collection.js, scan.js, friends.js) : une astuce à montrer ? Sortie immédiate si toutes sont vues ou coupées. */
function tipSoon(ms = 700) {
  if (!tourAuto() || tipOff()) return;
  const seen = tourRead().tips || {}; if (Object.keys(TIP_DEFS).every(k => seen[k])) return;
  clearTimeout(TIP.t); TIP.t = setTimeout(tipCheck, ms); TIP.tries = 0;
}
const tipQuiet = () => !document.hidden && !TOUR.on && !(typeof OB !== 'undefined' && OB.el) && !tourStream() && !sheets.length && !(typeof imgView !== 'undefined' && imgView)
  && !(TOUR.pill && TOUR.pillK === 'new');      // l'offre de la visite d'abord
function tipCheck() {
  if (TIP.el || tipOff()) return;
  const top = navTopDv(); if (!top) return;
  const seen = tourRead().tips || {};
  let id = '', tgt = null;
  for (const [k, [scr, find]] of Object.entries(TIP_DEFS)) { if (seen[k]) continue; try { if (scr(top) && (tgt = find(top))) { id = k; break; } } catch (e) { /* écran pas prêt */ } }
  if (TIP.io) { TIP.io.disconnect(); TIP.io = null; }
  if (!id) return;
  if (!tipQuiet()) { if (TIP.tries++ < 6) TIP.t = setTimeout(tipCheck, 1500); return; }      // une feuille ouverte : on réessaie un peu plus tard
  // la cible doit être entièrement visible (ni sous l'en-tête, ni sous la barre du bas) : attendue en défilant si besoin
  TIP.io = new IntersectionObserver(es => {
    if (!es.some(x => x.isIntersecting && x.intersectionRatio > 0.98)) return;
    if (TIP.io) { TIP.io.disconnect(); TIP.io = null; }
    setTimeout(() => { if (!TIP.el && tgt.isConnected && navTopDv() === top && tipQuiet() && TIP_DEFS[id][0](top)) tipShow(id, tgt, top); }, 350);      // l'écran finit d'arriver
  }, { rootMargin: `0px 0px ${document.body.classList.contains('nav-on') ? -96 : 0}px 0px`, threshold: 1 });      // sous l'en-tête : coupée par la zone qui défile ; sous la barre du bas : marge
  TIP.io.observe(tgt);
}
function tipShow(id, tgt, top) {
  const tips = Object.assign({}, tourRead().tips, { [id]: Date.now() }); tourSet({ tips });      // vue : jamais deux fois
  const el = TIP.el = document.createElement('div'); el.className = 'tip'; el.setAttribute('role', 'status');
  el.innerHTML = `<span class="tip-ar" aria-hidden="true"></span><b>${T('Astuce')}</b> ${esc(tourNb(TIP_DEFS[id][2]()))}`;
  const ring = TIP.ring = document.createElement('div'); ring.className = 'tip-ring'; ring.setAttribute('aria-hidden', 'true');
  TIP.id = id; TIP.tgt = tgt; TIP.top = top; TIP.key = '';
  document.body.append(ring, el);
  tipPlace();
  requestAnimationFrame(() => requestAnimationFrame(() => { if (TIP.el === el) { el.classList.add('on'); ring.classList.add('on'); } }));
  // effacée au premier toucher (le toucher passe : la bulle ne bloque rien), à une touche, ou après quelques secondes
  TIP.end = Date.now() + 7000;
  setTimeout(() => { if (TIP.el === el) { document.addEventListener('pointerdown', tipHide, true); document.addEventListener('keydown', tipHide, true); } }, 250);
  // suit la cible à chaque image (l'écran se repeint : prix lus, synchro) ; elle est retrouvée si le repeint l'a remplacée
  const tick = () => {
    if (TIP.el !== el) return;
    if (!TIP.tgt.isConnected) { const t2 = top.isConnected ? TIP_DEFS[id][1](top) : null; if (t2) { TIP.tgt = t2; TIP.key = ''; } }
    if (Date.now() > TIP.end || !TIP.tgt.isConnected || navTopDv() !== top || !tipQuiet()) { tipHide(); return; }
    tipPlace(); TIP.raf = requestAnimationFrame(tick);
  };
  TIP.raf = requestAnimationFrame(tick);
}
function tipPlace() {
  const el = TIP.el, tgt = TIP.tgt; if (!el || !tgt) return;
  const r = tgt.getBoundingClientRect(), key = [r.left, r.top, r.width, r.height, innerWidth, innerHeight].map(Math.round).join();
  if (key === TIP.key) return; TIP.key = key;
  const vw = innerWidth, vh = innerHeight, m = 12, gap = 12, w = Math.min(280, vw - 2 * m);
  el.style.maxWidth = w + 'px';
  const bw = el.offsetWidth, bh = el.offsetHeight, below = vh - 96 - (r.bottom + gap) >= bh;
  const x = Math.max(m, Math.min(vw - bw - m, r.left + r.width / 2 - bw / 2)), y = below ? r.bottom + gap : Math.max(tourTopIn() + m, r.top - gap - bh);
  el.dataset.side = below ? 'down' : 'up';
  el.style.transform = `translate(${Math.round(x)}px,${Math.round(y)}px)`;
  $('.tip-ar', el).style.left = Math.max(14, Math.min(bw - 14, r.left + r.width / 2 - x)) + 'px';
  const br = parseFloat(getComputedStyle(tgt).borderTopLeftRadius);      // anneau arrondi comme la cible (bouton rond du scan, pastille « Ajouter en ami »)
  Object.assign(TIP.ring.style, { left: r.left - 4 + 'px', top: r.top - 4 + 'px', width: r.width + 8 + 'px', height: r.height + 8 + 'px', borderRadius: Math.min(Number.isFinite(br) ? br + 4 : 14, r.height / 2 + 4) + 'px' });
}
function tipHide() {
  clearTimeout(TIP.t); cancelAnimationFrame(TIP.raf); TIP.raf = 0;
  if (TIP.io) { TIP.io.disconnect(); TIP.io = null; }
  document.removeEventListener('pointerdown', tipHide, true); document.removeEventListener('keydown', tipHide, true);
  const el = TIP.el, ring = TIP.ring; TIP.el = TIP.ring = TIP.tgt = TIP.top = null; TIP.id = '';
  for (const x of [el, ring]) if (x) { x.classList.remove('on'); setTimeout(() => x.remove(), typeof reduceMotion === 'function' && reduceMotion() ? 0 : 220); }
}

// Un seul minuteur au démarrage : l'offre attend que l'appli soit lancée et calme (écran de lancement parti, premier lancement décidé).
if (typeof document !== 'undefined') setTimeout(tourBoot, 3500);
