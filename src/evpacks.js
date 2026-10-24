/* ── evpacks.js : événements saisonniers, les « packs » (données pures, sans rien du navigateur) ─────────────────────────────────────────────
   Un pack par fête : dates (calcul de Pâques compris), objets à trouver (nombre, quota par jour), palette, textes, badges, messages Discord.
   Ajouter une fête = ajouter un pack ici (et son dessin : evart.js, css/ev-<pack>.css, logos, police des badges) ; le moteur (event.js, event-srv.mjs) ne change pas.
   Lu tel quel par le serveur (event-srv.mjs, discord-events.mjs, tools/gen-event-badges.mjs : createRequire), comme sets.js et progress.js.
   Identifiant d'une édition : `<pack>-<année>` (halloween-2026) ; l'année est celle du début. Jour : heure de Paris, bascule à minuit (comme la Carte mystère).
   Règle des quotas : au moins EV_MIN_DAYS (6) jours de jeu pour tout trouver (total / quota par jour), sur une période d'environ deux semaines (15 jours).
   ready: false : pack préparé mais pas encore dessiné : jamais ouvert tout seul (seulement EVENT_FORCE=<id>, pour l'essayer sur /test). */
const EV_MIN_DAYS = 6, EV_TZ = 'Europe/Paris';
const EV_DAY_MS = 86400000;
/** Date « AAAA-MM-JJ » + n jours. */
const evAdd = (key, n) => new Date(Date.UTC(+key.slice(0, 4), +key.slice(5, 7) - 1, +key.slice(8, 10)) + n * EV_DAY_MS).toISOString().slice(0, 10);
/** Jours entre deux dates « AAAA-MM-JJ » (b − a). */
const evDiff = (a, b) => Math.round((Date.UTC(+b.slice(0, 4), +b.slice(5, 7) - 1, +b.slice(8, 10)) - Date.UTC(+a.slice(0, 4), +a.slice(5, 7) - 1, +a.slice(8, 10))) / EV_DAY_MS);
/** Dimanche de Pâques (calendrier grégorien, algorithme anonyme de Meeus/Jones/Butcher) : « AAAA-MM-JJ ». */
function evEaster(y) {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mo = Math.floor((h + l - 7 * m + 114) / 31), da = ((h + l - 7 * m + 114) % 31) + 1;
  return `${y}-${String(mo).padStart(2, '0')}-${String(da).padStart(2, '0')}`;
}
/** Période d'environ deux semaines centrée sur une date (« AAAA-MM-JJ ») : 7 jours avant, 7 après (15 jours). */
const evAround = (key, before = 7, after = 7) => ({ from: evAdd(key, -before), to: evAdd(key, after) });

/* Pack : { id, ready, name (français, clé de T), when (année → { from, to } inclus), total, perDay, obj (objet à trouver : one / many, emoji, fem, art (evart.js)),
   pal (couleurs : a principale, b secondaire, c accent ; css/ev-<id>.css les reprend), badge ({ t : nom de la série, tiers : seuils, names : nom de chaque palier }),
   font (police des chiffres de l'année : tools/gen-event-badges.mjs), txt (textes de l'appli, français : clés de T), dsc (messages Discord FR et EN) }.
   Textes : {n} nombre, {obj} / {objs} nom de l'objet, {y} année, {d} jours. */
