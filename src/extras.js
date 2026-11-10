/* ── extras.js : historique des paniers CardTrader, decks montés (cartes engagées), synchro de ces données et de l'historique de valeur ──────
   · Après « Remplir le panier », les offres réellement mises au panier forment un panier de l'historique (impression exacte : édition, numéro, langue, foil,
     état, prix ; core.js › cartNew), gardé sur l'appareil et dans le compte (users/{uid}/meta/carts : { c, updatedAt }, 20 paniers, 6 mois).
     « Paniers CardTrader » (Mon compte, Prix d'une liste) : chaque panier se modifie (− / +, ✕, édition, rangement du panier ou de la ligne) puis
     « Ajouter à la collection » ; il reste ensuite dans l'historique, marqué ajouté. ✕ sur un panier : supprimé (annulable).
   · Un deck « monté » réserve les exemplaires de la collection qu'il contient : les autres decks ne les comptent plus comme possédés.
   · Engagés et historique de valeur passent par le compte (users/{uid}/meta/engaged et /history) ; sans les règles Firestore à jour,
     tout reste sur l'appareil et un message le dit une fois. */
const BUY_KEY = 'deckdeal:buy:v1', CARTS_KEY = 'deckdeal:carts:v1', ENG_KEY = 'deckdeal:eng:v1';      // BUY_KEY : ancien panier unique (« J'ai acheté »), repris dans l'historique
const XS = { carts: [], cartsU: '', eng: {}, engU: '', warned: false, hOther: null, hReset: 0, docs: { engaged: { unsub: null, uid: '', state: 'off', pushT: 0 }, history: { unsub: null, uid: '', state: 'off', pushT: 0 }, carts: { unsub: null, uid: '', state: 'off', pushT: 0 }, prices: { unsub: null, uid: '', state: 'off', pushT: 0 } } };      // prices : prix du jour partagés (value.js › prcApply)

function xsRead() {
  try { const r = JSON.parse(localStorage.getItem(CARTS_KEY) || 'null'); XS.carts = cartsClean(r && r.c); XS.cartsU = (r && typeof r.u === 'string' && r.u) || ''; } catch (e) { XS.carts = []; }
  try {      // ancien panier en attente (« J'ai acheté ») : premier panier de l'historique
    const raw = localStorage.getItem(BUY_KEY), b = raw && buyClean(JSON.parse(raw));
    if (b) { const c = cartNew(b.items, '', b.at); if (c) { XS.carts = cartsMerge(XS.carts, [c]); cartsWrite(); } }
    if (raw) localStorage.removeItem(BUY_KEY);
  } catch (e) { /* illisible : oublié */ }
  try { const r = JSON.parse(localStorage.getItem(ENG_KEY) || 'null'); XS.eng = engClean(r && r.d); XS.engU = (r && typeof r.u === 'string' && r.u) || ''; } catch (e) { XS.eng = {}; }
}
function cartsWrite() { lsSet(CARTS_KEY, JSON.stringify({ c: XS.carts, ...(XS.cartsU ? { u: XS.cartsU } : {}) }), { msg: T('Stockage plein : l\'historique des paniers n\'a pas pu être enregistré') }); }
function engWrite() { lsSet(ENG_KEY, JSON.stringify({ d: XS.eng, ...(XS.engU ? { u: XS.engU } : {}) }), { msg: T('Stockage plein : les cartes réservées n\'ont pas pu être enregistrées') }); }      // plein : caches vidés d'abord (core.js › lsSet)

