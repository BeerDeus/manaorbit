/* ── daily.js : « Carte mystère », le jeu du jour (serveur : daily-srv.mjs, routes /api/daily… et /api/level…, README › « Carte mystère ») ───────────────
   · Barre du haut, à côté du logo : le bouton de la Carte mystère (orbites et pulsation tant que la carte du jour n'est pas jouée, coche ensuite) et le podium
     des classements (jour · semaine · saison · niveaux).
   · Mode chronométré : « Participer ? » (feuille des règles), décompte 3-2-1, puis une étape toutes les 12 s ; le serveur tient l'horloge (départ à l'envoi de
     l'image de l'étape 1, images refusées avant leur heure, +10 s par mauvaise proposition, « Indice suivant » avance l'horloge) et calcule le score à la réception
     de la bonne proposition. L'appli ne reçoit jamais l'image entière ni le nom avant la fin ; perdue : la réponse arrive avec la carte suivante.
   · Écran plein (.dv.dly) : chrono (étape, temps, points), images, nom par la fin, recherche des noms de sa langue (« ange » → les cartes qui commencent par
     « ange »), propositions faites, abandon. Fin : la carte (trouvée), le score, la place, le résultat à partager (emojis, sans la réponse), les classements.
   · Sans compte : partie pour le plaisir ; compte récent (moins de 7 jours) ou appareil déjà joué par un autre compte : messages du serveur (why).
   · Jeton d'appareil (x-daily-device) gardé dans le stockage local, IndexedDB et les Preferences de Capacitor. XP du compte envoyée au classement des niveaux.
   · Pub (ads.js › adsBusy) : jamais pendant le décompte et la partie (.dly-play) ; permise sur le résultat et les classements.
   · Lien d'essai seulement (dlyOn : window.MO_TEST et /__ping › daily) : sinon rien n'apparaît ni ne s'ouvre. Mode streamer : pas d'animation.
   · dailyBadges() : badges vérifiés par le serveur, pour le module niveau et badges. */
const DY = { st: null, at: 0, off: 0, el: null, v: null, mode: '', bp: 'day', boards: {}, seen: new Set(), names: null, namesL: '', namesP: null, en: null, enP: null, hits: [], sel: -1, busy: false,
  tickT: 0, refT: 0, nextT: 0, badges: null, badgesAt: 0, badgesUid: '', load: 0, dev: '', lvT: 0, lvAt: 0, lvXp: -1, lvUid: '', quit: 0 };
const DY_KEY = 'deckdeal:daily:v1', DY_DEV = 'deckdeal:daily:dev', DY_LANGS = ['fr', 'en', 'de', 'es', 'it', 'pt'], DY_SUG = 8;
const DY_PTS = { base: 1000, grace: 500, perSec: 7.5, min: 50 };      // barème du serveur (daily-srv.mjs › DLY_SCORE), seulement pour afficher les points du moment
const DY_ICON = '<svg class="dly-ic" viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="2.8" width="14" height="18.4" rx="2.6" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M9.6 9.3a2.5 2.5 0 1 1 3.6 2.2c-.8.4-1.2.9-1.2 1.7v.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><circle cx="12" cy="16.6" r="1.1" fill="currentColor"/></svg>';
const DY_PODIUM = '<svg class="dly-ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M8.6 20.6V12.4h6.8v8.2M3 20.6v-5.4h5.6M21 20.6v-7h-5.6M2.4 20.6h19.2" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M12 3l1.2 2.4 2.6.4-1.9 1.8.5 2.6L12 9l-2.4 1.2.5-2.6-1.9-1.8 2.6-.4z" fill="currentColor"/></svg>';
const DY_CHECK = '<svg class="dly-ck" viewBox="0 0 12 12" aria-hidden="true"><path d="M2.6 6.3l2.2 2.2 4.6-4.8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
/** Le jeu est-il proposé ? Lien d'essai (window.MO_TEST, app.js › MO_TEST) et serveur qui l'annonce. */
const dlyOn = () => typeof MO_TEST !== 'undefined' && MO_TEST === true && CTX.daily === true;
const dlyLang = () => (DY_LANGS.includes(I18N.lang) ? I18N.lang : 'en');
const dlyNow = () => Date.now() + DY.off;      // heure du serveur (chrono et compte à rebours ne dépendent pas de l'horloge du téléphone)
const dlyKey = s => normPart(String(s || '').split('//')[0]);
const dlyPts = ms => Math.max(DY_PTS.min, Math.round(DY_PTS.base - DY_PTS.perSec * Math.max(0, ms - DY_PTS.grace) / 1000));
const dlyMmss = ms => { const s = Math.max(0, Math.floor(ms / 1000)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
function dlyLs() { try { const o = JSON.parse(localStorage.getItem(DY_KEY) || 'null'); return o && typeof o === 'object' ? o : {}; } catch (e) { return {}; } }
function dlyLsSet(o) { try { localStorage.setItem(DY_KEY, JSON.stringify(o)); } catch (e) { /* stockage plein ou refusé : la partie reste sur le serveur */ } }

/* ── Jeton d'appareil : un appareil = un compte classé par jour (serveur). Effacer un seul stockage ne suffit pas à repartir de zéro. ── */
function dlyIdb(op, v) {
  return new Promise((ok, ko) => {
    if (typeof indexedDB === 'undefined') return ko(new Error('idb'));
    let r; try { r = indexedDB.open('mana-orbit-daily', 1); } catch (e) { return ko(e); }
    r.onupgradeneeded = () => r.result.createObjectStore('kv'); r.onerror = () => ko(r.error); r.onblocked = () => ko(new Error('idb'));
    r.onsuccess = () => { try { const db = r.result, tx = db.transaction('kv', op === 'get' ? 'readonly' : 'readwrite'), s = tx.objectStore('kv'), q = op === 'get' ? s.get('dev') : s.put(v, 'dev'); q.onsuccess = () => ok(q.result); q.onerror = () => ko(q.error); tx.oncomplete = () => db.close(); } catch (e) { ko(e); } };
  });
}
const dlyDevOk = t => typeof t === 'string' && /^[\w-]{22}\.[\w-]{16}$/.test(t);
async function dlyDevLoad() {
  let t = ''; try { t = localStorage.getItem(DY_DEV) || ''; } catch (e) { t = ''; }
  if (!dlyDevOk(t)) t = await dlyIdb('get').catch(() => '');
  const P = typeof natPlugin === 'function' ? natPlugin('Preferences') : null;
  if (!dlyDevOk(t) && P) { try { const r = await P.get({ key: DY_DEV }); t = (r && r.value) || ''; } catch (e) { t = ''; } }
  if (dlyDevOk(t) && !DY.dev) dlyDevSave(t);
}
function dlyDevSave(t) {
  if (!dlyDevOk(t)) return; DY.dev = t;
  try { localStorage.setItem(DY_DEV, t); } catch (e) { /* stockage refusé */ }
  dlyIdb('set', t).catch(() => {});
  const P = typeof natPlugin === 'function' ? natPlugin('Preferences') : null; if (P) Promise.resolve().then(() => P.set({ key: DY_DEV, value: t })).catch(() => {});
}

/** Appel de /api/daily… (ou /api/level… : base) avec le jeton Firebase si connecté et le jeton d'appareil ; erreur : { code: 'net' | code du serveur, status, j }. */
async function dlyCall(path, { method = 'GET', body, base = 'api/daily' } = {}) {
  const u = D.user;
  const go = async force => {
    const h = { Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}), ...(DY.dev ? { 'x-daily-device': DY.dev } : {}) };
    if (u) { try { h['x-firebase-token'] = await u.getIdToken(force); } catch (e) { throw Object.assign(new Error('jeton'), { code: 'net' }); } }
    let r; try { r = await fetch(base + path, { method, cache: 'no-store', headers: h, body: body ? JSON.stringify(body) : undefined }); } catch (e) { throw Object.assign(new Error('réseau'), { code: 'net' }); }
    const j = await r.json().catch(() => null);
    if (j && j.dev) dlyDevSave(j.dev);
    if (j && Number(j.now) > 0) DY.off = Number(j.now) - Date.now();
    if (!r.ok) throw Object.assign(new Error((j && j.message) || 'HTTP ' + r.status), { code: (j && j.error) || 'http', status: r.status, j });
    return j || {};
  };
  try { return await go(false); } catch (e) { if (e.code === 'token_expired' && u) return go(true); throw e; }
}
function dlyErrText(e) {
  const c = e && e.code;
  return c === 'net' ? T('Hors ligne : la Carte mystère revient avec le réseau.') : c === 'wait' ? T('La carte du jour se prépare : réessaie dans un instant.') : c === 'rate_limited' ? T('Trop de parties depuis ce réseau : réessaie plus tard.')
    : c === 'over' ? T('Cette carte est terminée : une nouvelle est arrivée.') : T('Carte mystère indisponible pour le moment.');
}

