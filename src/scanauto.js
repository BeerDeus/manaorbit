/* ── scanauto.js : scan automatique et lampe de l'écran de scan (scan.js) ──────────────────────────────────────────────────────────────────────────
   Auto (réglage « Scan automatique », interrupteur « Auto » à droite du cercle) : la bande du nom est regardée en continu, en tout petit (96×16, niveaux de gris,
   ~4 fois par seconde ; appli : image de l'aperçu natif ~2 fois et demie) ; nom net et immobile 0,4 s (deux images presque identiques, assez de contraste) → la bande
   est lue, comme avec le cercle. Ensuite on attend que la bande change franchement (carte retirée ou remplacée) avant de relire ; écart minimal entre deux cartes :
   le réglage (0,5 à 1,5 s). Rien n'est regardé pendant une lecture (le téléphone lit), une feuille ouverte ou l'écran « Éditions à choisir ».
   Même carte qu'à l'instant : « Encore X ? » (+1 / Non), ou +1 d'office (réglage) ; en prix rapide, ignorée. Le cercle devient pause / reprise ; son anneau se
   remplit pendant que le nom se stabilise. Les petites images ne servent qu'à comparer deux instants : rien n'est gardé.
   Lampe : torche de l'aperçu natif (plugin camera-preview) ou de la caméra du navigateur (si elle en a une), sinon le bouton reste caché. Éteinte à chaque scan. */
const AU = { gen: 0, t: 0, paused: false, sig: null, ts: 0, hold: null, at: 0, last: '', ask: null, torch: '', lamp: false, cv: null };
const AU_W = 96, AU_H = 16, AU_STILL = 400, AU_SAME = 7, AU_GONE = 22, AU_INK = 10;      // immobile : écart moyen < 7 ; carte partie : écart > 22 ou bande sans contraste (< 10 : table, fond uni)
const auCam = () => !!(SC.el && (NAT.on || SC.stream));
/** Auto en service sur cet écran : réglé, et une caméra qui tourne (sans caméra, « Photos » et le cercle restent comme avant). */
const auOn = () => !!(SCS.auto && auCam());
/** On peut regarder la bande maintenant. */
const auLive = () => auOn() && !AU.paused && !SC.rbusy && !document.hidden && !sheets.length && !SC.ef && !imgView && !SC.working && !SC.queue.length && !AU.ask;

/** Nouveau scan : auto relancé (pas en pause), lampe éteinte. */
function auReset() { clearTimeout(AU.t); AU.t = 0; AU.gen++; Object.assign(AU, { paused: false, sig: null, hold: null, at: 0, last: '', ask: null, torch: '', lamp: false }); }
/** Réglage, caméra ou mode changés : boucle démarrée ou arrêtée, boutons à jour. */
function auSync() {
  if (!SC.el) return;
  const on = auOn();
  if (on && !AU.t) { const g = ++AU.gen; AU.sig = null; AU.t = setTimeout(() => auTick(g), 300); }
  else if (!on && AU.t) { clearTimeout(AU.t); AU.t = 0; AU.gen++; auHideAsk(); }
  auPaint();
}
function auPaint() {
  const el = SC.el; if (!el) return;
  const on = auOn(), sw = $('.sc-auto', el), shot = $('.sc-shot', el), cap = $('.sc-cap', el), lamp = $('.sc-lamp', el);
  el.classList.toggle('auto', on); el.classList.toggle('paused', on && AU.paused);
  if (sw) { sw.hidden = !auCam(); sw.setAttribute('aria-checked', String(!!SCS.auto)); }
  if (shot) {
    shot.setAttribute('aria-label', on ? (AU.paused ? T('Reprendre le scan automatique') : T('Mettre le scan automatique en pause')) : T('Prendre la photo de la carte'));
    const u = $('use', shot); if (u) u.setAttribute('href', AU.paused ? '#i-play' : '#i-pause');
    if (!on) shot.style.removeProperty('--au');
  }
  if (cap) cap.textContent = on ? (AU.paused ? T('Auto en pause') : T('Auto · lecture en continu')) : T('Nom de la carte');
  if (lamp) { lamp.hidden = !AU.torch; lamp.setAttribute('aria-pressed', String(AU.lamp)); lamp.setAttribute('aria-label', AU.lamp ? T('Éteindre la lampe') : T('Allumer la lampe')); }
}
/** Anneau du cercle : part du temps d'immobilité déjà atteinte (0 à 1). */
function auRing(k) { const s = SC.el && $('.sc-shot', SC.el); if (s) s.style.setProperty('--au', String(Math.round(Math.max(0, Math.min(1, k)) * 100))); }
function auPause(on) {
  AU.paused = on === undefined ? !AU.paused : !!on; haptic('tap'); auRing(0); AU.sig = null;
  scanHint(AU.paused ? T('Auto en pause : touche le cercle pour reprendre') : T('Pose la carte, le nom dans la bande : elle s\'ajoute seule'), AU.paused ? 'busy' : '');
  auPaint();
}

