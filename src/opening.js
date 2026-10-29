/* ── opening.js : « Session d'ouverture » (boosters, boîte, display) et « Mode streamer » ─────────────────────────────────────────────────
   Une seule entrée : Réglages du scan (scanset.js) › « Session d'ouverture » (nom, prix payé facultatif, mode streamer) ; pendant la session, un bandeau
   discret sur le scan et une pastille sous l'orbe de l'accueil (« Session · 23 cartes · 145 € ») ouvrent la session en cours (cartes, « Terminer »).
   La session est un LOT À PART : les cartes ajoutées pendant qu'elle tourne (scan › Ajouter, prix rapide › +, « Ajouter des cartes » de lot.js, « Saisir »
   du scan) y vont avec leur langue, leur édition, leur quantité et leur prix, au lieu de la collection. « Terminer » les ajoute toutes d'un coup
   (collAdd, comme le scan : un seul chemin, avec ou sans mode streamer ; cartes écartées d'un appui avant), puis la session est rangée dans « Mes ouvertures ».
   Import, achats et decks ajoutés à la collection n'y passent pas (ce ne sont pas des cartes ouvertes). Le scan mobile (téléphone → PC) non plus.
   Mode streamer (option de la session, html.streamer) : collection, stats, accueil et « Compte et réglages » ne montrent que la session et son total ;
   ni e-mail ni lien ou QR code d'échange à l'écran, aucun bandeau de pub, aucune notification affichée dans l'appli. streamOn() → booléen (lu par d'autres modules).
   COLL.map n'est JAMAIS touché pendant la session : la vraie collection reste entière, se synchronise avec le compte et nourrit le widget Android comme
   d'habitude ; seul l'affichage change, par des crochets « opn… » / « streamOn » dans collection.js, home.js, me.js, scan.js, lot.js…, tous gardés par typeof.
   Session en cours : localStorage deckdeal:opn:cur (rechargement, appli tuée) ; historique : deckdeal:opn:hist (40 sessions au plus), sur cet appareil
   seulement (aucun document de compte : il faudrait une nouvelle règle Firestore).
   Bilan d'ouverture (prix payé, gain ou perte, meilleures cartes, partage en image) : opnbilan.js, retirable seul.
   Retirer toute la fonction : ôter 'opening.js' et 'opnbilan.js' de build.mjs (les crochets deviennent inertes), puis css/opening.css et i18n/*.opening.json. */
const OPN_CUR_KEY = 'deckdeal:opn:cur' + mkSfx(), OPN_HIST_KEY = 'deckdeal:opn:hist' + mkSfx(), OPN_HIST_MAX = 40;      // marché TCGplayer : ses propres sessions (montants en dollars)
const OPN = { cur: null, hist: null, seq: 0, raf: 0, sheet: null, on: new Set(), meta: null };      // on : repeints des feuilles ouvertes (chacun se retire à la fermeture de la sienne)
/** Œil barré (mode streamer) : pas dans le sprite de l'appli. */
const OPN_EYE = '<svg class="i opn-eye" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 3l18 18M10.6 5.2A10 10 0 0 1 12 5c5 0 8.6 4.3 9.6 6.5a1.3 1.3 0 0 1 0 1 12.8 12.8 0 0 1-2.5 3.4M6.6 6.6a13 13 0 0 0-4.2 4.9 1.3 1.3 0 0 0 0 1C3.4 14.7 7 19 12 19a9.6 9.6 0 0 0 4.4-1.1M9.9 9.9a3 3 0 0 0 4.2 4.2"/></svg>';
const OPN_CHEV = '<svg class="i opn-chev" aria-hidden="true"><use href="#i-chev"/></svg>';

/* ── État : session en cours (et mode streamer), gardée sur l'appareil ────────────────────────────────────────────────────── */
function opnOn() { return !!OPN.cur; }
/** Mode streamer en cours : la collection, la valeur, l'e-mail, le lien d'échange, la pub et les notifications sont cachés. */
function streamOn() { return !!(OPN.cur && OPN.cur.st); }
/** Session lue (appareil) → valeurs sûres ; null si illisible. Ligne : { id, k (ownKey), n (nom anglais), g (langue|édition), q, t, eu (centimes, prix à l'ajout), im (petite image) }. */
function opnClean(o) {
  if (!o || typeof o !== 'object' || typeof o.id !== 'string' || !Array.isArray(o.rows)) return null;
  const rows = o.rows.filter(r => r && typeof r.n === 'string' && r.n && r.q > 0).map(r => ({ id: String(r.id || 'r' + (++OPN.seq)), k: typeof r.k === 'string' && r.k ? r.k : ownKey(r.n), n: r.n, g: typeof r.g === 'string' ? r.g : '', q: Math.min(9999, Math.round(r.q)), t: Number(r.t) || 0, eu: r.eu > 0 ? Math.round(r.eu) : null, im: typeof r.im === 'string' ? r.im : '' }));
  return { id: o.id, name: String(o.name || '').slice(0, 60) || T('Ouverture'), at: Number(o.at) || Date.now(), paid: Number.isFinite(o.paid) && o.paid >= 0 ? Math.round(o.paid) : null, st: !!o.st, rows };
}
function opnSave() {
  try { if (OPN.cur) localStorage.setItem(OPN_CUR_KEY, JSON.stringify(OPN.cur)); else localStorage.removeItem(OPN_CUR_KEY); }
  catch (e) { toast(T('Stockage plein : la session n\'a pas pu être enregistrée sur cet appareil')); }
}
/** Classes de la page : html.opn-on (session en cours), html.streamer (mode streamer : css/opening.css cache ce qui ne doit pas passer à l'écran). */
function opnFlags() { const r = document.documentElement, was = r.classList.contains('streamer'); r.classList.toggle('opn-on', !!OPN.cur); r.classList.toggle('streamer', streamOn()); if (was !== streamOn() && typeof amDot === 'function') amDot(); }      // amis (friends.js) : point des demandes masqué / remis tout de suite
// Au chargement, avant le premier rendu de l'accueil : un rechargement en plein stream ne montre jamais la vraie collection, même un instant.
if (typeof document !== 'undefined') { try { OPN.cur = opnClean(JSON.parse(localStorage.getItem(OPN_CUR_KEY) || 'null')); } catch (e) { OPN.cur = null; } opnFlags(); if (OPN.cur) setTimeout(() => opnBands(), 0); }      // pastille de l'accueil : une fois l'appli démarrée

