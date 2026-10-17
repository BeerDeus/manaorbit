/* ── masterset.js : mode « Masterset » de la collection (onglet Cartes, interrupteur à côté de « Trier ») ──────────────────────────────
   Une extension à la fois : toutes ses cartes dans l'ordre des numéros (les cartes de la page d'une extension, setview.js › setvLoad : Scryfall « e:<code> »,
   gardées sur l'appareil 3 jours), en couleur celles de la collection, en noir et blanc les autres ; sous chaque carte son numéro (« 17/277 ») et son prix Cardmarket.
   · Possédée = l'impression exacte : une ligne de la collection avec cette extension et ce numéro (« 2 Sol Ring (CMM) 400 *FR* »), toutes langues confondues.
     Un exemplaire foil compte comme un autre (pas de foil à part pour l'instant).
   · La base d'abord (numéros jusqu'au total imprimé, Scryfall /sets › printed_size : sets.js › setPrinted), puis les variantes (vitrine, sans bordure,
     illustration étendue… : numéros au-delà), repliées, chacune avec sa progression. Sans total imprimé connu : les versions spéciales sont les variantes.
   · Sélecteur d'édition (feuille) : les extensions de la collection, de la plus fournie à la moins fournie, barre de progression, recherche ;
     la recherche trouve aussi les autres extensions (commencer un masterset de zéro).
   · Exemplaires sans édition : panneau ⚠ sur la vignette d'une carte manquante quand la collection a cette carte sans édition ; la carte en grand propose
     « C'est celle-ci » (l'édition est posée sur un exemplaire). Carte manquante sans exemplaire : « Ajouter à ma collection ».
   · « Chercher les N cartes manquantes sur CardTrader » (sans CardTrader : leur prix Cardmarket) : la liste « 1 Sol Ring (AAA) 7 » dans Prix d'une liste,
     recherche aux éditions exactes (app.js › S.opts.exactEd : seulement cette impression, possédée seulement dans cette édition).
   · « Souhaiter les manquantes » : les cartes manquantes affichées entrent dans la liste de souhaits avec l'illustration de cette édition.
   · Recherche et filtres de la collection (nom, couleur, famille, coût) s'appliquent à la grille ; Commander et Extension n'y ont pas de sens.
   Réglages gardés sur l'appareil (deckdeal:ms:v1 : actif, extension, cartes par ligne, affichage). Retirer la fonction : ôter 'masterset.js' de build.mjs. */
const MS_KEY = 'deckdeal:ms:v1', MS_COLS = [3, 4, 5, 6, 8], MS_SHOWS = [['all', 'Toutes'], ['own', 'Possédées'], ['miss', 'Manquantes']], MS_KEEP = 6;
const MS = { on: false, set: '', cols: 4, show: 'all', rar: new Set(), varOpen: false, data: {}, err: {}, load: '', ctrl: null, idx: null, view: null };
try {
  const o = typeof localStorage !== 'undefined' ? JSON.parse(localStorage.getItem(MS_KEY) || 'null') : null;
  if (o && typeof o === 'object') {
    MS.on = o.on === true; MS.set = /^[a-z0-9]{2,6}$/.test(o.set || '') ? o.set : '';
    MS.cols = MS_COLS.includes(o.cols) ? o.cols : 4; MS.show = MS_SHOWS.some(s => s[0] === o.show) ? o.show : 'all';
  }
} catch (e) { /* stockage illisible ou indisponible : réglages par défaut */ }
function msSave() { try { localStorage.setItem(MS_KEY, JSON.stringify({ on: MS.on, set: MS.set, cols: MS.cols, show: MS.show })); } catch (e) { /* stockage plein ou bloqué : gardé pour cette session */ } }
/** Le masterset remplace la liste : onglet Cartes de « Ma collection », interrupteur allumé. */
const msActive = () => MS.on && !!COLL.el && COLL.mode === 'coll' && COLL.tab === 'list';
/** Numéro de collection comparable (« 0017 » et « 17 » : la même carte). */
const msNum = n => String(n || '').trim().toLowerCase().replace(/^0+(?=\d)/, '');
const msEd = (code, num) => code + '|' + msNum(num);
const MS_WARN = '<svg viewBox="0 0 24 22" aria-hidden="true"><path d="M12 1.5 23 20.5H1z" fill="#f2b441" stroke="#2a1c00" stroke-width="1.6" stroke-linejoin="round"/><path d="M12 8v6.2M12 16.8v.4" stroke="#2a1c00" stroke-width="2.4" stroke-linecap="round"/></svg>';
const MS_ICON = '<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="7.5" height="7.5" rx="1.6"/><rect x="13.5" y="3" width="7.5" height="7.5" rx="1.6"/><rect x="3" y="13.5" width="7.5" height="7.5" rx="1.6"/><rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.6" opacity=".45"/></svg>';

