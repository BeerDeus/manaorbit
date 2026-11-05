/* ── deckana.js : le coach d'un deck Commander (pour tout le monde depuis le 2 novembre 2026 ; refonte de l'affichage le 4 novembre) ─────────────────
   Depuis le viewer (bouton « Coach » : deck de Mes decks, deck « À monter » EDHREC ou Archidekt, deck de la communauté, deck reçu par un lien).
   Même moteur que l'onglet Coach de l'éditeur (deckwiz.js : rôles des cartes, cibles, cartes conseillées du commandant ; deckopt.js : note) : cet écran ne fait que présenter.
   L'écran s'adapte à l'état du deck (voir « Écran » plus bas) : bilan direct, « Compléter le deck » ou aperçu.
   Échanges conseillés (dwSwaps), du plus utile au moins utile, chacun avec sa raison :
       1. au-dessus de la limite de prix : les cartes chères qui pèsent peu → une carte du même rôle, au moins deux fois moins chère ;
       2. rôles sous la plage normale (rampe, pioche, retraits…) → à la place des cartes les plus faibles qui n'en remplissent aucun ;
       3. cartes faibles pour ce commandant (peu jouées, sans synergie) → une carte nettement mieux jouée, du même rôle ;
       4. deck déjà solide : jusqu'à 5 améliorations (les cartes les moins jouées du deck contre une carte nettement plus jouée du même rôle) ;
     la limite de prix globale est respectée à chaque échange (ou l'échange fait baisser le prix).
   « Ouvrir dans l'éditeur avec N échanges » : les échanges cochés appliqués, onglet Coach ; un deck de Mes decks est modifié (à enregistrer). */
const DA = { api: null, X: null, id: null, name: '', text: '', off: new Set(), brAuto: true, swaps: [] };
/** Bracket estimé d'un deck d'après son profil (dwProfile) : le plus bas de 2 à 4 dont les règles (brackets.js › BRACKET_RULES, LA table) sont tenues :
 *  4 avec plus de 3 Game Changers ou une destruction massive de terrains ; 3 avec un Game Changer, plus d'un tour supplémentaire ou un combo à 2 ou 3 cartes ; 2 sinon
 *  (1 et 5 ne se devinent pas sur la liste ; les tuteurs ne comptent plus depuis octobre 2025). */
const dwBracketOf = prof => DWB.bracketEstimate(dwBrFacts(prof));
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
  const set = X.wiz || dwDefaults(), info = dwInfo(pack, set), has = k => X.main.has(k) || X.cmdr.some(c => c.key === k);
  const trapOk = k => { const o = info.get(k); return !!(o && o.trap && dwTrapOk(k, o, has, set)); };      // piège avec le commandant, mais combo ou moteur avec une autre carte du deck : ni faible ni à retirer
  const val = k => { const o = info.get(k); return o ? dwVal(o) + (trapOk(k) ? dwW().trap : 0) : 0; };
  const known = !!pack && info.size >= 40;      // commandant connu de la base : sinon aucun avis sur les cartes « faibles »
  const out = [], used = new Set(), skip = new Set(), Xs = { ...X, skip, info, wiz: { ...set, bud: 0 } };      // budget compté ici, échange par échange
  const lim = set.bud > 0 ? set.bud : 0; let total = prof.cents;
  const gaugeRoles = [...DW_GAUGES.map(g => g[0]).filter(r => r !== 'land'), 'wincon'];      // condition de victoire : un rôle comme les autres (jamais retirée pour une carte « mieux jouée » d'un autre rôle)
  const mainRole = r => gaugeRoles.find(g => r & DW_RB[g]) || '';
  const cards = [...X.main.values()].filter(c => !BASIC_NAMES.has(c.key)).map(c => { const x = dwCard(c.key); return x ? { k: c.key, name: c.name, x, v: val(c.key), o: info.get(c.key) || null, price: dwPrice(c.key, x, true), roles: x.roles } : null; }).filter(Boolean);
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
    // seuils relatifs au deck (la valeur d'une carte compte maintenant les mécaniques et la fiche du commandant : l'échelle n'est plus celle de la seule popularité) ;
    // un piège de la fiche (carte qui marche mal avec ce commandant) est toujours parmi les plus faibles
    const vs = weakest.map(c => c.v), qAt = f => vs.length ? vs[Math.min(vs.length - 1, Math.floor(vs.length * f))] : 0;
    const vWeak = Math.max(0.2, qAt(0.25)), vVeryWeak = Math.max(0.12, qAt(0.15)), isTrap = c => !!(c.o && c.o.trap) && !trapOk(c.k);
    // 2) rôles sous la plage normale : à la place des cartes les plus faibles qui ne remplissent aucun rôle qui manque
    const deficit = gaugeRoles.filter(r => tgt[r] && prof[r] < tgt[r][0]).map(r => [r, tgt[r][1] - prof[r]]).sort((a, b) => b[1] - a[1]);
    for (const [r, need] of deficit) for (let i = 0; i < Math.min(need, 3) && out.length < max; i++) {
      const W = weakest.find(c => !used.has(c.k) && (c.v < vWeak || isTrap(c)) && !deficit.some(([d]) => c.roles & DW_RB[d]) && !daRoleLow(c.roles, prof, tgt)); if (!W) break;
      const C = best(r, W, () => true); if (C) take(W, C, r); else break;
    }
    // 3) cartes faibles pour ce commandant : une carte nettement mieux jouée, du même rôle (ou du plan de jeu)
    for (const W of weakest) {
      if (out.length >= max) break; if (used.has(W.k) || (W.v >= vVeryWeak && !isTrap(W))) continue;
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
  return out.map(s => {      // chaque échange essayé seul ; les plus rentables d'abord (gain de note), jamais un échange qui fait baisser la note
    const m = new Map([...X.main].map(([k, c]) => [k, { ...c }])), o = m.get(s.out.k); if (o && o.qty > 1) o.qty--; else m.delete(s.out.k); m.set(s.in.k, { key: s.in.k, name: s.in.name, qty: 1 });
    const sc = dsScore({ main: m, cmdr: X.cmdr, wiz: X.wiz }, { cmd, pack, info }); s.gain = sc ? sc.raw - base.raw : 0; return s;
  }).filter(s => s.gain >= -0.05).sort((a, b) => (b.why === 'budget') - (a.why === 'budget') || b.gain - a.gain);
}
/** Raison d'un échange, en clair : [raison principale, précisions…] (ce que la carte fait pour ce deck, piège de la fiche). */
function daWhyParts(sw, cmd) {
  const nm = cmd ? cmd.names[0].split(',')[0] : '', g = DW_GAUGES.find(x => x[0] === sw.why);
  const a = sw.out.o ? sw.out.o.incl || 0 : 0, b = sw.in.o && sw.in.o.incl ? sw.in.o.incl : 0, more = b >= a + 10;      // « bien plus jouée » seulement si c'est vrai : l'échange est choisi sur la valeur pour ce deck (mécaniques, fiche), pas sur la seule popularité
  const head = sw.why === 'budget' ? T('Même rôle, bien moins chère') : g ? T('Il manque : {r}', { r: T(g[1]) })
    : sw.why === 'mieux' ? (more ? T('Même rôle, bien plus jouée avec {name}', { name: nm }) : T('Même rôle, plus utile dans ce deck avec {name}', { name: nm }))
    : more ? T('Bien plus jouée avec {name}', { name: nm }) : T('Sert mieux le plan de {name}', { name: nm });
  const C = DW.infoC && DW.infoC.C, plan = C && C.plan, mech = plan && DA.X && typeof dmxReasons === 'function' ? dmxReasons(sw.in.k, DA.X, cmd, plan).slice(0, 2) : [];      // ce que la carte proposée fait pour ce deck (fiche du commandant, mécaniques)
  const trap = sw.out.o && sw.out.o.trap ? [T('{card} marche mal avec {name}', { card: sw.out.name, name: nm })] : [];
  return [head, ...(b > a ? [T('{b} % des decks (contre {a} %)', { a, b })] : []), ...trap, ...mech];
}
/** Raison d'un échange, en une ligne. */
const daWhy = (sw, cmd) => daWhyParts(sw, cmd).join(' · ');

