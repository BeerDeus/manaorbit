/* ── dsclink.js : invitation au Discord de l'accueil et liaison du compte Discord ─────────────────────────────────────────────────────────────
   · Accueil : bloc « Rejoins le Discord de Mana Orbit » juste après le bloc des parties (compteur de vie, #hmPartie, partie-ui.js ; à défaut sous l'Échange) :
     une ligne (bugs, idées, parties, Carte mystère), « Rejoindre » (DISCORD_URL de help.js, onglet à part ; dans l'appli Android, Android l'ouvre dans
     l'appli Discord ou le navigateur), et connecté, quand le serveur sait lier (/__ping discordLink → CTX.discordLink) : « J'y suis déjà : lier mon compte
     Discord ». Caché quand /api/discord/me dit lié et membre du serveur ; ✕ : caché 30 jours sur cet appareil.
   · Liaison (OAuth2 « Se connecter avec Discord », discord-srv.mjs) : POST api/discord/link → adresse d'autorisation de Discord, ouverte à part (navigateur :
     onglet ouvert tout de suite puis dirigé, sans quoi il serait bloqué ; appli Android : le navigateur) ; Discord renvoie sur une page du serveur
     (« Compte Discord lié ») ; au retour dans l'appli, l'état est relu.
   · État (GET api/discord/me → { linked, name, member }) relu au lancement, à la connexion et au retour sur l'appli (visibilitychange ; 30 s au moins entre
     deux lectures, sauf juste après « Lier » ou « Rejoindre ») ; gardé sur l'appareil (DL_KEY, une empreinte du compte, 1 jour) pour ne pas faire clignoter
     le bloc pendant que la session et le serveur se retrouvent au lancement.
   · Compte et réglages (me.js › dlMeRow) : ligne « Discord » (pseudo lié, « Lier », ou « Pas membre du serveur ») et sa feuille (dlSheet : lier, délier,
     rejoindre). Mode streamer : ni la ligne ni le pseudo (le groupe « Mon compte » est remplacé). Suppression du compte : délié (dlWipe). */
const DL_KEY = 'deckdeal:dsc:v1', DL_X_KEY = 'deckdeal:dsc-x', DL_X_DAYS = 30, DL_GAP = 30e3, DL_TTL = 86400e3;
const DL = { st: null, at: 0, busy: null, pending: false, inited: false };
const DL_ICON = '<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M19.3 5.4A16 16 0 0 0 15.4 4l-.5 1a15 15 0 0 0-5.8 0l-.5-1a16 16 0 0 0-3.9 1.4C2.2 9.1 1.5 12.7 1.8 16.3a16 16 0 0 0 4.8 2.4l1-1.6a10 10 0 0 1-1.6-.8l.4-.3a11.5 11.5 0 0 0 11.2 0l.4.3a10 10 0 0 1-1.6.8l1 1.6a16 16 0 0 0 4.8-2.4c.4-4.2-.6-7.8-2.9-10.9zM8.7 14.2c-1 0-1.7-.9-1.7-2s.8-2 1.7-2 1.8.9 1.7 2c0 1.1-.8 2-1.7 2zm6.6 0c-1 0-1.7-.9-1.7-2s.8-2 1.7-2 1.8.9 1.7 2c0 1.1-.8 2-1.7 2z"/></svg>';
const dlOn = () => !!(CTX.proxy && CTX.discordLink);
const dlWho = () => (D.user ? String(hash32('dsc|' + D.user.uid)) : '');      // empreinte du compte pour le cache (jamais l'identifiant lui-même)
/** État connu pour le compte : { l (lié), n (pseudo), m (membre), t } ; pendant que la session revient au lancement, celui du dernier compte. */
function dlState() {
  if (D.authReady && !D.user) return null;
  if (DL.st && DL.st.u === dlWho()) return DL.st;
  let c = null; try { c = JSON.parse(localStorage.getItem(DL_KEY) || 'null'); } catch (e) { c = null; }
  if (!c || typeof c !== 'object' || !(Date.now() - (Number(c.t) || 0) < DL_TTL)) return null;
  if (D.user ? c.u === dlWho() : !!D.hint) return c;
  return null;
}
function dlSave(st) {
  DL.st = st;
  try { if (st) localStorage.setItem(DL_KEY, JSON.stringify(st)); else localStorage.removeItem(DL_KEY); } catch (e) { /* stockage plein ou refusé : en mémoire */ }
}
const dlSig = () => { const s = dlOn() && D.user ? dlState() : null; return s ? (s.l ? 1 : 0) + (s.m ? 2 : 0) + '|' + s.n : dlOn() ? '-' : ''; };      // me.js › meSigNow
const dlXUntil = () => { try { return Number(localStorage.getItem(DL_X_KEY)) || 0; } catch (e) { return 0; } };
/** Le bloc de l'accueil se cache-t-il ? Lié et membre, ou ✕ il y a moins de 30 jours. */
function dlHidden() { const s = dlState(); return !!(s && s.l && s.m) || dlXUntil() > Date.now(); }

