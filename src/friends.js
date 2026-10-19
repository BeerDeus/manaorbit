/* ── friends.js : amis ─────────────────────────────────────────────────────────────────────────────────────────────────────
   · Ajout : sur la liste d'échange publique d'un autre joueur (lien ou QR code, share.js › openPublicTrade), bouton « Ajouter en ami » à côté de son nom.
     Déconnecté : connexion d'abord ; demande partie : « Demande envoyée » ; déjà amis : « Ami » ouvre sa page ; il t'a fait une demande : « Accepter ».
   · « Compte et réglages › Mon compte › Amis » (me.js) : nombre d'amis, ou « 2 demandes » en couleur ; point sur le bouton du compte tant qu'une demande
     attend (jamais pendant une session en mode streamer : streamOn()). La feuille : demandes reçues (Accepter, Refuser), amis (cartes pour toi, à lui
     proposer), demandes envoyées (Annuler), « Partager ma collection » (coupé par défaut), notifications des amis.
   · Page d'un ami : sa liste d'échange (l'écran du lien public, « Pour toi » compris), ses decks et sa collection (s'il l'autorise) en feuilles,
     « Retirer de mes amis ». Toujours à jour : lue sur le serveur, même sans lien public.
   · Accueil, « Pour toi » (home.js) : les amis qui ont le plus de cartes pour toi, puis les listes ouvertes par un lien.
   · Échange en direct (troc.js) : « Échange en direct » sur la page d'un ami l'y invite (notification de son compte) ; les invitations qui t'attendent
     arrivent avec la liste (tr) : toast « Rejoindre » et rubrique en tête de la feuille Amis.
   · Ce que voient les amis : envoyé par les appareils du compte quand ça change (différé, seulement ce qui a changé, seulement tant qu'il y a un ami ou une
     demande envoyée, jamais avant que la collection du compte soit lue) : liste d'échange (trPayload, comme le lien), decks enregistrés, collection si partagée.
   · Notifications : un appareil aux notifications actives s'enregistre pour le compte (une fois par semaine, ou quand son jeton change ; retiré à la
     déconnexion) : demandes, acceptations, « un ami a une carte que tu cherches ». Toucher : ./?amis=1 (feuille) ou ./?ami=<id> (page de l'ami),
     voir push.js › pushOpen et app.js › handleLaunch.
   Tout passe par le serveur (proxy.mjs › /api/friends, jeton Firebase) : aucune règle Firestore à publier. Serveur sans amis (/__ping amis: false),
   hors ligne, déconnecté : rien n'apparaît, ou un message court. Rien au démarrage : la liste est lue quelques secondes après la connexion. */
const AM_KEY = 'deckdeal:amis:v1', AM_TTL = 4 * 60e3, AM_DEV_TTL = 7 * 86400e3, AM_PART = 990000, AM_SYNC = 20000, AM_PAGE = 120;
const AM = { uid: '', l: null, at: 0, run: null, t: 0, dt: 0, vt: 0, busy: false, again: false, sig: {}, dev: '', devSig: '', devAt: 0, push: true, pic: null, sheet: null, parts: new Map(), pubCheck: null, err: '', loaded: false };
const AM_TAG_RE = /^[0-9a-f]{64}$/;
const AM_ADD_ICON = '<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><circle cx="10" cy="8" r="3.6"/><path d="M3.5 19.5c.8-3.4 3.4-5.3 6.5-5.3 1.6 0 3 .5 4.1 1.4M18.5 13.5v6M15.5 16.5h6"/></svg>';

/* ── État : liste lue sur le serveur, gardée sur l'appareil (accueil affiché tout de suite au lancement suivant) ───────────── */
const amOn = () => !!(CTX.proxy && CTX.amis && D.user);
/** Session en mode streamer (autre fonction, streamOn) : ni point ni toast qui surgissent. */
const amQuiet = () => typeof streamOn === 'function' && !!streamOn();
const amOffline = () => typeof navigator !== 'undefined' && navigator.onLine === false;
const amStr = (v, n) => (typeof v === 'string' ? v.replace(/[\p{Cc}\p{Cf}<>]/gu, '').replace(/\s+/g, ' ').trim().slice(0, n) : '');
const amPicOk = v => typeof v === 'string' && v.length <= 8000 && /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(v);
const amNum = v => Math.max(0, Math.floor(Number(v)) || 0);
const amName = x => (x && x.n) || T('Joueur sans pseudo');
function amWho(x) { return x && AM_TAG_RE.test(x.id) ? { id: x.id, n: amStr(x.n, 30), ...(amPicOk(x.p) ? { p: x.p } : {}), at: amNum(x.at) } : null; }
/** Réponse du serveur (ou copie de l'appareil) relue : rien d'autre que ces champs, bornés. */
function amTidy(j) {
  if (!j || typeof j !== 'object') return null;
  const list = a => (Array.isArray(a) ? a.slice(0, 400).map(amWho).filter(Boolean) : []), me = j.me && typeof j.me === 'object' ? j.me : {}, has = me.has && typeof me.has === 'object' ? me.has : {};
  const friends = (Array.isArray(j.friends) ? j.friends : []).slice(0, 400).map(x => { const w = amWho(x); return w && { ...w, m: amNum(x.m), g: amNum(x.g), s: typeof x.s === 'string' && SHARE_ID_RE.test(x.s) ? x.s : '', c: x.c ? 1 : 0, u: amNum(x.u), nd: amNum(x.nd), nc: amNum(x.nc) }; }).filter(Boolean);
  const tr = (Array.isArray(j.tr) ? j.tr : []).slice(0, 5).filter(x => x && /^[A-HJKMNP-Z2-9]{6}$/.test(x.c)).map(x => ({ c: x.c, n: amStr(x.n, 30), ...(amPicOk(x.p) ? { p: x.p } : {}), at: amNum(x.at) }));      // invitations à un échange en direct (troc.js)
  return { friends, inc: list(j.inc), out: list(j.out), me: { c: me.c ? 1 : 0, dev: amNum(me.dev), has: { t: amNum(has.t), d: amNum(has.d), c: amNum(has.c) } }, need: !!j.need, max: amNum(j.max) || 200, tr };
}
/** Copie de l'appareil (relue seulement si elle a changé : l'accueil la demande à chaque repeinte avant la connexion). */
const amLsMemo = { raw: null, o: {} };
function amLs() {
  try { const raw = localStorage.getItem(AM_KEY) || 'null'; if (raw !== amLsMemo.raw) { const o = JSON.parse(raw); amLsMemo.raw = raw; amLsMemo.o = o && typeof o === 'object' ? o : {}; } return amLsMemo.o; }
  catch (e) { return {}; }
}
function amLoad() {
  const o = amLs(), same = !!AM.uid && o.uid === AM.uid;
  AM.l = same ? amTidy(o.l) : null; AM.at = 0; AM.err = ''; if (AM.l) AM.l.tr = [];      // invitations à un échange : seulement celles du serveur, jamais une copie ancienne
  AM.sig = same && o.sig && typeof o.sig === 'object' ? o.sig : {}; AM.dev = same && typeof o.dev === 'string' ? o.dev : '';
  AM.devSig = same ? String(o.devSig || '') : ''; AM.devAt = same ? amNum(o.devAt) : 0; AM.push = o.push !== false; AM.parts.clear(); AM.loaded = true;
}
function amStore() { try { localStorage.setItem(AM_KEY, JSON.stringify({ uid: AM.uid, l: AM.l, sig: AM.sig, dev: AM.dev, devSig: AM.devSig, devAt: AM.devAt, push: AM.push })); } catch (e) { /* stockage plein */ } }
/** Cet appareil est enregistré pour les notifications des amis : son abonnement push ne doit pas être coupé avec la fin de recherche ou les alertes (push.js, alerts.js). */
function amHoldsPush() { const o = AM.loaded ? AM : amLs(); return !!(o.dev && o.push !== false); }
const amFriend = id => (AM.l ? AM.l.friends.find(f => f.id === id) : null) || null;
/** Ce qui change l'affichage de « Compte et réglages » (me.js › meSigNow). */
const amSig = () => (amOn() && AM.l ? AM.l.friends.length + '/' + AM.l.inc.length : '-');