/** Exemplaires de la collection par impression : 'cmm|400' → { q, k, g (ligne la plus fournie) } ; refait quand la collection change (COLL.seq). */
function msOwned() {
  if (MS.idx && MS.idx.seq === COLL.seq && MS.idx.map === COLL.map) return MS.idx.m;
  const m = new Map();
  for (const k in COLL.map) {
    for (const [g, q] of collLines(COLL.map[k])) {
      const e = lineEd(g); if (!e) continue;
      const key = msEd(edSet(e), edNum(e)), o = m.get(key);
      if (!o) m.set(key, { q, k, g, gq: q }); else { o.q += q; if (q > o.gq) { o.g = g; o.gq = q; } }
    }
  }
  MS.idx = { seq: COLL.seq, map: COLL.map, m };
  return m;
}
const msOwnOf = (code, x) => msOwned().get(msEd(code, x.num)) || null;
/** Exemplaires de la carte k sans édition (ils pourraient être cette impression). */
const msLoose = k => collLines(COLL.map[k]).reduce((a, [g, q]) => a + (lineEd(g) ? 0 : q), 0);

/** Base et variantes d'une extension, dans l'ordre des numéros ; tot : total imprimé (« /277 »), sinon le nombre de cartes de la base. */
function msSplit(code, cards) {
  const ps = setPrinted(code), base = [], vars = [], num = x => parseInt(x.num, 10) || 0;
  for (const x of cards) { const n = /^\d+$/.test(x.num) ? Number(x.num) : NaN; if (ps ? n <= ps : !x.sp) base.push(x); else vars.push(x); }
  const by = (a, b) => num(a) - num(b) || a.num.localeCompare(b.num, 'en', { numeric: true });
  base.sort(by); vars.sort(by);
  return { base, vars, tot: ps || base.length };
}
/** Progression d'une liste de cartes : possédées, total, prix de celles qui manquent et de toute la liste (centimes, prix connus seulement). */
function msProg(code, list) {
  let own = 0, miss = 0, all = 0;
  for (const x of list) { const u = msEu(x); all += u; if (msOwnOf(code, x)) own++; else miss += u; }
  return { own, n: list.length, miss, all };
}
const msEu = x => (x.eu > 0 ? x.eu : x.ef > 0 ? x.ef : 0);
const msPct = (a, b) => (b ? Math.floor((100 * a) / b) : 0);      // arrondi par défaut : 100 % seulement quand tout y est

/** Extensions de la collection pour le sélecteur : [{ code, own, tot }], de la plus fournie à la moins fournie (puis la plus récente).
 *  Extension déjà lue : ses vrais chiffres (base) ; sinon d'après le total imprimé de /sets (numéros de la base possédés / total). */
function msSets() {
  const by = new Map();
  for (const key of msOwned().keys()) { const i = key.indexOf('|'), c = key.slice(0, i); if (!by.has(c)) by.set(c, new Set()); by.get(c).add(key.slice(i + 1)); }
  const out = [];
  for (const [code, nums] of by) {
    const cards = MS.data[code];
    if (cards && cards.length) { const s = msSplit(code, cards), p = msProg(code, s.base); out.push({ code, own: p.own, tot: p.n }); continue; }
    const ps = setPrinted(code), own = ps ? [...nums].filter(n => /^\d+$/.test(n) && Number(n) <= ps).length : nums.size;
    out.push({ code, own, tot: ps || setCount(code) });
  }
  return out.sort((a, b) => b.own - a.own || setDate(b.code).localeCompare(setDate(a.code)) || a.code.localeCompare(b.code));
}
/** Extension affichée : celle choisie, sinon la plus fournie de la collection ('' : aucune carte avec édition). */
function msCur(sets) { if (MS.set) return MS.set; const l = sets || msSets(); return l.length ? l[0].code : ''; }
const msSetName = code => setName(code) || code.toUpperCase();