/* ── Regarder la bande ──────────────────────────────────────────────────────────────────────────── */
/** Image de la bande (en pixels de la vidéo) → empreinte 96×16 en niveaux de gris, centrée (un changement de luminosité ne compte pas) + contraste. */
function auSig(src, box) {
  const c = AU.cv || (AU.cv = document.createElement('canvas')); c.width = AU_W; c.height = AU_H;
  const x = c.getContext('2d', { willReadFrequently: true });
  if (box) x.drawImage(src, box.x, box.y, box.w, box.h, 0, 0, AU_W, AU_H); else x.drawImage(src, 0, 0, AU_W, AU_H);
  const d = x.getImageData(0, 0, AU_W, AU_H).data, n = AU_W * AU_H, g = new Float32Array(n); let m = 0;
  for (let i = 0; i < n; i++) { const v = 0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2]; g[i] = v; m += v; }
  m /= n; let s = 0; for (let i = 0; i < n; i++) { g[i] -= m; s += g[i] * g[i]; }
  return { sig: g, dev: Math.sqrt(s / n) };
}
/** Écart moyen entre deux empreintes (0 : identiques). */
function auDiff(a, b) { if (!a || !b || a.length !== b.length) return 255; let t = 0; for (let i = 0; i < a.length; i++) t += Math.abs(a[i] - b[i]); return t / a.length; }
/** Une image de la bande maintenant : { sig, dev } (et src : la bande en grand, pour la lire si c'est le bon moment). */
async function auGrab() {
  if (NAT.on) { const c = await natCapture(60); return { ...auSig(c), src: c }; }
  const v = $('.sc-video', SC.el), box = scanGuideBox(); if (!box || !v) return null;
  return { ...auSig(v, box), box };
}
async function auTick(g) {
  if (g !== AU.gen || !SC.el) return;
  let wait = NAT.on ? 380 : 230;
  if (auLive()) {
    try { const f = await auGrab(); if (g !== AU.gen || !SC.el) { if (f && f.src) scanFree(f.src); return; } if (f) await auFeed(f); }
    catch (e) { wait = 900; }      // aperçu pas prêt, capture refusée : on réessaie un peu plus tard
  } else { AU.sig = null; auRing(0); }
  if (g === AU.gen && SC.el) AU.t = setTimeout(() => auTick(g), wait);
}
/** Une image de plus : immobile assez longtemps, nouvelle carte, délai passé → lue. */
async function auFeed(f) {
  const now = performance.now(), ink = f.dev >= AU_INK;
  if (AU.hold && (!ink || auDiff(f.sig, AU.hold) > AU_GONE)) AU.hold = null;      // carte retirée ou remplacée : la prochaine sera lue
  const still = AU.sig && auDiff(f.sig, AU.sig) < AU_SAME; AU.sig = f.sig;
  if (!still || !ink || AU.hold) { AU.ts = now; auRing(0); if (f.src) scanFree(f.src); return; }
  const k = (now - AU.ts) / AU_STILL;
  if (k < 1 || Date.now() - AU.at < SCS.delay) { auRing(Math.min(k, 0.98)); if (f.src) scanFree(f.src); return; }
  AU.hold = f.sig; AU.at = Date.now(); auRing(1); scanFlash();
  let src = null;
  if (NAT.on) { scanFree(f.src); src = await natCapture(); }      // la bande en bonne qualité pour la lecture
  else { const v = $('.sc-video', SC.el), b = f.box; src = document.createElement('canvas'); src.width = b.w; src.height = b.h; src.getContext('2d').drawImage(v, b.x, b.y, b.w, b.h, 0, 0, b.w, b.h); }
  if (!SC.el) { scanFree(src); return; }
  scanEnqueue({ label: T('Carte {n}', { n: ++SC.cap }), src, strip: true, thumb: thumbOf(src), auto: true });
  setTimeout(() => auRing(0), 350);
}

