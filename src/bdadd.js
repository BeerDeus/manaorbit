/* ── bdadd.js : éditeur de deck, onglet « Ajouter » : rangement, filtres de la collection, ajout groupé, sélection par appui long ─────────────────────
   Onglet « Ajouter » (builder.js › bdTab, bdAddHtml) : « Rangement » (un emplacement de la collection, places.js) et la barre de filtres de la collection
   (filters.js › mountFilters, « Plus de filtres » et recherches enregistrées de search.js), sur un filtre à part (BD.f) : la collection garde les siens.
   « Ajouter les N cartes listées » : toutes les cartes de la collection qui passent (pas seulement la page affichée). Appui long (≈ 450 ms) sur une ligne :
   mode sélection (cases à cocher, l'appui court coche), barre en bas « Ajouter N cartes » / « Annuler ».
   Règles d'un ajout groupé (bdBulkPlan), les mêmes que l'ajout à l'unité :
   - Commander : un exemplaire par carte ; terrains de base jamais ajoutés (à doser dans l'onglet Deck) ; cartes déjà dans le deck (ou commandant) ignorées ;
     hors de l'identité de couleur du commandant écartées (commandant choisi et ses couleurs lues ; carte aux couleurs inconnues : ajoutée) ;
     pas légales en Commander (builder.js › cardLegal : fiche Scryfall, sinon base du coach) ajoutées mais signalées, comme dans l'éditeur (pastille, alerte du résumé).
   - Standard : les exemplaires possédés (ceux du rangement et des filtres d'exemplaire choisis : langue, finition, extension… ; sélection : tous), 4 au plus
     (terrains de base : sans limite ; Relentless Rats, Seven Dwarves… : leur limite), moins ceux déjà dans le deck et la réserve ; réserve : 15 au plus.
   - Exemplaires réservés par un autre deck monté : ajoutés, avec le message de l'ajout à l'unité.
   Plus de 10 exemplaires d'un coup : feuille de confirmation (pas de confirm() : il ne marche pas dans l'appli), puis message « N cartes ajoutées » avec « Annuler »
   (deck d'avant remis, comme la construction du coach). */
const BD_LP_MS = 450, BD_BULK_ASK = 10;

