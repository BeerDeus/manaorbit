/* ── event.js : événements saisonniers (chasse aux citrouilles d'Halloween…), côté appli ─────────────────────────────────────────────────────────
   Le serveur (event-srv.mjs) dit quelle fête est en cours (/__ping › event) et donne à chaque joueur ses cachettes du jour, signées ; les fêtes elles-mêmes
   sont des packs (evpacks.js : dates, objets, quota, textes), leurs dessins dans evart.js et css/ev-<pack>.css. Ajouter une fête ne touche pas à ce fichier.
   · Décor : <html data-event="<pack>"> pendant la fête ; .ev-deco (décorations allumées, Compte et réglages › Préférences) : ambiance (.ev-amb), logo de la fête
     (#i-logo, icône de l'onglet) ; .ev-quiet sur le scan, l'échange en direct et le compteur de vie (rien n'y apparaît) ; .ev-pause appli en arrière-plan ou écran
     plein par-dessus l'accueil. Dernière fête connue gardée sur l'appareil : posée dès l'écran de lancement (splash.js), sans attendre le serveur.
   · Chasse : les cachettes du jour (EV_HIDE : où les poser) reçoivent un objet (bouton, libellé pour les lecteurs d'écran) dans un coin libre de leur bloc : il ne
     recouvre jamais un bouton ni du texte (vérifié à l'écran, sinon une autre place, sinon rien). Jamais sur le scan, l'échange en direct, le compteur de vie, la
     saisie d'un token, pendant le premier lancement, la visite guidée ou le mode streamer. Toucher : l'objet s'envole au milieu de l'écran (agrandi, lueur, étincelles),
     puis rejoint le compteur « 🎃 12 / 30 » qui rebondit ; message « Bien vu ! Il te reste 3 citrouilles… », 5e du jour : « reviens demain », dernière : célébration.
     « Réduire les animations » coupe le mouvement, jamais l'objet.
   · Progression : serveur d'abord (quota, jetons) ; copie sur l'appareil (deckdeal:ev) et, avec un compte, dans users/{uid}/meta/events (le plus grand gagne ; reçus
     signés relus par le serveur s'il a perdu la sienne). Sans compte : invitation à en créer un ; à la connexion, la progression de l'appareil rejoint le compte.
   · Accueil : carte de la fête (compteur, objets du jour, jours restants, badges, indices) ; message d'arrivée la première fois ; badges « Événements » (progress.js).
   Rien au démarrage hors fête : une lecture du stockage local. */
const EV_KEY = 'deckdeal:ev', EV_DEV = 'deckdeal:ev:dev', EV_PK = 30, EV_POLL = 1200;
const EV = { cal: null, st: null, at: 0, busy: false, loop: 0, mt: 0, pks: new Map(), fly: 0, dev: '', ls: null, doc: null, unsub: null, uid: '', pend: false, tipT: 0, introT: 0, armT: 0, logo0: null, ico0: null, merged: '' };
const evPackOf = () => (EV.cal && typeof evPack === 'function' ? evPack(EV.cal.pack) : null);
const evOn = () => !!(EV.cal && evPackOf());
/** Textes du pack (français : clés de T). */
const evTx = (k, v) => { const p = evPackOf(), s = p && p.txt && p.txt[k]; return s ? T(s, v) : ''; };
const evObjN = (n, v) => { const p = evPackOf(); return p ? TN(n, '{n} ' + p.obj.one, '{n} ' + p.obj.many, v) : ''; };

/* ── Stockage de l'appareil : { cal, deco, seen: { édition: 1 }, o (compte), p: { édition: { jours, sig, n } } } ─────────────────────────── */
function evLs() { if (!EV.ls) { try { const o = JSON.parse(localStorage.getItem(EV_KEY) || '{}'); EV.ls = o && typeof o === 'object' && !Array.isArray(o) ? o : {}; } catch (e) { EV.ls = {}; } } return EV.ls; }
function evLsSet(patch) { Object.assign(evLs(), patch); try { localStorage.setItem(EV_KEY, JSON.stringify(EV.ls)); } catch (e) { /* stockage plein : gardé pour la session */ } }
const evDeco = () => evLs().deco !== false;
/** Progression gardée d'une édition (appareil). */
const evMine = id => ((evLs().p || {})[id]) || { jours: {}, sig: {}, n: 0, rs: 0 };
function evMineSet(id, x) { const p = { ...(evLs().p || {}) }; p[id] = { jours: x.jours || {}, sig: x.sig || {}, n: Math.max(0, x.n || 0), rs: x.rs || 0 }; evLsSet({ p }); }
/** Remise à zéro du serveur (panneau /admin) connue pour cette édition : les copies plus anciennes (appareil, compte) ne comptent plus. */
const evRs = id => (EV.st && EV.st.ev && EV.st.ev.id === id && EV.st.me ? EV.st.me.rs || 0 : 0);
const evFresh = (id, x) => !!x && (x.rs || 0) >= evRs(id);
/** Nombre trouvé d'une édition : le plus grand connu (serveur, appareil, compte). */
function evCount(id) {
  const m = evMine(id), dd = EV.doc && EV.doc[id], a = evFresh(id, m) ? m.n || 0 : 0, d = evFresh(id, dd) ? Number(dd.n) || 0 : 0, s = EV.st && EV.st.ev && EV.st.ev.id === id && EV.st.me ? EV.st.me.n : 0;
  return Math.max(a, d, s);
}

/* ── Décor ─────────────────────────────────────────────────────────────────────────────────────────────── */
/** Décor de la fête en cours (ou retiré) : data-event, .ev-deco, ambiance, logo, icône de l'onglet. */
function evApply() {
  const h = document.documentElement, p = evPackOf(), deco = !!p && evDeco();
  if (p) h.dataset.event = p.id; else delete h.dataset.event;
  h.classList.toggle('ev-deco', deco);
  let amb = document.querySelector('body > .ev-amb');
  if (deco && typeof EV_AMB !== 'undefined' && EV_AMB[p.id]) {
    if (!amb || amb.dataset.p !== p.id) { if (amb) amb.remove(); amb = document.createElement('div'); amb.className = 'ev-amb'; amb.dataset.p = p.id; amb.setAttribute('aria-hidden', 'true'); amb.innerHTML = EV_AMB[p.id](); document.body.appendChild(amb); }
  } else if (amb) amb.remove();
  let top = document.querySelector('body > .ev-amb-top');      // couche du dessus (pluie de feuilles…), si le pack en a une
  if (deco && typeof EV_AMB_TOP !== 'undefined' && EV_AMB_TOP[p.id]) {
    if (!top || top.dataset.p !== p.id) { if (top) top.remove(); top = document.createElement('div'); top.className = 'ev-amb-top'; top.dataset.p = p.id; top.setAttribute('aria-hidden', 'true'); top.innerHTML = EV_AMB_TOP[p.id](); document.body.appendChild(top); }
  } else if (top) top.remove();
  evLogo(deco ? p.id : '');
  evNatIcon(deco && EV.cal && !EV.cal.forced ? EV.cal : null);
  evQuietSync();
}
/** Icône de l'appli Android aux couleurs de la fête (APK 1.0.13 et plus : ManaOrbit.setIcon, appliquée au prochain passage en arrière-plan). Navigateur,
    PWA, APK plus ancienne : rien. Pas de fête, décorations coupées ou fête forcée (EVENT_FORCE, essais) : icône normale. until : minuit (Paris) après le
    dernier jour, retour automatique même appli fermée. Demandé une fois par changement (deckdeal:ev:icon). */
