// E2E : édition par ligne de la collection (« 2 Sol Ring (2X2) 101 *FR* ») : aperçu en grand → « Illustrations » avec symbole, extension et prix de chaque édition ;
// en choisir une fixe l'édition de la ligne (texte enregistré, prix de la ligne, valeur) ; « Sans édition » ; import ManaBox gardant les éditions, prix lus par édition.
import './setup-env.mjs';
import assert from 'node:assert/strict';
import { chromium, startWorld, newPage, txt, ok, toHome } from './e2e-world.mjs';

const world = await startWorld({ port: 18994 });
const browser = await chromium.launch({ executablePath: (process.env.CHROMIUM || '/opt/pw-browsers/chromium'), args: ['--no-sandbox'] });
const seed = `try { localStorage.setItem('deckdeal:coll:v1', JSON.stringify({ t: '2 Sol Ring *FR*\\n1 Edgar Markov *EN*', u: 1, s: '', b: null })); } catch (e) {}`;
const { p, errs } = await newPage(browser, world, { init: seed });
let setsHits = 0;
await p.route('https://api.scryfall.com/sets', route => { setsHits++; route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*' }, json: { object: 'list', data: [
  { code: 'cmm', name: 'Commander Masters', icon_svg_uri: 'https://svgs.scryfall.io/sets/cmm.svg?1700000000', set_type: 'masters', released_at: '2023-08-04' },
  { code: '2x2', name: 'Double Masters 2022', icon_svg_uri: 'https://svgs.scryfall.io/sets/2x2.svg?1700000000', set_type: 'masters', released_at: '2022-07-08' },
  { code: 'm21', name: 'Core Set 2021', icon_svg_uri: 'https://svgs.scryfall.io/sets/m21.svg?1700000000', set_type: 'core', released_at: '2020-07-03' },
] } }); });
const stored = () => p.evaluate(() => JSON.parse(localStorage.getItem('deckdeal:coll:v1')).t.replace(/ \(D[0-9a-z]+\)/g, ''));
const rows = () => p.$$eval('.coll .crow', r => r.map(x => ({ name: x.querySelector('.row-name').textContent, g: x.dataset.g || x.dataset.ln, q: Number(x.querySelector('.qstep b').textContent), ed: (x.querySelector('.tag.ed') || {}).textContent || '', ic: !!x.querySelector('.tag.ed .set-ic'), cm: (x.querySelector('.px.cm b') || {}).textContent || '' })));
const closeImg = async () => { await p.keyboard.press('Escape'); await p.waitForFunction(() => !document.querySelector('.imgv'), null, { timeout: 3000 }); };
const openRow = async n => { await p.click(`.coll .crow >> nth=${n} >> .thumb`); await p.waitForSelector('.imgv-img.ok', { timeout: 8000 }); };

await p.waitForTimeout(500); await toHome(p); await p.click('#btnColl'); await p.waitForSelector('.coll.on');
await p.waitForFunction(() => document.querySelectorAll('.coll .crow .thumb img.ok').length === 2, null, { timeout: 8000 });

