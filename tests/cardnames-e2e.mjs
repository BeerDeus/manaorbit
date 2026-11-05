// E2E recherche de cartes par nom (src/cardnames.js) : langue de l'appli, puis anglais, puis langue des cartes, partout où l'on tape un nom de carte.
// 1) Appli en allemand, cartes en français : « Blitzschlag » et « Lightning » trouvent Lightning Bolt dans la collection, l'éditeur (Ajouter, À acheter),
//    l'assistant (commandant), les cartes fétiches, la saisie (lot), la liste de souhaits, les alertes ; « Foudre » (langue des cartes) aussi ; résultats affichés
//    en allemand, nom anglais en petit ; decklist et import « Blitzschlag » ; deux index au plus (langue des cartes changée : repris, jamais relu ni un 3e).
// 2) Appli en français : « Foudre », « éclair » (Hélice d'éclairs), un seul index (celui des cartes).
// Captures 393 × 852 : SHOTS=dossier.
import './setup-env.mjs';
import assert from 'node:assert/strict';
import { readFileSync, mkdirSync } from 'node:fs';
import { chromium, startWorld, newPage, ok, toHome, slug } from './e2e-world.mjs';

const SHOTS = process.env.SHOTS || ''; if (SHOTS) mkdirSync(SHOTS, { recursive: true });
const shot = async (p, n) => { if (SHOTS) { await p.waitForTimeout(350); await p.screenshot({ path: `${SHOTS}/${n}.png` }); } };
const world = await startWorld({ port: 18966, env: { CARDTRADER_TOKEN: '' } });
const browser = await chromium.launch({ executablePath: (process.env.CHROMIUM || '/opt/pw-browsers/chromium'), args: ['--no-sandbox'] });
// catalogues : vraies lignes françaises (pwa/fr-names.tsv) et allemandes (fixtures) des cartes du test + 600 autres (le site en exige au moins 500)
const ALL = readFileSync('pwa/fr-names.tsv', 'utf8').split('\n').filter(l => l && l[0] !== '#');
const WANT = new Set(['Sol Ring', 'Lightning Bolt', 'Counterspell', 'Lightning Helix', 'Rhystic Study', 'Craterhoof Behemoth', 'Edgar Markov']);
const FR = '# fr\n' + [...ALL.filter(r => WANT.has(r.split('\t')[1])), ...ALL.slice(0, 600)].join('\n') + '\n';
const DE = readFileSync(new URL('./fixtures/names-de.tsv', import.meta.url), 'utf8') + Array.from({ length: 600 }, (_, i) => `Vrombl ${i} Quarnax\tVrombl Card ${i}\t`).join('\n') + '\n';
const extra = (n, eur) => { world.prints[n] = [{ id: 's-' + slug(n), set: 'lea', set_name: 'Alpha', collector_number: '1', name: n, cmc: 1, type_line: 'Instant', mana_cost: '{R}', colors: ['R'], prices: { eur }, color_identity: ['R'], legalities: { commander: 'legal' }, image_uris: { small: `https://cards.scryfall.io/small/front/a/b/${slug(n)}.jpg` } }]; };
extra('Lightning Bolt', '0.80'); extra('Counterspell', '1.00'); extra('Lightning Helix', '0.50'); extra('Rhystic Study', '20.00');
const baseCat = world.catalog; world.catalog = () => [...baseCat(), 'Lightning Bolt', 'Counterspell', 'Lightning Helix', 'Rhystic Study', 'Lightning Strike'];
const EDH = ['#edh\t1\t2026-10-03T04:00:00Z', 'C\tedgar-markov\t12345\tWBR\tEdgar Markov', 'C\tcraterhoof-behemoth\t100\tG\tCraterhoof Behemoth',
  'D\tedgar-markov\tedhrec\tDeck moyen\thttps://edhrec.com/average-decks/edgar-markov', 'K\t1\tSol Ring', 'D\tcraterhoof-behemoth\tedhrec\tDeck moyen\thttps://edhrec.com/average-decks/craterhoof-behemoth', 'K\t1\tSol Ring'].join('\n') + '\n';