/* ── Rangement et filtres ─────────────────────────────────────────────────────────────────────── */
/** Ligne « Rangement » (seulement si la collection a des emplacements). */
function bdPlcHtml() {
  if (typeof plcAny !== 'function' || !plcAny()) return '';
  const p = BD.f.place || '', c = !p ? 'var(--accent)' : p === '-' ? PLC_NONE : plcColor(p);
  return `<button type="button" class="plc-cur bd-plc" data-act="bdplc" aria-haspopup="dialog"><i style="--c:${c}"></i><span><small>${T('Rangement')}</small><b>${esc(!p ? T('Toute la collection') : p === '-' ? T('Non rangées') : plcName(p))}</b></span><svg class="i" aria-hidden="true"><use href="#i-back"/></svg></button>`;
}
function bdPlcPaint() { const b = BD.el && $('#bdPlc', BD.el); if (b) b.innerHTML = bdPlcHtml(); }
/** Feuille « Rangement » : toute la collection, les cartes non rangées, ou un emplacement (le même filtre que « Plus de filtres › Emplacement »). */
function bdPlcSheet() {
  const st = plcStats(), cur = BD.f.place || '';
  openSheet(T('Rangement'), T('Cartes proposées pour le deck'), api => {
    const row = (v, n, q, c) => `<button type="button" role="radio" class="plc-opt" data-p="${esc(v)}" aria-checked="${v === cur}"><i style="--c:${c}"></i><span>${esc(n)}</span><small>${q ? nf0(q) : ''}</small></button>`;
    api.body.innerHTML = `<div class="plc-radio" role="radiogroup" aria-label="${esc(T('Rangement'))}">${row('', T('Toute la collection'), collCopies(), 'var(--accent)')}${row('-', T('Non rangées'), (st.get('') || {}).q || 0, PLC_NONE)}${plcList().map(x => row(x.id, plcName(x.id), (st.get(x.id) || {}).q || 0, plcColor(x.id))).join('')}</div>`;
    api.body.addEventListener('click', e => {
      const r = e.target.closest('.plc-opt'); if (!r) return;
      haptic('tap'); api.close(); BD.f.place = r.dataset.p; if (BD.fb) BD.fb.fire(); else bdFiltChanged();
    });
  });
}
const bdFSig = () => JSON.stringify(srchSer(BD.f));
/** Filtre changé (barre, « Plus de filtres », pastilles, rangement) : liste refaite ; la frappe dans la recherche est déjà affichée (builder.js › input). */
function bdFiltChanged() {
  const sig = bdFSig(); if (sig === BD.fsig) return; BD.fsig = sig;
  BD.q = BD.f.q || ''; BD.shown = BD_PAGE; bdPlcPaint(); bdList();
}
/** Monte la barre de filtres de la collection dans root (onglet « Ajouter ») ; son champ garde l'identifiant #bdQ. */
function bdFiltMount(root) {
  const ext = typeof srchExt === 'function' ? { ...srchExt(), id: 'bdMore' } : null;
  BD.fb = mountFilters(root, BD.f, bdFiltChanged, { placeholder: cnPh(), commander: BD.fmt === 'commander', sets: bdSetList,
    setsSub: n => TN(n, '{n} extension dans ta collection', '{n} extensions dans ta collection'), ...(ext ? { ext } : {}) });
  const inp = $('input', root); if (inp) inp.id = 'bdQ';
  BD.fsig = bdFSig();
}
/** Cartes de la collection qui passent les filtres de BD.f (recherche à part : words, sur les noms affichés, comme avant) ; dans l'ordre de l'index de l'éditeur. */
function bdOwn(words) {
  if (!collCount()) return [];
  const f = { ...BD.f, q: '' }; let keys = null;
  if (filterActive(f)) { const v = collAll(); if (typeof srchPrep === 'function') srchPrep(v, f); keys = new Set(filterItems(v.all, f).map(it => it.k)); }
  let own = bdIndex().filter(it => (!keys || keys.has(it.k)) && words.every(w => it.s.includes(w)));
  if (BD.tgt === 'cmdr') own = own.filter(it => canCommand(COLL.meta[it.k]) === 1);
  return own;
}
/** Extensions des cartes proposées (bouton « Extension » des filtres) : [[code, nom, cartes]], « Sans édition » en tête. */
function bdSetList() {
  const v = collAll(), f = { ...BD.f, set: '' }, p = BD.f.place, by = new Map(); let none = 0;
  if (typeof srchPrep === 'function') srchPrep(v, f);
  for (const it of filterItems(v.all, f)) {
    const ls = p ? collLines(COLL.map[it.k]).filter(([g]) => (p === '-' ? !plcOf(g) : plcOf(g) === p)) : null;
    for (const e of ls ? new Set(ls.map(([g]) => edSet(lineEd(g)))) : it.eds) { if (e) by.set(e, (by.get(e) || 0) + 1); else none++; }
  }
  const l = [...by].map(([c, k]) => [c, setName(c), k]).sort((a, b) => setDate(b[0]).localeCompare(setDate(a[0])) || (a[1] || a[0]).localeCompare(b[1] || b[0]));
  return none ? [['-', '', none], ...l] : l;
}
/** Exemplaires de la carte k que les filtres d'exemplaire désignent (rangement, extension, langue, finition, rareté, prix, style) ; sans eux : tous. */
function bdLineQty(k) {
  const f = BD.f, x = COLL.map[k]; if (!x) return 0;
  if (!(fltLineOn(f) || f.place || f.set) || typeof srchLine !== 'function') return x.q;
  let n = 0; for (const [g, q] of collLines(x)) if (fltLineOk(srchLine(k, g), f)) n += q;
  return n;
}
/** Bloc « N cartes listées · Ajouter les N cartes listées » (filtre ou recherche en cours, cible Deck ou Réserve). */
function bdBulkHtml(own, any) {
  if (!any || !own.length || BD.tgt === 'cmdr' || BD.sel) return '';
  const n = own.length, cmd = BD.fmt === 'commander';
  const how = cmd ? (BD.cmdr.length ? T('Un exemplaire de chaque ; celles déjà dans le deck ou hors des couleurs du commandant sont écartées.') : T('Choisis d\'abord ton commandant : les cartes hors de ses couleurs seront écartées.'))
    : BD.tgt === 'side' ? T('Les exemplaires que tu as, 4 au plus, dans la réserve (15 cartes au plus).') : T('Les exemplaires que tu as, 4 au plus (terrains de base : tous).');
  return `<div class="bd-bulk"><div class="bd-bulk-t"><b>${esc(TN(n, '{n} carte listée', '{n} cartes listées', { n: nf0(n) }))}</b><small>${esc(how)}</small></div>
    <button class="btn block" type="button" data-act="bulk"><svg class="i" aria-hidden="true"><use href="#i-plus"/></svg><span>${esc(TN(n, 'Ajouter la carte listée', 'Ajouter les {n} cartes listées', { n: nf0(n) }))}</span></button></div>`;
}

