// E2E : écran « Mes decks » (bouton d'accueil, decks en cartes), carte de présentation au choix, filtres format / couleurs,
// réserve Standard et images des terrains de base dans le viewer.
import './setup-env.mjs';
import assert from 'node:assert/strict';
import { chromium, startWorld, newPage, txt, ok, toInput, toHome } from './e2e-world.mjs';

const world = await startWorld({ port: 18980 });
world.basics = true;
const browser = await chromium.launch({ executablePath: (process.env.CHROMIUM || '/opt/pw-browsers/chromium'), args: ['--no-sandbox'] });
const decks = [
  { id: 'd1', name: 'Rakdos', text: '// Deck Deal : standard\nDeck\n4 Sol Ring\n10 Swamp\n12 Mountain\n\nSB: 2 Swords to Plowshares\nSB: 1 Wrath of God', updatedAt: 40 },
  { id: 'd2', name: 'Edgar', text: '// Deck Deal : commander\nCommander\n1 Edgar Markov\n\nDeck\n1 Sol Ring\n1 Command Tower\n5 Plains\n5 Swamp\n5 Mountain', updatedAt: 30 },
  { id: 'd3', name: 'Forêt', text: '// Deck Deal : standard\nDeck\n4 Llanowar Elves\n20 Forest', updatedAt: 20 },
  { id: 'd4', name: 'Mystère', text: '1 Sol Ring\n1 Arcane Signet', updatedAt: 10 },
];
const seed = `try { localStorage.setItem('deckdeal:coll:v1', JSON.stringify({ t: '1 Sol Ring *EN*', u: 1, s: '', b: null })); localStorage.setItem('deckdeal:decks:v1', JSON.stringify(${JSON.stringify(decks.map(d => ({ ...d, opts: {}, cards: 1, history: [], createdAt: 1 })))})); } catch (e) {}`;
const { p, errs } = await newPage(browser, world, { init: seed });
await p.waitForTimeout(600);
const back = async () => { await p.evaluate(() => history.back()); await p.waitForTimeout(350); };
const names = () => p.$$eval('#deckList .deck .deck-name', n => n.map(x => x.textContent));
const imgOf = id => p.$eval(`.deck[data-id="${id}"] .deck-art img`, e => e.getAttribute('src')).catch(() => '');

/* ── 1) bouton « Decks » de la barre du bas → Mes decks, decks en cartes ──────────────────────── */
assert.equal(await p.$('.deck'), null, 'plus de liste sur l\'accueil');
await toHome(p); await p.click('#btnDecks'); await p.waitForSelector('.dks.on .deck');
assert.deepEqual(await names(), ['Rakdos', 'Edgar', 'Forêt', 'Mystère'], 'les plus récents d\'abord'); assert.equal(await txt(p, '.dks .dv-title span'), '4 decks'); assert.equal(await txt(p, '.dks .dk-tab[data-dtab="mine"]'), 'Mes decks 4', 'onglet : nombre de decks');
// carte de présentation par défaut : commandant (Edgar), sinon la carte la plus chère hors terrains
await p.waitForFunction(() => document.querySelectorAll('.deck-art img.ok').length === 4, null, { timeout: 8000 });
assert.match(await imgOf('d2'), /edgar-markov/, 'commandant'); assert.match(await imgOf('d1'), /sol-ring/); assert.match(await imgOf('d3'), /llanowar-elves/); assert.match(await imgOf('d4'), /sol-ring/, 'la plus chère : Sol Ring 1,50 € > Signet 0,40 €');
assert.equal(await p.$eval('.deck[data-id="d1"] .deck-art', e => Math.round(e.getBoundingClientRect().width / e.getBoundingClientRect().height * 1000)), 718, 'forme d\'une carte (672 × 936)');
assert.equal(await p.$$eval('#deckList .deck', d => new Set(d.map(x => Math.round(x.getBoundingClientRect().left))).size), 2, 'grille à 2 colonnes');
await p.waitForTimeout(600); await p.screenshot({ path: 'shots/dks-1-grille.png' });
ok('bouton « Decks » → Mes decks ; decks en cartes avec leur image (commandant / carte la plus chère par défaut)');
// nombre de cartes : exemplaires, comme le viewer (terrains de base compris, réserve à part) ; « /100 » pour un deck Commander ; « monté »
const lines = () => p.$$eval('#deckList .deck .deck-line', n => n.map(x => x.textContent.replace(/\s/g, ' ')));
assert.deepEqual((await lines()).map(l => l.split(' · ')[0]), ['26 cartes', '18/100 cartes', '24 cartes', '2 cartes'], 'Rakdos 4 + 10 + 12 (réserve 3 à part) · Edgar 18/100 · Forêt 4 + 20 · Mystère 2');
await p.evaluate(() => { XS.eng = { d2: { n: 'Edgar', at: Date.now(), q: { 'sol ring': 1 } } }; engApplied(); renderDecks(); });
await p.waitForFunction(() => document.querySelector('.deck[data-id="d2"] .mounted'), null, { timeout: 3000 });
assert.equal(await txt(p, '.deck[data-id="d2"] .mounted'), 'monté'); assert.match((await lines())[1], /^18\/100 cartes · .*monté$/);
await p.evaluate(() => openDeckSheet('d2')); await p.waitForSelector('#dkMount');
assert.match(await txt(p, '.sheet-head p'), /^18\/100 cartes · modifié /); assert.equal(await txt(p, 'label[for="dkMount"] b'), 'Deck monté'); assert.equal(await p.$eval('#dkMount', c => c.checked), true);
await p.keyboard.press('Escape'); await p.waitForFunction(() => !document.querySelector('.sheet-wrap'), null, { timeout: 3000 });
await p.evaluate(() => { XS.eng = {}; engApplied(); renderDecks(); }); await p.waitForFunction(() => !document.querySelector('.deck .mounted'), null, { timeout: 3000 });
ok('nombre de cartes = exemplaires comme le viewer (26 · 18/100 · 24 · 2), « monté » dans la liste, l\'accueil (« 4 decks · 1 monté ») et la feuille');

