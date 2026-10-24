/* ── collection.js : cartes possédées (stockage, compte, infos Scryfall, import, saisie, liste, stats) ─────────
   Source de vérité : « 3 Sol Ring » ligne par ligne (localStorage, et le compte Firestore users/{uid}/meta/collection).
   Les infos Scryfall (coût, type, couleurs, image, prix de référence) sont un cache à part : on peut le vider sans rien perdre. */
const COLL_KEY = 'deckdeal:coll:v1', COLL_SRC_KEY = 'deckdeal:coll:src', COLL_META_KEY = 'coll:meta', COLL_LI_KEY = 'coll:li', COLL_ED_KEY = 'coll:ed', COLL_PAGE = 120;
const COLL_RETRY = { off: 15000, err: 20000, live: 12000 };       // délais (ms) : nouvel essai hors ligne / en erreur, attente du serveur au démarrage
const PX_KEY = 'deckdeal:px:v1', PX_TTL = 2 * DAY, PX_CHUNK = 40;
const COLL = { when: { dir: '', t: 0 }, mode: 'coll', ctab: 'list', ed: {}, edRun: null, solo: {}, soloLoaded: false, px: {}, pxRun: null, pxMsg: null, map: {}, prox: {}, places: {}, place: '', meta: {}, li: {}, u: 0, s: '', base: null, ru: 0, live: false, pushing: 0, again: false, deferred: null, retryT: 0, liveT: 0, cloud: 'off', err: '', unsub: null, el: null, tab: 'list', src: 'cm', topN: 10, topBy: 'lot', f: newFilter(), sort: 'name', shown: COLL_PAGE, enrich: null, enrichErr: '', fb: null, cmdrSeen: '', freshAt: 0, names: null, namesP: null, pushT: 0, pushAt: 0, chg: [], runId: 0, seq: 0, view: null, painted: null, paintT: 0, paintAt: 0, resumeT: 0 };
try { if (localStorage.getItem(COLL_SRC_KEY) === 'ct') COLL.src = 'ct'; } catch (e) { /* stockage indisponible */ }
const collCount = () => Object.keys(COLL.map).length;
const collCopies = () => { let n = 0; for (const k in COLL.map) n += COLL.map[k].q; return n; };
/** Exemplaires possédés d'une carte (k = ownKey du nom). */
const collQty = k => (COLL.map[k] && COLL.map[k].q) || 0;
/** Exemplaires de la carte k dans ces éditions précises ('cmm|400' ; « 0400 » et « 400 » : la même) : recherche aux éditions exactes. f, l : foil ('yes' | 'no') et langue
 *  d'une ligne de la liste (« *F* », « *N* », « *FR* ») : seulement les exemplaires de cette finition et de cette langue. */
function collEdQty(k, eds, f, l) { const want = new Set((eds || []).map(edNorm)); let n = 0; for (const [g, q] of collLines(COLL.map[k])) if (want.has(edNorm(lineEd(g))) && (!f || lineFoil(g) === (f === 'yes')) && (!l || lineLang(g) === l)) n += q; return n; }
const nf0 = n => Number(n || 0).toLocaleString(LOC());

/** Collection complète de cet appareil (cartes, proxys, emplacements) ; collDocSet la remplace. */
const collDocNow = () => collDoc(COLL.map, COLL.prox, COLL.places);
function collDocSet(d) { COLL.map = d.map; COLL.prox = d.prox; COLL.places = d.places; }
/* ── Stockage local ───────────────────────────────────────────────────────────────────────────── */
function collRead() {
  try {
    const r = JSON.parse(localStorage.getItem(COLL_KEY) || 'null');
    if (r && typeof r.t === 'string') {
      collDocSet(collDocFromText(r.t)); COLL.u = Number(r.u) || 0; COLL.s = typeof r.s === 'string' ? r.s : '';
      COLL.base = COLL.s && typeof r.b === 'string' ? collDocFromText(r.b) : null;                  // dernier état du compte connu de cet appareil (null : inconnu → fusion par union)
    }
  } catch (e) { /* illisible : on repart d'une collection vide */ }
}
function collWrite() {
  try { localStorage.setItem(COLL_KEY, JSON.stringify({ t: collDocText(collDocNow()), u: COLL.u, s: COLL.s, ...(COLL.base ? { b: collDocText(COLL.base) } : {}) })); return true; }
  catch (e) { toast(T('Stockage plein : la collection n\'a pas pu être enregistrée sur cet appareil')); return false; }
}
/* ── Collection d'un autre compte gardée sur l'appareil ──────────────────────────────────────────────────────────────
   La copie de l'appareil appartient au dernier compte synchronisé (COLL.s). Un autre compte qui s'y connecte (compte supprimé puis recréé avec la même
   adresse : nouvel identifiant ; appareil prêté) ne la reçoit jamais d'office : elle est mise de côté (COLL_ASIDE_KEY, telle quelle) et proposée une fois
   le compte lu (« L'ajouter à ce compte » / « Ne pas l'ajouter » ; sans choix, reproposée au lancement suivant). Avant le 19 octobre 2026, elle était
   fusionnée sans rien demander : un ancien appareil remettait dans un compte neuf toute la collection d'un compte supprimé. Une copie jamais
   synchronisée (COLL.s vide : cartes ajoutées avant de se connecter) est fusionnée comme avant. */
const COLL_ASIDE_KEY = 'deckdeal:coll:aside:v1';
const collAsideRaw = () => { try { const raw = localStorage.getItem(COLL_ASIDE_KEY), r = raw && JSON.parse(raw); return r && typeof r.t === 'string' ? raw : null; } catch (e) { return null; } };
/** Copie de l'appareil (compte uid) mise de côté, la collection de l'appareil repart vide pour le compte qui se connecte. false : impossible (stockage). */
function collAside(uid) {
  let raw = null; try { raw = localStorage.getItem(COLL_KEY); } catch (e) { return false; }
  if (!raw) return false;
  try { localStorage.removeItem(COLL_KEY); localStorage.setItem(COLL_ASIDE_KEY, raw); }      // déplacée telle quelle (place libérée d'abord : même taille)
  catch (e) { try { localStorage.setItem(COLL_KEY, raw); } catch (x) { /* ignore */ } return false; }
  collDocSet(collDoc()); COLL.base = null; COLL.s = ''; COLL.u = 0; COLL.asked = false; collWrite();
  return true;
}
function collAsideSoon() { if (COLL.asked || !D.user || !COLL.live || !collAsideRaw()) return; COLL.asked = true; setTimeout(collAsideAsk, 700); }
function collAsideAsk() {
  const raw = collAsideRaw(); if (!raw || !D.user || (typeof streamOn === 'function' && streamOn())) return;
  let doc = null; try { doc = collDocFromText(JSON.parse(raw).t); } catch (e) { return; }
  const n = Object.keys(doc.map).length, q = Object.values(doc.map).reduce((a, x) => a + (x.q || 0), 0);
  if (!n && !Object.keys(doc.prox).length) { try { localStorage.removeItem(COLL_ASIDE_KEY); } catch (e) { /* ignore */ } return; }
  openSheet(T('Une autre collection sur cet appareil'), null, api => {
    api.body.innerHTML = `<p>${esc(T('Cet appareil gardait la collection d\'un autre compte (un compte supprimé, ou celui de quelqu\'un d\'autre) : {cards}, {copies}. Elle n\'a pas été ajoutée à ce compte.', { cards: TN(n, '{n} carte', '{n} cartes', { n: nf0(n) }), copies: TN(q, '{n} exemplaire', '{n} exemplaires', { n: nf0(q) }) }))}</p><p class="hint">${esc(T('Sans choix, elle reste de côté sur cet appareil et te sera reproposée.'))}</p>`;
    api.setFoot(`<button class="btn block" type="button" data-as="add">${esc(T('L\'ajouter à ce compte'))}</button><button class="btn ghost block" type="button" data-as="drop">${esc(T('Ne pas l\'ajouter'))}</button>`);
    api.foot.addEventListener('click', e => {
      const b = e.target.closest('[data-as]'); if (!b || collAsideRaw() !== raw) return;
      haptic('tap'); api.close();
      try { localStorage.removeItem(COLL_ASIDE_KEY); } catch (x) { /* ignore */ }
      if (b.dataset.as === 'add') { collDocSet(mergeDoc3(null, collDocNow(), doc)); collChanged(); collEnrich(); toast(TN(n, '{n} carte ajoutée à ce compte', '{n} cartes ajoutées à ce compte', { n: nf0(n) })); }
      else toast(T('Collection de l\'autre compte retirée de cet appareil'), { label: T('Annuler'), fn: () => { try { localStorage.setItem(COLL_ASIDE_KEY, raw); } catch (x) { /* ignore */ } COLL.asked = false; collAsideSoon(); } });
    });
  });
}
async function collMetaLoad() {
  try { const m = await Cache.get(COLL_META_KEY, 60 * DAY); if (m && typeof m === 'object' && !Array.isArray(m)) { COLL.meta = { ...m, ...COLL.meta }; collPaint(); } } catch (e) { /* cache absent */ }
  try { const m = await Cache.get(COLL_LI_KEY, 60 * DAY); if (m && typeof m === 'object' && !Array.isArray(m)) { COLL.li = { ...m, ...COLL.li }; collPaint(); } } catch (e) { /* cache absent */ }
  try { const m = await Cache.get(COLL_ED_KEY, 60 * DAY); if (m && typeof m === 'object' && !Array.isArray(m)) { COLL.ed = { ...m, ...COLL.ed }; collPaint(); } } catch (e) { /* cache absent */ }
}
let metaT = 0;
function collMetaFlush() { clearTimeout(metaT); metaT = 0; Cache.set(COLL_META_KEY, COLL.meta); Cache.set(COLL_LI_KEY, COLL.li); Cache.set(COLL_ED_KEY, COLL.ed); }
function collMetaSave() { clearTimeout(metaT); metaT = setTimeout(collMetaFlush, 800); }
// appli mise en arrière-plan ou fermée juste après une lecture : l'enregistrement en attente part tout de suite
if (typeof document !== 'undefined') { document.addEventListener('visibilitychange', () => { if (document.hidden && metaT) collMetaFlush(); }); addEventListener('pagehide', () => { if (metaT) collMetaFlush(); }); }

/* ── Édition des lignes (« CMM 400 ») : prix Cardmarket, image et extension de l'édition, lus sur Scryfall (cache : COLL.ed, gardé sur l'appareil) ──────
   COLL.ed : 'cmm|400' → { eu, ef (centimes, null si inconnu), im (petite image anglaise), sn (extension), r (rareté), t (lecture) } ou { t, none: 1 } (inconnue de Scryfall). */
const ED_TTL = 2 * DAY;
/** Prix Cardmarket d'un exemplaire de l'édition e (centimes) : non foil, à défaut foil (impression qui n'existe qu'en foil) ; f : exemplaire foil → le prix foil, à défaut le non foil ; null si inconnu. */
const edEu = (e, f) => { const x = e && COLL.ed[e]; if (!x) return null; const a = f ? x.ef : x.eu, b = f ? x.eu : x.ef; return a > 0 ? a : b > 0 ? b : null; };
/** Prix d'un exemplaire d'une ligne : celui de son édition s'il est connu (foil : prix foil), sinon le prix de référence de la carte (foil : son prix foil Cardmarket, à défaut le prix normal ; null sans prix). */
const collLineEu = (k, g) => { const f = lineFoil(g), u = edEu(lineEd(g), f); if (u != null) return u; const m = COLL.meta[k]; if (!m) return null; return f && m.ef > 0 ? m.ef : Number.isFinite(m.eu) ? m.eu : null; };
/** Prix moyen d'un exemplaire de la carte (centimes), éditions comprises : valeur de la collection, tri par prix. null sans prix. */
function collCardEu(k) {
  const x = COLL.map[k], m = COLL.meta[k], ref = m && Number.isFinite(m.eu) ? m.eu : null; if (!x || !x.x) return ref;      // sans édition : le prix de référence
  let v = 0, n = 0;
  for (const [g, q] of collLines(x)) { const u = collLineEu(k, g); if (u > 0) { v += u * q; n += q; } }
  return n ? Math.round(v / n) : ref;
}
/** Valeur d'une carte (centimes) : prix de chaque ligne (édition, sinon référence) × exemplaires ; 0 sans prix. */
function collCardVal(k) {
  const x = COLL.map[k]; if (!x) return 0;
  if (!x.x) { const m = COLL.meta[k]; return m && m.eu > 0 ? m.eu * x.q : 0; }
  let v = 0; for (const [g, q] of collLines(x)) { const u = collLineEu(k, g); if (u > 0) v += u * q; }
  return v;
}
/** Valeur de la collection (centimes). */
function collValue() { let v = 0; for (const k in COLL.map) v += collCardVal(k); return v; }
/** Éditions des lignes de la collection ; stale : seulement celles jamais lues ou lues depuis plus de 2 jours. */
function collEds(stale) {
  const out = new Set(), now = Date.now();
  for (const x of Object.values(COLL.map)) if (x.x) for (const g of Object.keys(x.x)) { const e = lineEd(g); if (e && (!stale || !(now - ((COLL.ed[e] || {}).t || 0) < ED_TTL))) out.add(e); }
  return [...out];
}
/** Garde les infos d'éditions lues (scryEditions, ou une impression des illustrations : { eu, ef, im, sn, r }). */
function edPut(e, x) { if (!e) return; COLL.ed[e] = x ? { eu: x.eu ?? null, ef: x.ef ?? null, im: x.im || '', sn: x.sn || '', r: x.r || '', t: Date.now() } : { t: Date.now(), none: 1 }; }
/** Lit les éditions à relire (jamais lues, ou de plus de 2 jours ; all : toutes) puis repeint. Silencieux en cas d'échec (le prix de référence reste affiché). */
async function edRefresh(all, signal) {
  if (COLL.edRun) return COLL.edRun;
  const eds = collEds(!all); if (!eds.length || scryLeft() > 0 || collOffline()) return;
  COLL.edRun = (async () => {
    try { const got = await scryEditions(eds, signal); for (const [e, x] of got) { edPut(e, x); if (!all && typeof prcOver === 'function') prcOver('', e); } collMetaSave(); collPaintSoon(); paintCollSection(); }      // relecture du jour (all) : les prix du moment, partagés ensuite
    catch (e) { /* hors ligne, pause Scryfall : nouvel essai à la prochaine ouverture */ }
    finally { COLL.edRun = null; }
  })();
  return COLL.edRun;
}
/** Image d'une ligne : son édition (dans sa langue si on la connaît, sinon l'anglaise : la bonne illustration), sinon celle de la carte dans sa langue. { src, lang }. */
function collLineImage(k, g, en) {
  const l = lineLang(g), e = lineEd(g);
  if (e) {
    if (l && l !== 'en') { const u = COLL.li[liKey(l, k + '|' + e)]; if (u) return { src: u, lang: l }; }
    const x = COLL.ed[e]; if (x && x.im) return { src: x.im, lang: 'en' };
  }
  return collImage(k, l, en);
}
/** Image de l'impression exacte (édition e, exemplaires de langue l ; classeur et liste d'échange, partage) : dans la langue si Scryfall l'a, sinon l'anglaise de cette impression ;
 *  '' tant que l'édition n'est pas lue (bndEdLoad) ; null si Scryfall ne la connaît pas (l'image de la carte, alors). Jamais une autre impression du même nom. */
function edImage(k, l, e) {
  if (l && l !== 'en') { const u = COLL.li[liKey(l, k + '|' + e)]; if (u) return u; }
  const x = COLL.ed[e]; return x && x.im ? x.im : x && x.none ? null : '';
}
/** Change l'édition d'une ligne (e : 'cmm|400', '' : édition non précisée) ; ses exemplaires rejoignent la ligne de même langue et même édition s'il y en a une.
 *  info : l'impression choisie ({ eu, ef, sn, r, im (petite image anglaise), li (petite image dans la langue de la ligne) }). Retourne la clé de la ligne. */
function collSetEd(k, g, e, info) {
  const cur = COLL.map[k]; if (!cur) return g;
  const l = lineLang(g), to = lineKey(l, e, lineFoil(g), lineAw(g));
  if (info) edRemember(k, l, e, info);
  if (to === g) return g;
  const lines = collLines(cur).map(x => x.slice()), i = lines.findIndex(x => x[0] === g); if (i < 0) return g;
  const q = lines[i][1]; lines.splice(i, 1);
  const t = lines.find(x => x[0] === to); if (t) t[1] += q; else lines.push([to, q]);
  COLL.map[k] = collFromLines(cur, lines); collChanged({ paint: false });
  if (e && !info && !COLL.ed[e]) edRefresh();
  return to;
}
/** Infos d'une impression choisie (« Illustrations », ajout par lot) pour son édition : prix, extension, rareté, petite image (anglaise : im ; dans la langue l de la ligne : li). */
function edInfoOf(p, l) {
  const sl = SCRY_LANG[l] || l;
  return { eu: p.eu ?? null, ef: p.ef ?? null, sn: p.sn || '', r: p.r || '', ...(!p.l || p.l === 'en' ? { im: p.th } : {}), ...(l && l !== 'en' && p.l === sl ? { li: p.th } : {}) };
}
/** Garde les infos de l'édition e choisie pour la carte k (exemplaires de langue l) : prix, extension, image dans la langue de la ligne. */
function edRemember(k, l, e, info) {
  if (!e || !info) return;
  edPut(e, { ...(COLL.ed[e] || {}), ...info, im: info.im || (COLL.ed[e] || {}).im || '' });
  if (info.li && l && l !== 'en') COLL.li[liKey(l, k + '|' + e)] = info.li;
  collMetaSave();
}
/* ── Recherche d'une extension dans un choix d'édition (terrains de base : des centaines d'impressions) ── */
const ED_Q_MIN = 2;      // champ montré dès qu'il y a un choix (2 impressions ou plus)
const edFold = s => ' ' + String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ');
/** L'impression p répond à la recherche q : chaque mot tapé commence un mot du nom de l'extension, son code, l'année ou le numéro (« bloom », « blb », « 2024 »). */
function edHit(p, q) {
  const w = edFold(q).trim().split(' ').filter(Boolean); if (!w.length) return true;
  const h = edFold([p.sn || setName(p.set), p.set, p.y, p.num].join(' '));
  return w.every(x => h.includes(' ' + x));
}
/** Champ « Chercher une extension » d'un choix d'édition de n impressions (rien sous ED_Q_MIN). */
function edQHtml(n, q = '') {
  if (n < ED_Q_MIN) return '';
  const t = esc(T('Chercher une extension'));
  return `<label class="fsearch ed-q"><svg class="i" aria-hidden="true"><use href="#i-search"/></svg><input type="search" data-edq inputmode="search" enterkeyhint="search" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="${t}" aria-label="${t}" value="${esc(q)}"></label>`;
}
/** Recherche d'un code d'extension ou d'un numéro (« neo », « 295 ») : aussi demandée à Scryfall 450 ms après la dernière frappe, même si la liste lue en a déjà
 *  (liste incomplète : terrains de base aux centaines d'impressions, variantes plein art d'une extension dont seuls les terrains classiques sont dans la liste) ;
 *  find(q) → impressions (data.js › scryPrintsFind) ; « Recherche sur Scryfall… » pendant ce temps quand rien n'est encore affiché ; les impressions nouvelles
 *  (sans doublon) partent à add(liste), qui les ajoute et repeint. Une fois par recherche. Retourne la fonction à appeler à chaque frappe : (q, n trouvées, box). */