/* ── Ajout groupé ─────────────────────────────────────────────────────────────────────────────── */
/** Identité de couleur du commandant (Set), null sans commandant ou tant que ses couleurs ne sont pas lues. */
function bdCmdrCi() {
  if (!BD.cmdr.length) return null;
  const s = new Set();
  for (const c of BD.cmdr) { const m = bdMeta(c.key); if (!m || typeof m.ci !== 'string') return null; for (const x of m.ci) s.add(x); }
  return s;
}
/** Ce qu'un ajout groupé ferait : list [{ k, name }], qOf(k) : exemplaires possédés à prendre (Standard).
 *  → { tgt, add: [{ k, name, q }], n (exemplaires), have, ci, basic, full (refusées : réserve pleine), ill: [noms pas légaux], res: [{ name, deck }], noCmd, ciUnknown } */
function bdBulkPlan(list, qOf) {
  const cmd = BD.fmt === 'commander', tgt = !cmd && BD.tgt === 'side' ? 'side' : 'main', ci = bdCmdrCi();
  const P = { tgt, add: [], n: 0, have: 0, ci: 0, basic: 0, full: 0, ill: [], res: [], noCmd: cmd && !BD.cmdr.length, ciUnknown: cmd && BD.cmdr.length > 0 && !ci };
  let room = tgt === 'side' ? Math.max(0, DK_FORMATS[BD.fmt].side - bdSideN()) : Infinity;
  const seen = new Set();
  for (const { k, name } of list) {
    if (seen.has(k)) continue; seen.add(k);
    if (cmd && BASIC_NAMES.has(k)) { P.basic++; continue; }
    if (BD.cmdr.some(c => c.key === k)) { P.have++; continue; }
    let q;
    if (cmd) {
      if (bdTot(k) > 0) { P.have++; continue; }
      const m = bdMeta(k); if (ci && m && typeof m.ci === 'string' && [...m.ci].some(x => !ci.has(x))) { P.ci++; continue; }
      q = 1;
    } else {
      q = Math.min(Math.max(1, qOf(k)), dkMaxCopies(BD.fmt, k)) - bdTot(k);
      if (q <= 0) { P.have++; continue; }
    }
    if (q > room) { P.full += q - room; q = room; }
    if (q <= 0) continue;
    room -= q;
    const nm = bdLabel(k, name);
    if (bdIllegal(k)) P.ill.push(nm);
    const o = BASIC_NAMES.has(k) ? null : ownFor(k, BD.id);      // règle unique (extras.js › ownFor) : au-delà des exemplaires libres, à acheter (pastille de l'éditeur, coach)
    if (o && o.decks.length && bdTot(k) + q > o.free) P.res.push({ name: nm, deck: o.decks[0].n || T('un autre deck') });
    P.add.push({ k, name, q }); P.n += q;
  }
  return P;
}
/** Cartes laissées de côté, en morceaux de message. */
function bdBulkParts(P) {
  return [P.have ? TN(P.have, '{n} déjà dans le deck', '{n} déjà dans le deck') : '', P.ci ? TN(P.ci, '{n} hors de l\'identité de couleur', '{n} hors de l\'identité de couleur') : '',
    P.basic ? TN(P.basic, '{n} terrain de base laissé', '{n} terrains de base laissés') : '', P.full ? TN(P.full, '{n} refusée (réserve pleine)', '{n} refusées (réserve pleine)') : '',
    P.ill.length ? TN(P.ill.length, '{n} pas légale en Commander', '{n} pas légales en Commander') : ''].filter(Boolean);
}
/** Exemplaires réservés par un autre deck monté : le message de l'ajout à l'unité (une carte), sinon leur nombre (list : leurs noms et decks). */
function bdResMsg(res, list) {
  if (res.length === 1) return T('{name} : ton exemplaire est dans « {deck} ». À y reprendre quand tu joueras ce deck, ou à acheter.', { name: res[0].name, deck: res[0].deck });
  return list ? TN(res.length, '{n} carte est dans un autre deck monté ({list}) : à y reprendre quand tu joueras ce deck, ou à acheter.', '{n} cartes sont dans d\'autres decks montés ({list}) : à y reprendre quand tu joueras ces decks, ou à acheter.', { list: res.map(r => `${r.name} (« ${r.deck} »)`).join(', ') })
    : TN(res.length, '{n} carte est dans un autre deck monté : à y reprendre quand tu joueras ce deck, ou à acheter.', '{n} cartes sont dans d\'autres decks montés : à y reprendre quand tu joueras ces decks, ou à acheter.');
}
/** Lance un ajout groupé : rien à ajouter → message ; plus de 10 exemplaires → feuille de confirmation ; sinon tout de suite. */
function bdBulkGo(P) {
  if (!P.n) { toast([T('Aucune carte à ajouter'), ...bdBulkParts(P)].join(' · ')); haptic('warn'); return; }
  if (P.n > BD_BULK_ASK) bdBulkSheet(P, () => bdBulkRun(P, true)); else bdBulkRun(P);
}
function bdBulkSheet(P, done) {
  openSheet(TN(P.n, 'Ajouter {n} carte au deck', 'Ajouter {n} cartes au deck'), BD.name.trim() || T('Nouveau deck'), api => {
    api.wrap.classList.add('bd-bk-sheet');
    const row = (dt, dd) => `<div><dt>${esc(dt)}</dt><dd>${esc(dd)}</dd></div>`, ck = bdCheck(), over = P.tgt === 'main' ? ck.n + P.n - ck.size : 0;
    api.body.innerHTML = `<dl class="rc-facts">${row(T('Zone'), P.tgt === 'side' ? T('Réserve') : T('Deck'))}${row(T('Cartes différentes'), nf0(P.add.length))}${BD.fmt !== 'commander' ? row(T('Exemplaires'), nf0(P.n)) : ''}
        ${P.have ? row(T('Déjà dans le deck : ignorées'), nf0(P.have)) : ''}${P.ci ? row(T('Hors de l\'identité de couleur : écartées'), nf0(P.ci)) : ''}${P.basic ? row(T('Terrains de base : laissés'), nf0(P.basic)) : ''}${P.full ? row(T('Réserve pleine : refusées'), nf0(P.full)) : ''}</dl>
      ${P.ill.length ? `<p class="bd-bk-note bad">${esc(TN(P.ill.length, 'Pas légale en Commander, ajoutée quand même : {list}', 'Pas légales en Commander, ajoutées quand même : {list}', { list: P.ill.join(', ') }))}</p>` : ''}
      ${P.res.length ? `<p class="bd-bk-note">${esc(bdResMsg(P.res, true))}</p>` : ''}
      ${P.noCmd ? `<p class="hint">${T('Pas encore de commandant : l\'identité de couleur n\'est pas vérifiée.')}</p>` : P.ciUnknown ? `<p class="hint">${T('Couleurs du commandant pas encore lues : identité de couleur non vérifiée.')}</p>` : ''}
      ${BD.fmt === 'commander' && over > 0 ? `<p class="hint">${esc(TN(over, 'Le deck dépassera {size} cartes : {n} en trop.', 'Le deck dépassera {size} cartes : {n} en trop.', { size: ck.size }))}</p>` : ''}
      <p class="hint">${T('« Annuler » dans le message qui suit remet le deck d\'avant.')}</p>`;
    api.setFoot(`<button class="btn ghost" type="button" data-close>${T('Retour')}</button><button class="btn" type="button" data-ok>${esc(TN(P.n, 'Ajouter {n} carte au deck', 'Ajouter {n} cartes au deck'))}</button>`);
    api.foot.addEventListener('click', e => { if (!e.target.closest('[data-ok]')) return; api.close(); done(); });
  });
}
/** Ajout (asked : après la feuille, qui a tout détaillé : le message reste court). */
function bdBulkRun(P, asked) {
  const el = BD.el; if (!el) return;
  const before = { main: new Map([...BD.main].map(([k, c]) => [k, { ...c }])), side: new Map([...BD.side].map(([k, c]) => [k, { ...c }])), cmdr: BD.cmdr.map(c => ({ ...c })), dirty: BD.dirty };
  let ok = 0, no = 0;
  for (const x of P.add) for (let i = 0; i < x.q; i++) { if (bdChange(P.tgt, x.k, x.name, 1, true) === true) ok++; else no++; }
  BD.sel = null; bdSelPaint();
  bdPaint(); bdMetaSoon(); haptic('ok');
  const left = P.have + P.ci + P.basic + P.full + no;
  const msg = (asked ? [TN(ok, '{n} carte ajoutée', '{n} cartes ajoutées'), left ? TN(left, '{n} laissée de côté', '{n} laissées de côté') : '']
    : [TN(ok, '{n} carte ajoutée', '{n} cartes ajoutées'), ...bdBulkParts(P), no ? TN(no, '{n} refusée (règles du format)', '{n} refusées (règles du format)') : '', P.res.length ? bdResMsg(P.res) : '']).filter(Boolean).join(' · ');
  toast(msg, { label: T('Annuler'), fn: () => { if (BD.el !== el) return; Object.assign(BD, before); bdPaint(); haptic('tap'); } });      // éditeur fermé (ou un autre deck ouvert) entre-temps : rien
}
/** « Ajouter les N cartes listées » : toutes les cartes de la collection qui passent les filtres (exemplaires : ceux des filtres d'exemplaire). */
function bdBulkListed() {
  const own = bdOwn(normPart(BD.q.trim()).split(' ').filter(Boolean));
  bdBulkGo(bdBulkPlan(own.map(it => ({ k: it.k, name: it.n })), bdLineQty));
}