/** Cartes de l'extension (setvLoad : copie de l'appareil, sinon Scryfall) ; repeint à l'arrivée. */
function msEnsure(code) {
  if (!code || MS.data[code] || MS.load === code || MS.err[code]) return;
  if (MS.ctrl) MS.ctrl.abort();
  const ctrl = MS.ctrl = new AbortController(), day = setsDay(setDate(code));
  MS.load = code;
  setvLoad({ code, d: day && day > Date.now() ? 1 : -1 }, ctrl.signal).then(cards => {
    MS.data[code] = cards;
    const ks = Object.keys(MS.data); for (const k of ks.slice(0, Math.max(0, ks.length - MS_KEEP))) if (k !== code) delete MS.data[k];      // quelques extensions en mémoire, pas toutes
  }, e => {
    if (e.name === 'AbortError') return;
    MS.err[code] = e && e.code === 'rate' ? T('Scryfall demande une pause, réessaie dans une minute.') : T('Scryfall injoignable : vérifie ta connexion, puis réessaie.');
  }).finally(() => {
    if (MS.ctrl !== ctrl) return;
    MS.ctrl = null; MS.load = '';
    if (msActive()) collPaintBody(true);
  });
}

/* ── Barre de la collection : interrupteur et sélecteur d'édition ───────────────────────────────────── */
const msBarHtml = () => `<button type="button" class="fopt coll-ms" data-act="ms" aria-pressed="false" hidden>${MS_ICON}<span>${T('Masterset')}</span></button>
  <button type="button" class="sortsel ms-pick" data-act="mspick" hidden><span class="ms-pick-ic"></span><b></b></button>`;
/** Interrupteur (onglet Cartes seulement), sélecteur d'édition à la place de « Trier » quand le masterset est affiché. */
function msBarPaint(el, none) {
  const b = $('.coll-ms', el), p = $('.ms-pick', el); if (!b || !p) return;
  const show = COLL.mode === 'coll' && COLL.tab === 'list' && !none, on = show && MS.on;
  b.hidden = !show; b.setAttribute('aria-pressed', String(on)); p.hidden = !on;
  const srt = $('#collSort', el); if (srt && on) srt.closest('.coll-sort').hidden = true;
  if (!on) return;
  const code = msCur(), name = code ? msSetName(code) : T('Choisir une édition');
  $('.ms-pick-ic', p).innerHTML = code ? setIcHtml(code) : ''; $('b', p).textContent = name;
  p.setAttribute('aria-label', code ? T('Édition du masterset : {name}', { name }) : name);
}

