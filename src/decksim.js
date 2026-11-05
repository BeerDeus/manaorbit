/* ── decksim.js : 10 000 débuts de partie Commander joués par le coach face à une table de 3 adversaires (rapport du coach, construction) ──────────
   Chaque partie : mélange, main de 7 (mulligan « London » si moins de 2 ou plus de 5 terrains, 2 au plus), puis 10 tours : un terrain par tour (celui
   qui apporte une couleur qui manque d'abord), le commandant dès qu'il est payable, la rampe ensuite (source de mana dès le tour suivant), puis les sorts
   les plus chers payables. Le paiement tient compte des couleurs : chaque symbole prend une source qui produit sa couleur (les sources les moins
   polyvalentes d'abord), le reste en mana générique ; un symbole hybride compte comme générique. Une partie sur deux commence (pas de pioche au tour 1).
   Le PLAN (depuis le 4 novembre 2026) : ce que fait chaque carte d'après le classement par mécaniques (deckmech.js) et ses rôles : jetons, drain et
   blessures directes, pioche (moteur : une carte tous les deux tours ; sort : 2 cartes), condition de victoire lancée (10 blessures à chaque adversaire),
   moteur assemblé (une carte qui fournit une mécanique principale du plan et une qui en profite, en jeu ensemble).
   La TABLE (depuis le 5 novembre 2026, DSIM_OPP) : 3 adversaires à 40 points de vie ; 21 blessures d'un même commandant éliminent. Leur plateau grandit :
   à chacun de leurs tours (dès le 2e), chacun pose un bloqueur 60 % du temps (5 au plus), de force et d'endurance 1 + tour / 2 (2 au tour 2, 4 au tour 6),
   un sur quatre vole. Tes créatures attaquent l'adversaire le plus bas en vie, avec leurs vraies force et endurance (colonne [12] de la base, sinon
   estimées d'après le coût) et leurs mots-clés : évasion (vol, menace, imblocable… : seuls les bloqueurs volants les arrêtent), piétinement, célérité,
   double initiative, contact mortel, indestructible, défense talismanique ; les cartes qui DONNENT évasion, célérité ou double initiative (classement)
   les donnent à ta plus grosse créature (célérité : à toutes). Une créature n'attaque que si elle passe (évasion) ou ne meurt pas pour rien ; l'adversaire
   bloque ce qu'il peut tuer ou arrêter sans perdre son bloqueur, et bloque tout quand sa vie est en danger. Interaction : à partir de leur 2e tour,
   30 % du temps un adversaire retire ta meilleure menace (créature, commandant, pièce du moteur, condition de victoire) ; 70 % des parties, un balayage
   aux tours 5 à 7 dès que tu as 3 créatures (jamais après le tour 8). En face : tes retraits enlèvent leur plus gros bloqueur, tes balayages remettent
   les plateaux à zéro quand tu es en retard, ta protection (permanent : ta meilleure créature ne peut plus être ciblée ; éphémère gardé avec le mana
   pour le payer, contresorts compris : un retrait ou un balayage évité), ta récursion ramène la meilleure carte morte (sur le champ de bataille pour la
   réanimation). Un commandant mort revient dans la zone de commandement (+2 à son coût).
   Résultats : mains gardées, commandant à temps, terrains manqués, couleurs bloquées, mana utilisé ; un adversaire éliminé avant le tour 11, adversaires
   éliminés, table battue, moteur en place, moteur encore là au tour 10 et après le balayage, cartes vues au tour 6. Graine fixe (même deck, mêmes
   résultats). Aucune IA : du hasard et des règles simples, les mêmes pour tous les decks : elles comparent, elles ne prédisent pas. */
