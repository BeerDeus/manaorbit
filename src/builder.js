/* ── builder.js : créer un deck dans l'app (Standard ou Commander) ────────────────────────────────
   Écran plein format : onglets Deck · Collection (ajout en priorité) · Chercher (n'importe quelle carte).
   Règles : Standard 60 cartes, 4 exemplaires max (réserve de 15 facultative) ; Commander 100 cartes, une seule de chaque, un commandant.
   Le deck est enregistré comme les autres (texte), puis monté : ses cartes possédées sont réservées. */
/** Infos Scryfall des cartes de decks qui ne sont pas dans la collection : la fiche entière de data.js › scryCollection ({ eu, ef, ci, cd, im, cm, mc, tl, cl, ar, rr,
 *  lg (formats où elle est légale), la (jour de cette lecture), gc (Game Changer d'après Scryfall) }), gardée sur l'appareil (prix du deck, couleurs, images, légalité, viewer).
 *  Fiches d'avant le 5 novembre (sans lg) : gardées telles quelles, complétées à la prochaine lecture de leur deck (dmMissing). */
const DM = {}; let dmReady = null, dmT = 0;
function dmLoad() {
  if (!dmReady) dmReady = Cache.get('dm:meta', 30 * DAY).then(c => { if (c && typeof c === 'object') for (const k in c) if (!DM[k]) DM[k] = c[k]; renderDecks(); }).catch(() => {});
  return dmReady;
}
const dmSave = () => { clearTimeout(dmT); dmT = 0; Cache.set('dm:meta', DM); };
const dmSaveSoon = () => { clearTimeout(dmT); dmT = setTimeout(dmSave, 800); };
/** LA fiche d'une carte (clé de ownKey) : collection (COLL.meta), sinon cartes des decks (DM) ; null si jamais lue. Une carte possédée lue avant que l'appli garde
 *  sa légalité : celle de DM (ou de sa fiche ouverte) la complète. Tous les champs de scryCollection sont gardés (cardLegal, isGC, prix, filtres). */
function cardMeta(k) {
  const a = COLL.meta[k], b = DM[k];
  if (!a) return b || null;
  return b && a.lg === undefined && b.lg !== undefined ? { ...a, lg: b.lg, la: b.la, ...(a.gc === undefined && b.gc !== undefined ? { gc: b.gc } : {}) } : a;
}
/** Ajoute des champs à la fiche d'une carte (les autres restent) : collection si elle y est (enregistrée avec elle), sinon cartes des decks.
 *  Carte encore inconnue : seulement une fiche complète (type lu) ; un bout de fiche (légalité seule) n'en crée pas. → vrai si quelque chose a été gardé. */
function metaPut(k, m) {
  if (!k || !m || typeof m !== 'object') return false;
  if (COLL.meta[k]) { COLL.meta[k] = { ...COLL.meta[k], ...m }; if (typeof collMetaSave === 'function') collMetaSave(); return true; }
  if (!DM[k] && m.tl === undefined) return false;
  DM[k] = { ...(DM[k] || {}), ...m }; dmSaveSoon(); return true;
}
/** Fiche lue sur Scryfall (scryCollection) pour une carte : gardée entière (cartes des decks) ; carte possédée : seuls les champs qui manquaient à sa fiche de la
 *  collection, et sa légalité (relue), y sont ajoutés (son prix reste celui de la collection). */
function metaTake(k, m) {
  const own = COLL.meta[k]; if (!own) return metaPut(k, m);
  const add = {}; for (const f in m) if (own[f] === undefined) add[f] = m[f];
  if (m.lg !== undefined) { add.lg = m.lg; add.la = m.la; if (m.gc !== undefined) add.gc = m.gc; }
  return metaPut(k, add);
}
/** Fiche complète : type lu et légalité connue (fiches d'avant le 5 novembre : relues). */
const metaFull = m => !!m && m.tl !== undefined && m.lg !== undefined;
/** Une carte est-elle légale dans ce format (« commander », « standard »… : LG_FMT) ? true / false, ou null si on ne sait pas. D'abord la fiche Scryfall
 *  (lg : relue avec les cartes du deck, de la collection ou à l'ouverture de sa fiche), sinon la base du coach (Commander : drapeau 16 « interdite »). Terrains de base : oui. */
function cardLegal(k, fmt = 'commander') {
  if (BASIC_NAMES.has(k)) return true;
  const f = LG_FMT.find(x => x[1] === fmt), m = cardMeta(k);
  if (f && m && typeof m.lg === 'string' && m.lg) return m.lg.includes(f[0]);
  const r = fmt === 'commander' && typeof DW !== 'undefined' && DW.byKey ? DW.byKey.get(k) : null;
  return r ? !(r[6] & 16) : null;
}
/** Game Changer (liste officielle des brackets Commander) ? La base du coach d'abord (drapeau 1), sinon la fiche Scryfall (game_changer), sinon la liste d'EDHREC. */
function isGC(k) {
  k = ownKey(String(k || '').replace(/^sb:/, ''));
  const r = typeof DW !== 'undefined' && DW.byKey ? DW.byKey.get(k) : null; if (r) return !!(r[6] & 1);
  const m = cardMeta(k); if (m && m.gc !== undefined) return !!m.gc;
  return !!(typeof EDH !== 'undefined' && EDH.data && EDH.data.gc && EDH.data.gc.has(k));
}
const dmTried = new Set();
/** Cartes ([{ key, name }], terrains de base compris si basics) dont on ne connaît pas la fiche complète (metaFull : type, coût, couleurs et légalité), pas encore essayées. */
const dmMissing = (list, basics) => list.filter(c => (basics || !BASIC_NAMES.has(c.key)) && !metaFull(cardMeta(c.key)) && !dmTried.has(c.key)).slice(0, 150);
/** Lit sur Scryfall les cartes pas encore connues ([{ key, name }]) ; retourne vrai si quelque chose est arrivé (gardé par metaTake). */
async function dmFetch(list, basics) {
  const need = dmMissing(list, basics);
  if (!need.length || scryLeft() > 0) return false;
  need.forEach(c => dmTried.add(c.key));
  let n = 0;
  for (let i = 0; i < need.length; i += 75) {      // un lot de 75 par requête : un lot refusé ne fait pas perdre les fiches des lots déjà lus
    try {
      const got = await scryCollection(need.slice(i, i + 75).map(c => c.name));
      for (const [k, m] of got) {
        if (!m) continue;
        metaTake(k, m); n++;
      }
    }
    catch (e) { need.slice(i).forEach(c => dmTried.delete(c.key)); break; }      // hors ligne ou limite Scryfall : l'estimation reste partielle ; ces cartes seront redemandées (sinon leur image ne venait jamais de la session)
  }
  if (n) dmSave(); return n > 0;
}
/** Vignettes : l'image n'apparaît qu'une fois chargée (.thumb img.ok, style.css) ; en panne, la lettre reste. Écouteurs en capture sur l'écran ou la feuille (éditeur, coach, analyse). */
const thumbLoad = e => { if (e.target.tagName === 'IMG') e.target.classList.add('ok'); };
function thumbErr(e) {
  const im = e.target; if (im.tagName !== 'IMG') return;
  if (/^https:\/\/api\.scryfall\.com\//.test(im.src) && !im.dataset.again) {      // image par le nom (api.scryfall.com, limitée en débit : 429 pendant une rafale) : redemandée une fois après la pause, la lettre en attendant
    im.dataset.again = '1'; const u = im.src;
    setTimeout(() => { if (im.isConnected) { im.removeAttribute('src'); im.src = u; } }, Math.max(4000, scryLeft() + 500)); return;
  }
  im.remove();
}
/** Contenu tout juste redessiné (innerHTML) : les images déjà en cache sont montrées tout de suite. Sans cela chaque − / +, filtre ou case cochée refaisait partir
 *  toutes les vignettes de l'opacité 0 (l'événement load arrive après le premier affichage) : la liste clignotait. */
function thumbsReady(root) { if (root) for (const im of root.querySelectorAll('img:not(.ok)')) if (im.complete && im.naturalWidth) im.classList.add('ok'); }
/** Fiche d'une carte (collection, sinon lue pour les decks). Sans prix Cardmarket sur l'impression par défaut de Scryfall (réimpression récente pas encore cotée :
 *  Sol Ring, Command Tower, Path to Exile…) : prix de l'impression la moins chère du relevé du jour (data.js › pxTable), comme le coach ; jamais « prix inconnu » si on le connaît. */
const pxRef = k => { const p = typeof PXT !== 'undefined' && PXT && PXT.map ? PXT.map.get(k) : null; return p && p.e > 0 ? p.e : 0; };
const dmOf = k => {
  const m = cardMeta(k); if (!m || m.eu > 0) return m;
  const e = pxRef(k); if (e) return { ...m, eu: e };
  pxRefEnsure(); return m;
};
/** Prix estimé d'une carte (centimes, 0 si inconnu) : LA règle de la « valeur estimée », la même partout (en-tête de l'éditeur, coach, Mes decks, viewer, image de partage,
 *  prix de ce qui manque). Relevé du jour (impression la moins chère, marché choisi : data.js › pxParse) s'il est connu, sinon tendance de la fiche (impression par défaut de Scryfall).
 *  Relevé pas encore lu : demandé (pxRefEnsure), les écrans se redessinent à son arrivée. */