/* ── État du jour, boutons de la barre du haut ─────────────────────────────────────────────────────────────────────────── */
/** État du jour (carte prête, prochaine carte, ma partie, réponse d'hier) ; relu au plus une fois par minute, et dès que la prochaine carte est sortie. */
async function dlyStatus(force) {
  if (!dlyOn()) return null;
  const fresh = DY.st && Date.now() - DY.at < 60e3 && !(DY.st.next && dlyNow() >= DY.st.next);
  if (!force && fresh) return DY.st;
  const l = dlyLs(), q = new URLSearchParams({ l: dlyLang(), ...(!D.user && l.k ? { k: l.k } : {}) });
  try { DY.st = await dlyCall('?' + q); DY.at = Date.now(); }
  catch (e) { if (e.status === 404) { CTX.daily = false; dlyBtn(); } return null; }
  dlyPaintBtn(); dlyArm(); return DY.st;
}
/** La partie du jour est-elle finie (sur le serveur, ou notée sur l'appareil) ? */
function dlyDone() {
  const st = DY.st; if (!st) return false;
  const me = st.me, l = dlyLs();
  return !!((me && (me.st === 'win' || me.st === 'lost')) || (!D.user && l.day === st.day && l.done));
}
/** Relit l'état à l'heure de la prochaine carte (le bouton s'anime tout seul). */
function dlyArm() {
  clearTimeout(DY.nextT); const st = DY.st; if (!st || !st.next) return;
  const ms = Math.min(2 ** 31 - 1, Math.max(5000, st.next - dlyNow() + 1500));
  DY.nextT = setTimeout(() => dlyStatus(true), ms);
}
function dlyBtn() {
  let w = document.getElementById('dlyHbs');
  if (!dlyOn()) { if (w) w.remove(); return null; }
  if (!w) {
    const br = $('.bar .brand'); if (!br) return null;
    br.insertAdjacentHTML('afterend', `<div class="dly-hbs" id="dlyHbs"><button class="dly-hb" id="btnDaily" type="button" data-new="0"><span class="dly-orb" aria-hidden="true"><i></i><i></i><i></i></span>${DY_ICON}<i class="dly-dot" aria-hidden="true"></i><span class="dly-done" aria-hidden="true">${DY_CHECK}</span></button>`
      + `<button class="dly-hb dly-rk" id="btnRanks" type="button" aria-label="${esc(T('Classements'))}" title="${esc(T('Classements'))}">${DY_PODIUM}</button></div>`);
    w = document.getElementById('dlyHbs');
    $('#btnDaily', w).onclick = () => dlyTap();
    $('#btnRanks', w).onclick = () => { haptic('tap'); dlyRanks(); };
  }
  return $('#btnDaily', w);
}
function dlyPaintBtn() {
  const b = dlyBtn(); if (!b) return;
  const st = DY.st, done = dlyDone(), fresh = !!(st && st.st === 'ready' && !done);
  b.dataset.new = fresh ? '1' : '0'; b.dataset.done = done ? '1' : '0';
  const l = done ? T('Carte mystère : classements') : fresh ? T('Carte mystère : une nouvelle carte à deviner') : T('Carte mystère');
  b.setAttribute('aria-label', l); b.title = l;
}
/** Serveur connu (/__ping) : boutons posés, état lu, XP envoyée. */
function dlyPing() { if (!dlyOn()) { dlyBtn(); return; } dlyPaintBtn(); dlyDevLoad().finally(() => dlyStatus(true)); dlyLevelSoon(true); }
function dlyInit() {
  document.addEventListener('visibilitychange', () => { if (!document.hidden && dlyOn()) { dlyStatus(); if (DY.mode === 'play') dlyRefresh(); } });
}
/** Changement de compte (decks.js › onUser) : partie et badges d'un autre compte oubliés, état relu. */
function dlyUser() { DY.badges = null; DY.badgesAt = 0; DY.st = null; DY.boards = {}; DY.lvXp = -1; if (DY.el && (DY.mode === 'play' || DY.mode === 'count')) dlyClose(); if (dlyOn()) { dlyStatus(true); dlyLevelSoon(true); } }
/** Lien ?mystere (résultat partagé) : comme le bouton, seulement sur le lien d'essai. */
function dlyLaunch() { if (dlyOn()) setTimeout(() => dlyTap(), 700); }
/** Bouton de la Carte mystère : « Participer ? » si la partie du jour n'a pas commencé ; sinon la partie en cours, ou le résultat et les classements. */
async function dlyTap() {
  if (!dlyOn()) return; haptic('tap');
  const st = DY.st || await dlyStatus(true);
  if (st && st.st === 'ready' && !dlyDone() && !(st.me && st.me.started)) return dlyAsk();
  dlyOpen();
}
/** Feuille « Participer à la Carte mystère du jour ? » : les règles, puis « C'est parti » (décompte 3-2-1, puis le chrono). */
function dlyAsk() {
  openSheet(T('Participer à la Carte mystère du jour ?'), '', api => {
    api.wrap.classList.add('dly-ask');
    api.body.innerHTML = `<ul class="dly-rules">
        <li><b>⏱</b>${esc(T('10 indices, un nouveau toutes les 12 secondes.'))}</li>
        <li><b>★</b>${esc(T('Le score baisse avec le temps : 1 000 points au départ, 7,5 de moins par seconde.'))}</li>
        <li><b>✗</b>${esc(T('6 essais ; une mauvaise proposition coûte 10 secondes.'))}</li>
        <li><b>1</b>${esc(T('Une seule partie classée par jour.'))}</li></ul>
      ${!D.user ? `<div class="dly-note"><p>${esc(T('Sans compte, ta partie n\'est pas classée.'))}</p><button class="btn ghost small" type="button" data-dly="login">${esc(T('Se connecter'))}</button></div>` : ''}`;
    api.setFoot(`<button class="btn ghost" type="button" data-close>${esc(T('Plus tard'))}</button><button class="btn" type="button" data-dly="go">${esc(T('C\'est parti'))}</button>`);
    api.wrap.addEventListener('click', e => {
      const b = e.target.closest('[data-dly]'); if (!b) return;
      if (b.dataset.dly === 'go') { haptic('ok'); api.close(); dlyOpen({ go: true }); }
      else if (b.dataset.dly === 'login') { api.close(); openAccount(); }
    });
  });
}
/** Classements (podium de la barre du haut, fiche « Niveau et badges ») ; tab : day, week, season, level. */
function dlyRanks(tab) { if (!dlyOn()) return; if (DY.el) DY.el.__close(); if (tab) DY.bp = tab; dlyOpen({ boards: true }); }

