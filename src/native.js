/* ── native.js : appli Android (Capacitor) ─────────────────────────────────────────────────────────
   Dans l'APK, le site tourne dans une coque native : window.Capacitor donne accès aux plugins natifs (caméra, pub, notifications, connexion Google,
   widget). Dans un navigateur ou la PWA, rien de tout ça n'existe et chaque fonction garde son comportement web. */
/** Plugin natif n, seulement dans l'appli Android et s'il y est installé ; null sinon. */
function natPlugin(n) {
  try { const C = typeof window !== 'undefined' && window.Capacitor; return C && C.isNativePlatform && C.isNativePlatform() && C.isPluginAvailable && C.isPluginAvailable(n) && C.Plugins && C.Plugins[n] || null; } catch (e) { return null; }
}
const isNativeApp = () => { try { return !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()); } catch (e) { return false; } };
/** Plugins natifs attendus dans l'APK (diagnostic affiché sous la version, dans les réglages) : une APK ancienne en a moins, il faut la refaire. */
const NAT_PLUGINS = [['CameraPreview', 'caméra'], ['CapacitorPluginMlKitTextRecognition', 'ML Kit'], ['FirebaseAuthentication', 'Google'], ['AdMob', 'pub'], ['PushNotifications', 'notif'], ['ManaOrbit', 'widget'], ['App', 'retour']];

/** Écran à pleine luminosité (QR code d'échange affiché) ou rendu au réglage du téléphone : APK 1.0.4 et plus (ManaOrbit.brightness), seulement dans
    l'appli (Android rend la luminosité habituelle quand on en sort). Navigateur ou APK plus ancienne : rien. Page rechargée avec le QR ouvert : rendue au lancement. */
function natBright(full) {
  const mo = natPlugin('ManaOrbit'); if (!mo || typeof mo.brightness !== 'function') return;
  try { if (full) sessionStorage.setItem('deckdeal:bright', '1'); else sessionStorage.removeItem('deckdeal:bright'); } catch (e) { /* stockage bloqué */ }
  Promise.resolve().then(() => mo.brightness({ full: !!full })).catch(() => {});      // APK sans la méthode : refusé, sans effet
}
if (typeof document !== 'undefined') setTimeout(() => { try { if (sessionStorage.getItem('deckdeal:bright')) natBright(false); } catch (e) { /* stockage bloqué */ } }, 0);

/** Écran gardé allumé (scan ouvert : sans ça, la mise en veille automatique du téléphone l'éteint en plein cadrage ; aussi compteur de vie, table en
    direct, QR codes affichés, échange en vrai) ou rendu à la veille habituelle. Chaque écran demande sous son nom (who) : l'écran reste allumé tant
    qu'un écran encore ouvert le demande (le QR joueur refermé par-dessus le compteur ne rend pas la veille).
    APK 1.0.10 et plus : ManaOrbit.keepAwake (le WebView n'a pas navigator.wakeLock). Navigateur, PWA ou APK plus ancienne : Wake Lock du navigateur s'il
    l'a (il tombe quand on quitte la page : repris au retour). Page rechargée écran allumé : rendu à la veille au lancement.
    → promesse : l'écran est-il gardé allumé (false : navigateur sans Wake Lock, ou verrou refusé). */
