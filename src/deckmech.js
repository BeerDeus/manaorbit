/* ── deckmech.js : le coach raisonne sur ce que fait chaque carte (classement data/card-mech.json, livré dans la base du coach) ────────────────
   Chaque carte de la base (dkw, colonne [10]) : rôles, ce qu'elle FOURNIT au deck (jetons, Trésors, sacrifices, arrivées en jeu…), ce qu'elle VEUT
   (ce qui la rend meilleure), types de créature qu'elle soutient, force 1-5 dans un deck qui veut ce qu'elle fait ; colonne [11] : sous-types de sa ligne
   de type. Ce qui se lit sur la ligne de type (artefact, enchantement, éphémère, équipement…) fournit aussi le « type » qui compte (dmxImplicit).
   1. Plan du deck (dmxPlan) : ce que veulent et fournissent le ou les commandants, les thèmes choisis (EDHREC → mécaniques, DMX_THEMES), les mécaniques
      et le type de créature choisis par le joueur, le style de la version (agressive, contrôle…) → pour chaque mécanique, la valeur de la fournir (P)
      et d'en profiter (W) ; types de créature voulus.
   2. Valeur d'une carte (dmxFit) : ce qu'elle fournit face à ce que veut le plan, ce qu'elle veut face à ce qu'il fournit ; rendements décroissants
      (pas 15 cartes qui font la même chose : chaque mécanique sature d'après ce que le deck a déjà) ; les récompenses valent d'autant plus que le deck
      a de quoi les nourrir. Indépendant de la popularité : une carte jamais jouée avec ce commandant peut être la meilleure.
   3. Réserve élargie (dmxPool) : toutes les cartes des couleurs du commandant qui servent le plan, pas seulement celles de sa page EDHREC.
   4. Explications (dmxReasons, dwDeckStory) : « jetons pour Krenko », « moteur sacrifices avec Viscera Seer », « combo avec … », « Elf (tribal) ».
   Base sans classement (ancienne) : dmxOn() faux, le coach garde sa méthode d'avant (popularité, synergie EDHREC, paires). */
