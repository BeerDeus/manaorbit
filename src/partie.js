/* ── partie.js : compteur de vie (parties de Commander, Standard ou libre) : mécanique seule, aucune interface ─────────────────────────────
   · Formats (jeu) : 'commander' (40 points de départ, ou 30, 25, 20 ; blessures de commandant, impôt, monarque, initiative ; table de 8), 'standard' (20 points,
     sans commandant ni blessures de commandant, ni monarque ni initiative ; poison ; table de 2, agrandie au besoin), 'libre' (1 à 999 points au choix, sans
     blessures de commandant ; table de 8). Absent (anciennes parties, salles, liens) : Commander. format : les points de départ (nom historique, gardé).
   · Le créateur (joueur 1) crée la partie sur SON téléphone : le compteur ne tourne que là. Les autres scannent le QR code de la table
     (lien ?table=<code> : salle d'attente du serveur, proxy.mjs › /api/partie), choisissent leur place (1 à 8, 2 en Standard) et un deck de « Mes decks », puis rangent
     leur téléphone ; un joueur sans l'appli peut entrer en invité (prénom, commandant facultatif) ; le créateur ajoute lui-même des invités.
     Sans réseau : invités seulement, tout reste sur ce téléphone, le résultat part au retour du réseau.
   · État : un objet JSON jamais modifié en place (chaque action rend un nouvel état, ou le même objet si l'action est refusée) ; forme : partieNew.
     Journal des actions pour annuler (PRT_LOG_MAX entrées ; les appuis répétés sur le même compteur à moins de PRT_MERGE_MS d'écart n'en font qu'une).
   · Fin : partieEnd (vainqueurs, ou aucun) → partieResult (résultat compact) → partieDone : historique de l'appareil, file d'envoi, partieFlush.
   · Résultat en lien / QR code (encodeResult, decodeResult ; https://manaorbit.app/?partie=<données>) : un autre joueur le scanne, choisit
     « c'était moi : place N » (partieClaim) et la partie s'ajoute à son historique, envoyée au serveur dès que possible.
   · Stockage de l'appareil : deckdeal:partie:cur (partie en cours ; deckdeal:partie:at, sa dernière sauvegarde : laissée 12 h en préparation ou 48 h
     sans action, l'accueil l'efface, partieStale), deckdeal:partie:queue (envois en attente), deckdeal:partie:hist (historique,
     200 au plus), deckdeal:partie:room (salle d'attente créée ou rejointe ici), deckdeal:partie:roomend (fin d'une salle
     décidée sans réseau, renvoyée plus tard : partieRoomEnd). Toujours dans des try/catch : sans stockage, rien ne casse.
   Sous Node (tests, proxy.mjs) : module.exports en fin de fichier ; aucune dépendance aux autres fichiers de src/ (globales de l'appli lues avec typeof).
   Retirer la fonction : ôter 'partie.js' de build.mjs (crochets gardés par typeof dans app.js et decks.js), PARTIE=0 coupe le serveur. */
const PRT_CUR = 'deckdeal:partie:cur', PRT_QUEUE = 'deckdeal:partie:queue', PRT_HIST = 'deckdeal:partie:hist', PRT_ROOM = 'deckdeal:partie:room';
const PRT_ROOM_END = 'deckdeal:partie:roomend';      // salle que le créateur a terminée sans réseau : fin renvoyée plus tard (partieRoomEnd)
const PRT_AT = 'deckdeal:partie:at', PRT_IDLE_SETUP = 12 * 3600e3, PRT_IDLE_GAME = 48 * 3600e3;      // dernière sauvegarde de la partie en cours ; inactivité au-delà de laquelle elle est effacée (partieStale)
const PRT_HIST_MAX = 200, PRT_QUEUE_MAX = 300, PRT_LOG_MAX = 5000, PRT_MERGE_MS = 2500, PRT_POS_MAX = 8, PRT_V = 1;
const PRT_FORMATS = [40, 30, 25, 20], PRT_COUNTERS = ['poison', 'impot', 'energie', 'experience'], PRT_FREE_MAX = 8;
const PRT_CAUSES = ['vie', 'poison', 'commandant', 'abandon', 'autre'], PRT_SORTES = ['moi', 'compte', 'invite'], PRT_SRC = ['h', 's', 'q'];
const PRT_LEN = { nom: 24, deck: 40, cmd: 80 };
/* Formats de jeu : points de départ permis (null : 1 à PRT_VIE_MAX, au choix), par défaut, places de la salle d'attente, blessures de commandant et impôt (cmd),
   monarque et initiative (marks). Code d'une lettre dans le lien ?partie= (Commander : aucun, le lien reste celui des versions d'avant). */
const PRT_JEUX = ['commander', 'standard', 'libre'], PRT_VIE_MAX = 999;
const PRT_JEU = { commander: { vie: PRT_FORMATS, def: 40, size: 8, cmd: true, marks: true }, standard: { vie: [20], def: 20, size: 2, cmd: false, marks: false }, libre: { vie: null, def: 20, size: 8, cmd: false, marks: true } };
const PRT_JEU_CODE = { standard: 's', libre: 'l' };
const PRT_SITE = 'https://manaorbit.app/', PRT_LINK_MAX = 900;
const PRT_ID_RE = /^[0-9a-z]{8,24}$/, PRT_CODE_RE = /^[A-HJKMNP-Z2-9]{6}$/, PRT_TK_RE = /^[\w-]{20,200}$/;
const PRT_IMG_RE = /^https:\/\/cards\.scryfall\.io\/(?![\w./-]*(?:\/\/|\.\.))[\w./-]+(\?\d+)?$/;      // images Scryfall seulement (comme SHARE_IMG_RE)
const PRT = { flush: null, retry: 0, t: null, watch: null, inited: false };
/* Saisie depuis le téléphone d'une place (partieRemote) : identifiant d'un delta (« place:identifiant »), identifiants gardés avec la partie, valeur d'un delta. */
const PRT_DQ_ID_RE = /^[\w-]{6,32}$/, PRT_RQ_ID_RE = /^[1-8]:[\w-]{6,32}$/, PRT_RQ_IDS = 300, PRT_DQ_N = 99;