function dkPx(k) {
  const e = pxRef(k); if (e) return e;
  pxRefEnsure(); const m = COLL.meta[k] || DM[k]; if (m && m.eu > 0) return m.eu;
  return typeof dwBasePx === 'function' ? dwBasePx(k) : 0;      // ni relevé ni fiche : prix de la base du coach (deckwiz.js), comme le coach l'a toujours compté (l'en-tête affichait « ≈ 9 €+ » pour un deck que le coach disait à 18 €)
}
/** Prix de référence d'un exemplaire dont l'édition n'est pas connue (centimes, 0 si inconnu) : dkPx, la même règle partout (collection, Stats, accueil, widget,
 *  courbe de valeur, scan, lot, échanges, « De ta collection pour ce deck ») ; foil : le prix foil de la fiche (Scryfall), à défaut dkPx. m : fiche d'une carte pas encore
 *  dans COLL.meta ni DM (lue par le scan), dont le prix sert en dernier recours. Exemplaire d'une édition connue : le prix de cette édition (collection.js › collLineEu). */
function refPx(k, f, m) {
  const x = m || COLL.meta[k] || DM[k]; if (f && x && x.ef > 0) return x.ef;
  return dkPx(k) || (x && x.eu > 0 ? x.eu : 0);
}
/** Valeur estimée d'un texte de deck avec cette règle (core.js › dkValue : commandant compris, terrains de base et réserve exclus, cartes possédées comprises).
 *  ready : faux tant que le relevé du jour n'a pas été essayé (le chiffre changerait à son arrivée : l'en-tête de l'éditeur et Mes decks l'attendent). */
const dkEst = text => ({ ...dkValue(text, dmOf, dkPx), ready: pxSettled() });
let PXR_ASK = false, PXR_DONE = false;
/** Relevé du jour lu, ou déjà essayé (absent, hors ligne, serveur muet plus de 3 s) : la valeur estimée ne changera plus d'elle-même. */
const pxSettled = () => !!(typeof PXT !== 'undefined' && PXT) || PXR_DONE || typeof pxTable !== 'function';
/** Écrans ouverts qui affichent une valeur estimée : redessinés (relevé du jour arrivé, ou essayé en vain la première fois). */
function pxRepaint() {
  try { if (typeof DV !== 'undefined' && DV.el && DV.snap && (DV.snap.ref || (DV.sb && DV.sb.length))) dvRefresh(); } catch (e) { /* viewer fermé entre-temps */ }
  try { if (BD.el) bdPaint(); } catch (e) { /* éditeur fermé */ }
  try { if (typeof dksPaint === 'function') dksPaint(); } catch (e) { /* écran « Mes decks » pas prêt */ }
  try { if (typeof DK_VALP === 'function') DK_VALP(); } catch (e) { /* feuille d'un deck fermée */ }
  try { pxRepaintColl(); } catch (e) { /* collection pas encore lue */ }
}
/** Valeur de la collection, accueil, Stats, scan, fiche d'une carte : au prix de référence (refPx), redessinés quand le relevé du jour arrive. */
function pxRepaintColl() {
  if (typeof COLL === 'undefined' || !collCount()) return;
  COLL.seq++; if (typeof VAL !== 'undefined') VAL.memo = null;
  paintCollSection(); if (COLL.el) collPaintBody(true);
  if (typeof SC !== 'undefined' && SC.el) scanPaintList();
  if (typeof csSoon === 'function') csSoon();
}
/** Relevé du jour pas encore lu : lu une fois, puis les écrans ouverts qui affichent des prix de référence sont redessinés. */
function pxRefEnsure() {
  if (PXR_ASK || (typeof PXT !== 'undefined' && PXT) || typeof pxTable !== 'function') return;
  PXR_ASK = true;
  const settle = () => { if (PXR_DONE) return false; PXR_DONE = true; return true; };
  const slow = setTimeout(() => { if (settle()) pxRepaint(); }, 3000);      // serveur muet : la valeur des fiches, sans attendre plus
  pxTable().then(t => {
    PXR_ASK = false; clearTimeout(slow); const first = settle();
    if (t || first) pxRepaint();      // échec : un seul repeint (le premier) ; sinon chaque repeint redemanderait le relevé, puis repeindrait encore
  }, () => { PXR_ASK = false; clearTimeout(slow); if (settle()) pxRepaint(); });
}
const liTried = new Set();
/** Images, dans la langue de l'exemplaire, des cartes possédées de cette liste ([{ key, name }]) : lues sur Scryfall par lots de 12, une seule fois par carte (gardées 60 jours avec celles de la collection).
 *  Déjà connues, déjà tentées, anglaises ou non possédées : rien à lire. Retourne vrai si quelque chose est arrivé. */
async function ownLangFetch(list) {
  const by = {};
  for (const c of list) {
    const k = ownKey(c.key), x = COLL.map[k], l = x && x.q > 0 ? x.l : '';
    if (l && l !== 'en' && SCRY_LANG[l] && !(liKey(l, k) in COLL.li) && !liTried.has(liKey(l, k))) (by[l] = by[l] || new Map()).set(k, c.name);
  }
  const langs = Object.keys(by); if (!langs.length || scryLeft() > 0) return false;
  let n = 0;
  for (const l of langs) {
    const keys = [...by[l].keys()]; keys.forEach(k => liTried.add(liKey(l, k)));
    try { const got = await scryLangImages([...by[l].values()], l, undefined, undefined, true); for (const k of keys) { COLL.li[liKey(l, k)] = got.get(k) || ''; n++; } }
    catch (e) { /* hors ligne ou limite Scryfall : l'image du deck reste */ }
  }
  if (n) collMetaSave();
  return n > 0;
}
/** Valeur estimée d'un texte de deck, en chaîne : « ≈ 84 € » (« ≈ 84 €+ » si des cartes n'ont pas de prix), '' tant que rien n'est lu. */
function dkValueText(v) { return v.known ? `≈ ${fmt(v.cents, mkCur())}${v.known < v.total ? '+' : ''}` : ''; }
const BD = { el: null, id: null, name: '', fmt: 'standard', cover: '', main: new Map(), side: new Map(), comp: new Map(), cmdr: [], tab: 'deck', tgt: 'main', q: '', shown: 60, dirty: false, meta: DM, tried: new Set(), cat: null, catErr: '', metaT: 0, issuesOpen: false, idx: null };
const BD_PAGE = 60;
const BD_BASICS = [['plains', 'Plains', 'Plaine'], ['island', 'Island', 'Île'], ['swamp', 'Swamp', 'Marais'], ['mountain', 'Mountain', 'Montagne'], ['forest', 'Forest', 'Forêt']];
const bdMeta = dmOf;
const bdCount = m => { let n = 0; for (const c of m.values()) n += c.qty; return n; };
const bdData = () => ({ fmt: BD.fmt, main: [...BD.main.values()], side: [...BD.side.values()], cmdr: BD.cmdr, comp: [...BD.comp.values()], cover: BD.cover, meta: BD.dkMeta || [] });      // comp : compagnon de la liste (core.js › deckModel), gardé à l'enregistrement
/** Exemplaires de k dans le deck et la réserve ; Standard : le compagnon est une carte de la réserve (compté une fois s'il y est déjà écrit). */
const bdTot = k => ((BD.main.get(k) || {}).qty || 0) + ((BD.side.get(k) || {}).qty || 0) + (BD.fmt !== 'commander' && !BD.side.has(k) ? (BD.comp.get(k) || {}).qty || 0 : 0);
/** Cartes de la réserve (Standard : compagnon compris, comme core.js › dkCheck). */
const bdSideN = () => bdCount(BD.side) + (BD.fmt !== 'commander' ? dkCompOut([...BD.comp.values()], [...BD.side.values()]).reduce((a, c) => a + c.qty, 0) : 0);
/** Nom affiché d'une carte du deck (collection.js › cardName) : possédée → langue de tes exemplaires ; sinon langue de l'appli, sinon anglais. */
const bdLabel = (k, name) => cardName(k, name);
const bdCmp = (a, b) => NAME_CMP(bdLabel(a.key, a.name), bdLabel(b.key, b.name));
const bdFmtName = f => (DK_FORMATS[f] || DK_FORMATS.standard).label;

/* ── Nouveau deck : nom + format ──────────────────────────────────────────────────────────────── */
function openDeckNew() {
  openSheet(T('Nouveau deck'), T('Standard ou Commander'), api => {
    api.body.innerHTML = `<div class="field-in"><label class="label" for="ndName">${T('Nom')}</label><input type="text" id="ndName" maxlength="120" autocomplete="off" placeholder="${T('Mon deck')}" enterkeyhint="go"></div>
      <div class="seg" id="ndFmt" role="radiogroup" aria-label="${T('Format')}"></div>
      <p class="hint" id="ndHint"></p>`;
    api.setFoot(`<button class="btn ghost" type="button" data-close>${T('Annuler')}</button><button class="btn" type="button" id="ndGo">${T('Créer')}</button>`);
    const seg = $('#ndFmt', api.body), hint = $('#ndHint', api.body), name = $('#ndName', api.body);
    const paint = () => { const f = DK_FORMATS[seg._v || 'standard']; hint.textContent = f.hint; };
    mountSeg(seg, [{ v: 'standard', label: T('Standard') }, { v: 'commander', label: 'Commander' }], 'standard', paint); paint();
    const go = () => { const fmt = seg._v || 'standard', nm = name.value.trim(); api.close(); setTimeout(() => (typeof dwOn === 'function' && dwOn() ? openDeckStart(nm, fmt) : openBuilder({ name: nm, fmt })), 200); };      // fonctionnalité en test : « J'ai déjà ce deck » / « Deck à construire » (deckwiz.js)
    $('#ndGo', api.foot).onclick = go; name.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); go(); } };
    setTimeout(() => name.focus(), 380);
  });
}