const EV_PACKS = [
  { id: 'halloween', ready: true, name: 'Halloween', when: y => ({ from: `${y}-10-25`, to: `${y}-11-08` }), total: 30, perDay: 5,
    obj: { one: 'citrouille', many: 'citrouilles', emoji: '🎃', fem: true, art: 'pumpkin' },
    pal: { a: '#ff7a1a', b: '#7b3fe4', c: '#7ddc4a', ink: '#1a0f2e' }, font: 'spooky',
    badge: { t: 'Chasse aux citrouilles {y}', tiers: [1, 10, 20, 30], names: ['Apprenti chasseur', 'Traqueur de citrouilles', 'Maître des citrouilles', 'Seigneur d\'Halloween'] },
    txt: {
      title: 'La chasse aux citrouilles est ouverte', short: 'Chasse aux citrouilles',
      rules: ['{total} citrouilles se cachent dans l\'appli jusqu\'au {to}.', '{per} par jour au plus, à de nouvelles cachettes chaque matin.', 'Touche-les pour les récolter et gagner les badges d\'Halloween {y}.'],
      found: 'Bien vu !', left: ['Il te reste <b>{n} citrouille</b> à trouver aujourd\'hui', 'Il te reste <b>{n} citrouilles</b> à trouver aujourd\'hui'],
      dayDone: 'Tu as trouvé toutes les citrouilles du jour, reviens demain', allDone: 'Les {total} citrouilles sont à toi', allSub: 'Tu es Seigneur d\'Halloween {y} : un badge que peu de chasseurs auront.',
      label: 'Une citrouille cachée : touche-la pour la récolter', tip: 'Une citrouille ! Touche-la pour la récolter : {per} se cachent dans l\'appli chaque jour.',
      join: 'Crée un compte pour garder tes citrouilles sur tous tes appareils.', deco: 'Décorations d\'Halloween',
    },
    dsc: {
      soon: ['🎃 **La chasse aux citrouilles arrive dans 3 jours !** Du {from} au {to}, {total} citrouilles se cachent dans Mana Orbit : {per} par jour, des badges collector d\'Halloween {y} à la clé.', '🎃 **The pumpkin hunt starts in 3 days!** From {fromEn} to {toEn}, {total} pumpkins hide in Mana Orbit: {per} a day, with collectible Halloween {y} badges.'],
      open: ['🎃 **La chasse aux citrouilles est ouverte !** {total} citrouilles se cachent dans l\'appli jusqu\'au {to}, {per} par jour. Qui aura le grade ultime ?', '🎃 **The pumpkin hunt is on!** {total} pumpkins hide in the app until {toEn}, {per} a day. Who will reach the ultimate rank?'],
      mid: ['🕸️ **Mi-parcours de la chasse aux citrouilles** : il reste {d} jours. {h} chasseurs en piste, {full} déjà à {total}/{total}.', '🕸️ **Pumpkin hunt halfway point**: {d} days left. {h} hunters so far, {full} already at {total}/{total}.'],
      last: ['🦇 **Dernier jour de la chasse aux citrouilles !** Les dernières citrouilles disparaissent à minuit.', '🦇 **Last day of the pumpkin hunt!** The last pumpkins vanish at midnight.'],
      end: ['🎃 **La chasse aux citrouilles est terminée.** {h} chasseurs, {full} au grade ultime ({total}/{total}). Merci à tous, rendez-vous à la prochaine fête !', '🎃 **The pumpkin hunt is over.** {h} hunters, {full} reached the ultimate rank ({total}/{total}). Thanks everyone, see you at the next celebration!'],
    } },
  { id: 'noel', ready: false, name: 'Noël', when: y => ({ from: `${y}-12-12`, to: `${y}-12-26` }), total: 30, perDay: 5,
    obj: { one: 'cadeau', many: 'cadeaux', emoji: '🎁', fem: false, art: 'gift' },
    pal: { a: '#e23b3b', b: '#1f8a4c', c: '#f4c542', ink: '#0d1f17' }, font: 'frost',
    badge: { t: 'Cadeaux de Noël {y}', tiers: [1, 10, 20, 30], names: ['Lutin', 'Renne', 'Elfe en chef', 'Esprit de Noël'] },
    txt: { title: 'La chasse aux cadeaux est ouverte', short: 'Chasse aux cadeaux' } },
  { id: 'nouvelan', ready: false, name: 'Nouvel an', when: y => ({ from: `${y}-12-27`, to: evAdd(`${y}-12-27`, 14) }), total: 30, perDay: 5,
    obj: { one: 'étoile filante', many: 'étoiles filantes', emoji: '🎆', fem: true, art: 'star' },
    pal: { a: '#f2c230', b: '#3b3fd8', c: '#ff5fa2', ink: '#0b0d24' }, font: 'gala',
    badge: { t: 'Nouvel an {y}', tiers: [1, 10, 20, 30], names: ['Fêtard', 'Noctambule', 'Maître des feux', 'Étoile de l\'année'] },
    txt: { title: 'La chasse aux étoiles filantes est ouverte', short: 'Étoiles filantes' } },
  { id: 'paques', ready: false, name: 'Pâques', when: y => evAround(evEaster(y)), total: 30, perDay: 5,
    obj: { one: 'œuf', many: 'œufs', emoji: '🥚', fem: false, art: 'egg' },
    pal: { a: '#ffb3d1', b: '#8fd6a8', c: '#ffd36b', ink: '#2a1d2e' }, font: 'bloom',
    badge: { t: 'Œufs de Pâques {y}', tiers: [1, 10, 20, 30], names: ['Cueilleur', 'Dénicheur', 'Gardien du nid', 'Lapin d\'or'] },
    txt: { title: 'La chasse aux œufs est ouverte', short: 'Chasse aux œufs' } },
  { id: 'magic', ready: false, name: 'Anniversaire de Magic', when: y => evAround(`${y}-08-05`), total: 30, perDay: 5,
    obj: { one: 'bougie', many: 'bougies', emoji: '🕯️', fem: true, art: 'candle' },
    pal: { a: '#f2c230', b: '#7fb0ff', c: '#ff7a5c', ink: '#12142a' }, font: 'arcane',
    badge: { t: 'Anniversaire de Magic {y}', tiers: [1, 10, 20, 30], names: ['Invité', 'Fidèle', 'Archiviste', 'Arpenteur légendaire'] },
    txt: { title: 'La chasse aux bougies est ouverte', short: 'Chasse aux bougies' } },
];

