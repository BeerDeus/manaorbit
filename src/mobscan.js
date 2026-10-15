/* ── mobscan.js : « Scan mobile » : le PC attend (page « Ajouter des cartes »), le téléphone scanne, chaque carte arrive dans le lot du PC ──────────────
   Même compte sur les deux appareils, rien à appairer. Document users/{uid}/meta/scan :
     { on (le PC attend), s (session), dev (appareil du PC), by (son nom), at (dernier signe de vie, ms), items: [{ i, k, n, q, l, e }], updatedAt (changé seulement en ouvrant et en fermant une session : ni les cartes ni le signe de vie, cloud.js › sommaire) }.
     e : édition décidée sur le téléphone (scaned.js : posée d'office ou choisie ; '' : sans) ; absente (téléphone plus ancien) : l'extension collante du lot du PC.
   · PC : « Scan mobile » écrit { on: true, s, dev, by, at, items: [] }, puis renouvelle « at » chaque minute. Chaque carte reçue rejoint le lot
     (lotFromScan : extension collante ; q négatif : exemplaires retirés), puis sort du document (arrayRemove). « Arrêter », fermer la page : on = false.
   · Téléphone (connecté, autre appareil) : PC en attente depuis moins de 3 min → bandeau « Ton PC attend des cartes · Scanner ». Le scan s'ouvre
     en mode « vers ton PC » : chaque carte reconnue part tout de suite (arrayUnion ; hors ligne : dès le retour du réseau), ses corrections aussi
     (quantité, langue, retrait : écart envoyé) ; rien n'est ajouté à la collection du téléphone.
   Règles Firestore : document « scan » (firestore.rules) à republier dans la console Firebase. */
const MOB_DEV_KEY = 'deckdeal:dev', MOB_FRESH = 3 * 60e3, MOB_BEAT = 60e3, MOB_MAX = 60;
const MOB = { uid: '', unsub: null, doc: null, err: '', pc: null, seen: new Set(), got: 0, last: '', beatT: 0, hide: '', sent: new Map(), queue: [], busy: false, retryT: 0, waitT: 0 };
/** Identifiant de cet appareil (aléatoire, gardé) : le PC ne se propose pas à lui-même. */
function mobDev() {
  let d = ''; try { d = localStorage.getItem(MOB_DEV_KEY) || ''; } catch (e) { /* stockage indisponible */ }
  if (!/^[a-z0-9]{8,24}$/.test(d)) { d = Math.random().toString(36).slice(2, 10) + Date.now().toString(36); try { localStorage.setItem(MOB_DEV_KEY, d); } catch (e) { /* une identité par session */ } }
  return d;
}
/** Nom lisible de l'appareil (« Chrome · Windows ») montré sur le téléphone. */
function mobName() {
  const u = typeof navigator !== 'undefined' ? navigator.userAgent || '' : '';
  const os = /Windows/.test(u) ? 'Windows' : /Mac OS X/.test(u) && !/Mobile/.test(u) ? 'Mac' : /CrOS/.test(u) ? 'Chromebook' : /Android/.test(u) ? 'Android' : /iPhone|iPad/.test(u) ? 'iOS' : /Linux/.test(u) ? 'Linux' : '';
  const br = /Edg\//.test(u) ? 'Edge' : /OPR\//.test(u) ? 'Opera' : /Firefox\//.test(u) ? 'Firefox' : /Chrome\//.test(u) ? 'Chrome' : /Safari\//.test(u) ? 'Safari' : '';
  return [br, os].filter(Boolean).join(' · ').slice(0, 60) || T('Ordinateur');
}
const mobRand = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
/** Encadré « Scan mobile » proposé sur un ordinateur (souris, ou grand écran hors appli Android) ; le téléphone, lui, scanne. */
const mobPcLike = () => { try { return !isNativeApp() && (matchMedia('(pointer: fine)').matches || innerWidth >= 900); } catch (e) { return false; } };
const mobCan = () => !!(D.user && D.cloud && D.cloud.watchMeta && D.cloud.saveMeta && D.cloud.updMeta && D.cloud.scanPush && D.cloud.scanTake);
/** Un PC attend des cartes (autre appareil, signe de vie récent) : le document, sinon null. */
function mobWaiting() {
  const d = MOB.doc; return d && d.on && d.dev && d.dev !== mobDev() && Date.now() - (Number(d.at) || 0) < MOB_FRESH ? d : null;
}

