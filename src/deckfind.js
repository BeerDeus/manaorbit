/* ── deckfind.js : « De ta collection pour ce deck » (viewer d'un deck Commander) ───────────────────────────────────────────────────────
   Les cartes que tu possèdes (collection, jamais les proxys), absentes du deck, dans l'identité de couleur du commandant, que les decks de ce
   commandant jouent le plus : taux d'inclusion calculé ici, hors ligne, sur les decks du fichier EDHREC de l'appli (edh.bin.gz : EDHREC, Archidekt,
   Communauté ; edh.js › edhLoad, lu seulement quand la section s'ouvre). Vignette, prix, emplacement (places.js), réservée par un autre deck monté
   (extras.js), « + au deck » : ajoutée à la liste d'un deck de Mes decks ; un deck pas encore enregistré l'est d'abord, avec la carte.
   Rien d'écrit ailleurs que dans le deck (aucun nouveau champ) ; section repliée par défaut, ouverte ou non gardée sur l'appareil. */
const DF_KEY = 'deckdeal:dfopen', DF_PAGE = 30, DF_MIN = 5;      // DF_MIN : en dessous, trop peu de decks pour un taux qui veuille dire quelque chose
const DF = { open: false, shown: DF_PAGE, of: null, last: null };
try { DF.open = localStorage.getItem(DF_KEY) === '1'; } catch (e) { /* stockage indisponible : section repliée */ }

/** Clés des commandants du deck affiché (repérés par le viewer : bloc « Commander » ou 1re carte légendaire) ; [] en Standard ou sans commandant. */
function dfCmdKeys() {
  if (!DV.snap || dkFormat(DV.text) === 'standard') return [];
  return [...new Set(DV.snap.items.filter(i => i.cmd).map(i => ownKey(String(i.k))))].slice(0, 2);
}
/** Commandant du fichier EDHREC pour ces clés : la même paire (ou le même seul), sinon, pour un seul commandant, celui qui le joue le plus (edhIndex › by) ; null s'il n'y est pas. */
function dfCmdOf(e, keys) {
  if (!e || !keys.length) return null;
  let best = null;
  for (const c of e.cmds) if (c.keys.length === keys.length && keys.every(k => c.keys.includes(k)) && (!best || c.decks > best.decks)) best = c;
  return best || (keys.length === 1 ? e.by.get(keys[0]) || null : null);
}
/** Inclusion des cartes dans les decks de ce commandant : { n : decks, cnt : decks qui jouent chaque numéro de carte }. Une fois par commandant et par fichier lu. */
function dfIncl(e, c) {
  const memo = e._dfIncl || (e._dfIncl = new Map()); let r = memo.get(c.i); if (r) return r;
  const cnt = new Uint16Array(e.names.length); let n = 0;
  for (const d of e.decks) {
    if (d.cmd !== c) continue; n++;
    for (let j = e.off[d.i], z = e.off[d.i + 1]; j < z; j++) cnt[e.ids[j]]++;      // un deck ne contient jamais deux fois la même carte (edhPack)
  }
  r = { n, cnt }; memo.set(c.i, r); return r;
}
/** Cartes proposées : possédées, ni dans le deck ni commandant, ni terrain de base, dans l'identité de couleur (inconnue : gardée, elle est jouée avec ce commandant),
 *  de la plus jouée à la moins jouée. → [{ k, id, n (decks), r (taux) }] */
