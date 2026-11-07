/* ── errlog.js : erreurs JavaScript des appareils, remontées anonymement vers /admin › Serveur › « Erreurs JS » (serveur : proxy.mjs › /api/errlog) ─────────
   Les écouteurs error / unhandledrejection de help.js appellent errlogPush. Rapport minimal : m message (300 caractères ; textes entre guillemets, « » et “ ”
   remplacés par « … » : ni nom de carte ni texte tapé), at « fichier:ligne:colonne » (nom de fichier seul, sans origine ni query string), st pile courte
   (8 lignes, 1 200 caractères, chemins réduits au nom de fichier), b version de l'appli (DD_BUILD), v écran (S.view, puis ce qui est ouvert par-dessus : classe de
   la feuille du dessus, scan, carte en grand…), l langue de l'appli, p plateforme (android, pwa, web), k type (error, rejection), t date. Jamais la collection,
   les decks, l'e-mail, l'UID, le jeton ni l'adresse complète de la page.
   Bornes : un rapport par message + emplacement et par session, 10 par session, 30 par jour sur l'appareil (ERL_KEY). Envoi groupé hors du chemin critique :
   5 s après la première erreur (fetch keepalive), ou à la mise en arrière-plan (navigator.sendBeacon) ; hors ligne : perdus (aucune file gardée).
   Rien n'est envoyé : en mode démo ou sans le serveur (/__ping errlog), sous Playwright (navigator.webdriver ; un test le permet par window.__errlogTest),
   ni si Réglages › Confidentialité › « Envoyer les rapports d'erreur anonymes » est coupé (S.errRep, gardé avec les autres réglages : saveStore). */