function evNatIcon(ev) {
  const mo = typeof natPlugin === 'function' ? natPlugin('ManaOrbit') : null; if (!mo || typeof mo.setIcon !== 'function') return;
  const pack = ev && typeof EV_LOGO !== 'undefined' && EV_LOGO[ev.pack] ? ev.pack : null, until = pack ? evNextMidnight(Date.parse(ev.to + 'T12:00:00Z')) : 0, key = (pack || '') + '|' + until;
  let last = null; try { last = localStorage.getItem(EV_KEY + ':icon'); } catch (e) { /* stockage refusé */ }
  if (last === key) return;
  Promise.resolve().then(() => mo.setIcon({ pack, until })).then(() => { try { localStorage.setItem(EV_KEY + ':icon', key); } catch (e) { /* stockage refusé */ } }).catch(() => {});      // fête inconnue de cette APK : refusé, icône normale
}
/** Logo de la fête dans #i-logo (en-tête, lancement, installation) et icône de l'onglet ; '' : le logo d'origine. Gardé pour l'écran de lancement suivant. */
function evLogo(id) {
  const sym = document.getElementById('i-logo'), mk = id && typeof EV_LOGO !== 'undefined' ? EV_LOGO[id] : '';
  if (sym) { if (EV.logo0 == null) EV.logo0 = sym.innerHTML; const want = mk || EV.logo0; if (sym.innerHTML !== want) sym.innerHTML = want; }
  try { if (mk) localStorage.setItem(EV_KEY + ':logo', JSON.stringify({ id, mk })); else localStorage.removeItem(EV_KEY + ':logo'); } catch (e) { /* stockage refusé */ }
  for (const l of document.querySelectorAll('link[rel="icon"]')) {
    if (!l.dataset.ev0) l.dataset.ev0 = l.getAttribute('href');
    const to = mk ? (l.type === 'image/svg+xml' ? `icons/events/${id}/icon.svg` : `icons/events/${id}/favicon-32.png`) : l.dataset.ev0;
    if (l.getAttribute('href') !== to) l.setAttribute('href', to);
  }
}
/** Écrans où rien ne doit apparaître ni bouger : scan, échange en direct, compteur de vie, éditions du scan. */
const evNoGo = () => !!document.querySelector('body > .dv.on.scan, body > .dv.on.trc, body > .dv.on.pu, body > .dv.on.sc-ef');
/** Chasse permise maintenant (en plus de evNoGo) : ni premier lancement, ni visite guidée, ni mode streamer, ni saisie d'un token, ni écran de lancement. */
function evHuntOk() {
  if (!evOn() || document.hidden || evNoGo() || document.getElementById('splash') || document.querySelector('.ev-intro, .ev-party')) return false;
  if ((typeof OB !== 'undefined' && OB.el) || (typeof TOUR !== 'undefined' && TOUR.on) || (typeof streamOn === 'function' && streamOn())) return false;
  const s = evSheetTop(); if (s && evSheetIs(s, 'Prix et CardTrader')) return false;
  return true;
}
function evQuietSync() {
  const h = document.documentElement, q = evNoGo(); h.classList.toggle('ev-quiet', q);
  h.classList.toggle('ev-pause', document.hidden || q || (!!(typeof navTopDv === 'function' && navTopDv())));      // écran plein par-dessus l'accueil : l'ambiance ne tourne pas pour rien
}

/* ── Cachettes : où poser l'objet ──────────────────────────────────────────────────────────────────────────────────
   Chaque cachette : une fonction → le bloc qui l'accueille (élément non interactif, à l'écran du dessus), ou null. L'objet se pose dans un coin libre du bloc. */
const evSheetTop = () => (typeof sheets !== 'undefined' && sheets.length ? sheets[sheets.length - 1] : null);
const evSheetIs = (s, title) => { const h = s && s.wrap.querySelector('.sheet-head h2'); return !!(h && h.textContent === T(title)); };
const evSheet = (title, sel) => { const s = evSheetTop(); return s && s.wrap.classList.contains('open') && evSheetIs(s, title) ? (sel ? s.body.querySelector(sel) : s.body) : null; };
const evSheetCls = (cls, sel) => { const s = evSheetTop(); return s && s.wrap.classList.contains('open') && s.wrap.classList.contains(cls) ? s.wrap.querySelector(sel) : null; };
/** Accueil à l'écran (rien par-dessus). */
const evHome = sel => (!evSheetTop() && !navTopDv() && typeof S !== 'undefined' && S.view === 'home' ? document.querySelector('#viewHome ' + sel) : null);
/** Écran plein du dessus (classe), sans feuille par-dessus. */
const evDv = (cls, sel, ok) => { const t = !evSheetTop() && navTopDv(); return t && t.classList.contains(cls) && (!ok || ok(t)) ? (sel ? t.querySelector(sel) : t) : null; };
const evColl = (mode, tab, sel) => evDv('coll', sel, t => typeof COLL !== 'undefined' && t === COLL.el && COLL.mode === mode && (!tab || COLL.tab === tab) && !t.classList.contains('pubv'));
const vis = el => (el && !el.closest('[hidden]') && el.getClientRects().length ? el : null);
/** Panneau des filtres ouvert (filtres.js) dans l'écran de la collection ; more : « Plus de filtres » déplié. */
const evFilt = (mode, more) => { const t = evColl(mode, ''); const pn = t && t.querySelector(more ? '.fmore-box' : '.fpanel'); return vis(pn); };
const EV_HIDE = {
  'home-orb': () => evHome('.hm-hero'), 'home-trade': () => evHome('#hmTrade'), 'home-life': () => vis(evHome('#hmPartie')) || evHome('#hmTrade'), 'home-sets': () => vis(evHome('#hmSets')), 'home-stores': () => vis(evHome('#hmStores')),
  'coll-list': () => evColl('coll', 'list', '.coll-main'), 'coll-stats': () => evColl('coll', 'stats', '.cs-tiles') || evColl('coll', 'stats', '.coll-main'), 'trade-list': () => evColl('trade', '', '.tr-list') || evColl('trade', '', '.coll-main'),
  'decks-mine': () => evDv('dks', '.dv-body') || evDv('dks', '.dv-head'), 'decks-edh': () => evColl('decks', '', '.coll-main'), 'me-head': () => evSheetCls('me-sheet', '.me-stats'), 'me-level': () => evSheetCls('prg-sheet', '.prg-head'),
  'help-top': () => evSheetCls('hp-sheet', '.hp-list'), 'daily-board': () => evDv('dly', '.dv-body', t => !t.classList.contains('dly-play')) || evDv('dly', '.dv-head', t => !t.classList.contains('dly-play')),
  'card-sheet': () => evSheetCls('cs-sheet', '.cs-hd'), 'viewer-head': () => evDv('dvw', '.dv-head'),
  'coll-filters': () => evFilt('coll'), 'coll-more': () => evFilt('coll', true), 'coll-view': () => evSheet('Affichage de la liste'), 'coll-backup': () => evSheet('Sauvegarde de la collection'),
  'coll-export': () => evSheet('Exporter ma collection'), 'coll-proxy': () => evSheet('Mes proxys'), 'coll-ms': () => evSheet('Options du masterset'),
  'trade-set': () => evSheet('Réglages de l\'échange'), 'trade-binder': () => evSheet('Mon classeur'), 'trade-filters': () => evFilt('trade'), 'decks-filters': () => evSheetCls('dkf-sheet', '.sheet-body') || evSheet('Filtres'), 'decks-themes': () => evSheet('Thèmes'), 'decks-pub': () => evSheet('Decks publiés'),
  'me-account': () => evSheet('Compte'), 'me-profile': () => evSheet('Profil'), 'set-notif': () => evSheet('Notifications'), 'set-scan': () => evSheetCls('scs-sheet', '.sheet-body') || evSheet('Réglages du scan'),
  'set-data': () => evSheet('Données de l\'appareil'), 'set-conf': () => evSheet('Confidentialité et mentions'), 'set-mentions': () => evSheet('Mentions et sources'), 'set-help': () => evSheet('Aide et avis', '#helpBox') || evSheet('Aide et avis'),
  'set-widget': () => evSheet('Widget'), 'set-alerts': () => evSheet('Alertes de prix'), 'help-faq': () => { const s = evSheetCls('hp-sheet', '.sheet-foot'); return vis(s) || evSheetCls('hp-sheet', '.sheet-body'); },
  friends: () => evSheetCls('am-sheet', '.sheet-body') || evSheet('Amis'), 'partie-hist': () => evSheet('Mes parties'), 'open-hist': () => evSheet('Mes ouvertures'),
  'card-text': () => evSheetCls('cs-sheet', '.cs-sec:last-of-type'), 'viewer-find': () => evSheetCls('fetch-sheet', '.sheet-body') || evSheet('Où trouver mes cartes'), 'set-page': () => evDv('setv', '.dv-body') || evDv('setv', '.dv-head'),
};
/** Indice de chaque cachette (feuille de la fête : « Indices du jour ») : une devinette sur le coin de l'appli, jamais le nom de l'écran. */
const EV_HINT = {
  'home-orb': 'Là où tout commence', 'home-trade': 'Là où tout commence', 'home-life': 'Là où tout commence', 'home-sets': 'Là où tout commence',
  'home-stores': 'Là où tout commence', 'coll-list': 'Au milieu de tes trésors', 'coll-stats': 'Là où l\'on compte et l\'on mesure', 'trade-list': 'Là où l\'on troque',
  'decks-mine': 'Parmi tes grimoires', 'decks-edh': 'Parmi des grimoires qui ne sont pas encore les tiens', 'me-head': 'Là où l\'on parle de toi',
  'me-level': 'Là où brillent tes exploits', 'help-top': 'Là où l\'on t\'explique tout', 'daily-board': 'Là où l\'on se mesure aux autres',
  'card-sheet': 'Derrière le visage d\'une carte', 'viewer-head': 'Quand un grimoire s\'ouvre', 'coll-filters': 'Là où l\'on sépare le bon grain de l\'ivraie',
  'coll-more': 'Tout au fond d\'un tamis', 'coll-view': 'Là où l\'on change de regard', 'coll-backup': 'Là où l\'on met ses trésors à l\'abri',
  'coll-export': 'Là où tes cartes prennent la porte', 'coll-proxy': 'Parmi des doubles un peu louches', 'coll-ms': 'Là où l\'on rêve de tout avoir',
  'trade-set': 'Dans les coulisses du troc', 'trade-binder': 'Entre les pages d\'un livre que tu montres', 'trade-filters': 'Là où l\'on choisit ce qu\'on cède',
  'decks-filters': 'Là où l\'on trie des grimoires inconnus', 'decks-themes': 'Là où les grimoires ont une âme', 'decks-pub': 'Parmi ce que tu montres au monde',
  'me-account': 'Derrière ta porte d\'entrée', 'me-profile': 'Là où tu choisis ton visage', 'set-notif': 'Là où l\'on règle les petites cloches',
  'set-scan': 'Là où l\'on règle l\'œil de l\'appli', 'set-data': 'Au cœur de la mémoire de ton appareil', 'set-conf': 'Là où l\'on garde les secrets',
  'set-mentions': 'Là où l\'on remercie ceux qui aident', 'set-help': 'Là où l\'on te prête main-forte', 'set-widget': 'Là où l\'on règle un petit tableau hors de l\'appli',
  'set-alerts': 'Là où l\'on guette les prix', 'help-faq': 'Là où l\'on répond aux questions', friends: 'Auprès de ceux que tu connais',
  'partie-hist': 'Dans les souvenirs de tes batailles', 'open-hist': 'Dans les souvenirs de tes boosters', 'card-text': 'Dans les petites lignes d\'une carte',
  'viewer-find': 'Là où l\'on cherche ce qui manque à un grimoire', 'set-page': 'Là où une extension se dévoile',
};
const evHint = s => T(EV_HINT[s] || 'Quelque part dans l\'appli');
/** Ce que l'appli peut montrer (bits de EV_CAPS) : le serveur ne tire que des cachettes atteignables. */
function evCaps() {
  const C = EV_CAPS; let c = 0;
  if (typeof D !== 'undefined' && D.user) c |= C.acct;
  if (typeof collCount === 'function' && collCount() > 0) c |= C.cards | C.trade;
  if (typeof allDecks === 'function' && allDecks().length) c |= C.decks;
  if (typeof NAV_DESK !== 'undefined' && NAV_DESK && NAV_DESK.matches) c |= C.desk;
  if (typeof dlyOn === 'function' && dlyOn()) c |= C.daily;
  if (typeof SETS !== 'undefined' && Array.isArray(SETS.list) && SETS.list.length) c |= C.sets;
  if (typeof isNativeApp === 'function' && isNativeApp()) c |= C.nat;
  return c;
}

