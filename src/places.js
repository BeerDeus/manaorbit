/* ── places.js : emplacements (classeurs, boîtes, decks montés, à vendre…), détails d'un exemplaire, proxys ─────────────────────────
   Données (core.js › collDoc) : COLL.places (id → { t, n, r? }), COLL.prox (proxys, même forme que COLL.map) et, sur chaque ligne,
   « #p<emplacement>-c<état>-s-a-m » en fin de clé (lineKey). Tout part avec la collection : même texte, même compte, même fusion (collection.js).
   Rien ne s'affiche tant qu'on ne s'en sert pas : pas d'étiquette « Non rangé », détails repliés, proxys hors de la valeur, de l'échange et des stats. */
const PLC_COL = ['#e0533d', '#7fb0ff', '#4fd1a1', '#f08bd0', '#ffd166', '#8a7bff', '#5ec8e5', '#ff9f5a'];
const PLC_TYPE = { binder: 'Classeur', box: 'Boîte', sale: 'À vendre', other: 'Autre', deck: 'Deck monté' };
const PLC_NONE = '#4a4f66';
/** Emplacement d'une ligne s'il existe encore ('' : non rangé ; un emplacement supprimé ailleurs compte comme non rangé). */
const plcOf = g => { const p = linePlace(g); return p && COLL.places[p] ? p : ''; };
const plcAny = () => Object.keys(COLL.places).length > 0;
const plcColor = id => { const x = id && COLL.places[id]; return !x ? PLC_NONE : x.t === 'deck' ? '#c79bff' : x.t === 'sale' ? '#e8b45e' : PLC_COL[hash32(id) % PLC_COL.length]; };
const plcName = id => { const x = id && COLL.places[id]; return !x ? T('Non rangé') : x.t === 'deck' ? T('Deck : {name}', { name: x.n }) : x.n; };
/** Icône d'un emplacement selon son type (sprite : classeur, boîte, à vendre, deck monté, autre ; non rangé : point d'interrogation). */
const PLC_IC = { binder: 'i-binder', box: 'i-box', sale: 'i-tag', deck: 'i-layers', other: 'i-pin' };
const plcIc = id => { const x = id && COLL.places[id]; return `<svg class="i" aria-hidden="true"><use href="#${x ? PLC_IC[x.t] || 'i-pin' : 'i-help'}"/></svg>`; };
/** Emplacements dans l'ordre d'affichage : classeurs, boîtes, à vendre, autres, decks montés ; par nom. */
const plcList = () => Object.entries(COLL.places).map(([id, x]) => ({ id, ...x })).sort((a, b) => PLACE_TYPES.indexOf(a.t) - PLACE_TYPES.indexOf(b.t) || NAME_CMP(a.n, b.n));
/** Emplacement du deck monté id ('' s'il n'en a pas). */
const plcDeckOf = id => (id && Object.keys(COLL.places).find(p => COLL.places[p].t === 'deck' && COLL.places[p].r === id)) || '';
/** Exemplaires et valeur (centimes) par emplacement ('' : non rangé), cartes ou proxys (sans valeur). */
function plcStats(prox) {
  const out = new Map(), map = prox ? COLL.prox : COLL.map;
  for (const [k, x] of Object.entries(map)) for (const [g, q] of collLines(x)) {
    const p = plcOf(g); let o = out.get(p); if (!o) out.set(p, o = { q: 0, v: 0 });
    o.q += q; if (!prox) { const u = collLineEu(k, g); if (u > 0) o.v += u * q; }
  }
  return out;
}
/** « État, signée… » d'une ligne, en clair ('' : aucun détail). */
const cexDet = a => [a.c ? a.c.toUpperCase() : '', a.s ? T('signée') : '', a.a ? T('altérée') : '', a.m ? T('erreur d\'impression') : ''].filter(Boolean).join(' · ');
/** Étiquette d'une ligne de la liste (emplacement, détails). Ni rangée ni détaillée : « Ranger » discret, seulement quand un emplacement existe (sinon rien). */
function plcRowTag(g) {
  const p = plcOf(g), det = cexDet(lineAttrs(g));
  if (!p && !det) return plcAny() ? `<button type="button" class="tag plc add" data-act="cex" aria-label="${esc(T('Ranger cet exemplaire'))}">${T('Ranger')}</button>` : '';
  return `<button type="button" class="tag plc" data-act="cex" aria-label="${esc(T('Emplacement et détails : {v}', { v: [p ? plcName(p) : '', det].filter(Boolean).join(', ') }))}">${p ? `<i style="--c:${plcColor(p)}"></i>${esc(plcName(p))}` : ''}${det ? `<em>${esc(det)}</em>` : ''}</button>`;
}

