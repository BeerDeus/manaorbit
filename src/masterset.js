/* ── masterset.js : mode « Masterset » de la collection (onglet Cartes, interrupteur à côté de « Trier ») ──────────────────────────────
   Une extension à la fois : toutes ses cartes dans l'ordre des numéros (les cartes de la page d'une extension, setview.js › setvLoad : Scryfall « e:<code> »,
   gardées sur l'appareil 3 jours), en couleur celles de la collection, en noir et blanc les autres ; sous chaque carte son numéro (« 17/277 ») et son prix Cardmarket.
   · Possédée = l'impression exacte : une ligne de la collection avec cette extension et ce numéro (« 2 Sol Ring (CMM) 400 *FR* »), toutes langues confondues.
   · Options du masterset (roue crantée au bout de la rangée, feuille « Options du masterset ») : ce que chacun compte dans un masterset, gardées sur l'appareil
     et dans le compte (users/{uid}/meta/masterset : { o, updatedAt } ; le plus récent l'emporte) — version foil aussi (chaque carte en double, normale et foil ✦
     côte à côte, d'après les finitions Scryfall : setview.js › setvFin), terrains de base, variantes, exemplaires par carte (1, ou 4 : playset), langue (seuls
     les exemplaires dans cette langue comptent). Sans la version foil, un exemplaire foil compte comme un autre.
   · La base d'abord (numéros jusqu'au total imprimé, Scryfall /sets › printed_size : sets.js › setPrinted), puis, à la suite et comptées dans la progression,
     les variantes (vitrine, sans bordure, illustration étendue… : numéros au-delà ; « #301 ») si les options les gardent. Sans total imprimé connu : les versions
     spéciales et les promos sont les variantes ; sans elles, une extension faite seulement de variantes (promos…) n'est pas proposée.
   · Sélecteur d'édition (feuille) : les extensions de la collection, de la plus complète à la moins complète (pourcentage), barre de progression, recherche ;
     la recherche trouve aussi les autres extensions (commencer un masterset de zéro).
   · Exemplaires sans édition : panneau ⚠ sur la vignette d'une carte manquante quand la collection a cette carte sans édition ; la carte en grand propose
     « C'est celle-ci » (l'édition est posée sur un exemplaire). Carte manquante sans exemplaire : « Ajouter à ma collection ».
   · « Chercher les N cartes manquantes sur CardTrader » (sans CardTrader : leur prix Cardmarket) : la liste « 1 Sol Ring (AAA) 7 » dans Prix d'une liste,
     recherche aux éditions exactes (app.js › S.opts.exactEd : seulement cette impression, possédée seulement dans cette édition) ; version foil aussi :
     une ligne par case (« *N* » normale, « *F* » foil), langue des options : « *FR* » (la recherche CardTrader suit le foil et la langue de chaque ligne).
   · « Souhaiter les manquantes » : les cartes manquantes affichées entrent dans la liste de souhaits avec l'illustration de cette édition.
   · Recherche et filtres de la collection (nom, couleur, famille, coût) s'appliquent à la grille ; Commander et Extension n'y ont pas de sens.
   Réglages gardés sur l'appareil (deckdeal:ms:v1 : actif, extension, cartes par ligne, affichage, options). Retirer la fonction : ôter 'masterset.js' de build.mjs. */
const MS_KEY = 'deckdeal:ms:v1', MS_COLS = [3, 4, 5, 6, 8], MS_COLS_F = [1, 2, 3, 4], MS_SHOWS = [['all', 'Toutes'], ['own', 'Possédées'], ['miss', 'Manquantes']], MS_KEEP = 6;
/** Options du masterset : foil (version foil aussi), basic (terrains de base), vars (variantes), need (exemplaires par carte : 1 ou 4), lang ('' : toutes les langues). */
const MS_DEF = { foil: false, basic: true, vars: true, need: 1, lang: '' }, MS_NEEDS = [1, 4];
const MS = { on: false, set: '', cols: 4, colsF: 2, show: 'all', rar: new Set(), data: {}, err: {}, load: '', ctrl: null, idx: null, view: null,
  o: { ...MS_DEF }, u: 0, who: '', doc: { uid: '', unsub: null, pushT: 0 } };      // colsF : paires par ligne (version foil aussi) ; u : date des options (la plus récente l'emporte)
/** Options lues (appareil, compte) → valeurs sûres ; le reste prend la valeur par défaut. */
function msClean(o) {
  const x = o && typeof o === 'object' ? o : {};
  return { foil: x.foil === true, basic: x.basic !== false, vars: x.vars !== false, need: MS_NEEDS.includes(x.need) ? x.need : 1, lang: typeof x.lang === 'string' && Object.prototype.hasOwnProperty.call(LANGS, x.lang) ? x.lang : '' };
}
const msOptDiff = () => Object.keys(MS_DEF).some(k => MS.o[k] !== MS_DEF[k]);
try {
  const o = typeof localStorage !== 'undefined' ? JSON.parse(localStorage.getItem(MS_KEY) || 'null') : null;
  if (o && typeof o === 'object') {
    MS.on = o.on === true; MS.set = /^[a-z0-9]{2,6}$/.test(o.set || '') ? o.set : '';
    MS.cols = MS_COLS.includes(o.cols) ? o.cols : 4; MS.colsF = MS_COLS_F.includes(o.colsF) ? o.colsF : 2; MS.show = MS_SHOWS.some(s => s[0] === o.show) ? o.show : 'all';
    MS.o = msClean(o.o); MS.u = Number(o.u) || 0; MS.who = typeof o.who === 'string' ? o.who : '';
  }
} catch (e) { /* stockage illisible ou indisponible : réglages par défaut */ }
function msSave() { try { localStorage.setItem(MS_KEY, JSON.stringify({ on: MS.on, set: MS.set, cols: MS.cols, colsF: MS.colsF, show: MS.show, o: MS.o, u: MS.u, who: MS.who })); } catch (e) { /* stockage plein ou bloqué : gardé pour cette session */ } }
/** Le masterset remplace la liste : onglet Cartes de « Ma collection », interrupteur allumé. */
const msActive = () => MS.on && !!COLL.el && COLL.mode === 'coll' && COLL.tab === 'list';
/** Numéro de collection comparable (« 0017 » et « 17 » : la même carte). */
const msNum = n => String(n || '').trim().toLowerCase().replace(/^0+(?=\d)/, '');
const msEd = (code, num) => code + '|' + msNum(num);
const MS_WARN = '<svg viewBox="0 0 24 22" aria-hidden="true"><path d="M12 1.5 23 20.5H1z" fill="#f2b441" stroke="#2a1c00" stroke-width="1.6" stroke-linejoin="round"/><path d="M12 8v6.2M12 16.8v.4" stroke="#2a1c00" stroke-width="2.4" stroke-linecap="round"/></svg>';
const MS_ICON = '<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="7.5" height="7.5" rx="1.6"/><rect x="13.5" y="3" width="7.5" height="7.5" rx="1.6"/><rect x="3" y="13.5" width="7.5" height="7.5" rx="1.6"/><rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.6" opacity=".45"/></svg>';
/** Roue crantée des options (sprite i-gear) : 8 dents, anneau gravé (comme un symbole d'extension), moyeu évidé, et au centre l'étincelle à quatre branches du mana incolore. */
const MS_GEAR = '<svg class="i ms-gear" aria-hidden="true"><use href="#i-gear"/></svg>';      // sprite (body.html › i-gear)

