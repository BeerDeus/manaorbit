/* ── deckana.js : « Analyser » un deck Commander (pour tout le monde depuis le 2 novembre 2026) ─────────────────────────────────────
   Depuis le viewer (deck de Mes decks, deck « À monter » EDHREC ou Archidekt, deck de la communauté, deck reçu par un lien) : état du deck et échanges conseillés.
   Même moteur que le coach (deckwiz.js : rôles des cartes, cibles, cartes conseillées du commandant), sur la liste du deck sans l'ouvrir dans l'éditeur.
   - Bracket estimé (Game Changers, destruction massive de terrains, tours supplémentaires, tuteurs) ; c'est aussi le bracket visé par défaut.
   - Équilibre (jauges en lecture seule), mana, règles du bracket visé, budget.
   - Échanges conseillés, du plus utile au moins utile, chacun avec sa raison :
       1. au-dessus de la limite de prix : les cartes chères qui pèsent peu → une carte du même rôle, au moins deux fois moins chère ;
       2. rôles sous la plage normale (rampe, pioche, retraits…) → à la place des cartes les plus faibles qui n'en remplissent aucun ;
       3. cartes faibles pour ce commandant (peu jouées, sans synergie) → une carte nettement mieux jouée, du même rôle ;
       4. deck déjà solide : jusqu'à 5 améliorations (les cartes les moins jouées du deck contre une carte nettement plus jouée du même rôle) ;
     la limite de prix globale est respectée à chaque échange (ou l'échange fait baisser le prix).
   - « Ouvrir dans l'éditeur avec N échanges » : les échanges cochés appliqués, onglet Coach ; un deck de Mes decks est modifié (à enregistrer),
     un autre deck devient un nouveau deck. */
const DA = { api: null, X: null, id: null, name: '', text: '', off: new Set(), brAuto: true, swaps: [] };
/** Bracket estimé d'un deck d'après son profil (dwProfile) : 4 avec plus de 3 Game Changers ou une destruction massive de terrains ; 3 avec un Game Changer
 *  plusieurs tours supplémentaires ou un combo à 2 cartes ; 2 sinon (1 et 5 ne se devinent pas sur la liste ; les tuteurs ne comptent plus depuis octobre 2025). */
