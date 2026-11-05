/* ── deckwiz.js : assistant de deck Commander (pour tout le monde depuis le 2 novembre 2026) ─────────────────────────────────────
   1. Nouveau deck : « J'ai déjà ce deck » (scanner, coller la liste, à la main) ou « Deck à construire » (assistant : commandant, thèmes, bracket, budget).
   2. Onglet « Coach » de l'éditeur (builder.js), Commander seulement : jauges par catégorie (terrains, rampe, pioche, retraits, balayages…) face à des cibles,
      courbe de mana, sources de couleur, règles du bracket choisi, budget ; un appui sur une jauge propose les cartes qui manquent (ta collection d'abord).
   Données : la base du coach (/api/dkw, server/dkw-srv.mjs, générée par gen-deckdb.mjs) : rôle de chaque carte, cibles calculées sur des milliers de decks réels
   (médianes et quartiles : tous, par bracket, par thème, par commandant), cartes conseillées par commandant (inclusion et synergie EDHREC, thèmes approfondis).
   Les terrains suivent la formule de Frank Karsten (coût moyen et rampe/pioche pas chères du deck en cours) : voir docs/deckbuilder/recherche.md.
   Sans la base (hors ligne, serveur sans données) : cibles du modèle de base (DW_BASE), sans suggestions. */
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
  ['tutor', 'Tuteurs', 'Cherchent une carte précise. Plus de limite officielle depuis octobre 2025, mais trop de tuteurs rendent les parties répétitives.'],
  ['recursion', 'Récursion', 'Ramènent des cartes du cimetière.'],
];
/** Modèle de base : [min, cible, max] d'un deck casual (brackets 2-3), d'après docs/deckbuilder/recherche.md § 8.3 (Karsten, The Command Zone 2025, MTGGoldfish,
 *  Draftsim, médianes des decks moyens EDHREC). Une carte compte dans toutes ses catégories ; les terrains suivent la formule de Karsten (dwLandTarget). */
const DW_BASE = { land: [35, 38, 41], ramp: [8, 10, 15], draw: [8, 11, 18], removal: [5, 8, 12], wipe: [1, 3, 5], counter: [0, 2, 6], protect: [2, 4, 8], tutor: [0, 1, 3], recursion: [1, 2, 6], wincon: [1, 2, 5], mv: [2.8, 3.0, 3.3], cheap: [5, 7, 12], gc: [0, 0, 0] };
/** Écarts par bracket (§ 8.4) : remplacent la ligne du modèle de base. */
const DW_BR_ADJ = {
  1: { wipe: [1, 2, 4], tutor: [0, 0, 1], counter: [0, 1, 3], protect: [2, 3, 6] },
  3: { tutor: [0, 2, 5] },
  4: { ramp: [9, 12, 16], removal: [5, 7, 11], counter: [3, 4, 6], tutor: [2, 4, 6], mv: [2.6, 2.85, 3.1], gc: [0, 6, 99] },
  5: { ramp: [12, 17, 20], draw: [8, 9, 12], removal: [4, 6, 9], wipe: [0, 1, 2], counter: [7, 9, 10], tutor: [7, 10, 12], protect: [2, 3, 5], mv: [2.1, 2.3, 2.5], gc: [0, 15, 99] },
};
/** Archétypes (thèmes EDHREC, § 8.6) : rôles qui changent, et écart de terrains (d) par rapport à la formule. */
const DW_ARCH = {
  aggro: { ramp: [8, 9, 10], draw: [7, 8, 10], wipe: [0, 1, 2], protect: [4, 5, 7], mv: [2.5, 2.8, 2.9], d: -1.5 },
  control: { draw: [11, 14, 16], wipe: [3, 4, 5], counter: [4, 8, 10], protect: [2, 3, 4], d: -1 },
  combo: { ramp: [10, 13, 15], counter: [3, 6, 8], tutor: [5, 8, 10], wipe: [1, 1, 2], protect: [2, 2, 3], mv: [2.2, 2.4, 2.7], d: -3.5 },
  landfall: { ramp: [15, 20, 25], removal: [4, 5, 7], wipe: [1, 1, 2], recursion: [3, 6, 10], d: 3 },
  'lands-matter': { ramp: [15, 20, 25], removal: [4, 5, 7], wipe: [1, 1, 2], recursion: [3, 6, 10], d: 3 },
  spellslinger: { draw: [13, 17, 20], removal: [7, 9, 11], counter: [2, 4, 5], mv: [2.4, 2.6, 2.9], d: -1.5 },
  voltron: { protect: [8, 12, 14], tutor: [2, 4, 6], mv: [2.4, 2.6, 2.9], d: -1 },
  tokens: { ramp: [9, 10, 12], wipe: [1, 2, 3], d: -0.5 },
  aristocrats: { recursion: [3, 5, 8], wipe: [2, 3, 4], draw: [9, 11, 14], d: -1 },
  stax: { counter: [3, 5, 6], tutor: [3, 5, 6], d: -3 },
  // decks à thème (avec le classement par mécaniques) : moins de retraits et de balayages, c'est voulu ; la note ne les pénalise pas (deckopt.js › dsScore)
  'group-hug': { removal: [3, 5, 8], wipe: [0, 1, 3], draw: [8, 10, 14], protect: [1, 3, 6] },
  politics: { removal: [4, 6, 9], wipe: [1, 2, 3] },
  'pillow-fort': { removal: [4, 6, 9], wipe: [2, 3, 5], protect: [1, 3, 5] },
  enchantress: { draw: [6, 8, 12], removal: [5, 7, 10] },
  tribal: { wipe: [0, 1, 3], removal: [5, 7, 10] },
};
/** Mécaniques choisies (assistant) → archétype de cibles. */
const DW_ARCH_MECH = { 'group-hug': 'group-hug', politics: 'politics', pillowfort: 'pillow-fort', enchantments: 'enchantress', attack: 'aggro', voltron: 'voltron', spells: 'spellslinger', landfall: 'landfall', 'tokens-creature': 'tokens', sacrifice: 'aristocrats', 'dies-trigger': 'aristocrats' };
/** Règles du bracket des réglages (brackets.js) : globales dans l'appli et les vm du banc d'essai, require dans Node. */
const DWB = typeof module !== 'undefined' && module.exports ? require('./brackets.js') : { brRule, bracketEstimate, bracketBreaks };
/** Brackets officiels (Wizards, mise à jour du 9 février 2026) : nom, ce qui est permis (texte), Game Changers permis (99 : sans limite ; lu dans brackets.js › BRACKET_RULES,
 *  comme les autres règles : brRule). Tuteurs : plus de limite depuis octobre 2025. */
const DW_BRACKETS = [
  [1, 'Exhibition', 'Decks à thème, très décontractés, parties d\'au moins 9 tours : aucun Game Changer, pas de destruction massive de terrains, pas de combo à 2 cartes, pas de tours supplémentaires.', Math.min(99, DWB.brRule(1).gc)],
  [2, 'Core', 'Niveau d\'un deck préconstruit, parties d\'au moins 8 tours : aucun Game Changer, pas de destruction massive de terrains, pas de combo à 2 cartes, pas de tours supplémentaires enchaînés.', Math.min(99, DWB.brRule(2).gc)],
  [3, 'Upgraded', 'Amélioré, parties d\'au moins 6 tours : jusqu\'à 3 Game Changers, pas de destruction massive de terrains, pas de combo à 2 cartes avant le tour 6, pas de tours supplémentaires enchaînés.', Math.min(99, DWB.brRule(3).gc)],
  [4, 'Optimized', 'Optimisé : aucune restriction en dehors de la liste des cartes bannies.', Math.min(99, DWB.brRule(4).gc)],
  [5, 'cEDH', 'Compétitif (cEDH) : le meilleur deck possible, méta de tournoi.', Math.min(99, DWB.brRule(5).gc)],
];
const DW = { core: null, p: null, err: '', byKey: null, cmd: new Map(), cmdP: new Map(), th: new Map(), thP: new Map(), open: '', shown: 8, setOpen: false };
const DW_KEY = 'dkw:core', DW_FRESH = 3 * 3600e3;      // copie de l'appareil gardée 3 h sans redemander (au-delà : ETag, 304 si la base n'a pas changé)
const dwOn = () => true;      // le coach est pour tout le monde (n'est plus une fonctionnalité en test)
/** Vignettes d'une feuille ou d'un écran du coach : l'image n'apparaît qu'une fois chargée (.thumb img.ok, style.css) ; en panne, la lettre reste (builder.js › thumbLoad, thumbErr). */
function dwImgs(el) {
  el.addEventListener('load', thumbLoad, true);
  el.addEventListener('error', thumbErr, true);
}

