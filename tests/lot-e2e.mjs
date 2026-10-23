// E2E : « Ajouter des cartes » (lot.js), façon ManaBox : recherche → carte en grand, choix de l'édition (symbole, extension, prix), quantité, langue → « Ajouter » ;
// extension collante (proposée d'office aux cartes suivantes qui existent dans cette extension) ; liste du lot (modifier, retirer, nouveau lot, gardée au rechargement) ; cartes du scan.
import './setup-env.mjs';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { chromium, startWorld, newPage, txt, ok, toHome } from './e2e-world.mjs';

// noms imprimés de toutes les langues (names-all.tsv, servi par le proxy des tests) : recherche dans une autre langue que l'anglais et le français
writeFileSync(process.env.PWA_DIR + '/names-all.tsv', ['# anglais\tfr\tde\tes\tit\tpt', 'Llanowar Elves\tElfes de Llanowar\tLlanowarelfen\tElfos de Llanowar\tElfi di Llanowar\tElfos de Llanowar', 'Lightning Bolt\tÉclair\tBlitzschlag\tRelámpago\tFulmine\tRelâmpago', 'Arc Lightning\tÉclair en arc\tBogenblitz\tRelámpago en arco\tFulmine ad Arco\tRaio em Arco',
  ...Array.from({ length: 600 }, (_, i) => `Filler Card ${i}\tCarte ${i}\t\t\t\t`)].join('\n') + '\n');
const world = await startWorld({ port: 18995 });
world.variants['Llanowar Elves'] = { fr: 0, en: 1 };
const browser = await chromium.launch({ executablePath: (process.env.CHROMIUM || '/opt/pw-browsers/chromium'), args: ['--no-sandbox'] });
const seed = `try { if (!sessionStorage.getItem('seeded')) { sessionStorage.setItem('seeded', '1'); localStorage.setItem('deckdeal:coll:v1', JSON.stringify({ t: '2 Sol Ring *FR*', u: 1, s: '', b: null })); } } catch (e) {}`;
const { p, errs } = await newPage(browser, world, { init: seed });
await p.route('https://api.scryfall.com/sets', route => route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*' }, json: { object: 'list', data: [
  { code: 'cmm', name: 'Commander Masters', icon_svg_uri: 'https://svgs.scryfall.io/sets/cmm.svg?1700000000' },
  { code: '2x2', name: 'Double Masters 2022', icon_svg_uri: 'https://svgs.scryfall.io/sets/2x2.svg?1700000000' },
] } }));
const coll = k => p.evaluate(k => (COLL.map[k] || {}).x || (COLL.map[k] ? { [COLL.map[k].l || '']: COLL.map[k].q } : null), k);
const lotRows = () => p.$$eval('.lot-it', r => r.map(x => ({ name: x.querySelector('.row-name').textContent, tags: [...x.querySelectorAll('.tag')].map(t => t.textContent.trim()), px: (x.querySelector('.px b') || {}).textContent || '' })));
const choose = async (q, name) => { await p.fill('#caName', q); await p.waitForSelector(`.ca-opt[data-n="${name}"]`); await p.click(`.ca-opt[data-n="${name}"]`); await p.waitForSelector('.lot-card:not([hidden]) #lotAdd'); };
const edReady = () => p.waitForFunction(() => { const b = document.querySelector('.lot-ed'); return b && !/Éditions…/.test(b.textContent); }, null, { timeout: 8000 });
const nb = s => s.replace(/\s/g, ' ');

await p.waitForTimeout(400); await toHome(p); await p.click('#btnColl'); await p.waitForSelector('.coll.on');
await p.click('.coll-tools [data-act="add"]'); await p.waitForSelector('.lot.on #caName');
assert.match(await txt(p, '.lot-empty'), /Les cartes ajoutées apparaissent ici/);