/* ── Petits outils ───────────────────────────────────────────────────────────────────────────────────────────────────────── */
const partieNow = t => (Number.isFinite(t) ? t : Date.now());
const partieInt = (v, lo, hi) => (Number.isInteger(v) && v >= lo && v <= hi ? v : null);
const partieIdOk = v => typeof v === 'string' && PRT_ID_RE.test(v);
const partieOwn = (o, k) => Object.prototype.hasOwnProperty.call(o, k);      // « toString » n'est pas un compteur
/** Format de jeu d'un état, d'un résultat, d'une salle ou d'une entrée d'historique : son champ jeu, Commander s'il manque (ou s'il est inconnu). */
const partieJeu = x => (x && typeof x.jeu === 'string' && PRT_JEUX.includes(x.jeu) ? x.jeu : 'commander');
/** Points de départ permis pour ce format (entier ; Libre : 1 à 999). */
const partieVieOk = (jeu, f) => { const d = PRT_JEU[jeu]; return !!d && PRT_JEUX.includes(jeu) && Number.isInteger(f) && (d.vie ? d.vie.includes(f) : f >= 1 && f <= PRT_VIE_MAX); };
/** Blessures de commandant (et impôt) dans cette partie ; monarque et initiative. */
const partieCmdOn = st => PRT_JEU[partieJeu(st)].cmd;
const partieMarksOn = st => PRT_JEU[partieJeu(st)].marks;
/** Texte d'un joueur ou d'un deck : sans caractères de contrôle ni chevrons, espaces resserrés, n caractères au plus. */
function partieStr(v, n) {
  if (typeof v !== 'string') return '';
  const s = v.replace(/[\p{Cc}\p{Cf}<>]/gu, '').replace(/\s+/g, ' ').trim(), a = Array.from(s);
  return a.length > n ? a.slice(0, n).join('').trim() : s;
}
/** Texte raccourci pour un lien : n caractères au plus, coupé au dernier mot entier si possible, « … » à la fin. */
function partieCut(s, n) {
  const a = Array.from(String(s || '')); if (a.length <= n) return a.join('');
  if (n < 2) return '';
  let t = a.slice(0, n - 1).join(''); const sp = t.lastIndexOf(' ');
  if (sp >= Math.floor(n / 2)) t = t.slice(0, sp);
  return t.replace(/[\s,.;:'’-]+$/, '') + '…';
}
/** Commandant raccourci : la partie avant la virgule (« Atraxa, Praetors' Voice » → « Atraxa »), chaque partenaire à part. */
const partieShortCmd = s => String(s || '').split(' + ').map(x => x.split(',')[0].trim()).join(' + ');
/** Identifiant d'une partie : 12 caractères [0-9a-z]. */
function partieId() {
  const b = new Uint8Array(12); let ok = false;
  try { if (typeof crypto !== 'undefined' && crypto.getRandomValues) { crypto.getRandomValues(b); ok = true; } } catch (e) { /* pas de générateur sûr */ }
  if (!ok) for (let i = 0; i < b.length; i++) b[i] = Math.floor(Math.random() * 256);
  let s = ''; for (const x of b) s += (x % 36).toString(36);
  return s;
}
/** Deck d'un joueur { nom, commandant, image } (image : Scryfall seulement) ; null si rien de lisible. */
function partieDeck(d) {
  if (!d || typeof d !== 'object') return null;
  const nom = partieStr(d.nom, PRT_LEN.deck), commandant = partieStr(d.commandant, PRT_LEN.cmd), img = typeof d.image === 'string' ? d.image.slice(0, 300) : '';
  const image = PRT_IMG_RE.test(img) ? img : '';
  return nom || commandant || image ? { ...(nom ? { nom } : {}), ...(commandant ? { commandant } : {}), ...(image ? { image } : {}) } : null;
}
/** Deck de « Mes decks » (decks.js : { name, text }) → { nom, commandant, image? } ; image : adresse Scryfall donnée par l'appelant (facultative). */
function partieDeckOf(d, image) {
  if (!d) return null;
  let cmd = '';
  try { if (typeof commanderKeys === 'function' && typeof parseDeck === 'function') { const pd = parseDeck(d.text || ''); cmd = commanderKeys(d.text || '').map(k => (pd.cards.find(c => c.key === k) || {}).name).filter(Boolean).slice(0, 2).join(' + '); } } catch (e) { /* liste illisible */ }
  return partieDeck({ nom: d.name, commandant: cmd, image });
}
const partieCounterName = v => { const s = partieStr(v, 20); return s && !/^(__proto__|constructor|prototype)$/.test(s) ? s : ''; };
const partieIdx = (st, pos) => st.places.findIndex(p => p.pos === pos);
const partieOrder = st => st.places.map(p => p.pos).sort((a, b) => a - b);
const partieAliveAt = (st, pos) => { const i = partieIdx(st, pos); return i >= 0 && !st.places[i].elimine; };
/** Copie de l'état avec une copie de la place i (à modifier) : [places, place]. */
function partieClonePl(st, i) {
  const places = st.places.slice(), p = { ...places[i], blessures: { ...places[i].blessures }, compteurs: { ...places[i].compteurs } };
  places[i] = p; return [places, p];
}
/** Place suivante encore en jeu dans l'ordre de la table (après pos, sans elle) ; 0 si aucune. */
function partieNextAlive(st, pos) {
  const order = partieOrder(st), n = order.length; if (!n) return 0;
  let i = order.indexOf(pos);
  if (i < 0) { const j = order.findIndex(x => x > pos); i = (j < 0 ? 0 : j) - 1; }      // pos absente (0 : avant la première place) : on part de la place qui la suit
  for (let k = 1; k <= n; k++) { const c = order[(i + k + n) % n]; if (c !== pos && partieAliveAt(st, c)) return c; }
  return 0;
}
/** Qui reprend le monarque ou l'initiative quand la place pos quitte la partie : le joueur actif, ou le suivant si c'était son tour. */
function partieHeir(st, pos) {
  if (!st.actif) return 0;
  if (st.actif !== pos) return partieAliveAt(st, st.actif) ? st.actif : 0;
  return partieNextAlive(st, pos);
}
/** Ajoute une entrée au journal (fusionnée avec la précédente : même action, même place, même cible, moins de PRT_MERGE_MS d'écart) ; journal borné. */
function partieLog(journal, e, merge) {
  const last = journal[journal.length - 1];
  if (merge !== false && last && 'n' in e && last.a === e.a && last.p === e.p && last.s === e.s && last.k === e.k && e.t >= last.t && e.t - last.t <= PRT_MERGE_MS) {
    const m = { ...last, n: last.n + e.n, t: e.t }; if ('v' in e) m.v = (last.v || 0) + e.v;
    const out = journal.slice(0, -1); if (m.n || m.v) out.push(m);
    return out;
  }
  const out = journal.concat([e]);
  return out.length > PRT_LOG_MAX ? out.slice(out.length - PRT_LOG_MAX) : out;
}

/* ── État : création, places ─────────────────────────────────────────────────────────────────────────────────────────────── */
/** Place autour de la table : { pos (1 à 8), sorte ('moi' : le créateur | 'compte' : joueur connecté, uid = jeton opaque du serveur | 'invite'), nom, uid?, deck?,
    vie, blessures { '<place source>' | '<place source>b' (2e commandant) : n }, compteurs { poison, impot, energie, experience, …libres }, elimine (null | { tour, cause, n, par? }) }. */
function partiePlace(o, vie) {
  const sorte = PRT_SORTES.includes(o.sorte) ? o.sorte : 'invite', deck = partieDeck(o.deck);
  const uid = sorte === 'compte' && typeof o.uid === 'string' && PRT_TK_RE.test(o.uid) ? o.uid : '';
  return { pos: o.pos, sorte, nom: partieStr(o.nom, PRT_LEN.nom), ...(uid ? { uid } : {}), ...(deck ? { deck } : {}), vie, blessures: {}, compteurs: { poison: 0, impot: 0, energie: 0, experience: 0 }, elimine: null };
}
/**
 * Nouvelle partie. o : { jeu ('commander' par défaut, 'standard', 'libre'), format (points de départ permis pour ce jeu, sinon ceux par défaut : 40 en Commander,
 * 20 sinon), moi ({ nom, deck?, pos? } : le créateur, place 1 par défaut ; null : pas de place pour lui), id?, now? }. État : { v, id, cree, jeu, format, places [partiePlace…], monarque (place, 0 : personne), initiative, tour (tour de table, 0 : pas commencé), actif (place qui joue),
 * premier, debut, fin (horodatages, 0 : pas encore), vainqueurs (null tant que la partie n'est pas finie, puis [places], vide : aucun), rangs (null : déduits ; sinon { place: rang }),
 * ne (éliminations numérotées), journal [entrées] }.
 */
function partieNew(o = {}) {
  const jeu = PRT_JEUX.includes(o.jeu) ? o.jeu : 'commander', format = partieVieOk(jeu, Number(o.format)) ? Number(o.format) : PRT_JEU[jeu].def;
  let st = { v: PRT_V, id: partieIdOk(o.id) ? o.id : partieId(), cree: partieNow(o.now), jeu, format, places: [], monarque: 0, initiative: 0, tour: 0, actif: 0, premier: 0, debut: 0, fin: 0, vainqueurs: null, rangs: null, ne: 0, journal: [] };
  if (o.moi !== null) st = partieAddPlace(st, { ...(o.moi || {}), sorte: 'moi' });
  return st;
}
/** Places modifiables (ajout, retrait, déplacement, format) : seulement avant le début de la partie. */
const partieSetup = st => !st.debut && !st.fin;
/** Ajoute une place { pos? (sinon la première libre), sorte, nom, uid?, deck? } ; refusé : partie commencée, 8 places, place prise, un 2e « moi ». */
function partieAddPlace(st, o = {}) {
  if (!partieSetup(st) || st.places.length >= PRT_POS_MAX) return st;
  if (o.sorte === 'moi' && st.places.some(p => p.sorte === 'moi')) return st;
  let pos = Number(o.pos);
  if (pos) { if (!partieInt(pos, 1, PRT_POS_MAX) || partieIdx(st, pos) >= 0) return st; }
  else { pos = 1; while (partieIdx(st, pos) >= 0) pos++; }
  const places = st.places.concat([partiePlace({ ...o, pos }, st.format)]).sort((a, b) => a.pos - b.pos);
  return { ...st, places };
}
function partieRemovePlace(st, pos) {
  const i = partieIdx(st, pos); if (!partieSetup(st) || i < 0) return st;
  const places = st.places.slice(); places.splice(i, 1);
  return { ...st, places, premier: st.premier === pos ? 0 : st.premier, monarque: st.monarque === pos ? 0 : st.monarque, initiative: st.initiative === pos ? 0 : st.initiative };
}
/** Déplace une place (vers une place libre, ou échange avec celle qui l'occupe). */
function partieMovePlace(st, from, to) {
  const i = partieIdx(st, from); if (!partieSetup(st) || i < 0 || !partieInt(to, 1, PRT_POS_MAX) || from === to) return st;
  const j = partieIdx(st, to), places = st.places.slice(), sw = x => (x === from ? to : x === to && j >= 0 ? from : x);
  places[i] = { ...places[i], pos: to }; if (j >= 0) places[j] = { ...places[j], pos: from };
  places.sort((a, b) => a.pos - b.pos);
  return { ...st, places, premier: sw(st.premier), monarque: sw(st.monarque), initiative: sw(st.initiative) };
}
/** Nom, deck (et pour une place « compte » : son jeton uid) d'une place : à tout moment (une coquille se corrige en cours de partie). */
function partieSetPlace(st, pos, o = {}) {
  const i = partieIdx(st, pos); if (i < 0) return st;
  const places = st.places.slice(), p = { ...places[i] };
  if ('nom' in o) p.nom = partieStr(o.nom, PRT_LEN.nom);
  if ('deck' in o) { const d = partieDeck(o.deck); if (d) p.deck = d; else delete p.deck; }
  if ('uid' in o && p.sorte === 'compte') { if (typeof o.uid === 'string' && PRT_TK_RE.test(o.uid)) p.uid = o.uid; else delete p.uid; }
  places[i] = p; return { ...st, places };
}
/** Points de départ (permis pour le format de jeu) : avant le début, remet chaque place à ce total. */
function partieSetFormat(st, format) {
  const f = Number(format); if (!partieSetup(st) || !partieVieOk(partieJeu(st), f) || st.journal.length) return st;
  return { ...st, format: f, places: st.places.map(p => ({ ...p, vie: f })) };
}
/** Format de jeu (Commander, Standard, Libre) et ses points de départ (format ; absent ou pas permis : ceux par défaut du jeu) : avant le début seulement. */
function partieSetJeu(st, jeu, format) {
  if (!partieSetup(st) || !PRT_JEUX.includes(jeu) || st.journal.length) return st;
  const f = partieVieOk(jeu, Number(format)) ? Number(format) : PRT_JEU[jeu].def, d = PRT_JEU[jeu];
  if (jeu === partieJeu(st) && f === st.format) return st;
  return { ...st, jeu, format: f, monarque: d.marks ? st.monarque : 0, initiative: d.marks ? st.initiative : 0,
    places: st.places.map(p => ({ ...p, vie: f, blessures: d.cmd ? p.blessures : {}, compteurs: d.cmd ? p.compteurs : { ...p.compteurs, impot: 0 } })) };
}

/* ── Actions de jeu (état → nouvel état, journalisées) ───────────────────────────────────────────────────────────────────── */
/** Points de vie ±n. o : { now, merge (false : une entrée à part dans le journal) }. */
function partieLife(st, pos, n, o = {}) {
  n = Math.trunc(Number(n)); const i = partieIdx(st, pos); if (!n || i < 0 || st.fin) return st;
  const [places, p] = partieClonePl(st, i), v = Math.max(-999, Math.min(9999, p.vie + n)), d = v - p.vie; if (!d) return st;
  p.vie = v;
  return { ...st, places, journal: partieLog(st.journal, { a: 'v', p: pos, n: d, t: partieNow(o.now) }, o.merge) };
}
/** Blessures du commandant de la place src reçues par la place pos : ±n, et autant de points de vie en moins (ou rendus pour une correction : règle Commander).
    o.second : 2e commandant de src (partenaire), compté à part. Commander seulement (Standard, Libre : refusé). */
function partieCmdDamage(st, pos, src, n, o = {}) {
  n = Math.trunc(Number(n)); const i = partieIdx(st, pos); if (!n || i < 0 || partieIdx(st, src) < 0 || st.fin || !partieCmdOn(st)) return st;
  const k = String(src) + (o.second ? 'b' : ''), [places, p] = partieClonePl(st, i), cur = p.blessures[k] || 0, nb = Math.max(0, Math.min(999, cur + n)), d = nb - cur;
  if (!d) return st;
  if (nb) p.blessures[k] = nb; else delete p.blessures[k];
  const v = Math.max(-999, Math.min(9999, p.vie - d)), dv = v - p.vie; p.vie = v;
  return { ...st, places, journal: partieLog(st.journal, { a: 'b', p: pos, s: k, n: d, v: dv, t: partieNow(o.now) }, o.merge) };
}
/** Compteur ±n (jamais sous 0) : poison, impot (impôt de commandant : Commander seulement), energie, experience, ou un compteur libre (nom ; 8 au plus par place). */
function partieCounter(st, pos, name, n, o = {}) {
  n = Math.trunc(Number(n)); const i = partieIdx(st, pos), k = partieCounterName(name); if (!n || i < 0 || !k || st.fin || (k === 'impot' && !partieCmdOn(st))) return st;
  const pl = st.places[i];
  if (!partieOwn(pl.compteurs, k) && Object.keys(pl.compteurs).length >= PRT_COUNTERS.length + PRT_FREE_MAX) return st;
  const [places, p] = partieClonePl(st, i), cur = partieOwn(p.compteurs, k) ? p.compteurs[k] : 0, nv = Math.max(0, Math.min(999, cur + n)), d = nv - cur;
  if (!d) return st;
  p.compteurs[k] = nv;
  return { ...st, places, journal: partieLog(st.journal, { a: 'c', p: pos, k, n: d, t: partieNow(o.now) }, o.merge) };
}
/** Monarque (which = 'monarque') ou initiative ('initiative') : une seule place à la fois ; pos 0 : personne. Pas en Standard. */
function partieMark(st, which, pos, o = {}) {
  pos = Number(pos) || 0;
  if (st.fin || !partieMarksOn(st) || (which !== 'monarque' && which !== 'initiative') || st[which] === pos || (pos && !partieAliveAt(st, pos))) return st;
  return { ...st, [which]: pos, journal: partieLog(st.journal, { a: which === 'monarque' ? 'm' : 'i', p: pos, w: st[which], t: partieNow(o.now) }, false) };
}
const partieMonarch = (st, pos, o) => partieMark(st, 'monarque', pos, o);
const partieInitiative = (st, pos, o) => partieMark(st, 'initiative', pos, o);
/** Élimine une place : cause 'vie' | 'poison' | 'commandant' | 'abandon' | 'autre' ; o.par : place responsable (blessures de commandant…). Son monarque ou
    son initiative passe au joueur actif (ou au suivant si c'était son tour). Numérotée (elimine.n) : l'ordre d'élimination. */
function partieEliminate(st, pos, cause, o = {}) {
  const i = partieIdx(st, pos); if (i < 0 || st.fin || st.places[i].elimine) return st;
  const ne = (st.ne || 0) + 1, [places, p] = partieClonePl(st, i), par = Number(o.par);
  p.elimine = { tour: st.tour, cause: PRT_CAUSES.includes(cause) && (cause !== 'commandant' || partieCmdOn(st)) ? cause : 'autre', n: ne, ...(par && par !== pos && partieIdx(st, par) >= 0 ? { par } : {}) };
  const next = { ...st, places, ne }, heir = partieHeir(next, pos);
  if (st.monarque === pos) next.monarque = heir;
  if (st.initiative === pos) next.initiative = heir;
  next.journal = partieLog(st.journal, { a: 'e', p: pos, w: [st.monarque, st.initiative], t: partieNow(o.now) }, false);
  return next;
}
/** Revenir en jeu (élimination par erreur). */
function partieRevive(st, pos, o = {}) {
  const i = partieIdx(st, pos); if (i < 0 || st.fin || !st.places[i].elimine) return st;
  const [places, p] = partieClonePl(st, i), w = p.elimine; p.elimine = null;
  return { ...st, places, journal: partieLog(st.journal, { a: 'r', p: pos, w, t: partieNow(o.now) }, false) };
}
/** Début de la partie : horodatage, tour 1, le premier joueur (premier, sinon la plus petite place) commence. */
function partieStart(st, o = {}) {
  if (st.debut || st.fin || !st.places.length) return st;
  const order = partieOrder(st), premier = partieAliveAt(st, st.premier) ? st.premier : order.find(x => partieAliveAt(st, x)) || order[0];
  return { ...st, debut: partieNow(o.now), tour: Math.max(1, st.tour), actif: premier, premier, journal: partieLog(st.journal, { a: 'g', w: [st.premier, st.actif, st.tour], t: partieNow(o.now) }, false) };
}
/** Premier joueur : pos, ou au hasard parmi les places en jeu (pos 0 / null ; o.rnd : générateur [0, 1), Math.random par défaut). Au tour 1, il devient le joueur actif. */
function partieFirst(st, pos, o = {}) {
  if (st.fin) return st;
  const alive = partieOrder(st).filter(x => partieAliveAt(st, x)); if (!alive.length) return st;
  if (!pos) { const r = (o.rnd || Math.random)(); pos = alive[Math.min(alive.length - 1, Math.max(0, Math.floor(r * alive.length)))]; }
  if (!alive.includes(pos)) return st;
  const actif = st.debut && st.tour <= 1 && st.actif === st.premier ? pos : st.actif;      // tiré au début du premier tour : c'est lui qui commence
  if (st.premier === pos && st.actif === actif) return st;
  return { ...st, premier: pos, actif, journal: partieLog(st.journal, { a: 'f', p: pos, w: [st.premier, st.actif], t: partieNow(o.now) }, false) };
}
/** Tour suivant : la place suivante encore en jeu ; retour au premier joueur (ou après lui) : tour de table suivant. Pas encore commencée : la commence. */
function partieNextTurn(st, o = {}) {
  if (st.fin || !st.places.length) return st;
  if (!st.debut) return partieStart(st, o);
  const order = partieOrder(st), n = order.length, ref = order.indexOf(partieIdx(st, st.premier) >= 0 ? st.premier : order[0]);
  const rel = x => (order.indexOf(x) - ref + n) % n;
  let next = st.actif ? partieNextAlive(st, st.actif) : (partieAliveAt(st, st.premier) ? st.premier : partieNextAlive(st, 0));
  let tour = Math.max(1, st.tour);
  if (st.actif && (!next || rel(next) <= rel(st.actif))) tour++;
  if (!next) { if (!partieAliveAt(st, st.actif)) return st; next = st.actif; }      // seul encore en jeu : il rejoue (tour de table suivant)
  return { ...st, actif: next, tour, journal: partieLog(st.journal, { a: 'n', w: [st.actif, st.tour], t: partieNow(o.now) }, false) };
}
/** Fin de la partie : vainqueurs (liste de places ; [] : aucun ; absent : la dernière place en jeu s'il n'en reste qu'une, sinon aucun). Peut être rappelée
    (vainqueurs corrigés) ; le classement manuel est alors remis à zéro, sauf o.rangs. */
function partieEnd(st, vainqueurs, o = {}) {
  if (!st.places.length) return st;
  let w;
  if (Array.isArray(vainqueurs)) w = [...new Set(vainqueurs.map(Number))].filter(x => partieIdx(st, x) >= 0);
  else { const alive = st.places.filter(p => !p.elimine); w = alive.length === 1 ? [alive[0].pos] : []; }
  w.sort((a, b) => a - b);
  const rangs = o.rangs != null ? partieRanksClean(st, o.rangs) : null;
  return { ...st, fin: st.fin || partieNow(o.now), vainqueurs: w, rangs, journal: partieLog(st.journal, { a: 'x', w: [st.fin, st.vainqueurs, st.rangs], t: partieNow(o.now) }, false) };
}
/** Classement corrigé à la main (partie finie) : { place: rang } (1 = premier, ex aequo permis) ou liste des places de la première à la dernière ; null : classement déduit. */
function partieSetRanks(st, r, o = {}) {
  if (!st.fin) return st;
  const rangs = r == null ? null : partieRanksClean(st, r); if (r != null && !rangs) return st;
  return { ...st, rangs, journal: partieLog(st.journal, { a: 'k', w: st.rangs, t: partieNow(o.now) }, false) };
}
function partieRanksClean(st, r) {
  const n = st.places.length, out = {};
  if (Array.isArray(r)) {
    const a = r.map(Number); if (a.length !== n || new Set(a).size !== n || a.some(x => partieIdx(st, x) < 0)) return null;
    a.forEach((x, i) => { out[x] = i + 1; }); return out;
  }
  if (!r || typeof r !== 'object') return null;
  for (const p of st.places) { const v = partieInt(Number(r[p.pos]), 1, n); if (v == null) return null; out[p.pos] = v; }
  return out;
}
/** Annule la dernière action du journal (rien à annuler : le même état). */
function partieUndo(st) {
  const j = st.journal; if (!j.length) return st;
  const e = j[j.length - 1], next = { ...st, journal: j.slice(0, -1) };
  const pl = fn => { const i = partieIdx(next, e.p); if (i < 0) return; const [places, p] = partieClonePl(next, i); fn(p); next.places = places; };
  switch (e.a) {
    case 'v': pl(p => { p.vie -= e.n; }); break;
    case 'b': pl(p => { const b = (p.blessures[e.s] || 0) - e.n; if (b > 0) p.blessures[e.s] = b; else delete p.blessures[e.s]; p.vie -= e.v || 0; }); break;
    case 'c': pl(p => { p.compteurs[e.k] = Math.max(0, (p.compteurs[e.k] || 0) - e.n); }); break;
    case 'm': next.monarque = e.w; break;
    case 'i': next.initiative = e.w; break;
    case 'e': pl(p => { p.elimine = null; }); next.monarque = e.w[0]; next.initiative = e.w[1]; next.ne = Math.max(0, (next.ne || 0) - 1); break;
    case 'r': pl(p => { p.elimine = e.w; }); break;
    case 'n': next.actif = e.w[0]; next.tour = e.w[1]; break;
    case 'f': next.premier = e.w[0]; next.actif = e.w[1]; break;
    case 'g': next.premier = e.w[0]; next.actif = e.w[1]; next.tour = e.w[2]; next.debut = 0; break;
    case 'x': next.fin = e.w[0]; next.vainqueurs = e.w[1]; next.rangs = e.w[2]; break;
    case 'k': next.rangs = e.w; break;
    default: break;
  }
  return next;
}
/**
 * Saisie d'un joueur depuis son téléphone (salle : op delta, file relevée par le créateur) : deltas { s (numéro donné par le serveur), id, pos, k ('v' : points de vie |
 * 'b' : blessures du commandant de src reçues, b : son 2e commandant | 'c' : compteur c | 't' : tour suivant, co-hôte), n (±, jamais une valeur), by (place qui l'a saisi) }, appliqués une fois chacun (st.rq : dernier numéro
 * et identifiants déjà vus, gardés avec la partie : rien de doublé après une coupure ou un redémarrage) comme un appui sur ce téléphone (journal, annuler). Saisie coupée
 * (rq.off ; sauf ceux de l'écran 2, by 0 : l'écran du créateur), partie pas commencée ou finie, joueur éliminé : ignorés (mais comptés comme vus). → { st, done [deltas appliqués] } ; st inchangé : rien de neuf.
 */
function partieRemote(st, list, o = {}) {
  if (!st || !st.debut || st.fin || !Array.isArray(list) || !list.length) return { st, done: [] };
  const rq = st.rq || { s: 0, ids: [] }, ids = rq.ids.slice(), done = []; let next = st, s = rq.s;
  for (const d of list) {
    if (!d || !Number.isInteger(d.s) || d.s <= rq.s || typeof d.id !== 'string' || !PRT_DQ_ID_RE.test(d.id) || !partieInt(d.pos, 1, PRT_POS_MAX)) continue;
    const key = (partieInt(d.by, 1, PRT_POS_MAX) || d.pos) + ':' + d.id; s = Math.max(s, d.s); if (ids.includes(key)) continue; ids.push(key);      // identifiant propre à la place qui l'a saisi
    const p = next.places.find(x => x.pos === d.pos), n = partieInt(d.n, -PRT_DQ_N, PRT_DQ_N);
    if ((rq.off && d.by !== 0) || !n) continue;
    if (d.k === 't') { const t = n === 1 ? partieNextTurn(next, o) : next; if (t !== next) { next = t; done.push(d); } continue; }      // tour suivant (co-hôte)
    if (!p || p.elimine) continue;
    const t = d.k === 'v' ? partieLife(next, d.pos, n, o) : d.k === 'b' && d.src !== d.pos ? partieCmdDamage(next, d.pos, d.src, n, { ...o, second: !!d.b }) : d.k === 'c' && PRT_COUNTERS.includes(d.c) ? partieCounter(next, d.pos, d.c, n, o) : next;
    if (t !== next) { next = t; done.push(d); }
  }
  if (s === rq.s) return { st, done: [] };
  return { st: { ...next, rq: { ...rq, s, ids: ids.slice(-PRT_RQ_IDS) } }, done };
}
/** Saisie depuis les autres téléphones coupée (off) ou permise (menu « … » du créateur). */
function partieRemoteOff(st, off) { const rq = st.rq || { s: 0, ids: [] }; return !!rq.off === !!off ? st : { ...st, rq: { s: rq.s, ids: rq.ids, ...(off ? { off: 1 } : {}) } }; }

/* ── Propositions d'élimination, classement, résultat ─────────────────────────────────────────────────────────────────────── */
/** Places à proposer d'éliminer (jamais d'office) : [{ pos, cause: 'vie' (≤ 0) | 'poison' (≥ 10) | 'commandant' (21 blessures d'un même commandant : par, second ? ;
    Commander seulement) }]. */
function partieProposals(st) {
  const out = []; if (st.fin) return out; const cmd = partieCmdOn(st);
  for (const p of st.places) {
    if (p.elimine) continue;
    if (p.vie <= 0) out.push({ pos: p.pos, cause: 'vie' });
    if ((p.compteurs.poison || 0) >= 10) out.push({ pos: p.pos, cause: 'poison' });
    if (cmd) for (const [k, v] of Object.entries(p.blessures)) if (v >= 21) out.push({ pos: p.pos, cause: 'commandant', par: parseInt(k, 10), ...(k.endsWith('b') ? { second: true } : {}) });
  }
  return out;
}
/** Classement { place: rang } : celui corrigé à la main, sinon vainqueurs 1ers, puis les places encore en jeu (ex aequo), puis les éliminées de la dernière à la première. */
function partieRanks(st) {
  if (st.rangs) { const c = partieRanksClean(st, st.rangs); if (c) return c; }
  const w = new Set(st.vainqueurs || []), out = {}; let r = 1;
  const win = st.places.filter(p => w.has(p.pos)); for (const p of win) out[p.pos] = 1; if (win.length) r += win.length;
  const alive = st.places.filter(p => !w.has(p.pos) && !p.elimine); for (const p of alive) out[p.pos] = r; r += alive.length;
  for (const p of st.places.filter(x => !w.has(x.pos) && x.elimine).sort((a, b) => (b.elimine.n || 0) - (a.elimine.n || 0))) out[p.pos] = r++;
  return out;
}
/**
 * Résultat compact : { id, date (début, ms), duree (s), tours, format (points de départ), jeu? ('standard' | 'libre' ; absent : Commander), places [{ pos, nom, sorte, uid? (jeton du serveur, places « compte »), commandant?, deck?, image?, rang, vainqueur }] }.
 * Partie pas finie : durée jusqu'à o.now.
 */
function partieResult(st, o = {}) {
  const ranks = partieRanks(st), w = new Set(st.vainqueurs || []), debut = st.debut || st.cree, fin = st.fin || partieNow(o.now), jeu = partieJeu(st);
  return { id: st.id, date: Math.round(debut), duree: Math.max(0, Math.min(30 * 86400, Math.round((fin - debut) / 1000))), tours: Math.min(9999, st.tour), format: st.format, ...(jeu !== 'commander' ? { jeu } : {}),
    places: st.places.slice().sort((a, b) => a.pos - b.pos).map(p => ({ pos: p.pos, nom: p.nom, sorte: p.sorte, ...(p.uid ? { uid: p.uid } : {}), ...(p.deck && p.deck.commandant ? { commandant: p.deck.commandant } : {}),
      ...(p.deck && p.deck.nom ? { deck: p.deck.nom } : {}), ...(p.deck && p.deck.image ? { image: p.deck.image } : {}), rang: ranks[p.pos] || st.places.length, vainqueur: w.has(p.pos) })) };
}
/**
 * Résultat relu (serveur, stockage, lien) : le même, champs bornés, ou null. o.tickets : garde les jetons uid des places « compte » (envoi du créateur).
 * jeu absent : Commander ; inconnu, ou points de départ qui ne lui vont pas : null. Partagé avec le serveur (proxy.mjs › /api/partie) : mêmes règles des deux côtés.
 */
function partieResClean(r, o = {}) {
  if (!r || typeof r !== 'object' || !partieIdOk(r.id)) return null;
  const jeu = r.jeu == null ? 'commander' : PRT_JEUX.includes(r.jeu) ? r.jeu : null; if (!jeu) return null;
  const date = partieInt(r.date, 1.5e12, 4.1e12), duree = partieInt(r.duree, 0, 30 * 86400), tours = partieInt(r.tours, 0, 9999), format = partieVieOk(jeu, r.format) ? r.format : null;
  if (date == null || duree == null || tours == null || format == null || !Array.isArray(r.places) || !r.places.length || r.places.length > PRT_POS_MAX) return null;
  const seen = new Set(), places = []; let moi = 0;
  for (const x of r.places) {
    if (!x || typeof x !== 'object') return null;
    const pos = partieInt(x.pos, 1, PRT_POS_MAX), rang = partieInt(x.rang, 1, PRT_POS_MAX); if (pos == null || rang == null || seen.has(pos)) return null;
    seen.add(pos);
    const sorte = PRT_SORTES.includes(x.sorte) ? x.sorte : 'invite'; if (sorte === 'moi' && ++moi > 1) return null;
    const cmd = partieStr(x.commandant, PRT_LEN.cmd), deck = partieStr(x.deck, PRT_LEN.deck), img = typeof x.image === 'string' && PRT_IMG_RE.test(x.image.slice(0, 300)) ? x.image : '';
    const uid = o.tickets && sorte === 'compte' && typeof x.uid === 'string' && PRT_TK_RE.test(x.uid) ? x.uid : '';
    places.push({ pos, nom: partieStr(x.nom, PRT_LEN.nom), sorte, ...(uid ? { uid } : {}), ...(cmd ? { commandant: cmd } : {}), ...(deck ? { deck } : {}), ...(img ? { image: img } : {}), rang, vainqueur: x.vainqueur === true });
  }
  places.sort((a, b) => a.pos - b.pos);
  return { id: r.id, date, duree, tours, format, ...(jeu !== 'commander' ? { jeu } : {}), places };
}
/** Entrée d'historique : un résultat (sans jetons) + moi (place du propriétaire de l'historique, 0 : aucune), src ('h' : créée ici, 's' : salle d'attente, 'q' : QR code du résultat),
    at (enregistrée), u (compte de l'appareil, '' : aucun), sv (1 : enregistrée par le serveur). */
function partieHistClean(e) {
  const r = partieResClean(e); if (!r) return null;
  const moi = partieInt(e.moi, 0, PRT_POS_MAX) || 0;
  return { ...r, moi: moi && r.places.some(p => p.pos === moi) ? moi : 0, src: PRT_SRC.includes(e.src) ? e.src : 'h', at: partieInt(e.at, 0, 4.1e12) || r.date, u: typeof e.u === 'string' ? e.u.slice(0, 128) : '', sv: e.sv ? 1 : 0 };
}

/* ── Résultat en lien / QR code : https://manaorbit.app/?partie=<données> ─────────────────────────────────────────────────── */
/* Données : base64url du JSON minifié [version, id, date (s), durée (s), tours, format, places [[pos, nom, sorte (0 moi, 1 compte, 2 invité), commandant, deck, rang, vainqueur (0/1)]…],
   jeu ('s' Standard, 'l' Libre ; seulement hors Commander), somme de contrôle (FNV-1a 32 bits, base 36, du JSON sans elle)]. Sans jeu (8 éléments, comme les liens
   des versions d'avant) : Commander ; une appli d'avant lit les liens de Commander, pas les autres (« illisible »). Jamais de jeton uid ni d'image. Textes raccourcis jusqu'à tenir dans PRT_LINK_MAX caractères (lien entier). */
const PRT_SORTE_CODE = { moi: 0, compte: 1, invite: 2 };
function partieCk(s) { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return h.toString(36); }
function partieB64(s) {
  const b = new TextEncoder().encode(s); let bin = '';
  for (let i = 0; i < b.length; i += 8192) bin += String.fromCharCode.apply(null, b.subarray(i, i + 8192));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function partieUnB64(s) {
  const t = s.replace(/-/g, '+').replace(/_/g, '/'), bin = atob(t + '==='.slice((t.length + 3) % 4)), b = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) b[i] = bin.charCodeAt(i);
  return new TextDecoder('utf-8', { fatal: true }).decode(b);
}
function partiePack(r, pl) {
  const a = [PRT_V, r.id, Math.round(r.date / 1000), r.duree, r.tours, r.format, pl.map(p => [p.pos, p.nom, PRT_SORTE_CODE[p.sorte] ?? 2, p.cmd, p.deck, p.rang, p.win ? 1 : 0])];
  if (PRT_JEU_CODE[r.jeu]) a.push(PRT_JEU_CODE[r.jeu]);
  a.push(partieCk(JSON.stringify(a)));
  return partieB64(JSON.stringify(a));
}
/** Résultat (partieResult) → données du lien (« » si illisible). o.max : longueur maximale des données (défaut : PRT_LINK_MAX moins l'adresse du site). */
function encodeResult(r, o = {}) {
  const c = partieResClean(r); if (!c) return '';
  const max = o.max || PRT_LINK_MAX - partieLinkBase(o.site, 'partie').length;
  let pl = c.places.map(p => ({ pos: p.pos, nom: p.nom, sorte: p.sorte, cmd: p.commandant || '', deck: p.deck || '', rang: p.rang, win: p.vainqueur }));
  const steps = [x => x, x => ({ ...x, deck: partieCut(x.deck, 14) }), x => ({ ...x, cmd: partieCut(Array.from(x.cmd).length > 18 ? partieShortCmd(x.cmd) : x.cmd, 22) }),
    x => ({ ...x, nom: partieCut(x.nom, 12) }), x => ({ ...x, deck: '' }), x => ({ ...x, cmd: partieCut(x.cmd, 14) }), x => ({ ...x, nom: partieCut(x.nom, 8) }),
    x => ({ ...x, cmd: partieCut(x.cmd, 8) }), x => ({ ...x, cmd: '' }), x => ({ ...x, nom: partieCut(x.nom, 4) })];
  let out = '';
  for (const f of steps) { pl = pl.map(f); out = partiePack(c, pl); if (out.length <= max) return out; }
  return out;
}
/** Données d'un lien (ou le lien entier, ou une adresse avec ?partie=) → résultat (sans jetons ni images), ou null : lien abîmé, tronqué, trafiqué ou d'une autre version. */
function decodeResult(input) {
  try {
    let s = String(input == null ? '' : input).trim(); if (s.length > 8000) return null;
    const m = /[?&#]partie=([^&#\s]*)/.exec(s); if (m) s = decodeURIComponent(m[1]);
    if (!/^[A-Za-z0-9_-]{20,6000}$/.test(s)) return null;
    const a = JSON.parse(partieUnB64(s));
    if (!Array.isArray(a) || (a.length !== 8 && a.length !== 9) || a[0] !== PRT_V) return null;
    const ck = a.pop(); if (typeof ck !== 'string' || ck !== partieCk(JSON.stringify(a))) return null;
    const [, id, date, duree, tours, format, pl, jc] = a, jeu = a.length === 8 ? Object.keys(PRT_JEU_CODE).find(k => PRT_JEU_CODE[k] === jc) : 'commander';
    if (!jeu || !Array.isArray(pl) || !Number.isInteger(date)) return null;
    const places = [];
    for (const x of pl) {
      if (!Array.isArray(x) || x.length !== 7 || typeof x[1] !== 'string' || typeof x[3] !== 'string' || typeof x[4] !== 'string' || (x[6] !== 0 && x[6] !== 1)) return null;
      const sorte = PRT_SORTES[x[2]]; if (!sorte) return null;
      places.push({ pos: x[0], nom: x[1], sorte, commandant: x[3], deck: x[4], rang: x[5], vainqueur: x[6] === 1 });
    }
    return partieResClean({ id, date: date * 1000, duree, tours, format, jeu, places });
  } catch (e) { return null; }
}
/** Adresse du site pour un lien (?partie= ou ?table=). */
const partieLinkBase = (site, k) => String(site || PRT_SITE).replace(/\/?$/, '/') + '?' + k + '=';
/** Lien du QR code du résultat (https://manaorbit.app/?partie=<données>). */
const partieResultLink = (r, o = {}) => { const d = encodeResult(r, o); return d ? partieLinkBase(o.site, 'partie') + d : ''; };
/** Lien du QR code de la table (salle d'attente) : https://manaorbit.app/?table=<code>. */
const partieTableLink = (code, site) => (PRT_CODE_RE.test(code) ? partieLinkBase(site, 'table') + code : '');
/** Lien ouvert (scan, lancement) → { table: code } | { partie: résultat } | { bad: true } (?partie= illisible) | null (rien pour la partie). */
function partieParseUrl(href) {
  let u; try { u = new URL(String(href || ''), PRT_SITE); } catch (e) { return null; }
  const t = (u.searchParams.get('table') || '').toUpperCase().replace(/[\s-]/g, ''); if (PRT_CODE_RE.test(t)) return { table: t };
  const p = u.searchParams.get('partie'); if (p == null) return null;
  const r = decodeResult(p); return r ? { partie: r } : { bad: true };
}

/* ── Stockage de l'appareil ──────────────────────────────────────────────────────────────────────────────────────────────── */
function partieLs(k) { try { const raw = localStorage.getItem(k); return raw ? JSON.parse(raw) : null; } catch (e) { return null; } }
function partieLsSet(k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } }
/** État relu (stockage) : complété et borné, ou null. */
function partieStateClean(o) {
  if (!o || typeof o !== 'object' || o.v !== PRT_V || !partieIdOk(o.id) || !Array.isArray(o.places) || o.places.length > PRT_POS_MAX) return null;
  const jeu = partieJeu(o), cmd = PRT_JEU[jeu].cmd, marks = PRT_JEU[jeu].marks, format = partieVieOk(jeu, o.format) ? o.format : PRT_JEU[jeu].def, seen = new Set(), places = [], num = (v, lo, hi, d = 0) => (Number.isFinite(v) ? Math.max(lo, Math.min(hi, Math.trunc(v))) : d);
  for (const x of o.places) {
    const pos = x && partieInt(x.pos, 1, PRT_POS_MAX); if (!pos || seen.has(pos)) return null;
    seen.add(pos);
    const p = partiePlace(x, num(x.vie, -999, 9999, format));
    if (cmd) for (const [k, v] of Object.entries(x.blessures && typeof x.blessures === 'object' ? x.blessures : {})) if (/^[1-8]b?$/.test(k) && v > 0) p.blessures[k] = num(v, 0, 999);
    for (const [k, v] of Object.entries(x.compteurs && typeof x.compteurs === 'object' ? x.compteurs : {}).slice(0, PRT_COUNTERS.length + PRT_FREE_MAX)) { const kk = partieCounterName(k); if (kk) p.compteurs[kk] = num(v, 0, 999); }
    const e = x.elimine; if (e && typeof e === 'object') p.elimine = { tour: num(e.tour, 0, 9999), cause: PRT_CAUSES.includes(e.cause) ? e.cause : 'autre', n: num(e.n, 0, 999), ...(partieInt(e.par, 1, PRT_POS_MAX) ? { par: e.par } : {}) };
    places.push(p);
  }
  places.sort((a, b) => a.pos - b.pos);
  const at = v => (seen.has(v) ? v : 0), ts = v => num(v, 0, 4.1e12);
  const w = Array.isArray(o.vainqueurs) ? o.vainqueurs.filter(x => seen.has(x)) : null;
  const st = { v: PRT_V, id: o.id, cree: ts(o.cree) || Date.now(), jeu, format, places, monarque: marks ? at(o.monarque) : 0, initiative: marks ? at(o.initiative) : 0, tour: num(o.tour, 0, 9999), actif: at(o.actif), premier: at(o.premier),
    debut: ts(o.debut), fin: ts(o.fin), vainqueurs: o.fin ? w || [] : null, rangs: null, ne: num(o.ne, 0, 999), journal: Array.isArray(o.journal) ? o.journal.filter(partieLogOk).slice(-PRT_LOG_MAX) : [] };
  if (o.rq && typeof o.rq === 'object') st.rq = { s: num(o.rq.s, 0, 1e9), ids: Array.isArray(o.rq.ids) ? o.rq.ids.filter(x => typeof x === 'string' && PRT_RQ_ID_RE.test(x)).slice(-PRT_RQ_IDS) : [], ...(o.rq.off ? { off: 1 } : {}) };
  if (o.rangs && st.fin) st.rangs = partieRanksClean(st, o.rangs);
  return st;
}
/** Entrée du journal relue (stockage) : assez complète pour être annulée sans rien casser. */
function partieLogOk(e) {
  if (!e || typeof e !== 'object' || !Number.isFinite(e.t)) return false;
  const pos = partieInt(e.p, 1, PRT_POS_MAX) != null, two = Array.isArray(e.w) && e.w.length === 2, three = Array.isArray(e.w) && e.w.length === 3;
  switch (e.a) {
    case 'v': return pos && Number.isFinite(e.n);
    case 'b': return pos && Number.isFinite(e.n) && Number.isFinite(e.v || 0) && typeof e.s === 'string' && /^[1-8]b?$/.test(e.s);
    case 'c': return pos && Number.isFinite(e.n) && typeof e.k === 'string' && !!partieCounterName(e.k);
    case 'm': case 'i': return Number.isInteger(e.w);
    case 'e': case 'n': case 'f': return two;
    case 'r': return pos && (e.w === null || typeof e.w === 'object');
    case 'g': case 'x': return three;
    case 'k': return e.w === null || typeof e.w === 'object';
    default: return false;
  }
}
/** Partie en cours sur cet appareil : enregistrée (journal raccourci si le stockage est plein), relue, effacée. */
function partieSave(st) { if (!st) return partieClear(); partieLsSet(PRT_AT, Date.now()); return partieLsSet(PRT_CUR, st) || partieLsSet(PRT_CUR, { ...st, journal: st.journal.slice(-300) }); }
const partieLoad = () => partieStateClean(partieLs(PRT_CUR));
const partieClear = () => { partieLsSet(PRT_AT, null); return partieLsSet(PRT_CUR, null); };
/** Partie laissée de côté : en préparation sans changement depuis 12 h, commencée sans action depuis 48 h (l'accueil l'efface, sans résultat).
 *  at : dernière sauvegarde (PRT_AT ; 0 : inconnue, la création, le début et la dernière action du journal comptent seuls). */
function partieStale(st, at, now = Date.now()) {
  if (!st || st.fin) return false;
  const e = st.journal[st.journal.length - 1], last = Math.max(Number(at) || 0, st.cree || 0, st.debut || 0, (e && e.t) || 0);
  return now - last > (st.debut ? PRT_IDLE_GAME : PRT_IDLE_SETUP);
}
const partieSavedAt = () => Number(partieLs(PRT_AT)) || 0;
/** Historique de cet appareil (la plus récente d'abord, PRT_HIST_MAX au plus). */
function partieHist() { const a = partieLs(PRT_HIST); return Array.isArray(a) ? a.map(partieHistClean).filter(Boolean) : []; }
/** Ajoute une entrée (même partie déjà là : gardée, « envoyée » et sa place complétées). */
function partieHistAdd(e) {
  const x = partieHistClean(e); if (!x) return false;
  if (typeof prgSoon === 'function') prgSoon('game');      // partie finie ici, ou réclamée : badges des parties (progress.js)
  const a = partieHist(), i = a.findIndex(y => y.id === x.id);
  if (i >= 0) a[i] = x.src === 'h' && a[i].src === 'h' ? { ...x, at: a[i].at } : { ...a[i], sv: a[i].sv || x.sv, moi: a[i].moi || x.moi, u: a[i].u || x.u };      // le créateur corrige sa partie : remplacée (à renvoyer)
  else a.push(x);
  a.sort((p, q) => q.date - p.date || (p.id < q.id ? -1 : 1));
  return partieLsSet(PRT_HIST, a.slice(0, PRT_HIST_MAX));
}
/** Retire une partie de l'historique de cet appareil. */
function partieHistDrop(id) { const a = partieHist(), b = a.filter(x => x.id !== id); return b.length !== a.length && partieLsSet(PRT_HIST, b); }
function partieHistMark(id, uid) { const a = partieHist(), x = a.find(y => y.id === id); if (!x) return; x.sv = 1; if (uid && !x.u) x.u = uid; partieLsSet(PRT_HIST, a); }
/* ── Statistiques (« Mes parties » › Statistiques, page d'un deck) : calculées sur l'historique, parties où ma place est connue ────────────── */
const partieKey = s => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();
/**
 * items : entrées d'historique (partieHistClean). → { n, wins, rate (0..1), duree (s, moyenne), tours (moyenne), rang (moyen), serie (victoires d'affilée en cours), best (meilleure série),
 *   decks [{ nom, commandant, n, wins, last }] (mes decks, le deck sans nom groupé par commandant), adv [{ nom, n, mine (mes victoires), theirs (les siennes) }] (adversaires, par prénom),
 *   cmds [{ nom, n, wins }] (commandants adverses vus à ma table, parties de Commander seulement), jeux { commander?, standard?, libre? : parties de chaque format,
 *   sans le filtre o.jeu } } ; listes triées par parties jouées. o.deck : seulement les parties jouées avec ce deck (nom) ; o.jeu : seulement ce format (Standard compté à part).
 */
function partieStats(items, o = {}) {
  const want = o.deck ? partieKey(o.deck) : '', jeux = {};
  const all = (items || []).map(x => ({ x, me: x && x.moi ? (x.places || []).find(p => p.pos === x.moi) : null })).filter(e => e.me && (!want || partieKey(e.me.deck) === want));
  for (const e of all) { const j = partieJeu(e.x); jeux[j] = (jeux[j] || 0) + 1; }
  const mine = all.filter(e => !o.jeu || partieJeu(e.x) === o.jeu).sort((a, b) => b.x.date - a.x.date);
  const out = { n: mine.length, wins: 0, rate: 0, duree: 0, tours: 0, rang: 0, serie: 0, best: 0, decks: [], adv: [], cmds: [], jeux };
  if (!mine.length) return out;
  const decks = new Map(), adv = new Map(), cmds = new Map(); let run = 0, open = true;
  for (const { x, me } of mine) {
    if (me.vainqueur) out.wins++;
    out.duree += x.duree; out.tours += x.tours; out.rang += me.rang;
    if (open && me.vainqueur) out.serie++; else open = false;
    const dk = partieKey(me.deck) || (me.commandant ? '#' + partieKey(me.commandant) : '');
    if (dk) { const d = decks.get(dk) || { nom: me.deck || '', commandant: me.commandant || '', n: 0, wins: 0, last: x.date }; d.n++; if (me.vainqueur) d.wins++; if (!d.commandant && me.commandant) d.commandant = me.commandant; decks.set(dk, d); }
    for (const p of x.places) {
      if (p.pos === me.pos) continue;
      const ak = partieKey(p.nom); if (ak) { const a = adv.get(ak) || { nom: p.nom, n: 0, mine: 0, theirs: 0 }; a.n++; if (me.vainqueur) a.mine++; if (p.vainqueur) a.theirs++; adv.set(ak, a); }
      const ck = partieJeu(x) === 'commander' ? partieKey(p.commandant) : ''; if (ck) { const c = cmds.get(ck) || { nom: p.commandant, n: 0, wins: 0 }; c.n++; if (p.vainqueur) c.wins++; cmds.set(ck, c); }
    }
  }
  for (const { me } of mine.slice().reverse()) { run = me.vainqueur ? run + 1 : 0; if (run > out.best) out.best = run; }      // du plus ancien au plus récent
  const by = (a, b) => b.n - a.n || b.wins - a.wins || String(a.nom).localeCompare(String(b.nom));
  out.rate = out.wins / out.n; out.duree = Math.round(out.duree / out.n); out.tours = Math.round((out.tours / out.n) * 10) / 10; out.rang = Math.round((out.rang / out.n) * 10) / 10;
  out.decks = [...decks.values()].sort((a, b) => b.n - a.n || b.last - a.last); out.adv = [...adv.values()].sort((a, b) => b.n - a.n || b.theirs - a.theirs || String(a.nom).localeCompare(String(b.nom))); out.cmds = [...cmds.values()].sort(by);
  return out;
}
/** File des envois : [{ q (identifiant), k ('res' : résultat du créateur | 'claim' : « c'était moi »), id, r, pos? (claim), c?, key? (salle d'attente), u (compte qui l'envoie ;
    '' : le prochain connecté), at, n (essais), err? (refus définitif : gardé, plus renvoyé) }]. */
function partieQueue() { const a = partieLs(PRT_QUEUE); return Array.isArray(a) ? a.filter(x => x && (x.k === 'res' || x.k === 'claim') && partieIdOk(x.id) && x.r && typeof x.q === 'string') : []; }
function partieQueueSet(a) {
  if (a.length > PRT_QUEUE_MAX) { const dead = a.filter(x => x.err); a = a.filter(x => !dead.slice(0, a.length - PRT_QUEUE_MAX).includes(x)); }      // trop plein : les refus définitifs partent d'abord, jamais un envoi en attente
  return partieLsSet(PRT_QUEUE, a.length ? a : null);
}
function partieEnqueue(it) {
  const a = partieQueue().filter(x => !(x.k === it.k && x.id === it.id && x.u === it.u));      // même envoi déjà en file : remplacé (le dernier résultat compte)
  a.push({ q: partieId(), at: Date.now(), n: 0, u: '', ...it });
  return partieQueueSet(a);
}

/* ── Fin, réclamation, envoi au serveur ──────────────────────────────────────────────────────────────────────────────────── */
/** Contexte de l'appli (navigateur) ; sous Node, tout vient de o : { fetch, user ({ uid, getIdToken(force) }), online, on (serveur qui annonce la partie), base (adresse du serveur) }. */
function partieEnv(o = {}) {
  return {
    fetch: o.fetch || (typeof fetch === 'function' ? (...x) => fetch(...x) : null),
    user: 'user' in o ? o.user : (typeof D !== 'undefined' && D && D.user) || null,
    online: 'online' in o ? o.online : !(typeof navigator !== 'undefined' && navigator.onLine === false),
    on: 'on' in o ? o.on : !!(typeof CTX !== 'undefined' && CTX && CTX.proxy && CTX.partie),
    base: o.base || '',
  };
}
/** Appel de /api/partie : jeton Firebase (auth : 'need' exigé, 'may' s'il y a un compte), sinon la clé de la salle. Erreur : { code, status, s? }. */
async function partieCall(env, path, { method = 'GET', body, auth, key } = {}) {
  if (!env.fetch) throw Object.assign(new Error('réseau'), { code: 'net' });
  const go = async force => {
    const h = { Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}) };
    if (auth && env.user) { try { h['x-firebase-token'] = await env.user.getIdToken(force); } catch (e) { throw Object.assign(new Error('jeton'), { code: 'net' }); } }
    else if (auth === 'need') throw Object.assign(new Error('déconnecté'), { code: 'auth_required' });
    if (key) h['x-partie-key'] = key;
    let r;
    try { r = await env.fetch(env.base + 'api/partie' + path, { method, cache: 'no-store', headers: h, body: body ? JSON.stringify(body) : undefined }); }
    catch (e) { throw Object.assign(new Error('réseau'), { code: 'net' }); }
    const j = await r.json().catch(() => null);
    if (!r.ok) throw Object.assign(new Error((j && j.message) || 'HTTP ' + r.status), { code: (j && j.error) || 'http', status: r.status, s: j && j.s });
    return j || {};
  };
  try { return await go(false); } catch (e) { if (auth && e.code === 'token_expired') return go(true); throw e; }
}
/**
 * Partie finie sur ce téléphone (le créateur) : le résultat va dans l'historique de l'appareil et dans la file d'envoi (avec la salle d'attente, si la partie
 * en avait une : les joueurs encore sur la page le reçoivent), la partie en cours est effacée, puis partieFlush. Rend le résultat (null : partie pas finie).
 */