/* ── Compte : écoute du document ─────────────────────────────────────────────────────────────────── */
function mobUser(user) {
  if (user && MOB.unsub && MOB.uid === user.uid) return;      // même compte (jeton renouvelé…) : l'écoute et l'attente du PC continuent
  if (MOB.unsub) { try { MOB.unsub(); } catch (e) { /* ignore */ } MOB.unsub = null; }
  if (MOB.pc) mobStop(true);
  MOB.uid = ''; MOB.doc = null; MOB.err = ''; mobBar();
  if (!user || !D.cloud || !D.cloud.watchMeta) return;
  MOB.uid = user.uid;
  MOB.unsub = D.cloud.watchMeta(user.uid, 'scan', (data, pending, fromCache) => {
    if (D.uid !== user.uid || fromCache) return;
    MOB.doc = data || null; MOB.err = '';
    const stale = !!(data && MOB.pc && data.s !== MOB.pc.s && Number(data.updatedAt) > 0 && Number(data.updatedAt) <= MOB.pc.at);      // écho d'une écriture d'avant ce démarrage (« Arrêter » puis « Activer » aussitôt) : pas un autre appareil
    if (MOB.pc && !stale) { if (!data || data.dev !== mobDev() || data.s !== MOB.pc.s) mobLost(); else if (!pending) mobTake(data); }
    mobBar(); mobPaint();
  }, err => { if (D.uid !== user.uid) return; MOB.err = err && err.code === 'permission-denied' ? 'rules' : 'net'; mobPaint(); });
}

/* ── PC : attendre les cartes du téléphone ───────────────────────────────────────────────────────── */
async function mobStart() {
  if (!D.user) { mobNeedAccount(); return; }
  if (!mobCan()) { toast(T('Compte indisponible ici (Firebase bloqué ou hors ligne)')); return; }
  const s = mobRand(); MOB.pc = { s, at: Date.now() }; MOB.seen = new Set(); MOB.got = 0; MOB.last = ''; MOB.err = ''; mobPaint();
  try { await D.cloud.saveMeta(D.user.uid, 'scan', { on: true, s, dev: mobDev(), by: mobName(), at: Date.now(), items: [], updatedAt: Date.now() }); }
  catch (e) { if (MOB.pc && MOB.pc.s === s) { MOB.pc = null; MOB.err = e && e.code === 'permission-denied' ? 'rules' : 'net'; mobPaint(); } return; }
  clearInterval(MOB.beatT); MOB.beatT = setInterval(mobBeat, MOB_BEAT);
  haptic('ok');
}
/** Signe de vie (le téléphone ne propose plus un PC muet depuis 3 min : onglet fermé, appareil en veille). */
function mobBeat() {
  if (!MOB.pc || !D.user) return;
  if (typeof document !== 'undefined' && document.hidden) return;      // onglet caché : le navigateur ralentit tout ; repris au retour
  D.cloud.updMeta(D.user.uid, 'scan', { at: Date.now() }).catch(() => {});      // date (updatedAt) inchangée : seuls les appareils qui suivent la session en direct le relisent (cloud.js › sommaire)
}
/** Arrêt (bouton, page fermée, compte changé) ; quiet : sans écriture (déconnexion). */
function mobStop(quiet) {
  const pc = MOB.pc; MOB.pc = null; clearInterval(MOB.beatT); MOB.beatT = 0; mobPaint();
  if (!pc || quiet || !D.user || !D.cloud || !D.cloud.updMeta) return;
  const d = MOB.doc; if (d && d.s !== pc.s) return;      // un autre appareil a pris le relais : on ne l'éteint pas
  D.cloud.updMeta(D.user.uid, 'scan', { on: false, updatedAt: Date.now() }).catch(() => {});
}
/** Un autre appareil attend à sa place (autre PC, autre onglet) : ce PC arrête. */
function mobLost() { MOB.pc = null; clearInterval(MOB.beatT); MOB.beatT = 0; mobPaint(); toast(T('Scan mobile repris par un autre appareil')); }
/** Cartes reçues : vérifiées, ajoutées au lot (ou retirées : q négatif), puis enlevées du document. */
async function mobTake(d) {
  const all = Array.isArray(d.items) ? d.items : [], fresh = all.filter(x => x && typeof x.i === 'string' && !MOB.seen.has(x.i)); if (!fresh.length) return;
  fresh.forEach(x => MOB.seen.add(x.i));
  const ok = fresh.map(x => {
    const n = String(x.n || '').slice(0, 150), k = ownKey(n), q = Math.max(-99, Math.min(99, Math.round(Number(x.q) || 0))), l = CARD_LANG_LIST.includes(x.l) ? x.l : '';
    const e = typeof x.e !== 'string' ? undefined : x.e && edKey(edSet(x.e), edNum(x.e)) === x.e ? x.e : '';      // édition du téléphone (vérifiée) ; undefined : téléphone sans éditions au scan
    return k && q ? { k, n, q, l, ...(e !== undefined ? { e } : {}) } : null;
  }).filter(Boolean);
  const add = ok.filter(x => x.q > 0), sub = ok.filter(x => x.q < 0);
  let run = [];      // dans l'ordre d'envoi : une édition changée sur le téléphone = retrait de l'ancienne ligne, puis ajout sur la nouvelle
  const flush = async () => {
    if (!run.length) return; const r = run; run = [];
    if (LOT.el) await lotFromScan(r);
    else { for (const x of r) collBump(x.k, x.n, x.q, { lang: lineKey(x.l, x.e), paint: false }); collEnrich(); }      // page fermée entre-temps : la collection quand même
  };
  for (const x of ok) { if (x.q > 0) { run.push(x); continue; } await flush(); lotTakeBack(x.k, x.n, x.l, -x.q, x.e); }
  await flush();
  MOB.got = Math.max(0, MOB.got + ok.reduce((a, x) => a + x.q, 0)); if (add.length) MOB.last = add[add.length - 1].n;      // corrections du téléphone comprises
  const fix = new Set(sub.map(x => x.k)), news = add.filter(x => !fix.has(x.k));      // une correction (édition, langue) n'est pas une carte reçue
  mobPaint(); if (news.length) toast(news.length > 1 ? T('{n} cartes reçues du téléphone', { n: news.reduce((a, x) => a + x.q, 0) }) : T('{name} reçue du téléphone', { name: news[0].n }));
  if (D.user && D.cloud.scanTake) D.cloud.scanTake(D.user.uid, fresh).catch(() => {});      // les mêmes objets : arrayRemove les retrouve
}
/** Correction venue du téléphone (« − », retrait, autre langue, autre édition) : q exemplaires de la carte (langue l, édition e si le téléphone la donne)
 *  sortent du lot (les plus récents d'abord) et de la collection. */
