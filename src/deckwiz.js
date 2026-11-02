/* ── deckwiz.js : assistant de deck Commander (fonctionnalité en test « deckwiz », labs.js) ─────────────────────────────────────
   1. Nouveau deck : « J'ai déjà ce deck » (scanner, coller la liste, à la main) ou « Deck à construire » (assistant : commandant, thèmes, bracket, budget).
   2. Onglet « Coach » de l'éditeur (builder.js), Commander seulement : jauges par catégorie (terrains, rampe, pioche, retraits, balayages…) face à des cibles,
      courbe de mana, sources de couleur, règles du bracket choisi, budget ; un appui sur une jauge propose les cartes qui manquent (ta collection d'abord).
   Données : la base du coach (/api/dkw, server/dkw-srv.mjs, générée par gen-deckdb.mjs) : rôle de chaque carte, cibles calculées sur des milliers de decks réels
   (médianes et quartiles : tous, par bracket, par thème, par commandant), cartes conseillées par commandant (inclusion et synergie EDHREC, thèmes approfondis).
   Les terrains suivent la formule de Frank Karsten (coût moyen et rampe/pioche pas chères du deck en cours) : voir docs/deckbuilder/recherche.md.
   Sans la base (hors ligne, serveur sans données) : cibles du modèle de base (DW_BASE), sans suggestions. Rien ne s'affiche tant que labOn('deckwiz') est faux. */
const DKW_ROLES = ['land', 'ramp', 'draw', 'removal', 'wipe', 'counter', 'tutor', 'protect', 'recursion', 'wincon'];
const DW_RB = Object.fromEntries(DKW_ROLES.map((r, i) => [r, 1 << i]));
/** Libellés des jauges (ordre d'affichage) et explication courte. */
const DW_GAUGES = [
  ['land', 'Terrains', 'Terrains joués (terrains de base compris). Cible : formule de Frank Karsten d\'après le coût moyen du deck et sa rampe ou pioche pas chère.'],
  ['ramp', 'Rampe', 'Accélération de mana : mana rocks, créatures qui produisent du mana, sorts qui cherchent des terrains, trésors réguliers.'],
  ['draw', 'Pioche', 'Avantage de cartes : pioche en rafale, moteurs de pioche, tirage à exil.'],
  ['removal', 'Retraits ciblés', 'Interaction ciblée : détruire, exiler, renvoyer ou faire sacrifier une menace.'],
  ['wipe', 'Balayages', 'Retraits de masse : remettent la table à zéro quand tu es en retard.'],
  ['counter', 'Contresorts', 'Contresorts (bleu) : interaction sur la pile, protection du plan.'],
  ['protect', 'Protection', 'Protège ton commandant ou tes pièces clés (hexproof, indestructible, phasing…).'],
  ['tutor', 'Tuteurs', 'Cherchent une carte précise. Limités dans les brackets bas.'],
  ['recursion', 'Récursion', 'Ramènent des cartes du cimetière.'],
];
/** Modèle de base, sans la base du coach : [bas, cible, haut] (recherche : docs/deckbuilder/recherche.md › Cibles recommandées). */
const DW_BASE = { land: [36, 37, 38], ramp: [9, 10, 12], draw: [9, 10, 12], removal: [7, 9, 11], wipe: [2, 3, 4], counter: [0, 2, 5], protect: [2, 4, 6], tutor: [0, 2, 4], recursion: [1, 3, 5], mv: [2.8, 3.1, 3.4], cheap: [6, 9, 12], gc: [0, 0, 1] };
/** Ajustements du modèle de base par bracket (sans statistiques du corpus pour ce bracket). */
const DW_BR_ADJ = { 1: { tutor: [0, 1, 2], wipe: [1, 2, 3] }, 2: { tutor: [0, 1, 3] }, 4: { ramp: [11, 12, 14], tutor: [3, 5, 8], removal: [8, 10, 12], counter: [2, 4, 7] }, 5: { land: [28, 31, 34], ramp: [14, 17, 20], tutor: [6, 9, 12], counter: [4, 7, 10], removal: [6, 8, 10], wipe: [0, 1, 2] } };
/** Brackets officiels (Wizards, 2025) : nom, Game Changers permis, et ce qui est exclu. */
const DW_BRACKETS = [
  [1, 'Exhibition', 'Decks à thème, très décontractés : aucun Game Changer, pas de destruction massive de terrains, pas de combo à 2 cartes, pas de tours supplémentaires enchaînés.', 0],
  [2, 'Core', 'Niveau d\'un deck préconstruit : aucun Game Changer, pas de destruction massive de terrains, pas de combo à 2 cartes, pas de tours supplémentaires enchaînés, peu de tuteurs.', 0],
  [3, 'Upgraded', 'Amélioré : jusqu\'à 3 Game Changers, pas de destruction massive de terrains, pas de combo à 2 cartes avant le milieu de partie, pas de tours supplémentaires enchaînés.', 3],
  [4, 'Optimized', 'Optimisé : aucune restriction en dehors de la liste des cartes bannies.', 99],
  [5, 'cEDH', 'Compétitif (cEDH) : le meilleur deck possible, méta de tournoi.', 99],
];
const DW = { core: null, p: null, err: '', byKey: null, cmd: new Map(), cmdP: new Map(), th: new Map(), thP: new Map(), open: '', shown: 8, setOpen: false };
const DW_KEY = 'dkw:core', DW_FRESH = DAY;
const dwOn = () => typeof labOn === 'function' && labOn('deckwiz');