function partieDone(st, o = {}) {
  if (!st || !st.fin) return null;
  const r = partieResult(st), env = partieEnv(o), uid = (env.user && env.user.uid) || '', room = partieRoom(), moi = (r.places.find(p => p.sorte === 'moi') || {}).pos || 0;
  partieHistAdd({ ...r, moi, src: 'h', at: Date.now(), u: uid, sv: 0 });
  partieEnqueue({ k: 'res', id: r.id, r, u: uid, ...(room && room.host && room.id === r.id ? { c: room.c, key: room.key } : {}) });
  if (partieLoad() && partieLoad().id === st.id) partieClear();
  if (o.flush !== false) partieKick(o);
  return r;
}
/** « C'était moi : place pos » (résultat lu par decodeResult, ou une entrée de l'historique de l'appareil) : historique, file d'envoi, partieFlush. false : place inconnue. */
function partieClaim(r, pos, o = {}) {
  const c = partieResClean(r); if (!c || !c.places.some(p => p.pos === pos)) return false;
  const env = partieEnv(o), uid = (env.user && env.user.uid) || '';
  partieHistAdd({ ...c, moi: pos, src: 'q', at: Date.now(), u: uid, sv: 0 });
  partieEnqueue({ k: 'claim', id: c.id, r: c, pos, u: uid });
  if (o.flush !== false) partieKick(o);
  return true;
}
/**
 * Envoie la file au serveur quand c'est possible : en ligne, compte connecté, serveur qui annonce la partie (/__ping partie). Un envoi réussi sort de la file
 * (historique marqué « envoyé ») ; un refus définitif (400, 413, 422) reste dans la file sans être renvoyé ; une panne (réseau, 429, 503…) arrête l'envoi :
 * rien n'est perdu, la suite part au prochain essai. Un seul envoi à la fois. Rend { sent, left (en attente), skip ('' | 'offline' | 'server' | 'login' | code d'erreur) }.
 */
