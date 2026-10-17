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
const rows = () => p.$$eval('.coll .crow', r => r.map(x => { const g = x.dataset.g || x.dataset.ln || '', e = g.split('|').slice(1); return { name: x.querySelector('.row-name').textContent, g, q: Number(x.querySelector('.qstep b').textContent), ed: e.length === 2 ? e[0].toUpperCase() + ' ' + e[1] : '', ic: !!x.querySelector('.row-ed.on .set-ic'), btn: !!x.querySelector('.row-ed'), tag: !!x.querySelector('.tag.ed'), cm: (x.querySelector('.px.cm b') || {}).textContent || '' }; }));      // édition : celle de la ligne (data-g) ; sélecteur .row-ed (symbole seul)
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
await p.waitForFunction(() => document.querySelector('.coll .crow[data-g="fr|2x2|101"] .row-ed.on .set-ic'), null, { timeout: 5000 });
r = await rows(); const sol = r.find(isSol);
assert.equal(sol.ed, '2X2 101'); assert.ok(sol.ic, 'symbole de l\'extension sur la ligne (sélecteur)'); assert.ok(r.every(x => x.btn && !x.tag), 'chaque ligne : le sélecteur, plus d\'étiquette « 2X2 101 »');
assert.match(await p.$eval('.coll .crow[data-g="fr|2x2|101"] .row-ed', b => b.getAttribute('aria-label')), /Édition : Double Masters 2022 · 2X2 101/); assert.equal(sol.cm.replace(/\s/g, ' '), '3,50 €', 'prix de la ligne : celui de l\'édition'); assert.equal(sol.g, 'fr|2x2|101');
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

/* ── 4 bis) sélecteur d'édition de la ligne (symbole) : feuille des éditions de la carte, choix, « Sans édition » ─────────────────── */
await p.click('.coll .crow[data-k="edgar markov"] .row-ed'); await p.waitForSelector('.sheet-wrap.open .ced-t:not(.none)');
await p.waitForFunction(() => document.querySelectorAll('.ced-t .set-ic').length >= 2, null, { timeout: 5000 });
assert.deepEqual(await p.$$eval('.ced-t:not(.none)', b => b.map(x => [x.querySelector('.ced-n').textContent, ((x.querySelector('b') || {}).textContent || '').replace(/\s/g, ' ')])), [['CMM 100', '1,00 €'], ['2X2 101', '3,50 €'], ['LEA 102', '6,00 €'], ['M21 103', '8,50 €']], 'éditions (anglais) : code, numéro, prix');
assert.equal(await p.$eval('.ced-t.none', b => b.getAttribute('aria-checked')), 'true', 'aucune édition : « Sans édition » cochée');
await p.screenshot({ path: 'shots/edition-3-selecteur.png' });
await p.click('.ced-t:not(.none) >> nth=3'); await p.waitForFunction(() => !document.querySelector('.sheet-wrap'));
await p.waitForFunction(() => document.querySelector('.coll .crow[data-g="en|m21|103"] .row-ed.on'), null, { timeout: 5000 });
assert.deepEqual(await p.evaluate(() => COLL.map['edgar markov'].x), { 'en|m21|103': 1 });
await p.click('.coll .crow[data-g="en|m21|103"] .row-ed'); await p.waitForSelector('.sheet-wrap.open .ced-t[aria-checked="true"]:not(.none)');
assert.equal(await p.$eval('.ced-t[aria-checked="true"] .ced-n', e => e.textContent), 'M21 103', 'édition de la ligne cochée');
await p.click('.ced-t.none'); await p.waitForFunction(() => !COLL.map['edgar markov'].x, null, { timeout: 4000 });
ok('sélecteur d\'édition (symbole seul) sur chaque ligne : feuille des éditions (code, numéro, prix), choix, « Sans édition »');