function dfRows(e, c, inc) {
  const pd = parseDeck(DV.text), skip = new Set([...c.keys, ...dfCmdKeys()]), ci = c.ci, out = [];
  for (const x of [...pd.cards, ...pd.basics, ...dkSideCards(DV.text)]) skip.add(ownKey(x.key || x.name));
  for (let id = 0; id < inc.cnt.length; id++) {
    const n = inc.cnt[id]; if (!n || e.bs[id]) continue;
    const k = e.keys[id]; if (skip.has(k) || !(collQty(k) > 0)) continue;
    const m = COLL.meta[k]; if (m && typeof m.ci === 'string' && ![...m.ci].every(x => ci.includes(x))) continue;
    skip.add(k); out.push({ k, id, n, r: n / inc.n });
  }
  const nm = x => (COLL.map[x.k] || {}).n || x.k;
  return out.sort((a, b) => b.n - a.n || NAME_CMP(nm(a), nm(b)));
}
/** Nom affiché d'une carte possédée : français si l'exemplaire l'est (comme la collection), sinon anglais. */
const dfName = k => { const x = COLL.map[k]; return (x && x.l && frName(k, x.l)) || (x && x.n) || k; };
/** Prix d'une carte possédée (centimes) : celui de la collection, sinon celui du fichier EDHREC ; 0 si inconnu. */
const dfPrice = (e, x) => { const m = COLL.meta[x.k]; const u = m ? unitPrice(m) : null; return u || e.pr[x.id] || 0; };
/** Emplacements de la carte (places.js) : « Classeur rouge », « Non rangé »… */
function dfPlaces(k) {
  const ps = [...new Set(collLines(COLL.map[k]).map(([g]) => (typeof plcOf === 'function' ? plcOf(g) : '')))];
  return ps.map(p => (typeof plcName === 'function' ? plcName(p) : '')).filter(Boolean);
}
/** Un deck où l'on peut ajouter une carte : celui de Mes decks ouvert, ou la copie enregistrée d'un deck venu d'ailleurs ; null sinon. */
function dfTarget() {
  if (DV.live) return null;
  if (DV.deckId && !DV.pub) return findDeck(DV.deckId);
  const c = DV.adhoc ? dvCopy() : null; return c ? findDeck(c.id) : null;
}

