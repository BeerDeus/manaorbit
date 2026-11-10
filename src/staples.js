/* ── staples.js : « Chasse aux staples » (Compte et réglages › Mon compte, compte de l'éditeur seulement : event.js › evAdmOn) ─────────────────
   Liste d'achat de cartes bon marché qui servent dans presque tous les decks : les plus jouées dans les decks EDHREC qui peuvent les jouer, pondérées par
   leur force et leurs rôles (classement du coach, data/card-mech.json), hors cartes déjà là. Pour composer une commande CardTrader de « staples » à quelques centimes.
   Réglages (gardés sur l'appareil, deckdeal:stp) : nombre de cartes, exemplaires par carte (1-4), prix maximum (tendance Cardmarket, impression la moins chère :
   relevé du jour, data.js › pxTable), vérification CardTrader et sa marge, commandants (ceux de Mes decks ou n'importe lesquels de la base EDHREC), couleurs, rôles, mécaniques.
   Règles :
   · une carte est proposée si tu n'en as pas assez d'exemplaires LIBRES (extras.js › ownFree : possédés − réservés par les decks montés) ; quantité = voulus − libres ;
   · exclues : terrains de base, cartes interdites en Commander (drapeau 16 de la base du coach), prix inconnu ou ≥ prix maximum ;
   · prix écarté (carte non proposée) quand la cote € est 5 fois sous la cote $ (impression mal rattachée : même règle que gen-prices.mjs › pxAdd) ;
   · score sans commandant : popularité (part pondérée des decks EDHREC dont l'identité permet la carte, stpPopIndex, et rang EDHREC général : stpPopScore) + force + rôles utilitaires (+ plan des mécaniques
     choisies, deckmech.js › dmxFit) ; répartition équilibrée par couleur (W, U, B, R, G, multicolore, incolore : stpQuotas) ;
   · avec un ou plusieurs commandants (10 au plus) : la valeur du coach pour chacun (deckwiz.js › dwInfo, dwVal : inclusion, synergie, fiche IA, plan), pièges écartés ;
     une carte doit tenir dans l'identité d'au moins un d'entre eux, elle est rangée chez celui pour qui elle vaut le plus (bonus si elle sert aussi les autres),
     et la liste est répartie à parts égales entre les commandants (même seuil de qualité que les couleurs) ;
   · vérification CardTrader (facultative, longue : offres réelles carte par carte, data.js › runLive comme collection.js › pxRun) : une carte dont l'offre la moins chère
     (critères de la recherche : état, mode, langue, repli anglais) n'est pas sous prix maximum + marge est remplacée par la suivante du classement (même couleur).
     Prix lus gardés 2 jours sur l'appareil (deckdeal:stp:ct) ; la vérification continue si la fiche est fermée (pastille flottante).
   Sortie : « Copier » (« 1 Nom » par ligne) ou « Envoyer dans Prix d'une liste » (app.js › putDeckText). ✕ sur une ligne : écartée de cette liste seulement.
   Historique : les 10 dernières recherches (réglages et liste) en tête des réglages, sur l'appareil et dans le compte ; ✕ en retire une ; rouverte, ses cartes
   sont recontrôlées sur la collection seulement (pas de nouvelle vérification CardTrader : Prix d'une liste relit tous les prix). */
const STP_KEY = 'deckdeal:stp', STP_CT_KEY = 'deckdeal:stp:ct', STP_CT_TTL = 2 * 864e5;
const STP_N = [50, 100, 150, 200, 300], STP_ND = [200, 500, 1000, 2000], STP_ND_MAX = 2000,      // decks analysés sans commandant : choix proposés, et plafond absolu (jamais plus, quel que soit le réglage enregistré)
  STP_MAXS = [10, 15, 25, 50], STP_CMD_MAX = 10;
const STP_ROLES = [['ramp', 'Rampe'], ['draw', 'Pioche'], ['removal', 'Retraits ciblés'], ['wipe', 'Balayages'], ['counter', 'Contresorts'], ['protect', 'Protection'], ['recursion', 'Récursion'],
  ['tutor', 'Tuteurs'], ['fixing', 'Couleurs (fixing)'], ['wincon', 'Conditions de victoire'], ['land', 'Terrains']];
const STP_UTIL = ['ramp', 'draw', 'removal', 'wipe', 'counter', 'protect', 'recursion', 'tutor', 'fixing'];      // rôles « utilitaires » : un petit bonus au score
const STP_GROUPS = ['W', 'U', 'B', 'R', 'G', 'M', 'C'];
const STP_GROUP_NAMES = { W: 'Blanc', U: 'Bleu', B: 'Noir', R: 'Rouge', G: 'Vert', M: 'Multicolore', C: 'Incolore' };
/** Types (bits de la base du coach, gen-deckdb.mjs › TYPE_BITS), dans l'ordre d'affichage : une carte va dans le premier qui la décrit (créature-artefact : créature). */
const STP_TYPES = [[1, 'land', 'Terrains'], [2, 'cre', 'Créatures'], [64, 'pw', 'Planeswalkers'], [128, 'bat', 'Batailles'], [16, 'ins', 'Éphémères'], [32, 'sor', 'Rituels'], [4, 'art', 'Artefacts'], [8, 'enc', 'Enchantements']];
const stpTypeOf = ty => (STP_TYPES.find(t => ty & t[0]) || [0, 'oth'])[1];
/** Classement de l'affichage (et de la liste copiée) : '' (couleur, ou commandant), 'type' ou 'role'. Seul l'ordre change, jamais les cartes retenues. */
function stpGrp(R) {
  const m = STP.o && STP.o.grp;
  if (m === 'type') return { m, key: x => stpTypeOf(x.ty || 0), order: [...STP_TYPES.map(t => t[1]), 'oth'] };
  if (m === 'role') return { m, key: x => x.r1 || 'none', order: [...STP_ROLES.map(r => r[0]), 'none'] };
  return R.bal ? { m: '', key: x => x.g, order: R.order || STP_GROUPS } : null;
}
const STP = { o: null, api: null, q: '', res: null, run: null, pop: null, ct: null, task: null, prog: null, stop: false, deep: null, h: null, hu: 0, hw: '', hdoc: { uid: '', unsub: null, pushT: 0 } };      // h : historique (stpHLoad)
const STP_DEEP_MS = 40000, STP_GEN_MS = 12000;      // analyse approfondie : temps donné au coach pour construire les decks d'un commandant choisi (4 versions, 3 tirages) / d'un commandant de l'échantillon (1 version)

/* ── Calcul (sans DOM : tests/test-staples.mjs) ───────────────────────────────────────────────────── */
const stpMask = ci => { let m = 0; for (const c of String(ci || '')) { const i = 'WUBRG'.indexOf(c); if (i >= 0) m |= 1 << i; } return m; };
/** Groupe de répartition d'une identité : la couleur seule, M (multicolore) ou C (incolore). */
const stpGroup = ci => { const c = [...new Set(String(ci || '').replace(/[^WUBRG]/g, ''))]; return !c.length ? 'C' : c.length === 1 ? c[0] : 'M'; };
/** Popularité de chaque carte dans les decks EDHREC (E : edhIndex) : Σ (poids du commandant × part de ses decks qui la jouent) / Σ poids des commandants dont
 *  l'identité permet la carte (ciOf(clé) : identité, ou null si inconnue → carte ignorée). Poids d'un commandant : log(1 + ses decks EDHREC). → Map(clé → 0..1). */
function stpPopIndex(E, ciOf) {
  const pop = new Map(); if (!E || !E.cmds || !E.decks) return pop;
  const nc = E.cmds.length, nd = new Uint32Array(nc), wc = new Float64Array(nc), W = new Float64Array(32), elig = new Float64Array(32);
  for (const d of E.decks) nd[d.cmd.i]++;
  for (const c of E.cmds) if (nd[c.i]) { wc[c.i] = Math.log1p(Math.max(1, c.decks || 0)); W[stpMask(c.ci)] += wc[c.i]; }
  for (let m = 0; m < 32; m++) for (let M = 0; M < 32; M++) if ((M & m) === m) elig[m] += W[M];      // commandants dont l'identité contient celle de la carte
  const pres = new Float64Array(E.names.length);
  E.decks.forEach((d, i) => { const w = wc[d.cmd.i] / nd[d.cmd.i]; for (let j = E.off[i], z = E.off[i + 1]; j < z; j++) pres[E.ids[j]] += w; });
  const by = new Map();
  for (let i = 0; i < pres.length; i++) if (pres[i] > 0 && !(E.bs && E.bs[i])) by.set(E.keys[i], (by.get(E.keys[i]) || 0) + pres[i]);      // deux numéros pour une même carte (face seule, nom complet) : additionnés
  for (const [k, p] of by) { const ci = ciOf(k); if (ci == null) continue; const e = elig[stpMask(ci)]; if (e > 0) pop.set(k, Math.min(1, p / e)); }
  return pop;
}
/** Quotas par groupe pour n cartes : parts égales (multicolore M : 0,7) ; arrondis au plus fort reste. → { groupe: nombre }. */
function stpQuotas(n, groups) {
  const w = g => (g === 'M' ? 0.7 : 1), tot = groups.reduce((a, g) => a + w(g), 0), q = {}, fr = []; let s = 0;
  if (!groups.length || n <= 0) return q;
  for (const g of groups) { const x = n * w(g) / tot; q[g] = Math.floor(x); s += q[g]; fr.push([g, x - q[g]]); }
  fr.sort((a, b) => b[1] - a[1]);
  for (let i = 0; s < n; i++, s++) q[fr[i % fr.length][0]]++;
  return q;
}
/** Choix des n cartes (ranked : [{ k, g, s }] du meilleur au moins bon) : chaque groupe jusqu'à son quota (quotas null : classement pur), puis les meilleures restantes.
 *  strict : sans seuil de qualité entre groupes (commandants : leurs scores ne se comparent pas) ; une place ne passe à un autre groupe que s'il n'a plus de candidates.
 *  → { pick, rest } (rest : les suivantes, dans l'ordre du classement : réserve des remplacements). */