const AWAKE = { on: false, wl: null, req: null, by: new Set() };
function natAwake(on, who = 'scan') {
  const was = AWAKE.on;
  if (on) AWAKE.by.add(who); else AWAKE.by.delete(who);
  AWAKE.on = AWAKE.by.size > 0;
  const mo = natPlugin('ManaOrbit');
  if (mo && typeof mo.keepAwake === 'function') {
    if (AWAKE.on !== was) awakeNat(mo, AWAKE.on);      // seulement quand le premier écran le demande, ou que le dernier le rend
    return Promise.resolve(AWAKE.on);
  }
  if (AWAKE.on) return awakeLock().then(() => !!AWAKE.wl);
  try { if (AWAKE.wl) AWAKE.wl.release(); } catch (e) { /* déjà relâché */ } AWAKE.wl = null;
  return Promise.resolve(false);
}
function awakeNat(mo, on) {
  try { if (on) sessionStorage.setItem('deckdeal:awake', '1'); else sessionStorage.removeItem('deckdeal:awake'); } catch (e) { /* stockage bloqué */ }
  Promise.resolve().then(() => mo.keepAwake({ on: !!on })).catch(() => {});
}
function awakeLock() {
  if (!AWAKE.on || AWAKE.wl || typeof navigator === 'undefined' || !navigator.wakeLock || document.visibilityState !== 'visible') return Promise.resolve();
  return AWAKE.req || (AWAKE.req = (async () => {      // demande déjà en route (deux écrans à la suite) : la même, attendue par les deux
    try { const l = await navigator.wakeLock.request('screen'); if (!AWAKE.on) { l.release(); return; } AWAKE.wl = l; if (l.addEventListener) l.addEventListener('release', () => { if (AWAKE.wl === l) AWAKE.wl = null; }); } catch (e) { AWAKE.wl = null; }      // refusé (économie d'énergie) : l'écran s'éteindra comme d'habitude
    finally { AWAKE.req = null; }
  })());
}
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') awakeLock(); });
  setTimeout(() => { try { const mo = natPlugin('ManaOrbit'); if (sessionStorage.getItem('deckdeal:awake') && !AWAKE.on && mo && typeof mo.keepAwake === 'function') awakeNat(mo, false); } catch (e) { /* stockage bloqué */ } }, 0);
}

/* ── Plein écran (appli Android) : barre d'état cachée, barre de gestes gardée ───────────────────────────────────────────────────────────────
   SystemBars (plugin de Capacitor 8, présent dans toutes nos APK) cache la barre d'état ; un glissé du haut la fait revenir un instant.
   Volet des notifications tiré puis refermé : la barre d'état restait affichée (APK 1.0.2) → recachée au retour dans l'appli (focus, page de nouveau
   visible, taille changée) et au premier appui ; APK 1.0.3 et plus : la coque ne la montre plus qu'en passant (MainActivity).
   Toujours une bande de 24 px en haut (html.fs, --top-in), l'appli ne touche pas le bord de l'écran ; plus haute si la caméra frontale est dans un coin.
   APK 1.0.2 et plus (ManaOrbit.cutout) : découpe de la caméra au milieu du haut → l'en-tête reste à 24 px du bord, sur la ligne de la caméra
   (html.cut-mid, les titres s'arrêtent avant elle) ; découpe dans un coin, plusieurs découpes, ou APK plus ancienne : l'en-tête est sous la zone de la caméra. */
async function natFullscreen() {
  const sb = natPlugin('SystemBars'); if (!sb) return;
  try { await sb.hide({ bar: 'StatusBar' }); } catch (e) { return; }
  const r = document.documentElement; r.classList.add('fs');
  let at = 0;
  const again = () => { const t = Date.now(); if (t - at < 1000) return; at = t; Promise.resolve().then(() => sb.hide({ bar: 'StatusBar' })).catch(() => {}); };
  const later = () => setTimeout(again, 350);      // le volet finit de se refermer
  addEventListener('focus', later); addEventListener('pageshow', later); addEventListener('resize', later);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) later(); });
  addEventListener('pointerdown', again, { capture: true, passive: true });
  const mo = natPlugin('ManaOrbit'); if (!mo || typeof mo.cutout !== 'function') return;
  const read = async () => {
    try {
      const c = await mo.cutout(), w = Number(c && c.w) || innerWidth, top = (c && Array.isArray(c.rects) ? c.rects : []).filter(x => x && x.t <= 4 && x.b > 0 && x.b < 80);
      const mid = top.length === 1 && Math.abs((top[0].l + top[0].r) / 2 - w / 2) < 24 && top[0].r - top[0].l < 120;
      r.classList.toggle('cut-mid', mid);
      if (mid) r.style.setProperty('--cut-h', top[0].b + 'px'); else r.style.removeProperty('--cut-h');
      if (typeof adsRefresh === 'function') adsRefresh();      // bandeau de pub : sous l'en-tête, à sa nouvelle hauteur
    } catch (e) { /* méthode refusée : l'en-tête reste sous la caméra */ }
  };
  await read(); addEventListener('resize', () => setTimeout(read, 300));      // rotation : la découpe passe sur un côté
}
if (typeof document !== 'undefined') setTimeout(() => { natFullscreen(); }, 0);