/* ── 2) filtres : format, couleurs ───────────────────────────────────────────────────────── */
assert.equal(await p.$eval('#dksFilters', e => e.hidden), false);
await p.click('#dksSeg .seg-opt[data-v="commander"]'); assert.deepEqual(await names(), ['Edgar']); assert.equal(await txt(p, '.dks .dv-title span'), '1 sur 4 decks');
await p.click('#dksSeg .seg-opt[data-v="standard"]'); assert.deepEqual(await names(), ['Rakdos', 'Forêt'], 'Standard : décks marqués Standard seulement');
await p.click('#dksSeg .seg-opt[data-v=""]'); assert.equal((await names()).length, 4);
assert.equal(await p.$eval('.dks-c[data-c="U"]', e => e.disabled), true, 'aucun deck bleu : couleur grisée'); assert.equal(await p.$eval('.dks-c[data-c="R"]', e => e.disabled), false);
await p.click('.dks-c[data-c="R"]'); assert.deepEqual(await names(), ['Rakdos', 'Edgar'], 'rouge : Rakdos (B R) et Edgar (W B R)'); assert.equal(await p.$eval('.dks-c[data-c="R"]', e => e.getAttribute('aria-pressed')), 'true');
await p.click('.dks-c[data-c="W"]'); assert.deepEqual(await names(), ['Edgar'], 'toutes les couleurs cochées : rouge ET blanc');
await p.click('#dksSeg .seg-opt[data-v="standard"]'); assert.equal(await p.$$eval('#deckList .deck', n => n.length), 0); assert.match(await txt(p, '#deckList'), /Aucun deck ne correspond/); assert.equal(await p.$eval('.dks-reset', e => e.hidden), false);
await p.click('.dks-reset'); assert.equal((await names()).length, 4); assert.equal(await p.$eval('.dks-reset', e => e.hidden), true); assert.equal(await p.$eval('#dksSeg', e => e._v), '');
ok('filtres : Commander / Standard, couleurs (toutes celles cochées), vide + « Tout afficher »');