/* ── 4 bis) plusieurs exemplaires sur une ligne : « Exemplaires concernés » (3 Edgar Markov : 1 en 2X2, les 2 autres restent sans édition) ─── */
await p.evaluate(() => { const g = collLines(COLL.map['edgar markov'])[0][0]; collBump('edgar markov', 'Edgar Markov', 3 - COLL.map['edgar markov'].q, { lang: g }); });
await p.waitForFunction(() => COLL.map['edgar markov'].q === 3);
await p.click('.coll .crow[data-k="edgar markov"] .row-ed'); await p.waitForSelector('.sheet-wrap.open .ced-cnt');
assert.equal((await txt(p, '.ced-cnt')).replace(/\s/g, ''), 'Exemplairesconcernés−3+/3', 'compteur en tête : tous par défaut');
await p.click('.ced-cnt [data-cn="-1"]'); await p.click('.ced-cnt [data-cn="-1"]'); await p.click('.ced-cnt [data-cn="-1"]');
assert.equal(await txt(p, '.ced-cnt b'), '1', 'jamais moins de 1');
await p.waitForSelector('.ced-t:not(.none)'); await p.click('.ced-t:not(.none) >> nth=1'); await p.waitForFunction(() => !document.querySelector('.sheet-wrap'));
await p.waitForFunction(() => COLL.map['edgar markov'].x && COLL.map['edgar markov'].x['en|2x2|101'] === 1, null, { timeout: 4000 });
assert.deepEqual(await p.evaluate(() => COLL.map['edgar markov'].x), { en: 2, 'en|2x2|101': 1 }, '1 exemplaire en 2X2 101, les 2 autres sans édition');
assert.match(await stored(), /1 Edgar Markov \(2X2\) 101 \*EN\*/); assert.match(await stored(), /2 Edgar Markov \*EN\*/);
await p.waitForFunction(() => document.querySelector('.coll .crow[data-g="en|2x2|101"]'), null, { timeout: 4000 });
await p.click('.coll .crow[data-k="edgar markov"][data-ln="en"]:not([data-g]) .row-ed'); await p.waitForSelector('.sheet-wrap.open .ced-cnt');
assert.equal(await txt(p, '.ced-cnt b'), '2'); await p.click('.ced-t:not(.none) >> nth=1'); await p.waitForFunction(() => !document.querySelector('.sheet-wrap'));
await p.waitForFunction(() => COLL.map['edgar markov'].x && COLL.map['edgar markov'].x['en|2x2|101'] === 3, null, { timeout: 4000 });
assert.deepEqual(await p.evaluate(() => COLL.map['edgar markov'].x), { 'en|2x2|101': 3 }, 'tous (par défaut) : la ligne rejoint celle de la même édition');
await p.click('.coll .crow[data-k="edgar markov"] .row-ed'); await p.waitForSelector('.sheet-wrap.open .ced-t.none'); await p.click('.ced-t.none'); await p.waitForFunction(() => !COLL.map['edgar markov'].x, null, { timeout: 4000 });
await p.evaluate(() => collBump('edgar markov', 'Edgar Markov', -2, { lang: collLines(COLL.map['edgar markov'])[0][0] }));
ok('plusieurs exemplaires : « Exemplaires concernés » (1 sur 3 en 2X2, les autres restent ; tous : même ligne que l\'édition)');

