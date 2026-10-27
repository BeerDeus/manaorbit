/* ── ads.js : bandeau de pub (appli Android) ──────────────────────────────────────────────────────
   Un petit bandeau Google AdMob SOUS L'EN-TÊTE (emplacement choisi le 12 octobre, maquettes « Version retenue ») paie l'hébergement. Seulement dans l'appli Android (plugin AdMob) : rien sur le web ni la PWA.
   Jamais pour un compte autorisé (CTX.serverOk : ALLOWED_UIDS du serveur) ; s'il était affiché, il est détruit dès que checkServer() le confirme.
   Règle « de temps en temps », simple et discrète :
   · rien au lancement : le bandeau n'arrive qu'après AD.delay (6 s) d'appli au calme, session revenue et compte vérifié (jamais montré au
     propriétaire le temps de la vérification), consentement réglé ;
   · seulement sur les écrans de consultation (emplacement choisi le 9 octobre : en haut, « par moments ») : accueil, collection, decks (liste et viewer),
     liste d'échange d'un autre joueur, et leurs feuilles ; il y reste en place : un bandeau qui clignote ferait sauter la page sous le doigt
     et provoquerait des clics accidentels (règles AdMob) ;
   · masqué pendant les plein écrans des fêtes (arrivée, booster, éclosion, cloches, feu d'artifice, célébration : AD_FULL), la saisie d'une liste, la recherche et ses résultats, l'ajout de cartes une par une (lot.js), l'éditeur de deck, une Carte mystère en cours, l'accueil du premier lancement, le scan (surtout
     l'aperçu natif, html.nat-cam) et la carte en grand ; il revient AD.back après, jamais pendant un toucher (AD.idle) ;
   · l'annonce se renouvelle au rythme réglé dans la console AdMob ; aucune annonce reçue : nouvel essai AD.retry plus tard ;
   · pas tout le temps (13 octobre) : aucun bandeau les AD.grace premières minutes d'utilisation sur ce téléphone (temps appli ouverte, compté
     sur l'appareil, deckdeal:aduse), puis par cycles : AD.onMs avec bandeau, AD.offMs sans (2 min sur 5). Hors de sa fenêtre, le bandeau est
     DÉTRUIT (jamais seulement caché : rien ne se rafraîchit en douce) ; il n'arrive et ne part qu'après AD.idle sans toucher l'écran.
   Consentement (UE) : formulaire UMP de Google avant le premier chargement ; le SDK applique la réponse (annonces personnalisées ou non) ;
   consentement impossible (canRequestAds faux) : aucune pub de la session.
   Rien n'est recouvert : le contenu commence sous le bandeau (bannerAdSizeChanged → html.ad-on + --ad-h, voir css/ads.css) ; le plugin le pose à
   « marge » sous la zone de la caméra : marge = bas de l'en-tête − cette zone + écart (adsMargin). Tous les en-têtes ont la même hauteur ;
   si la marge change quand même (découpe de la caméra au milieu : l'en-tête monte sur sa ligne), le bandeau est recréé à la bonne place. */
const AD_TEST = 'ca-app-pub-3940256099942544/6300978111';      // bandeau de TEST de Google, tant que le serveur n'a pas d'ADMOB_BANNER_ID
/** st : 'off' (aucun bandeau) · 'on' (affiché ou en chargement) · 'hid' (masqué, prêt à revenir). Délais en ms (réduits par les tests). */
const AD = { on: false, st: 'off', m: null, ok: false, no: false, srv: null, priv: '', calm: 0, touch: 0, next: 0, timer: 0, pend: false, q: Promise.resolve(),
  delay: 6000, back: 800, idle: 2500, retry: 180000, grace: 10 * 60e3, onMs: 2 * 60e3, offMs: 3 * 60e3, use: 0, useT: 0, useS: 0 };
