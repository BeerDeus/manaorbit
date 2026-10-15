// E2E scan automatique et lampe (scanauto.js), dans l'appli Android simulée (aperçu natif + ML Kit factices : l'image de l'aperçu et le texte lu sont choisis par le test).
// Bande vide : rien n'est lu ; carte posée : lue en continu, ajoutée une fois (même nom lu deux fois de suite), pas rajoutée tant qu'elle reste ; retirée puis reposée :
// « Encore X ? » (+1 / Non) ou +1 d'office (réglage) ; autre carte : ajoutée ; cercle = pause / reprise ; nom pas reconnu : rien dans la liste ; Auto coupé : le cercle
// reprend la photo. Lampe : mode « torch » du plugin, cachée sans lampe.
import './setup-env.mjs';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { chromium, startWorld, newPage, txt, ok, toHome, bandOnly } from './e2e-world.mjs';

const FX = new URL('./fixtures/', import.meta.url).pathname;
const world = await startWorld({ port: 18977 });
const browser = await chromium.launch({ executablePath: (process.env.CHROMIUM || '/opt/pw-browsers/chromium'), args: ['--no-sandbox'] });
const { ctx, p, errs } = await newPage(browser, world, { goto: false }); await bandOnly(ctx);
const imgs = { a: readFileSync(FX + 'sceau.jpg').toString('base64'), b: readFileSync(FX + 'llanowar.jpg').toString('base64'), c: readFileSync(FX + 'wrath.jpg').toString('base64') };
await ctx.addInitScript(imgs => {
  window.__nat = { caps: [], ocr: 0, flash: [], stops: 0 }; window.__imgs = imgs; window.__img = ''; window.__txt = '';
  window.Capacitor = { isNativePlatform: () => true, isPluginAvailable: () => true, Plugins: {
    CameraPreview: { start: async () => ({}), stop: async () => { window.__nat.stops++; return {}; }, captureSample: async o => { window.__nat.caps.push(o.quality); return { value: window.__alt ? window.__imgs[window.__alt[window.__nat.caps.length % window.__alt.length]] : window.__img }; },
      getSupportedFlashModes: async () => ({ result: ['off', 'on', 'auto', 'torch'] }), setFlashMode: async o => { window.__nat.flash.push(o.flashMode); return {}; } },
    CapacitorPluginMlKitTextRecognition: { detectText: async () => { window.__nat.ocr++; const t = window.__txt; return { text: t, blocks: t ? [{ text: t, lines: [{ text: t }] }] : [] }; } } } };
}, imgs);
await p.goto(world.url); await p.waitForTimeout(600); await toHome(p);
// image unie (bande vide : pas de contraste)
await p.evaluate(() => { const c = document.createElement('canvas'); c.width = 600; c.height = 840; const x = c.getContext('2d'); x.fillStyle = '#3a3d44'; x.fillRect(0, 0, 600, 840); window.__imgs.blank = c.toDataURL('image/jpeg', 0.9).split(',')[1]; window.__img = window.__imgs.blank; });
const show = (k, t = '') => p.evaluate(([k, t]) => { window.__img = window.__imgs[k]; window.__txt = t; }, [k, t]);
const qty = () => p.evaluate(() => Object.fromEntries([...SC.items.values()].map(x => [x.key, x.q])));
const ocrN = () => p.evaluate(() => window.__nat.ocr);

await p.evaluate(() => openScan()); await p.waitForSelector('.scan.on');
await p.waitForFunction(() => document.querySelector('.sc-stage').dataset.native === '1' && !document.querySelector('.sc-auto').hidden, null, { timeout: 6000 });
assert.equal(await p.getAttribute('.sc-auto', 'aria-checked'), 'false', 'Auto coupé par défaut');
assert.equal(await p.$eval('.scan', s => s.classList.contains('auto')), false);

