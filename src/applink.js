/* ── applink.js : liens https://manaorbit.app et appli Android ───────────────────────────────────────────────────────────────────────────
   Lien d'un autre joueur (liste d'échange ?p=, échange en direct ?troc=, plus tard ?partie=) scanné avec l'appareil photo ou touché dans une messagerie.
   · Appli Android 1.0.5 (versionCode 6) et plus : Android l'ouvre dans l'appli (App Links vérifiés : intent-filter autoVerify de MainActivity sur
     https://manaorbit.app/, fichier /.well-known/assetlinks.json servi par proxy.mjs avec la variable ASSETLINKS_SHA256).
     Capacitor charge toujours server.url (https://manaorbit.app/, sans le chemin ni les paramètres du lien) et ne navigue jamais tout seul : le lien
     arrive par @capacitor/app, App.getLaunchUrl() (appli lancée par le lien ; rendu tant que l'appli vit, même après un rechargement de la page) et
     l'événement « appUrlOpen » (appli déjà ouverte ; au lancement, le même lien est aussi rejoué une fois au premier addListener).
     aplOpen : même origine seulement ; page qui démarre → location.replace(lien), exactement comme un navigateur (écran de lancement court, trInit,
     handleLaunch), rien si c'est déjà l'adresse affichée ; appli déjà lancée → sur place (aplRoute : ce qui couvre la page se ferme comme pour un widget,
     puis openPublicLink / handleLaunch), sans rechargement : un scan, une saisie ou un deck en cours restent là.
     Adresse de lancement déjà suivie dans cette WebView (sessionStorage) : un rechargement (mise à jour, langue) ne la rejoue pas.
   · Navigateur Android (ni l'appli, ni la PWA installée ; jamais sur iPhone, iPad ou ordinateur, ni en mode streamer), page ouverte par un tel lien :
     barre discrète en bas, « Ouvrir dans l'appli Mana Orbit » (aplIntent : intent://manaorbit.app/<chemin et paramètres>#Intent;scheme=https;
     package=app.manaorbit;S.browser_fallback_url=<PLAY_URL>;end : l'appli si elle est installée, sinon sa fiche Play) et « Pas encore l'appli ?
     L'installer » (PLAY_URL, help.js). ✕ : plus de barre jusqu'à la fin de la session (onglet). La page garde sa place (css/applink.css : écrans,
     pied de page, toasts au-dessus d'elle) ; la bannière « Installer Mana Orbit » de la PWA (paintInstallBar) attend qu'elle soit fermée. */
const APL_HOST = 'manaorbit.app', APL_PKG = 'app.manaorbit';
const APL_KEYS = ['p', 'troc', 'partie'];      // paramètres d'un lien vers une page de l'appli : la barre du navigateur Android le propose dans l'appli
const APL_HERE = /^(p|troc|open|collection|import|delete-account|alerts|resume|amis?|text|url|title|splash|source|ref|utm_\w+)$/;      // lus sur place (openPublicLink, handleLaunch) ; un autre (futur ?partie=) : page chargée sur le lien
const APL_X = 'deckdeal:apl-x', APL_LAUNCH = 'deckdeal:apl-launch';      // sessionStorage : barre fermée ; adresse de lancement déjà suivie
const APL = { path: '/', q: '', last: '', lastAt: 0, bar: null };
if (typeof location !== 'undefined') { APL.path = location.pathname; APL.q = location.search; }      // lu au chargement : handleLaunch retire ensuite les paramètres de l'adresse

function aplSs(k, v) {
  try { if (v === undefined) return sessionStorage.getItem(k); if (v === null) sessionStorage.removeItem(k); else sessionStorage.setItem(k, v); } catch (e) { /* stockage bloqué */ }
  return null;
}

