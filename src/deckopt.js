/* ── deckopt.js : note du coach (sur 100) et construction en plusieurs passes (pour tout le monde depuis le 2 novembre 2026) ─────────────────
   Note du coach : la même mesure pour la génération, l'analyse et le rapport. Rôles 30 (chaque catégorie face à sa cible), mana 25 (terrains face à la
   formule de Karsten, sources de chaque couleur face à son repère), courbe 10 (coût moyen face à sa cible), synergie 25 (part des sorts joués avec ce
   commandant ou très joués en Commander), règles et budget 10 (bracket, budget, 100 cartes).
   Construction : prix du jour et cartes conseillées lus d'abord, puis pour chaque version (équilibrée, plus agressive, plus contrôle, moins chère) une
   construction (deckwiz.js › dwAutoBuild) suivie d'une amélioration : la carte ajoutée la plus faible est échangée contre la meilleure candidate tant que
   la note monte, puis des terrains de base contre des terrains qui comblent les couleurs en manque. Barre de progression ; le joueur choisit sa version. */
const DS = { api: null, last: null };
const dsNum = (v, d = 2) => num(v, d);
const DS_PARTS = [['roles', 'Rôles', 30], ['mana', 'Mana', 25], ['curve', 'Courbe', 10], ['syn', 'Synergie', 25], ['rules', 'Règles et budget', 10]];
const dsRoleLabel = r => T((DW_GAUGES.find(g => g[0] === r) || [r, r === 'wincon' ? 'Conditions de victoire' : r])[1]);