/* ── 1) lampe ───────────────────────────────────────────────────────────────────────────────────── */
await p.waitForFunction(() => !document.querySelector('.sc-lamp').hidden, null, { timeout: 3000 });
await p.click('.sc-lamp'); await p.waitForFunction(() => document.querySelector('.sc-lamp').getAttribute('aria-pressed') === 'true');
await p.click('.sc-lamp'); await p.waitForFunction(() => document.querySelector('.sc-lamp').getAttribute('aria-pressed') === 'false');
assert.deepEqual(await p.evaluate(() => window.__nat.flash), ['torch', 'off'], 'lampe : mode torche du plugin, puis éteinte');
ok('lampe : visible si l\'appareil a une torche, allumée / éteinte');

/* ── 2) Auto : bande vide, carte lue une fois, retirée puis reposée ─────────────────────────────── */
await p.click('.sc-auto');
assert.equal(await p.evaluate(() => SCS.auto), true, 'interrupteur = réglage « Scan automatique »');
assert.equal(await p.getAttribute('.sc-auto', 'aria-checked'), 'true'); assert.equal(await p.$eval('.scan', s => s.classList.contains('auto')), true);
assert.equal(await p.getAttribute('.sc-shot', 'aria-label'), 'Mettre le scan automatique en pause', 'le cercle devient pause');
assert.match(await txt(p, '.sc-cap'), /Auto · lecture en continu/i);
await p.waitForTimeout(1600);
assert.equal(await ocrN(), 0, 'bande vide : rien n\'est lu'); assert.ok((await p.evaluate(() => window.__nat.caps.length)) >= 2, 'aperçu regardé en continu');
await show('a', 'Sol Ring');
await p.waitForFunction(() => [...SC.items.values()].some(x => x.key === 'sol ring'), null, { timeout: 6000 });
await p.waitForTimeout(1800);
assert.deepEqual(await qty(), { 'sol ring': 1 }, 'carte tenue : relue en continu, ajoutée une seule fois'); assert.ok((await ocrN()) >= 4, 'lue en continu (confirmation, puis carte tenue)');
assert.ok(await p.evaluate(() => window.__nat.caps.every(q => q === 85)), 'la bande est prise en bonne qualité');
// retirée puis reposée : « Encore Sol Ring ? »
await show('blank'); await p.waitForTimeout(900); await show('a', 'Sol Ring');
await p.waitForSelector('.sc-same', { timeout: 6000 });
assert.match(await txt(p, '.sc-same'), /Encore Sol Ring \?.*Même carte qu'à l'instant/);
assert.deepEqual(await qty(), { 'sol ring': 1 }, 'rien d\'ajouté avant la réponse');
await p.click('.sc-same [data-act="au1"]'); await p.waitForSelector('.sc-same', { state: 'detached' });
assert.deepEqual(await qty(), { 'sol ring': 2 }, '+1');
await show('blank'); await p.waitForTimeout(900); await show('a', 'Sol Ring');
await p.waitForSelector('.sc-same', { timeout: 6000 }); await p.click('.sc-same [data-act="au0"]'); await p.waitForSelector('.sc-same', { state: 'detached' });
assert.deepEqual(await qty(), { 'sol ring': 2 }, 'Non : rien d\'ajouté');
ok('auto : bande vide ignorée, carte immobile lue une fois, retirée puis reposée → « Encore X ? » (+1 / Non)');