/* ── Données ──────────────────────────────────────────────────────────────────────────────────────── */
async function dwGet(q, same) {
  if (typeof location === 'undefined' || !/^https?:$/.test(location.protocol)) return null;
  let r; try { r = await fetch(new URL('api/dkw' + (q ? '?' + q : ''), location.href).href, { cache: 'no-cache', headers: same ? { 'If-None-Match': same } : {} }); } catch (e) { return null; }
  if (r.status === 304) return { same: true };
  if (!r.ok) return null;
  try { return { j: await r.json(), etag: r.headers.get('etag') || '' }; } catch (e) { return null; }
}
/** Index du cœur : clé de carte → rangée [nom, identité, coût, types, rôles, prix, drapeaux, couleurs produites, rang]. */
function dwIndex(core) { const m = new Map(); for (const r of core.cards || []) { const k = ownKey(r[0]); if (k && !m.has(k)) m.set(k, r); } return m; }
/** Cœur de la base : copie de l'appareil (un jour), sinon le serveur ; une copie plus ancienne sert hors ligne. */
function dwLoad() {
  if (DW.core) return Promise.resolve(DW.core);
  if (DW.p) return DW.p;
  DW.err = '';
  DW.p = (async () => {
    const rec = await Cache.get(DW_KEY, 60 * DAY).catch(() => null);
    if (rec && rec.j && Date.now() - rec.at < DW_FRESH) return rec.j;
    const g = await dwGet('', rec && rec.etag);
    if (g && g.same && rec) { Cache.set(DW_KEY, { ...rec, at: Date.now() }); return rec.j; }
    if (g && g.j && Array.isArray(g.j.cards)) { Cache.set(DW_KEY, { j: g.j, at: Date.now(), etag: g.etag }); return g.j; }
    if (rec && rec.j) return rec.j;
    throw new Error('absent');
  })().then(j => { DW.core = j; DW.byKey = dwIndex(j); return j; })
    .catch(e => { DW.err = T('Base du coach indisponible : cibles du modèle de base, sans suggestions personnalisées.'); throw e; })
    .finally(() => { DW.p = null; if (BD.el && BD.tab === 'coach') bdList(); });
  return DW.p;
}
/** Paquet d'un commandant (slug) ou d'un thème (t:slug) : gardé sur l'appareil 7 jours. null si le serveur ne le connaît pas. */
function dwPack(kind, slug) {
  const m = kind === 'c' ? DW.cmd : DW.th, pm = kind === 'c' ? DW.cmdP : DW.thP;
  if (m.has(slug)) return Promise.resolve(m.get(slug));
  if (pm.has(slug)) return pm.get(slug);
  const key = 'dkw:' + kind + ':' + slug;
  const p = (async () => {
    const rec = await Cache.get(key, 30 * DAY).catch(() => null);
    if (rec && Date.now() - rec.at < 7 * DAY) return rec.j;
    const g = await dwGet(kind + '=' + encodeURIComponent(slug), rec && rec.etag);
    if (g && g.same && rec) { Cache.set(key, { ...rec, at: Date.now() }); return rec.j; }
    if (g && g.j) { Cache.set(key, { j: g.j, at: Date.now(), etag: g.etag }); return g.j; }
    return rec ? rec.j : null;
  })().then(j => { m.set(slug, j || null); return j || null; }).catch(() => { m.set(slug, null); return null; })
    .finally(() => { pm.delete(slug); if (BD.el && BD.tab === 'coach') bdList(); });
  pm.set(slug, p); return p;
}
/** Rangée de la base pour une carte, ou une rangée de secours d'après la fiche (type, coût, identité) : rôles « terrain » seulement. */
function dwCard(k) {
  const r = DW.byKey && DW.byKey.get(k); if (r) return { name: r[0], ci: r[1], cmc: r[2], ty: r[3], roles: r[4], eur: r[5], fl: r[6], prod: r[7] || '', rank: r[8] || 0 };
  const m = typeof dmOf === 'function' ? dmOf(k) : null; if (!m && !BASIC_NAMES.has(k)) return null;
  const tl = m ? String(m.tl || '') : 'Basic Land', land = /\bLand\b/.test(tl.split(' // ')[0]);
  return { name: k, ci: m ? m.ci || '' : '', cmc: m ? m.cm || 0 : 0, ty: land ? 1 : 0, roles: land ? DW_RB.land : 0, eur: m ? m.eu : 0, fl: 0, prod: '', rank: 0 };
}
const DW_BASIC_C = { plains: 'W', island: 'U', swamp: 'B', mountain: 'R', forest: 'G', wastes: 'C' };
const dwBasicColor = k => DW_BASIC_C[String(k).replace(/^snow covered /, '')] || '';

/* ── Réglages du deck (thèmes, bracket, budget) : gardés sur l'appareil par deck ───────────────────── */
const DW_SET = 'deckdeal:dw:';
const dwDefaults = () => ({ th: [], br: 3, bud: 0, own: true });
function dwSettingsFor(id) {
  if (!id) return dwDefaults();
  try { const o = JSON.parse(localStorage.getItem(DW_SET + id) || 'null'); if (o && typeof o === 'object') return { ...dwDefaults(), ...o, th: Array.isArray(o.th) ? o.th.slice(0, 3) : [] }; } catch (e) { /* stockage refusé */ }
  return dwDefaults();
}
function dwPersist(id) { if (!id || !BD.wiz) return; try { localStorage.setItem(DW_SET + id, JSON.stringify(BD.wiz)); } catch (e) { /* stockage refusé : pour cette session */ } }
/** Deck enregistré (builder.js › bdSave) : ses réglages du coach suivent son identifiant. */
function dwSaved(id) { if (dwOn() && BD.wiz) dwPersist(id); }

/* ── Commandant du deck ────────────────────────────────────────────────────────────────────────────── */
/** Commandant(s) du deck dans les données EDHREC de l'appli : { slug, names, ci, th } ou un repli d'après le nom. */
function dwCmdOf() {
  if (!BD.cmdr.length) return null;
  const keys = BD.cmdr.map(c => c.key), E = typeof EDH !== 'undefined' && EDH.data;
  if (E) {
    const hit = keys.length > 1 ? E.cmds.find(c => c.keys.length === keys.length && keys.every(k => c.keys.includes(k))) : E.by.get(keys[0]);
    if (hit) return { slug: hit.slug, names: hit.names, ci: hit.ci, th: (hit.th || []).map(([i, n]) => [E.themes[i] ? E.themes[i].slug : '', E.themes[i] ? E.themes[i].label : '', n]).filter(t => t[0]) };
  }
  const ci = [...new Set(keys.flatMap(k => [...((dwCard(k) || {}).ci || ((dmOf(k) || {}).ci) || '')]))].sort((a, b) => 'WUBRG'.indexOf(a) - 'WUBRG'.indexOf(b)).join('');
  return { slug: keys.map(k => k.replace(/ /g, '-')).join('-'), names: BD.cmdr.map(c => c.name), ci, th: [] };
}

/* ── Profil du deck ───────────────────────────────────────────────────────────────────────────────── */
/** Nombre de symboles de chaque couleur dans un coût (« {2}{G}{G} » → G:2 ; hybride : chaque couleur compte pour moitié ; Phyrexian : compte). */
function dwPips(mc) {
  const out = {}; for (const m of String(mc || '').matchAll(/\{([^}]+)\}/g)) {
    const s = m[1].toUpperCase().replace(/\/P$/, ''), cs = s.split('/').filter(x => 'WUBRG'.includes(x));
    for (const c of cs) out[c] = (out[c] || 0) + 1 / cs.length;
  }
  return out;
}
/** Profil du deck en cours : comptes par rôle, courbe, coût moyen, rampe/pioche pas chère, sources et symboles par couleur, Game Changers, prix. */
function dwProfile() {
  const p = { n: 0, nonland: 0, mv: 0, cheap: 0, curve: [0, 0, 0, 0, 0, 0, 0, 0], src: {}, pips: {}, maxPip: {}, gc: [], xt: [], mld: [], cents: 0, buy: 0, unk: 0, cards: 0 };
  for (const r of DKW_ROLES) p[r] = 0;
  let mvSum = 0; const all = [...BD.main.values()];
  for (const c of all) {
    const k = c.key, q = c.qty, x = dwCard(k); p.n += q; p.cards++;
    if (!x) { p.unk += q; continue; }
    const land = !!(x.roles & DW_RB.land) || BASIC_NAMES.has(k);
    for (const r of DKW_ROLES) if (r === 'land' ? land : x.roles & DW_RB[r]) p[r] += q;
    if (land) { const bc = dwBasicColor(k), pr = bc ? bc : x.prod; for (const col of new Set([...String(pr)].filter(ch => 'WUBRG'.includes(ch)))) p.src[col] = (p.src[col] || 0) + q; }
    else {
      p.nonland += q; mvSum += (x.cmc || 0) * q; p.curve[Math.min(7, Math.floor(x.cmc || 0))] += q;
      if ((x.roles & (DW_RB.ramp | DW_RB.draw)) && (x.cmc || 0) <= 2) p.cheap += q;
      const m = dmOf(k), pips = dwPips(m && m.mc);
      for (const [col, n] of Object.entries(pips)) { p.pips[col] = (p.pips[col] || 0) + n * q; p.maxPip[col] = Math.max(p.maxPip[col] || 0, Math.ceil(n)); }
      if ((x.roles & DW_RB.ramp) && x.prod) for (const col of new Set([...x.prod].filter(ch => 'WUBRG'.includes(ch)))) p.src[col] = (p.src[col] || 0) + q * 0.5;      // rampe qui produit la couleur : demi-source (dork, rock ; recherche : Karsten)
    }
    if (x.fl & 1) p.gc.push(x.name); if (x.fl & 2) p.xt.push(x.name); if (x.fl & 4) p.mld.push(x.name);
    if (!BASIC_NAMES.has(k)) { const e = dwPrice(k, x); if (e > 0) { p.cents += e * q; const own = collQty(k); if (own < q) p.buy += e * (q - own); } }
  }
  for (const c of BD.cmdr) { const x = dwCard(c.key); p.n++; if (x && x.fl & 1) p.gc.push(x.name); const e = dwPrice(c.key, x); if (e > 0) { p.cents += e; if (collQty(c.key) < 1) p.buy += e; } }
  p.mv = p.nonland ? mvSum / p.nonland : 0;
  return p;
}
/** Prix d'une carte : celui de l'appli (marché choisi) s'il est connu, sinon celui de la base (euros, marché européen seulement). */
function dwPrice(k, x) { const m = dmOf(k); if (m && Number.isFinite(m.eu) && m.eu > 0) return m.eu; return !mkUs() && x && x.eur > 0 ? x.eur : 0; }

