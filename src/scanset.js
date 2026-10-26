/* ── scanset.js : réglages du scan (feuille « Réglages du scan », bouton des réglages et pastille « Éditions » de l'écran de scan) ──────────────
   Sur l'appareil (deckdeal:scanset) et dans le compte (users/{uid}/meta/prefs : { scan: {…}, updatedAt } ; le plus récent l'emporte), comme les réglages d'échange.
   ed : éditions des cartes scannées — 'scan' (comme la 1re carte : extensions du scan, scaned.js) · 'card' (carte par carte : choisies à la fin, écran « Éditions à choisir »)
        · 'none' (sans édition : carte et langue seulement) ;
   auto : scan automatique (scan.js › scanAuto) · delay : écart minimal entre deux cartes en automatique (ms) · same : même carte à la suite en automatique, 'ask' (demander) ou 'add' (+1) ;
   lang : langue des cartes imposée ('' : lue sur chaque carte) · vib, snd : vibration et son à chaque carte reconnue ;
   frame : cadrage — 'card' (carte entière : nom + ligne du bas, l'édition lue sur la carte, scanfoot.js) · 'name' (caméra compacte, nom seulement) ;
   pa : alerte de prix (centimes, montant libre ; 0 : coupée) · pp : dernier emplacement choisi par « Mettre à part », proposé d'office (scan.js › scanPaCheck). */
const SCS_KEY = 'deckdeal:scanset', SCS_LANGS = ['fr', 'en', 'de', 'es', 'it', 'pt', 'ru', 'jp', 'kr', 'zh-CN', 'zh-TW'], SCS_DELAYS = [250, 500, 1000];
/** Cadrage par défaut : carte entière dans l'appli Android (ML Kit lit le nom et la ligne du bas sur toute la carte), nom seulement dans le navigateur (Tesseract est plus sûr sur la bande). */
function scsFrameDef() { try { return typeof window !== 'undefined' && window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform() ? 'card' : 'name'; } catch (e) { return 'name'; } }      // native.js est chargé après ce fichier
const SCS_DEF = { ed: 'scan', auto: false, delay: 500, same: 'ask', lang: '', vib: true, snd: false, frame: '', pa: 0, pp: '' };
const SCS = { ...SCS_DEF, frame: scsFrameDef(), u: 0, who: '', doc: { uid: '', unsub: null, pushT: 0 } };
/** Réglages lus (appareil, compte) → valeurs sûres ; tout le reste prend la valeur par défaut. */
function scsClean(o) {
  const x = o && typeof o === 'object' ? o : {};
  return { ed: ['scan', 'card', 'none'].includes(x.ed) ? x.ed : SCS_DEF.ed, auto: x.auto === true, delay: SCS_DELAYS.includes(x.delay) ? x.delay : SCS_DEF.delay,
    same: x.same === 'add' ? 'add' : 'ask', lang: SCS_LANGS.includes(x.lang) ? x.lang : '', vib: x.vib !== false, snd: x.snd === true, frame: x.frame === 'name' || x.frame === 'card' ? x.frame : scsFrameDef(),
    pa: Number.isInteger(x.pa) && x.pa > 0 && x.pa <= 1e7 ? x.pa : 0, pp: typeof x.pp === 'string' && x.pp.length < 80 ? x.pp : '' };
}
function scsLoad() {
  try { const j = JSON.parse(localStorage.getItem(SCS_KEY) || 'null'); if (j) { Object.assign(SCS, scsClean(j.s)); SCS.u = Number(j.u) || 0; SCS.who = typeof j.who === 'string' ? j.who : ''; } } catch (e) { /* illisible : réglages par défaut */ }
}
function scsWrite() { try { localStorage.setItem(SCS_KEY, JSON.stringify({ s: scsClean(SCS), u: SCS.u, who: SCS.who })); } catch (e) { /* stockage plein ou refusé */ } }
scsLoad();
/** Un réglage change ici : enregistré, envoyé au compte, appliqué au scan ouvert. */
function scsSet(patch) { Object.assign(SCS, scsClean({ ...scsClean(SCS), ...patch })); SCS.u = Date.now(); scsWrite(); scsPushSoon(); scsApply(); }
/** Scan ouvert : mode des éditions, boutons et liste suivent les réglages. */
function scsApply() { if (typeof SC !== 'undefined' && SC.el) { scanFrameApply(); scanEdMode(); scanPaintTools(); scanPaintList(); } }