/* ── Écran du jeu ─────────────────────────────────────────────────────────────────────────────────────────────────────── */
function dlyClose() { if (DY.el) DY.el.__close(); }
async function dlyOpen(o = {}) {
  if (!dlyOn() || DY.el) return;
  const wrap = document.createElement('div'); wrap.className = 'dv dly' + (o.boards ? '' : ' dly-play'); wrap.setAttribute('role', 'dialog'); wrap.setAttribute('aria-modal', 'true'); wrap.setAttribute('aria-label', o.boards ? T('Classements') : T('Carte mystère'));
  wrap.innerHTML = `<header class="dv-head"><button class="icon-btn dv-back" type="button" data-dly="close" aria-label="${T('Fermer')}"><svg class="i"><use href="#i-back"/></svg></button>
      <span class="dly-hic" aria-hidden="true">${o.boards ? DY_PODIUM : DY_ICON}</span><div class="dv-title"><b>${o.boards ? T('Classements') : T('Carte mystère')}</b><span class="dly-sub"></span></div></header>
    <div class="dv-scroll"><div class="dv-body dly-body"><div class="dly-main"><p class="dly-wait"><span class="dly-spin" aria-hidden="true"></span>${T('Chargement de la carte du jour…')}</p></div></div></div>
    <div class="dly-foot" hidden></div>`;
  DY.el = wrap; DY.mode = 'load'; DY.v = null; DY.hits = []; DY.sel = -1; DY.quit = 0; const prevFocus = document.activeElement;
  const onKey = e => { if (e.key === 'Escape' && !imgView && !sheets.length && DY.el === wrap) { e.stopPropagation(); wrap.__close(); } };
  wrap.__close = () => {
    if (DY.el !== wrap) return; DY.el = null; DY.mode = ''; clearInterval(DY.tickT); clearTimeout(DY.refT); document.removeEventListener('keydown', onKey, true);
    wrap.classList.remove('on'); setTimeout(() => wrap.remove(), reduceMotion() ? 0 : 240); releaseApp(); dlyPaintBtn();
    try { if (prevFocus && prevFocus.focus && prevFocus.isConnected) prevFocus.focus({ preventScroll: true }); } catch (e) { /* ignore */ }
  };
  document.addEventListener('keydown', onKey, true);
  wrap.addEventListener('click', dlyClick);
  wrap.addEventListener('input', e => { if (e.target.classList.contains('dly-q')) dlySearch(e.target.value); });
  wrap.addEventListener('keydown', dlyKeys);
  wrap.addEventListener('load', e => { const f = e.target.tagName === 'IMG' && e.target.closest('figure'); if (f) { f.classList.add('ok'); DY.seen.add(e.target.getAttribute('src')); } }, true);      // image déjà vue : montrée sans fondu au repeint suivant
  wrap.addEventListener('error', e => { const f = e.target.tagName === 'IMG' && e.target.closest('figure'); if (f) { f.classList.add('bad'); if (DY.mode === 'play') { clearTimeout(DY.refT); DY.refT = setTimeout(dlyRefresh, 700); } } }, true);      // image refusée (pas encore l'heure) : relue
  document.body.appendChild(wrap); holdApp();
  requestAnimationFrame(() => requestAnimationFrame(() => { wrap.classList.add('on'); $('.dv-back', wrap).focus({ preventScroll: true }); }));
  DY.tickT = setInterval(dlyTick, 250);
  if (o.boards) return dlyBoardsOnly();
  await dlyStart(!!o.go);
}
/** Commence (ou reprend) la partie du jour ; go : décompte puis chrono ; finie : le résultat et les classements. */
async function dlyStart(go) {
  const el = DY.el; if (!el) return;
  const n = ++DY.load, l = dlyLs();
  try {
    const st = await dlyStatus(true);
    if (!st) throw Object.assign(new Error('net'), { code: navigator.onLine === false ? 'net' : 'http' });
    if (st.st !== 'ready') throw Object.assign(new Error('wait'), { code: 'wait' });
    let v = await dlyCall('/start', { method: 'POST', body: { l: dlyLang(), n: D.user ? String(PROF.name || '').trim().slice(0, 24) : '', ...(!D.user && l.day === st.day && l.k ? { k: l.k } : {}) } });
    if (DY.el !== el || n !== DY.load) return;
    if (!v.res && !v.t0) {      // pas encore commencée : décompte (sinon, depuis un lien, la feuille des règles d'abord)
      if (!go) { el.__close(); return dlyAsk(); }
      dlyLsSet({ day: v.day, k: v.acct ? '' : v.k, done: false });
      if (!(await dlyCount())) return;
      v = await dlyCall('/go', { method: 'POST', body: { k: v.k } });
      if (DY.el !== el || n !== DY.load) return;
    }
    dlyApply(v);
  } catch (e) {
    if (DY.el !== el || n !== DY.load) return;
    DY.mode = 'err'; $('.dly-foot', el).hidden = true;
    $('.dly-main', el).innerHTML = `<div class="dly-msg"><p>${esc(dlyErrText(e))}</p><button class="btn ghost small" type="button" data-dly="retry">${T('Réessayer')}</button></div>`;
  }
}
/** Décompte 3-2-1 (le chrono part ensuite, à l'envoi de l'image de l'étape 1) ; false : écran fermé entre-temps. */
async function dlyCount() {
  const el = DY.el; if (!el) return false;
  DY.mode = 'count'; el.classList.add('dly-play'); $('.dly-sub', el).textContent = T('Prépare-toi…');
  $('.dly-main', el).innerHTML = `<div class="dly-count" role="timer" aria-live="assertive"><span class="dly-cn"></span><p>${esc(T('10 indices, un nouveau toutes les 12 secondes.'))}</p></div>`;
  for (const k of [3, 2, 1]) {
    const c = $('.dly-cn', el); if (DY.el !== el || !c) return false;
    c.textContent = k; c.classList.remove('go'); void c.offsetWidth; c.classList.add('go'); haptic('tap');
    await new Promise(r => setTimeout(r, 1000));
  }
  return DY.el === el;
}
/** Réponse du serveur → écran. */
function dlyApply(v) {
  if (!DY.el || !v || !v.k) return;
  const was = DY.v; DY.v = v;
  dlyLsSet({ day: v.day, k: v.acct ? '' : v.k, done: !!v.res });
  if (DY.st && DY.st.day === v.day) DY.st.me = { k: v.k, st: v.st, step: v.step, started: !!v.t0, ...(v.res ? { s: v.res.s, r: v.res.r, total: v.res.total } : {}) };
  if (v.res) { dlyEnd(); return; }
  DY.mode = 'play'; DY.el.classList.add('dly-play');
  dlyNamesLoad(dlyLang()); if (v.fb) dlyNamesEn();
  if (!was || was.step !== v.step || was.mask !== v.mask || was.wrong.length !== v.wrong.length || !$('.dly-chrono', DY.el)) dlyPaintPlay(); else dlyTick();
  dlyPaintBtn();
  if (typeof adsRefresh === 'function') adsRefresh();
}
/** Horloge de la partie à l'instant (ms), comme le serveur la tient. */
const dlyClock = v => (!v || !v.t0 ? 0 : v.res ? v.res.ms : Math.max(0, dlyNow() - v.t0 + (v.sh || 0)));
function dlyMaskHtml(m) {
  return Array.from(m).map(c => (c === '_' ? '<i class="dly-ml"></i>' : c === ' ' ? '<span class="dly-sp"></span>' : `<b>${esc(c)}</b>`)).join('');
}
/** Bandeau d'une partie qui ne compte pas au classement (sans compte, compte récent, appareil déjà joué par un autre compte). */
function dlyNoteHtml(v) {
  if (!v.acct) return `<div class="dly-note"><p>${T('Sans compte, ta partie n\'est pas classée.')}</p><button class="btn ghost small" type="button" data-dly="login">${T('Se connecter')}</button></div>`;
  if (v.why === 'device') return `<div class="dly-note"><p>${esc(T('Partie d\'entraînement, non classée : cet appareil a déjà joué la carte du jour avec un autre compte.'))}</p></div>`;
  if (v.why === 'age') return `<div class="dly-note"><p>${esc(T('Classement ouvert aux comptes de plus de {n} jours, connectés avec Google ou une adresse vérifiée. Ta partie compte pour tes badges.', { n: v.minAge || 7 }))}</p></div>`;
  return '';
}
const dlySubOf = v => (!v.acct ? T('Partie pour le plaisir') : v.why === 'device' ? T('Partie d\'entraînement') : v.why ? T('Partie non classée') : T('Partie classée'));
function dlyPaintPlay() {
  const el = DY.el, v = DY.v; if (!el || !v) return;
  $('.dly-sub', el).textContent = dlySubOf(v);
  const dots = Array.from({ length: v.steps }, (_, i) => `<i${i < v.step ? ' class="on"' : ''}></i>`).join('');
  const wr = v.wrong.map(w => `<li><span aria-hidden="true">✗</span> ${esc(w.p || w.n)}</li>`).join('');
  $('.dly-main', el).innerHTML = `${dlyNoteHtml(v)}
    <div class="dly-chrono"><div class="dly-ct"><span class="dly-stp">${T('Étape {s} sur {n}', { s: v.step, n: v.steps })}</span><span class="dly-time" role="timer"></span><span class="dly-pts"></span></div>
      <div class="dly-bar" aria-hidden="true"><i></i></div><div class="dly-steps" aria-hidden="true">${dots}</div></div>
    <figure class="dly-art${v.step <= 4 ? ' dly-px' : ''}${DY.seen.has(v.imgs.art) ? ' ok' : ''}"><img alt="${esc(v.step <= 4 ? T('Illustration de la carte, pixellisée') : T('Illustration de la carte'))}" decoding="async" src="${esc(v.imgs.art)}"></figure>
    ${v.imgs.type ? `<figure class="dly-strip dly-type${DY.seen.has(v.imgs.type) ? ' ok' : ''}"><img alt="${esc(T('Ligne de type de la carte'))}" decoding="async" src="${esc(v.imgs.type)}"></figure>` : ''}
    ${v.imgs.text ? `<figure class="dly-strip dly-text${DY.seen.has(v.imgs.text) ? ' ok' : ''}"><img alt="${esc(T('Texte de la carte'))}" decoding="async" src="${esc(v.imgs.text)}"></figure>` : ''}
    ${v.mask ? `<p class="dly-mask" role="img" aria-label="${esc(T('Nom de la carte, lettres de la fin : {m}', { m: v.mask.replace(/_/g, '•') }))}">${dlyMaskHtml(v.mask)}</p>` : ''}
    <button class="btn ghost block dly-next" type="button" data-dly="next"${v.step >= v.steps ? ' disabled' : ''}>${v.step >= v.steps ? T('Plus d\'indice') : `${T('Indice suivant')} <small class="dly-in"></small>`}</button>
    ${wr ? `<div class="dly-wrong"><p>${TN(v.wrong.length, '{n} mauvaise proposition', '{n} mauvaises propositions')}</p><ul>${wr}</ul></div>` : ''}
    <button class="link-btn dly-quit" type="button" data-dly="quit">${T('Abandonner la partie')}</button>`;
  const foot = $('.dly-foot', el);
  if (!$('.dly-q', foot)) {
    foot.innerHTML = `<ul class="dly-sug" id="dlySug" role="listbox" aria-label="${T('Cartes qui commencent ainsi')}" hidden></ul>
      <div class="dly-qw"><svg class="i" aria-hidden="true"><use href="#i-search"/></svg><input class="dly-q" type="search" enterkeyhint="go" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="${T('Nom de la carte…')}" aria-label="${T('Nom de la carte')}" aria-controls="dlySug" aria-autocomplete="list"><span class="dly-left"></span></div>
      <p class="dly-hint" hidden></p>`;
  }
  foot.hidden = false;
  $('.dly-left', foot).textContent = TN(v.left, '{n} essai', '{n} essais');
  dlySearch($('.dly-q', foot).value); dlyTick();
}
/** Chrono (4 fois par seconde) : temps, points du moment, barre de l'étape ; nouvelle étape à l'horloge → la vue est relue au serveur (image, nom). */
function dlyTick() {
  const el = DY.el; if (!el) return;
  if (DY.mode === 'play' && DY.v && !DY.v.res) {
    const v = DY.v, c = dlyClock(v), ms = v.stepMs || 12000, st = Math.min(v.steps, Math.floor(c / ms) + 1);
    const t = $('.dly-time', el), p = $('.dly-pts', el), bar = $('.dly-bar i', el), nx = $('.dly-in', el);
    if (t) t.textContent = dlyMmss(c);
    if (p) p.textContent = T('≈ {n} points', { n: nf0(dlyPts(c)) });
    if (bar) bar.style.width = (st >= v.steps ? Math.min(100, (c - (v.steps - 1) * ms) / ms * 100) : (c % ms) / ms * 100).toFixed(1) + '%';
    if (nx) nx.textContent = st < v.steps ? T('dans {n} s', { n: Math.max(1, Math.ceil((st * ms - c) / 1000)) }) : '';
    if (st > v.step && !DY.busy && !DY.refT) DY.refT = setTimeout(dlyRefresh, 80);
  }
  const box = $('.dly-cd', el), s0 = DY.st; if (!box || !s0 || !s0.next) return;
  const left = s0.next - dlyNow();
  if (left <= 0) { if (!box.dataset.new) { box.dataset.new = '1'; box.innerHTML = `${T('Nouvelle carte disponible')} <button class="link-btn" type="button" data-dly="again">${T('Jouer')}</button>`; } return; }
  const s = Math.floor(left / 1000);
  box.textContent = T('Prochaine carte dans {t}', { t: `${String(Math.floor(s / 3600)).padStart(2, '0')}:${String(Math.floor(s / 60) % 60).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}` });
}
/** Vue de la partie relue au serveur (nouvelle étape) ; le serveur reste maître : en avance d'un instant, on relit un peu plus tard. */
async function dlyRefresh() {
  clearTimeout(DY.refT); DY.refT = 0;
  const v = DY.v, el = DY.el; if (!el || !v || v.res || DY.busy) return;
  try {
    const nv = await dlyCall('/play?k=' + encodeURIComponent(v.k));
    if (DY.el !== el) return;
    const want = Math.min(nv.steps, Math.floor(dlyClock(nv) / (nv.stepMs || 12000)) + 1);
    dlyApply(nv);
    if (!nv.res && nv.step < want) DY.refT = setTimeout(dlyRefresh, 400);
  } catch (e) { if (e.code === 'over') return dlyOver(e); if (DY.el === el) DY.refT = setTimeout(dlyRefresh, 2000); }
}

