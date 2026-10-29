/* ── onboard.js : premier lancement ───────────────────────────────────────────────────────────────
   Trois écrans, une seule fois, seulement sur un appareil vierge (ni collection, ni deck, ni token) :
   1. Bienvenue · 2. Ta collection (importer un fichier, scanner, plus tard) · 3. Sauvegarde ta collection : « Continuer avec Google » en une touche
   (même connexion que la feuille Compte, cloud.js), « Autres options (e-mail) » ouvre cette feuille, « Plus tard » ; hors ligne ou service de compte
   injoignable : un mot et « Plus tard » seulement ; déjà connecté : « C'est parti ». Le token CardTrader n'est plus demandé ici (Compte et réglages › Prix,
   lien discret « Tu as un token CardTrader ? »).
   4. Notifications (evpush.js), seulement si elles ont un sens ici (serveur qui les propose, fenêtre d'autorisation possible : evpAskable) : à quoi elles servent,
   « Activer les notifications » ouvre la fenêtre native (Android, navigateur ; iPhone : app installée seulement), « Plus tard » ; jamais redemandé ensuite
   (Compte et réglages › Notifications pour changer d'avis). Ajoutée dès que le serveur a répondu (obPushCheck), atteinte depuis l'étape 3.
   Passé, terminé ou abandonné : on ne le revoit plus (deckdeal:onboard). Les navigateurs pilotés par les tests ne le voient pas, sauf avec ?onboarding. */
const OB_KEY = 'deckdeal:onboard';
const OB_FORCE = typeof location !== 'undefined' && /[?&]onboarding\b/.test(location.search);
const OB = { el: null, i: 0, key: null, net: null };

