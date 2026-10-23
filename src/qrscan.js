/* ── qrscan.js : lecteur de QR code dans l'appli (appareil photo du téléphone) ─────────────────────────────────────────────────────────────────
   Avant, l'appli n'en avait aucun : les liens (?table=, ?partie=, échange) se scannent avec l'appareil photo du téléphone, qui ouvre l'appli. Il sert au compteur
   de vie sans réseau (« Ajouter un joueur par QR » : partie-qr.js), où il n'y a pas de lien à ouvrir. Lecture : BarcodeDetector du navigateur (Chrome et WebView
   Android, macOS) ; sinon jsQR (jsDelivr, version figée, gardé par le service worker comme Tesseract : qrScanWarm le charge à l'avance quand il y a du réseau,
   pour la soirée sans réseau). Caméra : getUserMedia (navigateur, PWA, WebView de l'appli Android, comme le scan des cartes en secours). Aucune image ne
   quitte le téléphone ; la caméra s'arrête à la fermeture de la feuille. qrScanFeed(texte) : texte lu (aussi l'entrée des tests : la caméra ne s'y simule pas). */
const QRS_LIB = 'https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js';
const QRS = { cb: null, last: '', lastAt: 0, lib: null };
/** jsQR (fonction), chargé une fois ; null : hors ligne et pas encore gardé par le service worker. */
function qrScanLib() {
  if (typeof jsQR === 'function') return Promise.resolve(jsQR);
  if (QRS.lib) return QRS.lib;
  QRS.lib = new Promise(res => {
    const s = document.createElement('script'); s.src = QRS_LIB; s.async = true; s.crossOrigin = 'anonymous';
    s.onload = () => res(typeof jsQR === 'function' ? jsQR : null); s.onerror = () => { QRS.lib = null; s.remove(); res(null); };
    document.head.appendChild(s);
  });
  return QRS.lib;
}
const qrScanNative = () => typeof window !== 'undefined' && 'BarcodeDetector' in window;
/** Préparation d'une partie, avec du réseau : le lecteur de secours est mis de côté par le service worker (téléphone sans BarcodeDetector : iPhone, Firefox). */
function qrScanWarm() { if (!qrScanNative() && navigator.onLine !== false) setTimeout(() => { qrScanLib(); }, 1500); }
/** Détecteur du navigateur s'il lit les QR codes, sinon null. */
async function qrScanDetector() {
  if (!qrScanNative()) return null;
  try { const f = await BarcodeDetector.getSupportedFormats(); return f.includes('qr_code') ? new BarcodeDetector({ formats: ['qr_code'] }) : null; } catch (e) { return null; }
}
/** Texte lu : le même relu dans les 2,5 s ignoré (le code reste devant l'objectif), sinon remis à l'appelant. */
function qrScanFeed(text) {
  const s = String(text == null ? '' : text); if (!s || !QRS.cb) return false;
  if (s === QRS.last && Date.now() - QRS.lastAt < 2500) return false;
  QRS.last = s; QRS.lastAt = Date.now(); QRS.cb(s); return true;
}
/**
 * Feuille du lecteur : aperçu de la caméra (arrière), cadre de visée, message (aria-live), « Terminé ». Lit en continu : o.onText(texte) → { ok (true, false, null : neutre),
 * msg } affiché sous l'aperçu (un joueur après l'autre) ; o.once : fermée après la première lecture acceptée. o : { title, sub, hint, onText, onClose }.
 */
function qrScanOpen(o = {}) {
  return openSheet(o.title || T('Scanner un QR code'), o.sub || '', api => {
    api.wrap.classList.add('qrs-sheet');
    api.body.innerHTML = `<div class="qrs-view"><video playsinline muted autoplay aria-hidden="true"></video><i class="qrs-frame" aria-hidden="true"></i><p class="qrs-cam" hidden></p></div><p class="qrs-msg" aria-live="polite">${esc(o.hint || T('Vise le QR code : il est lu tout seul.'))}</p>`;
    api.setFoot(`<button class="btn block" type="button" data-close>${T('Terminé')}</button>`);
    const video = $('video', api.body), msg = $('.qrs-msg', api.body), cam = $('.qrs-cam', api.body);
    let on = true, stream = null, t = 0, det = null, lib = null, cv = null;
    const say = (s, ok) => { msg.textContent = s; msg.classList.toggle('ok', ok === true); msg.classList.toggle('bad', ok === false); };
    QRS.cb = text => {
      let r = null; try { r = o.onText ? o.onText(text) : null; } catch (e) { r = null; }
      Promise.resolve(r).then(x => { if (!on || !x) return; say(x.msg || '', x.ok); if (x.ok !== false) haptic('ok'); if (o.once && x.ok) api.close(); });
    };
    QRS.last = ''; QRS.lastAt = 0;
    const noCam = s => { cam.hidden = false; cam.textContent = s; };
    const tick = async () => {
      if (!on) return;
      try {
        if (video.readyState >= 2 && video.videoWidth) {
          let text = '';
          if (det) { const c = await det.detect(video); text = c && c[0] ? c[0].rawValue : ''; }
          else if (lib) {
            const k = Math.min(1, 720 / Math.max(video.videoWidth, video.videoHeight)), w = Math.round(video.videoWidth * k), h = Math.round(video.videoHeight * k);
            cv = cv || document.createElement('canvas'); cv.width = w; cv.height = h; const g = cv.getContext('2d', { willReadFrequently: true }); g.drawImage(video, 0, 0, w, h);
            const r = lib(g.getImageData(0, 0, w, h).data, w, h, { inversionAttempts: 'dontInvert' }); text = r ? r.data : '';
          }
          if (text && on) qrScanFeed(text);
        }
      } catch (e) { /* image pas encore prête */ }
      if (on) t = setTimeout(tick, det ? 120 : 220);
    };
    (async () => {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || (typeof isSecureContext !== 'undefined' && !isSecureContext)) { noCam(T('Appareil photo indisponible sur cet appareil.')); return; }
      try { stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false }); }
      catch (e) { noCam(e && e.name === 'NotAllowedError' ? T('Accès à l\'appareil photo refusé : autorise-le dans les réglages du téléphone.') : T('Appareil photo indisponible sur cet appareil.')); return; }
      if (!on) { stream.getTracks().forEach(x => x.stop()); return; }
      video.srcObject = stream; try { await video.play(); } catch (e) { /* lecture auto refusée : l'image arrive quand même */ }
      det = await qrScanDetector(); if (!det) { lib = await qrScanLib(); if (!lib && on) noCam(T('Lecteur de QR code pas encore chargé : ouvre cet écran une fois avec du réseau.')); }
      tick();
    })();
    const close = api.close;
    api.close = () => { on = false; clearTimeout(t); if (QRS.cb) QRS.cb = null; try { if (stream) stream.getTracks().forEach(x => x.stop()); } catch (e) { /* déjà arrêtée */ } if (o.onClose) o.onClose(); close(); };
  });
}