function stpPick(ranked, n, quotas, strict) {
  if (!quotas) return { pick: ranked.slice(0, n), rest: ranked.slice(n) };
  const cnt = {}, take = new Set(), pick = [], floor = strict || !ranked.length ? -Infinity : ranked[Math.min(n, ranked.length) - 1].s * 0.8;      // strict (commandants) : parts égales, sans seuil (leurs scores ne se comparent pas)      // un groupe ne remplit son quota qu'avec des cartes proches du niveau de la liste (pas d'incolores médiocres pour faire le compte)
  for (const x of ranked) { if (pick.length >= n || x.s < floor) break; const q = quotas[x.g] || 0; if ((cnt[x.g] || 0) < q) { cnt[x.g] = (cnt[x.g] || 0) + 1; take.add(x); pick.push(x); } }
  for (const x of ranked) { if (pick.length >= n) break; if (!take.has(x)) { take.add(x); pick.push(x); } }      // un groupe trop court : les meilleures des autres
  return { pick: ranked.filter(x => take.has(x)), rest: ranked.filter(x => !take.has(x)) };
}
/** Suivante de la réserve pour le groupe g (répartition équilibrée), sinon la meilleure de la réserve ; retirée de la réserve. */
function stpNext(R, g) {
  if (!R.rest.length) return null;
  let i = R.bal && g ? R.rest.findIndex(x => x.g === g) : 0; if (i < 0) i = 0;
  return R.rest.splice(i, 1)[0];
}
/** Ordre d'affichage (et de la liste copiée) : par groupe (stpGrp : couleur ou commandant si la répartition est équilibrée, type, rôle), puis du meilleur score au moins bon. */
const stpSorted = R => { const G = stpGrp(R); return [...R.list].sort((a, b) => (G ? G.order.indexOf(G.key(a)) - G.order.indexOf(G.key(b)) : 0) || b.s - a.s); };
/** Texte de la liste : « 1 Sol Ring » par ligne. */
const stpText = R => stpSorted(R).map(x => x.need + ' ' + x.name).join('\n');
/** Poids d'un deck d'après la note du coach (0-100) : les meilleurs comptent bien plus (95 → 0,81 ; 80 → 0,41 ; 60 → 0,13). */
const stpNoteW = t => Math.pow(Math.max(0, Math.min(100, Number(t) || 0)) / 100, 4);
/** Part pondérée des decks qui jouent chaque carte : decks [{ keys (clés), w (poids) }] → Map(clé → 0..1). */
function stpFreq(decks) {
  const m = new Map(); let W = 0;
  for (const d of decks) { if (!(d.w > 0)) continue; W += d.w; for (const k of new Set(d.keys)) m.set(k, (m.get(k) || 0) + d.w); }
  if (W > 0) for (const [k, v] of m) m.set(k, v / W);
  return m;
}
/** Commandants de l'analyse sans commandant, jusqu'à environ target decks (nOf(c) : decks qu'il apporte) : à tour de rôle entre les identités de couleur,
 *  chacune selon son poids (racine de ses decks EDHREC : les identités jouées passent plus souvent, les rares ne sont pas oubliées), le plus joué d'abord ;
 *  restreint aux identités qui partagent une couleur choisie (cols) et aux incolores. */
function stpSample(cmds, cols, target, nOf) {
  const by = new Map();
  for (const c of cmds) {
    if (c.comm || (cols && c.ci && ![...c.ci].some(x => cols.includes(x)))) continue;
    const k = String(c.ci || ''); if (!by.has(k)) by.set(k, { l: [], w: 0, n: 0 }); const g = by.get(k); g.l.push(c); g.w += c.decks || 0;
  }
  const gs = [...by.values()].map(g => ({ ...g, w: Math.sqrt(g.w) || 1, l: g.l.sort((a, b) => (a.rank || 1e9) - (b.rank || 1e9) || b.decks - a.decks) }));
  const out = []; let tot = 0;
  while (tot < target) {
    let best = null; for (const g of gs) if (g.n < g.l.length && (!best || g.n / g.w < best.n / best.w)) best = g;
    if (!best) break;
    const c = best.l[best.n++]; out.push(c); tot += Math.max(1, nOf(c));
  }
  return out;
}
/** Offre CardTrader acceptée ? (prix en centimes, null : aucune offre) : strictement sous prix maximum + marge. */
const stpCtOk = (p, o) => p != null && p < o.max + o.tol;

/* ── Réglages ─────────────────────────────────────────────────────────────────────────────────────── */
const stpDefaults = () => ({ n: 150, q: 1, max: 15, ct: true, tol: 5, cols: '', cless: true, cmds: [], tags: [], roles: [], deep: true, nd: 1000, grp: '', cart: true });
function stpLoad() {
  if (STP.o) return STP.o;
  let o = {}; try { o = JSON.parse(localStorage.getItem(STP_KEY) || '{}') || {}; } catch (e) { o = {}; }
  return (STP.o = stpNorm(o));
}
function stpSave() { try { localStorage.setItem(STP_KEY, JSON.stringify(STP.o)); } catch (e) { /* stockage refusé : pour cette session */ } }

/* ── Données ──────────────────────────────────────────────────────────────────────────────────────── */
/** Prix Cardmarket (tendance, impression la moins chère) en centimes d'euro : relevé du jour, sinon la base du coach ; 0 si inconnu. */
function stpEur(k, r) {
  const p = typeof PXT !== 'undefined' && PXT && PXT.map && PXT.map.get(k), us = typeof mkUs === 'function' && mkUs(), e = p ? (us ? p.u : p.e) : 0, u = p ? (us ? p.e : p.u) : 0;      // marché TCGplayer : la colonne € est dans u
  if (e && u >= 50 && e * 5 < u) return 0;      // cote Cardmarket aberrante (Badlands à 0,02 € pour 585 $ : impression mal rattachée) : prix inconnu, carte écartée
  return e || (!p && r && r[5]) || 0;
}
/** Popularité d'une carte, 0 à 1 : part des decks EDHREC qui peuvent la jouer (échelle log : 1 % → 0,35, 5 % → 0,57, 26 % → 0,81) et rang EDHREC général (r[8] : 50 → 0,6, 1 000 → 0,3). */
const stpPopScore = (p, rank) => 0.5 * Math.min(1, Math.log10(1 + 1000 * (p || 0)) / 3) + 0.5 * (rank > 0 ? Math.max(0, 1 - Math.log10(rank) / 4.3) : 0);
/** Rôle d'une carte : classement par mécaniques, sinon les rôles de la base. */
const stpRole = (m, r, role) => (m ? dmxRole(m, role) : !!(DW_RB[role] && r[4] & DW_RB[role]));
/** Popularité (stpPopIndex), refaite quand les decks EDHREC ou la base du coach changent. */
function stpPop() {
  const E = typeof EDH !== 'undefined' && EDH.data;
  if (STP.pop && STP.pop.E === E && STP.pop.src === DW.core) return STP.pop.m;
  const m = E && DW.byKey ? stpPopIndex(E, k => { const r = DW.byKey.get(k); return r ? String(r[1] || '') : null; }) : new Map();
  STP.pop = { E, src: DW.core, m }; return m;
}
/** Commandants de Mes decks (base EDHREC) : [{ slug, names, keys, ci }], un par commandant. */
function stpMyCmds() {
  const E = typeof EDH !== 'undefined' && EDH.data; if (!E) return [];
  const out = new Map();
  for (const d of allDecks()) {
    const ks = commanderKeys(d.text); if (!ks.length) continue;
    const c = ks.length > 1 ? E.cmds.find(x => x.keys.length === ks.length && ks.every(k => x.keys.includes(k))) : E.by.get(ks[0]);
    if (c && !out.has(c.slug)) out.set(c.slug, c);
  }
  return [...out.values()];
}
/** Commandants choisis (base EDHREC ; un commandant absent du fichier chargé est ignoré). */
const stpCmds = () => { const E = typeof EDH !== 'undefined' && EDH.data; return E && STP.o ? STP.o.cmds.map(s => E.bySlug.get(s)).filter(Boolean) : []; };
/** Nom affiché d'une carte (n : nom anglais) : la règle commune de l'appli (collection.js › cardName : langue de tes exemplaires, sinon de l'appli, sinon anglais),
 *  cardnames.js › cnName (langue de l'appli) tant qu'elle n'est pas là. Avant l'arrivée des noms traduits : l'anglais (cnWhen repeint la fiche). */
const stpNm = n => (typeof cardName === 'function' ? cardName(ownKey(n), n) : typeof cnName === 'function' ? cnName(n) : n);
/** Nom affiché d'un commandant (une paire : les deux). */
const stpCmdNm = c => c.names.map(stpNm).join(' + ');
/** Nom court d'un commandant (« Krenko », « Atraxa ») : son nom affiché avant la virgule ; une paire : les deux. */
const stpShort = c => c.names.map(n => { const d = stpNm(n); return String(d).split(',')[0].trim() || d; }).join(' + ');
/** Commandant au format du coach (deckwiz.js › dwCmdOf). */
const stpCoachCmd = c => ({ slug: c.slug, names: c.names, keys: c.keys, ci: dwCiOf(c.keys, c.ci), th: [] });

/** Cartes candidates, de la meilleure à la moins bonne : [{ k, name, ci, g, eur, need, s, p, … }]. ctx : { pop, cmds: [{ slug, cmd (format du coach), C (dwInfo), short }] }.
 *  Avec des commandants : g = le commandant pour qui la carte vaut le plus (x : ses chiffres, also : les autres commandants qu'elle sert bien). */
function stpCands(o, ctx) {
  const { pop } = ctx, cmds = ctx.cmds || [], out = [], tagI = o.tags.map(t => dmxTag(t)).filter(i => i >= 0);
  const fits = (ci, cmd) => [...ci].every(c => cmd.ci.includes(c));
  const okCi = cmds.length ? ci => cmds.some(c => fits(ci, c.cmd)) : ci => colorFit(ci, o.cols, 'in');
  const plan = cmds.length ? null : tagI.length && typeof dmxPlan === 'function' ? dmxPlan({ slug: '', names: [], keys: [], ci: o.cols || 'WUBRG' }, { mech: o.tags }) : null;
  for (const [k, r] of DW.byKey) {
    if (BASIC_NAMES.has(k) || r[6] & 16) continue;      // terrains de base, interdites en Commander
    const ci = String(r[1] || ''); if (!okCi(ci) || (!ci && !o.cless)) continue;
    const eur = stpEur(k, r); if (!eur || eur >= o.max) continue;
    const m = dmx(k);
    if (o.roles.length && !o.roles.some(x => stpRole(m, r, x))) continue;
    if (tagI.length && !(m && tagI.some(i => m.p.includes(i) || m.w.includes(i) || m.ip.includes(i)))) continue;
    const need = o.q - Math.max(0, ownFree(k, null)) - (ctx.cart ? ctx.cart.get(k) || 0 : 0); if (need <= 0) continue;      // assez d'exemplaires libres (ni engagés dans un deck monté), ou déjà dans le panier CardTrader
    const p = pop.get(k) || 0, ps = stpPopScore(p, r[8] || 0), qv = dmxQ(m), roles = STP_UTIL.filter(x => stpRole(m, r, x));
    let s, x = null, g = stpGroup(ci), also = [], f = ctx.U ? ctx.U.get(k) || 0 : 0;
    if (cmds.length) {
      const vs = [];
      for (const c of cmds) {
        if (!fits(ci, c.cmd)) continue;
        const y = c.C && c.C.get(k); if (y && y.trap) continue;      // piège de la fiche de ce commandant
        const f = c.F ? c.F.get(k) || 0 : 0;      // analyse approfondie : part pondérée (note du coach) des decks du coach et des joueurs qui la jouent
        vs.push({ c, y, f, v: (y ? dwVal(y) : 0) + 0.35 * ps + 0.1 * qv + 1.0 * f });
      }
      if (!vs.length) continue;
      vs.sort((a, b) => b.v - a.v);
      const top = vs[0]; also = vs.slice(1).filter(z => z.y && z.v >= 0.5 * top.v && z.v > 0.4).map(z => z.c.short);
      s = top.v + 0.15 * also.length; x = top.y; g = cmds.length > 1 ? top.c.slug : g; f = top.f;      // une carte qui sert plusieurs de tes commandants : un achat plus utile
    } else s = 0.7 * ps + 0.18 * qv + Math.min(0.08, 0.04 * roles.length) + (plan && m ? 0.35 * dmxFit(m, plan, null) : 0) + 0.6 * Math.sqrt(f);      // les plus jouées d'abord ; force et rôles départagent ; analyse : part des decks analysés (coach et joueurs, pondérés par la note)
    if (!(s > 0.03)) continue;      // ni jouée ni utile : rien à faire dans une liste de staples
    const r1 = (STP_ROLES.find(([y]) => stpRole(m, r, y)) || [''])[0];      // rôle principal (ordre de STP_ROLES) : classement « Rôle »
    out.push({ k, name: r[0], ci, g, ty: r[3] || 0, r1, eur, need, s, p, f, rank: r[8] || 0, roles, also, x: x ? { incl: x.incl || 0, ai: x.ai, m: x.m || 0 } : null, tag: tagI.find(i => m && (m.p.includes(i) || m.w.includes(i) || m.ip.includes(i))) });
  }
  return out.sort((a, b) => b.s - a.s || a.eur - b.eur);
}
/** Groupes de la répartition équilibrée : les couleurs choisies (toutes sans choix), multicolore s'il y en a deux ou plus, incolore si permis. */
function stpGroupsOf(o) {
  const cs = o.cols ? [...o.cols] : ['W', 'U', 'B', 'R', 'G'];
  return [...cs, ...(cs.length > 1 ? ['M'] : []), ...(o.cless ? ['C'] : [])];
}

