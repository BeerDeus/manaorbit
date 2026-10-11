/* ── scaned.js : édition des cartes scannées, posée d'office le plus souvent possible ─────────────────────────────────────────────
   Chaque carte reconnue : ses impressions dans sa langue (Scryfall, gardées 2 jours, lues une fois par scan), puis son édition, dans cet ordre :
   1. une seule extension (promos à part) : celle-là, et elle devient l'extension « collante » du scan (les cartes suivantes la suivent) ;
   2. l'extension collante (la dernière choisie à la main, ou la dernière extension unique) si la carte y existe ;
   3. les extensions qui font la majorité du scan (une ou deux) si la carte existe dans l'une d'elles ;
   4. la même carte déjà scannée avec une édition : la même ;
   5. sinon « à choisir » : la première carte d'un scan l'est toujours, sauf extension unique (ou extension proposée du lot, scan ouvert depuis le lot).
   Choisie à la main (symbole de la ligne) : elle devient collante et les cartes « à choisir » sont revues (celles qui existent dans une extension retenue la prennent).
   Une ligne du scan = carte + langue + édition : un exemplaire d'une autre édition fait sa propre ligne.
   « Ajouter » avec des cartes sans édition : confirmation (choisir, ou ajouter quand même). Scan mobile : l'édition part avec la carte, ses changements aussi.
   Ligne : e ('set|num', '' : sans), es (load : impressions en lecture · pend : à choisir · auto : posée d'office · solo : extension unique · man : choisie · none : aucune impression · err : illisible),
   pk (impression retenue : image, prix), nx (« Sans édition » choisi à la main : plus jamais posée d'office). */
