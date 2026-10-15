/* ── scaned.js : édition des cartes scannées, posée d'office le plus souvent possible ─────────────────────────────────────────────
   Extensions du scan (SC.sets) : celles choisies à la main et celles des cartes d'une seule extension (plus celle proposée par le lot, scan ouvert depuis le lot).
   Chaque carte reconnue : ses impressions dans sa langue (Scryfall, gardées 2 jours, lues une fois par scan), puis son édition, dans cet ordre :
   1. une seule extension (promos à part) : celle-là, et elle rejoint les extensions du scan ;
   2. une extension du scan où la carte existe : celle qui a le plus d'exemplaires dans le scan (à égalité, la dernière choisie) ;
   3. la même carte déjà scannée avec une édition : la même ;
   4. sinon « à choisir » : la première carte d'un scan l'est toujours (sauf extension unique), puis chaque carte qui n'existe dans aucune extension du scan.
   La carte à choisir est demandée tout de suite dans la liste (bandeau « Édition de la 1re carte » / « Nouvelle extension » : ses éditions, de la plus récente à la plus
   ancienne) ; « Plus tard » passe à la suivante. Choisie (bandeau ou symbole de la ligne) : son extension rejoint celles du scan et les cartes à choisir sont revues.
   Une ligne du scan = carte + langue + édition : un exemplaire d'une autre édition fait sa propre ligne.
   « Ajouter » avec des cartes sans édition : confirmation (choisir, ou ajouter quand même). Scan mobile : l'édition part avec la carte, ses changements aussi.
   Ligne : e ('set|num', '' : sans), es (load : impressions en lecture · pend : à choisir · auto : posée d'office · solo : extension unique · man : choisie · none : aucune impression · err : illisible),
   pk (impression retenue : image, prix), nx (« Sans édition » choisi à la main : plus jamais posée d'office), later (« Plus tard » : plus demandée dans le bandeau).
   Réglage du scan (scanset.js › SCS.ed) : 'scan' ci-dessus ; 'card' (deck, classeur) : extension unique et même carte seulement, rien de demandé pendant le scan, les éditions se
   choisissent à la fin (écran « Éditions à choisir ») ; 'none' : aucune édition (es 'off'), aucune impression lue. */
