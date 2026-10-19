/* ── Mana Orbit — panneau d'administration (manaorbit.app/admin) ──────────────────────────────────────────────────────────────────
   Page sans données : connexion Google par le SDK Firebase (même configuration et même SDK que l'appli, src/cloud.js ; même origine, donc déjà
   connecté si l'appli l'est dans ce navigateur), puis GET /api/admin avec le jeton d'identité (x-firebase-token). Le serveur vérifie À CHAQUE
   appel que c'est le compte de l'éditeur (adresse vérifiée, liste du serveur) ; tout autre compte reçoit 403 → « Accès réservé », rien d'autre.
   Tout ce qui vient du serveur est déjà réduit (prénom + initiale, e-mail masqué, identifiant opaque) et n'est écrit qu'en textContent (pseudos libres).
   Tri, recherche et pages : côté serveur (?sort, dir, q, page). « Rafraîchir » : POST /api/admin/refresh (une fois par minute au plus). « CSV » : la même
   liste (tri et recherche en cours) par GET /api/admin/export. Actions, toujours confirmées : désactiver / réactiver un compte (fenêtre qui dit lequel),
   retirer un deck public (deux appuis) ; POST en JSON avec le jeton ; journal des actions tenu par le serveur.
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
    for (const k of kids.flat()) if (k != null && k !== false) e.append(typeof k === 'object' ? k : document.createTextNode(String(k)));
    return e;
  }
  const SVG = 'http://www.w3.org/2000/svg';
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
    $('#acts').hidden = v !== 'vMain';
    if (v === 'vErr') $('#errTxt').textContent = msg || 'Le serveur ne répond pas.';
    if (v !== 'vMain') {      // rien ne reste affiché d'une session admin précédente
      data = null; for (const id of ['#kpis', '#chart', '#achart', '#mix', '#ulist', '#pager', '#pubrep', '#journal', '#srv', '#notes', '#meta', '#scans', '#daily']) $(id).replaceChildren(); $('#scans').hidden = true; $('#daily').hidden = true; sc.seen = -1; sc.gen++; dy.gen++;
      const d = $('#dlg'); if (d.open) d.close(); d.replaceChildren();
    }
  }

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
    let resize = 0; addEventListener('resize', () => { clearTimeout(resize); resize = setTimeout(() => { if (data) { if (data.ov) chart(data.ov); achart(data.active); } }, 150); });
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
  function refresh() { const b = $('#btnRefresh'); b.disabled = true; load('/refresh', 'POST').finally(() => { b.disabled = false; }); }
  let toastT = 0;
  function toast(m) { let t = $('.toast'); if (!t) document.body.append(t = h('div', { class: 'toast', role: 'status' })); t.textContent = m; t.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), 3200); }

  function render() {
    show('vMain');
    const d = data, ov = d.ov;
    const src = { auth: 'Firebase Authentication + Firestore', firestore: 'Firestore seulement', none: 'aucune' }[d.src] || d.src;
    $('#meta').replaceChildren(d.at ? 'Données du ' + D_TIME.format(d.at) + ' (' + ago(d.at) + ') · source : ' + src + ' · gardées ' + Math.round(d.ttl / 60e3) + ' min' : 'Pas encore de données.');
    $('#notes').replaceChildren(...(d.notes || []).map(x => h('p', { class: 'note', 'data-k': x.k }, x.t)));
    $('#kpis').replaceChildren(...(ov ? kpis(ov) : []), ...(d.scans ? [kpi('Scans signalés', nf(d.scans.n), nf(d.scans.n7) + ' en 7 jours · ' + String(d.scans.mb).replace('.', ',') + ' Mo', 'scans')] : []));
    if (ov) chart(ov); else $('#chart').replaceChildren();
    achart(d.active);
    $('#mix').replaceChildren(...(ov ? mix(ov) : []));
    users(d.users);
    testers(d.testers);
    scans(d.scans);
    daily();
    pubrep(d.reported || []);
    journal(d.log);
    server(d.srv);
  }
  const kpi = (label, val, sub, k) => h('div', { class: 'kpi', 'data-k': k }, h('span', { class: 'l' }, label), h('b', null, val), sub ? h('small', null, sub) : null);
  function kpis(ov) {
    return [
      kpi('Comptes', nf(ov.users), nf(ov.mo) + ' avec des données Mana Orbit', 'users'),
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
      d.replaceChildren(h('h2', { id: 'dlgT' }, title), ...body, h('div', { class: 'dlgb' }, btns.map(([label, v, cls]) => { const b = h('button', { class: 'btn ' + (cls || 'ghost'), type: 'button', 'data-v': v }, label); b.addEventListener('click', () => d.close(v)); return b; })));
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
    $('#pubrep').replaceChildren(h('div', { class: 'chead' }, h('h2', null, 'Decks publics signalés'), h('small', null, nf(list.length) + ' deck' + (list.length > 1 ? 's' : ''))),
      h('p', { class: 'hint' }, '« Signaler ce deck » dans la Communauté ; au bout de ' + n + ' signalements, le deck est masqué tout seul. « Retirer » efface le deck public : il disparaît de la Communauté tout de suite ; son auteur peut le republier (ses signalements restent).'),
      h('div', { class: 'dyl pdl', 'data-empty': 'Aucun deck signalé.' }, list.length ? list.map(p => deckRow(p, true)) : [h('p', { class: 'empty' }, 'Aucun deck signalé.')]));
  }
  const ACT = { off: ['Compte désactivé', 'Désactivation refusée'], on: ['Compte réactivé', 'Réactivation refusée'], pub: ['Deck public retiré', 'Retrait refusé'] };
  /** Journal des actions (tenu par le serveur, les plus récentes d'abord) : action, compte (nom réduit, e-mail masqué), deck, date, éditeur. */
  function journal(log) {
    const box = $('#journal'), head = h('div', { class: 'chead' }, h('h2', null, 'Journal des actions'), h('small', null, log && log.length ? nf(log.length) + ' dernière' + (log.length > 1 ? 's' : '') : ''));
    if (log == null) return box.replaceChildren(head, h('p', { class: 'note' }, 'Journal des actions illisible sur le serveur.'));
    box.replaceChildren(head, h('p', { class: 'hint' }, 'Tenu par le serveur (500 dernières actions, réussies ou refusées) : nom réduit et e-mail masqué seulement.'), h('div', { class: 'dyl' }, log.length ? log.map(e => h('div', { class: 'dyr' + (e.ok ? '' : ' ko'), 'data-a': e.a },
      h('span', { class: 'pdt' }, h('b', null, (ACT[e.a] || [e.a, e.a])[e.ok ? 0 : 1]), h('small', null, [e.n || (e.a === 'pub' ? 'compte inconnu' : 'Sans nom'), e.m, e.d, e.t ? D_TIME.format(e.t) : '', e.by ? 'par ' + e.by : ''].filter(Boolean).join(' · '))),
      e.ok ? (e.e ? h('span', { class: 'tag' }, e.e) : null) : h('span', { class: 'tag bad' }, e.e || 'échec'))) : [h('p', { class: 'empty' }, 'Aucune action pour l\'instant.')]));
  }
  /** Inscrits au test fermé (page /testeurs) : nombre ; adresses complètes demandées au serveur seulement au clic (copie ou CSV pour la Play Console). */
  function testers(n) {
    const box = $('#testers');
    if (n == null) return box.replaceChildren(h('h2', null, 'Testeurs inscrits'), h('p', { class: 'note' }, 'Fichier des testeurs illisible sur le serveur.'));
    const get = async () => { const r = await call('/testeurs').catch(() => null); if (!r || r.status !== 200 || !r.body) { toast((r && r.body && r.body.message) || 'Le serveur ne répond pas.'); return null; } return r.body.rows || []; };
    const copy = h('button', { class: 'btn ghost small', type: 'button', disabled: !n }, 'Copier les adresses');
    copy.addEventListener('click', async () => {
      const rows = await get(); if (!rows) return;
      try { await navigator.clipboard.writeText(rows.map(r => r.e).join(', ')); toast(nf(rows.length) + ' adresse' + (rows.length > 1 ? 's' : '') + ' copiée' + (rows.length > 1 ? 's' : '') + '.'); }
      catch (e) { toast('Copie refusée par le navigateur : utilise le CSV.'); }
    });
    const csv = h('button', { class: 'btn ghost small', type: 'button', disabled: !n }, 'Télécharger le CSV');
    csv.addEventListener('click', async () => {
      const rows = await get(); if (!rows) return;
      save(new Blob([rows.map(r => r.e).join('\n') + '\n'], { type: 'text/csv;charset=utf-8' }), 'testeurs-mana-orbit-' + new Date().toISOString().slice(0, 10) + '.csv');
    });
    box.replaceChildren(h('div', { class: 'chead' }, h('h2', null, 'Testeurs inscrits'), h('small', null, nf(n) + ' adresse' + (n > 1 ? 's' : ''))),
      h('p', { class: 'note' }, 'Formulaire de la page /testeurs. Le CSV (une adresse par ligne) s\'importe dans Play Console › Tests › Test fermé › Testeurs › liste d\'adresses e-mail.'),
      h('div', { class: 'flags' }, copy, csv));
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
    if (!$('#scList')) box.replaceChildren(h('div', { class: 'chead' }, h('h2', null, 'Scans signalés'), h('small', { id: 'scCount' })),
      h('p', { class: 'hint' }, '« Signaler un problème de scan » dans l\'appli : la photo de la carte et ce que l\'appli a lu. Effacés après ' + sum.days + ' jours.'),
      ...(sum.err ? [h('p', { class: 'note' }, 'Dossier des signalements illisible sur le serveur.')] : []), h('div', { class: 'scl', id: 'scList' }), h('div', { class: 'pager', id: 'scMore' }));
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
    $('#scCount').textContent = scSum(b); scMore();
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
      if (!$('#scList .scr')) $('#scList').replaceChildren(h('p', { class: 'empty' }, 'Aucun scan signalé pour l\'instant.'));
      toast('Signalement supprimé.');
    });
    return art;
  }
  /* Carte mystère (proxy.mjs › /api/admin/daily, daily-srv.mjs) : carte du jour (réponse repliée), joueurs des 7 derniers jours (et niveau de compte) ; « Masquer »
     remplace un pseudo par « Pseudo masqué » dans tous les classements, jeu et niveaux (le score reste), « Rétablir » le rend. Anti-triche : parties « à vérifier »
     (même réseau, juste après un autre joueur : hors du top 100 public) et comptes trop souvent trouvés à l'étape 1 (signalés seulement) ; « Valider » les remet.
     Pseudos écrits en textContent seulement. */
  const dy = { gen: 0, q: '', d: null };
  const fold = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  async function daily() {
    const g = ++dy.gen; let r; try { r = await call('/daily'); } catch (e) { r = null; }
    if (g !== dy.gen) return;
    const box = $('#daily');
    if (r && r.status === 404) { box.hidden = true; return box.replaceChildren(); }      // DAILY=0 sur le serveur
    box.hidden = false;
    if (!r || r.status !== 200 || !r.body) return box.replaceChildren(h('div', { class: 'chead' }, h('h2', null, 'Carte mystère')), h('p', { class: 'note' }, (r && r.body && r.body.message) || 'Le serveur ne répond pas.'));
    dy.d = r.body; dyPaint(); dyKpi();
  }
  /** Tuile « Pseudos signalés » en haut du panneau (signalements des classements à traiter) ; un appui descend à la liste. */
  function dyKpi() {
    const rep = (dy.d && dy.d.reports) || [], hid = rep.filter(r => r.hid).length, old = $('#kpis [data-k="pseudos"]');
    const t = kpi('Pseudos signalés', nf(rep.length), rep.length ? nf(hid) + ' masqué' + (hid > 1 ? 's' : '') + ' en attente de ta décision' : 'rien à traiter', 'pseudos');
    if (rep.length) t.classList.add('alert');
    t.setAttribute('role', 'button'); t.tabIndex = 0; t.addEventListener('click', () => { const x = $('#dyRep'); if (x) x.scrollIntoView({ behavior: 'smooth', block: 'start' }); });
    if (old) old.replaceWith(t); else $('#kpis').append(t);
  }
  function dyPaint() {
    const d = dy.d, box = $('#daily'), list = h('div', { class: 'dyl', id: 'dyList' }), q = h('input', { type: 'search', placeholder: 'Chercher un pseudo…', 'aria-label': 'Chercher un pseudo', autocomplete: 'off', spellcheck: 'false' });
    q.value = dy.q; q.addEventListener('input', () => { dy.q = q.value.trim(); rows(); });
    const rows = () => {
      const l = d.rows.filter(r => !dy.q || fold(r.n).includes(fold(dy.q)));
      list.replaceChildren(...(l.length ? l.slice(0, 200).map(r => {
        const b = h('button', { class: 'btn ghost small', type: 'button' }, r.x ? 'Rétablir' : 'Masquer');
        b.addEventListener('click', async () => {
          b.disabled = true; let x; try { x = await call('/daily/hide', 'POST', { id: r.id, on: !r.x }); } catch (e) { x = null; }
          if (!x || x.status !== 200 || !x.body) { b.disabled = false; return toast((x && x.body && x.body.message) || 'Modification impossible.'); }
          d.rows = x.body.rows; d.hidden = x.body.hidden; toast(r.x ? 'Pseudo rétabli.' : 'Pseudo masqué dans les classements.'); dyPaint();
        });
        return h('div', { class: 'dyr' + (r.x ? ' off' : '') }, h('b', null, r.n), h('small', null, (r.d ? nf(r.s) + ' pts · ' + r.d + ' jour' + (r.d > 1 ? 's' : '') + (r.last ? ' · ' + r.last : '') : 'pas joué') + (r.lv ? ' · niv. ' + r.lv : '')), r.x ? h('span', { class: 'tag bad' }, 'masqué') : null, b);
      }) : [h('p', { class: 'empty' }, dy.q ? 'Aucun pseudo ne correspond.' : 'Personne n\'a encore joué cette semaine.')]));
    };
    const c = d.card;
    box.replaceChildren(h('div', { class: 'chead' }, h('h2', null, 'Carte mystère'), h('small', null, 'n° ' + d.no + ' · ' + d.day + ' · ' + nf(d.done) + ' terminée' + (d.done > 1 ? 's' : '') + ' sur ' + nf(d.plays) + ' · ' + nf(d.hidden) + ' masqué' + (d.hidden > 1 ? 's' : ''))),
      d.prep ? h('p', { class: 'note' }, 'Carte du jour en préparation' + (d.prep.since ? ' depuis ' + D_TIME.format(d.prep.since) : '') + (d.prep.err ? ' · dernier échec ' + D_TIME.format(d.prep.err.at) + ' : ' + d.prep.err.m + ' (nouvel essai toutes les 5 min)' : ' (tirage et images : une à deux minutes)')) : null,
      c ? h('details', { class: 'scd' }, h('summary', null, 'Réponse du jour'), h('p', null, c.en + (c.fr && c.fr !== c.en ? ' (' + c.fr + ')' : '') + (c.set ? ' · ' + c.set : '') + (d.fb && d.fb.length ? ' · image anglaise pour : ' + d.fb.join(', ') : ''))) : h('p', { class: 'note' }, d.st === 'ready' ? '' : 'Carte du jour en préparation.'),
      h('p', { class: 'hint' }, 'Joueurs des 7 derniers jours et classement des niveaux. « Masquer » remplace un pseudo par « Pseudo masqué » dans tous les classements ; le score reste. Classement public : comptes de plus de ' + (d.minAge || 0) + ' jours, Google ou adresse vérifiée.'), q, list,
      ...dyChecks(d));
    rows();
  }
  /** Parties « à vérifier » et comptes soupçonnés : « Valider » (POST /api/admin/daily/ok) remet la partie au classement, ou laisse le compte tranquille 7 parties. */
  function dyChecks(d) {
    const ok = (id, b, msg) => async () => {
      b.disabled = true; let x; try { x = await call('/daily/ok', 'POST', { id }); } catch (e) { x = null; }
      if (!x || x.status !== 200 || !x.body) { b.disabled = false; return toast((x && x.body && x.body.message) || 'Validation impossible.'); }
      dy.d = x.body; toast(msg); dyPaint();
    };
    const btn = (id, msg) => { const b = h('button', { class: 'btn ghost small', type: 'button' }, 'Valider'); b.addEventListener('click', ok(id, b, msg)); return b; };
    const mmss = ms => { const s = Math.round((ms || 0) / 1000); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
    const chk = d.chk || [], sus = d.sus || [], rep = d.reports || [];
    const act = (path, body, b, msg) => async () => {      // signalements : masquer / rétablir (hide), ignorer (report)
      b.disabled = true; let x; try { x = await call(path, 'POST', body); } catch (e) { x = null; }
      if (!x || x.status !== 200 || !x.body) { b.disabled = false; return toast((x && x.body && x.body.message) || 'Modification impossible.'); }
      dy.d = { ...dy.d, ...x.body }; toast(msg); dyPaint(); dyKpi();
    };
    const repRow = r => {
      const hide = h('button', { class: 'btn ghost small', type: 'button' }, r.hid ? 'Rétablir' : 'Masquer'), skip = h('button', { class: 'btn ghost small', type: 'button' }, 'Ignorer');
      hide.addEventListener('click', act('/daily/hide', { id: r.id, on: !r.hid }, hide, r.hid ? 'Pseudo rétabli, signalements effacés.' : 'Pseudo masqué dans les classements.'));
      skip.addEventListener('click', act('/daily/report', { id: r.id }, skip, 'Signalements effacés.'));
      return h('div', { class: 'dyr' + (r.hid ? ' off' : '') }, h('b', null, r.n), h('small', null, r.k + ' signalement' + (r.k > 1 ? 's' : '') + (r.at ? ' · ' + new Date(r.at).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }) : '')), r.hid ? h('span', { class: 'tag warn' }, 'masqué') : null, hide, skip);
    };
    return [h('h3', { class: 'dyh', id: 'dyRep' }, 'Pseudos signalés (' + nf(rep.length) + ')'),
      h('p', { class: 'hint' }, 'Signalés depuis les classements (jeu et niveaux). Au bout de ' + (d.repHide || 3) + ' personnes différentes, le pseudo est masqué tout seul en attendant ta décision. « Rétablir » : le pseudo est correct, ses signalements partent ; « Ignorer » : signalements effacés, pseudo laissé tel quel.'),
      h('div', { class: 'dyl' }, ...(rep.length ? rep.map(repRow) : [h('p', { class: 'empty' }, 'Aucun pseudo signalé.')])),
      h('h3', { class: 'dyh' }, 'À vérifier (' + nf(chk.length) + ')'),
      h('p', { class: 'hint' }, 'Même réseau, trouvée juste après un autre joueur qui avait vu autant d\'indices : hors du top 100 public et de son badge, sans que le joueur le sache. « Valider » (même box, famille…) la remet au classement.'),
      h('div', { class: 'dyl' }, ...(chk.length ? chk.map(r => h('div', { class: 'dyr' }, h('b', null, r.n), h('small', null, r.day + ' · ' + nf(r.s) + ' pts · étape ' + r.step + (r.ms ? ' en ' + mmss(r.ms) : '') + ' · ' + r.gap + ' s après ' + (r.by === 'win' ? 'une victoire' : 'l\'étape ' + r.other) + ' sur ce réseau'), h('span', { class: 'tag warn' }, 'à vérifier'), btn(r.id, 'Partie remise au classement.')))
        : [h('p', { class: 'empty' }, 'Aucune partie à vérifier.')])),
      h('h3', { class: 'dyh' }, 'Trop souvent à l\'étape 1 (' + nf(sus.length) + ')'),
      h('p', { class: 'hint' }, 'Signalés seulement, jamais exclus. « Valider » : plus de signalement pendant ses 7 prochaines parties.'),
      h('div', { class: 'dyl' }, ...(sus.length ? sus.map(r => h('div', { class: 'dyr' }, h('b', null, r.n), h('small', null, r.c + ' fois sur ses ' + r.of + ' dernières parties · ' + r.rate + ' % pour tous'), h('span', { class: 'tag warn' }, 'soupçon'), btn(r.id, 'Compte laissé tranquille.')))
        : [h('p', { class: 'empty' }, 'Aucun compte signalé.')]))];
  }
  function server(v) {
    if (!v) return $('#srv').replaceChildren();
    const on = (k, label) => h('span', { class: 'tag ' + (v.flags[k] ? 'ok' : 'off') }, label);
    const px = v.prices, edh = v.edh, t = v.troc;
    $('#srv').replaceChildren(h('h2', null, 'Serveur'),
      h('div', { class: 'flags' }, on('token', 'Token CardTrader'), on('jobs', 'Recherches'), on('alerts', 'Alertes'), on('push', 'Web Push'), on('fcm', 'FCM'), on('pub', 'Decks publics'), on('amis', 'Amis'), on('troc', 'Échange en direct'), on('names', 'Noms'), on('scans', 'Scans signalés'), on('ads', 'Pub AdMob'),
        ...(v.off || []).map(x => h('span', { class: 'tag bad' }, x + ' coupé'))),
      h('dl', { class: 'kv' },
        kv('Version de la page', v.build || '—'), kv('En marche depuis', dur(v.up)), kv('Mémoire', nf(v.rss) + ' Mo · Node ' + v.node),
        ...(v.data ? [kv('Données', v.data.dir + ' · ' + (v.data.err ? 'écriture impossible (' + v.data.err + ')' : v.data.boots <= 1 ? 'créées à ce démarrage : si ce n\'est pas le tout premier, le dossier est effacé à chaque déploiement (EDH_DATA_DIR vers un dossier hors de l\'appli)' : 'gardées depuis le ' + D_TIME.format(v.data.first) + ' · ' + nf(v.data.boots) + ' démarrages'), v.data.err || v.data.boots <= 1 ? 'bad' : null)] : []),
        kv('Prix', px.at ? 'relevé du ' + D_TIME.format(Date.parse(px.at)) + ' (' + ago(Date.parse(px.at)) + ') · ' + nf(px.cards) + ' cartes' : px.on ? 'pas encore relevés' : 'coupés', px.err ? 'bad' : null),
        ...(px.err ? kv('Prix : dernière erreur', px.err, 'bad') : []),
        kv('EDHREC', edh.at ? 'données du ' + String(edh.at).slice(0, 10) + ' · ' + nf(edh.decks) + ' decks · ' + nf(edh.cmds) + ' commandants (' + edh.from + ')' : '—', edh.err ? 'bad' : null),
        ...(edh.err ? kv('EDHREC : dernière erreur', edh.err, 'bad') : []),
        kv('Échanges en direct', nf(t.wait + t.live) + ' ouverts (' + nf(t.live) + ' à deux) · ' + nf(t.done) + ' conclus gardés'),
        kv('Recherches CardTrader', nf(v.jobs.run) + ' en cours · ' + nf(v.jobs.all) + ' gardées'),
        kv('Alertes de prix', nf(v.alerts.devices) + ' appareils · dernier passage ' + ago(v.alerts.last)),
        kv('Decks publics servis', nf(v.pub.n) + ' · ' + nf(v.pub.hid) + ' masqués · lus ' + ago(v.pub.at), v.pub.err ? 'bad' : null),
        kv('Amis (mémoire)', nf(v.amis.cache) + ' comptes en cache · ' + nf(v.amis.due) + ' résumés programmés')));
  }

  document.addEventListener('DOMContentLoaded', boot);
})();