function partieFlush(o = {}) {
  if (PRT.flush) return PRT.flush;
  PRT.flush = (async () => {
    const env = partieEnv(o), out = { sent: 0, left: 0, skip: '' };
    const todo = partieQueue().filter(x => !x.err); out.left = todo.length;
    if (!todo.length) return out;
    if (!env.online) { out.skip = 'offline'; return out; }
    if (!env.on) { out.skip = 'server'; return out; }
    if (!env.user || !env.user.uid) { out.skip = 'login'; return out; }
    for (const it of todo) {
      if (it.u && it.u !== env.user.uid) continue;      // envoi d'un autre compte de cet appareil : attend sa connexion
      try {
        if (it.k === 'claim') await partieCall(env, '/claim', { method: 'POST', auth: 'need', body: { r: it.r, pos: it.pos } });
        else await partieCall(env, '/result', { method: 'POST', auth: 'need', body: { r: it.r, ...(it.c ? { c: it.c, key: it.key } : {}) } });
      } catch (e) {
        const a = partieQueue(), x = a.find(y => y.q === it.q);
        if (x) { x.n = (x.n || 0) + 1; if (e.status === 400 || e.status === 413 || e.status === 422) x.err = String(e.code || 'refus').slice(0, 30); partieQueueSet(a); }
        if (x && x.err) continue;
        out.skip = e.code || 'net'; break;
      }
      partieQueueSet(partieQueue().filter(y => y.q !== it.q));
      partieHistMark(it.id, env.user.uid); out.sent++;
    }
    out.left = partieQueue().filter(x => !x.err).length;
    return out;
  })().finally(() => { PRT.flush = null; });
  return PRT.flush;
}
/** partieFlush, puis nouvel essai plus tard si des envois attendent une panne passagère (30 s, doublé à chaque échec, 10 min au plus ; navigateur seulement). */
async function partieKick(o = {}) {
  clearTimeout(PRT.t); PRT.t = null;
  let r; try { r = await partieFlush(o); } catch (e) { r = { left: 1, skip: 'net' }; }
  if (r.left && r.skip && !['offline', 'server', 'login'].includes(r.skip) && typeof window !== 'undefined') {
    PRT.retry = Math.min(600e3, PRT.retry ? PRT.retry * 2 : 30e3); PRT.t = setTimeout(() => partieKick(), PRT.retry);
  } else if (!r.left) PRT.retry = 0;
  return r;
}
/** Suppression du compte (decks.js) : son historique effacé du serveur. Lève une erreur si le serveur est injoignable alors que ce compte y a des parties. */
async function partieWipe(o = {}) {
  const env = partieEnv(o); if (!env.user || !env.on) return;
  const uid = env.user.uid, had = partieHist().some(x => x.sv && x.u === uid);
  try { await Promise.race([partieCall(env, '/me', { method: 'DELETE', auth: 'need' }), new Promise((_, rej) => setTimeout(() => rej(Object.assign(new Error('lent'), { code: 'net' })), 10000))]); }
  catch (e) { if (had && e.code !== 'partie_disabled') throw e; }
  partieQueueSet(partieQueue().filter(x => x.u !== uid));
}
/** Historique du compte sur le serveur (paginé) : { total, from, items [entrées, la plus récente d'abord] }. */
const partieHistFetch = (from = 0, n = 20, o = {}) => partieCall(partieEnv(o), `/hist?from=${Math.max(0, from | 0)}&n=${Math.max(1, Math.min(50, n | 0))}`, { auth: 'need' });
/** Retire une partie de l'historique du compte (serveur) et de l'appareil. */
async function partieHistDelete(id, o = {}) { const r = await partieCall(partieEnv(o), '/hist?id=' + encodeURIComponent(id), { method: 'DELETE', auth: 'need' }); partieHistDrop(id); return r; }