/** Appel de api/discord/<sub> avec le jeton Firebase (renouvelé une fois s'il a expiré). → { status, j } (status 0 : réseau). */
async function dlApi(sub, post) {
  const u = D.user; if (!u) return { status: 401, j: null };
  for (let a = 0; a < 2; a++) {
    let tok = ''; try { tok = await u.getIdToken(a > 0); } catch (e) { tok = ''; }
    if (!tok) return { status: 401, j: null };
    let r; try { r = await fetch('api/discord/' + sub, { method: post ? 'POST' : 'GET', cache: 'no-store', headers: { Accept: 'application/json', 'x-firebase-token': tok, ...(post ? { 'Content-Type': 'application/json' } : {}) }, body: post ? '{}' : undefined }); }
    catch (e) { return { status: 0, j: null }; }
    const j = await r.json().catch(() => null);
    if (r.status === 401 && j && j.error === 'token_expired' && a === 0) continue;
    if (r.status === 404) CTX.discordLink = false;      // liaison coupée sur le serveur : ni bouton ni ligne
    return { status: r.status, j };
  }
  return { status: 401, j: null };
}
/** Relit l'état sur le serveur (force : sans attendre DL_GAP). */
function dlCheck(force) {
  if (!dlOn() || !D.user) { dlPaint(); return Promise.resolve(); }
  if (DL.busy) return DL.busy;
  if (!force && !DL.pending && Date.now() - DL.at < DL_GAP && DL.st && DL.st.u === dlWho()) return Promise.resolve();
  const who = dlWho(); DL.at = Date.now(); DL.pending = false;
  DL.busy = dlApi('me').then(({ status, j }) => {
    if (who !== dlWho()) return;
    if (status === 200 && j && typeof j.linked === 'boolean') dlSave({ u: who, l: j.linked, n: j.linked ? String(j.name || '').slice(0, 80) : '', m: !!(j.linked && j.member), t: Date.now() });
  }).catch(() => {}).finally(() => { DL.busy = null; dlPaint(); });
  return DL.busy;
}
/** Connexion, déconnexion, autre compte (decks.js › onUser). */
function dlUser(user) { if (!user) { DL.st = null; dlPaint(); return; } if (DL.st && DL.st.u !== dlWho()) DL.st = null; dlCheck(true); }
/** Suppression du compte (decks.js) : liaison oubliée sur le serveur (sans bloquer la suppression). */
async function dlWipe() { if (!dlOn() || !D.user) return; try { await dlApi('unlink', true); } catch (e) { /* serveur injoignable : rien à faire de plus */ } dlSave(null); }

/** « Lier mon compte Discord » : adresse d'autorisation demandée au serveur, ouverte à part. Navigateur : l'onglet s'ouvre tout de suite (le geste de l'utilisateur
 *  l'autorise), puis il est dirigé vers Discord ; bloqué malgré tout : une feuille avec le lien. */