/* ── Changer les données ───────────────────────────────────────────────────────────────────────── */
/** Déplace n exemplaires de la ligne g vers la ligne to (même carte) dans map ; nouvelle map (la même si rien ne bouge). */
function linesMove(map, k, g, n, to) {
  const cur = map[k]; if (!cur || g === to || !(n > 0)) return map;
  const lines = collLines(cur).map(e => e.slice()), e = lines.find(x => x[0] === g); if (!e) return map;
  const t = Math.min(n, e[1]); e[1] -= t;
  const d = lines.find(x => x[0] === to); if (d) d[1] = Math.min(9999, d[1] + t); else lines.push([to, t]);
  const next = collFromLines(cur, lines.filter(x => x[1] > 0)), m = { ...map }; if (next) m[k] = next; else delete m[k];
  return m;
}
/** d exemplaires de plus (ou de moins) sur la ligne g ; nouvelle map, la carte disparaît à 0. */
function lineBump(map, k, g, d) {
  const x = map[k], lines = collLines(x).map(e => e.slice()), e = lines.find(y => y[0] === g);
  if (e) e[1] = Math.max(0, Math.min(9999, e[1] + d)); else if (d > 0) lines.push([g, d]);
  const nx = collFromLines(x || {}, lines.filter(y => y[1] > 0)), m = { ...map }; if (nx) m[k] = nx; else delete m[k];
  return m;
}
function plcCreate(t, n, r) {
  const x = placeNorm({ t, n, r }); if (!x) return '';
  let id = placeNewId(); while (COLL.places[id]) id = placeNewId();
  COLL.places = { ...COLL.places, [id]: x }; collChanged();
  return id;
}
function plcSave(id, patch) { const x = placeNorm({ ...COLL.places[id], ...patch }); if (!x) return; COLL.places = { ...COLL.places, [id]: x }; collChanged(); }
/** Toutes les lignes (cartes et proxys) de l'emplacement id passent par fn(g) → nouvelle clé. */
function plcRekey(id, fn) {
  const re = map => { let m = map; for (const [k, x] of Object.entries(map)) for (const [g, q] of collLines(x)) { const a = lineAttrs(g); if (a.p === id || a.o === id) { const to = fn(g, a); if (to !== g) m = linesMove(m, k, g, q, to); } } return m; };
  COLL.map = re(COLL.map); COLL.prox = re(COLL.prox);
}
/** Supprime un emplacement : ses cartes reviennent là d'où elles venaient (deck monté) ou deviennent non rangées. */
function plcDelete(id) {
  if (!COLL.places[id]) return;
  plcRekey(id, (g, a) => (a.p === id ? lineSet(g, { p: a.o || '', o: '' }) : lineSet(g, { o: '' })));
  const pl = { ...COLL.places }; delete pl[id]; COLL.places = pl; collChanged();
}