const scanPk = (k, l) => k + '|' + (l || 'en');
/** Prix d'un exemplaire d'une impression (centimes), sinon null. */
const pkEu = p => (p ? (p.eu > 0 ? p.eu : p.ef > 0 ? p.ef : null) : null);
/** Extensions qui font la majorité des exemplaires du scan déjà posés (une ou deux) ; vide si le scan est trop dispersé. */
function scanEdMajor() {
  const by = new Map(); let tot = 0;
  for (const x of SC.items.values()) { if (x.maybe || !x.e) continue; const s = edSet(x.e); by.set(s, (by.get(s) || 0) + x.q); tot += x.q; }
  const top = [...by].sort((a, b) => b[1] - a[1]).slice(0, 2);
  if (!tot || top.reduce((a, x) => a + x[1], 0) * 2 < tot) return [];
  return top.filter(x => x[1] * 100 >= tot * 15).map(x => x[0]);
}
/** Édition d'une carte du scan d'après ses impressions (voir l'ordre en tête) : { e, es, pk, solo }. */
function scanEdDecide(it, prints) {
  if (prints === undefined) return { e: '', es: 'load', pk: null };
  if (prints === 'err') return { e: '', es: 'err', pk: null };
  if (!prints.length) return { e: '', es: 'none', pk: null };
  if (it.nx) return { e: '', es: 'pend', pk: null };
  const l = it.l || 'en', sl = SCRY_LANG[l] || 'en', main = prints.filter(p => !p.fx.includes('promo')), own = main.filter(p => p.l === sl), base = own.length ? own : main.length ? main : prints;
  const take = (set, es) => { const p = lotInSet(prints, set, l); return p ? { e: edKey(p.set, p.num), es, pk: p } : null; };
  const sets = new Set(base.map(p => p.set)), has = s => prints.some(p => p.set === s);
  if (sets.size === 1) { const d = take([...sets][0], 'solo'); if (d && d.e) return { ...d, solo: true }; }
  if (SC.stick && has(SC.stick)) { const d = take(SC.stick, 'auto'); if (d && d.e) return d; }
  for (const s of scanEdMajor()) if (has(s)) { const d = take(s, 'auto'); if (d && d.e) return d; }
  for (const x of SC.items.values()) {
    if (x === it || x.key !== it.key || !x.e) continue;
    const p = prints.find(y => edKey(y.set, y.num) === x.e); if (p) return { e: x.e, es: 'auto', pk: p };
  }
  return { e: '', es: 'pend', pk: null };
}
/** Extension collante du scan ; depuis le lot, elle devient aussi celle proposée par le lot. */
function scanStick(set) {
  if (!set || SC.stick === set) return;
  SC.stick = set;
  if (SC.lot && LOT.el) { LOT.set = set; lotSave(); lotPaintHead(); }
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
/** Extensions du scan, la collante d'abord puis par nombre d'exemplaires (montrées en tête de la feuille). */
function scanEdFront() {
  const by = new Map(); if (SC.stick) by.set(SC.stick, Infinity);
  for (const x of SC.items.values()) if (x.e && !x.maybe) { const s = edSet(x.e); if (by.get(s) !== Infinity) by.set(s, (by.get(s) || 0) + x.q); }
  return [...by].sort((a, b) => b[1] - a[1]).map(x => x[0]);
}
/** Symbole de l'édition d'une ligne du scan (à gauche de la quantité) : symbole seul ; « à choisir » : rond orangé ; en lecture : rond qui tourne. */
function scanEdBtn(it) {
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
  for (const x of SC.items.values()) { if (x.maybe || x.e || x.nx || x.es === 'none') continue; n += x.q; if (x.es === 'load') load += x.q; lines.push(x); }
  return { n, load, lines };
}
/** Choix de l'édition d'une ligne (symbole touché). */
function scanEdPick(it) {
  const pk = scanPk(it.key, it.l), pr = SC.pr.get(pk);
  if (pr === 'err') { SC.pr.delete(pk); it.es = 'load'; scanEdNeed(it); scanPaintList(); }      // illisible : on relit
  haptic('tap');
  edSheet({ name: scanShown(it), sub: TN(it.q, '{n} exemplaire', '{n} exemplaires') + (it.l && it.l !== 'en' ? ' · ' + langCode(it.l) : ''), cur: it.e,
    load: () => (Array.isArray(pr) ? Promise.resolve(pr) : scryArtPrints(it.name, it.l || 'en')), front: scanEdFront(), frontLabel: T('Dans ce scan'),
    onPick: p => scanEdChoose(it.id, p) });
}
function scanEdChoose(id, p) {
  const it = SC.items.get(id); if (!it) return;
  if (p) { it.nx = false; scanStick(p.set); scanEdApply(it, { e: edKey(p.set, p.num), es: 'man', pk: p }); }
  else { it.nx = true; scanEdApply(it, { e: '', es: 'pend', pk: null }); }
  scanEdPass(); scanPaintList();
}
/** Première carte à choisir (dans l'ordre du scan) : montrée dans la liste, sa feuille ouverte. */
function scanEdFocus() {
  const it = scanEdTodo().lines.find(x => x.es !== 'load'); if (!it || !SC.el) return;
  const row = $$('.sc-item[data-id]', SC.el).find(r => r.dataset.id === it.id);
  if (row) { row.scrollIntoView({ block: 'center', behavior: reduceMotion() ? 'auto' : 'smooth' }); row.classList.remove('hl'); void row.offsetWidth; row.classList.add('hl'); }
  scanEdPick(it);
}
/** Scan mobile, « Terminer » : des cartes parties sans édition → les choisir maintenant (le PC suit) ou terminer. */
function scanEdDone(go) {
  const t = scanEdTodo(); if (!t.n) { go(); return; }
  openSheet(T('Éditions à choisir'), '', api => {
    api.body.innerHTML = `<p class="cf-msg">${esc(TN(t.n, '{n} carte est partie vers ton PC sans édition.', '{n} cartes sont parties vers ton PC sans édition.'))} ${esc(T('Tu peux choisir maintenant (le PC suit), ou plus tard dans ta collection.'))}</p>`;
    api.setFoot(`<button class="btn ghost" type="button" data-go>${T('Terminer quand même')}</button><button class="btn" type="button" data-pick>${T('Choisir les éditions')}</button>`);
    api.foot.addEventListener('click', e => {
      if (e.target.closest('[data-go]')) { api.close(); go(); }
      else if (e.target.closest('[data-pick]')) { api.close(); scanEdFocus(); }
    });
  });
}