/** Prix d'un exemplaire d'une ligne (centimes) : son édition, sinon le prix de référence de la carte (prix du moment), sinon celui lu à l'ajout ; null sans prix. */
function opnEu(r) { const u = collLineEu(r.k, r.g); return u > 0 ? u : r.eu > 0 ? r.eu : null; }
/** Totaux : n exemplaires, u cartes différentes, v valeur (centimes). */
function opnTotals(rows) { let n = 0, v = 0; const u = new Set(); for (const r of rows) { n += r.q; u.add(r.k); const e = opnEu(r); if (e > 0) v += e * r.q; } return { n, u: u.size, v }; }
/** Chiffres du mode streamer pour l'accueil et « Compte et réglages » (null hors mode streamer) : { n exemplaires, u cartes, v centimes }. */
function opnSv() { return streamOn() ? opnTotals(OPN.cur.rows) : null; }
/** Petite image d'une ligne : celle de l'impression lue au scan, sinon celle de la collection (édition, langue), sinon Scryfall par le nom. */
function opnImg(r) { return r.im || collLineImage(r.k, r.g, (COLL.meta[r.k] || {}).im).src || scImg(r.n); }
/** Grande image (partage, meilleures cartes) : même serveur d'images, taille « normal ». */
function opnBig(r) { const s = r.im || collLineImage(r.k, r.g, (COLL.meta[r.k] || {}).im).src; return s ? s.replace('/small/', '/normal/') : 'https://api.scryfall.com/cards/named?exact=' + encodeURIComponent(r.n) + '&format=image&version=normal'; }
const opnName = r => frName(r.k, lineLang(r.g)) || r.n;

/* ── Cartes ajoutées pendant la session ─────────────────────────────────────────────────────────────────────────────────────── */
/** Ajout pendant une session (scan, prix rapide, « Ajouter des cartes », « Saisir ») : dans le lot de la session, jamais dans la collection.
 *  items : [{ k, n, q, l (clé de ligne langue|édition), p? (impression choisie : prix, image), eu?, im? }] ; o.toast : « N cartes ajoutées à la session » (Annuler).
 *  false sans session : l'appelant ajoute à la collection comme d'habitude. */
function opnTake(items, o = {}) {
  const c = OPN.cur; if (!c || !items || !items.length) return false;
  const was = c.rows.map(r => ({ ...r })), now = Date.now(); let n = 0;
  for (const it of items) {
    if (!it || !it.k || !it.n) continue;
    const g = it.l || '', l = lineLang(g), e = lineEd(g), q = Math.max(1, Math.min(999, Math.round(it.q) || 1)), p = e ? it.p : null;
    if (p) edRemember(it.k, l, e, edInfoOf(p, l));      // prix, extension et image de l'édition : gardés comme pour un ajout à la collection
    const m = COLL.meta[it.k], f = lineFoil(g), eu = (p && pkEu(p, f)) || (it.eu > 0 ? Math.round(it.eu) : null) || (m && (f && m.ef > 0 ? m.ef : m.eu > 0 ? m.eu : null)), im = (p && p.th) || it.im || '';      // prix du moment gardé avec la ligne (hors ligne, rechargement) ; foil : au prix foil
    let r = c.rows.find(x => x.k === it.k && x.g === g);
    if (r) { r.q = Math.min(9999, r.q + q); r.t = now; if (im) r.im = im; if (eu) r.eu = eu; c.rows = [r, ...c.rows.filter(x => x !== r)]; }      // même carte, même ligne : un exemplaire de plus, remontée en haut
    else { r = { id: 'r' + now.toString(36) + (++OPN.seq), k: it.k, n: it.n, g, q, t: now, eu, im }; c.rows.unshift(r); }
    n += q;
  }
  if (!n) return false;
  opnSave(); opnMeta(); opnPaint();
  if (o.toast) toast(TN(n, '{n} carte ajoutée à la session', '{n} cartes ajoutées à la session'), { label: T('Annuler'), fn: () => { if (OPN.cur !== c) return; c.rows = was; opnSave(); opnPaint(); } });
  return true;
}
/** Message après un ajout à la main pendant la session (« Ajouter des cartes », « Saisir »). */
function opnSay(name) { return T('{name} · ajoutée à la session « {s} »', { name, s: OPN.cur ? OPN.cur.name : '' }); }
/** Infos Scryfall des cartes de la session pas encore lues (image, prix, type, couleurs : stats et bilan) : gardées dans le cache de la collection (COLL.meta),
 *  qui n'est qu'un cache : la collection elle-même ne bouge pas. Un lot à la fois, devant les lectures de fond. */