/* ── Historique des paniers CardTrader ─────────────────────────────────────────────────────────── */
const cartsLive = () => XS.carts.filter(c => !c.x);
const cartOf = id => XS.carts.find(c => c.id === id && !c.x) || null;
/** Après un remplissage de panier : les offres réellement ajoutées deviennent un panier de l'historique (src : nom de la liste). */
function buyRemember(added, src) {
  const c = cartNew(added, src); if (!c) return;
  XS.carts = cartsMerge(XS.carts, [c]); cartsSaved();
}
function cartsSaved() { cartsWrite(); xsPushSoon('carts'); cartsPaint(); }
/** Panier modifié (fn le change en place sur une copie) : enregistré, envoyé au compte. */
function cartEdit(id, fn) {
  const i = XS.carts.findIndex(c => c.id === id && !c.x); if (i < 0) return null;
  const c = { ...XS.carts[i], items: XS.carts[i].items.map(x => ({ ...x })) }; fn(c); c.u = Math.max(Date.now(), XS.carts[i].u + 1);
  if (!c.items.length) { cartDrop(id); return null; }      // plus aucune ligne : le panier part
  XS.carts = XS.carts.map((x, j) => (j === i ? c : x)); cartsSaved(); return c;
}
/** Supprime un panier (trace gardée pour les autres appareils) ; annulable par le toast. */
function cartDrop(id, undo) {
  const prev = cartOf(id); if (!prev) return;
  XS.carts = cartsClean(XS.carts.map(c => (c.id === id ? { id, at: c.at, u: Math.max(Date.now(), c.u + 1), x: 1 } : c))); cartsSaved();
  if (undo) toast(T('Panier supprimé'), { label: tUndo(), fn: () => { XS.carts = cartsClean(XS.carts.map(c => (c.id === id ? { ...prev, u: Date.now() } : c))); cartsSaved(); } });
}
/** Repeint ce qui montre l'historique (bouton de Prix d'une liste, feuilles ouvertes). */
function cartsPaint() {
  const off = !cartsLive().length || (typeof mkUs === 'function' && mkUs());      // marché TCGplayer : pas de CardTrader
  for (const b of $$('.carts-btn')) b.hidden = off;
  for (const f of CARTS.paint) f();
}
const CARTS = { paint: new Set() };
/** Ligne « Paniers CardTrader » de Mon compte : paniers pas encore ajoutés à la collection. */
function cartsMeRow() {
  if (typeof mkUs === 'function' && mkUs()) return '';
  const n = cartsLive().filter(c => !c.d).length;
  return meRow('carts', T('Paniers CardTrader'), n ? TN(n, '{n} à ajouter', '{n} à ajouter') : '');
}
const cartDate = t => dateShort(t);
/** Rangement affiché ('' : non rangé, ou places.js absent). */
const cartPlcName = p => (typeof plcName === 'function' ? plcName(p && COLL.places[p] ? p : '') : T('Non rangé'));
const cartPlcColor = p => (typeof plcColor === 'function' ? plcColor(p && COLL.places[p] ? p : '') : '#4a4f66');

