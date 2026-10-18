// E2E : mode « Masterset » de la collection (masterset.js) : interrupteur à côté de « Trier », extension la plus fournie par défaut, cartes de la base dans l'ordre
// des numéros (possédées en couleur, manquantes en noir et blanc, « 3/5 » et prix Cardmarket), progression et prix de ce qui manque, cartes par ligne, Toutes / Possédées /
// Manquantes, variantes repliées, ⚠ sur une carte possédée sans édition et « C'est celle-ci » dans la carte en grand, « Ajouter à ma collection », souhaiter les manquantes
// (et Annuler), sélecteur d'édition (de la plus complète à la moins complète, recherche, autres extensions), réglages gardés au rechargement, retour à la liste,
// options du masterset (roue crantée : version foil aussi côte à côte, playset, langue, terrains de base, variantes, par défaut), 360 px sombre, options dans le compte.
import './setup-env.mjs';
import assert from 'node:assert/strict';
import { chromium, startWorld, newPage, txt, ok, toHome, signInFake } from './e2e-world.mjs';

const world = await startWorld({ port: 19620 });
const browser = await chromium.launch({ executablePath: (process.env.CHROMIUM || '/opt/pw-browsers/chromium'), args: ['--no-sandbox'] });
// collection posée une seule fois (le rechargement de la fin garde ce que le test a changé) ; masterset sans les variantes au départ (la base seule, puis 3 les allume)
const seed = `try { if (!localStorage.getItem('deckdeal:coll:v1')) localStorage.setItem('deckdeal:coll:v1', JSON.stringify({ t: '1 Sol Ring (AAA) 1 *FR*\\n2 Arcane Signet (AAA) 2 *EN*\\n1 Wrath of God *EN*\\n1 Llanowar Elves (BBB) 9 *EN*', u: 1, s: '', b: null }));
  if (!localStorage.getItem('deckdeal:ms:v1')) localStorage.setItem('deckdeal:ms:v1', JSON.stringify({ o: { vars: false } })); } catch (e) {}`;
const { p, errs } = await newPage(browser, world, { init: seed });
const H = { 'access-control-allow-origin': '*' };
await p.route('https://api.scryfall.com/sets', route => route.fulfill({ status: 200, headers: H, json: { object: 'list', data: [
  { code: 'aaa', name: 'Alpha Future', icon_svg_uri: 'https://svgs.scryfall.io/sets/aaa.svg?1700000000', set_type: 'expansion', released_at: '2024-02-09', printed_size: 5, card_count: 7 },
  { code: 'bbb', name: 'Beta Masters', icon_svg_uri: 'https://svgs.scryfall.io/sets/bbb.svg?1700000000', set_type: 'masters', released_at: '2023-06-02', printed_size: 10, card_count: 10 },
  { code: 'zzz', name: 'Zeta Quest', icon_svg_uri: 'https://svgs.scryfall.io/sets/zzz.svg?1700000000', set_type: 'expansion', released_at: '2022-01-07', printed_size: 250, card_count: 300 },
  { code: 'ppp', name: 'Promo Pack', icon_svg_uri: 'https://svgs.scryfall.io/sets/ppp.svg?1700000000', set_type: 'promo', released_at: '2021-05-01', card_count: 2 },      // que des promos (pas de total imprimé)
  { code: 'zdg', name: 'Zeta Digital', icon_svg_uri: 'https://svgs.scryfall.io/sets/zdg.svg?1700000000', set_type: 'alchemy', released_at: '2022-03-01', card_count: 30, digital: true },
] } }));
const IMG = (s, n) => `https://cards.scryfall.io/normal/front/a/a/${s}-${n}.jpg`;
const card = (s, num, name, o = {}) => ({ object: 'card', id: s + '-' + num, name, collector_number: String(num), rarity: 'common', set: s, lang: 'en', cmc: 1, mana_cost: '{1}', type_line: 'Artifact', colors: [],
  image_uris: { normal: IMG(s, num) }, prices: { eur: null }, border_color: 'black', frame_effects: [], ...o });
const SETS = {
  aaa: [
    card('aaa', 1, 'Sol Ring', { prices: { eur: '0.20', eur_foil: '1.50' }, finishes: ['nonfoil', 'foil'] }),
    card('aaa', 2, 'Arcane Signet', { rarity: 'mythic', prices: { eur: '12.50' }, finishes: ['foil'] }),      // foil seulement
    card('aaa', 3, 'Wrath of God', { rarity: 'rare', cmc: 4, mana_cost: '{2}{W}{W}', type_line: 'Sorcery', colors: ['W'], prices: { eur: '1.00' }, finishes: ['nonfoil'] }),      // pas de foil
    card('aaa', 4, 'Llanowar Elves', { rarity: 'uncommon', mana_cost: '{G}', type_line: 'Creature — Elf Druid', colors: ['G'], prices: { eur: '0.50' }, finishes: ['nonfoil', 'foil'] }),
    card('aaa', 5, 'Forest', { cmc: 0, mana_cost: '', type_line: 'Basic Land — Forest', prices: { eur: '0.10' } }),
    card('aaa', 6, 'Arcane Signet', { rarity: 'mythic', border_color: 'borderless', prices: { eur: '30.00' } }),
    card('aaa', 7, 'Sol Ring', { frame_effects: ['showcase'], prices: { eur: '2.00' } }),
  ],
  ppp: [card('ppp', 1, 'Swords to Plowshares', { promo: true, prices: { eur: '3.00' } }), card('ppp', 2, 'Command Tower', { promo: true, prices: { eur: '1.00' } })],
  bbb: [card('bbb', 8, 'Command Tower', { type_line: 'Land', prices: { eur: '0.25' } }), card('bbb', 9, 'Llanowar Elves', { prices: { eur: '0.30' } }), card('bbb', 10, 'Swords to Plowshares', { prices: { eur: '1.90' } })],
};
const searches = [];
await p.route(/^https:\/\/api\.scryfall\.com\/cards\/search\?/, route => {
  const u = new URL(route.request().url()), q = u.searchParams.get('q') || '', m = /^e:([a-z0-9]+)$/.exec(q);
  if (!/^e:/.test(q)) return route.fallback();
  searches.push(q);
  if (!m || !SETS[m[1]]) return route.fulfill({ status: 404, headers: H, json: { object: 'error', code: 'not_found' } });      // « e:aaa lang:fr » : pas d'impression française
  route.fulfill({ status: 200, headers: H, json: { object: 'list', has_more: false, data: SETS[m[1]] } });
});
const stored = () => p.evaluate(() => JSON.parse(localStorage.getItem('deckdeal:coll:v1')).t.replace(/ \(D[0-9a-z]+\)/g, '').split('\n').sort().join('\n'));
const tiles = sel => p.$$eval(sel + ' .ms-c', l => l.map(c => ({ cls: c.classList.contains('own') ? 'own' : 'miss', num: c.querySelector('.ms-num').textContent, px: ((c.querySelector('.ms-px') || {}).textContent || '').replace(/\s/g, ' '),
  q: (c.querySelector('.ms-q') || {}).textContent || '', warn: !!c.querySelector('.ms-warn'), img: (c.querySelector('img') || {}).src || '', gray: getComputedStyle(c.querySelector('.dvc-art')).filter })));