// réglage « Ajouter +1 » : la même carte reposée s'ajoute d'office ; autre carte : ajoutée sans rien demander
await p.evaluate(() => scsSet({ same: 'add' }));
await show('blank'); await p.waitForTimeout(900); await show('a', 'Sol Ring');
await p.waitForFunction(() => [...SC.items.values()].find(x => x.key === 'sol ring').q === 3, null, { timeout: 6000 }); assert.equal(await p.$('.sc-same'), null);
await show('b', 'Llanowar Elves');
await p.waitForFunction(() => [...SC.items.values()].some(x => x.key === 'llanowar elves'), null, { timeout: 6000 });
assert.deepEqual(await qty(), { 'sol ring': 3, 'llanowar elves': 1 }, 'carte remplacée sans bande vide entre les deux : lue aussi');
await p.evaluate(() => scsSet({ same: 'ask' }));
ok('auto : « Ajouter +1 » d\'office, carte remplacée lue');
// carte tenue à la main : aucune image n'est identique à la précédente (tremblement, bruit du capteur, JPEG) — c'est le nom lu deux fois qui compte
await p.evaluate(async () => {
  const im = new Image(); im.src = 'data:image/jpeg;base64,' + window.__imgs.c; await im.decode();
  const v = (dx, seed) => { const c = document.createElement('canvas'); c.width = im.width; c.height = im.height; const x = c.getContext('2d'); x.drawImage(im, dx, dx * 0.6); const d = x.getImageData(0, 0, c.width, c.height); let r = seed; for (let i = 0; i < d.data.length; i += 4) { r = (r * 1103515245 + 12345) & 0x7fffffff; const n = (r % 31) - 15; d.data[i] += n; d.data[i + 1] += n; d.data[i + 2] += n; } x.putImageData(d, 0, 0); return c.toDataURL('image/jpeg', 0.7).split(',')[1]; };
  window.__imgs.c1 = v(0, 7); window.__imgs.c2 = v(3, 11); window.__imgs.c3 = v(-2, 23);
});
await show('blank'); await p.waitForTimeout(900);
await p.evaluate(() => { window.__alt = ['c1', 'c2', 'c3']; window.__txt = 'Wrath of God'; });
await p.waitForFunction(() => [...SC.items.values()].some(x => x.key === 'wrath of god'), null, { timeout: 6000 }); await p.waitForTimeout(1500);
assert.equal(await p.evaluate(() => [...SC.items.values()].find(x => x.key === 'wrath of god').q), 1, 'carte tenue à la main : ajoutée une fois');
await p.evaluate(() => { window.__alt = null; }); await show('blank'); await p.waitForTimeout(900);
ok('carte tenue à la main (images toutes différentes) : ajoutée, une seule fois');

/* ── 3) pause, nom pas reconnu, Auto coupé ──────────────────────────────────────────────────────── */
await p.click('.sc-shot'); assert.equal(await p.$eval('.scan', s => s.classList.contains('paused')), true);
assert.equal(await p.getAttribute('.sc-shot', 'aria-label'), 'Reprendre le scan automatique'); assert.match(await txt(p, '.sc-cap'), /Auto en pause/i);
const n0 = await ocrN(); await show('blank'); await p.waitForTimeout(700); await show('a', 'Sol Ring'); await p.waitForTimeout(1800);
assert.equal(await ocrN(), n0, 'en pause : rien n\'est lu');
await p.click('.sc-shot'); assert.equal(await p.$eval('.scan', s => s.classList.contains('paused')), false, 'reprise');
await p.waitForFunction(() => [...SC.items.values()].find(x => x.key === 'sol ring').q === 4, null, { timeout: 6000 });
assert.equal(await p.$('.sc-same'), null, 'Sol Ring après Llanowar Elves : pas « la même carte »');
const q0 = await qty(), r0 = await ocrN(); await show('c', 'zzqx vvkp'); await p.waitForFunction(n => window.__nat.ocr > n + 3, r0, { timeout: 6000 });
assert.deepEqual(await qty(), q0, 'nom pas reconnu : rien d\'ajouté'); assert.equal(await p.evaluate(() => SC.miss.length), 0, 'auto : pas de ligne « non reconnue »');
await p.click('.sc-auto'); assert.equal(await p.evaluate(() => SCS.auto), false);
assert.equal(await p.$eval('.scan', s => s.classList.contains('auto')), false); assert.equal(await p.getAttribute('.sc-shot', 'aria-label'), 'Prendre la photo de la carte');
const n1 = await ocrN(); await show('b', 'Llanowar Elves'); await p.waitForTimeout(1500); assert.equal(await ocrN(), n1, 'Auto coupé : plus de lecture en continu');
await p.click('.sc-shot'); await p.waitForFunction(() => [...SC.items.values()].find(x => x.key === 'llanowar elves').q === 2, null, { timeout: 6000 });
ok('cercle = pause / reprise ; nom pas reconnu : message seul ; Auto coupé : le cercle reprend la photo');