/* ── Salle d'attente (serveur : /api/partie ; relevé comme l'échange en direct) ─────────────────────────────────────────── */
/* Salle gardée sur l'appareil (PRT_ROOM) : { c (code), key (clé de place), host (créateur), guest (entré sans compte), id (partie), pos, u (compte), ecran (l'écran 2 de la table) }.
   Vue renvoyée par le serveur : { c, v, st ('wait' | 'live' : commencée, liste figée | 'done' : résultat là | 'end'), why, id, jeu (absent d'un serveur d'avant : Commander),
   format (points de départ), size, at, me (ma place), host,
   places [{ pos, n, k ('compte' | 'invite'), h? (créateur), dev (un téléphone a rejoint), on (présent il y a moins de 15 s), p? (miniature, en attente seulement), deck?, t? (jeton : vue du créateur,
   partie commencée) }], res? (résultat sans jetons), live? (partie commencée : état du compteur envoyé par le créateur, partieLive), duo? ({ b : places montrées par l'écran 2,
   dev : un écran 2 a rejoint, on : présent }), ecran? (ce téléphone est l'écran 2) }. why (st 'end') : 'host' (le créateur a annulé
   la partie en préparation), 'drop' (abandonnée en cours), 'stale' (effacée de son téléphone, laissée de côté trop longtemps), 'replaced' (il en prépare une autre), 'idle' (inactive). */