/* ── Ouverture ────────────────────────────────────────────────────────────────────────────────── */
/** Ouvre l'éditeur : un nouveau deck { name, fmt } ou un deck enregistré { id }. Coach (deckwiz.js) : text (liste collée), cmdr ([{ key, name }]), wiz (réglages du coach), tab ('coach'). */
function openBuilder(o) {
  if (BD.el) return;
  const prev = o.id ? findDeck(o.id) : null;
  Object.assign(BD, { id: prev ? prev.id : null, name: prev ? prev.name : (o.name || ''), tab: 'deck', tgt: 'main', q: '', f: newFilter(), fsig: '', fb: null, sel: null, shown: BD_PAGE, dirty: false, issuesOpen: false, idx: null, main: new Map(), side: new Map(), comp: new Map(), cmdr: [], cover: '', dkMeta: [], scanPref: null, wiz: null, metaN: 0, metaAt: 0 });      // scanPref : cartes scannées (rangées à l'enregistrement)
  if (prev || o.text) {
    const p = dkParse(prev ? prev.text : o.text);
    BD.fmt = (!prev && (o.fmt === 'commander' || o.fmt === 'standard') ? o.fmt : '') || p.fmt || (p.cmdr.length || p.main.reduce((a, c) => a + c.qty, 0) >= 99 ? 'commander' : 'standard');
    if (!prev) BD.dirty = true;      // liste collée : à enregistrer
    p.main.forEach(c => BD.main.set(c.key, c)); p.side.forEach(c => BD.side.set(c.key, c)); p.comp.forEach(c => BD.comp.set(c.key, c)); BD.cmdr = p.cmdr; BD.cover = p.cover; BD.dkMeta = p.meta;      // la carte de présentation choisie est gardée
    if (BD.fmt === 'commander') BD.side.clear();      // pas de réserve en Commander ; le compagnon (hors des 100 cartes) reste
  } else BD.fmt = o.fmt === 'commander' ? 'commander' : 'standard';
  if (!prev && Array.isArray(o.cmdr) && BD.fmt === 'commander') { BD.cmdr = o.cmdr.slice(0, 2).map(c => ({ key: c.key, name: c.name })); for (const c of BD.cmdr) BD.main.delete(c.key); BD.dirty = true; }
  if (Array.isArray(o.swaps) && o.swaps.length) {      // échanges conseillés par l'analyse (deckana.js) : appliqués, à enregistrer
    for (const [ok, ik, nm] of o.swaps) { const c = BD.main.get(ok); if (!c || BD.main.has(ik)) continue; if (c.qty > 1) c.qty--; else BD.main.delete(ok); BD.main.set(ik, { key: ik, name: nm, qty: 1 }); BD.dirty = true; }
  }
  const coach = typeof dwOn === 'function' && dwOn() && BD.fmt === 'commander';      // onglet Coach (deckwiz.js)
  if (coach) BD.wiz = o.wiz ? { ...dwDefaults(), ...o.wiz } : dwSettingsFor(BD.id);
  collFrLoad();
  if (typeof EDH !== 'undefined' && !EDH.data && typeof edhLoad === 'function') edhLoad().then(() => { if (BD.el) bdList(); }, () => {});      // liste des Game Changers (pastille GC), dans les données EDHREC
  BD.split = bdSplit();      // ordinateur (≥ 1 100 px, souris) : recherche à gauche, liste du deck à droite, toujours visible (zz-desktop.css) ; décidé à l'ouverture
  const wrap = document.createElement('div'); wrap.className = 'dv bd' + (BD.split ? ' split' : ''); wrap.setAttribute('role', 'dialog'); wrap.setAttribute('aria-modal', 'true'); wrap.setAttribute('aria-label', T('Créateur de deck'));
  wrap.innerHTML = `<header class="dv-head"><button class="icon-btn dv-back" type="button" data-act="close" aria-label="${T('Fermer')}"><svg class="i"><use href="#i-back"/></svg></button>
      <div class="dv-title"><b id="bdTitle"></b><span id="bdSub"></span></div>
      <button class="btn small bd-save" type="button" data-act="save" id="bdSave">${T('Enregistrer')}</button></header>
    <div class="dv-scroll">${BD.split ? `<div class="dv-body bd-body bd-split">
      <div class="bd-l"><div class="seg" id="bdSeg" role="tablist" aria-label="${T('Contenu')}"></div>
        <div class="bd-ctl" id="bdCtl"></div>
        <div class="bd-list" id="bdList"></div></div>
      <div class="bd-r" role="region" aria-label="${T('Deck')}"><div class="bd-sum" id="bdSum"></div>
        <div class="bd-ctl" id="bdDeckCtl">${bdNameCtl()}</div>
        <div class="bd-list bd-deck" id="bdDeck"></div></div></div>` : `<div class="dv-body bd-body">
      <div class="bd-sum" id="bdSum"></div>
      <div class="seg" id="bdSeg" role="tablist" aria-label="${T('Contenu')}"></div>
      <div class="bd-ctl" id="bdCtl"></div>
      <div class="bd-list" id="bdList"></div></div>`}</div>
    <div class="bd-selbar" id="bdSelBar" role="toolbar" aria-label="${T('Sélection')}" hidden></div>`;      // mode sélection de l'onglet « Ajouter » (bdadd.js)
  BD.el = wrap; const prevFocus = document.activeElement;
  const onKey = e => { if (e.key === 'Escape' && !sheets.length && !imgView) { e.stopPropagation(); if (BD.sel) bdSelEnd(); else bdClose(); } };      // mode sélection : Échap en sort d'abord
  wrap.__close = () => {
    if (BD.el !== wrap) return; BD.el = null; clearTimeout(BD.metaT); document.removeEventListener('keydown', onKey, true);
    wrap.classList.remove('on'); setTimeout(() => wrap.remove(), reduceMotion() ? 0 : 240); releaseApp();
    try { if (prevFocus && prevFocus.focus && prevFocus.isConnected) prevFocus.focus({ preventScroll: true }); } catch (e) { /* ignore */ }
  };
  document.addEventListener('keydown', onKey, true);
  wrap.addEventListener('load', thumbLoad, true);
  wrap.addEventListener('error', thumbErr, true);
  const tab0 = coach && o.tab === 'coach' ? 'coach' : BD.split ? 'coll' : 'deck';
  BD.view = bdViewRead(); BD.sort = BD.sort || 'mana';
  mountSeg($('#bdSeg', wrap), [...(BD.split ? [] : [{ v: 'deck', label: T('Deck') }]), { v: 'coll', label: T('Ajouter') }, ...(coach ? [{ v: 'coach', label: T('Coach') }] : [])], tab0, bdTab);      // « Ajouter » : collection et toutes les cartes dans une seule recherche
  wrap.addEventListener('click', bdClick);
  wrap.addEventListener('input', e => {
    if (e.target.id === 'bdName') { BD.name = e.target.value; BD.dirty = true; bdHead(); }
    else if (e.target.id === 'bdQ') { BD.q = BD.f.q = e.target.value; BD.fsig = bdFSig(); BD.shown = BD_PAGE; bdList(); }      // tout de suite (la barre de filtres attend 120 ms : rien à refaire alors)
  });
  wrap.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.id === 'bdName') { e.preventDefault(); e.target.blur(); } });
  bdLpBind(wrap);      // appui long : mode sélection (bdadd.js)
  document.body.appendChild(wrap); holdApp();
  bdTab(tab0); bdPaint(); bdMetaSoon();
  requestAnimationFrame(() => requestAnimationFrame(() => { wrap.classList.add('on'); $('.dv-back', wrap).focus({ preventScroll: true }); }));
  haptic('tap');
}
function bdClose(force) {
  if (!BD.el) return;
  if (!force && BD.dirty) {
    openSheet(T('Quitter sans enregistrer ?'), null, api => {
      api.body.innerHTML = `<p class="hint">${T('Les changements de ce deck seront perdus.')}</p>`;
      api.setFoot(`<button class="btn ghost" type="button" data-close>${T('Continuer')}</button><button class="btn danger" type="button" id="bdLeave">${T('Quitter')}</button>`);
      $('#bdLeave', api.foot).onclick = () => { api.close(); bdClose(true); };
    });
    return;
  }
  BD.el.__close();
}