/** Note du coach du deck X ({ main, cmdr, wiz }) : { total (0-100), raw, parts: [{ k, label, pts, max }], tips: [{ t, gain }] }. ctx : { cmd, pack, info } déjà calculés. */
function dsScore(X = BD, ctx = {}) {
  const cmd = ctx.cmd || dwCmdOf(X); if (!cmd) return null;
  const set = X.wiz || dwDefaults(), pack = ctx.pack !== undefined ? ctx.pack : (DW.cmd.get(cmd.slug) || null);
  const prof = dwProfile(X), tgt = dwTargets(prof, cmd, pack, set), info = ctx.info || dwInfo(pack, set), tips = [];
  // Rôles : chaque catégorie face à son minimum (trop au-dessus du maximum : un peu moins)
  const roles = DKW_ROLES.filter(r => r !== 'land' && tgt[r] && tgt[r][2] > 0 && !(r === 'counter' && !cmd.ci.includes('U')));
  let rs = 0;
  for (const r of roles) {
    const [lo, mid, hi] = tgt[r], v = prof[r];      // sous le minimum : jusqu'à 0,75 ; du minimum à la cible : de 0,75 à 1 ; au-delà du maximum : un peu moins
    const sc = v < lo ? 0.75 * (lo ? v / lo : 1) : v < mid ? 0.75 + 0.25 * (v - lo) / Math.max(1, mid - lo) : v > hi ? Math.max(0.4, 1 - 0.08 * (v - hi)) : 1; rs += sc;
    if (sc < 0.999) tips.push({ t: v < mid ? T('{r} : {n} pour {m} conseillées', { r: dsRoleLabel(r), n: v, m: mid }) : T('{r} : {n}, bien au-delà du repère ({m})', { r: dsRoleLabel(r), n: v, m: mid }), gain: (1 - sc) * 30 / roles.length });
  }
  const pRoles = roles.length ? 30 * rs / roles.length : 30;
  // Mana : terrains (10) et sources de chaque couleur (15)
  const dl = Math.abs(prof.land - tgt.land[1]), ls = Math.max(0, 1 - dl * 0.12);
  if (ls < 1) tips.push({ t: T('Terrains : {n} pour {m} conseillés', { n: prof.land, m: tgt.land[1] }), gain: (1 - ls) * 10 });
  const cols = [...cmd.ci].filter(c => prof.need[c] > 0); let ss = 0;
  for (const c of cols) { const sc = Math.min(1, (prof.src[c] || 0) / prof.need[c]) ** 2; ss += sc; if (sc < 0.97) tips.push({ t: T('Sources de {c} : {n} pour {m} conseillées', { c, n: Math.round(prof.src[c] || 0), m: prof.need[c] }), gain: (1 - sc) * 15 / cols.length }); }
  const pMana = 10 * ls + 15 * (cols.length ? ss / cols.length : 1);
  // Courbe : coût moyen face à sa cible
  const pl0 = info.plan, big = pl0 && typeof dmxTag === 'function' && pl0.P[dmxTag('big-creatures')] >= 1 ? 0.8 : 0;      // commandant qui veut de grosses créatures (Kaalia, Ur-Dragon : mises en jeu sans les payer) : courbe haute permise
  const [mlo, , mhi0] = tgt.mv, mhi = mhi0 + big, mv = prof.mv, dist = !prof.nonland ? 0 : mv < mlo ? mlo - mv : mv > mhi ? mv - mhi : 0, cs = Math.max(0, 1 - dist / 0.6);
  if (cs < 1) tips.push({ t: mv > mhi ? T('Courbe haute : coût moyen {v} (repère {m})', { v: dsNum(mv), m: dsNum(tgt.mv[1], 1) }) : T('Courbe très basse : coût moyen {v} (repère {m})', { v: dsNum(mv), m: dsNum(tgt.mv[1], 1) }), gain: (1 - cs) * 10 });
  const pCurve = 10 * cs;
  // Synergie : utilité de chaque sort DANS CE PLAN (deckmech.js : ce qu'il fait pour le commandant, les thèmes et les autres cartes, son rôle, sa force), ou sa
  // popularité avec ce commandant ; une carte fétiche compte comme voulue. Avec un plan : 20 points pour l'utilité, 5 pour la densité du thème (assez de cartes
  // qui le font). Sans classement (ancienne base) : la popularité seule, sur 25. Un deck atypique n'est donc pas ramené vers le deck moyen.
  const spells = [...X.main.values()].filter(c => !BASIC_NAMES.has(c.key) && !(((dwCard(c.key) || {}).roles || 0) & DW_RB.land));
  const plan = info.plan || null, deck = plan ? dmxDeck(X) : null, pets = new Set((set.pets || []).map(n => ownKey(n))), notes = [];
  let good = 0, weak = 0;
  for (const c of spells) {
    const o = info.get(c.key), x = dwCard(c.key) || {}, pop = o ? dwPop(o) : 0;
    let q = pop > 0 ? Math.min(1, pop / 0.9) : x.rank > 0 && x.rank < 1500 ? (pack ? 0.4 : 0.8) : x.rank > 0 && x.rank < 4000 ? (pack ? 0.15 : 0.5) : 0;
    if (plan) {
      const m = dmx(c.key), qq = dmxQ(m);
      if (m) q = Math.max(q, Math.min(1, dmxFit(m, plan, deck) / 0.55) * (0.75 + 0.25 * qq), x.roles ? 0.45 + 0.35 * qq : 0, qq >= 0.75 ? 0.75 : qq >= 0.5 ? 0.5 : 0);
      if (pets.has(c.key)) q = 1;
    }
    good += q * c.qty; if (q < 0.25) weak += c.qty;
  }
  const nsp = spells.reduce((a, c) => a + c.qty, 0), share = nsp ? good / nsp : 0, sy = Math.min(1, share / 0.8);
  let pSyn = nsp ? (plan ? 20 : 25) * sy : 0;
  if (sy < 1 && weak) tips.push({ t: plan ? TN(weak, '{n} carte qui sert peu le plan', '{n} cartes qui servent peu le plan') : TN(weak, '{n} carte peu jouée avec ce commandant', '{n} cartes peu jouées avec ce commandant'), gain: (1 - sy) * (plan ? 20 : 25) });
  if (plan) {      // densité du thème : les mécaniques principales du plan (demandées, ou voulues par le commandant) et le type de créature
    const dens = [];
    for (const i of plan.main.slice(0, 3)) { let k = 0; for (const c of spells) { const m = dmx(c.key); if (m && (m.p.includes(i) || m.w.includes(i))) k += c.qty; } dens.push([dmxLabel(DMX.tags[i]), k, 10]); }
    for (const [t] of plan.tribes) { let k = 0; for (const c of spells) { const m = dmx(c.key); if (m && (dmxSubHas(m, t) || m.t.includes(t))) k += c.qty; } dens.push([t, k, plan.from.get('t:' + t) === 'me' || plan.from.get('t:' + t) === 'th' ? 18 : 12]); break; }
    const d = dens.length ? dens.reduce((a, [, k, w]) => a + Math.min(1, k / w), 0) / dens.length : 1; pSyn += 5 * d;
    for (const [lab, k, w] of dens) if (k < w) tips.push({ t: TN(k, 'Thème {m} : {n} carte, {t} conseillées', 'Thème {m} : {n} cartes, {t} conseillées', { m: lab, n: k, t: w }), gain: 5 * (1 - k / w) / dens.length });
    if (pets.size) notes.push(T('Cartes fétiches comptées comme voulues, quel que soit leur niveau.'));
  }
  if (tgt.arch && ['group-hug', 'politics', 'pillow-fort', 'tribal', 'enchantress'].includes(tgt.arch)) notes.push(T('Cibles adaptées au thème ({t}) : moins de retraits ou de balayages que d\'habitude, c\'est voulu.', { t: tgt.arch === 'tribal' ? T('tribal') : dmxLabel(tgt.arch === 'pillow-fort' ? 'pillowfort' : tgt.arch === 'enchantress' ? 'enchantments' : tgt.arch) }));
  // Règles et budget
  const b = DW_BRACKETS.find(x => x[0] === set.br) || DW_BRACKETS[2]; let pr = 10;
  const rule = (bad, pts, t) => { if (bad) { pr -= pts; tips.push({ t, gain: pts }); } };
  const brBad = new Set(DWB.bracketBreaks(b[0], dwBrFacts(prof)).filter(x => x.lv === 'bad').map(x => x.k));      // règles du bracket : brackets.js (la même table que l'audit et l'éditeur)
  rule(brBad.has('gc'), 5, T('Trop de Game Changers pour le bracket {b}', { b: b[0] }));
  rule(brBad.has('mld'), 5, T('Destruction massive de terrains interdite en bracket {b}', { b: b[0] }));
  rule(brBad.has('xt'), 3, T('Trop de tours supplémentaires pour le bracket {b}', { b: b[0] }));
  rule(brBad.has('c2'), 5, T('Combo à 2 cartes interdit en bracket {b}', { b: b[0] }));
  rule(brBad.has('c3'), 3, T('Combo à 3 cartes à éviter en bracket {b}', { b: b[0] }));
  rule(!prof.wincon && prof.n >= 60, 3, T('Aucune condition de victoire : ajoute une carte qui peut finir la partie'));      // obligatoire, thème ou pas
  if (set.bud > 0 && prof.cents > set.bud) rule(true, Math.min(5, Math.ceil((prof.cents - set.bud) / set.bud * 20)), T('Au-dessus du budget de {p}', { p: fmt(prof.cents - set.bud, mkCur()) }));
  if (prof.n !== 100) rule(true, Math.min(5, Math.abs(100 - prof.n)), prof.n < 100 ? TN(100 - prof.n, 'Il manque {n} carte', 'Il manque {n} cartes') : TN(prof.n - 100, '{n} carte de trop', '{n} cartes de trop'));
  const pRules = Math.max(0, pr);
  const raw = pRoles + pMana + pCurve + pSyn + pRules, vals = { roles: pRoles, mana: pMana, curve: pCurve, syn: pSyn, rules: pRules };
  const total = Math.max(0, Math.min(100, Math.round(raw)));
  if (plan && plan.user && total < 85) notes.unshift(T('Note de {n} : deck construit autour de tes choix (thème, cartes fétiches) plutôt que du deck moyen ; les conseils ci-dessous le renforcent sans trahir le thème.', { n: total }));
  return { total, raw, parts: DS_PARTS.map(([k, label, max]) => ({ k, label: T(label), pts: vals[k], max })), tips: tips.sort((a, c) => c.gain - a.gain), notes };
}
const dsLevel = n => n >= 85 ? 'top' : n >= 70 ? 'ok' : n >= 50 ? 'mid' : 'low';
const dsVerdict = n => n >= 85 ? T('Excellent équilibre') : n >= 70 ? T('Bon deck, quelques réglages possibles') : n >= 50 ? T('Jouable, mais des manques nets') : T('Deck à retravailler');
/** Carte de la note : chiffre, verdict, détail par partie et pistes (les plus rentables d'abord). after : note après des échanges (analyse). */
function dsScoreHtml(sc, o = {}) {
  if (!sc) return '';
  const tip = sc.tips[0] ? sc.tips[0].t : dsVerdict(sc.total);
  return `<div class="ds-score ds-${dsLevel(sc.total)}"><div class="ds-n"><b>${sc.total}</b><small>/100</small></div><div class="ds-t"><b>${T('Note du coach')}${o.after != null && o.after !== sc.total ? ` <span class="ds-after">→ ${o.after}</span>` : ''}</b><small>${esc(o.after != null && o.after !== sc.total ? T('avec les échanges cochés') : tip)}</small></div></div>
    <details class="ds-parts"${o.open ? ' open' : ''}><summary>${T('Détail de la note')}</summary>${sc.parts.map(p => `<p class="ds-p"><span>${esc(p.label)}</span><span class="ds-bar"><i style="width:${Math.round(p.pts / p.max * 100)}%"></i></span><b>${Math.round(p.pts)}<small>/${p.max}</small></b></p>`).join('')}
    ${(sc.notes || []).length ? sc.notes.map(n => `<p class="hint">${esc(n)}</p>`).join('') : ''}
    ${sc.tips.length ? `<p class="label">${T('Pour gagner des points')}</p><ul class="bd-issues">${sc.tips.slice(0, 5).map(t => `<li class="warn">${esc(t.t)} <small>+${Math.max(1, Math.round(t.gain))}</small></li>`).join('')}</ul>` : `<p class="hint">${T('Rien à gagner de plus : chaque partie est au maximum.')}</p>`}</details>`;
}