const partieRoom = () => { const r = partieLs(PRT_ROOM); return r && PRT_CODE_RE.test(r.c) && typeof r.key === 'string' ? r : null; };
const partieRoomForget = () => { partieRoomStop(); partieLsSet(PRT_ROOM, null); };
function partieRoomKeep(v, j, extra) { partieLsSet(PRT_ROOM, { c: v.c, key: j.key, id: v.id, pos: v.me, ...extra }); }
/** Places de la salle d'attente pour cette partie : celles du format (8, 2 en Standard), plus s'il le faut pour les places déjà prises (au moins 2, 8 au plus). */
const partieRoomSize = (st, more = 0) => Math.min(PRT_POS_MAX, Math.max(2, PRT_JEU[partieJeu(st)].size, more, ...st.places.map(p => p.pos)));
/** Le créateur ouvre la salle d'attente de sa partie (compte connecté exigé). o : { n (pseudo), p (miniature), l (langue), size (places ; défaut : partieRoomSize),
    allco (« Tout le monde est co-hôte ») }. → vue. */
async function partieRoomCreate(st, o = {}) {
  const env = partieEnv(o), me = st.places.find(p => p.sorte === 'moi') || {};
  if (partieLs(PRT_ROOM_END)) await partieRoomEndFlush(o);      // la table d'avant, terminée sans réseau : ses téléphones sont prévenus d'abord
  const j = await partieCall(env, '', { method: 'POST', auth: 'need', body: { id: st.id, n: o.n || me.nom || '', ...(o.p ? { p: o.p } : {}), l: o.l || '', pos: me.pos || 1, ...(me.deck ? { deck: me.deck } : {}), jeu: partieJeu(st), format: st.format, size: o.size || partieRoomSize(st), ...(o.allco ? { allco: true } : {}) } });
  partieRoomKeep(j.s, j, { host: true, guest: false, u: (env.user && env.user.uid) || '' });
  return j.s;
}
/** Avant d'entrer : la table (sans clé) → { c, st, jeu, format, size, host (pseudo du créateur), places [{ pos, n, k }] }. */
const partiePeek = (code, o = {}) => partieCall(partieEnv(o), '/peek?c=' + encodeURIComponent(code));
/** Rejoindre la table : o : { pos (sinon la première libre), n (pseudo, ou prénom de l'invité), p, l, deck, guest (true : sans compte même connecté) }. → vue.
    o.ecran : ce téléphone devient l'écran 2 de la table (grande table répartie sur 2 téléphones : aucune place, sans compte ; gardé avec ecran: true). */
