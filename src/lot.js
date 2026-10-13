/* ── lot.js : « Ajouter des cartes », une par une, façon ManaBox ──────────────────────────────────────────────────
   Recherche par nom (anglais ou imprimé) → la carte en grand avec son édition (symbole, extension, numéro, prix Cardmarket de l'édition), quantité, langue → « Ajouter ».
   Extension « collante » : la dernière choisie à la main est proposée d'office aux cartes suivantes qui existent dans cette extension (sinon : édition non précisée) ;
   toujours modifiable, carte par carte. La langue choisie reste aussi d'une carte à l'autre.
   Le lot : les cartes ajoutées depuis « Nouveau lot » (gardé sur cet appareil), avec leur édition, langue, quantité et prix ; chacune se modifie ou se retire
   (la collection suit). « Nouveau lot » vide la liste, les cartes restent dans la collection.
   Scanner : le scan s'ouvre au-dessus ; ses cartes rejoignent le lot (langue lue, extension collante si la carte y existe). */
const LOT_KEY = 'deckdeal:lot:v1', LOT_MAX = 400;
const LOT = { el: null, list: [], set: '', lang: '', cur: null, edit: '', cat: null, seq: 0 };
/** cur : { k, n, p (nom imprimé tapé), l (langue choisie, '' : celle de la carte), q, e (édition 'cmm|400', '' : non précisée), pick (impression choisie), prints (null : lecture en cours), err } */

function lotRead() {
  try {
    const o = JSON.parse(localStorage.getItem(LOT_KEY) || 'null');
    if (o && typeof o === 'object') {
      LOT.list = Array.isArray(o.list) ? o.list.filter(x => x && typeof x.k === 'string' && typeof x.n === 'string' && x.q > 0).slice(0, LOT_MAX) : [];
      LOT.set = /^[a-z0-9]{2,6}$/.test(o.set || '') ? o.set : ''; LOT.lang = typeof o.lang === 'string' && (o.lang === '' || CARD_LANG_LIST.includes(o.lang)) ? o.lang : '';
    }
  } catch (e) { /* illisible : lot vide */ }
}
function lotSave() { try { localStorage.setItem(LOT_KEY, JSON.stringify({ list: LOT.list.slice(0, LOT_MAX), set: LOT.set, lang: LOT.lang })); } catch (e) { /* stockage plein : le lot reste pour cette session */ } }

/** Langue Scryfall des impressions à proposer pour une langue de carte ('' : celle de la carte dans la collection, sinon anglais). */
const lotLangOf = c => c.l || collMainLang(collLines(COLL.map[c.k])) || '';
/** Impression d'une extension pour une carte (extension collante) : celle de la langue de la carte et sans particularité (pas showcase…), au plus petit numéro. */
function lotInSet(prints, set, l) {
  const sl = SCRY_LANG[l] || 'en', c = (prints || []).filter(p => p.set === set).sort((a, b) => String(a.num).localeCompare(String(b.num), 'en', { numeric: true }));
  return c.find(p => p.l === sl && !p.fx.length) || c.find(p => p.l === sl) || c.find(p => !p.fx.length) || c[0] || null;
}
/** Prix d'un exemplaire (centimes) : l'édition choisie, sinon le prix de référence de la carte ; null sans prix. */
const lotEu = c => { if (c.pick) return c.pick.eu > 0 ? c.pick.eu : c.pick.ef > 0 ? c.pick.ef : null; const m = COLL.meta[c.k]; return m && m.eu > 0 ? m.eu : null; };
/** Grande image de la carte : l'édition choisie, sinon la dernière impression dans sa langue, sinon l'image anglaise de Scryfall. */
function lotImg(c) {
  if (c.pick) return c.pick.urls[0] || c.pick.th;
  const sl = SCRY_LANG[lotLangOf(c)] || 'en', p = (c.prints || []).find(x => x.l === sl) || (c.prints || [])[0];
  if (p) return p.urls[0] || p.th;
  // impressions pas encore lues : l'image déjà connue (ligne du lot, édition, collection), en version moyenne du même serveur d'images ; l'API Scryfall en dernier recours (limitée, peut attendre)
  const known = c.im || collLineImage(c.k, lotLine(c), (COLL.meta[c.k] || DM[c.k] || {}).im).src;
  return known ? known.replace('/small/', '/normal/') : 'https://api.scryfall.com/cards/named?exact=' + encodeURIComponent(c.n) + '&format=image&version=normal';
}
/** Infos Scryfall des cartes qui viennent d'arriver dans le lot (image, prix…) : tout de suite, devant les lectures de fond. */
async function lotMeta(keys) {
  const need = [...new Set(keys)].filter(k => COLL.map[k] && !COLL.meta[k]); if (!need.length) return;
  try {
    const got = await scryCollection(need.map(k => COLL.map[k].n), undefined, null, true);
    for (const k of need) { const g = got.get(k); if (g) COLL.meta[k] = g; else if (!(k in COLL.meta)) COLL.meta[k] = null; }
    collMetaSave(); lotPaintList(); lotPaintCard(); collPaintSoon();
  } catch (e) { collEnrich(); }      // pause Scryfall : la lecture habituelle s'en chargera
}