const base = () => tiles('.ms-grid');
const closeImg = async () => { await p.keyboard.press('Escape'); await p.waitForFunction(() => !document.querySelector('.imgv'), null, { timeout: 3000 }); };

await p.waitForTimeout(400); await toHome(p); await p.click('#btnColl'); await p.waitForSelector('.coll.on');
await p.waitForSelector('.coll .crow');

/* ── 1) interrupteur : extension la plus fournie, cartes de la base par numéro, possédées en couleur, manquantes en noir et blanc ───── */
assert.equal(await p.$eval('.coll-ms', b => [b.hidden, b.getAttribute('aria-pressed')].join()), 'false,false', 'interrupteur « Masterset » à côté de « Trier »');
assert.equal(await p.$eval('.ms-pick', b => b.hidden), true, 'sélecteur d\'édition caché tant que le masterset est éteint');
await p.click('.coll-ms');
await p.waitForFunction(() => document.querySelectorAll('.ms-grid .ms-c').length === 5, null, { timeout: 8000 });
assert.equal(await p.$eval('.coll-ms', b => b.getAttribute('aria-pressed')), 'true');
assert.equal(await p.$eval('.coll-sort', l => l.hidden), true, '« Trier » remplacé par le sélecteur d\'édition');
assert.equal(await txt(p, '.ms-pick b'), 'Alpha Future', 'extension la plus fournie (2 cartes de la base) avant Beta Masters (1)');
assert.equal(await txt(p, '.ms-head b'), 'Alpha Future'); assert.match(await txt(p, '.ms-head small'), /^AAA · 2024 · 5 cartes$/);
assert.ok(searches.includes('e:aaa'), 'cartes de l\'extension lues sur Scryfall'); assert.ok(!searches.includes('e:bbb'), 'seulement l\'extension affichée');
let b = await base();
assert.deepEqual(b.map(x => x.num), ['1/5', '2/5', '3/5', '4/5', '5/5'], 'base : numéros jusqu\'au total imprimé, dans l\'ordre');
assert.deepEqual(b.map(x => x.cls), ['own', 'own', 'miss', 'miss', 'miss'], 'possédée = l\'impression exacte (Llanowar Elves de BBB ne compte pas ici)');
assert.deepEqual(b.map(x => x.px), ['0,20 €', '12,50 €', '1,00 €', '0,50 €', '0,10 €'], 'prix Cardmarket sous chaque carte');
assert.deepEqual(b.map(x => x.q), ['', '×2', '', '', ''], 'nombre d\'exemplaires à partir de 2');
assert.deepEqual(b.map(x => x.warn), [false, false, true, false, false], '⚠ : Wrath of God est dans la collection sans édition');
assert.ok(b[2].gray.includes('grayscale(1)') && b[0].gray === 'none', 'manquante en noir et blanc, possédée en couleur');
assert.equal(b[0].img, IMG('aaa', 1).replace('/normal/', '/small/'), 'petites images dans la grille');
assert.equal(await txt(p, '.ms-head + .ms-prog .ms-pn'), '2 / 5 · 40 %');
const ratio = sel => p.$eval(sel, e => Math.round(100 * e.querySelector('.fill').getBoundingClientRect().width / e.querySelector('.track').getBoundingClientRect().width));
assert.equal(await ratio('.ms-head + .ms-prog'), 40, 'barre de progression remplie à 40 %');
assert.equal((await txt(p, '.ms-val')).replace(/\s/g, ' '), 'Il te manque ≈ 1,60 € · l\'édition complète ≈ 14,30 €');
assert.match(await txt(p, '.ms-legend'), /1 carte que tu as peut-être sans édition/);
await p.screenshot({ path: 'shots/masterset-1-base.png' });
ok('masterset : extension la plus fournie, base par numéro, possédées en couleur, manquantes en noir et blanc, 2 / 5 · 40 %, il manque 1,60 €');