/* ── Fiches ────────────────────────────────────────────────────────────────────────────────────── */
/** Liste à choix des emplacements (radio) : Non rangé, puis les emplacements avec leurs exemplaires. */
function plcRadioHtml(cur, prox) {
  const st = plcStats(prox), row = (id, n) => { const q = (st.get(id) || {}).q || 0; return `<button type="button" role="radio" class="plc-opt" data-p="${esc(id)}" aria-checked="${id === cur}"><i style="--c:${plcColor(id)}"></i><span>${esc(n)}</span><small>${q ? nf0(q) : ''}</small></button>`; };
  return `<div class="plc-radio" role="radiogroup" aria-label="${T('Emplacement')}">${row('', T('Non rangé'))}${plcList().map(x => row(x.id, plcName(x.id))).join('')}</div>
    <button type="button" class="plc-add" data-pn>${T('+ Nouvel emplacement')}</button>`;
}
/** Nouvel emplacement ou modification (nom, type) ; un deck monté garde son type. onDone(id) après création ou enregistrement. */
function plcEditSheet(id, onDone) {
  const cur = id ? COLL.places[id] : null; let t = cur ? cur.t : 'binder';
  openSheet(cur ? T('Modifier l\'emplacement') : T('Nouvel emplacement'), cur && cur.t === 'deck' ? T('Emplacement d\'un deck monté') : '', api => {
    const types = cur && cur.t === 'deck' ? '' : `<div class="plc-types" role="radiogroup" aria-label="${T('Type')}">${['binder', 'box', 'sale', 'other'].map(x => `<button type="button" role="radio" data-t="${x}" aria-checked="${x === t}">${T(PLC_TYPE[x])}</button>`).join('')}</div>`;
    api.body.innerHTML = `<div class="field-in"><label class="label" for="plcName">${T('Nom')}</label><input type="text" id="plcName" maxlength="40" autocomplete="off" value="${esc(cur ? cur.n : '')}" placeholder="${esc(T('Classeur rouge'))}"></div>${types}`;
    api.setFoot(`${cur ? `<button class="btn ghost danger-txt" type="button" data-del>${T('Supprimer')}</button>` : `<button class="btn ghost" type="button" data-close>${T('Annuler')}</button>`}<button class="btn" type="button" data-ok>${cur ? T('Enregistrer') : T('Créer')}</button>`);
    const inp = $('#plcName', api.body);
    api.body.addEventListener('click', e => { const b = e.target.closest('[data-t]'); if (!b) return; t = b.dataset.t; haptic('tap'); $$('[data-t]', api.body).forEach(x => x.setAttribute('aria-checked', String(x === b))); });
    const ok = () => {
      const n = placeName(inp.value); if (!n) { inp.focus(); return; }
      let pid = id; if (cur) plcSave(id, { n, t }); else pid = plcCreate(t, n);
      haptic('ok'); api.close(); if (onDone && pid) onDone(pid);
    };
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); ok(); } });
    api.foot.addEventListener('click', e => {
      if (e.target.closest('[data-ok]')) ok();
      else if (e.target.closest('[data-del]')) {
        const q = (plcStats().get(id) || {}).q || 0;
        openSheet(T('Supprimer « {name} » ?', { name: plcName(id) }), '', a2 => {
          a2.body.innerHTML = `<p class="cf-msg">${q ? TN(q, '{n} carte rangée ici redevient « Non rangé » (ou retourne d\'où elle venait).', '{n} cartes rangées ici redeviennent « Non rangé » (ou retournent d\'où elles venaient).') : T('Aucune carte n\'y est rangée.')}</p>`;
          a2.setFoot(`<button class="btn ghost" type="button" data-close>${T('Annuler')}</button><button class="btn danger" type="button" data-ok>${T('Supprimer')}</button>`);
          a2.foot.addEventListener('click', ev => { if (!ev.target.closest('[data-ok]')) return; a2.close(); api.close(); if (COLL.place === id) COLL.place = ''; plcDelete(id); haptic('ok'); if (onDone) onDone(''); });
        });
      }
    });
    setTimeout(() => { if (!cur) inp.focus(); }, 60);
  });
}
/** « Ranger dans » : o = { title, cur, prox? (bascule Ma collection / Mes proxys, absente si undefined), onPick(id, prox) }. */
function plcPick(o) {
  let prox = !!o.prox, cur = o.cur || '';
  openSheet(o.title || T('Ranger dans'), o.sub || '', api => {
    const paint = () => {
      api.body.innerHTML = `${o.prox !== undefined ? `<div class="seg plc-seg" role="radiogroup" aria-label="${T('Destination')}"></div>` : ''}${plcRadioHtml(cur, prox)}`;
      if (o.prox !== undefined) mountSeg($('.plc-seg', api.body), [{ v: 'coll', label: T('Ma collection') }, { v: 'prox', label: T('Mes proxys') }], prox ? 'prox' : 'coll', v => { prox = v === 'prox'; paint(); });
    };
    paint();
    api.body.addEventListener('click', e => {
      const r = e.target.closest('.plc-opt');
      if (r) { haptic('tap'); cur = r.dataset.p; api.close(); o.onPick(cur, prox); return; }
      if (e.target.closest('[data-pn]')) plcEditSheet('', id => { if (!id) return; cur = id; api.close(); o.onPick(id, prox); });
    });
  });
}
/** Fiche d'un exemplaire (ligne g de la carte k ; src 'map' ou 'prox') : emplacement, et « Détails (facultatif) » repliés : état Cardmarket, signée, altérée, erreur d'impression.
 *  Plusieurs exemplaires sur la ligne : on choisit combien sont concernés. done(nouvelle clé) après enregistrement. */
function cexSheet(src, k, g, done) {
  const get = () => (src === 'prox' ? COLL.prox : COLL.map), x = get()[k]; if (!x) return;
  const q0 = (collLines(x).find(e => e[0] === g) || [0, 0])[1]; if (!q0) return;
  const a0 = lineAttrs(g), a = { ...a0 }; let p = plcOf(g), n = q0;
  openSheet(T('Exemplaire'), `${nf0(q0)} × ${x.n}${lineTag(g) ? ' · ' + lineTag(g) : ''}`, api => {
    api.wrap.classList.add('cex');
    const paint = () => {
      const st = plcStats(src === 'prox');
      api.body.innerHTML = `${q0 > 1 ? `<div class="cex-n"><span>${T('Exemplaires concernés')}</span><span class="qstep"><button type="button" data-cn="-1" aria-label="${T('Moins')}">−</button><b>${n}</b><button type="button" data-cn="1" aria-label="${T('Plus')}">+</button></span><small>${T('sur {n}', { n: nf0(q0) })}</small></div>` : ''}
        <button type="button" class="plc-cur" data-pp><i style="--c:${plcColor(p)}"></i><span><small>${T('Emplacement')}</small><b>${esc(plcName(p))}</b></span><em>${p && st.get(p) ? nf0(st.get(p).q) : ''}</em><svg class="i" aria-hidden="true"><use href="#i-back"/></svg></button>
        <details class="cex-det"${cexDet(a0) ? ' open' : ''}><summary>${T('Détails (facultatif)')}</summary>
          <div class="cex-cond" role="group" aria-label="${T('État')}">${COND_CM.map(c => `<button type="button" data-cc="${c}" aria-pressed="${a.c === c}">${c.toUpperCase()}</button>`).join('')}</div>
          <div class="cex-flags">${[['s', T('Signée')], ['a', T('Altérée')], ['m', T('Erreur d\'impression')]].map(([f, l]) => `<button type="button" data-cf="${f}" aria-pressed="${!!a[f]}">${l}</button>`).join('')}</div>
        </details>`;
    };
    paint();
    api.setFoot(`<button class="btn ghost" type="button" data-close>${T('Annuler')}</button><button class="btn" type="button" data-ok>${T('Enregistrer')}</button>`);
    api.body.addEventListener('click', e => {
      const cn = e.target.closest('[data-cn]'), cc = e.target.closest('[data-cc]'), cf = e.target.closest('[data-cf]');
      if (cn) { n = Math.max(1, Math.min(q0, n + Number(cn.dataset.cn))); haptic('tap'); $('.cex-n b', api.body).textContent = n; return; }
      if (cc) { a.c = a.c === cc.dataset.cc ? '' : cc.dataset.cc; haptic('tap'); $$('[data-cc]', api.body).forEach(b => b.setAttribute('aria-pressed', String(b.dataset.cc === a.c))); return; }
      if (cf) { const f = cf.dataset.cf; a[f] = a[f] ? 0 : 1; haptic('tap'); cf.setAttribute('aria-pressed', String(!!a[f])); return; }
      if (e.target.closest('[data-pp]')) plcPick({ title: T('Ranger dans'), cur: p, onPick: id => { p = id; const d = $('.cex-det', api.body), open = d && d.open; paint(); if (open) $('.cex-det', api.body).open = true; } });
    });
    api.foot.addEventListener('click', e => {
      if (!e.target.closest('[data-ok]')) return;
      const na = { ...a, p }; if (p !== (a0.p || '')) delete na.o;      // rangé ailleurs à la main : plus d'origine de deck monté
      const to = lineKey(lineLang(g), lineEd(g), lineFoil(g), na);
      api.close(); if (to === g) return;
      const m = linesMove(get(), k, g, n, to); if (src === 'prox') COLL.prox = m; else COLL.map = m;
      haptic('ok'); collChanged(); if (done) done(to);
    });
  });
}