/** « Paniers CardTrader » : les paniers de l'historique, du plus récent au plus ancien. */
function openCartsSheet() {
  openSheet(T('Paniers CardTrader'), T('Les cartes mises au panier depuis Mana Orbit'), api => {
    api.wrap.classList.add('carts-sheet');
    const paint = () => {
      if (!sheets.includes(api)) { CARTS.paint.delete(paint); return; }
      const l = cartsLive();
      api.body.innerHTML = !l.length ? `<p class="hint listempty">${T('Aucun panier pour l\'instant : remplis ton panier CardTrader depuis Prix d\'une liste, les cartes ajoutées apparaîtront ici.')}</p>`
        : `<p class="hint">${T('Une fois la commande passée sur CardTrader, ouvre le panier pour ajouter ses cartes à ta collection (édition, langue, foil, état et rangement).')}</p><div class="carts">${l.map(c => {
          const m = cartSum(c);
          return `<div class="cart-h${c.d ? ' done' : ''}" data-id="${esc(c.id)}"><button type="button" class="cart-o" data-act="open"><span class="cart-t"><b>${esc(c.s || T('Panier du {date}', { date: cartDate(c.at) }))}</b>
            <small>${esc([c.s ? cartDate(c.at) : '', TN(m.cards, '{n} carte', '{n} cartes'), TN(m.q, '{n} exemplaire', '{n} exemplaires'), m.tot ? fmt(m.tot, m.cu) : ''].filter(Boolean).join(' · '))}</small></span>
            <span class="tag ${c.d ? 'good' : 'accent'}">${c.d ? T('Ajouté le {date}', { date: cartDate(c.d) }) : T('À ajouter')}</span></button>
            <button type="button" class="ib-x" data-act="del" aria-label="${esc(T('Supprimer ce panier'))}"><svg class="i"><use href="#i-close"/></svg></button></div>`;
        }).join('')}</div>`;
    };
    CARTS.paint.add(paint); paint();
    api.body.addEventListener('click', e => {
      const b = e.target.closest('[data-act]'), row = e.target.closest('.cart-h'); if (!b || !row) return;
      haptic('tap');
      if (b.dataset.act === 'del') cartDrop(row.dataset.id, true); else openCartOne(row.dataset.id);
    });
  });
}
/** Un panier : lignes (− / +, ✕, édition, rangement), puis « Ajouter à la collection ». Un panier déjà ajouté se consulte seulement. */
function openCartOne(id) {
  const c0 = cartOf(id); if (!c0) return;
  openSheet(c0.s || T('Panier du {date}', { date: cartDate(c0.at) }), T('Rempli le {date}', { date: cartDate(c0.at) }), api => {
    api.wrap.classList.add('cart-sheet');
    const edit = fn => { const sc = api.body.scrollTop; cartEdit(id, fn); paint(); api.body.scrollTop = sc; };
    const paint = () => {
      if (!sheets.includes(api)) { CARTS.paint.delete(paint); return; }
      const c = cartOf(id); if (!c) { api.close(); return; }
      const m = cartSum(c), ro = !!c.d, places = typeof plcPick === 'function';
      const row = (it, i) => {
        const nm = typeof cardName === 'function' ? cardName(it.k, it.n) : it.n, have = collQty(it.k), own = it.p && it.p !== c.P;
        const meta = [it.l ? flag(it.l) : '', it.f ? '<span class="tag accent">Foil ✦</span>' : '', it.c ? `<span class="tag">${esc(it.c.toUpperCase())}</span>` : '', it.pr ? `<span>${esc(fmt(it.pr, it.cu))}</span>` : ''].filter(Boolean).join('');
        return `<div class="buy-row cart-row${it.q ? '' : ' off'}" data-i="${i}"><span class="b-n"><b>${esc(nm)}</b>
          <small>${ro ? `<span class="tag">${esc(it.e ? edLabel(it.e) : T('Sans édition'))}</span>` : `<button type="button" class="tag cart-ed" data-act="ed" aria-label="${esc(T('Édition de {name}', { name: nm }))}">${esc(it.e ? edLabel(it.e) : T('Sans édition'))}</button>`}${meta}</small>
          ${ro ? '' : `<small>${places ? `<button type="button" class="link-btn cart-p${own ? ' on' : ''}" data-act="lp"><i style="--c:${cartPlcColor(it.p || c.P)}"></i>${esc(own ? cartPlcName(it.p) : T('Rangement du panier'))}</button>` : ''}<span>${have ? T('{n} déjà dans ta collection', { n: nf0(have) }) : T('nouvelle dans ta collection')}</span></small>`}</span>
          ${ro ? `<b class="cart-q">${nf0(it.q)}</b>` : `<span class="qstep"><button type="button" data-d="-1" aria-label="${esc(T('Moins de {name}', { name: nm }))}"${it.q ? '' : ' disabled'}>−</button><b>${it.q}</b><button type="button" data-d="1" aria-label="${esc(T('Plus de {name}', { name: nm }))}"${it.q >= it.q0 ? ' disabled' : ''}>+</button></span>
          <button type="button" class="ib-x" data-act="x" aria-label="${esc(T('Retirer {name} de ce panier', { name: nm }))}"><svg class="i"><use href="#i-close"/></svg></button>`}</div>`;
      };
      api.body.innerHTML = (ro ? `<div class="status" data-ok="1"><span class="dot"></span><span>${T('Ajouté à ta collection le {date}.', { date: cartDate(c.d) })}</span></div>`
        : `<p class="hint">${T('Une carte retirée du panier sur CardTrader ou pas reçue : baisse sa quantité ou retire la ligne (✕). Touche l\'édition pour la corriger.')}</p>
          ${places ? `<button type="button" class="plc-cur" data-act="cp"><i style="--c:${cartPlcColor(c.P)}"></i><span><small>${T('Ranger dans')}</small><b>${esc(cartPlcName(c.P))}</b></span><svg class="i" aria-hidden="true"><use href="#i-back"/></svg></button>` : ''}`)
        + `<div class="buy-list">${c.items.map(row).join('')}</div>
        <p class="hint">${esc([TN(m.cards, '{n} carte', '{n} cartes'), TN(m.q, '{n} exemplaire', '{n} exemplaires'), m.tot ? fmt(m.tot, m.cu) : ''].filter(Boolean).join(' · '))}</p>`;
      api.setFoot(ro ? `<button class="btn ghost" type="button" data-close>${T('Fermer')}</button>`
        : `<button class="btn ghost" type="button" data-close>${T('Fermer')}</button><button class="btn" type="button" id="cartAdd"${m.q ? '' : ' disabled'}>${TN(m.q, 'Ajouter {n} exemplaire', 'Ajouter {n} exemplaires')}</button>`);
      const go = $('#cartAdd', api.foot); if (go) go.onclick = () => cartToCollection(id, api);
    };
    CARTS.paint.add(paint); paint();
    api.body.addEventListener('click', e => {
      const c = cartOf(id); if (!c || c.d) return;
      if (e.target.closest('[data-act="cp"]')) { plcPick({ title: T('Ranger dans'), sub: T('Tout le panier (sauf les lignes rangées ailleurs)'), cur: c.P || '', onPick: p => edit(x => { if (p) x.P = p; else delete x.P; }) }); return; }
      const rowEl = e.target.closest('.cart-row'); if (!rowEl) return;
      const i = Number(rowEl.dataset.i), it = c.items[i]; if (!it) return;
      const st = e.target.closest('.qstep button');
      if (st && !st.disabled) { haptic('tap'); edit(x => { const y = x.items[i]; y.q = Math.max(0, Math.min(y.q0, y.q + Number(st.dataset.d))); }); return; }
      const b = e.target.closest('[data-act]'); if (!b) return;
      haptic('tap');
      if (b.dataset.act === 'x') edit(x => { x.items.splice(i, 1); });
      else if (b.dataset.act === 'lp') plcPick({ title: T('Ranger dans'), sub: it.n, cur: it.p || c.P || '', onPick: p => edit(x => { const y = x.items[i]; if (p && p !== x.P) y.p = p; else delete y.p; }) });
      else if (b.dataset.act === 'ed') {
        const nm = typeof cardName === 'function' ? cardName(it.k, it.n) : it.n;
        edSheet({ name: nm, sub: TN(it.q0, '{n} exemplaire', '{n} exemplaires') + (it.l ? ' · ' + langCode(it.l) : ''), cur: it.e || '', foil: !!it.f,
          load: () => scryArtPrints(it.n, it.l || 'en'), find: q => scryPrintsFind(it.n, it.l || 'en', q),
          onPick: p => edit(x => { const y = x.items[i]; if (!y || y.k !== it.k) return; const e2 = p ? edKey(p.set, p.num) : ''; if (e2) y.e = e2; else delete y.e; }) });
      }
    });
  });
}
/** « Ajouter à la collection » : chaque ligne avec sa langue, son édition, sa finition, son état et son rangement ; le panier reste, marqué ajouté (annulable). */
function cartToCollection(id, api) {
  const c = cartOf(id); if (!c || c.d) return;
  const add = cartToColl(c); if (!add.length) return;
  const before = COLL.map, n = add.reduce((a, x) => a + x.q, 0);
  collAdd(add, 'add'); collEnrich();
  cartEdit(id, x => { x.d = Date.now(); });
  if (api) api.close(); haptic('ok');
  toast(TN(n, '{n} exemplaire ajouté à ta collection', '{n} exemplaires ajoutés à ta collection'), { label: tUndo(), fn: () => { COLL.map = before; collChanged(); cartEdit(id, x => { delete x.d; }); } });
}