/* ── Objet posé dans sa cachette ──────────────────────────────────────────────────────────────────────────────────── */
const EV_INTER = 'button, a, input, select, textarea, label, summary, [role="button"], [role="switch"], [role="tab"], [role="slider"], [tabindex]:not([tabindex="-1"]), img, canvas, video';
/** Graine d'une cachette (ordre des places essayées : propre à la cachette et au jour). */
function evSeed(s) { let h = 2166136261; for (const c of s + '|' + (EV.st && EV.st.me ? EV.st.me.day : '')) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0; return h; }
/** Pose l'objet de la cachette s dans son bloc : il cherche un creux libre dès que le bloc est à l'écran. */
function evMount(s, root) {
  const p = evPackOf(); if (!p || typeof EV_ART === 'undefined' || !EV_ART[p.obj.art]) return;
  const b = document.createElement('button'); b.type = 'button'; b.className = 'ev-pk ev-wait'; b.dataset.s = s;
  b.setAttribute('aria-label', evTx('label') || T('Un objet caché : touche-le pour le récolter')); b.innerHTML = EV_ART[p.obj.art]();
  const g = evSeed(s + '#'), rot = (g % 81) - 40, size = [22, 24, 26, 28, 28, 30, 30, 32][(g >>> 8) % 8];      // de travers et de taille variable selon la cachette et le jour : moins monotone
  b.style.setProperty('--r', rot + 'deg'); b.style.setProperty('--k', size + 'px');
  const x = { s, el: b, root, zones: evZones(root), k: -1, host: null, io: null, ok: false, dead: false, tries: 0, rot, size };
  EV.pks.set(s, x); evZone(x, 0);
  b.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); evTap(s); });
}
/** Passe à la zone k (l'objet y est déplacé, observé jusqu'à ce qu'elle soit à l'écran) ; plus de zone : rien cette fois. */
function evZone(x, k) {
  if (x.io) { x.io.disconnect(); x.io = null; }
  const z = x.zones[k]; if (!z) { x.dead = true; x.el.remove(); return; }
  x.k = k; x.host = z.h; x.tries = 0;
  if (getComputedStyle(z.h).position === 'static') z.h.classList.add('ev-host');
  z.h.appendChild(x.el);
  x.io = new IntersectionObserver(es => { if (es.some(q => q.isIntersecting)) evFind(x); }, { threshold: [0, .25, .6, 1] });
  x.io.observe(z.a || z.h);
}
/** Le texte d'un élément (ses propres nœuds de texte) touche-t-il ce rectangle ? */
function evTextHit(el, r) {
  for (const n of el.childNodes) {
    if (n.nodeType !== 3 || !n.textContent.trim()) continue;
    const rg = document.createRange(); rg.selectNodeContents(n);
    for (const q of rg.getClientRects()) if (q.right > r.left - 2 && q.left < r.right + 2 && q.bottom > r.top - 2 && q.top < r.bottom + 2) return true;
  }
  return false;
}
/** Un carré de l'écran est-il libre dans ce bloc ? Sous lui (centre, coins, milieux des bords) : le bloc ou un décor, jamais un bouton, un lien, une image, ni du texte. */
function evFree(host, r) {
  const seen = new Set();
  for (const [px, py] of [[.5, .5], [.1, .1], [.9, .1], [.1, .9], [.9, .9], [.5, .05], [.5, .95], [.05, .5], [.95, .5]]) {
    const el = document.elementFromPoint(r.left + r.width * px, r.top + r.height * py);
    if (!el || !(el === host || host.contains(el))) return false;
    if (el !== host && el.closest(EV_INTER) && host.contains(el.closest(EV_INTER))) return false;
    if (el.closest('.ev-pk')) return false;
    for (let e = el; e && !seen.has(e); e = e === host ? null : e.parentElement) { seen.add(e); if (evTextHit(e, r)) return false; }
  }
  return true;
}
/** Cherche un creux libre dans la partie visible du bloc (grille de points, ordre propre à la cachette) ; trouvé : l'objet s'y pose et apparaît. */
function evFind(x) {
  if (x.ok || x.dead || !x.el.isConnected || !evHuntOk()) return;
  const z = x.zones[x.k], h = x.host, hr = h.getBoundingClientRect(), ar = z.a ? z.a.getBoundingClientRect() : hr, pad = z.pad || 0;
  const top = Math.max(hr.top, ar.top - pad, tourTopInEv()), bot = Math.min(hr.bottom, ar.bottom + pad, innerHeight - (document.body.classList.contains('nav-on') ? 96 : 8));
  const left = Math.max(hr.left, ar.left - pad, 0), right = Math.min(hr.right, ar.right + pad, innerWidth), S = (x.size || EV_PK) + 6;
  const ok = bot - top >= S && right - left >= S && !(ar.bottom < 0 || ar.top > innerHeight);
  let hit = null;
  if (ok) {
    const pts = []; for (let y = top + 3; y + S <= bot - 3; y += 11) for (let xx = left + 3; xx + S <= right - 3; xx += 11) pts.push([xx, y]);
    let g = evSeed(x.s); for (let i = pts.length - 1; i > 0; i--) { g = (Math.imul(g, 1103515245) + 12345) >>> 0; const j = g % (i + 1); [pts[i], pts[j]] = [pts[j], pts[i]]; }
    x.el.style.visibility = 'hidden'; x.el.style.pointerEvents = 'none';
    for (const [px, py] of pts.slice(0, 160)) { const r = { left: px, top: py, right: px + S, bottom: py + S, width: S, height: S }; if (evFree(h, r)) { hit = [px + 3, py + 3]; break; } }
    x.el.style.visibility = ''; x.el.style.pointerEvents = '';
  }
  if (!hit) { if (ok && ++x.tries >= 2) evZone(x, x.k + 1); return; }      // aucun creux ici : zone suivante (défilement : réessayé)
  const cs = getComputedStyle(h);
  x.el.style.left = Math.round(hit[0] - hr.left - (parseFloat(cs.borderLeftWidth) || 0) + h.scrollLeft) + 'px';
  x.el.style.top = Math.round(hit[1] - hr.top - (parseFloat(cs.borderTopWidth) || 0) + h.scrollTop) + 'px';
  x.ok = true; x.el.classList.remove('ev-wait'); evTipSoon(x.el);
}
const tourTopInEv = () => parseFloat(getComputedStyle(document.documentElement).paddingTop) || 0;
function evUnmount(s) { const x = EV.pks.get(s); if (!x) return; if (x.io) x.io.disconnect(); if (x.el.isConnected) x.el.remove(); EV.pks.delete(s); }
/** Tour de garde (EV_POLL, seulement pendant la fête, appli visible, objets du jour restants) : chaque cachette du jour encore pleine reçoit son objet si son bloc est à l'écran. */
/** Zones où chercher un creux pour une cachette : son bloc, puis des replis (feuille : son corps puis son en-tête ; carte de l'accueil : l'espace autour d'elle ;
 *  écran plein : son en-tête). Zone : { h (bloc où poser l'objet), a (élément qui borne la recherche), pad }. */