/* ── Vérification CardTrader ──────────────────────────────────────────────────────────────────────── */
function stpCtMem() {
  if (STP.ct) return STP.ct;
  let m = {}; try { m = JSON.parse(localStorage.getItem(STP_CT_KEY) || '{}') || {}; } catch (e) { m = {}; }
  const now = Date.now(); for (const k of Object.keys(m)) if (!Array.isArray(m[k]) || !(now - m[k][1] < STP_CT_TTL)) delete m[k];
  return (STP.ct = m);
}
const stpCtGet = (k, sig) => { const v = stpCtMem()[k]; return v && v[2] === sig ? { p: v[0] } : null; };
function stpCtSet(k, sig, p) { stpCtMem()[k] = [p, Date.now(), sig]; }
function stpCtSave() { try { localStorage.setItem(STP_CT_KEY, JSON.stringify(stpCtMem())); } catch (e) { /* stockage plein : gardé pour la session */ } }

/** Peut-on lire les offres CardTrader ? '' oui, sinon la raison (texte). */
function stpCtWhy() {
  if (typeof mkUs === 'function' && mkUs()) return T('Marché TCGplayer : pas de CardTrader.');
  if (S.demo) return T('Serveur injoignable : vérification CardTrader impossible pour l\'instant.');
  if (S.run && S.run.status === 'running') return T('Une recherche est en cours : attends sa fin.');
  if (COLL.pxRun) return T('Lecture des prix réels de la collection en cours : attends sa fin.');
  if (!ctReady()) return T('CardTrader n\'est pas configuré (Réglages › Prix › CardTrader).');
  return '';
}
/** Vérifie les cartes de la liste pas encore vérifiées et remplace celles sans offre assez basse, jusqu'à ce que tout soit vérifié ou la réserve vide. */
async function stpVerify(R) {
  const o = R.o, why = stpCtWhy(); if (why) { R.note = why; return; }
  readOpts();
  if (CTX.proxy && CTX.needsLogin && !(CTX.needsKey && CTX.appKey) && CTX.idToken && !(await CTX.idToken())) { R.note = T('Connecte-toi pour lire les prix CardTrader.'); return; }
  const run = STP.run = { ctrl: new AbortController(), done: 0, total: R.list.filter(x => x.ct === undefined).length, frac: 0, step: '' };
  const opts = { ...S.opts, fallbackEn: !!S.opts.lang && S.opts.lang !== 'en', skip: new Set(), fresh: false, push: null }, sig = pxSig(opts.lang, opts);
  STP.task = floatTask(T('Chasse aux staples'), { total: run.total, sub: T('Vérification CardTrader…'), open: stpOpen }, stpTaskHid);      // appui : la fiche se rouvre
  const upd = () => { STP.task.set(run.done + run.frac, run.total, `${nf0(Math.floor(run.done + run.frac))} / ${nf0(run.total)}${R.rep ? ' · ' + TN(R.rep, '{n} remplacée', '{n} remplacées') : ''}`); stpPaintRun(); };
  upd();
  try {
    for (let pass = 0; pass < 30; pass++) {
      const todo = R.list.filter(x => x.ct === undefined); if (!todo.length) break;
      for (const x of todo) { const c = stpCtGet(x.k, sig); if (c) { x.ct = c.p; run.done++; } }
      const left = todo.filter(x => x.ct === undefined);
      for (let i = 0; i < left.length; i += PX_CHUNK) {
        const chunk = left.slice(i, i + PX_CHUNK), offers = new Map(), imgs = new Map();
        const hooks = {
          step: (id, st, d) => { if (st === 'run') { run.step = (PX_STEPS[id] || id) + (d ? ' ' + d : ''); upd(); } },
          progress: f => { run.frac = f * chunk.length; upd(); },
          rate() {}, hint() {}, cacheAge() {},
          needsEn: key => needsEnglish(offers.get(key) || [], opts),
          card: (key, p) => { const l = p.fellBack ? (offers.get(key) || []).concat(p.offers || []) : p.offers || []; offers.set(key, p.notFound ? [] : l); if (p.img) imgs.set(key, p.img); },      // image lue par la recherche : la vignette, sans autre requête
        };
        await runLive(chunk.map(x => ({ key: x.k, name: x.name, qty: x.need })), opts, hooks, run.ctrl.signal);
        for (const x of chunk) {
          const l = offers.get(x.k) || [], b = cheapestOffer(l, opts) || (opts.fallbackEn ? cheapestOffer(l, { ...opts, lang: 'en' }) : null);
          x.ct = b ? b.price : null; stpCtSet(x.k, sig, x.ct); if (imgs.has(x.k)) x.img = imgs.get(x.k);
        }
        run.done += chunk.length; run.frac = 0; stpCtSave(); upd(); stpPaint();      // prix CardTrader lus : affichés tout de suite
      }
      for (const x of [...R.list]) {      // pas d'offre assez basse : la suivante du classement prend sa place (vérifiée au tour suivant)
        if (x.ct === undefined || stpCtOk(x.ct, o)) continue;
        R.list.splice(R.list.indexOf(x), 1); R.out.push(x); R.rep++;
        const y = stpNext(R, x.g); if (y) { R.list.push(y); run.total++; }
      }
      upd(); stpPaint();
    }
    R.note = '';
  } catch (e) {
    R.note = e.name === 'AbortError' ? T('Vérification arrêtée : les cartes pas encore vérifiées restent au prix Cardmarket.') : pxError(e);
  } finally {
    stpCtSave();
    const nv = R.list.filter(x => x.ct === undefined).length;
    STP.task.finish(T('Chasse aux staples'), R.note ? 'warn' : 'ok', TN(R.list.length, '{n} carte', '{n} cartes') + (nv ? ' · ' + TN(nv, '{n} non vérifiée', '{n} non vérifiées') : ''));
    STP.run = null; STP.task = null;
  }
}

/* ── Analyse approfondie : decks du coach et des joueurs, notés par le coach ─────────────────────────── */
/** L'éditeur de deck (BD) prêté à l'analyse : le constructeur du coach (deckopt.js › dsMake) travaille sur BD, sans affichage (dwAutoBuildGen en mode silencieux).
 *  BD.el reçoit un élément détaché (l'éditeur fermé refuse de construire) ; tout est remis après. Ouvrir l'éditeur pendant ce temps : builder.js › openBuilder
 *  demande stpBdYield (l'analyse s'arrête au commandant en cours, BD est remis, puis l'éditeur s'ouvre). */
const stpBdHeld = () => !!(STP.deep && STP.deep.el && BD.el === STP.deep.el);
function stpBdYield(fn) { const d = STP.deep; if (!d) { fn(); return; } d.yield = true; toast(T('Chasse aux staples : analyse arrêtée pour ouvrir l\'éditeur')); d.p.finally(() => setTimeout(fn, 0)); }
/** Decks du coach pour ce commandant (dsMake : versions, tirages, amélioration, parties jouées), BD prêté puis remis. → [{ main: Map, sc }] ou [] (éditeur ouvert, arrêt). */
async function stpCoachDecks(c, o, ms, one, step, seed) {
  if (typeof dsMake !== 'function' || BD.el) return [];      // éditeur ouvert : on ne touche pas à son deck
  const keep = { el: BD.el, id: BD.id, name: BD.name, fmt: BD.fmt, main: BD.main, side: BD.side, comp: BD.comp, cmdr: BD.cmdr, wiz: BD.wiz, avoid: BD.avoid, dirty: BD.dirty }, el = document.createElement('div');
  let res = null;
  const d = STP.deep = { el, yield: false, p: null };
  d.p = (async () => {
    try {
      Object.assign(BD, { el, id: null, name: '', fmt: 'commander', main: new Map(), side: new Map(), comp: new Map(), cmdr: c.keys.map((k, i) => ({ key: k, name: c.names[i] || k, qty: 1 })), avoid: null, dirty: false,
        wiz: { ...dwDefaults(), own: false, mech: o.tags.slice(0, 4) } });
      res = await dsMake({ empty: true, budget: ms, ...(seed ? { seed } : {}), ...(one ? { list: [DS_VARIANTS[0]], draws: 1 } : {}), alive: () => !STP.stop && !d.yield && BD.el === el, step });
    } catch (e) { res = null; }
    finally { if (BD.el === el) Object.assign(BD, keep); }
  })();
  await d.p; STP.deep = null;
  return (res || []).map(r => ({ main: r.main, sc: r.sc }));
}
/** Decks d'un commandant (coach et vrais decks EDHREC / Archidekt / communauté), chacun noté par le coach (dsScore) : { decks: [{ keys, w, src }], nc, nr, note }. */
async function stpDecksOf(c, x, o, ms, one, label) {
  const E = EDH.data, set = { ...dwDefaults(), own: false, mech: o.tags.slice(0, 4) }, cmdr = c.keys.map((k, i) => ({ key: k, name: c.names[i] || k, qty: 1 })), out = [], notes = [];
  const sc = main => { try { const r = dsScore({ main, cmdr, wiz: set }, { cmd: x.cmd, pack: x.pack, info: x.C }); return r ? r.total : 0; } catch (e) { return 0; } };
  for (const d of E ? E.decks.filter(y => y.cmd === c) : []) {      // vrais decks : moyen EDHREC, Budget, Premium, cEDH, populaires (Archidekt), communauté
    const main = new Map(); for (const [k, n, q] of d.cards) if (k && !c.keys.includes(k)) main.set(k, { key: k, name: n, qty: q || 1 });
    if (main.size < 40) continue;
    const t = sc(main); notes.push(t); out.push({ keys: main.keys(), w: stpNoteW(t), src: 'r' });
  }
  const nr = out.length;
  if (o.deep && !STP.stop) {
    const rounds = one ? 1 : 2, built = [];      // commandant choisi : deux séries de versions (graines différentes) pour des fréquences plus sûres
    for (let i = 0; i < rounds && !STP.stop; i++) built.push(...await stpCoachDecks(c, o, ms, one, (v, ph, part) => { if (STP.prog) { STP.prog.sub = label + ' · ' + T(v.name) + (ph === 'sim' ? ' · ' + T('parties jouées') : ''); STP.prog.frac = Math.max(0, Math.min(0.99, (i + (part || 0)) / rounds)); stpPaintRun(); } }, 1 + Math.floor(Math.random() * 2e9)));
    for (const b of built) { const t = b.sc ? b.sc.total : sc(b.main); notes.push(t); out.push({ keys: b.main.keys(), w: stpNoteW(t), src: 'c' }); }
  }
  return { decks: out, nr, nc: out.length - nr, notes };
}