/* ── Dans le compte ─────────────────────────────────────────────────────────────────────────────── */
function scsUser(user) {
  const d = SCS.doc; if (d.unsub) { try { d.unsub(); } catch (e) { /* ignore */ } d.unsub = null; } clearTimeout(d.pushT); d.pushT = 0; d.uid = '';
  if (!user || !D.cloud || !D.cloud.watchMeta) return;
  if (SCS.who !== user.uid) SCS.u = 0;      // autre compte (ou premier passage) : les réglages du compte, s'il en a, l'emportent sur ceux de l'appareil
  SCS.who = user.uid; scsWrite(); d.uid = user.uid;
  d.unsub = D.cloud.watchMeta(user.uid, 'prefs', (data, pending, fromCache) => {
    if (pending || fromCache || D.uid !== user.uid) return;
    const ru = Number(data && data.updatedAt) || 0;
    if (data && ru > SCS.u) { Object.assign(SCS, scsClean(data.scan)); SCS.u = ru; scsWrite(); scsApply(); }
    else if (!data || SCS.u > ru) scsPushSoon();      // compte sans réglages : ceux de l'appareil y partent
  }, () => { /* règles pas encore publiées : réglages gardés sur l'appareil */ });
}
function scsPushSoon() { const d = SCS.doc; if (!d.uid) return; clearTimeout(d.pushT); d.pushT = setTimeout(scsPush, 900); }
async function scsPush() {
  const d = SCS.doc; clearTimeout(d.pushT); d.pushT = 0;      // non nul : envoi en attente (syncFlush)
  if (!d.uid || acctHeld(d.uid) || !cloudOn() || !D.cloud.saveMeta) return;      // autre compte, ou compte en cours de suppression
  try { await D.cloud.saveMeta(d.uid, 'prefs', { scan: scsClean(SCS), updatedAt: SCS.u || Date.now() }); } catch (e) { /* hors ligne, règles : renvoyé au prochain changement */ }
}

/* ── Effets à chaque carte reconnue ─────────────────────────────────────────────────────────────── */
/** Vibration (si réglée) et petit son (si réglé) : carte reconnue. */
function scsCue() {
  if (SCS.vib) haptic('ok');
  if (!SCS.snd) return;
  try {
    const A = window.AudioContext || window.webkitAudioContext; if (!A) return;
    const ctx = SCS.ac || (SCS.ac = new A()), o = ctx.createOscillator(), g = ctx.createGain(), t = ctx.currentTime;
    o.type = 'sine'; o.frequency.setValueAtTime(880, t); o.frequency.exponentialRampToValueAtTime(1320, t + 0.07);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.18, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
    o.connect(g); g.connect(ctx.destination); o.start(t); o.stop(t + 0.13);
  } catch (e) { /* audio refusé : sans importance */ }
}