async function dlLink() {
  if (!D.user) { openAccount(); return; }
  haptic('tap');
  const nat = typeof isNativeApp === 'function' && isNativeApp();
  let w = null; if (!nat) { try { w = window.open('', '_blank'); } catch (e) { w = null; } }
  if (w) { try { w.opener = null; w.document.title = 'Discord'; } catch (e) { /* autre origine */ } }
  const { status, j } = await dlApi('link', true);
  const url = status === 200 && j && typeof j.url === 'string' && /^https:\/\/discord\.com\//.test(j.url) ? j.url : '';
  if (!url) {
    if (w) { try { w.close(); } catch (e) { /* déjà fermé */ } }
    toast(status === 0 ? T('Hors ligne : réessaie une fois connecté.') : status === 429 ? T('Trop d\'essais : réessaie dans quelques minutes.') : T('Liaison impossible pour le moment : réessaie plus tard.'));
    dlPaint(); return;
  }
  DL.pending = true;      // au retour sur l'appli : état relu tout de suite
  if (nat) { window.open(url, '_blank', 'noopener'); return; }
  if (w) { try { w.location.replace(url); return; } catch (e) { /* fenêtre perdue */ } }
  openSheet(T('Lier mon compte Discord'), null, a => {
    a.body.innerHTML = `<p class="hint">${T('Ton navigateur a bloqué la nouvelle fenêtre : ouvre Discord avec ce bouton.')}</p>`;
    a.setFoot(`<a class="btn" href="${esc(url)}" target="_blank" rel="noopener" data-close>${T('Ouvrir Discord')}</a>`);
  });
}
const dlJoinA = (cls, label) => `<a class="${cls}" data-dl="join" href="${esc(DISCORD_URL)}" target="_blank" rel="noopener">${label || T('Rejoindre')}</a>`;

/* ── Accueil ── */
function dlHomeInit() {
  if (DL.inited || !$('#viewHome')) return; DL.inited = true;
  const tr = $('#hmTrade'); if (!tr) return;
  tr.insertAdjacentHTML('afterend', `<section class="hm-trade hm-dsc" id="hmDiscord" aria-labelledby="hmDscT" hidden>
      <div class="hm-tr-h"><span class="hm-tr-ic" aria-hidden="true">${DL_ICON}</span><span class="hm-tr-t"><b id="hmDscT">${T('Rejoins le Discord de Mana Orbit')}</b><span class="hm-dsc-sub"></span></span>
        <button class="icon-btn hm-dsc-x" type="button" data-dl="x" aria-label="${T('Masquer pendant 30 jours')}" title="${T('Masquer pendant 30 jours')}"><svg class="i" aria-hidden="true"><use href="#i-close"/></svg></button></div>
      <div class="hm-dsc-acts">${dlJoinA('btn')}<button class="btn ghost hm-dsc-link" type="button" data-dl="link" hidden>${T('J\'y suis déjà : lier mon compte Discord')}</button></div></section>`);
  $('#hmDiscord').addEventListener('click', e => {
    const b = e.target.closest('[data-dl]'); if (!b) return;
    if (b.dataset.dl === 'join') { haptic('tap'); DL.pending = true; return; }      // lien : s'ouvre à part ; au retour, l'état est relu
    if (b.dataset.dl === 'link') { dlLink(); return; }
    if (b.dataset.dl === 'x') { haptic('tap'); try { localStorage.setItem(DL_X_KEY, String(Date.now() + DL_X_DAYS * 86400e3)); } catch (err) { /* caché pour cette fois */ } dlPaint(); toast(T('Invitation masquée pendant 30 jours. Le Discord reste dans Réglages › Aide et avis.')); }
  });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) dlCheck(DL.pending); });
  setTimeout(dlPlace, 0);      // une fois la carte des parties posée (partie-ui.js › puHomeInit, juste après homeInit)
  dlPaint();
}
/** Le bloc juste après celui des parties (#hmPartie : le compteur de vie passe devant l'invitation) ; sans lui, sous l'Échange. */
function dlPlace() {
  const box = $('#hmDiscord'); if (!box) return;
  const pt = $('#hmPartie'), tr = $('#hmTrade');
  if (pt && pt.parentNode) { if (pt.nextElementSibling !== box) pt.after(box); }
  else if (tr && tr.parentNode && tr.nextElementSibling !== box) tr.after(box);
}
/** Bloc de l'accueil et fiche du compte repeints. */
function dlPaint() {
  const box = $('#hmDiscord');
  if (box) {
    dlPlace();
    const s = dlState(), hide = dlHidden(); box.hidden = hide;
    if (!hide) {
      const linked = !!(s && s.l), canLink = dlOn() && !!D.user && !linked;
      $('.hm-dsc-sub', box).textContent = linked ? T('Ton compte Discord est lié, mais tu n\'es pas encore sur le serveur.') : T('Bugs, idées, parties, Carte mystère : on en parle là-bas.');
      $('.hm-dsc-link', box).hidden = !canLink;
      box.classList.toggle('two', canLink);
    }
  }
  if (typeof meSoon === 'function') meSoon();
}

