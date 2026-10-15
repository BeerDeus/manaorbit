/* ── scanreport.js : « Signaler un problème de scan » ───────────────────────────────────────────────────────────────────────────
   Un scan « sans faille » se règle sur de vraies cartes : un scan raté (mauvaise carte, mauvaise langue, mauvaise édition, nom non reconnu) part en deux touches
   vers l'équipe, avec la photo et ce que l'appli a lu, et apparaît dans le panneau /admin (proxy.mjs › /api/scan-report). Rien ne part sans ce geste.
   · Pendant le scan, juste avant que la capture soit libérée (scan.js › scanWork ; scanauto.js pour une carte ajoutée en automatique) : une version réduite
     (JPEG ≈ 900 px de grand côté, qualité 0,8, 250 Ko au plus) et la lecture (texte du nom, ligne du bas, carte retenue, moteur, cadrage, diagnostic) des
     30 dernières captures, EN MÉMOIRE seulement (Blob, jamais enregistré), libérées à la fermeture du scan (srFree).
   · Bouton discret « Signaler un problème de scan » : carte du scan en grand (miniature touchée : zoom.js › srAct, viewer.js) et ligne « Nom non reconnu »
     (srMissBtn) ; seulement si le serveur l'accepte (/__ping scanrep) ou s'il n'a pas pu être joint faute de réseau (l'envoi le dit ; rien n'est mis en attente).
   · Feuille : ce qui ne va pas, commentaire facultatif (300 caractères), la photo, ce qui part ; « Envoyer » → POST api/scan-report ; connecté : jeton Firebase
     (le serveur n'en garde qu'une empreinte). Envoyé : « Signalé », plus de second envoi pour cette capture. */
const SR = { keep: [], max: 30, side: 900, q: 0.8, kb: 250 };      // keep : captures gardées (les plus anciennes partent) ; side, q, kb : taille, qualité et poids du JPEG
/** Ce qui ne va pas : valeur envoyée, libellé. */
const srWhats = () => [['card', T('Mauvaise carte')], ['lang', T('Mauvaise langue')], ['ed', T('Mauvaise édition')], ['miss', T('Non reconnue')], ['other', T('Autre')]];
/** Le bouton est-il proposé ? Serveur qui accepte les signalements, ou serveur pas encore joint faute de réseau (l'envoi dira « Hors ligne »). */
const srOn = () => CTX.scanrep === true || (!CTX.proxy && collOffline());
const srFt = ft => ({ codes: (ft.codes || []).slice(0, 4), nums: (ft.nums || []).slice(0, 4), lang: ft.lang || '', foil: !!ft.foil });

/** Une capture vient d'être lue (avant d'être libérée) : sa version réduite et sa lecture restent en mémoire. job : { id, src, file?, card?, strip?, auto? } ;
 *  m : carte retenue (ou null : non reconnue) ; t0 : début de la lecture (performance.now). */