/* ── Amélioration d'un deck généré (BD) : échanges carte à carte tant que la note monte ─────────────────────────────────────────── */
const dsTick = () => new Promise(r => setTimeout(r, 0));
/** mine : cartes du joueur (jamais retirées) ; maxIt : passes (échanges essayés) ; ms : temps maximal (garde-fou d'un appareil très lent) ; step(i) : progression.
 *  Retourne le nombre d'échanges gardés. Borné en passes, plus en temps (jusqu'au 5 novembre : 600 ms, soit 40 à 60 passes sur ordinateur mais 10 à 15 sur un
 *  téléphone 4 fois plus lent : note moyenne 97,4 → 96,9 avec les 3 tirages) : le même deck sur tous les appareils, et une mesure reproductible. */
const DS_OPT_IT = { draw: 45, one: 70, fill: 90 };
async function dsOptimize(mine, ms, step, maxIt = 90) {
  const cmd = dwCmdOf(); if (!cmd) return 0;
  const set = BD.wiz || dwDefaults(), pack = DW.cmd.get(cmd.slug) || null, info = dwInfo(pack, set), ctx = { cmd, pack, info };
  const score = () => dsScore(BD, ctx).raw, t0 = Date.now(), tried = new Set();
  let cur = score(), kept = 0, it = 0, ty = t0;
  const worth = (k, prof, tgt) => { const o = info.get(k), x = dwCard(k) || {}; let v = o ? dwVal(o) : x.rank > 0 ? Math.max(0, 1 - x.rank / 4000) * 0.5 : 0; if (o && o.trap && dwTrapOk(k, o, kk => BD.main.has(kk) || BD.cmdr.some(c => c.key === kk), set)) v += dwW().trap; for (const r of DKW_ROLES) if (r !== 'land' && x.roles & DW_RB[r] && tgt[r] && prof[r] <= tgt[r][0]) v += 1; return v; };
  const card = x => ({ key: x.k, name: x.name, qty: 1 });
  BD.gen = true;      // candidates tirées comme à la construction (graine, style de la version, cartes des autres versions en recul)
  try {
  while (it < maxIt && Date.now() - t0 < ms) {
    it++;
    const prof = dwProfile(), tgt = dwTargets(prof, cmd, pack, set), high = prof.nonland >= 20 && prof.mv > tgt.mv[2];      // courbe trop haute : les gros sorts peu utiles partent d'abord, des sorts moins chers les remplacent
    const w = k => worth(k, prof, tgt) - (high ? Math.max(0, ((dwCard(k) || {}).cmc || 0) - 4) * 0.25 : 0);
    let out = null, outW = Infinity;      // la plus faible (la première à valeur égale) : chaque valeur calculée une fois
    for (const c of BD.main.values()) { if (mine.has(c.key) || tried.has(c.key) || BASIC_NAMES.has(c.key) || (((dwCard(c.key) || {}).roles || 0) & DW_RB.land)) continue; const v = w(c.key); if (v < outW) { out = c; outW = v; } }
    if (!out) break; tried.add(out.key);
    const need = DKW_ROLES.filter(r => r !== 'land' && tgt[r] && prof[r] < tgt[r][1]).sort((a, b) => (prof[a] - tgt[a][1]) / Math.max(1, tgt[a][1]) - (prof[b] - tgt[b][1]) / Math.max(1, tgt[b][1]))[0] || '';
    BD.main.delete(out.key);
    const p2 = dwProfile(), seen = new Set(), cands = [...(need ? dwSuggest(need, cmd, pack, p2, tgt, 3) : []), ...dwSuggest('', cmd, pack, p2, tgt, high ? 30 : 3).filter(x => !high || x.x.cmc <= 3).slice(0, 3)].filter(x => !seen.has(x.k) && seen.add(x.k) && x.k !== out.key);
    let best = null, bestS = cur + 0.15;      // un échange doit vraiment faire monter la note
    for (const x of cands) { BD.main.set(x.k, card(x)); const s1 = score(); BD.main.delete(x.k); if (s1 > bestS) { bestS = s1; best = x; } }
    if (best) { BD.main.set(best.k, card(best)); cur = bestS; kept++; tried.add(best.k); } else BD.main.set(out.key, out);
    if (Date.now() - ty > 50) { if (step) step(it); await dsTick(); ty = Date.now(); }      // l'écran redessiné toutes les 50 ms environ (3 passes duraient 0,15 s sur téléphone)
  }
  } finally { BD.gen = false; }
  // terrains : un terrain de base de la couleur la mieux servie contre un terrain qui donne une couleur en manque
  const BK = { W: 'plains', U: 'island', B: 'swamp', R: 'mountain', G: 'forest' };
  for (let i = 0; i < 8; i++) {      // sans limite de temps (8 tours au plus, seulement tant qu'une couleur manque) : sur un appareil lent ou chargé, la boucle d'avant prenait tout le temps et les couleurs n'étaient plus corrigées (Gimli : rouge 21 sources pour 23)
    const prof = dwProfile(), tgt = dwTargets(prof, cmd, pack, set), short = [...cmd.ci].filter(c => prof.need[c] && (prof.src[c] || 0) < prof.need[c]);
    if (!short.length) break;
    const rich = [...cmd.ci].filter(c => !short.includes(c) && (BD.main.get(BK[c]) || {}).qty > 1).sort((a, b) => ((prof.src[b] || 0) - (prof.need[b] || 0)) - ((prof.src[a] || 0) - (prof.need[a] || 0)))[0];
    if (!rich) break;
    const bk = BD.main.get(BK[rich]); bk.qty--;
    BD.wide = true; let got = null;
    try { got = dwSuggest('land', cmd, pack, dwProfile(), tgt, 8).find(x => [...String(x.x.prod)].some(c => short.includes(c))); } finally { BD.wide = false; }
    if (!got) { bk.qty++; break; }
    BD.main.set(got.k, card(got)); const s1 = score();
    if (s1 > cur + 0.05) { cur = s1; kept++; } else { BD.main.delete(got.k); bk.qty++; break; }
    await dsTick();
  }
  return kept;
}

/* ── Ajustement par la simulation : le deck est joué (1 500 parties face à 3 adversaires), et ses défauts corrigés ──────────────────────────
   Trop de mains à refaire ou de terrains manqués : un sort faible contre de la rampe à 2 mana ou moins, sinon contre un terrain ; couleurs qui bloquent :
   un terrain de base contre un terrain qui donne plusieurs couleurs du deck ; commandant en retard : de la rampe pas chère ; moteur du plan souvent
   détruit par les retraits et le balayage adverses, ou beaucoup de cartes perdues : deux sorts faibles contre de la protection, sinon de la récursion ;
   table qui tient (presque jamais un adversaire éliminé) : deux sorts faibles contre des retraits (leurs bloqueurs). Chaque correction est rejouée et gardée seulement si la partie s'améliore
   nettement (dsSimVal : démarrage, adversaires éliminés, moteur qui tient, retraits adverses évités ; protection, récursion et retraits : une fois
   chacune, gardées si la partie ne se dégrade pas) et que la note du coach ne baisse pas (plus de 1,5 point). 6 essais au plus ; until : heure limite (appareil lent :
   pas d'essai qui finirait après, la première partie jouée toujours faite). */
