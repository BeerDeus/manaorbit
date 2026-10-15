/* ── progress.js : niveau du compte (1 à 999, volontairement absurde) et badges ──────────────────────────────────────────────────────────────
   Discret : seulement dans « Compte et réglages », à côté du compte (me.js) ; la fiche « Niveau et badges » s'ouvre en le touchant.
   Tout ce qui peut l'être vient des vraies données (collection, decks, parties, échanges, ouvertures) : rétroactif, rien à rattraper. Le reste
   (cartes scannées, langues lues, victoires à 5 PV ou moins…) est compté au moment où ça arrive, sur l'appareil (deckdeal:prg) et dans le compte
   (users/{uid}/meta/progress : { c: { compteur: nombre }, updatedAt } ; compteurs qui ne baissent jamais : le plus grand des deux l'emporte).
   Badges à paliers (bronze, argent, or, diamant) ou uniques ; l'XP vient des activités et des paliers ; niveau L atteint à 40 × (L − 1)^2,25 XP.
   Rien n'est classé ni montré à d'autres : tricher ne trompe que soi. Badges de la Carte mystère (daily.js › dailyBadges, vérifiés par le serveur) : ajoutés s'ils existent. */
const PRG_KEY = 'deckdeal:prg', PRG_GOT = 'deckdeal:prg:got', PRG_SHOW = 'deckdeal:prg:show', PRG_MAX = 999, PRG_C_MAX = 140, PRG_SHOW_MAX = 3;
const PRG = { c: null, t: 0, dly: null, doc: { uid: '', unsub: null, pushT: 0 }, u: 0 };
const PRG_TIERS = ['bronze', 'argent', 'or', 'diamant'];
const prgTierName = i => [T('bronze'), T('argent'), T('or'), T('diamant')][i] || T('unique');

/* ── Compteurs ─────────────────────────────────────────────────────────────────────────────────────────────── */
/** Compteurs de l'appareil { clé: nombre ≥ 0 } (lus une fois). */
function prgC() {
  if (!PRG.c) { try { const o = JSON.parse(localStorage.getItem(PRG_KEY) || '{}'); PRG.c = prgClean(o && o.c); PRG.u = Number(o && o.u) || 0; } catch (e) { PRG.c = {}; } }
  return PRG.c;
}
/** Compteurs relus (appareil, compte) : nombres finis ≥ 0, clés courtes, PRG_C_MAX au plus. */
function prgClean(o) {
  const out = {}; if (!o || typeof o !== 'object') return out;
  for (const [k, v] of Object.entries(o).slice(0, PRG_C_MAX)) if (/^[a-z][a-z0-9_-]{0,23}$/.test(k) && Number.isFinite(v) && v >= 0) out[k] = Math.min(1e12, Math.round(v));
  return out;
}
function prgWrite() { try { localStorage.setItem(PRG_KEY, JSON.stringify({ c: prgC(), u: PRG.u })); } catch (e) { /* stockage plein : gardé en mémoire */ } }
/** Ajoute n à un compteur. */
function prgAdd(k, n = 1) { if (!(n > 0)) return; const c = prgC(); c[k] = (c[k] || 0) + n; prgChanged(); }
/** Garde le plus grand des deux (record). */
function prgMax(k, v) { const c = prgC(); if (!(v > (c[k] || 0))) return; c[k] = Math.round(v); prgChanged(); }
function prgChanged() { PRG.u = Date.now(); prgWrite(); prgPushSoon(); prgSoon(); }

/* ── Événements (appelés par scan.js, partie-ui.js, troc.js, opening.js, app.js) ─────────────────────────────── */
/** Cartes du scan ajoutées (lignes du scan : q, l, es, ambBy, pk) : cartes, langues, éditions lues, illustrations, homonymes, anciennes, plus chère, plus grosse session,
 *  extensions sorties depuis moins de 7 jours (« Avant-première » à 30 cartes d'une même extension). */
function prgScan(items) {
  if (!Array.isArray(items) || !items.length) return;
  const c = prgC(); let n = 0, best = 0; const now = Date.now(), fresh = new Set();
  if (typeof SETS !== 'undefined' && Array.isArray(SETS.list)) for (const s of SETS.list) { const d = Date.parse(s.at); if (d && now - d >= 0 && now - d < 7 * 864e5) fresh.add(s.code); }
  for (const x of items) {
    const q = Math.max(1, x.q || 1), l = x.l || 'en', pk = x.pk || null; n += q;
    c['sl_' + l.replace(/[^a-z]/gi, '').toLowerCase()] = (c['sl_' + l.replace(/[^a-z]/gi, '').toLowerCase()] || 0) + q;
    if (x.es === 'read') c.sr = (c.sr || 0) + q;
    if (x.es === 'art' || x.es === 'sym') c.sa = (c.sa || 0) + q;
    if (x.ambBy === 'foot' || x.ambBy === 'art' || x.ambBy === 'man') c.sh = (c.sh || 0) + 1;
    if (pk && Number(pk.y) > 1990 && Number(pk.y) < 2003) c.so = (c.so || 0) + q;
    const eu = (typeof pkEu === 'function' && pkEu(pk)) || ((COLL.meta[x.key] || {}).eu > 0 ? COLL.meta[x.key].eu : 0); if (eu > best) best = eu;
    if (pk && fresh.has(pk.set)) { const k = 'nw_' + pk.set, was = c[k] || 0; c[k] = was + q; if (was < 30 && c[k] >= 30) c.sn = (c.sn || 0) + 1; }
  }
  for (const k of Object.keys(c)) if (k.startsWith('nw_') && !fresh.has(k.slice(3))) delete c[k];      // extensions sorties depuis plus de 7 jours : le décompte s'arrête
  c.sc = (c.sc || 0) + n; if (n > (c.ss || 0)) c.ss = n; if (best > (c.sp || 0)) c.sp = Math.round(best);
  if (typeof SCS !== 'undefined' && SCS.auto) c.sau = (c.sau || 0) + n;      // scan automatique
  const h = new Date().getHours(); if (h < 5) c.snt = (c.snt || 0) + n; else if (h < 7) c.sel = (c.sel || 0) + n;      // la nuit, à l'aube
  prgChanged();
}
/** Fin d'une partie créée ici (partie-ui.js) : st final, ma place, plus bas de mes points de vie pendant la partie. */
function prgGame(st, me, low) {
  if (!st || !me) return;
  const won = (st.vainqueurs || []).includes(me.pos);
  if (won && low <= 5) prgAdd('gv');
  const kills = st.places.filter(p => p.elimine && p.elimine.cause === 'commandant' && p.elimine.par === me.pos).length; if (kills) prgAdd('gk', kills);
  if (st.monarque === me.pos) prgAdd('gmo');
  if (won && low >= st.format) prgAdd('gfu');      // jamais touché
}
/** Échange en direct appliqué (troc.js). */
const prgTrade = () => prgAdd('tr');
/** Ouverture terminée (opening.js) : valeur et prix payé en centimes, meilleure carte (centimes). */
function prgOpen(v, paid, best, n, st) { prgAdd('op'); if (paid != null && v > paid) prgAdd('ow'); prgMax('ob', best || 0); prgAdd('oc', n || 0); if (st) prgAdd('ost'); }
/** Lancement : un jour d'utilisation de plus (une fois par jour). */
function prgDay() {
  const c = prgC(), d = Math.floor((Date.now() - new Date().getTimezoneOffset() * 60e3) / 864e5);
  if (MO_TEST) c.tst = 1;      // venu essayer le lien de test (badge « Pionnier »)
  if ((typeof isNativeApp === 'function' && isNativeApp()) || (typeof PWA !== 'undefined' && PWA.standalone())) c.in = 1;
  if (c.dl === d) { prgWrite(); return; }
  c.ds = c.dl === d - 1 ? (c.ds || 0) + 1 : 1; if (c.ds > (c.dsb || 0)) c.dsb = c.ds;      // jours d'affilée
  c.dl = d; c.days = (c.days || 0) + 1; prgChanged();
}

