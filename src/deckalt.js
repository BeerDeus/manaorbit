/* ── deckalt.js : « Remplacer… » depuis la carte en grand de l'éditeur (deck Commander) ─────────────────────────────────────────────
   Le joueur choisit LA carte à retirer (le Coach, lui, choisit seul : deckana.js › dwSwaps). Même moteur : candidates du même rôle pour ce commandant
   (deckwiz.js › dwSuggest : couleurs, bracket, exclusions, collection), budget du deck tenu échange par échange (comme dwSwaps), note du coach avant / après (deckopt.js › dsScore).
   Jusqu'à 5 propositions sous des angles différents, chacune avec son prix, l'écart de prix et sa raison :
       1. la meilleure du même rôle ;
       2. une carte de la collection (exemplaire libre : rien à acheter) ;
       3. une bien moins chère (au moins deux fois), aussi utile à peu près ;
       4. un rôle sous la plage normale (rampe, pioche…) quand la carte n'en remplit aucun qui manque ;
       puis les suivantes du même rôle.
   « Remplacer » : l'échange dans l'éditeur (annulable) ; étoile : liste de souhaits. Vignette : la carte en grand. */
const DALT = { api: null, k: '', list: null, seen: new Set() };      // seen : cartes déjà proposées, écartées par « Autres propositions »

/** Rôles de jauge d'une carte (ordre des jauges), condition de victoire comprise. */
const daltRoles = roles => [...DW_GAUGES.map(g => g[0]).filter(r => r !== 'land'), 'wincon'].filter(r => roles & DW_RB[r]);
/** Le bouton « Remplacer… » a sa place : deck Commander de l'éditeur, carte du deck (pas le commandant, pas un terrain de base). */
const daltOk = k => !!(typeof BD !== 'undefined' && BD.el && BD.fmt === 'commander' && BD.cmdr.length && BD.main.has(k) && !BASIC_NAMES.has(k));
/** Action du viewer (viewer.js › it.alt) pour la carte k de l'éditeur, ou rien. */
const daltAct = k => (daltOk(k) ? { label: T('Remplacer…'), fn: () => daltSheet(k) } : null);

/** Propositions pour remplacer k dans le deck X (l'éditeur) : { W (carte retirée), list: [{ C (dwSuggest), kind, role, head, why, after }], base (note), cmd } ;
 *  null sans commandant, sans la carte ou sans la base du coach. */