/* ── Grille ───────────────────────────────────────────────────────────────────────────── */
/** Cartes affichées d'une liste : recherche et filtres de la collection, rareté, possédées ou manquantes. */
function msFilter(code, list) {
  let l = filterItems(list, { ...COLL.f, cmdr: '', set: '' });
  if (MS.rar.size) l = l.filter(x => MS.rar.has(x.r === 'special' || x.r === 'bonus' ? 'mythic' : x.r));
  if (MS.show !== 'all') l = l.filter(x => !msOwnOf(code, x) === (MS.show === 'miss'));
  return l;
}
function msTile(code, x, i, sec, tot) {
  const o = msOwnOf(code, x), name = x.dn || x.n, img = setvImg(x), num = sec === 'b' && tot ? x.num + '/' + tot : '#' + x.num, u = msEu(x);
  const warn = !o && !BASIC_NAMES.has(x.k) && msLoose(x.k) > 0, px = u ? fmt(u, 'EUR') + (x.eu > 0 ? '' : ' ✦') : '';
  const lab = [name, num, o ? TN(o.q, '{n} exemplaire dans ta collection', '{n} exemplaires dans ta collection') : T('manquante'), warn ? T('peut-être une de tes cartes sans édition') : ''].filter(Boolean).join(' · ');
  return `<div class="ms-c ${o ? 'own' : 'miss'}" data-i="${i}" data-s="${sec}">
    <button class="ms-open" type="button" aria-label="${esc(lab)}"><span class="dvc-art" style="--h:${hash32(x.k) % 360}"><b>${esc((name.trim()[0] || '?').toUpperCase())}</b>${img ? `<img alt="" loading="lazy" decoding="async" src="${esc(scrySmall(img))}">` : ''}</span></button>
    ${o && o.q > 1 ? `<span class="ms-q">×${o.q}</span>` : ''}${warn ? `<span class="ms-warn" title="${esc(T('Tu as cette carte sans édition : est-ce celle-ci ?'))}">${MS_WARN}</span>` : ''}
    <span class="ms-cap"><span class="ms-num">${esc(num)}</span>${px ? `<span class="ms-px">${esc(px)}</span>` : ''}</span></div>`;
}
const msGrid = (code, list, sec, tot) => `<div class="ms-grid c${MS.cols}" style="--cols:${MS.cols}">${list.map((x, i) => msTile(code, x, i, sec, tot)).join('')}</div>`;
function msProgHtml(p, big) {
  const pc = msPct(p.own, p.n);
  return `<span class="ms-prog${big ? ' big' : ''}"><span class="track" role="progressbar" aria-valuemin="0" aria-valuemax="${p.n}" aria-valuenow="${p.own}" aria-label="${esc(T('Progression'))}"><span class="fill${p.own && p.own === p.n ? ' full' : ''}" style="width:${p.n ? (100 * p.own) / p.n : 0}%"></span></span>
    <span class="ms-pn"><b>${nf0(p.own)}</b> / ${nf0(p.n)} · ${pc} %</span></span>`;      // span : aussi dans le bouton des variantes
}
/** Contenu de l'onglet Cartes en masterset (collPaintBody). */
function msHtml() {
  const sets = msSets(), code = msCur(sets);
  MS.view = null;
  if (!code) {
    return `<div class="dv-empty ms-empty"><b>${T('Aucune édition dans ta collection')}</b><p>${T('Le masterset range tes cartes par édition : choisis l\'édition de tes cartes (rond à gauche de la quantité), ou cherche une extension pour commencer.')}</p>
      <button class="btn ghost" type="button" data-act="mspick">${T('Chercher une extension')}</button></div>`;
  }
  const y = setDate(code).slice(0, 4), cards = MS.data[code];
  const cols = cards && cards.length ? `<label class="sortsel ms-colsel"><span>${T('Par ligne')}</span><select class="ms-cols" aria-label="${esc(T('Cartes par ligne'))}">${MS_COLS.map(n => `<option value="${n}"${n === MS.cols ? ' selected' : ''}>${n}</option>`).join('')}</select></label>` : '';      // toujours en vue (pas au bout de la rangée qui défile)
  const head = `<div class="ms-head"><span class="ms-ic" aria-hidden="true">${setIcHtml(code)}</span><div class="ms-ht"><b>${esc(msSetName(code))}</b><small>${esc(code.toUpperCase())}${y ? ' · ' + y : ''}${cards && cards.length ? ' · ' + TN(msSplit(code, cards).base.length, '{n} carte', '{n} cartes') : ''}</small></div>${cols}</div>`;
  if (!cards) {
    const err = MS.err[code];
    return head + (err ? `<div class="dv-empty"><b>${T('Cartes indisponibles')}</b><p>${esc(err)}</p><button class="btn ghost" type="button" data-act="msretry">${T('Réessayer')}</button></div>`
      : `<p class="hint listempty">${T('Chargement des cartes de l\'extension…')}</p>`);
  }
  if (!cards.length) return head + `<div class="dv-empty"><b>${T('Aucune carte sur Scryfall pour cette extension')}</b><p>${T('Choisis une autre édition.')}</p></div>`;
  const s = msSplit(code, cards), pb = msProg(code, s.base), pv = msProg(code, s.vars);
  const base = msFilter(code, s.base), vars = msFilter(code, s.vars), act = filterActive(COLL.f) || MS.rar.size || MS.show !== 'all';
  MS.view = { code, base, vars };
  const val = pb.miss ? T('Il te manque ≈ {a} · l\'édition complète ≈ {b}', { a: fmt(pb.miss, 'EUR'), b: fmt(pb.all, 'EUR') }) : pb.own === pb.n ? T('Base complète !') : '';
  const ign = COLL.f.cmdr || COLL.f.set ? `<p class="hint">${T('Les filtres Commander et Extension ne s\'appliquent pas au masterset.')}</p>` : '';
  const ctl = `<div class="setv-chips ms-ctl" role="group" aria-label="${esc(T('Affichage du masterset'))}">
      ${MS_SHOWS.map(([v, l]) => `<button type="button" class="fopt" data-act="msshow" data-v="${v}" aria-pressed="${MS.show === v}">${T(l)}</button>`).join('')}
      ${SETV_RAR.map(([r, l]) => `<button type="button" class="fopt" data-act="msrar" data-r="${r}" aria-pressed="${MS.rar.has(r)}"><i class="setv-r ${r}" aria-hidden="true"></i>${T(l)}</button>`).join('')}</div>`;
  const wish = new Set([...base, ...(MS.varOpen ? vars : [])].filter(x => msWishable(code, x)).map(x => x.k)).size;      // une illustration par carte (comme msWishSheet)
  const buy = msBuyList(code, base, vars).length, ct = typeof priceSrc === 'function' && priceSrc() === 'ct';
  const warnN = [...base, ...(MS.varOpen ? vars : [])].filter(x => !msOwnOf(code, x) && !BASIC_NAMES.has(x.k) && msLoose(x.k) > 0).length;
  return head + msProgHtml(pb, true) + (val ? `<p class="ms-val">${esc(val)}</p>` : '') + ctl + ign
    + (warnN ? `<p class="hint ms-legend"><span class="ms-lw">${MS_WARN}</span>${TN(warnN, '{n} carte que tu as peut-être sans édition : touche-la pour poser son édition.', '{n} cartes que tu as peut-être sans édition : touche-les pour poser leur édition.')}</p>` : '')
    + (act ? `<p class="hint coll-count">${TN(base.length, '{n} carte sur {total}', '{n} cartes sur {total}', { total: nf0(s.base.length) })}</p>` : '')
    + (base.length ? msGrid(code, base, 'b', s.tot) : `<p class="hint listempty">${T('Aucune carte ne correspond.')}</p>`)
    + (s.vars.length ? `<section class="ms-var"><button type="button" class="ms-vh" data-act="msvar" aria-expanded="${MS.varOpen}"><span>${T('Variantes')}</span><small>${T('vitrine, sans bordure, illustration étendue…')}</small>${msProgHtml(pv)}</button>
        ${MS.varOpen ? (vars.length ? msGrid(code, vars, 'v', 0) : `<p class="hint listempty">${T('Aucune carte ne correspond.')}</p>`) : ''}</section>` : '')
    + (wish || buy ? `<div class="ms-acts">${buy ? `<button class="btn ms-buy" type="button" data-act="msbuy">${esc(ct ? TN(buy, 'Chercher la carte manquante sur CardTrader', 'Chercher les {n} cartes manquantes sur CardTrader') : TN(buy, 'Prix de la carte manquante', 'Prix des {n} cartes manquantes'))}</button>` : ''}
        ${wish ? `<button class="btn ghost ms-wish" type="button" data-act="mswish">☆ ${TN(wish, 'Souhaiter la carte manquante', 'Souhaiter les {n} cartes manquantes')}</button>` : ''}</div>` : '');
}
/** Après le rendu : cartes et symboles de l'extension demandés s'ils manquent. */
function msAfterPaint() {
  const code = msCur(); if (code) msEnsure(code);
  if (!SETIC.m) setIcLoad(() => { if (msActive()) collPaintBody(true); });
}