const ERL_KEY = 'deckdeal:errlog', ERL_SESSION = 10, ERL_DAY = 30, ERL_BODY = 7600;
/** q : rapports en attente · seen : signatures déjà vues dans la session · n : rapports acceptés dans la session · t : minuterie de l'envoi · tries : relances en attendant le serveur. */
const ERL = { q: [], seen: new Set(), n: 0, t: 0, tries: 0, wait: 5000, inside: false };
/** Peut-on garder un rapport ? (réglage, robot de test) — le serveur et le mode démo sont vus à l'envoi : une erreur du démarrage arrive avant /__ping. */
const erlAllowed = () => S.errRep !== false && !(typeof navigator !== 'undefined' && navigator.webdriver && !(typeof window !== 'undefined' && window.__errlogTest));
/** Adresse web (avec ou sans « :ligne:colonne ») → nom du fichier seul : « https://manaorbit.app/x/app.js?v=2:10:5 » → « app.js:10:5 » ; la page elle-même → « page ». */
function erlFile(u) {
  const s = String(u || ''), pos = /(:\d+){1,2}$/.exec(s), base = (pos ? s.slice(0, pos.index) : s).replace(/^[a-z][a-z0-9+.-]*:\/\/[^/]*/i, '').replace(/[?#].*$/, '');
  return (base.split('/').filter(Boolean).pop() || 'page') + (pos ? pos[0] : '');
}
/** Texte d'une erreur sans rien de personnel : adresses réduites au nom du fichier, e-mails et longues chaînes (jetons) masqués, textes cités remplacés par « … »
 *  (un nom de propriété entre apostrophes reste : « reading 'name' »). */
function erlScrub(s) {
  return String(s || '').replace(/\b[a-z][a-z0-9+.-]*:\/\/[^\s()'"<>]+/gi, erlFile).replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, '[e-mail]')
    .replace(/"[^"\n]*"/g, '"…"').replace(/«[^»\n]*»/g, '«…»').replace(/“[^”\n]*”/g, '“…”').replace(/'([^'\n]*)'/g, (a, x) => (/^[\w$.-]{1,40}$/.test(x) ? a : '\'…\''))
    .replace(/[A-Za-z0-9_-]{32,}/g, '…');
}
/** Écran : S.view, puis ce qui est ouvert par-dessus (feuille du dessus : sa classe, jamais son titre ; scan ; carte en grand ; premier lancement ; viewer). */
function erlScreen() {
  let top = '';
  try {
    const sh = typeof sheets !== 'undefined' && sheets.length ? sheets[sheets.length - 1] : null;
    if (sh && sh.wrap) top = [...sh.wrap.classList].find(c => c !== 'sheet-wrap' && c !== 'open') || 'sheet';
    else if (typeof SC !== 'undefined' && SC.el) top = 'scan';
    else if (typeof imgView !== 'undefined' && imgView) top = 'image';
    else if (typeof OB !== 'undefined' && OB.el) top = 'onboard';
    else if (document.querySelector('body > .dv.bd.on')) top = 'viewer';
  } catch (e) { top = ''; }
  return (String(S.view || '') + (top ? '>' + top : '')).replace(/[^a-z0-9>_-]/gi, '').slice(0, 40);
}
function erlPlat() {
  if (typeof isNativeApp === 'function' && isNativeApp()) return 'android';
  try { if (matchMedia('(display-mode: standalone)').matches) return 'pwa'; } catch (e) { /* ignore */ }
  return 'web';
}
/** Compteur du jour sur l'appareil : true si un rapport de plus est permis (et compté). Stockage indisponible : la borne de la session suffit. */
function erlDayTake() {
  const d = typeof dayIso === 'function' ? dayIso(Date.now()) : new Date().toISOString().slice(0, 10);
  let o = null; try { o = JSON.parse(localStorage.getItem(ERL_KEY) || 'null'); } catch (e) { o = null; }
  if (!o || o.d !== d) o = { d, n: 0 };
  if (o.n >= ERL_DAY) return false;
  o.n++; try { localStorage.setItem(ERL_KEY, JSON.stringify(o)); } catch (e) { /* stockage plein ou refusé : sans importance */ }
  return true;
}
/** Une erreur non rattrapée (ev : ErrorEvent ou PromiseRejectionEvent ; kind : 'error' | 'rejection') : rapport mis en attente si permis. Ne lève jamais. */
function errlogPush(ev, kind) {
  if (ERL.inside) return;
  ERL.inside = true;
  try {
    if (!erlAllowed() || ERL.n >= ERL_SESSION) return;
    let m = '', st = '', at = '';
    if (kind === 'rejection') {
      const r = ev && ev.reason;
      m = r && typeof r === 'object' && r.message != null ? String(r.message) : typeof r === 'string' ? r : r && r.name ? String(r.name) : String(r);
      if (r && typeof r === 'object' && r.name && r.name !== 'Error' && !m.startsWith(r.name)) m = r.name + ': ' + m;
      st = r && typeof r === 'object' && r.stack ? String(r.stack) : '';
    } else {
      const e = ev && ev.error;
      m = String((ev && ev.message) || (e && e.message) || '').replace(/^Uncaught\s+/, '');
      st = e && typeof e === 'object' && e.stack ? String(e.stack) : '';
      if (ev && ev.filename) at = erlFile(ev.filename).replace(/(:\d+){1,2}$/, '') + (ev.lineno ? ':' + ev.lineno + (ev.colno ? ':' + ev.colno : '') : '');
    }
    m = erlScrub(m).replace(/\s+/g, ' ').trim().slice(0, 300);
    if (!m || (m === 'Script error.' && !at) || /^ResizeObserver loop/.test(m)) return;      // erreur d'un autre site (rien de lisible) ; boucle de ResizeObserver (bénigne)
    st = erlScrub(st).split('\n').map(x => x.replace(/\s+/g, ' ').trim()).filter(Boolean).slice(0, 8).join('\n').slice(0, 1200);
    if (!at) { const f = /([\w.$~-]+:\d+:\d+)/.exec(st.split('\n').slice(1).join('\n')); if (f) at = f[1]; }      // promesse rejetée : la première ligne de la pile
    const sig = m + '|' + at;
    if (ERL.seen.has(sig)) return;
    ERL.seen.add(sig);
    if (!erlDayTake()) return;
    ERL.n++;
    ERL.q.push({ m, at, st, b: typeof DD_BUILD === 'string' ? DD_BUILD : '', v: erlScreen(), l: typeof I18N !== 'undefined' ? I18N.lang : '', p: erlPlat(), k: kind === 'rejection' ? 'rejection' : 'error', t: Date.now() });
    if (!ERL.t) ERL.t = setTimeout(() => erlFlush(false), ERL.wait);
  } catch (e) { /* le rapport ne doit jamais casser l'appli */ } finally { ERL.inside = false; }
}
/** Rapports en paquets de moins de 8 Ko (borne du serveur). */
function erlChunks(q) {
  const out = []; let cur = [];
  for (const r of q) {
    const next = cur.concat([r]);
    if (cur.length && new Blob([JSON.stringify({ r: next })]).size > ERL_BODY) { out.push(cur); cur = [r]; } else cur = next;
  }
  if (cur.length) out.push(cur);
  return out;
}
/** Envoie ce qui attend (beacon : la page passe en arrière-plan). Serveur pas encore joint : nouvel essai plus tard (3 fois), sauf en arrière-plan ; hors ligne,
 *  serveur sans la fonction, mode démo ou réglage coupé : perdus. */
function erlFlush(beacon) {
  clearTimeout(ERL.t); ERL.t = 0;
  if (!ERL.q.length) return;
  if (!CTX.proxy && !beacon && ERL.tries < 3 && erlAllowed()) { ERL.tries++; ERL.t = setTimeout(() => erlFlush(false), ERL.wait * 2); return; }
  const q = ERL.q.splice(0);
  if (!erlAllowed() || !CTX.proxy || CTX.errlog !== true || S.demo || (typeof navigator !== 'undefined' && navigator.onLine === false)) return;
  for (const part of erlChunks(q)) {
    const body = JSON.stringify({ r: part });
    let sent = false;
    if (beacon && navigator.sendBeacon) { try { sent = navigator.sendBeacon('api/errlog', new Blob([body], { type: 'application/json' })); } catch (e) { sent = false; } }
    if (!sent) { try { fetch('api/errlog', { method: 'POST', keepalive: true, cache: 'no-store', headers: { 'Content-Type': 'application/json' }, body }).catch(() => {}); } catch (e) { /* refusé : perdu */ } }
  }
}
/** Réglage coupé : ce qui attend est oublié. */
function errlogSet(on) { S.errRep = !!on; saveStore(); if (!on) { ERL.q.length = 0; clearTimeout(ERL.t); ERL.t = 0; } haptic('ok'); }
if (typeof document !== 'undefined') document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden' && ERL.q.length) erlFlush(true); });