/* ── Decks montés : cartes de la collection réservées ─────────────────────────────────────────── */
const engIsOn = id => !!(XS.eng[id] && Object.keys(XS.eng[id].q).length);
/** Empreinte des decks montés (id + date de dernière modification) : sert à invalider les listes qui en dépendent. */
const engSig = () => Object.keys(XS.eng).sort().map(id => id + ':' + XS.eng[id].at).join(',');
const engCount = id => (XS.eng[id] ? Object.values(XS.eng[id].q).reduce((a, x) => a + x, 0) : 0);
/** Règle unique « possédée » / « à acheter » (core.js › engOwnFor) : { own, free, held, decks } de la carte k pour le deck deckId ; à acheter = quantité − free.
 *  Éditeur (BD.id), coach (X.id), viewer (DV.deckId), recherche (S.deckId), alertes, De ta collection : tous passent par ici. */
function ownFor(k, deckId) { return engOwnFor(collQty(k), XS.eng, k, deckId); }
/** ownFor(k, deckId).free sans construire l'objet (boucles du coach). */
function ownFree(k, deckId) { return engFree(collQty(k), XS.eng, k, deckId); }
/** Exemplaires libres pour le deck en cours de recherche : possédés − réservés par les autres decks montés. */
const engOwned = k => ownFree(k, S.deckId);
/** Exemplaires de la liste courante mis de côté par d'autres decks (non déduits du panier) et les decks concernés. */
function engHeldBack(cards) {
  let n = 0; const names = new Set();
  for (const c of cards) {
    const k = ownKey(c.key), own = collQty(k); if (!own) continue;
    const lost = Math.min(c.qty, own) - Math.min(c.qty, engOwned(k));
    if (lost > 0) { n += lost; for (const d of engDecksOf(XS.eng, k)) if (d.id !== S.deckId) names.add(d.n || T('un deck')); }
  }
  return { n, names: [...names] };
}
function engApplied() {
  refreshDeck(); renderDecks();
  if (COLL.el) collPaintBody(true);
  if (S.run && S.view === 'results') scheduleRecompute(true);
}
function engSaved() { engWrite(); xsPushSoon('engaged'); engApplied(); }
/** Exemplaires d'une carte qu'un deck peut réserver : possédés moins ceux déjà réservés par les AUTRES decks montés (deux decks ne se réservent pas le même exemplaire). */
const engFreeQty = id => k => engFree(collQty(k), XS.eng, k, id);
/** Rien à réserver pour ce deck : message selon que ses cartes manquent ou sont toutes réservées par d'autres decks. */
const engNoneMsg = text => Object.keys(engSnapshot(text, collQty)).length ? T('Ses cartes de ta collection sont déjà réservées par tes autres decks montés') : T('Aucune carte de ce deck n\'est dans ta collection');
/** Monte un deck : réserve les exemplaires possédés de sa liste qui ne sont pas déjà réservés ailleurs. */
function engSet(id, name, text) {
  XS.eng = { ...XS.eng, [id]: { n: String(name || '').slice(0, 120), at: Date.now(), q: engSnapshot(text, engFreeQty(id)) } };
  engSaved(); if (typeof prgSoon === 'function') prgSoon('deck');      // deck monté (badge « Monteur »)
  if (typeof plcDeckOf === 'function' && plcDeckOf(id)) plcMount(id, name, text);      // rangé dans « Deck : … » (places.js) : l'emplacement suit la liste
}
/** Démonte un deck (la trace vide est gardée pour que les autres appareils le sachent). */
function engClear(id, quiet) {
  if (typeof plcUnmount === 'function') plcUnmount(id);      // les cartes rangées dans « Deck : … » retournent à leur place (places.js)
  if (!XS.eng[id]) return;
  if (!engIsOn(id)) { if (quiet) { const x = { ...XS.eng }; delete x[id]; XS.eng = x; engWrite(); } return; }
  XS.eng = { ...XS.eng, [id]: { n: XS.eng[id].n, at: Date.now(), q: {} } };
  engSaved();
}
/** Liste enregistrée à nouveau : un deck monté suit sa liste (nouveau relevé des cartes possédées). */
function engRefresh(id, name, text) {
  if (!engIsOn(id)) return;
  const q = engSnapshot(text, engFreeQty(id)), cur = XS.eng[id];
  if (JSON.stringify(q) === JSON.stringify(cur.q) && cur.n === name) return;
  engSet(id, name, text);
}
/** Interrupteur « Deck monté » de la feuille d'un deck. */
function engBindSwitch(id, cb, hint) {
  const paint = () => {
    const n = engCount(id); cb.checked = engIsOn(id);
    hint.textContent = cb.checked
      ? TN(n, '{n} exemplaire de ta collection réservé pour ce deck.', '{n} exemplaires de ta collection réservés pour ce deck.')
      : T('Réserve ses cartes de ta collection pour ce deck.');
  };
  paint();
  cb.onchange = () => {
    if (cb.checked) {
      const d = findDeck(id);
      if (!d || !Object.keys(engSnapshot(d.text, engFreeQty(id))).length) { cb.checked = false; toast(d ? engNoneMsg(d.text) : T('Aucune carte de ce deck n\'est dans ta collection')); return; }
      engSet(id, d.name, d.text); haptic('ok'); toast(T('Deck monté : cartes réservées'));
    } else { engClear(id); haptic('tap'); toast(T('Deck démonté : cartes à nouveau disponibles')); }
    paint();
  };
}
/** Deck local envoyé dans le compte sous un nouvel identifiant (decks.js › importLocal) : ses réservations et son « Deck : … » le suivent. pairs : [[ancien, nouveau]]. */
function engRekey(pairs) {
  let eng = XS.eng, pl = COLL.places, n = 0; const now = Date.now();
  for (const [from, to] of pairs) {
    if (!from || !to || from === to) continue;
    if (eng[from] && Object.keys(eng[from].q).length) { eng = { ...eng, [to]: { ...eng[from], at: now }, [from]: { n: eng[from].n, at: now, q: {} } }; n++; }
    for (const pid in pl) if (pl[pid].t === 'deck' && pl[pid].r === from) pl = { ...pl, [pid]: placeNorm({ ...pl[pid], r: to }) };
  }
  if (n) { XS.eng = eng; engSaved(); }
  if (pl !== COLL.places) { COLL.places = pl; collChanged(); }
}
/* ── Decks supprimés sans être démontés : réservations et « Deck : … » orphelins ─────────────────
   Un deck disparu de la liste du compte (supprimé avant que la suppression ne démonte, depuis une version d'avant, deck local importé sous un autre identifiant,
   réservations d'un autre compte reprises sur cet appareil…) gardait ses cartes réservées : « × 8 · Elfe +1 » sur des cartes d'un seul deck en ×4, et ces
   exemplaires comptés comme manquants dans le vrai deck. Rattrapage à chaque liste des decks lue du serveur : démonté comme engClear (trace vide, les autres
   appareils l'apprennent), son emplacement « Deck : … » supprimé (les cartes retournent d'où elles venaient). Jamais hors compte ni sur une copie locale ;
   une réservation de moins de 10 minutes est épargnée (deck créé sur un autre appareil, liste pas encore arrivée ici). */