/* ── Carte en grand ───────────────────────────────────────────────────────────────────────────── */
/** Carte du masterset pour l'aperçu en grand : la ligne de la collection si elle y est (édition, illustrations, rangement) ; sinon l'impression,
 *  avec « C'est celle-ci » (exemplaire sans édition) ou « Ajouter à ma collection ». */
function msViewItem(code, x) {
  const o = msOwnOf(code, x);
  if (o) { const it = typeof collViewItem === 'function' ? collViewItem(o.k, o.g) : null; if (it) return it; }
  const img = setvImg(x), name = x.dn || x.n, u = msEu(x), ed = code.toUpperCase() + ' ' + x.num;
  const it = { key: x.k, name, ln: x.n, small: scrySmall(img), big: img.replace('/normal/', '/large/'), lang: x.il || 'en', set: code, num: x.num, setName: msSetName(code), plain: !x.df };
  if (o) return it;
  const loose = BASIC_NAMES.has(x.k) ? 0 : msLoose(x.k), px = u ? T('prix Cardmarket {v}', { v: fmt(u, 'EUR') }) : '';
  if (loose) {
    it.extra = [TN(loose, 'Tu as {n} exemplaire de cette carte sans édition : est-ce celui-ci ?', 'Tu as {n} exemplaires de cette carte sans édition : l\'un d\'eux est-il celui-ci ?'), px].filter(Boolean).join(' · ');
    it.act = { label: T('C\'est celle-ci : poser l\'édition {ed}', { ed }), fn: () => msAssign(code, x, it) };
  } else {
    it.extra = [T('Pas dans ta collection'), px].filter(Boolean).join(' · ');
    it.act = { label: T('+ Ajouter à ma collection ({ed})', { ed }), fn: () => msAdd(code, x, it) };
  }
  return it;
}
/** Action faite depuis la carte en grand : bouton grisé avec son résultat. */
function msActDone(it, label, extra) {
  it.act = { label, off: true }; if (extra != null) it.extra = extra;
  const v = $('.imgv'); if (!v || !imgView) return;
  const b = $('.imgv-rep', v); if (b) { b.textContent = label; b.disabled = true; }
  const x = $('.imgv-extra', v); if (x && extra != null) { x.textContent = extra; x.hidden = !extra; }
}
/** Infos de l'impression pour la ligne qui la reçoit (prix, extension, rareté, petites images : anglaise, et dans la langue l si Scryfall l'a). */
const msInfo = (code, x, l) => ({ eu: x.eu ?? null, ef: x.ef ?? null, sn: setName(code) || '', r: x.r || '', im: x.im ? scrySmall(x.im) : '', ...(x.iml && l && l !== 'en' && SCRY_LANG[l] === x.il ? { li: scrySmall(x.iml) } : {}) });
/** Déplace n exemplaires de la carte k de la ligne from à la ligne to ; retourne false si la ligne from n'en a plus. */
function msMove(k, from, to, n = 1) {
  const src = collLines(COLL.map[k]).find(r => r[0] === from); if (!src || src[1] < n) return false;
  COLL.map = linesMove(COLL.map, k, from, n, to); collChanged();
  return true;
}
/** « C'est celle-ci » : un exemplaire sans édition (de la ligne la plus fournie) reçoit cette édition ; « Annuler » le remet sans édition. */
function msAssign(code, x, it) {
  const k = x.k, e = edKey(code, x.num), cur = COLL.map[k]; if (!e || !cur) return;
  const loose = collLines(cur).filter(([g]) => !lineEd(g)); if (!loose.length) return;
  const g = loose.reduce((a, b) => (b[1] > a[1] ? b : a))[0], l = lineLang(g), to = lineKey(l, e, lineFoil(g), lineAw(g));
  edRemember(k, l, e, msInfo(code, x, l));
  if (!msMove(k, g, to)) return;
  haptic('ok');
  const name = x.dn || x.n, ed = code.toUpperCase() + ' ' + x.num;
  toast(T('{name} : édition {ed} posée sur un exemplaire', { name, ed }), { label: T('Annuler'), fn: () => msMove(k, to, g) });
  msActDone(it, T('✓ Édition posée'), T('Dans ta collection · {ed}', { ed }));
}
/** « Ajouter à ma collection » : un exemplaire de cette impression, dans la langue des cartes de l'utilisateur. */
function msAdd(code, x, it) {
  const e = edKey(code, x.num); if (!e) return;
  const l = typeof collImportLang === 'function' ? collImportLang() : 'fr', g = lineKey(l, e);
  edRemember(x.k, l, e, msInfo(code, x, l));
  collBump(x.k, x.n, 1, { lang: g }); if (typeof collEnrich === 'function') collEnrich();      // carte neuve : ses infos (type, coût, image) sont lues
  haptic('ok');
  const name = x.dn || x.n, ed = code.toUpperCase() + ' ' + x.num;
  toast(T('{name} ajoutée à ta collection ({ed})', { name, ed }), { label: T('Annuler'), fn: () => collBump(x.k, x.n, -1, { lang: g }) });
  msActDone(it, T('✓ Ajoutée'), T('Dans ta collection · {ed}', { ed }));
}