/** Appel de /api/friends avec le jeton Firebase du compte ; erreur : { code: 'net' | code du serveur, status }. */
async function amCall(path, { method = 'GET', body, params } = {}) {
  const u = D.user; if (!u) throw Object.assign(new Error('déconnecté'), { code: 'auth_required' });
  const go = async force => {
    let tok = ''; try { tok = await u.getIdToken(force); } catch (e) { throw Object.assign(new Error('jeton'), { code: 'net' }); }
    let r;
    try { r = await fetch('api/friends' + path + (params ? '?' + new URLSearchParams(params) : ''), { method, cache: 'no-store', headers: { Accept: 'application/json', 'x-firebase-token': tok, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined }); }
    catch (e) { throw Object.assign(new Error('réseau'), { code: 'net' }); }
    const j = await r.json().catch(() => null);
    if (!r.ok) throw Object.assign(new Error((j && j.message) || 'HTTP ' + r.status), { code: (j && j.error) || (r.status === 413 ? 'too_large' : 'http'), status: r.status });
    return j || {};
  };
  try { return await go(false); } catch (e) { if (e.code === 'token_expired') return go(true); throw e; }
}
function amErrText(code) {
  return code === 'net' ? T('Hors ligne : réessaie une fois connecté')
    : code === 'max' ? T('Liste d\'amis pleine ({n} au plus).', { n: (AM.l && AM.l.max) || 200 })
    : code === 'full' ? T('Demande impossible pour l\'instant : sa liste d\'amis est pleine.')
    : code === 'out_full' ? T('Trop de demandes en attente : annules-en une.')
    : code === 'rate' || code === 'rate_limited' ? T('Trop de demandes pour aujourd\'hui : réessaie demain.')
    : code === 'share_gone' ? T('Ce lien ne marche plus.')
    : code === 'not_friend' ? T('Vous n\'êtes plus amis.')
    : code === 'friends_disabled' ? T('Amis indisponibles sur ce serveur pour l\'instant.')
    : T('Amis injoignables : réessaie dans un moment.');
}

/* ── Connexion, lecture de la liste ──────────────────────────────────────────────────────────────────────────────────────── */
/** Changement de compte (decks.js › onUser) : liste de l'appareil pour ce compte, relue quelques secondes plus tard. */
function amUser(user) {
  const uid = user ? user.uid : '';
  if (uid !== AM.uid || !AM.loaded) { AM.uid = uid; amLoad(); clearTimeout(AM.dt); clearTimeout(AM.vt); }
  amPaint();
  if (uid) amSoon(2500);
  if (AM.pubCheck) AM.pubCheck();      // liste d'échange d'un autre ouverte : son bouton suit la connexion
}
function amSoon(ms = 800) { clearTimeout(AM.t); AM.t = setTimeout(() => amRefresh(), ms); }
/** Relit la liste (au plus toutes les 4 min sauf force), puis : point, fiches, accueil ; appareil, profil et parties envoyés si besoin. */
function amRefresh(force) {
  if (!amOn()) { amPaint(); return Promise.resolve(null); }
  if (AM.run) return AM.run;
  if ((!force && AM.l && Date.now() - AM.at < AM_TTL) || amOffline()) return Promise.resolve(AM.l);
  const uid = D.uid;
  AM.run = (async () => {
    try {
      const l = amTidy(await amCall(''));
      if (D.uid !== uid) return null;
      if (!l.need) { delete AM.sig.t; delete AM.sig.d; delete AM.sig.c; }      // plus d'ami : le serveur a effacé ses copies, tout repartira au prochain
      AM.l = l; AM.at = Date.now(); AM.err = ''; amStore(); amPaint(); amAfter();
      if (typeof trocInvites === 'function') trocInvites(l.tr);      // un ami t'invite à un échange en direct : toast « Rejoindre »
      return l;
    } catch (e) { AM.err = e.code || 'net'; amPaint(); return AM.l; }
    finally { AM.run = null; }
  })();
  return AM.run;
}
function amAfter() {
  const l = AM.l; if (!l) return;
  amDevSoon(1200);
  if (l.friends.length || l.inc.length || l.out.length) amMe().catch(() => {});      // pseudo et photo à jour chez ceux qui le voient
  if (l.need) amDataSoon(4000);
}
/** Point du bouton du compte, fiche « Compte et réglages », feuille Amis, accueil. */
function amPaint() {
  amDot();
  if (typeof meSoon === 'function' && typeof ME !== 'undefined' && ME.api) meSoon();
  if (AM.sheet && AM.sheet.paint) AM.sheet.paint();
  homeSoon();
}
function amDot() {
  const b = typeof document !== 'undefined' && document.getElementById('btnAccount'); if (!b) return;
  const n = amOn() && AM.l ? AM.l.inc.length : 0, on = !!n && !amQuiet(), base = (b.getAttribute('aria-label') || '').replace(/ — .*$/, '');
  b.dataset.dot = on ? '1' : '0';
  b.setAttribute('aria-label', on ? base + ' — ' + TN(n, '{n} demande d\'ami', '{n} demandes d\'ami') : base);      // le point dit aussi ce qu'il veut dire
}
/** Ligne « Amis » de « Compte et réglages › Mon compte » (vide si le serveur n'a pas les amis). */
function amMeRow() {
  if (!amOn()) return '';
  const l = AM.l, inc = l ? l.inc.length : 0, n = l ? l.friends.length : 0;
  return meRow('amis', T('Amis'), inc ? `<span class="am-hot">${esc(TN(inc, '{n} demande', '{n} demandes'))}</span>` : n ? esc(nf0(n)) : '', false, 'meAmis');
}
/** Accueil, « Pour toi » : jusqu'à 3 amis, ceux qui ont le plus de cartes pour toi d'abord. Avant la connexion (session gardée) : la liste de l'appareil. */
function amHome() {
  if (CTX.proxy && !CTX.amis) return [];
  let l = AM.uid ? AM.l : null;
  if (!AM.uid && D.hint && !D.authReady) { const o = amLs(); if (o.l && !o.t) o.t = amTidy(o.l); l = o.t || null; }
  return l ? l.friends.slice().sort((a, b) => b.m - a.m || a.n.localeCompare(b.n)).slice(0, 3) : [];
}

/* ── Profil, appareil, parties envoyées ─────────────────────────────────────────────────────────────────────────────── */
/** Miniature (64 px) de la photo du profil : seule image envoyée aux amis (quelques Ko). */
function amThumb(src) {
  return new Promise((ok, ko) => {
    const i = new Image();
    i.onload = () => { try { const c = document.createElement('canvas'); c.width = c.height = 64; c.getContext('2d').drawImage(i, 0, 0, 64, 64); let d = c.toDataURL('image/jpeg', 0.72); if (d.length > 8000) d = c.toDataURL('image/jpeg', 0.5); ok(amPicOk(d) ? d : ''); } catch (e) { ko(e); } };
    i.onerror = ko; i.src = src;
  });
}
/** Pseudo, miniature (photo choisie dans le profil, jamais celle de Google), langue des notifications. */
async function amProf() {
  const src = PROF.photo || '';
  if (!AM.pic || AM.pic.src !== src) AM.pic = { src, p: src ? await amThumb(src).catch(() => '') : '' };
  return { n: PROF.name || '', p: AM.pic.p, l: I18N.lang };
}
async function amMe() {
  const b = { ...(await amProf()), s: TR.share || '' }, sig = String(hash32(JSON.stringify(b)));
  if (AM.sig.me === sig || !amOn()) return;
  await amCall('/me', { method: 'PUT', body: b }); AM.sig.me = sig; amStore();
}
function amDevSoon(ms = 1500) { clearTimeout(AM.vt); AM.vt = setTimeout(() => amDev().catch(() => {}), ms); }
/** Appareil aux notifications actives : enregistré pour le compte (jeton FCM de l'appli, abonnement Web Push ailleurs). Notifications des amis coupées : retiré. */
async function amDev(force) {
  if (!amOn()) return;
  if (!AM.push) { if (AM.dev) { await amCall('/me', { method: 'PUT', body: { off: AM.dev } }); AM.dev = ''; AM.devSig = ''; amStore(); } return; }
  if (!(CTX.vapid || CTX.fcm) || await pushState() !== 'on') return;
  const sub = await pushTarget(); if (!sub) return;
  const sig = String(hash32(JSON.stringify(sub) + '|' + I18N.lang + '|' + D.uid));
  if (!force && sig === AM.devSig && AM.dev && Date.now() - AM.devAt < AM_DEV_TTL) return;
  const l = AM.l, known = !!(l && (l.friends.length || l.inc.length || l.out.length));      // pseudo et photo seulement pour qui a déjà des amis ou des demandes
  const r = await amCall('/me', { method: 'PUT', body: { dev: sub, l: I18N.lang, ...(known ? await amProf() : {}) } });
  if (AM.dev && r.dk && r.dk !== AM.dev) amCall('/me', { method: 'PUT', body: { off: AM.dev } }).catch(() => {});      // jeton renouvelé : l'ancien ne doit plus rien recevoir
  AM.dev = r.dk || ''; AM.devSig = sig; AM.devAt = Date.now(); amStore();
}
/** Déconnexion, effacement de l'appareil : cet appareil ne reçoit plus les notifications du compte. Jamais bloquant. */
async function amOut() {
  if (AM.dev && D.user && CTX.amis) { try { await Promise.race([amCall('/me', { method: 'PUT', body: { off: AM.dev } }), sleep(2500)]); } catch (e) { /* hors ligne : le serveur retirera la cible à son premier refus */ } }
  AM.dev = ''; AM.devSig = ''; AM.l = null; AM.sig = {}; amStore();
}
/** Suppression du compte (decks.js) : retiré de chez ses amis, ses données effacées du serveur. Lève une erreur si le serveur est injoignable alors que le compte y a des données. */
async function amWipe() {
  if (!D.user || !CTX.proxy || !CTX.amis) return;
  const had = !!(AM.dev || (AM.l && (AM.l.friends.length || AM.l.inc.length || AM.l.out.length || AM.l.me.dev)));
  try { await Promise.race([amCall('/me', { method: 'DELETE' }), sleep(10000).then(() => { throw Object.assign(new Error('lent'), { code: 'net' }); })]); }
  catch (e) { if (had && e.code !== 'friends_disabled') throw e; }
  AM.dev = ''; AM.devSig = ''; AM.l = null; AM.sig = {}; amStore();
}
const amBytes = s => new TextEncoder().encode(s).length;
/** Contenu d'une partie : t liste d'échange (celle du lien public), d decks enregistrés, c collection [[nom, exemplaires, langue ?]]. k : nombre affiché chez les amis. */
function amPartOf(p) {
  if (p === 't') { const b = trPayload(); return { j: JSON.stringify(b), k: b.have.length }; }
  if (p === 'd') {
    const out = []; let size = 2;
    for (const d of allDecks()) { const o = { n: String(d.name || 'Deck').slice(0, 120), t: String(d.text || '').slice(0, 60000) }, s = JSON.stringify(o).length + 1; if (size + s > AM_PART || out.length >= 150) break; out.push(o); size += s; }
    return { j: JSON.stringify(out), k: out.length };
  }
  const rows = Object.values(COLL.map).map(x => (x.l && x.l !== 'en' ? [x.n, x.q, x.l] : [x.n, x.q])).sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  let j = JSON.stringify(rows);
  while (j.length > AM_PART && rows.length > 100) { rows.length = Math.floor(rows.length * 0.9); j = JSON.stringify(rows); }
  return { j, k: rows.length };
}
function amDataSoon(ms = AM_SYNC) { if (!AM.uid || !AM.l || !AM.l.need) return; clearTimeout(AM.dt); AM.dt = setTimeout(() => amData(), ms); }
/** Envoie ce qui a changé (liste d'échange, decks, collection si partagée). Pas avant que la collection du compte soit lue : une liste vide puis pleine
    passerait pour « vient d'ajouter » toutes ses cartes chez les amis. */
async function amData() {
  if (!amOn() || !AM.l || !AM.l.need || amOffline() || (typeof acctHeld === 'function' && acctHeld(D.uid))) return;
  if (!COLL.live) { clearTimeout(AM.dt); AM.dt = setTimeout(() => amData(), 8000); return; }
  if (AM.busy) { AM.again = true; return; }
  AM.busy = true; AM.again = false; const uid = D.uid;
  try {
    await amMe();
    for (const p of ['t', 'd', 'c']) {
      if (p === 'c' && !AM.l.me.c) continue;
      const { j, k } = amPartOf(p), sig = hash32(j) + ':' + j.length;
      if (AM.sig[p] === sig && AM.l.me.has[p]) continue;
      if (amBytes(j) > 1e6) { AM.sig[p] = sig; continue; }      // trop gros même réduit (cas extrême) : gardée sur l'appareil
      await amCall('/me', { method: 'PUT', body: { part: p, j, k } });
      if (D.uid !== uid) return;
      AM.sig[p] = sig; AM.l.me.has[p] = Date.now(); amStore();
    }
  } catch (e) { if (e.code === 'net' || e.status >= 500 || e.status === 429) { clearTimeout(AM.dt); AM.dt = setTimeout(() => amData(), 60000); } }      // hors ligne, serveur occupé : nouvel essai dans une minute
  finally { AM.busy = false; if (AM.again) amDataSoon(2000); }
}

/* ── Feuille « Amis » (Compte et réglages › Mon compte) ─────────────────────────────────────────────────────────────── */
const amAv = (x, cls = 'am-av') => `<span class="${cls}" style="--h:${hash32(x.id) % 360}" aria-hidden="true">${esc((amName(x).trim()[0] || '?').toUpperCase())}${x.p ? `<img alt="" src="${esc(x.p)}">` : ''}</span>`;
function amFriendSub(x) {
  if (!x.u && !x.s) return T('liste pas encore reçue');
  return [x.m ? TN(x.m, '{n} carte pour toi', '{n} cartes pour toi') : T('rien pour toi pour l\'instant'), x.g ? TN(x.g, '{n} à lui proposer', '{n} à lui proposer') : ''].filter(Boolean).join(' · ');
}
function amSheet() {
  if (!D.user) { openAccount(); return; }
  if (!amOn()) { toast(amErrText('friends_disabled')); return; }
  if (AM.sheet && sheets.includes(AM.sheet)) return;
  openSheet(T('Amis'), null, api => {
    AM.sheet = api; api.wrap.classList.add('am-sheet');
    api.paint = () => amSheetPaint(api);
    api.paint(); amRefresh(true);
    api.body.addEventListener('click', e => amSheetClick(e, api));
    api.body.addEventListener('change', e => { if (e.target.id === 'amColl') amSetColl(e.target.checked, e.target); });
    const close = api.close; api.close = () => { if (AM.sheet === api) AM.sheet = null; close(); };
  });
}
function amSheetPaint(api) {
  const b = api.body, l = AM.l;
  if (!l) { b.innerHTML = `<div class="status" data-ok="0"><span class="dot"></span><span>${esc(AM.err ? amErrText(AM.err) : T('Lecture de tes amis…'))}</span></div>`; return; }
  const row = (x, sub, acts) => `<div class="am-row" data-id="${x.id}">${amAv(x)}<span class="am-t"><b>${esc(amName(x))}</b><small>${esc(sub)}</small></span>${acts}</div>`;
  const tr = l.tr && l.tr.length && typeof trocJoinCode === 'function' ? `<div class="me-h">${T('Invitations à un échange')}</div><div class="me-g am-g">${l.tr.map(x => `<div class="am-row" data-c="${x.c}">${amAv({ ...x, id: x.c })}<span class="am-t"><b>${esc(amName(x))}</b><small>${esc(T('échange en direct · {when}', { when: relTime(x.at) }))}</small></span><span class="am-acts"><button class="btn small" type="button" data-am="trjoin">${T('Rejoindre')}</button></span></div>`).join('')}</div>` : '';
  const inc = l.inc.length ? `<div class="me-h">${T('Demandes reçues')}</div><div class="me-g am-g">${l.inc.map(x => row(x, relTime(x.at),
    `<span class="am-acts"><button class="btn small" type="button" data-am="yes">${T('Accepter')}</button><button class="icon-btn am-no" type="button" data-am="no" aria-label="${esc(T('Refuser la demande de {name}', { name: amName(x) }))}" title="${T('Refuser')}"><svg class="i"><use href="#i-close"/></svg></button></span>`)).join('')}</div>` : '';
  const fr = l.friends.length
    ? `<div class="me-h">${T('Mes amis')} · ${nf0(l.friends.length)}</div><div class="me-g am-g">${l.friends.map(x => `<button type="button" class="am-row" data-am="open" data-id="${x.id}">${amAv(x)}<span class="am-t"><b>${esc(amName(x))}</b><small${x.m ? ' class="good"' : ''}>${esc(amFriendSub(x))}</small></span>${meChev}</button>`).join('')}</div>`
    : `<div class="am-empty"><b>${T('Ajoute tes amis')}</b><p class="hint">${T('Ouvre le lien d\'échange d\'un ami (ou scanne son QR code), puis touche « Ajouter en ami ». Pour qu\'il t\'ajoute, montre-lui ton QR code.')}</p><button class="btn ghost small" type="button" data-am="qr">${QR_ICON}${T('Mon QR code')}</button></div>`;
  const out = l.out.length ? `<div class="me-h">${T('Demandes envoyées')}</div><div class="me-g am-g">${l.out.map(x => row(x, T('en attente · {when}', { when: relTime(x.at) }), `<button class="link-btn" type="button" data-am="cancel">${T('Annuler')}</button>`)).join('')}</div>` : '';
  const set = `<div class="me-h">${T('Ce que voient tes amis')}</div><div class="me-g">
      <label class="me-row switch-row" for="amColl"><span class="me-t">${T('Partager ma collection')}<small>${T('Ils voient déjà tes doublons, tes cartes recherchées et tes decks.')}</small></span><span class="switch"><input type="checkbox" id="amColl"${l.me.c ? ' checked' : ''}><i></i></span></label>
      ${(pushNat() ? CTX.fcm : CTX.vapid) ? `<button type="button" class="me-row" data-am="push"><span class="me-t">${T('Notifications')}<small>${T('Demandes d\'ami, cartes que tu cherches')}</small></span><span class="me-v" id="amPushV"></span>${meChev}</button>` : ''}</div>
    ${AM.err ? `<p class="hint warn">${esc(amErrText(AM.err))}</p>` : ''}`;
  b.innerHTML = tr + inc + fr + out + set;
  amPushVal($('#amPushV', b));
}
async function amPushVal(el) {
  if (!el) return;
  const st = await pushState().catch(() => ''); if (!el.isConnected) return;
  const on = st === 'on' && AM.push && AM.dev;
  el.textContent = on ? T('Activées') : st === 'denied' ? T('Bloquées') : T('Activer'); el.classList.toggle('am-hot', !on && st !== 'denied');
}
async function amSheetClick(e, api) {
  const b = e.target.closest('[data-am]'); if (!b || b.disabled) return;
  const act = b.dataset.am, row = b.closest('[data-id]'), id = row ? row.dataset.id : '';
  haptic('tap');
  if (act === 'open') { while (sheets.length) sheets[sheets.length - 1].close(); setTimeout(() => amOpenFriend(id), reduceMotion() ? 0 : 160); }
  else if (act === 'trjoin') { const c = (b.closest('[data-c]') || {}).dataset; while (sheets.length) sheets[sheets.length - 1].close(); if (c && c.c) trocJoinCode(c.c); }      // invitation à un échange en direct (troc.js)
  else if (act === 'qr') { api.close(); homeTradeAct(true); }
  else if (act === 'yes' || act === 'no') { b.disabled = true; await amAnswer(id, act === 'yes'); }
  else if (act === 'cancel') { b.disabled = true; try { await amCall('/remove', { method: 'POST', body: { id } }); toast(T('Demande annulée')); } catch (x) { toast(amErrText(x.code)); } amRefresh(true); }
  else if (act === 'push') { const st = await pushState().catch(() => ''); if (st === 'on' && AM.push && AM.dev) openNotifSettings(); else await amPushOn(); if (AM.sheet) AM.sheet.paint(); }
}
async function amAnswer(id, ok) {
  try {
    const r = await amCall('/answer', { method: 'POST', body: { id, ok: !!ok, ...(await amProf()) } });
    haptic('ok'); toast(ok && r.state === 'friend' ? T('Vous êtes amis') : T('Demande refusée'));
  } catch (e) { toast(amErrText(e.code)); }
  return amRefresh(true);
}
/** « Partager ma collection » : coupé, le serveur efface aussitôt la copie qu'il avait. */
async function amSetColl(on, input) {
  input.disabled = true;
  try {
    const r = await amCall('/me', { method: 'PUT', body: { c: on ? 1 : 0 } });
    if (AM.l) AM.l.me.c = r.c ? 1 : 0; delete AM.sig.c; if (AM.l) AM.l.me.has.c = 0; amStore();
    if (on) amDataSoon(300);
    toast(on ? T('Tes amis voient maintenant ta collection') : T('Ta collection n\'est plus visible par tes amis'));
  } catch (e) { input.checked = !on; toast(amErrText(e.code)); }
  input.disabled = false;
}
/** Notifications des amis : autorisation demandée si besoin (push.js › pushEnable), puis appareil enregistré. */
async function amPushOn() {
  AM.push = true; amStore();
  const r = await pushEnable();
  if (!r.ok) { toast(alWhy(r)); return false; }
  try { await amDev(true); } catch (e) { toast(amErrText(e.code)); return false; }
  toast(T('Tu seras prévenu des demandes d\'ami')); return true;
}
/** Réglages › Notifications : section « Amis » (app.js › openNotifSettings). */
async function amPushBox(box) {
  if (!box) return;
  if (!amOn()) { box.innerHTML = `<p class="hint">${T('Connecte-toi pour recevoir les demandes d\'ami.')}</p>`; return; }
  const st = await pushState().catch(() => ''); if (!box.isConnected) return;
  if (st !== 'on' && st !== 'off') { box.innerHTML = `<p class="hint">${st === 'denied' ? esc(pushDeniedMsg()) : T('Notifications indisponibles sur cet appareil.')}</p>`; return; }
  box.innerHTML = `<label class="switch-row" for="amPushSw"><span class="t"><b>${T('Demandes d\'ami et cartes que tu cherches')}</b><span class="hint">${T('Une demande, une acceptation, ou un ami qui ajoute une carte que tu cherches (une fois par jour au plus).')}</span></span><span class="switch"><input type="checkbox" id="amPushSw"${st === 'on' && AM.push && AM.dev ? ' checked' : ''}><i></i></span></label>`;
  const cb = $('#amPushSw', box);
  cb.onchange = async () => {
    cb.disabled = true;
    if (cb.checked) { if (!(await amPushOn())) cb.checked = false; }
    else { AM.push = false; amStore(); try { await amDev(); } catch (e) { /* hors ligne : retiré à la prochaine relecture */ } if (!S.push && !(typeof AC !== 'undefined' && AC.on) && !(typeof dlyHoldsPush === 'function' && dlyHoldsPush())) await pushDisable(); }
    cb.disabled = false;
  };
}

/* ── Liste d'échange publique d'un autre joueur, page d'un ami (share.js › openPublicTrade) ───────────────────────────── */
/** Appelée par openPublicTrade une fois l'écran construit : bouton « Ajouter en ami » (lien d'un autre), ou decks, collection et retrait (page d'un ami). */
function amPubMount(wrap, P) {
  if (P.fr) { amFriendMount(wrap, P); return; }
  const slot = $('.am-pub', wrap);
  if (!slot || P.preview || !P.id || (CTX.proxy && !CTX.amis)) return;
  const head = $('.dv-title', wrap), title0 = head ? head.innerHTML : '';
  const paint = st => {
    slot.dataset.st = st; slot.hidden = !st || st === 'self';
    // bouton affiché : le titre devient le pseudo (« Liste d'échange de … » passe en sous-titre), sinon le bouton le couperait avant le nom
    if (head && P.sh.by) { if (slot.hidden) head.innerHTML = title0; else { $('b', head).textContent = P.sh.by; $('span', head).textContent = [T('Liste d\'échange'), P.sh.at ? T('Mise à jour {when}', { when: relTime(P.sh.at) }) : ''].filter(Boolean).join(' · '); } }
    slot.innerHTML = st === 'sent' ? `<span class="am-pill off" role="status"><svg class="i"><use href="#i-check"/></svg><span>${T('Demande envoyée')}</span></span>`
      : st === 'friend' ? `<button class="am-pill on" type="button" data-am="friend"><svg class="i"><use href="#i-check"/></svg><span>${T('Ami')}</span></button>`
      : st === 'asked' ? `<button class="am-pill" type="button" data-am="accept">${AM_ADD_ICON}<span>${T('Accepter')}</span></button>`
      : st === 'busy' ? `<span class="am-pill off"><span>${T('Envoi…')}</span></span>`
      : st ? `<button class="am-pill" type="button" data-am="add" aria-label="${T('Ajouter en ami')}">${AM_ADD_ICON}<span>${T('Ajouter en ami')}</span></button>` : '';
    if (typeof tipSoon === 'function') tipSoon();      // astuce (tour.js) : « Ajoute-le en ami »
  };
  const check = async () => {
    for (let i = 0; i < 60 && !CTX.proxy; i++) await sleep(100);      // lien ouvert au lancement : serveur pas encore interrogé (__ping)
    if (TR.pub !== P || !P.el) { if (AM.pubCheck === check) AM.pubCheck = null; return; }
    if (!CTX.proxy || !CTX.amis) { paint(''); return; }
    if (!D.user) { paint(D.authReady ? 'out' : ''); return; }
    try { const r = await amCall('/state', { params: { share: P.id } }); if (TR.pub === P) { P.am = r; paint(r.state); } }
    catch (e) { if (TR.pub === P) paint(''); }      // serveur injoignable, lien arrêté : rien plutôt qu'un bouton qui échouera
  };
  AM.pubCheck = check; check();
  slot.addEventListener('click', async e => {
    const b = e.target.closest('[data-am]'); if (!b) return;
    haptic('tap');
    if (b.dataset.am === 'friend') { if (P.am && P.am.id) amOpenFriend(P.am.id); return; }
    if (!D.user) { toast(T('Connecte-toi pour ajouter un ami')); openAccount(); return; }
    const prev = slot.dataset.st; paint('busy');
    try {
      const r = b.dataset.am === 'accept' && P.am ? await amCall('/answer', { method: 'POST', body: { id: P.am.id, ok: true, ...(await amProf()) } })
        : await amCall('/ask', { method: 'POST', body: { share: P.id, ...(await amProf()) } });
      P.am = { ...(P.am || {}), ...r, state: r.state }; paint(r.state); haptic('ok');
      if (r.state === 'sent' && !PROF.name) toast(T('Demande envoyée. Choisis un pseudo pour qu\'il te reconnaisse.'), { label: T('Pseudo'), fn: openProfile });      // sans pseudo, il verrait « Joueur sans pseudo »
      else toast(r.state === 'friend' ? T('Vous êtes amis') : r.state === 'sent' ? T('Demande envoyée à {name}', { name: P.sh.by || T('ce joueur') }) : T('C\'est ta propre liste'));
      amRefresh(true);
    } catch (x) { paint(prev); toast(amErrText(x.code)); }
  });
}
/** Page d'un ami : sous-titre « Ami · mise à jour… », ses decks et sa collection (s'il l'autorise), retrait. */
function amFriendMount(wrap, P) {
  const f = P.fr, more = $('.am-more', wrap), rm = $('.am-rm', wrap), head = $('.dv-title', wrap);
  if (head) { $('b', head).textContent = amName(f); $('span', head).textContent = [T('Ami'), P.sh.at ? T('Mise à jour {when}', { when: relTime(P.sh.at) }) : ''].filter(Boolean).join(' · '); }
  if (more) {
    more.innerHTML = `${f.none ? `<p class="hint am-none">${T('{name} n\'a pas encore envoyé sa liste : elle arrivera à sa prochaine ouverture de Mana Orbit.', { name: esc(amName(f)) })}</p>` : ''}
      <div class="am-chips"><button class="am-chip" type="button" data-am="decks"><svg class="i"><use href="#i-layers"/></svg><span>${T('Ses decks')}</span>${f.nd ? `<small>${nf0(f.nd)}</small>` : ''}</button>${f.c ? `<button class="am-chip" type="button" data-am="coll"><svg class="i"><use href="#i-cards"/></svg><span>${T('Sa collection')}</span>${f.nc ? `<small>${nf0(f.nc)}</small>` : ''}</button>` : ''}${CTX.troc && typeof trocInvite === 'function' ? `<button class="am-chip" type="button" data-am="troc" title="${T('Proposer un échange en direct')}"><svg class="i"><use href="#i-swap"/></svg><span>${T('Échange en direct')}</span></button>` : ''}</div>`;
    more.hidden = false;
  }
  if (rm) { rm.innerHTML = `<button class="link-btn" type="button" data-am="rm">${T('Retirer {name} de mes amis', { name: esc(amName(f)) })}</button>`; rm.hidden = false; }
  wrap.addEventListener('click', e => {
    const b = e.target.closest('[data-am]'); if (!b) return;
    haptic('tap');
    if (b.dataset.am === 'decks') amDecksSheet(f);
    else if (b.dataset.am === 'coll') amCollSheet(f);
    else if (b.dataset.am === 'troc') trocInvite(f);      // échange en direct : session créée, l'ami est invité (notification de son compte)
    else if (b.dataset.am === 'rm') amRemoveAsk(f, wrap);
  });
}
/** Ouvre la page d'un ami (feuille Amis, accueil, notification touchée). Sa liste d'échange est lue sur le serveur ; à défaut, son lien public. */
async function amOpenFriend(id) {
  if (!AM_TAG_RE.test(String(id || ''))) return;
  for (let i = 0; i < 60 && !D.authReady; i++) await sleep(100);      // notification touchée au lancement : session pas encore restaurée
  if (!D.user) { openAccount(); return; }
  for (let i = 0; i < 50 && !CTX.amis; i++) await sleep(100);
  let f = amFriend(id);
  if (!f) { await amRefresh(true); f = amFriend(id); }
  if (!f) { toast(AM.err ? amErrText(AM.err) : T('Vous n\'êtes plus amis.')); return; }
  const task = Tasks.start(T('Liste de {name}', { name: amName(f) }));
  let sh = null, err = '';
  try { const r = await amPart(id, 't'); sh = r.j ? readShare('trade', r.j) : null; if (sh) sh.at = r.at || sh.at; } catch (e) { err = e.code || 'net'; }
  if (!sh && f.s && err !== 'not_friend') { try { sh = await shareFetch(f.s); } catch (e) { /* lien arrêté */ } }
  task.remove();
  if (err === 'not_friend' || (!sh && err)) { toast(amErrText(err)); if (err === 'not_friend') amRefresh(true); return; }
  openPublicTrade({ ...(sh || { kind: 'trade', at: 0, have: [], want: [] }), by: amName(f), bp: f.p || '' }, false, '', { ...f, none: !sh });
}
/** Une partie d'un ami (gardée 90 s : ouvrir ses decks deux fois ne relit rien). */
async function amPart(id, part) {
  const k = id + part, c = AM.parts.get(k); if (c && Date.now() - c.t < 90e3) return c.r;
  const r = await amCall('/view', { params: { id, part } });
  if (AM.parts.size > 30) AM.parts.clear();
  AM.parts.set(k, { t: Date.now(), r }); return r;
}
function amRemoveAsk(f, wrap) {
  openSheet(T('Retirer {name} de tes amis ?', { name: amName(f) }), null, api => {
    api.body.innerHTML = `<p class="hint">${T('Vous ne verrez plus vos listes, vos decks ni vos collections l\'un chez l\'autre. Tu pourras le rajouter depuis son lien d\'échange.')}</p>`;
    api.setFoot(`<button class="btn ghost" type="button" data-close>${T('Annuler')}</button><button class="btn danger" type="button" id="amRmGo">${T('Retirer')}</button>`);
    $('#amRmGo', api.foot).onclick = async e => {
      e.target.disabled = true;
      try { await amCall('/remove', { method: 'POST', body: { id: f.id } }); } catch (x) { e.target.disabled = false; toast(amErrText(x.code)); return; }
      api.close(); if (wrap && wrap.__close) wrap.__close(); haptic('ok');
      toast(T('{name} n\'est plus dans tes amis', { name: amName(f) })); AM.parts.clear(); amRefresh(true);
    };
  });
}
/** Feuille des decks d'un ami : lecture seule, un deck s'ouvre dans le viewer public (main de départ, « Enregistrer dans mes decks »). */
async function amDecksSheet(f) {
  let r; const task = Tasks.start(T('Decks de {name}', { name: amName(f) }));
  try { r = await amPart(f.id, 'd'); } catch (e) { task.remove(); toast(amErrText(e.code)); return; }
  task.remove();
  let list = []; try { list = JSON.parse(r.j || '[]'); } catch (e) { list = []; }
  const decks = (Array.isArray(list) ? list : []).slice(0, 200).map(x => (x && typeof x === 'object' ? readShare('deck', { name: x.n, text: x.t }) : null)).filter(Boolean);
  openSheet(T('Decks de {name}', { name: amName(f) }), decks.length ? TN(decks.length, '{n} deck', '{n} decks') + ' · ' + T('lecture seule') : null, api => {
    api.body.innerHTML = decks.length
      ? `<div class="me-g am-g">${decks.map((d, i) => `<button type="button" class="am-row am-deck" data-i="${i}"><span class="am-t"><b>${esc(d.name)}</b><small>${esc(dkCountText(d.text))}</small></span>${pips(d.text)}${meChev}</button>`).join('')}</div>`
      : `<p class="hint">${T('{name} n\'a pas encore de deck enregistré.', { name: esc(amName(f)) })}</p>`;
    api.body.addEventListener('click', e => {
      const b = e.target.closest('.am-deck'); if (!b) return;
      const d = decks[Number(b.dataset.i)]; if (!d) return;
      haptic('tap'); api.close(); openDeckViewer({ text: d.text, name: d.name, pub: true, by: amName(f) });
    });
  });
}
/** Feuille de la collection d'un ami (s'il la partage) : recherche (nom français ou anglais) et filtres, ce que tu cherches signalé, carte en grand. */
async function amCollSheet(f) {
  let r; const task = Tasks.start(T('Collection de {name}', { name: amName(f) }));
  try { r = await amPart(f.id, 'c'); } catch (e) { task.remove(); toast(amErrText(e.code)); return; }
  task.remove();
  let rows = []; try { rows = JSON.parse(r.j || '[]'); } catch (e) { rows = []; }
  const items = (Array.isArray(rows) ? rows : []).slice(0, 40000).map(x => (Array.isArray(x) ? shareCard({ n: x[0], q: x[1], l: x[2] }) : null)).filter(Boolean);
  if (typeof collFrLoad === 'function') collFrLoad();
  const want = new Map(trState().want.map(x => [x.k, x])), copies = items.reduce((a, x) => a + x.q, 0);
  openSheet(T('Collection de {name}', { name: amName(f) }), TN(items.length, '{n} carte', '{n} cartes') + ' · ' + TN(copies, '{n} exemplaire', '{n} exemplaires'), api => {
    api.wrap.classList.add('am-coll-sheet');
    api.body.innerHTML = `<div class="am-cf"></div><div class="am-cl"></div>`;
    const flt = newFilter(); let shown = AM_PAGE, dmRun = 0;
    const item = x => { const it = pubFill(x), fn = frOf(x.k); if (fn && fn !== it.n && !it.fn) it.fn = fn; if (it.l && frName(x.k, it.l)) it.dn = frName(x.k, it.l); it.wq = (want.get(x.k) || {}).q || 0; return it; };
    const paint = () => {
      const all = items.map(item), list = filterItems(all, flt), sh = list.slice(0, shown), box = $('.am-cl', api.body);
      box.innerHTML = `${filterActive(flt) ? `<p class="hint coll-count">${TN(list.length, '{n} carte sur {total}', '{n} cartes sur {total}', { total: nf0(all.length) })}</p>` : ''}
        ${sh.length ? `<div class="coll-list">${sh.map(amCollRow).join('')}</div>` : `<p class="hint listempty">${T(all.length ? 'Aucune carte ne correspond.' : 'Collection vide pour l\'instant.')}</p>`}
        ${list.length > sh.length ? `<button class="btn ghost block coll-more" type="button" data-am="more">${T('Afficher {n} de plus · {left} restantes', { n: nf0(Math.min(AM_PAGE, list.length - sh.length)), left: nf0(list.length - sh.length) })}</button>` : ''}`;
      const need = sh.filter(x => !x.im).map(x => ({ key: x.k, name: x.n }));      // images des cartes affichées seulement
      if (need.length && dmRun < 3 && dmMissing(need).length) { dmRun++; dmFetch(need).then(got => { if (got && api.wrap.isConnected) paint(); }, () => {}); }
    };
    mountFilters($('.am-cf', api.body), flt, () => { shown = AM_PAGE; paint(); }, { placeholder: T('Nom français ou anglais') });
    api.wrap.addEventListener('load', e => { if (e.target.tagName === 'IMG') e.target.classList.add('ok'); }, true);
    api.wrap.addEventListener('error', e => { if (e.target.tagName === 'IMG') e.target.remove(); }, true);
    api.body.addEventListener('click', e => {
      if (e.target.closest('[data-am="more"]')) { shown += AM_PAGE; paint(); return; }
      const row = e.target.closest('.am-crow'); if (!row) return;
      const rs = $$('.am-crow', api.body), list = []; let at = 0;
      for (const x of rs) { const im = $('img', x); if (!im) continue; if (x === row) at = list.length; list.push({ key: x.dataset.k, name: $('.row-name', x).textContent, wl: x.dataset.ln && x.dataset.ln !== 'en' ? x.dataset.ln : '', small: im.getAttribute('src'), lang: x.dataset.ln || 'en', plain: true, extra: x.dataset.x || '' }); }
      if (list.length) { haptic('tap'); openCardViewer(list, at); } else toast(T('Pas d\'aperçu pour cette carte'));
    });
    paint();
  });
}
function amCollRow(it) {
  const nm = it.dn || it.n, img = it.im || '', alt = it.dn && it.dn !== it.n ? it.n : it.fn || '';
  const tags = (it.wq ? `<span class="tag accent">${T('tu la cherches × {n}', { n: it.wq })}</span>` : '') + (it.tl ? `<span class="tag">${esc(typeBucket(it.tl))}</span>` : '') + (alt ? `<span class="tag">${esc(alt)}</span>` : '');
  const x = TN(it.q, '{n} exemplaire', '{n} exemplaires') + (it.l ? ' · ' + (LANGS[it.l] || it.l) : '');
  return `<div class="crow pub-row am-crow" role="button" tabindex="0" data-k="${esc(it.k)}" data-ln="${esc(it.l || '')}" data-x="${esc(x)}"><span class="thumb" style="--h:${hash32(it.k) % 360}">${esc((nm.trim()[0] || '?').toUpperCase())}${img ? `<img alt="" loading="lazy" decoding="async" src="${esc(img)}">` : ''}</span>
    <span class="row-main"><span class="row-top"><span class="row-name">${esc(nm)}</span>${it.l ? flag(it.l) : ''}</span><span class="row-meta">${tags}</span></span><span class="tr-q"><b>× ${it.q}</b></span></div>`;
}

/* ── Notification touchée, lien ./?amis=1 ou ./?ami=<id> ──────────────────────────────────────────────────────────────── */
/** Vrai si l'adresse était pour les amis (et la bonne fenêtre s'ouvre). */
function amPushOpen(url) {
  const u = String(url || ''), m = /[?&]ami=([0-9a-f]{64})\b/.exec(u);
  if (m) { setTimeout(() => amOpenFriend(m[1]), 400); return true; }
  if (/[?&]amis\b/.test(u)) { setTimeout(async () => { for (let i = 0; i < 60 && !D.authReady; i++) await sleep(100); for (let i = 0; i < 50 && D.user && !CTX.amis; i++) await sleep(100); amSheet(); }, 400); return true; }
  return false;
}
/** Notification reçue appli ouverte (FCM) ou signalée par le service worker : la liste est relue (point, demandes) ; toast sauf en mode streamer. */
function amPushed(n) {
  amSoon(300); AM.at = 0;
  if (!n || amQuiet()) return;
  const msg = [n.title, n.body].filter(Boolean).join(' · ');
  if (msg) toast(msg, n.url ? { label: T('Voir'), fn: () => pushOpen(n.url) } : undefined);
}
function amInit() {
  document.addEventListener('visibilitychange', () => { if (!document.hidden && AM.uid) amSoon(800); });
  document.addEventListener('profchange', () => { if (AM.l && (AM.l.friends.length || AM.l.inc.length || AM.l.out.length || AM.dev)) setTimeout(() => amMe().catch(() => {}), 1500); });
}
