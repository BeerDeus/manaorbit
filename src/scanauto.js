/* ── scanauto.js : scan automatique et lampe de l'écran de scan (scan.js) ──────────────────────────────────────────────────────────────────────────
   Auto (réglage « Scan automatique », interrupteur « Auto » à droite du cercle) : la bande du nom est LUE EN CONTINU (appli : ML Kit sur l'image de l'aperçu
   natif ; navigateur : Tesseract sur la vidéo), une lecture après l'autre. Bande sans contraste (table, fond uni) : rien n'est lu. Une carte est ajoutée quand
   deux lectures de suite donnent le même nom, sûr (≥ 84 %) : le nom est net et la carte tenue (une image floue ou une carte qui passe ne donne pas deux fois
   la même chose). Ensuite cette carte est « tenue » : relue, elle n'est pas rajoutée ; elle est partie quand deux lectures de suite ne la voient plus
   (bande vide, autre carte). Écart minimal entre deux cartes : le réglage (0,5 à 1,5 s). Rien n'est lu pendant une feuille ouverte, l'écran
   « Éditions à choisir » ou la lecture de photos.
   (Première version : déclenchée par deux images presque identiques ; sur un vrai téléphone, le bruit du capteur et le moindre tremblement ne la laissaient
   jamais partir : remplacée le 12 octobre par cette confirmation sur le nom lu.)
   Même carte qu'à l'instant : « Encore X ? » (+1 / Non), ou +1 d'office (réglage) ; en prix rapide, ignorée. Le cercle devient pause / reprise ; son anneau se
   remplit à moitié à la première lecture, en entier à la confirmation. Les images lues ne sont jamais gardées.
   Lampe : torche de l'aperçu natif (plugin camera-preview) ou de la caméra du navigateur (si elle en a une), sinon le bouton reste caché. Éteinte à chaque scan. */
const AU = { gen: 0, t: 0, paused: false, cand: null, hold: '', miss: 0, at: 0, last: '', ask: null, torch: '', lamp: false, cv: null, reads: 0 };
const AU_W = 96, AU_H = 16, AU_INK = 10, AU_FREE = 2;      // bande sans contraste (écart type < 10 : table, fond uni) : rien à lire ; 2 lectures sans la carte tenue : elle est partie
const auCam = () => !!(SC.el && (NAT.on || SC.stream));
/** Auto en service sur cet écran : réglé, et une caméra qui tourne (sans caméra, « Photos » et le cercle restent comme avant). */
const auOn = () => !!(SCS.auto && auCam());
/** On peut regarder la bande maintenant. */
const auLive = () => auOn() && !AU.paused && !SC.rbusy && !document.hidden && !sheets.length && !SC.ef && !imgView && !SC.working && !SC.queue.length && !AU.ask;

/** Nouveau scan : auto relancé (pas en pause), lampe éteinte. */
function auReset() { clearTimeout(AU.t); AU.t = 0; AU.gen++; Object.assign(AU, { paused: false, cand: null, hold: '', miss: 0, at: 0, last: '', ask: null, torch: '', lamp: false }); }
/** Réglage, caméra ou mode changés : boucle démarrée ou arrêtée, boutons à jour. */
function auSync() {
  if (!SC.el) return;
  const on = auOn();
  if (on && !AU.t) { const g = ++AU.gen; AU.cand = null; AU.t = setTimeout(() => auTick(g), 300); }
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
  AU.paused = on === undefined ? !AU.paused : !!on; haptic('tap'); auRing(0); AU.cand = null;
  scanHint(AU.paused ? T('Auto en pause : touche le cercle pour reprendre') : T('Pose la carte, le nom dans la bande : elle s\'ajoute seule'), AU.paused ? 'busy' : '');
  auPaint();
}