/* ── Liste de souhaits ───────────────────────────────────────────────────────────────────────────── */
/** Carte manquante qu'on peut souhaiter : ni terrain de base, ni carte sans image, ni déjà souhaitée avec cette illustration. */
function msWishable(code, x) {
  if (msOwnOf(code, x) || BASIC_NAMES.has(x.k) || !x.k || !setvImg(x) || typeof TR === 'undefined') return false;
  const w = TR.wish[x.k]; return !(w && w.i && setvSame(w.i, setvImg(x)));
}
/** « Souhaiter les manquantes » : les cartes manquantes affichées (filtres compris, variantes si elles sont ouvertes) entrent dans la liste de souhaits
 *  avec l'illustration de cette édition ; une carte déjà souhaitée prend cette illustration (quantité gardée). « Annuler » remet la liste d'avant. */
function msWishSheet() {
  const v = MS.view; if (!v || typeof TR === 'undefined') return;
  const code = v.code, seen = new Set(), list = [];
  for (const x of [...v.base, ...(MS.varOpen ? v.vars : [])]) if (msWishable(code, x) && !seen.has(x.k)) { seen.add(x.k); list.push(x); }      // une illustration par carte : la base d'abord
  if (!list.length) return;
  const eu = list.reduce((a, x) => a + msEu(x), 0), upd = list.filter(x => TR.wish[x.k]).length;
  openSheet(T('Souhaiter les cartes manquantes'), msSetName(code), api => {
    api.body.innerHTML = `<p class="cf-msg">${TN(list.length, '<b>{n}</b> carte manquante entre dans ta liste de souhaits, avec l\'illustration de cette édition.', '<b>{n}</b> cartes manquantes entrent dans ta liste de souhaits, avec l\'illustration de cette édition.')}${eu ? ' ' + esc(T('Prix Cardmarket ≈ {v}', { v: fmt(eu, 'EUR') })) : ''}</p>
      ${upd ? `<p class="hint">${TN(upd, '{n} carte y est déjà avec une autre illustration : elle prend celle-ci.', '{n} cartes y sont déjà avec une autre illustration : elles prennent celle-ci.')}</p>` : ''}
      <p class="hint">${T('Les amis et les visiteurs de ta liste d\'échange les voient dans « Je recherche ».')}</p>`;
    api.setFoot(`<button class="btn ghost" type="button" data-close>${T('Annuler')}</button><button class="btn" type="button" data-ok>${T('Ajouter à ma liste de souhaits')}</button>`);
    api.foot.addEventListener('click', e => {
      if (!e.target.closest('[data-ok]')) return;
      api.close();
      const prev = new Map(list.map(x => [x.k, TR.wish[x.k]])), where = x => [setName(code), code.toUpperCase() + ' ' + x.num].filter(Boolean).join(' · ');
      for (const x of list) { const was = TR.wish[x.k]; TR.wish[x.k] = { n: x.n, q: was ? was.q : 1, i: setvImg(x), w: where(x).slice(0, 90), ...(x.il && x.il !== 'en' ? { l: x.il } : {}) }; }
      trChanged(); haptic('ok'); if (msActive()) collPaintBody(true);
      toast(TN(list.length, '{n} carte ajoutée à ta liste de souhaits', '{n} cartes ajoutées à ta liste de souhaits'), { label: T('Annuler'), fn: () => {
        for (const [k, w] of prev) { if (w) TR.wish[k] = w; else delete TR.wish[k]; }
        trChanged(); if (msActive()) collPaintBody(true);
      } });
    });
  });
}

