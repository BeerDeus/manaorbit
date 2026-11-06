// E2E : éditeur de deck, onglet « Ajouter » (src/bdadd.js) : rangement + filtres de la collection → « Ajouter les N cartes listées » (Commander : un exemplaire,
// identité de couleur, cartes déjà présentes, pas légales signalées, réservées par un autre deck monté, confirmation au-delà de 10, Annuler) ;
// appui long → mode sélection (cases, appui court, vignette, barre du bas, Échap, glissement) → ajout global (Standard : exemplaires possédés, 4 au plus).
import './setup-env.mjs';
import assert from 'node:assert/strict';
import { chromium, startWorld, newPage, txt, ok, toHome, slug } from './e2e-world.mjs';

const world = await startWorld({ port: 18962 });
// cartes de test (faux Scryfall) : nom, couleurs, coût ; « Bulk Black Banned » interdite en Commander
const BULK = [...[1, 2, 3, 4, 5, 6].map(i => [`Bulk Red ${i}`, ['R'], 2]), ['Bulk Red Big', ['R'], 3], ...[1, 2, 3, 4, 5].map(i => [`Bulk White ${i}`, ['W'], 2]),
  ['Bulk Green 1', ['G'], 2], ['Bulk Green 2', ['G'], 2], ['Bulk Blue 1', ['U'], 2], ['Bulk Black Banned', ['B'], 2]];
BULK.forEach(([n, colors, cmc], i) => {
  world.prints[n] = [{ id: 's-' + slug(n), set: 'cmm', set_name: 'Commander Masters', collector_number: String(600 + i), name: n, cmc, type_line: 'Creature — Test', mana_cost: '{1}' + colors.map(c => `{${c}}`).join(''), colors,
    prices: { eur: '0.50' }, color_identity: colors, legalities: n.includes('Banned') ? { commander: 'banned', legacy: 'legal' } : { commander: 'legal', legacy: 'legal' }, image_uris: { small: `https://cards.scryfall.io/small/front/a/b/${slug(n)}.jpg` } }];
});
const browser = await chromium.launch({ executablePath: (process.env.CHROMIUM || '/opt/pw-browsers/chromium'), args: ['--no-sandbox'] });
const collText = ['1 Edgar Markov *EN*', '1 Sol Ring *EN*', '2 Arcane Signet *EN*', ...BULK.map(([n]) => `${n === 'Bulk Red 1' ? 6 : 1} ${n} *EN*`)].join('\n');
const seed = `try { localStorage.setItem('deckdeal:coll:v1', JSON.stringify({ t: ${JSON.stringify(collText)}, u: 1, s: '', b: null })); } catch (e) {}`;
const tc = (p, sel) => p.$eval(sel, e => e.textContent.replace(/\s+/g, ' ').trim());
const keysOf = p => p.$$eval('#bdList .bd-row', r => r.map(x => x.dataset.k));
const deckQ = p => p.evaluate(() => Object.fromEntries([...BD.main.values()].map(c => [c.key, c.qty])));
const decks = async p => { if (!(await p.$('.dks.on'))) { await toHome(p); await p.click('#btnDecks'); await p.waitForSelector('.dks.on'); } };
const newDeck = async (p, name, fmt) => {
  await decks(p); await p.click('#btnNewDeck'); await p.waitForSelector('#ndName');
  await p.fill('#ndName', name); await p.click(`#ndFmt .seg-opt[data-v="${fmt}"]`);
  await p.click('.nd-go[data-v="hand"]'); await p.waitForSelector('.bd.on'); await p.click('#bdSeg .seg-opt[data-v="deck"]');      // feuille unique ; la suite part de l'onglet Deck
};
const leave = async p => { await p.click('.bd [data-act="close"]'); await p.waitForSelector('#bdLeave'); await p.click('#bdLeave'); await p.waitForFunction(() => !document.querySelector('.bd'), null, { timeout: 4000 }); };
/** Appui long (souris : pointerdown, attente, pointerup) au milieu du nom d'une ligne ; dx : glissement pendant l'appui. */
async function press(p, k, ms = 650, dx = 0) {
  const el = await p.$(`#bdList .bd-row[data-k="${k}"] .row-name`); await el.scrollIntoViewIfNeeded();
  const b = await el.boundingBox(), x = b.x + Math.min(30, b.width / 2), y = b.y + b.height / 2;
  await p.mouse.move(x, y); await p.mouse.down();
  if (dx) await p.mouse.move(x + dx, y, { steps: 4 });
  await p.waitForTimeout(ms); await p.mouse.up(); await p.waitForTimeout(120);
}