const hits = { de: 0, fr: 0 };
async function open(lang, cards) {
  const { ctx, p, errs } = await newPage(browser, world, { goto: false, ctx: { locale: lang === 'de' ? 'de-DE' : 'fr-FR', colorScheme: 'light', viewport: { width: 393, height: 852 }, deviceScaleFactor: 2 },
    init: `try { if (!sessionStorage.getItem('seeded')) { sessionStorage.setItem('seeded', '1'); localStorage.setItem('deckdeal:lang', ${JSON.stringify(lang)}); localStorage.setItem('deckdeal:onboard', '1'); localStorage.setItem('deckdeal:v1', JSON.stringify({ opts: { lang: ${JSON.stringify(cards)}, langSet: true } })); } } catch (e) {}` });
  await ctx.route('**/names-de.tsv', r => { hits.de++; r.fulfill({ status: 200, contentType: 'text/tab-separated-values; charset=utf-8', body: DE }); });
  await ctx.route('**/fr-names.tsv', r => { hits.fr++; r.fulfill({ status: 200, contentType: 'text/tab-separated-values; charset=utf-8', body: FR }); });
  await ctx.route('**/edh.tsv', r => r.fulfill({ status: 200, contentType: 'text/tab-separated-values; charset=utf-8', body: EDH }));
  await p.goto(world.url); await p.waitForTimeout(700); await p.evaluate(() => { BACKOFF.scry = [60, 60, 60]; BACKOFF.cool429 = 100; });
  return { ctx, p, errs };
}
const collRows = p => p.$$eval('.coll .coll-list .crow', r => [...new Set(r.map(x => x.dataset.k))]);
const collSearch = async (p, q, want) => { await p.fill('.coll .fsearch input', q); await p.waitForFunction(w => JSON.stringify([...new Set([...document.querySelectorAll('.coll .coll-list .crow')].map(x => x.dataset.k))]) === JSON.stringify(w), want, { timeout: 8000 }).catch(() => {}); return collRows(p); };