const DMX = { src: null, by: new Map(), ti: null, tribes: null, plan: new Map() };
/** Libellés des mécaniques (groupes nominaux : « {m} pour {name} », « moteur {m} avec {card} », « thème {m} »). */
const DMX_LABEL = {
  'tokens-creature': 'jetons créature', treasure: 'Trésors', food: 'Nourritures', clue: 'Indices', 'tokens-other': 'autres jetons', 'token-doubling': 'jetons doublés', energy: 'énergie', 'the-ring': 'l\'Anneau', 'initiative-monarch': 'initiative et monarque',
  'sacrifice-outlet': 'moyens de sacrifier', sacrifice: 'sacrifices', 'dies-trigger': 'morts de créatures', 'self-mill': 'cartes au cimetière', 'graveyard-cast': 'sorts lancés du cimetière', reanimation: 'réanimation', 'graveyard-hate': 'contrôle des cimetières',
  'discard-outlet': 'défausse', loot: 'pioche et défausse', wheel: 'mains renouvelées', etb: 'arrivées en jeu', blink: 'blink', landfall: 'atterrissage', 'extra-lands': 'terrains supplémentaires', 'lands-graveyard': 'terrains au cimetière',
  'counters-p1': 'marqueurs +1/+1', 'counters-m1': 'marqueurs -1/-1', 'counters-other': 'marqueurs', proliferate: 'prolifération', lifegain: 'gain de vie', drain: 'drain', burn: 'blessures directes', 'pay-life': 'points de vie payés',
  artifacts: 'artefacts', enchantments: 'enchantements', equipment: 'équipements', auras: 'auras', vehicles: 'véhicules', spells: 'éphémères et rituels', superfriends: 'planeswalkers', legendary: 'légendaires', colorless: 'sorts incolores', curses: 'malédictions',
  'sagas-classes': 'sagas et classes', 'commander-matters': 'commandant', 'activated-abilities': 'capacités activées', 'keyword-matters': 'mots-clés', 'go-wide': 'créatures en nombre', 'big-creatures': 'grosses créatures', 'toughness-defender': 'endurance',
  attack: 'attaques', 'combat-damage': 'blessures de combat', 'extra-combat': 'combats supplémentaires', evasion: 'évasion', haste: 'célérité', 'double-strike': 'double initiative', ninjutsu: 'ninjutsu', voltron: 'voltron', tribal: 'tribal',
  copy: 'copies', 'cast-trigger': 'sorts lancés', storm: 'tempête', cascade: 'cascade', 'x-spells': 'sorts à X', 'cost-reduction': 'réduction de coût', 'alt-cost': 'sorts gratuits', flash: 'flash', cycling: 'cyclage', 'mutate-modify': 'mutation',
  'draw-trigger': 'pioche', 'top-library': 'dessus de la bibliothèque', impulse: 'exil du dessus', 'cast-others': 'cartes adverses', mill: 'meule', steal: 'vol de contrôle', 'group-hug': 'group hug', politics: 'politique', hatebear: 'taxes',
  poison: 'poison', 'discard-opponents': 'défausse adverse', pillowfort: 'dissuasion', 'coin-flip': 'pile ou face', 'face-down': 'cartes face cachée', untap: 'dégagement', 'mana-doubling': 'mana doublé', 'extra-turn': 'tours supplémentaires',
  'trigger-doubling': 'déclencheurs doublés', speed: 'vitesse', manland: 'terrains-créatures',
};
/** Mécaniques proposées dans l'assistant (les plus parlantes, groupées par famille). */
const DMX_PICK = ['tokens-creature', 'go-wide', 'sacrifice', 'dies-trigger', 'reanimation', 'self-mill', 'graveyard-cast', 'etb', 'blink', 'landfall', 'counters-p1', 'proliferate', 'lifegain', 'drain', 'burn',
  'artifacts', 'treasure', 'enchantments', 'equipment', 'auras', 'voltron', 'vehicles', 'spells', 'copy', 'x-spells', 'superfriends', 'legendary', 'big-creatures', 'attack', 'extra-combat', 'evasion', 'toughness-defender',
  'wheel', 'loot', 'mill', 'steal', 'group-hug', 'politics', 'pillowfort', 'poison', 'discard-opponents', 'coin-flip', 'face-down', 'food', 'clue', 'energy', 'initiative-monarch', 'the-ring', 'cycling', 'flash', 'untap', 'cascade', 'impulse', 'top-library'];