/* ── Acheter les manquantes ───────────────────────────────────────────────────────────────────────────── */
/** Cartes manquantes à chercher : celles affichées (filtres compris, variantes si elles sont ouvertes), une impression par carte (la base d'abord), sans les terrains de base (jamais chiffrés). */
function msBuyList(code, base, vars) {
  const seen = new Set(), out = [];
  for (const x of [...base, ...(MS.varOpen ? vars : [])]) if (!msOwnOf(code, x) && x.k && !BASIC_NAMES.has(x.k) && !seen.has(x.k) && edKey(code, x.num)) { seen.add(x.k); out.push(x); }
  return out;
}
/** « Chercher les N cartes manquantes sur CardTrader » (Cardmarket sans CardTrader) : la liste « 1 Sol Ring (AAA) 7 » dans Prix d'une liste, aux éditions exactes
 *  (cette impression seulement, déjà possédée seulement si c'est cette édition) ; la recherche se lance depuis la saisie (langue, état, foil au choix). */
function msBuy() {
  const v = MS.view; if (!v || typeof putDeckText !== 'function') return;
  const list = msBuyList(v.code, v.base, v.vars); if (!list.length) return;
  const text = list.map(x => `1 ${x.n} (${v.code.toUpperCase()}) ${x.num}`).join('\n');
  closeCollection();
  putDeckText(text, T('Masterset {name}', { name: msSetName(v.code) }), { exactEd: true });
}