/** Exemplaires de la collection par impression (dans la langue des options, si elle est choisie) : 'cmm|400' → { k, q (tous), n (non foil), f (foil),
 *  g, gn, gf (ligne la plus fournie : toutes, non foil, foil) } ; refait quand la collection ou la langue change. */
function msOwned() {
  const lang = MS.o.lang;
  if (MS.idx && MS.idx.seq === COLL.seq && MS.idx.map === COLL.map && MS.idx.lang === lang) return MS.idx.m;
  const m = new Map(), best = (o, w, g, q) => { if (q > (o[w + 'q'] || 0)) { o[w] = g; o[w + 'q'] = q; } };
  for (const k in COLL.map) {
    for (const [g, q] of collLines(COLL.map[k])) {
      const e = lineEd(g); if (!e || (lang && lineLang(g) !== lang)) continue;
      const key = msEd(edSet(e), edNum(e)), fo = !!lineFoil(g); let o = m.get(key);
      if (!o) m.set(key, (o = { k, q: 0, n: 0, f: 0 }));
      o.q += q; o[fo ? 'f' : 'n'] += q; best(o, 'g', g, q); best(o, fo ? 'gf' : 'gn', g, q);
    }
  }
  MS.idx = { seq: COLL.seq, map: COLL.map, lang, m };
  return m;
}
const msOwnOf = (code, x) => msOwned().get(msEd(code, x.num)) || null;
/** Cases d'une carte : [''] (toutes finitions confondues) ; version foil aussi : 'n' (normale) et 'f' (foil), celles que l'impression a. */
function msFins(x) { if (!MS.o.foil) return ['']; const l = [...(x.nf === false ? [] : ['n']), ...(x.fo === false ? [] : ['f'])]; return l.length ? l : ['']; }
/** Exemplaires d'une case ; elle est complète à MS.o.need exemplaires. */
function msQ(code, x, fin) { const o = msOwnOf(code, x); return !o ? 0 : fin === 'f' ? o.f : fin === 'n' ? o.n : o.q; }
const msLine = (o, fin) => (fin === 'f' ? o.gf : fin === 'n' ? o.gn : o.g);
const msDone = (code, x) => msFins(x).every(f => msQ(code, x, f) >= MS.o.need);
const msBasic = x => x.s === 'basic' || BASIC_NAMES.has(x.k);
/** Ligne de la collection sans édition qui pourrait remplir la case fin (dans la langue des options, même finition). */
const msLooseLine = (g, fin) => !lineEd(g) && (!MS.o.lang || lineLang(g) === MS.o.lang) && (fin !== 'f' || !!lineFoil(g)) && (fin !== 'n' || !lineFoil(g));
/** Exemplaires de la carte k sans édition (ils pourraient être cette impression). */
const msLoose = (k, fin = '') => collLines(COLL.map[k]).reduce((a, [g, q]) => a + (msLooseLine(g, fin) ? q : 0), 0);
const msWarnOf = (code, x, fin) => msQ(code, x, fin) < MS.o.need && !msBasic(x) && msLoose(x.k, fin) > 0;

/** Base et variantes d'une extension, dans l'ordre des numéros (sans les terrains de base si les options les retirent) ; tot : total imprimé (« /277 »), sinon le nombre de cartes de la base. */
function msSplit(code, cards) {
  const ps = setPrinted(code), base = [], vars = [], num = x => parseInt(x.num, 10) || 0;
  for (const x of cards) {
    if (!MS.o.basic && msBasic(x)) continue;
    const n = /^\d+$/.test(x.num) ? Number(x.num) : NaN; if (ps ? n <= ps : !x.sp) base.push(x); else vars.push(x);
  }
  const by = (a, b) => num(a) - num(b) || a.num.localeCompare(b.num, 'en', { numeric: true });
  base.sort(by); vars.sort(by);
  return { base, vars, tot: ps || base.length, list: MS.o.vars ? [...base, ...vars] : base };      // list : les cartes du masterset, variantes à la suite si les options les gardent
}
/** Extension faite seulement de variantes (promos…) : base vide une fois lue ; pas encore lue, d'après /sets (pas de total imprimé, type « promo »). */
function msOnlyVars(code) {
  const cards = MS.data[code];
  return cards && cards.length ? !msSplit(code, cards).base.length : !setPrinted(code) && setType(code) === 'promo';
}
/** Extension proposée : sans les variantes, pas celle qui n'en a que. */
const msShows = code => MS.o.vars || !msOnlyVars(code);
/** Total d'une extension pas encore lue : toutes ses cartes (variantes comprises) ou le total imprimé (sans elles) ; × 2 avec la version foil. */
const msTotEst = code => (MS.o.vars ? setCount(code) || setPrinted(code) : setPrinted(code) || setCount(code)) * (MS.o.foil ? 2 : 1);
/** Prix d'une case (centimes) : normale, foil, ou le prix connu de l'impression. */
const msUnit = (x, fin) => (fin === 'f' ? (x.ef > 0 ? x.ef : 0) : fin === 'n' ? (x.eu > 0 ? x.eu : 0) : msEu(x));
/** Progression d'une liste de cartes, case par case (normale et foil avec la version foil) : complètes, total, prix de ce qui manque et de toute la liste
 *  (centimes, prix connus seulement ; playset : × les exemplaires manquants). */