function evZones(el) {
  const z = [{ h: el }], sh = el.closest('.sheet'), dv = el.closest('body > .dv'), home = el.closest('#viewHome');
  if (sh) for (const q of ['.sheet-body', '.sheet-head']) { const e = sh.querySelector(q); if (e && e !== el && !z.some(x => x.h === e)) z.push({ h: e }); }
  if (home && el !== home) z.push({ h: home, a: el, pad: 22 });
  if (dv) { const e = dv.querySelector('.dv-head'); if (e && e !== el) z.push({ h: e }); }
  return z;
}
/** Tour de garde (EV_POLL, seulement pendant la fête, appli visible, objets du jour restants) : chaque cachette du jour encore pleine reçoit son objet si son bloc est à l'écran. */
function evScan() {
  evQuietSync();
  const me = EV.st && EV.st.me, ok = evHuntOk();
  const want = new Map(); if (ok && me && me.left > 0) for (const x of me.spots || []) if (!x.f && EV_HIDE[x.s]) { let h = null; try { h = EV_HIDE[x.s](); } catch (e) { h = null; } if (h && h.isConnected) want.set(x.s, h); }
  for (const [s, x] of EV.pks) if (want.get(s) !== x.root || !x.el.isConnected) { if (x.dead && want.get(s) === x.root) continue; evUnmount(s); }
  for (const [s, h] of want) if (!EV.pks.has(s)) evMount(s, h);
  for (const x of EV.pks.values()) if (!x.ok && !x.dead && x.el.isConnected) evFind(x);
}
function evLoopSync() {
  const run = evOn() && !document.hidden;      // tour léger toute la fête (classes de l'ambiance) ; les cachettes seulement s'il reste des objets du jour
  if (run && !EV.loop) { EV.loop = setInterval(evScan, EV_POLL); evScan(); }
  if (!run && EV.loop) { clearInterval(EV.loop); EV.loop = 0; for (const s of [...EV.pks.keys()]) evUnmount(s); }
  evQuietSync();
}

/* ── Serveur ─────────────────────────────────────────────────────────────────────────────────────────────── */
async function evCall(path, { method = 'GET', body } = {}) {
  const u = typeof D !== 'undefined' ? D.user : null;
  const go = async force => {
    const h = { Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}), ...(EV.dev ? { 'x-event-device': EV.dev } : {}) };
    if (u) { try { h['x-firebase-token'] = await u.getIdToken(force); } catch (e) { throw Object.assign(new Error('jeton'), { code: 'net' }); } }
    let r; try { r = await fetch('api/event' + path, { method, cache: 'no-store', headers: h, body: body ? JSON.stringify(body) : undefined }); } catch (e) { throw Object.assign(new Error('réseau'), { code: 'net' }); }
    const j = await r.json().catch(() => null);
    if (j && typeof j.dev === 'string' && /^[\w-]{22}\.[\w-]{16}$/.test(j.dev)) { EV.dev = j.dev; try { localStorage.setItem(EV_DEV, j.dev); } catch (e) { /* refusé */ } }
    if (!r.ok) throw Object.assign(new Error((j && j.message) || 'HTTP ' + r.status), { code: (j && j.error) || 'http', status: r.status, j });
    return j || {};
  };
  try { return await go(false); } catch (e) { if (e.code === 'token_expired' && u) return go(true); throw e; }
}
/** État du jour (fête, mes cachettes, ma progression) ; relu au plus une fois par minute, à minuit, au retour sur l'appli, au changement de compte. */
async function evStatus(force) {
  if (!evOn()) return null;
  if (!force && EV.st && Date.now() - EV.at < 60e3) return EV.st;
  if (EV.busy) return EV.st; EV.busy = true;
  try {
    if (!EV.dev) { try { const t = localStorage.getItem(EV_DEV) || ''; if (/^[\w-]{22}\.[\w-]{16}$/.test(t)) EV.dev = t; } catch (e) { /* refusé */ } }
    let j = await evCall('?c=' + evCaps()); if (!j.me && j.dev) j = await evCall('?c=' + evCaps());      // premier passage : jeton d'appareil reçu, l'état suit
    if (!j.on) { EV.cal = null; evApply(); evStop(); return null; }
    EV.st = j; EV.at = Date.now(); EV.cal = { ...EV.cal, ...j.ev }; evLsSet({ cal: { id: j.ev.id, pack: j.ev.pack, from: j.ev.from, to: j.ev.to } });
    if (j.me) evKeep(j.ev.id, j.me);
    evSyncUp();
  } catch (e) { if (e.status === 404) { EV.cal = null; evApply(); evStop(); } }
  finally { EV.busy = false; }
  evArm(); evHomePaint(); evLoopSync(); evIntroSoon();
  return EV.st;
}
/** Progression du serveur gardée sur l'appareil, et dans le compte si elle y manque (le plus grand gagne). */
function evKeep(id, me) {
  const was0 = evMine(id), was = (me.rs || 0) > (was0.rs || 0) ? { jours: {}, sig: {}, n: 0 } : was0, jours = { ...was.jours }, sig = { ...was.sig };      // remise à zéro par le panneau : l'ancienne copie part
  for (const [d, l] of Object.entries(me.jours || {})) if (!jours[d] || l.length >= jours[d].length) { jours[d] = l; if (me.sig && me.sig[d]) sig[d] = me.sig[d]; }
  evMineSet(id, { jours, sig, n: Math.max(was.n || 0, me.n || 0), rs: Math.max(was0.rs || 0, me.rs || 0) });
  if (was !== was0) evForget(id);
  evDocPushSoon();
}
/** Remise à zéro par le panneau (une fois par appareil) : message d'arrivée et astuce de la première trouvaille reviennent. */
function evForget(id) {
  const seen = { ...(evLs().seen || {}) }; delete seen[id]; evLsSet({ seen });
  try { if (typeof tourRead === 'function' && (tourRead().tips || {}).evpk) { const tips = { ...tourRead().tips }; delete tips.evpk; tourSet({ tips }); } } catch (e) { /* stockage refusé */ }
}
/** Relecture à minuit (nouvelles cachettes) et toutes les 10 min (autre appareil du compte). */
function evArm() {
  clearTimeout(EV.armT); const st = EV.st; if (!st) return;
  const ms = Math.max(5000, Math.min(10 * 60e3, (st.next || 0) - (st.now || Date.now()) + 2000));
  EV.armT = setTimeout(() => evStatus(true), ms);
}
/** Le compte a plus que le serveur (serveur reparti sans sa copie) : reçus envoyés, il les vérifie. */
async function evSyncUp() {
  const st = EV.st; if (!st || !st.acct || EV.pend) return;
  const id = st.ev.id, loc = evMine(id), doc = EV.doc && EV.doc[id], src = [loc, doc].filter(x => evFresh(id, x));
  const jours = {}, sig = {};
  for (const x of src) for (const [d, l] of Object.entries(x.jours || {})) if (Array.isArray(l) && (!st.me.jours[d] || l.length > st.me.jours[d].length) && x.sig && x.sig[d]) { jours[d] = l; sig[d] = x.sig[d]; }
  if (!Object.keys(jours).length) return;
  EV.pend = true;
  try { const j = await evCall('/sync', { method: 'POST', body: { ev: id, jours, sig, rs: st.me.rs || 0, c: evCaps(), n: evNick() } }); if (j.me) { st.me = j.me; evKeep(id, j.me); evHomePaint(); } } catch (e) { /* plus tard */ }
  finally { EV.pend = false; }
}
const evNick = () => (typeof PROF !== 'undefined' && PROF.name) || '';