/* ── Écran : le coach s'adapte à l'état du deck ──────────────────────────────────────────────────────────────────────────────────────
   · Deck de Mes decks complet (100 cartes) → bilan tout de suite, sans question : bracket estimé (dwBracketOf) ou celui enregistré pour le deck, budget = valeur
     actuelle du deck ou celui enregistré. Dans l'ordre : note /100 et une phrase, 3 actions prioritaires au plus (cartes touchables), échanges conseillés
     (repliés, note avant → après), détail replié (note, équilibre, mana, bracket, budget, simulation, rapport), réglages en une ligne en bas.
   · Deck de Mes decks incomplet → « Compléter le deck » : réglages courts (déjà remplis), puis la construction de l'éditeur (deckopt.js › dsBuild, onglet Coach).
   · Deck qui n'est pas à moi (À monter, communauté, lien) → aperçu : note, points forts et faibles, « Ajouter à mes decks » ; pas d'échanges.
   Le calcul est celui du coach (dwProfile, dwTargets, dsScore, dwSwaps) : cet écran ne fait que le présenter. */
/** id : deck de Mes decks ; from : origine notée sur le deck si on l'ajoute à Mes decks (« edh » : À monter). */
function openDeckAnalysis({ text, name, id, from } = {}) {
  if (!dwOn()) return;
  const X = daDeckOf(String(text || ''));
  if (!X.cmdr.length) { toast(T('Commandant introuvable : ajoute un bloc « Commander » à la liste')); return; }
  Object.assign(DA, { X, id: null, name: String(name || 'Deck'), text: String(text || ''), from: from || '', off: new Set(), swaps: [], tries: 0, setOpen: false, swOpen: false, detOpen: false, why: new Set(), ctx: null, sc: null });
  daOwn(id && findDeck(id) ? id : null);
  DW.shown = 8;
  dwLoad().catch(() => {}); if (typeof edhLoad === 'function') edhLoad().then(() => daPaint()).catch(() => {});
  DA.api = openSheet(T('Coach'), DA.name, api => {
    api.wrap.classList.add('da-sheet'); dwImgs(api.wrap);      // vignettes des échanges
    api.body.addEventListener('click', daClick); api.body.addEventListener('change', daChange);
    daSetFormBind(api.body, DA.X.wiz, daSetChanged);
    api.setFoot(`<button class="btn ghost" type="button" data-close>${T('Fermer')}</button><button class="btn" type="button" id="daGo" disabled>${T('Ouvrir dans l\'éditeur')}</button>`);
    $('#daGo', api.foot).onclick = () => { const m = DA.mode; if (m === 'peek') daAdd(); else if (m === 'build') daBuild(); else daApply(); };
  });
  daPaint(); daMeta();
}
/** Le deck devient (ou est) celui de Mes decks id : ses réglages enregistrés, sinon bracket estimé et budget = valeur actuelle (bilan). */
function daOwn(id) {
  const saved = daSaved(id), w = id ? dwSettingsFor(id) : dwDefaults();
  if (!saved) { w.ba = 1; w.bv = 1; }      // jamais réglé : bracket estimé (ba) et budget = valeur actuelle (bv), suivis tant qu'on n'en choisit pas
  if (DA.X.wiz) { for (const k of Object.keys(DA.X.wiz)) delete DA.X.wiz[k]; Object.assign(DA.X.wiz, w); } else DA.X.wiz = w;      // même objet : le formulaire reste branché dessus
  Object.assign(DA, { id, mine: !!id, brAuto: !!w.ba, budAuto: !!w.bv });
}
const daOpen = () => DA.api && sheets.includes(DA.api);
/** Images et coûts des cartes du deck et des échanges : relus jusqu'à 5 fois si Scryfall demande une pause (la vignette a sinon l'image Scryfall par le nom). */
function daMeta() {
  if (!daOpen()) return;
  const list = [...DA.X.main.values(), ...DA.X.cmdr, ...DA.swaps.map(s => ({ key: s.in.k, name: s.in.name }))];
  dmLoad().then(() => dmFetch(list)).then(n => { if (n) daPaint(); if (dmMissing(list).length && DA.tries++ < 5) setTimeout(daMeta, Math.max(2500, scryLeft() + 500)); }).catch(() => {});      // pause Scryfall (jusqu'à 30 s après un 429) : on attend sa fin
}
/** Rôles du coach, au singulier et au pluriel : « Ajouter 2 pioches », et ce qui manque, en clair (« la pioche est un peu juste »). */
const DA_ROLE = {
  ramp: ['Ajouter {n} carte de rampe', 'Ajouter {n} cartes de rampe', 'la rampe est un peu juste'], draw: ['Ajouter {n} pioche', 'Ajouter {n} pioches', 'la pioche est un peu juste'],
  removal: ['Ajouter {n} retrait ciblé', 'Ajouter {n} retraits ciblés', 'il manque des retraits ciblés'], wipe: ['Ajouter {n} balayage', 'Ajouter {n} balayages', 'il manque des balayages'],
  counter: ['Ajouter {n} contresort', 'Ajouter {n} contresorts', 'il manque des contresorts'], protect: ['Ajouter {n} protection', 'Ajouter {n} protections', 'la protection est un peu juste'],
  tutor: ['Ajouter {n} tuteur', 'Ajouter {n} tuteurs', 'il manque des tuteurs'], recursion: ['Ajouter {n} carte de récursion', 'Ajouter {n} cartes de récursion', 'il manque de la récursion'],
  wincon: ['Ajouter {n} condition de victoire', 'Ajouter {n} conditions de victoire', 'il manque des conditions de victoire'],
};
/** Actions prioritaires (3 au plus), les plus rentables d'abord : { k (rôle, 'land', 'gc', 'mld', 'xt', 'combo', 'budget', 'curve', 'swap'), t (titre), s (détail), gain (points estimés), issue (phrase de synthèse) }.
 *  Points estimés comme la note du coach (deckopt.js › dsScore), pour l'ordre seulement. */