/* ── Données de la carte (couleurs, image) : collection d'abord, sinon Scryfall ───────────────── */
function bdMetaSoon() {
  clearTimeout(BD.metaT); BD.metaT = setTimeout(bdMetaLoad, Math.max(700, (BD.metaAt || 0) - Date.now()));      // après un échec : pas avant la nouvelle tentative prévue (le coach rappelle bdMetaSoon à chaque repeint)
}
/** Cartes dont l'éditeur montre l'image : deck, réserve, commandant, terrains de base (rangées toujours là), cartes proposées (recherche, coach, échanges conseillés). */
function bdMetaList() {
  const sw = typeof DX !== 'undefined' && DW.open === 'swaps' && Array.isArray(DX.swaps) ? DX.swaps.map(s => ({ key: s.in.k, name: s.in.name })) : [];      // « Améliorer le deck » du Coach (deckux.js) : cartes à ajouter
  return [...BD.main.values(), ...BD.side.values(), ...BD.cmdr, ...BD_BASICS.map(([key, name]) => ({ key, name })), ...(BD.want || []), ...sw];
}
async function bdMetaLoad() {
  if (!BD.el) return;
  const el = BD.el; await dmLoad(); if (BD.el !== el) return;      // fiches gardées sur l'appareil d'abord
  const list = bdMetaList(), got = await dmFetch(list, true); if (BD.el !== el) return;
  if (got) { BD.metaN = 0; bdPaint(); }
  if (!dmMissing(bdMetaList(), true).length) return;      // plus de 150 cartes inconnues, limite Scryfall, hors ligne : on y revient (images qui arrivent tard plutôt que jamais)
  const wait = got ? 300 : Math.min(60000, Math.max(2500 * 2 ** Math.min(4, BD.metaN = (BD.metaN || 0) + 1), scryLeft() + 500));
  BD.metaAt = Date.now() + wait; clearTimeout(BD.metaT); BD.metaT = setTimeout(bdMetaLoad, wait);
}

/* ── Modifications ────────────────────────────────────────────────────────────────────────────── */
/** Ajoute (d = 1) ou retire (d = −1) un exemplaire de la carte k dans la zone tgt (main · side · cmdr). Retourne false si la règle du format l'interdit.
 *  batch (ajout du scan) : ni message ni repeint, la raison du refus est retournée ('cmdr' · 'copies' · 'side'). */
function bdChange(tgt, k, name, d, batch) {
  const f = DK_FORMATS[BD.fmt], no = (why, msg) => { if (batch) return why; toast(msg); haptic('warn'); return false; };
  if (tgt === 'cmdr') {
    const i = BD.cmdr.findIndex(c => c.key === k);
    if (d > 0) {
      if (i >= 0) return batch ? 'cmdr' : false;
      if (BD.cmdr.length >= 2) return no('cmdr', T('Deux commandants au maximum (partenaires)'));
      BD.cmdr.push({ key: k, name }); BD.main.delete(k);
    } else if (i >= 0) BD.cmdr.splice(i, 1); else return false;
  } else {
    const m = BD[tgt], cur = m.get(k), q = cur ? cur.qty : 0;
    if (q + d < 0) return false;
    if (d > 0 && tgt === 'comp') return no('copies', T('Un seul compagnon'));      // compagnon : seulement celui de la liste, à retirer au besoin
    if (d > 0) {
      if (BD.cmdr.some(c => c.key === k)) return no('copies', T('Cette carte est déjà ton commandant'));
      const max = dkMaxCopies(BD.fmt, k);      // terrains de base, Relentless Rats… : sans limite ; Seven Dwarves 7, Nazgûl 9
      if (bdTot(k) + 1 > max) return no('copies', max === 1 ? T('Commander : un seul exemplaire de chaque carte') : T('{n} exemplaires au maximum (deck et réserve)', { n: max }));
      if (tgt === 'side' && bdSideN() + 1 > f.side) return no('side', T('Réserve : {n} cartes au maximum', { n: f.side }));
    }
    if (q + d === 0) m.delete(k); else m.set(k, { key: k, name: cur ? cur.name : name, qty: q + d });
  }
  BD.dirty = true; if (!batch) { bdPaint(); bdMetaSoon(); } return true;
}

/* ── Scanner les cartes du deck (scan.js en mode deck : openScan({ deck: true })) ─────────────────────────
   Bouton « Scanner des cartes » (onglet Deck : dans le deck ; Collection et Chercher : dans la zone choisie, « Ajouter au »). Au scan, « Au deck » ouvre la fiche
   ci-dessous : les cartes lues (pas celles « à vérifier ») entrent dans le deck en respectant les règles du format (exemplaires, réserve, commandant), et la collection au choix :
   « Les prendre dans ma collection » (rien n'est ajouté : le deck monté réserve tes exemplaires), « Les ajouter à ma collection » (deck jamais scanné : tous les exemplaires,
   langue, édition et foil lus au scan), « Seulement celles qui manquent » (ce que la collection n'a pas encore). Choix proposé d'après ce que la collection a déjà.
   À l'enregistrement, le deck est monté et ses cartes possédées rangées dans l'emplacement « Deck : <nom> » (créé au besoin ; places.js › plcMount), les exemplaires
   scannés d'abord (même langue, édition et finition : BD.scanPref) ; chacune garde son emplacement d'origine, où elle retourne au démontage. */
function bdScan(tgt) {
  if (!BD.el) return;
  BD.scanTgt = tgt || (BD.tab === 'deck' ? 'main' : BD.tgt); haptic('tap');      // tgt : bouton sous le nom du deck (ordinateur : toujours affiché) → dans le deck
  openScan({ deck: true });
}
/** Exemplaires à ajouter à la collection : tous (all), sinon pour chaque carte ce que le scan a de plus qu'elle (lignes du scan dans leur ordre, non foil puis foil). */
function bdScanColl(items, all) {
  const left = new Map(), out = [];
  for (const x of items) left.set(x.k, (left.get(x.k) || 0) + x.q);
  if (!all) for (const [k, q] of left) left.set(k, Math.max(0, q - collQty(k)));
  for (const x of items) for (const [q, f] of [[x.q - x.f, 0], [x.f, 1]]) {
    const n = Math.min(q, left.get(x.k) || 0); if (!n) continue;
    left.set(x.k, left.get(x.k) - n); out.push({ k: x.k, n: x.n, q: n, l: lineKey(x.l, x.e, !!f), e: x.e, p: x.p, lang: x.l });
  }
  return out;
}
/** « Au deck » (bouton du scan en mode deck) : fiche d'ajout, puis les cartes dans le deck (et la collection si demandé). */
function bdScanDone() {
  const items = scanLive(); if (!items.length || !BD.el) return;
  const n = items.reduce((a, x) => a + x.q, 0), maybe = [...SC.items.values()].filter(x => x.maybe).length, tgt = BD.scanTgt || 'main';
  const miss = bdScanColl(items).reduce((a, x) => a + x.q, 0);
  let mode = !miss ? 'take' : miss >= n ? 'add' : 'miss';      // proposé : rien de nouveau → les prendre ; tout nouveau → les ajouter ; sinon compléter
  openSheet(TN(n, 'Ajouter {n} carte au deck', 'Ajouter {n} cartes au deck'), BD.name.trim() || T('Nouveau deck'), api => {
    api.wrap.classList.add('bd-sc-sheet');
    const opt = (v, t, h) => `<button type="button" class="bd-sc-opt" role="radio" data-m="${v}" aria-checked="${mode === v}"><b>${t}</b><small>${h}</small></button>`;
    const paint = () => {
      api.body.innerHTML = `<dl class="rc-facts"><div><dt>${T('Zone')}</dt><dd>${esc(tgt === 'side' ? T('Réserve') : tgt === 'cmdr' ? T('Commandant') : T('Deck'))}</dd></div>
          <div><dt>${T('Cartes différentes')}</dt><dd>${nf0(new Set(items.map(x => x.k)).size)}</dd></div>
          <div><dt>${T('Déjà dans ta collection')}</dt><dd>${TN(n - miss, '{n} exemplaire', '{n} exemplaires', { n: nf0(n - miss) })}</dd></div></dl>
        ${maybe ? `<p class="hint">${TN(maybe, '{n} carte à vérifier n\'est pas comptée : confirme-la dans la liste du scan.', '{n} cartes à vérifier ne sont pas comptées : confirme-les dans la liste du scan.')}</p>` : ''}
        <p class="bd-sc-h">${T('Ces cartes et ta collection')}</p>
        <div class="bd-sc-opts" role="radiogroup" aria-label="${esc(T('Ces cartes et ta collection'))}">
          ${opt('take', T('Les prendre dans ma collection'), miss ? TN(miss, 'Rien n\'est ajouté ; le deck réserve tes exemplaires. {n} exemplaire n\'y est pas : à acheter.', 'Rien n\'est ajouté ; le deck réserve tes exemplaires. {n} exemplaires n\'y sont pas : à acheter.') : T('Rien n\'est ajouté ; le deck réserve tes exemplaires.'))}
          ${opt('add', T('Les ajouter à ma collection'), TN(n, 'Deck jamais scanné : {n} exemplaire entre dans ta collection (langue, édition, foil).', 'Deck jamais scanné : les {n} exemplaires entrent dans ta collection (langue, édition, foil).'))}
          ${miss && miss < n ? opt('miss', T('Ajouter seulement celles qui manquent'), TN(miss, '{n} exemplaire que ta collection n\'a pas encore.', '{n} exemplaires que ta collection n\'a pas encore.')) : ''}
        </div>
        <p class="hint">${T('Les règles du format restent appliquées (nombre d\'exemplaires, réserve, commandant).')}</p>
        ${typeof plcMount === 'function' ? `<p class="hint">${esc(T('À l\'enregistrement du deck, ses cartes de ta collection sont rangées dans « {place} » (elles retournent à leur place au démontage).', { place: T('Deck : {name}', { name: BD.name.trim() || T('Deck') }) }))}</p>` : ''}`;
    };
    paint();
    api.body.addEventListener('click', e => { const b = e.target.closest('[data-m]'); if (!b || b.dataset.m === mode) return; mode = b.dataset.m; haptic('tap'); paint(); });
    api.setFoot(`<button class="btn ghost" type="button" data-close>${T('Retour')}</button><button class="btn" type="button" data-ok>${TN(n, 'Ajouter {n} carte au deck', 'Ajouter {n} cartes au deck')}</button>`);
    api.foot.addEventListener('click', e => {
      if (!e.target.closest('[data-ok]')) return;
      api.close();
      const before = { main: new Map([...BD.main].map(([k, c]) => [k, { ...c }])), side: new Map([...BD.side].map(([k, c]) => [k, { ...c }])), cmdr: BD.cmdr.map(c => ({ ...c })), dirty: BD.dirty, pref: BD.scanPref && new Map([...BD.scanPref].map(([k, v]) => [k, new Set(v)])) };
      if (!BD.scanPref) BD.scanPref = new Map();
      for (const x of items) { const set = BD.scanPref.get(x.k) || new Set(); if (x.q > x.f) set.add(lineKey(x.l, x.e, false)); if (x.f) set.add(lineKey(x.l, x.e, true)); BD.scanPref.set(x.k, set); }      // exemplaires scannés : rangés en premier
      let ok = 0; const no = { copies: 0, side: 0, cmdr: 0 };
      for (const x of items) for (let i = 0; i < x.q; i++) {
        let r = bdChange(tgt, x.k, x.n, 1, true);
        if (r !== true && tgt === 'cmdr') r = bdChange('main', x.k, x.n, 1, true);      // commandant déjà choisi (2 au plus) : le reste va dans le deck
        if (r === true) ok++; else no[r] = (no[r] || 0) + 1;
      }
      const coll0 = COLL.map, add = mode === 'take' ? [] : bdScanColl(items, mode === 'add');
      if (add.length) { for (const x of add) if (x.e && x.p) edRemember(x.k, x.lang, x.e, edInfoOf(x.p, x.lang)); collAdd(add.map(x => ({ k: x.k, n: x.n, q: x.q, l: x.l })), 'add'); collEnrich(); }
      if (SC.el) SC.el.__close('done');
      bdPaint(); bdMetaSoon(); haptic('ok');
      const refused = no.copies + no.side + no.cmdr, nAdd = add.reduce((a, x) => a + x.q, 0);
      const msg = [TN(ok, '{n} carte ajoutée au deck', '{n} cartes ajoutées au deck'), nAdd ? TN(nAdd, '{n} dans ta collection', '{n} dans ta collection') : '',
        refused ? TN(refused, '{n} refusée (règles du format)', '{n} refusées (règles du format)') : ''].filter(Boolean).join(' · ');
      toast(msg, { label: T('Annuler'), fn: () => {
        Object.assign(BD, { main: before.main, side: before.side, cmdr: before.cmdr, dirty: before.dirty, scanPref: before.pref }); if (add.length) { COLL.map = coll0; collChanged(); }
        bdPaint();
      } });
    });
  });
}

