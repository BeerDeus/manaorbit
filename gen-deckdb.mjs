#!/usr/bin/env node
// Génère la base de l'assistant de deck Commander (« coach ») : corpus de decks réels, rôle de chaque carte, cibles par catégorie, cartes conseillées par commandant.
//   node gen-deckdb.mjs [dossier de sortie]      (Node ≥ 18, aucune dépendance ; défaut : deckdb-out/)
// Sorties (publiées sur la branche « deck-corpus » par .github/workflows/deckdb.yml, jamais dans l'appli elle-même) :
//   corpus.json.gz : la base brute, gardée d'un passage à l'autre (decks Archidekt les plus vus, pages commandant et thèmes EDHREC, étiquettes des cartes).
//                    Reste sur le serveur (branche) : sert à l'analyse et au calcul, l'appli n'en reçoit que les agrégats.
//   dkw.json.gz    : les agrégats lus par le serveur (server/dkw-srv.mjs) : table des cartes ([nom, identité, coût, types (bits), rôles (bits), prix € en centimes,
//                    drapeaux (1 Game Changer · 2 tour supplémentaire · 4 destruction massive de terrains · 8 tuteur · 16 interdite en Commander), couleurs produites, rang EDHREC, coût de mana, mécaniques (data/card-mech.json), sous-types]), cibles par catégorie
//                    (toutes, par bracket, par thème, par nombre de couleurs), et pour chaque commandant / thème ses cartes conseillées.
//   log.txt        : le journal.
// Sources (lecture lente et polie, User-Agent qui s'annonce) :
//   - Archidekt : decks Commander les plus vus (par commandant, et les 1 000 plus vus tous commandants confondus). Chaque deck donne aussi, pour chaque carte,
//     la catégorie par défaut d'Archidekt (Ramp, Draw, Removal…), les étiquettes du Scryfall Tagger (oTags) et la catégorie choisie par l'auteur du deck.
//   - EDHREC : page de chaque commandant (taux d'inclusion et synergie de ~300 cartes, courbe, nombre de terrains, brackets) et de ses principaux thèmes,
//     pages des thèmes généraux (tags/<thème>).
//   - Scryfall : fichier « oracle cards » (toutes les cartes : coût, types, identité, texte, prix, Game Changer) et quelques recherches Tagger (otag:) pour les rôles.
// Incrémental : le corpus précédent (DECKDB_PREV, défaut <sortie>/corpus.json.gz) est repris ; chaque passage complète ce qui manque ou a vieilli, dans son budget de temps.
// Variables : DECKDB_MIN (budget total en minutes, 290) · DECKDB_ARCH_K (decks par commandant à la première recherche, 40 ; ensuite, pages suivantes des plus joués) · DECKDB_CMDS (commandants couverts, 1500) · DECKDB_THEMES (thèmes EDHREC par commandant, 3)
//   DECKDB_EDH_DAYS (âge maximal d'une page EDHREC, 7) · DECKDB_ARCH_DAYS (âge maximal d'une recherche Archidekt, 21) · DECKDB_GLOBAL (decks les plus vus tous commandants, 1000)
//   DECKDB_OFFLINE (1 : aucune lecture réseau, agrégats recalculés depuis le corpus de DECKDB_PREV ; seul dkw.json.gz est écrit) · DECKDB_MECH (classement des cartes, data/card-mech.json)
//   DECKDB_ARCH_OFF (1 : sans lecture d'Archidekt, passage court) · DECKDB_TAGGER (0 : sans recherches Tagger) · DECKDB_BULK (fichier oracle-cards local, facultatif ; 0 : sans, cartes lues par /cards/collection) · EDH_FILE (pwa/edh.bin.gz : liste des commandants et leurs thèmes) · bases : EDH_BASE, ARCH_BASE, SCRY_BASE.
import { writeFileSync, readFileSync, existsSync, mkdirSync, appendFileSync, renameSync } from 'node:fs';
import { gzipSync, gunzipSync } from 'node:zlib';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { normKey, edhSlug, cardviewsOf, archidektList, archDay, GENERAL_THEMES } from './gen-edhrec.mjs';
import { readMech, taxonomy } from './tools/card-mech-merge.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const UA = 'DeckDeal-deckdb/1.0 (+https://github.com/BeerDeus/manaorbit)';
const env = (k, d) => (process.env[k] === undefined || process.env[k] === '' ? d : Number(process.env[k]));
const BUDGET_MS = env('DECKDB_MIN', 290) * 60000, ARCH_K = env('DECKDB_ARCH_K', 40), CMDS_MAX = env('DECKDB_CMDS', 1500), THEMES_K = env('DECKDB_THEMES', 3);
const TAGGER = env('DECKDB_TAGGER', 1) !== 0, EDH_DAYS = env('DECKDB_EDH_DAYS', 7), ARCH_DAYS = env('DECKDB_ARCH_DAYS', 21), GLOBAL_N = env('DECKDB_GLOBAL', 1000);
const EDH_BASE = process.env.EDH_BASE || 'https://json.edhrec.com/pages/', ARCH_BASE = process.env.ARCH_BASE || 'https://archidekt.com/api/', SCRY = process.env.SCRY_BASE || 'https://api.scryfall.com/';
const GAP = process.env.DECKDB_GAP === undefined ? null : Number(process.env.DECKDB_GAP);      // tests : espacement imposé (0 = aucun)
const T0 = Date.now(), DAY = 864e5;
const left = () => BUDGET_MS - (Date.now() - T0);

/* ── Rôles ──────────────────────────────────────────────────────────────────────────────────────────
   Un rôle par bit (même liste que DKW_ROLES de src/deckwiz.js : test-deckdb.mjs le vérifie). Une carte peut en avoir plusieurs (Beast Within : retrait ;
   Smothering Tithe : rampe ; Toxic Deluge : balayage). Les cibles sont calculées avec ce même classement : jauges et cibles parlent la même langue. */
export const ROLES = ['land', 'ramp', 'draw', 'removal', 'wipe', 'counter', 'tutor', 'protect', 'recursion', 'wincon'];
export const RB = Object.fromEntries(ROLES.map((r, i) => [r, 1 << i]));
/** Catégorie par défaut d'Archidekt → rôle (les autres catégories, Tokens, Pump, Anthem…, décrivent le plan du deck, pas un rôle de base). */
const DC_ROLE = { ramp: 'ramp', draw: 'draw', removal: 'removal', 'board wipe': 'wipe', wipe: 'wipe', 'counterspell': 'counter', counter: 'counter', counters_: '', tutor: 'tutor', protection: 'protect', recursion: 'recursion', finisher: 'wincon', land: 'land' };
/** Étiquettes du Scryfall Tagger (oTags d'Archidekt, minuscules, espaces ; ou otag: de Scryfall, tirets) → rôle. Motifs stricts : « tutor-land-basic » est de la rampe, pas un tuteur ;
 *  « cantrip » seul n'est pas de la pioche (il remplace la carte, sans avantage). Complété par docs/deckbuilder/tagger-tags.json s'il existe. */
const TAG_RULES = [
  ['ramp', /^(ramp|mana rock|mana dork|mana producer|land ramp|adds multiple mana|utility mana rock|mana rock with set's mechanic|repeatable treasures|extra land|mana doubler|mana increaser)$/],      // rituels (mana d'un tour) et réducteurs de coût : à part (recherche)
  ['draw', /^(draw engine|repeatable pure draw|burst draw|repeatable card advantage|wheel|impulse draw|repeatable impulsive draw|tome|life for cards|repeatable draw)$/],
  ['removal', /^(spot removal|removal-creature|removal-destroy|removal-exile|removal-nonland|removal-planeswalker|removal-sacrifice|removal-artifact|removal-enchantment|removal-toughness|removal-permanent|disenchant\/naturalize|burn creature|swap removal|removal-fight|edict)$/],
  ['wipe', /^(sweeper|sweeper-one-sided|board wipe|boardwipe|mass removal|wrath|sweeper-creature|sweeper-nonland|sweeper-artifact|sweeper-enchantment|mass bounce)$/],
  ['counter', /^(counterspell|counterspell-soft|counterspell-noncreature|counterspell-creature|counterspell-hard|counterspell-ability|counterspell-activated)$/],
  ['tutor', /^(tutor|tutor-card|tutor-to-hand|tutor-to-top|tutor-creature|tutor-artifact|tutor-enchantment|tutor-instant|tutor-sorcery|tutor-permanent|tutor-planeswalker|tutor-equipment|tutor-aura|tutor-to-battlefield|tutor-to-graveyard)$/],
  ['protect', /^(protects-creature|protects-all|protects-permanent|protects-planeswalker|gives hexproof|gives indestructible|gives shroud|gives protection|phasing-protection|protects-player|protects-artifact)$/],
  ['recursion', /^(reanimate|reanimate-creature|reanimate-permanent|reanimate-artifact|reanimate-enchantment|regrowth|regrowth-creature|regrowth-permanent|regrowth-instant|regrowth-sorcery|recursion|raise dead|mass reanimate)$/],
  ['wincon', /^(finisher|wincon|alternate win condition|alt-win|win the game|extra combat|overrun|mass pump)$/],
];
// Les étiquettes retenues sont choisies à la main d'après docs/deckbuilder/tagger-tags.json (recherche) : ce fichier contient aussi des racines trop larges
// (« removal » : 6 000 cartes, « tutor-land » : de la rampe), il n'est donc pas fusionné tel quel.
/** Rôles d'une étiquette du Tagger (bits). */
export function tagRoles(tag) {
  const t = String(tag || '').toLowerCase().trim(), s = t.replace(/ /g, '-'), sp = t.replace(/-/g, ' '); let b = 0;
  for (const [r, re] of TAG_RULES) if (re.test(t) || re.test(s) || re.test(sp)) b |= RB[r];
  return b;
}
/** Catégorie écrite par l'auteur d'un deck (libre : « Ramp & Reduction », « Card Draw », « Board Wipes », « Interaction »…) → rôle (bits ; 0 = type de carte ou plan du deck). */
export function userCatRoles(label) {
  const s = String(label || '').toLowerCase(); let b = 0;
  if (/\b(ramp|mana rocks?|mana dorks?|acceleration|accel|fixing|treasure ramp|mana)\b/.test(s) && !/\bmana ?(sink|value)\b/.test(s)) b |= RB.ramp;
  if (/\b(draw|card draw|card advantage|advantage|cards?\s*adv|pioche)\b/.test(s)) b |= RB.draw;
  if (/\b(removal|spot removal|interaction|kill|answers?|destroy|exile)\b/.test(s) && !/\bwipe|sweep|wrath|mass\b/.test(s)) b |= RB.removal;
  if (/\b(wipes?|board ?wipes?|sweepers?|wraths?|mass removal|boardwipes?)\b/.test(s)) b |= RB.wipe;
  if (/\b(counters?pells?|counterspells|counter magic|counters? spells?)\b/.test(s)) b |= RB.counter;
  if (/\btutors?\b/.test(s)) b |= RB.tutor;
  if (/\b(protection|protect|hexproof|indestructible)\b/.test(s)) b |= RB.protect;
  if (/\b(recursion|reanimat\w*|regrowth|recur)\b/.test(s)) b |= RB.recursion;
  if (/\b(win ?cons?|win conditions?|finishers?|wincons?|combo pieces?|combos?)\b/.test(s)) b |= RB.wincon;
  return b;
}
/** Secours sur le texte de la carte (Scryfall) : rôles évidents seulement, pour les cartes qu'aucune autre source n'a classées (nouvelles extensions). */
export function textRoles(card) {
  const t = String(card.text || '').replace(/\([^)]*\)/g, ''), tl = String(card.type || ''); let b = 0;
  if (/\bLand\b/.test(tl) && !/\/\//.test(card.name || '')) return RB.land;
  if (/\bLand\b/.test(tl)) b |= RB.land;
  if (/\{T\}[^.]*:\s*Add \{|Add (one|two|three) mana|Add \{[WUBRGC]\}/.test(t) && !/\bLand\b/.test(tl)) b |= RB.ramp;
  if (/search your library for (up to (two|three) )?(a |an )?(basic )?(land|Forest|Plains|Island|Swamp|Mountain)/i.test(t) && /onto the battlefield/i.test(t)) b |= RB.ramp;
  if (/create (a|two|three|X) Treasure tokens?/i.test(t) && /whenever|at the beginning/i.test(t)) b |= RB.ramp;
  if (/\bdraws? (two|three|four|X|that many|cards equal)/i.test(t) || /whenever[^.]*,\s*(you may )?draw a card/i.test(t) || /at the beginning of[^.]*draw a card/i.test(t)) b |= RB.draw;
  if (/(destroy|exile) all (creatures|nonland permanents|other creatures|artifacts|enchantments|permanents)/i.test(t) || /all creatures get -\d+\/-\d+/i.test(t) || /return all nonland permanents/i.test(t)) b |= RB.wipe;
  else if (/(destroy|exile) target (creature|nonland permanent|artifact|enchantment|planeswalker|permanent)/i.test(t) || /deals? \w+ damage to (any target|target creature)/i.test(t) || /target (player|opponent) sacrifices/i.test(t)) b |= RB.removal;
  if (/counter target (spell|noncreature spell|creature spell|instant|activated)/i.test(t)) b |= RB.counter;
  if (/search your library for (a|an|up to \w+) (card|creature|artifact|enchantment|instant|sorcery|planeswalker)(?! card with)/i.test(t) && !/land/i.test(t.slice(0, 80))) b |= RB.tutor;
  if (/(gain|gains|have) (hexproof|indestructible|shroud|protection from)/i.test(t) && /(creatures you control|target creature you control|permanents you control)/i.test(t)) b |= RB.protect;
  if (/return (target|up to \w+ target|all)? ?[^.]*card[^.]* from (your|a) graveyard to (the battlefield|your hand)/i.test(t)) b |= RB.recursion;
  if (/you win the game|each opponent loses the game|extra combat phase/i.test(t)) b |= RB.wincon;
  return b;
}
/** Rôles retenus d'une carte d'après ses sources : { dc: catégorie Archidekt, tags: [étiquettes], votes: { rôle: votes }, decks: decks où elle figure avec une catégorie d'auteur, text: carte Scryfall, type }.
 *  Ordre de confiance : catégorie Archidekt et Tagger (ajoutent chacun leurs rôles) ; votes des auteurs (≥ 30 % des decks qui catégorisent, 4 votes au moins) ; texte en dernier recours. */
export function cardRoles({ dc, tags, votes, decks, scry }) {
  let b = 0, known = false;
  const d = DC_ROLE[String(dc || '').toLowerCase()]; if (d) { b |= RB[d]; known = true; } else if (dc) known = true;
  let tb = 0; for (const t of tags || []) { tb |= tagRoles(t); known = true; } b |= tb;
  if (tb & RB.counter && !(tb & RB.removal) && String(dc || '').toLowerCase() === 'removal') b &= ~RB.removal;      // Counterspell rangé « Removal » par Archidekt : un contresort, pas un retrait
  // « tutor-to-hand » de Cultivate ou Land Tax : un terrain cherché, c'est de la rampe, pas un tuteur
  if (b & RB.tutor && String(dc || '').toLowerCase() !== 'tutor' && (tags || []).some(t => /^tutor[- ]land/.test(t)) && !(tags || []).some(t => /^tutor([- ](card|creature|artifact|enchantment|instant|sorcery|permanent|planeswalker|equipment|aura))?$/.test(t))) b &= ~RB.tutor;
  if (votes && decks >= 4) for (const [r, n] of Object.entries(votes)) if (RB[r] && n >= 4 && n / decks >= 0.3) b |= RB[r];
  if (scry) {
    if (/\bLand\b/.test(scry.type || '')) b |= RB.land;
    if (!known && !b) b |= textRoles(scry);
    if (scry.gc && /Tutor|search your library for a card/i.test(scry.text || '')) b |= RB.tutor;
  }
  if (b & RB.land && /\bLand\b/.test(scry ? scry.type || '' : '') && !/\/\//.test(scry ? scry.name || '' : '')) b &= RB.land | RB.ramp;
  if (b & RB.wipe) b &= ~RB.removal;      // un balayage compte comme balayage, pas comme retrait ciblé (même partage que les modèles de deck)      // un terrain reste un terrain (une « rampe » pour Ancient Tomb)
  return b;
}

/* ── Statistiques ───────────────────────────────────────────────────────────────────────────────── */
const q = (sorted, p) => { if (!sorted.length) return 0; const i = (sorted.length - 1) * p, lo = Math.floor(i), hi = Math.ceil(i); return +(sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo)).toFixed(2); };
/** Profil d'un deck : nombre de cartes de chaque rôle, coût moyen des non-terrains, « pas chères » (rampe ou pioche de coût ≤ 2, au sens de Karsten), Game Changers. */
export function deckProfile(cards, info) {
  const p = { n: 0, mv: 0, cheap: 0, gc: 0, nonland: 0 }; for (const r of ROLES) p[r] = 0; let mvSum = 0;
  for (const [k, qty] of cards) {
    const c = info(k); p.n += qty; if (!c) continue;      // carte inconnue : comptée dans le deck, sans rôle
    for (const r of ROLES) if (c.roles & RB[r]) p[r] += qty;
    if (!(c.roles & RB.land)) { p.nonland += qty; mvSum += (c.cmc || 0) * qty; if ((c.roles & (RB.ramp | RB.draw)) && c.cmc <= 2) p.cheap += qty; }
    if (c.gc) p.gc += qty;
  }
  p.mv = p.nonland ? +(mvSum / p.nonland).toFixed(2) : 0;
  return p;
}
const STAT_KEYS = [...ROLES, 'mv', 'cheap', 'gc'];
/** Statistiques d'un groupe de profils : { n, <clé>: [p25, médiane, p75] }. */
export function statsOf(profiles) {
  const out = { n: profiles.length };
  for (const k of STAT_KEYS) { const v = profiles.map(p => p[k]).sort((a, b) => a - b); out[k] = [q(v, 0.25), q(v, 0.5), q(v, 0.75)]; }
  return out;
}

/* ── Réseau ─────────────────────────────────────────────────────────────────────────────────────── */
const sleep = ms => new Promise(r => setTimeout(r, ms));
let OUT = '', LOG = [];
const log = (...a) => { const s = a.join(' '); console.log(s); LOG.push(s); if (OUT) { try { appendFileSync(join(OUT, 'log.txt'), s + '\n'); } catch { /* ignore */ } } };
const last = {};
/** GET JSON poli par hôte (espacement gap ms), nouvel essai sur 429/5xx/réseau ; null si 404/403 (page absente ou refusée). */
async function getJson(url, { gap = 350, tries = 4 } = {}) {
  const host = new URL(url).host; let err = '';
  for (let i = 0; i < tries; i++) {
    const wait = (last[host] || 0) + (GAP == null ? gap : GAP) - Date.now(); if (wait > 0) await sleep(wait); last[host] = Date.now();
    let r; try { r = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' }, signal: AbortSignal.timeout(60000) }); } catch (e) { err = 'réseau : ' + (e && e.message); await sleep(GAP == null ? 2500 * (i + 1) : 5); continue; }
    if (r.ok) { try { return await r.json(); } catch { return null; } }
    if (r.status === 404 || r.status === 403 || r.status === 410) { try { await r.body?.cancel(); } catch { /* ignore */ } return null; }
    err = 'HTTP ' + r.status; try { await r.body?.cancel(); } catch { /* ignore */ }
    if (r.status === 429 || r.status >= 500) { await sleep(GAP == null ? Math.max(4000 * (i + 1), (Number(r.headers.get('retry-after')) || 0) * 1000) : 5); continue; }
    break;
  }
  throw new Error(err + ' · ' + url);
}

/* ── Corpus : lecture, écriture ─────────────────────────────────────────────────────────────────── */
/** Corpus vide ou précédent. names : dictionnaire des cartes ; meta[i] : { dc, ot: [étiquettes], uv: { rôle: votes }, ud: decks catégorisés } ; decks : id → deck ; edh : slug → page ; tags : thème → page ; srch : slug → jour de la recherche Archidekt. */
export function corpusNew() { return { v: 1, at: '', names: [], meta: [], decks: {}, edh: {}, tags: {}, srch: {}, global: '' }; }
export function corpusLoad(file) {
  try {
    const j = JSON.parse(gunzipSync(readFileSync(file)).toString('utf8'));
    if (j && j.v === 1 && Array.isArray(j.names)) {
      const C = { ...corpusNew(), ...j }; C.decks = C.decks || {};
      for (let i = 0; i < (j.shards || 0); i++) {      // decks rangés à part (decks-0.json.gz…) : chaque fichier reste loin des 100 Mo de GitHub
        const f = join(dirname(file), 'decks-' + i + '.json.gz');
        try { Object.assign(C.decks, JSON.parse(gunzipSync(readFileSync(f)).toString('utf8'))); } catch (e) { log('  ' + f + ' illisible (' + e.message + ') : ses decks seront relus'); }
      }
      delete C.shards; return C;
    }
  } catch (e) { if (existsSync(file)) log('  corpus précédent illisible (' + e.message + ') : on repart de zéro'); }
  return corpusNew();
}
/** Corpus → fichiers : corpus.json.gz (sans les decks) et decks-<n>.json.gz (60 000 decks chacun). */
export function corpusFiles(C) {
  const ids = Object.keys(C.decks), per = 60000, shards = Math.ceil(ids.length / per), out = [];
  for (let i = 0; i < shards; i++) { const part = {}; for (const id of ids.slice(i * per, (i + 1) * per)) part[id] = C.decks[id]; out.push(['decks-' + i + '.json.gz', gzipSync(Buffer.from(JSON.stringify(part)), { level: 9 })]); }
  out.unshift(['corpus.json.gz', gzipSync(Buffer.from(JSON.stringify({ ...C, decks: {}, shards })), { level: 9 })]);
  return out;
}
/** Deck mis de côté pour le banc d'essai (5 %, d'après son identifiant) : jamais utilisé pour apprendre (cibles, cartes du corpus, paires). */
export const heldOut = d => Number(d.id) % 20 === 7;
function ixer(C) {
  const m = new Map(C.names.map((n, i) => [normKey(n), i]));
  return n => { const k = normKey(n); let i = m.get(k); if (i === undefined) { i = C.names.length; C.names.push(n); C.meta.push({}); m.set(k, i); } else if (!C.names[i].includes('//') && n.includes('//')) C.names[i] = n; return i; };
}

/* ── 1) Commandants ──────────────────────────────────────────────────────────────────────────────── */
/** Commandants de l'appli (pwa/edh.bin.gz, classés par EDHREC) : [{ slug, names, ci, decks, themes: [[slug, libellé, n]] }]. */
export function cmdsFromEdh(file) {
  try {
    const { edhUnpack } = createRequire(import.meta.url)(existsSync(join(here, 'edhbin.cjs')) ? './edhbin.cjs' : './src/edhbin.js');
    const u = edhUnpack(gunzipSync(readFileSync(file)));
    const tl = u.themes || [];
    return u.cmds.filter(c => c && c.slug && Array.isArray(c.names) && c.names.length).map(c => ({ slug: c.slug, decks: c.decks || 0, ci: c.ci || '', names: c.names, themes: (c.th || []).map(([i, n]) => [tl[i] ? tl[i][0] : '', tl[i] ? tl[i][1] : '', n]).filter(t => t[0]) }));
  } catch (e) { log('  ' + file + ' illisible (' + e.message + ')'); return []; }
}

/* ── 2) EDHREC : pages commandant et thèmes ──────────────────────────────────────────────────────── */
/** Page EDHREC (commandant, thème d'un commandant ou thème général) → { n: decks, cards: [[nom, inclusion %, synergie %]], land, curve, br, th: [[slug, libellé, n]], cmds } (compact). */
export function edhPage(j) {
  if (!j || typeof j !== 'object') return null;
  const cards = [], seen = new Set();
  const lists = j.container && j.container.json_dict && j.container.json_dict.cardlists;
  for (const l of Array.isArray(lists) ? lists : []) {
    const tag = String(l.tag || '').toLowerCase(); if (/^(newcards|commanders?|topcommanders|highsynergycommanders)$/.test(tag)) continue;
    for (const cv of l.cardviews || []) {
      if (!cv || typeof cv.name !== 'string' || seen.has(cv.name)) continue;
      const nd = Number(cv.num_decks), pd = Number(cv.potential_decks); if (!(nd > 0)) continue; seen.add(cv.name);
      const incl = pd > 0 ? Math.round(100 * nd / pd) : 0, syn = Number.isFinite(Number(cv.synergy)) ? Math.round(100 * Number(cv.synergy)) : 0;
      cards.push([cv.name, Math.max(0, Math.min(100, incl)), Math.max(-100, Math.min(100, syn))]);
    }
  }
  const cmds = [];
  for (const l of Array.isArray(lists) ? lists : []) if (/commanders?/i.test(String(l.tag || l.header || ''))) for (const cv of l.cardviews || []) if (cv && typeof cv.sanitized === 'string' && Number(cv.num_decks) > 0) cmds.push([cv.sanitized, Math.round(Number(cv.num_decks))]);
  const p = j.panels || {};
  const th = (Array.isArray(p.taglinks) ? p.taglinks : []).map(t => [String(t.slug || ''), String(t.value || '').slice(0, 40), Math.round(Number(t.count) || 0)]).filter(t => /^[a-z0-9-]{1,60}$/.test(t[0]) && t[2] > 0);
  const curve = p.mana_curve && typeof p.mana_curve === 'object' ? Object.fromEntries(Object.entries(p.mana_curve).filter(([k, v]) => /^\d+$/.test(k) && Number(v) >= 0).map(([k, v]) => [k, Number(v)])) : null;
  const land = Number(j.land) || 0, basic = Number(j.basic) || 0;
  const br = j.bracket_counts && typeof j.bracket_counts === 'object' ? Object.fromEntries(Object.entries(j.bracket_counts).filter(([k]) => /^[1-5]$/.test(k)).map(([k, v]) => [k, Number(v) || 0])) : null;
  const n = Number(j.num_decks_avg) || Number(j.num_decks) || (br ? Object.values(br).reduce((a, b) => a + b, 0) : 0);
  return { n, cards, land, basic, curve, br, th, cmds };
}
/** Thèmes d'un commandant à approfondir : les K plus joués (au moins 5 % de ses decks et 30 decks). */
export function topThemes(p, k = THEMES_K) {
  const n = Number(p && p.n) || 0, min = Math.max(30, Math.ceil(n * 0.05));
  return (p && Array.isArray(p.thl) ? p.thl : []).filter(t => t[2] >= min).slice(0, k);
}
async function edhrecRun(C, cmds) {
  const stale = d => !d || Date.now() - Date.parse(d) > EDH_DAYS * DAY;
  let nC = 0, nT = 0, err = 0;
  const stop = () => left() < BUDGET_MS * 0.55;
  for (const c of cmds) {
    if (stop()) { log('  EDHREC : budget atteint (' + nC + ' commandants, ' + nT + ' thèmes relus)'); return { nC, nT }; }
    const prev = C.edh[c.slug];
    if (stale(prev && prev.at)) {
      let j = null; try { j = await getJson(EDH_BASE + 'commanders/' + c.slug + '.json'); } catch (e) { if (++err > 40 && !nC) throw new Error('EDHREC ne répond pas : ' + e.message); continue; }
      const p = edhPage(j);
      C.edh[c.slug] = p && p.cards.length ? { at: new Date().toISOString(), n: p.n, cards: p.cards, land: p.land, basic: p.basic, curve: p.curve, br: p.br, thl: p.th.slice(0, 12), th: (prev && prev.th) || {} } : { at: new Date().toISOString(), cards: [], thl: [], th: {} };
      nC++;
    }
    const e = C.edh[c.slug]; if (!e.cards.length) continue;
    for (const [ts] of topThemes(e)) {
      if (stop()) break;
      const pt = e.th[ts]; if (!stale(pt && pt.at)) continue;
      let j = null; try { j = await getJson(EDH_BASE + 'commanders/' + c.slug + '/' + ts + '.json'); } catch (er) { err++; continue; }
      const p = edhPage(j); e.th[ts] = { at: new Date().toISOString(), n: p ? p.n : 0, cards: p ? p.cards : [], land: p ? p.land : 0 }; nT++;
    }
  }
  log(`  EDHREC : ${nC} pages de commandant et ${nT} pages de thème relues`);
  return { nC, nT };
}
/** Thèmes généraux (tags/<thème>) : cartes et commandants du thème, pour l'assistant sans commandant et le bonus de thème. */
async function edhrecTags(C, slugs) {
  const stale = d => !d || Date.now() - Date.parse(d) > EDH_DAYS * DAY; let n = 0;
  for (const s of slugs) {
    if (left() < BUDGET_MS * 0.5) break;
    if (!stale(C.tags[s] && C.tags[s].at)) continue;
    let j = null; try { j = await getJson(EDH_BASE + 'tags/' + s + '.json'); } catch (e) { continue; }
    const p = edhPage(j); C.tags[s] = { at: new Date().toISOString(), n: p ? p.n : 0, cards: p ? p.cards : [], cmds: p ? p.cmds.slice(0, 60) : [] }; n++;
  }
  log(`  EDHREC : ${n} thèmes généraux relus (${Object.keys(C.tags).length} connus)`);
}

/* ── 3) Archidekt : decks les plus vus ───────────────────────────────────────────────────────────── */
/** Deck Archidekt complet → deck du corpus { id, cmd: [ix], v, u, cr, br, tg, n, c: [[ix, qté, catégorie d'auteur ou -1]] } ; enrichit la méta des cartes (dc, ot, votes). null si ce n'est pas un deck Commander de ~100 cartes. */
export function archDeckIn(C, j, ix, ucIx) {
  if (!j || !Array.isArray(j.cards)) return null;
  const cmd = [], by = new Map(); let n = 0;
  const cats = new Map((Array.isArray(j.categories) ? j.categories : []).map(c => [String(c && c.name || '').toLowerCase(), c && c.includedInDeck !== false]));
  for (const c of j.cards) {
    const o = c && c.card && c.card.oracleCard; const name = o && typeof o.name === 'string' ? o.name : ''; if (!name) continue;
    const ucs = (c.categories || []).map(x => String(x).toLowerCase());
    if (ucs.some(x => /maybe|sideboard|considering|side board|wishlist|cut|out\b/.test(x) || cats.get(x) === false)) continue;
    const qty = Math.max(1, Math.min(99, Math.round(Number(c.quantity) || 1)));
    const i = ix(name), m = C.meta[i];
    if (o.defaultCategory) m.dc = String(o.defaultCategory).slice(0, 30);
    if (Array.isArray(o.oTags) && o.oTags.length) m.ot = o.oTags.map(t => String(t).toLowerCase().slice(0, 60)).slice(0, 60);
    if (o.gameChanger) m.gc = 1; if (o.extraTurns) m.xt = 1; if (o.massLandDenial) m.mld = 1; if (o.tutor) m.tu = 1;
    if (Number.isFinite(Number(o.cmc))) m.cmc = Number(o.cmc);
    if (Array.isArray(o.types)) m.ty = o.types.join(' ').slice(0, 60);
    if (ucs.includes('commander')) { cmd.push(i); continue; }
    const uc = ucs.find(x => userCatRoles(x)) || '';
    if (by.has(i)) by.get(i)[1] += qty; else by.set(i, [i, qty, uc ? ucIx(uc) : -1]); n += qty;
  }
  if (!cmd.length || n < 90 || n > 105) return null;
  return { id: Number(j.id), cmd, v: Number(j.viewCount) || 0, u: archDay(j.updatedAt), cr: archDay(j.createdAt), br: Number(j.edhBracket) || 0, tc: j.theorycrafted ? 1 : 0, tg: (Array.isArray(j.deckTags) ? j.deckTags : []).map(t => String(t && (t.name || t) || '').slice(0, 30)).filter(Boolean).slice(0, 8), n, c: [...by.values()] };
}
async function archidektRun(C, cmds) {
  if (!C.ucats) C.ucats = [];
  const ix = ixer(C), ucMap = new Map(C.ucats.map((s, i) => [s, i])), ucIx = s => { let i = ucMap.get(s); if (i === undefined) { i = C.ucats.length; C.ucats.push(s); ucMap.set(s, i); } return i; };
  let nS = 0, nD = 0, nKeep = 0, err = 0;
  const fetchDeck = async (id, meta) => {
    const prev = C.decks[id]; if (prev && (!meta.u || prev.u >= meta.u)) return false;
    let j = null; try { j = await getJson(ARCH_BASE + 'decks/' + id + '/', { gap: 900, tries: 3 }); } catch (e) { err++; return false; }
    nD++; const d = archDeckIn(C, j, ix, ucIx); if (!d) { C.decks[id] = { id: Number(id), skip: 1, u: meta.u || '' }; return false; }
    C.decks[id] = d; nKeep++; return true;
  };
  const search = async params => { try { return archidektList(await getJson(ARCH_BASE + 'decks/v3/?' + new URLSearchParams({ deckFormat: '3', orderBy: '-viewCount', ...params }), { gap: 900, tries: 3 })); } catch (e) { err++; return []; } };
  // a) les plus vus tous commandants (1 fois par semaine)
  if (!C.global || Date.now() - Date.parse(C.global) > 7 * DAY) {
    const pages = Math.ceil(GLOBAL_N / 60); let got = 0;
    for (let p = 1; p <= pages && left() > BUDGET_MS * 0.1; p++) { const l = await search(p > 1 ? { page: String(p) } : {}); nS++; if (!l.length) break; for (const d of l) { if (left() < BUDGET_MS * 0.08) break; if (d.size && (d.size < 95 || d.size > 105)) continue; if (await fetchDeck(d.id, d)) got++; } }
    C.global = new Date().toISOString(); log(`  Archidekt : ${got} decks ajoutés parmi les plus vus`);
  }
  // b) par commandant : jamais cherchés d'abord, puis les plus anciennes recherches
  const order = cmds.slice(0, CMDS_MAX).map((c, i) => ({ c, i, d: C.srch[c.slug] || '' })).sort((a, b) => (a.d ? 1 : 0) - (b.d ? 1 : 0) || (a.d < b.d ? -1 : a.d > b.d ? 1 : 0) || a.i - b.i);
  let nC = 0;
  for (const { c, d } of order) {
    if (left() < BUDGET_MS * 0.06) { log('  Archidekt : budget atteint'); break; }
    if (d && Date.now() - Date.parse(d) < ARCH_DAYS * DAY) continue;
    const l = (await search({ commanderName: c.names[0] })).filter(x => !x.size || (x.size >= 95 && x.size <= 105)); nS++;
    for (const x of l.slice(0, ARCH_K)) { if (left() < BUDGET_MS * 0.05) break; await fetchDeck(x.id, x); }
    C.srch[c.slug] = new Date().toISOString(); nC++;
    if (err > 60 && !nKeep) throw new Error('Archidekt ne répond pas');
  }
  // c) budget restant : pages suivantes des commandants les plus joués (le corpus grossit chaque nuit, 10 pages de 60 au plus par commandant)
  C.depth = C.depth || {}; let nP = 0;
  for (let round = 0; round < 10 && left() > BUDGET_MS * 0.08; round++) {
    for (const { c } of cmds.slice(0, CMDS_MAX).map((c, i) => ({ c, i })).filter(x => (C.depth[x.c.slug] || 1) <= round + 1)) {
      if (left() < BUDGET_MS * 0.08) break;
      const page = (C.depth[c.slug] || 1) + 1; if (page > 10) continue;
      const l = (await search({ commanderName: c.names[0], page: String(page) })).filter(x => !x.size || (x.size >= 95 && x.size <= 105)); nS++; nP++;
      C.depth[c.slug] = l.length ? page : 99;      // plus de page : ce commandant est épuisé
      for (const x of l) { if (left() < BUDGET_MS * 0.06) break; await fetchDeck(x.id, x); }
    }
  }
  if (nP) log(`  Archidekt : ${nP} pages suivantes lues (commandants les plus joués)`);
  log(`  Archidekt : ${nC} commandants cherchés, ${nS} recherches, ${nD} decks lus, ${nKeep} gardés, ${err} erreurs ; corpus : ${Object.values(C.decks).filter(x => !x.skip).length} decks`);
}

/* ── 4) Scryfall : toutes les cartes, et quelques recherches Tagger ──────────────────────────────── */
/** Adresse d'un fichier en masse de Scryfall : download_uri (JSON, ancien nom) ou jsonl_download_uri (JSON Lines compressé, depuis novembre 2026), sinon tout champ « download… ». */
export function bulkUri(b) {
  if (!b || typeof b !== 'object') return '';
  if (typeof b.download_uri === 'string') return b.download_uri;
  if (typeof b.jsonl_download_uri === 'string') return b.jsonl_download_uri;
  for (const [k, v] of Object.entries(b)) if (/download/i.test(k) && typeof v === 'string' && /^https:/.test(v)) return v;
  return '';
}
/** Contenu d'un fichier en masse (gzip ou non) : tableau JSON ou JSON Lines (une carte par ligne) → tableau de cartes. */
export function bulkParse(buf) {
  const raw = buf.length > 1 && buf[0] === 0x1f && buf[1] === 0x8b ? gunzipSync(buf) : buf, txt = raw.toString('utf8').trim();
  if (txt[0] === '[') return JSON.parse(txt);
  const out = []; for (const l of txt.split('\n')) { const t = l.trim(); if (!t) continue; try { out.push(JSON.parse(t)); } catch (e) { /* ligne illisible : ignorée */ } }
  return out;
}
/** Carte Scryfall (oracle) → { name, ci, cmc, type, text, eur (centimes), gc, legal, prod (couleurs produites), mc } ; null si hors Commander ou sans nom. */
export function scryCard(c) {
  if (!c || typeof c.name !== 'string' || c.layout === 'art_series' || c.layout === 'token' || c.layout === 'double_faced_token' || c.layout === 'emblem') return null;
  const faces = Array.isArray(c.card_faces) ? c.card_faces : [], f0 = faces[0] || {};
  const legal = c.legalities && c.legalities.commander === 'legal';
  const text = (faces.length ? faces.map(f => f.oracle_text || '').join('\n') : c.oracle_text || '').slice(0, 1200);
  const type = String(c.type_line || f0.type_line || '').slice(0, 120);
  const eur = Number(c.prices && (c.prices.eur || c.prices.eur_foil)) || 0, usd = Number(c.prices && (c.prices.usd || c.prices.usd_foil)) || 0;
  let prod = (c.produced_mana || []).join('');
  if (!prod && /\bLand\b/.test(type)) {      // terrain qui en cherche un autre (Evolving Wilds, fetchlands) : source des couleurs qu'il peut trouver
    const m = /search your library for (?:an? |up to \w+ )?([^.]*?)cards?/i.exec(text);
    if (m) prod = /basic land/i.test(m[1]) ? 'WUBRG' : [['Plains', 'W'], ['Island', 'U'], ['Swamp', 'B'], ['Mountain', 'R'], ['Forest', 'G']].filter(([w]) => m[1].includes(w)).map(x => x[1]).join('');
  }
  return { name: c.name, ci: (c.color_identity || []).join(''), cmc: Number(c.cmc) || 0, type, text, eur: Math.round((eur || usd * 0.92) * 100), gc: c.game_changer ? 1 : 0, legal: legal ? 1 : 0, prod, mc: String(c.mana_cost || f0.mana_cost || '').slice(0, 60), rank: Number(c.edhrec_rank) || 0 };
}
async function scryAll() {
  const local = process.env.DECKDB_BULK;
  let arr = null;
  if (local === '0') { log('  Scryfall : fichier oracle-cards ignoré (DECKDB_BULK=0)'); return new Map(); }
  try {
    if (local && existsSync(local)) arr = bulkParse(readFileSync(local));
    else {
      let b = await getJson(SCRY + 'bulk-data/oracle-cards', { gap: 150 }), uri = bulkUri(b);
      if (!uri) {      // repli : la liste de tous les fichiers (une réponse différente a été vue depuis GitHub Actions)
        log('  Scryfall : bulk-data/oracle-cards sans adresse de téléchargement (' + (b ? 'réponse inattendue : ' + JSON.stringify(b).slice(0, 200) : 'refusé ou introuvable') + ')');
        const l = await getJson(SCRY + 'bulk-data', { gap: 150 }).catch(() => null), f = l && Array.isArray(l.data) ? l.data.find(x => x && x.type === 'oracle_cards') : null; uri = bulkUri(f);
        if (uri) log('  Scryfall : adresse trouvée dans la liste des fichiers');
      }
      if (uri) { const r = await fetch(uri, { headers: { 'User-Agent': UA, Accept: 'application/json' }, signal: AbortSignal.timeout(300000) }); if (r.ok) arr = bulkParse(Buffer.from(await r.arrayBuffer())); else log('  Scryfall : fichier oracle-cards HTTP ' + r.status); }
    }
  } catch (e) { log('  Scryfall : fichier oracle-cards illisible (' + e.message + ')'); }
  const out = new Map();
  for (const c of Array.isArray(arr) ? arr : []) { const x = scryCard(c); if (x && (x.legal || /\bLegendary\b/.test(x.type))) out.set(normKey(x.name), x); }
  log(`  Scryfall : ${out.size} cartes (fichier oracle-cards)`);
  return out;
}
/** Prix du relevé quotidien de l'appli (branche data, gen-prices.mjs : impression papier la moins chère, Cardmarket puis TCGplayer) : mêmes prix que l'appli,
 *  y compris pour les cartes dont l'impression par défaut de Scryfall n'a pas de prix en euros (Sol Ring, terrains…). DECKDB_PRICES='' : sans. */
export function pricesParse(txt) {
  const lines = String(txt || '').split('\n'); if (!/^#MOPX1/.test(lines[0] || '')) return null;
  const m = new Map();
  for (let i = 1; i < lines.length; i++) { const a = lines[i].split('\t'); if (a.length < 3) continue; const k = normKey(a[0]), e = Number(a[1]) || 0, u = Number(a[2]) || 0, c = m.get(k); if (!c) m.set(k, { e, u }); else { if (e && (!c.e || e < c.e)) c.e = e; if (u && (!c.u || u < c.u)) c.u = u; } }
  return m;
}
async function pricesDaily() {
  const url = process.env.DECKDB_PRICES === undefined ? 'https://raw.githubusercontent.com/BeerDeus/manaorbit/data/prices.tsv.gz' : process.env.DECKDB_PRICES;
  if (!url) return null;
  try { const r = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(120000) }); if (!r.ok) { log('  prix du jour : HTTP ' + r.status); return null; } const buf = Buffer.from(await r.arrayBuffer()); const m = pricesParse((/\.gz$/.test(url) ? gunzipSync(buf) : buf).toString('utf8')); log(`  prix du jour : ${m ? m.size : 0} cartes (relevé de l'appli)`); return m; }
  catch (e) { log('  prix du jour illisibles (' + e.message + ')'); return null; }
}
/** Fiches Scryfall gardées dans le corpus (texte raccourci) : un passage sans le fichier oracle-cards (panne, réseau) garde des couleurs et des coûts justes. */
const scryPack = x => [x.name, x.ci, x.cmc, x.type, String(x.text || '').slice(0, 400), x.eur, x.gc, x.legal, x.prod, x.mc, x.rank];
const scryUnpack = a => ({ name: a[0], ci: a[1], cmc: a[2], type: a[3], text: a[4], eur: a[5], gc: a[6], legal: a[7], prod: a[8], mc: a[9], rank: a[10] });
/** Complète par /cards/collection (75 par requête) les cartes du corpus absentes (fichier indisponible, ou cartes toutes neuves). */
async function scryFill(S, names) {
  const need = [...new Set(names)].filter(n => !S.has(normKey(n))); let got = 0;
  for (let i = 0; i < need.length && left() > 60000; i += 75) {
    const ids = need.slice(i, i + 75).map(n => ({ name: n.split(' // ')[0] }));
    let j = null; try { const r = await fetch(SCRY + 'cards/collection', { method: 'POST', headers: { 'User-Agent': UA, 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify({ identifiers: ids }), signal: AbortSignal.timeout(60000) }); j = r.ok ? await r.json() : null; } catch { j = null; }
    await sleep(GAP == null ? 120 : 0);
    for (const c of (j && j.data) || []) { const x = scryCard(c); if (x) { S.set(normKey(x.name), x); got++; } }
  }
  if (need.length) log(`  Scryfall : ${got} cartes complétées sur ${need.length} absentes du fichier`);
}
/** Recherches Tagger (otag:) : nom normalisé → bits de rôle. Seulement les étiquettes « sûres » de chaque rôle. */
async function taggerRoles(C) {
  if (C && C.tagger && C.taggerAt && Date.now() - Date.parse(C.taggerAt) < 7 * DAY) { log(`  Tagger : ${Object.keys(C.tagger).length} cartes (passage du ${C.taggerAt.slice(0, 10)})`); return new Map(Object.entries(C.tagger)); }
  const Q = { ramp: ['mana-rock', 'mana-dork', 'land-ramp', 'mana-increaser', 'extra-land'], draw: ['draw-engine', 'burst-draw', 'repeatable-draw'], removal: ['spot-removal'], wipe: ['sweeper'], counter: ['counterspell'], protect: ['protects-creature', 'protects-all', 'protects-permanent'], recursion: ['reanimate', 'regrowth'] };      // étiquettes précises (une racine comme « ramp » ou « removal » contient trop de cas limites)
  const out = new Map(); let pages = 0; const t0 = Date.now(), cap = BUDGET_MS * 0.12;      // 12 % du budget au plus (pages lourdes) : les étiquettes des cartes jouées arrivent aussi par Archidekt
  if (!TAGGER) return out;
  for (const [role, tags] of Object.entries(Q)) for (const t of tags) {
    if (Date.now() - t0 > cap) { log('  Tagger : plafond de temps atteint (relu au prochain passage)'); return out; }
    let url = SCRY + 'cards/search?' + new URLSearchParams({ q: `otag:${t} legal:commander`, unique: 'cards' }); let n = 0;
    while (url && Date.now() - t0 < cap && pages < 600) {
      let j = null; try { j = await getJson(url, { gap: 120 }); } catch { break; }
      pages++; if (!j) break;
      for (const c of j.data || []) { const k = normKey(c.name); out.set(k, (out.get(k) || 0) | RB[role]); n++; }
      url = j.has_more && typeof j.next_page === 'string' && j.next_page.startsWith(SCRY) ? j.next_page : '';
    }
    log(`  Tagger otag:${t} → ${n} cartes`);
  }
  if (C) { C.tagger = Object.fromEntries(out); C.taggerAt = new Date().toISOString(); }      // toutes les étiquettes lues : gardées une semaine dans le corpus
  return out;
}

/* ── 4 bis) Commander Spellbook : combos à 2 cartes (règle des brackets 1 à 3) ─────────────────────────── */
const CSB = process.env.CSB_BASE || 'https://backend.commanderspellbook.com/';
/** Variante Commander Spellbook → [carte A, carte B, résultat, étiquette de bracket] si c'est un combo à 2 cartes infini ou gagnant, sinon null. */
export function csbCombo(v) {
  const uses = (v && Array.isArray(v.uses) ? v.uses : []).map(u => u && u.card && u.card.name).filter(Boolean);
  const prod = (v && Array.isArray(v.produces) ? v.produces : []).map(x => x && x.feature && x.feature.name).filter(Boolean);
  if (uses.length !== 2 || (v.requires && v.requires.length)) return null;
  const win = prod.find(x => /win the game/i.test(x)) || prod.find(x => /^infinite/i.test(x)); if (!win) return null;
  return [uses[0], uses[1], String(win).slice(0, 60), String(v.bracketTag || '').slice(0, 3)];
}
/** Les combos à 2 cartes les plus joués (une fois par semaine) : C.combos. */
async function spellbook(C, max = 4000) {
  if (C.comboAt && Date.now() - Date.parse(C.comboAt) < 7 * DAY && Array.isArray(C.combos) && C.combos.length) return;
  const out = [], seen = new Set(); let url = CSB + 'variants/?' + new URLSearchParams({ q: 'cards=2 legal:commander', limit: '100', ordering: '-popularity' }), n = 0;
  while (url && out.length < max && n < 80 && left() > BUDGET_MS * 0.5) {
    let j = null; try { j = await getJson(url, { gap: 400 }); } catch (e) { log('  Commander Spellbook : ' + e.message); break; }
    n++; if (!j) break;
    for (const v of j.results || []) { const c = csbCombo(v); if (!c) continue; const k = [normKey(c[0]), normKey(c[1])].sort().join('|'); if (seen.has(k)) continue; seen.add(k); out.push(c); }
    url = typeof j.next === 'string' && j.next.startsWith(CSB) ? j.next : '';
  }
  if (out.length) { C.combos = out; C.comboAt = new Date().toISOString(); }
  log(`  Commander Spellbook : ${out.length} combos à 2 cartes (${n} pages)`);
}

/* ── 5) Agrégats ────────────────────────────────────────────────────────────────────────────────── */
const TYPE_BITS = [['Land', 1], ['Creature', 2], ['Artifact', 4], ['Enchantment', 8], ['Instant', 16], ['Sorcery', 32], ['Planeswalker', 64], ['Battle', 128], ['Legendary', 256]];
export const typeBits = t => TYPE_BITS.reduce((a, [w, b]) => a | (new RegExp('\\b' + w + '\\b').test(String(t || '').split(' // ')[0]) ? b : 0), 0);
/** Cartes qui vont ensemble : paires bien plus souvent dans les mêmes decks que le hasard ne le voudrait (lift = P(a et b) / (P(a) × P(b)) ≥ 3, 8 decks au moins).
 *  Ni terrains, ni cartes présentes dans plus de 8 % des decks (Sol Ring, Command Tower… : partout, donc avec rien en particulier), ni les decks du banc d'essai.
 *  Compte des paires dans une table à adressage ouvert (2^24 cases, ~130 Mo) : rapide même avec des centaines de milliers de decks.
 *  Sortie : [[i, [j, lift × 10, j, lift × 10…]]] (indices de la table des cartes), 8 partenaires au plus par carte, les plus fiables d'abord. */
export function pairsOf(C, info, cards) {
  const decks = Object.values(C.decks).filter(d => !d.skip && d.c && !heldOut(d)), N = decks.length;
  if (N < 300 || C.names.length > 65535) return [];
  const cnt = new Uint32Array(C.names.length), land = i => { const x = info.get(normKey(C.names[i])); return !x || (x.roles & RB.land); };
  for (const d of decks) for (const [i] of d.c) cnt[i]++;
  const minS = Math.max(15, Math.round(N * 0.001)), maxS = N * 0.08, ok = new Uint8Array(C.names.length);
  for (let i = 0; i < cnt.length; i++) ok[i] = cnt[i] >= minS && cnt[i] <= maxS && !land(i) ? 1 : 0;
  const SIZE = 1 << 24, MASK = SIZE - 1, keys = new Uint32Array(SIZE), vals = new Uint32Array(SIZE); let used = 0;
  for (const d of decks) {
    const l = [...new Set(d.c.map(x => x[0]).filter(i => ok[i]))].sort((a, b) => a - b);
    for (let x = 0; x < l.length; x++) for (let y = x + 1; y < l.length; y++) {
      const k = (l[x] * 65536 + l[y] + 1) >>> 0; let h = Math.imul(k, 2654435761) >>> 8 & MASK;
      while (keys[h] && keys[h] !== k) h = (h + 1) & MASK;
      if (!keys[h]) { if (used > SIZE * 0.75) continue; keys[h] = k; used++; }
      vals[h]++;
    }
  }
  const best = new Map(), push = (a, b, lift, n) => { const l = best.get(a) || best.set(a, []).get(a); l.push([b, lift, lift * Math.log2(n)]); };
  for (let h = 0; h < SIZE; h++) {
    const n = vals[h]; if (n < 8) continue;
    const k = keys[h] - 1, a = Math.floor(k / 65536), b = k % 65536, lift = n * N / (cnt[a] * cnt[b]);
    if (lift >= 3) { push(a, b, lift, n); push(b, a, lift, n); }
  }
  const row = new Map(cards.map((r, i) => [normKey(r[0]), i])), out = [];
  for (const [a, l] of best) {
    const ia = row.get(normKey(C.names[a])); if (ia === undefined) continue;
    const top = l.sort((x, y) => y[2] - x[2]).slice(0, 8).map(([b, lift]) => [row.get(normKey(C.names[b])), Math.round(Math.min(lift, 99) * 10)]).filter(([ib]) => ib !== undefined);
    if (top.length) out.push([ia, top.flat()]);
  }
  return out;
}
/* ── Classement des cartes par mécaniques (data/card-mech.json : agents IA, chaque lot relu par un arbitre ; taxonomie data/card-mech-taxonomy.md) ──
   Dans la table des cartes : [10] = [rôles (bits, ordre de mech.roles), provides (indices de mech.tags), wants (indices), types de créature soutenus (0 si aucun), force 1-5],
   null pour une carte pas encore classée (extension sortie depuis : l'ancienne méthode garde la main) ; [11] = sous-types de la face avant (« Elf Druid »,
   « Equipment », « Aura »… ; « Changeling » ajouté pour un changelin), lus sur la ligne de type (ce que le classement ne contient pas, volontairement). */
const MECH_FILE = process.env.DECKDB_MECH || join(here, 'data', 'card-mech.json');
/** { meta, tax, by: Map(clé → { roles, provides, wants, tribes, power }) } ; null si le fichier manque. */
export function mechLoad(file = MECH_FILE) {
  if (!existsSync(file)) return null;
  const { meta, cards } = readMech(file), tax = taxonomy(), by = new Map();
  for (const [n, m] of cards) { by.set(normKey(n), m); if (n.includes(' // ')) { const f = normKey(n.split(' // ')[0]); if (!by.has(f)) by.set(f, m); } }
  return { meta, tax, by };
}
/** Rôles du coach (bits RB) d'après le classement : les 10 rôles communs (fixing et stax restent dans [10]). */
export const mechRoleBits = m => m.roles.reduce((a, r) => a | (RB[r] || 0), 0);
/** Ligne compacte [10] d'une carte classée. */
export function mechRow(m, tax) {
  const ri = tax._ri || (tax._ri = new Map(tax.roles.map((r, i) => [r, i]))), ti = tax._ti || (tax._ti = new Map(tax.tags.map((t, i) => [t, i])));
  const rb = m.roles.reduce((a, r) => a | (ri.has(r) ? 1 << ri.get(r) : 0), 0), ix = l => l.map(t => ti.get(t)).filter(i => i !== undefined);
  return [rb, ix(m.provides), ix(m.wants), m.tribes.length ? m.tribes : 0, m.power || 1];
}
/** Sous-types de la face avant (ligne de type), « Changeling » en plus pour un changelin. */
export function subTypes(type, text) {
  const f = String(type || '').split(' // ')[0], i = f.indexOf('—'), sub = i >= 0 ? f.slice(i + 1).trim() : '';
  return (sub + (/\bChangeling\b/.test(String(text || '')) && /\b(Creature|Kindred|Tribal)\b/.test(f) ? ' Changeling' : '')).trim().slice(0, 60);
}

/** Table des cartes et agrégats → objet dkw (voir l'en-tête). mech : classement des cartes (mechLoad), facultatif. */
export function aggregate(C, S, tagger, cmds, mech = null) {
  const at = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
  // votes des auteurs : par carte, decks où elle a une catégorie d'auteur ; rôles votés
  const votes = new Map(), voted = new Map();
  const ucRoles = (C.ucats || []).map(userCatRoles);
  for (const d of Object.values(C.decks)) if (!d.skip) for (const [i, , u] of d.c) {
    if (u < 0) continue; voted.set(i, (voted.get(i) || 0) + 1); const b = ucRoles[u] || 0; if (!b) continue;
    const v = votes.get(i) || {}; for (const r of ROLES) if (b & RB[r]) v[r] = (v[r] || 0) + 1; votes.set(i, v);
  }
  const byKey = new Map(C.names.map((n, i) => [normKey(n), i]));
  // table : toutes les cartes Scryfall légales en Commander (ou légendaires), plus celles du corpus et d'EDHREC
  const keys = new Set([...S.keys()]);
  for (const n of C.names) keys.add(normKey(n));
  const cards = [], info = new Map();
  for (const k of keys) {
    const s = S.get(k), i = byKey.get(k), m = i === undefined ? {} : C.meta[i] || {};
    if (!s) continue;      // sans fiche Scryfall : identité de couleur inconnue, jamais proposée (l'appli lit la fiche de la carte si elle est dans un deck)
    const name = s.name;
    if (s && !s.legal && !/\bLegendary\b/.test(s.type)) continue;
    const mc = mech ? mech.by.get(k) : null;      // classée par mécaniques : ses rôles remplacent les sources d'avant (Archidekt, Tagger, votes, texte)
    let roles = mc ? mechRoleBits(mc) | (/\bLand\b/.test(s.type) ? RB.land : 0) : cardRoles({ dc: m.dc, tags: m.ot, votes: votes.get(i), decks: voted.get(i) || 0, scry: s ? { ...s } : (m.ty ? { name, type: m.ty, text: '' } : null) });
    if (!mc) roles |= tagger.get(k) || 0; if (roles & RB.wipe) roles &= ~RB.removal;
    if (roles & RB.counter && roles & RB.removal && !/\b(destroy|exile) target|return target (creature|permanent|nonland)|sacrifices? an? /i.test(s.text || '')) roles &= ~RB.removal;      // contresort rangé « Removal » par les votes : pas un retrait
    if (s && /\bLand\b/.test(s.type) && !/\/\//.test(s.name)) roles = (roles & RB.ramp && (mc || /\{T\}: Add \{C\}\{C\}|Add \{C\}\{C\}/.test(s.text)) ? RB.ramp : 0) | RB.land;
    const cmc = s ? s.cmc : Number(m.cmc) || 0, gc = (s && s.gc) || m.gc ? 1 : 0;
    const flags = (gc ? 1 : 0) | (m.xt || /take an extra turn/i.test(s ? s.text : '') ? 2 : 0) | (m.mld ? 4 : 0) | (m.tu || roles & RB.tutor ? 8 : 0) | (s.legal ? 0 : 16);      // 16 : interdite en Commander (légendaire gardée pour lire les decks qui l'ont)
    const row = [name, s ? s.ci : '', cmc, typeBits(s ? s.type : m.ty), roles, s ? s.eur : 0, flags, s && (/\bLand\b/.test(s.type) || roles & RB.ramp) ? s.prod : '', s && s.rank ? Math.min(65535, s.rank) : 0, s && !/\bLand\b/.test(String(s.type).split(' // ')[0]) ? String(s.mc || '').replace(/\s+\/\/\s+.*$/, '') : ''];      // [9] coût de mana (face avant) : symboles de couleur sans attendre la fiche
    if (mech) row.push(mc ? mechRow(mc, mech.tax) : null, subTypes(s.type, s.text));      // [10] mécaniques, [11] sous-types
    cards.push(row); info.set(k, { roles, cmc, gc });
  }
  cards.sort((a, b) => (a[0] < b[0] ? -1 : 1));
  // profils des decks du corpus
  const profs = [], byCmd = new Map(), cmdOf = new Map(); for (const c of cmds) for (const n of c.names) cmdOf.set(normKey(n), c);
  for (const d of Object.values(C.decks)) {
    if (d.skip || !d.c || heldOut(d)) continue;      // decks du banc d'essai : jamais appris
    const p = deckProfile(d.c.map(([i, qq]) => [normKey(C.names[i]), qq]), k => info.get(k)); if (p.n < 90) continue;
    const cm = cmdOf.get(normKey(C.names[d.cmd[0]] || '')); p.br = d.br; p.slug = cm ? cm.slug : ''; p.th = cm ? cm.themes.slice(0, 2).map(t => t[0]) : []; p.nc = cm ? cm.ci.length : 0; p.u = d.u;
    profs.push(p); if (p.slug) (byCmd.get(p.slug) || byCmd.set(p.slug, []).get(p.slug)).push(p);
  }
  const tg = { all: statsOf(profs), br: {}, th: {}, nc: {}, recent: statsOf(profs.filter(p => p.u >= new Date(Date.now() - 365 * DAY).toISOString().slice(0, 10))) };
  for (let b = 1; b <= 5; b++) { const l = profs.filter(p => p.br === b); if (l.length >= 15) tg.br[b] = statsOf(l); }
  for (let n = 0; n <= 5; n++) { const l = profs.filter(p => p.nc === n); if (l.length >= 15) tg.nc[n] = statsOf(l); }
  const thSet = new Set(profs.flatMap(p => p.th)); for (const t of thSet) { const l = profs.filter(p => p.th.includes(t)); if (l.length >= 15) tg.th[t] = statsOf(l); }
  // par commandant : cartes EDHREC (inclusion, synergie), thèmes approfondis, statistiques du corpus et cartes du corpus absentes d'EDHREC
  const cmd = {}, decksBy = new Map();      // decks appris, rangés par leur premier commandant (une seule passe sur le corpus)
  for (const d of Object.values(C.decks)) if (!d.skip && d.c && !heldOut(d)) { const k = normKey(C.names[d.cmd[0]] || ''); (decksBy.get(k) || decksBy.set(k, []).get(k)).push(d); }
  for (const c of cmds) {
    const e = C.edh[c.slug], ps = byCmd.get(c.slug) || [];
    if ((!e || !e.cards || !e.cards.length) && ps.length < 3) continue;
    const corpus = new Map(); let nd = 0;
    for (const d of decksBy.get(normKey(c.names[0])) || []) { nd++; for (const [i] of d.c) corpus.set(i, (corpus.get(i) || 0) + 1); }
    const edhNames = new Set((e && e.cards || []).map(x => normKey(x[0])));
    const extra = nd >= 3 ? [...corpus].filter(([i, n]) => n / nd >= 0.25 && !edhNames.has(normKey(C.names[i]))).sort((a, b) => b[1] - a[1]).slice(0, 60).map(([i, n]) => [C.names[i], Math.round(100 * n / nd)]) : [];
    const th = {}; if (e && e.th) for (const [ts, p] of Object.entries(e.th)) if (p && p.cards && p.cards.length) th[ts] = { n: p.n, land: p.land, cards: p.cards.slice(0, 220) };
    cmd[c.slug] = { n: e ? e.n || 0 : 0, land: e ? e.land || 0 : 0, basic: e ? e.basic || 0 : 0, curve: e ? e.curve || null : null, br: e ? e.br || null : null, thl: e ? (e.thl || []).slice(0, 10) : [], cards: e ? (e.cards || []).slice(0, 320) : [], th, nd, xc: extra, tg: ps.length >= 8 ? statsOf(ps) : null };
  }
  const pairs = pairsOf(C, info, cards);
  const themes = {}; for (const [s, p] of Object.entries(C.tags)) if (p && p.cards && p.cards.length) themes[s] = { n: p.n, cards: p.cards.slice(0, 250), cmds: (p.cmds || []).slice(0, 40) };
  const mechMeta = mech ? { v: mech.meta.v, at: mech.meta.at, tax: mech.tax.version, roles: mech.tax.roles, tags: mech.tax.tags, n: cards.filter(r => r[10]).length } : undefined;
  return { v: 1, at, roles: ROLES, cards, tg, cmd, themes, pairs, combos: Array.isArray(C.combos) ? C.combos : [], mech: mechMeta, src: { decks: profs.length, edh: Object.keys(C.edh).length, tags: Object.keys(C.tags).length, scry: S.size, mech: mechMeta ? mechMeta.n : 0 } };
}

/* ── Principal ──────────────────────────────────────────────────────────────────────────────────── */
async function main() {
  OUT = process.argv.slice(2).find(a => !a.startsWith('--')) || join(here, 'deckdb-out'); mkdirSync(OUT, { recursive: true }); writeFileSync(join(OUT, 'log.txt'), '');
  const prevFile = process.env.DECKDB_PREV || join(OUT, 'corpus.json.gz');
  const C = corpusLoad(prevFile);
  log(`Base du coach : budget ${BUDGET_MS / 60000} min ; corpus précédent : ${Object.values(C.decks).filter(d => !d.skip).length} decks, ${Object.keys(C.edh).length} pages EDHREC`);
  const cmds = cmdsFromEdh(process.env.EDH_FILE || join(here, 'pwa', 'edh.bin.gz')).slice(0, CMDS_MAX);
  if (!cmds.length) throw new Error('Aucun commandant (pwa/edh.bin.gz absent ou illisible)');
  log(`${cmds.length} commandants (pwa/edh.bin.gz)`);
  const OFF = process.env.DECKDB_OFFLINE === '1';      // hors ligne : agrégats recalculés depuis le corpus seul (fiches Scryfall, étiquettes Tagger et combos qu'il garde), sans aucune lecture réseau
  if (OFF) log('  hors ligne (DECKDB_OFFLINE) : aucune lecture réseau, agrégats depuis le corpus');
  const S = OFF ? new Map() : await scryAll();
  if (C.scry && typeof C.scry === 'object') { let n = 0; for (const [k, a] of Object.entries(C.scry)) if (!S.has(k) && Array.isArray(a)) { S.set(k, scryUnpack(a)); n++; } if (n) log(`  Scryfall : ${n} fiches reprises du corpus`); }
  const tagger = OFF ? new Map(Object.entries(C.tagger || {})) : await taggerRoles(C);
  if (!OFF) {
    await edhrecRun(C, cmds);
    const themeSlugs = new Set(); for (const c of cmds) for (const t of c.themes) themeSlugs.add(t[0]);
    for (const t of GENERAL_THEMES) themeSlugs.add(edhSlug(t.replace(/\+1\/\+1/g, 'plus-1-plus-1').replace(/-1\/-1/g, 'minus-1-minus-1')));
    await edhrecTags(C, [...themeSlugs]);
    await spellbook(C);
    if (process.env.DECKDB_ARCH_OFF !== '1') await archidektRun(C, cmds); else log('  Archidekt : sauté (DECKDB_ARCH_OFF)');
    await scryFill(S, [...C.names, ...Object.values(C.edh).flatMap(e => (e.cards || []).map(x => x[0]))]);
    C.at = new Date().toISOString();
  }
  const px = OFF ? null : await pricesDaily();
  if (px) { let n = 0; for (const [k, x] of S) { const p = px.get(k); const e = p ? p.e || Math.round((p.u || 0) * 0.92) : 0; if (e > 0 && e !== x.eur) { x.eur = e; n++; } } log(`  prix du jour : ${n} prix mis à jour`); }
  C.scry = {}; for (const [k, x] of S) C.scry[k] = scryPack(x);
  const mech = mechLoad();
  log(mech ? `  mécaniques : ${mech.by.size} cartes classées (data/card-mech.json du ${mech.meta.at}, taxonomie v${mech.tax.version})` : '  mécaniques : data/card-mech.json absent (rôles d\'avant seulement)');
  const D = aggregate(C, S, tagger, cmds, mech);
  if (mech) log(`  mécaniques : ${D.mech.n} cartes de la table classées, ${D.cards.length - D.mech.n} sans classement (ancienne méthode)`);
  try {      // banc d'essai : le coach de l'appli face aux decks mis de côté, et réglage de ses poids (bench-coach.mjs)
    const { benchCoach, heldFromCorpus } = await import('./bench-coach.mjs'), t = Date.now(), r = benchCoach(D, heldFromCorpus(C, heldOut));
    if (r) { const b = r.bench; D.bench = b; if (r.w) D.w = r.w; log(`  Banc d'essai : ${b.n} decks jamais appris, ${b.hide} sorts retirés chacun · retrouvés dans les 10 / 20 / 40 premières suggestions : ${b.base.r10} / ${b.base.r20} / ${b.base.r40} %` + (b.kept ? ` → réglage ${b.tuned.r10} / ${b.tuned.r20} / ${b.tuned.r40} % (poids ${JSON.stringify(r.w)})` : ' (poids d\'origine gardés)') + ` · ${Math.round((Date.now() - t) / 1000)} s`); }
    else log('  Banc d\'essai : pas encore assez de decks mis de côté');
  } catch (e) { log('  Banc d\'essai indisponible (' + e.message + ')'); }
  log(`  paires de cartes : ${(D.pairs || []).length} cartes avec des partenaires`);
  const files = corpusFiles(C), dkwBuf = gzipSync(Buffer.from(JSON.stringify(D)), { level: 9 }), corpusBuf = { length: files.reduce((a, [, b]) => a + b.length, 0) };
  const nDecks = D.src.decks;
  if (D.cards.length < 5000 && !process.env.DECKDB_SMALL) throw new Error(`Table des cartes trop maigre (${D.cards.length}) : rien de publié`);
  for (const [f, b] of [...(OFF ? [] : files), ['dkw.json.gz', dkwBuf]]) { const p = join(OUT, f); writeFileSync(p + '.tmp', b); renameSync(p + '.tmp', p); }
  const rolesN = ROLES.map((r, i) => `${r} ${D.cards.filter(c => c[4] & (1 << i)).length}`).join(', ');
  log(`Terminé en ${Math.round((Date.now() - T0) / 60000)} min : ${D.cards.length} cartes (${rolesN}), ${nDecks} decks analysés, ${Object.keys(D.cmd).length} commandants, ${Object.keys(D.themes).length} thèmes`);
  log(`  cibles (tous decks, médianes) : ${STAT_KEYS.map(k => `${k} ${D.tg.all[k] ? D.tg.all[k][1] : '-'}`).join(' · ')}`);
  log(`  corpus (${files.length} fichier${files.length > 1 ? 's' : ''}) ${(corpusBuf.length / 1048576).toFixed(2)} Mo · dkw.json.gz ${(dkwBuf.length / 1048576).toFixed(2)} Mo`);
}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main().catch(e => { log('ERREUR : ' + (e && e.stack || e)); process.exit(1); });
