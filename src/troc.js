/* ── troc.js : échange en direct, face à face (la « fenêtre d'échange » des RPG) ───────────────────────────────────────────────────
   · Deux joueurs connectés, chacun sur son téléphone, en même temps. Entrées : Échange › « Échange en direct » (share.js › trShareBoxHtml : créer, ou
     « J'ai un code »), page d'un ami › « Échange en direct » (friends.js : invitation, notification du compte par notifyUser), lien ./?troc=<code> (QR code
     de l'hôte scanné avec l'appareil photo, notification touchée : push.js › pushOpen, app.js › handleLaunch), invitation reçue appli ouverte (toast).
   · Écran à part (.dv) : « Tu reçois » (ce que l'autre donne) en haut, la balance au milieu (écart en € et en %, du vert au rouge), « Tu donnes » en bas ;
     vignettes (image, nom, × exemplaires, prix à l'unité) et total de chaque côté. Je choisis ce que je donne (ma liste d'échange, sinon toute ma collection),
     je demande des cartes de SA liste (elles arrivent de son côté, « Demandée » : il accepte ou retire). Tout changement retire « Prêt » aux deux ;
     les deux « Prêt » → récapitulatif ; les deux « Valider » → appliqué : chacun retire ce qu'il donne et ajoute ce qu'il reçoit (langue, édition et foil
     gardés), liste de souhaits allégée ; « Annuler l'échange » sur l'écran de fin (15 min) : proposé à l'autre, défait des DEUX côtés s'il accepte
     (op undo), sinon rien ne change ; « Mes échanges » (historique sur cet appareil, comme « Mes ouvertures »).
   · « Équilibrer » : propose des cartes peu chères (de ma liste, ou à lui demander) pour approcher 0 € d'écart ; rien ne part sans « Ajouter ».
   · Serveur : proxy.mjs › /api/troc (sessions en mémoire, une clé de siège par joueur) ; relevé toutes les 1,2 s écran visible, 5 s caché, 10 s après
     2 min ; version de la session (rien de neuf : réponse courte). Prix : ceux de la session (fichier de prix du serveur), les mêmes chez les deux.
   · Rien au démarrage, sauf : un lien ?troc= (handleLaunch) et une session en cours sur cet appareil (deckdeal:troc:cur, reprise : appli tuée pendant
     l'échange ; une session faite mais pas encore appliquée l'est au retour). Mode streamer (opening.js › streamOn) : pas d'échange en direct.
   Retirer la fonction : ôter 'troc.js' de build.mjs (crochets gardés par typeof dans share.js, friends.js, push.js, app.js, decks.js), css/troc.css, i18n/*.troc.json. */
const TRC_CUR = 'deckdeal:troc:cur', TRC_HIST = 'deckdeal:troc:hist', TRC_HIST_MAX = 50, TRC_CODE_RE = /^[A-HJKMNP-Z2-9]{6}$/, TRC_PAGE = 60;
const TRC = { s: null, c: '', key: '', uid: '', el: null, t: 0, fail: 0, hid: 0, q: Promise.resolve(), ot: null, pick: null, flash: new Set(), myCv: 0, want: '', hist: null, inv: null, bright: false, wl: null, sent: null, applying: false, vis: null, undo: null, unBy: '' };      // undo : échange fait sur cet appareil, encore annulable (trocApply) ; unBy : « me » quand je retire ma demande d'annulation
const TRC_SWAP = '<svg class="i" aria-hidden="true"><use href="#i-swap"/></svg>';
const TRC_EQ = '<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v15M8 19h8M5 7h14M5 7l-2.6 6.2a2.6 2.6 0 0 0 5.2 0zM19 7l-2.6 6.2a2.6 2.6 0 0 0 5.2 0z"/></svg>';
const TRC_OK = '<svg class="i" aria-hidden="true"><use href="#i-check"/></svg>';