/* ── Cibles ───────────────────────────────────────────────────────────────────────────────────────── */
/** Terrains conseillés (Frank Karsten, 2022 : régression sur des decks de tournoi, transposée à 99 cartes) : 31,42 + 3,13 × coût moyen − 0,28 × rampe et pioche de coût ≤ 2. */
const dwKarsten = (mv, cheap) => 31.42 + 3.13 * mv - 0.28 * cheap;
/** Cibles [bas, cible, haut] par rôle : statistiques du commandant (≥ 8 decks), des thèmes choisis, du bracket et de tous les decks, pondérées ; sinon le modèle de base. */
function dwTargets(prof, cmd, pack) {
  const tg = DW.core && DW.core.tg, w = [], set = BD.wiz || dwDefaults();
  if (tg) {
    if (pack && pack.tg && pack.tg.n >= 8) w.push([pack.tg, 3]);
    for (const t of set.th) if (tg.th && tg.th[t]) w.push([tg.th[t], 1.5]);
    if (tg.br && tg.br[set.br]) w.push([tg.br[set.br], 1.5]);
    if (cmd && tg.nc && tg.nc[cmd.ci.length]) w.push([tg.nc[cmd.ci.length], 0.7]);
    w.push([tg.recent && tg.recent.n >= 50 ? tg.recent : tg.all, 1]);
  }
  const out = {};
  for (const k of Object.keys(DW_BASE)) {
    const adj = (DW_BR_ADJ[set.br] || {})[k], base = adj || DW_BASE[k];
    const src = w.filter(([s]) => Array.isArray(s[k]));
    if (!src.length || (adj && !(tg && tg.br && tg.br[set.br]))) { out[k] = base.slice(); continue; }
    const tot = src.reduce((a, [, x]) => a + x, 0);
    out[k] = [0, 1, 2].map(i => src.reduce((a, [s, x]) => a + s[k][i] * x, 0) / tot);
  }
  // terrains : Karsten sur le deck en cours (assez avancé), sinon sur les cibles ; bornés par ce que jouent les decks semblables
  const mv = prof.nonland >= 25 ? prof.mv : out.mv[1], cheap = prof.nonland >= 25 ? prof.cheap : out.cheap[1];
  let L = dwKarsten(mv, cheap); if (set.br === 5) L -= 3;      // cEDH : courbe très basse et beaucoup de rampe à 0-1 mana, la formule casual surestime
  const lo = Math.min(out.land[0], 33), hi = Math.max(out.land[2], 40); L = Math.max(lo, Math.min(hi, L));
  out.land = [Math.round(L) - 1, Math.round(L), Math.round(L) + 1];
  if (cmd && !cmd.ci.includes('U')) out.counter = [0, 0, 0];
  for (const k of Object.keys(out)) if (k !== 'mv') out[k] = out[k].map(v => Math.round(v));
  return out;
}
/** Sources de couleur conseillées (Karsten, Commander 99 cartes, ~90 % de pouvoir lancer le sort à temps) d'après le symbole le plus exigeant de chaque couleur. */
const DW_SRC_NEED = { 1: 15, 2: 20, 3: 24 };
const dwSrcNeed = maxPip => DW_SRC_NEED[Math.min(3, Math.max(1, maxPip || 1))];

/* ── Suggestions ──────────────────────────────────────────────────────────────────────────────────── */
/** Cartes candidates pour le commandant (EDHREC, thèmes choisis, corpus), notées ; role : rôle voulu ('' : plan / synergie ; 'land' : terrains). */
function dwSuggest(role, cmd, pack, prof, tgt, n) {
  if (!DW.byKey) return [];
  const set = BD.wiz || dwDefaults(), ci = new Set([...(cmd ? cmd.ci : '')]), inDeck = k => BD.main.has(k) || BD.cmdr.some(c => c.key === k);
  const brMax = (DW_BRACKETS.find(b => b[0] === set.br) || DW_BRACKETS[2])[3], gcLeft = brMax - prof.gc.length;
  const budLeft = set.bud > 0 ? set.bud - prof.cents : Infinity, slots = Math.max(1, 99 - (prof.n - BD.cmdr.length));
  const C = new Map(), add = (name, f, v) => { const k = ownKey(name); if (!k) return; const o = C.get(k) || { name, incl: 0, syn: 0, th: 0, g: 0, cx: 0 }; o[f] = Math.max(o[f], v); C.set(k, o); };
  if (pack) {
    for (const [nm, inc, syn] of pack.cards || []) { add(nm, 'incl', inc); add(nm, 'syn', syn); }
    for (const t of set.th) { const tp = pack.th && pack.th[t]; if (tp) for (const [nm, inc] of tp.cards || []) add(nm, 'th', inc); }
    for (const [nm, inc] of pack.xc || []) add(nm, 'cx', inc);
  }
  for (const t of set.th) { const tp = DW.th.get(t); if (tp) for (const [nm, inc] of tp.cards || []) add(nm, 'g', inc); }
  const fallback = C.size < 40;      // commandant inconnu de la base : les cartes les plus jouées en Commander dans ses couleurs (rang EDHREC)
  const out = [];
  const consider = (k, o) => {
    if (inDeck(k) || BASIC_NAMES.has(k)) return;
    const x = dwCard(k); if (!x || !DW.byKey.has(k)) return;
    if ([...String(x.ci)].some(c => !ci.has(c))) return;
    const isLand = !!(x.roles & DW_RB.land);
    if (role === 'land' ? !isLand : role ? !(x.roles & DW_RB[role]) : isLand) return;
    if (x.fl & 1 && gcLeft <= 0) return;
    if (x.fl & 4 && set.br <= 3) return;
    if (x.fl & 2 && set.br <= 2) return;
    const price = dwPrice(k, x), own = collQty(k) > 0;
    if (!own && price > 0 && price > budLeft) return;
    let s = (o.incl || 0) / 100 + Math.max(0, o.syn || 0) / 100 * 0.8 + (o.th || 0) / 100 * 0.9 + (o.g || 0) / 100 * 0.4 + (o.cx || 0) / 100 * 0.5;
    if (o.rank) s += Math.max(0, 1 - o.rank / 4000) * 0.5;
    if (own) s += set.own ? 0.35 : 0.08;
    if (!own && set.bud > 0 && price > 0 && Number.isFinite(budLeft)) s -= Math.min(0.4, price / Math.max(100, budLeft / slots * 4) * 0.2);
    out.push({ k, name: x.name, s, o, own, price, gc: !!(x.fl & 1), x });
  };
  for (const [k, o] of C) consider(k, o);
  if (fallback) for (const [k, r] of DW.byKey) if (!C.has(k) && r[8] > 0 && r[8] < 6000) consider(k, { rank: r[8] });
  out.sort((a, b) => b.s - a.s || (a.name < b.name ? -1 : 1));
  return out.slice(0, n);
}
/** Raison d'une suggestion : ce qui la fait remonter. */
function dwWhy(sg, cmd) {
  const o = sg.o, w = [];
  if (o.incl >= 5 && cmd) w.push(T('{p} % des decks de {name}', { p: o.incl, name: cmd.names[0].split(',')[0] }));
  if (o.syn >= 15) w.push(T('synergie +{p} %', { p: o.syn }));
  if (o.th >= 10) w.push(T('thème choisi'));
  else if (o.g >= 10) w.push(T('carte du thème'));
  if (o.cx >= 25) w.push(T('decks Archidekt les plus vus'));
  if (o.rank && !o.incl) w.push(T('très jouée en Commander'));
  if (sg.gc) w.push('Game Changer');
  return w.slice(0, 3).join(' · ');
}

