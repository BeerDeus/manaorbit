/* ── deckopt.js : note du coach (sur 100) et construction en plusieurs passes (pour tout le monde depuis le 2 novembre 2026) ─────────────────
   Note du coach : la même mesure pour la génération, l'analyse et le rapport. Rôles 30 (chaque catégorie face à sa cible), mana 25 (terrains face à la
   formule de Karsten, sources de chaque couleur face à son repère), courbe 10 (coût moyen face à sa cible), synergie 25 (part des sorts joués avec ce
   commandant ou très joués en Commander), règles et budget 10 (bracket, budget, 100 cartes).
   Construction : prix du jour et cartes conseillées lus d'abord, puis pour chaque version (équilibrée, plus agressive, plus contrôle, moins chère) une
   construction (deckwiz.js › dwAutoBuild) suivie d'une amélioration : la carte ajoutée la plus faible est échangée contre la meilleure candidate tant que
   la note monte, puis des terrains de base contre des terrains qui comblent les couleurs en manque. Barre de progression ; le joueur choisit sa version. */
const DS = { api: null, last: null };
const dsNum = (v, d = 2) => Number(v).toLocaleString(LOC(), { minimumFractionDigits: d, maximumFractionDigits: d });
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
  const [mlo, , mhi] = tgt.mv, mv = prof.mv, dist = !prof.nonland ? 0 : mv < mlo ? mlo - mv : mv > mhi ? mv - mhi : 0, cs = Math.max(0, 1 - dist / 0.6);
  if (cs < 1) tips.push({ t: mv > mhi ? T('Courbe haute : coût moyen {v} (repère {m})', { v: dsNum(mv), m: dsNum(tgt.mv[1], 1) }) : T('Courbe très basse : coût moyen {v} (repère {m})', { v: dsNum(mv), m: dsNum(tgt.mv[1], 1) }), gain: (1 - cs) * 10 });
  const pCurve = 10 * cs;
  // Synergie : part des sorts joués avec ce commandant (ou, sans données sur lui, très joués en Commander)
  const spells = [...X.main.values()].filter(c => !BASIC_NAMES.has(c.key) && !(((dwCard(c.key) || {}).roles || 0) & DW_RB.land));
  let good = 0, weak = 0;      // qualité de chaque sort pour ce commandant (inclusion, synergie, thèmes : dwVal) ; sans données sur lui, sa popularité en Commander
  for (const c of spells) {
    const o = info.get(c.key), x = dwCard(c.key) || {};
    const q = o && dwVal(o) > 0 ? Math.min(1, dwVal(o) / 0.9) : x.rank > 0 && x.rank < 1500 ? (pack ? 0.4 : 0.8) : x.rank > 0 && x.rank < 4000 ? (pack ? 0.15 : 0.5) : 0;
    good += q * c.qty; if (q < 0.25) weak += c.qty;
  }
  const nsp = spells.reduce((a, c) => a + c.qty, 0), share = nsp ? good / nsp : 0, sy = Math.min(1, share / 0.8), pSyn = nsp ? 25 * sy : 0;
  if (sy < 1 && weak) tips.push({ t: TN(weak, '{n} carte peu jouée avec ce commandant', '{n} cartes peu jouées avec ce commandant'), gain: (1 - sy) * 25 });
  // Règles et budget
  const b = DW_BRACKETS.find(x => x[0] === set.br) || DW_BRACKETS[2]; let pr = 10;
  const rule = (bad, pts, t) => { if (bad) { pr -= pts; tips.push({ t, gain: pts }); } };
  rule(prof.gc.length > b[3], 5, T('Trop de Game Changers pour le bracket {b}', { b: b[0] }));
  rule(prof.mld.length && set.br <= 3, 5, T('Destruction massive de terrains interdite en bracket {b}', { b: b[0] }));
  rule(prof.xt.length && set.br === 1, 3, T('Tours supplémentaires interdits en bracket 1'));
  rule(prof.combos.length && set.br <= 2, 5, T('Combo à 2 cartes interdit en bracket {b}', { b: b[0] }));
  if (set.bud > 0 && prof.cents > set.bud) rule(true, Math.min(5, Math.ceil((prof.cents - set.bud) / set.bud * 20)), T('Au-dessus du budget de {p}', { p: fmt(prof.cents - set.bud, mkCur()) }));
  if (prof.n !== 100) rule(true, Math.min(5, Math.abs(100 - prof.n)), prof.n < 100 ? TN(100 - prof.n, 'Il manque {n} carte', 'Il manque {n} cartes') : TN(prof.n - 100, '{n} carte de trop', '{n} cartes de trop'));
  const pRules = Math.max(0, pr);
  const raw = pRoles + pMana + pCurve + pSyn + pRules, vals = { roles: pRoles, mana: pMana, curve: pCurve, syn: pSyn, rules: pRules };
  return { total: Math.max(0, Math.min(100, Math.round(raw))), raw, parts: DS_PARTS.map(([k, label, max]) => ({ k, label: T(label), pts: vals[k], max })), tips: tips.sort((a, c) => c.gain - a.gain) };
}
const dsLevel = n => n >= 85 ? 'top' : n >= 70 ? 'ok' : n >= 50 ? 'mid' : 'low';
const dsVerdict = n => n >= 85 ? T('Excellent équilibre') : n >= 70 ? T('Bon deck, quelques réglages possibles') : n >= 50 ? T('Jouable, mais des manques nets') : T('Deck à retravailler');
/** Carte de la note : chiffre, verdict, détail par partie et pistes (les plus rentables d'abord). after : note après des échanges (analyse). */
function dsScoreHtml(sc, o = {}) {
  if (!sc) return '';
  const tip = sc.tips[0] ? sc.tips[0].t : dsVerdict(sc.total);
  return `<div class="ds-score ds-${dsLevel(sc.total)}"><div class="ds-n"><b>${sc.total}</b><small>/100</small></div><div class="ds-t"><b>${T('Note du coach')}${o.after != null && o.after !== sc.total ? ` <span class="ds-after">→ ${o.after}</span>` : ''}</b><small>${esc(o.after != null && o.after !== sc.total ? T('avec les échanges cochés') : tip)}</small></div></div>
    <details class="ds-parts"${o.open ? ' open' : ''}><summary>${T('Détail de la note')}</summary>${sc.parts.map(p => `<p class="ds-p"><span>${esc(p.label)}</span><span class="ds-bar"><i style="width:${Math.round(p.pts / p.max * 100)}%"></i></span><b>${Math.round(p.pts)}<small>/${p.max}</small></b></p>`).join('')}
    ${sc.tips.length ? `<p class="label">${T('Pour gagner des points')}</p><ul class="bd-issues">${sc.tips.slice(0, 5).map(t => `<li class="warn">${esc(t.t)} <small>+${Math.max(1, Math.round(t.gain))}</small></li>`).join('')}</ul>` : `<p class="hint">${T('Rien à gagner de plus : chaque partie est au maximum.')}</p>`}</details>`;
}