/* ── 1) choisir une carte, son édition (symbole, extension, prix), la quantité → Ajouter ─────────────────────── */
await choose('sol r', 'Sol Ring'); await edReady();
assert.match(await txt(p, '.lot-ed'), /Choisir l'édition/); assert.match(await txt(p, '.lot-name'), /2 dans ta collection/);
await p.click('.lot-ed'); await p.waitForSelector('.sheet-wrap.open .lot-ev');
await p.waitForFunction(() => document.querySelectorAll('.lot-ev .set-ic').length >= 2, null, { timeout: 6000 });
const evs = await p.$$eval('.lot-ev:not(.none)', b => b.map(x => [x.querySelector('span').textContent, (x.querySelector('em') || {}).textContent, ((x.querySelector('b') || {}).textContent || '').replace(/\s/g, ' ')]));
assert.deepEqual(evs, [['CMM 100', 'Commander Masters', '1,00 €'], ['2X2 101', 'Double Masters 2022', '3,50 €'], ['LEA 102', 'Limited Edition Alpha', '6,00 €'], ['M21 103', 'Core Set 2021', '8,50 €']], 'impressions françaises puis anglaises seules, prix de l\'édition');
await p.screenshot({ path: 'shots/lot-1-editions.png' });
// « Chercher une extension » reste en haut de la feuille pendant le défilement des impressions
assert.equal(await p.$eval('.sheet-wrap.open .sheet-body > .ed-q', e => getComputedStyle(e).position), 'sticky');
assert.ok(await p.$eval('.sheet-wrap.open .sheet-body', b => { b.style.maxHeight = '260px'; b.scrollTop = b.scrollHeight; const q = b.querySelector(':scope > .ed-q').getBoundingClientRect(), r = b.getBoundingClientRect(); const ok = b.scrollTop > 0 && q.top >= r.top - 1 && q.bottom <= r.bottom; b.style.maxHeight = ''; b.scrollTop = 0; return ok; }), 'champ toujours visible après défilement');
await p.click('.lot-ev:not(.none) >> nth=1'); await p.waitForFunction(() => !document.querySelector('.sheet-wrap.open'));
assert.match(await txt(p, '.lot-ed'), /Double Masters 2022 2X2 · #101/); assert.equal(nb(await txt(p, '.lot-px')), '3,50 €');
assert.match(await txt(p, '.lot-sticky'), /Extension proposée Double Masters 2022/);
await p.click('.lot-card [data-act="qp"]'); assert.equal(await txt(p, '.lot-card .qstep b'), '2');
await p.click('#lotAdd'); await p.waitForFunction(() => document.querySelectorAll('.lot-it').length === 1);
assert.deepEqual(await coll('sol ring'), { fr: 2, 'fr|2x2|101': 2 }, 'langue de la carte (FR), édition choisie');
assert.match(await txt(p, '#caStatus'), /Sol Ring · 4 dans ta collection/);
let r = await lotRows(); assert.deepEqual(r[0].tags.slice(0, 2), ['Double Masters 2022 #101', '× 2']); assert.equal(nb(r[0].px), '7,00 €');
assert.match(await txt(p, '.lot .dv-title span'), /^2 cartes dans ce lot · 7,00 €$/);
ok('carte choisie : édition (symbole, extension, prix), quantité, ajoutée à la collection et au lot');

/* ── 2) extension collante : proposée d'office si la carte y existe, sinon « Choisir l'édition » ─────────────── */
await choose('wrath', 'Wrath of God'); await edReady();
assert.match(await txt(p, '.lot-ed'), /Double Masters 2022/); assert.equal(await p.$eval('.lot-ed', b => b.classList.contains('auto')), true, 'proposée d\'office');
await p.click('#lotAdd'); await p.waitForFunction(() => document.querySelectorAll('.lot-it').length === 2);
assert.deepEqual(await coll('wrath of god'), { '|2x2|101': 1 });
await choose('llanowar', 'Llanowar Elves'); await edReady();
assert.match(await txt(p, '.lot-ed'), /Choisir l'édition/, 'pas d\'impression dans cette extension : édition non précisée');
await p.click('#lotAdd'); await p.waitForFunction(() => document.querySelectorAll('.lot-it').length === 3);
assert.equal(await p.evaluate(() => COLL.map['llanowar elves'].x), undefined, 'sans édition : ligne simple');
assert.match(await txt(p, '.lot-sticky'), /Double Masters 2022/, 'l\'extension collante reste (choisie à la main seulement)');
r = await lotRows(); assert.deepEqual(r.map(x => x.name), ['Llanowar Elves', 'Wrath of God', 'Sol Ring'], 'dernière ajoutée en haut'); assert.ok(r[0].tags.includes('Édition non précisée'));
await p.screenshot({ path: 'shots/lot-2-liste.png' });
ok('extension collante : proposée d\'office (Wrath of God), absente → non précisée (Llanowar Elves), reste la même');

/* ── 3) modifier une ligne du lot (langue, quantité), en retirer une, nouveau lot ─────────────────────────────── */
await p.click('.lot-it:nth-child(2) [data-act="edit"]'); await p.waitForSelector('.lot-card [data-act="cancel"]'); await edReady();
assert.equal(await txt(p, '#lotAdd'), 'Enregistrer'); assert.match(await txt(p, '.lot-ed'), /Double Masters 2022/);
await p.selectOption('.lot-lang', 'en'); await edReady(); await p.click('.lot-card [data-act="qp"]'); await p.click('.lot-card [data-act="qp"]');
await p.click('#lotAdd'); await p.waitForFunction(() => document.querySelector('.lot-card').hidden);
assert.deepEqual(await coll('wrath of god'), { 'en|2x2|101': 3 }, 'ligne déplacée : anglais, 3 exemplaires, même édition');
r = await lotRows(); assert.equal(r.length, 3); assert.ok(r[1].tags.includes('× 3'));
await p.click('.lot-it:nth-child(1) [data-act="drop"]'); await p.waitForFunction(() => document.querySelectorAll('.lot-it').length === 2);
assert.equal(await coll('llanowar elves'), null, 'retirée du lot : retirée de la collection'); assert.match(await txt(p, '#toast'), /Llanowar Elves retirée/);
await p.click('#toast .toast-act'); await p.waitForFunction(() => document.querySelectorAll('.lot-it').length === 3); assert.deepEqual(await coll('llanowar elves'), { '': 1 });
await p.click('.lot-lh [data-act="new"]'); await p.waitForFunction(() => !document.querySelector('.lot-it'));
assert.deepEqual(await coll('sol ring'), { fr: 2, 'fr|2x2|101': 2 }, 'nouveau lot : la collection ne bouge pas');
await p.click('#toast .toast-act'); await p.waitForFunction(() => document.querySelectorAll('.lot-it').length === 3);
ok('ligne du lot modifiée (langue, quantité) ou retirée (annulable) ; nouveau lot (annulable), la collection garde ses cartes');

/* ── 4) cartes du scan : rejoignent le lot avec l'extension collante ; lot gardé au rechargement ─────────────── */
await p.evaluate(() => lotFromScan([{ k: 'arcane signet', n: 'Arcane Signet', q: 2, l: 'en' }, { k: 'llanowar elves', n: 'Llanowar Elves', q: 1, l: 'fr' }]));
await p.waitForFunction(() => document.querySelectorAll('.lot-it').length === 5);
assert.deepEqual(await coll('arcane signet'), { 'en|2x2|101': 2 }); assert.deepEqual(await coll('llanowar elves'), { '': 1, fr: 1 });
await p.reload(); await p.waitForTimeout(500); await toHome(p); await p.evaluate(() => openLot()); await p.waitForSelector('.lot.on .lot-it');
assert.equal(await p.$$eval('.lot-it', r => r.length), 5, 'lot gardé sur l\'appareil');
await p.waitForFunction(() => /Double Masters 2022/.test(document.querySelector('.lot-sticky').textContent), null, { timeout: 5000 });
ok('scan → lot (extension collante appliquée) ; lot et extension gardés au rechargement');

/* ── 5) recherche dans les autres langues (names-all.tsv) : nom exact d'abord, drapeau, carte prise dans cette langue ─────────────── */
await p.selectOption('.lot-lang', '').catch(() => {}); await p.evaluate(() => { LOT.lang = ''; lotSave(); });
await p.fill('#caName', 'Fulmine'); await p.waitForSelector('.ca-opt[data-n="Lightning Bolt"]', { timeout: 8000 });
assert.deepEqual(await p.$$eval('.ca-opt', b => b.map(x => [x.dataset.n, x.dataset.l || ''])), [['Lightning Bolt', 'it'], ['Arc Lightning', 'it']], 'nom italien : le nom exact d\'abord');
assert.match(await txt(p, '.ca-opt[data-n="Lightning Bolt"]'), /Fulmine\s*Lightning Bolt/); assert.ok(await p.$('.ca-opt[data-n="Lightning Bolt"] .flag'), 'drapeau de la langue');
await p.fill('#caName', 'Elfi di Llan'); await p.waitForSelector('.ca-opt[data-n="Llanowar Elves"][data-l="it"]');
await p.click('.ca-opt[data-n="Llanowar Elves"]'); await p.waitForSelector('.lot-card:not([hidden]) #lotAdd');
assert.equal(await p.$eval('.lot-lang', s => s.value), 'it', 'carte prise en italien'); assert.match(await txt(p, '.lot-name'), /Elfi di Llanowar/);
await edReady(); await p.click('#lotAdd'); await p.waitForFunction(() => { const x = COLL.map['llanowar elves']; return x && x.x && Object.keys(x.x).some(g => g.startsWith('it')); });
await p.fill('#caName', 'sol r'); await p.waitForSelector('.ca-opt[data-n="Sol Ring"]');
assert.deepEqual(await p.$$eval('.ca-opt', b => b.map(x => x.dataset.n)), ['Sol Ring'], 'nom anglais trouvé : pas de bruit des autres langues');
ok('recherche dans les autres langues : « Fulmine » (italien) → Lightning Bolt d\'abord, drapeau ; « Elfi di Llan » → carte ajoutée en italien ; « sol r » sans bruit');

assert.deepEqual(errs, [], 'erreurs page : ' + errs.join(' | '));
await browser.close(); world.stop();
console.log('\nLOT E2E OK');