/* ── Onglet « Rangement » de la collection ─────────────────────────────────────────────────────── */
function plcTabHtml() {
  const st = plcStats(), list = plcList(), none = st.get('') || { q: 0, v: 0 }, px = plcStats(true);
  const card = (id, x) => { const s = st.get(id) || { q: 0, v: 0 }; return `<button type="button" class="plc-card" data-act="plcopen" data-p="${esc(id)}"><span class="plc-top"><i class="plc-ic" style="--c:${plcColor(id)}">${plcIc(id)}</i><small>${esc(id ? T(PLC_TYPE[x.t]) : T('Par défaut'))}</small></span><b>${esc(plcName(id))}</b><span class="plc-sub">${TN(s.q, '{n} carte', '{n} cartes', { n: nf0(s.q) })}${s.v ? ' · ' + esc(fmt(s.v, 'EUR')) : ''}</span></button>`; };
  let pq = 0; const pin = new Set(); for (const [id, s] of px) { pq += s.q; if (id) pin.add(id); }
  return `<div class="plc-h"><b>${T('Emplacements')}</b><button class="link-btn" type="button" data-act="plcnew">${T('+ Nouveau')}</button></div>
    ${list.length ? '' : `<p class="hint plc-intro">${T('Classeurs, boîtes, decks montés, pile à vendre : range chaque exemplaire pour savoir où il est. Au scan, choisis « Ranger dans » ; dans la liste, touche une carte puis son emplacement.')}</p>`}
    <div class="plc-grid">${list.map(x => card(x.id, x)).join('')}${list.length && none.q ? card('', null) : ''}</div>
    <div class="plc-h"><b>${T('Proxys')}</b><small>${T('jamais dans la valeur ni l\'échange')}</small></div>
    <button type="button" class="plc-prox" data-act="prox"><i class="plc-ic"><svg class="i" aria-hidden="true"><use href="#i-proxy"/></svg></i><span><b>${T('Mes proxys')}</b><small>${pq ? TN(pq, '{n} carte', '{n} cartes', { n: nf0(pq) }) + (pin.size ? ' · ' + TN(pin.size, 'rangées dans {n} emplacement', 'rangées dans {n} emplacements') : '') : T('Aucun proxy pour l\'instant')}</small></span><svg class="i" aria-hidden="true"><use href="#i-back"/></svg></button>`;
}
/** Bandeau du filtre par emplacement (onglet Cartes) : pastille (changer), valeur, Modifier, ✕. */
function plcBarHtml() {
  const id = COLL.place; if (id == null || id === false || !(id === '-' || COLL.places[id])) return '';
  const p = id === '-' ? '' : id, s = plcStats().get(p) || { q: 0, v: 0 };
  return `<div class="plc-bar"><button type="button" class="plc-pill" data-act="plcpill" aria-haspopup="dialog"><i style="--c:${plcColor(p)}"></i>${esc(plcName(p))} · ${nf0(s.q)}</button>${s.v ? `<span>${esc(T('{v} ici', { v: fmt(s.v, 'EUR') }))}</span>` : ''}<button type="button" class="btn small plc-mv" data-act="plcmv">${T('Ranger ces cartes…')}</button>${p ? `<button type="button" class="link-btn" data-act="plcedit">${T('Modifier')}</button>` : ''}<button type="button" class="icon-btn plc-x" data-act="plcclear" aria-label="${T('Toutes les cartes')}"><svg class="i"><use href="#i-close"/></svg></button></div>`;
}
/** Filtre de la liste : la ligne est-elle dans l'emplacement affiché ? */
const plcIn = g => (!COLL.place ? true : COLL.place === '-' ? !plcOf(g) : plcOf(g) === COLL.place);
function plcShow(id) {
  COLL.place = id || '-'; COLL.tab = COLL.ctab = 'list'; COLL.shown = COLL_PAGE;
  const sg = COLL.el && $('#collSeg', COLL.el); if (sg && sg.setValue) sg.setValue('list');
  collPaintBody(false); const sc = COLL.el && $('.dv-scroll', COLL.el); if (sc) sc.scrollTop = 0;
}
/** Exemplaires affichés dans la liste (emplacement affiché, recherche et filtres compris ; extension filtrée : ses lignes seules) : [[carte, ligne, exemplaires]]. */
function plcShownLines() {
  const out = [];
  for (const it of collListOf(collAll()).filtered) for (const [g, q] of collLines(COLL.map[it.k])) if (plcIn(g) && collSetIn(g)) out.push([it.k, g, q]);
  return out;
}
/** « Ranger… » (bandeau d'un emplacement, « Non rangé » compris) : tous les exemplaires affichés vont dans l'emplacement choisi, ou redeviennent non rangés
 *  (transfert d'un classeur à l'autre, rangement d'une extension filtrée…) ; « Annuler » les remet où ils étaient. */