/* ── 3) carte de présentation : choisie dans la feuille du deck ─────────────────────────── */
await p.click('.deck[data-id="d1"] .deck-more'); await p.waitForSelector('#dkEdit');
assert.match(await txt(p, '.sheet-head p'), /^26 cartes · modifié /, 'feuille : même nombre que la liste et le viewer'); assert.match(await txt(p, '#dkEdit'), /^Modifier le deck Nom, image, format, tags · Standard$/);
await p.click('#dkEdit'); await p.waitForSelector('#dkCover');      // « Modifier le deck » : nom, image, format, tags
assert.match(await txt(p, '#dkCoverSub'), /^Sol Ring · automatique$/);
await p.click('#dkCover'); await p.waitForSelector('.cv-card'); await p.waitForFunction(() => document.querySelectorAll('.cv-card img.ok').length === 3, null, { timeout: 8000 });
assert.deepEqual(await p.$$eval('.cv-card', c => c.map(x => x.dataset.n)), ['Swords to Plowshares', 'Sol Ring', 'Wrath of God'], 'cartes du deck et de la réserve, les plus chères d\'abord (égalité : ordre alphabétique)');
assert.deepEqual(await p.$eval('#cvQ', e => [getComputedStyle(e).height, getComputedStyle(e).borderRadius]), ['44px', '12px'], 'recherche de la feuille : un champ de l\'appli (pas le champ brut du navigateur)');
await p.fill('#cvQ', 'wrath'); assert.deepEqual(await p.$$eval('.cv-card', c => c.map(x => x.dataset.n)), ['Wrath of God']);
await p.click('.cv-card'); await p.waitForFunction(() => !document.querySelector('#cvGrid'), null, { timeout: 3000 });
assert.match(await txt(p, '#dkCoverSub'), /^Wrath of God · choisie$/);
const d1 = await p.evaluate(() => findDeck('d1'));
assert.match(d1.text, /^\/\/ Deck Deal : standard\n\/\/ Deck Deal cover : Wrath of God\nDeck\n/); assert.equal(d1.updatedAt, 41, 'le deck garde sa place (date + 1 : les autres appareils voient le changement, cloud.js › sommaire)'); assert.equal(await p.evaluate(() => deckFmt(findDeck('d1'))), 'standard');
assert.equal(await p.evaluate(() => JSON.parse(localStorage.getItem('deckdeal:decks:v1')).find(d => d.id === 'd1').text.includes('cover : Wrath of God')), true, 'gardé sur l\'appareil');
await p.keyboard.press('Escape'); await p.waitForTimeout(300); await p.keyboard.press('Escape'); await p.waitForFunction(() => !document.querySelector('.sheet-wrap'), null, { timeout: 3000 });
await p.waitForFunction(() => /wrath-of-god/.test((document.querySelector('.deck[data-id="d1"] .deck-art img') || {}).src || ''), null, { timeout: 8000 });
assert.deepEqual(await names(), ['Rakdos', 'Edgar', 'Forêt', 'Mystère']); assert.equal(await p.$eval('.deck[data-id="d1"] .deck-fmt', e => e.textContent), 'Standard');
// « Automatique » : retire le choix
await p.click('.deck[data-id="d1"] .deck-more'); await p.waitForSelector('#dkEdit'); await p.click('#dkEdit'); await p.waitForSelector('#dkCover'); await p.click('#dkCover'); await p.waitForSelector('.cv-card[aria-pressed="true"]'); assert.equal(await p.$eval('.cv-card[aria-pressed="true"]', e => e.dataset.n), 'Wrath of God');
await p.click('#cvAuto'); await p.waitForFunction(() => !document.querySelector('#cvGrid'), null, { timeout: 3000 }); assert.match(await txt(p, '#dkCoverSub'), /^Sol Ring · automatique$/);
assert.equal(await p.evaluate(() => /cover/.test(findDeck('d1').text)), false);
await p.click('#dkCover'); await p.click('.cv-card[data-n="Wrath of God"]'); await p.waitForFunction(() => !document.querySelector('#cvGrid'), null, { timeout: 3000 });
await p.keyboard.press('Escape'); await p.waitForTimeout(300); await p.keyboard.press('Escape'); await p.waitForFunction(() => !document.querySelector('.sheet-wrap'), null, { timeout: 3000 });
ok('carte de présentation : choisie (ligne « // Deck Deal cover » dans le texte, sans changer l\'ordre), image mise à jour, « Automatique »');