function daltList(k, X = BD, max = 5, skip = null) {      // skip : clés à ne pas proposer (déjà montrées)
  if (!DW.byKey) return null;
  const c = X.main.get(k), cmd = dwCmdOf(X); if (!c || !cmd) return null;
  const pack = DW.cmd.get(cmd.slug) || null, set = X.wiz || dwDefaults(), info = dwInfo(pack, set, cmd);
  const prof = dwProfile(X), tgt = dwTargets(prof, cmd, pack, set), x = dwCard(k), o = info.get(k) || null;
  const roles = x ? x.roles : 0, land = !!(roles & DW_RB.land), price = dwPrice(k, x, true);
  const W = { k, name: c.name, x, o, roles, v: o ? dwVal(o) : 0, price, bp: dwBudPx(k, price, set, X.id), own: ownFree(k, X.id != null ? X.id : null) > 0 };
  const Xs = { ...X, skip: new Set(skip || []), info, wiz: { ...set, bud: 0 } };      // budget compté ici : la place de la carte retirée est libre (comme dwSwaps)
  const lim = set.bud > 0 ? set.bud : 0, total = dwSpent(prof, set), fits = C => !lim || C.bp <= W.bp || total - W.bp + C.bp <= lim;
  const mine = land ? ['land'] : daltRoles(roles).slice(0, 2);      // ses deux premiers rôles ; sans rôle : le plan du commandant
  const pool = new Map();
  for (const r of mine.length ? mine : ['']) for (const C of dwSuggest(r, cmd, pack, prof, tgt, 40, Xs)) if (C.k !== k && fits(C)) { const p = pool.get(C.k); if (!p || C.s > p.C.s) pool.set(C.k, { C, role: r }); }
  const same = [...pool.values()].sort((a, b) => b.C.s - a.C.s), out = [], used = new Set();
  const add = (e, kind) => { if (!e || used.has(e.C.k) || out.length >= max) return; used.add(e.C.k); out.push({ ...e, kind }); };
  add(same[0], 'best');
  if (!W.own) add(same.find(e => !used.has(e.C.k) && e.C.own), 'own');
  if (W.price >= 100) add(same.find(e => !used.has(e.C.k) && e.C.price > 0 && e.C.price <= W.price * 0.5 && e.C.v >= W.v - 0.3), 'cheap');
  if (!land && !(typeof daRoleLow === 'function' && daRoleLow(roles, prof, tgt))) {      // retirer la carte ne creuse pas un manque : un rôle sous sa plage peut prendre sa place
    const gap = [...DW_GAUGES.map(g => g[0]).filter(r => r !== 'land'), 'wincon'].filter(r => tgt[r] && prof[r] < tgt[r][0] && !(roles & DW_RB[r]) && !(r === 'counter' && !cmd.ci.includes('U')))
      .sort((a, b) => (tgt[b][1] - prof[b]) - (tgt[a][1] - prof[a]))[0];
    if (gap) { const C = dwSuggest(gap, cmd, pack, prof, tgt, 10, Xs).find(C => C.k !== k && !used.has(C.k) && fits(C)); if (C) add({ C, role: gap }, 'need'); }
  }
  for (const e of same) add(e, 'more');
  // note du coach avec chaque échange, essayé seul sur une copie du deck
  const base = typeof dsScore === 'function' ? dsScore(X, { cmd, pack, info }) : null;
  for (const e of out) {
    if (base) { const m = new Map([...X.main].map(([kk, cc]) => [kk, { ...cc }])), w = m.get(k); if (w.qty > 1) w.qty--; else m.delete(k); m.set(e.C.k, { key: e.C.k, name: e.C.name, qty: 1 }); const sc = dsScore({ main: m, cmdr: X.cmdr, wiz: X.wiz, id: X.id }, { cmd, pack, info }); e.after = sc ? sc.total : null; }
    e.better = base && e.after != null ? e.after > base.total : null; e.head = daltHead(W, e, cmd); e.why = typeof dwWhy === 'function' ? dwWhy(e.C, cmd, Xs) : '';
  }
  return { W, list: out, base: base ? base.total : null, cmd, pack };
}
/** Raison principale d'une proposition, en clair (les mêmes mots que les échanges du coach quand ils disent la même chose). */
function daltHead(W, e, cmd) {
  const nm = cmd.names[0].split(',')[0], C = e.C, a = (W.o && W.o.incl) || 0, b = (C.o && C.o.incl) || 0;
  if (e.kind === 'need') return T('Il manque : {r}', { r: dsRoleLabel(e.role) });
  if (e.kind === 'own') return T('Dans ta collection : rien à acheter');
  if (e.kind === 'cheap') return e.role ? T('Même rôle, bien moins chère') : T('Bien moins chère, presque aussi utile');      // carte sans rôle : pas de « même rôle »
  const up = e.better != null ? e.better : C.v > W.v + 0.1;      // « plus utile » : la note du coach monte (sinon, à défaut de note, la valeur pour ce commandant)
  if (!e.role) return up ? T('Sert mieux le plan de {name}', { name: nm }) : T('Autre carte du plan de {name}', { name: nm });
  if (b >= a + 10) return T('Même rôle, bien plus jouée avec {name}', { name: nm });
  if (up) return T('Même rôle, plus utile dans ce deck avec {name}', { name: nm });
  return T('Même rôle, autre option');
}