/** Thèmes EDHREC → mécaniques (et rôles qui font le thème : stax, contresorts…). Un thème tribal (« elves », « vampires ») donne un type de créature (dmxTribeOfTheme). */
const DMX_THEMES = {
  tokens: ['tokens-creature', 'go-wide', 'token-doubling'], aristocrats: ['sacrifice-outlet', 'sacrifice', 'dies-trigger', 'drain'], sacrifice: ['sacrifice-outlet', 'sacrifice', 'dies-trigger'], lifegain: ['lifegain'], lifedrain: ['drain', 'lifegain'],
  'plus-1-plus-1-counters': ['counters-p1', 'proliferate'], proliferate: ['proliferate', 'counters-p1', 'counters-other'], artifacts: ['artifacts'], treasure: ['treasure'], blink: ['blink', 'etb'], landfall: ['landfall', 'extra-lands'],
  'lands-matter': ['landfall', 'extra-lands', 'lands-graveyard'], graveyard: ['self-mill', 'graveyard-cast', 'reanimation'], reanimator: ['reanimation', 'self-mill', 'discard-outlet'], mill: ['mill'], 'self-mill': ['self-mill', 'graveyard-cast'],
  spellslinger: ['spells', 'cast-trigger', 'copy'], storm: ['storm', 'cost-reduction', 'spells'], cantrips: ['spells', 'cast-trigger'], voltron: ['voltron', 'equipment', 'auras'], equipment: ['equipment', 'voltron'], auras: ['auras', 'voltron'],
  enchantress: ['enchantments'], 'group-hug': ['group-hug', 'politics'], politics: ['politics', 'group-hug'], donate: ['politics', 'steal'], 'pillow-fort': ['pillowfort'], prison: ['pillowfort', 'hatebear'], stax: ['hatebear'], hatebears: ['hatebear'],
  theft: ['steal', 'cast-others'], wheels: ['wheel', 'draw-trigger', 'discard-opponents'], discard: ['discard-opponents', 'discard-outlet'], infect: ['poison', 'proliferate'], clones: ['copy', 'etb'], burn: ['burn'], aggro: ['attack', 'combat-damage', 'haste', 'evasion'],
  'forced-combat': ['politics', 'attack'], 'extra-turns': ['extra-turn'], monarch: ['initiative-monarch'], food: ['food'], vehicles: ['vehicles'], 'x-spells': ['x-spells'], flash: ['flash'], curses: ['curses'], blood: ['tokens-other', 'discard-outlet', 'loot'],
  planeswalkers: ['superfriends'], 'big-mana': ['mana-doubling', 'untap', 'big-creatures', 'x-spells'], stompy: ['big-creatures'], weenies: ['go-wide', 'tokens-creature'], 'card-draw': ['draw-trigger'], chaos: ['coin-flip'], exile: ['impulse', 'cast-others'],
  bounce: ['blink', 'etb'], tempo: ['flash'], 'land-destruction': ['lands-graveyard'], toolbox: [], 'good-stuff': [], midrange: [], control: [], combo: [], counterspells: [], ramp: [], 'extra-combat': ['extra-combat', 'attack'],
};
/** Rôles qui font un thème (le thème « contrôle » veut des retraits, etc.) : bonus de plan sur ces rôles. */
const DMX_THEME_ROLES = { control: ['removal', 'wipe', 'counter', 'draw'], counterspells: ['counter'], stax: ['stax'], prison: ['stax'], ramp: ['ramp'], 'big-mana': ['ramp'], combo: ['tutor'], toolbox: ['tutor'], 'card-draw': ['draw'], reanimator: ['recursion'], graveyard: ['recursion'] };
/** Styles qu'on peut exclure (assistant) : identifiant → [libellé, test sur la carte]. */
const DMX_AVOID = [
  ['combo', 'Combos infinis'], ['stax', 'Stax et verrous'], ['steal', 'Vol de contrôle'], ['tutor', 'Tuteurs'], ['counter', 'Contresorts'], ['wipe', 'Balayages'],
  ['discard', 'Défausse adverse'], ['mill', 'Meule'], ['chaos', 'Hasard (pile ou face, dés)'], ['xturn', 'Tours supplémentaires'], ['gc', 'Game Changers'],
];
/** Styles des versions (deckopt.js › DS_VARIANTS) : mécaniques et rôles favorisés, créatures, courbe. */
const DMX_STYLE = {
  aggro: { tags: { attack: 0.7, 'combat-damage': 0.6, haste: 0.6, evasion: 0.5, 'extra-combat': 0.5, 'double-strike': 0.4, 'go-wide': 0.3, voltron: 0.3 }, roles: { protect: 0.15 }, cre: 0.12, mv: -0.06 },
  control: { tags: { pillowfort: 0.4, steal: 0.3, hatebear: 0.25, flash: 0.3, 'draw-trigger': 0.2 }, roles: { removal: 0.22, wipe: 0.22, counter: 0.25, draw: 0.18 }, cre: -0.05, mv: 0 },
  eco: { tags: {}, roles: {}, cre: 0, mv: -0.02, cheap: 0.12 },
};
const dmxOn = () => !!(DW.core && DW.core.mech && Array.isArray(DW.core.mech.tags));
/** Indices des mécaniques (nom → indice) et des rôles du classement. */
function dmxIdx() {
  if (DMX.src !== DW.core) {
    DMX.src = DW.core; DMX.by = new Map(); DMX.plan = new Map(); DMX.tribes = null;
    const mm = (DW.core && DW.core.mech) || { tags: [], roles: [] };
    DMX.ti = new Map(mm.tags.map((t, i) => [t, i])); DMX.ri = new Map(mm.roles.map((r, i) => [r, i])); DMX.tags = mm.tags; DMX.roles = mm.roles;
    DMX.tribalI = DMX.ti.has('tribal') ? DMX.ti.get('tribal') : -1;
    const I = t => DMX.ti.has(t) ? DMX.ti.get(t) : -1;
    DMX.imp = { art: I('artifacts'), ench: I('enchantments'), spell: I('spells'), pw: I('superfriends'), leg: I('legendary'), cre: I('go-wide'), eq: I('equipment'), aura: I('auras'), veh: I('vehicles'), saga: I('sagas-classes'), curse: I('curses'), col: I('colorless'), big: I('big-creatures') };
    // mécaniques très répandues (une carte sur dix en fournit) : elles comptent moins, sans quoi n'importe quelle créature passerait pour une synergie
    DMX.broad = new Float64Array(mm.tags.length).fill(1); for (const t of ['etb', 'burn', 'lifegain', 'evasion', 'counters-p1']) if (DMX.ti.has(t)) DMX.broad[DMX.ti.get(t)] = t === 'etb' ? 0.45 : 0.7;
  }
  return DMX.ti;
}
const dmxTag = t => { dmxIdx(); return DMX.ti.has(t) ? DMX.ti.get(t) : -1; };
const dmxLabel = t => T(DMX_LABEL[t] || t);
/** Mécanique « de type » : ce que la ligne de type fournit (un artefact pour une carte qui veut des artefacts…). → indices. */
function dmxImplicit(ty, sub, ci, cmc) {
  const I = DMX.imp, out = [], s = ' ' + sub + ' ', add = i => { if (i >= 0) out.push(i); };
  if (ty & 4) add(I.art); if (ty & 8) add(I.ench); if (ty & 48) add(I.spell); if (ty & 64) add(I.pw); if (ty & 256) add(I.leg);
  if (ty & 2) { add(I.cre); if (cmc >= 6) add(I.big); }
  if (/ Equipment /.test(s)) add(I.eq); if (/ Aura /.test(s)) add(I.aura); if (/ Vehicle /.test(s)) add(I.veh); if (/ (Saga|Class|Case|Room) /.test(s)) add(I.saga); if (/ Curse /.test(s)) add(I.curse);
  if (!ci && !(ty & 1)) add(I.col);
  return out;
}
/** Ce que fait une carte : { rb (rôles du classement, bits), p, w (indices), t (types soutenus), pw (force 1-5), sub, ip (mécaniques de type), cre, chg } ; null si pas classée. */
function dmx(k) {
  dmxIdx(); let m = DMX.by.get(k); if (m !== undefined) return m;
  const r = DW.byKey && DW.byKey.get(k);
  if (!r || !Array.isArray(r[10])) { DMX.by.set(k, null); return null; }
  const [rb, p, w, t, pw] = r[10], sub = String(r[11] || '');
  m = { rb: rb || 0, p: p || [], w: (w || []).filter(i => i !== DMX.tribalI), tw: (w || []).includes(DMX.tribalI), t: Array.isArray(t) ? t : [], pw: pw || 1, sub, ip: dmxImplicit(r[3] || 0, sub, r[1] || '', r[2] || 0), cre: !!((r[3] || 0) & 2), chg: / ?Changeling$/.test(sub) };
  m.subs = sub ? sub.split(' ') : [];
  DMX.by.set(k, m); return m;
}
const dmxRole = (m, r) => !!(m && DMX.ri.has(r) && m.rb & (1 << DMX.ri.get(r)));
/** Types de créature connus (soutenus par au moins une carte) : pour reconnaître un thème tribal et proposer un type dans l'assistant. → Map(type → cartes qui le soutiennent). */
function dmxTribes() {
  dmxIdx(); if (DMX.tribes) return DMX.tribes;
  const m = new Map(); for (const r of (DW.core && DW.core.cards) || []) { const x = r[10]; if (x && Array.isArray(x[3])) for (const t of x[3]) m.set(t, (m.get(t) || 0) + 1); }
  DMX.tribes = new Map([...m].filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1])); return DMX.tribes;
}
/** Thème EDHREC tribal → type de créature (« elves » → Elf, « wolves » → Wolf) ; '' si ce n'est pas un type connu. */
function dmxTribeOfTheme(slug) {
  const s = String(slug || '').toLowerCase(), tr = dmxTribes(), up = w => w ? w[0].toUpperCase() + w.slice(1) : '';
  const irr = { elves: 'Elf', dwarves: 'Dwarf', wolves: 'Wolf', werewolves: 'Werewolf', faeries: 'Faerie', zombies: 'Zombie', mice: 'Mouse', octopuses: 'Octopus', sphinxes: 'Sphinx', foxes: 'Fox', 'elder-dragons': 'Elder', allies: 'Ally', fungi: 'Fungus', fungus: 'Fungus', dinosaurs: 'Dinosaur', leviathans: 'Leviathan' };
  for (const c of [irr[s], up(s.replace(/ies$/, 'y')), up(s.replace(/es$/, '')), up(s.replace(/s$/, '')), up(s)]) if (c && tr.has(c)) return c;
  return '';
}
const dmxSubHas = (m, T0) => m.subs.includes(T0) || (m.chg && m.cre);

