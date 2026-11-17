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

/** Texte au plus partagé tel quel par une APK sans shareFile (EXTRA_TEXT : la transaction d'Android plafonne vers 1 Mo, en UTF-16) ; au-delà, copié. */
const FILE_TEXT_MAX = 100000;
/**
 * Fichier texte à garder (export CSV ou texte de la collection, liste d'une session d'ouverture) ; msg : toast du fichier prêt.
 * Navigateur, PWA : téléchargement (lien blob:). APK : la WebView ignore ces liens (rien ne se passait, toast compris) →
 * APK 1.1.4 : ManaOrbit.saveFile (Téléchargements › Mana Orbit, Android 10 et plus ; toast avec « Partager ») ou, refusé (Android 9 et moins), shareFile ;
 * APK plus ancienne : le texte au menu « Partager » (ManaOrbit.share : Drive, e-mail…), copié s'il est trop long ou refusé, mise à jour demandée.
 * → promesse 'download' | 'saved' | 'shared' | 'text' | 'copied' | 'fail'.
 */
async function fileOut(body, name, mime, msg) {
  const mo = natPlugin('ManaOrbit');
  if (!mo) {
    try {
      const url = URL.createObjectURL(new Blob([body], { type: mime + ';charset=utf-8' })), a = document.createElement('a');
      a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 4000);
      toast(msg); return 'download';
    } catch (e) { toast(T('Export impossible sur ce navigateur')); return 'fail'; }
  }
  const share = () => mo.shareFile({ data: body, name, mime, title: name, chooser: T('Partager') });
  if (typeof mo.saveFile === 'function') {
    try {
      await mo.saveFile({ data: body, name, mime });
      toast(msg + ' · ' + T('dans Téléchargements'), { label: T('Partager'), fn: () => share().catch(() => toast(T('Partage impossible'))) }); haptic('ok'); return 'saved';
    } catch (e) { /* Android 9 et moins : menu « Partager » */ }
  }
  if (typeof mo.shareFile === 'function') { try { await share(); return 'shared'; } catch (e) { /* refusé : texte */ } }
  if (typeof mo.share === 'function' && body.length <= FILE_TEXT_MAX) { try { await mo.share({ title: name, text: body, chooser: T('Partager') }); return 'text'; } catch (e) { /* refusé : copie */ } }
  try { await navigator.clipboard.writeText(body); toast(T('Texte copié : mets à jour l\'appli (Play Store) pour télécharger le fichier')); return 'copied'; }
  catch (e) { toast(T('Mets à jour l\'appli (Play Store) pour télécharger le fichier')); return 'fail'; }
}

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
