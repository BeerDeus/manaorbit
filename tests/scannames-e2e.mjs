// E2E noms au scan (appli Android, ML Kit simulé) — trois cartes signalées le 26 octobre 2026 :
// · « Rats voraces » : nom français de deux cartes (Ravenous Rats, Muck Rats) → l'une d'elles en français, jamais « Ratas voraces » (es, Razortooth Rats) trouvée de justesse ;
// · « Sondeur de secrets » (Delver of Secrets, carte double) : dans le catalogue français (l'impression MID 47 n'y mettait que l'anglais) ;
// · « Thrum of dhe Vestigo » (nom alternatif lu de travers, reflet du foil) : Lightning Bolt en anglais, impression FCA 40 retenue comme par la ligne du bas ;
// · « ur de secrets » (lecture partielle) : jamais une autre carte sûre (Trade Secrets à 0,85) : à vérifier.
import './setup-env.mjs';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium, startWorld, newPage, ok, toHome, slug } from './e2e-world.mjs';

const FILL = (l, n = 600) => Array.from({ length: n }, (_, i) => `Vrombl ${l} ${i} Quarnax\tVrombl Card ${i}\t`).join('\n') + '\n';      // ≥ 500 lignes exigées
const W = (f, s) => writeFileSync(join(process.env.PWA_DIR, f), s);
W('fr-names.tsv', ['Rats voraces\tRavenous Rats\t', 'Rats voraces\tMuck Rats\t', 'Rat du fumier\tMuck Rats\t\ta', 'Sondeur de secrets // Aberration insectoïde\tDelver of Secrets // Insectile Aberration\t', 'Anneau solaire\tSol Ring\t'].join('\n') + '\n' + FILL('fr'));
W('names-es.tsv', 'Ratas voraces\tRazortooth Rats\t\n' + FILL('es'));
W('names-flavor.tsv', 'Thrum of the Vestige\tLightning Bolt\tfca|40\ten\n' + Array.from({ length: 200 }, (_, i) => `Zorblax ${i} Quintessence\tVrombl Card ${i}\tsld|${i + 1}\ten`).join('\n') + '\n');
const world = await startWorld({ port: 18937, bigCatalog: 35000 });
const extra = n => { world.prints[n] = [{ id: 's-' + slug(n), set: 'lea', set_name: 'Alpha', collector_number: '1', name: n, cmc: 1, type_line: 'Instant', mana_cost: '{R}', colors: ['R'], prices: { eur: '0.50' }, color_identity: ['R'], legalities: { commander: 'legal' }, image_uris: { small: `https://cards.scryfall.io/small/front/a/b/${slug(n)}.jpg` } }]; };
const NAMES = ['Ravenous Rats', 'Muck Rats', 'Razortooth Rats', 'Delver of Secrets // Insectile Aberration', 'Lightning Bolt', 'Trade Secrets'];
NAMES.forEach(extra); const baseCat = world.catalog; world.catalog = () => [...baseCat(), ...NAMES];
const browser = await chromium.launch({ executablePath: (process.env.CHROMIUM || '/opt/pw-browsers/chromium'), args: ['--no-sandbox'] });
const idle = p => p.waitForFunction(() => !SC.working && !SC.queue.length && !SC.pend.length, null, { timeout: 30000 });

const nat = await newPage(browser, world, { goto: false, ctx: { colorScheme: 'dark' } }), p = nat.p;
const jpg = readFileSync(new URL('./fixtures/fulmine.jpg', import.meta.url)).toString('base64');
await nat.ctx.addInitScript(b64 => {
  window.__nat = { text: '' };
  window.Capacitor = { isNativePlatform: () => true, isPluginAvailable: () => true, Plugins: {
    CameraPreview: { start: async () => ({}), stop: async () => ({}), captureSample: async () => ({ value: b64 }) },
    CapacitorPluginMlKitTextRecognition: { detectText: async () => { const t = window.__nat.text; return { text: t, blocks: [{ text: t, lines: [{ text: t }] }] }; } } } };
}, jpg);
await p.goto(world.url); await p.waitForTimeout(700);
await toHome(p); await p.click('#btnColl'); await p.waitForSelector('.coll.on'); await p.click('#nav [data-nav="scan"]'); await p.waitForSelector('.scan.on');
await p.waitForFunction(() => document.querySelector('.sc-stage').dataset.native === '1', null, { timeout: 5000 });
await p.evaluate(() => fvWarm()); await p.waitForFunction(() => FVX.cat && FVX.cat.n > 100, null, { timeout: 10000 });
const snap = async (text, n) => { await p.evaluate(t => { window.__nat.text = t; }, text); await p.click('.sc-shot'); await p.waitForFunction(k => SC.cap >= k && SC.items.size + SC.miss.length >= k, n, { timeout: 20000 }); await idle(p); };
const last = () => p.evaluate(() => { const x = SC.lastIt; return x && { key: x.key, l: x.l, maybe: x.maybe, alts: x.alts || null, codes: x.ft ? x.ft.codes : null, nums: x.ft ? x.ft.nums : null }; });