/* ── Onglet Coach ─────────────────────────────────────────────────────────────────────────────────── */
function dwCoachHtml() {
  if (BD.fmt !== 'commander') return `<p class="hint">${T('Le coach est réservé aux decks Commander pour le moment.')}</p>`;
  if (!BD.wiz) BD.wiz = dwSettingsFor(BD.id);
  if (!DW.core && !DW.p && !DW.err) dwLoad().catch(() => {});
  if (typeof edhEnsure === 'function') edhEnsure();
  const cmd = dwCmdOf();
  if (!cmd) return `<div class="dw-empty"><p class="hint">${T('Choisis d\'abord ton commandant : le coach s\'appuie sur les decks qui le jouent.')}</p><button class="btn small" type="button" data-act="pick-cmdr">${T('Choisir un commandant')}</button></div>`;
  const pack = DW.core ? (DW.cmd.has(cmd.slug) ? DW.cmd.get(cmd.slug) : (dwPack('c', cmd.slug), null)) : null;
  for (const t of (BD.wiz || {}).th || []) if (DW.core && !DW.th.has(t)) dwPack('t', t);
  const prof = dwProfile(), tgt = dwTargets(prof, cmd, pack);
  let h = '';
  if (DW.p && !DW.core) h += `<div class="status" data-ok="0"><span class="dot"></span><span>${T('Chargement de la base du coach…')}</span></div>`;
  else if (DW.err) h += `<div class="status" data-ok="0"><span class="dot"></span><span>${esc(DW.err)}</span></div>`;
  h += dwSetHtml(cmd, pack);
  h += `<div class="sec-title">${T('Équilibre du deck')}</div><div class="dw-gauges">${dwGaugesHtml(prof, tgt, cmd, pack)}</div>`;
  h += dwManaHtml(prof, tgt, cmd);
  h += dwBracketHtml(prof);
  h += dwBudgetHtml(prof);
  if (DW.core) h += dwPlanHtml(cmd, pack, prof, tgt);
  const src = DW.core && DW.core.src && DW.core.src.decks ? T('Cibles calculées sur {n} decks réels (Archidekt, EDHREC) et la formule des terrains de Frank Karsten.', { n: nf0(DW.core.src.decks) }) : T('Cibles du modèle de base (Command Zone, Frank Karsten, EDHREC).');
  h += `<p class="hint dw-src">${esc(src)}</p>`;
  return h;
}
function dwSetHtml(cmd, pack) {
  const s = BD.wiz, th = dwThemeChoices(cmd, pack), cur = mkCur();
  const brName = (DW_BRACKETS.find(b => b[0] === s.br) || DW_BRACKETS[2])[1];
  const sum = [s.th.length ? s.th.map(t => dwThemeLabel(t, th)).join(', ') : T('aucun thème'), T('bracket {n}', { n: s.br }) + ' · ' + brName, s.bud > 0 ? T('budget {p}', { p: fmt(s.bud, cur) }) : T('sans budget')].join(' · ');
  let h = `<button class="dw-set-h" type="button" data-act="dw-set" aria-expanded="${DW.setOpen}"><span><b>${T('Réglages du coach')}</b><small>${esc(sum)}</small></span><span class="me-v">${DW.setOpen ? '−' : '+'}</span></button>`;
  if (!DW.setOpen) return h;
  h += `<div class="dw-set"><p class="label">${T('Thèmes (3 au plus)')}</p><div class="dw-chips">${th.length ? th.map(([slug, label]) => `<button type="button" class="chip${s.th.includes(slug) ? ' on' : ''}" data-act="dw-th" data-v="${esc(slug)}" aria-pressed="${s.th.includes(slug)}">${esc(label)}</button>`).join('') : `<span class="hint">${T('Thèmes pas encore chargés.')}</span>`}</div>
    <p class="label">${T('Bracket')}</p><div class="dw-chips">${DW_BRACKETS.map(b => `<button type="button" class="chip${s.br === b[0] ? ' on' : ''}" data-act="dw-br" data-v="${b[0]}" aria-pressed="${s.br === b[0]}">${b[0]} · ${esc(b[1])}</button>`).join('')}</div>
    <p class="hint">${esc(T((DW_BRACKETS.find(b => b[0] === s.br) || DW_BRACKETS[2])[2]))}</p>
    <div class="field-in"><label class="label" for="dwBud">${T('Budget du deck ({c})', { c: cur })}</label><input type="number" id="dwBud" inputmode="decimal" min="0" step="10" placeholder="${T('Sans limite')}" value="${s.bud > 0 ? Math.round(s.bud / 100) : ''}"></div>
    <label class="me-row switch-row" for="dwOwn"><span class="me-t">${T('Priorité à ma collection')}<small>${T('Les cartes que tu possèdes passent devant dans les suggestions')}</small></span><span class="switch"><input type="checkbox" id="dwOwn" ${s.own ? 'checked' : ''}><i></i></span></label></div>`;
  return h;
}
/** Thèmes proposés : ceux du commandant (EDHREC, du plus au moins joué), puis les thèmes généraux de la base. → [[slug, libellé]] */
function dwThemeChoices(cmd, pack) {
  const out = new Map();
  for (const t of (pack && pack.thl) || []) if (t[0]) out.set(t[0], t[1]);
  for (const t of (cmd && cmd.th) || []) if (t[0] && !out.has(t[0])) out.set(t[0], t[1]);
  for (const t of (BD.wiz && BD.wiz.th) || []) if (!out.has(t)) out.set(t, t);
  return [...out].slice(0, 14).map(([s, l]) => [s, typeof edhThemeName === 'function' ? edhThemeName({ label: l }) : l]);
}
const dwThemeLabel = (slug, list) => { const f = list.find(t => t[0] === slug); return f ? f[1] : slug; };
function dwGaugesHtml(prof, tgt, cmd, pack) {
  return DW_GAUGES.filter(([r]) => r !== 'counter' || (cmd && cmd.ci.includes('U'))).map(([r, label, help]) => {
    const n = prof[r], [lo, mid, hi] = tgt[r], st = n < lo ? (n < lo - 3 ? 'bad' : 'low') : n > hi + (r === 'land' ? 0 : 3) ? 'high' : 'ok';
    const max = Math.max(hi + 2, n, 1), pct = v => Math.max(0, Math.min(100, v / max * 100));
    const open = DW.open === r, miss = Math.max(0, mid - n);
    const lbl = st === 'ok' ? T('ok') : st === 'high' ? T('beaucoup') : TN(miss, 'il en manque {n}', 'il en manque {n}');
    let h = `<div class="dw-g ${st}${open ? ' open' : ''}"><button type="button" class="dw-gh" data-act="dw-g" data-r="${r}" aria-expanded="${open}" title="${esc(T(help))}">
      <span class="dw-gl"><b>${T(label)}</b><small>${esc(lbl)}</small></span><span class="dw-gn"><b>${nf0(n)}</b> / ${mid}</span>
      <span class="dw-bar" aria-hidden="true"><i class="dw-rng" style="left:${pct(lo)}%;width:${Math.max(2, pct(hi) - pct(lo))}%"></i><i class="dw-val" style="width:${pct(n)}%"></i></span></button>`;
    if (open) h += `<div class="dw-gb"><p class="hint">${esc(T(help))} ${esc(T('Repère : {lo} à {hi}.', { lo, hi }))}</p>${r === 'land' ? dwLandHelp(prof, tgt, cmd) : ''}${dwSugHtml(r, cmd, pack, prof, tgt)}</div>`;
    return h + '</div>';
  }).join('');
}
function dwLandHelp(prof, tgt, cmd) {
  const basics = [...BD.main.values()].filter(c => BASIC_NAMES.has(c.key)).reduce((a, c) => a + c.qty, 0);
  const txt = prof.nonland >= 25 ? T('Coût moyen {mv}, {c} sorts de rampe ou de pioche à 2 mana ou moins : {n} terrains conseillés.', { mv: prof.mv.toFixed(2), c: prof.cheap, n: tgt.land[1] }) : T('Ajoute d\'abord tes sorts : la cible des terrains suivra le coût moyen du deck.');
  return `<p class="hint">${esc(txt)}</p>${cmd && cmd.ci ? `<button class="btn ghost small" type="button" data-act="dw-basics">${T('Compléter avec des terrains de base')}</button>` : ''}${basics ? `<p class="hint">${TN(basics, '{n} terrain de base dans le deck.', '{n} terrains de base dans le deck.')}</p>` : ''}`;
}
function dwSugHtml(role, cmd, pack, prof, tgt) {
  if (!DW.core) return '';
  if (!pack && DW.cmdP.has(cmd.slug)) return `<p class="hint">${T('Chargement des cartes conseillées…')}</p>`;
  const list = dwSuggest(role, cmd, pack, prof, tgt, DW.shown);
  if (!list.length) return `<p class="hint">${T('Aucune suggestion dans tes couleurs, ton bracket et ton budget.')}</p>`;
  BD.want = list.map(s => ({ key: s.k, name: s.name })); bdMetaSoon();
  return `<div class="dw-sug">${list.map(s => dwSugRow(s, cmd)).join('')}</div>${list.length >= DW.shown ? `<button class="link-btn" type="button" data-act="dw-more">${T('Plus de suggestions')}</button>` : ''}`;
}
function dwSugRow(s, cmd) {
  const k = s.k, m = bdMeta(k), x = COLL.map[k], nm = bdLabel(k, s.name), hue = hash32(k) % 360, img = m && m.im ? collImage(k, x ? x.l : '', m.im).src : '';
  const why = dwWhy(s, cmd), price = s.price > 0 ? fmt(s.price, mkCur()) : '';
  return `<div class="crow bd-row dw-row" data-k="${esc(k)}" data-n="${esc(s.name)}" data-t="main"><span class="thumb" style="--h:${hue}"${zoomAt('bd', nm)}>${esc((nm.trim()[0] || '?').toUpperCase())}${img ? `<img alt="" loading="lazy" decoding="async" src="${esc(img)}">` : ''}</span>
    <span class="row-main"><span class="row-top"><span class="row-name">${esc(nm)}</span>${price ? `<span class="dw-px">${esc(price)}</span>` : ''}</span><span class="row-meta">${bdTags(k, 0, 'coll')}</span>${why ? `<span class="dw-why">${esc(why)}</span>` : ''}</span>
    <span class="qstep dw-add"><button type="button" data-d="1" aria-label="${T('Ajouter {name} au deck', { name: esc(nm) })}">+</button></span></div>`;
}
function dwManaHtml(prof, tgt, cmd) {
  const cols = [...(cmd ? cmd.ci : '')]; let h = `<div class="sec-title">${T('Mana')}</div><div class="dw-mana">`;
  const avg = prof.nonland ? prof.mv.toFixed(2) : '—';
  h += `<p class="dw-line"><span>${T('Coût moyen (hors terrains)')}</span><b>${avg}</b><small>${T('repère {v}', { v: Number(tgt.mv[1]).toFixed(1) })}</small></p>`;
  const mx = Math.max(1, ...prof.curve);
  h += `<div class="dw-curve" role="img" aria-label="${esc(T('Courbe de mana'))}">${prof.curve.map((n, i) => `<span><i style="height:${Math.round(n / mx * 100)}%"></i><b>${n}</b><small>${i === 7 ? '7+' : i}</small></span>`).join('')}</div>`;
  if (cols.length) {
    h += `<p class="label">${T('Sources de chaque couleur')}</p><div class="dw-src">`;
    for (const c of cols) {
      const need = prof.pips[c] ? dwSrcNeed(prof.maxPip[c]) : 0, have = Math.round((prof.src[c] || 0) * 10) / 10, ok = !need || have >= need;
      h += `<span class="dw-sc ${ok ? 'ok' : 'low'}"><i class="pip ${c}" aria-hidden="true"></i><b>${nf0(have)}</b>${need ? `<small>/ ${need}</small>` : ''}</span>`;
    }
    h += `</div><p class="hint">${T('Terrains et rampe qui produisent la couleur (rampe : une demi-source). Repère de Frank Karsten d\'après le symbole le plus exigeant : 15 sources pour {C}, 20 pour {C}{C}, 24 pour {C}{C}{C}.')}</p>`;
  }
  return h + '</div>';
}
function dwBracketHtml(prof) {
  const s = BD.wiz, b = DW_BRACKETS.find(x => x[0] === s.br) || DW_BRACKETS[2], out = [];
  if (prof.gc.length > b[3]) out.push(['bad', b[3] ? T('{n} Game Changers pour {max} permis en bracket {b} : {list}', { n: prof.gc.length, max: b[3], b: b[0], list: prof.gc.join(', ') }) : T('Game Changers interdits en bracket {b} : {list}', { b: b[0], list: prof.gc.join(', ') })]);
  if (prof.mld.length && s.br <= 3) out.push(['bad', T('Destruction massive de terrains interdite en bracket {b} : {list}', { b: b[0], list: prof.mld.join(', ') })]);
  if (prof.xt.length && s.br <= 3) out.push(['warn', T('Tours supplémentaires : à ne pas enchaîner en bracket {b} ({list})', { b: b[0], list: prof.xt.join(', ') })]);
  if (s.br <= 2 && prof.tutor > 3) out.push(['warn', T('{n} tuteurs : beaucoup pour un bracket {b}', { n: prof.tutor, b: b[0] })]);
  if (s.br <= 3) out.push(['info', T('Les combos à 2 cartes ne sont pas vérifiés : à surveiller toi-même.')]);
  return `<div class="sec-title">${T('Bracket {n} · {name}', { n: b[0], name: b[1] })}</div><ul class="bd-issues dw-br">${out.length ? out.map(([lv, t]) => `<li class="${lv === 'info' ? '' : lv}">${esc(t)}</li>`).join('') : ''}<li class="ok">${esc(b[3] > 10 ? TN(prof.gc.length, '{n} Game Changer, sans limite dans ce bracket', '{n} Game Changers, sans limite dans ce bracket') : TN(prof.gc.length, '{n} Game Changer sur {max} permis', '{n} Game Changers sur {max} permis', { max: b[3] }))}</li></ul>`;
}
function dwBudgetHtml(prof) {
  const s = BD.wiz, cur = mkCur(); if (!(s.bud > 0) && !prof.cents) return '';
  const pct = s.bud > 0 ? Math.min(100, Math.round(prof.cents / s.bud * 100)) : 0, over = s.bud > 0 && prof.cents > s.bud;
  return `<div class="sec-title">${T('Budget')}</div><div class="dw-bud${over ? ' over' : ''}"><p class="dw-line"><span>${T('Valeur du deck')}</span><b>${esc(fmt(prof.cents, cur))}</b>${s.bud > 0 ? `<small>/ ${esc(fmt(s.bud, cur))}</small>` : ''}</p>
    ${s.bud > 0 ? `<span class="dw-bar"><i class="dw-val" style="width:${pct}%"></i></span>` : ''}<p class="hint">${esc(T('Dont {p} à acheter (cartes que ta collection n\'a pas).', { p: fmt(prof.buy, cur) }))}${over ? ' ' + esc(T('Au-dessus du budget : les suggestions ne proposent plus que des cartes que tu possèdes.')) : ''}</p></div>`;
}
function dwPlanHtml(cmd, pack, prof, tgt) {
  const open = DW.open === 'plan';
  let h = `<div class="sec-title">${T('Plan de jeu et synergies')}</div><div class="dw-g${open ? ' open' : ''}"><button type="button" class="dw-gh" data-act="dw-g" data-r="plan" aria-expanded="${open}"><span class="dw-gl"><b>${T('Cartes clés du commandant')}</b><small>${esc(T('les plus jouées et les plus en synergie avec lui'))}</small></span><span class="me-v">${open ? '−' : '+'}</span></button>`;
  if (open) h += `<div class="dw-gb">${dwSugHtml('', cmd, pack, prof, tgt)}</div>`;
  return h + '</div>';
}
/** Terrains de base pour atteindre la cible : répartis selon les symboles de mana des sorts (au moins un par couleur utilisée). */
function dwFillBasics() {
  const cmd = dwCmdOf(); if (!cmd || !cmd.ci) return;
  const prof = dwProfile(), tgt = dwTargets(prof, cmd, DW.cmd.get(cmd.slug) || null);
  const BK = { W: 'plains', U: 'island', B: 'swamp', R: 'mountain', G: 'forest' }, EN = { W: 'Plains', U: 'Island', B: 'Swamp', R: 'Mountain', G: 'Forest' };
  const cols = [...cmd.ci], curB = cols.reduce((a, c) => a + ((BD.main.get(BK[c]) || {}).qty || 0), 0);
  const want = Math.max(0, tgt.land[1] - (prof.land - curB)), room = 99 - (prof.n - BD.cmdr.length - curB), n = Math.max(0, Math.min(want, room));
  const w = cols.map(c => Math.max(prof.pips[c] || 0, 0.5)), tot = w.reduce((a, b) => a + b, 0);
  const share = cols.map((c, i) => Math.floor(n * w[i] / tot)); let rest = n - share.reduce((a, b) => a + b, 0);
  for (let i = 0; rest > 0; i = (i + 1) % cols.length, rest--) share[i]++;
  cols.forEach((c, i) => { if (share[i] > 0) BD.main.set(BK[c], { key: BK[c], name: EN[c], qty: share[i] }); else BD.main.delete(BK[c]); });
  BD.dirty = true; haptic('ok'); bdPaint(); bdMetaSoon();
  toast(TN(n, '{n} terrain de base dans le deck', '{n} terrains de base dans le deck'));
}
/** Clics de l'onglet Coach (bdClick de builder.js les lui passe) : vrai si l'action était la sienne. */
function dwClick(b) {
  const act = b.dataset.act; if (!/^dw-/.test(act)) return false;
  const s = BD.wiz || (BD.wiz = dwSettingsFor(BD.id));
  if (act === 'dw-g') { DW.open = DW.open === b.dataset.r ? '' : b.dataset.r; DW.shown = 8; haptic('tap'); bdList(); }
  else if (act === 'dw-more') { DW.shown += 8; bdList(); }
  else if (act === 'dw-set') { DW.setOpen = !DW.setOpen; haptic('tap'); bdList(); }
  else if (act === 'dw-th') { const v = b.dataset.v, i = s.th.indexOf(v); if (i >= 0) s.th.splice(i, 1); else if (s.th.length < 3) { s.th.push(v); dwPack('t', v); } else { toast(T('3 thèmes au plus')); return true; } haptic('tap'); dwPersist(BD.id); bdList(); }
  else if (act === 'dw-br') { s.br = Number(b.dataset.v) || 3; haptic('tap'); dwPersist(BD.id); bdList(); }
  else if (act === 'dw-basics') dwFillBasics();
  return true;
}
if (typeof document !== 'undefined') document.addEventListener('change', e => {
  const t = e.target; if (!BD.el || !t || !BD.wiz) return;
  if (t.id === 'dwBud') { const v = Math.max(0, Math.round(Number(String(t.value).replace(',', '.')) || 0)); BD.wiz.bud = v * 100; dwPersist(BD.id); bdList(); }
  else if (t.id === 'dwOwn') { BD.wiz.own = t.checked; dwPersist(BD.id); bdList(); }
});