/* ── Mesures : vraies données + compteurs ──────────────────────────────────────────────────────────────────── */
/** Tout ce que les badges et l'XP regardent. */
function prgMetrics() {
  const c = prgC(), m = {};
  m.sc = c.sc || 0; m.sr = c.sr || 0; m.sa = c.sa || 0; m.sh = c.sh || 0; m.so = c.so || 0; m.ss = c.ss || 0; m.sp = c.sp || 0; m.sn = c.sn || 0;
  m.sl = l => c['sl_' + l] || 0; m.slangs = Object.keys(c).filter(k => k.startsWith('sl_') && c[k] > 0).length;
  let copies = 0, foil = 0, placed = 0; const langs = new Set(), sets = new Set();
  try {
    for (const k in COLL.map) for (const [g, q] of collLines(COLL.map[k])) {
      copies += q; if (lineFoil(g)) foil += q; const l = lineLang(g); if (l) langs.add(l); const e = lineEd(g); if (e) sets.add(edSet(e)); if (lineAttrs(g).p) placed += q;
    }
  } catch (e) { /* collection pas encore lue */ }
  m.copies = copies; m.distinct = Object.keys(COLL.map || {}).length; m.foil = foil; m.clangs = langs.size; m.sets = sets.size; m.placed = placed;
  try { m.value = collValue(); } catch (e) { m.value = 0; }
  m.prox = 0; try { for (const k in COLL.prox) for (const [, q] of collLines(COLL.prox[k])) m.prox += q; } catch (e) { /* aucun proxy */ }
  m.places = Object.keys(COLL.places || {}).length;
  m.wish = typeof TR !== 'undefined' && TR.wish ? Object.keys(TR.wish).length : 0;
  m.decks = typeof allDecks === 'function' ? allDecks().length : 0;
  m.eng = typeof XS !== 'undefined' && typeof engIsOn === 'function' ? Object.keys(XS.eng).filter(engIsOn).length : 0;
  m.pub = typeof PD !== 'undefined' && PD.mine && D.user && PD.mineUid === D.user.uid ? PD.mine.size : 0;
  const hist = typeof partieHist === 'function' ? partieHist() : [], s = typeof partieStats === 'function' ? partieStats(hist) : { n: 0, wins: 0, best: 0, decks: [], adv: [] };
  m.games = s.n; m.wins = s.wins; m.streak = s.best; m.opps = s.adv.length; m.deckWins = s.decks.reduce((a, d) => Math.max(a, d.wins), 0);
  m.gv = c.gv || 0; m.gk = c.gk || 0;
  const mine = hist.map(x => ({ x, me: x.places.find(p => p.pos === x.moi) })).filter(e => e.me);
  m.fast = mine.filter(e => e.me.vainqueur && e.x.tours > 0 && e.x.tours <= 6).length;
  m.long = mine.filter(e => e.x.duree >= 7200).length;
  m.big = mine.filter(e => e.x.places.length >= 6).length;
  m.host = mine.filter(e => e.x.src === 'h').length;
  m.cmds = new Set(mine.map(e => String(e.me.commandant || '').toLowerCase()).filter(Boolean)).size;
  m.trades = Math.max(c.tr || 0, typeof trocHist === 'function' ? trocHist().length : 0);
  m.friends = typeof AM !== 'undefined' && AM.l && Array.isArray(AM.l.friends) ? AM.l.friends.length : 0;
  m.share = typeof TR !== 'undefined' && TR.share ? 1 : 0;
  const oh = typeof opnHist === 'function' ? opnHist() : [];
  m.opens = Math.max(c.op || 0, oh.length); m.openWin = Math.max(c.ow || 0, oh.filter(x => x.paid != null && x.v > x.paid).length);
  m.openBest = Math.max(c.ob || 0, ...oh.map(x => (x.rows || []).reduce((a, r) => Math.max(a, Number(r[3]) || 0), 0)));
  m.days = c.days || 0;
  let first = 0; try { first = Number(localStorage.getItem(OB_KEY)) || 0; } catch (e) { /* stockage indisponible */ }
  m.age = first > 1e12 ? Math.floor((Date.now() - first) / 864e5) : 0;
  m.sau = c.sau || 0; m.snt = c.snt || 0; m.sel = c.sel || 0; m.pq = c.pq || 0; m.rp = c.rp || 0; m.hd = c.hd || 0; m.gmo = c.gmo || 0; m.gfu = c.gfu || 0;
  m.oc = Math.max(c.oc || 0, oh.reduce((a, x) => a + (Number(x.n) || 0), 0)); m.ost = Math.max(c.ost || 0, oh.filter(x => x.st).length); m.dsb = c.dsb || 0;
  let ps = 0, jp = 0; try { for (const k in COLL.map) { let q = 0; for (const [g, n] of collLines(COLL.map[k])) { q += n; if (lineLang(g) === 'jp') jp += n; } if (q >= 4) ps++; } } catch (e) { /* collection pas encore lue */ }
  m.playsets = ps; m.jpc = jp; m.dsh = typeof TR !== 'undefined' && TR.dsh ? Object.keys(TR.dsh).length : 0;
  m.guests = mine.filter(e => e.x.places.some(p => p.sorte === 'invite')).length;
  m.nightG = mine.filter(e => { const h = new Date(e.x.date + e.x.duree * 1000).getHours(); return h < 5; }).length;
  m.tour = typeof tourRead === 'function' && tourRead().fin ? 1 : 0; m.dark = typeof S !== 'undefined' && S.theme === 'dark' ? 1 : 0;
  m.imp = c.imp ? 1 : 0;      // import d'un CSV (ManaBox, Moxfield…) : compté depuis le 16 octobre
  m.fb = c.fb ? 1 : 0; m.rt = c.rt ? 1 : 0; m.inst = c.in ? 1 : 0; m.tst = c.tst ? 1 : 0;
  const dl = PRG.dly || {}; m.dy = id => Number(dl[id]) || 0;
  return m;
}