/** Pastille flottante cachée tant que la fiche est au premier plan. */
const stpTaskHid = () => !(STP.api && sheets[sheets.length - 1] === STP.api);
/** Pastille de l'analyse approfondie (fiche fermée) : commandant en cours ; un appui rouvre la fiche. */
function stpATask() {
  const pg = STP.prog; if (!pg) return;
  if (!STP.atask) STP.atask = floatTask(T('Chasse aux staples'), { total: pg.total, sub: T('Analyse des decks…'), open: stpOpen }, stpTaskHid);
  STP.atask.set(pg.done + (pg.frac || 0), pg.total, T('Commandant {a} / {b}', { a: nf0(Math.min(pg.total, pg.done + 1)), b: nf0(pg.total) }));
}

/* ── Génération ───────────────────────────────────────────────────────────────────────────────────── */
async function stpGo() {
  if (STP.run || STP.busy) return;
  const o = { ...stpLoad(), tags: [...STP.o.tags], roles: [...STP.o.roles] };
  STP.busy = T('Chargement des données…'); STP.res = null; stpPaint();
  try {
    await Promise.all([edhLoad().catch(() => null), dwLoad().catch(() => null), pxTable().catch(() => null)]);
    if (!DW.byKey) throw new Error(T('Base du coach indisponible : réessaie dans un moment.'));
    const cs = stpCmds(), cmds = [];
    if (o.cmds.length && !cs.length) throw new Error(T('Commandant introuvable dans la base EDHREC.'));
    for (const c of cs) {      // fiche et valeur du coach de chaque commandant (dwInfo : une table par commandant, gardée ici)
      STP.busy = T('Fiche de {name}…', { name: stpCmdNm(c) }); stpPaint();
      const cmd = stpCoachCmd(c), pack = await dwPack('c', c.slug);
      cmds.push({ slug: c.slug, cmd, pack, C: dwInfo(pack, { ...dwDefaults(), own: false, mech: o.tags.slice(0, 4) }, cmd), short: stpShort(c), name: stpCmdNm(c), ci: cmd.ci, c });
    }
    const A = { n: 0, nc: 0, nr: 0, notes: [], cmds: 0 }; STP.U = null;      // bilan de l'analyse (affiché au-dessus de la liste)
    STP.stop = false;
    if (cmds.length) {      // decks de chaque commandant choisi : le coach en construit (4 versions) et les vrais decks sont notés
      STP.prog = { done: 0, total: cmds.length, sub: '' };
      for (const [i, x] of cmds.entries()) {
        if (STP.stop) break;
        STP.busy = o.deep ? T('Le coach construit des decks pour {name}', { name: x.short }) : T('Decks de {name}', { name: x.short }); STP.prog.done = i; STP.prog.frac = 0; STP.prog.sub = ''; stpPaint();
        const r = await stpDecksOf(x.c, x, o, STP_DEEP_MS, false, x.short);
        x.F = stpFreq(r.decks); A.n += r.decks.length; A.nc += r.nc; A.nr += r.nr; A.notes.push(...r.notes); A.cmds++;
      }
    } else if (o.deep && EDH.data) {      // sans commandant : un échantillon de commandants de toutes les couleurs ; une carte vaut d'autant plus qu'elle revient chez ceux qui peuvent la jouer
      const nr = new Map(); for (const d of EDH.data.decks) nr.set(d.cmd, (nr.get(d.cmd) || 0) + 1);      // vrais decks de chaque commandant (+ 1 deck du coach)
      const sample = stpSample(EDH.data.cmds, o.cols, Math.min(o.nd, STP_ND_MAX), c => (nr.get(c) || 0) + 1), per = [];
      STP.prog = { done: 0, total: sample.length, sub: '' };
      for (const [i, c] of sample.entries()) {
        if (STP.stop || A.n >= STP_ND_MAX) break;      // plafond atteint : jamais plus de STP_ND_MAX decks
        STP.busy = T('Analyse des decks : {name}', { name: stpShort(c) }); STP.prog.done = i; STP.prog.frac = 0; STP.prog.sub = ''; stpPaint();
        const cmd = stpCoachCmd(c), pack = await dwPack('c', c.slug), x = { cmd, pack, C: dwInfo(pack, { ...dwDefaults(), own: false, mech: o.tags.slice(0, 4) }, cmd) };
        const r = await stpDecksOf(c, x, o, STP_GEN_MS, true, stpShort(c));
        if (r.decks.length) per.push({ ci: stpMask(cmd.ci), F: stpFreq(r.decks) });
        A.n += r.decks.length; A.nc += r.nc; A.nr += r.nr; A.notes.push(...r.notes); A.cmds++;
      }
      const U = new Map();      // part moyenne chez les commandants analysés dont l'identité permet la carte
      for (const [k, r] of DW.byKey) { const m = stpMask(r[1]); let n = 0, t = 0; for (const q of per) if ((q.ci & m) === m) { n++; t += q.F.get(k) || 0; } if (n && t) U.set(k, t / n); }
      STP.U = U;
    }
    STP.prog = null;
    if (STP.atask) { STP.atask.finish(T('Chasse aux staples'), STP.stop ? 'warn' : 'ok', TN(A.n, '{n} deck analysé', '{n} decks analysés')); STP.atask = null; }
    let cart = null, cartN = 0, cartNote = '';      // panier CardTrader : ses cartes comptent comme déjà là (une commande de deck en cours ne revient pas dans la liste)
    if (o.cart && !stpCtWhy()) {
      STP.busy = T('Lecture du panier CardTrader…'); stpPaint();
      try { const c = await cartRead(); cart = new Map(); for (const it of c.items) { const k = ownKey(it.name); if (k) cart.set(k, (cart.get(k) || 0) + it.quantity); } cartN = cart.size; }
      catch (e) { cartNote = T('Panier CardTrader non lu : ses cartes ne sont pas écartées.'); }
    }
    STP.busy = T('Classement des cartes…'); stpPaint();
    await new Promise(r => setTimeout(r, 30));
    const ranked = stpCands(o, { pop: stpPop(), cmds, cart, U: !cmds.length && o.deep ? STP.U : null }), bal = cmds.length !== 1, order = cmds.length > 1 ? cmds.map(c => c.slug) : null;      // plusieurs commandants : parts égales entre eux ; un seul : classement pur ; aucun : par couleur
    const quotas = bal ? stpQuotas(o.n, order || stpGroupsOf(o)) : null, { pick, rest } = stpPick(ranked, o.n, quotas, !!order);      // plusieurs commandants : parts égales strictes (Krenko, très documenté, ne prend plus les places de l'autre)
    const R = STP.res = { o, list: pick, rest, out: [], rep: 0, bal, quotas, order, gn: Object.fromEntries(cmds.map(c => [c.slug, c])), cmd: cmds.map(c => c.short).join(', '), pool: ranked.length, A, stopped: STP.stop, cartN, note: '', warn: [EDH.data ? '' : T('Decks EDHREC indisponibles : classement par force et rôles seulement.'), cartNote].filter(Boolean).join(' '), at: Date.now() };
    STP.busy = '';
    if (o.ct && R.list.length) { stpPaint(); await stpVerify(R); }
  } catch (e) {
    STP.busy = ''; STP.err = (e && e.message) || T('Échec de la génération.');
    if (STP.atask) { STP.atask.finish(T('Chasse aux staples'), 'bad', STP.err); STP.atask = null; } STP.prog = null;
  } finally { STP.busy = ''; if (STP.res && !STP.err) stpHPut(STP.res); stpPaint(); haptic(STP.res ? 'ok' : 'bad'); }      // historique : la liste obtenue (vérifiée si demandé)
}
/** Complète la liste jusqu'au nombre demandé (après des ✕), en respectant les quotas, puis vérifie les nouvelles cartes. */
async function stpFill() {
  const R = STP.res; if (!R || STP.run) return;
  while (R.list.length < R.o.n && R.rest.length) {
    let g = null;
    if (R.bal && R.quotas) { let best = 0; for (const k of Object.keys(R.quotas)) { const d = R.quotas[k] - R.list.filter(x => x.g === k).length; if (d > best && R.rest.some(x => x.g === k)) { best = d; g = k; } } }
    R.list.push(stpNext(R, g));
  }
  stpPaint();
  if (R.o.ct && R.list.some(x => x.ct === undefined)) { await stpVerify(R); stpPaint(); }
  stpHPut(R);
}
function stpDrop(k) {
  const R = STP.res; if (!R) return;
  const i = R.list.findIndex(x => x.k === k); if (i < 0) return;
  R.list.splice(i, 1); haptic('tap'); stpPaint();
  if (!STP.run) stpHPut(R);      // l'historique suit la liste (pendant une vérification : enregistrée à la fin)
}
function stpSend() {
  const R = STP.res; if (!R || !R.list.length) return;
  const text = stpText(R);
  haptic('ok');
  while (sheets.length) sheets[sheets.length - 1].close();
  if (typeof navCloseSections === 'function') navCloseSections();
  putDeckText(text, T('Chasse aux staples'));
}

/* ── Historique des recherches (10 au plus : réglages et liste obtenue ; sur l'appareil, deckdeal:stp:h, et dans le compte, users/{uid}/meta/staples) ──
   Une recherche rouverte n'est pas revérifiée sur CardTrader (« Prix d'une liste » relit tous les prix) : seules les cartes que tu as maintenant en
   exemplaires libres sont retirées, ou leur quantité baissée. L'entrée suit la liste (✕, Compléter, vérification) et remonte en tête. */