const dsSimVal = r => r ? r.keep7 + 0.6 * r.cmdOn - r.miss3 - 1.5 * r.screw4 + 0.4 * r.eff + 0.3 * (r.blind ? 0 : r.kill10 || 0) + 0.3 * (r.engKeep == null ? 0 : r.engKeep) + 3 * (r.saved || 0) : -1e9;      // saved : retraits et balayages adverses évités par ta protection (par partie)
async function dsSimTune(mine, step, until) {
  const cmd = dwCmdOf(); if (!cmd) return { fixed: 0, r: null };
  const set = BD.wiz || dwDefaults(), pack = DW.cmd.get(cmd.slug) || null, info = dwInfo(pack, set), N = 1500;
  const ts = Date.now(); let r = await dsimRun(BD, N); if (!r) return { fixed: 0, r: null };
  const simMs = Date.now() - ts;      // durée d'un essai sur cet appareil
  let val = dsSimVal(r), note = dsScore(BD, { cmd, pack, info }).raw, fixed = 0, tries = 0;
  const BK = { W: 'plains', U: 'island', B: 'swamp', R: 'mountain', G: 'forest', C: 'wastes' };
  const card = x => ({ key: x.k, name: x.name, qty: 1 });
  const weakest = (prof, tgt, keep) => [...BD.main.values()].filter(c => !mine.has(c.key) && !BASIC_NAMES.has(c.key) && !keep(c.key)).map(c => { const x = dwCard(c.key) || {}, o = info.get(c.key); let w = o ? dwVal(o) : 0; if (x.roles & DW_RB.land) return null; for (const k of DKW_ROLES) if (k !== 'land' && x.roles & DW_RB[k] && tgt[k] && prof[k] <= tgt[k][0]) w += 1; if (x.roles & DW_RB.wincon) w += 0.5; return { c, w }; }).filter(Boolean).sort((a, b) => a.w - b.w)[0];
  const fix = kind => {
    const prof = dwProfile(), tgt = dwTargets(prof, cmd, pack, set);
    if (kind === 'ramp') {      // un sort faible contre de la rampe à 2 mana ou moins
      const out = weakest(prof, tgt, k => ((dwCard(k) || {}).roles || 0) & DW_RB.ramp); if (!out) return false;
      BD.main.delete(out.c.key);
      const x = dwSuggest('ramp', cmd, pack, dwProfile(), tgt, 30).find(c => c.x.cmc <= 2 && !(c.x.roles & DW_RB.land));
      if (!x) { BD.main.set(out.c.key, out.c); return false; } BD.main.set(x.k, card(x)); return true;
    }
    if (kind === 'protect' || kind === 'recursion' || kind === 'removal') {      // deux sorts faibles contre deux cartes de ce rôle (4 mana au plus) : un deck qui résiste mieux à la table (une seule carte : effet sous le bruit de 1 500 parties)
      const plan = typeof dmxPlan === 'function' ? dmxPlan(cmd, set) : null, pm = plan ? plan.main.slice(0, 3) : [];
      const piece = k => { const m = typeof dmx === 'function' ? dmx(k) : null; return !!m && pm.some(i => m.p.includes(i) || m.w.includes(i)); };      // pièce du moteur du plan : jamais sortie pour ça
      const has = k => (((dwCard(k) || {}).roles || 0) & (DW_RB[kind] | DW_RB.ramp | DW_RB.wincon | (kind === 'protect' ? DW_RB.counter : 0))) || piece(k); let n = 0;      // ni rampe, ni condition de victoire
      for (let i = 0; i < 2; i++) {
        const p = dwProfile(), out = weakest(p, dwTargets(p, cmd, pack, set), has); if (!out) break;
        const x = dwSuggest(kind, cmd, pack, p, tgt, 30).find(c => c.x.cmc <= 4 && !(c.x.roles & DW_RB.land) && !BD.main.has(c.k)); if (!x) break;
        BD.main.delete(out.c.key); BD.main.set(x.k, card(x)); n++;
      }
      return n > 0;
    }
    if (kind === 'land') {      // un sort faible contre un terrain (celui de la couleur la plus en manque)
      const out = weakest(prof, tgt, () => false); if (!out) return false;
      BD.main.delete(out.c.key);
      const cols = cmd.ci ? [...cmd.ci] : ['C'], c = cols.sort((a, b) => ((prof.src[a] || 0) - (prof.need[a] || 0)) - ((prof.src[b] || 0) - (prof.need[b] || 0)))[0], k = BK[c] || 'wastes', cur = BD.main.get(k);
      BD.main.set(k, { key: k, name: k[0].toUpperCase() + k.slice(1), qty: (cur ? cur.qty : 0) + 1 }); return true;
    }
    if (kind === 'fix') {      // un terrain de base de la couleur la mieux servie contre un terrain qui donne plusieurs couleurs du deck
      const cols = [...cmd.ci]; if (cols.length < 2) return false;
      const rich = cols.filter(c => (BD.main.get(BK[c]) || {}).qty > 1).sort((a, b) => ((prof.src[b] || 0) - (prof.need[b] || 0)) - ((prof.src[a] || 0) - (prof.need[a] || 0)))[0]; if (!rich) return false;
      BD.wide = true; let x = null;
      try { x = dwSuggest('land', cmd, pack, prof, tgt, 12).find(l => new Set([...String(l.x.prod)].filter(ch => cols.includes(ch))).size >= 2); } finally { BD.wide = false; }
      if (!x) return false; const b = BD.main.get(BK[rich]); b.qty--; BD.main.set(x.k, card(x)); return true;
    }
    return false;
  };
  const ROLE_FIX = new Set(['protect', 'recursion', 'removal']), done = new Set();      // une fois chacune au plus (deux cartes)
  while (tries < 6) {
    const want = [];
    if (r.keep7 < 74 || r.miss3 > 20) want.push('ramp', 'land');      // 74 % : avec 36 terrains, une main de 7 a 2 à 5 terrains 79 % du temps au mieux (loi hypergéométrique)
    if (r.screw4 > 8) want.push('fix');
    if (r.cmv && r.cmdOn < 55) want.push('ramp');
    if ((r.engKeep != null && r.eng >= 40 && r.engKeep < 0.8 * r.eng) || r.lost >= 3.5) want.push('protect', 'recursion');      // moteur souvent perdu, ou beaucoup de cartes perdues face à la table
    if (r.kill10 != null && r.elim10 != null && !r.blind && r.kill10 < 20) want.push('removal');      // la table tient : de quoi enlever leurs bloqueurs
    if (!want.some(k => !done.has(k))) break;
    let better = false;
    for (const kind of [...new Set(want)].filter(k => !done.has(k))) {
      if (tries >= 6 || (until && Date.now() + simMs > until)) break;
      const snap = dsClone(BD.main); if (!fix(kind)) { BD.main = snap; continue; }
      tries++; if (step) step(tries);
      const r2 = await dsimRun(BD, N), n2 = dsScore(BD, { cmd, pack, info }).raw;
      const role = ROLE_FIX.has(kind); if (role) done.add(kind);
      if (dsSimVal(r2) > val + (role ? -0.5 : 1.5) && n2 >= note - 1.5) { r = r2; val = dsSimVal(r2); note = Math.max(note, n2); fixed += role ? 2 : 1; better = true; break; }      // protection, récursion, retraits : gardés si la partie ne se dégrade pas (un deck qui résiste, au même niveau de jeu)
      BD.main = snap;
    }
    if (!better) break;
  }
  return { fixed, r };
}
/* ── Construction en plusieurs passes : barre de progression, versions au choix ─────────────────────────────────────────────────── */
/** Versions : chacune a sa logique de choix (deckmech.js › DMX_STYLE : mécaniques et rôles favorisés, créatures, courbe, prix), ses cibles (DW_ARCH) et sa graine ;
 *  une carte déjà prise par une version précédente recule (dwSuggest › avoid) : les versions partagent le cœur du plan, pas tout le deck. */