/** La section (fermée ou ouverte) ; '' quand elle n'a pas lieu d'être (Standard, pas de commandant, EDHREC coupé par le serveur). */
function dfSecHtml() {
  if (!dfCmdKeys().length || (typeof edhOff === 'function' && edhOff('edhrec'))) return '';
  return `<details class="df" id="dfSec"${DF.open ? ' open' : ''}><summary class="df-h"><span class="df-ht"><b>${T('De ta collection pour ce deck')}</b><small class="df-sub">${T('Tes cartes que les decks de ce commandant jouent')}</small></span><span class="df-n" hidden></span><svg class="i df-chev" aria-hidden="true"><use href="#i-chev"/></svg></summary><div class="df-body" aria-live="polite"></div></details>`;
}
/** Section posée par dvFrame : écoute l'ouverture ; calcule si elle est ouverte. */
function dfMount() {
  const sec = DV.el && $('#dfSec', DV.el); if (!sec) return;
  if (DF.of !== DV.el) { DF.of = DV.el; DF.shown = DF_PAGE; }      // un autre deck : liste repartie de la première page
  sec.addEventListener('toggle', () => {
    if (sec.open === sec._was) return; sec._was = sec.open;      // « toggle » part aussi, plus tard, pour une section posée ouverte : déjà peinte, rien à refaire (le focus resterait sinon sur une ligne remplacée)
    DF.open = sec.open; try { localStorage.setItem(DF_KEY, DF.open ? '1' : '0'); } catch (e) { /* choix pour cette session */ }
    if (sec.open) { haptic('tap'); dfPaint(); }
  });
  sec.addEventListener('click', dfClick);
  sec._was = sec.open;
  if (sec.open) dfPaint();
}
/** Contenu de la section : chargement du fichier EDHREC au besoin, puis les cartes. */
function dfPaint() {
  const el = DV.el, sec = el && $('#dfSec', el); if (!sec || !sec.open) return;
  const body = $('.df-body', sec), n = $('.df-n', sec), sub = $('.df-sub', sec), wrap = el;
  const msg = (t, retry) => { body.innerHTML = `<p class="hint df-msg">${t}</p>${retry ? `<button class="btn ghost small" type="button" data-df="retry">${T('Réessayer')}</button>` : ''}`; n.hidden = true; };
  if (!EDH.data) {
    if (EDH.err && !EDH.p) return msg(esc(EDH.err), true);
    msg(T('Lecture des decks EDHREC…'));
    edhLoad().then(() => { if (DV.el === wrap) dfPaint(); }, () => { if (DV.el === wrap) dfPaint(); });
    return;
  }
  const t0 = performance.now(), e = EDH.data, keys = dfCmdKeys(), c = dfCmdOf(e, keys);
  const cname = c ? c.names.join(' + ') : (DV.snap.items.find(i => i.cmd) || {}).n || '';
  if (!c) return msg(T('Aucun deck de {name} dans les données EDHREC de l\'appli : pas de suggestion pour ce commandant.', { name: esc(cname) }));
  const inc = dfIncl(e, c);
  if (inc.n < DF_MIN) return msg(inc.n ? TN(inc.n, 'Seulement {n} deck de {name} dans les données EDHREC de l\'appli : trop peu pour dire quelles cartes ce commandant joue vraiment.', 'Seulement {n} decks de {name} dans les données EDHREC de l\'appli : trop peu pour dire quelles cartes ce commandant joue vraiment.', { name: esc(cname) })
    : T('Aucun deck de {name} dans les données EDHREC de l\'appli : pas de suggestion pour ce commandant.', { name: esc(cname) }));
  if (!collCount()) return msg(T('Ta collection est vide : ajoute tes cartes pour voir celles qui iraient dans ce deck.'));
  const rows = dfRows(e, c, inc), ms = performance.now() - t0, shown = rows.slice(0, DF.shown);
  DF.last = { ms, decks: inc.n, rows: rows.length, cmd: c.slug };      // relu par les tests (temps du calcul)
  sub.textContent = TN(inc.n, 'D\'après {n} deck de {name}', 'D\'après {n} decks de {name}', { n: nf0(inc.n), name: cname });
  n.hidden = !rows.length; n.textContent = nf0(rows.length);
  if (!rows.length) return msg(T('Aucune autre carte de ta collection n\'apparaît dans les decks de {name}.', { name: esc(cname) }));
  const tgt = dfTarget(), canAdd = !DV.live;
  const note = DV.live ? `<p class="hint df-note">${T('Pour ajouter ces cartes, ouvre ce deck depuis Mes decks.')}</p>`
    : !tgt ? `<p class="hint df-note">${T('Ce deck n\'est pas dans Mes decks : « + au deck » l\'y enregistre, avec la carte.')}</p>` : '';
  const fr = document.activeElement && document.activeElement.closest ? document.activeElement.closest('.df-row') : null, fk = fr && body.contains(fr) ? fr.dataset.k : '';      // repeint (synchro de Mes decks) : le focus reste sur la même carte
  body.innerHTML = `${note}<div class="df-list">${shown.map(x => dfRowHtml(e, x, cname, canAdd)).join('')}</div>
    ${rows.length > shown.length ? `<button class="link-btn df-more" type="button" data-df="more">${T('Voir plus ({n} restantes)', { n: nf0(rows.length - shown.length) })}</button>` : ''}`;
  const back = fk && $$('.df-row', body).find(r => r.dataset.k === fk); if (back) { const b = $('.df-add', back); if (b) b.focus({ preventScroll: true }); }
}
function dfRowHtml(e, x, cname, canAdd) {
  const it = COLL.map[x.k], m = COLL.meta[x.k] || {}, nm = dfName(x.k), hue = hash32(x.k) % 360, img = m.im ? collImage(x.k, it.l, m.im).src : '';
  const pct = pctTxt(x.r), price = dfPrice(e, x), pl = dfPlaces(x.k), own = collQty(x.k), free = engFree(own, XS.eng, x.k, DV.deckId), ds = engDecksOf(XS.eng, x.k).filter(d => d.id !== DV.deckId);
  const tags = [`<span class="tag df-pl" title="${esc(pl.join(' · '))}">${esc(pl[0] || T('Non rangé'))}${pl.length > 1 ? ' +' + (pl.length - 1) : ''}</span>`];
  if (ds.length) tags.push(`<span class="tag warn df-eng" title="${esc(ds.map(d => d.n).join(' · '))}">${free > 0 ? TN(own - free, '{n} engagée ailleurs', '{n} engagées ailleurs') : ds.length > 1 ? T('Réservée par {n} decks montés', { n: ds.length }) : T('Réservée par « {name} »', { name: esc(ds[0].n) })}</span>`);
  return `<div class="crow df-row" data-k="${esc(x.k)}"><span class="thumb" style="--h:${hue}"${zoomAt('dfc', nm)}>${esc((nm.trim()[0] || '?').toUpperCase())}${img ? `<img alt="" loading="lazy" decoding="async" src="${esc(img)}">` : ''}</span>
    <span class="row-main"><span class="row-name">${esc(nm)}</span><span class="df-rate" title="${esc(T('{a} decks sur {b}', { a: nf0(x.n), b: nf0(Math.round(x.n / x.r)) }))}"><i style="width:${Math.max(3, Math.round(x.r * 100))}%"></i></span><span class="df-pct">${T('dans {p} des decks {name}', { p: pct, name: esc(cname) })}</span><span class="row-meta">${tags.join('')}</span></span>
    <span class="df-end"><b class="df-px">${price ? esc(fmt(price, 'EUR')) : '—'}</b>${canAdd ? `<button class="btn ghost small df-add" type="button" data-df="add" aria-label="${esc(T('Ajouter {name} au deck', { name: nm }))}">${T('+ au deck')}</button>` : ''}</span></div>`;
}
function dfClick(e) {
  const b = e.target.closest('[data-df]'); if (!b) return;
  const a = b.dataset.df;
  if (a === 'retry') { EDH.err = ''; dfPaint(); }
  else if (a === 'more') { DF.shown += DF_PAGE; haptic('tap'); const sc = $('.dv-scroll', DV.el), y = sc ? sc.scrollTop : 0; dfPaint(); if (sc) sc.scrollTop = y; }
  else if (a === 'add') { const r = b.closest('.df-row'); if (r) dfAdd(r.dataset.k); }
}

