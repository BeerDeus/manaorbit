// E2E « Où trouver mes cartes » et « De ta collection pour ce deck » (viewer d'un deck ; deckfind.js, places.js › plcFetchSheet) ; viewer et éditeur sur deux colonnes (ordinateur).
// Le bouton sur chaque type de deck (Mes decks et sa feuille ⋯, À monter EDHREC, Communauté, deck reçu par un lien, Prix d'une liste) ; feuille d'un deck non enregistré
// (ni « Monter le deck » ni rien d'écrit, manquantes) ; section : fichier EDHREC lu seulement à son ouverture, taux d'inclusion, identité de couleur, proxys exclus,
// cartes du deck exclues, emplacement, réservée par un autre deck monté, « + au deck » (et Annuler), deck non enregistré (enregistré avec la carte), « Voir plus »,
// peu de decks, Standard sans section, temps de calcul ; ordinateur 1 280 et 1 890 px : colonnes du viewer et de l'éditeur (positions).
// Faux edh.tsv et fausse liste /api/pubdecks servis par des routes Playwright. Captures : DF_SHOTS=<dossier>.
import './setup-env.mjs';
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { chromium, startWorld, newPage, txt, ok, toInput, done, signInFake, closeSheets } from './e2e-world.mjs';

const SHOTS = process.env.DF_SHOTS || ''; if (SHOTS) mkdirSync(SHOTS, { recursive: true });
const world = await startWorld({ port: 19830 });
const browser = await chromium.launch({ executablePath: (process.env.CHROMIUM || '/opt/pw-browsers/chromium'), args: ['--no-sandbox'] });

/* Fichier EDHREC : 10 decks d'Edgar Markov (WBR) et 3 de Craterhoof (G).
   Edgar : Sol Ring et Command Tower partout, Arcane Signet 8, Swords 6, Wrath 5, Llanowar Elves 7 (vert : hors identité), Ranger's Hawk 9 (proxy seulement), Craterhoof 2 (vert),
   Shared 0 à 34 dans les 10 (cartes inconnues de Scryfall : identité inconnue, gardées). */
const fill = (n, w) => Array.from({ length: n }, (_, i) => `K\t1\t${w} ${i}`);
const edgar = i => ['D\tedgar-markov\t' + (i ? 'archidekt\tDeck ' + i + '\thttps://archidekt.com/decks/' + (100 + i) : 'edhrec\tDeck moyen\thttps://edhrec.com/average-decks/edgar-markov'), 'K\t1\tSol Ring', 'K\t1\tCommand Tower',
  ...(i < 8 ? ['K\t1\tArcane Signet'] : []), ...(i < 6 ? ['K\t1\tSwords to Plowshares'] : []), ...(i < 5 ? ['K\t1\tWrath of God'] : []), ...(i < 7 ? ['K\t1\tLlanowar Elves'] : []),
  ...(i < 9 ? ["K\t1\tRanger's Hawk"] : []), ...(i < 2 ? ['K\t1\tCraterhoof Behemoth'] : []), ...fill(35, 'Shared'), ...fill(5, 'Own ' + i), 'K\t30\tPlains'];
const hoof = i => ['D\tcraterhoof-behemoth\tarchidekt\tHoof ' + i + '\thttps://archidekt.com/decks/' + (200 + i), 'K\t1\tLlanowar Elves', 'K\t1\tSol Ring', ...fill(22, 'Hoof ' + i)];
const FILE = ['#edh\t1\t2026-10-03T04:00:00Z', 'C\tedgar-markov\t12345\tWBR\tEdgar Markov', 'C\tcraterhoof-behemoth\t100\tG\tCraterhoof Behemoth',
  ...[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].flatMap(edgar), ...[0, 1, 2].flatMap(hoof),
  'P\t150\tSol Ring', 'P\t40\tArcane Signet', 'P\t190\tSwords to Plowshares', 'P\t150\tWrath of God', 'P\t500\tEdgar Markov'].join('\n') + '\n';