function msProg(code, list) {
  const need = MS.o.need; let own = 0, n = 0, miss = 0, all = 0;
  for (const x of list) for (const f of msFins(x)) { const u = msUnit(x, f), q = msQ(code, x, f); n++; all += u * need; if (q >= need) own++; else miss += u * (need - q); }
  return { own, n, miss, all };
}
const msEu = x => (x.eu > 0 ? x.eu : x.ef > 0 ? x.ef : 0);
const msPct = (a, b) => (b ? Math.floor((100 * a) / b) : 0);      // arrondi par défaut : 100 % seulement quand tout y est

/** Extensions de la collection pour le sélecteur : [{ code, own, tot }], de la plus complète à la moins complète (puis la plus fournie, la plus récente).
 *  Extension déjà lue : ses vrais chiffres (options comprises) ; sinon d'après /sets (numéros possédés / cartes, ou base / total imprimé sans les variantes). */
function msSets() {
  const by = new Map(), m = msOwned(), need = MS.o.need;
  for (const [key, o] of m) { const i = key.indexOf('|'), c = key.slice(0, i); if (!by.has(c)) by.set(c, []); by.get(c).push([key.slice(i + 1), o]); }
  const out = [];
  for (const [code, nums] of by) {
    const cards = MS.data[code];
    if (!msShows(code)) continue;
    if (cards && cards.length) { const p = msProg(code, msSplit(code, cards).list); out.push({ code, own: p.own, tot: p.n }); continue; }
    const ps = MS.o.vars ? 0 : setPrinted(code); let own = 0;      // sans les variantes : les numéros de la base seulement
    for (const [n, o] of nums) if (!ps || (/^\d+$/.test(n) && Number(n) <= ps)) own += MS.o.foil ? (o.n >= need) + (o.f >= need) : o.q >= need ? 1 : 0;
    out.push({ code, own, tot: msTotEst(code) });
  }
  const r = x => (x.tot ? x.own / x.tot : 0);
  return out.sort((a, b) => r(b) - r(a) || b.own - a.own || setDate(b.code).localeCompare(setDate(a.code)) || a.code.localeCompare(b.code));
}
/** Extension affichée : celle choisie, sinon la plus complète de la collection ('' : aucune carte avec édition). */
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

/* ── Barre de la collection : interrupteur, sélecteur d'édition, options ───────────────────────────────────── */
const msBarHtml = () => `<button type="button" class="fopt coll-ms" data-act="ms" aria-pressed="false" hidden>${MS_ICON}<span>${T('Masterset')}</span></button>
  <button type="button" class="sortsel ms-pick" data-act="mspick" hidden><span class="ms-pick-ic"></span><b></b></button>
  <button type="button" class="icon-btn ms-opt" data-act="msopt" aria-label="${esc(T('Options du masterset'))}" title="${esc(T('Options du masterset'))}" hidden>${MS_GEAR}</button>`;
/** Interrupteur (onglet Cartes seulement) ; sélecteur d'édition à la place de « Trier » et roue des options au bout de la rangée quand le masterset est affiché. */
function msBarPaint(el, none) {
  const b = $('.coll-ms', el), p = $('.ms-pick', el), g = $('.ms-opt', el); if (!b || !p) return;
  const show = COLL.mode === 'coll' && COLL.tab === 'list' && !none, on = show && MS.on;
  b.hidden = !show; b.setAttribute('aria-pressed', String(on)); p.hidden = !on; if (g) { g.hidden = !on; g.classList.toggle('on', msOptDiff()); }
  const srt = $('#collSort', el); if (srt && on) srt.closest('.coll-sort').hidden = true;
  if (!on) return;
  const code = msCur(), name = code ? msSetName(code) : T('Choisir une édition');
  $('.ms-pick-ic', p).innerHTML = code ? setIcHtml(code) : ''; $('b', p).textContent = name;
  p.setAttribute('aria-label', code ? T('Édition du masterset : {name}', { name }) : name);
}