/* ── Recherche des noms : la langue du joueur seulement (et l'anglais quand l'image est anglaise) ───────────────────────── */
/** Index { ks (clé sans accent), ns (nom imprimé), es (nom anglais) } des noms de la langue l : catalogue de l'appli (names-<langue>.tsv, fr-names.tsv, gardés sur
 *  l'appareil), noms anglais de Scryfall pour l'anglais. null : catalogue introuvable (hors ligne au premier essai) → les noms anglais à la place. */
function dlyNamesLoad(l) {
  if (DY.namesL === l && (DY.names || DY.namesP)) return DY.namesP || Promise.resolve(DY.names);
  DY.namesL = l; DY.names = null;
  const p = DY.namesP = (async () => {
    if (l === 'en') { const c = await collCatalog(); return { ks: c.norm, ns: c.list, es: c.list }; }
    if (typeof FRX !== 'undefined' && FRX.ix && FRX.l === l) { const L = FRX.ix.list; return { ks: L.map(x => x.k), ns: L.map(x => x.n), es: L.map(x => x.en) }; }      // déjà chargé par l'appli
    const rec = (await scryFrCached(l).catch(() => null)) || (await scryFrStatic(undefined, l).catch(() => null));
    if (!rec) return null;
    const ks = [], ns = [], es = [], seen = new Set();
    for (let i = 0; i < rec.rows.length; i += 4000) {
      for (const r of rec.rows.slice(i, i + 4000)) { const t = String(r).split('\t'), pn = frFront(t[0] || ''), e = t[1]; if (!pn || !e) continue; const k = normPart(pn), u = k + '\t' + e; if (!k || seen.has(u)) continue; seen.add(u); ks.push(k); ns.push(pn); es.push(e); }
      await new Promise(r => setTimeout(r, 0));      // l'écran respire
    }
    return { ks, ns, es };
  })().catch(() => null).then(x => { if (DY.namesP === p) { DY.names = x; DY.namesP = null; if (!x && l !== 'en') dlyNamesEn(); if (DY.el && DY.mode === 'play') dlySearch(($('.dly-q', DY.el) || {}).value || ''); } return x; });
  return p;
}
/** Noms anglais : repli (catalogue de la langue indisponible) ou image anglaise (carte jamais imprimée dans la langue du joueur). */
function dlyNamesEn() {
  if (DY.en || DY.enP) return DY.enP || Promise.resolve(DY.en);
  DY.enP = collCatalog().then(c => (DY.en = { ks: c.norm, ns: c.list, es: c.list })).catch(() => null).finally(() => { DY.enP = null; if (DY.el && DY.mode === 'play') dlySearch(($('.dly-q', DY.el) || {}).value || ''); });
  return DY.enP;
}
/** Cartes dont le nom commence par le texte tapé (sans casse ni accent) : le nom exact d'abord, puis l'ordre alphabétique ; une fois par carte, sans les propositions déjà faites. */
function dlySug(text) {
  const q = normPart(text), v = DY.v; if (q.length < 2 || !v) return [];
  const out = [], seen = new Set(v.wrong.map(w => dlyKey(w.n)));
  const scan = (ix, en) => { for (let i = 0; i < ix.ks.length && out.length < 300; i++) { const k = ix.ks[i]; if (!k || !k.startsWith(q)) continue; const e = ix.es[i], ek = dlyKey(e); if (!ek || seen.has(ek)) continue; seen.add(ek); out.push({ n: ix.ns[i], en: e, k, x: en }); } };
  const mine = DY.names && DY.namesL === dlyLang() ? DY.names : null;
  if (mine) scan(mine, '');
  if ((v.fb || (!mine && !DY.namesP)) && DY.en && dlyLang() !== 'en') scan(DY.en, 'en');
  out.sort((a, b) => (b.k === q) - (a.k === q) || (a.x === 'en') - (b.x === 'en') || NAME_CMP(a.n, b.n));
  return out.slice(0, DY_SUG);
}
function dlySearch(text) {
  const el = DY.el; if (!el || DY.mode !== 'play') return;
  const ul = $('.dly-sug', el), hint = $('.dly-hint', el), q = normPart(text); if (!ul) return;
  const loading = !!DY.namesP || (!DY.names && !!DY.enP);
  DY.hits = dlySug(text); DY.sel = DY.hits.length ? Math.min(Math.max(DY.sel, 0), DY.hits.length - 1) : -1;
  const fbHint = DY.v && DY.v.fb && dlyLang() !== 'en' ? T('Carte jamais imprimée dans ta langue : image et nom anglais, cherche aussi en anglais.') : !DY.names && !DY.namesP && dlyLang() !== 'en' ? T('Noms de ta langue indisponibles : noms anglais.') : '';
  hint.hidden = !fbHint; hint.textContent = fbHint;
  if (q.length < 2) { ul.hidden = true; ul.innerHTML = ''; return; }
  ul.hidden = false;
  ul.innerHTML = DY.hits.length ? DY.hits.map((x, i) => `<li role="option" aria-selected="${i === DY.sel}"><button type="button" class="dly-o" data-i="${i}" tabindex="-1">${esc(x.n)}${x.x === 'en' ? ' <small>EN</small>' : ''}</button></li>`).join('')
    : `<li class="dly-none">${loading ? T('Chargement des noms…') : T('Aucune carte ne commence ainsi.')}</li>`;
}
function dlyKeys(e) {
  if (!e.target.classList || !e.target.classList.contains('dly-q')) return;
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { if (!DY.hits.length) return; e.preventDefault(); DY.sel = (DY.sel + (e.key === 'ArrowDown' ? 1 : -1) + DY.hits.length) % DY.hits.length; dlySearch(e.target.value); }
  else if (e.key === 'Enter') { e.preventDefault(); const x = DY.hits[Math.max(0, DY.sel)]; if (x) dlyGuess(x); }
}