const STP_H_KEY = 'deckdeal:stp:h', STP_H_MAX = 10, STP_H_SIZE = 800000;      // STP_H_SIZE : taille du document du compte (Firestore : 1 Mo au plus)
/** Réglages lus (stockage, historique) et bornés. */
function stpNorm(o) {
  o = o && typeof o === 'object' ? o : {};
  const d = stpDefaults(), int = (v, lo, hi, def) => (Number.isFinite(+v) ? Math.max(lo, Math.min(hi, Math.round(+v))) : def);
  return { n: int(o.n, 10, 500, d.n), q: int(o.q, 1, 4, d.q), max: int(o.max, 1, 500, d.max), ct: o.ct !== false, deep: o.deep !== false, cart: o.cart !== false, grp: ['type', 'role'].includes(o.grp) ? o.grp : '', nd: STP_ND.includes(+o.nd) ? +o.nd : d.nd, tol: int(o.tol, 0, 100, d.tol),
    cols: String(o.cols || '').replace(/[^WUBRG]/g, ''), cless: o.cless !== false, cmds: (Array.isArray(o.cmds) ? o.cmds : typeof o.cmd === 'string' && o.cmd ? [o.cmd] : []).filter(x => typeof x === 'string' && x).slice(0, STP_CMD_MAX),      // cmd : un seul commandant (version d'avant)
    tags: Array.isArray(o.tags) ? o.tags.filter(t => typeof t === 'string').slice(0, 12) : [], roles: Array.isArray(o.roles) ? o.roles.filter(r => STP_ROLES.some(x => x[0] === r)) : [] };
}
/** Entrée de l'historique pour la liste R (id : celle qu'elle remplace) : réglages, commandants, bilan, et chaque carte en abrégé
 *  { k, n, q (exemplaires à acheter), e (Cardmarket, centimes), c? (CardTrader : centimes, -1 aucune offre ; absent : pas vérifiée), ci?, g, t?, r?, s, w? (raison affichée) }. */
function stpHEntry(R, id, now, why) {
  const A = R.A && R.A.n ? { n: R.A.n | 0, nc: R.A.nc | 0, nr: R.A.nr | 0, cmds: R.A.cmds | 0, m: R.A.notes ? (R.A.notes.length ? Math.round(R.A.notes.reduce((a, x) => a + x, 0) / R.A.notes.length) : 0) : R.A.m | 0 } : null;
  return { id, at: R.at || now, u: now, o: stpNorm(R.o), ...(R.cmd ? { cmd: String(R.cmd).slice(0, 300) } : {}), bal: !!R.bal, pool: R.pool | 0, rep: R.rep | 0, cartN: R.cartN | 0,
    ...(R.order && R.order.length ? { order: R.order.slice(), gn: Object.fromEntries(R.order.filter(s => R.gn && R.gn[s]).map(s => [s, { short: String(R.gn[s].short || ''), name: String(R.gn[s].name || ''), ci: String(R.gn[s].ci || '') }])) } : {}),
    ...(A ? { A } : {}), ...(R.stopped ? { stopped: 1 } : {}),
    l: R.list.map(x => { const w = why ? String(why(x, R) || '').slice(0, 90) : x.w || ''; return { k: x.k, n: x.name, q: x.need, e: x.eur, ...(x.ct !== undefined ? { c: x.ct == null ? -1 : x.ct } : {}), ...(x.ci ? { ci: x.ci } : {}), g: x.g, ...(x.ty ? { t: x.ty } : {}), ...(x.r1 ? { r: x.r1 } : {}), s: Math.round((x.s || 0) * 1000) / 1000, ...(w ? { w } : {}) }; }) };
}
/** Entrée lue (stockage, compte) ; null si illisible. */
function stpHClean(h) {
  if (!h || typeof h !== 'object' || typeof h.id !== 'string' || !/^[a-z0-9]{4,24}$/.test(h.id) || !Number.isFinite(h.at) || !Array.isArray(h.l)) return null;
  const str = v => (typeof v === 'string' ? v : ''), l = h.l.filter(c => c && typeof c.n === 'string' && c.n && typeof c.k === 'string' && c.k && c.q > 0 && Number.isFinite(c.e))
    .map(c => ({ k: c.k, n: c.n.slice(0, 150), q: Math.min(4, Math.floor(c.q)), e: c.e, ...(Number.isFinite(c.c) ? { c: c.c } : {}), ...(str(c.ci) ? { ci: str(c.ci).replace(/[^WUBRG]/g, '') } : {}), g: str(c.g) || 'C', ...(c.t > 0 ? { t: c.t | 0 } : {}), ...(str(c.r) ? { r: str(c.r) } : {}), s: Number(c.s) || 0, ...(str(c.w) ? { w: str(c.w).slice(0, 90) } : {}) }));
  const gn = h.gn && typeof h.gn === 'object' ? Object.fromEntries(Object.entries(h.gn).filter(([, v]) => v && typeof v === 'object').map(([s, v]) => [s, { short: str(v.short), name: str(v.name), ci: str(v.ci) }])) : null;
  return { id: h.id, at: h.at, u: Number.isFinite(h.u) ? h.u : h.at, o: stpNorm(h.o), ...(str(h.cmd) ? { cmd: str(h.cmd) } : {}), bal: !!h.bal, pool: h.pool | 0, rep: h.rep | 0, cartN: h.cartN | 0,
    ...(Array.isArray(h.order) && gn ? { order: h.order.filter(s => typeof s === 'string' && gn[s]), gn } : {}), ...(h.A && typeof h.A === 'object' ? { A: { n: h.A.n | 0, nc: h.A.nc | 0, nr: h.A.nr | 0, cmds: h.A.cmds | 0, m: h.A.m | 0 } } : {}), ...(h.stopped ? { stopped: 1 } : {}), l };
}
/** Historique lu : les plus récemment utilisées d'abord, 10 au plus. */
const stpHAll = list => (Array.isArray(list) ? list : []).map(stpHClean).filter(Boolean).sort((a, b) => b.u - a.u).filter((h, i, a) => a.findIndex(x => x.id === h.id) === i).slice(0, STP_H_MAX);
/** Entrée ajoutée ou remplacée (en tête). */
const stpHPutIn = (list, h) => [h, ...list.filter(x => x.id !== h.id)].slice(0, STP_H_MAX);
/** Document du compte : les plus anciennes retirées tant qu'il dépasse STP_H_SIZE. */
function stpHDoc(list) { let l = list.slice(); while (l.length > 1 && JSON.stringify(l).length > STP_H_SIZE) l = l.slice(0, -1); return l; }
/** Liste rouverte : chaque carte recontrôlée sur la collection (freeOf(k) : exemplaires libres maintenant) ; prix d'alors, sans nouvelle vérification.
 *  → R (comme stpGo, sans réserve de remplacement) ; R.gone : cartes retirées (assez d'exemplaires maintenant), R.less : quantités baissées. */
function stpHRestore(h, freeOf) {
  const list = []; let gone = 0, less = 0;
  for (const c of h.l) {
    const q = Math.min(c.q, h.o.q - Math.max(0, freeOf(c.k) || 0));
    if (q <= 0) { gone++; continue; }
    if (q < c.q) less++;
    list.push({ k: c.k, name: c.n, need: q, eur: c.e, ...(c.c !== undefined ? { ct: c.c < 0 ? null : c.c } : {}), ci: c.ci || '', g: c.g, ty: c.t || 0, r1: c.r || '', s: c.s || 0, w: c.w || '', roles: [], also: [] });
  }
  return { o: { ...h.o }, list, rest: [], out: [], rep: h.rep, bal: h.bal, quotas: null, order: h.order || null, gn: h.gn || {}, cmd: h.cmd || '', pool: h.pool, A: h.A || null, stopped: !!h.stopped, cartN: h.cartN, note: '', warn: '', at: h.at, hid: h.id, gone, less };
}