/* ── Plan du deck ─────────────────────────────────────────────────────────────────────────────────── */
/** Plan : { P, W (Float64Array : valeur de fournir / d'en profiter, par mécanique), tribes: Map(type → poids), roles: { rôle: bonus }, from: Map(indice → origine), cmdM: [mécaniques des commandants],
 *  main: indices des mécaniques principales (thème du deck), style }. Gardé tant que la base, le commandant et les réglages ne changent pas. */
function dmxPlan(cmd, set = {}, style = '') {
  if (!dmxOn() || !cmd) return null; dmxIdx();
  const keys = cmd.keys || cmd.names.map(n => ownKey(n)), sig = [keys.join('+'), (set.th || []).join(','), (set.mech || []).join(','), set.tribe || '', style].join('|');
  if (DMX.plan.has(sig)) return DMX.plan.get(sig);
  const n = DMX.tags.length, P = new Float64Array(n), W = new Float64Array(n), tribes = new Map(), roles = {}, from = new Map(), cmdM = [];
  const add = (i, p, w, why) => { if (i < 0 || i === DMX.tribalI) return; P[i] += p; W[i] += w; if (why && !from.has(i)) from.set(i, why); };
  const tribe = (t, w, why) => { if (t) { tribes.set(t, Math.max(tribes.get(t) || 0, w)); if (why && !from.has('t:' + t)) from.set('t:' + t, why); } };
  for (const k of keys) {      // ce que veulent les commandants : le deck doit le fournir ; ce qu'ils fournissent : les récompenses de ces mécaniques
    const m = dmx(k); if (!m) continue; cmdM.push(m);
    for (const i of m.w) add(i, 1.1, 0.4, 'cmd');
    for (const i of m.p) add(i, 0.2, 0.8, 'cmd');
    for (const t of m.t) tribe(t, 1.1, 'cmd');
    if (m.tw && !m.t.length && m.cre) for (const t of m.subs) if (dmxTribes().has(t)) tribe(t, 0.8, 'cmd');      // « les créatures du type choisi » : le sien d'abord
  }
  for (const s of set.th || []) {      // thèmes choisis (EDHREC)
    const tt = DMX_THEMES[s]; if (tt) tt.forEach((t, j) => add(dmxTag(t), j ? 0.8 : 1.1, j ? 0.8 : 1.1, 'th'));
    for (const r of DMX_THEME_ROLES[s] || []) roles[r] = Math.max(roles[r] || 0, 0.25);
    tribe(dmxTribeOfTheme(s), 1.3, 'th');
  }
  for (const t of set.mech || []) add(dmxTag(t), 1.3, 1.3, 'me');      // mécaniques choisies par le joueur : sa demande passe avant tout
  if (set.tribe) tribe(String(set.tribe), 1.6, 'me');
  if (tribes.size) for (const i of [dmxTag('go-wide')]) add(i, 0.2, 0.5, '');      // tribal : les cartes « pour chaque créature » suivent
  const st = DMX_STYLE[style];
  if (st) { for (const [t, v] of Object.entries(st.tags)) add(dmxTag(t), v, v * 0.8, ''); for (const [r, v] of Object.entries(st.roles)) roles[r] = (roles[r] || 0) + v; }
  const cap = new Float64Array(n).fill(14);      // saturation : une mécanique demandée par le joueur (ou un thème choisi) en prend davantage
  for (let i = 0; i < n; i++) { P[i] *= DMX.broad[i]; const f = from.get(i); if (f === 'me' || f === 'th') cap[i] = 24; }
  const main = [...Array(n).keys()].filter(i => P[i] + W[i] >= 1.2 && from.get(i)).sort((a, b) => (P[b] + W[b]) - (P[a] + W[a])).slice(0, 5);
  const plan = { P, W, cap, tribes, roles, from, cmdM, main, style, sig, user: (set.mech || []).length + (set.th || []).length + (set.tribe ? 1 : 0) };
  DMX.plan.set(sig, plan); if (DMX.plan.size > 40) DMX.plan.delete(DMX.plan.keys().next().value);
  return plan;
}
/** Ce que le deck fournit et veut déjà (commandants compris, comptés une fois et demie) : { prov, want (par mécanique), tribe: Map(type → créatures), n }. */
function dmxDeck(X) {
  if (!dmxOn()) return null; dmxIdx();
  const n = DMX.tags.length, prov = new Float64Array(n), want = new Float64Array(n), dom = new Float64Array(n), tribe = new Map();
  const put = (k, q) => {
    const m = dmx(k); if (!m) return;
    for (const i of m.p) { prov[i] += q; dom[i] += q; } for (const i of m.ip) prov[i] += q * 0.5; for (const i of m.w) { want[i] += q; dom[i] += q; }
    if (m.cre) for (const t of m.subs) tribe.set(t, (tribe.get(t) || 0) + q);
    if (m.chg && m.cre) tribe.set('*', (tribe.get('*') || 0) + q);
  };
  for (const c of X.main.values()) put(c.key, c.qty);
  for (const c of X.cmdr) put(c.key, 1.5);
  let top = 1; for (let i = 0; i < n; i++) if (dom[i] * DMX.broad[i] > top) top = dom[i] * DMX.broad[i];
  for (let i = 0; i < n; i++) dom[i] = 0.25 + 0.75 * Math.min(1, dom[i] * DMX.broad[i] / top);      // poids des synergies propres au deck : celles du thème dominant d'abord (un deck cohérent plutôt que cinq petits thèmes)
  return { prov, want, dom, tribe, n: X.main.size };
}
const dmxSat = (n, cap) => 1 / (1 + (n / cap) * (n / cap));
/** Valeur mécanique d'une carte (0 à ~1) pour ce plan, dans ce deck (deck : dmxDeck, ou null pour la valeur de base). */
function dmxFit(m, plan, deck) {
  if (!m || !plan) return 0;
  let f = 0;
  for (const i of m.p) if (plan.P[i]) f += plan.P[i] * (deck ? dmxSat(deck.prov[i], plan.cap[i]) : 1);      // fournit ce que veut le plan (de moins en moins quand le deck en a déjà beaucoup)
  for (const i of m.ip) if (plan.P[i]) f += plan.P[i] * 0.45 * (deck ? dmxSat(deck.prov[i], 30) : 1);      // fournit par son type (artefact, éphémère…)
  for (const i of m.w) if (plan.W[i]) f += plan.W[i] * (deck ? dmxSat(deck.want[i], plan.cap[i] * 0.65) * Math.max(0.45, Math.min(1, (deck.prov[i] + 2) / 8)) : 0.8);      // profite de ce que fournit le plan : d'autant plus que le deck le nourrit
  if (plan.tribes.size) for (const [t, w] of plan.tribes) {
    if (m.t.includes(t)) f += w;      // seigneur, « chaque fois qu'un Elfe… »
    else if (m.tw && !m.t.length) f += w * 0.5;      // « type de créature choisi »
    if (dmxSubHas(m, t)) f += w * (m.cre ? 0.85 : 0.6) * (deck ? dmxSat(deck.tribe.get(t) || 0, 30) : 1);
  }
  for (const [r, v] of Object.entries(plan.roles)) if (dmxRole(m, r)) f += v;
  if (deck) {      // synergies propres au deck en cours : ce que veulent ses cartes, ce qu'elles fournissent
    let d = 0;
    for (const i of m.p) if (deck.want[i]) d += Math.min(1, deck.want[i] / 3) * dmxSat(deck.prov[i], 12) * DMX.broad[i] * deck.dom[i];
    for (const i of m.w) if (deck.prov[i]) d += Math.min(1, deck.prov[i] / 5) * dmxSat(deck.want[i], 8) * deck.dom[i];
    f += 0.35 * d;
  }
  return 1 - Math.exp(-f / 1.3);
}
/** Qualité propre d'une carte (force 1-5 → 0 à 1). */
const dmxQ = m => m ? (m.pw - 1) / 4 : 0;
/** Cartes des couleurs du commandant qui servent le plan, même jamais jouées avec lui : [[clé, rangée, valeur de base]] (les plus utiles d'abord, 900 au plus). */
function dmxPool(cmd, plan) {
  if (!plan || !DW.byKey) return [];
  const sig = plan.sig + '|' + cmd.ci; if (plan.pool && plan.pool.sig === sig) return plan.pool.l;
  const ok = new Set([...cmd.ci]), l = [];
  for (const [k, r] of DW.byKey) {
    if (r[6] & 16 || !Array.isArray(r[10]) || [...String(r[1])].some(c => !ok.has(c))) continue;
    const m = dmx(k); if (!m) continue;
    const fit = dmxFit(m, plan, null), q = dmxQ(m), land = r[4] & 1;
    if (land ? fit < 0.3 && m.pw < 4 : fit < 0.3 && !(q >= 0.5 && r[4]) && !(r[4] & DW_RB.wincon)) continue;
    l.push([k, r, fit + q * 0.35]);
  }
  l.sort((a, b) => b[2] - a[2]); plan.pool = { sig, l: l.slice(0, 900) };
  return plan.pool.l;
}