/* ── Actions ──────────────────────────────────────────────────────────────────────────────────────────────────────────── */
function dlyClick(e) {
  const b = e.target.closest('button'); if (!b || !DY.el) return;
  const a = b.dataset.dly;
  if (a === 'close') return DY.el.__close();
  if (a === 'retry' || a === 'again') { DY.st = null; haptic('tap'); $('.dly-main', DY.el).innerHTML = `<p class="dly-wait"><span class="dly-spin" aria-hidden="true"></span>${T('Chargement de la carte du jour…')}</p>`; $('.dly-foot', DY.el).hidden = true; DY.el.classList.add('dly-play'); return dlyStart(true); }
  if (a === 'login') { haptic('tap'); DY.el.__close(); return openAccount(); }
  if (a === 'play') { haptic('tap'); DY.el.__close(); return dlyTap(); }
  if (a === 'next') return dlyNext();
  if (a === 'quit') return dlyQuit(b);
  if (a === 'share') return dlyShare();
  if (a === 'card' && DY.v && DY.v.res && DY.v.res.card) return openCardViewer([{ key: ownKey(DY.v.res.card.en), name: DY.v.res.card.en, small: DY.v.res.card.img }], 0);
  if (b.classList.contains('dly-o')) { const x = DY.hits[Number(b.dataset.i)]; if (x) dlyGuess(x); }
}
/** « Indice suivant » : l'horloge du serveur saute au début de l'étape suivante (aucun avantage : le score suit l'horloge). */
async function dlyNext() {
  if (DY.busy || !DY.v || DY.v.step >= DY.v.steps) return;
  DY.busy = true; haptic('tap'); const btn = $('.dly-next', DY.el); if (btn) btn.disabled = true;
  try {
    const v = await dlyCall('/next', { method: 'POST', body: { k: DY.v.k } });
    const src = v.step <= 5 ? v.imgs.art : v.step === 6 ? v.imgs.type : v.step === 7 ? v.imgs.text : '';
    if (src) await new Promise(r => { const im = new Image(); im.onload = im.onerror = r; im.src = src; setTimeout(r, 4000); });      // nouvelle image prête avant d'être montrée (pas de trou à l'écran)
    dlyApply(v);
  } catch (e) { if (e.code === 'over') return dlyOver(e); if (e.code !== 'max') toast(dlyErrText(e)); if (btn) btn.disabled = false; }
  finally { DY.busy = false; }
}
async function dlyGuess(x) {
  if (DY.busy || !DY.v) return;
  DY.busy = true; const q = $('.dly-q', DY.el); if (q) q.disabled = true;
  try {
    const v = await dlyCall('/guess', { method: 'POST', body: { k: DY.v.k, n: x.en, p: x.n } });
    if (q) { q.value = ''; q.disabled = false; }
    DY.sel = -1;
    if (v.res) { haptic(v.res.win ? 'ok' : 'bad'); DY.badgesAt = 0; }
    else if (!v.ok) { haptic('warn'); toast(v.dup ? T('Déjà proposée') : T('Non, ce n\'est pas {n} : +10 s', { n: x.n })); }
    dlyApply(v);
    if (!v.res && q) { q.classList.remove('dly-shake'); void q.offsetWidth; q.classList.add('dly-shake'); }
  } catch (e) { if (q) q.disabled = false; if (e.code === 'over') return dlyOver(e); toast(dlyErrText(e)); }
  finally { DY.busy = false; }
}
/** Abandon : deux appuis (le premier demande confirmation) ; perdue, sans la réponse avant la carte suivante. */
async function dlyQuit(b) {
  if (!DY.v || DY.busy) return;
  if (Date.now() - DY.quit > 4000) { DY.quit = Date.now(); b.textContent = T('Touche encore pour abandonner'); b.classList.add('arm'); haptic('warn'); return; }
  DY.busy = true;
  try { const v = await dlyCall('/giveup', { method: 'POST', body: { k: DY.v.k } }); DY.badgesAt = 0; dlyApply(v); }
  catch (e) { if (e.code === 'over') return dlyOver(e); toast(dlyErrText(e)); }
  finally { DY.busy = false; }
}
/** La carte a changé pendant la partie (18:00 passé) : la réponse d'hier (publique désormais), puis la nouvelle carte. */
function dlyOver(e) {
  const c = e && e.j && e.j.card; DY.mode = 'err'; $('.dly-foot', DY.el).hidden = true;
  $('.dly-main', DY.el).innerHTML = `<div class="dly-msg"><p>${esc(dlyErrText(e))}</p>${c ? `<p>${esc(T('C\'était : {n}', { n: c.name }))}</p>` : ''}<button class="btn small" type="button" data-dly="again">${T('Nouvelle carte')}</button></div>`;
}

