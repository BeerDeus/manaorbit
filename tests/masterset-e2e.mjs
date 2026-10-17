// E2E : mode « Masterset » de la collection (masterset.js) : interrupteur à côté de « Trier », extension la plus fournie par défaut, cartes de la base dans l'ordre
// des numéros (possédées en couleur, manquantes en noir et blanc, « 3/5 » et prix Cardmarket), progression et prix de ce qui manque, cartes par ligne, Toutes / Possédées /
// Manquantes, variantes repliées, ⚠ sur une carte possédée sans édition et « C'est celle-ci » dans la carte en grand, « Ajouter à ma collection », souhaiter les manquantes
// (et Annuler), sélecteur d'édition (de la plus fournie à la moins fournie, recherche, autres extensions), réglages gardés au rechargement, retour à la liste, 360 px sombre.
import './setup-env.mjs';
import assert from 'node:assert/strict';
import { chromium, startWorld, newPage, txt, ok, toHome } from './e2e-world.mjs';

const world = await startWorld({ port: 19620 });
const browser = await chromium.launch({ executablePath: (process.env.CHROMIUM || '/opt/pw-browsers/chromium'), args: ['--no-sandbox'] });
// collection posée une seule fois (le rechargement de la fin garde ce que le test a changé)
const seed = `try { if (!localStorage.getItem('deckdeal:coll:v1')) localStorage.setItem('deckdeal:coll:v1', JSON.stringify({ t: '1 Sol Ring (AAA) 1 *FR*\\n2 Arcane Signet (AAA) 2 *EN*\\n1 Wrath of God *EN*\\n1 Llanowar Elves (BBB) 9 *EN*', u: 1, s: '', b: null })); } catch (e) {}`;
const { p, errs } = await newPage(browser, world, { init: seed });
const H = { 'access-control-allow-origin': '*' };
await p.route('https://api.scryfall.com/sets', route => route.fulfill({ status: 200, headers: H, json: { object: 'list', data: [
  { code: 'aaa', name: 'Alpha Future', icon_svg_uri: 'https://svgs.scryfall.io/sets/aaa.svg?1700000000', set_type: 'expansion', released_at: '2024-02-09', printed_size: 5, card_count: 7 },
  { code: 'bbb', name: 'Beta Masters', icon_svg_uri: 'https://svgs.scryfall.io/sets/bbb.svg?1700000000', set_type: 'masters', released_at: '2023-06-02', printed_size: 10, card_count: 10 },
  { code: 'zzz', name: 'Zeta Quest', icon_svg_uri: 'https://svgs.scryfall.io/sets/zzz.svg?1700000000', set_type: 'expansion', released_at: '2022-01-07', printed_size: 250, card_count: 300 },
  { code: 'zdg', name: 'Zeta Digital', icon_svg_uri: 'https://svgs.scryfall.io/sets/zdg.svg?1700000000', set_type: 'alchemy', released_at: '2022-03-01', card_count: 30, digital: true },
] } }));
const IMG = (s, n) => `https://cards.scryfall.io/normal/front/a/a/${s}-${n}.jpg`;
const card = (s, num, name, o = {}) => ({ object: 'card', id: s + '-' + num, name, collector_number: String(num), rarity: 'common', set: s, lang: 'en', cmc: 1, mana_cost: '{1}', type_line: 'Artifact', colors: [],
  image_uris: { normal: IMG(s, num) }, prices: { eur: null }, border_color: 'black', frame_effects: [], ...o });