function obSeen() { try { return !!localStorage.getItem(OB_KEY); } catch (e) { return true; } }
function obMark() { try { localStorage.setItem(OB_KEY, String(Date.now())); } catch (e) { /* ignore */ } }
function obMaybe() {
  if (OB.el || obSeen()) return;
  const fresh = !collCount() && !allDecks().length && !S.token;
  if (!fresh) { obMark(); return; }                                                    // déjà utilisée sur cet appareil : jamais d'accueil
  if (typeof navigator !== 'undefined' && navigator.webdriver && !OB_FORCE) return;     // tests automatisés : l'accueil masquerait l'appli
  obOpen();
}
function obOpen() {
  const el = OB.el = document.createElement('div');
  el.className = 'ob'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-label', T('Bienvenue dans Mana Orbit'));
  el.innerHTML = `<div class="ob-aura" aria-hidden="true"><i></i><i></i><i></i><i></i></div>
    <button class="link-btn ob-skip" type="button" data-ob="skip">${T('Passer')}</button>
    <div class="ob-track">
      <section class="ob-s" aria-label="${T('Bienvenue')}">
        <div class="ob-lang" role="group" aria-label="${T('Langue')}">${i18nLangs().map(([c, n]) => `<button type="button" class="ob-chip${c === I18N.lang ? ' on' : ''}" data-ob="lang:${c}" aria-pressed="${c === I18N.lang}">${esc(n)}</button>`).join('')}</div>
        <div class="ob-logo"><svg class="logo" aria-hidden="true"><use href="#i-logo"/></svg></div>
        <h1>${T('Bienvenue dans {app}', { app: '<span class="foil-t">Mana Orbit</span>' })}</h1>
        <p>${T('Ta collection Magic et sa valeur au jour le jour, tes decks, et les meilleurs prix pour les compléter.')}</p>
        <ul class="ob-pts"><li><b>${T('Collection')}</b><span>${T('Importe, scanne, suis ce qu\'elle vaut.')}</span></li><li><b>${T('Decks')}</b><span>${T('Les decks EDHREC dont tu as déjà le plus de cartes.')}</span></li><li><b>${T('Prix')}</b><span>${T('Cardmarket chaque jour, CardTrader pour remplir ton panier.')}</span></li></ul>
        <button class="btn block" type="button" data-ob="next">${T('Commencer')}</button>
      </section>
      <section class="ob-s" aria-label="${T('Ta collection')}">
        <h2>${T('Ajoute ta collection')}</h2>
        <p>${T('Tu l\'as déjà dans une autre appli ? Exporte-la en CSV et importe le fichier : c\'est le plus rapide.')}</p>
        <button class="link-btn ob-swg" type="button" data-ob="swg">${T('Tu viens de ManaBox ? Voir comment l\'exporter')}</button>
        <div class="ob-opts">
          <button class="ob-opt" type="button" data-ob="import"><svg class="i"><use href="#i-download"/></svg><b>${T('Importer un fichier')}</b><span>${T('CSV de ManaBox, Moxfield, Dragon Shield, Archidekt, Deckbox… ou une liste « 3 Sol Ring ».')}</span></button>
          <button class="ob-opt" type="button" data-ob="scan"><svg class="i"><use href="#i-camera"/></svg><b>${T('Scanner mes cartes')}</b><span>${nmT('L\'appareil photo lit le nom de la carte, en français ou en anglais.', 'L\'appareil photo lit le nom de la carte, en {lang} ou en anglais.', 'L\'appareil photo lit le nom de la carte.')}</span></button>
        </div>
        <button class="btn ghost block" type="button" data-ob="next">${T('Plus tard')}</button>
      </section>
      <section class="ob-s ob-save" aria-label="${T('Sauvegarde ta collection')}">
        <span class="ob-save-ic" aria-hidden="true"><svg class="i"><use href="#i-cloud"/></svg></span>
        <h2>${T('Sauvegarde ta collection')}</h2>
        <p>${T('Un compte gratuit garde ta collection, tes decks et ta liste d\'échange, et les retrouve sur tous tes appareils.')}</p>
        <div class="ob-acts" id="obSave"></div>
      </section>
    </div>
    <div class="ob-dots" aria-hidden="true"><i></i><i></i><i></i></div>`;
  document.body.appendChild(el);
  holdApp();      // dialogue modal : l'appli dessous (inerte) ne prend ni le focus ni le lecteur d'écran (viewer.js)
  OB.key = e => { if (e.key === 'Escape' && OB.el && !sheets.length) { e.stopPropagation(); obClose(); } };      // Échap = « Passer »
  document.addEventListener('keydown', OB.key);
  OB.i = 0; obGo(0); obPushCheck();
  el.addEventListener('click', e => {
    const b = e.target.closest('[data-ob]'); if (!b) return;
    const a = b.dataset.ob; haptic('tap');
    if (a.startsWith('lang:')) { const c = a.slice(5); if (c !== I18N.lang) { try { localStorage.setItem('deckdeal:lang', c); } catch (x) { /* ignore */ } location.reload(); } return; }
    if (a === 'next') obGo(OB.i + 1);
    else if (a === 'skip') obClose();
    else if (a === 'import') obClose(() => openCollImport());
    else if (a === 'swg') obClose(() => swgOpen({ from: 'onboard' }));      // guide « Passer de ManaBox » (switch.js)
    else if (a === 'scan') obClose(() => openScan());
    else if (a === 'done') { if (OB.i === 2 && obPushStep()) obGo(3); else { if (OB.i === 3 && typeof evpAskLater === 'function') evpAskLater(); obClose(); } }      // étape 3 → notifications (s'il y en a une) ; étape 4 « Plus tard » : jamais redemandé
    else if (a === 'push') obPush(b);
    else if (a === 'google') obGoogle(b);
    else if (a === 'account') obClose(() => openAccount());
    else if (a === 'ct') obClose(() => openSettings('prix'));      // token CardTrader : Compte et réglages › Prix
  });
  OB.net = () => obSavePaint();
  window.addEventListener('online', OB.net); window.addEventListener('offline', OB.net);
  obSavePaint();
  // glisser d'un écran à l'autre
  let x0 = null;
  el.addEventListener('touchstart', e => { x0 = e.touches[0].clientX; }, { passive: true });
  el.addEventListener('touchend', e => { if (x0 == null) return; const dx = e.changedTouches[0].clientX - x0; x0 = null; if (Math.abs(dx) > 60) obGo(OB.i + (dx < 0 ? 1 : -1)); }, { passive: true });
  requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('on')));
}
function obGo(i) {
  const el = OB.el; if (!el) return;
  OB.i = Math.max(0, Math.min($$('.ob-s', el).length - 1, i));
  $('.ob-track', el).style.transform = `translateX(${-OB.i * 100}%)`;
  $$('.ob-dots i', el).forEach((d, k) => d.classList.toggle('on', k === OB.i));
  $$('.ob-s', el).forEach((s, k) => { s.inert = k !== OB.i; s.setAttribute('aria-hidden', String(k !== OB.i)); });
  $('.ob-skip', el).hidden = OB.i >= 2;
  if (OB.i === 3) setTimeout(() => { const f = OB.el && $('.ob-push [data-ob="push"]', OB.el); if (f && OB.i === 3) f.focus({ preventScroll: true }); }, 60);      // étape des notifications : son bouton prend le focus (clavier, lecteur d'écran)
}
/** Étape « Notifications » présente ? */
const obPushStep = () => !!(OB.el && $('.ob-push', OB.el));
/** Ajoute l'étape « Notifications » quand elle a un sens ici (evpush.js › evpAskable), dès que le serveur a répondu (8 s au plus). */
async function obPushCheck() {
  const el = OB.el; if (typeof evpAskable !== 'function') return;
  for (let t = 0; t < 8000 && OB.el === el && !CTX.proxy; t += 300) await sleep(300);
  if (OB.el !== el || obPushStep() || !(await evpAskable()) || OB.el !== el) return;
  $('.ob-track', el).insertAdjacentHTML('beforeend', evpStepHtml());
  $('.ob-dots', el).insertAdjacentHTML('beforeend', '<i></i>');
  obGo(OB.i);
}
/** « Activer les notifications » : la fenêtre native ; acceptée → « Notifications activées » ; refusée ou fermée : un mot, l'appli (rien d'autre n'est demandé). */
async function obPush(b) {
  if (b.disabled) return; b.disabled = true; b.setAttribute('aria-busy', 'true');
  let r; try { r = await evpAskNow(); } catch (e) { r = { ok: false }; }
  obClose();
  if (r.ok) { haptic('ok'); toast(T('Notifications activées')); }
  else if (r.why === 'denied' || r.why === 'dismissed') toast(T('Pas de souci : tu pourras les activer dans Compte et réglages › Notifications.'));
  else toast(alWhy(r));
}
/** Retour du téléphone : écran précédent, ou fermeture depuis le premier. */
function obBack() { if (OB.i > 0) obGo(OB.i - 1); else obClose(); }
/** Étape 3 : ce que l'état du compte permet (repeinte à chaque changement : chargement du SDK, connexion, réseau ; paintAccount de decks.js l'appelle). */
function obSavePaint() {
  const box = OB.el && $('#obSave', OB.el); if (!box) return;
  const off = (typeof navigator !== 'undefined' && navigator.onLine === false) || D.state === 'unavailable';
  const k = D.user ? 'in' : off ? 'off' : D.state === 'ready' && D.cloud ? 'ok' : 'wait';
  if (box.dataset.k === k) return;      // même état : les boutons gardent le focus et le message
  const had = box.contains(document.activeElement); box.dataset.k = k;
  const later = `<button class="btn ghost block" type="button" data-ob="done">${T('Plus tard')}</button>`;
  if (k === 'in') box.innerHTML = `<p class="ob-save-ok">${T('Tu es connecté : ta collection est sauvegardée sur ton compte.')}</p><button class="btn block" type="button" data-ob="done">${T('C\'est parti')}</button>`;
  else if (k === 'off') box.innerHTML = `<p class="ob-save-off" role="status">${T('Pas de connexion pour l\'instant. Ta collection reste sur cet appareil : tu pourras la sauvegarder plus tard dans Compte et réglages.')}</p>${later}`;
  else box.innerHTML = `${googleBtnHtml(`data-ob="google"${k === 'wait' ? ' disabled aria-busy="true"' : ''}`, true)}
    <button class="link-btn" type="button" data-ob="account">${T('Autres options (e-mail)')}</button>
    <div class="auth-msg" id="obMsg" role="alert" hidden></div>
    ${later}${mkUs() ? '' : `
    <button class="link-btn ob-ct" type="button" data-ob="ct">${T('Tu as un token CardTrader ?')}</button>`}`;
  if (had && OB.i === 2) { const f = $('button:not([disabled])', box); if (f) f.focus(); }
}
/** « Continuer avec Google » : la fenêtre de Google (ou le compte du téléphone dans l'appli), comme la feuille Compte ; connecté → l'appli. */
async function obGoogle(b) {
  if (!D.cloud || D.state !== 'ready' || b.disabled) return;
  const m = OB.el && $('#obMsg', OB.el); if (m) m.hidden = true;
  b.disabled = true;
  try { await D.cloud.google(); toast(T('Connecté')); if (obPushStep()) obGo(3); else obClose(); }      // connecté : l'étape des notifications s'il y en a une, sinon l'appli
  catch (e) {
    b.disabled = false; const t = authMessage(e), mm = OB.el && $('#obMsg', OB.el);
    if (t && mm) { mm.textContent = t; mm.hidden = false; }      // fenêtre fermée par l'utilisateur : rien à dire
  }
}
function obClose(then) {
  const el = OB.el; if (!el) return; OB.el = null; obMark();
  document.removeEventListener('keydown', OB.key); releaseApp();
  if (OB.net) { window.removeEventListener('online', OB.net); window.removeEventListener('offline', OB.net); OB.net = null; }
  el.classList.remove('on'); setTimeout(() => el.remove(), reduceMotion() ? 0 : 380);
  homeSoon(0);
  if (then) setTimeout(then, reduceMotion() ? 0 : 260);
  if (typeof tourOffer === 'function') tourOffer();      // « Une petite visite… ? » (tour.js), dès que l'accueil est au calme
}
