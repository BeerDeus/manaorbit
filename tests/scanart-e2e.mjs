// E2E : édition reconnue à l'illustration (scanart.js, scaned.js › scanArtRun). Photos « prises au téléphone » (lumière chaude ou froide, flou, bruit, carte un peu
// décalée dans le cadre) comparées aux petites images Scryfall des éditions de la carte (servies ici depuis fixtures/art, tools/make-art-fixtures.py) :
// illustration unique → édition posée (« reconnue à l'illustration ») ; même illustration dans deux éditions (lea, 2x2) → à choisir entre elles, ou l'extension du scan.
import './setup-env.mjs';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { chromium, startWorld, newPage, ok, toHome } from './e2e-world.mjs';

const FX = new URL('./fixtures/art/', import.meta.url).pathname;
const world = await startWorld({ port: 18921 });
Object.assign(world.psets, { 'Swords to Plowshares': ['cmm', 'lea', '2x2', 'm21', 'sta'] });      // n° 200 à 204, dans toutes les langues
const browser = await chromium.launch({ executablePath: (process.env.CHROMIUM || '/opt/pw-browsers/chromium'), args: ['--no-sandbox'] });
const { p, errs } = await newPage(browser, world, { goto: false });
const served = [];
await p.route('https://cards.scryfall.io/small/front/**', route => {
  const m = /-([a-z0-9]+)\.jpg$/.exec(new URL(route.request().url()).pathname), f = m && FX + 'print-' + m[1] + '.jpg';
  if (!f || !existsSync(f)) return route.fulfill({ status: 404, body: 'nf' });
  served.push(m[1]);
  return route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*' }, contentType: 'image/jpeg', body: readFileSync(f) });
});
await p.goto(world.url); await p.waitForTimeout(700); await toHome(p);
const lines = () => p.evaluate(() => Object.fromEntries([...SC.items.values()].map(x => [x.key + ' ' + x.l + (x.e ? ' ' + x.e : ''), x.es + ' ×' + x.q])));
const settle = () => p.waitForFunction(() => SC.items.size && ![...SC.items.values()].some(x => x.es === 'load' || x.artq) && !SART.busy, null, { timeout: 20000 });
/** La capture du cadre « carte entière » : la photo, son empreinte, la carte reconnue par son nom. */
const shoot = (file, name, l) => p.evaluate(async ([b64, name, l]) => {
  const i = new Image(); i.src = 'data:image/jpeg;base64,' + b64; await i.decode();
  scanAdd({ key: ownKey(name), name, score: 0.99, raw: name, card: l, sig: artSig(i) }, 1, false);
}, [readFileSync(FX + file).toString('base64'), name, l]);

await p.evaluate(() => scsSet({ frame: 'card' })); await p.evaluate(() => openScan()); await p.waitForSelector('.scan.on.full');
await shoot('photo-m21.jpg', 'Swords to Plowshares', 'en'); await settle();
let L = await lines(); console.log('  ', JSON.stringify(L), await p.evaluate(() => SC.art && SC.art.res));
assert.deepEqual(L, { 'swords to plowshares en m21|203': 'art ×1' }, 'illustration unique : M21, reconnue à l\'illustration, rien à choisir');
assert.match(await p.getAttribute('.scan.on .sc-item .sc-ed', 'aria-label'), /reconnue à l'illustration/);
assert.equal(await p.$('.sc-ask'), null, 'première carte : rien demandé');
assert.ok(['cmm', 'lea', '2x2', 'm21', 'sta'].every(s => served.includes(s)), 'les petites images des 5 éditions ont été comparées');
ok('photo (lumière chaude, flou, carte décalée) : l\'illustration donne l\'édition exacte');

// même illustration dans deux éditions (lea, 2x2), aucune dans le scan : à choisir entre elles seulement (M21, extension du scan, n'a pas cette illustration)
await shoot('photo-lea.jpg', 'Swords to Plowshares', 'fr'); await settle();
L = await lines(); console.log('  ', JSON.stringify(L), await p.evaluate(() => SC.art && SC.art.res));
assert.equal(L['swords to plowshares fr'], 'pend ×1', 'réédition : à choisir (pas M21, contredite par l\'illustration)');
await p.click('.scan.on .sc-item[data-k="swords to plowshares"] .sc-ed.todo'); await p.waitForSelector('.ced-sheet .ced-t[data-i]');
await p.locator('.ced-sheet .ced-t', { hasText: '2X2' }).first().click(); await p.waitForFunction(() => !document.querySelector('.sheet-wrap'));
// la même photo ensuite : 2x2 est une extension du scan → posée d'office
await shoot('photo-lea.jpg', 'Swords to Plowshares', 'fr'); await settle();
L = await lines(); assert.equal(L['swords to plowshares fr 2x2|202'], 'man ×2', 'même illustration, 2x2 dans le scan : rangée avec la ligne choisie ' + JSON.stringify(L));
ok('même illustration dans deux éditions : à choisir entre elles, puis l\'extension du scan départage');

// beaucoup d'éditions (terrain de base) : la bonne, ancienne, au-delà des 60 plus récentes, est quand même comparée (Wi-Fi) ; numéro lu (« 265/280 ») : ses éditions d'abord
world.psets['Wrath of God'] = [...Array.from({ length: 64 }, (_, i) => 'x' + String(i).padStart(2, '0')), 'cmm', 'm21'];      // n° 200 à 265 ; images : cmm, m21 seulement (les autres absentes)
await shoot('photo-m21.jpg', 'Wrath of God', 'en'); await settle();
L = await lines(); console.log('  ', await p.evaluate(() => SC.art && SC.art.res));
assert.equal(L['wrath of god en m21|265'], 'art ×1', '66 éditions : la 66e trouvée ' + JSON.stringify(L));
await p.evaluate(async b64 => {
  const i = new Image(); i.src = 'data:image/jpeg;base64,' + b64; await i.decode();
  scanAdd({ key: 'wrath of god', name: 'Wrath of God', score: 0.99, raw: '', card: 'en', sig: artSig(i), ft: footParse(['265/280 C', 'Illus. Rob Alexander']) }, 1, false);
}, readFileSync(FX + 'photo-m21.jpg').toString('base64'));
await settle(); L = await lines();
assert.equal(L['wrath of god en m21|265'], 'read ×1', 'numéro unique parmi ses éditions : lu sur la carte (sans illustration) ' + JSON.stringify(L));
ok('terrain de base (66 éditions) : l\'ancienne trouvée à l\'illustration ; numéro de 2003-2014 lu : édition posée');
await p.click('.scan [data-act="close"]');

assert.deepEqual(errs, [], 'erreurs page');
await browser.close(); world.stop();
console.log('\nSCANART E2E OK');