/* ── Compte et réglages ── */
/** Ligne « Discord » de « Mon compte » (me.js) : vide sans liaison possible. */
function dlMeRow() {
  if (!dlOn() || !D.user) return '';
  const s = dlState();
  const v = !s ? '' : s.l && s.m ? esc(s.n || 'Discord') : s.l ? T('Pas membre du serveur') : T('Lier');
  return meRow('discord', 'Discord', v, !!(s && s.l && !s.m), 'meDsc');
}
function dlSheet() {
  if (!D.user) { openAccount(); return; }
  const api = openSheet('Discord', T('Serveur de la communauté Mana Orbit'), a => {
    a.wrap.classList.add('dl-sheet');
    const paint = () => {
      if (sheets.indexOf(a) < 0) return;
      const s = dlState(), linked = !!(s && s.l);
      a.body.innerHTML = `<div class="dl-head"><span class="dl-ic" aria-hidden="true">${DL_ICON}</span><div>`
        + (linked ? `<b>${T('Lié à {name}', { name: `<span class="dl-name">${esc(s.n || 'Discord')}</span>` })}</b><span class="hint">${s.m ? T('Membre du serveur Mana Orbit : l\'invitation n\'est plus sur l\'accueil.') : T('Pas encore membre du serveur : rejoins-le, l\'appli le verra d\'elle-même (en quelques minutes).')}</span>`
          : `<b>${T('Compte Discord non lié')}</b><span class="hint">${T('Lie ton compte Discord : l\'appli saura que tu es sur le serveur et ne t\'invitera plus à le rejoindre.')}</span>`)
        + `</div></div><p class="hint dl-why">${T('Seuls ton identifiant et ton pseudo Discord sont gardés par le serveur de Mana Orbit, pour savoir si tu es membre ; rien d\'autre (ni e-mail, ni messages, ni serveurs). Délier les efface.')}</p>`;
      a.setFoot(linked
        ? `<button class="btn ghost-danger" type="button" data-dls="unlink">${T('Délier')}</button>${dlJoinA('btn', s.m ? T('Ouvrir le Discord') : T('Rejoindre'))}`
        : `${dlJoinA('btn ghost')}<button class="btn" type="button" data-dls="link">${T('Lier mon compte Discord')}</button>`);
    };
    a.dlPaint = paint; paint();
    a.wrap.addEventListener('click', async e => {
      const j = e.target.closest('[data-dl="join"]'); if (j) { DL.pending = true; return; }
      const b = e.target.closest('[data-dls]'); if (!b) return;
      if (b.dataset.dls === 'link') { a.close(); dlLink(); return; }
      haptic('tap'); b.disabled = true;
      const { status } = await dlApi('unlink', true);
      if (status === 200) { dlSave({ u: dlWho(), l: false, n: '', m: false, t: Date.now() }); toast(T('Compte Discord délié')); a.close(); dlPaint(); }
      else { b.disabled = false; toast(status === 0 ? T('Hors ligne : réessaie une fois connecté.') : T('Impossible de délier pour le moment : réessaie plus tard.')); }
    });
  });
  dlCheck(true).then(() => { if (api.dlPaint) api.dlPaint(); });
}