function plcMoveShown() {
  const lines = plcShownLines(); if (!lines.length) { toast(T('Aucune carte affichée')); return; }
  const cards = new Set(lines.map(l => l[0])).size, copies = lines.reduce((a, l) => a + l[2], 0), from = COLL.place === '-' ? '' : COLL.place || '';
  plcPick({ title: TN(copies, 'Ranger {n} exemplaire', 'Ranger {n} exemplaires'), sub: TN(cards, '{n} carte affichée, recherche et filtres compris', '{n} cartes affichées, recherche et filtres compris'), cur: from, onPick: to => {
    if (to === from) return;
    const moves = [];
    for (const [k, g, q] of lines) {
      const a = { ...lineAttrs(g), p: to }; delete a.o;      // rangé à la main : plus d'origine de deck monté (comme cexSheet)
      const ng = lineKey(lineLang(g), lineEd(g), lineFoil(g), a); if (ng === g) continue;
      COLL.map = linesMove(COLL.map, k, g, q, ng); moves.push([k, g, q, ng]);
    }
    if (!moves.length) return;
    collChanged(); haptic('ok');
    toast(to ? TN(copies, '{n} exemplaire rangé dans « {place} »', '{n} exemplaires rangés dans « {place} »', { place: plcName(to) }) : TN(copies, '{n} exemplaire n\'est plus rangé', '{n} exemplaires ne sont plus rangés'),
      { label: T('Annuler'), fn: () => { for (const [k, g, q, ng] of moves.reverse()) COLL.map = linesMove(COLL.map, k, ng, q, g); collChanged(); } });
  } });
}
/** Clics de l'onglet Rangement et du bandeau ; true si traité. */
function plcClick(e) {
  const b = e.target.closest('button[data-act]'); if (!b) return false;
  const act = b.dataset.act;
  if (act === 'plcopen') { haptic('tap'); plcShow(b.dataset.p); }
  else if (act === 'plcnew') plcEditSheet('', () => collPaintBody(true));
  else if (act === 'plcedit') plcEditSheet(COLL.place, () => collPaintBody(true));
  else if (act === 'plcclear') { COLL.place = ''; haptic('tap'); collPaintBody(true); }
  else if (act === 'plcmv') { haptic('tap'); plcMoveShown(); }
  else if (act === 'plcpill') plcPick({ title: T('Afficher'), cur: COLL.place === '-' ? '' : COLL.place, onPick: id => plcShow(id) });
  else if (act === 'prox') openProxies();
  else if (act === 'cex') { const r = b.closest('.crow'); if (r && r.dataset.k) cexSheet('map', r.dataset.k, rowG(r)); }
  else return false;
  return true;
}

/** Import (CSV ManaBox avec « Binder Name ») : classeurs → emplacements (même nom qu'un emplacement existant : celui-là), cartes rangées dedans. Rend les cartes à ajouter. */
function plcImport(parsed) {
  const P = parsed && parsed.places; if (!P || !Object.keys(P).length) return parsed.items;
  const ids = {}, next = { ...COLL.places };
  for (const [id, x] of Object.entries(P)) {
    const same = Object.keys(next).find(k => next[k].n.toLowerCase() === x.n.toLowerCase() && (next[k].t === 'deck') === (x.t === 'deck'));
    if (same) { ids[id] = same; continue; }
    let nid = id; while (next[nid]) nid = placeNewId();
    const v = placeNorm(x); if (v) { next[nid] = v; ids[id] = nid; }
  }
  COLL.places = next;
  return parsed.items.map(it => collFromLines(it, collLines(it).map(([g, q]) => { const p = linePlace(g); return [p ? lineSet(g, { p: ids[p] || '' }) : g, q]; })));
}

