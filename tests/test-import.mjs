// Import de collection depuis les autres applis : vrais exports CSV (colonnes et valeurs telles que chaque appli les écrit, tests/fixtures/import/)
// lus par parseCollection (core.js) : quantités, éditions (code d'extension + numéro), langues ; foil gardé (colonne Foil / Finish / Printing, « Foil Qty ») sur sa propre ligne ; l'état n'est pas gardé.
// ManaBox (avec et sans colonnes de classeur : une « liste » n'est pas importée), Moxfield (tout entre guillemets), Archidekt (BOM, « Edition Code »),
// Deckbox (« Edition » = nom en toutes lettres : jamais pris pour un code), Dragon Shield (« sep=, » entre guillemets), Delver Lens (« QuantityX » = « 2x »,
// virgules ou tabulations), TCGplayer (« Simple Name » plutôt que « Name » à variante), Decked Builder (« Reg Qty » + « Foil Qty »). Sans navigateur.
import './setup-env.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const C = require('../src/core.js');

const read = f => readFileSync(new URL('./fixtures/import/' + f, import.meta.url), 'utf8');
/** Résumé lisible : « nom | total | lignes (langue|édition:quantité) », dans l'ordre du fichier. */
const sum = r => r.items.map(x => `${x.n} | ${x.q} | ${C.collLines(x).map(([g, q]) => g + ':' + q).join(' ')}`);
const parse = (f, lang = 'fr') => C.parseCollection(read(f), { lang });

test('ManaBox : éditions, langues (ja, zh_CN, ko), noms avec virgule, double face, foil sur sa propre ligne', () => {
  const r = parse('manabox.csv');
  assert.equal(r.format, 'csv'); assert.equal(r.skipped, 0); assert.equal(r.copies, 14);
  assert.deepEqual(sum(r), [
    'Sol Ring | 4 | fr|c21|263#cex:1 en|cmm|410:2 en|cmm|410*:1',      // lignes dans l'ordre d'affichage (français d'abord) ; 2 normales + 1 foil de la même édition : la foil sur sa ligne (*)
    'Cloud, Midgar Mercenary | 1 | en|fin|1*:1',
    'Delver of Secrets // Insectile Aberration | 4 | jp|isd|51:4',
    'Lightning Bolt | 3 | de|m10|146#cgd:3',
    'Ragavan, Nimble Pilferer | 1 | kr|mh2|138:1',      // coréen : langue de l'appli (code CardTrader kr)
    'Swords to Plowshares | 1 | zh-CN|sta|10*:1',
  ]);
  assert.deepEqual(C.parseCollection('Name,Quantity,Language\nSol Ring,1,Phyrexian\nCounterspell,1,French', { lang: 'fr' }).items.map(i => i.l || ''), ['', 'fr'], 'langue donnée mais absente de l\'appli (phyrexian) : non précisée, pas celle choisie pour les autres lignes');
});