/* ── Grille ───────────────────────────────────────────────────────────────────────────── */
/** Cartes affichées d'une liste : recherche et filtres de la collection, rareté, possédées (toutes leurs cases complètes) ou manquantes. */
function msFilter(code, list) {
  let l = filterItems(list, { ...COLL.f, cmdr: '', set: '' });
  if (MS.rar.size) l = l.filter(x => MS.rar.has(x.r === 'special' || x.r === 'bonus' ? 'mythic' : x.r));
  if (MS.show !== 'all') l = l.filter(x => !msDone(code, x) === (MS.show === 'miss'));
  return l;
}
/** État d'une case : 'own' (complète), 'part' (playset entamé), 'miss'. */
const msSt = (q, need) => (q >= need ? 'own' : q ? 'part' : 'miss');
/** Image d'une case (bouton de la carte en grand), sa pastille (« ×2 », ou « 2/4 » pour un playset entamé) et son panneau ⚠. */
function msCell(code, x, f, lab0) {
  const q = msQ(code, x, f), need = MS.o.need, st = msSt(q, need), warn = msWarnOf(code, x, f), name = x.dn || x.n, img = setvImg(x);
  const lab = [lab0, f === 'f' ? T('foil') : f === 'n' ? T('non foil') : '', st === 'own' ? TN(q, '{n} exemplaire dans ta collection', '{n} exemplaires dans ta collection')
    : st === 'part' ? TN(q, '{n} exemplaire sur {need}', '{n} exemplaires sur {need}', { need }) : T('manquante'), warn ? T('peut-être une de tes cartes sans édition') : ''].filter(Boolean).join(' · ');
  const tag = st === 'part' ? `<span class="ms-q part">${q}/${need}</span>` : q > 1 ? `<span class="ms-q">×${q}</span>` : '';
  return { st, html: `<button class="ms-open" type="button" data-f="${f}" aria-label="${esc(lab)}"><span class="dvc-art" style="--h:${hash32(x.k) % 360}"><b>${esc((name.trim()[0] || '?').toUpperCase())}</b>${img ? `<img alt="" loading="lazy" decoding="async" src="${esc(scrySmall(img))}">` : ''}</span>${f === 'f' ? '<span class="ms-fx" aria-hidden="true"></span>' : ''}</button>
    ${tag}${warn ? `<span class="ms-warn" title="${esc(T('Tu as cette carte sans édition : est-ce celle-ci ?'))}">${MS_WARN}</span>` : ''}` };
}
function msTile(code, x, i, inBase, tot) {
  const name = x.dn || x.n, num = inBase && tot ? x.num + '/' + tot : '#' + x.num, lab0 = [name, num].join(' · ');
  if (!MS.o.foil) {
    const c = msCell(code, x, '', lab0), u = msEu(x), px = u ? fmt(u, mkCur()) + (x.eu > 0 ? '' : ' ✦') : '';
    return `<div class="ms-c ${c.st}" data-i="${i}">${c.html}<span class="ms-cap"><span class="ms-num">${esc(num)}</span>${px ? `<span class="ms-px">${esc(px)}</span>` : ''}</span></div>`;
  }
  // version foil aussi : normale et foil côte à côte ; une finition que l'impression n'a pas reste en creux
  const fins = msFins(x), cells = ['n', 'f'].map(f => (fins.includes(f) ? msCell(code, x, f, lab0) : null)), sts = cells.filter(Boolean).map(c => c.st);
  const st = sts.every(v => v === 'own') ? 'own' : sts.every(v => v === 'miss') ? 'miss' : 'part';
  const half = (c, j) => (c ? `<div class="ms-h ${c.st}${j ? ' fo' : ''}">${c.html}</div>` : `<div class="ms-h none${j ? ' fo' : ''}"><span class="ms-no">${esc(j ? T('Pas de foil') : T('Foil seulement'))}</span></div>`);
  const px = (f, v) => (fins.includes(f) && v > 0 ? `<span class="ms-px${f === 'f' ? ' fo' : ''}">${esc((f === 'f' ? '✦ ' : '') + fmt(v, mkCur()))}</span>` : '<span class="ms-px"></span>');
  return `<div class="ms-c ms-pair ${st}" data-i="${i}"><div class="ms-two">${cells.map(half).join('')}</div>
    <span class="ms-cap"><span class="ms-num">${esc(num)}</span><span class="ms-pxs">${px('n', x.eu)}${px('f', x.ef)}</span></span></div>`;
}
/** Grille : base (« 17/277 ») puis variantes (« #301 »). */
function msGrid(code, list, base, tot) {
  const f = MS.o.foil, n = f ? MS.colsF : MS.cols, inb = new Set(base);
  return `<div class="ms-grid c${n}${f ? ' pairs' : ''}" style="--cols:${n}">${list.map((x, i) => msTile(code, x, i, inb.has(x), tot)).join('')}</div>`;
}
function msProgHtml(p, big) {
  const pc = msPct(p.own, p.n);
  return `<span class="ms-prog${big ? ' big' : ''}"><span class="track" role="progressbar" aria-valuemin="0" aria-valuemax="${p.n}" aria-valuenow="${p.own}" aria-label="${esc(T('Progression'))}"><span class="fill${p.own && p.own === p.n ? ' full' : ''}" style="width:${p.n ? (100 * p.own) / p.n : 0}%"></span></span>
    <span class="ms-pn"><b>${nf0(p.own)}</b> / ${nf0(p.n)} · ${pc} %</span></span>`;
}
/** Options qui changent ce qui compte (sous la progression ; touché : la feuille des options). */
function msOptSum() {
  const o = MS.o, l = [];
  if (o.foil) l.push(T('✦ Normale et foil'));
  if (o.need > 1) l.push(T('Playset (4)'));
  if (o.lang) l.push(scsLangName(o.lang));
  if (!o.basic) l.push(T('Sans terrains de base'));
  if (!o.vars) l.push(T('Sans variantes'));
  return l.length ? `<button type="button" class="ms-osum" data-act="msopt" aria-label="${esc(T('Options du masterset : {list}', { list: l.join(', ') }))}">${l.map(t => `<span>${esc(t)}</span>`).join('')}</button>` : '';
}
/** Contenu de l'onglet Cartes en masterset (collPaintBody). */
function msHtml() {
  const sets = msSets(), code = msCur(sets);
  MS.view = null;
  if (!code) {
    return `<div class="dv-empty ms-empty"><b>${T('Aucune édition dans ta collection')}</b><p>${T('Le masterset range tes cartes par édition : choisis l\'édition de tes cartes (rond à gauche de la quantité), ou cherche une extension pour commencer.')}</p>
      <button class="btn ghost" type="button" data-act="mspick">${T('Chercher une extension')}</button></div>`;
  }
  const y = setDate(code).slice(0, 4), cards = MS.data[code], foil = MS.o.foil, cl = foil ? MS_COLS_F : MS_COLS, cn = foil ? MS.colsF : MS.cols;
  const cols = cards && cards.length ? `<label class="sortsel ms-colsel"><span>${T('Par ligne')}</span><select class="ms-cols" aria-label="${esc(foil ? T('Paires de cartes par ligne') : T('Cartes par ligne'))}">${cl.map(n => `<option value="${n}"${n === cn ? ' selected' : ''}>${n}</option>`).join('')}</select></label>` : '';      // toujours en vue (pas au bout de la rangée qui défile)
  const head = `<div class="ms-head"><span class="ms-ic" aria-hidden="true">${setIcHtml(code)}</span><div class="ms-ht"><b>${esc(msSetName(code))}</b><small>${esc(code.toUpperCase())}${y ? ' · ' + y : ''}${cards && cards.length ? ' · ' + TN(msSplit(code, cards).list.length, '{n} carte', '{n} cartes') : ''}</small></div>${cols}</div>`;
  if (!cards) {
    const err = MS.err[code];
    return head + (err ? `<div class="dv-empty"><b>${T('Cartes indisponibles')}</b><p>${esc(err)}</p><button class="btn ghost" type="button" data-act="msretry">${T('Réessayer')}</button></div>`
      : `<p class="hint listempty">${T('Chargement des cartes de l\'extension…')}</p>`);
  }
  if (!cards.length) return head + `<div class="dv-empty"><b>${T('Aucune carte sur Scryfall pour cette extension')}</b><p>${T('Choisis une autre édition.')}</p></div>`;
  const s = msSplit(code, cards);
  if (!s.list.length) {      // sans les variantes : une extension qui n'a que des variantes (promos…), ou que des terrains de base
    return head + `<div class="dv-empty ms-onlyv"><b>${s.vars.length ? T('Cette extension n\'a que des variantes') : T('Aucune carte comptée dans cette extension')}</b><p>${s.vars.length ? T('Promos, versions spéciales… : allume « Variantes » dans les options du masterset pour les voir.') : T('Change les options du masterset, ou choisis une autre édition.')}</p>
      <button class="btn ghost" type="button" data-act="msopt">${T('Options du masterset')}</button></div>`;
  }
  const pb = msProg(code, s.list), shown = msFilter(code, s.list), act = filterActive(COLL.f) || MS.rar.size || MS.show !== 'all';      // shown : cartes en vue (souhaiter, chercher, ⚠)
  MS.view = { code, shown };
  const val = pb.miss ? T('Il te manque ≈ {a} · l\'édition complète ≈ {b}', { a: fmt(pb.miss, mkCur()), b: fmt(pb.all, mkCur()) }) : pb.n && pb.own === pb.n ? (MS.o.vars && s.vars.length ? T('Masterset complet !') : T('Base complète !')) : '';
  const ign = COLL.f.cmdr || COLL.f.set ? `<p class="hint">${T('Les filtres Commander et Extension ne s\'appliquent pas au masterset.')}</p>` : '';
  const ctl = `<div class="setv-chips ms-ctl" role="group" aria-label="${esc(T('Affichage du masterset'))}">
      ${MS_SHOWS.map(([v, l]) => `<button type="button" class="fopt" data-act="msshow" data-v="${v}" aria-pressed="${MS.show === v}">${T(l)}</button>`).join('')}
      ${SETV_RAR.map(([r, l]) => `<button type="button" class="fopt" data-act="msrar" data-r="${r}" aria-pressed="${MS.rar.has(r)}"><i class="setv-r ${r}" aria-hidden="true"></i>${T(l)}</button>`).join('')}</div>`;
  const wish = new Set(shown.filter(x => msWishable(code, x)).map(x => x.k)).size;      // une illustration par carte (comme msWishSheet)
  const buy = msBuyList(code, shown).length, ct = typeof priceSrc === 'function' && priceSrc() === 'ct';
  const warnN = shown.reduce((a, x) => a + msFins(x).filter(f => msWarnOf(code, x, f)).length, 0);
  return head + msProgHtml(pb, true) + msOptSum() + (val ? `<p class="ms-val">${esc(val)}</p>` : '') + ctl + ign
    + (warnN ? `<p class="hint ms-legend"><span class="ms-lw">${MS_WARN}</span>${TN(warnN, '{n} carte que tu as peut-être sans édition : touche-la pour poser son édition.', '{n} cartes que tu as peut-être sans édition : touche-les pour poser leur édition.')}</p>` : '')
    + (act ? `<p class="hint coll-count">${TN(shown.length, '{n} carte sur {total}', '{n} cartes sur {total}', { total: nf0(s.list.length) })}</p>` : '')
    + (shown.length ? msGrid(code, shown, s.base, s.tot) : `<p class="hint listempty">${T('Aucune carte ne correspond.')}</p>`)
    + (wish || buy ? `<div class="ms-acts">${buy ? `<button class="btn ms-buy" type="button" data-act="msbuy">${esc(ct ? TN(buy, 'Chercher la carte manquante sur CardTrader', 'Chercher les {n} cartes manquantes sur CardTrader') : TN(buy, 'Prix de la carte manquante', 'Prix des {n} cartes manquantes'))}</button>` : ''}
        ${wish ? `<button class="btn ghost ms-wish" type="button" data-act="mswish"><svg class="i" aria-hidden="true"><use href="#i-star"/></svg>${TN(wish, 'Souhaiter la carte manquante', 'Souhaiter les {n} cartes manquantes')}</button>` : ''}</div>` : '');
}
/** Après le rendu : cartes et symboles de l'extension demandés s'ils manquent. */
function msAfterPaint() {
  const code = msCur(); if (code) msEnsure(code);
  if (!SETIC.m) setIcLoad(() => { if (msActive()) collPaintBody(true); });
}