function stpHLoad() {
  if (STP.h) return STP.h;
  let r = null; try { r = JSON.parse(localStorage.getItem(STP_H_KEY) || 'null'); } catch (e) { r = null; }
  STP.h = stpHAll(r && r.h); STP.hu = Number(r && r.u) || 0; STP.hw = (r && typeof r.w === 'string' && r.w) || '';
  return STP.h;
}
function stpHWrite() { try { localStorage.setItem(STP_H_KEY, JSON.stringify({ h: STP.h, u: STP.hu, ...(STP.hw ? { w: STP.hw } : {}) })); } catch (e) { /* stockage plein : gardé pour la session (et le compte) */ } }
function stpHSet(list) { STP.h = list; STP.hu = Math.max(Date.now(), (STP.hu || 0) + 1); stpHWrite(); stpHPushSoon(); }
/** La liste en cours entre dans l'historique (ou y remplace son entrée). */
function stpHPut(R) {
  if (!R || !R.list.length) return;
  stpHLoad(); R.hid = R.hid || Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36);
  stpHSet(stpHPutIn(STP.h, stpHEntry(R, R.hid, Date.now(), stpWhy)));
}
/** Rouvre une recherche : réglages repris (« Modifier les réglages » relance la même), cartes que tu as maintenant retirées, prix d'alors. */
function stpHOpen(id) {
  const h = stpHLoad().find(x => x.id === id); if (!h || STP.run || STP.busy) return;
  const R = stpHRestore(h, k => ownFree(k, null));
  R.warn = [T('Recherche du {date} : prix d\'alors, non revérifiés (Prix d\'une liste relit tous les prix).', { date: stpHDate(h.at) }),
    R.gone ? TN(R.gone, '{n} carte retirée : tu l\'as maintenant dans ta collection.', '{n} cartes retirées : tu les as maintenant dans ta collection.') : '',
    R.less ? TN(R.less, '{n} quantité baissée (exemplaires déjà là).', '{n} quantités baissées (exemplaires déjà là).') : ''].filter(Boolean).join(' ');
  STP.o = { ...h.o, grp: STP.o ? STP.o.grp : h.o.grp }; stpSave(); STP.res = R; STP.edit = false; STP.err = ''; STP.metaSig = '';
  if (!R.list.length) { STP.res = null; stpHSet(STP.h.filter(x => x.id !== id)); toast(T('Toutes les cartes de cette recherche sont maintenant dans ta collection')); stpPaint(); return; }
  if (R.gone || R.less) stpHPut(R); else stpHSet(stpHPutIn(STP.h, { ...h, u: Date.now() }));      // remonte en tête
  haptic('tap'); stpPaint(); if (STP.api) STP.api.body.scrollTop = 0;
}
function stpHDrop(id) {
  const prev = stpHLoad().slice(), h = prev.find(x => x.id === id); if (!h) return;
  stpHSet(prev.filter(x => x.id !== id)); if (STP.res && STP.res.hid === id) STP.res.hid = '';
  haptic('tap'); stpPaint();
  toast(T('Recherche retirée de l\'historique'), { label: tUndo(), fn: () => { stpHSet(stpHAll([...STP.h, h])); stpPaint(); } });
}
const stpHDate = t => dateShort(t) + ' ' + new Date(t).toLocaleTimeString(LOC(), { hour: '2-digit', minute: '2-digit' });
/** Réglages d'une recherche, en clair (HTML) : « 150 cartes · < 0,15 € · CardTrader + 0,05 € · Krenko · Rampe · analyse : 1 000 decks ». */
function stpHParams(h) {
  const o = h.o, esc2 = typeof esc === 'function' ? esc : x => x;
  const out = [esc2(TN(o.n, '{n} carte', '{n} cartes')), o.q > 1 ? esc2(T('{n} ex. par carte', { n: o.q })) : '', '&lt; ' + esc2(stpEuro(o.max)), o.ct ? 'CardTrader + ' + esc2(stpEuro(o.tol)) : esc2(T('sans CardTrader')),
    h.cmd ? esc2(h.cmd) : (o.cols ? stpPipsHtml(o.cols) : esc2(T('toutes couleurs'))) + (o.cless ? '' : ' ' + esc2(T('sans incolores'))),
    o.roles.length ? esc2(o.roles.map(r => T((STP_ROLES.find(x => x[0] === r) || [r, r])[1])).join(', ')) : '',
    o.tags.length && typeof dmxLabel === 'function' ? esc2(o.tags.map(dmxLabel).join(', ')) : '',
    o.deep ? esc2(h.cmd ? T('analyse approfondie') : T('analyse : {n} decks', { n: nf0(o.nd) })) : ''];
  return out.filter(Boolean).join(' · ');
}
function stpHistHtml() {
  const l = stpHLoad(); if (!l.length) return '';
  return `<div class="stp-hist">${`<h3 class="dkf-h">${T('Dernières recherches')} <small>${T('({n} au plus)', { n: STP_H_MAX })}</small></h3>`}<div class="stp-hl">${l.map(h => {
    const n = h.l.length, cm = h.l.reduce((a, c) => a + c.e * c.q, 0), cv = h.l.filter(c => c.c >= 0), ct = cv.reduce((a, c) => a + c.c * c.q, 0);
    return `<div class="stp-h"><button type="button" class="stp-ho" data-stp="h" data-v="${esc(h.id)}"><b>${stpHParams(h)}</b><small>${esc([stpHDate(h.at), TN(n, '{n} carte', '{n} cartes'), '≈ ' + stpEuro(cm), cv.length ? 'CT ≈ ' + stpEuro(ct) : ''].filter(Boolean).join(' · '))}</small></button>
      <button type="button" class="icon-btn stp-hx" data-stp="hx" data-v="${esc(h.id)}" aria-label="${esc(T('Retirer cette recherche de l\'historique'))}"><svg class="i"><use href="#i-close"/></svg></button></div>`;
  }).join('')}</div></div>`;
}
/* Synchro avec le compte (compte de l'éditeur : abonnement à l'ouverture de la fiche) ; le plus récent l'emporte. */
function stpHSync() {
  const d = STP.hdoc, uid = (typeof D !== 'undefined' && D.uid) || '';
  if (d.uid === uid) return;
  if (d.unsub) { try { d.unsub(); } catch (e) { /* ignore */ } d.unsub = null; } clearTimeout(d.pushT); d.pushT = 0; d.uid = '';
  if (!uid || !D.cloud || !D.cloud.watchMeta) return;
  stpHLoad(); if (STP.hw && STP.hw !== uid) { STP.h = []; STP.hu = 0; }      // historique d'un autre compte : reste dans ce compte-là
  STP.hw = uid; stpHWrite(); d.uid = uid;
  d.unsub = D.cloud.watchMeta(uid, 'staples', (data, pending, fromCache) => {
    if (pending || fromCache || D.uid !== uid) return;
    const ru = Number(data && data.updatedAt) || 0;
    if (data && ru > STP.hu) { STP.h = stpHAll(data.h); STP.hu = ru; stpHWrite(); if (!STP.busy && !STP.run && (!STP.res || STP.edit)) stpPaint(); }
    else if (STP.hu > ru) stpHPushSoon();
  }, () => { /* règles pas encore publiées : historique gardé sur l'appareil */ });
}
function stpHPushSoon() { const d = STP.hdoc; if (!d.uid) return; clearTimeout(d.pushT); d.pushT = setTimeout(stpHPush, 1500); }
async function stpHPush() {
  const d = STP.hdoc; clearTimeout(d.pushT); d.pushT = 0;      // non nul : envoi en attente (decks.js › syncFlush)
  if (!d.uid || d.uid !== D.uid || (typeof acctHeld === 'function' && acctHeld(d.uid)) || !cloudOn() || !D.cloud.saveMeta) return;
  try { await D.cloud.saveMeta(d.uid, 'staples', { h: stpHDoc(STP.h), updatedAt: STP.hu || Date.now() }); } catch (e) { /* hors ligne, règles : renvoyé au prochain changement */ }
}

/* ── Affichage ────────────────────────────────────────────────────────────────────────────────────── */
const stpOn = () => typeof evAdmOn === 'function' && evAdmOn();
/** Ligne de « Mon compte » (compte de l'éditeur seulement). */
const stpMeRow = () => (stpOn() ? meRow('staples', T('Chasse aux staples'), STP.run ? T('En cours…') : '') : '');
const stpEuro = c => fmt(c, 'EUR');
const stpPipsHtml = ci => (ci ? `<span class="deck-pips">${[...ci].map(x => `<i class="pip ${x}"></i>`).join('')}</span>` : '<span class="deck-pips stp-cl" aria-hidden="true">◇</span>');