/* ── Badges ─────────────────────────────────────────────────────────────────────────────────────────────────── */
/* { id, cat, ic, t (nom), d ([singulier, pluriel] de « {n} … » ; money : seuil en centimes), tiers (bronze → diamant ; [1] : unique), v (mesure) }. */
const PRG_CATS = [['scan', 'Scan'], ['coll', 'Collection'], ['deck', 'Decks'], ['game', 'Parties'], ['social', 'Échanges et amis'], ['open', 'Ouvertures'], ['daily', 'Carte mystère'], ['fid', 'Fidélité'], ['fun', 'Secrets']];
const PRG_CITY = [['de', 'Berlin', '🇩🇪'], ['es', 'Madrid', '🇪🇸'], ['it', 'Rome', '🇮🇹'], ['pt', 'Lisbonne', '🇵🇹'], ['ru', 'Moscou', '🇷🇺'], ['jp', 'Tokyo', '🇯🇵'], ['kr', 'Séoul', '🇰🇷'], ['zhcn', 'Pékin', '🏮'], ['zhtw', 'Taipei', '🏯']];
const PRG_BADGES = [
  { id: 'sc_cards', cat: 'scan', ic: '🔍', t: 'Scanner', d: ['{n} carte scannée', '{n} cartes scannées'], tiers: [100, 1000, 10000, 100000], v: m => m.sc },
  { id: 'sc_langs', cat: 'scan', ic: '🌍', t: 'Polyglotte', d: ['{n} langue scannée', '{n} langues scannées'], tiers: [2, 4, 7, 11], v: m => m.slangs },
  { id: 'sc_read', cat: 'scan', ic: '🔎', t: 'Œil de lynx', d: ['{n} édition lue sur la carte', '{n} éditions lues sur la carte'], tiers: [10, 100, 1000, 10000], v: m => m.sr },
  { id: 'sc_art', cat: 'scan', ic: '🎨', t: 'Œil d\'artiste', d: ['{n} édition reconnue à l\'illustration', '{n} éditions reconnues à l\'illustration'], tiers: [10, 100, 1000, 10000], v: m => m.sa },
  { id: 'sc_session', cat: 'scan', ic: '🏃', t: 'Marathon', d: ['{n} carte ajoutée d\'un coup', '{n} cartes ajoutées d\'un coup'], tiers: [50, 200, 500, 1000], v: m => m.ss },
  { id: 'sc_old', cat: 'scan', ic: '🏺', t: 'Archéologue', d: ['{n} carte d\'avant 2003 scannée', '{n} cartes d\'avant 2003 scannées'], tiers: [1, 10, 100, 1000], v: m => m.so },
  { id: 'sc_price', cat: 'scan', ic: '💰', t: 'Chasseur de trésor', money: 'Une carte scannée à {p} ou plus', tiers: [1000, 5000, 20000, 100000], v: m => m.sp },
  { id: 'sc_homonym', cat: 'scan', ic: '🕵️', t: 'Détective', d: ['{n} homonyme démasqué', '{n} homonymes démasqués'], tiers: [1, 10, 50, 200], v: m => m.sh },
  { id: 'sc_new', cat: 'scan', ic: '🚀', t: 'Avant-première', d: ['{n} extension scannée la semaine de sa sortie', '{n} extensions scannées la semaine de leur sortie'], tiers: [1, 5, 10, 25], v: m => m.sn },
  ...PRG_CITY.map(([l, city, ic]) => ({ id: 'sc_city_' + l, cat: 'scan', ic, t: city, one: 'Une carte scannée dans cette langue', tiers: [1], v: m => m.sl(l) })),
  { id: 'co_copies', cat: 'coll', ic: '📚', t: 'Collectionneur', d: ['{n} exemplaire', '{n} exemplaires'], tiers: [100, 1000, 10000, 100000], v: m => m.copies },
  { id: 'co_distinct', cat: 'coll', ic: '📖', t: 'Encyclopédie', d: ['{n} carte différente', '{n} cartes différentes'], tiers: [100, 1000, 5000, 20000], v: m => m.distinct },
  { id: 'co_value', cat: 'coll', ic: '💎', t: 'Trésor', money: 'Une collection de {p} ou plus', tiers: [10000, 100000, 1000000, 10000000], v: m => m.value },
  { id: 'co_foil', cat: 'coll', ic: '✨', t: 'Brillant', d: ['{n} foil', '{n} foils'], tiers: [10, 100, 1000, 10000], v: m => m.foil },
  { id: 'co_langs', cat: 'coll', ic: '🗣️', t: 'Babel', d: ['{n} langue dans la collection', '{n} langues dans la collection'], tiers: [2, 4, 7, 11], v: m => m.clangs },
  { id: 'co_sets', cat: 'coll', ic: '🧭', t: 'Explorateur', d: ['{n} extension', '{n} extensions'], tiers: [10, 50, 150, 400], v: m => m.sets },
  { id: 'co_proxy', cat: 'coll', ic: '🖨️', t: 'Faussaire assumé', d: ['{n} proxy', '{n} proxys'], tiers: [1, 10, 50, 200], v: m => m.prox },
  { id: 'co_places', cat: 'coll', ic: '🗄️', t: 'Bien rangé', d: ['{n} emplacement', '{n} emplacements'], tiers: [1, 5, 20, 50], v: m => m.places },
  { id: 'co_placed', cat: 'coll', ic: '📦', t: 'Archiviste', d: ['{n} carte rangée', '{n} cartes rangées'], tiers: [100, 1000, 10000, 50000], v: m => m.placed },
  { id: 'co_import', cat: 'coll', ic: '🚚', t: 'Déménageur', one: 'Collection importée depuis une autre appli', tiers: [1], v: m => m.imp },
  { id: 'co_wish', cat: 'coll', ic: '⭐', t: 'Rêveur', d: ['{n} carte recherchée', '{n} cartes recherchées'], tiers: [10, 50, 200, 1000], v: m => m.wish },
  { id: 'dk_count', cat: 'deck', ic: '🏗️', t: 'Architecte', d: ['{n} deck', '{n} decks'], tiers: [1, 5, 20, 50], v: m => m.decks },
  { id: 'dk_eng', cat: 'deck', ic: '🛡️', t: 'Monteur', d: ['{n} deck monté', '{n} decks montés'], tiers: [1, 3, 10, 25], v: m => m.eng },
  { id: 'dk_pub', cat: 'deck', ic: '📣', t: 'Influenceur', d: ['{n} deck publié', '{n} decks publiés'], tiers: [1, 3, 10, 25], v: m => m.pub },
  { id: 'dk_cmd', cat: 'deck', ic: '👑', t: 'Commandant', d: ['{n} commandant joué', '{n} commandants joués'], tiers: [1, 5, 15, 40], v: m => m.cmds },
  { id: 'gm_played', cat: 'game', ic: '🎲', t: 'Joueur', d: ['{n} partie', '{n} parties'], tiers: [1, 25, 100, 500], v: m => m.games },
  { id: 'gm_wins', cat: 'game', ic: '🏆', t: 'Vainqueur', d: ['{n} victoire', '{n} victoires'], tiers: [1, 10, 50, 250], v: m => m.wins },
  { id: 'gm_revenant', cat: 'game', ic: '🧟', t: 'Revenant', d: ['{n} victoire après être tombé à 5 PV ou moins', '{n} victoires après être tombé à 5 PV ou moins'], tiers: [1, 5, 20, 50], v: m => m.gv },
  { id: 'gm_killer', cat: 'game', ic: '🗡️', t: 'Bourreau', d: ['{n} élimination aux blessures de commandant', '{n} éliminations aux blessures de commandant'], tiers: [1, 10, 50, 200], v: m => m.gk },
  { id: 'gm_loyal', cat: 'game', ic: '🤝', t: 'Fidèle', d: ['{n} victoire avec le même deck', '{n} victoires avec le même deck'], tiers: [3, 10, 25, 100], v: m => m.deckWins },
  { id: 'gm_streak', cat: 'game', ic: '🔥', t: 'Invincible', d: ['{n} victoire d\'affilée', '{n} victoires d\'affilée'], tiers: [2, 3, 5, 10], v: m => m.streak },
  { id: 'gm_fast', cat: 'game', ic: '⚡', t: 'Éclair', d: ['{n} victoire en 6 tours ou moins', '{n} victoires en 6 tours ou moins'], tiers: [1, 5, 20, 50], v: m => m.fast },
  { id: 'gm_long', cat: 'game', ic: '⏳', t: 'Marathonien', d: ['{n} partie de plus de 2 h', '{n} parties de plus de 2 h'], tiers: [1, 5, 20, 50], v: m => m.long },
  { id: 'gm_table', cat: 'game', ic: '🍕', t: 'Grande tablée', d: ['{n} partie à 6 joueurs ou plus', '{n} parties à 6 joueurs ou plus'], tiers: [1, 5, 20, 50], v: m => m.big },
  { id: 'gm_opps', cat: 'game', ic: '👥', t: 'Globe-trotter', d: ['{n} adversaire différent', '{n} adversaires différents'], tiers: [5, 20, 50, 200], v: m => m.opps },
  { id: 'gm_host', cat: 'game', ic: '🎙️', t: 'Maître du jeu', d: ['{n} partie lancée sur ton téléphone', '{n} parties lancées sur ton téléphone'], tiers: [1, 25, 100, 500], v: m => m.host },
  { id: 'so_trade', cat: 'social', ic: '🔄', t: 'Négociant', d: ['{n} échange en direct', '{n} échanges en direct'], tiers: [1, 10, 50, 200], v: m => m.trades },
  { id: 'so_friends', cat: 'social', ic: '💬', t: 'Populaire', d: ['{n} ami', '{n} amis'], tiers: [1, 10, 50, 150], v: m => m.friends },
  { id: 'so_share', cat: 'social', ic: '🔗', t: 'Vitrine', one: 'Une liste d\'échange partagée', tiers: [1], v: m => m.share },
  { id: 'op_sessions', cat: 'open', ic: '🎁', t: 'Ouvreur', d: ['{n} ouverture', '{n} ouvertures'], tiers: [1, 10, 50, 200], v: m => m.opens },
  { id: 'op_profit', cat: 'open', ic: '📈', t: 'Rentable', d: ['{n} ouverture gagnante', '{n} ouvertures gagnantes'], tiers: [1, 5, 20, 50], v: m => m.openWin },
  { id: 'op_jackpot', cat: 'open', ic: '🌟', t: 'Jackpot', money: 'Une carte ouverte à {p} ou plus', tiers: [2000, 10000, 50000, 200000], v: m => m.openBest },
  { id: 'dy_played', cat: 'daily', ic: '🃏', t: 'Détective du jour', d: ['{n} carte mystère jouée', '{n} cartes mystère jouées'], tiers: [1, 7, 30, 365], v: m => m.dy('played') },
  { id: 'dy_streak', cat: 'daily', ic: '📅', t: 'Assidu', d: ['{n} jour d\'affilée', '{n} jours d\'affilée'], tiers: [3, 7, 30, 100], v: m => m.dy('streak') },
  { id: 'dy_top', cat: 'daily', ic: '🥇', t: 'Top 100', d: ['Une fois dans le top 100 du jour', '{n} fois dans le top 100 du jour'], tiers: [1, 5, 20, 100], v: m => m.dy('top100') },
  { id: 'dy_win', cat: 'daily', ic: '👑', t: 'Champion du jour', d: ['Une fois premier du jour', '{n} fois premier du jour'], tiers: [1, 3, 10, 30], v: m => m.dy('first') },
  { id: 'dy_eye', cat: 'daily', ic: '👁️', t: 'Coup d\'œil', one: 'Trouvée au premier indice', tiers: [1], v: m => m.dy('stage1') },
  { id: 'fi_days', cat: 'fid', ic: '🗓️', t: 'Habitué', d: ['{n} jour avec Mana Orbit', '{n} jours avec Mana Orbit'], tiers: [7, 30, 100, 365], v: m => m.days },
  { id: 'fi_age', cat: 'fid', ic: '🎂', t: 'Ancien', d: ['{n} jour depuis ta première visite', '{n} jours depuis ta première visite'], tiers: [30, 180, 365, 1095], v: m => m.age },
  { id: 'fi_streak', cat: 'fid', ic: '🔁', t: 'Fidèle au poste', d: ['{n} jour d\'affilée', '{n} jours d\'affilée'], tiers: [7, 30, 100, 365], v: m => m.dsb },
  { id: 'sc_auto', cat: 'scan', ic: '🤖', t: 'Pilote automatique', d: ['{n} carte ajoutée en scan automatique', '{n} cartes ajoutées en scan automatique'], tiers: [50, 500, 5000, 50000], v: m => m.sau },
  { id: 'sc_night', cat: 'scan', ic: '🦉', t: 'Oiseau de nuit', d: ['{n} carte scannée entre minuit et 5 h', '{n} cartes scannées entre minuit et 5 h'], tiers: [10, 100, 1000, 5000], v: m => m.snt },
  { id: 'sc_morning', cat: 'scan', ic: '🐓', t: 'Lève-tôt', d: ['{n} carte scannée avant 7 h', '{n} cartes scannées avant 7 h'], tiers: [10, 100, 1000, 5000], v: m => m.sel },
  { id: 'sc_quick', cat: 'scan', ic: '🏷️', t: 'Estimateur', d: ['{n} prix rapide', '{n} prix rapides'], tiers: [10, 100, 1000, 5000], v: m => m.pq },
  { id: 'sc_report', cat: 'scan', ic: '🧪', t: 'Bêta-testeur', d: ['{n} scan signalé', '{n} scans signalés'], tiers: [1, 5, 20, 50], v: m => m.rp },
  { id: 'co_playset', cat: 'coll', ic: '🎴', t: 'Playset', d: ['{n} carte en 4 exemplaires ou plus', '{n} cartes en 4 exemplaires ou plus'], tiers: [10, 100, 500, 2000], v: m => m.playsets },
  { id: 'co_jp', cat: 'coll', ic: '🎌', t: 'Japonisant', d: ['{n} carte japonaise', '{n} cartes japonaises'], tiers: [1, 10, 100, 1000], v: m => m.jpc },
  { id: 'dk_hand', cat: 'deck', ic: '✋', t: 'Mélangeur', d: ['{n} main de départ tirée', '{n} mains de départ tirées'], tiers: [10, 100, 500, 2000], v: m => m.hd },
  { id: 'dk_share', cat: 'deck', ic: '📤', t: 'Partageur', d: ['{n} deck partagé en lien', '{n} decks partagés en lien'], tiers: [1, 5, 20, 50], v: m => m.dsh },
  { id: 'gm_monarch', cat: 'game', ic: '👸', t: 'Monarque', d: ['{n} partie finie en monarque', '{n} parties finies en monarque'], tiers: [1, 5, 20, 50], v: m => m.gmo },
  { id: 'gm_flawless', cat: 'game', ic: '💯', t: 'Intouchable', d: ['{n} victoire sans perdre un point de vie', '{n} victoires sans perdre un point de vie'], tiers: [1, 5, 20, 50], v: m => m.gfu },
  { id: 'gm_guests', cat: 'game', ic: '🫂', t: 'Hôte accueillant', d: ['{n} partie avec des invités', '{n} parties avec des invités'], tiers: [1, 10, 50, 200], v: m => m.guests },
  { id: 'gm_night', cat: 'game', ic: '🌙', t: 'Nocturne', d: ['{n} partie finie après minuit', '{n} parties finies après minuit'], tiers: [1, 5, 20, 50], v: m => m.nightG },
  { id: 'op_cards', cat: 'open', ic: '🧾', t: 'Déballeur', d: ['{n} carte ouverte', '{n} cartes ouvertes'], tiers: [100, 1000, 5000, 20000], v: m => m.oc },
  { id: 'op_stream', cat: 'open', ic: '🎥', t: 'Streamer', d: ['{n} ouverture en mode streamer', '{n} ouvertures en mode streamer'], tiers: [1, 5, 20, 50], v: m => m.ost },
  { id: 'fx_tour', cat: 'fun', ic: '🗺️', t: 'Guide', one: 'Visite guidée terminée', tiers: [1], v: m => m.tour },
  { id: 'fx_dark', cat: 'fun', ic: '🌑', t: 'Côté obscur', one: 'Thème sombre choisi', tiers: [1], v: m => m.dark },
  { id: 'fx_feedback', cat: 'fun', ic: '📮', t: 'Voix du peuple', one: 'Un avis envoyé', tiers: [1], v: m => m.fb },
  { id: 'fx_rate', cat: 'fun', ic: '❤️', t: 'Fan', one: 'Mana Orbit notée sur le Play Store', tiers: [1], v: m => m.rt },
  { id: 'fx_install', cat: 'fun', ic: '📲', t: 'Installé', one: 'Mana Orbit installée sur ton téléphone', tiers: [1], v: m => m.inst },
  { id: 'fx_test', cat: 'fun', ic: '🧭', t: 'Pionnier', one: 'Venu essayer les nouveautés avant tout le monde', tiers: [1], v: m => m.tst },
];
/** Noms des paliers argent, or et diamant (bronze : le titre du badge) : le badge change de nom en montant. */
const PRG_NAMES = {
  sc_cards: ['Scanner chevronné', 'Maître du scan', 'Oracle du scan'],
  sc_langs: ['Interprète', 'Diplomate', 'Langue universelle'],
  sc_read: ['Œil d\'aigle', 'Regard perçant', 'Œil omniscient'],
  sc_art: ['Amateur d\'art', 'Conservateur', 'Grand mécène'],
  sc_session: ['Ultra-trail', 'Forçat du scan', 'Machine infatigable'],
  sc_old: ['Antiquaire', 'Gardien des reliques', 'Mémoire de Dominaria'],
  sc_price: ['Dénicheur de pépites', 'Chercheur d\'or', 'Roi Midas'],
  sc_homonym: ['Inspecteur', 'Commissaire', 'Fin limier'],
  sc_new: ['Initié', 'Éclaireur', 'Visionnaire'],
  co_copies: ['Accumulateur', 'Thésauriseur', 'Dragon sur son trésor'],
  co_distinct: ['Érudit', 'Grand bibliothécaire', 'Mémoire du Multivers'],
  co_value: ['Coffre-fort', 'Salle des coffres', 'Trésor du dragon'],
  co_foil: ['Étincelant', 'Éblouissant', 'Aveuglant'],
  co_langs: ['Tour de Babel', 'Cité cosmopolite', 'Multivers'],
  co_sets: ['Cartographe', 'Voyageur des plans', 'Arpenteur du Multivers'],
  co_proxy: ['Imprimeur', 'Faux-monnayeur', 'Maître faussaire'],
  co_places: ['Organisé', 'Maniaque du rangement', 'Ordre absolu'],
  co_placed: ['Documentaliste', 'Gardien des archives', 'Grand archiviste'],
  co_wish: ['Utopiste', 'Insatiable', 'Lettre au Père Noël'],
  dk_count: ['Bâtisseur', 'Maître d\'œuvre', 'Bâtisseur de mondes'],
  dk_eng: ['Assembleur', 'Forgeron de decks', 'Grand forgeron'],
  dk_pub: ['Créateur', 'Leader d\'opinion', 'Star du Multivers'],
  dk_cmd: ['Général', 'Maréchal', 'Seigneur de guerre'],
  gm_played: ['Habitué des tables', 'Vétéran', 'Légende des tables'],
  gm_wins: ['Champion', 'Conquérant', 'Empereur'],
  gm_revenant: ['Survivant', 'Phénix', 'Immortel'],
  gm_killer: ['Exécuteur', 'Faucheur', 'Fléau des commandants'],
  gm_loyal: ['Dévoué', 'Inséparable', 'Lié pour la vie'],
  gm_streak: ['Inarrêtable', 'Implacable', 'Divin'],
  gm_fast: ['Foudre', 'Tempête', 'Cataclysme'],
  gm_long: ['Endurant', 'Inépuisable', 'Éternel'],
  gm_table: ['Banquet', 'Festin royal', 'Fête du Multivers'],
  gm_opps: ['Grand voyageur', 'Ambassadeur', 'Citoyen du Multivers'],
  gm_host: ['Organisateur', 'Animateur de soirées', 'Seigneur des tables'],
  so_trade: ['Marchand', 'Magnat', 'Prince des marchands'],
  so_friends: ['Sociable', 'Célèbre', 'Icône'],
  op_sessions: ['Briseur de sceaux', 'Pilleur de boosters', 'Seigneur des boosters'],
  op_profit: ['Avisé', 'Investisseur', 'Roi de la bourse'],
  op_jackpot: ['Coup de chance', 'Main en or', 'Élu de la chance'],
  dy_played: ['Enquêteur', 'Profileur', 'Cerveau'],
  dy_streak: ['Régulier', 'Infatigable', 'Rituel sacré'],
  dy_top: ['Élite', 'Crème de la crème', 'Panthéon'],
  dy_win: ['Roi du jour', 'Empereur du jour', 'Génie'],
  fi_days: ['Familier', 'Pilier', 'Fait partie des meubles'],
  fi_age: ['Doyen', 'Sage', 'Ancêtre'],
  fi_streak: ['Inébranlable', 'Indéfectible', 'Gardien éternel'],
  sc_auto: ['Cyborg', 'Chaîne de montage', 'Usine de Mishra'],
  sc_night: ['Noctambule', 'Vampire', 'Seigneur de la nuit'],
  sc_morning: ['Matinal', 'Aube dorée', 'Soleil levant'],
  sc_quick: ['Expert', 'Commissaire-priseur', 'Oracle des prix'],
  sc_report: ['Testeur aguerri', 'Chasseur de bugs', 'Gardien du scan'],
  co_playset: ['Quatuor', 'Arsenal', 'Armurerie'],
  co_jp: ['Otaku', 'Samouraï', 'Shogun'],
  dk_hand: ['Croupier', 'Prestidigitateur', 'Maître du mulligan'],
  dk_share: ['Généreux', 'Mentor', 'Bienfaiteur'],
  gm_monarch: ['Souverain', 'Dynastie', 'Couronne éternelle'],
  gm_flawless: ['Invulnérable', 'Indestructible', 'Divinité'],
  gm_guests: ['Maison ouverte', 'Recruteur', 'Évangéliste'],
  gm_night: ['Couche-tard', 'Insomniaque', 'Créature de la nuit'],
  op_cards: ['Ouvre-tout', 'Dévoreur de boosters', 'Trou noir'],
  op_stream: ['Animateur', 'Vedette', 'Star du direct'],
};
/** Nom d'un badge à son palier (pas encore obtenu : le nom du bronze). */
const prgName = (b, t) => T(t >= 1 && PRG_NAMES[b.id] ? PRG_NAMES[b.id][t - 1] : b.t);
/** Icône d'un badge à son palier : dessin SVG (badgeart.js) s'il existe, sinon l'emoji. */
const prgIc = (b, t) => (typeof badgeSvg === 'function' ? badgeSvg(b.id, t) : esc(b.ic));
/** Palier atteint d'un badge : -1 (aucun), 0 (bronze) … 3 (diamant) ; unique : 0. */
const prgTier = (b, v) => { let t = -1; b.tiers.forEach((x, i) => { if (v >= x) t = i; }); return t; };
/** Texte d'un palier (« 1 000 cartes scannées », « Une carte scannée à 50 € ou plus »). */
function prgLabel(b, x) {
  if (b.money) return T(b.money, { p: fmt(x, 'EUR').replace(/[,.]00(?=\s|$| )/, '') });
  if (b.one) return T(b.one);
  return TN(x, b.d[0], b.d[1], { n: nf0(x) });
}
/** Points d'XP d'un palier : bronze 100, argent 400, or 2 000, diamant 10 000 ; unique 500. */
const prgTierXp = (b, t) => (t < 0 ? 0 : b.tiers.length === 1 ? 500 : [100, 500, 2500, 12500].slice(0, t + 1).reduce((a, x) => a + x, 0));
/** Badges du moment : [{ b, v, t (palier atteint), next (prochain seuil ou null) }] ; Carte mystère seulement si le jeu existe. */
function prgBadges(m = prgMetrics()) {
  const daily = typeof dailyBadges === 'function';
  return PRG_BADGES.filter(b => b.cat !== 'daily' || daily).map(b => { const v = Math.max(0, Number(b.v(m)) || 0), t = prgTier(b, v); return { b, v, t, next: b.tiers[t + 1] ?? null }; });
}