/* ── Compte : users/{uid}/meta/events = { e: { édition: { n, jours, sig } }, updatedAt } (sommaire du compte : cloud.js › makeSum) ─────────────── */
function evUser(user) {
  if (EV.unsub) { try { EV.unsub(); } catch (e) { /* ignore */ } EV.unsub = null; }
  EV.doc = null; const prev = EV.uid; EV.uid = user ? user.uid : '';
  if (user && typeof D !== 'undefined' && D.cloud && D.cloud.watchMeta) {
    EV.unsub = D.cloud.watchMeta(user.uid, 'events', (data, pending, fromCache) => {
      if (pending || D.uid !== user.uid) return;
      EV.doc = data && data.e && typeof data.e === 'object' ? data.e : {};
      if (!fromCache) { evSyncUp(); evDocPushSoon(); }
      if (typeof prgAbsorbSoon === 'function') prgAbsorbSoon();
      evHomePaint();
    }, () => { /* règles pas encore publiées : progression gardée sur l'appareil et le serveur */ });
  }
  if (prev !== EV.uid) { EV.st = null; if (evOn()) evMerge().finally(() => evStatus(true)); if (typeof evpDevSoon === 'function' && CTX.evpush) evpDevSoon(3000); }      // notifications des événements : le compte suit (evpush.js)
}
/** Connexion : la progression sans compte de cet appareil rejoint le compte (une fois ; jamais vers un 2e compte : le serveur refuse). */
async function evMerge() {
  const id = EV.cal && EV.cal.id, u = typeof D !== 'undefined' ? D.user : null; if (!id || !u || !EV.dev) return;
  const ls = evLs(), anon = (ls.anon || {})[id]; if (!anon || !anon.n || EV.merged === id + u.uid) return;
  EV.merged = id + u.uid;
  try { await evCall('/merge', { method: 'POST', body: { ev: id, jours: anon.jours, sig: anon.sig, rs: anon.rs || 0, c: evCaps(), n: evNick() } }); const a = { ...(ls.anon || {}) }; delete a[id]; evLsSet({ anon: a }); } catch (e) { /* refusé ou hors ligne : laissé tel quel */ }
}
let evDocT = 0;
function evDocPushSoon() { clearTimeout(evDocT); evDocT = setTimeout(evDocPush, 3000); }
async function evDocPush() {
  const u = typeof D !== 'undefined' ? D.user : null, st = EV.st;
  if (!u || !st || !st.acct || !D.cloud || !D.cloud.saveMeta || EV.doc === null || (typeof cloudOn === 'function' && !cloudOn())) return;
  const id = st.ev.id, loc = evMine(id), cur = EV.doc[id] || {};
  const old = (cur.rs || 0) < (loc.rs || 0);      // copie du compte d'avant une remise à zéro : remplacée, pas fusionnée
  if (!old && (cur.n || 0) >= (loc.n || 0) && Object.keys(cur.jours || {}).length >= Object.keys(loc.jours || {}).length) return;
  const e = { ...EV.doc, [id]: { n: old ? loc.n || 0 : Math.max(loc.n || 0, cur.n || 0), jours: loc.jours, sig: loc.sig, rs: loc.rs || 0 } };
  for (const k of Object.keys(e).slice(0, Math.max(0, Object.keys(e).length - 20))) delete e[k];      // 20 éditions gardées au plus (règles : 24)
  try { await D.cloud.saveMeta(u.uid, 'events', { e, updatedAt: Date.now() }); EV.doc = e; } catch (err) { /* hors ligne, règles : renvoyé au prochain objet */ }
}

/* ── Toucher : envol, compteur, message ─────────────────────────────────────────────────────────────────────────── */
async function evTap(s) {
  const x = EV.pks.get(s), st = EV.st; if (!x || !st || !st.me || EV.fly) return;
  const sp = st.me.spots.find(q => q.s === s); if (!sp || sp.f) return;
  haptic('ok'); EV.fly = 1;
  const from = x.el.getBoundingClientRect(), rot = x.rot || 0; evUnmount(s); sp.f = 1;
  const me = st.me, n0 = me.n, found = [...me.found, s];
  me.found = found; me.n = Math.min(st.ev.total, n0 + 1); me.left = Math.max(0, Math.min(st.ev.per - found.length, st.ev.total - me.n));      // tout de suite à l'écran ; le serveur confirme
  const anim = evFly(from, me.n, st.ev.total, rot);
  let res = null, err = null;
  try { res = await evCall('/claim', { method: 'POST', body: { ev: st.ev.id, day: me.day, s, t: sp.t, n: evNick() } }); } catch (e) { err = e; }
  await anim;
  if (res) {
    me.n = res.n; me.found = res.found; me.left = res.left; me.jours = { ...me.jours, [me.day]: res.found }; me.sig = { ...me.sig, [me.day]: res.sig };
    evKeep(st.ev.id, me); if (!st.acct) { const a = { ...(evLs().anon || {}) }; a[st.ev.id] = evMine(st.ev.id); evLsSet({ anon: a }); }
    if (typeof prgSoon === 'function') prgSoon('event');
  } else if (err && err.code !== 'net') {
    me.n = n0; me.found = found.filter(q => q !== s); me.left = Math.max(0, st.ev.per - me.found.length);
    toast(err.code === 'day_quota' ? evTx('dayDone') : err.code === 'wrong_day' ? T('Nouveau jour : de nouvelles cachettes t\'attendent.') : T('Cet objet n\'a pas pu être compté.'));
    evStatus(true);
  } else toast(T('Hors ligne : ta trouvaille sera comptée au retour du réseau.'));
  evMsg(me);
  EV.fly = 0; evHomePaint(); evLoopSync();
  if (me.n >= st.ev.total && res) setTimeout(evParty, reduceMotion() ? 200 : 900);
}
/** Envol : l'objet part de sa cachette, grandit au milieu de l'écran (lueur, étincelles), puis rejoint le compteur qui rebondit. Promesse : fin de l'envol. */
function evFly(from, n, total, rot = 0) {
  const p = evPackOf(), lay = document.createElement('div'); lay.className = 'ev-fx'; lay.setAttribute('aria-hidden', 'true');
  const cnt = evCounterEl(n - 1, total);
  const obj = document.createElement('div'); obj.className = 'ev-flyo'; obj.innerHTML = EV_ART[p.obj.art]({ lit: true }); lay.appendChild(obj); document.body.appendChild(lay);
  const vw = innerWidth, vh = innerHeight, big = Math.min(150, vw * .38), cx = vw / 2, cy = vh * .42;
  obj.style.width = obj.style.height = big + 'px'; obj.style.left = cx - big / 2 + 'px'; obj.style.top = cy - big / 2 + 'px';
  const k0 = from.width / big, dx0 = from.left + from.width / 2 - cx, dy0 = from.top + from.height / 2 - cy;
  const done = () => { lay.remove(); };
  if (reduceMotion() || !obj.animate) {
    obj.style.opacity = '0'; cnt.set(n); cnt.bump();
    return new Promise(r => setTimeout(() => { done(); r(); }, 60));
  }
  return new Promise(resolve => {
    const a1 = obj.animate([{ transform: `translate(${dx0}px,${dy0}px) scale(${k0}) rotate(${rot}deg)`, opacity: 1 }, { transform: `translate(0,-6px) scale(1.12) rotate(${-rot * .12}deg)`, opacity: 1, offset: .72 }, { transform: 'none', opacity: 1 }], { duration: 620, easing: 'cubic-bezier(.2,.9,.25,1.05)', fill: 'forwards' });
    lay.classList.add('on');
    a1.finished.then(() => {
      evSparks(lay, cx, cy, big);
      const c = cnt.ic.getBoundingClientRect(), tx = c.left + c.width / 2 - cx, ty = c.top + c.height / 2 - cy, k1 = c.width / big;
      setTimeout(() => {
        const a2 = obj.animate([{ transform: 'none', opacity: 1 }, { transform: `translate(${tx * .35}px,${ty * .2 - 30}px) scale(.62)`, opacity: 1, offset: .45 }, { transform: `translate(${tx}px,${ty}px) scale(${k1})`, opacity: .9 }], { duration: 560, easing: 'cubic-bezier(.55,0,.35,1)', fill: 'forwards' });
        lay.classList.remove('on');
        a2.finished.then(() => { cnt.set(n); cnt.bump(); haptic('tap'); done(); resolve(); });
      }, 520);
    }, () => { done(); resolve(); });
  });
}
/** Explosion autour de l'objet au milieu de l'écran : les petits dessins du pack (têtes de mort, fantômes, lunes, bonbons, étoiles… : EV_FX) jaillissent en
 *  tournoyant puis retombent un peu en s'effaçant, avec quelques étincelles ; transform / opacity seulement, 18 éléments au plus, retirés à la fin. */