/* ── Fin : la carte, le score, la place, le partage ; classements jour · semaine · saison · niveaux ───────────────────── */
const dlyHour = t => new Intl.DateTimeFormat(LOC(), { hour: '2-digit', minute: '2-digit' }).format(new Date(t));
function dlyEnd() {
  const el = DY.el, v = DY.v, r = v.res, c = r.card; if (!el) return;
  DY.mode = 'end'; el.classList.remove('dly-play'); $('.dly-foot', el).hidden = true; const tt = document.getElementById('toast'); if (tt) tt.classList.remove('on');      // « Non, ce n'est pas … » ne reste pas sur le résultat
  if (DY.bp === 'level') DY.bp = 'day';      // résultat : le classement du jour d'abord
  $('.dly-sub', el).textContent = T('Carte mystère n° {no}', { no: v.no });
  const place = v.ranked && r.r ? T('Place {r} sur {n}', { r: nf0(r.r), n: nf0(r.total) }) : v.why === 'device' ? T('Partie d\'entraînement') : T('Partie non classée');
  $('.dly-main', el).innerHTML = `<section class="dly-res" data-win="${r.win ? 1 : 0}">
      ${c ? `<button class="dly-card" type="button" data-dly="card" aria-label="${esc(T('{n} en grand', { n: c.name }))}"><img alt="${esc(c.name)}" decoding="async" src="${esc(c.img)}"></button>` : `<div class="dly-card dly-hidden" aria-hidden="true"><span>?</span></div>`}
      <div class="dly-rt">
        <p class="dly-verdict">${r.win ? esc(T('Trouvée à l\'étape {s} !', { s: r.step })) : esc(T('Pas trouvée cette fois.'))}</p>
        ${c ? `<h2 class="dly-name">${esc(c.name)}</h2>${c.name !== c.en ? `<p class="dly-en">${esc(c.en)}</p>` : ''}` : `<p class="dly-reveal">${esc(T('Réponse à {h}, avec la carte suivante.', { h: dlyHour(r.reveal || v.next) }))}</p>`}
        <p class="dly-score"><b>${nf0(r.s)}</b> ${esc(TN(r.s, 'point', 'points'))}</p>
        <p class="dly-place">${esc(place)}</p>
        <p class="dly-detail">${esc([TN(r.wrong, '{n} erreur', '{n} erreurs'), dlyTime(r.ms)].join(' · '))}</p>
        <div class="dly-acts"><button class="btn small" type="button" data-dly="share"><svg class="i" aria-hidden="true"><use href="#i-share"/></svg><span>${T('Partager')}</span></button>${!v.acct ? `<button class="btn ghost small" type="button" data-dly="login">${T('Se connecter')}</button>` : ''}</div>
      </div></section>
    ${v.why === 'age' ? dlyNoteHtml(v) : !v.acct ? `<p class="hint dly-pitch">${T('Connecte-toi pour être classé demain : jour, semaine et saison.')}</p>` : v.ranked && !String(PROF.name || '').trim() ? `<p class="hint dly-pitch">${T('Ton pseudo du classement : Compte et réglages › Modifier le profil.')}</p>` : ''}
    ${DY.st && DY.st.prev ? `<p class="hint dly-prev">${esc(T('Carte d\'hier : {n}', { n: DY.st.prev.name }))}</p>` : ''}
    ${dlyBoardsHtml()}
    <p class="dly-cd"></p>`;
  dlyBoardsMount(); dlyTick(); dlyPaintBtn();
  if (typeof adsRefresh === 'function') adsRefresh();      // le bandeau peut revenir : résultat et classements
}
/** Écran des classements seul (podium de la barre du haut). */
async function dlyBoardsOnly() {
  const el = DY.el; if (!el) return;
  DY.mode = 'boards'; el.classList.remove('dly-play');
  const st = await dlyStatus(true); if (DY.el !== el) return;
  const can = st && st.st === 'ready' && !dlyDone();
  $('.dly-sub', el).textContent = st ? T('Carte mystère n° {no}', { no: st.no }) : '';
  $('.dly-main', el).innerHTML = `${can ? `<button class="btn block dly-play-cta" type="button" data-dly="play">${DY_ICON}<span>${T('Jouer la carte du jour')}</span></button>` : ''}
    ${!D.user ? `<p class="hint dly-pitch">${T('Connecte-toi pour apparaître au classement.')}</p>` : ''}
    ${st && st.prev ? `<p class="hint dly-prev">${esc(T('Carte d\'hier : {n}', { n: st.prev.name }))}</p>` : ''}
    ${dlyBoardsHtml()}<p class="dly-cd"></p>`;
  dlyBoardsMount(); dlyTick();
  if (typeof adsRefresh === 'function') adsRefresh();
}
const dlyBoardsHtml = () => `<section class="dly-boards" aria-label="${T('Classements')}"><div class="seg" id="dlySeg" role="radiogroup" aria-label="${T('Période')}"></div><div class="dly-bd"></div></section>`;
function dlyBoardsMount() {
  const el = DY.el, seg = el && $('#dlySeg', el); if (!seg) return;
  mountSeg(seg, [{ v: 'day', label: T('Jour') }, { v: 'week', label: T('Semaine') }, { v: 'season', label: T('Saison') }, { v: 'level', label: T('Niveaux') }], DY.bp, p => dlyBoard(p));
  dlyBoard(DY.bp);
}
const dlyTime = ms => T('Temps {t}', { t: dlyMmss(ms || 0) });      // « Temps 1:05 »
async function dlyBoard(p) {
  const el = DY.el; if (!el) return;
  DY.bp = p; const box = $('.dly-bd', el); if (!box) return;
  if (!DY.boards[p]) box.innerHTML = `<p class="dly-wait"><span class="dly-spin" aria-hidden="true"></span>${T('Chargement du classement…')}</p>`; else dlyBoardPaint(box, DY.boards[p]);
  try {
    if (p === 'level') await dlyLevelPush();      // ma dernière XP d'abord (le serveur la plafonne)
    const j = p === 'level' ? await dlyCall('/board', { base: 'api/level' }) : await dlyCall('/board?p=' + p);
    DY.boards[p] = j; if (DY.el === el && DY.bp === p) dlyBoardPaint(box, j);
  } catch (e) { if (DY.el === el && DY.bp === p && !DY.boards[p]) box.innerHTML = `<p class="dly-msg">${esc(dlyErrText(e))}</p>`; }
}
function dlyBoardPaint(box, j) {
  const fmt = new Intl.DateTimeFormat(LOC(), { day: 'numeric', month: 'short' }), lv = j.p === 'level';
  const when = lv ? T('Niveaux') : j.p === 'day' ? T('Aujourd\'hui') : j.p === 'week' ? T('Semaine du {d}', { d: fmt.format(new Date(j.from)) }) : T('Saison de {m}', { m: new Intl.DateTimeFormat(LOC(), { month: 'long', year: 'numeric' }).format(new Date(j.from + 86400e3)) });
  const row = x => `<li class="dly-row${x.me ? ' me' : ''}"><span class="dly-r">${nf0(x.r)}</span><span class="dly-n">${x.x ? `<em>${T('Pseudo masqué')}</em>` : esc(x.n)}${x.me ? ` <small>${T('toi')}</small>` : ''}</span>`
    + (lv ? `<span class="dly-d">${esc(T('Niv. {n}', { n: x.lv }))}</span><b class="dly-s">${esc(T('{n} XP', { n: nf0(x.xp) }))}</b>` : `${x.d ? `<span class="dly-d">${esc(TN(x.d, '{n} jour', '{n} jours'))}</span>` : ''}<b class="dly-s">${nf0(x.s)}</b>`) + '</li>';
  const meOut = j.me && j.me.r > j.rows.length;
  box.innerHTML = `<p class="dly-when"><b>${esc(when)}</b> · ${esc(TN(j.total, '{n} joueur', '{n} joueurs'))}${lv ? '' : ' · ' + esc(T('jusqu\'au {d}', { d: fmt.format(new Date(j.to - 1000)) }))}</p>
    ${j.rows.length ? `<ol class="dly-rows">${j.rows.map(row).join('')}</ol>${meOut ? `<ol class="dly-rows dly-meout">${row(j.me)}</ol>` : ''}` : `<p class="dly-empty">${lv ? T('Personne au classement des niveaux pour l\'instant.') : T('Personne n\'a encore trouvé : sois le premier !')}</p>`}
    <p class="hint">${lv ? T('XP de « Niveau et badges », plafonnée chaque jour par le serveur.') : j.p === 'day' ? T('Top 100 du jour : un badge exclusif, compté à la fin de la journée.') : ''}</p>`;
}
/** Résultat à partager façon Wordle : étapes et erreurs en emojis, le temps, jamais la réponse. */
function dlyShareText(v) {
  const r = v.res, sq = Array.from({ length: v.steps }, (_, i) => (i + 1 < r.step ? '🟨' : i + 1 === r.step ? (r.win ? '🟩' : '🟥') : '⬜')).join('');
  return [T('Carte mystère n° {no} · Mana Orbit', { no: v.no }), sq + (r.wrong ? ' ' + '❌'.repeat(r.wrong) : ''),
    r.win ? T('{s} points, trouvée en {t}', { s: nf0(r.s), t: dlyMmss(r.ms) }) : T('Pas trouvée cette fois'), ...(v.ranked && r.r ? [T('Place {r} sur {n}', { r: nf0(r.r), n: nf0(r.total) })] : [])].join('\n');
}
function dlyLink() { try { if (/^https?:$/.test(location.protocol)) return location.origin + location.pathname + '?mystere'; } catch (e) { /* ignore */ } return 'https://manaorbit.app/?mystere'; }
async function dlyShare() {
  if (!DY.v || !DY.v.res) return; haptic('tap');
  const text = dlyShareText(DY.v), url = dlyLink();
  if ((typeof natShare === 'function' && natShare()) || navigator.share) return shareOut({ title: T('Carte mystère'), text, url });
  copyText(text + '\n' + url);      // ordinateur : le texte entier (shareOut ne copierait que le lien)
}