const DS_VARIANTS = [{ id: 'eq', name: 'Équilibrée', d: 'Le meilleur compromis pour tes réglages' }, { id: 'agg', name: 'Plus agressive', d: 'Sorts moins chers, plus de créatures, pression rapide', arch: 'aggro', style: 'aggro' }, { id: 'ctl', name: 'Plus contrôle', d: 'Plus d\'interaction et de pioche, partie plus longue', arch: 'control', style: 'control' }, { id: 'eco', name: 'Moins chère', d: 'Environ 55 % de la valeur de la version équilibrée', eco: 0.55, style: 'eco' }];
const dsClone = m => new Map([...m].map(([k, c]) => [k, { ...c }]));
/** Sorts (ni terrains ni terrains de base) d'un deck : clés. */
const dsSpells = main => [...main.keys()].filter(k => !BASIC_NAMES.has(k) && !(((dwCard(k) || {}).roles || 0) & DW_RB.land));
/** Part des sorts communs à deux decks (0 à 1). */
const dsOverlap = (a, b) => { const A = new Set(dsSpells(a)), B = dsSpells(b); return A.size + B.length ? 2 * B.filter(k => A.has(k)).length / (A.size + B.length) : 0; };
/** Tirages par version (deck vide, base avec classement) : 3 au plus. Temps donné à toute la construction (ms) : partagé entre les versions selon la vitesse
 *  mesurée de l'appareil (durée des tirages et des essais en partie déjà faits) : ordinateur 3 tirages par version ; téléphone 3 fois plus lent 2,4 en moyenne,
 *  4 fois plus lent 1,8 (5 novembre : même note que l'ordinateur, 1 à 2 points de « moteur en place » de moins). */
const DS_DRAWS = 3, DS_BUDGET = 30000;
/** Jugement d'un tirage : la note du coach, puis la partie jouée face à 3 adversaires (un adversaire éliminé avant le tour 11, moteur en place et moteur
 *  encore là au tour 10 malgré leurs retraits et le balayage : protection, retraits et récursion y comptent ; commandant à temps, mains, couleurs). */
const dsJudge = (raw, r) => { if (!r) return raw; const e = r.eng == null ? 50 : r.eng; return raw + 0.06 * (r.blind ? 0 : r.kill10 || 0) + 0.02 * e + 0.04 * (r.engKeep == null ? e : r.engKeep) + 2 * (r.saved || 0) + 0.04 * r.cmdOn + 0.03 * r.keep7 - 0.15 * r.screw4; };
/** Nouvelle graine de tirage. */
const dsSeed = () => 1 + Math.floor(Math.random() * 2e9);
/** Tirages d'une version : ce qui tient dans sa part du temps restant (left ms pour n versions), ses essais en partie compris ; 1 au moins, max au plus. */
const dsDrawsFor = (left, n, drawMs, tuneMs, max) => Math.max(1, Math.min(max, Math.round((left / Math.max(1, n) - tuneMs) / Math.max(1, drawMs))));
/** Durées mesurées sur cet appareil (dernière construction) : temps annoncé dès l'ouverture de la fenêtre. Confort seulement (stockage local, peut manquer). */
const DS_COST_KEY = 'deckdeal:dsCost';
function dsCostLoad() { try { const v = JSON.parse(localStorage.getItem(DS_COST_KEY) || 'null'); return v && v.d > 0 && v.t >= 0 ? v : null; } catch (e) { return null; } }
function dsCostSave(v) { try { localStorage.setItem(DS_COST_KEY, JSON.stringify(v)); } catch (e) { /* stockage indisponible : estimation au premier tirage */ } }
/** Génération (deckwiz.js › dwAutoBuildGen) par morceaux : l'écran est redessiné toutes les 40 ms environ (1 à 2 s de calcul sur téléphone). Faux si annulée. */
async function dsAutoBuild(alive) {
  const g = dwAutoBuildGen(undefined, true); let t = Date.now();
  try {
    while (!g.next().done) if (Date.now() - t > 40) { await dsTick(); t = Date.now(); if (!alive()) { g.return(); return false; } }
    return true;
  } finally { BD.pace = false; BD.wide = false; BD.landRes = 0; }
}
/** Construit les versions du deck de l'éditeur (BD), sans affichage : [{ v, main, wiz, sc, prof, kept, sim, fixed, story, draws }].
 *  o : { seed, empty (deck vide : 4 versions), list, budget, draws, step(v, phase, part, n, eta), alive() } ; eta : { d, k (tirage d sur k), s (secondes restantes, estimées) }.
 *  BD revient à son deck d'origine (cartes du joueur et fétiches). */