const SETS = {
  aaa: [
    card('aaa', 1, 'Sol Ring', { prices: { eur: '0.20' } }),
    card('aaa', 2, 'Arcane Signet', { rarity: 'mythic', prices: { eur: '12.50' } }),
    card('aaa', 3, 'Wrath of God', { rarity: 'rare', cmc: 4, mana_cost: '{2}{W}{W}', type_line: 'Sorcery', colors: ['W'], prices: { eur: '1.00' } }),
    card('aaa', 4, 'Llanowar Elves', { rarity: 'uncommon', mana_cost: '{G}', type_line: 'Creature — Elf Druid', colors: ['G'], prices: { eur: '0.50' } }),
    card('aaa', 5, 'Forest', { cmc: 0, mana_cost: '', type_line: 'Basic Land — Forest', prices: { eur: '0.10' } }),
    card('aaa', 6, 'Arcane Signet', { rarity: 'mythic', border_color: 'borderless', prices: { eur: '30.00' } }),
    card('aaa', 7, 'Sol Ring', { frame_effects: ['showcase'], prices: { eur: '2.00' } }),
  ],
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
const base = () => tiles('.ms-grid:not(.ms-var .ms-grid)');
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

/* ── 3) variantes : repliées sous la base, leur progression, ouvertes à la demande ───────────────────────────────── */
assert.equal(await p.$eval('.ms-vh', b => b.getAttribute('aria-expanded')), 'false'); assert.equal(await p.$('.ms-var .ms-grid'), null, 'variantes repliées');
assert.equal(await txt(p, '.ms-vh .ms-pn'), '0 / 2 · 0 %');
await p.click('.ms-vh'); await p.waitForSelector('.ms-var .ms-grid');
const v = await tiles('.ms-var'); assert.deepEqual(v.map(x => [x.num, x.cls, x.px]), [['#6', 'miss', '30,00 €'], ['#7', 'miss', '2,00 €']], 'variantes : numéros au-delà du total imprimé');
ok('variantes repliées (0 / 2), ouvertes à la demande');

/* ── 4) carte possédée sans édition : « C'est celle-ci » dans la carte en grand, Annuler ───────────────────────── */
await p.click('.ms-grid .ms-c >> nth=2 >> .ms-open'); await p.waitForSelector('.imgv .imgv-rep:not([hidden])');
assert.match(await txt(p, '.imgv-extra'), /Tu as 1 exemplaire de cette carte sans édition : est-ce celui-ci \? · prix Cardmarket 1,00/);
assert.equal(await txt(p, '.imgv-rep'), 'C\'est celle-ci : poser l\'édition AAA 3');
await p.click('.imgv-rep');
await p.waitForFunction(() => document.querySelector('.imgv-rep').disabled);
assert.equal(await txt(p, '.imgv-rep'), '✓ Édition posée');
assert.equal(await stored(), '1 Llanowar Elves (BBB) 9 *EN*\n1 Sol Ring (AAA) 1 *FR*\n1 Wrath of God (AAA) 3 *EN*\n2 Arcane Signet (AAA) 2 *EN*', 'édition posée sur l\'exemplaire (texte du compte)');
await closeImg();
await p.waitForFunction(() => document.querySelector('.ms-grid .ms-c:nth-child(3)').classList.contains('own'));
b = await base(); assert.equal(b[2].warn, false); assert.equal(await txt(p, '.ms-head + .ms-prog .ms-pn'), '3 / 5 · 60 %'); assert.equal(await p.$('.ms-legend'), null, 'plus de carte à vérifier : légende retirée');
await p.click('#toast .toast-act');
await p.waitForFunction(() => document.querySelector('.ms-grid .ms-c:nth-child(3)').classList.contains('miss'));
assert.match(await stored(), /1 Wrath of God \*EN\*/, 'Annuler : l\'exemplaire redevient sans édition');
await p.click('.ms-grid .ms-c >> nth=2 >> .ms-open'); await p.waitForSelector('.imgv .imgv-rep:not([hidden])'); await p.click('.imgv-rep'); await p.waitForFunction(() => document.querySelector('.imgv-rep').disabled); await closeImg();
ok('⚠ sur la vignette, « C\'est celle-ci » dans la carte en grand : édition posée (3 / 5), Annuler');

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
await p.waitForFunction(() => /4 \/ 5 · 80 %/.test(document.querySelector('.ms-head + .ms-prog .ms-pn').textContent));
ok('« Ajouter à ma collection » : AAA 4 en français, 4 / 5 · 80 % ; carte possédée : sa ligne de collection');

/* ── 6) souhaiter les manquantes (terrains de base exclus, variantes ouvertes comprises), Annuler ───────────────── */
assert.equal(await txt(p, '.ms-wish'), '☆ Souhaiter les 2 cartes manquantes', 'Forest (terrain de base) exclu ; les 2 variantes ouvertes comptent');
await p.click('.ms-wish'); await p.waitForSelector('.sheet-wrap.open [data-ok]');
assert.match(await txt(p, '.sheet-wrap.open .sheet-body'), /2 cartes manquantes entrent dans ta liste de souhaits/);
await p.click('.sheet-wrap.open [data-ok]'); await p.waitForTimeout(300);
const wish = () => p.evaluate(() => Object.fromEntries(Object.entries(TR.wish).map(([k, w]) => [k, [w.i, w.w]])));
assert.deepEqual(await wish(), { 'arcane signet': [IMG('aaa', 6), 'Alpha Future · AAA 6'], 'sol ring': [IMG('aaa', 7), 'Alpha Future · AAA 7'] }, 'illustrations de cette édition dans la liste de souhaits');
assert.equal(await p.$('.ms-wish'), null, 'plus rien à souhaiter');
await p.click('#toast .toast-act'); await p.waitForTimeout(200);
assert.deepEqual(await wish(), {}, 'Annuler : liste de souhaits d\'avant');
ok('souhaiter les manquantes : 2 illustrations exactes, Annuler');

/* ── 7) sélecteur d'édition : de la plus fournie à la moins fournie, recherche, autres extensions ──────────────────── */
await p.click('.ms-pick'); await p.waitForSelector('.sheet-wrap.open .ms-srow');
const rowsTxt = () => p.$$eval('.sheet-wrap.open .ms-srow', l => l.map(r => [r.dataset.set, r.querySelector('.ms-sp small').textContent, r.getAttribute('aria-pressed')]));
assert.deepEqual(await rowsTxt(), [['aaa', '4/5 · 80 %', 'true'], ['bbb', '1/10 · 10 %', 'false']], 'extensions de la collection, la plus fournie d\'abord, progression');
await p.fill('.sheet-wrap.open .ms-q input', 'zeta'); await p.waitForTimeout(150);
assert.deepEqual(await rowsTxt(), [['zzz', '0/250 · 0 %', 'false']], 'recherche : autres extensions papier (pas les numériques)');
assert.match(await txt(p, '.sheet-wrap.open .ms-sh'), /Autres extensions/i);
await p.fill('.sheet-wrap.open .ms-q input', 'beta'); await p.waitForTimeout(150);
await p.click('.sheet-wrap.open .ms-srow[data-set="bbb"]');
await p.waitForFunction(() => document.querySelectorAll('.ms-grid .ms-c').length === 3, null, { timeout: 8000 });
assert.equal(await txt(p, '.ms-pick b'), 'Beta Masters');
b = await base(); assert.deepEqual(b.map(x => [x.num, x.cls]), [['8/10', 'miss'], ['9/10', 'own'], ['10/10', 'miss']]);
assert.equal(await p.$('.ms-var'), null, 'pas de variantes : pas de section');
ok('sélecteur : Alpha Future (4/5) puis Beta Masters (1/10), recherche « zeta » → autres extensions, Beta Masters affichée');

/* ── 8) rechargement : masterset, extension et cartes par ligne gardés ; éteint : la liste et « Trier » reviennent ─────── */
await p.reload(); await p.waitForTimeout(700); await toHome(p); await p.click('#btnColl'); await p.waitForSelector('.coll.on');
await p.waitForFunction(() => document.querySelectorAll('.ms-grid.c6 .ms-c').length === 3, null, { timeout: 8000 });
assert.equal(await txt(p, '.ms-pick b'), 'Beta Masters');
await p.click('.coll-ms'); await p.waitForSelector('.coll .crow');
assert.equal(await p.$eval('.coll-sort', l => l.hidden), false); assert.equal(await p.$eval('.ms-pick', b => b.hidden), true); assert.equal(await p.$('.ms-grid'), null);
await p.click('#collSeg [data-v="stats"]'); await p.waitForTimeout(250);
assert.equal(await p.$eval('.coll-ms', b => b.hidden), true, 'interrupteur seulement dans Cartes');
await p.click('#collSeg [data-v="list"]'); await p.click('.coll-ms'); await p.waitForSelector('.ms-grid');
ok('rechargement : masterset, Beta Masters et 6 par ligne gardés ; éteint : liste et « Trier » ; interrupteur seulement dans Cartes');

/* ── 9) téléphone 360 px, thème sombre : rien ne déborde ──────────────────────────────────────────────── */
await p.setViewportSize({ width: 360, height: 740 }); await p.evaluate(() => { document.documentElement.dataset.theme = 'dark'; });
await p.selectOption('select.ms-cols', '5'); await p.waitForSelector('.ms-grid.c5');
assert.equal(await p.evaluate(() => { const s = document.querySelector('.coll .dv-scroll'); return s.scrollWidth <= s.clientWidth + 1; }), true, 'pas de défilement horizontal à 360 px');
assert.equal(await p.evaluate(() => [...document.querySelectorAll('.ms-c')].every(c => { const r = c.getBoundingClientRect(); return r.right <= innerWidth + 1 && r.width > 40; })), true, '5 cartes de front dans l\'écran');
await p.screenshot({ path: 'shots/masterset-2-360-sombre.png' });
ok('360 px sombre, 5 par ligne : rien ne déborde');

assert.deepEqual(errs, [], 'erreurs page : ' + errs.join(' | '));
await browser.close(); world.stop();
console.log('\nMASTERSET E2E OK');