const ENG_ORPHAN_AGE = 10 * 60000;
let engSweepT = 0;
function engSweepSoon() { clearTimeout(engSweepT); engSweepT = setTimeout(engSweep, 2500); }
/** Nombre de decks orphelins démontés et d'emplacements « Deck : … » rendus. */
function engSweep() {
  clearTimeout(engSweepT); engSweepT = 0;
  const ids = typeof deckIdsSure === 'function' ? deckIdsSure() : null, doc = XS.docs.engaged;
  if (!ids || doc.state !== 'ok' || doc.uid !== D.uid) return 0;      // liste des decks ou réservations du compte pas encore lues du serveur
  const now = Date.now(), gone = Object.keys(XS.eng).filter(id => !ids.has(id) && engIsOn(id) && now - XS.eng[id].at >= ENG_ORPHAN_AGE);
  if (gone.length) { const x = { ...XS.eng }; for (const id of gone) x[id] = { n: x[id].n, at: now, q: {} }; XS.eng = x; engSaved(); }
  let pl = 0;
  if (typeof plcDelete === 'function' && COLL.cloud === 'ok' && COLL.s === D.uid)      // collection du compte lue du serveur
    for (const [pid, x] of Object.entries(COLL.places)) if (x.t === 'deck' && x.r && !ids.has(x.r) && !engIsOn(x.r)) { plcDelete(pid); pl++; }
  return gone.length + pl;
}
/** Pastille d'une carte de la collection réservée par un ou plusieurs decks. */
function engTag(k) {
  const ds = engDecksOf(XS.eng, k); if (!ds.length) return '';
  const q = ds.reduce((a, d) => a + d.q, 0), names = ds.map(d => d.n || T('deck'));
  return `<span class="tag mount" title="${T('Réservée pour : {list}', { list: esc(names.join(', ')) })}">${q > 1 ? '× ' + nf0(q) + ' · ' : ''}${esc(names[0].length > 18 ? names[0].slice(0, 17) + '…' : names[0])}${names.length > 1 ? ' +' + (names.length - 1) : ''}</span>`;
}