function stpFormHtml() {
  const o = stpLoad(), E = typeof EDH !== 'undefined' && EDH.data, cs = stpCmds(), h = t => `<h3 class="dkf-h">${t}</h3>`;
  const chip = (act, v, on, label, extra = '') => `<button type="button" class="fopt" data-stp="${act}" data-v="${esc(String(v))}" aria-pressed="${!!on}"${extra}>${label}</button>`;
  const mine = stpMyCmds();
  const cmdChip = x => chip('cmd', x.slug, o.cmds.includes(x.slug), esc(stpCmdNm(x)) + ` <small>${stpPipsHtml(x.ci)}</small>`);
  const allMine = mine.length > 1 && mine.slice(0, STP_CMD_MAX).every(x => o.cmds.includes(x.slug)), ciAll = [...new Set(cs.flatMap(x => [...dwCiOf(x.keys, x.ci)]))].sort((a, b) => 'WUBRG'.indexOf(a) - 'WUBRG'.indexOf(b)).join('');
  return `${stpHistHtml()}<div class="dkf stp">
    ${h(T('Nombre de cartes'))}<div class="fopts" role="group">${STP_N.map(n => chip('n', n, o.n === n, nf0(n))).join('')}
      <label class="stp-in">${T('Autre')} <input type="number" id="stpN" inputmode="numeric" min="10" max="500" step="10" value="${o.n}"></label></div>
    ${h(T('Exemplaires par carte'))}<div class="fopts" role="group">${[1, 2, 3, 4].map(q => chip('q', q, o.q === q, String(q))).join('')}</div>
    <p class="hint">${T('Une carte est proposée si tu en as moins d\'exemplaires libres (non engagés dans un deck monté) : seuls ceux qui manquent sont achetés.')}</p>
    ${h(T('Prix maximum') + ` <small>${T('(tendance Cardmarket, impression la moins chère)')}</small>`)}<div class="fopts" role="group">${STP_MAXS.map(v => chip('max', v, o.max === v, '&lt; ' + esc(stpEuro(v)))).join('')}
      <label class="stp-in">&lt; <input type="number" id="stpMax" inputmode="decimal" min="0.01" max="5" step="0.01" value="${(o.max / 100).toFixed(2)}"> €</label></div>
    <button type="button" class="dkf-sw" role="switch" data-stp="ct" aria-checked="${o.ct}" aria-pressed="${o.ct}"><span>${T('Vérifier les offres CardTrader')}<small>${T('long')}</small></span><span class="switch" aria-hidden="true"><i></i></span></button>
    ${o.ct ? `<div class="fopts"><label class="stp-in">${T('Marge CardTrader')} + <input type="number" id="stpTol" inputmode="decimal" min="0" max="1" step="0.01" value="${(o.tol / 100).toFixed(2)}"> €</label></div>
      <p class="hint">${T('Une carte est gardée si son offre CardTrader la moins chère (tes critères de recherche) est sous {p} ; sinon la suivante du classement prend sa place.', { p: esc(stpEuro(o.max + o.tol)) })}</p>` : ''}
    <button type="button" class="dkf-sw" role="switch" data-stp="deep" aria-checked="${o.deep}" aria-pressed="${o.deep}"><span>${T('Analyse approfondie')}<small>${T('long')}</small></span><span class="switch" aria-hidden="true"><i></i></span></button>
    <p class="hint">${o.deep ? (cs.length ? T('Le coach construit des decks complets pour chaque commandant (8 versions, environ 1 à 2 minutes chacun) ; avec les vrais decks EDHREC et Archidekt, tous notés par le coach, les cartes qui reviennent dans les decks les mieux notés passent devant.')
      : T('Des commandants de toutes les couleurs, les plus joués d\'abord, jusqu\'au nombre de decks choisi : leurs vrais decks EDHREC et Archidekt et un deck construit par le coach pour chacun, tous notés par le coach ; les cartes qui reviennent dans les decks les mieux notés passent devant.'))
      : T('Classement immédiat : popularité EDHREC, force et rôles du coach.')}</p>
    ${o.deep && !cs.length ? h(T('Decks à analyser') + ` <small>${T('(plus de decks : plus long)')}</small>`) + `<div class="fopts" role="group">${STP_ND.map(n => chip('nd', n, o.nd === n, nf0(n))).join('')}</div>` : ''}
    ${typeof mkUs === 'function' && mkUs() ? '' : `<button type="button" class="dkf-sw" role="switch" data-stp="cart" aria-checked="${o.cart}" aria-pressed="${o.cart}"><span>${T('Écarter les cartes déjà dans mon panier CardTrader')}</span><span class="switch" aria-hidden="true"><i></i></span></button>
    <p class="hint">${T('Une commande en préparation (un deck par exemple) ne revient pas dans la liste ; sans CardTrader configuré, rien n\'est écarté.')}</p>`}
    ${h(T('Commandants') + ` <small>${T('(facultatif, {n} au plus)', { n: STP_CMD_MAX })}</small>`)}
    <div class="fopts stp-cmds" role="group">${chip('cmd', '', !o.cmds.length, T('Aucun'))}${mine.length > 1 ? chip('cmdall', '', allMine, T('Tous mes decks')) : ''}${mine.map(cmdChip).join('')}${cs.filter(x => !mine.some(y => y.slug === x.slug)).map(cmdChip).join('')}</div>
    ${E ? `<label class="fsearch stp-q"><svg class="i" aria-hidden="true"><use href="#i-search"/></svg><input type="search" id="stpCmdQ" inputmode="search" enterkeyhint="search" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="${esc(T('Chercher un commandant'))}" value="${esc(STP.q)}"></label>
      <div class="fopts stp-cmdres">${stpCmdResHtml()}</div>` : `<p class="hint">${EDH.err ? esc(EDH.err) : T('Chargement des commandants…')}</p>`}
    ${cs.length === 1 ? `<p class="hint">${T('Couleurs du commandant : {pips}. Classement du coach pour ce commandant (inclusion, synergie, plan), sans répartition par couleur.', { pips: stpPipsHtml(ciAll) })}</p>`
    : cs.length ? `<p class="hint">${T('Couleurs de tes commandants : {pips}. Classement du coach pour chacun, liste répartie à parts égales entre eux ; une carte qui en sert plusieurs passe devant.', { pips: stpPipsHtml(ciAll) })}</p>`
    : `${h(T('Couleurs'))}<div class="fcols" role="group">${COLOR_DEF.filter(x => x[0] !== 'C').map(([x, nm]) => `<button type="button" class="fcol mc-${x.toLowerCase()}" data-stp="col" data-v="${x}" aria-pressed="${o.cols.includes(x)}" aria-label="${nm}" title="${nm}">${x}</button>`).join('')}</div>
      <p class="hint">${o.cols ? T('Cartes jouables avec ces couleurs (identité de couleur incluse), réparties à parts égales par couleur.') : T('Toutes les couleurs, réparties à parts égales (blanc, bleu, noir, rouge, vert, multicolore, incolore).')}</p>
      <button type="button" class="dkf-sw" role="switch" data-stp="cless" aria-checked="${o.cless}" aria-pressed="${o.cless}"><span>${T('Cartes incolores')}</span><span class="switch" aria-hidden="true"><i></i></span></button>`}
    ${h(T('Rôles') + ` <small>${T('(au moins un)')}</small>`)}<div class="fopts" role="group">${STP_ROLES.map(([r, l]) => chip('role', r, o.roles.includes(r), esc(T(l)))).join('')}</div>
    ${typeof DMX_PICK !== 'undefined' ? h(T('Mécaniques') + ` <small>${T('(au moins une)')}</small>`) + `<div class="fopts stp-tags" role="group">${DMX_PICK.map(t => chip('tag', t, o.tags.includes(t), esc(dmxLabel(t)))).join('')}</div>` : ''}
    <p class="hint">${T('Jamais proposées : terrains de base, cartes interdites en Commander, cartes dont tu as assez d\'exemplaires libres.')}</p></div>`;
}
function stpCmdResHtml() {
  const E = typeof EDH !== 'undefined' && EDH.data, q = STP.q.trim(); if (!E || q.length < 2) return '';
  const Q = cnQ(q), ix = cnIx(); if (!Q) return '';
  const l = E.cmds.filter(c => !c.comm && (c.names.some(n => cnItem({ n, fn: frOf(ownKey(n)) }, Q, ix)) || cnHit(Q, c.names.join(' ')))).sort((a, b) => b.decks - a.decks).slice(0, 10);
  return l.length ? l.map(c => `<button type="button" class="fopt" data-stp="cmd" data-v="${esc(c.slug)}" aria-pressed="${STP.o.cmds.includes(c.slug)}">${c.names.map(n => (typeof cnLabel === 'function' ? cnLabel(n) : esc(n))).join(' + ')} <small>${stpPipsHtml(c.ci)}</small></button>`).join('') : `<p class="hint">${T('Aucun commandant ne correspond.')}</p>`;
}
function stpRunHtml() {
  const r = STP.run, R = STP.res, f = r && r.total ? Math.min(1, (r.done + r.frac) / r.total) : 0, pg = STP.busy && STP.prog;
  if (pg) {      // analyse approfondie : commandant après commandant
    const fp = pg.total ? Math.min(1, (pg.done + (pg.frac || 0)) / pg.total) : 0;
    return `<div class="stp-run" role="status"><b>${esc(STP.busy)}</b><span class="stp-bar"><i style="width:${(fp * 100).toFixed(1)}%"></i></span>
      <small>${T('Commandant {a} / {b}', { a: nf0(Math.min(pg.total, pg.done + 1)), b: nf0(pg.total) })}${pg.sub ? ' · ' + esc(pg.sub) : ''}</small>
      <p class="hint">${T('Analyse approfondie : le coach construit et note des decks, ça prend du temps. Tu peux fermer cette fiche, l\'analyse continue ; « Arrêter » garde ce qui est déjà analysé.')}</p></div>`;
  }
  return `<div class="stp-run" role="status"><b>${STP.busy ? esc(STP.busy) : T('Vérification CardTrader')}</b>
    ${r ? `<span class="stp-bar"><i style="width:${(f * 100).toFixed(1)}%"></i></span><small>${nf0(Math.floor(r.done + r.frac))} / ${nf0(r.total)}${R && R.rep ? ' · ' + TN(R.rep, '{n} remplacée', '{n} remplacées') : ''}${r.step ? ' · ' + esc(r.step) : ''}</small>
      <p class="hint">${T('Les offres sont lues carte par carte : ça peut prendre plusieurs minutes. Tu peux fermer cette fiche, la vérification continue.')}</p>` : '<span class="stp-bar indet"><i></i></span>'}</div>`;
}
function stpWhy(x, R) {
  if (x.w) return x.w;      // liste rouverte de l'historique : la raison telle qu'affichée à l'époque
  const out = [];
  const gc = R.gn && R.gn[x.g], who = gc ? gc.short : R.cmd;      // plusieurs commandants : celui de la carte
  if (x.x) { if (x.x.incl >= 1) out.push(gc ? T('{p} des decks de {name}', { p: pct(Math.round(x.x.incl)), name: who }) : T('{p} des decks du commandant', { p: pct(Math.round(x.x.incl)) })); else if (x.x.ai >= 2) out.push(T('conseillée pour {name}', { name: who })); else if (x.x.m >= 0.4) out.push(T('sert le plan')); }
  if (x.f >= 0.01) out.push(T('{p} des decks analysés', { p: pctTxt(x.f) }));
  if (x.also && x.also.length) out.push(T('aussi pour {names}', { names: x.also.join(', ') }));
  if (x.p >= 0.01) out.push(T('jouée dans {p} des decks', { p: pctTxt(x.p) })); else if (x.rank) out.push(T('rang EDHREC {n}', { n: nf0(x.rank) }));
  const r = x.roles && x.roles[0], rl = r && STP_ROLES.find(y => y[0] === r); if (rl) out.push(T(rl[1]));
  if (x.tag != null && typeof DMX !== 'undefined' && DMX.tags && DMX.tags[x.tag]) out.push(dmxLabel(DMX.tags[x.tag]));
  return out.slice(0, 3).join(' · ');
}
function stpRowHtml(x, i, R) {
  const nm = stpNm(x.name), en = nm !== x.name ? x.name : '', im = x.img || (typeof dmOf === 'function' ? (dmOf(x.k) || {}).im || '' : ''), ct = x.ct === undefined ? '' : x.ct == null ? `<small class="bad">${T('CT : aucune offre')}</small>` : `<small${stpCtOk(x.ct, R.o) ? '' : ' class="bad"'}>CT ${esc(stpEuro(x.ct))}</small>`;
  return `<div class="stp-row" data-k="${esc(x.k)}" data-n="${esc(x.name)}"><span class="stp-i">${nf0(i + 1)}</span><span class="thumb" style="--h:${hash32(x.k) % 360}"${zoomAt('stp', nm)}>${esc((nm.trim()[0] || '?').toUpperCase())}${im ? `<img alt="" loading="lazy" decoding="async" src="${esc(im)}">` : ''}</span>
    <span class="stp-n"><b>${x.need > 1 ? `<em>${nf0(x.need)} ×</em> ` : ''}<span class="row-name">${esc(nm)}</span></b><small>${stpPipsHtml(x.ci)}<span>${esc(en || stpWhy(x, R))}</span></small>${en ? `<small class="stp-why"><span>${esc(stpWhy(x, R))}</span></small>` : ''}</span>
    <span class="stp-p">${esc(stpEuro(x.eur))}${ct}</span><button type="button" class="icon-btn stp-x" data-stp="x" data-v="${esc(x.k)}" aria-label="${esc(T('Retirer {name} de cette liste', { name: x.name }))}"><svg class="i"><use href="#i-close"/></svg></button></div>`;
}
/** Bilan de l'analyse : decks analysés (coach, joueurs), note moyenne, commandants. */
function stpABil(R) {
  const A = R.A, m = A.notes ? (A.notes.length ? Math.round(A.notes.reduce((a, x) => a + x, 0) / A.notes.length) : 0) : A.m || 0;      // m : liste rouverte de l'historique
  return [TN(A.n, '{n} deck analysé', '{n} decks analysés') + ` (${T('coach {a} · joueurs {b}', { a: nf0(A.nc), b: nf0(A.nr) })})`, m ? T('note moyenne {m} / 100', { m }) : '',
    !R.cmd && A.cmds ? TN(A.cmds, '{n} commandant', '{n} commandants') : '', R.stopped ? T('analyse arrêtée avant la fin') : ''].filter(Boolean).join(' · ');
}
function stpResHtml() {
  const R = STP.res, l = stpSorted(R), copies = l.reduce((a, x) => a + x.need, 0), cm = l.reduce((a, x) => a + x.eur * x.need, 0);
  const vv = l.filter(x => x.ct != null), ctTot = vv.reduce((a, x) => a + x.ct * x.need, 0), nv = l.filter(x => x.ct === undefined).length;
  let html = `<div class="stp-sum"><b>${TN(l.length, '{n} carte', '{n} cartes')}${copies !== l.length ? ' · ' + TN(copies, '{n} exemplaire', '{n} exemplaires') : ''}</b>
    <span>${T('≈ {p} au prix Cardmarket', { p: esc(stpEuro(cm)) })}${vv.length ? ` · CardTrader ≈ ${esc(stpEuro(ctTot))}${vv.length < l.length ? ' ' + TN(vv.length, '({n} vérifiée)', '({n} vérifiées)') : ''}` : ''}</span>
    <small>${[R.cmd ? T('Pour {name}', { name: R.cmd }) : '', TN(R.pool, '{n} candidate sous {p}', '{n} candidates sous {p}', { p: esc(stpEuro(R.o.max)) }), R.rep ? TN(R.rep, '{n} remplacée après vérification', '{n} remplacées après vérification') : '', R.cartN ? TN(R.cartN, '{n} carte de ton panier CardTrader écartée', '{n} cartes de ton panier CardTrader écartées') : '', nv && R.o.ct && !STP.run ? TN(nv, '{n} non vérifiée', '{n} non vérifiées') : ''].filter(Boolean).join(' · ')}</small>
    ${R.A && R.A.n ? `<p class="hint stp-note">${esc(stpABil(R))}</p>` : ''}
    ${R.warn || R.note ? `<p class="hint stp-note">${esc([R.warn, R.note].filter(Boolean).join(' '))}</p>` : ''}
    <div class="stp-grp"><span>${T('Classer par')}</span><div class="fopts" role="radiogroup" aria-label="${esc(T('Classer par'))}">${[['', R.order ? T('Commandant') : R.bal ? T('Couleur') : T('Classement')], ['type', T('Type')], ['role', T('Rôle')]].map(([v, lb]) => `<button type="button" class="fopt" role="radio" data-stp="grp" data-v="${v}" aria-checked="${(STP.o.grp || '') === v}" aria-pressed="${(STP.o.grp || '') === v}">${esc(lb)}</button>`).join('')}</div></div>
    <div class="stp-acts"><button type="button" class="btn ghost small" data-stp="edit">${T('Modifier les réglages')}</button>${l.length < R.o.n && R.rest.length && !STP.run ? `<button type="button" class="btn ghost small" data-stp="fill">${T('Compléter ({n})', { n: nf0(Math.min(R.o.n - l.length, R.rest.length)) })}</button>` : ''}${R.note && !STP.run && R.o.ct && nv ? `<button type="button" class="btn ghost small" data-stp="verify">${T('Vérifier sur CardTrader')}</button>` : ''}</div></div>`;
  if (!l.length) return html + `<p class="hint listempty">${T('Aucune carte ne correspond : élargis les couleurs, les rôles ou le prix maximum.')}</p>`;
  const G = stpGrp(R), lab = (k) => {      // titre d'un groupe : couleur ou commandant (pastilles), type, rôle
    if (G.m === 'type') { const t = STP_TYPES.find(y => y[1] === k); return esc(T(t ? t[2] : 'Autres')); }
    if (G.m === 'role') { const r = STP_ROLES.find(y => y[0] === k); return esc(T(r ? r[1] : 'Sans rôle précis')); }
    const gc = R.gn && R.gn[k]; return gc ? stpPipsHtml(gc.ci) + esc(gc.name) : stpPipsHtml(k === 'M' || k === 'C' ? '' : k) + esc(T(STP_GROUP_NAMES[k]));
  };
  let g = null;
  html += '<div class="stp-list">' + l.map((x, i) => { let hd = ''; if (G && G.key(x) !== g) { g = G.key(x); hd = `<h3 class="stp-g">${lab(g)} <small>${nf0(l.filter(y => G.key(y) === g).length)}</small></h3>`; } return hd + stpRowHtml(x, i, R); }).join('') + '</div>';
  return html;
}
function stpPaint() {
  stpATask();
  const api = STP.api; if (!api || sheets.indexOf(api) < 0) return;
  const y = api.body.scrollTop;
  if (STP.busy || STP.run) {
    api.body.innerHTML = (STP.res && STP.run ? stpRunHtml() + stpResHtml() : stpRunHtml());
    api.setFoot(STP.run ? `<button class="btn ghost block" type="button" data-stp="stop">${T('Arrêter la vérification')}</button>` : STP.prog ? `<button class="btn ghost block" type="button" data-stp="stopa"${STP.stop ? ' disabled' : ''}>${T('Arrêter l\'analyse')}</button>` : '');
  } else if (STP.res && !STP.edit) {
    api.body.innerHTML = stpResHtml(); if (typeof thumbsReady === 'function') thumbsReady(api.body); stpMeta();
    const n = STP.res.list.length;
    api.setFoot(`<button class="btn ghost" type="button" data-stp="copy"${n ? '' : ' disabled'}>${T('Copier')}</button><button class="btn" type="button" data-stp="send"${n ? '' : ' disabled'}>${T('Envoyer dans Prix d\'une liste')}</button>`);
  } else {
    api.body.innerHTML = (STP.err ? `<p class="hint stp-note bad">${esc(STP.err)}</p>` : '') + stpFormHtml();
    api.setFoot(`<button class="btn block" type="button" data-stp="go">${TN(STP.o.n, 'Générer {n} carte', 'Générer {n} cartes')}</button>`);
  }
  api.body.scrollTop = y;
}
/** Images des vignettes : pendant la vérification CardTrader, aucune demande (une carte validée reçoit l'image déjà lue par la recherche ; une carte rejetée ne coûte rien) ;
 *  la liste finale établie, seules les cartes encore sans image sont demandées. Fiches lues par lots (builder.js › dmFetch : /cards/collection, 75 cartes par requête ; images ensuite servies par cards.scryfall.io), jamais
 *  une requête par carte à api.scryfall.com (limitée en débit : une rafale bloquait Scryfall, « Scryfall en pause » dans la recherche suivante). La lettre en attendant. */