const AD_USE_KEY = 'deckdeal:aduse';
/** Plein écrans posés à la racine de la page (event.js, evadvent.js, evsky.js, evnest.js) : pas de bandeau par-dessus. */
const AD_FULL = 'body > .ev-intro, body > .ev-party, body > .adv-open, body > .sky-fw, body > .nest-bells';
/** Temps d'utilisation (appli au premier plan, ms), cumulé sur ce téléphone ; enregistré toutes les 15 s au plus et quand l'appli passe en arrière-plan. */
function adsUse() {
  const now = Date.now();
  if (AD.useT) AD.use += Math.min(now - AD.useT, 10 * 60e3);      // appareil endormi sans visibilitychange : 10 min comptées au plus
  AD.useT = document.hidden ? 0 : now;
  if (document.hidden || now - AD.useS > 15000) { AD.useS = now; try { localStorage.setItem(AD_USE_KEY, String(Math.round(AD.use))); } catch (e) { /* stockage plein */ } }
  return AD.use;
}
/** Fenêtre de pub : { ok : bandeau permis maintenant, ms : temps d'utilisation avant le prochain changement }. offMs = 0 : toujours permis après l'arrivée. */
function adsWin() {
  const u = adsUse();
  if (u < AD.grace) return { ok: false, ms: AD.grace - u };
  if (!AD.offMs) return { ok: true, ms: 0 };
  const c = AD.onMs + AD.offMs, ph = (u - AD.grace) % c;
  return ph < AD.onMs ? { ok: true, ms: AD.onMs - ph } : { ok: false, ms: c - ph };
}

/** Réévalue le bandeau (afficher, masquer, détruire). Appelée par checkServer() quand le compte change ; les appels sont groupés et passent un par un. */
function adsRefresh() {
  if (!AD.on || AD.pend) return; AD.pend = true;
  AD.q = AD.q.then(() => { AD.pend = false; return adsStep(); }).catch(() => {});
}
function adsLater(ms) { clearTimeout(AD.timer); AD.timer = setTimeout(adsRefresh, Math.max(50, ms)); }
function adsRetry() { AD.next = Date.now() + AD.retry; adsLater(AD.retry); }
/** Appel sans réponse attendue (masquer, rétablir, retirer) : jamais d'erreur, et 4 s au plus pour ne pas bloquer la file. */
const adsCall = (P, m) => Promise.race([Promise.resolve().then(() => P[m]({})).catch(() => null), new Promise(r => setTimeout(r, 4000))]);
/** Marge du haut de la page = hauteur du bandeau (px CSS) ; 0 : retirée. */
function adsPad(h) {
  const r = document.documentElement; r.classList.toggle('ad-on', h > 0);
  if (h > 0) r.style.setProperty('--ad-h', h + 'px'); else r.style.removeProperty('--ad-h');
}
/** Marge du bandeau (px CSS) : bas des en-têtes (--top-in + --hd-h, les mêmes partout) − zone de la caméra que le plugin ajoute lui-même + écart au-dessus.
 *  Mesuré sur des sondes (jamais sur un écran en train de s'ouvrir, décalé par son animation). */
function adsMargin() {
  return Math.max(0, Math.round(adsPx('calc(var(--top-in) + var(--hd-h))') - adsPx('env(safe-area-inset-top,0px)') + adsPx('var(--ad-gt)')));
}
/** Hauteur CSS (calc, var, env) mesurée en px sur la sonde. */
function adsPx(h) {
  // une sonde posée une fois pour toutes (ajouter et retirer un élément à chaque mesure relancerait l'observateur de la page, donc adsStep, sans fin)
  const e = AD.probe || (AD.probe = Object.assign(document.createElement('div'), { id: 'adProbe', ariaHidden: 'true' }));
  if (!e.isConnected) { e.style.cssText = 'position:fixed;top:0;left:0;width:0;visibility:hidden;pointer-events:none'; document.documentElement.appendChild(e); }      // sous <html> : hors de la liste observée (body)
  e.style.height = h; return e.offsetHeight;
}
/** Bas de la zone du bandeau (--ad-bot, css/ads.css), en px depuis le haut de l'écran ; 0 sans bandeau. Pour ce qui se place en JS en haut de l'écran
 *  (astuces de tour.js) : rien ne doit monter au-dessus, la vue native du bandeau couvre la WebView. */
function adsBot() { return document.documentElement.classList.contains('ad-on') ? adsPx('var(--ad-bot,0px)') : 0; }
/** Écran où la pub n'a pas sa place : accueil du premier lancement, scan (aperçu natif compris), carte en grand ; et tout ce qui n'est pas de la consultation :
 *  saisie, recherche et résultats, éditeur de deck, compteur de vie (partie). Écran du dessus : la dernière vue plein écran (.dv) de la page, même en train de s'ouvrir ou de se fermer
 *  (retirée après son animation : réévalué à ce moment-là), sinon la vue de l'appli (#app[data-view]). */