async function partieRoomJoin(code, o = {}) {
  const env = partieEnv(o), auth = !o.guest && !o.ecran && env.user ? 'need' : '';
  const j = await partieCall(env, '/join', { method: 'POST', auth, body: o.ecran ? { c: code, ecran: 1 } : { c: code, ...(o.pos ? { pos: o.pos } : {}), n: o.n || '', ...(o.p ? { p: o.p } : {}), l: o.l || '', ...(o.deck ? { deck: o.deck } : {}) } });
  partieRoomKeep(j.s, j, { host: false, guest: !auth, u: auth ? env.user.uid : '', ...(o.ecran ? { ecran: true } : {}) });
  return j.s;
}
/**
 * Action sur la salle (clé gardée) : seat { pos } · me { n?, deck? } · leave ; créateur : add { pos?, n, deck? } (invité sans téléphone) · move { from, to } ·
 * kick { pos } · opts { jeu?, format?, size? } · start (liste figée, jetons des comptes) · end. → vue ; salle disparue ou joueur retiré : oubliée (erreur gone / kicked).
 */
async function partieRoomOp(op, extra = {}, o = {}) {
  const room = partieRoom(); if (!room) throw Object.assign(new Error('pas de salle'), { code: 'gone' });
  try {
    const s = await partieCall(partieEnv(o), '/op', { method: 'POST', key: room.key, body: { c: room.c, op, ...extra } });
    if (op === 'leave' || op === 'end') partieRoomForget(); else if ('me' in s && s.me !== room.pos) partieLsSet(PRT_ROOM, { ...room, pos: s.me });
    return s;
  } catch (e) { if (e.code === 'gone' || e.code === 'kicked') partieRoomForget(); throw e; }
}
const partieRoomLeave = o => partieRoomOp('leave', {}, o).catch(() => { partieRoomForget(); return null; });
/** Le créateur termine la salle sans résultat (partie supprimée, abandonnée ; why 'stale' : effacée car trop vieille) : les téléphones de la table quittent avec la raison.
    Sans réseau (ou serveur en panne) : la salle est oubliée ici et sa fin renvoyée plus tard (partieRoomEndFlush : retour du réseau, prochaine salle). */
async function partieRoomEnd(why, o = {}) {
  const room = partieRoom(); if (!room) return null;
  try { return await partieRoomOp('end', why ? { why } : {}, o); }
  catch (e) { if (room.host && (e.code === 'net' || e.status === 429 || e.status >= 500)) partieLsSet(PRT_ROOM_END, { c: room.c, key: room.key, ...(why ? { why } : {}) }); partieRoomForget(); return null; }
}
async function partieRoomEndFlush(o = {}) {
  const x = partieLs(PRT_ROOM_END); if (!x || !PRT_CODE_RE.test(x.c) || typeof x.key !== 'string') { if (x) partieLsSet(PRT_ROOM_END, null); return; }
  try { await partieCall(partieEnv(o), '/op', { method: 'POST', key: x.key, body: { c: x.c, op: 'end', ...(x.why ? { why: x.why } : {}) } }); partieLsSet(PRT_ROOM_END, null); }
  catch (e) { if (!(e.code === 'net' || e.status === 429 || e.status >= 500)) partieLsSet(PRT_ROOM_END, null); }      // salle déjà partie (404) : rien de plus à faire
}
/**
 * État du compteur pour les téléphones de la table (partie commencée) : { tour, actif, monarque, initiative, ack? (dernier delta des places appliqué : partieRemote),
 * lock? (saisie depuis les autres téléphones coupée), places [{ pos, nom, deck?, vie, blessures,
 * compteurs (poison, impot, energie, experience : ceux qui ne sont pas à 0), elimine? ({ cause, par? }) }] } ; ni jeton ni journal. Lu de même par le serveur (partieLiveClean).
 */