/* ── 1) appli en allemand, cartes en français ──────────────────────────────────────────────────────── */
{
  const { ctx, p, errs } = await open('de', 'fr');
  assert.deepEqual(await p.evaluate(() => [I18N.lang, S.opts.lang, namesLang(), cnLang(), !!FRX.ix, !!CN.ix]), ['de', 'fr', 'fr', 'de', false, false], 'rien de chargé au démarrage');
  await p.evaluate(() => { COLL.map = collFromText('2 Lightning Bolt *FR*\n1 Sol Ring *FR*\n1 Counterspell *EN*\n1 Edgar Markov *FR*'); collChanged(); });
  await toHome(p); await p.click('#btnColl'); await p.waitForSelector('.coll.on .crow');
  // première frappe : l'index de la langue de l'appli arrive (champ touché), la liste se refait toute seule
  assert.deepEqual(await collSearch(p, 'Blitzschlag', ['lightning bolt']), ['lightning bolt'], 'collection : « Blitzschlag » (allemand, langue de l\'appli)');
  assert.deepEqual(await p.evaluate(() => [FRX.l, CN.l, !!FRX.ix, !!CN.ix, CN.ix !== FRX.ix]), ['fr', 'de', true, true, true], 'deux index : cartes (fr) et appli (de), pas plus');
  assert.deepEqual([hits.de, hits.fr], [1, 1], 'chaque catalogue lu une fois');
  assert.equal(await p.$eval('.coll .coll-list .crow[data-k="lightning bolt"] .row-name', e => e.textContent.trim()), 'Foudre', 'exemplaire français : affiché sous son nom imprimé (inchangé)');
  await shot(p, 'de-collection-blitzschlag');
  assert.deepEqual(await collSearch(p, 'lightning', ['lightning bolt']), ['lightning bolt'], 'collection : anglais');
  assert.deepEqual(await collSearch(p, 'foudre', ['lightning bolt']), ['lightning bolt'], 'collection : langue des cartes');
  assert.deepEqual(await collSearch(p, 'gegenzau', ['counterspell']), ['counterspell'], 'exemplaire anglais trouvé par son nom allemand');
  assert.deepEqual(await collSearch(p, 'bolt lightn', ['lightning bolt']), ['lightning bolt'], 'mots dans n\'importe quel ordre');
  assert.deepEqual(await collSearch(p, 'sol ring', ['sol ring']), ['sol ring'], '« Sol-Ring » : tiret = espace');
  await p.fill('.coll .fsearch input', '');
  ok('collection : « Blitzschlag », « Lightning », « Foudre », exemplaire anglais par son nom allemand ; 2 index au plus, catalogues lus une fois');

  // listes filtrées hors collection (échange, amis, Communauté, deck, extension, masterset : filterItems), sous-ensemble du classeur, de l'échange en direct
  assert.deepEqual(await p.evaluate(() => [filterItems([{ k: 'lightning bolt', n: 'Lightning Bolt' }, { k: 'sol ring', n: 'Sol Ring' }], { q: 'blitz' }).map(i => i.k), cnPh()]),
    [['lightning bolt'], 'Name auf Deutsch oder Englisch'], 'filterItems : nom allemand ; libellé des champs');

  // éditeur de deck, onglet Ajouter : collection, puis « À acheter » (toutes les cartes) affichées en allemand
  await p.evaluate(() => openBuilder({ name: 'Test', fmt: 'commander', text: '' })); await p.waitForSelector('.bd.on');
  await p.evaluate(() => bdTab('coll')); await p.waitForSelector('.bd #bdF .fsearch input');
  assert.equal(await p.$eval('.bd #bdF .fsearch input', i => i.placeholder), 'Name auf Deutsch oder Englisch');
  for (const q of ['Blitzschlag', 'Lightning']) {
    await p.fill('.bd #bdF .fsearch input', q);
    await p.waitForFunction(() => !!document.querySelector('#bdList .bd-row[data-k="lightning bolt"]'), null, { timeout: 8000 });
  }
  await p.fill('.bd #bdF .fsearch input', 'Rhystische');
  await p.waitForFunction(() => !!document.querySelector('#bdList .bd-row[data-k="rhystic study"]'), null, { timeout: 15000 });
  assert.deepEqual(await p.$eval('#bdList .bd-row[data-k="rhystic study"]', r => [r.querySelector('.row-name').textContent, (r.querySelector('.bd-en') || {}).textContent]), ['Rhystische Studien', 'Rhystic Study'], 'À acheter : nom allemand, anglais en petit');
  await p.fill('.bd #bdF .fsearch input', 'Blitz'); await p.waitForTimeout(300); await shot(p, 'de-editeur-blitz');
  await p.evaluate(() => bdClose(true)); await p.waitForTimeout(400);
  ok('éditeur : « Blitzschlag » et « Lightning » dans la collection ; « Rhystische » à acheter, affiché en allemand');

  // assistant (choix du commandant) et cartes fétiches
  await p.evaluate(() => edhLoad()); await p.waitForFunction(() => !!(EDH.data && EDH.data.cmds.length));
  assert.deepEqual(await p.evaluate(() => { DWZ.q = 'kraterhuf'; const a = dwzCmds(EDH.data).map(c => c.slug); DWZ.q = 'craterhoof'; const b = dwzCmds(EDH.data).map(c => c.slug); DWZ.q = ''; return [a, b, dwzCmdRow(EDH.data.bySlug.get('craterhoof-behemoth')).match(/row-name">([^<]+)/)[1]]; }),
    [['craterhoof-behemoth'], ['craterhoof-behemoth'], 'Kraterhuf-Behemoth'], 'assistant : commandant par son nom allemand ou anglais, affiché en allemand');
  assert.deepEqual(await p.evaluate(() => { const b0 = DW.byKey; DW.byKey = new Map([['lightning bolt', ['Lightning Bolt', 'R', 1, 0, 8, 80, 0, '', 10]], ['lightning helix', ['Lightning Helix', 'WR', 2, 0, 8, 50, 0, '', 20]]]);
    try { return [dwPersoFind('Blitzschlag', null, 'pets').map(r => [r[1], r[4]]), dwPersoFind('Lightning', null, 'pets').map(r => [r[1], r[4]]), dwPersoFind('foudre', { ci: 'R' }, 'pets').map(r => r[1]), dwPersoFind('lightning', { ci: 'R' }, 'pets').map(r => r[1])]; } finally { DW.byKey = b0; } }),
    [[['Lightning Bolt', 'Blitzschlag']], [['Lightning Bolt', 'Blitzschlag'], ['Lightning Helix', 'Lightning Helix']], ['Lightning Bolt'], ['Lightning Bolt']], 'fétiches : nom allemand, anglais, français ; affichés en allemand ; couleurs du commandant');
  ok('assistant : commandant « Kraterhuf » ; cartes fétiches « Blitzschlag », « Lightning », « Foudre »');

  // saisie (Ajouter des cartes) : nom allemand d'abord, nom anglais en petit
  await p.evaluate(() => openLot()); await p.waitForSelector('#caName'); assert.equal(await p.$eval('#caName', i => i.placeholder), 'Lightning Bolt oder Blitzschlag');
  await p.fill('#caName', 'Blitz'); await p.waitForSelector('.ca-opt[data-n="Lightning Bolt"]', { timeout: 15000 });
  assert.equal(await p.$eval('.ca-opt[data-n="Lightning Bolt"] span', s => s.innerText.replace(/\s+/g, ' ').trim()), 'Blitzschlag Lightning Bolt');
  await p.fill('#caName', 'Lightning B'); await p.waitForFunction(() => { const b = document.querySelector('.ca-opt'); return b && b.dataset.n === 'Lightning Bolt'; }, null, { timeout: 8000 });
  assert.equal(await p.$eval('.ca-opt[data-n="Lightning Bolt"] span', s => s.innerText.replace(/\s+/g, ' ').trim()), 'Blitzschlag Lightning Bolt', 'nom anglais tapé : résultat affiché en allemand');
  await p.fill('#caName', 'Blitz'); await p.waitForTimeout(300); await shot(p, 'de-ajouter-blitz');
  await p.evaluate(() => { closeLot(); while (sheets.length) sheets[sheets.length - 1].close(); }); await p.waitForTimeout(400);
  ok('Ajouter des cartes : « Blitz » → Blitzschlag (Lightning Bolt en petit) ; « Lightning B » affiché en allemand');

  // decklist et import : nom allemand (appli) d'abord, nom français (cartes) toujours reconnu ; alertes : nom tapé → carte anglaise
  await p.evaluate(() => putDeckText('4 Blitzschlag\n1 Foudre\n1 Rhystische Studien', 'Test'));
  await p.waitForFunction(() => S.deck && S.deck.cards.some(c => c.key === 'rhystic study'), null, { timeout: 8000 }).catch(() => {});
  const keys = await p.evaluate(() => S.deck.cards.map(c => c.key));
  assert.ok(keys.includes('lightning bolt') && keys.includes('rhystic study') && !keys.includes('blitzschlag') && !keys.includes('foudre'), 'decklist : ' + keys.join(', '));
  assert.deepEqual(await p.evaluate(() => { const r = parseCollection('2 Blitzschlag\n1 Foudre', { fr: true }); return r.items.map(x => [ownKey(x.n), collLines(x).map(([g, q]) => lineLang(g) + '×' + q).sort().join(' ')]); }),
    [['lightning bolt', 'de×2 fr×1']], 'import : « Blitzschlag » → exemplaire allemand, « Foudre » → français');
  assert.deepEqual(await p.evaluate(() => [cnToEn('Blitzschlag'), cnToEn('Foudre'), cnToEn('Zzzz')]), ['Lightning Bolt', 'Lightning Bolt', ''], 'alertes : nom tapé → carte anglaise');
  ok('decklist « 4 Blitzschlag » et « 1 Foudre », import (langue du nom reconnu), alertes');

  // langue des cartes passée à l'allemand : l'index de l'appli devient celui des cartes (repris, pas relu) ; retour au français : l'allemand reste pour la recherche
  const de0 = hits.de;
  await p.evaluate(() => { const s = document.querySelector('#optLang'); s.value = 'de'; s.dispatchEvent(new Event('change')); });
  await p.waitForFunction(() => FRX.l === 'de' && !!FRX.ix, null, { timeout: 8000 });
  assert.deepEqual(await p.evaluate(() => [FRX.l, !!FRX.ix, CN.ix, cnIx(true) === FRX.ix]), ['de', true, null, true], 'un seul index : celui de l\'appli, repris par les cartes');
  await p.evaluate(() => { const s = document.querySelector('#optLang'); s.value = 'fr'; s.dispatchEvent(new Event('change')); });
  await p.waitForFunction(() => FRX.l === 'fr' && !!FRX.ix, null, { timeout: 8000 });
  assert.deepEqual(await p.evaluate(() => [FRX.l, CN.l, !!CN.ix, CN.ix !== FRX.ix, cnOf('Lightning Bolt')]), ['fr', 'de', true, true, 'Blitzschlag'], 'retour au français : l\'allemand reste pour la recherche');
  assert.deepEqual([hits.de, hits.fr], [de0, 1], 'aucun catalogue relu sur le réseau (appareil)');
  ok('langue des cartes changée : index repris d\'un côté à l\'autre, jamais un 3e, rien de retéléchargé');
  assert.deepEqual(errs, [], 'pas d\'erreur JS : ' + errs.join(' | '));
  await ctx.close();
}

/* ── 2) appli en français (cartes françaises) ──────────────────────────────────────────────────────── */
{
  const { ctx, p, errs } = await open('fr', 'fr');
  await p.evaluate(() => { COLL.map = collFromText('2 Lightning Bolt *EN*\n1 Lightning Helix *EN*\n1 Sol Ring *FR*'); collChanged(); });
  await toHome(p); await p.click('#btnColl'); await p.waitForSelector('.coll.on .crow');
  assert.deepEqual(await collSearch(p, 'Foudre', ['lightning bolt']), ['lightning bolt'], 'collection : « Foudre »');
  assert.deepEqual(await collSearch(p, 'éclair', ['lightning helix']), ['lightning helix'], '« éclair » : Hélice d\'éclairs');
  assert.deepEqual(await collSearch(p, 'eclairs', ['lightning helix']), ['lightning helix'], 'sans accent');
  assert.deepEqual(await p.evaluate(() => [cnLang(), FRX.l, !!FRX.ix, CN.ix, cnPh()]), ['fr', 'fr', true, null, 'Nom français ou anglais'], 'un seul index (celui des cartes)');
  await p.evaluate(() => openLot()); await p.waitForSelector('#caName'); await p.fill('#caName', 'lightning bo');
  await p.waitForSelector('.ca-opt[data-n="Lightning Bolt"]', { timeout: 15000 });
  assert.equal(await p.$eval('.ca-opt[data-n="Lightning Bolt"] span', s => s.innerText.replace(/\s+/g, ' ').trim()), 'Foudre Lightning Bolt', 'résultat affiché en français, anglais en petit');
  await p.fill('#caName', 'éclair'); await p.waitForSelector('.ca-opt[data-n="Lightning Helix"]', { timeout: 8000 });
  ok('appli en français : « Foudre », « éclair » (Hélice d\'éclairs), résultats en français, un seul index');
  assert.deepEqual(errs, [], 'pas d\'erreur JS : ' + errs.join(' | '));
  await ctx.close();
}
await browser.close(); world.stop(); console.log('OK');