/* ── Mes proxys : liste à part (jamais dans la valeur, l'échange, les stats ni le widget) ───────────────────────────────────────── */
function proxAdd(items) {      // items : [{ k, n, q, l (clé de ligne) }]
  COLL.prox = mergeColl(COLL.prox, items, 'add'); collChanged();
}
function openProxies() {
  let q = '';
  openSheet(T('Mes proxys'), T('Jamais comptés dans la valeur, l\'échange ni les statistiques'), api => {
    api.wrap.classList.add('prox-sheet');
    const rows = () => Object.entries(COLL.prox).flatMap(([k, x]) => collLines(x).map(([g, n]) => ({ k, x, g, n }))).filter(r => !q || normPart(r.x.n).includes(normPart(q))).sort((a, b) => NAME_CMP(a.x.n, b.x.n) || lineCmp(a.g, b.g));
    const paint = () => {
      const rs = rows(), tot = Object.values(COLL.prox).reduce((a, x) => a + x.q, 0);
      $('.prox-list', api.body).innerHTML = rs.length ? rs.map(r => `<div class="prox-row" data-k="${esc(r.k)}" data-g="${esc(r.g)}"><span class="prox-main"><b>${esc(r.x.n)}</b><span class="row-meta">${lineTag(r.g) ? `<span class="tag">${esc(lineTag(r.g))}</span>` : ''}${plcRowTag(r.g) || `<button type="button" class="tag plc" data-act="cex">${T('Ranger')}</button>`}</span></span>
          <button type="button" class="btn ghost small" data-act="real" title="${T('Remplacer par une vraie')}">${T('Vraie')}</button>
          <span class="qstep"><button type="button" data-d="-1" aria-label="${T('Retirer un exemplaire de {name}', { name: esc(r.x.n) })}">−</button><b>${r.n}</b><button type="button" data-d="1" aria-label="${T('Ajouter un exemplaire de {name}', { name: esc(r.x.n) })}">+</button></span></div>`).join('')
        : `<p class="hint">${tot ? T('Aucune carte ne correspond.') : T('Ajoute tes proxys au scan (« Ranger dans » › Mes proxys) ou colle une liste ci-dessous.')}</p>`;
      $('.prox-n', api.body).textContent = TN(tot, '{n} carte', '{n} cartes', { n: nf0(tot) });
    };
    api.body.innerHTML = `<label class="fsearch prox-q"><svg class="i" aria-hidden="true"><use href="#i-search"/></svg><input type="search" placeholder="${T('Rechercher')}" aria-label="${T('Rechercher un proxy')}" autocomplete="off"></label><p class="hint prox-n"></p><div class="prox-list"></div>
      <details class="prox-addw"><summary>${T('Ajouter des proxys')}</summary><textarea class="prox-ta" rows="3" placeholder="${esc('1 Gaea\'s Cradle\n2 Mana Crypt')}" aria-label="${T('Liste de proxys à ajouter')}"></textarea><button class="btn small" type="button" data-act="padd">${T('Ajouter')}</button></details>`;
    paint();
    $('.prox-q input', api.body).addEventListener('input', e => { q = e.target.value.trim(); paint(); });
    api.body.addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      const r = b.closest('.prox-row'), k = r && r.dataset.k, g = r && r.dataset.g;
      if (b.dataset.act === 'padd') {
        const ta = $('.prox-ta', api.body), p = parseCollection(ta.value, { fr: true }); if (!p.items.length) { ta.focus(); return; }
        proxAdd(p.items); ta.value = ''; haptic('ok'); paint();
        toast(TN(p.copies, '{n} proxy ajouté', '{n} proxys ajoutés', { n: nf0(p.copies) })); return;
      }
      if (!r) return;
      if (b.dataset.act === 'cex') { cexSheet('prox', k, g, () => paint()); return; }
      if (b.dataset.act === 'real') {      // une vraie carte remplace le proxy : même langue, édition, emplacement et détails
        const before = { m: COLL.map, p: COLL.prox }, x = COLL.prox[k];
        COLL.prox = lineBump(COLL.prox, k, g, -1);
        COLL.map = mergeColl(COLL.map, [{ k, n: x.n, q: 1, l: g }], 'add'); collChanged(); collEnrich(); haptic('ok'); paint();
        toast(T('{name} : la vraie carte est dans ta collection', { name: x.n }), { label: T('Annuler'), fn: () => { COLL.map = before.m; COLL.prox = before.p; collChanged(); paint(); } });
        return;
      }
      const d = Number(b.dataset.d); if (!d) return;
      COLL.prox = lineBump(COLL.prox, k, g, d); haptic('tap'); collChanged(); paint();
    });
  });
}