/* ── « + au deck » ───────────────────────────────────────────────────────────────────────────────────────────────────── */
/** Texte du deck avec un exemplaire de plus de cette carte : ligne « 1 Nom » juste après la dernière carte du deck (jamais dans la réserve, le maybeboard
 *  ni le bloc des commandants) ; le reste du texte (sections d'un export, image du deck) ne bouge pas. */
function dfTextWith(text, name) {
  const secs = deckSecs(text), lines = secs.map(s => s[0]); let at = -1;
  secs.forEach(([raw, sec], i) => { const l = raw.trim(); if (sec !== 'main' || /^SB:/i.test(l) || /^(\/\/|#)/.test(l)) return; const p = parseLine(l); if (p && !p.ignored) at = i; });
  if (at < 0) return String(text || '').replace(/\s+$/, '') + '\n\nDeck\n1 ' + name;
  lines.splice(at + 1, 0, '1 ' + name);
  return lines.join('\n');
}
/** Ligne du relevé pour une carte ajoutée (possédée : rien à acheter, le total ne change pas). */
function dfSnapItem(k, name) {
  const m = COLL.meta[k] || DM[k] || {}, it = { k, n: name, q: 1, s: 'own' };
  if (m.cm != null) { it.cm = m.cm; it.mc = m.mc; it.tl = m.tl; it.cl = m.cl; }
  if (m.im) it.im = m.im;
  return it;
}
const dfSnapWith = (snap, it) => (snap && !snap.ref ? { ...snap, items: [...snap.items.filter(i => i.k !== it.k), it] } : snap);
/** Enregistre le nouveau texte d'un deck de Mes decks (relevé de prix gardé, avec la carte possédée en plus ; deck monté : ses réservations suivent). */
function dfPut(id, text, snap, local) {
  const cur = findDeck(id); if (!cur) return;
  putDeck(id, deckDoc({ name: cur.name, text, opts: cur.opts, history: cur.history, snap, createdAt: cur.createdAt }));
  if (local !== undefined) { if (local) snapSave(id, local); else snapDrop(id); }
  engRefresh(id, cur.name, text);
  if (S.deckId === id) { $('#deckText').value = text; refreshDeck(); updateSaveButtons(); }      // deck chargé dans la saisie : la liste suit (comme l'éditeur)
}
/** Viewer repeint avec ce texte et ce relevé, à la même hauteur ; focus sur le « + » suivant (le bouton touché a disparu). */
function dfShow(text, snap, focusAt) {
  if (!DV.el) return;
  const sc = $('.dv-scroll', DV.el), y = sc ? sc.scrollTop : 0;
  DV.text = text; if (snap) DV.snap = snap; dvRebuild(); DV.framed = null; dvRender();
  if (sc) sc.scrollTop = y;
  if (focusAt != null) { const bs = $$('#dfSec [data-df="add"]', DV.el), f = bs[Math.min(focusAt, bs.length - 1)] || $('#dfSec summary', DV.el); if (f) f.focus({ preventScroll: true }); }
}
function dfAdd(k) {
  const x = COLL.map[k]; if (!x || !DV.el || DV.live) return;
  const name = x.n, shown = dfName(k), at = $$('#dfSec .df-row', DV.el).findIndex(r => r.dataset.k === k), item = dfSnapItem(k, name);
  const d = dfTarget();
  if (d) {      // deck de Mes decks (ou copie enregistrée d'un deck venu d'ailleurs)
    const before = { text: d.text, snap: d.snap, local: snapsRead()[d.id] || null, view: DV.text, vsnap: DV.snap }, text = dfTextWith(d.text, name);
    dfPut(d.id, text, dfSnapWith(d.snap, item), before.local ? dfSnapWith(before.local, item) : undefined);
    if (DV.adhoc) DV.savedId = d.id;
    dfShow(DV.adhoc ? dfTextWith(DV.text, name) : text, dfSnapWith(DV.snap, item), at); haptic('ok');
    toast(T('{name} ajoutée à « {deck} »', { name: shown, deck: d.name }), { label: T('Annuler'), fn: () => {
      if (!findDeck(d.id)) return;
      dfPut(d.id, before.text, before.snap, before.local || null); dfShow(before.view, before.vsnap);
    } });
    return;
  }
  if (DV.adhoc && dvCopy()) { toast(T('Le deck arrive dans Mes decks : réessaie dans un instant.')); return; }      // enregistré à l'instant, pas encore revenu de la synchro
  if (!DV.adhoc) return;
  openSheet(T('Enregistrer ce deck ?'), DV.name, api => {      // deck EDHREC, de la communauté, reçu par un lien : il rejoint Mes decks, avec la carte
    api.body.innerHTML = `<p class="hint">${T('Pour y ajouter {name}, ce deck doit être dans Mes decks : il y sera enregistré avec cette carte.', { name: '<b>' + esc(shown) + '</b>' })}</p>`;
    api.setFoot(`<button class="btn ghost" type="button" data-close>${T('Annuler')}</button><button class="btn" type="button" data-df-save>${T('Enregistrer avec cette carte')}</button>`);
    $('[data-df-save]', api.foot).onclick = () => {
      api.close(); if (!DV.el || !DV.adhoc) return;
      if (D.hint && !D.authReady) { toast(T('Connexion au compte…')); return; }
      const prev = DV.text; DV.text = dfTextWith(DV.text, name); dvRebuild();
      dvSave();
      if (!dvCopy()) { DV.text = prev; dvRebuild(); }      // enregistrement refusé (stockage plein) : le deck affiché reste tel quel
      dfShow(DV.text, null, at);
    };
  });
}

/* Vignettes de la section : en grand, précédente / suivante dans la liste affichée (zoom.js). */
if (typeof ZOOM_LISTS !== 'undefined') ZOOM_LISTS.dfc = th => {
  const row = th.closest('.df-row'); if (!row) return null;
  return zoomFrom($$('.df-row', row.parentNode), row, r => {
    const k = r.dataset.k, x = COLL.map[k]; if (!x) return null;
    const m = COLL.meta[k] || {}, nm = dfName(k), ex = $('.df-pct', r) ? $('.df-pct', r).textContent : '';
    if (!m.im) return zoomNamed(k, nm, x.n, x.l, ex);
    const im = collImage(k, x.l, m.im);
    return { key: k, name: nm, ln: x.n, wl: viewLang(k, true), small: im.src, lang: im.lang, plain: true, extra: ex };
  });
};