/* ── Classement des niveaux : l'XP du compte (progress.js › prgNow) part au serveur, qui la plafonne par jour ───────────── */
/** Au lancement et quand l'XP change (progress.js › prgChanged) : une fois toutes les 10 minutes au plus ; force : tout de suite. */
function dlyLevelSoon(force) {
  if (!dlyOn() || !D.user || typeof prgNow !== 'function' || (DY.lvT && !force)) return;      // déjà prévu : l'envoi part à son heure (pas repoussé à chaque compteur qui bouge)
  clearTimeout(DY.lvT);
  DY.lvT = setTimeout(() => { DY.lvT = 0; dlyLevelPush(); }, force ? 1500 : Math.max(3000, DY.lvAt + 600e3 - Date.now()));
}
async function dlyLevelPush() {
  if (!dlyOn() || !D.user || typeof prgNow !== 'function') return null;
  let xp; try { xp = prgNow().xp; } catch (e) { return null; }
  const uid = D.user.uid; if (xp === DY.lvXp && DY.lvUid === uid && Date.now() - DY.lvAt < 600e3) return null;
  try { const j = await dlyCall('', { method: 'POST', base: 'api/level', body: { xp, n: String(PROF.name || '').trim().slice(0, 24) } }); DY.lvXp = xp; DY.lvAt = Date.now(); DY.lvUid = uid; return j; } catch (e) { return null; }
}