/* ── XP et niveau ─────────────────────────────────────────────────────────────────────────────────────────── */
const PRG_W = { sc: 3, sr: 1, copies: 1, distinct: 2, decks: 25, eng: 150, pub: 60, games: 40, wins: 80, trades: 60, friends: 25, opens: 50, days: 15 };
/** XP totale : activités pondérées, paliers des badges, parties de la Carte mystère. */
function prgXp(m = prgMetrics(), bs = prgBadges(m)) {
  let xp = 0; for (const [k, w] of Object.entries(PRG_W)) xp += (Number(m[k]) || 0) * w;
  for (const x of bs) xp += prgTierXp(x.b, x.t);
  return Math.round(xp + m.dy('played') * 50 + m.dy('points') / 10);
}
/** XP pour atteindre le niveau L (1 : 0 ; 999 : ≈ 224 millions). */
const prgXpFor = L => Math.round(40 * Math.pow(Math.max(0, L - 1), 2.25));
/** { lv, xp, cur (XP du niveau), nxt (XP du suivant, null au 999) }. */
function prgLevel(xp) {
  let lo = 1, hi = PRG_MAX; while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (prgXpFor(mid) <= xp) lo = mid; else hi = mid - 1; }
  return { lv: lo, xp, cur: prgXpFor(lo), nxt: lo >= PRG_MAX ? null : prgXpFor(lo + 1) };
}
/** Niveau du moment (calcul complet). */
function prgNow() { const m = prgMetrics(), bs = prgBadges(m), L = prgLevel(prgXp(m, bs)); return { m, bs, ...L }; }

