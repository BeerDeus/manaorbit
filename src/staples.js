/* ── staples.js : « Chasse aux staples » (Compte et réglages › Mon compte, compte de l'éditeur seulement : event.js › evAdmOn) ─────────────────
   Liste d'achat de cartes bon marché qui servent dans presque tous les decks : les plus jouées dans les decks EDHREC qui peuvent les jouer, pondérées par
   leur force et leurs rôles (classement du coach, data/card-mech.json), hors cartes déjà là. Pour composer une commande CardTrader de « staples » à quelques centimes.
   Réglages (gardés sur l'appareil, deckdeal:stp) : nombre de cartes, exemplaires par carte (1-4), prix maximum (tendance Cardmarket, impression la moins chère :
   relevé du jour, data.js › pxTable), vérification CardTrader et sa marge, commandant (un de Mes decks ou n'importe lequel de la base EDHREC), couleurs, rôles, mécaniques.
   Règles :
   · une carte est proposée si tu n'en as pas assez d'exemplaires LIBRES (extras.js › ownFree : possédés − réservés par les decks montés) ; quantité = voulus − libres ;
   · exclues : terrains de base, cartes interdites en Commander (drapeau 16 de la base du coach), prix inconnu ou ≥ prix maximum ;
   · prix écarté (carte non proposée) quand la cote € est 5 fois sous la cote $ (impression mal rattachée : même règle que gen-prices.mjs › pxAdd) ;
   · score sans commandant : popularité (part pondérée des decks EDHREC dont l'identité permet la carte, stpPopIndex, et rang EDHREC général : stpPopScore) + force + rôles utilitaires (+ plan des mécaniques
     choisies, deckmech.js › dmxFit) ; répartition équilibrée par couleur (W, U, B, R, G, multicolore, incolore : stpQuotas) ;
   · avec un commandant : la valeur du coach pour ce commandant (deckwiz.js › dwInfo, dwVal : inclusion, synergie, fiche IA, plan), pièges écartés, classement pur ;
   · vérification CardTrader (facultative, longue : offres réelles carte par carte, data.js › runLive comme collection.js › pxRun) : une carte dont l'offre la moins chère
     (critères de la recherche : état, mode, langue, repli anglais) n'est pas sous prix maximum + marge est remplacée par la suivante du classement (même couleur).
     Prix lus gardés 2 jours sur l'appareil (deckdeal:stp:ct) ; la vérification continue si la fiche est fermée (pastille flottante).
   Sortie : « Copier » (« 1 Nom » par ligne) ou « Envoyer dans Prix d'une liste » (app.js › putDeckText). ✕ sur une ligne : écartée de cette liste seulement. */
const STP_KEY = 'deckdeal:stp', STP_CT_KEY = 'deckdeal:stp:ct', STP_CT_TTL = 2 * 864e5;
const STP_N = [50, 100, 150, 200, 300], STP_MAXS = [10, 15, 25, 50];
const STP_ROLES = [['ramp', 'Rampe'], ['draw', 'Pioche'], ['removal', 'Retraits ciblés'], ['wipe', 'Balayages'], ['counter', 'Contresorts'], ['protect', 'Protection'], ['recursion', 'Récursion'],
  ['tutor', 'Tuteurs'], ['fixing', 'Couleurs (fixing)'], ['wincon', 'Conditions de victoire'], ['land', 'Terrains']];