function dwBracketOf(prof) {
  if (prof.gc.length > 3 || prof.mld.length) return 4;
  if (prof.gc.length || prof.xt.length > 1 || prof.combos.length) return 3;      // combo à 2 cartes : interdit en 1 et 2
  return 2;
}
/** Deck à analyser d'après son texte : { main, cmdr } ; sans bloc « Commander », la première carte si elle peut être commandant. */
function daDeckOf(text) {
  const p = dkParse(text), main = new Map(); for (const c of p.main) main.set(c.key, { ...c });
  let cmdr = p.cmdr.slice(0, 2);
  if (!cmdr.length) {
    const ks = typeof commanderKeys === 'function' ? commanderKeys(text).filter(k => main.has(k)) : [];
    const first = p.main[0], fx = first && dwCard(first.key), m = first && dmOf(first.key);
    if (ks.length) cmdr = ks.slice(0, 2).map(k => ({ key: k, name: main.get(k).name }));
    else if (first && ((m && m.cd) || (fx && fx.ty & 256 && fx.ty & 2))) cmdr = [{ key: first.key, name: first.name }];
  }
  for (const c of cmdr) { const x = main.get(c.key); if (x) { if (x.qty > 1) x.qty--; else main.delete(c.key); } }
  return { main, cmdr, wiz: null, skip: null };
}
/** Le rôle de la carte est déjà au plus bas de sa plage : la retirer creuserait un manque. */
const daRoleLow = (roles, prof, tgt) => DW_GAUGES.some(([r]) => r !== 'land' && roles & DW_RB[r] && tgt[r] && prof[r] <= tgt[r][0]);
/** Échanges conseillés : [{ out: { k, name, v, price, roles }, in: suggestion (dwSuggest), why: 'budget' | rôle | 'mieux' | 'plan' }]. */
function dwSwaps(X, cmd, pack, prof, tgt, max = 12) {
  const set = X.wiz || dwDefaults(), info = dwInfo(pack, set), val = k => { const o = info.get(k); return o ? dwVal(o) : 0; };
  const known = !!pack && info.size >= 40;      // commandant connu de la base : sinon aucun avis sur les cartes « faibles »
  const out = [], used = new Set(), skip = new Set(), Xs = { ...X, skip, info, wiz: { ...set, bud: 0 } };      // budget compté ici, échange par échange
  const lim = set.bud > 0 ? set.bud : 0; let total = prof.cents;
  const gaugeRoles = [...DW_GAUGES.map(g => g[0]).filter(r => r !== 'land'), 'wincon'];      // condition de victoire : un rôle comme les autres (jamais retirée pour une carte « mieux jouée » d'un autre rôle)
  const mainRole = r => gaugeRoles.find(g => r & DW_RB[g]) || '';
  const cards = [...X.main.values()].filter(c => !BASIC_NAMES.has(c.key)).map(c => { const x = dwCard(c.key); return x ? { k: c.key, name: c.name, x, v: val(c.key), o: info.get(c.key) || null, price: dwPrice(c.key, x), roles: x.roles } : null; }).filter(Boolean);
  const nonland = cards.filter(c => !(c.roles & DW_RB.land));
  const fits = (W, C) => !lim || C.price <= W.price || total - W.price + C.price <= lim;
  const take = (W, C, why) => { out.push({ out: W, in: C, why }); used.add(W.k); skip.add(C.k); total += C.price - W.price; };
  const best = (role, W, cond) => dwSuggest(role, cmd, pack, prof, tgt, 60, Xs).find(C => !skip.has(C.k) && C.k !== W.k && fits(W, C) && cond(C));
  // 1) au-dessus de la limite : les cartes chères qui pèsent peu, remplacées par une carte du même rôle au moins deux fois moins chère
  if (lim && total > lim) for (const W of [...nonland].sort((a, b) => b.price - a.price)) {
    if (total <= lim || out.length >= max) break; if (W.price < 300 || used.has(W.k)) continue;
    const C = best(mainRole(W.roles), W, C => C.price <= W.price * 0.5 && C.v >= W.v - 0.25); if (C) take(W, C, 'budget');
  }
  if (known) {
    const weakest = nonland.filter(c => !used.has(c.k)).sort((a, b) => a.v - b.v || b.price - a.price);
    // 2) rôles sous la plage normale : à la place des cartes les plus faibles qui ne remplissent aucun rôle qui manque
    const deficit = gaugeRoles.filter(r => tgt[r] && prof[r] < tgt[r][0]).map(r => [r, tgt[r][1] - prof[r]]).sort((a, b) => b[1] - a[1]);
    for (const [r, need] of deficit) for (let i = 0; i < Math.min(need, 3) && out.length < max; i++) {
      const W = weakest.find(c => !used.has(c.k) && c.v < 0.2 && !deficit.some(([d]) => c.roles & DW_RB[d]) && !daRoleLow(c.roles, prof, tgt)); if (!W) break;
      const C = best(r, W, () => true); if (C) take(W, C, r); else break;
    }
    // 3) cartes faibles pour ce commandant : une carte nettement mieux jouée, du même rôle (ou du plan de jeu)
    for (const W of weakest) {
      if (out.length >= max) break; if (used.has(W.k) || W.v >= 0.12) continue;
      if (daRoleLow(W.roles, prof, tgt) && !mainRole(W.roles)) continue;
      const r = mainRole(W.roles), C = best(r, W, C => C.v >= W.v + 0.2); if (C) take(W, C, r ? 'mieux' : 'plan');
    }
    // 4) deck déjà solide : quelques améliorations, les cartes les moins jouées du deck contre une carte nettement plus jouée du même rôle
    for (const W of weakest.slice(0, 10)) {
      if (out.length >= 5) break; if (used.has(W.k)) continue;
      const r = mainRole(W.roles), C = best(r, W, C => C.v >= W.v + 0.15); if (C) take(W, C, r ? 'mieux' : 'plan');
    }
  }
  // un échange conseillé ne fait jamais baisser la note du coach (deckopt.js) : chacun est essayé seul sur une copie du deck
  if (typeof dsScore !== 'function' || !out.length) return out;
  const base = dsScore(X, { cmd, pack, info }); if (!base) return out;
  return out.filter(s => {
    const m = new Map([...X.main].map(([k, c]) => [k, { ...c }])), o = m.get(s.out.k); if (o && o.qty > 1) o.qty--; else m.delete(s.out.k); m.set(s.in.k, { key: s.in.k, name: s.in.name, qty: 1 });
    const sc = dsScore({ main: m, cmdr: X.cmdr, wiz: X.wiz }, { cmd, pack, info }); return !sc || sc.raw >= base.raw - 0.05;
  });
}
/** Raison d'un échange, en clair. */
function daWhy(sw, cmd) {
  const nm = cmd ? cmd.names[0].split(',')[0] : '', g = DW_GAUGES.find(x => x[0] === sw.why);
  const head = sw.why === 'budget' ? T('Même rôle, bien moins chère') : g ? T('Il manque : {r}', { r: T(g[1]) }) : sw.why === 'mieux' ? T('Même rôle, bien plus jouée avec {name}', { name: nm }) : T('Bien plus jouée avec {name}', { name: nm });
  const a = sw.out.o ? sw.out.o.incl || 0 : 0, b = sw.in.o && sw.in.o.incl ? sw.in.o.incl : 0;
  return head + (b > a ? ' · ' + T('{b} % des decks (contre {a} %)', { a, b }) : '');
}