/* ── Nouveaux paliers : une bannière qui s'efface seule (jamais au premier calcul, ni en mode streamer) ───────────── */
function prgSoon() { if (typeof MO_TEST === 'undefined' || !MO_TEST) return; clearTimeout(PRG.t); PRG.t = setTimeout(prgCheck, 2500); }      // lien de test seulement : ailleurs, les compteurs avancent sans rien montrer
function prgCheck() {
  let got = null; try { got = JSON.parse(localStorage.getItem(PRG_GOT) || 'null'); } catch (e) { got = null; }
  const bs = prgBadges(), now = {}; for (const x of bs) if (x.t >= 0) now[x.b.id] = x.t;
  try { localStorage.setItem(PRG_GOT, JSON.stringify(now)); } catch (e) { /* stockage indisponible : pas de toast plutôt que des répétitions */ return; }
  if (!got || typeof got !== 'object') return;      // premier calcul : tout ce qui existe déjà est acquis sans bruit
  const fresh = bs.filter(x => x.t >= 0 && (got[x.b.id] == null || got[x.b.id] < x.t));
  if (!fresh.length || (typeof streamOn === 'function' && streamOn())) return;
  fresh.sort((a, b) => b.t - a.t || (a.b.tiers.length === 1) - (b.b.tiers.length === 1));      // le palier le plus haut d'abord
  prgPop(fresh[0], fresh.length - 1);
  if (typeof meOpen === 'function' && meOpen()) mePaint();
}
/**
 * Bannière d'un nouveau palier, en haut de l'écran : icône, « Nouveau badge » ou « Palier argent », nom du palier, ce qu'il récompense (« +2 autres » s'il y en a plus).
 * Un appui ouvre la fiche sur ce badge ; elle s'efface seule (4,5 s, le temps de lire ; doigt posé : elle attend), ou d'un glissé vers le haut.
 */