/** Badges de la Carte mystère, vérifiés par le serveur (GET /api/daily/badges), pour le module niveau et badges : promesse → [{ id, n, at }] (at : dernière fois, ms ; 0 : jamais).
 *  Identifiants stables : played (parties jouées), streak (meilleure série de jours d'affilée ; cur : la série en cours), top100 (fois dans le top 100 du jour), podium (fois
 *  dans les 3 premiers), first (fois 1er du jour), stage1 (trouvée à l'étape 1), points (total des points). Sans compte, hors ligne, jeu coupé ou hors du lien d'essai : [].
 *  Gardés 10 minutes (relus après une partie classée). */
async function dailyBadges() {
  if (!dlyOn() || !D.user) return [];
  const uid = D.user.uid;
  if (DY.badges && DY.badgesUid === uid && Date.now() - DY.badgesAt < 600e3) return DY.badges;
  try {
    const j = await dlyCall('/badges');
    const l = (Array.isArray(j.badges) ? j.badges : []).filter(b => b && typeof b.id === 'string').map(b => ({ id: b.id, n: Math.max(0, Math.floor(Number(b.n) || 0)), at: Number(b.at) || 0, ...(b.cur != null ? { cur: Math.max(0, Number(b.cur) || 0) } : {}) }));
    if (D.user && D.user.uid === uid) { DY.badges = l; DY.badgesAt = Date.now(); DY.badgesUid = uid; }
    return l;
  } catch (e) { return DY.badges && DY.badgesUid === uid ? DY.badges : []; }
}