function adsBusy() {
  if (OB.el || SC.el || imgView || document.documentElement.classList.contains('nat-cam') || (typeof tourOn === 'function' && tourOn())) return true;      // visite guidée (tour.js) : sa bulle peut se poser sous l'en-tête
  if (document.querySelector(AD_FULL)) return true;      // plein écran des fêtes (arrivée, booster, éclosion, cloches, feu d'artifice, célébration) : le bandeau le couperait
  const dvs = document.querySelectorAll('body > .dv'), top = dvs[dvs.length - 1];
  return top ? top.classList.contains('bd') || top.classList.contains('scan') || top.classList.contains('pu') || top.classList.contains('dly-play') || top.classList.contains('lot') : S.view !== 'home';      // pu : compteur de vie (partie-ui.js), jamais de pub pendant le jeu ; lot : « Ajouter des cartes » (lot.js : recherche par nom, clavier) ; dly-play : Carte mystère en cours (recherche, clavier : clics accidentels), le bandeau revient sur le résultat et les classements
}

/** Réglages du serveur (/__ping) : bloc d'annonces (ADMOB_BANNER_ID, vide = test) et comptes autorisés à attendre. null : injoignable. */
async function adsServer() {
  try {
    const ctrl = new AbortController(), t = setTimeout(() => ctrl.abort(), 5000);
    const r = await fetch('__ping', { cache: 'no-store', signal: ctrl.signal }); clearTimeout(t);
    const j = r.ok ? await r.json() : null; if (!j || j.app !== 'deckdeal') return null;
    return { unit: typeof j.adUnit === 'string' ? j.adUnit.trim() : '', login: !!j.needsLogin && j.hasToken !== false };
  } catch (e) { return null; }
}

/** Consentement UMP (à chaque lancement, comme le demande Google), puis SDK initialisé une seule fois. true : des annonces peuvent être demandées. */
async function adsConsent(P) {
  let c = await P.requestConsentInfo({});
  if (c && c.isConsentFormAvailable && c.status === 'REQUIRED') c = await P.showConsentForm({});
  AD.priv = (c && c.privacyOptionsRequirementStatus) || '';
  if (!c || !c.canRequestAds) return false;
  await P.initialize({ maxAdContentRating: 'ParentalGuidance' });      // classement attendu PEGI 3-7 / E10+ : annonces « accord parental » au plus, jamais « ados » ni « adultes »
  const on = (ev, fn) => { try { const h = P.addListener(ev, fn); if (h && h.catch) h.catch(() => {}); } catch (e) { /* ignore */ } };
  on('bannerAdSizeChanged', s => { const h = Math.max(0, Math.round((s && s.height) || 0)); if (!h || AD.st === 'on') adsPad(h); });      // masqué : la hauteur d'un chargement tardif n'ouvre pas la marge
  on('bannerAdFailedToLoad', () => { if (AD.st === 'off') return; AD.st = 'off'; adsPad(0); adsRetry(); });      // le plugin a déjà retiré le bandeau
  return true;
}