/* ── Feuille « Réglages du scan » ───────────────────────────────────────────────────────────────── */
const SCS_FRAMES = [
  ['card', 'Carte entière', 'Lit aussi la petite ligne en bas à gauche (numéro, extension) : l\'édition exacte, sur les cartes depuis 2014.'],
  ['name', 'Nom seulement', 'Caméra compacte : seul le nom est lu.'],
];
const SCS_EDS = [
  ['scan', 'Comme la 1re carte', 'Booster, boîte : tu choisis l\'édition de la 1re carte, les suivantes la prennent ; une carte d\'une autre extension te demande la sienne.'],
  ['card', 'Carte par carte', 'Deck, classeur : choisies à la fin du scan, en voyant les illustrations.'],
  ['none', 'Sans édition', 'Le plus rapide : carte et langue seulement, à préciser plus tard dans ta collection.'],
];
/** Alerte de prix : seuil lisible (« 5 € ») et emplacement des cartes au-dessus, s'il existe encore. */
const scsPaLabel = () => fmt(SCS.pa, 'EUR').replace(/[,.]00(?=\D)/, '');
const scsPaPlace = () => (SCS.pp && typeof COLL !== 'undefined' && COLL.places && COLL.places[SCS.pp] ? SCS.pp : '');
/** Montant de l'alerte dans le champ (« 1,5 » → « 1,50 ») ; montant tapé → centimes (0 : vide ou illisible). */
const scsPaInput = () => (SCS.pa / 100).toLocaleString(LOC(), { minimumFractionDigits: SCS.pa % 100 ? 2 : 0, maximumFractionDigits: 2 });
const scsPaParse = v => { const n = Number(String(v || '').replace(/[\s€]/g, '').replace(',', '.')); return Number.isFinite(n) && n > 0 ? Math.min(1e7, Math.round(n * 100)) : 0; };
/** Cadrage ou éditions : la liste des choix, avec leur explication. */
function scsChoose(k, done) {
  const [title, list] = k === 'frame' ? [T('Cadrage'), SCS_FRAMES] : [T('Éditions'), SCS_EDS];
  openSheet(title, '', api => {
    api.body.innerHTML = `<div class="scs-eds" role="radiogroup" aria-label="${esc(title)}">${list.map(([v, t, d]) => `<button type="button" class="scs-ed" role="radio" data-v="${v}" aria-checked="${SCS[k] === v}"><span><b>${esc(T(t))}</b><small>${esc(T(d))}</small></span><i aria-hidden="true"></i></button>`).join('')}</div>`;
    api.body.addEventListener('click', e => { const b = e.target.closest('[data-v]'); if (!b) return; haptic('tap'); scsSet({ [k]: b.dataset.v }); api.close(); if (done) done(); });
  });
}
/** Libellé court du réglage des éditions (pastille de l'écran de scan). */
const scsEdLabel = () => (SCS.ed === 'card' ? T('Éditions : à la fin') : SCS.ed === 'none' ? T('Sans édition') : T('Éditions : comme la 1re'));
const scsLangName = l => { const n = LANGS[l] || l; return n.charAt(0).toUpperCase() + n.slice(1); };
function scsHtml() {
  const chip = (k, v, label, on) => `<button type="button" class="fopt" data-s="${k}" data-v="${esc(String(v))}" aria-pressed="${on}">${esc(label)}</button>`;
  const sw = (id, k, title, sub, on) => `<label class="switch-row" for="${id}"><span class="t"><b>${esc(title)}</b>${sub ? `<span class="hint">${esc(sub)}</span>` : ''}</span><span class="switch"><input type="checkbox" id="${id}" data-s="${k}"${on ? ' checked' : ''}><i></i></span></label>`;
  const oth = SCS_LANGS.filter(l => l !== 'fr' && l !== 'en'), othOn = oth.includes(SCS.lang);
  const sec = s => (Number(s) / 1000).toLocaleString(LOC()) + ' s';
  return `<div class="scs">${typeof opnScsRow === 'function' ? opnScsRow() : ''}
    ${typeof scdRowHtml === 'function' ? scdRowHtml() : ''}
    <div class="scs-picks">${[['frame', T('Cadrage'), SCS_FRAMES], ['ed', T('Éditions'), SCS_EDS]].map(([k, h, l]) => `<button type="button" class="scs-pick" data-pick="${k}" aria-haspopup="dialog"><small>${esc(h)}</small><b>${esc(T((l.find(o => o[0] === SCS[k]) || l[0])[1]))}</b><svg class="i" aria-hidden="true"><use href="#i-back"/></svg></button>`).join('')}</div>
    <p class="scs-h">${T('Prise de la carte')}</p>
    ${sw('scsAuto', 'auto', T('Scan automatique'), T('La carte s\'ajoute dès que son nom est net et immobile, sans appuyer sur le cercle.'), SCS.auto)}
    ${SCS.auto ? `<div class="scs-row"><span>${T('Délai entre deux cartes')}</span><span class="scs-chips">${SCS_DELAYS.map(v => chip('delay', v, sec(v), SCS.delay === v)).join('')}</span></div>
      <div class="scs-row"><span>${T('Même carte à la suite')}</span><span class="scs-chips">${chip('same', 'ask', T('Demander'), SCS.same === 'ask')}${chip('same', 'add', T('Ajouter +1'), SCS.same === 'add')}</span></div>` : ''}
    <p class="scs-h">${T('Alerte de prix')}</p>
    <label class="scs-pa"><span>${T('Cartes à partir de')}</span><input type="text" inputmode="decimal" autocomplete="off" data-s="pa" value="${SCS.pa ? esc(scsPaInput()) : ''}" placeholder="${esc(T('Aucune'))}" aria-label="${esc(T('Alerte de prix : montant en euros'))}"><b aria-hidden="true">€</b></label>
    <p class="hint scs-note">${SCS.pa ? esc(T('Une carte à {px} ou plus s\'annonce pendant le scan : « Mettre à part » la range dans l\'emplacement de ton choix.', { px: scsPaLabel() })) : esc(T('Un montant : les cartes qui valent autant ou plus s\'annoncent pendant le scan, pour les ranger à part. Vide : pas d\'alerte.'))}</p>
    <p class="scs-h">${T('Langue des cartes')}</p>
    <div class="scs-chips">${chip('lang', '', T('Auto'), !SCS.lang)}${chip('lang', 'fr', scsLangName('fr'), SCS.lang === 'fr')}${chip('lang', 'en', scsLangName('en'), SCS.lang === 'en')}<label class="fopt scs-oth"${othOn ? ' data-on="1"' : ''}><select data-s="lang" aria-label="${esc(T('Autre langue'))}"><option value=""${othOn ? '' : ' selected'}>${esc(othOn ? '—' : T('Autre…'))}</option>${oth.map(l => `<option value="${l}"${SCS.lang === l ? ' selected' : ''}>${esc(scsLangName(l))}</option>`).join('')}</select></label></div>
    <p class="hint scs-note">${T('Auto : la langue est lue sur chaque carte.')}<br>${T('Une seule langue dans le paquet : choisis-la, c\'est plus rapide.')}</p>
    <p class="scs-h">${T('À chaque carte')}</p>
    ${sw('scsVib', 'vib', T('Vibration'), '', SCS.vib)}${sw('scsSnd', 'snd', T('Son'), '', SCS.snd)}</div>`;
}
function scsSheet() {
  haptic('tap');
  openSheet(T('Réglages du scan'), D.user ? T('Enregistrés dans ton compte, les mêmes sur tous tes appareils') : T('Sur cet appareil (connecte-toi pour les retrouver partout)'), api => {
    api.wrap.classList.add('scs-sheet');
    const paint = () => { const y = api.body.scrollTop; api.body.innerHTML = scsHtml(); api.body.scrollTop = y; };
    paint();
    api.body.addEventListener('click', e => {
      if (e.target.closest('.opn-scs') && typeof opnEntry === 'function') { api.close(); opnEntry(); return; }      // session d'ouverture (opening.js)
      if (e.target.closest('[data-rcd]')) { scdPick(() => { paint(); if (typeof scanPaintTools === 'function') scanPaintTools(); }); return; }      // « Ranger dans » (places.js) : cet appareil seulement
      const pk = e.target.closest('[data-pick]'); if (pk) { haptic('tap'); scsChoose(pk.dataset.pick, paint); return; }      // cadrage, éditions : la liste des choix
      const b = e.target.closest('button[data-s]'); if (!b) return;
      const k = b.dataset.s, v = b.dataset.v; haptic('tap');
      scsSet({ [k]: k === 'delay' ? Number(v) : v }); paint();
    });
    api.body.addEventListener('change', e => {
      const x = e.target.closest('[data-s]'); if (!x) return;
      const k = x.dataset.s; scsSet({ [k]: x.type === 'checkbox' ? x.checked : k === 'pa' ? scsPaParse(x.value) : x.value }); paint();
    });
  });
}