/* ── Affichage ────────────────────────────────────────────────────────────────────────────────── */
function bdHead() {
  const el = BD.el; if (!el) return;
  const ck = bdCheck();
  $('#bdTitle', el).textContent = BD.name.trim() || T('Nouveau deck');
  $('#bdSub', el).textContent = `${bdFmtName(BD.fmt)} · ${ck.n}/${ck.size}`;
  const sv = $('#bdSave', el), need = !ck.n || (BD.fmt === 'commander' && !BD.cmdr.length);
  sv.disabled = need; sv.title = need ? (BD.fmt === 'commander' && !BD.cmdr.length ? T('Choisis un commandant') : T('Ajoute des cartes')) : '';
}
function bdSumHtml() {
  const ck = bdCheck(), pct = Math.max(0, Math.min(100, Math.round(ck.n / ck.size * 100)));
  const st = ck.n === ck.size ? 'full' : ck.n > ck.size ? 'over' : '';
  const bad = ck.issues.filter(i => i.lv === 'bad').length;
  const list = BD.issuesOpen ? ck.issues : ck.issues.slice(0, 3);
  const ev = dkEst(dkBuildText(bdData())), val = ev.ready ? dkValueText(ev) : '';      // règle unique (dkPx) : le même chiffre que le coach, Mes decks et le viewer, dès l'ouverture (pas d'attente de la base du coach)
  const valT = T('Prix du jour de l\'impression la moins chère (comme le coach), cartes possédées comprises, terrains de base exclus');
  return `<div class="bd-top"><div class="bd-count ${st}"><b>${nf0(ck.n)}</b><span>${T('/ {n} cartes', { n: ck.size })}</span></div>${val ? `<div class="bd-valw"><span>${T('valeur estimée')}</span><b class="bd-val" title="${valT}">${esc(val)}</b></div>` : ''}${BD.fmt === 'standard' ? `<div class="bd-side${ck.side > DK_FORMATS.standard.side ? ' over' : ''}"><b>${nf0(ck.side)}</b><span>${T('/ {n} en réserve', { n: DK_FORMATS.standard.side })}</span></div>` : ''}</div>
    <div class="bd-bar ${st}"><i style="width:${pct}%"></i></div>
    ${ck.issues.length ? `<ul class="bd-issues">${list.map(i => `<li class="${i.lv}">${esc(i.t)}</li>`).join('')}</ul>${ck.issues.length > 3 ? `<button class="link-btn link-inline" type="button" data-act="issues">${BD.issuesOpen ? T('Réduire') : TN(ck.issues.length - 3, 'Voir l\'autre alerte', 'Voir les {n} autres alertes')}</button>` : ''}`
      : `<p class="bd-ok">${T('Deck complet et conforme.')}</p>`}${typeof dwBannerHtml === 'function' ? dwBannerHtml() : ''}`;      // prochaine étape du coach (deckux.js), hors de l'onglet Coach
}
/** Deck Commander : carte pas légale en Commander (interdite…) : cardLegal (fiche Scryfall, possédée ou non, sinon base du coach) ; inconnue : non. */
const bdIllegal = k => BD.fmt === 'commander' && !BASIC_NAMES.has(k) && cardLegal(k, 'commander') === false;
/** Vérification du deck (core.js › dkCheck) : légalité (cardLegal) et, Commander, règles du bracket visé dans les réglages du coach (pas le bracket « estimé » de l'analyse),
 *  avec les cartes et combos que voit le coach (deckwiz.js › dwBrFacts) : le même verdict que son audit. */
const bdCheck = () => dkCheck(BD.fmt, bdData(), bdMeta, BD.fmt === 'commander' ? { legal: k => cardLegal(k, 'commander'), br: BD.wiz && !BD.wiz.ba ? BD.wiz.br : 0, facts: BD.wiz && !BD.wiz.ba && typeof dwBrFacts === 'function' ? dwBrFacts(dwProfile()) : null } : undefined);
/** « 1 engagée dans « A » » / « 2 engagées ailleurs » : exemplaires possédés mais réservés par d'autres decks montés (o : ownFor). */
const bdHeldTxt = o => o.decks.length === 1 && o.decks[0].n ? TN(o.held, '{n} engagée dans « {deck} »', '{n} engagées dans « {deck} »', { n: o.held, deck: o.decks[0].n }) : TN(o.held, '{n} engagée ailleurs', '{n} engagées ailleurs', { n: o.held });
/** Pastilles d'une carte : possédée ou non, engagée ailleurs. ctx : 'deck' (rangée du deck) · 'coll' / 'find' (liste de cartes à ajouter). */
function bdTags(k, q, ctx) {
  if (BASIC_NAMES.has(k)) return '';
  const o = ownFor(k, BD.id), own = o.own, free = o.free, out = [];      // règle unique (extras.js › ownFor) : possédée = libre pour ce deck ; à acheter = q − free, comme le coach et le viewer
  if (ctx !== 'deck' && BD.cmdr.some(c => c.key === k)) out.push(`<span class="tag accent">${T('Commandant')}</span>`);
  if (bdIllegal(k)) out.push(`<span class="tag bad">${T('Pas légale en Commander')}</span>`);      // Scryfall (legalities), comme l'alerte du résumé (core.js › dkCheck)
  if (isGC(k)) out.push(`<span class="tag gc" title="${T('Game Changer : compte pour le bracket')}">GC</span>`);      // liste officielle des Game Changers (base du coach, sinon Scryfall, sinon EDHREC : même sans EDHREC)
  const buy = () => { const u = dkPx(k); return u ? ' · ' + fmt(u * Math.max(1, q - free), mkCur()) : ''; };      // prix de ce qui manque (valeur estimée : dkPx), s'il est connu ; exemplaires engagés ailleurs : à acheter
  if (ctx === 'deck') out.push(free >= q ? `<span class="tag good">${T('Possédée')}</span>` : free > 0 ? `<span class="tag warn">${TN(free, '{n} possédée sur {q}', '{n} possédées sur {q}', { n: free, q })}${esc(buy())}</span>` : `<span class="tag">${T('À acheter')}${esc(buy())}</span>`);
  else out.push(own ? `<span class="tag good">${TN(own, '× {n} possédée', '× {n} possédées', { n: own })}</span>` : `<span class="tag">${T('Pas dans ta collection')}</span>`);
  if (o.held) out.push(`<span class="tag warn" title="${T('Réservées par un autre deck monté')}">${esc(bdHeldTxt(o))}</span>`);      // possédée mais engagée : toujours dit
  return out.join('');
}
function bdRow(k, name, q, tgt, ctx, label) {
  const x = COLL.map[k], m = bdMeta(k), l = x ? x.l : '', nm = label || bdLabel(k, name), hue = hash32(k) % 360, letter = esc((nm.trim()[0] || '?').toUpperCase());
  const img = m && m.im ? collImage(k, l, m.im, name).src : '', tags = bdTags(k, q, ctx);
  if (ctx === 'coll' && BD.sel) return bdPickRow(k, name, nm, img, hue, letter, tags);      // mode sélection (bdadd.js) : case à cocher
  return `<div class="crow bd-row" data-k="${esc(k)}" data-n="${esc(name)}" data-t="${tgt}"><span class="thumb" style="--h:${hue}"${zoomAt('bd', nm)}>${letter}${img ? `<img alt="" loading="lazy" decoding="async" src="${esc(img)}">` : ''}</span>
    <span class="row-main"><span class="row-top"><span class="row-name">${esc(nm)}</span></span>${tags || (ctx === 'coll' && nm !== name) ? `<span class="row-meta">${ctx === 'coll' && nm !== name ? `<span class="tag bd-en">${esc(name)}</span>` : ''}${tags}</span>` : ''}</span>
    <span class="qstep"><button type="button" data-d="-1" aria-label="${T('Retirer un exemplaire de {name}', { name: esc(nm) })}">−</button><b>${q}</b><button type="button" data-d="1" aria-label="${T('Ajouter un exemplaire de {name}', { name: esc(nm) })}">+</button></span></div>`;
}
/** Vues de l'onglet Deck : la liste modifiable (− / +), ou les vues du deck viewer (grille, piles, piles compactes, bandeaux), triées par coût, type ou rôle ;
 *  dans une vue en images, un toucher ouvre la carte en grand avec « Retirer du deck ». Choix gardé sur l'appareil. */