const { p, errs } = await newPage(browser, world, { init: seed });
await p.waitForTimeout(500);
// emplacement « Classeur rouge » : les cartes de test (sauf Bulk White 5) et Arcane Signet ; un autre deck monté réserve Bulk White 1
await p.evaluate(names => {
  COLL.places = { ...COLL.places, bx1: { t: 'binder', n: 'Classeur rouge' } };
  for (const n of names) { const k = ownKey(n), q = COLL.map[k].q; collBump(k, n, q, { lang: 'en#pbx1' }); collBump(k, n, -q, { lang: 'en' }); }
  const id = newIdFor(); putDeck(id, deckDoc({ name: 'Autre deck', text: '1 Bulk White 1', opts: S.opts, history: [] })); engSet(id, 'Autre deck', '1 Bulk White 1');
}, [...BULK.map(b => b[0]).filter(n => n !== 'Bulk White 5'), 'Arcane Signet']);

/* ── A) Commander : rangement + filtre → « Ajouter les N cartes listées » ─────────────────── */
await newDeck(p, 'Bulk EDH', 'commander');
await p.click('[data-act="pick-cmdr"]'); await p.waitForSelector('.bd-row[data-k="edgar markov"]', { timeout: 8000 });
assert.equal(await p.$('#bdList .bd-bulk'), null, 'cible Commandant : pas d\'ajout groupé');
await p.click('.bd-row[data-k="edgar markov"][data-t="cmdr"] [data-d="1"]');
await p.click('#bdTgt .seg-opt[data-v="main"]');
await p.waitForFunction(() => ['bulk red 1', 'bulk black banned', 'bulk green 2', 'edgar markov'].every(k => COLL.meta[k] && typeof COLL.meta[k].ci === 'string'), null, { timeout: 15000 });
await p.fill('#bdQ', 'arcane'); await p.click('.bd-row[data-k="arcane signet"] [data-d="1"]');
assert.ok(await p.$('#bdList .bd-bulk'), 'une recherche : ajout groupé proposé');
await p.fill('#bdQ', '');
assert.equal(await p.$('#bdList .bd-bulk'), null, 'sans recherche ni filtre : pas d\'ajout groupé (toute la collection)');
assert.match(await txt(p, '#bdList'), /Appui long sur une carte : en choisir plusieurs/);
assert.equal(await tc(p, '.bd-plc b'), 'Toute la collection');
await p.click('.bd-plc'); await p.waitForSelector('.sheet .plc-opt[data-p="bx1"]');
assert.deepEqual(await p.$$eval('.sheet .plc-opt', b => b.map(x => x.querySelector('span').textContent)), ['Toute la collection', 'Non rangées', 'Classeur rouge']);
await p.click('.sheet .plc-opt[data-p="bx1"]'); await p.waitForFunction(() => !document.querySelector('.sheet-wrap'), null, { timeout: 3000 });
assert.equal(await tc(p, '.bd-plc b'), 'Classeur rouge');
let ks = await keysOf(p);
assert.equal(ks.length, 16, 'rangement : les 16 cartes du classeur'); assert.ok(!ks.includes('bulk white 5') && !ks.includes('sol ring'), 'rien d\'autre');
await p.click('#bdF .fbtn'); await p.click('#bdF .fpanel [data-m="2"]'); await p.waitForTimeout(250);
ks = await keysOf(p); assert.equal(ks.length, 15, 'coût 2 : Bulk Red Big écartée'); assert.ok(!ks.includes('bulk red big'));
assert.match(await tc(p, '#bdList .bd-bulk'), /15 cartes listées.*Un exemplaire de chaque/);
assert.equal(await tc(p, '#bdList .bd-bulk .btn'), 'Ajouter les 15 cartes listées');
assert.match(await tc(p, '.bd-row[data-k="bulk black banned"] .row-meta'), /Pas légale en Commander/, 'carte interdite signalée sur sa ligne');
await p.click('#bdF .fbtn');      // panneau refermé
ok('Commander : rangement (feuille, emplacement du classeur) + filtre « Coût 2 » de la collection → 15 cartes listées, interdite signalée');