/* ── Sélection par appui long ─────────────────────────────────────────────────────────────────── */
const BD_LP_KEY = 'deckdeal:bd-lp';
/** Appui long déjà utilisé sur cet appareil : l'astuce « Appui long sur une carte… » n'est plus montrée. */
const bdLpKnown = () => { try { return localStorage.getItem(BD_LP_KEY) === '1'; } catch (e) { return false; } };
function bdSelStart(k, n) {
  if (!BD.el) return; BD.sel = new Map([[k, n]]); haptic('ok');
  try { localStorage.setItem(BD_LP_KEY, '1'); } catch (e) { /* stockage refusé : l'astuce reste */ }
  bdList(); bdSelPaint();
}
function bdSelToggle(k, n) {
  if (!BD.sel) return;
  if (BD.sel.has(k)) BD.sel.delete(k); else BD.sel.set(k, n);
  haptic('tap'); if (!BD.sel.size) { bdSelEnd(); return; }
  bdList(); bdSelPaint();
}
function bdSelEnd() { if (!BD.sel) return; BD.sel = null; if (BD.el) { bdList(); bdSelPaint(); } }
/** Barre du bas du mode sélection (« N sélectionnées », Annuler, Ajouter N cartes). */
function bdSelPaint() {
  const el = BD.el; if (!el) return;
  const bar = $('#bdSelBar', el), n = BD.sel ? BD.sel.size : 0;
  el.classList.toggle('selecting', !!BD.sel); if (!bar) return;
  if (!BD.sel) { bar.hidden = true; bar.innerHTML = ''; return; }
  bar.hidden = false;
  bar.innerHTML = `<span class="bd-sel-n" role="status">${esc(TN(n, '{n} sélectionnée', '{n} sélectionnées', { n: nf0(n) }))}</span><button class="btn ghost" type="button" data-act="sel-cancel">${T('Annuler')}</button><button class="btn" type="button" data-act="sel-add">${esc(TN(n, 'Ajouter {n} carte', 'Ajouter {n} cartes', { n: nf0(n) }))}</button>`;
}
function bdSelAdd() { if (BD.sel && BD.sel.size) bdBulkGo(bdBulkPlan([...BD.sel].map(([k, name]) => ({ k, name })), collQty)); }
/** Ligne de l'onglet « Ajouter » en mode sélection : case à cocher, l'appui la coche (vignette comprise : pas d'agrandissement dans ce mode). */
function bdPickRow(k, name, nm, img, hue, letter, tags) {
  const on = BD.sel.has(k), inDeck = bdTot(k) > 0 || BD.cmdr.some(c => c.key === k);
  return `<div class="crow bd-row bd-pick${on ? ' on' : ''}" data-k="${esc(k)}" data-n="${esc(name)}" data-t="${BD.tgt}" role="checkbox" aria-checked="${on}" tabindex="0"><span class="bd-ck" aria-hidden="true"><svg class="i"><use href="#i-check"/></svg></span><span class="thumb" style="--h:${hue}">${letter}${img ? `<img alt="" loading="lazy" decoding="async" src="${esc(img)}">` : ''}</span>
    <span class="row-main"><span class="row-top"><span class="row-name">${esc(nm)}</span></span><span class="row-meta">${inDeck ? `<span class="tag accent">${T('Dans le deck')}</span>` : ''}${tags}</span></span></div>`;
}
/** Le clic qui suit un appui long (souris, certains navigateurs) ne doit ni cocher ni agrandir la vignette : avalé (en capture sur window, avant zoom.js) ; oublié au prochain appui. */
function bdEatClick() {
  const eat = e => { e.stopPropagation(); e.preventDefault(); off(); };
  const off = () => { window.removeEventListener('click', eat, true); window.removeEventListener('pointerdown', off, true); };
  window.addEventListener('click', eat, true);
  setTimeout(() => window.addEventListener('pointerdown', off, true), 0);
}
/** Appui long sur une ligne de l'onglet « Ajouter » (cible Deck ou Réserve) : mode sélection. Un glissement de plus de 10 px (défilement), un appui sur − / + ou
 *  un défilement annulent ; clic droit (ordinateur) : même chose. Le menu du navigateur (image) ne s'ouvre pas sur ces lignes. */