/* ── 2) cartes par ligne, Toutes / Possédées / Manquantes, rareté, recherche de la collection ───────────────────────── */
assert.equal(await p.$eval('.ms-grid', g => [g.className, getComputedStyle(g).gridTemplateColumns.split(' ').length].join()), 'ms-grid c4,4', '4 cartes par ligne par défaut');
await p.selectOption('select.ms-cols', '6'); await p.waitForFunction(() => document.querySelector('.ms-grid.c6'));
assert.equal(await p.$eval('.ms-grid', g => getComputedStyle(g).gridTemplateColumns.split(' ').length), 6);
assert.equal(await p.evaluate(() => JSON.parse(localStorage.getItem('deckdeal:ms:v1')).cols), 6, 'choix gardé sur l\'appareil');
await p.click('[data-act="msshow"][data-v="miss"]'); await p.waitForFunction(() => document.querySelectorAll('.ms-grid .ms-c').length === 3);
assert.deepEqual((await base()).map(x => x.num), ['3/5', '4/5', '5/5'], 'Manquantes');
assert.match(await txt(p, '.coll-count'), /3 cartes sur 5/);
await p.click('[data-act="msshow"][data-v="own"]'); await p.waitForFunction(() => document.querySelectorAll('.ms-grid .ms-c').length === 2);
await p.click('[data-act="msshow"][data-v="all"]'); await p.click('[data-act="msrar"][data-r="mythic"]'); await p.waitForFunction(() => document.querySelectorAll('.ms-grid .ms-c').length === 1);
assert.deepEqual((await base()).map(x => x.num), ['2/5'], 'rareté : mythiques');
await p.click('[data-act="msrar"][data-r="mythic"]');
await p.fill('#collF input', 'wrath'); await p.waitForFunction(() => document.querySelectorAll('.ms-grid .ms-c').length === 1);
assert.deepEqual((await base()).map(x => x.num), ['3/5'], 'recherche de la collection appliquée à la grille');
await p.fill('#collF input', ''); await p.waitForFunction(() => document.querySelectorAll('.ms-grid .ms-c').length === 5);
ok('cartes par ligne (6, gardé), Toutes / Possédées / Manquantes, rareté et recherche');

