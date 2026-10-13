/* ── Mana Orbit — panneau d'administration (manaorbit.app/admin) ──────────────────────────────────────────────────────────────────
   Page sans données : connexion Google par le SDK Firebase (même configuration et même SDK que l'appli, src/cloud.js ; même origine, donc déjà
   connecté si l'appli l'est dans ce navigateur), puis GET /api/admin avec le jeton d'identité (x-firebase-token). Le serveur vérifie À CHAQUE
   appel que c'est le compte de l'éditeur (adresse vérifiée, liste du serveur) ; tout autre compte reçoit 403 → « Accès réservé », rien d'autre.
   Tout ce qui vient du serveur est déjà réduit (prénom + initiale, e-mail masqué, identifiant opaque) et n'est écrit qu'en textContent (pseudos libres).
   Tri, recherche et pages : côté serveur (?sort, dir, q, page). « Rafraîchir » : POST /api/admin/refresh (une fois par minute au plus).
   CSP stricte (proxy.mjs › ADM_CSP) : aucun script ni style en ligne, d'où ce fichier et admin.css ; graphique en SVG dessiné ici, sans bibliothèque. */
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

  const $ = s => document.querySelector(s);
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
    if (v !== 'vMain') { data = null; for (const id of ['#kpis', '#chart', '#mix', '#ulist', '#pager', '#srv', '#notes', '#meta']) $(id).replaceChildren(); }      // rien ne reste affiché d'une session admin précédente
  }

  async function boot() {
    show('vLoad');
    $('#btnIn').addEventListener('click', signIn);
    $('#btnSwitch').addEventListener('click', () => signOut().then(signIn));
    $('#btnOut').addEventListener('click', () => signOut());
    $('#btnRetry').addEventListener('click', () => (user ? load() : show('vOut')));
    $('#btnRefresh').addEventListener('click', refresh);
    $('#q').addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(() => { st.q = $('#q').value.trim(); st.page = 1; load(); }, 280); });
    $('#sort').addEventListener('change', () => { st.sort = $('#sort').value; st.page = 1; load(); });
    $('#dir').addEventListener('click', () => { st.dir = st.dir === 'desc' ? 'asc' : 'desc'; st.page = 1; load(); });
    let resize = 0; addEventListener('resize', () => { clearTimeout(resize); resize = setTimeout(() => data && chart(data.ov), 150); });
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
  async function call(path, method) {
    for (let a = 0; a < 2; a++) {
      const tok = await user.getIdToken(a > 0);
      const r = await fetch('/api/admin' + path, { method: method || 'GET', cache: 'no-store', headers: { 'x-firebase-token': tok, ...(method === 'POST' ? { 'Content-Type': 'application/json' } : {}) }, ...(method === 'POST' ? { body: '{}' } : {}) });
      const body = await r.json().catch(() => null);
      if (r.status === 401 && body && body.error === 'token_expired' && a === 0) continue;
      return { status: r.status, body };
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
    $('#kpis').replaceChildren(...(ov ? kpis(ov) : []));
    if (ov) chart(ov); else $('#chart').replaceChildren();
    $('#mix').replaceChildren(...(ov ? mix(ov) : []));
    users(d.users);
    server(d.srv);
  }
  const kpi = (label, val, sub, k) => h('div', { class: 'kpi', 'data-k': k }, h('span', { class: 'l' }, label), h('b', null, val), sub ? h('small', null, sub) : null);
  function kpis(ov) {
    return [
      kpi('Comptes', nf(ov.users), nf(ov.mo) + ' avec des données Mana Orbit', 'users'),
      kpi('Nouveaux', nf(ov.new7) + ' · ' + nf(ov.new30), '7 jours · 30 jours', 'new'),
      kpi('Actifs', nf(ov.act7) + ' · ' + nf(ov.act30), '7 j · 30 j · connectés ' + nf(ov.log7) + ' · ' + nf(ov.log30), 'act'),
      kpi('Cartes', nf(ov.cards), nf(ov.copies) + ' exemplaires · ' + nf(ov.colls) + ' collections', 'cards'),
      kpi('Decks', nf(ov.decks), nf(ov.pub) + ' publiés · ' + nf(ov.reports) + ' signalement' + (ov.reports > 1 ? 's' : ''), 'decks'),
      kpi('Échange', nf(ov.trade), 'liens actifs · ' + nf(ov.dlinks) + ' decks partagés', 'trade'),
      kpi('Amis', nf(ov.friendships), 'amitiés · ' + nf(ov.pending) + ' demande' + (ov.pending > 1 ? 's' : '') + ' en attente', 'friends'),
      kpi('Valeur', EUR.format((ov.value || 0) / 100), nf(ov.valued) + ' collection' + (ov.valued > 1 ? 's' : '') + ' estimée' + (ov.valued > 1 ? 's' : ''), 'value'),
    ];
  }
  /** Inscriptions par jour (30 derniers jours) : barres fines arrondies en haut, posées sur la ligne de base ; survol : jour et nombre. */
  function chart(ov) {
    const box = $('#chart'), days = ov.days || [], total = days.reduce((t, x) => t + x[1], 0);
    const head = h('div', { class: 'chead' }, h('h2', null, 'Inscriptions par jour'), h('small', null, nf(total) + ' en 30 jours'));
    const W = Math.max(260, Math.round(box.clientWidth - 32) || 320), H = 150, top = 14, bot = 22, left = 26, plotW = W - left - 4, plotH = H - top - bot;
    const max = Math.max(1, ...days.map(x => x[1])), step = plotW / Math.max(1, days.length), bw = Math.max(3, step - 2);
    const svg = s('svg', { width: W, height: H, viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': 'Inscriptions par jour sur 30 jours : ' + total + ' au total' });
    for (const v of max > 1 ? [max, Math.round(max / 2)] : [max]) {      // repères discrets : maximum et moitié
      const y = top + plotH - v / max * plotH;
      svg.append(s('line', { x1: left, x2: W - 4, y1: y, y2: y, class: 'grid' }));
      const t = s('text', { x: left - 6, y: y + 4, class: 'ax', 'text-anchor': 'end' }); t.textContent = String(v); svg.append(t);
    }
    svg.append(s('line', { x1: left, x2: W - 4, y1: top + plotH, y2: top + plotH, class: 'base' }));
    days.forEach(([day, n], i) => {
      const x = left + i * step + (step - bw) / 2, bh = n ? Math.max(3, n / max * plotH) : 0, y = top + plotH - bh, r = Math.min(4, bw / 2, bh);
      const g = s('g', { class: 'bar' + (n ? '' : ' zero') }), label = D_DAY.format(Date.parse(day + 'T12:00:00Z')) + ' : ' + n + ' inscription' + (n > 1 ? 's' : '');
      const tt = s('title'); tt.textContent = label; g.append(tt);
      g.append(s('rect', { x: left + i * step, y: top, width: step, height: plotH, class: 'hit' }));      // zone de survol plus grande que la barre
      if (n) g.append(s('path', { d: `M${x},${top + plotH}V${y + r}Q${x},${y} ${x + r},${y}H${x + bw - r}Q${x + bw},${y} ${x + bw},${y + r}V${top + plotH}Z`, class: 'fill' }));
      svg.append(g);
    });
    for (const i of [0, Math.floor(days.length / 2), days.length - 1]) {
      if (!days[i]) continue;
      const t = s('text', { x: left + i * step + step / 2, y: H - 6, class: 'ax', 'text-anchor': i === 0 ? 'start' : i === days.length - 1 ? 'end' : 'middle' });
      t.textContent = D_DAY.format(Date.parse(days[i][0] + 'T12:00:00Z')); svg.append(t);
    }
    box.replaceChildren(head, svg);
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
            r.disabled ? h('span', { class: 'tag bad' }, 'désactivé') : null, r.mo ? null : h('span', { class: 'tag' }, 'sans données'), r.lang ? h('span', { class: 'tag' }, r.lang.toUpperCase()) : null))),
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
  function server(v) {
    if (!v) return $('#srv').replaceChildren();
    const on = (k, label) => h('span', { class: 'tag ' + (v.flags[k] ? 'ok' : 'off') }, label);
    const px = v.prices, edh = v.edh, t = v.troc;
    $('#srv').replaceChildren(h('h2', null, 'Serveur'),
      h('div', { class: 'flags' }, on('token', 'Token CardTrader'), on('jobs', 'Recherches'), on('alerts', 'Alertes'), on('push', 'Web Push'), on('fcm', 'FCM'), on('pub', 'Decks publics'), on('amis', 'Amis'), on('troc', 'Échange en direct'), on('names', 'Noms'), on('ads', 'Pub AdMob'),
        ...(v.off || []).map(x => h('span', { class: 'tag bad' }, x + ' coupé'))),
      h('dl', { class: 'kv' },
        kv('Version de la page', v.build || '—'), kv('En marche depuis', dur(v.up)), kv('Mémoire', nf(v.rss) + ' Mo · Node ' + v.node),
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