/* ── Écran ────────────────────────────────────────────────────────────────────────────────────────── */
/** Analyse d'un deck (texte), depuis le viewer. id : deck de Mes decks (ses réglages du coach, échanges appliqués à ce deck).
 *  Deux temps : d'abord les réglages (bracket visé, préréglé sur le bracket estimé ; limite de prix ; thèmes ; priorité collection), puis « Lancer l'analyse »
 *  calcule les échanges avec ces réglages ; « Modifier les réglages » y revient. */
function openDeckAnalysis({ text, name, id } = {}) {
  if (!dwOn()) return;
  const X = daDeckOf(String(text || ''));
  if (!X.cmdr.length) { toast(T('Commandant introuvable : ajoute un bloc « Commander » à la liste')); return; }
  const saved = id ? (() => { try { return localStorage.getItem(DW_SET + id); } catch (e) { return null; } })() : null;
  X.wiz = id ? dwSettingsFor(id) : dwDefaults();
  Object.assign(DA, { X, id: id || null, name: String(name || 'Deck'), text: String(text || ''), off: new Set(), brAuto: !saved, swaps: [], step: 'set', tries: 0, setOpen: false, swOpen: undefined, why: new Set(), ctx: null });
  DW.shown = 8;
  dwLoad().catch(() => {}); if (typeof edhLoad === 'function') edhLoad().then(() => daPaint()).catch(() => {});
  DA.api = openSheet(T('Analyse du deck'), DA.name, api => {
    api.wrap.classList.add('da-sheet'); dwImgs(api.wrap);      // vignettes des échanges
    api.body.addEventListener('click', daClick); api.body.addEventListener('change', daChange);
    api.setFoot(`<button class="btn ghost" type="button" data-close>${T('Fermer')}</button><button class="btn" type="button" id="daGo" disabled>${T('Lancer l\'analyse')}</button>`);
    $('#daGo', api.foot).onclick = () => { if (DA.step === 'set') { DA.step = 'res'; DA.off.clear(); haptic('tap'); daPaint(); DA.api.body.scrollTop = 0; } else daApply(); };
  });
  daPaint(); daMeta();
}
const daOpen = () => DA.api && sheets.includes(DA.api);
/** Images et coûts des cartes du deck et des échanges : relus jusqu'à 5 fois si Scryfall demande une pause (la vignette a sinon l'image Scryfall par le nom). */
function daMeta() {
  if (!daOpen()) return;
  const list = [...DA.X.main.values(), ...DA.X.cmdr, ...DA.swaps.map(s => ({ key: s.in.k, name: s.in.name }))];
  dmLoad().then(() => dmFetch(list)).then(n => { if (n) daPaint(); if (dmMissing(list).length && DA.tries++ < 5) setTimeout(daMeta, Math.max(2500, scryLeft() + 500)); }).catch(() => {});      // pause Scryfall (jusqu'à 30 s après un 429) : on attend sa fin
}
function daPaint() {
  if (!daOpen()) return;
  const api = DA.api, X = DA.X, body = api.body, go = $('#daGo', api.foot);
  const wait = t => { body.innerHTML = `<div class="status" data-ok="0"><span class="dot"></span><span>${t}</span></div>`; if (go) go.disabled = true; };
  if (!DW.core && (DW.p || (!DW.err))) { if (!DW.p && !DW.err) dwLoad().then(daPaint).catch(daPaint); else if (DW.p) DW.p.then(daPaint, daPaint); return wait(T('Chargement de la base du coach…')); }
  const cmd = dwCmdOf(X), pack = DW.core ? (DW.cmd.has(cmd.slug) ? DW.cmd.get(cmd.slug) : null) : null;
  if (DW.core && !DW.cmd.has(cmd.slug)) { dwPack('c', cmd.slug).then(daPaint); return wait(T('Chargement des cartes conseillées…')); }
  for (const t of X.wiz.th) if (DW.core && !DW.th.has(t)) { dwPack('t', t).then(daPaint); return wait(T('Chargement des cartes conseillées…')); }
  const prof = dwProfile(X), est = dwBracketOf(prof);
  if (DA.brAuto) X.wiz.br = est;
  const set = X.wiz, cur = mkCur(), bName = (DW_BRACKETS.find(b => b[0] === est) || DW_BRACKETS[2])[1];
  let h = DW.err ? `<div class="status" data-ok="0"><span class="dot"></span><span>${esc(DW.err)}</span></div>` : '';
  const sum = extra => `<div class="da-sum"><p class="dw-line"><span>${T('Commandant')}</span><b>${esc(cmd.names.join(' + '))}</b></p>
    <p class="dw-line"><span>${T('Bracket estimé')}</span><b>${est} · ${esc(bName)}</b></p>${extra}
    <p class="dw-line"><span>${T('Valeur du deck')}</span><b>${esc(fmt(prof.cents, cur))}</b><small>${esc(T('dont {p} à acheter', { p: fmt(prof.buy, cur) }))}</small></p></div>`;
  if (DA.step === 'set') {
    h += sum('') + `<div class="sec-title">${T('Réglages de l\'analyse')}</div><p class="hint">${T('Les échanges conseillés tiendront compte de ces réglages.')}</p>` + daSetHtml(cmd, pack, set, cur);
    const keep = body.scrollTop; body.innerHTML = h; thumbsReady(body); body.scrollTop = keep;
    if (go) { go.disabled = false; go.textContent = T('Lancer l\'analyse'); }
    return;
  }
  const tgt = dwTargets(prof, cmd, pack, set); DA.ctx = { prof, tgt };
  DA.swaps = DW.core ? dwSwaps(X, cmd, pack, prof, tgt) : [];
  const gs = DW_GAUGES.filter(([r]) => r !== 'counter' || cmd.ci.includes('U')), okN = gs.filter(([r]) => prof[r] >= tgt[r][0] && prof[r] <= tgt[r][2] + (r === 'land' ? 0 : 3)).length;
  h += sum(`<p class="dw-line"><span>${T('Équilibre')}</span><b>${esc(TN(okN, '{n} catégorie sur {b} dans la norme', '{n} catégories sur {b} dans la norme', { b: gs.length }))}</b></p>`);
  if (typeof dsScore === 'function' && DW.core) {      // note du coach, et ce qu'elle devient avec les échanges cochés
    const sc = dsScore(X, { cmd, pack }), on = DA.swaps.filter((s, i) => !DA.off.has(i));
    let after = null;
    if (on.length) { const m = new Map([...X.main].map(([k, c]) => [k, { ...c }])); for (const s of on) { const o = m.get(s.out.k); if (o && o.qty > 1) o.qty--; else m.delete(s.out.k); m.set(s.in.k, { key: s.in.k, name: s.in.name, qty: 1 }); } after = dsScore({ main: m, cmdr: X.cmdr, wiz: X.wiz }, { cmd, pack }).total; }
    h += dsScoreHtml(sc, { after });
  }
  const th = dwThemeChoices(cmd, pack, set), setTxt = [T('bracket {n}', { n: set.br }) + ' · ' + (DW_BRACKETS.find(b => b[0] === set.br) || DW_BRACKETS[2])[1], set.bud > 0 ? T('limite {p}', { p: fmt(set.bud, cur) }) : T('sans limite de prix'), ...(set.th.length ? [set.th.map(t => dwThemeLabel(t, th)).join(', ')] : []), ...(set.own ? [T('ma collection d\'abord')] : [])].join(' · ');
  if (typeof openDeckReport === 'function') h += `<button class="btn ghost block dw-rep" type="button" data-da-report><svg class="i" aria-hidden="true"><use href="#i-info"/></svg>${T('Rapport du coach')}</button>`;
  h += `<button class="dw-set-h" type="button" data-da-edit><span><b>${T('Réglages de l\'analyse')}</b><small>${esc(setTxt)}</small></span><span class="me-v">${DA.setOpen ? '−' : T('Modifier')}</span></button>`;
  if (DA.setOpen) h += `<p class="hint">${T('Chaque changement relance l\'analyse.')}</p>` + daSetHtml(cmd, pack, set, cur);      // réglages sur place : l'analyse suit chaque changement
  const swClosed = DA.swOpen === false && DA.swaps.length > 0;
  if (DA.swaps.length) {      // en-tête repliable : nombre d'échanges, cochés, effet sur la valeur du deck
    const on = DA.swaps.filter((s, i) => !DA.off.has(i)), dl = on.reduce((a, s) => a + s.in.price - s.out.price, 0);
    h += `<button class="dw-set-h da-sw-h" type="button" data-da-swt aria-expanded="${!swClosed}"><span><b>${T('Échanges conseillés')}</b><small>${esc(TN(DA.swaps.length, '{n} échange', '{n} échanges') + ' · ' + TN(on.length, '{n} coché', '{n} cochés') + (dl ? ' · ' + (dl > 0 ? '+' : '−') + fmt(Math.abs(dl), cur) : ''))}</small></span><span class="me-v">${swClosed ? T('Afficher') : T('Masquer')}</span></button>`;
  } else h += `<div class="sec-title">${T('Échanges conseillés')}</div>`;
  if (!DW.core) h += `<p class="hint">${T('Sans la base du coach, pas d\'échanges conseillés.')}</p>`;
  else if (swClosed) { /* repliés : l'en-tête suffit */ }
  else if (!DA.swaps.length) h += `<p class="hint">${!pack ? T('Ce commandant n\'est pas encore dans la base du coach : pas d\'avis sur ses cartes.') : set.bud > 0 && prof.cents > set.bud ? T('Aucune carte moins chère du même rôle trouvée pour passer sous la limite.') : T('Rien à changer : les cartes du deck sont bien jouées avec ce commandant.')}</p>`;
  else {
    const on = DA.swaps.filter((s, i) => !DA.off.has(i)), delta = on.reduce((a, s) => a + s.in.price - s.out.price, 0);
    h += `<p class="hint">${esc(T('Coche ceux qui te plaisent, puis ouvre le deck dans l\'éditeur pour les appliquer. Touche une carte pour l\'agrandir.'))}</p><div class="da-sws">${DA.swaps.map((s, i) => daSwapRow(s, i, cmd)).join('')}</div>`;
    h += `<p class="dw-line da-delta"><span>${T('Après ces échanges')}</span><b>${esc(fmt(prof.cents + delta, cur))}</b><small>${esc((delta >= 0 ? '+' : '−') + fmt(Math.abs(delta), cur))}</small></p>`;
    if (DA.swaps.some(sw => !dmOf(sw.in.k))) { DA.tries = 0; setTimeout(daMeta, 0); }
  }
  h += dwFoldHead('bal', DA.balOpen !== false, T('Équilibre du deck'), dwBalSum(prof, tgt, cmd), 'data-da-fold="bal"') + (DA.balOpen !== false ? `<div class="dw-gauges">${dwGaugesHtml(prof, tgt, cmd, pack, true)}</div>` : '');
  h += dwManaHtml(prof, tgt, cmd) + dwBracketHtml(prof, set) + dwBudgetHtml(prof, set);
  const keep = body.scrollTop; body.innerHTML = h; thumbsReady(body); body.scrollTop = keep;      // case cochée, « Pourquoi ? » : les vignettes déjà chargées restent affichées (pas de clignotement)
  const n = DA.swaps.length - DA.off.size;
  if (go) { go.disabled = false; go.textContent = n > 0 ? TN(n, 'Ouvrir dans l\'éditeur avec {n} échange', 'Ouvrir dans l\'éditeur avec {n} échanges') : T('Ouvrir dans l\'éditeur'); }
}
/** Réglages de l'analyse : bracket visé (préréglé sur l'estimé), limite de prix, thèmes, priorité à la collection. */
function daSetHtml(cmd, pack, set, cur) {
  const th = dwThemeChoices(cmd, pack, set);
  return `<div class="dw-set"><p class="label">${T('Bracket visé')}</p><div class="dw-chips">${DW_BRACKETS.map(b => `<button type="button" class="chip${set.br === b[0] ? ' on' : ''}" data-da-br="${b[0]}" aria-pressed="${set.br === b[0]}">${b[0]} · ${esc(b[1])}</button>`).join('')}</div>
    <p class="hint">${esc(T((DW_BRACKETS.find(b => b[0] === set.br) || DW_BRACKETS[2])[2]))}</p>
    <div class="field-in"><label class="label" for="daBud">${T('Limite de prix du deck ({c})', { c: cur })}</label><input type="number" id="daBud" inputmode="decimal" min="0" step="10" placeholder="${T('Sans limite')}" value="${set.bud > 0 ? Math.round(set.bud / 100) : ''}"></div>
    ${th.length ? `<p class="label">${T('Thèmes (3 au plus)')}</p><div class="dw-chips">${th.map(([slug, label]) => `<button type="button" class="chip${set.th.includes(slug) ? ' on' : ''}" data-da-th="${esc(slug)}" aria-pressed="${set.th.includes(slug)}">${esc(label)}</button>`).join('')}</div>` : ''}
    <label class="me-row switch-row" for="daOwn"><span class="me-t">${T('Priorité à ma collection')}<small>${T('Les cartes que tu possèdes passent devant dans les suggestions')}</small></span><span class="switch"><input type="checkbox" id="daOwn" ${set.own ? 'checked' : ''}><i></i></span></label></div>`;
}
/** Vignette d'une carte : image de la fiche (langue de ton exemplaire, sinon celle de l'appli : decks.js › cardImgA), sinon l'image Scryfall par le nom ; un toucher l'agrandit (zoom.js › da). */
function daThumb(k, nm) {
  const m = dmOf(k), x = COLL.map[k], src = m && m.im ? collImage(k, x ? x.l : '', m.im).src : zoomUrl(nm, 'small');
  return `<span class="thumb" style="--h:${hash32(k) % 360}" data-k="${esc(k)}" data-n="${esc(nm)}"${zoomAt('da', bdLabel(k, nm))}>${esc((nm.trim()[0] || '?').toUpperCase())}<img alt="" loading="lazy" decoding="async" ${cardImgA(k, nm, src, x ? x.l || '' : '')}></span>`;
}
/** Les deux cartes d'un échange (retirée → ajoutée), vignettes agrandies au toucher : analyse et Coach (deckux.js). */
function daSwapPair(s) {
  const own = collQty(s.in.k) > 0;
  return `<span class="da-pair"><span class="da-c out">${daThumb(s.out.k, s.out.name)}<span><small>${T('Retirer')}</small><b>${esc(bdLabel(s.out.k, s.out.name))}</b></span></span>
    <span class="da-arrow" aria-hidden="true">→</span>
    <span class="da-c in">${daThumb(s.in.k, s.in.name)}<span><small>${own ? T('Ajouter · dans ta collection') : T('Ajouter')}</small><b>${esc(bdLabel(s.in.k, s.in.name))}</b></span></span></span>`;
}
function daSwapRow(s, i, cmd) {
  const cur = mkCur(), d = s.in.price - s.out.price, open = DA.why && DA.why.has(i);
  return `<div class="da-sw${DA.off.has(i) ? ' off' : ''}"><input type="checkbox" data-da-sw="${i}" ${DA.off.has(i) ? '' : 'checked'} aria-label="${esc(T('Remplacer {a} par {b}', { a: bdLabel(s.out.k, s.out.name), b: bdLabel(s.in.k, s.in.name) }))}">
    ${daSwapPair(s)}
    <span class="da-why">${esc(daWhy(s, cmd))}${d ? ` · <b class="${d > 0 ? 'up' : 'down'}">${esc((d > 0 ? '+' : '−') + fmt(Math.abs(d), cur))}</b>` : ''} <button class="link-btn link-inline" type="button" data-da-why="${i}" aria-expanded="${!!open}">${T('Pourquoi ?')}</button></span>
    ${open && typeof dwSwapWhyHtml === 'function' && DA.ctx ? `<span class="da-wd">${dwSwapWhyHtml(s, DA.ctx.prof, DA.ctx.tgt, cmd)}</span>` : ''}</div>`;
}
/** Carte en grand depuis l'analyse : toutes les vignettes des échanges, dans l'ordre affiché (retirée, ajoutée, retirée…). */
if (typeof ZOOM_LISTS !== 'undefined') ZOOM_LISTS.da = th => {
  const box = th.closest('.da-sws, .dw-gb'); if (!box) return null;      // analyse, ou « Améliorer le deck » du Coach
  return zoomFrom($$('.thumb[data-zoom="da"]', box), th, t => zoomNamed(t.dataset.k, bdLabel(t.dataset.k, t.dataset.n), t.dataset.n, viewLang(t.dataset.k, true)));
};
function daClick(e) {
  if (e.target.closest('[data-da-report]')) { haptic('tap'); openDeckReport(DA.X, DA.name); return; }
  if (e.target.closest('[data-da-edit]')) { DA.setOpen = !DA.setOpen; haptic('tap'); daPaint(); return; }
  if (e.target.closest('[data-da-fold]')) { DA.balOpen = DA.balOpen === false; haptic('tap'); daPaint(); return; }      // « Équilibre du deck » replié ou déplié
  if (e.target.closest('[data-da-swt]')) { DA.swOpen = DA.swOpen === false; haptic('tap'); daPaint(); return; }      // replier / déplier les échanges conseillés
  const w = e.target.closest('[data-da-why]'); if (w) { const i = Number(w.dataset.daWhy); DA.why = DA.why || new Set(); if (DA.why.has(i)) DA.why.delete(i); else DA.why.add(i); haptic('tap'); daPaint(); return; }
  const sw = e.target.closest('.da-sw'); if (sw && !e.target.closest('input, [data-zoom], .da-wd, button')) { const c = $('input[data-da-sw]', sw); if (c) { c.checked = !c.checked; c.dispatchEvent(new Event('change', { bubbles: true })); } return; }      // toute la ligne coche, sauf la vignette (agrandie)
  const b = e.target.closest('[data-da-br]'); if (b) { DA.X.wiz.br = Number(b.dataset.daBr) || 3; DA.brAuto = false; DA.off.clear(); haptic('tap'); daPersist(); return daPaint(); }
  const t = e.target.closest('[data-da-th]'); if (t) { const s = DA.X.wiz, v = t.dataset.daTh, i = s.th.indexOf(v); if (i >= 0) s.th.splice(i, 1); else if (s.th.length < 3) s.th.push(v); else { toast(T('3 thèmes au plus')); return; } DA.off.clear(); haptic('tap'); daPersist(); return daPaint(); }
}
function daChange(e) {
  const t = e.target;
  if (t.dataset && t.dataset.daSw != null) { const i = Number(t.dataset.daSw); if (t.checked) DA.off.delete(i); else DA.off.add(i); haptic('tap'); return daPaint(); }
  if (t.id === 'daBud') { DA.X.wiz.bud = Math.max(0, Math.round(Number(String(t.value).replace(',', '.')) || 0)) * 100; DA.off.clear(); daPersist(); return daPaint(); }
  if (t.id === 'daOwn') { DA.X.wiz.own = t.checked; DA.off.clear(); daPersist(); return daPaint(); }
}
/** Deck de Mes decks : réglages gardés comme ceux du coach (même deck, mêmes thèmes, bracket et budget). */
function daPersist() { if (!DA.id) return; try { localStorage.setItem(DW_SET + DA.id, JSON.stringify(DA.X.wiz)); } catch (e) { /* stockage refusé */ } }
function daApply() {
  const sw = DA.swaps.filter((s, i) => !DA.off.has(i)).map(s => [s.out.k, s.in.k, s.in.name]), wiz = { ...DA.X.wiz };
  const id = DA.id && findDeck(DA.id) ? DA.id : null, text = DA.text, name = DA.name;
  if (DA.api) DA.api.close(); haptic('ok');
  if (typeof closeDeckViewer === 'function') closeDeckViewer();
  setTimeout(() => openBuilder(id ? { id, swaps: sw, wiz, tab: 'coach' } : { name, fmt: 'commander', text, swaps: sw, wiz, tab: 'coach' }), 260);
}
if (typeof module !== 'undefined' && module.exports) Object.assign(module.exports, { dwBracketOf });