async function stpMeta() {
  const R = STP.res; if (!R || STP.run || typeof dmFetch !== 'function') return;      // vérification en cours : la liste n'est pas finale
  const need = R.list.filter(x => !x.img), sig = need.map(x => x.k).join('|'); if (!need.length || STP.metaSig === sig) return; STP.metaSig = sig;
  try { await dmLoad(); if (await dmFetch(need.map(x => ({ key: x.k, name: x.name })), false)) stpPaint(); } catch (e) { /* hors ligne, limite Scryfall : les lettres restent */ }
}
/** Seule la barre de progression bouge pendant la vérification (repeinte au plus une fois par image). */
function stpPaintRun() {
  stpATask();
  if (STP.raf) return;
  STP.raf = requestAnimationFrame(() => {
    STP.raf = 0; const api = STP.api; if (!api || sheets.indexOf(api) < 0) return;
    const el = $('.stp-run', api.body); if (!el) { stpPaint(); return; }
    const t = document.createElement('div'); t.innerHTML = stpRunHtml(); el.replaceWith(t.firstElementChild);
  });
}
function stpClick(e) {
  const b = e.target.closest('[data-stp]'); if (!b || b.disabled) return;
  const o = stpLoad(), a = b.dataset.stp, v = b.dataset.v, tog = (l, x) => (l.includes(x) ? l.filter(y => y !== x) : [...l, x]);
  if (a === 'n') o.n = +v; else if (a === 'nd') o.nd = +v; else if (a === 'q') o.q = +v; else if (a === 'max') o.max = +v;
  else if (a === 'ct') o.ct = !o.ct; else if (a === 'deep') o.deep = !o.deep; else if (a === 'cart') o.cart = !o.cart; else if (a === 'cless') o.cless = !o.cless;
  else if (a === 'cmd') {
    if (!v) o.cmds = [];
    else if (o.cmds.includes(v)) o.cmds = o.cmds.filter(x => x !== v);
    else if (o.cmds.length >= STP_CMD_MAX) { toast(TN(STP_CMD_MAX, '{n} commandant au plus', '{n} commandants au plus')); return; }
    else o.cmds = [...o.cmds, v];
  } else if (a === 'cmdall') { const m = stpMyCmds().slice(0, STP_CMD_MAX).map(x => x.slug); o.cmds = m.every(x => o.cmds.includes(x)) ? [] : m; }
  else if (a === 'col') o.cols = 'WUBRG'.split('').filter(c => (c === v ? !o.cols.includes(c) : o.cols.includes(c))).join('');
  else if (a === 'role') o.roles = tog(o.roles, v); else if (a === 'tag') o.tags = tog(o.tags, v);
  else if (a === 'go') { STP.edit = false; STP.err = ''; stpGo(); return; }
  else if (a === 'h') { stpHOpen(v); return; }      // historique : rouvrir
  else if (a === 'hx') { stpHDrop(v); return; }
  else if (a === 'edit') { STP.edit = true; haptic('tap'); stpPaint(); return; }
  else if (a === 'x') { stpDrop(v); return; }
  else if (a === 'fill') { haptic('tap'); stpFill(); return; }
  else if (a === 'verify') {
    haptic('tap'); const R = STP.res, go = () => { R.note = ''; stpVerify(R).then(() => { stpPaint(); stpHPut(R); }); stpPaint(); };
    if (!(typeof mkUs === 'function' && mkUs()) && !ctReady()) ctGetSheet(go); else go();      // CardTrader pas configuré : l'encart du token, puis la vérification
    return;
  }
  else if (a === 'stop') { if (STP.run) STP.run.ctrl.abort(); return; }
  else if (a === 'grp') { o.grp = v || ''; stpSave(); haptic('tap'); const y = STP.api ? STP.api.body.scrollTop : 0; stpPaint(); if (STP.api) STP.api.body.scrollTop = y; return; }
  else if (a === 'stopa') { STP.stop = true; b.disabled = true; haptic('tap'); return; }
  else if (a === 'copy') { haptic('ok'); copyText(stpText(STP.res)); return; }
  else if (a === 'send') { stpSend(); return; }
  else return;
  haptic('tap'); stpSave(); stpPaint();
}
function stpInput(e) {
  const t = e.target, o = stpLoad();
  if (t.id === 'stpCmdQ') { STP.q = t.value; const box = STP.api && $('.stp-cmdres', STP.api.body); if (box) box.innerHTML = stpCmdResHtml(); return; }
  if (e.type !== 'change') return;
  const n = parseFloat(String(t.value).replace(',', '.'));
  if (t.id === 'stpN' && Number.isFinite(n)) o.n = Math.max(10, Math.min(500, Math.round(n)));
  else if (t.id === 'stpMax' && Number.isFinite(n)) o.max = Math.max(1, Math.min(500, Math.round(n * 100)));
  else if (t.id === 'stpTol' && Number.isFinite(n)) o.tol = Math.max(0, Math.min(100, Math.round(n * 100)));
  else return;
  stpSave(); stpPaint();
}
/** Fiche « Chasse aux staples » (compte de l'éditeur seulement) : réglages, puis la liste ; une vérification en cours se retrouve en rouvrant la fiche. */
function stpOpen() {
  if (!stpOn()) return;
  stpLoad(); stpHLoad(); stpHSync();      // historique du compte (compte de l'éditeur seulement)
  if (STP.api && sheets.indexOf(STP.api) >= 0) return;
  openSheet(T('Chasse aux staples'), T('Admin · ton compte seulement'), api => {
    STP.api = api; api.wrap.classList.add('dkf-sheet', 'stp-sheet');
    if (typeof dwImgs === 'function') dwImgs(api.body);      // vignettes : l'image apparaît une fois chargée, la lettre sinon
    api.wrap.addEventListener('click', stpClick);
    api.wrap.addEventListener('input', stpInput); api.wrap.addEventListener('change', stpInput);
    stpPaint();
    if (typeof cnWhen === 'function') cnWhen(() => stpPaint());      // noms traduits pas encore là (anglais en attendant) : la fiche se repeint à leur arrivée
    const E0 = typeof EDH !== 'undefined' && EDH.data;
    if (!E0) edhLoad().then(() => { if (!STP.res || STP.edit) stpPaint(); }, () => stpPaint());      // commandants de Mes decks et recherche
    if (!DW.core) dwLoad().catch(() => {});
  });
  if (typeof syncFloat === 'function') syncFloat();      // fiche au premier plan : sa pastille se cache (la règle lit STP.api, connu seulement maintenant)
}
/* Vignette d'une ligne → la carte en grand, précédente / suivante dans la liste (zoom.js). */
if (typeof ZOOM_LISTS !== 'undefined') ZOOM_LISTS.stp = th => {
  const row = th.closest('.stp-row'); if (!row || !STP.api) return null;
  return zoomFrom(STP.api.body.querySelectorAll('.stp-row'), row, r => zoomNamed(r.dataset.k, stpNm(r.dataset.n), r.dataset.n, typeof wantLang === 'function' ? wantLang() : ''));      // en grand : l'impression dans la langue voulue, cherchée par le viewer
};
if (typeof module !== 'undefined' && module.exports) Object.assign(module.exports, { STP, stpTypeOf, stpNoteW, stpFreq, stpSample, stpPopScore, stpMask, stpGroup, stpPopIndex, stpQuotas, stpPick, stpNext, stpSorted, stpText, stpCtOk, stpGroupsOf, stpNorm, stpHEntry, stpHClean, stpHAll, stpHPutIn, stpHDoc, stpHRestore, STP_H_MAX });
