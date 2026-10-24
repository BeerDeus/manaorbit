// E2E : créateur de deck « + » (Standard / Commander), collection d'abord, réserve, règles, montage automatique, modification.
import './setup-env.mjs';
import assert from 'node:assert/strict';
import { chromium, startWorld, newPage, txt, ok, toInput, toHome } from './e2e-world.mjs';

const world = await startWorld({ port: 18960 });
const browser = await chromium.launch({ executablePath: (process.env.CHROMIUM || '/opt/pw-browsers/chromium'), args: ['--no-sandbox'] });
const seed = collText => `try { localStorage.setItem('deckdeal:coll:v1', JSON.stringify({ t: ${JSON.stringify(collText)}, u: 1, s: '', b: null })); } catch (e) {}`;
const tc = (p, sel) => p.$eval(sel, e => e.textContent.replace(/\s+/g, ' ').trim());
const errsOf = [];
const step = (p, k, tgt, d) => p.click(`.bd-row[data-k="${k}"][data-t="${tgt}"] [data-d="${d}"]`);
const tab = async (p, v) => { await p.click(`#bdSeg .seg-opt[data-v="${v}"]`); await p.waitForTimeout(80); };
const qty = (p, k, tgt) => p.$eval(`.bd-row[data-k="${k}"][data-t="${tgt}"] .qstep b`, e => Number(e.textContent));
const decks = async p => { if (!(await p.$('.dks.on'))) { await toHome(p); await p.click('#btnDecks'); await p.waitForSelector('.dks.on'); } };      // écran « Mes decks » (bouton de l'accueil)
const newDeck = async (p, name, fmt) => {
  await decks(p); await p.click('#btnNewDeck'); await p.waitForSelector('#ndName');
  await p.fill('#ndName', name); await p.click(`#ndFmt .seg-opt[data-v="${fmt}"]`);
  await p.click('#ndGo'); await p.waitForSelector('.bd.on');
};

const { p, errs } = await newPage(browser, world, { init: seed('1 Sol Ring *EN*\n1 Edgar Markov *FR*\n2 Arcane Signet *FR*\n1 Swords to Plowshares *EN*') }); errsOf.push(errs);
await p.waitForTimeout(500);

/* ── A) Commander : création complète ─────────────────────────────────────────────────────── */
assert.ok(await p.isVisible('#btnDecks'), 'bouton « Decks » de la barre du bas toujours là (le + doit être accessible)'); await decks(p);
assert.match(await txt(p, '#deckList'), /Touche « \+ »/, 'invitation quand aucun deck'); assert.equal(await p.$$eval('.deck', n => n.length), 0);
await newDeck(p, 'Vampires Boros', 'commander');
assert.equal(await txt(p, '#bdTitle'), 'Vampires Boros'); assert.match(await txt(p, '#bdSub'), /Commander · 0\/100/);
assert.match(await txt(p, '#bdSum'), /Aucun commandant/); assert.equal(await p.$eval('#bdSave', b => b.disabled), true, 'pas de sauvegarde sans commandant');
await p.click('[data-act="pick-cmdr"]'); await p.waitForSelector('#bdTgt');
assert.equal(await p.$eval('#bdTgt', e => e._v), 'cmdr', 'cible : commandant');
await p.waitForSelector('.bd-row[data-k="edgar markov"]', { timeout: 8000 });
assert.deepEqual(await p.$$eval('.bd-row', r => r.map(x => x.dataset.k)), ['edgar markov'], 'seuls les commandants possibles de la collection (légendaires)');
await step(p, 'edgar markov', 'cmdr', 1); assert.equal(await qty(p, 'edgar markov', 'cmdr'), 1);
assert.match(await txt(p, '#bdSub'), /1\/100/); assert.equal(await p.$eval('#bdSave', b => b.disabled), false);
ok('Commander : + → nom/format, commandant obligatoire (collection filtrée sur les commandants possibles)');