/* ── Carte en grand ───────────────────────────────────────────────────────────────────────────── */
/** Carte du masterset pour l'aperçu en grand (case fin : '', 'n' normale, 'f' foil) : la ligne de la collection si elle y est (édition, illustrations,
 *  rangement) ; sinon l'impression, avec « C'est celle-ci » (exemplaire sans édition) ou « Ajouter à ma collection ». */
function msViewItem(code, x, fin = '') {
  const o = msOwnOf(code, x);
  if (o && msQ(code, x, fin) > 0) { const it = typeof collViewItem === 'function' ? collViewItem(o.k, msLine(o, fin)) : null; if (it) return it; }
  const img = setvImg(x), name = x.dn || x.n, u = msUnit(x, fin), ed = code.toUpperCase() + ' ' + x.num, fo = fin === 'f';
  const it = { key: x.k, name, ln: x.n, small: scrySmall(img), big: img.replace('/normal/', '/large/'), lang: x.il || 'en', set: code, num: x.num, setName: msSetName(code), plain: !x.df, ...(fo ? { foil: true } : {}) };
  const loose = msBasic(x) ? 0 : msLoose(x.k, fin), px = u ? T('prix Cardmarket {v}', { v: fmt(u, mkCur()) + (fo ? ' ✦' : '') }) : '';
  if (loose) {      // D : combien de ces exemplaires sans édition sont de celle-ci (compteur au-dessus du bouton, 1 par défaut)
    const one = loose < 2;
    it.extra = [fo ? TN(loose, 'Tu as {n} exemplaire foil de cette carte sans édition : est-ce celui-ci ?', 'Tu as {n} exemplaires foil de cette carte sans édition')
      : TN(loose, 'Tu as {n} exemplaire de cette carte sans édition : est-ce celui-ci ?', 'Tu as {n} exemplaires de cette carte sans édition'), px].filter(Boolean).join(' · ');
    it.act = { strong: true, max: loose, n: 1, ask: T('Combien sont de cette édition ?'), label: T('C\'est celle-ci : poser l\'édition {ed}', { ed }),
      labelOf: n => (one ? T('C\'est celle-ci : poser l\'édition {ed}', { ed }) : TN(n, 'C\'est celle-ci : poser l\'édition {ed} sur {n} exemplaire', 'C\'est celle-ci : poser l\'édition {ed} sur {n} exemplaires', { ed })),
      fn: n => msAssign(code, x, it, n, fin) };
  } else {
    it.extra = [o && o.q ? (fo ? T('Pas en foil dans ta collection') : T('Seulement en foil dans ta collection')) : T('Pas dans ta collection'), px].filter(Boolean).join(' · ');
    it.act = { strong: true, label: fo ? T('+ Ajouter à ma collection ({ed}, foil)', { ed }) : T('+ Ajouter à ma collection ({ed})', { ed }), fn: () => msAdd(code, x, it, fin) };
  }
  return it;
}
/** Action faite depuis la carte en grand : bouton grisé avec son résultat. */
function msActDone(it, label, extra) {
  it.act = { label, off: true, strong: true }; if (extra != null) it.extra = extra;      // repeint par la visionneuse (viewer.js : bouton grisé, compteur caché)
  const v = $('.imgv'); if (!v || !imgView) return;
  const x = $('.imgv-extra', v); if (x && extra != null) { x.textContent = extra; x.hidden = !extra; }
}
/** Infos de l'impression pour la ligne qui la reçoit (prix, extension, rareté, petites images : anglaise, et dans la langue l si Scryfall l'a). */
const msInfo = (code, x, l) => ({ eu: x.eu ?? null, ef: x.ef ?? null, sn: setName(code) || '', r: x.r || '', im: x.im ? scrySmall(x.im) : '', ...(x.iml && l && l !== 'en' && SCRY_LANG[l] === x.il ? { li: scrySmall(x.iml) } : {}) });
/** « C'est celle-ci » : n exemplaires sans édition reçoivent cette édition, pris dans les lignes sans édition (langue des options, finition de la case),
 *  la plus fournie d'abord ; « Annuler » les remet. */