/* ── Regarder la bande ──────────────────────────────────────────────────────────────────────────── */
/** Contraste de la bande (écart type des niveaux de gris, sur une miniature 96×16) : sous AU_INK, rien d'écrit à lire. */
function auSig(src, box) {
  const c = AU.cv || (AU.cv = document.createElement('canvas')); c.width = AU_W; c.height = AU_H;
  const x = c.getContext('2d', { willReadFrequently: true });
  if (box) x.drawImage(src, box.x, box.y, box.w, box.h, 0, 0, AU_W, AU_H); else x.drawImage(src, 0, 0, AU_W, AU_H);
  const d = x.getImageData(0, 0, AU_W, AU_H).data, n = AU_W * AU_H, g = new Float32Array(n); let m = 0;
  for (let i = 0; i < n; i++) { const v = 0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2]; g[i] = v; m += v; }
  m /= n; let s = 0; for (let i = 0; i < n; i++) { g[i] -= m; s += g[i] * g[i]; }
  return { sig: g, dev: Math.sqrt(s / n) };
}
/** La bande du nom maintenant, en bonne qualité (canvas) et son contraste. */
async function auGrab() {
  if (NAT.on) { const c = await natCapture(85); return { src: c, dev: auSig(c).dev }; }
  const v = $('.sc-video', SC.el), b = scanGuideBox(); if (!b || !v) return null;
  const c = document.createElement('canvas'); c.width = b.w; c.height = b.h; c.getContext('2d').drawImage(v, b.x, b.y, b.w, b.h, 0, 0, b.w, b.h);
  return { src: c, dev: auSig(c).dev };
}
async function auTick(g) {
  if (g !== AU.gen || !SC.el) return;
  let wait = NAT.on ? 150 : 250;
  if (auLive()) {
    try { const f = await auGrab(); if (g !== AU.gen || !SC.el) { if (f) scanFree(f.src); return; } if (f) await auFeed(f, g); }
    catch (e) { wait = 900; }      // aperçu pas prêt, capture ou lecture refusée : on réessaie un peu plus tard
  } else { AU.cand = null; auRing(0); }
  if (g === AU.gen && SC.el) AU.t = setTimeout(() => auTick(g), wait);
}
/** Une lecture de plus : même nom sûr deux fois de suite → la carte est ajoutée (sauf si c'est la carte tenue). */
async function auFeed(f, g) {
  let m = null;
  try {
    if (f.dev >= AU_INK) {
      const cat = await collCatalog(), W = f.src.width, H = f.src.height; AU.reads++;
      m = await readNameAuto(f.src, { x: 0, y: 0, w: W, h: H }, 1400, '6', cat, false, null);      // sans recherche dans les autres langues (serveur) : seulement les noms sûrs
      if (m && m.score < 0.84) m = null;
    }
  } finally { scanFree(f.src); }
  if (g !== AU.gen || !SC.el || !auLive()) return;
  const k = m ? m.key + '|' + (scanLangOf(m).card || 'en') : '';
  if (AU.hold) {
    if (k === AU.hold) { AU.miss = 0; AU.cand = null; auRing(0); return; }      // la carte ajoutée est toujours là
    if (!k) { if (++AU.miss >= AU_FREE) AU.hold = ''; AU.cand = null; auRing(0); return; }      // plus vue deux fois de suite : partie
    AU.hold = '';      // une autre carte : lue normalement
  }
  if (!k) { AU.cand = null; auRing(0); return; }
  if (!AU.cand || AU.cand.k !== k) { AU.cand = { k, m }; auRing(0.5); return; }      // 1re lecture : on attend la même à la suivante
  if (Date.now() - AU.at < SCS.delay) { auRing(0.8); return; }
  AU.cand = null; AU.hold = k; AU.miss = 0; AU.at = Date.now(); auRing(1); scanFlash(); setTimeout(() => auRing(0), 350);
  auHit(m);
}
/** Carte confirmée : « Encore X ? » si c'est la même qu'à l'instant, sinon ajoutée (ou son prix, en prix rapide). */
function auHit(m) {
  if (auResult(m)) return;
  if (SC.pm) scanPriceAdd(m); else scanAdd(m, 1, false);
  scsCue(); scanHint('✓ ' + m.name, 'ok');
}

/* ── Résultat d'une lecture automatique ─────────────────────────────────────────────────────────── */
/** Carte confirmée en automatique. true : traitée ici (même carte qu'à l'instant : question, ou rien en prix rapide) ; false : ajout normal. */
function auResult(m) {
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