/* ── Sélecteur d'édition ───────────────────────────────────────────────────────────────────────────── */
function msSetRow(r) {
  const pc = msPct(r.own, r.tot), y = setDate(r.code).slice(0, 4);
  return `<button type="button" class="ms-srow" data-set="${esc(r.code)}" aria-pressed="${r.code === msCur()}">${setIcHtml(r.code) || '<i class="set-ic" aria-hidden="true"></i>'}
    <span class="ms-sn"><b>${esc(msSetName(r.code))}</b><small>${esc(r.code.toUpperCase())}${y ? ' · ' + y : ''}</small></span>
    <span class="ms-sp"><span class="track"><span class="fill${r.tot && r.own >= r.tot ? ' full' : ''}" style="width:${r.tot ? Math.min(100, (100 * r.own) / r.tot) : 0}%"></span></span><small>${r.tot ? `${nf0(r.own)}/${nf0(r.tot)} · ${pc} %` : nf0(r.own)}</small></span></button>`;
}
/** Feuille « Choisir une édition » : extensions de la collection (de la plus fournie à la moins fournie), recherche ; les autres extensions apparaissent dans la recherche. */
function msPickSheet() {
  openSheet(T('Choisir une édition'), T('Tes extensions, de la plus fournie à la moins fournie'), api => {
    const t = esc(T('Chercher une extension'));
    api.body.innerHTML = `<label class="fsearch ms-sq"><svg class="i" aria-hidden="true"><use href="#i-search"/></svg><input type="search" inputmode="search" enterkeyhint="search" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="${t}" aria-label="${t}"></label>
      <div class="ms-sets"></div>`;
    const inp = $('input', api.body), box = $('.ms-sets', api.body);
    const paint = () => {
      const q = inp.value, mine = msSets(), has = new Set(mine.map(r => r.code)), hit = r => edHit({ sn: msSetName(r.code), set: r.code, y: setDate(r.code).slice(0, 4), num: '' }, q);
      let html = mine.filter(hit).map(msSetRow).join('');
      if (q.trim().length >= 2 && SETIC.m) {      // autres extensions (papier) : commencer un masterset
        const other = Object.keys(SETIC.m).filter(c => !has.has(c) && !setDigital(c) && hit({ code: c })).sort((a, b) => setDate(b).localeCompare(setDate(a))).slice(0, 30);
        if (other.length) html += `<h3 class="ms-sh">${T('Autres extensions')}</h3>` + other.map(c => msSetRow({ code: c, own: 0, tot: setPrinted(c) || setCount(c) })).join('');
      }
      box.innerHTML = html || `<p class="hint listempty">${mine.length ? T('Aucune extension ne correspond.') : T('Aucune carte avec édition dans ta collection : cherche une extension.')}</p>`;
    };
    box.addEventListener('click', e => { const b = e.target.closest('[data-set]'); if (!b) return; haptic('tap'); api.close(); msSelect(b.dataset.set); });
    inp.addEventListener('input', paint); inp.addEventListener('keydown', e => { if (e.key === 'Enter') inp.blur(); });
    paint(); if (!SETIC.m) setIcLoad(() => { if (sheets.includes(api)) paint(); });
  });
}
function msSelect(code) {
  if (!/^[a-z0-9]{2,6}$/.test(code || '')) return;
  MS.set = code; MS.varOpen = false; delete MS.err[code]; msSave();
  if (COLL.el) { if (COLL.tab !== 'list') { COLL.tab = COLL.ctab = 'list'; const sg = $('#collSeg', COLL.el); if (sg && sg.setValue) sg.setValue('list'); } collPaintBody(false); const sc = $('.dv-scroll', COLL.el); if (sc) sc.scrollTop = 0; }
}

/* ── Événements (écran de la collection) ───────────────────────────────────────────────────────────── */
/** Clic dans l'écran de la collection : true s'il concernait le masterset. */
function msClick(e) {
  const b = e.target.closest('button'); if (!b || !COLL.el || !COLL.el.contains(b)) return false;
  const act = b.dataset.act;
  if (act === 'ms') { MS.on = !MS.on; msSave(); haptic('tap'); COLL.shown = COLL_PAGE; collPaintBody(false); const sc = $('.dv-scroll', COLL.el); if (sc) sc.scrollTop = 0; return true; }
  if (act === 'mspick') { haptic('tap'); msPickSheet(); return true; }
  if (!b.closest('.coll-main') || !msActive()) return false;
  if (act === 'msshow') { MS.show = b.dataset.v; msSave(); haptic('tap'); collPaintBody(true); return true; }
  if (act === 'msrar') { const r = b.dataset.r; if (MS.rar.has(r)) MS.rar.delete(r); else MS.rar.add(r); haptic('tap'); collPaintBody(true); return true; }
  if (act === 'msvar') { MS.varOpen = !MS.varOpen; haptic('tap'); collPaintBody(true); return true; }
  if (act === 'msretry') { delete MS.err[msCur()]; collPaintBody(true); return true; }
  if (act === 'mswish') { haptic('tap'); msWishSheet(); return true; }
  if (act === 'msbuy') { haptic('tap'); msBuy(); return true; }
  if (b.classList.contains('ms-open')) {
    const t = b.closest('.ms-c'), v = MS.view; if (!t || !v) return true;
    const list = t.dataset.s === 'v' ? v.vars : v.base, i = Number(t.dataset.i); if (!list[i]) return true;
    openCardViewer(list.map(x => msViewItem(v.code, x)), i);
    return true;
  }
  return false;
}
/** Choix « Par ligne » : true s'il concernait le masterset. */
function msChange(e) {
  const s = e.target.closest && e.target.closest('select.ms-cols'); if (!s) return false;
  const n = Number(s.value); if (MS_COLS.includes(n)) { MS.cols = n; msSave(); haptic('tap'); }
  s.blur(); collPaintBody(true);
  return true;
}