test('ManaBox avec classeurs : les cartes des listes (souhaits) ne sont pas importées, celles des classeurs oui', () => {
  const r = parse('manabox-binders.csv');
  assert.equal(r.listed, 1, 'la liste « Ma liste de souhaits » (Binder Type = list) est laissée de côté');
  assert.deepEqual(Object.values(r.places).map(x => x.n).sort(), ['Classeur rouge', 'Deck Edgar'], 'deux classeurs : deux emplacements (créés à l\'import par places.js)');
  assert.deepEqual(sum(r).map(x => x.replace(/#p(i[a-z0-9]+)/, (m, id) => ' @' + r.places[id].n)), ['Lightning Bolt | 2 | fr|m10|146 @Classeur rouge:2', 'Counterspell | 1 | en|mh2|267 @Classeur rouge:1', 'Edgar Markov | 1 | en|c17|36* @Deck Edgar:1']);
  assert.ok(!r.items.some(x => x.n === 'The One Ring'));
});

test('Moxfield : tout entre guillemets, « Count » et non « Tradelist Count », langues en toutes lettres, numéro « C21-263 » (The List)', () => {
  const r = parse('moxfield.csv');
  assert.deepEqual(sum(r), [
    'Arcane Signet | 2 | en|cmm|380:2', 'Fellwar Stone | 1 | fr|c21|242*:1', 'Brazen Borrower // Petty Theft | 1 | jp|eld|39#cex:1',
    'Llanowar Elves | 3 | de|m19|314:3', "Teferi's Protection | 1 | zh-CN|c17|8:1", 'Sol Ring | 1 | pt|plst|C21-263*:1',
  ]);
});

test('Archidekt : BOM, « Edition Code » préféré à « Edition Name », tags avec virgule, langues en code', () => {
  const r = parse('archidekt.csv');
  assert.deepEqual(sum(r), ['Llanowar Elves | 4 | en|dom|168:4', 'Sol Ring | 1 | fr|cmm|410*#clp:1', 'Kozilek, Butcher of Truth | 2 | en|roe|6:2', 'Thoughtseize | 1 | it|ths|107#cgd:1']);
  // autre jeu de colonnes possible (export personnalisé) : « Set Code », « Collector Number », langue en code minuscule
  const alt = C.parseCollection('Quantity,Name,Set Code,Set Name,Collector Number,Condition,Language,Foil,Scryfall ID,Oracle ID\n4,Goblin Arsonist,m12,Magic 2012,136,NM,en,true,c24751fd,c1177f22', { lang: 'fr' });
  assert.deepEqual(sum(alt), ['Goblin Arsonist | 4 | en|m12|136*:4']);
});

test('Deckbox : « Edition » est un nom d\'extension (Ixalan, Theros : 6 lettres) → pas d\'édition inventée ; quantités et langues gardées', () => {
  const r = parse('deckbox.csv');
  assert.deepEqual(sum(r), ['Lightning Bolt | 2 | en:2', "Vraska's Contempt | 1 | fr*:1", 'Thoughtseize | 1 | es#cpl:1', 'Brainstorm | 3 | en:3', 'Jace, the Mind Sculptor | 1 | en:1']);
});

test('Dragon Shield : ligne « "sep=," », « Card Name », dossiers additionnés', () => {
  const r = parse('dragonshield.csv');
  assert.deepEqual(sum(r), ['Counterspell | 3 | en|mh2|267:3', "Atraxa, Praetors' Voice | 1 | fr|2x2|190*:1", 'Llanowar Elves | 4 | de|dom|168#cex:4']);
  assert.equal(C.parseCollection('sep=,\nFolder Name,Quantity,Card Name\nA,2,Sol Ring').items[0].q, 2, '« sep=, » sans guillemets aussi');
});

test('Delver Lens : « QuantityX » (« 2x »), « Edition code » et « Collector\'s number », Portuguese (Brazil) ; export à tabulations', () => {
  assert.deepEqual(sum(parse('delver.csv')), ['Lightning Bolt | 2 | fr|m10|146:2', 'Sol Ring | 1 | en|cmm|410*:1', 'Llanowar Elves | 3 | pt|dom|168#cex:3', 'Brazen Borrower // Petty Theft | 1 | jp|eld|39:1']);
  const t = parse('delver-tab.csv', 'en');
  assert.deepEqual(sum(t), ['Sol Ring | 2 | en:2', 'Llanowar Elves | 4 | en:4'], 'colonnes par défaut (QuantityX, Name) : langue choisie dans l\'import');
});

test('TCGplayer : « Simple Name » plutôt que « Name » (« Sol Ring (Foil Etched) »), « Set Code » plutôt que « Set »', () => {
  assert.deepEqual(sum(parse('tcgplayer.csv')), ['Sol Ring | 1 | en|cmm|410*:1', 'Lightning Bolt | 2 | fr|m10|146#cex:2']);
});

test('Decked Builder : « Reg Qty » + « Foil Qty »', () => {
  assert.deepEqual(sum(parse('deckedbuilder.csv')), ['Sol Ring | 2 | fr*:2', 'Counterspell | 4 | fr:3 fr*:1'], 'les foil sur leur propre ligne');
});

test('valeurs de colonnes : code d\'extension en majuscules ou minuscules, nom en toutes lettres refusé', () => {
  assert.equal(C.parseCollection('Count,Name,Edition,Collector Number\n1,Sol Ring,CMM,410').items[0].x['|cmm|410'], 1, 'majuscules');
  assert.equal(C.parseCollection('Count,Name,Edition,Collector Number\n1,Sol Ring,Mirage,410').items[0].x, undefined, 'Mirage : un nom');
  assert.equal(C.parseCollection('Count,Name,Set ID,Collector Number\n1,Sol Ring,Mirage,410').items[0].x['|mirage|410'], 1, 'colonne de code : prise telle quelle');
  assert.equal(C.cardLang('Portuguese (Brazil)'), 'pt'); assert.equal(C.cardLang('zh-Hans'), 'zh-CN'); assert.equal(C.cardLang('Korean'), 'kr'); assert.equal(C.cardLang('Phyrexian'), '');
});

/* ── Decklists exportées (texte collé dans la recherche de prix, Mes decks, l'éditeur) : sections des exports Moxfield, Archidekt, MTGA, MTGO ──
   Maybeboard / Considering / Tokens : hors du deck (ni cherchés, ni chiffrés, ni comptés) ; Sideboard : la réserve, comme les lignes « SB: » (dkSideCards) ;
   Commander et Companion : dans le deck ; « About » / « Name … » (MTGA) : ignoré. */
const deckSum = t => { const d = C.parseDeck(t); return { cards: d.cards.map(c => c.qty + ' ' + c.name), basics: d.basicCopies, side: C.dkSideCards(t).map(c => c.qty + ' ' + c.name), ignored: d.ignored }; };
test('decklist Moxfield (export MTGA) : About / Name ignorés, Commander gardé, Sideboard = réserve, Maybeboard et Tokens hors du deck', () => {
  const t = 'About\nName Atraxa Superfriends\n\nCommander\n1 Atraxa, Praetors\' Voice (2X2) 190\n\nDeck\n1 Sol Ring (CMM) 400\n1 Arcane Signet (CMM) 297\n30 Forest (CMM) 449\n\nSideboard\n1 Negate (M20) 69\n\nMaybeboard\n1 Mana Crypt (2XM) 270\n\nTokens\n1 Treasure (TCMM) 21';
  assert.deepEqual(deckSum(t), { cards: ['1 Atraxa, Praetors\' Voice', '1 Sol Ring', '1 Arcane Signet'], basics: 30, side: ['1 Negate'], ignored: 0 });
  assert.deepEqual(C.dkCount(t), { n: 33, size: 100 }, 'Mes decks : 33 cartes, ni réserve ni maybeboard');
  const v = C.dkValue(t, k => ({ eu: k === 'mana crypt' ? 15000 : 100 })); assert.deepEqual([v.cents, v.total], [300, 3], 'valeur : Mana Crypt (maybeboard) non chiffrée');
  assert.deepEqual(C.dkParse(t).main.map(c => c.name), ['Sol Ring', 'Arcane Signet', 'Forest'], 'éditeur : Tokens et Name laissés de côté'); assert.deepEqual(C.dkParse(t).side.map(c => c.name), ['Negate']);
});
test('decklist Moxfield (texte) et Archidekt : en-têtes en capitales avec « : », comptes « (n) », « 1x », commentaires « // Sideboard »', () => {
  assert.deepEqual(deckSum('1 Sol Ring\n1 Arcane Signet\n\nSIDEBOARD:\n1 Negate\n\nMAYBEBOARD:\n1 Mana Crypt'), { cards: ['1 Sol Ring', '1 Arcane Signet'], basics: 0, side: ['1 Negate'], ignored: 0 });
  assert.deepEqual(deckSum('Commander (1)\n1x Edgar Markov\n\nCreature (1)\n1x Bloodline Keeper\n\nConsidering (2)\n1x Mana Crypt\n1x Mana Vault\n\nLand (1)\n10x Swamp'),
    { cards: ['1 Edgar Markov', '1 Bloodline Keeper'], basics: 10, side: [], ignored: 0 }, 'Considering : jusqu\'à l\'en-tête suivant (Land), les lignes vides n\'y mettent pas fin ; Swamp après « Land » dans le deck');
  assert.deepEqual(deckSum('4 Lightning Bolt\n// Sideboard\n2 Negate\n// Maybeboard\n1 Duress'), { cards: ['4 Lightning Bolt'], basics: 0, side: ['2 Negate'], ignored: 0 }, '« // Sideboard » (deckstats, Cockatrice) : un en-tête aussi');
  assert.deepEqual(deckSum('Commanders\n1 Edgar Markov\n\nDeck\n1 Sol Ring'), { cards: ['1 Edgar Markov', '1 Sol Ring'], basics: 0, side: [], ignored: 0 }, '« Commanders » : un en-tête, pas une carte');
  assert.deepEqual(deckSum('Deck\n1 Sol Ring\n\nMaybeboard\n1 Arcane Signet'), { cards: ['1 Sol Ring'], basics: 0, side: [], ignored: 0 }, 'repro de l\'audit : 1 carte à chercher, pas 2');
});
test('decklist MTGA (Arena) : Companion gardé, Sideboard = réserve (comme « SB: »), même chiffre qu\'un deck de l\'éditeur', () => {
  const t = 'Companion\n1 Lurrus of the Dream-Den (IKO) 226\n\nDeck\n4 Lightning Bolt (STA) 42\n20 Mountain (ZNR) 279\n\nSideboard\n1 Lurrus of the Dream-Den (IKO) 226\n2 Negate (M20) 69';
  assert.deepEqual(deckSum(t), { cards: ['1 Lurrus of the Dream-Den', '4 Lightning Bolt'], basics: 20, side: ['1 Lurrus of the Dream-Den', '2 Negate'], ignored: 0 });
  const sb = '4 Lightning Bolt\n20 Mountain\nSB: 2 Negate';
  assert.deepEqual([C.parseDeck(sb).copies, C.dkSideCards(sb).length], [C.parseDeck('Deck\n4 Lightning Bolt\n20 Mountain\n\nSideboard\n2 Negate').copies, C.dkSideCards('Deck\n4 Lightning Bolt\n\nSideboard\n2 Negate').length], 'Sideboard et SB: : même traitement');
  assert.deepEqual(C.engSnapshot('Deck\n4 Lightning Bolt\n\nSideboard\n2 Negate', () => 9), { 'lightning bolt': 4, negate: 2 }, 'deck monté : la réserve d\'un export est mise de côté comme « SB: »');
});
test('decklist MTGO / MTGA sans en-tête : 60 cartes, ligne vide, puis la réserve (15 au plus, sans terrain de base) ; sinon tout reste dans le deck', () => {
  const main = '4 Lightning Bolt\n4 Monastery Swiftspear\n4 Goblin Guide\n4 Lava Spike\n4 Rift Bolt\n4 Skewer the Critics\n4 Searing Blaze\n4 Eidolon of the Great Revel\n4 Light Up the Stage\n4 Boros Charm\n20 Mountain';
  assert.deepEqual(deckSum(main + '\n\n2 Negate\n3 Smash to Smithereens'), { cards: main.split('\n').slice(0, 10).map(l => l), basics: 20, side: ['2 Negate', '3 Smash to Smithereens'], ignored: 0 });
  assert.equal(C.parseDeck(main + '\n\n2 Negate\n3 Smash to Smithereens').copies, 60, 'MTGO : 60 cartes, la réserve à part');
  assert.equal(C.parseDeck('4 Lightning Bolt\n\n2 Negate').cards.length, 2, 'liste courte : la ligne vide ne sépare rien');
  assert.equal(C.parseDeck(main.replace('20 Mountain', '10 Goblin Bushwhacker') + '\n\n10 Mountain').basicCopies, 10, 'bloc de terrains de base après une ligne vide : dans le deck');
  assert.equal(C.parseDeck(main + '\n\n2 Negate\n\n1 Duress').cards.length, 12, 'trois blocs : rien n\'est pris pour une réserve');
  assert.equal(C.parseDeck(main + '\n\n16 Negate').cards.length, 11, 'plus de 15 cartes : pas une réserve');
});