function msAssign(code, x, it, n = 1, fin = '') {
  const k = x.k, e = edKey(code, x.num), cur = COLL.map[k]; if (!e || !cur) return;
  const loose = collLines(cur).filter(([g]) => msLooseLine(g, fin)).sort((a, b) => b[1] - a[1]); if (!loose.length) return;
  const moves = [];
  for (const [g, q] of loose) { if (n <= 0) break; const m = Math.min(n, q), l = lineLang(g); moves.push([g, lineKey(l, e, lineFoil(g), lineAw(g)), m, l]); n -= m; }
  for (const [, , , l] of moves) edRemember(k, l, e, msInfo(code, x, l));
  for (const [g, to, m] of moves) COLL.map = linesMove(COLL.map, k, g, m, to);
  collChanged(); haptic('ok');
  const name = x.dn || x.n, ed = code.toUpperCase() + ' ' + x.num, done = moves.reduce((a, mv) => a + mv[2], 0);
  toast(TN(done, '{name} : édition {ed} posée sur {n} exemplaire', '{name} : édition {ed} posée sur {n} exemplaires', { name, ed }), { label: T('Annuler'), fn: () => {
    for (const [g, to, m] of moves) COLL.map = linesMove(COLL.map, k, to, m, g);
    collChanged();
  } });
  msActDone(it, T('✓ Édition posée'), TN(done, 'Dans ta collection · {ed} · {n} exemplaire', 'Dans ta collection · {ed} · {n} exemplaires', { ed }));
}
/** « Ajouter à ma collection » : un exemplaire de cette impression (foil pour la case foil), dans la langue des options, sinon celle des cartes de l'utilisateur. */
function msAdd(code, x, it, fin = '') {
  const e = edKey(code, x.num); if (!e) return;
  const l = MS.o.lang || (typeof collImportLang === 'function' ? collImportLang() : 'fr'), fo = fin === 'f', g = lineKey(l, e, fo);
  edRemember(x.k, l, e, msInfo(code, x, l));
  collBump(x.k, x.n, 1, { lang: g }); if (typeof collEnrich === 'function') collEnrich();      // carte neuve : ses infos (type, coût, image) sont lues
  haptic('ok');
  const name = x.dn || x.n, ed = code.toUpperCase() + ' ' + x.num + (fo ? ' ✦' : '');
  toast(T('{name} ajoutée à ta collection ({ed})', { name, ed }), { label: T('Annuler'), fn: () => collBump(x.k, x.n, -1, { lang: g }) });
  msActDone(it, T('✓ Ajoutée'), T('Dans ta collection · {ed}', { ed }));
}

/* ── Liste de souhaits ───────────────────────────────────────────────────────────────────────────── */
/** Carte incomplète qu'on peut souhaiter : ni terrain de base, ni carte sans image, ni déjà souhaitée avec cette illustration. */
function msWishable(code, x) {
  if (msDone(code, x) || msBasic(x) || !x.k || !setvImg(x) || typeof TR === 'undefined') return false;
  const w = TR.wish[x.k]; return !(w && w.i && setvSame(w.i, setvImg(x)));
}
/** « Souhaiter les manquantes » : les cartes incomplètes affichées (filtres compris, variantes comprises si les options les gardent) entrent dans la liste de souhaits
 *  avec l'illustration de cette édition (playset : les exemplaires qui manquent) ; une carte déjà souhaitée prend cette illustration (quantité gardée). « Annuler » remet la liste d'avant. */
function msWishSheet() {
  const v = MS.view; if (!v || typeof TR === 'undefined') return;
  const code = v.code, seen = new Set(), list = [];
  for (const x of v.shown) if (msWishable(code, x) && !seen.has(x.k)) { seen.add(x.k); list.push(x); }      // une illustration par carte : la base d'abord
  if (!list.length) return;
  const eu = list.reduce((a, x) => a + msEu(x), 0), upd = list.filter(x => TR.wish[x.k]).length;
  openSheet(T('Souhaiter les cartes manquantes'), msSetName(code), api => {
    api.body.innerHTML = `<p class="cf-msg">${TN(list.length, '<b>{n}</b> carte manquante entre dans ta liste de souhaits, avec l\'illustration de cette édition.', '<b>{n}</b> cartes manquantes entrent dans ta liste de souhaits, avec l\'illustration de cette édition.')}${eu ? ' ' + esc(T('Prix Cardmarket ≈ {v}', { v: fmt(eu, mkCur()) })) : ''}</p>
      ${upd ? `<p class="hint">${TN(upd, '{n} carte y est déjà avec une autre illustration : elle prend celle-ci.', '{n} cartes y sont déjà avec une autre illustration : elles prennent celle-ci.')}</p>` : ''}
      <p class="hint">${T('Les amis et les visiteurs de ta liste d\'échange les voient dans « Je recherche ».')}</p>`;
    api.setFoot(`<button class="btn ghost" type="button" data-close>${T('Annuler')}</button><button class="btn" type="button" data-ok>${T('Ajouter à ma liste de souhaits')}</button>`);
    api.foot.addEventListener('click', e => {
      if (!e.target.closest('[data-ok]')) return;
      api.close();
      const prev = new Map(list.map(x => [x.k, TR.wish[x.k]])), where = x => [setName(code), code.toUpperCase() + ' ' + x.num].filter(Boolean).join(' · ');
      for (const x of list) { const was = TR.wish[x.k]; TR.wish[x.k] = { n: x.n, q: was ? was.q : Math.max(1, MS.o.need - msQ(code, x, '')), i: setvImg(x), w: where(x).slice(0, 90), ...(x.il && x.il !== 'en' ? { l: x.il } : {}) }; }
      trChanged(); haptic('ok'); if (msActive()) collPaintBody(true);
      toast(TN(list.length, '{n} carte ajoutée à ta liste de souhaits', '{n} cartes ajoutées à ta liste de souhaits'), { label: T('Annuler'), fn: () => {
        for (const [k, w] of prev) { if (w) TR.wish[k] = w; else delete TR.wish[k]; }
        trChanged(); if (msActive()) collPaintBody(true);
      } });
    });
  });
}