function prgPop(x, more) {
  const old = document.querySelector('.prg-pop'); if (old) old.remove();
  const b = x.b, uniq = b.tiers.length === 1, el = document.createElement('button');
  el.type = 'button'; el.className = 'prg-pop ' + (uniq ? 'tu' : 't' + x.t); el.setAttribute('role', 'status'); el.setAttribute('aria-live', 'polite');
  const head = uniq || x.t === 0 ? T('Nouveau badge') : T('Palier {tier} atteint', { tier: prgTierName(x.t) });
  el.innerHTML = `<span class="prg-pop-ic" aria-hidden="true">${prgIc(b, x.t)}</span><span class="prg-pop-t"><small>${esc(head)}</small><b>${esc(prgName(b, x.t))}</b><span>${esc(prgLabel(b, b.tiers[x.t]))}${more > 0 ? ' · ' + esc(TN(more, '+{n} autre', '+{n} autres')) : ''}</span></span>`;
  document.body.appendChild(el);
  let t = 0, y0 = null; const hide = () => { clearTimeout(t); el.classList.remove('on'); setTimeout(() => el.remove(), reduceMotion() ? 0 : 320); };
  const arm = ms => { clearTimeout(t); t = setTimeout(hide, ms); };
  el.addEventListener('click', () => { hide(); prgSheet(b.id); });
  el.addEventListener('pointerdown', e => { clearTimeout(t); y0 = e.clientY; });
  el.addEventListener('pointerup', e => { if (y0 != null && e.clientY - y0 < -24) { e.preventDefault(); hide(); } else arm(2500); y0 = null; });
  el.addEventListener('pointercancel', () => { y0 = null; arm(2500); });
  requestAnimationFrame(() => el.classList.add('on')); haptic('ok'); arm(4500);
  return el;
}