function srKeep(job, m, t0) {
  try {
    const src = job && job.src, W = src ? src.naturalWidth || src.width : 0, H = src ? src.naturalHeight || src.height : 0;
    if (!SC.el || !(W > 8 && H > 8)) return;
    const k = Math.min(1, SR.side / Math.max(W, H)), c = document.createElement('canvas'); c.width = Math.max(8, Math.round(W * k)); c.height = Math.max(8, Math.round(H * k));
    const x = c.getContext('2d'); x.imageSmoothingQuality = 'high'; x.drawImage(src, 0, 0, c.width, c.height);      // tout de suite : la capture est libérée juste après
    const e = { id: job.id, s: SC.session, at: Date.now(), blob: null, p: null, w: c.width, h: c.height, read: srRead(job, m, t0, W, H), sent: false };
    e.p = srJpeg(c).then(b => { if (b) { e.blob = b; e.w = c.width; e.h = c.height; } return b; }, () => null).finally(() => { c.width = c.height = 0; });      // encodage hors du fil de la lecture
    SR.keep.push(e); while (SR.keep.length > SR.max) SR.keep.shift();
  } catch (err) { /* capture illisible : rien de gardé */ }
}
/** JPEG de 250 Ko au plus : qualité 0,8, puis moins, puis image réduite d'un quart (canvas c modifié). */
async function srJpeg(c) {
  const enc = q => new Promise(r => { try { c.toBlob(b => r(b), 'image/jpeg', q); } catch (e) { r(null); } });
  for (let i = 0; i < 4; i++) {
    for (const q of [SR.q, 0.65, 0.5]) { const b = await enc(q); if (!b) return null; if (b.size <= SR.kb * 1024) return b; }
    const d = document.createElement('canvas'); d.width = Math.round(c.width * 0.75); d.height = Math.round(c.height * 0.75); d.getContext('2d').drawImage(c, 0, 0, d.width, d.height);
    c.width = d.width; c.height = d.height; c.getContext('2d').drawImage(d, 0, 0); d.width = d.height = 0;
  }
  return null;
}
/** Ce que l'appli a lu sur cette capture : texte du nom, carte retenue, ligne du bas (lue sur cette capture : src.__foot, scan.js › footRead), moteur, cadrage, diagnostic. */
function srRead(job, m, t0, W, H) {
  const f = job.src && job.src.__foot, own = f && (f.ft || f.raw) && SC.foot && SC.foot.ft === f.ft && SC.foot.raw === f.raw ? SC.foot : null;      // SC.foot : la dernière carte, seulement si c'est celle-ci
  const tr = SC.stream && SC.stream.getVideoTracks ? SC.stream.getVideoTracks()[0] : null, st = (tr && tr.getSettings && tr.getSettings()) || {}, now = performance.now();
  return {
    src: job.auto ? 'auto' : job.file ? 'photo' : NAT.on ? 'natcam' : 'webcam', frame: job.card ? 'card' : job.strip ? 'name' : 'photo', cap: W + 'x' + H, ms: t0 ? Math.round(now - t0) : null,
    raw: String((m && m.raw) || '').slice(0, 80), first: String(SC.raw || '').slice(0, 80),
    hit: m ? { name: m.name, key: m.key, card: m.card || 'en', score: Math.round((m.score || 0) * 1000) / 1000, via: m.via || '', ocr: m.lang || '', amb: !!m.amb, ft: m.ft ? srFt(m.ft) : null } : null,
    foot: f ? { raw: String(f.raw || '').slice(0, 80), ft: f.ft ? srFt(f.ft) : null, ...(own ? { name: own.name || '', card: own.card || '', keep: own.keep || '', via: own.via || '' } : {}) } : null,
    ocr: natOcr() ? 'mlkit' : 'tesseract', langs: ocrLangs(), names: namesLang() || 'en', cat: !!FRC.cat, oth: OTHX.at > 0,
    diag: { fps: Math.round(SC.fps) || 0, res: st.width ? st.width + 'x' + st.height : '', fr: Math.round(st.frameRate) || 0, fixed: !!SC.fixed, restarts: SC.restarts, slow: camSlow(), lt: SC.ltObs ? SC.lt.filter(t => now - t < 10000).length : null, cam: tr && tr.label ? String(tr.label).slice(0, 60) : '' },
  };
}
/** Scan fermé : captures libérées. */
function srFree() { SR.keep = []; }
/** Capture d'une ligne du scan : ligne « non reconnue » : la sienne ; carte (liste du scan, prix rapide) : la plus récente de cette carte, dans sa langue de préférence. */
function srFor(x) {
  if (!x) return null;
  if (x.key == null) return SR.keep.find(e => e.id === x.id && e.s === SC.session) || null;
  let best = null, bs = -1;
  for (const e of SR.keep) {
    const h = e.read.hit; if (e.s !== SC.session || !h || h.key !== x.key) continue;
    const s = (h.card === (x.l || 'en') ? 2 : 0) + (x.e && h.ft && h.ft.nums.includes(String(x.e).split('|')[1] || '') ? 1 : 0);
    if (s >= bs) { best = e; bs = s; }      // à égalité : la plus récente
  }
  return best;
}
/** Bouton de la carte en grand (zoom.js › liste « scan ») : { label, fn } ; déjà envoyé : { label, off } ; null : rien à signaler (pas de capture, fonction coupée). */
function srAct(x) {
  const e = srOn() && srFor(x); if (!e) return null;
  return e.sent ? { label: T('Scan signalé, merci'), off: true } : { label: T('Signaler un problème de scan'), fn: () => srOpen(e, x) };
}
/** Bouton de la ligne « Nom non reconnu » (scan.js › scanPaintList). */
function srMissBtn(m) {
  const e = srOn() && srFor(m); if (!e) return '';
  return `<button type="button" class="sc-rep" data-sr="${esc(String(m.id))}"${e.sent ? ' disabled' : ''}>${e.sent ? T('Signalé') : T('Signaler ce scan')}</button>`;
}
if (typeof document !== 'undefined') document.addEventListener('click', ev => {
  const b = ev.target && ev.target.closest && ev.target.closest('.sc-item.miss [data-sr]'); if (!b || !SC.el) return;
  const m = SC.miss.find(x => String(x.id) === b.dataset.sr), e = m && srFor(m); if (!e || e.sent) return;
  haptic('tap'); srOpen(e, m);
});
const srDataUrl = b => new Promise((ok, ko) => { const r = new FileReader(); r.onload = () => ok(String(r.result)); r.onerror = () => ko(r.error); r.readAsDataURL(b); });
/** Ce que l'appli a lu, en clair (feuille › « Ce que l'appli a lu »). */
function srFacts(e) {
  const r = e.read, h = r.hit, f = r.foot, row = (k, v) => (v ? `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>` : '');
  const fr = f && f.ft ? [f.ft.codes.join(','), f.ft.nums.join(','), f.ft.lang ? langCode(f.ft.lang) : '', f.ft.foil ? '★' : ''].filter(Boolean).join(' ') : '';
  return row(T('Texte lu'), r.raw || r.first ? '« ' + (r.raw || r.first) + ' »' : '—')
    + row(T('Carte retenue'), h ? [h.name, langCode(h.card), Math.round(h.score * 100) + ' %'].join(' · ') : T('aucune'))
    + row(T('Ligne du bas'), f ? '« ' + (f.raw || '—') + ' »' + (fr ? ' → ' + fr : '') : '')
    + row(T('Lecture'), [r.ocr === 'mlkit' ? 'ML Kit' : 'Tesseract', r.langs.join('+'), r.frame === 'card' ? T('Carte entière') : r.frame === 'name' ? T('Nom seulement') : T('Photo de la carte'), r.ms != null ? r.ms + ' ms' : ''].filter(Boolean).join(' · '))
    + row(T('Version de l\'appli'), [typeof DD_BUILD !== 'undefined' ? DD_BUILD : '', typeof isNativeApp === 'function' && isNativeApp() ? T('appli Android') : T('navigateur'), String(I18N.lang).toUpperCase()].filter(Boolean).join(' · '));
}
/** Données envoyées avec la photo : la lecture gardée, la ligne telle qu'elle est maintenant (langue, édition corrigées ?), réglages du scan, version, appli ou navigateur, langue. */
async function srMeta(e, x) {
  const native = typeof isNativeApp === 'function' && isNativeApp(), mo = native && typeof natPlugin === 'function' ? natPlugin('ManaOrbit') : null;
  let apk = 0; if (mo) { try { const i = await Promise.race([mo.info(), new Promise(r => setTimeout(() => r(null), 800))]); apk = Number(i && i.build) || 0; } catch (er) { apk = 0; } }      // version de l'appli Android (pwa.js › apkCheck)
  let pwa = false; try { pwa = !native && matchMedia('(display-mode: standalone)').matches; } catch (er) { /* ignore */ }
  const miss = x.key == null, a = SC.art;
  return {
    v: 1, build: typeof DD_BUILD !== 'undefined' ? DD_BUILD : '', app: native ? 'android' : pwa ? 'pwa' : 'web', apk, ui: I18N.lang,
    scan: { frame: SCS.frame, ed: SCS.ed, lang: SCS.lang || '', auto: !!SCS.auto, pm: !!SC.pm, lot: !!SC.lot, remote: !!SC.remote },
    read: e.read, img: { w: e.w, h: e.h }, ago: Math.round((Date.now() - e.at) / 1000),
    line: miss ? { label: String(x.label || '').slice(0, 60), raw: x.raw || '' } : { name: x.name, shown: scanShown(x), l: x.l || '', e: x.e || '', es: x.es || '', maybe: !!x.maybe, q: x.q || x.n || 1, score: Number.isFinite(x.score) ? Math.round(x.score * 1000) / 1000 : null, via: x.via || '' },
    art: !miss && a && a.name === scanShown(x) ? a.res : '',      // dernière comparaison d'illustration (scaned.js), si c'est cette carte
  };
}
/** POST api/scan-report ; connecté : jeton Firebase (renouvelé une fois s'il a expiré ; indisponible : envoyé sans compte). → { status, code } (status 0 : réseau). */
async function srPost(o) {
  const u = typeof D !== 'undefined' && D.user, body = JSON.stringify(o);
  for (let a = 0; a < 2; a++) {
    let tok = ''; if (u) { try { tok = await u.getIdToken(a > 0); } catch (e) { tok = ''; } }
    let r; try { r = await fetch('api/scan-report', { method: 'POST', cache: 'no-store', headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...(tok ? { 'x-firebase-token': tok } : {}) }, body }); } catch (e) { return { status: 0, code: 'net' }; }
    const j = await r.json().catch(() => null);
    if (r.status === 401 && j && j.error === 'token_expired' && a === 0) continue;
    return { status: r.status, code: (j && j.error) || '' };
  }
  return { status: 401, code: 'token_expired' };
}
function srErrText(r) {
  if (!r.status) return collOffline() ? T('Hors ligne : le signalement n\'est pas parti. Réessaie une fois connecté.') : T('Serveur injoignable : le signalement n\'est pas parti. Réessaie dans un moment.');
  if (r.status === 429) return T('Trop de signalements pour le moment : réessaie dans un moment.');
  if (r.status === 413) return T('Photo trop lourde pour être envoyée.');
  if (r.status === 404) return T('Les signalements sont coupés pour le moment.');
  return T('Envoi impossible pour le moment : réessaie plus tard.');
}
/** Feuille « Signaler un problème de scan » : e : capture gardée ; x : ligne du scan (carte) ou ligne « non reconnue ». */
function srOpen(e, x) {
  if (typeof closeCardImage === 'function') closeCardImage();      // la carte en grand se ferme : la feuille passe devant le scan
  const miss = x.key == null;
  let what = miss ? 'miss' : '', busy = false, img = '';
  const api = openSheet(T('Signaler un problème de scan'), miss ? T('Nom non reconnu') : scanShown(x), a => a.wrap.classList.add('sr-sheet'));
  api.body.innerHTML = `<div class="sr"><div class="sr-ph" data-busy="1"><img alt="${esc(T('Ta photo'))}" hidden></div>
      <p class="label" id="srWhatL">${T('Qu\'est-ce qui ne va pas ?')}</p>
      <div class="sr-what" role="group" aria-labelledby="srWhatL">${srWhats().map(([v, l]) => `<button type="button" class="fopt" data-w="${v}" aria-pressed="${v === what}">${esc(l)}</button>`).join('')}</div>
      <label class="label" for="srNote">${T('Commentaire (facultatif)')}</label>
      <textarea id="srNote" class="sr-note" rows="2" maxlength="300" placeholder="${esc(T('Par exemple : carte française lue en allemand'))}"></textarea>
      <p class="hint sr-why">${T('La photo de la carte et ce que l\'appli a lu sont envoyés à l\'équipe Mana Orbit pour améliorer le scan. Rien d\'autre.')}</p>
      <details class="sr-det"><summary>${T('Ce que l\'appli a lu')}</summary><dl>${srFacts(e)}</dl></details>
      <p class="sr-err" role="alert" hidden></p></div>`;
  api.setFoot(`<button class="btn ghost" type="button" data-close>${T('Annuler')}</button><button class="btn" type="button" data-sr-go disabled>${T('Envoyer')}</button>`);
  const goB = $('[data-sr-go]', api.foot), err = $('.sr-err', api.body), ph = $('.sr-ph', api.body), im = $('img', ph);
  const paint = () => { goB.disabled = busy || !what || !img; goB.textContent = busy ? T('Envoi…') : T('Envoyer'); $$('[data-w]', api.body).forEach(b => b.setAttribute('aria-pressed', String(b.dataset.w === what))); };
  const fail = t => { err.textContent = t; err.hidden = false; haptic('warn'); };
  (async () => {
    const b = e.blob || await e.p; let u = '';
    try { u = b ? await srDataUrl(b) : ''; } catch (er) { u = ''; }
    if (!sheets.includes(api)) return;
    ph.dataset.busy = '0';
    if (!u) { fail(T('Photo indisponible : rien à envoyer.')); return; }
    img = u; im.src = u; im.hidden = false; paint();
  })();
  api.body.addEventListener('click', ev => { const c = ev.target.closest('[data-w]'); if (!c || busy) return; haptic('tap'); what = c.dataset.w; paint(); });
  goB.addEventListener('click', async () => {
    if (busy || !what || !img) return;
    err.hidden = true;
    if (collOffline()) { fail(T('Hors ligne : le signalement n\'est pas parti. Réessaie une fois connecté.')); return; }
    busy = true; paint();
    let r; try { r = await srPost({ img, what, note: $('#srNote', api.body).value.replace(/\s+/g, ' ').trim().slice(0, 300), meta: await srMeta(e, x) }); } catch (er) { r = { status: 0 }; }
    busy = false;
    if (!sheets.includes(api)) return;
    if (r.status === 200) { e.sent = true; api.close(); haptic('ok'); toast(T('Merci ! Le scan est signalé à l\'équipe Mana Orbit.')); if (SC.el) scanPaintList(); return; }
    if (r.status === 404) CTX.scanrep = false;      // coupé sur le serveur : le bouton disparaît
    paint(); fail(srErrText(r));
  });
  paint();
  return api;
}