/* ── Petits outils ───────────────────────────────────────────────────────────────────────────────────────────────────────── */
const trocOn = () => !!(CTX.proxy && CTX.troc);
const trocCodeOf = v => { const c = String(v || '').toUpperCase().replace(/[\s-]/g, ''); return TRC_CODE_RE.test(c) ? c : ''; };
const trocFmtCode = c => (c ? c.slice(0, 3) + ' ' + c.slice(3) : '');
const trocUrl = c => { try { return new URL('./?troc=' + c, location.href).href.replace(/#.*$/, ''); } catch (e) { return '?troc=' + c; } };
const trocNorm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const trocOpenSt = s => !!s && (s.st === 'wait' || s.st === 'live');
/** Échange fait et appliqué sur cet appareil, encore annulable des deux côtés (op undo, TROC_UNDO_MS du serveur) : la session est encore relevée. */
const trocUndoable = () => { const s = TRC.s, u = TRC.undo; return !!(s && u && s.st === 'done' && !s.ud && TRC.c === s.c && u.c === s.c && Date.now() < u.until); };
/** Typographie française (comme l'aide) : espace insécable avant « ; : ? ! » et après « « » ; sans effet en anglais. Texte et HTML sans attribut « a :b ». */
const trocNb = s => String(s).replace(/ ([;:!?»])/g, ' $1').replace(/« /g, '« ');
const trocWho = () => (TRC.s && TRC.s.ot && TRC.s.ot.n) || T('l\'autre joueur');
/** Image d'une carte de la session (forme courte, revérifiée) ; sinon Scryfall par le nom. */
const trocSrc = x => { const u = x.i ? SCRY_IMG + x.i : ''; return u && SHARE_IMG_RE.test(u) ? u : scImg(x.n); };
/** Nom affiché : l'imprimé de ma langue si l'exemplaire est dans cette langue (catalogue de l'appareil, sinon celui envoyé), sinon l'anglais. */
function trocName(x) {
  const k = ownKey(x.n), l = lineLang(x.g);
  return (l && frName(k, l)) || (x.f && l && l === (x.fl || 'fr') && l === FRX.l ? x.f : '') || x.n;
}
const trocPic = v => typeof v === 'string' && v.length <= 8000 && /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(v);
const trocAv = (x, cls = 'trc-av') => `<span class="${cls}" style="--h:${hash32(String(x && x.n) || '?') % 360}" aria-hidden="true">${esc((((x && x.n) || '?').trim()[0] || '?').toUpperCase())}${x && trocPic(x.p) ? `<img alt="" src="${esc(x.p)}">` : ''}</span>`;
/** Total d'un côté (cartes demandées pas encore acceptées : hors du compte) : n cartes, q exemplaires, v centimes, nv sans prix. */
function trocSum(list) { const t = { n: 0, q: 0, v: 0, nv: 0 }; for (const x of list || []) { if (x.r) continue; t.n++; t.q += x.q; if (x.u > 0) t.v += x.u * x.q; else t.nv++; } return t; }
/** Exemplaires d'une carte (clé) et d'une ligne déjà dans une liste de la session. */
const trocIn = (list, k, g) => (list || []).reduce((t, x) => t + (ownKey(x.n) === k && x.g === g ? x.q : 0), 0);
/** Ma liste d'échange pour la session : une entrée par ligne (langue|édition, '*' foil), nom imprimé, image, prix de l'appareil (celui de l'impression et de la finition :
 *  share.js › trLinePx ; le serveur pose le sien sur les lignes sans édition ni foil). */
function trocMyList() {
  const out = [];
  for (const x of trState().have) for (const [g, q] of x.lines) {
    out.push({ ...trocMine(x.k, x.n, g), q });
    if (out.length >= 3000) return out;
  }
  return out;
}
/** Une ligne de ma collection, prête pour la session (give) : sa clé sans emplacement ni détails (ils ne quittent pas l'appareil), foil et édition gardés. */
function trocMine(k, n, g) {
  g = lineHead(g);
  const l = lineLang(g), f = l ? frName(k, l) : '', i = imgShort(collLineImage(k, g, (COLL.meta[k] || {}).im).src), u = trLinePx(k, g);
  return { n, q: 1, g, ...(f ? { f, fl: FRX.l } : {}), ...(i ? { i } : {}), ...(u ? { u } : {}) };
}
/** Pastille foil (✦) d'une ligne de la session ('' sans foil). */
const trocFo = g => (lineFoil(g) ? `<i class="trc-fo" title="${T('Foil')}" aria-hidden="true">✦</i>` : '');
async function trocProf() { if (typeof amProf === 'function') { try { return await amProf(); } catch (e) { /* miniature illisible */ } } return { n: PROF.name || '', l: I18N.lang }; }

/* ── Serveur ─────────────────────────────────────────────────────────────────────────────────────────────────────────────── */
/** Appel de /api/troc : auth (création, entrée) avec le jeton Firebase, sinon la clé de siège. Erreur : { code, status, s (session à jour, si le serveur l'a jointe) }. */
async function trocCall(path, { method = 'GET', body, auth } = {}) {
  const go = async force => {
    const h = { Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}) };
    if (auth) { const u = D.user; if (!u) throw Object.assign(new Error('déconnecté'), { code: 'auth_required' }); try { h['x-firebase-token'] = await u.getIdToken(force); } catch (e) { throw Object.assign(new Error('jeton'), { code: 'net' }); } }
    else if (TRC.key) h['x-troc-key'] = TRC.key;
    let r;
    try { r = await fetch('api/troc' + path, { method, cache: 'no-store', headers: h, body: body ? JSON.stringify(body) : undefined }); }
    catch (e) { throw Object.assign(new Error('réseau'), { code: 'net' }); }
    const j = await r.json().catch(() => null);
    if (!r.ok) throw Object.assign(new Error((j && j.message) || 'HTTP ' + r.status), { code: (j && j.error) || 'http', status: r.status, s: j && j.s });
    return j || {};
  };
  try { return await go(false); } catch (e) { if (auth && e.code === 'token_expired') return go(true); throw e; }
}
function trocErr(code) {
  return code === 'net' ? T('Hors ligne : l\'échange en direct a besoin d\'internet')
    : code === 'not_found' ? T('Code inconnu, ou échange terminé.')
    : code === 'full' ? T('Cet échange a déjà deux joueurs.')
    : code === 'rate_limited' || code === 'too_many_attempts' ? T('Trop d\'essais : réessaie dans un moment.')
    : code === 'busy' ? T('Trop d\'échanges en cours : réessaie dans un moment.')
    : code === 'not_friend' ? T('Vous n\'êtes plus amis.')
    : code === 'stale' ? T('L\'échange vient de changer : vérifie-le avant de valider.')
    : code === 'pending' ? T('Réponds d\'abord à ses demandes.')
    : code === 'empty' ? T('Rien à échanger pour l\'instant.')
    : code === 'max' ? T('Pas plus d\'exemplaires.')
    : code === 'items' ? T('Trop de cartes de ce côté.')
    : code === 'not_listed' ? T('Cette carte n\'est plus dans sa liste.')
    : code === 'late' ? T('Trop tard : cet échange ne peut plus être annulé.')
    : code === 'closed' || code === 'gone' ? T('Échange terminé.')
    : code === 'troc_disabled' ? T('Échange en direct indisponible sur ce serveur.')
    : T('Échange injoignable : réessaie dans un moment.');
}
/** Action sur la session (une à la fois, dans l'ordre) ; la session à jour revient avec la réponse, ou avec le refus. */
function trocDo(o) {
  const run = TRC.q.then(async () => {
    if (!TRC.c) return null;
    try { const s = await trocCall('/op', { method: 'POST', body: { c: TRC.c, ...o } }); if (o.op !== 'ready' && o.op !== 'confirm' && o.op !== 'got') TRC.myCv = s.cv; trocTake(s); return s; }
    catch (e) {
      if (e.code === 'gone') { trocGone(); return null; }
      if (e.s) trocTake(e.s);
      if (o.op !== 'got') { toast(trocErr(e.code)); haptic('warn'); }
      return null;
    }
  });
  TRC.q = run.catch(() => null);
  return run;
}

/* ── Session : état local, relevé ──────────────────────────────────────────────────────────────────────────────────────────── */
function trocSaveCur() {
  try { if (TRC.c && TRC.key) localStorage.setItem(TRC_CUR, JSON.stringify({ c: TRC.c, k: TRC.key, u: D.uid || '', at: Date.now() })); else localStorage.removeItem(TRC_CUR); } catch (e) { /* stockage indisponible */ }
}
/** Plus de session sur cet appareil (fenêtre laissée ouverte : elle montre la fin). */
function trocReset() { clearTimeout(TRC.t); TRC.c = ''; TRC.key = ''; TRC.ot = null; TRC.sent = null; TRC.undo = null; trocSaveCur(); }
const trocGap = () => (TRC.fail ? Math.min(10000, 1500 * TRC.fail) : document.hidden ? (Date.now() - TRC.hid > 120e3 ? 10000 : 5000) : 1200);
function trocPollSoon(ms) { clearTimeout(TRC.t); if (TRC.c) TRC.t = setTimeout(trocPoll, ms == null ? trocGap() : ms); }
async function trocPoll() {
  const c = TRC.c; if (!c) return;
  try {
    const j = await trocCall(`/s?c=${c}&v=${TRC.s && TRC.s.c === c ? TRC.s.v : 0}`);
    if (TRC.c !== c) return;
    if (TRC.fail) { TRC.fail = 0; trocNet(true); }
    if (j.same) { if (TRC.s && TRC.s.ot && TRC.s.ot.on !== j.on) { TRC.s.ot.on = j.on; trocPaint(); } }
    else trocTake(j);
  } catch (e) {
    if (TRC.c !== c) return;
    if (e.code === 'gone') { trocGone(); return; }
    TRC.fail++; trocNet(false);
  }
  if (TRC.c !== c) return;
  if (trocOpenSt(TRC.s) || trocUndoable()) trocPollSoon();
  else if (TRC.s && TRC.s.st === 'done' && TRC.undo) { trocReset(); trocPaint(); }      // plus annulable : la session est oubliée ici (l'écran de fin reste)
}
/** Connexion perdue / revenue : bandeau sous l'en-tête. */
function trocNet(ok) { const b = TRC.el && $('.trc-net', TRC.el); if (b) b.hidden = ok; }
/** La session n'existe plus sur le serveur (redémarrage, expirée) : fin, rien n'a changé ici. */
function trocGone() {
  const s = TRC.s;
  if (s && s.st === 'done') { trocReset(); return; }
  TRC.s = s ? { ...s, st: 'end', why: 'gone', by: '' } : { c: TRC.c, st: 'end', why: 'gone', by: '', me: { give: [] }, ot: null };
  trocReset(); trocPaint();
}
/** Nouvelle session reçue du serveur : transitions (arrivée de l'autre, changement qui retire « Prêt », fin, échange fait), puis repeint. */
function trocTake(s) {
  if (!s || !s.c || s.c !== TRC.c) return;
  const prev = TRC.s && TRC.s.c === s.c ? TRC.s : null;
  if (prev && s.v < prev.v) return;      // relevé parti avant une action déjà revenue : plus ancien, ignoré
  TRC.s = s;
  const ids = new Set(prev ? [...prev.me.give, ...(prev.ot ? prev.ot.give : [])].map(x => x.id) : []);
  TRC.flash = new Set(prev ? [...s.me.give, ...(s.ot ? s.ot.give : [])].filter(x => !ids.has(x.id)).map(x => x.id) : []);
  const name = trocWho();
  if (prev && !prev.ot && s.ot && s.st === 'live') { haptic('ok'); toast(T('{name} a rejoint l\'échange', { name })); }
  else if (prev && prev.me.ready && !s.me.ready && s.cv !== prev.cv && s.cv !== TRC.myCv && s.st === 'live') { haptic('warn'); toast(T('{name} a changé l\'échange : vérifie, puis « Prêt »', { name })); }
  else if (prev && prev.ot && s.ot && !prev.ot.ready && s.ot.ready && s.st === 'live') haptic('tap');
  if (s.ot && TRC.ot && TRC.ot.lv !== s.ot.lv) TRC.ot = null;      // sa liste a changé : relue à la prochaine ouverture
  if (s.st === 'done') {      // fait : appliqué chez moi (une fois) ; puis, tant qu'il est annulable, les demandes d'annulation (op undo) ; annulé des deux côtés : défait ici aussi
    if (s.ud) trocUndone(s);
    else {
      trocApply(s);
      if (prev && prev.ot && s.ot && !prev.ot.un && s.ot.un && !s.me.un) { haptic('warn'); toast(T('{name} propose d\'annuler l\'échange', { name })); }
      else if (prev && prev.me.un && !s.me.un && TRC.unBy !== 'me') { haptic('tap'); toast(T('{name} préfère garder l\'échange', { name })); }
      TRC.unBy = '';
    }
    trocPaint(); return;
  }
  if (s.st === 'end') { if (prev && trocOpenSt(prev) && s.by === 'ot') haptic('warn'); trocReset(); trocPaint(); return; }
  trocSaveCur(); trocPaint();
  if (TRC.pick && TRC.pick.paint) TRC.pick.paint();
}

/* ── Entrées : créer, rejoindre, inviter, reprendre ─────────────────────────────────────────────────────────────────────────── */
/** Conditions d'un échange : pas de mode streamer, serveur, en ligne, compte (sinon : connexion d'abord, puis l'échange), collection du compte lue. */
async function trocReady(code) {
  if (typeof streamOn === 'function' && streamOn()) { toast(T('Échange en direct indisponible en mode streamer')); return false; }
  for (let i = 0; i < 60 && !CTX.proxy; i++) await sleep(100);
  if (!trocOn()) { toast(trocErr('troc_disabled')); return false; }
  if (typeof navigator !== 'undefined' && navigator.onLine === false) { toast(trocErr('net')); return false; }
  for (let i = 0; i < 60 && !D.authReady; i++) await sleep(100);
  if (!D.user) { trocLogin(code); return false; }
  if (!COLL.live) {      // la collection du compte doit être là : l'échange la modifie
    const t = Tasks.start(T('Lecture de ta collection…'));
    for (let i = 0; i < 100 && D.user && !COLL.live; i++) await sleep(100);
    t.remove();
    if (!COLL.live) { toast(T('Ta collection n\'est pas encore lue : réessaie dans un instant')); return false; }
  }
  return true;
}
/** Déconnecté : la connexion d'abord ; l'échange reprend tout seul une fois connecté (trocUser). */
function trocLogin(code) {
  TRC.want = code || '+';      // + : créer (hôte)
  openSheet(T('Échange en direct'), null, api => {
    api.body.innerHTML = `<p class="hint">${T('Connecte-toi pour échanger en direct : chacun utilise son compte, et rien ne change dans ta collection sans ta validation.')}</p>`;
    api.setFoot(`<button class="btn ghost" type="button" data-close>${T('Plus tard')}</button><button class="btn" type="button" data-trc="login">${T('Se connecter')}</button>`);
    api.wrap.addEventListener('click', e => { if (e.target.closest('[data-trc="login"]')) { api.close(); openAccount(); } });
  });
}
/** Compte connecté ou changé (decks.js › onUser) : l'échange qui attendait la connexion reprend ; un autre compte quitte la session de l'ancien. */
function trocUser(user) {
  if (user && TRC.want) { const c = TRC.want; TRC.want = ''; setTimeout(() => { if (c === '+') trocHost(); else trocJoinCode(c); }, 700); return; }
  if (TRC.c && (!user || (TRC.uid && TRC.uid !== user.uid))) trocQuit().then(trocCloseWin);
}
/** Nouvelle session (hôte) ; inv : un ami à inviter ({ id, n }). */
async function trocHost(inv) {
  if (!(await trocReady(''))) return;
  if (TRC.c) await trocQuit();
  const t = Tasks.start(T('Création de l\'échange…'));
  try {
    const r = await trocCall('', { method: 'POST', auth: true, body: { ...(await trocProf()), list: trocMyList(), ...(inv ? { inv: inv.id } : {}) } });
    t.remove(); trocStart(r, inv);
  } catch (e) { t.remove(); toast(trocErr(e.code)); }
}
/** Rejoint par le code (tapé, QR code scanné, notification). */
async function trocJoinCode(raw) {
  const code = trocCodeOf(raw); if (!code) { toast(T('Code invalide : 6 lettres ou chiffres')); return; }
  if (TRC.c === code && TRC.el) return;
  if (!(await trocReady(code))) return;
  if (TRC.c && TRC.c !== code) await trocQuit();
  const t = Tasks.start(T('Entrée dans l\'échange…'));
  try {
    const r = await trocCall('/join', { method: 'POST', auth: true, body: { c: code, ...(await trocProf()), list: trocMyList() } });
    t.remove(); trocStart(r);
  } catch (e) { t.remove(); toast(trocErr(e.code)); }
}
/** Page d'un ami (friends.js) : session créée avec son invitation (notification de son compte). */
function trocInvite(f) { if (f && f.id) { haptic('tap'); trocHost({ id: f.id, n: f.n || '' }); } }
function trocStart(r, inv) {
  if (!r || !r.s || !r.key) return;
  TRC.c = r.s.c; TRC.key = r.key; TRC.uid = D.uid; TRC.s = null; TRC.ot = null; TRC.fail = 0; TRC.myCv = 0;
  TRC.sent = inv ? { n: inv.n || r.s.inv || '', k: r.sent } : null;
  if (TRC.inv) TRC.inv.add(r.s.c);
  trocSaveCur(); trocOpenWin(); trocTake(r.s); trocPollSoon(1200);
  trPx();      // fichier de prix de l'appareil (sélecteurs) : le même que celui du serveur
}
/** Quitte la session (best effort : hors ligne, le serveur la termine seul après 30 min). */
async function trocQuit() {
  if (!TRC.c) return;
  const was = TRC.c; clearTimeout(TRC.t);
  try { await Promise.race([trocCall('/op', { method: 'POST', body: { c: was, op: 'leave' } }), sleep(2500)]); } catch (e) { /* déjà terminée */ }
  if (TRC.c === was) trocReset();
}
/** Fenêtre fermée par Retour, Échap ou la flèche : pendant l'échange, on demande d'abord. */
function trocAskLeave() {
  if (!trocOpenSt(TRC.s) || !TRC.c) { trocCloseWin(); return; }
  if (!TRC.s.ot) { trocQuit().then(trocCloseWin); return; }      // personne encore : rien à expliquer
  openSheet(T('Quitter l\'échange ?'), null, api => {
    api.body.innerHTML = `<p class="hint">${T('{name} verra que tu es parti. Rien ne change dans vos collections.', { name: esc(trocWho()) })}</p>`;
    api.setFoot(`<button class="btn ghost" type="button" data-close>${T('Rester')}</button><button class="btn danger" type="button" data-trc="leave">${T('Quitter')}</button>`);
    api.wrap.addEventListener('click', async e => { if (!e.target.closest('[data-trc="leave"]')) return; api.close(); haptic('tap'); await trocQuit(); trocCloseWin(); toast(T('Tu as quitté l\'échange')); });
  });
}
/** Lien ./?troc=<code> (QR code scanné, notification touchée) : vrai si l'adresse était pour l'échange. */
function trocPushOpen(url) {
  const m = /[?&]troc=([A-Za-z0-9-]{6,8})/.exec(String(url || '')); if (!m) return false;
  setTimeout(() => trocJoinCode(m[1]), 400); return true;
}
/** Invitations déjà montrées (cette visite) : un toast par invitation. */
function trocSeen() {
  if (!TRC.inv) { TRC.inv = new Set(); try { for (const c of JSON.parse(sessionStorage.getItem('deckdeal:troc:inv') || '[]')) TRC.inv.add(c); } catch (e) { /* stockage bloqué */ } }
  return TRC.inv;
}
function trocSeenAdd(c) { const s = trocSeen(); s.add(c); try { sessionStorage.setItem('deckdeal:troc:inv', JSON.stringify([...s].slice(-20))); } catch (e) { /* stockage bloqué */ } }
/** Invitation reçue appli ouverte (FCM au premier plan, ou signalée par le service worker) : toast « Rejoindre » (jamais en mode streamer). */
function trocPushed(n) {
  const m = /[?&]troc=([A-Za-z0-9-]{6,8})/.exec(String((n && n.url) || '')), c = m && trocCodeOf(m[1]);
  if (!c || TRC.c === c || (typeof streamOn === 'function' && streamOn())) return;
  trocSeenAdd(c);
  toast(n.title && n.body ? n.title + ' · ' + n.body : T('Invitation à un échange en direct'), { label: T('Rejoindre'), fn: () => trocJoinCode(c) });
}
/** Invitations en attente lues avec la liste des amis (friends.js › amRefresh) : toast pour une nouvelle. */
function trocInvites(list) {
  if (!Array.isArray(list) || !list.length || (typeof streamOn === 'function' && streamOn())) return;
  const seen = trocSeen(), x = list.find(i => i && TRC_CODE_RE.test(i.c) && !seen.has(i.c) && i.c !== TRC.c); if (!x) return;
  trocSeenAdd(x.c);
  toast(T('{name} t\'invite à un échange en direct', { name: x.n || T('Un ami') }), { label: T('Rejoindre'), fn: () => trocJoinCode(x.c) });
}
/** Démarrage : une session en cours sur cet appareil (appli tuée pendant l'échange) reprend ; faite mais pas appliquée, elle s'applique. */
function trocInit() {
  let cur = null; try { cur = JSON.parse(localStorage.getItem(TRC_CUR) || 'null'); } catch (e) { cur = null; }
  if (!cur) return;
  if (!TRC_CODE_RE.test(String(cur.c)) || typeof cur.k !== 'string' || !(Date.now() - (Number(cur.at) || 0) < 26 * 3600e3)) { try { localStorage.removeItem(TRC_CUR); } catch (e) { /* ignore */ } return; }
  setTimeout(async () => {
    for (let i = 0; i < 80 && !(CTX.proxy && D.authReady); i++) await sleep(100);
    if (TRC.c || !CTX.proxy) return;
    if (!D.user || (cur.u && D.uid !== cur.u)) { try { localStorage.removeItem(TRC_CUR); } catch (e) { /* ignore */ } return; }      // autre compte : sa session n'est pas la nôtre
    TRC.c = cur.c; TRC.key = cur.k; TRC.uid = D.uid;
    try {
      const s = await trocCall(`/s?c=${cur.c}`);
      if (s.st === 'done' && trocHist().some(h => h.id === trocRecId(s.c))) {      // déjà appliqué : annulé des deux côtés entre-temps → défait ici aussi ; ma demande d'annulation en attente → retirée
        if (s.ud) trocUndone(s); else { if (s.me.un) trocUnDrop(s); trocReset(); }
        return;
      }
      if (s.st === 'done' || trocOpenSt(s)) { trocOpenWin(); trocTake(s); if (trocOpenSt(s)) trocPollSoon(1200); }
      else trocReset();
    } catch (e) { if (e.code === 'gone' || e.status === 404) trocReset(); else { TRC.c = ''; TRC.key = ''; } }      // hors ligne : on réessaiera au prochain lancement
  }, 900);
}

/* ── Fenêtre d'échange ─────────────────────────────────────────────────────────────────────────────────────────────────────── */
function trocOpenWin() {
  if (TRC.el) { trocPaint(); return; }
  const wrap = document.createElement('div'); wrap.className = 'dv trc'; wrap.setAttribute('role', 'dialog'); wrap.setAttribute('aria-modal', 'true'); wrap.setAttribute('aria-label', T('Échange en direct'));
  wrap.innerHTML = `<header class="dv-head"><button class="icon-btn dv-back" type="button" data-trc="close" aria-label="${T('Quitter l\'échange')}"><svg class="i"><use href="#i-back"/></svg></button>
      <div class="dv-title"><b>${T('Échange en direct')}</b><span class="trc-sub"></span></div><button class="trc-code" type="button" data-trc="code" title="${T('Code de l\'échange')}"></button></header>
    <div class="trc-net" role="status" hidden><span class="dot"></span><span>${T('Connexion perdue · nouvel essai…')}</span></div>
    <div class="dv-scroll"><div class="dv-body trc-body"></div></div><div class="dv-foot trc-foot"></div>`;
  TRC.el = wrap; wrap.__close = trocAskLeave;
  wrap.addEventListener('click', trocClick);
  wrap.addEventListener('error', e => { const im = e.target; if (im.tagName !== 'IMG') return; if (im.dataset.n && !im.dataset.fb) { im.dataset.fb = '1'; im.src = scImg(im.dataset.n); } else im.remove(); }, true);      // image de la session absente : celle de Scryfall par le nom
  TRC.vis = () => { if (document.hidden) TRC.hid = Date.now(); else { trocLock(); if (TRC.c && (trocOpenSt(TRC.s) || trocUndoable())) trocPollSoon(0); } };
  document.addEventListener('visibilitychange', TRC.vis);
  document.addEventListener('keydown', trocKey, true);
  document.body.appendChild(wrap); holdApp(); trocLock();
  requestAnimationFrame(() => requestAnimationFrame(() => { wrap.classList.add('on'); const b = $('.dv-back', wrap); if (b) b.focus({ preventScroll: true }); }));
}
function trocCloseWin() {
  const w = TRC.el; if (!w) return; TRC.el = null;
  const s = TRC.s; if (s && s.st === 'done' && TRC.c === s.c) { if (s.me.un && !s.ud) trocUnDrop(s); trocReset(); }      // échange fait : plus annulable une fois l'écran fermé
  if (TRC.pick) { try { TRC.pick.close(); } catch (e) { /* déjà fermée */ } TRC.pick = null; }
  trocBright(false); try { if (TRC.wl) TRC.wl.release(); } catch (e) { /* déjà relâché */ } TRC.wl = null;
  document.removeEventListener('visibilitychange', TRC.vis); document.removeEventListener('keydown', trocKey, true);
  w.classList.remove('on'); setTimeout(() => w.remove(), reduceMotion() ? 0 : 240); releaseApp();
  if (!TRC.c || !trocOpenSt(TRC.s)) TRC.s = null;
}
function trocKey(e) { if (e.key === 'Escape' && TRC.el && !imgView && !sheets.length) { e.stopPropagation(); trocAskLeave(); } }
/** Écran allumé pendant l'échange (Wake Lock, si le navigateur l'a) : on se parle, on ne touche pas toujours le téléphone. */
async function trocLock() {
  if (!TRC.el || TRC.wl || !navigator.wakeLock || document.visibilityState !== 'visible') return;
  try { const l = await navigator.wakeLock.request('screen'); if (!TRC.el) { l.release(); return; } TRC.wl = l; if (l.addEventListener) l.addEventListener('release', () => { if (TRC.wl === l) TRC.wl = null; }); } catch (e) { TRC.wl = null; }
}
/** Pleine luminosité tant que le QR code attend d'être scanné (appli Android, APK 1.0.4 : natBright). */
function trocBright(on) { if (TRC.bright === on) return; TRC.bright = on; natBright(on); }
const trocPhase = s => (!s ? 'wait' : s.st === 'done' ? 'done' : s.st === 'end' ? 'end' : s.st === 'wait' || !s.ot ? 'wait' : s.me.ready && s.ot.ready ? 'confirm' : 'live');
function trocPaint() {
  const w = TRC.el, s = TRC.s; if (!w || !s) return;
  const ph = trocPhase(s), ot = s.ot, name = esc(trocWho());
  w.dataset.ph = ph;
  $('.trc-sub', w).textContent = ph === 'wait' ? T('En attente d\'un joueur') : ph === 'done' ? T('Échange terminé') : ph === 'end' ? T('Terminé') : T('avec {name}', { name: trocWho() });
  const code = $('.trc-code', w); code.textContent = trocFmtCode(s.c); code.hidden = ph === 'done' || ph === 'end';
  const body = $('.trc-body', w);
  body.innerHTML = trocNb(ph === 'wait' ? trocWaitHtml(s) + trocZonesHtml(s) : ph === 'confirm' ? trocConfirmHtml(s) : ph === 'done' ? trocDoneHtml(s) : ph === 'end' ? trocEndHtml(s) : trocZonesHtml(s));
  $('.trc-foot', w).innerHTML = trocFootHtml(s, ph, name);
  trocBright(ph === 'wait');
  if (ph === 'wait') trocQrFit();
  TRC.flash.clear();
}
/** QR code : un nombre entier de pixels physiques par module (comme celui de la liste d'échange). */
function trocQrFit() {
  const box = TRC.el && $('.trc-qr .qr-img', TRC.el), svg = box && $('svg', box); if (!svg) return;
  const n = Number(svg.dataset.n) || 33, fit = () => { const w = Math.min(box.clientWidth || 260, 300), r = window.devicePixelRatio || 1, px = Math.max(2, Math.floor(w * r / n)) * n / r; svg.style.width = svg.style.height = px + 'px'; };
  fit(); requestAnimationFrame(fit);
}
function trocWaitHtml(s) {
  let q = null; try { q = qrSvgLogo(trocUrl(s.c)); } catch (e) { q = null; }
  const inv = TRC.sent, me = s.me, svg = q ? q.svg.replace('<svg', `<svg data-n="${q.n}"`) : '';
  const note = inv ? (inv.k > 0 ? T('Invitation envoyée à {name}.', { name: esc(inv.n || T('ton ami')) }) : inv.k === 0 ? T('{name} n\'a pas activé les notifications : donne-lui le code.', { name: esc(inv.n || T('Ton ami')) }) : T('Invitation envoyée à {name}.', { name: esc(inv.n || T('ton ami')) })) : '';
  return `<section class="trc-wait">
    <div class="qr-card trc-qr"><div class="qr-who">${trocAv(me)}<b>${me.n ? T('Échange avec {name}', { name: esc(me.n) }) : T('Échange en direct')}</b></div>
      ${svg ? `<div class="qr-img" role="img" aria-label="${T('QR code de l\'échange')}">${svg}</div>` : ''}<p class="trc-bigcode" aria-label="${esc(T('Code : {code}', { code: s.c.split('').join(' ') }))}">${trocFmtCode(s.c)}</p></div>
    <p class="qr-hint">${inv ? T('En attente de {name}…', { name: esc(inv.n || T('ton ami')) }) : T('Fais scanner ce QR code par l\'autre joueur')}</p>
    <p class="hint trc-wh">${note ? note + ' ' : ''}${T('Ou donne-lui le code : Échange › Échange en direct › « J\'ai un code ».')}</p></section>`;
}
/** Statut de l'autre joueur, sous son nom. */
function trocOtState(s) {
  const ot = s.ot; if (!ot) return ['', ''];
  if (!ot.on) return ['away', T('hors ligne…')];
  if (ot.ok) return ['ok', T('a validé')];
  if (ot.ready) return ['ready', T('est prêt')];
  return ['', s.me.ready ? T('choisit encore…') : T('choisit ses cartes…')];
}
function trocTile(x, side) {
  const k = ownKey(x.n), dn = trocName(x), l = lineLang(x.g), e = lineEd(x.g), fo = lineFoil(x.g);
  const lab = [dn + (x.q > 1 ? ' × ' + x.q : ''), fo ? T('Foil') : '', x.u ? fmt(x.u, 'EUR') : '', x.r ? T('Demandée') : ''].filter(Boolean).join(' · ');
  return `<button class="trc-card${TRC.flash.has(x.id) ? ' new' : ''}${x.r ? ' pend' : ''}${fo ? ' foil' : ''}" type="button" data-id="${esc(x.id)}" data-side="${side}" aria-label="${esc(lab)}">
    <span class="trc-art" style="--h:${hash32(k) % 360}"><b aria-hidden="true">${esc((dn.trim()[0] || '?').toUpperCase())}</b><img alt="" loading="lazy" decoding="async" src="${esc(trocSrc(x))}" data-n="${esc(x.n)}">
      ${x.q > 1 ? `<i class="trc-q">×${x.q}</i>` : ''}${l && l !== 'en' ? `<i class="trc-fl">${flag(l)}</i>` : ''}${trocFo(x.g)}${x.a ? `<i class="trc-badge${x.r ? '' : ' on'}">${x.r ? T('Demandée') : T('Acceptée')}</i>` : ''}</span>
    <span class="trc-nm">${esc(dn)}</span><span class="trc-pu">${x.u ? esc(fmt(x.u, 'EUR')) : '—'}${e ? `<small>${esc(edLabel(e))}</small>` : ''}</span></button>`;
}
function trocZoneHtml(cls, title, list, side, add, empty, extra = '') {
  const sum = trocSum(list);
  return `<section class="trc-zone ${cls}" aria-label="${esc(title)}"><header class="trc-zh"><b>${esc(title)}</b>${sum.n ? `<span>${TN(sum.q, '{n} carte', '{n} cartes')}${sum.v ? ` · <em>${esc(fmt(sum.v, 'EUR'))}</em>` : ''}</span>` : ''}</header>
    ${extra}${list.length ? `<div class="trc-grid">${list.map(x => trocTile(x, side)).join('')}</div>` : `<p class="trc-empty">${empty}</p>`}${add}</section>`;
}
function trocZonesHtml(s) {
  const me = s.me, ot = s.ot, name = esc(trocWho()), pend = me.give.filter(x => x.r);
  const plus = '<svg class="i" aria-hidden="true"><use href="#i-plus"/></svg>';
  const giveBtn = `<button class="trc-add" type="button" data-trc="give">${plus}<span>${T('Ajouter une carte')}</span><small>${T('ta liste ou ta collection')}</small></button>`;
  let out = '';
  if (ot) {
    const [st, txt] = trocOtState(s);
    out += `<div class="trc-who" data-st="${st}">${trocAv(ot)}<span class="trc-wt"><b>${name}</b><small>${esc(txt)}</small></span>${me.ready ? `<span class="trc-me">${TRC_OK}${T('Tu es prêt')}</span>` : ''}</div>`;
    const askBtn = ot.nl ? `<button class="trc-add" type="button" data-trc="ask">${plus}<span>${T('Demander une carte')}</span><small>${TN(ot.nl, '{n} carte dans sa liste', '{n} cartes dans sa liste')}</small></button>`
      : `<p class="trc-none">${T('{name} n\'a rien dans sa liste d\'échange : il peut quand même donner des cartes de sa collection.', { name })}</p>`;
    out += trocZoneHtml('get', T('Tu reçois'), ot.give, 'ot', askBtn, T('Rien pour l\'instant : demande des cartes de sa liste.'));
    out += trocBalHtml(trocSum(ot.give).v, trocSum(me.give).v, ot.give.length + me.give.length);
  }
  const req = pend.length ? `<div class="trc-req"><span>${TN(pend.length, '{name} te demande {n} carte', '{name} te demande {n} cartes', { name })}</span><button class="btn small" type="button" data-trc="acceptall">${T('Tout accepter')}</button></div>` : '';
  out += trocZoneHtml('give', T('Tu donnes'), me.give, 'me', giveBtn, ot ? T('Rien pour l\'instant : ajoute des cartes de ta liste d\'échange.') : T('Tu peux déjà choisir ce que tu donnes.'), req);
  const at = s.px && Date.parse(s.px);
  if (ot) out += `<p class="hint trc-px">${at ? T('Prix à l\'unité : tendance Cardmarket ({when}), les mêmes pour vous deux.', { when: esc(relTime(at)) }) : T('Prix à l\'unité : tendance Cardmarket, les mêmes pour vous deux.')}</p>`;
  return out;
}
/** Balance : écart (je reçois − je donne) en € et en % de la plus grosse part ; vert jusqu'à 10 %, orange jusqu'à 25 %, rouge au-delà. */
function trocBal(get, give) {
  const d = get - give, base = Math.max(get, give), pct = base ? Math.round(Math.abs(d) * 100 / base) : 0, even = !!base && (Math.abs(d) < 50 || pct < 3);
  return { d, base, pct, even, lv: !base ? 'none' : even || pct <= 10 ? 'even' : pct <= 25 ? 'mid' : 'far' };
}
function trocBalHtml(get, give, any) {
  const b = trocBal(get, give), x = b.base ? 50 + Math.max(-1, Math.min(1, b.d / b.base)) * 46 : 50;
  const txt = !b.base ? (any ? T('Pas encore de prix pour comparer') : T('Ajoutez des cartes de chaque côté')) : b.even ? T('Équilibré') : b.d > 0 ? T('Tu reçois {v} de plus', { v: fmt(b.d, 'EUR') }) : T('Tu donnes {v} de plus', { v: fmt(-b.d, 'EUR') });
  return `<div class="trc-bal" data-lv="${b.lv}" role="img" aria-label="${esc(txt + (b.base && !b.even ? ' (' + b.pct + ' %)' : ''))}">
    <div class="trc-meter" aria-hidden="true"><span>${T('tu donnes plus')}</span><i class="trc-track"><i class="trc-mark" style="--x:${x.toFixed(1)}%"></i></i><span>${T('tu reçois plus')}</span></div>
    <div class="trc-bt"><b>${esc(txt)}</b>${b.base && !b.even ? `<em>${b.pct} %</em>` : ''}</div></div>`;
}
/** Liste courte (récapitulatif, fin, historique) : une ligne par carte et par ligne (langue|édition|foil), demandée ou non ; sous le nom : drapeau, édition, « ✦ Foil ». */
function trocMiniList(list) {
  const by = new Map();
  for (const x of list) { if (x.r) continue; const k = ownKey(x.n) + '|' + (x.g || ''), e = by.get(k); if (e) e.q += x.q; else by.set(k, { ...x }); }
  const meta = g => [lineLang(g) ? flag(lineLang(g)) : '', lineEd(g) ? esc(edLabel(lineEd(g))) : '', lineFoil(g) ? '✦ ' + T('Foil') : ''].filter(Boolean).join(' ');
  return `<ul class="trc-ml">${[...by.values()].map(x => `<li><span class="trc-mi" style="--h:${hash32(ownKey(x.n)) % 360}"><img alt="" loading="lazy" decoding="async" src="${esc(trocSrc(x))}" data-n="${esc(x.n)}"></span><span class="trc-mw"><span class="trc-mn">${esc(trocName(x))}${x.q > 1 ? ` <b>× ${x.q}</b>` : ''}</span>${meta(x.g) ? `<small class="trc-mt${lineFoil(x.g) ? ' fo' : ''}">${meta(x.g)}</small>` : ''}</span><span class="trc-mp">${x.u ? esc(fmt(x.u * x.q, 'EUR')) : '—'}</span></li>`).join('') || `<li class="trc-mz">${T('rien')}</li>`}</ul>`;
}
function trocConfirmHtml(s) {
  const sg = trocSum(s.ot.give), sv = trocSum(s.me.give), name = esc(trocWho());
  return `<section class="trc-final"><div class="trc-fh">${TRC_OK}<span><b>${T('Vous êtes prêts tous les deux')}</b><small>${T('Vérifie une dernière fois, puis valide : ta collection sera mise à jour.')}</small></span></div>
    <div class="trc-col get"><h3>${T('Tu reçois')}<span>${sg.v ? esc(fmt(sg.v, 'EUR')) : ''}</span></h3>${trocMiniList(s.ot.give)}</div>
    <div class="trc-col give"><h3>${T('Tu donnes')}<span>${sv.v ? esc(fmt(sv.v, 'EUR')) : ''}</span></h3>${trocMiniList(s.me.give)}</div>
    ${trocBalHtml(sg.v, sv.v, 1)}
    <p class="trc-fs" data-ok="${s.ot.ok ? 1 : 0}">${s.ot.ok ? TRC_OK + T('{name} a validé', { name }) : T('{name} n\'a pas encore validé', { name })}</p></section>`;
}
function trocDoneHtml(s) {
  const sg = trocSum(s.ot ? s.ot.give : []), sv = trocSum(s.me.give), name = esc(trocWho());
  if (s.ud) return `<section class="trc-done trc-end"><span class="trc-tick off"><svg class="i" aria-hidden="true"><use href="#i-close"/></svg></span><b>${T('Échange annulé des deux côtés')}</b><p>${T('Vos deux collections sont revenues comme avant.')}</p></section>`;
  const un = !trocUndoable() ? '' : s.me.un ? `<div class="trc-undo" data-st="me"><span>${T('Annulation proposée à {name} : en attente de sa réponse…', { name })}</span><button class="btn small ghost" type="button" data-trc="unno">${T('Retirer ma demande')}</button></div>`
    : s.ot && s.ot.un ? `<div class="trc-undo" data-st="ot"><span>${T('{name} propose d\'annuler l\'échange : vos deux collections reviendraient comme avant.', { name })}</span><span class="trc-ua"><button class="btn small ghost" type="button" data-trc="unno">${T('Garder l\'échange')}</button><button class="btn small danger" type="button" data-trc="unyes">${T('Annuler l\'échange')}</button></span></div>` : '';
  return `<section class="trc-done"><span class="trc-tick">${TRC_OK}</span><b>${T('Échange terminé')}</b><p>${T('Ta collection est à jour : {give}, {get}.', { give: TN(sv.q, '{n} carte donnée', '{n} cartes données'), get: TN(sg.q, '{n} reçue', '{n} reçues') })}</p>${un}
    <div class="trc-col get"><h3>${T('Tu as reçu')}<span>${sg.v ? esc(fmt(sg.v, 'EUR')) : ''}</span></h3>${trocMiniList(s.ot ? s.ot.give : [])}</div>
    <div class="trc-col give"><h3>${T('Tu as donné')}<span>${sv.v ? esc(fmt(sv.v, 'EUR')) : ''}</span></h3>${trocMiniList(s.me.give)}</div>
    <p class="hint">${T('Retrouve-le dans Échange › Échange en direct › « Mes échanges ».')}</p></section>`;
}
function trocEndHtml(s) {
  const name = esc((s.ot && s.ot.n) || T('L\'autre joueur'));
  const msg = s.why === 'left' && s.by === 'ot' ? T('{name} a quitté l\'échange.', { name }) : s.why === 'left' ? T('Tu as quitté l\'échange.') : s.why === 'idle' ? T('Échange terminé : plus d\'activité depuis 30 minutes.') : T('Session terminée.');
  return `<section class="trc-done trc-end"><span class="trc-tick off"><svg class="i" aria-hidden="true"><use href="#i-close"/></svg></span><b>${msg}</b><p>${T('Rien n\'a changé dans ta collection.')}</p></section>`;
}
function trocFootHtml(s, ph, name) {
  if (ph === 'wait') return `<button class="btn ghost" type="button" data-trc="quit">${T('Annuler l\'échange')}</button>`;
  if (ph === 'done' && trocUndoable() && !s.me.un && !(s.ot && s.ot.un)) return `<button class="btn ghost" type="button" data-trc="undo">${T('Annuler l\'échange')}</button><button class="btn" type="button" data-trc="close">${T('Fermer')}</button>`;      // annuler : proposé à l'autre (trocUndoAsk)
  if (ph === 'done' || ph === 'end') return `<button class="btn" type="button" data-trc="close">${T('Fermer')}</button>`;
  if (ph === 'confirm') return `<button class="btn ghost" type="button" data-trc="edit">${T('Modifier')}</button><button class="btn trc-go" type="button" data-trc="ok"${s.me.ok ? ' disabled' : ''}>${s.me.ok ? T('En attente de {name}…', { name }) : T('Valider l\'échange')}</button>`;
  const pend = s.me.give.some(x => x.r), empty = !s.me.give.length && !s.ot.give.length, b = trocBal(trocSum(s.ot.give).v, trocSum(s.me.give).v);
  const eq = !s.me.ready && b.base && !b.even;
  return `${eq ? `<button class="btn ghost trc-eq" type="button" data-trc="eq">${TRC_EQ}${T('Équilibrer')}</button>` : ''}<button class="btn trc-ready" type="button" data-trc="ready" aria-pressed="${s.me.ready}"${!s.me.ready && (pend || empty) ? ' disabled' : ''}${s.me.ready ? ` title="${T('Touche pour modifier')}"` : ''}>${s.me.ready ? TRC_OK + T('Prêt') : T('Prêt')}</button>`;
}
async function trocClick(e) {
  const b = e.target.closest('[data-trc]');
  if (!b) { const t = e.target.closest('.trc-card'); if (t) trocTileSheet(t.dataset.id, t.dataset.side); return; }
  if (b.disabled) return;
  const a = b.dataset.trc, s = TRC.s;
  if (a === 'close') { trocAskLeave(); return; }
  if (a === 'code') { if (s && s.c) copyText(trocFmtCode(s.c)); return; }
  if (a === 'quit') { haptic('tap'); await trocQuit(); trocCloseWin(); toast(T('Échange annulé')); return; }
  if (a === 'undo' || a === 'unyes' || a === 'unno') {      // échange fait : proposer l'annulation, l'accepter (les deux : défait des deux côtés), la refuser ou la retirer
    if (!trocUndoable()) return;
    haptic('tap');
    if (a === 'undo') trocUndoAsk(); else { if (a === 'unno') TRC.unBy = 'me'; b.disabled = true; trocDo({ op: 'undo', on: a === 'unyes' }); }
    return;
  }
  if (!s || !trocOpenSt(s)) return;
  haptic('tap');
  if (a === 'give') trocGiveSheet();
  else if (a === 'ask') trocAskSheet();
  else if (a === 'acceptall') trocDo({ op: 'accept', all: true });
  else if (a === 'ready') trocDo({ op: 'ready', on: !s.me.ready, cv: s.cv });
  else if (a === 'edit') trocDo({ op: 'ready', on: false });
  else if (a === 'ok') { b.disabled = true; trocDo({ op: 'confirm', cv: s.cv }); }
  else if (a === 'eq') trocBalance();
}

/* ── Carte touchée : quantité, retrait, demande acceptée ou refusée, carte en grand ──────────────────────────────────────────── */
function trocTileSheet(id, side) {
  const s = TRC.s; if (!s) return;
  const list = side === 'me' ? s.me.give : s.ot ? s.ot.give : [], x = list.find(y => y.id === id); if (!x) return;
  if (side === 'ot' && !x.a || !trocOpenSt(s)) { trocZoom(list, x); return; }
  const name = esc(trocName(x)), l = lineLang(x.g), e = lineEd(x.g), who = esc(trocWho());
  const sub = [l ? (LANGS[l] || l) : '', e ? edLabel(e) : '', lineFoil(x.g) ? T('Foil') + ' ✦' : '', x.u ? T('{v} pièce', { v: fmt(x.u, 'EUR') }) : ''].filter(Boolean).join(' · ');
  openSheet(trocName(x), sub, api => {
    api.wrap.classList.add('trc-ts');
    const own = side === 'me' ? collLines(COLL.map[ownKey(x.n)]).reduce((t, y) => t + (lineHead(y[0]) === x.g ? y[1] : 0), 0) : 0;
    const paint = () => {
      const cur = (side === 'me' ? TRC.s.me.give : (TRC.s.ot || {}).give || []).find(y => y.id === id); if (!cur || !trocOpenSt(TRC.s)) { api.close(); return; }
      const msg = side === 'ot' ? (cur.r ? T('Tu as demandé cette carte : {name} ne l\'a pas encore acceptée.', { name: who }) : T('Tu as demandé cette carte : {name} l\'a acceptée.', { name: who }))
        : cur.r ? T('{name} te demande cette carte.', { name: who }) : cur.a ? T('{name} t\'a demandé cette carte.', { name: who }) : '';
      const max = cur.a ? cur.q : Math.max(cur.q, own);
      api.body.innerHTML = `<div class="trc-tsb"><span class="trc-big" style="--h:${hash32(ownKey(x.n)) % 360}"><img alt="" src="${esc(trocSrc(cur).replace('/small/', '/normal/'))}" data-n="${esc(x.n)}"></span>
        <div class="trc-tsi">${msg ? `<p class="hint">${msg}</p>` : ''}${side === 'me' && !cur.r ? `<span class="label">${T('Exemplaires')}</span><span class="qstep trc-qs"><button type="button" data-q="-1" aria-label="${T('Un de moins')}">−</button><b>${cur.q}</b><button type="button" data-q="1" aria-label="${T('Un de plus')}"${cur.q >= max ? ' disabled' : ''}>+</button></span>
          ${own ? `<small class="hint">${T('Tu en as {n} dans cette langue et cette édition.', { n: own })}</small>` : ''}` : `<b class="trc-tq">× ${cur.q}</b>`}</div></div>`;
      api.setFoot(side === 'ot' ? `<button class="btn ghost" type="button" data-close>${T('Fermer')}</button><button class="btn danger" type="button" data-ts="unask">${T('Annuler la demande')}</button>`
        : cur.r ? `<button class="btn ghost" type="button" data-ts="no">${T('Refuser')}</button><button class="btn" type="button" data-ts="yes">${T('Accepter')}</button>`
        : `<button class="btn ghost" type="button" data-ts="rm">${T('Retirer')}</button><button class="btn" type="button" data-close>${T('OK')}</button>`);
    };
    paint();
    api.wrap.addEventListener('error', ev => { const im = ev.target; if (im.tagName === 'IMG') { if (!im.dataset.fb) { im.dataset.fb = '1'; im.src = scImg(x.n); } else im.remove(); } }, true);
    api.wrap.addEventListener('click', async ev => {
      const q = ev.target.closest('[data-q]'), t = ev.target.closest('[data-ts]'); if (!q && !t) return;
      const cur = (side === 'me' ? TRC.s.me.give : (TRC.s.ot || {}).give || []).find(y => y.id === id); if (!cur) { api.close(); return; }
      haptic('tap');
      if (q) { const n = cur.q + Number(q.dataset.q); await trocDo({ op: 'set', id, q: n }); if (n <= 0) api.close(); else paint(); return; }
      const a = t.dataset.ts; api.close();
      if (a === 'yes') trocDo({ op: 'accept', id });
      else if (a === 'no' || a === 'rm') trocDo({ op: 'set', id, q: 0 });
      else if (a === 'unask') trocDo({ op: 'unask', id });
    });
  });
}
/** Carte en grand (visionneuse de l'appli), avec ses voisines du même côté. */
function trocZoom(list, x) {
  const items = list.map(y => ({ key: ownKey(y.n), name: trocName(y), small: trocSrc(y), lang: lineLang(y.g) || 'en', wl: '', plain: true, foil: lineFoil(y.g), extra: [y.q > 1 ? '× ' + y.q : '', lineFoil(y.g) ? T('Foil') + ' ✦' : '', y.u ? fmt(y.u, 'EUR') : ''].filter(Boolean).join(' · ') }));
  haptic('tap'); openCardViewer(items, Math.max(0, list.indexOf(x)));
}

/* ── Choisir ce que je donne : ma liste d'échange, sinon toute ma collection ──────────────────────────────────────────────── */
/** Une ligne par carte, une pastille par ligne (langue, édition, foil ✦) : touchée, un exemplaire de plus part dans « Tu donnes ». */
function trocRowHtml(it, kind) {
  const l0 = it.lines[0] ? lineLang(it.lines[0][0]) : '', dn = (l0 && frName(it.k, l0)) || it.dn || it.n, img = it.img || '';
  const tags = it.tags || '';
  const chips = it.lines.map(([g, q, u]) => {
    const l = lineLang(g), e = lineEd(g), fo = lineFoil(g), had = trocIn(kind === 'ask' ? (TRC.s.ot || {}).give : TRC.s.me.give, it.k, g), full = had >= q;
    return `<button class="trc-ln${had ? ' on' : ''}${fo ? ' fo' : ''}" type="button" data-g="${esc(g)}"${full ? ' disabled' : ''} aria-label="${esc((l ? (LANGS[l] || l) : fo ? '' : T('sans langue')) + (e ? ' ' + edLabel(e) : '') + (fo ? ' ' + T('Foil') : '') + ' · ' + (had ? had + '/' + q : '× ' + q))}">${l ? flag(l) : fo ? '' : `<span class="trc-nl">${T('sans langue')}</span>`}${e ? `<span>${esc(edLabel(e))}</span>` : ''}${fo ? '<i class="trc-lfo" aria-hidden="true">✦</i>' : ''}<b>${had ? had + '/' + q : '× ' + q}</b>${u ? `<small>${esc(fmt(u, 'EUR'))}</small>` : ''}</button>`;
  }).join('');
  return `<div class="crow trc-prow" data-k="${esc(it.k)}"><span class="thumb" style="--h:${hash32(it.k) % 360}">${esc((dn.trim()[0] || '?').toUpperCase())}${img ? `<img alt="" loading="lazy" decoding="async" src="${esc(img)}">` : ''}</span>
    <span class="row-main"><span class="row-name">${esc(dn)}</span>${tags || dn !== it.n ? `<span class="row-meta">${tags}${dn !== it.n ? `<span class="tag">${esc(it.n)}</span>` : ''}</span>` : ''}<span class="trc-lns">${chips}</span></span>${it.u ? `<span class="trc-pp">${esc(fmt(it.u, 'EUR'))}</span>` : ''}</div>`;
}
/** Feuille de choix commune (give, ask) : onglets, recherche (nom français ou anglais), liste par pages ; tap sur une pastille → onTap(item, ligne). */
function trocPicker({ title, sub, tabs, rows, onTap, kind }) {
  let tab = tabs[0].v, q = '', shown = TRC_PAGE, qt = 0;
  return openSheet(title, sub, api => {
    TRC.pick = api; api.wrap.classList.add('trc-pick');
    api.body.innerHTML = `${tabs.length > 1 ? '<div class="seg trc-tabs"></div>' : ''}<label class="trc-find"><svg class="i" aria-hidden="true"><use href="#i-search"/></svg><input type="search" enterkeyhint="search" autocomplete="off" spellcheck="false" placeholder="${T('Nom français ou anglais')}" aria-label="${T('Chercher une carte')}"></label><div class="trc-pl"></div>`;
    const box = $('.trc-pl', api.body), inp = $('input', api.body);
    api.paint = () => {
      if (!sheets.includes(api)) return;
      const all = rows(tab), nq = trocNorm(q.trim()), list = nq ? all.filter(it => trocNorm(it.n).includes(nq) || trocNorm(it.dn).includes(nq) || (it.fn && trocNorm(it.fn).includes(nq))) : all, sh = list.slice(0, shown);
      const y = api.body.scrollTop;
      box.innerHTML = sh.length ? `<div class="coll-list trc-plist">${sh.map(it => trocRowHtml(it, kind)).join('')}</div>${list.length > sh.length ? `<button class="btn ghost block coll-more" type="button" data-pk="more">${T('Afficher {n} de plus · {left} restantes', { n: nf0(Math.min(TRC_PAGE, list.length - sh.length)), left: nf0(list.length - sh.length) })}</button>` : ''}`
        : `<p class="hint listempty">${all.length ? T('Aucune carte ne correspond.') : tabs.find(t => t.v === tab).empty}</p>`;
      api.body.scrollTop = y;
    };
    if (tabs.length > 1) mountSeg($('.trc-tabs', api.body), tabs.map(t => ({ v: t.v, label: t.label, sub: t.sub })), tab, v => { tab = v; shown = TRC_PAGE; api.paint(); });
    inp.oninput = () => { clearTimeout(qt); qt = setTimeout(() => { q = inp.value; shown = TRC_PAGE; api.paint(); }, 120); };
    api.body.addEventListener('load', e => { if (e.target.tagName === 'IMG') e.target.classList.add('ok'); }, true);
    api.body.addEventListener('error', e => { if (e.target.tagName === 'IMG') e.target.remove(); }, true);
    api.body.addEventListener('click', async e => {
      if (e.target.closest('[data-pk="more"]')) { shown += TRC_PAGE; api.paint(); return; }
      const c = e.target.closest('.trc-ln'); if (!c || c.disabled) return;
      const row = c.closest('.trc-prow'), it = rows(tab).find(x => x.k === row.dataset.k); if (!it) return;
      haptic('tap'); c.disabled = true;
      const r = await onTap(it, c.dataset.g);
      if (r) { c.classList.remove('pop'); void c.offsetWidth; c.classList.add('pop'); }
      api.paint();
    });
    const close = api.close; api.close = () => { if (TRC.pick === api) TRC.pick = null; close(); };
    api.paint();
  });
}
function trocGiveSheet() {
  const st = trState(), meta = k => COLL.meta[k] || {};
  const item = (k, n, ls) => {      // une pastille par ligne sans emplacement ni détails (ils ne partent pas : trocMine) ; foil ou édition : son prix sur la pastille
    const by = new Map(); for (const [g, q] of ls) by.set(lineHead(g), (by.get(lineHead(g)) || 0) + q);
    const lines = [...by].map(([g, q]) => [g, q, lineFoil(g) || lineEd(g) ? trLinePx(k, g) || 0 : 0]), l0 = lines[0] ? lineLang(lines[0][0]) : '';
    return { k, n, dn: (l0 && frName(k, l0)) || n, fn: frOf(k), lines, img: collImage(k, l0, meta(k).im).src, u: trPrice(k) };
  };
  const list = st.have.map(x => item(x.k, x.n, x.lines));
  let all = null;
  trocPicker({
    title: T('Ce que tu donnes'), sub: T('Touche une langue pour en ajouter un exemplaire'), kind: 'give',
    tabs: [{ v: 'list', label: T('Ma liste d\'échange'), sub: nf0(list.length), empty: T('Aucun doublon dans ta liste d\'échange : cherche dans toute ta collection.') }, { v: 'all', label: T('Toute ma collection'), sub: nf0(collCount()), empty: T('Ta collection est vide.') }],
    rows: tab => (tab === 'list' ? list : (all = all || Object.entries(COLL.map).filter(([k, x]) => x && x.q > 0 && !BASIC_NAMES.has(k)).map(([k, x]) => item(k, x.n, collLines(x))).sort((a, b) => NAME_CMP(a.dn, b.dn)))),
    onTap: (it, g) => trocDo({ op: 'give', card: { ...trocMine(it.k, it.n, g) } }),
  });
}
/** Sa liste d'échange (lue sur le serveur, avec les prix de la session ; relue quand elle change). */
async function trocOtList() {
  const s = TRC.s; if (!s || !s.ot) return [];
  if (TRC.ot && TRC.ot.lv === s.ot.lv) return TRC.ot.list;
  const j = await trocCall(`/list?c=${s.c}&w=ot`);
  TRC.ot = { lv: j.lv, list: Array.isArray(j.list) ? j.list : [], cut: !!j.cut }; return TRC.ot.list;
}
async function trocAskSheet() {
  const t = Tasks.start(T('Liste de {name}', { name: trocWho() }));
  let L; try { L = await trocOtList(); } catch (e) { t.remove(); toast(trocErr(e.code)); return; }
  t.remove(); if (!TRC.s || !trocOpenSt(TRC.s)) return;
  const want = new Map(trState().want.map(x => [x.k, x])), by = new Map();
  for (const x of L) {
    const k = ownKey(x.n); let it = by.get(k);
    if (!it) by.set(k, it = { k, n: x.n, dn: trocName(x), fn: x.f || frOf(k), lines: [], img: trocSrc(x), u: x.u || 0, w: want.get(k) });
    it.lines.push([x.g, x.q, x.u || 0]); if (x.u && (!it.u || x.u < it.u)) it.u = x.u;
  }
  const rows = [...by.values()].map(it => Object.assign(it, { tags: it.w ? `<span class="tag accent">${T('tu la cherches × {n}', { n: it.w.q })}</span>` : '' })).sort((a, b) => (b.w ? 1 : 0) - (a.w ? 1 : 0) || NAME_CMP(a.dn, b.dn));
  const wanted = rows.filter(x => x.w);
  trocPicker({
    title: T('Demander à {name}', { name: trocWho() }), sub: T('Ses cartes à échanger · touche une langue pour en demander un exemplaire'), kind: 'ask',
    tabs: wanted.length ? [{ v: 'want', label: T('Tu les cherches'), sub: nf0(wanted.length), empty: '' }, { v: 'all', label: T('Toute sa liste'), sub: nf0(rows.length), empty: T('Sa liste d\'échange est vide.') }] : [{ v: 'all', label: '', empty: T('Sa liste d\'échange est vide.') }],
    rows: tab => (tab === 'want' ? wanted : rows),
    onTap: (it, g) => trocDo({ op: 'ask', card: { n: it.n, q: 1, g } }),
  });
}

/* ── « Équilibrer » : des cartes peu chères pour approcher 0 € d'écart (de ma liste, ou à lui demander) ─────────────────────── */
/** Choix glouton : les plus chères d'abord, tant qu'elles tiennent dans l'écart (à 5 % près, 0,50 € au moins) ; 12 cartes au plus. */
function trocFill(cands, gap, tol) {
  const picks = []; let rem = gap;
  for (const c of cands.filter(x => x.u > 0 && x.avail > 0).sort((a, b) => b.u - a.u)) {
    let n = 0; while (n < c.avail && c.u <= rem + tol && picks.length < 12) { rem -= c.u; n++; }
    if (n) picks.push({ ...c, q: n });
    if (rem <= tol || picks.length >= 12) break;
  }
  return { picks, rem };
}
async function trocBalance() {
  const s = TRC.s; if (!s || !s.ot) return;
  const get = trocSum(s.ot.give).v, give = trocSum(s.me.give).v, d = get - give, tol = Math.max(50, Math.round(Math.max(get, give) * 0.05));
  if (Math.abs(d) <= tol) { toast(T('Déjà équilibré')); return; }
  let cands = [];
  if (d > 0) {      // je reçois plus : de mes doublons, ce qui n'est pas déjà donné
    for (const x of trState().have) for (const [g, q] of x.lines) cands.push({ ...trocMine(x.k, x.n, g), k: x.k, u: trLinePx(x.k, g) || trPrice(x.k) || 0, avail: q - trocIn(s.me.give, x.k, g) });
  } else {          // je donne plus : de sa liste, ce qui n'est pas déjà de son côté
    let L; try { L = await trocOtList(); } catch (e) { toast(trocErr(e.code)); return; }
    cands = L.map(x => ({ n: x.n, g: x.g, i: x.i, f: x.f, fl: x.fl, k: ownKey(x.n), u: x.u || 0, avail: x.q - trocIn(s.ot.give, ownKey(x.n), x.g) }));
  }
  const { picks, rem } = trocFill(cands, Math.abs(d), tol);
  if (!picks.length) { toast(T('Rien d\'assez petit pour équilibrer')); return; }
  const sum = picks.reduce((t, x) => t + x.u * x.q, 0), mine = d > 0, name = esc(trocWho());
  openSheet(mine ? T('Équilibrer de ton côté') : T('Équilibrer : demander à {name}', { name: trocWho() }), T('Écart actuel : {v}', { v: fmt(Math.abs(d), 'EUR') }), api => {
    api.body.innerHTML = `<p class="hint">${mine ? T('Tu reçois plus que tu ne donnes : ces cartes de ta liste d\'échange comblent l\'écart.') : T('Tu donnes plus que tu ne reçois : demande ces cartes de sa liste ({name} accepte ou non).', { name })}</p>
      ${trocMiniList(picks.map(x => ({ ...x, id: '' })))}<p class="trc-eqs"><span>${T('Total proposé')}</span><b>${esc(fmt(sum, 'EUR'))}</b></p><p class="hint">${T('Écart restant : {v}', { v: fmt(Math.max(0, rem), 'EUR') })}</p>`;
    api.setFoot(`<button class="btn ghost" type="button" data-close>${T('Annuler')}</button><button class="btn" type="button" data-trc="eqgo">${mine ? TN(picks.length, 'Ajouter la carte', 'Ajouter les {n} cartes') : TN(picks.length, 'Demander la carte', 'Demander les {n} cartes')}</button>`);
    api.wrap.addEventListener('click', async e => {
      const b = e.target.closest('[data-trc="eqgo"]'); if (!b || b.disabled) return;
      b.disabled = true; haptic('tap');
      for (const x of picks) { const r = await trocDo({ op: mine ? 'give' : 'ask', card: { n: x.n, q: x.q, g: x.g, ...(x.f ? { f: x.f, fl: x.fl } : {}), ...(x.i ? { i: x.i } : {}), ...(x.u ? { u: x.u } : {}) } }); if (!r) break; }
      api.close();
    });
  });
}

/* ── Appliquer l'échange chez moi : retirer ce que je donne, ajouter ce que je reçois ───────────────────────────────────────── */
/** Retire q exemplaires de la carte k d'une collection (copie modifiée) : la ligne g d'abord, puis la même langue, puis le reste. Lignes retirées [[g, q]]. */
function trocDrop(m, k, g, q) {
  const cur = m[k]; if (!cur) return [];
  const lines = collLines(cur).map(e => e.slice()), l = lineLang(g), out = [];
  const h = lineHead(g), order = [...lines.filter(e => e[0] === g), ...lines.filter(e => e[0] !== g && lineHead(e[0]) === h), ...lines.filter(e => lineHead(e[0]) !== h && lineLang(e[0]) === l), ...lines.filter(e => lineLang(e[0]) !== l)];      // même édition rangée ailleurs avant une autre édition
  for (const e of order) { if (q <= 0) break; const t = Math.min(q, e[1]); if (t) { e[1] -= t; q -= t; out.push([e[0], t]); } }
  const next = collFromLines(cur, lines.filter(e => e[1] > 0)); if (next) m[k] = next; else delete m[k];
  return out;
}
const trocRecId = c => c + ':' + String(TRC.key || '').slice(0, 8);
function trocApply(s) {
  const id = trocRecId(s.c);
  if (TRC.applying) return;
  if (trocHist().some(h => h.id === id)) { if (!trocUndoable()) trocReset(); return; }      // déjà appliqué sur cet appareil (encore annulable : la session reste relevée)
  if (D.user && !COLL.live) { TRC.applying = true; setTimeout(() => { TRC.applying = false; if (TRC.c === s.c) trocApply(s); }, 1000); return; }      // collection du compte pas encore là (reprise au lancement)
  const giveL = s.me.give.filter(x => !x.r), getL = (s.ot ? s.ot.give : []).filter(x => !x.r), m = { ...COLL.map }, took = [];
  for (const x of giveL) { const k = ownKey(x.n); for (const [g, q] of trocDrop(m, k, x.g, x.q)) took.push({ k, n: x.n, g, q }); }
  const add = getL.map(x => ({ k: ownKey(x.n), n: x.n, q: x.q, l: lineHead(x.g) }));
  COLL.map = mergeColl(m, add, 'add');
  const wd = []; let wch = false;      // souhaits d'avant (rendus si l'échange est annulé)
  for (const x of getL) { const k = ownKey(x.n), w = TR.wish[k]; if (!w) continue; if (!wd.some(y => y[0] === k)) wd.push([k, w]); const q = w.q - x.q; if (q > 0) TR.wish[k] = { ...w, q }; else delete TR.wish[k]; wch = true; }      // souhait comblé (en partie)
  collChanged(); collEnrich(); if (wch) trChanged();
  if (typeof prgTrade === 'function') prgTrade();      // niveau et badges (progress.js)
  const sg = trocSum(getL), sv = trocSum(giveL), row = x => [x.n, x.g || '', x.q, x.u || 0, x.i || ''];
  const rec = { id, c: s.c, at: Date.now(), who: (s.ot && s.ot.n) || '', give: giveL.slice(0, 100).map(row), get: getL.slice(0, 100).map(row), vg: sv.v, vr: sg.v, qg: sv.q, qr: sg.q, rv: { took, add, wd } };      // rv : de quoi le défaire (annulé des deux côtés, même après un redémarrage)
  TRC.hist = [rec, ...trocHist().filter(h => h.id !== id)]; trocHistSave();
  TRC.undo = { c: s.c, id, until: Date.now() + (Number(s.ut) || 0) };      // annulable des deux côtés tant que le serveur le permet (ut) : la session reste relevée (trocPoll)
  trocSaveCur(); trocDo({ op: 'got' }); trocPollSoon();
  haptic('ok');
  toast(T('Échange appliqué : {give}, {get}', { give: TN(sv.q, '{n} carte donnée', '{n} cartes données'), get: TN(sg.q, '{n} reçue', '{n} reçues') }));
}
/** Défait chez moi un échange appliqué (rec.rv : retiré, ajouté, souhaits d'avant) ; l'échange reste dans l'historique, marqué annulé (u = 2 : des deux côtés). Vrai si c'était à faire. */
function trocUndo(rec) {
  const rv = rec && rec.rv; if (!rv || rec.u) return false;
  const m = { ...COLL.map };
  for (const x of rv.add) trocDrop(m, x.k, x.l, x.q);
  COLL.map = mergeColl(m, rv.took.map(t => ({ k: t.k, n: t.n, q: t.q, l: t.g })), 'add');
  for (const [k, w] of rv.wd || []) TR.wish[k] = w;
  collChanged(); trChanged();
  rec.u = 2; trocHistSave();
  return true;
}
/** Annulé des deux côtés (s.ud) : défait ici (une fois), puis la session est oubliée ; l'écran de fin le dit. id : l'échange dans l'historique (clé de siège déjà oubliée). */
function trocUndone(s, id = trocRecId(s.c)) {
  const rec = trocHist().find(h => h.id === id);
  if (trocUndo(rec)) { haptic('ok'); toast(T('Échange annulé des deux côtés : ta collection est revenue comme avant')); }
  if (TRC.c === s.c) trocReset();
}
/** Fenêtre fermée, ou appli relancée, avec ma demande d'annulation en attente : retirée (plus rien ne la suit ici) ; acceptée entre-temps : défaite ici aussi. */
function trocUnDrop(s) {
  const id = trocRecId(s.c);
  trocCall('/op', { method: 'POST', body: { c: s.c, op: 'undo', on: false } }).catch(e => { if (e.s && e.s.ud) trocUndone(e.s, id); });      // clé de siège lue tout de suite : la session peut être oubliée juste après
}
/** « Annuler l'échange » (écran de fin) : proposé à l'autre joueur ; rien ne change tant qu'il n'a pas accepté. */
function trocUndoAsk() {
  const name = esc(trocWho());
  openSheet(T('Annuler l\'échange ?'), null, api => {
    api.body.innerHTML = `<p class="hint">${T('{name} doit accepter : vos deux collections reviendront alors comme avant. Sans sa réponse, rien ne change.', { name })}</p>`;
    api.setFoot(`<button class="btn ghost" type="button" data-close>${T('Garder l\'échange')}</button><button class="btn danger" type="button" data-trc="unask">${T('Proposer l\'annulation')}</button>`);
    api.wrap.addEventListener('click', e => { if (!e.target.closest('[data-trc="unask"]')) return; api.close(); haptic('tap'); if (trocUndoable()) trocDo({ op: 'undo', on: true }); });
  });
}

/* ── Mes échanges (historique, sur cet appareil) ─────────────────────────────────────────────────────────────────────────── */
function trocHist() {
  if (!TRC.hist) { try { const a = JSON.parse(localStorage.getItem(TRC_HIST) || '[]'); TRC.hist = Array.isArray(a) ? a.filter(x => x && typeof x.id === 'string' && Array.isArray(x.give) && Array.isArray(x.get)) : []; } catch (e) { TRC.hist = []; } }
  return TRC.hist;
}
function trocHistSave() {
  let h = trocHist().slice(0, TRC_HIST_MAX);
  for (;;) {
    try { if (h.length) localStorage.setItem(TRC_HIST, JSON.stringify(h)); else localStorage.removeItem(TRC_HIST); TRC.hist = h; return true; }
    catch (e) { if (h.length <= 1) { TRC.hist = h; return false; } h = h.slice(0, -1); }      // stockage plein : les plus anciens sont oubliés
  }
}
const trocRecRows = a => a.map(([n, g, q, u, i]) => ({ id: '', n: String(n), g: String(g || ''), q: Number(q) || 1, u: Number(u) || 0, i: typeof i === 'string' ? i : '' }));
const trocWhen = at => new Date(at).toLocaleDateString(LOC(), { day: 'numeric', month: 'short', year: 'numeric' });
/** Échange annulé : des deux côtés (u = 2), ou sur cet appareil seulement (u = 1 : « Annuler » d'avant, d'un seul côté). */
const trocUnLab = r => (r.u === 2 ? T('annulé des deux côtés') : T('annulé sur cet appareil'));
function trocHistSheet() {
  openSheet(T('Mes échanges'), T('Gardés sur cet appareil'), api => {
    const paint = () => {
      const list = trocHist();
      api.body.innerHTML = list.length ? `<div class="trc-hl">${list.map(r => `<button type="button" class="trc-h" data-id="${esc(r.id)}"><span class="trc-ht"><b>${esc(r.who || T('Joueur sans pseudo'))}</b><small>${esc(trocWhen(r.at))}${r.u ? ' · ' + trocUnLab(r) : ''}</small></span>
          <span class="trc-hv"><span class="give">− ${nf0(r.qg)}${r.vg ? ' · ' + esc(fmt(r.vg, 'EUR')) : ''}</span><span class="get">+ ${nf0(r.qr)}${r.vr ? ' · ' + esc(fmt(r.vr, 'EUR')) : ''}</span></span><svg class="i" aria-hidden="true"><use href="#i-chev"/></svg></button>`).join('')}</div>`
        : `<p class="hint">${T('Aucun échange pour l\'instant.')}</p>`;
    };
    paint();
    api.body.addEventListener('click', e => { const b = e.target.closest('.trc-h'), r = b && trocHist().find(x => x.id === b.dataset.id); if (r) { haptic('tap'); trocHistOpen(r, () => { if (sheets.includes(api)) paint(); }); } });
  });
}
function trocHistOpen(r, after) {
  openSheet(T('Échange avec {name}', { name: r.who || T('Joueur sans pseudo') }), trocWhen(r.at) + (r.u ? ' · ' + trocUnLab(r) : ''), api => {
    api.wrap.classList.add('trc-hs');
    api.body.innerHTML = `<div class="trc-col get"><h3>${T('Tu as reçu')}<span>${r.vr ? esc(fmt(r.vr, 'EUR')) : ''}</span></h3>${trocMiniList(trocRecRows(r.get))}</div>
      <div class="trc-col give"><h3>${T('Tu as donné')}<span>${r.vg ? esc(fmt(r.vg, 'EUR')) : ''}</span></h3>${trocMiniList(trocRecRows(r.give))}</div>
      <p class="hint">${T('Valeurs au moment de l\'échange (tendance Cardmarket).')}</p><button class="link-btn link-inline trc-hdel" type="button" data-trc="hdel">${T('Supprimer de l\'historique')}</button>`;
    api.wrap.addEventListener('error', e => { const im = e.target; if (im.tagName === 'IMG') { if (im.dataset.n && !im.dataset.fb) { im.dataset.fb = '1'; im.src = scImg(im.dataset.n); } else im.remove(); } }, true);
    api.wrap.addEventListener('click', e => {
      if (!e.target.closest('[data-trc="hdel"]')) return;
      const was = trocHist(); TRC.hist = was.filter(x => x !== r); trocHistSave(); api.close(); if (after) after();
      toast(T('Échange retiré de l\'historique'), { label: T('Annuler'), fn: () => { TRC.hist = was; trocHistSave(); if (after) after(); } });
    });
  });
}

/* ── Entrée « Échange en direct » (onglet Échange) ───────────────────────────────────────────────────────────────────────── */
/** Ligne discrète sous les actions du lien (share.js › trShareBoxHtml) ; rien sans le serveur ou sans compte. */
function trocBoxHtml() {
  if (!trocOn() || !D.user) return '';
  return `<button class="trc-entry" type="button" data-act="trlive">${TRC_SWAP}<span class="trc-et"><b>${T('Échange en direct')}</b><small>${T('Face à face, chacun sur son téléphone')}</small></span><svg class="i" aria-hidden="true"><use href="#i-chev"/></svg></button>`;
}
/** Feuille « Échange en direct » : créer (QR code et code), « J'ai un code », « Mes échanges ». */
function trocEntry() {
  if (typeof streamOn === 'function' && streamOn()) { toast(T('Échange en direct indisponible en mode streamer')); return; }
  if (TRC.c && TRC.s && trocOpenSt(TRC.s)) { trocOpenWin(); return; }      // déjà dans un échange : on y retourne
  const nh = trocHist().length;
  openSheet(T('Échange en direct'), T('Face à face, chacun sur son téléphone'), api => {
    api.wrap.classList.add('trc-entry-sheet');
    api.body.innerHTML = `<p class="hint">${T('Vous choisissez chacun ce que vous donnez et ce que vous voulez de l\'autre, avec la valeur de chaque côté. Rien ne change dans vos collections tant que vous n\'avez pas validé tous les deux.')}</p>
      <button class="btn block trc-new" type="button" data-trc="new"><svg class="i" aria-hidden="true"><use href="#i-qr"/></svg>${T('Créer l\'échange')}</button>
      <div class="trc-join"><label class="label" for="trcCode">${T('J\'ai un code')}</label><div class="trc-cin"><input id="trcCode" type="text" inputmode="text" autocomplete="off" autocapitalize="characters" spellcheck="false" maxlength="8" placeholder="ABC 234" enterkeyhint="go"><button class="btn ghost" type="button" data-trc="join">${T('Rejoindre')}</button></div>
        <p class="hint">${T('Ou scanne son QR code avec l\'appareil photo de ton téléphone.')}</p></div>
      ${nh ? `<button type="button" class="trc-hrow" data-trc="hist"><span>${T('Mes échanges')}</span><em>${nf0(nh)}</em><svg class="i" aria-hidden="true"><use href="#i-chev"/></svg></button>` : ''}`;
    const inp = $('#trcCode', api.body);
    inp.oninput = () => { const v = inp.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6); const f = v.length > 3 ? v.slice(0, 3) + ' ' + v.slice(3) : v; if (inp.value !== f) inp.value = f; };
    const join = () => { const c = trocCodeOf(inp.value); if (!c) { toast(T('Code invalide : 6 lettres ou chiffres')); inp.focus(); return; } api.close(); trocJoinCode(c); };
    inp.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); join(); } };
    api.wrap.addEventListener('click', e => {
      const b = e.target.closest('[data-trc]'); if (!b) return;
      haptic('tap');
      if (b.dataset.trc === 'new') { api.close(); trocHost(); }
      else if (b.dataset.trc === 'join') join();
      else if (b.dataset.trc === 'hist') trocHistSheet();
    });
  });
}

// Aide (help.js) : une question de plus, juste après celle des amis ; retirée avec ce fichier.
if (typeof HELP_QA !== 'undefined') {
  const i = HELP_QA.findIndex(q => q[0] === 'Comment ajouter un ami ?');
  HELP_QA.splice(i < 0 ? HELP_QA.length : i + 1, 0, ['Comment échanger en face à face ?', 'Dans <b>Échange</b>, touche <b>Échange en direct</b> : montre le QR code à l\'autre joueur (ou donne-lui le code) ; depuis la page d\'un ami, tu peux aussi l\'inviter à distance. Chacun choisit ce qu\'il donne, demande des cartes de la liste de l\'autre et voit la valeur des deux côtés. Prêts tous les deux, vous validez : vos deux collections sont mises à jour. Tes échanges restent dans « Mes échanges ».']);
}