/* ── Decks montés : leurs cartes rangées dans « Deck : … », de retour à leur place au démontage ──────────────────────────────── */
/** Range dans l'emplacement du deck id (créé au besoin) les exemplaires réservés pour lui (XS.eng) ; les autres en ressortent.
 *  pref(k, g) : lignes à prendre d'abord (deck scanné : les exemplaires de la langue, de l'édition et de la finition lues au scan). */
function plcMount(id, name, text, pref) {
  const want = (XS.eng[id] && XS.eng[id].q) || engSnapshot(text, collQty);
  let pid = plcDeckOf(id);
  if (!pid) { const x = placeNorm({ t: 'deck', n: name || T('Deck'), r: id }); if (!x) return ''; pid = placeNewId(); while (COLL.places[pid]) pid = placeNewId(); COLL.places = { ...COLL.places, [pid]: x }; }
  else if (name && COLL.places[pid].n !== placeName(name)) COLL.places = { ...COLL.places, [pid]: placeNorm({ ...COLL.places[pid], n: name }) };
  let m = COLL.map;
  for (const k of new Set([...Object.keys(want), ...Object.keys(m).filter(k => collLines(m[k]).some(([g]) => linePlace(g) === pid))])) {
    const x = m[k]; if (!x) continue;
    const ls = collLines(x), w = want[k] || 0; let inn = ls.reduce((t, [g, q]) => t + (linePlace(g) === pid ? q : 0), 0);
    if (inn < w) {      // à ranger : d'abord les non rangés, puis les autres emplacements (jamais un autre deck monté)
      const pk = g => (pref && pref(k, g) ? 0 : 1), src = ls.filter(([g]) => linePlace(g) !== pid && !(COLL.places[plcOf(g)] && COLL.places[plcOf(g)].t === 'deck')).sort((a, b) => pk(a[0]) - pk(b[0]) || (plcOf(a[0]) ? 1 : 0) - (plcOf(b[0]) ? 1 : 0));
      for (const [g, q] of src) { if (inn >= w) break; const t = Math.min(q, w - inn); m = linesMove(m, k, g, t, lineSet(g, { p: pid, o: plcOf(g) })); inn += t; }
    } else if (inn > w) {      // plus dans la liste : retour à l'origine
      for (const [g, q] of ls.filter(([g]) => linePlace(g) === pid)) { if (inn <= w) break; const t = Math.min(q, inn - w), a = lineAttrs(g); m = linesMove(m, k, g, t, lineSet(g, { p: a.o || '', o: '' })); inn -= t; }
    }
  }
  COLL.map = m; collChanged();
  return pid;
}
/** Démonte : les cartes rangées dans l'emplacement du deck retournent d'où elles venaient, l'emplacement disparaît. */
function plcUnmount(id) { const pid = plcDeckOf(id); if (pid) plcDelete(pid); }