/* ── 3) variantes (options) : sans elles, la base seule et pas d'extension faite que de promos ; avec elles, à la suite de la base, dans la progression ─── */
const ms = () => p.evaluate(() => JSON.parse(localStorage.getItem('deckdeal:ms:v1')));
assert.equal((await ms()).o.vars, false, 'départ du test : sans les variantes');
assert.equal(await p.$('.ms-var, .ms-vh'), null, 'plus de section repliée');
await p.evaluate(() => collBump('command tower', 'Command Tower', 1, { lang: lineKey('en', edKey('ppp', '2')) }));      // une promo de Promo Pack (que des promos)
await p.click('.ms-pick'); await p.waitForSelector('.sheet-wrap.open .ms-srow');
let sets = await p.$$eval('.sheet-wrap.open .ms-srow', l => l.map(r => r.dataset.set));
assert.deepEqual(sets, ['aaa', 'bbb'], 'sans les variantes : Promo Pack (que des promos) n\'est pas proposée');
await p.keyboard.press('Escape'); await p.waitForFunction(() => !document.querySelector('.sheet-wrap.open'));
await p.evaluate(() => msSelect('ppp')); await p.waitForSelector('.ms-onlyv');
assert.match(await txt(p, '.ms-onlyv'), /Cette extension n'a que des variantes.*allume « Variantes »/);
await p.click('.ms-onlyv [data-act="msopt"]'); await p.waitForSelector('.sheet-wrap.open .ms-opts');
await p.click('label[for="msO-vars"]'); await p.keyboard.press('Escape'); await p.waitForFunction(() => !document.querySelector('.sheet-wrap.open'));
await p.waitForFunction(() => document.querySelectorAll('.ms-grid .ms-c').length === 2);
assert.deepEqual((await base()).map(x => [x.num, x.cls]), [['#1', 'miss'], ['#2', 'own']], 'avec les variantes : ses promos (« #1 »)');
await p.click('.ms-pick'); await p.waitForSelector('.sheet-wrap.open .ms-srow');
sets = await p.$$eval('.sheet-wrap.open .ms-srow', l => l.map(r => [r.dataset.set, r.querySelector('.ms-sp small').textContent]));
assert.deepEqual(sets, [['ppp', '1/2 · 50 %'], ['aaa', '2/7 · 28 %'], ['bbb', '1/10 · 10 %']], 'avec les variantes : proposée ; Alpha Future compte ses 7 cartes');
await p.click('.sheet-wrap.open .ms-srow[data-set="aaa"]');
await p.waitForFunction(() => document.querySelectorAll('.ms-grid .ms-c').length === 7, null, { timeout: 8000 });
b = await base();
assert.deepEqual(b.map(x => [x.num, x.cls]), [['1/5', 'own'], ['2/5', 'own'], ['3/5', 'miss'], ['4/5', 'miss'], ['5/5', 'miss'], ['#6', 'miss'], ['#7', 'miss']], 'variantes à la suite de la base, numéros au-delà du total imprimé');
assert.deepEqual(b.slice(5).map(x => x.px), ['30,00 €', '2,00 €']);
assert.equal(await txt(p, '.ms-head + .ms-prog .ms-pn'), '2 / 7 · 28 %', 'variantes dans la progression'); assert.match(await txt(p, '.ms-head small'), /· 7 cartes$/);
assert.equal((await txt(p, '.ms-val')).replace(/\s/g, ' '), 'Il te manque ≈ 33,60 € · l\'édition complète ≈ 46,30 €');
await p.evaluate(() => collBump('command tower', 'Command Tower', -1, { lang: lineKey('en', edKey('ppp', '2')) }));
ok('variantes : sans elles, base seule et Promo Pack (que des promos) ni proposée ni comptée ; avec elles, à la suite de la base (« #6 »), 2 / 7');

/* ── 4) carte possédée sans édition : « C'est celle-ci » dans la carte en grand ; 1 exemplaire, puis D : « Combien sont de cette édition ? » (3 exemplaires) ; Annuler ─── */
await p.click('.ms-grid .ms-c >> nth=2 >> .ms-open'); await p.waitForSelector('.imgv .imgv-rep:not([hidden])');
assert.match(await txt(p, '.imgv-extra'), /Tu as 1 exemplaire de cette carte sans édition : est-ce celui-ci \? · prix Cardmarket 1,00/);
assert.equal(await txt(p, '.imgv-rep'), 'C\'est celle-ci : poser l\'édition AAA 3');
assert.equal(await p.$eval('.imgv-cnt', e => e.hidden), true, '1 exemplaire : pas de compteur');
assert.equal(await p.$eval('.imgv-rep', e => e.classList.contains('strong')), true, 'bouton mis en avant');
await p.click('.imgv-rep');
await p.waitForFunction(() => document.querySelector('.imgv-rep').disabled);
assert.equal(await txt(p, '.imgv-rep'), '✓ Édition posée');
assert.equal(await stored(), '1 Llanowar Elves (BBB) 9 *EN*\n1 Sol Ring (AAA) 1 *FR*\n1 Wrath of God (AAA) 3 *EN*\n2 Arcane Signet (AAA) 2 *EN*', 'édition posée sur l\'exemplaire (texte du compte)');
await closeImg();
await p.waitForFunction(() => document.querySelector('.ms-grid .ms-c:nth-child(3)').classList.contains('own'));
b = await base(); assert.equal(b[2].warn, false); assert.equal(await txt(p, '.ms-head + .ms-prog .ms-pn'), '3 / 7 · 42 %'); assert.equal(await p.$('.ms-legend'), null, 'plus de carte à vérifier : légende retirée');
await p.click('#toast .toast-act');
await p.waitForFunction(() => document.querySelector('.ms-grid .ms-c:nth-child(3)').classList.contains('miss'));
assert.match(await stored(), /1 Wrath of God \*EN\*/, 'Annuler : l\'exemplaire redevient sans édition');
// D : 3 exemplaires sans édition → « Combien sont de cette édition ? − n + / 3 »
await p.evaluate(() => collBump('wrath of god', 'Wrath of God', 2, { lang: 'en' }));
await p.click('.ms-grid .ms-c >> nth=2 >> .ms-open'); await p.waitForSelector('.imgv .imgv-cnt:not([hidden])');
assert.match(await txt(p, '.imgv-extra'), /^Tu as 3 exemplaires de cette carte sans édition · prix Cardmarket 1,00/);
assert.equal((await txt(p, '.imgv-cnt')).replace(/\s/g, ''), 'Combiensontdecetteédition?−1+/3');
assert.equal(await txt(p, '.imgv-rep'), 'C\'est celle-ci : poser l\'édition AAA 3 sur 1 exemplaire');
await p.click('.imgv-cnt [data-d="1"]'); await p.click('.imgv-cnt [data-d="1"]'); await p.click('.imgv-cnt [data-d="1"]');
assert.equal(await txt(p, '.imgv-cnt b'), '3', 'jamais plus que les exemplaires sans édition');
await p.click('.imgv-cnt [data-d="-1"]');
assert.equal(await txt(p, '.imgv-rep'), 'C\'est celle-ci : poser l\'édition AAA 3 sur 2 exemplaires');
await p.screenshot({ path: 'shots/masterset-4-combien.png' });
await p.click('.imgv-rep'); await p.waitForFunction(() => document.querySelector('.imgv-rep').disabled);
assert.equal(await p.$eval('.imgv-cnt', e => e.hidden), true, 'fait : compteur caché'); assert.match(await txt(p, '.imgv-extra'), /AAA 3 · 2 exemplaires/);
assert.match(await stored(), /2 Wrath of God \(AAA\) 3 \*EN\*/); assert.match(await stored(), /1 Wrath of God \*EN\*/);
await closeImg();
await p.click('#toast .toast-act'); await p.waitForTimeout(200);
assert.match(await stored(), /3 Wrath of God \*EN\*/, 'Annuler : les 2 redeviennent sans édition');
await p.evaluate(() => collBump('wrath of god', 'Wrath of God', -2, { lang: 'en' }));
await p.click('.ms-grid .ms-c >> nth=2 >> .ms-open'); await p.waitForSelector('.imgv .imgv-rep:not([hidden])'); await p.click('.imgv-rep'); await p.waitForFunction(() => document.querySelector('.imgv-rep').disabled); await closeImg();
ok('⚠ sur la vignette, « C\'est celle-ci » dans la carte en grand : édition posée (3 / 7), Annuler ; D : « Combien sont de cette édition ? » (2 sur 3), Annuler');

/* ── 5) carte manquante : « Ajouter à ma collection » (cette impression, langue des cartes) ; carte possédée : sa ligne de collection ─── */
await p.click('.ms-grid .ms-c >> nth=3 >> .ms-open'); await p.waitForSelector('.imgv .imgv-rep:not([hidden])');
assert.match(await txt(p, '.imgv-extra'), /Pas dans ta collection · prix Cardmarket 0,50/);
assert.equal(await txt(p, '.imgv-rep'), '+ Ajouter à ma collection (AAA 4)');
await p.click('.imgv-rep'); await p.waitForFunction(() => document.querySelector('.imgv-rep').disabled);
await p.click('.imgv-nav.prev'); await p.waitForTimeout(250);
assert.equal(await p.$eval('.imgv-rep', r => r.hidden), true, 'carte possédée : pas d\'action'); assert.match(await txt(p, '.imgv-extra'), /exemplaire dans ta collection/);
await closeImg();
assert.match(await stored(), /1 Llanowar Elves \(AAA\) 4 \*FR\*/, 'ajoutée avec cette édition, en français (langue des cartes)');
assert.match(await stored(), /1 Llanowar Elves \(BBB\) 9 \*EN\*/, 'l\'autre impression reste');
await p.waitForFunction(() => /4 \/ 7 · 57 %/.test(document.querySelector('.ms-head + .ms-prog .ms-pn').textContent));
ok('« Ajouter à ma collection » : AAA 4 en français, 4 / 7 · 57 % ; carte possédée : sa ligne de collection');

/* ── 6) souhaiter les manquantes (terrains de base exclus, variantes ouvertes comprises), Annuler ───────────────── */
assert.equal(await txt(p, '.ms-wish'), '☆ Souhaiter les 2 cartes manquantes', 'Forest (terrain de base) exclu ; les 2 variantes comptent');
await p.click('.ms-wish'); await p.waitForSelector('.sheet-wrap.open [data-ok]');
assert.match(await txt(p, '.sheet-wrap.open .sheet-body'), /2 cartes manquantes entrent dans ta liste de souhaits/);
await p.click('.sheet-wrap.open [data-ok]'); await p.waitForTimeout(300);
const wish = () => p.evaluate(() => Object.fromEntries(Object.entries(TR.wish).map(([k, w]) => [k, [w.i, w.w]])));
assert.deepEqual(await wish(), { 'arcane signet': [IMG('aaa', 6), 'Alpha Future · AAA 6'], 'sol ring': [IMG('aaa', 7), 'Alpha Future · AAA 7'] }, 'illustrations de cette édition dans la liste de souhaits');
assert.equal(await p.$('.ms-wish'), null, 'plus rien à souhaiter');
await p.click('#toast .toast-act'); await p.waitForTimeout(200);
assert.deepEqual(await wish(), {}, 'Annuler : liste de souhaits d\'avant');
ok('souhaiter les manquantes : 2 illustrations exactes, Annuler');

/* ── 6 bis) « Chercher les N cartes manquantes sur CardTrader » : liste aux éditions exactes dans Prix d'une liste ; recherche CardTrader et Cardmarket ─── */
assert.equal(await txt(p, '.ms-buy'), 'Chercher les 2 cartes manquantes sur CardTrader', 'bouton à côté de « Souhaiter » (variantes comprises, terrain de base exclu)');
await p.click('.ms-buy');
await p.waitForFunction(() => S.view === 'input' && !COLL.el, null, { timeout: 5000 });
assert.equal(await p.$eval('#deckText', t => t.value), '1 Arcane Signet (AAA) 6\n1 Sol Ring (AAA) 7', 'une ligne par carte, avec son édition');
assert.equal(await p.$eval('#exactEdRow', r => r.hidden), false, 'interrupteur « Éditions exactes » montré (la liste a des éditions)');
assert.equal(await p.$eval('#optExactEd', x => x.checked), true, 'allumé par le masterset');
const need = () => p.evaluate(() => S.deck.cards.map(c => [c.key, c.need]).sort());
assert.deepEqual(await need(), [['arcane signet', 1], ['sol ring', 1]], 'éditions exactes : Sol Ring AAA 1 ne compte pas pour AAA 7');
await p.click('label[for="optExactEd"] .switch'); await p.waitForTimeout(150);
assert.deepEqual(await need(), [['arcane signet', 0], ['sol ring', 0]], 'éteint : déjà possédées par leur nom, comme avant');
await p.click('label[for="optExactEd"] .switch'); await p.waitForTimeout(150);
assert.deepEqual(await need(), [['arcane signet', 1], ['sol ring', 1]]);
// CardTrader : seulement l'impression demandée (faux monde : Sol Ring = CMM 400, Arcane Signet = CMM 402)
await p.fill('#deckText', '1 Sol Ring (CMM) 400\n1 Arcane Signet (CMM) 999'); await p.waitForTimeout(250);
await p.click('#btnRun'); await p.waitForFunction(() => S.run && S.run.status === 'done', null, { timeout: 30000 }); await p.waitForTimeout(500);
let rs = await p.evaluate(() => ({ sol: S.run.cards['sol ring'], sig: S.run.cards['arcane signet'], src: S.run.src }));
assert.equal(rs.src, 'ct');
assert.ok(rs.sol.offers.length > 0 && rs.sol.offers.every(o => o.num === '400'), 'offres de CMM 400 seulement');
assert.equal(rs.sig.notFound, true, 'édition introuvable (CMM 999) : introuvable, pas une autre impression');
assert.match(await txt(p, '#list .rw[data-key="sol ring"]'), /CMM 400/);
assert.match(await txt(p, '#recap'), /éditions exactes/i);
await p.screenshot({ path: 'shots/masterset-3-cardtrader.png' });
// Cardmarket : le prix de l'édition demandée (faux /cards/collection pour l'extension AAA)
await p.route('https://api.scryfall.com/cards/collection', route => {
  const ids = (JSON.parse(route.request().postData() || '{}').identifiers || []);
  if (!ids.length || !ids.every(i => i.set === 'aaa')) return route.fallback();
  route.fulfill({ status: 200, headers: H, json: { object: 'list', not_found: [], data: ids.map(i => SETS.aaa.find(c => c.collector_number === i.collector_number)).filter(Boolean) } });
});
await p.evaluate(() => showView('input')); await p.click('#segSrcRun [data-v="cm"]');
await p.fill('#deckText', '1 Sol Ring (AAA) 7'); await p.waitForTimeout(250);
await p.click('#btnRun'); await p.waitForFunction(() => S.run && S.run.src === 'cm' && S.run.status === 'done', null, { timeout: 30000 }); await p.waitForTimeout(400);
rs = await p.evaluate(() => S.run.cards['sol ring'].offers.map(o => [o.price, o.set, o.num]));
assert.deepEqual(rs, [[200, 'aaa', '7']], 'Cardmarket : prix de AAA 7 (2,00 €), pas celui de Sol Ring en général');
assert.match(await txt(p, '#list .rw[data-key="sol ring"]'), /AAA 7/);
await p.click('#segSrcRun [data-v="ct"]').catch(() => {});
await p.evaluate(() => showView('home')); await p.click('#btnColl'); await p.waitForSelector('.coll.on'); await p.waitForSelector('.ms-grid');
ok('« Chercher les 2 cartes manquantes sur CardTrader » : liste aux éditions exactes, possédées par édition ; CardTrader CMM 400 seulement, CMM 999 introuvable ; Cardmarket au prix de AAA 7');

/* ── 7) sélecteur d'édition : de la plus fournie à la moins fournie, recherche, autres extensions ──────────────────── */
await p.click('.ms-pick'); await p.waitForSelector('.sheet-wrap.open .ms-srow');
const rowsTxt = () => p.$$eval('.sheet-wrap.open .ms-srow', l => l.map(r => [r.dataset.set, r.querySelector('.ms-sp small').textContent, r.getAttribute('aria-pressed')]));
assert.deepEqual(await rowsTxt(), [['aaa', '4/7 · 57 %', 'true'], ['bbb', '1/10 · 10 %', 'false']], 'extensions de la collection, la plus complète d\'abord, progression');
assert.deepEqual([await ratio('.ms-srow[data-set="aaa"] .ms-sp'), await ratio('.ms-srow[data-set="bbb"] .ms-sp')], [57, 10], 'barres du sélecteur remplies');
assert.ok(await p.$eval('.sheet-wrap.open .ms-sq', e => e.closest('.sheet-body') && getComputedStyle(e).position === 'sticky'), 'recherche dans la feuille, en haut de la liste');
await p.fill('.sheet-wrap.open .ms-sq input', 'zeta'); await p.waitForTimeout(150);
assert.deepEqual(await rowsTxt(), [['zzz', '0/300 · 0 %', 'false']], 'recherche : autres extensions papier (pas les numériques), toutes leurs cartes avec les variantes');
assert.match(await txt(p, '.sheet-wrap.open .ms-sh'), /Autres extensions/i);
await p.fill('.sheet-wrap.open .ms-sq input', 'beta'); await p.waitForTimeout(150);
await p.click('.sheet-wrap.open .ms-srow[data-set="bbb"]');
await p.waitForFunction(() => document.querySelectorAll('.ms-grid .ms-c').length === 3, null, { timeout: 8000 });
assert.equal(await txt(p, '.ms-pick b'), 'Beta Masters');
b = await base(); assert.deepEqual(b.map(x => [x.num, x.cls]), [['8/10', 'miss'], ['9/10', 'own'], ['10/10', 'miss']]);
ok('sélecteur : Alpha Future (4/7) puis Beta Masters (1/10), recherche « zeta » → autres extensions, Beta Masters affichée');

/* ── 8) rechargement : masterset, extension et cartes par ligne gardés ; éteint : la liste et « Trier » reviennent ─────── */
await p.reload(); await p.waitForTimeout(700); await toHome(p); await p.click('#btnColl'); await p.waitForSelector('.coll.on');
await p.waitForFunction(() => document.querySelectorAll('.ms-grid.c6 .ms-c').length === 3, null, { timeout: 8000 });
assert.equal(await txt(p, '.ms-pick b'), 'Beta Masters');
await p.click('.coll-ms'); await p.waitForSelector('.coll .crow');
assert.equal(await p.$eval('.coll-sort', l => l.hidden), false); assert.equal(await p.$eval('.ms-pick', b => b.hidden), true); assert.equal(await p.$('.ms-grid'), null);
assert.equal(await p.$eval('.ms-opt', b => b.hidden), true, 'roue des options seulement en masterset');
await p.click('#collSeg [data-v="stats"]'); await p.waitForTimeout(250);
assert.equal(await p.$eval('.coll-ms', b => b.hidden), true, 'interrupteur seulement dans Cartes');
await p.click('#collSeg [data-v="list"]'); await p.click('.coll-ms'); await p.waitForSelector('.ms-grid');
ok('rechargement : masterset, Beta Masters et 6 par ligne gardés ; éteint : liste et « Trier » ; interrupteur seulement dans Cartes');

/* ── 8 bis) sélecteur : de la plus complète à la moins complète (pourcentage, pas le nombre de cartes) ──────────────────── */
const zzz = d => p.evaluate(d => { for (const n of ['1', '2', '3', '4', '5']) collBump('sol ring', 'Sol Ring', d, { lang: lineKey('en', edKey('zzz', n)) }); }, d);
await zzz(1);      // 5 cartes de Zeta Quest (5/250) : plus que Alpha Future (4/5), mais bien moins complète
await p.click('.ms-pick'); await p.waitForSelector('.sheet-wrap.open .ms-srow');
assert.deepEqual(await rowsTxt(), [['aaa', '4/7 · 57 %', 'false'], ['bbb', '1/3 · 33 %', 'true'], ['zzz', '5/300 · 1 %', 'false']], 'pourcentage d\'abord : Alpha Future (57 %), Beta Masters (33 % : ses cartes lues), Zeta Quest (1 %, 5 cartes)');
assert.match(await txt(p, '.sheet-wrap.open .sheet-head p'), /de la plus complète à la moins complète/);
await p.click('.sheet-wrap.open .ms-srow[data-set="aaa"]');
await p.waitForFunction(() => document.querySelectorAll('.ms-grid .ms-c').length === 7, null, { timeout: 8000 });
await zzz(-1);
ok('sélecteur : de la plus complète à la moins complète (57 %, 33 %, puis 1 % malgré ses 5 cartes)');

/* ── 8 ter) options du masterset : roue crantée au bout de la rangée, version foil aussi (paires), playset, langue, terrains de base, variantes, par défaut ─── */
assert.equal(await p.$eval('.ms-opt', b => [b.hidden, b.classList.contains('on'), !!b.querySelector('svg.ms-gear')].join()), 'false,false,true', 'roue crantée affichée en masterset, options par défaut');
assert.ok(await p.evaluate(() => { const r = document.querySelector('.coll-srow').getBoundingClientRect(), g = document.querySelector('.ms-opt').getBoundingClientRect(); return r.right - g.right < 2; }), 'au bout de la rangée');
const opt = async () => { if (!(await p.$('.sheet-wrap.open .ms-opts'))) { await p.click('.ms-opt'); await p.waitForSelector('.sheet-wrap.open .ms-opts'); } };
const shut = async () => { await p.keyboard.press('Escape'); await p.waitForFunction(() => !document.querySelector('.sheet-wrap.open'), null, { timeout: 3000 }); };
const pn = () => txt(p, '.ms-head + .ms-prog .ms-pn');
await opt();
assert.match(await txt(p, '.sheet-wrap.open .sheet-head'), /Options du masterset/); assert.match(await txt(p, '.sheet-wrap.open .sheet-head'), /Sur cet appareil/);
assert.deepEqual(await p.$$eval('.ms-opts input[type="checkbox"]', l => l.map(i => [i.dataset.o, i.checked])), [['foil', false], ['basic', true], ['vars', true]]);
await p.click('label[for="msO-foil"]');
await p.waitForSelector('.ms-grid.pairs.c2 .ms-pair');
await p.screenshot({ path: 'shots/masterset-5-options.png' });
await shut();
const pairs = () => p.$$eval('.ms-grid .ms-c', l => l.map(c => [c.classList.contains('own') ? 'own' : c.classList.contains('part') ? 'part' : 'miss',
  ...[...c.querySelectorAll('.ms-h')].map(h => (h.classList.contains('fo') ? 'F:' : 'N:') + (h.classList.contains('none') ? h.textContent.trim() : h.classList.contains('own') ? 'own' : 'miss') + (h.querySelector('.ms-fx') ? '✦' : ''))]));
assert.deepEqual(await pairs(), [
  ['part', 'N:own', 'F:miss✦'], ['miss', 'N:Foil seulement', 'F:miss✦'], ['own', 'N:own', 'F:Pas de foil'], ['part', 'N:own', 'F:miss✦'], ['miss', 'N:miss', 'F:miss✦'],
  ['miss', 'N:miss', 'F:miss✦'], ['miss', 'N:miss', 'F:miss✦'],
], 'normale et foil côte à côte (finitions Scryfall : Arcane Signet foil seulement, Wrath of God sans foil) ; la foil irisée, même manquante');
assert.equal(await pn(), '3 / 12 · 25 %', 'progression case par case : 12 cases (normales et foil), 3 complètes');
await p.evaluate(() => { const g = document.querySelector('.coll-srow'); g.scrollIntoView({ block: 'start' }); document.querySelector('.coll .dv-scroll').scrollTop -= 8; }); await p.waitForTimeout(300); await p.screenshot({ path: 'shots/masterset-6-foil.png' });
assert.deepEqual(await p.$$eval('.ms-c:first-child .ms-px', l => l.map(e => e.textContent.replace(/\s/g, ' '))), ['0,20 €', '✦ 1,50 €'], 'prix normal et prix foil');
assert.ok(await p.$eval('.ms-c:first-child .ms-h.fo', h => getComputedStyle(h.querySelector('.dvc-art')).filter.includes('grayscale') && getComputedStyle(h.querySelector('.ms-fx')).opacity > 0.3), 'foil manquante : grisée, voile irisé gardé');
assert.equal(await txt(p, '.ms-osum'), '✦ Normale et foil'); assert.equal(await p.$eval('.ms-opt', b => b.classList.contains('on')), true, 'roue allumée : options changées');
assert.deepEqual(await p.$$eval('select.ms-cols option', l => l.map(o => o.value)), ['1', '2', '3', '4'], 'paires par ligne');
// la case foil de Sol Ring : « Pas en foil dans ta collection », « + Ajouter à ma collection (AAA 1, foil) »
await p.click('.ms-c:first-child .ms-h.fo .ms-open'); await p.waitForSelector('.imgv .imgv-rep:not([hidden])');
assert.match(await txt(p, '.imgv-extra'), /^Pas en foil dans ta collection · prix Cardmarket 1,50/);
assert.equal(await txt(p, '.imgv-rep'), '+ Ajouter à ma collection (AAA 1, foil)');
assert.equal(await p.$eval('.imgv-card', c => c.classList.contains('foil')), true, 'carte en grand : étincelles foil');
await p.click('.imgv-rep'); await p.waitForFunction(() => document.querySelector('.imgv-rep').disabled); await closeImg();
assert.match(await stored(), /1 Sol Ring \(FOIL\) \(AAA\) 1 \*FR\*/, 'exemplaire foil ajouté, dans cette édition');
await p.waitForFunction(() => document.querySelector('.ms-c:first-child').classList.contains('own'));
assert.equal(await pn(), '4 / 12 · 33 %');
await p.selectOption('select.ms-cols', '3'); await p.waitForSelector('.ms-grid.pairs.c3');
ok('version foil aussi : paires normale · foil (finitions Scryfall, case en creux), 3 / 12 puis 4 / 12 avec la foil ajoutée, prix foil, roue allumée, paires par ligne');
// playset : 4 exemplaires par carte (sans la version foil)
await opt(); await p.click('label[for="msO-foil"]'); await p.click('.ms-opts [data-o="need"][data-v="4"]');
await p.waitForFunction(() => /Playset/.test((document.querySelector('.ms-osum') || {}).textContent || ''));
await shut();
b = await base();
assert.deepEqual(b.map(x => [x.cls, x.q]), [['miss', '2/4'], ['miss', '2/4'], ['miss', '1/4'], ['miss', '1/4'], ['miss', ''], ['miss', ''], ['miss', '']], 'playset : « 2/4 », « 1/4 » sur les cartes entamées (Sol Ring : normale et foil)');
assert.equal(await p.$$eval('.ms-c.part', l => l.length), 4); assert.equal(await pn(), '0 / 7 · 0 %');
assert.equal(await txt(p, '.ms-wish'), '☆ Souhaiter les 4 cartes manquantes', 'cartes incomplètes à souhaiter (pas le terrain de base)');
// langue : seuls les exemplaires français comptent
await opt(); await p.click('.ms-opts [data-o="need"][data-v="1"]'); await p.selectOption('.ms-opts select[data-o="lang"]', 'fr');
await p.waitForFunction(() => /Français/i.test((document.querySelector('.ms-osum') || {}).textContent || ''));
await shut();
b = await base(); assert.deepEqual(b.map(x => x.cls), ['own', 'miss', 'miss', 'own', 'miss', 'miss', 'miss'], 'en français : Sol Ring et Llanowar Elves seulement');
assert.equal(await pn(), '2 / 7 · 28 %');
// sans terrains de base, sans variantes
await opt(); await p.click('label[for="msO-basic"]'); await p.click('label[for="msO-vars"]'); await shut();
await p.waitForFunction(() => document.querySelectorAll('.ms-grid .ms-c').length === 4);
assert.match(await txt(p, '.ms-head small'), /· 4 cartes$/); assert.equal(await pn(), '2 / 4 · 50 %'); assert.deepEqual((await base()).map(x => x.num), ['1/5', '2/5', '3/5', '4/5'], 'ni Forest ni variantes');
assert.equal((await txt(p, '.ms-osum')).replace(/\s+/g, ' '), 'Français Sans terrains de base Sans variantes');
assert.deepEqual(await p.evaluate(() => JSON.parse(localStorage.getItem('deckdeal:ms:v1')).o), { foil: false, basic: false, vars: false, need: 1, lang: 'fr' }, 'options gardées sur l\'appareil');
// par défaut
await opt(); await p.click('.ms-oreset'); await p.waitForFunction(() => !document.querySelector('.ms-oreset'));
await shut();
assert.equal(await p.$('.ms-osum'), null); assert.equal(await p.$eval('.ms-opt', b => b.classList.contains('on')), false);
assert.equal(await pn(), '4 / 7 · 57 %'); assert.equal((await base()).length, 7, 'Forest et variantes revenus');
b = await base(); assert.equal(b[0].q, '×2', 'sans la version foil : la foil compte comme un autre exemplaire');
ok('options : playset (2/4, 0 / 7), langue (français : 2 / 7), sans terrains de base ni variantes (2 / 4), gardées sur l\'appareil ; par défaut : 4 / 7');

/* ── 9) téléphone 360 px, thème sombre : rien ne déborde ──────────────────────────────────────────────── */
await p.setViewportSize({ width: 360, height: 740 }); await p.evaluate(() => { document.documentElement.dataset.theme = 'dark'; });
await p.selectOption('select.ms-cols', '5'); await p.waitForSelector('.ms-grid.c5');
assert.equal(await p.evaluate(() => { const s = document.querySelector('.coll .dv-scroll'); return s.scrollWidth <= s.clientWidth + 1; }), true, 'pas de défilement horizontal à 360 px');
assert.equal(await p.evaluate(() => [...document.querySelectorAll('.ms-c')].every(c => { const r = c.getBoundingClientRect(); return r.right <= innerWidth + 1 && r.width > 40; })), true, '5 cartes de front dans l\'écran');
await p.screenshot({ path: 'shots/masterset-2-360-sombre.png' });
ok('360 px sombre, 5 par ligne : rien ne déborde');

/* ── 10) options dans le compte : celles de l'appareil envoyées au compte, celles du compte (plus récentes) appliquées ───────────── */
await p.setViewportSize({ width: 1280, height: 900 });
await p.evaluate(() => { document.documentElement.dataset.theme = 'light'; msOptSet({ need: 4 }); });
await signInFake(p);
await p.waitForFunction(async () => { const d = (await D.cloud.pullMeta(D.uid, 'masterset')).data; return d && d.o && d.o.need === 4; }, null, { timeout: 5000 });
await p.evaluate(async () => { await D.cloud.saveMeta(D.uid, 'masterset', { o: { ...msClean(MS.o), need: 1, foil: true }, updatedAt: Date.now() + 5000 }); msUser(D.user); });
await p.waitForFunction(() => MS.o.foil === true && MS.o.need === 1, null, { timeout: 5000 });
await p.waitForSelector('.ms-grid.pairs');
await p.click('.ms-opt'); await p.waitForSelector('.sheet-wrap.open .ms-opts');
assert.match(await txt(p, '.sheet-wrap.open .sheet-head'), /Enregistrées dans ton compte/);
await shut();
ok('options du masterset dans le compte : envoyées au compte vide, celles du compte (plus récentes) appliquées à la grille');

assert.deepEqual(errs, [], 'erreurs page : ' + errs.join(' | '));
await browser.close(); world.stop();
console.log('\nMASTERSET E2E OK');