await snap('Rats voraces', 1);
let r = await last();
assert.ok(['ravenous rats', 'muck rats'].includes(r.key) && r.l === 'fr', 'nom français partagé : l\'une des deux cartes, en français : ' + JSON.stringify(r));
assert.deepEqual(r.alts, ['Ravenous Rats', 'Muck Rats'], 'les deux cartes possibles (illustration ou choix)');
ok('« Rats voraces » : Ravenous Rats ou Muck Rats en français (choix gardé), jamais « Ratas voraces » espagnol (Razortooth Rats) trouvé de justesse');

await snap('Sondeur de secrets', 2);
r = await last(); assert.deepEqual([r.key, r.l, r.maybe], ['delver of secrets', 'fr', false], 'carte double française : ' + JSON.stringify(r));
ok('« Sondeur de secrets » : Delver of Secrets en français, sûr');

await snap('Thrum of dhe Vestigo', 3);
r = await last(); assert.deepEqual([r.key, r.l, r.maybe, r.codes, r.nums], ['lightning bolt', 'en', false, ['FCA'], ['40']], 'nom alternatif lu de travers : ' + JSON.stringify(r));
ok('« Thrum of dhe Vestigo » (nom alternatif, foil) : Lightning Bolt anglais, sûr, impression FCA 40 retenue');

await snap('ur de secrets', 4);
const ts = await p.evaluate(() => [...SC.items.values()].find(x => x.key === 'trade secrets'));
assert.ok(!ts || ts.maybe, 'lecture partielle : jamais Trade Secrets sûre : ' + JSON.stringify(ts && { maybe: ts.maybe, score: ts.score }));
ok('« ur de secrets » (lecture partielle) : pas de carte sûre au hasard');

assert.deepEqual(nat.errs, []);

/* ── navigateur (Tesseract) : moteur de la langue du lot sans modèle (hors ligne : Tesseract.js reste pendu) → abandonné à temps, la file du scan ne se fige plus ── */
{
  const web = await newPage(browser, world, { ctx: { colorScheme: 'dark' } }), wp = web.p;
  const r = await wp.evaluate(async () => {
    OCR.wait = 400; window.ocrWorker = () => new Promise(() => {});      // modèle « spa » jamais téléchargé
    const c = document.createElement('canvas'); c.width = c.height = 20; const t0 = performance.now();
    const lines = await ocrLinesWait(c, 'spa', '6');
    SC.lot = false; const langs = (() => { const keep = window.scanLotTop; window.scanLotTop = () => 'es'; try { return ocrLangs(); } finally { window.scanLotTop = keep; } })();
    return { lines, ms: Math.round(performance.now() - t0), bad: OCR.bad.spa > Date.now(), langs, again: await ocrLinesWait(c, 'spa', '6') };
  });
  assert.equal(r.lines, null, 'lecture abandonnée'); assert.ok(r.ms < 2000, 'après OCR.wait : ' + r.ms + ' ms'); assert.equal(r.bad, true, 'moteur oublié 10 min');
  assert.ok(!r.langs.includes('spa') && r.langs.includes('eng'), 'langue du lot espagnole : moteur absent sauté, l\'anglais reste : ' + r.langs); assert.equal(r.again, null, 'pas de 2e attente');
  await web.ctx.close();
  ok('navigateur : moteur de la langue du lot sans modèle (hors ligne) abandonné après le délai, plus redemandé, le scan continue');
}
await browser.close(); world.stop();
console.log('\nSCANNAMES E2E OK'); process.exit(0);