/* ── Résultat d'une lecture automatique ─────────────────────────────────────────────────────────── */
/** Appelé par scanWork pour une carte lue en automatique. true : traitée ici (rien de plus à faire) ; false : ajout normal. */
function auResult(m) {
  if (!m || m.score < 0.72) { scanHint(T('Nom pas reconnu : redresse la carte ou rapproche-la'), 'bad'); haptic('warn'); return true; }      // pas de ligne « non reconnue » en auto : la carte suivante arrive déjà
  const k = m.key + '|' + (scanLangOf(m).card || 'en'), same = AU.last === k; AU.last = k; auHideAsk();      // même carte : même nom et même langue
  if (!same) return false;
  if (SC.pm) { scanHint('✓ ' + m.name, 'ok'); return true; }      // prix rapide : le même prix
  if (SCS.same === 'add') return false;
  auAsk(m); return true;
}
/** « Encore X ? » : même carte qu'à l'instant (deux exemplaires, ou la même relue) — +1 ou Non. */
function auAsk(m) {
  const st = SC.el && $('.sc-stage', SC.el); if (!st) return;
  AU.ask = m; haptic('warn');
  let box = $('.sc-same', st);
  if (!box) { box = document.createElement('div'); box.className = 'sc-same'; box.setAttribute('role', 'alertdialog'); st.appendChild(box); }
  box.setAttribute('aria-label', T('Même carte à la suite'));
  box.innerHTML = `<span><b>${T('Encore <em>{name}</em> ?', { name: esc(scanShown({ key: m.key, name: m.name, l: scanLangOf(m).card || 'en' })) })}</b><small>${T('Même carte qu\'à l\'instant')}</small></span>
    <button class="btn small" type="button" data-act="au1">+1</button><button class="btn ghost small" type="button" data-act="au0">${T('Non')}</button>`;
  scanHint('', '');
}
function auHideAsk() { AU.ask = null; const b = SC.el && $('.sc-same', SC.el); if (b) b.remove(); }
/** Boutons de l'auto : interrupteur, +1 / Non, lampe. */
function auAct(act) {
  if (act === 'auto') { haptic('tap'); scsSet({ auto: !SCS.auto }); if (SCS.auto) scanHint(T('Pose la carte, le nom dans la bande : elle s\'ajoute seule'), ''); else scanHint(CAM_HINT, ''); return; }
  if (act === 'lamp') { auLamp(!AU.lamp); return; }
  const m = AU.ask; auHideAsk(); if (!m) return;
  if (act === 'au1') { haptic('ok'); scanAdd(m, 1, m.score < 0.84); scsCue(); scanHint('✓ ' + m.name, 'ok'); }
  else { haptic('tap'); scanHint('', ''); }
}

/* ── Lampe ──────────────────────────────────────────────────────────────────────────────────────── */
/** Caméra prête : la lampe existe-t-elle ? (appli : mode « torch » du plugin ; navigateur : capacité « torch » de la piste vidéo) */
async function auLampProbe() {
  AU.torch = '';
  try {
    if (NAT.on) { const r = await natCam().getSupportedFlashModes(); if ((r && r.result || []).includes('torch')) AU.torch = 'nat'; }
    else if (SC.stream) { const tr = SC.stream.getVideoTracks()[0], c = tr && tr.getCapabilities && tr.getCapabilities(); if (c && c.torch) AU.torch = 'web'; }
  } catch (e) { AU.torch = ''; }
  if (AU.lamp && AU.torch) auLamp(true, true); else AU.lamp = false;      // caméra redémarrée : la lampe se rallume
  auPaint();
}
async function auLamp(on, quiet) {
  if (!AU.torch) return;
  if (!quiet) haptic('tap');
  try {
    if (AU.torch === 'nat') await natCam().setFlashMode({ flashMode: on ? 'torch' : 'off' });
    else { const tr = SC.stream && SC.stream.getVideoTracks()[0]; if (!tr) throw new Error('caméra'); await tr.applyConstraints({ advanced: [{ torch: on }] }); }
    AU.lamp = on;
  } catch (e) { AU.lamp = false; if (!quiet) toast(T('La lampe n\'a pas pu s\'allumer')); }
  auPaint();
}