function lotTakeBack(k, n, l, q, e) {
  let left = q; const g = e === undefined ? null : lineKey(lotLangOf({ k, l }), e);
  for (const x of LOT.list) {
    if (!left) break;
    if (x.k !== k || (g !== null ? x.g !== g : lineLang(x.g) !== l)) continue;
    const t = Math.min(left, x.q); collBump(x.k, x.n, -t, { lang: x.g, paint: false }); x.q -= t; left -= t;
  }
  LOT.list = LOT.list.filter(x => x.q > 0); lotSave();
  if (left) collBump(k, n, -left, { lang: g !== null ? g : l, paint: false });      // pas (plus) dans le lot : la ligne de cette langue (et édition)
  lotPaintList(); lotPaintHead(); collPaintSoon();
}
/** Sans compte : explication, puis connexion. */
function mobNeedAccount() {
  openSheet(T('Scan mobile'), '', api => {
    api.body.innerHTML = `<p class="cf-msg">${T('Connecte-toi avec le même compte sur ce PC et sur ton téléphone : les cartes scannées avec le téléphone arrivent ici, dans ce lot.')}</p>`;
    api.setFoot(`<button class="btn ghost" type="button" data-close>${T('Plus tard')}</button><button class="btn" type="button" data-go>${T('Se connecter')}</button>`);
    api.foot.addEventListener('click', e => { if (e.target.closest('[data-go]')) { api.close(); openAccount(); } });
  });
}
/** Encadré « Scan mobile » de la page « Ajouter des cartes » (PC). */
function mobPaint() {
  const box = LOT.el && $('.mob-pc', LOT.el); if (!box) return;
  const on = !!MOB.pc, err = MOB.err === 'rules' ? T('Règles Firestore à publier (document « scan ») : le scan mobile ne peut pas encore passer par ton compte.') : MOB.err === 'net' && on ? T('Connexion au compte perdue : les cartes arriveront au retour du réseau.') : MOB.err === 'net' ? T('Compte injoignable pour l\'instant : réessaie dans un instant.') : '';
  box.dataset.on = on ? '1' : '0';
  box.innerHTML = on
    ? `<span class="mob-ic" aria-hidden="true"><svg class="i"><use href="#i-phone"/></svg></span><span class="mob-t"><b>${T('Scan mobile activé')}</b><span>${MOB.got ? TN(MOB.got, '{n} carte reçue', '{n} cartes reçues') + (MOB.last ? ' · ' + esc(MOB.last) : '') : T('Ouvre Mana Orbit sur ton téléphone, avec le même compte : il te propose de scanner pour ce PC.')}</span>${err ? `<em>${esc(err)}</em>` : ''}</span><button class="btn ghost small" type="button" data-act="mobstop">${T('Arrêter')}</button>`
    : `<span class="mob-ic" aria-hidden="true"><svg class="i"><use href="#i-phone"/></svg></span><span class="mob-t"><b>${T('Scan mobile')}</b><span>${T('Scanne avec ton téléphone : chaque carte arrive ici.')}</span>${err ? `<em>${esc(err)}</em>` : ''}</span><button class="btn small" type="button" data-act="mobgo">${T('Activer')}</button>`;
}