const BOB = { id: 'b'.repeat(64) + '_0', by: 'Bob', cmd: ['Edgar Markov'], ci: 'WBR', cards: [['Sol Ring', 1], ['Wrath of God', 1], ...Array.from({ length: 24 }, (_, i) => ['Bob Card ' + i, 1]), ['Plains', 73]], u: '2026-10-08' };
const cardSvg = u => { const h = [...u].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7) % 360;      // fausse carte (captures seulement)
  return `<svg xmlns="http://www.w3.org/2000/svg" width="488" height="680" viewBox="0 0 488 680"><rect width="488" height="680" rx="24" fill="#141418"/><rect x="18" y="18" width="452" height="644" rx="12" fill="hsl(${h} 32% 50%)"/><rect x="30" y="30" width="428" height="44" rx="7" fill="hsl(${h} 30% 86%)"/><rect x="36" y="84" width="416" height="300" fill="hsl(${(h + 120) % 360} 55% 42%)"/><circle cx="${180 + h % 140}" cy="210" r="74" fill="hsl(${(h + 90) % 360} 85% 78%)" opacity=".55"/><rect x="36" y="436" width="416" height="204" rx="5" fill="hsl(${h} 22% 92%)"/></svg>`; };

let edhHits = 0;
async function prep(p) {
  await p.route('**/edh.tsv', r => { edhHits++; return r.fulfill({ status: 200, contentType: 'text/tab-separated-values; charset=utf-8', body: FILE }); });
  await p.route('**/api/pubdecks*', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ at: Date.now(), decks: [BOB] }) }));
  if (SHOTS) await p.route('https://cards.scryfall.io/**', r => r.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*' }, contentType: 'image/svg+xml', body: cardSvg(r.request().url()) }));
}
/** Collection (proxy à part), un classeur, decks de Mes decks : Edgar (Commander), Hoof (Commander, peu de decks), Std (Standard), Autre (monté, réserve Swords). */
const EDGAR = 'Commander\n1 Edgar Markov\n\nDeck\n1 Sol Ring\n1 Command Tower\n8 Plains';
async function seed(p) {
  await p.evaluate(EDGAR => {
    COLL.map = collFromText('1 Edgar Markov\n1 Sol Ring\n1 Arcane Signet\n1 Swords to Plowshares\n1 Wrath of God\n1 Llanowar Elves\n1 Craterhoof Behemoth'); COLL.prox = collFromText("1 Ranger's Hawk");
    const pid = 'redbinder01'; COLL.places = { [pid]: placeNorm({ t: 'binder', n: 'Classeur rouge' }) };
    const g = collLines(COLL.map['arcane signet'])[0][0]; COLL.map = linesMove(COLL.map, 'arcane signet', g, 1, lineSet(g, { p: pid }));
    collChanged(); collEnrich();
    const put = (id, name, text) => putDeck(id, deckDoc({ name, text, opts: { ...S.opts } }));
    put('dk-edgar', 'Edgar', EDGAR); put('dk-hoof', 'Hoof', 'Commander\n1 Craterhoof Behemoth\n\nDeck\n1 Sol Ring');
    put('dk-std', 'Std', '// Deck Deal : standard\nDeck\n4 Llanowar Elves\n4 Sol Ring'); put('dk-other', 'Autre', '1 Swords to Plowshares');
    engSet('dk-other', 'Autre', '1 Swords to Plowshares');
    put('dk-big', 'Edgar complet', EDGAR + '\n1 Craterhoof Behemoth\n1 Llanowar Elves\n' + Array.from({ length: 30 }, (_, i) => '1 Shared ' + i).join('\n'));      // captures seulement
  }, EDGAR);
  await p.waitForFunction(() => COLL.meta['llanowar elves'] && COLL.meta['llanowar elves'].ci === 'G' && findDeck('dk-edgar') && findDeck('dk-other'), null, { timeout: 15000 });
}
const viewer = async (p, o) => { await p.evaluate(o => { closeDeckViewer(); openDeckViewer(o); }, o); await p.waitForSelector('.dv.on .dv-sum'); await p.waitForTimeout(250); };
const closeViewer = p => p.evaluate(() => closeDeckViewer()).then(() => p.waitForFunction(() => !document.querySelector('.dvw'), null, { timeout: 3000 }));
const rows = p => p.$$eval('#dfSec .df-row', r => r.map(x => x.dataset.k));
const openSec = async p => { if (!await p.$eval('#dfSec', d => d.open)) await p.click('#dfSec summary'); await p.waitForFunction(() => document.querySelector('#dfSec .df-row, #dfSec .df-msg:not(:empty)') && !/Lecture des decks/.test(document.querySelector('#dfSec .df-body').textContent), null, { timeout: 10000 }); };
async function shot(p, name, sel, themes = ['light', 'dark']) {
  if (!SHOTS) return;
  for (const cs of themes) { await p.emulateMedia({ colorScheme: cs }); await p.waitForTimeout(350); const path = `${SHOTS}/${name}-${cs}.png`; if (sel) await (await p.$(sel)).screenshot({ path }); else await p.screenshot({ path }); }
  await p.emulateMedia({ colorScheme: 'light' });
}