/* ── Explications ─────────────────────────────────────────────────────────────────────────────────── */
/** Raisons d'une carte dans ce deck (ou pour y entrer) : [texte] (3 au plus), du plus parlant au moins. ctx : { cmd, plan, combo: Map }. */
function dmxReasons(k, X, cmd, plan) {
  const m = dmx(k), out = [], nm = cmd ? cmd.names[0].split(',')[0] : '', set = X.wiz || {};
  if ((set.pets || []).some(n => ownKey(n) === k)) out.push(T('ta carte fétiche'));
  if (DW.core && Array.isArray(DW.core.combos) && set.br >= 3) { for (const e of dwComboIdx().get(k) || []) if (X.main.has(e.p) || X.cmdr.some(c => c.key === e.p)) { out.push(T('combo avec {card}', { card: e.c[0] === (dwCard(k) || {}).name ? e.c[1] : e.c[0] })); break; } }
  if (!m || !plan) return out;
  const cm = plan.cmdM, tag = i => dmxLabel(DMX.tags[i]);
  for (const c of cm) { const i = m.p.find(t => c.w.includes(t)); if (i !== undefined) { out.push(T('{m} pour {name}', { m: tag(i), name: nm })); break; } }
  if (out.length < 3) for (const c of cm) { const i = m.w.find(t => c.p.includes(t)); if (i !== undefined) { out.push(T('profite des {m} de {name}', { m: tag(i), name: nm })); break; } }
  for (const [t] of plan.tribes) if (m.t.includes(t) || dmxSubHas(m, t)) { out.push(T('{t} (tribal)', { t })); break; }
  if (out.length < 3) {      // moteur avec une autre carte du deck : ce qu'elle veut, une autre le fournit (ou l'inverse)
    let best = null, bs = 0;
    for (const c of X.main.values()) {
      if (c.key === k) continue; const o = dmx(c.key); if (!o) continue;
      for (const i of m.w) { const v = 0.4 + plan.P[i] + plan.W[i] + 0.01 * o.pw; if (o.p.includes(i) && v > bs) { bs = v; best = T('moteur {m} avec {card}', { m: tag(i), card: c.name }); } }
      for (const i of m.p) { const v = 0.4 + plan.P[i] + plan.W[i] + 0.01 * o.pw; if (o.w.includes(i) && v > bs) { bs = v; best = T('{m} pour {card}', { m: tag(i), card: c.name }); } }
    }
    if (best) out.push(best);
  }
  if (out.length < 3) { const i = [...m.p, ...m.w].find(t => plan.from.get(t) === 'me' || plan.from.get(t) === 'th'); if (i !== undefined) out.push(T('thème {m}', { m: tag(i) })); }
  return [...new Set(out)].slice(0, 3);
}
/** Ce que raconte un deck (données pour l'affichage : Coach, analyse, rapport) : { tags: [{ t, label, n, prov, want }], tribe: { t, n } | null, engines: [{ label, cards }],
 *  wincons: [noms], pets: { in, out }, notes: [textes], plan } ; null sans classement. */