/** Choisit une carte (suggestion touchée, ligne du lot à modifier) : impressions dans sa langue lues, puis extension collante appliquée si la carte y existe. */
async function lotPick(n, p, o = {}) {
  const k = ownKey(n); if (!k) return;
  const c = LOT.cur = { k, n, p: p || '', l: o.l !== undefined ? o.l : LOT.lang || (p && FRX.l !== 'en' ? FRX.l : ''), q: o.q || 1, e: o.e || '', im: o.im || '', pick: null, prints: null, err: '', id: ++LOT.seq };
  lotPaintCard(); frLoad();
  await lotPrints(c, !o.e);
  if (o.e && LOT.cur === c && c.prints) { const x = c.prints.find(y => edKey(y.set, y.num) === o.e); if (x) { c.pick = x; lotPaintCard(); } }
}
/** Lit les impressions de la carte dans sa langue (Scryfall, gardées 2 jours) ; sticky : applique l'extension collante. */
async function lotPrints(c, sticky) {
  c.prints = null; c.err = ''; lotPaintCard();
  let list = [];
  try { list = await scryArtPrints(c.n, lotLangOf(c) || 'en'); }
  catch (e) { if (LOT.cur !== c) return; c.err = scryLeft() > 0 ? T('Scryfall demande une pause, réessaie dans une minute.') : T('Éditions indisponibles pour l\'instant (hors ligne ?)'); }
  if (LOT.cur !== c) return;
  c.prints = list;
  if (c.e) c.pick = list.find(x => edKey(x.set, x.num) === c.e) || c.pick;      // langue changée : même édition, image dans la nouvelle langue si elle existe
  else if (sticky && LOT.set) { const x = lotInSet(list, LOT.set, lotLangOf(c)); if (x) { c.pick = x; c.e = edKey(x.set, x.num); c.auto = true; } }
  setIcLoad(() => { if (LOT.el) lotPaintCard(); });
  lotPaintCard();
}
/** Panneau de la carte choisie. */
function lotPaintCard() {
  const el = LOT.el && $('.lot-card', LOT.el); if (!el) return;
  const c = LOT.cur; el.hidden = !c; if (!c) return;
  const dn = c.p || frName(c.k, lotLangOf(c)) || c.n, eu = lotEu(c), set = c.pick ? c.pick.set : '', sn = c.pick ? c.pick.sn || setName(set) : '';
  const edBtn = c.pick ? `${setIcHtml(set)}<span><b>${esc(sn || set.toUpperCase())}</b><small>${esc(set.toUpperCase())} · #${esc(c.pick.num)}${c.pick.fx.length ? ' · ' + esc(c.pick.fx.join(', ')) : ''}</small></span>`
    : `<span><b>${c.prints ? (c.prints.length ? T('Choisir l\'édition') : T('Aucune édition trouvée')) : c.err ? T('Éditions indisponibles') : T('Éditions…')}</b><small>${T('Édition non précisée')}</small></span>`;
  const own = collQty(c.k), edit = LOT.edit && LOT.list.find(x => x.id === LOT.edit);
  el.innerHTML = `<div class="lot-art"><button type="button" class="lot-img" data-act="zoom" aria-label="${T('Voir {name} en grand', { name: esc(dn) })}"><img alt="" decoding="async" src="${esc(lotImg(c))}"></button>
      ${eu != null ? `<span class="lot-px">${set ? setIcHtml(set) : ''}<b>${esc(fmt(eu, 'EUR'))}</b></span>` : ''}</div>
    <div class="lot-f">
      <div class="lot-name"><b>${esc(dn)}</b>${dn !== c.n ? `<small>${esc(c.n)}</small>` : ''}${own ? `<em>${T('{n} dans ta collection', { n: nf0(own) })}</em>` : ''}</div>
      <button type="button" class="lot-ed${c.pick ? ' on' : ''}${c.auto ? ' auto' : ''}" data-act="ed"${c.prints && !c.prints.length ? ' disabled' : ''} aria-haspopup="dialog">${edBtn}<i aria-hidden="true">▾</i></button>
      ${c.err ? `<p class="hint lot-err">${esc(c.err)} <button class="link-btn" type="button" data-act="retry">${T('Réessayer')}</button></p>` : ''}
      <div class="lot-row"><span>${T('Quantité')}</span><span class="qstep"><button type="button" data-act="qm" aria-label="${T('Un de moins')}"${c.q <= 1 ? ' disabled' : ''}>−</button><b>${c.q}</b><button type="button" data-act="qp" aria-label="${T('Un de plus')}">+</button></span></div>
      <label class="lot-row lang"><span>${T('Langue')}</span><span class="sel"><select class="lot-lang" aria-label="${T('Langue des exemplaires ajoutés')}"><option value="">${T('Celle de la carte')}</option>${CARD_LANG_LIST.map(x => { const t = T(LANGS[x]); return `<option value="${x}"${x === c.l ? ' selected' : ''}>${esc(t[0].toUpperCase() + t.slice(1))}</option>`; }).join('')}</select></span></label>
      <div class="lot-go"><button class="btn" type="button" id="lotAdd" data-act="add">${edit ? T('Enregistrer') : '+ ' + T('Ajouter')}</button>${edit ? `<button class="btn ghost" type="button" data-act="cancel">${T('Annuler')}</button>` : ''}</div>
    </div>`;
}
/** Choix de l'édition : toutes les impressions de la carte (dans sa langue, puis celles qui n'existent qu'en anglais), symbole, extension, numéro, prix ; « Sans édition ». */
function lotEdSheet() {
  const c = LOT.cur; if (!c || !c.prints || !c.prints.length) return;
  openSheet(T('Édition de {name}', { name: c.p || c.n }), T('L\'extension choisie sera proposée pour les cartes suivantes'), api => {
    api.wrap.classList.add('lot-eds-sheet');
    const paint = () => {
      api.body.innerHTML = `<div class="lot-eds">${c.prints.map((p, i) => { const px = p.eu > 0 ? fmt(p.eu, 'EUR') : p.ef > 0 ? fmt(p.ef, 'EUR') + ' ✦' : '', on = c.pick === p || (c.e && edKey(p.set, p.num) === c.e);
        return `<button type="button" class="lot-ev" data-i="${i}" aria-pressed="${!!on}" aria-label="${esc(p.sn)} ${esc(String(p.set).toUpperCase())} ${esc(p.num)}${px ? ', ' + esc(px) : ''}"><img alt="" loading="lazy" decoding="async" src="${esc(p.th)}"><span>${setIcHtml(p.set)}${esc(String(p.set).toUpperCase())} ${esc(p.num)}</span><em>${esc(p.sn)}</em>${px ? `<b>${esc(px)}</b>` : ''}${p.fx.length || p.y ? `<small>${esc([p.y, ...p.fx].filter(Boolean).join(' · '))}</small>` : ''}</button>`; }).join('')}
        <button type="button" class="lot-ev none" data-i="-1" aria-pressed="${!c.pick}"><i>${T('Sans édition')}</i></button></div>`;
      const on = $('.lot-ev[aria-pressed="true"]', api.body); if (on && on.scrollIntoView) on.scrollIntoView({ block: 'nearest' });
    };
    paint(); setIcLoad(() => { if (sheets.includes(api)) paint(); });
    api.body.addEventListener('click', e => {
      const b = e.target.closest('.lot-ev'); if (!b) return;
      const i = Number(b.dataset.i), p = i >= 0 ? c.prints[i] : null; haptic('tap');
      c.pick = p; c.e = p ? edKey(p.set, p.num) : ''; c.auto = false;
      if (p) LOT.set = p.set;      // choisie à la main : l'extension devient collante pour les cartes suivantes
      lotSave(); api.close(); lotPaintCard(); lotPaintHead();
    });
  });
}
/** Ligne (clé langue|édition) où vont les exemplaires de la carte choisie. */
const lotLine = c => lineKey(lotLangOf(c), c.e);
/** « Ajouter » (ou « Enregistrer » une ligne du lot modifiée) : la collection, puis le lot. */
function lotAdd() {
  const c = LOT.cur; if (!c) return;
  const g = lotLine(c), l = lineLang(g), was = LOT.edit && LOT.list.find(x => x.id === LOT.edit);
  if (!was && typeof opnTake === 'function' && opnTake([{ k: c.k, n: c.n, q: c.q, l: g, p: c.e ? c.pick : null, eu: lotEu(c), im: c.pick ? c.pick.th : '' }])) {      // session d'ouverture (opening.js) : dans la session, ni la collection ni ce lot
    haptic('ok'); lotSay(opnSay(c.p || frName(c.k, l) || c.n), true); lotPaintCard();
    const inp = $('#caName', LOT.el); if (inp) inp.select(); return;
  }
  if (c.e && c.pick) edRemember(c.k, l, c.e, edInfoOf(c.pick, l));
  if (was) collBump(was.k, was.n, -was.q, { lang: was.g, paint: false });
  collBump(c.k, c.n, c.q, { lang: g }); lotMeta([c.k]); haptic('ok');
  const x = { id: was ? was.id : 'l' + Date.now().toString(36) + (++LOT.seq), k: c.k, n: c.n, p: c.p, g, q: c.q, t: was ? was.t : Date.now(), im: c.pick ? c.pick.th : '', eu: lotEu(c) };
  if (was) LOT.list = LOT.list.map(y => (y.id === was.id ? x : y)); else LOT.list.unshift(x);
  LOT.edit = ''; lotSave();
  lotSay(T('{name} · {q} dans ta collection', { name: c.p || frName(c.k, l) || c.n, q: collQty(c.k) }), true);
  if (was) { LOT.cur = null; lotPaintCard(); } else lotPaintCard();
  lotPaintList(); lotPaintHead();
  const inp = $('#caName', LOT.el); if (inp && !was) { inp.select(); }
}
/** Retire une ligne du lot (et ses exemplaires de la collection) ; annulable. */
function lotDrop(id) {
  const x = LOT.list.find(y => y.id === id); if (!x) return;
  const date = (COLL.map[x.k] || {}).d;
  collBump(x.k, x.n, -x.q, { lang: x.g }); LOT.list = LOT.list.filter(y => y.id !== id); if (LOT.edit === id) { LOT.edit = ''; LOT.cur = null; lotPaintCard(); }
  lotSave(); lotPaintList(); lotPaintHead(); haptic('tap');
  toast(T('{name} retirée de la collection', { name: x.p || x.n }), { label: T('Annuler'), fn: () => { collBump(x.k, x.n, x.q, { lang: x.g, date }); LOT.list.unshift(x); LOT.list.sort((a, b) => b.t - a.t); lotSave(); lotPaintList(); lotPaintHead(); } });
}
const lotSay = (t, ok) => { const s = LOT.el && $('#caStatus', LOT.el); if (!s) return; s.hidden = !t; if (t) { $('span:last-child', s).textContent = t; s.dataset.ok = ok ? '1' : '0'; } };
/** Total du lot : exemplaires et valeur (prix de l'édition, sinon de la carte). */
function lotTotals() { let n = 0, v = 0; for (const x of LOT.list) { n += x.q; const u = collLineEu(x.k, x.g) ?? x.eu; if (u > 0) v += u * x.q; } return { n, v }; }
function lotPaintHead() {
  const el = LOT.el; if (!el) return;
  const t = lotTotals();
  $('.dv-title span', el).textContent = LOT.list.length ? TN(t.n, '{n} carte dans ce lot', '{n} cartes dans ce lot') + (t.v ? ' · ' + fmt(t.v, 'EUR') : '') : nmT('Tape son nom en anglais ou en français', 'Tape son nom en anglais ou en {lang}', 'Tape son nom en anglais');
  const sticky = $('.lot-sticky', el);
  sticky.hidden = !LOT.set; if (LOT.set) sticky.innerHTML = `<span class="ls-l">${T('Extension proposée')}</span><span class="ls-v">${setIcHtml(LOT.set)}<b>${esc(setName(LOT.set) || LOT.set.toUpperCase())}</b></span><button type="button" class="link-btn" data-act="unstick" aria-label="${T('Ne plus proposer cette extension')}">${T('Retirer')}</button>`;
}
function lotRowHtml(x) {
  const e = lineEd(x.g), l = lineLang(x.g), set = edSet(e), sn = e ? setName(set) || (COLL.ed[e] || {}).sn || '' : '', u = collLineEu(x.k, x.g) ?? x.eu, img = x.im || collLineImage(x.k, x.g, (COLL.meta[x.k] || {}).im).src, nm = x.p || frName(x.k, l) || x.n;
  const when = new Date(x.t).toLocaleString(LOC(), { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  return `<div class="crow lot-it${u > 0 ? ' has-px' : ''}" data-id="${esc(x.id)}" data-k="${esc(x.k)}" data-ln="${esc(l)}"${x.g !== l ? ` data-g="${esc(x.g)}"` : ''}><span class="thumb" style="--h:${hash32(x.k) % 360}">${esc((nm.trim()[0] || '?').toUpperCase())}${img ? `<img alt="" loading="lazy" decoding="async" src="${esc(img)}">` : ''}</span>
    <span class="row-main"><span class="row-top"><span class="row-name">${esc(nm)}</span>${l ? `<span class="lchip ro">${flag(l)}</span>` : ''}</span>
      <span class="row-meta">${e ? `<span class="tag ed">${setIcHtml(set)}${esc(sn ? sn + ' #' + edNum(e) : edLabel(e))}</span>` : `<span class="tag">${T('Édition non précisée')}</span>`}${x.q > 1 ? `<span class="tag accent">× ${nf0(x.q)}</span>` : ''}<span class="tag lot-when">${esc(when)}</span></span></span>
    ${u > 0 ? `<span class="row-px"><span class="px cm"><b>${esc(fmt(u * x.q, 'EUR'))}</b></span></span>` : ''}
    <span class="lot-acts"><button type="button" class="icon-btn" data-act="edit" aria-label="${T('Modifier {name}', { name: esc(nm) })}"><svg class="i"><use href="#i-edit"/></svg></button><button type="button" class="icon-btn" data-act="drop" aria-label="${T('Retirer {name}', { name: esc(nm) })}"><svg class="i"><use href="#i-trash"/></svg></button></span></div>`;
}
function lotPaintList() {
  const el = LOT.el; if (!el) return;
  const box = $('.lot-list', el), h = $('.lot-lh', el);
  h.hidden = !LOT.list.length;
  box.innerHTML = LOT.list.length ? LOT.list.map(lotRowHtml).join('') : `<p class="hint lot-empty">${T('Les cartes ajoutées apparaissent ici, avec leur édition et leur prix. Tu peux aussi les scanner.')}</p>`;
}
/** Suggestions sous le champ de recherche (mêmes que « Ajouter une carte »). */
function lotSuggest() {
  const el = LOT.el; if (!el) return;
  const inp = $('#caName', el), list = $('#caList', el), q = inp.value.trim(), c = LOT.cur;
  if (!LOT.cat || (document.activeElement !== inp && !q) || (c && q === (c.p || c.n))) { list.innerHTML = ''; return; }      // nom de la carte choisie (après « Ajouter ») : pas de suggestions par-dessus
  const sug = collSuggestX(LOT.cat, q, 12, () => { if (LOT.el === el) lotSuggest(); });      // autres langues arrivées : la liste se repeint
  list.innerHTML = sug.map(x => { const have = collQty(ownKey(x.n)); return `<button type="button" class="ca-opt" role="option" data-n="${esc(x.n)}"${x.p ? ` data-p="${esc(x.p)}"` : ''}${x.l ? ` data-l="${esc(x.l)}"` : ''}><span>${sugHtml(x.n, q, x.p || '', x.l)}</span><i>${have ? `× ${have}` : '+'}</i></button>`; }).join('')
    || (q.length >= 2 && NMX.p ? '<p class="hint">' + T('Recherche dans les autres langues…') + '</p>' : q.length >= 2 ? '<p class="hint">' + (FRX.ix || !namesLang() ? T('Aucune carte de ce nom. Vérifie l\'orthographe.') : nmT('Aucune carte de ce nom. Vérifie l\'orthographe (les noms français arrivent dès que leur liste est chargée).', 'Aucune carte de ce nom. Vérifie l\'orthographe (les noms en {lang} arrivent dès que leur liste est chargée).')) + '</p>' : '');
}
/** Cartes du scan (« Ajouter » du récapitulatif, scan ouvert depuis le lot ; scan mobile) : chacune rejoint la collection et le lot.
 *  it.e (édition décidée au scan, scaned.js ; '' : sans) : telle quelle, impression it.p si connue (sinon relue pour son image et son prix) ;
 *  sans it.e (téléphone d'avant les éditions au scan) : l'extension collante du lot si la carte y existe. */
async function lotFromScan(items) {
  const set = LOT.set, out = [];
  for (const it of items) {
    const c = { k: it.k, n: it.n, p: '', l: it.l || '', q: it.q, e: '', pick: null, prints: [] };
    if (typeof it.e === 'string') {
      c.e = it.e; c.pick = it.e ? it.p || null : null;
      if (c.e && !c.pick) { try { c.prints = await scryArtPrints(c.n, lotLangOf(c) || 'en'); c.pick = c.prints.find(x => edKey(x.set, x.num) === c.e) || null; } catch (e) { /* hors ligne : l'édition reste, ses infos viendront */ } }
    } else if (set) { try { c.prints = await scryArtPrints(c.n, lotLangOf(c) || 'en'); const x = lotInSet(c.prints, set, lotLangOf(c)); if (x) { c.pick = x; c.e = edKey(x.set, x.num); } } catch (e) { /* hors ligne : sans édition */ } }
    const g = lotLine(c), l = lineLang(g);
    if (c.pick) edRemember(c.k, l, c.e, edInfoOf(c.pick, l));
    collBump(c.k, c.n, c.q, { lang: g, paint: false });
    out.push({ id: 'l' + Date.now().toString(36) + (++LOT.seq), k: c.k, n: c.n, p: '', g, q: c.q, t: Date.now(), im: c.pick ? c.pick.th : '', eu: lotEu(c) });
  }
  for (const x of out) {      // la même carte, même ligne, que la dernière du lot (« + » au scan, scan mobile) : un seul exemplaire de plus sur cette ligne
    const top = LOT.list[0];
    if (top && top.k === x.k && top.g === x.g) { top.q = Math.min(999, top.q + x.q); top.t = x.t; if (x.im) top.im = x.im; } else LOT.list.unshift(x);
  }
  LOT.list = LOT.list.slice(0, LOT_MAX); lotSave(); lotMeta(out.map(x => x.k)); collPaintSoon();
  lotPaintList(); lotPaintHead();
  return out.length;
}

function closeLot() { if (LOT.el) LOT.el.__close(); }
/** Ouvre « Ajouter des cartes ». */
function openLot() {
  closeLot(); lotRead(); frLoad();
  LOT.cur = null; LOT.edit = '';
  const wrap = document.createElement('div'); wrap.className = 'dv lot'; wrap.setAttribute('role', 'dialog'); wrap.setAttribute('aria-modal', 'true'); wrap.setAttribute('aria-label', T('Ajouter des cartes'));
  wrap.innerHTML = `<header class="dv-head"><button class="icon-btn dv-back" type="button" data-act="close" aria-label="${T('Fermer')}"><svg class="i"><use href="#i-back"/></svg></button>
      <div class="dv-title"><b>${T('Ajouter des cartes')}</b><span></span></div>
      <button class="icon-btn" type="button" data-act="scan" aria-label="${T('Scanner des cartes')}"><svg class="i"><use href="#i-camera"/></svg></button></header>
    <div class="dv-scroll"><div class="dv-body lot-body">
      <div class="lot-search field-in"><label class="label" for="caName">${T('Nom de la carte')}</label><input type="text" id="caName" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="${esc(nmExample())}" enterkeyhint="search"></div>
      <div class="ca-list" id="caList" role="listbox" aria-label="${T('Suggestions')}"></div>
      <div class="status" id="caStatus" data-ok="0" hidden><span class="dot"></span><span></span></div>
      <div class="mob-pc" hidden></div>
      <div class="lot-sticky" hidden></div>
      <section class="lot-card" hidden aria-live="polite"></section>
      <div class="lot-lh" hidden><h3 class="cs-h">${T('Ce lot')}</h3><button class="link-btn" type="button" data-act="new">${T('Nouveau lot')}</button></div>
      <div class="lot-list"></div>
    </div></div>`;
  LOT.el = wrap; const prevFocus = document.activeElement;
  const onKey = e => { if (e.key === 'Escape' && !imgView && !sheets.length && !SC.el) { e.stopPropagation(); wrap.__close(); } };
  wrap.__close = () => {
    if (LOT.el !== wrap) return; LOT.el = null; LOT.cur = null; document.removeEventListener('keydown', onKey, true); FRN.on.delete(onFr); if (MOB.pc) mobStop();      // le scan mobile s'arrête avec la page
    wrap.classList.remove('on'); setTimeout(() => wrap.remove(), reduceMotion() ? 0 : 240); releaseApp();
    try { if (prevFocus && prevFocus.focus && prevFocus.isConnected) prevFocus.focus({ preventScroll: true }); } catch (e) { /* ignore */ }
  };
  document.addEventListener('keydown', onKey, true);
  wrap.addEventListener('load', e => { if (e.target.tagName === 'IMG') e.target.classList.add('ok'); }, true);
  const inp = $('#caName', wrap), list = $('#caList', wrap);
  inp.addEventListener('input', lotSuggest);
  inp.addEventListener('focus', lotSuggest);
  inp.addEventListener('keydown', e => { if (e.key === 'Enter') { const b = $('.ca-opt', list); if (b) { e.preventDefault(); b.click(); } } });
  const onFr = () => { if (LOT.el === wrap) { lotSuggest(); lotPaintHead(); } };      // index des noms imprimés arrivé pendant la saisie
  FRN.on.add(onFr);
  list.addEventListener('click', e => {
    const b = e.target.closest('.ca-opt'); if (!b) return;
    haptic('tap'); LOT.edit = ''; list.innerHTML = ''; inp.value = b.dataset.p || b.dataset.n; inp.blur(); lotSay('');
    lotPick(b.dataset.n, b.dataset.p || '', b.dataset.l && !LOT.lang ? { l: b.dataset.l } : {});      // nom italien (allemand…) choisi : carte dans cette langue, sauf langue choisie
  });
  wrap.addEventListener('change', e => {
    const s = e.target.closest('.lot-lang'); if (!s || !LOT.cur) return;
    const c = LOT.cur; c.l = s.value; LOT.lang = s.value; lotSave(); s.blur(); lotPrints(c, !c.e);      // langue : retenue pour les cartes suivantes ; impressions relues dans cette langue
  });
  wrap.addEventListener('click', e => {
    const b = e.target.closest('button[data-act]'); if (!b) { const th = e.target.closest('.lot-it .thumb'); if (th) lotZoom(th.closest('.lot-it')); return; }
    const act = b.dataset.act, c = LOT.cur;
    if (act === 'close') wrap.__close();
    else if (act === 'scan') { haptic('tap'); openScan({ lot: true }); }
    else if (act === 'ed') lotEdSheet();
    else if (act === 'retry' && c) lotPrints(c, !c.e);
    else if (act === 'qm' && c && c.q > 1) { c.q--; haptic('tap'); lotPaintCard(); }
    else if (act === 'qp' && c && c.q < 99) { c.q++; haptic('tap'); lotPaintCard(); }
    else if (act === 'add') lotAdd();
    else if (act === 'cancel') { LOT.edit = ''; LOT.cur = null; lotPaintCard(); }
    else if (act === 'zoom' && c) openCardViewer([{ key: c.k, name: c.p || c.n, ln: c.n, small: c.pick ? c.pick.th : lotImg(c), big: lotImg(c), lang: c.pick ? ({ ja: 'jp', zhs: 'zh-CN' }[c.pick.l] || c.pick.l) : 'en', plain: true, extra: '' }], 0);
    else if (act === 'mobgo') mobStart();
    else if (act === 'mobstop') { haptic('tap'); mobStop(); }
    else if (act === 'unstick') { LOT.set = ''; lotSave(); haptic('tap'); lotPaintHead(); }
    else if (act === 'new') {
      const before = LOT.list; if (!before.length) return;
      LOT.list = []; LOT.edit = ''; lotSave(); lotPaintList(); lotPaintHead(); haptic('tap');
      toast(T('Nouveau lot : les cartes restent dans ta collection'), { label: T('Annuler'), fn: () => { LOT.list = before; lotSave(); lotPaintList(); lotPaintHead(); } });
    } else if (act === 'edit' || act === 'drop') {
      const row = b.closest('.lot-it'), x = row && LOT.list.find(y => y.id === row.dataset.id); if (!x) return;
      if (act === 'drop') return lotDrop(x.id);
      haptic('tap'); LOT.edit = x.id; inp.value = x.p || x.n;
      lotPick(x.n, x.p, { l: lineLang(x.g), q: x.q, e: lineEd(x.g), im: x.im });
      $('.lot-card', wrap).scrollIntoView({ block: 'nearest', behavior: reduceMotion() ? 'auto' : 'smooth' });
    }
  });
  document.body.appendChild(wrap); holdApp(); lotPaintHead(); lotPaintList(); lotPaintCard();
  { const mb = $('.mob-pc', wrap); mb.hidden = !mobPcLike() && !MOB.pc; mobPaint(); }      // scan mobile : sur un ordinateur
  setIcLoad(() => { if (LOT.el === wrap) { lotPaintHead(); lotPaintList(); } });
  collCatalog().then(cat => { LOT.cat = cat; if (LOT.el === wrap) lotSuggest(); }).catch(e => { if (LOT.el === wrap) lotSay(e && e.code === 'rate' ? T('Scryfall demande une pause, réessaie dans une minute.') : T('Catalogue Scryfall injoignable : réessaie plus tard.'), false); });
  if (!COLL.names) lotSay(T('Chargement du catalogue (une seule fois)…'), false);
  requestAnimationFrame(() => requestAnimationFrame(() => { wrap.classList.add('on'); }));
  setTimeout(() => { if (LOT.el === wrap) inp.focus(); }, 380);
  haptic('tap');
}
/** Une ligne du lot en grand : la ligne de la collection (édition, langue) si elle existe encore. */
function lotZoom(row) {
  const rows = $$('.lot-it', LOT.el), list = [], at = { i: 0 };
  for (const r of rows) { const it = collViewItem(r.dataset.k, rowG(r)); if (!it) continue; if (r === row) at.i = list.length; list.push(it); }
  if (list.length) openCardViewer(list, at.i);
}