const BD_VIEW_KEY = 'deckdeal:bd-view';
function bdViewRead() { try { const v = localStorage.getItem(BD_VIEW_KEY); if (v === 'list' || DV_VIEWS.some(x => x[0] === v)) return v; } catch (e) { /* ignore */ } return 'list'; }
const BD_LIST_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 6h12M8 12h12M8 18h12"/><circle cx="4" cy="6" r="1.2"/><circle cx="4" cy="12" r="1.2"/><circle cx="4" cy="18" r="1.2"/></svg>';
function bdToolsHtml() {
  const views = [['list', 'Liste'], ...DV_VIEWS];
  return `<div class="bd-tools">${BD.view !== 'list' ? `<div class="seg bd-sort" id="bdSort" role="radiogroup" aria-label="${T('Classer par')}"></div>` : '<span class="bd-tools-sp"></span>'}<div class="dv-vw" id="bdView" role="radiogroup" aria-label="${T('Affichage')}">${views.map(([v, l]) => `<button type="button" role="radio" data-bdview="${v}" aria-checked="${BD.view === v}" aria-label="${esc(T(l))}" title="${esc(T(l))}">${v === 'list' ? BD_LIST_ICON : DV_VIEW_ICON[v]}</button>`).join('')}</div></div>`;
}
/** Cartes de l'éditeur au format du deck viewer (prix de ce qui manque, possession), pour ses vues. */
function bdViewItems() {
  const one = (c, tgt) => { const k = c.key, m = bdMeta(k) || {}, x = COLL.map[k], q = c.qty || 1, o = BASIC_NAMES.has(k) ? null : ownFor(k, BD.id), ow = o ? o.free : 0, eu = BASIC_NAMES.has(k) ? 0 : dkPx(k);
    return { k: (tgt === 'side' ? 'sb:' : '') + k, key: k, tgt, name: c.name, n: bdLabel(k, c.name), q, im: m.im ? collImage(k, x ? x.l : '', m.im, c.name).src : '', s: BASIC_NAMES.has(k) ? 'basic' : ow >= q ? 'own' : eu ? 'ok' : 'none', c: eu * Math.max(1, q - ow), ow, own: o ? o.own : 0, held: o && o.held ? bdHeldTxt(o) : '', mc: m.mc || '', cm: m.cm, tl: m.tl || '', sb: tgt === 'side' }; };
  return [...[...BD.main.values()].map(c => one(c, 'main')), ...[...BD.side.values()].map(c => one(c, 'side'))];
}
function bdVisualHtml() {
  const items = bdViewItems(), snap = { ref: true }, view = BD.view;
  const groups = BD.sort === 'role' && typeof dvRoleGroups === 'function' ? dvRoleGroups(items, true) : groupSnap(items, BD.sort, true);
  BD.vflat = []; let n = 0;
  const tile = (it, sm) => { BD.vflat.push(it); return (view === 'strips' ? dvStrip : dvTile)(it, n++, snap, null, sm); };      // sm : carte recouverte d'une pile, petite image (viewer.js › dvSmall)
  const head = g => `<h3><span>${/^m\d$/.test(g.id) ? T('Coût {m}', { m: esc(T(g.label)) }) : esc(T(g.label))}</span><small>${TN(g.count, '{n} carte', '{n} cartes')}${esc(landGroupNote(g))}</small></h3>`;
  const box = (cls, list) => `<div class="${cls}">${list.map((it, j) => tile(it, cls === 'dvp' && j < list.length - 1)).join('')}</div>`;
  if (!groups.length) return `<p class="hint">${T('Ajoute des cartes depuis « Ajouter » : les tiennes d\'abord, puis toutes les cartes Magic.')}</p>`;
  const body = view === 'piles' ? `<div class="dv-piles">${groups.map(g => `<section class="dv-g dv-pile">${head(g)}${box('dvp', g.items)}</section>`).join('')}</div>`
    : groups.map(g => { const half = Math.ceil(g.items.length / 2); return `<section class="dv-g">${head(g)}${view === 'stacks' ? `<div class="dv-stk">${box('dvp', g.items.slice(0, half))}${g.items.length > 1 ? box('dvp', g.items.slice(half)) : ''}</div>` : box(view === 'strips' ? 'dv-strips' : 'dv-grid', g.items)}</section>`; }).join('');
  return `<div class="dv-groups bd-vis" data-view="${view}">${body}</div>`;
}
function bdCmdrHtml() {
  if (BD.fmt !== 'commander') return '';
  return `<div class="sec-title">${T(BD.cmdr.length > 1 ? 'Commandants' : 'Commandant')}</div>` + (BD.cmdr.length ? BD.cmdr.map(c => bdRow(c.key, c.name, 1, 'cmdr', 'deck')).join('') : `<button class="btn ghost small" type="button" data-act="pick-cmdr" style="align-self:flex-start">${T('Choisir un commandant')}</button>`);
}
/** Compagnon de la liste (section « Companion » d'un export) : hors des 100 cartes d'un Commander, une carte de la réserve en Standard (core.js › deckModel). */
function bdCompHtml() {
  if (!BD.comp.size) return '';
  return `<div class="sec-title">${T('Compagnon')} <span class="bd-opt">${BD.fmt === 'commander' ? T('hors des 100 cartes') : T('dans la réserve')}</span></div>` + [...BD.comp.values()].map(c => bdRow(c.key, c.name, c.qty, 'comp', 'deck')).join('');
}
/** Carte touchée dans une vue en images : en grand, avec « Retirer du deck » (et les autres cartes du deck en glissant). */
function bdVisualOpen(i) {
  const list = (BD.vflat || []).map(it => ({ key: it.key, lid: it.key + '|' + it.tgt, name: it.n, ln: it.name, wl: viewLang(it.key, true), small: it.im || zoomUrl(it.name, 'small'), lang: 'en', plain: true,
    extra: (it.own ? TN(it.own, '{n} exemplaire dans ta collection', '{n} exemplaires dans ta collection', { n: it.own }) : T('Pas dans ta collection')) + (it.held ? ' · ' + it.held : ''),      // possédés, et ceux engagés dans un autre deck monté
    act: { label: it.q > 1 ? T('Retirer un exemplaire du deck') : T('Retirer du deck'), fn: () => { bdChange(it.tgt, it.key, it.name, -1); closeCardImage(); } } }));
  if (list[i]) openCardViewer(list, i);
}
function bdDeckHtml() {
  if (BD.view && BD.view !== 'list' && !BD.split) return bdToolsHtml() + bdCmdrHtml() + bdCompHtml() + bdVisualHtml();
  const mainAll = [...BD.main.values()], basicKeys = new Set(BD_BASICS.map(b => b[0]));
  const spells = mainAll.filter(c => !BASIC_NAMES.has(c.key)).sort(bdCmp), others = mainAll.filter(c => BASIC_NAMES.has(c.key) && !basicKeys.has(c.key)).sort(bdCmp);
  let h = BD.split ? '' : bdToolsHtml();
  h += bdCmdrHtml() + bdCompHtml();
  h += `<div class="sec-title">${T('Deck')} · ${nf0(bdCount(BD.main))}</div>`;
  h += spells.length ? spells.map(c => bdRow(c.key, c.name, c.qty, 'main', 'deck')).join('') : `<p class="hint">${T('Ajoute des cartes depuis « Ajouter » : les tiennes d\'abord, puis toutes les cartes Magic.')}</p>`;
  h += `<div class="sec-title">${T('Terrains de base')} · ${nf0(mainAll.filter(c => BASIC_NAMES.has(c.key)).reduce((a, c) => a + c.qty, 0))}</div>`;
  h += BD_BASICS.map(([k, en, fr]) => bdRow(k, en, (BD.main.get(k) || {}).qty || 0, 'main', 'deck', T(fr))).join('') + others.map(c => bdRow(c.key, c.name, c.qty, 'main', 'deck')).join('');
  if (BD.fmt === 'standard') {
    const side = [...BD.side.values()].sort(bdCmp);
    h += `<div class="sec-title">${T('Réserve')} · ${nf0(bdCount(BD.side))} <span class="bd-opt">${T('facultative')}</span></div>`;
    h += side.length ? side.map(c => bdRow(c.key, c.name, c.qty, 'side', 'deck')).join('') : `<p class="hint">${T('Jusqu\'à 15 cartes. Choisis « Réserve » dans l\'onglet Collection ou Chercher.')}</p>`;
  }
  return h;
}
function bdIndex() {
  if (BD.idx && BD.idxV === CN.v) return BD.idx;
  BD.idxV = CN.v;      // index des noms arrivé : noms de la langue de l'appli et des cartes cherchés aussi (cardnames.js)
  return (BD.idx = Object.entries(COLL.map).map(([k, x]) => { const dn = (x.l && frName(k, x.l)) || ''; return { k, n: x.n, dn, s: normPart(x.n + ' ' + dn + ' ' + frOf(k) + ' ' + cnOf(x.n)) }; })
    .sort((a, b) => NAME_CMP(a.dn || a.n, b.dn || b.n)));
}
function bdAddRow(k, name, label) {
  const tgt = BD.tgt, q = tgt === 'cmdr' ? (BD.cmdr.some(c => c.key === k) ? 1 : 0) : ((BD[tgt].get(k) || {}).qty || 0);
  return bdRow(k, name, q, tgt, 'coll', label || (COLL.map[k] ? '' : cnOf(name)));      // carte à acheter : son nom dans la langue de l'appli (l'anglais en petit)
}
function bdCollHtml() {
  if (!collCount()) return `<div class="deck-empty">${T('Ta collection est vide. Utilise « Chercher » pour ajouter n\'importe quelle carte au deck.')}</div>`;
  const words = normPart(BD.q).split(' ').filter(Boolean);
  let items = bdIndex().filter(it => words.every(w => it.s.includes(w)));
  if (BD.tgt === 'cmdr') items = items.filter(it => canCommand(COLL.meta[it.k]) === 1);      // règle unique (core.js › canCommand)
  const shown = items.slice(0, BD.shown);
  let h = BD.tgt === 'cmdr' ? '<p class="hint">' + T('Les cartes de ta collection qui peuvent être commandant.') + (COLL.enrich ? ' ' + T('Lecture des cartes en cours…') : '') + '</p>' : '';
  h += shown.map(it => bdAddRow(it.k, it.n, it.dn)).join('');
  if (!items.length) h += `<p class="hint">${words.length ? T('Aucune carte de ta collection ne correspond.') : BD.tgt === 'cmdr' ? T('Aucun commandant possible dans ta collection (ou cartes pas encore lues).') : ''}</p>`;
  h += moreBtn(shown.length, items.length, BD_PAGE, 'class="link-btn more-decks" data-act="more"');
  return h;
}
/** Onglet « Ajouter » : une seule recherche. D'abord tes cartes (nom français ou anglais, réservées ailleurs signalées), puis toutes les cartes Magic
 *  qui correspondent et que tu n'as pas (à acheter). Sans recherche : ta collection. */