/* ── 4) réglage gardé ; fermeture : plus rien ne tourne ─────────────────────────────────────────── */
await p.click('.sc-auto'); await p.click('.scan [data-act="close"]'); await p.waitForFunction(() => !document.querySelector('.scan'), null, { timeout: 3000 });
const c0 = await p.evaluate(() => window.__nat.caps.length); await p.waitForTimeout(1200);
assert.equal(await p.evaluate(() => window.__nat.caps.length), c0, 'scan fermé : l\'aperçu n\'est plus regardé');
await p.evaluate(() => openScan()); await p.waitForFunction(() => document.querySelector('.scan.on.auto'), null, { timeout: 6000 });
assert.equal(await p.getAttribute('.sc-lamp', 'aria-pressed'), 'false', 'lampe éteinte à chaque scan');
await p.click('.scan [data-act="close"]');
assert.deepEqual(errs, [], 'erreurs page');
ok('Auto gardé d\'un scan à l\'autre ; fermé : la boucle s\'arrête');

/* ── 5) navigateur sans caméra : ni Auto ni lampe ───────────────────────────────────────────────── */
const w = await newPage(browser, world, { goto: false }); await bandOnly(w.ctx); await w.p.goto(world.url); await w.p.waitForTimeout(700); await w.p.evaluate(() => { BACKOFF.scry = [60, 60, 60]; BACKOFF.cool429 = 100; }); await toHome(w.p);
await w.p.evaluate(() => { scsSet({ auto: true }); openScan(); }); await w.p.waitForFunction(() => document.querySelector('.sc-stage').dataset.cam === 'no', null, { timeout: 5000 });
assert.equal(await w.p.$eval('.sc-auto', b => b.hidden), true, 'sans caméra : pas d\'interrupteur Auto'); assert.equal(await w.p.$eval('.sc-lamp', b => b.hidden), true, 'ni de lampe');
assert.equal(await w.p.$eval('.scan', s => s.classList.contains('auto')), false); assert.equal(await w.p.getAttribute('.sc-shot', 'aria-label'), 'Prendre la photo de la carte');
assert.deepEqual(w.errs, []);
ok('sans caméra : ni Auto ni lampe, le cercle reste la photo');

/* ── 6) caméra du navigateur (simulée) : Auto proposé, la bande est regardée dans la vidéo ; pas de lampe sur cette caméra ─────────────────── */
const cam = await chromium.launch({ executablePath: (process.env.CHROMIUM || '/opt/pw-browsers/chromium'), args: ['--no-sandbox', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
const c = await newPage(cam, world, { goto: false, perms: ['camera'] }); await bandOnly(c.ctx); await c.ctx.addInitScript(() => { window.__noFpsWatch = true; }); await c.p.goto(world.url); await c.p.waitForTimeout(700); await c.p.evaluate(() => { BACKOFF.scry = [60, 60, 60]; BACKOFF.cool429 = 100; }); await c.p.waitForTimeout(500); await toHome(c.p);
await c.p.evaluate(() => { readNameAuto = async () => null; scsSet({ auto: true }); openScan(); });      // pas de moteur OCR ici (CDN) : la lecture ne trouve rien
await c.p.waitForFunction(() => document.querySelector('.sc-stage').dataset.cam === 'on' && document.querySelector('.sc-video').videoWidth > 0, null, { timeout: 8000 });
await c.p.waitForFunction(() => document.querySelector('.scan.auto') && !document.querySelector('.sc-auto').hidden, null, { timeout: 5000 });
const g = await c.p.evaluate(async () => { const f = await auGrab(); return f && [f.src.width > 50, f.src.height > 10, f.dev >= 0]; });
assert.deepEqual(g, [true, true, true], 'bande prise dans la vidéo');
await c.p.waitForTimeout(1200); assert.equal(await c.p.$eval('.sc-lamp', b => b.hidden), true, 'caméra sans torche : pas de lampe');
await c.p.click('.scan [data-act="close"]'); assert.deepEqual(c.errs, []); await cam.close();
ok('caméra du navigateur : Auto proposé, bande regardée dans la vidéo, pas de lampe sans torche');

await browser.close(); world.stop();
console.log('\nSCANAUTO E2E OK');