/* ── Acheter les manquantes ───────────────────────────────────────────────────────────────────────────── */
/** Cartes à chercher parmi celles affichées (filtres compris, variantes comprises si les options les gardent) : une impression par carte (la base d'abord), sans les terrains
 *  de base (jamais chiffrés) ; q : exemplaires qui manquent (toutes cases), by : par case ({ '': q } sans la version foil ; { n, f } : normales, foil). */
function msBuyList(code, shown) {
  const seen = new Set(), out = [], need = MS.o.need;
  for (const x of shown) {
    if (!x.k || msBasic(x) || seen.has(x.k) || !edKey(code, x.num)) continue;
    const by = {}; let q = 0; for (const f of msFins(x)) { const m = Math.max(0, need - msQ(code, x, f)); if (m) by[f] = m; q += m; }
    if (q) { seen.add(x.k); out.push({ x, q, by }); }
  }
  return out;
}
/** Texte de la liste : « 1 Sol Ring (AAA) 7 », une ligne par case qui manque avec la version foil (« *N* » normale, « *F* » foil), « *FR* » avec la langue des options :
 *  la recherche CardTrader lit le foil et la langue de chaque ligne. */
function msBuyText(code, shown) {
  const lg = MS.o.lang ? ' *' + langCode(MS.o.lang) + '*' : '';
  return msBuyList(code, shown).flatMap(({ x, by }) => Object.entries(by).map(([f, q]) => `${q} ${x.n} (${code.toUpperCase()}) ${x.num}${lg}${f === 'f' ? ' *F*' : f === 'n' ? ' *N*' : ''}`)).join('\n');
}
/** « Chercher les N cartes manquantes sur CardTrader » (Cardmarket sans CardTrader) : la liste (msBuyText) dans Prix d'une liste, aux éditions exactes (cette impression
 *  seulement, déjà possédée seulement si c'est cette édition, cette finition et cette langue) ; la recherche se lance depuis la saisie (état, langue et foil des lignes sans les leurs). */