function bdAddHtml() {
  const q = BD.q.trim(), words = normPart(q).split(' ').filter(Boolean), has = collCount() > 0, flt = filterActive({ ...BD.f, q: '' });      // flt : rangement ou filtre de la collection (bdadd.js)
  const own = has ? bdOwn(words) : [];
  const shown = own.slice(0, BD.shown), mine = new Set(own.map(it => it.k));
  let h = BD.tgt === 'cmdr' ? '<p class="hint">' + T('Les cartes de ta collection qui peuvent être commandant, puis toutes les autres.') + (COLL.enrich ? ' ' + T('Lecture des cartes en cours…') : '') + '</p>' : '';
  h += bdBulkHtml(own, flt || words.length > 0);      // « Ajouter les N cartes listées »
  if (shown.length) h += `<div class="sec-title">${T('Dans ta collection')} · ${nf0(own.length)}</div>` + (own.length > 1 && !BD.sel && BD.tgt !== 'cmdr' && !bdLpKnown() ? `<p class="hint bd-lp-hint">${T('Appui long sur une carte : en choisir plusieurs.')}</p>` : '') + shown.map(it => bdAddRow(it.k, it.n, it.dn)).join('');      // astuce : jusqu'au premier appui long (bdadd.js)
  h += moreBtn(shown.length, own.length, BD_PAGE, 'class="link-btn more-decks" data-act="more"');
  if (q.length >= 2 && !flt) {      // toutes les cartes Magic : sans filtre seulement (rangement, couleur… ne valent que pour la collection)
    if (BD.catErr) h += `<div class="status" data-ok="0"><span class="dot"></span><span>${esc(BD.catErr)}</span></div>`;
    else if (!BD.cat) h += `<div class="status" data-ok="0"><span class="dot"></span><span>${T('Chargement du catalogue (une seule fois)…')}</span></div>`;
    else {
      const sug = collSuggest(BD.cat, q, 24).filter(n => !mine.has(ownKey(n))).slice(0, 20); BD.want = sug.map(n => ({ key: ownKey(n), name: n })); bdMetaSoon();
      if (sug.length) h += `<div class="sec-title">${T('À acheter')} · ${T('toutes les cartes Magic')}</div>` + sug.map(n => bdAddRow(ownKey(n), n)).join('');
      else if (!own.length) h += `<p class="hint">${T('Aucune carte de ce nom. Vérifie l\'orthographe.')}</p>`;
    }
  } else if (!has) h += `<div class="deck-empty">${T('Tape au moins 2 lettres du nom : toutes les cartes Magic sont cherchables ici.')}</div>`;
  else if (!own.length && (words.length || flt)) h += `<p class="hint">${T('Aucune carte de ta collection ne correspond.')}</p>`;
  return h;
}
function bdFindHtml() {
  if (BD.catErr) return `<div class="status" data-ok="0"><span class="dot"></span><span>${esc(BD.catErr)}</span></div>`;
  if (!BD.cat) return `<div class="status" data-ok="0"><span class="dot"></span><span>${T('Chargement du catalogue (une seule fois)…')}</span></div>`;
  const q = BD.q.trim();
  if (q.length < 2) return `<p class="hint">${T('Tape au moins 2 lettres du nom : toutes les cartes Magic sont cherchables ici.')}</p>`;
  const sug = collSuggest(BD.cat, q, 20); BD.want = sug.map(n => ({ key: ownKey(n), name: n })); bdMetaSoon();
  return sug.map(n => bdAddRow(ownKey(n), n)).join('') || `<p class="hint">${T('Aucune carte de ce nom. Vérifie l\'orthographe.')}</p>`;
}
function bdList() {
  const el = BD.el; if (!el) return;
  const px = $('#bdList .dv-piles', el), left = px ? px.scrollLeft : 0;      // vue Piles : la position de côté est gardée au repeint (− / +, fiches et prix qui arrivent)
  imgKeep($('#bdList', el), BD.tab === 'deck' ? bdDeckHtml() : BD.tab === 'coll' ? bdAddHtml() : BD.tab === 'coach' && typeof dwCoachHtml === 'function' ? dwCoachHtml() : bdFindHtml());      // images déjà affichées reprises : − / +, fiches et prix qui arrivent ne font plus clignoter les cartes (app.js)
  if (BD.split) imgKeep($('#bdDeck', el), bdDeckHtml());      // ordinateur : la liste du deck reste affichée à droite
  thumbsReady(el);      // images déjà en cache : visibles tout de suite, la liste ne clignote pas à chaque − / +
  if (left) { const n = $('#bdList .dv-piles', el); if (n) n.scrollLeft = left; }
  const so = $('#bdSort', el); if (so) mountSeg(so, [{ v: 'mana', label: T('Mana') }, { v: 'type', label: T('Type') }, { v: 'role', label: T('Rôle') }], BD.sort, v => { BD.sort = v; bdList(); });
  toolsFit($('#bdList .bd-tools', el));      // texte agrandi, langue longue : vues sous le tri (viewer.js)
}
/** Ordinateur : écran large et souris (même requête que zz-desktop.css et la barre latérale, nav.js). */
const bdSplit = () => { try { return matchMedia('(min-width:1100px) and (hover:hover) and (pointer:fine)').matches; } catch (e) { return false; } };
/** Nom du deck et « Scanner des cartes » (onglet Deck ; sur ordinateur, au-dessus de la liste du deck, et le scan va alors dans le deck). */
const bdNameCtl = () => `<div class="field-in"><label class="label" for="bdName">${T('Nom du deck')}</label><input type="text" id="bdName" maxlength="120" autocomplete="off" placeholder="${T('Mon deck')}" value="${esc(BD.name)}"></div><button class="btn ghost block bd-scan" type="button" data-act="scan"${BD.split ? ' data-tgt="main"' : ''} aria-label="${T('Scanner des cartes')}" title="${T('Scanner des cartes')}"><svg class="i" aria-hidden="true"><use href="#i-camera"/></svg><span>${T('Scanner des cartes')}</span></button>`;
function bdPaint() {
  const el = BD.el; if (!el) return;
  bdHead(); $('#bdSum', el).innerHTML = bdSumHtml(); bdList();
}
/** Changement d'onglet : contrôles (nom · cible + recherche) puis liste. */
/** Catalogue de toutes les cartes (2e partie des résultats de l'onglet Ajouter) : lu une fois ; échec : message (hors ligne, Scryfall), relu au retour du réseau. */
function bdCatLoad() {
  collCatalog().then(c => { BD.cat = c; BD.catErr = ''; if (BD.el && BD.tab === 'coll' && BD.q.trim().length >= 2) bdList(); })
    .catch(e => { BD.catErr = collCatErr(e); if (BD.el && BD.tab === 'coll') bdList(); window.addEventListener('online', () => { if (BD.cat) return; BD.catErr = ''; if (BD.el && BD.tab === 'coll') bdList(); bdCatLoad(); }, { once: true }); });
}
function bdTab(v) {
  const el = BD.el; if (!el) return;
  BD.tab = v; BD.q = BD.f.q = ''; BD.shown = BD_PAGE; BD.fb = null; if (v !== 'coll') { BD.sel = null; bdSelPaint(); }
  const ctl = $('#bdCtl', el); $('#bdSeg', el).setValue(v);
  const scanB = (cls, label) => `<button class="${label ? 'btn ghost' : 'icon-btn'} ${cls}" type="button" data-act="scan" aria-label="${T('Scanner des cartes')}" title="${T('Scanner des cartes')}"><svg class="i" aria-hidden="true"><use href="#i-camera"/></svg>${label ? `<span>${label}</span>` : ''}</button>`;      // scan en mode deck (bdScan)
  if (v === 'deck') ctl.innerHTML = bdNameCtl();
  else if (v === 'coach') ctl.innerHTML = '';
  else {
    const opts = BD.fmt === 'commander' ? [{ v: 'main', label: T('Deck') }, { v: 'cmdr', label: T('Commandant') }] : [{ v: 'main', label: T('Deck') }, { v: 'side', label: T('Réserve') }];
    if (!opts.some(o => o.v === BD.tgt)) BD.tgt = 'main';
    ctl.innerHTML = `<div class="bd-add"><span>${T('Ajouter au')}</span><div class="seg" id="bdTgt" role="radiogroup" aria-label="${T('Ajouter au')}"></div>${scanB('icon-btn bd-scan-ic', '')}</div>
      <div id="bdPlc">${bdPlcHtml()}</div><div id="bdF"></div>`;      // rangement et filtres de la collection (bdadd.js)
    mountSeg($('#bdTgt', ctl), opts, BD.tgt, t => { BD.tgt = t; BD.shown = BD_PAGE; if (t === 'cmdr') { BD.sel = null; bdSelPaint(); } bdList(); });
    bdFiltMount($('#bdF', ctl));
    if (!BD.cat && !BD.catErr) bdCatLoad();      // catalogue de toutes les cartes : lu une fois, pour la 2e partie des résultats
    if (v === 'coll') { BD.idx = null; if ((collMissing().length || collLangMissingCount()) && !COLL.enrichErr) collEnrich(); }
  }
  bdList(); if (typeof dwBannerHtml === 'function' && dwOn()) $('#bdSum', el).innerHTML = bdSumHtml();      // bannière du coach : visible hors de l'onglet Coach
  const sc = $(BD.split ? '.bd-l' : '.dv-scroll', el); if (sc) sc.scrollTop = 0;
}

