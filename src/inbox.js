/* ── inbox.js : « Messages de l'équipe » — ce que l'équipe a à te dire, à toi (serveur : inbox-srv.mjs, /api/inbox) ───────────────────────────
   Un scan que tu as signalé est réglé, l'équipe a répondu à ton avis (texte de la réponse recopié depuis le fil Discord : lisible sans Discord), ou un message
   envoyé depuis le panneau. Chaque message arrive aussi en notification (toucher : ./?inbox=1, push.js › pushOpen, app.js › handleLaunch) ; sans notification,
   la feuille s'ouvre d'elle-même à la prochaine ouverture de l'appli (une fois par message : ibAuto), et le point du bouton du compte et la ligne
   « Messages de l'équipe » de « Compte et réglages » le montrent.
   Lu au démarrage une fois connecté, puis au retour sur l'appli (toutes les 5 min au plus) ; la feuille ouverte marque tout comme lu. Serveur sans la boîte
   (/__ping inbox: false) ou déconnecté : rien n'est montré. */
const IB = { uid: '', items: null, unread: 0, at: 0, p: null, sheet: null, autoT: 0 };
const ibOn = () => !!(typeof CTX !== 'undefined' && CTX.proxy && CTX.inbox && D.user);
/** Appel de /api/inbox avec le jeton Firebase (renouvelé une fois s'il a expiré) → corps JSON ; erreur : { code, status }. */
async function ibCall(path = '', method = 'GET', body) {
  const u = D.user; if (!u) throw Object.assign(new Error('déconnecté'), { code: 'auth_required' });
  for (let a = 0; a < 2; a++) {
    let tok = ''; try { tok = await u.getIdToken(a > 0); } catch (e) { throw Object.assign(new Error('jeton'), { code: 'net' }); }
    let r; try { r = await fetchT('api/inbox' + path, { method, cache: 'no-store', headers: { Accept: 'application/json', 'x-firebase-token': tok, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined }, 10000); }
    catch (e) { throw Object.assign(new Error('réseau'), { code: 'net' }); }
    const j = await r.json().catch(() => null);
    if (r.status === 401 && j && j.error === 'token_expired' && !a) continue;
    if (!r.ok) throw Object.assign(new Error((j && j.message) || 'HTTP ' + r.status), { code: (j && j.error) || 'http', status: r.status });
    return j || {};
  }
  throw Object.assign(new Error('jeton'), { code: 'auth_required' });
}
/** Relit la boîte (au plus toutes les 5 min, sauf force) ; pastille et fiche du compte repeintes. */
function ibLoad(force) {
  if (!ibOn()) { if (IB.items) { IB.items = null; IB.unread = 0; ibPaint(); } return Promise.resolve(); }
  if (IB.p) return IB.p;
  if (!force && IB.uid === D.user.uid && Date.now() - IB.at < 5 * 60e3) return Promise.resolve();
  const uid = D.user.uid;
  const p = IB.p = ibCall().then(j => {
    if (!D.user || D.user.uid !== uid) return;
    IB.uid = uid; IB.at = Date.now(); IB.items = Array.isArray(j.items) ? j.items.filter(x => x && typeof x.id === 'string') : []; IB.unread = Number(j.unread) || 0;
    ibPaint(); ibAuto();
  }).catch(() => { /* hors ligne, serveur d'avant : la pastille reste comme elle est */ }).finally(() => { if (IB.p === p) IB.p = null; });
  return p;
}
/** Message jamais montré (non lu, de moins de 14 jours) : la feuille s'ouvre d'elle-même à l'ouverture de l'appli ou au retour dedans, une fois par message
 *  (ids gardés sur l'appareil), quand l'écran est libre (ni accueil des nouveaux, ni visite guidée, ni feuille, ni scan, ni mode streamer). */
const IB_SHOWN = 'deckdeal:ibShown';
function ibAuto(n = 0) {
  if (!ibOn() || !IB.items || IB.sheet) return;
  let seen; try { seen = new Set(JSON.parse(localStorage.getItem(IB_SHOWN) || '[]')); } catch (e) { return; }
  const fresh = IB.items.filter(x => !x.r && !seen.has(x.id) && Date.now() - x.t < 14 * 864e5);
  if (!fresh.length) return;
  const busy = document.hidden || (typeof OB !== 'undefined' && OB.el) || (typeof TOUR !== 'undefined' && TOUR.on) || (typeof sheets !== 'undefined' && sheets.length) || (typeof SC !== 'undefined' && SC.el) || (typeof streamOn === 'function' && streamOn());
  if (busy) { clearTimeout(IB.autoT); if (n < 40) IB.autoT = setTimeout(() => ibAuto(n + 1), 3000); return; }
  for (const x of fresh) seen.add(x.id);
  try { localStorage.setItem(IB_SHOWN, JSON.stringify([...seen].slice(-100))); } catch (e) { return; }
  openInbox();
}
/** Compte changé (decks.js › onAuth) : boîte du nouveau compte, ou rien. */
function ibUser(user) {
  if (!user || user.uid !== IB.uid) { IB.items = null; IB.unread = 0; IB.at = 0; IB.uid = ''; ibPaint(); }
  if (user) setTimeout(() => ibLoad(true), 1500);
}
/** /__ping vient de répondre (app.js) : la boîte existe peut-être maintenant. */
function ibPing() { if (ibOn() && !IB.items) ibLoad(true); }
const ibUnread = () => (ibOn() && IB.items ? IB.unread : 0);
/** Pastille du bouton du compte (avec les demandes d'ami : friends.js › amDot), fiche « Compte et réglages », feuille ouverte. */
function ibPaint() {
  if (typeof amDot === 'function') amDot();
  if (typeof meSoon === 'function' && typeof ME !== 'undefined' && ME.api) meSoon();
  if (IB.sheet && IB.sheet.paint) IB.sheet.paint();
}
/** Ligne « Messages de l'équipe » de « Compte et réglages › Mon compte » (seulement s'il y a eu au moins un message). */
function ibMeRow() {
  if (!ibOn() || !IB.items || !IB.items.length) return '';
  const n = IB.unread;
  return meRow('inbox', T('Messages de l\'équipe'), n ? `<span class="am-hot">${esc(TN(n, '{n} nouveau', '{n} nouveaux'))}</span>` : esc(nf0(IB.items.length)), false, 'meInbox');
}
const IB_TAGS = { 'confirme': 'Confirmé', 'prochaine version': 'Prochaine version', 'corrige': 'Corrigé', 'pas un bug': 'Pas un bug', 'doublon': 'Doublon', 'envisage': 'Envisagé', 'prevu': 'Prévu', 'fait': 'Fait', 'pas pour l\'instant': 'Pas pour l\'instant' };
const ibFold = s => String(s || '').normalize('NFD').replace(/\p{M}/gu, '').trim().toLowerCase();
/** Titre et texte d'un message, dans la langue de l'appli : { title, lead (phrase de l'appli), text (mot de l'équipe, tel quel) }. */
function ibText(it) {
  if (it.k === 'scan') return { title: T('Ton scan signalé est réglé'), lead: it.s ? T('« {card} » est maintenant reconnue. Merci pour ton signalement !', { card: it.s }) : T('La carte que tu as signalée est maintenant reconnue. Merci pour ton signalement !'), text: it.x || '' };
  if (it.k === 'avis') {
    const ev = it.ev || {}, parts = [];
    if (ev.replies) parts.push(TN(ev.replies, '{n} réponse de l\'équipe', '{n} réponses de l\'équipe'));
    if (ev.tags && ev.tags.length) parts.push(T('marqué {tags}', { tags: ev.tags.map(t => (IB_TAGS[ibFold(t)] ? T(IB_TAGS[ibFold(t)]) : t)).join(', ') }));
    if (ev.close) parts.push(T('fil fermé'));
    return { title: T('Du nouveau sur ton avis'), lead: (it.s ? T('« {title} »', { title: it.s }) + (parts.length ? ' · ' : '') : '') + parts.join(' · '), text: it.x || '' };
  }
  return { title: T('Message de l\'équipe Mana Orbit'), lead: '', text: it.x || '' };
}
const IB_ICON = { scan: '#i-camera', avis: '#i-bug', msg: '#i-bell' };
/** La feuille « Messages de l'équipe » : les plus récents d'abord ; ouverte, tout est marqué lu (les nouveaux restent en évidence jusqu'à la fermeture). */
function openInbox() {
  if (!ibOn()) { if (!D.user && typeof openAccount === 'function') openAccount(); return; }
  if (IB.sheet) return;
  openSheet(T('Messages de l\'équipe'), T('Ce que l\'équipe de Mana Orbit a à te dire'), api => {
    IB.sheet = api; api.wrap.classList.add('tmb-sheet');
    const fresh = new Set((IB.items || []).filter(x => !x.r).map(x => x.id));      // en évidence pendant cette ouverture
    const when = t => { try { return new Intl.DateTimeFormat(I18N.lang || 'fr', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(t); } catch (e) { return ''; } };
    api.paint = () => {
      const items = IB.items;
      if (!items) { api.body.innerHTML = `<p class="hint">${T('Chargement…')}</p>`; return; }
      if (!items.length) { api.body.innerHTML = `<p class="tmb-empty">${T('Aucun message pour l\'instant. Quand l\'équipe règle un scan que tu as signalé ou répond à ton avis, tu le retrouves ici.')}</p>`; return; }
      api.body.innerHTML = `<ul class="tmb-list">${items.map(it => {
        const t = ibText(it), ic = IB_ICON[it.k] || '#i-bell';
        return `<li class="tmb-it${fresh.has(it.id) ? ' new' : ''}" data-id="${esc(it.id)}"><span class="tmb-ic" aria-hidden="true"><svg class="i"><use href="${ic}"/></svg></span><div class="tmb-b">
          <p class="tmb-h"><b>${esc(t.title)}</b><small>${esc(when(it.t))}</small></p>${t.lead ? `<p class="tmb-l">${esc(t.lead)}</p>` : ''}${t.text ? `<p class="tmb-x">${esc(t.text)}</p>` : ''}
          <div class="tmb-a">${it.k === 'avis' && it.u ? `<button type="button" class="btn ghost small" data-ib="see">${T('Voir le fil sur Discord')}</button>` : ''}<button type="button" class="btn ghost small" data-ib="del" aria-label="${esc(T('Supprimer ce message'))}">${T('Supprimer')}</button></div></div></li>`;
      }).join('')}</ul>`;
    };
    api.paint();
    api.body.addEventListener('click', async e => {
      const b = e.target.closest('[data-ib]'), li = b && b.closest('.tmb-it'), it = li && (IB.items || []).find(x => x.id === li.dataset.id); if (!it) return;
      haptic('tap');
      if (b.dataset.ib === 'see' && typeof fbAvisOpen === 'function') fbAvisOpen(it.u);
      else if (b.dataset.ib === 'del') {
        b.disabled = true;
        try { const j = await ibCall('/' + encodeURIComponent(it.id), 'DELETE'); IB.items = IB.items.filter(x => x.id !== it.id); IB.unread = Number(j.unread) || 0; ibPaint(); }
        catch (err) { b.disabled = false; toast(err.code === 'net' ? T('Hors ligne : réessaie une fois connecté') : T('Suppression impossible pour le moment.')); }
      }
    });
    const was = api.close; api.close = () => { IB.sheet = null; was(); };
    ibLoad(true).then(() => {      // relue à l'ouverture, puis tout marqué lu
      if (!IB.items || !IB.items.some(x => !x.r)) return;
      for (const x of IB.items) if (!x.r) fresh.add(x.id);
      IB.items.forEach(x => { x.r = 1; }); IB.unread = 0; ibPaint();
      ibCall('/read', 'POST', { all: true }).catch(() => { IB.at = 0; });      // pas enregistré (hors ligne) : relu à la prochaine fois
    });
  });
}
/** Notification touchée (push.js › pushOpen) ou lien ./?inbox=1 (app.js › handleLaunch) → la feuille ; true si c'était bien la boîte. */
function ibPushOpen(u) {
  if (!/[?&]inbox\b/.test(String(u || ''))) return false;
  const go = (n = 0) => { if (ibOn()) openInbox(); else if (n < 20) setTimeout(() => go(n + 1), 500); };      // au démarrage : compte et /__ping d'abord
  setTimeout(go, 400); return true;
}
if (typeof document !== 'undefined') document.addEventListener('visibilitychange', () => { if (!document.hidden && ibOn()) ibLoad(false); });