function msBuy() {
  const v = MS.view; if (!v || typeof putDeckText !== 'function') return;
  const text = msBuyText(v.code, v.shown); if (!text) return;
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
/** Feuille « Choisir une édition » : extensions de la collection (de la plus complète à la moins complète), recherche ; les autres extensions apparaissent dans la recherche. */
function msPickSheet() {
  openSheet(T('Choisir une édition'), T('Tes extensions, de la plus complète à la moins complète'), api => {
    const t = esc(T('Chercher une extension'));
    api.body.innerHTML = `<label class="fsearch ms-sq"><svg class="i" aria-hidden="true"><use href="#i-search"/></svg><input type="search" inputmode="search" enterkeyhint="search" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="${t}" aria-label="${t}"></label>
      <div class="ms-sets"></div>`;
    const inp = $('input', api.body), box = $('.ms-sets', api.body);
    const paint = () => {
      const q = inp.value, mine = msSets(), has = new Set(mine.map(r => r.code)), hit = r => edHit({ sn: msSetName(r.code), set: r.code, y: setDate(r.code).slice(0, 4), num: '' }, q);
      let html = mine.filter(hit).map(msSetRow).join('');
      if (q.trim().length >= 2 && SETIC.m) {      // autres extensions (papier) : commencer un masterset
        const other = Object.keys(SETIC.m).filter(c => !has.has(c) && !setDigital(c) && msShows(c) && hit({ code: c })).sort((a, b) => setDate(b).localeCompare(setDate(a))).slice(0, 30);
        if (other.length) html += `<h3 class="ms-sh">${T('Autres extensions')}</h3>` + other.map(c => msSetRow({ code: c, own: 0, tot: msTotEst(c) })).join('');
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
  MS.set = code; delete MS.err[code]; msSave();
  if (COLL.el) { if (COLL.tab !== 'list') { COLL.tab = COLL.ctab = 'list'; const sg = $('#collSeg', COLL.el); if (sg && sg.setValue) sg.setValue('list'); } collPaintBody(false); const sc = $('.dv-scroll', COLL.el); if (sc) sc.scrollTop = 0; }
}

/* ── Options du masterset (feuille de la roue crantée) ───────────────────────────────────────────── */
function msOptHtml() {
  const o = MS.o, sw = (k, title, sub) => `<label class="switch-row" for="msO-${k}"><span class="t"><b>${esc(title)}</b><span class="hint">${esc(sub)}</span></span><span class="switch"><input type="checkbox" id="msO-${k}" data-o="${k}"${o[k] ? ' checked' : ''}><i></i></span></label>`;
  const chip = (k, v, label) => `<button type="button" class="fopt" data-o="${k}" data-v="${v}" aria-pressed="${o[k] === v}">${esc(label)}</button>`;
  return `<div class="scs ms-opts"><p class="hint">${T('Ce que tu comptes dans tes mastersets : la grille, la progression et les cartes à souhaiter ou à chercher le suivent.')}</p>
    <p class="scs-h">${T('Cartes comptées')}</p>
    ${sw('foil', T('Version foil aussi'), T('Chaque carte en double, côte à côte : normale et foil ✦ (quand elle existe en foil).'))}
    ${sw('basic', T('Terrains de base'), T('Forêt, Île, Plaine… de l\'extension.'))}
    ${sw('vars', T('Variantes'), T('Vitrine, sans bordure, illustration étendue, promos… : à la suite de la base, comptées dans la progression.'))}
    <p class="scs-h">${T('Exemplaires par carte')}</p>
    <div class="scs-chips" role="group" aria-label="${esc(T('Exemplaires par carte'))}">${chip('need', 1, T('1 exemplaire'))}${chip('need', 4, T('4 exemplaires (playset)'))}</div>
    <p class="scs-h">${T('Langue')}</p>
    <label class="sortsel ms-olang"><select data-o="lang" aria-label="${esc(T('Langue des exemplaires comptés'))}"><option value="">${esc(T('Toutes les langues'))}</option>${Object.keys(LANGS).map(l => `<option value="${l}"${o.lang === l ? ' selected' : ''}>${esc(scsLangName(l))}</option>`).join('')}</select></label>
    <p class="hint scs-note">${T('Une langue choisie : seuls tes exemplaires dans cette langue comptent (masterset en français, en japonais…).')}</p>
    ${msOptDiff() ? `<button type="button" class="link-btn ms-oreset" data-o="reset">${T('Remettre les options par défaut')}</button>` : ''}</div>`;
}
/** Une option change : gardée (appareil et compte), grille et barre repeintes. */
function msOptSet(patch) {
  MS.o = msClean(patch === null ? MS_DEF : { ...MS.o, ...patch }); MS.u = Date.now(); MS.idx = null; msSave(); msPushSoon(); msApply();
}
function msApply() { if (msActive()) collPaintBody(true); }      // la barre (roue allumée quand les options changent) est repeinte avec
function msOptSheet() {
  openSheet(T('Options du masterset'), D.user ? T('Enregistrées dans ton compte, les mêmes sur tous tes appareils') : T('Sur cet appareil (connecte-toi pour les retrouver partout)'), api => {
    api.wrap.classList.add('ms-osheet');
    const paint = () => { const y = api.body.scrollTop; api.body.innerHTML = msOptHtml(); api.body.scrollTop = y; };
    paint();
    api.body.addEventListener('click', e => {
      const b = e.target.closest('button[data-o]'); if (!b) return;
      haptic('tap'); msOptSet(b.dataset.o === 'reset' ? null : { [b.dataset.o]: Number(b.dataset.v) }); paint();
    });
    api.body.addEventListener('change', e => {
      const x = e.target.closest('[data-o]'); if (!x) return;
      haptic('tap'); msOptSet({ [x.dataset.o]: x.type === 'checkbox' ? x.checked : x.value }); paint();
    });
  });
}

/* ── Options dans le compte ─────────────────────────────────────────────────────────────────────── */
function msUser(user) {
  const d = MS.doc; if (d.unsub) { try { d.unsub(); } catch (e) { /* ignore */ } d.unsub = null; } clearTimeout(d.pushT); d.pushT = 0; d.uid = '';
  if (!user || !D.cloud || !D.cloud.watchMeta) return;
  if (MS.who && MS.who !== user.uid) MS.u = 0;      // autre compte : les options du compte, s'il en a, l'emportent (celles choisies sans compte partent au premier compte)
  MS.who = user.uid; msSave(); d.uid = user.uid;
  d.unsub = D.cloud.watchMeta(user.uid, 'masterset', (data, pending, fromCache) => {
    if (pending || fromCache || D.uid !== user.uid) return;
    const ru = Number(data && data.updatedAt) || 0;
    if (data && ru > MS.u) { MS.o = msClean(data.o); MS.u = ru; MS.idx = null; msSave(); msApply(); }
    else if (MS.u > ru) msPushSoon();      // options choisies ici, plus récentes (ou compte sans options) : envoyées
  }, () => { /* règles pas encore publiées : options gardées sur l'appareil */ });
}
function msPushSoon() { const d = MS.doc; if (!d.uid) return; clearTimeout(d.pushT); d.pushT = setTimeout(msPush, 900); }
async function msPush() {
  const d = MS.doc; clearTimeout(d.pushT); d.pushT = 0;      // non nul : envoi en attente (metaFlush)
  if (!d.uid || acctHeld(d.uid) || !cloudOn() || !D.cloud.saveMeta) return;      // autre compte, ou compte en cours de suppression
  try { await D.cloud.saveMeta(d.uid, 'masterset', { o: msClean(MS.o), updatedAt: MS.u || Date.now() }); } catch (e) { /* hors ligne, règles : renvoyé au prochain changement */ }
}

/* ── Événements (écran de la collection) ───────────────────────────────────────────────────────────── */
/** Clic dans l'écran de la collection : true s'il concernait le masterset. */
function msClick(e) {
  const b = e.target.closest('button'); if (!b || !COLL.el || !COLL.el.contains(b)) return false;
  const act = b.dataset.act;
  if (act === 'ms') { MS.on = !MS.on; msSave(); haptic('tap'); COLL.shown = COLL_PAGE; collPaintBody(false); const sc = $('.dv-scroll', COLL.el); if (sc) sc.scrollTop = 0; return true; }
  if (act === 'mspick') { haptic('tap'); msPickSheet(); return true; }
  if (act === 'msopt') { haptic('tap'); msOptSheet(); return true; }
  if (!b.closest('.coll-main') || !msActive()) return false;
  if (act === 'msshow') { MS.show = b.dataset.v; msSave(); haptic('tap'); collPaintBody(true); return true; }
  if (act === 'msrar') { const r = b.dataset.r; if (MS.rar.has(r)) MS.rar.delete(r); else MS.rar.add(r); haptic('tap'); collPaintBody(true); return true; }
  if (act === 'msretry') { delete MS.err[msCur()]; collPaintBody(true); return true; }
  if (act === 'mswish') { haptic('tap'); msWishSheet(); return true; }
  if (act === 'msbuy') { haptic('tap'); msBuy(); return true; }
  if (b.classList.contains('ms-open')) {
    const t = b.closest('.ms-c'), v = MS.view; if (!t || !v) return true;
    const list = v.shown, i = Number(t.dataset.i), f = b.dataset.f || ''; if (!list[i]) return true;
    openCardViewer(list.map(x => { const fs = msFins(x); return msViewItem(v.code, x, fs.includes(f) ? f : fs[0]); }), i);      // même finition pour toute la série (normale ou foil)
    return true;
  }
  return false;
}
/** Choix « Par ligne » (cartes, ou paires avec la version foil) : true s'il concernait le masterset. */
function msChange(e) {
  const s = e.target.closest && e.target.closest('select.ms-cols'); if (!s) return false;
  const n = Number(s.value), foil = MS.o.foil;
  if ((foil ? MS_COLS_F : MS_COLS).includes(n)) { if (foil) MS.colsF = n; else MS.cols = n; msSave(); haptic('tap'); }
  s.blur(); collPaintBody(true);
  return true;
}