const DSIM = { sig: '', res: null, run: null }, DSIM_N = 10000;      // 10 000 parties : ≈ 2 s sur un téléphone moyen, pourcentages stables à ±1 point
/** Table : 3 adversaires (vie, blessures de commandant), leur plateau (bloqueurs) et leur interaction ; les mêmes pour tous les decks. turns : tours joués. */
const DSIM_OPP = { turns: 10, n: 3, life: 40, cmd: 21, grow: 0.45, from: 2, max: 4, sz0: 1, sz: 0.4, fly: 0.25, rm: 0.3, rmFrom: 2, wipe: 0.7, wipeT: [5, 6, 7], wipeLast: 8, wipeMin: 3, danger: 15 };
const dsimSize = t => Math.round(DSIM_OPP.sz0 + t * DSIM_OPP.sz);      // force et endurance d'un bloqueur posé au tour t
/** Cartes du deck X pour la simulation : bibliothèque (99 cartes ou moins) et commandant(s). */
function dsimDeck(X) {
  const cmd = dwCmdOf(X), ci = cmd ? [...cmd.ci] : [], lib = [];
  const plan = typeof dmxPlan === 'function' && cmd ? dmxPlan(cmd, X.wiz || dwDefaults()) : null, main = plan ? plan.main.slice(0, 3) : [];      // mécaniques principales du plan : moteur assemblé quand une carte qui les fournit et une qui en profite sont en jeu
  const spec = (k, name, cix) => {
    const x = dwCard(k) || {}, m = dmOf(k) || {}, land = BASIC_NAMES.has(k) || !!((x.roles || 0) & DW_RB.land);
    const pv = dwPips(m.mc || x.mc || ''), pips = {}; let gen = 0;
    for (const [c, n] of Object.entries(pv)) { const f = Math.floor(n + 1e-9); if (f) pips[c] = f; gen += n - f; }      // hybride (demi-symboles) : générique
    const cmc = Number.isFinite(x.cmc) ? x.cmc : Number(m.cm) || 0, bc = dwBasicColor(k);
    let prod = new Set([...(land ? bc || String(x.prod || '') : String(x.prod || ''))].filter(c => 'WUBRGC'.includes(c)));
    const R = x.roles || 0, ramp = !land && !!(R & DW_RB.ramp);
    if (land && !prod.size) prod = new Set(['C']);      // terrain utilitaire : mana incolore
    if (ramp && !prod.size) prod = new Set(ci.length ? ci : ['C']);      // rampe qui cherche des terrains (Cultivate…) : les couleurs du deck
    // ce que fait la carte une fois en jeu (classement par mécaniques, rôles, force et mots-clés) : estimations simples, les mêmes pour tous les decks
    const mm = typeof dmx === 'function' ? dmx(k) : null, ty = x.ty || 0, perm = !(ty & 48) && !land, has = t => !!mm && mm.p.includes(dmxTag(t));
    const cre = !!(ty & 2) && !land, pt = Array.isArray(x.pt) ? x.pt : null, kw = pt ? pt[2] || 0 : 0, est = Math.min(6, Math.max(1, Math.round((cmc || 1) * 0.8)));      // base sans forces (ancienne) ou force * / X : estimée d'après le coût
    const pow = cre ? (pt && Number.isFinite(pt[0]) ? Math.max(0, pt[0]) : est) : 0, tou = cre ? (pt && Number.isFinite(pt[1]) ? Math.max(1, pt[1]) : est) : 0;
    const dr = R & DW_RB.draw ? (perm ? 0.5 : 2) : 0, tok = has('tokens-creature') ? (perm ? 1 : 2) : 0, dA = has('drain') ? (perm ? 1 : 2) : 0, dO = !dA && has('burn') ? (perm ? 1 : 3) : 0;
    const win = !!(R & DW_RB.wincon), ep = !!mm && main.some(i => mm.p.includes(i)), ew = !!mm && main.some(i => mm.w.includes(i));
    const ev = !!(kw & 1), ds = !!(kw & 8), cm = cix != null;
    const thr = (cre ? pow * (ds ? 2 : 1) * (ev ? 1.5 : 1) : 0) + (cm ? 2 : 0) + (ep || ew ? 3 : 0) + (win && perm ? 4 : 0) + (tok && perm ? 2 : 0) + (dr && perm ? 1.5 : 0) + ((dA || dO) && perm ? 2 : 0);      // menace aux yeux des adversaires (cible de leurs retraits)
    return { k, n: name, land, cmc, pips, gen: Math.round(gen), prod: [...prod], ramp, perm, cre, pow, tou, ev, tr: !!(kw & 2), hs: !!(kw & 4), ds, dt: !!(kw & 16), hx: !!(kw & 32), ind: !!(kw & 64),
      gEv: has('evasion'), gHs: has('haste'), gDs: has('double-strike'), rean: has('reanimation'), dr, tok, dA, dO, win, ep, ew, thr, cm, ci: cix || 0,
      rm: !!(R & DW_RB.removal), wp: !!(R & DW_RB.wipe), pr: perm && !!(R & DW_RB.protect), rc: !!(R & DW_RB.recursion), guard: !perm && !land && !!(R & (DW_RB.protect | DW_RB.counter)), ct: !!(R & DW_RB.counter) };
  };
  for (const c of X.main.values()) { const s = spec(c.key, c.name); for (let i = 0; i < c.qty; i++) lib.push(s); }
  return { lib, cmdr: X.cmdr.map((c, i) => spec(c.key, c.name, i)), main: main.length };
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
  const O = DSIM_OPP, lands0 = hand.filter(c => c.land).length, field = [], pending = [], board = [], gy = [];      // board : { s, t } (t : tour d'arrivée) ; gy : permanents morts (récursion)
  let cmdTurn = 0, missed3 = false, missed4 = false, screw4 = false, avail16 = 0, spent16 = 0, cast6 = 0;
  let dmg = 0, killT = 0, tableT = 0, engT = 0, winT = 0, drawAcc = 0, seen6 = 7, dmg8 = 0, tk = 0, tkNew = 0, cmdKill = false, saved = 0, lost = 0;      // dmg : blessures infligées à la table ; tk : jetons créature 1/1 prêts à attaquer (tkNew : arrivés ce tour)
  let alive = O.n, cur = 1, wipeT = 0, engPre = false, wsHas = false, wsOK = false;
  const life = [], cd = [], blk = [], dead = [];      // par adversaire : vie, blessures de chaque commandant, bloqueurs (force × 2 + 1 s'il vole), tour de son élimination
  for (let o = 0; o < O.n; o++) { life.push(O.life); cd.push(D.cmdr.map(() => 0)); blk.push([]); dead.push(0); }
  const wipeAt = rnd() < O.wipe ? O.wipeT[Math.floor(rnd() * O.wipeT.length)] : 0, tax = D.cmdr.map(() => 0);
  const cmdLeft = D.cmdr.slice();
  const down = o => { if (dead[o]) return; dead[o] = cur; alive--; blk[o].length = 0; if (!killT) killT = cur; if (!alive) tableT = cur; };
  const hit = (o, n) => { if (o < 0 || dead[o] || n <= 0) return; const v = Math.min(n, life[o]); life[o] -= n; dmg += v; if (life[o] <= 0) down(o); };
  const hitAll = n => { for (let o = 0; o < O.n; o++) hit(o, n); };
  const target = () => { let b = -1; for (let o = 0; o < O.n; o++) if (!dead[o] && (b < 0 || life[o] < life[b] || (life[o] === life[b] && blk[o].length < blk[b].length))) b = o; return b; };      // l'adversaire le plus bas en vie
  const nBlk = () => blk.reduce((a, b) => a + b.length, 0), nCre = () => board.reduce((a, e) => a + (e.s.cre ? 1 : 0), 0) + tk + tkNew;
  const engOn = () => !!D.main && board.some(e => e.s.ep) && board.some(e => e.s.ew);
  const died = e => { const i = board.indexOf(e); if (i >= 0) board.splice(i, 1); if (e.s.cm) { tax[e.s.ci] += 2; cmdLeft.push(e.s); } else gy.push(e.s); };      // commandant : zone de commandement, 2 de plus à payer
  const shielded = () => { if (!board.some(e => e.s.pr)) return null; let b = null; for (const e of board) if (e.s.cre && (!b || e.s.thr > b.s.thr)) b = e; return b; };      // protection permanente (bottes, équipement, Mère des runes) : ta meilleure créature
  const killBlk = () => { let bo = -1, bi = -1; const o0 = target(); for (let o = 0; o < O.n; o++) if (!dead[o]) for (let i = 0; i < blk[o].length; i++) if (bi < 0 || (o === o0) > (bo === o0) || ((o === o0) === (bo === o0) && blk[o][i] > blk[bo][bi])) { bo = o; bi = i; } if (bi >= 0) blk[bo].splice(bi, 1); };      // ton retrait : le plus gros bloqueur, chez l'adversaire visé d'abord
  const wipeAll = mine => { for (const b of blk) b.length = 0; if (!mine) return; for (const e of board.slice()) if (e.s.cre && !e.s.ind) died(e); tk = tkNew = 0; };
  const recur = (t, rean) => { let b = -1; for (let i = 0; i < gy.length; i++) if (b < 0 || gy[i].thr > gy[b].thr) b = i; if (b < 0) return; const s = gy.splice(b, 1)[0]; if (s.cre && (rean || board.some(e => e.s.rean))) board.push({ s, t }); else hand.push(s); };      // récursion : la meilleure carte morte, en jeu pour la réanimation
  const play = (s, t) => {      // effet d'une carte qui résout
    if (s.perm) board.push({ s, t });
    else { if (s.dr) { for (let i = 0; i < s.dr && lib.length; i++) hand.push(lib.shift()); if (t <= 6) seen6 += s.dr; } tkNew += s.tok; if (s.dA) hitAll(s.dA); if (s.dO) hit(target(), s.dO); }
    if (s.rm && nBlk()) killBlk();
    if (s.wp) wipeAll(!s.perm);      // balayage en permanent (Massacre Wurm…) : leurs créatures seulement
    if (s.rc) recur(t, s.rean);
    if (s.win && !winT) { winT = t; hitAll(10); }      // condition de victoire lancée : la partie bascule (Craterhoof, Approach, gros drain…)
  };
  const useful = s => !s.guard && (s.perm || ((!s.rm || nBlk() > 0) && (!s.wp || nBlk() >= Math.max(3, nCre() + 3)) && (!s.rc || gy.some(x => x.thr >= 2))));      // sorts gardés en main tant qu'ils n'ont rien à faire (retrait sans cible, balayage quand tu mènes) ; protection et contresorts : gardés pour leur tour
  for (let t = 1; t <= DSIM_OPP.turns; t++) {
    cur = t;
    if (!(t === 1 && onPlay) && lib.length) { hand.push(lib.shift()); if (t <= 6) seen6++; }
    tk += tkNew; tkNew = 0;
    for (const e of board) { const s = e.s; if (s.dr) drawAcc += s.dr; tkNew += s.tok; if (s.dA) hitAll(s.dA); if (s.dO && alive) hit(target(), s.dO); }      // moteurs de pioche, jetons, drain et blessures chaque tour
    while (drawAcc >= 1 && lib.length) { hand.push(lib.shift()); drawAcc--; if (t <= 6) seen6++; }
    field.push(...pending.splice(0));
    const lands = hand.filter(c => c.land);
    if (lands.length) {      // le terrain qui apporte une couleur demandée par la main et pas encore produite, sinon le plus polyvalent
      const want = new Set(); for (const c of [...hand, ...cmdLeft]) for (const col of Object.keys(c.pips || {})) if (!field.some(p => p.includes(col))) want.add(col);
      const l = lands.sort((a, b) => b.prod.filter(x => want.has(x)).length - a.prod.filter(x => want.has(x)).length || b.prod.length - a.prod.length)[0];
      hand.splice(hand.indexOf(l), 1); field.push(l.prod);
    } else { if (t <= 3) missed3 = true; if (t <= 4) missed4 = true; }
    let avail = field.slice(); const total = avail.length; let spent = 0;
    let g = null; for (const c of hand) if (c.guard && (!g || c.cmc < g.cmc)) g = c;      // protection ou contresort gardé : son mana reste ouvert quand tu as quelque chose à protéger
    const keepG = g && board.some(e => e.s.thr >= 2);
    const cast = (s, free) => { const r = dsimPay(avail, s); if (!r) return false; if (keepG && !free && !dsimPay(r, g) && dsimPay(avail, g)) return false; spent += avail.length - r.length; avail = r; return true; };
    for (const c of cmdLeft.slice()) { const cs = tax[c.ci] ? { ...c, cmc: c.cmc + tax[c.ci] } : c; if (cast(cs, true)) { cmdLeft.splice(cmdLeft.indexOf(c), 1); if (!cmdTurn && t <= 8) cmdTurn = t; play(c, t); } }      // tours 9 et 10 : le plan seulement (mesures de mana sur les 8 premiers)
    for (const s of hand.filter(c => !c.land && c.ramp && useful(c)).sort((a, b) => a.cmc - b.cmc)) if (cast(s)) { hand.splice(hand.indexOf(s), 1); pending.push(s.prod); if (t <= 6) cast6++; play(s, t); }
    for (const s of hand.filter(c => !c.land).sort((a, b) => b.cmc - a.cmc)) if (s.cmc <= avail.length && hand.includes(s) && useful(s) && cast(s)) { hand.splice(hand.indexOf(s), 1); if (t <= 6) cast6++; play(s, t); }
    const armed = g && hand.includes(g) && dsimPay(avail, g) ? g : null; if (armed) spent += armed.cmc;      // mana gardé pour la protection : compté comme utilisé
    if (engOn()) { if (!engT) engT = t; }
    if (alive) {      // combat : l'adversaire le plus bas en vie
      const o = target(), B = blk[o].slice().sort((a, b) => b - a), hasteAll = board.some(e => e.s.gHs), sMax = B.length ? B[0] >> 1 : 0, att = [];
      for (const e of board) if (e.s.cre && e.s.pow > 0 && (e.t < t || e.s.hs || hasteAll)) att.push(e);
      att.sort((a, b) => b.s.pow - a.s.pow);
      let nEv = 0, nDs = 0; for (const e of board) { if (e.s.gEv) nEv++; if (e.s.gDs) nDs++; }      // cartes qui donnent évasion ou double initiative : à tes plus grosses créatures
      const A = [];
      for (const e of att) {
        const s = e.s, ev = s.ev || (nEv > 0 && nEv-- > 0), ds = s.ds || (nDs > 0 && nDs-- > 0), d = s.pow * (ds ? 2 : 1);
        if (ev || s.tr || s.dt || s.ind || s.tou > sMax || s.pow >= sMax) A.push({ e, s, ev, ds, d });      // n'attaque pas pour mourir sans rien tuer
      }
      const used = new Array(B.length).fill(false), inc = A.reduce((a, x) => a + x.d, 0) + Math.max(0, tk - B.length), danger = life[o] - inc <= O.danger;
      let through = 0; const cmdHit = [];
      for (const x of A) {
        let bi = -1; for (let i = 0; i < B.length; i++) if (!used[i] && (!x.ev || B[i] & 1)) { bi = i; break; }      // le plus gros bloqueur qui peut le bloquer
        let killsIt = false, dies = false;
        if (bi >= 0) { const bs = B[bi] >> 1; killsIt = !x.s.ind && bs >= x.s.tou && !(x.ds && (x.s.pow >= bs || x.s.dt)); dies = x.s.dt || x.d >= bs; if (!(killsIt || !dies || danger)) bi = -1; }      // bloque s'il tue l'attaquant, s'il survit, ou si sa vie est en danger
        if (bi < 0) { through += x.d; if (x.s.cm) cmdHit.push([x.s.ci, x.d]); continue; }
        used[bi] = true; const bs = B[bi] >> 1, tr = x.s.tr ? Math.max(0, x.d - bs) : 0; through += tr; if (x.s.cm && tr) cmdHit.push([x.s.ci, tr]);
        if (dies) B[bi] = -1; if (killsIt) died(x.e);
      }
      const left = used.reduce((a, u, i) => a + (!u && B[i] >= 0 ? 1 : 0), 0);
      if (tk > left) { through += tk - left; tk -= left; }      // jetons : ils attaquent quand ils sont plus nombreux que les bloqueurs restants (chaque bloqueur en tue un)
      blk[o] = B.filter(v => v >= 0);
      hit(o, through);
      for (const [c, n] of cmdHit) if (!dead[o]) { cd[o][c] += n; if (cd[o][c] >= O.cmd) { cmdKill = true; down(o); } }
    }
    if (wsHas && wipeT === t - 1) wsOK = engOn();      // moteur qui survit au balayage : encore (ou de nouveau) en place à la fin de ton tour suivant
    if (t === 8) dmg8 = dmg;
    if (t === 4 || t === 5) for (const s of hand) if (!s.land && s.cmc <= total && !dsimPay(field.slice(), s)) { if (t === 4) screw4 = true; stuck.set(s.n, (stuck.get(s.n) || 0) + (t === 5 ? 1 : 0)); }      // assez de mana, pas les bonnes couleurs
    if (t <= 6) { avail16 += total; spent16 += Math.min(total, spent); }
    if (t === DSIM_OPP.turns || !alive) break;
    // tours des adversaires : leur plateau grandit, un retrait de temps en temps, un balayage probable
    let guard = armed;
    const stop = () => { if (!guard) return false; hand.splice(hand.indexOf(guard), 1); guard = null; saved++; return true; };
    for (let o = 0; o < O.n; o++) if (!dead[o] && t >= O.from && blk[o].length < O.max && rnd() < O.grow) blk[o].push(dsimSize(t) * 2 + (rnd() < O.fly ? 1 : 0));
    if (t >= O.rmFrom && rnd() < O.rm) {      // retrait ciblé sur ta meilleure menace (ni défense talismanique, ni protégée)
      const sh = shielded(); let b = null; for (const e of board) if (e.s.thr >= 2 && !e.s.hx && e !== sh && (!b || e.s.thr > b.s.thr)) b = e;
      if (b && !stop()) { died(b); lost++; }
    }
    if (wipeAt && !wipeT && t >= wipeAt && t <= O.wipeLast && nCre() >= O.wipeMin) {      // balayage : toutes les créatures (les leurs aussi)
      wipeT = t; engPre = engOn();
      if (guard && guard.ct) stop();      // contresort : balayage annulé
      else if (guard) { const keep = rnd() < 0.5 ? null : shielded() || board.filter(e => e.s.cre).sort((a, b) => b.s.thr - a.s.thr)[0]; stop(); wipeAll(false); if (keep) { for (const e of board.slice()) if (e.s.cre && !e.s.ind && e !== keep) { died(e); lost++; } tk = tkNew = 0; } }      // protection : tout le plateau une fois sur deux (Teferi's Protection), sinon ta meilleure créature
      else { lost += board.filter(e => e.s.cre && !e.s.ind).length; wipeAll(true); }
      wsHas = engPre;
    }
  }
  return { mull, lands0, cmdTurn, missed3, missed4, screw4, eff: avail16 ? spent16 / avail16 : 0, cast6, killT, tableT, elim: O.n - alive, cmdKill, engT, engEnd: engOn(), wiped: !!wipeT, wsHas, wsOK, saved, lost, winT, dmg8, seen6 };
}
/** n parties (par paquets de 250, sans bloquer l'écran) : résultats agrégés. step(fait, total) : progression. */
async function dsimRun(X, n = 1000, step) {
  const D = dsimDeck(X); if (D.lib.length < 40) return null;
  let seed = 7; for (const k of D.lib.map(c => c.k).sort()) for (let i = 0; i < k.length; i++) seed = (seed * 31 + k.charCodeAt(i)) | 0;
  const rnd = dsimRng(seed), stuck = new Map(), cmv = Math.max(0, ...D.cmdr.map(c => c.cmc));
  const acc = { keep7: 0, mull: 0, lands0: 0, cmdT: 0, cmdOn: 0, cmdNever: 0, miss3: 0, miss4: 0, screw4: 0, eff: 0, cast6: 0, kill: 0, killT: 0, table: 0, tableT: 0, elim: 0, cmdKill: 0, eng: 0, engT: 0, engEnd: 0, wiped: 0, wsHas: 0, wsOK: 0, saved: 0, lost: 0, win8: 0, dmg8: 0, seen6: 0 };
  const T1 = DSIM_OPP.turns + 1;
  for (let i = 0; i < n; i++) {
    const g = dsimGame(D, rnd, i % 2 === 0, stuck);
    acc.keep7 += g.mull === 0; acc.mull += g.mull; acc.lands0 += g.lands0; acc.cmdT += g.cmdTurn || 9; acc.cmdOn += g.cmdTurn && g.cmdTurn <= Math.max(1, cmv) ? 1 : 0; acc.cmdNever += !g.cmdTurn;
    acc.miss3 += g.missed3; acc.miss4 += g.missed4; acc.screw4 += g.screw4; acc.eff += g.eff; acc.cast6 += g.cast6;
    acc.kill += !!g.killT; acc.killT += g.killT || T1; acc.table += !!g.tableT; acc.tableT += g.tableT || T1; acc.elim += g.elim; acc.cmdKill += g.cmdKill;
    acc.eng += !!g.engT; acc.engT += g.engT || T1; acc.engEnd += g.engEnd; acc.wiped += g.wiped; acc.wsHas += g.wsHas; acc.wsOK += g.wsHas && g.wsOK; acc.saved += g.saved; acc.lost += g.lost;
    acc.win8 += !!(g.winT && g.winT <= 8); acc.dmg8 += g.dmg8; acc.seen6 += g.seen6;
    if (i % 250 === 249) { if (step) step(i + 1, n); await new Promise(r => setTimeout(r, 0)); }      // par paquets de 250 : l'écran reste fluide pendant le calcul
  }
  const pct = v => Math.round(v / n * 100);
  return { n, cmv, keep7: pct(acc.keep7), mull: acc.mull / n, lands0: acc.lands0 / n, cmdT: acc.cmdT / n, cmdOn: pct(acc.cmdOn), cmdNever: pct(acc.cmdNever), miss3: pct(acc.miss3), miss4: pct(acc.miss4), screw4: pct(acc.screw4), eff: Math.round(acc.eff / n * 100), cast6: acc.cast6 / n,
    kill10: pct(acc.kill), killT: acc.killT / n, elim10: acc.elim / n, table: pct(acc.table), tableT: acc.tableT / n, cmdKill: pct(acc.cmdKill),
    eng: D.main ? pct(acc.eng) : null, engT: acc.engT / n, engKeep: D.main ? pct(acc.engEnd) : null, wipeSurv: D.main && acc.wsHas >= n * 0.05 ? Math.round(acc.wsOK / acc.wsHas * 100) : null,
    wiped: pct(acc.wiped), saved: acc.saved / n, lost: acc.lost / n, win8: pct(acc.win8), dmg8: acc.dmg8 / n, seen6: acc.seen6 / n,
    stuck: [...stuck].filter(([, v]) => v / n >= 0.04).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([name, v]) => [name, pct(v)]) };
}
const dsimSig = X => [...X.cmdr.map(c => c.key), ...[...X.main.values()].map(c => c.key + ':' + c.qty).sort()].join('|');
const dsimNum = v => Number(v).toLocaleString(LOC(), { maximumFractionDigits: 1 });
const dsimPct = v => T('{n} %', { n: Number(v).toLocaleString(LOC()) });      // « 74 % » en français, « 74% » en anglais (dictionnaires)
/** Section du rapport : résultats (ou barre de progression pendant le calcul). */
function dsimHtml(r, prog) {
  let h = `<div class="sec-title">${T('Simulation de {n} parties', { n: nf0(DSIM_N) })}</div><p class="hint">${T('Le coach a joué les 10 premiers tours avec ce deck, {n} fois, face à 3 adversaires à 40 points de vie : mains de départ, terrains, couleurs, commandant, puis le plan (attaques contre leurs bloqueurs, jetons, drain, moteurs), leurs retraits et un balayage probable entre les tours 5 et 7. Des règles simples et du hasard.', { n: nf0(DSIM_N) })}</p>`;
  if (!r) return h + `<div class="ds-prog"><span class="ds-big"><i style="width:${Math.round((prog || 0) * 100)}%"></i></span><p class="ds-now">${T('Parties en cours…')}</p></div>`;
  const row = (ok, big, t, sub) => `<li class="${ok ? 'ok' : 'warn'}"><b>${esc(big)}</b> ${esc(t)}${sub ? ` <small>${esc(sub)}</small>` : ''}</li>`;
  h += `<ul class="bd-issues ds-sim">
    ${row(r.keep7 >= 74, dsimPct(r.keep7), T('des mains de 7 cartes gardées'), T('{l} terrains en moyenne dans la main gardée', { l: dsimNum(r.lands0) }))}
    ${r.cmv ? row(r.cmdOn >= 55, dsimPct(r.cmdOn), T('commandant lancé à temps (tour {t} ou avant)', { t: r.cmv }), T('tour {t} en moyenne', { t: dsimNum(r.cmdT) }) + (r.cmdNever ? ' · ' + T('jamais avant le tour 9 : {p}', { p: dsimPct(r.cmdNever) }) : '')) : ''}
    ${row(r.miss3 <= 20, dsimPct(r.miss3), T('des parties sans terrain à poser avant le tour 4'), T('{p} avant le tour 5', { p: dsimPct(r.miss4) }))}
    ${row(r.screw4 <= 10, dsimPct(r.screw4), T('des parties bloquées par les couleurs au tour 4'), T('assez de mana, pas la bonne couleur'))}
    ${row(r.eff >= 70, dsimPct(r.eff), T('du mana disponible utilisé (tours 1 à 6)'), T('{n} sorts lancés en moyenne', { n: dsimNum(r.cast6) }))}
    ${r.kill10 != null ? row(r.kill10 >= 30, dsimPct(r.kill10), T('des parties où au moins un adversaire tombe avant le tour 11'), r.elim10 != null ? T('{e} adversaires éliminés sur 3 en moyenne', { e: dsimNum(r.elim10) }) + (r.table ? ' · ' + T('table battue : {p}', { p: dsimPct(r.table) }) : '') : '') : ''}
    ${r.eng != null ? row(r.eng >= 50, dsimPct(r.eng), T('des parties où le moteur du plan est en place avant le tour 11'), r.eng ? T('tour {t} en moyenne', { t: dsimNum(r.engT) }) : '') : ''}
    ${r.engKeep != null && r.eng ? row(r.engKeep >= 0.6 * r.eng, dsimPct(r.engKeep), T('des parties où le moteur est encore là au tour 10, malgré les retraits et le balayage'), r.wipeSurv != null ? T('moteur encore là au tour qui suit le balayage : {p}', { p: dsimPct(r.wipeSurv) }) : '') : ''}
    ${r.seen6 != null ? row(r.seen6 >= 14, dsimNum(r.seen6), T('cartes vues au tour 6 (main, pioche, moteurs)'), '') : ''}</ul>`;
  if (r.stuck.length) h += `<p class="dr-p"><b>${T('Souvent bloquées par les couleurs')} :</b> ${r.stuck.map(([n, p]) => drCard(ownKey(n), n) + ` <small>(${dsimPct(p)})</small>`).join(', ')}</p>`;
  const adv = [];
  if (r.keep7 < 72) adv.push(T('Trop de mains à refaire : vise 36 à 38 terrains, ou ajoute de la rampe à 2 mana ou moins.'));
  if (r.miss3 > 20) adv.push(T('Terrains manqués trop souvent : un ou deux terrains de plus, ou de la pioche pas chère.'));
  if (r.screw4 > 10) adv.push(T('Couleurs mal servies : remplace des terrains de base par des terrains qui produisent plusieurs couleurs.'));
  if (r.cmv && r.cmdOn < 55) adv.push(T('Commandant souvent en retard : plus de rampe à 2 mana ou moins.'));
  if (r.eff < 70) adv.push(T('Mana souvent inutilisé : plus de sorts à 2 et 3 mana.'));
  if (r.kill10 != null && r.elim10 != null && r.kill10 < 20) adv.push(T('La table tient bon : plus de créatures qui passent les bloqueurs (vol, piétinement, menace), des retraits pour leurs bloqueurs, ou une condition de victoire.'));
  if (r.eng != null && r.eng < 50) adv.push(T('Moteur du plan rarement en place : plus de cartes qui le fournissent, ou un tuteur.'));
  if (r.engKeep != null && r.eng >= 50 && r.engKeep < 0.6 * r.eng) adv.push(T('Moteur souvent détruit par les adversaires : de la protection (équipements, contresorts, sorts qui protègent) ou de la récursion pour le remonter.'));
  if (r.seen6 != null && r.seen6 < 13) adv.push(T('Peu de cartes vues : un ou deux moteurs de pioche de plus.'));
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