function edQFinder(prints, find, add) {
  let t = 0; const done = new Set();
  return (q, n, box) => {
    clearTimeout(t); const k = String(q || '').trim().toLowerCase();
    if (!find || !k || done.has(k) || !k.split(/[\s,#·]+/).some(x => (/^[a-z0-9]{2,6}$/.test(x) && /[a-z]/.test(x)) || /^\d{1,4}[a-z★]?$/.test(x))) return;      // ni code ni numéro : la liste lue suffit
    t = setTimeout(async () => {
      done.add(k); const m = !n && box && box.querySelector('.ed-q-none'); if (m) m.textContent = T('Recherche sur Scryfall…');
      let got = []; try { got = (await find(k)) || []; } catch (e) { got = []; }
      const have = new Set((prints() || []).map(p => p.set + '/' + p.num)), extra = got.filter(p => !have.has(p.set + '/' + p.num));
      if (extra.length) add(extra); else if (m && m.isConnected) m.textContent = T('Aucune extension ne correspond à « {q} »', { q: String(q).trim() });
    }, 450);
  };
}
/** Filtre les tuiles (sel, data-i = index dans prints ; « Sans édition » reste) d'après la recherche q : en-têtes de groupe cachés pendant la recherche, message si rien. */
function edQApply(box, prints, q, sel) {
  let n = 0;
  for (const b of box.querySelectorAll(sel)) { const p = prints[Number(b.dataset.i)]; if (!p) continue; const ok = edHit(p, q); b.classList.toggle('ed-off', !ok); if (ok) n++; }
  for (const h of box.querySelectorAll('.ced-h')) h.classList.toggle('ed-off', !!q.trim());
  let m = box.querySelector('.ed-q-none');
  if (q.trim() && !n) { if (!m) { m = document.createElement('p'); m.className = 'hint ed-q-none'; box.prepend(m); } m.textContent = T('Aucune extension ne correspond à « {q} »', { q: q.trim() }); }
  else if (m) m.remove();
  return n;
}
/** Champ de recherche d'un conteneur repeint (innerHTML) : relit la recherche avant, rend le focus et le curseur après. Retourne restore(). */
function edQKeep(root) {
  const i = root.querySelector('[data-edq]'), had = !!i && document.activeElement === i, q = i ? i.value : '', at = i ? i.selectionStart : null;
  return { q, restore() { const j = root.querySelector('[data-edq]'); if (!j || !had) return; j.focus({ preventScroll: true }); try { j.setSelectionRange(at, at); } catch (e) { /* type search */ } } };
}
/** Feuille de choix d'une édition : une tuile par impression (symbole, code et numéro, prix, particularités) et « Sans édition ».
 *  o : { name, sub, cur ('set|num', '' : sans édition), load () → Promise(impressions), front (extensions à montrer d'abord, sous frontLabel), onPick(impression | null, n),
 *  count (exemplaires concernés au plus, ou fonction : à partir de 2, « Exemplaires concernés − n + » en tête ; n, tous par défaut, suit le choix : les autres gardent leur édition),
 *  onSplit (lien « Répartir entre plusieurs éditions » sous le compteur : ferme la feuille et l'appelle),
 *  foilN ({ get () → { n (exemplaires foil), total }, set (n) } : un exemplaire, interrupteur Foil ✦ ; plusieurs, « Foil ✦ − n + / total » : 2 foil sur 4) }. */
function edSheet(o) {
  setIcLoad();
  return openSheet(T('Édition de {name}', { name: o.name }), o.sub || '', api => {
    api.wrap.classList.add('ced-sheet');
    const cmax = () => (typeof o.count === 'function' ? o.count() : o.count) || 0, fv = () => (o.foilN ? o.foilN.get() : null);
    const foilAll = () => { const v = fv(); return v ? v.n > 0 && v.n >= v.total : !!o.foil; };      // prix des tuiles : foil quand tous les exemplaires le sont
    let prints = null, err = '', foil = foilAll(), n = cmax() > 1 ? cmax() : 0;
    const cnt = () => (n ? `<div class="cex-n ced-cnt"><span>${T('Exemplaires concernés')}</span><span class="qstep"><button type="button" data-cn="-1" aria-label="${T('Moins')}">−</button><b>${n}</b><button type="button" data-cn="1" aria-label="${T('Plus')}">+</button></span><small>/ ${nf0(cmax())}</small></div>` : '')
      + (o.onSplit ? `<button type="button" class="link-btn ced-split" data-split>${T('Répartir entre plusieurs éditions')}</button>` : '');      // feuille « Répartir par édition » (edSplit)
    const tile = (p, i) => {
      const e = edKey(p.set, p.num), px = foil ? (p.ef > 0 ? fmt(p.ef, 'EUR') + ' ✦' : p.eu > 0 ? fmt(p.eu, 'EUR') : '') : p.eu > 0 ? fmt(p.eu, 'EUR') : p.ef > 0 ? fmt(p.ef, 'EUR') + ' ✦' : '', ic = setIcHtml(p.set);      // ligne foil : le prix foil Cardmarket de chaque édition
      return `<button type="button" class="ced-t" role="radio" data-i="${i}" aria-checked="${e === o.cur}" aria-label="${esc(p.sn)} ${esc(edLabel(e))}${px ? ', ' + esc(px) : ''}" title="${esc(p.sn)}">${ic || `<span class="ed-code">${esc(String(p.set).toUpperCase())}</span>`}<span class="ced-n">${esc(String(p.set).toUpperCase())} ${esc(p.num)}</span>${px ? `<b>${esc(px)}</b>` : ''}${p.fx.length ? `<small>${esc(p.fx.join(', '))}</small>` : ''}</button>`;
    };
    let q = '', wantQ = !!o.focusQ;      // focusQ : la feuille s'ouvre sur la recherche (bandeau du scan › « Chercher une extension »)
    const more = edQFinder(() => prints, o.find, extra => { prints.push(...extra); paint(); });      // o.find : recherche sur Scryfall quand la liste n'a rien (code, numéro)
    const filter = () => { const g = $('.ced-grid', api.body); if (g) more(q, edQApply(g, prints, q, '.ced-t'), g); };
    const paint = () => {
      if (!sheets.includes(api)) return;
      if (!prints) { api.body.innerHTML = `${cnt()}<p class="hint">${err ? esc(err) : T('Éditions…')}</p>`; return; }
      const keep = edQKeep(api.body); q = keep.q || q;
      const fr = (o.front || []).filter(s => prints.some(p => p.set === s)), all = prints.map((p, i) => [p, i]);
      const top = fr.flatMap(s => all.filter(([p]) => p.set === s)), rest = top.length ? all.filter(([p]) => !fr.includes(p.set)) : all;
      const v = fv(), fsw = !v ? '' : v.total > 1      // plusieurs exemplaires : combien sont foil (les autres restent non foil, même édition)
        ? `<div class="ced-foil ced-foiln"><span class="ced-foil-t"><b>${T('Foil')} ✦</b><small>${v.n ? T('Prix foil Cardmarket pour les exemplaires foil') : T('Combien de tes exemplaires sont foil ?')}</small></span><span class="qstep"><button type="button" data-fn="-1" aria-label="${T('Moins')}"${v.n ? '' : ' disabled'}>−</button><b>${v.n}</b><button type="button" data-fn="1" aria-label="${T('Plus')}"${v.n < v.total ? '' : ' disabled'}>+</button></span><small>/ ${nf0(v.total)}</small></div>`
        : `<label class="ced-foil"><span class="ced-foil-t"><b>${T('Foil')} ✦</b><small>${v.n ? T('Prix foil Cardmarket de l\'édition') : T('Exemplaires foil : touche pour les marquer')}</small></span><span class="switch"><input type="checkbox" data-act="foil"${v.n ? ' checked' : ''} aria-label="${T('Foil')}"><i></i></span></label>`;
      api.body.innerHTML = `${cnt()}${fsw}${edQHtml(prints.length, q)}<div class="ced-grid" role="radiogroup" aria-label="${esc(T('Édition de {name}', { name: o.name }))}">${top.length ? `<p class="ced-h">${esc(o.frontLabel || '')}</p>${top.map(([p, i]) => tile(p, i)).join('')}${rest.length ? `<p class="ced-h">${T('Autres éditions')}</p>` : ''}` : ''}${rest.map(([p, i]) => tile(p, i)).join('')}<button type="button" class="ced-t none" role="radio" data-i="-1" aria-checked="${!o.cur}"><span class="ced-q" aria-hidden="true"><svg class="i"><use href="#i-stack"/></svg></span><span class="ced-n">${T('Sans édition')}</span></button></div>`;
      filter(); keep.restore();
      const qi = $('[data-edq]', api.body);
      if (wantQ && qi) { wantQ = false; requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(() => { if (sheets.includes(api)) qi.focus({ preventScroll: true }); }))); }      // après le focus que openSheet pose sur Fermer
    };
    paint(); setIcLoad(paint);
    o.load().then(list => { prints = list || []; paint(); }, () => { err = scryLeft() > 0 ? T('Scryfall demande une pause, réessaie dans une minute.') : T('Éditions indisponibles pour l\'instant (hors ligne ?)'); paint(); });
    api.body.addEventListener('input', e => { if (!e.target.matches('[data-edq]')) return; q = e.target.value; filter(); });
    api.body.addEventListener('change', e => {
      const sw = e.target.closest('input[data-act="foil"]'); if (!sw || !o.foilN) return;
      haptic('tap'); o.foilN.set(sw.checked ? 1 : 0); foil = foilAll(); paint();      // la feuille reste ouverte : les prix des tuiles passent en foil
    });
    api.body.addEventListener('click', e => {
      if (e.target.closest('[data-split]')) { haptic('tap'); api.close(); o.onSplit(); return; }
      const fb = e.target.closest('[data-fn]');
      if (fb && o.foilN) { const v = fv(), to = Math.max(0, Math.min(v.total, v.n + Number(fb.dataset.fn))); if (to !== v.n) { haptic('tap'); o.foilN.set(to); foil = foilAll(); paint(); } return; }
      const cn = e.target.closest('[data-cn]');
      if (cn) { n = Math.max(1, Math.min(cmax(), n + Number(cn.dataset.cn))); haptic('tap'); $('.ced-cnt b', api.body).textContent = n; return; }      // repeint seul : la recherche et le défilement restent
      const b = e.target.closest('.ced-t'); if (!b || !prints) return;
      const i = Number(b.dataset.i), p = i >= 0 ? prints[i] : null;
      haptic('ok'); api.close(); o.onPick(p, n || undefined);
    });
  });
}
/** Sélecteur d'édition d'une ligne de la liste : les éditions de la carte (dans la langue de la ligne, puis celles qui n'existent qu'en anglais) et « Sans édition ».
 *  La feuille porte sur les exemplaires de cette langue et cette édition, foil et non foil (même rangement) : « Foil ✦ − n + » en répartit une partie en foil (2 foil sur 4),
 *  « Exemplaires concernés » choisit combien changent d'édition (la finition de la ligne touchée d'abord, puis l'autre ; chacun garde sa finition). */
function collEdPick(k, g) {
  const x = COLL.map[k]; if (!x) return;
  const l = lineLang(g), cur = lineEd(g), aw = lineAw(g), name = frName(k, l) || x.n; haptic('tap');
  const gN = lineKey(l, cur, false, aw), gF = lineKey(l, cur, true, aw), qOf = h => (collLines(COLL.map[k]).find(e => e[0] === h) || [h, 0])[1];
  const total = () => qOf(gN) + qOf(gF), grp = edGroup(k, g);
  edSheet({ name, sub: l ? T('Exemplaires {lang}', { lang: langCode(l) }) : '', cur, count: total, load: () => scryArtPrints(x.n, l || 'en'), find: q => scryPrintsFind(x.n, l || 'en', q),
    ...(grp.total > 1 ? { onSplit: () => edSplit(k, qOf(g) ? g : g === gN ? gF : gN) } : {}),
    foilN: {
      get: () => ({ n: qOf(gF), total: total() }),
      set: n => {      // foil ↔ non foil dans la même édition
        const f0 = qOf(gF); if (!COLL.map[k] || n === f0) return;
        COLL.map = n > f0 ? linesMove(COLL.map, k, gN, n - f0, gF) : linesMove(COLL.map, k, gF, f0 - n, gN);
        collChanged({ paint: false }); collPaintBody(true);
      },
    },
    onPick: (p, n) => {
      const ne = p ? edKey(p.set, p.num) : ''; if (ne === cur || !COLL.map[k]) return;
      let left = Math.min(n || total(), total());
      if (p) edRemember(k, l, ne, edInfoOf(p, l));
      for (const h of lineFoil(g) ? [gF, gN] : [gN, gF]) {      // la finition de la ligne touchée d'abord
        const m = Math.min(left, qOf(h)); if (!m) continue;
        COLL.map = linesMove(COLL.map, k, h, m, lineKey(l, ne, lineFoil(h), aw)); left -= m;
      }
      collChanged({ paint: false }); collPaintBody(true);
    } });
}
/** Lignes de la carte k qui ne diffèrent de la ligne g que par l'édition (même langue, même finition, même rangement et détails) : { same (clé → bool), lines, total }. */
function edGroup(k, g) {
  const l = lineLang(g), f = lineFoil(g), aw = lineAw(g), same = h => lineLang(h) === l && lineFoil(h) === f && lineAw(h) === aw;
  const lines = collLines(COLL.map[k]).filter(([h]) => same(h));
  return { same, lines, total: lines.reduce((a, e) => a + e[1], 0) };
}
/** « Répartir par édition » (lien de la feuille « Édition de… ») : les exemplaires d'une langue (même finition, même rangement) répartis d'un coup entre plusieurs éditions,
 *  − / + par édition, « + Ajouter une édition » (choix d'une illustration), « Sans édition » prend le reste (jamais plus que le total) ; Enregistrer, puis « Annuler ». */
function edSplit(k, g) {
  const x = COLL.map[k]; if (!x) return;
  const l = lineLang(g), f = lineFoil(g), aw = lineAw(g), grp = edGroup(k, g), total = grp.total; if (total < 2) return;
  const rows = grp.lines.filter(([h]) => lineEd(h)).map(([h, q]) => ({ e: lineEd(h), q, info: null })), name = frName(k, l) || x.n;
  const rest = () => total - rows.reduce((a, r) => a + r.q, 0);
  const pxOf = r => { const i = r.info, u = i ? (f ? (i.ef > 0 ? i.ef : i.eu) : (i.eu > 0 ? i.eu : i.ef)) : edEu(r.e, f); return u > 0 ? u : 0; };
  haptic('tap');
  openSheet(T('Répartir par édition'), TN(total, '{name} · {n} exemplaire', '{name} · {n} exemplaires', { name }) + (l ? ' ' + langCode(l) : '') + (f ? ' · ' + T('Foil') : ''), api => {
    api.wrap.classList.add('esp-sheet');
    const paint = () => {
      const r0 = rest(), m = COLL.meta[k], ref = m ? (f && m.ef > 0 ? m.ef : m.eu > 0 ? m.eu : 0) : 0;
      let val = r0 * ref; for (const r of rows) val += r.q * (pxOf(r) || ref);
      api.body.innerHTML = rows.map((r, i) => {
        const set = edSet(r.e), sn = setName(set) || (r.info && r.info.sn) || (COLL.ed[r.e] || {}).sn || set.toUpperCase(), px = pxOf(r);
        return `<div class="esp-r" data-e="${esc(r.e)}"><span class="esp-ic">${setIcHtml(set) || `<span class="ed-code">${esc(set.toUpperCase())}</span>`}</span><span class="esp-t"><b>${esc(sn)}</b><small>${esc(edLabel(r.e))}${px ? ' · ' + esc(fmt(px, 'EUR')) : ''}</small></span>
          <span class="qstep"><button type="button" data-i="${i}" data-d="-1" aria-label="${esc(T('Moins'))}"${r.q ? '' : ' disabled'}>−</button><b>${r.q}</b><button type="button" data-i="${i}" data-d="1" aria-label="${esc(T('Plus'))}"${r0 ? '' : ' disabled'}>+</button></span></div>`;
      }).join('')
        + `<div class="esp-r esp-none"><span class="esp-ic" aria-hidden="true"></span><span class="esp-t"><b>${T('Sans édition')}</b><small>${T('le reste')}</small></span><em>${r0}</em></div>
        <button class="btn ghost block esp-add" type="button" data-add>${T('+ Ajouter une édition')}</button>
        <div class="esp-tot"><span>${val ? esc(T('Valeur ≈ {v}', { v: fmt(val, 'EUR') })) : ''}</span><b class="${r0 ? '' : 'ok'}">${esc(T('{a} / {b} répartis', { a: nf0(total - r0), b: nf0(total) }))}${r0 ? '' : ' ✓'}</b></div>`;
    };
    paint(); setIcLoad(() => { if (sheets.includes(api)) paint(); });      // symboles des extensions : repeint dès qu'ils arrivent
    api.setFoot(`<button class="btn ghost" type="button" data-close>${T('Annuler')}</button><button class="btn" type="button" data-ok>${T('Enregistrer')}</button>`);
    api.body.addEventListener('click', e => {
      const b = e.target.closest('[data-d]');
      if (b) { const r = rows[Number(b.dataset.i)], d = Number(b.dataset.d); if (!r || (d > 0 && !rest())) return; r.q = Math.max(0, r.q + d); haptic('tap'); paint(); return; }
      if (!e.target.closest('[data-add]')) return;
      edSheet({ name, sub: T('Édition à ajouter'), cur: '', foil: f, load: () => scryArtPrints(x.n, l || 'en'), find: q => scryPrintsFind(x.n, l || 'en', q), onPick: p => {
        const ne = p ? edKey(p.set, p.num) : ''; if (!ne || !sheets.includes(api)) return;
        let r = rows.find(y => y.e === ne); if (!r) rows.push(r = { e: ne, q: 0, info: edInfoOf(p, l) }); else if (!r.info) r.info = edInfoOf(p, l);
        if (rest() > 0) r.q++; paint();      // l'édition ajoutée prend un exemplaire du reste
      } });
    });
    api.foot.addEventListener('click', e => {
      if (!e.target.closest('[data-ok]')) return;
      api.close();
      const cur = COLL.map[k]; if (!cur) return;
      const before = collLines(cur).map(y => y.slice()), r0 = rest();
      const lines = [...before.filter(([h]) => !grp.same(h)), ...rows.filter(r => r.q > 0).map(r => [lineKey(l, r.e, f, aw), r.q]), ...(r0 > 0 ? [[lineKey(l, '', f, aw), r0]] : [])];
      for (const r of rows) if (r.info && r.q > 0) edRemember(k, l, r.e, r.info);
      const next = collFromLines(cur, lines); if (!next) return;
      COLL.map[k] = next; collChanged(); haptic('ok');
      toast(T('{name} : exemplaires répartis', { name }), { label: T('Annuler'), fn: () => { const c = COLL.map[k]; if (!c) return; const nx = collFromLines(c, before); if (nx) { COLL.map[k] = nx; collChanged(); } } });
    });
  });
}

/* ── Cartes imprimées une seule fois (en papier) : leur édition est forcément celle-là, posée d'office sur les lignes sans édition ──────────
   COLL.solo (gardé sur l'appareil) : clé → 'set|num' (une seule impression), '' (plusieurs), '-' (attribution annulée : plus jamais d'office).
   Scryfall « paperprints=1 » par lots de noms (≈ 30 par requête) ; une carte vue deux fois dans la réponse n'est pas retenue. */
const COLL_SOLO_KEY = 'coll:solo';
let soloT = 0, soloRun = null;
function collSoloSoon(ms = 2500) { clearTimeout(soloT); soloT = setTimeout(() => { collSolo().catch(() => {}); }, ms); }
/** Lignes sans édition d'une carte. */
const collNoEd = x => collLines(x).some(([g]) => !lineEd(g));
async function collSolo() {
  if (soloRun || COLL.enrich || collOffline() || scryLeft() > 0) return;
  if (!COLL.soloLoaded) { COLL.soloLoaded = true; try { const m = await Cache.get(COLL_SOLO_KEY, 400 * DAY); if (m && typeof m === 'object') COLL.solo = { ...m, ...COLL.solo }; } catch (e) { /* cache absent */ } }
  const todo = Object.keys(COLL.map).filter(k => COLL.meta[k] && !BASIC_NAMES.has(k) && !(k in COLL.solo) && collNoEd(COLL.map[k]) && !COLL.map[k].n.includes('"'));
  soloRun = (async () => {
    if (todo.length) {
      try {
        const got = await scrySolo(todo.map(k => COLL.map[k].n));
        for (const k of todo) { const p = got.found.get(k); if (p) { const e = edKey(p.set, p.num); COLL.solo[k] = e; edPut(e, p); } else if (got.seen.has(k)) COLL.solo[k] = ''; }
        Cache.set(COLL_SOLO_KEY, COLL.solo); collMetaSave();
      } catch (e) { /* hors ligne, pause Scryfall : au prochain essai */ }
    }
    collSoloApply();
  })().finally(() => { soloRun = null; });
  return soloRun;
}
/** Pose l'édition unique sur les lignes sans édition des cartes concernées ; une seule écriture, annulable. */
function collSoloApply() {
  const before = {}, m = { ...COLL.map }; let n = 0;
  for (const [k, x] of Object.entries(COLL.map)) {
    const e = COLL.solo[k]; if (!e || e === '-' || !collNoEd(x)) continue;
    const lines = []; for (const [g, q] of collLines(x)) { const to = lineEd(g) ? g : lineKey(lineLang(g), e, lineFoil(g), lineAw(g)), t = lines.find(y => y[0] === to); if (t) t[1] += q; else lines.push([to, q]); }
    before[k] = x; m[k] = collFromLines(x, lines); n++;
  }
  if (!n) return 0;
  COLL.map = m; collChanged({ paint: false }); collPaintSoon();
  toast(TN(n, '{n} carte imprimée une seule fois : son édition est posée', '{n} cartes imprimées une seule fois : leur édition est posée', { n }), { label: T('Annuler'), fn: () => {
    const r = { ...COLL.map }; for (const k in before) { r[k] = before[k]; COLL.solo[k] = '-'; }
    COLL.map = r; Cache.set(COLL_SOLO_KEY, COLL.solo); collChanged();
  } });
  return n;
}

/** Aperçu en grand d'une ligne de la collection (it.coll : { k, g }) : l'impression p de la liste « Illustrations » devient l'édition de la ligne ('' : sans édition).
 *  L'élément de l'aperçu suit (ligne, extension, prix). */
function collPickEd(it, p) {
  const { k, g } = it.coll, e = p ? edKey(p.set, p.num) : ''; if (p && !e) return;
  const l = lineLang(g), info = p ? edInfoOf(p, l) : null;
  const g2 = collSetEd(k, g, e, info), nx = collViewItem(k, g2);
  if (nx) Object.assign(it, nx); else it.coll = { k, g: g2 };
  if (COLL.el) collPaintSoon();
}

/* ── Langue des cartes : une langue par carte (la dernière scannée l'emporte), image dans cette langue ───── */
const liKey = (l, k) => l + '|' + k;
/** Image à afficher : celle de la langue de la carte si Scryfall l'a, sinon l'anglaise. Retourne { src, lang } (lang : langue réellement montrée). */
function collImage(k, l, en) {
  if (l && l !== 'en') { const u = COLL.li[liKey(l, k)]; if (u) return { src: u, lang: l }; }
  return { src: en || '', lang: 'en' };
}
/** Langues à lire sur Scryfall : clés de cartes de langue ≠ anglais dont l'image n'a pas encore été cherchée. */
function collLangMissing() {
  const by = {};
  for (const [k, x] of Object.entries(COLL.map)) for (const l of new Set(collLines(x).map(e => lineLang(e[0])))) if (l && l !== 'en' && SCRY_LANG[l] && !(liKey(l, k) in COLL.li)) (by[l] = by[l] || []).push(k);
  return by;
}
const collLangMissingCount = () => Object.values(collLangMissing()).reduce((a, x) => a + x.length, 0);
/** Cherche l'image d'une carte dans une langue (carte du scan, pas encore dans la collection), puis repeint. */
async function langImgFor(k, name, l) {
  if (!l || l === 'en' || !SCRY_LANG[l] || (liKey(l, k) in COLL.li)) return;
  try { const got = await scryLangImages([name], l); COLL.li[liKey(l, k)] = got.get(k) || ''; collMetaSave(); scanPaintList(); collPaintSoon(); } catch (e) { /* pas d'image dans cette langue pour l'instant : on garde l'anglaise */ }
}
/** Change la langue d'une ligne de la collection ('' = non précisée) ; elle garde son édition. from : la ligne concernée (clé ; sans lui : la plus fournie). Si la carte a déjà une ligne dans la nouvelle langue (et la même édition), les exemplaires s'y ajoutent. */
function collSetLang(k, l, from) {
  const cur = COLL.map[k]; if (!cur) return;
  const lines = collLines(cur).map(e => e.slice()), src = from === undefined ? collDomLang(lines) : from, dst = lineKey(l, lineEd(src), lineFoil(src), lineAw(src));
  if (src === dst) return;
  const i = lines.findIndex(e => e[0] === src); if (i < 0) return;
  const q = lines[i][1]; lines.splice(i, 1);
  const to = lines.find(e => e[0] === dst); if (to) to[1] += q; else lines.push([dst, q]);
  COLL.map[k] = collFromLines(cur, lines); collChanged({ paint: false }); collEnrich();
}

/** Toute modification passe par ici : enregistre, envoie au compte, met à jour la page de saisie et la recherche en cours. */
function collChanged(o = {}) {
  COLL.u = Date.now(); COLL.seq++; collWrite(); if (typeof prgSoon === 'function') prgSoon('coll');      // nouveaux badges de collection (progress.js) : changement fait ici
  if (o.push !== false) { const t = Date.now(); COLL.chg = COLL.chg.filter(x => t - x < COLL_PUSH.win); COLL.chg.push(t); collPushSoon(); }
  if (o.paint !== false) collPaint(); else collPaintHead();
  paintCollSection(); refreshDeck(); alSoon(); trSoon(); edSoon();
  if (typeof csSoon === 'function') csSoon();      // fiche d'une carte ouverte (cardsheet.js) : ses exemplaires suivent
  if (S.run && S.view === 'results') scheduleRecompute(true);
}
/** Après un changement : prix des éditions jamais lues (import, scan, choix d'une illustration), en un lot, un peu plus tard. */
let edT = 0;
function edSoon() { clearTimeout(edT); edT = setTimeout(() => { if (collEds(true).some(e => !COLL.ed[e])) edRefresh(); if (COLL.soloLoaded) collSoloSoon(400); }, 1200); }      // nouvelles cartes : impression unique ?
function collAdd(items, mode) { COLL.map = mergeColl(COLL.map, items, mode); collChanged(); }
/** Confirmation avant de retirer un exemplaire (« − » de la liste Cartes ou du scan) : petite fiche, jamais de confirm() natif. where : 'coll' | 'scan'. */
function confirmMinus(name, q, where, onOk, line) {
  const last = q <= 1, scan = where === 'scan';
  openSheet(last ? (scan ? T('Retirer cette carte ?') : T('Retirer de la collection ?')) : T('Retirer un exemplaire ?'), '', api => {
    api.body.innerHTML = `<p class="cf-msg"><b>${esc(name)}</b>${last ? (scan ? T('Dernier exemplaire : la carte sort de la liste du scan.') : line ? T('Dernier exemplaire {line} : cette ligne sort de ta collection (la carte reste dans les autres langues).', { line }) : T('Dernier exemplaire : la carte sort de ta collection.')) : T('Il en restera {a} sur {b}.', { a: nf0(q - 1), b: nf0(q) })}</p>`;
    api.setFoot(`<button class="btn ghost" type="button" data-close>${T('Annuler')}</button><button class="btn danger" type="button" data-ok>${T('Retirer')}</button>`);
    api.foot.addEventListener('click', e => { if (e.target.closest('[data-ok]')) { api.close(); onOk(); } });
  });
}
/** +/− d'exemplaires d'une carte. o.lang : la ligne concernée (clé : langue, ou langue|édition) ; sans lui, la langue la plus fournie de la carte, sans édition (« non précisée » pour une carte neuve). À 0 la ligne disparaît, puis la carte. Retourne les exemplaires de la ligne (0 : retirée). */
function collBump(k, name, d, o) {
  const cur = COLL.map[k], lines = collLines(cur).map(e => e.slice()), lang = o && o.lang !== undefined ? o.lang : collMainLang(lines);
  const e = lines.find(x => x[0] === lang), q = Math.max(0, Math.min(9999, (e ? e[1] : 0) + d));
  if (e) e[1] = q; else if (q) lines.push([lang, q]);
  const next = collFromLines({ ...(cur || {}), n: (cur && cur.n) || name, ...(cur ? {} : { d: (o && o.date) || dateNowSec() }) }, lines);      // date d'ajout : à l'entrée de la carte (o.date : celle qu'elle avait avant un retrait annulé)
  if (next) COLL.map[k] = next; else delete COLL.map[k];
  collChanged(o); return q;
}

/* ── Compte (Firestore users/{uid}/meta/collection) : plusieurs appareils, une même collection ─────────────────────
   Pas d'horloge ni de « dernier qui écrit gagne » : chaque appareil garde BASE (le dernier état du compte qu'il a vu) et fusionne carte par carte
   (merge3 : base · appareil · compte). Envoi = transaction (lire le compte, fusionner, écrire) : deux appareils qui envoient en même temps ne s'écrasent pas.
   Réception = fusion avec ce qui n'est pas encore parti. Hors ligne : tout reste ici, et repart au retour du réseau. */
const collClone = m => { const o = {}; for (const k in m) o[k] = { ...m[k] }; return o; };
const collDocClone = d => collDoc(collClone(d.map), collClone(d.prox), collClone(d.places));
/** Cet appareil a-t-il des changements pas encore dans le compte ? */
const collUnsynced = () => !COLL.base || !sameDoc(collDocNow(), COLL.base);
const collOffline = () => typeof navigator !== 'undefined' && navigator.onLine === false;
/** Envoi groupé. Un envoi = une transaction : 1 lecture + 1 écriture, et 1 lecture de plus pour chaque appareil qui suit le compte (quota Firestore).
 *  Changement isolé : parti 0,7 s après le dernier. Rafale (n changements en win ms : scan mobile reçu sur le PC, page « Ajouter des cartes ») :
 *  au plus un envoi toutes les burst ms, chacun emportant tout ce qui s'est accumulé. Jamais perdu : tout est déjà sur l'appareil (collWrite),
 *  et l'envoi en attente part tout de suite si l'appli passe en arrière-plan ou se ferme (collSleep) ou à la déconnexion (syncFlush). */
const COLL_PUSH = { quick: 700, burst: 6000, win: 20000, n: 3 };
function collPushSoon() {
  if (cloudOn() && D.cloud.txColl && COLL.cloud !== 'error') COLL.cloud = collOffline() ? 'offline' : 'sync';
  const now = Date.now(), burst = COLL.chg.filter(t => now - t < COLL_PUSH.win).length >= COLL_PUSH.n;
  if (!burst) { clearTimeout(COLL.pushT); COLL.pushT = setTimeout(collPush, COLL_PUSH.quick); return; }
  if (COLL.pushT) return;      // rafale : l'envoi déjà prévu emportera aussi ce changement
  COLL.pushT = setTimeout(collPush, Math.max(COLL_PUSH.quick, COLL.pushAt + COLL_PUSH.burst - now));
}
function collRetry(ms) { clearTimeout(COLL.retryT); COLL.retryT = setTimeout(() => { if (collUnsynced()) collPush(); else collPull(); }, ms); }
/** Envoi sans attendre le délai (syncFlush : arrière-plan, déconnexion). Un envoi déjà en cours est attendu, puis ce qui reste part aussitôt
 *  (changé pendant l'envoi : sinon il attendrait le délai de la rafale, et la déconnexion l'annulerait). */
async function collFlush() {
  for (let i = 0; i < 3; i++) {
    for (const t0 = Date.now(); COLL.pushing && Date.now() - t0 < 8000;) await sleep(40);
    if (!COLL.pushT || COLL.pushing) return;      // rien en attente (ou envoi bloqué : syncFlush ne l'attend pas plus de 3 s)
    await collPush();
  }
}
async function collPush() {
  clearTimeout(COLL.pushT); clearTimeout(COLL.retryT); COLL.pushT = COLL.retryT = 0;
  if (!cloudOn() || !D.cloud.txColl || acctHeld(D.user.uid)) return;                  // compte en cours de suppression (ici ou ailleurs) : rien ne part
  if (COLL.pushing) { COLL.again = true; return; }
  if (collOffline()) { COLL.cloud = 'offline'; collPaintHead(); return; }
  const uid = D.user.uid, id = ++COLL.runId;
  let used = null, merged = null, wrote = null, had = false;
  COLL.pushing = id; COLL.pushAt = Date.now(); COLL.again = false; COLL.cloud = 'sync'; COLL.err = ''; collPaintHead();
  try {
    await D.cloud.txColl(uid, rdoc => {
      if (acctHeld(uid) || (!rdoc && acctLost('collection', uid))) throw Object.assign(new Error('compte effacé ?'), { code: 'held' });      // effacé entre-temps : on ne le recrée pas
      had = !!rdoc;
      const remote = rdoc && typeof rdoc.text === 'string' ? collDocFromText(rdoc.text) : collDoc();
      used = collDocClone(collDocNow());
      merged = mergeDoc3(rdoc && COLL.s === uid ? COLL.base : null, used, remote);
      if (rdoc ? sameDoc(merged, remote) : sameDoc(merged, collDoc())) { wrote = null; return null; }              // le compte a déjà tout
      wrote = { text: collDocText(merged), count: Object.keys(merged.map).length, updatedAt: Math.max(Date.now(), (Number(rdoc && rdoc.updatedAt) || 0) + 1) };      // count : cartes, sans les proxys
      if (wrote.text.length > 900000) throw Object.assign(new Error('Collection trop grosse'), { code: 'too-big' });
      return wrote;
    });
    if (D.uid !== uid) return;
    if (had || wrote) acctSaw('collection', uid);
    if (wrote) COLL.ru = Math.max(COLL.ru, wrote.updatedAt);
    const before = collDocNow(), next = mergeDoc3(used, before, merged);                                                // + ce qui a été touché ici pendant l'envoi
    COLL.s = uid; COLL.base = merged; collDocSet(next); COLL.cloud = 'ok'; COLL.err = ''; COLL.live = true; collWrite();
    if (!sameDoc(before, next)) collRemoteApplied(before, next);
    if (collUnsynced()) COLL.again = true;
    collAsideSoon();
  } catch (err) {
    if (D.uid !== uid) return;
    const c = err && err.code;
    if (c === 'held') return;                                             // decks.js vérifie le compte, puis déconnecte ou relance la synchro
    if (c === 'permission-denied') { COLL.cloud = 'error'; COLL.err = T('Règles Firestore à publier pour la collection'); }
    else if (c === 'too-big') { COLL.cloud = 'error'; COLL.err = T('Collection trop grosse pour le compte'); }
    else if (c === 'unavailable' || collOffline()) { COLL.cloud = 'offline'; collRetry(COLL_RETRY.off); }
    else { COLL.cloud = 'error'; COLL.err = T('Synchronisation impossible'); collRetry(COLL_RETRY.err); }
  } finally {
    if (COLL.pushing === id) {
      COLL.pushing = 0;
      const d = COLL.deferred; COLL.deferred = null;
      if (d && D.uid === d[0]) collFromCloud(...d);
      if (COLL.again && COLL.cloud !== 'error' && COLL.cloud !== 'offline') collPushSoon();
      collPaintHead();
    }
  }
}
/** Lit le compte sur le serveur maintenant (retour au premier plan, bouton Réessayer). */
function collPull() {
  if (!cloudOn() || !D.cloud.pullColl || collOffline()) return;
  const uid = D.user.uid;
  D.cloud.pullColl(uid).then(r => { if (D.uid === uid) collFromCloud(uid, r.data, false, false, true); }).catch(() => { /* hors ligne : l'écoute reprendra seule */ });
}
const collSyncNow = () => { collPull(); if (collUnsynced() || COLL.cloud !== 'ok') collPush(); };
/** Appelée à chaque changement de compte (decks.js › onUser). */
function collUser(user) {
  if (COLL.unsub) { try { COLL.unsub(); } catch (e) { /* ignore */ } COLL.unsub = null; }
  clearTimeout(COLL.retryT); clearTimeout(COLL.liveT); clearTimeout(COLL.pushT); COLL.runId++; COLL.pushing = 0; COLL.deferred = null; COLL.again = false;
  COLL.cloud = 'off'; COLL.err = ''; COLL.live = false; COLL.ru = 0;
  if (!user || !D.cloud || !D.cloud.watchColl) { collPaintHead(); return; }
  if (COLL.s && COLL.s !== user.uid && collAside(COLL.s)) { collPaint(); paintCollSection(); }      // copie d'un autre compte : mise de côté, jamais envoyée d'office (voir collAside)
  COLL.cloud = 'sync';
  COLL.liveT = setTimeout(() => { if (!COLL.live && D.uid === user.uid && COLL.cloud === 'sync') { COLL.cloud = 'offline'; collPaintHead(); } }, COLL_RETRY.live);     // pas de réponse du serveur : hors ligne
  COLL.unsub = D.cloud.watchColl(user.uid, (data, pending, fromCache) => collFromCloud(user.uid, data, pending, fromCache), err => {
    COLL.cloud = 'error'; COLL.err = err && err.code === 'permission-denied' ? T('Règles Firestore à publier pour la collection') : T('Synchronisation impossible'); collPaintHead();
  });
}
/** Le compte a changé (ou premier état) : fusion avec cet appareil. fromCache : copie locale du SDK, jamais fiable pour fusionner ; pulled : lecture directe, peut arriver en retard. */
function collFromCloud(uid, data, pending, fromCache, pulled) {
  if (pending || D.uid !== uid) return;                                   // écho d'une écriture pas encore confirmée par le serveur
  if (COLL.pushing) { if (!pulled) COLL.deferred = [uid, data, pending, fromCache]; return; }                   // on fusionne d'abord ce qu'on envoie
  if (fromCache) { if (COLL.live && COLL.cloud === 'ok') { COLL.cloud = 'offline'; collPaintHead(); } return; }   // le serveur ne répond plus (ou pas encore) : on attend sa version
  const ru = Number(data && data.updatedAt) || 0;
  if (data && ru < COLL.ru) return;                                       // version plus ancienne que ce qu'on connaît (réponse arrivée en retard)
  COLL.live = true; COLL.cloud = 'ok'; COLL.err = '';
  if (data && typeof data.text === 'string') {
    acctSaw('collection', uid);
    const remote = collDocFromText(data.text), first = COLL.s !== uid, known = !first && !!COLL.base, before = collDocNow();
    const next = mergeDoc3(first ? null : COLL.base, before, remote);
    COLL.ru = Math.max(COLL.ru, ru); COLL.s = uid; COLL.base = remote; collDocSet(next); collWrite();
    if (!sameDoc(before, next)) collRemoteApplied(before, next, { first: first || !known, had: Object.keys(before.map).length });
    if (!sameDoc(next, remote)) collPushSoon();                          // il reste ici des changements pas encore dans le compte
  } else if (!data && acctLost('collection', uid)) { /* vu ici puis disparu : compte supprimé ailleurs ? rien n'est renvoyé (decks.js vérifie) */ }
  else if (!sameDoc(collDocNow(), collDoc())) { COLL.base = null; collPush(); }      // pas de document : on y envoie la collection de l'appareil
  else { COLL.s = uid; COLL.base = collDoc(); collWrite(); }
  collPaintHead(); collAsideSoon();
}
/** La collection de cet appareil vient de changer à cause du compte (autre appareil) : repeint, lit les infos des nouvelles cartes, prévient. before, after : collections complètes. */
function collRemoteApplied(b0, a0, o = {}) {
  const before = b0.map, after = a0.map; if (typeof prgAbsorbSoon === 'function') prgAbsorbSoon();      // badges de ces cartes : acquis sans bannière (gagnés ailleurs)
  collPaint(); paintCollSection(); refreshDeck(); trSoon(); if (S.run && S.view === 'results') scheduleRecompute(true);
  collEnrich();
  if (typeof streamOn === 'function' && streamOn()) return;      // mode streamer (opening.js) : aucune notification qui montrerait la collection
  let add = 0, del = 0;
  for (const k in after) if (!before[k]) add++;
  for (const k in before) if (!after[k]) del++;
  const n0 = Object.keys(before).length, plural = n => TN(n, '{n} carte', '{n} cartes', { n });
  if (del >= 10 && del * 2 >= n0) toast(TN(del, '{n} carte retirée depuis un autre appareil', '{n} cartes retirées depuis un autre appareil', { n: del }), { label: T('Annuler'), fn: () => { COLL.map = unionColl(COLL.map, before); collChanged(); } });
  else if (o.first && o.had) toast(T('Collection de l\'appareil et du compte fusionnées'));
  else if (o.first) toast(T('Collection de ton compte chargée : {cards}', { cards: plural(add) }));
  else if (add || del) toast(T('Autre appareil : {changes}', { changes: [add && '+' + plural(add), del && '−' + plural(del)].filter(Boolean).join(' · ') }));
}
/** Retour au premier plan / réseau revenu : on envoie ce qui attend et on relit le compte (les navigateurs mobiles endorment la connexion en arrière-plan). */
function collWake() { if (cloudOn()) collSyncNow(); collEnrichResume(); }
function collSleep() { if (typeof syncFlush === 'function') syncFlush(); else if (cloudOn() && COLL.pushT) collPush(); }       // on part : envoyer sans attendre le délai (collection, et les autres envois en attente)

/* ── Prix réels : l'offre CardTrader la moins chère de chaque carte, lue avec le moteur de la recherche ───────────
   Stockés à part (localStorage, sur cet appareil) : { clé: { p: centimes | null (aucune offre), t: date, s: critères, c: devise } }. */
function pxRead() { try { const r = JSON.parse(localStorage.getItem(PX_KEY) || 'null'); if (r && typeof r === 'object' && !Array.isArray(r)) COLL.px = r; } catch (e) { /* illisible : on repart de zéro */ } }
let pxT = 0;
function pxSave() {
  clearTimeout(pxT);
  pxT = setTimeout(() => { try { const keep = {}; for (const k in COLL.px) if (COLL.map[k]) keep[k] = COLL.px[k]; COLL.px = keep; localStorage.setItem(PX_KEY, JSON.stringify(keep)); } catch (e) { /* stockage plein : les prix restent en mémoire */ } }, 600);
}
const pxLangOf = x => x.l || S.opts.lang;
/** Cartes à lire (hors terrains de base) : f = { lang: '' toutes · 'none' sans langue · code, scope: 'old' à actualiser · 'all' }. Chaque carte est cherchée dans SA langue (sans langue : celle de la recherche). */
function pxTargets(f) {
  const out = [], now = Date.now();
  for (const [k, x] of Object.entries(COLL.map)) {
    if (BASIC_NAMES.has(k)) continue;
    if (f.lang === 'none' ? x.l : f.lang && x.l !== f.lang) continue;
    const lang = pxLangOf(x);
    if (f.scope === 'old' && !pxStale(COLL.px[k], pxSig(lang, S.opts), now, PX_TTL)) continue;
    out.push({ key: k, name: x.n, lang });
  }
  return out;
}
function pxError(e) {
  if (e.code === 'notoken') return T('Token CardTrader manquant.');
  if (e.code === 'auth') return authHint(e, 'CardTrader').msg;
  if (e.code === 'rate') return T('{host} limite les requêtes : réessaie dans une minute.', { host: /scryfall/.test(e.host || '') ? 'Scryfall' : 'CardTrader' });
  if (e.code === 'network') return e.offline ? T('Tu es hors ligne : reconnecte-toi puis relance (les cartes déjà lues sont gardées).') : T('Impossible de joindre {host}. Relance : les cartes déjà lues sont gardées.', { host: e.host || T('CardTrader ou Scryfall') });
  return T('Lecture des prix impossible : {msg}.', { msg: e.message || T('erreur inconnue') });
}
const PX_STEPS = { prints: T('impressions'), catalog: T('extensions'), offers: T('offres'), fallback: T('offres') };
/** Lit les prix réels de ces cartes (targets : [{ key, name, lang }]) par lots, une langue après l'autre (o.fresh : sans le cache du serveur). Progression dans la barre de la collection et en pastille flottante. */
async function pxRun(targets, o = {}) {
  if (COLL.pxRun || !targets.length) return;
  if (S.demo) { toast(T('Mode démo (serveur injoignable) : prix réels indisponibles pour l\'instant')); return; }
  if (S.run && S.run.status === 'running') { toast(T('Une recherche est en cours : attends sa fin')); return; }
  readOpts();
  // prix réels = offres CardTrader : sans token (ni compte autorisé sur le serveur), on explique au lieu d'envoyer vers une connexion qui ne mènera à rien
  if (!ctReady()) { ctGetSheet(() => pxRun(targets, o)); return; }      // prix réels = offres CardTrader : l'encart du token (lien, champ, « Tester »), puis la lecture
  if (!CTX.proxy && !CTX.token) { toast(T('Ajoute ton token CardTrader dans les réglages')); openSettings('prix'); return; }
  if (CTX.proxy && CTX.needsLogin && !(CTX.needsKey && CTX.appKey) && CTX.idToken && !(await CTX.idToken())) { toast(T('Connecte-toi pour lire les prix')); openAccount(); return; }
  const st = COLL.pxRun = { total: targets.length, done: 0, frac: 0, step: '', ctrl: new AbortController(), real: 0, none: 0, task: null };
  COLL.pxMsg = null;
  st.task = floatTask(T('Prix réels de la collection'), { total: st.total, sub: T('Démarrage…') }, () => !COLL.el || sheets.length > 0);
  const upd = () => { st.task.set(st.done, st.total, `${nf0(Math.floor(st.done))} / ${nf0(st.total)}${st.step ? ' · ' + st.step : ''}`); collPaintHead(); };
  const byLang = new Map(); for (const t of targets) { if (!byLang.has(t.lang)) byLang.set(t.lang, []); byLang.get(t.lang).push(t); }
  collPaintHead();
  try {
    for (const [lang, list] of byLang) for (let i = 0; i < list.length; i += PX_CHUNK) {
      const chunk = list.slice(i, i + PX_CHUNK), base = st.done, opts = { ...S.opts, lang, fallbackEn: false, skip: new Set(), fresh: !!o.fresh, push: null }, sig = pxSig(lang, opts);
      const hooks = {
        step: (id, state, d) => { if (state === 'run') { st.step = (PX_STEPS[id] || id) + (d ? ' ' + d : ''); upd(); } },
        progress: f => { st.done = Math.min(st.total, base + f * chunk.length); upd(); },
        rate() {}, hint() {}, cacheAge() {}, needsEn: () => false,
        card: (key, p) => {
          const o = p.notFound ? null : cheapestOffer(p.offers, opts);
          COLL.px[key] = { p: o ? o.price : null, t: Date.now(), s: sig, c: o ? o.cur : '' };
          if (o) st.real++; else st.none++;
          pxSave(); collPaintSoon(); collPaintHead();
        },
      };
      await runLive(chunk.map(t => ({ key: t.key, name: t.name, qty: 1 })), opts, hooks, st.ctrl.signal);
      st.done = base + chunk.length; upd();
    }
    const got = TN(st.real, '{n} carte', '{n} cartes') + (st.none ? ' · ' + T('{n} sans offre', { n: nf0(st.none) }) : '');
    COLL.pxMsg = { t: T('Prix réels à jour : {cards}', { cards: got }), bad: false };
    st.task.finish(T('Prix réels à jour'), 'ok', got);
  } catch (e) {
    const n = st.real + st.none;
    if (e.name === 'AbortError') { COLL.pxMsg = { t: T('Lecture interrompue : {cards}', { cards: TN(n, '{n} carte lue', '{n} cartes lues') }), bad: false }; st.task.finish(T('Prix réels interrompus'), 'warn', T('{n} cartes lues', { n: nf0(n) })); }
    else { const m = pxError(e); COLL.pxMsg = { t: m + (n ? ' (' + TN(n, '{n} carte déjà lue', '{n} cartes déjà lues') + ')' : ''), bad: true }; st.task.finish(T('Prix réels : échec'), 'bad', m); }
  } finally {
    COLL.pxRun = null; pxSave(); collPaintHead(); if (COLL.el) collPaintBody(true); paintCollSection();
  }
}
/** Feuille « Prix réels » : choix de la langue des cartes et de la portée, puis lancement. */
function openCollPrices() {
  if (COLL.pxRun) { toast(T('Lecture des prix déjà en cours')); return; }
  if (!collCount()) { toast(T('Ta collection est vide')); return; }
  readOpts();
  openSheet(T('Prix réels'), T('L\'offre CardTrader la moins chère, comme pour acheter'), api => {
    const counts = {}; let none = 0, all = 0;
    for (const [k, x] of Object.entries(COLL.map)) { if (BASIC_NAMES.has(k)) continue; all++; if (x.l) counts[x.l] = (counts[x.l] || 0) + 1; else none++; }
    const opt = (v, t) => `<option value="${v}">${esc(t)}</option>`, LN = l => { const s = T(LANGS[l]); return s[0].toUpperCase() + s.slice(1); };
    const crit = [T(LANGS[S.opts.lang]), T('état ≥ {c}', { c: COND_SHORT[S.opts.cond] || S.opts.cond }), S.opts.foil === 'no' ? T('non foil') : S.opts.foil === 'yes' ? 'foil' : T('foil ou non'), S.opts.mode === 'zero' ? 'CardTrader Zero' : 'Direct'];
    api.body.innerHTML = `<p class="hint">${T('Pour chaque carte, Mana Orbit lit l\'offre la moins chère aujourd\'hui (même moteur que la recherche) et garde ce prix dans ta collection : il remplace l\'estimation Cardmarket pour la valeur, le tri par prix et « les plus chères ». Les terrains de base sont ignorés.')}</p>
      <div class="ctl"><label class="label" for="pxLang">${T('Langue des cartes')}</label><div class="sel"><select id="pxLang">${opt('', T('Toutes ({n})', { n: all }))}${CARD_LANG_LIST.filter(l => counts[l]).map(l => opt(l, `${LN(l)} (${counts[l]})`)).join('')}${none ? opt('none', T('Sans langue ({n}) · cherchées en {lang}', { n: none, lang: T(LANGS[S.opts.lang]) })) : ''}</select></div></div>
      <div class="seg" id="pxScope" role="radiogroup" aria-label="${T('Portée')}"></div>
      <div class="ci-sum" id="pxSum"></div>
      <p class="hint">${T('Chaque carte est cherchée dans sa langue. Critères repris de la recherche : <b>{crit}</b>. La lecture se fait carte par carte (comme une recherche) : compte quelques secondes par dizaine de cartes.', { crit: esc(crit.join(' · ')) })}</p>`;
    api.setFoot(`<button class="btn ghost" type="button" data-close>${T('Annuler')}</button><button class="btn" type="button" id="pxGo">${T('Lire les prix')}</button>`);
    mountSeg($('#pxScope', api.body), [{ v: 'old', label: T('À actualiser') }, { v: 'all', label: T('Toutes') }], 'old', () => paint());
    const sel = $('#pxLang', api.body), sum = $('#pxSum', api.body), go = $('#pxGo', api.foot);
    let targets = [];
    const paint = () => {
      const f = { lang: sel.value, scope: $('#pxScope', api.body)._v || 'old' }; targets = pxTargets(f);
      const pool = pxTargets({ lang: f.lang, scope: 'all' }), have = pool.filter(t => COLL.px[t.key] && COLL.px[t.key].t), last = have.reduce((a, t) => Math.max(a, COLL.px[t.key].t), 0);
      sum.className = 'ci-sum'; sum.innerHTML = `<div>${TN(targets.length, '<b>{n}</b> carte à lire sur {total}', '<b>{n}</b> cartes à lire sur {total}', { total: nf0(pool.length) })}</div><span>${have.length ? TN(have.length, '{n} déjà lue · dernière lecture {ago}', '{n} déjà lues · dernière lecture {ago}', { ago: pxAgo(last) }) : T('Aucun prix lu pour l\'instant')}</span>`;
      go.disabled = !targets.length; go.textContent = targets.length ? T('Lire {n} prix', { n: nf0(targets.length) }) : T('Rien à lire');
    };
    sel.onchange = paint; paint();
    go.onclick = () => { if (!targets.length) return; const all = $('#pxScope', api.body)._v === 'all'; api.close(); haptic('ok'); pxRun(targets, { fresh: all }); };      // « Toutes » : relecture voulue, on ignore le cache de 10 min du serveur
  });
}
function pxAgo(t) {
  const m = Math.round((Date.now() - t) / 60000);
  return m < 2 ? T('à l\'instant') : m < 90 ? T('il y a {n} min', { n: m }) : m < 36 * 60 ? T('il y a {n} h', { n: Math.round(m / 60) }) : T('il y a {n} j', { n: Math.round(m / 1440) });
}

/* ── Infos Scryfall ───────────────────────────────────────────────────────────────────────────── */
/** Cartes dont les infos manquent, ou datent d'avant l'identité de couleur / « peut être commandant » (relues une fois). */
const collMissing = () => Object.keys(COLL.map).filter(k => !(k in COLL.meta) || (COLL.meta[k] && COLL.meta[k].ci === undefined));
/** Lit sur Scryfall le coût, le type, les couleurs, l'image et le prix de référence des cartes qui n'ont pas encore ces infos (75 par requête),
 *  puis les images des cartes qui ne sont pas en anglais, dans leur langue (12 par requête). */
async function collEnrich() {
  if (collEds(true).some(e => !COLL.ed[e])) edRefresh();      // éditions jamais lues (import, autre appareil, choix d'une illustration) : leur prix, à part
  if (COLL.enrich) return COLL.enrich.p;
  const miss = collMissing(), lm = collLangMissing(), lmN = Object.values(lm).reduce((a, x) => a + x.length, 0); if (!miss.length && !lmN) return;
  if (scryLeft() > 0) { COLL.enrichErr = T('Scryfall demande une pause : réessaie dans {s} s', { s: Math.ceil(scryLeft() / 1000) }); collPaintHead(); return; }
  const full = miss.length > 0 && miss.length >= collCount();      // toute la collection relue : les prix Cardmarket sont à jour
  const st = COLL.enrich = { done: 0, total: miss.length + lmN, ctrl: new AbortController(), ph: miss.length ? 'info' : 'img', wait: '' };
  st.tick = setInterval(() => { const w = collScryWait(); if (w !== st.wait) { st.wait = w; collPaintHead(); } }, 1000);      // pause de la file : décompte chaque seconde
  COLL.enrichErr = '';
  st.p = (async () => {
    try {
      for (let i = 0; i < miss.length; i += 75) {
        const chunk = miss.slice(i, i + 75), got = await scryCollection(chunk.map(k => COLL.map[k] ? COLL.map[k].n : k), st.ctrl.signal);
        for (const k of chunk) { const g = got.get(k), old = COLL.meta[k]; COLL.meta[k] = g || (old ? { ...old, ci: old.ci ?? '' } : null); if (g && typeof prcOver === 'function') prcOver(k); }      // prix du relevé partagé du compte, s'il y en a un
        st.done = Math.min(miss.length, i + 75); collMetaSave(); collPaintHead(); collPaintSoon();
      }
      if (full) COLL.freshAt = Date.now();
      st.ph = 'img';
      for (const [l, keys] of Object.entries(lm)) {
        const base = st.done;
        const got = await scryLangImages(keys.map(k => COLL.map[k] ? COLL.map[k].n : k), l, st.ctrl.signal, n => { st.done = base + n; collPaintHead(); });
        for (const k of keys) COLL.li[liKey(l, k)] = got.get(k) || '';
        st.done = base + keys.length; collMetaSave(); collPaintHead(); collPaintSoon(); scanPaintList();
      }
    } catch (e) { if (e.name !== 'AbortError') COLL.enrichErr = e.code === 'rate' ? T('Scryfall limite les requêtes : réessaie dans une minute') : e.offline || collOffline() ? T('Hors ligne : la lecture reprendra au retour du réseau') : T('Scryfall injoignable : réessaie plus tard'); }
    finally {
      clearInterval(st.tick); COLL.enrich = null; VAL.memo = null; collMetaSave(); collPaintHead(); if (COLL.el) collPaintBody(true);
      if (!COLL.enrichErr && !st.ctrl.signal.aborted && (collMissing().length || collLangMissingCount())) setTimeout(collEnrich, 50);      // cartes ajoutées ou langues changées pendant la lecture : on enchaîne
      else if (!COLL.enrichErr && !st.ctrl.signal.aborted) { valMaybe(); collSoloSoon(); }
    }
  })();
  collPaintHead();
  return st.p;
}
/** Lecture des infos arrêtée par une erreur (réseau coupé, Scryfall injoignable ou en pause) : reprise au retour du réseau ou au premier plan (collWake), une fois la pause Scryfall finie. */
function collEnrichResume() {
  clearTimeout(COLL.resumeT); COLL.resumeT = 0;
  if (!COLL.enrichErr || COLL.enrich || collOffline() || !(collMissing().length || collLangMissingCount())) return;
  const wait = scryLeft(); if (wait > 0) { COLL.resumeT = setTimeout(collEnrichResume, wait + 500); return; }
  COLL.enrichErr = ''; collEnrich();
}

/** Catalogue des noms de cartes (Scryfall) : saisie assistée et reconnaissance OCR. Chargé une fois, gardé 14 jours. */
function collCatalog() {
  if (COLL.names) return Promise.resolve(COLL.names);
  if (!COLL.namesP) COLL.namesP = scryCatalogNames().then(list => { COLL.names = { list, idx: nameIndex(list), norm: list.map(n => normPart(n)) }; return COLL.names; }).catch(e => { COLL.namesP = null; throw e; });
  return COLL.namesP;
}
/* ── Noms imprimés de toutes les langues pour la saisie (« Ajouter des cartes », « Ajouter une carte ») : names-all.tsv (anglais, fr, de, es, it, pt), le fichier du scan.
   Gardé sur l'appareil (téléchargé par le scan, sinon ici à la première recherche qui en a besoin, hors réseau mobile) ; index construit par tranches, gardé en mémoire
   tant que l'appli est ouverte (≈ 150 000 noms : clés normalisées + renvoi à la ligne du fichier). Carte choisie par son nom italien (allemand…) : exemplaire dans cette langue. */
const NMX = { ks: null, refs: null, rows: null, langs: null, p: null, fail: 0 };
function nmxLoad() {
  if (NMX.ks) return Promise.resolve(true);
  if (NMX.p) return NMX.p;
  if (Date.now() - NMX.fail < 60000) return Promise.resolve(false);
  NMX.p = (async () => {
    let t = await namesAllText().catch(() => null);
    if (!t && !frcMetered() && navigator.onLine !== false && (await namesAllFetch().catch(() => 0))) t = await namesAllText().catch(() => null);
    if (!t) { NMX.fail = Date.now(); return false; }
    const rows = t.split('\n'), langs = rows[0] && rows[0][0] === '#' ? rows[0].split('\t').slice(1).map(x => x.trim()) : NAMES_LANGS, ks = [], refs = [];
    for (let i = 0; i < rows.length; i += 2000) {
      for (let j = i, end = Math.min(rows.length, i + 2000); j < end; j++) {
        const r = rows[j]; if (!r || r[0] === '#') continue;
        const c = r.split('\t');
        for (let col = 1; col < c.length && col < 8; col++) {
          if (!c[col] || !NAMES_LANGS.includes(langs[col - 1])) continue;
          const ps = c[col].split('|'); for (let x = 0; x < ps.length && x < 8; x++) { const k = ps[x] && normPart(frFront(ps[x])); if (k && k.length >= 2) { ks.push(k); refs.push(j * 64 + col * 8 + x); } }
        }
      }
      await new Promise(r => setTimeout(r, 0));      // l'écran respire
    }
    Object.assign(NMX, { rows, langs, ks, refs }); return true;
  })().catch(() => { NMX.fail = Date.now(); return false; }).finally(() => { NMX.p = null; });
  return NMX.p;
}
/** Entrée i de l'index : { n (anglais), p (imprimé), l (langue) }. */
function nmxAt(i) {
  const r = NMX.refs[i], c = NMX.rows[Math.floor(r / 64)].split('\t'), col = (r >> 3) & 7, p = (c[col] || '').split('|')[r & 7] || '';
  return c[0] && p ? { n: c[0], p: frFront(p), l: NMX.langs[col - 1] } : null;
}
/** Suggestions de noms pour un texte saisi : anglais, langue des noms de l'appli (index chargé), puis les autres langues (names-all.tsv, chargé à la première recherche
 *  qui trouve peu) ; commence par · contient tous les mots. [{ n (anglais), p? (nom imprimé, quand c'est lui qui correspond), l? (sa langue, hors langue des noms) }], une fois par carte.
 *  again : rappelé quand l'index des autres langues arrive (la liste se repeint). */
function collSuggestX(cat, text, n = 12, again) {
  const q = normPart(text); if (q.length < 2) return [];
  if (!FRX.ix) frLoad();      // noms français : dès que l'index est là (la frappe suivante en profite)
  const words = q.split(' ').filter(Boolean), ex = [], a = [], b = [], seen = new Set();
  const take = (arr, x) => { const k = ownKey(x.n); if (!seen.has(k)) { seen.add(k); arr.push(x); } };
  const tier = (s, x, loose) => { if (s === q) take(ex, x); else if (s.startsWith(q)) { if (a.length < n) take(a, x); } else if (b.length < n && (loose ? words.every(w => s.includes(w)) : wordsAt(s, words))) take(b, x); };      // nom exact · commence par · contient les mots
  for (let i = 0; i < cat.norm.length; i++) tier(cat.norm[i], { n: cat.list[i] }, true);
  const fl = FRX.ix ? FRX.ix.list : [];
  for (let i = 0; i < fl.length; i++) { const e = fl[i]; tier(e.k, { n: e.en, p: e.n }, true); }
  if (NMX.ks) {      // autres langues : quand l'anglais et la langue des noms trouvent peu ; mots tapés = débuts de mots du nom (« elfos de llan »)
    const loose = !ex.length && !a.length;      // nom anglais (français…) déjà trouvé par son début : pas de « contient » des autres langues (« sol r » ≠ « Rituel solennel »)
    if (ex.length + a.length + b.length < 6) for (let i = 0, ks = NMX.ks; i < ks.length; i++) {
      const s = ks[i]; if (!(s === q || (a.length < n && s.startsWith(q)) || (loose && b.length < n && wordsAt(s, words)))) continue;
      const x = nmxAt(i); if (x && (loose || s === q || s.startsWith(q))) tier(s, x.l === FRX.l && FRX.ix ? { n: x.n, p: x.p } : x, false);
    }
  } else if (q.length >= 3 && ex.length + a.length + b.length < 3) nmxLoad().then(ok => { if (ok && again) again(); });      // peu ou rien trouvé : les autres langues (puis la liste se repeint)
  return ex.concat(a, b).slice(0, n);
}
/** Chaque mot tapé commence un mot du nom (normalisé). */
const wordsAt = (s, words) => { const ws = s.split(' '); return words.every(w => ws.some(x => x.startsWith(w))); };
/** Mêmes suggestions, noms anglais seuls (liste de souhaits, éditeur de deck) : un nom français tapé y trouve aussi sa carte. */
const collSuggest = (cat, text, n = 12) => collSuggestX(cat, text, n).map(x => x.n);
/** Libellé HTML (échappé) d'une suggestion : le nom imprimé français, l'anglais en petit, quand c'est le français qui correspond au texte tapé ; sinon le nom anglais.
 *  p : nom français déjà connu (collSuggestX) ; sans lui, retrouvé depuis le nom anglais et le texte q. */
function sugHtml(n, q, p, l) {
  if (p === undefined) {
    const f = enToFr(n), t = normPart(q), w = t.split(' ').filter(Boolean), hit = s => !!t && (s.startsWith(t) || w.every(x => s.includes(x)));
    p = f && hit(normPart(f)) && !hit(normPart(n)) ? f : '';
  }
  return p ? `${l ? flag(l) + ' ' : ''}${esc(p)} <small class="ca-en">${esc(n)}</small>` : esc(n);      // l : nom d'une autre langue que celle de l'appli (drapeau)
}

/* ── Section de la page de saisie ─────────────────────────────────────────────────────────────── */
function paintCollSection() {
  const sub = $('#collSub'); if (!sub) return;
  const n = collCount();
  const al = n ? valAlertN() : 0;
  sub.textContent = n ? TN(n, '{n} carte', '{n} cartes') + ' · ' + TN(collCopies(), '{n} exemplaire', '{n} exemplaires') + (al ? ' · ' + TN(al, '{n} prix a bougé', '{n} prix ont bougé') : '') : T('Ajoute tes cartes (import, photo, saisie) : elles seront déduites du panier.');
  $('#btnColl').dataset.empty = n ? '0' : '1';
  homeSoon();
}
function collInit() {
  collRead(); pxRead(); paintCollSection(); collMetaLoad();
  document.addEventListener('visibilitychange', () => { if (document.hidden) collSleep(); else collWake(); });
  window.addEventListener('online', collWake);
  window.addEventListener('offline', () => { if (cloudOn() && COLL.cloud !== 'error') { COLL.cloud = 'offline'; collPaintHead(); } });
  window.addEventListener('pagehide', collSleep);
  const sec = $('#collSec'); if (sec) sec.hidden = false;
  setTimeout(() => frLoad(true), 2500);      // noms français déjà sur l'appareil (scan, collection) : prêts pour une decklist française, sans aucune requête
}

/* ── Écran « Ma collection » ──────────────────────────────────────────────────────────────────── */
/* ── Noms français : une carte marquée FR s'affiche sous son nom imprimé (« Anneau solaire »), les autres sous leur nom anglais ───── */
const FRN = { map: null, p: null, fail: 0, local: false, on: new Set() };
/** Nom imprimé français d'une carte, quelle que soit la langue de l'exemplaire ('' si le catalogue ne la connaît pas) : sert à la recherche (« anneau solaire » trouve aussi une Sol Ring anglaise). */
function frOf(k) {
  const m = FRN.map || (typeof FRC !== 'undefined' && FRC.cat && FRC.cat.fr) || null;
  return (m && m.get(k)) || '';
}
/** Nom affiché d'une ligne de la collection : l'imprimé français pour un exemplaire FR ('' si la carte n'est pas FR ou si le catalogue ne la connaît pas).
 *  Même chose dans la langue du catalogue chargé (exemplaire allemand → nom allemand) ; frOf donne alors le nom dans cette langue. */
const frName = (k, l) => (l && l === FRX.l ? frOf(k) : '');
/** Langue des noms imprimés reconnus (core.js › namesLangOf) : celle des cartes cherchées, sinon français pour l'interface française ; '' : aucun catalogue (cartes anglaises). */
const namesLang = () => namesLangOf(S.opts.lang, I18N.lang);
/** Passe au catalogue d'une autre langue : un seul en mémoire, l'ancien est oublié (index, noms affichés, catalogue du scan, recherches du scan). */
function namesSwitch(l) {
  if (l === FRX.l) return;
  FRX.ix = null; FRX.l = l; FRN.map = null; FRN.fail = 0; FRN.p = null;
  if (typeof FRC !== 'undefined') { FRC.cat = null; FRC.at = 0; FRC.state = 'idle'; FRC.p = null; }
  if (typeof FR_CACHE !== 'undefined') FR_CACHE.clear();
}
/** Langue des cartes changée (critères) : le catalogue de la nouvelle langue est chargé, et la liste, la collection et le scan suivent. */
function namesSync() {
  const l = namesLang(); if (l === FRX.l) return;
  namesSwitch(l); collPaint(); if (typeof refreshDeck === 'function') refreshDeck();      // l = '' (cartes anglaises) : catalogue oublié, aucun autre chargé
  if (l) frLoad();
}
/** Texte qui nomme la langue des noms reconnus : fr (texte d'origine, catalogue français), other ({lang} : allemand…), none (cartes anglaises, aucun catalogue ; sinon fr). */
const nmT = (fr, other, none, v) => { const l = namesLang(); return l === 'fr' ? T(fr, v) : l ? T(other, { ...v, lang: LANGS[l] || l }) : T(none || fr, v); };
/** Exemple des champs de saisie : « Sol Ring ou Anneau solaire » ; autre langue : Lightning Bolt et son nom imprimé (« Blitzschlag ») ; one : le nom imprimé seul (import). */
const NM_EX = { de: 'Blitzschlag', es: 'Rayo', it: 'Fulmine', pt: 'Relâmpago', ru: 'Молния' };
function nmExample(one) {
  const l = namesLang();
  if (l === 'fr') return one ? 'Anneau solaire' : T('Sol Ring ou Anneau solaire');
  if (!l) return one ? 'Lightning Bolt' : 'Sol Ring';
  const p = NM_EX[l] || 'Lightning Bolt'; return one ? p : T('Lightning Bolt ou {name}', { name: p });
}
/** Charge l'index des noms français (affichage des cartes FR, noms français tapés dans une decklist, à l'import ou à la saisie) : catalogue déjà sur l'appareil, sinon fichier du site (1 requête, gardé ensuite).
 *  local : appareil seulement (démarrage : aucun réseau). Jamais les pages Scryfall ici : c'est le scan qui s'en charge. Index construit par tranches (≈ 31 000 noms) : l'écran ne fige pas. */
function frLoad(local) {
  const l = namesLang(); if (!l) return Promise.resolve(false);      // cartes anglaises : aucun catalogue
  namesSwitch(l);
  if (FRX.ix) return Promise.resolve(true);
  if (FRN.p) return FRN.local && !local ? FRN.p.then(ok => ok || frLoad()) : FRN.p;      // lecture locale en cours, réseau permis : on enchaîne
  if (!local && Date.now() - FRN.fail < 60000) return Promise.resolve(false);
  FRN.local = !!local;
  const p = FRN.p = (async () => {
    const rec = (await scryFrCached(l).catch(() => null)) || (local ? null : await scryFrStatic(undefined, l).catch(() => null));
    if (FRX.l !== l) return false;                                                     // langue changée entre-temps : ce catalogue ne sert plus
    if (!rec || FRX.ix) { if (!rec && !local) FRN.fail = Date.now(); return !!FRX.ix; }
    const ix = frIndex([]);
    for (let i = 0; i < rec.rows.length; i += 2500) { frIndex(rec.rows.slice(i, i + 2500), ix); await new Promise(r => setTimeout(r, 0)); }
    if (FRX.l !== l) return false;
    frUse(ix, l); FRN.map = ix.fr; frReady(); return true;
  })().catch(() => { if (!local && FRX.l === l) FRN.fail = Date.now(); return FRX.l === l && !!FRX.ix; }).finally(() => { if (FRN.p === p) FRN.p = null; });
  return p;
}
/** Index français prêt : les écrans qui l'attendaient se mettent à jour (collection, saisie de la decklist si aucune recherche n'est affichée, feuilles ouvertes). */
function frReady() {
  collPaint();
  if (typeof refreshDeck === 'function' && (!S.run || S.view === 'input')) refreshDeck();
  for (const f of [...FRN.on]) { try { f(); } catch (e) { /* feuille fermée entre-temps */ } }
}
/** Attend l'index en cours de chargement (au plus ms) : une recherche lancée juste après avoir collé une liste française la lit avec. */
const frWait = (ms = 4000) => (FRX.ix || !FRN.p ? Promise.resolve() : Promise.race([FRN.p, sleep(ms)]).catch(() => {}));
/** Noms imprimés dès que la collection a des cartes (affichage des cartes FR et recherche en français). */
function collFrLoad() { if (collCount()) frLoad(); }
const SORT_OPTS = [['name', T('Nom')], ['qty', T('Quantité')], ['price', T('Prix')], ['set', T('Édition')], ['new', T('Ajout : récentes en haut')], ['old', T('Ajout : anciennes en haut')]];
const isDateSort = () => COLL.sort === 'new' || COLL.sort === 'old';
/* ── Filtre « Ajoutées avant / depuis » (tri par date d'ajout seulement) : ligne sous « Trier », heure précise (datetime-local) ; la liste, le compte
   et les actions du bandeau d'un emplacement (« Ranger ces cartes… », « Retirer… ») ne voient que ces cartes — ex. rattraper un rangement raté
   depuis 10 h 24. Date d'ajout = première entrée de la carte dans la collection (un exemplaire ajouté plus tard ne la change pas). ── */
const collWhenOn = () => isDateSort() && !!COLL.when.dir && COLL.when.t > 0 && COLL.tab === 'list';
const collWhenVal = t => { const d = new Date(t * 1000), z = n => String(n).padStart(2, '0'); return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}T${z(d.getHours())}:${z(d.getMinutes())}`; };
function collWhenPaint(el, none) {
  const box = $('#collWhen', el); if (!box) return;
  const show = !none && COLL.mode === 'coll' && COLL.tab === 'list' && isDateSort() && !(typeof msActive === 'function' && msActive());
  box.hidden = !show; if (!show) return;
  if (!COLL.when.t) { const ds = Object.values(COLL.map).map(x => x.d || 0); COLL.when.t = Math.max(0, ...ds) || Math.floor(Date.now() / 1000); }      // par défaut : la dernière carte ajoutée
  const w = COLL.when, key = w.dir + '|' + w.t; if (box.dataset.k === key) return; box.dataset.k = key;
  box.innerHTML = `<label class="sortsel coll-wsel"><span>${T('Ajoutées')}</span><select id="collWhenDir" aria-label="${T('Filtrer par date d\'ajout')}"><option value="">${T('à toute date')}</option><option value="before">${T('avant')}</option><option value="after">${T('depuis')}</option></select></label><input type="datetime-local" class="coll-wt" id="collWhenT" aria-label="${T('Date et heure d\'ajout')}" value="${collWhenVal(w.t)}"${w.dir ? '' : ' disabled'}>`;
  $('#collWhenDir', box).value = w.dir;
  $('#collWhenDir', box).onchange = e => { COLL.when.dir = e.target.value; COLL.shown = COLL_PAGE; haptic('tap'); collPaintBody(false); };
  $('#collWhenT', box).onchange = e => { const t = Math.floor(new Date(e.target.value).getTime() / 1000); if (!(t > 0)) return; COLL.when.t = t; COLL.shown = COLL_PAGE; collPaintBody(false); };
}
/** Cartes de l'écran, gardées tant que rien ne change (5 000 cartes : liste, filtre et tri coûtent ~0,3 s sur un téléphone moyen). Clé : COLL.seq, monté à chaque changement des cartes, des infos ou des prix (collChanged, collPaint, collPaintSoon), et les objets remplacés ailleurs (compte, noms français, EDHREC). */
function collAll() {
  const v = COLL.view, frc = typeof FRC !== 'undefined' ? FRC.cat : null;
  if (v && v.seq === COLL.seq && v.map === COLL.map && v.meta === COLL.meta && v.px === COLL.px && v.edh === EDH.data && v.frn === FRN.map && v.frc === frc) return v;
  return (COLL.view = { seq: COLL.seq, map: COLL.map, meta: COLL.meta, px: COLL.px, edh: EDH.data, frn: FRN.map, frc, all: collItems(), sk: null, filtered: null, sorted: null });
}
/** …filtrées puis triées, gardées pour un même tri, une même source de prix et un même filtre. */
function collListOf(v) {
  const f = COLL.f, sk = [COLL.sort, COLL.src, f.q, [...f.colors].sort().join(''), f.type, f.cmc, f.cmdr, f.set, COLL.place, SETIC.m ? 1 : 0, collWhenOn() ? COLL.when.dir + COLL.when.t : ''].join('\u0001');      // SETIC.m : dates des extensions arrivées (tri par édition)
  if (v.sk !== sk) { v.filtered = filterItems(v.all, f); if (collWhenOn()) { const w = COLL.when; v.filtered = v.filtered.filter(it => it.d > 0 && (w.dir === 'before' ? it.d < w.t : it.d >= w.t)); } if (COLL.place) v.filtered = v.filtered.filter(it => collLines(COLL.map[it.k]).some(([g]) => plcIn(g))); v.sorted = collSorted(v.filtered); v.sk = sk; }      // emplacement affiché (Rangement) : les cartes qui y ont au moins un exemplaire
  return v;
}
function collItems() {
  return Object.entries(COLL.map).map(([k, x]) => {
    const px = COLL.px[k], dn = frName(k, x.l), fn = frOf(k), it = { k, n: x.n, ...(dn ? { dn } : {}), ...(fn && fn !== dn ? { fn } : {}), q: x.q, l: x.l || '', d: x.d || 0, ...(COLL.meta[k] || {}), ...(px ? { rp: px.p, rt: px.t, rc: px.c || 'EUR' } : {}), eds: collSetsOf(x) };
    if (x.x) { const eu = collCardEu(k); if (eu != null) it.eu = eu; }      // éditions : prix moyen d'un exemplaire (valeur, tri par prix)
    return Object.assign(it, cmdrClass(it, EDH.data));      // cx : 0 · 1 peut être commandant · 2 joué comme commandant (EDHREC), ed : nombre de decks
  });
}
/** Extensions des lignes d'une carte ('' : une ligne sans édition), sans doublon. */
const collSetsOf = x => [...new Set(collLines(x).map(([g]) => edSet(lineEd(g))))];
/** Ligne montrée avec le filtre « Extension » : celle de l'extension choisie (« Sans édition » : les lignes sans édition). */
const collSetIn = g => { const s = COLL.f.set; return !s || (s === '-' ? !lineEd(g) : edSet(lineEd(g)) === s); };
/** Extensions des cartes affichées, pour le filtre : [[code, nom, cartes]], de la plus récente à la plus ancienne ; « Sans édition » ('-') en tête.
 *  Affichées : emplacement ouvert (Rangement : seulement ses lignes, ses extensions et leur nombre de cartes ici), recherche et autres filtres compris (pas l'extension elle-même). */
function collSetList() {
  const by = new Map(); let none = 0;
  for (const it of filterItems(collAll().all, { ...COLL.f, set: '' })) {
    const ls = COLL.place ? collLines(COLL.map[it.k]).filter(([g]) => plcIn(g)) : null;
    for (const e of ls ? new Set(ls.map(([g]) => edSet(lineEd(g)))) : it.eds) { if (e) by.set(e, (by.get(e) || 0) + 1); else none++; }
  }
  const l = [...by].map(([c, k]) => [c, setName(c), k]).sort((a, b) => setDate(b[0]).localeCompare(setDate(a[0])) || (a[1] || a[0]).localeCompare(b[1] || b[0]));
  return none ? [['-', '', none], ...l] : l;
}
/** Lignes d'affichage d'une carte : une par langue et édition possédées (fr, fr CMM 400, en…), chacune avec sa quantité, son nom imprimé, son image et son prix (celui de l'édition s'il est connu).
 *  Les infos de la carte (type, coût, étiquettes) ne sont montrées que sur la première ; l'offre CardTrader seulement sur la ligne de la langue lue (la plus fournie). */
function collRowItems(it) {
  const ls = collLines(COLL.map[it.k]).filter(([g]) => plcIn(g) && collSetIn(g));      // emplacement affiché, extension filtrée : leurs lignes seules
  if (ls.length < 2) { const g = ls[0] ? ls[0][0] : it.l, e = lineEd(g), f = lineFoil(g); return [{ ...it, g, e, f, nl: 1, li: 0, ...((COLL.place || COLL.f.set) && ls[0] ? { q: ls[0][1] } : {}), ...(e || f ? { eu: collLineEu(it.k, g) ?? undefined } : {}) }]; }      // emplacement affiché : les exemplaires qui y sont
  const dom = collDomLang(ls);
  return ls.map(([g, q], i) => {
    const l = lineLang(g), r = { ...it, g, l, e: lineEd(g), f: lineFoil(g), q, nl: ls.length, li: i, eu: collLineEu(it.k, g) ?? undefined }; const dn = frName(it.k, l); if (dn) r.dn = dn; else delete r.dn;
    if (g !== dom) { delete r.rp; delete r.rt; delete r.rc; }
    return r;
  });
}
function collSorted(items) {
  const mode = COLL.sort === 'name' && COLL.f.cmdr === 'played' ? 'decks' : COLL.sort;      // « Joués en commandant » : les plus joués d'abord (sauf autre tri choisi)
  if (mode === 'set') return collBySet(items);
  const by = { name: byName, qty: (a, b) => (b.q - a.q) || byName(a, b), price: (a, b) => (((srcPrice(b, COLL.src) || {}).u || 0) - ((srcPrice(a, COLL.src) || {}).u || 0)) || byName(a, b), decks: (a, b) => ((b.ed || 0) - (a.ed || 0)) || ((b.cx || 0) - (a.cx || 0)) || byName(a, b), new: (a, b) => ((b.d || 0) - (a.d || 0)) || byName(a, b), old: (a, b) => ((a.d || 0) - (b.d || 0)) || byName(a, b) }[mode] || byName;
  return items.slice().sort(by);
}
/** Numéro de collection pour le tri (« 12a » → 12) ; inconnu : à la fin. */
const edNumOf = e => { const n = parseInt(String(e || '').split('|')[1], 10); return Number.isFinite(n) ? n : 1e9; };
/**
 * Tri « Édition » : par extension, de la plus récente à la plus ancienne (date Scryfall ; inconnue : après, par nom), puis numéro de collection ; cartes sans édition à la fin, par nom.
 * Une carte de plusieurs extensions se range sous la plus récente (sous celle du filtre « Extension » s'il y en a un). Le tableau rendu porte .se (carte → extension) pour les intertitres.
 */
function collBySet(items) {
  const fs = COLL.f.set && COLL.f.set !== '-' ? COLL.f.set : '', se = new Map(), num = new Map();
  for (const it of items) {
    const sets = fs ? [fs] : it.eds.filter(Boolean).sort((a, b) => setDate(b).localeCompare(setDate(a)) || a.localeCompare(b)), s = sets[0] || '';
    se.set(it, s); num.set(it, s ? Math.min(...collLines(COLL.map[it.k]).filter(([g]) => edSet(lineEd(g)) === s).map(([g]) => edNumOf(lineEd(g)))) : 0);
  }
  const out = items.slice().sort((a, b) => { const x = se.get(a), y = se.get(b); return (!x - !y) || setDate(y).localeCompare(setDate(x)) || (setName(x) || x).localeCompare(setName(y) || y) || x.localeCompare(y) || num.get(a) - num.get(b) || byName(a, b); });
  out.se = se; return out;
}
/** Lignes de la liste, de from à to (non compris), avec l'intertitre de l'extension quand elle change (tri « Édition »). */
function collRowsHtml(sorted, from, to) {
  const se = COLL.sort === 'set' && sorted.se, out = [];
  for (let i = from; i < Math.min(to, sorted.length); i++) {
    const it = sorted[i];
    if (se && (i === 0 || se.get(sorted[i - 1]) !== se.get(it))) { const c = se.get(it), y = setDate(c).slice(0, 4); out.push(`<h3 class="coll-sethd">${c ? setIcHtml(c) : ''}<b>${esc(c ? setName(c) || c.toUpperCase() : T('Sans édition'))}</b>${c ? `<small>${esc(c.toUpperCase())}${y ? ' · ' + y : ''}</small>` : ''}</h3>`); }
    out.push(collRowItems(it).map(crowHtml).join(''));
  }
  return out.join('');
}
const CARD_LANG_LIST = ['fr', 'en', 'de', 'es', 'it', 'pt', 'jp', 'zh-CN', 'ru', 'kr', 'zh-TW'];
/** Puce langue d'une carte : drapeau (ou « Langue ? »), et un <select> invisible par-dessus : un appui ouvre le choix natif de la langue. g : la ligne (clé langue|édition) quand elle a une édition. */
function langChip(k, l, name, cls, g) {
  return `<label class="lchip${l ? '' : ' none'}${cls ? ' ' + cls : ''}" data-l="${esc(l)}"${g && g !== l ? ` data-g="${esc(g)}"` : ''}>${l ? flag(l) : '<span>' + T('Langue ?') + '</span>'}<select data-lk="${esc(k)}" aria-label="${T('Langue de {name}', { name: esc(name) })}"><option value=""${l ? '' : ' selected'}>${T('Non précisée')}</option>${CARD_LANG_LIST.map(x => { const n = T(LANGS[x]); return `<option value="${x}"${x === l ? ' selected' : ''}>${esc(n[0].toUpperCase() + n.slice(1))}</option>`; }).join('')}</select></label>`;
}
/** Sélecteur d'édition d'une ligne (à gauche de la quantité) : le symbole de l'extension seul (code tant que les symboles ne sont pas lus) ; sans édition : un rond en pointillés. */
function edBtn(it, nm) {
  const e = it.e || '', set = edSet(e), sn = e ? setName(set) || (COLL.ed[e] || {}).sn || '' : '', ic = e ? setIcHtml(set) : '';
  const lab = (e ? T('Édition : {ed}', { ed: [sn, edLabel(e)].filter(Boolean).join(' · ') }) : T('Choisir l\'édition de {name}', { name: nm })) + (it.f ? ' · ' + T('Foil') : '');
  return `<button type="button" class="row-ed${e ? ' on' : ''}${it.f ? ' foil' : ''}" data-act="ed" aria-label="${esc(lab)}" title="${esc(lab)}">${e ? ic || `<span class="ed-code">${esc(set.toUpperCase())}</span>` : ''}</button>`;      // sans édition : rond en pointillés dessiné en CSS (pas de SVG par ligne : 5 000 lignes se repeignent pendant la lecture) ; foil : étincelle en coin
}
function crowHtml(it) {
  const g = it.g ?? it.l, nm = it.dn || it.n, hue = hash32(it.k) % 360, letter = esc((nm.trim()[0] || '?').toUpperCase()), img = collLineImage(it.k, g, it.im).src, sub = it.li > 0;      // sub : 2e ligne (langue, édition) de la même carte
  const tags = [];      // le drapeau suit le nom (à droite, loin de la vignette qu'on touche pour agrandir) ; « Langue ? » finit la rangée de tags
  if (it.f) tags.push(`<span class="tag foil" title="${T('Exemplaires foil : prix foil Cardmarket')}">✦ ${T('Foil')}</span>`);
  if (!sub && it.tl) tags.push(`<span class="tag">${esc(T(typeBucket(it.tl)))}</span>`);
  if (!sub && it.cm != null && it.tl && typeBucket(it.tl) !== 'Terrains') tags.push(`<span class="tag">${T('Coût {n}', { n: it.cm })}</span>`);
  if (!sub && COLL.f.cmdr && it.cx) tags.push(it.cx === 2 ? `<span class="tag accent" title="${T('Commandant dans des decks EDHREC')}">Commander${it.ed ? ' · ' + nf0(it.ed) + ' decks' : ''}</span>` : '<span class="tag accent">Commander</span>');
  if (!sub && isDateSort() && it.d) tags.push(`<span class="tag" title="${T('Date d\'ajout à la collection')}">${esc(new Date(it.d * 1000).toLocaleString(LOC(), { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }))}</span>`);
  const mvv = !sub && valMove(it.k); if (mvv) tags.push(valTag(mvv));
  const mnt = !sub && engTag(it.k); if (mnt) tags.push(mnt);
  if (!it.l) tags.push(langChip(it.k, '', it.n, '', g));
  const plc = plcRowTag(g); if (plc) tags.push(plc);      // emplacement et détails (places.js) : seulement si la ligne est rangée ou détaillée
  const px = [];      // prix : CM (tendance Cardmarket, estimation) au-dessus, CT (offre CardTrader la plus basse, lue à la demande) en dessous
  if (Number.isFinite(it.eu)) px.push(`<span class="px cm" title="${T('Cardmarket : prix tendance')}"><i>CM</i> <b>${esc(fmt(it.eu, 'EUR'))}</b></span>`);
  if (Number.isFinite(it.rp)) px.push(`<span class="px ct" title="${T('CardTrader : offre la plus basse')}"><i>CT</i> <b>${esc(fmt(it.rp, it.rc || 'EUR'))}</b></span>`);
  else if (it.rp === null && it.rt) px.push(`<span class="px ct none" title="${T('CardTrader : aucune offre')}"><i>CT</i> <b>${T('aucune offre')}</b></span>`);
  return `<div class="crow ced${px.length ? ' has-px' : ''}${sub ? ' sub' : ''}${it.nl > 1 ? ' ml' : ''}" data-k="${esc(it.k)}" data-ln="${esc(it.l)}"${g !== it.l ? ` data-g="${esc(g)}"` : ''}><span class="thumb" style="--h:${hue}"${zoomAt('coll', nm)}>${letter}${img ? `<img alt="" loading="lazy" decoding="async" src="${esc(img)}">` : ''}</span>
    <span class="row-main"><span class="row-top"><span class="row-name">${esc(nm)}</span>${it.l ? langChip(it.k, it.l, it.n, '', g) : ''}</span>${tags.length ? `<span class="row-meta">${tags.join('')}</span>` : ''}</span>
    ${px.length ? `<span class="row-px">${px.join('')}</span>` : ''}${edBtn(it, nm)}
    <span class="qstep"><button type="button" data-d="-1" aria-label="${T('Retirer un exemplaire de {name}', { name: esc(nm) })}">−</button><b>${it.q}</b><button type="button" data-d="1" aria-label="${T('Ajouter un exemplaire de {name}', { name: esc(nm) })}">+</button></span></div>`;
}
/** État de la sauvegarde, en toutes lettres (le sous-titre du header est tronqué sur téléphone) : { k: 'ok'|'warn'|'bad', t, acts:[[act, label]] } ou null.
 *  Point de couleur à côté du titre (touché : le texte) ; bandeau sous le header seulement quand ça ne va pas. Exporter : bouton du header, à côté d'Importer. */
function collSyncInfo() {
  if (!collCount()) return null;
  if (D.user) {
    if (COLL.cloud === 'ok') return { k: 'ok', t: T('Sauvegardée dans ton compte'), acts: [] };
    if (COLL.cloud === 'offline') return { k: 'warn', t: T('Hors ligne : tes changements restent sur cet appareil et partiront au retour du réseau.'), acts: [['resync', T('Réessayer')]] };
    if (COLL.cloud === 'error') return { k: 'bad', t: T('Pas sauvegardée dans ton compte : {err}. Tes cartes ne sont que sur cet appareil.', { err: COLL.err || T('synchronisation impossible') }), acts: [['resync', T('Réessayer')]] };
    return { k: 'warn', t: T('Synchronisation avec ton compte…'), acts: [] };
  }
  if (D.state === 'unavailable') return { k: 'bad', t: T('Compte indisponible ici (Firebase bloqué ou hors ligne) : tes cartes ne sont que sur cet appareil.'), acts: [] };
  if (!D.authReady) return null;
  return { k: 'warn', t: T('Pas sauvegardée dans un compte : tes cartes ne sont que sur cet appareil (perdues si les données du navigateur sont effacées).'), acts: [['login', T('Se connecter')]] };
}
/** Exporter la collection : CSV (Moxfield, ManaBox, Archidekt…), texte « 3 Sol Ring *FR* » (réimportable ici et dans la plupart des applis), ou copie du texte. */
function collDownload(body, ext, type) {
  try {
    const url = URL.createObjectURL(new Blob([body], { type: type + ';charset=utf-8' })), a = document.createElement('a');
    a.href = url; a.download = 'ma-collection-' + new Date().toISOString().slice(0, 10) + '.' + ext; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 4000);
    toast(T('Collection exportée ({n} cartes)', { n: nf0(collCount()) }));
  } catch (e) { toast(T('Export impossible sur ce navigateur')); }
}
function collExport() {
  if (!collCount()) { toast(T('Ta collection est vide')); return; }
  openSheet(T('Exporter ma collection'), T('{n} cartes · {c} exemplaires', { n: nf0(collCount()), c: nf0(collCopies()) }), api => {
    api.body.innerHTML = `<div class="ex-list">
      <button class="ex-opt" type="button" data-x="csv"><b>${T('Fichier CSV')}</b><span>${T('Pour Moxfield, ManaBox, Archidekt, Deckbox… Une ligne par carte et par langue.')}</span></button>
      <button class="ex-opt" type="button" data-x="txt"><b>${T('Fichier texte')}</b><span>${T('« 3 Sol Ring *FR* », une carte par ligne. Réimportable ici et dans la plupart des applis.')}</span></button>
      <button class="ex-opt" type="button" data-x="copy"><b>${T('Copier le texte')}</b><span>${T('Pour le coller dans un message ou une autre appli.')}</span></button></div>`;
    api.body.onclick = e => {
      const x = (e.target.closest('[data-x]') || {}).dataset; if (!x || !x.x) return;
      if (x.x === 'csv') collDownload(collToCsv(COLL.map, trSpare(COLL.map)), 'csv', 'text/csv');
      else if (x.x === 'txt') collDownload(collToText(COLL.map) + '\n', 'txt', 'text/plain');
      else { copyText(collToText(COLL.map)); }
      api.close();
    };
  });
}
function collHeadText() {
  const n = collCount(), c = collCopies();
  const sync = D.user ? (COLL.cloud === 'ok' ? T('synchronisée') : COLL.cloud === 'sync' ? T('synchronisation…') : COLL.cloud === 'offline' ? T('hors ligne') : COLL.cloud === 'error' ? COLL.err : '') : T('sur cet appareil');
  return n ? TN(n, '{n} carte', '{n} cartes') + ' · ' + TN(c, '{n} exemplaire', '{n} exemplaires') + (sync ? ' · ' + sync : '') : T('Vide pour le moment');
}
/** Carte de valeur en haut de « Ma collection » : valeur (tendance Cardmarket), cartes et exemplaires, variation sur 7 jours, courbe des 30 derniers relevés ; toucher → Stats. */
function collValPaint() {
  const box = COLL.el && $('.coll-val', COLL.el); if (!box) return;
  const n = collCount(); if (!n || typeof homeValue !== 'function') { box.hidden = true; return; }
  const v = homeValue(), h = histDelta(VAL.hist, 7), pts = VAL.hist.slice(-30).map(x => x.v);
  let spark = '';
  if (pts.length >= 2) {
    const lo = Math.min(...pts), hi = Math.max(...pts), W = 120, H = 38, dx = W / (pts.length - 1), y = p => (hi === lo ? H / 2 : H - 3 - (p - lo) / (hi - lo) * (H - 6));
    const d = pts.map((p, i) => (i ? 'L' : 'M') + (i * dx).toFixed(1) + ' ' + y(p).toFixed(1)).join(' ');
    spark = `<svg class="cv-sp" viewBox="0 0 ${W} ${H}" aria-hidden="true"><path d="${d}"/><circle cx="${W}" cy="${y(pts[pts.length - 1]).toFixed(1)}" r="2.6"/></svg>`;
  }
  const dl = h && Math.abs(h.d) >= 100 ? `<em class="cv-d${h.d < 0 ? ' down' : ''}">${esc(T('{d} · 7 j', { d: (h.d < 0 ? '▼ −' : '▲ +') + hmEur(Math.abs(h.d)) }))}</em>` : '';
  box.hidden = false;
  box.innerHTML = `<button type="button" class="cv" data-act="valtab" aria-label="${esc(T('Valeur de la collection : {v} · voir les stats', { v: v ? hmEur(v) : '—' }))}"><span class="cv-t"><b>${v ? esc(hmEur(v)) : '—'}</b><span>${TN(n, '{n} carte', '{n} cartes')} · ${TN(collCopies(), '{n} exemplaire', '{n} exemplaires')}</span></span><span class="cv-r">${dl}${spark}</span></button>`;
}
function collPaintHead() {
  paintCollSection();
  if (typeof opnCollHead === 'function' && opnCollHead(COLL.el)) return;      // session d'ouverture (opening.js) : note ; mode streamer : en-tête de la session seule
  collValPaint();
  if (typeof BD !== 'undefined' && BD.el && BD.tab === 'coll') { BD.idx = null; bdList(); }      // l'éditeur de deck liste la collection : il suit la lecture des cartes (commandants possibles…)
  const el = COLL.el; if (!el) return;
  $('.dv-title span', el).textContent = COLL.mode === 'coll' ? collHeadText() : '';      // Échange, Decks › À monter : le titre seul
  const sy = $('.coll-sync', el), si = collSyncInfo(), dot = $('.coll-dot', el);
  if (dot) { dot.hidden = !si; if (si) { dot.dataset.k = si.k; dot.setAttribute('aria-label', si.t); dot.title = si.t; } }
  if (!si || si.k === 'ok') sy.hidden = true;      // tout va bien : le point vert suffit
  else { sy.hidden = false; sy.dataset.k = si.k; sy.innerHTML = `<span class="sy-d" aria-hidden="true"></span><span class="sy-t">${esc(si.t)}</span>${si.acts.map(([a, l]) => `<button class="link-btn" type="button" data-act="${a}">${esc(l)}</button>`).join('')}`; }
  if (GLANCE.api) paintGlance();
  const stt = $('.coll-status', el), e = COLL.enrich;
  let unk = 0, miss = 0, lmiss = 0;      // comptés seulement quand leur ligne peut s'afficher : pendant une lecture, l'en-tête est repeint à chaque lot
  const px = COLL.pxRun;
  if (px) { stt.hidden = false; stt.dataset.k = 'run'; stt.innerHTML = `<span>${T('Prix réels · {a} / {b}', { a: nf0(Math.floor(px.done)), b: nf0(px.total) })}${px.step ? ' · ' + esc(px.step) : ''}</span><span class="track"><span class="fill" style="width:${Math.round(100 * px.done / Math.max(1, px.total))}%"></span></span><button class="link-btn" type="button" data-act="pxstop">${T('Arrêter')}</button>`; }
  else if (COLL.pxMsg) { stt.hidden = false; stt.dataset.k = COLL.pxMsg.bad ? 'err' : 'idle'; stt.innerHTML = `<span>${esc(COLL.pxMsg.t)}</span><button class="link-btn" type="button" data-act="pxok">OK</button>`; }
  else if (e) { const w = e.wait; stt.hidden = false; stt.dataset.k = 'run'; stt.innerHTML = `<span>${e.ph === 'img' ? T('Images dans la langue des cartes') : T('Lecture des cartes sur Scryfall')} · ${nf0(e.done)} / ${nf0(e.total)}</span><span class="track"><span class="fill" style="width:${Math.round(100 * e.done / Math.max(1, e.total))}%"></span></span>${w ? `<small class="coll-wait">${esc(w)}</small>` : ''}`; }
  else if (VAL.run) { stt.hidden = false; stt.dataset.k = 'run'; stt.innerHTML = `<span>${T('Prix Cardmarket · {a} / {b}', { a: nf0(VAL.run.done), b: nf0(VAL.run.total) })}</span><span class="track"><span class="fill" style="width:${Math.round(100 * VAL.run.done / Math.max(1, VAL.run.total))}%"></span></span>`; }
  else if (COLL.enrichErr) { stt.hidden = false; stt.dataset.k = 'err'; stt.innerHTML = `<span>${esc(COLL.enrichErr)}</span><button class="link-btn" type="button" data-act="enrich">${T('Réessayer')}</button>`; }
  else if ((miss = collMissing().length) && collCount()) { stt.hidden = false; stt.dataset.k = 'idle'; stt.innerHTML = `<span>${TN(miss, '{n} carte sans infos (coût, type, image)', '{n} cartes sans infos (coût, type, image)')}</span><button class="link-btn" type="button" data-act="enrich">${T('Compléter')}</button>`; }
  else if ((unk = collUnknown().length)) { stt.hidden = false; stt.dataset.k = 'warn'; stt.innerHTML = `<span>${TN(unk, '{n} nom inconnu', '{n} noms inconnus')}</span><button class="link-btn" type="button" data-act="unknown">${T('Corriger')}</button>`; }      // fautes de frappe, lignes d'en-tête, noms ambigus : plus jamais silencieux
  else if ((lmiss = collLangMissingCount()) && collCount()) { stt.hidden = false; stt.dataset.k = 'idle'; stt.innerHTML = `<span>${TN(lmiss, '{n} carte sans image dans sa langue', '{n} cartes sans image dans sa langue')}</span><button class="link-btn" type="button" data-act="enrich">${T('Charger')}</button>`; }
  else stt.hidden = true;
  valPaintAlert();
}
/** Pause de la file Scryfall (429, nouvel essai après une coupure ou un délai dépassé) : « Scryfall en pause · 28 s » sous la barre de lecture des infos, au lieu d'un compteur figé ('' : pas de pause). */
function collScryWait() {
  const gate = scryLeft(), left = Math.max(gate, (limScry.waitEnd || 0) - Date.now());
  return left >= 1000 ? T(gate <= 0 && limScry.waitKind === 'net' ? 'Nouvelle tentative · {n} s' : 'Scryfall en pause · {n} s', { n: Math.ceil(left / 1000) }) : '';
}
function collPaint() { COLL.seq++; collPaintHead(); if (COLL.el) collPaintBody(true); }
/** Repaint de la liste pendant une lecture de fond (infos Scryfall, prix réels) : au plus un toutes les 2 s. Avec 5 000 cartes, chaque repaint coûte ~1 s sur un téléphone moyen : à chaque lot, l'écran figeait et la lecture elle-même ralentissait. */
const COLL_PAINT_GAP = 2000;
function collPaintSoon() {
  COLL.seq++;
  if (!COLL.el || COLL.paintT) return;
  COLL.paintT = setTimeout(() => { COLL.paintT = 0; if (COLL.el) collPaintBody(true); }, Math.max(0, COLL.paintAt + COLL_PAINT_GAP - Date.now()));
}

/** Barres horizontales (couleurs, familles) : rows = [[libellé html, valeur, classe]]. */
function barsHtml(rows) {
  const max = Math.max(1, ...rows.map(r => r[1]));
  return `<div class="cs-bars">${rows.filter(r => r[1] > 0).map(([l, v, c]) => `<div class="cs-b"><span class="cs-l">${l}</span><span class="cs-t"><i class="${c || ''}" style="width:${Math.max(3, Math.round(v / max * 100))}%"></i></span><span class="cs-n">${nf0(v)}</span></div>`).join('')}</div>`;
}
/** Tuile de valeur (Stats) : bascule entre les prix réels CardTrader (CT) et l'estimation Cardmarket (CM). Choix retenu sur l'appareil. */
function collToggleSrc() {
  if (COLL.el && $('.cs-val[data-ctno]', COLL.el)) { haptic('tap'); ctGetSheet(() => { COLL.src = 'ct'; try { localStorage.setItem(COLL_SRC_KEY, 'ct'); } catch (e) { /* ignore */ } collPaintBody(true); }); return; }      // CardTrader sans token : l'encart du token, la bascule viendra après
  COLL.src = COLL.src === 'cm' ? 'ct' : 'cm'; haptic('tap');
  try { localStorage.setItem(COLL_SRC_KEY, COLL.src); } catch (e) { /* stockage indisponible */ }
  collPaintBody(true);
  const t = $('.cs-val', COLL.el); if (t) t.focus({ preventScroll: true });
}
function collStatsHtml(items) {
  const ctOff = !(typeof ctReady === 'function' && ctReady()) && !items.some(i => i.rp > 0);      // CardTrader indisponible et aucun prix lu : valeur Cardmarket ; toucher la tuile propose d'ajouter le token
  const st = collStats(items, ctOff ? 'cm' : COLL.src), miss = st.unknown, cm = st.src === 'cm';
  const colorRows = [['W', T('Blanc')], ['U', T('Bleu')], ['B', T('Noir')], ['R', T('Rouge')], ['G', T('Vert')]].map(([c, n]) => [`<i class="mc mc-${c.toLowerCase()}">${c}</i>${n}`, st.colors[c], 'k-' + c.toLowerCase()])
    .concat([['<i class="mc mc-m">M</i>' + T('Multicolore'), st.colors.M, 'k-m'], ['<i class="mc mc-n">C</i>' + T('Incolore'), st.colors.C, 'k-n']]);
  const typeRows = TYPE_ORDER.map(t => [esc(T(t)), st.types[t], 'k-t']);
  const nums = `<div class="cs-tiles"><div><b>${nf0(st.unique)}</b><span>${TN(st.unique, 'carte différente', 'cartes différentes')}</span></div><div><b>${nf0(st.copies)}</b><span>${TN(st.copies, 'exemplaire', 'exemplaires')}</span></div><div class="cs-val" role="button" tabindex="0" data-act="pxsrc"${ctOff ? ' data-ctno="1"' : ''} aria-label="${ctOff ? T('Valeur de la collection, source Cardmarket : touche pour ajouter ton token CardTrader') : T('Valeur de la collection, source {a} : touche pour passer à {b}', { a: cm ? 'Cardmarket' : 'CardTrader', b: cm ? 'CardTrader' : 'Cardmarket' })}"><b>${st.valued ? esc(fmt(st.value, 'EUR')) : '—'}</b><span>${cm ? T('valeur · tendance Cardmarket') + (st.valued < st.known ? ' ' + T('({n} cartes)', { n: nf0(st.valued) }) : '') : st.real ? (st.valued > st.real ? T('valeur · {n} au prix réel CardTrader, {m} estimées Cardmarket', { n: nf0(st.real), m: nf0(st.valued - st.real) }) : T('valeur · {n} au prix réel CardTrader', { n: nf0(st.real) })) : T('valeur ≈ tendance Cardmarket') + (st.valued && st.valued < st.known ? ' ' + T('({n} cartes)', { n: nf0(st.valued) }) : '')}</span>${`<div class="cs-src"><div class="cs-sw" aria-hidden="true"><i${cm ? '' : ' class="on"'}>CT</i><i${cm ? ' class="on"' : ''}>CM</i></div><small>${ctOff ? T('CT : prix réels avec ton token CardTrader') : cm && !items.some(i => i.rp > 0) ? T('CT : aucun prix lu · touche pour changer') : st.alt.valued ? T('{src} : {v} · touche pour changer', { src: cm ? 'CT' : 'CM', v: esc(fmt(st.alt.value, 'EUR')) }) : T('touche pour changer')}</small></div>`}</div></div>`;      // aucune offre CardTrader lue : le chiffre « CT » ne serait que l'estimation Cardmarket
  const note = miss ? `<p class="hint">${T('Stats sur {a} cartes lues ; {b} sans infos pour l\'instant.', { a: nf0(st.known), b: nf0(miss) })}</p>` : '';
  const byLot = COLL.topBy !== 'one', list = byLot ? st.top : st.topUnit, shown = list.slice(0, COLL.topN), cur = i => (i.rl ? i.rc || 'EUR' : 'EUR');
  const top = list.length ? `<h3 class="cs-h">${T('Les plus chères')} <span class="cs-sw" role="group" aria-label="${T('Classer par')}"><button type="button" data-act="topby" data-v="lot" aria-pressed="${byLot}" class="${byLot ? 'on' : ''}">${T('Par lot')}</button><button type="button" data-act="topby" data-v="one" aria-pressed="${!byLot}" class="${byLot ? '' : 'on'}">${T('Par carte')}</button></span></h3><p class="hint cs-topnote">${byLot ? T('Classées par valeur du lot : prix × exemplaires.') : T('Classées par prix d\'un exemplaire.')}</p><div class="cs-top">${shown.map(i => `<div class="crow ro" data-k="${esc(i.k)}"><span class="thumb" style="--h:${hash32(i.k) % 360}"${zoomAt('coll', i.dn || i.n)}>${esc((i.n.trim()[0] || '?').toUpperCase())}${i.im ? `<img alt="" loading="lazy" decoding="async" src="${esc(i.im)}">` : ''}</span><span class="row-main"><span class="row-name">${esc(i.dn || i.n)}</span><span class="row-meta">${i.q > 1 ? `<span class="tag accent">× ${nf0(i.q)}</span>` : ''}${i.rl ? '<span class="tag real">' + T('prix réel') + '</span>' : ''}</span></span><span class="row-price"><b>${esc(fmt(byLot ? i.lot : i.up, cur(i)))}</b>${i.q > 1 ? `<small>${byLot ? `${esc(fmt(i.up, cur(i)))} × ${nf0(i.q)}` : `× ${nf0(i.q)} = ${esc(fmt(i.lot, cur(i)))}`}</small>` : ''}</span></div>`).join('')}</div>${list.length > shown.length ? `<button class="btn ghost block coll-more" type="button" data-act="topmore">${T('Afficher {a} de plus · {b} restantes', { a: nf0(Math.min(10, list.length - shown.length)), b: nf0(list.length - shown.length) })}</button>` : ''}` : '';
  const share = st.unique ? `<div class="simg-coll"><button class="link-btn" type="button" data-act="simgcoll"><svg class="i" aria-hidden="true"><use href="#i-share"/></svg>${T('Partager en image')}</button></div>` : '';      // image de la collection (simg.js)
  // .cs-col : sans effet sur le téléphone (display:contents, css/stats.css) ; deux colonnes sur ordinateur (zz-desktop.css) : valeur et variations | le reste
  return `${nums}${share}${note}<div class="cs-cols"><div class="cs-col">${valStatsHtml()}</div><div class="cs-col">
    <h3 class="cs-h">${T('Courbe de mana')} <small>${T('{n} sorts', { n: nf0(st.spells) })}</small></h3>${curveBars(st.curve, false)}
    <h3 class="cs-h">${T('Couleurs')} <small>${T('sorts')}</small></h3>${barsHtml(colorRows)}
    <h3 class="cs-h">${T('Familles')} <small>${T('exemplaires')}</small></h3>${barsHtml(typeRows)}${top}</div></div>`;
}
/** Onglet « Cartes » sans aucune carte : le scan d'abord (le plus rapide pour débuter), import et saisie à côté. */
function collEmptyHtml() {
  return `<div class="dv-empty coll-empty"><div class="empty-art" aria-hidden="true"><i></i><i></i><i></i></div><b>${T('Pas encore de cartes pour l\'instant')}</b><p>${T('Scanne tes cartes pour débuter.')}</p>
    <div class="coll-cta"><button class="btn" type="button" data-act="scan"><svg class="i" aria-hidden="true"><use href="#i-camera"/></svg>${T('Scanner')}</button><div class="coll-cta2"><button class="btn ghost" type="button" data-act="import">${T('Importer')}</button><button class="btn ghost" type="button" data-act="add">${T('Ajouter à la main')}</button></div></div>
    <p class="hint">${T('Pour 1 000 cartes ou plus : exporte-les en CSV depuis ManaBox, Moxfield, Archidekt, Deckbox ou Dragon Shield, puis importe le fichier.')}</p>
    <button class="link-btn coll-swg" type="button" data-act="swg">${T('Tu viens de ManaBox ? Le guide en 2 minutes')}</button></div>`;
}
/** Onglet « Stats » sans aucune carte. */
const collStatsEmptyHtml = () => `<div class="dv-empty coll-empty"><b>${T('Pas encore de stats')}</b><p>${T('Valeur, courbe de mana et couleurs apparaissent dès tes premières cartes.')}</p>
    <div class="coll-cta"><button class="btn ghost" type="button" data-act="scan"><svg class="i" aria-hidden="true"><use href="#i-camera"/></svg>${T('Scanner des cartes')}</button></div></div>`;
/** Remplit la liste ou les stats selon l'onglet. keep : garder la position de défilement. */
function collPaintBody(keep) {
  const el = COLL.el; if (!el) return;
  clearTimeout(COLL.paintT); COLL.paintT = 0; COLL.paintAt = Date.now(); COLL.painted = null;
  if (!keep) COLL.seq++;      // affichage neuf (onglet, tri) : liste relue, jamais celle gardée
  const sc = $('.dv-scroll', el), pos = keep && sc ? sc.scrollTop : 0, host = $('.coll-main', el);
  if (keep && document.activeElement && document.activeElement.matches && document.activeElement.matches('.lchip select') && host.contains(document.activeElement)) { COLL.dirty = true; return; }      // un choix de langue est ouvert : on ne le ferme pas
  if (typeof opnCollBody === 'function' && opnCollBody(el, host)) { if (sc) sc.scrollTop = pos; return; }      // mode streamer (opening.js) : la session seule, jamais la collection
  const v = collAll(), all = v.all, none = !all.length;
  // collection vide : les onglets restent (Decks et Échange marchent sans carte) ; recherche, filtres, tri et prix réels n'auraient rien à montrer
  if (none && filterActive(COLL.f) && COLL.fb) COLL.fb.reset();      // un filtre resté actif, caché, viderait encore la liste « Je recherche »
  $('.coll-px', el).hidden = none; $('.coll-top', el).hidden = COLL.mode !== 'coll'; $('.coll-controls', el).hidden = COLL.mode === 'decks';      // Échange : recherche et filtres seulement ; Decks › À monter : ses propres réglages
  $('.coll-fwrap', el).hidden = none || (COLL.tab !== 'list' && COLL.tab !== 'trade'); $('#collSort', el).closest('.coll-sort').hidden = COLL.tab === 'trade'; if (typeof msBarPaint === 'function') msBarPaint(el, none); collWhenPaint(el, none); valPaintAlert();      // masterset (masterset.js) : interrupteur, sélecteur d'édition à la place de « Trier »
  if (none && COLL.tab === 'list' && !COLL.place) host.innerHTML = collEmptyHtml();
  else if (none && COLL.tab === 'stats') host.innerHTML = collStatsEmptyHtml();
  else if (COLL.tab === 'decks' && edhGate() !== 'ok') { host.innerHTML = edhGateHtml(); vfTick(); }      // decks EDHREC réservés aux comptes (edh.js) ; vfTick : « Renvoyer » grisé pendant la minute qui suit un envoi
  else if (COLL.tab === 'stats') { host.innerHTML = collStatsHtml(all); if (typeof valFit === 'function') valFit(host); }      // courbe de valeur à la taille de sa case sur ordinateur (value.js)
  else if (COLL.tab === 'places') { host.innerHTML = plcTabHtml(); }      // Rangement (places.js) : emplacements et proxys
  else if (COLL.tab === 'trade') { host.innerHTML = trPanelHtml(); trMount(host); }
  else if (COLL.tab === 'decks') { const res = keep && EDH.data && document.activeElement && document.activeElement.id === 'dkQ' ? $('.dk-res', host) : null; if (res) { res.innerHTML = edhResHtml(); edhThemesSync(); } else { host.innerHTML = edhPanelHtml(); edhEnsure(); } }      // en pleine frappe : seuls les résultats se repeignent, le champ garde le focus
  else if (typeof msActive === 'function' && msActive()) { host.innerHTML = msHtml(); msAfterPaint(); }      // masterset (masterset.js) : une extension, toutes ses cartes par numéro
  else if (COLL.f.cmdr === 'played' && !EDH.data) { host.innerHTML = edhWaitHtml(); edhEnsure(); }
  else {
    const { filtered, sorted } = collListOf(v), shown = sorted.slice(0, COLL.shown), act = filterActive(COLL.f) || collWhenOn();
    const known = all.filter(i => i.tl != null || i.cm != null).length, hid = (COLL.f.colors.size || COLL.f.type || COLL.f.cmc !== '' || COLL.f.cmdr) && known < all.length;
    const undated = isDateSort() ? all.filter(i => !i.d).length : 0;
    host.innerHTML = `${plcBarHtml()}${collNoLangHtml(v)}${undated ? `<p class="hint coll-count">${TN(undated, '{n} carte sans date d\'ajout (déjà là avant le suivi des dates) : {pos}, par nom.', '{n} cartes sans date d\'ajout (déjà là avant le suivi des dates) : {pos}, par nom.', { pos: COLL.sort === 'new' ? T('en bas') : T('en haut') })}</p>` : ''}${act ? `<p class="hint coll-count">${TN(filtered.length, '{n} carte sur {total}', '{n} cartes sur {total}', { total: nf0(all.length) })}${hid ? ' · ' + T('les cartes sans infos sont masquées par ces filtres') : ''}</p>` : ''}
      ${shown.length ? `<div class="coll-list">${collRowsHtml(sorted, 0, shown.length)}</div>` : '<p class="hint listempty">' + T('Aucune carte ne correspond.') + '</p>'}
      ${sorted.length > shown.length ? `<button class="btn ghost block coll-more" type="button" data-act="more">${T('Afficher {a} de plus · {b} restantes', { a: nf0(Math.min(COLL_PAGE, sorted.length - shown.length)), b: nf0(sorted.length - shown.length) })}</button>` : ''}`;
    COLL.painted = sorted;
  }
  if (sc) sc.scrollTop = pos;
  if (!keep) stagger($$('.coll-list, .cs-tiles, .dk-res', host));
  if (typeof tipSoon === 'function') tipSoon();      // astuces (tour.js) : classeur de l'Échange, « Partager en image » des Stats, « Ranger ces cartes… », options du masterset, rond de l'édition
}

/** « Afficher plus » : seule la tranche suivante est ajoutée au bas de la liste (tout repeindre prenait ~2 s à 1 300 lignes sur un téléphone moyen). Liste changée depuis le dernier repaint (version, tri, filtre) : repaint complet, comme avant. */
function collMore() {
  const host = $('.coll-main', COLL.el), list = host && $('.coll-list', host), btn = host && $('.coll-more[data-act="more"]', host), from = COLL.shown;
  COLL.shown += COLL_PAGE;
  const sorted = list && btn && COLL.tab === 'list' && COLL.painted ? collListOf(collAll()).sorted : null;
  if (!sorted || sorted !== COLL.painted) { collPaintBody(true); return; }
  list.insertAdjacentHTML('beforeend', collRowsHtml(sorted, from, COLL.shown));
  const left = sorted.length - COLL.shown;
  if (left > 0) btn.textContent = T('Afficher {a} de plus · {b} restantes', { a: nf0(Math.min(COLL_PAGE, left)), b: nf0(left) }); else btn.remove();
}
function closeCollection() { if (COLL.el) COLL.el.__close(); }
/** Ouvre l'écran de la collection (tab : 'list' | 'stats'). */
/** Trois sections sur le même écran (barre du bas, nav.js) : « Ma collection » (Cartes · Stats), « Échange » (liste d'échange seule)
 *  et Decks › « À monter » (decks EDHREC) ; tab : 'list' | 'stats' | 'trade' | 'decks' (sans tab : le dernier onglet de la collection). */
const COLL_MODES = { list: 'coll', places: 'coll', stats: 'coll', trade: 'trade', decks: 'decks' };
/** Recherche et filtres de chaque écran : ceux de la collection (aussi Decks, qui ne les montre pas) et ceux d'Échange, à part (une recherche dans l'un ne filtre pas l'autre). */
COLL.fs = { coll: COLL.f, trade: newFilter() };
function openCollection(tab) {
  closeCollection();
  if (!COLL_MODES[tab]) tab = COLL.ctab || 'list';
  COLL.tab = tab; COLL.mode = COLL_MODES[tab]; if (COLL.mode === 'coll') COLL.ctab = tab;
  COLL.f = COLL.fs[COLL.mode === 'trade' ? 'trade' : 'coll'];
  COLL.shown = COLL_PAGE; COLL.view = null; collFrLoad();
  const md = COLL.mode, title = md === 'trade' ? T('Échange') : md === 'decks' ? T('Decks') : T('Ma collection');
  const wrap = document.createElement('div'); wrap.className = `dv coll sec m-${md}${typeof NAV !== 'undefined' && NAV.inst ? ' inst' : ''}`; wrap.setAttribute('role', 'dialog'); wrap.setAttribute('aria-modal', 'true'); wrap.setAttribute('aria-label', title);
  const tools = md === 'coll' ? `<button class="icon-btn" type="button" data-act="add" aria-label="${T('Ajouter des cartes')}" title="${T('Ajouter des cartes')}"><svg class="i"><use href="#i-plus"/></svg></button>
        <button class="icon-btn" type="button" data-act="import" aria-label="${T('Importer un fichier ou du texte')}" title="${T('Importer')}"><svg class="i"><use href="#i-download"/></svg></button>
        <button class="icon-btn" type="button" data-act="export" aria-label="${T('Exporter ma collection')}" title="${T('Exporter')}"><svg class="i"><use href="#i-upload"/></svg></button>`
    : md === 'decks' ? `<button class="icon-btn deck-new" type="button" data-act="dnew" aria-label="${T('Créer un deck')}" title="${T('Créer un deck')}"><svg class="i"><use href="#i-plus"/></svg></button>` : '';
  wrap.innerHTML = `<header class="dv-head"><button class="icon-btn dv-back" type="button" data-act="close" aria-label="${T('Fermer la collection')}"><svg class="i"><use href="#i-back"/></svg></button>
      <div class="dv-title"><b>${title}${md === 'coll' ? '<button class="coll-dot" type="button" data-act="syncinfo" hidden></button>' : ''}</b><span></span></div>
      <div class="coll-tools">${tools}</div></header>${md === 'decks' ? dkTabsHtml('build') : ''}
    <div class="dv-scroll"><div class="dv-body coll-body">
      ${md === 'coll' ? '<div class="coll-val" hidden></div>' : ''}
      <div class="coll-sync" hidden></div>
      <div class="coll-status" hidden></div>
      <div class="coll-alert" hidden></div>
      <div class="coll-controls"><div class="coll-top"><div class="seg" id="collSeg" role="radiogroup" aria-label="${T('Affichage')}"></div><button class="icon-btn coll-px" type="button" data-act="prices" aria-label="${T('Lire les prix réels des cartes (CardTrader)')}" title="${T('Prix réels')}"><svg class="i" aria-hidden="true"><use href="#i-coin"/></svg></button></div>
        <div class="coll-fwrap"><div id="collF"></div><div class="coll-srow"><label class="sortsel coll-sort"><span>${T('Trier')}</span><select id="collSort" aria-label="${T('Trier la collection')}">${SORT_OPTS.map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select></label>${md === 'coll' && typeof msBarHtml === 'function' ? msBarHtml() : ''}</div><div class="coll-when" id="collWhen" hidden></div></div></div>
      <div class="coll-main"></div></div></div>`;
  COLL.el = wrap; const prevFocus = document.activeElement;
  const onKey = e => { if (e.key === 'Escape' && !imgView && !sheets.length && !$$('body > .dv.on').some(x => x !== wrap && wrap.compareDocumentPosition(x) & Node.DOCUMENT_POSITION_FOLLOWING)) { e.stopPropagation(); wrap.__close(); } };      // un écran ouvert par-dessus (ajout de cartes, scan) se ferme seul
  wrap.__close = () => {
    if (COLL.el !== wrap) return; COLL.el = null; document.removeEventListener('keydown', onKey, true);
    wrap.classList.remove('on'); setTimeout(() => wrap.remove(), reduceMotion() ? 0 : 240); releaseApp();
    try { if (prevFocus && prevFocus.focus && prevFocus.isConnected) prevFocus.focus({ preventScroll: true }); } catch (e) { /* ignore */ }
  };
  document.addEventListener('keydown', onKey, true);
  wrap.addEventListener('load', e => { if (e.target.tagName === 'IMG') e.target.classList.add('ok'); }, true);
  wrap.addEventListener('error', e => { if (e.target.tagName === 'IMG') e.target.remove(); }, true);
  if (md === 'coll') mountSeg($('#collSeg', wrap), [{ v: 'list', label: T('Cartes') }, { v: 'places', label: T('Rangement') }, { v: 'stats', label: T('Stats') }], COLL.tab, v => { const ord = ['list', 'places', 'stats'], dir = ord.indexOf(v) > ord.indexOf(COLL.tab) ? 'l' : 'r'; { const h = $('.coll-main', wrap); if (h) h.dataset.dir = dir; } COLL.tab = COLL.ctab = v; COLL.shown = COLL_PAGE; TR.shown = TR_PAGE; collPaintBody(false); const sc = $('.dv-scroll', wrap); if (sc) sc.scrollTop = 0; const h = $('.coll-main', wrap); if (h) { h.classList.remove('tabin'); void h.offsetWidth; h.classList.add('tabin'); } });
  COLL.fb = mountFilters($('#collF', wrap), COLL.f, () => {
    COLL.cmdrSeen = COLL.f.cmdr; COLL.shown = COLL_PAGE; TR.shown = TR_PAGE; collPaintBody(true);
  }, { placeholder: T('Rechercher une carte'), commander: true, sets: collSetList, setsSub: n => (COLL.place ? TN(n, '{n} extension dans « {place} »', '{n} extensions dans « {place} »', { place: plcName(COLL.place === '-' ? '' : COLL.place) })
    : filterActive({ ...COLL.f, set: '' }) ? TN(n, '{n} extension parmi les cartes affichées', '{n} extensions parmi les cartes affichées') : TN(n, '{n} extension dans ta collection', '{n} extensions dans ta collection')) });
  COLL.cmdrSeen = COLL.f.cmdr;
  $('#collSort', wrap).value = COLL.sort;
  $('#collSort', wrap).onchange = e => { COLL.sort = e.target.value; COLL.shown = COLL_PAGE; if (!isDateSort()) COLL.when.dir = ''; haptic('tap'); collPaintBody(false); };
  wrap.addEventListener('input', edhInput);
  wrap.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target && e.target.id === 'dkQ') e.target.blur(); });
  wrap.addEventListener('change', e => {
    if (typeof msChange === 'function' && msChange(e)) return;      // masterset : cartes par ligne
    if (edhChange(e)) return;      // « Classer », « Chercher par » (onglet Decks)
    const nls = e.target.closest && e.target.closest('select[data-act="nolangsel"]');
    if (nls) { const l = nls.value; nls.value = ''; nls.blur(); collBulkLang(l); return; }
    const sel = e.target.closest && e.target.closest('.lchip select'); if (!sel) return;
    const ch = sel.closest('.lchip'), k = sel.dataset.lk, l = sel.value, from = ch.dataset.g ?? (ch.dataset.l || ''); haptic('tap'); sel.blur(); COLL.dirty = false;
    collSetLang(k, l, from); collPaintBody(true);      // la ligne change de langue : son nom, son image, et elle peut rejoindre la ligne de l'autre langue
  });
  wrap.addEventListener('keydown', e => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    if (e.target.closest && e.target.closest('.cs-val[data-act="pxsrc"]')) { e.preventDefault(); collToggleSrc(); }
    else if (e.target.matches && e.target.matches('.crow.dk')) { e.preventDefault(); edhClick(e); }
  });
  wrap.addEventListener('focusout', e => { if (COLL.dirty && e.target.matches && e.target.matches('.lchip select')) setTimeout(() => { COLL.dirty = false; collPaintBody(true); }, 0); });
  wrap.addEventListener('click', e => {
    if (typeof opnCollClick === 'function' && opnCollClick(e)) return;      // session d'ouverture (opening.js) : sa note, sa liste en mode streamer
    if (typeof msClick === 'function' && msClick(e)) return;      // masterset (masterset.js) : interrupteur, édition, filtres, cartes
    if (e.target.closest('.lchip')) return;
    if (e.target.closest('.cs-val[data-act="pxsrc"]')) { collToggleSrc(); return; }
    if (edhClick(e) || valClick(e) || trClick(e) || plcClick(e)) return;
    const b = e.target.closest('button[data-act]');
    if (b) {
      const act = b.dataset.act;
      if (act === 'close') wrap.__close();
      else if (act === 'add') openLot();
      else if (act === 'ed') { const r = b.closest('.crow'); if (r && r.dataset.k) collEdPick(r.dataset.k, rowG(r)); }
      else if (act === 'scan') openScan();
      else if (act === 'dnew') openDeckNew();
      else if (act === 'valtab') { if (COLL.tab !== 'stats') { haptic('tap'); COLL.tab = COLL.ctab = 'stats'; const sg = $('#collSeg', wrap); if (sg && sg.setValue) sg.setValue('stats'); COLL.shown = COLL_PAGE; collPaintBody(false); } }
      else if (act === 'import') openCollImport();
      else if (act === 'swg') swgOpen({ from: 'empty' });      // collection vide : « Tu viens de ManaBox ? » (switch.js)
      else if (act === 'simgcoll') simgColl();      // Stats : « Partager en image » (simg.js)
      else if (act === 'enrich') { COLL.enrichErr = ''; collEnrich(); }
      else if (act === 'unknown') openCollUnknown();
      else if (act === 'nolang') collBulkLang(b.dataset.l);
      else if (act === 'prices') openCollPrices();
      else if (act === 'login') openAccount();
      else if (act === 'export') collExport();
      else if (act === 'syncinfo') { const si = collSyncInfo(); if (si) toast(si.t); }
      else if (act === 'resync') collSyncNow();
      else if (act === 'pxstop') { if (COLL.pxRun) COLL.pxRun.ctrl.abort(); }
      else if (act === 'pxok') { COLL.pxMsg = null; collPaintHead(); }
      else if (act === 'more') collMore();
      else if (act === 'dcan') { COLL.f.cmdr = 'can'; COLL.cmdrSeen = 'can'; if (COLL.fb) COLL.fb.paint(); collPaintBody(true); }
      else if (act === 'topmore') { COLL.topN += 10; collPaintBody(true); }
      else if (act === 'topby') { if (COLL.topBy !== b.dataset.v) { COLL.topBy = b.dataset.v === 'one' ? 'one' : 'lot'; COLL.topN = 10; haptic('tap'); collPaintBody(true); } }
      return;
    }
    const st = e.target.closest('.qstep button');
    if (st) {
      const rowEl = st.closest('.crow'), k = rowEl.dataset.k, ln = rowG(rowEl), cur = COLL.map[k]; if (!cur) return;
      const lines = collLines(cur), line = lines.find(x => x[0] === ln); if (!line) return;
      const d = Number(st.dataset.d), tag = lines.length > 1 ? lineTag(ln) : '', same = r => r.dataset.k === k && rowG(r) === ln; haptic('tap');
      const step = () => {                                  // le « − » passe par une confirmation ; la ligne est retrouvée à ce moment-là (la liste a pu être repeinte)
        const c = COLL.map[k]; if (!c) return;
        const was = (collLines(c).find(x => x[0] === ln) || [ln, 0])[1], multi = collLines(c).length > 1, name = c.n, date = c.d, q = collBump(k, name, d, { paint: false, lang: ln }), row = $$('.crow', wrap).find(same);
        if (q) { if (row) $('.qstep b', row).textContent = q; }
        else {
          if (multi) collPaintBody(true); else if (row) row.remove();      // une langue de moins : les autres lignes de la carte se réorganisent
          toast(T('{name} retirée de la collection', { name: name + (multi ? ' (' + lineTag(ln) + ')' : '') }), { label: T('Annuler'), fn: () => { collBump(k, name, was, { date, lang: ln }); } });
        }
      };
      if (d < 0) confirmMinus(cur.n, line[1], 'coll', step, tag); else step();
      return;
    }
    const th = e.target.closest('.thumb');
    if (th && th.querySelector('img.ok')) {
      const row = th.closest('.crow'); if (!row) return;
      const rows = $$('.crow', row.parentNode), list = rows.map(r => collViewItem(r.dataset.k, rowG(r))).filter(Boolean);
      const i = list.findIndex(x => x.lid === row.dataset.k + '|' + rowG(row)); if (i >= 0) { openCardViewer(list, i); return; }
    }
    // le reste de la ligne (nom, étiquettes, prix) : la fiche de la carte (cardsheet.js) ; Échange : lignes du propriétaire (doublons, recherchées, gardées)
    const crow = typeof openCardSheet === 'function' && e.target.closest('.crow[data-k]');
    if (crow && !crow.classList.contains('dk') && !e.target.closest('a,input,select,label,details>summary')) openCardSheet(crow.dataset.k, COLL.tab === 'trade' ? { from: 'trade', l: crow.dataset.ln || '', n: zoomName(crow) || undefined } : { from: 'coll', l: rowG(crow) });
  });
  document.body.appendChild(wrap); holdApp(); collPaintHead(); collPaintBody(false);
  requestAnimationFrame(() => requestAnimationFrame(() => { wrap.classList.add('on'); const f = $('.dk-tab[aria-current], #collSeg [aria-checked="true"], .coll-tools .icon-btn, .dv-title', wrap); if (f) { if (!f.hasAttribute('tabindex') && f.classList.contains('dv-title')) f.tabIndex = -1; f.focus({ preventScroll: true }); } }));
  haptic('tap');
  if ((collMissing().length || collLangMissingCount()) && !COLL.enrichErr) collEnrich(); else { valMaybe(); edRefresh(); collSoloSoon(); }
  if (collEds().length) setIcLoad(() => { if (COLL.el) collPaintSoon(); });      // symboles des extensions (étiquettes d'édition) : seulement si des lignes en ont une
}
/** Ligne (clé langue|édition) d'une rangée de la liste. */
const rowG = r => r.dataset.g ?? (r.dataset.ln || '');
/** « FR », « FR · CMM 400 », « sans langue » : nom court d'une ligne. */
const lineTag = g => { const l = lineLang(g), e = lineEd(g); return [l ? langCode(l) : (e || lineFoil(g) ? '' : T('sans langue')), edLabel(e), lineFoil(g) ? T('Foil') + ' ✦' : ''].filter(Boolean).join(' · '); };
/** Carte d'une ligne pour l'aperçu en grand. coll : { k, g } — le choix d'une illustration y fixe l'édition de la ligne (collSetEd). */
function collViewItem(k, ln) {
  const x = COLL.map[k], m = COLL.meta[k]; if (!x || !m || !m.im) return null;
  const ls = collLines(x), line = ls.find(e => e[0] === (ln || '')) || ls[0] || [x.l || '', x.q], g = line[0], l = lineLang(g), e = lineEd(g), n = line[1];
  const im = collLineImage(k, g, m.im), fr = l && l !== 'en' && im.lang === 'en' && !e ? ' · ' + T('image anglaise (pas d\'image {lang} sur Scryfall)', { lang: LANGS[l] ? T(LANGS[l]) : l }) : '';
  const own = ls.length > 1 ? TN(n, '{n} exemplaire {lang} · {total} au total', '{n} exemplaires {lang} · {total} au total', { n, lang: lineTag(g), total: x.q }) : TN(x.q, '{n} exemplaire dans ta collection', '{n} exemplaires dans ta collection', { n: x.q });
  const f = lineFoil(g), eu = e ? edEu(e, f) : f && m.ef > 0 ? m.ef : null, px = eu != null ? ' · ' + T(f ? 'prix foil Cardmarket {v}' : 'prix Cardmarket {v}', { v: fmt(eu, 'EUR') }) : Number.isFinite(m.eu) ? ' · ' + T('réf. Cardmarket {v}', { v: fmt(m.eu, 'EUR') }) : '';
  const sn = e ? setName(edSet(e)) || (COLL.ed[e] || {}).sn || '' : '';
  return { key: k, lid: k + '|' + g, name: frName(k, l) || x.n, ln: x.n, wl: l && l !== 'en' && !e ? l : '', small: im.src, lang: im.lang, plain: true, coll: { k, g }, ...(f ? { foil: true } : {}),
    ...(e ? { set: edSet(e), num: edNum(e), setName: sn } : {}),
    extra: `${own}${px}${COLL.px[k] && Number.isFinite(COLL.px[k].p) ? ' · ' + T('offre CardTrader {v}', { v: fmt(COLL.px[k].p, COLL.px[k].c || 'EUR') }) : ''}${fr}` };
}

/* ── Noms inconnus de Scryfall (faute de frappe, ligne d'en-tête, nom français de plusieurs cartes) : signalés, noms proches proposés ── */
/** Cartes que Scryfall n'a pas trouvées (infos lues : null). */
const collUnknown = () => Object.keys(COLL.map).filter(k => COLL.meta[k] === null && !BASIC_NAMES.has(k));      // terrains de base : toujours de vraies cartes
/** Remplace une carte par une autre (nom anglais) : ses exemplaires rejoignent ceux de la nouvelle, langue par langue ; fr : nom français choisi → exemplaires sans langue en français.
 *  Retourne l'annulation (remet les deux entrées comme avant). */
function collRename(k, en, fr) {
  const cur = COLL.map[k], nk = ownKey(en); if (!cur || !nk) return null;
  const had = nk !== k ? COLL.map[nk] || null : null, m = { ...COLL.map }, lines = collLines(had).map(e => e.slice());
  for (const [g0, q] of collLines(cur)) { const g = lineLang(g0) ? g0 : lineKey(fr ? FRX.l : '', lineEd(g0), lineFoil(g0), lineAw(g0)), e = lines.find(x => x[0] === g); if (e) e[1] = Math.min(9999, e[1] + q); else lines.push([g, q]); }
  delete m[k];
  m[nk] = collFromLines({ ...(had || {}), n: (had && had.n) || en, d: (had && had.d) || cur.d || dateNowSec() }, lines);
  COLL.map = m; collChanged(); collEnrich();
  return () => { const r = { ...COLL.map }; delete r[nk]; if (had) r[nk] = had; r[k] = cur; COLL.map = r; collChanged(); };
}
/** Retire une carte de la collection ; retourne l'annulation. */
function collDrop(k) {
  const cur = COLL.map[k]; if (!cur) return null;
  const m = { ...COLL.map }; delete m[k]; COLL.map = m; collChanged();
  return () => { COLL.map = { ...COLL.map, [k]: cur }; collChanged(); };
}
const ukLabel = s => (s.p ? `${esc(s.p)} <small>${esc(s.n)}</small>` : esc(s.n));
/** Feuille « Noms inconnus » : chaque nom avec 1 à 3 noms proches (fautes de frappe, noms français), « Remplacer » ou « Supprimer ». */
function openCollUnknown() {
  const keys = collUnknown().sort((a, b) => NAME_CMP(COLL.map[a].n, COLL.map[b].n)); if (!keys.length) { collPaintHead(); return; }
  frLoad();
  openSheet(T('Noms inconnus'), TN(keys.length, 'Scryfall ne connaît pas ce nom : remplace-le par la bonne carte ou retire-le.', 'Scryfall ne connaît pas ces noms : remplace-les par la bonne carte ou retire-les.'), api => {
    const rows = keys.slice(0, 40), sug = new Map();
    const rowHtml = k => {
      const x = COLL.map[k], ls = collLines(x);
      return `<div class="uk-row" data-k="${esc(k)}"><div class="uk-top"><b>${esc(x.n)}</b><span class="tag accent">× ${nf0(x.q)}</span>${langLines(ls).filter(e => e[0]).map(e => `<span class="tag">${esc(langCode(e[0]))}</span>`).join('')}</div>
        <div class="uk-sug" role="radiogroup" aria-label="${T('Noms proches de {name}', { name: esc(x.n) })}"><span class="hint">${T('Recherche de noms proches…')}</span></div>
        <div class="uk-acts"><button class="btn small" type="button" data-uk="rep" disabled>${T('Remplacer')}</button><button class="btn ghost small" type="button" data-uk="del">${T('Supprimer')}</button></div></div>`;
    };
    api.body.innerHTML = `<div class="uk-list">${rows.map(rowHtml).join('')}</div>${keys.length > rows.length ? `<p class="hint">${T('Et {n} autres : corrige d\'abord ceux-ci, la liste se complète ensuite.', { n: nf0(keys.length - rows.length) })}</p>` : ''}`;
    api.setFoot(`<button class="btn ghost" type="button" data-close>${T('Fermer')}</button>`);
    const paintSug = k => {
      const el = $(`.uk-row[data-k="${CSS.escape(k)}"]`, api.body); if (!el) return;
      const s = sug.get(k) || [], box = $('.uk-sug', el), rep = $('[data-uk="rep"]', el);
      box.innerHTML = s.length ? s.map((x, i) => `<button type="button" class="uk-opt" role="radio" aria-checked="${!i}" data-i="${i}">${ukLabel(x)}</button>`).join('') : `<span class="hint">${T('Aucune carte proche : vérifie le nom, ou retire la ligne.')}</span>`;
      rep.disabled = !s.length; rep.hidden = !s.length;
    };
    (async () => {      // noms proches, un nom après l'autre (≈ 20 ms chacun sur un téléphone) : la feuille reste fluide
      const cat = await collCatalog().catch(() => null); await frLoad();
      for (const k of rows) { if (!api.body.isConnected) return; const x = COLL.map[k]; if (!x) continue; sug.set(k, nameSuggest(x.n, cat && cat.idx, 3)); paintSug(k); await sleep(0); }
    })();
    api.body.addEventListener('click', e => {
      const o = e.target.closest('.uk-opt'); if (o) { $$('.uk-opt', o.parentNode).forEach(b => b.setAttribute('aria-checked', String(b === o))); haptic('tap'); return; }
      const b = e.target.closest('[data-uk]'); if (!b) return;
      const row = b.closest('.uk-row'), k = row.dataset.k, x = COLL.map[k]; if (!x) { row.remove(); return; }
      let undo, msg;
      if (b.dataset.uk === 'rep') {
        const sel = $('.uk-opt[aria-checked="true"]', row), s = (sug.get(k) || [])[sel ? Number(sel.dataset.i) : 0]; if (!s) return;
        undo = collRename(k, s.n, !!s.p); msg = T('{a} → {b}', { a: x.n, b: s.p && frKey(s.p) !== frKey(x.n) ? s.p : s.n });      // nom français différent de celui tapé : on le montre ; sinon (nom ambigu) la carte anglaise choisie
      } else { undo = collDrop(k); msg = T('{name} retirée de la collection', { name: x.n }); }
      haptic('ok'); row.remove();
      if (!$('.uk-row', api.body)) api.close();
      toast(msg, undo ? { label: T('Annuler'), fn: undo } : undefined);
    });
  });
}

/* ── Langue des cartes « non précisée » : en une fois (import de texte sans langue) ── */
/** Une carte a-t-elle des exemplaires sans langue ? */
const collNoLang = x => (x.x ? Object.keys(x.x).some(g => !lineLang(g) && x.x[g] > 0) : !x.l);
/** Tous les exemplaires sans langue passent dans la langue l (ils rejoignent la ligne de cette langue si la carte en a déjà une). Annulable. */
function collBulkLang(l) {
  if (!l || !LANGS[l]) return;
  const before = COLL.map, m = {}; let n = 0;
  for (const [k, x] of Object.entries(before)) {
    if (!collNoLang(x)) { m[k] = x; continue; }
    const lines = []; for (const [g, q] of collLines(x)) { const to = lineLang(g) ? g : lineKey(l, lineEd(g), lineFoil(g), lineAw(g)), e = lines.find(y => y[0] === to); if (e) e[1] += q; else lines.push([to, q]); }
    m[k] = collFromLines(x, lines); n++;
  }
  if (!n) return;
  COLL.map = m; haptic('ok'); collChanged(); collEnrich();      // images dans la langue choisie
  toast(TN(n, '{n} carte passée en {lang}', '{n} cartes passées en {lang}', { lang: T(LANGS[l]) }), { label: T('Annuler'), fn: () => { COLL.map = before; collChanged(); } });
}
/** Bandeau en tête de la liste quand des cartes n'ont pas de langue (« Langue ? ») : les passer toutes en français, en anglais ou dans une autre langue. */
function collNoLangHtml(v) {
  if (v.nl === undefined) { let n = 0; for (const k in COLL.map) if (collNoLang(COLL.map[k])) n++; v.nl = n; }
  if (!v.nl) return '';
  const LN = l => { const s = T(LANGS[l]); return s[0].toUpperCase() + s.slice(1); };
  return `<div class="coll-nolang"><span>${TN(v.nl, '<b>{n}</b> carte sans langue', '<b>{n}</b> cartes sans langue')} →</span><button class="btn ghost small" type="button" data-act="nolang" data-l="fr">${LN('fr')}</button><button class="btn ghost small" type="button" data-act="nolang" data-l="en">${LN('en')}</button>
    <label class="sortsel nl-more"><select data-act="nolangsel" aria-label="${T('Toutes les cartes sans langue dans une autre langue')}"><option value="">${T('Autre…')}</option>${CARD_LANG_LIST.filter(l => l !== 'fr' && l !== 'en').map(l => `<option value="${l}">${esc(LN(l))}</option>`).join('')}</select></label></div>`;
}

/* ── Ajouter à la main ────────────────────────────────────────────────────────────────────────── */
/** o.pick(c) : la carte choisie ({ k, n, l, p }) est rendue à l'appelant et la feuille se ferme, rien n'est ajouté ici (scan › « Saisir » : la carte rejoint le scan). */
function openCollAdd(o) {
  frLoad();
  openSheet(T('Ajouter une carte'), nmT('Tape son nom en anglais ou en français', 'Tape son nom en anglais ou en {lang}', 'Tape son nom en anglais'), api => {
    api.body.innerHTML = `<div class="field-in"><label class="label" for="caName">${T('Nom de la carte')}</label><input type="text" id="caName" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="${esc(nmExample())}" enterkeyhint="search"></div>
      <div class="field-in"><label class="label" for="caLang">${T('Langue des exemplaires ajoutés')}</label><div class="sel"><select id="caLang"><option value="">${T('Celle de la carte (sinon non précisée)')}</option>${CARD_LANG_LIST.map(x => { const n = T(LANGS[x]); return `<option value="${x}">${esc(n[0].toUpperCase() + n.slice(1))}</option>`; }).join('')}</select></div></div>
      <div class="status" id="caStatus" data-ok="0" hidden><span class="dot"></span><span></span></div>
      <div class="ca-list" id="caList" role="listbox" aria-label="${T('Suggestions')}"></div>`;
    const inp = $('#caName', api.body), list = $('#caList', api.body), stt = $('#caStatus', api.body), lang = $('#caLang', api.body);
    let cat = null;
    const say = (t, ok) => { stt.hidden = !t; if (t) { $('span:last-child', stt).textContent = t; stt.dataset.ok = ok ? '1' : '0'; } };
    const paint = () => {
      const q = inp.value.trim();
      if (!cat) { list.innerHTML = ''; return; }
      const sug = collSuggestX(cat, q, 12, () => { if (inp.isConnected) paint(); });
      list.innerHTML = sug.map(x => { const k = ownKey(x.n), have = collQty(k); return `<button type="button" class="ca-opt" role="option" data-n="${esc(x.n)}"${x.p ? ` data-p="${esc(x.p)}"` : ''}${x.l ? ` data-l="${esc(x.l)}"` : ''}><span>${sugHtml(x.n, q, x.p || '', x.l)}</span><i>${have ? `× ${have}` : '+'}</i></button>`; }).join('')
        || (q.length >= 2 && NMX.p ? '<p class="hint">' + T('Recherche dans les autres langues…') + '</p>' : q.length >= 2 ? '<p class="hint">' + (FRX.ix || !namesLang() ? T('Aucune carte de ce nom. Vérifie l\'orthographe.') : nmT('Aucune carte de ce nom. Vérifie l\'orthographe (les noms français arrivent dès que leur liste est chargée).', 'Aucune carte de ce nom. Vérifie l\'orthographe (les noms en {lang} arrivent dès que leur liste est chargée).')) + '</p>' : '');
    };
    list.onclick = e => {
      const b = e.target.closest('.ca-opt'); if (!b) return;
      const n = b.dataset.n, p = b.dataset.p || '', k = ownKey(n), l = lang.value || b.dataset.l || (p ? FRX.l : '');      // nom français (allemand, italien…) choisi : exemplaire dans cette langue (sauf langue choisie au-dessus)
      if (o && o.pick) { haptic('ok'); api.close(); o.pick({ k, n, l, p }); return; }
      if (typeof opnTake === 'function' && opnTake([{ k, n, q: 1, l }])) { haptic('ok'); b.classList.remove('pop'); void b.offsetWidth; b.classList.add('pop'); say(opnSay(p || n), true); return; }      // session d'ouverture (opening.js) : dans la session
      collBump(k, n, 1, l ? { lang: l } : undefined); const q = collQty(k); haptic('ok');
      const i = $('i', b); i.textContent = '× ' + q; b.classList.remove('pop'); void b.offsetWidth; b.classList.add('pop');
      say(T('{name} · {q} dans ta collection', { name: p || n, q }), true); collEnrich();
    };
    inp.oninput = paint;
    const onFr = () => { if (inp.isConnected) paint(); else FRN.on.delete(onFr); };      // index français arrivé pendant la saisie
    FRN.on.add(onFr);
    say(T('Chargement du catalogue (une seule fois)…'), false);
    collCatalog().then(c => { cat = c; say(''); paint(); }).catch(e => say(e && e.code === 'rate' ? T('Scryfall demande une pause, réessaie dans une minute.') : T('Catalogue Scryfall injoignable : réessaie plus tard.'), false));
    setTimeout(() => inp.focus(), 380);
  });
}

/* ── Importer (fichier CSV, texte collé, texte partagé) ───────────────────────────────────────── */
/** Langue proposée pour les cartes importées sans langue : la langue de cartes de l'utilisateur (interface en français → cartes françaises ; anglais sur un téléphone allemand → allemandes). */
const collImportLang = () => { const l = userLang(); return CARD_LANG_LIST.includes(l) ? l : I18N.lang === 'en' ? 'en' : 'fr'; };
const GLANCE_MIN = 10;      // « coup d'œil » après un import d'au moins 10 cartes (pas après 2 cartes ajoutées)
const REIMPORT_MIN = 5;      // « Déjà importé ? » : à partir de 5 cartes différentes (ajouter « 1 Sol Ring » qu'on a déjà n'est pas une erreur)
/** Exemplaires d'un import déjà dans la collection (au plus la quantité de chaque carte). 90 % ou plus en « Ajouter » : sans doute le même fichier
 *  (ou son nouvel export, quelques cartes en plus) importé une 2e fois, qui doublerait toutes les quantités. */
const collAlready = items => items.reduce((a, x) => a + Math.min(x.q, collQty(x.k)), 0);
const collReimport = p => p.items.length >= REIMPORT_MIN && collAlready(p.items) >= p.copies * 0.9;
function openCollImport(initial) {
  frLoad();      // noms français reconnus dès que l'index est là (aperçu repeint à son arrivée)
  openSheet(T('Importer ma collection'), T('ManaBox, Moxfield, Archidekt, Deckbox, Dragon Shield… ou une liste « 3 Sol Ring »'), api => {
    const opt = (v, t, on) => `<option value="${v}"${on ? ' selected' : ''}>${esc(t)}</option>`, LN = l => { const s = T(LANGS[l]); return s[0].toUpperCase() + s.slice(1); }, l0 = collImportLang();
    api.body.innerHTML = `<p class="hint">${T('Le plus simple pour beaucoup de cartes : exporte ta collection en CSV depuis l\'appli que tu utilises, puis choisis le fichier. Les quantités d\'une même carte (éditions différentes) s\'additionnent ; une ligne par langue si le fichier la donne.')}</p>
      <p class="ci-swg"><span>${T('Tu viens de ManaBox ou d\'une autre appli ?')}</span> <button class="link-btn" type="button" data-swg="open">${T('Le guide en 2 minutes')}</button></p>
      <label class="btn ghost small ci-file"><svg class="i"><use href="#i-download"/></svg>${T('Choisir un fichier')}<input type="file" id="ciFile" accept=".csv,.tsv,.txt,text/csv,text/plain,text/tab-separated-values"></label>
      <div class="field-in"><label class="label" for="ciText">${T('ou colle le texte')}</label><textarea id="ciText" class="ci-text" spellcheck="false" autocapitalize="off" autocomplete="off" placeholder="3 Sol Ring&#10;1 ${esc(nmExample(true))}"></textarea></div>
      <div class="ci-sum" id="ciSum" hidden></div>
      <div class="ci-flag" id="ciFlag" hidden></div>
      <div class="field-in"><label class="label" for="ciLang">${T('Langue de ces cartes')}</label><div class="sel"><select id="ciLang">${CARD_LANG_LIST.map(l => opt(l, LN(l), l === l0)).join('')}${opt('', T('Non précisée'), false)}</select></div>
        <p class="hint ci-lhint">${nmT('Pour les lignes qui ne la donnent pas : une colonne « Language » ou « *EN* » en fin de ligne l\'emporte, et un nom français compte comme une carte française.', 'Pour les lignes qui ne la donnent pas : une colonne « Language » ou « *EN* » en fin de ligne l\'emporte, et un nom en {lang} compte comme une carte en {lang}.', 'Pour les lignes qui ne la donnent pas : une colonne « Language » ou « *EN* » en fin de ligne l\'emporte.')}</p></div>
      <div class="seg" id="ciMode" role="radiogroup" aria-label="${T('Mode d\'import')}"></div>`;
    mountSeg($('#ciMode', api.body), [{ v: 'add', label: T('Ajouter') }, { v: 'replace', label: T('Remplacer ma collection') }], collCount() ? 'add' : 'replace', () => paint());
    api.setFoot(`<button class="btn ghost" type="button" data-close>${T('Annuler')}</button><button class="btn" type="button" id="ciGo" disabled>${T('Importer')}</button>`);
    const ta = $('#ciText', api.body), sum = $('#ciSum', api.body), flag = $('#ciFlag', api.body), lang = $('#ciLang', api.body), go = $('#ciGo', api.foot), mode = () => $('#ciMode', api.body)._v || 'add';
    let parsed = null, catAsked = false;
    const paint = () => {
      const t = ta.value; parsed = t.trim() ? parseCollection(t, { fr: true, lang: lang.value }) : null;
      sum.hidden = !parsed; flag.hidden = true;
      go.disabled = !parsed || !parsed.items.length;
      if (!parsed) { go.textContent = T('Importer'); return; }
      if (!parsed.items.length) { sum.className = 'ci-sum bad'; sum.textContent = parsed.format === 'csv' ? T('Aucune carte lue dans ce CSV : il faut une colonne « Name » (ou « Nom »).') : T('Aucune ligne reconnue. Une carte par ligne : « 3 Sol Ring ».'); return; }
      const rep = mode() === 'replace' && collCount();
      sum.className = 'ci-sum'; sum.innerHTML = `<div>${TN(parsed.items.length, '<b>{n}</b> carte différente', '<b>{n}</b> cartes différentes')} · ${TN(parsed.copies, '<b>{n}</b> exemplaire', '<b>{n}</b> exemplaires')}</div><span>${parsed.format === 'csv' ? T('Fichier CSV') : T('Liste texte')}${parsed.fr ? ' · ' + (FRX.l === 'fr' ? TN(parsed.fr, '{n} nom français reconnu', '{n} noms français reconnus') : TN(parsed.fr, '{n} nom en {lang} reconnu', '{n} noms en {lang} reconnus', { lang: LANGS[FRX.l] || FRX.l })) : ''}${parsed.skipped ? ' · ' + TN(parsed.skipped, '{n} ligne ignorée', '{n} lignes ignorées') : ''}${parsed.listed ? ' · ' + TN(parsed.listed, '{n} carte d\'une liste ManaBox (souhaits) laissée de côté', '{n} cartes de listes ManaBox (souhaits) laissées de côté') : ''}${parsed.places && Object.keys(parsed.places).length ? ' · ' + TN(Object.keys(parsed.places).length, '{n} classeur rangé en emplacement', '{n} classeurs rangés en emplacements') : ''}${rep ? ' · ' + T('remplace les {n} cartes actuelles', { n: nf0(collCount()) }) : ''}</span>`;      // un bloc par ligne : la carte .ci-sum est une colonne flex
      go.textContent = TN(parsed.items.length, 'Importer {n} carte', 'Importer {n} cartes');
      // noms que Scryfall ne connaîtra pas (catalogue des noms anglais + index français) : signalés avant l'import, corrigeables après
      if (!COLL.names) { if (!catAsked) { catAsked = true; collCatalog().then(() => { if (ta.isConnected) paint(); }).catch(() => {}); } return; }
      const unk = parsed.items.filter(x => !BASIC_NAMES.has(x.k) && !COLL.names.idx.by.has(x.k)).map(x => x.n), amb = new Set(parsed.amb);
      if (!unk.length) return;
      const show = unk.slice(0, 4).map(n => '<b>' + esc(n) + '</b>' + (amb.has(n) ? ' ' + (FRX.l === 'fr' ? T('(nom français de plusieurs cartes)') : T('(nom en {lang} de plusieurs cartes)', { lang: LANGS[FRX.l] || FRX.l })) : '')).join(', ') + (unk.length > 4 ? ' ' + T('et {n} autres', { n: nf0(unk.length - 4) }) : '');
      flag.hidden = false; flag.innerHTML = `<svg class="i" aria-hidden="true"><use href="#i-alert"/></svg><span>${TN(unk.length, '{n} nom inconnu de Scryfall : {list}. Tu pourras le corriger après l\'import.', '{n} noms inconnus de Scryfall : {list}. Tu pourras les corriger après l\'import.', { list: show })}</span>`;
    };
    ta.oninput = paint; lang.onchange = () => { haptic('tap'); paint(); };
    $('[data-swg="open"]', api.body).onclick = () => { haptic('tap'); swgOpen({ from: 'import' }); };      // guide « Passer de ManaBox » (switch.js), par-dessus
    const onFr = () => { if (ta.isConnected) { if (ta.value.trim()) paint(); } else FRN.on.delete(onFr); };
    FRN.on.add(onFr);
    $('#ciFile', api.body).onchange = async e => {
      const f = e.target.files && e.target.files[0]; if (!f) return;
      if (f.size > 8 * 1024 * 1024) { toast(T('Fichier trop gros (8 Mo maximum)')); return; }
      try { ta.value = await f.text(); paint(); haptic('tap'); } catch (err) { toast(T('Fichier illisible')); }
    };
    const run = (parsed, m) => {
      const before = COLL.map, pl0 = COLL.places, n = parsed.items.length, undo = () => { COLL.map = before; COLL.places = pl0; collChanged(); };
      collAdd(typeof plcImport === 'function' ? plcImport(parsed) : parsed.items, m); api.close(); haptic('ok'); FRN.on.delete(onFr);      // classeurs ManaBox → emplacements (places.js)
      if (parsed.format === 'csv' && typeof prgAdd === 'function') prgAdd('imp');      // badge « Déménageur » (progress.js)
      toast(m === 'replace' ? TN(n, '{n} carte dans ta collection', '{n} cartes dans ta collection') : TN(n, '{n} carte ajoutée', '{n} cartes ajoutées'), { label: T('Annuler'), fn: undo });
      collEnrich();
      if (n >= GLANCE_MIN) setTimeout(() => openCollGlance(n, m, undo), reduceMotion() ? 0 : 480);      // après la fermeture de l'import ; l'annulation reste possible depuis le coup d'œil
    };
    /** Petite fiche par-dessus l'import (même modèle que « Retirer… ») ; on(choix) au clic d'un [data-ci]. */
    const ask = (title, html, foot, on) => openSheet(title, '', a => {
      a.body.innerHTML = html; a.setFoot(foot);
      a.wrap.addEventListener('click', e => { const b = e.target.closest('[data-ci]'); if (b) { a.close(); on(b.dataset.ci); } });
    });
    // « Remplacer ma collection » : jamais sans le dire, avec le nombre de cartes qui partent
    const askReplace = p => { const had = collCount(); haptic('tap');
      ask(T('Remplacer ta collection ?'), `<p class="cf-msg"><span>${TN(had, 'Ta collection compte <b>{n}</b> carte différente.', 'Ta collection compte <b>{n}</b> cartes différentes.')} ${TN(p.items.length, 'Elle sera remplacée par l\'unique carte de ce fichier.', 'Elle sera remplacée par les {n} cartes de ce fichier.')}</span><span>${T('Les cartes absentes du fichier quittent ta collection. « Annuler », juste après, la remet.')}</span></p>`,
        `<button class="btn ghost" type="button" data-close>${T('Annuler')}</button><button class="btn danger" type="button" data-ci="replace">${T('Remplacer')}</button>`, () => run(p, 'replace')); };
    go.onclick = () => {
      if (!parsed || !parsed.items.length) return;
      const p = parsed, m = mode();
      if (m === 'replace' && collCount()) { askReplace(p); return; }
      if (m === 'add' && collReimport(p)) {      // même fichier une 2e fois : toutes les quantités doubleraient
        haptic('tap');
        ask(T('Déjà dans ta collection ?'), `<p class="cf-msg"><span>${TN(collAlready(p.items), '<b>{n}</b> exemplaire sur {t} de ce fichier est déjà dans ta collection : l\'ajouter le compterait deux fois.', '<b>{n}</b> exemplaires sur {t} de ce fichier sont déjà dans ta collection : les ajouter les compterait deux fois.', { t: nf0(p.copies) })}</span><span>${T('Tu as déjà importé ce fichier ? Remplace plutôt ta collection par son contenu.')}</span></p><button class="link-btn ci-rep" type="button" data-ci="replace">${T('Remplacer ma collection…')}</button>`,
          `<button class="btn ghost" type="button" data-close>${T('Annuler')}</button><button class="btn" type="button" data-ci="add">${T('Ajouter quand même')}</button>`,
          c => { if (c === 'add') run(p, 'add'); else setTimeout(() => askReplace(p), reduceMotion() ? 0 : 300); });
        return;
      }
      run(p, m);
    };
    if (initial) { ta.value = initial; paint(); }
  });
}

/* ── Après un import : « Ta collection en un coup d'œil » (valeur, la plus chère, decks EDHREC à finir), mise à jour pendant la lecture Scryfall ── */
const GLANCE = { api: null, n: 0, m: 'add', undo: null, edh: null };
const GLANCE_BUDGET = 6000;      // decks à finir pour moins de 60 € (un palier du filtre « Budget » de l'onglet Decks)
function openCollGlance(n, m, undo) {
  if (sheets.length || !collCount()) return;      // une autre feuille est ouverte entre-temps : on ne s'impose pas
  if (edhGate() === 'ok') { edhEnsure(); if (EDH.p) EDH.p.then(paintGlance, () => {}); }      // decks EDHREC réservés aux comptes : sans compte, ni calcul ni téléchargement
  Object.assign(GLANCE, { n, m, undo, edh: null });
  openSheet(T('Ta collection en un coup d\'œil'), m === 'replace' ? TN(n, '{n} carte importée', '{n} cartes importées') : TN(n, '{n} carte ajoutée', '{n} cartes ajoutées'), api => {
    GLANCE.api = api;
    api.wrap.addEventListener('load', e => { if (e.target.tagName === 'IMG') e.target.classList.add('ok'); }, true);      // vignette : affichée une fois chargée, comme dans la liste
    api.setFoot(`<button class="btn ghost" type="button" data-g="undo">${T('Annuler l\'import')}</button><button class="btn" type="button" data-close>${T('Voir mes cartes')}</button>`);
    api.wrap.addEventListener('click', e => {
      const b = e.target.closest('[data-g]'); if (!b) return;
      const g = b.dataset.g; api.close();
      if (g === 'undo') { if (GLANCE.undo) GLANCE.undo(); toast(T('Import annulé')); }
      else if (g === 'stats' || g === 'decks') {
        if (g === 'decks' && edhGate() === 'ok') { EDH.budget = GLANCE_BUDGET; EDH.sort = 'have'; EDH.then = 'cost'; EDH.shown = 30; EDH.memo = null; }
        if (COLL.el && COLL.mode === COLL_MODES[g]) { COLL.tab = g; if (g === 'stats') COLL.ctab = g; const s = $('#collSeg', COLL.el), sc = $('.dv-scroll', COLL.el); if (s && s.setValue) s.setValue(g); collPaintBody(false); if (sc) sc.scrollTop = 0; } else if (typeof navOpen === 'function') navOpen(() => openCollection(g)); else openCollection(g);      // Decks › À monter : la section Decks
      }
    });
    paintGlance();
  });
}
/** Contenu du coup d'œil (repeint à chaque lot lu sur Scryfall, et à l'arrivée des decks EDHREC). */
function paintGlance() {
  const api = GLANCE.api; if (!api || !sheets.includes(api)) { GLANCE.api = null; return; }
  const items = collAll().all, st = collStats(items, 'cm'), e = COLL.enrich, top = st.topUnit[0];
  const reading = e && e.ph === 'info';
  const val = st.valued ? `<b>${esc(fmt(st.value, 'EUR'))}</b><span>${T('valeur · tendance Cardmarket')}${st.valued < st.unique ? ' ' + T('({n} cartes)', { n: nf0(st.valued) }) : ''}</span>` : `<b>—</b><span>${reading ? T('lecture des prix…') : T('aucun prix connu')}</span>`;
  const prog = reading ? `<p class="hint gl-prog">${T('Lecture des cartes sur Scryfall · {a} / {b}', { a: nf0(e.done), b: nf0(e.total) })}</p>` : '';
  const best = top ? `<h3 class="cs-h">${T('La plus chère')}</h3><div class="crow ro gl-top"><span class="thumb" style="--h:${hash32(top.k) % 360}">${esc(((top.dn || top.n).trim()[0] || '?').toUpperCase())}${top.im ? `<img alt="" decoding="async" src="${esc(collImage(top.k, top.l, top.im).src)}">` : ''}</span><span class="row-main"><span class="row-name">${esc(top.dn || top.n)}</span>${top.q > 1 ? `<span class="row-meta"><span class="tag accent">× ${nf0(top.q)}</span></span>` : ''}</span><span class="row-price"><b>${esc(fmt(top.up, 'EUR'))}</b></span></div>` : '';
  let dk = ''; const eg = edhGate();
  if (eg === 'off') { /* EDHREC coupé par le serveur : pas de ligne « Decks EDHREC » */ }
  else if (eg !== 'ok') dk = `<div class="gl-edh"><span>${T('<b>Decks EDHREC</b> à finir avec tes cartes : réservés aux comptes')}</span><button class="btn ghost small" type="button" data-g="decks">${T('Voir')}</button></div>`;
  else if (EDH.data && !reading) {
    const sig = COLL.seq + '|' + EDH.at;
    if (!GLANCE.edh || GLANCE.edh.sig !== sig) GLANCE.edh = { sig, n: edhRank(EDH.data, collQty, { budget: GLANCE_BUDGET, sort: 'have' }).filter(r => r.have >= r.total * 0.3).length };      // au moins 30 % du deck déjà là : un vrai deck « à finir »
    const nd = GLANCE.edh.n;
    if (nd) dk = `<div class="gl-edh"><span>${TN(nd, '<b>{n}</b> deck EDHREC à moins de {v} de finir', '<b>{n}</b> decks EDHREC à moins de {v} de finir', { v: esc(new Intl.NumberFormat(LOC(), { style: 'currency', currency: 'EUR', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(GLANCE_BUDGET / 100)) })}</span><button class="btn ghost small" type="button" data-g="decks">${T('Voir ces decks')}</button></div>`;
  } else if (EDH.p || reading) dk = `<p class="hint gl-edh-wait">${T('Decks EDHREC à finir : calcul après la lecture des prix…')}</p>`;
  const html = `<div class="cs-tiles gl-tiles"><div><b>${nf0(collCount())}</b><span>${TN(collCount(), 'carte différente', 'cartes différentes')}</span></div><div><b>${nf0(collCopies())}</b><span>${TN(collCopies(), 'exemplaire', 'exemplaires')}</span></div><div class="cs-val ro">${val}</div></div>${prog}${best}${dk}
    <button class="btn ghost block gl-stats" type="button" data-g="stats">${T('Voir les stats de ma collection')}</button>`;
  if (api.body._h !== html) { api.body._h = html; api.body.innerHTML = html; }      // repeint seulement si quelque chose a changé (la vignette ne clignote pas à chaque lot lu)
}