/* ── Cachettes : une quarantaine d'endroits de l'appli (event.js › EV_HIDE dit où les poser). Le serveur tire celles du jour de chaque joueur parmi celles qu'il peut voir.
   need : ce qu'il faut pour que l'endroit existe (bits de EV_CAPS : envoyés par l'appli, ?c=) ; jamais sur le scan, l'échange en direct, le compteur de vie, une saisie de
   paiement ou de token, le premier lancement, la visite guidée ou le mode streamer. Identifiants stables (gardés dans les progressions) : ne jamais en renommer un. */
const EV_CAPS = { acct: 1, cards: 2, decks: 4, desk: 8, daily: 16, trade: 32, sets: 64, nat: 128 };
const EV_SPOTS = [
  ['home-orb', 0], ['home-trade', 0], ['home-life', 0], ['home-sets', 64], ['home-how', 0], ['home-start', 0], ['home-foryou', 0], ['home-stores', 8],
  ['coll-head', 0], ['coll-list', 2], ['coll-stats', 2], ['coll-value', 2], ['coll-places', 2], ['coll-filters', 2],
  ['trade-head', 0], ['trade-list', 32], ['trade-binder', 32],
  ['decks-mine', 0], ['decks-card', 4], ['decks-edh', 0], ['decks-price', 0],
  ['viewer-head', 4], ['viewer-stats', 4], ['viewer-find', 4], ['builder', 4],
  ['card-sheet', 2], ['card-text', 2], ['set-page', 64],
  ['me-head', 0], ['me-prefs', 0], ['me-more', 0], ['me-account', 1], ['me-level', 0],
  ['help-top', 0], ['help-faq', 0], ['set-help', 0], ['set-data', 0], ['set-conf', 0], ['set-notif', 0],
  ['daily-board', 16], ['friends', 1], ['masterset', 2],
].map(([id, need]) => ({ id, need }));