function partieLive(st) {
  const rq = st.rq || {};
  return { tour: st.tour, actif: st.actif, monarque: st.monarque, initiative: st.initiative, ...(rq.s ? { ack: rq.s } : {}), ...(rq.off ? { lock: 1 } : {}), places: st.places.map(p => {
    const c = {}; for (const k of PRT_COUNTERS) if (p.compteurs[k]) c[k] = p.compteurs[k];
    return { pos: p.pos, nom: p.nom, ...(p.deck ? { deck: p.deck } : {}), vie: p.vie, blessures: { ...p.blessures }, compteurs: c, ...(p.elimine ? { elimine: { cause: p.elimine.cause, ...(p.elimine.par ? { par: p.elimine.par } : {}) } } : {}) };
  }) };
}
/** État reçu (serveur : op live ; téléphone d'une place : vue) relu et borné comme une partie enregistrée (partieStateClean), pour ce format de jeu ; null s'il est illisible. */
function partieLiveClean(o, jeu) {
  if (!o || typeof o !== 'object' || !Array.isArray(o.places) || !o.places.length || o.places.length > PRT_POS_MAX) return null;
  const j = PRT_JEUX.includes(jeu) ? jeu : 'commander';
  const st = partieStateClean({ v: PRT_V, id: 'partielive', jeu: j, format: PRT_JEU[j].def, tour: o.tour, actif: o.actif, monarque: o.monarque, initiative: o.initiative, debut: 1, rq: { s: o.ack, ids: [], off: o.lock },
    places: o.places.map(p => (p && typeof p === 'object' ? { pos: p.pos, sorte: 'invite', nom: p.nom, deck: p.deck, vie: p.vie, blessures: p.blessures, compteurs: p.compteurs, elimine: p.elimine ? { ...p.elimine, tour: 0, n: 0 } : null } : null)) });
  return st ? partieLive(st) : null;
}
/** Le créateur envoie l'état du compteur à la salle (op live { g }). → { ok, v }. */
const partieRoomLive = (st, o = {}) => partieRoomOp('live', { g: partieLive(st) }, o);
/** Places de la partie d'après la salle (créateur, avant le début) : sa place « moi », les comptes (uid : jeton du serveur, donné au lancement), les invités. */
function partieFromRoom(st, view) {
  if (!view || !Array.isArray(view.places) || !partieSetup(st)) return st;
  const jeu = PRT_JEUX.includes(view.jeu) ? view.jeu : partieJeu(st);      // serveur d'avant (sans jeu) : celui de la partie
  let next = { ...st, places: [], jeu, format: partieVieOk(jeu, view.format) ? view.format : partieVieOk(jeu, st.format) ? st.format : PRT_JEU[jeu].def };  for (const x of view.places) {
    const old = st.places.find(p => p.pos === x.pos);
    next = partieAddPlace(next, { pos: x.pos, sorte: x.h ? 'moi' : x.k === 'compte' ? 'compte' : 'invite', nom: x.n, ...(x.t ? { uid: x.t } : {}), deck: x.deck || (old && old.deck) || null });
  }
  for (const p of st.places) if (p.sorte === 'invite' && partieIdx(next, p.pos) < 0) next = partieAddPlace(next, p);      // invités ajoutés ici seulement (hors ligne au moment de l'ajout)
  return next;
}
/** Le résultat arrive dans la salle (st done) : gardé dans l'historique de cet appareil (une fois ; enregistré par le serveur pour un compte, local pour un invité). */
function partieRoomResult(view, room) {
  if (!view || !view.res || !room || room.host || room.ecran) return false;      // l'écran 2 n'a pas de place : rien dans son historique
  return partieHistAdd({ ...view.res, moi: view.me || room.pos || 0, src: 's', at: Date.now(), u: room.guest ? '' : room.u || '', sv: room.guest ? 0 : 1 });
}
/** Délai avant le relevé suivant : salle qui se remplit 1,2 s (5 s écran caché, 10 s après 2 min) ; partie en cours 10 s (2 s quand ce téléphone la suit en direct :
    partieRoomPace ; 30 s caché) ; panne : plus long. */
function partieRoomGap(w, st) {
  if (w.fail) return Math.min(30000, 1500 * w.fail);
  const hid = typeof document !== 'undefined' && document.hidden;
  if (st === 'live') return hid ? 30000 : w.fast ? 2000 : 10000;
  return hid ? (Date.now() - w.hid > 120e3 ? 10000 : 5000) : 1200;
}
/**
 * Suit la salle gardée sur cet appareil (comme l'échange en direct : version, réponse courte sans nouveauté, présence). cb(vue, { on (places présentes ; 0 : l'écran 2), net (false : connexion perdue),
 * gone ('gone' | 'kicked' : salle oubliée) }) à chaque changement. Le résultat arrivé est rangé dans l'historique (partieRoomResult). Rend une fonction d'arrêt.
 * Le créateur, partie commencée : o.qa() (dernier delta des places appliqué) et o.onQ(deltas) : la file des saisies des autres téléphones (partieRemote).
 */
function partieRoomWatch(cb, o = {}) {
  partieRoomStop();
  const w = { stop: false, t: 0, v: 0, view: null, fail: 0, hid: Date.now(), on: '' }; PRT.watch = w;
  const env = partieEnv(o), call = typeof cb === 'function' ? cb : () => {};
  const tick = async () => {
    const room = partieRoom(); if (w.stop || !room) return;
    try {
      const j = await partieCall(env, `/s?c=${room.c}&v=${w.v}${typeof o.qa === 'function' ? '&q=' + (o.qa() || 0) : ''}`, { key: room.key });
      if (w.stop) return;
      if (Array.isArray(j.q) && j.q.length && typeof o.onQ === 'function') o.onQ(j.q);
      const was = w.fail; w.fail = 0;
      if (j.same) { const on = (j.on || []).join(','); if (on !== w.on || was) { w.on = on; if (w.view) call(w.view, { on: j.on || [], net: true }); } }
      else {
        const on = [...(j.duo && j.duo.on ? [0] : []), ...j.places.filter(p => p.on).map(p => p.pos)];      // 0 : l'écran 2 (présent)
        w.v = j.v; w.view = j; w.on = on.join(',');
        if (j.st === 'done') partieRoomResult(j, room);
        call(j, { on, net: true });
        if (j.st === 'end' || j.st === 'done') { partieRoomForget(); return; }      // finie : plus rien à suivre (le résultat est rangé)
      }
    } catch (e) {
      if (w.stop) return;
      if (e.code === 'gone' || e.code === 'kicked') { partieRoomForget(); call(w.view, { on: [], net: true, gone: e.code }); return; }
      w.fail++; call(w.view, { on: [], net: false });
    }
    if (!w.stop) w.t = setTimeout(tick, partieRoomGap(w, w.view && w.view.st));
  };
  if (typeof document !== 'undefined' && document.addEventListener && !PRT.vis) {
    PRT.vis = () => { const x = PRT.watch; if (!x || x.stop) return; if (document.hidden) x.hid = Date.now(); else { clearTimeout(x.t); x.t = setTimeout(x.tick, 50); } };
    document.addEventListener('visibilitychange', PRT.vis);
  }
  w.tick = tick; tick();
  return () => { w.stop = true; clearTimeout(w.t); if (PRT.watch === w) PRT.watch = null; };
}
function partieRoomStop() { const w = PRT.watch; if (w) { w.stop = true; clearTimeout(w.t); PRT.watch = null; } }
/** Partie suivie en direct sur ce téléphone (points de vie affichés) : relevé toutes les 2 s, relancé tout de suite à l'ouverture. */
function partieRoomPace(fast) { const w = PRT.watch; if (!w || w.stop || !!w.fast === !!fast) return; w.fast = !!fast; if (fast && w.tick) { clearTimeout(w.t); w.t = setTimeout(w.tick, 50); } }

/* ── Crochets de l'appli (app.js, decks.js) ──────────────────────────────────────────────────────────────────────────────── */
/** Lancement : envoi de la file au retour du réseau, au retour sur l'appli, et une fois le serveur interrogé (/__ping). Rien d'autre (aucune interface). */
function partieInit() {
  if (PRT.inited || typeof window === 'undefined') return; PRT.inited = true;
  const kick = () => { if (partieQueue().some(x => !x.err)) partieKick(); if (partieLs(PRT_ROOM_END)) partieRoomEndFlush(); };
  window.addEventListener('online', () => { PRT.retry = 0; kick(); });
  if (typeof document !== 'undefined') document.addEventListener('visibilitychange', () => { if (!document.hidden) kick(); });
  setTimeout(kick, 6000);
}
/** Connexion ou changement de compte (decks.js › onUser) : ce qui attendait ce compte part. */
function partieUser(user) { if (user && typeof window !== 'undefined') setTimeout(() => { if (partieQueue().some(x => !x.err)) partieKick(); }, 1500); }

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { PRT_CUR, PRT_QUEUE, PRT_HIST, PRT_ROOM, PRT_HIST_MAX, PRT_LOG_MAX, PRT_MERGE_MS, PRT_FORMATS, PRT_COUNTERS, PRT_CAUSES, PRT_SORTES, PRT_LEN, PRT_SITE, PRT_LINK_MAX, PRT_ID_RE, PRT_CODE_RE, PRT_TK_RE, PRT_IMG_RE,
    PRT_JEUX, PRT_JEU, PRT_VIE_MAX, partieJeu, partieVieOk, partieCmdOn, partieMarksOn, partieSetJeu, partieRoomSize,
    partieId, partieStr, partieCut, partieDeck, partieDeckOf, partieNew, partieAddPlace, partieRemovePlace, partieMovePlace, partieSetPlace, partieSetFormat,
    partieLife, partieCmdDamage, partieCounter, partieMark, partieMonarch, partieInitiative, partieEliminate, partieRevive, partieStart, partieFirst, partieNextTurn, partieEnd, partieSetRanks, partieUndo,
    partieProposals, partieRanks, partieResult, partieResClean, partieHistClean, partieStats, partieCk, encodeResult, decodeResult, partieResultLink, partieTableLink, partieParseUrl,
    partieStateClean, partieSave, partieLoad, partieClear, partieStale, partieSavedAt, PRT_AT, PRT_IDLE_SETUP, PRT_IDLE_GAME, partieHist, partieHistAdd, partieHistDrop, partieQueue, partieEnqueue, partieDone, partieClaim, partieFlush, partieKick, partieWipe, partieHistFetch, partieHistDelete,
    partieRoom, partieRoomCreate, partiePeek, partieRoomJoin, partieRoomOp, partieRoomLeave, partieRoomEnd, partieRoomEndFlush, partieLive, partieLiveClean, partieRoomLive, partieRoomPace, PRT_ROOM_END, partieRemote, partieRemoteOff, PRT_DQ_ID_RE, PRT_DQ_N,
    partieFromRoom, partieRoomResult, partieRoomWatch, partieRoomStop, partieInit, partieUser };
}