/* ── 4) l'éditeur garde la carte choisie ────────────────────────────────────────────────── */
await p.click('.deck[data-id="d1"] [data-act="open"]'); await p.waitForSelector('.dv.on [data-act="builder"]'); await p.click('.dv.on [data-act="builder"]'); await p.waitForSelector('.bd.on');
await p.waitForSelector('.bd-row[data-k="mountain"]'); await p.click('.bd-row[data-k="mountain"][data-t="main"] [data-d="1"]'); await p.waitForTimeout(150);
await p.click('#bdSave'); await p.waitForFunction(() => !document.querySelector('.bd'), null, { timeout: 4000 });
assert.match(await p.evaluate(() => findDeck('d1').text), /^\/\/ Deck Deal : standard\n\/\/ Deck Deal cover : Wrath of God\nDeck\n4 Sol Ring\n10 Swamp\n13 Mountain\n/, 'carte choisie gardée après modification dans l\'éditeur');
ok('éditeur de deck : la carte de présentation choisie est conservée');

/* ── 5) viewer : réserve et terrains de base ─────────────────────────────────────────────── */
await p.click('.deck[data-id="d1"] [data-act="open"]'); await p.waitForSelector('.dv.on[aria-label^="Deck viewer"] .dv-g');
await p.waitForFunction(() => document.querySelector('.dv-g[data-g="sb"]') && document.querySelectorAll('.dv-g[data-g="land"] .dvc-art img.ok').length === 2, null, { timeout: 8000 });
const lab = sel => p.$$eval(sel, t => t.map(x => x.getAttribute('aria-label').replace(/\s/g, ' ')));
assert.deepEqual(await lab('.dv-g[data-g="sb"] .dvc'), ['Swords to Plowshares, ×2, 3,80 €, réserve', 'Wrath of God, 1,50 €, réserve'], 'réserve : tuiles, valeur estimée');
assert.match(await txt(p, '.dv-g[data-g="sb"] h3'), /^Réserve 3 cartes · ≈ 5,30 € · prix du jour$/);
assert.match(await txt(p, '.dv[aria-label^="Deck viewer"] .dv-title span'), /^27 cartes · .*réserve 3$/, 'viewer : 27 cartes (13 Mountain depuis l\'éditeur), comme Mes decks'); assert.equal((await p.waitForFunction(() => !document.querySelector('.dv-amt[data-tw]')), await txt(p, '.dv-eur')), '≈ 6,00 €', 'total du deck sans la réserve (4 Sol Ring × 1,50 €)');
assert.equal((await p.$$eval('.dv-g[data-g="land"] .dvc', t => t.length)), 2, 'terrains de base : 2 tuiles avec leur image');
assert.deepEqual(await p.$$eval('.dv-g .dvc', t => t.map(x => x.closest('.dv-g').dataset.g).filter((g, i, a) => a.indexOf(g) === i)), ['m1', 'land', 'sb'], 'réserve en dernier');
await p.click('.dv-g[data-g="sb"] .dvc >> nth=1'); await p.waitForSelector('.imgv'); assert.match(await txt(p, '.imgv-extra'), /Réserve · 1,50 € · prix du jour de l'impression la moins chère/); await p.keyboard.press('Escape'); await p.waitForFunction(() => !document.querySelector('.imgv'), null, { timeout: 3000 });
await p.click('.dv-g[data-g="land"] .dvc >> nth=0'); await p.waitForSelector('.imgv'); assert.match(await txt(p, '.imgv-extra'), /Terrain de base/); await p.keyboard.press('Escape'); await p.waitForFunction(() => !document.querySelector('.imgv'), null, { timeout: 3000 });
// tri par prix : la réserve reste à part
await p.click('#dvSeg .seg-opt[data-v="price"]'); assert.deepEqual(await p.$$eval('.dv-g', g => g.map(x => x.dataset.g)), ['p', 'b', 'sb']);
await p.waitForTimeout(600); await p.screenshot({ path: 'shots/dks-2-viewer-reserve.png' });
ok('viewer : réserve à part (valeur estimée, hors total, avec le tri), images des terrains de base, carte en grand');
await back(); await p.waitForFunction(() => !document.querySelector('.dv:not(.dks)'), null, { timeout: 3000 }); assert.ok(await p.$('.dks.on'));
await back(); await p.waitForFunction(() => !document.querySelector('.dks'), null, { timeout: 3000 });

/* ── 6) feuille « Enregistrer » : prix Cardmarket → pas de critères CardTrader ; toast sans question quand les alertes sont indisponibles ── */
const svHint = () => p.$eval('.sheet-body > p.hint', e => e.textContent.replace(/\s/g, ' '));
await toInput(p); await p.fill('#deckText', '// Deck Deal : commander\nCommander\n1 Edgar Markov\n\nDeck\n1 Sol Ring\n5 Plains'); await p.waitForTimeout(300);
await p.evaluate(() => { S.src = 'cm'; }); assert.equal(await p.evaluate(() => priceSrc()), 'cm');
await toInput(p); await p.click('#btnSave'); await p.waitForSelector('#svName');
assert.equal(await svHint(), '7/100 cartes · prix Cardmarket.', 'ni langue, ni état, ni Zero / Direct');
await p.keyboard.press('Escape'); await p.waitForFunction(() => !document.querySelector('.sheet-wrap'), null, { timeout: 3000 });
await p.evaluate(() => { S.src = 'auto'; }); assert.equal(await p.evaluate(() => priceSrc()), 'ct');
await toInput(p); await p.click('#btnSave'); await p.waitForSelector('#svName');
assert.match(await svHint(), /^7\/100 cartes · \S+ · \S+ min · (Zero|Direct)\. Les critères sont enregistrés avec la liste\.$/, 'CardTrader : les critères restent annoncés');
await p.fill('#svName', 'Edgar CM'); await p.click('#svGo'); await p.waitForFunction(() => !document.querySelector('.sheet-wrap'), null, { timeout: 3000 });
assert.equal(await txt(p, '#toast'), 'Deck enregistré', 'alertes indisponibles (pas de clés de notification) : aucune question');
ok('« Enregistrer » : « 7/100 cartes · prix Cardmarket. » en Cardmarket, critères CardTrader sinon ; toast simple sans alertes possibles');

/* ── 8) « Modifier le deck » : nom, format, tags (une ligne du texte, synchronisée avec lui) ; Commander : réglages du coach ─────────────── */
await p.evaluate(() => { while (sheets.length) sheets[sheets.length - 1].close(); });
await p.waitForFunction(() => !document.querySelector('.sheet-wrap'), null, { timeout: 3000 });
await p.evaluate(() => openDeckSheet('d4')); await p.waitForSelector('#dkEdit'); await p.click('#dkEdit'); await p.waitForSelector('#dkeTag');
assert.equal(await p.$eval('#dkeFmt', e => e._v), 'standard', 'sans format noté : Standard'); assert.equal(await txt(p, '#dkeTags'), 'Aucun tag.');
await p.fill('#dkName', 'Mystère 2'); await p.fill('#dkeTag', 'Budget'); await p.press('#dkeTag', 'Enter'); await p.fill('#dkeTag', 'aggro'); await p.press('#dkeTag', ',');
await p.fill('#dkeTag', 'budget'); await p.press('#dkeTag', 'Enter');      // doublon (casse ignorée) : refusé
assert.deepEqual(await p.$$eval('[data-tag-rm]', b => b.map(x => x.textContent)), ['Budget', 'aggro']);
await p.click('[data-tag-rm="1"]'); assert.deepEqual(await p.$$eval('[data-tag-rm]', b => b.map(x => x.textContent)), ['Budget']);
await p.click('#dkeFmt .seg-opt[data-v="commander"]'); await p.waitForSelector('#dkeCoach .sec-title');
assert.match(await txt(p, '#dkeCoach'), /Ajoute un commandant à la liste pour régler le coach/, 'Commander sans commandant : le coach attend');
await p.click('#dkeOk'); await p.waitForFunction(() => !document.querySelector('#dkeOk'), null, { timeout: 3000 });
let d4 = await p.evaluate(() => findDeck('d4'));
assert.equal(d4.name, 'Mystère 2'); assert.match(d4.text, /^\/\/ Deck Deal : commander\n\/\/ Deck Deal tags : Budget\n1 Sol Ring/); assert.deepEqual(await p.evaluate(() => dkTags(findDeck('d4').text)), ['Budget']);
assert.equal(d4.updatedAt > 10, true); assert.match(await txt(p, '#dkEditSub'), /^Nom, image, format, tags · Commander · Budget$/);
await p.evaluate(() => { while (sheets.length) sheets[sheets.length - 1].close(); }); await p.waitForFunction(() => !document.querySelector('.sheet-wrap'), null, { timeout: 3000 });
assert.match(await p.evaluate(() => deckCard(findDeck('d4'), 0)), /<span class="deck-tag">Budget<\/span>/, 'tag sur la carte du deck (Mes decks)');
// tag proposé d'un toucher sur un autre deck ; les tags passent par l'éditeur sans se perdre
await p.evaluate(() => openDeckSheet('d2')); await p.waitForSelector('#dkEdit'); await p.click('#dkEdit'); await p.waitForSelector('[data-tag-add="Budget"]');
await p.click('[data-tag-add="Budget"]'); assert.deepEqual(await p.$$eval('[data-tag-rm]', b => b.map(x => x.textContent)), ['Budget']);
await p.waitForSelector('#dkeCoach [data-ds-br="auto"]', { timeout: 10000 }); assert.equal(await p.$eval('#dkeCoach [data-ds-br="auto"]', b => b.getAttribute('aria-pressed')), 'true', 'Commander : bracket automatique tant qu\'il n\'est pas réglé');
await p.click('#dkeCoach [data-ds-br="4"]'); await p.fill('#dkeBud', '150'); await p.dispatchEvent('#dkeBud', 'change');
await p.click('#dkeOk'); await p.waitForFunction(() => !document.querySelector('#dkeOk'), null, { timeout: 3000 });
assert.deepEqual(await p.evaluate(() => { const o = dwSettingsFor('d2'); return [o.br, o.bud, !!o.ba, !!o.bv]; }), [4, 15000, false, false], 'réglages du coach gardés pour ce deck');
await p.evaluate(() => { while (sheets.length) sheets[sheets.length - 1].close(); });
assert.equal(await p.evaluate(() => { const p0 = dkParse(findDeck('d2').text); return dkBuildText({ ...p0, fmt: 'commander' }).includes('// Deck Deal tags : Budget'); }), true, 'l\'éditeur garde les tags');
ok('« Modifier le deck » : nom, format, tags (doublons refusés, proposés d\'un autre deck, sur la carte), réglages du coach d\'un deck Commander');

/* ── 9) « Suivre les cartes manquantes » : allumé par défaut, éteint pour un deck venu d'À monter ; « Je recherche » et alertes suivent ─────── */
const want = () => p.evaluate(() => trState().want.filter(w => w.d).map(w => w.k).sort());
await p.evaluate(() => putDeck('d5', deckDoc({ name: 'Venu d\'À monter', text: '// Deck Deal from : edh\nDeck\n1 Rhystic Study' })));
assert.equal(await p.evaluate(() => [dkTrack(findDeck('d1').text), dkTrack(findDeck('d5').text)].join()), 'true,false');
assert.equal((await want()).includes('rhystic study'), false, 'venu d\'À monter : ses manques pas dans « Je recherche »');
assert.equal(await p.evaluate(() => alItems().some(x => x.k === 'rhystic study')), false, 'ni dans les alertes');
await p.waitForFunction(() => !document.querySelector('.sheet-wrap'), null, { timeout: 3000 }); await p.evaluate(() => openDeckSheet('d5')); await p.waitForSelector('#dkTrack');
assert.equal(await p.$eval('#dkTrack', c => c.checked), false); assert.match(await txt(p, '#dkTrackHint'), /ne sont ni dans « Je recherche » ni dans tes alertes de prix/);
await p.click('label[for="dkTrack"]'); await p.waitForFunction(() => dkTrack(findDeck('d5').text));
assert.equal((await want()).includes('rhystic study'), true, 'allumé : dans « Je recherche »'); assert.equal(await p.evaluate(() => alItems().some(x => x.k === 'rhystic study')), true, 'et dans les alertes');
assert.match(await p.evaluate(() => findDeck('d5').text), /\/\/ Deck Deal track : on/);
await p.click('label[for="dkTrack"]'); await p.waitForFunction(() => !dkTrack(findDeck('d5').text)); assert.equal((await want()).includes('rhystic study'), false, 'éteint : retiré');
await p.evaluate(() => { while (sheets.length) sheets[sheets.length - 1].close(); });
ok('« Suivre les cartes manquantes » : sur chaque deck, éteint d\'office pour un deck venu d\'À monter ; « Je recherche » et alertes de prix suivent');

assert.deepEqual(errs, [], 'erreurs page : ' + errs.join(' | '));
await browser.close(); world.stop();
console.log('DKLIST E2E OK');