const STP_UTIL = ['ramp', 'draw', 'removal', 'wipe', 'counter', 'protect', 'recursion', 'tutor', 'fixing'];      // rôles « utilitaires » : un petit bonus au score
const STP_GROUPS = ['W', 'U', 'B', 'R', 'G', 'M', 'C'];
const STP_GROUP_NAMES = { W: 'Blanc', U: 'Bleu', B: 'Noir', R: 'Rouge', G: 'Vert', M: 'Multicolore', C: 'Incolore' };
const STP = { o: null, api: null, q: '', res: null, run: null, pop: null, ct: null, task: null };

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
 *  → { pick, rest } (rest : les suivantes, dans l'ordre du classement : réserve des remplacements). */
function stpPick(ranked, n, quotas) {
  if (!quotas) return { pick: ranked.slice(0, n), rest: ranked.slice(n) };
  const cnt = {}, take = new Set(), pick = [], floor = ranked.length ? ranked[Math.min(n, ranked.length) - 1].s * 0.8 : 0;      // un groupe ne remplit son quota qu'avec des cartes proches du niveau de la liste (pas d'incolores médiocres pour faire le compte)
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
/** Ordre d'affichage (et de la liste copiée) : par groupe de couleur si la répartition est équilibrée, puis du meilleur score au moins bon. */
const stpSorted = R => [...R.list].sort((a, b) => (R.bal ? STP_GROUPS.indexOf(a.g) - STP_GROUPS.indexOf(b.g) : 0) || b.s - a.s);
/** Texte de la liste : « 1 Sol Ring » par ligne. */
const stpText = R => stpSorted(R).map(x => x.need + ' ' + x.name).join('\n');
/** Offre CardTrader acceptée ? (prix en centimes, null : aucune offre) : strictement sous prix maximum + marge. */
const stpCtOk = (p, o) => p != null && p < o.max + o.tol;

/* ── Réglages ─────────────────────────────────────────────────────────────────────────────────────── */
const stpDefaults = () => ({ n: 150, q: 1, max: 15, ct: true, tol: 5, cols: '', cless: true, cmd: '', tags: [], roles: [] });
function stpLoad() {
  if (STP.o) return STP.o;
  let o = {}; try { o = JSON.parse(localStorage.getItem(STP_KEY) || '{}') || {}; } catch (e) { o = {}; }
  const d = stpDefaults(), int = (v, lo, hi, def) => (Number.isFinite(+v) ? Math.max(lo, Math.min(hi, Math.round(+v))) : def);
  STP.o = { n: int(o.n, 10, 500, d.n), q: int(o.q, 1, 4, d.q), max: int(o.max, 1, 500, d.max), ct: o.ct !== false, tol: int(o.tol, 0, 100, d.tol),
    cols: String(o.cols || '').replace(/[^WUBRG]/g, ''), cless: o.cless !== false, cmd: typeof o.cmd === 'string' ? o.cmd : '',
    tags: Array.isArray(o.tags) ? o.tags.filter(t => typeof t === 'string').slice(0, 12) : [], roles: Array.isArray(o.roles) ? o.roles.filter(r => STP_ROLES.some(x => x[0] === r)) : [] };
  return STP.o;
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
/** Commandant choisi (base EDHREC), ou null. */
const stpCmd = () => { const E = typeof EDH !== 'undefined' && EDH.data, s = STP.o && STP.o.cmd; return E && s ? E.bySlug.get(s) || null : null; };
/** Commandant au format du coach (deckwiz.js › dwCmdOf). */
const stpCoachCmd = c => ({ slug: c.slug, names: c.names, keys: c.keys, ci: dwCiOf(c.keys, c.ci), th: [] });

/** Cartes candidates, de la meilleure à la moins bonne : [{ k, name, ci, g, eur, need, s, p, why }]. ctx : { pop, cmd (format du coach) , C (dwInfo) }. */
function stpCands(o, ctx) {
  const { pop, cmd, C } = ctx, out = [], tagI = o.tags.map(t => dmxTag(t)).filter(i => i >= 0);
  const okCi = cmd ? ci => [...ci].every(c => cmd.ci.includes(c)) : ci => colorFit(ci, o.cols, 'in');
  const plan = cmd ? C && C.plan : tagI.length && typeof dmxPlan === 'function' ? dmxPlan({ slug: '', names: [], keys: [], ci: o.cols || 'WUBRG' }, { mech: o.tags }) : null;
  for (const [k, r] of DW.byKey) {
    if (BASIC_NAMES.has(k) || r[6] & 16) continue;      // terrains de base, interdites en Commander
    const ci = String(r[1] || ''); if (!okCi(ci) || (!ci && !o.cless)) continue;
    const eur = stpEur(k, r); if (!eur || eur >= o.max) continue;
    const m = dmx(k);
    if (o.roles.length && !o.roles.some(x => stpRole(m, r, x))) continue;
    if (tagI.length && !(m && tagI.some(i => m.p.includes(i) || m.w.includes(i) || m.ip.includes(i)))) continue;
    const need = o.q - Math.max(0, ownFree(k, null)); if (need <= 0) continue;      // assez d'exemplaires libres (ni engagés dans un deck monté)
    const p = pop.get(k) || 0, ps = stpPopScore(p, r[8] || 0), qv = dmxQ(m), roles = STP_UTIL.filter(x => stpRole(m, r, x));
    let s, x = null;
    if (cmd) {
      x = C && C.get(k); if (x && x.trap) continue;      // piège de la fiche du commandant
      s = (x ? dwVal(x) : 0) + 0.35 * ps + 0.1 * qv;
    } else s = 0.7 * ps + 0.18 * qv + Math.min(0.08, 0.04 * roles.length) + (plan && m ? 0.35 * dmxFit(m, plan, null) : 0);      // les plus jouées d'abord ; force et rôles départagent
    if (!(s > 0.03)) continue;      // ni jouée ni utile : rien à faire dans une liste de staples
    out.push({ k, name: r[0], ci, g: stpGroup(ci), eur, need, s, p, rank: r[8] || 0, roles, x: x ? { incl: x.incl || 0, ai: x.ai, m: x.m || 0 } : null, tag: tagI.find(i => m && (m.p.includes(i) || m.w.includes(i) || m.ip.includes(i))) });
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
  STP.task = floatTask(T('Chasse aux staples'), { total: run.total, sub: T('Vérification CardTrader…') }, () => !(STP.api && sheets[sheets.length - 1] === STP.api));
  const upd = () => { STP.task.set(run.done + run.frac, run.total, `${nf0(Math.floor(run.done + run.frac))} / ${nf0(run.total)}${R.rep ? ' · ' + TN(R.rep, '{n} remplacée', '{n} remplacées') : ''}`); stpPaintRun(); };
  upd();
  try {
    for (let pass = 0; pass < 30; pass++) {
      const todo = R.list.filter(x => x.ct === undefined); if (!todo.length) break;
      for (const x of todo) { const c = stpCtGet(x.k, sig); if (c) { x.ct = c.p; run.done++; } }
      const left = todo.filter(x => x.ct === undefined);
      for (let i = 0; i < left.length; i += PX_CHUNK) {
        const chunk = left.slice(i, i + PX_CHUNK), offers = new Map();
        const hooks = {
          step: (id, st, d) => { if (st === 'run') { run.step = (PX_STEPS[id] || id) + (d ? ' ' + d : ''); upd(); } },
          progress: f => { run.frac = f * chunk.length; upd(); },
          rate() {}, hint() {}, cacheAge() {},
          needsEn: key => needsEnglish(offers.get(key) || [], opts),
          card: (key, p) => { const l = p.fellBack ? (offers.get(key) || []).concat(p.offers || []) : p.offers || []; offers.set(key, p.notFound ? [] : l); },
        };
        await runLive(chunk.map(x => ({ key: x.k, name: x.name, qty: x.need })), opts, hooks, run.ctrl.signal);
        for (const x of chunk) {
          const l = offers.get(x.k) || [], b = cheapestOffer(l, opts) || (opts.fallbackEn ? cheapestOffer(l, { ...opts, lang: 'en' }) : null);
          x.ct = b ? b.price : null; stpCtSet(x.k, sig, x.ct);
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

/* ── Génération ───────────────────────────────────────────────────────────────────────────────────── */
async function stpGo() {
  if (STP.run || STP.busy) return;
  const o = { ...stpLoad(), tags: [...STP.o.tags], roles: [...STP.o.roles] };
  STP.busy = T('Chargement des données…'); STP.res = null; stpPaint();
  try {
    await Promise.all([edhLoad().catch(() => null), dwLoad().catch(() => null), pxTable().catch(() => null)]);
    if (!DW.byKey) throw new Error(T('Base du coach indisponible : réessaie dans un moment.'));
    const c = o.cmd ? stpCmd() : null; let cmd = null, C = null;
    if (o.cmd && !c) throw new Error(T('Commandant introuvable dans la base EDHREC.'));
    if (c) {
      STP.busy = T('Fiche de {name}…', { name: c.names.join(' + ') }); stpPaint();
      cmd = stpCoachCmd(c); const pack = await dwPack('c', c.slug);
      C = dwInfo(pack, { ...dwDefaults(), mech: o.tags.slice(0, 4) }, cmd);
    }
    STP.busy = T('Classement des cartes…'); stpPaint();
    await new Promise(r => setTimeout(r, 30));
    const ranked = stpCands(o, { pop: stpPop(), cmd, C }), bal = !cmd, quotas = bal ? stpQuotas(o.n, stpGroupsOf(o)) : null, { pick, rest } = stpPick(ranked, o.n, quotas);
    const R = STP.res = { o, list: pick, rest, out: [], rep: 0, bal, quotas, cmd: c ? c.names.join(' + ') : '', pool: ranked.length, note: '', warn: EDH.data ? '' : T('Decks EDHREC indisponibles : classement par force et rôles seulement.'), at: Date.now() };
    STP.busy = '';
    if (o.ct && R.list.length) { stpPaint(); await stpVerify(R); }
  } catch (e) {
    STP.busy = ''; STP.err = (e && e.message) || T('Échec de la génération.');
  } finally { STP.busy = ''; stpPaint(); haptic(STP.res ? 'ok' : 'bad'); }
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
}
function stpDrop(k) {
  const R = STP.res; if (!R) return;
  const i = R.list.findIndex(x => x.k === k); if (i < 0) return;
  R.list.splice(i, 1); haptic('tap'); stpPaint();
}
function stpSend() {
  const R = STP.res; if (!R || !R.list.length) return;
  const text = stpText(R);
  haptic('ok');
  while (sheets.length) sheets[sheets.length - 1].close();
  if (typeof navCloseSections === 'function') navCloseSections();
  putDeckText(text, T('Chasse aux staples'));
}

/* ── Affichage ────────────────────────────────────────────────────────────────────────────────────── */
const stpOn = () => typeof evAdmOn === 'function' && evAdmOn();
/** Ligne de « Mon compte » (compte de l'éditeur seulement). */
const stpMeRow = () => (stpOn() ? meRow('staples', T('Chasse aux staples'), STP.run ? T('En cours…') : '') : '');
const stpEuro = c => fmt(c, 'EUR');
const stpPipsHtml = ci => (ci ? `<span class="deck-pips">${[...ci].map(x => `<i class="pip ${x}"></i>`).join('')}</span>` : '<span class="deck-pips stp-cl" aria-hidden="true">◇</span>');

function stpFormHtml() {
  const o = stpLoad(), E = typeof EDH !== 'undefined' && EDH.data, c = stpCmd(), h = t => `<h3 class="dkf-h">${t}</h3>`;
  const chip = (act, v, on, label, extra = '') => `<button type="button" class="fopt" data-stp="${act}" data-v="${esc(String(v))}" aria-pressed="${!!on}"${extra}>${label}</button>`;
  const mine = stpMyCmds();
  const cmdChip = x => chip('cmd', x.slug, o.cmd === x.slug, esc(x.names.join(' + ')) + ` <small>${stpPipsHtml(x.ci)}</small>`);
  return `<div class="dkf stp">
    ${h(T('Nombre de cartes'))}<div class="fopts" role="group">${STP_N.map(n => chip('n', n, o.n === n, nf0(n))).join('')}
      <label class="stp-in">${T('Autre')} <input type="number" id="stpN" inputmode="numeric" min="10" max="500" step="10" value="${o.n}"></label></div>
    ${h(T('Exemplaires par carte'))}<div class="fopts" role="group">${[1, 2, 3, 4].map(q => chip('q', q, o.q === q, String(q))).join('')}</div>
    <p class="hint">${T('Une carte est proposée si tu en as moins d\'exemplaires libres (non engagés dans un deck monté) : seuls ceux qui manquent sont achetés.')}</p>
    ${h(T('Prix maximum') + ` <small>${T('(tendance Cardmarket, impression la moins chère)')}</small>`)}<div class="fopts" role="group">${STP_MAXS.map(v => chip('max', v, o.max === v, '&lt; ' + esc(stpEuro(v)))).join('')}
      <label class="stp-in">&lt; <input type="number" id="stpMax" inputmode="decimal" min="0.01" max="5" step="0.01" value="${(o.max / 100).toFixed(2)}"> €</label></div>
    <button type="button" class="dkf-sw" role="switch" data-stp="ct" aria-checked="${o.ct}" aria-pressed="${o.ct}"><span>${T('Vérifier les offres CardTrader')}<small>${T('long')}</small></span><span class="switch" aria-hidden="true"><i></i></span></button>
    ${o.ct ? `<div class="fopts"><label class="stp-in">${T('Marge CardTrader')} + <input type="number" id="stpTol" inputmode="decimal" min="0" max="1" step="0.01" value="${(o.tol / 100).toFixed(2)}"> €</label></div>
      <p class="hint">${T('Une carte est gardée si son offre CardTrader la moins chère (tes critères de recherche) est sous {p} ; sinon la suivante du classement prend sa place.', { p: esc(stpEuro(o.max + o.tol)) })}</p>` : ''}
    ${h(T('Commandant') + ` <small>${T('(facultatif)')}</small>`)}
    <div class="fopts stp-cmds" role="group">${chip('cmd', '', !o.cmd, T('Aucun'))}${mine.map(cmdChip).join('')}${c && !mine.some(x => x.slug === c.slug) ? cmdChip(c) : ''}</div>
    ${E ? `<label class="fsearch stp-q"><svg class="i" aria-hidden="true"><use href="#i-search"/></svg><input type="search" id="stpCmdQ" inputmode="search" enterkeyhint="search" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="${esc(T('Chercher un commandant'))}" value="${esc(STP.q)}"></label>
      <div class="fopts stp-cmdres">${stpCmdResHtml()}</div>` : `<p class="hint">${EDH.err ? esc(EDH.err) : T('Chargement des commandants…')}</p>`}
    ${c ? `<p class="hint">${T('Couleurs du commandant : {pips}. Classement du coach pour ce commandant (inclusion, synergie, plan), sans répartition par couleur.', { pips: stpPipsHtml(dwCiOf(c.keys, c.ci)) })}</p>`
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
  return l.length ? l.map(c => `<button type="button" class="fopt" data-stp="cmd" data-v="${esc(c.slug)}" aria-pressed="${STP.o.cmd === c.slug}">${esc(c.names.join(' + '))} <small>${stpPipsHtml(c.ci)}</small></button>`).join('') : `<p class="hint">${T('Aucun commandant ne correspond.')}</p>`;
}
function stpRunHtml() {
  const r = STP.run, R = STP.res, f = r && r.total ? Math.min(1, (r.done + r.frac) / r.total) : 0;
  return `<div class="stp-run" role="status"><b>${STP.busy ? esc(STP.busy) : T('Vérification CardTrader')}</b>
    ${r ? `<span class="stp-bar"><i style="width:${(f * 100).toFixed(1)}%"></i></span><small>${nf0(Math.floor(r.done + r.frac))} / ${nf0(r.total)}${R && R.rep ? ' · ' + TN(R.rep, '{n} remplacée', '{n} remplacées') : ''}${r.step ? ' · ' + esc(r.step) : ''}</small>
      <p class="hint">${T('Les offres sont lues carte par carte : ça peut prendre plusieurs minutes. Tu peux fermer cette fiche, la vérification continue.')}</p>` : '<span class="stp-bar indet"><i></i></span>'}</div>`;
}
function stpWhy(x, R) {
  const out = [];
  if (x.x) { if (x.x.incl >= 1) out.push(T('{p} des decks du commandant', { p: pct(Math.round(x.x.incl)) })); else if (x.x.ai >= 2) out.push(T('conseillée pour {name}', { name: R.cmd })); else if (x.x.m >= 0.4) out.push(T('sert le plan')); }
  if (x.p >= 0.01) out.push(T('jouée dans {p} des decks', { p: pctTxt(x.p) })); else if (x.rank) out.push(T('rang EDHREC {n}', { n: nf0(x.rank) }));
  const r = x.roles && x.roles[0], rl = r && STP_ROLES.find(y => y[0] === r); if (rl) out.push(T(rl[1]));
  if (x.tag != null && typeof DMX !== 'undefined' && DMX.tags && DMX.tags[x.tag]) out.push(dmxLabel(DMX.tags[x.tag]));
  return out.slice(0, 3).join(' · ');
}
function stpRowHtml(x, i, R) {
  const fn = typeof frOf === 'function' && I18N.lang === 'fr' ? frOf(x.k) : '', ct = x.ct === undefined ? '' : x.ct == null ? `<small class="bad">${T('CT : aucune offre')}</small>` : `<small${stpCtOk(x.ct, R.o) ? '' : ' class="bad"'}>CT ${esc(stpEuro(x.ct))}</small>`;
  return `<div class="stp-row"><span class="stp-i">${nf0(i + 1)}</span><span class="stp-n"><b>${x.need > 1 ? `<em>${nf0(x.need)} ×</em> ` : ''}${esc(x.name)}</b><small>${stpPipsHtml(x.ci)}<span>${fn && fn !== x.name ? esc(fn) + ' · ' : ''}${esc(stpWhy(x, R))}</span></small></span>
    <span class="stp-p">${esc(stpEuro(x.eur))}${ct}</span><button type="button" class="icon-btn stp-x" data-stp="x" data-v="${esc(x.k)}" aria-label="${esc(T('Retirer {name} de cette liste', { name: x.name }))}"><svg class="i"><use href="#i-close"/></svg></button></div>`;
}
function stpResHtml() {
  const R = STP.res, l = stpSorted(R), copies = l.reduce((a, x) => a + x.need, 0), cm = l.reduce((a, x) => a + x.eur * x.need, 0);
  const vv = l.filter(x => x.ct != null), ctTot = vv.reduce((a, x) => a + x.ct * x.need, 0), nv = l.filter(x => x.ct === undefined).length;
  let html = `<div class="stp-sum"><b>${TN(l.length, '{n} carte', '{n} cartes')}${copies !== l.length ? ' · ' + TN(copies, '{n} exemplaire', '{n} exemplaires') : ''}</b>
    <span>${T('≈ {p} au prix Cardmarket', { p: esc(stpEuro(cm)) })}${vv.length ? ` · CardTrader ≈ ${esc(stpEuro(ctTot))}${vv.length < l.length ? ' ' + TN(vv.length, '({n} vérifiée)', '({n} vérifiées)') : ''}` : ''}</span>
    <small>${[R.cmd ? T('Pour {name}', { name: R.cmd }) : '', TN(R.pool, '{n} candidate sous {p}', '{n} candidates sous {p}', { p: esc(stpEuro(R.o.max)) }), R.rep ? TN(R.rep, '{n} remplacée après vérification', '{n} remplacées après vérification') : '', nv && R.o.ct && !STP.run ? TN(nv, '{n} non vérifiée', '{n} non vérifiées') : ''].filter(Boolean).join(' · ')}</small>
    ${R.warn || R.note ? `<p class="hint stp-note">${esc([R.warn, R.note].filter(Boolean).join(' '))}</p>` : ''}
    <div class="stp-acts"><button type="button" class="btn ghost small" data-stp="edit">${T('Modifier les réglages')}</button>${l.length < R.o.n && R.rest.length && !STP.run ? `<button type="button" class="btn ghost small" data-stp="fill">${T('Compléter ({n})', { n: nf0(Math.min(R.o.n - l.length, R.rest.length)) })}</button>` : ''}${R.note && !STP.run && R.o.ct && nv ? `<button type="button" class="btn ghost small" data-stp="verify">${T('Vérifier sur CardTrader')}</button>` : ''}</div></div>`;
  if (!l.length) return html + `<p class="hint listempty">${T('Aucune carte ne correspond : élargis les couleurs, les rôles ou le prix maximum.')}</p>`;
  let g = '';
  html += '<div class="stp-list">' + l.map((x, i) => { let hd = ''; if (R.bal && x.g !== g) { g = x.g; hd = `<h3 class="stp-g">${stpPipsHtml(g === 'M' || g === 'C' ? '' : g)}${T(STP_GROUP_NAMES[g])} <small>${nf0(l.filter(y => y.g === g).length)}</small></h3>`; } return hd + stpRowHtml(x, i, R); }).join('') + '</div>';
  return html;
}
function stpPaint() {
  const api = STP.api; if (!api || sheets.indexOf(api) < 0) return;
  const y = api.body.scrollTop;
  if (STP.busy || STP.run) {
    api.body.innerHTML = (STP.res && STP.run ? stpRunHtml() + stpResHtml() : stpRunHtml());
    api.setFoot(STP.run ? `<button class="btn ghost block" type="button" data-stp="stop">${T('Arrêter la vérification')}</button>` : '');
  } else if (STP.res && !STP.edit) {
    api.body.innerHTML = stpResHtml();
    const n = STP.res.list.length;
    api.setFoot(`<button class="btn ghost" type="button" data-stp="copy"${n ? '' : ' disabled'}>${T('Copier')}</button><button class="btn" type="button" data-stp="send"${n ? '' : ' disabled'}>${T('Envoyer dans Prix d\'une liste')}</button>`);
  } else {
    api.body.innerHTML = (STP.err ? `<p class="hint stp-note bad">${esc(STP.err)}</p>` : '') + stpFormHtml();
    api.setFoot(`<button class="btn block" type="button" data-stp="go">${TN(STP.o.n, 'Générer {n} carte', 'Générer {n} cartes')}</button>`);
  }
  api.body.scrollTop = y;
}
/** Seule la barre de progression bouge pendant la vérification (repeinte au plus une fois par image). */
function stpPaintRun() {
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
  if (a === 'n') o.n = +v; else if (a === 'q') o.q = +v; else if (a === 'max') o.max = +v;
  else if (a === 'ct') o.ct = !o.ct; else if (a === 'cless') o.cless = !o.cless;
  else if (a === 'cmd') o.cmd = v || '';
  else if (a === 'col') o.cols = 'WUBRG'.split('').filter(c => (c === v ? !o.cols.includes(c) : o.cols.includes(c))).join('');
  else if (a === 'role') o.roles = tog(o.roles, v); else if (a === 'tag') o.tags = tog(o.tags, v);
  else if (a === 'go') { STP.edit = false; STP.err = ''; stpGo(); return; }
  else if (a === 'edit') { STP.edit = true; haptic('tap'); stpPaint(); return; }
  else if (a === 'x') { stpDrop(v); return; }
  else if (a === 'fill') { haptic('tap'); stpFill(); return; }
  else if (a === 'verify') {
    haptic('tap'); const R = STP.res, go = () => { R.note = ''; stpVerify(R).then(stpPaint); stpPaint(); };
    if (!(typeof mkUs === 'function' && mkUs()) && !ctReady()) ctGetSheet(go); else go();      // CardTrader pas configuré : l'encart du token, puis la vérification
    return;
  }
  else if (a === 'stop') { if (STP.run) STP.run.ctrl.abort(); return; }
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
  stpLoad();
  if (STP.api && sheets.indexOf(STP.api) >= 0) return;
  openSheet(T('Chasse aux staples'), T('Admin · ton compte seulement'), api => {
    STP.api = api; api.wrap.classList.add('dkf-sheet', 'stp-sheet');
    api.wrap.addEventListener('click', stpClick);
    api.wrap.addEventListener('input', stpInput); api.wrap.addEventListener('change', stpInput);
    stpPaint();
    const E0 = typeof EDH !== 'undefined' && EDH.data;
    if (!E0) edhLoad().then(() => { if (!STP.res || STP.edit) stpPaint(); }, () => stpPaint());      // commandants de Mes decks et recherche
    if (!DW.core) dwLoad().catch(() => {});
  });
}
if (typeof module !== 'undefined' && module.exports) Object.assign(module.exports, { stpPopScore, stpMask, stpGroup, stpPopIndex, stpQuotas, stpPick, stpNext, stpSorted, stpText, stpCtOk, stpGroupsOf });