/* ═════ Téléphone (393 × 852) ═════ */
const { p, errs } = await newPage(browser, world, { ctx: { viewport: { width: 393, height: 852 } } });
await prep(p);
await p.waitForFunction(() => CTX.proxy); await p.evaluate(() => { CTX.pub = true; });      // serveur de test sans compte de service : decks publics annoncés à la main (comme pubdecks-e2e)
await signInFake(p);      // decks EDHREC : réservés aux comptes
await seed(p);

/* ── 1) Mes decks : section repliée, fichier EDHREC pas encore lu ; « Où trouver mes cartes » (monter possible) ── */
await viewer(p, { id: 'dk-edgar' });
assert.equal(await txt(p, '.dv-fetch'), 'Où trouver mes cartes');
assert.ok(await p.$('#dfSec'), 'section « De ta collection pour ce deck » (Commander)'); assert.equal(await p.$eval('#dfSec', d => d.open), false, 'repliée par défaut');
assert.equal(await txt(p, '#dfSec summary'), 'De ta collection pour ce deck Tes cartes que les decks de ce commandant jouent');
assert.equal(edhHits, 0, 'fichier EDHREC pas lu à l\'ouverture du viewer'); assert.equal(await p.evaluate(() => !EDH.data && !EDH.p), true);
await p.click('.dv-fetch'); await p.waitForSelector('.fetch-sheet .fetch-g');
assert.equal(await p.evaluate(() => sheets[sheets.length - 1].wrap.querySelector('h2').textContent), 'Où trouver mes cartes');
assert.match(await txt(p, '.fetch-sum'), /^2 \/ 11 possédées · 9 manquantes$/, 'Edgar, Sol Ring possédés ; Command Tower et 8 Plains manquent');
assert.deepEqual(await p.$$eval('.fetch-gh b', b => b.map(x => x.textContent)), ['Non rangé']);
assert.match(await txt(p, '.fetch-miss summary'), /Manquantes \(9\)/); assert.ok(await p.$('.fetch-sheet [data-mount]'), 'deck de Mes decks : « Monter le deck »'); assert.equal(!!(await p.$('.fetch-save')), false);
await closeSheets(p);
ok('Mes decks : « Où trouver mes cartes » (possédées par emplacement, manquantes, monter) ; section repliée, fichier EDHREC pas encore lu');