/** Carte d'une rangée de l'éditeur pour la visionneuse (appui sur sa vignette) : image dans la langue possédée si Scryfall l'a donnée, sinon anglaise. */
function bdViewItem(row) {
  const k = row.dataset.k, m = bdMeta(k); if (!m || !m.im) return null;
  const x = COLL.map[k], l = x ? x.l : '', im = collImage(k, l, m.im, row.dataset.n), own = collQty(k);
  return { key: k, lid: k + '|' + row.dataset.t, name: bdLabel(k, row.dataset.n), ln: row.dataset.n, wl: viewLang(k, true), small: im.src, lang: im.lang, plain: true,
    extra: `${own ? TN(own, '{n} exemplaire dans ta collection', '{n} exemplaires dans ta collection', { n: own }) : T('Pas dans ta collection')}${dkPx(k) ? ' · ' + T('valeur estimée {p}', { p: fmt(dkPx(k), mkCur()) }) : ''}` };      // même prix que l'en-tête et le viewer (dkPx)
}

/* ── Interactions ─────────────────────────────────────────────────────────────────────────────── */
function bdClick(e) {
  if (BD.sel) { const r = e.target.closest('#bdList .bd-pick'); if (r) { bdSelToggle(r.dataset.k, r.dataset.n); return; } }      // mode sélection : l'appui coche
  const st = e.target.closest('.qstep button[data-d]');
  if (st) {
    const row = st.closest('.bd-row'); if (!row) return;
    const d = Number(st.dataset.d), k = row.dataset.k, tgt = row.dataset.t;
    if (bdChange(tgt, k, row.dataset.n, d)) {
      haptic('tap');
      if (d > 0 && BD.tab === 'coll' && tgt !== 'cmdr' && !BASIC_NAMES.has(k)) {      // carte possédée, mais tous ses exemplaires sont réservés par un autre deck monté : le dire tout de suite
        const o = ownFor(k, BD.id), q = ((BD[tgt] && BD[tgt].get(k)) || {}).qty || 0, ds = o.decks;
        if (o.own > 0 && q > o.free && ds.length) toast(T('{name} : ton exemplaire est dans « {deck} ». À y reprendre quand tu joueras ce deck, ou à acheter.', { name: bdLabel(k, row.dataset.n), deck: ds[0].n || T('un autre deck') }));
      }
    }
    return;
  }
  const vb = e.target.closest('[data-bdview]');
  if (vb) { BD.view = vb.dataset.bdview; try { localStorage.setItem(BD_VIEW_KEY, BD.view); } catch (x) { /* ignore */ } haptic('tap'); bdList(); return; }
  const tl = e.target.closest('.bd-vis .dvc'); if (tl) { bdVisualOpen(Number(tl.dataset.i)); return; }
  const b = e.target.closest('button[data-act]'); if (!b) return;
  const act = b.dataset.act;
  if (typeof dwClick === 'function' && dwClick(b)) return;      // onglet Coach (deckwiz.js)
  if (act === 'close') bdClose();
  else if (act === 'save') bdSave();
  else if (act === 'issues') { BD.issuesOpen = !BD.issuesOpen; bdPaint(); }
  else if (act === 'more') { BD.shown += BD_PAGE; bdList(); }
  else if (act === 'scan') bdScan(b.dataset.tgt);
  else if (act === 'bdplc') { haptic('tap'); bdPlcSheet(); }
  else if (act === 'bulk') bdBulkListed();
  else if (act === 'sel-add') bdSelAdd();
  else if (act === 'sel-cancel') { haptic('tap'); bdSelEnd(); }
  else if (act === 'pick-cmdr') { BD.tgt = 'cmdr'; $('#bdSeg', BD.el).setValue('coll'); bdTab('coll'); haptic('tap'); }
}

/* ── Enregistrement : comme un deck normal, puis monté ────────────────────────────────────────── */
function bdSave() {
  const ck = bdCheck();
  if (!ck.n) { toast(T('Ajoute d\'abord des cartes')); return; }
  if (BD.fmt === 'commander' && !BD.cmdr.length) { toast(T('Choisis d\'abord un commandant')); return; }
  readOpts();
  const prev = BD.id ? findDeck(BD.id) : null, text = dkBuildText(bdData());
  const name = BD.name.trim().slice(0, 120) || (prev && prev.name) || ('Deck ' + bdFmtName(BD.fmt));
  const doc = deckDoc({ name, text, opts: prev ? prev.opts : S.opts, history: prev ? prev.history : [], snap: prev && prev.snap, createdAt: prev && prev.createdAt });
  const id = prev ? prev.id : newIdFor();
  putDeck(id, doc);
  if (typeof dwSaved === 'function') dwSaved(id);      // réglages du coach (thèmes, bracket, budget) gardés avec le deck
  let reserved = 0;
  if (prev) engRefresh(id, name, text);                                   // deck déjà monté : ses cartes réservées suivent la liste
  else { const q = engSnapshot(text, collQty); reserved = Object.values(q).reduce((a, x) => a + x, 0); if (reserved) engSet(id, name, text); }      // nouveau deck : monté automatiquement
  let ranged = 0, place = '';
  if (BD.scanPref && BD.scanPref.size && typeof plcMount === 'function' && Object.values(engSnapshot(text, collQty)).some(q => q > 0)) {      // deck scanné : monté et rangé dans « Deck : … »
    if (!engIsOn(id)) engSet(id, name, text);
    const pref = BD.scanPref, pid = plcMount(id, name, text, (k, g) => { const set = pref.get(k); return !!set && set.has(lineKey(lineLang(g), lineEd(g), lineFoil(g))); });
    if (pid) { ranged = (plcStats().get(pid) || { q: 0 }).q; place = plcName(pid); }
  }
  if (S.deckId === id) { $('#deckText').value = text; refreshDeck(); updateSaveButtons(); }
  const nb = ck.issues.filter(i => i.lv === 'bad' || i.lv === 'warn').length;
  bdClose(true); haptic('ok');
  const msg = (prev ? T('Deck mis à jour') : T('Deck créé') + (reserved && !ranged ? ' · ' + TN(reserved, '{n} carte réservée de ta collection', '{n} cartes réservées de ta collection') : ''))
    + (ranged ? ' · ' + TN(ranged, '{n} carte rangée dans « {place} »', '{n} cartes rangées dans « {place} »', { place }) : '');
  toast(nb && !prev ? msg + ' · ' + T('incomplet') : msg, { label: T('Ouvrir'), fn: () => loadDeck(id) });
}