await p.click('#bdList [data-act="bulk"]'); await p.waitForSelector('.bd-bk-sheet.open [data-ok]');
const sheet = await txt(p, '.bd-bk-sheet');
assert.match(await txt(p, '.bd-bk-sheet h2'), /^Ajouter 11 cartes au deck$/, '6 rouges + 4 blanches + l\'interdite (noire, dans RWB) = 11 > 10 : confirmation');
assert.match(sheet, /Cartes différentes 11/); assert.match(sheet, /Déjà dans le deck : ignorées 1/); assert.match(sheet, /Hors de l'identité de couleur : écartées 3/);
assert.match(sheet, /Pas légale en Commander, ajoutée quand même : Bulk Black Banned/);
assert.match(sheet, /Bulk White 1 : ton exemplaire est dans « Autre deck »\. À y reprendre quand tu joueras ce deck, ou à acheter\./, 'réservée ailleurs : le message de l\'ajout à l\'unité');
await p.click('.bd-bk-sheet .sheet-foot [data-close]'); await p.waitForFunction(() => !document.querySelector('.sheet-wrap'), null, { timeout: 3000 });
assert.deepEqual(await deckQ(p), { 'arcane signet': 1 }, 'Retour : rien d\'ajouté');
await p.click('#bdList [data-act="bulk"]'); await p.waitForSelector('.bd-bk-sheet.open [data-ok]'); await p.click('.bd-bk-sheet [data-ok]');
await p.waitForFunction(() => !document.querySelector('.sheet-wrap'), null, { timeout: 3000 });
const dq = await deckQ(p);
assert.equal(Object.keys(dq).length, 12); assert.ok(Object.values(dq).every(q => q === 1), 'un exemplaire de chaque (Bulk Red 1 : 6 possédées)');
assert.ok(!dq['bulk green 1'] && !dq['bulk blue 1'], 'hors de l\'identité : écartées'); assert.ok(dq['bulk black banned'] && dq['bulk white 1']);
assert.match(await txt(p, '#toast'), /^11 cartes ajoutées · 4 laissées de côté Annuler$/, 'après la feuille (qui a tout détaillé) : message court, avec Annuler');
assert.match(await txt(p, '#bdSum'), /Bulk Black Banned n'est pas légale en Commander/, 'alerte du résumé');
assert.match(await txt(p, '#bdSub'), /13\/100/);
await p.click('#toast .toast-act'); await p.waitForTimeout(200);
assert.deepEqual(await deckQ(p), { 'arcane signet': 1 }, 'Annuler : deck d\'avant'); assert.match(await txt(p, '#bdSub'), /2\/100/);
ok('Commander : feuille de confirmation au-delà de 10 (déjà présentes, identité, interdite, réservée ailleurs), Retour, ajout, message, Annuler');
// 10 au plus : sans confirmation ; rien à ajouter : message
await p.click('#bdF .fbtn'); await p.click('#bdF .fpanel .fcol[data-c="W"]'); await p.click('#bdF .fbtn'); await p.waitForTimeout(200);
assert.equal((await keysOf(p)).length, 4, 'blanches du classeur');
await p.click('#bdList [data-act="bulk"]'); await p.waitForTimeout(250);
assert.equal(await p.$('.sheet-wrap'), null, '4 cartes : pas de confirmation'); assert.match(await txt(p, '#toast'), /^4 cartes ajoutées · Bulk White 1 : ton exemplaire est dans « Autre deck »\. À y reprendre quand tu joueras ce deck, ou à acheter\. Annuler$/, 'sans feuille : le message de l\'ajout à l\'unité pour la carte réservée ailleurs');
await p.click('#bdList [data-act="bulk"]'); await p.waitForTimeout(250);
assert.match(await txt(p, '#toast'), /^Aucune carte à ajouter · 4 déjà dans le deck/);
await leave(p);
ok('Commander : 10 au plus ajoutées sans confirmation ; « Aucune carte à ajouter » quand tout est déjà là');

/* ── B) Standard : appui long → sélection → ajout global ───────────────────────────────────── */
await newDeck(p, 'Bulk 60', 'standard');
await p.click('#bdSeg .seg-opt[data-v="coll"]'); await p.waitForTimeout(100);
assert.equal(await tc(p, '.bd-plc b'), 'Toute la collection', 'nouveau deck : filtres remis à zéro');
await p.fill('#bdQ', 'bulk'); await p.waitForSelector('#bdList .bd-row[data-k="bulk red 1"]');
await press(p, 'bulk red 1', 650, 30);
assert.equal(await p.$('.bd.selecting'), null, 'glissement pendant l\'appui (défilement) : pas de sélection');
await press(p, 'bulk red 1', 200);
assert.equal(await p.$('.bd.selecting'), null, 'appui court : pas de sélection');
await press(p, 'bulk red 1');
assert.ok(await p.$('.bd.selecting'), 'appui long : mode sélection');
assert.equal(await p.getAttribute('.bd-row[data-k="bulk red 1"]', 'aria-checked'), 'true', 'la carte appuyée est cochée (le clic qui suit ne la décoche pas)');
assert.equal(await p.$('#bdList .bd-row .qstep'), null, 'cases à cocher à la place de − / +'); assert.equal(await p.$('#bdList .bd-bulk'), null);
assert.equal(await txt(p, '#bdSelBar .bd-sel-n'), '1 sélectionnée'); assert.equal(await txt(p, '#bdSelBar [data-act="sel-add"]'), 'Ajouter 1 carte');
await p.click('.bd-row[data-k="bulk white 2"]'); await p.click('.bd-row[data-k="bulk white 1"]');
await p.click('.bd-row[data-k="bulk green 1"] .thumb'); await p.waitForTimeout(150);
assert.equal(await p.$('.imgv'), null, 'mode sélection : la vignette coche, elle n\'agrandit pas');
await p.click('.bd-row[data-k="bulk blue 1"]'); await p.click('.bd-row[data-k="bulk blue 1"]');
assert.deepEqual((await p.$$eval('.bd-row.bd-pick.on', r => r.map(x => x.dataset.k))).sort(), ['bulk green 1', 'bulk red 1', 'bulk white 1', 'bulk white 2'], 'appui court : coche, décoche');
assert.equal(await txt(p, '#bdSelBar [data-act="sel-add"]'), 'Ajouter 4 cartes');
await p.click('#bdSelBar [data-act="sel-add"]'); await p.waitForTimeout(250);
assert.equal(await p.$('.sheet-wrap'), null, '7 exemplaires : pas de confirmation');
assert.deepEqual(await deckQ(p), { 'bulk red 1': 4, 'bulk white 2': 1, 'bulk white 1': 1, 'bulk green 1': 1 }, 'Standard : exemplaires possédés, 4 au plus');
assert.match(await txt(p, '#toast'), /^7 cartes ajoutées · Bulk White 1 : ton exemplaire est dans « Autre deck »/);
assert.equal(await p.$('.bd.selecting'), null, 'sélection finie après l\'ajout'); assert.equal(await p.isVisible('#bdSelBar'), false);
assert.ok(!/Appui long sur une carte/.test(await txt(p, '#bdList')), 'astuce cachée une fois l\'appui long utilisé');
ok('Standard : appui long (pas sur un glissement ni un appui court) → cases, appui court coche / décoche, vignette comprise, barre « Ajouter N cartes » → ajout global (4 au plus, réservée signalée)');
// Échap et Annuler sortent du mode ; un toucher sur la vignette agrandit de nouveau
await press(p, 'bulk white 3'); assert.ok(await p.$('.bd.selecting'));
await p.keyboard.press('Escape'); await p.waitForTimeout(150);
assert.equal(await p.$('.bd.selecting'), null, 'Échap : fin de la sélection'); assert.ok(await p.$('.bd.on'), 'l\'éditeur reste ouvert');
await press(p, 'bulk white 3'); assert.equal(await p.evaluate(() => backClose()), true);
assert.equal(await p.$('.bd.selecting'), null, 'bouton Retour du téléphone : fin de la sélection'); assert.ok(await p.$('.bd.on'), 'l\'éditeur reste ouvert');
await press(p, 'bulk white 3'); await p.click('#bdSelBar [data-act="sel-cancel"]'); await p.waitForTimeout(150);
assert.equal(await p.$('.bd.selecting'), null, 'Annuler : fin de la sélection'); assert.deepEqual(Object.keys(await deckQ(p)).length, 4, 'rien d\'ajouté');
await p.click('.bd-row[data-k="bulk white 3"] .thumb'); await p.waitForSelector('.imgv', { timeout: 4000 });
await p.keyboard.press('Escape'); await p.waitForTimeout(300);
// dernière case décochée : fin du mode ; Réserve : 15 au plus
await press(p, 'bulk white 3'); await p.click('.bd-row[data-k="bulk white 3"]'); await p.waitForTimeout(100);
assert.equal(await p.$('.bd.selecting'), null, 'plus rien de coché : fin de la sélection');
await p.click('#bdTgt .seg-opt[data-v="side"]');
await p.evaluate(() => { for (let i = 0; i < 14; i++) BD.side.set('x' + i, { key: 'x' + i, name: 'X' + i, qty: 1 }); bdPaint(); });
await press(p, 'bulk red 2'); await p.click('.bd-row[data-k="bulk red 3"]'); await p.click('#bdSelBar [data-act="sel-add"]'); await p.waitForTimeout(250);
assert.match(await txt(p, '#toast'), /^1 carte ajoutée · 1 refusée \(réserve pleine\)/, 'réserve : 15 au plus');
await leave(p);
ok('Échap, Annuler, dernière case décochée : fin du mode sélection ; vignette agrandie hors du mode ; réserve pleine');

assert.deepEqual(errs, [], 'erreurs page : ' + errs.join(' | '));
await browser.close(); world.stop();
console.log('BDADD E2E OK');