/* ── 2) Section ouverte : taux, identité, proxys et cartes du deck exclus, emplacement, réservée ailleurs ── */
await openSec(p);
assert.equal(edhHits, 1, 'fichier EDHREC lu à l\'ouverture de la section');
// les 35 « Shared » pas encore dans la collection : seulement Arcane Signet (8/11), Swords (6/11), Wrath (5/10 + celui de Bob : 6/11)
assert.deepEqual(await rows(p), ['arcane signet', 'swords to plowshares', 'wrath of god'], 'triées par taux ; ni Llanowar ni Craterhoof (vertes), ni Ranger\'s Hawk (proxy), ni Sol Ring (dans le deck), ni Edgar (commandant)');
const r0 = await txt(p, '#dfSec .df-row[data-k="arcane signet"]');
assert.match(r0, /Arcane Signet/); assert.match(r0, /dans 73 % des decks Edgar Markov/); assert.match(r0, /Classeur rouge/); assert.match(r0, /0,40 €/);
assert.match(await txt(p, '#dfSec .df-row[data-k="swords to plowshares"]'), /dans 55 % des decks Edgar Markov.*Non rangé.*Réservée par « Autre »/);
assert.equal(!!(await p.$('#dfSec .df-row[data-k="wrath of god"] .df-eng')), false, 'pas réservée');
assert.match(await txt(p, '#dfSec .df-sub'), /^D'après 11 decks de Edgar Markov$/); assert.equal(await txt(p, '#dfSec .df-n'), '3');
const last = await p.evaluate(() => DF.last); assert.ok(last.ms < 100, 'calcul en ' + last.ms + ' ms'); assert.equal(last.decks, 11, 'les 10 decks EDHREC et Archidekt, et celui de Bob (Communauté)');
assert.equal(await p.$$eval('#dfSec .df-add', b => b.length), 3, '« + au deck » sur chaque carte'); assert.equal(!!(await p.$('#dfSec .df-note')), false);
assert.equal(await p.evaluate(() => localStorage.getItem('deckdeal:dfopen')), '1', 'section ouverte gardée');
ok(`section : 3 cartes (73, 55, 55 % de 11 decks, Communauté comprise), identité de couleur, proxys et cartes du deck exclus, emplacement, prix, « Réservée par « Autre » » ; calcul ${last.ms.toFixed(1)} ms`);

/* ── 3) « + au deck » (deck de Mes decks), Annuler ── */
await p.click('#dfSec .df-row[data-k="arcane signet"] .df-add');
await p.waitForFunction(() => /Arcane Signet ajoutée à « Edgar »/.test(document.querySelector('#toast').textContent));
assert.equal(await p.evaluate(() => findDeck('dk-edgar').text), EDGAR + '\n1 Arcane Signet', 'ligne ajoutée après la dernière carte du deck');
assert.deepEqual(await rows(p), ['swords to plowshares', 'wrath of god'], 'la carte quitte la liste');
assert.ok(await p.$('.dvc[aria-label^="Arcane Signet"]'), 'et entre dans le deck affiché');
assert.equal(await p.evaluate(() => document.activeElement && document.activeElement.closest('.df-row') && document.activeElement.closest('.df-row').dataset.k), 'swords to plowshares', 'focus sur le « + » suivant : ' + await p.evaluate(() => (document.activeElement || {}).outerHTML.slice(0, 120)));
await p.click('#toast .toast-act'); await p.waitForFunction(() => findDeck('dk-edgar').text === 'Commander\n1 Edgar Markov\n\nDeck\n1 Sol Ring\n1 Command Tower\n8 Plains');
await p.waitForFunction(() => document.querySelectorAll('#dfSec .df-row').length === 3); assert.equal(!!(await p.$('.dvc[aria-label^="Arcane Signet"]')), false);
ok('« + au deck » : ajoutée à la liste du deck (ligne après la dernière carte), sortie de la section, focus suivant ; Annuler');

/* ── 4) « Voir plus » : 35 cartes « Shared » de plus dans la collection (100 % des decks, identité inconnue) ── */
await p.evaluate(() => { collAdd(Array.from({ length: 35 }, (_, i) => ({ k: 'shared ' + i, n: 'Shared ' + i, q: 1 })), 'add'); DV.framed = null; dvRender(); });
await openSec(p);
assert.equal((await rows(p)).length, 30, '30 premières'); assert.match(await txt(p, '#dfSec .df-more'), /Voir plus \(8 restantes\)/);
await p.click('#dfSec .df-more'); await p.waitForFunction(() => document.querySelectorAll('#dfSec .df-row').length === 38);
assert.deepEqual((await rows(p)).slice(-3), ['arcane signet', 'swords to plowshares', 'wrath of god'], '100 % d\'abord');
assert.equal(!!(await p.$('#dfSec .df-more')), false);
await p.evaluate(() => { for (let i = 0; i < 35; i++) delete COLL.map['shared ' + i]; COLL.map = { ...COLL.map }; collChanged(); DV.framed = null; dvRender(); });
ok('« Voir plus » : 30 puis 38 cartes');
if (SHOTS) {      // viewer d'un deck Commander, section ouverte et bouton : 393 clair et sombre
  await p.evaluate(() => { const s = document.querySelector('.dv-scroll'); s.scrollTop = document.querySelector('.dv-fetch').getBoundingClientRect().top + s.scrollTop - 220; }); await p.waitForTimeout(400);
  await shot(p, 'viewer-393');
}

/* ── 5) peu de decks (Craterhoof : 3), Standard sans section ── */
await viewer(p, { id: 'dk-hoof' }); await openSec(p);
assert.match(await txt(p, '#dfSec .df-msg'), /Seulement 3 decks de Craterhoof Behemoth dans les données EDHREC de l'appli : trop peu/); assert.equal(!!(await p.$('#dfSec .df-row')), false);
await viewer(p, { id: 'dk-std' });
assert.equal(!!(await p.$('#dfSec')), false, 'Standard : pas de section'); assert.equal(await txt(p, '.dv-fetch'), 'Où trouver mes cartes', 'mais le bouton');
await viewer(p, { text: '1 Sol Ring\n1 Wrath of God', name: 'Sans commandant' });
assert.equal(!!(await p.$('#dfSec')), false, 'sans commandant : pas de section');
ok('peu de decks : message honnête, aucune carte ; Standard et liste sans commandant : pas de section');

/* ── 6) feuille du deck (⋯ de Mes decks) : « Où trouver mes cartes » ── */
await closeViewer(p);
await p.evaluate(() => openDeckSheet('dk-edgar')); await p.waitForSelector('#dkFind');
assert.match(await txt(p, '#dkFind'), /^Où trouver mes cartes/);
await p.click('#dkFind'); await p.waitForSelector('.fetch-sheet .fetch-g'); assert.ok(await p.$('.fetch-sheet [data-mount]'));
await closeSheets(p);
ok('feuille ⋯ d\'un deck de Mes decks : « Où trouver mes cartes »');

/* ── 7) À monter (EDHREC) : viewer d'un deck non enregistré ; feuille sans « Monter » ; « + au deck » l'enregistre avec la carte ── */
await p.evaluate(() => navOpen(() => openCollection('decks'))); await p.waitForSelector('.crow.dk');
await p.$$eval('.crow.dk', r => r.find(x => /Edgar Markov/.test(x.textContent) && [...x.querySelectorAll('.tag')].some(t => t.textContent.trim() === 'Moyen')).click());
await p.waitForSelector('.sheet-wrap.open [data-act="dkview"]'); await p.click('.sheet-wrap.open [data-act="dkview"]'); await p.waitForSelector('.dv.on .dv-sum'); await p.waitForTimeout(300);
assert.equal(await p.evaluate(() => DV.adhoc && !DV.deckId), true);
await p.click('.dv-fetch'); await p.waitForSelector('.fetch-sheet .fetch-g');
assert.equal(!!(await p.$('.fetch-sheet [data-mount]')), false, 'ni « Monter le deck »'); assert.equal(!!(await p.$('.fetch-sheet [data-un]')), false);
assert.match(await txt(p, '.fetch-save'), /enregistre-le d'abord dans Mes decks/);
assert.deepEqual(await p.$$eval('.fetch-gh b', b => b.map(x => x.textContent)), ['Classeur rouge', 'Non rangé'], 'possédées par emplacement');
assert.match(await txt(p, '.fetch-miss summary'), /Manquantes \(\d+\)/);
await p.click('.fetch-miss summary'); assert.match(await txt(p, '.fetch-miss ul'), /Shared 0/);
const placesBefore = await p.evaluate(() => JSON.stringify(COLL.places));
if (SHOTS) { await p.waitForTimeout(400); await shot(p, 'fetch-edhrec-393', null, ['light']); }
await closeSheets(p); assert.equal(await p.evaluate(() => JSON.stringify(COLL.places)), placesBefore, 'rien de rangé ni de monté');
await openSec(p);
assert.match(await txt(p, '#dfSec .df-msg'), /Aucune autre carte de ta collection n'apparaît dans les decks de Edgar Markov/, 'deck moyen : il a déjà Arcane Signet, Swords et Wrath');
// un deck Archidekt d'Edgar sans elles (comme « Voir le deck » de sa feuille)
await viewer(p, { text: await p.evaluate(() => edhDeckText(EDH.data.decks.find(d => d.label === 'Deck 9'))), name: 'Edgar Markov', saveAs: 'Edgar Markov · Archidekt' }); await openSec(p);
assert.deepEqual(await rows(p), ['arcane signet', 'swords to plowshares', 'wrath of god']);
assert.match(await txt(p, '#dfSec .df-note'), /Ce deck n'est pas dans Mes decks/);
const before = await p.evaluate(() => allDecks().length), k0 = (await rows(p))[0];
await p.click(`#dfSec .df-row[data-k="${k0}"] .df-add`); await p.waitForSelector('.sheet-wrap.open [data-df-save]');
assert.match(await txt(p, '.sheet-wrap.open .sheet-body'), /ce deck doit être dans Mes decks/);
await p.click('.sheet-wrap.open [data-df-save]');
await p.waitForFunction(n => allDecks().length === n + 1, before);
assert.equal(await p.evaluate(k => { const d = allDecks().find(x => x.id === DV.savedId); return !!d && parseDeck(d.text).cards.some(c => ownKey(c.key) === k); }, k0), true, 'enregistré dans Mes decks avec la carte');
await p.waitForFunction(k => !document.querySelector(`#dfSec .df-row[data-k="${k}"]`), k0);
assert.equal(await txt(p, '.dv-foot [data-act="save"]'), '✓ Dans mes decks');
assert.equal(!!(await p.$('#dfSec .df-note')), false, 'enregistré : plus de note');
ok('À monter (EDHREC) : bouton, feuille sans « Monter » (possédées par emplacement, manquantes), « + au deck » l\'enregistre avec la carte');

/* ── 8) Communauté, deck reçu par un lien, Prix d'une liste : le bouton ── */
await closeViewer(p);
await p.$$eval('.crow.dk', r => r.find(x => [...x.querySelectorAll('.tag')].some(t => t.textContent.trim() === 'Bob')).click());
await p.waitForSelector('.sheet-wrap.open [data-act="dkview"]'); await p.click('.sheet-wrap.open [data-act="dkview"]'); await p.waitForSelector('.dv.on .dv-sum');
assert.equal(await txt(p, '.dv-fetch'), 'Où trouver mes cartes', 'Communauté');
await p.click('.dv-fetch'); await p.waitForSelector('.fetch-sheet .fetch-g'); assert.equal(!!(await p.$('.fetch-sheet [data-mount]')), false); await closeSheets(p);
await viewer(p, { text: 'Commander\n1 Edgar Markov\n\nDeck\n1 Sol Ring\n1 Wrath of God\n1 Command Tower', name: 'Edgar de Bob', pub: true, by: 'Bob' });      // liste qui n'est pas dans Mes decks (sinon sa copie serait montable)
assert.equal(await txt(p, '.dv-fetch'), 'Où trouver mes cartes', 'deck reçu par un lien');
await p.click('.dv-fetch'); await p.waitForSelector('.fetch-sheet .fetch-g'); assert.match(await txt(p, '.fetch-sum'), /^3 \/ 4 possédées · 1 manquante$/); assert.equal(!!(await p.$('.fetch-sheet [data-mount]')), false); await closeSheets(p);
await closeViewer(p);
ok('bouton sur les decks de la Communauté et reçus par un lien (sans « Monter »)');

/* ── 9) astuce et captures 360 ── */
assert.equal(await p.evaluate(() => typeof TIP_DEFS.dvfind[0]), 'function', 'astuce du bouton (tour.js)');
if (SHOTS) {
  await p.setViewportSize({ width: 360, height: 780 }); await viewer(p, { id: 'dk-edgar' }); await openSec(p);
  await p.evaluate(() => { const s = document.querySelector('.dv-scroll'); s.scrollTop = document.querySelector('.dv-fetch').getBoundingClientRect().top + s.scrollTop - 200; }); await p.waitForTimeout(400);
  await shot(p, 'viewer-360', null, ['light']); await closeViewer(p);
}
assert.deepEqual(errs, [], 'aucune erreur de page (téléphone)');
await p.context().close();

/* ── 10) Prix d'une liste (sans compte : la recherche passe par cet appareil) : le bouton, la section sans « + au deck » ── */
{
  const { p, errs } = await newPage(browser, world);
  await prep(p); await seed(p);
  await toInput(p); await p.fill('#deckText', 'Commander\n1 Edgar Markov\n\n1 Sol Ring\n1 Command Tower'); await p.waitForTimeout(300); await toInput(p); await p.click('#btnRun'); await done(p);
  await p.click('#btnViewer'); await p.waitForSelector('.dv.on .dv-sum');
  assert.equal(await txt(p, '.dv-fetch'), 'Où trouver mes cartes', 'Prix d\'une liste');
  await p.click('.dv-fetch'); await p.waitForSelector('.fetch-sheet .fetch-g'); assert.equal(!!(await p.$('.fetch-sheet [data-mount]')), false, 'liste non enregistrée : rien à monter'); await closeSheets(p);
  await openSec(p);
  assert.deepEqual(await rows(p), ['arcane signet', 'swords to plowshares', 'wrath of god']);
  assert.match(await txt(p, '#dfSec .df-note'), /ouvre ce deck depuis Mes decks/); assert.equal(!!(await p.$('#dfSec .df-add')), false, 'recherche en cours : pas de « + au deck »');
  await closeViewer(p);
  assert.deepEqual(errs, [], 'aucune erreur de page (Prix d\'une liste)');
  await p.context().close();
  ok('Prix d\'une liste : bouton (sans « Monter ») ; section sans « + au deck » (« ouvre ce deck depuis Mes decks »)');
}

/* ═════ Ordinateur : viewer et éditeur sur deux colonnes ═════ */
for (const [w, h] of [[1280, 800], [1890, 900]]) {
  const { p: q, errs: e2 } = await newPage(browser, world, { ctx: { viewport: { width: w, height: h }, isMobile: false, hasTouch: false, deviceScaleFactor: 1 } });
  await prep(q); await seed(q);
  await q.evaluate(() => { localStorage.setItem('deckdeal:dfopen', '1'); DF.open = true; });
  await viewer(q, { id: 'dk-edgar' }); await openSec(q);
  const L = await q.evaluate(() => { const b = s => { const r = document.querySelector(s).getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, r: r.right }; }; return { side: b('.dv-side'), main: b('.dv-main'), sum: b('.dv-sum'), sec: b('#dfSec'), fetch: b('.dv-fetch'), groups: b('.dv-groups'), sw: document.documentElement.scrollWidth, vw: innerWidth }; });
  assert.ok(L.side.r <= L.main.x, `${w} : résumé à gauche des cartes (${JSON.stringify(L)})`); assert.ok(Math.abs(L.side.y - L.main.y) < 4, 'colonnes alignées en haut');
  assert.ok(L.sec.x >= L.side.x && L.sec.r <= L.side.r + 1 && L.fetch.r <= L.side.r + 1, 'bouton et section dans la colonne de gauche');
  assert.ok(L.main.w > L.side.w * 1.5, 'cartes plus larges que le résumé'); assert.ok(L.sw <= L.vw, 'pas de défilement horizontal');
  const perRow = await q.$eval('.dv-g .dv-grid', g => getComputedStyle(g).gridTemplateColumns.split(' ').length);      // colonnes de la grille (le deck d'essai a peu de cartes par groupe)
  assert.ok(perRow >= (w > 1500 ? 7 : 5), 'tuiles par ligne : ' + perRow);
  const tile = await q.$eval('.dv-g .dvc', t => t.getBoundingClientRect().width);
  assert.ok(tile <= 160, 'tuiles raisonnables : ' + tile);
  if (SHOTS) {      // capture : un deck plus fourni (cartes inconnues du faux Scryfall : vignettes à initiale)
    await viewer(q, { id: 'dk-big' }); await openSec(q); await shot(q, `viewer-${w}`); await viewer(q, { id: 'dk-edgar' });
  }
  await closeViewer(q);
  // éditeur : recherche / collection à gauche, liste du deck à droite
  await q.evaluate(() => openBuilder({ id: 'dk-edgar' })); await q.waitForSelector('.bd.split #bdDeck .bd-row');
  await q.waitForSelector('#bdList .bd-row');
  const B = await q.evaluate(() => { const b = s => { const r = document.querySelector(s).getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, r: r.right, h: r.height }; }; return { l: b('.bd-l'), r: b('.bd-r'), seg: b('#bdSeg'), sum: b('#bdSum'), sw: document.documentElement.scrollWidth, vw: innerWidth }; });
  assert.ok(B.l.r <= B.r.x, `${w} : recherche à gauche de la liste du deck (${JSON.stringify(B)})`); assert.ok(B.seg.r <= B.l.r + 1 && B.sum.x >= B.r.x - 1, 'onglets à gauche, résumé du deck à droite');
  assert.deepEqual(await q.$$eval('#bdSeg .seg-opt', o => o.map(x => x.textContent)), ['Collection', 'Chercher'], 'la liste du deck est toujours affichée : pas d\'onglet Deck');
  assert.equal(await q.$eval('#bdName', i => i.value), 'Edgar'); assert.ok(B.sw <= B.vw);
  const cols = await q.$$eval('#bdDeck .bd-row', r => new Set(r.map(x => Math.round(x.getBoundingClientRect().left))).size);
  assert.ok(cols >= 2, 'liste du deck sur plusieurs colonnes : ' + cols);
  await q.click('#bdList .bd-row[data-k="wrath of god"] [data-d="1"]');
  await q.waitForSelector('#bdDeck .bd-row[data-k="wrath of god"]'); assert.equal(await q.$eval('#bdDeck .bd-row[data-k="wrath of god"] .qstep b', b => b.textContent), '1', 'ajoutée à gauche, visible à droite');
  if (SHOTS) await shot(q, `builder-${w}`);
  await q.evaluate(() => BD.el.__close());
  assert.deepEqual(e2, [], 'aucune erreur de page (' + w + ')');
  await q.context().close();
  ok(`ordinateur ${w} px : viewer (résumé, bouton et section à gauche, ${perRow} tuiles par ligne de ${Math.round(tile)} px) et éditeur (recherche à gauche, deck à droite sur ${cols} colonnes)`);
}

await browser.close(); world.stop();
console.log('deckfind-e2e : OK');
process.exit(0);