/* ── Dans le compte : users/{uid}/meta/progress (le plus grand de chaque compteur) ──────────────────────────── */
function prgUser(user) {
  const d = PRG.doc; if (d.unsub) { try { d.unsub(); } catch (e) { /* ignore */ } d.unsub = null; } clearTimeout(d.pushT); d.pushT = 0; d.uid = '';
  if (!user || !D.cloud || !D.cloud.watchMeta) return;
  d.uid = user.uid;
  d.unsub = D.cloud.watchMeta(user.uid, 'progress', (data, pending, fromCache) => {
    if (pending || fromCache || D.uid !== user.uid) return;
    const r = prgClean(data && data.c), c = prgC(); let up = false, more = false;
    for (const [k, v] of Object.entries(r)) if (v > (c[k] || 0)) { c[k] = v; up = true; }
    for (const [k, v] of Object.entries(c)) if (v > (r[k] || 0)) more = true;
    if (up) { prgWrite(); prgSoon(); }
    if (more || !data) prgPushSoon();      // l'appareil en sait plus que le compte : envoyé
  }, () => { /* règles pas encore publiées : compteurs gardés sur l'appareil */ });
}
function prgPushSoon() { const d = PRG.doc; if (!d.uid) return; clearTimeout(d.pushT); d.pushT = setTimeout(prgPush, 4000); }
async function prgPush() {
  const d = PRG.doc; clearTimeout(d.pushT); d.pushT = 0;
  if (!d.uid || (typeof acctHeld === 'function' && acctHeld(d.uid)) || (typeof cloudOn === 'function' && !cloudOn()) || !D.cloud.saveMeta) return;
  try { await D.cloud.saveMeta(d.uid, 'progress', { c: prgClean(prgC()), updatedAt: Date.now() }); } catch (e) { /* hors ligne, règles : renvoyé au prochain changement */ }
}
/** Badges de la Carte mystère (vérifiés par le serveur), lus à l'ouverture de la fiche. */
async function prgDaily() {
  if (typeof dailyBadges !== 'function') return;
  try { const l = await dailyBadges(); const o = {}; for (const x of Array.isArray(l) ? l : []) if (x && typeof x.id === 'string' && Number.isFinite(x.n)) o[x.id] = x.n; PRG.dly = o; } catch (e) { /* hors ligne : les derniers connus */ }
}