/* ── Téléphone : bandeau « Ton PC attend des cartes », envoi des cartes scannées ───────────────────── */
function mobBar() {
  if (typeof document === 'undefined') return;
  clearTimeout(MOB.waitT);
  const d = mobWaiting(), show = !!d && !(SC.el && SC.remote) && MOB.hide !== d.s && !MOB.pc;
  let bar = $('#mobBar');
  if (!show) { if (bar) bar.remove(); return; }
  MOB.waitT = setTimeout(mobBar, Math.max(1000, MOB_FRESH - (Date.now() - (Number(d.at) || 0)) + 500));      // le PC se tait : le bandeau part tout seul
  if (!bar) {
    bar = document.createElement('div'); bar.id = 'mobBar'; bar.className = 'mob-bar'; bar.setAttribute('role', 'status');
    bar.addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      const w = mobWaiting(); haptic('tap');
      if (b.dataset.act === 'go' && w) { bar.remove(); openScan({ remote: true }); }
      else { MOB.hide = w ? w.s : ''; bar.remove(); }
    });
    document.body.appendChild(bar);
  }
  bar.innerHTML = `<span class="mob-ic" aria-hidden="true"><svg class="i"><use href="#i-phone"/></svg></span><span class="mob-t"><b>${T('Ton PC attend des cartes')}</b><span>${esc(d.by || T('Ordinateur'))}</span></span><button class="btn small" type="button" data-act="go">${T('Scanner')}</button><button class="icon-btn" type="button" data-act="no" aria-label="${T('Plus tard')}"><svg class="i"><use href="#i-close"/></svg></button>`;
}
/** Scan « vers ton PC » : envoie l'écart entre la liste du scan (cartes confirmées) et ce qui est déjà parti. Appelé à chaque repeint de la liste. */
function mobSync() {
  if (!SC.remote) return;
  const want = new Map();
  for (const e of SC.items.values()) if (!e.maybe && ((e.es !== 'load' && !e.artq) || MOB.sent.has(e.id))) want.set(e.id, e);      // édition en lecture : la carte part avec elle (une seconde plus tard)
  const ids = new Set([...want.keys(), ...MOB.sent.keys()]);
  for (const id of ids) {
    const e = want.get(id), was = MOB.sent.get(id), have = was ? was.q : 0, q = e ? e.q : 0;
    if (q === have) continue;
    const it = e || was;
    MOB.queue.push({ i: mobRand(), k: it.key || it.k, n: it.name || it.n, q: q - have, l: it.l || '', e: it.e || '' });
    if (q) MOB.sent.set(id, { k: it.key || it.k, n: it.name || it.n, l: it.l || '', e: it.e || '', q }); else MOB.sent.delete(id);
  }
  mobFlush();
}
async function mobFlush() {
  clearTimeout(MOB.retryT);
  if (MOB.busy || !MOB.queue.length || !D.user || !D.cloud || !D.cloud.scanPush) return;
  const batch = MOB.queue.slice(0, 20); MOB.busy = true;
  try { await D.cloud.scanPush(D.user.uid, batch); MOB.queue = MOB.queue.slice(batch.length); MOB.err = ''; }
  catch (e) { MOB.err = e && e.code === 'permission-denied' ? 'rules' : 'net'; MOB.retryT = setTimeout(mobFlush, 4000); }
  MOB.busy = false; scanPaintRemote();
  if (MOB.queue.length && !MOB.retryT) mobFlush();
}
/** Bandeau du scan « vers ton PC » : PC visé, cartes parties, envoi en attente ou erreur. */
function scanPaintRemote() {
  const el = SC.el && $('.sc-remote', SC.el); if (!el) return;
  const d = MOB.doc, n = [...MOB.sent.values()].reduce((a, x) => a + x.q, 0), wait = MOB.queue.length;
  el.hidden = false;
  el.innerHTML = `<svg class="i" aria-hidden="true"><use href="#i-phone"/></svg><span>${T('Vers ton PC')}${d && d.by ? ' · ' + esc(d.by) : ''} · ${wait ? T('envoi…') : TN(n, '{n} carte envoyée', '{n} cartes envoyées')}${MOB.err === 'rules' ? ' · ' + T('règles Firestore à publier') : MOB.err === 'net' && wait ? ' · ' + T('hors ligne : envoi au retour du réseau') : ''}</span>`;
}