await p.click('#bdTgt .seg-opt[data-v="main"]');
await p.fill('#bdQ', 'sol'); assert.deepEqual(await p.$$eval('.bd-row', r => r.map(x => x.dataset.k)), ['sol ring'], 'recherche dans la collection');
await step(p, 'sol ring', 'main', 1); assert.equal(await qty(p, 'sol ring', 'main'), 1);
await step(p, 'sol ring', 'main', 1); assert.equal(await qty(p, 'sol ring', 'main'), 1, 'singleton : 2e exemplaire refusé'); assert.match(await txt(p, '#toast'), /un seul exemplaire/);
await p.fill('#bdQ', 'arcane'); await step(p, 'arcane signet', 'main', 1); await step(p, 'arcane signet', 'main', 1); assert.equal(await qty(p, 'arcane signet', 'main'), 1);
await p.fill('#bdQ', ''); await tab(p, 'find');
await p.waitForFunction(() => /Tape au moins 2 lettres/.test(document.querySelector('#bdList').textContent), null, { timeout: 8000 });
await p.fill('#bdQ', 'crater'); await p.waitForSelector('.bd-row[data-k="craterhoof behemoth"]'); await step(p, 'craterhoof behemoth', 'main', 1);
await p.fill('#bdQ', 'wrath'); await p.waitForSelector('.bd-row[data-k="wrath of god"]'); await step(p, 'wrath of god', 'main', 1);
assert.match(await tc(p, '.bd-row[data-k="wrath of god"] .row-meta'), /Pas dans ta collection/);
await p.fill('#bdQ', 'edgar'); await p.waitForSelector('.bd-row[data-k="edgar markov"]'); await step(p, 'edgar markov', 'main', 1);
assert.match(await txt(p, '#toast'), /déjà ton commandant/);
await p.waitForFunction(() => /Craterhoof Behemoth sort de l'identité/.test(document.querySelector('#bdSum').textContent), null, { timeout: 10000 });
assert.ok(!/Wrath of God sort/.test(await tc(p, '#bdSum')), 'Wrath (W) est dans RWB');
ok('Commander : singleton refusé, ajout depuis « Chercher » (tout le catalogue), identité de couleur contrôlée');

await tab(p, 'deck');
for (let i = 0; i < 3; i++) await step(p, 'forest', 'main', 1);
assert.equal(await qty(p, 'forest', 'main'), 3);
assert.match(await tc(p, '.bd-row[data-k="arcane signet"] .row-meta'), /Possédée/); assert.match(await tc(p, '.bd-row[data-k="wrath of god"] .row-meta'), /À acheter/);
assert.match(await txt(p, '#bdSub'), /Commander · 8\/100/, 'commandant + Sol Ring + Signet + Craterhoof + Wrath + 3 Forest = 8');
assert.match(await txt(p, '#bdSum'), /Il manque 92 cartes/);
await p.fill('#bdName', 'Vampires Boros v1'); assert.equal(await txt(p, '#bdTitle'), 'Vampires Boros v1');
await p.click('#bdSave'); await p.waitForFunction(() => !document.querySelector('.bd'), null, { timeout: 4000 });
assert.match(await txt(p, '#toast'), /Deck créé · 3 cartes réservées de ta collection · incomplet/, 'monté automatiquement : Edgar + Sol Ring + Signet');
const dk = await p.evaluate(() => { const d = allDecks()[0]; return { id: d.id, name: d.name, text: d.text, cards: d.cards, eng: XS.eng[d.id] && XS.eng[d.id].q }; });
assert.equal(dk.name, 'Vampires Boros v1'); assert.match(dk.text, /^\/\/ Deck Deal : commander\nCommander\n1 Edgar Markov\n\nDeck\n/); assert.deepEqual(dk.eng, { 'edgar markov': 1, 'sol ring': 1, 'arcane signet': 1 });
assert.equal(dk.cards, 5, 'Edgar + Sol Ring + Signet + Craterhoof + Wrath (terrains de base à part)');
assert.match(await txt(p, '#deckList'), /Vampires Boros v1/); assert.match(await txt(p, '#deckList'), /8\/100 cartes · .* · monté/, 'exemplaires comptés comme le viewer (5 cartes + 3 terrains de base), « monté »');
ok('Commander : enregistré (texte lisible par l\'app), monté automatiquement, incomplet autorisé');

/* ── B) Standard : 4 exemplaires, réserve facultative, cartes engagées ailleurs ───────────── */
await newDeck(p, 'Burn', 'standard');
assert.match(await txt(p, '#bdSub'), /Standard · 0\/60/); assert.match(await txt(p, '#bdSum'), /0\s*\/ 15 en réserve/);
await tab(p, 'coll'); assert.equal(await p.$eval('#bdTgt', e => e._v), 'main');
assert.deepEqual(await p.$$eval('#bdTgt .seg-opt', b => b.map(x => x.dataset.v)), ['main', 'side'], 'Standard : Deck | Réserve');
await p.fill('#bdQ', 'sol'); assert.match(await tc(p, '.bd-row[data-k="sol ring"] .row-meta'), /1 engagée ailleurs/, 'Sol Ring est monté dans le deck Commander');
await p.fill('#bdQ', 'arcane'); for (let i = 0; i < 5; i++) await step(p, 'arcane signet', 'main', 1);
assert.equal(await qty(p, 'arcane signet', 'main'), 4, '4 exemplaires maximum'); assert.match(await txt(p, '#toast'), /4 exemplaires au maximum/);
await p.click('#bdTgt .seg-opt[data-v="side"]'); await step(p, 'arcane signet', 'side', 1); assert.equal(await qty(p, 'arcane signet', 'side'), 0, 'réserve comprise dans les 4');
await p.fill('#bdQ', 'swords'); await step(p, 'swords to plowshares', 'side', 1); assert.equal(await qty(p, 'swords to plowshares', 'side'), 1);
await tab(p, 'deck');
assert.match(await txt(p, '#bdSum'), /1\s*\/ 15 en réserve/); assert.match(await txt(p, '#bdSub'), /Standard · 4\/60/);
for (let i = 0; i < 20; i++) await step(p, 'mountain', 'main', 1);
assert.equal(await qty(p, 'mountain', 'main'), 20); assert.match(await txt(p, '#bdSub'), /24\/60/); assert.match(await txt(p, '#bdSum'), /Il manque 36 cartes \(60 minimum\)/);
assert.ok(await p.$('.bd-row[data-k="swords to plowshares"][data-t="side"]'), 'la réserve a sa propre section');
await p.click('.bd [data-act="close"]'); await p.waitForSelector('#bdLeave'); assert.match(await txt(p, '.sheet'), /Les changements de ce deck seront perdus/);
await p.click('.sheet [data-close].btn'); await p.waitForTimeout(500); assert.ok(await p.$('.bd'), 'Continuer : on reste dans l\'éditeur');
await p.click('#bdSave'); await p.waitForFunction(() => !document.querySelector('.bd'), null, { timeout: 4000 });
const bn = await p.evaluate(() => { const d = allDecks().find(x => x.name === 'Burn'); return { text: d.text, cards: d.cards, eng: XS.eng[d.id].q }; });
assert.match(bn.text, /\n4 Arcane Signet\n20 Mountain\n\nSB: 1 Swords to Plowshares$/); assert.equal(bn.cards, 1, 'la réserve n\'est pas comptée parmi les cartes à chercher');
assert.deepEqual(bn.eng, { 'arcane signet': 2, 'swords to plowshares': 1 }, 'réserve incluse dans les cartes mises de côté (Signet : 2 possédées)');
ok('Standard : 4 max (réserve comprise), réserve facultative, engagée ailleurs signalée, confirmation avant de quitter, SB: enregistré');

/* ── C) Modifier un deck existant ─────────────────────────────────────────────────────────── */
await p.click('.deck:has-text("Vampires Boros") [data-act="open"]'); await p.waitForSelector('.dv.on [data-act="builder"]'); await p.click('.dv.on [data-act="builder"]'); await p.waitForSelector('.bd.on');
assert.equal(await txt(p, '#bdTitle'), 'Vampires Boros v1'); assert.match(await txt(p, '#bdSub'), /Commander · 8\/100/);
assert.equal(await qty(p, 'edgar markov', 'cmdr'), 1); assert.equal(await qty(p, 'forest', 'main'), 3);
await step(p, 'forest', 'main', -1); await step(p, 'forest', 'main', -1); await step(p, 'forest', 'main', -1); assert.match(await txt(p, '#bdSub'), /5\/100/);
await step(p, 'wrath of god', 'main', -1); assert.equal(await p.$('.bd-row[data-k="wrath of god"]'), null, 'carte retirée à 0');
await p.click('#bdSave'); await p.waitForFunction(() => !document.querySelector('.bd'), null, { timeout: 4000 });
assert.match(await txt(p, '#toast'), /Deck mis à jour/);
const ed = await p.evaluate(() => { const d = allDecks().find(x => x.name.startsWith('Vampires')); return { text: d.text, n: allDecks().length, eng: XS.eng[d.id].q }; });
assert.ok(!/Forest|Wrath/.test(ed.text) && /Craterhoof/.test(ed.text)); assert.equal(ed.n, 2, 'pas de doublon'); assert.deepEqual(ed.eng, { 'edgar markov': 1, 'sol ring': 1, 'arcane signet': 1 }, 'deck monté : réservation suivie');
ok('modifier un deck : l\'éditeur relit le texte, retire à 0, met à jour sans doublon, garde le montage');

/* ── C2) Format à côté du nom, valeur estimée (deck monté), image en grand ───────────────── */
{
  await p.waitForFunction(() => document.querySelectorAll('.deck-fmt').length === 2, null, { timeout: 4000 });
  const fm = await p.$$eval('.deck', ds => ds.map(d => [d.querySelector('.deck-name').textContent, d.querySelector('.deck-fmt').textContent]).sort());
  assert.deepEqual(fm, [['Burn', 'Standard'], ['Vampires Boros v1', 'Commander']], 'Standard / Commander à côté du nom');
  // valeur : Burn = 4 Arcane Signet (0,40 € chacune, collection) ; la réserve n'est pas comptée
  await p.waitForFunction(() => /≈ 1,60/.test(document.querySelector('.deck[data-id] .deck-meta') ? [...document.querySelectorAll('.deck')].find(d => d.querySelector('.deck-name').textContent === 'Burn').querySelector('.deck-meta').textContent : ''), null, { timeout: 8000 });
  await p.click('.deck:has-text("Burn") [data-act="more"]'); await p.waitForSelector('#dkVal b', { timeout: 8000 });
  assert.match(await txt(p, '#dkVal'), /≈ 1,60\s*€ valeur estimée · Standard · prix tendance Cardmarket de 1 carte sur 1/, 'deck monté : valeur affichée quand même');
  assert.equal(await p.evaluate(() => engIsOn(allDecks().find(d => d.name === 'Burn').id)), true);
  await p.keyboard.press('Escape'); await p.waitForFunction(() => !document.querySelector('.sheet-wrap'), null, { timeout: 3000 });
  // image en grand depuis l'éditeur
  await p.click('.deck:has-text("Vampires") [data-act="open"]'); await p.waitForSelector('.dv.on [data-act="builder"]'); await p.click('.dv.on [data-act="builder"]'); await p.waitForSelector('.bd.on');
  await p.waitForSelector('.bd-row[data-k="craterhoof behemoth"] .thumb img.ok', { timeout: 10000 });
  assert.match(await txt(p, '#bdSum'), /≈ \d/, 'valeur estimée dans le résumé de l\'éditeur');
  await p.click('.bd-row[data-k="craterhoof behemoth"] .thumb'); await p.waitForSelector('.imgv', { timeout: 4000 });
  assert.match(await txt(p, '.imgv'), /Craterhoof Behemoth/, 'image de la carte en grand'); await p.keyboard.press('Escape'); await p.waitForTimeout(400);
  await p.click('.bd [data-act="close"]'); await p.waitForFunction(() => !document.querySelector('.bd'), null, { timeout: 3000 });
  ok('format à côté du nom, valeur estimée même pour un deck monté (liste, feuille, éditeur), vignette → image en grand');
}

/* ── D) Le deck créé se charge comme les autres (prix, viewer) ────────────────────────────── */
await p.click('.deck:has-text("Burn") [data-act="more"]'); await p.waitForSelector('#dkOpen'); await p.click('#dkOpen'); await p.waitForTimeout(300);
assert.match(await p.$eval('#deckText', e => e.value), /^\/\/ Deck Deal : standard/); assert.match(await txt(p, '#deckStats'), /1 carte à chercher|1 carte/, 'seule Arcane Signet à chercher (réserve exclue)');
ok('deck créé : chargé dans la saisie comme un deck importé');

/* ── E) Scanner des cartes dans le deck : « Au deck », puis les prendre dans la collection, les ajouter, ou seulement celles qui manquent ─── */
{
  const scanIn = list => p.evaluate(list => { for (const [name, q] of list) for (let i = 0; i < q; i++) scanAdd({ key: ownKey(name), name, score: 0.99, raw: name, card: 'en' }, 1, false); }, list);
  const deckQ = () => p.evaluate(() => Object.fromEntries([...BD.main.values()].map(c => [c.key, c.qty])));
  const collQ = () => p.evaluate(() => ({ sol: collQty('sol ring'), elves: collQty('llanowar elves'), swords: collQty('swords to plowshares') }));
  await newDeck(p, 'Scan', 'standard');
  assert.equal(await txt(p, '#bdCtl .bd-scan'), 'Scanner des cartes', 'bouton dans l\'onglet Deck');
  await p.evaluate(() => { COLL.places = { ...COLL.places, bx1: { t: 'box', n: 'Boîte doublons' } }; SCD.p = 'bx1'; });      // destination du scan réglée sur une boîte
  await p.click('#bdCtl .bd-scan'); await p.waitForSelector('.scan.on'); assert.equal(await p.evaluate(() => SC.deck), true, 'scan en mode deck');
  assert.equal(await txt(p, '.scan .sc-dest'), 'Deck : Scan', 'pastille « Ranger dans » : l\'emplacement du deck, pas la boîte du scan');
  await p.click('.scan .sc-dest'); assert.match(await txt(p, '#toast'), /rangées dans « Deck : Scan » à son enregistrement/);
  const c0 = await collQ();
  await scanIn([['Sol Ring', 1], ['Llanowar Elves', 2]]); await p.waitForTimeout(300);
  assert.equal(await txt(p, '.scan .dv-foot [data-act="done"]'), 'Au deck');
  await p.click('.scan .dv-foot [data-act="done"]'); await p.waitForSelector('.bd-sc-sheet.open .bd-sc-opt');
  const opts = () => p.$$eval('.bd-sc-sheet .bd-sc-opt', b => b.map(x => [x.dataset.m, x.getAttribute('aria-checked')]));
  assert.deepEqual(await opts(), [['take', 'false'], ['add', 'false'], ['miss', 'true']], 'Sol Ring déjà là, 2 Llanowar Elves nouveaux : « seulement celles qui manquent » proposé');
  assert.match(await txt(p, '.bd-sc-sheet'), /Déjà dans ta collection 1 exemplaire/);
  await p.click('.bd-sc-opt[data-m="add"]'); assert.deepEqual((await opts()).map(o => o[1]), ['false', 'true', 'false']);
  await p.click('.bd-sc-sheet [data-ok]'); await p.waitForFunction(() => !document.querySelector('.scan') && !document.querySelector('.bd-sc-sheet'), null, { timeout: 4000 });
  assert.deepEqual(await deckQ(), { 'sol ring': 1, 'llanowar elves': 2 }, 'cartes dans le deck');
  assert.deepEqual(await collQ(), { ...c0, sol: c0.sol + 1, elves: c0.elves + 2 }, '« Les ajouter » : les 3 exemplaires entrent dans la collection');
  assert.match(await txt(p, '#toast'), /3 cartes ajoutées au deck · 3 dans ta collection/);
  await p.click('#toast .toast-act'); await p.waitForTimeout(200);
  assert.deepEqual(await deckQ(), {}, 'Annuler : deck d\'avant'); assert.deepEqual(await collQ(), c0, 'Annuler : collection d\'avant');
  // « Les prendre dans ma collection » : rien n'est ajouté ; règles du format (4 exemplaires au plus)
  await p.click('#bdCtl .bd-scan'); await p.waitForSelector('.scan.on');
  await scanIn([['Swords to Plowshares', 5]]); await p.waitForTimeout(300);
  await p.click('.scan .dv-foot [data-act="done"]'); await p.waitForSelector('.bd-sc-sheet.open .bd-sc-opt');
  await p.click('.bd-sc-opt[data-m="take"]'); await p.click('.bd-sc-sheet [data-ok]'); await p.waitForFunction(() => !document.querySelector('.scan'), null, { timeout: 4000 });
  assert.deepEqual(await deckQ(), { 'swords to plowshares': 4 }, '4 exemplaires au plus'); assert.deepEqual(await collQ(), c0, 'collection inchangée');
  assert.match(await txt(p, '#toast'), /4 cartes ajoutées au deck · 1 refusée \(règles du format\)/);
  // onglet Chercher : la zone choisie (Réserve)
  await tab(p, 'find'); await p.click('#bdTgt .seg-opt[data-v="side"]'); await p.click('#bdCtl .bd-scan-ic'); await p.waitForSelector('.scan.on');
  await scanIn([['Llanowar Elves', 1]]); await p.waitForTimeout(300);
  await p.click('.scan .dv-foot [data-act="done"]'); await p.waitForSelector('.bd-sc-sheet.open'); assert.match(await txt(p, '.bd-sc-sheet .rc-facts'), /Zone Réserve/);
  await p.click('.bd-sc-opt[data-m="take"]'); await p.click('.bd-sc-sheet [data-ok]'); await p.waitForFunction(() => !document.querySelector('.scan'), null, { timeout: 4000 });
  assert.deepEqual(await p.evaluate(() => Object.fromEntries([...BD.side.values()].map(c => [c.key, c.qty]))), { 'llanowar elves': 1 }, 'réserve');
  // rangement automatique : Sol Ring FR CMM 400 scanné alors que la collection a aussi un Sol Ring EN sans édition → c'est la ligne FR CMM qui est rangée
  await p.evaluate(() => collBump('sol ring', 'Sol Ring', 1, { lang: 'fr|cmm|400' }));
  await tab(p, 'deck'); await p.click('#bdCtl .bd-scan'); await p.waitForSelector('.scan.on');
  await p.evaluate(() => scanAdd({ key: 'sol ring', name: 'Sol Ring', score: 0.99, raw: 'Sol Ring', card: 'fr' }, 1, false));
  await p.waitForFunction(() => [...SC.items.values()].every(x => x.es !== 'load'), null, { timeout: 8000 });
  await p.evaluate(() => { const it = [...SC.items.values()][0]; scanEdApply(it, { e: 'cmm|400', es: 'man', pk: null }); scanPaintList(); });      // édition de la carte scannée (lue au scan dans la vraie appli)
  await p.click('.scan .dv-foot [data-act="done"]'); await p.waitForSelector('.bd-sc-sheet.open .bd-sc-opt');
  assert.match(await txt(p, '.bd-sc-sheet'), /rangées dans « Deck : Scan »/, 'la fiche annonce le rangement');
  await p.click('.bd-sc-opt[data-m="take"]'); await p.click('.bd-sc-sheet [data-ok]'); await p.waitForFunction(() => !document.querySelector('.scan'), null, { timeout: 4000 });
  await p.click('#bdSave'); await p.waitForFunction(() => !document.querySelector('.bd'), null, { timeout: 4000 });
  const pl = await p.evaluate(() => { const pid = Object.keys(COLL.places).find(i => COLL.places[i].t === 'deck' && COLL.places[i].n === 'Scan'); return { pid, lines: Object.fromEntries(['sol ring', 'swords to plowshares'].map(k => [k, collLines(COLL.map[k]).filter(([g]) => linePlace(g) === pid).map(([g, q]) => [g.split('#')[0], q])])) }; });
  assert.ok(pl.pid, 'emplacement « Deck : Scan » créé');
  assert.deepEqual(pl.lines, { 'sol ring': [['fr|cmm|400', 1]], 'swords to plowshares': [['en', 1]] }, 'cartes possédées rangées ; Sol Ring : l\'exemplaire scanné (FR CMM 400), pas l\'anglais');
  assert.match(await txt(p, '#toast'), /Deck créé · 2 cartes rangées dans « Deck : Scan »/);
  ok('scanner dans le deck : « Au deck », les ajouter à la collection (Annuler), les prendre dans la collection (règle des 4 exemplaires), réserve depuis Chercher ; à l\'enregistrement, rangées dans « Deck : Scan » (l\'exemplaire scanné d\'abord)');
}

/* ── F) Cartes en nombre quelconque (« A deck can have any number of cards named … ») : Relentless Rats au-delà de 4 (et du singleton), Seven Dwarves 7 au plus ── */
await newDeck(p, 'Rats', 'standard');
await p.evaluate(() => { bdChange('main', 'relentless rats', 'Relentless Rats', 1); bdChange('main', 'seven dwarves', 'Seven Dwarves', 1); });      // comme un ajout depuis « Chercher »
await tab(p, 'deck');
for (let i = 0; i < 9; i++) await step(p, 'relentless rats', 'main', 1);
assert.equal(await qty(p, 'relentless rats', 'main'), 10, 'Relentless Rats : 10 exemplaires permis en Standard');
for (let i = 0; i < 7; i++) await step(p, 'seven dwarves', 'main', 1);
assert.equal(await qty(p, 'seven dwarves', 'main'), 7, 'Seven Dwarves : 7 au plus'); assert.match(await txt(p, '#toast'), /7 exemplaires au maximum/);
assert.ok(!/exemplaires \(/.test(await tc(p, '#bdSum')), 'aucune alerte d\'exemplaires dans le résumé');
await p.click('.bd [data-act="close"]'); await p.waitForSelector('#bdLeave'); await p.click('#bdLeave'); await p.waitForFunction(() => !document.querySelector('.bd'), null, { timeout: 4000 });
await newDeck(p, 'Rats EDH', 'commander');
await p.evaluate(() => bdChange('main', 'relentless rats', 'Relentless Rats', 1)); await tab(p, 'deck');
for (let i = 0; i < 4; i++) await step(p, 'relentless rats', 'main', 1);
assert.equal(await qty(p, 'relentless rats', 'main'), 5, 'Commander : Relentless Rats échappe au singleton'); assert.ok(!/exemplaires \(/.test(await tc(p, '#bdSum')));
await p.click('.bd [data-act="close"]'); await p.waitForSelector('#bdLeave'); await p.click('#bdLeave'); await p.waitForFunction(() => !document.querySelector('.bd'), null, { timeout: 4000 });
ok('cartes en nombre quelconque : Relentless Rats au-delà de 4 (Standard) et du singleton (Commander), Seven Dwarves 7 au plus');

for (const e of errsOf) assert.deepEqual(e, [], 'erreurs page : ' + e.join(' | '));
await browser.close(); world.stop();
console.log('BUILDER E2E OK');