function daActions(prof, tgt, cmd, set, swaps, pack) {
  const out = [], roles = [...DW_GAUGES.map(g => g[0]), 'wincon'].filter(r => r !== 'land' && DA_ROLE[r] && tgt[r] && tgt[r][2] > 0 && !(r === 'counter' && !cmd.ci.includes('U')));
  const sw = (swaps || [])[0], swRole = sw && DA_ROLE[sw.why] ? sw.why : '';
  const Xe = { ...DA.X, wiz: daEdWiz(set) };      // réglages que reçoit l'éditeur (daApply) : une catégorie n'est proposée que si le coach y a des cartes à suggérer
  let swGain = 1.5;
  for (const r of roles) {
    const [lo, mid] = tgt[r], v = prof[r]; if (v >= lo) continue;
    const sc = 0.75 * (lo ? v / lo : 1), n = Math.max(1, mid - v), gain = (1 - sc) * 30 / roles.length, issue = T(DA_ROLE[r][2]);
    if (r === swRole) { swGain = Math.max(swGain, gain); sw.issue = issue; continue; }      // l'échange conseillé comble ce manque : il passe à sa place
    if (DW.byKey && !dwSuggest(r, cmd, pack, prof, tgt, 1, Xe).length) continue;      // rien à suggérer dans ces couleurs et ce bracket : pas d'action vide
    out.push({ k: r, sg: '+', t: TN(n, DA_ROLE[r][0], DA_ROLE[r][1]), s: T('{n} dans le deck, {m} conseillées', { n: v, m: mid }), gain, issue });
  }
  const dl = prof.land - tgt.land[1];
  if (dl) out.push({ k: 'land', sg: dl > 0 ? '−' : '+', t: dl > 0 ? TN(dl, 'Retirer {n} terrain', 'Retirer {n} terrains') : TN(-dl, 'Ajouter {n} terrain', 'Ajouter {n} terrains'), s: T('{n} terrains, {m} conseillés', { n: prof.land, m: tgt.land[1] }), gain: Math.min(1, Math.abs(dl) * 0.12) * 10, issue: dl > 0 ? T('un peu trop de terrains') : T('un peu juste en terrains') });
  const b = DW_BRACKETS.find(x => x[0] === set.br) || DW_BRACKETS[2], bad = new Set(DWB.bracketBreaks(b[0], dwBrFacts(prof)).filter(x => x.lv === 'bad').map(x => x.k)), R = DWB.brRule(b[0]);      // règles du bracket (brackets.js)
  if (bad.has('gc')) out.push({ k: 'gc', sg: '−', t: TN(prof.gc.length - R.gc, 'Retirer {n} Game Changer', 'Retirer {n} Game Changers'), s: T('Bracket {b} : {m} au plus', { b: b[0], m: R.gc }), gain: 5, issue: T('trop fort pour le bracket visé') });
  if (bad.has('mld')) out.push({ k: 'mld', sg: '−', t: T('Retirer la destruction de terrains'), s: T('Interdite en bracket {b}', { b: b[0] }), gain: 5, issue: T('trop fort pour le bracket visé') });
  if (bad.has('xt')) out.push({ k: 'xt', sg: '−', t: TN(prof.xt.length - R.xt, 'Retirer {n} tour supplémentaire', 'Retirer {n} tours supplémentaires'), s: T('Bracket {b} : {m} au plus', { b: b[0], m: R.xt }), gain: 3, issue: T('trop fort pour le bracket visé') });
  if (bad.has('c2')) out.push({ k: 'combo', sg: '−', t: T('Casser le combo à 2 cartes'), s: T('Interdit en bracket {b}', { b: b[0] }), gain: 5, issue: T('trop fort pour le bracket visé') });
  else if (bad.has('c3')) out.push({ k: 'combo', sg: '−', t: T('Casser le combo à 3 cartes'), s: T('À éviter en bracket {b}', { b: b[0] }), gain: 3, issue: T('trop fort pour le bracket visé') });
  if (set.bud > 0 && prof.cents > set.bud) out.push({ k: 'budget', sg: '−', t: T('Baisser le prix de {p}', { p: fmt(prof.cents - set.bud, mkCur()) }), s: T('Limite : {p}', { p: fmt(set.bud, mkCur()) }), gain: Math.min(5, Math.ceil((prof.cents - set.bud) / set.bud * 20)), issue: T('au-dessus du budget') });
  if (prof.nonland && prof.mv > tgt.mv[2]) out.push({ k: 'curve', sg: '−', t: T('Baisser la courbe de mana'), s: T('Coût moyen {v}, repère {m}', { v: dsNum(prof.mv), m: dsNum(tgt.mv[1], 1) }), gain: Math.min(1, (prof.mv - tgt.mv[2]) / 0.6) * 10, issue: T('la courbe est un peu haute') });
  if (sw) out.push({ k: 'swap', sg: '⇄', t: T('Échanger {a} → {b}', { a: bdLabel(sw.out.k, sw.out.name), b: bdLabel(sw.in.k, sw.in.name) }), s: daWhy(sw, cmd), gain: swGain, issue: sw.issue || '' });
  return out.sort((a, c) => c.gain - a.gain);
}
const DA_LEVEL = { top: 'Excellent', ok: 'Solide', mid: 'Jouable', low: 'À retravailler' };
/** Phrase de synthèse : « Solide, la pioche est un peu juste ». */
function daSummary(sc, acts) {
  const lvl = T(DA_LEVEL[dsLevel(sc.total)]), a = acts.find(x => x.issue && x.gain >= 0.8);
  return a ? T('{level}, {issue}', { level: lvl, issue: a.issue }) : sc.total >= 85 ? T('Excellent équilibre') : T('{level}, rien d\'urgent à changer', { level: lvl });
}
/** Deck atypique (synergie basse, le reste correct) : la note compare aux listes les plus jouées ; c'est assumé, sans reproche. */
const daAtypical = (sc, pack) => !!pack && sc.parts.some(p => p.k === 'syn' && p.pts / p.max < 0.4) && sc.parts.some(p => p.k === 'roles' && p.pts / p.max >= 0.75);
/** En-tête : note en grand, phrase, bracket et valeur. */
function daHeadHtml(sc, acts, prof, set, est, pack, mine) {
  const cur = mkCur(), b = DW_BRACKETS.find(x => x[0] === (DA.brAuto ? est : set.br)) || DW_BRACKETS[2];
  const meta = [T('Bracket {n} · {name}', { n: b[0], name: b[1] }) + (DA.brAuto ? ' · ' + T('estimé') : ''), fmt(prof.cents, cur) + (!mine && prof.buy ? ' · ' + T('dont {p} à acheter', { p: fmt(prof.buy, cur) }) : '')];
  return `<div class="cb-head ds-${dsLevel(sc.total)}"><div class="cb-n"><b>${sc.total}</b><small>/100</small></div><div class="cb-t"><b>${esc(daSummary(sc, acts))}</b><span>${meta.map(esc).join('<br>')}</span></div></div>`
    + (daAtypical(sc, pack) ? `<p class="hint cb-note">${T('Deck atypique : la note le compare aux listes les plus jouées avec ce commandant. Un plan original la fait baisser, c\'est normal.')}</p>` : '');
}
/** Une action prioritaire (carte touchable). */
const daActHtml = (a, i) => `<button type="button" class="cb-act" data-cb-act="${i}"><span class="cb-ic ${a.sg === '+' ? 'in' : a.sg === '⇄' ? 'sw' : 'out'}" aria-hidden="true">${a.sg}</span><span class="cb-at"><b>${esc(a.t)}</b><small>${esc(a.s)}</small></span><svg class="i chev" aria-hidden="true"><use href="#i-chev"/></svg></button>`;
/** Ligne de réglages (bas du bilan) : « bracket 4 (estimé) · limite 580 € · thèmes » et « Modifier ». */
function daSetLine(cmd, pack, set, est) {
  const cur = mkCur(), th = dwThemeChoices(cmd, pack, set);
  const txt = [T('bracket {n}', { n: DA.brAuto ? est : set.br }) + (DA.brAuto ? ' (' + T('estimé') + ')' : ''), set.bud > 0 ? T('limite {p}', { p: fmt(set.bud, cur) }) + (DA.budAuto ? ' (' + T('valeur actuelle') + ')' : '') : T('sans limite de prix'), ...(set.th.length ? [set.th.map(t => dwThemeLabel(t, th)).join(', ')] : [])].join(' · ');
  return `<button class="dw-set-h cb-set" type="button" data-da-edit aria-expanded="${!!DA.setOpen}"><span><b>${T('Réglages')}</b><small>${esc(txt)}</small></span><span class="me-v">${DA.setOpen ? T('Fermer') : T('Modifier')}</span></button>`
    + (DA.setOpen ? daSetFormHtml(cmd, pack, set, { est, val: DA.ctx ? DA.ctx.prof.cents : 0, pfx: 'da' }) : '');
}
/** Détail replié : note partie par partie, équilibre, mana, bracket, budget, simulation de parties, rapport. */
function daDetailHtml(sc, prof, tgt, cmd, pack, set) {
  let h = `<div class="cb-parts">${sc.parts.map(p => `<p class="ds-p"><span>${esc(p.label)}</span><span class="ds-bar"><i style="width:${Math.round(p.pts / p.max * 100)}%"></i></span><b>${Math.round(p.pts)}<small>/${p.max}</small></b></p>`).join('')}</div>`;
  h += `<div class="sec-title">${T('Équilibre du deck')}</div><p class="hint">${esc(dwBalSum(prof, tgt, cmd))}</p><div class="dw-gauges">${dwGaugesHtml(prof, tgt, cmd, pack, true)}</div>`;
  h += dwManaHtml(prof, tgt, cmd) + dwBracketHtml(prof, set) + dwBudgetHtml(prof, set);
  if (typeof dsimEnsure === 'function') h += `<div id="daSim">${DSIM.res && DSIM.sig === dsimSig(DA.X) ? (DSIM.res.none ? '' : dsimHtml(DSIM.res)) : dsimHtml(null, DSIM.prog)}</div>`;
  if (typeof openDeckReport === 'function') h += `<button class="btn ghost block dw-rep" type="button" data-da-report><svg class="i" aria-hidden="true"><use href="#i-info"/></svg>${T('Rapport du coach')}</button>`;
  return h;
}
/** Points forts d'un deck (aperçu) : parties de la note au plus haut, catégories bien fournies. */
function daStrong(sc, prof, tgt, cmd) {
  const out = [], part = k => { const p = sc.parts.find(x => x.k === k); return p ? p.pts / p.max : 0; };
  const ok = DW_GAUGES.filter(([r]) => r !== 'land' && tgt[r] && tgt[r][2] > 0 && !(r === 'counter' && !cmd.ci.includes('U')) && prof[r] >= tgt[r][1]).map(([, l]) => T(l).toLowerCase());
  if (ok.length) out.push(ok.length >= 4 ? T('Bien fourni partout : {list}', { list: ok.slice(0, 3).join(', ') + '…' }) : T('Bien fourni : {list}', { list: ok.join(', ') }));
  if (part('mana') >= 0.9) out.push(T('Mana bien réglé : terrains et couleurs'));
  if (part('curve') >= 0.95) out.push(T('Courbe de mana fluide'));
  if (part('syn') >= 0.8) out.push(T('Cartes très jouées avec ce commandant'));
  return out.slice(0, 3);
}
function daPaint() {
  if (!daOpen()) return;
  const api = DA.api, X = DA.X, body = api.body, go = $('#daGo', api.foot);
  const wait = t => { body.innerHTML = `<div class="status" data-ok="0"><span class="dot"></span><span>${t}</span></div>`; if (go) go.disabled = true; };
  if (!DW.core && (DW.p || (!DW.err))) { if (!DW.p && !DW.err) dwLoad().then(daPaint).catch(daPaint); else if (DW.p) DW.p.then(daPaint, daPaint); return wait(T('Chargement de la base du coach…')); }
  const cmd = dwCmdOf(X), pack = DW.core ? (DW.cmd.has(cmd.slug) ? DW.cmd.get(cmd.slug) : null) : null;
  if (DW.core && !DW.cmd.has(cmd.slug)) { dwPack('c', cmd.slug).then(daPaint); return wait(T('Chargement des cartes conseillées…')); }
  for (const t of X.wiz.th) if (DW.core && !DW.th.has(t)) { dwPack('t', t).then(daPaint); return wait(T('Chargement des cartes conseillées…')); }
  const prof = dwProfile(X), est = dwBracketOf(prof), set = X.wiz, mode = DA.mode = !DA.mine ? 'peek' : prof.n < 100 ? 'build' : 'bilan';
  if (DA.brAuto) set.br = est;
  if (DA.budAuto) set.bud = mode === 'build' ? 0 : prof.cents;      // bilan : budget = valeur actuelle (les échanges ne font pas monter le prix) ; à compléter : sans limite
  const tgt = dwTargets(prof, cmd, pack, set); DA.ctx = { prof, tgt };
  let h = DW.err ? `<div class="status" data-ok="0"><span class="dot"></span><span>${esc(DW.err)}</span></div>` : '';
  const keep = body.scrollTop, done = label => { body.innerHTML = h; thumbsReady(body); body.scrollTop = keep; if (go) { go.disabled = false; go.textContent = label; } };
  if (mode === 'build') {      // « Compléter le deck » : réglages courts, puis la construction de l'éditeur
    const cur = mkCur();
    h += `<div class="cb-head cb-build"><div class="cb-n"><b>${prof.n}</b><small>/100<br>${T('cartes')}</small></div><div class="cb-t"><b>${esc(TN(100 - prof.n, 'Il manque {n} carte', 'Il manque {n} cartes'))}</b><span>${esc(T('Bracket {n} · {name}', { n: est, name: (DW_BRACKETS.find(b => b[0] === est) || DW_BRACKETS[2])[1] }) + ' · ' + T('estimé'))}<br>${esc(fmt(prof.cents, cur))}</span></div></div>`;
    h += `<div class="sec-title">${T('Compléter le deck')}</div><p class="hint">${T('Le coach ajoute les cartes qui manquent : rôles jusqu\'aux cibles, puis le plan du commandant, puis les terrains. Les cartes déjà là restent ; annulable.')}</p>` + daSetFormHtml(cmd, pack, set, { est, val: DA.ctx ? DA.ctx.prof.cents : 0, pfx: 'da' });
    return done(T('Compléter le deck'));
  }
  const sc = DW.core && typeof dsScore === 'function' ? dsScore(X, { cmd, pack }) : null; DA.sc = sc;
  DA.swaps = mode === 'bilan' && DW.core ? dwSwaps(X, cmd, pack, prof, tgt) : [];
  const acts = DA.acts = sc ? daActions(prof, tgt, cmd, set, DA.swaps, pack).slice(0, 3) : [];
  if (sc) h += daHeadHtml(sc, acts, prof, set, est, pack, mode === 'bilan');
  const au = typeof dwAuditParts === 'function' ? dwAuditParts(X) : null;      // ce que fait le deck (fiche du commandant, mécaniques : deckwiz.js › dwAuditParts)
  const plan = au ? `<div class="sec-title">${T('Ce que fait ton deck')}</div>${au.story}` : '';
  if (mode === 'peek') {      // aperçu d'un deck qui n'est pas à moi
    h += plan + (au ? au.rows : '');
    const strong = sc ? daStrong(sc, prof, tgt, cmd) : [], weak = acts.filter(a => a.k !== 'swap');
    h += `<div class="sec-title">${T('Points forts')}</div>${strong.length ? `<ul class="cb-pts good">${strong.map(t => `<li>${esc(t)}</li>`).join('')}</ul>` : `<p class="hint">${T('Rien qui ressorte nettement.')}</p>`}`;
    h += `<div class="sec-title">${T('Points faibles')}</div>${weak.length ? `<ul class="cb-pts warn">${weak.map(a => `<li><b>${esc(a.t)}</b> <small>${esc(a.s)}</small></li>`).join('')}</ul>` : `<p class="hint">${T('Aucun manque net.')}</p>`}`;
    h += daSimCard() + `<p class="hint">${T('Ajoute-le à tes decks pour voir les échanges conseillés et l\'améliorer.')}</p>`;
    h += daFold('det', DA.detOpen, T('Détail'), T('Note, équilibre, mana, simulation'), sc ? daDetailHtml(sc, prof, tgt, cmd, pack, set) : '');
    h += daSetLine(cmd, pack, set, est);
    done(T('Ajouter à mes decks')); daSimRun(); return;
  }
  // bilan d'un deck de Mes decks
  // lu d'un coup d'œil : la note, ce qu'il faut faire, ce que fait le deck (plan court ; points détaillés repliés), la simulation, puis les échanges et le détail repliés
  h += `<div class="sec-title">${T('À faire en priorité')}</div>` + (acts.length ? `<div class="cb-acts">${acts.map(daActHtml).join('')}</div>` : `<p class="hint">${sc && sc.total >= 85 ? T('Rien d\'urgent : le deck est bien équilibré.') : T('Rien d\'urgent à changer.')}</p>`);
  h += plan;
  if (au && au.rows) h += daFold('plan', DA.planOpen, T('Points du plan'), [au.warn ? TN(au.warn, '{n} point à revoir', '{n} points à revoir') : T('rien à revoir'), au.good ? TN(au.good, '{n} point en place', '{n} points en place') : ''].filter(Boolean).join(' · '), au.rows);
  h += daSimCard();
  const on = DA.swaps.filter((s, i) => !DA.off.has(i));
  let after = null;
  if (sc && on.length) { const m = new Map([...X.main].map(([k, c]) => [k, { ...c }])); for (const s of on) { const o = m.get(s.out.k); if (o && o.qty > 1) o.qty--; else m.delete(s.out.k); m.set(s.in.k, { key: s.in.k, name: s.in.name, qty: 1 }); } after = dsScore({ main: m, cmdr: X.cmdr, wiz: X.wiz }, { cmd, pack }).total; }
  const swSum = !DW.core ? T('Sans la base du coach, pas d\'échanges conseillés.') : !DA.swaps.length ? T('Aucun') : [TN(DA.swaps.length, '{n} échange', '{n} échanges'), sc && after != null && after !== sc.total ? T('note {a} → {b}', { a: sc.total, b: after }) : '', (() => { const dl = on.reduce((a, s) => a + s.in.price - s.out.price, 0); return dl ? (dl > 0 ? '+' : '−') + fmt(Math.abs(dl), mkCur()) : ''; })()].filter(Boolean).join(' · ');
  let sw = '';
  if (DA.swOpen) {
    if (!DA.swaps.length) sw = `<p class="hint">${!pack ? T('Ce commandant n\'est pas encore dans la base du coach : pas d\'avis sur ses cartes.') : T('Rien à changer : les cartes du deck sont bien jouées avec ce commandant.')}</p>`;
    else {
      const delta = on.reduce((a, s) => a + s.in.price - s.out.price, 0), cur = mkCur();
      sw = `<p class="hint">${esc(T('Coche ceux qui te plaisent, puis ouvre le deck dans l\'éditeur pour les appliquer. Touche une carte pour l\'agrandir.'))}</p><div class="da-sws">${DA.swaps.map((s, i) => daSwapRow(s, i, cmd)).join('')}</div>`
        + `<p class="dw-line da-delta"><span>${T('Après ces échanges')}</span><b>${esc(fmt(prof.cents + delta, cur))}</b><small>${esc((delta >= 0 ? '+' : '−') + fmt(Math.abs(delta), cur))}</small></p>`;
      if (DA.swaps.some(s => !dmOf(s.in.k))) { DA.tries = 0; setTimeout(daMeta, 0); }
    }
  }
  h += daFold('sw', DA.swOpen, T('Échanges conseillés'), swSum, sw, 'data-da-swt');
  h += daFold('det', DA.detOpen, T('Détail'), T('Note, équilibre, mana, simulation'), sc ? daDetailHtml(sc, prof, tgt, cmd, pack, set) : '');
  h += daSetLine(cmd, pack, set, est);
  const n = DA.swaps.length - DA.off.size;
  done(n > 0 ? TN(n, 'Ouvrir dans l\'éditeur avec {n} échange', 'Ouvrir dans l\'éditeur avec {n} échanges') : T('Ouvrir dans l\'éditeur'));
  daSimRun();
}
/** Section repliable du bilan (échanges, détail). */
const daFold = (id, open, title, sum, inner, attr) => `<section class="cb-fold${open ? ' open' : ''}">${dwFoldHead(id, !!open, title, sum, attr || `data-da-fold="${id}"`)}${open ? `<div class="cb-in">${inner}</div>` : ''}</section>`;
/** Simulation de parties (decksim.js) : lancée à l'ouverture du bilan ou de l'aperçu, résumée en trois chiffres sous les actions, en entier dans le détail et le rapport. */
function daSimRun() {
  if (typeof dsimEnsure !== 'function' || !DW.core) return;
  dsimEnsure(DA.X, () => {
    if (!daOpen()) return; const b = DA.api.body, el = $('#daSim', b), card = $('#daSimCard', b);
    if (el) el.innerHTML = DSIM.res ? (DSIM.res.none ? '' : dsimHtml(DSIM.res)) : dsimHtml(null, DSIM.prog);
    if (card) card.outerHTML = daSimCard();
  });
}
/** Résumé de la simulation : mains gardées, commandant à temps, couleurs (quand elles bloquent) ou adversaire éliminé ; « Rapport du coach » pour le reste. */
function daSimCard() {
  if (typeof dsimEnsure !== 'function' || !DW.core) return '';
  const r = DSIM.sig === dsimSig(DA.X) ? DSIM.res : null; if (r && r.none) return '';
  const tile = (ok, v, t) => `<span class="cb-st ${ok ? 'ok' : 'warn'}"><b>${esc(v)}</b><small>${esc(t)}</small></span>`;
  const body = !r ? `<span class="ds-big"><i style="width:${Math.round((DSIM.prog || 0) * 100)}%"></i></span><small class="cb-sim-w">${T('Parties en cours…')}</small>`
    : `<div class="cb-sts">${tile(r.keep7 >= 74, dsimPct(r.keep7), T('mains de départ gardées'))}${r.cmv ? tile(r.cmdOn >= 55, dsimPct(r.cmdOn), T('commandant lancé à temps')) : tile(r.miss3 <= 20, dsimPct(r.miss3), T('parties sans terrain avant le tour 4'))}${r.screw4 > 10 || r.elim10 == null || r.blind ? tile(r.screw4 <= 10, dsimPct(r.screw4), T('parties bloquées par les couleurs')) : tile(r.kill10 >= 20, dsimPct(r.kill10), T('parties où un adversaire tombe avant le tour 11'))}</div>`;      // 3e case : les couleurs quand elles bloquent ou quand la simulation ne joue pas le plan du deck (voltron, ninjutsu…), sinon la table
  return `<div class="cb-sim" id="daSimCard"><p class="cb-sim-h"><b>${T('Simulation de {n} parties', { n: nf0(DSIM_N) })}</b><small>${T('10 premiers tours joués par le coach, face à 3 adversaires')}</small></p>${body}${typeof openDeckReport === 'function' ? `<button class="link-btn link-inline cb-rep" type="button" data-da-report>${T('Rapport du coach et simulation complète')}</button>` : ''}</div>`;
}
/** Réglage changé (formulaire partagé) : bracket ou budget choisis ne suivent plus la liste ; gardés pour un deck de Mes decks ; le bilan suit. */
function daSetChanged(kind) {
  DA.brAuto = !!DA.X.wiz.ba; DA.budAuto = !!DA.X.wiz.bv;
  DA.off.clear(); daPersist(); daPaint();
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
    <span class="da-why">${(() => { const [hd, ...more] = daWhyParts(s, cmd); return `<b class="da-wh">${esc(hd)}</b>${d ? ` <i class="da-px ${d > 0 ? 'up' : 'down'}">${esc((d > 0 ? '+' : '−') + fmt(Math.abs(d), cur))}</i>` : ''}${more.length ? `<small>${esc(more.slice(0, 2).join(' · '))}</small>` : ''}`; })()} <button class="link-btn link-inline" type="button" data-da-why="${i}" aria-expanded="${!!open}">${T('Pourquoi ?')}</button></span>
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
  const f = e.target.closest('[data-da-fold]'); if (f) { if (f.dataset.daFold === 'det') DA.detOpen = !DA.detOpen; else if (f.dataset.daFold === 'plan') DA.planOpen = !DA.planOpen; haptic('tap'); daPaint(); return; }      // « Détail » replié ou déplié
  if (e.target.closest('[data-da-swt]')) { DA.swOpen = !DA.swOpen; haptic('tap'); daPaint(); return; }      // replier / déplier les échanges conseillés
  const a = e.target.closest('[data-cb-act]'); if (a) { haptic('tap'); daActGo(DA.acts[Number(a.dataset.cbAct)]); return; }
  const w = e.target.closest('[data-da-why]'); if (w) { const i = Number(w.dataset.daWhy); if (DA.why.has(i)) DA.why.delete(i); else DA.why.add(i); haptic('tap'); daPaint(); return; }
  const sw = e.target.closest('.da-sw'); if (sw && !e.target.closest('input, [data-zoom], .da-wd, button')) { const c = $('input[data-da-sw]', sw); if (c) { c.checked = !c.checked; c.dispatchEvent(new Event('change', { bubbles: true })); } }      // toute la ligne coche, sauf la vignette (agrandie)
}
function daChange(e) {
  const t = e.target;
  if (t.dataset && t.dataset.daSw != null) { const i = Number(t.dataset.daSw); if (t.checked) DA.off.delete(i); else DA.off.add(i); haptic('tap'); daPaint(); }
}
/** Action prioritaire touchée : échange → l'éditeur avec lui ; catégorie qui manque → l'éditeur, onglet Coach, suggestions de cette catégorie ; prix au-dessus de la limite → les échanges ; le reste → le détail. */
function daActGo(a) {
  if (!a) return;
  if (a.k === 'swap') { const i = DA.swaps.findIndex(s => s.out.k === DA.swaps[0].out.k); DA.off = new Set(DA.swaps.map((s, j) => j).filter(j => j !== i)); return daApply(); }
  if (a.k === 'budget') { DA.swOpen = true; daPaint(); const el = $('[data-da-swt]', DA.api.body); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
  if (DA_ROLE[a.k] || a.k === 'land') { DA.off = new Set(DA.swaps.map((s, j) => j)); return daApply(a.k); }
  DA.detOpen = true; daPaint(); const el = $('[data-da-fold="det"]', DA.api.body); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
/** Deck de Mes decks : réglages gardés comme ceux du coach (même deck, mêmes thèmes, bracket et budget). */
function daPersist() { if (DA.id) dwSettingsSave(DA.id, DA.X.wiz); }
/** Réglages passés à l'éditeur : le budget « valeur actuelle » du bilan n'y est pas une limite (sinon rien ne pourrait s'ajouter) ; un budget choisi, oui. */
const daEdWiz = set => { const w = { ...set }; if (w.bv) w.bud = 0; return w; };
/** Ouvre le deck dans l'éditeur, onglet Coach, avec les échanges cochés (role : suggestions de cette catégorie dépliées). Deck qui n'est pas à moi : nouveau deck. */
function daApply(role) {
  const sw = DA.swaps.filter((s, i) => !DA.off.has(i)).map(s => [s.out.k, s.in.k, s.in.name]), wiz = daEdWiz(DA.X.wiz);
  const id = DA.id && findDeck(DA.id) ? DA.id : null, text = DA.text, name = DA.name, label = sw.length === 1 ? DA.swaps.find(s => s.out.k === sw[0][0]) : null;
  if (DA.api) DA.api.close(); haptic('ok');
  if (typeof closeDeckViewer === 'function') closeDeckViewer();
  setTimeout(() => {
    openBuilder(id ? { id, swaps: sw, wiz, tab: 'coach' } : { name, fmt: 'commander', text, swaps: sw, wiz, tab: 'coach' });
    if (sw.length) toast(label ? T('Échange appliqué : {a} → {b} · à enregistrer', { a: bdLabel(label.out.k, label.out.name), b: bdLabel(label.in.k, label.in.name) }) : TN(sw.length, '{n} échange appliqué · à enregistrer', '{n} échanges appliqués · à enregistrer'));
    if (role) setTimeout(() => { if (!BD.el) return; DW.seenEl = BD.el; DW.open = role; DW.shown = 8; bdList(); const g = $(`[data-act="dw-g"][data-r="${role}"]`, BD.el); if (g) g.scrollIntoView({ block: 'center' }); }, 120);      // suggestions de la catégorie qui manque
  }, 260);
}
/** « Compléter le deck » : l'éditeur, onglet Coach, avec ces réglages, puis la construction du coach (deckopt.js › dsBuild : versions au choix, annulable). */
function daBuild() {
  const id = DA.id, wiz = daEdWiz(DA.X.wiz); if (!id || !findDeck(id)) return;
  daPersist(); if (DA.api) DA.api.close(); haptic('ok');
  if (typeof closeDeckViewer === 'function') closeDeckViewer();
  setTimeout(() => { DW.autoNext = true; openBuilder({ id, wiz, tab: 'coach' }); }, 260);      // construction lancée par l'onglet Coach dès que les cartes conseillées sont lues (deckwiz.js › dwCoachHtml)
}
/** « Ajouter à mes decks » (aperçu) : le deck rejoint Mes decks (origine notée : suivi des cartes manquantes), puis son bilan s'affiche ici. */
function daAdd() {
  let text = DA.text; if (DA.from && typeof dkSetMeta === 'function') text = dkSetMeta(text, 'from', DA.from);
  if (typeof dkFormat === 'function' && !dkFormat(text)) text = dkSetFormat(text, 'commander');
  const id = newIdFor(); putDeck(id, deckDoc({ name: DA.name.slice(0, 120), text, opts: { ...S.opts } })); DA.text = text;
  haptic('ok'); toast(T('Ajouté à Mes decks'));
  daOwn(id); DA.swOpen = false; daPaint(); DA.api.body.scrollTop = 0;
}
if (typeof module !== 'undefined' && module.exports) Object.assign(module.exports, { dwBracketOf });

/* ── Réglages du coach d'un deck : formulaire partagé (bilan du coach, « Modifier le deck ») ─────────────────────────────────────────
   Bracket visé (« Auto » : le bracket estimé de la liste, suivi tant qu'on n'en choisit pas un), limite de prix (vide : sans limite), thèmes (3 au plus),
   priorité à la collection. Gardés par deck comme ceux de l'éditeur (deckwiz.js › dwSettingsFor ; ba : bracket automatique). */
/** Des réglages ont-ils été enregistrés pour ce deck ? */
const daSaved = id => { if (!id) return false; try { return !!localStorage.getItem(DW_SET + id); } catch (e) { return false; } };
function dwSettingsSave(id, wiz) { if (!id || !wiz) return; try { localStorage.setItem(DW_SET + id, JSON.stringify(wiz)); } catch (e) { /* stockage refusé : pour cette session */ } }
/** Formulaire (HTML). o : { est (bracket estimé, null si inconnu), val (valeur du deck, centimes : budget « valeur actuelle », bv), cur (devise), pfx (préfixe des identifiants), loading }. */
function daSetFormHtml(cmd, pack, set, o = {}) {
  const th = cmd ? dwThemeChoices(cmd, pack, set) : [], cur = o.cur || mkCur(), p = o.pfx || 'ds', auto = !!set.ba, br = auto && o.est ? o.est : set.br;
  const chip = (on, attr, label) => `<button type="button" class="chip${on ? ' on' : ''}" ${attr} aria-pressed="${on}">${label}</button>`;
  return `<div class="dw-set ds-form"><p class="label">${T('Bracket visé')}</p><div class="dw-chips">${chip(auto, 'data-ds-br="auto"', esc(o.est ? T('Auto · {n}', { n: o.est }) : T('Auto')))}${DW_BRACKETS.map(b => chip(!auto && set.br === b[0], `data-ds-br="${b[0]}"`, `${b[0]} · ${esc(b[1])}`)).join('')}</div>
    <p class="hint">${esc(auto ? T('Le bracket estimé d\'après la liste, mis à jour quand elle change.') : T((DW_BRACKETS.find(b => b[0] === br) || DW_BRACKETS[2])[2]))}</p>
    <div class="field-in"><label class="label" for="${p}Bud">${T('Limite de prix du deck ({c})', { c: cur })}</label><input type="number" id="${p}Bud" data-ds-bud inputmode="decimal" min="0" step="10" placeholder="${esc(set.bv && o.val ? T('Valeur actuelle : {p}', { p: fmt(o.val, cur) }) : T('Sans limite'))}" value="${set.bud > 0 && !set.bv ? Math.round(set.bud / 100) : ''}"></div>${set.bv && o.val ? `<p class="hint">${T('Vide : la valeur actuelle du deck, les échanges ne le font pas monter.')}</p>` : ''}
    ${th.length ? `<p class="label">${T('Thèmes (3 au plus)')}</p><div class="dw-chips">${th.map(([slug, label]) => chip(set.th.includes(slug), `data-ds-th="${esc(slug)}"`, esc(label))).join('')}</div>` : cmd && !pack && o.loading ? `<p class="hint">${T('Chargement des thèmes…')}</p>` : ''}
    <label class="me-row switch-row" for="${p}Own"><span class="me-t">${T('Priorité à ma collection')}<small>${T('Les cartes que tu possèdes passent devant dans les suggestions')}</small></span><span class="switch"><input type="checkbox" id="${p}Own" data-ds-own ${set.own ? 'checked' : ''}><i></i></span></label></div>`;
}
/** Branche le formulaire monté dans box sur set (modifié en place) ; change(kind) après chaque changement ('br', 'th', 'bud', 'own'). */
function daSetFormBind(box, set, change) {
  box.addEventListener('click', e => {
    const b = e.target.closest('[data-ds-br]');
    if (b) { const v = b.dataset.dsBr; if (v === 'auto') set.ba = 1; else { delete set.ba; set.br = Number(v) || 3; } haptic('tap'); change('br'); return; }
    const t = e.target.closest('[data-ds-th]');
    if (t) { const v = t.dataset.dsTh, i = set.th.indexOf(v); if (i >= 0) set.th.splice(i, 1); else if (set.th.length < 3) set.th.push(v); else { toast(T('3 thèmes au plus')); return; } haptic('tap'); change('th'); }
  });
  box.addEventListener('change', e => {
    const t = e.target;
    if (t.matches('[data-ds-bud]')) { const v = String(t.value).trim(); if (!v && set.bv) return; delete set.bv; set.bud = Math.max(0, Math.round(Number(v.replace(',', '.')) || 0)) * 100; change('bud'); }
    else if (t.matches('[data-ds-own]')) { set.own = t.checked; change('own'); }
  });
}
/** Commandant et cartes conseillées d'une liste, pour le formulaire : { X, cmd, pack, est } ; null sans commandant. ready() : rappelé quand ce qui manquait est lu. */
function daSetCtx(text, ready) {
  const X = daDeckOf(String(text || '')); if (!X.cmdr.length) return null;
  if (!DW.core) { dwLoad().then(ready, () => {}); return { X, cmd: null, pack: null, est: null, loading: true }; }
  const cmd = dwCmdOf(X), has = DW.cmd.has(cmd.slug);
  if (!has) dwPack('c', cmd.slug).then(ready, () => {});
  const prof = dwProfile(X);
  return { X, cmd, pack: has ? DW.cmd.get(cmd.slug) : null, est: dwBracketOf(prof), val: prof.cents, loading: !has };
}
