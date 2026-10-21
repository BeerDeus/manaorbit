// Visuels de la fiche Google Play → docs/store/ : bannière 1024×500 et 8 captures 1080×1920 de la vraie appli, dans les 6 langues de l'appli (piste A « Orbite continue »,
// choisie le 20 octobre 2026 : une orbite foil traverse les 8 captures d'un bout à l'autre, téléphones inclinés tour à tour).
// L'appli est servie par le monde des tests (proxy.mjs + faux CardTrader, tests/e2e-world.mjs), Scryfall est simulé ici : aucune requête ne sort.
// Données réalistes posées dans localStorage avant le chargement (collection, decks, historique de valeur), decks EDHREC = vrai pwa/edh.bin.gz.
// Images des cartes : cartes factices dessinées ici (dégradés, aucune illustration réelle). Polices : tools/fonts/ si présentes (OFL), sinon repli système.
//   node tools/store-assets.mjs              tout : captures et bannière, 6 langues (≈ 2 min par langue)
//   node tools/store-assets.mjs feature      bannières seulement      node tools/store-assets.mjs shots de   captures (et bannière) allemandes seulement
//   node tools/store-assets.mjs raw fr      captures brutes seulement (SHOTS + MORE) dans shots/store/ (maquettes)
//   node tools/store-assets.mjs video fr    écrans des vidéos courtes (étapes du scan, QR, guide ManaBox, Carte mystère…) dans shots/video/
//   RAW=1 : garde aussi les captures brutes de l'appli (sans bandeau) dans shots/store/ (non versionné) · CHROMIUM : chemin du navigateur
import '../tests/setup-env.mjs';
import { readFileSync, writeFileSync, mkdirSync, existsSync, statSync, unlinkSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { createRequire } from 'node:module';
import { chromium, startWorld, newPage, signInFake } from '../tests/e2e-world.mjs';
import { startFakes } from '../tests/amis-fakes.mjs';

const require = createRequire(import.meta.url);
const { edhUnpack } = require('../edhbin.cjs');
const OUT = 'docs/store/', PORT = 18980;
const what = process.argv[2] || 'all', onlyLang = process.argv[3] || '';
const LANGS = ['fr', 'en', 'de', 'es', 'it', 'pt'].filter(l => !onlyLang || l === onlyLang);
const LOCALE = { fr: 'fr-FR', en: 'en-GB', de: 'de-DE', es: 'es-ES', it: 'it-IT', pt: 'pt-BR' };
const DAY = 86400e3, NOW = Date.now();
mkdirSync(OUT, { recursive: true });

/* ── Cartes : coût de mana et type (de mémoire, cartes connues) ; prix = tendance Cardmarket du fichier EDHREC, sinon la valeur notée ici ──────── */
const DB_TXT = `
Edgar Markov|{3}{R}{W}{B}|Legendary Creature — Vampire Knight|9.50
Sol Ring|{1}|Artifact
Arcane Signet|{2}|Artifact
Blade of the Bloodchief|{1}|Artifact — Equipment
Herald's Horn|{3}|Artifact
Orzhov Signet|{2}|Artifact
Rakdos Signet|{2}|Artifact
Skullclamp|{1}|Artifact — Equipment
Talisman of Hierarchy|{2}|Artifact
Vanquisher's Banner|{5}|Artifact
Blood Crypt||Land — Swamp Mountain|11.20
Bloodstained Mire||Land
Bojuka Bog||Land
Cavern of Souls||Land
Caves of Koilos||Land
Command Tower||Land
Dragonskull Summit||Land
Exotic Orchard||Land|0.35
Godless Shrine||Land — Plains Swamp|9.80
Isolated Chapel||Land
Luxury Suite||Land
Marsh Flats||Land
Nomad Outpost||Land
Path of Ancestry||Land|0.30
Sacred Foundry||Land — Mountain Plains|10.40
Savai Triome||Land — Mountain Plains Swamp
Secluded Courtyard||Land
Unclaimed Territory||Land
Vault of Champions||Land
Vault of the Archangel||Land
Voldaren Estate||Land
Blood Artist|{1}{B}|Creature — Vampire
Bloodletter of Aclazotz|{1}{B}{B}{B}|Creature — Vampire Demon
Bloodline Keeper // Lord of Lineage|{2}{B}{B}|Creature — Vampire
Bloodthirsty Conqueror|{3}{B}{B}|Creature — Vampire Knight
Captivating Vampire|{1}{B}{B}|Creature — Vampire
Champion of Dusk|{3}{B}{B}|Creature — Vampire Knight
Charismatic Conqueror|{1}{W}|Creature — Vampire Soldier
Clavileño, First of the Blessed|{1}{W}{B}|Legendary Creature — Vampire Cleric
Cordial Vampire|{B}{B}|Creature — Vampire
Cruel Celebrant|{W}{B}|Creature — Vampire
Drana, Liberator of Malakir|{1}{B}{B}|Legendary Creature — Vampire Ally
Edgar, Charmed Groom // Edgar Markov's Coffin|{2}{W}{B}|Legendary Creature — Vampire Noble
Elenda, the Dusk Rose|{2}{W}{B}|Legendary Creature — Vampire Knight
Forerunner of the Legion|{2}{W}|Creature — Vampire Knight
Indulgent Aristocrat|{B}|Creature — Vampire
Knight of the Ebon Legion|{B}|Creature — Vampire Knight
Legion Lieutenant|{W}{B}|Creature — Vampire Knight
Malakir Bloodwitch|{3}{B}{B}|Creature — Vampire Shaman
Markov Baron|{2}{B}|Creature — Vampire Noble
Master of Dark Rites|{2}{B}|Creature — Vampire Cleric
Mavren Fein, Dusk Apostle|{2}{W}|Legendary Creature — Vampire Cleric
Patron of the Vein|{4}{B}{B}|Creature — Vampire Shaman
Sanctum Seeker|{2}{B}{B}|Creature — Vampire Knight
Stromkirk Captain|{1}{B}{R}|Creature — Vampire Soldier
Twilight Prophet|{2}{B}{B}|Creature — Vampire Cleric
Vampire Nighthawk|{1}{B}{B}|Creature — Vampire Shaman
Vampire Socialite|{B}{R}|Creature — Vampire Noble
Vampire of the Dire Moon|{B}|Creature — Vampire
Vengeful Bloodwitch|{1}{B}|Creature — Vampire Warlock
Viscera Seer|{B}|Creature — Vampire Wizard
Vito, Thorn of the Dusk Rose|{2}{B}|Legendary Creature — Vampire Cleric
Welcoming Vampire|{2}{W}|Creature — Vampire
Yahenni, Undying Partisan|{2}{B}|Legendary Creature — Vampire
Anointed Procession|{3}{W}|Enchantment
Black Market Connections|{2}{B}|Enchantment
Exquisite Blood|{4}{B}|Enchantment
Phyrexian Arena|{1}{B}{B}|Enchantment
Sanguine Bond|{3}{B}{B}|Enchantment
Shared Animosity|{2}{R}|Enchantment
Anguished Unmaking|{1}{W}{B}|Instant
Boros Charm|{R}{W}|Instant
Dark Ritual|{B}|Instant
Path to Exile|{W}|Instant
Swords to Plowshares|{W}|Instant
Teferi's Protection|{2}{W}|Instant
Vampiric Tutor|{B}|Instant
Village Rites|{B}|Instant
Sorin, Imperious Bloodlord|{2}{B}|Legendary Planeswalker — Sorin
Damn|{B}{B}|Sorcery
Demonic Tutor|{1}{B}|Sorcery
New Blood|{2}{B}{B}|Sorcery
Olivia's Wrath|{4}{B}|Sorcery
Pact of the Serpent|{1}{B}{B}|Sorcery
Ruinous Ultimatum|{R}{R}{W}{W}{W}{B}{B}|Sorcery
Ancient Tomb||Land|61.50
Chrome Mox|{0}|Artifact|47.90
Mana Drain|{U}{U}|Instant
Force of Will|{3}{U}{U}|Instant|68.00
Rhystic Study|{2}{U}|Enchantment
Smothering Tithe|{3}{W}|Enchantment
Cyclonic Rift|{1}{U}|Instant
Fierce Guardianship|{2}{U}|Instant|27.40
Doubling Season|{4}{G}|Enchantment
Sylvan Library|{1}{G}|Enchantment|24.80
Enlightened Tutor|{W}|Instant
Esper Sentinel|{W}|Artifact Creature — Human Soldier
Deflecting Swat|{2}{R}|Instant|19.60
Polluted Delta||Land
Misty Rainforest||Land
Verdant Catacombs||Land
Flooded Strand||Land
Birds of Paradise|{G}|Creature — Bird
Craterhoof Behemoth|{5}{G}{G}{G}|Creature — Beast|18.40
Wrath of God|{2}{W}{W}|Sorcery|4.20
Lightning Bolt|{R}|Instant
Counterspell|{U}{U}|Instant
Cultivate|{2}{G}|Sorcery
Kodama's Reach|{2}{G}|Sorcery
Farseek|{1}{G}|Sorcery
Nature's Lore|{1}{G}|Sorcery
Llanowar Elves|{G}|Creature — Elf Druid|0.25
Lightning Greaves|{2}|Artifact — Equipment
Swiftfoot Boots|{2}|Artifact — Equipment|1.10
Heroic Intervention|{1}{G}|Instant
Beast Within|{2}{G}|Instant|0.90
Chaos Warp|{2}{R}|Instant|1.40
Blasphemous Act|{8}{R}|Sorcery
Mystic Remora|{U}|Enchantment
Reliquary Tower||Land
Atraxa, Praetors' Voice|{G}{W}{U}{B}|Legendary Creature — Phyrexian Angel Horror|5.20
The Ur-Dragon|{4}{W}{U}{B}{R}{G}|Legendary Creature — Dragon Avatar|12.80
Krenko, Mob Boss|{2}{R}{R}|Legendary Creature — Goblin Warrior|3.40
Giada, Font of Hope|{1}{W}|Legendary Creature — Angel|3.10
Coat of Arms|{5}|Artifact
Goblin King|{1}{R}{R}|Creature — Goblin
Goblin Chieftain|{1}{R}{R}|Creature — Goblin
Goblin Recruiter|{1}{R}|Creature — Goblin
Kiki-Jiki, Mirror Breaker|{2}{R}{R}{R}|Legendary Creature — Goblin Shaman
Purphoros, God of the Forge|{3}{R}|Legendary Enchantment Creature — God
Muxus, Goblin Grandee|{4}{R}{R}|Legendary Creature — Goblin Noble
Blood Moon|{2}{R}|Enchantment
Goblin Bombardment|{1}{R}|Enchantment
Impact Tremors|{1}{R}|Enchantment
Siege-Gang Commander|{3}{R}{R}|Creature — Goblin
Skirk Prospector|{R}|Creature — Goblin
Goblin Matron|{2}{R}|Creature — Goblin
Vorinclex, Monstrous Raider|{4}{G}{G}|Legendary Creature — Phyrexian Praetor
Oko, Thief of Crowns|{1}{G}{U}|Legendary Planeswalker — Oko
Teferi, Master of Time|{2}{U}|Legendary Planeswalker — Teferi
Bloom Tender|{1}{G}|Creature — Elf Druid
Evolution Sage|{2}{G}|Creature — Elf Druid
Innkeeper's Talent|{1}{G}|Enchantment — Class
Scalding Tarn||Land
Wooded Foothills||Land
Arid Mesa||Land
Prismatic Vista||Land
Urza's Saga||Enchantment Land — Urza's Saga
Jeska's Will|{2}{R}|Sorcery
Boseiju, Who Endures||Legendary Land
Otawara, Soaring City||Legendary Land
Urborg, Tomb of Yawgmoth||Legendary Land
Nykthos, Shrine to Nyx||Legendary Land
Mana Confluence||Land
Sensei's Divining Top|{1}|Artifact
Gemstone Caverns||Legendary Land
Cabal Coffers||Land
Phyrexian Tower||Legendary Land
Mox Amber|{0}|Legendary Artifact
The Great Henge|{7}{G}{G}|Legendary Artifact
Shadowspear|{1}|Legendary Artifact — Equipment
Ragavan, Nimble Pilferer|{R}|Legendary Creature — Monkey Pirate
Worldly Tutor|{G}|Instant
Force of Negation|{1}{U}{U}|Instant
Commander's Plate|{1}|Artifact — Equipment
Finale of Devastation|{X}{G}{G}|Sorcery
Phyrexian Altar|{3}|Artifact
Exploration|{G}|Enchantment
Necropotence|{B}{B}{B}|Enchantment
Green Sun's Zenith|{G}|Sorcery
Mondrak, Glory Dominus|{2}{W}{W}|Legendary Creature — Phyrexian Horror
Deadly Rollick|{3}{B}|Instant
The Ozolith|{1}|Legendary Artifact
`;
const slug = n => String(n).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const front = n => String(n).split('//')[0].trim().toLowerCase();
const DB = new Map();
for (const l of DB_TXT.trim().split('\n')) { const [name, cost, type, eur] = l.split('|'); DB.set(front(name), { name, cost, type, eur: eur ? Math.round(Number(eur) * 100) : 0 }); }

/* ── Decks EDHREC réels (pwa/edh.bin.gz) : listes, prix Cardmarket en centimes, images des commandants ─────────────────────────────── */
const BIN = readFileSync('pwa/edh.bin.gz'), EDH = edhUnpack(new Uint8Array(gunzipSync(BIN)));
const PRICE = new Map(); EDH.names.forEach((n, i) => { if (EDH.pr[i]) PRICE.set(front(n), EDH.pr[i]); });
const FULL = new Map(); EDH.names.forEach(n => { if (!FULL.has(front(n)) || n.includes('//')) FULL.set(front(n), n); });
const IMG_OF = new Map(); EDH.cmds.forEach(c => { if (c.img) IMG_OF.set(c.img.replace(/^front\//, ''), c.names[0]); });
/** Deck EDHREC d'un commandant : [[nom, quantité]] (commandant compris, en tête). kind : 'avg' (deck moyen) ou 'budget' / 'premium'. */
function edhDeck(cmd, kind = 'avg') {
  const ci = EDH.cmds.findIndex(c => c.names.length === 1 && c.names[0] === cmd); if (ci < 0) throw new Error('commandant absent du fichier EDHREC : ' + cmd);
  const j = EDH.dk.findIndex(d => d[0] === ci && (d[4] || 'avg') === kind); if (j < 0) throw new Error('deck ' + kind + ' absent : ' + cmd);
  const out = [[cmd, 1]]; for (let e = EDH.off[j]; e < EDH.off[j + 1]; e++) out.push([EDH.names[EDH.ids[e]], EDH.qty[e]]);
  return out;
}
/* ── Noms français imprimés (pwa/fr-names.tsv, même fichier que le site) ─────────────────────────────────────────────────────────── */
const FR = new Map(), FR_IMG = new Map();
for (const l of readFileSync('pwa/fr-names.tsv', 'utf8').split('\n')) { const [p, en, im] = l.split('\t'); if (!p || !en || l[0] === '#') continue; if (!FR.has(front(en))) FR.set(front(en), p); if (im) FR_IMG.set(im, en); }
const BASICS = { plains: 'W', island: 'U', swamp: 'B', mountain: 'R', forest: 'G' };

/** Fiche d'une carte : nom complet, coût, type, prix (centimes), couleurs. null si la carte est inconnue. */
function card(name) {
  const k = front(name), d = DB.get(k), basic = BASICS[k];
  if (!d && !PRICE.has(k) && !basic && !FULL.has(k)) return null;
  const full = (d && d.name) || FULL.get(k) || name, cost = d ? d.cost : '', type = d ? d.type : basic ? 'Basic Land — ' + name : '';
  const colors = [...new Set((cost.match(/[WUBRG]/g) || []))];
  const cmc = (cost.match(/\{[^}]+\}/g) || []).reduce((a, s) => a + (/^\{\d+\}$/.test(s) ? Number(s.slice(1, -1)) : /X/.test(s) ? 0 : 1), 0);
  return { name: full, cost, type, cmc, colors, ci: basic ? [basic] : colors, eur: basic ? 0 : PRICE.get(k) || (d && d.eur) || 20 + hash(k) % 180, fr: FR.get(k) || '' };      // prix inconnu du fichier : quelques dizaines de centimes
}
const hash = s => { let h = 2166136261; for (const c of String(s)) { h ^= c.codePointAt(0); h = Math.imul(h, 16777619) >>> 0; } return h; };
/** Aléa déterministe (même rendu à chaque lancement). */
const rnd = seed => { let x = hash(seed) || 1; return () => { x ^= x << 13; x >>>= 0; x ^= x >> 17; x ^= x << 5; x >>>= 0; return x / 4294967296; }; };

/* ── Collection : 88 % du deck moyen d'Edgar Markov (le « deck à monter »), une partie des decks enregistrés, des incontournables, des terrains de base ─── */
const EDGAR = edhDeck('Edgar Markov'), KRENKO = edhDeck('Krenko, Mob Boss'), ATRAXA = edhDeck("Atraxa, Praetors' Voice"), URD = edhDeck('The Ur-Dragon'), GIADA = edhDeck('Giada, Font of Hope');
const TO_BUY = new Set(['Bloodthirsty Conqueror', 'Anointed Procession', 'Exquisite Blood', 'Luxury Suite', 'Vault of Champions', 'Black Market Connections', 'Bloodletter of Aclazotz', 'Charismatic Conqueror', 'Savai Triome', 'Marsh Flats'].map(front));
const OWN = new Map();      // clé → { name, q }
const own = (n, q = 1) => { const c = card(n); if (!c || BASICS[front(n)] || TO_BUY.has(front(n))) return; const k = front(n), o = OWN.get(k); if (o) o.q = Math.max(o.q, q); else OWN.set(k, { name: c.name, q }); };
/** Vrac : cartes bon marché des decks de commandants Magic « maison » (aucune licence externe), une de chaque. */
const BULK_CMDS = ['Kaalia of the Vast', 'Jodah, the Unifier', 'Nekusar, the Mindrazer', "Yuriko, the Tiger's Shadow", 'Kenrith, the Returned King', 'Isshin, Two Heavens as One', 'Miirym, Sentinel Wyrm', 'Chatterfang, Squirrel General', 'Muldrotha, the Gravetide', 'Animar, Soul of Elements', 'Arcades, the Strategist', 'Oloro, Ageless Ascetic', 'Breya, Etherium Shaper', 'Meren of Clan Nel Toth', 'Teysa Karlov', 'Gishath, Sun\'s Avatar', 'Wilhelt, the Rotcleaver', 'Lathril, Blade of the Elves'];
const NOT_MAGIC = /\b(Ring|Halfling|Bowmasters|Mithril|Lotho|Gandalf|Frodo|Samwise|Bilbo|Gollum|Sméagol|Sauron|Aragorn|Shire|Mordor|Rohan|Gondor|Eorl|Nazgûl|Doctor|TARDIS|Dalek|Vault-Tec|Nuka|Brotherhood|Chocobo|Moogle|Materia|Spider|Marvel|Assassin|Animus|Templar)\b/i;
{
  const r = rnd('collection'), cheap = n => { const c = card(n); return c && (DB.has(front(n)) || (c.eur > 0 && c.eur < 400)); };
  for (const [n] of EDGAR) if (!TO_BUY.has(front(n))) own(n);
  for (const [deck, part] of [[KRENKO, 0.55], [ATRAXA, 0.42], [URD, 0.36], [GIADA, 0.5]]) for (const [n] of deck) if (r() < part && cheap(n)) own(n);
  for (const [k, d] of DB) if (!OWN.has(k) && r() < 0.8) own(d.name);
  for (const cmd of BULK_CMDS) for (const [n] of edhDeck(cmd)) { const c = card(n); if (c && !DB.has(front(n)) && c.eur > 0 && c.eur < 150 && !NOT_MAGIC.test(n) && r() < 0.6) own(n); }
  for (const [k, o] of OWN) { const c = card(o.name); if (c.eur && c.eur < 250 && !/Land/.test(c.type) && r() < 0.45) o.q = 2 + Math.floor(r() * 3); }      // doublons de cartes bon marché : la liste d'échange
  for (const n of ['Sol Ring', 'Arcane Signet', 'Swords to Plowshares', 'Lightning Bolt', 'Counterspell', 'Cultivate']) { own(n); OWN.get(front(n)).q = 3 + (hash(n) % 2); }
}
const LANDS = [['Plains', 36], ['Island', 24], ['Swamp', 41], ['Mountain', 33], ['Forest', 27]];
const priced = [...OWN.values()].map(o => ({ ...o, c: card(o.name) })).filter(o => o.c.eur > 0);
const VALUE = priced.reduce((a, o) => a + o.c.eur * o.q, 0), COPIES = [...OWN.values()].reduce((a, o) => a + o.q, 0) + LANDS.reduce((a, l) => a + l[1], 0);
/** Quelques exemplaires dans d'autres langues parmi les cartes les plus chères (en tête de la liste triée par prix) : capture « Chaque carte, sa langue ». */
const LANG_FIX = { fr: { 'chrome mox': 'JA', 'mox amber': 'EN', 'the great henge': 'DE' }, en: { 'chrome mox': 'JA', 'deflecting swat': 'FR', 'the great henge': 'DE' },
  de: { 'chrome mox': 'JA', 'deflecting swat': 'FR', 'the great henge': 'DE' }, es: { 'chrome mox': 'JA', 'deflecting swat': 'FR', 'the great henge': 'ES' },
  it: { 'chrome mox': 'JA', 'deflecting swat': 'FR', 'the great henge': 'IT' }, pt: { 'chrome mox': 'JA', 'deflecting swat': 'FR', 'the great henge': 'PT' } };
/** Texte de la collection : FR → une bonne part des cartes en français (nom imprimé connu), EN → exemplaires anglais ; LANG_FIX par-dessus (même tirage pour les autres). */
function collText(lang) {
  const r = rnd('langs'), lines = [], fix = LANG_FIX[lang] || {};
  for (const o of OWN.values()) { const c = card(o.name), auto = lang === 'fr' && c.fr && r() < 0.62 && c.fr.length <= 20 && !c.fr.includes(',') ? 'FR' : 'EN'; lines.push(`${o.q} ${o.name} *${fix[front(o.name)] || auto}*`); }
  for (const [n, q] of LANDS) lines.push(`${q} ${n}`);
  return lines.join('\n');
}
const deckText = cards => '// Deck Deal : commander\nCommander\n1 ' + cards[0][0] + '\n\nDeck\n' + cards.slice(1).map(([n, q]) => q + ' ' + n).join('\n');
const DECK_NAMES = { fr: ['Krenko gobelins', 'Atraxa poison', 'Ur-Dragon', 'Giada anges'], en: ['Krenko Goblins', 'Atraxa Poison', 'The Ur-Dragon', 'Giada Angels'],
  de: ['Krenko Goblins', 'Atraxa Gift', 'Ur-Drache', 'Giada Engel'], es: ['Krenko goblins', 'Atraxa veneno', 'Ur-Dragón', 'Giada ángeles'],
  it: ['Krenko goblin', 'Atraxa veleno', 'Ur-Drago', 'Giada angeli'], pt: ['Krenko goblins', 'Atraxa veneno', 'Ur-Dragão', 'Giada anjos'] };
const DECKS = lang => [
  { id: 'd-krenko', cards: KRENKO, at: NOW - 3 * 3600e3 }, { id: 'd-atraxa', cards: ATRAXA, at: NOW - 2 * DAY },
  { id: 'd-urd', cards: URD, at: NOW - 6 * DAY }, { id: 'd-giada', cards: GIADA, at: NOW - 13 * DAY },
].map((d, i) => ({ ...d, name: (DECK_NAMES[lang] || DECK_NAMES.en)[i] })).map(d => ({ id: d.id, name: d.name, text: deckText(d.cards), opts: {}, cards: d.cards.reduce((a, c) => a + c[1], 0), history: [], createdAt: d.at - 20 * DAY, updatedAt: d.at }));
/** Historique de valeur : 120 jours, hausse régulière (achats, prix), dernier relevé = valeur actuelle. */
function history() {
  const r = rnd('hist'), out = [], n = 120;
  for (let i = n; i >= 0; i--) {
    const t = NOW - i * DAY - 3 * 3600e3, p = 1 - i / n, base = VALUE * (0.78 + 0.22 * Math.pow(p, 1.4)) + (i > 40 ? -9000 : 0), noise = (r() - 0.5) * VALUE * 0.012;
    out.push({ t, v: Math.round(i ? base + noise : VALUE), n: priced.length, q: COPIES });
  }
  out[out.length - 8].v = VALUE - 8640;      // il y a 7 jours : « ▲ +86 € · 7 j » à l'accueil
  return out;
}
console.log(`collection : ${OWN.size} cartes différentes, ${COPIES} exemplaires, ${(VALUE / 100).toFixed(2)} €`);

/* ── Cartes factices (SVG) : cadre à la couleur de la carte, illustration abstraite, nom (français si l'image est française) ─────────────────── */
const FRAME = { W: ['#f4eedb', '#cfc4a2'], U: ['#6b9be0', '#2d5a9c'], B: ['#6a6070', '#2b2530'], R: ['#e48466', '#a3402c'], G: ['#69b07a', '#2c6a43'], M: ['#ecd27c', '#b38c37'], C: ['#c3cad2', '#7d8893'], L: ['#bba684', '#7a6649'] };
const PIP = { W: '#f8f6d8', U: '#9cc3ff', B: '#b9aac6', R: '#ff8f72', G: '#86d79c' };
const xesc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
function artSvg(name, w, h, id) {
  const r = rnd('art' + name), hu = Math.floor(r() * 360), h2 = (hu + 30 + r() * 60) % 360, sx = 0.2 + r() * 0.6, sy = 0.18 + r() * 0.25;
  const ridge = (y0, amp, seed) => { const q = rnd(seed); let d = `M0 ${h}`; for (let i = 0; i <= 8; i++) d += ` L${(w * i / 8).toFixed(1)} ${(h * y0 - q() * h * amp).toFixed(1)}`; return d + ` L${w} ${h}Z`; };
  return `<defs><linearGradient id="sky${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="hsl(${hu},62%,70%)"/><stop offset=".65" stop-color="hsl(${h2},55%,46%)"/><stop offset="1" stop-color="hsl(${h2},50%,26%)"/></linearGradient>
    <radialGradient id="sun${id}"><stop offset="0" stop-color="hsl(${(hu + 180) % 360},95%,88%)"/><stop offset=".35" stop-color="hsl(${(hu + 180) % 360},90%,75%)" stop-opacity=".9"/><stop offset="1" stop-color="hsl(${(hu + 180) % 360},90%,75%)" stop-opacity="0"/></radialGradient></defs>
    <rect width="${w}" height="${h}" fill="url(#sky${id})"/><circle cx="${w * sx}" cy="${h * sy}" r="${h * 0.42}" fill="url(#sun${id})"/>
    <path d="${ridge(0.72, 0.28, name + 'a')}" fill="hsl(${h2},32%,30%)" fill-opacity=".85"/><path d="${ridge(0.9, 0.22, name + 'b')}" fill="hsl(${(h2 + 20) % 360},36%,17%)"/>`;
}
/** Ligne de type d'une carte française : types principaux traduits, sous-types omis (« Créature légendaire », « Terrain de base »…). */
function frType(t) {
  const main = String(t || '').split('—')[0].trim(); if (!main) return '';
  const W = { Artifact: 'artefact', Creature: 'créature', Enchantment: 'enchantement', Instant: 'éphémère', Sorcery: 'rituel', Land: 'terrain', Planeswalker: 'planeswalker' };
  const ws = main.split(/\s+/), types = ws.filter(w => W[w]).map(w => W[w]), leg = ws.includes('Legendary'), basic = ws.includes('Basic');
  const s = (types.includes('créature') ? ['créature', ...types.filter(x => x !== 'créature')] : types).join(' ') + (basic ? ' de base' : '') + (leg ? ' légendaire' : '');
  return s.charAt(0).toUpperCase() + s.slice(1);
}
function cardSvg(name, lang) {
  const c = card(name) || { name, cost: '', type: '', colors: [], ci: [] }, shown = lang === 'fr' && c.fr ? c.fr : c.name.split('//')[0].trim();
  const f = /Land/.test(c.type) ? (c.ci.length === 1 && /Basic/.test(c.type) ? FRAME[c.ci[0]] : FRAME.L) : c.colors.length > 1 ? FRAME.M : c.colors.length ? FRAME[c.colors[0]] : FRAME.C;
  const pips = (c.cost.match(/\{[^}]+\}/g) || []).map(s => s.slice(1, -1)), px = 446 - pips.length * 25;
  const pipSvg = pips.map((s, i) => `<circle cx="${px + i * 25 + 12}" cy="53" r="10.5" fill="${PIP[s] || '#d8d2c6'}" stroke="#0006" stroke-width="1"/>${PIP[s] ? '' : `<text x="${px + i * 25 + 12}" y="58.5" font-size="14" font-weight="700" text-anchor="middle" fill="#222" font-family="Inter,sans-serif">${xesc(s)}</text>`}`).join('');
  const nameW = Math.min(390 - pips.length * 25, shown.length * 13.2), type = lang === 'fr' ? frType(c.type) : c.type;
  const lines = rnd('txt' + name), tl = [0, 1, 2, 3].map(i => `<rect x="54" y="${476 + i * 30}" width="${(220 + lines() * 160).toFixed(0)}" height="9" rx="4.5" fill="#00000026"/>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="488" height="680" viewBox="0 0 488 680"><defs><linearGradient id="fr" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${f[0]}"/><stop offset="1" stop-color="${f[1]}"/></linearGradient>
    <linearGradient id="bar" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fbf8f0"/><stop offset="1" stop-color="#e2dccd"/></linearGradient></defs>
    <rect width="488" height="680" rx="26" fill="#121214"/><rect x="16" y="16" width="456" height="648" rx="17" fill="url(#fr)"/>
    <rect x="30" y="32" width="428" height="44" rx="9" fill="url(#bar)" stroke="#0005"/>
    <text x="46" y="62" font-family="'Bricolage Grotesque','Inter Display',Inter,sans-serif" font-weight="700" font-size="23" fill="#1d1a16"${shown.length * 13.2 > nameW ? ` textLength="${nameW}" lengthAdjust="spacingAndGlyphs"` : ''}>${xesc(shown)}</text>${pipSvg}
    <svg x="40" y="84" width="408" height="300" viewBox="0 0 408 300">${artSvg(c.name, 408, 300, 'c')}</svg><rect x="40" y="84" width="408" height="300" fill="none" stroke="#0007" stroke-width="2"/>
    <rect x="30" y="392" width="428" height="38" rx="8" fill="url(#bar)" stroke="#0005"/><text x="46" y="417" font-family="Inter,sans-serif" font-weight="600" font-size="16" fill="#2a2620">${xesc(type)}</text>
    <rect x="40" y="440" width="408" height="200" rx="6" fill="#f3efe4" fill-opacity=".92"/>${tl}</svg>`;
}
const artCropSvg = name => `<svg xmlns="http://www.w3.org/2000/svg" width="626" height="457" viewBox="0 0 408 300">${artSvg(name, 408, 300, 'a')}</svg>`;

/* ── Faux Scryfall (toutes les cartes connues ci-dessus et dans le fichier EDHREC) et images factices ─────────────────────────────────────── */
const SETS = [['cmm', 'Commander Masters'], ['vow', 'Innistrad: Crimson Vow'], ['cmr', 'Commander Legends'], ['fdn', 'Foundations'], ['m3c', 'Modern Horizons 3 Commander'], ['lci', 'The Lost Caverns of Ixalan']];
const BY_SLUG = new Map();
const imgUrl = (size, c, l) => { const s = slug(c.name.split('//')[0]); BY_SLUG.set(s, c.name); return `https://cards.scryfall.io/${size}/front/${l === 'fr' ? 'fr' : 'x'}/${s}.jpg`; };
function scryCard(name, lang = 'en') {
  const c = card(name); if (!c) return null;
  const [set, setName] = SETS[hash(c.name) % SETS.length];
  return { object: 'card', id: 's-' + slug(c.name), name: c.name, lang, ...(lang === 'fr' && c.fr ? { printed_name: c.fr } : {}), set, set_name: setName, collector_number: String(10 + hash(c.name) % 300), released_at: '2024-02-09',
    cmc: c.cmc, type_line: c.type, mana_cost: c.cost, colors: c.colors, color_identity: c.ci, oracle_text: '', legalities: { commander: 'legal' }, prices: { eur: c.eur ? (c.eur / 100).toFixed(2) : null, eur_foil: null },
    image_uris: { small: imgUrl('small', c, lang), normal: imgUrl('normal', c, lang), large: imgUrl('large', c, lang), art_crop: imgUrl('art_crop', c, lang) } };
}
/** Extension du masterset (capture « Masterset ») : 48 cartes du deck d'Edgar Markov, rangées comme une vraie extension (couleur, puis nom), raretés au prix. */
const MS_CODE = 'cmm', MS_NAME = 'Commander Masters', MS_ORD = c => (c.colors.length > 1 ? 5 : c.colors.length ? 'WUBRG'.indexOf(c.colors[0]) : /Land/.test(c.type) ? 7 : 6);
const MS_CARDS = EDGAR.map(([n]) => card(n)).filter(c => c && !BASICS[front(c.name)]).slice(0, 48).sort((a, b) => MS_ORD(a) - MS_ORD(b) || a.name.localeCompare(b.name, 'en'))
  .map((c, i) => ({ c, num: String(i + 1), rarity: c.eur > 1500 ? 'mythic' : c.eur > 400 ? 'rare' : c.eur > 90 ? 'uncommon' : 'common' }));
const msScry = (x, lang = 'en') => ({ ...scryCard(x.c.name, lang), set: MS_CODE, set_name: MS_NAME, collector_number: x.num, rarity: x.rarity, finishes: ['nonfoil', 'foil'] });
/** Lignes de la collection pour cette extension : les cartes possédées, avec leur édition (« 1 Sol Ring (CMM) 12 »). */
const msCollText = () => MS_CARDS.filter(x => OWN.has(front(x.c.name))).map(x => `1 ${x.c.name} (${MS_CODE.toUpperCase()}) ${x.num}`).join('\n');
const SETS_LIST = [[MS_CODE, MS_NAME, 'masters', '2023-08-04', 48], ['vow', 'Innistrad: Crimson Vow', 'expansion', '2021-11-19', 277], ['cmr', 'Commander Legends', 'draft_innovation', '2020-11-20', 361],
  ['fdn', 'Foundations', 'core', '2024-11-15', 271], ['m3c', 'Modern Horizons 3 Commander', 'commander', '2024-06-14', 336], ['lci', 'The Lost Caverns of Ixalan', 'expansion', '2023-11-17', 291]]
  .map(([code, name, set_type, released_at, n]) => ({ object: 'set', code, name, set_type, released_at, printed_size: n, card_count: n, icon_svg_uri: `https://svgs.scryfall.io/sets/${code}.svg?1700000000` }));
const SET_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><path d="M16 2 29 8.5 26.5 24 16 30 5.5 24 3 8.5Z" fill="#000"/><path d="M16 8 22 11v8l-6 4-6-4v-8Z" fill="#fff"/></svg>';
const namesIn = q => [...String(q).matchAll(/!"(.+?)"/g)].map(m => m[1]);
let BY_NUM = null;
const CORS = { 'access-control-allow-origin': '*' };
async function scryRoute(route) {
  const req = route.request(), u = new URL(req.url()), json = (o, status = 200) => route.fulfill({ status, headers: CORS, json: o }), nf = () => json({ object: 'error', code: 'not_found', status: 404 }, 404);
  if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { ...CORS, 'access-control-allow-headers': '*', 'access-control-allow-methods': 'GET,POST,OPTIONS' } });
  if (u.pathname === '/cards/collection') {
    const ids = (JSON.parse(req.postData() || '{}').identifiers || []), data = [], not_found = [];
    for (const i of ids) { const c = scryCard(i.name || ''); if (c) data.push(c); else not_found.push(i); }
    return json({ object: 'list', not_found, data });
  }
  if (u.pathname === '/sets') return json({ object: 'list', has_more: false, data: SETS_LIST });
  if (u.pathname === '/cards/search') {
    const q = u.searchParams.get('q') || '', nm = namesIn(q), l = (/lang:([a-z]+)/.exec(q) || [])[1];
    const em = /^e:([a-z0-9]+)(?: lang:([a-z]+))?$/.exec(q);
    if (em) return em[1] === MS_CODE && !em[2] ? json({ object: 'list', has_more: false, total_cards: MS_CARDS.length, data: MS_CARDS.map(x => msScry(x)) }) : nf();      // cartes d'une extension (masterset)
    if (/paperprints=1/.test(q)) return nf();      // aucune édition posée d'office dans la collection : les numéros factices se recoupent d'une carte à l'autre (prix et images mélangés)
    if (u.searchParams.get('unique') === 'prints' && l) {      // une seule impression par carte : son édition est posée d'office (scan, collection)
      const c = nm.length && card(nm[0]), data = c && (l === 'en' || (l === 'fr' && c.fr)) ? [scryCard(c.name, l)] : [];
      return data.length ? json({ object: 'list', has_more: false, data }) : nf();
    }
    if (l === 'fr') { const data = nm.map(n => card(n)).filter(c => c && c.fr).map(c => scryCard(c.name, 'fr')); return data.length ? json({ object: 'list', has_more: false, data }) : nf(); }
    if (l) return nf();
    const data = nm.map(n => scryCard(n)).filter(Boolean); return data.length ? json({ object: 'list', has_more: false, total_cards: data.length, data }) : nf();
  }
  if (u.pathname === '/cards/named') {
    const c = scryCard(u.searchParams.get('exact') || u.searchParams.get('fuzzy') || ''); if (!c) return nf();
    if (u.searchParams.get('format') === 'image') return route.fulfill({ status: 200, headers: CORS, contentType: 'image/svg+xml', body: cardSvg(c.name, 'en') });
    return json(c);
  }
  if (u.pathname === '/catalog/card-names') return json({ object: 'catalog', data: [...new Set([...EDH.names, ...[...DB.values()].map(d => d.name)])] });
  const m = /^\/cards\/([^/]+)\/([^/]+)(?:\/([a-z]+))?$/.exec(u.pathname);
  if (m) {      // carte par extension et numéro (image en grand)
    if (!BY_NUM) { BY_NUM = new Map(); for (const x of [...DB.values()].map(d => d.name).concat(EDH.names)) { const c = scryCard(x); if (c && !BY_NUM.has(c.set + '/' + c.collector_number)) BY_NUM.set(c.set + '/' + c.collector_number, c.name); } }
    const n = BY_NUM.get(m[1] + '/' + m[2]); return n ? json(scryCard(n, m[3] || 'en')) : nf();
  }
  return nf();
}
function imgRoute(route) {
  const u = new URL(route.request().url()), m = /^\/([a-z_]+)\/(?:front|back)\/(.+)$/.exec(u.pathname);
  let name = '', lang = 'en';
  if (m) {
    const tail = m[2];
    if (IMG_OF.has(tail)) name = IMG_OF.get(tail);
    else if (FR_IMG.has('front/' + tail)) { name = FR_IMG.get('front/' + tail); lang = 'fr'; }
    else { const f = /^(fr|x|[0-9a-f])\/(?:[0-9a-f]\/)?(.+?)(?:-v\d+)?(?:-(en|fr))?\.(?:jpg|png)$/.exec(tail); if (f) { name = BY_SLUG.get(f[2]) || f[2].replace(/-/g, ' '); if (f[1] === 'fr' || f[3] === 'fr') lang = 'fr'; } }
  }
  const body = m && m[1] === 'art_crop' ? artCropSvg(name || 'x') : cardSvg(name || 'Carte', lang);
  return route.fulfill({ status: 200, headers: { ...CORS, 'cache-control': 'max-age=86400' }, contentType: 'image/svg+xml', body });
}

/* ── Polices de l'appli : tools/fonts/*.woff2 (Bricolage Grotesque, Instrument Sans, OFL) servies à la place de Google Fonts, sinon repli système ─── */
const FONT_DIR = 'tools/fonts/', FONT_FILES = { 'Bricolage Grotesque': 'bricolage-grotesque-latin-opsz-normal.woff2', 'Instrument Sans': 'instrument-sans-latin-wght-normal.woff2' };
const HAVE_FONTS = Object.values(FONT_FILES).every(f => existsSync(FONT_DIR + f));
const FONT_CSS = HAVE_FONTS ? Object.entries(FONT_FILES).map(([fam, f]) => `@font-face{font-family:'${fam}';font-style:normal;font-weight:200 800;font-display:block;src:url(https://fonts.gstatic.com/local/${f}) format('woff2')}`).join('\n')
  : `@font-face{font-family:'Bricolage Grotesque';font-weight:200 800;src:local('Inter Display SemiBold'),local('Inter Display'),local('Inter')}@font-face{font-family:'Instrument Sans';font-weight:200 800;src:local('Inter'),local('Liberation Sans')}`;
if (!HAVE_FONTS) console.log('polices absentes de tools/fonts/ : repli sur les polices du système');
async function fontRoute(route) {
  const u = new URL(route.request().url());
  if (u.hostname === 'fonts.googleapis.com') return route.fulfill({ status: 200, headers: CORS, contentType: 'text/css', body: FONT_CSS });
  const f = u.pathname.replace('/local/', ''); if (HAVE_FONTS && Object.values(FONT_FILES).includes(f)) return route.fulfill({ status: 200, headers: CORS, contentType: 'font/woff2', body: readFileSync(FONT_DIR + f) });
  return route.abort();
}

/* ── Caméra simulée pour le scan : le haut d'une carte posée sur un tapis de jeu (flux d'un canvas) ────────────────────────────────────────── */
function camScene(lang) {
  const inner = cardSvg('Vampiric Tutor', lang).replace('<svg xmlns="http://www.w3.org/2000/svg" width="488" height="680" viewBox="0 0 488 680">', '<svg x="0" y="0" width="488" height="680" viewBox="0 0 488 680">');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720"><defs>
    <radialGradient id="mat" cx=".5" cy=".3" r=".9"><stop offset="0" stop-color="#2a2f4a"/><stop offset="1" stop-color="#0c0e18"/></radialGradient>
    <radialGradient id="vig" cx=".5" cy=".5" r=".75"><stop offset=".55" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".55"/></radialGradient>
    <filter id="sh" x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation="18"/></filter><filter id="soft"><feGaussianBlur stdDeviation="1.1"/></filter></defs>
    <rect width="1280" height="720" fill="url(#mat)"/>
    <g transform="translate(640 372) rotate(-1.6) scale(2.62) translate(-244 -54)"><rect x="6" y="14" width="488" height="680" rx="26" fill="#000" opacity=".6" filter="url(#sh)"/><g filter="url(#soft)">${inner}</g></g>
    <rect width="1280" height="720" fill="url(#vig)"/><rect width="1280" height="720" fill="#fff" opacity=".04"/></svg>`;
}

/* ── Données posées dans le navigateur avant le chargement ─────────────────────────────────────────────────────────────────────────────── */
function seed(lang) {
  return {
    'deckdeal:lang': lang,
    'deckdeal:v1': JSON.stringify({ opts: { lang: lang === 'fr' ? 'fr' : 'en', cond: 'Slightly Played', foil: 'no', mode: 'zero', ship: 280, fallbackEn: true }, src: 'cm', token: '', appKey: '', theme: 'dark', haptic: true, sort: 'deck', useColl: true, push: false, demoPref: false, draft: null }),
    'deckdeal:coll:v1': JSON.stringify({ t: collText(lang), u: NOW - 3 * 3600e3, s: '', b: null }),
    'deckdeal:decks:v1': JSON.stringify(DECKS(lang)),
    'deckdeal:coll:hist': JSON.stringify(history()),
    'deckdeal:coll:pxat': String(NOW - 3 * 3600e3),
    'deckdeal:onboard': '1', 'deckdeal:scnote': 'off',
  };
}
/* ── Mise en page d'une capture : bandeau de légende en haut, écran de l'appli (984 × 1584 px = 410 × 660 à ×2,4) qui sort par le bas ──────── */
const VIEW = { width: 410, height: 660 }, DPR = 2.4, SCR = { x: 48, y: 336, w: 984, h: 1584 };
let world = null, browser = null, FAKES = null;
async function openApp(lang) {
  const init = `(() => { try { if (!localStorage.getItem('store:seeded')) { const S = ${JSON.stringify(seed(lang))}; for (const k in S) localStorage.setItem(k, S[k]); localStorage.setItem('store:seeded', '1'); } } catch (e) {}
    window.__noFpsWatch = true;
    const CAM = 'data:image/svg+xml;base64,' + ${JSON.stringify(Buffer.from(camScene(lang)).toString('base64'))};
    if (navigator.mediaDevices) navigator.mediaDevices.getUserMedia = async () => {
      const cv = document.createElement('canvas'); cv.width = 1280; cv.height = 720; const g = cv.getContext('2d'), im = new Image(); im.src = CAM; await im.decode();
      const draw = () => g.drawImage(im, 0, 0); draw(); setInterval(draw, 120); return cv.captureStream(12);
    };
  })();`;
  const c = await newPage(browser, world, { goto: false, perms: ['camera'], init, ctx: { viewport: VIEW, deviceScaleFactor: DPR, isMobile: true, hasTouch: true, colorScheme: 'dark', locale: LOCALE[lang], timezoneId: 'Europe/Paris' } });
  const { ctx, p } = c;
  await ctx.route('**/*', r => { const u = r.request().url(); return u.startsWith(world.url) || /^(data|blob):/.test(u) ? r.continue() : r.abort(); });      // rien ne sort
  await p.route('https://api.scryfall.com/**', scryRoute);
  await p.route('https://cards.scryfall.io/**', imgRoute);
  await p.route('https://svgs.scryfall.io/**', r => r.fulfill({ status: 200, headers: CORS, contentType: 'image/svg+xml', body: SET_SVG }));      // symboles d'extension
  await p.route(/^https:\/\/fonts\.(googleapis|gstatic)\.com\//, fontRoute);
  await p.route('**/edh.bin.gz', r => r.fulfill({ status: 200, contentType: 'application/octet-stream', headers: { 'content-encoding': 'gzip' }, body: BIN }));
  await p.route('**/fr-names.tsv', r => r.fulfill({ status: 200, contentType: 'text/tab-separated-values; charset=utf-8', body: readFileSync('pwa/fr-names.tsv') }));
  await p.route(/\/names-[a-z]{2,3}\.tsv$/, r => { const f = 'pwa/' + new URL(r.request().url()).pathname.split('/').pop(); return existsSync(f) ? r.fulfill({ status: 200, contentType: 'text/tab-separated-values; charset=utf-8', body: readFileSync(f) }) : r.fulfill({ status: 404, body: '' }); });      // noms imprimés des autres langues (sinon « Téléchargement interrompu » sur le scan)
  await p.route('**/prices.tsv', r => r.fulfill({ status: 404, body: '' }));
  await p.goto(world.url + (lang !== 'fr' ? '?lang=' + lang : ''));
  await p.waitForFunction(() => typeof COLL !== 'undefined' && Object.keys(COLL.map).length > 50);
  await p.evaluate(() => { BACKOFF.scry = [60, 60, 60]; BACKOFF.cool429 = 100; collEnrich(); });      // infos des cartes (sur un vrai téléphone, déjà en cache)
  await p.waitForFunction(() => !collMissing().length && !COLL.enrich, null, { timeout: 60000 });
  await p.addStyleTag({ content: '.coll-sync{display:none!important}#toast{display:none!important}' });      // « compte indisponible » : Firebase est coupé ici, pas chez l'utilisateur ; ni toasts (éditions posées au premier lancement…)
  await p.evaluate(() => { window.edhGate = () => 'ok'; edhGateSync(); });      // decks EDHREC réservés aux comptes vérifiés : vus comme par un compte (Firebase est coupé ici)
  await p.evaluate(() => edhEnsure()); await p.waitForFunction(() => EDH.data && edhRows().length, null, { timeout: 60000 });      // decks EDHREC lus (captures « À monter » et « deck »)
  return c;
}
/** Revient à l'accueil : ferme feuilles, visionneuses, scan, collection, decks. */
const toHome = p => p.evaluate(() => { try { sheets.slice().reverse().forEach(s => s.close()); } catch (e) { /* aucune */ } for (const f of [closeCardImage, closeDeckViewer, closeScan, closeCollection, closeDecks, puClose]) try { f(); } catch (e) { /* déjà fermé */ } showView('home'); window.scrollTo(0, 0); }).then(() => p.waitForTimeout(700));
/** Attend que les images visibles soient chargées. */
const imgsReady = p => p.waitForFunction(() => [...document.images].filter(i => { const r = i.getBoundingClientRect(); return r.bottom > 0 && r.top < innerHeight && r.width > 0; }).every(i => i.complete), null, { timeout: 15000 }).catch(() => {});
/** Fait défiler pour que `target` arrive en haut : la coupure tombe juste sous l'élément précédent (pas de liseré d'un bloc à moitié caché sous l'en-tête). */
const scrollIn = (p, scroller, target) => p.evaluate(([s, t]) => {
  const sc = document.querySelector(s), el = document.querySelector(t); if (!sc || !el) return;
  const top = el.getBoundingClientRect().top; let b = top - 12;
  for (const x of sc.querySelectorAll('*')) { const r = x.getBoundingClientRect(); if (r.height && r.bottom <= top + 0.5 && r.bottom > top - 40) b = Math.max(b, r.bottom); }
  sc.scrollTop += b + 1 - sc.getBoundingClientRect().top;
}, [scroller, target]);

/** Les 8 captures, dans l'ordre de la fiche (le scan d'abord, comme chez tous les concurrents ; les deux premières comptent le plus) : légende dans les 6 langues
 *  (*mot* en dégradé foil) et mise en état de l'appli. at : ordre de capture (le masterset ajoute des lignes avec édition à la collection, la Carte mystère connecte
 *  un compte : en dernier). Aucune promesse que l'utilisateur sans token ne verrait pas : prix tendance Cardmarket seulement, pas d'offres CardTrader. */
const SHOTS = [
  { id: '01-scan', at: 1, cap: {
      fr: ['Scanne en *11 langues*', 'Même le japonais, lu sur ton téléphone'], en: ['Scan in *11 languages*', 'Even Japanese, read right on your phone'],
      de: ['Scanne in *11 Sprachen*', 'Sogar Japanisch, direkt auf dem Handy gelesen'], es: ['Escanea en *11 idiomas*', 'Hasta el japonés, leído en tu teléfono'],
      it: ['Scansiona in *11 lingue*', 'Anche il giapponese, letto sul telefono'], pt: ['Escaneie em *11 idiomas*', 'Até japonês, lido no seu celular'] },
    async go(p, lang) {
      await p.evaluate(() => openScan()); await p.waitForSelector('.scan .sc-stage[data-cam="on"]', { timeout: 15000 });
      await p.evaluate(lang => {
        const l = lang === 'fr' ? 'fr' : 'en', add = (name, cl, q) => { for (let i = 0; i < q; i++) scanAdd({ key: ownKey(name), name, card: cl, score: 0.97, raw: name }, 1, false); };
        add('Edgar Markov', 'en', 1); add('Sol Ring', 'fr', 2); add('Rhystic Study', l, 1); add('Cyclonic Rift', 'en', 1); add("Teferi's Protection", l, 1); add('Vampiric Tutor', l, 1);
        scanHint('✓ Vampiric Tutor', 'ok'); clearTimeout(SC.hintT);
      }, lang);
      await p.waitForFunction(() => !document.querySelector('.scan .sc-ed.load'), null, { timeout: 60000 });      // éditions posées d'office (les lectures du scan passent après celles de fond)
      await p.waitForTimeout(1200); await imgsReady(p); await p.waitForTimeout(400);
    } },
  { id: '02-cote', at: 2, cap: {
      fr: ['La *cote* de ta collection', 'Au prix Cardmarket, mise à jour chaque jour'], en: ['Your collection, *valued*', 'Cardmarket prices, updated every day'],
      de: ['Der *Wert* deiner Sammlung', 'Zu Cardmarket-Preisen, jeden Tag aktuell'], es: ['El *valor* de tu colección', 'A precio de Cardmarket, actualizado cada día'],
      it: ['Il *valore* della collezione', 'Ai prezzi Cardmarket, aggiornato ogni giorno'], pt: ['O *valor* da sua coleção', 'Pelo preço da Cardmarket, atualizado todo dia'] },
    async go(p) { await p.waitForFunction(() => HM.v != null && HM.v === homeValue() && document.querySelector('#hmTrade') && !document.querySelector('#nav.off'), null, { timeout: 20000 }); await imgsReady(p); await p.waitForTimeout(2600); } },      // accueil : valeur, carte Échange, barre du bas
  { id: '03-classeur', at: 3, cap: {
      fr: ['Ton classeur *en un lien*', 'Doublons et recherches, toujours à jour'], en: ['Your binder, *one link*', 'Spares and wants, always up to date'],
      de: ['Dein Ordner *per Link*', 'Doppelte und Gesuchte, immer aktuell'], es: ['Tu carpeta *en un enlace*', 'Repetidas y buscadas, siempre al día'],
      it: ['Il raccoglitore *in un link*', 'Doppioni e carte cercate, sempre aggiornati'], pt: ['Seu fichário *em um link*', 'Repetidas e procuradas, sempre em dia'] },
    async go(p) {
      await p.evaluate(() => openCollection('trade')); await p.waitForSelector('.coll.on #trView [data-v="binder"]'); await p.click('#trView [data-v="binder"]');
      await p.waitForSelector('.coll-main .bnd .bnd-card'); await p.waitForTimeout(1200); await scrollIn(p, '.coll.on .dv-scroll', '.coll-main .bnd-cust'); await imgsReady(p); await p.waitForTimeout(500);
    },
    after: p => p.click('#trView [data-v="list"]') },      // l'interrupteur est gardé sur l'appareil : la liste revient pour les captures suivantes
  { id: '04-masterset', at: 7, cap: {
      fr: ['Complète tes *extensions*', 'Ce qui manque, en noir et blanc, avec son prix'], en: ['Complete your *sets*', 'Missing cards in black and white, with their price'],
      de: ['Vervollständige deine *Sets*', 'Was fehlt, in Schwarz-Weiß, mit Preis'], es: ['Completa tus *expansiones*', 'Lo que falta, en blanco y negro, con su precio'],
      it: ['Completa le tue *espansioni*', 'Ciò che manca, in bianco e nero, con il prezzo'], pt: ['Complete suas *expansões*', 'O que falta, em preto e branco, com o preço'] },
    async go(p) {
      await p.evaluate(t => { collAdd(parseCollection(t).items, 'add'); MS.on = true; MS.set = 'cmm'; MS.cols = 4; msSave(); openCollection('list'); }, msCollText());
      await p.waitForFunction(() => document.querySelectorAll('.coll.on .ms-grid .ms-c').length > 12, null, { timeout: 30000 }); await p.waitForTimeout(1500); await scrollIn(p, '.coll.on .dv-scroll', '.coll.on .ms-head'); await imgsReady(p); await p.waitForTimeout(500);
    } },
  { id: '05-partie', at: 4, cap: {
      fr: ['Ta table de *Commander*', 'Vie, blessures de commandant, poison, monarque'], en: ['Your *Commander* table', 'Life, commander damage, poison, monarch'],
      de: ['Dein *Commander*-Tisch', 'Leben, Commander-Schaden, Gift, Monarch'], es: ['Tu mesa de *Commander*', 'Vidas, daño de comandante, veneno, monarca'],
      it: ['Il tavolo di *Commander*', 'Punti vita, danni da comandante, veleno, monarca'], pt: ['Sua mesa de *Commander*', 'Vida, dano de comandante, veneno, monarca'] },
    async go(p, lang) {
      await p.evaluate(([me, pl]) => {
        const now = Date.now() - 38 * 60e3;
        let g = partieNew({ moi: { nom: me, deck: { nom: 'Edgar Markov', commandant: 'Edgar Markov' } }, now });
        for (const [nom, cmd] of pl) g = partieAddPlace(g, { nom, deck: { nom: cmd, commandant: cmd } });
        g = partieStart(g, { now });
        for (const [pos, d] of [[1, -6], [2, -19], [3, -11], [4, -27]]) g = partieLife(g, pos, d);
        g = partieCmdDamage(g, 4, 1, 7); g = partieCounter(g, 2, 'poison', 3); g = partieMonarch(g, 1); g = partieNextTurn(g); g = partieNextTurn(g);
        partieSave(g); puOpen(g);
      }, [{ fr: 'Moi', en: 'Me', de: 'Ich', es: 'Yo', it: 'Io', pt: 'Eu' }[lang], [['Léa', 'Atraxa, Praetors\' Voice'], ['Paul', 'Krenko, Mob Boss'], ['Zoé', 'The Ur-Dragon']]]);
      await p.waitForSelector('.pu.pu-game .pu-a'); await p.waitForTimeout(1200);
    },
    after: p => p.evaluate(() => { puClose(); partieSave(null); }) },
  { id: '06-decks', at: 5, cap: {
      fr: ['Les decks que tu peux *monter*', 'Decks Commander comparés à ta collection'], en: ['Decks you can *build*', 'Commander decks matched to your collection'],
      de: ['Decks, die du *bauen* kannst', 'Commander-Decks im Vergleich mit deiner Sammlung'], es: ['Los mazos que puedes *montar*', 'Mazos Commander comparados con tu colección'],
      it: ['I mazzi che puoi *costruire*', 'Mazzi Commander confrontati con la tua collezione'], pt: ['Os decks que você pode *montar*', 'Decks Commander comparados com a sua coleção'] },
    async go(p) { await p.evaluate(() => openCollection('decks')); await p.waitForSelector('.dk-res .crow, .dk-res [role="button"]', { timeout: 30000 }); await p.waitForTimeout(1500); await scrollIn(p, '.coll.on .dv-scroll', '.dk-res .coll-list'); await imgsReady(p); await p.waitForTimeout(800); } },
  { id: '07-carte-mystere', at: 8, cap: {
      fr: ['La *Carte mystère* du jour', 'Devine-la avant les autres, chaque soir à 18 h'], en: ['The daily *Mystery card*', 'Guess it before everyone else, every evening'],
      de: ['Die *Mysterykarte* des Tages', 'Errate sie vor allen anderen, jeden Abend'], es: ['La *Carta misteriosa* del día', 'Adivínala antes que nadie, cada tarde'],
      it: ['La *Carta misteriosa* del giorno', 'Indovinala prima degli altri, ogni sera'], pt: ['A *Carta mistério* do dia', 'Adivinhe antes de todo mundo, toda noite'] },
    async go(p, lang) {
      // compte connecté (faux Firebase de tests/amis-fakes.mjs : le serveur vérifie le jeton) : la partie du jour, classée ; gros plan de l'étape 4 sur la carte dessinée ici
      const uid = 'uid-store-' + lang;
      await p.evaluate(tok => { window.__idTok = tok; }, FAKES.jwt(uid));
      await signInFake(p, { uid, email: uid + '@manaorbit.app', displayName: 'Martin' }, { owner: true }); await p.waitForTimeout(400);
      await p.evaluate(() => { PROF.name = 'Martin'; });
      await p.waitForSelector('#btnDaily', { timeout: 20000 }); await p.click('#btnDaily'); await p.waitForSelector('.dly-ask.open [data-dly="go"]', { timeout: 10000 });
      await p.click('.dly-ask [data-dly="go"]'); await p.waitForSelector('.dly .dly-chrono', { timeout: 15000 });
      const art = () => p.waitForFunction(() => { const f = document.querySelector('.dly-art'), i = f && f.querySelector('img'); return !!(f && f.classList.contains('ok') && i && i.naturalWidth > 0); }, null, { timeout: 15000 });
      const stepNo = () => p.evaluate(() => { const e = document.querySelector('.dly .dly-stp'), m = e && /(\d+)/.exec(e.textContent); return m ? Number(m[1]) : 0; });
      await art();
      while (await stepNo() < 4) { const n = await stepNo(); await p.click('.dly [data-dly="next"]:not([disabled])'); await p.waitForFunction(n => { const e = document.querySelector('.dly .dly-stp'), m = e && /(\d+)/.exec(e.textContent); return m && Number(m[1]) > n; }, n, { timeout: 10000 }); await p.waitForTimeout(900); await art(); }
      await p.waitForTimeout(1500);
    } },
  { id: '08-valeur', at: 6, cap: {
      fr: ['Sa valeur, *jour après jour*', 'Courbe, variations à 7 et 30 jours, alertes de prix'], en: ['Its value, *day by day*', 'Chart, 7- and 30-day changes, price alerts'],
      de: ['Ihr Wert, *Tag für Tag*', 'Kurve, Änderungen über 7 und 30 Tage, Preisalarme'], es: ['Su valor, *día a día*', 'Gráfica, variaciones a 7 y 30 días, alertas de precio'],
      it: ['Il valore, *giorno per giorno*', 'Grafico, variazioni a 7 e 30 giorni, avvisi di prezzo'], pt: ['O valor, *dia após dia*', 'Gráfico, variações em 7 e 30 dias, alertas de preço'] },
    async go(p) { await p.evaluate(() => openCollection('stats')); await p.waitForSelector('.coll.on .vl-box'); await p.waitForTimeout(1500); } },
];
const SHOTS_AT = SHOTS.slice().sort((a, b) => a.at - b.at);
/** Écrans de la série du 15 octobre, gardés pour les captures brutes (raw) : liste d'échange avec le lien, collection par langue. */
const OLD_SHOTS = [
  { id: '90-echange',
    async go(p) {
      await p.evaluate(() => openCollection('trade')); await p.waitForSelector('.coll.on .tr-box'); await p.waitForTimeout(1000);
      // lien public tel qu'il apparaît une fois connecté (ici, pas de compte Firebase) : même rendu que l'appli, adresse du site
      const fake = () => p.evaluate(() => { if (document.querySelector('.tr-box .tr-link')) return false; const u = D.user; D.user = { uid: 'store' }; TR.share = 'k7Qe2xPm4w'; const h = trShareBoxHtml(TR.st || trState()); D.user = u; TR.share = null; document.querySelector('.tr-box').outerHTML = h; document.querySelector('.tr-link input').value = 'https://manaorbit.app/?p=k7Qe2xPm4w'; return true; });
      await fake(); await scrollIn(p, '.coll.on .dv-scroll', '.tr-box'); await imgsReady(p); await p.waitForTimeout(500);
      if (await fake()) { await scrollIn(p, '.coll.on .dv-scroll', '.tr-box'); await p.waitForTimeout(150); }      // la section s'est repeinte entre-temps (prix arrivés) : le lien est remis juste avant la capture
    } },
  { id: '91-collection', async go(p) { await p.evaluate(() => openCollection('list')); await p.waitForSelector('.coll.on'); await p.selectOption('#collSort', 'price'); await p.waitForTimeout(900); await imgsReady(p); await p.waitForTimeout(600); } },
];

/* ── Composition (piste A) : orbite continue, légende, téléphone incliné ─────────────────────────────────────────────────────────────────────────────── */
const fontData = f => existsSync(FONT_DIR + f) ? `url(data:font/woff2;base64,${readFileSync(FONT_DIR + f).toString('base64')}) format('woff2'),` : '';
const FACES = `@font-face{font-family:'MO Display';font-weight:200 800;src:${fontData(FONT_FILES['Bricolage Grotesque'])}local('Inter Display'),local('Inter')}
  @font-face{font-family:'MO Text';font-weight:200 800;src:${fontData(FONT_FILES['Instrument Sans'])}local('Inter'),local('Liberation Sans')}`;
const FOIL = 'linear-gradient(100deg,#ff8fc3 0%,#ffd479 28%,#7be8c8 52%,#7fb0ff 76%,#c79bff 100%)';
const capHtml = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/\*(.+?)\*/g, '<em>$1</em>');
/** Orbite continue (piste A) : nuit, aurores, étoiles et une orbite foil avec les cinq orbes de mana, d'un seul tenant sur W × H (dessin de référence : 3020 × 640). */
function panoSvg(W, H) {
  const k = W / 3020, r = rnd('pano');
  const blobs = [[120, 80, 420, '#3f8fe0', 0.55], [620, 520, 380, '#3a9a5e', 0.4], [1000, 60, 400, '#c79bff', 0.42], [1480, 560, 420, '#e0533d', 0.4], [1880, 90, 380, '#3f8fe0', 0.48], [2300, 520, 400, '#c79bff', 0.4], [2760, 120, 420, '#3a9a5e', 0.4], [2950, 560, 360, '#e0533d', 0.36]];
  const defs = blobs.map(([, , , c, o], i) => `<radialGradient id="pg${i}"><stop offset="0" stop-color="${c}" stop-opacity="${o}"/><stop offset="1" stop-color="${c}" stop-opacity="0"/></radialGradient>`).join('');
  const glow = blobs.map(([x, y, rr], i) => `<circle cx="${x * k}" cy="${y * k}" r="${rr * k}" fill="url(#pg${i})"/>`).join('');
  const stars = Array.from({ length: 90 }, () => `<circle cx="${(r() * W).toFixed(0)}" cy="${(r() * H).toFixed(0)}" r="${([1, 1, 1.4, 1.8][Math.floor(r() * 4)] * k).toFixed(1)}" fill="#fff" fill-opacity="${(0.15 + r() * 0.3).toFixed(2)}"/>`).join('');
  const pts = []; for (let x = 0; x <= W + 1; x += 20 * k) pts.push([x, (470 + 95 * Math.sin(x / W * 2 * Math.PI * 1.25 + 0.6)) * k]);
  const path = f => 'M' + pts.map(([x, y]) => x.toFixed(0) + ' ' + f(x, y).toFixed(1)).join(' L');
  const orbs = [['#f8f6d8', 0.07], ['#7fb0ff', 0.2], ['#b5a3c8', 0.33], ['#ff7a5c', 0.46], ['#6fd08c', 0.59], ['#f8f6d8', 0.72], ['#7fb0ff', 0.85], ['#ff7a5c', 0.97]].map(([c, t]) => {
    const [x, y] = pts[Math.min(pts.length - 1, Math.floor(t * (pts.length - 1)))];
    return `<circle cx="${x.toFixed(0)}" cy="${y.toFixed(0)}" r="${22 * k}" fill="${c}" fill-opacity=".18"/><circle cx="${x.toFixed(0)}" cy="${y.toFixed(0)}" r="${9 * k}" fill="${c}"/>`;
  }).join('');
  return `<svg class="pano" xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><defs>${defs}<linearGradient id="pfoil" x1="0" y1="0" x2="1" y2="0">${FOIL_STOPS}</linearGradient></defs>
    <rect width="${W}" height="${H}" fill="#0b0f1c"/>${glow}${stars}
    <path d="${path((x, y) => y - 210 * k + 40 * k * Math.sin(x / W * 2 * Math.PI * 2.1))}" fill="none" stroke="#c3cbe0" stroke-opacity=".22" stroke-width="${1.5 * k}" stroke-dasharray="${4 * k} ${7 * k}"/>
    <path d="${path((x, y) => y)}" fill="none" stroke="url(#pfoil)" stroke-opacity=".9" stroke-width="${3 * k}" stroke-linecap="round"/>${orbs}</svg>`;
}
/** Les 8 captures côte à côte, avec l'espace que la fiche laisse entre elles : l'orbite continue d'une capture à l'autre. */
const PANO_GAP = 60, PANO_W = SHOTS.length * 1080 + (SHOTS.length - 1) * PANO_GAP;
let PANO = '';
/** Capture i (0 à 7) : sa tranche de l'orbite, légende en haut, téléphone incliné (à gauche, puis à droite) qui sort par le bas. */
function shotPage([title, sub], src, i) {
  if (!PANO) PANO = panoSvg(PANO_W, 1920);
  const odd = i % 2 === 1;
  return `<!doctype html><html><head><meta charset="utf-8"><style>${FACES}
  html,body{margin:0;width:1080px;height:1920px;overflow:hidden;background:#0b0f1c;-webkit-font-smoothing:antialiased}
  .pano{position:absolute;left:${-i * (1080 + PANO_GAP)}px;top:0}
  .cap{position:absolute;left:66px;right:66px;top:112px;text-align:center}
  h1{margin:0;font:760 81px/1.05 'MO Display',sans-serif;letter-spacing:-.025em;color:#f4f6ff;text-wrap:balance}
  h1 em{font-style:normal;background:${FOIL};-webkit-background-clip:text;background-clip:text;color:transparent;padding-right:.04em}
  p{margin:30px 0 0;font:500 39px/1.32 'MO Text',sans-serif;letter-spacing:-.003em;color:#b3bdd8;text-wrap:balance}
  .dev{position:absolute;left:${odd ? 156 : 138}px;top:528px;width:768px;padding:18px;border-radius:102px;background:linear-gradient(180deg,#323a5e,#151b30 22%,#0f1426);
    box-shadow:0 0 0 4px rgba(255,255,255,.13),0 84px 180px rgba(0,0,0,.55);transform:rotate(${odd ? 3 : -3}deg)}
  .dev img{display:block;width:768px;height:1236px;border-radius:84px}
  </style></head><body>${PANO}
  <div class="cap"><h1>${capHtml(title)}</h1><p>${capHtml(sub)}</p></div>
  <div class="dev"><img src="${src}"></div></body></html>`;
}
let comp = null;
/** Rend une page HTML en image : PNG si elle tient sous 1 Mo, sinon JPEG de haute qualité. Retourne le chemin écrit. */
async function render(html, w, h, base) {
  if (!comp) comp = await browser.newPage({ deviceScaleFactor: 1 });
  await comp.setViewportSize({ width: w, height: h }); await comp.setContent(html, { waitUntil: 'load' });
  await comp.evaluate(() => document.fonts.ready); await comp.waitForTimeout(150);
  let buf = await comp.screenshot({ type: 'png', clip: { x: 0, y: 0, width: w, height: h } }), file = base + '.png';
  if (buf.length > 1000000) { buf = await comp.screenshot({ type: 'jpeg', quality: 92, clip: { x: 0, y: 0, width: w, height: h } }); file = base + '.jpg'; }
  for (const ext of ['.png', '.jpg']) if (base + ext !== file && existsSync(base + ext)) unlinkSync(base + ext);      // l'autre format d'un rendu précédent
  writeFileSync(file, buf); return file;
}
const dataUrl = b => 'data:image/png;base64,' + b.toString('base64');
const blur = p => p.evaluate(() => { if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur(); }).then(() => p.waitForTimeout(250));      // pas d'anneau de focus
/** Les 8 captures d'une langue (docs/store/<langue>/), puis sa bannière (accueil et scan de cette langue). only : ids à capturer (bannière seule : scan et accueil). */
async function shotsFor(lang, only) {
  const t0 = Date.now(), { ctx, p, errs } = await openApp(lang), dir = OUT + lang + '/', raw = {}; mkdirSync(dir, { recursive: true });
  for (const s of SHOTS_AT.filter(s => !only || only.includes(s.id))) {
    await toHome(p); await s.go(p, lang); await blur(p);
    raw[s.id] = await p.screenshot({ type: 'png' });
    if (s.after) await s.after(p).catch(() => {});
    if (process.env.RAW) { mkdirSync('shots/store/', { recursive: true }); writeFileSync('shots/store/' + lang + '-' + s.id + '.png', raw[s.id]); }
    if (only) continue;
    const f = await render(shotPage(s.cap[lang], dataUrl(raw[s.id]), SHOTS.indexOf(s)), 1080, 1920, dir + s.id);
    console.log(`  ${f}  ${(statSync(f).size / 1024).toFixed(0)} Ko`);
  }
  const f = await render(featurePage(lang, dataUrl(raw['02-cote']), dataUrl(raw['01-scan'])), 1024, 500, OUT + 'feature-graphic-' + lang);
  console.log(`  ${f}  ${(statSync(f).size / 1024).toFixed(0)} Ko`);
  if (errs.length) console.log('  erreurs de la page :\n  ' + errs.join('\n  '));
  await ctx.close(); console.log(`  ${lang} : ${((Date.now() - t0) / 1000).toFixed(0)} s`);
}
/** Captures brutes de l'appli (sans légende), 8 écrans de la fiche et ceux de la série d'avant → shots/store/<langue>-<id>.png (maquettes). */
async function rawFor(lang) {
  const { ctx, p, errs } = await openApp(lang); mkdirSync('shots/store/', { recursive: true });
  for (const s of [...OLD_SHOTS, ...SHOTS_AT]) {
    await toHome(p); await s.go(p, lang); await blur(p);
    const f = 'shots/store/' + lang + '-' + s.id + '.png'; writeFileSync(f, await p.screenshot({ type: 'png' })); console.log('  ' + f);
    if (s.after) await s.after(p).catch(() => {});
  }
  if (errs.length) console.log('  erreurs de la page :\n  ' + errs.join('\n  '));
  await ctx.close();
}

/* ── Écrans des vidéos courtes (tools/shorts, node tools/store-assets.mjs video fr) → shots/video/<langue>-<écran>.png (984 × 1584, non versionnés) ─────────
   Les écrans de la fiche, plus des étapes : scan carte par carte (langues), QR de la liste d'échange, guide « Passer de ManaBox », Carte mystère indice par indice. */
async function videoFor(lang) {
  const only = (process.argv[4] || '').split(',').filter(Boolean);      // node tools/store-assets.mjs video fr liste,qr : ces étapes seulement
  const { ctx, p, errs } = await openApp(lang), dir = 'shots/video/'; mkdirSync(dir, { recursive: true });
  const snap = async n => { await imgsReady(p); await p.waitForTimeout(250); writeFileSync(dir + lang + '-' + n + '.png', await p.screenshot({ type: 'png' })); console.log('  ' + dir + lang + '-' + n + '.png'); };
  const step = async (n, f) => { if (only.length && !only.includes(n)) return; try { await toHome(p); await p.waitForTimeout(300); await f(); } catch (e) { console.log(`  ! ${n} : ${String(e.message || e).split('\n')[0]}`); } };
  const shot = id => SHOTS.find(x => x.id === id) || OLD_SHOTS.find(x => x.id === id);
  await step('accueil', async () => { await shot('02-cote').go(p, lang); await snap('accueil'); });
  await step('scan', async () => {
    await p.evaluate(() => openScan()); await p.waitForSelector('.scan .sc-stage[data-cam="on"]', { timeout: 15000 }); await p.waitForTimeout(800); await snap('scan-0');
    const cards = [['Sol Ring', 'fr'], ['Cyclonic Rift', 'ja'], ['Vampiric Tutor', 'de'], ["Teferi's Protection", 'ru'], ['Rhystic Study', 'it'], ['Edgar Markov', 'en']];
    for (const [i, [name, cl]] of cards.entries()) {
      await p.evaluate(([name, cl]) => { scanAdd({ key: ownKey(name), name, card: cl, score: 0.97, raw: name }, 1, false); scanHint('✓ ' + name, 'ok'); clearTimeout(SC.hintT); }, [name, cl]);
      await p.waitForFunction(() => !document.querySelector('.scan .sc-ed.load'), null, { timeout: 60000 }).catch(() => {}); await p.waitForTimeout(700); await snap('scan-' + (i + 1));
    }
  });
  await step('classeur', async () => { const s3 = shot('03-classeur'); await s3.go(p, lang); await snap('classeur'); await s3.after(p); });
  await step('echange', async () => {
    await shot('90-echange').go(p, lang); await snap('echange');
    await p.evaluate(() => { window.__u = D.user; D.user = D.user || { uid: 'store' }; TR.share = 'k7Qe2xPm4w'; trQrOpen(); });
    await p.waitForSelector('.sheet-wrap.open .qr-img svg');
    // QR scannable depuis la vidéo : le lien fixe des flyers, jamais l'adresse du serveur local (shareUrl est une constante : on remplace le rendu)
    await p.evaluate(u => { const b = document.querySelector('.sheet-wrap.open'); b.querySelector('.qr-img').innerHTML = qrSvgLogo(u).svg; b.querySelector('.qr-url').textContent = u; }, 'https://manaorbit.app/flyer');
    await p.waitForTimeout(700); await snap('qr');
    await p.evaluate(() => { D.user = window.__u; TR.share = null; });
  });
  await step('liste', async () => {      // la liste d'échange vue par le pote qui a scanné le QR code (onglet « À échanger »)
    await shot('90-echange').go(p, lang);
    await p.evaluate(() => openPublicTrade(readShare('trade', { ...trPayload(), by: 'Martin', at: Date.now() - 180e3 }), false, ''));
    await p.waitForSelector('.pubv.on #pubSub [data-v="have"]'); await p.click('.pubv.on #pubSub [data-v="have"]'); await p.waitForTimeout(1200);
    await p.addStyleTag({ content: '.pubv .tag.good{display:none}' }); await snap('liste');      // « déjà à toi » : le visiteur est ici le propriétaire lui-même
    await p.evaluate(() => TR.pub && TR.pub.el && TR.pub.el.__close());
  });
  await step('decks', async () => {
    await shot('06-decks').go(p, lang); await snap('decks');
    await p.evaluate(() => { const r = edhRows()[0]; openDeckViewer({ text: edhDeckText(r.deck), name: r.name || (r.deck && r.deck.name) || 'Deck' }); }); await p.waitForTimeout(2500); await snap('deck');
  });
  await step('partie', async () => { const s5 = shot('05-partie'); await s5.go(p, lang); await snap('partie'); await s5.after(p); });
  await step('valeur', async () => { await shot('08-valeur').go(p, lang); await snap('valeur'); });
  await step('collection', async () => { await shot('91-collection').go(p, lang); await snap('collection'); });
  await step('manabox', async () => { await p.evaluate(() => swgOpen({ from: 'help' })); await p.waitForSelector('.sheet-wrap.open.swg-sheet, .swg-sheet.open', { timeout: 10000 }).catch(() => {}); await p.waitForTimeout(900); await snap('manabox'); });
  await step('masterset', async () => { await shot('04-masterset').go(p, lang); await snap('masterset'); });
  await step('mystere', async () => {      // dernier : connecte un compte (comme la capture de la fiche), indice après indice
    const uid = 'uid-video-' + lang;
    await p.evaluate(tok => { window.__idTok = tok; }, FAKES.jwt(uid));
    await signInFake(p, { uid, email: uid + '@manaorbit.app', displayName: 'Martin' }, { owner: true }); await p.waitForTimeout(400);
    await p.evaluate(() => { PROF.name = 'Martin'; });
    await p.waitForSelector('#btnDaily', { timeout: 20000 }); await p.click('#btnDaily'); await p.waitForSelector('.dly-ask.open [data-dly="go"]', { timeout: 10000 }); await snap('mystere-0');
    await p.click('.dly-ask [data-dly="go"]'); await p.waitForSelector('.dly .dly-chrono', { timeout: 15000 });
    await p.waitForFunction(() => { const f = document.querySelector('.dly-art'), i = f && f.querySelector('img'); return !!(f && f.classList.contains('ok') && i && i.naturalWidth > 0); }, null, { timeout: 15000 });
    const stepNo = () => p.evaluate(() => { const e = document.querySelector('.dly .dly-stp'), m = e && /(\d+)/.exec(e.textContent); return m ? Number(m[1]) : 0; });
    await p.waitForTimeout(900); await snap('mystere-1');
    while (await stepNo() < 5) {
      const n = await stepNo(); const b = await p.$('.dly [data-dly="next"]:not([disabled])'); if (!b) break; await b.click();
      await p.waitForFunction(n => { const e = document.querySelector('.dly .dly-stp'), m = e && /(\d+)/.exec(e.textContent); return m && Number(m[1]) > n; }, n, { timeout: 10000 }); await p.waitForTimeout(1100); await snap('mystere-' + (n + 1));
    }
  });
  if (errs.length) console.log('  erreurs de la page :\n  ' + errs.slice(0, 8).join('\n  '));
  await ctx.close();
}

/* ── Bannière 1024 × 500 : la même orbite, logo, nom, accroche, deux téléphones de la langue (accueil, scan) ───────────────────────────── */
const LOGO = `
    <g transform="rotate(-20 50 52)"><path d="M12 52A38 13 0 0 1 88 52" fill="none" stroke="#9aa3b8" stroke-width="2.4" stroke-linecap="round"/><circle cx="27.7" cy="41.5" r="3.4" fill="#ff7a5c" fill-opacity=".85"/><circle cx="72.3" cy="41.5" r="3.4" fill="#6fd08c" fill-opacity=".85"/></g>
    <g transform="rotate(-11 51 50)"><rect x="37" y="27" width="28" height="41" rx="5" fill="url(#foil)"/><rect x="39.6" y="29.6" width="22.8" height="35.8" rx="3.2" fill="none" stroke="#fff" stroke-opacity=".45" stroke-width="1.1"/></g>
    <g transform="rotate(-20 50 52)"><path d="M12 52A38 13 0 0 0 88 52" fill="none" stroke="#9aa3b8" stroke-width="2.4" stroke-linecap="round"/><circle cx="86.1" cy="56" r="4.3" fill="#7fb0ff"/><circle cx="50" cy="65" r="4.3" fill="#f8f6d8"/><circle cx="13.9" cy="56" r="4.3" fill="#b5a3c8"/></g>`;      // même dessin que tools/make-icons.mjs
const FOIL_STOPS = '<stop offset="0" stop-color="#ff8fc3"/><stop offset=".26" stop-color="#ffd479"/><stop offset=".5" stop-color="#7be8c8"/><stop offset=".74" stop-color="#7fb0ff"/><stop offset="1" stop-color="#c79bff"/>';
const TAG = { fr: 'Scanne, chiffre et échange<br>ta collection <b>Magic</b>.', en: 'Scan, value and trade<br>your <b>Magic</b> collection.', de: 'Scanne, bewerte und tausche<br>deine <b>Magic</b>-Sammlung.',
  es: 'Escanea, valora e intercambia<br>tu colección <b>Magic</b>.', it: 'Scansiona, valuta e scambia<br>la tua collezione <b>Magic</b>.', pt: 'Escaneie, avalie e troque<br>sua coleção <b>Magic</b>.' };
function featurePage(lang, home, scan) {
  const phone = (src, x, y, a) => `<div class="dev" style="left:${x}px;top:${y}px;transform:rotate(${a}deg)"><img src="${src}"></div>`;
  return `<!doctype html><html><head><meta charset="utf-8"><style>${FACES}
  html,body{margin:0;width:1024px;height:500px;overflow:hidden;background:#0b0f1c;-webkit-font-smoothing:antialiased}
  .pano{position:absolute;left:-760px;top:-70px}
  .txt{position:absolute;left:62px;top:0;height:500px;display:flex;flex-direction:column;justify-content:center}
  .brand{display:flex;align-items:center;gap:10px}
  .brand svg{width:88px;height:88px;flex:none;margin-left:-10px;filter:drop-shadow(0 6px 22px rgba(127,176,255,.4))}
  h1{margin:0;font:800 66px/1 'MO Display',sans-serif;letter-spacing:-.028em;color:#f5f7ff;white-space:nowrap}
  p{margin:24px 0 0 4px;font:500 27px/1.32 'MO Text',sans-serif;color:#c3cbe0;letter-spacing:-.002em}
  p b{font-weight:700;background:${FOIL};-webkit-background-clip:text;background-clip:text;color:transparent}
  .dev{position:absolute;width:178px;padding:5px;border-radius:26px;background:linear-gradient(180deg,#323a5e,#151b30 22%,#0f1426);box-shadow:0 0 0 1.5px rgba(255,255,255,.13),0 28px 60px rgba(0,0,0,.55)}
  .dev img{display:block;width:178px;height:287px;border-radius:21px}
  </style></head><body>${panoSvg(3020, 640)}
  ${phone(home, 600, 120, -8)}${phone(scan, 790, 70, 6)}
  <div class="txt"><div class="brand"><svg viewBox="6 8 88 88"><defs><linearGradient id="foil" x1="0" y1="0" x2="1" y2="1">${FOIL_STOPS}</linearGradient></defs>${LOGO}</svg><h1>Mana Orbit</h1></div>
    <p>${TAG[lang]}</p></div>
  </body></html>`;
}

/** Carte mystère : une carte du jeu dessinée ici (même rendu que les autres), en PNG 745 × 1040 par langue, servie au serveur par le faux Scryfall de tests/daily-fakes.mjs. */
const DLY_CARD = { set: 'tst', num: '17', en: 'Blood Artist', names: { fr: 'Artiste sanglant', de: 'Blutkünstler', es: 'Artista sangriento', it: 'Artista del sangue', pt: 'Artista sangrento' }, type: 'Creature — Vampire', text: 'Whenever a creature dies, target player loses 1 life.' };
async function dailyPngs() {
  const pg = await browser.newPage({ viewport: { width: 745, height: 1040 }, deviceScaleFactor: 1 }), out = {};
  for (const l of ['fr', 'en', 'de', 'es', 'it', 'pt']) {
    const svg = cardSvg(DLY_CARD.en, l).replace('width="488" height="680"', 'width="745" height="1040"');
    await pg.setContent(`<!doctype html><html><body style="margin:0;background:#121214">${svg}</body></html>`);
    out[l] = await pg.screenshot({ type: 'png', clip: { x: 0, y: 0, width: 745, height: 1040 } });
  }
  await pg.close(); return out;
}


FAKES = await startFakes();      // faux Firebase (jetons vérifiés par le serveur) : compte connecté de la Carte mystère
browser = await chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium', args: ['--no-sandbox', '--font-render-hinting=none'] });
const DLY_PNG = await dailyPngs();
// comme en production : token CardTrader du serveur réservé au compte du propriétaire, le visiteur n'a que Cardmarket
world = await startWorld({ port: PORT, daily: { cards: [DLY_CARD], png: (set, num, l) => DLY_PNG[l] || DLY_PNG.en }, env: { ALLOWED_UIDS: 'store-owner', FIREBASE_JWKS_URL: FAKES.env.FIREBASE_JWKS_URL, DAILY_MIN_AGE_DAYS: '0' } });
for (let i = 0; i < 150; i++) { try { const j = await (await fetch(world.url + 'api/daily')).json(); if (j.st === 'ready') break; } catch (e) { /* serveur pas encore là */ } await new Promise(r => setTimeout(r, 200)); }
try {
  if (what === 'all' || what === 'shots') for (const l of LANGS) await shotsFor(l);
  if (what === 'feature') for (const l of LANGS) await shotsFor(l, ['01-scan', '02-cote']);
  if (what === 'raw') for (const l of LANGS) await rawFor(l);
  if (what === 'video') for (const l of LANGS) await videoFor(l);
} finally { await browser.close(); world.stop(); FAKES.stop(); }
process.exit(0);