/** Adresse intent:// qui ouvre ce lien dans l'appli Android si elle est installée (Chrome, Samsung Internet…), sinon sa fiche Play. path : chemin et paramètres (« /?p=… »). */
function aplIntent(path) {
  let p = String(path || '/').replace(/#.*$/, ''); if (p[0] !== '/') p = '/' + p;
  p = p.replace(/^\/index\.html(?=$|\?)/, '/');      // la page de l'appli : le filtre de MainActivity attend « / »
  return 'intent://' + APL_HOST + p + '#Intent;scheme=https;package=' + APL_PKG + ';S.browser_fallback_url=' + encodeURIComponent(PLAY_URL) + ';end';
}

/* ── Navigateur Android : barre « Ouvrir dans l'appli Mana Orbit » ─────────────────────────────────────────────────────────────────── */
/** Page ouverte par un lien vers une page de l'appli (?p=, ?troc=, ?partie=). */
function aplLinked() { try { const q = new URLSearchParams(APL.q); return APL_KEYS.some(k => q.has(k)); } catch (e) { return false; } }
/** Navigateur Android : ni l'appli (WebView de la coque), ni la PWA installée. iPhone, iPad, ordinateurs : non. */
function aplAndroidWeb() { try { return /\bAndroid\b/i.test(navigator.userAgent) && !isNativeApp() && !PWA.standalone(); } catch (e) { return false; } }
function aplBarWanted() { return aplLinked() && aplAndroidWeb() && !aplSs(APL_X) && !(typeof streamOn === 'function' && streamOn()); }
/** Barre affichée en ce moment (paintInstallBar : jamais avec la bannière d'installation de la PWA). */
function aplBarOn() { return !!(APL.bar && APL.bar.isConnected); }
function aplBarSize() { if (aplBarOn()) document.documentElement.style.setProperty('--apl-h', APL.bar.offsetHeight + 'px'); }
function aplBar() {
  if (typeof document === 'undefined' || aplBarOn() || !aplBarWanted()) return;
  const el = APL.bar = document.createElement('aside');
  el.id = 'aplBar'; el.className = 'apl-bar'; el.setAttribute('aria-label', 'Mana Orbit');
  el.innerHTML = `<span class="apl-ico" aria-hidden="true"><svg class="logo"><use href="#i-logo"/></svg></span>
    <span class="apl-t"><a class="btn small apl-go" href="${esc(aplIntent(APL.path + APL.q))}">${esc(T('Ouvrir dans l\'appli Mana Orbit'))}</a>
      <span class="apl-get">${esc(T('Pas encore l\'appli ?'))} <a href="${esc(PLAY_URL)}" target="_blank" rel="noopener">${esc(T('L\'installer'))}</a></span></span>
    <button class="icon-btn apl-x" type="button" aria-label="${esc(T('Fermer'))}"><svg class="i"><use href="#i-close"/></svg></button>`;
  $('.apl-go', el).addEventListener('click', () => haptic('tap'));
  $('.apl-x', el).addEventListener('click', () => { haptic('tap'); aplSs(APL_X, '1'); aplBarOff(); });
  document.body.appendChild(el); document.body.classList.add('apl-on');
  aplBarSize(); addEventListener('resize', aplBarSize);
  if (typeof paintInstallBar === 'function') paintInstallBar();
}
function aplBarOff() {
  const el = APL.bar; APL.bar = null;
  document.body.classList.remove('apl-on'); removeEventListener('resize', aplBarSize);
  if (el) { el.classList.add('out'); setTimeout(() => el.remove(), 220); }
  if (typeof paintInstallBar === 'function') paintInstallBar();      // la bannière d'installation de la PWA peut revenir
}
/** Une fois l'écran de lancement parti et la page du lien affichée. Ailleurs (appli, iPhone, ordinateur, page sans lien) : rien, aucun écouteur. */
function aplBarSoon() {
  if (!aplLinked() || !aplAndroidWeb()) return;
  const go = () => setTimeout(aplBar, 500);
  if (typeof SPL !== 'undefined' && SPL.el) document.addEventListener('splashend', go, { once: true }); else go();
}

/* ── Appli Android : lien reçu d'Android (App Links) ───────────────────────────────────────────────────────────────────────────────── */
/** L'appli a fini de démarrer (handleLaunch passé) : un lien s'ouvre sur place ; avant, la page est chargée sur le lien. */
function aplReady() { return typeof WGT_LAUNCH !== 'undefined' && WGT_LAUNCH.done; }
/** Lien reçu d'Android (launch : App.getLaunchUrl, sinon l'événement « appUrlOpen ») → la page qu'il désigne. false : ignoré. */
function aplOpen(raw, launch) {
  let u; try { u = new URL(String(raw || '')); } catch (e) { return false; }
  if (u.origin !== location.origin) return false;      // jamais une autre origine : ni un autre site, ni l'ancienne adresse
  if (launch) { if (aplSs(APL_LAUNCH) === u.href) return false; aplSs(APL_LAUNCH, u.href); }      // adresse de lancement suivie une fois par WebView : un rechargement ne la rejoue pas
  const where = u.pathname + u.search, now = Date.now();
  if (where === APL.last && now - APL.lastAt < 3000) return false;      // le même lien deux fois au lancement : getLaunchUrl, et « appUrlOpen » rejoué
  APL.last = where; APL.lastAt = now;
  if (where === location.pathname + location.search) return true;      // déjà l'adresse affichée (page chargée par ce lien) : son démarrage s'en occupe
  if (!aplReady() || !/^\/(index\.html)?$/.test(u.pathname)) { location.replace(u.href); return true; }      // page qui démarre : chargée sur le lien, comme dans un navigateur
  aplRoute(u); return true;
}
/** Appli déjà lancée : le lien s'ouvre sur place, sans recharger la page. */
function aplRoute(u) {
  if ([...u.searchParams.keys()].some(k => !APL_HERE.test(k))) { location.replace(u.href); return; }      // paramètre que seul le démarrage lit (futur ?partie=) : comme un navigateur
  if (typeof UPD !== 'undefined') UPD.launchAt = Date.now();      // pas de rechargement automatique (mise à jour) qui perdrait la cible (pwa.js)
  if (typeof wgtFront === 'function') wgtFront();      // ferme ce qui couvre la page, comme un widget touché (sauf un scan avec des cartes, un deck modifié)
  try { history.replaceState(history.state, '', u.pathname + u.search); } catch (e) { location.replace(u.href); return; }
  const id = u.searchParams.get('p'); if (id) openPublicLink(id);
  handleLaunch();      // ?troc=, ?open=, ?ami…, ?delete-account… ; retire ensuite les paramètres de l'adresse
}
/** Écoute posée dès le chargement du script (avant init) : un lien gardé par Capacitor arrive au premier addListener. */
function aplNative() {
  const A = typeof natPlugin === 'function' ? natPlugin('App') : null; if (!A) return;
  try { Promise.resolve(A.addListener('appUrlOpen', e => aplOpen(e && e.url, false))).catch(() => {}); } catch (e) { /* coque sans l'événement */ }
  try { Promise.resolve(typeof A.getLaunchUrl === 'function' ? A.getLaunchUrl() : null).then(r => aplOpen(r && r.url, true)).catch(() => {}); } catch (e) { /* coque sans la méthode */ }
}
if (typeof document !== 'undefined') { aplNative(); setTimeout(aplBarSoon, 0); }      // barre : après init (main.js), qui ouvre la page du lien