/* ── 4 ter) B : « Répartir par édition » (lien de la feuille « Édition de… ») : 4 Edgar Markov → 3 en CMM, 1 en 2X2 ; Annuler ─── */
await p.evaluate(() => collBump('edgar markov', 'Edgar Markov', 4 - COLL.map['edgar markov'].q, { lang: collLines(COLL.map['edgar markov'])[0][0] }));
await p.waitForFunction(() => COLL.map['edgar markov'].q === 4);
await p.click('.coll .crow[data-k="edgar markov"] .row-ed'); await p.waitForSelector('.sheet-wrap.open .ced-split');
await p.click('.ced-split'); await p.waitForSelector('.esp-sheet.open .esp-add');
const esp = () => p.evaluate(() => ({ rows: [...document.querySelectorAll('.esp-sheet .esp-r:not(.esp-none)')].map(r => [r.dataset.e, Number(r.querySelector('.qstep b').textContent)]), rest: document.querySelector('.esp-none em').textContent, tot: document.querySelector('.esp-tot b').textContent }));
assert.deepEqual(await esp(), { rows: [], rest: '4', tot: '0 / 4 répartis' }, 'au départ : tout sans édition');
const addEd = async n => { await p.click('.esp-sheet .esp-add'); await p.waitForSelector('.ced-sheet.open .ced-t:not(.none)'); await p.click(`.ced-sheet.open .ced-t:not(.none) >> nth=${n}`); await p.waitForFunction(() => !document.querySelector('.ced-sheet')); };
await addEd(0);
assert.deepEqual(await esp(), { rows: [['cmm|100', 1]], rest: '3', tot: '1 / 4 répartis' }, 'édition ajoutée : un exemplaire du reste');
await p.click('.esp-r[data-e="cmm|100"] [data-d="1"]'); await p.click('.esp-r[data-e="cmm|100"] [data-d="1"]');
await addEd(1);
assert.deepEqual(await esp(), { rows: [['cmm|100', 3], ['2x2|101', 1]], rest: '0', tot: '4 / 4 répartis ✓' });
assert.equal(await p.$eval('.esp-r[data-e="cmm|100"] [data-d="1"]', b => b.disabled), true, 'plus rien à répartir : + grisé');
await p.screenshot({ path: 'shots/edition-repartir.png' });
await p.click('.esp-sheet [data-ok]'); await p.waitForFunction(() => !document.querySelector('.sheet-wrap'));
assert.deepEqual(await p.evaluate(() => COLL.map['edgar markov'].x), { 'en|cmm|100': 3, 'en|2x2|101': 1 }, '3 en CMM 100, 1 en 2X2 101');
assert.match(await stored(), /3 Edgar Markov \(CMM\) 100 \*EN\*/); assert.match(await stored(), /1 Edgar Markov \(2X2\) 101 \*EN\*/);
await p.click('#toast .toast-act'); await p.waitForFunction(() => !COLL.map['edgar markov'].x && COLL.map['edgar markov'].q === 4, null, { timeout: 4000 });
await p.evaluate(() => collBump('edgar markov', 'Edgar Markov', -3, { lang: collLines(COLL.map['edgar markov'])[0][0] }));
ok('B : « Répartir par édition » : ajout d\'éditions (un exemplaire du reste), − / +, 4 / 4 ✓, Enregistrer (3 CMM + 1 2X2), Annuler');

/* ── 4 ter) carte imprimée une seule fois : son édition est posée d'office (annulable) ──────────────────────────────── */
world.solo['Wrath of God'] = 12;
await p.evaluate(() => { collAdd([{ k: 'wrath of god', n: 'Wrath of God', q: 1, l: 'fr' }], 'add'); collEnrich(); });
await p.waitForFunction(() => COLL.map['wrath of god'] && COLL.map['wrath of god'].x && COLL.map['wrath of god'].x['fr|neo|12'] === 1, null, { timeout: 15000 });
assert.match(await txt(p, '#toast'), /1 carte imprimée une seule fois : son édition est posée/);
assert.ok(world.soloReq >= 1); assert.equal(await p.evaluate(() => COLL.solo['edgar markov']), '', 'plusieurs impressions : rien de posé');
assert.equal(await p.evaluate(() => edEu('neo|12')), 30, 'prix de l\'édition lu avec');
await p.click('#toast .toast-act'); await p.waitForFunction(() => !(COLL.map['wrath of god'].x || {})['fr|neo|12']);
assert.equal(await p.evaluate(() => COLL.solo['wrath of god']), '-', 'annulée : plus jamais posée d\'office');
await p.evaluate(() => collSolo()); await p.waitForTimeout(300); assert.equal(await p.evaluate(() => COLL.map['wrath of god'].x), undefined);
ok('carte imprimée une seule fois (Scryfall paperprints=1) : édition posée d\'office sur ses lignes sans édition, annulable ; plusieurs impressions : rien');

/* ── 5) export CSV : Edition et Collector Number ─────────────────────────────────────────────────────── */
const csv = await p.evaluate(() => collToCsv(COLL.map, []));
assert.match(csv, /^Count,Tradelist Count,Name,Edition,Condition,Language,Foil,Collector Number\n/);
assert.match(csv, /\n2,0,Arcane Signet,cmm,Near Mint,English,,100\n/); assert.match(csv, /\n1,0,Sol Ring,2x2,Near Mint,French,,101\n/);
assert.equal(setsHits, 1, 'symboles des extensions : une seule lecture de /sets');
ok('export CSV : colonnes Edition et Collector Number ; symboles lus une seule fois');

assert.deepEqual(errs, [], 'erreurs page : ' + errs.join(' | '));
await browser.close(); world.stop();
console.log('\nEDITION E2E OK');