/** « Cartes à aller chercher » d'un deck : ce que j'ai, emplacement par emplacement (cases à cocher, sur cet écran seulement), proxys en option ; monter / démonter. */
function plcFetchSheet(d) {
  const want = new Map();
  for (const c of [...parseDeck(d.text).cards, ...parseDeck(d.text).basics, ...dkSideCards(d.text)]) { const k = ownKey(c.key || c.name); if (k) want.set(k, { n: c.name, q: ((want.get(k) || {}).q || 0) + c.qty }); }
  let withProx = (() => { try { return localStorage.getItem('deckdeal:fetchprox') === '1'; } catch (e) { return false; } })();
  const done = new Set();
  openSheet(T('Cartes à aller chercher'), d.name || '', api => {
    api.wrap.classList.add('fetch-sheet');
    const plan = () => {
      const groups = new Map(); let have = 0, px = 0, miss = 0, tot = 0; const pid = plcDeckOf(d.id);
      for (const [k, w] of want) {
        tot += w.q; let left = w.q;
        const take = (map, prox) => {
          const ls = collLines(map[k]).slice().sort((a, b) => (linePlace(b[0]) === pid ? 1 : 0) - (linePlace(a[0]) === pid ? 1 : 0));
          for (const [g, q] of ls) {
            if (left <= 0) break; const t = Math.min(q, left), p = plcOf(g), gk = (prox ? 'x' : 'c') + p;
            let o = groups.get(gk); if (!o) groups.set(gk, o = { p, prox, cards: [] });
            o.cards.push({ id: k + '|' + g, n: (frName(k, lineLang(g)) || (map[k] || {}).n || w.n), t, tag: lineTag(g) }); left -= t;
            if (prox) px += t; else have += t;
          }
        };
        take(COLL.map, false); if (withProx) take(COLL.prox, true);
        miss += left;
      }
      return { groups: [...groups.values()].sort((a, b) => (a.prox ? 1 : 0) - (b.prox ? 1 : 0) || (a.p ? 0 : 1) - (b.p ? 0 : 1) || NAME_CMP(plcName(a.p), plcName(b.p))), have, px, miss, tot };
    };
    const paint = () => {
      const P = plan(), pid = plcDeckOf(d.id);
      api.body.innerHTML = `<p class="hint fetch-sum">${[T('{a} / {b} possédées', { a: nf0(P.have), b: nf0(P.tot) }), P.px ? TN(P.px, '{n} proxy', '{n} proxys', { n: nf0(P.px) }) : '', P.miss ? TN(P.miss, '{n} manquante', '{n} manquantes', { n: nf0(P.miss) }) : ''].filter(Boolean).join(' · ')}</p>
        <label class="fetch-px"><input type="checkbox"${withProx ? ' checked' : ''}><span>${T('Compter mes proxys')}</span></label>
        ${P.groups.map(gr => { const nd = gr.cards.filter(c => done.has(c.id)).length; return `<section class="fetch-g"><div class="fetch-gh"><i style="--c:${gr.prox ? '#c79bff' : plcColor(gr.p)}"></i><b>${esc(gr.prox ? T('Mes proxys · {place}', { place: plcName(gr.p) }) : plcName(gr.p))}</b><small>${T('{a} sur {b}', { a: nf0(nd), b: nf0(gr.cards.length) })}</small></div>
          ${gr.cards.map(c => `<label class="fetch-c${done.has(c.id) ? ' on' : ''}"><input type="checkbox" data-c="${esc(c.id)}"${done.has(c.id) ? ' checked' : ''}><span>${c.t > 1 ? c.t + ' × ' : ''}${esc(c.n)}</span><small>${esc(c.tag)}</small></label>`).join('')}</section>`; }).join('') || `<p class="hint">${T('Aucune carte de ce deck dans ta collection.')}</p>`}`;
      api.setFoot(pid ? `<button class="btn ghost" type="button" data-un>${T('Démonter')}</button><button class="btn" type="button" data-close>${T('Fermer')}</button>`
        : `<button class="btn block" type="button" data-mount>${T('Monter le deck · range dans « {place} »', { place: T('Deck : {name}', { name: placeName(d.name) || T('Deck') }) })}</button>`);
    };
    paint();
    api.body.addEventListener('change', e => {
      const c = e.target.closest('[data-c]');
      if (c) { if (c.checked) done.add(c.dataset.c); else done.delete(c.dataset.c); haptic('tap'); const sc = api.body.scrollTop; paint(); api.body.scrollTop = sc; return; }
      if (e.target.closest('.fetch-px')) { withProx = e.target.checked; try { localStorage.setItem('deckdeal:fetchprox', withProx ? '1' : '0'); } catch (er) { /* réglage pour cette fois */ } paint(); }
    });
    api.foot.addEventListener('click', e => {
      if (e.target.closest('[data-mount]')) { if (!engIsOn(d.id)) engSet(d.id, d.name, d.text); plcMount(d.id, d.name, d.text); haptic('ok'); toast(T('Deck monté : cartes rangées dans « {place} »', { place: plcName(plcDeckOf(d.id)) })); paint(); }
      else if (e.target.closest('[data-un]')) { engClear(d.id); plcUnmount(d.id); haptic('tap'); toast(T('Deck démonté : les cartes retournent à leur place')); paint(); }
    });
  });
}

/* ── Scan : « Ranger dans » (collection ou proxys, emplacement), gardé sur l'appareil ─────────────────────────────────────────── */
const SCD_KEY = 'deckdeal:scandest';
const SCD = (() => { try { const j = JSON.parse(localStorage.getItem(SCD_KEY) || 'null'); return { x: !!(j && j.x), p: j && typeof j.p === 'string' ? j.p : '' }; } catch (e) { return { x: false, p: '' }; } })();
function scdSave() { try { localStorage.setItem(SCD_KEY, JSON.stringify(SCD)); } catch (e) { /* choix gardé pour cette session */ } }
/** Emplacement du scan s'il existe encore. */
const scdPlace = () => (SCD.p && COLL.places[SCD.p] ? SCD.p : '');
/** Étiquette de la pastille du scan. */
const scdLabel = () => (SCD.x ? T('Mes proxys') + (scdPlace() ? ' · ' + plcName(scdPlace()) : '') : scdPlace() ? plcName(scdPlace()) : T('Ma collection'));
/** Le scan range-t-il ailleurs que dans la collection, non rangé ? (pastille sur la caméra) */
const scdSet = () => SCD.x || !!scdPlace();
/** Ligne « Ranger dans » de la fiche d'ajout du scan. */
const scdRowHtml = () => `<button type="button" class="plc-cur rc-dest" data-rcd><i style="--c:${SCD.x ? '#c79bff' : plcColor(scdPlace())}"></i><span><small>${T('Ranger dans')}</small><b>${esc(scdLabel())}</b></span><svg class="i" aria-hidden="true"><use href="#i-back"/></svg></button>`;
/** Clé de ligne d'une carte scannée, avec l'emplacement choisi. */
const scdLine = (l, e, f) => lineKey(l, e, !!f, scdPlace() ? { p: scdPlace() } : '');      // f : exemplaires foil (scan)
function scdPick(onDone) {
  plcPick({ title: T('Ranger dans'), cur: scdPlace(), prox: SCD.x, onPick: (id, prox) => { SCD.p = id; SCD.x = !!prox; scdSave(); if (onDone) onDone(); } });
}
