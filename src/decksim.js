/* ── decksim.js : 1 000 débuts de partie joués seul avec un deck Commander (rapport du coach, fonctionnalité en test « deckwiz ») ───────────────
   Chaque partie : mélange, main de 7 (mulligan « London » si moins de 2 ou plus de 5 terrains, 2 au plus), puis 8 tours sans adversaire : un terrain
   par tour (celui qui apporte une couleur qui manque d'abord), le commandant dès qu'il est payable, la rampe ensuite (source de mana dès le tour suivant),
   puis les sorts les plus chers payables. Le paiement tient compte des couleurs : chaque symbole prend une source qui produit sa couleur (les sources
   les moins polyvalentes d'abord), le reste en mana générique ; un symbole hybride compte comme générique. Une partie sur deux commence (pas de pioche
   au tour 1). Résultats : mains gardées, commandant à temps, terrains manqués, mains bloquées par les couleurs, mana utilisé, sorts lancés. Graine fixe
   (même deck, mêmes résultats). Aucune IA : du hasard et des règles simples. */
const DSIM = { sig: '', res: null, run: null }, DSIM_N = 10000;      // 10 000 parties : ≈ 2 s sur un téléphone moyen, pourcentages stables à ±1 point
/** Cartes du deck X pour la simulation : bibliothèque (99 cartes ou moins) et commandant(s). */
function dsimDeck(X) {
  const cmd = dwCmdOf(X), ci = cmd ? [...cmd.ci] : [], lib = [];
  const spec = (k, name) => {
    const x = dwCard(k) || {}, m = dmOf(k) || {}, land = BASIC_NAMES.has(k) || !!((x.roles || 0) & DW_RB.land);
    const pv = dwPips(m.mc || x.mc || ''), pips = {}; let gen = 0;
    for (const [c, n] of Object.entries(pv)) { const f = Math.floor(n + 1e-9); if (f) pips[c] = f; gen += n - f; }      // hybride (demi-symboles) : générique
    const cmc = Number.isFinite(x.cmc) ? x.cmc : Number(m.cm) || 0, bc = dwBasicColor(k);
    let prod = new Set([...(land ? bc || String(x.prod || '') : String(x.prod || ''))].filter(c => 'WUBRGC'.includes(c)));
    const ramp = !land && !!((x.roles || 0) & DW_RB.ramp);
    if (land && !prod.size) prod = new Set(['C']);      // terrain utilitaire : mana incolore
    if (ramp && !prod.size) prod = new Set(ci.length ? ci : ['C']);      // rampe qui cherche des terrains (Cultivate…) : les couleurs du deck
    return { k, n: name, land, cmc, pips, gen: Math.round(gen), prod: [...prod], ramp };
  };
  for (const c of X.main.values()) { const s = spec(c.key, c.name); for (let i = 0; i < c.qty; i++) lib.push(s); }
  return { lib, cmdr: X.cmdr.map(c => spec(c.key, c.name)) };
}
/** Paie un sort avec les sources disponibles (tableau de listes de couleurs) : sources restantes, ou null si impossible. */
function dsimPay(avail, s) {
  let left = avail.slice(), colored = 0;
  for (const [c, n] of Object.entries(s.pips).sort((a, b) => left.filter(p => p.includes(a[0])).length - left.filter(p => p.includes(b[0])).length)) {
    for (let i = 0; i < n; i++) {
      let bi = -1; for (let j = 0; j < left.length; j++) if (left[j].includes(c) && (bi < 0 || left[j].length < left[bi].length)) bi = j;
      if (bi < 0) return null; left.splice(bi, 1); colored++;
    }
  }
  const rest = Math.max(0, s.cmc - colored); if (left.length < rest) return null;
  left.sort((a, b) => a.length - b.length); return left.slice(rest);      // le générique prend d'abord les sources les moins polyvalentes
}
const dsimRng = seed => () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
function dsimShuffle(a, rnd) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
/** Une partie : statistiques de cette partie. */
function dsimGame(D, rnd, onPlay, stuck) {
  let lib, hand, mull = 0;
  for (;;) {
    lib = dsimShuffle(D.lib.slice(), rnd); hand = lib.splice(0, 7);
    const L = hand.filter(c => c.land).length;
    if ((L >= 2 && L <= 5) || mull >= 2) break;
    mull++;
  }
  for (let i = 0; i < mull; i++) {      // London : autant de cartes sous la bibliothèque que de mulligans (terrains en trop, sinon le sort le plus cher)
    const L = hand.filter(c => c.land).length, pickLand = L > 4;
    let bi = -1; hand.forEach((c, j) => { if (c.land === pickLand && (bi < 0 || (!pickLand && c.cmc > hand[bi].cmc))) bi = j; });
    if (bi < 0) bi = hand.length - 1; lib.push(hand.splice(bi, 1)[0]);
  }
  const lands0 = hand.filter(c => c.land).length, field = [], pending = [];
  let cmdTurn = 0, missed3 = false, missed4 = false, screw4 = false, avail16 = 0, spent16 = 0, cast6 = 0;
  const cmdLeft = D.cmdr.slice();
  for (let t = 1; t <= 8; t++) {
    if (!(t === 1 && onPlay) && lib.length) hand.push(lib.shift());
    field.push(...pending.splice(0));
    const lands = hand.filter(c => c.land);
    if (lands.length) {      // le terrain qui apporte une couleur demandée par la main et pas encore produite, sinon le plus polyvalent
      const want = new Set(); for (const c of [...hand, ...cmdLeft]) for (const col of Object.keys(c.pips || {})) if (!field.some(p => p.includes(col))) want.add(col);
      const l = lands.sort((a, b) => b.prod.filter(x => want.has(x)).length - a.prod.filter(x => want.has(x)).length || b.prod.length - a.prod.length)[0];
      hand.splice(hand.indexOf(l), 1); field.push(l.prod);
    } else { if (t <= 3) missed3 = true; if (t <= 4) missed4 = true; }
    let avail = field.slice(); const total = avail.length; let spent = 0;
    const cast = s => { const r = dsimPay(avail, s); if (!r) return false; spent += avail.length - r.length; avail = r; return true; };
    for (const c of cmdLeft.slice()) if (cast(c)) { cmdLeft.splice(cmdLeft.indexOf(c), 1); if (!cmdTurn) cmdTurn = t; }
    for (const s of hand.filter(c => !c.land && c.ramp).sort((a, b) => a.cmc - b.cmc)) if (cast(s)) { hand.splice(hand.indexOf(s), 1); pending.push(s.prod); if (t <= 6) cast6++; }
    for (const s of hand.filter(c => !c.land).sort((a, b) => b.cmc - a.cmc)) if (s.cmc <= avail.length && cast(s)) { hand.splice(hand.indexOf(s), 1); if (t <= 6) cast6++; }
    if (t === 4 || t === 5) for (const s of hand) if (!s.land && s.cmc <= total && !dsimPay(field.slice(), s)) { if (t === 4) screw4 = true; stuck.set(s.n, (stuck.get(s.n) || 0) + (t === 5 ? 1 : 0)); }      // assez de mana, pas les bonnes couleurs
    if (t <= 6) { avail16 += total; spent16 += Math.min(total, spent); }
  }
  return { mull, lands0, cmdTurn, missed3, missed4, screw4, eff: avail16 ? spent16 / avail16 : 0, cast6 };
}
/** n parties (par paquets de 100, sans bloquer l'écran) : résultats agrégés. step(fait, total) : progression. */
async function dsimRun(X, n = 1000, step) {
  const D = dsimDeck(X); if (D.lib.length < 40) return null;
  let seed = 7; for (const k of D.lib.map(c => c.k).sort()) for (let i = 0; i < k.length; i++) seed = (seed * 31 + k.charCodeAt(i)) | 0;
  const rnd = dsimRng(seed), stuck = new Map(), cmv = Math.max(0, ...D.cmdr.map(c => c.cmc));
  const acc = { keep7: 0, mull: 0, lands0: 0, cmdT: 0, cmdOn: 0, cmdNever: 0, miss3: 0, miss4: 0, screw4: 0, eff: 0, cast6: 0 };
  for (let i = 0; i < n; i++) {
    const g = dsimGame(D, rnd, i % 2 === 0, stuck);
    acc.keep7 += g.mull === 0; acc.mull += g.mull; acc.lands0 += g.lands0; acc.cmdT += g.cmdTurn || 9; acc.cmdOn += g.cmdTurn && g.cmdTurn <= Math.max(1, cmv) ? 1 : 0; acc.cmdNever += !g.cmdTurn;
    acc.miss3 += g.missed3; acc.miss4 += g.missed4; acc.screw4 += g.screw4; acc.eff += g.eff; acc.cast6 += g.cast6;
    if (i % 250 === 249) { if (step) step(i + 1, n); await new Promise(r => setTimeout(r, 0)); }      // par paquets de 250 : l'écran reste fluide pendant le calcul
  }
  const pct = v => Math.round(v / n * 100);
  return { n, cmv, keep7: pct(acc.keep7), mull: acc.mull / n, lands0: acc.lands0 / n, cmdT: acc.cmdT / n, cmdOn: pct(acc.cmdOn), cmdNever: pct(acc.cmdNever), miss3: pct(acc.miss3), miss4: pct(acc.miss4), screw4: pct(acc.screw4), eff: Math.round(acc.eff / n * 100), cast6: acc.cast6 / n,
    stuck: [...stuck].filter(([, v]) => v / n >= 0.04).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([name, v]) => [name, pct(v)]) };
}
const dsimSig = X => [...X.cmdr.map(c => c.key), ...[...X.main.values()].map(c => c.key + ':' + c.qty).sort()].join('|');
const dsimNum = v => Number(v).toLocaleString(LOC(), { maximumFractionDigits: 1 });
/** Section du rapport : résultats (ou barre de progression pendant le calcul). */
function dsimHtml(r, prog) {
  let h = `<div class="sec-title">${T('Simulation de {n} parties', { n: nf0(DSIM_N) })}</div><p class="hint">${T('Le coach a joué seul les 8 premiers tours avec ce deck, {n} fois : mains de départ, terrains, couleurs, commandant. Des règles simples et du hasard, sans adversaire.', { n: nf0(DSIM_N) })}</p>`;
  if (!r) return h + `<div class="ds-prog"><span class="ds-big"><i style="width:${Math.round((prog || 0) * 100)}%"></i></span><p class="ds-now">${T('Parties en cours…')}</p></div>`;
  const row = (ok, big, t, sub) => `<li class="${ok ? 'ok' : 'warn'}"><b>${esc(big)}</b> ${esc(t)}${sub ? ` <small>${esc(sub)}</small>` : ''}</li>`;
  h += `<ul class="bd-issues ds-sim">
    ${row(r.keep7 >= 80, r.keep7 + ' %', T('des mains de 7 cartes gardées'), T('{l} terrains en moyenne dans la main gardée', { l: dsimNum(r.lands0) }))}
    ${r.cmv ? row(r.cmdOn >= 55, r.cmdOn + ' %', T('commandant lancé à temps (tour {t} ou avant)', { t: r.cmv }), T('tour {t} en moyenne', { t: dsimNum(r.cmdT) }) + (r.cmdNever ? ' · ' + T('jamais avant le tour 9 : {p} %', { p: r.cmdNever }) : '')) : ''}
    ${row(r.miss3 <= 20, r.miss3 + ' %', T('des parties sans terrain à poser avant le tour 4'), T('{p} % avant le tour 5', { p: r.miss4 }))}
    ${row(r.screw4 <= 10, r.screw4 + ' %', T('des parties bloquées par les couleurs au tour 4'), T('assez de mana, pas la bonne couleur'))}
    ${row(r.eff >= 70, r.eff + ' %', T('du mana disponible utilisé (tours 1 à 6)'), T('{n} sorts lancés en moyenne', { n: dsimNum(r.cast6) }))}</ul>`;
  if (r.stuck.length) h += `<p class="dr-p"><b>${T('Souvent bloquées par les couleurs')} :</b> ${r.stuck.map(([n, p]) => drCard(ownKey(n), n) + ` <small>(${p} %)</small>`).join(', ')}</p>`;
  const adv = [];
  if (r.keep7 < 80) adv.push(T('Trop de mains à refaire : vise 36 à 38 terrains, ou ajoute de la rampe à 2 mana ou moins.'));
  if (r.miss3 > 20) adv.push(T('Terrains manqués trop souvent : un ou deux terrains de plus, ou de la pioche pas chère.'));
  if (r.screw4 > 10) adv.push(T('Couleurs mal servies : remplace des terrains de base par des terrains qui produisent plusieurs couleurs.'));
  if (r.cmv && r.cmdOn < 55) adv.push(T('Commandant souvent en retard : plus de rampe à 2 mana ou moins.'));
  if (r.eff < 70) adv.push(T('Mana souvent inutilisé : plus de sorts à 2 et 3 mana.'));
  if (adv.length) h += `<ul class="dr-ul">${adv.map(a => `<li>${esc(a)}</li>`).join('')}</ul>`;
  return h;
}
/** Lance la simulation pour le deck X si son résultat n'est pas déjà là ; done() quand elle avance ou finit. */
function dsimEnsure(X, done) {
  const sig = dsimSig(X);
  if (DSIM.sig === sig && (DSIM.res || DSIM.run)) return DSIM.res;
  DSIM.sig = sig; DSIM.res = null; DSIM.prog = 0;
  const tok = DSIM.run = {};      // jeton de cette simulation (créé avant : la 1re progression arrive avant que dsimRun rende la main)
  dsimRun(X, DSIM_N, (i, n) => { if (DSIM.run === tok) { DSIM.prog = i / n; done(); } }).then(r => { if (DSIM.run === tok) { DSIM.res = r || { none: true }; DSIM.run = null; done(); } }, () => { if (DSIM.run === tok) { DSIM.run = null; DSIM.res = { none: true }; done(); } });
  return null;
}
if (typeof module !== 'undefined' && module.exports) Object.assign(module.exports, { dsimPay, dsimRng });