function evSparks(lay, cx, cy, big) {
  const p = evPackOf(), fx = p && typeof EV_FX !== 'undefined' && EV_FX[p.id] ? EV_FX[p.id]() : [], N = fx.length ? 10 : 0, out = [];
  const ring = document.createElement('i'); ring.className = 'ev-ring'; ring.style.left = cx + 'px'; ring.style.top = cy + 'px'; ring.style.width = ring.style.height = big * 1.5 + 'px'; lay.insertBefore(ring, lay.firstChild); out.push(ring);      // onde lumineuse derrière l'objet
  ring.animate([{ transform: 'translate(-50%,-50%) scale(.35)', opacity: .9 }, { transform: 'translate(-50%,-50%) scale(1.35)', opacity: 0 }], { duration: 700, easing: 'cubic-bezier(.2,.7,.3,1)', fill: 'forwards' });
  for (let i = 0; i < N + 8; i++) {
    const glyph = i < N, s = document.createElement('i'); s.className = glyph ? 'ev-fxp' : 'ev-spk' + (i % 3 ? '' : ' b');
    if (glyph) { s.innerHTML = fx[i % fx.length]; const k = 20 + (i * 7) % 9; s.style.width = s.style.height = k + 'px'; }
    lay.appendChild(s); out.push(s);
    const a = (i / (glyph ? N : 8)) * Math.PI * 2 + (glyph ? .3 : 0) + ((i * 37) % 11) / 30, d = big * (glyph ? .78 + (i % 3) * .16 : .5 + (i % 4) * .12);
    const dx = Math.cos(a) * d, dy = Math.sin(a) * d, spin = (i % 2 ? 1 : -1) * (120 + (i * 53) % 160);
    s.style.left = cx + 'px'; s.style.top = cy + 'px';
    s.animate([
      { transform: 'translate(-50%,-50%) scale(.2) rotate(0deg)', opacity: 0 },
      { transform: `translate(calc(-50% + ${dx * .62}px), calc(-50% + ${dy * .62}px)) scale(1.08) rotate(${spin * .45}deg)`, opacity: 1, offset: .32 },
      { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy + big * .22}px)) scale(.7) rotate(${spin}deg)`, opacity: 0 },
    ], { duration: glyph ? 1050 + (i % 3) * 110 : 760 + (i % 3) * 120, delay: glyph ? (i % 4) * 22 : 0, easing: 'cubic-bezier(.16,.84,.3,1)', fill: 'forwards' });
  }
  setTimeout(() => out.forEach(x => x.remove()), 1500);
}
/** Compteur global « 🎃 12 / 30 », en haut de l'écran le temps de la trouvaille ; set(n), bump() : petit rebond. */
function evCounterEl(n, total) {
  const p = evPackOf(); let el = document.querySelector('.ev-cnt');
  if (!el) { el = document.createElement('div'); el.className = 'ev-cnt'; el.setAttribute('role', 'status'); el.setAttribute('aria-live', 'polite'); el.innerHTML = `<span class="ev-cnt-ic">${typeof EV_ART !== 'undefined' && EV_ART.counter ? EV_ART.counter() : esc(p.obj.emoji)}</span><b></b>`; document.body.appendChild(el); }
  clearTimeout(el._t); el.classList.add('on');
  const b = el.querySelector('b'), set = v => { b.textContent = `${nf0(v)} / ${nf0(total)}`; el.setAttribute('aria-label', TN(v, '{n} ' + p.obj.one + ' sur {t}', '{n} ' + p.obj.many + ' sur {t}', { t: total })); };
  set(Math.max(0, n));
  const hide = ms => { clearTimeout(el._t); el._t = setTimeout(() => { el.classList.remove('on'); }, ms); };
  return { ic: el.querySelector('.ev-cnt-ic'), set, bump: () => { el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); hide(3600); } };
}
/** Message après une trouvaille : « Bien vu ! Il te reste 3 citrouilles à trouver aujourd'hui », 5e : « reviens demain » ; sans compte : invitation. */
function evMsg(me) {
  const st = EV.st, p = evPackOf(); if (!st || !p) return;
  document.querySelectorAll('.ev-msg').forEach(x => x.remove());
  if (me.n >= st.ev.total) return;      // dernière : la célébration
  const el = document.createElement('div'); el.className = 'ev-msg'; el.setAttribute('role', 'status'); el.setAttribute('aria-live', 'polite');
  const day = me.left <= 0, l = p.txt.left;
  const line = day ? esc(evTx('dayDone')) : (l ? TN(me.left, l[0], l[1]) : esc(evObjN(me.left)));
  el.innerHTML = `<span class="ev-msg-ic" aria-hidden="true">${EV_ART.bat ? EV_ART.bat() : ''}</span><span class="ev-msg-t"><b>${esc(day ? T('Bravo !') : evTx('found') || T('Bien vu !'))}</b><span>${line}</span>${!st.acct && me.n === 1 ? `<small>${esc(evTx('join'))}</small>` : ''}</span>`;
  document.body.appendChild(el);
  requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('on')));
  const t = setTimeout(() => { el.classList.remove('on'); setTimeout(() => el.remove(), 400); }, day ? 5200 : 3800);
  el.addEventListener('click', () => { clearTimeout(t); el.classList.remove('on'); setTimeout(() => el.remove(), 300); if (!st.acct && typeof openAccount === 'function') openAccount(); });
}
/** Dernier objet : célébration plein écran (objet allumé, badge du grade ultime avec sa bordure, braises). */
function evParty() {
  const st = EV.st, p = evPackOf(); if (!st || !p || document.querySelector('.ev-party')) return;
  const el = document.createElement('div'); el.className = 'ev-party'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-label', evTx('allDone', { total: st.ev.total }));
  const embers = Array.from({ length: 18 }, (_, i) => `<i style="--x:${(i * 53) % 100}%;--d:${(i % 6) * .45}s;--s:${.6 + (i % 4) * .2}"></i>`).join('');
  el.innerHTML = `<div class="ev-party-bg" aria-hidden="true">${embers}</div><div class="ev-party-in">
    <div class="ev-party-obj" aria-hidden="true">${EV_ART[p.obj.art]({ lit: true })}</div>
    <p class="ev-party-k">${esc(T('{n} sur {t}', { n: st.ev.total, t: st.ev.total }))}</p>
    <h2>${esc(evTx('allDone', { total: st.ev.total }))}</h2>
    <p>${esc(evTx('allSub', { y: st.ev.id.slice(-4) }))}</p>
    <div class="ev-party-badge">${evBadgeHtml(st.ev.id, 3, true)}<b>${esc(T(p.badge.names[3]))}</b></div>
    <div class="ev-party-acts"><button class="btn" type="button" data-ev="badge">${T('Voir mes badges')}</button><button class="btn ghost" type="button" data-ev="close">${T('Fermer')}</button></div></div>`;
  document.body.appendChild(el); haptic('ok');
  const close = () => { el.classList.remove('on'); setTimeout(() => el.remove(), reduceMotion() ? 0 : 420); document.removeEventListener('keydown', key, true); };
  const key = e => { if (e.key === 'Escape') { e.preventDefault(); close(); } };
  document.addEventListener('keydown', key, true);
  el.addEventListener('click', e => { const b = e.target.closest('[data-ev]'); if (!b) return; haptic('tap'); close(); if (b.dataset.ev === 'badge' && typeof prgSheet === 'function') setTimeout(() => prgSheet('ev_' + st.ev.id), 300); });
  requestAnimationFrame(() => requestAnimationFrame(() => { el.classList.add('on'); const b = el.querySelector('[data-ev="badge"]'); if (b) b.focus({ preventScroll: true }); }));
}

/* ── Astuce (tour.js) la première fois qu'un objet est visible ──────────────────────────────────────────────────── */
function evTipSoon(el) {
  if (typeof tipShow !== 'function' || typeof TIP_DEFS === 'undefined' || typeof tourRead !== 'function' || (tourRead().tips || {}).evpk || (typeof tipOff === 'function' && tipOff()) || (typeof TIP !== 'undefined' && TIP.el)) return;
  if (typeof tourAuto === 'function' && !tourAuto()) return;
  clearTimeout(EV.tipT);
  EV.tipT = setTimeout(() => {
    if (!el.isConnected || (typeof TIP !== 'undefined' && TIP.el)) return;
    const top = navTopDv(); TIP_DEFS.evpk = [() => false, () => el.isConnected ? el : null, () => evTx('tip', { per: EV.st ? EV.st.ev.per : 5 })];
    tipShow('evpk', el, top);
  }, 900);
}

/* ── Accueil : carte de la fête ────────────────────────────────────────────────────────────────────────────────── */
function evHomePaint() {
  let box = document.getElementById('hmEvent');
  const st = EV.st, p = evPackOf();
  if (!evOn() || !st || !p || (typeof streamOn === 'function' && streamOn())) { if (box) box.remove(); return; }
  if (!box) {
    const at = document.getElementById('hmTrade'); if (!at) return;      // juste après l'Échange, avant le compteur de vie et le Discord
    at.insertAdjacentHTML('afterend', '<section class="hm-trade hm-ev" id="hmEvent" aria-labelledby="hmEvT"></section>'); box = document.getElementById('hmEvent');
    box.addEventListener('click', e => { if (e.target.closest('.ev-pk')) return; const b = e.target.closest('[data-ev]'); if (!b) return; haptic('tap'); evSheetOpen(); });
  }
  const me = st.me || { n: evCount(st.ev.id), left: st.ev.per, found: [] }, n = Math.max(me.n, evCount(st.ev.id)), ev = st.ev, y = ev.id.slice(-4);
  const left = ev.left, tiers = p.badge.tiers, nx = tiers.find(t => t > n);
  const today = me.left > 0 ? TN(me.left, 'Encore {n} à trouver aujourd\'hui', 'Encore {n} à trouver aujourd\'hui') : n >= ev.total ? T('Tout est trouvé : bravo !') : T('Tout est trouvé pour aujourd\'hui : reviens demain');
  const sig = [n, me.left, left, I18N.lang, (me.found || []).length].join('|'); if (box.dataset.sig === sig) return; box.dataset.sig = sig;
  box.innerHTML = `<button class="hm-tr-h hm-ev-h" type="button" data-ev="open"><span class="hm-ev-ic" aria-hidden="true">${EV_ART[p.obj.art]({ cls: 'evo-still' })}</span>
      <span class="hm-tr-t"><b id="hmEvT">${esc(evTx('short'))} ${esc(y)}</b><span>${esc(today)}</span></span>
      <span class="hm-ev-n"><b>${nf0(n)}</b><small>/ ${nf0(ev.total)}</small></span></button>
    <div class="hm-ev-bar" role="progressbar" aria-valuemin="0" aria-valuemax="${ev.total}" aria-valuenow="${n}" aria-label="${esc(evObjN(n))}"><i style="width:${(n / ev.total * 100).toFixed(1)}%"></i>${tiers.map(t => `<span class="${n >= t ? 'ok' : ''}" style="left:${(t / ev.total * 100).toFixed(1)}%"></span>`).join('')}</div>
    <div class="hm-ev-ft"><span class="hm-ev-bdg" aria-hidden="true">${tiers.map((t, i) => `<span class="${n >= t ? 'ok' : ''}">${evBadgeHtml(ev.id, i, n >= t)}</span>`).join('')}</span>
      <span class="hm-ev-d">${left > 0 ? esc(TN(left, 'Encore {n} jour', 'Encore {n} jours')) : esc(T('Dernier jour'))}${nx ? ' · ' + esc(T('prochain badge à {n}', { n: nx })) : ''}</span>
      <button class="link-btn" type="button" data-ev="open">${T('Indices')}</button></div>`;
}
/** Feuille de la fête : règles, indices du jour, badges à gagner, classement des chasseurs. */
function evSheetOpen() {
  const st = EV.st, p = evPackOf(); if (!st || !p) return;
  openSheet(evTx('short') + ' ' + st.ev.id.slice(-4), null, api => {
    api.wrap.classList.add('ev-sheet');
    const paint = (bd) => {
      const me = st.me || { n: 0, spots: [], left: 0 }, n = Math.max(me.n, evCount(st.ev.id)), ev = st.ev, to = new Date(ev.to + 'T12:00:00').toLocaleDateString(LOC(), { day: 'numeric', month: 'long' });
      const rules = (p.txt.rules || []).map(r => `<li>${esc(T(r, { total: ev.total, per: ev.per, to, y: ev.id.slice(-4) }))}</li>`).join('');
      const hints = (me.spots || []).map(x => `<li class="${x.f ? 'ok' : ''}"><span aria-hidden="true">${x.f ? '✓' : '·'}</span>${esc(evHint(x.s))}${x.f ? `<span class="sr">${T('trouvée')}</span>` : ''}</li>`).join('');
      const bdg = p.badge.tiers.map((t, i) => `<div class="ev-sb ${n >= t ? 'ok' : ''}">${evBadgeHtml(ev.id, i, n >= t)}<b>${esc(T(p.badge.names[i]))}</b><small>${esc(evObjN(t))}</small></div>`).join('');
      const rows = bd && Array.isArray(bd.rows) && bd.rows.length ? `<p class="prg-h">${T('Chasseurs')}</p><p class="hint">${esc(TN(bd.hunters, '{n} chasseur', '{n} chasseurs'))} · ${esc(T('{n} au complet', { n: bd.full }))}</p><ol class="ev-board">${bd.rows.map(r => `<li class="${r.me ? 'me' : ''}"><span>${r.r}</span><b>${esc(r.n)}</b><span>${nf0(r.c)} / ${nf0(ev.total)}</span></li>`).join('')}</ol>` : '';
      api.body.innerHTML = `<div class="ev-sh-top"><span class="ev-sh-ic" aria-hidden="true">${EV_ART[p.obj.art]({ cls: 'evo-still' })}</span><div><b>${nf0(n)} / ${nf0(ev.total)}</b><span>${esc(T('Jour {d} sur {t}', { d: ev.dayNo, t: ev.days }))}</span></div></div>
        <ul class="ev-rules">${rules}</ul>
        ${me.spots && me.spots.length ? `<p class="prg-h">${T('Indices du jour')}</p><ul class="ev-hints">${hints}</ul>` : ''}
        <p class="prg-h">${T('Badges à gagner')}</p><div class="ev-sbs">${bdg}</div>
        ${!st.acct ? `<p class="hint ev-join">${esc(evTx('join'))} <button class="link-btn" type="button" data-ev="acct">${T('Se connecter')}</button></p>` : ''}
        ${rows}`;
    };
    api.body.addEventListener('click', e => { if (e.target.closest('[data-ev="acct"]') && typeof openAccount === 'function') { api.close(); openAccount(); } });
    paint(null);
    evCall('/board?ev=' + encodeURIComponent(st.ev.id)).then(bd => { if (sheets.includes(api)) paint(bd); }, () => {});
  });
}

/* ── Message d'arrivée : une fois par fête et par appareil ───────────────────────────────────────────────────────── */
const EV_FORCE_UI = typeof location !== 'undefined' && /[?&]event\b/.test(location.search), EV_RESET = typeof location !== 'undefined' && /[?&]evreset\b/.test(location.search);
const EV_EXT = (() => { try { return [...new URLSearchParams(location.search).keys()].some(k => !['event', 'evreset', 'lang', 'tour', 'onboarding', 'splash'].includes(k)); } catch (e) { return false; } })();
function evIntroSoon() {
  const st = EV.st; if (!st || !evOn() || (evLs().seen || {})[st.ev.id] || EV_EXT) return;
  if (!EV_FORCE_UI && typeof navigator !== 'undefined' && navigator.webdriver) return;      // navigateurs pilotés par les tests : seulement avec ?event
  clearTimeout(EV.introT); EV.introT = setTimeout(evIntroTry, 2500);
}
function evIntroTry() {
  const calm = !document.hidden && !evSheetTop() && !navTopDv() && S.view === 'home' && !document.getElementById('splash') && !(typeof OB !== 'undefined' && OB.el) && !(typeof TOUR !== 'undefined' && (TOUR.on || TOUR.pill)) && !(typeof streamOn === 'function' && streamOn()) && !EV.fly;
  if (!calm) { EV.introT = setTimeout(evIntroTry, 4000); return; }
  evIntro();
}
function evIntro() {
  const st = EV.st, p = evPackOf(); if (!st || !p || document.querySelector('.ev-intro')) return;
  evLsSet({ seen: { ...(evLs().seen || {}), [st.ev.id]: Date.now() } });
  const to = new Date(st.ev.to + 'T12:00:00').toLocaleDateString(LOC(), { day: 'numeric', month: 'long' });
  const el = document.createElement('div'); el.className = 'ev-intro'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-labelledby', 'evInT');
  el.innerHTML = `<div class="ev-in-bg" aria-hidden="true"></div><div class="ev-in-card">
    <div class="ev-in-row" aria-hidden="true">${[0, 1, 2, 3, 4].map(i => `<span style="--i:${i}">${EV_ART[p.obj.art]({ lit: i === 2 })}</span>`).join('')}</div>
    <p class="ev-in-k">${esc(p.obj.emoji)} ${esc(T(p.name))} ${esc(st.ev.id.slice(-4))}</p>
    <h2 id="evInT">${esc(evTx('title'))}</h2>
    <ol class="ev-in-rules">${(p.txt.rules || []).map((r, i) => `<li style="--i:${i}">${esc(T(r, { total: st.ev.total, per: st.ev.per, to, y: st.ev.id.slice(-4) }))}</li>`).join('')}</ol>
    <button class="btn ev-in-go" type="button">${T('C\'est parti')}</button></div>`;
  document.body.appendChild(el);
  const close = () => { el.classList.remove('on'); setTimeout(() => { el.remove(); evScan(); }, reduceMotion() ? 0 : 450); document.removeEventListener('keydown', key, true); };
  const key = e => { if (e.key === 'Escape' || e.key === 'Enter') { e.preventDefault(); close(); } };
  document.addEventListener('keydown', key, true);
  el.querySelector('.ev-in-go').onclick = () => { haptic('ok'); close(); };
  requestAnimationFrame(() => requestAnimationFrame(() => { el.classList.add('on'); el.querySelector('.ev-in-go').focus({ preventScroll: true }); }));
}

/* ── Préférences : « Décorations de fête » (Compte et réglages › Préférences, pendant une fête) ────────────────────────────── */
const evPrefRow = () => (evOn() ? `<label class="me-row switch-row" for="setEvDeco"><span class="me-t">${T('Décorations de fête')}<small>${esc(evTx('deco') || T(evPackOf().name))}${esc(' · ' + T('la chasse reste ouverte'))}</small></span><span class="switch"><input type="checkbox" id="setEvDeco" ${evDeco() ? 'checked' : ''}><i></i></span></label>` : '');
function evPref(on) { evLsSet({ deco: !!on }); evApply(); haptic('ok'); }

/* ── Badges « Événements » (progress.js) : un badge par édition, paliers du pack ; obtenables pendant la fête, gardés ensuite avec l'année ── */
/** Badges à montrer : l'édition en cours (même sans palier), et chaque édition passée où un objet a été trouvé. */
function evBadges() {
  if (typeof evById !== 'function') return [];
  const ids = new Set(); if (evOn() && EV.cal.id) ids.add(EV.cal.id);
  for (const id of [...Object.keys(evLs().p || {}), ...Object.keys(EV.doc || {})]) if (evCount(id) > 0) ids.add(id);
  const out = [];
  for (const id of ids) {
    const e = evById(id), p = e && evPack(e.pack); if (!p || !p.badge) continue;
    const names = p.badge.names || [];
    out.push({ id: 'ev_' + id, cat: 'event', ic: p.obj.emoji, t: T(p.badge.t, { y: e.year }), d: ['{n} ' + p.obj.one + ' trouvée', '{n} ' + p.obj.many + ' trouvées'].map(s => (p.obj.fem ? s : s.replace('trouvée', 'trouvé'))), tiers: p.badge.tiers.slice(), v: () => evCount(id), ev: id, names });
  }
  return out;
}
/** Icône d'un badge d'événement (fichier généré par tools/gen-event-badges.mjs ; palier 3 : bordure animée du grade ultime). */
function evBadgeHtml(id, tier, got) {
  const t = Math.max(0, Math.min(3, tier)), p = evPack(id);
  return `<span class="evb t${t}${got ? ' got' : ' off'}${t === 3 && got ? ' ult' : ''}" data-pack="${esc(p ? p.id : '')}"><img src="icons/events/badges/${esc(id)}-${t}.svg" alt="" loading="lazy" decoding="async" onerror="this.replaceWith(Object.assign(document.createElement('i'),{textContent:'${p ? p.obj.emoji : '★'}'}))"></span>`;
}

/* ── Démarrage, serveur, compte ─────────────────────────────────────────────────────────────────────────────────── */
/** /__ping › event (detectProxy) : fête en cours ou rien. */
function evPing(j) {
  const was = EV.cal && EV.cal.id; EV.cal = j && typeof j.id === 'string' && typeof j.pack === 'string' ? j : null;
  if (EV.cal && !evPackOf()) EV.cal = null;
  if (!EV.cal) { evLsSet({ cal: null }); evApply(); evStop(); return; }
  evLsSet({ cal: { id: EV.cal.id, pack: EV.cal.pack, from: EV.cal.from, to: EV.cal.to } });
  evApply(); if (was !== EV.cal.id || !EV.st) evStatus(true);
}
function evStop() { clearTimeout(EV.armT); EV.st = null; evLoopSync(); evHomePaint(); }
/** Au chargement : dernière fête connue de l'appareil, encore dans ses dates → décor posé tout de suite (le serveur confirme ensuite). */
function evBoot() {
  if (EV_RESET) {      // ?evreset (débogage, lien du panneau /admin) : cet appareil oublie ses événements : message d'arrivée revu, progression locale, logo gardé, astuce
    evLsSet({ seen: {}, p: {}, anon: {} }); evForget(''); try { localStorage.removeItem(EV_KEY + ':logo'); } catch (e) { /* stockage refusé */ }
    try { const u = new URL(location.href); u.searchParams.delete('evreset'); history.replaceState(history.state, '', u.pathname + u.search + u.hash); } catch (e) { /* ignore */ }
    setTimeout(() => { if (typeof toast === 'function') toast(T('Événements : cet appareil est remis à zéro')); }, 1500);
  }
  const c = evLs().cal; if (!c || typeof c.id !== 'string' || typeof evDay !== 'function') return;
  const d = evDay(Date.now()); if (d < c.from || d > c.to) { evLsSet({ cal: null }); return; }
  EV.cal = c; evApply();
  document.addEventListener('visibilitychange', () => { evQuietSync(); if (!document.hidden && evOn()) evStatus(); evLoopSync(); });
}
if (typeof document !== 'undefined' && typeof window !== 'undefined') {
  evBoot();
  document.addEventListener('change', e => { if (e.target && e.target.id === 'setEvDeco') evPref(e.target.checked); });
  if (!evLs().cal) document.addEventListener('visibilitychange', () => { evQuietSync(); if (!document.hidden && evOn()) evStatus(); evLoopSync(); }, { once: false });
}

if (typeof module !== 'undefined' && module.exports) module.exports = { EV_HIDE, evHint };