async function dsMake(o = {}) {
  const cmd = dwCmdOf(); if (!cmd) return [];
  const wiz0 = { ...(BD.wiz || dwDefaults()) }, seed = o.seed || wiz0.seed || dsSeed(), alive = o.alive || (() => true), step = o.step || (() => {});
  const empty = o.empty != null ? o.empty : dwProfile().n <= BD.cmdr.length;
  const X0 = { main: dsClone(BD.main), cmdr: BD.cmdr, wiz: wiz0 }; dwPetsInto(X0, cmd);      // cartes fétiches : dans toutes les versions, jamais retirées
  const base = X0.main, mine = new Set(base.keys()), list = o.list || (empty ? DS_VARIANTS : [{ id: 'eq', name: 'Deck complété', d: '' }]);
  const res = [], avoid = new Map(), hasMech = typeof dmxOn === 'function' && dmxOn(), t0 = Date.now(), budget = o.budget || DS_BUDGET;
  const maxK = empty && hasMech ? Math.max(1, o.draws || DS_DRAWS) : 1;      // plusieurs tirages : deck vide et base avec classement
  // durées mesurées ici (tirage : construction, amélioration, partie jouée ; essais en partie d'une version) ; avant la 1re mesure : celles de la dernière construction
  const cost = { d: [], t: [] }, prev = maxK > 1 ? dsCostLoad() : null, mean = a => a.reduce((x, y) => x + y, 0) / a.length;
  const est = () => { const d = cost.d.length ? mean(cost.d) : prev ? prev.d : 0, t = cost.t.length ? mean(cost.t) : prev && !cost.d.length ? prev.t : d * 0.6; return { d, t }; };      // avant les premiers essais en partie : 0,6 tirage
  const eta = (i, d, K) => {      // secondes restantes : ce tirage-ci et les suivants de la version, ses essais en partie, puis les versions suivantes (leur part du temps)
    const e = est(); if (!e.d) return null;
    const now = Date.now() - t0, rest = list.length - i - 1, here = Math.max(0, K - d) * e.d + e.t, after = rest ? rest * (dsDrawsFor(budget - now - here, rest, e.d, e.t, maxK) * e.d + e.t) : 0;
    return Math.max(1, Math.round(Math.min(budget * 1.1 - now, here + after) / 1000));
  };
  try {
    for (let i = 0; i < list.length; i++) {
      const v = list[i];
      let bud = wiz0.bud;
      if (v.eco) {      // moins chère : 55 % de la version équilibrée, sauf si ce budget ne laisse presque rien après le commandant
        const eqv = res[0] ? res[0].prof.cents : 0, cc = res[0] ? res[0].prof.cmdCents || 0 : 0; bud = Math.round((wiz0.bud > 0 ? Math.min(wiz0.bud, eqv) : eqv) * v.eco);
        if (!(eqv > 3000) || cc >= bud * 0.5) { step(v, 'skip', 1, 0); continue; }
      }
      // plusieurs tirages (graines) par version, chacun construit et amélioré, jugés sur la note et la partie jouée ; le meilleur continue (essais en partie).
      // Combien : la part de cette version dans le temps qui reste (versions suivantes comprises), d'après la durée mesurée des tirages et des essais en partie.
      // (Juger les tirages avant l'amélioration et n'améliorer que le meilleur, mesuré le 5 novembre : 30 % plus rapide, mais 3 tirages ainsi valent 2 tirages améliorés.)
      const left = budget - (Date.now() - t0), vEnd = Date.now() + left / (list.length - i);      // part de cette version dans le temps qui reste
      const wizOf = d => { const w = { ...wiz0, bud, seed: seed + i * 7919 + d * 104729, ...(v.arch ? { arch: v.arch } : {}), ...(v.style ? { style: v.style } : {}) }; if (!v.arch) delete w.arch; if (!v.style) delete w.style; return w; };
      let best = null, K = maxK, d = 0;
      const oit = empty ? (maxK > 1 ? DS_OPT_IT.draw : DS_OPT_IT.one) : DS_OPT_IT.fill;      // passes : 45 par tirage (≈ 0,5 s sur ordinateur), 70 seul, 90 pour compléter un deck commencé
      for (; d < K; d++) {
        if (maxK > 1 && est().d) { const e = est(); K = dsDrawsFor(left, list.length - i, e.d, e.t, maxK); if (d >= K) break; }
        if (d > 0 && Date.now() - t0 + est().d + est().t > budget) break;      // jamais au-delà du temps donné : on garde le meilleur tirage
        const td = Date.now();
        step(v, 'build', 0.3 * d / K, d, { d: d + 1, k: K, s: eta(i, d, K) }); await dsTick(); if (!alive()) return null;
        BD.main = dsClone(base); BD.wiz = wizOf(d);
        BD.avoid = empty && hasMech && avoid.size ? avoid : null;
        if (!(await dsAutoBuild(alive))) return null;
        const kept0 = await dsOptimize(mine, oit * 60, n => step(v, 'opt', 0.3 * (d + 0.5) / K + 0.05 * Math.min(1, n / oit), n, { d: d + 1, k: K, s: eta(i, d + 0.6, K) }), oit);      // garde-fou : 60 ms par passe (5 fois l'ordinateur)
        if (!alive()) return null;
        const cur = { j: null, main: dsClone(BD.main), wiz: { ...BD.wiz }, kept: kept0 };
        if (best && typeof dsimRun === 'function') {      // jugés dès le 2e tirage (le 1er rejoué à ce moment-là : rien de perdu quand il reste seul)
          if (best.j == null) { const m = BD.main, w = BD.wiz; BD.main = best.main; BD.wiz = best.wiz; best.j = dsJudge(dsScore(BD).raw, await dsimRun(BD, 800)); BD.main = m; BD.wiz = w; }
          cur.j = dsJudge(dsScore(BD).raw, await dsimRun(BD, 800));
        } else if (best) { if (best.j == null) { const m = BD.main; BD.main = best.main; best.j = dsJudge(dsScore(BD).raw, null); BD.main = m; } cur.j = dsJudge(dsScore(BD).raw, null); }
        if (!best || cur.j > best.j) best = cur;
        cost.d.push(Date.now() - td);
      }
      if (!alive()) return null;
      BD.main = best.main; BD.wiz = best.wiz; const kept = best.kept, draws = Math.min(d, K), tt = Date.now();
      step(v, 'opt', 0.8, 0);
      step(v, 'sim', 0.8, 0, { d: draws, k: draws, s: eta(i, draws, draws) });
      const tune = typeof dsimRun === 'function' ? await dsSimTune(mine, n => step(v, 'sim', 0.8 + 0.18 * Math.min(1, n / 6), n, { d: draws, k: draws, s: eta(i, draws, draws) }), vEnd) : { fixed: 0, r: null };
      if (!alive()) return null;
      cost.t.push(Date.now() - tt);
      const sc = dsScore(BD), prof = dwProfile();
      res.push({ v, main: dsClone(BD.main), wiz: { ...BD.wiz }, sc, prof, kept, sim: tune.r, fixed: tune.fixed, draws, story: typeof dwDeckStory === 'function' ? dwDeckStory(BD) : null });
      for (const k of dsSpells(BD.main)) if (!mine.has(k)) avoid.set(k, (avoid.get(k) || 0) + 1);
      step(v, 'done', 1, 0);
    }
  } finally { BD.avoid = null; BD.wiz = { ...wiz0, seed }; BD.main = base; }
  if (maxK > 1 && cost.d.length) { const e = est(); dsCostSave({ d: Math.round(e.d), t: Math.round(e.t) }); }
  for (const r of res) r.common = res[0] && r !== res[0] ? dsOverlap(res[0].main, r.main) : null;      // part des sorts communs avec la version équilibrée
  return res;
}
/** Prix du ou des commandants (même prix que le coach : relevé du jour, impression la moins chère). */
const dsCmdCents = () => BD.cmdr.reduce((a, c) => a + Math.max(0, dwPrice(c.key, dwCard(c.key)) || 0), 0);
/** Commandant qui coûte au moins la moitié du budget : sans réponse, le coach construisait un deck incomplet (Vorinclex 35 € pour 25 € : le commandant et
 *  36 terrains, aucun sort). Avant la construction, le joueur choisit : le budget pour les 99 autres cartes (budget total = budget + commandant) ou un autre
 *  budget (prérempli). Le choix est gardé avec le deck (wiz.budAck = budget accepté : plus de question tant qu'il ne change pas). Vrai si la question est ouverte ;
 *  go() relance la construction une fois le choix fait. */
