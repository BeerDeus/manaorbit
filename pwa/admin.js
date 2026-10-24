/* ── Mana Orbit — panneau d'administration (manaorbit.app/admin) ──────────────────────────────────────────────────────────────────
   Page sans données : connexion Google par le SDK Firebase (même configuration et même SDK que l'appli, src/cloud.js ; même origine, donc déjà
   connecté si l'appli l'est dans ce navigateur), puis GET /api/admin avec le jeton d'identité (x-firebase-token). Le serveur vérifie À CHAQUE
   appel que c'est le compte de l'éditeur (adresse vérifiée, liste du serveur) ; tout autre compte reçoit 403 → « Accès réservé », rien d'autre.
   Tout ce qui vient du serveur est déjà réduit (prénom + initiale, e-mail masqué, identifiant opaque) et n'est écrit qu'en textContent (pseudos libres).
   Tri, recherche et pages : côté serveur (?sort, dir, q, page). « Rafraîchir » : POST /api/admin/refresh (une fois par minute au plus). « CSV » : la même
   liste (tri et recherche en cours) par GET /api/admin/export. Actions, toujours confirmées : désactiver / réactiver un compte (fenêtre qui dit lequel),
   retirer un deck public (deux appuis) ; POST en JSON avec le jeton ; journal des actions tenu par le serveur. Discord : messages du bot dans un salon (pings, historique).
   QR codes fixes (flyers, affiches, Discord) : destination, scans, SVG et PNG ; jamais supprimés.
   Onglets en haut (Vue d'ensemble, Utilisateurs, Carte mystère, Discord, Fils, QR codes, Signalements, Journal, Serveur), l'onglet dans l'adresse (#discord, #qr…) ; blocs repliables
   (état gardé sur l'appareil).
   CSP stricte (proxy.mjs › ADM_CSP) : aucun script ni style en ligne, d'où ce fichier et admin.css ; graphiques en SVG dessinés ici, sans bibliothèque. */