async function adsStep() {
  const P = natPlugin('AdMob'); if (!P) return;
  const now = Date.now(), busy = adsBusy();
  if (busy) AD.calm = 0; else if (!AD.calm) AD.calm = now;
  if (CTX.serverOk === true || AD.no || (typeof streamOn === 'function' && streamOn())) {  // compte autorisé, pub refusée, ou mode streamer (opening.js, html.streamer : réévalué au changement) : bandeau détruit
    if (AD.st !== 'off') { AD.st = 'off'; adsPad(0); await adsCall(P, 'removeBanner'); }
    return;
  }
  const win = adsWin();
  if (!win.ok) {                                                                           // premières minutes, ou pause du cycle : bandeau détruit
    if (AD.st === 'on' && !busy && AD.touch + AD.idle > now) return adsLater(AD.touch + AD.idle - now);      // la page remonte : jamais sous le doigt
    if (AD.st !== 'off') { AD.st = 'off'; adsPad(0); await adsCall(P, 'removeBanner'); }
    return adsLater(win.ms + 50);
  }
  if (busy) {
    if (AD.st === 'off') return;
    adsPad(0);                                                                             // la marge part avant tout (l'aperçu de la caméra se place d'après la page)
    // Scan : la caméra native remet la page au premier plan et y reste ; un bandeau seulement masqué reviendrait DESSOUS (invisible mais rafraîchi). On le détruit : le prochain showBanner le recrée au-dessus.
    if (typeof SC !== 'undefined' && SC.el) { AD.st = 'off'; await adsCall(P, 'removeBanner'); }
    else if (AD.st === 'on') { AD.st = 'hid'; await adsCall(P, 'hideBanner'); }
    return;
  }
  if (AD.st === 'on' && AD.m != null && Math.abs(adsMargin() - AD.m) > 2) { AD.st = 'off'; adsPad(0); await adsCall(P, 'removeBanner'); return adsRefresh(); }      // l'en-tête a changé de hauteur : bandeau recréé dessous
  if (AD.st === 'on' || document.hidden) { if (AD.st === 'on' && win.ms) adsLater(win.ms + 50); return; }      // fin de la fenêtre : réévalué à ce moment-là
  const wait = Math.max(AD.touch + AD.idle, AD.st === 'hid' ? AD.calm + AD.back : Math.max(AD.calm + AD.delay, AD.next)) - now;
  if (wait > 0) return adsLater(wait);
  if (AD.st === 'hid') { AD.st = 'on'; await adsCall(P, 'resumeBanner'); if (win.ms) adsLater(win.ms + 50); return; }       // la marge revient avec bannerAdSizeChanged
  if (!AD.srv && !(AD.srv = await adsServer())) return adsRetry();
  if (AD.srv.login && !(CTX.serverOk === false && D.authReady)) return adsLater(1500);    // session ou compte en cours de vérification (checkServer() rappelle aussi adsRefresh())
  if (!AD.ok) {
    try { AD.ok = await adsConsent(P); } catch (e) { return adsRetry(); }                  // hors ligne… : on redemandera
    if (!AD.ok) AD.no = true;
    return adsRefresh();                                                                   // le formulaire a pu durer : tout est réévalué avant d'afficher
  }
  AD.st = 'on'; AD.m = adsMargin();
  try { await P.showBanner({ adId: AD.srv.unit || AD_TEST, isTesting: !AD.srv.unit, adSize: 'ADAPTIVE_BANNER', position: 'TOP_CENTER', margin: AD.m }); if (win.ms) adsLater(win.ms + 50); }
  catch (e) { AD.st = 'off'; adsRetry(); }
}

/** Réglages › Confidentialité dans l'appli : « aucune publicité » n'y est plus vrai ; « Choix publicitaires » quand Google l'exige (UE). */
function adsPriv(box) {
  if (!box || box.dataset.ads || CTX.serverOk === true || AD.no) return; box.dataset.ads = '1';
  const p = $('.hint', box); if (p) p.textContent = T('Sans compte, tout reste sur cet appareil. L\'appli Android affiche un petit bandeau publicitaire Google AdMob, qui paie l\'hébergement. Aucune mesure d\'audience.');
  const acts = $('.cart-actions', box); if (!acts || AD.priv !== 'REQUIRED') return;
  const b = document.createElement('button'); b.type = 'button'; b.className = 'btn ghost small'; b.id = 'btnAdChoices'; b.textContent = T('Choix publicitaires');
  b.onclick = adsPrivacy; acts.appendChild(b);
}
async function adsPrivacy() {
  const P = natPlugin('AdMob'); if (!P) return; haptic('tap');
  try { await P.showPrivacyOptionsForm({}); const c = await P.requestConsentInfo({}); if (c && !c.canRequestAds) AD.no = true; }
  catch (e) { toast(T('Choix publicitaires indisponibles pour le moment')); }
  adsRefresh();
}

function adsInit() {
  const P = natPlugin('AdMob'); if (AD.on || !P) return;                                  // navigateur, PWA, ou appli sans le plugin : rien du tout
  AD.on = true; AD.calm = Date.now();
  try { AD.use = Math.max(0, Number(localStorage.getItem(AD_USE_KEY)) || 0); } catch (e) { AD.use = 0; }
  AD.useT = document.hidden ? 0 : Date.now(); AD.useS = Date.now();
  AD.q = adsCall(P, 'removeBanner');                                                       // page rechargée (langue…) : le bandeau natif d'avant ne reste pas sans sa marge
  const mo = new MutationObserver(adsRefresh);
  mo.observe(document.body, { childList: true });                                         // accueil, scan, carte en grand, collection, decks… : ajoutés et retirés à la racine
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });  // html.nat-cam
  const app = $('#app'); if (app) mo.observe(app, { attributes: true, attributeFilter: ['data-view'] });      // accueil ↔ saisie ↔ résultats (showView)
  const sr = $('#sheetRoot'); if (sr) new MutationObserver(() => adsPriv($('#privBox', sr))).observe(sr, { childList: true });
  document.addEventListener('pointerdown', () => { AD.touch = Date.now(); }, { capture: true, passive: true });
  document.addEventListener('visibilitychange', adsRefresh);
  adsLater(AD.delay);
}
if (typeof document !== 'undefined') setTimeout(adsInit, 0);