/* ── Calendrier ─────────────────────────────────────────────────────────────────────────────────────────────────── */
let EV_FMT = null;
/** Date et heure à Paris d'un instant (ms) : [année, mois, jour, heure, minute, seconde] (sans ICU : UTC). */
function evParts(t) {
  if (EV_FMT === null) { try { EV_FMT = new Intl.DateTimeFormat('en-US', { timeZone: EV_TZ, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' }); } catch (e) { EV_FMT = false; } }
  if (!EV_FMT) { const d = new Date(t); return [d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate(), d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds()]; }
  const o = {}; for (const p of EV_FMT.formatToParts(t)) o[p.type] = Number(p.value);
  return [o.year, o.month, o.day, o.hour % 24, o.minute, o.second];
}
/** Jour à Paris d'un instant (ms) : « AAAA-MM-JJ ». */
function evDay(t) { const [y, m, d] = evParts(t); return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`; }
/** Minuit (Paris) qui suit un instant : prochaine bascule du jour (ms). Deux passes : juste au changement d'heure. */
function evNextMidnight(t) {
  const key = evAdd(evDay(t), 1), wall = Date.UTC(+key.slice(0, 4), +key.slice(5, 7) - 1, +key.slice(8, 10));
  const off = x => { const [y, mo, d, h, mi, s] = evParts(x); return Date.UTC(y, mo - 1, d, h, mi, s) - Math.floor(x / 1000) * 1000; };
  let g = wall - off(wall); g = wall - off(g); return g;
}
/** Quota par jour d'un pack (règle : au moins EV_MIN_DAYS jours pour tout trouver). */
const evPerDay = p => Math.max(1, Math.min(p.perDay || Math.floor(p.total / EV_MIN_DAYS), Math.floor(p.total / EV_MIN_DAYS)));
const evPack = id => EV_PACKS.find(p => p.id === String(id).replace(/-\d{4}$/, '')) || null;
/** Édition d'un pack pour une année : { id, pack, year, from, to, days, total, per }. */
function evEdition(p, y) { const w = p.when(y); return { id: p.id + '-' + y, pack: p.id, year: y, from: w.from, to: w.to, days: evDiff(w.from, w.to) + 1, total: p.total, per: evPerDay(p) }; }
/** Édition d'un identifiant (« halloween-2026 »), ou null. */
function evById(id) { const m = /^([a-z]+)-(\d{4})$/.exec(String(id || '')); const p = m && evPack(m[1]); return p ? evEdition(p, +m[2]) : null; }
/** Éditions qui touchent un jour (« AAAA-MM-JJ ») : celles de l'année et de la précédente (Nouvel an à cheval). */
function evAt(day, o = {}) {
  const y = +day.slice(0, 4), out = [];
  for (const p of EV_PACKS) for (const yy of [y - 1, y]) { const e = evEdition(p, yy); if (day >= e.from && day <= e.to && (p.ready || o.all)) out.push(e); }
  return out;
}
/** Édition en cours à l'instant t (ou null) : off (identifiants coupés), force (identifiant d'édition ou de pack : ouverte quel que soit le jour, 1er jour si avant). */
function evActive(t, o = {}) {
  const day = evDay(t), off = o.off || [];
  if (o.force) { const f = /-\d{4}$/.test(o.force) ? evById(o.force) : evPack(o.force) && evEdition(evPack(o.force), +day.slice(0, 4)); if (f && !off.includes(f.id)) return { ...f, day: day < f.from || day > f.to ? f.from : day, forced: true }; }
  const e = evAt(day).find(x => !off.includes(x.id));
  return e ? { ...e, day } : null;
}
/** Prochaine édition à venir après le jour donné (annonces J-3) : { …édition, in (jours avant le début) } ou null (dans les 60 jours). */
function evUpcoming(day, within = 60) {
  let best = null; const y = +day.slice(0, 4);
  for (const p of EV_PACKS) if (p.ready) for (const yy of [y, y + 1]) { const e = evEdition(p, yy), d = evDiff(day, e.from); if (d > 0 && d <= within && (!best || d < best.in)) best = { ...e, in: d }; }
  return best;
}
/** Contrôle des packs (tests) : quota tenable, période d'environ deux semaines. Liste des problèmes (vide : tout va bien). */
function evCheck(y = 2026) {
  const bad = [];
  for (const p of EV_PACKS) {
    const e = evEdition(p, y), need = Math.ceil(p.total / e.per);
    if (need < EV_MIN_DAYS) bad.push(p.id + ' : tout trouvable en ' + need + ' jours');
    if (e.days < need || e.days < 12 || e.days > 18) bad.push(p.id + ' : ' + e.days + ' jours');
  }
  return bad;
}

if (typeof module !== 'undefined' && module.exports) module.exports = { EV_PACKS, EV_SPOTS, EV_CAPS, EV_MIN_DAYS, EV_TZ, evAdd, evDiff, evEaster, evAround, evDay, evNextMidnight, evPerDay, evPack, evEdition, evById, evAt, evActive, evUpcoming, evCheck };