const scanPk = (k, l) => k + '|' + (l || 'en');
/** Prix d'un exemplaire d'une impression (centimes), sinon null. */
const pkEu = p => (p ? (p.eu > 0 ? p.eu : p.ef > 0 ? p.ef : null) : null);
/** Exemplaires du scan (sûrs) par extension posée. */
function scanSetCounts() {
  const by = new Map();
  for (const x of SC.items.values()) { if (x.maybe || !x.e) continue; const s = edSet(x.e); by.set(s, (by.get(s) || 0) + x.q); }
  return by;
}
/** Extensions du scan, la plus fournie d'abord (à égalité, la dernière choisie). */
function scanSetsRanked() {
  const by = scanSetCounts();
  return [...SC.sets.keys()].sort((a, b) => (by.get(b) || 0) - (by.get(a) || 0) || SC.sets.get(b) - SC.sets.get(a));
}
/** Édition d'une carte du scan d'après ses impressions (voir l'ordre en tête) : { e, es, pk, solo }. */
function scanEdDecide(it, prints) {
  if (SCS.ed === 'none') return { e: '', es: 'off', pk: null };
  if (prints === undefined) return { e: '', es: 'load', pk: null };
  if (prints === 'err') return { e: '', es: 'err', pk: null };
  if (!prints.length) return { e: '', es: 'none', pk: null };
  if (it.nx) return { e: '', es: 'pend', pk: null };
  const l = it.l || 'en', sl = SCRY_LANG[l] || 'en', main = prints.filter(p => !p.fx.includes('promo')), own = main.filter(p => p.l === sl), base = own.length ? own : main.length ? main : prints;
  const take = (set, es) => { const p = lotInSet(prints, set, l); return p ? { e: edKey(p.set, p.num), es, pk: p } : null; };
  const sets = new Set(base.map(p => p.set)), has = s => prints.some(p => p.set === s);
  if (sets.size === 1) { const d = take([...sets][0], 'solo'); if (d && d.e) return { ...d, solo: true }; }
  if (SCS.ed !== 'card') for (const s of scanSetsRanked()) if (has(s)) { const d = take(s, 'auto'); if (d && d.e) return d; }      // carte par carte : seulement l'extension unique et la même carte
  for (const x of SC.items.values()) {
    if (x === it || x.key !== it.key || !x.e) continue;
    const p = prints.find(y => edKey(y.set, y.num) === x.e); if (p) return { e: x.e, es: 'auto', pk: p };
  }
  return { e: '', es: 'pend', pk: null };
}
/** Une extension rejoint celles du scan (choisie à la main, ou carte d'une seule extension) ; depuis le lot, elle devient aussi celle proposée par le lot. */
function scanStick(set) {
  if (!set) return;
  SC.sets.set(set, ++SC.setN); SC.stick = set;
  if (SC.lot && LOT.el && LOT.set !== set) { LOT.set = set; lotSave(); lotPaintHead(); }
}
/** Change l'identifiant d'une ligne (langue ou édition changée) sans la déplacer ; si une ligne identique existe, les exemplaires s'y ajoutent. Retourne la ligne gardée. */
function scanRekey(it, nid) {
  if (nid === it.id) return it;
  const other = SC.items.get(nid);
  if (other) {
    other.q = Math.min(999, other.q + it.q); if (!it.maybe) { other.maybe = false; other.shot = ''; }
    if (it.es === 'man') other.es = 'man';
    SC.items.delete(it.id); return other;
  }
  const old = it.id; it.id = nid; SC.items = new Map([...SC.items].map(([i, v]) => (i === old ? [nid, v] : [i, v])));
  return it;
}
/** Pose une décision sur une ligne. */
function scanEdApply(it, d) {
  it.e = d.e || ''; it.es = d.es; it.pk = d.pk || null;
  if (d.solo && d.e) scanStick(edSet(d.e));
  if (it.e && !SETIC.m) setIcLoad(() => { if (SC.el) scanPaintList(); });      // symboles des extensions : à la première édition posée
  return scanRekey(it, scanId(it.key, it.l, it.e));
}
/** Revoit les cartes « à choisir » (après une édition posée : extension collante, majorité du scan) jusqu'à ce que plus rien ne bouge. */
function scanEdPass() {
  for (let n = 0; n < 8; n++) {
    let moved = false;
    for (const it of [...SC.items.values()]) {
      if (it.es !== 'pend' || it.nx || !SC.items.has(it.id)) continue;
      const pr = SC.pr.get(scanPk(it.key, it.l)); if (!Array.isArray(pr)) continue;
      const d = scanEdDecide(it, pr); if (d.e) { scanEdApply(it, d); moved = true; }
    }
    if (!moved) break;
  }
}
/** Impressions lues pour une carte (clé + langue) : ses lignes en attente reçoivent leur édition ; celles qui en ont une prennent l'image de cette langue. */
function scanEdLoaded(pk) {
  const pr = SC.pr.get(pk);
  for (const it of [...SC.items.values()]) {
    if (scanPk(it.key, it.l) !== pk || !SC.items.has(it.id)) continue;
    if (it.e) { const p = Array.isArray(pr) && pr.find(y => edKey(y.set, y.num) === it.e); if (p) it.pk = p; continue; }
    if (it.es === 'load' || it.es === 'err' || it.es === 'pend') scanEdApply(it, scanEdDecide(it, pr));
  }
  scanEdPass();
}
/** Lit (une fois par scan) les impressions d'une ligne ; déjà lues : appliquées tout de suite. */
function scanEdNeed(it) {
  const pk = scanPk(it.key, it.l);
  if (SC.pr.has(pk)) { scanEdLoaded(pk); return; }
  if (SC.prq.has(pk)) return;
  const sess = SC.session, name = it.name, l = it.l || 'en';
  const first = FRC.p && FRC.state === 'run' ? FRC.p.catch(() => {}) : Promise.resolve();      // catalogue des noms en téléchargement chez Scryfall : il passe d'abord (la lecture des noms en dépend)
  SC.prq.set(pk, first.then(() => scryArtPrints(name, l, undefined, false)).then(list => list || [], () => 'err').then(r => {
    if (SC.session !== sess) return;
    SC.prq.delete(pk); SC.pr.set(pk, r); scanEdLoaded(pk); scanPaintList();
  }));
}
/** Décision pour un exemplaire qui arrive (scanAdd) : tout de suite si les impressions de la carte sont déjà lues, sinon « en lecture ». */
function scanEdNew(key, name, l, maybe) {
  const pr = SC.pr.get(scanPk(key, l)), d = scanEdDecide({ key, name, l, maybe, q: 1 }, pr);
  if (d.solo && d.e) scanStick(edSet(d.e));
  if (d.e && !SETIC.m) setIcLoad(() => { if (SC.el) scanPaintList(); });
  return d;
}
/** Extensions du scan, la plus fournie d'abord (montrées en tête de la feuille). */
const scanEdFront = () => scanSetsRanked();
/** Carte dont l'édition est demandée dans le bandeau de la liste : la plus ancienne à choisir (ni « Plus tard », ni « Sans édition »), impressions lues, plusieurs éditions. */
function scanEdAsk() {
  if (SCS.ed !== 'scan') return null;      // carte par carte : à la fin ; sans édition : jamais
  for (const x of SC.items.values()) {
    if (x.maybe || x.e || x.nx || x.later || x.es !== 'pend') continue;
    const pr = SC.pr.get(scanPk(x.key, x.l)); if (Array.isArray(pr) && pr.length > 1) return { it: x, prints: pr };
  }
  return null;
}
/** Bandeau de la liste : les éditions de la carte à choisir, de la plus récente à la plus ancienne (illustration, symbole, année, prix) ; « Toutes » ouvre la feuille. */
function scanEdAskHtml(a) {
  const it = a.it, nm = scanShown(it), first = !SC.sets.size, MAX = 12, list = a.prints.slice(0, MAX);
  const tile = (p, i) => {
    const px = pkEu(p), ic = setIcHtml(p.set);
    return `<button type="button" class="sc-ask-t" role="radio" aria-checked="false" data-a="edp" data-i="${i}" aria-label="${esc([p.sn, edLabel(edKey(p.set, p.num)), p.y, px ? fmt(px, 'EUR') : ''].filter(Boolean).join(' · '))}"><img alt="" loading="lazy" decoding="async" src="${esc(p.th)}"><span class="sc-ask-c">${ic}<b>${esc(p.set.toUpperCase())}</b></span><small>${esc(p.y || '')}</small><em>${px ? esc(fmt(px, 'EUR')) : '—'}</em></button>`;
  };
  return `<section class="sc-ask" data-id="${esc(it.id)}" aria-label="${esc(first ? T('Édition de la 1re carte') : T('Nouvelle extension'))}">
    <div class="sc-ask-h"><b>${first ? T('Édition de la 1re carte') : T('Nouvelle extension')}</b><button type="button" class="link-btn" data-a="later">${T('Plus tard')}</button></div>
    <p class="sc-ask-p">${esc(first ? T('{name} : les cartes suivantes prendront la même extension si elles y existent.', { name: nm }) : T('{name} n\'existe dans aucune extension de ce scan.', { name: nm }))}</p>
    ${a.prints.length >= ED_Q_MIN ? `<button type="button" class="fsearch sc-ask-q" data-a="edq"><svg class="i" aria-hidden="true"><use href="#i-search"/></svg><span>${T('Chercher une extension')}</span></button>` : ''}
    <div class="sc-ask-l" role="radiogroup" aria-label="${esc(T('Édition de {name}', { name: nm }))}">${list.map(tile).join('')}<button type="button" class="sc-ask-all" data-a="ed">${esc(T('Toutes ({n})', { n: a.prints.length }))}</button></div></section>`;
}
/** « Plus tard » : la carte reste à choisir, le bandeau passe à la suivante. */
function scanEdLater(it) { it.later = true; scanPaintList(); }
/** Symbole de l'édition d'une ligne du scan (à gauche de la quantité) : symbole seul ; « à choisir » : rond orangé ; en lecture : rond qui tourne. */
function scanEdBtn(it) {
  if (it.es === 'off' && !it.e) return '<span class="sc-ed-off" aria-hidden="true"></span>';      // réglage « Sans édition »
  const e = it.e || '', set = edSet(e), sn = e ? (it.pk && it.pk.sn) || setName(set) || '' : '', auto = e && (it.es === 'auto' || it.es === 'solo'), nm = scanShown(it);
  const lab = e ? T('Édition : {ed}', { ed: [sn, edLabel(e)].filter(Boolean).join(' · ') }) + (auto ? ' · ' + T('posée d\'office') : '')
    : it.es === 'load' ? T('Lecture des éditions…') : it.es === 'none' ? T('Aucune édition trouvée') : it.es === 'err' ? T('Éditions indisponibles : toucher pour réessayer') : T('Choisir l\'édition de {name}', { name: nm });
  const cls = e ? ' on' + (auto ? ' auto' : '') : it.es === 'load' ? ' load' : it.nx || it.es === 'none' ? '' : ' todo';
  return `<button type="button" class="row-ed sc-ed${cls}" data-a="ed" aria-label="${esc(lab)}" title="${esc(lab)}">${e ? setIcHtml(set) || `<span class="ed-code">${esc(set.toUpperCase())}</span>` : ''}</button>`;
}
/** Ligne dont l'édition reste à choisir (montrée en tête de la liste). */
const scanEdIsTodo = x => !x.maybe && !x.e && !x.nx && (x.es === 'pend' || x.es === 'err');
/** Exemplaires sans édition (« à choisir », en lecture, illisibles) : ce que « Ajouter » fait confirmer. « Sans édition » choisi à la main n'en fait pas partie. */
function scanEdTodo() {
  let n = 0, load = 0; const lines = [];
  for (const x of SC.items.values()) { if (x.maybe || x.e || x.nx || x.es === 'none' || x.es === 'off') continue; n += x.q; if (x.es === 'load') load += x.q; lines.push(x); }
  return { n, load, lines };
}
/** Choix de l'édition d'une ligne (symbole touché). */
function scanEdPick(it, focusQ) {
  const pk = scanPk(it.key, it.l), pr = SC.pr.get(pk);
  if (pr === 'err') { SC.pr.delete(pk); it.es = 'load'; scanEdNeed(it); scanPaintList(); }      // illisible : on relit
  haptic('tap');
  edSheet({ name: scanShown(it), sub: TN(it.q, '{n} exemplaire', '{n} exemplaires') + (it.l && it.l !== 'en' ? ' · ' + langCode(it.l) : ''), cur: it.e,
    load: () => (Array.isArray(pr) ? Promise.resolve(pr) : scryArtPrints(it.name, it.l || 'en')), front: scanEdFront(), frontLabel: T('Dans ce scan'), focusQ: !!focusQ,
    onPick: p => scanEdChoose(it.id, p) });
}
function scanEdChoose(id, p) {
  const it = SC.items.get(id); if (!it) return;
  it.later = false;
  if (p) { it.nx = false; scanStick(p.set); scanEdApply(it, { e: edKey(p.set, p.num), es: 'man', pk: p }); }
  else { it.nx = true; scanEdApply(it, { e: '', es: 'pend', pk: null }); }
  scanEdPass(); scanPaintList();
}
/** Choisir les éditions restantes (récap, scan mobile) : l'écran « Éditions à choisir », carte par carte. */
function scanEdFocus(done) { scanEdFlow(done || (() => { if (SC.el && !SC.remote && scanTotals().n) scanRecap(); })); }
/** Réglage des éditions changé pendant un scan : « Sans édition » retire les décisions en attente ; sinon les cartes sans édition sont relues et décidées. */
function scanEdMode() {
  for (const it of [...SC.items.values()]) {
    if (!SC.items.has(it.id) || it.e) continue;
    if (SCS.ed === 'none') { if (it.es !== 'off') { it.es = 'off'; it.later = false; } }
    else if (it.es === 'off') { it.es = 'load'; scanEdNeed(it); }
    else if (it.es === 'pend' && !it.nx) { const pr = SC.pr.get(scanPk(it.key, it.l)); if (Array.isArray(pr)) scanEdApply(it, scanEdDecide(it, pr)); }
  }
  scanEdPass();
}
/* ── Écran « Éditions à choisir » : les cartes sans édition une par une, toutes leurs impressions en illustrations (regarde ta carte, touche la même) ── */
function scanEdFlow(done) {
  for (const x of SC.items.values()) x.later = false;
  const ids = scanEdTodo().lines.map(x => x.id);
  if (!ids.length || !SC.el) { if (done) done(); return; }
  let i = 0, closed = false, hold = false, q = '', qi = -1;      // q : recherche d'extension de la carte qi (repart de zéro à chaque carte)      // hold : choix en cours (la liste repeinte ne doit pas faire avancer l'écran)
  const wrap = document.createElement('div'); wrap.className = 'dv sc-ef'; wrap.setAttribute('role', 'dialog'); wrap.setAttribute('aria-modal', 'true'); wrap.setAttribute('aria-label', T('Éditions à choisir'));
  const still = id => { const x = SC.items.get(id); return x && !x.e && !x.nx && !x.maybe; };
  const finish = () => {
    if (closed) return; closed = true; if (SC.ef === paint) SC.ef = null;
    wrap.classList.remove('on'); setTimeout(() => wrap.remove(), reduceMotion() ? 0 : 240);
    if (done) done();
  };
  const go = d => { let j = i + d; while (j >= 0 && j < ids.length && d > 0 && !still(ids[j])) j += d; if (j >= ids.length) { finish(); return; } i = Math.max(0, j); paint(); };
  function paint() {
    if (closed || hold) return;
    const it = SC.items.get(ids[i]); if (!it) { go(1); return; }
    const pk = scanPk(it.key, it.l), pr = SC.pr.get(pk); if (pr === undefined || pr === 'err') { if (pr === 'err') SC.pr.delete(pk); it.es = 'load'; scanEdNeed(it); }
    const nm = scanShown(it), n = ids.length, prints = Array.isArray(pr) ? pr : null, keep = edQKeep(wrap);
    if (qi !== i) { qi = i; q = ''; } else q = keep.q;
    const tile = (p, j) => { const px = pkEu(p), on = it.e === edKey(p.set, p.num); return `<button type="button" class="sc-ef-t" role="radio" aria-checked="${on}" data-ef="pick" data-i="${j}" aria-label="${esc([p.sn, edLabel(edKey(p.set, p.num)), p.y, px ? fmt(px, 'EUR') : ''].filter(Boolean).join(' · '))}"><img alt="" loading="lazy" decoding="async" src="${esc(p.th)}"><span class="sc-ask-c">${setIcHtml(p.set)}<b>${esc(p.set.toUpperCase())}</b> <small>${esc(p.y || '')}</small></span><em>${px ? esc(fmt(px, 'EUR')) : '—'}</em></button>`; };
    wrap.innerHTML = `<header class="dv-head"><button class="icon-btn" type="button" data-ef="close" aria-label="${T('Retour au scan')}"><svg class="i"><use href="#i-back"/></svg></button>
        <button class="btn ghost small" type="button" data-ef="skipall">${T('Laisser les autres sans édition')}</button></header>
      <div class="sc-ef-top"><div class="sc-ef-tt"><h2>${T('Éditions à choisir')}</h2><span class="sc-ef-n">${esc(T('{i} sur {n}', { i: i + 1, n }))}</span></div>
        <div class="sc-ef-bar" aria-hidden="true"><i style="width:${Math.round(100 * (i + 1) / n)}%"></i></div></div>
      <div class="dv-scroll sc-ef-body"><div class="sc-ef-card"><b>${esc(nm)}</b>${it.l ? flag(it.l) : ''}${it.q > 1 ? `<span class="tag accent">× ${nf0(it.q)}</span>` : ''}</div>
        <p class="hint">${T('Regarde ta carte et touche la même illustration.')}</p>
        ${prints ? edQHtml(prints.length, q) : ''}
        ${prints ? (prints.length ? `<div class="sc-ef-grid" role="radiogroup" aria-label="${esc(T('Édition de {name}', { name: nm }))}">${prints.map(tile).join('')}</div>` : `<p class="hint">${T('Aucune édition trouvée')}</p>`) : `<p class="hint">${T('Lecture des éditions…')}</p>`}
        <button class="btn ghost block sc-ef-none" type="button" data-ef="none">${T('Sans édition')}</button></div>
      <footer class="dv-foot"><button class="btn ghost" type="button" data-ef="prev"${i ? '' : ' disabled'}>${T('Précédente')}</button><button class="btn" type="button" data-ef="next">${i + 1 < n ? T('Passer à la suivante') : T('Terminer')}</button></footer>`;
    const g = $('.sc-ef-grid', wrap); if (g && prints) edQApply(g, prints, q, '.sc-ef-t');
    keep.restore();
  }
  wrap.addEventListener('input', e => {
    if (!e.target.matches('[data-edq]')) return; q = e.target.value;
    const it = SC.items.get(ids[i]), pr = it && SC.pr.get(scanPk(it.key, it.l)), g = $('.sc-ef-grid', wrap);
    if (g && Array.isArray(pr)) edQApply(g, pr, q, '.sc-ef-t');
  });
  wrap.addEventListener('click', e => {
    const b = e.target.closest('[data-ef]'); if (!b) return;
    const a = b.dataset.ef, it = SC.items.get(ids[i]);
    if (a === 'close' || a === 'skipall') { haptic('tap'); finish(); return; }
    if (a === 'prev') { haptic('tap'); i = Math.max(0, i - 1); paint(); return; }
    if (a === 'next') { haptic('tap'); go(1); return; }
    if (!it) return;
    const choose = (p, e) => { hold = true; try { scanEdChoose(it.id, p); } finally { hold = false; } ids[i] = scanId(it.key, it.l, e); go(1); };
    if (a === 'none') { haptic('tap'); choose(null, ''); return; }
    if (a === 'pick') {
      const pr = SC.pr.get(scanPk(it.key, it.l)), p = Array.isArray(pr) ? pr[Number(b.dataset.i)] : null; if (!p) return;
      haptic('ok'); choose(p, edKey(p.set, p.num));
    }
  });
  wrap.__close = finish;
  SC.ef = paint; paint(); document.body.appendChild(wrap);
  requestAnimationFrame(() => requestAnimationFrame(() => wrap.classList.add('on')));
}
/** Scan mobile, « Terminer » : des cartes parties sans édition → les choisir maintenant (le PC suit) ou terminer. */
function scanEdDone(go) {
  const t = scanEdTodo(); if (!t.n) { go(); return; }
  openSheet(T('Éditions à choisir'), '', api => {
    api.body.innerHTML = `<p class="cf-msg">${esc(TN(t.n, '{n} carte est partie vers ton PC sans édition.', '{n} cartes sont parties vers ton PC sans édition.'))} ${esc(T('Tu peux choisir maintenant (le PC suit), ou plus tard dans ta collection.'))}</p>`;
    api.setFoot(`<button class="btn ghost" type="button" data-go>${T('Terminer quand même')}</button><button class="btn" type="button" data-pick>${T('Choisir les éditions')}</button>`);
    api.foot.addEventListener('click', e => {
      if (e.target.closest('[data-go]')) { api.close(); go(); }
      else if (e.target.closest('[data-pick]')) { api.close(); scanEdFocus(() => {}); }
    });
  });
}