/* ── Vitrine : 3 badges au plus, choisis dans la fiche, montrés sur la liste d'échange publique (share.js › trPut, readShare) ─────────────── */
function prgShowIds() { try { const a = JSON.parse(localStorage.getItem(PRG_SHOW) || '[]'); return Array.isArray(a) ? a.filter(x => typeof x === 'string' && PRG_BADGES.some(b => b.id === x)).slice(0, PRG_SHOW_MAX) : []; } catch (e) { return []; } }
/** Ajoute ou retire un badge de la vitrine ; la liste d'échange publique suit (si elle existe). false : vitrine pleine. */
function prgShowToggle(id) {
  const a = prgShowIds(), i = a.indexOf(id);
  if (i >= 0) a.splice(i, 1); else if (a.length >= PRG_SHOW_MAX) return false; else a.push(id);
  try { localStorage.setItem(PRG_SHOW, JSON.stringify(a)); } catch (e) { return false; }
  if (typeof TR !== 'undefined' && TR.share && typeof trChanged === 'function') trChanged();      // lien d'échange : republié avec la vitrine
  return true;
}
/** Champ du partage : { bg: [[id, palier]] } (badges obtenus seulement), ou rien. */
function prgShare() {
  const ids = prgShowIds(); if (!ids.length) return {};
  const bs = prgBadges(), bg = ids.map(id => bs.find(x => x.b.id === id)).filter(x => x && x.t >= 0).map(x => [x.b.id, x.t]);
  return bg.length ? { bg } : {};
}
/** Vitrine sur une liste d'échange reçue (bg relu par core.js › readShare). */
function prgShowHtml(bg) {
  const xs = (Array.isArray(bg) ? bg : []).map(([id, t]) => ({ b: PRG_BADGES.find(b => b.id === id), t })).filter(x => x.b && x.t < x.b.tiers.length);
  return xs.length ? `<div class="prg-show" aria-label="${esc(T('Badges'))}">${xs.map(x => `<span class="prg-chip ${x.b.tiers.length === 1 ? 'tu' : 't' + x.t}" title="${esc(prgLabel(x.b, x.b.tiers[x.t]))}"><span class="prg-ic" aria-hidden="true">${prgIc(x.b, x.t)}</span>${esc(prgName(x.b, x.t))}</span>`).join('')}</div>` : '';
}

/* ── Affichage ────────────────────────────────────────────────────────────────────────────────────────────── */
/** Pastille du niveau, à côté du compte (me.js). */
function prgPill() {
  let L; try { L = prgNow(); } catch (e) { return ''; }
  return `<button type="button" class="prg-pill" data-me="niveau" aria-label="${esc(T('Niveau {n} : niveau et badges', { n: L.lv }))}">${esc(T('Niv. {n}', { n: L.lv }))}</button>`;
}
/** Fiche « Niveau et badges » ; focus : identifiant d'un badge à montrer (bannière d'un nouveau palier). */
function prgSheet(focus) {
  openSheet(T('Niveau et badges'), '', api => {
    api.wrap.classList.add('prg-sheet');
    const paint = () => {
      const show = prgShowIds(), L = prgNow(), pct = L.nxt ? Math.max(0, Math.min(100, ((L.xp - L.cur) / (L.nxt - L.cur)) * 100)) : 100;
      const got = L.bs.reduce((a, x) => a + (x.t + 1), 0), all = L.bs.reduce((a, x) => a + x.b.tiers.length, 0);
      const tile = x => {
        const b = x.b, uniq = b.tiers.length === 1, cls = x.t < 0 ? 'off' : uniq ? 'tu' : 't' + x.t, nxt = x.next, prev = x.t >= 0 ? b.tiers[x.t] : 0;
        const p = nxt == null ? 100 : Math.max(0, Math.min(100, ((x.v - (x.t >= 0 ? prev : 0)) / (nxt - (x.t >= 0 ? prev : 0))) * 100));
        const val = v => (b.money ? fmt(v, 'EUR').replace(/[,.]00(?=\s|$| )/, '') : nf0(v));
        const nm = prgName(b, x.t), pin = x.t >= 0 ? `<button type="button" class="prg-pin" data-pin="${b.id}" aria-pressed="${show.includes(b.id)}" aria-label="${esc(T('Montrer {name} sur ma liste d\'échange', { name: nm }))}">${show.includes(b.id) ? '📌' : '＋'}</button>` : '';
        return `<div class="prg-b ${cls}" data-b="${b.id}" title="${esc(nm)}">${pin}<span class="prg-ic" aria-hidden="true">${prgIc(b, x.t)}</span><b>${esc(nm)}</b>
          <small>${esc(x.t >= 0 ? prgLabel(b, b.tiers[x.t]) + (uniq ? '' : ' · ' + prgTierName(x.t)) : prgLabel(b, b.tiers[0]))}</small>
          ${nxt != null && !uniq ? `<span class="prg-mini" aria-hidden="true"><i style="width:${p.toFixed(1)}%"></i></span><small class="prg-nx">${esc(val(x.v))} / ${esc(val(nxt))}</small>${x.t >= 0 ? `<small class="prg-nn">${esc(T('Prochain : {name}', { name: prgName(b, x.t + 1) }))}</small>` : ''}` : ''}</div>`;
      };
      api.body.innerHTML = `<div class="prg-head"><div class="prg-lv"><small>${T('Niveau')}</small><b>${L.lv}</b></div><div class="prg-xp"><span class="prg-bar" aria-hidden="true"><i style="width:${pct.toFixed(1)}%"></i></span>
          <small>${L.nxt ? esc(T('{xp} XP · encore {d} XP avant le niveau {n}', { xp: nf0(L.xp), d: nf0(L.nxt - L.xp), n: L.lv + 1 })) : esc(T('{xp} XP · niveau maximum', { xp: nf0(L.xp) }))}</small></div></div>
        <p class="hint">${esc(TN(got, '{n} palier obtenu sur {t}', '{n} paliers obtenus sur {t}', { t: all }))} · ${esc(T('📌 : sur ta liste d\'échange ({n} / {m})', { n: show.length, m: PRG_SHOW_MAX }))}</p>
        ${PRG_CATS.map(([c, h]) => { const xs = L.bs.filter(x => x.b.cat === c); return xs.length ? `<p class="prg-h">${esc(T(h))}</p><div class="prg-grid">${xs.map(tile).join('')}</div>` : ''; }).join('')}
        <details class="prg-how"><summary>${T('Comment gagner de l\'XP ?')}</summary><p class="hint">${T('Tout compte : scanner, ajouter des cartes, monter et publier des decks, jouer et gagner des parties, échanger, ouvrir des boosters, revenir chaque jour, et chaque palier de badge (bronze, argent, or, diamant). Le niveau 999 est fait pour ne jamais être atteint.')}</p></details>`;
    };
    api.body.addEventListener('click', e => { const b = e.target.closest('[data-pin]'); if (!b) return; if (!prgShowToggle(b.dataset.pin)) { toast(T('3 badges au plus sur ta liste d\'échange')); return; } haptic('tap'); paint(); });
    const spot = () => { const el = focus && api.body.querySelector(`.prg-b[data-b="${focus}"]`); if (!el) return; el.scrollIntoView({ block: 'center', behavior: reduceMotion() ? 'auto' : 'smooth' }); el.classList.add('hl'); setTimeout(() => el.classList.remove('hl'), 2600); };
    paint(); if (focus) setTimeout(spot, 380);      // après l'ouverture de la fiche
    prgDaily().then(() => { if (sheets.includes(api)) paint(); });
  });
}

if (typeof module !== 'undefined' && module.exports) module.exports = { prgLevel, prgXpFor, prgTier, prgClean, PRG_BADGES, PRG_NAMES, PRG_MAX };