/* ── Amélioration d'un deck généré (BD) : échanges carte à carte tant que la note monte ─────────────────────────────────────────── */
const dsTick = () => new Promise(r => setTimeout(r, 0));
/** mine : cartes du joueur (jamais retirées) ; ms : temps donné ; step(i) : progression. Retourne le nombre d'échanges gardés. */
async function dsOptimize(mine, ms, step) {
  const cmd = dwCmdOf(); if (!cmd) return 0;
  const set = BD.wiz || dwDefaults(), pack = DW.cmd.get(cmd.slug) || null, info = dwInfo(pack, set), ctx = { cmd, pack, info };
  const score = () => dsScore(BD, ctx).raw, t0 = Date.now(), tried = new Set();
  let cur = score(), kept = 0, it = 0;
  const worth = (k, prof, tgt) => { const o = info.get(k), x = dwCard(k) || {}; let v = o ? dwVal(o) : x.rank > 0 ? Math.max(0, 1 - x.rank / 4000) * 0.5 : 0; for (const r of DKW_ROLES) if (r !== 'land' && x.roles & DW_RB[r] && tgt[r] && prof[r] <= tgt[r][0]) v += 1; return v; };
  const card = x => ({ key: x.k, name: x.name, qty: 1 });
  while (Date.now() - t0 < ms && it < 90) {
    it++;
    const prof = dwProfile(), tgt = dwTargets(prof, cmd, pack, set), high = prof.nonland >= 20 && prof.mv > tgt.mv[2];      // courbe trop haute : les gros sorts peu utiles partent d'abord, des sorts moins chers les remplacent
    const w = k => worth(k, prof, tgt) - (high ? Math.max(0, ((dwCard(k) || {}).cmc || 0) - 4) * 0.25 : 0);
    const out = [...BD.main.values()].filter(c => !mine.has(c.key) && !tried.has(c.key) && !BASIC_NAMES.has(c.key) && !(((dwCard(c.key) || {}).roles || 0) & DW_RB.land)).sort((a, b) => w(a.key) - w(b.key))[0];
    if (!out) break; tried.add(out.key);
    const need = DKW_ROLES.filter(r => r !== 'land' && tgt[r] && prof[r] < tgt[r][1]).sort((a, b) => (prof[a] - tgt[a][1]) / Math.max(1, tgt[a][1]) - (prof[b] - tgt[b][1]) / Math.max(1, tgt[b][1]))[0] || '';
    BD.main.delete(out.key);
    const p2 = dwProfile(), seen = new Set(), cands = [...(need ? dwSuggest(need, cmd, pack, p2, tgt, 3) : []), ...dwSuggest('', cmd, pack, p2, tgt, high ? 30 : 3).filter(x => !high || x.x.cmc <= 3).slice(0, 3)].filter(x => !seen.has(x.k) && seen.add(x.k) && x.k !== out.key);
    let best = null, bestS = cur + 0.15;      // un échange doit vraiment faire monter la note
    for (const x of cands) { BD.main.set(x.k, card(x)); const s1 = score(); BD.main.delete(x.k); if (s1 > bestS) { bestS = s1; best = x; } }
    if (best) { BD.main.set(best.k, card(best)); cur = bestS; kept++; tried.add(best.k); } else BD.main.set(out.key, out);
    if (it % 3 === 0) { if (step) step(it); await dsTick(); }
  }
  // terrains : un terrain de base de la couleur la mieux servie contre un terrain qui donne une couleur en manque
  const BK = { W: 'plains', U: 'island', B: 'swamp', R: 'mountain', G: 'forest' };
  for (let i = 0; i < 8 && Date.now() - t0 < ms * 1.5; i++) {
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

/* ── Ajustement par la simulation : le deck est joué (1 500 parties), et ses défauts de démarrage corrigés ─────────────────────────────
   Trop de mains à refaire ou de terrains manqués : un sort faible contre de la rampe à 2 mana ou moins, sinon contre un terrain ; couleurs qui bloquent :
   un terrain de base contre un terrain qui donne plusieurs couleurs du deck ; commandant en retard : de la rampe pas chère. Chaque correction est rejouée
   et gardée seulement si la partie s'améliore nettement et que la note du coach ne baisse pas (plus de 1,5 point). 6 essais au plus. */
const dsSimVal = r => r ? r.keep7 + 0.6 * r.cmdOn - r.miss3 - 1.5 * r.screw4 + 0.4 * r.eff : -1e9;
async function dsSimTune(mine, step) {
  const cmd = dwCmdOf(); if (!cmd) return { fixed: 0, r: null };
  const set = BD.wiz || dwDefaults(), pack = DW.cmd.get(cmd.slug) || null, info = dwInfo(pack, set), N = 1500;
  let r = await dsimRun(BD, N); if (!r) return { fixed: 0, r: null };
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
  while (tries < 6) {
    const want = [];
    if (r.keep7 < 74 || r.miss3 > 20) want.push('ramp', 'land');      // 74 % : avec 36 terrains, une main de 7 a 2 à 5 terrains 79 % du temps au mieux (loi hypergéométrique)
    if (r.screw4 > 10) want.push('fix');
    if (r.cmv && r.cmdOn < 55) want.push('ramp');
    if (!want.length) break;
    let better = false;
    for (const kind of [...new Set(want)]) {
      if (tries >= 6) break;
      const snap = dsClone(BD.main); if (!fix(kind)) { BD.main = snap; continue; }
      tries++; if (step) step(tries);
      const r2 = await dsimRun(BD, N), n2 = dsScore(BD, { cmd, pack, info }).raw;
      if (dsSimVal(r2) > val + 1.5 && n2 >= note - 1.5) { r = r2; val = dsSimVal(r2); note = Math.max(note, n2); fixed++; better = true; break; }
      BD.main = snap;
    }
    if (!better) break;
  }
  return { fixed, r };
}
/* ── Construction en plusieurs passes : barre de progression, versions au choix ─────────────────────────────────────────────────── */
const DS_VARIANTS = [{ id: 'eq', name: 'Équilibrée', d: 'Le meilleur compromis pour tes réglages' }, { id: 'agg', name: 'Plus agressive', d: 'Sorts moins chers, plus de créatures, pression rapide', arch: 'aggro' }, { id: 'ctl', name: 'Plus contrôle', d: 'Plus d\'interaction et de pioche, partie plus longue', arch: 'control' }, { id: 'eco', name: 'Moins chère', d: 'Environ 55 % de la valeur de la version équilibrée', eco: 0.55 }];
const dsClone = m => new Map([...m].map(([k, c]) => [k, { ...c }]));
/** Construit le deck de l'éditeur (BD) en plusieurs passes. undoTo : deck à remettre si on annule (« Recréer le deck »). */
async function dsBuild(undoTo) {
  const cmd = dwCmdOf(); if (!cmd || !DW.core || !BD.el) return;
  if (DS.api && sheets.includes(DS.api)) return;      // déjà en cours
  const el = BD.el, before = undoTo || dsClone(BD.main), base = dsClone(BD.main), mine = new Set(base.keys()), wiz0 = { ...(BD.wiz || dwDefaults()) }, cur = mkCur();
  const empty = dwProfile().n <= BD.cmdr.length, list = empty ? DS_VARIANTS.map(v => ({ ...v, name: T(v.name), d: T(v.d) })) : [{ id: 'eq', name: T('Deck complété'), d: '' }];
  const steps = [{ id: 'px', t: T('Prix du jour') }, { id: 'pk', t: T('Cartes conseillées pour {name}', { name: cmd.names.join(' + ') }) }, ...list.map(v => ({ id: v.id, t: empty ? T('Version « {v} »', { v: v.name }) : T('Construction et amélioration') })), { id: 'ok', t: T('Vérification') }];
  const st = Object.fromEntries(steps.map(s => [s.id, { s: 'todo', d: '' }]));
  let frac = 0, done = false;
  const api = DS.api = openSheet(T('Le coach construit ton deck'), cmd.names.join(' + '), a => { a.wrap.classList.add('ds-sheet'); });
  const alive = () => sheets.includes(api) && BD.el === el;
  const paint = now => {
    if (!sheets.includes(api) || done) return;
    api.body.innerHTML = `<div class="ds-prog"><span class="ds-big"><i style="width:${Math.round(frac * 100)}%"></i></span><p class="ds-now">${esc(now || '')}</p>
      <ul class="ds-steps">${steps.map(s => `<li class="${st[s.id].s}"><span>${esc(s.t)}</span>${st[s.id].d ? `<small>${esc(st[s.id].d)}</small>` : ''}</li>`).join('')}</ul></div>`;
  };
  const set = (id, s, d, f, now) => { st[id].s = s; if (d != null) st[id].d = d; if (f != null) frac = f; paint(now); };
  api.setFoot(`<button class="btn ghost" type="button" data-close>${T('Annuler')}</button>`);
  const quit = () => { if (BD.el === el) { BD.main = before; BD.wiz = wiz0; BD.pace = BD.wide = false; BD.landRes = 0; dwPersist(BD.id); bdPaint(); } };      // annulée : deck et réglages d'avant
  paint(T('Préparation…'));
  try {
    set('px', 'run', '', 0.02, T('Lecture des prix du jour…'));
    const t = await Promise.resolve(typeof pxTable === 'function' && pxTable()).catch(() => null);
    if (!alive()) return quit(); set('px', 'done', t ? T('{n} prix', { n: nf0(t.map.size) }) : T('prix de la base'), 0.08);
    set('pk', 'run', '', 0.1, T('Lecture des cartes conseillées…'));
    await Promise.all([dwPack('c', cmd.slug), ...wiz0.th.map(x => dwPack('t', x))]).catch(() => null);
    if (!alive()) return quit(); const pack = DW.cmd.get(cmd.slug); set('pk', 'done', pack ? T('{n} decks étudiés', { n: nf0(pack.n || pack.nd || 0) }) : T('commandant peu connu : cartes très jouées dans ses couleurs'), 0.16);
    const res = [], span = 0.76 / list.length;
    for (let i = 0; i < list.length; i++) {
      const v = list[i], f0 = 0.16 + i * span;
      let bud = wiz0.bud;
      if (v.eco) {      // moins chère : 55 % de la version équilibrée, sauf si ce budget ne laisse presque rien après le commandant
        const eqv = res[0] ? res[0].prof.cents : 0, cc = res[0] ? res[0].prof.cmdCents || 0 : 0; bud = Math.round((wiz0.bud > 0 ? Math.min(wiz0.bud, eqv) : eqv) * v.eco);
        if (!(eqv > 3000) || cc >= bud * 0.5) { set(v.id, 'skip', T('déjà petit budget'), f0 + span); continue; }
      }
      set(v.id, 'run', T('construction'), f0, T('Construction : {v}', { v: v.name }));
      await dsTick(); if (!alive()) return quit();
      BD.main = dsClone(base); BD.wiz = { ...wiz0, bud, ...(v.arch ? { arch: v.arch } : {}) }; if (!v.arch) delete BD.wiz.arch;
      dwAutoBuild(undefined, true);
      set(v.id, 'run', T('amélioration'), f0 + span * 0.35, T('Amélioration : {v} (échanges carte à carte tant que la note monte)', { v: v.name }));
      const kept = await dsOptimize(mine, empty ? 900 : 1600, n => { if (alive()) { frac = f0 + span * (0.35 + 0.45 * Math.min(1, n / 60)); paint(T('Amélioration : {v} · passe {n}', { v: v.name, n })); } });
      if (!alive()) return quit();
      set(v.id, 'run', T('essais en partie'), f0 + span * 0.8, T('Essais en partie : {v} (mains de départ, terrains, couleurs)', { v: v.name }));
      const tune = typeof dsimRun === 'function' ? await dsSimTune(mine, n => { if (alive()) { frac = f0 + span * (0.8 + 0.18 * Math.min(1, n / 6)); paint(T('Essais en partie : {v} · {n} séries de 1 500 parties', { v: v.name, n })); } }) : { fixed: 0, r: null };
      if (!alive()) return quit();
      const sc = dsScore(BD), prof = dwProfile();
      res.push({ v, main: dsClone(BD.main), wiz: { ...BD.wiz }, sc, prof, kept, sim: tune.r, fixed: tune.fixed });
      set(v.id, 'done', T('note {n} · {p}', { n: sc.total, p: fmt(prof.cents, cur) }) + (tune.r ? ' · ' + T('{p} % de mains gardées', { p: tune.r.keep7 }) : '') + (kept + tune.fixed ? ' · ' + TN(kept + tune.fixed, '{n} échange', '{n} échanges') : ''), f0 + span);
    }
    set('ok', 'done', '', 1, T('Terminé'));
    BD.wiz = wiz0; BD.main = dsClone(res[0].main);
    if (res.length === 1) { dsApply(res[0], before, empty); api.close(); return; }
    done = true; DS.last = res; dsChoose(api, res, before, empty);
  } catch (e) { console.error(e); quit(); if (sheets.includes(api)) api.close(); toast(T('La construction a échoué : réessaie.')); }
  finally { if (!done && BD.el === el) { BD.pace = BD.wide = false; BD.landRes = 0; } }
}
/** Choix de la version : note, valeur, courbe, rôles ; la meilleure note est signalée. Fermer sans choisir garde la version équilibrée. */
function dsChoose(api, res, before, empty) {
  const cur = mkCur(), best = Math.max(...res.map(r => r.sc.total)), roles = ['ramp', 'draw', 'removal', 'wipe'];
  api.body.innerHTML = `<p class="hint">${T('Le coach a construit plusieurs versions avec tes réglages. Choisis celle qui te ressemble ; tu pourras tout ajuster ensuite.')}</p><div class="ds-vs">${res.map((r, i) => `<button class="ds-v${r.sc.total === best ? ' best' : ''}" type="button" data-ds-pick="${i}">
      <span class="ds-vh"><b>${esc(r.v.name)}</b>${r.sc.total === best ? `<em>${T('Meilleure note')}</em>` : ''}<span class="ds-vn ds-${dsLevel(r.sc.total)}">${r.sc.total}<small>/100</small></span></span>
      ${r.v.d ? `<span class="ds-vd">${esc(r.v.d)}</span>` : ''}
      <span class="ds-vk">${esc([fmt(r.prof.cents, cur), T('coût moyen {v}', { v: dsNum(r.prof.mv) }), TN(r.prof.land, '{n} terrain', '{n} terrains')].join(' · '))}</span>
      ${r.sim ? `<span class="ds-vd">${esc(T('En partie : {k} % de mains gardées · commandant à temps {c} % · couleurs bloquées {s} %', { k: r.sim.keep7, c: r.sim.cmdOn, s: r.sim.screw4 }))}</span>` : ''}
      <span class="ds-vr">${esc(roles.map(x => dsRoleLabel(x) + ' ' + r.prof[x]).join(' · '))}</span></button>`).join('')}</div>`;
  api.setFoot('');
  let picked = false;
  api.body.onclick = e => { const b = e.target.closest('[data-ds-pick]'); if (!b) return; picked = true; dsApply(res[Number(b.dataset.dsPick)], before, empty); api.close(); };
  const close0 = api.close; api.close = () => { api.close = close0; if (!picked) { picked = true; dsApply(res[0], before, empty); } close0(); };      // fermée sans choisir : la version équilibrée
}
/** Version choisie : mise dans l'éditeur, style gardé dans les réglages du deck (cibles du coach), annulable. */
function dsApply(r, before, empty) {
  if (!BD.el) return;
  BD.main = dsClone(r.main); BD.wiz = BD.wiz || dwDefaults();
  if (r.v.arch) BD.wiz.arch = r.v.arch; else delete BD.wiz.arch;
  if (empty) BD.wiz.gen = 1;
  dwPersist(BD.id); BD.dirty = true; haptic('ok'); bdPaint(); bdMetaSoon();
  const n = r.prof.n, cur = mkCur(), msg = T('Version « {v} » · note {s}/100', { v: r.v.name, s: r.sc.total }) + ' · ' + T('{t} / 100', { t: n }) + (r.prof.cents ? ' · ' + T('valeur {p}', { p: fmt(r.prof.cents, cur) }) : '');
  toast(n < 100 ? msg + ' · ' + T('budget ou cartes épuisés : complète à la main') : msg, { label: T('Annuler'), fn: () => { BD.main = before; BD.dirty = true; bdPaint(); haptic('tap'); } });
}
if (typeof module !== 'undefined' && module.exports) Object.assign(module.exports, { DS_PARTS });
// détail de la note ouvert ou fermé dans le Coach : gardé d'un rafraîchissement à l'autre
if (typeof document !== 'undefined') document.addEventListener('toggle', e => { const d = e.target; if (d && d.classList && d.classList.contains('ds-parts') && BD.el && BD.el.contains(d)) DW.scoreOpen = d.open; }, true);