function dwDeckStory(X = BD) {
  if (!dmxOn()) return null;
  const cmd = dwCmdOf(X); if (!cmd) return null;
  const set = X.wiz || dwDefaults(), plan = dmxPlan(cmd, set), deck = dmxDeck(X), cards = [...X.main.values()].filter(c => !BASIC_NAMES.has(c.key));
  const n = DMX.tags.length, cnt = new Float64Array(n), prov = new Float64Array(n), want = new Float64Array(n);
  for (const c of cards) { const m = dmx(c.key); if (!m || dwCard(c.key) && dwCard(c.key).roles & DW_RB.land) continue; const seen = new Set([...m.p, ...m.w]); for (const i of seen) cnt[i]++; for (const i of m.p) prov[i]++; for (const i of m.w) want[i]++; }
  const score = i => cnt[i] * (1 + (plan ? plan.P[i] + plan.W[i] : 0)) * DMX.broad[i];
  const tags = [...Array(n).keys()].filter(i => cnt[i] >= 4 && prov[i] >= 2).sort((a, b) => score(b) - score(a)).slice(0, 5).map(i => ({ t: DMX.tags[i], label: dmxLabel(DMX.tags[i]), n: cnt[i], prov: prov[i], want: want[i] }));
  let tribe = null; for (const [t, k] of deck.tribe) if (t !== '*' && k >= 8 && (!tribe || k > tribe.n) && dmxTribes().has(t)) tribe = { t, n: Math.round(k) };
  const engines = [], E = (label, need) => { const got = need.map(l => cards.filter(c => { const m = dmx(c.key); return m && l.some(t => m.p.includes(dmxTag(t))); }).map(c => c.name)); if (got.every(g => g.length)) engines.push({ label: T(label), cards: [...new Set(got.flatMap(g => g.slice(0, 2)))].slice(0, 5) }); };
  E('moteur sacrifice', [['sacrifice-outlet'], ['dies-trigger', 'drain'], ['tokens-creature', 'reanimation']]);
  E('jetons doublés', [['tokens-creature'], ['token-doubling']]);
  E('blink', [['blink'], ['etb']]);
  E('terrains en plus', [['landfall', 'extra-lands']]);
  E('cimetière', [['self-mill', 'loot', 'discard-outlet'], ['reanimation', 'graveyard-cast']]);
  E('marqueurs', [['counters-p1'], ['proliferate']]);
  E('sorts copiés', [['copy'], ['cost-reduction', 'untap']]);
  const wincons = cards.filter(c => (dwCard(c.key) || {}).roles & DW_RB.wincon).map(c => c.name);
  const pets = (set.pets || []).map(nm => ({ nm, k: ownKey(nm) })), petIn = pets.filter(p => X.main.has(p.k)).map(p => p.nm), petOut = pets.filter(p => !X.main.has(p.k)).map(p => p.nm);
  const notes = [];
  if (plan && plan.user && plan.main.length) notes.push(T('Plan suivi : {m}', { m: plan.main.slice(0, 3).map(i => dmxLabel(DMX.tags[i])).join(', ') }));
  if (petOut.length) notes.push(TN(petOut.length, 'Carte fétiche écartée (couleurs, bracket ou cartes interdites) : {c}', 'Cartes fétiches écartées (couleurs, bracket ou cartes interdites) : {c}', { c: petOut.join(', ') }));
  return { tags, tribe, engines: engines.slice(0, 3), wincons, pets: { in: petIn, out: petOut }, notes, plan };
}
/** Mécaniques détectées pour un commandant (assistant : proposées en premier). → [étiquette] */
function dmxCmdTags(cmd) {
  const plan = dmxPlan(cmd, {}); if (!plan) return [];
  return [...plan.from.keys()].filter(i => typeof i === 'number' && DMX_PICK.includes(DMX.tags[i])).sort((a, b) => (plan.P[b] + plan.W[b]) - (plan.P[a] + plan.W[a])).slice(0, 6).map(i => DMX.tags[i]);
}
/** Types de créature soutenus par le commandant (assistant : type proposé). */
function dmxCmdTribes(cmd) { const plan = dmxPlan(cmd, {}); return plan ? [...plan.tribes.keys()] : []; }
if (typeof module !== 'undefined' && module.exports) Object.assign(module.exports, { DMX_LABEL, DMX_THEMES, DMX_PICK, DMX_AVOID });