async function dsBudAsk(cmd, go) {
  const w = BD.wiz || {}, bud = w.bud || 0; if (!(bud > 0) || w.budAck === bud) return false;
  await Promise.resolve(typeof pxTable === 'function' && pxTable()).catch(() => null);      // prix du jour d'abord (le même que la construction)
  const cc = dsCmdCents(); if (cc < bud * 0.5) return false;
  const cur = mkCur(), tot = bud + cc, sug = Math.ceil(tot / 1000) * 10, nm = cmd.names.join(' + ');
  const api = openSheet(T('Budget et commandant'), nm, a => { a.wrap.classList.add('ds-bud-sheet'); });
  api.body.innerHTML = `<p class="hint warn">${esc(T('{name} coûte {p} à lui seul, sur un budget de {b} : il ne resterait presque rien pour les autres cartes.', { name: nm, p: fmt(cc, cur), b: fmt(bud, cur) }))}</p>
    <button class="btn block" type="button" data-bud-99>${T('Appliquer le budget aux 99 autres cartes')}<small>${esc(T('Budget total : {p}', { p: fmt(tot, cur) }))}</small></button>
    <div class="field-in"><label class="label" for="dsBudNew">${T('Ou revoir le budget du deck ({c})', { c: cur })}</label><input type="number" id="dsBudNew" inputmode="decimal" min="0" step="10" value="${sug}"></div>
    <button class="btn ghost block" type="button" data-bud-new>${T('Construire avec ce budget')}</button>`;
  api.setFoot(`<button class="btn ghost" type="button" data-close>${T('Annuler')}</button>`);
  const take = v => { if (!BD.wiz) return; BD.wiz.bud = v; BD.wiz.budAck = v; dwPersist(BD.id); api.close(); haptic('tap'); setTimeout(go, 0); };
  api.body.addEventListener('click', e => {
    if (e.target.closest('[data-bud-99]')) take(tot);
    else if (e.target.closest('[data-bud-new]')) { const v = Math.max(0, Math.round(moneyIn($('#dsBudNew', api.body).value) || 0)) * 100; take(v); }
  });
  return true;
}
/** Construit le deck de l'éditeur (BD) en plusieurs passes. undoTo : deck à remettre si on annule (« Recréer le deck »). seed : graine du tirage (« Autre proposition »). */
async function dsBuild(undoTo, seed) {
  const cmd = dwCmdOf(); if (!cmd || !DW.core || !BD.el) return;
  if (DS.api && sheets.includes(DS.api)) return;      // déjà en cours
  if (await dsBudAsk(cmd, () => dsBuild(undoTo, seed))) return;      // commandant qui mange le budget : le joueur choisit d'abord (question ouverte)
  const el = BD.el, before = undoTo || dsClone(BD.main), wiz0 = { ...(BD.wiz || dwDefaults()) }, cur = mkCur();
  const empty = dwProfile().n <= BD.cmdr.length, list = empty ? DS_VARIANTS.map(v => ({ ...v, name: T(v.name), d: T(v.d) })) : [{ id: 'eq', name: T('Deck complété'), d: '' }];
  const steps = [{ id: 'px', t: T('Prix du jour') }, { id: 'pk', t: T('Cartes conseillées pour {name}', { name: cmd.names.join(' + ') }) }, ...list.map(v => ({ id: v.id, t: empty ? T('Version « {v} »', { v: v.name }) : T('Construction et amélioration') })), { id: 'ok', t: T('Vérification') }];
  const st = Object.fromEntries(steps.map(s => [s.id, { s: 'todo', d: '' }]));
  let frac = 0, done = false, eta = null, drawsK = 0;      // eta : secondes restantes estimées (durées mesurées sur cet appareil) ; drawsK : tirages de la version en cours
  const api = DS.api = openSheet(T('Le coach construit ton deck'), cmd.names.join(' + '), a => { a.wrap.classList.add('ds-sheet'); });
  const alive = () => sheets.includes(api) && BD.el === el;
  const paint = now => {
    if (!sheets.includes(api) || done) return;
    const etaTxt = [eta != null && frac < 1 ? T('Encore environ {n} s', { n: eta }) : '', drawsK > 1 ? TN(drawsK, '{n} tirage par version', '{n} tirages par version') : ''].filter(Boolean).join(' · ');
    api.body.innerHTML = `<div class="ds-prog"><span class="ds-big"><i style="width:${Math.round(frac * 100)}%"></i></span><p class="ds-now">${esc(now || '')}</p>${etaTxt ? `<p class="ds-eta">${esc(etaTxt)}</p>` : ''}
      <ul class="ds-steps">${steps.map(s => `<li class="${st[s.id].s}"><span>${esc(s.t)}</span>${st[s.id].d ? `<small>${esc(st[s.id].d)}</small>` : ''}</li>`).join('')}</ul></div>`;
  };
  let painted = 0, lastNow = '';
  const set = (id, s, d, f, now) => {      // fenêtre redessinée à chaque étape, sinon 5 fois par seconde au plus (téléphone lent : le calcul garde le processeur)
    const turn = st[id].s !== s || (d != null && st[id].d !== d); st[id].s = s; if (d != null) st[id].d = d; if (f != null) frac = f; if (now != null) lastNow = now;
    if (turn || f === 1 || Date.now() - painted > 200) { painted = Date.now(); paint(lastNow); }
  };
  api.setFoot(`<button class="btn ghost" type="button" data-close>${T('Annuler')}</button>`);
  const quit = () => { if (BD.el === el) { BD.main = before; BD.wiz = wiz0; BD.pace = BD.wide = BD.gen = false; BD.avoid = null; BD.landRes = 0; dwPersist(BD.id); bdPaint(); } };      // annulée : deck et réglages d'avant
  const pc = empty && list.length > 1 ? dsCostLoad() : null;      // durées de la dernière construction sur cet appareil : temps annoncé tout de suite
  if (pc) { drawsK = dsDrawsFor(DS_BUDGET, list.length, pc.d, pc.t, DS_DRAWS); eta = Math.round(Math.min(DS_BUDGET, list.length * (drawsK * pc.d + pc.t)) / 1000) + 2; }
  paint(T('Préparation…'));
  try {
    set('px', 'run', '', 0.02, T('Lecture des prix du jour…'));
    const t = await Promise.resolve(typeof pxTable === 'function' && pxTable()).catch(() => null);
    if (!alive()) return quit(); set('px', 'done', t ? T('{n} prix', { n: nf0(t.map.size) }) : T('prix de la base'), 0.08);
    set('pk', 'run', '', 0.1, T('Lecture des cartes conseillées…'));
    await Promise.all([dwPack('c', cmd.slug), ...wiz0.th.map(x => dwPack('t', x))]).catch(() => null);
    if (!alive()) return quit(); const pack = DW.cmd.get(cmd.slug); set('pk', 'done', pack && (pack.n || pack.nd) ? TN(pack.n || pack.nd || 0, '{n} deck étudié', '{n} decks étudiés') : T('commandant peu connu : cartes très jouées dans ses couleurs'), 0.16);
    const span = 0.76 / list.length, idx = new Map(list.map((v, i) => [v.id, i]));
    BD.wiz = { ...wiz0, seed: seed || dsSeed() };
    const res = await dsMake({ empty, list, seed: BD.wiz.seed, alive, step: (v, ph, part, n, e) => {
      if (!alive()) return; const f0 = 0.16 + idx.get(v.id) * span, f = f0 + span * part;
      if (e) { if (e.s != null) eta = e.s; drawsK = e.k || 0; }
      const draw = e && e.k > 1 && ph !== 'sim' ? ' · ' + T('tirage {d} sur {k}', { d: e.d, k: e.k }) : '';      // plusieurs tirages : lequel (le meilleur est gardé)
      if (ph === 'skip') return set(v.id, 'skip', T('déjà petit budget'), f);
      if (ph === 'build') return set(v.id, 'run', T('construction') + draw, f, T('Construction : {v}', { v: v.name }));
      if (ph === 'opt') return set(v.id, 'run', T('amélioration') + draw, f, n ? T('Amélioration : {v} · passe {n}', { v: v.name, n }) : T('Amélioration : {v} (échanges carte à carte tant que la note monte)', { v: v.name }));
      if (ph === 'sim') return set(v.id, 'run', T('essais en partie'), f, n ? TN(n, 'Essais en partie : {v} · {n} série de 1 500 parties', 'Essais en partie : {v} · {n} séries de 1 500 parties', { v: v.name }) : T('Essais en partie : {v} (mains de départ, terrains, couleurs, face à 3 adversaires)', { v: v.name }));
    } });
    if (!res || !alive()) return quit();
    for (const r of res) set(r.v.id, 'done', T('note {n} · {p}', { n: r.sc.total, p: fmt(r.prof.cents, cur) }) + (r.sim ? ' · ' + T('{p} % de mains gardées', { p: r.sim.keep7 }) : '') + (r.kept + r.fixed ? ' · ' + TN(r.kept + r.fixed, '{n} échange', '{n} échanges') : '') + (r.draws > 1 ? ' · ' + TN(r.draws, '{n} tirage', '{n} tirages') : ''));
    set('ok', 'done', '', 1, T('Terminé'));
    if (!res.length) { quit(); api.close(); return; }
    BD.main = dsClone(res[0].main);
    if (res.length === 1) { dsApply(res[0], before, empty); api.close(); return; }
    done = true; DS.last = res; dsChoose(api, res, before, empty);
  } catch (e) { console.error(e); quit(); if (sheets.includes(api)) api.close(); toast(T('La construction a échoué : réessaie.')); }
  finally { if (!done && BD.el === el) { BD.pace = BD.wide = BD.gen = false; BD.avoid = null; BD.landRes = 0; } }
}
/** « Autre proposition » : tout reconstruire avec une nouvelle graine (mêmes réglages) ; le deck d'avant reste annulable. */
function dsAgain(before) { const orig = before || dsClone(BD.main); BD.main = new Map(); dsBuild(orig, dsSeed()); }
/** Résumé du plan d'une version (thème, tribu, moteur) : une ligne. */
function dsStoryLine(st) {
  if (!st) return '';
  const bits = [];
  if (st.tribe) bits.push(T('{t} ×{n}', { t: st.tribe.t, n: st.tribe.n }));
  for (const t of st.tags.slice(0, 2)) bits.push(T('{m} ×{n}', { m: t.label, n: t.n }));
  if (st.engines[0]) bits.push(st.engines[0].label);
  return bits.length ? T('Plan : {p}', { p: bits.join(' · ') }) : '';
}
/** Choix de la version : note, valeur, courbe, rôles ; la meilleure note est signalée. Fermer sans choisir garde la version équilibrée. */
function dsChoose(api, res, before, empty) {
  const cur = mkCur(), top = Math.max(...res.map(r => r.sc.total)), best = res.filter(r => r.sc.total === top).length === 1 ? top : Infinity, roles = ['ramp', 'draw', 'removal', 'wipe'];
  api.body.innerHTML = `<p class="hint">${T('Le coach a construit plusieurs versions avec tes réglages. Choisis celle qui te ressemble ; tu pourras tout ajuster ensuite.')}</p><div class="ds-vs">${res.map((r, i) => `<button class="ds-v${r.sc.total === best ? ' best' : ''}" type="button" data-ds-pick="${i}">
      <span class="ds-vh"><b>${esc(r.v.name)}</b>${r.sc.total === best ? `<em>${T('Meilleure note')}</em>` : ''}<span class="ds-vn ds-${dsLevel(r.sc.total)}">${r.sc.total}<small>/100</small></span></span>
      ${r.v.d ? `<span class="ds-vd">${esc(r.v.d)}</span>` : ''}
      <span class="ds-vk">${esc([fmt(r.prof.cents, cur), T('coût moyen {v}', { v: dsNum(r.prof.mv) }), TN(r.prof.land, '{n} terrain', '{n} terrains')].join(' · '))}</span>
      ${r.sim ? `<span class="ds-vd">${esc(T('En partie : {k} % de mains gardées · commandant à temps {c} % · couleurs bloquées {s} %', { k: r.sim.keep7, c: r.sim.cmdOn, s: r.sim.screw4 }) + (r.sim.elim10 != null && !r.sim.blind ? ' · ' + T('un adversaire éliminé avant le tour 11 : {p}', { p: dsimPct(r.sim.kill10) }) : ''))}</span>` : ''}
      <span class="ds-vr">${esc(roles.map(x => dsRoleLabel(x) + ' ' + r.prof[x]).join(' · '))}</span>
      ${dsStoryLine(r.story) ? `<span class="ds-vd">${esc(dsStoryLine(r.story))}</span>` : ''}${r.common != null ? `<span class="ds-vd">${esc(T('{p} % des sorts en commun avec la version équilibrée', { p: Math.round(r.common * 100) }))}</span>` : ''}</button>`).join('')}</div>`;
  api.setFoot(`<button class="btn ghost" type="button" data-ds-again>${T('Autre proposition')}</button>`);
  const again = api.foot && api.foot.querySelector('[data-ds-again]');
  if (again) again.onclick = () => { picked = true; api.close(); setTimeout(() => dsAgain(before), 200); };      // nouvelle graine, mêmes réglages : d'autres cartes à qualité égale
  let picked = false;
  api.body.onclick = e => { const b = e.target.closest('[data-ds-pick]'); if (!b) return; picked = true; dsApply(res[Number(b.dataset.dsPick)], before, empty); api.close(); };
  const close0 = api.close; api.close = () => { api.close = close0; if (!picked) { picked = true; dsApply(res[0], before, empty); } close0(); };      // fermée sans choisir : la version équilibrée
}
/** Version choisie : mise dans l'éditeur, style gardé dans les réglages du deck (cibles du coach), annulable. */
function dsApply(r, before, empty) {
  if (!BD.el) return;
  BD.main = dsClone(r.main); BD.wiz = BD.wiz || dwDefaults();
  if (r.v.arch) BD.wiz.arch = r.v.arch; else delete BD.wiz.arch;
  if (r.v.style) BD.wiz.style = r.v.style; else delete BD.wiz.style;      // style de la version : le coach continue à suggérer dans cet esprit
  if (r.wiz && r.wiz.seed) BD.wiz.seed = r.wiz.seed;
  if (empty) BD.wiz.gen = 1;
  dwPersist(BD.id); BD.dirty = true; haptic('ok'); bdPaint(); bdMetaSoon();
  const n = r.prof.n, cur = mkCur(), msg = T('Version « {v} » · note {s}/100', { v: r.v.name, s: r.sc.total }) + ' · ' + T('{t} / 100', { t: n }) + (r.prof.cents ? ' · ' + T('valeur {p}', { p: fmt(r.prof.cents, cur) }) : '');
  toast(n < 100 ? msg + ' · ' + T('budget ou cartes épuisés : complète à la main') : msg, { label: T('Annuler'), fn: () => { BD.main = before; BD.dirty = true; bdPaint(); haptic('tap'); } });
}
if (typeof module !== 'undefined' && module.exports) Object.assign(module.exports, { DS_PARTS });
// détail de la note ouvert ou fermé dans le Coach : gardé d'un rafraîchissement à l'autre
if (typeof document !== 'undefined') document.addEventListener('toggle', e => { const d = e.target; if (d && d.classList && d.classList.contains('ds-parts') && BD.el && BD.el.contains(d)) DW.scoreOpen = d.open; }, true);