function opnMeta() {
  const c = OPN.cur; if (!c || OPN.meta || Date.now() - (OPN.metaFail || 0) < 60000) return;      // échec récent : pas de nouvel essai à chaque repeint
  const seen = new Set(), need = c.rows.filter(r => !(r.k in COLL.meta) && !seen.has(r.k) && seen.add(r.k)).slice(0, 150);
  if (!need.length || scryLeft() > 0 || collOffline()) return;
  OPN.meta = scryCollection(need.map(r => r.n), undefined, null, true)
    .then(got => {
      for (const r of need) { const g = got.get(r.k); if (g) COLL.meta[r.k] = g; else if (!(r.k in COLL.meta)) COLL.meta[r.k] = null; }
      for (const r of c.rows) { const g = COLL.meta[r.k], u = g && (lineFoil(r.g) && g.ef > 0 ? g.ef : g.eu); if (!(r.eu > 0) && u > 0) r.eu = u; }      // prix lu (foil : le prix foil) : gardé avec la ligne
      collMetaSave(); if (OPN.cur === c) opnSave(); return true;
    })
    .catch(() => { OPN.metaFail = Date.now(); return false; })
    .then(more => { OPN.meta = null; opnPaint(); if (more) opnMeta(); });
}
/** Retire un exemplaire d'une ligne de la session (annulable). */
function opnDec(id) {
  const c = OPN.cur, r = c && c.rows.find(x => x.id === id); if (!r) return;
  const was = c.rows.map(x => ({ ...x }));
  if (r.q > 1) r.q--; else c.rows = c.rows.filter(x => x !== r);
  opnSave(); opnPaint(); haptic('tap');
  toast(T('{name} retirée de la session', { name: opnName(r) }), { label: T('Annuler'), fn: () => { if (OPN.cur !== c) return; c.rows = was; opnSave(); opnPaint(); } });
}

/* ── Repeints : bandeau du scan, pastille de l'accueil, feuille ouverte, collection, accueil, réglages ─────────────────────────────── */
function opnPaint() { if (!OPN.raf) OPN.raf = requestAnimationFrame(opnPaintNow); }
function opnPaintNow() {
  OPN.raf = 0; opnFlags(); opnBands(); opnSheets();
  if (COLL.el) { if (streamOn()) collPaint(); else opnCollHead(COLL.el); }      // mode streamer : la liste de la session ; sinon la note seule
  if (streamOn()) homeSoon();
  if (typeof meSoon === 'function' && ME.api) meSoon();
}
/** Début, fin, mode streamer changé : tout ce qui montre la collection se repeint (la vraie, ou la session). */
function opnRefresh() {
  opnFlags(); opnBands(); opnSheets(); opnMeta();
  if (COLL.el) collPaint();
  homeSoon(0); if (typeof meSoon === 'function' && ME.api) meSoon();
}
/** Feuilles de la session ouvertes : chacune suit (cartes, prix lus, mode streamer). */
function opnSheets() { for (const f of [...OPN.on]) f(); }
const opnPillTxt = c => { const t = opnTotals(c.rows); return [TN(t.n, '{n} carte', '{n} cartes'), t.v ? fmt(t.v, mkCur()) : ''].filter(Boolean).join(' · '); };
const opnIc = c => (c.st ? OPN_EYE : '<i class="opn-dot" aria-hidden="true"></i>');
/** Pastille de l'accueil (sous l'orbe, à la place du sous-titre) et bandeau du scan (au-dessus de la liste) : la session en cours, d'un appui. */
function opnBands() {
  const c = OPN.cur;
  let hm = document.getElementById('opnHm');
  if (!c) { if (hm) hm.remove(); }
  else {
    const sub = document.getElementById('collSub');
    if (!hm && sub) { hm = document.createElement('button'); hm.type = 'button'; hm.id = 'opnHm'; hm.className = 'opn-pill'; hm.onclick = () => opnSheet(); sub.after(hm); }
    if (hm) { hm.innerHTML = `${opnIc(c)}<span>${esc(T('Session'))} · ${esc(opnPillTxt(c))}</span>${OPN_CHEV}`; hm.setAttribute('aria-label', T('Session « {name} » : {n}', { name: c.name, n: opnPillTxt(c) })); }
  }
  const sc = typeof SC !== 'undefined' && SC.el; if (!sc) return;
  let w = $('.opn-bandw', sc);
  if (!c || SC.remote) { if (w) w.remove(); return; }      // scan mobile (téléphone → PC) : les cartes partent vers le PC, pas dans la session
  if (!w) { w = document.createElement('div'); w.className = 'opn-bandw'; w.innerHTML = '<button type="button" class="opn-band"></button>'; w.firstChild.onclick = () => opnSheet(); sc.insertBefore(w, $('.sc-head', sc)); }
  $('.opn-band', w).innerHTML = `${opnIc(c)}<span class="opn-bn">${esc(c.name)}</span><span class="opn-bt">${esc(opnPillTxt(c))}</span>${OPN_CHEV}`;
}