function bdLpBind(wrap) {
  let t = 0, sx = 0, sy = 0;
  const stop = () => { clearTimeout(t); t = 0; };
  const can = e => BD.el === wrap && BD.tab === 'coll' && BD.tgt !== 'cmdr' && e.target.closest && e.target.closest('#bdList .bd-row') && !e.target.closest('.qstep');
  wrap.addEventListener('pointerdown', e => {
    stop(); if (BD.sel || (e.pointerType === 'mouse' && e.button !== 0) || !can(e)) return;
    const row = e.target.closest('.bd-row'); sx = e.clientX; sy = e.clientY;
    t = setTimeout(() => { t = 0; if (!row.isConnected || BD.sel) return; bdEatClick(); bdSelStart(row.dataset.k, row.dataset.n); }, BD_LP_MS);
  });
  wrap.addEventListener('pointermove', e => { if (t && Math.hypot(e.clientX - sx, e.clientY - sy) > 10) stop(); });
  for (const ev of ['pointerup', 'pointercancel']) wrap.addEventListener(ev, stop);
  wrap.addEventListener('scroll', stop, true);
  wrap.addEventListener('contextmenu', e => {
    if (!can(e)) return; e.preventDefault(); stop();
    if (!BD.sel) { const row = e.target.closest('.bd-row'); bdSelStart(row.dataset.k, row.dataset.n); }
  });
  wrap.addEventListener('keydown', e => {
    if (!BD.sel || (e.key !== 'Enter' && e.key !== ' ') || !e.target.matches || !e.target.matches('.bd-pick')) return;
    e.preventDefault(); bdSelToggle(e.target.dataset.k, e.target.dataset.n);
  });
}