(function () {
  'use strict';
  // Thème choisi dans l'appli (même origine) : appliqué avant le premier affichage
  try { const t = JSON.parse(localStorage.getItem('deckdeal:v1') || '{}').theme; if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t); } catch (e) { /* stockage absent */ }

  // Même configuration que src/cloud.js (tests/test-admin.mjs vérifie qu'elles ne divergent pas)
  const FIREBASE_CONFIG = {
    apiKey: 'AIzaSyCznNtazqWMhiYlPxce3O0Ss06mycgp6TY',
    authDomain: 'm2s-mtg.firebaseapp.com',
    projectId: 'm2s-mtg',
    storageBucket: 'm2s-mtg.firebasestorage.app',
    messagingSenderId: '760752938824',
    appId: '1:760752938824:web:92327fe6c051b8f2741d7d',
  };
  const FB_BASE = 'https://www.gstatic.com/firebasejs/12.19.0/';

  const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
  /** Élément : h('div', { class: 'x', title: '…' }, enfant | texte, …). Les textes passent par createTextNode (jamais innerHTML). */
  function h(tag, at, ...kids) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(at || {})) if (v != null && v !== false) e.setAttribute(k, v === true ? '' : String(v));
    for (const k of kids.flat(Infinity)) if (k != null && k !== false) e.append(typeof k === 'object' ? k : document.createTextNode(String(k)));
    return e;
  }
  /** Remplace le contenu d'une boîte : null et false ignorés (replaceChildren les écrirait « null » / « false »). */
  const fill = (box, ...kids) => box.replaceChildren(...kids.flat(Infinity).filter(k => k != null && k !== false));
  const SVG ='http://www.w3.org/2000/svg';
  const s = (tag, at) => { const e = document.createElementNS(SVG, tag); for (const [k, v] of Object.entries(at || {})) e.setAttribute(k, String(v)); return e; };
  const NF = new Intl.NumberFormat('fr-FR'), nf = n => NF.format(Number(n) || 0);
  const EUR = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
  const D_SHORT = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', year: '2-digit' });
  const D_TIME = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  const D_DAY = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', timeZone: 'UTC' });
  /** « il y a 3 h », « il y a 2 j » ; 0 : « — ». */
  function ago(t) {
    if (!(t > 0)) return '—';
    const m = Math.max(0, Math.round((Date.now() - t) / 60e3));
    if (m < 1) return 'à l\'instant'; if (m < 60) return 'il y a ' + m + ' min';
    const hh = Math.round(m / 60); if (hh < 24) return 'il y a ' + hh + ' h';
    const d = Math.round(hh / 24); if (d < 60) return 'il y a ' + d + ' j';
    return D_SHORT.format(t);
  }
  const dur = sec => { const d = Math.floor(sec / 86400), hh = Math.floor(sec % 86400 / 3600), m = Math.floor(sec % 3600 / 60); return d ? d + ' j ' + hh + ' h' : hh ? hh + ' h ' + m + ' min' : m + ' min'; };
  const PROV = { google: 'Google', mail: 'E-mail', apple: 'Apple', phone: 'Téléphone', facebook: 'Facebook', github: 'GitHub', twitter: 'X', microsoft: 'Microsoft', autre: 'Autre' };

  let fb = null, user = null, data = null, busy = 0, timer = 0;
  const st = { page: 1, sort: 'created', dir: 'desc', q: '' };

  /** Une seule vue visible : chargement, connexion, refus, erreur, tableau de bord. */
  function show(v, msg) {
    for (const id of ['vLoad', 'vOut', 'vDeny', 'vErr', 'vMain']) $('#' + id).hidden = id !== v;
    $('#acts').hidden = v !== 'vMain'; $('#tabs').hidden = v !== 'vMain';
    if (v === 'vErr') $('#errTxt').textContent = msg || 'Le serveur ne répond pas.';
    if (v !== 'vMain') {      // rien ne reste affiché d'une session admin précédente
      data = null; for (const id of ['#kpis', '#chart', '#achart', '#mix', '#ulist', '#pager', '#pubrep', '#journal', '#srv', '#health', '#notes', '#meta', '#scans', '#daily', '#discord', '#dyRepCard', '#threads', '#qrcodes']) $(id).replaceChildren(); $('#scans').hidden = true; $('#daily').hidden = true; $('#discord').hidden = true; $('#dyRepCard').hidden = true; sc.seen = -1; sc.gen++; dy.gen++; dy.d = null; dc.gen++; dc.d = null; dc.draft = ''; dc.roles = []; dc.every = false; thReset(); qcReset(); hcReset();
      $('#uCount').textContent = ''; tb.cur = ''; tb.y = {}; for (const k of TABS) { tabOf(k).hidden = false; badge(k, 0); }      // onglets rendus : la prochaine session redit ce qui est coupé
      const d = $('#dlg'); if (d.open) d.close(); d.replaceChildren();
    }
  }

  /* Onglets (barre collante sous l'en-tête) : une partie du panneau chacun, l'onglet dans l'adresse (#discord…) : retour, rechargement et lien direct.
     Onglet sans objet (Carte mystère ou Discord coupés sur le serveur : 404) masqué, et l'adresse ramenée à la vue d'ensemble ; pastille : ce qui attend
     une décision. Clavier (motif « tablist » de l'ARIA) : flèches, Début, Fin ; focus mobile (un seul onglet dans l'ordre de tabulation). */
  const TABS = ['apercu', 'comptes', 'mystere', 'discord', 'fils', 'qr', 'signalements', 'journal', 'serveur'];
  const tb = { cur: '', y: {} };      // onglet affiché, position de défilement de chacun (rendue au retour sur l'onglet)
  const tabOf = k => document.getElementById('t-' + k);
  const tabOn = k => TABS.includes(k) && !tabOf(k).hidden;
  /** Adresse → [onglet, suite] : « #fils/123 » → ['fils', '123'] (un fil ouvert : retour = la liste). */
  const hashParts = () => { let k = ''; try { k = decodeURIComponent(location.hash.slice(1)); } catch (e) { /* adresse abîmée */ } const i = k.indexOf('/'); return i < 0 ? [k, ''] : [k.slice(0, i), k.slice(i + 1)]; };
  const hashTab = () => { const k = hashParts()[0]; return tabOn(k) ? k : 'apercu'; };
  function tabShow(k) {
    if (!tabOn(k)) k = 'apercu';
    const prev = tb.cur; if (prev && prev !== k) tb.y[prev] = scrollY;
    tb.cur = k;
    for (const t of TABS) { const b = tabOf(t), on = t === k; b.setAttribute('aria-selected', String(on)); b.tabIndex = on ? 0 : -1; $('#p-' + t).hidden = !on; }
    if (location.hash && hashParts()[0] !== k) history.replaceState(null, '', '#' + k);      // onglet inconnu ou masqué : l'adresse dit ce qui est affiché
    if (prev !== k) { scrollTo(0, tb.y[k] || 0); tabReveal(tabOf(k)); if (k === 'apercu') charts(); }
    if (k === 'fils') thRoute(hashParts()[0] === 'fils' ? hashParts()[1] : '');
    hcSoon();      // Serveur : relu toutes les 20 s tant qu'il est affiché
  }
  /** Onglet demandé (clic, flèches, tuile) : nouvelle entrée de l'historique (retour : hashchange, l'onglet d'avant), sauf replace. */
  function go(k, replace) {
    if (!tabOn(k)) return;
    if (location.hash !== '#' + k && !(replace && hashParts()[0] === k)) history[replace ? 'replaceState' : 'pushState'](null, '', '#' + k);
    tabShow(k);
  }
  /** Barre qui défile de côté (téléphone) : l'onglet choisi ramené dans la vue, fondu sur le bord qui cache encore des onglets. */
  function tabReveal(b) {
    const l = $('#tabl'), L = b.offsetLeft, R = L + b.offsetWidth;
    if (L < l.scrollLeft + 24) l.scrollLeft = L - 24; else if (R > l.scrollLeft + l.clientWidth - 24) l.scrollLeft = R - l.clientWidth + 24;
    tabEdge();
  }
  function tabEdge() { const l = $('#tabl'); l.classList.toggle('fl', l.scrollLeft > 2); l.classList.toggle('fr', l.scrollLeft + l.clientWidth < l.scrollWidth - 2); }
  /** Pastille d'un onglet : nombre de choses à traiter (0 : rien d'affiché). */
  function badge(k, n, what) {
    const b = tabOf(k) && tabOf(k).querySelector('.badge'); if (!b) return;
    b.hidden = !(n > 0); fill(b, n > 0 ? [n > 99 ? '99+' : String(n), h('span', { class: 'sr' }, ' : ' + (what || 'à traiter'))] : []);
  }
  const plural = (n, one, many) => nf(n) + ' ' + (n > 1 ? many || one + 's' : one);
  function badges() {
    const rep = dy.d ? (dy.d.reports || []).length : 0, dk = data && Array.isArray(data.reported) ? data.reported.length : 0, scn = data && data.scans ? (sc.seen >= 0 ? sc.seen : data.scans.n) || 0 : 0;
    badge('signalements', rep + dk + scn, [rep ? plural(rep, 'pseudo') : '', dk ? plural(dk, 'deck') : '', scn ? plural(scn, 'scan') : ''].filter(Boolean).join(', ') + ' à traiter');
    const chk = dy.d ? (dy.d.chk || []).length + (dy.d.sus || []).length : 0;
    badge('mystere', chk, plural(chk, 'partie ou compte', 'parties ou comptes') + ' à vérifier');
    const todo = th.state === 'on' ? thTodoAll() : 0; badge('fils', todo, plural(todo, 'fil') + ' à trier');
    const bad = $$('#srv dd.bad, #health .hi[data-lv="bad"]').length; badge('serveur', bad, plural(bad, 'point', 'points') + ' à regarder');
  }
  function tabsBoot() {
    const l = $('#tabl');
    for (const k of TABS) tabOf(k).addEventListener('click', () => go(k));
    l.addEventListener('keydown', e => {
      const vis = TABS.filter(tabOn), i = Math.max(0, vis.indexOf(tb.cur)); let j = -1;
      if (e.key === 'ArrowRight') j = (i + 1) % vis.length; else if (e.key === 'ArrowLeft') j = (i - 1 + vis.length) % vis.length;
      else if (e.key === 'Home') j = 0; else if (e.key === 'End') j = vis.length - 1; else return;
      e.preventDefault(); go(vis[j], true); tabOf(vis[j]).focus();
    });
    l.addEventListener('scroll', tabEdge, { passive: true });
    addEventListener('hashchange', () => { if (data) tabShow(hashTab()); });
    document.addEventListener('visibilitychange', hcSoon);      // page cachée : plus de relecture de la santé du serveur ; revenue : relue
  }
  /* Blocs repliables (<details>) : ouverts d'office, état de chacun gardé sur cet appareil (rendu à chaque repeint et au rechargement). */
  const FOLD_KEY = 'manaorbit:admin:fold';
  const foldAll = () => { try { return JSON.parse(localStorage.getItem(FOLD_KEY) || '{}') || {}; } catch (e) { return {}; } };
  /** fold(clé, titre (élément), contenu, { meta : à droite du titre, id, cls, shut : fermé d'office }) → <details class="fold">. */
  function fold(k, head, kids, o = {}) {
    const was = foldAll()[k];
    const d = h('details', { class: 'fold' + (o.cls ? ' ' + o.cls : ''), 'data-fold': k, id: o.id, open: was == null ? !o.shut : !!was },
      h('summary', null, h('span', { class: 'fh' }, head, o.meta != null && o.meta !== '' ? h('small', { class: 'fm' }, o.meta) : null), h('span', { class: 'chev', 'aria-hidden': 'true' })),
      h('div', { class: 'fb' }, kids));
    d.addEventListener('toggle', () => { const a = foldAll(); if (a[k] === d.open) return; a[k] = d.open; try { localStorage.setItem(FOLD_KEY, JSON.stringify(a)); } catch (e) { /* stockage absent */ } });
    return d;
  }
  /** En-tête d'une carte : titre, à droite un petit texte (ou des boutons). */
  const chead = (title, small, tag = 'h2') => h('div', { class: 'chead' }, h(tag, null, title), small != null && small !== '' ? (typeof small === 'object' ? small : h('small', null, small)) : null);
  const loading = what => h('div', { class: 'loading', role: 'status' }, h('span', { class: 'spin sm', 'aria-hidden': 'true' }), what || 'Chargement…');
  const empty = t => h('p', { class: 'empty' }, t);

  async function boot() {
    show('vLoad');
    $('#btnIn').addEventListener('click', signIn);
    $('#btnSwitch').addEventListener('click', () => signOut().then(signIn));
    $('#btnOut').addEventListener('click', () => signOut());
    $('#btnRetry').addEventListener('click', () => (user ? load() : show('vOut')));
    $('#btnRefresh').addEventListener('click', refresh);
    $('#btnCsv').addEventListener('click', exportCsv);
    $('#q').addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(() => { st.q = $('#q').value.trim(); st.page = 1; load(); }, 280); });
    $('#sort').addEventListener('change', () => { st.sort = $('#sort').value; st.page = 1; load(); });
    $('#dir').addEventListener('click', () => { st.dir = st.dir === 'desc' ? 'asc' : 'desc'; st.page = 1; load(); });
    tabsBoot();
    let resize = 0; addEventListener('resize', () => { clearTimeout(resize); resize = setTimeout(() => { if (data && tb.cur === 'apercu') charts(); tabEdge(); }, 150); });
    try {
      const [app, auth] = await Promise.all([import(FB_BASE + 'firebase-app.js'), import(FB_BASE + 'firebase-auth.js')]);
      const a = app.getApps().length ? app.getApp() : app.initializeApp(FIREBASE_CONFIG);
      fb = { m: auth, auth: auth.getAuth(a) }; fb.auth.languageCode = 'fr';
      auth.onAuthStateChanged(fb.auth, u => { user = u || null; if (user) load(); else show('vOut'); });
    } catch (e) { show('vErr', 'Le service de connexion (Firebase) ne répond pas.'); }
  }
  async function signIn() {
    if (!fb) return;
    $('#inErr').hidden = true;
    try { const p = new fb.m.GoogleAuthProvider(); p.setCustomParameters({ prompt: 'select_account' }); await fb.m.signInWithPopup(fb.auth, p); }
    catch (e) {
      const c = (e && e.code) || '';
      if (/popup-closed|cancelled-popup/.test(c)) return;
      $('#inErr').textContent = /popup-blocked/.test(c) ? 'Fenêtre bloquée par le navigateur : autorise-la puis réessaie.' : 'Connexion impossible (' + (c.replace('auth/', '') || 'erreur') + ').';
      $('#inErr').hidden = false;
    }
  }
  const signOut = () => (fb ? fb.m.signOut(fb.auth).catch(() => {}) : Promise.resolve());

  /** Appel de l'API admin avec le jeton du compte ; jeton expiré : renouvelé, un seul essai. → { status, body } */
  async function call(path, method, body) {
    for (let a = 0; a < 2; a++) {
      const tok = await user.getIdToken(a > 0);
      const r = await fetch('/api/admin' + path, { method: method || 'GET', cache: 'no-store', headers: { 'x-firebase-token': tok, ...(method === 'POST' ? { 'Content-Type': 'application/json' } : {}) }, ...(method === 'POST' ? { body: JSON.stringify(body || {}) } : {}) });
      const j = await r.json().catch(() => null);      // pas « body » : masquerait le paramètre (zone morte temporelle dans le fetch ci-dessus)
      if (r.status === 401 && j && j.error === 'token_expired' && a === 0) continue;
      return { status: r.status, body: j };
    }
  }
  const qs = () => '?' + new URLSearchParams({ page: st.page, sort: st.sort, dir: st.dir, ...(st.q ? { q: st.q } : {}) });
  /** Lit les statistiques (première ouverture : vue de chargement ; ensuite : la liste se grise le temps de la réponse). */
  async function load(path = '', method = 'GET') {
    const u = user, n = ++busy; if (!u) return;
    if (!data) show('vLoad'); else $('#ulist').classList.add('busy');
    let r;
    try { r = await call(path + qs(), method); } catch (e) { r = null; }
    if (n !== busy || user !== u) return;      // réponse dépassée (autre tri, autre compte)
    $('#ulist').classList.remove('busy');
    if (!r) return data ? toast('Réseau indisponible.') : show('vErr', 'Le serveur ne répond pas.');
    if (r.status === 403 || r.status === 401) return show('vDeny');
    if (r.status === 429) { const m = (r.body && r.body.message) || 'Trop de requêtes.'; return data ? toast(m) : show('vErr', m); }
    if (r.status !== 200 || !r.body) return data ? toast('Le serveur ne répond pas.') : show('vErr', (r.body && r.body.message) || 'Le serveur ne répond pas.');
    data = r.body; render();
  }
  function refresh() { const b = $('#btnRefresh'); b.disabled = true; dc.force = true; th.force = true; qc.force = true; load('/refresh', 'POST').finally(() => { b.disabled = false; }); }
  let toastT = 0;
  function toast(m) { let t = $('.toast'); if (!t) document.body.append(t = h('div', { class: 'toast', role: 'status' })); t.textContent = m; t.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), 3200); }

  function render() {
    const first = !tb.cur;
    show('vMain');
    const d = data, ov = d.ov;
    const src = { auth: 'Firebase Authentication + Firestore', firestore: 'Firestore seulement', none: 'aucune' }[d.src] || d.src;
    fill($('#meta'), d.at ? 'Données du ' + D_TIME.format(d.at) + ' (' + ago(d.at) + ') · source : ' + src + ' · gardées ' + Math.round(d.ttl / 60e3) + ' min' : 'Pas encore de données.');
    fill($('#notes'), (d.notes || []).map(x => h('p', { class: 'note', 'data-k': x.k }, x.t)));
    const sk = d.scans ? kpi('Scans signalés', nf(d.scans.n), nf(d.scans.n7) + ' en 7 jours · ' + String(d.scans.mb).replace('.', ',') + ' Mo', 'scans') : null;
    if (sk) kpiGo(sk, 'signalements', '#scans');
    fill($('#kpis'), ov ? kpis(ov) : [], sk);
    if (dy.d) dyKpi();      // tuile « Pseudos signalés » gardée d'un calcul à l'autre (relue ensuite par daily())
    fill($('#mix'), ov ? mix(ov) : []);
    users(d.users);
    scans(d.scans);
    pubrep(d.reported || []);
    journal(d.log);
    server(d.srv);
    if (!hc.at && !hc.busy) health();      // santé du serveur : lue une fois (pastille de l'onglet), puis toutes les 20 s sur l'onglet
    if (first) tabShow(hashTab()); else if (tb.cur === 'apercu') charts();
    if (first && tb.cur !== 'apercu') charts();      // dessinés une fois (onglet caché : largeur par défaut, redessinés à l'affichage)
    daily();
    discord();
    threads();
    qrcodes();
    badges();
  }
  /** Les deux graphiques, à la largeur de leur carte (redessinés quand la vue d'ensemble s'affiche ou que la fenêtre change). */
  function charts() { if (!data) return; if (data.ov) chart(data.ov); else $('#chart').replaceChildren(); achart(data.active); }
  const kpi = (label, val, sub, k) => h('div', { class: 'kpi', 'data-k': k }, h('span', { class: 'l' }, label), h('b', null, val), sub ? h('small', null, sub) : null);
  /** Tuile qui mène à son onglet (clic, Entrée, Espace) et, si sel, à cette carte (dépliée). */
  function kpiGo(t, tab, sel) {
    t.setAttribute('role', 'link'); t.tabIndex = 0; t.classList.add('go'); t.title = 'Ouvrir';
    const run = () => { go(tab); const x = sel && $(sel); if (!x || x.hidden) return; const f = x.matches('details') ? x : x.querySelector('details.fold'); if (f) f.open = true; x.scrollIntoView({ block: 'start' }); };
    t.addEventListener('click', run); t.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); run(); } });
    return t;
  }
  function kpis(ov) {
    return [
      kpiGo(kpi('Comptes', nf(ov.users), nf(ov.mo) + ' avec des données Mana Orbit', 'users'), 'comptes'),
      kpi('Nouveaux', nf(ov.new7) + ' · ' + nf(ov.new30), '7 jours · 30 jours', 'new'),
      kpi('Actifs', nf(ov.act7) + ' · ' + nf(ov.act30), '7 j · 30 j · connectés ' + nf(ov.log7) + ' · ' + nf(ov.log30), 'act'),
      kpi('Cartes', nf(ov.cards), nf(ov.copies) + ' exemplaires · ' + nf(ov.colls) + ' collections', 'cards'),
      kpi('Decks', nf(ov.decks), nf(ov.pub) + ' publié' + (ov.pub > 1 ? 's' : '') + ' · ' + nf(ov.reports) + ' signalement' + (ov.reports > 1 ? 's' : ''), 'decks'),
      kpi('Échange', nf(ov.trade), 'liens actifs · ' + nf(ov.dlinks) + ' decks partagés', 'trade'),
      kpi('Amis', nf(ov.friendships), 'amitiés · ' + nf(ov.pending) + ' demande' + (ov.pending > 1 ? 's' : '') + ' en attente', 'friends'),
      kpi('Valeur', EUR.format((ov.value || 0) / 100), nf(ov.valued) + ' collection' + (ov.valued > 1 ? 's' : '') + ' estimée' + (ov.valued > 1 ? 's' : ''), 'value'),
    ];
  }
  /** Cadre des deux graphiques (30 jours) : repères discrets (maximum, moitié), ligne de base, dates du premier jour, du milieu et du dernier. */
  function frame(box, days, max, aria) {
    const W = Math.max(260, Math.round(box.clientWidth - 32) || 320), H = 150, top = 14, bot = 22, left = 26, plotW = W - left - 4, plotH = H - top - bot, step = plotW / Math.max(1, days.length);
    const svg = s('svg', { width: W, height: H, viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': aria });
    for (const v of max > 1 ? [max, Math.round(max / 2)] : [max]) {      // repères discrets : maximum et moitié
      const y = top + plotH - v / max * plotH;
      svg.append(s('line', { x1: left, x2: W - 4, y1: y, y2: y, class: 'grid' }));
      const t = s('text', { x: left - 6, y: y + 4, class: 'ax', 'text-anchor': 'end' }); t.textContent = String(v); svg.append(t);
    }
    svg.append(s('line', { x1: left, x2: W - 4, y1: top + plotH, y2: top + plotH, class: 'base' }));
    for (const i of [0, Math.floor(days.length / 2), days.length - 1]) {
      if (!days[i]) continue;
      const t = s('text', { x: left + i * step + step / 2, y: H - 6, class: 'ax', 'text-anchor': i === 0 ? 'start' : i === days.length - 1 ? 'end' : 'middle' });
      t.textContent = D_DAY.format(Date.parse(days[i][0] + 'T12:00:00Z')); svg.append(t);
    }
    return { svg, top, left, plotH, step, y: v => top + plotH - v / max * plotH };
  }
  /** Inscriptions par jour (30 derniers jours) : barres fines arrondies en haut, posées sur la ligne de base ; survol : jour et nombre. */
  function chart(ov) {
    const box = $('#chart'), days = ov.days || [], total = days.reduce((t, x) => t + x[1], 0);
    const head = h('div', { class: 'chead' }, h('h2', null, 'Inscriptions par jour'), h('small', null, nf(total) + ' en 30 jours'));
    const max = Math.max(1, ...days.map(x => x[1])), { svg, top, left, plotH, step } = frame(box, days, max, 'Inscriptions par jour sur 30 jours : ' + total + ' au total'), bw = Math.max(3, step - 2);
    days.forEach(([day, n], i) => {
      const x = left + i * step + (step - bw) / 2, bh = n ? Math.max(3, n / max * plotH) : 0, y = top + plotH - bh, r = Math.min(4, bw / 2, bh);
      const g = s('g', { class: 'bar' + (n ? '' : ' zero') }), label = D_DAY.format(Date.parse(day + 'T12:00:00Z')) + ' : ' + n + ' inscription' + (n > 1 ? 's' : '');
      const tt = s('title'); tt.textContent = label; g.append(tt);
      g.append(s('rect', { x: left + i * step, y: top, width: step, height: plotH, class: 'hit' }));      // zone de survol plus grande que la barre
      if (n) g.append(s('path', { d: `M${x},${top + plotH}V${y + r}Q${x},${y} ${x + r},${y}H${x + bw - r}Q${x + bw},${y} ${x + bw},${y + r}V${top + plotH}Z`, class: 'fill' }));
      svg.append(g);
    });
    box.replaceChildren(head, svg);
  }
  /** Comptes actifs par jour (relevés du serveur : comptes dont la dernière activité tombe ce jour-là, heure de Paris) : ligne de 2 px et aire légère,
   *  un point par jour relevé, rien pour un jour sans relevé (jamais deviné) ; survol : jour et nombre. */
  function achart(a) {
    const box = $('#achart'); if (!a || !Array.isArray(a.days)) return box.replaceChildren();
    const days = a.days, known = days.filter(x => x[1] != null), last = days.length ? days[days.length - 1][1] : null;
    const head = h('div', { class: 'chead' }, h('h2', null, 'Actifs par jour'), h('small', null, last != null ? nf(last) + ' aujourd\'hui' : 'pas encore relevé aujourd\'hui'));
    const max = Math.max(1, ...known.map(x => x[1])), { svg, top, left, plotH, step, y } = frame(box, days, max, 'Comptes actifs par jour sur 30 jours' + (last != null ? ' : ' + last + ' aujourd\'hui' : ''));
    const X = i => left + i * step + step / 2, runs = [];      // suites de jours relevés : une ligne chacune (un trou pour un jour sans relevé)
    days.forEach(([, n], i) => { if (n == null) return; const r = runs[runs.length - 1]; if (r && r[r.length - 1] === i - 1) r.push(i); else runs.push([i]); });
    for (const r of runs) {
      const pts = r.map(i => X(i) + ',' + y(days[i][1])).join(' L');
      if (r.length > 1) svg.append(s('path', { d: `M${X(r[0])},${top + plotH} L${pts} L${X(r[r.length - 1])},${top + plotH}Z`, class: 'area' }), s('path', { d: 'M' + pts, class: 'line' }));
    }
    days.forEach(([day, n], i) => {
      const g = s('g', { class: 'pt' + (n == null ? ' none' : '') }), tt = s('title');
      tt.textContent = D_DAY.format(Date.parse(day + 'T12:00:00Z')) + ' : ' + (n == null ? 'pas de relevé' : n + ' compte' + (n > 1 ? 's' : '') + ' actif' + (n > 1 ? 's' : '')); g.append(tt);
      g.append(s('rect', { x: left + i * step, y: top, width: step, height: plotH, class: 'hit' }));
      if (n != null) g.append(s('circle', { cx: X(i), cy: y(n), r: 4, class: 'dot' }));
      svg.append(g);
    });
    const since = a.since ? Date.parse(a.since + 'T12:00:00Z') : 0, first = days.length ? Date.parse(days[0][0] + 'T12:00:00Z') : 0;
    box.replaceChildren(head, svg, h('p', { class: 'hint ahint' }, (since > first ? 'Relevés depuis le ' + D_DAY.format(since) + ' : les jours d\'avant restent vides. ' : '')
      + 'Le serveur note chaque jour les comptes actifs (connexion, session renouvelée ou donnée modifiée ce jour-là)' + (a.every > 0 ? (a.every === 3600e3 ? ', chaque heure' : ', toutes les ' + (a.every > 3600e3 ? Math.round(a.every / 3600e3) + ' h' : a.every >= 60e3 ? Math.round(a.every / 60e3) + ' min' : Math.round(a.every / 1000) + ' s')) : ', à chaque calcul') + '.'));
  }
  const kv = (k, v, cls) => [h('dt', null, k), h('dd', cls ? { class: cls } : null, v)];
  function mix(ov) {
    const prov = Object.entries(ov.prov || {}).sort((a, b) => b[1] - a[1]).map(([p, n]) => (PROV[p] || p) + ' ' + nf(n)).join(' · ') || '—';
    const langs = Object.entries(ov.langs || {}).sort((a, b) => b[1] - a[1]).map(([l, n]) => l.toUpperCase() + ' ' + nf(n)).join(' · ') || '—';
    return [h('h2', null, 'Comptes'), h('dl', { class: 'kv' },
      kv('Connexion', prov), kv('Adresse vérifiée', ov.verified == null ? '—' : nf(ov.verified) + ' / ' + nf(ov.users)), kv('Comptes désactivés', nf(ov.disabled)),
      kv('Langue (amis)', langs), kv('Comptes « amis »', nf(ov.amis)), kv('Cartes recherchées', nf(ov.wish)))];
  }
  const SORT_COL = { created: 'Inscription', login: 'Connexion', seen: 'Activité', cards: 'Cartes', decks: 'Decks' };
  function users(u) {
    $('#uCount').textContent = '(' + nf(u.total) + ')';
    $('#q').value = st.q; $('#sort').value = u.sort; st.sort = u.sort; st.dir = u.dir; st.page = u.page;
    $('#dir').textContent = u.dir === 'asc' ? '↑' : '↓'; $('#dir').setAttribute('aria-label', u.dir === 'asc' ? 'Ordre croissant' : 'Ordre décroissant');
    const th = (label, key, r) => h('th', { scope: 'col', ...(r ? { class: 'r' } : {}), ...(key ? { 'data-sort': key, class: 'sortable' + (r ? ' r' : '') + (u.sort === key ? ' on' : ''), 'aria-sort': u.sort === key ? (u.dir === 'asc' ? 'ascending' : 'descending') : null, tabindex: 0 } : {}) }, label, key && u.sort === key ? (u.dir === 'asc' ? ' ↑' : ' ↓') : '');
    const head = h('thead', null, h('tr', null, th('Utilisateur'), th('Inscription', 'created'), th('Connexion', 'login'), th('Activité', 'seen'), th('Cartes', 'cards', 1), th('Decks', 'decks', 1), th('Publics', '', 1), th('Échange'), th('Amis', '', 1), th('Valeur', '', 1)));
    const td = (label, main, sub, cls) => h('td', { 'data-l': label, class: cls }, h('span', { class: 'v' }, main), sub ? h('small', null, sub) : null);
    const rows = u.rows.map(r => h('tr', { 'data-id': r.id, class: r.mo ? null : 'nomo' },
      h('td', { class: 'who' }, h('span', { class: 'av', 'aria-hidden': 'true' }, ([...(r.name || r.mail || '?')][0] || '?').toUpperCase()),
        h('span', { class: 'id' }, h('b', { class: 'nm' }, r.name || 'Sans nom'), h('small', { class: 'ml' }, r.mail || (r.prov.length ? '' : 'e-mail inconnu')),
          h('span', { class: 'tags' }, r.prov.map(p => h('span', { class: 'tag' }, PROV[p] || p)), r.verified === false ? h('span', { class: 'tag warn' }, 'non vérifié') : null,
            r.disabled ? h('span', { class: 'tag bad' }, 'désactivé') : null, r.mo ? null : h('span', { class: 'tag' }, 'sans données'), r.lang ? h('span', { class: 'tag' }, r.lang.toUpperCase()) : null),
          data.acts ? uacts(r) : null)),
      td('Inscription', r.created ? D_SHORT.format(r.created) : '—', null, 'dt'), td('Connexion', ago(r.login), null, 'dt'), td('Activité', ago(r.seen), null, 'dt'),
      td('Cartes', nf(r.cards), r.copies ? nf(r.copies) + ' ex.' : null, 'num'), td('Decks', nf(r.decks), null, 'num'), td('Publics', nf(r.pub), null, 'num'),
      td('Échange', r.trade ? 'Lien actif' : '—', [r.dlinks ? r.dlinks + ' deck' + (r.dlinks > 1 ? 's' : '') + ' partagé' + (r.dlinks > 1 ? 's' : '') : '', r.wish ? r.wish + ' cherchée' + (r.wish > 1 ? 's' : '') : ''].filter(Boolean).join(' · ') || null),
      td('Amis', nf(r.friends), r.inc || r.out ? [r.inc ? r.inc + ' reçue' + (r.inc > 1 ? 's' : '') : '', r.out ? r.out + ' envoyée' + (r.out > 1 ? 's' : '') : ''].filter(Boolean).join(' · ') : null, 'num'),
      td('Valeur', r.value ? EUR.format(r.value / 100) : '—', null, 'num')));
    const table = h('table', { class: 'ut' }, head, h('tbody', null, rows));
    table.querySelectorAll('th[data-sort]').forEach(e => {
      const go = () => { const k = e.getAttribute('data-sort'); if (st.sort === k) st.dir = st.dir === 'desc' ? 'asc' : 'desc'; else { st.sort = k; st.dir = 'desc'; } st.page = 1; load(); };
      e.addEventListener('click', go); e.addEventListener('keydown', ev => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); go(); } });
    });
    $('#ulist').replaceChildren(u.rows.length ? table : h('p', { class: 'empty' }, u.q ? 'Aucun compte pour « ' + u.q + ' ».' : 'Aucun compte.'));
    const nav = (label, p, dis) => { const b = h('button', { class: 'btn ghost small', type: 'button', disabled: dis, 'data-page': p }, label); b.addEventListener('click', () => { st.page = p; load(); $('.users').scrollIntoView({ block: 'start' }); }); return b; };
    $('#pager').replaceChildren(...(u.pages > 1 ? [nav('‹ Précédente', u.page - 1, u.page <= 1), h('span', { class: 'pg' }, 'Page ' + u.page + ' / ' + u.pages), nav('Suivante ›', u.page + 1, u.page >= u.pages)] : []));
    $('#sort').title = 'Trié par ' + SORT_COL[u.sort].toLowerCase();
  }
  /** Téléchargement d'un fichier reçu (lien temporaire : aucun en ligne, CSP). */
  function save(blob, name) {
    const url = URL.createObjectURL(blob), a = h('a', { href: url, download: name }); document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }
  /** « CSV » : GET /api/admin/export avec le tri et la recherche en cours (le serveur réduit les champs comme la liste). */
  async function exportCsv() {
    const b = $('#btnCsv'), u = user; if (!u) return; b.disabled = true;
    try {
      for (let a = 0; a < 2; a++) {
        const r = await fetch('/api/admin/export' + qs(), { cache: 'no-store', headers: { 'x-firebase-token': await u.getIdToken(a > 0) } });
        if (r.ok) { save(await r.blob(), (/filename="([^"]+)"/.exec(r.headers.get('content-disposition') || '') || [])[1] || 'comptes-mana-orbit.csv'); return toast(nf(data ? data.users.total : 0) + ' compte' + (data && data.users.total > 1 ? 's' : '') + ' exporté' + (data && data.users.total > 1 ? 's' : '') + '.'); }
        const j = await r.json().catch(() => null); if (r.status === 401 && j && j.error === 'token_expired' && a === 0) continue;
        return toast((j && j.message) || 'Export impossible.');
      }
    } catch (e) { toast('Réseau indisponible.'); } finally { b.disabled = false; }
  }

  /* Actions (proxy.mjs › admAct) : désactiver / réactiver un compte (fenêtre de confirmation qui dit lequel), retirer un deck public (deux appuis,
     depuis les decks d'un compte ou la liste des signalés). Erreur (rôle IAM manquant…) : dans la fenêtre, le temps de la lire. Puis liste relue. */
  /** Fenêtre (dialog) : titre, textes, boutons [libellé, valeur, classe] → valeur du bouton touché ('' : fermée, Échap). */
  function dlg(title, body, btns) {
    const d = $('#dlg'); if (d.open) d.close();
    return new Promise(done => {
      fill(d, h('h2', { id: 'dlgT' }, title), body, h('div', { class: 'dlgb' }, btns.map(([label, v, cls]) => { const b = h('button', { class: 'btn ' + (cls || 'ghost'), type: 'button', 'data-v': v }, label); b.addEventListener('click', () => d.close(v)); return b; })));
      d.returnValue = ''; d.addEventListener('close', () => done(d.returnValue), { once: true }); d.showModal();
      const f = d.querySelector('.dlgb .btn.ghost'); if (f) f.focus();      // Annuler en premier : rien ne part par mégarde
    });
  }
  const oops = (x, m) => dlg('Action impossible', [h('p', null, (x && x.body && x.body.message) || m)], [['OK', 'ok']]);
  function uacts(r) {
    const off = h('button', { class: 'btn ghost tiny', type: 'button', 'data-act': r.disabled ? 'on' : 'off' }, r.disabled ? 'Réactiver' : 'Désactiver');
    off.addEventListener('click', () => toggle(r, off));
    const pub = r.pub ? h('button', { class: 'btn ghost tiny', type: 'button', 'data-act': 'pub' }, 'Decks publics (' + nf(r.pub) + ')') : null;
    if (pub) pub.addEventListener('click', () => decksOf(r, pub));
    return h('span', { class: 'uacts' }, off, pub);
  }
  async function toggle(r, b) {
    const on = !r.disabled, who = r.name || 'ce compte';
    const v = await dlg(on ? 'Désactiver ' + who + ' ?' : 'Réactiver ' + who + ' ?', [h('p', { class: 'dlgw' }, [r.name || 'Sans nom', r.mail].filter(Boolean).join(' · ')),
      h('p', null, on ? 'Le compte ne pourra plus se connecter ni renouveler sa session (celle en cours reste valable une heure au plus). Ses données restent ; « Réactiver » le rend.' : 'Le compte pourra de nouveau se connecter.')],
      [['Annuler', ''], [on ? 'Désactiver' : 'Réactiver', 'ok', on ? 'main danger' : 'main']]);
    if (v !== 'ok') return;
    b.disabled = true; let x; try { x = await call('/disable', 'POST', { id: r.id, on }); } catch (e) { x = null; }
    b.disabled = false; if (x && x.body && Array.isArray(x.body.log)) journal(x.body.log);
    if (!x || x.status !== 200 || !x.body) return oops(x, 'Modification impossible : le serveur ne répond pas.');
    toast(on ? 'Compte désactivé.' : 'Compte réactivé.'); load();
  }
  /** Decks publics d'un compte (GET /api/admin/pubdecks?id=) dans la fenêtre, chacun avec « Retirer ». */
  async function decksOf(r, b) {
    b.disabled = true; let x; try { x = await call('/pubdecks?id=' + encodeURIComponent(r.id)); } catch (e) { x = null; } b.disabled = false;
    if (!x || x.status !== 200 || !x.body) return oops(x, 'Decks publics illisibles.');
    const list = h('div', { class: 'dyl pdl', 'data-empty': 'Aucun deck public.' }, x.body.rows.length ? x.body.rows.map(p => deckRow(p, false)) : [h('p', { class: 'empty' }, 'Aucun deck public.')]);
    dlg('Decks publics de ' + (r.name || 'Sans nom'), [h('p', { class: 'dlgw' }, r.mail || ''), h('p', { class: 'hint' }, 'Tels que la Communauté les montre (pseudo, commandants). « Retirer » efface le deck public : il disparaît de la Communauté tout de suite ; son auteur peut le republier.'), list], [['Fermer', '']]);
  }
  /** Un deck public : commandants, pseudo, compte (liste des signalés) ou emplacement, signalements, masqué ; « Retirer » puis « Confirmer le retrait ». */
  function deckRow(p, owner) {
    const del = h('button', { class: 'btn ghost small sdel', type: 'button' }, 'Retirer');
    const row = h('div', { class: 'dyr pdr', 'data-k': p.k }, h('span', { class: 'pdt' }, h('b', null, p.cmd.join(' + ') || 'Sans commandant'),
      h('small', null, ['par ' + (p.by || '?'), owner ? (p.name || 'compte inconnu') + (p.mail ? ' (' + p.mail + ')' : '') : 'emplacement ' + (p.slot + 1), p.at ? 'publié le ' + D_SHORT.format(p.at) : ''].filter(Boolean).join(' · '))),
      p.rep ? h('span', { class: 'tag warn' }, nf(p.rep) + ' signalement' + (p.rep > 1 ? 's' : '')) : null, p.hid ? h('span', { class: 'tag bad' }, 'masqué') : null, del);
    let armT = 0;
    del.addEventListener('click', async () => {
      if (!del.classList.contains('arm')) { del.classList.add('arm'); del.textContent = 'Confirmer le retrait'; clearTimeout(armT); armT = setTimeout(() => { del.classList.remove('arm'); del.textContent = 'Retirer'; }, 4000); return; }
      clearTimeout(armT); del.disabled = true;
      let x; try { x = await call('/pubdel', 'POST', { k: p.k }); } catch (e) { x = null; }
      if (x && x.body && Array.isArray(x.body.log)) journal(x.body.log);
      if (!x || x.status !== 200 || !x.body) { del.disabled = false; del.classList.remove('arm'); del.textContent = 'Retirer'; return oops(x, 'Retrait impossible : le serveur ne répond pas.'); }
      for (const e of $$('.pdr[data-k="' + p.k + '"]')) { const l = e.parentNode; e.remove(); if (l && !l.querySelector('.pdr')) l.replaceChildren(h('p', { class: 'empty' }, l.dataset.empty || '')); }      // dans la fenêtre et dans la liste des signalés
      toast(x.body.gone ? 'Déjà retiré par son auteur.' : 'Deck retiré de la Communauté.'); load();
    });
    return row;
  }
  /** Decks publics signalés (« Signaler ce deck » dans la Communauté), les plus signalés d'abord. */
  function pubrep(list) {
    const n = (data && data.pubMax) || 3;
    fill($('#pubrep'), fold('pubrep', h('h2', null, 'Decks publics signalés'), [
      h('p', { class: 'hint' }, '« Signaler ce deck » dans la Communauté ; au bout de ' + n + ' signalements, le deck est masqué tout seul. « Retirer » efface le deck public : il disparaît de la Communauté tout de suite ; son auteur peut le republier (ses signalements restent).'),
      h('div', { class: 'dyl pdl', 'data-empty': 'Aucun deck signalé.' }, list.length ? list.map(p => deckRow(p, true)) : [empty('Aucun deck signalé.')])], { meta: plural(list.length, 'deck') }));
  }
  const ACT = { off: ['Compte désactivé', 'Désactivation refusée'], on: ['Compte réactivé', 'Réactivation refusée'], pub: ['Deck public retiré', 'Retrait refusé'],
    qrnew: ['QR code créé', 'Création refusée'], qrto: ['Destination d\'un QR code changée', 'Changement refusé'], qrname: ['QR code renommé', 'Renommage refusé'] };
  /** Journal des actions (tenu par le serveur, les plus récentes d'abord) : action, compte (nom réduit, e-mail masqué), deck, date, éditeur. */
  function journal(log) {
    const box = $('#journal'), head = chead('Journal des actions', log && log.length ? nf(log.length) + ' dernière' + (log.length > 1 ? 's' : '') : '');
    if (log == null) return box.replaceChildren(head, h('p', { class: 'note' }, 'Journal des actions illisible sur le serveur.'));
    box.replaceChildren(head, h('p', { class: 'hint' }, 'Tenu par le serveur (500 dernières actions, réussies ou refusées) : nom réduit et e-mail masqué seulement.'), h('div', { class: 'dyl' }, log.length ? log.map(e => h('div', { class: 'dyr' + (e.ok ? '' : ' ko'), 'data-a': e.a },
      h('span', { class: 'pdt' }, h('b', null, (ACT[e.a] || [e.a, e.a])[e.ok ? 0 : 1]), h('small', null, [e.n || (e.a === 'pub' ? 'compte inconnu' : 'Sans nom'), e.m, e.d, e.t ? D_TIME.format(e.t) : '', e.by ? 'par ' + e.by : ''].filter(Boolean).join(' · '))),
      e.ok ? (e.e ? h('span', { class: 'tag' }, e.e) : null) : h('span', { class: 'tag bad' }, e.e || 'échec'))) : [h('p', { class: 'empty' }, 'Aucune action pour l\'instant.')]));
  }
  /* Scans signalés depuis l'appli (« Signaler un problème de scan », proxy.mjs › /api/admin/scans) : du plus récent au plus ancien, par pages ; la photo est
     demandée au serveur avec le jeton (jamais publique) quand la fiche apparaît, puis affichée en data: (CSP) ; données de lecture dépliables ; Supprimer (deux appuis). */
  const SCAN_WHAT = { card: 'Mauvaise carte', lang: 'Mauvaise langue', ed: 'Mauvaise édition', miss: 'Non reconnue', other: 'Autre' };
  const SCAN_SRC = { natcam: 'caméra de l\'appli', webcam: 'caméra du navigateur', photo: '« Photos »', auto: 'scan automatique' };
  const SCAN_FRAME = { card: 'carte entière', name: 'nom seulement', photo: 'photo entière' };
  const sc = { page: 0, pages: 0, total: 0, seen: -1, gen: 0, busy: false };
  const scIo = typeof IntersectionObserver === 'function' ? new IntersectionObserver(es => { for (const e of es) if (e.isIntersecting) { scIo.unobserve(e.target); scImg(e.target); } }, { rootMargin: '300px' }) : null;
  const scSum = sum => nf(sum.n) + ' signalement' + (sum.n > 1 ? 's' : '') + ' · ' + String(sum.mb).replace('.', ',') + ' Mo · gardés ' + sum.days + ' jours, ' + nf(sum.max) + ' au plus';
  function scans(sum) {
    const box = $('#scans');
    if (!sum) { box.hidden = true; box.replaceChildren(); return; }
    box.hidden = false;
    if (!$('#scList')) fill(box, fold('scans', h('h2', null, 'Scans signalés'), [
      h('p', { class: 'hint' }, '« Signaler un problème de scan » dans l\'appli : la photo de la carte et ce que l\'appli a lu. Effacés après ' + sum.days + ' jours.'),
      sum.err ? h('p', { class: 'note' }, 'Dossier des signalements illisible sur le serveur.') : null, h('div', { class: 'scl', id: 'scList' }, loading('Chargement des signalements…')), h('div', { class: 'pager', id: 'scMore' })],
      { meta: h('span', { id: 'scCount' }) }));
    $('#scCount').textContent = scSum(sum);
    if (sc.seen !== sum.n) { sc.seen = sum.n; scLoad(1); }      // nouveaux signalements (ou première ouverture) : première page relue
  }
  async function scLoad(page) {
    const g = sc.gen; if (sc.busy && page > 1) return; sc.busy = true;
    let r; try { r = await call('/scans?page=' + page); } catch (e) { r = null; }
    sc.busy = false; if (g !== sc.gen || !$('#scList')) return;
    if (!r || r.status !== 200 || !r.body) return toast((r && r.body && r.body.message) || 'Scans signalés : le serveur ne répond pas.');
    const b = r.body; sc.page = b.page; sc.pages = b.pages; sc.total = b.total;
    const list = $('#scList'), rows = b.rows.map(scRow);
    if (page === 1) list.replaceChildren(...(rows.length ? rows : [h('p', { class: 'empty' }, 'Aucun scan signalé pour l\'instant.')])); else list.append(...rows);
    $('#scCount').textContent = scSum(b); scMore(); badges();
  }
  function scMore() {
    const box = $('#scMore'), left = sc.total - $$('#scList .scr').length;
    if (sc.page >= sc.pages || left <= 0) return box.replaceChildren();
    const b = h('button', { class: 'btn ghost small', type: 'button' }, 'Afficher les suivants (' + nf(left) + ')');
    b.addEventListener('click', () => { b.disabled = true; scLoad(sc.page + 1); });
    box.replaceChildren(b);
  }
  /** Photo d'un signalement : GET /api/admin/scans/<id>.jpg avec le jeton, affichée en data: (img-src de la CSP). */
  async function scImg(img) {
    const u = user, g = sc.gen;
    try {
      const tok = await u.getIdToken(false), r = await fetch('/api/admin/scans/' + encodeURIComponent(img.dataset.id) + '.jpg', { cache: 'no-store', headers: { 'x-firebase-token': tok } });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const blob = await r.blob(), url = await new Promise((ok, ko) => { const f = new FileReader(); f.onload = () => ok(String(f.result)); f.onerror = () => ko(f.error); f.readAsDataURL(blob); });
      if (g === sc.gen && user === u) { img.src = url; img.closest('.scph').classList.add('ok'); }
    } catch (e) { if (img.isConnected) { img.closest('.scph').classList.add('bad'); img.alt = 'Photo indisponible'; } }
  }
  function scRow(r) {
    const m = r.meta && typeof r.meta === 'object' ? r.meta : {}, rd = m.read && typeof m.read === 'object' ? m.read : {}, hit = rd.hit || null, ln = m.line || {}, foot = rd.foot || null;
    const ft = (foot && foot.ft) || (hit && hit.ft) || null;
    const card = ln.name ? (ln.shown && ln.shown !== ln.name ? ln.shown + ' (' + ln.name + ')' : ln.name) : hit ? hit.name : 'Nom non reconnu' + (ln.label ? ' · ' + ln.label : '');
    const lang = String(ln.l || (hit && hit.card) || '').toUpperCase(), ed = ln.e ? String(ln.e).replace('|', ' ').toUpperCase() : ft && ft.codes && ft.codes.length ? ft.codes[0] + (ft.nums && ft.nums[0] ? ' ' + ft.nums[0] : '') : '';
    const eng = rd.ocr === 'mlkit' ? 'ML Kit' : rd.ocr === 'tesseract' ? 'Tesseract' : 'moteur ?';
    const app = m.app === 'android' ? 'appli Android' + (m.apk ? ' (APK ' + m.apk + ')' : '') : m.app === 'pwa' ? 'appli installée (PWA)' : m.app === 'web' ? 'navigateur' : '';
    const img = h('img', { alt: 'Photo du scan', 'data-id': r.id }), ph = h('button', { class: 'scph', type: 'button', 'aria-label': 'Agrandir la photo', 'aria-expanded': 'false' }, img);
    ph.addEventListener('click', () => { const on = !ph.classList.contains('big'); ph.classList.toggle('big', on); ph.setAttribute('aria-expanded', String(on)); });
    if (scIo) scIo.observe(img); else scImg(img);
    const del = h('button', { class: 'btn ghost small sdel', type: 'button' }, 'Supprimer');
    const art = h('article', { class: 'scr', 'data-id': r.id }, ph, h('div', { class: 'scb' },
      h('div', { class: 'sct' }, h('span', { class: 'tag warn' }, SCAN_WHAT[r.what] || String(r.what || '?')), h('small', null, r.t ? D_TIME.format(r.t) + ' (' + ago(r.t) + ')' : '—')),
      h('p', { class: 'scc' }, h('b', null, card), [lang, ed, hit && Number.isFinite(hit.score) ? Math.round(hit.score * 100) + ' %' : '', ln.maybe ? 'à vérifier' : ''].filter(Boolean).map(x => ' · ' + x).join('')),
      rd.raw || rd.first || (foot && foot.raw) ? h('p', { class: 'scm' }, [rd.raw || rd.first ? 'Lu « ' + (rd.raw || rd.first) + ' »' : '', foot && foot.raw ? 'bas « ' + foot.raw + ' »' : ''].filter(Boolean).join(' · ')) : null,
      h('p', { class: 'scm' }, [eng + (Array.isArray(rd.langs) && rd.langs.length ? ' (' + rd.langs.join('+') + ')' : ''), SCAN_FRAME[rd.frame] || '', SCAN_SRC[rd.src] || '', app, m.build ? 'version ' + m.build : '', m.ui ? 'interface ' + String(m.ui).toUpperCase() : '', r.acct ? 'compte ' + r.acct.slice(0, 8) : 'sans compte'].filter(Boolean).join(' · ')),
      r.note ? h('p', { class: 'scn' }, '« ' + r.note + ' »') : null,
      h('details', { class: 'scd' }, h('summary', null, 'Données de lecture'), h('pre', null, JSON.stringify({ what: r.what, note: r.note, acct: r.acct, img: r.img, meta: m }, null, 2))),
      h('div', { class: 'flags' }, del)));
    let armT = 0;
    del.addEventListener('click', async () => {
      if (!del.classList.contains('arm')) { del.classList.add('arm'); del.textContent = 'Confirmer la suppression'; clearTimeout(armT); armT = setTimeout(() => { del.classList.remove('arm'); del.textContent = 'Supprimer'; }, 4000); return; }
      clearTimeout(armT); del.disabled = true;
      let x; try { x = await call('/scans/' + encodeURIComponent(r.id), 'DELETE'); } catch (e) { x = null; }
      if (!x || x.status !== 200 || !x.body) { del.disabled = false; return toast((x && x.body && x.body.message) || 'Suppression impossible.'); }
      art.remove(); sc.total = Math.max(0, sc.total - 1); sc.seen = x.body.n; $('#scCount').textContent = scSum(x.body); scMore();
      const k = $('#kpis [data-k="scans"] b'); if (k) k.textContent = nf(x.body.n);
      if (!$('#scList .scr')) $('#scList').replaceChildren(empty('Aucun scan signalé pour l\'instant.'));
      badges(); toast('Signalement supprimé.');
    });
    return art;
  }
  /* Carte mystère (proxy.mjs › /api/admin/daily, daily-srv.mjs) : onglet « Carte mystère » : en-tête (numéro, jour, parties) toujours visible, puis des blocs
     repliables : réponse du jour (repliée à part) et joueurs des 7 derniers jours (et niveau de compte) ; « Masquer » remplace un pseudo par « Pseudo masqué »
     dans tous les classements, jeu et niveaux (le score reste), « Rétablir » le rend. Anti-triche : parties « à vérifier » (même réseau, juste après un autre
     joueur : hors du top 100 public) et comptes trop souvent trouvés à l'étape 1 (signalés seulement) ; « Valider » les remet. Pseudos signalés depuis les
     classements : onglet « Signalements ». Pseudos écrits en textContent seulement. */
  const dy = { gen: 0, q: '', d: null };
  const unacc = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  async function daily() {
    const g = ++dy.gen, box = $('#daily');
    if (!box.firstChild) { box.hidden = false; fill(box, chead('Carte mystère'), loading()); }      // première ouverture : la carte se montre tout de suite
    let r; try { r = await call('/daily'); } catch (e) { r = null; }
    if (g !== dy.gen) return;
    if (r && r.status === 404) {      // DAILY=0 sur le serveur : ni onglet, ni tuile, ni pseudos signalés
      dy.d = null; box.hidden = true; box.replaceChildren(); $('#dyRepCard').hidden = true; $('#dyRepCard').replaceChildren();
      const k = $('#kpis [data-k="pseudos"]'); if (k) k.remove();
      tabOf('mystere').hidden = true; if (tb.cur === 'mystere') tabShow('apercu'); badges(); return;
    }
    box.hidden = false; tabOf('mystere').hidden = false;
    if (!r || r.status !== 200 || !r.body) { $('#dyRepCard').hidden = true; return fill(box, chead('Carte mystère'), h('p', { class: 'note' }, (r && r.body && r.body.message) || 'Le serveur ne répond pas.')); }
    dy.d = r.body; dyPaint(); dyKpi();
  }
  /** Tuile « Pseudos signalés » en haut du panneau (signalements des classements à traiter) ; un appui mène à la liste (onglet « Signalements »). */
  function dyKpi() {
    const rep = (dy.d && dy.d.reports) || [], hid = rep.filter(r => r.hid).length, old = $('#kpis [data-k="pseudos"]');
    const t = kpiGo(kpi('Pseudos signalés', nf(rep.length), rep.length ? nf(hid) + ' masqué' + (hid > 1 ? 's' : '') + ' en attente de ta décision' : 'rien à traiter', 'pseudos'), 'signalements', '#dyRepCard');
    if (rep.length) t.classList.add('alert');
    if (old) old.replaceWith(t); else $('#kpis').append(t);
    badges();
  }
  /** Bouton d'action de la Carte mystère : POST, puis la réponse (vue complète) repeinte ; refus : message, bouton rendu. */
  function dyAct(path, body, b, msg) {
    return async () => {
      b.disabled = true; let x; try { x = await call(path, 'POST', body); } catch (e) { x = null; }
      if (!x || x.status !== 200 || !x.body) { b.disabled = false; return toast((x && x.body && x.body.message) || 'Modification impossible.'); }
      dy.d = { ...dy.d, ...x.body }; toast(msg); dyPaint(); dyKpi();
    };
  }
  const dyBtn = (label, path, body, msg) => { const b = h('button', { class: 'btn ghost small', type: 'button' }, label); b.addEventListener('click', dyAct(path, body, b, msg)); return b; };
  function dyPaint() {
    const d = dy.d, box = $('#daily'), rowsAll = Array.isArray(d.rows) ? d.rows : [], list = h('div', { class: 'dyl', id: 'dyList' }), cnt = h('small', { class: 'dyn', id: 'dyN', 'aria-live': 'polite' });
    const q = h('input', { type: 'search', placeholder: 'Chercher un pseudo…', 'aria-label': 'Chercher un pseudo', autocomplete: 'off', spellcheck: 'false' });
    q.value = dy.q; q.addEventListener('input', () => { dy.q = q.value.trim(); rows(); });
    const rows = () => {
      const l = rowsAll.filter(r => !dy.q || unacc(r.n).includes(unacc(dy.q)));
      cnt.textContent = dy.q ? nf(l.length) + ' sur ' + nf(rowsAll.length) : l.length > 200 ? '200 premiers sur ' + nf(l.length) : '';
      fill(list, l.length ? l.slice(0, 200).map(r => h('div', { class: 'dyr' + (r.x ? ' off' : '') }, h('span', { class: 'pdt' }, h('b', null, r.n),
        h('small', null, (r.d ? nf(r.s) + ' pts · ' + r.d + ' jour' + (r.d > 1 ? 's' : '') + (r.last ? ' · ' + r.last : '') : 'pas joué') + (r.lv ? ' · niv. ' + r.lv : ''))), h('span', { class: 'dcra' }, r.x ? h('span', { class: 'tag bad' }, 'masqué') : null,
        dyBtn(r.x ? 'Rétablir' : 'Masquer', '/daily/hide', { id: r.id, on: !r.x }, r.x ? 'Pseudo rétabli.' : 'Pseudo masqué dans les classements.'))))
        : empty(dy.q ? 'Aucun pseudo ne correspond.' : 'Personne n\'a encore joué cette semaine.'));
    };
    const c = d.card;
    const prep = d.prep ? h('p', { class: 'note' }, 'Carte du jour en préparation' + (d.prep.since ? ' depuis ' + D_TIME.format(d.prep.since) : '') + (d.prep.err ? ' · dernier échec ' + D_TIME.format(d.prep.err.at) + ' : ' + d.prep.err.m + ' (nouvel essai toutes les 5 min)' : ' (tirage et images : une à deux minutes)'))
      : !c && d.st !== 'ready' ? h('p', { class: 'note' }, 'Carte du jour en préparation.') : null;
    const players = fold('dy-players', h('h3', null, 'Réponse du jour et joueurs'), [
      c ? h('details', { class: 'scd dyans' }, h('summary', null, 'Réponse du jour'), h('p', null, c.en + (c.fr && c.fr !== c.en ? ' (' + c.fr + ')' : '') + (c.set ? ' · ' + c.set : '') + (d.fb && d.fb.length ? ' · image anglaise pour : ' + d.fb.join(', ') : ''))) : null,
      h('p', { class: 'hint' }, 'Joueurs des 7 derniers jours et classement des niveaux. « Masquer » remplace un pseudo par « Pseudo masqué » dans tous les classements ; le score reste. Classement public : comptes de plus de ' + (d.minAge || 0) + ' jours, Google ou adresse vérifiée.'),
      h('div', { class: 'dyq' }, q, cnt), list], { meta: plural(rowsAll.length, 'joueur'), id: 'dyPlayers' });
    fill(box, h('div', { class: 'chead dyhead' }, h('h2', null, 'Carte mystère'), h('small', null, 'n° ' + d.no + ' · ' + d.day + ' · ' + nf(d.done) + ' terminée' + (d.done > 1 ? 's' : '') + ' sur ' + nf(d.plays) + ' · ' + nf(d.hidden) + ' masqué' + (d.hidden > 1 ? 's' : ''))),
      prep, players, dyChecks(d));
    rows(); dyRep(d);
  }
  /** Parties « à vérifier » et comptes soupçonnés : « Valider » (POST /api/admin/daily/ok) remet la partie au classement, ou laisse le compte tranquille 7 parties. */
  function dyChecks(d) {
    const mmss = ms => { const s = Math.round((ms || 0) / 1000); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
    const chk = d.chk || [], sus = d.sus || [];
    return [fold('dy-chk', h('h3', null, 'À vérifier'), [
      h('p', { class: 'hint' }, 'Même réseau, trouvée juste après un autre joueur qui avait vu autant d\'indices : hors du top 100 public et de son badge, sans que le joueur le sache. « Valider » (même box, famille…) la remet au classement.'),
      h('div', { class: 'dyl' }, chk.length ? chk.map(r => h('div', { class: 'dyr' }, h('span', { class: 'pdt' }, h('b', null, r.n), h('small', null, r.day + ' · ' + nf(r.s) + ' pts · étape ' + r.step + (r.ms ? ' en ' + mmss(r.ms) : '') + ' · ' + r.gap + ' s après ' + (r.by === 'win' ? 'une victoire' : 'l\'étape ' + r.other) + ' sur ce réseau')), h('span', { class: 'dcra' }, h('span', { class: 'tag warn' }, 'à vérifier'), dyBtn('Valider', '/daily/ok', { id: r.id }, 'Partie remise au classement.'))))
        : empty('Aucune partie à vérifier.'))], { meta: nf(chk.length), id: 'dyChk', cls: chk.length ? 'todo' : '' }),
    fold('dy-sus', h('h3', null, 'Trop souvent à l\'étape 1'), [
      h('p', { class: 'hint' }, 'Signalés seulement, jamais exclus. « Valider » : plus de signalement pendant ses 7 prochaines parties.'),
      h('div', { class: 'dyl' }, sus.length ? sus.map(r => h('div', { class: 'dyr' }, h('span', { class: 'pdt' }, h('b', null, r.n), h('small', null, r.c + ' fois sur ses ' + r.of + ' dernières parties · ' + nf(r.rate) + ' % pour tous')), h('span', { class: 'dcra' }, h('span', { class: 'tag warn' }, 'soupçon'), dyBtn('Valider', '/daily/ok', { id: r.id }, 'Compte laissé tranquille.'))))
        : empty('Aucun compte signalé.'))], { meta: nf(sus.length), id: 'dySus', cls: sus.length ? 'todo' : '' })];
  }
  /** Pseudos signalés depuis les classements (jeu et niveaux) : onglet « Signalements » ; Masquer / Rétablir (hide), Ignorer (report). */
  function dyRep(d) {
    const rep = d.reports || [], box = $('#dyRepCard');
    const repRow = r => h('div', { class: 'dyr' + (r.hid ? ' off' : '') }, h('span', { class: 'pdt' }, h('b', null, r.n), h('small', null, r.k + ' signalement' + (r.k > 1 ? 's' : '') + (r.at ? ' · ' + new Date(r.at).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }) : ''))), h('span', { class: 'dcra' }, r.hid ? h('span', { class: 'tag warn' }, 'masqué') : null,
      dyBtn(r.hid ? 'Rétablir' : 'Masquer', '/daily/hide', { id: r.id, on: !r.hid }, r.hid ? 'Pseudo rétabli, signalements effacés.' : 'Pseudo masqué dans les classements.'),
      dyBtn('Ignorer', '/daily/report', { id: r.id }, 'Signalements effacés.')));
    box.hidden = false;
    fill(box, fold('dy-rep', h('h2', null, 'Pseudos signalés'), [
      h('p', { class: 'hint' }, 'Signalés depuis les classements de la Carte mystère (jeu et niveaux). Au bout de ' + (d.repHide || 3) + ' personnes différentes, le pseudo est masqué tout seul en attendant ta décision. « Rétablir » : le pseudo est correct, ses signalements partent ; « Ignorer » : signalements effacés, pseudo laissé tel quel.'),
      h('div', { class: 'dyl' }, rep.length ? rep.map(repRow) : empty('Aucun pseudo signalé.'))], { meta: plural(rep.length, 'pseudo'), id: 'dyRep' }));
  }
  /* Discord (proxy.mjs › /api/admin/discord, bot « Mana Orbit ») : onglet « Discord » : état du bot (serveur, salons, rôles), rédaction (salon, modèles,
     texte, pings, publier ; aperçu à côté sur grand écran), puis l'historique à part. Salons groupés par catégorie (📢 : salon d'annonces, « Publier aux
     serveurs abonnés » coché d'office) ; raccourcis vers #annonces et #changelog ; dernier salon gardé sur cet appareil, sinon le premier « annonces ».
     Modèles « Annonce » / « Changelog » : début de message mis en tête du texte. Le serveur met les mentions en tête : 2000 caractères en tout, mentions
     comprises (compteur). Aperçu en textContent (**gras** et sauts de ligne seulement). Envoi confirmé dans la fenêtre (salon et pings redits ; Ctrl+Entrée
     l'ouvre), pings remis à zéro après l'envoi ; historique des 50 derniers (Ouvrir, Supprimer en deux appuis). Brouillon et choix gardés quand le panneau
     se repeint ; salons relus au plus une fois par minute (« Rafraîchir » : tout de suite). */
  const DC_MAX = 2000, DC_ROLES = 5, DC_KEY = 'manaorbit:admin:discord-ch';
  const dc = { gen: 0, d: null, at: 0, force: false, busy: false, draft: '', ch: '', roles: [], every: false, pub: true };
  const dcGet = () => { try { return localStorage.getItem(DC_KEY) || ''; } catch (e) { return ''; } };
  const dcSet = v => { try { localStorage.setItem(DC_KEY, v); } catch (e) { /* stockage absent */ } };
  const dcName = c => (c.type === 5 ? '📢 ' : '# ') + c.name;
  const dcAt = n => (n.startsWith('@') ? n : '@' + n);
  /** Modèles de début de message : texte, et la partie à remplacer tout de suite (sélectionnée). */
  const DC_TPL = { annonce: { label: '📢 Annonce', text: '📢 **Nouveauté** : ', sel: '' }, changelog: { label: '🆕 Changelog', text: '🆕 **Version x.y**\n• ', sel: 'x.y' } };
  /** Couleur d'un rôle (nombre de Discord ou « #rrggbb » ; 0 : aucune) → « #rrggbb » ou null. */
  const dcColor = c => { if (typeof c === 'number' && c > 0 && c <= 0xffffff) return '#' + c.toString(16).padStart(6, '0'); return typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c) ? c : null; };
  /** Carte « Bot Discord » : état (pastille), puis des détails ou un message. */
  const dcState = (ok, label, ...kids) => h('section', { class: 'card dcstat', id: 'dcStat' }, h('div', { class: 'chead' }, h('h2', null, 'Bot Discord'), h('span', { class: 'tag ' + (ok ? 'ok' : ok === false ? 'bad' : '') }, label)), ...kids);
  async function discord() {
    if (dc.d && !dc.force && Date.now() - dc.at < 60e3) return dcSent(dc.d.sent);
    dc.force = false;
    const box = $('#discord');
    if (!box.firstChild) { box.hidden = false; fill(box, dcState(null, 'Connexion…', loading('Lecture des salons…'))); }
    const g = ++dc.gen; let r; try { r = await call('/discord'); } catch (e) { r = null; }
    if (g !== dc.gen) return;
    if (r && r.status === 404) { dc.d = null; box.hidden = true; box.replaceChildren(); tabOf('discord').hidden = true; if (tb.cur === 'discord') tabShow('apercu'); return; }      // route absente ou DISCORD=0
    box.hidden = false; tabOf('discord').hidden = false;
    if (!r || r.status !== 200 || !r.body) { dc.d = null; return fill(box, dcState(false, 'Injoignable', h('p', { class: 'note' }, (r && r.body && r.body.message) || 'Le serveur ne répond pas.'))); }
    if (!r.body.on) { dc.d = null; return fill(box, dcState(false, 'Indisponible', h('p', { class: 'note' }, r.body.message || 'Bot Discord indisponible.'))); }      // bot non configuré, Discord injoignable : rien d'autre
    dc.d = r.body; dc.at = Date.now(); dcPaint();
  }
  function dcPaint() {
    const d = dc.d, box = $('#discord'), chans = Array.isArray(d.channels) ? d.channels : [], roles = Array.isArray(d.roles) ? d.roles : [];
    const byId = new Map(chans.map(c => [String(c.id), c]));
    if (!byId.has(dc.ch)) { const k = dcGet(); dc.ch = byId.has(k) ? k : String((chans.find(c => /annonces/i.test(c.name)) || chans[0] || { id: '' }).id); }
    dc.roles = dc.roles.filter(id => roles.some(x => String(x.id) === id));
    // Salon : un groupe par catégorie (ordre du serveur) ; raccourcis vers #annonces et #changelog quand ils existent
    const cats = new Map(); for (const c of chans) { const k = c.cat || ''; if (!cats.has(k)) cats.set(k, []); cats.get(k).push(c); }
    const sel = h('select', { id: 'dcCh' }, [...cats].map(([k, l]) => h('optgroup', { label: k || 'Sans catégorie' }, l.map(c => h('option', { value: c.id }, dcName(c))))));
    sel.value = dc.ch;
    const pickCh = id => { dc.ch = id; sel.value = id; dcSet(id); sync(); };
    sel.addEventListener('change', () => pickCh(sel.value));
    const quick = ['annonces', 'changelog'].map(n => chans.find(c => unacc(c.name).includes(n))).filter((c, i, a) => c && a.indexOf(c) === i).map(c => {
      const b = h('button', { class: 'chip', type: 'button', 'data-ch': c.id, 'aria-pressed': 'false', title: 'Écrire dans ' + dcName(c) + (c.cat ? ' (' + c.cat + ')' : '') }, dcName(c));
      b.addEventListener('click', () => pickCh(String(c.id))); return b;
    });
    const txt = h('textarea', { id: 'dcTxt', rows: 9, maxlength: DC_MAX, placeholder: 'Ton message… (**gras**, sauts de ligne)', spellcheck: 'true' });
    txt.value = dc.draft; txt.addEventListener('input', () => { dc.draft = txt.value; sync(); });
    txt.addEventListener('keydown', e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); if (!send.disabled) send.click(); } });
    // Modèles : début de message mis en tête (une fois), curseur placé (ou partie à remplacer sélectionnée)
    const tpls = Object.entries(DC_TPL).map(([k, t]) => {
      const b = h('button', { class: 'chip', type: 'button', 'data-tpl': k, title: 'Commencer le message par « ' + t.text.trim().replace(/\n/g, ' ') + ' »' }, t.label);
      b.addEventListener('click', () => {
        if (dc.busy) return;
        const v = txt.value.startsWith(t.text) ? txt.value : txt.value.trim() ? t.text + '\n' + txt.value : t.text;
        txt.value = v.slice(0, DC_MAX); dc.draft = txt.value; sync(); txt.focus();
        const i = t.sel ? txt.value.indexOf(t.sel) : -1;
        if (i >= 0) txt.setSelectionRange(i, i + t.sel.length); else txt.setSelectionRange(t.text.length, t.text.length);
      });
      return b;
    });
    const cnt = h('small', { class: 'dcn', id: 'dcCount', 'aria-live': 'polite' }), prev = h('div', { class: 'dcprev', id: 'dcPrev' });
    // Pings : rôles (5 au plus) et @everyone
    const chk = (cls, cb, ...label) => h('label', { class: 'dcchk' + (cls ? ' ' + cls : '') }, cb, ...label);
    const rcb = roles.map(x => {
      const cb = h('input', { type: 'checkbox', value: x.id, 'data-role': x.id }); cb.checked = dc.roles.includes(String(x.id));
      cb.addEventListener('change', () => { dc.roles = roles.map(y => String(y.id)).filter(id => id === String(x.id) ? cb.checked : dc.roles.includes(id)); sync(); });
      const col = dcColor(x.color), dot = col ? s('svg', { class: 'dcdot', width: 10, height: 10, viewBox: '0 0 10 10', 'aria-hidden': 'true' }) : null;      // couleur du rôle : attribut SVG (aucun style en ligne)
      if (dot) dot.append(s('circle', { cx: 5, cy: 5, r: 5, fill: col }));
      return chk('', cb, dot, dcAt(x.name));
    });
    const every = h('input', { type: 'checkbox', id: 'dcEvery' }); every.checked = dc.every;
    every.addEventListener('change', () => { dc.every = every.checked; sync(); });
    const warn = h('p', { class: 'note dcwarn', id: 'dcWarn' }, '@everyone notifie tous les membres du serveur : à garder pour les grandes annonces.');
    const pub = h('input', { type: 'checkbox', id: 'dcPub' }); pub.checked = dc.pub;
    pub.addEventListener('change', () => { dc.pub = pub.checked; });
    const pubL = chk('', pub, 'Publier aux serveurs abonnés'); pubL.id = 'dcPubL'; pubL.title = 'Salon d\'annonces : le message est aussi poussé dans les serveurs qui suivent ce salon';
    const send = h('button', { class: 'btn main', id: 'dcSend', type: 'button' }, 'Envoyer…');
    const pvCh = h('span', { class: 'dcpch', id: 'dcPrevCh' });
    const pick = () => roles.filter(x => dc.roles.includes(String(x.id)));
    const pings = () => [...pick().map(x => dcAt(x.name)), ...(dc.every ? ['@everyone'] : [])];
    const total = () => { const m = [...dc.roles.map(id => '<@&' + id + '>'), ...(dc.every ? ['@everyone'] : [])]; return dc.draft.length + (m.length ? m.join(' ').length + 1 : 0); };      // « <@&id> <@&id> @everyone\n » + texte
    function sync() {
      const c = byId.get(dc.ch), n = total();
      cnt.textContent = nf(n) + ' / ' + nf(DC_MAX) + (n > dc.draft.length ? ' (mentions comprises)' : '');
      cnt.classList.toggle('over', n > DC_MAX);
      pubL.hidden = !(c && c.type === 5); warn.hidden = !dc.every; txt.readOnly = dc.busy; sel.disabled = dc.busy; every.disabled = dc.busy;
      for (const b of quick) { b.setAttribute('aria-pressed', String(b.dataset.ch === dc.ch)); b.disabled = dc.busy; }
      for (const b of tpls) b.disabled = dc.busy;
      for (const cb of rcb.map(l => l.querySelector('input'))) cb.disabled = dc.busy || (!cb.checked && dc.roles.length >= DC_ROLES);
      send.disabled = dc.busy || !c || !dc.draft.trim() || n > DC_MAX;
      send.textContent = dc.busy ? 'Envoi…' : 'Envoyer…';
      pvCh.textContent = c ? dcName(c) + (c.cat ? ' · ' + c.cat : '') : 'Aucun salon';
      dcPreview(prev, pings(), dc.draft);
    }
    send.addEventListener('click', async () => {
      const c = byId.get(dc.ch); if (!c || dc.busy) return;
      const rl = pick(), p = pings(), publish = c.type === 5 && dc.pub, content = dc.draft;
      const v = await dlg('Envoyer le message ?', [h('p', { class: 'dlgw' }, dcName(c) + (c.cat ? ' · ' + c.cat : '')),
        h('p', { class: 'dcpg' }, p.length ? 'Pings : ' + p.join(', ') : 'Aucun ping.'),
        dc.every ? h('p', { class: 'note' }, '@everyone : tous les membres du serveur seront notifiés.') : null,
        c.type === 5 ? h('p', null, publish ? 'Publié aussi aux serveurs abonnés.' : 'Pas publié aux serveurs abonnés.') : null,
        h('p', { class: 'dcq' }, content.length > 400 ? content.slice(0, 400) + '…' : content)],
        [['Annuler', ''], ['Envoyer', 'ok', dc.every ? 'main danger' : 'main']]);
      if (v !== 'ok' || dc.busy || !dc.d) return;
      dc.busy = true; sync();
      let x; try { x = await call('/discord/send', 'POST', { channel: c.id, content, roles: rl.map(r => r.id), everyone: dc.every, publish }); } catch (e) { x = null; }
      dc.busy = false; if (!dc.d) return;      // déconnecté entre-temps
      if (!x || x.status !== 200 || !x.body || !x.body.ok) { dcPaint(); return toast((x && x.body && x.body.message) || 'Envoi impossible : le serveur ne répond pas.'); }
      if (Array.isArray(x.body.sent)) dc.d.sent = x.body.sent;
      if (dc.draft === content) dc.draft = '';
      dc.roles = []; dc.every = false;      // pings remis à zéro : jamais deux fois par mégarde
      toast('Message envoyé dans ' + c.name + '.'); dcPaint();
    });
    const g = d.guild && d.guild.name ? d.guild.name : '', ann = chans.filter(c => c.type === 5).length;
    const stat = (k, v) => h('div', { class: 'dcs' }, h('span', null, k), h('b', null, v));
    fill(box,
      dcState(true, 'En ligne', h('div', { class: 'dcsg' }, stat('Serveur', g || '—'), stat('Salons', nf(chans.length) + (ann ? ' · ' + nf(ann) + ' d\'annonces' : '')), stat('Rôles à pinger', nf(roles.length)), stat('Messages gardés', nf((d.sent || []).length))),
        h('p', { class: 'hint' }, 'Le message part au nom du bot « Mana Orbit ». Les mentions des pings sont ajoutées en tête par le serveur.')),
      h('div', { class: 'dcw' },
        h('section', { class: 'card dcf', id: 'dcForm' }, chead('Nouveau message'),
          h('div', { class: 'dcrow' }, h('label', { class: 'dcl', for: 'dcCh' }, 'Salon'), sel, quick.length ? h('div', { class: 'chips', role: 'group', 'aria-label': 'Salons fréquents' }, quick) : null),
          h('div', { class: 'dcrow' }, h('div', { class: 'dclh' }, h('label', { class: 'dcl', for: 'dcTxt' }, 'Message'), h('div', { class: 'chips', role: 'group', 'aria-label': 'Modèles de début de message' }, h('span', { class: 'chipl' }, 'Modèles'), tpls)),
            txt, h('div', { class: 'dcnl' }, h('small', { class: 'dckb' }, '**gras** · Ctrl+Entrée : envoyer'), cnt)),
          h('fieldset', { class: 'dcp' }, h('legend', null, 'Pings', h('small', null, ' · ' + DC_ROLES + ' rôles au plus')), ...rcb, chk('every', every, '@everyone'), warn),
          h('div', { class: 'dcb' }, pubL, send)),
        h('section', { class: 'card dcpv' }, chead('Aperçu', pvCh),
          h('div', { class: 'dcmsg' }, h('img', { class: 'dcav', src: '/icons/icon.svg', alt: '', width: 40, height: 40 }),
            h('div', { class: 'dcmb' }, h('p', { class: 'dcmh' }, h('b', null, 'Mana Orbit'), h('span', { class: 'dcbot' }, 'APP'), h('small', null, 'aujourd\'hui')), prev)))),
      h('section', { class: 'card dchist' }, chead('Envoyés', h('small', { id: 'dcSentN' })), h('p', { class: 'hint' }, '50 derniers messages du bot, tenus par le serveur (le plus récent en haut).'), h('div', { class: 'dyl', id: 'dcSent' })));
    sync(); dcSent(d.sent);
  }
  /** Aperçu : mentions en tête, puis le texte ligne par ligne, **gras** seulement (nœuds de texte : rien d'interprété). */
  function dcPreview(box, pings, text) {
    const kids = [];
    if (pings.length) kids.push(h('p', { class: 'dcpm' }, pings.map(p => h('span', { class: 'dcm' }, p))));
    if (text.trim()) kids.push(h('div', { class: 'dcpt' }, text.split('\n').map((l, i) => [i ? h('br') : null, ...l.split(/\*\*(.+?)\*\*/).map((x, j) => (j % 2 ? h('b', null, x) : x))]).flat()));
    else kids.push(h('p', { class: 'empty' }, 'L\'aperçu du message s\'affiche ici.'));
    box.replaceChildren(...kids);
  }
  /** Historique des envois (tenu par le serveur, le plus récent en haut) : date, salon, début du texte, pings ; Ouvrir, Supprimer (deux appuis). */
  function dcSent(list) {
    const box = $('#dcSent'); if (!box) return;
    const l = (Array.isArray(list) ? list : []).slice().sort((a, b) => (b.t || 0) - (a.t || 0));
    $('#dcSentN').textContent = l.length ? '(' + nf(l.length) + ')' : '';
    box.replaceChildren(...(l.length ? l.map(dcRow) : [h('p', { class: 'empty' }, 'Aucun message envoyé pour l\'instant.')]));
  }
  function dcRow(e) {
    const url = typeof e.url === 'string' && /^https:\/\/(?:[a-z]+\.)?discord(?:app)?\.com\//.test(e.url) ? e.url : null;      // jamais d'autre adresse (javascript:…)
    const open = url ? h('a', { class: 'btn ghost small', href: url, target: '_blank', rel: 'noopener noreferrer' }, 'Ouvrir') : null;
    const del = h('button', { class: 'btn ghost small sdel', type: 'button' }, 'Supprimer');
    const ping = Array.isArray(e.ping) && e.ping.length ? e.ping.map(n => dcAt(String(n))).join(' ') : '';
    const row = h('div', { class: 'dyr dcr', 'data-id': e.id }, h('span', { class: 'pdt' }, h('b', null, String(e.text || '').replace(/\s+/g, ' ').trim() || '(sans texte)'),
      h('small', null, [e.t ? D_TIME.format(e.t) : '', e.chn || '', ping].filter(Boolean).join(' · '))), h('span', { class: 'dcra' }, open, del));
    let armT = 0;
    const disarm = () => { clearTimeout(armT); del.classList.remove('arm'); del.textContent = 'Supprimer'; };
    del.addEventListener('click', async () => {
      if (!del.classList.contains('arm')) { del.classList.add('arm'); del.textContent = 'Confirmer la suppression'; clearTimeout(armT); armT = setTimeout(disarm, 4000); return; }
      clearTimeout(armT); del.disabled = true;
      let x; try { x = await call('/discord/delete', 'POST', { id: e.id }); } catch (er) { x = null; }
      if (!x || x.status !== 200 || !x.body) { del.disabled = false; disarm(); return toast((x && x.body && x.body.message) || 'Suppression impossible : le serveur ne répond pas.'); }
      if (!dc.d) return;
      dc.d.sent = Array.isArray(x.body.sent) ? x.body.sent : (dc.d.sent || []).filter(y => y.id !== e.id);
      dcSent(dc.d.sent); toast('Message supprimé de Discord.');
    });
    return row;
  }
  /* Fils des forums Discord (bugs, idées, aide) : onglet « Fils » (proxy.mjs › /api/admin/discord/threads, thread, reply, thread-delete). Filtre par forum
     (Bugs, Idées, Questions = aide) et Ouverts / Fermés (« Plus anciens » : page suivante des fermés) ; un fil ouvert (#fils/<id>, retour = la liste) : ses
     messages (texte en textContent ; captures de Discord en <img> loading=lazy, touchées : en grand dans un nouvel onglet), étiquettes (celles de l'équipe
     d'abord), Fermer / Rouvrir, Verrouiller / Déverrouiller, Renommer, Répondre (aucun ping ; « Répondre et fermer »), Supprimer (confirmé), Ouvrir sur
     Discord. Pastille : fils ouverts sans étiquette d'équipe (à trier). Téléphone : la liste, puis le fil (← Fils) ; grand écran : côte à côte.
     Fils ouverts des trois forums relus au plus une fois par minute (« Rafraîchir » : tout de suite) ; route absente (404) : onglet masqué. */
  const TH_F = [['bugs', 'Bugs'], ['idées', 'Idées'], ['aide', 'Questions']];
  const th = { gen: 0, dgen: 0, at: 0, force: false, state: '', forums: [], open: {}, note: {}, f: 'tous', st: 'open', closed: null, cur: '', det: null, pushed: false, draft: '' };
  function thReset() { th.gen++; th.dgen++; Object.assign(th, { at: 0, force: false, state: '', forums: [], open: {}, note: {}, closed: null, cur: '', det: null, pushed: false, draft: '' }); }
  const thForum = k => th.forums.find(f => f.key === k);
  const thTagsOf = t => { const f = thForum(t.forum); return f ? (t.tags || []).map(id => f.tags.find(x => String(x.id) === String(id))).filter(Boolean) : []; };
  const thTeam = t => thTagsOf(t).some(x => x.moderated);
  /** Fils ouverts d'un forum, ou des trois (« Tous » : le plus récent d'abord). */
  const thOpenOf = k => (k === 'tous' ? [].concat(...TH_F.map(([f]) => th.open[f] || [])).sort((a, b) => (b.last || b.created || 0) - (a.last || a.created || 0)) : th.open[k] || []);
  const thTodo = k => thOpenOf(k).filter(t => !t.archived && !thTeam(t)).length;
  const thTodoAll = () => thTodo('tous');
  const thLabel = k => (TH_F.find(x => x[0] === k) || [k, k])[1];
  const thHidTxt = '(texte non lisible : active Message Content Intent sur le portail Discord)';
  /** Emoji d'une étiquette : un vrai emoji seulement (le nom d'un emoji personnalisé du serveur n'en est pas un). */
  const thEmo = e => (typeof e === 'string' && e && !/^[\w-]+$/.test(e) ? e + ' ' : '');
  const thTag = x => h('span', { class: 'tag' + (x.moderated ? ' team' : '') }, thEmo(x.emoji) + x.name);
  /** Adresse d'une pièce jointe : Discord (CSP : img-src cdn.discordapp.com, media.discordapp.net) ou la même origine ; rien d'autre. */
  const thFile = u => { try { const x = new URL(String(u || ''), location.href); return x.protocol === 'https:' && /^(cdn\.discordapp\.com|media\.discordapp\.net)$/.test(x.hostname) || x.origin === location.origin ? x.href : null; } catch (e) { return null; } };
  const thBy = b => (b && b.name ? b.name + (b.bot ? ' (bot)' : '') : 'inconnu');
  const thCard = (...kids) => h('section', { class: 'card thcard' }, chead('Fils des forums'), ...kids);
  async function threads() {
    if (th.state && !th.force && Date.now() - th.at < 60e3) return th.state === 'on' ? thPaint() : undefined;
    th.force = false;
    const box = $('#threads'), g = ++th.gen;
    if (!box.firstChild) fill(box, thCard(loading('Lecture des fils…')));
    let rs; try { rs = await Promise.all(TH_F.map(([k]) => call('/discord/threads?' + new URLSearchParams({ forum: k, state: 'open' })).catch(() => null))); } catch (e) { rs = []; }
    if (g !== th.gen) return;
    th.at = Date.now();
    if (rs.length && rs.every(r => r && r.status === 404)) {      // route absente (ou DISCORD=0) : pas d'onglet
      th.state = 'gone'; box.replaceChildren(); tabOf('fils').hidden = true; if (tb.cur === 'fils') tabShow('apercu'); badges(); return;
    }
    tabOf('fils').hidden = false;
    const good = rs.filter(r => r && r.status === 200 && r.body);
    if (!good.length) { const r = rs.find(x => x && x.body && x.body.message); th.state = 'err'; badges(); return fill(box, thCard(h('p', { class: 'note' }, (r && r.body.message) || 'Le serveur ne répond pas.'))); }
    if (good.every(r => !r.body.on)) { th.state = 'off'; badges(); return fill(box, thCard(h('p', { class: 'note' }, good[0].body.message || 'Bot Discord indisponible.'))); }
    const forums = new Map(); th.open = {}; th.note = {};
    rs.forEach((r, i) => {
      if (!r || r.status !== 200 || !r.body || !r.body.on) { if (r && r.body && r.body.message) th.note[TH_F[i][0]] = r.body.message; return; }
      if (r.body.message) th.note[TH_F[i][0]] = r.body.message;      // forum introuvable sur le serveur Discord…
      for (const f of r.body.forums || []) if (f && f.key && !forums.has(f.key)) forums.set(f.key, { ...f, tags: Array.isArray(f.tags) ? f.tags : [] });
      th.open[TH_F[i][0]] = (Array.isArray(r.body.threads) ? r.body.threads : []).filter(t => !t.forum || t.forum === TH_F[i][0]).map(t => ({ ...t, forum: t.forum || TH_F[i][0] }));
    });
    th.forums = [...forums.values()]; th.state = 'on';
    if (th.st === 'closed' && (!th.closed || th.closed.f !== th.f)) thClosed(false); else thPaint();
    badges();
  }
  /** Fils fermés du forum choisi (« Tous » : sans forum, les trois mêlés), 25 par page ; « Plus anciens » : before = next de la réponse, tel quel. */
  async function thClosed(more) {
    const f = th.f, g = th.gen, prev = more && th.closed && th.closed.f === f ? th.closed : null, old = prev ? prev.list || [] : [];
    if (!prev) th.closed = { f, list: null, more: false, next: '' }; else prev.busy = true;
    thPaint();
    let r; try { r = await call('/discord/threads?' + new URLSearchParams({ ...(f === 'tous' ? {} : { forum: f }), state: 'closed', ...(prev && prev.next ? { before: prev.next } : {}) })); } catch (e) { r = null; }
    if (g !== th.gen || !th.closed || th.closed.f !== f) return;
    if (!r || r.status !== 200 || !r.body || r.body.on === false) { th.closed = { f, list: old, more: !!prev && prev.more, next: prev ? prev.next : '', err: (r && r.body && r.body.message) || 'Fils fermés illisibles : le serveur ne répond pas.' }; return thPaint(); }
    const seen = new Set(old.map(t => t.id)), add = (Array.isArray(r.body.threads) ? r.body.threads : []).filter(t => !seen.has(t.id)).map(t => ({ ...t, forum: t.forum || f }));
    th.closed = { f, list: old.concat(add), more: !!r.body.more && !!r.body.next, next: typeof r.body.next === 'string' ? r.body.next : '', err: !add.length && !old.length && r.body.message ? r.body.message : '' };
    thPaint();
  }
  /** Un fil choisi : nouvelle entrée de l'historique (#fils/<id>) ; retour du navigateur ou « ← Fils » : la liste. */
  function thGo(id) { history.pushState(null, '', '#fils/' + encodeURIComponent(id)); th.pushed = true; thRoute(id); }
  function thBack() {
    if (th.pushed && hashParts()[1]) { th.pushed = false; history.back(); return; }      // → hashchange → thRoute('')
    history.replaceState(null, '', '#fils'); thRoute('');
  }
  /** Fil affiché d'après l'adresse (rien : la liste seule). */
  function thRoute(id) {
    if (id === th.cur) { if (th.state === 'on') thPaint(); return; }
    th.cur = id; th.det = null; th.dgen++;
    if (th.state === 'on') thPaint();
    if (id) thLoad(id);
  }
  async function thLoad(id) {
    const g = ++th.dgen; let r; try { r = await call('/discord/thread?' + new URLSearchParams({ id })); } catch (e) { r = null; }
    if (g !== th.dgen || th.cur !== id) return;
    th.det = r && r.status === 200 && r.body && r.body.thread ? { thread: r.body.thread, messages: Array.isArray(r.body.messages) ? r.body.messages : [], more: !!r.body.more }
      : { err: (r && r.body && r.body.message) || 'Fil illisible : le serveur ne répond pas.' };
    if (th.det.thread && !th.det.thread.forum) th.det.thread.forum = (th.forums.find(f => String(f.id) === String(th.det.thread.parent)) || {}).key || '';
    thDetPaint();
  }
  /** Fil modifié (réponse du serveur) : mis à jour dans les listes (fermé : passe chez les fermés, rouvert : chez les ouverts) et dans le détail. */
  function thUpd(t) {
    if (!t || !t.id) return;
    const prev = (th.det && th.det.thread && th.det.thread.id === t.id && th.det.thread) || [].concat(...Object.values(th.open), (th.closed && th.closed.list) || []).find(x => x.id === t.id) || {};
    t = { ...prev, ...t, forum: t.forum || prev.forum };
    for (const k of Object.keys(th.open)) th.open[k] = th.open[k].filter(x => x.id !== t.id);
    if (th.closed && th.closed.list) th.closed.list = th.closed.list.filter(x => x.id !== t.id);
    if (!t.archived) { if (th.open[t.forum]) th.open[t.forum].unshift(t); }
    else if (th.closed && th.closed.list && (th.closed.f === t.forum || th.closed.f === 'tous')) th.closed.list.unshift(t);
    if (th.det && th.det.thread && th.det.thread.id === t.id) th.det.thread = t;
    thPaint(); badges();
  }
  /** Action sur un fil (POST) : bouton grisé le temps de la réponse ; refus : message du serveur, bouton rendu. */
  async function thPost(path, body, b, msg) {
    if (b) b.disabled = true;
    let x; try { x = await call(path, 'POST', body); } catch (e) { x = null; }
    if (!x || x.status !== 200 || !x.body || !x.body.ok) { if (b) b.disabled = false; toast((x && x.body && x.body.message) || 'Action impossible : le serveur ne répond pas.'); return null; }
    if (msg) toast(msg);
    return x.body;
  }
  function thPaint() {
    const box = $('#threads'); if (th.state !== 'on') return;
    const seg = (items, cur, pick, label) => h('div', { class: 'seg', role: 'group', 'aria-label': label }, items.map(([k, l, n]) => {
      const b = h('button', { class: 'chip', type: 'button', 'aria-pressed': String(k === cur), 'data-k': k }, l, n ? h('span', { class: 'badge' }, String(n), h('span', { class: 'sr' }, ' à trier')) : null);
      b.addEventListener('click', () => pick(k)); return b;
    }));
    const forums = seg([['tous', 'Tous', thTodoAll()], ...TH_F.filter(([k]) => thForum(k)).map(([k, l]) => [k, l, thTodo(k)])], th.f, k => { if (k === th.f) return; th.f = k; if (th.st === 'closed') thClosed(false); else thPaint(); }, 'Forum');
    const states = seg([['open', 'Ouverts', 0], ['closed', 'Fermés', 0]], th.st, k => { if (k === th.st) return; th.st = k; if (k === 'closed' && (!th.closed || th.closed.f !== th.f)) thClosed(false); else thPaint(); }, 'État');
    const list = th.st === 'open' ? thOpenOf(th.f) : th.closed && th.closed.f === th.f ? th.closed.list : null;
    const notes = th.st === 'open' ? (th.f === 'tous' ? TH_F.map(([k]) => th.note[k] && thLabel(k) + ' : ' + th.note[k]) : [th.note[th.f]]).filter(Boolean) : [];
    const item = t => {
      const tags = thTagsOf(t), b = h('button', { class: 'thi' + (t.id === th.cur ? ' on' : ''), type: 'button', 'data-id': t.id, 'aria-current': t.id === th.cur ? 'true' : null },
        h('span', { class: 'tht' }, h('b', null, t.name || '(sans titre)'), t.locked ? h('span', { class: 'tag' }, '🔒 verrouillé') : null, t.archived ? h('span', { class: 'tag off' }, 'fermé') : !thTeam(t) ? h('span', { class: 'tag warn' }, 'à trier') : null),
        tags.length ? h('span', { class: 'tags' }, tags.map(thTag)) : null,
        t.firstHidden ? h('span', { class: 'thx hid' }, thHidTxt) : t.first ? h('span', { class: 'thx' }, t.first) : null,
        h('small', null, [th.f === 'tous' ? thLabel(t.forum) : '', thBy(t.by), t.archived && t.closed ? 'fermé ' + ago(t.closed) : ago(t.last || t.created), plural(t.count || 0, 'message')].filter(Boolean).join(' · ')));
      b.addEventListener('click', () => (t.id === th.cur ? null : thGo(t.id)));
      return b;
    };
    const more = th.st === 'closed' && th.closed && th.closed.f === th.f && th.closed.more ? h('button', { class: 'btn ghost small', type: 'button', id: 'thMore', disabled: !!th.closed.busy }, th.closed.busy ? 'Chargement…' : 'Plus anciens') : null;
    if (more) more.addEventListener('click', () => thClosed(true));
    const nOpen = TH_F.reduce((n, [k]) => n + (th.open[k] || []).length, 0), todo = thTodoAll();
    fill(box, h('section', { class: 'card thcard' }, chead('Fils des forums', plural(nOpen, 'fil ouvert', 'fils ouverts') + (todo ? ' · ' + nf(todo) + ' à trier' : '')),
      h('p', { class: 'hint' }, 'Forums du serveur Discord : avis envoyés depuis l\'appli (« Aide et avis ») et fils des membres. « À trier » : fil ouvert sans étiquette de l\'équipe.'),
      h('div', { class: 'thctl' }, forums, states),
      h('div', { class: 'thw' + (th.cur ? ' det' : '') },
        h('div', { class: 'thl', id: 'thList' }, list == null ? loading('Lecture des fils fermés…') : [
          th.st === 'closed' && th.closed && th.closed.err ? h('p', { class: 'note' }, th.closed.err) : null, notes.map(n => h('p', { class: 'note' }, n)),
          list.length ? list.map(item) : empty(th.st === 'open' ? (th.f === 'tous' ? 'Aucun fil ouvert.' : 'Aucun fil ouvert dans ce forum.') : 'Aucun fil fermé.'),
          more ? h('div', { class: 'pager' }, more) : null]),
        h('div', { class: 'thd', id: 'thDet' }))));
    thDetPaint();
  }
  function thDetPaint() {
    const box = $('#thDet'); if (!box) return;
    const back = h('button', { class: 'btn ghost small thback', type: 'button' }, '← Fils'); back.addEventListener('click', thBack);
    if (!th.cur) return fill(box, h('div', { class: 'thnone' }, h('p', null, 'Choisis un fil dans la liste : ses messages, ses étiquettes et les actions s\'affichent ici.')));
    if (!th.det) return fill(box, back, loading('Lecture du fil…'));
    if (th.det.err) return fill(box, back, h('p', { class: 'note' }, th.det.err));
    const t = th.det.thread, f = thForum(t.forum), url = typeof t.url === 'string' && /^https:\/\/(?:[a-z]+\.)?discord(?:app)?\.com\//.test(t.url) ? t.url : null;
    // Actions
    const btn = (label, cls, fn) => { const b = h('button', { class: 'btn ghost small' + (cls ? ' ' + cls : ''), type: 'button' }, label); b.addEventListener('click', () => fn(b)); return b; };
    const patch = (body, msg) => async b => { const x = await thPost('/discord/thread', { id: t.id, ...body }, b, msg); if (x) thUpd(x.thread || { ...t, ...body }); };
    const close = btn(t.archived ? 'Rouvrir' : 'Fermer', '', patch({ archived: !t.archived }, t.archived ? 'Fil rouvert.' : 'Fil fermé.')); close.dataset.act = 'archive';
    const lock = btn(t.locked ? 'Déverrouiller' : 'Verrouiller', '', patch({ locked: !t.locked }, t.locked ? 'Fil déverrouillé.' : 'Fil verrouillé : seuls les modérateurs y écrivent.')); lock.dataset.act = 'lock';
    const ren = btn('Renommer…', '', async b => {
      const inp = h('input', { type: 'text', class: 'dlgi', maxlength: 100, 'aria-label': 'Nouveau titre', autocomplete: 'off' }); inp.value = t.name || '';
      const p = dlg('Renommer le fil', [h('p', null, 'Nouveau titre (100 caractères au plus) :'), inp], [['Annuler', ''], ['Renommer', 'ok', 'main']]);
      inp.focus(); inp.select(); inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); $('#dlg').close('ok'); } });
      const v = await p, name = inp.value.trim().slice(0, 100);
      if (v !== 'ok' || !name || name === t.name) return;
      patch({ name }, 'Fil renommé.')(b);
    }); ren.dataset.act = 'rename';
    const del = btn('Supprimer…', 'sdel', async b => {
      const v = await dlg('Supprimer le fil ?', [h('p', { class: 'dlgw' }, t.name || '(sans titre)'), h('p', null, 'Le fil et tous ses messages sont effacés de Discord, pour tout le monde. Impossible à annuler.')], [['Annuler', ''], ['Supprimer', 'ok', 'main danger']]);
      if (v !== 'ok') return;
      const x = await thPost('/discord/thread-delete', { id: t.id }, b, 'Fil supprimé de Discord.'); if (!x) return;
      for (const k of Object.keys(th.open)) th.open[k] = th.open[k].filter(y => y.id !== t.id);
      if (th.closed && th.closed.list) th.closed.list = th.closed.list.filter(y => y.id !== t.id);
      th.pushed = false; history.replaceState(null, '', '#fils'); th.cur = ''; th.det = null; thPaint(); badges();
    }); del.dataset.act = 'delete';
    const open = url ? h('a', { class: 'btn ghost small', href: url, target: '_blank', rel: 'noopener noreferrer' }, 'Ouvrir sur Discord') : null;
    // Étiquettes : celles de l'équipe d'abord (mises en avant), 5 au plus
    const all = f ? f.tags.slice().sort((a, b) => (b.moderated ? 1 : 0) - (a.moderated ? 1 : 0)) : [], mine = new Set((t.tags || []).map(String));
    const save = h('button', { class: 'btn ghost small', type: 'button', id: 'thTagSave', disabled: true }, 'Enregistrer les étiquettes');
    const cbs = all.map(x => { const cb = h('input', { type: 'checkbox', value: x.id, 'data-tag': x.id }); cb.checked = mine.has(String(x.id)); return [x, cb]; });
    const pickNow = () => cbs.filter(([, cb]) => cb.checked).map(([x]) => String(x.id));
    const tsync = () => { const p = pickNow(); for (const [, cb] of cbs) cb.disabled = !cb.checked && p.length >= 5; save.disabled = p.length === mine.size && p.every(id => mine.has(id)); };
    for (const [, cb] of cbs) cb.addEventListener('change', tsync);
    save.addEventListener('click', () => patch({ tags: pickNow() }, 'Étiquettes enregistrées.')(save));
    const tagBox = all.length ? h('fieldset', { class: 'dcp thtags' }, h('legend', null, 'Étiquettes', h('small', null, ' · 5 au plus · celles de l\'équipe en premier')),
      cbs.map(([x, cb]) => h('label', { class: 'dcchk' + (x.moderated ? ' team' : '') }, cb, thEmo(x.emoji) + x.name)), h('div', { class: 'thsave' }, save)) : null;
    tsync();
    // Messages
    const msgs = th.det.messages.map(m => {
      const files = (Array.isArray(m.attachments) ? m.attachments : []).map(a => {
        const u = thFile(a.url); if (!u) return null;
        return /^image\//.test(a.type || '') ? h('a', { class: 'thimg', href: u, target: '_blank', rel: 'noopener noreferrer', title: 'Voir en grand : ' + (a.name || 'capture') }, h('img', { src: u, alt: a.name || 'Capture', loading: 'lazy', ...(a.w && a.h ? { width: a.w, height: a.h } : {}) }))
          : h('a', { class: 'btn ghost small', href: u, target: '_blank', rel: 'noopener noreferrer' }, '📎 ' + (a.name || 'pièce jointe'));
      }).filter(Boolean);
      return h('article', { class: 'thm' + (m.by && m.by.bot ? ' bot' : ''), 'data-id': m.id },
        h('p', { class: 'thmh' }, h('b', null, (m.by && m.by.name) || 'inconnu'), m.by && m.by.bot ? h('span', { class: 'dcbot' }, 'APP') : null, h('small', null, (m.t ? D_TIME.format(m.t) + ' (' + ago(m.t) + ')' : '') + (m.edited ? ' · modifié' : ''))),
        m.hidden ? h('p', { class: 'note thhid' }, thHidTxt) : m.content ? h('p', { class: 'thc' }, m.content) : files.length ? null : h('p', { class: 'thc empty-t' }, '(sans texte)'),
        files.length ? h('div', { class: 'thf' }, files) : null);
    });
    // Répondre (aucun ping), puis fermer au besoin ; confirmé
    const ta = h('textarea', { id: 'thReply', rows: 4, maxlength: 2000, placeholder: 'Réponse du bot dans le fil (aucun ping)…', spellcheck: 'true' }); ta.value = th.draft;
    const rc = h('small', { class: 'dcn' }), r1 = h('button', { class: 'btn ghost', type: 'button', id: 'thSend' }, 'Répondre'), r2 = h('button', { class: 'btn main', type: 'button', id: 'thSendClose' }, 'Répondre et fermer');
    const rsync = () => { rc.textContent = nf(ta.value.length) + ' / 2 000'; r1.disabled = r2.disabled = !ta.value.trim(); };
    ta.addEventListener('input', () => { th.draft = ta.value; rsync(); }); rsync();
    const reply = closeIt => async () => {
      const content = ta.value.trim(); if (!content) return;
      const v = await dlg(closeIt ? 'Répondre et fermer le fil ?' : 'Répondre dans le fil ?', [h('p', { class: 'dlgw' }, t.name || '(sans titre)'), h('p', null, 'Réponse publique du bot « Mana Orbit », sans ping.' + (closeIt ? ' Le fil est fermé ensuite.' : '')), h('p', { class: 'dcq' }, content.length > 400 ? content.slice(0, 400) + '…' : content)], [['Annuler', ''], [closeIt ? 'Répondre et fermer' : 'Répondre', 'ok', 'main']]);
      if (v !== 'ok') return;
      r1.disabled = r2.disabled = true; ta.readOnly = true;
      const x = await thPost('/discord/reply', { id: t.id, content, ...(closeIt ? { close: true } : {}) }, null, '');
      ta.readOnly = false; if (!x) return rsync();
      toast(closeIt && x.closed === false ? x.message || 'Réponse envoyée, mais le fil n\'a pas pu être fermé.' : closeIt ? 'Réponse envoyée, fil fermé.' : 'Réponse envoyée.');      // réponse partie, fermeture refusée : fil laissé ouvert
      if (th.draft.trim() === content) th.draft = '';
      if (x.thread) thUpd(x.thread);
      if (th.cur === t.id) thLoad(t.id);
    };
    r1.addEventListener('click', reply(false)); r2.addEventListener('click', reply(true));
    ta.addEventListener('keydown', e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); if (!r1.disabled) r1.click(); } });
    const tags = thTagsOf(t);
    fill(box,
      h('div', { class: 'thdh' }, back, h('h2', { id: 'thTitle' }, t.name || '(sans titre)'),
        h('p', { class: 'thdm' }, [f ? thLabel(f.key) : thLabel(t.forum), 'par ' + thBy(t.by), t.created ? 'ouvert ' + ago(t.created) : '', t.archived && t.closed ? 'fermé ' + ago(t.closed) : '', plural(t.count || 0, 'message')].filter(Boolean).join(' · ')),
        h('span', { class: 'tags' }, t.archived ? h('span', { class: 'tag off' }, 'fermé') : h('span', { class: 'tag ok' }, 'ouvert'), t.locked ? h('span', { class: 'tag' }, '🔒 verrouillé') : null, tags.map(thTag))),
      h('div', { class: 'thact' }, open, close, lock, ren, del),
      tagBox,
      h('div', { class: 'thms' }, th.det.more ? h('p', { class: 'hint' }, 'Messages plus anciens : sur Discord.') : null, msgs.length ? msgs : empty('Aucun message lisible.')),
      h('div', { class: 'threp' }, h('label', { class: 'dcl', for: 'thReply' }, 'Répondre'), ta, h('div', { class: 'dcnl' }, h('small', { class: 'dckb' }, 'Ctrl+Entrée : répondre'), rc), h('div', { class: 'dcb' }, r1, r2)));
  }
  /* QR codes fixes (proxy.mjs › /api/admin/qr ; flyers, affiches, cartes de visite, Discord) : onglet « QR codes » (#qr). Une carte par QR : aperçu (SVG du serveur,
     src/qr.js › qrSvgLogo : niveau H, logo de l'appli, encre marine ; en <img> data: : CSP), nom (« Renommer »), lien imprimé (jamais modifiable), scans (total,
     aujourd'hui, 7 et 30 jours, Android / iPhone / autre, barres des 30 derniers jours), destination modifiable (adresse https://, chemin du site ou « Selon le
     téléphone » ; « Enregistrer » confirmé : les QR déjà imprimés suivent la nouvelle destination), « Tester ↗ » (le lien avec ?test=1 : pas compté),
     « Télécharger SVG » (le fichier du serveur) et « PNG » (2 048 px au moins, dessiné ici dans un canvas, chaque module en pixels entiers : impression).
     Création (bloc repliable, fermé d'office) : nom, lien (tiré du nom tant qu'on n'y touche pas ; figé une fois créé : confirmé), destination. Jamais de
     suppression (le serveur n'en a aucune). Liste relue au plus une fois par minute (« Rafraîchir » : tout de suite) ; saisies en cours gardées au repeint. */
  const QC_PNG = 2048, QC_ID = /^[a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])$/;
  const qc = { gen: 0, d: null, at: 0, force: false, busy: '', ed: {}, nw: { name: '', id: '', idSet: false, k: 'url', to: '' } };
  const qcReset = () => { qc.gen++; Object.assign(qc, { d: null, at: 0, force: false, busy: '', ed: {}, nw: { name: '', id: '', idSet: false, k: 'url', to: '' } }); };
  const qcTxt = to => (to === 'app' ? 'Selon le téléphone (appli)' : to);
  const qcUri = svg => 'data:image/svg+xml;base64,' + btoa(svg);
  /** Nom → lien proposé : « Affiche boutique Lyon » → « affiche-boutique-lyon » (accents retirés, 32 caractères au plus). */
  const qcSlug = v => unacc(v).replace(/[^a-z0-9]+/g, '-').replace(/^-+/, '').slice(0, 32).replace(/-+$/, '');
  /** Destination tapée : '' (vide), 'bad' (ni https:// ni /…), sinon la valeur (le serveur la vérifie pour de bon). */
  const qcCheck = (k, v) => { if (k === 'app') return 'app'; const t = String(v || '').trim(); return !t ? '' : /^https:\/\/[^\s/]+\.[^\s]+$|^\/(?!\/)\S*$/.test(t) ? t : 'bad'; };
  async function qrcodes() {
    if (qc.d && !qc.force && Date.now() - qc.at < 60e3) return;
    qc.force = false;
    const box = $('#qrcodes');
    if (!box.firstChild) fill(box, h('section', { class: 'card' }, chead('QR codes fixes'), loading('Lecture des QR codes…')));
    const g = ++qc.gen; let r; try { r = await call('/qr'); } catch (e) { r = null; }
    if (g !== qc.gen) return;
    if (r && r.status === 404) { qc.d = null; box.replaceChildren(); tabOf('qr').hidden = true; if (tb.cur === 'qr') tabShow('apercu'); return; }
    tabOf('qr').hidden = false;
    if (!r || r.status !== 200 || !r.body || !Array.isArray(r.body.list)) { if (!qc.d) fill(box, h('section', { class: 'card' }, chead('QR codes fixes'), h('p', { class: 'note' }, (r && r.body && r.body.message) || 'Le serveur ne répond pas.'))); return; }
    qc.d = r.body; qc.at = Date.now(); qcPaint();
  }
  /** Réponse d'une action : liste et journal à jour, carte repeinte. */
  function qcTake(x) { if (x && x.body && Array.isArray(x.body.log)) journal(x.body.log); if (x && x.body && Array.isArray(x.body.list) && qc.d) { qc.d.list = x.body.list; qc.at = Date.now(); } }
  /** Choix du type de destination (deux pastilles) + champ ; o.k / o.to : état gardé ; onChange après chaque saisie. */
  function qcDest(o, idp, onChange) {
    const inp = h('input', { class: 'qcin', id: idp + 'To', type: 'url', inputmode: 'url', autocomplete: 'off', spellcheck: 'false', autocapitalize: 'off', maxlength: 500, placeholder: 'https://… ou /chemin du site', 'aria-label': 'Adresse de destination' });
    inp.value = o.to;
    const app = h('p', { class: 'qcapp' }, 'Android → fiche Google Play · iPhone et iPad → App Store dès qu\'elle existe, le site en attendant · ordinateur → le site.');
    const seg = h('div', { class: 'seg qcseg', role: 'group', 'aria-label': 'Type de destination' }, [['url', 'Adresse'], ['app', 'Selon le téléphone (appli)']].map(([k, label]) => {
      const b = h('button', { class: 'chip', type: 'button', 'data-k': k, 'aria-pressed': String(o.k === k) }, label);
      b.addEventListener('click', () => { if (o.k === k) return; o.k = k; sync(); onChange(); if (k === 'url') inp.focus(); });
      return b;
    }));
    inp.addEventListener('input', () => { o.to = inp.value; onChange(); });
    function sync() { for (const b of seg.children) b.setAttribute('aria-pressed', String(b.dataset.k === o.k)); inp.hidden = o.k === 'app'; app.hidden = o.k !== 'app'; }
    sync();
    return { els: [seg, inp, app], inp, dis: on => { inp.disabled = on; for (const b of seg.children) b.disabled = on; } };
  }
  function qcPaint() {
    const d = qc.d, box = $('#qrcodes'); if (!d) return;
    const list = d.list.slice().sort((a, b) => (a.id === 'flyer' ? -1 : b.id === 'flyer' ? 1 : (a.at || 0) - (b.at || 0)));      // les flyers en premier, puis dans l'ordre de création
    const scans = list.reduce((t, q) => t + (q.n || 0), 0);
    fill(box,
      h('section', { class: 'card qchead' }, chead('QR codes fixes', plural(list.length, 'QR code') + ' · ' + plural(scans, 'scan')),
        h('p', { class: 'hint' }, 'Liens imprimés (flyers, affiches, cartes de visite) ou partagés (Discord…). Un lien ne change jamais et un QR code ne se supprime pas : seule sa destination change, et les QR déjà imprimés la suivent. Scans comptés sans rien garder de personnel (ni adresse ni appareil) ; robots d\'aperçu et « Tester » non comptés.'),
        d.bad ? h('p', { class: 'note' }, 'Fichier des QR codes illisible sur le serveur (qrcodes.json) : redirections d\'office seulement, rien ne peut être modifié ni compté.') : null,
        h('div', { class: 'qcx' }, h('button', { class: 'btn', type: 'button', onclick: e => qcExport(e.currentTarget, false), title: 'Fichier qrcodes.json tel quel : en cas de perte, le recopier dans le dossier ADMIN_DIR du serveur (appli Node arrêtée), puis relancer' }, 'Exporter (sauvegarde JSON)'),
          h('button', { class: 'btn', type: 'button', onclick: e => qcExport(e.currentTarget, true) }, 'Exporter (CSV)')),
        qcNew()),
      h('div', { class: 'qcl', id: 'qcList' }, list.map(qcCard)));
  }
  /** « Exporter » : GET /api/admin/qr/export (JSON au format du fichier du serveur, pour le restaurer à l'identique ; ou CSV lisible). */
  async function qcExport(b, csv) {
    const u = user; if (!u) return; b.disabled = true;
    try {
      for (let a = 0; a < 2; a++) {
        const r = await fetch('/api/admin/qr/export' + (csv ? '?f=csv' : ''), { cache: 'no-store', headers: { 'x-firebase-token': await u.getIdToken(a > 0) } });
        if (r.ok) { save(await r.blob(), (/filename="([^"]+)"/.exec(r.headers.get('content-disposition') || '') || [])[1] || 'qrcodes-mana-orbit.' + (csv ? 'csv' : 'json')); return toast(csv ? 'QR codes exportés (CSV).' : 'Sauvegarde des QR codes téléchargée.'); }
        const j = await r.json().catch(() => null); if (r.status === 401 && j && j.error === 'token_expired' && a === 0) continue;
        return toast((j && j.message) || 'Export impossible.');
      }
    } catch (e) { toast('Réseau indisponible.'); } finally { b.disabled = false; }
  }
  /** Bloc « Nouveau QR code » : nom, lien (figé à la création), destination ; « Créer… » confirmé. */
  function qcNew() {
    const o = qc.nw, taken = id => qc.d.list.some(q => q.id === id);
    const name = h('input', { class: 'qcin', id: 'qcName', type: 'text', maxlength: 60, autocomplete: 'off', placeholder: 'Affiche boutique, flyer tournoi…' });
    const id = h('input', { class: 'qcin', id: 'qcId', type: 'text', maxlength: 32, autocomplete: 'off', spellcheck: 'false', autocapitalize: 'off', placeholder: 'affiche-boutique' });
    name.value = o.name; id.value = o.id;
    const tip = h('small', { class: 'qctip', id: 'qcIdTip', 'aria-live': 'polite' });
    const go = h('button', { class: 'btn main', id: 'qcCreate', type: 'button' }, 'Créer…');
    const dest = qcDest(o, 'qcNew', () => sync());
    function sync() {
      const v = id.value.trim().toLowerCase(), bad = v && !QC_ID.test(v), dup = v && taken(v), to = qcCheck(o.k, o.to);
      tip.textContent = dup ? 'Ce lien existe déjà.' : bad ? 'Minuscules, chiffres et tirets ; 2 à 32 caractères, pas de tiret au début ni à la fin.' : v ? 'QR imprimé : ' + qc.d.origin + '/q/' + v + ' (figé une fois créé)' : 'Minuscules, chiffres et tirets : figé une fois créé.';
      tip.classList.toggle('bad', !!(bad || dup));
      go.disabled = !!qc.busy || !name.value.trim() || !v || bad || dup || !to || to === 'bad' || qc.d.bad;
    }
    name.addEventListener('input', () => { o.name = name.value; if (!o.idSet) { o.id = qcSlug(name.value); id.value = o.id; } sync(); });
    id.addEventListener('input', () => { const v = id.value.toLowerCase().replace(/[^a-z0-9-]/g, ''); if (v !== id.value) id.value = v; o.id = v; o.idSet = !!v; sync(); });
    go.addEventListener('click', async () => {
      const v = id.value.trim(), to = qcCheck(o.k, o.to), link = qc.d.origin + '/q/' + v;
      const ok = await dlg('Créer ce QR code ?', [h('p', { class: 'dlgw' }, name.value.trim() + ' · ' + link), h('p', null, 'Destination : ' + qcTxt(to)),
        h('p', { class: 'note' }, 'Le lien ' + link + ' ne pourra plus jamais changer, et le QR code ne pourra pas être supprimé : seuls son nom et sa destination changeront.')],
        [['Annuler', ''], ['Créer', 'ok', 'main']]);
      if (ok !== 'ok' || qc.busy) return;
      qc.busy = 'new'; sync(); dest.dis(true);
      let x; try { x = await call('/qr', 'POST', { id: v, name: name.value.trim(), to }); } catch (e) { x = null; }
      qc.busy = ''; qcTake(x);
      if (!x || x.status !== 201 || !x.body || !x.body.ok) { dest.dis(false); sync(); return oops(x, 'Création impossible : le serveur ne répond pas.'); }
      qc.nw = { name: '', id: '', idSet: false, k: 'url', to: '' }; qcPaint(); toast('QR code créé : ' + link.replace(/^https:\/\//, '') + '.');
      const c = $('#qcList .qc[data-id="' + v + '"]'); if (c) c.scrollIntoView({ block: 'center' });
    });
    sync();
    const lab = (f, t) => h('label', { class: 'dcl', for: f }, t);
    return fold('qrnew', h('h3', null, 'Nouveau QR code'), h('div', { class: 'qcf' },
      h('div', { class: 'dcrow' }, lab('qcName', 'Nom'), name),
      h('div', { class: 'dcrow' }, lab('qcId', 'Lien'), h('div', { class: 'qcpre' }, h('span', null, 'manaorbit.app/q/'), id), tip),
      h('div', { class: 'dcrow' }, h('span', { class: 'dcl' }, 'Destination'), dest.els),
      h('div', { class: 'dcb' }, go)), { shut: true, cls: 'qcnew' });
  }
  /** Scans des 30 derniers jours : petites barres (survol : jour et nombre). */
  function qcBars(days) {
    const W = 150, H = 26, n = days.length || 1, step = W / n, max = Math.max(1, ...days.map(x => x[1]));
    const svg = s('svg', { class: 'qcbars', width: W, height: H, viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': 'Scans par jour sur 30 jours' });
    days.forEach(([day, k], i) => {
      const g = s('g', { class: 'bar' + (k ? '' : ' zero') }), tt = s('title'), bh = k ? Math.max(2, k / max * (H - 2)) : 1;
      tt.textContent = D_DAY.format(Date.parse(day + 'T12:00:00Z')) + ' : ' + plural(k, 'scan'); g.append(tt);
      g.append(s('rect', { x: i * step, y: 0, width: step, height: H, class: 'hit' }), s('rect', { x: i * step + .6, y: H - bh, width: Math.max(1, step - 1.2), height: bh, rx: 1, class: 'fill' }));
      svg.append(g);
    });
    return svg;
  }
  function qcCard(q) {
    const e = qc.ed[q.id] || (qc.ed[q.id] = { k: q.to === 'app' ? 'app' : 'url', to: q.to === 'app' ? '' : q.to });
    const img = q.svg ? h('img', { class: 'qcimg', src: qcUri(q.svg), alt: 'QR code de ' + q.link, width: 120, height: 120 }) : h('div', { class: 'qcimg none' }, 'Aperçu indisponible');
    const sv = h('button', { class: 'btn main small', type: 'button', 'data-act': 'save' }, 'Enregistrer…');
    const undo = h('button', { class: 'btn ghost small', type: 'button', 'data-act': 'undo' }, 'Annuler');
    const dest = qcDest(e, 'qc-' + q.id, () => sync()), row = h('div', { class: 'qcsave' }, undo, sv);      // Annuler et Enregistrer : seulement quand la destination change
    const cur = () => { const v = qcCheck(e.k, e.to); return v === 'app' ? 'app' : v; };
    function sync() { const v = cur(), ch = v !== q.to; sv.disabled = !ch || !v || v === 'bad' || !!qc.busy || !!(qc.d && qc.d.bad); row.hidden = !ch; card.classList.toggle('dirty', ch); }
    undo.addEventListener('click', () => { delete qc.ed[q.id]; card.replaceWith(qcCard(q)); });
    sv.addEventListener('click', async () => {
      const to = cur(); if (!to || to === 'bad' || to === q.to || qc.busy) return;
      const ok = await dlg('Changer la destination ?', [h('p', { class: 'dlgw' }, q.name + ' · ' + q.link), h('p', { class: 'qcwas' }, 'Avant : ' + qcTxt(q.to)), h('p', { class: 'qcnow' }, 'Après : ' + qcTxt(to)),
        h('p', { class: 'note' }, 'Les QR déjà imprimés (et partagés) suivront la nouvelle destination dès maintenant.')], [['Annuler', ''], ['Changer la destination', 'ok', 'main']]);
      if (ok !== 'ok' || qc.busy) return;
      qc.busy = q.id; sync(); dest.dis(true);
      let x; try { x = await call('/qr/' + encodeURIComponent(q.id), 'POST', { to }); } catch (er) { x = null; }
      qc.busy = ''; qcTake(x);
      if (!x || x.status !== 200 || !x.body || !x.body.ok) { dest.dis(false); sync(); return oops(x, 'Modification impossible : le serveur ne répond pas.'); }
      delete qc.ed[q.id]; card.replaceWith(qcCard(x.body.qr)); toast('Destination changée : les QR imprimés y mènent déjà.');
    });
    const ren = h('button', { class: 'btn ghost tiny', type: 'button', 'data-act': 'rename', title: 'Changer le nom (le lien ne change pas)' }, 'Renommer');
    ren.addEventListener('click', async () => {
      const inp = h('input', { class: 'dlgi', id: 'qcRen', type: 'text', maxlength: 60, autocomplete: 'off', 'aria-label': 'Nouveau nom' }); inp.value = q.name;
      const p = dlg('Renommer le QR code', [h('p', { class: 'dlgw' }, q.link), inp, h('p', { class: 'hint' }, 'Seulement pour le panneau : le lien imprimé ne change pas.')], [['Annuler', ''], ['Renommer', 'ok', 'main']]);
      inp.addEventListener('keydown', ev => { if (ev.key === 'Enter') { ev.preventDefault(); $('#dlg').close('ok'); } });
      inp.focus(); inp.select();
      if (await p !== 'ok' || qc.busy) return;
      const name = inp.value.replace(/\s+/g, ' ').trim(); if (!name || name === q.name) return;
      qc.busy = q.id; ren.disabled = true;
      let x; try { x = await call('/qr/' + encodeURIComponent(q.id), 'POST', { name }); } catch (er) { x = null; }
      qc.busy = ''; ren.disabled = false; qcTake(x);
      if (!x || x.status !== 200 || !x.body || !x.body.ok) return oops(x, 'Modification impossible : le serveur ne répond pas.');
      card.replaceWith(qcCard(x.body.qr)); toast('QR code renommé.');
    });
    const test = h('a', { class: 'btn ghost small', href: q.path + '?test=1', target: '_blank', rel: 'noopener noreferrer', 'data-act': 'test', title: 'Ouvrir le lien comme un téléphone qui scanne (ce test n\'est pas compté)' }, 'Tester ↗');
    const svgB = h('button', { class: 'btn ghost small', type: 'button', 'data-act': 'svg', title: 'Vectoriel : pour l\'imprimeur' }, 'Télécharger SVG');
    const pngB = h('button', { class: 'btn ghost small', type: 'button', 'data-act': 'png', title: 'Image de ' + QC_PNG + ' px au moins : impression, réseaux' }, 'Télécharger PNG');
    if (!q.svg) { svgB.disabled = true; pngB.disabled = true; }
    svgB.addEventListener('click', () => { save(new Blob(['<?xml version="1.0" encoding="UTF-8"?>\n' + q.svg], { type: 'image/svg+xml' }), 'qr-mana-orbit-' + q.id + '.svg'); toast('SVG téléchargé.'); });
    pngB.addEventListener('click', () => qcPng(q, pngB));
    const p = q.p || {}, meta = q.up > q.at ? 'modifié ' + ago(q.up) : q.at ? 'créé le ' + D_SHORT.format(q.at) : '';
    const card = h('article', { class: 'card qc', 'data-id': q.id },
      img,
      h('div', { class: 'qch' },
        h('div', { class: 'qct' }, h('h3', null, q.name), ren),
        h('p', { class: 'qclink' }, 'QR imprimé : ', h('code', null, q.link.slice(0, q.link.length - q.path.length), h('wbr'), q.path)),      // coupé avant « /q/… » sur un téléphone
        h('p', { class: 'qcn' }, h('b', null, nf(q.n)), ' scan' + (q.n > 1 ? 's' : '')),
        h('p', { class: 'qcst' }, 'aujourd\'hui ' + nf(q.today) + ' · 7 j : ' + nf(q.d7) + ' · 30 j : ' + nf(q.d30)),
        h('p', { class: 'qcst' }, 'Android ' + nf(p.a) + ' · iPhone ' + nf(p.i) + ' · autre ' + nf(p.o)),
        Array.isArray(q.days) && q.days.length ? qcBars(q.days) : null),
      h('div', { class: 'qcdest' }, h('div', { class: 'dclh' }, h('span', { class: 'dcl' }, 'Destination'), meta ? h('small', { class: 'qcm' }, meta) : null), dest.els, row),
      h('div', { class: 'qcacts' }, test, svgB, pngB));
    sync();
    return card;
  }
  /** PNG pour l'impression : le SVG du serveur dessiné dans un canvas de 2 048 px au moins, chaque module sur un nombre entier de pixels (bords nets). */
  async function qcPng(q, b) {
    b.disabled = true;
    try {
      const side = q.side || 45, px = Math.ceil(QC_PNG / side) * side, img = new Image();
      img.src = qcUri(q.svg.replace('<svg ', '<svg width="' + px + '" height="' + px + '" ')); await img.decode();
      const c = document.createElement('canvas'); c.width = c.height = px;
      const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, px, px); g.drawImage(img, 0, 0, px, px);
      const blob = await new Promise(r => c.toBlob(r, 'image/png')); if (!blob) throw new Error('png');
      save(blob, 'qr-mana-orbit-' + q.id + '.png'); toast('PNG ' + nf(px) + ' × ' + nf(px) + ' px téléchargé.');
    } catch (e) { toast('PNG impossible dans ce navigateur : prends le SVG.'); } finally { b.disabled = false; }
  }
  /* Santé du serveur (onglet « Serveur », proxy.mjs › GET /api/admin/server) : mémoire et caches, démarrages, processeur, requêtes par minute, en direct,
     disque, historique des prix, et l'avis « quand envisager un VPS » tiré de ces signaux (niveaux ok / warn / bad décidés par le serveur). Lu au premier
     affichage du panneau (pastille de l'onglet), puis toutes les HC_EVERY ms tant que l'onglet est affiché et la page visible ; « Actualiser » : tout de suite
     (et le dossier des données relu, au plus une fois par minute côté serveur). */
  const HC_EVERY = Number(window.__hcEvery) > 0 ? Number(window.__hcEvery) : 20e3;      // 20 s (__hcEvery : tests/admin-e2e.mjs seulement)
  const hc = { gen: 0, d: null, at: 0, busy: false, t: 0 };
  const hcReset = () => { hc.gen++; clearTimeout(hc.t); Object.assign(hc, { d: null, at: 0, busy: false, t: 0 }); };
  const MO = n => { const v = Number(n) || 0; return v >= 1073741824 ? (v / 1073741824).toFixed(1).replace('.', ',') + ' Go' : v >= 10485760 ? nf(Math.round(v / 1048576)) + ' Mo' : v >= 1048576 ? (v / 1048576).toFixed(1).replace('.', ',') + ' Mo' : v >= 1024 ? nf(Math.round(v / 1024)) + ' Ko' : nf(v) + ' o'; };
  const PCT = x => (x > 0 && x < 0.01 ? '< 1' : nf(Math.round(x * 100))) + ' %';
  const D_HM = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' });
  const LV_TXT = { ok: 'normal', warn: 'à surveiller', bad: 'à traiter' };
  const FAM = { page: 'Page et fichiers', prix: 'Prix et recherches CardTrader', alertes: 'Alertes de prix', troc: 'Échange en direct', partie: 'Parties (compteur de vie)', mystere: 'Carte mystère', discord: 'Discord et avis', admin: 'Administration', autres: 'Autres (amis, decks publics, imports…)' };
  const CACHE = { ct: ['Catalogues CardTrader', 'CACHE_MAX_MB'], offers: ['Offres CardTrader', 'OFFERS_CACHE_MB'], jobs: ['Résultats des recherches', 'JOB_RESULTS_MB'], troc: ['Listes des échanges en direct', 'TROC_MB'],
    ptlive: ['Parties en cours (au plus)', 'PARTIE_LIVE_KB × PARTIE_MAX'], pthist: ['Historiques des parties', 'PARTIE_CACHE_MB'], amis: ['Amis', 'FRIENDS_CACHE_MB'], files: ['Page et catalogues compressés', ''], data: ['Copies des prix et d\'EDHREC', ''] };
  const SIG = { rss: 'mémoire proche du plafond de l\'offre', heap: 'mémoire de Node proche de sa limite', cpu: 'processeur chargé', lag: 'serveur lent à répondre', restarts: 'redémarrages imprévus (plantages)', jobs: 'recherches CardTrader refusées (serveur complet)', up: 'file d\'attente vers CardTrader' };
  /** Indicateur : pastille de couleur (niveau), libellé, valeur, barre facultative (part d'un plafond), petit texte dessous. data-lv="bad" : compté dans la pastille de l'onglet. */
  function hi(label, val, o = {}) {
    const lv = o.lv || '', bar = o.part != null && Number.isFinite(o.part) ? h('span', { class: 'hbar', 'aria-hidden': 'true' }, h('i', { 'data-w': String(Math.max(0, Math.min(100, Math.round(o.part * 100)))) })) : null;
    return h('div', { class: 'hi', 'data-lv': lv || null, 'data-k': o.k },
      h('span', { class: 'hdot', 'aria-hidden': 'true' }),
      h('span', { class: 'hl' }, label, lv && lv !== 'ok' ? h('span', { class: 'sr' }, ' (' + LV_TXT[lv] + ')') : null),
      h('b', { class: 'hv' }, val), bar, o.sub ? h('small', { class: 'hs' }, o.sub) : null);
  }
  /** Largeur des barres : posée par el.style (la CSP n'autorise pas un attribut style écrit dans le HTML, mais bien la propriété). */
  const hbars = box => { for (const i of box.querySelectorAll('.hbar i[data-w]')) i.style.width = i.dataset.w + '%'; };
  async function health(force) {
    if (hc.busy || !user) return;
    hc.busy = true; const g = hc.gen; if ($('#hcGo')) $('#hcGo').disabled = true;
    let r; try { r = await call('/server' + (force ? '?disk=1' : '')); } catch (e) { r = null; }
    if (g !== hc.gen) return;
    hc.busy = false; if ($('#hcGo')) $('#hcGo').disabled = false;
    if (!r || r.status !== 200 || !r.body) { if (force) toast(r && r.status === 429 ? (r.body && r.body.message) || 'Trop de requêtes.' : 'Santé du serveur indisponible.'); return hcPlan(); }
    hc.d = r.body; hc.at = Date.now(); hcDraw(); badges(); hcPlan();
  }
  /** Prochaine lecture : seulement l'onglet « Serveur » affiché et la page visible (sinon rien : relu dès le retour). */
  function hcPlan() { clearTimeout(hc.t); if (data && tb.cur === 'serveur' && document.visibilityState === 'visible') hc.t = setTimeout(() => health(), HC_EVERY); }
  /** Onglet affiché ou page revenue au premier plan : relu si la dernière lecture date de plus de HC_EVERY. */
  function hcSoon() { if (!data || tb.cur !== 'serveur' || document.visibilityState !== 'visible') return clearTimeout(hc.t); if (Date.now() - hc.at >= HC_EVERY) health(); else hcPlan(); }
  function hcDraw() {
    const v = hc.d, box = $('#health'); if (!v) return box.replaceChildren();
    const lv = v.lv || {}, m = v.mem, bt = v.boot, ld = v.load, rq = v.req, lv2 = v.live, dk = v.disk, hs = v.hist;
    // Avis : quand envisager un VPS
    const vl = v.vps.lv, list = (vl === 'bad' ? v.vps.bad : v.vps.warn).map(k => SIG[k] || k);
    const verdict = vl === 'bad' ? 'Signes de saturation : ' + list.join(', ') + '. Si ça se répète plusieurs jours, un VPS (mémoire et processeur réservés) devient nécessaire.'
      : vl === 'warn' ? 'À surveiller : ' + list.join(', ') + '. Si ça revient plusieurs jours de suite, prépare le passage à un VPS.'
      : 'Rien n\'indique qu\'il faut un VPS : l\'hébergement mutualisé suffit pour l\'instant.';
    const extra = [!m.limit ? 'Plafond de mémoire de l\'offre inconnu : indique-le dans SERVER_MEM_MB (hPanel › Ressources) pour colorer la mémoire.' : '',
      lv.disk === 'bad' ? 'Dossier des données inaccessible : parties, classements et journaux ne sont pas gardés.' : lv.disk === 'warn' && dk.boots > 1 ? 'Dossier des données vidé depuis le dernier démarrage : voir « Disque ».' : ''].filter(Boolean);
    const head = h('section', { class: 'card hvd', 'data-v': vl },
      h('div', { class: 'chead' }, h('h2', null, vl === 'bad' ? 'Serveur saturé' : vl === 'warn' ? 'Serveur à surveiller' : 'Serveur en forme'),
        h('button', { class: 'btn ghost small', id: 'hcGo', type: 'button', title: 'Relire maintenant (et le dossier des données)' }, 'Actualiser')),
      h('p', { class: 'hat', id: 'hcAt' }, 'Relu à ' + D_HM.format(v.at) + ' · de nouveau toutes les ' + Math.round(HC_EVERY / 1000) + ' s tant que cet onglet est affiché'),
      h('p', { class: 'hverd' }, verdict), extra.map(t => h('p', { class: 'hint' }, t)),
      fold('srv-vps', h('span', null, 'Quand envisager un VPS ?'), h('ul', { class: 'hvps' },
        h('li', null, 'Mémoire (rss) au-dessus de 70 % du plafond de l\'offre plusieurs jours de suite, ou mémoire de Node près de sa limite : l\'hébergeur arrête le processus.'),
        h('li', null, 'Redémarrages imprévus plusieurs fois par jour (plantage, mémoire, processus tué) ; les relances depuis hPanel, les mises en veille de l\'hébergeur et les déploiements ne comptent pas.'),
        h('li', null, 'Processeur au-dessus de 70 % ou serveur lent à répondre (plus de 100 ms) aux heures d\'affluence.'),
        h('li', null, 'Recherches CardTrader refusées « serveur complet » (JOB_MAX_RUNNING) ou file d\'attente vers CardTrader qui s\'allonge.'),
        h('li', null, 'Dossier des données vidé à chaque déploiement, sans moyen de le placer hors de l\'appli (EDH_DATA_DIR).'),
        h('li', { class: 'hn' }, 'Un pic isolé ne suffit pas : regarde ces signaux plusieurs jours, le soir et aux sorties d\'extensions. Couleurs : orange à 70 %, rouge à 85 % d\'un plafond.')), { shut: true, cls: 'hfold' }));
    // Mémoire et caches
    const counted = v.caches.reduce((t, c) => t + (c.used || 0), 0);
    const mem = h('section', { class: 'card hcard', id: 'hcMem' }, chead('Mémoire', m.limit ? 'plafond ' + MO(m.limit) + (m.from === 'cgroup' ? ' (hébergeur)' : ' (SERVER_MEM_MB)') : 'plafond inconnu'),
      hi('Mémoire du processus (rss)', MO(m.rss) + (m.limit ? ' · ' + PCT(m.rss / m.limit) : ''), { lv: lv.rss, part: m.limit ? m.rss / m.limit : null, k: 'rss', sub: m.limit ? '' : 'Plafond de l\'offre inconnu : SERVER_MEM_MB le donne.' }),
      hi('Mémoire de Node (tas)', MO(m.heapUsed) + ' / ' + MO(m.heapTotal), { lv: lv.heap, part: m.heapMax ? m.heapUsed / m.heapMax : null, k: 'heap', sub: 'utilisé / réservé · limite de Node : ' + MO(m.heapMax) + ' · hors tas (tampons) : ' + MO(m.external) }),
      h('h3', { class: 'hsub' }, 'Caches et leurs plafonds'),
      h('div', { class: 'hcl' }, v.caches.map(c => hi(CACHE[c.k] ? CACHE[c.k][0] : c.k, MO(c.used) + (c.max ? ' / ' + MO(c.max) : ''), { lv: c.lv === 'warn' ? 'warn' : c.max ? 'ok' : '', part: c.max ? c.used / c.max : null, k: 'c-' + c.k,
        sub: [c.n ? nf(c.n) + (c.k === 'ptlive' ? ' partie' + (c.n > 1 ? 's' : '') : c.k === 'files' || c.k === 'data' ? ' fichier' + (c.n > 1 ? 's' : '') : ' élément' + (c.n > 1 ? 's' : '')) : '', CACHE[c.k] && CACHE[c.k][1]].filter(Boolean).join(' · ') }))),
      h('p', { class: 'hint hfoot' }, 'Comptés ici : ' + MO(counted) + ' ; le reste (' + MO(Math.max(0, m.rss - counted)) + ') : Node, le code et les autres fonctions. Un cache plein n\'est pas une panne : ses plus anciens éléments partent.'));
    // Démarrage, processeur
    const loadOk = ld.n > 0 || bt.up > 30;
    const up = h('section', { class: 'card hcard', id: 'hcBoot' }, chead('Démarrage et charge', 'Node ' + bt.node),
      hi('Dernier démarrage', D_TIME.format(bt.start), { sub: 'en marche depuis ' + dur(bt.up), k: 'start' }),
      hi('Version servie', bt.build || '—', { k: 'build', sub: 'celle que /__ping donne à l\'appli' }),
      hi('Redémarrages imprévus (24 h)', nf(bt.restarts24), { lv: lv.restarts, k: 'restarts', sub: 'plantage, mémoire, processus tué · en 24 h aussi : ' + nf(bt.deploys24) + ' déploiement' + (bt.deploys24 > 1 ? 's' : '') + ', ' + nf(bt.stops24 || 0) + ' relance' + ((bt.stops24 || 0) > 1 ? 's' : '') + ' propre' + ((bt.stops24 || 0) > 1 ? 's' : '') + ' (hPanel, mise en veille par l\'hébergeur) · ' + nf(bt.boots7) + ' démarrage' + (bt.boots7 > 1 ? 's' : '') + ' en 7 jours' + (bt.known < 2 ? ' · relevés depuis ce démarrage' : '') }),
      hi('Processeur', loadOk ? nf(ld.cpu) + ' %' : '—', { lv: lv.cpu, part: loadOk ? Math.min(1, ld.cpu / 100) : null, k: 'cpu', sub: ld.n ? 'dernière minute · pire minute de l\'heure : ' + nf(ld.cpuMax) + ' %' : 'depuis le démarrage (relevé chaque minute)' }),
      hi('Temps de réaction', loadOk ? nf(ld.lag) + ' ms' : '—', { lv: lv.lag, k: 'lag', sub: 'retard de la boucle d\'événements (99 % du temps) · pire de l\'heure : ' + nf(ld.lagHour) + ' ms' }),
      bt.recent && bt.recent.length > 1 ? h('details', { class: 'hboots' }, h('summary', null, 'Derniers démarrages'), h('ol', null, bt.recent.map((x, i) => h('li', null, h('span', null, D_TIME.format(x.t)),
        h('small', null, (x.b || '—') + ({ deploy: ' · nouvelle version', stop: ' · relance propre', crash: ' · imprévu' }[x.k] || '')))))) : null);
    // Requêtes par minute
    const fams = rq ? Object.entries(rq.fams) : [], top = Math.max(1, ...fams.map(f => f[1]));
    const reqs = h('section', { class: 'card hcard', id: 'hcReq' }, chead('Requêtes par minute', rq ? (rq.win < 60 ? 'sur les ' + rq.win + ' dernières secondes' : 'les 60 dernières secondes') : ''),
      rq ? [h('div', { class: 'hbig' }, h('b', null, nf(rq.total)), h('span', null, 'requêtes', h('small', null, 'pic de l\'heure : ' + nf(rq.peak.n) + ' / min' + (rq.peak.n ? ' (' + D_HM.format(rq.peak.at) + ')' : '') + ' · ' + nf(rq.all) + ' depuis le démarrage'))),
        h('div', { class: 'hfam' }, fams.map(([k, n]) => h('div', { class: 'hf', 'data-f': k }, h('span', null, FAM[k] || k), h('b', null, nf(n)), h('span', { class: 'hbar', 'aria-hidden': 'true' }, h('i', { 'data-w': String(Math.round(n / top * 100)) })))))]
        : empty('Compteur coupé.'),
      h('p', { class: 'hint hfoot' }, 'Comptées par famille de routes, sans adresse ni compte. Les appels de ce panneau comptent dans « Administration ».'));
    // En direct
    const t = lv2.troc, pt = lv2.partie, jb = lv2.jobs, upq = lv2.up, al = lv2.alerts, s = n => (n > 1 ? 's' : '');
    const live = h('section', { class: 'card hcard', id: 'hcLive' }, chead('En direct'),
      hi('Échanges en direct ouverts', nf(t.open) + ' / ' + nf(t.max), { lv: lv.troc, part: t.open / t.max, k: 'troc', sub: nf(t.two) + ' à deux' }),
      pt.on ? hi('Tables de partie ouvertes', nf(pt.open) + ' / ' + nf(pt.max), { lv: lv.partie, part: pt.open / pt.max, k: 'partie', sub: nf(pt.live) + ' en cours · ' + nf(pt.phones) + ' téléphone' + s(pt.phones) + ' connecté' + s(pt.phones) }) : hi('Tables de partie', 'coupées', { k: 'partie' }),
      jb.on ? hi('Recherches CardTrader en cours', nf(jb.run) + ' / ' + nf(jb.max), { lv: lv.jobs, part: jb.run / jb.max, k: 'jobs', sub: (jb.busy ? nf(jb.busy) + ' refusée' + s(jb.busy) + ' (serveur complet) en 1 h, la dernière ' + ago(jb.busyAt) : 'aucune refusée en 1 h') + ' · ' + nf(jb.kept) + ' gardée' + s(jb.kept) + ' · plafond : JOB_MAX_RUNNING' }) : hi('Recherches CardTrader', 'coupées', { k: 'jobs' }),
      hi('Requêtes vers CardTrader', nf(upq.active) + ' / ' + nf(upq.conc), { lv: lv.up, part: upq.active / upq.conc, k: 'up', sub: nf(upq.queue) + ' en file d\'attente (UP_CONC)' }),
      al.on ? hi('Abonnés aux alertes de prix', nf(al.subs) + ' / ' + nf(al.max), { lv: lv.alerts, part: al.subs / al.max, k: 'alerts', sub: 'appareils (ALERT_MAX_SUBS)' }) : hi('Alertes de prix', 'coupées', { k: 'alerts' }));
    // Disque
    const dsub = !dk.exists ? 'Dossier absent : rien n\'est gardé (parties, classements, journal, copies des prix).' : dk.err ? 'Écriture impossible (' + dk.err + ').'
      : dk.fresh ? (dk.boots <= 1 ? 'Créé à ce démarrage : si ce n\'est pas le tout premier, le disque est vidé à chaque déploiement.' : 'Rien de plus ancien que ce démarrage : le dossier a été vidé.')
      : 'Gardé d\'un démarrage à l\'autre (' + nf(dk.boots) + ' démarrages depuis le ' + D_SHORT.format(dk.first) + ').';
    const disk = h('section', { class: 'card hcard', id: 'hcDisk' }, chead('Disque', dk.scan ? 'relu ' + ago(dk.scan) : ''),
      hi('Dossier des données', dk.exists ? nf(dk.files) + ' fichier' + s(dk.files) + ' · ' + MO(dk.bytes) + (dk.cut ? ' (au moins)' : '') : 'absent', { lv: lv.disk, k: 'disk', sub: dk.dir + (dk.env ? ' (EDH_DATA_DIR)' : '') }),
      hi('Plus ancien fichier', dk.oldest ? D_TIME.format(dk.oldest) : '—', { k: 'oldest', sub: dk.oldest ? ago(dk.oldest) : '' }),
      h('p', { class: 'hverd small' }, dsub),
      h('p', { class: 'hint hfoot' }, 'Si cette date se remet à aujourd\'hui après chaque déploiement, le disque est vidé : place EDH_DATA_DIR dans un dossier hors de l\'appli, ou passe sur un VPS. Relu au plus toutes les 10 min (« Actualiser » : tout de suite).'));
    // Historique des prix
    const hist = h('section', { class: 'card hcard', id: 'hcHist' }, chead('Historique des prix', hs.on ? hs.from || '' : 'coupé'),
      hs.on ? [hi('Jours gardés', hs.days ? nf(hs.days) + ' jours' : '—', { lv: lv.hist, k: 'hist', sub: hs.d0 ? 'du ' + D_DAY.format(Date.parse(hs.d0 + 'T12:00:00Z')) + ' au ' + D_DAY.format(Date.parse(hs.d1 + 'T12:00:00Z')) : 'pas encore lu' }),
        hi('Cartes', nf(hs.cards), { k: 'hcards', sub: hs.bytes ? MO(hs.bytes) + ' (compressé)' : '' }),
        hi('Dernière vérification', hs.check ? ago(Date.parse(hs.check)) : '—', { k: 'hcheck', sub: hs.err ? 'Erreur : ' + hs.err : '' })]
        : empty('PRICES_HIST_SOURCE_URL (ou PRICES_SOURCE_URL) vide : pas de courbe de prix dans la fiche d\'une carte.'));
    fill(box, head, h('div', { class: 'hgrid' }, h('div', { class: 'hcol' }, mem, reqs), h('div', { class: 'hcol' }, up, live, disk, hist)));
    hbars(box);
    $('#hcGo').addEventListener('click', () => health(true));
  }
  function server(v) {
    if (!v) return $('#srv').replaceChildren();
    const on = (k, label) => h('span', { class: 'tag ' + (v.flags[k] ? 'ok' : 'off') }, label);
    const px = v.prices, edh = v.edh, t = v.troc;      // version, mémoire, démarrages, dossier des données, en direct : carte « santé » au-dessus (hcDraw)
    $('#srv').replaceChildren(h('h2', null, 'Services'),
      h('div', { class: 'flags' }, on('token', 'Token CardTrader'), on('jobs', 'Recherches'), on('alerts', 'Alertes'), on('push', 'Web Push'), on('fcm', 'FCM'), on('pub', 'Decks publics'), on('amis', 'Amis'), on('troc', 'Échange en direct'), on('names', 'Noms'), on('scans', 'Scans signalés'), on('ads', 'Pub AdMob'),
        ...(v.off || []).map(x => h('span', { class: 'tag bad' }, x + ' coupé'))),
      h('dl', { class: 'kv' },
        kv('Prix',px.at ? 'relevé du ' + D_TIME.format(Date.parse(px.at)) + ' (' + ago(Date.parse(px.at)) + ') · ' + nf(px.cards) + ' cartes' : px.on ? 'pas encore relevés' : 'coupés', px.err ? 'bad' : null),
        ...(px.err ? kv('Prix : dernière erreur', px.err, 'bad') : []),
        kv('EDHREC', edh.at ? 'données du ' + String(edh.at).slice(0, 10) + ' · ' + nf(edh.decks) + ' decks · ' + nf(edh.cmds) + ' commandants (' + edh.from + ')' : '—', edh.err ? 'bad' : null),
        ...(edh.err ? kv('EDHREC : dernière erreur', edh.err, 'bad') : []),
        kv('Échanges conclus gardés', nf(t.done)),
        kv('Alertes de prix', 'dernier passage ' + ago(v.alerts.last) + ' · ' + nf(v.alerts.hits) + ' baisse' + (v.alerts.hits > 1 ? 's' : '') + ' signalée' + (v.alerts.hits > 1 ? 's' : '')),
        kv('Decks publics servis', nf(v.pub.n) + ' · ' + nf(v.pub.hid) + ' masqués · lus ' + ago(v.pub.at), v.pub.err ? 'bad' : null),
        kv('Amis (mémoire)', nf(v.amis.cache) + ' comptes en cache · ' + nf(v.amis.due) + ' résumés programmés')));
  }

  document.addEventListener('DOMContentLoaded', boot);
})();