/* ── Synchro avec le compte (engagés, historique de valeur) ───────────────────────────────────── */
function xsFail(id, err) {
  const d = XS.docs[id]; d.state = 'error';
  if (err && err.code === 'permission-denied' && !XS.warned && id !== 'prices') { XS.warned = true; toast(T('Règles Firestore à publier pour synchroniser decks montés et historique (voir README)')); }
}
function xsUser(user) {
  for (const id in XS.docs) { const d = XS.docs[id]; if (d.unsub) { try { d.unsub(); } catch (e) { /* ignore */ } d.unsub = null; } clearTimeout(d.pushT); d.pushT = 0; d.state = 'off'; d.uid = ''; }
  XS.hOther = null; XS.hReset = 0;      // relevés de l'autre marché : inconnus tant que le compte n'a pas répondu (rien n'est envoyé avant, ils seraient perdus)
  if (user && XS.engU !== user.uid) {      // decks montés d'un autre compte : restent dans ce compte-là (synchronisés), jamais versés dans celui-ci
    if (XS.engU && Object.keys(XS.eng).length) { XS.eng = {}; engApplied(); }
    XS.engU = user.uid; engWrite();
  }
  if (user && XS.cartsU !== user.uid) {      // paniers d'un autre compte : restent dans ce compte-là ; ceux d'avant toute connexion partent dans ce compte
    if (XS.cartsU && XS.carts.length) { XS.carts = []; cartsPaint(); }
    XS.cartsU = user.uid; cartsWrite();
  }
  if (!user || !D.cloud || !D.cloud.watchMeta) return;
  for (const id in XS.docs) {
    const d = XS.docs[id]; d.state = 'sync'; d.uid = user.uid;
    d.unsub = D.cloud.watchMeta(user.uid, id, (data, pending, fromCache) => xsRemote(id, user.uid, data, pending, fromCache), err => xsFail(id, err));
  }
}
function xsRemote(id, uid, data, pending, fromCache) {
  if (pending || fromCache || D.uid !== uid) return;                      // écho d'une écriture en cours ou copie locale du SDK : on attend le serveur
  const d = XS.docs[id]; d.state = 'ok';
  if (data) acctSaw(id, uid); else if (acctLost(id, uid)) return;         // vu ici puis disparu : compte supprimé ailleurs ? rien n'est renvoyé (decks.js vérifie)
  if (id === 'engaged') {
    const remote = data ? engClean(data.decks) : {}, merged = engMerge(XS.eng, remote);
    if (!engSame(merged, XS.eng)) { XS.eng = merged; engWrite(); engApplied(); }
    if (!engSame(merged, remote)) xsPushSoon('engaged');
    engSweepSoon();      // réservations du compte lues : celles des decks qui n'existent plus sont rendues
  } else if (id === 'carts') {      // historique des paniers : chaque panier dans sa version la plus récente (core.js › cartsMerge)
    const remote = cartsClean(data && data.c), merged = cartsMerge(XS.carts, remote);
    if (!cartsSame(merged, XS.carts)) { XS.carts = merged; cartsWrite(); cartsPaint(); }
    if (!cartsSame(merged, remote)) xsPushSoon('carts');
  } else if (id === 'prices') {
    if (mkUs()) return;                                                     // prix du jour partagés : Cardmarket seulement (le document n'a pas de devise)
    if (data && prcApply(data)) return;                                     // prix plus récents lus par un autre appareil : pris tels quels
    if (VAL.at > (Number(data && data.at) || 0) && COLL.freshAt) xsPushSoon('prices');      // prix d'ici plus récents (relus aujourd'hui) : envoyés
  } else {
    // reset : « Recommencer la courbe » (value.js) fait ici ou sur un autre appareil ; le plus récent gagne, aucun relevé d'avant ne revient d'un côté ni de l'autre.
    // Marchés : relevés TCGplayer marqués m: 'us' (dollars), les autres en euros ; chaque appareil ne lit que ceux de son marché et renvoie les autres tels quels.
    // reset du document : celui de Cardmarket (les appareils d'avant le connaissent) ; TCGplayer garde le sien sur l'appareil (value.js › VAL.reset).
    const us = mkUs(), rr = Number(data && data.reset) || 0, newer = !us && rr > VAL.reset;
    if (newer) { VAL.reset = rr; VAL.hist = VAL.hist.filter(h => h.t >= rr); }
    const pts = data && Array.isArray(data.pts) ? data.pts.map(p => (Array.isArray(p) ? { t: p[0], v: p[1], n: p[2], q: p[3] } : p && typeof p === 'object' ? { t: p.t, v: p.v, n: p.n, q: p.q, ...histRule(p), ...(p.m === 'us' ? { m: 'us' } : {}) } : null)).filter(Boolean) : [];      // r, vo : règle du relevé (core.js › histRule)
    const all = pts.filter(h => (h.m === 'us') === us).map(({ m, ...h }) => h);
    XS.hOther = pts.filter(h => (h.m === 'us') !== us); XS.hReset = rr;
    const remote = all.filter(h => !(h.t < VAL.reset)), merged = histMerge(VAL.hist, remote);
    if (newer || !histSame(merged, VAL.hist)) { VAL.hist = merged; VAL.memo = null; valSave(false); paintCollSection(); if (COLL.el) collPaintBody(true); }
    if (!histSame(merged, all) || (!us && rr < VAL.reset)) xsPushSoon('history');
  }
}
function xsPushSoon(id) { const d = XS.docs[id]; if (!d || !d.uid) return; clearTimeout(d.pushT); d.pushT = setTimeout(() => xsPush(id), 900); }      // pushT remis à 0 à l'envoi : non nul = envoi en attente (syncFlush)
/** Relevés de valeur envoyés en objets { t, v, n, q } : Firestore refuse les tableaux de tableaux (l'ancien format [[t, v, n, q]] échouait sans bruit) ; la lecture accepte les deux. */
async function xsPush(id) {
  const d = XS.docs[id]; if (d) { clearTimeout(d.pushT); d.pushT = 0; }
  if (!d || !d.uid || acctHeld(d.uid) || !cloudOn() || !D.cloud.saveMeta) return;      // autre compte, ou compte en cours de suppression
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
  if (id === 'history' && !XS.hOther) return;      // relevés de l'autre marché pas encore lus : xsRemote renverra s'il le faut
  if (id === 'prices' && mkUs()) return;
  const doc = id === 'engaged' ? { decks: XS.eng, updatedAt: Date.now() } : id === 'carts' ? { c: XS.carts, updatedAt: Date.now() } : id === 'prices' ? prcDoc() : histDoc();      // reset : règles Firestore du 21 octobre
  if (!doc) return;
  try { await D.cloud.saveMeta(d.uid, id, doc); d.state = 'ok'; acctSaw(id, d.uid); } catch (err) { xsFail(id, err); }
}

/** Document meta/history : relevés de ce marché (m: 'us' pour TCGplayer) + ceux de l'autre, tels que lus (les plus anciens de l'autre retirés au-delà de 420, la borne
 *  des règles Firestore) ; reset : celui de Cardmarket. */
function histDoc() {
  const us = mkUs(), mine = VAL.hist.map(h => ({ t: h.t, v: h.v, n: h.n | 0, q: h.q | 0, ...histRule(h), ...(us ? { m: 'us' } : {}) })), other = (XS.hOther || []).slice(-Math.max(0, 420 - mine.length));
  const reset = us ? XS.hReset : VAL.reset;
  return { pts: [...other, ...mine].sort((a, b) => a.t - b.t), ...(reset ? { reset } : {}), updatedAt: Date.now() };
}
function xsInit() {
  xsRead(); cartsPaint();
  for (const b of $$('.carts-btn')) b.onclick = () => { haptic('tap'); openCartsSheet(); };
}