/* ── Feuille ─────────────────────────────────────────────────────────────────────────────────────── */
function daltSheet(k) {
  const c = BD.main.get(k); if (!c) return;
  closeCardImage();
  if (!BD.wiz && typeof dwSettingsFor === 'function') BD.wiz = dwSettingsFor(BD.id);
  if (DALT.api) DALT.api.close();
  openSheet(T('Remplacer {name}', { name: bdLabel(k, c.name) }), T('Propositions du coach pour ce deck'), api => {
    Object.assign(DALT, { api, k, list: null, seen: new Set() }); api.wrap.classList.add('dalt-sheet'); dwImgs(api.body);
    const close0 = api.close; api.close = () => { if (DALT.api === api) DALT.api = null; close0(); };
    api.body.addEventListener('click', daltClick);
    api.foot.addEventListener('click', e => { if (e.target.closest('[data-dalt-more]')) daltMore(); });
    daltLoad();
  });
}
/** Base du coach, données EDHREC (commandant), paquet du commandant : chargés au besoin, la feuille se repeint à chaque arrivée. */
function daltLoad() {
  const api = DALT.api; if (!api) return;
  const again = () => { if (DALT.api === api) daltLoad(); };
  if (typeof EDH !== 'undefined' && !EDH.data && typeof edhEnsure === 'function') { edhEnsure(); if (EDH.p) { daltWait(T('Chargement des cartes conseillées…')); EDH.p.then(again, again); return; } }
  if (!DW.core) { if (DW.err && !DW.p) return daltMsg(DW.err); daltWait(T('Chargement de la base du coach…')); dwLoad().then(again, again); return; }
  const cmd = dwCmdOf(); if (!cmd) return daltMsg(T('Choisis d\'abord ton commandant : le coach s\'appuie sur les decks qui le jouent.'));
  if (!DW.cmd.has(cmd.slug)) { daltWait(T('Chargement des cartes conseillées…')); dwPack('c', cmd.slug).then(again, again); return; }
  daltPaint();
}
const daltWait = t => { if (DALT.api) DALT.api.body.innerHTML = `<div class="status" data-ok="0"><span class="dot"></span><span>${esc(t)}</span></div>`; };
const daltMsg = t => { if (DALT.api) DALT.api.body.innerHTML = `<p class="hint">${esc(t)}</p>`; };
function daltPaint() {
  const api = DALT.api; if (!api) return;
  const r = DALT.list || (DALT.list = daltList(DALT.k, BD, 5, DALT.seen));
  if (!r) return daltMsg(T('Cette carte n\'est plus dans le deck.'));
  const { W, cmd } = r, nm = cmd.names[0].split(',')[0], cur = mkCur();
  const rl = daltRoles(W.roles).map(dsRoleLabel), bits = [W.roles & DW_RB.land ? T('rôle : {r}', { r: T('Terrains') }) : rl.length ? T('rôle : {r}', { r: rl.join(', ') }) : T('rôle : plan de jeu')];
  if (W.price > 0) bits.push(fmt(W.price, cur));
  bits.push(W.o && W.o.incl ? T('{p} % des decks de {name}', { p: W.o.incl, name: nm }) : T('absente des decks de {name} étudiés', { name: nm }));
  if (W.own) bits.push(T('dans ta collection'));
  let h = `<p class="dalt-w">${esc(bits.join(' · '))}</p>`;
  if (W.o && W.o.trap) h += `<p class="hint dalt-trap">${esc(T('{card} marche mal avec {name}', { card: bdLabel(W.k, W.name), name: nm }))}</p>`;
  if (!r.pack) h += `<p class="hint">${esc(T('Ce commandant n\'est pas encore dans la base du coach : propositions d\'après les cartes les plus jouées en Commander.'))}</p>`;
  h += r.list.length ? `<div class="dalt-list">${r.list.map((e, i) => daltRow(e, i, W, r.base)).join('')}</div>`
    : `<p class="hint">${esc(T('Rien à proposer dans tes couleurs, ton bracket et ton budget.'))}</p>`;
  api.body.innerHTML = h;
  api.setFoot(r.list.length ? `<button class="btn ghost block" type="button" data-dalt-more><svg class="i" aria-hidden="true"><use href="#i-swap"/></svg>${esc(T('Autres propositions'))}</button>` : '');
  if (typeof dmMissing === 'function' && typeof bdMetaSoon === 'function' && dmMissing(r.list.map(e => ({ key: e.C.k, name: e.C.name }))).length) { BD.want = r.list.map(e => ({ key: e.C.k, name: e.C.name })); bdMetaSoon(); }      // fiches (images) des propositions
}
function daltRow(e, i, W, base) {
  const C = e.C, k = C.k, nm = bdLabel(k, C.name), cur = mkCur(), d = C.price - W.price;
  const px = C.price > 0 ? fmt(C.price, cur) : '', dl = Math.abs(d) >= 1 ? (d > 0 ? '+' : '−') + fmt(Math.abs(d), cur) : '';
  const w = typeof TR !== 'undefined' && TR.wish ? TR.wish[k] : null;
  const tags = [C.own ? `<span class="tag good">${esc(T('Dans ta collection'))}</span>` : '',
    base != null && e.after != null && e.after !== base ? `<span class="tag${e.after > base ? ' good' : ' warn'}">${esc(T('note {a} → {b}', { a: base, b: e.after }))}</span>` : ''].filter(Boolean).join('');
  return `<div class="dalt-row" data-k="${esc(k)}" data-n="${esc(C.name)}">${typeof daThumb === 'function' ? daThumb(k, C.name).replace('data-zoom="da"', 'data-zoom="dalt"') : ''}
    <span class="row-main"><span class="row-top"><span class="row-name">${esc(nm)}</span>${px ? `<span class="dalt-px">${esc(px)}${dl ? `<small class="${d < 0 ? 'dn' : 'up'}">${esc(dl)}</small>` : ''}</span>` : ''}</span>
      <b class="dalt-head">${esc(e.head)}</b>${e.why ? `<span class="dalt-why">${esc(e.why)}</span>` : ''}${tags ? `<span class="row-meta">${tags}</span>` : ''}
      <span class="dalt-acts"><button class="icon-btn dalt-wish${w ? ' on' : ''}" type="button" data-dalt="wish" data-i="${i}" aria-pressed="${!!w}" aria-label="${esc(w ? T('Retirer {name} de ta liste de souhaits', { name: nm }) : T('Ajouter {name} à ta liste de souhaits', { name: nm }))}" title="${esc(w ? T('Dans ta liste de souhaits') : T('Liste de souhaits'))}"><svg class="i" aria-hidden="true"><use href="#i-star"/></svg></button><button class="btn small" type="button" data-dalt="swap" data-i="${i}"><svg class="i" aria-hidden="true"><use href="#i-swap"/></svg>${esc(T('Remplacer'))}</button></span></span></div>`;
}
/** « Autres propositions » : les cartes montrées sont écartées, le coach propose les suivantes ; plus rien : retour aux premières. */
function daltMore() {
  const r = DALT.list; if (!DALT.api || !r) return;
  for (const e of r.list) DALT.seen.add(e.C.k);
  DALT.list = daltList(DALT.k, BD, 5, DALT.seen); haptic('tap');
  if (DALT.list && !DALT.list.list.length) { DALT.seen.clear(); DALT.list = null; toast(T('Plus d\'autres propositions : retour aux premières')); }
  daltPaint(); DALT.api.body.scrollTop = 0;
}
function daltClick(ev) {
  const b = ev.target.closest('[data-dalt]'), r = DALT.list; if (!b || !r) return;
  const e = r.list[Number(b.dataset.i)]; if (!e) return;
  const C = e.C, W = r.W;
  if (b.dataset.dalt === 'swap') {
    if (!BD.main.has(W.k)) { DALT.list = null; return daltPaint(); }
    const before = new Map([...BD.main].map(([kk, c]) => [kk, { ...c }])), c = BD.main.get(W.k);
    if (c.qty > 1) c.qty--; else BD.main.delete(W.k);
    const had = BD.main.get(C.k); if (had) had.qty++; else BD.main.set(C.k, { key: C.k, name: C.name, qty: 1 });
    BD.dirty = true; haptic('ok'); bdPaint(); bdMetaSoon();
    if (DALT.api) DALT.api.close();
    toast(T('{a} → {b}', { a: bdLabel(W.k, W.name), b: bdLabel(C.k, C.name) }), { label: tUndo(), fn: () => { BD.main = before; BD.dirty = true; bdPaint(); haptic('tap'); } });
    return;
  }
  if (b.dataset.dalt === 'wish' && typeof TR !== 'undefined') {
    const k = C.k, was = TR.wish[k], name = C.name;
    if (was) { delete TR.wish[k]; haptic('tap'); toast(T('{name} retirée de ta liste de souhaits', { name }), { label: tUndo(), fn: () => { TR.wish[k] = was; trChanged(); daltPaint(); } }); }
    else { TR.wish[k] = { n: name, q: 1 }; haptic('ok'); toast(T('{name} ajoutée à ta liste de souhaits', { name }), { label: tUndo(), fn: () => { delete TR.wish[k]; trChanged(); daltPaint(); } }); }
    trChanged(); daltPaint();
  }
}
/* Vignettes de la feuille : la carte proposée en grand, les autres en glissant. */
if (typeof ZOOM_LISTS !== 'undefined') ZOOM_LISTS.dalt = th => {
  const row = th.closest('.dalt-row'); if (!row || !DALT.api) return null;
  return zoomFrom($$('.dalt-row', DALT.api.body), row, r => zoomNamed(r.dataset.k, bdLabel(r.dataset.k, r.dataset.n), r.dataset.n, viewLang(r.dataset.k, true)));
};