/* ── Feuilles : commencer, session en cours, terminer, mes ouvertures ─────────────────────────────────────────────────────── */
/** Entrée (Réglages du scan) : la session en cours, sinon « Commencer une session ». */
function opnEntry() { if (OPN.cur) opnSheet(); else opnStartSheet(); }
/** Ligne en haut de « Réglages du scan » (scanset.js). */
function opnScsRow() {
  const c = OPN.cur;
  return `<button type="button" class="opn-scs"><span class="opn-scs-i" aria-hidden="true">${c && c.st ? OPN_EYE : '<svg class="i"><use href="#i-cards"/></svg>'}</span><span class="opn-scs-t"><b>${c ? T('Session en cours') : T('Session d\'ouverture')}</b><small>${c ? esc(c.name) + ' · ' + esc(opnPillTxt(c)) : T('Boosters, boîte : un lot à part, ajouté à la fin, mode streamer')}</small></span>${OPN_CHEV}</button>`;
}
const opnSwitch = (id, on) => `<label class="switch-row opn-st" for="${id}"><span class="t"><b>${T('Mode streamer')}</b><span class="hint">${T('Cache ta collection pendant la session : seules les cartes ouvertes et leur total s\'affichent. Ni e-mail, ni lien d\'échange, ni pub, ni notification.')}</span></span><span class="switch"><input type="checkbox" id="${id}"${on ? ' checked' : ''}><i></i></span></label>`;
function opnStartSheet() {
  haptic('tap');
  openSheet(T('Session d\'ouverture'), T('Boosters, boîte : les cartes ouvertes vont dans un lot à part, ajouté à ta collection quand tu termines.'), api => {
    opnSheetUp(api);
    const def = T('Ouverture du {d}', { d: new Date().toLocaleDateString(LOC(), { day: '2-digit', month: '2-digit' }) }), nh = opnHist().length;
    api.body.innerHTML = `<div class="opn-start"><div class="field-in"><label class="label" for="opnName">${T('Nom')}</label><input type="text" id="opnName" maxlength="60" autocomplete="off" value="${esc(def)}"></div>
      ${typeof opnbPaidHtml === 'function' ? opnbPaidHtml(null) : ''}${opnSwitch('opnSt', false)}
      ${nh ? `<button type="button" class="opn-hrow" data-opn="hist"><span>${T('Mes ouvertures')}</span><em>${nf0(nh)}</em>${OPN_CHEV}</button>` : ''}</div>`;
    api.setFoot(`<button class="btn ghost" type="button" data-close>${T('Annuler')}</button><button class="btn" type="button" data-opn="go">${T('Commencer')}</button>`);
    api.wrap.addEventListener('click', e => {
      const b = e.target.closest('[data-opn]'); if (!b) return;
      if (b.dataset.opn === 'hist') { haptic('tap'); opnHistSheet(); return; }
      const name = ($('#opnName', api.body).value || '').trim().slice(0, 60) || def, st = $('#opnSt', api.body).checked;
      const paid = typeof opnbPaidRead === 'function' ? opnbPaidRead(api.body) : null;
      OPN.cur = { id: 'o' + Date.now().toString(36), name, at: Date.now(), paid, st, rows: [] };
      opnSave(); api.close(); haptic('ok'); opnRefresh();
      toast(st ? T('Session « {name} » commencée · mode streamer : ta collection est cachée', { name }) : T('Session « {name} » commencée : les cartes ajoutées y vont', { name }));
    });
  });
}
/** Mode streamer allumé ou coupé en cours de session. */
function opnStreamer(on) {
  const c = OPN.cur; if (!c || c.st === !!on) return;
  c.st = !!on; opnSave(); haptic('tap'); opnRefresh();
  toast(on ? T('Mode streamer : ta collection est cachée') : T('Mode streamer coupé'));
}
/** Feuille de la session : miniatures montrées une fois chargées (classe ok, comme la collection), image cassée retirée (la lettre reste). */
function opnSheetUp(a, ...cls) {
  a.wrap.classList.add('opn-sheet', ...cls);
  a.wrap.addEventListener('load', e => { if (e.target.tagName === 'IMG') e.target.classList.add('ok'); }, true);
  a.wrap.addEventListener('error', e => { if (e.target.tagName === 'IMG') e.target.remove(); }, true);
}
/** Pied d'une feuille repeinte : remplacé seulement s'il change (un bouton remplacé sous le doigt perdrait le toucher). */
function opnFoot(api, html) { if (api.opnFoot !== html) { api.opnFoot = html; api.setFoot(html); } }
const opnWhen = t => new Date(t).toLocaleString(LOC(), { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
function opnTilesHtml(t) {
  return `<div class="cs-tiles opn-tiles"><div><b>${nf0(t.n)}</b><span>${TN(t.n, 'carte ouverte', 'cartes ouvertes')}</span></div><div class="opn-val"><b>${t.v ? esc(fmt(t.v, mkCur())) : '—'}</b><span>${T('valeur · tendance Cardmarket')}</span></div></div>`;
}
/** Une ligne de la session : miniature, nom (imprimé si FR…), drapeau, édition, quantité, prix du lot. act : 'dec' (− : un exemplaire de moins), 'pick' (écarter / garder), 'fix' (historique : prix du moment de l'ouverture). */
function opnRowHtml(r, act, off) {
  const l = lineLang(r.g), e = lineEd(r.g), set = edSet(e), sn = e ? setName(set) || (COLL.ed[e] || {}).sn || '' : '', nm = opnName(r), u = act === 'fix' ? r.eu : opnEu(r), img = opnImg(r);
  const inner = `<span class="thumb" style="--h:${hash32(r.k) % 360}">${esc((nm.trim()[0] || '?').toUpperCase())}${img ? `<img alt="" loading="lazy" decoding="async" src="${esc(img)}">` : ''}</span>
    <span class="row-main"><span class="row-top"><span class="row-name">${esc(nm)}</span>${l ? `<span class="lchip ro">${flag(l)}</span>` : ''}</span>
      <span class="row-meta">${e ? `<span class="tag ed">${setIcHtml(set)}${esc(sn ? sn + ' #' + edNum(e) : edLabel(e))}</span>` : ''}${r.q > 1 ? `<span class="tag accent">× ${nf0(r.q)}</span>` : ''}${off ? `<span class="tag warn">${T('écartée')}</span>` : ''}</span></span>
    ${u > 0 ? `<span class="row-px"><span class="px cm"><b>${esc(fmt(u * r.q, mkCur()))}</b></span></span>` : ''}`;
  if (act === 'pick') return `<button type="button" class="crow opn-row opn-pick${u > 0 ? ' has-px' : ''}${off ? ' off' : ''}" data-id="${esc(r.id)}" role="checkbox" aria-checked="${!off}">${inner}<span class="opn-ck" aria-hidden="true"></span></button>`;
  return `<div class="crow opn-row${u > 0 ? ' has-px' : ''}" data-id="${esc(r.id)}">${inner}${act === 'dec' ? `<button type="button" class="opn-x" data-opn="dec" aria-label="${esc(T('Retirer un exemplaire de {name}', { name: nm }))}">−</button>` : ''}</div>`;
}
/** Session en cours : totaux, mode streamer, cartes (− pour corriger), « Terminer ». */
function opnSheet() {
  const c = OPN.cur; if (!c) { opnStartSheet(); return; }
  if (OPN.sheet && sheets.includes(OPN.sheet)) return;
  haptic('tap');
  const api = OPN.sheet = openSheet(c.name, T('Commencée le {d}', { d: opnWhen(c.at) }), a => opnSheetUp(a));
  const paint = () => {
    if (!sheets.includes(api) || OPN.cur !== c) { OPN.on.delete(paint); return; }
    const y = api.body.scrollTop;
    api.body.innerHTML = `${opnTilesHtml(opnTotals(c.rows))}${opnSwitch('opnSt2', c.st)}
      ${c.rows.length ? `<h3 class="cs-h">${T('Cartes de la session')}</h3><div class="coll-list opn-list">${c.rows.map(r => opnRowHtml(r, 'dec')).join('')}</div>`
        : `<p class="hint opn-empty">${T('Scanne tes cartes (ou ajoute-les avec +) : elles arrivent ici, puis rejoignent ta collection quand tu termines.')}</p>`}
      <button class="link-btn opn-quit" type="button" data-opn="quit">${T('Abandonner la session')}</button>`;
    api.body.scrollTop = y;
    opnFoot(api, `${typeof SC !== 'undefined' && SC.el ? '' : `<button class="btn ghost" type="button" data-opn="scan"><svg class="i" aria-hidden="true"><use href="#i-camera"/></svg>${T('Scanner')}</button>`}<button class="btn" type="button" data-opn="end">${T('Terminer')}</button>`);
  };
  OPN.on.add(paint); paint(); setIcLoad(() => paint()); opnMeta();
  api.body.addEventListener('change', e => { if (e.target.id === 'opnSt2') opnStreamer(e.target.checked); });
  api.wrap.addEventListener('click', e => {
    const b = e.target.closest('[data-opn]'); if (!b) return;
    const a = b.dataset.opn;
    if (a === 'dec') { const row = b.closest('[data-id]'); if (row) opnDec(row.dataset.id); }
    else if (a === 'end') opnEndSheet();
    else if (a === 'quit') opnQuitAsk();
    else if (a === 'scan') { api.close(); haptic('tap'); setTimeout(() => openScan(), reduceMotion() ? 0 : 200); }
  });
}
/** « Abandonner la session » : rien n'est ajouté ni gardé (annulable). */
function opnQuitAsk() {
  const c = OPN.cur; if (!c) return;
  const n = opnTotals(c.rows).n;
  openSheet(T('Abandonner la session ?'), c.name, api => {
    api.body.innerHTML = `<p class="cf-msg">${n ? TN(n, 'Sa {n} carte ne sera pas ajoutée à ta collection, et la session ne sera pas gardée dans « Mes ouvertures ».', 'Ses {n} cartes ne seront pas ajoutées à ta collection, et la session ne sera pas gardée dans « Mes ouvertures ».') : T('Aucune carte dans la session.')}</p>`;
    api.setFoot(`<button class="btn ghost" type="button" data-close>${T('Annuler')}</button><button class="btn danger" type="button" data-ok>${T('Abandonner')}</button>`);
    api.foot.addEventListener('click', e => {
      if (!e.target.closest('[data-ok]')) return;
      api.close(); opnClose(); OPN.cur = null; opnSave(); opnRefresh(); haptic('tap');
      toast(T('Session abandonnée'), { label: T('Annuler'), fn: () => { if (OPN.cur) return; OPN.cur = c; opnSave(); opnRefresh(); } });
    });
  });
}
/** Ferme les feuilles de la session (session en cours, bilan). */
function opnClose() { for (const s of sheets.filter(x => x.wrap.classList.contains('opn-sheet'))) s.close(); }
/** « Terminer » : bilan (opnbilan.js) ou simple récapitulatif, cartes à écarter d'un appui, puis « Ajouter » → collection et « Mes ouvertures ». */
function opnEndSheet() {
  const c = OPN.cur; if (!c) return;
  if (!c.rows.length) { opnClose(); OPN.cur = null; opnSave(); opnRefresh(); toast(T('Session terminée : aucune carte à ajouter')); return; }
  haptic('tap');
  const off = new Set(), bil = typeof opnbHtml === 'function', kept = () => c.rows.filter(r => !off.has(r.id));
  const api = openSheet(bil ? T('Bilan de l\'ouverture') : T('Terminer la session'), c.name + ' · ' + opnWhen(c.at), a => opnSheetUp(a, 'opn-end'));
  const paint = () => {
    if (!sheets.includes(api) || OPN.cur !== c) { OPN.on.delete(paint); return; }
    const rows = kept(), t = opnTotals(rows), ae = document.activeElement;
    if (ae && ae.tagName === 'INPUT' && api.body.contains(ae)) { if (typeof opnbRes === 'function') opnbRes(api, c, rows); return; }      // prix payé en cours de saisie : seul le résultat suit (le champ garde le focus)
    const y = api.body.scrollTop;
    api.body.innerHTML = `${opnTilesHtml(t)}${bil ? opnbHtml(c, rows, t) : ''}
      <h3 class="cs-h">${T('Cartes de la session')}</h3><p class="hint opn-endh">${T('Touche une carte pour l\'écarter : elle ne sera pas ajoutée.')}</p>
      <div class="coll-list opn-list">${c.rows.map(r => opnRowHtml(r, 'pick', off.has(r.id))).join('')}</div>`;
    api.body.scrollTop = y;
    const share = bil && typeof simgShare === 'function' && typeof opnbShare === 'function' && rows.length;      // image à partager (autre module) : seulement s'il est là
    opnFoot(api, `${share ? `<button class="btn ghost" type="button" data-opn="share"><svg class="i" aria-hidden="true"><use href="#i-share"/></svg>${T('Partager')}</button>` : ''}<button class="btn" type="button" data-opn="add"${rows.length ? '' : ' disabled'}>${TN(t.n, 'Ajouter {n} carte', 'Ajouter {n} cartes')}</button>`);
  };
  OPN.on.add(paint); paint(); setIcLoad(() => paint()); opnMeta();      // prix et images lus pendant que le bilan est ouvert : il suit
  if (bil && typeof opnbBind === 'function') opnbBind(api, c, kept);
  api.wrap.addEventListener('click', e => {
    const b = e.target.closest('[data-opn], .opn-pick'); if (!b) return;
    if (b.classList.contains('opn-pick')) { const id = b.dataset.id; if (off.has(id)) off.delete(id); else off.add(id); haptic('tap'); const ae = document.activeElement; if (ae && ae.tagName === 'INPUT') ae.blur(); paint(); return; }
    if (b.dataset.opn === 'share') { haptic('tap'); opnbShare(c, kept()); }
    else if (b.dataset.opn === 'add') opnFinish(c, kept());
  });
}
/** Fin de la session : ses cartes (moins les écartées) rejoignent la collection d'un coup, la session est rangée dans « Mes ouvertures » (annulable). */
function opnFinish(c, rows) {
  if (OPN.cur !== c || !rows.length) return;
  const before = COLL.map, t = opnTotals(rows);
  collAdd(rows.map(r => ({ k: r.k, n: r.n, q: r.q, l: r.g })), 'add'); collEnrich();      // même ajout que le scan (collAdd) : langue et édition de chaque ligne
  const rec = { id: c.id, name: c.name, at: c.at, end: Date.now(), paid: c.paid, st: c.st ? 1 : 0, n: t.n, v: t.v, rows: rows.map(r => [r.n, r.g, r.q, opnEu(r) || 0]) };
  OPN.hist = [rec, ...opnHist().filter(x => x.id !== rec.id)]; opnHistSave();
  if (typeof prgOpen === 'function') prgOpen(t.v, c.paid, rows.reduce((a, r) => Math.max(a, opnEu(r) || 0), 0), t.n, !!c.st);      // niveau et badges (progress.js)
  opnClose(); OPN.cur = null; opnSave(); haptic('ok'); opnRefresh();
  toast(TN(t.n, '{n} carte ajoutée à ta collection', '{n} cartes ajoutées à ta collection'), { label: T('Annuler'), fn: () => {
    if (OPN.cur) return;
    COLL.map = before; collChanged(); OPN.hist = opnHist().filter(x => x !== rec); opnHistSave(); OPN.cur = c; opnSave(); opnRefresh();
  } });
}

/* ── Mes ouvertures (historique, sur cet appareil) ─────────────────────────────────────────────────────────────────────────── */
/** Ouvertures terminées, la plus récente d'abord : { id, name, at, end, paid (centimes | null), st, n, v (valeur à la fin, centimes), rows: [[nom, ligne, exemplaires, prix]] }. */
function opnHist() {
  if (!OPN.hist) {
    try { const a = JSON.parse(localStorage.getItem(OPN_HIST_KEY) || '[]'); OPN.hist = Array.isArray(a) ? a.filter(x => x && typeof x.id === 'string' && Array.isArray(x.rows)) : []; }
    catch (e) { OPN.hist = []; }
  }
  return OPN.hist;
}
/** Enregistre l'historique ; stockage plein : les plus anciennes sont oubliées jusqu'à ce qu'il tienne. */
function opnHistSave() {
  let h = opnHist().slice(0, OPN_HIST_MAX);
  for (;;) {
    try { if (h.length) localStorage.setItem(OPN_HIST_KEY, JSON.stringify(h)); else localStorage.removeItem(OPN_HIST_KEY); OPN.hist = h; return true; }
    catch (e) { if (h.length <= 1) { OPN.hist = h; return false; } h = h.slice(0, -1); }
  }
}
const opnRecRows = rec => rec.rows.map(([n, g, q, eu], i) => ({ id: 'h' + i, k: ownKey(n), n: String(n), g: String(g || ''), q: Number(q) || 1, eu: eu > 0 ? eu : null, im: '' }));
function opnHistSheet() {
  openSheet(T('Mes ouvertures'), T('Gardées sur cet appareil'), api => {
    opnSheetUp(api);
    const paint = () => {
      const list = opnHist();
      api.body.innerHTML = list.length ? `<div class="opn-hl">${list.map(rec => `<button type="button" class="opn-h" data-id="${esc(rec.id)}"><span class="opn-ht"><b>${esc(rec.name)}</b><small>${esc(new Date(rec.at).toLocaleDateString(LOC(), { day: 'numeric', month: 'short', year: 'numeric' }))} · ${TN(rec.n, '{n} carte', '{n} cartes')}</small></span><span class="opn-hv"><b>${rec.v ? esc(fmt(rec.v, mkCur())) : '—'}</b>${typeof opnbHistTag === 'function' ? opnbHistTag(rec) : ''}</span>${OPN_CHEV}</button>`).join('')}</div>`
        : `<p class="hint">${T('Aucune ouverture terminée pour l\'instant.')}</p>`;
    };
    paint();
    api.body.addEventListener('click', e => { const b = e.target.closest('.opn-h'), rec = b && opnHist().find(x => x.id === b.dataset.id); if (rec) { haptic('tap'); opnHistOpen(rec, () => { if (sheets.includes(api)) paint(); }); } });
  });
}
/** Une ouverture de l'historique : totaux, bilan, cartes (prix du moment), export texte (« 3 Sol Ring (CMM) 400 *FR* », réimportable), image à partager, suppression. */
function opnHistOpen(rec, after) {
  const rows = opnRecRows(rec), text = () => collToText(mergeColl({}, rows.map(r => ({ k: r.k, n: r.n, q: r.q, l: r.g })), 'add'));
  openSheet(rec.name, opnWhen(rec.at) + (rec.st ? ' · ' + T('Mode streamer') : ''), api => {
    opnSheetUp(api);
    api.body.innerHTML = `${opnTilesHtml({ n: rec.n, v: rec.v })}${typeof opnbHistHtml === 'function' ? opnbHistHtml(rec) : ''}
      <h3 class="cs-h">${T('Cartes de la session')}</h3><div class="coll-list opn-list">${rows.map(r => opnRowHtml(r, 'fix')).join('')}</div>
      <button class="link-btn opn-quit" type="button" data-opn="del">${T('Supprimer cette ouverture')}</button>`;
    const img = typeof simgShare === 'function' && typeof opnbShare === 'function' && rows.length;      // image à partager (simg.js + bilan, s'ils sont là), aux prix du moment
    api.setFoot(`<button class="btn ghost" type="button" data-opn="copy"><svg class="i" aria-hidden="true"><use href="#i-copy"/></svg>${T('Copier')}</button><button class="btn${img ? ' ghost' : ''}" type="button" data-opn="file"><svg class="i" aria-hidden="true"><use href="#i-upload"/></svg>${T('Exporter')}</button>${img ? `<button class="btn" type="button" data-opn="img"><svg class="i" aria-hidden="true"><use href="#i-share"/></svg>${T('Image')}</button>` : ''}`);
    api.wrap.addEventListener('click', e => {
      const b = e.target.closest('[data-opn]'); if (!b) return;
      const a = b.dataset.opn; haptic('tap');
      if (a === 'copy') copyText(text());
      else if (a === 'img') opnbShare({ name: rec.name, at: rec.at, paid: rec.paid }, rows);
      else if (a === 'file') opnDownload(text() + '\n', 'ouverture-' + new Date(rec.at).toISOString().slice(0, 10) + '.txt');
      else if (a === 'del') {
        const was = opnHist(); OPN.hist = was.filter(x => x !== rec); opnHistSave(); api.close(); if (after) after();
        toast(T('Ouverture supprimée'), { label: T('Annuler'), fn: () => { OPN.hist = was; opnHistSave(); if (after) after(); } });
      }
    });
  });
}
function opnDownload(body, name) {
  try {
    const url = URL.createObjectURL(new Blob([body], { type: 'text/plain;charset=utf-8' })), a = document.createElement('a');
    a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 4000);
    toast(T('Liste exportée'));
  } catch (e) { toast(T('Export impossible sur ce navigateur')); }
}

/* ── « Ma collection » pendant la session (crochets de collection.js) ──────────────────────────────────────────────────────── */
/** En-tête : note « Session en cours » (cartes ajoutées à la fin) ; mode streamer : titre et carte de valeur de la session seule. true : l'en-tête habituel n'est pas peint. */
function opnCollHead(el) {
  if (!el) return false;
  const c = OPN.cur, body = $('.coll-body', el); let note = $('.opn-cnote', el);
  if (!c || COLL.mode !== 'coll') { if (note) note.remove(); }
  else {
    if (!note && body) { note = document.createElement('button'); note.type = 'button'; note.className = 'opn-cnote'; note.dataset.opn = 'sheet'; const v = $('.coll-val', body); if (v) v.after(note); else body.prepend(note); }
    const t = opnTotals(c.rows);
    if (note) note.innerHTML = `${opnIc(c)}<span>${esc(c.st ? T('Mode streamer : seule la session « {name} » s\'affiche', { name: c.name }) : TN(t.n, 'Session en cours : {n} carte, ajoutée à la fin', 'Session en cours : {n} cartes, ajoutées à la fin'))}</span>${OPN_CHEV}`;
  }
  if (!streamOn()) return false;
  const t = opnTotals(c.rows), sp = $('.dv-title span', el);
  if (sp) sp.textContent = COLL.mode === 'coll' ? T('Session « {name} »', { name: c.name }) : '';
  const box = $('.coll-val', el);
  if (box) { box.hidden = false; box.innerHTML = `<button type="button" class="cv" data-act="valtab" aria-label="${esc(T('Valeur de la session : {v} · voir les stats', { v: hmEur(t.v) }))}"><span class="cv-t"><b>${esc(hmEur(t.v))}</b><span>${TN(t.u, '{n} carte', '{n} cartes')} · ${TN(t.n, '{n} exemplaire', '{n} exemplaires')}</span></span></button>`; }
  return true;
}
/** Corps de l'écran en mode streamer : la session (Cartes, Stats), l'échange masqué. false : rien à faire (pas de mode streamer, ou Decks › À monter). */
function opnCollBody(el, host) {
  if (!streamOn() || COLL.mode === 'decks' || !host) return false;
  opnMeta();      // prix et images des cartes pas encore lues (rechargement hors ligne…)
  const px = $('.coll-px', el), fw = $('.coll-fwrap', el), ct = $('.coll-controls', el);
  if (px) px.hidden = true; if (fw) fw.hidden = true; if (ct) ct.hidden = COLL.mode !== 'coll';      // ni prix réels, ni recherche, ni filtres : la session seule
  const rows = OPN.cur.rows.slice().sort((a, b) => ((opnEu(b) || 0) * b.q - (opnEu(a) || 0) * a.q) || b.t - a.t);      // les plus chères d'abord
  host.innerHTML = COLL.mode === 'trade' ? `<div class="dv-empty opn-hide">${OPN_EYE}<b>${T('Échange masqué')}</b><p>${T('Mode streamer : ta liste d\'échange, ton lien et ton QR code reviennent à la fin de la session.')}</p><button class="btn ghost" type="button" data-opn="sheet">${T('Session en cours')}</button></div>`
    : COLL.tab === 'stats' ? opnStatsHtml(rows)
    : rows.length ? `<div class="coll-list opn-list opn-main">${rows.map(r => opnRowHtml(r, 'dec')).join('')}</div>`
    : `<div class="dv-empty coll-empty opn-main"><b>${T('Aucune carte pour l\'instant')}</b><p>${T('Les cartes scannées pendant la session apparaissent ici.')}</p><button class="btn" type="button" data-opn="scan"><svg class="i" aria-hidden="true"><use href="#i-camera"/></svg>${T('Scanner')}</button></div>`;
  return true;
}
/** Stats de la session : comme celles de la collection (collStats), sans historique ni prix réels. */
function opnStatsHtml(rows) {
  const by = new Map();
  for (const r of rows) { const x = by.get(r.k) || { k: r.k, n: r.n, dn: opnName(r), q: 0, v: 0, pq: 0, im: opnImg(r) }; x.q += r.q; const u = opnEu(r); if (u > 0) { x.v += u * r.q; x.pq += r.q; } by.set(r.k, x); }
  const items = [...by.values()].map(x => { const m = COLL.meta[x.k] || {}; return { ...m, k: x.k, n: x.n, dn: x.dn, q: x.q, im: x.im, eu: x.pq ? Math.round(x.v / x.pq) : undefined }; });
  if (!items.length) return `<div class="dv-empty coll-empty opn-main"><b>${T('Pas encore de stats')}</b><p>${T('Les cartes scannées pendant la session apparaissent ici.')}</p></div>`;
  const st = collStats(items, 'cm');
  const colorRows = [['W', T('Blanc')], ['U', T('Bleu')], ['B', T('Noir')], ['R', T('Rouge')], ['G', T('Vert')]].map(([c, n]) => [`<i class="mc mc-${c.toLowerCase()}">${c}</i>${n}`, st.colors[c], 'k-' + c.toLowerCase()])
    .concat([['<i class="mc mc-m">M</i>' + T('Multicolore'), st.colors.M, 'k-m'], ['<i class="mc mc-n">C</i>' + T('Incolore'), st.colors.C, 'k-n']]);
  const top = st.top.slice(0, 10).map(i => `<div class="crow ro"><span class="thumb" style="--h:${hash32(i.k) % 360}">${esc((i.dn.trim()[0] || '?').toUpperCase())}${i.im ? `<img alt="" loading="lazy" decoding="async" src="${esc(i.im)}">` : ''}</span><span class="row-main"><span class="row-name">${esc(i.dn)}</span><span class="row-meta">${i.q > 1 ? `<span class="tag accent">× ${nf0(i.q)}</span>` : ''}</span></span><span class="row-price"><b>${esc(fmt(i.lot, mkCur()))}</b>${i.q > 1 ? `<small>${esc(fmt(i.up, mkCur()))} × ${nf0(i.q)}</small>` : ''}</span></div>`).join('');
  return `<div class="opn-main"><div class="cs-tiles opn-st3"><div><b>${nf0(st.unique)}</b><span>${TN(st.unique, 'carte différente', 'cartes différentes')}</span></div><div><b>${nf0(st.copies)}</b><span>${TN(st.copies, 'exemplaire', 'exemplaires')}</span></div><div><b>${st.valued ? esc(fmt(st.value, mkCur())) : '—'}</b><span>${T('valeur · tendance Cardmarket')}</span></div></div>
    ${st.unknown ? `<p class="hint">${T('Stats sur {a} cartes lues ; {b} sans infos pour l\'instant.', { a: nf0(st.known), b: nf0(st.unknown) })}</p>` : ''}
    <h3 class="cs-h">${T('Courbe de mana')} <small>${T('{n} sorts', { n: nf0(st.spells) })}</small></h3>${curveBars(st.curve, false)}
    <h3 class="cs-h">${T('Couleurs')} <small>${T('sorts')}</small></h3>${barsHtml(colorRows)}
    <h3 class="cs-h">${T('Familles')} <small>${T('exemplaires')}</small></h3>${barsHtml(TYPE_ORDER.map(t => [esc(T(t)), st.types[t], 'k-t']))}
    ${top ? `<h3 class="cs-h">${T('Les plus chères')}</h3><div class="cs-top">${top}</div>` : ''}</div>`;
}
/** Clics de l'écran de la collection sur la session (crochet de collection.js) : true si traité (la collection n'y touche pas). */
function opnCollClick(e) {
  if (!OPN.cur) return false;
  const b = e.target.closest('[data-opn]');
  if (!b) return !!e.target.closest('.opn-main');      // liste de la session : aucun geste de la collection (quantités, langue, aperçu) ne s'y applique
  const a = b.dataset.opn; haptic('tap');
  if (a === 'sheet') opnSheet();
  else if (a === 'scan') openScan();
  else if (a === 'dec') { const row = b.closest('[data-id]'); if (row) opnDec(row.dataset.id); }
  return true;
}
/** Récap du scan (« Ajouter ») pendant une session : où vont les cartes. */
function opnRcNote() { return OPN.cur ? `<p class="hint opn-rc">${opnIc(OPN.cur)}<span>${esc(T('Session « {name} » : ces cartes vont dans la session, et rejoignent ta collection quand tu la termines.', { name: OPN.cur.name }))}</span></p>` : ''; }

// Aide (help.js) : une question de plus, juste après celle du scan d'un paquet ; retirée avec ce fichier.
if (typeof HELP_QA !== 'undefined') {
  const i = HELP_QA.findIndex(q => q[0] === 'Comment scanner tout un paquet ?');
  HELP_QA.splice(i < 0 ? HELP_QA.length : i + 1, 0, ['Ouvrir des boosters (ou streamer une ouverture) ?', 'Scan › Réglages (en haut) › <b>Session d\'ouverture</b> : donne-lui un nom et, si tu veux, le prix payé. Les cartes scannées vont dans un lot à part ; <b>Terminer</b> montre le bilan (valeur, gain ou perte, meilleures cartes), puis les ajoute à ta collection. Les sessions restent dans « Mes ouvertures ». Option <b>Mode streamer</b> : pendant la session, collection, valeur, e-mail, lien d\'échange, pub et notifications sont cachés ; seules les cartes ouvertes s\'affichent.']);
}