/* ── 1) « Illustrations » d'une ligne : symbole, extension et prix sous chaque illustration ───────────────────── */
const isSol = x => /^(Sol Ring|Anneau solaire)$/.test(x.name);      // nom français dès que son index est chargé
let r = await rows(); assert.deepEqual(r.map(x => [isSol(x) ? 'Sol Ring' : x.name, x.q, x.ed]), [['Edgar Markov', 1, ''], ['Sol Ring', 2, '']]);
await openRow(1);
await p.waitForSelector('.imgv-art:not([hidden])', { timeout: 6000 }); await p.click('.imgv-art'); await p.waitForSelector('.imgv-vars:not([hidden]) .imgv-v');
assert.match(await txt(p, '.imgv-vh'), /Touche l'édition de ta carte/);
const tiles = () => p.$$eval('.imgv-v:not(.def)', b => b.map(x => ({ code: x.querySelector('span').textContent, sn: (x.querySelector('.v-sn') || {}).textContent || '', px: (x.querySelector('.v-px') || {}).textContent || '', ic: !!x.querySelector('.set-ic'), on: x.getAttribute('aria-pressed') === 'true' })));
await p.waitForFunction(() => document.querySelectorAll('.imgv-v .set-ic').length >= 3, null, { timeout: 6000 });
let t = await tiles();
assert.deepEqual(t.map(x => x.code), ['CMM 100', '2X2 101', 'LEA 102', 'M21 103'], 'impressions françaises, puis anglaises seules');
assert.deepEqual(t.map(x => x.sn), ['Commander Masters', 'Double Masters 2022', 'Limited Edition Alpha', 'Core Set 2021']);
assert.deepEqual(t.map(x => x.px.replace(/\s/g, ' ')), ['1,00 €', '3,50 €', '6,00 €', '8,50 €'], 'prix de l\'édition (impression anglaise) sous les impressions françaises');
assert.deepEqual(t.map(x => x.ic), [true, true, false, true], 'symbole connu (/sets) : affiché ; inconnu (LEA) : rien');
assert.ok(t.every(x => !x.on), 'aucune édition choisie'); assert.equal(await p.$('.imgv-v.def'), null, 'pas de « Sans édition » tant qu\'aucune n\'est choisie');
await p.screenshot({ path: 'shots/edition-1-illustrations.png' });
ok('Illustrations d\'une ligne : symbole, extension et prix de chaque édition');

/* ── 2) choisir une illustration : édition de la ligne (texte, prix, valeur), synchronisable ──────────────────────── */
await p.click('.imgv-v:not(.def) >> nth=1');
await p.waitForFunction(() => /wrath|sol-ring-v1\.jpg/.test((document.querySelector('.imgv-img.ok') || {}).src || ''), null, { timeout: 6000 });
assert.match(await txt(p, '.imgv-vh'), /Double Masters 2022 · édition de ta carte/);
assert.match(await txt(p, '.imgv-extra'), /prix Cardmarket 3,50/); assert.match(await txt(p, '.imgv-sub'), /2X2 101/);
assert.equal(await stored(), '1 Edgar Markov *EN*\n2 Sol Ring (2X2) 101 *FR*', 'édition enregistrée avec la ligne (texte du compte)');
assert.equal(await p.$eval('.imgv-v:not(.def) >> nth=1', e => e.getAttribute('aria-pressed')), 'true'); assert.equal(await txt(p, '.imgv-v.def'), 'Sans édition');
await closeImg();
await p.waitForFunction(() => /2X2 101/.test((document.querySelector('.coll .crow:nth-child(2) .tag.ed') || document.querySelector('.coll .tag.ed') || {}).textContent || ''), null, { timeout: 5000 });
r = await rows(); const sol = r.find(isSol);
assert.equal(sol.ed, '2X2 101'); assert.ok(sol.ic, 'symbole de l\'extension sur la ligne'); assert.equal(sol.cm.replace(/\s/g, ' '), '3,50 €', 'prix de la ligne : celui de l\'édition'); assert.equal(sol.g, 'fr|2x2|101');
assert.equal(await p.evaluate(() => collValue()), 2 * 350 + 500, 'valeur : 2 × 3,50 € (édition) + Edgar (référence)');
assert.equal(await p.evaluate(() => collItems().find(i => i.k === 'sol ring').eu), 350, 'tri par prix et stats : prix de l\'édition');
const img = await p.$eval('.coll .crow:nth-child(2) .thumb img, .coll .crow .thumb img', () => [...document.querySelectorAll('.coll .crow .thumb img')].map(i => i.getAttribute('src')).find(s => /sol-ring/.test(s)) || '');
assert.match(img, /\/fr\/sol-ring-v1\.jpg/, 'vignette : l\'illustration de l\'édition, dans la langue de la ligne');
ok('illustration choisie : édition de la ligne (texte enregistré, étiquette, prix 3,50 €, valeur, vignette)');

/* ── 3) réouverture : l'édition est sélectionnée ; langue changée : l'édition suit ; « Sans édition » ─────────────── */
const solIdx = (await rows()).findIndex(isSol);
await openRow(solIdx); await p.waitForSelector('.imgv-art:not([hidden])', { timeout: 6000 });
if (await p.$('.imgv-vars[hidden]')) await p.click('.imgv-art');
await p.waitForSelector('.imgv-vars:not([hidden]) .imgv-v.def');
assert.equal(await p.$eval('.imgv-v:not(.def) >> nth=1', e => e.getAttribute('aria-pressed')), 'true', 'édition de la ligne sélectionnée à la réouverture');
assert.match(await txt(p, '.imgv-sub'), /Double Masters 2022 · 2X2 101/);
await closeImg();
await p.evaluate(() => { collSetLang('sol ring', 'en', 'fr|2x2|101'); });
assert.equal(await stored(), '1 Edgar Markov *EN*\n2 Sol Ring (2X2) 101 *EN*', 'changer la langue garde l\'édition');
await p.evaluate(() => { collSetLang('sol ring', 'fr', 'en|2x2|101'); collPaintBody(true); });
await openRow((await rows()).findIndex(isSol)); await p.waitForSelector('.imgv-art:not([hidden])', { timeout: 6000 });
if (await p.$('.imgv-vars[hidden]')) await p.click('.imgv-art');
await p.click('.imgv-v.def'); await p.waitForFunction(() => /Touche l'édition de ta carte/.test(document.querySelector('.imgv-vh').textContent) && document.querySelector('.imgv-v') && !document.querySelector('.imgv-v.def'), null, { timeout: 4000 });
assert.equal(await stored(), '1 Edgar Markov *EN*\n2 Sol Ring *FR*', '« Sans édition » : la ligne redevient « FR »');
assert.ok((await tiles()).every(x => !x.on), 'plus aucune édition sélectionnée');
await closeImg();
ok('réouverture : édition sélectionnée ; langue changée : édition gardée ; « Sans édition »');

/* ── 4) import ManaBox (éditions gardées), prix relus par édition (une requête), deux éditions = deux lignes ───────── */
const before = world.scry.filter(s => /^POST \/cards\/collection/.test(s)).length;
await p.evaluate(() => { collAdd(parseCollection('Name,Set code,Set name,Collector number,Foil,Quantity,Language\nArcane Signet,m21,Core Set 2021,103,normal,1,en\nArcane Signet,cmm,Commander Masters,100,normal,2,en\nSol Ring,2x2,Double Masters 2022,101,normal,1,fr').items, 'add'); });
await p.waitForFunction(() => COLL.ed['m21|103'] && COLL.ed['cmm|100'] && COLL.ed['2x2|101'], null, { timeout: 8000 });
assert.equal(world.scry.filter(s => /^POST \/cards\/collection/.test(s)).length - before >= 1, true);
assert.deepEqual(await p.evaluate(() => COLL.map['arcane signet'].x), { 'en|cmm|100': 2, 'en|m21|103': 1 });
assert.deepEqual(await p.evaluate(() => COLL.map['sol ring'].x), { fr: 2, 'fr|2x2|101': 1 }, 'même carte, même langue : ligne sans édition + ligne de l\'édition');
await p.evaluate(() => collPaintBody(true));
await p.waitForFunction(() => [...document.querySelectorAll('.coll .crow')].filter(r => r.dataset.k === 'arcane signet').length === 2, null, { timeout: 5000 });
r = await rows();
assert.deepEqual(r.filter(x => /Sceau|Arcane/.test(x.name)).map(x => [x.ed, x.q, x.cm.replace(/\s/g, ' ')]), [['CMM 100', 2, '1,00 €'], ['M21 103', 1, '8,50 €']], 'une ligne par édition, prix de chaque édition');
assert.deepEqual(r.filter(isSol).map(x => [x.ed, x.q, x.cm.replace(/\s/g, ' ')]), [['', 2, '1,50 €'], ['2X2 101', 1, '3,50 €']], 'sans édition : prix de référence de la carte');
assert.equal(await p.evaluate(() => collValue()), 2 * 150 + 350 + 500 + 2 * 100 + 850);
// « − » sur la ligne d'une édition : seule cette ligne bouge
const at = (await rows()).findIndex(x => x.ed === 'M21 103');
await p.click(`.coll .crow >> nth=${at} >> .qstep button[data-d="-1"]`); await p.waitForSelector('.sheet-wrap.open [data-ok]'); await p.click('.sheet-wrap.open [data-ok]');
await p.waitForFunction(() => !COLL.map['arcane signet'].x['en|m21|103'], null, { timeout: 4000 });
assert.deepEqual(await p.evaluate(() => COLL.map['arcane signet'].x), { 'en|cmm|100': 2 }, 'une seule ligne restante, avec édition : gardée');
assert.match(await stored(), /^2 Arcane Signet \(CMM\) 100 \*EN\*$/m);
await p.screenshot({ path: 'shots/edition-2-lignes.png' });
ok('import ManaBox : éditions gardées, prix lus par édition, une ligne par édition, « − » sur la bonne ligne');

/* ── 5) export CSV : Edition et Collector Number ─────────────────────────────────────────────────────── */
const csv = await p.evaluate(() => collToCsv(COLL.map, []));
assert.match(csv, /^Count,Tradelist Count,Name,Edition,Condition,Language,Foil,Collector Number\n/);
assert.match(csv, /\n2,0,Arcane Signet,cmm,Near Mint,English,,100\n/); assert.match(csv, /\n1,0,Sol Ring,2x2,Near Mint,French,,101\n/);
assert.equal(setsHits, 1, 'symboles des extensions : une seule lecture de /sets');
ok('export CSV : colonnes Edition et Collector Number ; symboles lus une seule fois');

assert.deepEqual(errs, [], 'erreurs page : ' + errs.join(' | '));
await browser.close(); world.stop();
console.log('\nEDITION E2E OK');
