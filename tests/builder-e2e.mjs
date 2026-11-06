// E2E : créateur de deck « + » (Standard / Commander), collection d'abord, réserve, règles, montage automatique, modification.
import './setup-env.mjs';
import assert from 'node:assert/strict';
import { chromium, startWorld, newPage, txt, ok, toInput, toHome } from './e2e-world.mjs';

const world = await startWorld({ port: 18960 });
const browser = await chromium.launch({ executablePath: (process.env.CHROMIUM || '/opt/pw-browsers/chromium'), args: ['--no-sandbox'] });
const seed = collText => `try { localStorage.setItem('deckdeal:coll:v1', JSON.stringify({ t: ${JSON.stringify(collText)}, u: 1, s: '', b: null })); } catch (e) {}`;
const tc = (p, sel) => p.$eval(sel, e => e.textContent.replace(/\s+/g, ' ').trim());
const norm = t => String(t).replace(/\s+/g, ' ').trim();
const errsOf = [];
const step = (p, k, tgt, d) => p.click(`.bd-row[data-k="${k}"][data-t="${tgt}"] [data-d="${d}"]`);
const tab = async (p, v) => { await p.click(`#bdSeg .seg-opt[data-v="${v}"]`); await p.waitForTimeout(80); };
const qty = (p, k, tgt) => p.$eval(`.bd-row[data-k="${k}"][data-t="${tgt}"] .qstep b`, e => Number(e.textContent));
const decks = async p => { if (!(await p.$('.dks.on'))) { await toHome(p); await p.click('#btnDecks'); await p.waitForSelector('.dks.on'); } };      // écran « Mes decks » (bouton de l'accueil)
const newDeck = async (p, name, fmt) => {
  await decks(p); await p.click('#btnNewDeck'); await p.waitForSelector('#ndName');
  await p.fill('#ndName', name); await p.click(`#ndFmt .seg-opt[data-v="${fmt}"]`);
  await p.click('.nd-go[data-v="hand"]'); await p.waitForSelector('.bd.on');      // une seule feuille (nom, format, départ) : « À la main » ouvre l'éditeur sur « Ajouter »
  assert.deepEqual(await p.evaluate(() => [BD.tab, BD.tgt]), ['coll', fmt === 'commander' ? 'cmdr' : 'main'], 'À la main : onglet Ajouter, cible Commandant tant qu\'il n\'y en a pas');
  await p.click('#bdSeg .seg-opt[data-v="deck"]');      // la suite des scénarios part de l'onglet Deck
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
await step(p, 'edgar markov', 'cmdr', 1); assert.deepEqual(await p.evaluate(() => BD.cmdr.map(c => c.key)), ['edgar markov']);
await p.waitForFunction(() => BD.tgt === 'main' && document.querySelector('#bdTgt') && document.querySelector('#bdTgt')._v === 'main'); assert.match(await txt(p, '#toast'), /Commandant choisi/, 'commandant choisi : la cible passe seule sur Deck (la carte suivante n\'est pas un 2e commandant)');
assert.match(await txt(p, '#bdSub'), /1\/100/); assert.equal(await p.$eval('#bdSave', b => b.disabled), false);
ok('Commander : + → nom/format, commandant obligatoire (collection filtrée sur les commandants possibles)');

await p.click('#bdTgt .seg-opt[data-v="main"]');
await p.fill('#bdQ', 'sol'); assert.deepEqual(await p.$$eval('.bd-row', r => r.map(x => x.dataset.k)), ['sol ring'], 'recherche dans la collection');
await step(p, 'sol ring', 'main', 1); assert.equal(await qty(p, 'sol ring', 'main'), 1);
await step(p, 'sol ring', 'main', 1); assert.equal(await qty(p, 'sol ring', 'main'), 1, 'singleton : 2e exemplaire refusé'); assert.match(await txt(p, '#toast'), /un seul exemplaire/);
await p.fill('#bdQ', 'arcane'); await step(p, 'arcane signet', 'main', 1); await step(p, 'arcane signet', 'main', 1); assert.equal(await qty(p, 'arcane signet', 'main'), 1);
await p.fill('#bdQ', '');      // onglet « Ajouter » : la même recherche trouve ensuite toutes les cartes Magic (à acheter), après celles de la collection
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
assert.equal(await p.$eval('#toast', t => t.firstChild.textContent), 'Deck créé · incomplet', 'rien de réservé d\'office');
assert.equal(await txt(p, '#toast .toast-act'), 'Réserver mes 3 cartes', 'le toast propose de réserver : Edgar + Sol Ring + Signet');
assert.equal(await p.evaluate(() => engIsOn(allDecks()[0].id)), false, 'deck enregistré sans réservation');
await p.click('#toast .toast-act'); await p.waitForFunction(() => /Deck monté : cartes réservées/.test(document.querySelector('#toast').textContent));
const dk = await p.evaluate(() => { const d = allDecks()[0]; return { id: d.id, name: d.name, text: d.text, cards: d.cards, eng: XS.eng[d.id] && XS.eng[d.id].q }; });
assert.equal(dk.name, 'Vampires Boros v1'); assert.match(dk.text, /^\/\/ Deck Deal : commander\nCommander\n1 Edgar Markov\n\nDeck\n/); assert.deepEqual(dk.eng, { 'edgar markov': 1, 'sol ring': 1, 'arcane signet': 1 });
assert.equal(dk.cards, 5, 'Edgar + Sol Ring + Signet + Craterhoof + Wrath (terrains de base à part)');
assert.match(await txt(p, '#deckList'), /Vampires Boros v1/); assert.match(await txt(p, '#deckList'), /8\/100 cartes · .* · monté/, 'exemplaires comptés comme le viewer (5 cartes + 3 terrains de base), « monté »');
ok('Commander : enregistré (texte lisible par l\'app) sans réservation, « Réserver mes 3 cartes » dans le toast (deck monté), incomplet autorisé');

/* ── B) Standard : 4 exemplaires, réserve facultative, cartes engagées ailleurs ───────────── */
await newDeck(p, 'Burn', 'standard');
assert.match(await txt(p, '#bdSub'), /Standard · 0\/60/); assert.match(await txt(p, '#bdSum'), /0\s*\/ 15 en réserve/);
await tab(p, 'coll'); assert.equal(await p.$eval('#bdTgt', e => e._v), 'main');
assert.deepEqual(await p.$$eval('#bdTgt .seg-opt', b => b.map(x => x.dataset.v)), ['main', 'side'], 'Standard : Deck | Réserve');
await p.fill('#bdQ', 'sol'); assert.match(await tc(p, '.bd-row[data-k="sol ring"] .row-meta'), /1 engagée dans « Vampires Boros v1 »/, 'Sol Ring est monté dans le deck Commander (son nom affiché)');
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
assert.equal(await txt(p, '#toast .toast-act'), 'Réserver mes 3 cartes'); await p.click('#toast .toast-act');      // Signet × 2 + Swords (réserve comprise)
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
  assert.match(await txt(p, '#dkVal'), /≈ 1,60\s*€ valeur estimée · Standard · prix du jour \(impression la moins chère\) de 1 carte sur 1/, 'deck monté : valeur affichée quand même');
  assert.equal(await p.evaluate(() => engIsOn(allDecks().find(d => d.name === 'Burn').id)), true);
  await p.keyboard.press('Escape'); await p.waitForFunction(() => !document.querySelector('.sheet-wrap'), null, { timeout: 3000 });
  // image en grand depuis l'éditeur
  await p.click('.deck:has-text("Vampires") [data-act="open"]'); await p.waitForSelector('.dv.on [data-act="builder"]'); await p.click('.dv.on [data-act="builder"]'); await p.waitForSelector('.bd.on');
  await p.waitForSelector('.bd-row[data-k="craterhoof behemoth"] .thumb img.ok', { timeout: 10000 });
  assert.match(await txt(p, '#bdSum'), /≈ \d/, 'valeur estimée dans le résumé de l\'éditeur');
  // même deck, même chiffre : en-tête de l'éditeur, coach (dwProfile), Mes decks, viewer (estimation) ; relevé du jour (impression la moins chère) prioritaire sur la tendance de la fiche
  const val0 = await tc(p, '#bdSum .bd-val');
  const want = await p.evaluate(() => {
    window.__pxt0 = PXT; PXT = { t: Date.now(), at: '2026-11-05', map: new Map([['sol ring', { e: 90, u: 0 }], ['craterhoof behemoth', { e: 2345, u: 0 }], ['edgar markov', { e: 777, u: 0 }]]) }; pxRepaint();
    return ('≈ ' + fmt(90 + 2345 + 777 + dmOf('arcane signet').eu, mkCur())).replace(/\s+/g, ' ');      // Arcane Signet absente du relevé : tendance de sa fiche ; commandant compris
  });
  const head = await tc(p, '#bdSum .bd-val'); assert.notEqual(head, val0, 'le relevé du jour change la valeur'); assert.equal(head, want, 'en-tête : relevé du jour, sinon fiche');
  assert.equal(await p.evaluate(() => ('≈ ' + fmt(dwProfile().cents, mkCur())).replace(/\s+/g, ' ')), head, 'coach : le même total que l\'en-tête');
  assert.equal(await p.getAttribute('#bdSum .bd-val', 'title'), 'Prix du jour de l\'impression la moins chère (comme le coach), cartes possédées comprises, terrains de base exclus');
  await p.click('.bd-row[data-k="craterhoof behemoth"] .thumb'); await p.waitForSelector('.imgv', { timeout: 4000 });
  assert.match(await txt(p, '.imgv'), /Craterhoof Behemoth/, 'image de la carte en grand'); await p.keyboard.press('Escape'); await p.waitForTimeout(400);
  await p.click('.bd [data-act="close"]'); await p.waitForFunction(() => !document.querySelector('.bd'), null, { timeout: 3000 });
  if (await p.$('.dvw.on')) { await p.keyboard.press('Escape'); await p.waitForFunction(() => !document.querySelector('.dvw.on'), null, { timeout: 3000 }); }
  await decks(p);
  const vamp = () => p.evaluate(() => { const d = [...document.querySelectorAll('.deck')].find(x => /Vampires/.test(x.querySelector('.deck-name').textContent)); const m = /≈ [^·]+/.exec(d.querySelector('.deck-line').textContent); return m ? m[0].replace(/\s+/g, ' ').trim() : ''; });
  await p.waitForFunction(w => [...document.querySelectorAll('.deck')].some(x => /Vampires/.test(x.textContent) && x.querySelector('.deck-line').textContent.replace(/\s+/g, ' ').includes(w.replace(/\s+/g, ' '))), head, { timeout: 5000 });
  assert.equal(await vamp(), head, 'Mes decks : le même chiffre que l\'en-tête');
  assert.equal(await p.$eval('.deck:has-text("Vampires") .deck-line span[title]', e => e.title), 'Valeur estimée : prix du jour de l\'impression la moins chère');
  await p.click('.deck:has-text("Vampires") [data-act="open"]'); await p.waitForSelector('.dvw.on .dv-amt');
  await p.waitForFunction(() => !document.querySelector('.dv-amt[data-tw]'), null, { timeout: 8000 });
  assert.equal(norm(await tc(p, '.dvw.on .dv-eur')), head, 'viewer (valeur estimée) : le même chiffre'); assert.match(await tc(p, '.dvw.on .dv-crit'), /Valeur estimée · prix du jour de l'impression la moins chère/);
  await p.keyboard.press('Escape'); await p.waitForFunction(() => !document.querySelector('.dvw.on'), null, { timeout: 3000 });
  await p.evaluate(() => { PXT = window.__pxt0; pxRepaint(); });
  ok('format à côté du nom, valeur estimée même pour un deck monté (liste, feuille, éditeur), vignette → image en grand');
  ok('même deck, même valeur estimée (relevé du jour, sinon fiche) : en-tête de l\'éditeur, coach, Mes decks, viewer');
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
  assert.equal(await txt(p, '#bdCtl .bd-scan'), 'Scanner le deck', 'bouton dans l\'onglet Deck');
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
  await tab(p, 'coll'); await p.click('#bdTgt .seg-opt[data-v="side"]'); await p.click('#bdCtl .bd-scan-ic'); await p.waitForSelector('.scan.on');
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

/* ── G) Compagnon (section « Companion ») et double face terrain : même compte dans Mes decks, le viewer et l'éditeur ; le compagnon reste après un enregistrement depuis l'éditeur ── */
{
  const mk = (n, tl, eur, ci) => [{ id: 's-' + n.toLowerCase().replace(/[^a-z]+/g, '-'), set: 'znr', set_name: 'Zendikar Rising', collector_number: '1', name: n, cmc: 3, type_line: tl, mana_cost: '{2}{R}', colors: ['R'], color_identity: ci, prices: { eur, usd: eur }, legalities: { commander: 'legal' }, image_uris: { small: 'https://cards.scryfall.io/small/front/a/b/' + n.length + '.jpg' } }];
  world.prints['Jegantha, the Wellspring'] = mk('Jegantha, the Wellspring', 'Legendary Creature — Elemental Elk', '2.00', ['R', 'G']);
  world.prints['Valakut Awakening // Valakut Stoneforge'] = mk('Valakut Awakening // Valakut Stoneforge', 'Instant // Land', '3.00', ['R']);
  const T0 = 'Commander\n1 Edgar Markov\n\nCompanion\n1 Jegantha, the Wellspring\n\nDeck\n1 Sol Ring\n1 Arcane Signet\n1 Valakut Awakening // Valakut Stoneforge\n96 Plains';
  await p.evaluate(t => putDeck('dk-comp', deckDoc({ name: 'Edgar compagnon', text: t, opts: { ...S.opts } })), T0);
  await toHome(p); await decks(p);
  const line = () => p.evaluate(() => [...document.querySelectorAll('.deck')].find(d => d.querySelector('.deck-name').textContent === 'Edgar compagnon').querySelector('.deck-line').textContent.replace(/\s+/g, ' '));
  assert.match(await line(), /^100\/100 cartes/, 'Mes decks : 100/100 (compagnon hors des 100 cartes), pas 101/100');
  await p.click('.deck:has-text("Edgar compagnon") [data-act="open"]'); await p.waitForSelector('.dvw.on .dv-title span');
  await p.waitForFunction(() => /dont 1 double face/.test((document.querySelector('.dvw.on .dv-g[data-g="land"] h3') || {}).textContent || ''), null, { timeout: 10000 });
  assert.match(await tc(p, '.dvw.on .dv-title span'), /^100 cartes · .*réserve 1$/, 'viewer : 100 cartes, le compagnon dans la réserve');
  assert.match(await tc(p, '.dvw.on .dv-g[data-g="land"] h3'), /Terrains ?97 cartes · dont 1 double face/, 'viewer : la double face avec les terrains, annoncée');
  assert.match(await tc(p, '.dvw.on .dv-g[data-g="sb"]'), /Jegantha/, 'compagnon : groupe Réserve');
  await p.click('.dvw.on [data-act="hand"]'); await p.waitForSelector('.sheet .hand-grid');
  assert.match(await tc(p, '.sheet'), /99 cartes dans la bibliothèque · 97 terrains \(dont 1 double face\)/, 'main de départ : le même compte que le viewer');
  await p.keyboard.press('Escape'); await p.waitForFunction(() => !document.querySelector('.sheet .hand-grid'), null, { timeout: 3000 });
  await p.click('.dvw.on [data-act="builder"]'); await p.waitForSelector('.bd.on');
  assert.match(await txt(p, '#bdSub'), /Commander · 100\/100/, 'éditeur : 100/100, comme Mes decks et le viewer');
  await p.waitForFunction(() => /Deck complet et conforme/.test(document.querySelector('#bdSum').textContent), null, { timeout: 8000 });
  assert.ok(await p.$('.bd-row[data-k="jegantha the wellspring"][data-t="comp"]'), 'section Compagnon de l\'éditeur'); assert.match(await tc(p, '.bd'), /Compagnon hors des 100 cartes/);
  assert.deepEqual(await p.evaluate(() => { const r = dwProfile(); return [r.land, r.mdfc]; }), [97, 1], 'coach : 97 terrains dont 1 double face, comme le viewer');
  await step(p, 'jegantha the wellspring', 'comp', 1); assert.match(await txt(p, '#toast'), /Un seul compagnon/);
  const val = await p.evaluate(t => ({ without: dkValueText(dkEst(t.replace('Companion\n1 Jegantha, the Wellspring\n\n', ''))), withJ: dkValueText(dkEst(t.replace('Companion\n1 Jegantha, the Wellspring\n\nDeck\n', 'Deck\n1 Jegantha, the Wellspring\n'))) }), T0);
  assert.notEqual(val.without, val.withJ); assert.equal(norm(await tc(p, '#bdSum .bd-val')), norm(val.without), 'valeur de l\'éditeur : sans le compagnon');
  await step(p, 'plains', 'main', -1); await step(p, 'plains', 'main', 1);
  await p.click('#bdSave'); await p.waitForFunction(() => !document.querySelector('.bd'), null, { timeout: 4000 });
  const saved = await p.evaluate(() => findDeck('dk-comp').text);
  assert.match(saved, /\nCommander\n1 Edgar Markov\n\nCompanion\n1 Jegantha, the Wellspring\n\nDeck\n/, 'enregistré depuis l\'éditeur : le compagnon est gardé');
  if (await p.$('.dvw.on')) { await p.keyboard.press('Escape'); await p.waitForFunction(() => !document.querySelector('.dvw.on'), null, { timeout: 3000 }); }
  await decks(p);
  await p.waitForFunction(v => [...document.querySelectorAll('.deck')].some(d => d.querySelector('.deck-name').textContent === 'Edgar compagnon' && d.querySelector('.deck-line').textContent.replace(/\s+/g, ' ').includes(v.replace(/\s+/g, ' '))), val.without, { timeout: 5000 });
  assert.match(await line(), /^100\/100 cartes/, 'Mes decks après l\'enregistrement : toujours 100/100');
  ok('compagnon : 100/100 dans Mes decks, le viewer et l\'éditeur, valeur sans lui, gardé à l\'enregistrement depuis l\'éditeur ; double face terrain : comptée et annoncée dans le viewer, la main de départ et le coach');
}

/* ── H) Une seule règle « possédée / à acheter » (extras.js › ownFor) : un seul Sol Ring, monté dans « Deck A », ouvert dans le deck B ─── */
{
  await p.evaluate(() => { if (!collQty('sol ring')) collBump('sol ring', 'Sol Ring', 1); for (let i = 0; i < 20 && collQty('sol ring') > 1; i++) collBump('sol ring', 'Sol Ring', -1, { lang: collLines(COLL.map['sol ring']).find(x => x[1] > 0)[0] }); XS.eng = { deckA: { n: 'Deck A', at: Date.now(), q: { 'sol ring': 1 } } }; engApplied(); });      // un seul exemplaire (les scans de E en ont ajouté, dans plusieurs langues)
  assert.deepEqual(await p.evaluate(() => { const o = ownFor('sol ring', 'autre'); return [o.own, o.free, o.held, o.decks.map(d => d.n)]; }), [1, 0, 1, ['Deck A']], 'ownFor : 1 possédé, 0 libre, 1 engagé dans « Deck A »');
  assert.equal(await p.evaluate(() => ownFor('sol ring', 'deckA').free), 1, 'le deck A garde ses propres exemplaires');
  const same = async when => {      // éditeur (pastille et prix de ce qui manque), coach (dwProfile().buy), vues en images : la même quantité à acheter
    const row = await tc(p, '.bd-row[data-k="sol ring"][data-t="main"] .row-meta');
    assert.ok(!/Possédée/.test(row), when + ' : plus « Possédée » (avant : possédée + engagée)'); assert.match(row, /À acheter · /, when + ' : à acheter, avec son prix');
    assert.match(row, /1 engagée dans « Deck A »/, when + ' : l\'information « engagée dans A » reste');
    const c = await p.evaluate(() => { const u = dkPx('sol ring'), it = bdViewItems().find(x => x.key === 'sol ring'); return { buy: dwProfile().buy, u, f: fmt(dwProfile().buy, mkCur()), ow: it.ow, own: it.own, held: it.held }; });
    assert.ok(c.u > 0, 'Sol Ring a un prix'); assert.equal(c.buy, c.u, when + ' : coach, dont 1 Sol Ring à acheter (avant : 0 €)');
    assert.ok(row.replace(/\s+/g, ' ').includes(c.f.replace(/\s+/g, ' ')), when + ' : le prix de la pastille = « dont … à acheter » du coach');
    assert.deepEqual([c.ow, c.own, c.held], [0, 1, '1 engagée dans « Deck A »'], when + ' : vues en images : 0 libre, 1 possédé, engagé dit');
  };
  await newDeck(p, 'Deck B', 'commander');
  await p.evaluate(() => { bdChange('cmdr', 'edgar markov', 'Edgar Markov', 1); bdChange('main', 'sol ring', 'Sol Ring', 1); }); await tab(p, 'deck');
  await same('nouveau deck B');
  await p.click('#bdSave'); await p.waitForFunction(() => !document.querySelector('.bd'), null, { timeout: 4000 });
  const idB = await p.evaluate(() => allDecks().find(d => d.name === 'Deck B').id);
  await p.click('.deck:has-text("Deck B") [data-act="open"]'); await p.waitForSelector('.dv.on [data-act="builder"]');
  await p.waitForFunction(() => DV.el && /à trouver|toutes possédées/.test(DV.el.querySelector('.dv-title span').textContent), null, { timeout: 8000 });
  assert.match(await p.evaluate(() => DV.el.querySelector('.dv-title span').textContent), /2 cartes · 1 à trouver/, 'viewer : 1 à trouver (Sol Ring), Edgar possédé');
  assert.deepEqual(await p.evaluate(() => dvMissing()), [{ n: 'Sol Ring', q: 1 }], 'viewer : manquantes = Sol Ring × 1');
  await p.click('.dv.on [data-act="builder"]'); await p.waitForSelector('.bd.on'); assert.equal(await p.evaluate(() => BD.id), idB);
  await same('deck B enregistré, rouvert');
  await p.evaluate(() => { const x = { ...XS.eng }; delete x.deckA; XS.eng = x; engApplied(); bdPaint(); });      // A démonté : tout redevient possédé, partout
  await p.waitForTimeout(150);
  assert.match(await tc(p, '.bd-row[data-k="sol ring"][data-t="main"] .row-meta'), /Possédée/); assert.equal(await p.evaluate(() => dwProfile().buy), 0, 'coach : rien à acheter');
  await p.click('.bd [data-act="close"]'); await p.waitForFunction(() => !document.querySelector('.bd'), null, { timeout: 4000 });
  if (await p.$('.dv.on')) assert.deepEqual(await p.evaluate(() => dvMissing()), [], 'viewer : plus rien à trouver');
  ok('une seule règle : un Sol Ring monté dans A, ouvert dans B → éditeur « À acheter · prix » + « 1 engagée dans « Deck A » », coach « dont … à acheter », viewer « 1 à trouver » ; A démonté : possédée partout');
}

for (const e of errsOf) assert.deepEqual(e, [], 'erreurs page : ' + e.join(' | '));
await browser.close(); world.stop();
console.log('BUILDER E2E OK');