/* ── Nouveau deck : « J'ai déjà ce deck » ou « Deck à construire » ─────────────────────────────────── */
function openDeckStart(name, fmt) {
  openSheet(T('Nouveau deck'), fmt === 'commander' ? 'Commander' : T('Standard'), api => {
    const opt = (v, t, h) => `<button type="button" class="bd-sc-opt dw-start" data-v="${v}"><b>${t}</b><small>${h}</small></button>`;
    api.body.innerHTML = `<div class="bd-sc-opts">${opt('have', T('J\'ai déjà ce deck'), T('Il existe en vrai : scanne-le, colle sa liste ou ajoute ses cartes à la main.'))}
      ${opt('build', T('Deck à construire'), fmt === 'commander' ? T('Tu prévois de le monter : l\'assistant t\'aide (commandant, thèmes, bracket, budget) et le coach équilibre le deck.') : T('Tu prévois de le monter : ajoute les cartes depuis ta collection ou la recherche.'))}</div>`;
    api.body.addEventListener('click', e => {
      const b = e.target.closest('.dw-start'); if (!b) return; haptic('tap'); api.close();
      setTimeout(() => { if (b.dataset.v === 'have') openDeckHave(name, fmt); else if (fmt === 'commander') openDeckWiz(name); else openBuilder({ name, fmt }); }, 200);
    });
  });
}
function openDeckHave(name, fmt) {
  openSheet(T('J\'ai déjà ce deck'), name || null, api => {
    const opt = (v, t, h) => `<button type="button" class="bd-sc-opt dw-start" data-v="${v}"><b>${t}</b><small>${h}</small></button>`;
    api.body.innerHTML = `<div class="bd-sc-opts">${opt('scan', T('Scanner le deck'), T('Tes cartes déjà dans ta collection sont réservées pour ce deck, les autres y sont ajoutées : rien en double.'))}
      ${opt('paste', T('Coller la liste'), T('Depuis Moxfield, Archidekt, MTGA… une carte par ligne.'))}
      ${opt('hand', T('À la main'), T('Choisis les cartes dans ta collection ou dans la recherche.'))}</div>`;
    api.body.addEventListener('click', e => {
      const b = e.target.closest('.dw-start'); if (!b) return; haptic('tap'); api.close();
      setTimeout(() => {
        if (b.dataset.v === 'paste') return openDeckPaste(name, fmt);
        openBuilder({ name, fmt });
        if (b.dataset.v === 'scan') setTimeout(() => { if (BD.el) bdScan('main'); }, 450);
      }, 200);
    });
  });
}
function openDeckPaste(name, fmt) {
  openSheet(T('Coller la liste'), name || null, api => {
    api.body.innerHTML = `<div class="field-in"><label class="label" for="dwPaste">${T('Liste du deck')}</label><textarea id="dwPaste" rows="10" autocomplete="off" spellcheck="false" placeholder="${esc('Commander\n1 Atraxa, Praetors\' Voice\n\nDeck\n1 Sol Ring\n1 Arcane Signet\n…')}"></textarea></div>
      <p class="hint">${T('Une section « Commander » (ou « Commandant ») désigne le commandant ; sinon choisis-le ensuite dans l\'éditeur.')}</p>`;
    api.setFoot(`<button class="btn ghost" type="button" data-close>${T('Annuler')}</button><button class="btn" type="button" id="dwPasteGo">${T('Ouvrir dans l\'éditeur')}</button>`);
    $('#dwPasteGo', api.foot).onclick = () => {
      const text = $('#dwPaste', api.body).value; if (!text.trim()) { toast(T('Colle d\'abord la liste')); return; }
      api.close(); setTimeout(() => openBuilder({ name, fmt, text }), 200);
    };
    setTimeout(() => { const t = $('#dwPaste', api.body); if (t) t.focus(); }, 380);
  });
}