/* ── Données ──────────────────────────────────────────────────────────────────────────────────────── */
async function dwGet(q, same) {
  if (typeof location === 'undefined' || !/^https?:$/.test(location.protocol)) return null;
  let r; try { r = await fetch(new URL('api/dkw' + (q ? '?' + q : ''), location.href).href, { cache: 'no-cache', headers: same ? { 'If-None-Match': same } : {} }); } catch (e) { return null; }
  if (r.status === 304) return { same: true };
  if (!r.ok) return null;
  try { return { j: await r.json(), etag: r.headers.get('etag') || '' }; } catch (e) { return null; }
}
/** Index du cœur : clé de carte → rangée [nom, identité, coût, types, rôles, prix, drapeaux, couleurs produites, rang, coût de mana, mécaniques, sous-types, force et endurance]. */
function dwIndex(core) { const m = new Map(); for (const r of core.cards || []) { const k = ownKey(r[0]); if (k && !m.has(k)) m.set(k, r); } return m; }
/** Cœur de la base : copie de l'appareil (un jour), sinon le serveur ; une copie plus ancienne sert hors ligne. */
function dwLoad() {
  if (typeof pxTable === 'function' && !(typeof PXT !== 'undefined' && PXT)) pxTable().then(t => { if (!t) return; if (BD.el && BD.tab === 'coach') bdList(); if (typeof daOpen === 'function' && daOpen()) daPaint(); }, () => {});      // prix du relevé du jour (dwPrice) : chargés en même temps que la base ; arrivés après, le coach et l'analyse se remettent à jour
  if (DW.core) return Promise.resolve(DW.core);
  if (DW.p) return DW.p;
  DW.err = '';
  DW.p = (async () => {
    const rec = await Cache.get(DW_KEY, 60 * DAY).catch(() => null);
    if (rec && rec.j && rec.j.mech && Date.now() - rec.at < DW_FRESH) return rec.j;      // copie sans classement par mécaniques (base d'avant le 4 novembre) : toujours redemandée
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
    const stale = rec && rec.j && rec.j.at && DW.core && DW.core.at && rec.j.at < DW.core.at;      // paquet plus ancien que la base chargée (nouveau passage : fiche IA, mécaniques) : relu tout de suite (ETag : 304 s'il n'a pas changé)
    if (rec && !stale && Date.now() - rec.at < 7 * DAY) return rec.j;
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
  const r = DW.byKey && DW.byKey.get(k);
  if (r) return { name: r[0], ci: r[1], cmc: r[2], ty: r[3], roles: r.length < 10 && r[4] & DW_RB.counter ? r[4] & ~DW_RB.removal : r[4], eur: r[5], fl: r[6], prod: r[7] || '', rank: r[8] || 0, mc: r.length >= 10 ? r[9] || '' : null, pt: Array.isArray(r[12]) ? r[12] : null };      // ancienne base (sans coût de mana) : un contresort n'y est jamais un retrait ciblé ; la nouvelle tranche d'après le texte ; pt : [force, endurance, mots-clés] d'une créature (colonne [12], base du 5 novembre ; sinon null : force estimée par la simulation)
  const m = typeof dmOf === 'function' ? dmOf(k) : null; if (!m && !BASIC_NAMES.has(k)) return null;
  const tl = m ? String(m.tl || '') : 'Basic Land', land = !!landKind(tl);      // même règle que le viewer et la main de départ
  return { name: k, ci: m ? m.ci || '' : '', cmc: m ? m.cm || 0 : 0, ty: land ? 1 : 0, roles: land ? DW_RB.land : 0, eur: m ? m.eu : 0, fl: 0, prod: '', rank: 0 };
}
const DW_BASIC_C = { plains: 'W', island: 'U', swamp: 'B', mountain: 'R', forest: 'G', wastes: 'C' };
const dwBasicColor = k => DW_BASIC_C[String(k).replace(/^snow covered /, '')] || '';

/* ── Réglages du deck (thèmes, bracket, budget) : gardés sur l'appareil par deck ───────────────────── */
const DW_SET = 'deckdeal:dw:';
/** Réglages : thèmes EDHREC (th), bracket, budget (centimes), priorité à la collection ; personnalisation : mécaniques choisies (mech), type de créature (tribe),
 *  cartes fétiches à inclure (pets, noms), cartes à exclure (ban, noms), styles à exclure (avoid : DMX_AVOID), originalité 0-100 (orig : moins de staples,
 *  plus de trouvailles), graine des tirages (seed : « Autre proposition »), style de la version choisie (style, arch). */
const DW_ORIG0 = 30;
const dwDefaults = () => ({ th: [], br: 3, bud: 0, own: true, mech: [], tribe: '', pets: [], ban: [], avoid: [], orig: DW_ORIG0 });
const dwArr = (v, n) => Array.isArray(v) ? v.filter(x => typeof x === 'string' && x).slice(0, n) : [];
/** Réglages lus (stockage, assistant) : formes et bornes vérifiées. */
function dwSane(o) {
  const d = dwDefaults(); if (!o || typeof o !== 'object') return d;
  return { ...d, ...o, th: dwArr(o.th, 3), mech: dwArr(o.mech, 4), pets: dwArr(o.pets, 20), ban: dwArr(o.ban, 40), avoid: dwArr(o.avoid, 12), tribe: typeof o.tribe === 'string' ? o.tribe.slice(0, 30) : '', orig: Number.isFinite(o.orig) ? Math.max(0, Math.min(100, Math.round(o.orig))) : DW_ORIG0 };
}
function dwSettingsFor(id) {
  if (!id) return dwDefaults();
  try { const o = JSON.parse(localStorage.getItem(DW_SET + id) || 'null'); if (o && typeof o === 'object') return dwSane(o); } catch (e) { /* stockage refusé */ }
  return dwDefaults();
}
function dwPersist(id) { if (!id || !BD.wiz) return; try { localStorage.setItem(DW_SET + id, JSON.stringify(BD.wiz)); } catch (e) { /* stockage refusé : pour cette session */ } }
/** Deck enregistré (builder.js › bdSave) : ses réglages du coach suivent son identifiant. */
function dwSaved(id) { if (dwOn() && BD.wiz) dwPersist(id); }

/* ── Commandant du deck ────────────────────────────────────────────────────────────────────────────── */
/** Commandant(s) du deck dans les données EDHREC de l'appli : { slug, names, ci, th } ou un repli d'après le nom. */
function dwCmdOf(X = BD) {
  if (!X.cmdr.length) return null;
  const keys = X.cmdr.map(c => c.key), E = typeof EDH !== 'undefined' && EDH.data;
  let out = null;
  if (E) {
    const hit = keys.length > 1 ? E.cmds.find(c => c.keys.length === keys.length && keys.every(k => c.keys.includes(k))) : E.by.get(keys[0]);
    if (hit) out = { slug: hit.slug, names: hit.names, keys, ci: dwCiOf(keys, hit.ci), th: (hit.th || []).map(([i, n]) => [E.themes[i] ? E.themes[i].slug : '', E.themes[i] ? E.themes[i].label : '', n]).filter(t => t[0]) };
  }
  if (!out) out = { slug: keys.map(k => k.replace(/ /g, '-')).join('-'), names: X.cmdr.map(c => c.name), keys, ci: dwCiOf(keys, ''), th: [] };
  (DW.cmdOfSlug || (DW.cmdOfSlug = new Map())).set(out.slug, out); DW.lastCmd = out;      // dwInfo(pack, set) sans commandant (analyse, rapport) : celui de ce paquet
  return out;
}
/** Identité de couleur du ou des commandants : réunion de celles de chaque carte (les données EDHREC ne donnent que celle du premier partenaire). */
function dwCiOf(keys, base) {
  const cs = new Set([...String(base || '')]);
  for (const k of keys) for (const c of String((dwCard(k) || {}).ci || ((dmOf(k) || {}).ci) || '')) cs.add(c);
  return [...cs].filter(c => 'WUBRG'.includes(c)).sort((a, b) => 'WUBRG'.indexOf(a) - 'WUBRG'.indexOf(b)).join('');
}

/** Game Changer : la base du coach pour ses cartes (drapeau 1) ; carte hors de la base (ou base absente) : builder.js › isGC (Scryfall, puis EDHREC), le même verdict que l'éditeur et le viewer. */
const dwGC = (k, x) => (x && DW.byKey && DW.byKey.has(k) ? !!(x.fl & 1) : typeof isGC === 'function' ? isGC(k) : !!(x && x.fl & 1));
/** Ce que les règles du bracket lisent dans un profil (brackets.js › bracketBreaks) : Game Changers, destruction massive de terrains, tours supplémentaires (noms),
 *  combos à 2 et à 3 cartes (en texte). */
const dwBrFacts = prof => ({ gc: prof.gc, mld: prof.mld, xt: prof.xt, c2: prof.combos.filter(c => !dwCombo3(c)).map(dwComboTxt), c3: prof.combos.filter(dwCombo3).map(dwComboTxt) });

/* ── Profil du deck ───────────────────────────────────────────────────────────────────────────────── */
/** Nombre de symboles de chaque couleur dans un coût (« {2}{G}{G} » → G:2 ; hybride : chaque couleur compte pour moitié ; Phyrexian : compte). */
function dwPips(mc) {
  const out = {}; for (const m of String(mc || '').matchAll(/\{([^}]+)\}/g)) {
    const s = m[1].toUpperCase().replace(/\/P$/, ''), cs = s.split('/').filter(x => 'WUBRG'.includes(x));
    for (const c of cs) out[c] = (out[c] || 0) + 1 / cs.length;
  }
  return out;
}
/** Profil d'un deck (X : { main: Map, cmdr: [] }, l'éditeur par défaut) : comptes par rôle, courbe, coût moyen, rampe/pioche pas chère, sources et symboles par couleur, Game Changers, prix. */
function dwProfile(X = BD) {
  const p = { combos: [], n: 0, nonland: 0, mdfc: 0, mv: 0, cheap: 0, curve: [0, 0, 0, 0, 0, 0, 0, 0], src: {}, pips: {}, maxPip: {}, needs: {}, cmdNeed: {}, gc: [], xt: [], mld: [], cents: 0, cmdCents: 0, buy: 0, unk: 0, cards: 0 };
  for (const r of DKW_ROLES) p[r] = 0;
  let mvSum = 0; const all = [...X.main.values()];
  for (const c of all) {
    const k = c.key, q = c.qty, x = dwCard(k); p.n += q; p.cards++;
    if (!BASIC_NAMES.has(k)) { const e = dwPrice(k, x, true); if (e > 0) { p.cents += e * q; const own = collQty(k); if (own < q) p.buy += e * (q - own); } }      // valeur : toutes les cartes, même absentes de la base (comme l'en-tête de l'éditeur)
    if (dwGC(k, x)) p.gc.push(x ? x.name : c.name);
    if (!x) { p.unk += q; continue; }
    const tl = (dmOf(k) || {}).tl, lk = tl ? landKind(tl) : '', land = BASIC_NAMES.has(k) || (tl ? !!lk : !!(x.roles & DW_RB.land));      // règle unique des terrains (core.js › landKind : doubles faces « Sort // Terrain » comprises) ; fiche pas encore lue : la base
    if (lk === 'mdfc') p.mdfc += q;
    for (const r of DKW_ROLES) if (r === 'land' ? land : x.roles & DW_RB[r]) p[r] += q;
    if (land) { const bc = dwBasicColor(k), pr = bc ? bc : x.prod; for (const col of new Set([...String(pr)].filter(ch => 'WUBRG'.includes(ch)))) p.src[col] = (p.src[col] || 0) + q; }
    else {
      p.nonland += q; mvSum += (x.cmc || 0) * q; p.curve[Math.min(7, Math.floor(x.cmc || 0))] += q;
      if ((x.roles & (DW_RB.ramp | DW_RB.draw)) && (x.cmc || 0) <= 2) p.cheap += q;
      const m = dmOf(k), pips = m && m.mc ? dwPips(m.mc) : x.mc != null ? dwPips(x.mc) : Object.fromEntries([...String(x.ci || '')].filter(c => 'WUBRG'.includes(c)).map(c => [c, 0.5]));      // coût de la fiche, sinon celui de la base ; ancienne base sans coût : un demi-symbole par couleur de l'identité (carte tout juste ajoutée, fiche pas encore lue)
      for (const [col, n] of Object.entries(pips)) { p.pips[col] = (p.pips[col] || 0) + n * q; p.maxPip[col] = Math.max(p.maxPip[col] || 0, Math.ceil(n)); (p.needs[col] = p.needs[col] || []).push(dwSrcFor(n, x.cmc)); }
      if ((x.roles & DW_RB.ramp) && x.prod) for (const col of new Set([...x.prod].filter(ch => 'WUBRG'.includes(ch)))) p.src[col] = (p.src[col] || 0) + q * 0.5;      // rampe qui produit la couleur : demi-source (dork, rock ; recherche : Karsten)
    }
    if (x.fl & 2) p.xt.push(x.name); if (x.fl & 4) p.mld.push(x.name);
  }
  for (const c of X.cmdr) { const x = dwCard(c.key), m = dmOf(c.key); for (const [col, n] of Object.entries(dwPips((m && m.mc) || (x && x.mc) || ''))) p.cmdNeed[col] = Math.max(p.cmdNeed[col] || 0, dwSrcFor(n, x ? x.cmc : (m && m.cm) || 4)); p.n++; if (dwGC(c.key, x)) p.gc.push(x ? x.name : c.name); const e = dwPrice(c.key, x, true); if (e > 0) { p.cents += e; p.cmdCents += e; if (collQty(c.key) < 1) p.buy += e; } }
  const wk = dwWinKeys(X);      // conditions de victoire au sens du plan : cartes de la fiche du commandant qui finissent la partie dans CE deck, et le commandant lui-même quand il gagne par le combat ou le drain
  if (wk) { for (const c of all) if (wk.cards.has(c.key) && !((dwCard(c.key) || {}).roles & DW_RB.wincon)) { p.wincon += c.qty; p.winPlan = (p.winPlan || 0) + c.qty; } if (wk.cmdr) { p.wincon++; p.winCmdr = 1; } }
  p.mv = p.nonland ? mvSum / p.nonland : 0;
  if (DW.core && (Array.isArray(DW.core.combos) || Array.isArray(DW.core.combos3))) {      // combos (Commander Spellbook) dont toutes les cartes sont dans le deck : à 2 cartes, puis à 3 cartes
    const has = k => X.main.has(k) || X.cmdr.some(c => c.key === k), idx = dwComboIdx(), idx3 = dwCombo3Idx(), keys = [...X.main.keys(), ...X.cmdr.map(c => c.key)];
    for (const k of keys) for (const e of idx.get(k) || []) if (k < e.p && has(e.p)) p.combos.push(e.c);      // par l'index (rapide : le score du coach relit souvent le profil)
    for (const k of keys) for (const e of idx3.get(k) || []) if (k < e.p && k < e.q && has(e.p) && has(e.q)) p.combos.push(e.c);      // chaque combo compté une fois : par sa pièce dont la clé vient en premier
  }
  p.need = {};      // sources voulues par couleur : le commandant, et le quart le plus exigeant des sorts (recherche § 8.2 : les cartes importantes)
  for (const col of 'WUBRG') { const l = (p.needs[col] || []).sort((a, b) => b - a), q = l.length ? l[Math.floor(l.length / 4)] : 0; p.need[col] = Math.max(q, p.cmdNeed[col] || 0); }
  return p;
}
/** Conditions de victoire du plan pour le deck X : { cards: Set(clés de la fiche du commandant), cmdr: vrai si le commandant compte (classé condition de victoire,
 *  cité par sa fiche, ou créature dont le plan passe par le combat ou le drain) } ; null sans fiche ni classement. Gardé par paquet (le profil est relu souvent). */
const DW_WIN_TAGS = ['attack', 'combat-damage', 'voltron', 'extra-combat', 'double-strike', 'evasion', 'drain', 'burn', 'commander-matters'];
function dwWinKeys(X) {
  if (!X.cmdr.length || !DW.byKey) return null;
  const cmd = dwCmdOf(X), pack = cmd && DW.cmd && DW.cmd.get(cmd.slug), ai = pack && pack.ai; if (!ai && typeof dmxOn === 'function' && !dmxOn()) return null;
  if (pack && pack._win2 && pack._win2.k === cmd.keys.join('+')) return pack._win2.v;
  const cards = new Set((ai ? ai.win || [] : []).map(n => ownKey(n)));
  let cm = false;
  for (const k of cmd.keys) {
    const x = dwCard(k) || {}, m = typeof dmx === 'function' ? dmx(k) : null;
    if (x.roles & DW_RB.wincon || cards.has(k) || (m && dmxRole(m, 'wincon'))) cm = true;
    else if (x.ty & 2 && ai && (ai.tags || []).slice(0, 3).some(t => DW_WIN_TAGS.includes(t))) cm = true;      // créature dont le plan principal est le combat ou le drain : elle finit la partie elle-même (blessures de commandant)
  }
  const v = { cards, cmdr: cm }; if (pack) pack._win2 = { k: cmd.keys.join('+'), v };
  return v;
}
/** Prix d'une carte : la valeur estimée de l'appli (builder.js › dkPx : relevé du jour, impression la moins chère du marché choisi, sinon tendance de la fiche) s'il est connu,
 *  sinon celui de la base (euros, marché européen seulement). inDeck : carte du deck (dwProfile) ; relevé du jour lu, la base n'est plus consultée, pour que la valeur du deck
 *  soit exactement celle de l'en-tête de l'éditeur, de Mes decks et du viewer (dkEst) ; elle ne sert qu'aux cartes suggérées et hors ligne sans relevé. */
function dwPrice(k, x, inDeck) {
  const e = typeof dkPx === 'function' ? dkPx(k) : (() => { const t = typeof PXT !== 'undefined' && PXT && PXT.map ? PXT.map.get(k) : null; if (t && t.e > 0) return t.e; const m = dmOf(k); return m && m.eu > 0 ? m.eu : 0; })();      // la règle de l'appli (builder.js › dkPx) ; sans l'éditeur (banc d'essai, mesures dans une vm) : la même, en local
  if (e > 0) return e;
  if (inDeck && typeof PXT !== 'undefined' && PXT) return 0;
  return !mkUs() && x && x.eur > 0 ? x.eur : 0;
}

/* ── Cibles ───────────────────────────────────────────────────────────────────────────────────────── */
/** Terrains conseillés (Frank Karsten, régression sur plus de 95 000 decks de tournoi, transposée à 99 cartes) : 31,42 + 3,13 × coût moyen − 0,28 × rampe et pioche de coût ≤ 2. */
const dwKarsten = (mv, cheap) => 31.42 + 3.13 * mv - 0.28 * cheap;
/** [min, cible, max] des terrains (recherche § 8.1) : formule bornée à 34-42, écart de l'archétype ; cEDH : formule − 3,5, au plus 32. */
function dwLandTarget(mv, cheap, br, d = 0) {
  const raw = dwKarsten(mv, cheap);
  if (br === 5) return [27, Math.round(Math.min(raw - 3.5, 32)), 33];
  const t = Math.round(Math.min(Math.max(raw + d, d < -2 ? 31 : 34), 42));
  return [Math.max(br === 4 ? 32 : d < -2 ? 30 : 34, t - 3), t, Math.min(t + 3, 44)];
}
/** Modèle de recherche pour ce bracket et ces thèmes (§ 8.3, 8.4, 8.6) : { rôle: [min, cible, max], d: écart de terrains }. */
function dwModel(set) {
  const m = { ...DW_BASE, ...(DW_BR_ADJ[set.br] || {}) }; let d = 0;
  const cand = set.arch && DW_ARCH[set.arch] ? [set.arch] : [...(set.mech || []).map(t => DW_ARCH_MECH[t]).filter(Boolean), ...(set.th || []), ...(set.tribe ? ['tribal'] : [])];
  for (const t of cand) { const a = DW_ARCH[t]; if (!a) continue; for (const [k, v] of Object.entries(a)) if (k === 'd') d += v; else m[k] = v; m.arch = t; break; }      // style choisi (version « agressive », « contrôle »), sinon le premier archétype parmi les mécaniques et les thèmes
  m.d = d; return m;
}
/** Cibles [min, cible, max] par rôle : le modèle de recherche (poids 2), mêlé aux décks réels quand la base est là : le commandant lui-même (≥ 8 decks, poids 3),
 *  chaque thème choisi (1,5), le bracket (1,5), le nombre de couleurs (0,7), tous les decks récents (1). Terrains : formule de Karsten sur le deck en cours. */
function dwTargets(prof, cmd, pack, set = BD.wiz || dwDefaults()) {
  const tg = DW.core && DW.core.tg, model = dwModel(set), w = [[model, 2]];
  if (tg) {
    if (pack && pack.tg && pack.tg.n >= 8) w.push([pack.tg, 3]);
    for (const t of set.th) if (tg.th && tg.th[t]) w.push([tg.th[t], 1.5]);
    if (tg.br && tg.br[set.br]) w.push([tg.br[set.br], 1.5]);
    if (cmd && tg.nc && tg.nc[cmd.ci.length]) w.push([tg.nc[cmd.ci.length], 0.7]);
    w.push([tg.recent && tg.recent.n >= 50 ? tg.recent : tg.all, 1]);
  }
  const out = {};
  for (const k of Object.keys(DW_BASE)) {
    const src = w.filter(([s]) => Array.isArray(s[k])).map(([s, x]) => [s, k === 'mv' && pack && s === pack.tg ? x * 3 : x]), tot = src.reduce((a, [, x]) => a + x, 0);      // courbe : les decks du commandant comptent triple (dragons, Eldrazi… : un coût moyen élevé est normal)
    out[k] = [0, 1, 2].map(i => src.reduce((a, [s, x]) => a + s[k][i] * x, 0) / tot);
  }
  const real = pack && pack.tg && pack.tg.n >= 8 ? pack.tg : null;      // vrais decks de ce commandant (Archidekt)
  for (const k of Object.keys(out)) if (k !== 'mv' && real && Array.isArray(real[k])) { out[k][0] = Math.min(out[k][0], real[k][0]); out[k][2] = Math.max(out[k][2], real[k][2]); }      // ce que font ses vrais decks n'est jamais « trop » ni « trop peu » (Urtet : 20 à 26 rampes)
  const mv = prof.nonland >= 25 ? prof.mv : out.mv[1], cheap = prof.nonland >= 25 ? prof.cheap : out.cheap[1];
  const ramp3 = prof.nonland >= 25 ? Math.max(0, prof.ramp - prof.cheap - 4) : 0;      // rampe au-delà de celle à 2 mana ou moins (Karsten ne compte que celle-là) : Myr à 3 mana, mana rocks à 3… compte pour moitié
  out.land = dwLandTarget(mv, cheap + ramp3 * 0.5, set.br, model.d);
  if (real && Array.isArray(real.land)) {      // mêlée aux terrains des vrais decks du commandant (2/3) : ils intègrent déjà sa rampe et sa courbe
    const t = Math.round(out.land[1] / 3 + real.land[1] * 2 / 3);
    out.land = [Math.min(out.land[0], real.land[0], t - 2), t, Math.max(out.land[2], real.land[2], t + 2)];
  }
  if (cmd && !cmd.ci.includes('U')) out.counter = [0, 0, 0];
  if (out.wincon) out.wincon = dwPlanWins(pack) ? [1, 1, Math.max(2, out.wincon[2])] : out.wincon.map((v, i) => i < 2 ? Math.max(1, v) : Math.max(2, v));      // au moins une vraie condition de victoire, toujours (deck à thème compris) ; un commandant qui gagne par son plan (combat, jetons…) : une seule suffit
  for (const [a, r] of [['wipe', 'wipe'], ['counter', 'counter'], ['tutor', 'tutor']]) if ((set.avoid || []).includes(a)) out[r] = [0, 0, 0];      // style exclu par le joueur : plus de cible
  for (const k of Object.keys(out)) if (k !== 'mv') out[k] = out[k].map(v => Math.round(v));
  out.arch = model.arch || '';
  return out;
}
/** Vrai si le commandant est bien connu de la base et qu'aucune carte jouée dans au moins 10 % de ses decks n'est une condition de victoire au sens strict. */
function dwPlanWins(pack) {
  if (!pack || !Array.isArray(pack.cards) || pack.cards.length < 40 || !DW.byKey) return false;
  if (pack._win == null) pack._win = pack.cards.some(([nm, inc]) => inc >= 10 && ((dwCard(ownKey(nm)) || {}).roles || 0) & DW_RB.wincon);
  return !pack._win;
}
/** Sources de couleur (Karsten 2022, colonne 99 cartes, ~90 % de lancer le sort au tour égal à son coût) : [symboles de la couleur][coût total] → sources. */
const DW_SRC = { 1: [19, 19, 19, 18, 16, 15, 14], 2: [30, 30, 30, 28, 26, 23, 23], 3: [36, 36, 36, 36, 33, 30, 30], 4: [39, 39, 39, 39, 39, 39, 39] };
/** Sources d'une couleur pour un sort : pips symboles de cette couleur, mv coût total. */
const dwSrcFor = (pips, mv) => { const p = Math.min(4, Math.max(1, Math.ceil(pips || 1))), row = DW_SRC[p]; return row[Math.min(row.length - 1, Math.max(0, Math.round(mv || p)))]; };

/* ── Suggestions ──────────────────────────────────────────────────────────────────────────────────── */
/** Cartes candidates pour le commandant (EDHREC, thèmes choisis, corpus), notées ; role : rôle voulu ('' : plan / synergie ; 'land' : terrains). */
/** Valeur d'une carte pour ce commandant (sans collection ni prix) : inclusion, synergie, thèmes choisis, decks Archidekt. */
/** Poids d'origine ; la base peut en apporter d'autres, réglés chaque nuit par le banc d'essai (bench-coach.mjs : de vrais decks jamais appris, cartes retirées à retrouver). */
/** Popularité (incl, syn, th, g, cx, rank, pair : réglés par le banc) ; mécaniques (deckmech.js : m = valeur pour le plan, q = force propre, noise = écart des tirages,
 *  avoid = recul d'une carte déjà prise par une autre version) : jamais réglés par le banc, qui mesure la ressemblance avec les decks des joueurs. */
const DW_W0 = { incl: 1, syn: 0.8, th: 0.9, g: 0.4, cx: 0.5, rank: 0.5, pair: 0.04, m: 0.6, q: 0.3, noise: 0.12, avoid: 0.1, ai: 0.55, trap: 0.7, eng: 0.3 };
const dwW = () => { const w = DW.core && DW.core.w; return w && typeof w === 'object' ? { ...DW_W0, ...w } : DW_W0; };
/** Popularité seule (EDHREC, decks Archidekt, rang) : signal de fiabilité. */
const dwPop = (o, w = dwW()) => (o.incl || 0) / 100 * w.incl + Math.max(0, o.syn || 0) / 100 * w.syn + (o.th || 0) / 100 * w.th + (o.g || 0) / 100 * w.g + (o.cx || 0) / 100 * w.cx + (o.rank ? Math.max(0, 1 - o.rank / 4000) * w.rank : 0);
/** Valeur d'une carte : popularité (réduite par le curseur « originalité » : o.k) + ce qu'elle fait pour le plan du deck (o.m) + sa force (o.q). */
const DW_AI_V = [-0.5, 0.3, 0.6, 1];      // note de la fiche IA (0 : presque inutile ici, 3 : cœur du plan) → valeur
const dwVal = o => { const w = dwW(); return (o.k == null ? 1 : o.k) * dwPop(o, w) + ((o.m || 0) * w.m + (o.q || 0) * w.q) * (o.d == null ? 1 : o.d) + (o.ai != null ? DW_AI_V[o.ai] * w.ai * (o.aiK == null ? 1 : o.aiK) : 0) - (o.trap ? w.trap : 0); };
/** Part de la popularité gardée : 1 (classique) à 0,3 (trouvailles). */
const dwPopK = set => 1 - 0.7 * (Number.isFinite(set.orig) ? set.orig : DW_ORIG0) / 100;
/** Part de sa valeur mécanique qu'obtient une carte jamais jouée avec ce commandant (réserve élargie) : 0,4 (classique) à 1 (trouvailles). La popularité
 *  n'y est pas une preuve de qualité, mais une carte éprouvée avec ce commandant est un pari plus sûr qu'une carte qui « devrait » marcher. */
const dwPoolD = set => 0.4 + 0.6 * (Number.isFinite(set.orig) ? set.orig : DW_ORIG0) / 100;
/** Style de jeu pour le plan (version choisie) : 'aggro', 'control', 'eco' ou ''. */
const dwStyle = set => set.style === 'eco' ? 'eco' : set.arch || '';
/** Cartes qui vont ensemble (base : paires bien plus souvent dans les mêmes decks que le hasard) : clé → [{ p : clé du partenaire, l : lift }]. */
function dwPairIdx() {
  if (DW.pairIdx && DW.pairIdx.src === DW.core) return DW.pairIdx.m;
  const m = new Map(), cards = (DW.core && DW.core.cards) || [];
  for (const [a, l] of (DW.core && DW.core.pairs) || []) { const ra = cards[a]; if (!ra || !Array.isArray(l)) continue; const ka = ownKey(ra[0]), out = []; for (let i = 0; i + 1 < l.length; i += 2) { const rb = cards[l[i]]; if (rb) out.push({ p: ownKey(rb[0]), n: rb[0], l: l[i + 1] / 10 }); } if (out.length) m.set(ka, out); }
  DW.pairIdx = { src: DW.core, m }; return m;
}
/** Ce que la base sait de chaque carte pour ce commandant et ces thèmes : clé → { name, incl, syn, th, g, cx, rank, m, q, k }.
 *  Avec le classement par mécaniques : toutes les cartes des couleurs qui servent le plan s'y ajoutent (dmxPool), même jamais jouées avec ce commandant ;
 *  m : leur valeur pour le plan (deckmech.js › dmxFit), q : leur force, k : part de popularité gardée (originalité). C.npack : cartes venues des listes du commandant.
 *  cmd : commandant (dwCmdOf), sinon le dernier vu pour ce paquet. Gardé tant que rien ne change (la génération le relit des centaines de fois). */
function dwInfo(pack, set, cmd) {
  cmd = cmd || (pack && DW.cmdOfSlug && DW.cmdOfSlug.get(pack.slug)) || DW.lastCmd || null;
  const plan = typeof dmxPlan === 'function' && cmd ? dmxPlan(cmd, set, dwStyle(set), (pack && pack.ai) || null) : null;
  const sig = [cmd ? (cmd.keys || cmd.names.map(n => ownKey(n))).join('+') : '', (set.th || []).map(t => t + (DW.th.has(t) ? 1 : 0)).join(','), plan ? plan.sig : '', dwPopK(set)].join('|');
  if (DW.infoC && DW.infoC.pack === pack && DW.infoC.sig === sig && DW.infoC.src === DW.core) return DW.infoC.C;
  const C = new Map(), add = (name, f, v) => { const k = ownKey(name); if (!k) return; const o = C.get(k) || { name, incl: 0, syn: 0, th: 0, g: 0, cx: 0 }; o[f] = Math.max(o[f], v); C.set(k, o); };
  if (pack) {
    for (const [nm, inc, syn] of pack.cards || []) { add(nm, 'incl', inc); add(nm, 'syn', syn); }
    for (const t of set.th) { const tp = pack.th && pack.th[t]; if (tp) for (const [nm, inc] of tp.cards || []) add(nm, 'th', inc); }
    for (const [nm, inc] of pack.xc || []) add(nm, 'cx', inc);
  }
  for (const t of set.th) { const tp = DW.th.get(t); if (tp) for (const [nm, inc] of tp.cards || []) add(nm, 'g', inc); }
  C.npack = C.size;
  if (plan) {
    const ask = plan.user ? 1.5 : 1, k0 = dwPopK(set), d0 = (C.npack >= 40 ? dwPoolD(set) : 1) * ask;      // commandant sans liste : toutes les cartes sont « hors liste », rien à départager ; thème demandé par le joueur : les mécaniques comptent une fois et demie
    C.ask = ask;
    const ai = pack && pack.ai;
    if (ai) {      // fiche IA du commandant : notes de synergie (même pour des cartes jamais jouées avec lui), conditions de victoire et cartes conseillées en plus, pièges
      const put = (nm, f) => { const k = ownKey(nm), r = DW.byKey && DW.byKey.get(k); if (!r) return; let o = C.get(k); if (!o) { o = { name: r[0], incl: 0, syn: 0, th: 0, g: 0, cx: 0, rank: 0, pool: 1, d: d0 }; C.set(k, o); } f(o); };
      const aiK = plan.user ? 0.5 : 1;      // le joueur a choisi un thème, une mécanique ou une tribu : sa demande passe avant la fiche
      for (const [nm, v] of ai.syn || []) put(nm, o => { o.ai = Math.max(o.ai == null ? 0 : o.ai, v); o.aiK = aiK; });
      for (const nm of [...(ai.win || []), ...(ai.extra || [])]) put(nm, o => { o.ai = Math.max(o.ai == null ? 0 : o.ai, 2); o.aiK = aiK; });
      for (const nm of ai.trap || []) put(nm, o => { o.trap = 1; });
      for (const [, cs] of ai.eng || []) for (const nm of cs) put(nm, o => { o.eng = (o.eng || []).concat([cs.map(n => ownKey(n))]); });
    }
    for (const [k, r] of dmxPool(cmd, plan)) if (!C.has(k)) C.set(k, { name: r[0], incl: 0, syn: 0, th: 0, g: 0, cx: 0, rank: C.npack >= 40 ? 0 : r[8] || 0, pool: 1, d: d0 });      // hors liste : sa popularité générale ne compte pas (c'est elle qui standardise les decks)
    for (const [k, o] of C) { const m = dmx(k); o.k = k0; if (!o.pool) o.d = ask; if (m) { o.m = dmxFit(m, plan, null); o.q = dmxQ(m); const r = DW.byKey.get(k); if (r && r[4] & DW_RB.land) o.d *= 0.35; } }      // terrain : ses couleurs d'abord (un terrain utilitaire à mécanique ne passe pas devant un bicolore)
    C.plan = plan;
  }
  DW.infoC = { pack, sig, src: DW.core, C };
  return C;
}
/** Graine d'une carte pour un tirage : bruit de Gumbel (même graine, même tirage). */
function dwNoise(k, seed) { let h = (seed | 0) ^ 0x9e3779b9; for (let i = 0; i < k.length; i++) h = Math.imul(h ^ k.charCodeAt(i), 2654435761); h ^= h >>> 15; const u = ((h >>> 0) % 1e6 + 0.5) / 1e6; return -Math.log(-Math.log(u)) - 0.5772; }
/** dwNoise gardé pour la graine en cours (la génération relit les mêmes cartes des centaines de fois). */
const DW_NOISEC = { seed: null, m: null };
function dwNoiseOf(k, seed) { if (DW_NOISEC.seed !== seed) { DW_NOISEC.seed = seed; DW_NOISEC.m = new Map(); } let v = DW_NOISEC.m.get(k); if (v === undefined) DW_NOISEC.m.set(k, v = dwNoise(k, seed)); return v; }
/** Candidates d'une liste (dwInfo) qui passent les filtres fixes (dans la base, couleurs du commandant, interdites, bracket, exclusions du joueur) : [[k, o, x, terrain]].
 *  Gardé tant que la liste, la base et ces réglages ne changent pas : la génération appelle dwSuggest des centaines de fois (rapide, même sur téléphone). */
const DW_SUGC = { C: null, src: null, key: '', l: null, w: null };
function dwSugPool(C, ci, set, wide) {
  const k0 = dwPopK(set), key = [[...ci].join(''), set.br, (set.ban || []).join('|'), (set.avoid || []).join('|'), k0].join('#');
  if (!(DW_SUGC.C === C && DW_SUGC.src === DW.byKey && DW_SUGC.key === key)) { DW_SUGC.C = C; DW_SUGC.src = DW.byKey; DW_SUGC.key = key; DW_SUGC.l = null; DW_SUGC.w = null; }
  const f = wide ? 'w' : 'l'; if (DW_SUGC[f]) return DW_SUGC[f];
  const l = [], R = DWB.brRule(set.br), ok = (k, o) => {
    if (BASIC_NAMES.has(k)) return;
    const x = dwCard(k); if (!x || !DW.byKey.has(k)) return;
    if ([...String(x.ci)].some(c => !ci.has(c))) return;
    if (x.fl & 16 || (x.fl & 4 && !R.mld) || (x.fl & 2 && !R.xt)) return;      // interdite en Commander ; bracket (brackets.js : destruction massive de terrains, tours supplémentaires ; leur nombre : dwSuggest)
    if (dwExcluded(k, x, set)) return;      // cartes et styles exclus par le joueur
    l.push([k, o, x, !!(x.roles & DW_RB.land)]);
  };
  if (wide) { for (const [k, r] of dwWidePool([...ci].join(''))) if (!C.has(k)) ok(k, { rank: r[8], k: C.plan ? k0 : 1, d: C.ask || 1 }); }      // réserve élargie : les cartes les plus jouées dans ces couleurs, hors liste
  else for (const [k, o] of C) ok(k, o);
  return (DW_SUGC[f] = l);
}
const DW_BANC = new WeakMap();
/** Cartes exclues par le joueur (noms) et styles exclus : test sur une carte. */
function dwExcluded(k, x, set) {
  if (set.ban && set.ban.length) { let b = DW_BANC.get(set.ban); if (!b) DW_BANC.set(set.ban, b = new Set(set.ban.map(n => ownKey(n)))); if (b.has(k)) return true; }
  const av = set.avoid; if (!av || !av.length) return false;
  const m = typeof dmx === 'function' ? dmx(k) : null, has = t => !!m && m.p.includes(dmxTag(t));
  for (const a of av) {
    if (a === 'stax' && m && dmxRole(m, 'stax')) return true;
    if (a === 'steal' && (has('steal') || has('cast-others'))) return true;
    if (a === 'tutor' && (x.roles & DW_RB.tutor || x.fl & 8)) return true;
    if (a === 'counter' && x.roles & DW_RB.counter) return true;
    if (a === 'wipe' && x.roles & DW_RB.wipe) return true;
    if (a === 'discard' && has('discard-opponents')) return true;
    if (a === 'mill' && has('mill')) return true;
    if (a === 'chaos' && has('coin-flip')) return true;
    if (a === 'xturn' && (x.fl & 2 || has('extra-turn'))) return true;
    if (a === 'gc' && x.fl & 1) return true;
  }
  return false;
}
/** X : deck ({ main, cmdr, wiz, skip, pace, wide, avoid }) ; skip : clés déjà prises ailleurs (échanges de l'analyse) ; avoid : clé → nombre d'autres versions qui l'ont déjà (construction).
 *  Valeur : popularité (réduite par l'originalité) + ce que la carte fait pour le plan du deck EN COURS (deckmech.js : fournit ce que veulent le commandant, les thèmes
 *  et les cartes déjà là, profite de ce qu'ils fournissent, rendements décroissants) + sa force ; paires « va avec » ; combos (bracket 4-5) ; collection, budget ;
 *  à la génération, un tirage (graine) départage les cartes proches, et une carte déjà prise par une autre version recule. */
function dwSuggest(role, cmd, pack, prof, tgt, n, X = BD) {
  if (!DW.byKey) return [];
  const set = X.wiz || dwDefaults(), ci = new Set([...(cmd ? cmd.ci : '')]), inDeck = k => X.main.has(k) || X.cmdr.some(c => c.key === k) || (X.skip && X.skip.has(k));
  const R = DWB.brRule(set.br), gcLeft = R.gc - prof.gc.length, xtLeft = R.xt - prof.xt.length;      // règles du bracket (brackets.js) : Game Changers et tours supplémentaires encore permis
  const must = role === 'wincon' && !prof.wincon;      // la première condition de victoire passe avant tout (rythme et part des terrains)
  const budLeft = set.bud > 0 ? set.bud - prof.cents - (X.landRes && role !== 'land' && !must ? X.landRes : 0) : Infinity, slots = Math.max(1, 100 - prof.n);      // landRes : part du budget gardée pour les terrains pendant la génération
  const C = X.info || dwInfo(pack, set, cmd), w = dwW();
  const fallback = (C.npack != null ? C.npack : C.size) < 40 || X.wide;      // commandant inconnu de la base (ou génération à court de cartes : X.wide) : les cartes les plus jouées en Commander dans ses couleurs (rang EDHREC)
  const noCombo = (set.avoid || []).includes('combo'), combo = !!(DW.core && (DW.core.combos || DW.core.combos3)), pairs = dwPairIdx(), wPair = w.pair;      // combo interdit ou à éviter dans ce bracket (brackets.js : 1-2), ou combos évités : jamais la carte qui le complète
  const cols = cmd ? [...cmd.ci] : [], short = role === 'land' ? cols.filter(c => (prof.src[c] || 0) < (prof.need[c] || 0)) : [];      // terrains : couleurs sous le repère de Karsten
  const curveHi = (X.pace || X.gen) && prof.nonland >= 20 && prof.mv > tgt.mv[2];
  const plan = C.plan || null, deck = plan ? dmxDeck(X) : null, st = plan ? DMX_STYLE[plan.style] : null, seed = set.seed || 0, tau = w.noise * (0.7 + 0.6 * (Number.isFinite(set.orig) ? set.orig : DW_ORIG0) / 100);
  const out = [];
  const rate = (k, o, x, isLand) => {      // filtres qui dépendent du deck en cours (place, rôle, combos, budget), puis la note
    if (inDeck(k)) return;
    if (role === 'land' ? !isLand : role ? !(x.roles & DW_RB[role]) : isLand) return;
    if (x.fl & 1 && gcLeft <= 0) return;
    if (x.fl & 2 && xtLeft <= 0) return;
    const cw = combo ? dwComboWith(k, inDeck) : null; if (cw && (noCombo || (dwCombo3(cw.c) ? R.c3 === 'avoid' : R.c2 === 'no'))) return;
    const combo2 = cw ? cw.o : null;      // les autres pièces du combo, déjà dans le deck
    const price = dwPrice(k, x), own = collQty(k) > 0;
    if (price > 0 && price > budLeft) return;      // budget = valeur du deck, cartes possédées comprises (« Valeur du deck 634 € / 100 € »)
    if (X.pace && set.bud > 0) {      // génération : une carte chère passe tant qu'il reste de quoi remplir les autres places ; plus le budget par place est petit, plus l'écart permis est faible
      const per = budLeft / slots, kk = per < 50 ? 2 : per < 150 ? 4 : 8, floor = Math.min(10, per * 0.5);
      if (price > (must ? budLeft - (slots - 1) * floor : Math.max(Math.min(60, per * 2), Math.min(per * kk, budLeft - (slots - 1) * floor)))) return;
    }
    const m = plan ? dmx(k) : null;
    if (m && o.m == null) { o.m = dmxFit(m, plan, null); o.q = dmxQ(m); }      // carte de secours (rang) : sa valeur de base pour le plan
    const v = dwVal(o); let s = v, pair = null;
    const pr = pairs.get(k); if (pr) { let b = 0; for (const e of pr) if (inDeck(e.p)) { b += Math.log2(e.l); if (!pair || e.l > pair.l) pair = e; } s += Math.min(0.4, b * wPair); }      // va avec des cartes déjà dans le deck
    if (combo2 && R.c2 === 'ok') s += 0.4;      // bracket 4-5 (combos permis sans condition) : la pièce qui complète un combo du deck (2 ou 3 cartes) ; bracket 3 : permise, sans bonus
    if (o.eng) for (const cs of o.eng) if (cs.some(p => p !== k && inDeck(p))) { s += w.eng; break; }      // moteur de la fiche IA dont une pièce est déjà là
    if (o.trap && dwTrapOk(k, o, inDeck, set)) s += w.trap;      // piège avec le commandant, mais combo ou moteur avec une carte déjà là : plus de malus
    if (own) s += set.own ? 0.35 : 0.08;
    if (!own && set.bud > 0 && price > 0 && Number.isFinite(budLeft) && budLeft / slots < 300) s -= Math.min(0.4, price / Math.max(100, budLeft / slots * 4) * 0.2);      // budget serré seulement (moins de ~3 € par place restante) : un gros budget est un plafond, pas une raison de prendre moins bien
    if (isLand && cols.length > 1) {      // terrains d'un deck multicolore : ceux qui produisent les couleurs en manque d'abord, puis ceux qui en produisent plusieurs
      const pr2 = [...String(x.prod)].filter(c => cols.includes(c)), fix = new Set(pr2).size;
      if (short.length) s += 0.25 * pr2.filter(c => short.includes(c)).length - (fix ? 0 : 0.3);
      if (fix >= 2) s += 0.08 * Math.min(3, fix);
      if (!fix) s -= 0.15;      // terrain qui ne donne aucune couleur du deck (utilitaire incolore) : moins prioritaire en multicolore
    }
    if (curveHi && !isLand && x.cmc >= 5) s -= 0.08 * (x.cmc - 4);      // génération : courbe déjà trop haute, les très gros sorts reculent
    if ((X.pace || X.gen) && !isLand && plan && x.cmc <= 2 && x.roles & (DW_RB.ramp | DW_RB.draw)) s += 0.1;      // rampe et pioche à 2 mana ou moins : moins de terrains nécessaires (formule de Karsten), démarrage plus sûr
    if ((X.pace || X.gen) && !isLand) {
      const arch = set.arch;
      if (st) { s += (x.ty & 2 ? st.cre : 0) + st.mv * Math.max(0, x.cmc - 3); if (st.cheap && price > 0) s += price < 150 ? st.cheap : price > 800 ? -st.cheap : 0; }      // style de la version (deckmech.js › DMX_STYLE)
      else if (arch === 'aggro') s -= 0.04 * Math.max(0, x.cmc - 3) - (x.ty & 2 ? 0.05 : 0);      // base sans classement : retouches d'avant
      else if (arch === 'control' && x.roles & (DW_RB.removal | DW_RB.wipe | DW_RB.counter | DW_RB.draw)) s += 0.08;
      if (X.avoid) { const a = X.avoid.get(k); if (a) s -= w.avoid * a * (C.npack >= 40 ? 2.5 : 0.35); }      // déjà dans une autre version : recule (versions vraiment différentes ; écart à la mesure des valeurs : listes du commandant, ou réserve plate)
    }
    if (seed && (X.pace || X.gen)) s += tau * dwNoiseOf(k, seed);      // tirage : départage les cartes proches (« Autre proposition »)
    out.push({ k, name: x.name, s, v, o, own, price, gc: !!(x.fl & 1), x, m, pair: pair ? pair.n : '', combo: combo2 });
  };
  for (const [k, o, x, isLand] of dwSugPool(C, ci, set)) rate(k, o, x, isLand);
  if (fallback) for (const [k, o, x, isLand] of dwSugPool(C, ci, set, true)) rate(k, o, x, isLand);      // cartes de secours (rang)
  if (plan) {      // valeur pour le plan dans le deck EN COURS (au lieu de la valeur de base) : calculée pour les meilleures candidates seulement (rapide, même sur téléphone)
    out.sort((a, b) => b.s - a.s);
    for (const c of out.slice(0, Math.max(150, n * 4))) if (c.m) c.s += w.m * (dmxFit(c.m, plan, deck) - (c.o.m || 0)) * (c.o.d == null ? 1 : c.o.d);
  }
  out.sort((a, b) => b.s - a.s || (a.name < b.name ? -1 : 1));
  return out.slice(0, n);
}
/** Cartes très jouées en Commander (rang EDHREC < 6000) dans une identité de couleur, sans les interdites : calculé une fois par identité (génération : appelé souvent). */
function dwWidePool(ci) {
  const key = String(ci || ''); DW.widePool = DW.widePool && DW.widePool.src === DW.core ? DW.widePool : { src: DW.core, m: new Map() };
  let l = DW.widePool.m.get(key); if (l) return l;
  const ok = new Set([...key]); l = [];
  for (const [k, r] of DW.byKey) if (r[8] > 0 && r[8] < 6000 && !(r[6] & 16) && [...String(r[1])].every(c => ok.has(c))) l.push([k, r]);
  DW.widePool.m.set(key, l); return l;
}
/** Combos à 2 cartes (Commander Spellbook) : clé de carte → [{ p : clé de la carte qui le complète, c : le combo }]. */
function dwComboIdx() {
  if (DW.comboIdx && DW.comboIdx.src === DW.core) return DW.comboIdx.m;
  const m = new Map(), add = (a, b, c) => { (m.get(a) || m.set(a, []).get(a)).push({ p: b, c }); };
  for (const c of (DW.core && DW.core.combos) || []) { const a = ownKey(c[0]), b = ownKey(c[1]); if (a && b && a !== b) { add(a, b, c); add(b, a, c); } }
  DW.comboIdx = { src: DW.core, m }; return m;
}
/** Combos à 3 cartes (Commander Spellbook, core.combos3 : [A, B, C, résultat, étiquette]) : clé de carte → [{ p, q : clés des deux autres pièces, o : leurs noms, c : le combo }]. */
function dwCombo3Idx() {
  if (DW.combo3Idx && DW.combo3Idx.src === DW.core) return DW.combo3Idx.m;
  const m = new Map(), add = (a, p, q, o, c) => { (m.get(a) || m.set(a, []).get(a)).push({ p, q, o, c }); };
  for (const c of (DW.core && DW.core.combos3) || []) { const a = ownKey(c[0]), b = ownKey(c[1]), d = ownKey(c[2]); if (a && b && d && a !== b && a !== d && b !== d) { add(a, b, d, [c[1], c[2]], c); add(b, a, d, [c[0], c[2]], c); add(d, a, b, [c[0], c[1]], c); } }
  DW.combo3Idx = { src: DW.core, m }; return m;
}
/** Combo (2 cartes d'abord, puis 3) que la carte k complète, les autres pièces étant déjà là (inDeck : clé → vrai) : { c : le combo, o : noms des autres pièces } ou null. */
function dwComboWith(k, inDeck) {
  for (const e of dwComboIdx().get(k) || []) if (inDeck(e.p)) return { c: e.c, o: [ownKey(e.c[0]) === k ? e.c[1] : e.c[0]] };
  for (const e of dwCombo3Idx().get(k) || []) if (inDeck(e.p) && inDeck(e.q)) return { c: e.c, o: e.o };
  return null;
}
/** Piège de la fiche qui sert quand même dans CE deck : une autre carte du deck forme avec lui un combo connu (2 ou 3 cartes, Commander Spellbook ; pas en
 *  bracket 1-2 ni quand les combos sont évités), ou un moteur de la fiche dont une autre pièce est là (Aminatou : Restoration Angel ne fait pas clignoter le
 *  commandant, mais fait un combo infini avec Felidar Guardian). o : infos de la carte (dwInfo : trap, eng) ; inDeck(clé). → { kind: 'combo' | 'eng', with: [noms] } ou null. */
function dwTrapOk(k, o, inDeck, set = {}) {
  if (!o || !o.trap) return null;
  if (!(DWB.brRule(set.br).c2 === 'no' || (set.avoid || []).includes('combo')) && DW.core && (DW.core.combos || DW.core.combos3)) { const cw = dwComboWith(k, inDeck); if (cw) return { kind: 'combo', with: cw.o }; }
  for (const cs of o.eng || []) { const p = cs.filter(x => x !== k && inDeck(x)); if (p.length) return { kind: 'eng', with: p.map(x => (dwCard(x) || {}).name || x) }; }
  return null;
}
const dwCombo3 = c => c.length >= 5;      // combo à 3 cartes : [A, B, C, résultat, étiquette] (à 2 cartes : [A, B, résultat, étiquette])
const dwComboCards = c => c.slice(0, dwCombo3(c) ? 3 : 2), dwComboRes = c => c[dwCombo3(c) ? 3 : 2];
const dwComboTxt = c => `${dwComboCards(c).join(' + ')} (${dwComboRes(c)})`;
/** « combo avec A » (2 cartes) ou « combo avec A et B » (3 cartes) : o, les autres pièces. */
const dwComboWhy = o => o.length > 1 ? T('combo avec {a} et {b}', { a: o[0], b: o[1] }) : T('combo avec {card}', { card: o[0] });
const dsNumFr = v => Number(v).toLocaleString(LOC(), { maximumFractionDigits: 1 });
/** Raison d'une suggestion : ce qui la fait remonter. */
function dwWhy(sg, cmd, X = BD) {
  const o = sg.o, w = [];
  const C = X.info || (DW.infoC && DW.infoC.C), plan = C && C.plan;
  if (typeof dmxReasons === 'function' && plan) w.push(...dmxReasons(sg.k, X, cmd, plan));      // ce que fait la carte pour ce deck (classement par mécaniques)
  else if (sg.combo) w.push(dwComboWhy(sg.combo));
  if (sg.pair) w.push(T('va avec {card}', { card: sg.pair }));
  if (o.pool && !o.incl && (o.m || 0) >= 0.55) w.push(T('trouvaille : peu jouée, en pleine synergie'));
  if (o.incl >= 5 && cmd) w.push(T('{p} % des decks de {name}', { p: o.incl, name: cmd.names[0].split(',')[0] }));
  if (o.syn >= 15) w.push(T('synergie +{p} %', { p: o.syn }));
  if (o.th >= 10) w.push(T('thème choisi'));
  else if (o.g >= 10) w.push(T('carte du thème'));
  if (o.cx >= 25) w.push(T('decks Archidekt les plus vus'));
  if (o.rank && o.rank < 1500 && !o.incl && !w.length) w.push(T('très jouée en Commander'));
  if (sg.gc) w.push('Game Changer');
  return [...new Set(w)].slice(0, 3).join(' · ');
}

/* ── Onglet Coach ─────────────────────────────────────────────────────────────────────────────────── */
function dwCoachHtml() {
  if (BD.fmt !== 'commander') return `<p class="hint">${T('Le coach est réservé aux decks Commander pour le moment.')}</p>`;
  if (!BD.wiz) BD.wiz = dwSettingsFor(BD.id);
  if (!DW.core && !DW.p && !DW.err) dwLoad().catch(() => {});
  if (typeof edhEnsure === 'function') edhEnsure();
  if (DW.seenEl !== BD.el) { DW.seenEl = BD.el; DW.setOpen = false; DW.open = ''; DW.lastN = null; DW.changed = false; }      // autre deck ouvert : coach replié, pas de message « cartes de trop » à l'ouverture
  const cmd = dwCmdOf();
  if (!cmd) return `<div class="dw-empty"><p class="hint">${T('Choisis d\'abord ton commandant : le coach s\'appuie sur les decks qui le jouent.')}</p><button class="btn small" type="button" data-act="pick-cmdr">${T('Choisir un commandant')}</button></div>`;
  const pack = DW.core ? (DW.cmd.has(cmd.slug) ? DW.cmd.get(cmd.slug) : (dwPack('c', cmd.slug), null)) : null;
  for (const t of (BD.wiz || {}).th || []) if (DW.core && !DW.th.has(t)) dwPack('t', t);
  const prof = dwProfile(), tgt = dwTargets(prof, cmd, pack);
  let h = '';
  if (DW.p && !DW.core) h += `<div class="status" data-ok="0"><span class="dot"></span><span>${T('Chargement de la base du coach…')}</span></div>`;
  else if (DW.err) h += `<div class="status" data-ok="0"><span class="dot"></span><span>${esc(DW.err)}</span></div>`;
  if (DW.core && typeof dwNextHtml === 'function') {      // prochaines étapes (deckux.js) ; deck passé au-dessus de 100 : message « Que retirer ? »
    if (DW.changed && BD.wiz.gen && prof.n > BD.cmdr.length) h += `<div class="dx-regen"><p><b>${T('Réglages modifiés')}</b><span>${T('Ce deck a été construit par le coach : il peut le reconstruire avec les nouveaux réglages (budget, bracket, thèmes). Annulable.')}</span></p><div class="dx-acts"><button class="btn ghost small" type="button" data-act="dw-keep">${T('Garder le deck')}</button><button class="btn small" type="button" data-act="dw-regen">${T('Recréer le deck')}</button></div></div>`;      // deck généré par le coach : le refaire avec les nouveaux réglages
    h += dwNextHtml(prof, tgt, cmd, BD.wiz);
    if (prof.n > 100 && (DW.lastN || 0) <= 100 && DW.lastN != null) setTimeout(() => toast(TN(prof.n - 100, '{n} carte de trop', '{n} cartes de trop'), { label: T('Que retirer ?'), fn: () => { const el = BD.el && $('#dwCuts', BD.el); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' }); } }), 0);
    DW.lastN = prof.n;
    h += dwCutsHtml(prof, tgt, cmd, pack);
  }
  if (DW.core && typeof dsScore === 'function' && prof.n > BD.cmdr.length + 20) h += dsScoreHtml(dsScore(BD, { cmd, pack }), { open: DW.scoreOpen });      // note du coach (deckopt.js) : dès que le deck prend forme
  if (DW.core && typeof dwDeckStory === 'function' && prof.n > BD.cmdr.length + 20) h += dwStoryHtml(dwDeckStory(BD));      // plan du deck : thèmes, tribu, moteurs, conditions de victoire (classement par mécaniques)
  if (DW.core && BD.wiz.gen && prof.n > BD.cmdr.length + 20 && typeof dsAgain === 'function') h += `<button class="btn ghost block" type="button" data-act="dw-again">${T('Autre proposition')}</button><p class="hint">${T('Le coach reconstruit le deck avec les mêmes réglages et d\'autres cartes de qualité égale ; annulable.')}</p>`;
  if (DW.core && prof.n >= 99 && typeof dsimEnsure === 'function') h += `<div class="dw-simbox">${dwSimInner()}</div>`;      // 10 000 parties jouées seul (decksim.js) : sous « Autre proposition »
  h += dwSetHtml(cmd, pack);
  if (DW.core && typeof openDeckReport === 'function') h += `<button class="btn ghost block dw-rep" type="button" data-act="dw-report"><svg class="i" aria-hidden="true"><use href="#i-info"/></svg>${T('Rapport du coach')}</button>`;
  if (DW.core && DW.autoNext && DW.cmd.has(cmd.slug)) { DW.autoNext = false; setTimeout(() => dwBuild(), 0); }      // prix du jour lus d'abord (dwBuild)      // assistant : « Générer les 100 cartes tout de suite »
  if (DW.core && prof.n <= BD.cmdr.length) {
    const ready = DW.cmd.has(cmd.slug), empty = true;
    h += `<button class="btn block dw-auto" type="button" data-act="dw-auto"${ready ? '' : ' disabled'}>${empty ? T('Générer le deck (100 cartes)') : T('Compléter le deck jusqu\'à 100 cartes')}</button><p class="hint dw-auto-h">${T('Rôles jusqu\'aux cibles, puis le plan du commandant, puis les terrains ; dans tes couleurs, ton bracket et ton budget, ta collection d\'abord. Les cartes déjà là restent ; annulable.')}</p>`;
  }
  h += dwFoldHead('bal', DW.balOpen !== false, T('Équilibre du deck'), dwBalSum(prof, tgt, cmd), 'data-act="dw-fold" data-v="bal"') + (DW.balOpen !== false ? `<div class="dw-gauges">${dwGaugesHtml(prof, tgt, cmd, pack)}</div>` : '');
  h += dwManaHtml(prof, tgt, cmd);
  h += dwBracketHtml(prof);
  h += dwBudgetHtml(prof);
  if (DW.core) h += dwPlanHtml(cmd, pack, prof, tgt);
  if (DW.core && typeof dwImproveHtml === 'function') { h += dwImproveHtml(prof, tgt, cmd, pack); if (DW.open === 'swaps' && typeof DX !== 'undefined' && dmMissing((DX.swaps || []).map(s => ({ key: s.in.k, name: s.in.name }))).length) bdMetaSoon(); }      // échanges dépliés : fiches (image de la carte) des cartes à ajouter
  const bch = DW.core && DW.core.bench && DW.core.bench.tuned;
  const src = (DW.core && DW.core.src && DW.core.src.decks ? T('Cibles calculées sur {n} decks réels (Archidekt, EDHREC) et la formule des terrains de Frank Karsten.', { n: nf0(DW.core.src.decks) }) : T('Cibles du modèle de base (Command Zone, Frank Karsten, EDHREC).'))
    + (bch ? ' ' + T('Banc d\'essai : sur {n} vrais decks jamais appris, le coach retrouve {p} % des cartes retirées dans ses 20 premières suggestions.', { n: nf0(DW.core.bench.n), p: dsNumFr(bch.r20) }) : '');
  h += `<p class="hint dw-src">${esc(src)}</p>`;
  return h;
}
/** Simulation du deck de l'éditeur (decksim.js) : résultats, ou progression ; repeinte seule pendant le calcul (pas tout l'onglet). */
function dwSimInner() {
  const cmd = dwCmdOf(); if (cmd && !DW.cmd.has(cmd.slug)) return dsimHtml(null, 0);      // fiche du commandant (plan, moteurs) d'abord : la partie jouée en dépend
  const r = dsimEnsure(BD, () => { const box = BD.el && BD.tab === 'coach' && BD.el.querySelector('.dw-simbox'); if (box) box.innerHTML = dwSimInner(); });
  return dsimHtml(r && !r.none ? r : null, DSIM.prog || 0);
}
/** Plan du deck (données : deckmech.js › dwDeckStory), lisible d'un coup d'œil : le texte de la fiche (3 lignes, « Lire tout »), puis trois lignes courtes
 *  étiquetées : thèmes (pastilles « 35 Goblin »), moteurs (un par ligne, ses cartes en petit), pour gagner (pastilles) ; remarques en petit.
 *  o.label : titre « Plan du deck » (faux dans l'analyse, qui a le sien). */
function dwStoryHtml(st, o = {}) {
  if (!st) return '';
  const fr = typeof I18N === 'undefined' || !I18N.lang || I18N.lang === 'fr';      // texte de la fiche IA : écrit en français
  const tags = [...(st.tribe ? [[st.tribe.n, st.tribe.t]] : []), ...st.tags.slice(0, 3).map(t => [t.n, t.label])];
  const pill = (n, l) => `<span class="dw-pill">${n != null ? `<b>${esc(String(n))}</b>` : ''}${esc(l)}</span>`;
  const row = (lab, inner) => `<div class="dw-row"><span class="dw-rl">${esc(lab)}</span><div class="dw-rv">${inner}</div></div>`;
  const long = st.brief && st.brief.length > 190;
  return `<div class="dw-story">${o.label === false ? '' : `<p class="label">${T('Plan du deck')}</p>`}${st.brief && fr ? `<div class="dw-brief${long ? ' clamp' : ''}"><svg class="i" aria-hidden="true"><use href="#i-info"/></svg><div><p>${esc(st.brief)}</p>${long ? `<button class="link-btn link-inline" type="button" data-brief-more aria-expanded="false"><span class="m">${T('Lire tout')}</span><span class="l">${T('Réduire')}</span></button>` : ''}</div></div>` : ''}
    <div class="dw-rows">${tags.length ? row(T('Thèmes'), tags.map(([n, l]) => pill(n, l)).join('')) : ''}
    ${st.engines.length ? row(T('Moteurs'), `<ul class="dw-eng">${st.engines.map(e => { const byCards = e.ai && !fr, head = byCards ? e.cards.slice(0, 2).join(' + ') : e.label, rest = byCards ? e.cards.slice(2, 4) : e.cards.slice(0, 3); return `<li><b>${esc(head)}</b>${rest.length ? `<small>${esc(rest.join(', '))}</small>` : ''}</li>`; }).join('')}</ul>`) : ''}
    ${st.wincons.length ? row(T('Pour gagner'), st.wincons.slice(0, 4).map(n => pill(null, n)).join('')) : `<p class="hint warn">${esc(T('Aucune condition de victoire claire : ajoute une carte qui peut finir la partie.'))}</p>`}</div>
    ${st.notes.map(n => `<p class="hint">${esc(n)}</p>`).join('')}</div>`;
}
if (typeof document !== 'undefined') document.addEventListener('click', e => {      // « Lire tout » / « Réduire » le texte du plan (sans redessiner l'écran)
  const b = e.target.closest && e.target.closest('[data-brief-more]'); if (!b) return;
  const box = b.closest('.dw-brief'), open = !box.classList.contains('open'); box.classList.toggle('open', open); b.setAttribute('aria-expanded', String(open)); haptic('tap');
});
/** Analyse d'un deck (deckana.js) : ce que fait le deck d'après la fiche du commandant et les mécaniques. → { story (plan, sans titre), rows (points : cœur du plan,
 *  conditions de victoire, moteurs incomplets, pièges, cartes isolées), warn (nombre de points à revoir), good } ; null sans classement. */
function dwAuditParts(X) {
  const au = typeof dwDeckAudit === 'function' ? dwDeckAudit(X) : null; if (!au) return null;
  const li = (cls, t, cards) => `<li class="${cls}"><b>${esc(t)}</b> <small>${esc(cards.join(', '))}</small></li>`, rows = []; let warn = 0, good = 0;
  if (au.core.length) { rows.push(li('good', T('Cœur du plan présent'), au.core.slice(0, 6))); good++; }
  if (au.wins.length) { rows.push(li('good', T('Conditions de victoire du plan'), au.wins.slice(0, 4))); good++; }
  const fr = typeof I18N === 'undefined' || !I18N.lang || I18N.lang === 'fr';      // nom du moteur de la fiche : écrit en français ; ailleurs, ses cartes déjà là
  for (const e of au.engines) { rows.push(li('warn', e.ai && !fr ? T('Moteur incomplet ({c}) : il manque', { c: e.have.slice(0, 2).join(' + ') }) : T('Moteur « {e} » incomplet : il manque', { e: e.label }), e.miss.slice(0, 3))); warn++; }
  if (au.traps.length) { rows.push(li('warn', T('Marchent mal avec ce commandant'), au.traps.slice(0, 5))); warn++; }
  if (au.trapOk && au.trapOk.length) { rows.push(li('good', T('Gardées : elles marchent mal avec le commandant, mais servent avec une autre carte'), au.trapOk.slice(0, 4).map(t => t.kind === 'combo' ? T('{card} (combo avec {c})', { card: t.name, c: t.with.join(' + ') }) : T('{card} (moteur avec {c})', { card: t.name, c: t.with.slice(0, 2).join(', ') })))); good++; }
  if (au.loose.length) { rows.push(li('warn', T('Ne servent ni le plan ni un rôle'), au.loose)); warn++; }
  return { story: dwStoryHtml(au.story, { label: false }), rows: rows.length ? `<ul class="cb-pts dw-audit">${rows.join('')}</ul>` : '', warn, good };
}
/** Analyse d'un deck, en un bloc (titre, plan, points). */
function dwAuditHtml(X) {
  const a = dwAuditParts(X); if (!a) return '';
  return `<div class="sec-title">${T('Ce que fait ton deck')}</div>${a.story}${a.rows}`;
}
/** En-tête repliable d'une section (Équilibre du deck…) : titre, résumé d'une ligne, « Masquer » / « Afficher ». attr : action du bouton (coach ou analyse). */
const dwFoldHead = (id, open, title, sum, attr) => `<button class="dw-set-h dw-fold" type="button" ${attr} aria-expanded="${open}"><span><b>${esc(title)}</b>${sum ? `<small>${esc(sum)}</small>` : ''}</span><span class="me-v">${open ? T('Masquer') : T('Afficher')}</span></button>`;
/** Résumé de l'équilibre : catégories dans la norme. */
function dwBalSum(prof, tgt, cmd) {
  const gs = DW_GAUGES.filter(([r]) => r !== 'counter' || (cmd && cmd.ci.includes('U'))), ok = gs.filter(([r]) => tgt[r] && prof[r] >= tgt[r][0] && prof[r] <= tgt[r][2] + (r === 'land' ? 0 : 3)).length;
  return TN(ok, '{n} catégorie sur {b} dans la norme', '{n} catégories sur {b} dans la norme', { b: gs.length });
}
function dwSetHtml(cmd, pack) {
  const s = BD.wiz, th = dwThemeChoices(cmd, pack), cur = mkCur();
  const brName = (DW_BRACKETS.find(b => b[0] === s.br) || DW_BRACKETS[2])[1];
  const sum = [s.th.length ? s.th.map(t => dwThemeLabel(t, th)).join(', ') : T('aucun thème'), T('bracket {n}', { n: s.br }) + ' · ' + brName, s.bud > 0 ? T('budget {p}', { p: fmt(s.bud, cur) }) : T('sans budget'), dwPersoSum(s)].filter(Boolean).join(' · ');
  let h = `<button class="dw-set-h" type="button" data-act="dw-set" aria-expanded="${DW.setOpen}"><span><b>${T('Réglages du coach')}</b><small>${esc(sum)}</small></span><span class="me-v">${DW.setOpen ? '−' : '+'}</span></button>`;
  if (!DW.setOpen) return h;
  h += `<div class="dw-set"><p class="label">${T('Thèmes (3 au plus)')}</p><div class="dw-chips">${th.length ? th.map(([slug, label]) => `<button type="button" class="chip${s.th.includes(slug) ? ' on' : ''}" data-act="dw-th" data-v="${esc(slug)}" aria-pressed="${s.th.includes(slug)}">${esc(label)}</button>`).join('') : `<span class="hint">${T('Thèmes pas encore chargés.')}</span>`}</div>
    <p class="label">${T('Bracket')}</p><div class="dw-chips">${DW_BRACKETS.map(b => `<button type="button" class="chip${s.br === b[0] ? ' on' : ''}" data-act="dw-br" data-v="${b[0]}" aria-pressed="${s.br === b[0]}">${b[0]} · ${esc(b[1])}</button>`).join('')}</div>
    <p class="hint">${esc(T((DW_BRACKETS.find(b => b[0] === s.br) || DW_BRACKETS[2])[2]))}</p>
    <div class="field-in"><label class="label" for="dwBud">${T('Budget du deck ({c})', { c: cur })}</label><input type="number" id="dwBud" inputmode="decimal" min="0" step="10" placeholder="${T('Sans limite')}" value="${s.bud > 0 ? Math.round(s.bud / 100) : ''}"></div>
    <label class="me-row switch-row" for="dwOwn"><span class="me-t">${T('Priorité à ma collection')}<small>${T('Les cartes que tu possèdes passent devant dans les suggestions')}</small></span><span class="switch"><input type="checkbox" id="dwOwn" ${s.own ? 'checked' : ''}><i></i></span></label>
    <div class="dw-perso" data-perso="coach">${dwPersoHtml(s, cmd, 'dwp')}</div></div>`;
  return h;
}
/* ── Personnalisation (assistant et réglages du Coach) : mécaniques, type de créature, cartes fétiches, cartes et styles exclus, originalité ── */
/** Bloc de personnalisation. s : réglages (DWZ ou BD.wiz) ; cmd : commandant ({ keys, names, ci }) ; px : préfixe des identifiants ('dwz' assistant, 'dwp' Coach). */
function dwPersoHtml(s, cmd, px) {
  if (typeof dmxOn !== 'function' || !dmxOn()) return `<p class="hint">${DW.core ? T('Personnalisation par mécaniques : arrive avec la prochaine base du coach.') : T('Chargement de la base du coach…')}</p>`;
  const det = cmd ? dmxCmdTags(cmd) : [], all = s._allMech ? DMX_PICK : DMX_PICK.slice(0, 18), mech = [...new Set([...det, ...(s.mech || []), ...all])];
  const chip = (attr, v, on, label) => `<button type="button" class="chip${on ? ' on' : ''}" ${attr}="${esc(v)}" aria-pressed="${on}">${esc(label)}</button>`;
  const tribes = [...dmxTribes().keys()].slice(0, 120), ct = cmd ? dmxCmdTribes(cmd) : [];
  const shown = dwShownName;      // nom dans la langue de l'appli (sinon des cartes, sinon anglais) ; le réglage garde le nom anglais
  const list = (l, attr) => l.length ? `<div class="dw-chips">${l.map(n => `<button type="button" class="chip on" ${attr}="${esc(n)}" aria-label="${esc(T('Retirer {name}', { name: shown(n) }))}">${esc(shown(n))} ×</button>`).join('')}</div>` : '';
  const o = Number.isFinite(s.orig) ? s.orig : DW_ORIG0;
  return `<p class="label">${T('Mécaniques à mettre en avant (4 au plus)')}</p>${det.length ? `<p class="hint">${esc(T('Repérées pour ce commandant : {m}', { m: det.map(dmxLabel).join(', ') }))}</p>` : ''}
    <div class="dw-chips">${mech.map(t => chip('data-pm', t, (s.mech || []).includes(t), dmxLabel(t))).join('')}${s._allMech ? '' : `<button type="button" class="chip" data-pm-all="1">${T('Toutes les mécaniques')}</button>`}</div>
    <div class="field-in"><label class="label" for="${px}Tribe">${T('Type de créature (tribal)')}</label><input type="text" id="${px}Tribe" list="${px}TribeL" maxlength="30" autocomplete="off" placeholder="${esc(ct[0] || 'Elf, Dragon, Zombie…')}" value="${esc(s.tribe || '')}"><datalist id="${px}TribeL">${tribes.map(t => `<option value="${esc(t)}">`).join('')}</datalist></div>
    ${ct.length && !s.tribe ? `<div class="dw-chips">${ct.slice(0, 3).map(t => chip('data-ptr', t, false, t)).join('')}</div>` : ''}
    <div class="field-in"><label class="label" for="${px}PetQ">${T('Cartes fétiches à inclure')}</label><input type="search" id="${px}PetQ" data-pq="pets" autocomplete="off" spellcheck="false" placeholder="${esc(dwNamesPh())}"></div><div class="dw-pres" data-pres="pets"></div>${list(s.pets || [], 'data-ppx')}
    <div class="field-in"><label class="label" for="${px}BanQ">${T('Cartes à exclure')}</label><input type="search" id="${px}BanQ" data-pq="ban" autocomplete="off" spellcheck="false" placeholder="${esc(dwNamesPh())}"></div><div class="dw-pres" data-pres="ban"></div>${list(s.ban || [], 'data-pbx')}
    <p class="label">${T('Styles à éviter')}</p><div class="dw-chips">${DMX_AVOID.map(([id, l]) => chip('data-pa', id, (s.avoid || []).includes(id), T(l))).join('')}</div>
    <div class="field-in"><label class="label" for="${px}Orig">${T('Originalité : {v} %', { v: o })}</label><input type="range" id="${px}Orig" min="0" max="100" step="10" value="${o}"><p class="hint">${esc(o <= 20 ? T('Classique : les cartes qui ont fait leurs preuves avec ce commandant.') : o >= 70 ? T('Trouvailles : moins de staples, des cartes peu jouées qui font exactement ce que veut ton deck.') : T('Équilibré : des valeurs sûres et quelques trouvailles.'))}</p></div>`;
}
/** Index des noms imprimés dans la LANGUE DE L'APPLI (recherche des cartes fétiches et à exclure) : celui de l'appli quand il est déjà dans cette langue (FRX.ix),
 *  sinon le sien, lu une fois (même catalogue que les noms de la collection : scryFrCached / scryFrStatic), sans toucher à celui de la collection. null tant qu'il n'est pas prêt. */
const DWN = { l: '', ix: null, p: null, fail: 0 };
const dwNamesLang = () => typeof NAMES_LANGS !== 'undefined' && NAMES_LANGS.includes(I18N.lang) ? I18N.lang : '';
function dwNamesIx() {
  const l = dwNamesLang(); if (!l) return null;
  if (typeof FRX !== 'undefined' && FRX.l === l && FRX.ix) return FRX.ix;
  if (DWN.l === l && DWN.ix) return DWN.ix;
  if (DWN.l !== l) { DWN.l = l; DWN.ix = null; DWN.fail = 0; }
  if (!DWN.p && Date.now() - DWN.fail > 60000 && typeof scryFrStatic === 'function' && typeof frIndex === 'function') DWN.p = (async () => {
    const rec = (await scryFrCached(l).catch(() => null)) || await scryFrStatic(undefined, l).catch(() => null);
    if (!rec || DWN.l !== l) { DWN.fail = Date.now(); return; }
    const ix = frIndex([]); for (let i = 0; i < rec.rows.length; i += 2500) { frIndex(rec.rows.slice(i, i + 2500), ix); await new Promise(r => setTimeout(r, 0)); }
    if (DWN.l === l) DWN.ix = ix;
  })().catch(() => { DWN.fail = Date.now(); }).finally(() => { DWN.p = null; });
  return null;
}
/** Nom d'une carte dans la langue de l'appli (sinon dans celle des cartes, sinon anglais). */
const dwShownName = n => { const k = ownKey(n), ix = dwNamesIx(); return (ix && ix.fr && ix.fr.get(k)) || (typeof frOf === 'function' && frOf(k)) || n; };
/** Libellé du champ de recherche : « Nom français ou anglais », « Nom en allemand ou en anglais »… selon la langue de l'appli. */
const dwNamesPh = () => { const l = dwNamesLang(); return l === 'fr' ? T('Nom français ou anglais') : l ? T('Nom en {lang} ou en anglais', { lang: (typeof LANGS !== 'undefined' && LANGS[l]) || l }) : T('Nom de la carte'); };
/** Cartes trouvées pour une recherche (fétiches : dans les couleurs du commandant), par le nom anglais, le nom dans la langue de l'appli et celui dans la
 *  langue des cartes (index FRX.ix de la collection). → [[clé, nom anglais, rang du mot, rang EDHREC, libellé affiché]] */
function dwPersoFind(q, cmd, kind) {
  const w = ownKey(q || ''); if (!w || w.length < 2 || !DW.byKey) return [];
  const ci = cmd ? new Set([...cmd.ci]) : null, out = new Map();
  const take = (k, r, pos, label) => { if (r[6] & 16) return; if (kind === 'pets' && ci && [...String(r[1])].some(c => !ci.has(c))) return; const o = out.get(k); if (!o || pos < o[2] || (label && o[4] === r[0])) out.set(k, [k, r[0], Math.min(pos, o ? o[2] : 9), r[8] || 99999, label || (o && o[4]) || r[0]]); };
  for (const [k, r] of DW.byKey) if (k.includes(w)) take(k, r, k.startsWith(w) ? 0 : 1);
  const wp = normPart(q), cardIx = typeof FRX !== 'undefined' ? FRX.ix : null;
  for (const ix of [...new Set([dwNamesIx(), cardIx])]) if (ix && ix.list && wp.length >= 2) for (const e of ix.list) { if (!e.k.includes(wp)) continue; const k = ownKey(e.en), r = DW.byKey.get(k); if (r) take(k, r, e.k.startsWith(wp) ? 0 : 1, e.n); }      // nom imprimé (« Anneau solaire », « Blitzschlag »)
  if (!cardIx && typeof frLoad === 'function' && typeof namesLang === 'function' && namesLang()) frLoad();      // noms de la langue des cartes pas encore lus : la frappe suivante en profite
  return [...out.values()].sort((a, b) => a[2] - b[2] || a[3] - b[3]).slice(0, 6);
}
const dwPersoRes = (list, kind) => list.map(([, n, , , label]) => `<button type="button" class="chip" data-padd="${kind}" data-n="${esc(n)}"${label && label !== n ? ` title="${esc(n)}"` : ''}>+ ${esc(label || n)}</button>`).join('');      // nom imprimé affiché, nom anglais gardé (réglages, base du coach)
/** Clic dans le bloc : vrai si traité (s modifié). */
function dwPersoClick(e, s) {
  const t = e.target.closest('[data-pm],[data-pm-all],[data-ptr],[data-ppx],[data-pbx],[data-pa],[data-padd]'); if (!t) return false;
  const tog = (l, v, max) => { const i = l.indexOf(v); if (i >= 0) l.splice(i, 1); else if (l.length < max) l.push(v); else toast(T('{n} au plus', { n: max })); };
  if (t.dataset.pmAll) s._allMech = true;
  else if (t.dataset.pm) tog(s.mech = s.mech || [], t.dataset.pm, 4);
  else if (t.dataset.ptr) s.tribe = t.dataset.ptr;
  else if (t.dataset.ppx) s.pets = (s.pets || []).filter(n => n !== t.dataset.ppx);
  else if (t.dataset.pbx) s.ban = (s.ban || []).filter(n => n !== t.dataset.pbx);
  else if (t.dataset.pa) tog(s.avoid = s.avoid || [], t.dataset.pa, 12);
  else if (t.dataset.padd) { const k = t.dataset.padd, l = s[k] = s[k] || []; if (!l.includes(t.dataset.n)) { if (l.length >= (k === 'pets' ? 20 : 40)) toast(T('{n} au plus', { n: k === 'pets' ? 20 : 40 })); else l.push(t.dataset.n); } }
  haptic('tap'); return true;
}
/** Saisie dans le bloc (recherche de cartes, type de créature, originalité) : vrai si traitée ; repaint : vrai s'il faut redessiner.
 *  Recherche de cartes : résultats redessinés à la frappe seulement ; « change » (champ qui perd le focus quand on touche un résultat) ne redessine rien,
 *  sinon le bouton touché disparaissait sous le doigt et la carte n'était ajoutée qu'au 2e appui. */
function dwPersoInput(e, s, cmd) {
  const t = e.target; if (!t || !t.id) return false;
  if (t.dataset.pq) { if (e.type !== 'input') return 'live'; const box = t.closest('.field-in') && t.closest('.field-in').nextElementSibling; if (box && box.dataset.pres) box.innerHTML = dwPersoRes(dwPersoFind(t.value, cmd, t.dataset.pq), t.dataset.pq); return 'live'; }
  if (/Tribe$/.test(t.id)) { s.tribe = String(t.value || '').trim().slice(0, 30); return e.type === 'change'; }
  if (/Orig$/.test(t.id)) { s.orig = Math.max(0, Math.min(100, Math.round(Number(t.value) || 0))); return e.type === 'change'; }
  return false;
}
/** Résumé de la personnalisation (une ligne). */
function dwPersoSum(s) {
  const b = [];
  if ((s.mech || []).length) b.push(s.mech.map(t => typeof dmxLabel === 'function' ? dmxLabel(t) : t).join(', '));
  if (s.tribe) b.push(s.tribe);
  if ((s.pets || []).length) b.push(TN(s.pets.length, '{n} carte fétiche', '{n} cartes fétiches'));
  if ((s.ban || []).length || (s.avoid || []).length) b.push(TN((s.ban || []).length + (s.avoid || []).length, '{n} exclusion', '{n} exclusions'));
  if (Number.isFinite(s.orig) && s.orig !== DW_ORIG0) b.push(T('originalité {v} %', { v: s.orig }));
  return b.join(' · ');
}
/** Thèmes proposés : ceux du commandant (EDHREC, du plus au moins joué), puis les thèmes généraux de la base. → [[slug, libellé]] */
function dwThemeChoices(cmd, pack, set = BD.wiz) {
  const out = new Map();
  for (const t of (pack && pack.thl) || []) if (t[0]) out.set(t[0], t[1]);
  for (const t of (cmd && cmd.th) || []) if (t[0] && !out.has(t[0])) out.set(t[0], t[1]);
  for (const t of (set && set.th) || []) if (!out.has(t)) out.set(t, t);
  return [...out].slice(0, 14).map(([s, l]) => [s, typeof edhThemeName === 'function' ? edhThemeName({ label: l }) : l]);
}
const dwThemeLabel = (slug, list) => { const f = list.find(t => t[0] === slug); return f ? f[1] : slug; };
/** ro : lecture seule (analyse d'un deck) : pas de suggestions dépliables. */
function dwGaugesHtml(prof, tgt, cmd, pack, ro) {
  return DW_GAUGES.filter(([r]) => r !== 'counter' || (cmd && cmd.ci.includes('U'))).map(([r, label, help]) => {
    const n = prof[r], [lo, mid, hi] = tgt[r], st = n < lo ? (n < lo - 3 ? 'bad' : 'low') : n > hi + (r === 'land' ? 0 : 3) ? 'high' : 'ok';
    const max = Math.max(hi + 2, n, 1), pct = v => Math.max(0, Math.min(100, v / max * 100));
    const open = !ro && DW.open === r, miss = Math.max(0, mid - n), tag = ro ? 'div' : 'button';
    const lbl = (st === 'ok' ? T('ok') : st === 'high' ? T('beaucoup') : TN(miss, 'il en manque {n}', 'il en manque {n}')) + (r === 'land' && prof.mdfc ? ' · ' + landMdfcText(prof.mdfc) : '');      // doubles faces comptées comme terrains, annoncées
    let h = `<div class="dw-g ${st}${open ? ' open' : ''}"><${tag} ${ro ? '' : `type="button" data-act="dw-g" data-r="${r}" aria-expanded="${open}" `}class="dw-gh" title="${esc(T(help))}">
      <span class="dw-gl"><b>${T(label)}</b><small>${esc(lbl)}</small></span><span class="dw-gn"><b>${nf0(n)}</b> / ${mid}</span>
      <span class="dw-bar" aria-hidden="true"><i class="dw-rng" style="left:${pct(lo)}%;width:${Math.max(2, pct(hi) - pct(lo))}%"></i><i class="dw-val" style="width:${pct(n)}%"></i></span></${tag}>`;
    if (open) h += `<div class="dw-gb"><p class="hint">${esc(T(help))} ${esc(T('Repère : {lo} à {hi}.', { lo, hi }))}</p>${r === 'land' ? dwLandHelp(prof, tgt, cmd) : ''}${dwSugHtml(r, cmd, pack, prof, tgt)}</div>`;
    return h + '</div>';
  }).join('');
}
function dwLandHelp(prof, tgt, cmd) {
  const basics = [...BD.main.values()].filter(c => BASIC_NAMES.has(c.key)).reduce((a, c) => a + c.qty, 0);
  const txt = prof.nonland >= 25 ? T('Coût moyen {mv}, {c} sorts de rampe ou de pioche à 2 mana ou moins : {n} terrains conseillés.', { mv: num(prof.mv, 2), c: prof.cheap, n: tgt.land[1] }) : T('Ajoute d\'abord tes sorts : la cible des terrains suivra le coût moyen du deck.');
  return `<p class="hint">${esc(txt)}</p>${cmd && cmd.ci ? `<button class="btn ghost small" type="button" data-act="dw-basics">${T('Compléter avec des terrains de base')}</button>` : ''}${basics ? `<p class="hint">${TN(basics, '{n} terrain de base dans le deck.', '{n} terrains de base dans le deck.')}</p>` : ''}`;
}
function dwSugHtml(role, cmd, pack, prof, tgt) {
  if (!DW.core) return '';
  if (!pack && DW.cmdP.has(cmd.slug)) return `<p class="hint">${T('Chargement des cartes conseillées…')}</p>`;
  const list = dwSuggest(role, cmd, pack, prof, tgt, DW.shown);
  if (!list.length) return `<p class="hint">${T('Aucune suggestion dans tes couleurs, ton bracket et ton budget.')}</p>`;
  BD.want = list.map(s => ({ key: s.k, name: s.name })); bdMetaSoon();
  const full = prof.n >= 100 ? `<p class="hint">${T('Deck complet : pour chaque carte ajoutée, retires-en une (« Coach » dans le viewer propose des échanges).')}</p>` : '';
  return full + `<div class="dw-sug">${list.map(s => dwSugRow(s, cmd)).join('')}</div>${list.length >= DW.shown ? `<button class="link-btn" type="button" data-act="dw-more">${T('Plus de suggestions')}</button>` : ''}`;
}
function dwSugRow(s, cmd) {
  const k = s.k, m = bdMeta(k), x = COLL.map[k], nm = bdLabel(k, s.name), hue = hash32(k) % 360, img = m && m.im ? collImage(k, x ? x.l : '', m.im).src : zoomUrl(s.name, 'small');      // fiche pas encore lue : image Scryfall par le nom
  const why = dwWhy(s, cmd), price = s.price > 0 ? fmt(s.price, mkCur()) : '';
  return `<div class="crow bd-row dw-row" data-k="${esc(k)}" data-n="${esc(s.name)}" data-t="main"><span class="thumb" style="--h:${hue}"${zoomAt('bd', nm)}>${esc((nm.trim()[0] || '?').toUpperCase())}${img ? `<img alt="" loading="lazy" decoding="async" ${cardImgA(k, s.name, img, x ? x.l || '' : '')}>` : ''}</span>
    <span class="row-main"><span class="row-top"><span class="row-name">${esc(nm)}</span>${price ? `<span class="dw-px">${esc(price)}</span>` : ''}</span><span class="row-meta">${bdTags(k, 0, 'coll')}</span>${why ? `<span class="dw-why">${esc(why)}</span>` : ''}</span>
    <span class="qstep dw-add"><button type="button" data-d="1" aria-label="${T('Ajouter {name} au deck', { name: esc(nm) })}">+</button></span></div>`;
}
function dwManaHtml(prof, tgt, cmd) {
  const cols = [...(cmd ? cmd.ci : '')]; let h = `<div class="sec-title">${T('Mana')}</div><div class="dw-mana">`;
  const avg = prof.nonland ? num(prof.mv, 2) : '—';
  h += `<p class="dw-line"><span>${T('Coût moyen (hors terrains)')}</span><b>${avg}</b><small>${T('repère {v}', { v: num(tgt.mv[1], 1) })}</small></p>`;
  const mx = Math.max(1, ...prof.curve);
  h += `<div class="dw-curve" role="img" aria-label="${esc(T('Courbe de mana'))}">${prof.curve.map((n, i) => `<span><i style="height:${Math.round(n / mx * 100)}%"></i><b>${n}</b><small>${i === 7 ? '7+' : i}</small></span>`).join('')}</div>`;
  if (cols.length) {
    h += `<p class="label">${T('Sources de chaque couleur')}</p><div class="dw-src">`;
    for (const c of cols) {
      const need = prof.need[c] || 0, have = Math.round((prof.src[c] || 0) * 10) / 10, ok = !need || have >= need;
      h += `<span class="dw-sc ${ok ? 'ok' : 'low'}"><i class="pip ${c}" aria-hidden="true"></i><b>${nf0(have)}</b>${need ? `<small>/ ${need}</small>` : ''}</span>`;
    }
    h += `</div><p class="hint">${T('Terrains et rampe qui produisent la couleur (rampe : une demi-source). Repère de Frank Karsten pour lancer à temps ton commandant et tes sorts les plus exigeants : 19 sources pour un sort à 1 symbole tôt dans la partie, 30 pour 2 symboles, 36 pour 3.')}</p>`;
  }
  return h + '</div>';
}
function dwBracketHtml(prof, s = BD.wiz) {
  const b = DW_BRACKETS.find(x => x[0] === s.br) || DW_BRACKETS[2], R = DWB.brRule(b[0]), out = DWB.bracketBreaks(b[0], dwBrFacts(prof)).map(x => [x.lv, x.t]);      // LA table (brackets.js) : même verdict que l'éditeur (dkCheck), la note et le générateur
  const c2 = prof.combos.filter(c => !dwCombo3(c)), c3 = prof.combos.filter(dwCombo3), has3 = !!(DW.core && DW.core.combos3 && DW.core.combos3.length);
  if (!c2.length && R.c2 !== 'ok') out.push(!(DW.core && DW.core.combos && DW.core.combos.length) ? ['info', T('Les combos à 2 cartes ne sont pas vérifiés : à surveiller toi-même.')] : !c3.length ? ['ok', has3 ? T('Aucun combo à 2 ou 3 cartes connu (Commander Spellbook)') : T('Aucun combo à 2 cartes connu (Commander Spellbook)')] : null);
  return `<div class="sec-title">${T('Bracket {n} · {name}', { n: b[0], name: b[1] })}</div><ul class="bd-issues dw-br">${out.filter(Boolean).map(([lv, t]) => `<li class="${lv === 'info' ? '' : lv}">${esc(t)}</li>`).join('')}<li class="ok">${esc(R.gc > 10 ? TN(prof.gc.length, '{n} Game Changer, sans limite dans ce bracket', '{n} Game Changers, sans limite dans ce bracket') : TN(prof.gc.length, '{n} Game Changer sur {max} permis', '{n} Game Changers sur {max} permis', { max: R.gc }))}</li></ul>`;
}
function dwBudgetHtml(prof, s = BD.wiz) {
  const cur = mkCur(); if (!(s.bud > 0) && !prof.cents) return '';
  const pct = s.bud > 0 ? Math.min(100, Math.round(prof.cents / s.bud * 100)) : 0, over = s.bud > 0 && prof.cents > s.bud;
  const cc = prof.cmdCents || 0, dear = s.bud > 0 && cc >= s.bud * 0.6 ? `<p class="hint warn">${esc(T('Ton commandant vaut déjà {p} sur {b} : avec ce budget, le deck restera incomplet ou très faible. Monte le budget ou choisis un autre commandant.', { p: fmt(cc, cur), b: fmt(s.bud, cur) }))}</p>` : '';
  const small = !dear && s.bud > 0 && s.bud < 7500 ? `<p class="hint">${esc(T('Petit budget : le coach garde l\'essentiel (de quoi gagner, interaction, mana) mais certaines cartes ne seront pas les meilleures, et les couleurs moins bien servies qu\'avec des terrains plus chers.'))}</p>` : '';
  return `<div class="sec-title">${T('Budget')}</div><div class="dw-bud${over ? ' over' : ''}">${dear}${small}<p class="dw-line"><span>${T('Valeur du deck')}</span><b>${esc(fmt(prof.cents, cur))}</b>${s.bud > 0 ? `<small>/ ${esc(fmt(s.bud, cur))}</small>` : ''}</p>
    ${s.bud > 0 ? `<span class="dw-bar"><i class="dw-val" style="width:${pct}%"></i></span>` : ''}<p class="hint">${esc(T('Dont {p} à acheter (cartes que ta collection n\'a pas).', { p: fmt(prof.buy, cur) }))}</p>${over ? `<p class="hint">${esc(T('Au-dessus du budget : les suggestions ne proposent plus de cartes plus chères que ce qui reste.'))}</p>` : ''}${over && s === BD.wiz && BD.el && DW.core ? `<div class="dx-acts dw-bud-acts"><button class="btn ghost small" type="button" data-act="dw-goto" data-v="swaps">${T('Voir les échanges')}</button><button class="btn small" type="button" data-act="dw-regen">${T('Reconstruire avec ce budget')}</button></div><p class="hint">${esc(T('Reconstruire : le coach refait le deck autour du commandant, dans ce budget et tes réglages. Annulable.'))}</p>` : ''}</div>`;
}
function dwPlanHtml(cmd, pack, prof, tgt) {
  const open = DW.open === 'plan';
  let h = `<div class="sec-title">${T('Plan de jeu et synergies')}</div><div class="dw-g${open ? ' open' : ''}"><button type="button" class="dw-gh" data-act="dw-g" data-r="plan" aria-expanded="${open}"><span class="dw-gl"><b>${T('Cartes clés du commandant')}</b><small>${esc(T('les plus jouées et les plus en synergie avec lui'))}</small></span><span class="me-v">${open ? '−' : '+'}</span></button>`;
  if (open) h += `<div class="dw-gb">${dwSugHtml('', cmd, pack, prof, tgt)}</div>`;
  return h + '</div>';
}
/** Terrains de base pour atteindre la cible : d'abord les couleurs sous leur repère de sources (Karsten, terrains non-base et rampe comptés),
 *  puis au prorata des symboles de mana des sorts. Commandant incolore : Wastes. */
function dwFillBasics(quiet) {
  const cmd = dwCmdOf(); if (!cmd) return 0;
  const prof = dwProfile(), tgt = dwTargets(prof, cmd, DW.cmd.get(cmd.slug) || null);
  const BK = { W: 'plains', U: 'island', B: 'swamp', R: 'mountain', G: 'forest', C: 'wastes' }, EN = { W: 'Plains', U: 'Island', B: 'Swamp', R: 'Mountain', G: 'Forest', C: 'Wastes' };
  const cols = cmd.ci ? [...cmd.ci] : ['C'], qOf = c => (BD.main.get(BK[c]) || {}).qty || 0, curB = cols.reduce((a, c) => a + qOf(c), 0);
  const cut = [], before = quiet ? null : new Map([...BD.main].map(([k, c]) => [k, { ...c }]));      // « Annuler » du message
  if (!quiet && prof.land < tgt.land[1] && prof.n >= 100) {      // deck complet : les sorts les moins utiles (base du coach) cèdent leur place, sans passer un rôle sous son minimum ni retirer la dernière condition de victoire
    const info = dwInfo(DW.cmd.get(cmd.slug) || null, BD.wiz || dwDefaults(), cmd), cnt = { ...prof }, cmdK = new Set(BD.cmdr.map(c => c.key)), pets = new Set(((BD.wiz || {}).pets || []).map(n => ownKey(n)));
    const cand = [...BD.main.values()].filter(c => !cmdK.has(c.key) && !BASIC_NAMES.has(c.key) && !pets.has(c.key))      // cartes fétiches : jamais retirées.map(c => ({ c, x: dwCard(c.key) })).filter(o => o.x && !(o.x.roles & DW_RB.land))
      .map(o => ({ ...o, v: dwVal(info.get(o.c.key) || {}) })).sort((a, b) => a.v - b.v);
    for (const o of cand) {
      if (cut.length >= tgt.land[1] - prof.land) break;
      const roles = DKW_ROLES.filter(r => r !== 'land' && o.x.roles & DW_RB[r]);
      if (roles.some(r => cnt[r] - 1 < (tgt[r] ? tgt[r][0] : 0)) || (o.x.roles & DW_RB.wincon && cnt.wincon <= 1)) continue;
      for (const r of roles) cnt[r]--;
      cut.push(o.c.name); const q = o.c.qty || 1; if (q > 1) BD.main.set(o.c.key, { ...o.c, qty: q - 1 }); else BD.main.delete(o.c.key);
    }
    if (cut.length) prof.n -= cut.length;
  }
  const want = Math.max(0, tgt.land[1] - (prof.land - curB)), room = 100 - (prof.n - curB), n = Math.max(0, Math.min(want, room));
  const src = Object.fromEntries(cols.map(c => [c, (prof.src[c] || 0) - qOf(c)])), share = Object.fromEntries(cols.map(c => [c, 0]));
  const pip = c => Math.max(prof.pips[c] || 0, 0.5), need = c => prof.need[c] || 0;
  for (let i = 0; i < n; i++) {
    let best = cols[0], bs = -Infinity;
    for (const c of cols) { const d = need(c) - (src[c] + share[c]), sc = d > 0 ? 1000 + d / Math.max(1, need(c)) : pip(c) / (share[c] + 1); if (sc > bs) { bs = sc; best = c; } }
    share[best]++;
  }
  cols.forEach(c => { if (share[c] > 0) BD.main.set(BK[c], { key: BK[c], name: EN[c], qty: share[c] }); else BD.main.delete(BK[c]); });
  BD.dirty = true; if (quiet) return n;
  haptic('ok'); bdPaint(); bdMetaSoon();
  if (cut.length) toast(TN(cut.length, '{n} terrain de base ajouté à la place de : {cards}', '{n} terrains de base ajoutés à la place de : {cards}', { cards: cut.join(', ') }), { label: T('Annuler'), fn: () => { BD.main = before; BD.dirty = true; haptic('tap'); bdPaint(); } });
  else if (n > curB) toast(TN(n - curB, '{n} terrain de base ajouté', '{n} terrains de base ajoutés'));
  else toast(prof.land >= tgt.land[1] ? T('Assez de terrains : rien à ajouter') : TN(n, '{n} terrain de base dans le deck', '{n} terrains de base dans le deck'));
  return n;
}
/** « Générer le deck » : complète jusqu'à 100 cartes (les cartes déjà là restent), avec les mêmes règles que les suggestions (couleurs, bracket, Game Changers,
 *  combos, budget, collection d'abord) : 1. chaque rôle jusqu'à sa cible (rampe, pioche, retraits, balayages, contresorts, protection, tuteurs, récursion,
 *  conditions de victoire) ; 2. le plan de jeu (cartes les plus jouées et en synergie avec le commandant et les thèmes) ; 3. les terrains : formule de Karsten
 *  sur le deck obtenu (des cartes ajoutées les moins utiles cèdent leur place si la cible monte), terrains non-base les plus joués et ceux qui comblent les couleurs
 *  en manque (un quart à 60 % des terrains selon le nombre de couleurs), puis terrains de base ; 4. places restantes : plan, puis cartes très jouées dans les couleurs.
 *  Annulable. */
/** Cartes fétiches (réglages : pets) mises dans le deck X : celles qui respectent les couleurs, les cartes interdites et les règles du bracket. → { in: [noms], out: [noms] } */
function dwPetsInto(X, cmd) {
  const set = X.wiz || dwDefaults(), got = { in: [], out: [] }; if (!cmd || !(set.pets || []).length || !DW.byKey) return got;
  const ci = new Set([...cmd.ci]), R = DWB.brRule(set.br), inX = k => X.main.has(k) || X.cmdr.some(c => c.key === k);
  for (const nm of set.pets) {
    const k = ownKey(nm), x = dwCard(k); if (!k || X.main.has(k) || X.cmdr.some(c => c.key === k)) continue;
    const prof = dwProfile(X), bad = !x || !DW.byKey.has(k) || [...String(x.ci)].some(c => !ci.has(c)) || x.fl & 16 || (x.fl & 1 && prof.gc.length >= R.gc) || (x.fl & 4 && !R.mld) || (x.fl & 2 && prof.xt.length >= R.xt)
      || (() => { const cw = dwComboWith(k, inX); return !!cw && (dwCombo3(cw.c) ? R.c3 === 'avoid' : R.c2 === 'no'); })();      // règles du bracket (brackets.js) : jamais la pièce qui complète un combo interdit ou à éviter
    if (bad) { got.out.push(nm); continue; }
    X.main.set(k, { key: k, name: x.name, qty: 1 }); got.in.push(x.name);
  }
  return got;
}
/** undoTo : deck à remettre si on annule (« Recréer le deck » : le deck d'avant la reconstruction). */
function dwAutoBuild(undoTo, quiet) {
  try { return dwAutoBuildRun(undoTo, quiet); } finally { BD.pace = false; BD.wide = false; BD.landRes = 0; }      // une erreur ne laisse jamais le coach en mode génération (BD est partagé)
}
function dwAutoBuildRun(undoTo, quiet) { const g = dwAutoBuildGen(undoTo, quiet); let r; do r = g.next(); while (!r.done); return r.value; }
/** La génération, carte par carte : un pas (yield) après chaque carte ajoutée ; deckopt.js › dsAutoBuild rend la main à l'écran entre deux pas. */
function* dwAutoBuildGen(undoTo, quiet) {
  const cmd = dwCmdOf(); if (!cmd || !DW.core || !BD.el) return 0;
  const pack = DW.cmd.get(cmd.slug) || null, before = undoTo || new Map([...BD.main].map(([k, c]) => [k, { ...c }])), n0 = dwProfile().n; BD.pace = true;
  dwPetsInto(BD, cmd);      // cartes fétiches d'abord (gardées comme les cartes du joueur)
  const mine = new Set(BD.main.keys());      // cartes déjà là (gardées : jamais retirées pour faire de la place)
  if (n0 <= BD.cmdr.length) { BD.wiz = BD.wiz || dwDefaults(); BD.wiz.gen = 1; dwPersist(BD.id); }      // deck construit de zéro par le coach : un changement de réglages proposera de le refaire
  const add = x => BD.main.set(x.k, { key: x.k, name: x.name, qty: 1 }), size = () => { let n = 0; for (const c of BD.main.values()) n += c.qty; return n; };
  const slots = 100 - BD.cmdr.length, nc = cmd.ci.length;
  let prof = dwProfile(), tgt = dwTargets(prof, cmd, pack);
  const landsNow = () => prof.land, nonland = () => size() - landsNow();
  const L0 = Math.max(tgt.land[1], prof.land), cap = () => slots - Math.max(L0, landsNow());
  const pick = role => { let x = dwSuggest(role, cmd, pack, prof, tgt, 1)[0]; if (!x && !(role === 'wincon' && pack && (pack.cards || []).length >= 40)) { BD.wide = true; x = dwSuggest(role, cmd, pack, prof, tgt, 1)[0]; BD.wide = false; } return x; };      // cartes du commandant, sinon les plus jouées dans ses couleurs (petit budget : les cartes conseillées sont vite trop chères)
  const bud = (BD.wiz || {}).bud || 0, share = nc <= 1 ? 0.04 : nc === 2 ? 0.12 : nc === 3 ? 0.2 : 0.25; BD.landRes = bud > 0 ? Math.round(Math.min(bud * share, Math.max(0, bud - prof.cents) * share)) : 0;      // sur ce qui reste (commandant et cartes déjà là déduits)      // budget : une part gardée pour les terrains (bicolores, tricolores), achetés après les sorts
  for (const r of ['wincon', 'ramp', 'draw', 'removal', 'wipe', 'counter', 'protect', 'tutor', 'recursion']) {      // de quoi gagner d'abord : même à petit budget, le deck doit pouvoir finir la partie
    if (!tgt[r]) continue;
    while (prof[r] < tgt[r][1] && nonland() < cap()) { const x = pick(r); if (!x) break; add(x); prof = dwProfile(); yield; }
  }
  while (nonland() < cap()) { const x = pick(''); if (!x) break; add(x); prof = dwProfile(); yield; }
  tgt = dwTargets(prof, cmd, pack);
  // la cible de terrains a monté (deck plus cher en mana que prévu) : les cartes ajoutées les moins utiles cèdent leur place
  const info = dwInfo(pack, BD.wiz || dwDefaults()), worth = k => { const o = info.get(k), x = dwCard(k) || {}; let v = o ? dwVal(o) : 0; for (const r of DKW_ROLES) if (r !== 'land' && x.roles & DW_RB[r] && tgt[r] && prof[r] <= tgt[r][0]) v += 1; return v; };
  for (let over = size() + Math.max(0, tgt.land[1] - prof.land) - slots; over > 0; over--) {
    const cut = [...BD.main.values()].filter(c => !mine.has(c.key) && !BASIC_NAMES.has(c.key) && !((dwCard(c.key) || {}).roles & DW_RB.land)).sort((a, b) => worth(a.key) - worth(b.key))[0];
    if (!cut) break; BD.main.delete(cut.key); prof = dwProfile();
  }
  tgt = dwTargets(prof, cmd, pack);
  const L = tgt.land[1], frac = nc <= 1 ? 0.25 : nc === 2 ? 0.4 : nc === 3 ? 0.5 : 0.6, basics = () => [...BD.main.values()].filter(c => BASIC_NAMES.has(c.key)).reduce((a, c) => a + c.qty, 0);
  const nb = Math.min(Math.max(0, L - prof.land), Math.round(L * frac) - (prof.land - basics()));
  BD.landRes = 0;
  const rk = x => x.o.rank || x.x.rank || 0, ncol = x => new Set([...String(x.x.prod)].filter(c => cmd.ci.includes(c))).size;
  const landOk = x => (nc < 2 || ncol(x) || x.own || (x.o.incl || 0) >= 30) && (x.own || (x.o.incl || 0) >= 15 || (rk(x) && rk(x) < 300) || (nc >= 2 && rk(x) && rk(x) < 3000 && ncol(x) >= 2));      // très joué, ou terrain bicolore et plus de ces couleurs ; deck multicolore : un terrain incolore seulement s'il est vraiment joué avec ce commandant
  BD.wide = true;      // terrains : toutes les cartes jouées dans les couleurs, pas seulement les listes du commandant (les terrains bicolores y manquent souvent)
  for (let i = 0; i < nb && size() < slots; i++) { const x = dwSuggest('land', cmd, pack, prof, tgt, 10).find(landOk); if (!x) break; add(x); prof = dwProfile(); yield; }
  BD.wide = false;
  dwFillBasics(true); prof = dwProfile();
  while (size() < slots) {      // places restantes : le plan, puis les cartes très jouées dans les couleurs (petit budget, commandant peu connu) ; sinon le deck reste incomplet (« complète à la main »)
    let x = pick('');
    if (!x) { BD.pace = false; x = pick(''); BD.pace = true; }      // rien d'assez bon marché pour étaler le budget : ce qui rentre encore dans ce qui reste
    if (!x) break; add(x); prof = dwProfile(); yield;
  }
  BD.pace = false; BD.landRes = 0;
  const added = size() - (n0 - BD.cmdr.length), total = size() + BD.cmdr.length; BD.dirty = true;
  if (quiet) return added;      // passes de la construction en plusieurs temps (deckopt.js) : ni affichage ni message
  haptic('ok'); bdPaint(); bdMetaSoon(); prof = dwProfile();
  const cur = mkCur(), msg = TN(added, '{n} carte ajoutée', '{n} cartes ajoutées') + ' · ' + T('{t} / 100', { t: total }) + (prof.cents ? ' · ' + T('valeur {p}', { p: fmt(prof.cents, cur) }) : '');
  toast(total < 100 ? msg + ' · ' + T('budget ou cartes épuisés : complète à la main') : msg, { label: T('Annuler'), fn: () => { BD.main = before; BD.dirty = true; bdPaint(); haptic('tap'); } });
  return added;
}
/** Construire le deck : en plusieurs passes avec versions au choix (deckopt.js), sinon en une passe. undoTo : deck à remettre si on annule. */
function dwBuild(undoTo) { if (typeof dsBuild === 'function') return dsBuild(undoTo); return Promise.resolve(typeof pxTable === 'function' && pxTable()).catch(() => {}).then(() => dwAutoBuild(undoTo)); }
/** Clics de l'onglet Coach (bdClick de builder.js les lui passe) : vrai si l'action était la sienne. */
function dwClick(b) {
  const act = b.dataset.act; if (!/^dw-/.test(act)) return false;
  if (act === 'dw-again') { if (typeof dsAgain === 'function') dsAgain(); return true; }      // « Autre proposition » : nouvelle graine, mêmes réglages
  if (typeof dxClick === 'function' && dxClick(b, act)) return true;      // prochaines étapes, échanges, « Pourquoi ? » (deckux.js)
  const s = BD.wiz || (BD.wiz = dwSettingsFor(BD.id));
  if (act === 'dw-g') { DW.open = DW.open === b.dataset.r ? '' : b.dataset.r; DW.shown = 8; haptic('tap'); bdList(); }
  else if (act === 'dw-more') { DW.shown += 8; bdList(); }
  else if (act === 'dw-set') { DW.setOpen = !DW.setOpen; haptic('tap'); bdList(); }
  else if (act === 'dw-th') { const v = b.dataset.v, i = s.th.indexOf(v); if (i >= 0) s.th.splice(i, 1); else if (s.th.length < 3) { s.th.push(v); dwPack('t', v); } else { toast(T('3 thèmes au plus')); return true; } haptic('tap'); DW.changed = true; dwPersist(BD.id); bdList(); }
  else if (act === 'dw-br') { s.br = Number(b.dataset.v) || 3; haptic('tap'); DW.changed = true; dwPersist(BD.id); bdList(); }
  else if (act === 'dw-fold') { if (b.dataset.v === 'bal') DW.balOpen = DW.balOpen === false; haptic('tap'); bdList(); }      // « Équilibre du deck » replié ou déplié
  else if (act === 'dw-keep') { DW.changed = false; haptic('tap'); bdList(); }
  else if (act === 'dw-regen') { const orig = new Map([...BD.main].map(([k, c]) => [k, { ...c }])); DW.changed = false; BD.main = new Map(); dwBuild(orig); }      // tout refaire, l'ancien deck reste annulable
  else if (act === 'dw-basics') dwFillBasics();
  else if (act === 'dw-auto') dwBuild();
  else if (act === 'dw-report') openDeckReport(BD, BD.name.trim() || T('Nouveau deck'));
  return true;
}
if (typeof document !== 'undefined') {      // personnalisation dans les réglages du Coach : clics, recherche de cartes, type de créature, originalité
  document.addEventListener('click', e => { const box = e.target.closest && e.target.closest('[data-perso="coach"]'); if (!box || !BD.el || !BD.wiz || !BD.el.contains(box)) return; if (dwPersoClick(e, BD.wiz)) { e.stopPropagation(); DW.changed = true; dwPersist(BD.id); bdList(); } }, true);
  for (const ev of ['input', 'change']) document.addEventListener(ev, e => { const box = e.target.closest && e.target.closest('[data-perso="coach"]'); if (!box || !BD.el || !BD.wiz) return; const r = dwPersoInput(e, BD.wiz, dwCmdOf()); if (r === true) { DW.changed = true; dwPersist(BD.id); bdList(); } });
}
if (typeof document !== 'undefined') document.addEventListener('change', e => {
  const t = e.target; if (!BD.el || !t || !BD.wiz) return;
  if (t.id === 'dwBud') { const v = Math.max(0, Math.round(Number(String(t.value).replace(',', '.')) || 0)); BD.wiz.bud = v * 100; DW.changed = true; dwPersist(BD.id); bdList(); }
  else if (t.id === 'dwOwn') { BD.wiz.own = t.checked; DW.changed = true; dwPersist(BD.id); bdList(); }
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
const DWZ = { q: '', cmd: null, th: [], br: 3, bud: 0, own: true, auto: true, name: '', cols: new Set(), pickTh: [], mech: [], tribe: '', pets: [], ban: [], avoid: [], orig: DW_ORIG0, perso: false };
function openDeckWiz(name) {
  Object.assign(DWZ, { q: '', cmd: null, th: [], br: 3, bud: 0, own: true, auto: true, name: name || '', cols: new Set(), pickTh: [], mech: [], tribe: '', pets: [], ban: [], avoid: [], orig: DW_ORIG0, perso: false, _allMech: false });
  if (typeof edhLoad === 'function') edhLoad().catch(() => {});
  dwLoad().catch(() => {});
  openSheet(T('Ton commandant'), T('Assistant de deck · étape 1 sur 2'), api => {
    api.wrap.classList.add('dw-wiz'); dwImgs(api.wrap);
    const paint = () => {
      const E = typeof EDH !== 'undefined' && EDH.data, list = dwzCmds(E);
      api.body.innerHTML = `<div class="field-in"><label class="label" for="dwzQ">${T('Chercher un commandant')}</label><input type="search" id="dwzQ" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="Atraxa, Edgar Markov…" value="${esc(DWZ.q)}"></div>
        <p class="label">${T('Ou d\'après un style de jeu')}</p><div class="dw-chips">${dwzThemeChips(E)}</div>
        <div class="dw-chips dw-cols">${[...'WUBRG'].map(c => `<button type="button" class="chip${DWZ.cols.has(c) ? ' on' : ''}" data-c="${c}" aria-pressed="${DWZ.cols.has(c)}"><i class="pip ${c}" aria-hidden="true"></i></button>`).join('')}</div>
        <div class="dw-cmds">${!E ? `<p class="hint">${EDH.err ? esc(EDH.err) : T('Chargement des commandants…')}</p>` : list.length ? list.map(dwzCmdRow).join('') : `<p class="hint">${T('Aucun commandant ne correspond.')}</p>`}</div>`;
      thumbsReady(api.body);      // style ou couleur touché : les vignettes déjà chargées ne repartent pas de zéro
      const q = $('#dwzQ', api.body); q.oninput = () => { DWZ.q = q.value; const pos = q.selectionStart; paintList(); try { q.setSelectionRange(pos, pos); } catch (e) { /* ignore */ } };
    };
    const paintList = () => { const E = typeof EDH !== 'undefined' && EDH.data, box = $('.dw-cmds', api.body); if (box && E) { const l = dwzCmds(E); box.innerHTML = l.length ? l.map(dwzCmdRow).join('') : `<p class="hint">${T('Aucun commandant ne correspond.')}</p>`; thumbsReady(box); } };
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
  const own = c.keys.some(k => collQty(k) > 0), img = c.img ? (/^https?:/.test(c.img) ? c.img : EDH_SMALL + c.img) : zoomUrl(c.names[0], 'small'), hue = hash32(c.slug) % 360;      // fichier EDH2 : adresse complète (préfixée une 2e fois, l'image était introuvable et la lettre restait) ; sans image : Scryfall par le nom
  return `<button type="button" class="crow dw-cmd" data-slug="${esc(c.slug)}"><span class="thumb" style="--h:${hue}">${esc((c.names[0][0] || '?').toUpperCase())}${img ? `<img alt="" loading="lazy" decoding="async" ${cardImgA(c.keys[0], c.names[0], img)}>` : ''}</span>
    <span class="row-main"><span class="row-top"><span class="row-name">${esc(c.names.join(' + '))}</span></span><span class="row-meta">${[...(c.ci || 'C')].map(x => `<i class="pip ${x}" aria-hidden="true"></i>`).join('')}<span class="tag">${esc(TN(c.decks, '{n} deck', '{n} decks', { n: nf0(c.decks) }))}</span>${c.tier ? `<span class="tag">${esc(T('Tier {t}', { t: c.tier }))}</span>` : ''}${own ? `<span class="tag good">${T('Possédée')}</span>` : ''}</span></span><span class="me-v">›</span></button>`;
}
function openDeckWiz2() {
  const E = EDH.data, cm = DWZ.cmd; if (!cm) return;
  const cur = mkCur();
  openSheet(cm.names.join(' + '), T('Assistant de deck · étape 2 sur 2'), api => {
    api.wrap.classList.add('dw-wiz'); dwImgs(api.wrap);
    const ths = (cm.th || []).map(([i]) => E.themes[i]).filter(Boolean).slice(0, 12);
    const paint = () => {
      api.body.innerHTML = `<div class="field-in"><label class="label" for="dwzName">${T('Nom du deck')}</label><input type="text" id="dwzName" maxlength="120" autocomplete="off" value="${esc(DWZ.name || cm.names[0].split(',')[0])}"></div>
        <p class="label">${T('Thèmes (3 au plus)')}</p><div class="dw-chips">${ths.length ? ths.map(t => `<button type="button" class="chip${DWZ.th.includes(t.slug) ? ' on' : ''}" data-th="${esc(t.slug)}" aria-pressed="${DWZ.th.includes(t.slug)}">${esc(typeof edhThemeName === 'function' ? edhThemeName(t) : t.label)}</button>`).join('') : `<span class="hint">${T('Pas de thème connu pour ce commandant.')}</span>`}</div>
        <p class="label">${T('Bracket')}</p><div class="dw-chips">${DW_BRACKETS.map(b => `<button type="button" class="chip${DWZ.br === b[0] ? ' on' : ''}" data-br="${b[0]}" aria-pressed="${DWZ.br === b[0]}">${b[0]} · ${esc(b[1])}</button>`).join('')}</div>
        <p class="hint">${esc(T((DW_BRACKETS.find(b => b[0] === DWZ.br) || DW_BRACKETS[2])[2]))}</p>
        <p class="label">${T('Budget du deck ({c})', { c: cur })}</p><div class="dw-chips">${[0, 5000, 10000, 25000, 50000, 100000].map(v => `<button type="button" class="chip${DWZ.bud === v ? ' on' : ''}" data-bud="${v}" aria-pressed="${DWZ.bud === v}">${v ? esc(fmt(v, cur).replace(/[.,]00(?=\D*$)/, '')) : T('Sans limite')}</button>`).join('')}</div>
        ${(() => { const cc = cm.names.reduce((a, n, i) => a + dwPrice(cm.keys[i] || ownKey(n), dwCard(cm.keys[i] || ownKey(n))), 0); return cc > 0 ? `<p class="hint${DWZ.bud > 0 && cc >= DWZ.bud * 0.6 ? ' warn' : ''}">${esc(DWZ.bud > 0 && cc >= DWZ.bud * 0.6 ? T('Ton commandant vaut déjà {p} sur {b} : avec ce budget, le deck restera incomplet ou très faible. Monte le budget ou choisis un autre commandant.', { p: fmt(cc, cur), b: fmt(DWZ.bud, cur) }) : T('Le commandant compte dans le budget ({p}).', { p: fmt(cc, cur) }))}</p>` : ''; })()}
        <label class="me-row switch-row" for="dwzOwn"><span class="me-t">${T('Priorité à ma collection')}<small>${T('Les cartes que tu possèdes passent devant dans les suggestions')}</small></span><span class="switch"><input type="checkbox" id="dwzOwn" ${DWZ.own ? 'checked' : ''}><i></i></span></label>
        <label class="me-row switch-row" for="dwzAuto"><span class="me-t">${T('Générer les 100 cartes tout de suite')}<small>${T('Le coach construit le deck avec ces réglages ; tu ajustes ensuite')}</small></span><span class="switch"><input type="checkbox" id="dwzAuto" ${DWZ.auto ? 'checked' : ''}><i></i></span></label>
        <button class="dw-set-h" type="button" data-perso-t aria-expanded="${DWZ.perso}"><span><b>${T('Personnaliser (facultatif)')}</b><small>${esc(dwPersoSum(DWZ) || T('mécaniques, type de créature, cartes fétiches, exclusions, originalité'))}</small></span><span class="me-v">${DWZ.perso ? '−' : '+'}</span></button>
        ${DWZ.perso ? `<div class="dw-perso dw-set">${dwPersoHtml(DWZ, { keys: cm.keys, names: cm.names, ci: dwCiOf(cm.keys, cm.ci) }, 'dwz')}</div>` : ''}`;
      $('#dwzName', api.body).oninput = e => { DWZ.name = e.target.value; };
      $('#dwzOwn', api.body).onchange = e => { DWZ.own = e.target.checked; };
      $('#dwzAuto', api.body).onchange = e => { DWZ.auto = e.target.checked; };
    };
    const cmz = { keys: cm.keys, names: cm.names, ci: dwCiOf(cm.keys, cm.ci) };
    for (const ev of ['input', 'change']) api.body.addEventListener(ev, e => { if (e.target.closest('.dw-perso') && dwPersoInput(e, DWZ, cmz) === true) { const y = api.body.scrollTop; paint(); api.body.scrollTop = y; } });
    api.body.addEventListener('click', e => {
      if (e.target.closest('[data-perso-t]')) { DWZ.perso = !DWZ.perso; haptic('tap'); paint(); return; }
      if (e.target.closest('.dw-perso') && dwPersoClick(e, DWZ)) { const y = api.body.scrollTop; paint(); api.body.scrollTop = y; return; }
      const t = e.target.closest('[data-th]'); if (t) { const v = t.dataset.th, i = DWZ.th.indexOf(v); if (i >= 0) DWZ.th.splice(i, 1); else if (DWZ.th.length < 3) DWZ.th.push(v); else { toast(T('3 thèmes au plus')); return; } haptic('tap'); paint(); return; }
      const b = e.target.closest('[data-br]'); if (b) { DWZ.br = Number(b.dataset.br); haptic('tap'); paint(); return; }
      const u = e.target.closest('[data-bud]'); if (u) { DWZ.bud = Number(u.dataset.bud) || 0; haptic('tap'); paint(); }
    });
    api.setFoot(`<button class="btn ghost" type="button" id="dwzBack">${T('Retour')}</button><button class="btn" type="button" id="dwzGo">${T('Créer et ouvrir le coach')}</button>`);
    $('#dwzBack', api.foot).onclick = () => { api.close(); setTimeout(() => openDeckWiz(DWZ.name), 200); };
    $('#dwzGo', api.foot).onclick = () => {
      const name = (DWZ.name || cm.names[0].split(',')[0]).trim().slice(0, 120); api.close(); haptic('ok'); DW.autoNext = DWZ.auto;      // génération dès que la base et les cartes du commandant sont là (dwCoachHtml)
      setTimeout(() => openBuilder({ name, fmt: 'commander', cmdr: cm.names.map((n, i) => ({ key: cm.keys[i] || ownKey(n), name: n })), wiz: dwSane({ th: DWZ.th.slice(0, 3), br: DWZ.br, bud: DWZ.bud, own: DWZ.own, mech: DWZ.mech, tribe: DWZ.tribe, pets: DWZ.pets, ban: DWZ.ban, avoid: DWZ.avoid, orig: DWZ.orig }), tab: 'coach' }), 200);
    };
    paint();
    const again = () => { if (api.body.isConnected) paint(); };      // prix du commandant (indication de budget) : base et relevé du jour arrivés après l'ouverture
    if (!DW.core) dwLoad().then(again, () => {});
    if (typeof pxTable === 'function' && !(typeof PXT !== 'undefined' && PXT)) pxTable().then(again, () => {});
  });
}
if (typeof module !== 'undefined' && module.exports) Object.assign(module.exports, { DKW_ROLES, DW_BASE, dwKarsten, dwLandTarget, dwModel, dwPips, dwSrcFor, DW_BRACKETS });