/* ── Assistant « Deck à construire » (Commander) ──────────────────────────────────────────────────── */
const DWZ = { q: '', cmd: null, th: [], br: 3, bud: 0, own: true, name: '', cols: new Set(), pickTh: [] };
function openDeckWiz(name) {
  Object.assign(DWZ, { q: '', cmd: null, th: [], br: 3, bud: 0, own: true, name: name || '', cols: new Set(), pickTh: [] });
  if (typeof edhLoad === 'function') edhLoad().catch(() => {});
  dwLoad().catch(() => {});
  openSheet(T('Ton commandant'), T('Assistant de deck · étape 1 sur 2'), api => {
    api.wrap.classList.add('dw-wiz');
    const paint = () => {
      const E = typeof EDH !== 'undefined' && EDH.data, list = dwzCmds(E);
      api.body.innerHTML = `<div class="field-in"><label class="label" for="dwzQ">${T('Chercher un commandant')}</label><input type="search" id="dwzQ" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="Atraxa, Edgar Markov…" value="${esc(DWZ.q)}"></div>
        <p class="label">${T('Ou d\'après un style de jeu')}</p><div class="dw-chips">${dwzThemeChips(E)}</div>
        <div class="dw-chips dw-cols">${[...'WUBRG'].map(c => `<button type="button" class="chip${DWZ.cols.has(c) ? ' on' : ''}" data-c="${c}" aria-pressed="${DWZ.cols.has(c)}"><i class="pip ${c}" aria-hidden="true"></i></button>`).join('')}</div>
        <div class="dw-cmds">${!E ? `<p class="hint">${EDH.err ? esc(EDH.err) : T('Chargement des commandants…')}</p>` : list.length ? list.map(dwzCmdRow).join('') : `<p class="hint">${T('Aucun commandant ne correspond.')}</p>`}</div>`;
      const q = $('#dwzQ', api.body); q.oninput = () => { DWZ.q = q.value; const pos = q.selectionStart; paintList(); try { q.setSelectionRange(pos, pos); } catch (e) { /* ignore */ } };
    };
    const paintList = () => { const E = typeof EDH !== 'undefined' && EDH.data, box = $('.dw-cmds', api.body); if (box && E) { const l = dwzCmds(E); box.innerHTML = l.length ? l.map(dwzCmdRow).join('') : `<p class="hint">${T('Aucun commandant ne correspond.')}</p>`; } };
    api.body.addEventListener('click', e => {
      const t = e.target.closest('[data-pt]'); if (t) { const v = t.dataset.pt, i = DWZ.pickTh.indexOf(v); if (i >= 0) DWZ.pickTh.splice(i, 1); else DWZ.pickTh.push(v); haptic('tap'); paint(); return; }
      const c = e.target.closest('[data-c]'); if (c) { const v = c.dataset.c; if (DWZ.cols.has(v)) DWZ.cols.delete(v); else DWZ.cols.add(v); haptic('tap'); paint(); return; }
      const r = e.target.closest('[data-slug]'); if (!r) return;
      const E = EDH.data, cm = E && E.bySlug.get(r.dataset.slug); if (!cm) return;
      DWZ.cmd = cm; DWZ.th = DWZ.pickTh.filter(t => (cm.th || []).some(([i]) => E.themes[i] && E.themes[i].slug === t)).slice(0, 3);
      if (!DWZ.th.length) { const top = (cm.th || [])[0]; if (top && E.themes[top[0]]) DWZ.th = [E.themes[top[0]].slug]; }
      haptic('tap'); api.close(); setTimeout(openDeckWiz2, 200);
    });
    paint();
    if (typeof EDH !== 'undefined' && !EDH.data && typeof edhLoad === 'function') edhLoad().then(() => { if (sheets.includes(api)) paint(); }).catch(() => { if (sheets.includes(api)) paint(); });
  });
}
/** Thèmes généraux des commandants (EDHREC), les plus joués d'abord. */
function dwzThemeChips(E) {
  if (!E) return '';
  return E.themeOrder.slice(0, 18).map(i => { const t = E.themes[i], on = DWZ.pickTh.includes(t.slug); return `<button type="button" class="chip${on ? ' on' : ''}" data-pt="${esc(t.slug)}" aria-pressed="${on}">${esc(typeof edhThemeName === 'function' ? edhThemeName(t) : t.label)}</button>`; }).join('');
}
/** Commandants proposés : recherche par nom ; sinon thèmes et couleurs choisis ; les plus joués d'abord, ceux de ta collection en tête. */
function dwzCmds(E) {
  if (!E) return [];
  const words = normPart(DWZ.q).split(' ').filter(Boolean), th = DWZ.pickTh.map(s => E.themeIx.get(s)).filter(i => i !== undefined), cols = [...DWZ.cols];
  let l = E.cmds.filter(c => !c.comm);
  if (words.length) l = l.filter(c => { const s = normPart(c.names.join(' ')); return words.every(w => s.includes(w)); });
  if (th.length) l = l.filter(c => th.every(i => (c.th || []).some(t => t[0] === i)));
  if (cols.length) l = l.filter(c => cols.every(x => c.ci.includes(x)) && c.ci.length <= Math.max(cols.length, 1) + (words.length ? 5 : 0));
  const own = c => c.keys.some(k => collQty(k) > 0) ? 1 : 0;
  const fit = c => th.reduce((a, i) => { const t = (c.th || []).find(x => x[0] === i); return a + (t ? t[1] / Math.max(1, c.decks) : 0); }, 0);
  return l.map(c => ({ c, s: own(c) * 2 + fit(c) * 3 + Math.log10(1 + c.decks) / 5 })).sort((a, b) => b.s - a.s).slice(0, 30).map(x => x.c);
}
function dwzCmdRow(c) {
  const own = c.keys.some(k => collQty(k) > 0), img = c.img ? EDH_SMALL + c.img : '', hue = hash32(c.slug) % 360;
  return `<button type="button" class="crow dw-cmd" data-slug="${esc(c.slug)}"><span class="thumb" style="--h:${hue}">${esc((c.names[0][0] || '?').toUpperCase())}${img ? `<img alt="" loading="lazy" decoding="async" src="${esc(img)}">` : ''}</span>
    <span class="row-main"><span class="row-top"><span class="row-name">${esc(c.names.join(' + '))}</span></span><span class="row-meta">${[...(c.ci || 'C')].map(x => `<i class="pip ${x}" aria-hidden="true"></i>`).join('')}<span class="tag">${esc(TN(c.decks, '{n} deck', '{n} decks', { n: nf0(c.decks) }))}</span>${c.tier ? `<span class="tag">${esc(T('Tier {t}', { t: c.tier }))}</span>` : ''}${own ? `<span class="tag good">${T('Possédée')}</span>` : ''}</span></span><span class="me-v">›</span></button>`;
}
function openDeckWiz2() {
  const E = EDH.data, cm = DWZ.cmd; if (!cm) return;
  const cur = mkCur();
  openSheet(cm.names.join(' + '), T('Assistant de deck · étape 2 sur 2'), api => {
    api.wrap.classList.add('dw-wiz');
    const ths = (cm.th || []).map(([i]) => E.themes[i]).filter(Boolean).slice(0, 12);
    const paint = () => {
      api.body.innerHTML = `<div class="field-in"><label class="label" for="dwzName">${T('Nom du deck')}</label><input type="text" id="dwzName" maxlength="120" autocomplete="off" value="${esc(DWZ.name || cm.names[0].split(',')[0])}"></div>
        <p class="label">${T('Thèmes (3 au plus)')}</p><div class="dw-chips">${ths.length ? ths.map(t => `<button type="button" class="chip${DWZ.th.includes(t.slug) ? ' on' : ''}" data-th="${esc(t.slug)}" aria-pressed="${DWZ.th.includes(t.slug)}">${esc(typeof edhThemeName === 'function' ? edhThemeName(t) : t.label)}</button>`).join('') : `<span class="hint">${T('Pas de thème connu pour ce commandant.')}</span>`}</div>
        <p class="label">${T('Bracket')}</p><div class="dw-chips">${DW_BRACKETS.map(b => `<button type="button" class="chip${DWZ.br === b[0] ? ' on' : ''}" data-br="${b[0]}" aria-pressed="${DWZ.br === b[0]}">${b[0]} · ${esc(b[1])}</button>`).join('')}</div>
        <p class="hint">${esc(T((DW_BRACKETS.find(b => b[0] === DWZ.br) || DW_BRACKETS[2])[2]))}</p>
        <p class="label">${T('Budget du deck ({c})', { c: cur })}</p><div class="dw-chips">${[0, 5000, 10000, 25000, 50000, 100000].map(v => `<button type="button" class="chip${DWZ.bud === v ? ' on' : ''}" data-bud="${v}" aria-pressed="${DWZ.bud === v}">${v ? esc(fmt(v, cur).replace(/[.,]00(?=\D*$)/, '')) : T('Sans limite')}</button>`).join('')}</div>
        <label class="me-row switch-row" for="dwzOwn"><span class="me-t">${T('Priorité à ma collection')}<small>${T('Les cartes que tu possèdes passent devant dans les suggestions')}</small></span><span class="switch"><input type="checkbox" id="dwzOwn" ${DWZ.own ? 'checked' : ''}><i></i></span></label>`;
      $('#dwzName', api.body).oninput = e => { DWZ.name = e.target.value; };
      $('#dwzOwn', api.body).onchange = e => { DWZ.own = e.target.checked; };
    };
    api.body.addEventListener('click', e => {
      const t = e.target.closest('[data-th]'); if (t) { const v = t.dataset.th, i = DWZ.th.indexOf(v); if (i >= 0) DWZ.th.splice(i, 1); else if (DWZ.th.length < 3) DWZ.th.push(v); else { toast(T('3 thèmes au plus')); return; } haptic('tap'); paint(); return; }
      const b = e.target.closest('[data-br]'); if (b) { DWZ.br = Number(b.dataset.br); haptic('tap'); paint(); return; }
      const u = e.target.closest('[data-bud]'); if (u) { DWZ.bud = Number(u.dataset.bud) || 0; haptic('tap'); paint(); }
    });
    api.setFoot(`<button class="btn ghost" type="button" id="dwzBack">${T('Retour')}</button><button class="btn" type="button" id="dwzGo">${T('Créer et ouvrir le coach')}</button>`);
    $('#dwzBack', api.foot).onclick = () => { api.close(); setTimeout(() => openDeckWiz(DWZ.name), 200); };
    $('#dwzGo', api.foot).onclick = () => {
      const name = (DWZ.name || cm.names[0].split(',')[0]).trim().slice(0, 120); api.close(); haptic('ok');
      setTimeout(() => openBuilder({ name, fmt: 'commander', cmdr: cm.names.map((n, i) => ({ key: cm.keys[i] || ownKey(n), name: n })), wiz: { th: DWZ.th.slice(0, 3), br: DWZ.br, bud: DWZ.bud, own: DWZ.own }, tab: 'coach' }), 200);
    };
    paint();
  });
}
if (typeof module !== 'undefined' && module.exports) Object.assign(module.exports, { DKW_ROLES, DW_BASE, dwKarsten, dwPips, dwSrcNeed, DW_BRACKETS });
